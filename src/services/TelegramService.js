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

            // КРАТКОЕ СООБЩЕНИЕ в Telegram
            let message = '🎯 Новая смета!\n';
            message += `Сессия: ${sessionId}\n`;
            message += `Стоимость: ${estimate?.totalCost || 'не указана'} руб.\n`;
            message += `Время: ${estimate?.totalHours || 'не указано'} часов\n\n`;
            
            // Данные из быстрой анкеты
            if (clientInfo) {
                message += '👤 Данные из быстрой анкеты:\n';
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

            // Отправляем краткое сообщение
            const sentMessage = await this.bot.sendMessage(this.chatId, message, {
                reply_markup: keyboard,
                disable_web_page_preview: true
            });

            logger.info('✅ Краткое сообщение о смете отправлено', { 
                messageId: sentMessage.message_id,
                sessionId 
            });

            // Создаем и отправляем PDF файлы
            await this.createAndSendPDFFiles(estimate, session, sessionId, clientInfo);

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

    // Создание и отправка PDF файлов
    async createAndSendPDFFiles(estimate, session, sessionId, clientInfo) {
        const PDFService = require('./PDFService');
        
        try {
            logger.info('📄 Начинаем генерацию PDF файлов для менеджера');
            
            // Генерируем PDF для менеджера (с историей диалога)
            const managerPdfPath = await PDFService.generateManagerPDF(estimate, session, clientInfo, sessionId);
            
            logger.info('📤 Отправляем PDF менеджеру');
            
            // Отправляем PDF файл менеджеру
            await this.bot.sendDocument(
                this.chatId, 
                managerPdfPath,
                {
                    caption: '📊 Смета и история переговоров\n\n' +
                            `👤 Клиент: ${clientInfo?.name || 'Не указано'}\n` +
                            `💰 Сумма: ${estimate?.totalCost?.toLocaleString('ru-RU') || 0} ₽\n` +
                            `⏱ Срок: ${estimate?.timeline || 'не указан'}`
                },
                {
                    filename: `Смета_${clientInfo?.name?.replace(/[^а-яА-Яa-zA-Z0-9]/g, '_') || sessionId}_${new Date().toISOString().split('T')[0]}.pdf`,
                    contentType: 'application/pdf'
                }
            );
            
            logger.info('✅ PDF файл успешно отправлен менеджеру');
            
            // Удаляем временный файл через 30 секунд
            setTimeout(async () => {
                await PDFService.cleanupTempFiles([managerPdfPath]);
            }, 30000);
            
        } catch (error) {
            logger.error('❌ Ошибка создания/отправки PDF файлов:', error);
            throw error;
        }
    }

    // Генерация HTML для истории диалога
    generateDialogHtml(session, clientInfo, sessionId) {
        const currentDate = new Date().toLocaleString('ru-RU');
        
        let html = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>История диалога - ${clientInfo?.name || sessionId}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; line-height: 1.6; color: #333; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .client-info { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; margin: 15px 0; }
        .message { margin: 15px 0; padding: 15px; border-radius: 12px; max-width: 80%; }
        .user-message { background: #e3f2fd; margin-left: auto; border-bottom-right-radius: 4px; }
        .bot-message { background: #f1f8e9; margin-right: auto; border-bottom-left-radius: 4px; }
        .message-header { font-size: 0.9em; color: #666; margin-bottom: 8px; font-weight: 500; }
        .message-content { white-space: pre-wrap; }
        .timestamp { font-size: 0.8em; color: #999; margin-top: 5px; }
        h1 { color: #1976d2; margin: 0; }
        h2 { color: #388e3c; margin: 20px 0 10px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📝 История диалога</h1>
        <div class="client-info">
            <div><strong>👤 Клиент:</strong> ${clientInfo?.name || 'Не указано'}</div>
            <div><strong>💼 Должность:</strong> ${clientInfo?.position || 'Не указано'}</div>
            <div><strong>🏢 Отрасль:</strong> ${clientInfo?.industry || 'Не указано'}</div>
            <div><strong>💰 Бюджет:</strong> ${clientInfo?.budget || 'Не указано'}</div>
            <div><strong>⏱ Сроки:</strong> ${clientInfo?.timeline || 'Не указано'}</div>
            <div><strong>📅 Дата:</strong> ${currentDate}</div>
        </div>`;
        
        if (clientInfo?.contacts) {
            html += `<div class="client-info"><h3>📞 Контакты:</h3>`;
            if (clientInfo.contacts.phone) html += `<div><strong>📱 Телефон:</strong> ${clientInfo.contacts.phone}</div>`;
            if (clientInfo.contacts.email) html += `<div><strong>📧 Email:</strong> ${clientInfo.contacts.email}</div>`;
            if (clientInfo.contacts.telegram) html += `<div><strong>💬 Telegram:</strong> ${clientInfo.contacts.telegram}</div>`;
            html += `</div>`;
        }
        
        html += `</div>`;
        
        html += `<h2>💬 Диалог</h2>`;
        
        if (session?.chatHistory && session.chatHistory.length > 0) {
            session.chatHistory.forEach((msg, index) => {
                const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString('ru-RU') : '';
                const isUser = msg.role === 'user';
                
                html += `
                <div class="message ${isUser ? 'user-message' : 'bot-message'}">
                    <div class="message-header">${isUser ? '👤 Клиент' : '🤖 Консультант'}</div>
                    <div class="message-content">${this.escapeHtml(msg.content)}</div>
                    ${timestamp ? `<div class="timestamp">${timestamp}</div>` : ''}
                </div>`;
            });
        } else {
            html += `<p>История диалога пуста</p>`;
        }
        
        html += `
    <div style="margin-top: 40px; padding: 15px; background: #f5f5f5; border-radius: 8px; font-size: 0.9em; color: #666;">
        <strong>🔗 ID сессии:</strong> ${sessionId}<br>
        <strong>📅 Экспорт:</strong> ${currentDate}
    </div>
</body>
</html>`;
        
        return html;
    }

    // Генерация HTML для сметы
    generateEstimateHtml(estimate, clientInfo, sessionId) {
        const currentDate = new Date().toLocaleString('ru-RU');
        
        let html = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Смета проекта - ${clientInfo?.name || sessionId}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; line-height: 1.6; color: #333; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; }
        .summary { background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800; }
        .components { margin: 20px 0; }
        .component { background: white; border: 1px solid #e0e0e0; border-radius: 8px; margin: 10px 0; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .component-header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px; }
        .component-name { font-weight: 600; color: #1976d2; font-size: 1.1em; }
        .component-cost { background: #4caf50; color: white; padding: 5px 12px; border-radius: 20px; font-weight: 500; }
        .component-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 15px 0; }
        .component-description { color: #666; margin: 10px 0; }
        .total-box { background: linear-gradient(135deg, #4caf50 0%, #45a049 100%); color: white; padding: 25px; border-radius: 12px; text-align: center; margin: 30px 0; }
        .features-list { columns: 2; column-gap: 30px; }
        .features-list li { margin: 5px 0; break-inside: avoid; }
        h1 { margin: 0; font-size: 2em; }
        h2 { color: #1976d2; border-bottom: 2px solid #e3f2fd; padding-bottom: 10px; }
        .client-info { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin: 20px 0; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 0.8em; font-weight: 500; }
        .badge-low { background: #e8f5e8; color: #2e7d32; }
        .badge-medium { background: #fff3e0; color: #f57c00; }
        .badge-high { background: #fce4ec; color: #c2185b; }
        .badge-very-high { background: #f3e5f5; color: #7b1fa2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>💰 Смета проекта Telegram-бота</h1>
        <div class="client-info">
            <div><strong>👤 Клиент:</strong> ${clientInfo?.name || 'Не указано'}</div>
            <div><strong>💼 Должность:</strong> ${clientInfo?.position || 'Не указано'}</div>
            <div><strong>🏢 Отрасль:</strong> ${clientInfo?.industry || 'Не указано'}</div>
            <div><strong>📅 Дата:</strong> ${currentDate}</div>
        </div>
    </div>`;
        
        // Общая информация
        html += `
    <div class="total-box">
        <h2 style="margin: 0 0 15px 0; color: white; border: none;">📊 Итого по проекту</h2>
        <div style="font-size: 2.5em; margin: 10px 0;">${estimate?.totalCost ? estimate.totalCost.toLocaleString('ru-RU') : 'не указана'} ₽</div>
        <div style="font-size: 1.2em; opacity: 0.9;">
            ⏱️ Время разработки: ${estimate?.totalHours || 'не указано'} часов<br>
            📅 Срок реализации: ${estimate?.timeline || 'не указан'}
        </div>
    </div>`;
        
        // Компоненты сметы
        if (estimate?.components && estimate.components.length > 0) {
            html += `<h2>📋 Состав работ</h2><div class="components">`;
            
            estimate.components.forEach((component, index) => {
                const complexityBadge = this.getComplexityBadge(component.complexity);
                
                html += `
                <div class="component">
                    <div class="component-header">
                        <div class="component-name">${index + 1}. ${this.escapeHtml(component.name || 'Без названия')}</div>
                        <div class="component-cost">${component.cost ? component.cost.toLocaleString('ru-RU') : 0} ₽</div>
                    </div>
                    <div class="component-description">${this.escapeHtml(component.description || 'Описание отсутствует')}</div>
                    <div class="component-details">
                        <div><strong>⏱️ Время:</strong> ${component.hours || 0} часов</div>
                        <div><strong>📁 Категория:</strong> ${component.category || 'не указана'}</div>
                        <div><strong>🎯 Сложность:</strong> ${complexityBadge}</div>
                    </div>
                </div>`;
            });
            
            html += `</div>`;
        }
        
        // Обнаруженные функции
        if (estimate?.detectedFeatures && estimate.detectedFeatures.length > 0) {
            html += `
            <h2>✅ Выявленный функционал</h2>
            <ul class="features-list">`;
            
            estimate.detectedFeatures.forEach(feature => {
                html += `<li>${this.escapeHtml(feature)}</li>`;
            });
            
            html += `</ul>`;
        }
        
        // Рекомендации
        if (estimate?.recommendations && estimate.recommendations.length > 0) {
            html += `
            <h2>💡 Рекомендации</h2>
            <ul>`;
            
            estimate.recommendations.forEach(rec => {
                html += `<li>${this.escapeHtml(rec)}</li>`;
            });
            
            html += `</ul>`;
        }
        
        // Информация о бизнесе
        if (estimate?.businessType) {
            html += `
            <div class="summary">
                <h3>🏢 Тип бизнеса</h3>
                <p>${this.escapeHtml(estimate.businessType)}</p>
            </div>`;
        }
        
        html += `
    <div style="margin-top: 40px; padding: 20px; background: #f5f5f5; border-radius: 8px; font-size: 0.9em; color: #666;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
            <div><strong>🔗 ID сессии:</strong> ${sessionId}</div>
            <div><strong>📅 Создано:</strong> ${currentDate}</div>
            <div><strong>💼 Компания:</strong> СоздайБота</div>
            <div><strong>📧 Email:</strong> info@sozdaibota.ru</div>
        </div>
    </div>
</body>
</html>`;
        
        return html;
    }

    // Получить бейдж сложности
    getComplexityBadge(complexity) {
        const badges = {
            'low': '<span class="badge badge-low">Низкая</span>',
            'medium': '<span class="badge badge-medium">Средняя</span>',
            'high': '<span class="badge badge-high">Высокая</span>',
            'very_high': '<span class="badge badge-very-high">Очень высокая</span>'
        };
        
        return badges[complexity] || '<span class="badge badge-medium">Не указана</span>';
    }

    // Экранирование HTML
    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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
                // ИСПРАВЛЕНО: правильный парсинг sessionId
                // action format: approve_session_1749418553906_8cpbqtqbh_temp
                const parts = action.split('_');
                const command = parts[0]; // approve
                
                // Собираем sessionId обратно из частей
                let sessionId = '';
                let estimateId = '';
                
                if (parts[1] === 'session' && parts.length >= 4) {
                    // sessionId = session_1749418553906_8cpbqtqbh
                    sessionId = `${parts[1]}_${parts[2]}_${parts[3]}`;
                    estimateId = parts[4] || 'temp';
                } else {
                    // Старый формат для обратной совместимости
                    sessionId = parts[1];
                    estimateId = parts[2];
                }
                
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
                '✅ СМЕТА УТВЕРЖДЕНА!\n\nГенерирую PDF для клиента...',
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );
            
            // Генерируем PDF для клиента
            const PDFService = require('./PDFService');
            
            try {
                // Подготавливаем данные для PDF
                const clientInfo = {
                    name: session.name,
                    position: session.position,
                    industry: session.industry,
                    budget: session.budget,
                    timeline: session.timeline,
                    contacts: session.contacts
                };
                
                const estimate = {
                    totalCost: session.estimateData?.totalCost || 0,
                    totalHours: session.estimateData?.totalHours || 0,
                    timeline: session.estimateData?.timeline || session.timeline || '2-3 недели',
                    components: session.estimateData?.components || [],
                    detectedFeatures: session.estimateData?.features || [],
                    businessType: session.estimateData?.businessType || session.industry,
                    recommendations: session.estimateData?.recommendations || []
                };
                
                // Генерируем PDF для клиента (без истории диалога)
                const clientPdfPath = await PDFService.generateClientPDF(estimate, clientInfo, sessionId);
                
                logger.info('📄 PDF для клиента сгенерирован', { clientPdfPath });
                
                // Формируем красивое сообщение для клиента
                const totalCost = session.estimateData?.totalCost || 'уточняется у менеджера';
                const totalHours = session.estimateData?.totalHours || 'уточняется у менеджера';
                const timeline = session.estimateData?.timeline || '2-3 недели';
                
                let approvedEstimateMessage = `✅ **Ваше коммерческое предложение готово!**\n\n`;
                approvedEstimateMessage += `💰 **Стоимость проекта:** ${typeof totalCost === 'number' ? totalCost.toLocaleString('ru-RU') : totalCost} ₽\n`;
                approvedEstimateMessage += `⏱️ **Время разработки:** ${typeof totalHours === 'number' ? totalHours + ' часов' : totalHours}\n`;
                approvedEstimateMessage += `📅 **Срок реализации:** ${timeline}\n\n`;
                
                // Добавляем состав работ если есть
                if (session.estimateData?.features && session.estimateData.features.length > 0) {
                    approvedEstimateMessage += `📋 **В стоимость входит:**\n`;
                    session.estimateData.features.forEach(feature => {
                        approvedEstimateMessage += `• ${feature}\n`;
                    });
                    approvedEstimateMessage += '\n';
                }
                
                approvedEstimateMessage += `📄 **PDF документ с полным коммерческим предложением прикреплен к этому сообщению.**\n\n`;
                approvedEstimateMessage += `**Следующие шаги:**\n`;
                approvedEstimateMessage += `1. Скачайте и изучите коммерческое предложение\n`;
                approvedEstimateMessage += `2. Мы свяжемся с вами для обсуждения деталей\n`;
                approvedEstimateMessage += `3. После согласования подпишем договор\n`;
                approvedEstimateMessage += `4. Начнем разработку вашего бота\n\n`;
                approvedEstimateMessage += `📞 Ожидайте звонка от менеджера в течение 30 минут.\n\n`;
                approvedEstimateMessage += `Если у вас есть вопросы - напишите здесь или свяжитесь с нами удобным способом.`;
                
                // Сохраняем PDF путь и сообщение в chatHistory
                session.chatHistory.push({
                    role: 'assistant',
                    content: approvedEstimateMessage,
                    timestamp: new Date(),
                    metadata: {
                        messageType: 'approved_estimate',
                        approvedAt: new Date(),
                        estimateId: estimateId,
                        pdfPath: clientPdfPath
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
                    `PDF для клиента сгенерирован и будет отправлен.\n` +
                    `ID сессии: ${sessionId}\n\n` +
                    `✨ Клиент получит PDF с коммерческим предложением в чате.`,
                    {
                        chat_id: chatId,
                        message_id: messageId
                    }
                );
                
                // Отправляем дополнительное подтверждение с PDF
                await this.bot.sendDocument(
                    chatId,
                    clientPdfPath,
                    {
                        caption: `✅ PDF для клиента готов\n` +
                                `📧 Клиент: ${clientInfo.name}\n` +
                                `💰 Сумма: ${totalCost} ₽\n` +
                                `📱 Контакты: ${this.formatContacts(clientInfo.contacts)}`
                    },
                    {
                        filename: `КП_для_клиента_${clientInfo.name?.replace(/[^а-яА-Яa-zA-Z0-9]/g, '_') || sessionId}.pdf`,
                        contentType: 'application/pdf'
                    }
                );
                
                // Удаляем временный файл через 60 секунд
                setTimeout(async () => {
                    await PDFService.cleanupTempFiles([clientPdfPath]);
                }, 60000);
                
            } catch (pdfError) {
                logger.error('❌ Ошибка генерации PDF для клиента:', pdfError);
                
                // Все равно сохраняем утверждение, но без PDF
                session.estimateApproved = true;
                session.estimateApprovedAt = new Date();
                session.approvedEstimateId = estimateId;
                session.estimateDeliveredToClient = false;
                await session.save();

                await this.bot.sendMessage(
                    chatId,
                    '⚠️ Смета утверждена, но произошла ошибка при генерации PDF.\n' +
                    'Клиент получит текстовую версию коммерческого предложения.'
                );
            }
            
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

    // Вспомогательный метод для форматирования контактов
    formatContacts(contacts) {
        if (!contacts) return 'Не указаны';
        
        const formatted = [];
        if (contacts.Telegram || contacts.telegram) {
            formatted.push(`TG: ${contacts.Telegram || contacts.telegram}`);
        }
        if (contacts['Телефон'] || contacts.phone) {
            formatted.push(`Tel: ${contacts['Телефон'] || contacts.phone}`);
        }
        if (contacts.Email || contacts.email) {
            formatted.push(`Email: ${contacts.Email || contacts.email}`);
        }
        
        return formatted.length > 0 ? formatted.join(', ') : 'Не указаны';
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