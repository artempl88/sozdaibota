const logger = require('../utils/logger');
const GPTService = require('./GPTService');

class EstimateService {
    constructor() {
        this.pricingSystem = {
            hourlyRate: 2000,
            minProjectCost: 15000,
            // Только базовые компоненты, которые есть в ЛЮБОМ боте
            baseComponents: {
                'базовая структура бота': 8,
                'система команд и меню': 4,
                'подключение к API Telegram': 2,
                'база данных пользователей': 6,
                'админ-панель': 12,
                'система логирования': 3,
                'деплой и настройка': 4
            }
        };
    }

    // Главный метод - интеллектуальный расчет через GPT-4
    async calculateProjectEstimate(requirements, conversation = []) {
        try {
            logger.info('Начинаем интеллектуальный расчет сметы через GPT');

            // Анализируем требования и генерируем смету через GPT
            const estimate = await this.generateEstimateWithGPT(requirements, conversation);
            
            if (estimate) {
                logger.info('Смета успешно сгенерирована через GPT', { 
                    totalCost: estimate.totalCost, 
                    totalHours: estimate.totalHours,
                    componentsCount: estimate.components.length
                });
                return estimate;
            }

            // Fallback на базовую оценку
            logger.warn('GPT не смог сгенерировать смету, используем базовую оценку');
            return this.getBasicEstimate(requirements);

        } catch (error) {
            logger.error('Ошибка расчета сметы:', error);
            return this.getMinimalEstimate();
        }
    }

    // Генерация сметы через GPT с анализом ниши
    async generateEstimateWithGPT(requirements, conversation = []) {
        try {
            // Подготавливаем контекст из диалога
            const contextText = conversation.length > 0 
                ? conversation.map(msg => `${msg.role}: ${msg.content}`).join('\n')
                : requirements;

            const estimationPrompt = `Ты - опытный техлид с 10+ лет опыта оценки проектов Telegram-ботов.

ЗАДАЧА: Проанализируй диалог/требования и создай детальную смету.

ДИАЛОГ/ТРЕБОВАНИЯ:
${contextText}

ИНСТРУКЦИИ:
1. Определи нишу/отрасль бизнеса клиента
2. Извлеки ВСЕ упомянутые функции (явно и косвенно)
3. Добавь необходимые технические функции, которые нужны но не были упомянуты
4. Оцени время в часах для каждой функции с учетом:
   - Сложности реализации
   - Интеграций с внешними сервисами
   - Специфики отрасли
   - Необходимости тестирования
5. Добавь базовые компоненты (структура бота, БД, админка и т.д.)

БАЗОВЫЕ КОМПОНЕНТЫ (обязательны для любого бота):
${JSON.stringify(this.pricingSystem.baseComponents, null, 2)}

ПРАВИЛА ОЦЕНКИ ВРЕМЕНИ:
- Простая кнопка/команда: 0.5-1 час
- Форма с валидацией: 2-4 часа
- Интеграция с внешним API: 6-12 часов
- Сложная бизнес-логика: 8-20 часов
- Платежные системы: 10-15 часов
- Личный кабинет: 8-12 часов
- Система уведомлений: 4-8 часов
- Аналитика и отчеты: 10-20 часов

ВАЖНО: Учитывай специфику отрасли! Например:
- Медицина требует повышенной безопасности (+30% времени)
- Финансы требуют точных расчетов (+25% времени)
- E-commerce требует надежности платежей (+20% времени)

ФОРМАТ ОТВЕТА (строго JSON):
{
    "projectName": "Telegram-бот для [отрасль/описание]",
    "industry": "определенная отрасль",
    "components": [
        {
            "name": "Название функции",
            "hours": 10,
            "description": "Что включает",
            "category": "feature|base|integration|admin|analytics"
        }
    ],
    "totalHours": 100,
    "complexity": "простой|средний|сложный|очень сложный",
    "risks": ["риск 1", "риск 2"],
    "timeline": "X недель/месяцев",
    "recommendations": ["совет 1", "совет 2"],
    "detectedFeatures": ["список всех найденных функций"]
}`;

            const messages = [
                { role: 'system', content: estimationPrompt },
                { role: 'user', content: 'Создай детальную смету на основе предоставленной информации.' }
            ];

            const response = await GPTService.chat(messages);
            const gptEstimate = JSON.parse(response);
            
            // Добавляем расчет стоимости
            const totalCost = gptEstimate.totalHours * this.pricingSystem.hourlyRate;
            
            // Добавляем стоимость к каждому компоненту
            const componentsWithCost = gptEstimate.components.map(comp => ({
                ...comp,
                cost: comp.hours * this.pricingSystem.hourlyRate
            }));
            
            const result = {
                ...gptEstimate,
                components: componentsWithCost,
                hourlyRate: this.pricingSystem.hourlyRate,
                totalCost: Math.max(totalCost, this.pricingSystem.minProjectCost),
                costBreakdown: componentsWithCost,
                metadata: {
                    generatedBy: 'GPT-4',
                    timestamp: new Date(),
                    industry: gptEstimate.industry
                }
            };

            return result;

        } catch (error) {
            logger.error('Ошибка генерации сметы через GPT:', error);
            return null;
        }
    }

    // Базовая оценка (когда GPT недоступен)
    getBasicEstimate(requirements) {
        try {
            let totalHours = 0;
            let components = [];
            
            // Добавляем только базовые компоненты
            Object.entries(this.pricingSystem.baseComponents).forEach(([name, hours]) => {
                totalHours += hours;
                components.push({ 
                    name, 
                    hours, 
                    description: 'Базовый компонент',
                    cost: hours * this.pricingSystem.hourlyRate,
                    category: 'base'
                });
            });
            
            // Добавляем примерную оценку для дополнительного функционала
            const estimatedFeatureHours = 40; // Средняя оценка
            totalHours += estimatedFeatureHours;
            components.push({
                name: 'Специфичный функционал (требует уточнения)',
                hours: estimatedFeatureHours,
                description: 'Функции, описанные в требованиях',
                cost: estimatedFeatureHours * this.pricingSystem.hourlyRate,
                category: 'feature'
            });
            
            const totalCost = totalHours * this.pricingSystem.hourlyRate;
            
            return {
                projectName: 'Telegram-бот (базовая оценка)',
                components: components,
                totalHours,
                totalCost: Math.max(totalCost, this.pricingSystem.minProjectCost),
                hourlyRate: this.pricingSystem.hourlyRate,
                complexity: 'требует уточнения',
                timeline: `${Math.ceil(totalHours / 40)} недель (примерно)`,
                detectedFeatures: ['Требуется детальный анализ через GPT'],
                costBreakdown: components,
                metadata: {
                    generatedBy: 'fallback',
                    warning: 'Это примерная оценка. Для точного расчета требуется анализ через GPT.'
                }
            };

        } catch (error) {
            logger.error('Ошибка базовой оценки:', error);
            return this.getMinimalEstimate();
        }
    }

    // Минимальная смета при критических ошибках
    getMinimalEstimate() {
        const hours = 40;
        const cost = hours * this.pricingSystem.hourlyRate;
        
        return {
            projectName: 'Базовый Telegram-бот',
            components: [
                { 
                    name: 'Базовая разработка', 
                    hours: hours, 
                    description: 'Минимальный функционал',
                    cost: cost,
                    category: 'base'
                }
            ],
            totalHours: hours,
            totalCost: Math.max(cost, this.pricingSystem.minProjectCost),
            hourlyRate: this.pricingSystem.hourlyRate,
            complexity: 'простой',
            timeline: '1 неделя',
            detectedFeatures: [],
            costBreakdown: [
                { 
                    name: 'Базовая разработка', 
                    hours: hours, 
                    cost: cost,
                    description: 'Минимальный функционал'
                }
            ],
            metadata: {
                generatedBy: 'minimal-fallback',
                warning: 'Минимальная оценка из-за ошибки системы'
            }
        };
    }

    // Форматирование сметы для отображения
    formatEstimateMessage(estimate) {
        const totalCost = Number(estimate.totalCost) || 0;
        const totalHours = Number(estimate.totalHours) || 0;
        
        let message = `💰 **Расчет стоимости вашего проекта**

📋 **${estimate.projectName}**
${estimate.industry ? `🏢 **Отрасль:** ${estimate.industry}` : ''}

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

⚡ **Сложность проекта:** ${estimate.complexity}`;

        if (estimate.risks && estimate.risks.length > 0) {
            message += `\n\n⚠️ **Риски:**\n${estimate.risks.map(r => `• ${r}`).join('\n')}`;
        }

        if (estimate.recommendations && estimate.recommendations.length > 0) {
            message += `\n\n💡 **Рекомендации:**\n${estimate.recommendations.map(r => `• ${r}`).join('\n')}`;
        }

        if (estimate.metadata?.warning) {
            message += `\n\n⚠️ **Внимание:** ${estimate.metadata.warning}`;
        }

        message += `\n\n---\n✅ Это предварительная оценка. Финальная стоимость может отличаться на ±15% после детального анализа ТЗ.`;

        return message;
    }

    // Парсинг требований (устаревший метод, оставлен для совместимости)
    parseRequirements(text) {
        logger.warn('Используется устаревший метод parseRequirements. Рекомендуется использовать GPT анализ.');
        return [];
    }

    // Быстрая оценка по категории
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