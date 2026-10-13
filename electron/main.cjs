// Electron main process
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const db = require("./db.cjs");
const device = require("./device.cjs");
const sync = require("./sync.cjs");
const { hashPin } = require("./crypto.cjs");

const DEV_URL = process.env.VITE_DEV_SERVER_URL;       // set by `npm run dev`
const KIOSK = process.env.POS_KIOSK === "1";            // POS_KIOSK=1 -> fullscreen kiosk mode
const FRAMELESS = process.env.POS_FRAMELESS === "1";    // POS_FRAMELESS=1 -> no Windows title bar

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 768, minWidth: 800, minHeight: 600, show: false,
    frame: !FRAMELESS, kiosk: KIOSK, autoHideMenuBar: true, backgroundColor: "#EDF0F4", title: "Reztra POS",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once("ready-to-show", () => { win.maximize(); win.show(); });
  if (DEV_URL) { win.loadURL(DEV_URL); win.webContents.openDevTools({ mode: "detach" }); }
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };
// wrap handlers so the renderer receives { ok, data } or { ok:false, error } instead of a raw exception
const handle = (channel, fn) => ipcMain.handle(channel, async (_e, ...args) => {
  try { return { ok: true, data: await fn(...args) }; } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

/* ---------- window + app ---------- */
ipcMain.on("win:minimize", () => win?.minimize());
ipcMain.on("win:maximize", () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on("win:close", () => win?.close());
ipcMain.handle("app:info", () => {
  const d = device.publicInfo();
  return { version: app.getVersion(), terminal: d?.device_name || "Not activated", outlet: d?.outlet_name || "" };
});

/* ---------- device activation ---------- */
handle("device:get", () => device.publicInfo());
handle("device:preview", (key) => device.preview(key));
handle("device:activate", async (key) => {
  const info = await device.activate(key);
  db.wipe();                         // fresh data for the new outlet (queued invoices are kept)
  await sync.pull(true);             // first full download — required before going offline
  sync.start((s) => send("sync:status", s));
  return info;
});
handle("device:reset", (force) => {
  if (!force && db.countPending() > 0) throw new Error(`${db.countPending()} invoices are not synced yet. Connect to the internet first, or force the reset.`);
  sync.stop(); device.clear(); db.wipe();
  return true;
});

/* ---------- data ---------- */
handle("data:catalog", () => db.getCatalog());
handle("data:refresh", async () => { await sync.run({ forcePull: true }); return db.getCatalog(); });

/* ---------- login ---------- */
let currentStaffId = null;
handle("auth:pin", async (pin) => {
  // checked against the staff list stored on this PC, so it works offline
  const staff = db.findStaffByPinHash(hashPin, String(pin));
  if (!staff) throw new Error("Incorrect PIN. Please try again.");
  currentStaffId = staff.id;           // offline invoices are recorded under this user on the server
  return { ...staff, device: device.publicInfo()?.device_name };
});
handle("auth:password", async (username, password) => {
  try {
    const d = device.load();
    const data = await sync.request("/v1/auth/login", {
      method: "POST", body: { email: username, password, client: `windows-pos ${app.getVersion()}` },
      headers: d ? { "X-Device-Token": d.device_token } : {},
    });
    currentStaffId = data.user?.id ?? null;
    return { ...data.user, token: data.token };
  } catch (e) {
    if (e.network) throw new Error("Username login needs an internet connection. Use your PIN to work offline.");
    throw e;
  }
});

/* ---------- invoices + running orders ---------- */
handle("invoices:save", (payload) => {
  const d = device.load();
  const saved = db.saveInvoice({ ...payload, user_id: currentStaffId, device_id: d?.device_id, outlet_id: d?.outlet_id }, d?.device_short || "POS");
  setTimeout(() => sync.run().catch(() => {}), 50);   // try to send right away; stays queued if offline/slow
  return saved;
});
handle("invoices:recent", (limit) => db.recentInvoices(limit));
handle("orders:load", () => db.getMeta("running_orders", []));
handle("orders:save", (orders) => db.setMeta("running_orders", orders));

/* ---------- sync ---------- */
handle("sync:status", () => sync.status());
handle("sync:now", () => sync.run({ forcePull: true }));

/* ---------- startup ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    db.open(app.getPath("userData"));
    createWindow();
    if (device.load()) sync.start((s) => send("sync:status", s));
  });
  app.on("window-all-closed", () => { sync.stop(); if (process.platform !== "darwin") app.quit(); });
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
