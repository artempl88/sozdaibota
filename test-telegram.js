// test-telegram.js - Тест отправки уведомлений в Telegram
require('dotenv').config();
const axios = require('axios');

async function testTelegramNotification() {
    try {
        console.log('🧪 Тестируем отправку уведомления в Telegram...');
        
        const testData = {
            name: "Тестовый пользователь",
            telegram: "@test_user",
            message: "Хочу создать бота для интернет-магазина",
            specification: true
        };
        
        const response = await axios.post('http://localhost:3001/api/lead-notification', testData);
        
        if (response.data.success) {
            console.log('✅ Уведомление успешно отправлено в Telegram!');
        } else {
            console.log('❌ Ошибка:', response.data.error);
        }
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error.message);
        
        if (error.response) {
            console.error('Ответ сервера:', error.response.data);
        }
    }
}

testTelegramNotification(); 