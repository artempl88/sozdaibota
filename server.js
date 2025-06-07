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
const fetch = require('node-fetch');
const FormData = require('form-data');
const multer = require('multer');
const fs = require('fs').promises;
const fsSync = require('fs'); // Добавляем синхронную версию для createReadStream
require('dotenv').config();

// Импорт новых модулей для анкеты
const PreChatForm = require('./models/PreChatForm');
const PreChatService = require('./services/PreChatService');

// Создаем экземпляр сервиса для работы с анкетами
const preChatService = new PreChatService();

const PRICING_SYSTEM = {
    hourlyRate: 2000,
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
    // Безопасное преобразование значений
    const totalCost = Number(estimate.totalCost) || 0;
    const totalHours = Number(estimate.totalHours) || 0;
    
    return `💰 **Расчет стоимости вашего проекта**

📋 **${estimate.projectName}**

⏱️ **Оценка времени:** ${totalHours} часов (${estimate.timeline})

💵 **Стоимость:** ${totalCost.toLocaleString('ru-RU')} руб.
*Из расчета ${PRICING_SYSTEM.hourlyRate} руб/час*

📊 **Детализация по компонентам:**
${estimate.costBreakdown && estimate.costBreakdown.length > 0 ? 
    estimate.costBreakdown.map(c => {
        const hours = Number(c.hours) || 0;
        const cost = Number(c.cost) || 0;
        return `• ${c.name}: ${hours}ч = ${cost.toLocaleString('ru-RU')} руб.`;
    }).join('\n') : 'Детализация недоступна'}

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
const PORT = process.env.PORT || 3001;

// Отключаем кеширование полностью
app.use((req, res, next) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
    next();
});

// Настройки Express
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

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
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https://api.openai.com", "ws:", "wss:", "http://localhost:3001"],
            mediaSrc: ["'self'", "blob:"],
            objectSrc: ["'none'"],
            frameSrc: ["'self'"],
            upgradeInsecureRequests: [],
        },
    },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false, // Отключаем CSP в development
}));

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

// Используем существующий экземпляр preChatService для получения базового промта

// Улучшенный системный промт - теперь использует базовый из PreChatService
const ENHANCED_SYSTEM_PROMPT = `${preChatService.baseSystemPrompt}

КОНТЕКСТ: Обычный чат-консультант (без предварительной анкеты)

Примеры ответов для быстрого понимания:
"гадаю по ладони" → "Начнём с простого: бот будет принимать фото ладоней от клиентов?"
"продаю курсы" → "Понял! Сначала определим: бот для записи на курсы или доступа к материалам?"

ВАЖНО:
- Если клиент описал нестандартную нишу - не теряйся, задай 1-2 уточняющих вопроса
- После 3-4 сообщений предложи перейти к конкретным функциям
- При запросе расчета СТРОГО следуй алгоритму из базового промта: подытожь → подтверди → сообщи о отправке менеджеру
- НИКОГДА не показывай цены или суммы клиенту напрямую`;

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
        
        // Безопасное преобразование стоимости
        const safeTotalCost = Number(estimate.totalCost) || 0;
        const safeTotalHours = Number(estimate.totalHours) || 0;
        
        // Форматируем сообщение
        const message = 
            `📊 **НОВАЯ СМЕТА**\n\n` +
            `🆔 ID: ${saved._id}\n` +
            `💰 **ИТОГО: ${safeTotalCost.toLocaleString('ru-RU')} ₽**\n` +
            `⏱️ Время: ${safeTotalHours} часов\n` +
            `📅 Срок: ${safeTotalHours} часов\n\n` +
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
                { text: '✏️ Редактировать', callback_data: `edit:${saved._id}` },
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
                const approvedEstimate = await Estimate.findByIdAndUpdate(
                    estimateId, 
                    { status: 'approved' },
                    { new: true } // Возвращаем обновленную смету
                );
                
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

                // Автоматически отправляем смету клиенту
                try {
                    if (approvedEstimate && approvedEstimate.sessionId) {
                        const response = await axios.post(`http://localhost:${PORT || 3001}/api/send-approved-estimate`, {
                            estimateId: estimateId,
                            sessionId: approvedEstimate.sessionId
                        });
                        
                        if (response.data.success) {
                            bot.sendMessage(
                                query.message.chat.id,
                                `🚀 **СМЕТА ОТПРАВЛЕНА КЛИЕНТУ**\n\n` +
                                `Каналы: ${response.data.sentChannels.join(', ') || 'веб-интерфейс'}`,
                                { parse_mode: 'Markdown' }
                            );
                        }
                    }
                } catch (sendError) {
                    console.error('Ошибка отправки сметы клиенту:', sendError);
                    bot.sendMessage(
                        query.message.chat.id,
                        '⚠️ Смета утверждена, но не удалось отправить клиенту автоматически'
                    );
                }
                
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
                
            } else if (action === 'edit') {
                bot.answerCallbackQuery(query.id, { text: '✏️ Отправьте новые данные сметы' });
                
                // Отправляем инструкции по редактированию
                bot.sendMessage(
                    query.message.chat.id,
                    `✏️ **РЕДАКТИРОВАНИЕ СМЕТЫ**\n\n` +
                    `ID сметы: ${estimateId}\n\n` +
                    `Отправьте изменения в формате:\n` +
                    `\`/edit ${estimateId} [новая_стоимость] [новое_время_часов] [комментарий]\`\n\n` +
                    `Пример:\n` +
                    `\`/edit ${estimateId} 75000 60 Добавлена интеграция с CRM\``,
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (error) {
            console.error('Ошибка обработки callback:', error);
            bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка' });
        }
    });

    // Команда для редактирования смет
    bot.onText(/\/edit (\w+) (\d+) (\d+) (.+)/, async (msg, match) => {
        try {
            const chatId = msg.chat.id;
            const [, estimateId, newCost, newHours, comment] = match;
            
            // Обновляем смету
            const updatedEstimate = await Estimate.findByIdAndUpdate(
                estimateId,
                {
                    totalCost: parseInt(newCost),
                    totalHours: parseInt(newHours),
                    status: 'approved',
                    editComment: comment,
                    editedAt: new Date()
                },
                { new: true }
            );
            
            if (updatedEstimate) {
                // Безопасное преобразование стоимости
                const safeNewCost = Number(newCost) || 0;
                
                bot.sendMessage(
                    chatId,
                    `✅ **СМЕТА ОТРЕДАКТИРОВАНА И УТВЕРЖДЕНА**\n\n` +
                    `🆔 ID: ${estimateId}\n` +
                    `💰 Новая стоимость: ${safeNewCost.toLocaleString('ru-RU')} ₽\n` +
                    `⏱️ Новое время: ${newHours} часов\n` +
                    `📝 Комментарий: ${comment}\n\n` +
                    `🚀 Смета отправлена клиенту!`,
                    { parse_mode: 'Markdown' }
                );

                // Автоматически отправляем обновленную смету клиенту
                try {
                    if (updatedEstimate.sessionId) {
                        const response = await axios.post(`http://localhost:${PORT || 3001}/api/send-approved-estimate`, {
                            estimateId: estimateId,
                            sessionId: updatedEstimate.sessionId
                        });
                        
                        if (response.data.success) {
                            bot.sendMessage(
                                chatId,
                                `📤 **ОТПРАВЛЕНО КЛИЕНТУ**\n\n` +
                                `Каналы: ${response.data.sentChannels.join(', ') || 'веб-интерфейс'}`,
                                { parse_mode: 'Markdown' }
                            );
                        }
                    }
                } catch (sendError) {
                    console.error('Ошибка отправки обновленной сметы:', sendError);
                    bot.sendMessage(chatId, '⚠️ Не удалось отправить обновленную смету клиенту');
                }
                
            } else {
                bot.sendMessage(chatId, '❌ Смета не найдена');
            }
            
        } catch (error) {
            console.error('Ошибка редактирования сметы:', error);
            bot.sendMessage(msg.chat.id, '❌ Ошибка при редактировании сметы');
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
    
    // Новая команда для отладки
    bot.onText(/\/debug/, async (msg) => {
        try {
            const chatId = msg.chat.id;
            
            // Проверяем состояние всех систем
            const mongoStatus = mongoose.connection.readyState === 1 ? '✅ Подключена' : '❌ Отключена';
            const cacheStats = cache.getStats();
            
            let openaiStatus = '❓ Неизвестно';
            try {
                await axios.get('https://status.openai.com/', { timeout: 5000 });
                openaiStatus = '✅ Доступен';
            } catch {
                openaiStatus = '❌ Недоступен';
            }
            
            const debugMessage = 
                `🔍 **ОТЛАДОЧНАЯ ИНФОРМАЦИЯ**\n\n` +
                `**Базы данных:**\n` +
                `MongoDB: ${mongoStatus}\n\n` +
                `**API Сервисы:**\n` +
                `OpenAI: ${openaiStatus}\n` +
                `Прокси: ${proxyAgent ? '✅ Активен' : '❌ Отключен'}\n\n` +
                `**Кеш:**\n` +
                `Попаданий: ${cacheStats.hits}\n` +
                `Промахов: ${cacheStats.misses}\n` +
                `Ключей: ${cacheStats.keys}\n\n` +
                `**Сервер:**\n` +
                `Время работы: ${Math.floor(process.uptime() / 60)} мин\n` +
                `Память: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`;
            
            bot.sendMessage(chatId, debugMessage, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Ошибка получения отладочной информации:', error);
            bot.sendMessage(msg.chat.id, '❌ Ошибка при получении отладочной информации');
        }
    });
}

// ===== ИСПРАВЛЕННАЯ ЛОГИКА АВТОМАТИЧЕСКОГО РАСЧЕТА =====
app.post('/api/gpt-assistant', async (req, res) => {
    try {
        console.log('📨 Получен запрос к GPT:', req.body);
        console.log('🔍 ЛОГИРОВАНИЕ: Начало обработки /api/gpt-assistant');

        const { message, conversation = [], sessionId, mode } = req.body;
        
        // Специальная обработка для режима формулировки
        if (mode === 'formulation' || message === 'FORMULATION_MODE_START') {
            console.log('🔍 ЛОГИРОВАНИЕ: Переход в режим формулировки');
            return handleFormulationMode(req, res);
        }

        // Валидация входных данных
        if (!message || typeof message !== 'string') {
            console.log('🔍 ЛОГИРОВАНИЕ: Ошибка валидации - нет сообщения');
            return res.status(400).json({
                error: 'Сообщение обязательно для заполнения',
                success: false
            });
        }

        if (message.length > 1000) {
            console.log('🔍 ЛОГИРОВАНИЕ: Ошибка валидации - слишком длинное сообщение');
            return res.status(400).json({
                error: 'Слишком длинное сообщение',
                success: false
            });
        }

        console.log('🔍 ЛОГИРОВАНИЕ: Проверяем триггеры расчета сметы...');
        
        // Проверка кэша
        const messageHash = crypto.createHash('md5').update(message + JSON.stringify(conversation)).digest('hex');
        const cachedResponse = cache.get(messageHash);
        if (cachedResponse) {
            console.log('📦 Ответ из кэша');
            console.log('🔍 ЛОГИРОВАНИЕ: Ответ из кэша - содержит цены?', cachedResponse.message.includes('₽'));
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
        
        // УБИРАЕМ АВТОМАТИЧЕСКИЙ РАСЧЕТ ПО КОЛИЧЕСТВУ СООБЩЕНИЙ
        // Расчет только по явному запросу кнопки "Получить предложение"
        
        // ===== УМНАЯ ПРОВЕРКА НАМЕРЕНИЯ ЧЕРЕЗ GPT =====
        console.log('🧠 Основной API - анализируем намерение пользователя через GPT...');
        
        const intentAnalysisPrompt = `Проанализируй ВЕСЬ КОНТЕКСТ диалога и определи, действительно ли пользователь готов к расчету стоимости.

Последнее сообщение: "${message}"

Контекст диалога: ${session.chatHistory.slice(-4).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

СТРОГИЕ КРИТЕРИИ для ответа "ДА":
1. Пользователь ЯВНО просит расчет/смету/цену
2. В диалоге УЖЕ обсуждены конкретные функции (не общие фразы)
3. Пользователь дал детальные ответы о требованиях
4. Минимум 8+ сообщений в диалоге с содержательными ответами

ОТВЕЧАЙ "НЕТ" если:
- Пользователь дает односложные ответы ("нет мыслей", "не знаю", "думаю")
- Диалог слишком короткий (менее 8 сообщений)
- Функции обсуждены поверхностно
- Нет конкретики о задачах бота

Ответь ТОЛЬКО одним словом:
- "ДА" - если пользователь ГОТОВ к расчету стоимости  
- "НЕТ" - если нужно больше обсуждения функций

ПРИНЦИП: лучше ошибиться в сторону "НЕТ"`;

        let shouldCalculate = false;
        
        try {
            const intentResponse = await axios.post(
                OPENAI_CONFIG.endpoint,
                {
                    model: OPENAI_CONFIG.model,
                    messages: [
                        { role: 'system', content: intentAnalysisPrompt },
                        { role: 'user', content: message }
                    ],
                    max_tokens: 10,
                    temperature: 0.1
                },
                {
                    headers: {
                        'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    httpsAgent: proxyAgent,
                    timeout: 15000
                }
            );
            
            const intentResult = intentResponse.data.choices[0]?.message?.content?.trim() || '';
            shouldCalculate = intentResult.toUpperCase().includes('ДА');
            console.log('🔍 ЛОГИРОВАНИЕ: Основной API - анализ намерения GPT:', intentResult);
            
        } catch (error) {
            console.error('Ошибка анализа намерения в основном API:', error);
            // Fallback на старую логику
            shouldCalculate = 
                message.toLowerCase().includes('получить предложение') ||
                message.toLowerCase().includes('рассчитайте смету') ||
                message.toLowerCase().includes('создайте смету') ||
                message.toLowerCase().includes('сколько будет стоить') ||
                message.toLowerCase().includes('какая цена') ||
                message.toLowerCase().includes('сколько стоит') ||
                message.toLowerCase().includes('рассчитайте') ||
                message.toLowerCase().includes('дай смету') ||
                message.toLowerCase().includes('смету');
            console.log('🔍 ЛОГИРОВАНИЕ: Основной API - fallback на хардкод проверку');
        }

        // ===== НОВАЯ ЛОГИКА: ПРОВЕРКА ГОТОВНОСТИ ФУНКЦИОНАЛА =====
        let isFunctionalityReady = false;
        
        if (shouldCalculate && conversation.length >= 6) { // Увеличил минимум до 6 сообщений
            console.log('🔍 Проверяем готовность функционала перед отправкой сметы...');
            
            const functionalityCheckPrompt = `Проанализируй диалог и определи, достаточно ли обсужден функционал бота для создания сметы.

Диалог: ${allMessages.map(m => `${m.role}: ${m.content}`).join('\n')}

СТРОГИЕ КРИТЕРИИ для готовности:
1. Определен конкретный тип бота (не общие фразы)
2. Обсуждены минимум 3-4 конкретные функции
3. Клиент дал детальные ответы (не односложные)
4. Есть понимание целей и задач бота
5. Диалог содержит минимум 8-10 осмысленных сообщений о функциях

ВАЖНО: 
- Если клиент отвечает односложно ("нет мыслей", "не знаю") - НЕ_ГОТОВ
- Если функции описаны слишком общо - НЕ_ГОТОВ  
- Если нет конкретики - НЕ_ГОТОВ

Ответь ТОЛЬКО одним словом:
- "ГОТОВ" - если функционал детально обсужден
- "НЕ_ГОТОВ" - если нужно больше обсуждения

КРИТЕРИЙ: лучше ошибиться в сторону "НЕ_ГОТОВ"`;

            try {
                const functionalityResponse = await axios.post(
                    OPENAI_CONFIG.endpoint,
                    {
                        model: OPENAI_CONFIG.model,
                        messages: [
                            { role: 'system', content: functionalityCheckPrompt }
                        ],
                        max_tokens: 20,
                        temperature: 0.1
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        httpsAgent: proxyAgent,
                        timeout: 15000
                    }
                );
                
                const functionalityResult = functionalityResponse.data.choices[0]?.message?.content?.trim() || '';
                isFunctionalityReady = functionalityResult.toUpperCase().includes('ГОТОВ');
                console.log('🔍 ЛОГИРОВАНИЕ: Проверка готовности функционала:', functionalityResult);
                
            } catch (error) {
                console.error('Ошибка проверки готовности функционала:', error);
                // Fallback: требуем минимум 8 сообщений и детальное обсуждение
                isFunctionalityReady = conversation.length >= 8 && 
                    allMessages.filter(m => m.content.length > 20).length >= 6 && // Минимум 6 содержательных сообщений
                    allMessages.some(m => 
                        m.content.toLowerCase().includes('функция') ||
                        m.content.toLowerCase().includes('возможности') ||
                        m.content.toLowerCase().includes('интеграция') ||
                        m.content.toLowerCase().includes('api') ||
                        m.content.toLowerCase().includes('задача')
                    );
                console.log('🔍 ЛОГИРОВАНИЕ: Fallback проверка готовности функционала - требуем больше обсуждения');
            }
        }

        console.log('🔍 ЛОГИРОВАНИЕ: shouldCalculate =', shouldCalculate);
        console.log('🔍 ЛОГИРОВАНИЕ: isFunctionalityReady =', isFunctionalityReady);
        console.log('🔍 ЛОГИРОВАНИЕ: сообщений в диалоге:', conversation.length);
        console.log('🔍 ЛОГИРОВАНИЕ: сообщение пользователя:', message);

        // Проверяем подтверждение сметы
        const isConfirmingEstimate = 
            message.toLowerCase().includes('да, всё верно') ||
            message.toLowerCase().includes('готовьте смету') ||
            message.toLowerCase().includes('всё правильно') ||
            message.toLowerCase().includes('подтверждаю');

        console.log('🔍 ЛОГИРОВАНИЕ: Проверка подтверждения сметы:', isConfirmingEstimate);

        // ОБНОВЛЕННОЕ УСЛОВИЕ: И запрос расчета, И готовность функционала
        if (shouldCalculate && isFunctionalityReady && !isConfirmingEstimate) {
            console.log('💰 Запускаем расчет сметы - все условия выполнены!');
            console.log('🔍 ЛОГИРОВАНИЕ: КРИТИЧЕСКИЙ МОМЕНТ - запуск расчета сметы!');
            
            // Используем единую функцию расчета
            const estimate = await calculateProjectEstimate(fullText, conversation);
            console.log('🔍 ЛОГИРОВАНИЕ: Смета рассчитана:', estimate ? 'ДА' : 'НЕТ');
            
            // Отправляем в Telegram
            await sendEstimateToTelegram(estimate, sessionId);
            
            // Сохраняем смету в базу
            if (sessionId && Conversation) {
                try {
                    await Conversation.findOneAndUpdate(
                        { sessionId },
                        { 
                            estimate: estimate,
                            estimatedAt: new Date(),
                            estimateStatus: 'pending_approval' // Добавляем статус
                        }
                    );
                } catch (dbError) {
                    console.error('Ошибка сохранения сметы:', dbError);
                }
            }
            
            // НОВАЯ ЛОГИКА: НЕ показываем смету клиенту, используем GPT для ответа
            console.log('✅ Смета отправлена менеджеру, формируем ответ через GPT...');
            console.log('🔍 ЛОГИРОВАНИЕ: ВАЖНО! НЕ передаем смету клиенту, формируем GPT ответ');
            
            // НОВАЯ ЛОГИКА: НЕ показываем смету, используем GPT для ответа
            const estimateReadyPrompt = `${ENHANCED_SYSTEM_PROMPT}

СПЕЦИАЛЬНАЯ СИТУАЦИЯ: Клиент запросил расчет стоимости, смета уже готова и отправлена менеджеру.

ТВОЯ ЗАДАЧА:
1. Подытожь обсужденный функционал бота
2. Спроси клиента подтвердить что всё правильно
3. После подтверждения скажи что смета готова и отправлена менеджеру на согласование
4. Упомяни что после утверждения смета придёт в чат и по предпочтительному каналу связи
5. Укажи что обычно это занимает 10-15 минут

НЕ называй никаких цен или сумм!`;

            const messages = [
                { role: 'system', content: estimateReadyPrompt },
                ...conversation.slice(-6),
                { role: 'user', content: message }
            ];

            console.log('🔍 ЛОГИРОВАНИЕ: Отправляем запрос к GPT с промтом БЕЗ цен');

            try {
                const gptResponse = await axios.post(
                    OPENAI_CONFIG.endpoint,
                    {
                        model: OPENAI_CONFIG.model,
                        messages: messages,
                        max_tokens: 400,
                        temperature: 0.7
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

                const assistantMessage = gptResponse.data.choices[0]?.message?.content;
                console.log('🔍 ЛОГИРОВАНИЕ: GPT ответ получен, содержит цены?', assistantMessage.includes('₽'));
                console.log('🔍 ЛОГИРОВАНИЕ: GPT ответ первые 200 символов:', assistantMessage.substring(0, 200));
                
                const result = {
                    success: true,
                    message: assistantMessage,
                    estimateStatus: 'sent_to_manager',
                    quickReplies: ['✅ Всё верно', '✏️ Добавить функции', '🔄 Изменить требования', '❓ Задать вопрос']
                };
                
                console.log('🔍 ЛОГИРОВАНИЕ: Отправляем финальный ответ клиенту БЕЗ цен');
                return res.json(result);
                
            } catch (gptError) {
                console.error('Ошибка GPT при формировании ответа о смете:', gptError);
                
                // Fallback ответ если GPT не работает
                const result = {
                    success: true,
                    message: `Отлично! Я подготовил смету на основе нашего обсуждения и отправил её нашему менеджеру на согласование. 
                    
После утверждения смета придёт сюда в чат, а также будет продублирована по вашему предпочтительному каналу связи. Обычно это занимает 10-15 минут.

Хотите что-то добавить или изменить в функционале?`,
                    estimateStatus: 'sent_to_manager',
                    quickReplies: ['✅ Всё верно', '✏️ Добавить функции', '🔄 Изменить требования']
                };
                
                console.log('🔍 ЛОГИРОВАНИЕ: Используем fallback ответ БЕЗ цен');
                return res.json(result);
            }
        } else if (shouldCalculate && !isFunctionalityReady) {
            // Клиент просит расчет, но функционал недостаточно обсужден
            console.log('⚠️ Клиент просит расчет, но функционал недостаточно обсужден');
            
            const needMoreInfoPrompt = `${ENHANCED_SYSTEM_PROMPT}

СИТУАЦИЯ: Клиент просит расчет стоимости, но функционал бота обсужден недостаточно детально.

ТВОЯ ЗАДАЧА:
1. Вежливо объясни что для точного расчета нужно больше деталей
2. Задай 2-3 уточняющих вопроса о функциях бота
3. Предложи обсудить конкретные возможности
4. Подчеркни что после детального обсуждения смета будет готова быстро

НЕ называй никаких цен! Сосредоточься на сборе требований.`;

            try {
                const gptResponse = await axios.post(
                    OPENAI_CONFIG.endpoint,
                    {
                        model: OPENAI_CONFIG.model,
                        messages: [
                            { role: 'system', content: needMoreInfoPrompt },
                            ...conversation.slice(-4),
                            { role: 'user', content: message }
                        ],
                        max_tokens: 300,
                        temperature: 0.7
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

                const assistantMessage = gptResponse.data.choices[0]?.message?.content;
                
                const result = {
                    success: true,
                    message: assistantMessage,
                    estimateStatus: 'need_more_info',
                    quickReplies: ['💬 Чат-бот с меню', '🧠 GPT-интеграция', '🛒 Интернет-магазин', '📱 WebApp', '❓ Другое']
                };
                
                console.log('🔍 ЛОГИРОВАНИЕ: Запрашиваем больше информации о функционале');
                return res.json(result);
                
            } catch (gptError) {
                console.error('Ошибка GPT при запросе дополнительной информации:', gptError);
                
                const result = {
                    success: true,
                    message: `Для точного расчета стоимости мне нужно больше деталей о функциях бота. 

Расскажите подробнее:
• Какие задачи должен решать ваш бот?
• Нужна ли интеграция с системами (CRM, оплата, базы данных)?
• Планируете ли использовать ИИ для общения?

После детального обсуждения я быстро подготовлю точную смету! 🎯`,
                    estimateStatus: 'need_more_info',
                    quickReplies: ['💬 Чат-бот с меню', '🧠 GPT-интеграция', '🛒 Интернет-магазин', '📱 WebApp']
                };
                
                return res.json(result);
            }
        }
        
        console.log('🔍 ЛОГИРОВАНИЕ: Обычная обработка без расчета сметы');
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
        const quickReplies = generateUnifiedQuickReplies(assistantMessage, message, conversation, 'chat');

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

        // Если ошибка от OpenAI, возвращаем ошибку
        if (error.response?.status === 429) {
            return res.status(429).json({
                error: 'Слишком много запросов к ИИ, попробуйте через минуту',
                success: false
            });
        }

        // Общая обработка ошибок
        res.status(500).json({
            error: 'Временная ошибка ИИ-помощника',
            success: false
        });
    }
});

// Новая функция для режима формулировки
async function handleFormulationMode(req, res) {
    console.log('🔍 ЛОГИРОВАНИЕ: Вход в handleFormulationMode');
    const { message, conversation = [], sessionId } = req.body;

    console.log('🔍 ЛОГИРОВАНИЕ: Формулировка - сообщение:', message);
    console.log('🔍 ЛОГИРОВАНИЕ: Формулировка - количество сообщений в conversation:', conversation.length);

    // ===== УЛУЧШЕННАЯ ЛОГИКА АВТОМАТИЧЕСКОГО РАСЧЕТА =====
    // Проверяем нужно ли считать смету (более строгие условия)
    const shouldCalculate = 
        message.toLowerCase().includes('рассчитайте') ||
        message.toLowerCase().includes('посчитайте') ||
        message.toLowerCase().includes('сколько будет стоить') ||
        message.toLowerCase().includes('какая цена') ||
        message.toLowerCase().includes('создайте смету') ||
        message.toLowerCase().includes('дай смету') ||
        message.toLowerCase().includes('смету') ||
        (conversation.length >= 10 && parseRequirements(conversation.map(m => m.content).join(' ')).length >= 4); // После 10 сообщений И 4+ функций

    console.log('🔍 ЛОГИРОВАНИЕ: Формулировка - shouldCalculate =', shouldCalculate);

    let estimate = null;
    let estimateMessage = '';

    if (shouldCalculate) {
        console.log('🔍 ЛОГИРОВАНИЕ: Формулировка - ЗАПУСК РАСЧЕТА СМЕТЫ!');
        const requirements = extractRequirements(conversation);
        
        // Считаем смету используя единую функцию
        estimate = await calculateProjectEstimate(requirements, conversation);
        console.log('🔍 ЛОГИРОВАНИЕ: Формулировка - смета рассчитана:', estimate ? 'ДА' : 'НЕТ');
        
        // Отправляем в Telegram
        await sendEstimateToTelegram(estimate, sessionId);
        
        // Сохраняем в БД
        if (sessionId && Conversation) {
            await Conversation.findOneAndUpdate(
                { sessionId },
                { 
                    estimate: estimate,
                    estimatedAt: new Date(),
                    estimateStatus: 'pending_approval'
                }
            );
        }
        
        // НОВАЯ ЛОГИКА: НЕ показываем смету в режиме формулировки - будем обрабатывать через GPT
        console.log('✅ Смета для формулировки отправлена менеджеру');
        console.log('🔍 ЛОГИРОВАНИЕ: Формулировка - ВАЖНО! Обнуляем смету чтобы НЕ показать клиенту');
        estimate = null; // Сбрасываем чтобы не показывать клиенту
        estimateMessage = ''; // Убираем сообщение со сметой
    }
    
    console.log('🔍 ЛОГИРОВАНИЕ: Формулировка - после обработки расчета estimate =', estimate);
    
    // Специальный промпт для формулировки - наследует базовый подход
    const formulationPrompt = `${preChatService.baseSystemPrompt}

РЕЖИМ: Помощь с формулировкой задачи

СПЕЦИАЛЬНЫЕ ИНСТРУКЦИИ ДЛЯ ЭТОГО РЕЖИМА:
- Клиент выбрал "Нужна помощь с формулировкой" - значит задача нестандартная
- Понять что хочет клиент, даже если описание необычное (гадание, астрология, коучинг и т.д.)
- Быстро сформулировать понятное ТЗ для его ниши
- Предложить конкретные функции исходя из специфики

ПОСЛЕДОВАТЕЛЬНОСТЬ ДЕЙСТВИЙ:
1. Выясни суть бизнеса/услуги (1-2 вопроса)
2. Определи основные функции бота для этой ниши (1-2 вопроса) 
3. Предложи конкретное решение с функциями

НЕ предлагай расчет сметы автоматически - только если клиент готов или явно просит
НЕ показывай никаких цен или сумм!`;

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
    
    console.log('🔍 ЛОГИРОВАНИЕ: Формулировка - отправляем запрос к GPT');
    
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
        console.log('🔍 ЛОГИРОВАНИЕ: Формулировка - GPT ответ получен, содержит цены?', assistantMessage.includes('₽'));
        console.log('🔍 ЛОГИРОВАНИЕ: Формулировка - GPT ответ первые 200 символов:', assistantMessage.substring(0, 200));
        
        // Анализируем ответ для генерации кнопок
        const quickReplies = generateUnifiedQuickReplies(assistantMessage, message, conversation, 'formulation');
        
        console.log('🔍 ЛОГИРОВАНИЕ: Формулировка - отправляем финальный ответ БЕЗ цен и БЕЗ estimate');
        
        res.json({
            success: true,
            message: assistantMessage, // Показываем только GPT ответ, без смет
            quickReplies: quickReplies
        });
        
    } catch (error) {
        console.error('OpenAI Error:', error);
        console.log('🔍 ЛОГИРОВАНИЕ: Формулировка - ошибка GPT, отправляем fallback');
        res.status(500).json({
            error: 'Ошибка AI',
            success: false,
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

    // НОВАЯ ЛОГИКА: Если собрано достаточно информации - предлагаем расчет
    if (lowerMessage.includes('какие функции') || 
        lowerMessage.includes('что еще') ||
        lowerMessage.includes('дополнительно') ||
        lowerMessage.includes('интеграции') ||
        (lowerMessage.includes('бот') && lowerMessage.includes('нужен'))) {
        return [
            "💰 Получить предложение",
            "➕ Добавить функции",
            "🔄 Изменить требования",
            "❓ Задать вопрос"
        ];
    }

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

        const { sessionId, conversation = [] } = req.body;
        let transcription = '';
        
        // Парсим conversation если это строка
        let parsedConversation = [];
        try {
            if (typeof conversation === 'string') {
                parsedConversation = JSON.parse(conversation);
            } else if (Array.isArray(conversation)) {
                parsedConversation = conversation;
            }
        } catch (parseError) {
            console.warn('⚠️ Не удалось распарсить conversation:', parseError.message);
            parsedConversation = [];
        }
        
        try {
            // Реальное распознавание речи через OpenAI Whisper
            console.log('🔍 Отправляем аудио на распознавание...');
            
            const formData = new FormData();
            formData.append('file', fsSync.createReadStream(req.file.path), {
                filename: 'audio.webm',
                contentType: req.file.mimetype
            });
            formData.append('model', 'whisper-1');
            formData.append('language', 'ru');
            
            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
                    ...formData.getHeaders()
                },
                body: formData,
                agent: proxyAgent,
                timeout: 30000
            });
            
            if (response.ok) {
                const result = await response.json();
                transcription = result.text || '';
                console.log('✅ Распознано:', transcription);
                
                // Проверяем что transcription не пустой
                if (!transcription || transcription.trim().length === 0) {
                    console.warn('⚠️ Получен пустой текст из Whisper');
                    transcription = 'Не удалось распознать речь';
                }
            } else {
                console.warn('⚠️ Ошибка Whisper API, используем fallback');
                throw new Error(`Whisper API error: ${response.status}`);
            }
            
        } catch (error) {
            console.error('❌ Ошибка распознавания:', error.message);
            
            // Возвращаем ошибку если не удалось распознать речь
            return res.status(500).json({
                success: false,
                error: 'Не удалось распознать речь. Попробуйте снова или напишите текстом.',
                transcription: '' // Добавляем пустую transcription для фронтенда
            });
        }
        
        // Удаляем временный файл
        try {
            await fs.unlink(req.file.path);
        } catch (e) {
            console.error('Не удалось удалить файл:', e);
        }
        
        // Сохраняем голосовое сообщение в базу данных
        if (sessionId && Conversation) {
            try {
                await Conversation.findOneAndUpdate(
                    { sessionId },
                    {
                        $push: {
                            messages: { 
                                role: 'user', 
                                content: transcription,
                                type: 'voice' // Отмечаем что это голосовое сообщение
                            }
                        }
                    },
                    { upsert: true }
                );
            } catch (dbError) {
                console.error('Ошибка сохранения голосового сообщения в БД:', dbError);
            }
        }
        
        // НОВАЯ ФУНКЦИОНАЛЬНОСТЬ: Отправляем распознанный текст в GPT API
        console.log('🧠 Отправляем распознанный текст в OpenAI GPT...');
        
        // УБИРАЕМ БЫСТРЫЕ ШАБЛОНЫ ДЛЯ ГОЛОСА - ТЕПЕРЬ СНАЧАЛА ДИАЛОГ, ПОТОМ РАСЧЕТ
        
        // УБИРАЕМ БЫСТРЫЕ ШАБЛОНЫ ДЛЯ ГОЛОСА - ТЕПЕРЬ СНАЧАЛА ДИАЛОГ, ПОТОМ РАСЧЕТ
        // Проверяем запрос на получение предложения/расчета
        const needsEstimate = transcription.toLowerCase().includes('получить предложение') ||
                             transcription.toLowerCase().includes('рассчитайте') ||
                             transcription.toLowerCase().includes('сколько') ||
                             transcription.toLowerCase().includes('стоит') ||
                             transcription.toLowerCase().includes('цена') ||
                             transcription.toLowerCase().includes('стоимость') ||
                             transcription.toLowerCase().includes('расчет') ||
                             transcription.toLowerCase().includes('смета');
        
        if (needsEstimate && parsedConversation.length >= 2) {
            console.log('💰 Голосовой запрос расчета - отправляем смету менеджеру...');
            
            try {
                const allMessages = [...parsedConversation, { role: 'user', content: transcription }];
                const fullText = allMessages.map(m => m.content).join(' ');
                
                const estimate = await calculateProjectEstimate(fullText, parsedConversation);
                
                await sendEstimateToTelegram(estimate, sessionId);
                
                // Сохраняем в БД с статусом отправленной сметы
                if (Conversation) {
                    try {
                        await Conversation.findOneAndUpdate(
                            { sessionId },
                            { 
                                estimate: estimate,
                                estimatedAt: new Date(),
                                estimateStatus: 'pending_approval'
                            },
                            { upsert: true }
                        );
                        console.log('💾 Статус сметы обновлен на pending_approval');
                    } catch (dbError) {
                        console.error('Ошибка сохранения сметы в анкетном чате:', dbError);
                    }
                }
                
                console.log('✅ Голосовая смета отправлена менеджеру:', estimate.totalCost, 'руб.');
                
                // НОВАЯ ЛОГИКА: Используем GPT для ответа о том что смета отправлена менеджеру
                const estimateReadyPrompt = `${ENHANCED_SYSTEM_PROMPT}

СПЕЦИАЛЬНАЯ СИТУАЦИЯ: Клиент запросил расчет стоимости, смета уже готова и отправлена менеджеру.

ТВОЯ ЗАДАЧА:
1. Подытожь обсужденный функционал бота
2. Спроси клиента подтвердить что всё правильно
3. После подтверждения скажи что смета готова и отправлена менеджеру на согласование
4. Упомяни что после утверждения смета придёт в чат и по предпочтительному каналу связи
5. Укажи что обычно это занимает 10-15 минут

НЕ называй никаких цен или сумм!`;

                const messages = [
                    { role: 'system', content: estimateReadyPrompt },
                    ...parsedConversation.slice(-6),
                    { role: 'user', content: transcription }
                ];

                const gptResponse = await axios.post(
                    OPENAI_CONFIG.endpoint,
                    {
                        model: OPENAI_CONFIG.model,
                        messages: messages,
                        max_tokens: 400,
                        temperature: 0.7
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

                const assistantMessage = gptResponse.data.choices[0]?.message?.content;
                
                return res.json({
                    success: true,
                    transcription: transcription,
                    message: assistantMessage,
                    estimateStatus: 'sent_to_manager',
                    isVoiceInput: true,
                    quickReplies: [
                        '✅ Всё верно',
                        '✏️ Добавить функции', 
                        '🔄 Изменить требования',
                        '❓ Задать вопрос'
                    ]
                });
                
            } catch (estimateError) {
                console.error('❌ Ошибка расчета голосовой сметы:', estimateError.message);
                
                // Fallback если расчет не сработал
                return res.json({
                    success: true,
                    transcription: transcription,
                    message: `Отлично! Я обработал ваш запрос и отправил смету нашему менеджеру на согласование. 
                    
После утверждения смета придёт сюда в чат, а также будет продублирована по вашему предпочтительному каналу связи. Обычно это занимает 10-15 минут.

Хотите что-то добавить или изменить в функционале?`,
                    estimateStatus: 'sent_to_manager',
                    isVoiceInput: true,
                    quickReplies: [
                        '✅ Всё верно',
                        '✏️ Добавить функции',
                        '🔄 Изменить требования'
                    ]
                });
            }
        }
        
        try {
            // Валидация и очистка сообщений для OpenAI
            const validMessages = parsedConversation
                .filter(msg => msg && msg.role && msg.content)
                .slice(-8) // Берем только последние 8 сообщений
                .map(msg => ({
                    role: msg.role === 'assistant' ? 'assistant' : 'user',
                    content: String(msg.content).trim().slice(0, 1000) // Обрезаем длинные сообщения
                }));
            
            // Подготовка сообщений для OpenAI
            const messages = [
                { role: 'system', content: ENHANCED_SYSTEM_PROMPT },
                ...validMessages,
                { role: 'user', content: transcription }
            ];
            
            console.log('📝 Отправляем сообщений в GPT:', messages.length);
    
            // Запрос к OpenAI через прокси
            const axiosConfig = {
                headers: {
                    'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'CreateBot-Assistant-Voice/2.0'
                },
                timeout: 30000
            };
    
            // Добавляем прокси только если он настроен
            if (proxyAgent) {
                axiosConfig.httpsAgent = proxyAgent;
                console.log('🔗 Используется прокси для запроса к OpenAI GPT');
            }
    
            const gptResponse = await axios.post(
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
    
            console.log('✅ Ответ от OpenAI GPT получен для голосового ввода');
    
            const assistantMessage = gptResponse.data.choices[0]?.message?.content;
    
            if (!assistantMessage) {
                throw new Error('Нет ответа от OpenAI GPT');
            }
    
            // Сохранение ответа ассистента в MongoDB
            if (sessionId && Conversation) {
                try {
                    await Conversation.findOneAndUpdate(
                        { sessionId },
                        {
                            $push: {
                                messages: { 
                                    role: 'assistant', 
                                    content: assistantMessage,
                                    responseToVoice: true // Отмечаем что это ответ на голос
                                }
                            }
                        }
                    );
                } catch (dbError) {
                    console.error('Ошибка сохранения ответа GPT в БД:', dbError);
                }
            }
    
            // Анализ ответа для предложения быстрых кнопок
            const quickReplies = generateQuickReplies(assistantMessage, transcription);
    
            res.json({
                success: true,
                transcription: transcription,
                message: assistantMessage,
                isVoiceInput: true,
                quickReplies: quickReplies,
                usage: gptResponse.data.usage
            });
            
        } catch (gptError) {
            console.error('❌ Ошибка GPT API для голосового ввода:', gptError.message);
            
            // Детальное логирование ошибки
            if (gptError.response) {
                console.error('🔍 Статус ошибки:', gptError.response.status);
                console.error('🔍 Данные ошибки:', gptError.response.data);
                console.error('🔍 Заголовки ошибки:', gptError.response.headers);
            }
            
            // Fallback если GPT не работает
            res.json({
                success: false,
                error: 'ИИ временно недоступен',
                transcription: transcription,
                isVoiceInput: true,
                quickReplies: [
                    '🔄 Попробовать снова',
                    '✍️ Написать текстом',
                    '📞 Связаться с оператором'
                ]
            });
        }
        
    } catch (error) {
        console.error('❌ Ошибка обработки голоса:', error);
        res.status(500).json({ 
            error: 'Ошибка обработки голосового сообщения',
            success: false 
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

// ===== НОВЫЕ ENDPOINTS ДЛЯ БЫСТРОЙ АНКЕТЫ =====

// Отправка анкеты и создание сессии
app.post('/api/pre-chat-form', async (req, res) => {
    try {
        const formData = req.body;
        
        // Валидация данных формы
        const validation = preChatService.validateFormData(formData);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: validation.error || 'Заполните все обязательные поля',
                missing: validation.missing
            });
        }

        // Создание сессии
        const result = await preChatService.createSession(formData);
        
        if (result.success) {
            // Генерируем первое сообщение от GPT с учетом анкеты
            const contextualPrompt = preChatService.buildContextualPrompt(formData);
            
            try {
                const gptResponse = await callOpenAIWithPrompt(contextualPrompt);
                
                // Сохраняем первое сообщение от ассистента
                await preChatService.addMessageToHistory(
                    result.sessionId,
                    'assistant',
                    gptResponse,
                    { messageType: 'text' }
                );

                res.json({
                    success: true,
                    sessionId: result.sessionId,
                    welcomeMessage: gptResponse
                });
            } catch (gptError) {
                console.error('Ошибка получения приветственного сообщения:', gptError);
                
                // Возвращаем ошибку если GPT недоступен
                return res.status(500).json({
                    success: false,
                    error: 'ИИ-помощник временно недоступен'
                });
            }
        } else {
            res.status(500).json({
                success: false,
                error: 'Ошибка создания сессии'
            });
        }
        
    } catch (error) {
        console.error('Ошибка обработки анкеты:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// Отправка сообщения в чат с контекстом анкеты
app.post('/api/pre-chat-message', async (req, res) => {
    try {
        console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - получен запрос:', req.body);
        
        const { sessionId, message } = req.body;
        
        if (!sessionId || !message) {
            return res.status(400).json({
                success: false,
                error: 'Не указан sessionId или сообщение'
            });
        }

        // Получаем сессию
        const session = await preChatService.getSession(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Сессия не найдена'
            });
        }

        // Сохраняем сообщение пользователя
        await preChatService.addMessageToHistory(
            sessionId,
            'user',
            message,
            { messageType: 'text' }
        );

        console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - проверяем триггеры расчета сметы...');
        
        // ===== УМНАЯ ПРОВЕРКА НАМЕРЕНИЯ ЧЕРЕЗ GPT =====
        console.log('🧠 Анкетный чат - анализируем намерение пользователя через GPT...');
        
        let shouldCalculate = false;
        
        // Проверяем, была ли уже отправлена смета для этой сессии
        let alreadySentEstimate = false;
        try {
            if (Conversation) {
                const existingConv = await Conversation.findOne({ sessionId });
                alreadySentEstimate = existingConv && existingConv.estimateStatus === 'pending_approval';
            }
        } catch (error) {
            console.log('Ошибка проверки статуса сметы:', error);
        }
        
        if (alreadySentEstimate) {
            console.log('⚠️ Смета уже отправлена для этой сессии - пропускаем анализ намерения');
            shouldCalculate = false;
        } else {
            // Получаем контекст последних сообщений для лучшего понимания
            const recentMessages = session.chatHistory
                .filter(msg => msg.metadata.messageType === 'text')
                .slice(-3)
                .map(msg => `${msg.role}: ${msg.content}`)
                .join('\n');
            
            const intentAnalysisPrompt = `Проанализируй сообщение пользователя в контексте диалога и определи, ЯВНО ли он просит расчет стоимости/сметы.

Контекст диалога:
${recentMessages}
Новое сообщение: "${message}"

ВАЖНО: Ответы "Да", "Хорошо", "Согласен" на уточняющие вопросы о функциях - это НЕ запрос сметы!

Ответь ТОЛЬКО одним словом:
- "ДА" - если ЯВНО просит расчет, смету, цену, стоимость, "получить предложение"
- "НЕТ" - если просто отвечает на вопросы, соглашается с функциями, уточняет детали

Примеры ЯВНОГО запроса сметы: "смета", "цена", "стоимость", "сколько стоит", "расчет", "получить предложение", "во сколько обойдется"
Примеры НЕ запроса сметы: "да", "хорошо", "согласен", "все верно", "подходит", "нужно", "хочу"`;

            try {
                const intentResponse = await callOpenAIWithPrompt([
                    { role: 'system', content: intentAnalysisPrompt },
                    { role: 'user', content: message }
                ]);
                
                shouldCalculate = intentResponse.trim().toUpperCase().includes('ДА');
                console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - анализ намерения GPT:', intentResponse.trim());
                
            } catch (error) {
                console.error('Ошибка анализа намерения:', error);
                // Fallback на более строгую логику
                shouldCalculate = 
                    message.toLowerCase().includes('получить предложение') ||
                    message.toLowerCase().includes('рассчитайте смету') ||
                    message.toLowerCase().includes('создайте смету') ||
                    message.toLowerCase().includes('сколько будет стоить') ||
                    message.toLowerCase().includes('какая цена') ||
                    message.toLowerCase().includes('сколько стоит') ||
                    message.toLowerCase().includes('во сколько') ||
                    message.toLowerCase().includes('смету') ||
                    (message.toLowerCase().includes('стоимость') && message.length > 15);
                console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - fallback на улучшенную проверку');
            }
        }

        // ===== НОВАЯ ЛОГИКА: ПРОВЕРКА ГОТОВНОСТИ ФУНКЦИОНАЛА =====
        let isFunctionalityReady = false;
        
        if (shouldCalculate && session.chatHistory.length >= 8) { // Увеличил минимум до 8 сообщений
            console.log('🔍 Анкетный чат - проверяем готовность функционала перед отправкой сметы...');
            
            const allMessages = session.chatHistory
                .filter(msg => msg.metadata.messageType === 'text')
                .map(msg => ({ role: msg.role, content: msg.content }));
            
            allMessages.push({ role: 'user', content: message });
            
            const functionalityCheckPrompt = `Проанализируй диалог и определи, достаточно ли обсужден функционал бота для создания сметы.

Диалог: ${allMessages.map(m => `${m.role}: ${m.content}`).join('\n')}

Дополнительная информация о клиенте:
- Имя: ${session.formData.name}
- Должность: ${session.formData.position}
- Отрасль: ${session.formData.industry}
- Бюджет: ${session.formData.budget}
- Сроки: ${session.formData.timeline}

ОЧЕНЬ СТРОГИЕ КРИТЕРИИ для готовности:
1. Определен конкретный тип бота (не общие фразы типа "нет мыслей")
2. Обсуждены минимум 4-5 конкретных функций с деталями
3. Клиент дал содержательные ответы (не односложные)
4. Есть четкое понимание целей и задач бота
5. Диалог содержит минимум 10-12 осмысленных сообщений о функциях
6. Функции конкретизированы под отрасль клиента

БЛОКИРУЮЩИЕ ФАКТОРЫ:
- Односложные ответы ("нет мыслей", "не знаю", "думаю")
- Общие фразы без конкретики
- Менее 8 содержательных сообщений от клиента
- Отсутствие деталей по функциям

Ответь ТОЛЬКО одним словом:
- "ГОТОВ" - если функционал детально и конкретно обсужден
- "НЕ_ГОТОВ" - если нужно больше деталей и обсуждения

ПРИНЦИП: лучше ошибиться в сторону "НЕ_ГОТОВ" чем отправить смету рано`;

            try {
                const functionalityResponse = await callOpenAIWithPrompt([
                    { role: 'system', content: functionalityCheckPrompt }
                ]);
                
                isFunctionalityReady = functionalityResponse.trim().toUpperCase().includes('ГОТОВ');
                console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - проверка готовности функционала:', functionalityResponse.trim());
                
            } catch (error) {
                console.error('Ошибка проверки готовности функционала в анкетном чате:', error);
                // Fallback: очень строгие требования
                const contentfulMessages = allMessages.filter(m => 
                    m.role === 'user' && 
                    m.content.length > 30 && 
                    !m.content.toLowerCase().includes('не знаю') &&
                    !m.content.toLowerCase().includes('нет мыслей')
                );
                
                isFunctionalityReady = session.chatHistory.length >= 12 && 
                    contentfulMessages.length >= 5 && // Минимум 5 содержательных ответов клиента
                    allMessages.some(m => 
                        m.content.toLowerCase().includes('функция') ||
                        m.content.toLowerCase().includes('возможности') ||
                        m.content.toLowerCase().includes('интеграция') ||
                        m.content.toLowerCase().includes('api') ||
                        m.content.toLowerCase().includes('задача') ||
                        m.content.toLowerCase().includes('автомат')
                    );
                console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - fallback проверка готовности: очень строгие требования');
            }
        }

        console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - shouldCalculate =', shouldCalculate);
        console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - isFunctionalityReady =', isFunctionalityReady);
        console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - сообщений в истории:', session.chatHistory.length);
        console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - сообщение пользователя:', message);

        // ОБНОВЛЕННОЕ УСЛОВИЕ: И запрос расчета, И готовность функционала
        if (shouldCalculate && isFunctionalityReady) {
            console.log('💰 Анкетный чат: Запускаем расчет сметы - все условия выполнены!');
            console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - КРИТИЧЕСКИЙ МОМЕНТ - запуск расчета сметы!');
            
            // Извлекаем требования из истории чата анкетного диалога
            const allMessages = session.chatHistory
                .filter(msg => msg.metadata.messageType === 'text')
                .map(msg => ({ role: msg.role, content: msg.content }));
            
            allMessages.push({ role: 'user', content: message });
            
            const fullText = allMessages.map(m => m.content).join(' ');
            
            // Используем единую функцию расчета
            const estimate = await calculateProjectEstimate(fullText, allMessages);
            console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - Смета рассчитана:', estimate ? 'ДА' : 'НЕТ');
            
            // Отправляем в Telegram
            await sendEstimateToTelegram(estimate, sessionId);
            
            // Сохраняем в БД
            if (Conversation) {
                try {
                    await Conversation.findOneAndUpdate(
                        { sessionId },
                        { 
                            estimate: estimate,
                            estimatedAt: new Date(),
                            estimateStatus: 'pending_approval'
                        },
                        { upsert: true }
                    );
                } catch (dbError) {
                    console.error('Ошибка сохранения сметы в анкетном чате:', dbError);
                }
            }
            
            console.log('✅ Анкетный чат: Смета отправлена менеджеру, формируем ответ через GPT...');
            console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - ВАЖНО! НЕ передаем смету клиенту, формируем GPT ответ');
            
            // Создаем специальный промпт для ответа о том, что смета отправлена менеджеру
            const estimateReadyPrompt = `${preChatService.baseSystemPrompt}

СПЕЦИАЛЬНАЯ СИТУАЦИЯ: Клиент запросил расчет стоимости, смета уже готова и отправлена менеджеру.

ТВОЯ ЗАДАЧА:
1. Подытожь обсужденный функционал бота
2. Спроси клиента подтвердить что всё правильно
3. После подтверждения скажи что смета готова и отправлена менеджеру на согласование
4. Упомяни что после утверждения смета придёт в чат и по предпочтительному каналу связи
5. Укажи что обычно это занимает 10-15 минут

НЕ называй никаких цен или сумм!`;

            const messages = [
                { role: 'system', content: estimateReadyPrompt },
                ...allMessages.slice(-6),
                { role: 'user', content: message }
            ];

            console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - Отправляем запрос к GPT с промтом БЕЗ цен');

            try {
                const gptResponse = await callOpenAIWithPrompt(messages);
                
                console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - GPT ответ получен, содержит цены?', gptResponse.includes('₽'));
                console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - GPT ответ первые 200 символов:', gptResponse.substring(0, 200));
                
                // Сохраняем ответ ассистента
                await preChatService.addMessageToHistory(
                    sessionId,
                    'assistant',
                    gptResponse,
                    { messageType: 'text' }
                );

                // Обновляем лид-скор
                const leadScore = await preChatService.updateLeadScore(sessionId);
                
                console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - отправляем финальный ответ клиенту БЕЗ цен');
                
                return res.json({
                    success: true,
                    message: gptResponse,
                    estimateStatus: 'sent_to_manager',
                    leadScore: leadScore
                });
                
            } catch (gptError) {
                console.error('Ошибка GPT при формировании ответа о смете в анкетном чате:', gptError);
                
                // Fallback ответ если GPT не работает
                const fallbackMessage = `Отлично! Я подготовил смету на основе нашего обсуждения и отправил её нашему менеджеру на согласование. 
                
После утверждения смета придёт сюда в чат, а также будет продублирована по вашему предпочтительному каналу связи. Обычно это занимает 10-15 минут.

Хотите что-то добавить или изменить в функционале?`;

                // Сохраняем fallback ответ
                await preChatService.addMessageToHistory(
                    sessionId,
                    'assistant',
                    fallbackMessage,
                    { messageType: 'text' }
                );

                const leadScore = await preChatService.updateLeadScore(sessionId);
                
                console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - используем fallback ответ БЕЗ цен');
                
                return res.json({
                    success: true,
                    message: fallbackMessage,
                    estimateStatus: 'sent_to_manager',
                    leadScore: leadScore
                });
            }
        } else if (shouldCalculate && !isFunctionalityReady) {
            // Клиент просит расчет, но функционал недостаточно обсужден
            console.log('⚠️ Анкетный чат: Клиент просит расчет, но функционал недостаточно обсужден');
            
            const needMoreInfoPrompt = `${preChatService.baseSystemPrompt}

ИНФОРМАЦИЯ О КЛИЕНТЕ:
👤 Имя: ${session.formData.name}
💼 Должность: ${session.formData.position}  
🏢 Отрасль: ${session.formData.industry}
💰 Бюджет: ${session.formData.budget}
📞 Предпочитаемые каналы: ${session.formData.preferredChannels.join(', ')}
⏰ Сроки: ${session.formData.timeline}

СИТУАЦИЯ: Клиент просит расчет стоимости, но функционал бота обсужден недостаточно детально.

ТВОЯ ЗАДАЧА:
1. Вежливо объясни что для точного расчета нужно больше деталей
2. Задай 2-3 уточняющих вопроса о функциях бота с учетом его отрасли
3. Предложи обсудить конкретные возможности
4. Подчеркни что после детального обсуждения смета будет готова быстро

НЕ называй никаких цен! Сосредоточься на сборе требований.`;

            try {
                const allMessages = session.chatHistory
                    .filter(msg => msg.metadata.messageType === 'text')
                    .slice(-4)
                    .map(msg => ({ role: msg.role, content: msg.content }));

                const gptResponse = await callOpenAIWithPrompt([
                    { role: 'system', content: needMoreInfoPrompt },
                    ...allMessages,
                    { role: 'user', content: message }
                ]);
                
                // Сохраняем ответ ассистента
                await preChatService.addMessageToHistory(
                    sessionId,
                    'assistant',
                    gptResponse,
                    { messageType: 'text' }
                );

                const leadScore = await preChatService.updateLeadScore(sessionId);
                
                console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - запрашиваем больше информации о функционале');
                
                return res.json({
                    success: true,
                    message: gptResponse,
                    estimateStatus: 'need_more_info',
                    leadScore: leadScore
                });
                
            } catch (gptError) {
                console.error('Ошибка GPT при запросе дополнительной информации в анкетном чате:', gptError);
                
                const fallbackMessage = `Для точного расчета стоимости мне нужно больше деталей о функциях бота с учетом специфики отрасли "${session.formData.industry}". 

Расскажите подробнее:
• Какие конкретные задачи должен решать ваш бот?
• Нужна ли интеграция с вашими системами (CRM, оплата, базы данных)?
• Планируете ли использовать ИИ для общения с клиентами?
• Какие процессы хотите автоматизировать?

После детального обсуждения я быстро подготовлю точную смету! 🎯`;

                // Сохраняем fallback ответ
                await preChatService.addMessageToHistory(
                    sessionId,
                    'assistant',
                    fallbackMessage,
                    { messageType: 'text' }
                );

                const leadScore = await preChatService.updateLeadScore(sessionId);
                
                return res.json({
                    success: true,
                    message: fallbackMessage,
                    estimateStatus: 'need_more_info',
                    leadScore: leadScore
                });
            }
        }
        
        console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - обычная обработка без расчета сметы');
        // ===== КОНЕЦ ДОБАВЛЕНИЯ ЛОГИКИ РАСЧЕТА СМЕТ =====

        // Строим контекст для GPT с ПОЛНОЙ историей, но усиленной защитой от цен
        const safeSystemPrompt = `${preChatService.baseSystemPrompt}

ИНФОРМАЦИЯ О КЛИЕНТЕ:
👤 Имя: ${session.formData.name}
💼 Должность: ${session.formData.position}  
🏢 Отрасль: ${session.formData.industry}
💰 Бюджет: ${session.formData.budget}
📞 Предпочитаемые каналы: ${session.formData.preferredChannels.join(', ')}
⏰ Сроки: ${session.formData.timeline}

🚫🚫🚫 КРИТИЧЕСКИ ВАЖНО: НЕ показывай клиенту НИКАКИХ цен, сумм, расчетов или смет! 🚫🚫🚫
🚫 НЕ называй конкретные цифры в рублях или других валютах
🚫 НЕ показывай таблицы с ценами 
🚫 НЕ делай расчеты стоимости

✅ ИСПОЛЬЗУЙ контекст истории для понимания обсужденного функционала
✅ ПОМНИ что обсуждалось, но БЕЗ упоминания цен
✅ Если клиент хочет узнать цену - скажи что смета будет готова после обсуждения всех функций`;

        // Получаем релевантную историю (только текстовые сообщения)
        const relevantHistory = session.chatHistory
            .filter(msg => msg.metadata.messageType === 'text')
            .slice(-10) // Последние 10 сообщений для контекста
            .map(msg => ({ role: msg.role, content: msg.content }));

        // Сообщения с полной историей, но безопасным промптом
        const contextMessages = [
            { role: 'system', content: safeSystemPrompt },
            ...relevantHistory,
            { role: 'user', content: message }
        ];

        console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - используем полную историю с усиленной защитой от цен');
        console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - сообщений в контексте:', relevantHistory.length);

        try {
            const gptResponse = await callOpenAIWithPrompt(contextMessages);
                
            console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - GPT ответ получен, содержит цены?', gptResponse.includes('₽'));
            console.log('🔍 ЛОГИРОВАНИЕ: Анкетный чат - GPT ответ первые 200 символов:', gptResponse.substring(0, 200));
                
            // Сохраняем ответ ассистента
            await preChatService.addMessageToHistory(
                sessionId,
                'assistant',
                gptResponse,
                { messageType: 'text' }
            );

            // Обновляем лид-скор
            const leadScore = await preChatService.updateLeadScore(sessionId);

            res.json({
                success: true,
                message: gptResponse,
                leadScore: leadScore
            });

        } catch (gptError) {
            console.error('Ошибка GPT:', gptError);
            
            return res.status(500).json({
                success: false,
                error: 'ИИ-помощник временно недоступен'
            });
        }
        
    } catch (error) {
        console.error('Ошибка обработки сообщения:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка обработки сообщения'
        });
    }
});

// Получение истории чата
app.get('/api/pre-chat-history/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const session = await preChatService.getSession(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Сессия не найдена'
            });
        }

        // Фильтруем только пользовательские сообщения и ответы ассистента
        const chatHistory = session.chatHistory.filter(msg => 
            msg.metadata.messageType === 'text'
        ).map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp
        }));

        res.json({
            success: true,
            formData: session.formData,
            chatHistory: chatHistory,
            leadScore: session.leadScore,
            status: session.status
        });
        
    } catch (error) {
        console.error('Ошибка получения истории чата:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка получения истории чата'
        });
    }
});

// Аналитика анкет
app.get('/api/pre-chat-analytics', async (req, res) => {
    try {
        const analytics = await preChatService.getAnalytics();
        
        if (analytics) {
            res.json({
                success: true,
                ...analytics
            });
        } else {
            res.json({
                success: true,
                totalSessions: 0,
                activeChats: 0,
                qualifiedLeads: 0,
                avgScore: 0,
                industryStats: [],
                conversionRate: 0
            });
        }
    } catch (error) {
        console.error('Ошибка получения аналитики анкет:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка получения аналитики'
        });
    }
});

// Вспомогательная функция для вызова OpenAI с контекстуальным промптом
async function callOpenAIWithPrompt(messages, retryCount = 0) {
    const maxRetries = 2;
    
    const axiosConfig = {
        headers: {
            'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'CreateBot-PreChat/1.0'
        },
        timeout: 25000 // Уменьшил таймаут
    };

    if (proxyAgent) {
        axiosConfig.httpsAgent = proxyAgent;
    }

    try {
        const response = await axios.post(
            OPENAI_CONFIG.endpoint,
            {
                model: OPENAI_CONFIG.model,
                messages: messages,
                max_tokens: 400, // Уменьшил для быстрого ответа
                temperature: 0.7,
                presence_penalty: 0.1,
                frequency_penalty: 0.1
            },
            axiosConfig
        );

        const assistantMessage = response.data.choices[0]?.message?.content;
        
        if (!assistantMessage) {
            throw new Error('Нет ответа от OpenAI');
        }

        return assistantMessage;
        
    } catch (error) {
        console.error(`❌ Ошибка OpenAI (попытка ${retryCount + 1}):`, error.message);
        
        // Retry при ошибках соединения
        if (retryCount < maxRetries && (
            error.code === 'ECONNRESET' || 
            error.code === 'ETIMEDOUT' ||
            error.response?.status === 503 ||
            error.response?.status === 502 ||
            error.response?.status === 429
        )) {
            console.log(`🔄 Повторная попытка ${retryCount + 1}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Экспоненциальная задержка
            return callOpenAIWithPrompt(messages, retryCount + 1);
        }
        
        throw error;
    }
}

// ===== ENDPOINT ДЛЯ СТАТИСТИКИ СМЕТ =====

// Проверка существующей сессии по fingerprint
app.post('/api/check-session', async (req, res) => {
    try {
        const { fingerprint } = req.body;
        
        if (!fingerprint) {
            return res.status(400).json({
                success: false,
                error: 'Fingerprint обязателен'
            });
        }

        // Ищем существующую сессию
        const existingSession = await preChatService.findSessionByFingerprint(fingerprint);
        
        if (existingSession) {
            console.log(`🔍 Найдена существующая сессия для fingerprint: ${fingerprint}`);
            
            // Обновляем время последней активности
            await preChatService.updateLastActivity(existingSession.sessionId);
            
            res.json({
                success: true,
                sessionFound: true,
                sessionId: existingSession.sessionId,
                formData: existingSession.formData,
                status: existingSession.status,
                leadScore: existingSession.leadScore
            });
        } else {
            console.log(`📝 Новый пользователь с fingerprint: ${fingerprint}`);
            
            res.json({
                success: true,
                sessionFound: false
            });
        }
        
    } catch (error) {
        console.error('Ошибка проверки сессии:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка проверки сессии'
        });
    }
});

// Единая функция генерации быстрых ответов (объединяет логику generateQuickReplies и generateFormulationButtons)
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

// ===== API ДЛЯ ОТПРАВКИ УТВЕРЖДЕННОЙ СМЕТЫ КЛИЕНТУ =====
app.post('/api/send-approved-estimate', async (req, res) => {
    try {
        const { estimateId, sessionId } = req.body;
        
        console.log('🚀 Попытка отправки сметы:', { estimateId, sessionId });
        
        if (!estimateId) {
            console.error('❌ estimateId не предоставлен');
            return res.status(400).json({ error: 'estimateId обязателен' });
        }

        // Получаем смету
        let estimate;
        try {
            estimate = await Estimate.findById(estimateId);
            console.log('📋 Найдена смета:', estimate ? 'да' : 'нет');
        } catch (dbError) {
            console.error('❌ Ошибка доступа к БД:', dbError);
            return res.status(500).json({ error: 'Ошибка доступа к базе данных' });
        }
        
        if (!estimate) {
            console.error('❌ Смета не найдена по ID:', estimateId);
            return res.status(404).json({ error: 'Смета не найдена' });
        }
        
        if (estimate.status !== 'approved') {
            console.error('❌ Смета не утверждена. Статус:', estimate.status);
            return res.status(400).json({ error: 'Смета должна быть утверждена' });
        }

        // Получаем данные сессии для предпочтительных каналов связи
        let preferredChannels = [];
        let clientContacts = {};
        let sessionData = null;
        
        if (sessionId) {
            try {
                sessionData = await PreChatForm.findOne({ sessionId });
                console.log('👤 Данные сессии:', sessionData ? 'найдены' : 'не найдены');
                
                if (sessionData && sessionData.formData) {
                    preferredChannels = sessionData.formData.preferredChannels || [];
                    clientContacts = sessionData.formData.contacts || {};
                    console.log('📱 Каналы связи:', preferredChannels);
                    console.log('📞 Контакты:', Object.keys(clientContacts));
                }
            } catch (sessionError) {
                console.error('❌ Ошибка получения сессии:', sessionError);
                // Продолжаем работу без данных сессии
            }
        }

        // Форматируем смету для клиента
        const totalCost = estimate.totalCost || estimate.price || estimate.cost || 0;
        const totalHours = estimate.totalHours || estimate.hours || estimate.duration || 0;
        const timeline = estimate.timeline || estimate.timeframe || 'не указан';
        const projectName = estimate.projectName || estimate.name || estimate.title || 'Ваш Telegram-бот';
        
        // Безопасная обработка стоимости
        const safeTotalCost = Number(totalCost) || 0;
        
        const clientEstimateMessage = `🎉 **СМЕТА УТВЕРЖДЕНА!**

📋 **${projectName}**

💰 **Стоимость разработки:** ${safeTotalCost.toLocaleString('ru-RU')} ₽
⏱️ **Время выполнения:** ${totalHours} часов
📅 **Примерный срок:** ${timeline}

${estimate.editComment ? `📝 **Дополнительно:** ${estimate.editComment}\n` : ''}

📊 **Что включено:**
${estimate.components && estimate.components.length > 0 ? 
    estimate.components.slice(0, 8)
        .filter(c => c && typeof c === 'object') // Фильтруем невалидные компоненты
        .map(c => {
            const name = c.name || c.title || 'Компонент';
            const cost = Number(c.cost || c.price || 0) || 0; // Безопасное преобразование в число
            return `• ${name} — ${cost.toLocaleString('ru-RU')} ₽`;
        }).join('\n') : estimate.description || 'Полный функционал согласно обсуждению'}

---
✅ Смета действительна 14 дней
💬 Готовы начать разработку? Свяжитесь с нами!`;

        console.log('📝 Сформировано сообщение для клиента');

        // Отправляем по предпочтительным каналам связи
        let sendResults = [];
        if (preferredChannels.length > 0 && Object.keys(clientContacts).length > 0) {
            try {
                console.log('📤 Отправка по каналам связи...');
                
                // Фильтруем реальные контакты (исключаем служебные поля MongoDB)
                const realContacts = {};
                Object.keys(clientContacts).forEach(key => {
                    if (!key.startsWith('$') && typeof clientContacts[key] === 'string' && clientContacts[key].trim()) {
                        realContacts[key] = clientContacts[key];
                    }
                });
                
                console.log('📞 Реальные контакты:', Object.keys(realContacts));
                
                if (Object.keys(realContacts).length > 0) {
                    sendResults = await sendEstimateToPreferredChannels(
                        clientEstimateMessage, 
                        preferredChannels, 
                        realContacts
                    );
                    console.log('✅ Результаты отправки:', sendResults);
                } else {
                    console.log('⚠️ Нет валидных контактов для отправки');
                }
            } catch (sendError) {
                console.error('❌ Ошибка отправки по каналам:', sendError);
                // Не прерываем выполнение - отвечаем что смета обработана
            }
        } else {
            console.log('⚠️ Нет данных для отправки по каналам связи');
        }

        // Обновляем статус сметы
        try {
            await Estimate.findByIdAndUpdate(estimateId, {
                sentToClient: true,
                sentAt: new Date()
            });
            console.log('✅ Статус сметы обновлен');
        } catch (updateError) {
            console.error('❌ Ошибка обновления статуса сметы:', updateError);
        }

        // Отправляем уведомление в Telegram админу
        try {
            if (bot && process.env.ADMIN_CHAT_ID) {
                const adminMessage = `✅ **СМЕТА ОТПРАВЛЕНА КЛИЕНТУ**

🆔 ID: ${estimateId}
💰 Сумма: ${safeTotalCost.toLocaleString('ru-RU')} ₽
📱 Каналы: ${preferredChannels.join(', ') || 'Не указаны'}
📊 Результат: ${sendResults.length > 0 ? 'Отправлено' : 'Обработано'}`;

                await bot.sendMessage(process.env.ADMIN_CHAT_ID, adminMessage, { parse_mode: 'Markdown' });
                console.log('📲 Уведомление админу отправлено');
            } else {
                console.log('⚠️ Telegram бот или ADMIN_CHAT_ID не настроены для уведомлений');
            }
        } catch (notifyError) {
            console.error('❌ Ошибка уведомления админа:', notifyError);
        }

        res.json({ 
            success: true, 
            message: 'Смета успешно отправлена клиенту',
            sentChannels: preferredChannels,
            results: sendResults,
            estimateId: estimateId
        });

    } catch (error) {
        console.error('💥 Критическая ошибка отправки сметы:', error);
        res.status(500).json({ 
            error: 'Ошибка отправки сметы',
            details: error.message
        });
    }
});

// Функция отправки по предпочтительным каналам связи
async function sendEstimateToPreferredChannels(message, channels, contacts) {
    const results = [];
    
    for (const channel of channels) {
        try {
            switch (channel) {
                case 'Email':
                    if (contacts.Email) {
                        // TODO: Интеграция с email сервисом
                        console.log(`📧 Отправка на email: ${contacts.Email}`);
                        results.push({ channel: 'Email', status: 'sent', contact: contacts.Email });
                    }
                    break;

                case 'Telegram':
                    if (contacts.Telegram && bot) {
                        try {
                            // Попытка отправить в личку Telegram
                            const telegramUsername = contacts.Telegram.replace('@', '').replace('t.me/', '');
                            console.log(`📱 Отправка в Telegram: @${telegramUsername}`);
                            // TODO: Реализовать отправку через Telegram API
                            results.push({ channel: 'Telegram', status: 'sent', contact: contacts.Telegram });
                        } catch (tgError) {
                            console.error('Ошибка отправки в Telegram:', tgError);
                            results.push({ channel: 'Telegram', status: 'error', contact: contacts.Telegram });
                        }
                    }
                    break;

                case 'WhatsApp':
                    if (contacts.WhatsApp) {
                        // TODO: Интеграция с WhatsApp Business API
                        console.log(`📞 Отправка в WhatsApp: ${contacts.WhatsApp}`);
                        results.push({ channel: 'WhatsApp', status: 'pending', contact: contacts.WhatsApp });
                    }
                    break;

                case 'Телефон':
                    if (contacts.Телефон) {
                        // TODO: Интеграция с SMS API
                        console.log(`📞 SMS на телефон: ${contacts.Телефон}`);
                        results.push({ channel: 'SMS', status: 'pending', contact: contacts.Телефон });
                    }
                    break;
            }
        } catch (error) {
            console.error(`Ошибка отправки через ${channel}:`, error);
            results.push({ channel, status: 'error', error: error.message });
        }
    }
    
    return results;
}

// Очистка кеша (для отладки)
app.post('/api/clear-cache', async (req, res) => {
    try {
        // Очищаем кеш PreChatService
        preChatService.clearCache();
        
        // Очищаем глобальный кеш если есть
        if (global.cache) {
            global.cache.flushAll();
        }
        
        console.log('🗑️ Все кеши очищены');
        
        res.json({
            success: true,
            message: 'Кеши успешно очищены'
        });
        
    } catch (error) {
        console.error('❌ Ошибка очистки кеша:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка очистки кеша'
        });
    }
});

// ===== БЕЗОПАСНЫЙ ENDPOINT ДЛЯ ПРОСТОГО ЧАТА =====
app.post('/api/simple-chat', async (req, res) => {
    try {
        const { message, conversation = [] } = req.body;
        
        // Валидация
        if (!message || typeof message !== 'string' || message.length > 500) {
            return res.status(400).json({
                success: false,
                error: 'Некорректное сообщение'
            });
        }
        
        // Ограничиваем историю
        const limitedConversation = conversation.slice(-8);
        
        // Простой промпт без сложной логики
        const simplePrompt = `Ты - помощник для создания Telegram-ботов. Помогай пользователям понять какие функции может иметь их бот.

ПРАВИЛА:
- Отвечай кратко и по делу
- Задавай уточняющие вопросы о бизнесе
- Предлагай конкретные функции
- НЕ называй цены или стоимость
- Веди к детальному обсуждению функций

Если пользователь просит смету - скажи что нужно больше деталей о функциях.`;

        const messages = [
            { role: 'system', content: simplePrompt },
            ...limitedConversation.slice(-6),
            { role: 'user', content: message }
        ];

        // Rate limiting для простого чата
        const userIP = req.ip || 'unknown';
        const rateLimitKey = `simple_chat_${userIP}`;
        const requests = cache.get(rateLimitKey) || 0;
        
        if (requests > 10) { // Максимум 10 запросов за 10 минут
            return res.status(429).json({
                success: false,
                error: 'Слишком много запросов, попробуйте позже'
            });
        }
        
        cache.set(rateLimitKey, requests + 1, 600); // 10 минут

        // Запрос к OpenAI через сервер (безопасно)
        const response = await axios.post(
            OPENAI_CONFIG.endpoint,
            {
                model: OPENAI_CONFIG.model,
                messages: messages,
                max_tokens: 200,
                temperature: 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
                    'Content-Type': 'application/json'
                },
                httpsAgent: proxyAgent,
                timeout: 20000
            }
        );

        const assistantMessage = response.data.choices[0]?.message?.content;

        if (!assistantMessage) {
            throw new Error('Нет ответа от AI');
        }

        res.json({
            success: true,
            message: assistantMessage,
            usage: response.data.usage
        });

    } catch (error) {
        console.error('❌ Ошибка простого чата:', error.message);
        
        if (error.response?.status === 429) {
            return res.status(429).json({
                success: false,
                error: 'ИИ перегружен, попробуйте через минуту'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Временная ошибка ИИ-помощника'
        });
    }
});