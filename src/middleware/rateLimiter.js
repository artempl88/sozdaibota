const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Общий лимит для API
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // максимум 100 запросов на IP за 15 минут
    message: {
        success: false,
        error: 'Слишком много запросов. Попробуйте позже.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn('Rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent')
        });
        
        res.status(429).json({
            success: false,
            error: 'Слишком много запросов. Попробуйте позже.',
            retryAfter: Math.round(req.rateLimit.resetTime / 1000)
        });
    }
});

// Строгий лимит для GPT запросов
const gptLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 минута
    max: 10, // максимум 10 GPT запросов в минуту
    message: {
        success: false,
        error: 'Слишком много запросов к GPT. Подождите минуту.'
    },
    skip: (req) => {
        // Пропускаем health checks
        return req.path === '/api/health';
    }
});

// Лимит для голосовых сообщений
const voiceLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 минут
    max: 5, // максимум 5 голосовых сообщений за 5 минут
    message: {
        success: false,
        error: 'Слишком много голосовых сообщений. Подождите 5 минут.'
    }
});

// Лимит для форм
const formLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 5, // максимум 5 форм в час
    message: {
        success: false,
        error: 'Слишком много отправок форм. Подождите час.'
    }
});

module.exports = {
    apiLimiter,
    gptLimiter,
    voiceLimiter,
    formLimiter
}; 