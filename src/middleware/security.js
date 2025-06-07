const logger = require('../utils/logger');

// Middleware безопасности
const security = (req, res, next) => {
    try {
        // Добавляем IP адрес к запросу
        req.ip = req.headers['x-forwarded-for'] || 
                 req.headers['x-real-ip'] || 
                 req.connection.remoteAddress || 
                 req.socket.remoteAddress ||
                 (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                 req.ip;

        // Очищаем IP от IPv6 префиксов
        if (req.ip && req.ip.startsWith('::ffff:')) {
            req.ip = req.ip.substring(7);
        }

        // Логирование подозрительных запросов
        const suspiciousPatterns = [
            /\.\.\/|\.\.\\/, // Path traversal
            /<script|javascript:|vbscript:/i, // XSS
            /union.*select|insert.*into|drop.*table/i, // SQL injection
            /eval\(|exec\(|system\(/i, // Code injection
        ];

        const fullUrl = req.originalUrl || req.url;
        const userAgent = req.get('User-Agent') || '';
        
        // Проверяем URL и User-Agent на подозрительные паттерны
        const isSuspicious = suspiciousPatterns.some(pattern => 
            pattern.test(fullUrl) || pattern.test(userAgent)
        );

        if (isSuspicious) {
            logger.warn('Подозрительный запрос заблокирован', {
                ip: req.ip,
                url: fullUrl,
                userAgent: userAgent.slice(0, 200),
                method: req.method
            });
            
            return res.status(403).json({
                error: 'Запрос заблокирован системой безопасности'
            });
        }

        // Проверяем размер тела запроса
        if (req.headers['content-length']) {
            const contentLength = parseInt(req.headers['content-length']);
            const maxSize = 50 * 1024 * 1024; // 50MB
            
            if (contentLength > maxSize) {
                logger.warn('Запрос с большим телом заблокирован', {
                    ip: req.ip,
                    contentLength,
                    maxSize
                });
                
                return res.status(413).json({
                    error: 'Размер запроса превышает допустимый лимит'
                });
            }
        }

        // Добавляем заголовки безопасности
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

        // Удаляем информацию о сервере
        res.removeHeader('X-Powered-By');
        res.removeHeader('Server');

        next();

    } catch (error) {
        logger.error('Ошибка в middleware безопасности:', error);
        next(); // Продолжаем выполнение даже при ошибке в безопасности
    }
};

module.exports = security; 