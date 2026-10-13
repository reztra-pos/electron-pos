// Local SQLite database (Node's built-in node:sqlite — no native module to rebuild).
// File: %APPDATA%\Reztra POS\reztra-pos.db
const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const crypto = require("crypto");

let db;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT, sort INTEGER, tint TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, code TEXT, name TEXT, category_id TEXT, price REAL, active INTEGER, data TEXT);
CREATE INDEX IF NOT EXISTS items_cat ON items(category_id);
CREATE TABLE IF NOT EXISTS lists (kind TEXT, id TEXT, sort INTEGER, data TEXT, PRIMARY KEY (kind, id));
CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY, name TEXT, role TEXT, pin_salt TEXT, pin_hash TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS invoices (
  uuid TEXT PRIMARY KEY, local_no TEXT, server_no TEXT, total REAL, payload TEXT,
  status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, last_error TEXT,
  created_at TEXT, synced_at TEXT
);
CREATE INDEX IF NOT EXISTS invoices_status ON invoices(status);
`;
// "lists" holds the small reference tables: waiters, customers, delivery_partners, tables, payment_methods

function open(userDataDir) {
  db = new DatabaseSync(path.join(userDataDir, "reztra-pos.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

const tx = (fn) => { db.exec("BEGIN"); try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } };

/* ---------- meta ---------- */
const getMeta = (key, fallback = null) => {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : fallback;
};
const setMeta = (key, value) => db.prepare("INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));

/* ---------- apply a pull response from the server ---------- */
const LIST_KINDS = ["waiters", "customers", "delivery_partners", "tables", "payment_methods"];

function applyPull(p) {
  return tx(() => {
    if (p.full) { // full snapshot: replace everything
      db.exec("DELETE FROM categories; DELETE FROM items; DELETE FROM lists; DELETE FROM staff;");
    }
    if (p.outlet) setMeta("outlet", p.outlet);
    const upCat = db.prepare("INSERT INTO categories(id,name,sort,tint,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, sort=excluded.sort, tint=excluded.tint, data=excluded.data");
    (p.categories || []).forEach((c, i) => upCat.run(String(c.id), c.name, c.sort ?? i, c.tint || null, JSON.stringify(c)));
    const upItem = db.prepare("INSERT INTO items(id,code,name,category_id,price,active,data) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code, name=excluded.name, category_id=excluded.category_id, price=excluded.price, active=excluded.active, data=excluded.data");
    (p.items || []).forEach((it) => upItem.run(String(it.id), it.code || "", it.name, String(it.category_id), Number(it.price) || 0, it.active === false ? 0 : 1, JSON.stringify(it)));
    const upList = db.prepare("INSERT INTO lists(kind,id,sort,data) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET sort=excluded.sort, data=excluded.data");
    LIST_KINDS.forEach((kind) => (p[kind] || []).forEach((row, i) => upList.run(kind, String(row.id), i, JSON.stringify(row))));
    const upStaff = db.prepare("INSERT INTO staff(id,name,role,pin_salt,pin_hash,data) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, pin_salt=excluded.pin_salt, pin_hash=excluded.pin_hash, data=excluded.data");
    (p.staff || []).forEach((s) => upStaff.run(String(s.id), s.name, s.role || "", s.pin_salt || "", s.pin_hash || "", JSON.stringify({ id: s.id, name: s.name, role: s.role })));
    // deletions: { items: [ids], categories: [ids], customers: [ids], ... }
    const del = p.deleted || {};
    (del.items || []).forEach((id) => db.prepare("DELETE FROM items WHERE id = ?").run(String(id)));
    (del.categories || []).forEach((id) => db.prepare("DELETE FROM categories WHERE id = ?").run(String(id)));
    (del.staff || []).forEach((id) => db.prepare("DELETE FROM staff WHERE id = ?").run(String(id)));
    LIST_KINDS.forEach((kind) => (del[kind] || []).forEach((id) => db.prepare("DELETE FROM lists WHERE kind = ? AND id = ?").run(kind, String(id))));
    if (p.server_time) setMeta("last_pull", p.server_time);
    setMeta("last_pull_at", new Date().toISOString());
  });
}

/* ---------- read catalogue for the POS screen ---------- */
function getCatalog() {
  const parse = (rows) => rows.map((r) => JSON.parse(r.data));
  const lists = {};
  LIST_KINDS.forEach((k) => { lists[k] = parse(db.prepare("SELECT data FROM lists WHERE kind = ? ORDER BY sort").all(k)); });
  return {
    outlet: getMeta("outlet", {}),
    categories: parse(db.prepare("SELECT data FROM categories ORDER BY sort, name").all()),
    items: parse(db.prepare("SELECT data FROM items WHERE active = 1 ORDER BY name").all()),
    ...lists,
    lastPullAt: getMeta("last_pull_at"),
  };
}
const hasCatalog = () => db.prepare("SELECT COUNT(*) n FROM items").get().n > 0;

/* ---------- offline PIN check ---------- */
function findStaffByPinHash(hashFn, pin) {
  for (const s of db.prepare("SELECT * FROM staff").all()) {
    if (s.pin_hash && hashFn(pin, s.pin_salt) === s.pin_hash) return JSON.parse(s.data);
  }
  return null;
}

/* ---------- invoices (outbox) ---------- */
function nextLocalNo(deviceShort) {
  const n = (getMeta("invoice_seq", 0) || 0) + 1;
  setMeta("invoice_seq", n);
  return `${deviceShort}-${String(n).padStart(6, "0")}`;
}

function saveInvoice(payload, deviceShort) {
  return tx(() => {
    const uuid = payload.uuid || crypto.randomUUID();
    const localNo = nextLocalNo(deviceShort);
    const created = new Date().toISOString();
    const full = { ...payload, uuid, local_no: localNo, created_at: created };
    db.prepare("INSERT INTO invoices(uuid, local_no, total, payload, created_at) VALUES(?,?,?,?,?)").run(uuid, localNo, Number(payload.total) || 0, JSON.stringify(full), created);
    return { uuid, local_no: localNo, created_at: created };
  });
}
const pendingInvoices = (limit = 20) =>
  db.prepare("SELECT uuid, payload, attempts FROM invoices WHERE status IN ('pending','failed') ORDER BY created_at LIMIT ?").all(limit)
    .map((r) => ({ ...JSON.parse(r.payload), _attempts: r.attempts }));
const markSynced = (uuid, serverNo) => db.prepare("UPDATE invoices SET status='synced', server_no=?, synced_at=?, last_error=NULL WHERE uuid=?").run(serverNo || null, new Date().toISOString(), uuid);
const markFailed = (uuid, err) => db.prepare("UPDATE invoices SET status='failed', attempts=attempts+1, last_error=? WHERE uuid=?").run(String(err).slice(0, 500), uuid);
const markRejected = (uuid, err) => db.prepare("UPDATE invoices SET status='rejected', attempts=attempts+1, last_error=? WHERE uuid=?").run(String(err).slice(0, 500), uuid);
const countPending = () => db.prepare("SELECT COUNT(*) n FROM invoices WHERE status IN ('pending','failed')").get().n;
const countRejected = () => db.prepare("SELECT COUNT(*) n FROM invoices WHERE status = 'rejected'").get().n;
const recentInvoices = (limit = 50) =>
  db.prepare("SELECT uuid, local_no, server_no, status, total, payload, created_at FROM invoices ORDER BY created_at DESC LIMIT ?").all(limit)
    .map((r) => { const p = JSON.parse(r.payload); return { uuid: r.uuid, no: r.server_no || r.local_no, status: r.status, total: r.total, type: p.type, customer: p.customer, method: p.method, at: r.created_at }; });

function wipe() {
  db.exec("DELETE FROM categories; DELETE FROM items; DELETE FROM lists; DELETE FROM staff; DELETE FROM meta;");
}

module.exports = {
  open, getMeta, setMeta, applyPull, getCatalog, hasCatalog, findStaffByPinHash,
  saveInvoice, pendingInvoices, markSynced, markFailed, markRejected, countPending, countRejected, recentInvoices, wipe,
};
