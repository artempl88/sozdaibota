const NodeCache = require('node-cache');
const logger = require('../utils/logger');
const { PreChatForm } = require('../models');

class AnalyticsService {
    constructor() {
        // Кэш для быстрой аналитики (TTL 5 минут)
        this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
        this.sessionData = new Map();
    }

    // Добавление события аналитики
    addEvent(event, sessionId = null, additionalData = {}) {
        try {
            const eventData = {
                timestamp: new Date(),
                event,
                sessionId,
                ...additionalData
            };

            logger.info('Analytics event', eventData);

            // Сохраняем в кэш для быстрого доступа
            const key = `event_${Date.now()}_${Math.random()}`;
            this.cache.set(key, eventData);

            // Обновляем данные сессии
            if (sessionId) {
                this.updateSessionData(sessionId, event, additionalData);
            }

        } catch (error) {
            logger.error('Ошибка добавления события аналитики:', error);
        }
    }

    // Обновление данных сессии
    updateSessionData(sessionId, event, data) {
        try {
            if (!this.sessionData.has(sessionId)) {
                this.sessionData.set(sessionId, {
                    sessionId,
                    startTime: new Date(),
                    events: [],
                    lastActivity: new Date()
                });
            }

            const session = this.sessionData.get(sessionId);
            session.events.push({ event, data, timestamp: new Date() });
            session.lastActivity = new Date();

            // Анализируем поведение пользователя
            this.analyzeUserBehavior(session);

        } catch (error) {
            logger.error('Ошибка обновления данных сессии:', error);
        }
    }

    // Анализ поведения пользователя
    analyzeUserBehavior(session) {
        const events = session.events;
        
        // Время сессии
        const sessionDuration = new Date() - session.startTime;
        
        // Активность пользователя
        const messageCount = events.filter(e => e.event === 'message_sent').length;
        
        // Определяем уровень заинтересованности
        let engagementLevel = 'low';
        if (sessionDuration > 300000 && messageCount > 5) { // 5+ минут и 5+ сообщений
            engagementLevel = 'high';
        } else if (sessionDuration > 120000 || messageCount > 2) { // 2+ минуты или 2+ сообщения
            engagementLevel = 'medium';
        }

        session.analytics = {
            sessionDuration,
            messageCount,
            engagementLevel,
            lastAnalyzed: new Date()
        };
    }

    // Получение статистики за период
    async getStats(days = 7) {
        try {
            const cacheKey = `stats_${days}`;
            let stats = this.cache.get(cacheKey);

            if (!stats) {
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - days);

                // Статистика из базы данных
                const sessions = await PreChatForm.find({
                    createdAt: { $gte: startDate }
                });

                stats = {
                    period: `${days} дней`,
                    totalSessions: sessions.length,
                    activeSessions: sessions.filter(s => s.isActive).length,
                    completedChats: sessions.filter(s => s.chatHistory.length > 0).length,
                    
                    // Статистика по отраслям
                    industriesStats: this.groupByField(sessions, 'industry'),
                    
                    // Статистика по бюджетам
                    budgetStats: this.groupByField(sessions, 'budget'),
                    
                    // Конверсия
                    conversionRate: sessions.length > 0 
                        ? (sessions.filter(s => s.chatHistory.length > 3).length / sessions.length * 100).toFixed(1)
                        : 0,
                    
                    // Средняя длина чата
                    avgChatLength: sessions.length > 0
                        ? (sessions.reduce((sum, s) => sum + s.chatHistory.length, 0) / sessions.length).toFixed(1)
                        : 0,

                    // Обновлено
                    updatedAt: new Date()
                };

                // Кэшируем результат
                this.cache.set(cacheKey, stats);
            }

            return stats;

        } catch (error) {
            logger.error('Ошибка получения статистики:', error);
            return this.getFallbackStats();
        }
    }

    // Группировка по полю
    groupByField(items, field) {
        const grouped = {};
        
        items.forEach(item => {
            const value = item[field] || 'Не указано';
            grouped[value] = (grouped[value] || 0) + 1;
        });

        return grouped;
    }

    // Резервная статистика при ошибках
    getFallbackStats() {
        return {
            totalSessions: 0,
            activeSessions: 0,
            completedChats: 0,
            industriesStats: {},
            budgetStats: {},
            conversionRate: '0',
            avgChatLength: '0',
            error: 'Ошибка получения данных',
            updatedAt: new Date()
        };
    }

    // Получение топ-индустрий
    async getTopIndustries(limit = 5) {
        try {
            const cacheKey = `top_industries_${limit}`;
            let topIndustries = this.cache.get(cacheKey);

            if (!topIndustries) {
                const pipeline = [
                    { $group: { _id: '$industry', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: limit }
                ];

                const result = await PreChatForm.aggregate(pipeline);
                
                topIndustries = result.map(item => ({
                    industry: item._id,
                    count: item.count
                }));

                this.cache.set(cacheKey, topIndustries);
            }

            return topIndustries;

        } catch (error) {
            logger.error('Ошибка получения топ-индустрий:', error);
            return [];
        }
    }

    // Очистка старых данных сессий (вызывать периодически)
    cleanupOldSessions() {
        try {
            const now = new Date();
            const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 часа назад

            for (const [sessionId, session] of this.sessionData.entries()) {
                if (session.lastActivity < cutoff) {
                    this.sessionData.delete(sessionId);
                }
            }

            logger.info(`Очищено сессий: ${this.sessionData.size} активных осталось`);

        } catch (error) {
            logger.error('Ошибка очистки старых сессий:', error);
        }
    }

    // Получение данных в реальном времени
    getRealTimeData() {
        return {
            activeSessions: this.sessionData.size,
            recentEvents: Array.from(this.cache.keys())
                .map(key => this.cache.get(key))
                .filter(event => event && event.timestamp > new Date(Date.now() - 5 * 60 * 1000)) // последние 5 минут
                .slice(0, 10),
            timestamp: new Date()
        };
    }
}

module.exports = new AnalyticsService(); 