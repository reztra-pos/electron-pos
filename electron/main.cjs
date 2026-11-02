// Electron main process — ONLINE mode.
// The POS screen talks to the server for everything (menu, orders, kitchen, payments, ZATCA).
// Only the device registration is kept on this PC (device.cjs). No local database, no offline queue.
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const device = require("./device.cjs");
const api = require("./api.cjs");
const { printRaw } = require("./printer.cjs");
const trial = require("./trial.cjs");

const DEV_URL = process.env.VITE_DEV_SERVER_URL;       // set by `npm run dev`
const KIOSK = process.env.POS_KIOSK === "1";            // POS_KIOSK=1 -> fullscreen kiosk mode
const FRAMELESS = process.env.POS_FRAMELESS === "1";    // POS_FRAMELESS=1 -> no Windows title bar
const DEVICE_CHECK_MS = 60_000;                         // how often to confirm the device is still enabled

let win;
let deviceTimer = null;
let closeGuard = false;   // true while the POS screen wants to be asked before the window closes
let allowClose = false;   // set once the user has answered "exit"

function windowTitle() {
  const t = trial.status();
  if (!t.enabled) return "Reztra POS";
  return t.expired ? "Reztra POS — TESTING PERIOD ENDED" : `Reztra POS — TESTING MODE (until ${new Date(t.until).toLocaleString()})`;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 768, minWidth: 800, minHeight: 600, show: false,
    frame: !FRAMELESS, kiosk: KIOSK, autoHideMenuBar: true, backgroundColor: "#EDF0F4", title: windowTitle(),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once("ready-to-show", () => { win.maximize(); win.show(); });
  win.on("page-title-updated", (e) => { e.preventDefault(); win.setTitle(windowTitle()); });   // keep the testing label in the title
  // closing the window while a cashier's register is open: the POS screen asks first (close register / exit / cancel)
  win.on("close", (e) => {
    if (allowClose || !closeGuard || win.webContents.isCrashed()) return;
    e.preventDefault();
    if (win.isMinimized()) win.restore();
    win.focus();
    send("app:close-request");
  });
  win.on("session-end", () => { allowClose = true; });                   // Windows shut down / log off: don't block it
  win.on("unresponsive", () => { closeGuard = false; });                 // a frozen screen can't answer: let it close
  win.webContents.on("render-process-gone", () => { closeGuard = false; });
  win.webContents.on("did-start-loading", () => { closeGuard = false; }); // reload: the screen registers again
  if (DEV_URL) { win.loadURL(DEV_URL); win.webContents.openDevTools({ mode: "detach" }); }
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };
// handlers answer { ok, data } or { ok:false, error, code, status, errors } so the screen gets the server's reason
// testing build: these stop working when the testing period is over
const TRIAL_GUARDED = new Set(["device:activate", "auth:pin", "auth:password", "api:call", "api:newKey", "print:raw", "print:html", "print:pdf"]);
const handle = (channel, fn) => ipcMain.handle(channel, async (_e, ...args) => {
  try {
    if (TRIAL_GUARDED.has(channel) && trial.isExpired()) { trialEnded(); trial.guard(); }
    return { ok: true, data: await fn(...args) };
  }
  catch (e) { return { ok: false, error: e.message || String(e), code: e.code || "", status: e.status || 0, errors: e.errors || null, network: !!e.network }; }
});

/* ---------- device disabled / session ended: tell the screen ---------- */
api.setHandlers({
  revoked: (message) => {
    device.clear();                                     // this PC must be activated again with a new key
    stopDeviceCheck();
    send("device:revoked", message);
  },
  sessionEnded: (message) => send("session:ended", message),
});

function startDeviceCheck() {
  stopDeviceCheck();
  deviceTimer = setInterval(() => {
    const d = device.load();
    if (!d) return;
    // access period over (the server refuses this PC from then on too): back to the activation screen
    if (d.access_until && Date.now() >= Date.parse(d.access_until)) {
      api.logout().catch(() => {});
      device.clear(); stopDeviceCheck();
      send("device:revoked", `The access period of this device ended on ${new Date(d.access_until).toLocaleString()}. Ask your manager for a new key.`);
      return;
    }
    api.checkDevice().then((r) => { if (r && "access_until" in r) device.setAccessUntil(r.access_until); }).catch(() => {});
  }, DEVICE_CHECK_MS);
}
function stopDeviceCheck() { if (deviceTimer) clearInterval(deviceTimer); deviceTimer = null; }

/* ---------- testing build ---------- */
let trialNotified = false;
function trialEnded() {
  if (trialNotified) return;
  trialNotified = true;
  api.logout().catch(() => {});
  if (win && !win.isDestroyed()) win.setTitle(windowTitle());
  send("trial:expired", trial.status());
}
handle("app:trial", () => trial.status());
if (trial.enabled) setInterval(() => { if (trial.isExpired()) trialEnded(); }, 60_000);

/* ---------- window + app ---------- */
ipcMain.on("win:minimize", () => win?.minimize());
ipcMain.on("win:maximize", () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on("win:close", () => win?.close());
ipcMain.on("app:close-guard", (_e, on) => { closeGuard = !!on; });
ipcMain.on("app:close-confirmed", () => { allowClose = true; if (win && !win.isDestroyed()) win.close(); });
ipcMain.handle("app:info", () => {
  const d = device.publicInfo();
  return { version: app.getVersion(), terminal: d?.device_name || "Not activated", outlet: d?.outlet_name || "" };
});

/* ---------- device activation ---------- */
handle("device:get", () => device.publicInfo());
handle("device:preview", (key) => device.preview(key));
handle("device:activate", async (key) => {
  const info = await device.activate(key);
  startDeviceCheck();
  return info;
});
// startup check: is the saved registration still enabled on the server?
handle("device:check", async () => {
  if (!device.load()) return { active: false };
  try { await api.checkDevice(); return { active: true }; }
  catch (e) {
    if (/^DEVICE_/.test(e.code || "")) return { active: false, message: e.message };
    return { active: true, offline: !!e.network, message: e.message };   // server unreachable: keep the registration
  }
});
handle("device:reset", async () => { await api.logout(); device.clear(); stopDeviceCheck(); return true; });

/* ---------- login ---------- */
const sessionUser = (data) => ({
  ...data.user,
  permissions: data.permissions,
  outlet: data.outlet,
  company: data.company,
  device: device.publicInfo()?.device_name,
});
handle("auth:pin", async (pin) => sessionUser(await api.login({ pin: String(pin), client: `windows-pos ${app.getVersion()}` })));
handle("auth:password", async (email, password) => sessionUser(await api.login({ email, password, client: `windows-pos ${app.getVersion()}` })));
handle("auth:logout", () => api.logout());
handle("auth:active", () => api.hasUser());

/* ---------- every POS action ---------- */
// call(method, path, body, { idempotencyKey }) -> data. Idempotency keys make retries safe (no double orders / payments).
handle("api:call", (method, apiPath, body, opts = {}) => {
  if (typeof apiPath !== "string" || !apiPath.startsWith("/v1/")) throw new Error("Invalid API path");
  return api.request(String(method || "GET").toUpperCase(), apiPath, body, { idempotencyKey: opts.idempotencyKey || null });
});
handle("api:newKey", () => api.newKey());

/* ---------- printing ---------- */
// KOT, draft and invoice: raw ESC/POS bytes from the server (Escposbuilder), sent straight to the printer.
// job = { title, printer: { type, printer_ip_address, printer_port, path }, print_bytes }
handle("print:raw", (job) => printRaw(job && job.printer, job && job.print_bytes));

// register report (HTML) on the default Windows printer
// A4 PDF from an HTML page (register report download): asks where to save it, then opens it.
handle("print:pdf", async (html, { fileName = "report.pdf", open = true } = {}) => {
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await pw.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await pw.webContents.printToPDF({ pageSize: "A4", printBackground: true, margins: { marginType: "default" } });
    const safe = String(fileName).replace(/[\\/:*?"<>|]+/g, "-");
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Save PDF", defaultPath: path.join(app.getPath("downloads"), safe), filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (canceled || !filePath) return { saved: false };
    await fs.promises.writeFile(filePath, pdf);
    if (open) shell.openPath(filePath).catch(() => {});
    return { saved: true, path: filePath };
  } finally { pw.destroy(); }
});

handle("print:html", (html, { silent = true } = {}) => new Promise((resolve, reject) => {
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  pw.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).then(() => {
    const done = (ok, reason) => {
      if (ok || !silent) { pw.destroy(); return ok ? resolve(true) : reject(new Error(reason || "Printing failed")); }
      // no default printer / silent print refused: show the normal print dialog instead
      pw.webContents.print({ silent: false, printBackground: true }, (ok2, reason2) => {
        pw.destroy(); ok2 ? resolve(true) : reject(new Error(reason2 || "Printing was cancelled"));
      });
    };
    pw.webContents.print({ silent, printBackground: true, margins: { marginType: "none" } }, done);
  }).catch((e) => { pw.destroy(); reject(e); });
}));

/* ---------- startup ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    createWindow();
    if (device.load()) startDeviceCheck();
  });
  app.on("window-all-closed", () => { stopDeviceCheck(); if (process.platform !== "darwin") app.quit(); });
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
