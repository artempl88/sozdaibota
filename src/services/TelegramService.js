const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

// Глобальная переменная для синглтона
let instance = null;

class TelegramService {
    constructor() {
        // Проверяем, не создан ли уже экземпляр
        if (instance) {
            logger.info('♻️ Возвращаем существующий экземпляр TelegramService');
            return instance;
        }
        
        this.bot = null;
        this.adminChatId = config.telegram.adminChatId || process.env.ADMIN_CHAT_ID;
        this.isInitialized = false;
        this.recentlySentEstimates = new Map();
        this.hadConflictError = false;
        
        console.log('🔍 TELEGRAM CONFIG:', {
            token: config.telegram.token ? 'Есть' : 'Нет',
            tokenLength: config.telegram.token?.length,
            adminChatId: this.adminChatId,
            configKeys: Object.keys(config.telegram)
        });
        
        if (config.telegram.token && this.adminChatId) {
            this.initializeBot();
        } else {
            logger.warn('❌ Telegram bot token или adminChatId не настроены');
        }
        
        // Сохраняем единственный экземпляр
        instance = this;
    }

    async initializeBot() {
        try {
            // Останавливаем предыдущий экземпляр если есть
            if (this.bot) {
                logger.info('🛑 Останавливаем существующий бот...');
                await this.bot.stopPolling();
                this.bot = null;
            }
            
            this.bot = new TelegramBot(config.telegram.token, { 
                polling: {
                    interval: 300,
                    autoStart: true,
                    params: {
                        timeout: 10,
                        allowed_updates: ['message', 'callback_query']
                    }
                }
            });
            
            // Обработка ошибок polling
            this.bot.on('polling_error', (error) => {
                if (error.message.includes('409 Conflict')) {
                    if (!this.hadConflictError) {
                        logger.error('⚠️ Конфликт polling - возможно запущен другой экземпляр');
                        this.hadConflictError = true;
                    }
                } else {
                    logger.error('Telegram polling error:', error.message);
                }
            });
            
            this.setupHandlers();
            this.isInitialized = true;
            logger.info('✅ Telegram Bot инициализирован');
            
            // Отправляем тестовое сообщение
            this.sendNotification('🤖 Бот запущен и готов к работе!');
            
        } catch (error) {
            logger.error('❌ Ошибка инициализации Telegram бота:', error);
            this.isInitialized = false;
        }
    }

    setupHandlers() {
        if (!this.bot) return;

        // Очищаем старые обработчики
        this.bot.removeAllListeners();

        this.bot.on('callback_query', async (query) => {
            try {
                const [action, estimateId] = query.data.split(':');
                
                if (action === 'approve') {
                    await this.approveEstimate(query, estimateId);
                } else if (action === 'reject') {
                    await this.rejectEstimate(query, estimateId);
                } else if (action === 'edit') {
                    await this.requestEditEstimate(query, estimateId);
                }
            } catch (error) {
                logger.error('Ошибка обработки callback:', error);
                this.bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка' });
            }
        });

        this.bot.onText(/\/edit (\w+) (\d+) (\d+) (.+)/, async (msg, match) => {
            await this.editEstimate(msg, match);
        });

        this.bot.onText(/\/stats/, async (msg) => {
            await this.sendStats(msg);
        });

        this.bot.onText(/\/debug/, async (msg) => {
            await this.sendDebugInfo(msg);
        });

        this.bot.onText(/\/help/, async (msg) => {
            await this.sendHelp(msg);
        });

        this.bot.onText(/\/status/, async (msg) => {
            const status = `🤖 **Статус бота**
            
Инициализирован: ${this.isInitialized ? '✅' : '❌'}
Admin Chat ID: ${this.adminChatId || 'Не установлен'}
Время работы: ${Math.floor(process.uptime() / 60)} минут
PID: ${process.pid}`;
            
            await this.bot.sendMessage(msg.chat.id, status, { parse_mode: 'Markdown' });
        });

        logger.info('Telegram обработчики настроены');
    }

    async approveEstimate(query, estimateId) {
        try {
            const models = require('../models');
            
            if (models.Estimate) {
                const approvedEstimate = await models.Estimate.findByIdAndUpdate(
                    estimateId, 
                    { status: 'approved', approvedAt: new Date() },
                    { new: true }
                );
                
                this.bot.answerCallbackQuery(query.id, { text: '✅ Смета утверждена!' });
                
                this.bot.editMessageText(
                    query.message.text + '\n\n✅ **СМЕТА УТВЕРЖДЕНА**',
                    {
                        chat_id: query.message.chat.id,
                        message_id: query.message.message_id,
                        parse_mode: 'Markdown'
                    }
                );

                if (approvedEstimate && approvedEstimate.sessionId) {
                    try {
                        logger.info('Смета утверждена, отправляем клиенту', { 
                            estimateId, 
                            sessionId: approvedEstimate.sessionId 
                        });
                        
                        // Отправляем смету обратно клиенту
                        const { PreChatForm } = require('../models');
                        const session = await PreChatForm.findOne({ sessionId: approvedEstimate.sessionId });
                        
                        if (session) {
                            // Форматируем смету для клиента
                            const estimateMessage = this.formatEstimateForClient(approvedEstimate);
                            
                            // Добавляем смету в историю чата как специальное сообщение
                            session.chatHistory.push({
                                role: 'assistant',
                                content: estimateMessage,
                                timestamp: new Date(),
                                metadata: {
                                    messageType: 'approved_estimate',
                                    estimateId: approvedEstimate._id.toString(),
                                    approved: true,
                                    approvedAt: new Date()
                                }
                            });
                            
                            // Обновляем статус сессии
                            session.estimateApproved = true;
                            session.estimateApprovedAt = new Date();
                            session.approvedEstimateId = approvedEstimate._id;
                            
                            await session.save();
                            
                            logger.info('✅ Смета добавлена в историю чата клиента', { 
                                sessionId: approvedEstimate.sessionId 
                            });
                            
                            this.bot.sendMessage(
                                query.message.chat.id,
                                `🚀 **СМЕТА ОТПРАВЛЕНА КЛИЕНТУ**\n\nID: ${estimateId}\nСессия: ${approvedEstimate.sessionId}`,
                                { parse_mode: 'Markdown' }
                            );
                        } else {
                            logger.error('Сессия клиента не найдена', { sessionId: approvedEstimate.sessionId });
                            this.bot.sendMessage(
                                query.message.chat.id,
                                '⚠️ Смета утверждена, но сессия клиента не найдена'
                            );
                        }
                    } catch (sendError) {
                        logger.error('Ошибка отправки сметы клиенту:', sendError);
                        this.bot.sendMessage(
                            query.message.chat.id,
                            '⚠️ Смета утверждена, но не удалось отправить клиенту автоматически'
                        );
                    }
                }
            }
        } catch (error) {
            logger.error('Ошибка утверждения сметы:', error);
        }
    }

    async rejectEstimate(query, estimateId) {
        try {
            const models = require('../models');
            
            if (models.Estimate) {
                await models.Estimate.findByIdAndUpdate(estimateId, { status: 'rejected' });
            }
            
            this.bot.answerCallbackQuery(query.id, { text: '❌ Смета отклонена' });
            
            this.bot.editMessageText(
                query.message.text + '\n\n❌ **СМЕТА ОТКЛОНЕНА**',
                {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown'
                }
            );
            
            logger.info('Смета отклонена', { estimateId });
        } catch (error) {
            logger.error('Ошибка отклонения сметы:', error);
        }
    }

    async requestEditEstimate(query, estimateId) {
        this.bot.answerCallbackQuery(query.id, { text: '✏️ Отправьте новые данные сметы' });
        
        this.bot.sendMessage(
            query.message.chat.id,
            `✏️ **РЕДАКТИРОВАНИЕ СМЕТЫ**\n\n` +
            `ID сметы: ${estimateId}\n\n` +
            `Отправьте изменения в формате:\n` +
            `\`/edit ${estimateId} [новая_стоимость] [новое_время_часов] [комментарий]\`\n\n` +
            `Пример:\n` +
            `\`/edit ${estimateId} 75000 60 Добавлена интеграция с CRM\``,
            { parse_mode: 'Markdown' }
        );
    }

    async editEstimate(msg, match) {
        try {
            const chatId = msg.chat.id;
            const [, estimateId, newCost, newHours, comment] = match;
            const models = require('../models');
            
            if (!models.Estimate) {
                this.bot.sendMessage(chatId, '❌ База данных недоступна');
                return;
            }
            
            const updatedEstimate = await models.Estimate.findByIdAndUpdate(
                estimateId,
                {
                    totalCost: parseInt(newCost),
                    totalHours: parseInt(newHours),
                    status: 'approved',
                    editComment: comment,
                    editedAt: new Date()
                },
                { new: true }
            );
            
            if (updatedEstimate) {
                const safeNewCost = Number(newCost) || 0;
                
                this.bot.sendMessage(
                    chatId,
                    `✅ **СМЕТА ОТРЕДАКТИРОВАНА И УТВЕРЖДЕНА**\n\n` +
                    `🆔 ID: ${estimateId}\n` +
                    `💰 Новая стоимость: ${safeNewCost.toLocaleString('ru-RU')} ₽\n` +
                    `⏱️ Новое время: ${newHours} часов\n` +
                    `📝 Комментарий: ${comment}\n\n` +
                    `🚀 Смета готова к отправке!`,
                    { parse_mode: 'Markdown' }
                );
                
                logger.info('Смета отредактирована', { estimateId, newCost, newHours });
            } else {
                this.bot.sendMessage(chatId, '❌ Смета не найдена');
            }
            
        } catch (error) {
            logger.error('Ошибка редактирования сметы:', error);
            this.bot.sendMessage(msg.chat.id, '❌ Ошибка при редактировании сметы');
        }
    }

    async sendStats(msg) {
        try {
            const chatId = msg.chat.id;
            const models = require('../models');
            
            if (!models.Estimate) {
                this.bot.sendMessage(chatId, '❌ База данных недоступна');
                return;
            }
            
            const total = await models.Estimate.countDocuments();
            const approved = await models.Estimate.countDocuments({ status: 'approved' });
            const pending = await models.Estimate.countDocuments({ status: 'pending' });
            const rejected = await models.Estimate.countDocuments({ status: 'rejected' });
            
            const statsMessage = 
                `📊 **СТАТИСТИКА СМЕТ**\n\n` +
                `📋 Всего: ${total}\n` +
                `✅ Утверждено: ${approved}\n` +
                `⏳ В ожидании: ${pending}\n` +
                `❌ Отклонено: ${rejected}\n\n` +
                `💯 Конверсия: ${total > 0 ? (approved / total * 100).toFixed(1) : 0}%`;
            
            this.bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
            
        } catch (error) {
            logger.error('Ошибка получения статистики:', error);
            this.bot.sendMessage(msg.chat.id, '❌ Ошибка при получении статистики');
        }
    }

    async sendDebugInfo(msg) {
        try {
            const chatId = msg.chat.id;
            
            const mongoStatus = '❓ Статус неизвестен';
            
            let openaiStatus = '❓ Проверяем...';
            try {
                const axios = require('axios');
                await axios.get('https://api.openai.com/v1/models', { 
                    timeout: 5000,
                    headers: { 'Authorization': `Bearer ${config.openai.apiKey}` }
                });
                openaiStatus = '✅ Доступен';
            } catch {
                openaiStatus = '❌ Недоступен';
            }
            
            const debugMessage = 
                `🔍 **ОТЛАДОЧНАЯ ИНФОРМАЦИЯ**\n\n` +
                `**Сервисы:**\n` +
                `MongoDB: ${mongoStatus}\n` +
                `OpenAI: ${openaiStatus}\n` +
                `Telegram Bot: ✅ Активен\n\n` +
                `**Сервер:**\n` +
                `Время работы: ${Math.floor(process.uptime() / 60)} мин\n` +
                `Память: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB\n` +
                `Node.js: ${process.version}`;
            
            this.bot.sendMessage(chatId, debugMessage, { parse_mode: 'Markdown' });
            
        } catch (error) {
            logger.error('Ошибка получения отладочной информации:', error);
            this.bot.sendMessage(msg.chat.id, '❌ Ошибка при получении отладочной информации');
        }
    }

    async sendHelp(msg) {
        const helpMessage = `📚 **КОМАНДЫ TELEGRAM БОТА**

📊 /stats - Статистика смет
🔍 /debug - Отладочная информация  
❓ /help - Эта справка
🤖 /status - Статус бота

✏️ **Редактирование смет:**
/edit [ID] [стоимость] [часы] [комментарий]

Пример:
/edit 507f1f77bcf86cd799439011 75000 60 Добавлена CRM

🔘 **Кнопки в сообщениях:**
✅ Утвердить - утверждает смету
❌ Отклонить - отклоняет смету
✏️ Редактировать - запрашивает правки`;

        this.bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
    }

    async sendEstimateToManager(estimate, sessionId) {
        return this.sendEstimateToTelegram(estimate, sessionId);
    }

    async sendEstimateToTelegram(estimate, sessionId) {
        if (!this.bot || !this.adminChatId) {
            logger.warn('Telegram бот или admin chat ID не настроены');
            return false;
        }

        try {
            // Защита от дублирования
            if (this.recentlySentEstimates.has(sessionId)) {
                const lastSentTime = this.recentlySentEstimates.get(sessionId);
                if (Date.now() - lastSentTime < 5000) {
                    logger.warn('Смета уже была отправлена недавно, пропускаем дубль', { sessionId });
                    return false;
                }
            }
            
            this.recentlySentEstimates.set(sessionId, Date.now());
            
            setTimeout(() => {
                this.recentlySentEstimates.delete(sessionId);
            }, 60000);

            // Подготавливаем данные для сохранения
            const models = require('../models');
            let saved = estimate;
            let estimateId = 'temp_' + Date.now();
            
            // Пытаемся сохранить в БД если модель доступна
            if (models.Estimate) {
                try {
                    // Исправляем структуру компонентов перед сохранением
                    const estimateData = {
                        sessionId,
                        projectName: estimate.projectName || 'Telegram бот',
                        totalCost: estimate.totalCost || 0,
                        totalHours: estimate.totalHours || 0,
                        hourlyRate: estimate.hourlyRate || 2000,
                        complexity: estimate.complexity || 'средний',
                        timeline: estimate.timeline || `${Math.ceil((estimate.totalHours || 40) / 40)} недель`,
                        detectedFeatures: estimate.detectedFeatures || [],
                        status: 'pending',
                        components: []
                    };
                    
                    // Обрабатываем компоненты
                    if (estimate.components && Array.isArray(estimate.components)) {
                        estimateData.components = estimate.components.map(comp => ({
                            name: comp.name || 'Компонент',
                            hours: comp.hours || 0,
                            cost: comp.cost || (comp.hours || 0) * (estimate.hourlyRate || 2000),
                            description: comp.description || ''
                        }));
                    } else if (estimate.costBreakdown && Array.isArray(estimate.costBreakdown)) {
                        // Если есть costBreakdown, используем его
                        estimateData.components = estimate.costBreakdown.map(comp => ({
                            name: comp.name || 'Компонент',
                            hours: comp.hours || 0,
                            cost: comp.cost || (comp.hours || 0) * (estimate.hourlyRate || 2000),
                            description: comp.description || ''
                        }));
                    } else {
                        // Создаем минимальный компонент
                        estimateData.components = [{
                            name: 'Разработка бота',
                            hours: estimate.totalHours || 40,
                            cost: estimate.totalCost || 80000,
                            description: 'Полная разработка функционала'
                        }];
                    }
                    
                    // Добавляем дополнительные поля если есть
                    if (estimate.risks) estimateData.risks = estimate.risks;
                    if (estimate.recommendations) estimateData.recommendations = estimate.recommendations;
                    
                    logger.info('Сохраняем смету в БД', { 
                        componentsCount: estimateData.components.length,
                        totalCost: estimateData.totalCost 
                    });
                    
                    saved = await models.Estimate.create(estimateData);
                    estimateId = saved._id;
                    
                    logger.info('✅ Смета сохранена в БД', { estimateId });
                    
                } catch (dbError) {
                    logger.error('⚠️ Ошибка сохранения в БД, продолжаем без сохранения:', dbError.message);
                    // Продолжаем работу без сохранения в БД
                    estimateId = 'temp_' + Date.now();
                }
            }
            
            // Форматируем сообщение для Telegram
            const detectedFeatures = estimate.detectedFeatures || [];
            const safeTotalCost = Number(estimate.totalCost) || 0;
            const safeTotalHours = Number(estimate.totalHours) || 0;
            
            const message = 
                `📊 **НОВАЯ СМЕТА**\n\n` +
                `🆔 ID: ${estimateId}\n` +
                `📝 Проект: ${estimate.projectName || 'Telegram бот'}\n` +
                `💰 **ИТОГО: ${safeTotalCost.toLocaleString('ru-RU')} ₽**\n` +
                `⏱️ Время: ${safeTotalHours} часов\n` +
                `📅 Срок: ${estimate.timeline || `${Math.ceil(safeTotalHours / 40)} недель`}\n\n` +
                (detectedFeatures.length > 0 ? 
                    `📋 **Найденные функции:**\n${detectedFeatures.map(f => `• ${f}`).join('\n')}\n\n` : 
                    ''
                ) +
                `🕐 Дата: ${new Date().toLocaleString('ru-RU')}`;

            const keyboard = {
                inline_keyboard: [[
                    { text: '✅ Утвердить', callback_data: `approve:${estimateId}` },
                    { text: '❌ Отклонить', callback_data: `reject:${estimateId}` },
                    { text: '✏️ Редактировать', callback_data: `edit:${estimateId}` }
                ]]
            };

            // Отправляем в Telegram
            const sentMessage = await this.bot.sendMessage(this.adminChatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            // Отправляем историю диалога в текстовом файле
            try {
                // Получаем историю диалога из PreChatForm
                const { PreChatForm } = require('../models');
                const session = await PreChatForm.findOne({ sessionId });
                
                if (session && session.chatHistory && session.chatHistory.length > 0) {
                    // Формируем текст истории
                    let historyText = `ИСТОРИЯ ДИАЛОГА\n`;
                    historyText += `================\n\n`;
                    historyText += `ID сессии: ${sessionId}\n`;
                    historyText += `Имя клиента: ${session.name || 'Не указано'}\n`;
                    historyText += `Должность: ${session.position || 'Не указано'}\n`;
                    historyText += `Отрасль: ${session.industry || 'Не указано'}\n`;
                    historyText += `Бюджет: ${session.budget || 'Не указано'}\n`;
                    historyText += `Сроки: ${session.timeline || 'Не указано'}\n`;
                    historyText += `Дата начала: ${new Date(session.createdAt).toLocaleString('ru-RU')}\n`;
                    historyText += `\n================\nДИАЛОГ:\n================\n\n`;
                    
                    // Добавляем все сообщения из истории
                    session.chatHistory.forEach((msg, index) => {
                        const role = msg.role === 'user' ? '👤 КЛИЕНТ' : '🤖 БОТ';
                        const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString('ru-RU') : '';
                        historyText += `${role} (${timestamp}):\n${msg.content}\n\n---\n\n`;
                    });
                    
                    // Добавляем информацию о смете в конец
                    historyText += `\n================\nСГЕНЕРИРОВАННАЯ СМЕТА:\n================\n\n`;
                    historyText += `Проект: ${estimate.projectName || 'Telegram бот'}\n`;
                    historyText += `Стоимость: ${safeTotalCost.toLocaleString('ru-RU')} ₽\n`;
                    historyText += `Время: ${safeTotalHours} часов\n`;
                    historyText += `Срок: ${estimate.timeline || `${Math.ceil(safeTotalHours / 40)} недель`}\n`;
                    
                    if (estimate.components && estimate.components.length > 0) {
                        historyText += `\nКомпоненты:\n`;
                        estimate.components.forEach(comp => {
                            historyText += `- ${comp.name}: ${comp.hours}ч = ${comp.cost.toLocaleString('ru-RU')} ₽\n`;
                        });
                    }
                    
                    // Создаем Buffer из текста
                    const historyBuffer = Buffer.from(historyText, 'utf-8');
                    
                    // Отправляем файл
                    await this.bot.sendDocument(this.adminChatId, historyBuffer, {
                        caption: `📄 История диалога для сессии ${sessionId}`,
                        filename: `dialog_${sessionId}_${new Date().toISOString().split('T')[0]}.txt`
                    }, {
                        filename: `dialog_${sessionId}_${new Date().toISOString().split('T')[0]}.txt`,
                        contentType: 'text/plain'
                    });
                    
                    logger.info('✅ История диалога отправлена в Telegram');
                } else {
                    logger.warn('История диалога не найдена или пуста', { sessionId });
                }
            } catch (historyError) {
                logger.error('⚠️ Ошибка отправки истории диалога:', historyError);
                // Не прерываем основной процесс, если не удалось отправить историю
            }

            logger.info('✅ Смета успешно отправлена менеджеру в Telegram', { 
                estimateId,
                messageId: sentMessage.message_id,
                chatId: this.adminChatId
            });
            
            return true;

        } catch (error) {
            logger.error('❌ Ошибка отправки сметы в Telegram:', error);
            return false;
        }
    }

    async sendLeadNotification(formData, sessionId) {
        if (!this.bot || !this.adminChatId) {
            logger.warn('Telegram бот или admin chat ID не настроены');
            return false;
        }

        try {
            const text = `🚀 **Новая заявка!**\n\n` +
                        `👤 Имя: ${formData.name || 'Не указано'}\n` +
                        `💼 Должность: ${formData.position || 'Не указано'}\n` +
                        `🏢 Отрасль: ${formData.industry || 'Не указано'}\n` +
                        `💰 Бюджет: ${formData.budget || 'Не указано'}\n` +
                        `📅 Сроки: ${formData.timeline || 'Не указано'}\n` +
                        `💬 Telegram: ${formData.telegram || 'Не указан'}\n` +
                        `📝 Сообщение: ${formData.message || 'Нет'}\n` +
                        `🆔 Session ID: ${sessionId || 'Не указан'}`;
            
            await this.bot.sendMessage(this.adminChatId, text, { parse_mode: 'Markdown' });
            
            logger.info('Уведомление о лиде отправлено');
            return true;
            
        } catch (error) {
            logger.error('Ошибка отправки уведомления о лиде:', error);
            return false;
        }
    }

    async sendToManager(message) {
        if (!this.bot || !this.adminChatId) {
            logger.warn('Telegram бот или admin chat ID не настроены');
            return false;
        }

        try {
            await this.bot.sendMessage(this.adminChatId, message, {
                parse_mode: 'Markdown'
            });
            
            logger.info('Сообщение отправлено менеджеру');
            return true;
            
        } catch (error) {
            logger.error('Ошибка отправки сообщения менеджеру:', error);
            return false;
        }
    }

    async sendNotification(text, options = {}) {
        if (!this.bot || !this.adminChatId) {
            return false;
        }

        try {
            await this.bot.sendMessage(this.adminChatId, text, {
                parse_mode: 'Markdown',
                ...options
            });
            
            return true;
        } catch (error) {
            logger.error('Ошибка отправки уведомления:', error);
            return false;
        }
    }

    isReady() {
        return this.isInitialized && this.bot && this.adminChatId;
    }

    getBotInfo() {
        return {
            isInitialized: this.isInitialized,
            hasBot: !!this.bot,
            hasAdminChat: !!this.adminChatId,
            ready: this.isReady()
        };
    }

    // Форматирование сметы для клиента
    formatEstimateForClient(estimate) {
        const totalCost = Number(estimate.totalCost) || 0;
        const totalHours = Number(estimate.totalHours) || 0;
        
        let message = `🎉 **Отличные новости! Ваша смета утверждена!**\n\n`;
        message += `📋 **${estimate.projectName || 'Ваш Telegram-бот'}**\n\n`;
        message += `💰 **Стоимость проекта:** ${totalCost.toLocaleString('ru-RU')} руб.\n`;
        message += `⏱️ **Срок разработки:** ${estimate.timeline || `${Math.ceil(totalHours / 40)} недель`}\n`;
        message += `📊 **Общая трудоемкость:** ${totalHours} часов\n\n`;
        
        if (estimate.components && estimate.components.length > 0) {
            message += `**📌 Что входит в стоимость:**\n`;
            estimate.components.forEach(comp => {
                const compCost = Number(comp.cost) || 0;
                message += `• ${comp.name}: ${compCost.toLocaleString('ru-RU')} руб.\n`;
            });
            message += `\n`;
        }
        
        if (estimate.detectedFeatures && estimate.detectedFeatures.length > 0) {
            message += `**✅ Включенные функции:**\n`;
            estimate.detectedFeatures.forEach(feature => {
                message += `• ${feature}\n`;
            });
            message += `\n`;
        }
        
        message += `**🚀 Что дальше?**\n`;
        message += `1. Менеджер свяжется с вами в течение 30 минут\n`;
        message += `2. Обсудите детали и подпишите договор\n`;
        message += `3. Внесите предоплату 50%\n`;
        message += `4. Мы приступим к разработке!\n\n`;
        
        message += `**📞 Контакты для связи:**\n`;
        message += `• Телефон: +7 (XXX) XXX-XX-XX\n`;
        message += `• Telegram: @your_manager\n`;
        message += `• Email: info@example.com\n\n`;
        
        message += `_Спасибо за доверие! Мы создадим отличного бота для вашего бизнеса!_ 🎯`;
        
        return message;
    }

    async shutdown() {
        if (this.bot) {
            logger.info('🛑 Останавливаем Telegram бота...');
            await this.bot.stopPolling();
            this.bot = null;
            this.isInitialized = false;
        }
    }
}

// Экспортируем единственный экземпляр
module.exports = instance || new TelegramService();