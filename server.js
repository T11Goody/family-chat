const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 8080;
const historyFile = path.join(__dirname, 'history.json');

function readHistory() {
    try {
        if (!fs.existsSync(historyFile)) return [];
        const data = fs.readFileSync(historyFile, 'utf8');
        return JSON.parse(data);
    } catch (e) { return []; }
}

function saveHistory(messages) {
    try {
        fs.writeFileSync(historyFile, JSON.stringify(messages, null, 2), 'utf8');
    } catch (e) { console.log('Ошибка записи:', e.message); }
}

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

const server = app.listen(port, () => {
    console.log('Облачный мессенджер запущен на порту ' + port);
});

const wss = new WebSocketServer({ server });
const activeUsers = new Map();

wss.on('connection', (ws) => {
    let currentUser = null;

    ws.on('message', (message) => {
        try {
            const packet = JSON.parse(message.toString());

            if (packet.type === 'AUTH') {
                currentUser = packet.username;
                activeUsers.set(currentUser, ws);
                return;
            }

            if (packet.type === 'GET_HISTORY') {
                const allMessages = readHistory();
                const chatHistory = allMessages.filter(m => 
                    (m.sender === packet.from && m.recipient === packet.to) || 
                    (m.sender === packet.to && m.recipient === packet.from)
                );
                ws.send(JSON.stringify({ type: 'HISTORY', data: chatHistory }));
                return;
            }

            if (packet.type === 'MSG' || packet.type === 'IMG') {
                const newMessage = {
                    type: packet.type,
                    sender: packet.from,
                    recipient: packet.to,
                    content: packet.content
                };
                const allMessages = readHistory();
                allMessages.push(newMessage);
                saveHistory(allMessages);

                const recipientWs = activeUsers.get(packet.to);
                if (recipientWs && recipientWs.readyState === 1) {
                    recipientWs.send(JSON.stringify({
                        type: packet.type,
                        from: packet.from,
                        content: packet.content
                    }));
                }
            }
        } catch (e) { console.log('Ошибка:', e.message); }
    });

    ws.on('close', () => { if (currentUser) activeUsers.delete(currentUser); });
});
