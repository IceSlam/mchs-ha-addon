package dev.mchsha.listener

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.concurrent.thread

class MainActivity : Activity() {
    private lateinit var endpoint: EditText
    private lateinit var packageInput: EditText
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        handleDeepLink(prefs)

        endpoint = EditText(this).apply {
            hint = "Bridge URL"
            setText(prefs.getString(KEY_ENDPOINT, DEFAULT_ENDPOINT))
        }
        packageInput = EditText(this).apply {
            hint = "MCHS package name (advanced)"
            setText(prefs.getString(KEY_PACKAGE, ""))
        }
        status = TextView(this)

        val save = Button(this).apply {
            text = "Save"
            setOnClickListener {
                prefs.edit()
                    .putString(KEY_ENDPOINT, endpoint.text.toString().trim())
                    .putString(KEY_PACKAGE, packageInput.text.toString().trim())
                    .apply()
                refreshStatus()
            }
        }
        val find = Button(this).apply {
            text = "Find MCHS app"
            setOnClickListener { findAndSelectPackage() }
        }
        val permission = Button(this).apply {
            text = "Open notification access"
            setOnClickListener { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
        }
        val test = Button(this).apply {
            text = "Send test"
            setOnClickListener { sendTest() }
        }
        val retry = Button(this).apply {
            text = "Retry queue"
            setOnClickListener {
                thread {
                    val count = flushQueue(this@MainActivity)
                    runOnUiThread {
                        status.text = "Queue retry sent: $count\n\n${buildStatusText()}"
                    }
                }
            }
        }

        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(32, 32, 32, 32)
            addView(TextView(this@MainActivity).apply {
                text = "Install the official MCHS Russia app, grant notification access to this listener, and send a test event."
            })
            addView(packageInput)
            addView(save)
            addView(find)
            addView(permission)
            addView(test)
            addView(retry)
            addView(status)
        })
        findAndSelectPackage(autoOnly = true)
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    private fun handleDeepLink(prefs: android.content.SharedPreferences) {
        if (intent?.action != Intent.ACTION_VIEW) return
        val endpointParam = intent.data?.getQueryParameter("endpoint") ?: return
        prefs.edit().putString(KEY_ENDPOINT, endpointParam).apply()
    }

    private fun findAndSelectPackage(autoOnly: Boolean = false) {
        val candidates = findMchsApps(this)
        if (candidates.size == 1) {
            packageInput.setText(candidates.first().packageName)
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putString(KEY_PACKAGE, candidates.first().packageName).apply()
            refreshStatus()
            return
        }
        if (candidates.isEmpty()) {
            status.text = "Приложение МЧС России не найдено. Установите его и нажмите \"Найти снова\".\n\n${buildStatusText()}"
            return
        }
        if (autoOnly) {
            refreshStatus()
            return
        }
        AlertDialog.Builder(this)
            .setTitle("Select MCHS app")
            .setItems(candidates.map { "${it.label} (${it.packageName})" }.toTypedArray()) { _, which ->
                packageInput.setText(candidates[which].packageName)
                getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putString(KEY_PACKAGE, candidates[which].packageName).apply()
                refreshStatus()
            }
            .show()
    }

    private fun sendTest() {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_ENDPOINT, endpoint.text.toString().trim())
            .putString(KEY_PACKAGE, packageInput.text.toString().trim())
            .apply()
        thread {
            val body = """{"source":"mchs_android_app","package":"test","packageName":"test","title":"МЧС России","text":"Беспилотная опасность объявлена на территории Брянской области","bigText":"Беспилотная опасность объявлена на территории Брянской области","timestamp":${System.currentTimeMillis()},"notificationId":0}"""
            try {
                postJson(endpoint.text.toString().trim(), body)
                prefs.edit().putString(KEY_LAST_SENT, body).remove(KEY_LAST_ERROR).apply()
                runOnUiThread { status.text = "Test event sent\n\n${buildStatusText()}" }
            } catch (error: Exception) {
                enqueueEvent(this, body)
                prefs.edit().putString(KEY_LAST_ERROR, error.message ?: error.javaClass.simpleName).apply()
                runOnUiThread { status.text = "Test queued: ${error.message}\n\n${buildStatusText()}" }
            }
        }
    }

    private fun refreshStatus() {
        status.text = buildStatusText()
    }

    private fun buildStatusText(): String {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val enabled = Settings.Secure.getString(contentResolver, "enabled_notification_listeners").orEmpty()
            .split(":")
            .any { it.contains(this@MainActivity.packageName, ignoreCase = true) }
        val candidates = findMchsApps(this)
        val selectedPackage = prefs.getString(KEY_PACKAGE, "").orEmpty()
        val found = candidates.any { it.packageName == selectedPackage }
        val queueSize = org.json.JSONArray(prefs.getString(KEY_QUEUE, "[]")).length()
        return listOf(
            "Notification Access: ${if (enabled) "granted" else "not granted"}",
            "MCHS app: ${if (found) selectedPackage else "not selected/found"}",
            "Bridge URL: ${prefs.getString(KEY_ENDPOINT, DEFAULT_ENDPOINT)}",
            "Pending queue: $queueSize",
            "Last error: ${prefs.getString(KEY_LAST_ERROR, "-")}",
            "Last sent: ${prefs.getString(KEY_LAST_SENT, "-")}"
        ).joinToString("\n")
    }
}
