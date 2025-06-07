const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const config = require('../config');
const logger = require('../utils/logger');

class AdvancedGPTService {
    constructor() {
        this.apiKey = config.openai.apiKey;
        this.model = config.openai.model;
        this.endpoint = config.openai.endpoint;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        
        // Настройка прокси
        this.proxyAgent = null;
        if (config.proxy.host && config.proxy.port && config.proxy.username && config.proxy.password) {
            this.proxyAgent = new HttpsProxyAgent(
                `${config.proxy.protocol}://${config.proxy.username}:${config.proxy.password}@${config.proxy.host}:${config.proxy.port}`
            );
            logger.info(`🔗 AdvancedGPT: Прокси настроен: ${config.proxy.host}:${config.proxy.port}`);
        }
        
        // Системные промпты
        this.baseSystemPrompt = `Ты - эксперт по созданию Telegram-ботов с опытом 5+ лет. Помогаешь клиентам создать техническое задание и рассчитать стоимость разработки.

ТВОЙ ПОДХОД:
1. Быстро понять бизнес клиента (1-2 вопроса)
2. Выяснить основные задачи бота (2-3 вопроса)
3. Уточнить дополнительные функции и интеграции
4. При готовности - предложить расчет стоимости

ПРИНЦИПЫ:
- Задавай конкретные вопросы, избегай общих фраз
- Предлагай функции исходя из ниши клиента
- НЕ называй конкретные цены или суммы
- После 8+ сообщений с деталями можешь предложить расчет

ВАЖНО: Когда клиент готов к расчету - скажи что "менеджер рассчитает стоимость и свяжется в течение 30 минут"`;

        this.formulationPrompt = `Ты специалист по Telegram-ботам. Твоя задача - помочь клиенту четко сформулировать требования к боту.

ПОДХОД:
1. Задавай простые конкретные вопросы
2. Помогай структурировать мысли клиента
3. НЕ предлагай сложные решения
4. Фокусируйся на понимании задач бота

ПРИНЦИПЫ:
- Один вопрос за раз
- Простые формулировки
- Без технических терминов
- Помогай думать пошагово`;
    }

    // Основной вызов OpenAI с retry логикой
    async callOpenAIWithPrompt(messages, retryCount = 0) {
        try {
            if (!this.apiKey) {
                throw new Error('OpenAI API ключ не настроен');
            }

            const response = await axios.post(
                this.endpoint,
                {
                    model: this.model,
                    messages: messages,
                    max_tokens: 400,
                    temperature: 0.7
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000,
                    httpsAgent: this.proxyAgent
                }
            );

            const message = response.data.choices[0]?.message?.content;
            
            if (!message) {
                throw new Error('Нет ответа от OpenAI');
            }

            logger.info('GPT ответ получен', { messageLength: message.length, retryCount });
            return message;
            
        } catch (error) {
            logger.error(`Ошибка GPT (попытка ${retryCount + 1}):`, error.message);
            
            if (retryCount < this.maxRetries && this.isRetryableError(error)) {
                const delay = this.retryDelay * Math.pow(2, retryCount);
                logger.info(`Повторная попытка через ${delay}ms`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callOpenAIWithPrompt(messages, retryCount + 1);
            }
            
            throw error;
        }
    }

    // Проверка ошибок, при которых стоит повторить запрос
    isRetryableError(error) {
        return (
            error.code === 'ECONNRESET' || 
            error.code === 'ETIMEDOUT' ||
            error.response?.status === 503 ||
            error.response?.status === 502 ||
            error.response?.status === 429
        );
    }

    // Анализ намерений пользователя с улучшенной логикой
    async analyzeUserIntent(message, chatHistory = []) {
        try {
            const contextMessages = chatHistory.slice(-4).map(msg => `${msg.role}: ${msg.content}`).join('\n');
            
            const intentAnalysisPrompt = `Проанализируй сообщение пользователя.

Последнее сообщение: "${message}"
Количество сообщений в диалоге: ${chatHistory.length}

Если пользователь ЯВНО спрашивает про:
- смету / "давай смету" / "сделай смету"
- цену / стоимость / "сколько стоит"
- расчет / "посчитай" / "рассчитай"

И в диалоге больше 8 сообщений - ВСЕГДА отвечай "ДА"

Ответь ТОЛЬКО: "ДА" или "НЕТ"`;

            const messages = [
                { role: 'system', content: intentAnalysisPrompt },
                { role: 'user', content: message }
            ];

            const response = await this.callOpenAIWithPrompt(messages);
            
            // ДОБАВЬТЕ ЭТО ЛОГИРОВАНИЕ
            console.log('🤖 GPT ответ на анализ намерений:', response);
            console.log('🔍 Длина ответа:', response.length);
            console.log('🔍 Первые 50 символов:', response.substring(0, 50));
            
            const result = response.trim().toUpperCase().includes('ДА');
            
            logger.info('Анализ намерений завершен', { 
                message: message.slice(0, 50), 
                historyLength: chatHistory.length,
                result,
                gptResponse: response // ДОБАВЬТЕ ЭТО
            });
            
            return result;

        } catch (error) {
            logger.error('Ошибка анализа намерений:', error);
            
            // УЛУЧШЕННАЯ FALLBACK ЛОГИКА
            const triggerWords = ['сколько', 'стоимость', 'цена', 'бюджет', 'расчет', 'смета', 'смету', 'рассчитать'];
            const hasKeywords = triggerWords.some(word => message.toLowerCase().includes(word));
            const enoughHistory = chatHistory.length >= 6;
            
            console.log('📌 Fallback анализ:', { hasKeywords, enoughHistory, message });
            
            return hasKeywords && enoughHistory;
        }
    }

    // Проверка готовности функционала для расчета сметы
    async checkFunctionalityReadiness(conversation) {
        try {
            const allMessages = conversation.map(m => `${m.role}: ${m.content}`).join('\n');
            
            const functionalityCheckPrompt = `Проанализируй диалог и определи готовность для создания сметы.

Диалог: ${allMessages}

КРИТЕРИИ готовности:
1. Определен тип бота и его назначение
2. Обсуждены конкретные функции (минимум 3-4)
3. Клиент дал развернутые ответы
4. Есть понимание целей проекта
5. Диалог содержит 8+ содержательных сообщений

ВАЖНО: 
- Если ответы односложные - НЕ_ГОТОВ
- Если функции описаны общими словами - НЕ_ГОТОВ  
- Если нет конкретики - НЕ_ГОТОВ

Ответь ТОЛЬКО: "ГОТОВ" или "НЕ_ГОТОВ"`;

            const messages = [
                { role: 'system', content: functionalityCheckPrompt }
            ];

            const response = await this.callOpenAIWithPrompt(messages);
            const result = response.trim().toUpperCase().includes('ГОТОВ');
            
            logger.info('Проверка готовности функционала', { 
                conversationLength: conversation.length, 
                result 
            });
            
            return result;

        } catch (error) {
            logger.error('Ошибка проверки готовности функционала:', error);
            
            // Fallback: строгие требования
            const userMessages = conversation.filter(m => m.role === 'user');
            const detailedMessages = userMessages.filter(m => m.content.length > 30);
            const hasFeatureKeywords = conversation.some(m => 
                ['функция', 'возможности', 'интеграция', 'задача', 'бот должен'].some(keyword =>
                    m.content.toLowerCase().includes(keyword)
                )
            );
            
            return conversation.length >= 8 && detailedMessages.length >= 4 && hasFeatureKeywords;
        }
    }

    // Создание системного промпта в зависимости от режима и стадии
    buildSystemPrompt(mode = 'chat', conversationLength = 0) {
        if (mode === 'formulation') {
            return this.formulationPrompt;
        }
        
        // Адаптируем промпт под стадию диалога
        let stagePrompt = '';
        if (conversationLength < 4) {
            stagePrompt = '\n\nСТАДИЯ: Знакомство с бизнесом. Узнай суть деятельности и основные задачи.';
        } else if (conversationLength < 8) {
            stagePrompt = '\n\nСТАДИЯ: Выяснение функций бота. Предложи конкретные возможности.';
        } else {
            stagePrompt = '\n\nСТАДИЯ: Финализация требований. Можешь предложить переход к расчету.';
        }
        
        return this.baseSystemPrompt + stagePrompt;
    }

    // Создание резервного технического задания
    createFallbackSpec(conversation) {
        try {
            const userMessages = conversation
                .filter(msg => msg.role === 'user')
                .map(msg => msg.content)
                .join(' ');
            
            const businessType = this.extractBusinessType(userMessages);
            const features = this.extractBasicFeatures(userMessages);
            
            const spec = `# Техническое задание на разработку Telegram-бота

## 1. Общая информация
**Тип бизнеса:** ${businessType}
**Платформа:** Telegram Bot API

## 2. Основные функции
${features.map((feature, index) => `${index + 1}. ${feature}`).join('\n')}

## 3. Техническая архитектура
- Backend: Node.js + Express
- База данных: MongoDB
- Хостинг: VPS/Cloud
- API: Telegram Bot API

## 4. Этапы разработки
1. Настройка инфраструктуры (3-5 дней)
2. Разработка основного функционала (1-2 недели)
3. Интеграция дополнительных функций (5-7 дней)
4. Тестирование и отладка (3-5 дней)
5. Деплой и запуск (1-2 дня)

*Документ создан на основе диалога с клиентом*`;

            logger.info('Создано резервное ТЗ', { businessType, featuresCount: features.length });
            return spec;
            
        } catch (error) {
            logger.error('Ошибка создания резервного ТЗ:', error);
            return 'Ошибка создания технического задания. Свяжитесь с менеджером.';
        }
    }

    // Извлечение типа бизнеса из текста
    extractBusinessType(text) {
        const patterns = {
            'Интернет-магазин': /магазин|товар|продажа|ecommerce|торговля/i,
            'Салон красоты': /красота|салон|мастер|запись|услуг/i,
            'Ресторан': /ресторан|кафе|еда|доставка|меню/i,
            'Обучение': /курс|обучение|образование|урок|школа/i,
            'Консультации': /консультац|совет|помощь|эксперт/i,
            'Медицина': /врач|медицин|клиника|здоровье|лечение/i,
            'Недвижимость': /недвижимост|квартира|дом|аренда/i
        };
        
        for (const [type, pattern] of Object.entries(patterns)) {
            if (pattern.test(text)) {
                return type;
            }
        }
        
        return 'Универсальный бизнес';
    }

    // Извлечение базовых функций из текста
    extractBasicFeatures(text) {
        const features = [];
        const lowerText = text.toLowerCase();
        
        if (lowerText.includes('каталог') || lowerText.includes('товар')) {
            features.push('Каталог товаров/услуг');
        }
        if (lowerText.includes('заказ') || lowerText.includes('корзин')) {
            features.push('Система заказов');
        }
        if (lowerText.includes('запись') || lowerText.includes('календар')) {
            features.push('Система записи');
        }
        if (lowerText.includes('платеж') || lowerText.includes('оплат')) {
            features.push('Интеграция платежей');
        }
        if (lowerText.includes('уведомлен') || lowerText.includes('напомин')) {
            features.push('Система уведомлений');
        }
        
        // Если функций мало, добавляем базовые
        if (features.length < 3) {
            features.push('Базовое меню и навигация');
            features.push('Обработка пользовательских запросов');
            features.push('Административная панель');
        }
        
        return features;
    }

    // Получение случайного приветственного сообщения
    getRandomPrompt() {
        const variants = [
            "Привет! Я помогу создать идеального бота. Расскажи о своем бизнесе?",
            "Здравствуйте! За 5 минут создам ТЗ на бота. Какую задачу решаем?",
            "Добро пожаловать! Создадим бота под ваши потребности. С чего начнем?",
            "Привет! Специализируюсь на Telegram-ботах. Что автоматизируем?"
        ];
        
        const randomPrompt = variants[Math.floor(Math.random() * variants.length)];
        logger.info('Выбран случайный промпт');
        return randomPrompt;
    }
}

module.exports = new AdvancedGPTService(); 