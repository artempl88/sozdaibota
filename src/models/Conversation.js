const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    messages: [{
        role: {
            type: String,
            enum: ['user', 'assistant', 'system'],
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
    estimate: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    estimatedAt: {
        type: Date,
        default: null
    },
    estimateStatus: {
        type: String,
        enum: ['pending', 'calculating', 'sent_to_manager', 'approved', 'rejected'],
        default: 'pending'
    },
    mode: {
        type: String,
        enum: ['chat', 'formulation'],
        default: 'chat'
    },
    stage: {
        type: String,
        enum: ['introduction', 'requirements', 'details', 'estimation', 'completed'],
        default: 'introduction'
    },
    metadata: {
        userAgent: String,
        ip: String,
        fingerprint: String,
        lastActivity: {
            type: Date,
            default: Date.now
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Виртуальные поля
ConversationSchema.virtual('messageCount').get(function() {
    return this.messages.length;
});

ConversationSchema.virtual('lastMessage').get(function() {
    return this.messages[this.messages.length - 1];
});

ConversationSchema.virtual('userMessages').get(function() {
    return this.messages.filter(msg => msg.role === 'user');
});

ConversationSchema.virtual('assistantMessages').get(function() {
    return this.messages.filter(msg => msg.role === 'assistant');
});

// Индексы для быстрого поиска
ConversationSchema.index({ sessionId: 1 });
ConversationSchema.index({ 'metadata.lastActivity': 1 });
ConversationSchema.index({ estimateStatus: 1 });
ConversationSchema.index({ mode: 1, stage: 1 });

// Методы экземпляра
ConversationSchema.methods.addMessage = function(role, content, metadata = {}) {
    this.messages.push({
        role,
        content,
        metadata,
        timestamp: new Date()
    });
    this.metadata.lastActivity = new Date();
    return this;
};

ConversationSchema.methods.getRecentMessages = function(limit = 10) {
    return this.messages.slice(-limit);
};

ConversationSchema.methods.getContextForGPT = function(maxMessages = 10) {
    return this.messages
        .slice(-maxMessages)
        .map(msg => ({ role: msg.role, content: msg.content }));
};

ConversationSchema.methods.updateStage = function(newStage) {
    this.stage = newStage;
    this.metadata.lastActivity = new Date();
    return this;
};

ConversationSchema.methods.setEstimate = function(estimate, status = 'sent_to_manager') {
    this.estimate = estimate;
    this.estimatedAt = new Date();
    this.estimateStatus = status;
    return this;
};

// Статические методы
ConversationSchema.statics.findBySessionId = function(sessionId) {
    return this.findOne({ sessionId });
};

ConversationSchema.statics.findActiveConversations = function(hoursAgo = 24) {
    const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    return this.find({ 'metadata.lastActivity': { $gte: cutoff } });
};

ConversationSchema.statics.cleanupOldConversations = function(daysAgo = 30) {
    const cutoff = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    return this.deleteMany({ 'metadata.lastActivity': { $lt: cutoff } });
};

module.exports = mongoose.model('Conversation', ConversationSchema); 