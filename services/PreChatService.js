const PreChatForm = require('../models/PreChatForm');
const crypto = require('crypto');

class PreChatService {
    constructor() {
        this.initPrompts();
    }

    initPrompts() {
        this.systemPrompts = {
            base: `Ты - эксперт-консультант по созданию Telegram-ботов с многолетним опытом. Твоя задача - помочь клиенту сформулировать точные требования для создания бота.

КОНТЕКСТ ОБЩЕНИЯ:
- Клиент уже заполнил предварительную анкету
- У тебя есть базовая информация о клиенте и его потребностях
- Твоя цель: углубиться в детали и выявить все нюансы проекта

СТИЛЬ ОБЩЕНИЯ:
- Дружелюбный, но профессиональный
- Задавай конкретные уточняющие вопросы
- Предлагай варианты решений на основе опыта
- Используй примеры из практики

ЗАДАЧИ:
1. Детализировать функционал бота
2. Выявить интеграции с внешними системами
3. Определить объем проекта и сложность
4. Подготовить данные для точной оценки стоимости`,

            industrySpecific: {
                'e-commerce': `СПЕЦИАЛИЗАЦИЯ: E-COMMERCE
Фокусируйся на:
- Каталоге товаров и структуре
- Корзине и процессе заказа
- Платежных системах
- Складском учете
- Программе лояльности`,

                'services': `СПЕЦИАЛИЗАЦИЯ: УСЛУГИ
Фокусируйся на:
- Системе записи и календаре
- Управлении специалистами
- Напоминаниях клиентам
- Интеграции с CRM
- Отчетности по услугам`,

                'education': `СПЕЦИАЛИЗАЦИЯ: ОБРАЗОВАНИЕ
Фокусируйся на:
- Курсах и программах
- Системе записи на занятия
- Материалах и домашних заданиях
- Прогрессе учащихся
- Сертификации`,

                'default': `УНИВЕРСАЛЬНЫЙ ПОДХОД
Изучи потребности и предложи оптимальное решение`
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

        const systemPrompt = `${this.systemPrompts.base}

${this.systemPrompts.industrySpecific[industryKey]}

ИНФОРМАЦИЯ О КЛИЕНТЕ:
👤 Имя: ${name}
💼 Должность: ${position}  
🏢 Отрасль: ${industry}
💰 Бюджет: ${budget}
📞 Предпочитаемые каналы: ${preferredChannels.join(', ')}
⏰ Сроки: ${timeline}

ТЕКУЩАЯ ЗАДАЧА:
Поприветствуй клиента по имени, покажи что ты изучил анкету, и задай первый целевой вопрос для детализации проекта. Будь конкретным и полезным.`;

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