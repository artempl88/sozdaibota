// server.js - Безопасная серверная часть (Node.js + Express)

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors({
    origin: ['https://создать-бота.рф', 'http://localhost:3000'], // Ваши домены
    credentials: true
}));

// Rate limiting для защиты от злоупотреблений
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 50, // максимум 50 запросов с одного IP
    message: {
        error: 'Слишком много запросов, попробуйте позже'
    }
});

app.use('/api/', limiter);

// Конфигурация (в production используйте переменные окружения!)
const OPENAI_CONFIG = {
    apiKey: process.env.OPENAI_API_KEY, // Безопасное хранение ключа
    model: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions'
};

const PROXY_CONFIG = {
    host: '141.98.187.117',
    port: '8000',
    username: 'qr4NBX',
    password: 'mFmLGN'
};

// Создание прокси-агента
const proxyAgent = new HttpsProxyAgent(
    `http://${PROXY_CONFIG.username}:${PROXY_CONFIG.password}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`
);

// Системный промпт для GPT
const SYSTEM_PROMPT = `Ты - умный помощник для создания технических заданий на Telegram-ботов компании "Создать Бота".

Твои задачи:
1. Задавать умные наводящие вопросы о бизнесе клиента
2. Понимать потребности и формулировать четкие требования
3. Предлагать дополнительные полезные функции
4. Говорить по-русски, дружелюбно но профессионально
5. Быть кратким - максимум 2-3 предложения

Важные правила:
- Всегда спрашивай о типе бизнеса, основных задачах и целевой аудитории
- Уточняй потребности в интеграциях (CRM, оплата, уведомления)
- Предлагай современные решения с ИИ
- Помогай клиенту четко сформулировать требования

Стиль общения: дружелюбный эксперт, который понимает бизнес.`;

// Основной endpoint для GPT-помощника
app.post('/api/gpt-assistant', async (req, res) => {
    try {
        console.log('📨 Получен запрос к GPT:', req.body);

        const { message, conversation = [] } = req.body;

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

        // Подготовка сообщений для OpenAI
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...conversation.slice(-10), // Берем последние 10 сообщений для контекста
            { role: 'user', content: message }
        ];

        console.log('🧠 Отправляем запрос к OpenAI...');

        // Запрос к OpenAI через прокси
        const response = await axios.post(
            OPENAI_CONFIG.endpoint,
            {
                model: OPENAI_CONFIG.model,
                messages: messages,
                max_tokens: 300,
                temperature: 0.7,
                presence_penalty: 0.1,
                frequency_penalty: 0.1
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'CreateBot-Assistant/1.0'
                },
                httpsAgent: proxyAgent,
                timeout: 30000 // 30 секунд таймаут
            }
        );

        console.log('✅ Ответ от OpenAI получен');

        const assistantMessage = response.data.choices[0]?.message?.content;

        if (!assistantMessage) {
            throw new Error('Нет ответа от OpenAI');
        }

        // Анализ ответа для предложения быстрых кнопок
        const quickReplies = generateQuickReplies(assistantMessage, message);

        res.json({
            success: true,
            message: assistantMessage,
            quickReplies: quickReplies,
            usage: response.data.usage
        });

    } catch (error) {
        console.error('❌ Ошибка GPT API:', error.message);

        // Если ошибка от OpenAI, возвращаем fallback
        if (error.response?.status === 429) {
            return res.status(429).json({
                error: 'Слишком много запросов к ИИ, попробуйте через минуту',
                fallback: true,
                message: getFallbackResponse(req.body.message)
            });
        }

        // Общая обработка ошибок
        res.status(500).json({
            error: 'Временная ошибка ИИ-помощника',
            fallback: true,
            message: getFallbackResponse(req.body.message)
        });
    }
});

// Генерация быстрых ответов на основе контекста
function generateQuickReplies(assistantMessage, userMessage) {
    const lowerMessage = assistantMessage.toLowerCase();
    const lowerUser = userMessage.toLowerCase();

    if (lowerMessage.includes('бизнес') || lowerMessage.includes('компан')) {
        return [
            "🛒 Интернет-магазин",
            "🎓 Образование", 
            "🔧 Услуги",
            "🏠 Недвижимость",
            "💼 Другое"
        ];
    }

    if (lowerMessage.includes('задач') || lowerMessage.includes('функц')) {
        return [
            "📞 Отвечать на вопросы",
            "🛒 Принимать заказы", 
            "📝 Собирать заявки",
            "📅 Записывать на услуги",
            "💰 Продавать товары"
        ];
    }

    if (lowerMessage.includes('интеграц') || lowerMessage.includes('подключ')) {
        return [
            "✅ Нужна CRM",
            "💳 Нужна оплата",
            "📧 Нужна почта", 
            "❌ Пока не нужно"
        ];
    }

    if (lowerMessage.includes('готов') || lowerMessage.includes('сформир')) {
        return [
            "📋 Создать ТЗ сейчас",
            "💡 Добавить функции",
            "🔄 Изменить требования"
        ];
    }

    return [];
}

// Fallback ответы при недоступности OpenAI
function getFallbackResponse(userMessage) {
    const lowerInput = userMessage.toLowerCase();

    const responses = {
        'магазин': 'Понял! Интернет-магазин. Какие товары продаете? Нужны ли каталог, корзина и оплата?',
        'образован': 'Отлично! Образовательная сфера. Онлайн-курсы или школа? Нужна ли система записи?',
        'услуг': 'Ясно! Сфера услуг. Какие именно услуги? Нужна ли запись клиентов?',
        'недвижим': 'Понятно! Недвижимость. Продажа или аренда? Нужен ли поиск с фильтрами?',
        'заказ': 'Хорошо! Прием заказов. Нужны ли корзина и расчет стоимости?',
        'вопрос': 'Ясно! FAQ-бот. Какие вопросы чаще задают? Нужна ли связь с оператором?'
    };

    for (let key in responses) {
        if (lowerInput.includes(key)) {
            return responses[key];
        }
    }

    return 'Интересно! Расскажите подробнее - это поможет создать идеального бота для вас.';
}

// Endpoint для создания структурированного ТЗ
app.post('/api/generate-specification', async (req, res) => {
    try {
        const { conversation } = req.body;

        if (!conversation || conversation.length < 3) {
            return res.status(400).json({
                error: 'Недостаточно данных для создания ТЗ'
            });
        }

        const specPrompt = `На основе диалога с клиентом создай структурированное техническое задание для Telegram-бота.

Диалог: ${conversation.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Верни ответ СТРОГО в формате JSON:
{
    "title": "Название проекта",
    "business_type": "Тип бизнеса",
    "main_tasks": ["Задача 1", "Задача 2"],
    "target_audience": "Целевая аудитория", 
    "key_features": ["Функция 1", "Функция 2", "Функция 3"],
    "integrations": ["Интеграция 1"],
    "ai_level": "Уровень ИИ",
    "description": "Краткое описание проекта"
}

Отвечай ТОЛЬКО JSON, без дополнительного текста.`;

        const response = await axios.post(
            OPENAI_CONFIG.endpoint,
            {
                model: OPENAI_CONFIG.model,
                messages: [
                    { role: 'system', content: 'Ты - эксперт по созданию технических заданий. Отвечай только валидным JSON.' },
                    { role: 'user', content: specPrompt }
                ],
                max_tokens: 500,
                temperature: 0.3
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
                    'Content-Type': 'application/json'
                },
                httpsAgent: proxyAgent,
                timeout: 30000
            }
        );

        const specText = response.data.choices[0]?.message?.content;
        
        try {
            const specification = JSON.parse(specText);
            res.json({
                success: true,
                specification: specification
            });
        } catch (e) {
            // Если не удалось распарсить JSON, создаем fallback
            res.json({
                success: true,
                specification: createFallbackSpec(conversation)
            });
        }

    } catch (error) {
        console.error('Ошибка создания ТЗ:', error.message);
        res.status(500).json({
            error: 'Ошибка при создании ТЗ',
            specification: createFallbackSpec(req.body.conversation)
        });
    }
});

// Создание резервного ТЗ
function createFallbackSpec(conversation) {
    const text = conversation.map(msg => msg.content).join(' ').toLowerCase();
    
    return {
        title: "Индивидуальный Telegram-бот",
        business_type: "По требованиям клиента",
        main_tasks: ["Автоматизация общения", "Обработка запросов"],
        target_audience: "Клиенты компании",
        key_features: [
            "Умные диалоги",
            "Обработка команд", 
            "Интеграция с системами"
        ],
        integrations: ["По требованию"],
        ai_level: "Адаптивный",
        description: "Создание персонализированного Telegram-бота под требования бизнеса"
    };
}

// Проверка здоровья сервиса
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'CreateBot GPT Assistant'
    });
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('Глобальная ошибка:', err);
    res.status(500).json({
        error: 'Внутренняя ошибка сервера',
        success: false
    });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`🚀 GPT Assistant Server запущен на порту ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    
    if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️  ВНИМАНИЕ: Не установлен OPENAI_API_KEY!');
    }
});

module.exports = app;