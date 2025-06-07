// src/utils/quickReplies.js
const logger = require('./logger');

// Единая функция генерации быстрых ответов
function generateUnifiedQuickReplies(aiResponse, userMessage = '', conversation = [], mode = 'chat') {
    const lowerResponse = aiResponse.toLowerCase();
    const lowerUser = userMessage.toLowerCase();
    
    // Режим формулировки - упрощенные кнопки
    if (mode === 'formulation') {
        // Если AI спрашивает о типе бизнеса
        if (lowerResponse.includes('бизнес') || lowerResponse.includes('занимаетесь')) {
            return [];  // Пусть пишут своими словами
        }
        
        // Если AI готов создать ТЗ
        if (lowerResponse.includes('готов') || lowerResponse.includes('создам') || lowerResponse.includes('предлагаю')) {
            return [
                '✅ Да, всё верно',
                '📝 Добавить детали',
                '📋 Создать полное ТЗ',
                '💰 Узнать стоимость'
            ];
        }
        
        // Если AI уточняет детали
        if (lowerResponse.includes('уточн') || lowerResponse.includes('какие')) {
            return [
                '💬 Отвечу текстом',
                '🎤 Запишу голосом',
                '📋 Достаточно инфо, создайте ТЗ'
            ];
        }
        
        return [];
    }
    
    // Обычный режим чата - полная логика
    
    // Если собрано достаточно информации - предлагаем расчет
    if (lowerResponse.includes('какие функции') || 
        lowerResponse.includes('что еще') ||
        lowerResponse.includes('дополнительно') ||
        lowerResponse.includes('интеграции') ||
        (lowerResponse.includes('бот') && lowerResponse.includes('нужен'))) {
        return [
            "💰 Получить предложение",
            "➕ Добавить функции",
            "🔄 Изменить требования",
            "❓ Задать вопрос"
        ];
    }

    if (lowerResponse.includes('бизнес') || lowerResponse.includes('компан')) {
        return [
            "🛒 Интернет-магазин",
            "🎓 Образование", 
            "🔧 Услуги",
            "🏠 Недвижимость",
            "💼 Другое"
        ];
    }

    if (lowerResponse.includes('задач') || lowerResponse.includes('функц')) {
        return [
            "📞 Отвечать на вопросы",
            "🛒 Принимать заказы", 
            "📝 Собирать заявки",
            "📅 Записывать на услуги",
            "💰 Продавать товары"
        ];
    }

    if (lowerResponse.includes('интеграц') || lowerResponse.includes('подключ')) {
        return [
            "✅ Нужна CRM",
            "💳 Нужна оплата",
            "📧 Нужна почта", 
            "❌ Пока не нужно"
        ];
    }

    if (lowerResponse.includes('готов') || lowerResponse.includes('сформир')) {
        return [
            "📋 Создать ТЗ сейчас",
            "💡 Добавить функции",
            "🔄 Изменить требования"
        ];
    }

    // Общие кнопки если ничего не подошло
    if (conversation.length >= 3) {
        return [
            "💰 Узнать стоимость",
            "📋 Создать ТЗ",
            "❓ Задать вопрос"
        ];
    }

    return [];
}

module.exports = {
    generateUnifiedQuickReplies
};