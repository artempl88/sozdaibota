// src/config/index.js
const path = require('path');
const fs = require('fs');

// Определяем какой файл окружения использовать
let envFile = null;
const environmentPath = path.join(__dirname, '../../environment.env');
const envPath = path.join(__dirname, '../../.env');

if (fs.existsSync(environmentPath)) {
    envFile = environmentPath;
    console.log('📄 Используется environment.env');
} else if (fs.existsSync(envPath)) {
    envFile = envPath;
    console.log('📄 Используется .env');
}

// Загружаем переменные окружения
if (envFile) {
    require('dotenv').config({ path: envFile });
} else {
    console.log('⚠️ Файлы окружения не найдены, ищем config.production.js');
}

// Если .env файл не найден или пустой, загружаем продакшен конфигурацию
let productionConfig = null;
try {
    if (!process.env.OPENAI_API_KEY) {
        productionConfig = require('../../config.production.js');
        console.log('🔧 Использую config.production.js как fallback');
    }
} catch (err) {
    console.log('⚠️ config.production.js не найден');
}

module.exports = {
    app: {
        port: process.env.PORT || (productionConfig?.app?.port) || 3001,
        env: process.env.NODE_ENV || (productionConfig?.app?.env) || 'development',
        logLevel: process.env.LOG_LEVEL || (productionConfig?.app?.logLevel) || 'info',
        maxUploadSize: process.env.MAX_UPLOAD_SIZE || (productionConfig?.app?.maxUploadSize) || '10mb'
    },
    mongodb: {
        uri: process.env.MONGODB_URI || (productionConfig?.mongodb?.uri)
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY || (productionConfig?.openai?.apiKey),
        model: process.env.OPENAI_MODEL || (productionConfig?.openai?.model) || 'gpt-4o-mini',
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || (productionConfig?.openai?.maxTokens) || 3000,
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || (productionConfig?.openai?.temperature) || 0.7,
        endpoint: 'https://api.openai.com/v1/chat/completions'
    },
    telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN || (productionConfig?.telegram?.token),
        adminChatId: process.env.ADMIN_CHAT_ID || (productionConfig?.telegram?.adminChatId),
        webhookUrl: process.env.BOT_WEBHOOK_URL || (productionConfig?.telegram?.webhookUrl),
        webhookSecret: process.env.BOT_WEBHOOK_SECRET || (productionConfig?.telegram?.webhookSecret)
    },
    proxy: {
        host: process.env.PROXY_HOST || (productionConfig?.proxy?.host) || '45.140.250.189',
        port: process.env.PROXY_PORT || (productionConfig?.proxy?.port) || '8000',
        username: process.env.PROXY_USERNAME || (productionConfig?.proxy?.username) || 'NTnyrC',
        password: process.env.PROXY_PASSWORD || (productionConfig?.proxy?.password) || 'Lw8FbM',
        useProxy: process.env.USE_PROXY === 'true' || (productionConfig?.proxy?.useProxy) || false,
        protocol: process.env.PROXY_PROTOCOL || (productionConfig?.proxy?.protocol) || 'http'
    },
    security: {
        encryptionKey: process.env.ENCRYPTION_KEY || (productionConfig?.security?.encryptionKey),
        allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : (productionConfig?.security?.allowedOrigins) || ['http://localhost:3000'],
        rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || (productionConfig?.security?.rateLimitWindow) || 900000,
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || (productionConfig?.security?.rateLimitMax) || 100
    },
    features: {
        enableVoice: process.env.ENABLE_VOICE === 'true' || (productionConfig?.features?.enableVoice) || false,
        enableImages: process.env.ENABLE_IMAGES === 'true' || (productionConfig?.features?.enableImages) || false,
        enableAnalytics: process.env.ENABLE_ANALYTICS === 'true' || (productionConfig?.features?.enableAnalytics) || false,
        enableNotifications: process.env.ENABLE_NOTIFICATIONS === 'true' || (productionConfig?.features?.enableNotifications) || false
    },
    cache: {
        ttl: parseInt(process.env.CACHE_TTL) || (productionConfig?.cache?.ttl) || 3600,
        redisUrl: process.env.REDIS_URL || (productionConfig?.cache?.redisUrl)
    },
    pricing: {
        hourlyRate: parseInt(process.env.HOURLY_RATE) || (productionConfig?.pricing?.hourlyRate) || 2000,
        minProjectCost: parseInt(process.env.MIN_PROJECT_COST) || (productionConfig?.pricing?.minProjectCost) || 15000,
        currency: process.env.CURRENCY || (productionConfig?.pricing?.currency) || 'RUB'
    },
    email: {
        smtpHost: process.env.SMTP_HOST || (productionConfig?.email?.smtpHost),
        smtpPort: parseInt(process.env.SMTP_PORT) || (productionConfig?.email?.smtpPort) || 587,
        smtpUser: process.env.SMTP_USER || (productionConfig?.email?.smtpUser),
        smtpPass: process.env.SMTP_PASS || (productionConfig?.email?.smtpPass)
    },
    filesystem: {
        uploadDir: process.env.UPLOAD_DIR || (productionConfig?.filesystem?.uploadDir) || './uploads',
        tempDir: process.env.TEMP_DIR || (productionConfig?.filesystem?.tempDir) || './temp',
        logDir: process.env.LOG_DIR || (productionConfig?.filesystem?.logDir) || './logs'
    },
    monitoring: {
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || (productionConfig?.monitoring?.healthCheckInterval) || 30000,
        errorReporting: process.env.ERROR_REPORTING === 'true' || (productionConfig?.monitoring?.errorReporting) || false,
        performanceMonitoring: process.env.PERFORMANCE_MONITORING === 'true' || (productionConfig?.monitoring?.performanceMonitoring) || false
    }
};