const AnalyticsService = require('../services/AnalyticsService');
const { PreChatForm } = require('../models');
const logger = require('../utils/logger');

class AnalyticsController {
    // Общая аналитика
    async getAnalytics(req, res) {
        try {
            const { type, period } = req.body;

            AnalyticsService.addEvent('analytics_requested', null, { type, period });

            let analyticsData = {};

            switch (type) {
                case 'page_view':
                    analyticsData = this.handlePageView(req.body);
                    break;
                case 'form_interaction':
                    analyticsData = this.handleFormInteraction(req.body);
                    break;
                case 'chat_activity':
                    analyticsData = this.handleChatActivity(req.body);
                    break;
                default:
                    analyticsData = await this.getGeneralAnalytics(period || 7);
            }

            res.json({
                success: true,
                data: analyticsData,
                timestamp: new Date()
            });

        } catch (error) {
            logger.error('Ошибка получения аналитики:', error);
            res.status(500).json({
                success: false,
                error: 'Не удалось получить данные аналитики'
            });
        }
    }

    // Сводка аналитики
    async getAnalyticsSummary(req, res) {
        try {
            const { days = 7 } = req.query;
            
            const summary = await AnalyticsService.getStats(parseInt(days));
            const topIndustries = await AnalyticsService.getTopIndustries(5);
            const realTimeData = AnalyticsService.getRealTimeData();

            const result = {
                summary,
                topIndustries,
                realTimeData,
                generatedAt: new Date()
            };

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Ошибка получения сводки аналитики:', error);
            res.status(500).json({
                success: false,
                error: 'Не удалось получить сводку'
            });
        }
    }

    // Статистика смет
    async getEstimatesStats(req, res) {
        try {
            const { days = 30 } = req.query;
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - parseInt(days));

            // Получаем сессии с чатами (где есть активность)
            const sessions = await PreChatForm.find({
                createdAt: { $gte: startDate },
                chatHistory: { $exists: true, $not: { $size: 0 } }
            });

            const stats = {
                totalInteractions: sessions.length,
                averageMessageCount: sessions.length > 0 
                    ? (sessions.reduce((sum, s) => sum + s.chatHistory.length, 0) / sessions.length).toFixed(1)
                    : 0,
                
                // Группировка по отраслям
                byIndustry: this.groupSessions(sessions, 'industry'),
                
                // Группировка по бюджетам
                byBudget: this.groupSessions(sessions, 'budget'),
                
                // Группировка по срокам
                byTimeline: this.groupSessions(sessions, 'timeline'),
                
                // Активность по дням
                dailyActivity: this.getDailyActivity(sessions, parseInt(days)),
                
                period: `${days} дней`,
                updatedAt: new Date()
            };

            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            logger.error('Ошибка получения статистики смет:', error);
            res.status(500).json({
                success: false,
                error: 'Не удалось получить статистику'
            });
        }
    }

    // Список всех смет/оценок
    async getEstimatesList(req, res) {
        try {
            const { page = 1, limit = 20, industry, budget } = req.query;
            
            const filter = {};
            if (industry) filter.industry = industry;
            if (budget) filter.budget = budget;

            const skip = (parseInt(page) - 1) * parseInt(limit);
            
            const sessions = await PreChatForm
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .select('sessionId name industry budget timeline createdAt chatHistory.length');

            const total = await PreChatForm.countDocuments(filter);

            const estimates = sessions.map(session => ({
                sessionId: session.sessionId,
                clientName: session.name,
                industry: session.industry,
                budget: session.budget,
                timeline: session.timeline,
                createdAt: session.createdAt,
                messageCount: session.chatHistory ? session.chatHistory.length : 0,
                status: this.getSessionStatus(session)
            }));

            res.json({
                success: true,
                data: {
                    estimates,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        pages: Math.ceil(total / parseInt(limit))
                    }
                }
            });

        } catch (error) {
            logger.error('Ошибка получения списка смет:', error);
            res.status(500).json({
                success: false,
                error: 'Не удалось получить список смет'
            });
        }
    }

    // Аналитика предварительного чата
    async getPreChatAnalytics(req, res) {
        try {
            const { period = 7 } = req.query;
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - parseInt(period));

            const pipeline = [
                { $match: { createdAt: { $gte: startDate } } },
                {
                    $group: {
                        _id: {
                            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                            industry: "$industry"
                        },
                        count: { $sum: 1 },
                        avgChatLength: { $avg: { $size: "$chatHistory" } }
                    }
                },
                { $sort: { "_id.date": 1 } }
            ];

            const dailyStats = await PreChatForm.aggregate(pipeline);
            
            // Преобразуем в удобный формат
            const chartData = this.formatChartData(dailyStats);

            res.json({
                success: true,
                data: {
                    chartData,
                    period: `${period} дней`,
                    updatedAt: new Date()
                }
            });

        } catch (error) {
            logger.error('Ошибка получения аналитики предварительного чата:', error);
            res.status(500).json({
                success: false,
                error: 'Не удалось получить аналитику'
            });
        }
    }

    // Обработка просмотра страницы
    handlePageView(data) {
        const { page, userAgent, referrer, timestamp } = data;
        
        AnalyticsService.addEvent('page_view', null, {
            page,
            userAgent,
            referrer,
            timestamp: timestamp || new Date()
        });

        return {
            type: 'page_view',
            recorded: true
        };
    }

    // Обработка взаимодействия с формой
    handleFormInteraction(data) {
        const { action, field, sessionId } = data;
        
        AnalyticsService.addEvent('form_interaction', sessionId, {
            action, // start, field_change, submit, error
            field
        });

        return {
            type: 'form_interaction',
            recorded: true
        };
    }

    // Обработка активности в чате
    handleChatActivity(data) {
        const { action, sessionId, messageLength } = data;
        
        AnalyticsService.addEvent('chat_activity', sessionId, {
            action, // message_start, message_sent, voice_start, etc.
            messageLength
        });

        return {
            type: 'chat_activity',
            recorded: true
        };
    }

    // Общая аналитика
    async getGeneralAnalytics(days) {
        const stats = await AnalyticsService.getStats(days);
        const realTime = AnalyticsService.getRealTimeData();
        
        return {
            ...stats,
            realTime
        };
    }

    // Группировка сессий
    groupSessions(sessions, field) {
        const grouped = {};
        
        sessions.forEach(session => {
            const value = session[field] || 'Не указано';
            if (!grouped[value]) {
                grouped[value] = {
                    count: 0,
                    totalMessages: 0
                };
            }
            grouped[value].count++;
            grouped[value].totalMessages += session.chatHistory ? session.chatHistory.length : 0;
        });

        // Добавляем средние значения
        Object.keys(grouped).forEach(key => {
            grouped[key].avgMessages = grouped[key].count > 0 
                ? (grouped[key].totalMessages / grouped[key].count).toFixed(1)
                : 0;
        });

        return grouped;
    }

    // Активность по дням
    getDailyActivity(sessions, days) {
        const activity = {};
        
        // Инициализируем дни
        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            activity[dateStr] = 0;
        }

        // Подсчитываем активность
        sessions.forEach(session => {
            const dateStr = session.createdAt.toISOString().split('T')[0];
            if (activity.hasOwnProperty(dateStr)) {
                activity[dateStr]++;
            }
        });

        return activity;
    }

    // Статус сессии
    getSessionStatus(session) {
        if (!session.chatHistory || session.chatHistory.length === 0) {
            return 'no_chat';
        } else if (session.chatHistory.length < 3) {
            return 'short_chat';
        } else if (session.chatHistory.length < 10) {
            return 'medium_chat';
        } else {
            return 'long_chat';
        }
    }

    // Форматирование данных для графиков
    formatChartData(dailyStats) {
        const chartData = {
            dates: [],
            industries: {},
            totals: []
        };

        dailyStats.forEach(stat => {
            const { date, industry } = stat._id;
            
            if (!chartData.dates.includes(date)) {
                chartData.dates.push(date);
            }
            
            if (!chartData.industries[industry]) {
                chartData.industries[industry] = {};
            }
            
            chartData.industries[industry][date] = stat.count;
        });

        // Сортируем даты
        chartData.dates.sort();

        // Подсчитываем общие итоги по дням
        chartData.dates.forEach(date => {
            let total = 0;
            Object.keys(chartData.industries).forEach(industry => {
                total += chartData.industries[industry][date] || 0;
            });
            chartData.totals.push(total);
        });

        return chartData;
    }

    // Отслеживание событий
    async trackEvent(req, res) {
        try {
            const { event, sessionId, data } = req.body;
            
            if (!event) {
                return res.status(400).json({
                    success: false,
                    error: 'Событие обязательно для отслеживания'
                });
            }

            AnalyticsService.addEvent(event, sessionId, data);

            res.json({
                success: true,
                message: 'Событие отслежено'
            });

        } catch (error) {
            logger.error('Ошибка отслеживания события:', error);
            res.status(500).json({
                success: false,
                error: 'Не удалось отследить событие'
            });
        }
    }

    // Получение статистики
    async getStatistics(req, res) {
        try {
            const { days = 7 } = req.query;
            
            const stats = await AnalyticsService.getStats(parseInt(days));
            
            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            logger.error('Ошибка получения статистики:', error);
            res.status(500).json({
                success: false,
                error: 'Не удалось получить статистику'
            });
        }
    }

    // Получение деталей сметы
    async getEstimateDetails(req, res) {
        try {
            const { estimateId } = req.params;
            
            const Estimate = require('../models').Estimate;
            if (!Estimate) {
                return res.status(500).json({
                    success: false,
                    error: 'База данных недоступна'
                });
            }

            const estimate = await Estimate.findById(estimateId);
            
            if (!estimate) {
                return res.status(404).json({
                    success: false,
                    error: 'Смета не найдена'
                });
            }

            res.json({
                success: true,
                data: estimate
            });

        } catch (error) {
            logger.error('Ошибка получения деталей сметы:', error);
            res.status(500).json({
                success: false,
                error: 'Не удалось получить детали сметы'
            });
        }
    }

    // Логирование события (алиас для trackEvent)
    async logEvent(req, res) {
        return this.trackEvent(req, res);
    }

    // Аналитика форм (алиас для getPreChatAnalytics) 
    async getFormAnalytics(req, res) {
        return this.getPreChatAnalytics(req, res);
    }

    // Статистика смет (алиас)
    async getEstimateStats(req, res) {
        return this.getEstimatesStats(req, res);
    }
}

module.exports = new AnalyticsController(); 