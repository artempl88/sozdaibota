// Инициализация MongoDB для sozdaibota
print('Начинаем инициализацию MongoDB для sozdaibota...');

// Переключаемся на нашу базу данных
db = db.getSiblingDB('sozdaibota-db');

// Создаем пользователя для приложения
db.createUser({
  user: 'sozdaibota_user',
  pwd: 'sozdaibota_password_2024',
  roles: [
    {
      role: 'readWrite',
      db: 'sozdaibota-db'
    }
  ]
});

// Создаем индексы для оптимизации
print('Создаем индексы...');

// Индексы для коллекции sessions
db.sessions.createIndex({ "sessionId": 1 }, { unique: true });
db.sessions.createIndex({ "fingerprint": 1 });
db.sessions.createIndex({ "createdAt": 1 }, { expireAfterSeconds: 2592000 }); // 30 дней
db.sessions.createIndex({ "lastActivity": 1 });

// Индексы для коллекции users
db.users.createIndex({ "telegramId": 1 }, { unique: true, sparse: true });
db.users.createIndex({ "email": 1 }, { unique: true, sparse: true });
db.users.createIndex({ "createdAt": 1 });

// Индексы для коллекции bots
db.bots.createIndex({ "userId": 1 });
db.bots.createIndex({ "name": 1 });
db.bots.createIndex({ "status": 1 });
db.bots.createIndex({ "createdAt": 1 });

// Индексы для коллекции analytics
db.analytics.createIndex({ "sessionId": 1 });
db.analytics.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 7776000 }); // 90 дней
db.analytics.createIndex({ "event": 1 });

print('Инициализация MongoDB завершена успешно!');
print('База данных: sozdaibota-db');
print('Пользователь: sozdaibota_user');
print('Индексы созданы для оптимизации запросов'); 