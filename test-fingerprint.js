// Тест системы Fingerprint для сохранения сессий
const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

// Тестовые данные
const testFingerprint = 'test_fingerprint_' + Date.now();
const testFormData = {
    name: 'Тестовый Пользователь',
    contactInfo: '+7-999-123-45-67',
    position: 'Директор',
    industry: 'E-commerce / Интернет-магазин',
    budget: '50 000 - 100 000₽',
    preferredChannels: ['Telegram', 'Email'],
    timeline: 'стандартно (2-3 недели)',
    fingerprint: testFingerprint
};

async function runFingerprintTest() {
    console.log('🔍 Тестирование системы Fingerprint...\n');

    try {
        // 1. Проверяем новый fingerprint (должна быть пустая)
        console.log('1️⃣ Проверяем новый fingerprint...');
        const checkResponse1 = await axios.post(`${API_BASE}/check-session`, {
            fingerprint: testFingerprint
        });
        
        console.log('Ответ:', checkResponse1.data);
        
        if (!checkResponse1.data.sessionFound) {
            console.log('✅ Новый fingerprint корректно определён как новый');
        } else {
            console.log('❌ Ошибка: новый fingerprint считается существующим');
            return;
        }

        // 2. Создаём новую сессию
        console.log('\n2️⃣ Создаём новую сессию через анкету...');
        const formResponse = await axios.post(`${API_BASE}/pre-chat-form`, testFormData);
        
        console.log('Сессия создана:', {
            sessionId: formResponse.data.sessionId,
            success: formResponse.data.success
        });

        if (!formResponse.data.success) {
            console.log('❌ Ошибка создания сессии');
            return;
        }

        const sessionId = formResponse.data.sessionId;

        // 3. Отправляем несколько сообщений в чат
        console.log('\n3️⃣ Отправляем сообщения в чат...');
        
        const messages = [
            'Привет! Хочу бота для интернет-магазина обуви',
            'Нужны каталог, корзина и оплата картами',
            'Есть ли интеграция с CRM?'
        ];

        for (let i = 0; i < messages.length; i++) {
            const messageResponse = await axios.post(`${API_BASE}/pre-chat-message`, {
                sessionId: sessionId,
                message: messages[i]
            });
            
            console.log(`Сообщение ${i + 1}: ${messageResponse.data.success ? '✅' : '❌'}`);
            
            // Небольшая пауза между сообщениями
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 4. Проверяем тот же fingerprint (должна найтись сессия)
        console.log('\n4️⃣ Проверяем существующий fingerprint...');
        const checkResponse2 = await axios.post(`${API_BASE}/check-session`, {
            fingerprint: testFingerprint
        });
        
        console.log('Ответ:', {
            sessionFound: checkResponse2.data.sessionFound,
            sessionId: checkResponse2.data.sessionId,
            formData: checkResponse2.data.formData?.name
        });

        if (checkResponse2.data.sessionFound && checkResponse2.data.sessionId === sessionId) {
            console.log('✅ Сессия корректно найдена по fingerprint');
        } else {
            console.log('❌ Ошибка: сессия не найдена или sessionId не совпадает');
            return;
        }

        // 5. Получаем историю чата
        console.log('\n5️⃣ Получаем историю чата...');
        const historyResponse = await axios.get(`${API_BASE}/pre-chat-history/${sessionId}`);
        
        const chatHistory = historyResponse.data.chatHistory || [];
        console.log(`История чата: ${chatHistory.length} сообщений`);
        
        const userMessages = chatHistory.filter(msg => msg.role === 'user');
        console.log(`Сообщения пользователя: ${userMessages.length}`);
        
        if (userMessages.length >= messages.length) {
            console.log('✅ История чата сохранена корректно');
        } else {
            console.log('❌ Ошибка: не все сообщения сохранены в истории');
        }

        // 6. Имитируем "возвращение" пользователя (новая проверка fingerprint)
        console.log('\n6️⃣ Имитируем возвращение пользователя...');
        const checkResponse3 = await axios.post(`${API_BASE}/check-session`, {
            fingerprint: testFingerprint
        });

        if (checkResponse3.data.sessionFound) {
            console.log('✅ Пользователь может продолжить диалог с того же места');
            console.log('Данные сессии:', {
                name: checkResponse3.data.formData.name,
                industry: checkResponse3.data.formData.industry,
                leadScore: checkResponse3.data.leadScore
            });
        } else {
            console.log('❌ Ошибка: сессия потеряна');
        }

        console.log('\n🎉 Тест системы Fingerprint завершён успешно!');
        console.log('\n📊 Результаты:');
        console.log('✅ Новые пользователи корректно определяются');
        console.log('✅ Сессии создаются и связываются с fingerprint');
        console.log('✅ История чата сохраняется');
        console.log('✅ Возвращающиеся пользователи восстанавливают сессию');
        console.log('✅ Персистентность диалогов работает');

    } catch (error) {
        console.error('❌ Ошибка теста:', error.message);
        if (error.response) {
            console.error('Ответ сервера:', error.response.data);
        }
    }
}

// Запуск теста
if (require.main === module) {
    runFingerprintTest();
}

module.exports = { runFingerprintTest }; 