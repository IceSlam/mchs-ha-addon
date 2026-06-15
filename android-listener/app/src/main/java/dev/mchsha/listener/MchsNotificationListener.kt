package dev.mchsha.listener

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject
import kotlin.concurrent.thread

class MchsNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        val expectedPackage = prefs.getString(KEY_PACKAGE, DEFAULT_MCHS_PACKAGE).orEmpty()
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

        val endpoint = prefs.getString(KEY_ENDPOINT, DEFAULT_ENDPOINT).orEmpty()
        thread {
            try {
                postJson(endpoint, json)
            } catch (error: Exception) {
                android.util.Log.w("MchsListener", "Failed to send notification", error)
            }
        }
    }
}
