const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ✅ Добавляем HTTP endpoint
app.get("/", (req, res) => {
  res.send("✅ Signaling server is up and running.");
});

// === ОБРАБОТКА ОШИБОК СЕРВЕРА ===
server.on("error", (err) => {
    console.error("❌ HTTP server error:", err);
});

wss.on("error", (err) => {
    console.error("❌ WebSocket server error:", err);
});

// === ХРАНИЛИЩЕ КЛИЕНТОВ ===
let clients = {
    caller: null,
    callee: null,
};

wss.on("connection", (ws) => {
    ws.isAlive = true;
    let role = null;

    ws.on("message", (data) => {
        try {
            const msg = JSON.parse(data);

            // Обработка подключения роли
            if (msg.type === "join") {
                role = msg.from;

                if (!["caller", "callee"].includes(role)) {
                    console.warn(`⚠️ Неизвестная роль: "${role}"`);
                    return;
                }

                // Переподключение
                if (clients[role] && clients[role] !== ws) {
                    console.log(`🔁 Клиент "${role}" переподключён. Закрываю старое соединение.`);
                    clients[role].terminate();
                }

                clients[role] = ws;
                logClients(`🔌 Клиент "${role}" подключён`);
                return;
            }

            // Пересылка сообщения второй стороне
            const targetRole = role === "caller" ? "callee" : "caller";
            const target = clients[targetRole];
            if (target && target.readyState === WebSocket.OPEN) {
                target.send(data);
            }

        } catch (err) {
            console.error("❗ Ошибка при обработке сообщения:", err);
        }
    });

    // 🧠 Поддержка ping/pong
    ws.on("pong", () => {
        ws.isAlive = true;
    });

    // 🧹 Обработка отключения
    ws.on("close", () => {
        if (role && clients[role] === ws) {
            clients[role] = null;
            logClients(`❌ Клиент "${role}" отключён`);
        }
    });

    ws.on("error", (err) => {
        console.error(`⚠️ Ошибка клиента (${role || "неизвестный"}):`, err);
    });
});

// 💓 Периодическая проверка клиентов
const interval = setInterval(() => {
    Object.entries(clients).forEach(([role, ws]) => {
        if (!ws) return;
        if (!ws.isAlive) {
            console.log(`⛔ Клиент "${role}" не отвечает. Разрываю соединение.`);
            ws.terminate();
            clients[role] = null;
            logClients(`❌ Клиент "${role}" отключён из-за неответа`);
        } else {
            ws.isAlive = false;
            ws.ping(); // отправка ping
        }
    });
}, 10000); // каждые 10 секунд

wss.on("close", () => {
    clearInterval(interval);
});

function logClients(message) {
    const count = Object.values(clients).filter(c => c && c.readyState === WebSocket.OPEN).length;
    console.log(`${message} (${count}/2 подключено)`);
    if (count < 2) {
        console.log("⏳ Ожидаю подключения второго клиента...");
    } else {
        console.log("✅ Оба клиента подключены. Можно передавать offer/answer.");
    }
}
// === СТАРТ СЕРВЕРА ===
server.listen(PORT, () => {
  console.log(`🚀 Signaling server started on port ${PORT}`);
});
