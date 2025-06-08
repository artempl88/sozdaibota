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
            logger.info('🚀 Начинаем интеллектуальный расчет сметы через GPT', {
                requirementsType: typeof requirements,
                conversationLength: conversation.length
            });
            
            // Генерируем смету через GPT с динамическим определением функций
            const gptEstimate = await this.generateEstimateWithGPT(requirements, conversation);
            
            if (gptEstimate) {
                // Сохраняем новые функции в каталог
                await this.saveNewFeaturesToCatalog(gptEstimate.components);
                
                // Сохраняем смету в БД
                const savedEstimate = await this.saveEstimateToDatabase(gptEstimate);
                
                return savedEstimate || gptEstimate;
            }
            
            throw new Error('Не удалось сгенерировать смету через GPT');
            
        } catch (error) {
            logger.error('Критическая ошибка в calculateProjectEstimate:', error);
            
            // Fallback на базовую оценку
            // Передаем requirements как строку для анализа
            const requirementsText = typeof requirements === 'string' 
                ? requirements 
                : JSON.stringify(requirements);
                
            return this.generateBasicEstimate(requirementsText);
        }
    }

    // Генерация сметы через GPT с динамическими функциями
    async generateEstimateWithGPT(requirements, conversation) {
        try {
            const conversationText = conversation
                .slice(-20) // Берем больше контекста
                .map(msg => `${msg.role === 'user' ? 'Клиент' : 'Консультант'}: ${msg.content}`)
                .join('\n\n');

            // Получаем существующие функции для контекста
            const existingFeatures = await FeaturesService.getAllFeatures();
            const featuresContext = this.formatFeaturesForContext(existingFeatures);

            const estimatePrompt = `Ты - эксперт по оценке стоимости разработки Telegram-ботов. Проанализируй диалог и создай ДЕТАЛЬНУЮ смету, включив ВСЕ обсуждаемые функции.

ДИАЛОГ С КЛИЕНТОМ:
${conversationText}

КРИТИЧЕСКИ ВАЖНО: Внимательно прочитай весь диалог и найди ВСЕ функции, которые клиент подтвердил как "обязательные". НЕ ПРОПУСТИ НИ ОДНОЙ ФУНКЦИИ!

ПРАВИЛА СОЗДАНИЯ СМЕТЫ:
1. Базовая ставка: 2000 руб/час
2. ОБЯЗАТЕЛЬНО включи ВСЕ функции из диалога, особенно те, которые клиент назвал обязательными
3. Для каждой функции создай отдельный компонент с конкретным названием
4. Время на разработку:
   - Простая функция: 8-15 часов
   - Средняя функция: 15-25 часов  
   - Сложная функция (интеграции, мультиязычность): 25-40 часов
   - Очень сложная (авторизация, CRM): 40-60 часов
5. Добавь 20-30% времени на тестирование
6. Минимальная стоимость проекта: 150000 руб для сложных проектов

ОСОБОЕ ВНИМАНИЕ обрати на:
- Интеграции с внешними системами (CRM, платежи)
- Поддержку нескольких языков
- Системы авторизации и разграничения прав
- Аналитику и отчетность
- Административные панели

Создай смету в формате JSON:
{
  "components": [
    {
      "name": "Конкретное название функции из диалога",
      "description": "Подробное описание что включает",
      "category": "basic|catalog|payments|booking|integrations|communication|analytics|admin|special|custom",
      "keywords": ["ключевое1", "ключевое2"],
      "hours": число_часов,
      "cost": стоимость_в_рублях,
      "complexity": "low|medium|high|very_high",
      "isNew": true/false
    }
  ],
  "totalHours": сумма_всех_часов,
  "totalCost": общая_стоимость,
  "timeline": "реалистичный_срок_в_неделях",
  "detectedFeatures": ["список", "всех", "обнаруженных", "функций"],
  "businessType": "тип_бизнеса_клиента",
  "recommendations": ["рекомендация1", "рекомендация2"]
}

ПРОВЕРЬ СЕБЯ: 
- Включил ли ты ВСЕ функции из диалога?
- Реалистична ли общая стоимость для такого объема работ?
- Учтена ли сложность интеграций и дополнительных требований?

Верни ТОЛЬКО валидный JSON!`;

            const messages = [
                { role: 'system', content: 'Ты эксперт по Telegram-ботам. Создавай детальные сметы на основе конкретных требований из диалога. Отвечай только валидным JSON.' },
                { role: 'user', content: estimatePrompt }
            ];

            const response = await AdvancedGPTService.callOpenAIWithPrompt(messages);
            
            // Парсим ответ
            const estimate = this.parseGPTResponse(response);
            
            // Проверяем минимальную стоимость в зависимости от сложности
            const hasComplexFeatures = estimate.components?.some(c => 
                c.complexity === 'high' || 
                c.complexity === 'very_high' ||
                c.name?.toLowerCase().includes('интеграц') ||
                c.name?.toLowerCase().includes('авториз') ||
                c.name?.toLowerCase().includes('язык')
            );
            
            const minCost = hasComplexFeatures ? 150000 : 80000;
            
            if (estimate.totalCost < minCost) {
                logger.warn(`Стоимость ${estimate.totalCost} меньше минимальной ${minCost}, корректируем`);
                const ratio = minCost / estimate.totalCost;
                estimate.totalCost = minCost;
                estimate.totalHours = Math.ceil(estimate.totalHours * ratio);
                
                // Пропорционально увеличиваем стоимость компонентов
                estimate.components = estimate.components.map(c => ({
                    ...c,
                    cost: Math.ceil(c.cost * ratio),
                    hours: Math.ceil(c.hours * ratio)
                }));
            }
            
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

    // Валидация и исправление структуры сметы
    validateAndFixEstimate(estimate) {
        try {
            logger.info('Валидация структуры сметы', {
                hasEstimate: !!estimate,
                estimateType: typeof estimate,
                keys: estimate ? Object.keys(estimate) : []
            });
            
            // Если estimate не объект, создаем базовую структуру
            if (!estimate || typeof estimate !== 'object') {
                logger.warn('Estimate не является объектом, создаем базовую структуру');
                return this.generateBasicEstimate('');
            }
            
            // Проверяем обязательные поля
            const fixed = {
                components: estimate.components || [],
                totalHours: estimate.totalHours || 0,
                totalCost: estimate.totalCost || 0,
                timeline: estimate.timeline || '2-3 недели',
                detectedFeatures: estimate.detectedFeatures || [],
                recommendations: estimate.recommendations || [],
                businessType: estimate.businessType || 'Бизнес',
                createdAt: estimate.createdAt || new Date(),
                type: estimate.type || 'gpt_generated',
                status: estimate.status || 'pending'
            };
            
            // Проверяем компоненты
            if (!Array.isArray(fixed.components)) {
                fixed.components = [];
            }
            
            // Валидируем каждый компонент
            fixed.components = fixed.components.map(comp => ({
                name: comp.name || 'Функция без названия',
                description: comp.description || 'Описание не указано',
                hours: parseInt(comp.hours) || 10,
                cost: parseInt(comp.cost) || 20000,
                complexity: comp.complexity || 'medium',
                category: comp.category || 'custom',
                isNew: comp.isNew || false
            }));
            
            // Пересчитываем итоги если они не указаны
            if (fixed.totalCost === 0 && fixed.components.length > 0) {
                fixed.totalCost = fixed.components.reduce((sum, c) => sum + c.cost, 0);
            }
            
            if (fixed.totalHours === 0 && fixed.components.length > 0) {
                fixed.totalHours = fixed.components.reduce((sum, c) => sum + c.hours, 0);
            }
            
            // Проверяем минимальные значения
            if (fixed.totalCost < 50000) {
                logger.warn('Стоимость меньше минимальной, корректируем');
                fixed.totalCost = 80000;
            }
            
            if (fixed.totalHours < 20) {
                logger.warn('Часы меньше минимальных, корректируем');
                fixed.totalHours = 40;
            }
            
            // Если компонентов нет, добавляем базовые
            if (fixed.components.length === 0) {
                logger.warn('Компоненты отсутствуют, добавляем базовые');
                fixed.components = [
                    {
                        name: 'Разработка Telegram-бота',
                        description: 'Полный цикл разработки',
                        hours: fixed.totalHours || 40,
                        cost: fixed.totalCost || 80000,
                        complexity: 'medium',
                        category: 'custom',
                        isNew: false
                    }
                ];
            }
            
            // Обновляем detectedFeatures если пустой
            if (fixed.detectedFeatures.length === 0) {
                fixed.detectedFeatures = fixed.components.map(c => c.name);
            }
            
            logger.info('Смета провалидирована и исправлена', {
                totalCost: fixed.totalCost,
                totalHours: fixed.totalHours,
                componentsCount: fixed.components.length
            });
            
            return fixed;
            
        } catch (error) {
            logger.error('Ошибка валидации сметы:', error);
            return this.generateBasicEstimate('');
        }
    }

    // Парсинг ответа GPT с улучшенной обработкой ошибок
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
            
            // Удаляем trailing commas (запятые перед закрывающими скобками)
            cleanedResponse = cleanedResponse.replace(/,\s*}/g, '}');
            cleanedResponse = cleanedResponse.replace(/,\s*]/g, ']');
            
            // Заменяем одинарные кавычки на двойные (осторожно)
            // Но только если они используются для ключей/значений
            cleanedResponse = cleanedResponse.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":');
            
            // Удаляем лишние пробелы и переносы строк
            cleanedResponse = cleanedResponse.trim();
            
            // Находим JSON объект в ответе
            const firstBrace = cleanedResponse.indexOf('{');
            const lastBrace = cleanedResponse.lastIndexOf('}');
            
            if (firstBrace === -1 || lastBrace === -1) {
                throw new Error('JSON объект не найден в ответе');
            }
            
            let jsonString = cleanedResponse.substring(firstBrace, lastBrace + 1);
            
            // Пробуем исправить распространенные ошибки
            try {
                return JSON.parse(jsonString);
            } catch (firstError) {
                logger.warn('Первая попытка парсинга не удалась, пробуем исправить', {
                    error: firstError.message,
                    position: this.getErrorPosition(firstError.message)
                });
                
                // Пробуем более агрессивные исправления
                jsonString = this.tryFixCommonJSONErrors(jsonString);
                
                try {
                    return JSON.parse(jsonString);
                } catch (secondError) {
                    // Если все еще не работает, пробуем извлечь хотя бы часть данных
                    logger.error('Вторая попытка парсинга не удалась', {
                        error: secondError.message,
                        jsonPreview: jsonString.substring(0, 200) + '...'
                    });
                    
                    // Пытаемся создать базовую структуру из того, что есть
                    return this.extractBasicStructure(jsonString);
                }
            }
            
        } catch (error) {
            logger.error('Критическая ошибка парсинга JSON:', {
                error: error.message,
                responsePreview: response.substring(0, 200) + '...'
            });
            throw new Error('Не удалось распарсить ответ GPT: ' + error.message);
        }
    }
    
    // Дополнительный метод для исправления распространенных ошибок JSON
    tryFixCommonJSONErrors(jsonString) {
        try {
            // Исправляем незакрытые строки
            let fixed = jsonString;
            
            // Считаем кавычки и добавляем недостающие
            const quoteCount = (fixed.match(/"/g) || []).length;
            if (quoteCount % 2 !== 0) {
                // Нечетное количество кавычек - добавляем в конец
                fixed = fixed + '"';
            }
            
            // Исправляем незакрытые массивы
            const openBrackets = (fixed.match(/\[/g) || []).length;
            const closeBrackets = (fixed.match(/]/g) || []).length;
            if (openBrackets > closeBrackets) {
                fixed = fixed + ']'.repeat(openBrackets - closeBrackets);
            }
            
            // Исправляем незакрытые объекты
            const openBraces = (fixed.match(/{/g) || []).length;
            const closeBraces = (fixed.match(/}/g) || []).length;
            if (openBraces > closeBraces) {
                fixed = fixed + '}'.repeat(openBraces - closeBraces);
            }
            
            // Убираем двойные запятые
            fixed = fixed.replace(/,,+/g, ',');
            
            // Убираем запятые перед закрывающими скобками (еще раз)
            fixed = fixed.replace(/,\s*}/g, '}');
            fixed = fixed.replace(/,\s*]/g, ']');
            
            return fixed;
            
        } catch (error) {
            logger.error('Ошибка при попытке исправить JSON:', error);
            return jsonString;
        }
    }
    
    // Извлечение позиции ошибки из сообщения
    getErrorPosition(errorMessage) {
        const match = errorMessage.match(/position (\d+)/i);
        return match ? parseInt(match[1]) : null;
    }
    
    // Извлечение базовой структуры из поврежденного JSON
    extractBasicStructure(jsonString) {
        try {
            const estimate = {
                components: [],
                totalHours: 0,
                totalCost: 0,
                timeline: '2-3 недели',
                detectedFeatures: [],
                recommendations: []
            };
            
            // Пытаемся извлечь totalCost
            const costMatch = jsonString.match(/"totalCost"\s*:\s*(\d+)/);
            if (costMatch) {
                estimate.totalCost = parseInt(costMatch[1]);
            }
            
            // Пытаемся извлечь totalHours
            const hoursMatch = jsonString.match(/"totalHours"\s*:\s*(\d+)/);
            if (hoursMatch) {
                estimate.totalHours = parseInt(hoursMatch[1]);
            }
            
            // Пытаемся извлечь timeline
            const timelineMatch = jsonString.match(/"timeline"\s*:\s*"([^"]+)"/);
            if (timelineMatch) {
                estimate.timeline = timelineMatch[1];
            }
            
            // Пытаемся извлечь компоненты
            const componentsMatch = jsonString.match(/"components"\s*:\s*\[([\s\S]*?)]/);
            if (componentsMatch) {
                try {
                    // Пробуем распарсить массив компонентов
                    const componentsJson = '[' + componentsMatch[1] + ']';
                    const components = JSON.parse(this.tryFixCommonJSONErrors(componentsJson));
                    estimate.components = components;
                } catch (e) {
                    logger.warn('Не удалось извлечь компоненты:', e.message);
                }
            }
            
            // Если ничего не извлекли, возвращаем базовую смету
            if (estimate.totalCost === 0 && estimate.totalHours === 0) {
                logger.warn('Не удалось извлечь данные, используем значения по умолчанию');
                estimate.totalCost = 100000;
                estimate.totalHours = 50;
                estimate.components = [
                    {
                        name: 'Разработка бота',
                        description: 'Основной функционал согласно требованиям',
                        hours: 40,
                        cost: 80000,
                        complexity: 'medium'
                    },
                    {
                        name: 'Тестирование и отладка',
                        description: 'Полное тестирование функционала',
                        hours: 10,
                        cost: 20000,
                        complexity: 'low'
                    }
                ];
            }
            
            return estimate;
            
        } catch (error) {
            logger.error('Ошибка извлечения базовой структуры:', error);
            
            // Возвращаем минимальную рабочую структуру
            return {
                components: [{
                    name: 'Разработка Telegram-бота',
                    description: 'Полный цикл разработки',
                    hours: 50,
                    cost: 100000,
                    complexity: 'medium'
                }],
                totalHours: 50,
                totalCost: 100000,
                timeline: '2-3 недели',
                detectedFeatures: ['Базовый функционал'],
                recommendations: ['Начать с MVP версии']
            };
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

    // Базовая генерация сметы (fallback) с учетом контекста
    generateBasicEstimate(requirements) {
        logger.warn('Используем базовую генерацию сметы');
        
        // Анализируем требования для определения функций
        const lowerReq = requirements.toLowerCase();
        const components = [];
        let totalHours = 0;
        let totalCost = 0;
        
        // Базовая настройка - всегда включена
        components.push({
            name: 'Базовая настройка и архитектура бота',
            description: 'Создание бота, настройка команд, базовое меню, структура проекта',
            hours: 8,
            cost: 16000,
            complexity: 'low',
            category: 'basic'
        });
        totalHours += 8;
        
        // Анализируем упоминания функций
        if (lowerReq.includes('запись') || lowerReq.includes('бронирован')) {
            components.push({
                name: 'Система записи на прием',
                description: 'Интерактивный календарь, выбор свободных слотов, подтверждение записи',
                hours: 20,
                cost: 40000,
                complexity: 'high',
                category: 'booking'
            });
            totalHours += 20;
        }
        
        if (lowerReq.includes('напоминан')) {
            components.push({
                name: 'Автоматические напоминания',
                description: 'Настройка и отправка напоминаний о записях за день и за 2 часа',
                hours: 10,
                cost: 20000,
                complexity: 'medium',
                category: 'communication'
            });
            totalHours += 10;
        }
        
        if (lowerReq.includes('оператор') || lowerReq.includes('администратор')) {
            components.push({
                name: 'Интеграция с оператором',
                description: 'Переключение на живого оператора, уведомления администратору',
                hours: 12,
                cost: 24000,
                complexity: 'medium',
                category: 'communication'
            });
            totalHours += 12;
        }
        
        if (lowerReq.includes('расписан') || lowerReq.includes('смен')) {
            components.push({
                name: 'Управление расписанием персонала',
                description: 'Просмотр и управление графиком смен сотрудников',
                hours: 15,
                cost: 30000,
                complexity: 'medium',
                category: 'admin'
            });
            totalHours += 15;
        }
        
        if (lowerReq.includes('сообщен') && lowerReq.includes('персонал')) {
            components.push({
                name: 'Внутренний чат для персонала',
                description: 'Обмен сообщениями между сотрудниками внутри бота',
                hours: 12,
                cost: 24000,
                complexity: 'medium',
                category: 'communication'
            });
            totalHours += 12;
        }
        
        if (lowerReq.includes('заявк') || lowerReq.includes('закупк')) {
            components.push({
                name: 'Система заявок на закупки',
                description: 'Форма подачи заявок, отслеживание статуса, уведомления',
                hours: 15,
                cost: 30000,
                complexity: 'medium',
                category: 'special'
            });
            totalHours += 15;
        }
        
        if (lowerReq.includes('faq') || lowerReq.includes('вопрос')) {
            components.push({
                name: 'Раздел FAQ',
                description: 'База частых вопросов и ответов с удобной навигацией',
                hours: 8,
                cost: 16000,
                complexity: 'low',
                category: 'communication'
            });
            totalHours += 8;
        }
        
        // Если компонентов мало, добавляем общий функционал
        if (components.length < 3) {
            components.push({
                name: 'Основной бизнес-функционал',
                description: 'Реализация специфичных функций согласно требованиям',
                hours: 20,
                cost: 40000,
                complexity: 'medium',
                category: 'custom'
            });
            totalHours += 20;
        }
        
        // Административная панель
        components.push({
            name: 'Административная панель',
            description: 'Управление ботом, просмотр статистики, настройки',
            hours: 12,
            cost: 24000,
            complexity: 'medium',
            category: 'admin'
        });
        totalHours += 12;
        
        // Тестирование - 20% от общего времени
        const testingHours = Math.ceil(totalHours * 0.2);
        components.push({
            name: 'Тестирование и отладка',
            description: 'Полное тестирование всех функций, исправление ошибок, оптимизация',
            hours: testingHours,
            cost: testingHours * 2000,
            complexity: 'medium',
            category: 'basic'
        });
        totalHours += testingHours;
        
        // Считаем общую стоимость
        totalCost = totalHours * 2000;
        
        // Проверяем минимальную стоимость
        if (totalCost < 80000) {
            totalCost = 80000;
            totalHours = 40;
        }
        
        return {
            components,
            totalHours,
            totalCost,
            timeline: this.calculateTimeline(totalHours),
            detectedFeatures: components.map(c => c.name),
            createdAt: new Date(),
            type: 'basic_estimate',
            status: 'pending',
            businessType: this.detectBusinessType(requirements),
            recommendations: [
                'Рекомендуем начать с MVP версии основных функций',
                'Дополнительные интеграции можно добавить на втором этапе',
                'Возможна поэтапная оплата и разработка'
            ]
        };
    }
    
    // Определение типа бизнеса из требований
    detectBusinessType(requirements) {
        const lowerReq = requirements.toLowerCase();
        
        if (lowerReq.includes('стоматолог') || lowerReq.includes('медицин') || lowerReq.includes('клиник')) {
            return 'Медицина/Стоматология';
        } else if (lowerReq.includes('магазин') || lowerReq.includes('товар')) {
            return 'Интернет-магазин';
        } else if (lowerReq.includes('салон') || lowerReq.includes('красот')) {
            return 'Салон красоты';
        } else if (lowerReq.includes('ресторан') || lowerReq.includes('кафе')) {
            return 'Ресторан/Кафе';
        } else {
            return 'Бизнес';
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