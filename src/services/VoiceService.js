const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { HttpsProxyAgent } = require('https-proxy-agent');

class VoiceService {
    constructor() {
        this.openaiApiKey = config.openai.apiKey;
        
        // Настройка прокси если нужно
        this.proxyAgent = null;
        if (config.proxy.useProxy && config.proxy.host && config.proxy.port) {
            this.proxyAgent = new HttpsProxyAgent(
                `${config.proxy.protocol}://${config.proxy.username}:${config.proxy.password}@${config.proxy.host}:${config.proxy.port}`
            );
            logger.info('VoiceService: Прокси настроен для запросов');
        }
    }

    async transcribeAudio(audioPath) {
        try {
            logger.info('Начинаем транскрипцию аудио', { 
                audioPath,
                apiKeyExists: !!this.openaiApiKey,
                apiKeyPrefix: this.openaiApiKey ? this.openaiApiKey.substring(0, 7) : 'нет'
            });

            // Проверяем API ключ
            if (!this.openaiApiKey) {
                throw new Error('OpenAI API ключ не настроен в переменных окружения');
            }

            // Проверяем формат ключа
            if (!this.openaiApiKey.startsWith('sk-')) {
                throw new Error('OpenAI API ключ имеет неверный формат (должен начинаться с sk-)');
            }

            // Проверяем существование файла
            if (!fs.existsSync(audioPath)) {
                throw new Error('Аудио файл не найден: ' + audioPath);
            }

            // Проверяем размер файла
            const stats = await fs.promises.stat(audioPath);
            logger.info('Информация о файле:', { 
                size: stats.size,
                sizeInMB: (stats.size / 1024 / 1024).toFixed(2) + 'MB',
                path: audioPath
            });
            
            if (stats.size === 0) {
                throw new Error('Пустой аудио файл');
            }
            
            if (stats.size > 25 * 1024 * 1024) {
                throw new Error('Файл слишком большой (максимум 25MB)');
            }

            // Создаем FormData для отправки в OpenAI
            const formData = new FormData();
            const fileStream = fs.createReadStream(audioPath);
            
            // Определяем имя файла с правильным расширением
            const fileName = path.basename(audioPath);
            formData.append('file', fileStream, fileName);
            
            // Используем НОВУЮ модель gpt-4o-mini-transcribe вместо whisper-1
            // Она поддерживает только json или text форматы
            formData.append('model', 'gpt-4o-mini-transcribe');
            formData.append('language', 'ru');
            formData.append('response_format', 'text'); // Используем text вместо json для простоты
            
            // Добавляем prompt для улучшения качества распознавания
            formData.append('prompt', 'Транскрипция на русском языке. Это сообщение от клиента о создании бота.');

            logger.info('Отправляем запрос в OpenAI API', {
                url: 'https://api.openai.com/v1/audio/transcriptions',
                model: 'gpt-4o-mini-transcribe',
                language: 'ru',
                format: 'text'
            });

            const axiosConfig = {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    ...formData.getHeaders()
                },
                timeout: 60000, // 60 секунд таймаут
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            };

            // Добавляем прокси если настроен
            if (this.proxyAgent) {
                axiosConfig.httpsAgent = this.proxyAgent;
                logger.info('Используем прокси для запроса к OpenAI');
            }

            const response = await axios.post(
                'https://api.openai.com/v1/audio/transcriptions',
                formData,
                axiosConfig
            );

            // Для text формата ответ приходит прямо в response.data
            const transcription = typeof response.data === 'string' 
                ? response.data 
                : (response.data.text || '');
            
            logger.info('Транскрипция завершена успешно', { 
                transcriptionLength: transcription.length,
                preview: transcription.substring(0, 100) + '...'
            });

            // Удаляем временный файл
            try {
                await fs.promises.unlink(audioPath);
                logger.info('Временный аудио файл удален');
            } catch (error) {
                logger.warn('Не удалось удалить временный файл:', error.message);
            }

            return transcription;

        } catch (error) {
            logger.error('Ошибка транскрипции аудио:', {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                errorData: error.response?.data,
                code: error.code
            });
            
            // Пытаемся удалить файл даже при ошибке
            try {
                if (fs.existsSync(audioPath)) {
                    await fs.promises.unlink(audioPath);
                }
            } catch (cleanupError) {
                logger.warn('Ошибка при удалении файла:', cleanupError.message);
            }

            // Определяем тип ошибки для более информативного сообщения
            if (error.response?.status === 401) {
                throw new Error('Ошибка авторизации OpenAI API. Проверьте правильность API ключа.');
            } else if (error.response?.status === 429) {
                throw new Error('Превышен лимит запросов к OpenAI API. Попробуйте позже.');
            } else if (error.response?.status === 400) {
                // Если модель не поддерживается, пробуем whisper-1
                if (error.response?.data?.error?.message?.includes('model')) {
                    logger.warn('Модель gpt-4o-mini-transcribe не доступна, пробуем whisper-1');
                    return this.transcribeWithWhisper(audioPath);
                }
                throw new Error(`Неверный запрос: ${error.response?.data?.error?.message || error.message}`);
            } else if (error.response?.status === 413) {
                throw new Error('Аудио файл слишком большой (максимум 25MB)');
            } else if (error.response?.status === 415) {
                throw new Error('Неподдерживаемый формат аудио');
            } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                throw new Error('Превышено время ожидания ответа от OpenAI');
            } else if (error.code === 'ENOTFOUND') {
                throw new Error('Не удается подключиться к OpenAI API. Проверьте интернет соединение.');
            }

            throw new Error(`Не удалось обработать голосовое сообщение: ${error.message}`);
        }
    }

    // Резервный метод с whisper-1 если новые модели не доступны
    async transcribeWithWhisper(audioPath) {
        try {
            logger.info('Пробуем транскрипцию через whisper-1');

            const formData = new FormData();
            const fileStream = fs.createReadStream(audioPath);
            const fileName = path.basename(audioPath);
            
            formData.append('file', fileStream, fileName);
            formData.append('model', 'whisper-1');
            formData.append('language', 'ru');
            formData.append('response_format', 'json');

            const axiosConfig = {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    ...formData.getHeaders()
                },
                timeout: 60000
            };

            if (this.proxyAgent) {
                axiosConfig.httpsAgent = this.proxyAgent;
            }

            const response = await axios.post(
                'https://api.openai.com/v1/audio/transcriptions',
                formData,
                axiosConfig
            );

            const transcription = response.data.text || '';
            logger.info('Транскрипция через whisper-1 успешна');

            return transcription;

        } catch (error) {
            logger.error('Ошибка whisper-1:', error.message);
            throw error;
        }
    }

    async generateSpeech(text, voice = 'alloy') {
        try {
            logger.info('Генерируем речь из текста', { textLength: text.length, voice });

            const response = await axios.post(
                'https://api.openai.com/v1/audio/speech',
                {
                    model: 'tts-1',
                    input: text.slice(0, 4096), // Ограничиваем длину текста
                    voice: voice
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer',
                    timeout: 60000 // Увеличен до 60 секунд
                }
            );

            logger.info('Речь сгенерирована успешно');
            return Buffer.from(response.data);

        } catch (error) {
            logger.error('Ошибка генерации речи:', error);
            throw new Error('Не удалось сгенерировать речь');
        }
    }

    // Проверка валидности аудио файла
    validateAudioFile(file) {
        // Расширенный список поддерживаемых форматов согласно документации
        const allowedTypes = [
            'audio/webm',
            'audio/ogg',
            'audio/wav',
            'audio/wave', 
            'audio/x-wav',
            'audio/mp3',
            'audio/mpeg',
            'audio/mp4',
            'audio/m4a',
            'audio/x-m4a',
            'application/octet-stream' // Для некоторых браузеров
        ];
        
        const maxSize = 25 * 1024 * 1024; // 25MB

        // Проверяем MIME тип
        if (!allowedTypes.includes(file.mimetype) && !file.mimetype.startsWith('audio/')) {
            throw new Error(`Неподдерживаемый формат аудио: ${file.mimetype}`);
        }

        // Проверяем размер
        if (file.size > maxSize) {
            throw new Error('Файл слишком большой (максимум 25MB)');
        }

        if (file.size === 0) {
            throw new Error('Пустой файл');
        }

        return true;
    }

    // Создание директории для загрузок, если не существует
    async ensureUploadDir() {
        const uploadDir = path.join(process.cwd(), 'uploads');
        
        try {
            await fs.promises.access(uploadDir);
        } catch (error) {
            // Папка не существует, создаем
            await fs.promises.mkdir(uploadDir, { recursive: true });
            logger.info('Создана папка для загрузок:', { uploadDir });
        }

        return uploadDir;
    }

    // Тестирование API
    async testTranscriptionAPI() {
        try {
            // Проверяем доступность API
            const testResponse = await axios.get(
                'https://api.openai.com/v1/models',
                {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`
                    },
                    timeout: 5000,
                    httpsAgent: this.proxyAgent
                }
            );

            const models = testResponse.data.data.map(m => m.id);
            const hasNewModels = models.some(m => 
                m.includes('gpt-4o-mini-transcribe') || 
                m.includes('gpt-4o-transcribe')
            );
            const hasWhisper = models.some(m => m.includes('whisper'));

            logger.info('Доступные модели для транскрипции:', {
                hasNewModels,
                hasWhisper,
                totalModels: models.length
            });

            return {
                success: true,
                hasNewModels,
                hasWhisper
            };

        } catch (error) {
            logger.error('Ошибка проверки API:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new VoiceService();