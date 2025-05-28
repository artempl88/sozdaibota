# Инструкция по развертыванию GPT Assistant v2.0

## Требования

- Node.js 16+
- MongoDB 4.4+
- Nginx
- SSL сертификат
- Telegram Bot Token (опционально)

## 1. Установка зависимостей

```bash
npm install
```

## 2. Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
# OpenAI API
OPENAI_API_KEY=your_openai_api_key_here

# Безопасность
ENCRYPTION_KEY=your_32_character_encryption_key_here

# MongoDB
MONGODB_URI=mongodb://localhost:27017/sozdaibota

# Telegram Bot (опционально)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
ADMIN_CHAT_ID=your_admin_chat_id_here

# Сервер
PORT=3001
NODE_ENV=production

# CORS
ALLOWED_ORIGINS=https://sozdaibota.ru,https://www.sozdaibota.ru
```

## 3. Настройка MongoDB

### Установка MongoDB (Ubuntu/Debian):

```bash
# Импорт ключа
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -

# Добавление репозитория
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# Установка
sudo apt-get update
sudo apt-get install -y mongodb-org

# Запуск
sudo systemctl start mongod
sudo systemctl enable mongod
```

### Создание базы данных:

```bash
mongosh
use sozdaibota
db.createCollection("conversations")
db.createCollection("analytics")
```

## 4. Настройка Telegram бота (опционально)

1. Создайте бота через @BotFather в Telegram
2. Получите токен бота
3. Добавьте токен в `.env`
4. Узнайте свой Chat ID (отправьте сообщение боту и проверьте через API)

## 5. Настройка Nginx

Скопируйте конфигурацию из `nginx.conf` в `/etc/nginx/sites-available/sozdaibota`:

```bash
sudo cp nginx.conf /etc/nginx/sites-available/sozdaibota
sudo ln -s /etc/nginx/sites-available/sozdaibota /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 6. SSL сертификат

### Использование Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d sozdaibota.ru -d www.sozdaibota.ru
```

## 7. Запуск приложения

### Разработка:
```bash
npm run dev
```

### Продакшн:
```bash
npm start
```

### Использование PM2 (рекомендуется):

```bash
# Установка PM2
npm install -g pm2

# Запуск
pm2 start server.js --name "sozdaibota-api"

# Автозапуск
pm2 startup
pm2 save
```

## 8. Проверка работоспособности

1. Проверьте health endpoint: `https://sozdaibota.ru/api/health`
2. Проверьте аналитику: `https://sozdaibota.ru/api/analytics/summary`
3. Протестируйте GPT assistant: `POST https://sozdaibota.ru/api/gpt-assistant`

## 9. Мониторинг

### Логи PM2:
```bash
pm2 logs sozdaibota-api
```

### Статус сервисов:
```bash
pm2 status
sudo systemctl status mongod
sudo systemctl status nginx
```

## 10. Резервное копирование

### MongoDB:
```bash
mongodump --db sozdaibota --out /backup/mongodb/$(date +%Y%m%d)
```

### Автоматическое резервное копирование (crontab):
```bash
# Добавьте в crontab (crontab -e):
0 2 * * * mongodump --db sozdaibota --out /backup/mongodb/$(date +\%Y\%m\%d)
```

## 11. Обновление

```bash
# Остановка сервиса
pm2 stop sozdaibota-api

# Обновление кода
git pull origin main
npm install

# Запуск
pm2 start sozdaibota-api
```

## 12. Безопасность

1. **Firewall**: Откройте только порты 80, 443, 22
2. **MongoDB**: Настройте аутентификацию
3. **Nginx**: Используйте rate limiting
4. **SSL**: Настройте HSTS заголовки
5. **Обновления**: Регулярно обновляйте систему

## Новые функции v2.0

### ✅ Реализовано:

1. **Безопасность с Helmet** - защита от XSS, CSRF и других атак
2. **MongoDB интеграция** - сохранение диалогов и аналитики
3. **Telegram webhook** - уведомления о новых лидах
4. **Кэширование** - ускорение ответов с помощью NodeCache
5. **Улучшенные промпты** - более умные вопросы и A/B тестирование
6. **Аналитика** - отслеживание конверсий и метрик
7. **Шифрование данных** - защита чувствительной информации

### 📊 Эндпоинты аналитики:

- `POST /api/analytics` - сохранение событий
- `GET /api/analytics/summary` - сводка по конверсиям
- `POST /api/lead-notification` - отправка в Telegram

### 🔧 Настройки производительности:

- Кэширование ответов GPT (10 минут)
- Gzip сжатие статических файлов
- HTTP/2 поддержка
- Оптимизированные заголовки безопасности

## Поддержка

При возникновении проблем проверьте:

1. Логи приложения: `pm2 logs`
2. Статус MongoDB: `sudo systemctl status mongod`
3. Конфигурацию Nginx: `sudo nginx -t`
4. Переменные окружения в `.env` 