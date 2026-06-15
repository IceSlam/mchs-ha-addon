package dev.mchsha.listener

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject
import kotlin.concurrent.thread

class MchsNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        var expectedPackage = prefs.getString(KEY_PACKAGE, "").orEmpty()
        if (expectedPackage.isBlank()) {
            val candidates = findMchsApps(this)
            if (candidates.size == 1) {
                expectedPackage = candidates.first().packageName
                prefs.edit().putString(KEY_PACKAGE, expectedPackage).apply()
            }
        }
        if (expectedPackage.isNotBlank() && sbn.packageName != expectedPackage) return

        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()

        val json = JSONObject()
            .put("source", "mchs_android_app")
            .put("package", sbn.packageName)
            .put("packageName", sbn.packageName)
            .put("title", title)
            .put("text", text)
            .put("subText", subText)
            .put("bigText", bigText)
            .put("timestamp", sbn.postTime)
            .put("postTime", sbn.postTime)
            .put("notificationId", sbn.id)
            .toString()

        val dedupeKey = "${sbn.packageName}|${sbn.id}|${sbn.postTime}|${text.orEmpty()}|${bigText.orEmpty()}"
        if (isDuplicate(prefs, dedupeKey)) return

        val endpoint = prefs.getString(KEY_ENDPOINT, DEFAULT_ENDPOINT).orEmpty()
        thread {
            flushQueue(this)
            try {
                postJson(endpoint, json)
                prefs.edit().putString(KEY_LAST_SENT, json).remove(KEY_LAST_ERROR).apply()
            } catch (error: Exception) {
                enqueueEvent(this, json)
                prefs.edit().putString(KEY_LAST_ERROR, error.message ?: error.javaClass.simpleName).apply()
                android.util.Log.w("MchsListener", "Failed to send notification", error)
            }
        }
    }

    private fun isDuplicate(prefs: android.content.SharedPreferences, key: String): Boolean {
        val now = System.currentTimeMillis()
        val arr = JSONArray(prefs.getString(KEY_RECENT_DEDUPE, "[]"))
        val keep = JSONArray()
        var duplicate = false
        for (i in 0 until arr.length()) {
            val item = arr.getJSONObject(i)
            if (now - item.optLong("time", 0) <= 30000) {
                if (item.optString("key") == key) duplicate = true
                keep.put(item)
            }
        }
        keep.put(JSONObject().put("key", key).put("time", now))
        while (keep.length() > 20) keep.remove(0)
        prefs.edit().putString(KEY_RECENT_DEDUPE, keep.toString()).apply()
        return duplicate
    }
}
