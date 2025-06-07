// src/services/GPTService.js
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const config = require('../config');
const logger = require('../utils/logger');

class GPTService {
    constructor() {
        this.apiKey = config.openai.apiKey;
        this.model = config.openai.model;
        this.endpoint = config.openai.endpoint;
        this.maxTokens = config.openai.maxTokens;
        this.temperature = config.openai.temperature;
        
        // Настройка прокси
        this.proxyAgent = null;
        if (config.proxy.host && config.proxy.port && config.proxy.username && config.proxy.password) {
            this.proxyAgent = new HttpsProxyAgent(
                `${config.proxy.protocol}://${config.proxy.username}:${config.proxy.password}@${config.proxy.host}:${config.proxy.port}`
            );
            logger.info(`🔗 Прокси настроен: ${config.proxy.host}:${config.proxy.port}`);
        } else {
            logger.info('🌐 Прокси отключен, используется прямое соединение');
        }

        if (!this.apiKey) {
            logger.warn('⚠️ OpenAI API ключ не настроен');
        }
    }

    async chat(messages) {
        try {
            if (!this.apiKey) {
                throw new Error('OpenAI API ключ не настроен');
            }

            const response = await axios.post(
                this.endpoint,
                {
                    model: this.model,
                    messages: messages,
                    max_tokens: this.maxTokens,
                    temperature: this.temperature
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000,
                    httpsAgent: this.proxyAgent
                }
            );

            const message = response.data.choices[0]?.message?.content;
            
            if (!message) {
                throw new Error('Нет ответа от OpenAI');
            }

            logger.info('GPT ответ получен', { messageLength: message.length });
            return message;
            
        } catch (error) {
            logger.error('Ошибка GPT:', {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });
            throw error;
        }
    }

    // Проверка доступности OpenAI API
    async testConnection() {
        try {
            const testMessages = [
                { role: 'user', content: 'Привет! Это тест соединения.' }
            ];
            
            const response = await this.chat(testMessages);
            return { success: true, response: response.slice(0, 100) };
            
        } catch (error) {
            return { 
                success: false, 
                error: error.message,
                details: error.response?.data 
            };
        }
    }
}

module.exports = new GPTService();