package com.whatsapppoc

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannels()
    loadReactNative(this)
  }

  // The server sends to these channel IDs. Android 8+ needs them to exist
  // before a notification can use them; users can tune each one in Settings.
  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    listOf(
      NotificationChannel("chat_messages", "Messages", NotificationManager.IMPORTANCE_HIGH),
      NotificationChannel("announcements", "Announcements", NotificationManager.IMPORTANCE_DEFAULT),
      NotificationChannel("calls", "Calls", NotificationManager.IMPORTANCE_HIGH),
    ).forEach { manager.createNotificationChannel(it) }
  }
}
