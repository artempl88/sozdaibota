// src/models/PreChatForm.js
const mongoose = require('mongoose');

const PreChatFormSchema = new mongoose.Schema({
    fingerprint: {
        type: String,
        required: true,
        index: true
    },
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    position: {
        type: String,
        required: true
    },
    industry: {
        type: String,
        required: true
    },
    budget: {
        type: String,
        required: true
    },
    timeline: {
        type: String,
        required: true
    },
    preferredChannels: [{
        type: String
    }],
    contacts: {
        type: Map,
        of: String
    },
    chatHistory: [{
        role: {
            type: String,
            enum: ['user', 'assistant'],
            required: true
        },
        content: {
            type: String,
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    }],
    formData: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    leadScore: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'completed'],
        default: 'active'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    // НОВЫЕ ПОЛЯ для отслеживания сметы
    estimateSent: {
        type: Boolean,
        default: false
    },
    estimateSentAt: {
        type: Date
    },
    estimateData: {
        totalCost: Number,
        totalHours: Number,
        features: [String],
        estimateId: String,
        sentToTelegram: Boolean,
        // Полные данные для PDF
        components: [{
            name: String,
            description: String,
            hours: Number,
            cost: Number,
            category: String,
            complexity: String
        }],
        timeline: String,
        businessType: String,
        recommendations: [String],
        componentsCount: Number
    },
    // Поля для утвержденной сметы
    estimateApproved: {
        type: Boolean,
        default: false
    },
    estimateApprovedAt: {
        type: Date
    },
    approvedEstimateId: {
        type: String,
        ref: 'Estimate'
    },
    estimateDeliveredToClient: {
        type: Boolean,
        default: false
    },
    estimateDeliveredAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Индексы для производительности
PreChatFormSchema.index({ fingerprint: 1, isActive: 1 });
PreChatFormSchema.index({ lastActivity: 1 });
PreChatFormSchema.index({ leadScore: -1 });

// Middleware для обновления lastActivity
PreChatFormSchema.pre('save', function(next) {
    this.lastActivity = new Date();
    next();
});

module.exports = mongoose.model('PreChatForm', PreChatFormSchema);