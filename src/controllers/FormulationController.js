const logger = require('../utils/logger');
const AdvancedGPTService = require('../services/AdvancedGPTService');
const EstimateService = require('../services/EstimateService');
const TelegramService = require('../services/TelegramService');
const { Conversation } = require('../models');

class FormulationController {
    
    // Обработка режима формулировки
    async handleFormulationMode(req, res) {
        try {
            logger.info('Вход в режим формулировки');
            const { message, conversation = [], sessionId } = req.body;

            logger.info('Формулировка - данные', { 
                messageLength: message?.length || 0, 
                conversationLength: conversation.length 
            });

            // Проверяем нужно ли считать смету
            const shouldCalculate = await AdvancedGPTService.analyzeUserIntent(message, conversation);
            
            logger.info('Проверка расчета сметы', { shouldCalculate });

            let estimate = null;
            let estimateMessage = '';

            if (shouldCalculate) {
                const functionalityReady = await AdvancedGPTService.checkFunctionalityReadiness(conversation);
                
                if (functionalityReady) {
                    logger.info('Генерируем смету в режиме формулировки');
                    
                    const requirements = conversation
                        .filter(msg => msg.role === 'user')
                        .map(msg => msg.content)
                        .join('\n');
                        
                    estimate = await EstimateService.calculateProjectEstimate(requirements);
                    
                    if (estimate) {
                        // Отправляем в Telegram
                        await TelegramService.sendEstimateToTelegram(estimate, sessionId);
                        
                        // Сохраняем в БД
                        if (sessionId && Conversation) {
                            try {
                                const conv = await Conversation.findBySessionId(sessionId);
                                if (conv) {
                                    conv.setEstimate(estimate);
                                    conv.mode = 'formulation';
                                    await conv.save();
                                }
                            } catch (dbError) {
                                logger.error('Ошибка сохранения сметы в формулировке:', dbError);
                            }
                        }
                        
                        estimateMessage = `Отлично! На основе наших обсуждений я подготовил техническое задание и смету. Документы отправлены менеджеру на согласование.

После утверждения вы получите:
📋 Детальное техническое задание
💰 Окончательную смету с расценками
📅 План разработки по этапам

Обычно это занимает 15-30 минут. Хотите что-то уточнить или добавить?`;
                    }
                }
            }
            
            // Обработка начала режима
            let messages;
            const systemPrompt = AdvancedGPTService.buildSystemPrompt('formulation', conversation.length);
            
            if (message === 'FORMULATION_MODE_START') {
                messages = [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content: 'Клиент выбрал "Нужна помощь с формулировкой". Начни диалог.'
                    }
                ];
            } else {
                // Добавляем историю разговора (последние 6 сообщений)
                messages = [
                    { role: 'system', content: systemPrompt },
                    ...conversation.slice(-6),
                    { role: 'user', content: message }
                ];
            }
            
            logger.info('Отправка запроса к GPT в режиме формулировки');
            
            // Вызов GPT
            const assistantMessage = await AdvancedGPTService.callOpenAIWithPrompt(messages);
            
            logger.info('GPT ответ получен', { 
                responseLength: assistantMessage.length,
                hasEstimate: !!estimate
            });
            
            // Если есть смета, показываем сообщение о ней
            const finalMessage = estimateMessage || assistantMessage;
            
            // Сохраняем в Conversation если доступно
            if (sessionId && Conversation) {
                try {
                    let conv = await Conversation.findBySessionId(sessionId);
                    if (!conv) {
                        conv = new Conversation({
                            sessionId,
                            mode: 'formulation',
                            stage: 'requirements'
                        });
                    }
                    
                    if (message !== 'FORMULATION_MODE_START') {
                        conv.addMessage('user', message);
                    }
                    conv.addMessage('assistant', finalMessage);
                    await conv.save();
                } catch (dbError) {
                    logger.error('Ошибка сохранения диалога формулировки:', dbError);
                }
            }
            
            logger.info('Отправка ответа в режиме формулировки');
            
            res.json({
                success: true,
                message: finalMessage,
                mode: 'formulation',
                hasEstimate: !!estimate
            });
            
        } catch (error) {
            logger.error('Ошибка в режиме формулировки:', error);
            
            res.status(500).json({
                success: false,
                error: 'Ошибка обработки запроса в режиме формулировки',
                message: 'Произошла ошибка. Попробуйте еще раз или свяжитесь с поддержкой.'
            });
        }
    }

    // Генерация технического задания
    async generateSpecification(req, res) {
        try {
            const { conversation, sessionId } = req.body;
            
            if (!conversation || conversation.length === 0) {
                return res.status(400).json({
                    error: 'История диалога обязательна'
                });
            }

            logger.info('Генерация ТЗ', { 
                conversationLength: conversation.length,
                sessionId 
            });

            const specification = AdvancedGPTService.createFallbackSpec(conversation);

            // Сохраняем ТЗ в БД если доступно
            if (sessionId && Conversation) {
                try {
                    const conv = await Conversation.findBySessionId(sessionId);
                    if (conv) {
                        conv.specification = specification;
                        conv.specificationCreatedAt = new Date();
                        await conv.save();
                    }
                } catch (dbError) {
                    logger.error('Ошибка сохранения ТЗ:', dbError);
                }
            }

            res.json({
                success: true,
                specification: specification
            });

        } catch (error) {
            logger.error('Ошибка генерации ТЗ:', error);
            res.status(500).json({
                error: 'Ошибка создания технического задания'
            });
        }
    }

    // Отправка уведомления о лиде
    async sendLeadNotification(req, res) {
        try {
            const { formData, sessionId } = req.body;
            
            if (!formData) {
                return res.status(400).json({
                    error: 'Данные формы обязательны'
                });
            }

            logger.info('Отправка уведомления о лиде', { sessionId });

            // Отправляем в Telegram
            await TelegramService.sendLeadNotification(formData, sessionId);

            res.json({
                success: true,
                message: 'Уведомление отправлено'
            });

        } catch (error) {
            logger.error('Ошибка отправки уведомления:', error);
            res.status(500).json({
                error: 'Ошибка отправки уведомления'
            });
        }
    }
}

module.exports = new FormulationController(); 