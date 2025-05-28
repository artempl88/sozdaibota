// get-chat-id.js - Скрипт для получения Chat ID в Telegram
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN не найден в .env файле');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Бот запущен! Отправьте любое сообщение боту в Telegram...');
console.log('📱 Найдите вашего бота по имени или перейдите по ссылке:');
console.log(`🔗 https://t.me/${token.split(':')[0]}`);

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name;
    
    console.log('\n✅ Получено сообщение!');
    console.log(`👤 От: ${username}`);
    console.log(`🆔 Chat ID: ${chatId}`);
    console.log(`📝 Сообщение: ${msg.text}`);
    console.log('\n📋 Скопируйте этот Chat ID в .env файл:');
    console.log(`ADMIN_CHAT_ID=${chatId}`);
    
    // Отправляем подтверждение
    bot.sendMessage(chatId, `✅ Отлично! Ваш Chat ID: ${chatId}\n\nТеперь вы будете получать уведомления о новых лидах!`);
    
    // Останавливаем бота после получения первого сообщения
    setTimeout(() => {
        console.log('\n🛑 Бот остановлен. Chat ID получен!');
        process.exit(0);
    }, 2000);
});

bot.on('polling_error', (error) => {
    console.error('❌ Ошибка Telegram бота:', error.message);
}); 