// Sync engine: pulls master data into SQLite, pushes queued invoices when online.
// Invoices are always written locally first, so billing never waits for the network.
const db = require("./db.cjs");
const device = require("./device.cjs");

const PUSH_EVERY_MS = 15_000;     // retry queued invoices
const PULL_EVERY_MS = 5 * 60_000; // refresh items, prices, tables...
const PING_EVERY_MS = 30_000;     // online check when there is nothing to send
const TIMEOUT_MS = 10_000;        // per request — slow networks fall back to the queue
const BATCH = 20;

let notify = () => {};
let timer = null;
let busy = false;
let lastPullTs = 0;
let lastPingTs = 0;

const state = { online: null, syncing: false, pending: 0, rejected: 0, lastPullAt: null, lastPushAt: null, lastError: null, revoked: false };

function emit(patch = {}) {
  Object.assign(state, patch, { pending: db.countPending(), rejected: db.countRejected(), lastPullAt: db.getMeta("last_pull_at") });
  notify({ ...state });
}

async function request(path, { method = "GET", body, headers = {} } = {}) {
  const d = device.load();
  if (!d) throw Object.assign(new Error("Device is not activated."), { fatal: true });
  let res;
  try {
    res = await fetch(`${d.url}${path}`, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${d.device_token}`, "X-Device-Id": d.device_id, ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw Object.assign(new Error(e.name === "TimeoutError" ? "Server is too slow to respond." : "No connection to the server."), { network: true });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    emit({ revoked: true });
    throw Object.assign(new Error(data.message || "This device has been disabled in the web app."), { fatal: true });
  }
  if (!res.ok) throw Object.assign(new Error(data.message || `Server error (HTTP ${res.status}).`), { status: res.status, code: data.code });
  // the API wraps every answer as { success, message, data }
  return data && typeof data === "object" && "success" in data && "data" in data ? data.data : data;
}

async function pull(full = false) {
  const since = full ? null : db.getMeta("last_pull");
  const data = await request(`/v1/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ""}`);
  db.applyPull({ ...data, full: !since || data.full });
  lastPullTs = Date.now();
  return data;
}

async function push() {
  let sent = 0;
  for (;;) {
    const batch = db.pendingInvoices(BATCH);
    if (!batch.length) break;
    const data = await request("/v1/sync/invoices", { method: "POST", body: { invoices: batch.map(({ _attempts, ...inv }) => inv) } });
    const results = new Map((data.results || []).map((r) => [r.uuid, r]));
    for (const inv of batch) {
      const r = results.get(inv.uuid);
      if (r && (r.status === "ok" || r.status === "duplicate")) { db.markSynced(inv.uuid, r.server_no); sent++; }
      else if (r && r.status === "error") db.markRejected(inv.uuid, r.message || "Rejected by server");
      else db.markFailed(inv.uuid, "No result returned for this invoice");
    }
    if (!results.size) break;
  }
  if (sent) state.lastPushAt = new Date().toISOString();
  return sent;
}

// One sync cycle. force=true pulls master data now.
async function run({ forcePull = false, fullPull = false } = {}) {
  if (busy || !device.load()) return { ...state };
  busy = true;
  emit({ syncing: true });
  try {
    if (db.countPending() > 0) await push();
    if (forcePull || fullPull || !db.hasCatalog() || Date.now() - lastPullTs > PULL_EVERY_MS) await pull(fullPull);
    else if (Date.now() - lastPingTs > PING_EVERY_MS) { await request("/v1/ping"); lastPingTs = Date.now(); }
    emit({ online: true, syncing: false, lastError: null });
  } catch (e) {
    emit({ online: e.network ? false : state.online, syncing: false, lastError: e.message });
    if (forcePull || fullPull) { busy = false; throw e; }
  }
  busy = false;
  return { ...state };
}

function start(onStatus) {
  notify = onStatus;
  stop();
  timer = setInterval(() => run().catch(() => {}), PUSH_EVERY_MS);
  run().catch(() => {});
}
function stop() { if (timer) clearInterval(timer); timer = null; }
const status = () => { emit(); return { ...state }; };

module.exports = { start, stop, run, pull, status, request };
