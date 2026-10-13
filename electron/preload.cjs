// Safe bridge between Electron and React — available as window.electronAPI
const { contextBridge, ipcRenderer } = require("electron");

// unwrap { ok, data, error } from main.cjs into a normal promise
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args).then((r) => {
  if (r && r.ok === false) throw new Error(r.error);
  return r && "data" in r ? r.data : r;
});

contextBridge.exposeInMainWorld("electronAPI", {
  isFrameless: process.env.POS_FRAMELESS === "1",
  minimize: () => ipcRenderer.send("win:minimize"),
  maximize: () => ipcRenderer.send("win:maximize"),
  close: () => ipcRenderer.send("win:close"),
  getAppInfo: () => ipcRenderer.invoke("app:info"),

  device: {
    get: () => call("device:get"),
    preview: (key) => call("device:preview", key),
    activate: (key) => call("device:activate", key),
    reset: (force) => call("device:reset", force),
  },
  data: {
    catalog: () => call("data:catalog"),
    refresh: () => call("data:refresh"),
  },
  auth: {
    pin: (pin) => call("auth:pin", pin),
    password: (u, p) => call("auth:password", u, p),
  },
  invoices: {
    save: (payload) => call("invoices:save", payload),
    recent: (limit) => call("invoices:recent", limit),
  },
  orders: {
    load: () => call("orders:load"),
    save: (orders) => call("orders:save", orders),
  },
  sync: {
    status: () => call("sync:status"),
    now: () => call("sync:now"),
    onStatus: (cb) => {
      const listener = (_e, s) => cb(s);
      ipcRenderer.on("sync:status", listener);
      return () => ipcRenderer.removeListener("sync:status", listener);
    },
  },
});
