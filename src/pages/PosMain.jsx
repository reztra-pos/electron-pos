/**
 * Fryzo Grill — POS main screen (React)
 * -------------------------------------
 * Single-file rebuild of main_screen.php with an updated design.
 * Dependencies: react (18+), lucide-react (icons). No CSS framework needed —
 * styles are injected by the component itself.
 *
 * Layout breakpoints (tuned for POS terminals):
 *   ≥ 1280px  : Running orders | Cart | Categories + Items  (desktop)
 *   1024–1279 : Cart | Categories + Items, running orders in a drawer (15" POS)
 *   768–1023  : same, categories become a horizontal strip (10–12" POS / 1024x768)
 *   < 768     : one panel at a time with a bottom Menu / Order switcher (small POS / tablet portrait)
 *
 * Replace the DUMMY DATA section with API calls when wiring to the backend.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LogOut, Globe, FolderOpen, Printer, History, ShoppingBag, QrCode, Ticket, Bell, Wallet,
  Gauge, Monitor, Tv, Trash2, Maximize, Minimize, Menu, Search, RefreshCw, Pencil, Plus, Minus,
  X, UtensilsCrossed, Truck, LayoutGrid, CalendarDays, Eye, Info, Receipt, Ban, UserPlus,
  Check, CreditCard, Banknote, Smartphone, Clock, ChefHat, StickyNote, FileText, ListOrdered,
  ShoppingCart, Users, Edit3, Sandwich, CupSoda, IceCreamCone, Beef, Drumstick, Citrus, Grape, Milk,
  GlassWater, Cookie, Martini, Flame, Soup, Image as ImageIcon, List,
} from "lucide-react";

/* ============================================================================
   DUMMY DATA
   ========================================================================== */
let OUTLET = { name: "FRYZO GRILL", currency: "AED", vatRate: 5 };

const TINTS = ["#FFF3BF", "#DCEBFB", "#DCF2E3", "#FBE0E6", "#EBE2FA", "#FDE8D3", "#D6F2F1", "#E7EFDC", "#E6E9EF"];

let CATEGORIES = [
  ["falooda", "Falooda"], ["mixjuice", "Mix Juice"], ["passion", "Passion"], ["roob", "Roob"],
  ["drinks", "Drinks"], ["extras", "Extras"], ["grillkubz", "Grill-Kubz"], ["grillrice", "Grill-Rice"],
  ["freshjuice", "Fresh Juice"], ["club", "Club"], ["wrap", "Wrap"], ["crushmilk", "Crush Milk"],
  ["mojito", "Mojito"], ["bottlejuice", "Bottle Juice"], ["broasted", "Broasted"], ["grill", "Grill"],
  ["burger", "Burger"], ["shawarma", "Shawarma"],
].map(([id, name], i) => ({ id, name, tint: TINTS[i % TINTS.length] }));

// flags: v = veg, b = beverage/bar, c = combo, p = promo
const RAW_ITEMS = [
  ["CL01", "Fries Club", "club", 15, "v"], ["CL02", "Khaleej Club", "club", 15, ""],
  ["CL03", "Lulu Club", "club", 15, ""], ["CL04", "Zinger Club", "club", 15, "p"],
  ["MJ01", "Fruit Salad", "mixjuice", 15, "vb"], ["MJ02", "Avocado Mix", "mixjuice", 16, "vb"],
  ["PA01", "Passion Ruman", "passion", 15, "vb"], ["PA02", "Passion Strawberry", "passion", 15, "vb"],
  ["PA03", "Passion Mango", "passion", 15, "vb"], ["PA04", "Passion Orange", "passion", 15, "vb"],
  ["PA05", "Passion Pineapple", "passion", 15, "vb"],
  ["FA01", "Mango Falooda", "falooda", 15, "vbp"], ["FA02", "Strawberry Falooda", "falooda", 15, "vb"],
  ["FA03", "Falooda", "falooda", 15, "vb"],
  ["RO01", "Roob Passion", "roob", 12, "vb"], ["RO02", "Roob Grape", "roob", 12, "vb"],
  ["RO03", "Roob Ruman", "roob", 12, "vb"], ["RO04", "Roob Blueberry", "roob", 12, "vb"],
  ["RO05", "Roob Mango", "roob", 12, "vb"], ["RO06", "Roob Strawberry", "roob", 12, "vb"],
  ["WR01", "Italian Wrap", "wrap", 15, ""], ["WR02", "Spanish Wrap", "wrap", 15, ""],
  ["WR03", "Tikka Wrap", "wrap", 15, ""], ["WR04", "Chilli Wrap", "wrap", 15, ""],
  ["WR05", "Zinger Wrap", "wrap", 15, ""], ["WR06", "Nuggets Wrap", "wrap", 15, ""],
  ["EX01", "Hummus", "extras", 3, "v"], ["EX02", "Garlic Sauce", "extras", 1, "v"],
  ["EX03", "Cookies Bites", "extras", 8, "v"], ["EX04", "French Fries", "extras", 6, "v"],
  ["DR01", "Milk Tea", "drinks", 2, "vb"], ["DR02", "Maska Bun With Tea", "drinks", 5, "v"],
  ["DR03", "Mirinda Medium", "drinks", 5, "vb"], ["DR04", "Pepsi Medium", "drinks", 5, "vb"],
  ["DR05", "7Up Medium", "drinks", 5, "vb"], ["DR06", "Water 500ml", "drinks", 1.5, "vb"],
  ["GK01", "Grill Kubz Half", "grillkubz", 18, ""], ["GK02", "Grill Kubz Full", "grillkubz", 32, ""],
  ["GR01", "Grill Rice Half", "grillrice", 22, ""], ["GR02", "Grill Rice Full", "grillrice", 40, ""],
  ["FJ01", "Orange Juice", "freshjuice", 10, "vb"], ["FJ02", "Watermelon Juice", "freshjuice", 9, "vb"],
  ["FJ03", "Lemon Mint", "freshjuice", 8, "vb"],
  ["CM01", "Oreo Crush", "crushmilk", 14, "vb"], ["CM02", "Lotus Crush", "crushmilk", 16, "vb"],
  ["CM03", "KitKat Crush", "crushmilk", 14, "vb"],
  ["MO01", "Blue Mojito", "mojito", 12, "vb"], ["MO02", "Passion Mojito", "mojito", 12, "vb"],
  ["MO03", "Strawberry Mojito", "mojito", 12, "vb"],
  ["BJ01", "Mango Bottle", "bottlejuice", 7, "vb"], ["BJ02", "Avocado Bottle", "bottlejuice", 9, "vb"],
  ["BR01", "Broasted 4 Pcs", "broasted", 20, ""], ["BR02", "Broasted 8 Pcs", "broasted", 38, ""],
  ["BR03", "Family Broasted Combo", "broasted", 55, "c"],
  ["GL01", "Alfaham Quarter", "grill", 14, ""], ["GL02", "Alfaham Half", "grill", 24, ""],
  ["GL03", "Alfaham Full", "grill", 45, ""],
  ["BU01", "Zinger Burger", "burger", 13, ""], ["BU02", "Beef Burger", "burger", 16, ""],
  ["BU03", "Veg Burger", "burger", 11, "v"], ["BU04", "Burger Meal Combo", "burger", 22, "cp"],
  ["SH01", "Chicken Shawarma Roll", "shawarma", 7, ""], ["SH02", "Shawarma Plate", "shawarma", 18, ""],
  ["SH03", "Shawarma Combo", "shawarma", 20, "cp"],
];

const FOOD_MODS = [
  { id: "m1", name: "Extra cheese", price: 2 }, { id: "m2", name: "Extra garlic sauce", price: 1 },
  { id: "m3", name: "Spicy", price: 0 }, { id: "m4", name: "No pickles", price: 0 },
];
const DRINK_MODS = [
  { id: "d1", name: "Less sugar", price: 0 }, { id: "d2", name: "Add ice cream", price: 3 },
  { id: "d3", name: "Large size", price: 4 }, { id: "d4", name: "No ice", price: 0 },
];
const MOD_CATS = { wrap: FOOD_MODS, burger: FOOD_MODS, shawarma: FOOD_MODS, club: FOOD_MODS, broasted: FOOD_MODS, grill: FOOD_MODS, falooda: DRINK_MODS, crushmilk: DRINK_MODS, passion: DRINK_MODS, freshjuice: DRINK_MODS };

/* ---------- item images ----------
 * Put a URL or local path per item code. Works with remote URLs (https://...), files bundled
 * in your Electron app ("./assets/items/CL01.jpg") or base64 data URIs. Items without an
 * image, or whose image fails to load, show a category illustration instead.
 * Tip: set IMAGE_BASE and name files by item code to fill every item at once, e.g.
 *   const IMAGE_BASE = "./assets/items";  ->  ./assets/items/CL01.jpg
 */
const IMAGE_BASE = "";
const ITEM_IMAGES = {
  // CL04: "https://your-cdn.com/menu/zinger-club.jpg",
};
const CAT_ART = {
  falooda: IceCreamCone, mixjuice: Grape, passion: Citrus, roob: Milk, drinks: CupSoda, extras: Cookie,
  grillkubz: Flame, grillrice: Soup, freshjuice: Citrus, club: Sandwich, wrap: Sandwich, crushmilk: Milk,
  mojito: Martini, bottlejuice: GlassWater, broasted: Drumstick, grill: Flame, burger: Beef, shawarma: Sandwich,
};

let ITEMS = RAW_ITEMS.map(([code, name, cat, price, f]) => ({
  id: code, code, name, cat, price,
  veg: f.includes("v"), bev: f.includes("b"), combo: f.includes("c"), promo: f.includes("p"),
  modifiers: MOD_CATS[cat] || [],
  image: ITEM_IMAGES[code] || (IMAGE_BASE ? `${IMAGE_BASE}/${code}.jpg` : null),
}));

let WAITERS = ["Default Waiter", "Anas K", "Rahul M", "Fathima S", "Joseph V"];
let INITIAL_CUSTOMERS = [
  { id: 1, name: "Walk-in Customer", phone: "" },
  { id: 2, name: "Ahmed Al Mansoori", phone: "050 123 4567" },
  { id: 3, name: "Priya Nair", phone: "055 987 6543" },
  { id: 4, name: "Omar Haddad", phone: "052 456 7890" },
];
let DELIVERY_PARTNERS = ["Delivery Partner", "Talabat", "Deliveroo", "Careem", "Noon Food", "Own rider"];
let AREAS = ["Indoor", "Outdoor", "Family"];
let TABLES = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `T${i + 1}`, name: `T${i + 1}`, area: "Indoor", seats: i % 3 === 0 ? 6 : 4 })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `O${i + 1}`, name: `O${i + 1}`, area: "Outdoor", seats: 4 })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `F${i + 1}`, name: `F${i + 1}`, area: "Family", seats: 8 })),
];
let PAYMENT_METHODS = [
  { id: "cash", name: "Cash", icon: Banknote }, { id: "card", name: "Card", icon: CreditCard },
  { id: "online", name: "Online / Wallet", icon: Smartphone },
];

const mkItem = (id, qty, extra = {}) => {
  const it = ITEMS.find((x) => x.id === id);
  return { key: `${id}-${Math.random().toString(36).slice(2, 7)}`, id, name: it.name, price: it.price, qty, disc: 0, note: "", mods: [], ...extra };
};
let START_NO = 1044;
const PAY_ICONS = { cash: Banknote, card: CreditCard, online: Smartphone, wallet: Smartphone };
const EAPI = typeof window !== "undefined" ? window.electronAPI : undefined;

/**
 * Replace the dummy data with the catalogue stored in SQLite (called by App.jsx before this
 * screen is shown). Server ids are kept as `serverId` where the screen needs simple ids.
 */
export function applyCatalog(c, { running = [], recent = [] } = {}) {
  const o = c.outlet || {};
  OUTLET = { name: o.name || OUTLET.name, currency: o.currency || OUTLET.currency, vatRate: Number(o.vat_rate ?? OUTLET.vatRate) };
  CATEGORIES = (c.categories || []).map((x, i) => ({ id: String(x.id), name: x.name, tint: x.tint || TINTS[i % TINTS.length] }));
  ITEMS = (c.items || []).map((it) => {
    const code = it.code || String(it.id);
    return {
      id: String(it.id), code, name: it.name, cat: String(it.category_id), price: Number(it.price) || 0,
      veg: !!it.veg, bev: !!it.bev, combo: !!it.combo, promo: !!it.promo, modifiers: it.modifiers || [],
      image: it.image || ITEM_IMAGES[code] || (IMAGE_BASE ? `${IMAGE_BASE}/${code}.jpg` : null),
    };
  });
  WAITERS = (c.waiters || []).map((w) => w.name);
  if (!WAITERS.length) WAITERS = ["Default Waiter"];
  const custs = c.customers || [];
  const walkIn = custs.find((x) => x.is_walkin || /walk.?in/i.test(x.name)) || { id: "walkin", name: "Walk-in Customer", phone: "" };
  INITIAL_CUSTOMERS = [walkIn, ...custs.filter((x) => x !== walkIn)].map((x, i) => ({ ...x, serverId: x.id, id: i + 1 }));
  DELIVERY_PARTNERS = ["Delivery Partner", ...(c.delivery_partners || []).map((x) => x.name)];
  TABLES = (c.tables || []).map((t) => ({ id: String(t.id), name: t.name, area: t.area || "Main", seats: Number(t.seats) || 4 }));
  AREAS = [...new Set(TABLES.map((t) => t.area))];
  if (!AREAS.length) AREAS = ["Main"];
  PAYMENT_METHODS = (c.payment_methods || []).map((m) => ({ id: String(m.id), name: m.name, icon: PAY_ICONS[m.id] || Banknote }));
  if (!PAYMENT_METHODS.length) PAYMENT_METHODS = [{ id: "cash", name: "Cash", icon: Banknote }];
  INITIAL_RUNNING = running;
  INITIAL_SALES = recent;
  START_NO = Math.max(1000, ...running.map((r) => r.no || 0)) + 1;
}

/* ---------- sync status pill (Electron only) ---------- */
function SyncBadge({ onClick }) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    if (!EAPI?.sync) return;
    EAPI.sync.status().then(setSt).catch(() => {});
    return EAPI.sync.onStatus(setSt);
  }, []);
  if (!EAPI?.sync || !st) return null;
  const label = st.revoked ? "Device disabled" : st.syncing ? "Syncing…" : st.online === false ? "Offline" : st.online ? "Online" : "Connecting…";
  const cls = st.revoked || st.online === false ? "off" : st.syncing ? "busy" : "on";
  const tip = [st.lastError, st.lastPullAt && `Data updated ${timeAgo(st.lastPullAt)}`, st.rejected && `${st.rejected} invoice(s) rejected by the server`].filter(Boolean).join("\n");
  return (
    <button className={`sync-pill ${cls}`} onClick={onClick} title={tip || "Sync now"}>
      <span className="dot" />{label}
      {st.pending > 0 && <span className="q num">{st.pending} queued</span>}
    </button>
  );
}

const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
let INITIAL_RUNNING = [
  { id: "o1041", no: 1041, type: "dine", table: { id: "T2", name: "T2", area: "Indoor", persons: 3 }, waiter: "Anas K", customer: "Walk-in Customer", partner: "", items: [mkItem("WR03", 2), mkItem("PA03", 2), mkItem("EX01", 1)], discount: { mode: "fixed", value: 0 }, charge: { mode: "percent", value: 0 }, tips: 0, date: new Date().toISOString().slice(0, 10), createdAt: minutesAgo(24), status: "Cooking" },
  { id: "o1042", no: 1042, type: "take", table: null, waiter: "Default Waiter", customer: "Priya Nair", partner: "", items: [mkItem("BU01", 1, { mods: [FOOD_MODS[0]] }), mkItem("DR04", 1)], discount: { mode: "fixed", value: 0 }, charge: { mode: "percent", value: 0 }, tips: 0, date: new Date().toISOString().slice(0, 10), createdAt: minutesAgo(12), status: "Ready" },
  { id: "o1043", no: 1043, type: "delivery", table: null, waiter: "Rahul M", customer: "Ahmed Al Mansoori", partner: "Talabat", items: [mkItem("SH03", 2), mkItem("FA01", 1)], discount: { mode: "fixed", value: 0 }, charge: { mode: "fixed", value: 5 }, tips: 0, date: new Date().toISOString().slice(0, 10), createdAt: minutesAgo(6), status: "Cooking" },
];
let INITIAL_SALES = [
  { id: "s1038", no: 1038, type: "take", customer: "Walk-in Customer", total: 31.5, method: "Cash", at: minutesAgo(95) },
  { id: "s1039", no: 1039, type: "dine", customer: "Omar Haddad", total: 84.0, method: "Card", at: minutesAgo(70) },
  { id: "s1040", no: 1040, type: "delivery", customer: "Priya Nair", total: 47.25, method: "Online / Wallet", at: minutesAgo(40) },
];

/* ============================================================================
   HELPERS
   ========================================================================== */
const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const ORDER_TYPES = {
  dine: { label: "Dine In", icon: UtensilsCrossed },
  take: { label: "Take Away", icon: ShoppingBag },
  delivery: { label: "Delivery", icon: Truck },
};
const lineUnit = (l) => l.price + l.mods.reduce((s, m) => s + m.price, 0);
const lineTotal = (l) => lineUnit(l) * l.qty * (1 - (Number(l.disc) || 0) / 100);
function calcTotals(items, discount, charge, tips) {
  const subtotal = items.reduce((s, l) => s + lineTotal(l), 0);
  const itemCount = items.reduce((s, l) => s + l.qty, 0);
  const discountAmt = Math.min(subtotal, discount.mode === "percent" ? (subtotal * (Number(discount.value) || 0)) / 100 : Number(discount.value) || 0);
  const taxable = subtotal - discountAmt;
  const vat = (taxable * OUTLET.vatRate) / 100;
  const chargeAmt = charge.mode === "percent" ? (taxable * (Number(charge.value) || 0)) / 100 : Number(charge.value) || 0;
  const total = taxable + vat + chargeAmt + (Number(tips) || 0);
  return { subtotal, itemCount, discountAmt, vat, chargeAmt, tips: Number(tips) || 0, total };
}
const timeAgo = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
};

/* ============================================================================
   STYLES
   ========================================================================== */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
.pos{--bg:#EDF0F4;--panel:#FFFFFF;--ink:#1D2433;--ink2:#5A6478;--line:#DCE1E8;--brand:#5B3FD1;--brand-2:#EEE9FF;
 --ok:#1E9E6A;--danger:#DC3F35;--info:#1E7FD8;--amber:#E8A317;--veg:#1E8E3E;--radius:10px;
 font-family:Manrope,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);
 height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden;font-size:14px;-webkit-font-smoothing:antialiased}
.pos *{box-sizing:border-box}
.pos button{font-family:inherit;cursor:pointer;color:inherit}
.pos button:focus-visible,.pos input:focus-visible,.pos select:focus-visible,.pos textarea:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.pos .num{font-variant-numeric:tabular-nums}

/* top bar */
.topbar{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--panel);border-bottom:1px solid var(--line);min-height:52px}
.tb-icons{display:flex;align-items:center;gap:2px;min-width:0}
.icon-btn{position:relative;display:inline-grid;place-items:center;width:38px;height:38px;border:0;background:transparent;border-radius:8px;color:var(--brand)}
.icon-btn:hover{background:var(--brand-2)}
.icon-btn.danger{color:var(--danger)}
.badge{position:absolute;top:3px;right:3px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--danger);color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center}
.sync-pill{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:16px;border:1px solid var(--line);background:#fff;font-size:12px;font-weight:700;color:var(--ink2);white-space:nowrap;margin-left:auto}
.sync-pill .dot{width:8px;height:8px;border-radius:50%;background:var(--ok)}
.sync-pill.off .dot{background:var(--danger)}.sync-pill.off{color:var(--danger)}
.sync-pill.busy .dot{background:var(--amber);animation:pulse 1s infinite}
@keyframes pulse{50%{opacity:.3}}
.sync-pill .q{background:#FFF1D6;color:#7A4F00;border-radius:10px;padding:1px 7px}
.sync-pill + .brand{margin-left:8px}
.brand{font-weight:800;font-size:18px;letter-spacing:.02em;color:var(--brand);padding:0 14px;border-left:2px solid var(--line);border-right:2px solid var(--line);white-space:nowrap;margin-left:auto}
.chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
.chip{border:0;border-radius:8px;padding:8px 12px;font-weight:700;font-size:13px;white-space:nowrap;display:flex;align-items:center;gap:6px;color:#fff;opacity:.92}
.chip[aria-pressed=true]{opacity:1;box-shadow:inset 0 0 0 2px rgba(0,0,0,.25)}
.chip[aria-pressed=true]::before{content:"";width:6px;height:6px;border-radius:50%;background:#fff}
.chip-abbr{display:none}
.chip.veg{background:#4CAF50}.chip.bev{background:#5E7486}.chip.combo{background:#E8A317}.chip.promo{background:#E0245E}

/* main grid */
.main{flex:1;min-height:0;display:grid;grid-template-columns:220px minmax(370px,40fr) 60fr;gap:10px;padding:10px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);min-height:0;display:flex;flex-direction:column;overflow:hidden}

/* running orders */
.ro-head{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 6px}
.ro-head h2{margin:0;font-size:17px;font-weight:800}
.input{width:100%;height:38px;border:1px solid var(--line);border-radius:8px;padding:0 10px;font:inherit;font-size:13px;background:#fff;color:var(--ink)}
.ro-list{flex:1;overflow-y:auto;padding:6px 10px;display:flex;flex-direction:column;gap:6px}
.ro-card{text-align:left;border:1px solid var(--line);background:#fff;border-radius:8px;padding:8px 10px;display:grid;gap:3px;font-size:12px}
.ro-card[aria-pressed=true]{border-color:var(--brand);background:var(--brand-2);box-shadow:inset 3px 0 0 var(--brand)}
.ro-card .row{display:flex;justify-content:space-between;align-items:center;gap:6px}
.ro-card b{font-size:14px}
.tag{font-size:11px;font-weight:700;padding:2px 6px;border-radius:5px;background:#EEF1F5;color:var(--ink2)}
.tag.ready{background:#DCF2E3;color:var(--ok)}.tag.cooking{background:#FFF1D6;color:#9A6400}
.muted{color:var(--ink2)}
.ro-empty{margin:auto;text-align:center;color:var(--ink2);font-size:13px;padding:20px}
.ro-actions{padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:6px;border-top:1px solid var(--line)}
.op-btn{grid-column:span 2;height:36px;border:1px solid var(--line);border-radius:8px;background:#F6F7F9;font-size:12.5px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px}
.op-btn.half{grid-column:span 1}
.op-btn:hover:not(:disabled){background:#fff;border-color:var(--brand);color:var(--brand)}
.op-btn:disabled{opacity:.45;cursor:not-allowed}

/* cart */
.cart{container-type:inline-size}
.type-row{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:10px 10px 6px}
.type-btn{height:40px;border:1px solid var(--line);border-radius:8px;background:#F6F7F9;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;overflow:hidden}
.type-btn[aria-pressed=true]{background:var(--brand);border-color:var(--brand);color:#fff}
.sel-row{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:6px;padding:0 10px 8px}
.select{height:38px;border:1px solid var(--line);border-radius:8px;padding:0 8px;font:inherit;font-size:13px;background:#fff;color:var(--ink);min-width:0;width:100%}
.select:disabled{background:#F3F4F6;color:#9AA3B2}
.sq-btn{width:38px;height:38px;border:1px solid var(--line);background:#F6F7F9;border-radius:8px;display:grid;place-items:center}
.sq-btn:hover{border-color:var(--brand);color:var(--brand)}
.sel-actions{display:flex;gap:6px}
.edit-banner{margin:0 10px 8px;padding:8px 10px;border-radius:8px;background:#FFF1D6;color:#7A4F00;font-size:12.5px;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:8px}
.edit-banner button{border:0;background:transparent;font-weight:700;text-decoration:underline;color:#7A4F00}
.context-line{padding:0 12px 6px;font-size:12px;color:var(--ink2);display:flex;gap:10px;flex-wrap:wrap}
.context-line b{color:var(--ink)}
.cart-table{flex:1;min-height:0;display:flex;flex-direction:column;margin:0 10px;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.cart-grid{display:grid;grid-template-columns:minmax(0,1fr) 70px 108px 76px 30px;align-items:center;gap:6px;padding:0 10px}
.cart-head{height:36px;background:#F6F7F9;border-bottom:1px solid var(--line);font-size:12px;font-weight:800;color:var(--ink2)}
.cart-head .r,.cart-row .r{text-align:right}
.cart-body{flex:1;overflow-y:auto}
.cart-row{min-height:50px;border-bottom:1px solid #EEF1F5;padding-top:6px;padding-bottom:6px}
.cart-row:hover{background:#FAFAFD}
.cart-name{border:0;background:transparent;text-align:left;padding:0;font-weight:700;font-size:13.5px;min-width:0}
.cart-name small{display:block;font-weight:500;font-size:11.5px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qty{display:flex;align-items:center;border:1px solid var(--line);border-radius:8px;overflow:hidden;height:34px;width:max-content;justify-self:center}
.qty button{width:32px;height:100%;border:0;background:#F6F7F9;display:grid;place-items:center}
.qty button:hover{background:var(--brand-2);color:var(--brand)}
.qty span{min-width:34px;text-align:center;font-weight:800}
.del{border:0;background:transparent;color:#A3ABB9;width:30px;height:30px;border-radius:6px;display:grid;place-items:center}
.del:hover{color:var(--danger);background:#FDECEA}
.cart-empty{height:100%;display:grid;place-items:center;text-align:center;color:var(--ink2);padding:20px;font-size:13px}
.cart-empty svg{color:#C4CAD4;margin-bottom:6px}
@container (max-width:430px){.cart-grid{grid-template-columns:minmax(0,1fr) 104px 70px 28px}.cart-grid .col-price{display:none}}
@container (max-width:420px){.act svg{display:none}.act{font-size:13px}}
@container (max-width:470px){.type-btn svg{display:none}.type-btn{font-size:12px;gap:0}}
.total-bar{margin:8px 10px 0;height:48px;border-radius:8px;background:#F1F2F6;display:flex;align-items:center;justify-content:center;gap:6px;position:relative}
.total-bar .amount{font-size:24px;font-weight:800;color:var(--ink)}
.total-bar .lbl{font-size:15px;font-weight:600;color:var(--ink2);margin-right:4px}
.date-pop{position:absolute;bottom:54px;left:0;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px;box-shadow:0 10px 30px rgba(20,24,40,.18);z-index:5;display:grid;gap:6px;font-size:12px;font-weight:700}
.act-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:8px 10px 10px}
.act{height:46px;border:0;border-radius:8px;color:#fff !important;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
.act.cancel{background:var(--danger)}.act.quick{background:#7C4DEB}.act.place{background:var(--info)}
.act:hover{filter:brightness(1.07)}

/* menu */
.menu-top{padding:10px 10px 8px}
.search{position:relative}
.search svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:#9AA3B2}
.search .input{padding-left:36px;height:42px;font-size:14px}
.search kbd{position:absolute;right:10px;top:50%;transform:translateY(-50%);font:600 11px Manrope,sans-serif;color:#9AA3B2;border:1px solid var(--line);border-radius:5px;padding:1px 6px}
.menu-body{flex:1;min-height:0;display:grid;grid-template-columns:136px 1fr;gap:10px;padding:0 10px 10px}
.cats{overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding-right:2px}
.cat{flex:none;min-height:42px;border:1px solid rgba(0,0,0,.05);border-radius:8px;font-weight:800;font-size:13px;padding:6px 8px;color:#2A3242}
.cat[aria-pressed=true]{box-shadow:inset 0 0 0 2px var(--ink);}
.cat.all{background:#FFF3BF}
.items{overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));grid-auto-rows:min-content;gap:10px;align-content:start;padding:8px 8px 8px 2px}
.item{position:relative;min-height:100px;border:1px solid rgba(0,0,0,.05);border-radius:10px;padding:24px 10px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;gap:8px;box-shadow:0 1px 0 rgba(0,0,0,.04)}
.item:hover{box-shadow:0 4px 14px rgba(30,40,70,.12)}
.item:active{transform:scale(.98)}
.item .nm{font-weight:700;font-size:15px;line-height:1.25}
.item .pr{font-weight:800;font-size:14px}
.item .pr span{font-weight:600;color:var(--ink2);font-size:12px}
.item .inq{position:absolute;top:-7px;right:-7px;min-width:26px;height:26px;padding:0 6px;border-radius:13px;background:var(--brand);color:#fff;font-weight:800;font-size:13px;display:grid;place-items:center;box-shadow:0 0 0 3px var(--panel)}
.item .marks{position:absolute;top:7px;left:7px;display:flex;gap:4px}
.vegmark{width:13px;height:13px;border:1.5px solid var(--veg);border-radius:2px;display:grid;place-items:center}
.vegmark::after{content:"";width:5px;height:5px;border-radius:50%;background:var(--veg)}
.mini{font-size:9.5px;font-weight:800;padding:1px 5px;border-radius:4px;color:#fff}
.mini.c{background:var(--amber)}.mini.p{background:#E0245E}
.item.has-img{padding:0;gap:0;justify-content:flex-start;overflow:visible;min-height:0}
.item.has-img .body{display:flex;flex-direction:column;justify-content:space-between;gap:4px;padding:8px 8px 10px;flex:1}
.item.has-img .nm{font-size:14px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.5em}
.item.has-img .inq{z-index:3}
.item.has-img .marks{z-index:3;top:6px;left:6px;background:rgba(255,255,255,.92);padding:3px;border-radius:6px}
.item.has-img .marks:empty{display:none}
.thumb{position:relative;width:100%;height:var(--thumb-h,92px);border-radius:9px 9px 0 0;overflow:hidden;display:grid;place-items:center;flex:none}
.thumb img{width:100%;height:100%;object-fit:cover;display:block}
.thumb.art{background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.9),rgba(255,255,255,.35) 70%),var(--tint)}
.item .thumb.art{border-bottom:1px solid rgba(0,0,0,.05)}
.thumb.art::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 60%,rgba(0,0,0,.05))}
.thumb.art svg{color:rgba(29,36,51,.55);filter:drop-shadow(0 2px 0 rgba(255,255,255,.6))}
.thumb.sm{width:34px;height:34px;border-radius:8px;flex:none}
.thumb.lg{height:170px;border-radius:12px;margin-bottom:14px}
.view-toggle{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;flex:none}
.view-toggle button{width:42px;height:42px;border:0;background:#fff;display:grid;place-items:center;color:var(--ink2)}
.view-toggle button[aria-pressed=true]{background:var(--brand);color:#fff}
.menu-top{display:flex;gap:8px;align-items:center}.menu-top .search{flex:1;min-width:0}
.cart-name.with-thumb{display:flex;align-items:center;gap:8px}
.cart-name .txt{min-width:0}
@container (max-width:430px){.cart-name .thumb{display:none}}
.no-items{grid-column:1/-1;text-align:center;color:var(--ink2);padding:40px 10px}

/* drawer + mobile */
.only-drawer,.mob-tabs,.show-lt-xl{display:none}
.scrim{position:fixed;inset:0;background:rgba(18,22,34,.45);z-index:40}
@media (max-width:1500px){.tb-icons .opt-lg{display:none}}
@media (max-width:1279px){
 .main{grid-template-columns:minmax(360px,42fr) 58fr}
 .running{position:fixed;top:0;bottom:0;left:0;width:280px;z-index:50;border-radius:0;transform:translateX(-102%);transition:transform .22s ease}
 .running.open{transform:none}
 .only-drawer,.show-lt-xl{display:inline-grid}
 .tb-icons .opt-lg,.tb-icons .opt-md{display:none}
 .sel-row{grid-template-columns:1fr 1fr auto}
 .sel-row .sel-partner{grid-column:1/-1;order:5}
 .items{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
}
@media (max-width:1100px){
 .menu-body{grid-template-columns:1fr;grid-template-rows:auto 1fr}
 .cats{flex-direction:row;overflow-x:auto;overflow-y:hidden;padding-bottom:4px}
 .cat{min-height:36px;white-space:nowrap;padding:6px 12px}
}
@media (max-width:1023px){
 .main{grid-template-columns:minmax(330px,46fr) 54fr;gap:8px;padding:8px}
 .items{grid-template-columns:repeat(auto-fill,minmax(122px,1fr));gap:8px}
 .item{min-height:84px}.item .nm{font-size:13.5px}
 .pos{--thumb-h:74px}.item.has-img .nm{font-size:13px}
 .chip .chip-txt{display:none}.chip .chip-abbr{display:inline}.chip{padding:7px 8px;font-size:12px}
 .search kbd{display:none}.search .input{text-overflow:ellipsis}
}
@media (max-width:900px){.tb-icons .opt-sm{display:none}.icon-btn{width:34px}}
@media (max-width:767px){
 .topbar{flex-wrap:wrap}
 .brand{border:0;padding:0 6px;font-size:16px}
 .chips{order:5;width:100%}
 .chip .chip-txt{display:inline}.chip .chip-abbr{display:none}.chip{padding:7px 10px}
 .icon-btn{width:36px}
 .main{grid-template-columns:1fr;padding:6px;gap:6px}
 .main > .cart,.main > .menu{display:none}
 .main[data-tab=order] > .cart,.main[data-tab=menu] > .menu{display:flex}
 .mob-tabs{display:grid;grid-template-columns:1fr 1.3fr;gap:6px;padding:6px;background:var(--panel);border-top:1px solid var(--line)}
 .mob-tabs button{height:46px;border-radius:8px;border:1px solid var(--line);background:#F6F7F9;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px}
 .mob-tabs button[aria-pressed=true]{background:var(--brand);color:#fff;border-color:var(--brand)}
 .tb-icons .opt-sm{display:none}
 .act{font-size:13px}
}
@media (max-height:720px){
 .type-btn,.select,.sq-btn{height:34px}.act{height:40px}.total-bar{height:42px}.total-bar .amount{font-size:20px}
 .item:not(.has-img){min-height:82px;padding:22px 8px 8px}.pos{--thumb-h:64px}.cat{min-height:36px}.op-btn{height:32px}
}

/* modal */
.modal-wrap{position:fixed;inset:0;z-index:100;background:rgba(18,22,34,.5);display:grid;place-items:start center;padding:4vh 12px;overflow-y:auto}
.modal{background:#fff;border-radius:14px;width:100%;max-width:560px;box-shadow:0 24px 60px rgba(10,14,30,.3);display:flex;flex-direction:column;max-height:92vh}
.modal.lg{max-width:820px}.modal.sm{max-width:420px}
.modal-h{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--line)}
.modal-h h3{margin:0;font-size:19px;font-weight:800}
.modal-b{padding:18px;overflow-y:auto}
.modal-f{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--line)}
.btn{height:42px;padding:0 18px;border-radius:8px;border:1px solid var(--line);background:#F6F7F9;font-weight:700;display:inline-flex;align-items:center;gap:6px}
.btn.primary{background:var(--brand);border-color:var(--brand);color:#fff !important}
.btn.ok{background:var(--ok);border-color:var(--ok);color:#fff !important}
.btn.danger{background:var(--danger);border-color:var(--danger);color:#fff !important}
.btn:disabled{opacity:.5;cursor:not-allowed}
.types{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.type-card{border:2px solid var(--line);border-radius:14px;background:#fff;padding:22px 10px 16px;display:grid;justify-items:center;gap:12px;font-weight:800;font-size:16px}
.type-card:hover{border-color:var(--brand);background:var(--brand-2)}
.type-card .ill{width:84px;height:84px;border-radius:50%;display:grid;place-items:center}
@media (max-width:480px){.types{grid-template-columns:1fr}.type-card{grid-template-columns:auto 1fr;justify-items:start;align-items:center;padding:12px}.type-card .ill{width:54px;height:54px}}
.field{display:grid;gap:5px;margin-bottom:12px;font-size:12.5px;font-weight:700;color:var(--ink2)}
.field textarea{min-height:64px;padding:8px 10px;height:auto}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mod-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px}
.mod{border:1px solid var(--line);border-radius:8px;padding:10px;background:#fff;text-align:left;display:flex;justify-content:space-between;align-items:center;gap:6px;font-weight:600;font-size:13px}
.mod[aria-pressed=true]{border-color:var(--brand);background:var(--brand-2);color:var(--brand)}
.qty.big{height:44px}.qty.big button{width:44px}.qty.big span{min-width:50px;font-size:18px}
.sum-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px dashed var(--line);font-weight:600}
.sum-row.total{border:0;font-size:20px;font-weight:800;padding-top:14px}
.inline-edit{display:flex;gap:6px;align-items:center}
.inline-edit .input{width:90px;height:34px}.inline-edit .select{width:auto;height:34px}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.seg button{border:0;background:#fff;padding:8px 14px;font-weight:700;font-size:13px}
.seg button[aria-pressed=true]{background:var(--brand);color:#fff}
.tables{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin:14px 0}
.tbl{border:2px solid var(--line);border-radius:12px;background:#fff;padding:12px 8px;display:grid;justify-items:center;gap:4px}
.tbl b{font-size:18px}
.tbl.busy{background:#FFF6E6;border-color:#F4D38E}
.tbl[aria-pressed=true]{border-color:var(--brand);background:var(--brand-2)}
.list{display:grid;gap:8px}
.list-row{border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.pay-methods{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.pm{border:2px solid var(--line);border-radius:10px;background:#fff;padding:12px 6px;display:grid;justify-items:center;gap:6px;font-weight:700;font-size:13px}
.pm[aria-pressed=true]{border-color:var(--brand);background:var(--brand-2);color:var(--brand)}
.quick-amts{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.quick-amts button{border:1px solid var(--line);background:#F6F7F9;border-radius:8px;padding:8px 12px;font-weight:700}
.pay-due{display:flex;justify-content:space-between;background:#F1F2F6;border-radius:10px;padding:14px;font-size:18px;font-weight:800;margin-bottom:14px}
.menu-sheet{position:fixed;top:0;right:0;bottom:0;width:300px;max-width:88vw;background:#fff;z-index:60;box-shadow:-10px 0 40px rgba(10,14,30,.2);display:flex;flex-direction:column}
.menu-sheet .item-link{display:flex;align-items:center;gap:12px;width:100%;border:0;background:transparent;padding:12px 18px;font-weight:600;text-align:left;font-size:14px}
.menu-sheet .item-link:hover{background:var(--brand-2);color:var(--brand)}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1D2433;color:#fff;padding:11px 18px;border-radius:10px;font-weight:600;font-size:13.5px;z-index:200;display:flex;gap:8px;align-items:center;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:92vw}
@media (prefers-reduced-motion:reduce){.pos *{transition:none !important}}
`;

/* ============================================================================
   SMALL COMPONENTS
   ========================================================================== */
function Modal({ title, onClose, children, footer, size = "" }) {
  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

function Qty({ value, onChange, big }) {
  return (
    <div className={`qty ${big ? "big" : ""}`}>
      <button onClick={() => onChange(value - 1)} aria-label="Decrease"><Minus size={15} /></button>
      <span className="num">{value}</span>
      <button onClick={() => onChange(value + 1)} aria-label="Increase"><Plus size={15} /></button>
    </div>
  );
}

function ItemThumb({ item, size = "", tint }) {
  const [broken, setBroken] = useState(false);
  const Art = CAT_ART[item.cat] || UtensilsCrossed;
  if (item.image && !broken) {
    return <span className={`thumb ${size}`}><img src={item.image} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} /></span>;
  }
  const px = size === "sm" ? 18 : size === "lg" ? 72 : 40;
  return <span className={`thumb art ${size}`} style={{ "--tint": tint }} aria-hidden="true"><Art size={px} strokeWidth={1.6} /></span>;
}

const TYPE_ILL = { dine: ["#E3EEFD", "#1E7FD8"], take: ["#FDEBD8", "#D9711C"], delivery: ["#FFE3E0", "#DC3F35"] };

/* ============================================================================
   MAIN
   ========================================================================== */
export default function PosMainScreen({ user, onLogout = () => {} }) {
  // catalogue & filters
  const [activeCat, setActiveCat] = useState("all");
  const [showImages, setShowImages] = useState(true);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ veg: false, bev: false, combo: false, promo: false });

  // current order
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState(null);
  const [table, setTable] = useState(null);
  const [waiter, setWaiter] = useState(WAITERS[0]);
  const [customers, setCustomers] = useState(INITIAL_CUSTOMERS);
  const [customerId, setCustomerId] = useState(1);
  const [partner, setPartner] = useState(DELIVERY_PARTNERS[0]);
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [discount, setDiscount] = useState({ mode: "fixed", value: 0 });
  const [charge, setCharge] = useState({ mode: "percent", value: 0 });
  const [tips, setTips] = useState(0);
  const [editingId, setEditingId] = useState(null);

  // store
  const [running, setRunning] = useState(INITIAL_RUNNING);
  const [selectedRunning, setSelectedRunning] = useState(null);
  const [roQuery, setRoQuery] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [sales, setSales] = useState(INITIAL_SALES);
  const [notifications, setNotifications] = useState([
    { id: "n1", text: "Order #1042 is ready for pickup", at: minutesAgo(3), ready: true },
  ]);
  const [nextNo, setNextNo] = useState(START_NO);

  // ui
  const [modal, setModal] = useState(null); // {name, ...payload}
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState("menu");
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [datePop, setDatePop] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const searchRef = useRef(null);

  const customer = customers.find((c) => c.id === Number(customerId)) || customers[0];
  const totals = useMemo(() => calcTotals(cart, discount, charge, tips), [cart, discount, charge, tips]);
  const qtyById = useMemo(() => cart.reduce((m, l) => ({ ...m, [l.id]: (m[l.id] || 0) + l.qty }), {}), [cart]);
  const catById = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, c])), []);

  const notify = (text) => {
    setToast(text);
    clearTimeout(notify.t);
    notify.t = setTimeout(() => setToast(null), 2400);
  };

  // keyboard: "/" focuses search, Esc closes overlays
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { setModal(null); setDrawer(false); setSheet(false); setDatePop(false); }
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
        e.preventDefault(); setTab("menu"); searchRef.current?.focus();
      }
    };
    const onFs = () => setIsFull(!!document.fullscreenElement);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFs); };
  }, []);

  // keep running orders on disk so a restart or power cut doesn't lose them
  useEffect(() => { EAPI?.orders.save(running).catch(() => {}); }, [running]);

  /* ---------- catalogue ---------- */
  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ITEMS.filter((it) => {
      if (activeCat !== "all" && it.cat !== activeCat) return false;
      if (filters.veg && !it.veg) return false;
      if (filters.bev && !it.bev) return false;
      if (filters.combo && !it.combo) return false;
      if (filters.promo && !it.promo) return false;
      if (!q) return true;
      if (q === "veg") return it.veg;
      if (q === "bev" || q === "bar") return it.bev;
      return it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q) || catById[it.cat].name.toLowerCase().includes(q);
    });
  }, [activeCat, filters, query, catById]);

  /* ---------- cart ops ---------- */
  const addToCart = (item, opts = {}) => {
    const { qty = 1, mods = [], note = "", disc = 0 } = opts;
    setCart((c) => {
      const sig = (l) => l.id === item.id && !l.note && !l.disc && l.mods.length === 0;
      if (!mods.length && !note && !disc) {
        const i = c.findIndex(sig);
        if (i > -1) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
      }
      return [...c, { key: `${item.id}-${Date.now()}`, id: item.id, name: item.name, price: item.price, qty, mods, note, disc }];
    });
  };
  const onItemClick = (item) => {
    if (!orderType) return setModal({ name: "orderType", then: { kind: "add", item } });
    addToCart(item);
  };
  const setLineQty = (key, q) => setCart((c) => (q <= 0 ? c.filter((l) => l.key !== key) : c.map((l) => (l.key === key ? { ...l, qty: q } : l))));
  const removeLine = (key) => setCart((c) => c.filter((l) => l.key !== key));

  const resetOrder = () => {
    setCart([]); setOrderType(null); setTable(null); setWaiter(WAITERS[0]); setCustomerId(1);
    setPartner(DELIVERY_PARTNERS[0]); setDiscount({ mode: "fixed", value: 0 }); setCharge({ mode: "percent", value: 0 });
    setTips(0); setEditingId(null); setOrderDate(new Date().toISOString().slice(0, 10));
  };

  const snapshot = (type = orderType, tbl = table) => ({
    type, table: type === "dine" ? tbl : null, waiter, customer: customer.name,
    partner: type === "delivery" && partner !== DELIVERY_PARTNERS[0] ? partner : "",
    items: cart, discount, charge, tips, date: orderDate,
  });

  /* ---------- order flow ---------- */
  // action: "place" | "invoice"
  const proceed = (action, type = orderType, tbl = table) => {
    if (!cart.length) return notify("Add at least one item to the order");
    if (!type) return setModal({ name: "orderType", then: { kind: action } });
    if (type === "dine" && !tbl) return setModal({ name: "table", then: { kind: action, type } });
    if (action === "place") return commitOrder(type, tbl);
    setModal({ name: "payment", source: "cart", snapshot: snapshot(type, tbl) });
  };

  const commitOrder = (type, tbl) => {
    const snap = snapshot(type, tbl);
    if (editingId) {
      setRunning((r) => r.map((o) => (o.id === editingId ? { ...o, ...snap } : o)));
      const no = running.find((o) => o.id === editingId)?.no;
      notify(`Order #${no} updated and KOT sent to kitchen`);
    } else {
      const order = { ...snap, id: `o${nextNo}`, no: nextNo, createdAt: new Date().toISOString(), status: "Cooking" };
      setRunning((r) => [order, ...r]);
      setSelectedRunning(order.id);
      setNotifications((n) => [{ id: `n${Date.now()}`, text: `KOT for order #${nextNo} sent to kitchen`, at: new Date().toISOString(), ready: false }, ...n]);
      setNextNo((n) => n + 1);
      notify(`Order #${nextNo} placed`);
    }
    resetOrder();
    setModal(null);
    setTab("menu");
  };

  const completePayment = ({ method, source, orderId, snap }) => {
    const t = calcTotals(snap.items, snap.discount, snap.charge, snap.tips);
    const order = orderId ? running.find((o) => o.id === orderId) : null;
    const no = order ? order.no : editingId ? running.find((o) => o.id === editingId)?.no : nextNo;
    const saleId = `s${no}-${Date.now()}`;
    setSales((s) => [{ id: saleId, no, type: snap.type, customer: snap.customer, total: t.total, method, at: new Date().toISOString(), status: EAPI ? "pending" : undefined }, ...s]);
    // Electron: write the invoice to SQLite first (works offline); the sync engine uploads it.
    EAPI?.invoices.save({
      order_no: no, type: snap.type, table: snap.table, waiter: snap.waiter, customer: snap.customer, partner: snap.partner,
      date: snap.date, method, currency: OUTLET.currency, vat_rate: OUTLET.vatRate,
      items: snap.items.map((l) => ({ id: l.id, name: l.name, price: l.price, qty: l.qty, disc: Number(l.disc) || 0, note: l.note, mods: l.mods, total: lineTotal(l) })),
      discount: snap.discount, charge: snap.charge, tips: Number(snap.tips) || 0,
      subtotal: t.subtotal, discount_amount: t.discountAmt, vat: t.vat, charge_amount: t.chargeAmt, total: t.total,
    }).then((r) => setSales((s) => s.map((x) => (x.id === saleId ? { ...x, no: r.local_no, uuid: r.uuid } : x))))
      .catch((e) => notify(`Couldn't save the invoice on this PC: ${e.message}`));
    const removeId = orderId || editingId;
    if (removeId) setRunning((r) => r.filter((o) => o.id !== removeId));
    if (removeId === selectedRunning) setSelectedRunning(null);
    if (source === "cart") { if (!editingId) setNextNo((n) => n + 1); resetOrder(); }
    setModal(null);
    notify(`Invoice #${no} paid by ${method} — ${OUTLET.currency} ${money(t.total)}`);
  };

  const onOrderTypePicked = (type) => {
    setOrderType(type);
    const then = modal?.then;
    setModal(null);
    if (!then) { if (type === "dine") setModal({ name: "table" }); return; }
    if (then.kind === "add") {
      addToCart(then.item);
      if (type === "dine" && !table) setModal({ name: "table" });
    } else proceed(then.kind, type, table);
  };

  const onTablePicked = (tbl) => {
    setTable(tbl); setOrderType("dine");
    const then = modal?.then;
    setModal(null);
    if (then && (then.kind === "place" || then.kind === "invoice")) proceed(then.kind, "dine", tbl);
  };

  /* ---------- running orders ---------- */
  const sel = running.find((o) => o.id === selectedRunning);
  const filteredRunning = running.filter((o) => {
    const q = roQuery.trim().toLowerCase();
    if (!q) return true;
    return String(o.no).includes(q) || (o.table?.name || "").toLowerCase().includes(q) || o.waiter.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q);
  });
  const modifyOrder = () => {
    if (!sel) return;
    if (cart.length && !editingId && !window.confirm("Replace the items in the current order with this running order?")) return;
    setCart(sel.items.map((l) => ({ ...l }))); setOrderType(sel.type); setTable(sel.table); setWaiter(sel.waiter);
    setCustomerId((customers.find((c) => c.name === sel.customer) || customers[0]).id);
    setPartner(sel.partner || DELIVERY_PARTNERS[0]); setDiscount(sel.discount); setCharge(sel.charge); setTips(sel.tips);
    setOrderDate(sel.date); setEditingId(sel.id); setDrawer(false); setTab("order");
    notify(`Editing order #${sel.no}`);
  };
  const cancelRunning = () => {
    if (!sel || !window.confirm(`Cancel order #${sel.no}? This can't be undone.`)) return;
    setRunning((r) => r.filter((o) => o.id !== sel.id));
    if (editingId === sel.id) resetOrder();
    setSelectedRunning(null);
    notify(`Order #${sel.no} cancelled`);
  };
  const saveDraft = () => {
    if (!cart.length) return notify("Nothing to save — the order is empty");
    setDrafts((d) => [{ id: `d${Date.now()}`, at: new Date().toISOString(), snap: snapshot(), customerId }, ...d]);
    resetOrder();
    notify("Order saved as draft");
  };
  const restoreDraft = (d) => {
    const s = d.snap;
    setCart(s.items); setOrderType(s.type); setTable(s.table); setWaiter(s.waiter); setCustomerId(d.customerId);
    setPartner(s.partner || DELIVERY_PARTNERS[0]); setDiscount(s.discount); setCharge(s.charge); setTips(s.tips); setOrderDate(s.date);
    setDrafts((x) => x.filter((y) => y.id !== d.id));
    setModal(null); setTab("order"); notify("Draft restored");
  };

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => notify("Full screen isn't available here"));
  };

  /* ---------- header actions ---------- */
  const unread = notifications.filter((n) => !n.seen).length;
  const HEADER = [
    { id: "logout", label: "Log out", icon: LogOut, cls: "", on: () => window.confirm("Log out of the POS?") && onLogout() },
    { id: "lang", label: "Language", icon: Globe, cls: "opt-sm", on: () => setModal({ name: "language" }) },
    { id: "drafts", label: "Open drafts", icon: FolderOpen, cls: "", badge: drafts.length, on: () => setModal({ name: "drafts" }) },
    { id: "print", label: "Print last invoice", icon: Printer, cls: "opt-sm", on: () => notify(sales[0] ? `Printing invoice #${sales[0].no}` : "No invoice to print") },
    { id: "recent", label: "Recent sales", icon: History, cls: "", on: () => { setModal({ name: "recent" }); EAPI?.invoices.recent(50).then(setSales).catch(() => {}); } },
    { id: "online", label: "Self / online orders", icon: ShoppingBag, cls: "opt-md", on: () => notify("No new online orders") },
    { id: "qr", label: "Table QR orders", icon: QrCode, cls: "opt-md", on: () => notify("No pending QR orders") },
    { id: "reserve", label: "Reservations", icon: Ticket, cls: "opt-md", on: () => notify("No reservations for today") },
    { id: "notif", label: "Kitchen notifications", icon: Bell, cls: "", badge: unread, on: () => { setModal({ name: "notifications" }); setNotifications((n) => n.map((x) => ({ ...x, seen: true }))); } },
    { id: "register", label: "Register details", icon: Wallet, cls: "opt-sm", on: () => setModal({ name: "register" }) },
    { id: "dash", label: "Dashboard", icon: Gauge, cls: "opt-lg", on: () => notify("Opening dashboard (demo)") },
    { id: "status", label: "Order status screen", icon: Monitor, cls: "opt-lg", on: () => notify("Opening order status screen (demo)") },
    { id: "customer", label: "Customer display", icon: Tv, cls: "opt-lg", on: () => notify("Opening customer display (demo)") },
    ...(EAPI ? [{ id: "sync", label: "Sync now", icon: RefreshCw, cls: "opt-lg", on: () => { notify("Syncing…"); EAPI.sync.now().then(() => notify("Sync complete")).catch((e) => notify(e.message)); } }] : []),
    { id: "clear", label: "Clear running orders", icon: Trash2, cls: "opt-md", danger: true, on: () => { if (running.length && window.confirm("Clear all running orders?")) { setRunning([]); setSelectedRunning(null); notify("Running orders cleared"); } } },
  ];

  /* ============================================================================
     RENDER
     ========================================================================== */
  return (
    <div className="pos">
      <style>{CSS}</style>

      {/* ---------------- TOP BAR ---------------- */}
      <header className="topbar">
        <button className="icon-btn show-lt-xl" onClick={() => setDrawer(true)} aria-label="Running orders" title="Running orders">
          <ListOrdered size={20} />{running.length > 0 && <span className="badge">{running.length}</span>}
        </button>
        <nav className="tb-icons" aria-label="POS actions">
          {HEADER.map((h) => (
            <button key={h.id} className={`icon-btn ${h.cls} ${h.danger ? "danger" : ""}`} onClick={h.on} title={h.label} aria-label={h.label}>
              <h.icon size={20} />{h.badge > 0 && <span className="badge">{h.badge}</span>}
            </button>
          ))}
        </nav>
        <button className="icon-btn opt-sm" onClick={toggleFull} title={isFull ? "Exit full screen" : "Full screen"} aria-label="Toggle full screen">
          {isFull ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
        <button className="icon-btn" onClick={() => setSheet(true)} title="Main menu" aria-label="Main menu"><Menu size={22} /></button>
        <SyncBadge onClick={() => EAPI?.sync.now().catch((e) => notify(e.message))} />
        <div className="brand">{OUTLET.name}</div>
        <div className="chips" role="group" aria-label="Item filters">
          {[["veg", "Vegetarian"], ["bev", "Beverage"], ["combo", "Combo"], ["promo", "Promo"]].map(([k, l]) => (
            <button key={k} className={`chip ${k}`} aria-pressed={filters[k]} onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))} title={l}>
              <span className="chip-txt">{l}</span><span className="chip-abbr">{{ veg: "Veg", bev: "Bev", combo: "Combo", promo: "Promo" }[k]}</span>
            </button>
          ))}
        </div>
      </header>

      {/* ---------------- MAIN ---------------- */}
      <main className="main" data-tab={tab}>
        {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}

        {/* Running orders */}
        <aside className={`panel running ${drawer ? "open" : ""}`} aria-label="Running orders">
          <div className="ro-head">
            <h2>Running Orders</h2>
            <div style={{ display: "flex" }}>
              <button className="icon-btn" onClick={() => notify("Running orders refreshed")} aria-label="Refresh" title="Refresh"><RefreshCw size={17} /></button>
              <button className="icon-btn only-drawer" onClick={() => setDrawer(false)} aria-label="Close"><X size={18} /></button>
            </div>
          </div>
          <div style={{ padding: "0 10px" }}>
            <input className="input" placeholder="Table, order number, waiter" value={roQuery} onChange={(e) => setRoQuery(e.target.value)} />
          </div>
          <div className="ro-list">
            {filteredRunning.length === 0 && <div className="ro-empty">{running.length ? "No orders match your search." : "No running orders. Placed orders will appear here."}</div>}
            {filteredRunning.map((o) => {
              const t = calcTotals(o.items, o.discount, o.charge, o.tips);
              const TI = ORDER_TYPES[o.type].icon;
              return (
                <button key={o.id} className="ro-card" aria-pressed={selectedRunning === o.id} onClick={() => setSelectedRunning(o.id === selectedRunning ? null : o.id)} onDoubleClick={() => setModal({ name: "details", id: o.id })}>
                  <div className="row"><b className="num">#{o.no}</b><span className={`tag ${o.status.toLowerCase()}`}>{o.status}</span></div>
                  <div className="row muted"><span style={{ display: "flex", alignItems: "center", gap: 4 }}><TI size={13} />{o.type === "dine" ? `Table ${o.table?.name}` : ORDER_TYPES[o.type].label}{o.partner ? ` · ${o.partner}` : ""}</span></div>
                  <div className="row muted"><span>{o.customer}</span></div>
                  <div className="row"><span className="muted" style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} />{timeAgo(o.createdAt)}</span><b className="num" style={{ fontSize: 13 }}>{money(t.total)}</b></div>
                  {editingId === o.id && <span className="tag" style={{ background: "#FFF1D6", color: "#7A4F00", justifySelf: "start" }}>Editing</span>}
                </button>
              );
            })}
          </div>
          <div className="ro-actions">
            <button className="op-btn" disabled={!sel} onClick={modifyOrder}><Edit3 size={14} />Modify Order</button>
            <button className="op-btn" disabled={!sel} onClick={() => setModal({ name: "details", id: sel.id })}><Info size={14} />Order Details</button>
            <button className="op-btn" disabled={!sel} onClick={() => notify(`KOT for #${sel.no} sent to printer`)}><Printer size={14} />Re-print KOT</button>
            <button className="op-btn half" disabled={!sel} onClick={() => setModal({ name: "payment", source: "running", orderId: sel.id, snapshot: sel })}><Receipt size={14} />Invoice</button>
            <button className="op-btn half" onClick={saveDraft} title="Save the current order as a draft"><FileText size={14} />Draft</button>
            <button className="op-btn" disabled={!sel} onClick={cancelRunning}><Ban size={14} />Cancel Order</button>
          </div>
        </aside>

        {/* Cart */}
        <section className="panel cart" aria-label="Current order">
          <div className="type-row">
            {Object.entries(ORDER_TYPES).map(([k, v]) => (
              <button key={k} className="type-btn" aria-pressed={orderType === k} onClick={() => { setOrderType(k); if (k !== "dine") setTable(null); else if (!table) setModal({ name: "table" }); }}>
                <v.icon size={16} /><span className="lbl-long">{v.label}</span>
              </button>
            ))}
            <button className="type-btn" aria-pressed={orderType === "dine" && !!table} onClick={() => setModal({ name: "table" })}>
              <LayoutGrid size={16} />{table ? table.name : "Table"}
            </button>
          </div>

          <div className="sel-row">
            <select className="select" value={waiter} onChange={(e) => setWaiter(e.target.value)} aria-label="Waiter">
              {WAITERS.map((w) => <option key={w}>{w}</option>)}
            </select>
            <select className="select" value={customerId} onChange={(e) => setCustomerId(Number(e.target.value))} aria-label="Customer">
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>)}
            </select>
            <select className="select sel-partner" value={partner} onChange={(e) => setPartner(e.target.value)} disabled={orderType !== "delivery"} aria-label="Delivery partner" title={orderType !== "delivery" ? "Select Delivery to choose a partner" : ""}>
              {DELIVERY_PARTNERS.map((p) => <option key={p}>{p}</option>)}
            </select>
            <div className="sel-actions">
              <button className="sq-btn" title="Edit customer" aria-label="Edit customer" disabled={customer.id === 1} style={customer.id === 1 ? { opacity: .45 } : {}} onClick={() => setModal({ name: "customer", edit: customer })}><Pencil size={16} /></button>
              <button className="sq-btn" title="Add customer" aria-label="Add customer" onClick={() => setModal({ name: "customer" })}><UserPlus size={16} /></button>
            </div>
          </div>

          {editingId && (
            <div className="edit-banner">
              <span>Editing order #{running.find((o) => o.id === editingId)?.no}. Place the order to save changes.</span>
              <button onClick={() => { resetOrder(); notify("Changes discarded"); }}>Discard</button>
            </div>
          )}
          {(orderType || cart.length > 0) && (
            <div className="context-line">
              {orderType && <span>Type: <b>{ORDER_TYPES[orderType].label}</b></span>}
              {table && <span>Table: <b>{table.name}</b> · {table.persons} guests</span>}
              {orderType === "delivery" && partner !== DELIVERY_PARTNERS[0] && <span>Partner: <b>{partner}</b></span>}
              <span>Items: <b className="num">{totals.itemCount}</b></span>
            </div>
          )}

          <div className="cart-table">
            <div className="cart-grid cart-head">
              <span>Item</span><span className="r col-price">Price</span><span style={{ textAlign: "center" }}>Qty</span><span className="r">Total</span><span />
            </div>
            <div className="cart-body">
              {cart.length === 0 ? (
                <div className="cart-empty"><div><ShoppingCart size={40} /><div>Tap an item on the menu to start an order.</div></div></div>
              ) : cart.map((l) => (
                <div key={l.key} className="cart-grid cart-row">
                  <button className={`cart-name ${showImages ? "with-thumb" : ""}`} onClick={() => setModal({ name: "item", line: l })} title="Edit item">
                    {showImages && (() => { const it = ITEMS.find((x) => x.id === l.id); return it ? <ItemThumb item={it} size="sm" tint={catById[it.cat].tint} /> : null; })()}
                    <span className="txt">{l.name}
                    {(l.mods.length > 0 || l.note || l.disc > 0) && (
                      <small>{[...l.mods.map((m) => m.name), l.disc > 0 ? `${l.disc}% off` : "", l.note ? `“${l.note}”` : ""].filter(Boolean).join(", ")}</small>
                    )}</span>
                  </button>
                  <span className="r num col-price">{money(lineUnit(l))}</span>
                  <Qty value={l.qty} onChange={(q) => setLineQty(l.key, q)} />
                  <span className="r num" style={{ fontWeight: 800 }}>{money(lineTotal(l))}</span>
                  <button className="del" onClick={() => removeLine(l.key)} aria-label={`Remove ${l.name}`}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="total-bar">
            <button className="icon-btn" style={{ color: "var(--ink2)" }} onClick={() => setDatePop((v) => !v)} title="Order date" aria-label="Order date"><CalendarDays size={19} /></button>
            <button className="icon-btn" style={{ color: "var(--ink2)" }} onClick={() => setModal({ name: "summary" })} title="Discount, VAT, charges and tips" aria-label="Order summary"><Eye size={19} /></button>
            <span className="lbl">Total Payable:</span>
            <span className="amount num">{money(totals.total)}</span>
            {datePop && (
              <div className="date-pop">
                Order date
                <input type="date" className="input" value={orderDate} onChange={(e) => { setOrderDate(e.target.value); setDatePop(false); }} />
              </div>
            )}
          </div>

          <div className="act-row">
            <button className="act cancel" onClick={() => { if (!cart.length && !editingId) return resetOrder(); if (window.confirm(editingId ? "Discard changes to this order?" : "Clear the current order?")) { resetOrder(); notify("Order cleared"); } }}><X size={17} />Cancel</button>
            <button className="act quick" onClick={() => proceed("invoice")}><Receipt size={17} />Quick Invoice</button>
            <button className="act place" onClick={() => proceed("place")}><ChefHat size={17} />{editingId ? "Update Order" : "Place Order"}</button>
          </div>
        </section>

        {/* Menu */}
        <section className="panel menu" aria-label="Menu">
          <div className="menu-top">
            <div className="search">
              <Search size={17} />
              <input ref={searchRef} className="input" placeholder="Name or Code or Category or VEG or BEV or BAR" value={query} onChange={(e) => setQuery(e.target.value)} />
              {query ? <button className="del" style={{ position: "absolute", right: 6, top: 6 }} onClick={() => setQuery("")} aria-label="Clear search"><X size={16} /></button> : <kbd>/</kbd>}
            </div>
            <div className="view-toggle" role="group" aria-label="Item view">
              <button aria-pressed={showImages} onClick={() => setShowImages(true)} title="Show item images" aria-label="Show item images"><ImageIcon size={18} /></button>
              <button aria-pressed={!showImages} onClick={() => setShowImages(false)} title="Text only (faster on slow terminals)" aria-label="Text only"><List size={18} /></button>
            </div>
          </div>
          <div className="menu-body">
            <div className="cats" role="tablist" aria-label="Categories">
              <button className="cat all" aria-pressed={activeCat === "all"} onClick={() => setActiveCat("all")}>All</button>
              {CATEGORIES.map((c) => (
                <button key={c.id} className="cat" style={{ background: c.tint }} aria-pressed={activeCat === c.id} onClick={() => setActiveCat(c.id)}>{c.name}</button>
              ))}
            </div>
            <div className="items">
              {visibleItems.length === 0 && <div className="no-items">No items match. Clear the search or filters to see the full menu.</div>}
              {visibleItems.map((it) => (
                <button key={it.id} className={`item ${showImages ? "has-img" : ""}`} style={{ background: catById[it.cat].tint }} onClick={() => onItemClick(it)} onContextMenu={(e) => { e.preventDefault(); if (!orderType) return onItemClick(it); setModal({ name: "item", item: it }); }} title={`${it.code} · right-click or long-press for options`}>
                  <span className="marks">{it.veg && <span className="vegmark" title="Vegetarian" />}{it.combo && <span className="mini c">COMBO</span>}{it.promo && <span className="mini p">PROMO</span>}</span>
                  {qtyById[it.id] > 0 && <span className="inq num">{qtyById[it.id]}</span>}
                  {showImages ? (
                    <>
                      <ItemThumb item={it} tint={catById[it.cat].tint} />
                      <span className="body">
                        <span className="nm">{it.name}</span>
                        <span className="pr num"><span>Price: </span>{money(it.price)}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="nm">{it.name}</span>
                      <span className="pr num"><span>Price: </span>{money(it.price)}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Mobile switcher */}
      <nav className="mob-tabs" aria-label="Switch panel">
        <button aria-pressed={tab === "menu"} onClick={() => setTab("menu")}><LayoutGrid size={18} />Menu</button>
        <button aria-pressed={tab === "order"} onClick={() => setTab("order")}><ShoppingCart size={18} />Order ({totals.itemCount}) · <span className="num">{money(totals.total)}</span></button>
      </nav>

      {/* Side menu sheet */}
      {sheet && (
        <>
          <div className="scrim" onClick={() => setSheet(false)} />
          <div className="menu-sheet" role="dialog" aria-label="Main menu">
            <div className="modal-h"><h3>Main menu</h3><button className="icon-btn" onClick={() => setSheet(false)} aria-label="Close"><X size={20} /></button></div>
            <div style={{ overflowY: "auto", padding: "6px 0" }}>
              <button className="item-link" onClick={() => { setSheet(false); setDrawer(true); }}><ListOrdered size={18} />Running orders ({running.length})</button>
              {HEADER.map((h) => (
                <button key={h.id} className="item-link" onClick={() => { setSheet(false); h.on(); }} style={h.danger ? { color: "var(--danger)" } : {}}>
                  <h.icon size={18} />{h.label}{h.badge > 0 ? ` (${h.badge})` : ""}
                </button>
              ))}
              <button className="item-link" onClick={() => { setSheet(false); toggleFull(); }}>{isFull ? <Minimize size={18} /> : <Maximize size={18} />}{isFull ? "Exit full screen" : "Full screen"}</button>
            </div>
          </div>
        </>
      )}

      {/* ---------------- MODALS ---------------- */}
      {modal?.name === "orderType" && (
        <Modal title="Please select an order type" onClose={() => setModal(null)} footer={<button className="btn" onClick={() => setModal(null)}>Cancel</button>}>
          <div className="types">
            {Object.entries(ORDER_TYPES).map(([k, v]) => (
              <button key={k} className="type-card" onClick={() => onOrderTypePicked(k)}>
                <span className="ill" style={{ background: TYPE_ILL[k][0], color: TYPE_ILL[k][1] }}><v.icon size={40} strokeWidth={1.8} /></span>
                {v.label}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {modal?.name === "table" && <TableModal running={running} editingId={editingId} current={table} onClose={() => setModal(null)} onPick={onTablePicked} />}

      {modal?.name === "item" && (
        <ItemModal
          item={modal.item || ITEMS.find((x) => x.id === modal.line.id)}
          line={modal.line}
          onClose={() => setModal(null)}
          onSave={(data) => {
            if (modal.line) setCart((c) => c.map((l) => (l.key === modal.line.key ? { ...l, ...data } : l)));
            else addToCart(modal.item, data);
            setModal(null);
          }}
          onRemove={modal.line ? () => { removeLine(modal.line.key); setModal(null); } : null}
        />
      )}

      {modal?.name === "summary" && (
        <Modal title="Order summary" onClose={() => setModal(null)} size="sm" footer={<button className="btn primary" onClick={() => setModal(null)}>Done</button>}>
          <div className="sum-row"><span>Total items</span><span className="num">{totals.itemCount}</span></div>
          <div className="sum-row"><span>Subtotal</span><span className="num">{money(totals.subtotal)}</span></div>
          <div className="sum-row"><span>Discount</span>
            <div className="inline-edit">
              <input className="input num" type="number" min="0" value={discount.value} onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value }))} aria-label="Discount value" />
              <select className="select" value={discount.mode} onChange={(e) => setDiscount((d) => ({ ...d, mode: e.target.value }))} aria-label="Discount type"><option value="fixed">{OUTLET.currency}</option><option value="percent">%</option></select>
              <span className="num" style={{ minWidth: 60, textAlign: "right" }}>-{money(totals.discountAmt)}</span>
            </div>
          </div>
          <div className="sum-row"><span>VAT ({OUTLET.vatRate}%)</span><span className="num">{money(totals.vat)}</span></div>
          <div className="sum-row"><span>{orderType === "delivery" ? "Delivery charge" : "Service charge"}</span>
            <div className="inline-edit">
              <input className="input num" type="number" min="0" value={charge.value} onChange={(e) => setCharge((c) => ({ ...c, value: e.target.value }))} aria-label="Charge value" />
              <select className="select" value={charge.mode} onChange={(e) => setCharge((c) => ({ ...c, mode: e.target.value }))} aria-label="Charge type"><option value="fixed">{OUTLET.currency}</option><option value="percent">%</option></select>
              <span className="num" style={{ minWidth: 60, textAlign: "right" }}>{money(totals.chargeAmt)}</span>
            </div>
          </div>
          <div className="sum-row"><span>Tips</span>
            <div className="inline-edit"><input className="input num" type="number" min="0" value={tips} onChange={(e) => setTips(e.target.value)} aria-label="Tips" /><span className="num" style={{ minWidth: 60, textAlign: "right" }}>{money(totals.tips)}</span></div>
          </div>
          <div className="sum-row total"><span>Total payable</span><span className="num">{OUTLET.currency} {money(totals.total)}</span></div>
        </Modal>
      )}

      {modal?.name === "payment" && (
        <PaymentModal snap={modal.snapshot} onClose={() => setModal(null)}
          onPay={(method) => completePayment({ method, source: modal.source, orderId: modal.orderId, snap: modal.snapshot })} />
      )}

      {modal?.name === "customer" && (
        <CustomerModal edit={modal.edit} onClose={() => setModal(null)} onSave={(c) => {
          if (modal.edit) { setCustomers((cs) => cs.map((x) => (x.id === c.id ? c : x))); notify("Customer updated"); }
          else { const id = Math.max(...customers.map((x) => x.id)) + 1; setCustomers((cs) => [...cs, { ...c, id }]); setCustomerId(id); notify(`${c.name} added and selected`); }
          setModal(null);
        }} />
      )}

      {modal?.name === "details" && (() => {
        const o = running.find((x) => x.id === modal.id);
        if (!o) return null;
        const t = calcTotals(o.items, o.discount, o.charge, o.tips);
        return (
          <Modal title={`Order #${o.no}`} onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => notify(`KOT for #${o.no} sent to printer`)}><Printer size={16} />Re-print KOT</button><button className="btn primary" onClick={() => setModal({ name: "payment", source: "running", orderId: o.id, snapshot: o })}><Receipt size={16} />Invoice</button></>}>
            <div className="grid2" style={{ marginBottom: 14, fontSize: 13 }}>
              <div><span className="muted">Type</span><div><b>{ORDER_TYPES[o.type].label}{o.table ? ` · ${o.table.name} (${o.table.persons} guests)` : ""}</b></div></div>
              <div><span className="muted">Status</span><div><span className={`tag ${o.status.toLowerCase()}`}>{o.status}</span></div></div>
              <div><span className="muted">Customer</span><div><b>{o.customer}</b></div></div>
              <div><span className="muted">Waiter</span><div><b>{o.waiter}</b></div></div>
              {o.partner && <div><span className="muted">Delivery partner</span><div><b>{o.partner}</b></div></div>}
              <div><span className="muted">Placed</span><div><b>{timeAgo(o.createdAt)}</b></div></div>
            </div>
            <div className="list">
              {o.items.map((l) => (
                <div key={l.key} className="list-row"><span><b>{l.qty} × {l.name}</b>{l.mods.length > 0 && <div className="muted" style={{ fontSize: 12 }}>{l.mods.map((m) => m.name).join(", ")}</div>}</span><b className="num">{money(lineTotal(l))}</b></div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="sum-row"><span>Subtotal</span><span className="num">{money(t.subtotal)}</span></div>
              {t.discountAmt > 0 && <div className="sum-row"><span>Discount</span><span className="num">-{money(t.discountAmt)}</span></div>}
              <div className="sum-row"><span>VAT ({OUTLET.vatRate}%)</span><span className="num">{money(t.vat)}</span></div>
              {t.chargeAmt > 0 && <div className="sum-row"><span>Charge</span><span className="num">{money(t.chargeAmt)}</span></div>}
              <div className="sum-row total"><span>Total</span><span className="num">{OUTLET.currency} {money(t.total)}</span></div>
            </div>
          </Modal>
        );
      })()}

      {modal?.name === "drafts" && (
        <Modal title="Drafts" onClose={() => setModal(null)}>
          {drafts.length === 0 ? <p className="muted">No drafts yet. Use Draft in the running orders panel to park an order and come back to it.</p> : (
            <div className="list">
              {drafts.map((d) => {
                const t = calcTotals(d.snap.items, d.snap.discount, d.snap.charge, d.snap.tips);
                return (
                  <div key={d.id} className="list-row">
                    <span><b>{d.snap.customer}</b><div className="muted" style={{ fontSize: 12 }}>{d.snap.items.length} lines · saved {timeAgo(d.at)}</div></span>
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}><b className="num">{money(t.total)}</b>
                      <button className="btn primary" onClick={() => restoreDraft(d)}>Restore</button>
                      <button className="btn" onClick={() => setDrafts((x) => x.filter((y) => y.id !== d.id))} aria-label="Delete draft"><Trash2 size={16} /></button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {modal?.name === "recent" && (
        <Modal title="Recent sales" onClose={() => setModal(null)} size="lg">
          <div className="list">
            {sales.map((s) => (
              <div key={s.id} className="list-row">
                <span><b className="num">#{s.no}</b> · {ORDER_TYPES[s.type]?.label} · {s.customer}<div className="muted" style={{ fontSize: 12 }}>{s.method} · {timeAgo(s.at)}{s.status ? ` · ${s.status === "synced" ? "Synced" : s.status === "rejected" ? "Rejected by server" : "Waiting to sync"}` : ""}</div></span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}><b className="num">{OUTLET.currency} {money(s.total)}</b><button className="btn" onClick={() => notify(`Printing invoice #${s.no}`)}><Printer size={16} />Print</button></span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {modal?.name === "notifications" && (
        <Modal title="Kitchen notifications" onClose={() => setModal(null)} footer={notifications.length > 0 && <button className="btn" onClick={() => setNotifications([])}>Clear all</button>}>
          {notifications.length === 0 ? <p className="muted">You're all caught up.</p> : (
            <div className="list">
              {notifications.map((n) => (
                <div key={n.id} className="list-row">
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>{n.ready ? <Check size={18} color="var(--ok)" /> : <ChefHat size={18} color="var(--amber)" />}<span>{n.text}<div className="muted" style={{ fontSize: 12 }}>{timeAgo(n.at)}</div></span></span>
                  <button className="btn" onClick={() => setNotifications((x) => x.filter((y) => y.id !== n.id))}>Dismiss</button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {modal?.name === "register" && (() => {
        const by = (m) => sales.filter((s) => s.method === m).reduce((a, s) => a + s.total, 0);
        const opening = 500;
        return (
          <Modal title="Register details" onClose={() => setModal(null)} size="sm" footer={<button className="btn danger" onClick={() => { setModal(null); notify("Register closed (demo)"); }}>Close register</button>}>
            <div className="sum-row"><span>Opening balance</span><span className="num">{money(opening)}</span></div>
            <div className="sum-row"><span>Cash sales</span><span className="num">{money(by("Cash"))}</span></div>
            <div className="sum-row"><span>Card sales</span><span className="num">{money(by("Card"))}</span></div>
            <div className="sum-row"><span>Online / wallet</span><span className="num">{money(by("Online / Wallet"))}</span></div>
            <div className="sum-row"><span>Invoices</span><span className="num">{sales.length}</span></div>
            <div className="sum-row total"><span>Cash in drawer</span><span className="num">{money(opening + by("Cash"))}</span></div>
          </Modal>
        );
      })()}

      {modal?.name === "language" && (
        <Modal title="Language" onClose={() => setModal(null)} size="sm">
          <div className="list">
            {["English", "العربية", "മലയാളം", "हिन्दी"].map((l) => <button key={l} className="btn" style={{ justifyContent: "flex-start" }} onClick={() => { setModal(null); notify(`Language set to ${l} (demo)`); }}><Globe size={16} />{l}</button>)}
          </div>
        </Modal>
      )}

      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  );
}

/* ============================================================================
   MODAL COMPONENTS
   ========================================================================== */
function TableModal({ running, editingId, current, onClose, onPick }) {
  const [area, setArea] = useState(current?.area || AREAS[0]);
  const [picked, setPicked] = useState(current);
  const [persons, setPersons] = useState(current?.persons || 2);
  const busy = useMemo(() => {
    const m = {};
    running.forEach((o) => { if (o.table && o.id !== editingId) m[o.table.id] = (m[o.table.id] || 0) + (o.table.persons || 0); });
    return m;
  }, [running, editingId]);
  return (
    <Modal title="Select a table" size="lg" onClose={onClose}
      footer={<>
        <span style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: 10, fontWeight: 700 }}><Users size={18} />Guests <Qty value={persons} onChange={(v) => setPersons(Math.max(1, v))} /></span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!picked} onClick={() => onPick({ ...picked, persons })}>Select table</button>
      </>}>
      <div className="seg" role="tablist">
        {AREAS.map((a) => <button key={a} aria-pressed={area === a} onClick={() => setArea(a)}>{a}</button>)}
      </div>
      <div className="tables">
        {TABLES.filter((t) => t.area === area).map((t) => {
          const used = busy[t.id] || 0;
          return (
            <button key={t.id} className={`tbl ${used ? "busy" : ""}`} aria-pressed={picked?.id === t.id} onClick={() => setPicked(t)}>
              <b>{t.name}</b>
              <span className="muted" style={{ fontSize: 12 }}>{t.seats} seats</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: used ? "#9A6400" : "var(--ok)" }}>{used ? `${Math.max(0, t.seats - used)} free` : "Available"}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function ItemModal({ item, line, onClose, onSave, onRemove }) {
  const [qty, setQty] = useState(line?.qty || 1);
  const [mods, setMods] = useState(line?.mods || []);
  const [disc, setDisc] = useState(line?.disc || 0);
  const [note, setNote] = useState(line?.note || "");
  const unit = item.price + mods.reduce((s, m) => s + m.price, 0);
  const toggle = (m) => setMods((ms) => (ms.some((x) => x.id === m.id) ? ms.filter((x) => x.id !== m.id) : [...ms, m]));
  return (
    <Modal title={item.name} onClose={onClose}
      footer={<>
        {onRemove && <button className="btn" style={{ marginRight: "auto", color: "var(--danger)" }} onClick={onRemove}><Trash2 size={16} />Remove</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSave({ qty: Math.max(1, qty), mods, disc: Number(disc) || 0, note: note.trim() })}>
          {line ? "Update item" : "Add to order"} · {money(unit * Math.max(1, qty) * (1 - (Number(disc) || 0) / 100))}
        </button>
      </>}>
      <ItemThumb item={item} size="lg" tint={(CATEGORIES.find((c) => c.id === item.cat) || {}).tint} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span className="muted">{item.code} · {money(item.price)} each</span>
        <Qty big value={qty} onChange={(v) => setQty(Math.max(1, v))} />
      </div>
      {item.modifiers.length > 0 && <>
        <div className="field" style={{ marginBottom: 6 }}>Modifiers</div>
        <div className="mod-grid">
          {item.modifiers.map((m) => (
            <button key={m.id} className="mod" aria-pressed={mods.some((x) => x.id === m.id)} onClick={() => toggle(m)}>
              <span>{m.name}</span><span className="num">{m.price ? `+${money(m.price)}` : "Free"}</span>
            </button>
          ))}
        </div>
      </>}
      <div className="grid2">
        <label className="field">Item discount (%)<input className="input num" type="number" min="0" max="100" value={disc} onChange={(e) => setDisc(e.target.value)} /></label>
        <label className="field">Unit price with modifiers<input className="input num" readOnly value={money(unit)} /></label>
      </div>
      <label className="field"><span style={{ display: "flex", gap: 6, alignItems: "center" }}><StickyNote size={14} />Kitchen note</span>
        <textarea className="input" placeholder="e.g. less spicy, sauce on the side" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Modal>
  );
}

function PaymentModal({ snap, onClose, onPay }) {
  const t = calcTotals(snap.items, snap.discount, snap.charge, snap.tips);
  const [method, setMethod] = useState("cash");
  const [given, setGiven] = useState("");
  const due = Math.round(t.total * 100) / 100;
  const change = Math.max(0, (Number(given) || 0) - due);
  const short = method === "cash" && given !== "" && Number(given) < due;
  const quick = [due, ...[10, 20, 50, 100, 200, 500].filter((v) => v > due).slice(0, 4)];
  return (
    <Modal title="Payment" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn ok" disabled={short} onClick={() => onPay(PAYMENT_METHODS.find((m) => m.id === method).name)}><Check size={16} />Complete sale</button>
      </>}>
      <div className="pay-due"><span>Amount due</span><span className="num">{OUTLET.currency} {money(due)}</span></div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        {ORDER_TYPES[snap.type]?.label}{snap.table ? ` · Table ${snap.table.name}` : ""} · {snap.customer} · {t.itemCount} items · VAT {money(t.vat)} included
      </div>
      <div className="pay-methods">
        {PAYMENT_METHODS.map((m) => (
          <button key={m.id} className="pm" aria-pressed={method === m.id} onClick={() => setMethod(m.id)}><m.icon size={24} />{m.name}</button>
        ))}
      </div>
      {method === "cash" && <>
        <div className="quick-amts">
          {quick.map((v, i) => <button key={i} className="num" onClick={() => setGiven(String(v))}>{i === 0 ? "Exact" : money(v)}</button>)}
        </div>
        <div className="grid2">
          <label className="field">Cash received<input className="input num" type="number" min="0" value={given} onChange={(e) => setGiven(e.target.value)} placeholder={money(due)} /></label>
          <label className="field">Change to return<input className="input num" readOnly value={money(change)} style={{ fontWeight: 800 }} /></label>
        </div>
        {short && <div style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600 }}>Cash received is less than the amount due.</div>}
      </>}
    </Modal>
  );
}

function CustomerModal({ edit, onClose, onSave }) {
  const [f, setF] = useState(edit || { name: "", phone: "", email: "", address: "" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal title={edit ? "Edit customer" : "Add customer"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name.trim()} onClick={() => onSave({ ...f, name: f.name.trim() })}>{edit ? "Save customer" : "Add customer"}</button></>}>
      <label className="field">Name<input className="input" value={f.name} onChange={set("name")} autoFocus /></label>
      <div className="grid2">
        <label className="field">Phone<input className="input" value={f.phone} onChange={set("phone")} /></label>
        <label className="field">Email<input className="input" type="email" value={f.email || ""} onChange={set("email")} /></label>
      </div>
      <label className="field">Delivery address<textarea className="input" value={f.address || ""} onChange={set("address")} /></label>
    </Modal>
  );
}
