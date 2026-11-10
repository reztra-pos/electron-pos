package com.reztra.pos.printer

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Raw ESC/POS printing for Reztra POS (the bytes are made on the server by Escposbuilder, like the desktop app).
 *
 *   printTcp(host, port, base64)        network / Wi-Fi printers (IP:9100)
 *   listBluetooth() / printBluetooth()   paired Bluetooth printers (SPP). Sunmi built-in printer = "InnerPrinter"
 *   listUsb() / printUsb()               USB printers (OTG) and built-in printers that show up as USB (e.g. iMin)
 *
 * One job at a time (single thread), so two receipts never mix on the same printer.
 */
class ReztraPrinterModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  companion object {
    private val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private const val ACTION_USB_PERMISSION = "com.reztra.pos.USB_PERMISSION"
    private const val CHUNK_BT = 1024
    private const val CHUNK_USB = 16 * 1024
  }

  private val io = Executors.newSingleThreadExecutor()

  override fun getName(): String = "ReztraPrinter"

  private fun bytesOf(base64: String): ByteArray = Base64.decode(base64, Base64.DEFAULT)

  private fun reason(e: Throwable): String = e.message?.takeIf { it.isNotBlank() } ?: e.javaClass.simpleName

  /* ------------------------------------------------------------------ device */

  @ReactMethod
  fun deviceInfo(promise: Promise) {
    val m = Arguments.createMap()
    m.putString("manufacturer", Build.MANUFACTURER ?: "")
    m.putString("brand", Build.BRAND ?: "")
    m.putString("model", Build.MODEL ?: "")
    m.putInt("sdk", Build.VERSION.SDK_INT)
    promise.resolve(m)
  }

  /* ------------------------------------------------------------------ network */

  @ReactMethod
  fun printTcp(host: String, port: Int, base64: String, timeoutMs: Int, promise: Promise) {
    io.execute {
      try {
        val bytes = bytesOf(base64)
        Socket().use { s ->
          s.connect(InetSocketAddress(host, if (port > 0) port else 9100), if (timeoutMs > 0) timeoutMs else 8000)
          s.soTimeout = if (timeoutMs > 0) timeoutMs else 8000
          val out = s.getOutputStream()
          out.write(bytes)
          out.flush()
          try { s.shutdownOutput() } catch (_: Exception) {}
        }
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("PRINT_TCP", "Printer $host:$port did not answer (${reason(e)}). Is it switched on and on the same network?", e)
      }
    }
  }

  /* ------------------------------------------------------------------ bluetooth */

  private fun btAdapter(): BluetoothAdapter? =
    (ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  @SuppressLint("MissingPermission")
  @ReactMethod
  fun listBluetooth(promise: Promise) {
    try {
      val a = btAdapter() ?: return promise.reject("BT_NONE", "This device has no Bluetooth.")
      if (!a.isEnabled) return promise.reject("BT_OFF", "Bluetooth is off. Switch it on and pair the printer in Android settings.")
      val arr = Arguments.createArray()
      for (d in a.bondedDevices) {
        val m = Arguments.createMap()
        m.putString("name", d.name ?: d.address)
        m.putString("address", d.address)
        m.putInt("major", d.bluetoothClass?.majorDeviceClass ?: 0)
        arr.pushMap(m)
      }
      promise.resolve(arr)
    } catch (e: SecurityException) {
      promise.reject("BT_PERMISSION", "Allow \"Nearby devices\" for Reztra POS (Android settings → Apps → Reztra POS → Permissions).", e)
    } catch (e: Exception) {
      promise.reject("BT_ERROR", reason(e), e)
    }
  }

  @SuppressLint("MissingPermission")
  @ReactMethod
  fun printBluetooth(address: String, base64: String, promise: Promise) {
    io.execute {
      var sock: BluetoothSocket? = null
      try {
        val a = btAdapter() ?: throw IOException("This device has no Bluetooth.")
        if (!a.isEnabled) throw IOException("Bluetooth is off.")
        val dev = a.getRemoteDevice(address)
        try { a.cancelDiscovery() } catch (_: Exception) {}
        val secure = dev.createRfcommSocketToServiceRecord(SPP)
        sock = try {
          secure.connect()
          secure
        } catch (first: IOException) {
          try { secure.close() } catch (_: Exception) {}
          val insecure = dev.createInsecureRfcommSocketToServiceRecord(SPP)   // some cheap printers need this
          sock = insecure
          insecure.connect()
          insecure
        }
        val out = (sock ?: throw IOException("No Bluetooth connection.")).outputStream
        val bytes = bytesOf(base64)
        var i = 0
        while (i < bytes.size) {
          val n = minOf(CHUNK_BT, bytes.size - i)
          out.write(bytes, i, n)
          out.flush()
          i += n
        }
        // let the printer read its buffer before the link closes (closing too early cuts the receipt)
        Thread.sleep(minOf(3000L, 300L + bytes.size / 40L))
        promise.resolve(true)
      } catch (e: SecurityException) {
        promise.reject("BT_PERMISSION", "Allow \"Nearby devices\" for Reztra POS (Android settings → Apps → Reztra POS → Permissions).", e)
      } catch (e: Exception) {
        promise.reject("PRINT_BT", "Bluetooth printer $address: ${reason(e)}. Is it on and paired?", e)
      } finally {
        try { sock?.close() } catch (_: Exception) {}
      }
    }
  }

  /* ------------------------------------------------------------------ usb */

  private fun usb(): UsbManager = ctx.getSystemService(Context.USB_SERVICE) as UsbManager

  /** bulk OUT endpoint of the device: printer-class interface first, else any interface with one */
  private fun outEndpoint(d: UsbDevice): Pair<UsbInterface, UsbEndpoint>? {
    val ifaces = (0 until d.interfaceCount).map { d.getInterface(it) }
    val ordered = ifaces.sortedBy { if (it.interfaceClass == UsbConstants.USB_CLASS_PRINTER) 0 else 1 }
    for (f in ordered) {
      for (k in 0 until f.endpointCount) {
        val ep = f.getEndpoint(k)
        if (ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.direction == UsbConstants.USB_DIR_OUT) return f to ep
      }
    }
    return null
  }

  private fun isPrinter(d: UsbDevice): Boolean =
    d.deviceClass == UsbConstants.USB_CLASS_PRINTER ||
      (0 until d.interfaceCount).any { d.getInterface(it).interfaceClass == UsbConstants.USB_CLASS_PRINTER }

  @ReactMethod
  fun listUsb(promise: Promise) {
    try {
      val arr = Arguments.createArray()
      for (d in usb().deviceList.values) {
        if (outEndpoint(d) == null) continue
        val m = Arguments.createMap()
        val label = listOfNotNull(d.manufacturerName, d.productName).joinToString(" ").ifBlank { "USB ${d.vendorId}:${d.productId}" }
        m.putString("name", label)
        m.putString("deviceName", d.deviceName)
        m.putInt("vendorId", d.vendorId)
        m.putInt("productId", d.productId)
        m.putBoolean("printer", isPrinter(d))
        m.putBoolean("permission", usb().hasPermission(d))
        arr.pushMap(m)
      }
      promise.resolve(arr)
    } catch (e: Exception) {
      promise.reject("USB_ERROR", reason(e), e)
    }
  }

  /** deviceName from listUsb(); "" = the first USB printer found (built-in printers that show up as USB) */
  @ReactMethod
  fun printUsb(deviceName: String, base64: String, promise: Promise) {
    val um = usb()
    val dev = if (deviceName.isNotBlank()) um.deviceList[deviceName]
      else um.deviceList.values.firstOrNull { isPrinter(it) } ?: um.deviceList.values.firstOrNull { outEndpoint(it) != null }
    if (dev == null) return promise.reject("USB_NONE", "The USB printer is not connected. Plug it in and try again.")
    if (um.hasPermission(dev)) {
      io.execute { writeUsb(dev, base64, promise) }
      return
    }
    // ask Android for permission once; it is remembered while the printer stays plugged in
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        if (intent.action != ACTION_USB_PERMISSION) return
        try { ctx.unregisterReceiver(this) } catch (_: Exception) {}
        if (um.hasPermission(dev)) io.execute { writeUsb(dev, base64, promise) }
        else promise.reject("USB_DENIED", "USB permission was not given for the printer.")
      }
    }
    try {
      ContextCompat.registerReceiver(ctx, receiver, IntentFilter(ACTION_USB_PERMISSION), ContextCompat.RECEIVER_EXPORTED)
      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
      val pi = PendingIntent.getBroadcast(ctx, 0, Intent(ACTION_USB_PERMISSION).setPackage(ctx.packageName), flags)
      um.requestPermission(dev, pi)
    } catch (e: Exception) {
      try { ctx.unregisterReceiver(receiver) } catch (_: Exception) {}
      promise.reject("USB_ERROR", reason(e), e)
    }
  }

  private fun writeUsb(dev: UsbDevice, base64: String, promise: Promise) {
    val um = usb()
    val pair = outEndpoint(dev) ?: return promise.reject("USB_NO_ENDPOINT", "This USB device can't receive print data.")
    val (iface, ep) = pair
    val conn = um.openDevice(dev) ?: return promise.reject("USB_OPEN", "The USB printer could not be opened.")
    try {
      if (!conn.claimInterface(iface, true)) throw IOException("The USB printer is busy.")
      val bytes = bytesOf(base64)
      var i = 0
      while (i < bytes.size) {
        val n = minOf(CHUNK_USB, bytes.size - i)
        val sent = conn.bulkTransfer(ep, bytes, i, n, 5000)
        if (sent <= 0) throw IOException("The USB printer did not take the data.")
        i += sent
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("PRINT_USB", "USB printer: ${reason(e)}", e)
    } finally {
      try { conn.releaseInterface(iface) } catch (_: Exception) {}
      conn.close()
    }
  }
}
