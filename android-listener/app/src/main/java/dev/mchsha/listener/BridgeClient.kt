package dev.mchsha.listener

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

fun postJson(endpoint: String, body: String) {
    val connection = URL(endpoint).openConnection() as HttpURLConnection
    connection.requestMethod = "POST"
    connection.connectTimeout = 5000
    connection.readTimeout = 5000
    connection.doOutput = true
    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
    connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
    val code = connection.responseCode
    if (code !in 200..299) error("HTTP $code")
}

fun enqueueEvent(context: Context, body: String) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val arr = JSONArray(prefs.getString(KEY_QUEUE, "[]"))
    arr.put(JSONObject().put("body", body).put("attempts", 0).put("nextTry", System.currentTimeMillis()))
    while (arr.length() > 20) arr.remove(0)
    prefs.edit().putString(KEY_QUEUE, arr.toString()).apply()
}

fun flushQueue(context: Context): Int {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val endpoint = prefs.getString(KEY_ENDPOINT, DEFAULT_ENDPOINT).orEmpty()
    val now = System.currentTimeMillis()
    val arr = JSONArray(prefs.getString(KEY_QUEUE, "[]"))
    val keep = JSONArray()
    var sent = 0
    for (i in 0 until arr.length()) {
        val item = arr.getJSONObject(i)
        val attempts = item.optInt("attempts", 0)
        if (attempts >= 5 || item.optLong("nextTry", 0) > now) {
            keep.put(item)
            continue
        }
        try {
            val body = item.getString("body")
            postJson(endpoint, body)
            prefs.edit().putString(KEY_LAST_SENT, body).remove(KEY_LAST_ERROR).apply()
            sent++
        } catch (error: Exception) {
            item.put("attempts", attempts + 1)
            item.put("nextTry", now + ((attempts + 1) * 30000L))
            keep.put(item)
            prefs.edit().putString(KEY_LAST_ERROR, error.message ?: error.javaClass.simpleName).apply()
        }
    }
    prefs.edit().putString(KEY_QUEUE, keep.toString()).apply()
    return sent
}
