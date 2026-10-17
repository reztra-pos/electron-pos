// Online API client (main process). Every screen action goes to the server; nothing is stored on this PC
// except the device registration (device.cjs).
//  - device token: proves this PC is an activated till (sent as X-Device-Token on login)
//  - user token:   the logged-in cashier/waiter (sent as Authorization: Bearer on every call)
// The server answers { success, message, data } or { success:false, code, message, errors }.
const { net } = require("electron");
const crypto = require("crypto");
const device = require("./device.cjs");
const { netReason } = require("./net-error.cjs");

const TIMEOUT_MS = 20000;
let userToken = null;
let onRevoked = () => {};
let onSessionEnded = () => {};

class ApiError extends Error {
  constructor(message, { status = 0, code = "", errors = null, network = false } = {}) {
    super(message);
    Object.assign(this, { status, code, errors, network });
  }
}

async function request(method, path, body, { useUser = true, deviceHeader = false, idempotencyKey = null, timeout = TIMEOUT_MS } = {}) {
  const d = device.load();
  if (!d) throw new ApiError("This PC is not activated.", { code: "DEVICE_NOT_ACTIVATED" });
  const headers = { Accept: "application/json", "Content-Type": "application/json", "X-Device-Id": d.device_id };
  if (useUser && userToken) headers.Authorization = `Bearer ${userToken}`;
  if (!useUser) headers.Authorization = `Bearer ${d.device_token}`;
  if (deviceHeader) headers["X-Device-Token"] = d.device_token;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let res;
  try {
    res = await net.fetch(`${d.url}${path}`, {
      method,
      headers,
      body: body !== undefined && body !== null && method !== "GET" ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw new ApiError(`No connection to the server. ${netReason(e)}`, { network: true, code: "NETWORK" });
  }
  const text = await res.text().catch(() => "");
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }

  if (!res.ok || (json && json.success === false)) {
    const code = json?.code || "";
    const message = json?.message || `Server error (HTTP ${res.status}). ${text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)}`.trim();
    if (res.status === 401 && /^DEVICE_/.test(code)) { userToken = null; onRevoked(message); }
    else if (res.status === 401 && useUser && userToken) { userToken = null; onSessionEnded(message); }
    throw new ApiError(message, { status: res.status, code, errors: json?.errors || null });
  }
  return json && "data" in json ? json.data : json;
}

// PIN or email login on this device. The server ties the session to the device's outlet.
async function login(credentials) {
  const data = await request("POST", "/v1/auth/login", credentials, { useUser: false, deviceHeader: true });
  userToken = data.token;
  return data;
}

async function logout() {
  if (!userToken) return true;
  try { await request("POST", "/v1/auth/logout"); } catch { /* token may already be gone */ }
  userToken = null;
  return true;
}

// Is this device still allowed? (Disabled in Settings -> POS Devices = 401 DEVICE_INVALID)
async function checkDevice() {
  return request("GET", "/v1/ping", null, { useUser: false, timeout: 10000 });
}

const newKey = () => crypto.randomUUID();
const hasUser = () => !!userToken;

module.exports = {
  request, login, logout, checkDevice, newKey, hasUser, ApiError,
  setHandlers: ({ revoked, sessionEnded }) => { if (revoked) onRevoked = revoked; if (sessionEnded) onSessionEnded = sessionEnded; },
};
