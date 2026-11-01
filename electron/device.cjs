// Device registration: stores the decrypted connection + device token on this PC.
// Saved in %APPDATA%\Reztra POS\device.dat, encrypted with Windows DPAPI (Electron safeStorage).
const { app, safeStorage, net } = require("electron");
const { netReason } = require("./net-error.cjs");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { decryptApiKey } = require("./crypto.cjs");

const file = () => path.join(app.getPath("userData"), "device.dat");
let cache;

function load() {
  if (cache !== undefined) return cache;
  try {
    const buf = fs.readFileSync(file());
    const text = safeStorage.isEncryptionAvailable() && buf[0] !== 0x7b /* '{' */ ? safeStorage.decryptString(buf) : buf.toString("utf8");
    cache = JSON.parse(text);
  } catch { cache = null; }
  return cache;
}

function save(data) {
  const text = JSON.stringify(data);
  fs.writeFileSync(file(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, "utf8"));
  cache = data;
}

function clear() {
  try { fs.unlinkSync(file()); } catch {}
  cache = null;
}

// What the activation screen shows before connecting: the key is checked with the server (not used up) so the
// screen can show the device and outlet NAMES. Never exposes the token or the server address.
async function preview(apiKey) {
  const k = decryptApiKey(apiKey);
  const out = { device_id: k.device_id, device_name: "", outlet_id: k.outlet_id, outlet_name: "", expires: k.exp ? new Date(k.exp * 1000).toISOString() : null, checked: false };
  let res;
  try {
    res = await net.fetch(`${k.url}/v1/devices/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ device_id: k.device_id, code: k.code }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    throw new Error(`Can't reach the server. ${netReason(e)}`);
  }
  const raw = await res.json().catch(() => ({}));
  if (res.status === 404 && !raw.code) return out;               // older server without the check: show what the key has
  if (!res.ok) throw new Error(raw.message || `The server refused this key (HTTP ${res.status}).`);
  const body = raw && "data" in raw ? raw.data : raw;
  return { ...out, device_name: body.device?.name || "", outlet_name: body.outlet?.name || "", checked: true };
}

async function activate(apiKey) {
  const k = decryptApiKey(apiKey);
  let res;
  try {
    // net.fetch = Chromium networking: trusts the same certificates as Chrome / Windows (incl. mkcert for ddev)
    res = await net.fetch(`${k.url}/v1/devices/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        device_id: k.device_id, code: k.code,
        machine: { hostname: os.hostname(), platform: process.platform, arch: process.arch },
        app_version: app.getVersion(),
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new Error(`Can't reach the server at ${k.url}. ${netReason(e)}`);
  }
  try { require("./trial.cjs").seeServerTime(res.headers.get("date")); } catch { /* not a testing build */ }
  const text = await res.text().catch(() => "");
  let raw = {};
  try { raw = JSON.parse(text); } catch { /* not JSON: an HTML error page from the server */ }
  if (!res.ok) {
    const page = text.replace(/<(head|style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    throw new Error(raw.message || `The server refused the activation (HTTP ${res.status}).${page ? " " + page.slice(0, 300) : ""}`);
  }
  const body = raw && "success" in raw && "data" in raw ? raw.data : raw;   // { success, message, data } envelope
  if (!body.device_token) throw new Error("The server response is missing the device token.");

  const data = {
    url: k.url,
    device_id: k.device_id,
    device_name: body.device?.name || k.device_id,
    device_short: (body.device?.short || k.device_id).replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase() || "POS",
    outlet_id: body.outlet?.id || k.outlet_id,
    outlet_name: body.outlet?.name || "",
    device_token: body.device_token,
    activated_at: new Date().toISOString(),
  };
  save(data);
  return publicInfo(data);
}

const publicInfo = (d = load()) => d && {
  url: d.url, device_id: d.device_id, device_name: d.device_name, device_short: d.device_short,
  outlet_id: d.outlet_id, outlet_name: d.outlet_name, activated_at: d.activated_at,
};

module.exports = { load, preview, activate, clear, publicInfo };
