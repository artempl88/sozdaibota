const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const logger = require('../utils/logger');
const { PreChatForm } = require('../models');

class TelegramService {
    constructor() {
        this.bot = null;
        this.chatId = config.telegram.adminChatId;
        this.isInitialized = false;
        
        // Только инициализируем если есть токен
        if (config.telegram.token && config.telegram.token !== 'your_bot_token_here') {
            this.initBot();
        } else {
            logger.warn('Telegram бот не настроен - токен отсутствует');
        }
    }

    initBot() {
        try {
            // Включаем polling для получения обновлений
            this.bot = new TelegramBot(config.telegram.token, { 
                polling: {
                    interval: 300,
                    autoStart: true,
                    params: {
                        timeout: 10
                    }
                }
            });
            this.isInitialized = true;
            logger.info('✅ Telegram бот инициализирован с polling');
            
            // Обработка ошибок polling
            this.bot.on('polling_error', (error) => {
                logger.error('Ошибка polling:', error);
            });
            
            // Настраиваем обработчики
            this.setupCallbackHandlers();
            
            // Логируем все входящие сообщения для отладки
            this.bot.on('message', (msg) => {
                logger.info('Получено сообщение в Telegram:', {
                    from: msg.from.username || msg.from.id,
                    text: msg.text?.substring(0, 50) || 'без текста'
                });
            });
            
        } catch (error) {
            logger.error('❌ Ошибка инициализации Telegram бота:', error);
            this.isInitialized = false;
        }
    }

    // Экранирование специальных символов для MarkdownV2
    escapeMarkdownV2(text) {
        return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
    }

    // Форматирование текста для Telegram с правильным Markdown
    formatForTelegram(text) {
        // Заменяем **text** на *text* для жирного текста в Telegram
        let formatted = text.replace(/\*\*(.*?)\*\*/g, '*$1*');
        
        // Убираем другие markdown элементы, которые могут вызвать проблемы
        formatted = formatted.replace(/#{1,6}\s/g, ''); // Убираем заголовки
        formatted = formatted.replace(/```[\s\S]*?```/g, ''); // Убираем блоки кода
        formatted = formatted.replace(/`([^`]+)`/g, '$1'); // Убираем inline код
        
        return formatted;
    }

    // Отправка сметы в Telegram менеджеру
    async sendEstimateToTelegram(estimate, sessionId) {
        if (!this.isInitialized || !this.bot) {
            logger.warn('Telegram бот не инициализирован, пропускаем отправку');
            return false;
        }

        try {
            // Логируем структуру estimate для отладки
            logger.info('📊 Структура estimate:', {
                hasEstimate: !!estimate,
                estimateKeys: estimate ? Object.keys(estimate) : [],
                totalCost: estimate?.totalCost,
                totalHours: estimate?.totalHours,
                componentsCount: estimate?.components?.length || 0
            });
            
            // Получаем информацию о клиенте и историю диалога
            const session = await PreChatForm.findOne({ sessionId });
            const clientInfo = session ? {
                name: session.name || 'Не указано',
                position: session.position || 'Не указано',
                industry: session.industry || 'Не указано',
                budget: session.budget || 'Не указано',
                timeline: session.timeline || 'Не указано',
                contacts: session.contacts || {}
            } : null;

            // Формируем сообщение БЕЗ parse_mode для избежания ошибок
            let message = '🎯 НОВАЯ СМЕТА!\n\n';
            
            // Информация о клиенте
            if (clientInfo) {
                message += '👤 КЛИЕНТ:\n';
                message += `Имя: ${clientInfo.name}\n`;
                message += `Должность: ${clientInfo.position}\n`;
                message += `Отрасль: ${clientInfo.industry}\n`;
                message += `Бюджет: ${clientInfo.budget}\n`;
                message += `Сроки: ${clientInfo.timeline}\n`;
                
                if (clientInfo.contacts.phone) {
                    message += `📱 Телефон: ${clientInfo.contacts.phone}\n`;
                }
                if (clientInfo.contacts.email) {
                    message += `📧 Email: ${clientInfo.contacts.email}\n`;
                }
                if (clientInfo.contacts.telegram) {
                    message += `💬 Telegram: ${clientInfo.contacts.telegram}\n`;
                }
                
                message += '\n';
            }
            
            // ДОБАВЛЯЕМ ИСТОРИЮ ДИАЛОГА
            if (session && session.chatHistory && session.chatHistory.length > 0) {
                message += '💬 ИСТОРИЯ ДИАЛОГА:\n';
                message += '━━━━━━━━━━━━━━━━━━━━\n';
                
                // Берем последние 10 сообщений или все, если меньше
                const messagesToShow = session.chatHistory.slice(-10);
                
                messagesToShow.forEach((msg, index) => {
                    if (msg.role === 'user') {
                        message += `👤 Клиент: ${msg.content}\n\n`;
                    } else if (msg.role === 'assistant') {
                        // Сокращаем слишком длинные сообщения ассистента
                        const content = msg.content.length > 300 
                            ? msg.content.substring(0, 300) + '...' 
                            : msg.content;
                        message += `🤖 Бот: ${content}\n\n`;
                    }
                });
                
                message += '━━━━━━━━━━━━━━━━━━━━\n\n';
            }
            
            // Информация о смете
            message += '💰 СМЕТА:\n';
            message += `Общая стоимость: ${estimate.totalCost ? estimate.totalCost.toLocaleString('ru-RU') : 'не указана'} руб.\n`;
            message += `Время разработки: ${estimate.totalHours || 'не указано'} часов\n`;
            message += `Срок: ${estimate.timeline || 'не указан'}\n\n`;
            
            // Компоненты
            if (estimate.components && estimate.components.length > 0) {
                message += '📋 СОСТАВ РАБОТ:\n';
                estimate.components.forEach((component, index) => {
                    message += `${index + 1}. ${component.name || 'Без названия'}\n`;
                    if (component.description) {
                        message += `   ${component.description}\n`;
                    }
                    message += `   Часы: ${component.hours || 0} | Стоимость: ${component.cost ? component.cost.toLocaleString('ru-RU') : 0} руб.\n\n`;
                });
            }
            
            // Обнаруженные функции
            if (estimate.detectedFeatures && estimate.detectedFeatures.length > 0) {
                message += '✅ ФУНКЦИОНАЛ:\n';
                estimate.detectedFeatures.forEach(feature => {
                    message += `• ${feature}\n`;
                });
                message += '\n';
            }
            
            // Рекомендации
            if (estimate.recommendations && estimate.recommendations.length > 0) {
                message += '💡 РЕКОМЕНДАЦИИ:\n';
                estimate.recommendations.forEach(rec => {
                    message += `• ${rec}\n`;
                });
                message += '\n';
            }
            
            // ID сессии
            message += `🔗 ID сессии: ${sessionId}\n`;
            message += `📅 Дата: ${new Date().toLocaleString('ru-RU')}`;

            // Проверяем длину сообщения (Telegram лимит 4096 символов)
            if (message.length > 4000) {
                // Если слишком длинное, обрезаем историю диалога
                logger.warn('Сообщение слишком длинное, сокращаем историю диалога');
                
                // Пересобираем сообщение с меньшим количеством истории
                message = '🎯 НОВАЯ СМЕТА!\n\n';
                
                // Клиент инфо (сокращенно)
                if (clientInfo) {
                    message += `👤 ${clientInfo.name} | ${clientInfo.industry} | ${clientInfo.budget}\n\n`;
                }
                
                message += '💬 ПОСЛЕДНИЕ СООБЩЕНИЯ:\n';
                const lastMessages = session.chatHistory.slice(-4);
                lastMessages.forEach(msg => {
                    const content = msg.content.substring(0, 150);
                    message += `${msg.role === 'user' ? '👤' : '🤖'}: ${content}\n`;
                });
                
                message += '\n💰 СМЕТА:\n';
                message += `Стоимость: ${estimate.totalCost.toLocaleString('ru-RU')} руб.\n`;
                message += `Срок: ${estimate.timeline}\n\n`;
                
                message += '📋 Детали в следующем сообщении...';
            }

            // Создаем клавиатуру с кнопками
            const keyboard = {
                inline_keyboard: [
                    [
                        { 
                            text: '✅ Утвердить смету', 
                            callback_data: `approve_${sessionId}_${estimate._id || 'temp'}` 
                        }
                    ],
                    [
                        { 
                            text: '📝 Редактировать', 
                            callback_data: `edit_${sessionId}_${estimate._id || 'temp'}` 
                        },
                        { 
                            text: '❌ Отклонить', 
                            callback_data: `reject_${sessionId}_${estimate._id || 'temp'}` 
                        }
                    ]
                ]
            };

            // Отправляем сообщение БЕЗ parse_mode чтобы избежать ошибок парсинга
            const sentMessage = await this.bot.sendMessage(this.chatId, message, {
                reply_markup: keyboard,
                disable_web_page_preview: true
            });

            logger.info('✅ Смета отправлена в Telegram', { 
                messageId: sentMessage.message_id,
                sessionId 
            });

            return true;

        } catch (error) {
            logger.error('❌ Ошибка отправки сметы в Telegram:', error);
            
            // Пробуем отправить упрощенную версию без форматирования
            try {
                const cost = estimate?.totalCost || 'не указана';
                const hours = estimate?.totalHours || 'не указаны';
                const simpleMessage = `Новая смета!\nСессия: ${sessionId}\nСтоимость: ${cost} руб.\nВремя: ${hours} часов`;
                
                await this.bot.sendMessage(this.chatId, simpleMessage);
                logger.info('✅ Отправлена упрощенная версия сметы');
                return true;
                
            } catch (retryError) {
                logger.error('❌ Не удалось отправить даже упрощенную версию:', retryError);
                return false;
            }
        }
    }

    // Отправка уведомления об утверждении клиенту
    async sendApprovalNotification(sessionId, estimateId) {
        try {
            // Здесь можно добавить логику отправки уведомления клиенту
            // через Telegram если у нас есть его chat_id
            
            logger.info('Уведомление об утверждении сметы', { sessionId, estimateId });
            
            return true;
        } catch (error) {
            logger.error('Ошибка отправки уведомления:', error);
            return false;
        }
    }

    // Отправка простого сообщения менеджеру
    async sendMessageToManager(text) {
        if (!this.isInitialized || !this.bot) {
            logger.warn('Telegram бот не инициализирован');
            return false;
        }

        try {
            await this.bot.sendMessage(this.chatId, text);
            return true;
        } catch (error) {
            logger.error('Ошибка отправки сообщения менеджеру:', error);
            return false;
        }
    }

    // Отправка уведомления о новой заявке
    async sendNewLeadNotification(formData, sessionId) {
        if (!this.isInitialized || !this.bot) {
            logger.warn('Telegram бот не инициализирован');
            return false;
        }

        try {
            let message = '🔔 НОВАЯ ЗАЯВКА!\n\n';
            message += `👤 Имя: ${formData.name}\n`;
            message += `💼 Должность: ${formData.position}\n`;
            message += `🏢 Отрасль: ${formData.industry}\n`;
            message += `💰 Бюджет: ${formData.budget}\n`;
            message += `⏱ Сроки: ${formData.timeline}\n`;
            
            if (formData.contacts) {
                message += '\n📞 КОНТАКТЫ:\n';
                if (formData.contacts.phone) message += `📱 ${formData.contacts.phone}\n`;
                if (formData.contacts.email) message += `📧 ${formData.contacts.email}\n`;
                if (formData.contacts.telegram) message += `💬 ${formData.contacts.telegram}\n`;
            }
            
            message += `\n🔗 ID сессии: ${sessionId}`;

            await this.bot.sendMessage(this.chatId, message);
            
            logger.info('✅ Уведомление о новой заявке отправлено');
            return true;
            
        } catch (error) {
            logger.error('❌ Ошибка отправки уведомления о заявке:', error);
            return false;
        }
    }

    // Обработка callback запросов (кнопок)
    setupCallbackHandlers() {
        if (!this.bot) return;

        this.bot.on('callback_query', async (callbackQuery) => {
            const action = callbackQuery.data;
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;
            
            logger.info('📱 Получен callback от кнопки', {
                action: action,
                from: callbackQuery.from.username || callbackQuery.from.id,
                messageId: messageId
            });

            try {
                // Разбираем action
                const [command, sessionId, estimateId] = action.split('_');
                
                logger.info('Обработка команды', { command, sessionId, estimateId });

                switch (command) {
                    case 'approve':
                        await this.handleApproveEstimate(chatId, messageId, sessionId, estimateId);
                        break;
                    case 'edit':
                        await this.handleEditEstimate(chatId, messageId, sessionId, estimateId);
                        break;
                    case 'reject':
                        await this.handleRejectEstimate(chatId, messageId, sessionId, estimateId);
                        break;
                    default:
                        logger.warn('Неизвестная команда callback:', command);
                }

                // Отвечаем на callback
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: '✅ Обработано',
                    show_alert: false
                });
                
            } catch (error) {
                logger.error('Ошибка обработки callback:', error);
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: '❌ Произошла ошибка',
                    show_alert: true
                });
            }
        });
        
        logger.info('✅ Обработчики callback настроены');
    }

    // Обработка утверждения сметы
    async handleApproveEstimate(chatId, messageId, sessionId, estimateId) {
        try {
            logger.info('🔔 Обработка утверждения сметы', { sessionId, estimateId });
            
            // Находим сессию
            const session = await PreChatForm.findOne({ sessionId });
            
            if (!session) {
                logger.error('❌ Сессия не найдена при утверждении сметы', { sessionId });
                await this.bot.sendMessage(chatId, '❌ Ошибка: сессия не найдена');
                return;
            }
            
            logger.info('✅ Сессия найдена, обновляем статус', {
                sessionId,
                currentStatus: {
                    estimateApproved: session.estimateApproved,
                    estimateSent: session.estimateSent
                }
            });
            
            // Сначала обновляем сообщение в Telegram
            await this.bot.editMessageText(
                '✅ СМЕТА УТВЕРЖДЕНА!\n\nОтправляю клиенту...',
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );
            
            // Формируем красивое сообщение для клиента
            const totalCost = session.estimateData?.totalCost || 'уточняется у менеджера';
            const totalHours = session.estimateData?.totalHours || 'уточняется у менеджера';
            const timeline = session.estimateData?.timeline || '2-3 недели';
            
            const approvedEstimateMessage = `✅ **Ваша смета утверждена!**\n\n` +
                `💰 **Стоимость проекта:** ${typeof totalCost === 'number' ? totalCost.toLocaleString('ru-RU') : totalCost} руб.\n` +
                `⏱️ **Срок разработки:** ${typeof totalHours === 'number' ? totalHours + ' часов' : totalHours}\n` +
                `📅 **Общий срок:** ${timeline}\n\n` +
                `📋 **Следующие шаги:**\n` +
                `1. Мы свяжемся с вами для обсуждения деталей\n` +
                `2. Подпишем договор\n` +
                `3. Начнем разработку вашего бота\n\n` +
                `📞 Ожидайте звонка от менеджера в течение 30 минут.\n\n` +
                `Если у вас есть вопросы, напишите их здесь - я передам менеджеру.`;
            
            // Сохраняем утвержденную смету в chatHistory
            session.chatHistory.push({
                role: 'assistant',
                content: approvedEstimateMessage,
                timestamp: new Date(),
                metadata: {
                    messageType: 'approved_estimate',
                    approvedAt: new Date(),
                    estimateId: estimateId
                }
            });
            
            // Обновляем статус сессии
            session.estimateApproved = true;
            session.estimateApprovedAt = new Date();
            session.approvedEstimateId = estimateId;
            
            // ВАЖНО: Сбрасываем флаг доставки чтобы SSE мог отправить клиенту
            session.estimateDeliveredToClient = false;
            
            const savedSession = await session.save();
            
            logger.info('✅ Смета утверждена и сохранена в БД', { 
                sessionId,
                estimateApproved: savedSession.estimateApproved,
                approvedAt: savedSession.estimateApprovedAt
            });
            
            // Обновляем сообщение в Telegram
            await this.bot.editMessageText(
                '✅ СМЕТА УТВЕРЖДЕНА!\n\n' +
                `Клиенту отправлено уведомление.\n` +
                `ID сессии: ${sessionId}\n\n` +
                `✨ Смета появится в чате клиента автоматически.`,
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );
            
            // Отправляем дополнительное подтверждение
            await this.bot.sendMessage(
                chatId,
                `✅ Статус в БД обновлен:\n` +
                `- estimateApproved: true\n` +
                `- approvedAt: ${new Date().toLocaleString('ru-RU')}\n` +
                `- Клиент получит уведомление через SSE/polling`
            );
            
        } catch (error) {
            logger.error('❌ Ошибка утверждения сметы:', error);
            
            try {
                await this.bot.sendMessage(
                    chatId, 
                    `❌ Ошибка при утверждении сметы:\n${error.message}\n\nПопробуйте еще раз или обратитесь к разработчику.`
                );
            } catch (sendError) {
                logger.error('Не удалось отправить сообщение об ошибке:', sendError);
            }
        }
    }

    // Обработка редактирования сметы  
    async handleEditEstimate(chatId, messageId, sessionId, estimateId) {
        try {
            await this.bot.sendMessage(
                chatId,
                `📝 Для редактирования сметы перейдите в админ-панель:\n${config.adminPanelUrl}/estimates/${estimateId}`
            );
        } catch (error) {
            logger.error('Ошибка при редактировании:', error);
        }
    }

    // Обработка отклонения сметы
    async handleRejectEstimate(chatId, messageId, sessionId, estimateId) {
        try {
            await this.bot.editMessageText(
                '❌ СМЕТА ОТКЛОНЕНА',
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );

            logger.info('Смета отклонена', { sessionId, estimateId });
            
        } catch (error) {
            logger.error('Ошибка отклонения сметы:', error);
        }
    }

    // Получение информации о боте
    getBotInfo() {
        return {
            ready: this.isInitialized,
            hasToken: !!config.telegram.token,
            hasChatId: !!this.chatId,
            status: this.isInitialized ? 'active' : 'inactive',
            message: this.isInitialized 
                ? 'Telegram бот готов к работе' 
                : 'Telegram бот не инициализирован'
        };
    }

    // Проверка готовности бота
    isReady() {
        return this.isInitialized && this.bot !== null;
    }

    // Остановка бота
    async shutdown() {
        try {
            if (this.bot) {
                // Останавливаем polling если включен
                if (this.bot.isPolling && this.bot.isPolling()) {
                    await this.bot.stopPolling();
                }
                
                logger.info('Telegram бот остановлен');
            }
            
            this.isInitialized = false;
            this.bot = null;
            
        } catch (error) {
            logger.error('Ошибка остановки Telegram бота:', error);
        }
    }

    // Отправка простого уведомления (для тестов и общих уведомлений)
    async sendNotification(text) {
        if (!this.isInitialized || !this.bot) {
            logger.warn('Telegram бот не инициализирован');
            return false;
        }

        try {
            await this.bot.sendMessage(this.chatId, text);
            return true;
        } catch (error) {
            logger.error('Ошибка отправки уведомления:', error);
            return false;
        }
    }

    // Алиас для sendNewLeadNotification для совместимости
    async sendLeadNotification(formData, sessionId) {
        return this.sendNewLeadNotification(formData, sessionId);
    }

    // Алиас для sendMessageToManager
    async sendEstimateToManager(estimate, sessionId) {
        return this.sendEstimateToTelegram(estimate, sessionId);
    }
}

module.exports = new TelegramService();