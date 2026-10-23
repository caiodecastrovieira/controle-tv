package expo.modules.samsungsocket

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.net.InetAddress
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * WebSocket para TVs Samsung (Tizen).
 * A TV usa um certificado autoassinado na porta 8002, que o WebSocket padrão
 * do React Native recusa. Aqui aceitamos o certificado, mas SÓ para IPs da
 * rede local (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
 */
class SamsungSocketModule : Module() {
  private var socket: WebSocket? = null

  private val trustAll = object : X509TrustManager {
    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
  }

  private val client: OkHttpClient by lazy {
    val ssl = SSLContext.getInstance("TLS")
    ssl.init(null, arrayOf<TrustManager>(trustAll), SecureRandom())
    OkHttpClient.Builder()
      .sslSocketFactory(ssl.socketFactory, trustAll)
      .hostnameVerifier { host, _ -> isLocal(host) }
      .connectTimeout(5, TimeUnit.SECONDS)
      .readTimeout(0, TimeUnit.MILLISECONDS)
      .pingInterval(20, TimeUnit.SECONDS)
      .build()
  }

  private fun isLocal(host: String?): Boolean {
    if (host == null) return false
    return try {
      val addr = InetAddress.getByName(host)
      addr.isSiteLocalAddress || addr.isLoopbackAddress || addr.isLinkLocalAddress
    } catch (e: Exception) {
      false
    }
  }

  override fun definition() = ModuleDefinition {
    Name("SamsungSocket")

    Events("onOpen", "onMessage", "onClose", "onError")

    Function("connect") { url: String ->
      val host = Uri.parse(url).host
      if (!isLocal(host)) {
        sendEvent("onError", mapOf("message" to "Só é permitido conectar em IPs da rede local"))
        return@Function false
      }
      socket?.cancel()
      val request = Request.Builder().url(url).build()
      socket = client.newWebSocket(request, object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
          if (webSocket == socket) sendEvent("onOpen", mapOf<String, Any>())
        }
        override fun onMessage(webSocket: WebSocket, text: String) {
          if (webSocket == socket) sendEvent("onMessage", mapOf("data" to text))
        }
        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
          webSocket.close(1000, null)
        }
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
          if (webSocket == socket) {
            socket = null
            sendEvent("onClose", mapOf("code" to code, "reason" to reason))
          }
        }
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
          if (webSocket == socket) {
            socket = null
            sendEvent("onError", mapOf("message" to (t.message ?: "Falha na conexão")))
          }
        }
      })
      true
    }

    Function("send") { text: String ->
      socket?.send(text) ?: false
    }

    Function("close") {
      socket?.close(1000, null)
      socket = null
    }

    OnDestroy {
      socket?.cancel()
      socket = null
    }
  }
}
