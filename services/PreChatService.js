const PreChatForm = require('../models/PreChatForm');
const crypto = require('crypto');

class PreChatService {
    constructor() {
        this.initPrompts();
    }

    initPrompts() {
        this.systemPrompts = {
            base: `Ты - эксперт-консультант по созданию Telegram-ботов с многолетним опытом. Твоя задача - помочь клиенту сформулировать точные требования для создания бота.

ПРИНЦИП РАБОТЫ: "ОТ ПРОСТОГО К СЛОЖНОМУ"
1. СНАЧАЛА - выясни базовые функции (меню, команды, простые ответы)
2. ЗАТЕМ - обсуди стандартные интеграции (CRM, платежи, уведомления)  
3. ПОТОМ - предложи продвинутые возможности (AI, аналитика, автоматизация)

КОНТЕКСТ ОБЩЕНИЯ:
- Клиент уже заполнил предварительную анкету
- У тебя есть базовая информация о клиенте и его потребностях
- Твоя цель: пошагово углубиться в детали проекта

СТИЛЬ ОБЩЕНИЯ:
- Дружелюбный, но профессиональный
- Начинай с простых, понятных вопросов
- Постепенно переходи к более сложным темам
- Используй примеры из практики
- НЕ перегружай клиента сложными терминами в начале

ЭТАПЫ КОНСУЛЬТАЦИИ:
ЭТАП 1 (Базовый функционал):
- Что бот должен уметь в первую очередь?
- Какие команды и кнопки нужны?
- Как будет выглядеть главное меню?
- Какие простые ответы на частые вопросы?

ЭТАП 2 (Интеграции):
- Нужны ли уведомления и рассылки?
- Требуется ли связь с CRM/базой данных?
- Какие способы оплаты рассматриваются?
- Нужна ли интеграция с сайтом/приложением?

ЭТАП 3 (Продвинутые функции):
- Интеграция с ИИ (ChatGPT, Claude)
- Аналитика и отчёты
- Сложная автоматизация бизнес-процессов
- Машинное обучение и персонализация`,

            industrySpecific: {
                'e-commerce': `СПЕЦИАЛИЗАЦИЯ: E-COMMERCE

ЭТАП 1 - БАЗОВЫЙ ФУНКЦИОНАЛ:
- Каталог товаров (простой список или с картинками?)
- Корзина (нужна ли возможность добавлять/удалять?)
- Оформление заказа (какие данные собирать?)
- Статусы заказов (нужно ли отслеживание?)

ЭТАП 2 - ИНТЕГРАЦИИ:
- Платежные системы (какие предпочитаете?)
- Складской учёт (есть ли существующая система?)
- Уведомления клиентам (SMS, email?)
- Интеграция с сайтом (нужна ли синхронизация?)

ЭТАП 3 - ПРОДВИНУТЫЕ ФУНКЦИИ:
- ИИ-рекомендации товаров
- Программа лояльности с баллами
- Автоматические скидки и акции
- Аналитика продаж и поведения клиентов`,

                'services': `СПЕЦИАЛИЗАЦИЯ: УСЛУГИ

ЭТАП 1 - БАЗОВЫЙ ФУНКЦИОНАЛ:
- Запись на услуги (выбор времени и специалиста?)
- Календарь (простое расписание или сложное?)
- Подтверждение записи (автоматическое или ручное?)
- Отмена/перенос (какие правила?)

ЭТАП 2 - ИНТЕГРАЦИИ:
- CRM система (какую используете?)
- Напоминания клиентам (за сколько часов?)
- Онлайн оплата (предоплата или полная?)
- Календари сотрудников (Google, Outlook?)

ЭТАП 3 - ПРОДВИНУТЫЕ ФУНКЦИИ:
- ИИ-консультант для предварительных вопросов
- Автоматическое распределение нагрузки
- Система отзывов и рейтингов
- Аналитика загруженности и эффективности`,

                'education': `СПЕЦИАЛИЗАЦИЯ: ОБРАЗОВАНИЕ

ЭТАП 1 - БАЗОВЫЙ ФУНКЦИОНАЛ:
- Информация о курсах (описание, расписание?)
- Запись на курсы (открытая или с модерацией?)
- Материалы (ссылки, файлы, видео?)
- Общение с преподавателями (чат или заявки?)

ЭТАП 2 - ИНТЕГРАЦИИ:
- Платформа обучения (LMS система?)
- Система оплаты (разовая или рассрочка?)
- Уведомления о занятиях (когда отправлять?)
- Сертификаты (автоматическая выдача?)

ЭТАП 3 - ПРОДВИНУТЫЕ ФУНКЦИИ:
- ИИ-ассистент для ответов на вопросы
- Адаптивное обучение по прогрессу
- Геймификация с достижениями
- Аналитика успеваемости и рекомендации`,

                'default': `УНИВЕРСАЛЬНЫЙ ПОДХОД

ЭТАП 1 - БАЗОВЫЙ ФУНКЦИОНАЛ:
- Главные задачи бота (что должен делать в первую очередь?)
- Основные команды (какие кнопки в меню?)
- Целевая аудитория (кто будет пользоваться?)
- Простые автоответы (на какие вопросы отвечать?)

ЭТАП 2 - ИНТЕГРАЦИИ:
- Существующие системы (CRM, сайт, приложения?)
- Способы связи (email, SMS, звонки?)
- Данные клиентов (что собирать и хранить?)
- Уведомления (кому и когда отправлять?)

ЭТАП 3 - ПРОДВИНУТЫЕ ФУНКЦИИ:
- Искусственный интеллект (для каких задач?)
- Автоматизация процессов (что упростить?)
- Аналитика и отчёты (какие показатели важны?)
- Масштабирование (планы на будущее?)`
            }
        };
    }

    generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
    }

    async createSession(formData) {
        try {
            const sessionId = this.generateSessionId();
            
            const session = new PreChatForm({
                sessionId,
                formData,
                status: 'chat_active',
                chatHistory: [{
                    role: 'system',
                    content: 'Форма заполнена',
                    metadata: {
                        messageType: 'form_submission',
                        formData: formData
                    }
                }]
            });

            await session.save();
            return { sessionId, success: true };
        } catch (error) {
            console.error('Ошибка создания сессии:', error);
            throw new Error('Не удалось создать сессию');
        }
    }

    async getSession(sessionId) {
        try {
            return await PreChatForm.findOne({ sessionId });
        } catch (error) {
            console.error('Ошибка получения сессии:', error);
            return null;
        }
    }

    async addMessageToHistory(sessionId, role, content, metadata = {}) {
        try {
            const session = await PreChatForm.findOne({ sessionId });
            if (!session) {
                throw new Error('Сессия не найдена');
            }

            session.chatHistory.push({
                role,
                content,
                metadata: {
                    messageType: metadata.messageType || 'text',
                    ...metadata
                }
            });

            await session.save();
            return true;
        } catch (error) {
            console.error('Ошибка добавления сообщения:', error);
            return false;
        }
    }

    buildContextualPrompt(formData, chatHistory = []) {
        const { name, position, industry, budget, preferredChannels, timeline } = formData;
        
        // Определяем специализацию по отрасли
        let industryKey = 'default';
        const industryLower = industry.toLowerCase();
        
        if (industryLower.includes('магазин') || industryLower.includes('торговля') || industryLower.includes('продажа')) {
            industryKey = 'e-commerce';
        } else if (industryLower.includes('услуг') || industryLower.includes('сервис') || industryLower.includes('салон')) {
            industryKey = 'services';
        } else if (industryLower.includes('образован') || industryLower.includes('курс') || industryLower.includes('школа')) {
            industryKey = 'education';
        }

        // Определяем текущий этап консультации
        const currentStage = this.determineConsultationStage(chatHistory);
        const stageGuidance = this.getStageGuidance(currentStage);

        const systemPrompt = `${this.systemPrompts.base}

${this.systemPrompts.industrySpecific[industryKey]}

ИНФОРМАЦИЯ О КЛИЕНТЕ:
👤 Имя: ${name}
💼 Должность: ${position}  
🏢 Отрасль: ${industry}
💰 Бюджет: ${budget}
📞 Предпочитаемые каналы: ${preferredChannels.join(', ')}
⏰ Сроки: ${timeline}

${stageGuidance}

ТЕКУЩАЯ ЗАДАЧА:
Поприветствуй клиента по имени, покажи что ты изучил анкету, и задай ОДИН-ДВА ключевых вопроса для текущего этапа. Сосредоточься на самом важном, не перегружай деталями. Начинай с базового функционала, постепенно углубляясь в детали.`;

        // Добавляем историю чата если есть
        let conversationContext = [
            { role: 'system', content: systemPrompt }
        ];

        // Добавляем предыдущие сообщения (исключая системные)
        const relevantHistory = chatHistory.filter(msg => 
            msg.metadata.messageType !== 'form_submission' && 
            msg.metadata.messageType !== 'system'
        );

        conversationContext = conversationContext.concat(relevantHistory);

        return conversationContext;
    }

    // Определяем текущий этап консультации
    determineConsultationStage(chatHistory) {
        const messageCount = chatHistory.filter(msg => 
            msg.role === 'user' && msg.metadata.messageType === 'text'
        ).length;

        const allMessages = chatHistory
            .filter(msg => msg.metadata.messageType === 'text')
            .map(msg => msg.content.toLowerCase())
            .join(' ');

        // Ключевые слова для определения этапов
        const basicKeywords = ['меню', 'кнопк', 'команд', 'начал', 'простой', 'основн', 'главн'];
        const integrationKeywords = ['crm', 'плат', 'оплат', 'уведомлен', 'сайт', 'интеграц', 'бд', 'база данных'];
        const advancedKeywords = ['ии', 'ai', 'gpt', 'аналитик', 'автоматизац', 'машинн', 'персонализац'];

        const hasBasicDiscussed = basicKeywords.some(keyword => allMessages.includes(keyword));
        const hasIntegrationDiscussed = integrationKeywords.some(keyword => allMessages.includes(keyword));
        const hasAdvancedDiscussed = advancedKeywords.some(keyword => allMessages.includes(keyword));

        // Логика определения этапа
        if (messageCount <= 2 && !hasBasicDiscussed) {
            return 'basic'; // Начинаем с базового
        } else if (messageCount <= 5 && hasBasicDiscussed && !hasIntegrationDiscussed) {
            return 'integration'; // Переходим к интеграциям
        } else if (hasBasicDiscussed && hasIntegrationDiscussed && !hasAdvancedDiscussed) {
            return 'advanced'; // Переходим к продвинутым функциям
        } else if (messageCount > 8) {
            return 'advanced'; // После 8 сообщений - продвинутый этап
        } else {
            return 'basic'; // По умолчанию базовый
        }
    }

    // Получаем руководство для текущего этапа
    getStageGuidance(stage) {
        const guidance = {
            'basic': `
🎯 ТЕКУЩИЙ ЭТАП: БАЗОВЫЙ ФУНКЦИОНАЛ
Сосредоточься на простых, понятных вопросах:
- Что бот должен уметь в первую очередь?
- Какие основные команды и кнопки нужны?
- Как должно выглядеть главное меню?
- НЕ предлагай сложные интеграции на этом этапе
- Говори простым языком, избегай технических терминов`,

            'integration': `
🔗 ТЕКУЩИЙ ЭТАП: ИНТЕГРАЦИИ И ПОДКЛЮЧЕНИЯ
Базовый функционал обсуждён, теперь переходи к интеграциям:
- Нужны ли уведомления и рассылки?
- Требуется ли связь с CRM или базой данных?
- Какие способы оплаты рассматриваются?
- Нужна ли синхронизация с сайтом/приложением?
- Используй конкретные примеры интеграций`,

            'advanced': `
🚀 ТЕКУЩИЙ ЭТАП: ПРОДВИНУТЫЕ ВОЗМОЖНОСТИ
Базовые функции и интеграции обсуждены, предлагай высокотехнологичные решения:
- Интеграция с ИИ (ChatGPT, Claude, Whisper)
- Системы аналитики и бизнес-отчётов
- Сложная автоматизация бизнес-процессов
- Машинное обучение и персонализация
- Можешь использовать технические термины`
        };

        return guidance[stage] || guidance['basic'];
    }

    async updateLeadScore(sessionId) {
        try {
            const session = await PreChatForm.findOne({ sessionId });
            if (!session) return;

            let score = 0;
            const { budget, timeline, position, industry } = session.formData;

            // Оценка бюджета (0-3 балла)
            const budgetScores = {
                'до 20 000₽': 1,
                '20 000 - 50 000₽': 2,
                '50 000 - 100 000₽': 2.5,
                '100 000 - 200 000₽': 3,
                'свыше 200 000₽': 3
            };
            score += budgetScores[budget] || 1;

            // Оценка срочности (0-2 балла)
            const timelineScores = {
                'срочно (1-3 дня)': 2,
                'быстро (неделя)': 1.5,
                'стандартно (2-3 недели)': 1,
                'не спешим (месяц+)': 0.5
            };
            score += timelineScores[timeline] || 1;

            // Оценка позиции (0-2 балла)
            const positionLower = position.toLowerCase();
            if (positionLower.includes('директор') || positionLower.includes('руководитель') || positionLower.includes('владелец')) {
                score += 2;
            } else if (positionLower.includes('менеджер') || positionLower.includes('управляющий')) {
                score += 1.5;
            } else {
                score += 1;
            }

            // Оценка отрасли (0-1 балл)
            const highValueIndustries = ['финансы', 'медицина', 'образование', 'недвижимость', 'e-commerce'];
            if (highValueIndustries.some(ind => industry.toLowerCase().includes(ind))) {
                score += 1;
            } else {
                score += 0.5;
            }

            // Оценка активности в чате (0-2 балла)
            const messageCount = session.chatHistory.filter(msg => msg.role === 'user').length;
            if (messageCount >= 5) {
                score += 2;
            } else if (messageCount >= 3) {
                score += 1.5;
            } else if (messageCount >= 1) {
                score += 1;
            }

            session.leadScore = Math.min(10, Math.round(score * 10) / 10);
            await session.save();

            return session.leadScore;
        } catch (error) {
            console.error('Ошибка обновления лид-скора:', error);
            return 0;
        }
    }

    validateFormData(formData) {
        const required = ['name', 'contactInfo', 'position', 'industry', 'budget', 'preferredChannels', 'timeline'];
        const missing = required.filter(field => !formData[field]);
        
        if (missing.length > 0) {
            return { valid: false, missing };
        }

        if (!Array.isArray(formData.preferredChannels) || formData.preferredChannels.length === 0) {
            return { valid: false, error: 'Выберите хотя бы один канал связи' };
        }

        const validBudgets = ['до 20 000₽', '20 000 - 50 000₽', '50 000 - 100 000₽', '100 000 - 200 000₽', 'свыше 200 000₽'];
        if (!validBudgets.includes(formData.budget)) {
            return { valid: false, error: 'Некорректный бюджет' };
        }

        const validTimelines = ['срочно (1-3 дня)', 'быстро (неделя)', 'стандартно (2-3 недели)', 'не спешим (месяц+)'];
        if (!validTimelines.includes(formData.timeline)) {
            return { valid: false, error: 'Некорректные сроки' };
        }

        return { valid: true };
    }

    async getAnalytics() {
        try {
            const totalSessions = await PreChatForm.countDocuments();
            const activeChats = await PreChatForm.countDocuments({ status: 'chat_active' });
            const qualifiedLeads = await PreChatForm.countDocuments({ leadScore: { $gte: 6 } });
            
            const avgScore = await PreChatForm.aggregate([
                { $group: { _id: null, avgScore: { $avg: "$leadScore" } } }
            ]);

            const industryStats = await PreChatForm.aggregate([
                { $group: { _id: "$formData.industry", count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);

            return {
                totalSessions,
                activeChats,
                qualifiedLeads,
                avgScore: avgScore[0]?.avgScore || 0,
                industryStats,
                conversionRate: totalSessions > 0 ? (qualifiedLeads / totalSessions * 100).toFixed(1) : 0
            };
        } catch (error) {
            console.error('Ошибка получения аналитики:', error);
            return null;
        }
    }
}

module.exports = PreChatService; 