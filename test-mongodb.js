// test-mongodb.js - Тестирование подключения к MongoDB
const mongoose = require('mongoose');
const config = require('./src/config');

console.log('🔍 Тестирование подключения к MongoDB...\n');

async function testMongoDB() {
    console.log('📋 Конфигурация MongoDB:');
    console.log(`URI: ${config.mongodb.uri ? 'Настроен' : 'Отсутствует'}`);
    
    if (config.mongodb.uri) {
        // Маскируем пароль для безопасности
        const maskedUri = config.mongodb.uri.replace(/:([^:@]+)@/, ':***@');
        console.log(`Masked URI: ${maskedUri}`);
    }
    
    console.log('\n🔗 Попытка подключения...');
    
    try {
        // Устанавливаем таймаут для подключения
        const options = {
            serverSelectionTimeoutMS: 10000, // 10 секунд
            connectTimeoutMS: 10000,
            socketTimeoutMS: 10000,
            maxPoolSize: 5,
            retryWrites: true,
            w: 'majority'
        };
        
        console.log('⏳ Подключение с таймаутом 10 сек...');
        
        await mongoose.connect(config.mongodb.uri, options);
        
        console.log('✅ Подключение к MongoDB успешно!');
        console.log(`📊 Состояние: ${mongoose.connection.readyState}`);
        console.log(`🏷️  База данных: ${mongoose.connection.name}`);
        console.log(`🌐 Хост: ${mongoose.connection.host}`);
        console.log(`🔌 Порт: ${mongoose.connection.port}`);
        
        // Проверяем возможность записи
        console.log('\n📝 Тестирование записи...');
        
        const TestSchema = new mongoose.Schema({
            message: String,
            timestamp: { type: Date, default: Date.now }
        });
        
        const TestModel = mongoose.model('Test', TestSchema);
        
        const testDoc = new TestModel({
            message: 'Тест подключения MongoDB'
        });
        
        await testDoc.save();
        console.log('✅ Тест записи прошел успешно!');
        
        // Удаляем тестовый документ
        await TestModel.deleteOne({ _id: testDoc._id });
        console.log('🗑️ Тестовый документ удален');
        
        console.log('\n🎯 MongoDB готова к работе!');
        
    } catch (error) {
        console.error('❌ Ошибка подключения к MongoDB:');
        console.error(`   Код ошибки: ${error.code}`);
        console.error(`   Сообщение: ${error.message}`);
        
        if (error.code === 'ENOTFOUND') {
            console.error('\n💡 Возможные причины:');
            console.error('   1. Неверный хост в URI');
            console.error('   2. Нет доступа к интернету');
            console.error('   3. DNS не может разрешить адрес');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('\n💡 Возможные причины:');
            console.error('   1. MongoDB сервер не запущен');
            console.error('   2. Неверный порт');
            console.error('   3. Брандмауэр блокирует подключение');
        } else if (error.message.includes('Authentication failed')) {
            console.error('\n💡 Возможные причины:');
            console.error('   1. Неверные логин/пароль');
            console.error('   2. Пользователь не имеет прав');
            console.error('   3. База данных не найдена');
        } else if (error.message.includes('timeout')) {
            console.error('\n💡 Возможные причины:');
            console.error('   1. Медленное интернет соединение');
            console.error('   2. Сервер MongoDB перегружен');
            console.error('   3. Сетевые ограничения');
        }
        
        console.error('\n🔧 Предлагаемые решения:');
        console.error('   1. Проверьте URI в environment.env');
        console.error('   2. Убедитесь что интернет работает');
        console.error('   3. Проверьте статус MongoDB Atlas');
        console.error('   4. Попробуйте подключиться через MongoDB Compass');
    }
    
    // Закрываем подключение
    try {
        await mongoose.connection.close();
        console.log('\n🔌 Подключение закрыто');
    } catch (closeError) {
        console.error('Ошибка при закрытии подключения:', closeError.message);
    }
}

// Запускаем тест
testMongoDB().catch(console.error); 