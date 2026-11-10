# Reztra POS — Android (React Native)

The Electron POS flow for Android phones and tablets. It uses the same API, device key and ZATCA logic. All ZATCA work runs on the server, unchanged.

- **Tablet** (shortest side ≥ 600 dp, so 9" and up) opens **landscape**: side rail, menu and the order panel together.
- **Phone** opens **portrait**: menu with a "View order" bar, the order in a sheet, bottom tabs.

## What is in this version (core)

- Activation with the device key, PIN login (or email + password), reset activation.
- Register gate: open register, register summary, print it, close register.
- Menu, search, categories, variations, modifiers, notes, combos.
- Order types (Dine In / Take Away / Delivery), with the outlet's default order type and `dine_in_without_table`; tables; customer; waiter; delivery partner.
- Place order, which prints the KOT to each kitchen printer. Draft, update a running order, cancel.
- Quick invoice and payment: split payments, cash keypad, discount and charge, due. ZATCA status is shown live.
- Printing: invoice, draft bill, KOT and reprints.
- Running orders, tables view, recent sales.
- Settings: print toggles, and which printer to use on this device.

Phase 2 (next): pre-orders, credit notes, register PDF, Arabic UI.

## 1. Setup (once)

You need Node 20+, JDK 17, and Android Studio (Android SDK 35 and the NDK it asks for).

```bash
cd native
npm install
```

**Device key secret.** `src/lib/config.js` → `KEY_SECRET` must match the web app and Electron. The default is `change-me-reztra-device-key-secret-2026`.

## 2. Run on a device

Turn on USB debugging on the phone or tablet, connect it, then:

```bash
cd native
npx react-native start           # terminal 1
npx react-native run-android     # terminal 2
```

## 3. Release build

Create an upload key once:

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore reztra-upload.keystore -alias reztra -keyalg RSA -keysize 2048 -validity 10000
```

Put the keystore at `native/android/app/reztra-upload.keystore`, then add these lines to `~/.gradle/gradle.properties` (keep that file out of git):

```
REZTRA_UPLOAD_STORE_FILE=reztra-upload.keystore
REZTRA_UPLOAD_KEY_ALIAS=reztra
REZTRA_UPLOAD_STORE_PASSWORD=*****
REZTRA_UPLOAD_KEY_PASSWORD=*****
```

Then build:

```bash
cd native
npm run build:apk    # android/app/build/outputs/apk/release/app-release.apk   (install directly)
npm run build:aab    # android/app/build/outputs/bundle/release/app-release.aab (Play Store)
```

Without these properties, the release is signed with the debug key. That is fine for testing, but not for the store.

For every release, raise `versionCode` / `versionName` in `android/app/build.gradle` and `APP_VERSION` in `src/lib/config.js`.

## 4. Printers

The server sends ESC/POS bytes plus the printer set in the web app. The app decides how to reach each printer from this device: **More → Settings → Printers**.

| Mode | Use for |
|---|---|
| Auto (network) | The printer's IP and port from the web app (Wi-Fi/LAN printers). This is the default. |
| Network | A different IP/port for this device. |
| Bluetooth | Paired Bluetooth printers. Pair them in Android settings first. |
| USB | USB printers (OTG). Android asks for permission the first time. |
| Built-in | Sunmi / iMin handheld POS printers: the Sunmi InnerPrinter if present, otherwise the built-in USB printer. |

"Default for this device" applies to every printer that has no setting of its own. Use **Test print** to check a printer.

## 5. Server files needed

The printer list in Settings uses `GET /api/v1/printers`. Update these on the web app:

- `application/controllers/api/v1/Api_pos.php` — new `printers()` method
- the API routes (from `install/routes_api.php`) — new line `$route['api/v1/printers']['get'] = $a . 'api_pos/printers';`

## 6. Tests

`__tests__/flow.test.js` runs the full flow against a real server:

1. Activate.
2. Log in with the PIN.
3. Open the register.
4. Make a quick invoice (printed).
5. Place a dine-in order (KOT printed).
6. Pay that order from Running orders.

The test needs a fresh device key each run, because keys are single use.

```bash
REZTRA_TEST_KEY=RZT1.xxxx REZTRA_TEST_SCREEN=phone  npx jest
REZTRA_TEST_KEY=RZT1.xxxx REZTRA_TEST_SCREEN=tablet npx jest
```

Optional: `REZTRA_TEST_PIN` (default 1111) and `REZTRA_TEST_ITEM` (default Pepsi).
