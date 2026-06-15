package dev.mchsha.listener

import android.content.Context

data class AppCandidate(val packageName: String, val label: String)

fun findMchsApps(context: Context): List<AppCandidate> {
    val pm = context.packageManager
    val installed = pm.getInstalledApplications(0)
    return installed.mapNotNull { app ->
        val label = pm.getApplicationLabel(app).toString()
        val pkg = app.packageName
        val packageMatch = MCHS_PACKAGE_CANDIDATES.any { pkg.equals(it, ignoreCase = true) }
        val labelMatch = label.contains("МЧС", ignoreCase = true) || label.contains("МЧС России", ignoreCase = true) || label.contains("MCHS", ignoreCase = true)
        if (packageMatch || labelMatch) AppCandidate(pkg, label) else null
    }.distinctBy { it.packageName }
}
