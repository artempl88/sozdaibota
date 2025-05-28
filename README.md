# 🚀 Установка и настройка GPT Assistant для сайта "Создать Бота"

## 📋 Что у вас есть

✅ **Фронтенд сайт** - готов к работе  
✅ **OpenAI API ключ** - предоставлен  
✅ **Прокси сервер** - настроен (141.98.187.117:8000)  
✅ **Серверный код** - создан  

## 🛠 Установка серверной части

### 1. Создайте папку для сервера

```bash
mkdir createbot-server
cd createbot-server
```

### 2. Инициализируйте Node.js проект

```bash
npm init -y
```

### 3. Установите зависимости

```bash
npm install express cors express-rate-limit axios https-proxy-agent dotenv helmet
npm install --save-dev nodemon
```

### 4. Создайте файлы

#### 📁 server.js
*Скопируйте код из артефакта "Безопасная серверная интеграция с OpenAI API"*

#### 📁 .env
```env
OPENAI_API_KEY=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
PORT=3001
NODE_ENV=production
PROXY_HOST=141.98.187.117
PROXY_PORT=8000
PROXY_USERNAME=qr4NBX
PROXY_PASSWORD=mFmLGN
ALLOWED_ORIGINS=https://создать-бота.рф,http://localhost:3000
```

#### 📁 package.json (обновите скрипты)
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  }
}
```

## 🚀 Запуск сервера

### Локальный запуск для тестирования:
```bash
npm run dev
```

### Продакшн запуск:
```bash
npm start
```

### Проверка работоспособности:
```bash
curl http://localhost:3001/api/health
```

Должны получить:
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "service": "CreateBot GPT Assistant"
}
```

## 🌐 Настройка фронтенда

### 1. Обновите endpoints в JS коде

Если сервер на том же домене:
```javascript
this.apiConfig = {
    endpoint: '/api/gpt-assistant',
    specEndpoint: '/api/generate-specification'
};
```

Если сервер на другом домене:
```javascript
this.apiConfig = {
    endpoint: 'https://your-server.com/api/gpt-assistant',
    specEndpoint: 'https://your-server.com/api/generate-specification'
};
```

### 2. Настройте CORS на сервере

В `server.js` обновите allowed origins:
```javascript
app.use(cors({
    origin: ['https://ваш-сайт.рф', 'https://создать-бота.рф'],
    credentials: true
}));
```

## 🔧 Деплой на сервер

### Вариант 1: Обычный VPS
```bash
# Клонируйте код на сервер
git clone your-repo
cd createbot-server

# Установите зависимости
npm install --production

# Настройте переменные окружения
cp .env.example .env
nano .env

# Запустите с PM2
npm install -g pm2
pm2 start server.js --name "gpt-assistant"
pm2 startup
pm2 save
```

### Вариант 2: Docker
```bash
# Соберите образ
docker build -t createbot-gpt .

# Запустите контейнер
docker run -d --name gpt-assistant \
  -p 3001:3001 \
  --env-file .env \
  createbot-gpt
```

### Вариант 3: Heroku
```bash
# Создайте приложение
heroku create your-app-name

# Установите переменные окружения
heroku config:set OPENAI_API_KEY=your-key
heroku config:set PROXY_HOST=141.98.187.117
# ... остальные переменные

# Деплойте
git push heroku main
```

## 🔒 Безопасность

### ✅ Что УЖЕ реализовано:
- API ключ хранится на сервере
- Rate limiting (50 запросов за 15 минут)
- CORS защита
- Валидация входных данных
- Прокси для OpenAI API
- Fallback при ошибках

### 🔧 Дополнительные меры:
```javascript
// В server.js добавьте:
const helmet = require('helmet');
app.use(helmet());

// Логирование
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

## 📊 Мониторинг

### Health Check
```bash
# Проверка здоровья сервиса
curl https://your-server.com/api/health
```

### Логи
```bash
# PM2 логи
pm2 logs gpt-assistant

# Docker логи  
docker logs gpt-assistant

# Файловые логи
tail -f combined.log
```

### Метрики
```javascript
// Добавьте в server.js счетчики:
let requestCount = 0;
let errorCount = 0;

app.use((req, res, next) => {
    requestCount++;
    next();
});

app.get('/api/metrics', (req, res) => {
    res.json({
        requests: requestCount,
        errors: errorCount,
        uptime: process.uptime()
    });
});
```

## 🧪 Тестирование

### 1. Проверьте базовую работу:
```bash
curl -X POST http://localhost:3001/api/gpt-assistant \
  -H "Content-Type: application/json" \
  -d '{"message": "Привет! Хочу создать бота для интернет-магазина"}'
```

### 2. Проверьте генерацию ТЗ:
```bash
curl -X POST http://localhost:3001/api/generate-specification \
  -H "Content-Type: application/json" \
  -d '{"conversation": [{"role": "user", "content": "интернет-магазин"}, {"role": "assistant", "content": "отлично"}]}'
```

### 3. Проверьте rate limiting:
```bash
# Отправьте 60 запросов подряд - должен вернуть 429 ошибку
```

## 🔄 Обновления

### Обновление OpenAI модели:
```javascript
// В server.js измените:
const OPENAI_CONFIG = {
    model: 'gpt-4o-mini', // или 'gpt-4o'
    // ...
};
```

### Настройка параметров ИИ:
```javascript
const response = await axios.post(endpoint, {
    model: OPENAI_CONFIG.model,
    messages: messages,
    max_tokens: 300,        // Увеличьте для длинных ответов
    temperature: 0.7,       // 0.1-1.0 (креативность)
    presence_penalty: 0.1,  // Избегание повторов
    frequency_penalty: 0.1  // Разнообразие ответов
});
```

## 🆘 Решение проблем

### Проблема: "API ключ недействителен"
```bash
# Проверьте ключ:
echo $OPENAI_API_KEY

# Обновите:
heroku config:set OPENAI_API_KEY=новый-ключ
```

### Проблема: "CORS ошибка"
```javascript
// Добавьте ваш домен в CORS:
app.use(cors({
    origin: ['https://ваш-сайт.рф']
}));
```

### Проблема: "Прокси не работает"
```javascript
// Проверьте настройки прокси:
console.log('Proxy config:', PROXY_CONFIG);

// Тестируйте без прокси:
// httpsAgent: proxyAgent, // закомментируйте эту строку
```

### Проблема: "Rate limit превышен"
```javascript
// Увеличьте лимиты:
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100 // было 50
});
```

## 📞 Поддержка

- 📧 Email: support@создать-бота.рф
- 💬 Telegram: @создать_бота
- 📝 Issues: GitHub репозиторий

---

🎉 **Поздравляем!** Ваш GPT Assistant готов к работе и будет помогать клиентам создавать качественные технические задания для Telegram-ботов!