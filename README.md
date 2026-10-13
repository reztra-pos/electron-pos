# Reztra POS — Electron + React (Windows)

Desktop POS app: PIN login → POS main screen. React 19 + Vite, packaged with Electron.

## 1. Requirements (install once on Windows)
- **Node.js 20 LTS or newer** — https://nodejs.org (tick "Add to PATH")
- **Git** (optional) — https://git-scm.com
- **VS Code** (recommended) — https://code.visualstudio.com

Check in PowerShell:
```powershell
node -v
npm -v
```

## 2. Install
```powershell
cd reztra-pos
npm install
copy .env.example .env
```

## 3. Run in development
```powershell
npm run dev
```
Starts the Vite dev server and opens the Electron window with hot reload and DevTools.
Demo logins: **PIN 1234**, or **admin / admin**.

To work in a normal browser instead: `npm run dev:web` and open http://127.0.0.1:5173

## 4. Build the Windows installer
```powershell
npm run dist
```
Creates `release\Reztra POS Setup 1.0.0.exe`.

## Scripts
| Command            | What it does                                         |
|--------------------|------------------------------------------------------|
| `npm run dev`      | Vite + Electron with hot reload                      |
| `npm run dev:web`  | React only, in the browser                           |
| `npm run build`    | Build the React app into `dist/`                     |
| `npm start`        | Run Electron against the built `dist/`               |
| `npm run dist`     | Build + create the Windows installer in `release/`   |

## Project structure
```
reztra-pos/
├─ electron/
│  ├─ main.cjs        Electron window, IPC handlers, startup
│  ├─ preload.cjs     window.electronAPI (device, data, auth, invoices, sync…)
│  ├─ crypto.cjs      Device key encrypt/decrypt (AES-256-GCM), PIN hashing
│  ├─ key-secret.cjs  Shared secret for device keys — change before shipping
│  ├─ device.cjs      Activation + encrypted device storage (DPAPI)
│  ├─ db.cjs          SQLite (built-in node:sqlite): catalogue, staff, invoice queue
│  └─ sync.cjs        Pull master data / push invoices, online status
├─ scripts/          mock-api.mjs (test backend), make-key.mjs, mock-data.json
├─ docs/             DEVICE-AND-SYNC.md, API-CONTRACT.md
├─ src/
│  ├─ main.jsx        React entry
│  ├─ App.jsx         Routes: /login → /pos (HashRouter, works from file://)
│  ├─ session.js      Logged-in user + token
│  ├─ api/
│  │  ├─ client.js    Axios instance (base URL, token header, error messages)
│  │  └─ auth.js      PIN / password login (mock or real API)
│  └─ pages/
│     ├─ Activate.jsx First-run device activation
│     ├─ Login.jsx    PIN login screen
│     └─ PosMain.jsx  POS main screen
├─ index.html
├─ vite.config.js
├─ .env.example
├─ build/icon.png     app icon (replace with your logo, 512×512 PNG)
└─ package.json       scripts + electron-builder config
```

## Devices, offline mode and sync
First launch asks for a **device API key** from the web app. Data is stored in SQLite so the POS keeps
billing offline and uploads invoices when the connection is back.
See **docs/DEVICE-AND-SYNC.md** (flow, key format, PHP key generator, security) and
**docs/API-CONTRACT.md** (endpoints your backend must provide).

Try it without a backend:
```powershell
npm run mock-api      # in one terminal
npm run make-key      # copy the printed key
npm run dev           # paste the key, then PIN 1234
```

## Connecting your API
1. In `.env` set `VITE_API_URL` to your backend and `VITE_USE_MOCK=false`.
2. Login calls are in `src/api/auth.js` — adjust the URLs and response mapping to your backend.
3. Add more API files next to it (e.g. `src/api/menu.js`, `src/api/orders.js`) using the shared `api` client;
   the token is attached automatically and a 401 sends the user back to the login screen.

## Electron options (environment variables)
| Variable              | Effect                                                      |
|-----------------------|-------------------------------------------------------------|
| `POS_KIOSK=1`         | Full-screen kiosk mode (no Windows title bar or taskbar)     |
| `POS_FRAMELESS=1`     | Hide the Windows title bar; the login shows its own buttons |
| `POS_TERMINAL_ID=POS-02` | Terminal name shown on login and sent with PIN logins    |

Example (PowerShell): `$env:POS_KIOSK="1"; npm start`
