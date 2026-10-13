// Device API key format:  RZT1.<base64url( iv[12] | tag[16] | ciphertext )>
// Cipher: AES-256-GCM, key = SHA-256(secret). GCM also detects tampered keys.
// Payload (JSON): { v, url, device_id, outlet_id, code, exp }
const crypto = require("crypto");
const SECRET = require("./key-secret.cjs");

const PREFIX = "RZT1.";
const keyBytes = () => crypto.createHash("sha256").update(SECRET).digest();
const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function encryptApiKey(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBytes(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return PREFIX + b64url(Buffer.concat([iv, cipher.getAuthTag(), ct]));
}

function decryptApiKey(apiKey) {
  const raw = String(apiKey || "").trim().replace(/\s+/g, "");
  if (!raw.startsWith(PREFIX)) throw new Error("This is not a Reztra device key.");
  let data;
  try { data = fromB64url(raw.slice(PREFIX.length)); } catch { throw new Error("The key is damaged. Copy it again from the web app."); }
  if (data.length < 29) throw new Error("The key is incomplete. Copy it again from the web app.");
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyBytes(), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    const json = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
    const p = JSON.parse(json);
    if (!p.url || !p.device_id) throw new Error("missing fields");
    if (p.exp && Date.now() / 1000 > p.exp) throw new Error("This key has expired. Generate a new one in the web app.");
    return { url: String(p.url).replace(/\/+$/, ""), device_id: String(p.device_id), outlet_id: p.outlet_id || null, code: p.code || null, exp: p.exp || null };
  } catch (e) {
    if (/expired/.test(e.message)) throw e;
    throw new Error("Invalid key. Check that it was copied completely and generated for this app.");
  }
}

// Short hash used for offline PIN checks: sha256(salt + ":" + pin)
const hashPin = (pin, salt) => crypto.createHash("sha256").update(`${salt}:${pin}`).digest("hex");

module.exports = { encryptApiKey, decryptApiKey, hashPin };
