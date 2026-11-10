// Online API client — the same calls and headers as the desktop app (electron/api.cjs):
//  - device token: proves this tablet / phone is an activated till (X-Device-Token on login, Bearer for device calls)
//  - user token:   the logged-in cashier / waiter (Bearer on every POS call)
// The server answers { success, message, data } or { success:false, code, message, errors }.
import { Platform } from 'react-native';
import { loadDevice, saveDevice, clearDevice } from './storage';
import { decryptApiKey } from './crypto';
import { APP_VERSION, CLIENT, TIMEOUT_MS } from './config';
import { uuid } from './bytes';

export class ApiError extends Error {
  constructor(message, { status = 0, code = '', errors = null, network = false } = {}) {
    super(message);
    this.status = status; this.code = code; this.errors = errors; this.network = network;
  }
}

let device = null;          // { url, device_id, device_token, ... }
let userToken = null;
const handlers = { revoked: () => {}, sessionEnded: () => {} };
export const setHandlers = (h) => Object.assign(handlers, h);

export async function getDevice() {
  if (!device) device = await loadDevice();
  return device;
}

const netReason = (e) => (e?.name === 'AbortError' ? 'The server did not answer in time.' : 'Check the Wi-Fi / internet connection.');

async function fetchJson(url, { method = 'GET', headers = {}, body, timeout = TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers }, body, signal: ctrl.signal });
    const text = await res.text().catch(() => '');
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { res, json, text };
  } finally { clearTimeout(t); }
}

export async function request(method, path, body, { useUser = true, deviceHeader = false, idempotencyKey = null, timeout = TIMEOUT_MS } = {}) {
  const d = await getDevice();
  if (!d) throw new ApiError('This device is not activated.', { code: 'DEVICE_NOT_ACTIVATED' });
  const headers = { 'X-Device-Id': d.device_id };
  if (useUser && userToken) headers.Authorization = `Bearer ${userToken}`;
  if (!useUser) headers.Authorization = `Bearer ${d.device_token}`;
  if (deviceHeader) headers['X-Device-Token'] = d.device_token;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  let r;
  try {
    r = await fetchJson(`${d.url}${path}`, { method, headers, timeout, body: body != null && method !== 'GET' ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new ApiError(`No connection to the server. ${netReason(e)}`, { network: true, code: 'NETWORK' });
  }
  const { res, json, text } = r;
  if (!res.ok || (json && json.success === false)) {
    const code = json?.code || '';
    const message = json?.message || `Server error (HTTP ${res.status}). ${String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)}`.trim();
    if (res.status === 401 && /^DEVICE_/.test(code)) { userToken = null; handlers.revoked(message); }
    else if (res.status === 401 && useUser && userToken) { userToken = null; handlers.sessionEnded(message); }
    throw new ApiError(message, { status: res.status, code, errors: json?.errors || null });
  }
  return json && 'data' in json ? json.data : json;
}

export const get = (p) => request('GET', p);
export const post = (p, b, o) => request('POST', p, b, o);
export const put = (p, b, o) => request('PUT', p, b, o);
export const del = (p, b) => request('DELETE', p, b);
export const newKey = () => uuid();

/* ---------------- device activation ---------------- */

/** what the activation screen shows before connecting (device and outlet names) */
export async function previewKey(apiKey) {
  const k = decryptApiKey(apiKey);
  const out = { device_id: k.device_id, device_name: '', outlet_id: k.outlet_id, outlet_name: '', expires: k.exp ? new Date(k.exp * 1000).toISOString() : null, checked: false };
  let r;
  try { r = await fetchJson(`${k.url}/v1/devices/preview`, { method: 'POST', timeout: 10000, body: JSON.stringify({ device_id: k.device_id, code: k.code }) }); }
  catch (e) { throw new Error(`Can't reach the server. ${netReason(e)}`); }
  const raw = r.json || {};
  if (r.res.status === 404 && !raw.code) return out;
  if (!r.res.ok) throw new Error(raw.message || `The server refused this key (HTTP ${r.res.status}).`);
  const b = 'data' in raw ? raw.data : raw;
  return { ...out, device_name: b.device?.name || '', outlet_name: b.outlet?.name || '', access_days: b.access_days ?? null, checked: true };
}

export async function activate(apiKey, machine = {}) {
  const k = decryptApiKey(apiKey);
  let r;
  try {
    r = await fetchJson(`${k.url}/v1/devices/activate`, {
      method: 'POST', timeout: 15000,
      body: JSON.stringify({ device_id: k.device_id, code: k.code, machine: { hostname: machine.model || 'android', platform: Platform.OS, arch: machine.manufacturer || '' }, app_version: APP_VERSION }),
    });
  } catch (e) { throw new Error(`Can't reach the server at ${k.url}. ${netReason(e)}`); }
  const raw = r.json || {};
  if (!r.res.ok) {
    const page = String(r.text || '').replace(/<(head|style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    throw new Error(raw.message || `The server refused the activation (HTTP ${r.res.status}).${page ? ' ' + page.slice(0, 300) : ''}`);
  }
  const b = 'success' in raw && 'data' in raw ? raw.data : raw;
  if (!b.device_token) throw new Error('The server response is missing the device token.');
  const data = {
    url: k.url, device_id: k.device_id,
    device_name: b.device?.name || k.device_id,
    device_short: (b.device?.short || k.device_id).replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() || 'POS',
    outlet_id: b.outlet?.id || k.outlet_id, outlet_name: b.outlet?.name || '',
    device_token: b.device_token, activated_at: new Date().toISOString(), access_until: b.access_until || null,
  };
  await saveDevice(data);
  device = data;
  return data;
}

export async function resetDevice() {
  await logout();
  await clearDevice();
  device = null;
}

/** still enabled in Settings -> POS Devices? { active, offline, message } */
export async function checkDevice() {
  if (!(await getDevice())) return { active: false };
  try { await request('GET', '/v1/ping', null, { useUser: false, timeout: 10000 }); return { active: true }; }
  catch (e) {
    if (/^DEVICE_/.test(e.code || '')) return { active: false, message: e.message };
    return { active: true, offline: !!e.network, message: e.message };
  }
}

/* ---------------- login ---------------- */

const sessionUser = (data) => ({ ...data.user, permissions: data.permissions, outlet: data.outlet, company: data.company, device: device?.device_name, token: data.token });

export async function loginPin(pin) {
  const data = await request('POST', '/v1/auth/login', { pin: String(pin), client: CLIENT }, { useUser: false, deviceHeader: true });
  userToken = data.token;
  return sessionUser(data);
}
export async function loginPassword(email, password) {
  const data = await request('POST', '/v1/auth/login', { email, password, client: CLIENT }, { useUser: false, deviceHeader: true });
  userToken = data.token;
  return sessionUser(data);
}
export async function logout() {
  if (!userToken) return;
  try { await request('POST', '/v1/auth/logout'); } catch { /* token may already be gone */ }
  userToken = null;
}
export const hasUser = () => !!userToken;
