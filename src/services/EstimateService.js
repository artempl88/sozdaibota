const GPTService = require('./GPTService');
const AdvancedGPTService = require('./AdvancedGPTService');
const FeaturesService = require('./FeaturesService');
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

    // Основной метод расчета сметы
    async calculateProjectEstimate(requirements, conversation = []) {
        try {
            logger.info('🚀 Начинаем интеллектуальный расчет сметы через GPT');
            
            // Генерируем смету через GPT с динамическим определением функций
            const gptEstimate = await this.generateEstimateWithGPT(requirements, conversation);
            
            if (gptEstimate) {
                // Сохраняем новые функции в каталог
                await this.saveNewFeaturesToCatalog(gptEstimate.components);
                
                // Сохраняем смету в БД
                await this.saveEstimateToDatabase(gptEstimate);
                
                return gptEstimate;
            }
            
            throw new Error('Не удалось сгенерировать смету');
            
        } catch (error) {
            logger.error('Критическая ошибка в calculateProjectEstimate:', error);
            
            // Fallback на базовую оценку
            return this.generateBasicEstimate(requirements);
        }
    }

    // Генерация сметы через GPT с динамическими функциями
    async generateEstimateWithGPT(requirements, conversation) {
        try {
            const conversationText = conversation
                .slice(-10)
                .map(msg => `${msg.role === 'user' ? 'Клиент' : 'Консультант'}: ${msg.content}`)
                .join('\n\n');

            // Получаем существующие функции для контекста
            const existingFeatures = await FeaturesService.getAllFeatures();
            const featuresContext = this.formatFeaturesForContext(existingFeatures);

            const estimatePrompt = `Ты - эксперт по оценке стоимости разработки Telegram-ботов. Проанализируй диалог и создай ДЕТАЛЬНУЮ смету с конкретными функциями.

ДИАЛОГ С КЛИЕНТОМ:
${conversationText}

СУЩЕСТВУЮЩИЕ ФУНКЦИИ В КАТАЛОГЕ (используй как примеры):
${featuresContext}

ЗАДАЧА:
1. Внимательно изучи, что именно хочет клиент
2. Определи ВСЕ необходимые функции (даже те, которых нет в каталоге)
3. Для каждой функции придумай понятное название и описание
4. Оцени сложность и время разработки

Создай смету в формате JSON:
{
  "components": [
    {
      "name": "Конкретное название функции",
      "description": "Что именно будет делать эта функция",
      "category": "basic|catalog|payments|booking|integrations|communication|analytics|admin|special|custom",
      "keywords": ["ключевое1", "ключевое2", "ключевое3"],
      "hours": число_часов,
      "cost": стоимость_в_рублях,
      "complexity": "low|medium|high",
      "isNew": true/false
    }
  ],
  "totalHours": общее_количество_часов,
  "totalCost": общая_стоимость,
  "timeline": "срок_разработки",
  "detectedFeatures": ["список", "всех", "функций"],
  "businessType": "тип_бизнеса_клиента",
  "recommendations": ["рекомендация1", "рекомендация2"]
}

ПРАВИЛА:
1. Базовая ставка: 2000 руб/час
2. ВСЕГДА включай "Базовая настройка бота" (10 часов, 20000 руб)
3. Простая функция (low): 5-10 часов
4. Средняя функция (medium): 10-20 часов  
5. Сложная функция (high): 20-40 часов
6. Добавь 20% на тестирование и отладку
7. Минимальная стоимость проекта: 50000 руб
8. isNew: true - если функции нет в существующем каталоге

ВАЖНО: 
- Создавай конкретные функции под запрос клиента
- Не копируй слепо из каталога - адаптируй под бизнес
- Добавляй уникальные функции если нужно
- Верни ТОЛЬКО валидный JSON!`;

            const messages = [
                { role: 'system', content: 'Ты эксперт по Telegram-ботам. Создавай детальные сметы с конкретными функциями. Отвечай только JSON.' },
                { role: 'user', content: estimatePrompt }
            ];

            const response = await AdvancedGPTService.callOpenAIWithPrompt(messages);
            
            // Парсим ответ
            const estimate = this.parseGPTResponse(response);
            
            // Дополняем метаданными
            return {
                ...estimate,
                createdAt: new Date(),
                type: 'gpt_generated',
                status: 'pending',
                metadata: {
                    requirementsLength: requirements.length,
                    conversationLength: conversation.length,
                    newFeaturesCount: estimate.components.filter(c => c.isNew).length
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
            // Очищаем ответ от markdown
            let cleanedResponse = response;
            cleanedResponse = cleanedResponse.replace(/```json\s*/gi, '');
            cleanedResponse = cleanedResponse.replace(/```\s*/gi, '');
            cleanedResponse = cleanedResponse.trim();
            
            // Находим JSON
            const firstBrace = cleanedResponse.indexOf('{');
            const lastBrace = cleanedResponse.lastIndexOf('}');
            
            if (firstBrace !== -1 && lastBrace !== -1) {
                cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1);
            }
            
            return JSON.parse(cleanedResponse);
            
        } catch (error) {
            logger.error('Ошибка парсинга JSON:', error);
            throw new Error('Не удалось распарсить ответ GPT');
        }
    }

    // Форматирование существующих функций для контекста GPT
    formatFeaturesForContext(features) {
        const examples = [];
        const categories = Object.keys(features);
        
        // Берем по 2-3 примера из каждой категории
        categories.forEach(category => {
            const categoryFeatures = features[category].slice(0, 2);
            categoryFeatures.forEach(feature => {
                examples.push(`- ${feature.name} (${category}): ${feature.hours}ч, ${feature.cost}руб`);
            });
        });
        
        return examples.join('\n');
    }

    // Сохранение новых функций в каталог
    async saveNewFeaturesToCatalog(components) {
        try {
            const newFeatures = components.filter(component => component.isNew);
            
            if (newFeatures.length === 0) {
                logger.info('Нет новых функций для добавления в каталог');
                return;
            }
            
            logger.info(`🆕 Найдено ${newFeatures.length} новых функций для каталога`);
            
            for (const feature of newFeatures) {
                // Подготавливаем функцию для каталога
                const catalogFeature = {
                    name: feature.name,
                    description: feature.description,
                    keywords: feature.keywords || [],
                    hours: feature.hours,
                    cost: feature.cost,
                    complexity: feature.complexity,
                    addedAt: new Date().toISOString(),
                    usageCount: 1
                };
                
                // Добавляем в соответствующую категорию
                await FeaturesService.addFeature(feature.category || 'custom', catalogFeature);
                
                logger.info(`✅ Добавлена новая функция: ${feature.name} в категорию ${feature.category}`);
            }
            
        } catch (error) {
            logger.error('Ошибка сохранения новых функций:', error);
            // Не прерываем процесс, продолжаем со сметой
        }
    }

    // Базовая генерация сметы (fallback)
    generateBasicEstimate(requirements) {
        logger.warn('Используем базовую генерацию сметы');
        
        const components = [
            {
                name: 'Базовая настройка бота',
                description: 'Создание бота, настройка команд, базовое меню',
                hours: 10,
                cost: 20000,
                complexity: 'low',
                category: 'basic'
            },
            {
                name: 'Основной функционал',
                description: 'Реализация базовых функций согласно требованиям',
                hours: 30,
                cost: 60000,
                complexity: 'medium',
                category: 'custom'
            },
            {
                name: 'Тестирование и отладка',
                description: 'Полное тестирование, исправление ошибок',
                hours: 10,
                cost: 20000,
                complexity: 'medium',
                category: 'basic'
            }
        ];
        
        return {
            components,
            totalHours: 50,
            totalCost: 100000,
            timeline: '2-3 недели',
            detectedFeatures: components.map(c => c.name),
            createdAt: new Date(),
            type: 'basic_estimate',
            status: 'pending',
            recommendations: [
                'Рекомендуем начать с базового функционала',
                'Дополнительные функции можно добавить позже'
            ]
        };
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

    // Анализ использования функций (для оптимизации каталога)
    async analyzeFeatureUsage() {
        try {
            const usage = await FeaturesService.getFeatureUsageStats();
            
            logger.info('📊 Статистика использования функций:', usage);
            
            // Можно использовать для:
            // - Определения популярных функций
            // - Корректировки цен
            // - Удаления неиспользуемых функций
            
            return usage;
            
        } catch (error) {
            logger.error('Ошибка анализа использования:', error);
            return null;
        }
    }
}

module.exports = new EstimateService();