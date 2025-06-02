const mongoose = require('mongoose');

const preChatFormSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    fingerprint: {
        type: String,
        required: true,
        index: true
    },
    formData: {
        name: {
            type: String,
            required: true,
            trim: true
        },
        contactInfo: {
            type: String,
            required: true,
            trim: true
        },
        position: {
            type: String,
            required: true,
            trim: true
        },
        industry: {
            type: String,
            required: true,
            trim: true
        },
        budget: {
            type: String,
            required: true,
            enum: ['до 20 000₽', '20 000 - 50 000₽', '50 000 - 100 000₽', '100 000 - 200 000₽', 'свыше 200 000₽']
        },
        preferredChannels: {
            type: [String],
            required: true,
            validate: {
                validator: function(v) {
                    return v && v.length > 0;
                },
                message: 'Выберите хотя бы один канал связи'
            }
        },
        timeline: {
            type: String,
            required: true,
            enum: ['срочно (1-3 дня)', 'быстро (неделя)', 'стандартно (2-3 недели)', 'не спешим (месяц+)']
        }
    },
    chatHistory: [{
        timestamp: {
            type: Date,
            default: Date.now
        },
        role: {
            type: String,
            enum: ['user', 'assistant', 'system'],
            required: true
        },
        content: {
            type: String,
            required: true
        },
        metadata: {
            messageType: {
                type: String,
                enum: ['text', 'form_submission', 'system'],
                default: 'text'
            },
            formData: mongoose.Schema.Types.Mixed
        }
    }],
    leadScore: {
        type: Number,
        min: 0,
        max: 10,
        default: 0
    },
    status: {
        type: String,
        enum: ['form_pending', 'chat_active', 'qualified', 'proposal_sent', 'closed'],
        default: 'form_pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    lastActivity: {
        type: Date,
        default: Date.now
    }
});

// Middleware для обновления updatedAt
preChatFormSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    this.lastActivity = new Date();
    next();
});

// Индексы для оптимизации запросов
preChatFormSchema.index({ sessionId: 1 });
preChatFormSchema.index({ createdAt: -1 });
preChatFormSchema.index({ status: 1 });
preChatFormSchema.index({ leadScore: -1 });
preChatFormSchema.index({ fingerprint: 1, status: 1 });
preChatFormSchema.index({ lastActivity: 1 });

module.exports = mongoose.model('PreChatForm', preChatFormSchema); 