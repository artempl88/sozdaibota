// server.js - Улучшенная серверная часть с безопасностью и аналитикой

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const NodeCache = require('node-cache');
const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');
require('dotenv').config();

const app = express();

// Инициализация кэша (10 минут TTL)
const cache = new NodeCache({ stdTTL: 600 });

// Инициализация Telegram бота
let bot;
if (process.env.TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
}

// Подключение к MongoDB
if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('✅ MongoDB подключена'))
        .catch(err => console.error('❌ Ошибка MongoDB:', err));
}

// Схемы MongoDB
const ConversationSchema = new mongoose.Schema({
    sessionId: String,
    messages: [{
        role: String,
        content: String,
        timestamp: { type: Date, default: Date.now }
    }],
    specification: Object,
    createdAt: { type: Date, default: Date.now }
});

const AnalyticsSchema = new mongoose.Schema({
    event: String,
    data: Object,
    timestamp: { type: Date, default: Date.now },
    ip: String,
    userAgent: String
});

const Conversation = mongoose.model('Conversation', ConversationSchema);
const Analytics = mongoose.model('Analytics', AnalyticsSchema);

// Безопасность с Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// Middleware
app.use(express.json({ limit: '10mb' }));

// Улучшенный CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['https://sozdaibota.ru', 'https://www.sozdaibota.ru', 'http://localhost:3000'];

app.use(cors({
    origin: allowedOrigins,
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

// Функции шифрования
const encryptData = (text) => {
    if (!process.env.ENCRYPTION_KEY) return text;
    const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
};

const decryptData = (encryptedText) => {
    if (!process.env.ENCRYPTION_KEY) return encryptedText;
    try {
        const decipher = crypto.createDecipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return encryptedText;
    }
};

// Конфигурация OpenAI
const OPENAI_CONFIG = {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions'
};

// Конфигурация прокси из переменных окружения
const PROXY_CONFIG = {
    host: process.env.PROXY_HOST || '141.98.187.117',
    port: process.env.PROXY_PORT || '8000',
    username: process.env.PROXY_USERNAME || 'qr4NBX',
    password: process.env.PROXY_PASSWORD || 'mFmLGN'
};

// Создание прокси-агента
let proxyAgent = null;
if (PROXY_CONFIG.host && PROXY_CONFIG.port && PROXY_CONFIG.username && PROXY_CONFIG.password) {
    proxyAgent = new HttpsProxyAgent(
        `http://${PROXY_CONFIG.username}:${PROXY_CONFIG.password}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`
    );
    console.log(`🔗 Прокси настроен: ${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`);
} else {
    console.warn('⚠️  Прокси не настроен - используется прямое подключение');
}

// Улучшенный системный промпт
const ENHANCED_SYSTEM_PROMPT = `Ты - старший технический консультант компании "Создать Бота" с 10-летним опытом.

Твой подход:
1. Начни с понимания БИЗНЕС-ЗАДАЧИ, а не технических деталей
2. Задавай вопросы по методологии Jobs To Be Done
3. Предлагай решения на основе успешных кейсов

Структура диалога:
- Этап 1: Выясни тип бизнеса и основную проблему
- Этап 2: Определи целевую аудиторию и их боли
- Этап 3: Предложи конкретные функции для решения
- Этап 4: Обсуди интеграции и автоматизации
- Этап 5: Сформируй четкое ТЗ с метриками успеха

Примеры умных вопросов:
- "Какую основную задачу решают ваши клиенты?"
- "Что сейчас отнимает больше всего времени?"
- "Какие метрики покажут успех бота?"

Стиль: дружелюбный эксперт, максимум 2-3 предложения.`;

// A/B тестирование промптов
const PROMPT_VARIANTS = {
    A: "Привет! Я помогу создать идеального бота. Расскажи о своем бизнесе?",
    B: "Здравствуйте! За 5 минут создам ТЗ на бота. Какую задачу решаем?"
};

const getRandomPrompt = () => {
    return Math.random() > 0.5 ? PROMPT_VARIANTS.A : PROMPT_VARIANTS.B;
};

// Аналитика
app.post('/api/analytics', async (req, res) => {
    try {
        const { event, data } = req.body;
        
        if (Analytics) {
            await Analytics.create({
                event,
                data,
                timestamp: new Date(),
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка аналитики:', error);
        res.status(500).json({ error: 'Ошибка сохранения аналитики' });
    }
});

// Основной endpoint для GPT-помощника с кэшированием
app.post('/api/gpt-assistant', async (req, res) => {
    try {
        console.log('📨 Получен запрос к GPT:', req.body);

        const { message, conversation = [], sessionId } = req.body;

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

        // Проверка кэша
        const messageHash = crypto.createHash('md5').update(message + JSON.stringify(conversation)).digest('hex');
        const cachedResponse = cache.get(messageHash);
        if (cachedResponse) {
            console.log('📦 Ответ из кэша');
            return res.json(cachedResponse);
        }

        // Сохранение диалога в MongoDB
        if (sessionId && Conversation) {
            try {
                await Conversation.findOneAndUpdate(
                    { sessionId },
                    {
                        $push: {
                            messages: { role: 'user', content: message }
                        }
                    },
                    { upsert: true }
                );
            } catch (dbError) {
                console.error('Ошибка сохранения в БД:', dbError);
            }
        }

        // Подготовка сообщений для OpenAI
        const messages = [
            { role: 'system', content: ENHANCED_SYSTEM_PROMPT },
            ...conversation.slice(-10), // Берем последние 10 сообщений для контекста
            { role: 'user', content: message }
        ];

        console.log('🧠 Отправляем запрос к OpenAI...');

        // Запрос к OpenAI через прокси
        const axiosConfig = {
            headers: {
                'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'CreateBot-Assistant/2.0'
            },
            timeout: 30000
        };

        // Добавляем прокси только если он настроен
        if (proxyAgent) {
            axiosConfig.httpsAgent = proxyAgent;
            console.log('🔗 Используется прокси для запроса к OpenAI');
        }

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
            axiosConfig
        );

        console.log('✅ Ответ от OpenAI получен');

        const assistantMessage = response.data.choices[0]?.message?.content;

        if (!assistantMessage) {
            throw new Error('Нет ответа от OpenAI');
        }

        // Сохранение ответа ассистента в MongoDB
        if (sessionId && Conversation) {
            try {
                await Conversation.findOneAndUpdate(
                    { sessionId },
                    {
                        $push: {
                            messages: { role: 'assistant', content: assistantMessage }
                        }
                    }
                );
            } catch (dbError) {
                console.error('Ошибка сохранения ответа в БД:', dbError);
            }
        }

        // Анализ ответа для предложения быстрых кнопок
        const quickReplies = generateQuickReplies(assistantMessage, message);

        const result = {
            success: true,
            message: assistantMessage,
            quickReplies: quickReplies,
            usage: response.data.usage
        };

        // Кэширование ответа
        cache.set(messageHash, result);

        res.json(result);

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

// Webhook для отправки лидов в Telegram
app.post('/api/lead-notification', async (req, res) => {
    try {
        const { name, telegram, message, specification } = req.body;
        
        if (!bot || !process.env.ADMIN_CHAT_ID) {
            return res.json({ success: false, error: 'Telegram не настроен' });
        }
        
        const text = `🚀 Новая заявка!\n\n` +
                    `👤 Имя: ${name}\n` +
                    `💬 Telegram: ${telegram}\n` +
                    `📝 Сообщение: ${message}\n` +
                    `📋 ТЗ создано: ${specification ? 'Да' : 'Нет'}`;
        
        await bot.sendMessage(process.env.ADMIN_CHAT_ID, text);
        
        // Сохранение аналитики
        if (Analytics) {
            await Analytics.create({
                event: 'lead_submitted',
                data: { name, telegram, hasSpecification: !!specification },
                ip: req.ip
            });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка отправки в Telegram:', error);
        res.status(500).json({ error: 'Ошибка отправки уведомления' });
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

    return getRandomPrompt();
}

// Endpoint для создания структурированного ТЗ
app.post('/api/generate-specification', async (req, res) => {
    try {
        const { conversation, sessionId } = req.body;

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
    "description": "Краткое описание проекта",
    "success_metrics": ["Метрика 1", "Метрика 2"]
}

Отвечай ТОЛЬКО JSON, без дополнительного текста.`;

        const axiosConfigSpec = {
            headers: {
                'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        };

        // Добавляем прокси только если он настроен
        if (proxyAgent) {
            axiosConfigSpec.httpsAgent = proxyAgent;
            console.log('🔗 Используется прокси для создания ТЗ');
        }

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
            axiosConfigSpec
        );

        const specText = response.data.choices[0]?.message?.content;
        
        try {
            const specification = JSON.parse(specText);
            
            // Сохранение ТЗ в MongoDB
            if (sessionId && Conversation) {
                await Conversation.findOneAndUpdate(
                    { sessionId },
                    { specification: specification }
                );
            }
            
            // Аналитика создания ТЗ
            if (Analytics) {
                await Analytics.create({
                    event: 'specification_created',
                    data: { sessionId, businessType: specification.business_type },
                    ip: req.ip
                });
            }
            
            res.json({
                success: true,
                specification: specification
            });
        } catch (e) {
            // Если не удалось распарсить JSON, создаем fallback
            const fallbackSpec = createFallbackSpec(conversation);
            res.json({
                success: true,
                specification: fallbackSpec
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
        description: "Создание персонализированного Telegram-бота под требования бизнеса",
        success_metrics: ["Увеличение конверсии", "Снижение нагрузки на поддержку"]
    };
}

// Получение аналитики (для админки)
app.get('/api/analytics/summary', async (req, res) => {
    try {
        if (!Analytics) {
            return res.json({ error: 'База данных недоступна' });
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const [totalConversations, todayConversations, specificationsCreated] = await Promise.all([
            Analytics.countDocuments({ event: 'conversation_started' }),
            Analytics.countDocuments({ 
                event: 'conversation_started',
                timestamp: { $gte: today }
            }),
            Analytics.countDocuments({ event: 'specification_created' })
        ]);
        
        res.json({
            totalConversations,
            todayConversations,
            specificationsCreated,
            conversionRate: totalConversations > 0 ? (specificationsCreated / totalConversations * 100).toFixed(1) : 0
        });
    } catch (error) {
        console.error('Ошибка получения аналитики:', error);
        res.status(500).json({ error: 'Ошибка получения аналитики' });
    }
});

// Проверка здоровья сервиса
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'CreateBot GPT Assistant v2.0',
        features: {
            mongodb: !!mongoose.connection.readyState,
            telegram: !!bot,
            cache: cache.getStats(),
            encryption: !!process.env.ENCRYPTION_KEY,
            proxy: !!proxyAgent ? `${PROXY_CONFIG.host}:${PROXY_CONFIG.port}` : 'disabled'
        }
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
    console.log(`🚀 GPT Assistant Server v2.0 запущен на порту ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    
    if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️  ВНИМАНИЕ: Не установлен OPENAI_API_KEY!');
    }
    
    if (!process.env.MONGODB_URI) {
        console.warn('⚠️  ВНИМАНИЕ: Не установлен MONGODB_URI!');
    }
    
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        console.warn('⚠️  ВНИМАНИЕ: Не установлен TELEGRAM_BOT_TOKEN!');
    }
});

module.exports = app;