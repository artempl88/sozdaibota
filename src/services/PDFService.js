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
        
        // Эмодзи для иконок
        this.icons = {
            money: '💰',
            time: '⏱️',
            calendar: '📅',
            user: '👤',
            work: '📋',
            chat: '💬',
            phone: '📱',
            email: '📧',
            telegram: '📱',
            benefit: '✅',
            step: '📍',
            company: '🤖',
            cost: '💲',
            complexity: '⚡',
            category: '📂',
            info: 'ℹ️',
            whatsapp: '📲'
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
                        '--disable-gpu',
                        '--font-render-hinting=none'
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
        @import url('https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', 'Segoe UI Emoji', 'Noto Color Emoji', 'Apple Color Emoji', -apple-system, BlinkMacSystemFont, sans-serif;
            line-height: 1.4;
            color: #222;
            background: #fff;
            font-size: 11px;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        
        /* Стили для эмодзи */
        .emoji {
            font-family: 'Segoe UI Emoji', 'Noto Color Emoji', 'Apple Color Emoji', sans-serif;
            font-size: 14px;
            display: inline-block;
            margin-right: 6px;
            vertical-align: middle;
        }
        
        .emoji-small {
            font-size: 12px;
            margin-right: 4px;
        }
        
        .header {
            background: linear-gradient(135deg, #0088CC 0%, #00C2FF 100%);
            color: white;
            padding: 20px 15px;
            position: relative;
            overflow: hidden;
        }
        
        .header::after {
            content: '';
            position: absolute;
            top: -25%;
            right: -5%;
            width: 150px;
            height: 150px;
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
            gap: 10px;
            margin-bottom: 15px;
        }
        
        .logo-icon {
            width: 35px;
            height: 35px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            border: 2px solid rgba(255, 255, 255, 0.3);
        }
        
        .company-name {
            font-size: 16px;
            font-weight: 700;
        }
        
        h1 {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 15px;
        }
        
        .header-subtitle {
            font-size: 11px;
            opacity: 0.95;
            margin-bottom: 10px;
        }
        
        .client-info {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            background: rgba(255, 255, 255, 0.1);
            padding: 15px;
            border-radius: 8px;
            margin-top: 15px;
        }
        
        .client-info-item {
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .client-info-item strong {
            font-weight: 600;
        }
        
        .section {
            padding: 15px;
        }
        
        .section-title {
            font-size: 14px;
            font-weight: 700;
            color: #0088CC;
            margin-bottom: 12px;
            padding-bottom: 6px;
            border-bottom: 1px solid #e3f2fd;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .total-box {
            background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
            color: white;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            margin: 15px;
        }
        
        .total-box h2 {
            margin-bottom: 8px;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        
        .total-amount {
            font-size: 20px;
            font-weight: 700;
            margin: 8px 0;
        }
        
        .total-details {
            font-size: 10px;
            opacity: 0.95;
        }
        
        .total-details div {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            margin: 2px 0;
        }
        
        .component {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 8px;
            page-break-inside: avoid;
        }
        
        .component-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 6px;
        }
        
        .component-name {
            font-weight: 600;
            color: #0088CC;
            font-size: 12px;
        }
        
        .component-cost {
            background: #4caf50;
            color: white;
            padding: 3px 8px;
            border-radius: 10px;
            font-weight: 600;
            font-size: 9px;
        }
        
        .component-description {
            color: #666;
            margin: 6px 0;
            font-size: 10px;
        }
        
        .component-details {
            display: flex;
            gap: 15px;
            font-size: 9px;
            color: #666;
            margin-top: 6px;
        }
        
        .component-details div {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .chat-history {
            background: #f8f9fa;
            padding: 12px;
            border-radius: 6px;
        }
        
        .message {
            margin: 8px 0;
            padding: 8px;
            border-radius: 6px;
            max-width: 85%;
        }
        
        .message.user {
            background: #e3f2fd;
            margin-left: auto;
            border-bottom-right-radius: 2px;
        }
        
        .message.assistant {
            background: white;
            border: 1px solid #e9ecef;
            margin-right: auto;
            border-bottom-left-radius: 2px;
        }
        
        .message-header {
            font-weight: 600;
            color: #0088CC;
            margin-bottom: 4px;
            font-size: 10px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .message-content {
            font-size: 10px;
            line-height: 1.4;
        }
        
        .message-time {
            font-size: 8px;
            color: #999;
            margin-top: 3px;
        }
        
        .footer {
            margin-top: 20px;
            padding: 12px 15px;
            background: #f8f9fa;
            font-size: 9px;
            color: #666;
            text-align: center;
        }
        
        .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 6px;
            font-size: 8px;
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
                <div class="logo-icon">${this.icons.company}</div>
                <div class="company-name">Создать Бота</div>
            </div>
            <h1>Смета проекта и история переговоров</h1>
            <div class="header-subtitle">Разработка умных Telegram-ботов</div>
            <div class="client-info">
                <div class="client-info-item"><span class="emoji">${this.icons.user}</span> <strong>Клиент:</strong> ${this.escapeHtml(clientInfo?.name || 'Не указано')}</div>
                <div class="client-info-item"><span class="emoji">${this.icons.work}</span> <strong>Должность:</strong> ${this.escapeHtml(clientInfo?.position || 'Не указано')}</div>
                <div class="client-info-item"><span class="emoji">${this.icons.category}</span> <strong>Отрасль:</strong> ${this.escapeHtml(clientInfo?.industry || 'Не указано')}</div>
                <div class="client-info-item"><span class="emoji">${this.icons.money}</span> <strong>Бюджет:</strong> ${this.escapeHtml(clientInfo?.budget || 'Не указано')}</div>
                <div class="client-info-item"><span class="emoji">${this.icons.calendar}</span> <strong>Сроки:</strong> ${this.escapeHtml(clientInfo?.timeline || 'Не указано')}</div>
                <div class="client-info-item"><span class="emoji">${this.icons.calendar}</span> <strong>Дата:</strong> ${currentDate}</div>
                ${this.generateContactsHTML(clientInfo?.contacts)}
            </div>
        </div>
    </div>
    
    ${this.generateEstimateSection(estimate)}
    
    <div class="section">
        <h2 class="section-title">
            <span class="emoji">${this.icons.chat}</span>
            История диалога с клиентом
        </h2>
        <div class="chat-history">
            ${this.generateChatHistoryHTML(session)}
        </div>
    </div>
    
    <div class="footer">
        <p><strong>Создать Бота</strong> - Разработка умных Telegram-ботов</p>
        <p>Email: hello@создать-бота.рф | Сайт: создать-бота.рф | ID сессии: ${sessionId}</p>
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
        @import url('https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', 'Segoe UI Emoji', 'Noto Color Emoji', 'Apple Color Emoji', -apple-system, BlinkMacSystemFont, sans-serif;
            line-height: 1.4;
            color: #222;
            background: #fff;
            font-size: 11px;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        
        /* Стили для эмодзи */
        .emoji {
            font-family: 'Segoe UI Emoji', 'Noto Color Emoji', 'Apple Color Emoji', sans-serif;
            font-size: 16px;
            display: inline-block;
            margin-right: 6px;
            vertical-align: middle;
        }
        
        .emoji-small {
            font-size: 12px;
            margin-right: 4px;
        }
        
        .header {
            background: linear-gradient(135deg, #0088CC 0%, #00C2FF 100%);
            color: white;
            padding: 20px 15px;
            position: relative;
            overflow: hidden;
        }
        
        .header::after {
            content: '';
            position: absolute;
            top: -25%;
            right: -5%;
            width: 150px;
            height: 150px;
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
            gap: 10px;
            margin-bottom: 15px;
        }
        
        .logo-icon {
            width: 35px;
            height: 35px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            border: 2px solid rgba(255, 255, 255, 0.3);
        }
        
        .company-name {
            font-size: 16px;
            font-weight: 700;
        }
        
        h1 {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 15px;
        }
        
        .client-greeting {
            background: rgba(255, 255, 255, 0.15);
            padding: 12px 20px;
            border-radius: 8px;
            margin-top: 15px;
            font-size: 13px;
        }
        
        .section {
            padding: 15px;
        }
        
        .section-title {
            font-size: 14px;
            font-weight: 700;
            color: #0088CC;
            margin-bottom: 12px;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        
        .total-box {
            background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
            color: white;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            margin: 15px;
        }
        
        .total-box h2 {
            margin-bottom: 8px;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        
        .total-amount {
            font-size: 20px;
            font-weight: 700;
            margin: 8px 0;
        }
        
        .total-details {
            font-size: 10px;
            opacity: 0.95;
            line-height: 1.4;
        }
        
        .total-details div {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            margin: 2px 0;
        }
        
        .components-grid {
            display: grid;
            gap: 12px;
            margin-top: 15px;
        }
        
        .component {
            background: white;
            border: 1px solid #e3f2fd;
            border-radius: 8px;
            padding: 12px;
            page-break-inside: avoid;
        }
        
        .component-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        
        .component-number {
            background: #e3f2fd;
            color: #0088CC;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 10px;
        }
        
        .component-name {
            flex: 1;
            font-weight: 600;
            color: #222;
            font-size: 13px;
            margin: 0 8px;
        }
        
        .component-cost {
            background: #4caf50;
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-weight: 700;
            font-size: 11px;
        }
        
        .component-description {
            color: #666;
            margin: 8px 0;
            font-size: 11px;
            line-height: 1.4;
        }
        
        .component-details {
            display: flex;
            gap: 15px;
            font-size: 10px;
            color: #666;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid #f0f0f0;
        }
        
        .component-details div {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .benefits {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 12px;
            margin: 20px 0;
        }
        
        .benefits-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-top: 15px;
        }
        
        .benefit-item {
            display: flex;
            align-items: start;
            gap: 8px;
        }
        
        .benefit-icon {
            width: 25px;
            height: 25px;
            background: #e3f2fd;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 14px;
        }
        
        .benefit-text {
            font-size: 11px;
            line-height: 1.4;
        }
        
        .next-steps {
            background: linear-gradient(135deg, #e3f2fd 0%, #e8f5e9 100%);
            padding: 20px;
            border-radius: 12px;
            margin: 20px 0;
        }
        
        .steps-list {
            display: grid;
            gap: 10px;
            margin-top: 15px;
        }
        
        .step-item {
            display: flex;
            align-items: center;
            gap: 12px;
            background: white;
            padding: 12px;
            border-radius: 8px;
        }
        
        .step-number {
            width: 25px;
            height: 25px;
            background: #0088CC;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 11px;
            flex-shrink: 0;
        }
        
        .step-text {
            font-size: 11px;
            line-height: 1.4;
        }
        
        .footer {
            background: #222;
            color: white;
            padding: 20px;
            text-align: center;
            font-size: 10px;
        }
        
        .footer-logo {
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 10px;
        }
        
        .footer-contacts {
            line-height: 1.6;
            opacity: 0.9;
        }
        
        .footer-contacts a {
            color: #84F0F5;
            text-decoration: none;
        }
        
        .footer-contacts p {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            margin: 2px 0;
        }
        
        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 8px;
            font-size: 9px;
            font-weight: 600;
        }
        
        .badge-low { background: #e8f5e8; color: #2e7d32; }
        .badge-medium { background: #fff3e0; color: #f57c00; }
        .badge-high { background: #fce4ec; color: #c2185b; }
        
        @media print {
            .header { page-break-after: avoid; }
            .component { page-break-inside: avoid; }
            .total-box { page-break-inside: avoid; }
            .step-item { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <div class="logo">
                <div class="logo-icon">${this.icons.company}</div>
                <div class="company-name">Создать Бота</div>
            </div>
            <h1>Коммерческое предложение</h1>
            <p class="header-subtitle">Разработка интеллектуального Telegram-бота для вашего бизнеса</p>
            ${clientInfo?.name ? `<div class="client-greeting">${this.icons.user} Специально для ${this.escapeHtml(clientInfo.name)}</div>` : ''}
        </div>
    </div>
    
    ${this.generateEstimateSection(estimate, true)}
    
    <div class="section">
        <div class="benefits">
            <h2 class="section-title">
                <span class="emoji">${this.icons.benefit}</span>
                Преимущества работы с нами
            </h2>
            <div class="benefits-grid">
                <div class="benefit-item">
                    <div class="benefit-icon">⚡</div>
                    <div class="benefit-text">
                        <strong>Быстрый запуск</strong><br>
                        Базовый бот за 1 день, полный проект за ${estimate?.timeline || '2-3 недели'}
                    </div>
                </div>
                <div class="benefit-item">
                    <div class="benefit-icon">🤖</div>
                    <div class="benefit-text">
                        <strong>Интеграция с ИИ</strong><br>
                        ChatGPT, Claude и другие нейросети для умных диалогов
                    </div>
                </div>
                <div class="benefit-item">
                    <div class="benefit-icon">🛠️</div>
                    <div class="benefit-text">
                        <strong>Поддержка 24/7</strong><br>
                        Техническая поддержка и обновления после запуска
                    </div>
                </div>
                <div class="benefit-item">
                    <div class="benefit-icon">✅</div>
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
            <h2 class="section-title">
                <span class="emoji">${this.icons.work}</span>
                Следующие шаги
            </h2>
            <div class="steps-list">
                <div class="step-item">
                    <div class="step-number">1</div>
                    <div class="step-text">
                        <strong>Согласование деталей</strong> - Обсуждаем финальные требования и утверждаем техническое задание
                    </div>
                </div>
                <div class="step-item">
                    <div class="step-number">2</div>
                    <div class="step-text">
                        <strong>Подписание договора</strong> - Заключаем договор и вносите предоплату 50%
                    </div>
                </div>
                <div class="step-item">
                    <div class="step-number">3</div>
                    <div class="step-text">
                        <strong>Разработка</strong> - Создаем вашего бота с регулярными демонстрациями прогресса
                    </div>
                </div>
                <div class="step-item">
                    <div class="step-number">4</div>
                    <div class="step-text">
                        <strong>Запуск и обучение</strong> - Запускаем бота и обучаем вашу команду работе с ним
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <div class="footer">
        <div class="footer-logo">Создать Бота</div>
        <div class="footer-contacts">
            <p>Свяжитесь с нами удобным способом:</p>
            <p><span class="emoji-small">${this.icons.email}</span> Email: <a href="mailto:hello@создать-бота.рф">hello@создать-бота.рф</a></p>
            <p><span class="emoji-small">${this.icons.telegram}</span> Telegram: <a href="https://t.me/создать_бота">@создать_бота</a></p>
            <p><span class="emoji-small">${this.icons.info}</span> Сайт: <a href="https://создать-бота.рф">создать-бота.рф</a></p>
            <p style="margin-top: 10px; opacity: 0.7;">
                Предложение действительно в течение 14 дней | ID: ${sessionId} | ${currentDate}
            </p>
        </div>
    </div>
</body>
</html>`;
    }

    // Генерация секции сметы
    generateEstimateSection(estimate, isForClient = false) {
        if (!estimate) return '';
        
        const title = isForClient ? 'Стоимость разработки' : 'Расчет стоимости проекта';
        
        let html = `
    <div class="total-box">
        <h2>
            <span class="emoji">${this.icons.money}</span>
            ${title}
        </h2>
        <div class="total-amount">${this.formatPrice(estimate.totalCost)} ₽</div>
        <div class="total-details">
            <div><span class="emoji-small">${this.icons.time}</span> Общее время разработки: ${estimate.totalHours || 0} часов</div>
            <div><span class="emoji-small">${this.icons.calendar}</span> Срок реализации: ${estimate.timeline || '2-3 недели'}</div>
            <div><span class="emoji-small">${this.icons.benefit}</span> Включена гарантия и поддержка 3 месяца</div>
        </div>
    </div>
    
    <div class="section">
        <h2 class="section-title">
            <span class="emoji">${this.icons.work}</span>
            Состав работ
        </h2>
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
                    <div><span class="emoji-small">${this.icons.time}</span> <strong>Время:</strong> ${component.hours || 0} ч.</div>
                    <div><span class="emoji-small">${this.icons.complexity}</span> <strong>Сложность:</strong> ${complexityBadge}</div>
                    <div><span class="emoji-small">${this.icons.category}</span> <strong>Категория:</strong> ${this.getCategoryName(component.category)}</div>
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
            html += `<div class="client-info-item"><span class="emoji">${this.icons.telegram}</span> <strong>Telegram:</strong> ${this.escapeHtml(contacts.Telegram || contacts.telegram)}</div>`;
        }
        if (contacts.Email || contacts.email) {
            html += `<div class="client-info-item"><span class="emoji">${this.icons.email}</span> <strong>Email:</strong> ${this.escapeHtml(contacts.Email || contacts.email)}</div>`;
        }
        if (contacts['Телефон'] || contacts.phone) {
            html += `<div class="client-info-item"><span class="emoji">${this.icons.phone}</span> <strong>Телефон:</strong> ${this.escapeHtml(contacts['Телефон'] || contacts.phone)}</div>`;
        }
        if (contacts.WhatsApp || contacts.whatsapp) {
            html += `<div class="client-info-item"><span class="emoji">${this.icons.whatsapp}</span> <strong>WhatsApp:</strong> ${this.escapeHtml(contacts.WhatsApp || contacts.whatsapp)}</div>`;
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
            <div class="message-header">
                <span class="emoji-small">${isUser ? this.icons.user : this.icons.chat}</span>
                ${isUser ? 'Клиент' : 'Консультант'}
            </div>
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