// Скрипт для исправления логики ценообразования
const fs = require('fs');

console.log('🔧 Исправляем логику ценообразования...');

let content = fs.readFileSync('server.js', 'utf8');

// 1. Убираем быстрые шаблоны из обычного API (строки 839-868)
const quickTaskPattern = /\/\/ Проверяем, можем ли дать мгновенный ответ\s*const quickTask = analyzeQuickTask\(message\);[\s\S]*?return res\.json\([\s\S]*?\}\);[\s\S]*?\}/;

content = content.replace(quickTaskPattern, `// УБИРАЕМ БЫСТРЫЕ ШАБЛОНЫ - ВСЕГДА СЧИТАЕМ ПО РЕАЛЬНЫМ РАСЦЕНКАМ
        // Теперь всегда используем точный расчет по PRICING_SYSTEM`);

// 2. Убираем быстрые шаблоны из голосового API (строки 1590-1609)
const voiceQuickTaskPattern = /\/\/ Проверяем, можем ли дать мгновенный ответ\s*const quickTask = analyzeQuickTask\(transcription\);[\s\S]*?return res\.json\([\s\S]*?\}\);[\s\S]*?\}/;

const voiceReplacement = `// УБИРАЕМ БЫСТРЫЕ ШАБЛОНЫ ДЛЯ ГОЛОСА - ВСЕГДА СЧИТАЕМ ПО РЕАЛЬНЫМ РАСЦЕНКАМ
        // Если клиент описывает бизнес - сразу делаем расчет
        const businessKeywords = /магазин|монтаж|сервис|салон|доставк|автосервис|шиномонтаж|цветочн|кафе|ресторан|такси|клиник|школ|курс/i;
        
        if (businessKeywords.test(transcription) || parsedConversation.length >= 1) {
            console.log('💰 Анализируем потребности и рассчитываем по PRICING_SYSTEM...');
            
            try {
                const allMessages = [...parsedConversation, { role: 'user', content: transcription }];
                const fullText = allMessages.map(m => m.content).join(' ');
                
                const estimate = await calculateProjectEstimate(fullText, parsedConversation);
                
                await sendEstimateToTelegram(estimate, sessionId);
                
                if (sessionId && Conversation) {
                    await Conversation.findOneAndUpdate(
                        { sessionId },
                        { 
                            estimate: estimate,
                            estimatedAt: new Date()
                        }
                    );
                }
                
                console.log('✅ Смета рассчитана по реальным расценкам:', estimate.totalCost, 'руб.');
                
                return res.json({
                    success: true,
                    transcription: transcription,
                    message: formatEstimateMessage(estimate),
                    estimate: estimate,
                    isVoiceInput: true,
                    quickReplies: [
                        '📞 Обсудить детали',
                        '✏️ Добавить функции', 
                        '✅ Утвердить смету',
                        '📄 Получить в PDF'
                    ]
                });
                
            } catch (estimateError) {
                console.error('❌ Ошибка расчета сметы:', estimateError.message);
            }
        }`;

content = content.replace(voiceQuickTaskPattern, voiceReplacement);

// Сохраняем исправленный файл
fs.writeFileSync('server.js', content);

console.log('✅ Исправления применены!');
console.log('📋 Что изменено:');
console.log('  1. Убраны быстрые шаблоны из обычного API');
console.log('  2. Убраны быстрые шаблоны из голосового API');
console.log('  3. Добавлен расчет по PRICING_SYSTEM для голоса');
console.log('');
console.log('🎯 Теперь бот будет:');
console.log('  • Анализировать потребности клиента');
console.log('  • Использовать реальные расценки (3000₽/час)');
console.log('  • Показывать детализацию по компонентам');
console.log('  • НЕ показывать готовые шаблоны за 35,000₽'); 