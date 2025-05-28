// test-gpt-proxy.js - Тест GPT API через прокси
require('dotenv').config();
const axios = require('axios');

async function testGPTWithProxy() {
    try {
        console.log('🧪 Тестируем GPT API через прокси...');
        
        const testData = {
            message: "Привет! Хочу создать бота для интернет-магазина",
            conversation: [],
            sessionId: "test-session-" + Date.now()
        };
        
        console.log('📤 Отправляем запрос к GPT...');
        const response = await axios.post('http://localhost:3001/api/gpt-assistant', testData);
        
        if (response.data.success) {
            console.log('✅ GPT API работает!');
            console.log('🤖 Ответ:', response.data.message);
            console.log('⚡ Быстрые ответы:', response.data.quickReplies);
            
            if (response.data.usage) {
                console.log('📊 Использование токенов:', response.data.usage);
            }
        } else {
            console.log('❌ Ошибка:', response.data.error);
        }
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании GPT:', error.message);
        
        if (error.response) {
            console.error('Ответ сервера:', error.response.data);
        }
    }
}

async function testHealthEndpoint() {
    try {
        console.log('\n🏥 Проверяем health endpoint...');
        const response = await axios.get('http://localhost:3001/api/health');
        
        console.log('✅ Health check успешен!');
        console.log('📋 Статус системы:');
        console.log('  - Сервис:', response.data.service);
        console.log('  - MongoDB:', response.data.features.mongodb ? '✅' : '❌');
        console.log('  - Telegram:', response.data.features.telegram ? '✅' : '❌');
        console.log('  - Прокси:', response.data.features.proxy);
        console.log('  - Шифрование:', response.data.features.encryption ? '✅' : '❌');
        console.log('  - Кэш:', JSON.stringify(response.data.features.cache));
        
    } catch (error) {
        console.error('❌ Ошибка health check:', error.message);
    }
}

async function runTests() {
    await testHealthEndpoint();
    await testGPTWithProxy();
}

runTests(); 