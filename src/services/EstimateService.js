const GPTService = require('./GPTService');
const AdvancedGPTService = require('./AdvancedGPTService');
const { Estimate } = require('../models');
const logger = require('../utils/logger');

class EstimateService {
    constructor() {
        this.basePrices = {
            simple: { min: 50000, max: 100000 },
            medium: { min: 100000, max: 200000 },
            complex: { min: 200000, max: 500000 }
        };
    }

    // Основной метод расчета сметы - УПРОЩЕННЫЙ
    async calculateProjectEstimate(requirementsText, conversation = []) {
        try {
            // Если передан только один параметр и это массив - используем его как conversation
            if (Array.isArray(requirementsText) && !conversation.length) {
                conversation = requirementsText;
                requirementsText = null;
            }
            
            // Убеждаемся, что conversation это массив
            if (!Array.isArray(conversation)) {
                logger.warn('conversation не является массивом, преобразуем');
                conversation = [];
            }
            
            logger.info('🚀 Начинаем расчет сметы через GPT', {
                conversationLength: conversation.length,
                hasRequirementsText: !!requirementsText
            });
            
            // Генерируем смету через GPT напрямую
            const gptEstimate = await this.generateEstimateWithGPT(conversation);
            
            if (gptEstimate) {
                // Сохраняем смету в БД
                const savedEstimate = await this.saveEstimateToDatabase(gptEstimate);
                return savedEstimate || gptEstimate;
            }
            
            throw new Error('Не удалось сгенерировать смету через GPT');
            
        } catch (error) {
            logger.error('Критическая ошибка в calculateProjectEstimate:', error);
            throw error; // Больше нет fallback
        }
    }

    // Генерация сметы через GPT - УПРОЩЕННАЯ
    async generateEstimateWithGPT(conversation) {
        try {
            // Проверяем что conversation это массив
            if (!Array.isArray(conversation)) {
                logger.error('conversation не является массивом:', typeof conversation);
                conversation = [];
            }
            
            logger.info('📝 Генерируем смету на основе диалога');

            // Подготавливаем полный текст диалога
            const conversationText = conversation
                .map(msg => `${msg.role === 'user' ? 'КЛИЕНТ' : 'КОНСУЛЬТАНТ'}: ${msg.content}`)
                .join('\n\n');

            let estimatePrompt = `Ты - эксперт по оценке стоимости разработки Telegram-ботов. На основе диалога создай детальную смету.

    ДИАЛОГ:
    ${conversationText}

    ПРАВИЛА СОЗДАНИЯ СМЕТЫ:
    1. Базовая ставка: 2000 руб/час

    2. Включи ВСЕ функции, которые обсуждались в диалоге
    
    3. Оценка времени:
    - Базовая архитектура с масштабируемостью: 10-15 часов
    - Простая функция (кнопки, информация): 8-12 часов
    - Средняя функция (формы, каталоги): 15-25 часов
    - Сложная функция (бронирование, интеграции): 25-40 часов
    - Система отзывов с оценками: 15-20 часов
    - Админ-панель: 30-50 часов
    - Интеграция с Google Sheets: 15-20 часов на каждую сущность
    - Система уведомлений: 10-15 часов
    - Раздел акций/новостей: 10-15 часов
    
    4. НЕ ЗАБУДЬ добавить:
    - Базовую архитектуру: 10-15 часов
    - Тестирование: 20% от общего времени
    - Документацию: 5-10 часов

    5. Минимальная стоимость проекта: 80,000 руб

    ФОРМАТ ОТВЕТА - строго JSON:
    {
    "components": [
        {
        "name": "Точное название функции",
        "description": "Детальное описание реализации",
        "category": "basic|catalog|payments|booking|integrations|communication|analytics|admin|custom",
        "hours": число,
        "cost": стоимость,
        "complexity": "low|medium|high|very_high"
        }
    ],
    "totalHours": сумма_часов,
    "totalCost": общая_стоимость,
    "timeline": "реалистичный_срок",
    "detectedFeatures": ["все", "обнаруженные", "функции"],
    "businessType": "тип_бизнеса",
    "recommendations": ["рекомендация1", "рекомендация2"]
    }

    ПРОВЕРЬ СЕБЯ:
    ✓ Включены ли ВСЕ функции из диалога?
    ✓ Есть ли базовая архитектура?
    ✓ Добавлено ли тестирование?
    ✓ Реалистична ли общая стоимость для указанного объема работ?

    Верни ТОЛЬКО валидный JSON!`;

            logger.info('🤖 Отправляем запрос к GPT для генерации сметы');

            const messages = [
                { role: 'system', content: 'Ты эксперт по созданию детальных смет для Telegram-ботов. Анализируй диалог и создавай ПОЛНЫЕ сметы со ВСЕМИ обсужденными функциями.' },
                { role: 'user', content: estimatePrompt }
            ];

            const response = await AdvancedGPTService.callOpenAIWithPrompt(messages);
            
            logger.info('📊 Ответ GPT получен:', {
                responseLength: response.length,
                isJson: response.includes('{') && response.includes('}'),
                preview: response.substring(0, 200) + '...'
            });
            
            // Парсим ответ
            const parsedEstimate = this.parseGPTResponse(response);
            
            logger.info('✅ Смета сгенерирована:', {
                componentsCount: parsedEstimate.components?.length || 0,
                totalCost: parsedEstimate.totalCost,
                totalHours: parsedEstimate.totalHours,
                componentNames: parsedEstimate.components?.map(c => c.name) || []
            });
            
            // Дополняем метаданными
            return {
                ...parsedEstimate,
                createdAt: new Date(),
                type: 'gpt_generated',
                status: 'pending',
                metadata: {
                    conversationLength: conversation.length
                }
            };
            
        } catch (error) {
            logger.error('Ошибка генерации сметы через GPT:', error.message);
            throw error;
        }
    }

    // Парсинг ответа GPT
    parseGPTResponse(response) {
        try {
            logger.info('Начинаем парсинг ответа GPT', { 
                responseLength: response.length,
                firstChars: response.substring(0, 100)
            });
            
            // Очищаем ответ от markdown и лишних символов
            let cleanedResponse = response;
            
            // Удаляем markdown блоки кода
            cleanedResponse = cleanedResponse.replace(/```json\s*/gi, '');
            cleanedResponse = cleanedResponse.replace(/```\s*/gi, '');
            
            // Удаляем комментарии JSON (если есть)
            cleanedResponse = cleanedResponse.replace(/\/\/.*$/gm, '');
            cleanedResponse = cleanedResponse.replace(/\/\*[\s\S]*?\*\//g, '');
            
            // Находим JSON объект в ответе
            const firstBrace = cleanedResponse.indexOf('{');
            const lastBrace = cleanedResponse.lastIndexOf('}');
            
            if (firstBrace === -1 || lastBrace === -1) {
                throw new Error('JSON объект не найден в ответе');
            }
            
            let jsonString = cleanedResponse.substring(firstBrace, lastBrace + 1);
            
            // Более тщательная очистка JSON
            jsonString = this.cleanJsonString(jsonString);
            
            logger.info('Очищенный JSON для парсинга:', {
                length: jsonString.length,
                preview: jsonString.substring(0, 300) + '...'
            });
            
            // Пробуем распарсить
            return JSON.parse(jsonString);
            
        } catch (error) {
            logger.error('Критическая ошибка парсинга JSON:', {
                error: error.message,
                responsePreview: response.substring(0, 500) + '...'
            });
            
            // Попытка восстановления JSON
            try {
                const recoveredJson = this.tryRecoverJson(response);
                if (recoveredJson) {
                    logger.info('✅ JSON восстановлен успешно');
                    return recoveredJson;
                }
            } catch (recoveryError) {
                logger.error('Не удалось восстановить JSON:', recoveryError.message);
            }
            
            throw new Error('Не удалось распарсить ответ GPT: ' + error.message);
        }
    }

    // Более тщательная очистка JSON строки
    cleanJsonString(jsonString) {
        // Удаляем trailing commas перед } и ]
        jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');
        
        // Удаляем лишние пробелы и переносы строк
        jsonString = jsonString.replace(/\s+/g, ' ').trim();
        
        // Исправляем возможные проблемы с кавычками в строках
        jsonString = this.fixQuotesInJson(jsonString);
        
        return jsonString;
    }

    // Исправление кавычек в JSON
    fixQuotesInJson(jsonString) {
        try {
            // Заменяем одинарные кавычки на двойные (если они не внутри строк)
            let result = '';
            let inString = false;
            let escapeNext = false;
            
            for (let i = 0; i < jsonString.length; i++) {
                const char = jsonString[i];
                const prevChar = i > 0 ? jsonString[i - 1] : '';
                
                if (escapeNext) {
                    result += char;
                    escapeNext = false;
                    continue;
                }
                
                if (char === '\\') {
                    escapeNext = true;
                    result += char;
                    continue;
                }
                
                if (char === '"' && prevChar !== '\\') {
                    inString = !inString;
                }
                
                // Заменяем одинарные кавычки на двойные, если не внутри строки
                if (char === "'" && !inString) {
                    result += '"';
                } else {
                    result += char;
                }
            }
            
            return result;
        } catch (error) {
            logger.warn('Ошибка при исправлении кавычек:', error.message);
            return jsonString;
        }
    }

    // Попытка восстановления поврежденного JSON
    tryRecoverJson(response) {
        try {
            logger.info('🔧 Попытка восстановления поврежденного JSON');
            
            // Ищем все возможные JSON объекты в ответе
            const jsonMatches = response.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
            
            if (!jsonMatches || jsonMatches.length === 0) {
                throw new Error('Не найдено JSON объектов для восстановления');
            }
            
            // Пробуем каждый найденный JSON
            for (const jsonMatch of jsonMatches) {
                try {
                    let cleanJson = this.cleanJsonString(jsonMatch);
                    
                    // Дополнительные попытки исправления
                    const attempts = [
                        cleanJson,
                        cleanJson.replace(/,\s*$/, ''), // Удаляем trailing comma в конце
                        cleanJson.replace(/}\s*,\s*$/, '}'), // Исправляем } ,
                        cleanJson.replace(/]\s*,\s*$/, ']'), // Исправляем ] ,
                    ];
                    
                    for (const attempt of attempts) {
                        try {
                            const parsed = JSON.parse(attempt);
                            if (parsed.components && Array.isArray(parsed.components)) {
                                logger.info('✅ JSON успешно восстановлен');
                                return parsed;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            
            throw new Error('Все попытки восстановления провалились');
            
        } catch (error) {
            logger.error('Ошибка восстановления JSON:', error.message);
            return null;
        }
    }

    // Сохранение в базу данных
    async saveEstimateToDatabase(estimate) {
        try {
            if (!Estimate) {
                logger.warn('Модель Estimate недоступна');
                return estimate;
            }
            
            const savedEstimate = await Estimate.create(estimate);
            logger.info('✅ Смета сохранена в БД', { id: savedEstimate._id });
            
            return savedEstimate;
            
        } catch (error) {
            logger.error('Ошибка сохранения в БД:', error.message);
            return estimate;
        }
    }

    // Расчет сроков
    calculateTimeline(totalHours) {
        const daysNeeded = Math.ceil(totalHours / 6);
        
        if (daysNeeded <= 7) return '1 неделя';
        if (daysNeeded <= 14) return '2 недели';
        if (daysNeeded <= 21) return '3 недели';
        if (daysNeeded <= 30) return '1 месяц';
        if (daysNeeded <= 45) return '1.5 месяца';
        if (daysNeeded <= 60) return '2 месяца';
        
        return `${Math.ceil(daysNeeded / 30)} месяца`;
    }

    // Расчет сметы (публичный метод для совместимости)
    async calculateEstimate(requirements, conversation = []) {
        return this.calculateProjectEstimate(requirements, conversation);
    }
}

module.exports = new EstimateService();