const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

// Тестовые данные анкеты
const testFormData = {
    name: 'Алексей Тестов',
    contactInfo: 'test@example.com',
    position: 'Директор',
    industry: 'E-commerce / Интернет-магазин',
    budget: '50 000 - 100 000₽',
    preferredChannels: ['Telegram', 'Email'],
    timeline: 'стандартно (2-3 недели)'
};

async function testPreChatSystem() {
    console.log('🧪 Тестирование системы быстрой анкеты');
    console.log('=====================================\n');

    try {
        // 1. Тест отправки анкеты
        console.log('1️⃣ Тестирование отправки анкеты...');
        const formResponse = await axios.post(`${BASE_URL}/api/pre-chat-form`, testFormData);
        
        if (formResponse.data.success) {
            console.log('✅ Анкета успешно отправлена');
            console.log('📝 Session ID:', formResponse.data.sessionId);
            console.log('💬 Приветствие:', formResponse.data.welcomeMessage);
            
            const sessionId = formResponse.data.sessionId;
            
            // 2. Тест отправки сообщения
            console.log('\n2️⃣ Тестирование отправки сообщения...');
            const messageResponse = await axios.post(`${BASE_URL}/api/pre-chat-message`, {
                sessionId: sessionId,
                message: 'Мне нужен бот для автоматизации заказов в моем интернет-магазине. Клиенты должны выбирать товары, добавлять в корзину и оплачивать онлайн.'
            });
            
            if (messageResponse.data.success) {
                console.log('✅ Сообщение успешно отправлено');
                console.log('🤖 Ответ GPT:', messageResponse.data.message);
                console.log('📊 Lead Score:', messageResponse.data.leadScore);
            } else {
                console.log('❌ Ошибка отправки сообщения:', messageResponse.data.error);
            }
            
            // 3. Тест получения истории
            console.log('\n3️⃣ Тестирование получения истории чата...');
            const historyResponse = await axios.get(`${BASE_URL}/api/pre-chat-history/${sessionId}`);
            
            if (historyResponse.data.success) {
                console.log('✅ История чата получена');
                console.log('📋 Данные формы:', historyResponse.data.formData);
                console.log('💬 Количество сообщений:', historyResponse.data.chatHistory.length);
                console.log('📊 Lead Score:', historyResponse.data.leadScore);
                console.log('🔄 Статус:', historyResponse.data.status);
            } else {
                console.log('❌ Ошибка получения истории:', historyResponse.data.error);
            }
            
            // 4. Тест аналитики
            console.log('\n4️⃣ Тестирование аналитики...');
            const analyticsResponse = await axios.get(`${BASE_URL}/api/pre-chat-analytics`);
            
            if (analyticsResponse.data.success) {
                console.log('✅ Аналитика получена');
                console.log('📊 Общий статистика:');
                console.log('   - Всего сессий:', analyticsResponse.data.totalSessions);
                console.log('   - Активных чатов:', analyticsResponse.data.activeChats);
                console.log('   - Квалифицированных лидов:', analyticsResponse.data.qualifiedLeads);
                console.log('   - Средний скор:', analyticsResponse.data.avgScore);
                console.log('   - Конверсия:', analyticsResponse.data.conversionRate + '%');
                console.log('   - Статистика по отраслям:', analyticsResponse.data.industryStats);
            } else {
                console.log('❌ Ошибка получения аналитики:', analyticsResponse.data.error);
            }
            
        } else {
            console.log('❌ Ошибка отправки анкеты:', formResponse.data.error);
        }

    } catch (error) {
        console.error('❌ Ошибка тестирования:', error.message);
        if (error.response) {
            console.error('📄 Ответ сервера:', error.response.data);
        }
    }
}

// Тест валидации формы
async function testFormValidation() {
    console.log('\n🔍 Тестирование валидации формы');
    console.log('===================================\n');

    // Тест с пустыми данными
    try {
        console.log('❌ Тест с пустыми данными...');
        const response = await axios.post(`${BASE_URL}/api/pre-chat-form`, {});
        console.log('Ответ:', response.data);
    } catch (error) {
        if (error.response && error.response.status === 400) {
            console.log('✅ Валидация работает:', error.response.data.error);
        } else {
            console.log('❌ Неожиданная ошибка:', error.message);
        }
    }

    // Тест без каналов связи
    try {
        console.log('\n❌ Тест без каналов связи...');
        const incompleteData = { ...testFormData };
        incompleteData.preferredChannels = [];
        
        const response = await axios.post(`${BASE_URL}/api/pre-chat-form`, incompleteData);
        console.log('Ответ:', response.data);
    } catch (error) {
        if (error.response && error.response.status === 400) {
            console.log('✅ Валидация работает:', error.response.data.error);
        } else {
            console.log('❌ Неожиданная ошибка:', error.message);
        }
    }
}

// Запуск тестов
(async () => {
    console.log('🚀 Запуск тестирования системы быстрой анкеты\n');
    
    // Ждем запуска сервера
    console.log('⏳ Ожидание запуска сервера...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await testPreChatSystem();
    await testFormValidation();
    
    console.log('\n✅ Тестирование завершено!');
})(); 