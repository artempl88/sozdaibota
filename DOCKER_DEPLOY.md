# 🐳 Развертывание sozdaibota через Docker Compose

Полная инструкция по развертыванию проекта sozdaibota на сервере с использованием Docker Compose.

## 📋 Требования

- **Docker** 20.10+
- **Docker Compose** 2.0+
- **Минимум 2GB RAM**
- **Минимум 5GB свободного места**

## 🚀 Быстрое развертывание

### 1. Клонирование репозитория

```bash
git clone https://github.com/artempl88/sozdaibota.git
cd sozdaibota
```

### 2. Настройка переменных окружения

```bash
# Скопируйте пример файла
cp env.production.example .env

# Отредактируйте .env файл своими данными
nano .env
```

### 3. Запуск для разработки

```bash
# Запуск в режиме разработки (используется docker-compose.override.yml)
docker-compose up -d

# Просмотр логов
docker-compose logs -f
```

### 4. Запуск для production

```bash
# Создание и запуск для production
docker-compose -f docker-compose.yml up -d

# Или с Nginx (рекомендуется)
docker-compose --profile production up -d
```

## ⚙️ Конфигурация

### Обязательные переменные в .env

```env
# Домен (для production)
DOMAIN=your-domain.com

# OpenAI API ключ
OPENAI_API_KEY=sk-...

# Telegram Bot Token
TELEGRAM_BOT_TOKEN=1234567890:ABC...

# Admin Chat ID
ADMIN_CHAT_ID=123456789

# Ключ шифрования (32+ символов)
ENCRYPTION_KEY=your_secure_encryption_key_here
```

## 📝 Режимы запуска

### Разработка (Development)

```bash
# Автоматически использует docker-compose.override.yml
docker-compose up -d

# Особенности:
# - Hot reload кода
# - Упрощенная аутентификация MongoDB
# - Отключен Nginx
# - Порт 3001 доступен напрямую
```

### Production

```bash
# Только основные сервисы
docker-compose -f docker-compose.yml up -d

# С Nginx (рекомендуется)
docker-compose --profile production up -d
```

## 🔧 Управление сервисами

### Основные команды

```bash
# Запуск
docker-compose up -d

# Остановка
docker-compose down

# Перезапуск
docker-compose restart

# Просмотр логов
docker-compose logs -f app
docker-compose logs -f mongodb

# Обновление образов
docker-compose pull
docker-compose up -d --build
```

### Масштабирование

```bash
# Запуск нескольких экземпляров приложения
docker-compose up -d --scale app=3
```

## 🗄️ База данных

### Подключение к MongoDB

```bash
# Подключение к контейнеру MongoDB
docker-compose exec mongodb mongosh

# Использование базы данных
use sozdaibota-db

# Просмотр коллекций
show collections

# Поиск сессий
db.sessions.find().pretty()
```

### Backup и восстановление

```bash
# Создание backup
docker-compose exec mongodb mongodump --uri="mongodb://admin:secure_password_2024@localhost:27017/sozdaibota-db" --out /tmp/backup

# Копирование backup с контейнера
docker cp sozdaibota-mongodb:/tmp/backup ./mongodb-backup

# Восстановление
docker-compose exec mongodb mongorestore --uri="mongodb://admin:secure_password_2024@localhost:27017/sozdaibota-db" /tmp/backup/sozdaibota-db
```

## 🌐 Настройка Nginx (Production)

### 1. SSL сертификаты

```bash
# Создайте директорию для SSL
mkdir -p ssl

# Поместите ваши сертификаты:
# ssl/fullchain.pem
# ssl/privkey.pem
```

### 2. Обновите nginx.conf

Замените `your-domain.com` на ваш домен в файле `nginx.conf`.

### 3. Запуск с Nginx

```bash
docker-compose --profile production up -d
```

## 📊 Мониторинг

### Health checks

```bash
# Проверка состояния сервисов
docker-compose ps

# Проверка health check приложения
curl http://localhost:3001/health

# Статистика контейнеров
docker stats
```

### Логи

```bash
# Все логи
docker-compose logs -f

# Логи приложения
docker-compose logs -f app

# Логи MongoDB
docker-compose logs -f mongodb

# Последние 100 строк
docker-compose logs --tail=100 app
```

## 🔒 Безопасность

### Рекомендации

1. **Смените пароли MongoDB** в production
2. **Используйте сильный ключ шифрования**
3. **Настройте firewall** для портов 80/443
4. **Регулярно обновляйте** Docker образы
5. **Используйте HTTPS** (SSL сертификаты)

### Обновление паролей

```bash
# Остановите сервисы
docker-compose down

# Обновите переменные в .env
nano .env

# Удалите volume MongoDB (данные будут потеряны!)
docker volume rm sozdaibota_mongodb_data

# Запустите заново
docker-compose up -d
```

## 🚨 Устранение неполадок

### Проблемы с подключением к MongoDB

```bash
# Проверьте статус MongoDB
docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')"

# Проверьте логи MongoDB
docker-compose logs mongodb
```

### Проблемы с приложением

```bash
# Перезапуск приложения
docker-compose restart app

# Проверка переменных окружения
docker-compose exec app printenv

# Проверка подключения к MongoDB из приложения
docker-compose exec app node -e "console.log(process.env.MONGODB_URI)"
```

### Очистка системы

```bash
# Остановка всех сервисов
docker-compose down

# Удаление всех данных (ОСТОРОЖНО!)
docker-compose down -v

# Очистка Docker системы
docker system prune -a
```

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи: `docker-compose logs -f`
2. Убедитесь в правильности .env файла
3. Проверьте доступность портов 3001, 27017
4. Проверьте доступ к интернету для Docker образов

## 🔄 Обновления

```bash
# Получение обновлений
git pull origin main

# Перестройка образов
docker-compose build --no-cache

# Перезапуск с новыми образами
docker-compose up -d
``` 