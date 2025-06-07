// src/models/index.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const config = require('../config');

// Импорт отдельных моделей
const PreChatForm = require('./PreChatForm');
const Conversation = require('./Conversation');

// Инициализация подключения к MongoDB
let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;

    try {
        if (config.mongodb.uri) {
            await mongoose.connect(config.mongodb.uri);
            isConnected = true;
            logger.info('📦 Подключение к MongoDB успешно');
        } else {
            logger.warn('MongoDB URI не настроен');
        }
    } catch (error) {
        logger.error('Ошибка подключения к MongoDB:', error);
    }
};

// Автоматическое подключение при загрузке модуля
connectDB();

// === СХЕМЫ ===

// Схема для предварительной формы
const PreChatFormSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    position: { type: String, required: true },
    industry: { type: String, required: true },
    budget: { type: String, required: true },
    timeline: { type: String, required: true },
    preferredChannels: [{ type: String }],
    contacts: {
        type: Map,
        of: String
    },
    completedAt: { type: Date, default: Date.now },
    metadata: {
        ip: String,
        userAgent: String,
        source: String
    }
}, {
    timestamps: true
});

// Схема для аналитики
const AnalyticsSchema = new mongoose.Schema({
    event: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed },
    sessionId: String,
    ip: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Схема для разговоров с ИИ
const ConversationSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    messages: [{
        role: { type: String, enum: ['user', 'assistant', 'system'] },
        content: String,
        timestamp: { type: Date, default: Date.now },
        metadata: {
            ip: String,
            userAgent: String,
            processingTime: Number
        }
    }],
    mode: { type: String, enum: ['chat', 'formulation'], default: 'chat' },
    status: { type: String, enum: ['active', 'completed', 'archived'], default: 'active' },
    
    // Данные о смете
    estimate: {
        projectName: String,
        components: [{
            name: String,
            hours: Number,
            description: String,
            cost: Number
        }],
        totalHours: Number,
        totalCost: Number,
        complexity: String,
        timeline: String,
        detectedFeatures: [String],
        costBreakdown: [{
            name: String,
            hours: Number,
            cost: Number
        }],
        risks: [String],
        recommendations: [String]
    },
    estimatedAt: Date,
    estimateStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    
    // Техническое задание
    specification: String,
    specificationCreatedAt: Date,
    
    // Метаданные
    metadata: {
        totalMessages: { type: Number, default: 0 },
        totalProcessingTime: { type: Number, default: 0 },
        averageResponseTime: { type: Number, default: 0 },
        ip: String,
        userAgent: String
    }
}, {
    timestamps: true
});

// Схема для смет (отдельная коллекция)
const EstimateSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
    
    // Основные данные сметы
    projectName: { type: String, required: true },
    components: [{
        name: { type: String, required: true },
        hours: { type: Number, required: true },
        description: String,
        cost: { type: Number, required: true }
    }],
    totalHours: { type: Number, required: true },
    totalCost: { type: Number, required: true },
    hourlyRate: { type: Number, default: 2000 },
    
    // Дополнительная информация
    complexity: { type: String, enum: ['простой', 'средний', 'сложный', 'очень сложный'] },
    timeline: String,
    detectedFeatures: [String],
    costBreakdown: [{
        name: String,
        hours: Number,
        cost: Number
    }],
    risks: [String],
    recommendations: [String],
    
    // Статус и управление
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'sent'], default: 'pending' },
    approvedAt: Date,
    sentAt: Date,
    
    // Редактирование
    editComment: String,
    editedAt: Date,
    originalEstimate: {
        totalCost: Number,
        totalHours: Number
    },
    
    // Менеджер и обработка
    processedBy: String,
    telegramMessageId: String,
    
    // Метаданные
    metadata: {
        source: { type: String, default: 'gpt_calculation' },
        calculationMethod: { type: String, enum: ['gpt4', 'fallback'], default: 'gpt4' },
        processingTime: Number,
        gptModel: String
    }
}, {
    timestamps: true
});

// Схема для голосовых сообщений
const VoiceMessageSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    fileName: { type: String, required: true },
    originalName: String,
    filePath: String,
    fileSize: Number,
    duration: Number,
    
    // Обработка и транскрипция
    transcription: String,
    transcriptionConfidence: Number,
    processingStatus: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    processingError: String,
    
    // Ответ ИИ
    aiResponse: String,
    quickReplies: [String],
    
    // Метаданные
    metadata: {
        ip: String,
        userAgent: String,
        audioFormat: String,
        bitrate: String,
        channels: Number
    }
}, {
    timestamps: true
});

// === ИНДЕКСЫ ===

// Индексы для производительности
PreChatFormSchema.index({ sessionId: 1 });
PreChatFormSchema.index({ completedAt: -1 });

AnalyticsSchema.index({ event: 1, timestamp: -1 });
AnalyticsSchema.index({ sessionId: 1 });

ConversationSchema.index({ sessionId: 1 });
ConversationSchema.index({ status: 1, createdAt: -1 });
ConversationSchema.index({ estimateStatus: 1 });

EstimateSchema.index({ sessionId: 1 });
EstimateSchema.index({ status: 1, createdAt: -1 });
EstimateSchema.index({ totalCost: 1 });

VoiceMessageSchema.index({ sessionId: 1 });
VoiceMessageSchema.index({ processingStatus: 1 });

// === MIDDLEWARE ===

// Middleware для подсчета сообщений в разговоре
ConversationSchema.pre('save', function(next) {
    if (this.messages) {
        this.metadata.totalMessages = this.messages.length;
        
        // Подсчет среднего времени ответа
        const processingTimes = this.messages
            .map(m => m.metadata?.processingTime)
            .filter(t => t && t > 0);
            
        if (processingTimes.length > 0) {
            this.metadata.averageResponseTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
        }
    }
    next();
});

// Middleware для сохранения оригинальной сметы при редактировании
EstimateSchema.pre('save', function(next) {
    if (this.isModified('totalCost') || this.isModified('totalHours')) {
        if (!this.originalEstimate) {
            this.originalEstimate = {
                totalCost: this.totalCost,
                totalHours: this.totalHours
            };
        }
    }
    next();
});

// === МОДЕЛИ ===

let Analytics, Estimate, VoiceMessage;

if (config.mongodb.uri) {
    try {
        Analytics = mongoose.model('Analytics', AnalyticsSchema);
        Estimate = mongoose.model('Estimate', EstimateSchema);
        VoiceMessage = mongoose.model('VoiceMessage', VoiceMessageSchema);
        
        logger.info('📋 Модели MongoDB инициализированы');
    } catch (error) {
        logger.error('Ошибка создания моделей MongoDB:', error);
    }
} else {
    logger.warn('⚠️ MongoDB модели не созданы - отсутствует URI');
}

// === ЭКСПОРТ ===

module.exports = {
    // Модели
    PreChatForm,
    Analytics,
    Conversation,
    Estimate,
    VoiceMessage,
    
    // Функции
    connectDB,
    
    // Состояние
    isConnected: () => isConnected,
    
    // Отключение
    disconnect: async () => {
        if (isConnected) {
            await mongoose.disconnect();
            isConnected = false;
            logger.info('Отключение от MongoDB');
        }
    },
    
    // Проверка подключения к базе данных
    checkConnection: () => {
        return mongoose.connection.readyState === 1;
    },
    
    // Получение статуса подключения
    getConnectionStatus: () => {
        const states = {
            0: 'disconnected',
            1: 'connected', 
            2: 'connecting',
            3: 'disconnecting'
        };
        return states[mongoose.connection.readyState] || 'unknown';
    }
};