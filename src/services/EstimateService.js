const logger = require('../utils/logger');
const GPTService = require('./GPTService');

class EstimateService {
    constructor() {
        this.pricingSystem = {
            hourlyRate: 2000,
            minProjectCost: 15000,
            // Базовые компоненты
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
    }

    // Интеллектуальный расчет через GPT-4
    async calculateProjectEstimate(requirements, conversation = []) {
        try {
            logger.info('Начинаем расчет сметы', { requirementsLength: requirements.length });

            // Сначала парсим требования
            const detectedFeatures = this.parseRequirements(requirements);
            
            // Промпт для GPT-4 для точной оценки
            const estimationPrompt = `Ты - опытный техлид с 10+ лет опыта оценки проектов Telegram-ботов.

ЗАДАЧА: Оцени время разработки в часах для каждой функции.

КОНТЕКСТ ПРОЕКТА:
${requirements}

БАЗОВЫЕ КОМПОНЕНТЫ (часы):
${JSON.stringify(this.pricingSystem.baseComponents, null, 2)}

ТИПОВЫЕ ФУНКЦИИ (часы):
${JSON.stringify(this.pricingSystem.features, null, 2)}

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

            try {
                const messages = [
                    { role: 'system', content: estimationPrompt },
                    { role: 'user', content: `Оцени проект: ${requirements}` }
                ];

                const response = await GPTService.chat(messages);
                const estimate = JSON.parse(response);
                
                // Расчет стоимости
                const cost = estimate.totalHours * this.pricingSystem.hourlyRate;
                
                const result = {
                    ...estimate,
                    hourlyRate: this.pricingSystem.hourlyRate,
                    totalCost: cost,
                    detectedFeatures: detectedFeatures,
                    costBreakdown: estimate.components.map(c => ({
                        ...c,
                        cost: c.hours * this.pricingSystem.hourlyRate
                    }))
                };

                logger.info('Смета рассчитана через GPT', { 
                    totalCost: result.totalCost, 
                    totalHours: result.totalHours 
                });

                return result;

            } catch (gptError) {
                logger.warn('Ошибка GPT расчета, используем fallback:', gptError.message);
                return this.fallbackEstimate(requirements, detectedFeatures);
            }

        } catch (error) {
            logger.error('Ошибка расчета сметы:', error);
            return this.fallbackEstimate(requirements);
        }
    }

    // Резервная оценка без GPT-4
    fallbackEstimate(requirements, detectedFeatures = null) {
        try {
            const lower = requirements.toLowerCase();
            let totalHours = 0;
            let components = [];
            
            // Добавляем базовые компоненты
            Object.entries(this.pricingSystem.baseComponents).forEach(([name, hours]) => {
                totalHours += hours;
                components.push({ 
                    name, 
                    hours, 
                    description: 'Базовая функция',
                    cost: hours * this.pricingSystem.hourlyRate 
                });
            });
            
            // Используем переданные функции или парсим заново
            const features = detectedFeatures || this.parseRequirements(requirements);
            
            // Добавляем функции
            features.forEach(feature => {
                const hours = this.pricingSystem.features[feature] || 5;
                totalHours += hours;
                components.push({ 
                    name: feature, 
                    hours, 
                    description: 'Специальная функция',
                    cost: hours * this.pricingSystem.hourlyRate 
                });
            });
            
            // Минимум 40 часов на любой проект
            totalHours = Math.max(totalHours, 40);
            
            const result = {
                projectName: 'Telegram-бот',
                components,
                totalHours,
                totalCost: totalHours * this.pricingSystem.hourlyRate,
                complexity: 'средний',
                timeline: `${Math.ceil(totalHours / 40)} недель`,
                detectedFeatures: features,
                costBreakdown: components
            };

            logger.info('Смета рассчитана через fallback', { 
                totalCost: result.totalCost, 
                totalHours: result.totalHours 
            });

            return result;

        } catch (error) {
            logger.error('Ошибка fallback расчета:', error);
            return this.getMinimalEstimate();
        }
    }

    // Парсинг требований из текста
    parseRequirements(text) {
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
        
        // Дополнительная проверка для функций из pricing system
        Object.keys(this.pricingSystem.features).forEach(feature => {
            if (!detectedFeatures.includes(feature)) {
                // Проверяем точное совпадение слов
                const featureWords = feature.toLowerCase().split(' ');
                const textWords = lower.split(/\s+/);
                
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

    // Форматирование сметы
    formatEstimateMessage(estimate) {
        const totalCost = Number(estimate.totalCost) || 0;
        const totalHours = Number(estimate.totalHours) || 0;
        
        return `💰 **Расчет стоимости вашего проекта**

📋 **${estimate.projectName}**

⏱️ **Оценка времени:** ${totalHours} часов (${estimate.timeline})

💵 **Стоимость:** ${totalCost.toLocaleString('ru-RU')} руб.
*Из расчета ${this.pricingSystem.hourlyRate} руб/час*

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

    // Минимальная смета при ошибках
    getMinimalEstimate() {
        return {
            projectName: 'Базовый Telegram-бот',
            components: [
                { name: 'Базовая разработка', hours: 40, description: 'Минимальный функционал' }
            ],
            totalHours: 40,
            totalCost: 80000,
            complexity: 'простой',
            timeline: '1 неделя',
            detectedFeatures: [],
            costBreakdown: [
                { name: 'Базовая разработка', hours: 40, cost: 80000 }
            ]
        };
    }

    // Получение примерной стоимости по категории
    getQuickEstimate(category) {
        const quickEstimates = {
            'simple': { cost: 25000, description: 'Простой бот с базовыми функциями' },
            'medium': { cost: 50000, description: 'Бот средней сложности с интеграциями' },
            'complex': { cost: 100000, description: 'Сложный бот с ИИ и аналитикой' }
        };

        return quickEstimates[category] || quickEstimates['medium'];
    }
}

module.exports = new EstimateService(); 