#!/usr/bin/env node

// start.js - Универсальный запуск сервера
console.log('🚀 Запуск сервера sozdaibota.ru...\n');

// Проверяем наличие файлов конфигурации
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const environmentPath = path.join(__dirname, 'environment.env');
const envExists = fs.existsSync(envPath);
const environmentExists = fs.existsSync(environmentPath);

if (!envExists && !environmentExists) {
    console.log('⚠️ .env и environment.env файлы не найдены');
    
    // Проверяем наличие config.production.js
    const productionConfigPath = path.join(__dirname, 'config.production.js');
    const productionConfigExists = fs.existsSync(productionConfigPath);
    
    if (productionConfigExists) {
        console.log('✅ config.production.js найден, устанавливаю NODE_ENV=production');
        process.env.NODE_ENV = 'production';
    } else {
        console.log('❌ Конфигурационные файлы не найдены!');
        console.log('📝 Создайте .env, environment.env или config.production.js');
        process.exit(1);
    }
} else {
    if (envExists) {
        console.log('✅ .env файл найден');
    } else if (environmentExists) {
        console.log('✅ environment.env файл найден');
    }
}

console.log(`🔧 Режим: ${process.env.NODE_ENV || 'development'}`);
console.log('🔄 Загрузка сервера...\n');

try {
    // Запускаем сервер
    require('./src/server.js');
    
    console.log('\n🎯 Сервер успешно запущен!');
    console.log('📍 URL: http://localhost:' + (process.env.PORT || 3001));
    console.log('🛑 Для остановки нажмите Ctrl+C\n');
    
} catch (error) {
    console.error('\n❌ Ошибка запуска сервера:');
    console.error(error.message);
    
    if (error.code === 'MODULE_NOT_FOUND') {
        console.log('\n💡 Возможные решения:');
        console.log('1. Выполните: npm install');
        console.log('2. Проверьте структуру файлов');
        console.log('3. Убедитесь что файл src/server.js существует');
    }
    
    console.error('\n🔍 Полная ошибка:');
    console.error(error.stack);
    process.exit(1);
}

// Обработка завершения
process.on('SIGINT', () => {
    console.log('\n🛑 Получен сигнал остановки');
    console.log('⏳ Завершение работы сервера...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Получен сигнал завершения');
    console.log('⏳ Завершение работы сервера...');
    process.exit(0);
}); 