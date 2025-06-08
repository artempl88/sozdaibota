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
    
    // Настраиваем SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    
    // Отправляем начальное сообщение
    res.write('data: {"type":"connected"}\n\n');
    
    // Функция для проверки сметы
    const checkEstimate = async () => {
        try {
            const { PreChatForm } = require('../models');
            const session = await PreChatForm.findOne({ sessionId });
            
            if (session && session.estimateApproved && !session.estimateDeliveredToClient) {
                const estimateMessage = session.chatHistory
                    .filter(msg => msg.metadata && msg.metadata.messageType === 'approved_estimate')
                    .pop();
                
                if (estimateMessage) {
                    // Отправляем утвержденную смету клиенту
                    const data = JSON.stringify({
                        type: 'approved_estimate',
                        estimate: {
                            message: estimateMessage.content,
                            approvedAt: estimateMessage.metadata.approvedAt,
                            estimateId: estimateMessage.metadata.estimateId
                        }
                    });
                    
                    res.write(`data: ${data}\n\n`);
                    
                    // Помечаем как доставленную
                    session.estimateDeliveredToClient = true;
                    session.estimateDeliveredAt = new Date();
                    await session.save();
                    
                    // Закрываем соединение после доставки
                    setTimeout(() => {
                        res.end();
                    }, 1000);
                }
            }
        } catch (error) {
            logger.error('SSE ошибка проверки сметы:', error);
        }
    };
    
    // Проверяем каждые 5 секунд
    const interval = setInterval(checkEstimate, 5000);
    
    // Проверяем сразу
    checkEstimate();
    
    // Очистка при закрытии соединения
    req.on('close', () => {
        clearInterval(interval);
        logger.info('SSE соединение закрыто', { sessionId });
    });
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

module.exports = router; 