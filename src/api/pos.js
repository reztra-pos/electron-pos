// POS API calls from the screen. Requests are made by the Electron main process (electron/api.cjs),
// which adds the device + user tokens. Errors carry the server's code: err.code, err.errors, err.network.
const E = typeof window !== "undefined" ? window.electronAPI : undefined;

export const isOnlineApp = !!E?.api;

export const call = (method, path, body, opts) => {
  if (!E?.api) return Promise.reject(new Error("The POS screen needs the Reztra POS desktop app."));
  return E.api.call(method, path, body, opts);
};
export const get = (path) => call("GET", path);
export const post = (path, body, opts) => call("POST", path, body, opts);
export const put = (path, body, opts) => call("PUT", path, body, opts);
export const del = (path, body) => call("DELETE", path, body);
// one key per user action, so a retried request never creates a second order or payment
export const newKey = () => (E?.api ? E.api.newKey() : Promise.resolve(String(Date.now())));

export const printHtml = (html, opts) => (E?.print ? E.print.html(html, opts) : Promise.reject(new Error("Printing needs the desktop app.")));
// raw ESC/POS job from the API: { title, printer, print_bytes, error }
export const printRaw = (job) => (E?.print?.raw ? E.print.raw(job) : Promise.reject(new Error("Printing needs the desktop app.")));