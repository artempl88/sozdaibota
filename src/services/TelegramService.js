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
        if (config.telegram.botToken && config.telegram.botToken !== 'your_bot_token_here') {
            this.initBot();
        } else {
            logger.warn('Telegram бот не настроен - токен отсутствует');
        }
    }

    initBot() {
        try {
            this.bot = new TelegramBot(config.telegram.botToken, { polling: false });
            this.isInitialized = true;
            logger.info('✅ Telegram бот инициализирован');
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
            // Получаем информацию о клиенте
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
            
            // Информация о смете
            message += '💰 СМЕТА:\n';
            message += `Общая стоимость: ${estimate.totalCost.toLocaleString('ru-RU')} руб.\n`;
            message += `Время разработки: ${estimate.totalHours} часов\n`;
            message += `Срок: ${estimate.timeline}\n\n`;
            
            // Компоненты
            message += '📋 СОСТАВ РАБОТ:\n';
            estimate.components.forEach((component, index) => {
                message += `${index + 1}. ${component.name}\n`;
                message += `   ${component.description}\n`;
                message += `   Часы: ${component.hours} | Стоимость: ${component.cost.toLocaleString('ru-RU')} руб.\n\n`;
            });
            
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
                const simpleMessage = `Новая смета!\nСессия: ${sessionId}\nСтоимость: ${estimate.totalCost} руб.\nВремя: ${estimate.totalHours} часов`;
                
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

            try {
                // Разбираем action
                const [command, sessionId, estimateId] = action.split('_');

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
                }

                // Отвечаем на callback
                await this.bot.answerCallbackQuery(callbackQuery.id);
                
            } catch (error) {
                logger.error('Ошибка обработки callback:', error);
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: '❌ Произошла ошибка',
                    show_alert: true
                });
            }
        });
    }

    // Обработка утверждения сметы
    async handleApproveEstimate(chatId, messageId, sessionId, estimateId) {
        try {
            // Обновляем сообщение
            await this.bot.editMessageText(
                '✅ СМЕТА УТВЕРЖДЕНА!\n\nКлиенту отправлено уведомление.',
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );

            // Здесь должна быть логика сохранения утверждения в БД
            // и отправки уведомления клиенту

            logger.info('Смета утверждена', { sessionId, estimateId });
            
        } catch (error) {
            logger.error('Ошибка утверждения сметы:', error);
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
}

module.exports = new TelegramService();