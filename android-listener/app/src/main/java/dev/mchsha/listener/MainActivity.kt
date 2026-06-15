package dev.mchsha.listener

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val endpoint = EditText(this).apply {
            hint = "Bridge URL"
            setText(prefs.getString(KEY_ENDPOINT, DEFAULT_ENDPOINT))
        }
        val packageName = EditText(this).apply {
            hint = "MCHS package name"
            setText(prefs.getString(KEY_PACKAGE, DEFAULT_MCHS_PACKAGE))
        }

        val status = TextView(this)
        val save = Button(this).apply {
            text = "Save settings"
            setOnClickListener {
                prefs.edit()
                    .putString(KEY_ENDPOINT, endpoint.text.toString().trim())
                    .putString(KEY_PACKAGE, packageName.text.toString().trim())
                    .apply()
                status.text = "Settings saved"
            }
        }
        val permission = Button(this).apply {
            text = "Open notification access"
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
        }
        val test = Button(this).apply {
            text = "Send test event"
            setOnClickListener {
                sendTest(endpoint.text.toString().trim()) { result ->
                    runOnUiThread { status.text = result }
                }
            }
        }

        val instructions = TextView(this).apply {
            text = "1. Save bridge URL and MCHS package name.\n2. Open notification access and allow this app.\n3. Use ADB to check package names: adb shell pm list packages | grep -i mchs\n4. Send a test event."
        }

        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(32, 32, 32, 32)
            addView(instructions)
            addView(endpoint)
            addView(packageName)
            addView(save)
            addView(permission)
            addView(test)
            addView(status)
        })
    }

    private fun sendTest(endpoint: String, done: (String) -> Unit) {
        thread {
            try {
                val body = """{"source":"mchs_android_app","package":"test","title":"МЧС России","text":"Беспилотная опасность объявлена на территории Брянской области","bigText":"Беспилотная опасность объявлена на территории Брянской области","timestamp":${System.currentTimeMillis()}}"""
                postJson(endpoint, body)
                done("Test event sent")
            } catch (error: Exception) {
                done("Test failed: ${error.message}")
            }
        }
    }
}

const val PREFS_NAME = "mchs_listener"
const val KEY_ENDPOINT = "endpoint"
const val KEY_PACKAGE = "package_name"
const val DEFAULT_ENDPOINT = "http://127.0.0.1:8765/notification"
const val DEFAULT_MCHS_PACKAGE = "ru.mchs.app"

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
