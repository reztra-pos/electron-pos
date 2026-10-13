# Devices, API keys and offline sync

## Flow
1. **Web app → Settings → Devices → Add device** (linked to an outlet) → **Generate API key**.
2. On the POS PC, first launch shows **Activate this POS**. Paste the key.
3. The app decrypts the key **inside Electron** (main process), shows server / device / outlet, then calls
   `POST {url}/v1/devices/activate`. The server returns a **device token**, stored on the PC encrypted with
   Windows DPAPI (`%APPDATA%\Reztra POS\device.dat`).
4. The app downloads all master data into SQLite (`%APPDATA%\Reztra POS\reztra-pos.db`).
5. Staff log in with their PIN — checked against the synced staff list, so **login works offline**.
6. Every invoice is written to SQLite first (instant, even with no internet), then uploaded by the sync
   engine. The top bar shows **Online / Offline / Syncing** and how many invoices are queued.

## API key format
```
RZT1.<base64url( iv[12 bytes] | tag[16 bytes] | ciphertext )>
cipher  : AES-256-GCM
key     : SHA-256(shared secret)            (secret = electron/key-secret.cjs)
payload : {"v":1,"url":"https://api.example.com/api","device_id":"DEV-001",
           "outlet_id":"OUT-1","code":"<one-time activation code>","exp":<unix seconds>}
```
GCM rejects keys that were edited or copied incompletely.

### Generate a key in the web app (PHP / Laravel / CodeIgniter)
```php
function reztra_device_key(array $payload, string $secret): string {
    $key = hash('sha256', $secret, true);
    $iv  = random_bytes(12);
    $tag = '';
    $ct  = openssl_encrypt(json_encode($payload, JSON_UNESCAPED_SLASHES), 'aes-256-gcm',
                           $key, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
    return 'RZT1.' . rtrim(strtr(base64_encode($iv . $tag . $ct), '+/', '-_'), '=');
}

$apiKey = reztra_device_key([
    'v' => 1, 'url' => 'https://api.yourdomain.com/api', 'device_id' => $device->uid,
    'outlet_id' => $device->outlet_uid, 'code' => $device->activation_code,   // store hashed, single use
    'exp' => time() + 7 * 86400,
], env('REZTRA_KEY_SECRET'));
```
(Tested: keys generated with this PHP function decrypt correctly in the app.)

Testing without the web app: `npm run make-key -- --url http://127.0.0.1:8787/api --device DEV-001`

### Security — read this
The decryption secret ships inside the installed app, so a determined person can extract it.
The encryption protects the key from casual reading and tampering; **real security comes from the server**:
- `code` must be **single-use** and expire (the `exp` field) — the server rejects reused codes.
- After activation the app uses only the **device token**. Store it hashed on the server; the web app can
  **revoke** a device (the POS then shows "Device disabled").
- Optionally lock the token to the machine (`machine.hostname` is sent on activation).
- Use HTTPS in production.

## Sync behaviour
| What                     | When                                                               |
|--------------------------|--------------------------------------------------------------------|
| Upload queued invoices   | Immediately after each sale, then every 15 s while any are queued |
| Download master data     | On activation (full), then every 5 min (changes since last pull), and on "Sync now" |
| Online check             | Every 30 s                                                        |
| Request timeout          | 10 s — slow networks fall back to the queue, billing never waits  |

- Each invoice has a **UUID** generated on the PC. The server must treat it as an idempotency key, so a
  retry after a timeout never creates a duplicate.
- Offline invoice numbers are `<DEVICE>-000001`; the server returns the final number (e.g. `INV-1045`).
- Running (unpaid) orders are saved on the PC so a restart or power cut doesn't lose them.
- Invoices the server refuses (validation error) are marked **rejected** and shown in Recent sales.

## Test it locally
```powershell
npm run mock-api                          # fake backend on http://127.0.0.1:8787/api
npm run make-key                          # prints a key for it
npm run dev                               # paste the key, PIN 1234
```
Stop `mock-api` (Ctrl+C) to go offline, make sales, start it again — queued invoices upload within 15 s.
`npm run mock-api -- --slow 12000` simulates a very slow network.

To reset a PC (e.g. move it to another outlet), delete `%APPDATA%\Reztra POS\device.dat`, or call
`window.electronAPI.device.reset()` from a settings screen.
