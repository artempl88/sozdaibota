const { MongoMemoryServer } = require('mongodb-memory-server-core');

let mongoServer = null;

async function startMongoDB() {
    try {
        console.log('🔄 Запуск локальной MongoDB...');
        
        mongoServer = await MongoMemoryServer.create({
            instance: {
                port: 27017, // Стандартный порт MongoDB
                dbName: 'sozdaibota-db',
            },
            binary: {
                version: '7.0.0',
            }
        });

        const uri = mongoServer.getUri();
        console.log('✅ MongoDB запущена!');
        console.log('📍 URI:', uri);
        console.log('🎯 База данных: sozdaibota-db');
        console.log('🛑 Для остановки нажмите Ctrl+C');

        // Обработка завершения процесса
        process.on('SIGINT', async () => {
            console.log('\n🔄 Остановка MongoDB...');
            if (mongoServer) {
                await mongoServer.stop();
                console.log('✅ MongoDB остановлена');
            }
            process.exit(0);
        });

        // Возвращаем URI для использования
        return uri;

    } catch (error) {
        console.error('❌ Ошибка запуска MongoDB:', error.message);
        process.exit(1);
    }
}

// Если файл запущен напрямую
if (require.main === module) {
    startMongoDB().then(() => {
        // Держим процесс живым
        setInterval(() => {}, 1000);
    });
}

module.exports = { startMongoDB }; 