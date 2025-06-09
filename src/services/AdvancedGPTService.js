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
            // Подготавливаем контекст последних сообщений
            const recentHistory = chatHistory.slice(-6);
            const contextMessages = recentHistory
                .map(msg => `${msg.role === 'user' ? 'Клиент' : 'Консультант'}: ${msg.content}`)
                .join('\n\n');
            
            const intentAnalysisPrompt = `Ты - эксперт по анализу диалогов. Проанализируй последнее сообщение клиента и определи, хочет ли он получить смету/расчет стоимости.

КОНТЕКСТ ДИАЛОГА:
${contextMessages}

ПОСЛЕДНЕЕ СООБЩЕНИЕ КЛИЕНТА: "${message}"

КРИТЕРИИ ДЛЯ ОТВЕТА "ДА":
1. Клиент явно спрашивает про стоимость, цену, бюджет, смету
2. Клиент соглашается после предложения консультанта рассчитать стоимость
3. Клиент говорит, что готов к расчету или хочет узнать цену
4. Клиент завершает описание требований фразами типа "всё", "достаточно", "готово"
5. Клиент спрашивает о следующих шагах после обсуждения функционала

КРИТЕРИИ ДЛЯ ОТВЕТА "НЕТ":
1. Клиент еще описывает требования или отвечает на вопросы
2. Клиент задает уточняющие вопросы о функционале
3. Клиент хочет добавить или изменить функции
4. В диалоге меньше 6 сообщений (недостаточно информации)
5. Клиент явно говорит, что еще думает или не готов

ВАЖНО: 
- Учитывай весь контекст диалога, а не только последнее сообщение
- Если есть сомнения - отвечай "НЕТ"
- Количество сообщений в диалоге: ${chatHistory.length}

Ответь ТОЛЬКО одним словом: "ДА" или "НЕТ"`;

            const messages = [
                { role: 'system', content: intentAnalysisPrompt },
                { role: 'user', content: 'Проанализируй и дай ответ.' }
            ];

            const response = await this.callOpenAIWithPrompt(messages);
            
            // Очищаем ответ от лишних символов
            const cleanResponse = response.trim().toUpperCase();
            
            // Проверяем, содержит ли ответ "ДА"
            const result = cleanResponse === 'ДА' || cleanResponse.includes('ДА');
            
            logger.info('✅ Анализ намерений завершен', { 
                message: message.slice(0, 50) + '...', 
                historyLength: chatHistory.length,
                gptResponse: cleanResponse,
                result
            });
            
            return result;

        } catch (error) {
            logger.error('❌ Ошибка анализа намерений через GPT:', error);
            
            // При ошибке GPT возвращаем false - безопаснее не генерировать смету
            return false;
        }
    }

    // Проверка готовности функционала для расчета сметы
    async checkFunctionalityReadiness(conversation) {
        try {
            logger.info('🔍 Проверяем готовность функционала для сметы через GPT');
            
            // Подготавливаем текст диалога
            const allMessages = conversation
                .slice(-10) // Последние 10 сообщений
                .map(m => `${m.role === 'user' ? 'Клиент' : 'Консультант'}: ${m.content}`)
                .join('\n\n');
            
            const functionalityCheckPrompt = `Ты - эксперт по анализу требований к Telegram-ботам. Определи, достаточно ли информации для создания сметы.

ДИАЛОГ:
${allMessages}

КРИТЕРИИ ГОТОВНОСТИ (должны выполняться ВСЕ):
1. ✓ Понятен тип бизнеса или сфера деятельности клиента
2. ✓ Описаны основные задачи, которые должен решать бот (минимум 2-3)
3. ✓ Есть конкретные функции или примеры использования
4. ✓ Диалог содержит минимум 6 содержательных сообщений
5. ✓ Клиент дал развернутые ответы, а не односложные

КРИТЕРИИ НЕ ГОТОВНОСТИ (если хотя бы один выполняется):
1. ✗ Ответы клиента слишком общие или односложные
2. ✗ Нет конкретики по функционалу (только общие слова)
3. ✗ Не понятна сфера деятельности или тип бизнеса
4. ✗ Слишком мало информации (менее 6 сообщений)
5. ✗ Клиент еще в процессе формулирования требований

АНАЛИЗ:
- Внимательно изучи весь диалог
- Оцени полноту и конкретность информации
- Учти количество и качество сообщений

Ответь ТОЛЬКО одним словом: "ГОТОВ" или "НЕ_ГОТОВ"`;

            const messages = [
                { role: 'system', content: functionalityCheckPrompt },
                { role: 'user', content: 'Проанализируй готовность.' }
            ];

            const response = await this.callOpenAIWithPrompt(messages);
            
            // Очищаем ответ
            const cleanResponse = response.trim().toUpperCase();
            
            // Проверяем результат
            const result = cleanResponse === 'ГОТОВ' || cleanResponse.includes('ГОТОВ');
            
            logger.info('📊 Результат проверки готовности через GPT', { 
                conversationLength: conversation.length,
                gptResponse: cleanResponse,
                result 
            });
            
            return result;

        } catch (error) {
            logger.error('❌ Ошибка проверки готовности через GPT:', error);
            
            // При ошибке возвращаем false - не готов
            return false;
        }
    }

    // Извлечение всех согласованных функций из диалога
    async extractAgreedFeatures(conversation) {
        try {
            logger.info('🔍 Извлекаем все согласованные функции через GPT');
            
            const conversationText = conversation
                .map(msg => `${msg.role === 'user' ? 'Клиент' : 'Консультант'}: ${msg.content}`)
                .join('\n\n');
            
            const extractionPrompt = `Ты - эксперт по анализу диалогов. Твоя задача - найти ВСЕ функции, которые клиент подтвердил или согласился реализовать.

ДИАЛОГ:
${conversationText}

ВАЖНЫЕ ПРАВИЛА:
1. Если клиент дал первоначальное ТЗ, а потом согласился на дополнения - учитывай ВСЕ
2. "Да", "нужно", "важно", "обязательно", "желательно", "всё устраивает" от клиента = подтверждение функции
3. Не пропускай функции из середины и конца диалога
4. Если консультант предложил функцию и клиент согласился - она ОБЯЗАТЕЛЬНА
5. Если консультант перечислил итоговый функционал и клиент сказал "всё устраивает" - ВСЕ перечисленное ОБЯЗАТЕЛЬНО

АНАЛИЗИРУЙ ПОШАГОВО:
1. Какие функции были в первоначальном ТЗ?
2. Какие функции предложил консультант?
3. На что клиент ответил согласием?
4. Какие уточнения и дополнения сделал клиент?
5. Был ли итоговый список функций, который клиент подтвердил?

Верни JSON со ВСЕМИ согласованными функциями:
{
  "agreedFeatures": [
    {
      "name": "Название функции",
      "description": "Описание",
      "source": "initial_requirements|consultant_proposal|client_addition",
      "confirmed": true/false,
      "complexity": "simple|medium|complex|very_complex"
    }
  ],
  "keyRequirements": {
    "userCount": число или null,
    "hasAdminPanel": true/false,
    "hasStatistics": true/false,
    "hasDatabase": true/false,
    "needsConfidentiality": true/false,
    "integrations": ["список интеграций"] или []
  },
  "projectType": "simple_bot|corporate_system|marketplace|integration_heavy"
}`;

            const messages = [
                { role: 'system', content: 'Ты эксперт по анализу требований. Извлекай ВСЕ согласованные функции из диалога. Отвечай только валидным JSON.' },
                { role: 'user', content: extractionPrompt }
            ];

            const response = await this.callOpenAIWithPrompt(messages);
            
            try {
                const features = JSON.parse(response);
                logger.info('✅ Извлечены согласованные функции:', {
                    count: features.agreedFeatures?.length || 0,
                    hasAdmin: features.keyRequirements?.hasAdminPanel,
                    projectType: features.projectType
                });
                return features;
            } catch (parseError) {
                logger.error('Ошибка парсинга функций:', parseError);
                return {
                    agreedFeatures: [],
                    keyRequirements: {},
                    projectType: 'simple_bot'
                };
            }
            
        } catch (error) {
            logger.error('❌ Ошибка извлечения функций через GPT:', error);
            return null;
        }
    }

    // Извлечение всех согласованных функций из диалога
    async extractAgreedFeatures(conversation) {
        try {
            logger.info('🔍 Извлекаем все согласованные функции через GPT');
            
            const conversationText = conversation
                .map(msg => `${msg.role === 'user' ? 'Клиент' : 'Консультант'}: ${msg.content}`)
                .join('\n\n');
            
            const extractionPrompt = `Ты - эксперт по анализу диалогов. Твоя задача - найти ВСЕ функции, которые клиент подтвердил или согласился реализовать.

ДИАЛОГ:
${conversationText}

ВАЖНЫЕ ПРАВИЛА:
1. Если клиент дал первоначальное ТЗ, а потом согласился на дополнения - учитывай ВСЕ
2. "Да", "нужно", "важно", "обязательно" от клиента = подтверждение функции
3. Не пропускай функции из середины и конца диалога
4. Если консультант предложил функцию и клиент согласился - она ОБЯЗАТЕЛЬНА

АНАЛИЗИРУЙ ПОШАГОВО:
1. Какие функции были в первоначальном ТЗ?
2. Какие функции предложил консультант?
3. На что клиент ответил согласием?
4. Какие уточнения и дополнения сделал клиент?

Верни JSON со ВСЕМИ согласованными функциями:
{
  "agreedFeatures": [
    {
      "name": "Название функции",
      "description": "Описание",
      "source": "initial_requirements|consultant_proposal|client_addition",
      "confirmed": true/false,
      "complexity": "simple|medium|complex|very_complex"
    }
  ],
  "keyRequirements": {
    "userCount": число или null,
    "hasAdminPanel": true/false,
    "hasStatistics": true/false,
    "hasDatabase": true/false,
    "needsConfidentiality": true/false,
    "integrations": ["список интеграций"] или []
  },
  "projectType": "simple_bot|corporate_system|marketplace|integration_heavy"
}`;

            const messages = [
                { role: 'system', content: 'Ты эксперт по анализу требований. Извлекай ВСЕ согласованные функции из диалога. Отвечай только валидным JSON.' },
                { role: 'user', content: extractionPrompt }
            ];

            const response = await this.callOpenAIWithPrompt(messages);
            
            try {
                const features = JSON.parse(response);
                logger.info('✅ Извлечены согласованные функции:', {
                    count: features.agreedFeatures?.length || 0,
                    hasAdmin: features.keyRequirements?.hasAdminPanel,
                    projectType: features.projectType
                });
                return features;
            } catch (parseError) {
                logger.error('Ошибка парсинга функций:', parseError);
                return {
                    agreedFeatures: [],
                    keyRequirements: {},
                    projectType: 'simple_bot'
                };
            }
            
        } catch (error) {
            logger.error('❌ Ошибка извлечения функций через GPT:', error);
            return null;
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