// Централизованная конфигурация таймаутов
module.exports = {
    // OpenAI API таймауты
    openai: {
        // Основные запросы чата
        chat: 60000, // 60 секунд
        
        // Транскрипция аудио (может занимать больше времени)
        transcription: 90000, // 90 секунд
        
        // Генерация речи
        speech: 60000, // 60 секунд
        
        // Быстрые проверки намерений
        intent: 30000, // 30 секунд
        
        // Анализ функционала
        functionality: 45000, // 45 секунд
    },
    
    // Retry настройки
    retry: {
        maxRetries: 3,
        baseDelay: 1000, // 1 секунда
        maxDelay: 10000, // 10 секунд
        
        // Коды ошибок для повтора
        retryableCodes: [
            'ECONNRESET',
            'ETIMEDOUT', 
            'ECONNABORTED',
            'ENOTFOUND',
            'ECONNREFUSED'
        ],
        
        // HTTP статусы для повтора
        retryableStatuses: [429, 502, 503, 504]
    },
    
    // Таймауты для различных операций
    operations: {
        database: 10000, // 10 секунд
        fileUpload: 120000, // 2 минуты
        webhook: 5000, // 5 секунд
        telegram: 15000 // 15 секунд
    }
}; 