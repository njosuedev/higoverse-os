package com.higoverse.app

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

/**
 * Installs app updates downloaded outside Google Play (lib/src/updates/).
 *
 * Channel "com.higoverse.app/updates":
 *  - apkInfo(path)        package name and versionCode inside a downloaded APK
 *  - canInstall()         may this app hand APKs to the installer (Android 8+)
 *  - openInstallSettings  "Install unknown apps" screen for Higoverse
 *  - install(path)        opens Android's installer for the APK
 *
 * The APK lives in the app's cache (cache/updates/), shared with the
 * installer through a FileProvider: no storage permission is needed.
 *
 * Channel "com.higoverse.app/live": start(title, text) / stop() the
 * [LiveService] that keeps live alerts coming in the background.
 */
class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.higoverse.app/updates").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "apkInfo" -> result.success(apkInfo(call.argument<String>("path")!!))
                    "canInstall" -> result.success(canInstall())
                    "openInstallSettings" -> {
                        openInstallSettings()
                        result.success(null)
                    }
                    "install" -> {
                        install(call.argument<String>("path")!!)
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            } catch (e: Exception) {
                result.error("update", e.message, null)
            }
        }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.higoverse.app/live").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "start" -> LiveService.start(this, call.argument<String>("title") ?: "Higoverse", call.argument<String>("text") ?: "")
                    "stop" -> LiveService.stop(this)
                    else -> return@setMethodCallHandler result.notImplemented()
                }
                result.success(null)
            } catch (e: Exception) {
                result.error("live", e.message, null)
            }
        }
    }

    private fun apkInfo(path: String): Map<String, Any>? {
        @Suppress("DEPRECATION")
        val info = if (Build.VERSION.SDK_INT >= 33) {
            packageManager.getPackageArchiveInfo(path, PackageManager.PackageInfoFlags.of(0))
        } else {
            packageManager.getPackageArchiveInfo(path, 0)
        } ?: return null
        @Suppress("DEPRECATION")
        val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
        return mapOf("packageName" to info.packageName, "versionCode" to code, "versionName" to (info.versionName ?: ""))
    }

    private fun canInstall(): Boolean =
        Build.VERSION.SDK_INT < 26 || packageManager.canRequestPackageInstalls()

    private fun openInstallSettings() {
        if (Build.VERSION.SDK_INT < 26) return
        startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
    }

    private fun install(path: String) {
        val file = File(path)
        val uri = FileProvider.getUriForFile(this, "$packageName.updates", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(intent)
    }
}
