const crypto = require('crypto');
const config = require('../config');
const logger = require('./logger');

class EncryptionUtils {
    constructor() {
        this.encryptionKey = process.env.ENCRYPTION_KEY;
        if (!this.encryptionKey) {
            logger.warn('ENCRYPTION_KEY не настроен, шифрование отключено');
        }
    }

    // Шифрование данных
    encryptData(text) {
        if (!this.encryptionKey || !text) {
            return text;
        }

        try {
            const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            logger.info('Данные зашифрованы', { originalLength: text.length });
            return encrypted;
        } catch (error) {
            logger.error('Ошибка шифрования:', error);
            return text; // Возвращаем исходный текст при ошибке
        }
    }

    // Расшифровка данных
    decryptData(encryptedText) {
        if (!this.encryptionKey || !encryptedText) {
            return encryptedText;
        }

        try {
            const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            logger.info('Данные расшифрованы', { decryptedLength: decrypted.length });
            return decrypted;
        } catch (error) {
            logger.error('Ошибка расшифровки:', error);
            return encryptedText; // Возвращаем зашифрованный текст при ошибке
        }
    }

    // Хеширование данных (необратимое)
    hashData(text) {
        if (!text) return text;

        try {
            const hash = crypto.createHash('sha256');
            hash.update(text);
            return hash.digest('hex');
        } catch (error) {
            logger.error('Ошибка хеширования:', error);
            return text;
        }
    }

    // Генерация случайного ключа
    generateKey(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Безопасное сравнение строк
    safeCompare(a, b) {
        if (!a || !b) return false;
        
        try {
            const bufferA = Buffer.from(a, 'utf8');
            const bufferB = Buffer.from(b, 'utf8');
            
            if (bufferA.length !== bufferB.length) {
                return false;
            }
            
            return crypto.timingSafeEqual(bufferA, bufferB);
        } catch (error) {
            logger.error('Ошибка безопасного сравнения:', error);
            return false;
        }
    }
}

module.exports = new EncryptionUtils(); 