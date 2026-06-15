package dev.mchsha.listener

const val PREFS_NAME = "mchs_listener"
const val KEY_ENDPOINT = "endpoint"
const val KEY_PACKAGE = "package_name"
const val KEY_QUEUE = "pending_queue"
const val KEY_RECENT_DEDUPE = "recent_dedupe"
const val KEY_LAST_ERROR = "last_error"
const val KEY_LAST_SENT = "last_sent"
const val DEFAULT_ENDPOINT = "http://127.0.0.1:8765/notification"
const val DEFAULT_MCHS_PACKAGE = "ru.mchs.app"

val MCHS_PACKAGE_CANDIDATES = listOf("ru.mchs", "ru.mchs.app", "ru.mchs.mobile", "ru.mchs.informer", "io.citizens.security")
