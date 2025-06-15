const GPTService = require('../services/GPTService');
const EstimateService = require('../services/EstimateService');
const VoiceService = require('../services/VoiceService');
const AnalyticsService = require('../services/AnalyticsService');
const TelegramService = require('../services/TelegramService');
const AdvancedGPTService = require('../services/AdvancedGPTService');
const { PreChatForm, Conversation } = require('../models');
const logger = require('../utils/logger');
const PreChatService = require('../services/PreChatService');

class ChatController {
    // Обработка отправки формы
    async handleFormSubmission(req, res) {
        try {
            console.log('🔍 handleFormSubmission - начало');
            console.log('🔍 Тело запроса:', req.body);
            
            const { 
                name, 
                position, 
                industry, 
                budget, 
                timeline, 
                preferredChannels, 
                contacts,
                fingerprint 
            } = req.body;

            logger.info('Получена форма анкеты', { name, industry });

            // Валидация
            if (!name || !position || !industry || !budget || !timeline) {
                console.log('❌ Ошибка валидации - отсутствуют поля');
                return res.status(400).json({
                    success: false,
                    error: 'Заполните все обязательные поля'
                });
            }

            console.log('✅ Валидация пройдена');

            // Создаем уникальный ID сессии
            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Данные формы
            const formData = {
                name,
                position,
                industry,
                budget,
                timeline,
                preferredChannels: preferredChannels || [],
                contacts: contacts || {},
                fingerprint: fingerprint || 'unknown'
            };

            console.log('📝 Данные формы:', formData);

            // Создаем сессию через PreChatService
            console.log('🔄 Создаем сессию через PreChatService...');
            const result = await PreChatService.createSession(formData);
            
            console.log('📊 Результат создания сессии:', result);
            
            if (!result.success) {
                throw new Error(result.error || 'Ошибка создания сессии');
            }

            // Генерируем приветственное сообщение через PreChatService
            console.log('💬 Генерируем приветственное сообщение...');
            const contextualPrompt = PreChatService.buildContextualPrompt(formData);
            
            // Получаем приветственное сообщение от GPT
            console.log('🤖 Запрос к GPT...');
            const welcomeMessage = await GPTService.chat([
                { role: 'system', content: contextualPrompt }
            ]);

            console.log('✅ GPT ответил');

            // Сохраняем первое сообщение
            await PreChatService.addMessageToHistory(
                result.sessionId,
                'assistant',
                welcomeMessage,
                { messageType: 'text' }
            );

            // Аналитика
            AnalyticsService.addEvent('form_submitted', result.sessionId, {
                industry,
                budget,
                timeline
            });

            logger.info('Форма обработана успешно', { sessionId: result.sessionId });

            res.json({
                success: true,
                sessionId: result.sessionId,
                welcomeMessage: welcomeMessage
            });

        } catch (error) {
            console.error('❌ ПОЛНАЯ ОШИБКА в handleFormSubmission:', error);
            logger.error('Ошибка обработки формы:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка обработки формы'
            });
        }
    }

    // Обработка сообщений в чате (АНКЕТНЫЙ ЧАТ) - ИСПРАВЛЕНО
    async handleChatMessage(req, res) {
        try {
            const { sessionId, message } = req.body;

            if (!sessionId || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'Не указан ID сессии или сообщение'
                });
            }

            logger.info('📨 Обработка сообщения в анкетном чате', {
                sessionId,
                message: message.slice(0, 50)
            });

            // Находим сессию в PreChatForm
            const session = await PreChatForm.findOne({ sessionId });
            if (!session) {
                return res.status(404).json({
                    success: false,
                    error: 'Сессия не найдена'
                });
            }

            // УБРАЛИ ПРОВЕРКУ НА 5 МИНУТ - сразу переходим к обработке

            // Находим разговор
            let conversation = null;
            if (Conversation) {
                conversation = await Conversation.findBySessionId(sessionId);
            }

            // Аналитика
            AnalyticsService.addEvent('message_sent', sessionId, {
                messageLength: message.length
            });

            // Подготавливаем контекст для GPT
            const chatHistory = session.chatHistory || [];
            const systemPrompt = AdvancedGPTService.buildSystemPrompt('chat', chatHistory.length);
            
            const messages = [
                { role: 'system', content: systemPrompt },
                ...chatHistory.slice(-10),
                { role: 'user', content: message }
            ];

            // Получаем ответ от GPT
            const gptResponse = await AdvancedGPTService.callOpenAIWithPrompt(messages);

            // Сохраняем историю чата через PreChatService
            await PreChatService.addMessageToHistory(
                sessionId,
                'user',
                message,
                { messageType: 'text' }
            );
            
            await PreChatService.addMessageToHistory(
                sessionId,
                'assistant',
                gptResponse,
                { messageType: 'text' }
            );

            // Сохраняем в Conversation если доступно
            if (conversation) {
                conversation.addMessage('user', message);
                conversation.addMessage('assistant', gptResponse);
                await conversation.save();
            }

            // ИСПРАВЛЕННАЯ ПРОВЕРКА НА ГЕНЕРАЦИЮ СМЕТЫ
            let finalResponse = gptResponse;
            let hasEstimate = false;

            // Проверяем, нужно ли генерировать смету
            logger.info('🔍 Проверяем необходимость генерации сметы...');
            
            // Анализируем намерение пользователя
            const shouldCalculate = await this.analyzeEstimateIntent(message, chatHistory);
            
            if (shouldCalculate) {
                logger.info('✅ Обнаружено намерение рассчитать смету');
                
                // Проверяем готовность функционала
                const functionalityReady = await this.checkFunctionalityReadiness(chatHistory);
                
                if (functionalityReady) {
                    logger.info('🚀 Функционал готов - генерируем смету', { sessionId });
                    
                    try {
                        // Генерируем смету - передаем полную историю чата напрямую
                        logger.info('📝 Передаем историю чата для генерации сметы', { 
                            historyLength: chatHistory.length
                        });
                        
                        // Генерируем смету - передаем только историю чата
                        const estimate = await EstimateService.calculateProjectEstimate(chatHistory);
                        
                        if (estimate) {
                            logger.info('💰 Смета сгенерирована', {
                                totalCost: estimate?.totalCost || 0,
                                totalHours: estimate?.totalHours || 0,
                                hasComponents: !!estimate?.components,
                                componentsCount: estimate?.components?.length || 0
                            });
                            
                            // Отправляем в Telegram
                            const sent = await TelegramService.sendEstimateToTelegram(estimate, sessionId);
                            
                            if (sent) {
                                logger.info('✅ Смета успешно отправлена менеджеру', { sessionId });
                                hasEstimate = true;
                                
                                // Заменяем ответ на сообщение об отправке сметы
                                finalResponse = `Отлично! Я подготовил детальную смету на основе нашего обсуждения.

    📋 Смета отправлена менеджеру на согласование. 

    После утверждения (обычно это занимает 10-15 минут) вы получите:
    - Детальную смету с точной стоимостью
    - Разбивку по всем функциям и срокам
    - Возможность внести корректировки

    Пока ждем ответа менеджера, скажите - хотите что-то добавить или изменить в функционале?`;
                                
                                try {
                                    // Обновляем статус сессии
                                    session.estimateSent = true;
                                    session.estimateSentAt = new Date();
                                    session.estimateData = {
                                        totalCost: estimate?.totalCost || 0,
                                        totalHours: estimate?.totalHours || 0,
                                        features: estimate?.detectedFeatures || [],
                                        componentsCount: estimate?.components?.length || 0,
                                        estimateId: estimate?._id || 'temp',
                                        sentToTelegram: true,
                                        // НОВОЕ: Сохраняем полные компоненты для PDF
                                        components: estimate?.components || [],
                                        timeline: estimate?.timeline || '2-3 недели',
                                        businessType: estimate?.businessType || '',
                                        recommendations: estimate?.recommendations || []
                                    };
                                    
                                    await session.save();
                                    
                                    logger.info('✅ Статус сессии обновлен', { 
                                        sessionId,
                                        estimateSent: true,
                                        componentsCount: estimate?.components?.length || 0
                                    });
                                    
                                } catch (saveError) {
                                    logger.error('⚠️ Ошибка сохранения статуса сессии:', saveError);
                                }
                                
                            } else {
                                logger.error('❌ Не удалось отправить смету в Telegram', { sessionId });
                                finalResponse = gptResponse + '\n\n⚠️ К сожалению, возникла техническая проблема с отправкой сметы менеджеру. Попробуйте написать "рассчитай смету" еще раз.';
                            }
                        }
                    } catch (estimateError) {
                        logger.error('❌ Ошибка генерации сметы:', estimateError);
                        finalResponse = gptResponse;
                    }
                } else {
                    logger.info('⏳ Функционал еще не готов для генерации сметы');
                }
            }

            // Проверяем, есть ли утвержденная смета, которую нужно показать
            let approvedEstimate = null;
            if (session.estimateApproved) {
                // Находим сообщение с утвержденной сметой
                const estimateMessage = session.chatHistory
                    .filter(msg => msg.metadata && msg.metadata.messageType === 'approved_estimate')
                    .pop();
                
                if (estimateMessage) {
                    approvedEstimate = {
                        message: estimateMessage.content,
                        approvedAt: estimateMessage.metadata.approvedAt,
                        estimateId: estimateMessage.metadata.estimateId,
                        pdfPath: estimateMessage.metadata.pdfPath || null
                    };
                    
                    // Помечаем, что смета доставлена клиенту
                    session.estimateDeliveredToClient = true;
                    session.estimateDeliveredAt = new Date();
                    await session.save();
                    
                    logger.info('Утвержденная смета доставлена клиенту', { sessionId });
                }
            }

            res.json({
                success: true,
                message: finalResponse,
                hasEstimate: hasEstimate,
                estimateAlreadySent: session.estimateSent ? true : false,
                // Добавляем информацию об утвержденной смете
                approvedEstimate: approvedEstimate
            });

        } catch (error) {
            logger.error('Ошибка обработки сообщения:', error);
            res.status(500).json({
                success: false,
                error: 'Не удалось обработать сообщение'
            });
        }
    }

    // УПРОЩЕННЫЙ анализ намерения пользователя для генерации сметы
    async analyzeEstimateIntent(message, chatHistory) {
        try {
            logger.info('🔍 Анализируем намерение пользователя для сметы через GPT');
            
            // Передаем chatHistory напрямую, это уже массив сообщений
            const shouldCalculate = await AdvancedGPTService.analyzeUserIntent(message, chatHistory);
            
            logger.info('📊 Результат анализа GPT:', { shouldCalculate });
            
            return shouldCalculate;
            
        } catch (error) {
            logger.error('Ошибка анализа намерения:', error);
            return false;
        }
    }

    // УПРОЩЕННАЯ проверка готовности функционала для генерации сметы
    async checkFunctionalityReadiness(chatHistory) {
        try {
            logger.info('🔍 Проверяем готовность функционала для сметы');
            
            // Передаем chatHistory напрямую
            const isReady = await AdvancedGPTService.checkFunctionalityReadiness(chatHistory);
            
            logger.info('📊 Результат проверки готовности:', { isReady });
            
            return isReady;
            
        } catch (error) {
            logger.error('Ошибка проверки готовности:', error);
            return false;
        }
    }

    // Обработка голосовых сообщений
    async handleVoiceMessage(req, res) {
        try {
            const { sessionId } = req.body;
            const audioFile = req.file;

            if (!sessionId) {
                return res.status(400).json({
                    success: false,
                    error: 'Не указан ID сессии'
                });
            }

            if (!audioFile) {
                return res.status(400).json({
                    success: false,
                    error: 'Аудио файл не найден'
                });
            }

            // Валидация файла
            VoiceService.validateAudioFile(audioFile);

            // Транскрибируем аудио
            const transcription = await VoiceService.transcribeAudio(audioFile.path);

            if (!transcription.trim()) {
                return res.status(400).json({
                    success: false,
                    error: 'Не удалось распознать речь'
                });
            }

            // Находим сессию
            const session = await PreChatForm.findOne({ sessionId });
            if (!session) {
                return res.status(404).json({
                    success: false,
                    error: 'Сессия не найдена'
                });
            }

            // Аналитика
            AnalyticsService.addEvent('voice_message_sent', sessionId, {
                transcriptionLength: transcription.length
            });

            // Обрабатываем как обычное текстовое сообщение
            const systemPrompt = this.buildSystemPrompt(session.chatHistory.length);
            const messages = [
                { role: 'system', content: systemPrompt },
                ...session.chatHistory.slice(-10),
                { role: 'user', content: transcription }
            ];

            const gptResponse = await GPTService.chat(messages);

            // Сохраняем историю
            session.chatHistory.push(
                { 
                    role: 'user', 
                    content: transcription,
                    timestamp: new Date(),
                    metadata: { messageType: 'text' }
                },
                { 
                    role: 'assistant', 
                    content: gptResponse,
                    timestamp: new Date(),
                    metadata: { messageType: 'text' }
                }
            );

            await session.save();

            res.json({
                success: true,
                transcription: transcription,
                message: gptResponse
            });

        } catch (error) {
            logger.error('Ошибка обработки голосового сообщения:', error);
            res.status(500).json({
                success: false,
                error: 'Не удалось обработать голосовое сообщение'
            });
        }
    }

    // Проверка существующей сессии
    async checkSession(req, res) {
        try {
            const { fingerprint } = req.body;

            // Проверяем, доступна ли база данных
            if (!PreChatForm) {
                return res.json({
                    success: true,
                    sessionFound: false,
                    message: 'База данных недоступна, создайте новую сессию'
                });
            }

            const session = await PreChatForm.findOne({ 
                fingerprint, 
                isActive: true 
            }).sort({ lastActivity: -1 });

            if (session) {
                res.json({
                    success: true,
                    sessionFound: true,
                    sessionId: session.sessionId,
                    formData: {
                        name: session.name,
                        position: session.position,
                        industry: session.industry
                    }
                });
            } else {
                res.json({
                    success: true,
                    sessionFound: false
                });
            }

        } catch (error) {
            logger.error('Ошибка проверки сессии:', error);
            res.status(500).json({
                success: false,
                error: 'Не удалось проверить сессию'
            });
        }
    }

    // Получение истории чата
    async getChatHistory(req, res) {
        try {
            const { sessionId } = req.params;

            // Проверяем доступность базы данных
            if (!PreChatForm) {
                return res.json({
                    success: true,
                    chatHistory: [],
                    message: 'История недоступна - база данных не подключена'
                });
            }

            const session = await PreChatForm.findOne({ sessionId });

            if (!session) {
                return res.status(404).json({
                    success: false,
                    error: 'Сессия не найдена'
                });
            }

            res.json({
                success: true,
                chatHistory: session.chatHistory || []
            });

        } catch (error) {
            logger.error('Ошибка получения истории:', error);
            res.status(500).json({
                success: false,
                error: 'Не удалось получить историю чата'
            });
        }
    }

    // Основной чат с GPT (для обычного чата, не анкетного)
    async handleChat(req, res) {
        try {
            logger.info('Запрос к GPT ассистенту');
            const { message, conversation = [], sessionId, mode } = req.body;
            
            // Проверка на режим формулировки
            if (mode === 'formulation' || message === 'FORMULATION_MODE_START') {
                const FormulationController = require('./FormulationController');
                return FormulationController.handleFormulationMode(req, res);
            }

            // Валидация входных данных
            if (!message || typeof message !== 'string') {
                return res.status(400).json({
                    error: 'Сообщение обязательно для заполнения',
                    success: false
                });
            }

            if (message.length > 1000) {
                return res.status(400).json({
                    error: 'Слишком длинное сообщение',
                    success: false
                });
            }

            // НОВОЕ: Загружаем историю из БД если она не передана
            let actualConversation = conversation;
            if (sessionId && Conversation && (!conversation || conversation.length === 0)) {
                try {
                    const savedConv = await Conversation.findBySessionId(sessionId);
                    if (savedConv && savedConv.messages) {
                        // Преобразуем сообщения из БД в нужный формат
                        actualConversation = savedConv.messages.map(msg => ({
                            role: msg.role,
                            content: msg.content
                        }));
                        logger.info('История загружена из БД', { 
                            sessionId, 
                            messagesCount: actualConversation.length 
                        });
                    }
                } catch (dbError) {
                    logger.error('Ошибка загрузки истории из БД:', dbError);
                }
            }

            logger.info('Обработка сообщения', { 
                messageLength: message.length,
                conversationLength: actualConversation.length 
            });

            // Сохранение диалога в MongoDB если доступно
            if (sessionId && Conversation) {
                try {
                    let conv = await Conversation.findBySessionId(sessionId);
                    if (!conv) {
                        conv = new Conversation({
                            sessionId,
                            mode: mode || 'chat',
                            metadata: {
                                ip: req.ip,
                                userAgent: req.get('User-Agent')
                            }
                        });
                    }
                    conv.addMessage('user', message);
                    await conv.save();
                } catch (dbError) {
                    logger.error('Ошибка сохранения в БД:', dbError);
                }
            }

            // Проверяем потребность в расчете сметы
            const shouldCalculate = await AdvancedGPTService.analyzeUserIntent(message, actualConversation);
            
            let estimate = null;
            let estimateMessage = '';

            if (shouldCalculate) {
                const functionalityReady = await AdvancedGPTService.checkFunctionalityReadiness(actualConversation);
                
                if (functionalityReady) {
                    logger.info('Все условия выполнены - запускаем расчет сметы');
                    
                    estimate = await EstimateService.calculateProjectEstimate(actualConversation);
                    
                    // Отправляем в Telegram
                    await TelegramService.sendEstimateToTelegram(estimate, sessionId);
                    
                    // Сохраняем смету в БД
                    if (sessionId && Conversation) {
                        try {
                            const conv = await Conversation.findBySessionId(sessionId);
                            if (conv) {
                                conv.setEstimate(estimate);
                                await conv.save();
                            }
                        } catch (dbError) {
                            logger.error('Ошибка сохранения сметы:', dbError);
                        }
                    }
                    
                    estimateMessage = `Отлично! Я подготовил смету на основе нашего обсуждения и отправил её менеджеру на согласование. 
                    
После утверждения смета придёт сюда в чат, а также будет продублирована по вашему предпочтительному каналу связи. Обычно это занимает 10-15 минут.

Хотите что-то добавить или изменить в функционале?`;
                }
            }

            // Формируем сообщения для GPT
            const systemPrompt = AdvancedGPTService.buildSystemPrompt(mode, actualConversation.length);
            let messages = [
                { role: 'system', content: systemPrompt }
            ];

            // Добавляем историю (последние 6 сообщений)
            messages = messages.concat(actualConversation.slice(-6));
            messages.push({ role: 'user', content: message });

            // Вызываем GPT
            const assistantMessage = await AdvancedGPTService.callOpenAIWithPrompt(messages);

            logger.info('GPT ответ сформирован', { 
                hasEstimate: !!estimate,
                responseLength: assistantMessage.length 
            });

            // Формируем финальный ответ
            let finalMessage = assistantMessage;
            if (estimateMessage) {
                finalMessage = estimateMessage;
            }

            // Сохраняем ответ ассистента в БД
            if (sessionId && Conversation) {
                try {
                    const conv = await Conversation.findBySessionId(sessionId);
                    if (conv) {
                        conv.addMessage('assistant', finalMessage);
                        await conv.save();
                    }
                } catch (dbError) {
                    logger.error('Ошибка сохранения ответа:', dbError);
                }
            }

            res.json({
                success: true,
                message: finalMessage,
                estimate: estimate,
                hasEstimate: !!estimate,
                // НОВОЕ: Возвращаем актуальную историю для синхронизации
                conversation: actualConversation.concat([
                    { role: 'user', content: message },
                    { role: 'assistant', content: finalMessage }
                ])
            });

        } catch (error) {
            logger.error('Ошибка в GPT ассистенте:', error);
            
            res.status(500).json({
                error: 'Ошибка AI',
                success: false,
                message: 'Произошла ошибка. Попробуйте еще раз или свяжитесь с поддержкой.'
            });
        }
    }

    // Простой чат (для совместимости)
    async simpleChat(req, res) {
        try {
            const { message } = req.body;
            
            if (!message) {
                return res.status(400).json({
                    error: 'Сообщение обязательно'
                });
            }

            const messages = [
                { role: 'user', content: message }
            ];

            const response = await GPTService.chat(messages);

            res.json({
                success: true,
                message: response
            });

        } catch (error) {
            logger.error('Ошибка простого чата:', error);
            res.status(500).json({
                error: 'Ошибка обработки сообщения'
            });
        }
    }

    // Расчет сметы (прямой запрос)
    async calculateEstimate(req, res) {
        try {
            const { requirements, conversation = [], sessionId } = req.body;
            
            if (!requirements && conversation.length === 0) {
                return res.status(400).json({
                    error: 'Требования обязательны для расчета'
                });
            }

            logger.info('Расчет сметы по запросу');

            // ИСПРАВЛЕНО: Передаем требования и диалог
            const estimate = await EstimateService.calculateProjectEstimate(requirements, conversation);
            
            if (estimate && sessionId) {
                // Отправляем менеджеру
                await TelegramService.sendEstimateToManager(estimate, sessionId);
            }

            res.json({
                success: true,
                estimate: estimate,
                message: 'Смета рассчитана и отправлена менеджеру'
            });

        } catch (error) {
            logger.error('Ошибка расчета сметы:', error);
            res.status(500).json({
                error: 'Ошибка расчета сметы'
            });
        }
    }

    // Отправка утвержденной сметы
    async sendApprovedEstimate(req, res) {
        try {
            const { estimateId, sessionId } = req.body;
            
            if (!estimateId || !sessionId) {
                return res.status(400).json({
                    error: 'Требуются estimateId и sessionId'
                });
            }

            logger.info('Отправка утвержденной сметы', { estimateId, sessionId });

            // Здесь можно добавить логику отправки клиенту
            
            res.json({
                success: true,
                message: 'Смета отправлена клиенту',
                sentChannels: ['веб-интерфейс']
            });

        } catch (error) {
            logger.error('Ошибка отправки утвержденной сметы:', error);
            res.status(500).json({
                error: 'Ошибка отправки сметы'
            });
        }
    }

    // Проверка утвержденной сметы
    async checkApprovedEstimate(req, res) {
        try {
            const { sessionId } = req.params;
            
            if (!sessionId) {
                return res.status(400).json({
                    success: false,
                    error: 'ID сессии обязателен'
                });
            }
            
            logger.info('Проверка утвержденной сметы', { sessionId });
            
            // Находим сессию
            const session = await PreChatForm.findOne({ sessionId });
            
            if (!session) {
                return res.status(404).json({
                    success: false,
                    error: 'Сессия не найдена'
                });
            }
            
            // Проверяем, есть ли утвержденная смета
            if (session.estimateApproved && session.approvedEstimateId) {
                // Находим последнее сообщение со сметой
                const estimateMessage = session.chatHistory
                    .filter(msg => msg.metadata && msg.metadata.messageType === 'approved_estimate')
                    .pop();
                
                if (estimateMessage) {
                    logger.info('Найдена утвержденная смета', { 
                        sessionId,
                        estimateId: session.approvedEstimateId 
                    });
                    
                    return res.json({
                        success: true,
                        hasApprovedEstimate: true,
                        estimate: {
                            message: estimateMessage.content,
                            approvedAt: estimateMessage.metadata.approvedAt,
                            estimateId: estimateMessage.metadata.estimateId,
                            pdfPath: estimateMessage.metadata.pdfPath || null
                        }
                    });
                }
            }
            
            // Смета еще не утверждена
            res.json({
                success: true,
                hasApprovedEstimate: false
            });
            
        } catch (error) {
            logger.error('Ошибка проверки утвержденной сметы:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка проверки сметы'
            });
        }
    }

    // Получение случайного промпта
    async getRandomPrompt(req, res) {
        try {
            const prompt = AdvancedGPTService.getRandomPrompt();
            
            res.json({
                success: true,
                prompt: prompt
            });

        } catch (error) {
            logger.error('Ошибка получения случайного промпта:', error);
            res.status(500).json({
                error: 'Ошибка получения промпта'
            });
        }
    }

    // === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===

    // Построение системного промпта в зависимости от стадии диалога
    buildSystemPrompt(conversationLength) {
        const basePrompt = `Ты - эксперт по созданию Telegram-ботов с опытом 5+ лет. Помогаешь клиентам создать техническое задание и рассчитать стоимость разработки.

ТВОЙ ПОДХОД:
1. Быстро понять бизнес клиента (1-2 вопроса)
2. Выяснить основные задачи бота (2-3 вопроса)
3. Уточнить дополнительные функции и интеграции
4. При готовности - предложить расчет стоимости

ПРИНЦИПЫ:
- Задавай конкретные вопросы, избегай общих фраз
- Предлагай функции исходя из ниши клиента
- НЕ называй конкретные цены или суммы
- После 6+ сообщений с деталями предложи расчет сметы

ВАЖНО: Когда клиент готов к расчету - скажи "Отлично! У меня достаточно информации. Готовы рассчитать стоимость разработки?"`;

        // Адаптируем промпт под стадию диалога
        if (conversationLength < 3) {
            return basePrompt + `\n\nСТАДИЯ: Знакомство. Узнай основные задачи бота.`;
        } else if (conversationLength < 6) {
            return basePrompt + `\n\nСТАДИЯ: Детализация. Уточни конкретные функции.`;
        } else {
            return basePrompt + `\n\nСТАДИЯ: Завершение. Можешь предложить расчет сметы.`;
        }
    }

    // Генерация технического задания
    async generateSpecification(req, res) {
        try {
            const { conversation } = req.body;
            
            if (!conversation || conversation.length === 0) {
                return res.status(400).json({
                    error: 'История диалога обязательна'
                });
            }

            const specification = AdvancedGPTService.createFallbackSpec(conversation);

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

    // Получение истории анкетного чата
    async getPreChatHistory(req, res) {
        try {
            const { sessionId } = req.params;
            
            logger.info('Запрос истории анкетного чата', { sessionId });
            
            // Получаем сессию через PreChatService
            const session = await PreChatService.getSession(sessionId);
            
            if (!session) {
                logger.warn('Сессия не найдена', { sessionId });
                return res.status(404).json({
                    success: false,
                    error: 'Сессия не найдена'
                });
            }

            // Возвращаем все сообщения из истории
            const chatHistory = session.chatHistory.map(msg => ({
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp,
                metadata: msg.metadata
            }));

            res.json({
                success: true,
                formData: {
                    name: session.name,
                    position: session.position,
                    industry: session.industry,
                    budget: session.budget,
                    timeline: session.timeline,
                    preferredChannels: session.preferredChannels,
                    contacts: session.contacts
                },
                chatHistory: chatHistory,
                leadScore: session.leadScore || 0,
                status: session.status || 'active',
                estimateSent: session.estimateSent || false
            });
            
        } catch (error) {
            logger.error('Ошибка получения истории анкетного чата:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка получения истории чата'
            });
        }
    }
}

module.exports = new ChatController();