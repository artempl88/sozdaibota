@echo off
echo 🚀 Запуск sozdaibota с локальной MongoDB...
echo.

REM Убиваем старые процессы
taskkill /f /im node.exe >nul 2>&1

echo 🔄 Запуск локальной MongoDB...
start /B node start-mongodb.js

echo ⏱️ Ожидание запуска MongoDB (5 сек)...
timeout /t 5 /nobreak >nul

echo 🔄 Запуск сервера...
start /B node start.js

echo ⏱️ Ожидание запуска сервера (3 сек)...
timeout /t 3 /nobreak >nul

echo.
echo ✅ Сервисы запущены!
echo 📍 Веб-интерфейс: http://localhost:3001
echo 🛑 Для остановки нажмите любую клавишу
echo.

pause >nul

REM Останавливаем все процессы
echo 🔄 Остановка сервисов...
taskkill /f /im node.exe >nul 2>&1
echo ✅ Сервисы остановлены
pause 