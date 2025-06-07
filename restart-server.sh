#!/bin/bash

echo "🔄 Перезапуск сервера sozdaibota.ru..."
echo "======================================"

# Остановка процессов Node.js
echo "🛑 Остановка текущих процессов..."
pkill -f "node.*start.js" || echo "Процессы не найдены"
pkill -f "npm.*start" || echo "npm процессы не найдены"

# Ждем завершения процессов
sleep 2

# Проверяем что процессы остановлены
if pgrep -f "node.*start.js" > /dev/null; then
    echo "⚠️ Принудительная остановка..."
    pkill -9 -f "node.*start.js"
    sleep 1
fi

echo "✅ Процессы остановлены"

# Установка/обновление зависимостей
echo "📦 Проверка зависимостей..."
npm install --production

# Запуск сервера
echo "🚀 Запуск сервера..."
nohup npm start > server.log 2>&1 &

# Ждем запуска
sleep 3

# Проверяем что сервер запустился
if pgrep -f "node.*start.js" > /dev/null; then
    echo "✅ Сервер успешно перезапущен!"
    echo "📍 URL: https://sozdaibota.ru"
    echo "📋 Логи: tail -f server.log"
else
    echo "❌ Ошибка запуска сервера"
    echo "🔍 Проверьте логи: cat server.log"
    exit 1
fi

echo "======================================"
echo "🎯 Перезапуск завершен!" 