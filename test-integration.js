// test-integration.js
require('dotenv').config();

console.log('🔍 Проверка интеграции автоматического расчета смет...\n');

// Проверка переменных окружения
const checks = [
    { name: 'TELEGRAM_BOT_TOKEN', value: process.env.TELEGRAM_BOT_TOKEN, required: false },
    { name: 'ADMIN_CHAT_ID', value: process.env.ADMIN_CHAT_ID, required: false },
    { name: 'MONGODB_URI', value: process.env.MONGODB_URI, required: false },
    { name: 'OPENAI_API_KEY', value: process.env.OPENAI_API_KEY, required: true },
    { name: 'PORT', value: process.env.PORT || '3001', required: false }
];

checks.forEach(check => {
    if (check.value) {
        console.log(`✅ ${check.name} - настроен`);
    } else {
        if (check.required) {
            console.log(`❌ ${check.name} - НЕ настроен! (ОБЯЗАТЕЛЬНО)`);
        } else {
            console.log(`⚠️ ${check.name} - НЕ настроен (опционально для полной функциональности)`);
        }
    }
});

console.log('\n🔧 Проверка установленных модулей...\n');

// Проверка модулей
const modules = [
    'mongoose',
    'node-telegram-bot-api',
    'express',
    'cors',
    'helmet',
    'express-rate-limit',
    'axios',
    'crypto',
    'https-proxy-agent',
    'node-cache',
    'multer'
];

modules.forEach(moduleName => {
    try {
        require(moduleName);
        console.log(`✅ ${moduleName} - установлен`);
    } catch {
        console.log(`❌ ${moduleName} - НЕ установлен! Выполните: npm install ${moduleName}`);
    }
});

console.log('\n💡 Рекомендации по настройке:\n');

if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('📱 Для получения смет в Telegram:');
    console.log('   1. Создайте бота через @BotFather');
    console.log('   2. Добавьте токен в .env: TELEGRAM_BOT_TOKEN=ваш_токен');
    console.log('   3. Добавьте ID чата админа: ADMIN_CHAT_ID=ваш_chat_id\n');
}

if (!process.env.MONGODB_URI) {
    console.log('🗄️ Для сохранения смет в базу данных:');
    console.log('   1. Создайте аккаунт на MongoDB Atlas');
    console.log('   2. Добавьте URI в .env: MONGODB_URI=mongodb+srv://...\n');
}

console.log('🚀 Для запуска сервера: npm start');
console.log('🧪 Для тестирования: откройте http://localhost:3001');

console.log('\n✨ Функции автоматического расчета будут работать даже без Telegram и MongoDB!');
console.log('🎯 Главное - настроенный OPENAI_API_KEY для работы с ИИ'); 