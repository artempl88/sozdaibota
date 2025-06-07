#!/bin/bash

echo "🔄 Перезапуск через PM2..."
echo "=========================="

# Проверяем есть ли PM2
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 не установлен"
    echo "💡 Установите: npm install -g pm2"
    exit 1
fi

# Показываем текущие процессы
echo "📋 Текущие процессы:"
pm2 list

echo ""
echo "🔄 Перезапуск приложения..."

# Перезапуск или запуск приложения
if pm2 list | grep -q "sozdaibota"; then
    echo "🔄 Перезапуск существующего процесса..."
    pm2 restart sozdaibota
else
    echo "🚀 Первый запуск через PM2..."
    pm2 start start.js --name sozdaibota
fi

# Сохраняем конфигурацию PM2
pm2 save

echo ""
echo "📊 Статус после перезапуска:"
pm2 status

echo ""
echo "📋 Полезные команды PM2:"
echo "  pm2 logs sozdaibota    # Просмотр логов"
echo "  pm2 status             # Статус процессов"
echo "  pm2 restart sozdaibota # Перезапуск"
echo "  pm2 stop sozdaibota    # Остановка"
echo "  pm2 delete sozdaibota  # Удаление"

echo ""
echo "✅ Готово! Сервер перезапущен через PM2" 