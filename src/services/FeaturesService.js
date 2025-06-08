const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class FeaturesService {
    constructor() {
        this.featuresFilePath = path.join(__dirname, '../data/features.json');
        this.backupPath = path.join(__dirname, '../data/features.backup.json');
        this.features = null;
        this.initializeFeatures();
    }

    // Инициализация каталога функций
    async initializeFeatures() {
        try {
            // Проверяем существование файла
            await this.ensureFeaturesFile();
            
            // Загружаем функции
            await this.loadFeatures();
            
            logger.info('✅ Каталог функций инициализирован');
            
        } catch (error) {
            logger.error('Ошибка инициализации каталога функций:', error);
        }
    }

    // Убеждаемся что файл существует
    async ensureFeaturesFile() {
        try {
            await fs.access(this.featuresFilePath);
        } catch (error) {
            // Файл не существует, создаем базовую структуру
            logger.info('Создаем новый каталог функций');
            
            const initialFeatures = {
                basic: [
                    {
                        name: "Базовая настройка бота",
                        description: "Создание бота, настройка команд, базовое меню",
                        keywords: ["настройка", "создание", "бот", "меню", "команды"],
                        hours: 10,
                        cost: 20000,
                        complexity: "low",
                        addedAt: new Date().toISOString(),
                        usageCount: 0
                    }
                ],
                catalog: [],
                payments: [],
                booking: [],
                integrations: [],
                communication: [],
                analytics: [],
                admin: [],
                special: [],
                custom: []
            };
            
            await this.saveFeatures(initialFeatures);
        }
    }

    // Загрузка функций из файла
    async loadFeatures() {
        try {
            const data = await fs.readFile(this.featuresFilePath, 'utf8');
            this.features = JSON.parse(data);
            
            // Добавляем категорию custom если её нет
            if (!this.features.custom) {
                this.features.custom = [];
            }
            
        } catch (error) {
            logger.error('Ошибка загрузки функций:', error);
            this.features = {};
        }
    }

    // Сохранение функций в файл
    async saveFeatures(features = null) {
        try {
            const dataToSave = features || this.features;
            
            // Создаем резервную копию
            await this.createBackup();
            
            // Сохраняем с форматированием для читаемости
            await fs.writeFile(
                this.featuresFilePath, 
                JSON.stringify(dataToSave, null, 2),
                'utf8'
            );
            
            logger.info('✅ Каталог функций сохранен');
            
        } catch (error) {
            logger.error('Ошибка сохранения функций:', error);
            throw error;
        }
    }

    // Создание резервной копии
    async createBackup() {
        try {
            const data = await fs.readFile(this.featuresFilePath, 'utf8');
            await fs.writeFile(this.backupPath, data, 'utf8');
        } catch (error) {
            // Не критично если backup не создался
            logger.warn('Не удалось создать backup:', error.message);
        }
    }

    // Получение всех функций
    async getAllFeatures() {
        if (!this.features) {
            await this.loadFeatures();
        }
        return this.features;
    }

    // Добавление новой функции
    async addFeature(category, feature) {
        try {
            // Перезагружаем функции для актуальности
            await this.loadFeatures();
            
            // Проверяем категорию
            if (!this.features[category]) {
                this.features[category] = [];
            }
            
            // Проверяем дубликаты по имени
            const exists = this.features[category].some(
                f => f.name.toLowerCase() === feature.name.toLowerCase()
            );
            
            if (exists) {
                logger.info(`Функция "${feature.name}" уже существует в категории ${category}`);
                
                // Увеличиваем счетчик использования
                const existingFeature = this.features[category].find(
                    f => f.name.toLowerCase() === feature.name.toLowerCase()
                );
                existingFeature.usageCount = (existingFeature.usageCount || 0) + 1;
                existingFeature.lastUsed = new Date().toISOString();
                
            } else {
                // Добавляем новую функцию
                this.features[category].push(feature);
                logger.info(`✅ Добавлена новая функция: ${feature.name}`);
            }
            
            // Сохраняем изменения
            await this.saveFeatures();
            
            return true;
            
        } catch (error) {
            logger.error('Ошибка добавления функции:', error);
            return false;
        }
    }

    // Поиск функций по ключевым словам
    async searchFeatures(keywords) {
        if (!this.features) {
            await this.loadFeatures();
        }
        
        const results = [];
        const searchTerms = keywords.toLowerCase().split(' ');
        
        // Поиск по всем категориям
        for (const [category, features] of Object.entries(this.features)) {
            for (const feature of features) {
                // Проверяем совпадение с именем, описанием или ключевыми словами
                const searchText = `${feature.name} ${feature.description} ${(feature.keywords || []).join(' ')}`.toLowerCase();
                
                const matches = searchTerms.some(term => searchText.includes(term));
                
                if (matches) {
                    results.push({
                        ...feature,
                        category: category
                    });
                }
            }
        }
        
        return results;
    }

    // Получение статистики использования
    async getFeatureUsageStats() {
        if (!this.features) {
            await this.loadFeatures();
        }
        
        const stats = {
            totalFeatures: 0,
            byCategory: {},
            mostUsed: [],
            recentlyAdded: [],
            unusedFeatures: []
        };
        
        // Собираем все функции для анализа
        const allFeatures = [];
        
        for (const [category, features] of Object.entries(this.features)) {
            stats.byCategory[category] = features.length;
            stats.totalFeatures += features.length;
            
            features.forEach(feature => {
                allFeatures.push({
                    ...feature,
                    category: category
                });
            });
        }
        
        // Сортируем по использованию
        stats.mostUsed = allFeatures
            .filter(f => f.usageCount > 0)
            .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
            .slice(0, 10);
        
        // Недавно добавленные
        stats.recentlyAdded = allFeatures
            .filter(f => f.addedAt)
            .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
            .slice(0, 10);
        
        // Неиспользуемые
        stats.unusedFeatures = allFeatures
            .filter(f => !f.usageCount || f.usageCount === 0)
            .map(f => ({ name: f.name, category: f.category }));
        
        return stats;
    }

    // Обновление функции
    async updateFeature(category, featureName, updates) {
        try {
            await this.loadFeatures();
            
            if (!this.features[category]) {
                throw new Error(`Категория ${category} не найдена`);
            }
            
            const featureIndex = this.features[category].findIndex(
                f => f.name.toLowerCase() === featureName.toLowerCase()
            );
            
            if (featureIndex === -1) {
                throw new Error(`Функция ${featureName} не найдена`);
            }
            
            // Обновляем функцию
            this.features[category][featureIndex] = {
                ...this.features[category][featureIndex],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            
            await this.saveFeatures();
            
            logger.info(`✅ Функция ${featureName} обновлена`);
            return true;
            
        } catch (error) {
            logger.error('Ошибка обновления функции:', error);
            return false;
        }
    }

    // Удаление неиспользуемых функций (очистка каталога)
    async cleanupUnusedFeatures(daysUnused = 90) {
        try {
            await this.loadFeatures();
            
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysUnused);
            
            let removedCount = 0;
            
            for (const category of Object.keys(this.features)) {
                this.features[category] = this.features[category].filter(feature => {
                    // Оставляем если:
                    // 1. Использовалась хотя бы раз
                    // 2. Добавлена недавно
                    // 3. Базовая функция (всегда нужна)
                    
                    if (feature.usageCount > 0) return true;
                    if (feature.name === 'Базовая настройка бота') return true;
                    
                    if (feature.addedAt) {
                        const addedDate = new Date(feature.addedAt);
                        if (addedDate > cutoffDate) return true;
                    }
                    
                    // Удаляем
                    removedCount++;
                    logger.info(`🗑️ Удалена неиспользуемая функция: ${feature.name}`);
                    return false;
                });
            }
            
            if (removedCount > 0) {
                await this.saveFeatures();
                logger.info(`✅ Очистка завершена. Удалено функций: ${removedCount}`);
            }
            
            return removedCount;
            
        } catch (error) {
            logger.error('Ошибка очистки каталога:', error);
            return 0;
        }
    }

    // Экспорт каталога в человекочитаемый формат
    async exportCatalog() {
        try {
            await this.loadFeatures();
            
            let markdown = '# Каталог функций для Telegram-ботов\n\n';
            markdown += `*Обновлено: ${new Date().toLocaleString('ru-RU')}*\n\n`;
            
            for (const [category, features] of Object.entries(this.features)) {
                if (features.length === 0) continue;
                
                markdown += `## ${this.getCategoryName(category)}\n\n`;
                
                features.forEach(feature => {
                    markdown += `### ${feature.name}\n`;
                    markdown += `${feature.description}\n`;
                    markdown += `- **Время:** ${feature.hours} часов\n`;
                    markdown += `- **Стоимость:** ${feature.cost.toLocaleString('ru-RU')} руб.\n`;
                    markdown += `- **Сложность:** ${this.getComplexityName(feature.complexity)}\n`;
                    if (feature.usageCount) {
                        markdown += `- **Использований:** ${feature.usageCount}\n`;
                    }
                    markdown += '\n';
                });
            }
            
            // Сохраняем в файл
            const exportPath = path.join(__dirname, '../data/features-catalog.md');
            await fs.writeFile(exportPath, markdown, 'utf8');
            
            logger.info('✅ Каталог экспортирован в features-catalog.md');
            return exportPath;
            
        } catch (error) {
            logger.error('Ошибка экспорта каталога:', error);
            return null;
        }
    }

    // Вспомогательные методы
    getCategoryName(category) {
        const names = {
            basic: 'Базовые функции',
            catalog: 'Каталог и товары',
            payments: 'Платежи',
            booking: 'Бронирование и запись',
            integrations: 'Интеграции',
            communication: 'Коммуникация',
            analytics: 'Аналитика',
            admin: 'Администрирование',
            special: 'Специальные функции',
            custom: 'Уникальные функции'
        };
        return names[category] || category;
    }

    getComplexityName(complexity) {
        const names = {
            low: 'Простая',
            medium: 'Средняя',
            high: 'Сложная'
        };
        return names[complexity] || complexity;
    }
}

module.exports = new FeaturesService();