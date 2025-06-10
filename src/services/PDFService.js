// src/services/PDFService.js
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');

class PDFService {
    constructor() {
        this.browser = null;
        this.brandColors = {
            primary: '#0088CC',
            secondary: '#00C2FF',
            gradient: 'linear-gradient(135deg, #0088CC 0%, #00C2FF 100%)',
            dark: '#222222',
            light: '#666666',
            success: '#4caf50',
            background: '#f8f9fa'
        };
    }

    async initBrowser() {
        if (!this.browser) {
            try {
                this.browser = await puppeteer.launch({
                    headless: 'new',
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--disable-gpu'
                    ]
                });
                logger.info('✅ Puppeteer browser инициализирован');
            } catch (error) {
                logger.error('❌ Ошибка инициализации Puppeteer:', error);
                throw error;
            }
        }
        return this.browser;
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    // Генерация PDF со сметой для менеджера (с историей диалога)
    async generateManagerPDF(estimate, session, clientInfo, sessionId) {
        try {
            logger.info('📄 Генерируем PDF для менеджера с историей диалога');
            
            const browser = await this.initBrowser();
            const page = await browser.newPage();
            
            // Генерируем HTML контент
            const html = this.generateManagerHTML(estimate, session, clientInfo, sessionId);
            
            await page.setContent(html, { waitUntil: 'networkidle0' });
            
            // Генерируем PDF
            const pdfPath = path.join(os.tmpdir(), `manager_estimate_${sessionId}_${Date.now()}.pdf`);
            await page.pdf({
                path: pdfPath,
                format: 'A4',
                printBackground: true,
                preferCSSPageSize: true,
                displayHeaderFooter: false,
                margin: {
                    top: '20mm',
                    right: '15mm',
                    bottom: '20mm',
                    left: '15mm'
                }
            });
            
            await page.close();
            
            logger.info('✅ PDF для менеджера сгенерирован:', pdfPath);
            return pdfPath;
            
        } catch (error) {
            logger.error('❌ Ошибка генерации PDF для менеджера:', error);
            throw error;
        }
    }

    // Генерация PDF со сметой для клиента (без истории диалога)
    async generateClientPDF(estimate, clientInfo, sessionId) {
        try {
            logger.info('📄 Генерируем PDF для клиента (только смета)');
            
            const browser = await this.initBrowser();
            const page = await browser.newPage();
            
            // Генерируем HTML контент
            const html = this.generateClientHTML(estimate, clientInfo, sessionId);
            
            await page.setContent(html, { waitUntil: 'networkidle0' });
            
            // Генерируем PDF
            const pdfPath = path.join(os.tmpdir(), `client_estimate_${sessionId}_${Date.now()}.pdf`);
            await page.pdf({
                path: pdfPath,
                format: 'A4',
                printBackground: true,
                preferCSSPageSize: true,
                displayHeaderFooter: false,
                margin: {
                    top: '20mm',
                    right: '15mm',
                    bottom: '20mm',
                    left: '15mm'
                }
            });
            
            await page.close();
            
            logger.info('✅ PDF для клиента сгенерирован:', pdfPath);
            return pdfPath;
            
        } catch (error) {
            logger.error('❌ Ошибка генерации PDF для клиента:', error);
            throw error;
        }
    }

    // HTML для менеджера (с историей диалога)
    generateManagerHTML(estimate, session, clientInfo, sessionId) {
        const currentDate = new Date().toLocaleString('ru-RU');
        
        return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Смета и история диалога - ${clientInfo?.name || sessionId}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            line-height: 1.6;
            color: #222;
            background: #fff;
        }
        
        .header {
            background: linear-gradient(135deg, #0088CC 0%, #00C2FF 100%);
            color: white;
            padding: 40px 30px;
            position: relative;
            overflow: hidden;
        }
        
        .header::after {
            content: '';
            position: absolute;
            top: -50%;
            right: -10%;
            width: 300px;
            height: 300px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 50%;
        }
        
        .header-content {
            position: relative;
            z-index: 1;
        }
        
        .logo {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .logo-icon {
            width: 50px;
            height: 50px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }
        
        .company-name {
            font-size: 24px;
            font-weight: 700;
        }
        
        h1 {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 20px;
        }
        
        .client-info {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            background: rgba(255, 255, 255, 0.1);
            padding: 20px;
            border-radius: 12px;
            margin-top: 20px;
        }
        
        .client-info-item {
            font-size: 14px;
        }
        
        .client-info-item strong {
            font-weight: 600;
        }
        
        .section {
            padding: 30px;
        }
        
        .section-title {
            font-size: 22px;
            font-weight: 700;
            color: #0088CC;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e3f2fd;
        }
        
        .total-box {
            background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
            color: white;
            padding: 30px;
            border-radius: 16px;
            text-align: center;
            margin: 30px;
        }
        
        .total-box h2 {
            margin-bottom: 15px;
            font-size: 24px;
        }
        
        .total-amount {
            font-size: 36px;
            font-weight: 700;
            margin: 15px 0;
        }
        
        .total-details {
            font-size: 16px;
            opacity: 0.95;
        }
        
        .component {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 15px;
            page-break-inside: avoid;
        }
        
        .component-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 10px;
        }
        
        .component-name {
            font-weight: 600;
            color: #0088CC;
            font-size: 16px;
        }
        
        .component-cost {
            background: #4caf50;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-weight: 600;
        }
        
        .component-description {
            color: #666;
            margin: 10px 0;
            font-size: 14px;
        }
        
        .component-details {
            display: flex;
            gap: 30px;
            font-size: 14px;
            color: #666;
            margin-top: 10px;
        }
        
        .chat-history {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 12px;
        }
        
        .message {
            margin: 15px 0;
            padding: 15px;
            border-radius: 12px;
            max-width: 80%;
        }
        
        .message.user {
            background: #e3f2fd;
            margin-left: auto;
            border-bottom-right-radius: 4px;
        }
        
        .message.assistant {
            background: white;
            border: 1px solid #e9ecef;
            margin-right: auto;
            border-bottom-left-radius: 4px;
        }
        
        .message-header {
            font-weight: 600;
            color: #0088CC;
            margin-bottom: 8px;
            font-size: 14px;
        }
        
        .message-content {
            font-size: 14px;
            line-height: 1.6;
        }
        
        .message-time {
            font-size: 12px;
            color: #999;
            margin-top: 5px;
        }
        
        .footer {
            margin-top: 40px;
            padding: 20px 30px;
            background: #f8f9fa;
            font-size: 12px;
            color: #666;
            text-align: center;
        }
        
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }
        
        .badge-low { background: #e8f5e8; color: #2e7d32; }
        .badge-medium { background: #fff3e0; color: #f57c00; }
        .badge-high { background: #fce4ec; color: #c2185b; }
        
        @media print {
            .header { page-break-after: avoid; }
            .component { page-break-inside: avoid; }
            .message { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <div class="logo">
                <div class="logo-icon">🤖</div>
                <div class="company-name">Создать Бота</div>
            </div>
            <h1>📊 Смета проекта и история переговоров</h1>
            <div class="client-info">
                <div class="client-info-item"><strong>👤 Клиент:</strong> ${this.escapeHtml(clientInfo?.name || 'Не указано')}</div>
                <div class="client-info-item"><strong>💼 Должность:</strong> ${this.escapeHtml(clientInfo?.position || 'Не указано')}</div>
                <div class="client-info-item"><strong>🏢 Отрасль:</strong> ${this.escapeHtml(clientInfo?.industry || 'Не указано')}</div>
                <div class="client-info-item"><strong>💰 Бюджет:</strong> ${this.escapeHtml(clientInfo?.budget || 'Не указано')}</div>
                <div class="client-info-item"><strong>⏱ Сроки:</strong> ${this.escapeHtml(clientInfo?.timeline || 'Не указано')}</div>
                <div class="client-info-item"><strong>📅 Дата:</strong> ${currentDate}</div>
                ${this.generateContactsHTML(clientInfo?.contacts)}
            </div>
        </div>
    </div>
    
    ${this.generateEstimateSection(estimate)}
    
    <div class="section">
        <h2 class="section-title">💬 История диалога с клиентом</h2>
        <div class="chat-history">
            ${this.generateChatHistoryHTML(session)}
        </div>
    </div>
    
    <div class="footer">
        <p><strong>Создать Бота</strong> - Разработка умных Telegram-ботов</p>
        <p>📧 hello@создать-бота.рф | 🌐 создать-бота.рф | ID сессии: ${sessionId}</p>
    </div>
</body>
</html>`;
    }

    // HTML для клиента (только смета)
    generateClientHTML(estimate, clientInfo, sessionId) {
        const currentDate = new Date().toLocaleString('ru-RU');
        
        return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Коммерческое предложение - ${clientInfo?.name || 'Telegram бот'}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            line-height: 1.6;
            color: #222;
            background: #fff;
        }
        
        .header {
            background: linear-gradient(135deg, #0088CC 0%, #00C2FF 100%);
            color: white;
            padding: 60px 40px;
            position: relative;
            overflow: hidden;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: -100px;
            right: -100px;
            width: 400px;
            height: 400px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 50%;
        }
        
        .header::after {
            content: '';
            position: absolute;
            bottom: -150px;
            left: -100px;
            width: 300px;
            height: 300px;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 50%;
        }
        
        .header-content {
            position: relative;
            z-index: 1;
            text-align: center;
        }
        
        .logo {
            display: inline-flex;
            align-items: center;
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .logo-icon {
            width: 80px;
            height: 80px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        }
        
        .company-name {
            font-size: 32px;
            font-weight: 700;
        }
        
        h1 {
            font-size: 36px;
            font-weight: 700;
            margin-bottom: 20px;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .header-subtitle {
            font-size: 18px;
            opacity: 0.95;
            max-width: 600px;
            margin: 0 auto;
        }
        
        .client-greeting {
            background: rgba(255, 255, 255, 0.15);
            padding: 20px 30px;
            border-radius: 16px;
            margin-top: 30px;
            font-size: 18px;
        }
        
        .section {
            padding: 40px;
        }
        
        .section-title {
            font-size: 28px;
            font-weight: 700;
            color: #0088CC;
            margin-bottom: 30px;
            text-align: center;
        }
        
        .total-box {
            background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
            color: white;
            padding: 40px;
            border-radius: 20px;
            text-align: center;
            margin: 40px auto;
            max-width: 600px;
            box-shadow: 0 10px 40px rgba(76, 175, 80, 0.3);
        }
        
        .total-box h2 {
            margin-bottom: 20px;
            font-size: 28px;
        }
        
        .total-amount {
            font-size: 48px;
            font-weight: 700;
            margin: 20px 0;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .total-details {
            font-size: 18px;
            opacity: 0.95;
            line-height: 1.8;
        }
        
        .components-grid {
            display: grid;
            gap: 20px;
            margin-top: 30px;
        }
        
        .component {
            background: white;
            border: 2px solid #e3f2fd;
            border-radius: 16px;
            padding: 25px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
        }
        
        .component:hover {
            border-color: #0088CC;
            box-shadow: 0 5px 20px rgba(0, 136, 204, 0.1);
        }
        
        .component-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .component-number {
            background: #e3f2fd;
            color: #0088CC;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 14px;
        }
        
        .component-name {
            flex: 1;
            font-weight: 600;
            color: #222;
            font-size: 18px;
            margin: 0 15px;
        }
        
        .component-cost {
            background: #4caf50;
            color: white;
            padding: 8px 20px;
            border-radius: 25px;
            font-weight: 700;
            font-size: 16px;
        }
        
        .component-description {
            color: #666;
            margin: 15px 0;
            font-size: 15px;
            line-height: 1.7;
        }
        
        .component-details {
            display: flex;
            gap: 30px;
            font-size: 14px;
            color: #666;
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #f0f0f0;
        }
        
        .benefits {
            background: #f8f9fa;
            padding: 40px;
            border-radius: 20px;
            margin: 40px 0;
        }
        
        .benefits-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 25px;
            margin-top: 25px;
        }
        
        .benefit-item {
            display: flex;
            align-items: start;
            gap: 15px;
        }
        
        .benefit-icon {
            width: 40px;
            height: 40px;
            background: #e3f2fd;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 20px;
        }
        
        .benefit-text {
            font-size: 15px;
            line-height: 1.6;
        }
        
        .next-steps {
            background: linear-gradient(135deg, #e3f2fd 0%, #e8f5e9 100%);
            padding: 40px;
            border-radius: 20px;
            margin: 40px 0;
        }
        
        .steps-list {
            display: grid;
            gap: 20px;
            margin-top: 25px;
        }
        
        .step-item {
            display: flex;
            align-items: center;
            gap: 20px;
            background: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
        }
        
        .step-number {
            width: 50px;
            height: 50px;
            background: #0088CC;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 20px;
            flex-shrink: 0;
        }
        
        .footer {
            background: #222;
            color: white;
            padding: 50px 40px;
            text-align: center;
        }
        
        .footer-logo {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 20px;
        }
        
        .footer-contacts {
            font-size: 16px;
            line-height: 2;
            opacity: 0.9;
        }
        
        .footer-contacts a {
            color: #84F0F5;
            text-decoration: none;
        }
        
        .badge {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 15px;
            font-size: 13px;
            font-weight: 600;
        }
        
        .badge-low { background: #e8f5e8; color: #2e7d32; }
        .badge-medium { background: #fff3e0; color: #f57c00; }
        .badge-high { background: #fce4ec; color: #c2185b; }
        
        @media print {
            .header { page-break-after: avoid; }
            .component { page-break-inside: avoid; }
            .total-box { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <div class="logo">
                <div class="logo-icon">🤖</div>
                <div class="company-name">Создать Бота</div>
            </div>
            <h1>Коммерческое предложение</h1>
            <p class="header-subtitle">Разработка интеллектуального Telegram-бота для вашего бизнеса</p>
            ${clientInfo?.name ? `<div class="client-greeting">Специально для ${this.escapeHtml(clientInfo.name)}</div>` : ''}
        </div>
    </div>
    
    ${this.generateEstimateSection(estimate, true)}
    
    <div class="section">
        <div class="benefits">
            <h2 class="section-title">🎯 Преимущества работы с нами</h2>
            <div class="benefits-grid">
                <div class="benefit-item">
                    <div class="benefit-icon">⚡</div>
                    <div class="benefit-text">
                        <strong>Быстрый запуск</strong><br>
                        Базовый бот за 1 день, полный проект за ${estimate?.timeline || '2-3 недели'}
                    </div>
                </div>
                <div class="benefit-item">
                    <div class="benefit-icon">🧠</div>
                    <div class="benefit-text">
                        <strong>Интеграция с ИИ</strong><br>
                        ChatGPT, Claude и другие нейросети для умных диалогов
                    </div>
                </div>
                <div class="benefit-item">
                    <div class="benefit-icon">🔧</div>
                    <div class="benefit-text">
                        <strong>Поддержка 24/7</strong><br>
                        Техническая поддержка и обновления после запуска
                    </div>
                </div>
                <div class="benefit-item">
                    <div class="benefit-icon">💎</div>
                    <div class="benefit-text">
                        <strong>Гарантия качества</strong><br>
                        Тестирование всех функций перед запуском
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <div class="section">
        <div class="next-steps">
            <h2 class="section-title">📋 Следующие шаги</h2>
            <div class="steps-list">
                <div class="step-item">
                    <div class="step-number">1</div>
                    <div>
                        <strong>Согласование деталей</strong><br>
                        Обсуждаем финальные требования и утверждаем техническое задание
                    </div>
                </div>
                <div class="step-item">
                    <div class="step-number">2</div>
                    <div>
                        <strong>Подписание договора</strong><br>
                        Заключаем договор и вносите предоплату 50%
                    </div>
                </div>
                <div class="step-item">
                    <div class="step-number">3</div>
                    <div>
                        <strong>Разработка</strong><br>
                        Создаем вашего бота с регулярными демонстрациями прогресса
                    </div>
                </div>
                <div class="step-item">
                    <div class="step-number">4</div>
                    <div>
                        <strong>Запуск и обучение</strong><br>
                        Запускаем бота и обучаем вашу команду работе с ним
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <div class="footer">
        <div class="footer-logo">🤖 Создать Бота</div>
        <div class="footer-contacts">
            <p>Свяжитесь с нами удобным способом:</p>
            <p>📧 Email: <a href="mailto:hello@создать-бота.рф">hello@создать-бота.рф</a></p>
            <p>💬 Telegram: <a href="https://t.me/создать_бота">@создать_бота</a></p>
            <p>🌐 Сайт: <a href="https://создать-бота.рф">создать-бота.рф</a></p>
            <p style="margin-top: 20px; font-size: 14px; opacity: 0.7;">
                Предложение действительно в течение 14 дней<br>
                ID: ${sessionId} | ${currentDate}
            </p>
        </div>
    </div>
</body>
</html>`;
    }

    // Генерация секции сметы
    generateEstimateSection(estimate, isForClient = false) {
        if (!estimate) return '';
        
        const title = isForClient ? '💰 Стоимость разработки' : '💰 Расчет стоимости проекта';
        
        let html = `
    <div class="total-box">
        <h2>${title}</h2>
        <div class="total-amount">${this.formatPrice(estimate.totalCost)} ₽</div>
        <div class="total-details">
            ⏱️ Общее время разработки: ${estimate.totalHours || 0} часов<br>
            📅 Срок реализации: ${estimate.timeline || '2-3 недели'}<br>
            💎 Включена гарантия и поддержка 3 месяца
        </div>
    </div>
    
    <div class="section">
        <h2 class="section-title">📋 Состав работ</h2>
        <div class="components-grid">`;
        
        if (estimate.components && estimate.components.length > 0) {
            estimate.components.forEach((component, index) => {
                const complexityBadge = this.getComplexityBadge(component.complexity);
                
                html += `
            <div class="component">
                <div class="component-header">
                    ${isForClient ? `<div class="component-number">${index + 1}</div>` : ''}
                    <div class="component-name">${this.escapeHtml(component.name || 'Без названия')}</div>
                    <div class="component-cost">${this.formatPrice(component.cost)} ₽</div>
                </div>
                <div class="component-description">${this.escapeHtml(component.description || '')}</div>
                <div class="component-details">
                    <div><strong>⏱️ Время:</strong> ${component.hours || 0} ч.</div>
                    <div><strong>🎯 Сложность:</strong> ${complexityBadge}</div>
                    <div><strong>📁 Категория:</strong> ${this.getCategoryName(component.category)}</div>
                </div>
            </div>`;
            });
        }
        
        html += `
        </div>
    </div>`;
        
        return html;
    }

    // Генерация HTML контактов
    generateContactsHTML(contacts) {
        if (!contacts) return '';
        
        let html = '';
        if (contacts.Telegram || contacts.telegram) {
            html += `<div class="client-info-item"><strong>💬 Telegram:</strong> ${this.escapeHtml(contacts.Telegram || contacts.telegram)}</div>`;
        }
        if (contacts.Email || contacts.email) {
            html += `<div class="client-info-item"><strong>📧 Email:</strong> ${this.escapeHtml(contacts.Email || contacts.email)}</div>`;
        }
        if (contacts['Телефон'] || contacts.phone) {
            html += `<div class="client-info-item"><strong>📱 Телефон:</strong> ${this.escapeHtml(contacts['Телефон'] || contacts.phone)}</div>`;
        }
        if (contacts.WhatsApp || contacts.whatsapp) {
            html += `<div class="client-info-item"><strong>📱 WhatsApp:</strong> ${this.escapeHtml(contacts.WhatsApp || contacts.whatsapp)}</div>`;
        }
        
        return html;
    }

    // Генерация истории чата
    generateChatHistoryHTML(session) {
        if (!session || !session.chatHistory || session.chatHistory.length === 0) {
            return '<p style="text-align: center; color: #999;">История диалога пуста</p>';
        }
        
        let html = '';
        session.chatHistory.forEach(msg => {
            const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString('ru-RU') : '';
            const isUser = msg.role === 'user';
            
            html += `
        <div class="message ${isUser ? 'user' : 'assistant'}">
            <div class="message-header">${isUser ? '👤 Клиент' : '🤖 Консультант'}</div>
            <div class="message-content">${this.escapeHtml(msg.content)}</div>
            ${timestamp ? `<div class="message-time">${timestamp}</div>` : ''}
        </div>`;
        });
        
        return html;
    }

    // Вспомогательные методы
    formatPrice(price) {
        if (!price || isNaN(price)) return '0';
        return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    escapeHtml(text) {
        if (!text) return '';
        return text
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    getComplexityBadge(complexity) {
        const badges = {
            'low': '<span class="badge badge-low">Низкая</span>',
            'medium': '<span class="badge badge-medium">Средняя</span>',
            'high': '<span class="badge badge-high">Высокая</span>',
            'very_high': '<span class="badge badge-high">Очень высокая</span>'
        };
        
        return badges[complexity] || '<span class="badge badge-medium">Средняя</span>';
    }

    getCategoryName(category) {
        const names = {
            'basic': 'Базовый функционал',
            'catalog': 'Каталог и товары',
            'payments': 'Платежи',
            'booking': 'Бронирование',
            'integrations': 'Интеграции',
            'communication': 'Коммуникация',
            'analytics': 'Аналитика',
            'admin': 'Администрирование',
            'custom': 'Кастомный функционал'
        };
        
        return names[category] || category || 'Другое';
    }

    // Очистка временных файлов
    async cleanupTempFiles(filePaths) {
        for (const filePath of filePaths) {
            try {
                await fs.unlink(filePath);
                logger.info('🗑️ Временный файл удален:', filePath);
            } catch (error) {
                logger.warn('Не удалось удалить временный файл:', filePath, error.message);
            }
        }
    }
}

module.exports = new PDFService();