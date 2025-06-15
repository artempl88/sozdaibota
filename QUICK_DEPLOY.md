# ⚡ Быстрое развертывание sozdaibota

Краткая справка для опытных администраторов.

## 🚀 Быстрый старт

```bash
# 1. Подготовка сервера (Ubuntu/Debian)
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-v2 git nano htop

# 2. Добавление пользователя в группу docker
sudo usermod -aG docker $USER
newgrp docker

# 3. Клонирование и настройка
git clone https://github.com/artempl88/sozdaibota.git
cd sozdaibota
cp env.production.example .env
nano .env  # Заполните переменные окружения

# 4. Создание директорий
mkdir -p logs uploads temp ssl

# 5. Запуск
docker-compose build
docker-compose up -d
```

## 🌐 SSL + Домен (опционально)

```bash
# Получение сертификата Let's Encrypt
sudo apt install -y certbot
sudo certbot certonly --standalone --email your@email.com -d yourdomain.com -d www.yourdomain.com

# Копирование сертификатов
sudo cp /etc/letsencrypt/live/yourdomain.com/*.pem ~/sozdaibota/ssl/
sudo chown $USER:$USER ~/sozdaibota/ssl/*.pem

# Обновление nginx.conf (замените your-domain.com на ваш домен)
sed -i 's/your-domain.com/yourdomain.com/g' nginx.conf

# Запуск с Nginx
docker-compose --profile production up -d
```

## 🔧 Основные команды

```bash
# Статус сервисов
docker-compose ps

# Логи
docker-compose logs -f

# Перезапуск
docker-compose restart

# Обновление
git pull origin main
docker-compose up -d --build

# Бэкап MongoDB
docker-compose exec mongodb mongodump --uri="mongodb://admin:password@localhost:27017/sozdaibota-db" --out /tmp/backup

# Мониторинг ресурсов
docker stats

# Проверка здоровья
curl http://localhost:3001/health
```

## 📊 Быстрая диагностика

```bash
# Все в одной команде
echo "=== STATUS ===" && docker-compose ps && \
echo "=== HEALTH ===" && curl -s http://localhost:3001/health && \
echo "=== RESOURCES ===" && docker stats --no-stream && \
echo "=== DISK ===" && df -h
```

## 🔒 Минимальная безопасность

```bash
# Firewall
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80,443/tcp

# Автообновления
sudo apt install -y unattended-upgrades
echo 'Unattended-Upgrade::Automatic-Reboot "false";' | sudo tee -a /etc/apt/apt.conf.d/50unattended-upgrades
```

## ⚙️ Переменные окружения (.env)

```env
DOMAIN=yourdomain.com
OPENAI_API_KEY=sk-proj-...
TELEGRAM_BOT_TOKEN=1234567890:ABC...
ADMIN_CHAT_ID=123456789
ENCRYPTION_KEY=your_32_char_encryption_key_here
MONGO_ROOT_PASSWORD=secure_password_2024
NODE_ENV=production
PORT=3001
```

## 🆘 Экстренное восстановление

```bash
# Полный перезапуск
docker-compose down
docker system prune -f
docker-compose up -d --build --force-recreate

# Сброс MongoDB (ПОТЕРЯ ДАННЫХ!)
docker-compose down
docker volume rm sozdaibota_mongodb_data
docker-compose up -d
```

---

📚 **Подробное руководство:** [SERVER_DEPLOY_GUIDE.md](SERVER_DEPLOY_GUIDE.md) 