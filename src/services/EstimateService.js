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

    // Основной метод расчета сметы - УПРОЩЕН
    async calculateProjectEstimate(conversation = []) {
        try {
            logger.info('🚀 Начинаем интеллектуальный расчет сметы через GPT', {
                conversationLength: conversation.length
            });
            
            // Генерируем смету через GPT
            const gptEstimate = await this.generateEstimateWithGPT(conversation);
            
            if (gptEstimate) {
                // Сохраняем смету в БД
                const savedEstimate = await this.saveEstimateToDatabase(gptEstimate);
                return savedEstimate || gptEstimate;
            }
            
            throw new Error('Не удалось сгенерировать смету через GPT');
            
        } catch (error) {
            logger.error('Критическая ошибка в calculateProjectEstimate:', error);
            
            // Fallback на базовую оценку
            const conversationText = conversation
                .map(msg => `${msg.role}: ${msg.content}`)
                .join('\n');
                
            return this.generateBasicEstimate(conversationText);
        }
    }

    // Генерация сметы через GPT - ИСПРАВЛЕНО
    async generateEstimateWithGPT(conversation) {
        try {
            // ВАЖНО: Сначала извлекаем все согласованные функции
            logger.info('📋 Извлекаем согласованные функции из диалога...');
            const agreedFeatures = await AdvancedGPTService.extractAgreedFeatures(conversation);
            
            // ИСПРАВЛЕНО: Берем ВЕСЬ диалог, а не последние 20 сообщений
            const conversationText = conversation
                .map(msg => `${msg.role === 'user' ? 'Клиент' : 'Консультант'}: ${msg.content}`)
                .join('\n\n');

            logger.info('📝 Анализ диалога для сметы:', {
                messageCount: conversation.length,
                textLength: conversationText.length,
                agreedFeaturesCount: agreedFeatures?.agreedFeatures?.length || 0
            });

            let estimatePrompt = `Ты - эксперт по оценке стоимости разработки Telegram-ботов. Проанализируй диалог и создай ДЕТАЛЬНУЮ смету, включив ВСЕ обсуждаемые функции.

ДИАЛОГ С КЛИЕНТОМ:
${conversationText}

`;

            // Если извлекли согласованные функции, добавляем их явно
            if (agreedFeatures && agreedFeatures.agreedFeatures.length > 0) {
                estimatePrompt += `
ОБЯЗАТЕЛЬНЫЕ ФУНКЦИИ (извлечены из диалога):
${agreedFeatures.agreedFeatures.map((f, i) => 
    `${i+1}. ${f.name} - ${f.description} (сложность: ${f.complexity})`
).join('\n')}

КЛЮЧЕВЫЕ ТРЕБОВАНИЯ:
- Количество пользователей: ${agreedFeatures.keyRequirements.userCount || 'не указано'}
- Админ-панель: ${agreedFeatures.keyRequirements.hasAdminPanel ? 'ДА' : 'НЕТ'}
- Статистика: ${agreedFeatures.keyRequirements.hasStatistics ? 'ДА' : 'НЕТ'}
- База данных: ${agreedFeatures.keyRequirements.hasDatabase ? 'ДА' : 'НЕТ'}
- Конфиденциальность: ${agreedFeatures.keyRequirements.needsConfidentiality ? 'ДА' : 'НЕТ'}
- Интеграции: ${agreedFeatures.keyRequirements.integrations?.join(', ') || 'нет'}
- Тип проекта: ${agreedFeatures.projectType}

ВАЖНО: Эти функции ОБЯЗАТЕЛЬНЫ в смете!

`;
            }

            estimatePrompt += `
КРИТИЧЕСКИ ВАЖНО: 
- Внимательно прочитай ВЕСЬ диалог от начала до конца
- НЕ ОРИЕНТИРУЙСЯ только на первое техническое задание - оно может быть шаблоном
- ОБЯЗАТЕЛЬНО учти ВСЕ уточнения и дополнения клиента после первого ТЗ
- Если клиент подтвердил дополнительные функции - ОНИ ОБЯЗАТЕЛЬНЫ в смете
- Особое внимание удели фразам: "да", "важно", "нужно", "обязательно", "желательно"

ПРАВИЛА ОЦЕНКИ ВРЕМЕНИ И СТОИМОСТИ:
1. Базовая ставка: 2000 руб/час

2. Оценка времени разработки:
   - Простая функция (FAQ, простые кнопки): 8-15 часов
   - Средняя функция (формы, каталоги): 15-25 часов
   - Сложная функция (бронирование, платежи): 25-40 часов
   - Очень сложная (интеграции с CRM, API): 40-60 часов
   - Админ-панель: минимум 30-50 часов
   - База данных и статистика: 20-30 часов
   - Система записи с календарем: 20-30 часов
   - Напоминания и уведомления: 10-15 часов
   - Интеграция с Google Sheets: 10-15 часов
   - Мультиязычность: +50% времени ко всем функциям
   - Авторизация и роли: 30-50 часов

3. Обязательные компоненты для любого проекта:
   - Базовая архитектура: 10-15 часов
   - Тестирование: 20-30% от общего времени
   - Документация: 5-10 часов

4. Минимальная стоимость:
   - Простой бот: 80,000 руб
   - Средний бот: 150,000 руб
   - Сложный бот (с интеграциями): 300,000 руб
   - Корпоративная система: 400,000+ руб

ФОРМАТ ОТВЕТА - строго JSON:
{
  "components": [
    {
      "name": "Конкретное название функции из диалога",
      "description": "Подробное описание что включает",
      "category": "basic|communication|integration|admin|special|custom",
      "hours": число_часов,
      "cost": стоимость_в_рублях,
      "complexity": "low|medium|high|very_high"
    }
  ],
  "totalHours": сумма_всех_часов,
  "totalCost": общая_стоимость,
  "timeline": "реалистичный_срок_в_неделях",
  "detectedFeatures": ["список", "всех", "обнаруженных", "функций"],
  "businessType": "тип_бизнеса_клиента",
  "recommendations": ["рекомендация1", "рекомендация2", "рекомендация3"]
}

ПРОВЕРЬ СЕБЯ ПЕРЕД ОТВЕТОМ:
✓ Включил ли ты ВСЕ функции из ВСЕГО диалога (не только из первого сообщения)?
✓ Учел ли все "да" и подтверждения клиента?
✓ Если обсуждалась админ-панель - она есть в смете?
✓ Если обсуждалась статистика - она есть в смете?
✓ Если обсуждалась запись на консультацию - она есть в смете?
✓ Если обсуждались напоминания - они есть в смете?
✓ Если обсуждались интеграции - они есть в смете?
✓ Реалистична ли итоговая стоимость?

Верни ТОЛЬКО валидный JSON!`;

            logger.info('🤖 Отправляем запрос к GPT для генерации сметы');

            const messages = [
                { role: 'system', content: 'Ты эксперт по Telegram-ботам. Создавай детальные сметы на основе ВСЕХ требований из диалога. Отвечай только валидным JSON.' },
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
            
            // Валидируем и исправляем структуру
            const estimate = this.validateAndFixEstimate(parsedEstimate);
            
            logger.info('✅ Смета сгенерирована:', {
                componentsCount: estimate.components?.length || 0,
                totalCost: estimate.totalCost,
                totalHours: estimate.totalHours,
                componentNames: estimate.components?.map(c => c.name) || []
            });
            
            // Проверяем минимальную стоимость в зависимости от сложности
            const hasComplexFeatures = estimate.components?.some(c => 
                c.complexity === 'high' || 
                c.complexity === 'very_high' ||
                c.name?.toLowerCase().includes('интеграц') ||
                c.name?.toLowerCase().includes('админ') ||
                c.name?.toLowerCase().includes('статистик')
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
                    conversationLength: conversation.length,
                    agreedFeaturesCount: agreedFeatures?.agreedFeatures?.length || 0
                }
            };
            
        } catch (error) {
            logger.error('Ошибка генерации сметы через GPT:', error.message);
            throw error;
        }
    }

    // Остальные методы остаются без изменений...
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
            
            // Удаляем trailing commas
            cleanedResponse = cleanedResponse.replace(/,\s*}/g, '}');
            cleanedResponse = cleanedResponse.replace(/,\s*]/g, ']');
            
            // Заменяем одинарные кавычки на двойные
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
                    error: firstError.message
                });
                
                // Пробуем более агрессивные исправления
                jsonString = this.tryFixCommonJSONErrors(jsonString);
                
                try {
                    return JSON.parse(jsonString);
                } catch (secondError) {
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
    
    tryFixCommonJSONErrors(jsonString) {
        try {
            let fixed = jsonString;
            
            // Считаем кавычки и добавляем недостающие
            const quoteCount = (fixed.match(/"/g) || []).length;
            if (quoteCount % 2 !== 0) {
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
    
    extractBasicStructure(jsonString) {
        try {
            logger.warn('Используем извлечение базовой структуры из поврежденного JSON');
            
            const estimate = {
                components: [],
                totalHours: 0,
                totalCost: 0,
                timeline: '2-3 недели',
                detectedFeatures: [],
                recommendations: [],
                businessType: 'Бизнес'
            };
            
            // Пытаемся извлечь totalCost
            const costMatch = jsonString.match(/"totalCost"\s*:\s*(\d+)/);
            if (costMatch) {
                estimate.totalCost = parseInt(costMatch[1]);
                logger.info('Извлечен totalCost:', estimate.totalCost);
            }
            
            // Пытаемся извлечь totalHours
            const hoursMatch = jsonString.match(/"totalHours"\s*:\s*(\d+)/);
            if (hoursMatch) {
                estimate.totalHours = parseInt(hoursMatch[1]);
                logger.info('Извлечен totalHours:', estimate.totalHours);
            }
            
            // Пытаемся извлечь timeline
            const timelineMatch = jsonString.match(/"timeline"\s*:\s*"([^"]+)"/);
            if (timelineMatch) {
                estimate.timeline = timelineMatch[1];
                logger.info('Извлечен timeline:', estimate.timeline);
            }
            
            // Пытаемся извлечь businessType
            const businessMatch = jsonString.match(/"businessType"\s*:\s*"([^"]+)"/);
            if (businessMatch) {
                estimate.businessType = businessMatch[1];
            }
            
            // Пытаемся извлечь компоненты
            const componentsMatch = jsonString.match(/"components"\s*:\s*\[([\s\S]*?)]/);
            if (componentsMatch) {
                try {
                    // Пробуем найти отдельные компоненты
                    const componentRegex = /\{\s*"name"\s*:\s*"([^"]+)"[\s\S]*?"hours"\s*:\s*(\d+)[\s\S]*?"cost"\s*:\s*(\d+)/g;
                    let match;
                    
                    while ((match = componentRegex.exec(componentsMatch[1])) !== null) {
                        estimate.components.push({
                            name: match[1],
                            description: 'Реализация функционала',
                            hours: parseInt(match[2]),
                            cost: parseInt(match[3]),
                            complexity: 'medium',
                            category: 'custom'
                        });
                    }
                    
                    logger.info('Извлечено компонентов:', estimate.components.length);
                } catch (e) {
                    logger.warn('Не удалось извлечь компоненты:', e.message);
                }
            }
            
            // Если компонентов нет или мало данных, создаем базовые
            if (estimate.components.length === 0 || (estimate.totalCost === 0 && estimate.totalHours === 0)) {
                logger.warn('Недостаточно данных, используем значения по умолчанию');
                
                estimate.totalCost = 100000;
                estimate.totalHours = 50;
                estimate.timeline = '2-3 недели';
                estimate.components = [
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
                        description: 'Реализация основных функций согласно требованиям',
                        hours: 30,
                        cost: 60000,
                        complexity: 'medium',
                        category: 'custom'
                    },
                    {
                        name: 'Тестирование и отладка',
                        description: 'Полное тестирование функционала',
                        hours: 10,
                        cost: 20000,
                        complexity: 'low',
                        category: 'basic'
                    }
                ];
                
                estimate.detectedFeatures = ['Базовый функционал бота'];
                estimate.recommendations = ['Начать с базовой версии', 'Добавлять функции поэтапно'];
            } else {
                // Если извлекли компоненты, пересчитываем итоги
                if (estimate.components.length > 0 && estimate.totalCost === 0) {
                    estimate.totalCost = estimate.components.reduce((sum, c) => sum + (c.cost || 0), 0);
                    estimate.totalHours = estimate.components.reduce((sum, c) => sum + (c.hours || 0), 0);
                }
                
                estimate.detectedFeatures = estimate.components.map(c => c.name);
            }
            
            // Финальная проверка минимальных значений
            if (estimate.totalCost < 50000) {
                estimate.totalCost = 80000;
            }
            if (estimate.totalHours < 20) {
                estimate.totalHours = 40;
            }
            
            logger.info('Базовая структура сформирована:', {
                totalCost: estimate.totalCost,
                totalHours: estimate.totalHours,
                componentsCount: estimate.components.length
            });
            
            return estimate;
            
        } catch (error) {
            logger.error('Критическая ошибка извлечения базовой структуры:', error);
            
            // Возвращаем минимальную гарантированную структуру
            return {
                components: [{
                    name: 'Разработка Telegram-бота',
                    description: 'Полный цикл разработки согласно требованиям',
                    hours: 50,
                    cost: 100000,
                    complexity: 'medium',
                    category: 'custom'
                }],
                totalHours: 50,
                totalCost: 100000,
                timeline: '2-3 недели',
                detectedFeatures: ['Разработка бота'],
                recommendations: ['Детали уточним с менеджером'],
                businessType: 'Бизнес'
            };
        }
    }

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
                category: comp.category || 'custom'
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
                        category: 'custom'
                    }
                ];
            }
            
            // Обновляем detectedFeatures если пустой
            if (fixed.detectedFeatures.length === 0) {
                fixed.detectedFeatures = fixed.components.map(c => c.name);
            }
            
            // Проверяем полноту сметы
            if (fixed.components.length < 5) {
                logger.warn(`⚠️ Смета содержит только ${fixed.components.length} компонентов, это подозрительно мало`);
                
                // Добавляем предупреждение в рекомендации
                if (!fixed.recommendations.includes('ВНИМАНИЕ: Смета может быть неполной')) {
                    fixed.recommendations.unshift('ВНИМАНИЕ: Смета может быть неполной, проверьте все требования из диалога');
                }
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

    // Остальные методы без изменений...
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
        } else if (lowerReq.includes('консалтинг') || lowerReq.includes('консультац')) {
            return 'Консалтинг';
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

    // Расчет сметы (публичный метод для совместимости)
    async calculateEstimate(requirements, conversation = []) {
        return this.calculateProjectEstimate(conversation);
    }

    // Быстрая оценка (для совместимости)
    getQuickEstimate(category = 'medium') {
        const prices = this.basePrices[category] || this.basePrices.medium;
        return {
            minCost: prices.min,
            maxCost: prices.max,
            averageCost: Math.round((prices.min + prices.max) / 2),
            timeline: category === 'simple' ? '2-3 недели' : category === 'complex' ? '1.5-2 месяца' : '3-4 недели'
        };
    }
}

module.exports = new EstimateService();