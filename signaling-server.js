const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

server.listen(PORT, () => {
    console.log(`🚀 Signaling server started on port ${PORT}`);
});

// === ОБРАБОТКА ОШИБОК СЕРВЕРА ===
server.on("error", (err) => {
    console.error("❌ Ошибка HTTP сервера:", err);
});

wss.on("error", (err) => {
    console.error("❌ Ошибка WebSocket сервера:", err);
});

// === ЛОГИКА ПОДКЛЮЧЕНИЯ КЛИЕНТОВ ===
let clients = { caller: null, callee: null };

wss.on("connection", (ws) => {
    ws.isAlive = true;
    let role = null;

    ws.on("message", (message) => {
        try {
            const msg = JSON.parse(message);

            if (msg.type === "join") {
                role = msg.from;

                if (!["caller", "callee"].includes(role)) {
                    console.warn(`⚠️ Неизвестная роль: "${role}"`);
                    return;
                }

                if (clients[role] && clients[role] !== ws) {
                    console.log(`🔁 Клиент "${role}" переподключён. Закрываю старое соединение.`);
                    clients[role].terminate();
                }

                clients[role] = ws;
                logClients(`🔌 Клиент "${role}" подключён`);
                // ✅ отправим клиенту подтверждение
                ws.send(JSON.stringify({ type: "joined", from: role }));
                return;
            }

            // Пересылаем сообщение другому клиенту
            const targetRole = role === "caller" ? "callee" : "caller";
            const target = clients[targetRole];
            if (target && target.readyState === WebSocket.OPEN) {
                target.send(message);
            }
        } catch (err) {
            console.error("❗ Ошибка при обработке сообщения:", err);
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
        console.error(`⚠️ Ошибка WebSocket клиента (${role || "неизвестный"}):`, err);
    });
});

// === ПИНГ КЛИЕНТОВ ===
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

wss.on("close", () => {
    clearInterval(interval);
});

// === ЛОГИРОВАНИЕ СОСТОЯНИЯ КЛИЕНТОВ ===
function logClients(message) {
    const count = Object.values(clients).filter(c => c && c.readyState === WebSocket.OPEN).length;
    console.log(`${message} (${count}/2 подключено)`);
    if (count < 2) console.log("⏳ Ожидаю клиента...");
    else console.log("✅ Оба клиента подключены. Готов к обмену offer/answer.");
}

