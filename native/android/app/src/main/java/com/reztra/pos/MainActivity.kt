package com.reztra.pos

import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /** Name of the main component registered from JavaScript (index.js). */
  override fun getMainComponentName(): String = "ReztraPOS"

  /**
   * Tablet (shortest side >= 600dp, 9" and up): landscape only. Phone: portrait only.
   * The screen stays on while the POS is open.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    requestedOrientation =
      if (resources.configuration.smallestScreenWidthDp >= 600) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
      else ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    super.onCreate(savedInstanceState)
  }

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
