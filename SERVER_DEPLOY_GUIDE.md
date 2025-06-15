# 🚀 Полное руководство по развертыванию sozdaibota на сервере

Детальная инструкция по развертыванию проекта sozdaibota на VPS/dedicated сервере с использованием Docker Compose.

## 📋 Подготовка сервера

### 1. Требования к серверу

**Минимальные требования:**
- **CPU:** 2 ядра
- **RAM:** 4GB
- **Диск:** 20GB SSD
- **ОС:** Ubuntu 20.04+ / CentOS 8+ / Debian 11+
- **Сеть:** статический IP адрес

**Рекомендуемые характеристики:**
- **CPU:** 4 ядра
- **RAM:** 8GB
- **Диск:** 50GB SSD
- **Backup:** автоматическое резервное копирование

### 2. Первоначальная настройка сервера

#### 2.1 Подключение к серверу

```bash
# Подключение по SSH (замените на ваш IP)
ssh root@YOUR_SERVER_IP

# Или если используется ключ
ssh -i /path/to/your/key.pem root@YOUR_SERVER_IP
```

#### 2.2 Обновление системы

```bash
# Ubuntu/Debian
apt update && apt upgrade -y

# CentOS/RHEL
yum update -y
```

#### 2.3 Создание пользователя для развертывания

```bash
# Создание пользователя deploy
adduser deploy

# Добавление в группу sudo
usermod -aG sudo deploy

# Настройка SSH для пользователя deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/ 2>/dev/null || true
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys 2>/dev/null || true

# Переключение на пользователя deploy
su - deploy
```

#### 2.4 Настройка firewall

```bash
# Ubuntu (ufw)
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3001/tcp  # Временно для тестирования
sudo ufw status

# CentOS (firewalld)
sudo systemctl start firewalld
sudo systemctl enable firewalld
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

## 🐳 Установка Docker и Docker Compose

### 3.1 Установка Docker

#### Ubuntu/Debian:

```bash
# Удаление старых версий
sudo apt remove docker docker-engine docker.io containerd runc

# Установка зависимостей
sudo apt update
sudo apt install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Добавление GPG ключа Docker
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Добавление репозитория
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Установка Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER

# Автозапуск Docker
sudo systemctl enable docker
sudo systemctl start docker
```

#### CentOS/RHEL:

```bash
# Удаление старых версий
sudo yum remove docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine

# Установка yum-utils
sudo yum install -y yum-utils

# Добавление репозитория
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# Установка Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER

# Автозапуск Docker
sudo systemctl enable docker
sudo systemctl start docker
```

### 3.2 Установка Docker Compose (если не установлен)

```bash
# Скачивание Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Установка прав
sudo chmod +x /usr/local/bin/docker-compose

# Создание символической ссылки
sudo ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

# Проверка установки
docker-compose --version
```

### 3.3 Проверка установки

```bash
# Перелогиньтесь для применения изменений группы
exit
ssh deploy@YOUR_SERVER_IP

# Проверка Docker
docker --version
docker run hello-world

# Проверка Docker Compose
docker-compose --version
```

## 📁 Развертывание приложения

### 4.1 Клонирование репозитория

```bash
# Переход в домашнюю директорию
cd ~

# Клонирование репозитория
git clone https://github.com/artempl88/sozdaibota.git

# Переход в директорию проекта
cd sozdaibota

# Проверка содержимого
ls -la
```

### 4.2 Настройка переменных окружения

```bash
# Копирование примера конфигурации
cp env.production.example .env

# Редактирование конфигурации
nano .env
```

**Заполните .env файл:**

```env
# Ваш домен (замените на реальный)
DOMAIN=yourdomain.com

# OpenAI API ключ (получить на https://platform.openai.com/)
OPENAI_API_KEY=sk-proj-your_actual_openai_key_here

# Telegram Bot Token (получить у @BotFather)
TELEGRAM_BOT_TOKEN=1234567890:your_actual_telegram_bot_token_here

# Admin Chat ID (ваш Telegram ID, получить у @userinfobot)
ADMIN_CHAT_ID=123456789

# Ключ шифрования (сгенерируйте случайную строку 32+ символов)
ENCRYPTION_KEY=your_secure_32_character_encryption_key_2024_random

# MongoDB настройки (измените пароли!)
MONGO_ROOT_PASSWORD=very_secure_mongodb_root_password_2024
MONGO_APP_PASSWORD=very_secure_mongodb_app_password_2024

# Дополнительные настройки
NODE_ENV=production
PORT=3001

# Настройки безопасности
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100

# Настройки логирования
LOG_LEVEL=info
LOG_MAX_FILES=10
LOG_MAX_SIZE=10m
```

### 4.3 Обновление конфигурации MongoDB

```bash
# Редактирование docker-compose.yml для использования переменных из .env
nano docker-compose.yml
```

**Обновите секцию MongoDB:**

```yaml
  mongodb:
    image: mongo:7.0
    container_name: sozdaibota-mongodb
    restart: unless-stopped
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD}
      - MONGO_INITDB_DATABASE=sozdaibota-db
    volumes:
      - mongodb_data:/data/db
      - ./mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro
    networks:
      - sozdaibota-network
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 30s
      timeout: 10s
      retries: 5
```

**Обновите секцию приложения:**

```yaml
  app:
    build: .
    container_name: sozdaibota-app
    restart: unless-stopped
    depends_on:
      mongodb:
        condition: service_healthy
    environment:
      - NODE_ENV=production
      - PORT=3001
      - MONGODB_URI=mongodb://admin:${MONGO_ROOT_PASSWORD}@mongodb:27017/sozdaibota-db?authSource=admin
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - ADMIN_CHAT_ID=${ADMIN_CHAT_ID}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - ALLOWED_ORIGINS=http://localhost:3001,https://${DOMAIN},https://www.${DOMAIN}
```

### 4.4 Создание необходимых директорий

```bash
# Создание директорий для логов, загрузок и SSL
mkdir -p logs uploads temp ssl

# Установка прав
chmod 755 logs uploads temp
chmod 700 ssl
```

## 🌐 Настройка домена и SSL

### 5.1 Настройка DNS

В панели управления вашего DNS провайдера:

1. **A-запись:** `yourdomain.com` → `YOUR_SERVER_IP`
2. **A-запись:** `www.yourdomain.com` → `YOUR_SERVER_IP`

**Проверка DNS:**

```bash
# Проверка разрешения домена
dig yourdomain.com
nslookup yourdomain.com

# Ожидание распространения DNS (может занять до 24 часов)
```

### 5.2 Получение SSL сертификата (Let's Encrypt)

#### Установка Certbot:

```bash
# Ubuntu/Debian
sudo apt install -y certbot

# CentOS/RHEL
sudo yum install -y certbot
```

#### Получение сертификата:

```bash
# Остановка nginx если запущен
sudo systemctl stop nginx 2>/dev/null || true

# Получение сертификата (замените yourdomain.com на ваш домен)
sudo certbot certonly --standalone \
  --agree-tos \
  --email your-email@example.com \
  --domains yourdomain.com,www.yourdomain.com

# Копирование сертификатов в проект
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ~/sozdaibota/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ~/sozdaibota/ssl/

# Установка прав
sudo chown deploy:deploy ~/sozdaibota/ssl/*.pem
chmod 600 ~/sozdaibota/ssl/*.pem
```

#### Автоматическое обновление сертификата:

```bash
# Создание скрипта обновления
sudo tee /usr/local/bin/renew-ssl.sh > /dev/null <<'EOF'
#!/bin/bash
cd /home/deploy/sozdaibota
docker-compose down nginx
certbot renew --standalone
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./ssl/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./ssl/
chown deploy:deploy ./ssl/*.pem
chmod 600 ./ssl/*.pem
docker-compose up -d
EOF

# Установка прав на выполнение
sudo chmod +x /usr/local/bin/renew-ssl.sh

# Добавление в crontab для автоматического обновления
sudo crontab -e
# Добавьте строку: 0 3 1 * * /usr/local/bin/renew-ssl.sh >/dev/null 2>&1
```

### 5.3 Настройка Nginx конфигурации

```bash
# Редактирование nginx.conf
nano nginx.conf
```

**Замените `your-domain.com` на ваш реальный домен:**

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    
    # ... остальная конфигурация
}
```

## 🚀 Запуск приложения

### 6.1 Сборка и запуск без Nginx (для тестирования)

```bash
# Сборка образов
docker-compose build

# Запуск без nginx для первоначального тестирования
docker-compose up -d mongodb app

# Проверка логов
docker-compose logs -f

# Проверка статуса
docker-compose ps

# Тестирование приложения
curl http://localhost:3001/health
```

### 6.2 Полный запуск с Nginx (production)

```bash
# Остановка тестового запуска
docker-compose down

# Запуск всех сервисов включая Nginx
docker-compose --profile production up -d

# Проверка всех сервисов
docker-compose ps

# Проверка логов всех сервисов
docker-compose logs -f
```

### 6.3 Проверка работоспособности

```bash
# Проверка локального доступа к приложению
curl http://localhost:3001/health

# Проверка доступа через Nginx
curl http://localhost/health

# Проверка HTTPS (замените на ваш домен)
curl https://yourdomain.com/health

# Проверка в браузере
echo "Откройте в браузере: https://yourdomain.com"
```

## 📊 Мониторинг и логирование

### 7.1 Настройка мониторинга

#### Создание скриптов мониторинга:

```bash
# Создание директории для скриптов
mkdir -p ~/scripts

# Скрипт проверки состояния сервисов
tee ~/scripts/check-services.sh > /dev/null <<'EOF'
#!/bin/bash
cd /home/deploy/sozdaibota

echo "=== СОСТОЯНИЕ DOCKER КОНТЕЙНЕРОВ ==="
docker-compose ps

echo ""
echo "=== ИСПОЛЬЗОВАНИЕ РЕСУРСОВ ==="
docker stats --no-stream

echo ""
echo "=== ПРОВЕРКА HEALTH ENDPOINTS ==="
curl -s http://localhost:3001/health || echo "❌ App health check failed"
curl -s http://localhost/health || echo "❌ Nginx health check failed"

echo ""
echo "=== МЕСТО НА ДИСКЕ ==="
df -h

echo ""
echo "=== ПОСЛЕДНИЕ ЛОГИ ==="
docker-compose logs --tail=10 app
EOF

chmod +x ~/scripts/check-services.sh

# Скрипт бэкапа
tee ~/scripts/backup.sh > /dev/null <<'EOF'
#!/bin/bash
BACKUP_DIR="/home/deploy/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR

cd /home/deploy/sozdaibota

# Backup MongoDB
docker-compose exec -T mongodb mongodump --uri="mongodb://admin:${MONGO_ROOT_PASSWORD}@localhost:27017/sozdaibota-db" --out /tmp/backup
docker cp sozdaibota-mongodb:/tmp/backup $BACKUP_DIR/mongodb

# Backup конфигурации
cp -r .env ssl logs $BACKUP_DIR/

# Архивация
cd /home/deploy/backups
tar -czf "backup_$(date +%Y%m%d_%H%M%S).tar.gz" $(basename $BACKUP_DIR)
rm -rf $BACKUP_DIR

# Удаление старых бэкапов (старше 7 дней)
find /home/deploy/backups -name "backup_*.tar.gz" -mtime +7 -delete

echo "Backup completed: backup_$(date +%Y%m%d_%H%M%S).tar.gz"
EOF

chmod +x ~/scripts/backup.sh
```

#### Настройка cron задач:

```bash
# Редактирование crontab
crontab -e

# Добавьте следующие строки:
# Проверка состояния каждые 5 минут
*/5 * * * * /home/deploy/scripts/check-services.sh >> /home/deploy/logs/monitoring.log 2>&1

# Ежедневный бэкап в 2:00
0 2 * * * /home/deploy/scripts/backup.sh >> /home/deploy/logs/backup.log 2>&1

# Еженедельная очистка логов Docker в воскресенье в 3:00
0 3 * * 0 docker system prune -f >> /home/deploy/logs/cleanup.log 2>&1
```

### 7.2 Логирование

#### Настройка ротации логов:

```bash
# Создание конфигурации logrotate
sudo tee /etc/logrotate.d/sozdaibota > /dev/null <<'EOF'
/home/deploy/sozdaibota/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 deploy deploy
}

/home/deploy/logs/*.log {
    weekly
    rotate 4
    compress
    delaycompress
    missingok
    notifempty
    create 644 deploy deploy
}
EOF
```

#### Полезные команды для работы с логами:

```bash
# Просмотр логов в реальном времени
docker-compose logs -f app
docker-compose logs -f mongodb
docker-compose logs -f nginx

# Последние 100 строк логов
docker-compose logs --tail=100 app

# Логи за последний час
docker-compose logs --since="1h" app

# Поиск ошибок в логах
docker-compose logs app 2>&1 | grep -i error

# Мониторинг ресурсов
docker stats
```

## 🔒 Безопасность и обслуживание

### 8.1 Усиление безопасности

#### Настройка SSH:

```bash
# Редактирование конфигурации SSH
sudo nano /etc/ssh/sshd_config

# Рекомендуемые настройки:
# Port 2222  # Изменить стандартный порт
# PermitRootLogin no
# PasswordAuthentication no
# PubkeyAuthentication yes
# MaxAuthTries 3

# Перезапуск SSH
sudo systemctl restart sshd

# Обновление firewall для нового порта SSH
sudo ufw allow 2222/tcp
sudo ufw delete allow ssh
```

#### Настройка автоматических обновлений:

```bash
# Ubuntu/Debian
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# CentOS/RHEL
sudo yum install -y yum-cron
sudo systemctl enable yum-cron
sudo systemctl start yum-cron
```

#### Установка Fail2Ban:

```bash
# Установка
sudo apt install -y fail2ban  # Ubuntu/Debian
sudo yum install -y epel-release fail2ban  # CentOS

# Создание конфигурации
sudo tee /etc/fail2ban/jail.local > /dev/null <<'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = 2222
logpath = /var/log/auth.log

[nginx-http-auth]
enabled = true
port = http,https
logpath = /home/deploy/sozdaibota/logs/nginx-access.log
EOF

# Запуск Fail2Ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 8.2 Регулярное обслуживание

#### Еженедельные задачи:

```bash
# Создание скрипта еженедельного обслуживания
tee ~/scripts/weekly-maintenance.sh > /dev/null <<'EOF'
#!/bin/bash
cd /home/deploy/sozdaibota

echo "=== ЕЖЕНЕДЕЛЬНОЕ ОБСЛУЖИВАНИЕ ==="
echo "Дата: $(date)"

# Обновление образов Docker
echo "Обновление Docker образов..."
docker-compose pull

# Перезапуск с новыми образами
echo "Перезапуск сервисов..."
docker-compose up -d --force-recreate

# Очистка неиспользуемых образов
echo "Очистка неиспользуемых образов..."
docker image prune -f

# Проверка дискового пространства
echo "Проверка дискового пространства..."
df -h

# Проверка логов на ошибки за последние 7 дней
echo "Проверка логов на ошибки..."
docker-compose logs --since="7d" 2>&1 | grep -i error | tail -20

echo "Обслуживание завершено"
EOF

chmod +x ~/scripts/weekly-maintenance.sh

# Добавление в cron (каждое воскресенье в 4:00)
echo "0 4 * * 0 /home/deploy/scripts/weekly-maintenance.sh >> /home/deploy/logs/maintenance.log 2>&1" | crontab -
```

### 8.3 Мониторинг производительности

#### Установка htop и iotop:

```bash
# Ubuntu/Debian
sudo apt install -y htop iotop ncdu

# CentOS/RHEL
sudo yum install -y htop iotop ncdu
```

#### Создание дашборда мониторинга:

```bash
# Скрипт системного мониторинга
tee ~/scripts/system-monitor.sh > /dev/null <<'EOF'
#!/bin/bash
clear
echo "======================================"
echo "    SOZDAIBOTA SYSTEM MONITOR"
echo "======================================"
echo

echo "🖥️  СИСТЕМА:"
echo "Время: $(date)"
echo "Аптайм: $(uptime -p)"
echo "Нагрузка: $(uptime | awk -F'load average:' '{print $2}')"
echo

echo "💾 ПАМЯТЬ:"
free -h
echo

echo "💿 ДИСК:"
df -h /
echo

echo "🐳 DOCKER КОНТЕЙНЕРЫ:"
docker-compose -f /home/deploy/sozdaibota/docker-compose.yml ps
echo

echo "📊 РЕСУРСЫ КОНТЕЙНЕРОВ:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
echo

echo "🌐 СЕТЕВЫЕ ПОДКЛЮЧЕНИЯ:"
ss -tuln | grep -E ':80|:443|:3001|:27017'
echo

echo "📝 ПОСЛЕДНИЕ ОШИБКИ В ЛОГАХ:"
docker-compose -f /home/deploy/sozdaibota/docker-compose.yml logs --tail=5 2>&1 | grep -i error
EOF

chmod +x ~/scripts/system-monitor.sh

# Создание алиаса для быстрого доступа
echo "alias monitor='~/scripts/system-monitor.sh'" >> ~/.bashrc
source ~/.bashrc
```

## 🔄 Обновления и развертывание

### 9.1 Процедура обновления

```bash
# Создание скрипта обновления
tee ~/scripts/update.sh > /dev/null <<'EOF'
#!/bin/bash
cd /home/deploy/sozdaibota

echo "=== ОБНОВЛЕНИЕ SOZDAIBOTA ==="
echo "Дата: $(date)"

# Создание бэкапа перед обновлением
echo "Создание бэкапа..."
~/scripts/backup.sh

# Получение последних изменений
echo "Получение обновлений из Git..."
git fetch origin main
git pull origin main

# Проверка изменений в docker-compose
if git diff HEAD~1 HEAD --name-only | grep -q docker-compose; then
    echo "Обнаружены изменения в Docker конфигурации"
    echo "Пересборка образов..."
    docker-compose build --no-cache
fi

# Обновление сервисов
echo "Обновление сервисов..."
docker-compose up -d

# Проверка состояния
sleep 30
echo "Проверка состояния после обновления..."
curl -f http://localhost:3001/health || {
    echo "❌ Ошибка: приложение не отвечает"
    echo "Откат к предыдущей версии..."
    git reset --hard HEAD~1
    docker-compose up -d --force-recreate
    exit 1
}

echo "✅ Обновление завершено успешно"
EOF

chmod +x ~/scripts/update.sh
```

### 9.2 Blue-Green развертывание (опционально)

```bash
# Создание скрипта zero-downtime обновления
tee ~/scripts/zero-downtime-update.sh > /dev/null <<'EOF'
#!/bin/bash
cd /home/deploy/sozdaibota

# Создание временной конфигурации
cp docker-compose.yml docker-compose.blue.yml
sed -i 's/sozdaibota-app/sozdaibota-app-blue/g' docker-compose.blue.yml
sed -i 's/3001:3001/3002:3001/g' docker-compose.blue.yml

# Запуск blue версии
docker-compose -f docker-compose.blue.yml up -d app

# Ожидание готовности
sleep 30

# Проверка blue версии
if curl -f http://localhost:3002/health; then
    echo "Blue версия готова, переключение трафика..."
    
    # Обновление nginx конфигурации для blue
    sed -i 's/app:3001/app-blue:3001/g' nginx.conf
    docker-compose restart nginx
    
    # Остановка green версии
    docker-compose stop app
    
    # Переименование blue в main
    docker rename sozdaibota-app-blue sozdaibota-app
    
    echo "Переключение завершено"
else
    echo "Blue версия не работает, откат..."
    docker-compose -f docker-compose.blue.yml down
fi

rm docker-compose.blue.yml
EOF

chmod +x ~/scripts/zero-downtime-update.sh
```

## 🆘 Устранение неполадок

### 10.1 Диагностические команды

```bash
# Создание скрипта диагностики
tee ~/scripts/diagnose.sh > /dev/null <<'EOF'
#!/bin/bash
echo "=== ДИАГНОСТИКА SOZDAIBOTA ==="
echo "Дата: $(date)"
echo

cd /home/deploy/sozdaibota

echo "1. СТАТУС КОНТЕЙНЕРОВ:"
docker-compose ps
echo

echo "2. ИСПОЛЬЗОВАНИЕ РЕСУРСОВ:"
docker stats --no-stream
echo

echo "3. ПОСЛЕДНИЕ ЛОГИ ПРИЛОЖЕНИЯ:"
docker-compose logs --tail=20 app
echo

echo "4. ПОСЛЕДНИЕ ЛОГИ MONGODB:"
docker-compose logs --tail=10 mongodb
echo

echo "5. ПОСЛЕДНИЕ ЛОГИ NGINX:"
docker-compose logs --tail=10 nginx
echo

echo "6. СЕТЕВЫЕ ПОДКЛЮЧЕНИЯ:"
ss -tuln | grep -E ':80|:443|:3001|:27017'
echo

echo "7. ПРОВЕРКА ДОСТУПНОСТИ СЕРВИСОВ:"
curl -s http://localhost:3001/health && echo "✅ App OK" || echo "❌ App Failed"
curl -s http://localhost/health && echo "✅ Nginx OK" || echo "❌ Nginx Failed"
echo

echo "8. МЕСТО НА ДИСКЕ:"
df -h
echo

echo "9. ИСПОЛЬЗОВАНИЕ ПАМЯТИ:"
free -h
echo

echo "10. ПРОЦЕССЫ DOCKER:"
ps aux | grep docker
EOF

chmod +x ~/scripts/diagnose.sh
```

### 10.2 Частые проблемы и решения

#### MongoDB не запускается:

```bash
# Проверка логов MongoDB
docker-compose logs mongodb

# Проверка прав на папку данных
docker volume inspect sozdaibota_mongodb_data

# Пересоздание volume MongoDB (ПОТЕРЯ ДАННЫХ!)
docker-compose down
docker volume rm sozdaibota_mongodb_data
docker-compose up -d mongodb
```

#### Приложение не может подключиться к MongoDB:

```bash
# Проверка сетевого подключения
docker-compose exec app nslookup mongodb

# Проверка переменных окружения
docker-compose exec app printenv | grep MONGODB

# Тест подключения к MongoDB
docker-compose exec app node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB OK'))
  .catch(err => console.log('❌ MongoDB Error:', err.message));
"
```

#### SSL сертификат не работает:

```bash
# Проверка сертификатов
ls -la ssl/
openssl x509 -in ssl/fullchain.pem -text -noout | grep -E 'Subject:|DNS:'

# Обновление сертификата
sudo certbot renew --force-renewal
sudo cp /etc/letsencrypt/live/yourdomain.com/*.pem ~/sozdaibota/ssl/
sudo chown deploy:deploy ~/sozdaibota/ssl/*.pem
docker-compose restart nginx
```

#### Высокое использование ресурсов:

```bash
# Анализ использования CPU и памяти
docker stats
htop

# Проверка логов на ошибки
docker-compose logs app 2>&1 | grep -i error | tail -50

# Перезапуск сервисов
docker-compose restart

# Очистка логов Docker
docker system prune -f
```

## 📞 Поддержка и контакты

### Полезные команды для администратора:

```bash
# Быстрая диагностика
alias status='cd ~/sozdaibota && docker-compose ps && docker stats --no-stream'

# Просмотр логов
alias logs='cd ~/sozdaibota && docker-compose logs -f'

# Перезапуск всех сервисов
alias restart='cd ~/sozdaibota && docker-compose restart'

# Обновление приложения
alias update='~/scripts/update.sh'

# Полная диагностика
alias diagnose='~/scripts/diagnose.sh'

# Мониторинг системы
alias monitor='~/scripts/system-monitor.sh'

# Добавление в .bashrc
echo "
# Sozdaibota aliases
alias status='cd ~/sozdaibota && docker-compose ps && docker stats --no-stream'
alias logs='cd ~/sozdaibota && docker-compose logs -f'
alias restart='cd ~/sozdaibota && docker-compose restart'
alias update='~/scripts/update.sh'
alias diagnose='~/scripts/diagnose.sh'
alias monitor='~/scripts/system-monitor.sh'
" >> ~/.bashrc
```

### Контрольный список развертывания:

- [ ] ✅ Сервер подготовлен и обновлен
- [ ] ✅ Docker и Docker Compose установлены
- [ ] ✅ Firewall настроен
- [ ] ✅ DNS записи настроены
- [ ] ✅ SSL сертификат получен
- [ ] ✅ Переменные окружения настроены
- [ ] ✅ Приложение запущено
- [ ] ✅ Мониторинг настроен
- [ ] ✅ Бэкапы настроены
- [ ] ✅ Логирование работает
- [ ] ✅ Домен работает через HTTPS

**Поздравляем! Ваш sozdaibota успешно развернут и готов к работе! 🎉** 