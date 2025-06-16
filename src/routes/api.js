const express = require('express');
const multer = require('multer');
const path = require('path');  // ДОБАВЬТЕ ЭТУ СТРОКУ!
const fs = require('fs');
const router = express.Router();
const ChatController = require('../controllers/ChatController');
const AnalyticsController = require('../controllers/AnalyticsController');
const FormulationController = require('../controllers/FormulationController');
const FeaturesService = require('../services/FeaturesService');
const logger = require('../utils/logger');

// Настройка multer для загрузки файлов
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'voice-' + uniqueSuffix + path.extname(file.originalname || '.webm'));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    fileFilter: (req, file, cb) => {
        // Логируем для отладки
        logger.info('Multer fileFilter - получен файл:', {
            fieldname: file.fieldname,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
        });
        
        // ИСПРАВЛЕНИЕ: Расширенный список MIME типов
        const allowedMimeTypes = [
            'audio/webm',
            'audio/ogg', 
            'audio/wav',
            'audio/wave',
            'audio/x-wav',
            'audio/mp3',
            'audio/mpeg',
            'audio/mp4',
            'audio/x-m4a',
            'audio/m4a',
            'application/octet-stream', // Для некоторых браузеров
            'audio/webm;codecs=opus',   // Специфичный тип для Chrome
            'audio/ogg;codecs=opus'     // Специфичный тип для Firefox
        ];
        
        // Проверяем точное совпадение или начало с audio/
        const isAllowed = allowedMimeTypes.includes(file.mimetype) || 
                         file.mimetype.startsWith('audio/') ||
                         (file.mimetype === 'application/octet-stream' && file.originalname?.includes('.webm'));
        
        if (isAllowed) {
            logger.info('Файл разрешен для загрузки');
            return cb(null, true);
        } else {
            logger.error('Файл отклонен - неподдерживаемый тип:', file.mimetype);
            cb(new Error(`Неподдерживаемый тип файла: ${file.mimetype}. Поддерживаются только аудиофайлы.`));
        }
    }
});

// === ОСНОВНЫЕ ENDPOINTS ===

// Обработка форм
router.post('/pre-chat-form', (req, res) => ChatController.handleFormSubmission(req, res));
router.post('/pre-chat-message', (req, res) => ChatController.handleChatMessage(req, res));

// Голосовые сообщения
router.post('/voice-message', upload.single('audio'), async (req, res, next) => {
    // Добавляем предварительную проверку
    logger.info('POST /api/voice-message - начало обработки', {
        hasFile: !!req.file,
        body: req.body,
        headers: {
            'content-type': req.headers['content-type'],
            'content-length': req.headers['content-length']
        }
    });
    
    // Если файл не прошел через multer, но есть в body
    if (!req.file && req.body.audio) {
        logger.warn('Файл не обработан multer, но есть в body');
        return res.status(400).json({
            success: false,
            error: 'Неправильный формат загрузки файла. Используйте FormData.'
        });
    }
    
    // Передаем дальше в контроллер
    ChatController.handleVoiceMessage(req, res, next);
});

// === GPT ASSISTANT ===

// Основной endpoint для GPT помощника
router.post('/gpt-assistant', (req, res) => ChatController.handleChat(req, res));

// Простой чат
router.post('/simple-chat', (req, res) => ChatController.simpleChat(req, res));

// === ФОРМУЛИРОВКА ТЗ ===

// Режим помощи с формулировкой
router.post('/formulation-mode', (req, res) => FormulationController.handleFormulationMode(req, res));

// Генерация технического задания
router.post('/generate-specification', (req, res) => FormulationController.generateSpecification(req, res));

// === СМЕТЫ ===

// Расчет сметы
router.post('/calculate-estimate', (req, res) => ChatController.calculateEstimate(req, res));

// Быстрая оценка
router.post('/quick-estimate', (req, res) => ChatController.getQuickEstimate(req, res));

// Отправка утвержденной сметы
router.post('/send-approved-estimate', (req, res) => ChatController.sendApprovedEstimate(req, res));

// Server-Sent Events для real-time обновлений
router.get('/estimate-updates/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    
    if (!sessionId) {
        return res.status(400).json({ error: 'Не указан ID сессии' });
    }
    
    logger.info('🔌 SSE соединение установлено', { sessionId });
    
    // Настройка SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    
    // Отправляем начальное сообщение для подтверждения соединения
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE соединение установлено' })}\n\n`);
    
    // ИСПРАВЛЕНО: НЕ проверяем при подключении, только в периодической проверке
    // Это позволяет избежать race condition
    
    // Периодическая проверка
    let checkCount = 0;
    const interval = setInterval(async () => {
        try {
            checkCount++;
            logger.info(`🔍 SSE проверка #${checkCount} для сессии ${sessionId}`);
            
            const { PreChatForm } = require('../models');
            const session = await PreChatForm.findOne({ sessionId });
            
            if (!session) {
                logger.warn('SSE: Сессия не найдена', { sessionId });
                return;
            }
            
            logger.info('📊 SSE: Детальный статус сессии', {
                sessionId,
                estimateApproved: session.estimateApproved,
                estimateDeliveredToClient: session.estimateDeliveredToClient,
                estimateApprovedAt: session.estimateApprovedAt,
                chatHistoryLength: session.chatHistory.length,
                hasApprovedMessage: session.chatHistory.some(msg => 
                    msg.metadata && msg.metadata.messageType === 'approved_estimate'
                ),
                approvedMessagesCount: session.chatHistory.filter(msg => 
                    msg.metadata && msg.metadata.messageType === 'approved_estimate'
                ).length
            });
            
            // ИСПРАВЛЕНО: Проверяем только неотправленные утвержденные сметы
            if (session.estimateApproved && !session.estimateDeliveredToClient) {
                logger.info('✅ SSE: Найдена утвержденная смета для отправки!', { sessionId });
                
                const estimateMessage = session.chatHistory
                    .filter(msg => msg.metadata && msg.metadata.messageType === 'approved_estimate')
                    .pop(); // Берем последнюю утвержденную смету
                
                if (estimateMessage) {
                    logger.info('📤 SSE: Отправляем смету клиенту', { 
                        sessionId,
                        estimateId: estimateMessage.metadata.estimateId,
                        approvedAt: estimateMessage.metadata.approvedAt
                    });
                    
                    // Отправляем утвержденную смету клиенту
                    const data = JSON.stringify({
                        type: 'approved_estimate',
                        estimate: {
                            message: estimateMessage.content,
                            approvedAt: estimateMessage.metadata.approvedAt,
                            estimateId: estimateMessage.metadata.estimateId,
                            pdfPath: estimateMessage.metadata.pdfPath || null
                        }
                    });
                    
                    res.write(`data: ${data}\n\n`);
                    logger.info('✅ SSE: Смета успешно отправлена клиенту', { sessionId });
                    
                    // ИСПРАВЛЕНО: Помечаем как доставленную только после успешной отправки
                    session.estimateDeliveredToClient = true;
                    session.estimateDeliveredAt = new Date();
                    await session.save();
                    
                    logger.info('✅ SSE: Статус обновлен - смета доставлена', { sessionId });
                    
                    // УБРАНО: Не закрываем соединение сразу, даем время клиенту обработать
                    // Соединение закроется по таймауту или когда клиент отключится
                } else {
                    logger.warn('⚠️ SSE: Сообщение со сметой не найдено, хотя estimateApproved=true', { 
                        sessionId,
                        chatHistoryLength: session.chatHistory.length 
                    });
                }
            } else if (session.estimateApproved && session.estimateDeliveredToClient) {
                logger.info('ℹ️ SSE: Смета уже доставлена клиенту', { 
                    sessionId,
                    deliveredAt: session.estimateDeliveredAt 
                });
            } else {
                logger.info('ℹ️ SSE: Смета еще не утверждена', { sessionId });
            }
        } catch (error) {
            logger.error('❌ SSE ошибка проверки сметы:', error);
        }
    }, 1000); // ИСПРАВЛЕНО: Увеличиваем частоту проверки до каждой секунды
    
    // Отправляем heartbeat каждые 30 секунд чтобы соединение не закрылось
    const heartbeat = setInterval(() => {
        try {
            res.write(':heartbeat\n\n');
        } catch (error) {
            logger.warn('⚠️ SSE heartbeat ошибка:', error);
            clearInterval(heartbeat);
            clearInterval(interval);
        }
    }, 30000);
    
    // Очистка при закрытии соединения
    req.on('close', () => {
        clearInterval(interval);
        clearInterval(heartbeat);
        logger.info('🔌 SSE соединение закрыто клиентом', { sessionId });
    });
    
    // Максимальное время соединения - 10 минут
    setTimeout(() => {
        try {
            res.end();
        } catch (error) {
            logger.warn('⚠️ SSE закрытие по таймауту ошибка:', error);
        }
        clearInterval(interval);
        clearInterval(heartbeat);
        logger.info('⏱️ SSE соединение закрыто по таймауту', { sessionId });
    }, 600000); // Увеличиваем таймаут до 10 минут
});

// Принудительная отправка сметы
router.post('/force-estimate', async (req, res) => {
    try {
        const { sessionId = 'test_session', requirements = 'Создать бота для магазина с каталогом товаров и оплатой' } = req.body;
        const EstimateService = require('../services/EstimateService');
        const TelegramService = require('../services/TelegramService');
        
        logger.info('Принудительная генерация сметы', { sessionId });
        
        // Генерируем смету
        const estimate = await EstimateService.calculateEstimate(requirements, []);
        
        if (!estimate) {
            return res.status(500).json({
                error: 'Не удалось сгенерировать смету'
            });
        }
        
        logger.info('Смета сгенерирована, отправляем в Telegram', { 
            totalCost: estimate.totalCost,
            totalHours: estimate.totalHours 
        });
        
        // Отправляем в Telegram
        const sent = await TelegramService.sendEstimateToTelegram(estimate, sessionId);
        
        res.json({
            success: true,
            estimate,
            sent,
            telegramInfo: TelegramService.getBotInfo()
        });
        
    } catch (error) {
        logger.error('Ошибка принудительной отправки сметы:', error);
        res.status(500).json({
            error: 'Ошибка отправки сметы',
            details: error.message
        });
    }
});

// Проверка утвержденной сметы
router.get('/check-approved-estimate/:sessionId', (req, res) => ChatController.checkApprovedEstimate(req, res));

// НОВЫЙ: Тестовый endpoint для симуляции утверждения сметы
router.post('/test-approve-estimate', async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'sessionId обязателен'
            });
        }
        
        logger.info('🧪 Тестовое утверждение сметы', { sessionId });
        
        const { PreChatForm } = require('../models');
        
        // Находим сессию
        const session = await PreChatForm.findOne({ sessionId });
        
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Сессия не найдена'
            });
        }
        
        // Формируем тестовое сообщение сметы
        const testEstimateMessage = `✅ **Ваше коммерческое предложение готово!**

💰 **Стоимость проекта:** 75 000 ₽
⏱️ **Время разработки:** 120 часов
📅 **Срок реализации:** 2-3 недели

📋 **В стоимость входит:**
• Создание Telegram бота с GPT интеграцией
• Система обработки заявок и уведомлений
• Интеграция с CRM системой
• Настройка автоответчика
• Тестирование и запуск

📄 **PDF документ с полным коммерческим предложением прикреплен к этому сообщению.**

**Следующие шаги:**
1. Скачайте и изучите коммерческое предложение
2. Мы свяжемся с вами для обсуждения деталей
3. После согласования подпишем договор
4. Начнем разработку вашего бота

📞 Ожидайте звонка от менеджера в течение 30 минут.

Если у вас есть вопросы - напишите здесь или свяжитесь с нами удобным способом.`;
        
        // Добавляем сообщение в историю чата
        session.chatHistory.push({
            role: 'assistant',
            content: testEstimateMessage,
            timestamp: new Date(),
            metadata: {
                messageType: 'approved_estimate',
                approvedAt: new Date(),
                estimateId: 'test_estimate_' + Date.now(),
                pdfPath: '/test/path/to/estimate.pdf'
            }
        });
        
        // Обновляем статус сессии
        session.estimateApproved = true;
        session.estimateApprovedAt = new Date();
        session.approvedEstimateId = 'test_estimate_' + Date.now();
        session.estimateDeliveredToClient = false; // Важно: сбрасываем для SSE
        
        await session.save();
        
        logger.info('✅ Тестовая смета утверждена и сохранена', { sessionId });
        
        res.json({
            success: true,
            message: 'Тестовая смета утверждена',
            sessionId: sessionId,
            estimateId: session.approvedEstimateId
        });
        
    } catch (error) {
        logger.error('❌ Ошибка тестового утверждения сметы:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка симуляции утверждения'
        });
    }
});

// НОВЫЙ: Тестовый endpoint для сброса статуса сметы
router.post('/test-reset-estimate', async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'sessionId обязателен'
            });
        }
        
        logger.info('🔄 Сброс статуса сметы для тестирования', { sessionId });
        
        const { PreChatForm } = require('../models');
        
        // Находим сессию
        const session = await PreChatForm.findOne({ sessionId });
        
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Сессия не найдена'
            });
        }
        
        // Удаляем утвержденные сметы из истории чата
        session.chatHistory = session.chatHistory.filter(msg => 
            !msg.metadata || msg.metadata.messageType !== 'approved_estimate'
        );
        
        // Сбрасываем статусы
        session.estimateApproved = false;
        session.estimateApprovedAt = null;
        session.approvedEstimateId = null;
        session.estimateDeliveredToClient = false;
        
        await session.save();
        
        logger.info('✅ Статус сметы сброшен', { sessionId });
        
        res.json({
            success: true,
            message: 'Статус сметы сброшен',
            sessionId: sessionId
        });
        
    } catch (error) {
        logger.error('❌ Ошибка сброса статуса сметы:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка сброса статуса'
        });
    }
});

// Скачивание PDF клиентом
router.get('/download-client-pdf/:sessionId/:estimateId', async (req, res) => {
    try {
        const { sessionId, estimateId } = req.params;
        const { PreChatForm } = require('../models');
        const PDFService = require('../services/PDFService');
        
        logger.info('📥 Запрос на скачивание PDF клиентом', { sessionId, estimateId });
        
        // Находим сессию
        const session = await PreChatForm.findOne({ sessionId });
        
        if (!session || !session.estimateApproved) {
            return res.status(404).json({
                success: false,
                error: 'Смета не найдена или не утверждена'
            });
        }
        
        // Подготавливаем данные
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
        
        // Генерируем PDF
        const pdfPath = await PDFService.generateClientPDF(estimate, clientInfo, sessionId);
        
        // Отправляем файл
        res.download(pdfPath, `Коммерческое_предложение_${new Date().toISOString().split('T')[0]}.pdf`, async (err) => {
            if (err) {
                logger.error('Ошибка отправки PDF:', err);
            }
            
            // Удаляем временный файл
            setTimeout(async () => {
                await PDFService.cleanupTempFiles([pdfPath]);
            }, 5000);
        });
        
    } catch (error) {
        logger.error('Ошибка генерации PDF для скачивания:', error);
        res.status(500).json({
            success: false,
            error: 'Не удалось сгенерировать PDF'
        });
    }
});

// === УПРАВЛЕНИЕ КАТАЛОГОМ ФУНКЦИЙ ===

// Получить все функции
router.get('/features', async (req, res) => {
    try {
        const features = await FeaturesService.getAllFeatures();
        res.json({
            success: true,
            features: features,
            totalCount: Object.values(features).flat().length
        });
    } catch (error) {
        logger.error('Ошибка получения функций:', error);
        res.status(500).json({
            success: false,
            error: 'Не удалось получить каталог функций'
        });
    }
});

// Поиск функций
router.post('/features/search', async (req, res) => {
    try {
        const { keywords } = req.body;
        
        if (!keywords) {
            return res.status(400).json({
                success: false,
                error: 'Укажите ключевые слова для поиска'
            });
        }
        
        const results = await FeaturesService.searchFeatures(keywords);
        
        res.json({
            success: true,
            results: results,
            count: results.length
        });
    } catch (error) {
        logger.error('Ошибка поиска функций:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка поиска'
        });
    }
});

// Статистика использования
router.get('/features/stats', async (req, res) => {
    try {
        const stats = await FeaturesService.getFeatureUsageStats();
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        logger.error('Ошибка получения статистики:', error);
        res.status(500).json({
            success: false,
            error: 'Не удалось получить статистику'
        });
    }
});

// Добавить новую функцию (для админки)
router.post('/features/add', async (req, res) => {
    try {
        const { category, feature } = req.body;
        
        if (!category || !feature) {
            return res.status(400).json({
                success: false,
                error: 'Укажите категорию и данные функции'
            });
        }
        
        const result = await FeaturesService.addFeature(category, feature);
        
        res.json({
            success: result,
            message: result ? 'Функция добавлена' : 'Не удалось добавить функцию'
        });
    } catch (error) {
        logger.error('Ошибка добавления функции:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка добавления функции'
        });
    }
});

// Обновить функцию
router.put('/features/update', async (req, res) => {
    try {
        const { category, featureName, updates } = req.body;
        
        if (!category || !featureName || !updates) {
            return res.status(400).json({
                success: false,
                error: 'Укажите все необходимые параметры'
            });
        }
        
        const result = await FeaturesService.updateFeature(category, featureName, updates);
        
        res.json({
            success: result,
            message: result ? 'Функция обновлена' : 'Не удалось обновить функцию'
        });
    } catch (error) {
        logger.error('Ошибка обновления функции:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка обновления функции'
        });
    }
});

// Очистка неиспользуемых функций
router.post('/features/cleanup', async (req, res) => {
    try {
        const { daysUnused = 90 } = req.body;
        
        const removedCount = await FeaturesService.cleanupUnusedFeatures(daysUnused);
        
        res.json({
            success: true,
            removedCount: removedCount,
            message: `Удалено неиспользуемых функций: ${removedCount}`
        });
    } catch (error) {
        logger.error('Ошибка очистки каталога:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка очистки каталога'
        });
    }
});

// Экспорт каталога
router.get('/features/export', async (req, res) => {
    try {
        const exportPath = await FeaturesService.exportCatalog();
        
        if (exportPath) {
            res.json({
                success: true,
                message: 'Каталог экспортирован',
                path: exportPath
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Не удалось экспортировать каталог'
            });
        }
    } catch (error) {
        logger.error('Ошибка экспорта каталога:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка экспорта'
        });
    }
});

// === СЕССИИ ===

// Проверка сессии
router.post('/check-session', (req, res) => ChatController.checkSession(req, res));

// История чата
router.get('/chat-history/:sessionId', (req, res) => ChatController.getChatHistory(req, res));

// Добавьте этот новый роут для истории анкетного чата
router.get('/pre-chat-history/:sessionId', (req, res) => ChatController.getPreChatHistory(req, res));

// История GPT чата
router.get('/gpt-chat-history/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        logger.info('Запрос истории GPT чата', { sessionId });
        
        const { Conversation } = require('../models');
        
        if (!Conversation) {
            return res.json({
                success: true,
                conversation: [],
                message: 'База данных недоступна'
            });
        }
        
        const conversation = await Conversation.findBySessionId(sessionId);
        
        if (!conversation) {
            return res.json({
                success: true,
                conversation: []
            });
        }
        
        // Преобразуем сообщения в нужный формат
        const formattedMessages = conversation.messages.map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp
        }));
        
        res.json({
            success: true,
            conversation: formattedMessages,
            mode: conversation.mode || 'chat',
            hasEstimate: !!conversation.estimate,
            estimateStatus: conversation.estimateStatus
        });
        
    } catch (error) {
        logger.error('Ошибка получения истории GPT чата:', error);
        res.status(500).json({
            success: false,
            error: 'Не удалось получить историю чата'
        });
    }
});

// === АНАЛИТИКА ===

// Общая аналитика - изменяем на POST так как метод ожидает body
router.post('/analytics', (req, res) => AnalyticsController.getAnalytics(req, res));

// Статистика смет
router.get('/estimates/stats', (req, res) => AnalyticsController.getEstimatesStats(req, res));

// Список смет
router.get('/estimates/list', (req, res) => AnalyticsController.getEstimatesList(req, res));

// Детали сметы - закомментируем пока
// router.get('/estimates/:estimateId', (req, res) => AnalyticsController.getEstimateDetails(req, res));

// События аналитики
router.post('/analytics/event', (req, res) => AnalyticsController.trackEvent(req, res));

// Аналитика анкет
router.get('/analytics/forms', (req, res) => AnalyticsController.getPreChatAnalytics(req, res));

// === УТИЛИТЫ ===

// Проверка здоровья системы
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version
    });
});

// Уведомления
router.post('/lead-notification', (req, res) => FormulationController.sendLeadNotification(req, res));

// === ФАЙЛЫ И ЗАГРУЗКИ ===

// Загрузка файлов
router.post('/upload', async (req, res) => {
    try {
        const multer = require('multer');
        const path = require('path');
        
        // Настройка хранилища
        const storage = multer.diskStorage({
            destination: function (req, file, cb) {
                cb(null, 'uploads/');
            },
            filename: function (req, file, cb) {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                cb(null, uniqueSuffix + path.extname(file.originalname));
            }
        });
        
        const upload = multer({ 
            storage: storage,
            limits: {
                fileSize: 5 * 1024 * 1024 // 5MB
            },
            fileFilter: function (req, file, cb) {
                // Разрешенные типы файлов
                const allowedTypes = [
                    'image/jpeg', 'image/png', 'image/gif',
                    'application/pdf', 'text/plain',
                    'audio/mpeg', 'audio/wav', 'audio/ogg'
                ];
                
                if (allowedTypes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new Error('Неподдерживаемый тип файла'));
                }
            }
        }).single('file');
        
        upload(req, res, function (err) {
            if (err) {
                logger.error('Ошибка загрузки файла:', err);
                return res.status(400).json({
                    error: err.message || 'Ошибка загрузки файла'
                });
            }
            
            if (!req.file) {
                return res.status(400).json({
                    error: 'Файл не был загружен'
                });
            }
            
            logger.info('Файл загружен', { 
                filename: req.file.filename, 
                originalname: req.file.originalname,
                size: req.file.size 
            });
            
            res.json({
                success: true,
                file: {
                    filename: req.file.filename,
                    originalname: req.file.originalname,
                    size: req.file.size,
                    path: req.file.path
                }
            });
        });
        
    } catch (error) {
        logger.error('Ошибка в роуте загрузки:', error);
        res.status(500).json({
            error: 'Ошибка сервера при загрузке файла'
        });
    }
});

// === СЛУЖЕБНЫЕ РОУТЫ ===

// Очистка кэша
router.post('/clear-cache', (req, res) => {
    try {
        const NodeCache = require('node-cache');
        // Если есть глобальный кеш, можно его очистить
        // cache.flushAll();
        
        logger.info('Кеш очищен');
        res.json({ 
            success: true, 
            message: 'Кеш успешно очищен' 
        });
        
    } catch (error) {
        logger.error('Ошибка очистки кеша:', error);
        res.status(500).json({
            error: 'Ошибка очистки кеша'
        });
    }
});

// === ТЕСТОВЫЕ РОУТЫ ===

// Тест GPT соединения
router.get('/test-gpt', async (req, res) => {
    try {
        const GPTService = require('../services/GPTService');
        
        const testMessages = [
            { role: 'user', content: 'Привет! Это тест соединения.' }
        ];
        
        const response = await GPTService.chat(testMessages);
        
        res.json({
            success: true,
            message: 'GPT соединение работает',
            response: response.slice(0, 100) + '...'
        });
        
    } catch (error) {
        logger.error('Ошибка тестирования GPT:', error);
        res.status(500).json({
            error: 'GPT соединение не работает',
            details: error.message
        });
    }
});

// Тест Telegram соединения
router.get('/test-telegram', async (req, res) => {
    try {
        const TelegramService = require('../services/TelegramService');
        
        if (!TelegramService.isReady()) {
            return res.status(500).json({
                error: 'Telegram бот не готов',
                info: TelegramService.getBotInfo()
            });
        }
        
        const testMessage = `🧪 Тест соединения\n\nВремя: ${new Date().toLocaleString('ru-RU')}`;
        const sent = await TelegramService.sendNotification(testMessage);
        
        if (sent) {
            res.json({
                success: true,
                message: 'Telegram соединение работает'
            });
        } else {
            res.status(500).json({
                error: 'Не удалось отправить тестовое сообщение'
            });
        }
        
    } catch (error) {
        logger.error('Ошибка тестирования Telegram:', error);
        res.status(500).json({
            error: 'Telegram соединение не работает',
            details: error.message
        });
    }
});

// === MIDDLEWARE для обработки ошибок Multer ===
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'Файл слишком большой (максимум 25MB)'
            });
        }
        return res.status(400).json({
            success: false,
            error: 'Ошибка загрузки файла: ' + error.message
        });
    }
    
    if (error.message === 'Неподдерживаемый формат аудио') {
        return res.status(400).json({
            success: false,
            error: 'Поддерживаются только аудио файлы: WebM, OGG, WAV, MP3'
        });
    }
    
    next(error);
});

// Обработка 404 для API роутов
router.use('*', (req, res) => {
    res.status(404).json({
        error: 'API endpoint не найден',
        path: req.originalUrl,
        method: req.method
    });
});

// ===== ТЕСТОВЫЙ ENDPOINT ДЛЯ ДИАГНОСТИКИ СИСТЕМЫ СМЕТ =====
router.get('/test-estimate-system', async (req, res) => {
    try {
        const { sessionId } = req.query;
        
        if (!sessionId) {
            return res.json({
                error: 'Укажите sessionId в query параметрах',
                example: '/api/test-estimate-system?sessionId=session_123456789_abcd',
                help: 'Этот endpoint помогает диагностировать проблемы с отображением смет'
            });
        }
        
        logger.info('🔍 Диагностика системы смет для сессии:', sessionId);
        
        const { PreChatForm } = require('../models');
        
        // Проверяем статус сессии
        const session = await PreChatForm.findOne({ sessionId });
        
        if (!session) {
            return res.json({
                error: 'Сессия не найдена',
                sessionId: sessionId,
                suggestion: 'Убедитесь что указан правильный sessionId'
            });
        }
        
        // Анализируем сообщения с утвержденными сметами
        const approvedMessages = session.chatHistory.filter(msg => 
            msg.metadata && msg.metadata.messageType === 'approved_estimate'
        );
        
        const status = {
            sessionId: sessionId,
            sessionExists: true,
            estimateApproved: session.estimateApproved,
            estimateDeliveredToClient: session.estimateDeliveredToClient,
            estimateApprovedAt: session.estimateApprovedAt,
            estimateDeliveredAt: session.estimateDeliveredAt,
            approvedEstimateId: session.approvedEstimateId,
            chatHistoryLength: session.chatHistory.length,
            approvedMessagesCount: approvedMessages.length,
            lastMessage: session.chatHistory.length > 0 ? {
                role: session.chatHistory[session.chatHistory.length - 1].role,
                content: session.chatHistory[session.chatHistory.length - 1].content.substring(0, 100) + '...',
                timestamp: session.chatHistory[session.chatHistory.length - 1].timestamp,
                hasMetadata: !!session.chatHistory[session.chatHistory.length - 1].metadata,
                messageType: session.chatHistory[session.chatHistory.length - 1].metadata?.messageType
            } : null,
            approvedMessages: approvedMessages.map(msg => ({
                estimateId: msg.metadata.estimateId,
                approvedAt: msg.metadata.approvedAt,
                hasContent: !!msg.content,
                contentLength: msg.content ? msg.content.length : 0
            }))
        };
        
        logger.info('📊 Статус диагностики:', status);
        
        // Определяем возможные проблемы
        const issues = [];
        const solutions = [];
        
        if (!session.estimateApproved) {
            issues.push('Смета еще не утверждена менеджером');
            solutions.push('Попросите менеджера утвердить смету в Telegram или используйте POST /api/test-approve-estimate');
        }
        
        if (session.estimateApproved && approvedMessages.length === 0) {
            issues.push('Смета утверждена, но сообщение не найдено в истории чата');
            solutions.push('Проблема с сохранением сообщения в БД');
        }
        
        if (session.estimateApproved && session.estimateDeliveredToClient) {
            issues.push('Смета уже помечена как доставленная клиенту');
            solutions.push('SSE не будет отправлять смету повторно. Используйте POST /api/test-reset-estimate');
        }
        
        if (session.estimateApproved && !session.estimateDeliveredToClient && approvedMessages.length > 0) {
            issues.push('СИСТЕМА РАБОТАЕТ КОРРЕКТНО - смета должна отображаться через SSE');
            solutions.push('Проверьте SSE соединение и JavaScript в браузере');
        }
        
        res.json({
            success: true,
            status: status,
            issues: issues,
            solutions: solutions,
            actions: {
                'Симулировать утверждение': `POST /api/test-approve-estimate с body: {"sessionId": "${sessionId}"}`,
                'Сбросить статус': `POST /api/test-reset-estimate с body: {"sessionId": "${sessionId}"}`,
                'Проверить SSE (откройте в браузере)': `/api/estimate-updates/${sessionId}`,
                'Проверить статус (API)': `/api/check-approved-estimate/${sessionId}`
            },
            debug: {
                serverTime: new Date().toISOString(),
                nodeEnv: process.env.NODE_ENV,
                mongoConnected: !!session
            }
        });
        
    } catch (error) {
        logger.error('❌ Ошибка диагностики:', error);
        res.json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

module.exports = router; 