// src/services/PreChatService.js
const mongoose = require('mongoose');
const { PreChatForm } = require('../models');
const logger = require('../utils/logger');

class PreChatService {
    constructor() {
        this.sessionCache = new Map();
        
        // Базовый системный промпт
        this.baseSystemPrompt = `Ты - эксперт-консультант по созданию Telegram-ботов со стажем 5+ лет. Твоя задача - помочь клиенту создать техническое задание и получить точную смету.

ТВОЙ ПОДХОД:
1. Быстро понять бизнес клиента (1-2 вопроса)
2. Выяснить основные задачи бота (2-3 вопроса)  
3. Предложить конкретные функции под его нишу
4. Собрать детальные требования для точной сметы

ПРИНЦИПЫ РАБОТЫ:
- Задавай конкретные вопросы - никаких общих фраз
- Предлагай готовые решения из опыта
- Объясняй простым языком без техножаргона
- Веди к созданию детального ТЗ

СТРУКТУРА ДИАЛОГА:
1. Знакомство с бизнесом (1-2 сообщения)
2. Основные задачи бота (2-3 сообщения)
3. Дополнительные функции (2-3 сообщения)
4. Технические детали (1-2 сообщения)
5. Предложение расчета (после 8+ сообщений)

ВАЖНО: 
- НЕ называй цены или стоимость
- НЕ обещай сроки
- Когда соберешь достаточно информации, предложи: "Готов рассчитать точную смету. Менеджер свяжется в течение 30 минут"`;
    }

    // Валидация данных формы
    validateFormData(formData) {
        const required = ['name', 'position', 'industry', 'budget', 'timeline'];
        const missing = [];
        
        for (const field of required) {
            if (!formData[field] || formData[field].trim() === '') {
                missing.push(field);
            }
        }
        
        if (missing.length > 0) {
            return {
                valid: false,
                missing: missing,
                error: `Заполните обязательные поля: ${missing.join(', ')}`
            };
        }
        
        return { valid: true };
    }

    // Создание сессии
    async createSession(formData) {
        try {
            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const session = new PreChatForm({
                sessionId,
                fingerprint: formData.fingerprint || 'unknown',
                name: formData.name,
                position: formData.position,
                industry: formData.industry,
                budget: formData.budget,
                timeline: formData.timeline,
                preferredChannels: formData.preferredChannels || [],
                contacts: formData.contacts || {},
                chatHistory: [],
                formData: formData,
                leadScore: 0,
                status: 'active',
                isActive: true,
                lastActivity: new Date()
            });
            
            await session.save();
            
            // Кешируем для быстрого доступа
            this.sessionCache.set(sessionId, session);
            
            logger.info('Сессия создана', { sessionId, industry: formData.industry });
            
            return {
                success: true,
                sessionId: sessionId,
                session: session
            };
            
        } catch (error) {
            logger.error('Ошибка создания сессии:', error);
            return {
                success: false,
                error: 'Не удалось создать сессию'
            };
        }
    }

    // Получение сессии
    async getSession(sessionId) {
        try {
            // Проверяем кеш
            if (this.sessionCache.has(sessionId)) {
                const cachedSession = this.sessionCache.get(sessionId);
                logger.info('Сессия получена из кеша', { sessionId });
                return cachedSession;
            }
            
            // Получаем из БД
            const session = await PreChatForm.findOne({ sessionId });
            
            if (session) {
                // Обновляем кеш
                this.sessionCache.set(sessionId, session);
                logger.info('Сессия получена из БД и закеширована', { 
                    sessionId,
                    historyLength: session.chatHistory.length
                });
            } else {
                logger.warn('Сессия не найдена в БД', { sessionId });
            }
            
            return session;
            
        } catch (error) {
            logger.error('Ошибка получения сессии:', error);
            return null;
        }
    }

    // Добавление сообщения в историю
    async addMessageToHistory(sessionId, role, content, metadata = {}) {
        try {
            const session = await this.getSession(sessionId);
            
            if (!session) {
                logger.error('Сессия не найдена:', sessionId);
                return false;
            }
            
            const message = {
                role: role,
                content: content,
                timestamp: new Date(),
                metadata: metadata
            };
            
            logger.info('Добавление сообщения в историю', {
                sessionId,
                role,
                contentLength: content.length,
                messageType: metadata.messageType || 'unknown'
            });
            
            session.chatHistory.push(message);
            session.lastActivity = new Date();
            
            await session.save();
            
            // Обновляем кеш
            this.sessionCache.set(sessionId, session);
            
            logger.info('Сообщение успешно сохранено', {
                sessionId,
                historyLength: session.chatHistory.length
            });
            
            return true;
            
        } catch (error) {
            logger.error('Ошибка добавления сообщения:', error);
            return false;
        }
    }

    // Построение контекстного промпта
    buildContextualPrompt(formData) {
        return `${this.baseSystemPrompt}

ИНФОРМАЦИЯ О КЛИЕНТЕ:
👤 Имя: ${formData.name}
💼 Должность: ${formData.position}  
🏢 Отрасль: ${formData.industry}
💰 Бюджет: ${formData.budget}
⏰ Сроки: ${formData.timeline}

АДАПТАЦИЯ ПОД КЛИЕНТА:
- Учти специфику отрасли "${formData.industry}"
- Предлагай решения в рамках бюджета "${formData.budget}"
- Ориентируйся на сроки "${formData.timeline}"

Начни с персонального приветствия и сразу переходи к сути.`;
    }

    // Обновление лид-скора
    async updateLeadScore(sessionId) {
        try {
            const session = await this.getSession(sessionId);
            if (!session) return 0;
            
            let score = 0;
            
            // Критерии оценки
            if (session.chatHistory.length > 5) score += 20;
            if (session.chatHistory.length > 10) score += 30;
            
            // Анализ сообщений
            const userMessages = session.chatHistory.filter(m => m.role === 'user');
            const avgMessageLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;
            
            if (avgMessageLength > 50) score += 20;
            if (avgMessageLength > 100) score += 30;
            
            // Бюджет
            if (session.formData.budget.includes('100')) score += 30;
            if (session.formData.budget.includes('Не ограничен')) score += 50;
            
            session.leadScore = Math.min(score, 100);
            await session.save();
            
            return session.leadScore;
            
        } catch (error) {
            logger.error('Ошибка обновления лид-скора:', error);
            return 0;
        }
    }

    // Поиск сессии по fingerprint
    async findSessionByFingerprint(fingerprint) {
        try {
            const session = await PreChatForm.findOne({ 
                fingerprint: fingerprint,
                isActive: true,
                lastActivity: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Последние 24 часа
            }).sort({ lastActivity: -1 });
            
            return session;
            
        } catch (error) {
            logger.error('Ошибка поиска по fingerprint:', error);
            return null;
        }
    }

    // Обновление времени активности
    async updateLastActivity(sessionId) {
        try {
            const session = await this.getSession(sessionId);
            if (session) {
                session.lastActivity = new Date();
                await session.save();
            }
        } catch (error) {
            logger.error('Ошибка обновления активности:', error);
        }
    }

    // Получение аналитики
    async getAnalytics() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const totalSessions = await PreChatForm.countDocuments();
            const todaySessions = await PreChatForm.countDocuments({
                createdAt: { $gte: today }
            });
            
            const activeChats = await PreChatForm.countDocuments({
                isActive: true,
                lastActivity: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // Последние 30 минут
            });
            
            const qualifiedLeads = await PreChatForm.countDocuments({
                leadScore: { $gte: 70 }
            });
            
            // Статистика по отраслям
            const industryStats = await PreChatForm.aggregate([
                { $group: { _id: '$industry', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]);
            
            return {
                totalSessions,
                todaySessions,
                activeChats,
                qualifiedLeads,
                avgScore: totalSessions > 0 ? 
                    await PreChatForm.aggregate([
                        { $group: { _id: null, avg: { $avg: '$leadScore' } } }
                    ]).then(r => r[0]?.avg || 0) : 0,
                industryStats,
                conversionRate: totalSessions > 0 ? 
                    (qualifiedLeads / totalSessions * 100).toFixed(1) : 0
            };
            
        } catch (error) {
            logger.error('Ошибка получения аналитики:', error);
            return null;
        }
    }

    // Очистка кеша
    clearCache() {
        this.sessionCache.clear();
        logger.info('Кеш PreChatService очищен');
    }
}

module.exports = new PreChatService();