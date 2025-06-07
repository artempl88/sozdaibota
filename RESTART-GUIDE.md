# 🔄 Инструкция по перезапуску сервера

## 🚀 Способы перезапуска

### 1. Автоматический скрипт (рекомендуется)
```bash
chmod +x restart-server.sh
./restart-server.sh
```

### 2. Через PM2 (если установлен)
```bash
chmod +x restart-pm2.sh
./restart-pm2.sh
```

### 3. Ручной перезапуск

#### Остановка:
```bash
# Найти процессы Node.js
ps aux | grep node

# Остановить по PID
kill <PID>

# Или остановить все Node.js процессы
pkill -f "node.*start.js"
```

#### Запуск:
```bash
# В фоне с логами
nohup npm start > server.log 2>&1 &

# Или через screen
screen -S sozdaibota
npm start
# Ctrl+A, D для отключения от screen
```

### 4. Быстрый перезапуск одной командой
```bash
pkill -f "node.*start.js" && sleep 2 && nohup npm start > server.log 2>&1 &
```

## 📊 Проверка статуса

### Проверить что сервер работает:
```bash
# Проверка процессов
ps aux | grep node

# Проверка порта
netstat -tlnp | grep :3001

# HTTP запрос
curl http://localhost:3001/api/health
```

### Просмотр логов:
```bash
# Последние логи
tail -f server.log

# Все логи
cat server.log

# Логи за сегодня
grep "$(date +%Y-%m-%d)" server.log
```

## 🔧 Устранение проблем

### Порт занят:
```bash
# Найти что использует порт 3001
lsof -i :3001

# Остановить процесс
kill $(lsof -ti :3001)
```

### Процесс завис:
```bash
# Принудительная остановка
pkill -9 -f "node.*start.js"

# Ждем и запускаем заново
sleep 2
npm start
```

### Ошибки в логах:
```bash
# Проверить синтаксис
node --check start.js

# Проверить зависимости
npm install

# Проверить права доступа
ls -la start.js
```

## 🌐 Проверка работы

После перезапуска проверьте:

- ✅ **Сайт**: https://sozdaibota.ru
- ✅ **API**: https://sozdaibota.ru/api/health  
- ✅ **Логи**: `tail -f server.log`
- ✅ **Процессы**: `ps aux | grep node`

## ⚡ Автоматизация

### Для cron (авто-перезапуск):
```bash
# Добавить в crontab
0 4 * * * cd /path/to/sozdaibota && ./restart-server.sh

# Или PM2 для авто-восстановления
pm2 start start.js --name sozdaibota --watch
pm2 startup
pm2 save
```

**🎯 Готово! Сервер перезапущен и работает!** 