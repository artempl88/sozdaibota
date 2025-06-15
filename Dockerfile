# Используем официальный Node.js образ
FROM node:20-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY . .

# Создаем необходимые директории
RUN mkdir -p logs uploads temp

# Устанавливаем права
RUN chown -R node:node /app
USER node

# Открываем порт
EXPOSE 3001

# Команда для запуска
CMD ["node", "start.js"] 