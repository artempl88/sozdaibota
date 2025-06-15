// config.production.js - Полная конфигурация для продакшена
// Для использования: NODE_ENV=production node src/server.js

module.exports = {
    app: {
        port: 3001,
        env: 'production',
        logLevel: 'info',
        maxUploadSize: '10mb'
    },
    mongodb: {
        uri: 'mongodb://localhost:27017/sozdaibota-db'  // Локальная MongoDB
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini',
        maxTokens: 3000,
        temperature: 0.7,
        endpoint: 'https://api.openai.com/v1/chat/completions'
    },
    telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN,
        adminChatId: '185444524',
        webhookUrl: 'https://sozdaibota.ru/webhook',
        webhookSecret: 'hjkhjkyuifghvbnnm,[123bnm,.8921'
    },
    proxy: {
        host: '45.140.250.189',
        port: '8000',
        username: 'NTnyrC',
        password: 'Lw8FbM',
        useProxy: true,
        protocol: 'http'
    },
    security: {
        encryptionKey: 'hjkhjkyuifghvbnnm,[123bnm,.8921',
        allowedOrigins: [
            'http://localhost:3000',
            'https://sozdaibota.ru',
            'https://www.sozdaibota.ru',
            'https://создать-бота.рф',
            'https://www.создать-бота.рф'
        ],
        rateLimitWindow: 900000,
        rateLimitMax: 100
    },
    features: {
        enableVoice: true,
        enableImages: true,
        enableAnalytics: true,
        enableNotifications: true
    },
    cache: {
        ttl: 3600,
        redisUrl: null
    },
    pricing: {
        hourlyRate: 2000,
        minProjectCost: 15000,
        currency: 'RUB'
    },
    email: {
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpUser: 'admin@sozdaibota.ru',
        smtpPass: 'your_email_password'
    },
    filesystem: {
        uploadDir: './uploads',
        tempDir: './temp',
        logDir: './logs'
    },
    monitoring: {
        healthCheckInterval: 30000,
        errorReporting: true,
        performanceMonitoring: true
    }
}; 