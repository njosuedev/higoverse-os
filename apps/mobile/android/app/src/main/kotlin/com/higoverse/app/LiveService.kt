package com.higoverse.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Keeps the app awake in the background so the live connection (and with it
 * the sales, fines and stock alerts, their sound and counts) keeps coming.
 * Without it Android freezes the app seconds after it is left. It runs no
 * code of its own: being a foreground service is what keeps the process
 * alive. Shows a quiet "Higoverse is live" line in the tray, as Android
 * requires. Ends with the app's task (swiped away) or on sign-out.
 */
class LiveService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra("title") ?: "Higoverse"
        val text = intent?.getStringExtra("text") ?: ""
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, "Live connection", NotificationManager.IMPORTANCE_MIN).apply {
                    description = "Keeps sales, fines and stock alerts coming while the app is in the background."
                    setShowBadge(false)
                }
            )
        }
        val open = PendingIntent.getActivity(
            this, 0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_higoverse)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
        try {
            ServiceCompat.startForeground(
                this, ID, notification,
                if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING else 0,
            )
        } catch (e: Exception) {
            stopSelf() // not allowed right now (e.g. started from the background)
        }
        return START_NOT_STICKY
    }

    companion object {
        private const val CHANNEL = "hgv_live"
        private const val ID = 90

        fun start(context: Context, title: String, text: String) {
            val intent = Intent(context, LiveService::class.java).putExtra("title", title).putExtra("text", text)
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, LiveService::class.java))
        }
    }
}
