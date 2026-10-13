// Mock backend for testing activation, offline sync and invoices without the real API.
// Usage: npm run mock-api          (add --slow 3000 to simulate a slow network)
import http from "http";
import crypto from "crypto";
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const data = JSON.parse(fs.readFileSync(new URL("./mock-data.json", import.meta.url)));

const PORT = 8787;
const SLOW = Number(process.argv[process.argv.indexOf("--slow") + 1]) || 0;
// device tokens survive restarts so you can stop/start the mock to test offline mode
const DEV_FILE = new URL("./.mock-devices.json", import.meta.url);
const devices = new Map(fs.existsSync(DEV_FILE) ? Object.entries(JSON.parse(fs.readFileSync(DEV_FILE))) : []);
const saveDevices = () => fs.writeFileSync(DEV_FILE, JSON.stringify(Object.fromEntries(devices)));
const invoices = new Map();         // uuid -> server_no
let invoiceSeq = 1000 + Math.floor(Date.now() / 1000) % 100000 * 10; // unique across mock restarts

const hashPin = (pin, salt) => crypto.createHash("sha256").update(`${salt}:${pin}`).digest("hex");
const staff = data.staff.map((s) => { const salt = crypto.randomBytes(8).toString("hex"); return { id: s.id, name: s.name, role: s.role, pin_salt: salt, pin_hash: hashPin(s.pin, salt), _u: s.username, _p: s.password }; });

const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch { r({}); } }); });
const authed = (req) => { const t = (req.headers.authorization || "").replace("Bearer ", ""); return [...devices.values()].includes(t); };

http.createServer(async (req, res) => {
  if (SLOW) await new Promise((r) => setTimeout(r, SLOW));
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname.replace(/^\/api/, "");
  console.log(new Date().toLocaleTimeString(), req.method, p);

  if (p === "/v1/devices/activate" && req.method === "POST") {
    const b = await readBody(req);
    if (!b.device_id) return json(res, 422, { message: "device_id is required" });
    const token = crypto.randomBytes(24).toString("hex");
    devices.set(b.device_id, token); saveDevices();
    return json(res, 200, { device_token: token, device: { id: b.device_id, name: `Counter ${b.device_id.slice(-3)}`, short: b.device_id }, outlet: { id: data.outlet.id, name: data.outlet.name } });
  }
  if (!authed(req)) return json(res, 401, { message: "Device token is invalid. Activate the device again." });

  if (p === "/v1/ping") return json(res, 200, { ok: true, server_time: new Date().toISOString() });
  if (p === "/v1/sync/pull") {
    const { staff: _s, ...rest } = data;
    return json(res, 200, { ...rest, staff: staff.map(({ _u, _p, ...s }) => s), full: !url.searchParams.get("since"), server_time: new Date().toISOString() });
  }
  if (p === "/v1/sync/invoices" && req.method === "POST") {
    const b = await readBody(req);
    const results = (b.invoices || []).map((inv) => {
      if (invoices.has(inv.uuid)) return { uuid: inv.uuid, status: "duplicate", server_no: invoices.get(inv.uuid) };
      if (!inv.items?.length) return { uuid: inv.uuid, status: "error", message: "Invoice has no items" };
      const no = `INV-${++invoiceSeq}`;
      invoices.set(inv.uuid, no);
      console.log(`   saved ${inv.local_no} -> ${no}  total ${inv.total}`);
      return { uuid: inv.uuid, status: "ok", server_no: no };
    });
    return json(res, 200, { results });
  }
  if (p === "/v1/auth/login" && req.method === "POST") {
    const b = await readBody(req);
    const s = staff.find((x) => x._u === b.username && x._p === b.password);
    return s ? json(res, 200, { user: { id: s.id, name: s.name, role: s.role }, token: crypto.randomBytes(16).toString("hex") }) : json(res, 422, { message: "Username or password is incorrect." });
  }
  json(res, 404, { message: "Not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`Mock API on http://127.0.0.1:${PORT}/api${SLOW ? ` (slow: ${SLOW} ms)` : ""}\nStaff PINs: ${data.staff.map((s) => `${s.name}=${s.pin}`).join(", ")}`));
