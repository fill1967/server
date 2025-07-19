const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

server.listen(PORT, () => {
    console.log(`🚀 Signaling server started on wss://your-app-name.onrender.com`);
});

// 👇 остальной твой WebSocket-код без изменений:
let clients = { caller: null, callee: null };

wss.on("connection", (ws) => {
    ws.isAlive = true;
    let role = null;

    ws.on("message", (message) => {
        const msg = JSON.parse(message);
        if (msg.type === "join") {
            role = msg.from;
            if (clients[role] && clients[role] !== ws) {
                console.log(`🔁 Клиент "${role}" переподключён. Закрываю старое соединение.`);
                clients[role].terminate();
            }
            clients[role] = ws;
            logClients(`🔌 Клиент "${role}" подключён`);
            return;
        }

        const targetRole = role === "caller" ? "callee" : "caller";
        const target = clients[targetRole];
        if (target && target.readyState === WebSocket.OPEN) {
            target.send(message);
        }
    });

    ws.on("pong", () => { ws.isAlive = true; });
    ws.on("close", () => {
        if (role && clients[role] === ws) {
            clients[role] = null;
            logClients(`❌ Клиент "${role}" отключён`);
        }
    });
    ws.on("error", (err) => {
        console.error("⚠️ WebSocket ошибка:", err);
    });
});

const interval = setInterval(() => {
    Object.keys(clients).forEach((role) => {
        const client = clients[role];
        if (client) {
            if (!client.isAlive) {
                console.log(`⛔ Клиент "${role}" не отвечает. Разрываю соединение.`);
                client.terminate();
                clients[role] = null;
                logClients(`❌ Клиент "${role}" отключён из-за неответа`);
            } else {
                client.isAlive = false;
                client.ping();
            }
        }
    });
}, 10000);

function logClients(message) {
    const count = Object.values(clients).filter(c => c && c.readyState === WebSocket.OPEN).length;
    console.log(`${message} (${count}/2 подключено)`);
    if (count < 2) console.log("⏳ Ожидаю клиента...");
    else console.log("✅ Оба клиента подключены. Готов к обмену offer/answer.");
}

wss.on("close", () => {
    clearInterval(interval);
});
