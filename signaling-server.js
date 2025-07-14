const WebSocket = require("ws");

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`🚀 Signaling server started on ws://localhost:${PORT}`);

// Объект с клиентами по ролям
let clients = {
    caller: null,
    callee: null
};

wss.on("connection", (ws) => {
    ws.isAlive = true;

    // Временная роль клиента (получим позже из join-сообщения)
    let role = null;

    ws.on("message", (message) => {
        const msg = JSON.parse(message);
        if (msg.type === "join") {
            role = msg.from;

            // Проверка: если такой клиент уже есть — закрываем старый
            if (clients[role] && clients[role] !== ws) {
                console.log(`🔁 Клиент с ролью "${role}" переподключился. Закрываю старое соединение.`);
                clients[role].terminate();
            }

            clients[role] = ws;

            logClients(`🔌 Клиент "${role}" подключён`);
            return;
        }

        // Передача сообщений другому клиенту
        const targetRole = role === "caller" ? "callee" : "caller";
        const target = clients[targetRole];
        if (target && target.readyState === WebSocket.OPEN) {
            target.send(message);
        }
    });

    ws.on("pong", () => {
        ws.isAlive = true;
    });

    ws.on("close", () => {
        if (role) {
            if (clients[role] === ws) {
                clients[role] = null;
                logClients(`❌ Клиент "${role}" отключён`);
            }
        }
    });

    ws.on("error", (err) => {
        console.error("⚠️ WebSocket ошибка:", err);
    });
});

// ping/pong — проверка активности
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

    if (count < 2) {
        console.log("⏳ Ожидаю клиента...");
    } else {
        console.log("✅ Оба клиента подключены. Готов к обмену offer/answer.");
    }
}

wss.on("close", () => {
    clearInterval(interval);
});
