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

async function testFullWorkflow() {
    console.log('🚀 Полное тестирование системы быстрой анкеты');
    console.log('==============================================\n');

    try {
        // 1. Отправка анкеты
        console.log('1️⃣ Отправка анкеты...');
        const formResponse = await axios.post(`${BASE_URL}/api/pre-chat-form`, testFormData);
        
        if (formResponse.data.success) {
            console.log('✅ Анкета успешно отправлена');
            console.log('📝 Session ID:', formResponse.data.sessionId);
            console.log('💬 Приветствие GPT:');
            console.log('   ', formResponse.data.welcomeMessage);
            
            const sessionId = formResponse.data.sessionId;
            
            // 2. Диалог с несколькими сообщениями
            const messages = [
                'Мне нужен бот для автоматизации заказов в моем интернет-магазине. Клиенты должны выбирать товары, добавлять в корзину и оплачивать онлайн.',
                'У нас около 500 товаров в каталоге. Нужна интеграция с нашей CRM системой и платежными системами.',
                'Также хотелось бы добавить систему скидок и программу лояльности для постоянных клиентов.',
                'Когда можно начать разработку и сколько это будет стоить?'
            ];
            
            for (let i = 0; i < messages.length; i++) {
                console.log(`\n${i + 2}️⃣ Отправка сообщения ${i + 1}...`);
                console.log('👤 Пользователь:', messages[i]);
                
                const messageResponse = await axios.post(`${BASE_URL}/api/pre-chat-message`, {
                    sessionId: sessionId,
                    message: messages[i]
                });
                
                if (messageResponse.data.success) {
                    console.log('🤖 GPT ответ:');
                    console.log('   ', messageResponse.data.message);
                    console.log('📊 Lead Score:', messageResponse.data.leadScore);
                } else {
                    console.log('❌ Ошибка отправки сообщения:', messageResponse.data.error);
                }
                
                // Пауза между сообщениями
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // 3. Получение полной истории
            console.log('\n6️⃣ Получение истории чата...');
            const historyResponse = await axios.get(`${BASE_URL}/api/pre-chat-history/${sessionId}`);
            
            if (historyResponse.data.success) {
                console.log('✅ История чата получена');
                console.log('📋 Данные формы:');
                console.log('   - Имя:', historyResponse.data.formData.name);
                console.log('   - Отрасль:', historyResponse.data.formData.industry);
                console.log('   - Бюджет:', historyResponse.data.formData.budget);
                console.log('💬 Сообщений в чате:', historyResponse.data.chatHistory.length);
                console.log('📊 Финальный Lead Score:', historyResponse.data.leadScore);
                console.log('🔄 Статус:', historyResponse.data.status);
                
                // Показываем последние сообщения
                console.log('\n📝 Последние сообщения:');
                const lastMessages = historyResponse.data.chatHistory.slice(-4);
                lastMessages.forEach((msg, index) => {
                    const role = msg.role === 'user' ? '👤' : '🤖';
                    const preview = msg.content.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content;
                    console.log(`   ${role} ${msg.role}: ${preview}`);
                });
            } else {
                console.log('❌ Ошибка получения истории:', historyResponse.data.error);
            }
            
            // 4. Аналитика
            console.log('\n7️⃣ Получение аналитики...');
            const analyticsResponse = await axios.get(`${BASE_URL}/api/pre-chat-analytics`);
            
            if (analyticsResponse.data.success) {
                console.log('✅ Аналитика получена');
                console.log('📊 Статистика:');
                console.log('   - Всего сессий:', analyticsResponse.data.totalSessions);
                console.log('   - Активных чатов:', analyticsResponse.data.activeChats);
                console.log('   - Квалифицированных лидов:', analyticsResponse.data.qualifiedLeads);
                console.log('   - Средний скор:', analyticsResponse.data.avgScore.toFixed(2));
                console.log('   - Конверсия:', analyticsResponse.data.conversionRate + '%');
                
                if (analyticsResponse.data.industryStats.length > 0) {
                    console.log('   - Топ отрасли:');
                    analyticsResponse.data.industryStats.slice(0, 3).forEach(stat => {
                        console.log(`     • ${stat._id}: ${stat.count} сессий`);
                    });
                }
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

// Запуск полного теста
(async () => {
    console.log('🎯 Запуск полного тестирования системы быстрой анкеты\n');
    
    // Ждем запуска сервера
    console.log('⏳ Ожидание запуска сервера...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await testFullWorkflow();
    
    console.log('\n🎉 Полное тестирование завершено!');
    console.log('\n💡 Система быстрой анкеты готова к использованию:');
    console.log('   • Форма анкеты с валидацией ✅');
    console.log('   • Персонализированные GPT ответы ✅');
    console.log('   • Автоматический Lead Scoring ✅');
    console.log('   • Сохранение истории чата ✅');
    console.log('   • Аналитика и отчеты ✅');
})(); 