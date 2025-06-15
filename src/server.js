// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const path = require('path');

const config = require('./config');
const logger = require('./utils/logger');
const apiRoutes = require('./routes/api');
const { apiLimiter, gptLimiter, voiceLimiter, formLimiter } = require('./middleware/rateLimiter');
const AnalyticsService = require('./services/AnalyticsService');
const VoiceService = require('./services/VoiceService');

// Импорт сервисов
const TelegramService = require('./services/TelegramService');
const EstimateService = require('./services/EstimateService');
const AdvancedGPTService = require('./services/AdvancedGPTService');
const EncryptionUtils = require('./utils/encryption');

// Импорт middleware
const rateLimiter = require('./middleware/rateLimiter');
const security = require('./middleware/security');

const PreChatService = require('./services/PreChatService');

const app = express();

console.log('🔍 ENV CHECK:', {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? 'Загружен' : 'НЕ ЗАГРУЖЕН',
    ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID,
    configTelegram: config.telegram
});

// === БЕЗОПАСНОСТЬ ===

// Helmet для основных заголовков безопасности
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: [
                "'self'", 
                "'unsafe-inline'", 
                "'unsafe-eval'", 
                "https://cdnjs.cloudflare.com",
                "https://code.jquery.com",
                "https://cdn.jsdelivr.net"
            ],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: [
                "'self'", 
                "https://api.openai.com", 
                "ws:", 
                "wss:", 
                "http://localhost:3000"
            ],
            mediaSrc: ["'self'", "blob:"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
    },
    crossOriginEmbedderPolicy: false
}));

// CORS настройки
const corsOptions = {
    origin: function (origin, callback) {
        // Разрешаем запросы без origin (мобильные приложения, Postman)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
            'https://создать-бота.рф',
            'https://www.создать-бота.рф'
        ];
        
        if (process.env.ALLOWED_ORIGINS) {
            allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(','));
        }
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            logger.warn('CORS blocked origin:', origin);
            callback(new Error('Заблокировано CORS политикой'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// === MIDDLEWARE ===

// Безопасность
app.use(security);

// Парсинг JSON с лимитом размера
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Статические файлы
app.use(express.static(path.join(__dirname, '..'), {
    maxAge: '1d',
    etag: true
}));

// Логирование запросов
app.use((req, res, next) => {
    logger.info('HTTP запрос', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')?.slice(0, 100)
    });
    next();
});

// Общий rate limiter для всех API запросов
app.use('/api', apiLimiter);

// Специфичные rate limiters
app.use('/api/gpt-assistant', gptLimiter);
app.use('/api/simple-chat', gptLimiter);
app.use('/api/pre-chat-message', gptLimiter);
app.use('/api/voice-message', voiceLimiter);
app.use('/api/pre-chat-form', formLimiter);

// === БАЗА ДАННЫХ ===

// Подключение к MongoDB
if (config.mongodb.uri) {
    mongoose.connect(config.mongodb.uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    })
    .then(() => {
        logger.info('✅ MongoDB подключена');
    })
    .catch(err => {
        logger.error('❌ Ошибка подключения к MongoDB:', err.message);
    });

    // Обработка событий подключения
    mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB отключена');
    });

    mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB переподключена');
    });
} else {
    logger.warn('⚠️ MongoDB URI не настроен, работаем без базы данных');
}

// === ИНИЦИАЛИЗАЦИЯ СЕРВИСОВ ===

// Создаем папку для загрузок при старте
VoiceService.ensureUploadDir().catch(err => {
    logger.error('Ошибка создания папки uploads:', err);
});

// === РОУТЫ ===

// API роуты
app.use('/api', apiRoutes);

// Главная страница
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: path.join(__dirname, '..') });
});

// === ДОПОЛНИТЕЛЬНЫЕ РОУТЫ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ ===

// Режим формулировки (прямой роут)
app.post('/api/formulation-mode', async (req, res) => {
    try {
        const FormulationController = require('./controllers/FormulationController');
        await FormulationController.handleFormulationMode(req, res);
    } catch (error) {
        logger.error('Ошибка в режиме формулировки:', error);
        res.status(500).json({
            error: 'Ошибка сервера',
            success: false
        });
    }
});

// Создание ТЗ
app.post('/api/generate-specification', async (req, res) => {
    try {
        const FormulationController = require('./controllers/FormulationController');
        await FormulationController.generateSpecification(req, res);
    } catch (error) {
        logger.error('Ошибка создания ТЗ:', error);
        res.status(500).json({
            error: 'Ошибка создания ТЗ',
            success: false
        });
    }
});

// Быстрые ответы (helper endpoint)
app.post('/api/quick-replies', async (req, res) => {
    try {
        const { aiResponse, userMessage = '', conversation = [], mode = 'chat' } = req.body;
        
        if (!aiResponse) {
            return res.status(400).json({
                error: 'Требуется aiResponse'
            });
        }

        const quickReplies = AdvancedGPTService.generateUnifiedQuickReplies(
            aiResponse, 
            userMessage, 
            conversation, 
            mode
        );

        res.json({
            success: true,
            quickReplies: quickReplies
        });

    } catch (error) {
        logger.error('Ошибка генерации быстрых ответов:', error);
        res.status(500).json({
            error: 'Ошибка генерации ответов'
        });
    }
});

// === ОБРАБОТКА ОШИБОК ===

// Глобальный обработчик ошибок
app.use((error, req, res, next) => {
    logger.error('Необработанная ошибка:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
    });
    
    // Аналитика ошибок
    AnalyticsService.addEvent('server_error', null, {
        error: error.message,
        path: req.path,
        method: req.method
    });
    
    if (req.originalUrl.startsWith('/api/')) {
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'production' 
                ? 'Внутренняя ошибка сервера' 
                : error.message
        });
    } else {
        res.status(500).sendFile('index.html', { root: path.join(__dirname, '..') });
    }
});

// === ПЕРИОДИЧЕСКИЕ ЗАДАЧИ ===

// Очистка старых сессий каждые 6 часов
const cleanupInterval = setInterval(() => {
    AnalyticsService.cleanupOldSessions();
}, 6 * 60 * 60 * 1000);

// === ЗАПУСК СЕРВЕРА ===

const PORT = config.app.port;
const server = app.listen(PORT, () => {
    logger.info(`🚀 Модульный сервер запущен на порту ${PORT}`);
    logger.info(`🌐 Доступен по адресу: http://localhost:${PORT}`);
    logger.info(`📊 Режим: ${config.app.env}`);
    logger.info(`🔒 Безопасность: включена`);
    logger.info(`📈 Аналитика: активна`);
    
    // Проверяем состояние сервисов
    setTimeout(() => {
        const telegramInfo = TelegramService.getBotInfo();
        logger.info('Telegram Bot статус:', telegramInfo);
        
        if (!telegramInfo.ready) {
            logger.warn('⚠️ Telegram бот не готов к работе');
        }
    }, 5000);
});

// Обработка ошибок сервера
server.on('error', (error) => {
    if (error.syscall !== 'listen') {
        throw error;
    }

    switch (error.code) {
        case 'EACCES':
            logger.error(`Порт ${PORT} требует повышенных привилегий`);
            process.exit(1);
            break;
        case 'EADDRINUSE':
            logger.error(`Порт ${PORT} уже используется`);
            process.exit(1);
            break;
        default:
            throw error;
    }
});

// === GRACEFUL SHUTDOWN ===

async function gracefulShutdown(signal) {
    logger.info(`\n🛑 Получен сигнал ${signal}, начинаем graceful shutdown...`);
    
    try {
        // Останавливаем периодические задачи
        clearInterval(cleanupInterval);
        
        // Закрываем HTTP сервер
        await new Promise((resolve) => {
            server.close(() => {
                logger.info('✅ HTTP сервер закрыт');
                resolve();
            });
        });
        
        // Останавливаем Telegram бота
        await TelegramService.shutdown();
        logger.info('✅ Telegram бот остановлен');
        
        // Закрываем Puppeteer браузер
        try {
            const PDFService = require('./services/PDFService');
            await PDFService.closeBrowser();
            logger.info('✅ Puppeteer браузер закрыт');
        } catch (error) {
            logger.warn('Ошибка закрытия Puppeteer:', error.message);
        }

        // Закрываем соединение с MongoDB
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            logger.info('✅ MongoDB соединение закрыто');
        }
        
        logger.info('✅ Приложение завершено корректно');
        process.exit(0);
        
    } catch (error) {
        logger.error('❌ Ошибка при graceful shutdown:', error);
        process.exit(1);
    }
}

// Обработчики сигналов
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Обработка неперехваченных ошибок
process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;