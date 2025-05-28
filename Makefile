# ===========================================
# Makefile - Команды для управления проектом
# ===========================================

# Переменные
IMAGE_NAME=createbot-gpt-assistant
CONTAINER_NAME=gpt-assistant-server

# Установка зависимостей
install:
	npm install

# Запуск в режиме разработки
dev:
	npm run dev

# Запуск в продакшене
start:
	npm start

# Сборка Docker образа
build:
	docker build -t $(IMAGE_NAME) .

# Запуск контейнера
run:
	docker run -d --name $(CONTAINER_NAME) -p 3001:3001 --env-file .env $(IMAGE_NAME)

# Остановка контейнера
stop:
	docker stop $(CONTAINER_NAME) && docker rm $(CONTAINER_NAME)

# Просмотр логов
logs:
	docker logs -f $(CONTAINER_NAME)

# Проверка здоровья
health:
	curl -f http://localhost:3001/api/health

# Очистка
clean:
	docker rmi $(IMAGE_NAME)
	npm cache clean --force

.PHONY: install dev start build run stop logs health clean