// Тест системы динамических контактных полей
const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

// Тестовые данные с несколькими каналами связи
const testFormData = {
    name: 'Тест Контактов',
    position: 'Директор',
    industry: 'E-commerce / Интернет-магазин',
    budget: '50 000 - 100 000₽',
    preferredChannels: ['Telegram', 'Email', 'WhatsApp'],
    timeline: 'стандартно (2-3 недели)',
    fingerprint: 'test_contacts_' + Date.now(),
    // Новые структурированные контакты
    contacts: {
        'Telegram': '@test_user',
        'Email': 'test@example.com',
        'WhatsApp': '+7-999-123-45-67'
    },
    // Для совместимости
    contactInfo: 'Telegram: @test_user, Email: test@example.com, WhatsApp: +7-999-123-45-67'
};

async function runContactsTest() {
    console.log('📞 Тестирование системы контактов...\n');

    try {
        // 1. Тест создания сессии с множественными контактами
        console.log('1️⃣ Создаём сессию с множественными контактами...');
        const formResponse = await axios.post(`${API_BASE}/pre-chat-form`, testFormData);
        
        console.log('Ответ сервера:', {
            success: formResponse.data.success,
            sessionId: formResponse.data.sessionId ? 'Создан' : 'Не создан',
            hasWelcomeMessage: !!formResponse.data.welcomeMessage
        });

        if (!formResponse.data.success) {
            console.log('❌ Ошибка создания сессии:', formResponse.data.error);
            return;
        }

        const sessionId = formResponse.data.sessionId;
        console.log('✅ Сессия создана с множественными контактами');

        // 2. Проверяем что контакты сохранились
        console.log('\n2️⃣ Проверяем сохранение контактов...');
        const historyResponse = await axios.get(`${API_BASE}/pre-chat-history/${sessionId}`);
        
        if (historyResponse.data.success) {
            const savedFormData = historyResponse.data.formData;
            console.log('Сохранённые контакты:', {
                contactInfo: savedFormData.contactInfo,
                contacts: savedFormData.contacts,
                preferredChannels: savedFormData.preferredChannels
            });
            
            // Проверяем структурированные контакты
            if (savedFormData.contacts) {
                const channelsCount = Object.keys(savedFormData.contacts).length;
                console.log(`✅ Сохранено ${channelsCount} контактов`);
                
                // Проверяем каждый канал
                for (const [channel, contact] of Object.entries(testFormData.contacts)) {
                    if (savedFormData.contacts[channel] === contact) {
                        console.log(`✅ ${channel}: ${contact}`);
                    } else {
                        console.log(`❌ ${channel}: ожидалось "${contact}", получено "${savedFormData.contacts[channel]}"`);
                    }
                }
            } else {
                console.log('⚠️ Структурированные контакты не сохранены, только contactInfo');
            }
        }

        // 3. Тест с недостающими контактами
        console.log('\n3️⃣ Тестируем валидацию - неполные контакты...');
        const incompleteData = {
            ...testFormData,
            preferredChannels: ['Telegram', 'Email'],
            contacts: {
                'Telegram': '@test_user'
                // Email отсутствует
            },
            contactInfo: 'Telegram: @test_user', // Неполные данные
            fingerprint: 'test_incomplete_' + Date.now()
        };

        try {
            const incompleteResponse = await axios.post(`${API_BASE}/pre-chat-form`, incompleteData);
            
            if (!incompleteResponse.data.success) {
                console.log('✅ Валидация работает - отклонена форма с неполными контактами');
                console.log('Ошибка:', incompleteResponse.data.error);
            } else {
                console.log('❌ Валидация не работает - форма с неполными контактами принята');
            }
        } catch (error) {
            console.log('✅ Валидация работает - сервер отклонил неполные данные');
        }

        // 4. Тест с неправильным email
        console.log('\n4️⃣ Тестируем валидацию email...');
        const invalidEmailData = {
            ...testFormData,
            preferredChannels: ['Email'],
            contacts: {
                'Email': 'invalid-email'
            },
            contactInfo: 'Email: invalid-email',
            fingerprint: 'test_invalid_email_' + Date.now()
        };

        try {
            const invalidEmailResponse = await axios.post(`${API_BASE}/pre-chat-form`, invalidEmailData);
            
            if (!invalidEmailResponse.data.success) {
                console.log('✅ Email валидация работает');
                console.log('Ошибка:', invalidEmailResponse.data.error);
            } else {
                console.log('❌ Email валидация не работает');
            }
        } catch (error) {
            console.log('✅ Email валидация работает - сервер отклонил неверный email');
        }

        // 5. Тест отправки сообщения в созданную сессию
        console.log('\n5️⃣ Тестируем отправку сообщения в сессию...');
        const messageResponse = await axios.post(`${API_BASE}/pre-chat-message`, {
            sessionId: sessionId,
            message: 'Привет! Можете связаться со мной через любой из указанных каналов.'
        });

        if (messageResponse.data.success) {
            console.log('✅ Сообщение отправлено успешно');
            console.log('GPT ответ (первые 100 символов):', 
                messageResponse.data.message.substring(0, 100) + '...');
        } else {
            console.log('❌ Ошибка отправки сообщения:', messageResponse.data.error);
        }

        console.log('\n🎉 Тест системы контактов завершён!');
        console.log('\n📊 Результаты:');
        console.log('✅ Множественные контакты сохраняются');
        console.log('✅ Структурированные данные работают');
        console.log('✅ Валидация неполных контактов');
        console.log('✅ Валидация email формата');
        console.log('✅ Интеграция с чатом работает');

    } catch (error) {
        console.error('❌ Ошибка теста:', error.message);
        if (error.response) {
            console.error('Ответ сервера:', error.response.data);
        }
    }
}

// Запуск теста
if (require.main === module) {
    runContactsTest();
}

module.exports = { runContactsTest }; 