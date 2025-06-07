@echo off
echo =============================================
echo    ЗАПУСК СЕРВЕРА SOZDAIBOTA.RU
echo =============================================
echo.

:: Проверяем Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js не установлен!
    echo    Скачайте с https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js найден
echo.

:: Проверяем файлы конфигурации
if exist environment.env (
    echo ✅ environment.env найден
) else if exist config.production.js (
    echo ✅ config.production.js найден  
) else (
    echo ❌ Файлы конфигурации не найдены!
    echo    Нужен environment.env или config.production.js
    pause
    exit /b 1
)

echo.
echo 🚀 Запуск сервера...
echo    Порт: 3001
echo    URL: http://localhost:3001
echo.
echo 🛑 Для остановки нажмите Ctrl+C
echo.

:: Запускаем сервер
node start.js

pause 