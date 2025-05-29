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

const PRICING_SYSTEM = {
    hourlyRate: 3000,
    minProjectCost: 15000, // Минимальная стоимость проекта

    // Базовое время на типовые компоненты (в часах)
    baseComponents: {
        'базовая структура бота': 8,
        'система команд и меню': 4,
        'подключение к API Telegram': 2,
        'база данных пользователей': 6,
        'админ-панель': 12,
        'система логирования': 3,
        'деплой и настройка': 4
    },
    
    // Функциональные блоки
    features: {
        // E-commerce
        'каталог товаров': 12,
        'корзина': 8,
        'оформление заказа': 6,
        'интеграция платежей': 10,
        'система скидок': 6,
        'отслеживание доставки': 8,
        
        // Записи и бронирование
        'календарь записи': 10,
        'выбор специалиста': 6,
        'напоминания': 4,
        'отмена/перенос записи': 4,
        'интеграция с CRM': 12,
        
        // AI и аналитика
        'интеграция GPT': 8,
        'обработка изображений': 10,
        'распознавание голоса': 12,
        'генерация отчетов': 8,
        'дашборд аналитики': 16,
        
        // Коммуникации
        'рассылки': 6,
        'персонализация': 8,
        'многоязычность': 10,
        'уведомления': 4,
        
        // Специфичные
        'натальная карта': 20,
        'расчет гороскопа': 16,
        'анализ совместимости': 12,
        'обработка изображений по фото': 24
    },
    
    // Коэффициенты сложности
    complexity: {
        'простой': 1.0,
        'средний': 1.3,
        'сложный': 1.6,
        'очень сложный': 2.0
    },
    
    // Срочность
    urgency: {
        'стандарт': 1.0,
        'срочно': 1.3,
        'очень срочно': 1.5
    }
};

const multer = require('multer');
const fs = require('fs').promises;

// Настройка загрузки голосовых файлов
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB максимум
    fileFilter: (req, file, cb) => {
        // Разрешаем только аудио файлы
        const allowedTypes = ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp3'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Неподдерживаемый формат аудио'));
        }
    }
});

// Быстрые шаблоны для мгновенных ответов
const QUICK_TEMPLATES = {
    'магазин': {
        title: 'E-commerce бот для интернет-магазина',
        features: [
            'Каталог товаров с поиском и фильтрами',
            'Корзина и оформление заказов',
            'Интеграция с платежными системами',
            'Отслеживание статуса доставки',
            'Персональные рекомендации на основе ИИ'
        ],
        businessValue: [
            {
                title: '🚀 Увеличение конверсии на 40%',
                description: 'Автоматические напоминания о брошенных корзинах с персонализированными скидками'
            },
            {
                title: '📊 Предиктивная аналитика',
                description: 'ИИ прогнозирует спрос и оптимизирует складские запасы'
            },
            {
                title: '🎯 Умный ретаргетинг',
                description: 'Персонализированные предложения на основе истории покупок и поведения'
            }
        ],
        estimatedPrice: 'от 35,000₽',
        estimatedTime: '5-7 дней'
    },
    'запись': {
        title: 'Умная система записи на услуги',
        features: [
            'Интеллектуальный календарь с автоподбором времени',
            'Автоматическое бронирование и подтверждение',
            'Умные напоминания с учетом погоды и пробок',
            'История записей и предпочтений клиента',
            'Интеграция с CRM и календарями сотрудников'
        ],
        businessValue: [
            {
                title: '⏰ Экономия 4 часов в день',
                description: 'Полная автоматизация записей без участия администратора'
            },
            {
                title: '💰 Снижение no-show на 60%',
                description: 'Умные напоминания и автоматический перенос записей'
            },
            {
                title: '📈 Оптимизация загрузки',
                description: 'ИИ распределяет записи для максимальной выручки'
            }
        ],
        estimatedPrice: 'от 25,000₽',
        estimatedTime: '3-5 дней'
    },
    'доставк': {
        title: 'Интеллектуальная служба доставки',
        features: [
            'Прием заказов 24/7 с голосовым вводом',
            'Умный расчет стоимости и времени доставки',
            'Live-трекинг курьера на карте',
            'Автоматическая маршрутизация заказов',
            'Программа лояльности и реферальная система'
        ],
        businessValue: [
            {
                title: '🏃 Ускорение обработки на 70%',
                description: 'Мгновенное распределение заказов между курьерами'
            },
            {
                title: '📍 Оптимизация на 30%',
                description: 'ИИ строит оптимальные маршруты с учетом пробок'
            },
            {
                title: '⭐ Рейтинг 4.8+',
                description: 'Автосбор отзывов повышает качество сервиса'
            }
        ],
        estimatedPrice: 'от 45,000₽',
        estimatedTime: '7-10 дней'
    }
};

// Функция быстрого анализа текста
function analyzeQuickTask(input) {
    const lowerInput = input.toLowerCase();
    
    // Проверяем ключевые слова
    for (let key in QUICK_TEMPLATES) {
        if (lowerInput.includes(key)) {
            return QUICK_TEMPLATES[key];
        }
    }
    
    // Дополнительные паттерны
    const patterns = {
        'магазин': /продаж|товар|покуп|корзин|каталог|shop|store/i,
        'запись': /запис|брон|расписан|время|слот|прием|услуг|салон/i,
        'доставк': /доставк|курьер|привез|отправ|еда|delivery/i
    };
    
    for (let key in patterns) {
        if (patterns[key].test(lowerInput)) {
            return QUICK_TEMPLATES[key];
        }
    }
    
    return null;
}

// Генерация быстрого ответа
function generateQuickResponse(task) {
    return `🎯 Отлично! За ${task.estimatedTime} создам для вас: **${task.title}**\n\n` +
           `💰 Стоимость: ${task.estimatedPrice}\n\n` +
           `🔧 **Что будет в боте:**\n` +
           task.features.map((f, i) => `${i + 1}. ${f}`).join('\n') + '\n\n' +
           `🚀 **Дополнительные фишки для роста бизнеса:**\n` +
           task.businessValue.map(v => `\n${v.title}\n${v.description}`).join('\n') + '\n\n' +
           `Это решение увеличит вашу прибыль и автоматизирует рутину.\n` +
           `Хотите начать прямо сейчас?`;
}

// Функция интеллектуального расчета через GPT-4
async function calculateProjectEstimate(requirements, conversation) {
    try {
        // Промпт для GPT-4 для точной оценки
        const estimationPrompt = `Ты - опытный техлид с 10+ лет опыта оценки проектов Telegram-ботов.

ЗАДАЧА: Оцени время разработки в часах для каждой функции.

КОНТЕКСТ ПРОЕКТА:
${requirements}

БАЗОВЫЕ КОМПОНЕНТЫ (часы):
${JSON.stringify(PRICING_SYSTEM.baseComponents, null, 2)}

ТИПОВЫЕ ФУНКЦИИ (часы):
${JSON.stringify(PRICING_SYSTEM.features, null, 2)}

ПРАВИЛА ОЦЕНКИ:
1. Если функция есть в списке - используй готовую оценку
2. Для новых функций - оцени по аналогии
3. Учти интеграции и зависимости между функциями
4. Добавь 20% на тестирование и отладку
5. Добавь 10% на непредвиденные задачи

ФОРМАТ ОТВЕТА (строго JSON):
{
    "projectName": "Название проекта",
    "components": [
        {"name": "Компонент", "hours": 10, "description": "Что включает"}
    ],
    "totalHours": 100,
    "complexity": "средний",
    "risks": ["риск 1", "риск 2"],
    "timeline": "2-3 недели",
    "recommendations": ["совет 1", "совет 2"]
}`;

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4-0125-preview', // GPT-4 для точных расчетов
                messages: [
                    { role: 'system', content: estimationPrompt },
                    { role: 'user', content: `Оцени проект: ${requirements}` }
                ],
                response_format: { type: "json_object" },
                max_tokens: 1000,
                temperature: 0.3 // Низкая температура для точности
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
                    'Content-Type': 'application/json'
                },
                httpsAgent: proxyAgent
            }
        );

        const estimate = JSON.parse(response.data.choices[0].message.content);
        
        // Добавляем найденные функции если их нет
        const detectedFeatures = parseRequirements(requirements);
        
        // Расчет стоимости
        const cost = estimate.totalHours * PRICING_SYSTEM.hourlyRate;
        
        return {
            ...estimate,
            hourlyRate: PRICING_SYSTEM.hourlyRate,
            totalCost: cost,
            detectedFeatures: detectedFeatures, // Всегда добавляем
            costBreakdown: estimate.components.map(c => ({
                ...c,
                cost: c.hours * PRICING_SYSTEM.hourlyRate
            }))
        };

    } catch (error) {
        console.error('Ошибка оценки GPT-4:', error);
        // Fallback на базовую оценку
        return fallbackEstimate(requirements);
    }
}

// Резервная оценка без GPT-4
function fallbackEstimate(requirements) {
    const lower = requirements.toLowerCase();
    let totalHours = 0;
    let components = [];
    
    // Добавляем базовые компоненты
    Object.entries(PRICING_SYSTEM.baseComponents).forEach(([name, hours]) => {
        totalHours += hours;
        components.push({ name, hours, cost: hours * PRICING_SYSTEM.hourlyRate });
    });
    
    // Анализируем требования и добавляем функции
    const detectedFeatures = [];
    Object.entries(PRICING_SYSTEM.features).forEach(([feature, hours]) => {
        if (lower.includes(feature.split(' ')[0])) {
            totalHours += hours;
            detectedFeatures.push(feature);
            components.push({ 
                name: feature, 
                hours, 
                cost: hours * PRICING_SYSTEM.hourlyRate 
            });
        }
    });
    
    // Минимум 40 часов на любой проект
    totalHours = Math.max(totalHours, 40);
    
    return {
        projectName: 'Telegram-бот',
        components,
        totalHours,
        totalCost: totalHours * PRICING_SYSTEM.hourlyRate,
        complexity: 'средний',
        timeline: `${Math.ceil(totalHours / 40)} недель`,
        detectedFeatures: detectedFeatures // Добавляем найденные функции
    };
}

// Форматирование сметы
function formatEstimateMessage(estimate) {
    return `💰 **Расчет стоимости вашего проекта**

📋 **${estimate.projectName}**

⏱️ **Оценка времени:** ${estimate.totalHours} часов (${estimate.timeline})

💵 **Стоимость:** ${estimate.totalCost.toLocaleString('ru-RU')} руб.
*Из расчета ${PRICING_SYSTEM.hourlyRate} руб/час*

📊 **Детализация по компонентам:**
${estimate.costBreakdown.map(c => 
    `• ${c.name}: ${c.hours}ч = ${c.cost.toLocaleString('ru-RU')} руб.`
).join('\n')}

⚡ **Сложность проекта:** ${estimate.complexity}

${estimate.risks && estimate.risks.length > 0 ? 
`⚠️ **Риски:**
${estimate.risks.map(r => `• ${r}`).join('\n')}` : ''}

${estimate.recommendations && estimate.recommendations.length > 0 ?
`💡 **Рекомендации:**
${estimate.recommendations.map(r => `• ${r}`).join('\n')}` : ''}

---
✅ Это предварительная оценка. Финальная стоимость может отличаться на ±15% после детального анализа ТЗ.`;
}

// Извлечение требований из диалога
function extractRequirements(conversation) {
    return conversation
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .map(msg => msg.content)
        .join('\n');
}

const app = express();

// Инициализация кэша (10 минут TTL)
const cache = new NodeCache({ stdTTL: 600 });

// Инициализация Telegram бота
let bot;
if (process.env.TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
    console.log('📱 Telegram бот запущен');
    setupTelegramHandlers();
} else {
    console.log('⚠️ TELEGRAM_BOT_TOKEN не настроен');
}

// Подключение к MongoDB
if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('✅ MongoDB подключена'))
        .catch(err => console.error('❌ Ошибка MongoDB:', err));
} else {
    console.log('⚠️ MONGODB_URI не настроен');
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

// ===== СХЕМА ДЛЯ СМЕТ =====
const EstimateSchema = new mongoose.Schema({
    sessionId: String,
    projectName: String,
    components: Array,
    totalHours: Number,
    totalCost: Number,
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    clientInfo: Object,
    detectedFeatures: Array,
    timeline: String,
    createdAt: { type: Date, default: Date.now }
});

const Estimate = mongoose.model('Estimate', EstimateSchema);

// Безопасность с Helmet (настройки для разработки)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],  // ← ЭТО ВАЖНО ДЛЯ ONCLICK
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https://api.openai.com", "ws:", "wss:"],
            mediaSrc: ["'self'", "blob:"],  // Для аудио записи
        },
    },
    crossOriginEmbedderPolicy: false
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

// ===== ДОБАВИТЬ ДЛЯ ОТДАЧИ HTML =====
const path = require('path');

// Отдача статических файлов
app.use(express.static(__dirname));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
// ===== КОНЕЦ ДОБАВЛЕНИЯ =====

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
const ENHANCED_SYSTEM_PROMPT = `Ты - эксперт по созданию Telegram-ботов для ЛЮБЫХ ниш.

ВАЖНО: Клиенты могут быть из необычных сфер:
- Эзотерика (гадание, таро, астрология, хиромантия)
- Коучинг и психология  
- Инфобизнес
- Крипта и трейдинг
- Знакомства
- И любые другие!

Твой подход:
1. НЕ удивляйся необычным нишам - для каждой есть решение
2. Быстро предлагай конкретные функции
3. Не зацикливайся на вопросах - максимум 2-3
4. Показывай что понимаешь специфику их бизнеса

Примеры ответов:
"гадаю по ладони" → "Отлично! Создам бота для хиромантии с анализом фото ладоней и персональными прогнозами"
"продаю курсы" → "Понял! Образовательный бот с доступом к урокам и проверкой заданий"`;

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

// ===== ФУНКЦИИ АВТОМАТИЧЕСКОГО РАСЧЕТА СМЕТ =====

// Парсинг требований из текста
function parseRequirements(text) {
    const lower = text.toLowerCase();
    const detectedFeatures = [];
    
    // Улучшенные паттерны для точного распознавания
    const improvedPatterns = {
        // E-commerce
        'каталог товаров': /каталог[а-я\s]*товар|товар[а-я\s]*каталог|список товаров|ассортимент/i,
        'корзина': /корзин[аеу]|добавить в заказ|оформить заказ|cart/i,
        'интеграция платежей': /(интеграция[а-я\s]*)?плат[её]ж|оплат[аеу]|payment|pay|касс[аеу]/i,
        'система скидок': /скидк[аиеу]|промокод|discount|акци[яи]/i,
        'отслеживание доставки': /отслежив[а-я]*доставк|трек[а-я]*доставк|статус доставки/i,
        
        // Записи и бронирование  
        'календарь записи': /календар[ьяи][а-я\s]*запис|запис[аеиь][а-я\s]*календар|расписани[ея]/i,
        'выбор специалиста': /выбор[а-я\s]*специалист|специалист[а-я\s]*выбор|мастер[а-я\s]*выбор/i,
        'напоминания': /напомин[а-я]*|уведомлени[яеи]|notification|reminder/i,
        'отмена/перенос записи': /отмен[аеу][а-я\s]*запис|перенос[а-я\s]*запис|отложить/i,
        'интеграция с CRM': /crm|интеграция[а-я\s]*crm|система учёта/i,
        
        // AI и аналитика
        'интеграция GPT': /gpt|chatgpt|ai|искусственный интеллект|умн[ыаяое][а-я\s]*бот/i,
        'обработка изображений': /обработк[аеу][а-я\s]*изображен|фото[а-я\s]*обработк|анализ фото/i,
        'распознавание голоса': /распознаван[а-я]*голос|голос[а-я\s]*распознав|voice recognition/i,
        'генерация отчетов': /генерац[а-я]*отчёт|создан[а-я]*отчёт|отчётност/i,
        'дашборд аналитики': /дашборд|dashboard|аналитик[аеу]|статистик[аеу]/i,
        
        // Коммуникации
        'рассылки': /рассылк[аеиу]|массов[а-я]*отправк|newsletter|mailing/i,
        'персонализация': /персонализац[а-я]*|индивидуальн[а-я]*подход|personalization/i,
        'многоязычность': /многоязычн[а-я]*|мультиязычн[а-я]*|перевод|translation/i,
        'уведомления': /уведомлени[яеи]|пуш[а-я\s]*уведомлени/i,
        
        // Специфичные функции
        'натальная карта': /натальн[а-я]*карт|карт[аеу][а-я\s]*рожден/i,
        'расчет гороскопа': /гороскоп|астрологическ[а-я]*расчёт|прогноз[а-я\s]*звёзд/i,
        'анализ совместимости': /совместимост[ьи]|партнёрск[а-я]*анализ|compatibility/i,
        'обработка изображений по фото': /анализ[а-я\s]*по фото|фото[а-я\s]*анализ|загруз[а-я]*фото/i
    };
    
    // Проверяем каждый паттерн
    Object.entries(improvedPatterns).forEach(([feature, pattern]) => {
        if (pattern.test(text)) {
            detectedFeatures.push(feature);
        }
    });
    
    // Дополнительная проверка для функций из PRICING_SYSTEM
    Object.keys(PRICING_SYSTEM.features).forEach(feature => {
        if (!detectedFeatures.includes(feature)) {
            // Проверяем точное совпадение слов (не частичное включение)
            const featureWords = feature.toLowerCase().split(' ');
            const textWords = lower.split(/\s+/);
            
            // Функция найдена, если все ключевые слова присутствуют в тексте
            const foundAllWords = featureWords.every(word => 
                textWords.some(textWord => textWord.includes(word) && word.length > 2)
            );
            
            if (foundAllWords) {
                detectedFeatures.push(feature);
            }
        }
    });
    
    // Удаляем дубликаты
    return [...new Set(detectedFeatures)];
}

// Отправка сметы в Telegram
async function sendEstimateToTelegram(estimate, sessionId) {
    if (!bot || !process.env.ADMIN_CHAT_ID) {
        console.log('⚠️ Telegram бот или ADMIN_CHAT_ID не настроены');
        return;
    }
    
    try {
        // Сохраняем в БД
        const saved = await Estimate.create({
            sessionId,
            ...estimate
        });
        
        // Обеспечиваем наличие detectedFeatures
        const detectedFeatures = estimate.detectedFeatures || [];
        const components = estimate.components || [];
        
        // Форматируем сообщение
        const message = 
            `📊 **НОВАЯ СМЕТА**\n\n` +
            `🆔 ID: ${saved._id}\n` +
            `💰 **ИТОГО: ${estimate.totalCost.toLocaleString('ru-RU')} ₽**\n` +
            `⏱️ Время: ${estimate.totalHours} часов\n` +
            `📅 Срок: ${estimate.timeline}\n\n` +
            (detectedFeatures.length > 0 ? 
                `📋 Найденные функции:\n${detectedFeatures.map(f => `• ${f}`).join('\n')}\n\n` : 
                '📋 Базовые функции бота\n\n'
            ) +
            `💼 Компоненты:\n` +
            components.slice(0, 5).map(c => `• ${c.name}: ${c.hours}ч`).join('\n');
        
        // Кнопки
        const keyboard = {
            inline_keyboard: [[
                { text: '✅ Утвердить', callback_data: `approve:${saved._id}` },
                { text: '❌ Отклонить', callback_data: `reject:${saved._id}` }
            ]]
        };
        
        await bot.sendMessage(
            process.env.ADMIN_CHAT_ID,
            message,
            { 
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }
        );
        
        console.log(`📊 Смета отправлена в Telegram: ${saved._id}`);
        
    } catch (error) {
        console.error('Ошибка отправки в Telegram:', error);
    }
}

// Обработчики Telegram
function setupTelegramHandlers() {
    if (!bot) return;
    
    bot.on('callback_query', async (query) => {
        try {
            const [action, estimateId] = query.data.split(':');
            
            if (action === 'approve') {
                await Estimate.findByIdAndUpdate(estimateId, { status: 'approved' });
                bot.answerCallbackQuery(query.id, { text: '✅ Смета утверждена!' });
                
                // Отправляем уведомление
                bot.editMessageText(
                    query.message.text + '\n\n✅ **СМЕТА УТВЕРЖДЕНА**',
                    {
                        chat_id: query.message.chat.id,
                        message_id: query.message.message_id,
                        parse_mode: 'Markdown'
                    }
                );
                
            } else if (action === 'reject') {
                await Estimate.findByIdAndUpdate(estimateId, { status: 'rejected' });
                bot.answerCallbackQuery(query.id, { text: '❌ Смета отклонена' });
                
                // Отправляем уведомление
                bot.editMessageText(
                    query.message.text + '\n\n❌ **СМЕТА ОТКЛОНЕНА**',
                    {
                        chat_id: query.message.chat.id,
                        message_id: query.message.message_id,
                        parse_mode: 'Markdown'
                    }
                );
            }
        } catch (error) {
            console.error('Ошибка обработки callback:', error);
            bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка' });
        }
    });
    
    // Команды для Telegram бота
    bot.onText(/\/stats/, async (msg) => {
        try {
            const chatId = msg.chat.id;
            
            const total = await Estimate.countDocuments();
            const approved = await Estimate.countDocuments({ status: 'approved' });
            const pending = await Estimate.countDocuments({ status: 'pending' });
            const rejected = await Estimate.countDocuments({ status: 'rejected' });
            
            const statsMessage = 
                `📊 **СТАТИСТИКА СМЕТ**\n\n` +
                `📋 Всего: ${total}\n` +
                `✅ Утверждено: ${approved}\n` +
                `⏳ В ожидании: ${pending}\n` +
                `❌ Отклонено: ${rejected}\n\n` +
                `💯 Конверсия: ${total > 0 ? (approved / total * 100).toFixed(1) : 0}%`;
            
            bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Ошибка получения статистики:', error);
        }
    });
}

// ===== ИСПРАВЛЕННАЯ ЛОГИКА АВТОМАТИЧЕСКОГО РАСЧЕТА =====
app.post('/api/gpt-assistant', async (req, res) => {
    try {
        console.log('📨 Получен запрос к GPT:', req.body);

        const { message, conversation = [], sessionId, mode } = req.body;
        
        // Специальная обработка для режима формулировки
        if (mode === 'formulation' || message === 'FORMULATION_MODE_START') {
            return handleFormulationMode(req, res);
        }

        // Проверяем, можем ли дать мгновенный ответ
        const quickTask = analyzeQuickTask(message);
        
        if (quickTask) {
            console.log('⚡ Найден быстрый шаблон:', quickTask.title);
            
            // Сохраняем в базу если есть MongoDB
            if (sessionId && Conversation) {
                try {
                    await Conversation.findOneAndUpdate(
                        { sessionId },
                        {
                            $push: {
                                messages: { 
                                    role: 'user', 
                                    content: message 
                                }
                            },
                            quickTask: quickTask
                        },
                        { upsert: true }
                    );
                } catch (dbError) {
                    console.error('DB Error:', dbError);
                }
            }
            
            // Возвращаем мгновенный ответ
            return res.json({
                success: true,
                message: generateQuickResponse(quickTask),
                quickTask: quickTask,
                businessFeatures: quickTask.businessValue,
                quickReplies: [
                    '✅ Оформить заказ',
                    '➕ Добавить функции',
                    '💬 Уточнить детали',
                    '🔄 Другая задача'
                ]
            });
        }

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

        // ===== ИСПРАВЛЕННАЯ ЛОГИКА АВТОМАТИЧЕСКОГО РАСЧЕТА =====
        const allMessages = [...conversation, { role: 'user', content: message }];
        const fullText = allMessages.map(m => m.content).join(' ');
        
        // Улучшенные условия для расчета
        const shouldCalculate = 
            conversation.length >= 8 || // После 8 сообщений (не 4)
            message.toLowerCase().includes('достаточно информации') ||
            message.toLowerCase().includes('рассчитайте смету') ||
            message.toLowerCase().includes('создайте смету') ||
            message.toLowerCase().includes('сколько будет стоить') ||
            message.toLowerCase().includes('какая цена') ||
            message.toLowerCase().includes('сколько стоит') ||
            (parseRequirements(fullText).length >= 5 && conversation.length >= 6); // 5+ функций И 6+ сообщений

        if (shouldCalculate) {
            console.log('💰 Запускаем автоматический расчет сметы...');
            
            // Используем единую функцию расчета
            const estimate = await calculateProjectEstimate(fullText, conversation);
            
            // Отправляем в Telegram
            await sendEstimateToTelegram(estimate, sessionId);
            
            // Сохраняем смету в базу
            if (sessionId && Conversation) {
                try {
                    await Conversation.findOneAndUpdate(
                        { sessionId },
                        { 
                            estimate: estimate,
                            estimatedAt: new Date()
                        }
                    );
                } catch (dbError) {
                    console.error('Ошибка сохранения сметы:', dbError);
                }
            }
            
            // Отвечаем клиенту со сметой
            const result = {
                success: true,
                message: formatEstimateMessage(estimate),
                estimate: estimate,
                quickReplies: ['📞 Позвоните мне', '✏️ Изменить требования', '💬 Задать вопрос']
            };
            
            // Кэшируем результат
            cache.set(messageHash, result);
            
            return res.json(result);
        }
        // ===== КОНЕЦ ИСПРАВЛЕННОЙ ЛОГИКИ =====

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

// Новая функция для режима формулировки
async function handleFormulationMode(req, res) {
    const { message, conversation = [], sessionId } = req.body;

    // ===== УЛУЧШЕННАЯ ЛОГИКА АВТОМАТИЧЕСКОГО РАСЧЕТА =====
    // Проверяем нужно ли считать смету (более строгие условия)
    const shouldCalculate = 
        message.toLowerCase().includes('рассчитайте') ||
        message.toLowerCase().includes('посчитайте') ||
        message.toLowerCase().includes('сколько будет стоить') ||
        message.toLowerCase().includes('какая цена') ||
        message.toLowerCase().includes('создайте смету') ||
        (conversation.length >= 10 && parseRequirements(conversation.map(m => m.content).join(' ')).length >= 4); // После 10 сообщений И 4+ функций

    let estimate = null;
    let estimateMessage = '';

    if (shouldCalculate) {
        const requirements = extractRequirements(conversation);
        
        // Считаем смету используя единую функцию
        estimate = await calculateProjectEstimate(requirements, conversation);
        estimateMessage = formatEstimateMessage(estimate);
        
        // Отправляем в Telegram
        await sendEstimateToTelegram(estimate, sessionId);
        
        // Сохраняем в БД
        if (sessionId && Conversation) {
            await Conversation.findOneAndUpdate(
                { sessionId },
                { 
                    estimate: estimate,
                    estimatedAt: new Date()
                }
            );
        }
    }
    
    // Специальный промпт для формулировки
    const formulationPrompt = `Ты - эксперт по созданию технических заданий для Telegram-ботов.

РЕЖИМ: Помощь с формулировкой задачи

Твоя задача:
1. Понять что хочет клиент, даже если описание нестандартное (гадание, астрология, коучинг и т.д.)
2. НЕ зацикливаться на одних и тех же вопросах
3. Быстро сформулировать понятное ТЗ
4. Предложить конкретные функции для его ниши

Клиент может описать необычный бизнес - это нормально. Примеры:
- "прогнозы по ладони" → бот для хиромантии с анализом фото
- "помогаю людям" → уточни в какой сфере (психология, коучинг, и т.д.)
- "продаю энергию" → возможно эзотерика или энергетические практики

ВАЖНО: 
- Максимум 2-3 уточняющих вопроса
- Затем сразу предлагай решение
- Не повторяй одинаковые вопросы
- Будь готов к нестандартным нишам
- НЕ предлагай расчет сметы каждый раз - только когда клиент готов или явно просит`;

    let messages = [
        { role: 'system', content: formulationPrompt }
    ];
    
    // Если это начало режима формулировки
    if (message === 'FORMULATION_MODE_START') {
        messages.push({
            role: 'user',
            content: 'Клиент выбрал "Нужна помощь с формулировкой". Начни диалог.'
        });
    } else {
        // Добавляем историю разговора
        messages = messages.concat(conversation.slice(-6));
        messages.push({ role: 'user', content: message });
    }
    
    try {
        // Вызов OpenAI
        const response = await axios.post(
            OPENAI_CONFIG.endpoint,
            {
                model: OPENAI_CONFIG.model,
                messages: messages,
                max_tokens: 400,
                temperature: 0.8, // Больше креативности для нестандартных ниш
                presence_penalty: 0.3, // Избегаем повторений
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
        
        const assistantMessage = response.data.choices[0]?.message?.content;
        
        // Анализируем ответ для генерации кнопок
        const quickReplies = generateFormulationButtons(assistantMessage, conversation);
        
        res.json({
            success: true,
            message: estimateMessage || assistantMessage, // Показываем смету если есть
            quickReplies: estimate ? [
                '✅ Утвердить смету',
                '📝 Скорректировать функции',
                '📞 Обсудить детали',
                '📄 Получить в PDF'
            ] : quickReplies,
            estimate: estimate // Передаем данные сметы
        });
        
    } catch (error) {
        console.error('OpenAI Error:', error);
        res.status(500).json({
            error: 'Ошибка AI',
            fallback: true,
            message: 'Расскажите, какой у вас бизнес и что должен делать бот?'
        });
    }
}

// Генерация умных кнопок на основе контекста
function generateFormulationButtons(aiResponse, conversation) {
    const lower = aiResponse.toLowerCase();
    
    // Если AI спрашивает о типе бизнеса
    if (lower.includes('бизнес') || lower.includes('занимаетесь')) {
        return [];  // Пусть пишут своими словами
    }
    
    // Если AI готов создать ТЗ
    if (lower.includes('готов') || lower.includes('создам') || lower.includes('предлагаю')) {
        return [
            '✅ Да, всё верно',
            '📝 Добавить детали',
            '📋 Создать полное ТЗ',
            '💰 Узнать стоимость'
        ];
    }
    
    // Если AI уточняет детали
    if (lower.includes('уточн') || lower.includes('какие')) {
        return [
            '💬 Отвечу текстом',
            '🎤 Запишу голосом',
            '📋 Достаточно инфо, создайте ТЗ'
        ];
    }
    
    return [];
}

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

// ===== ENDPOINT ДЛЯ ГОЛОСОВЫХ СООБЩЕНИЙ =====
app.post('/api/voice-message', upload.single('audio'), async (req, res) => {
    try {
        console.log('🎤 Получено голосовое сообщение');
        
        if (!req.file) {
            return res.status(400).json({ 
                error: 'Аудио файл не найден' 
            });
        }

        const { sessionId } = req.body;
        
        // Для демо возвращаем симулированный текст
        // В production здесь будет вызов Whisper API
        const simulatedTexts = [
            'нужен бот для интернет магазина',
            'хочу автоматизировать запись клиентов',
            'нужна доставка еды с отслеживанием'
        ];
        
        const transcription = simulatedTexts[Math.floor(Math.random() * simulatedTexts.length)];
        
        // Удаляем временный файл
        try {
            await fs.unlink(req.file.path);
        } catch (e) {
            console.error('Не удалось удалить файл:', e);
        }
        
        // Анализируем текст
        const quickTask = analyzeQuickTask(transcription);
        
        res.json({
            success: true,
            transcription: transcription,
            quickTask: quickTask,
            businessFeatures: quickTask?.businessValue,
            message: quickTask ? generateQuickResponse(quickTask) : null
        });
        
    } catch (error) {
        console.error('❌ Ошибка обработки голоса:', error);
        res.status(500).json({ 
            error: 'Ошибка обработки голосового сообщения',
            fallback: true 
        });
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

// ===== ENDPOINT ДЛЯ СТАТИСТИКИ СМЕТ =====
app.get('/api/estimates/stats', async (req, res) => {
    try {
        if (!Estimate) {
            return res.json({
                total: 0,
                approved: 0,
                pending: 0,
                rejected: 0,
                approvalRate: '0%'
            });
        }

        const total = await Estimate.countDocuments();
        const approved = await Estimate.countDocuments({ status: 'approved' });
        const pending = await Estimate.countDocuments({ status: 'pending' });
        const rejected = await Estimate.countDocuments({ status: 'rejected' });
        
        res.json({
            total,
            approved,
            pending,
            rejected,
            approvalRate: total > 0 ? (approved / total * 100).toFixed(1) + '%' : '0%'
        });
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

// ===== ENDPOINT ДЛЯ ПОЛУЧЕНИЯ СПИСКА СМЕТ =====
app.get('/api/estimates', async (req, res) => {
    try {
        if (!Estimate) {
            return res.json([]);
        }

        const estimates = await Estimate.find()
            .sort({ createdAt: -1 })
            .limit(50);
        
        res.json(estimates);
    } catch (error) {
        console.error('Ошибка получения смет:', error);
        res.status(500).json({ error: 'Ошибка получения смет' });
    }
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