// Safe bridge between Electron and React — available as window.electronAPI
const { contextBridge, ipcRenderer } = require("electron");

// unwrap { ok, data, error, code } from main.cjs into a normal promise; errors keep the server's code
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args).then((r) => {
  if (r && r.ok === false) {
    const err = new Error(r.error);
    Object.assign(err, { code: r.code, status: r.status, errors: r.errors, network: r.network });
    throw err;
  }
  return r && "data" in r ? r.data : r;
});
const on = (channel, cb) => {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("electronAPI", {
  online: true,
  isFrameless: process.env.POS_FRAMELESS === "1",
  minimize: () => ipcRenderer.send("win:minimize"),
  maximize: () => ipcRenderer.send("win:maximize"),
  close: () => ipcRenderer.send("win:close"),
  getAppInfo: () => ipcRenderer.invoke("app:info"),

  device: {
    get: () => call("device:get"),
    preview: (key) => call("device:preview", key),
    activate: (key) => call("device:activate", key),
    check: () => call("device:check"),
    reset: () => call("device:reset"),
    onRevoked: (cb) => on("device:revoked", cb),
  },
  auth: {
    pin: (pin) => call("auth:pin", pin),
    password: (email, password) => call("auth:password", email, password),
    logout: () => call("auth:logout"),
    active: () => call("auth:active"),
    onSessionEnded: (cb) => on("session:ended", cb),
  },
  api: {
    call: (method, path, body, opts) => call("api:call", method, path, body, opts),
    newKey: () => call("api:newKey"),
  },
  print: {
    html: (html, opts) => call("print:html", html, opts),
  },
});
