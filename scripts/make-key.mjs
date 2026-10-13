// Generate a device API key for testing (the web app does this in production).
// Usage: npm run make-key -- --url http://127.0.0.1:8787/api --device DEV-001 --outlet OUT-1 --days 7
import { createRequire } from "module";
import crypto from "crypto";
const require = createRequire(import.meta.url);
const { encryptApiKey, decryptApiKey } = require("../electron/crypto.cjs");

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; };
const payload = {
  v: 1,
  url: arg("url", "http://127.0.0.1:8787/api"),
  device_id: arg("device", "DEV-001"),
  outlet_id: arg("outlet", "OUT-1"),
  code: arg("code", crypto.randomBytes(6).toString("hex")),   // one-time activation code, checked by the server
  exp: Math.floor(Date.now() / 1000) + Number(arg("days", "7")) * 86400,
};
const key = encryptApiKey(payload);
console.log("\nDevice API key:\n\n" + key + "\n");
console.log("Contains:", decryptApiKey(key), "\n");
