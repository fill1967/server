package com.example.signaling

import android.util.Log
import okhttp3.*
import org.json.JSONObject
import org.webrtc.IceCandidate
import org.webrtc.SessionDescription

class SignalingClient(
    private val serverUrl: String,
    private val role: String,
    private val onOffer: (SessionDescription) -> Unit,
    private val onAnswer: (SessionDescription) -> Unit,
    private val onIceCandidate: (IceCandidate) -> Unit,
    private val onError: (String) -> Unit,
    private val onConnected: () -> Unit
) {
    private val client = OkHttpClient()
    private var ws: WebSocket? = null

    fun connect() {
        val request = Request.Builder().url(serverUrl).build()
        client.newWebSocket(request, object : WebSocketListener() {

            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d("SignalingClient", "✅ WebSocket открыт")
                ws = webSocket

                val joinMessage = JSONObject().apply {
                    put("type", "join")
                    put("from", role)
                }
                safeSend(joinMessage)
                onConnected()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val msg = JSONObject(text)
                when (msg.getString("type")) {
                    "offer" -> onOffer(
                        SessionDescription(SessionDescription.Type.OFFER, msg.getString("sdp"))
                    )
                    "answer" -> onAnswer(
                        SessionDescription(SessionDescription.Type.ANSWER, msg.getString("sdp"))
                    )
                    "candidate" -> onIceCandidate(
                        IceCandidate(
                            msg.getString("sdpMid"),
                            msg.getInt("sdpMLineIndex"),
                            msg.getString("candidate")
                        )
                    )
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                val message = t.message ?: t.toString()
                Log.e("SignalingClient", "❌ WebSocket ошибка", t)
                ws = null
                onError("Ошибка подключения: $message")
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.w("SignalingClient", "🔌 WebSocket закрыт: $reason")
                ws = null
                onError("Соединение закрыто: $reason")
            }
        })
    }

    private fun safeSend(json: JSONObject) {
        try {
            ws?.let {
                if (it.send(json.toString())) {
                    Log.d("SignalingClient", "📤 Отправлено: $json")
                } else {
                    onError("❌ Не удалось отправить сообщение: сокет неактивен")
                }
            } ?: run {
                onError("❌ WebSocket не инициализирован")
            }
        } catch (e: Exception) {
            Log.e("SignalingClient", "❗ Ошибка при отправке: ${e.message}", e)
            onError("Ошибка при отправке сообщения: ${e.message}")
        }
    }

    fun sendOffer(sdp: SessionDescription) {
        val json = JSONObject().apply {
            put("type", "offer")
            put("sdp", sdp.description)
            put("from", role)
        }
        safeSend(json)
    }

    fun sendAnswer(sdp: SessionDescription) {
        val json = JSONObject().apply {
            put("type", "answer")
            put("sdp", sdp.description)
            put("from", role)
        }
        safeSend(json)
    }

    fun sendIceCandidate(candidate: IceCandidate) {
        val json = JSONObject().apply {
            put("type", "candidate")
            put("sdpMid", candidate.sdpMid)
            put("sdpMLineIndex", candidate.sdpMLineIndex)
            put("candidate", candidate.sdp)
            put("from", role)
        }
        safeSend(json)
    }

    fun close() {
        ws?.let {
            Log.d("SignalingClient", "🛑 Закрытие WebSocket вручную")
            it.close(1000, "Client disconnected")
        } ?: Log.w("SignalingClient", "⚠️ WebSocket уже null при close()")
        // ⚠️ Не обнуляем сразу — пусть сначала вызовется onClosed()
    }
}


