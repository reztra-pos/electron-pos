/**
 * Reztra POS — main screen (React) — ONLINE
 * -----------------------------------------
 * Same layout and design as before; every action now goes to the server API:
 *   menu / tables / waiters / customers  -> GET  /v1/pos/bootstrap, /v1/tables, /v1/customers
 *   live totals (tax, charges, promotions)-> POST /v1/orders/calculate   (server is the only calculator)
 *   place / modify / cancel order (KOT)   -> POST /v1/orders, PUT /v1/orders/{id}, POST /v1/orders/{id}/cancel
 *   running orders (live, every 10 s)     -> GET  /v1/orders
 *   payment + ZATCA (web app's own code)  -> POST /v1/orders/{id}/invoice, POST /v1/invoices/quick
 *   drafts, notifications, register       -> /v1/drafts, /v1/notifications, /v1/register
 * Orders placed here appear on the web POS and the kitchen screen at once, and the other way round.
 *
 * Layout breakpoints (tuned for POS terminals):
 *   ≥ 1280px  : Running orders | Cart | Categories + Items  (desktop)
 *   1024–1279 : Cart | Categories + Items, running orders in a drawer (15" POS)
 *   768–1023  : same, categories become a horizontal strip (10–12" POS / 1024x768)
 *   < 768     : one panel at a time with a bottom Menu / Order switcher (small POS / tablet portrait)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LogOut, FolderOpen, Printer, History, Bell, Wallet,
  Trash2, Menu, Search, RefreshCw, Pencil, Plus, Minus,
  X, UtensilsCrossed, Truck, LayoutGrid, CalendarDays, Eye, Info, Receipt, Ban, UserPlus,
  Check, CreditCard, Banknote, Smartphone, Clock, ChefHat, StickyNote, FileText, ListOrdered,
  ShoppingCart, Users, Edit3, Sandwich, CupSoda, IceCreamCone, Beef, Drumstick, Citrus, Grape, Milk,
  GlassWater, Cookie, Martini, Flame, Soup, Image as ImageIcon, List, ShoppingBag, WifiOff, Loader2,
  ShieldCheck, ShieldAlert, Settings2, ChevronDown, Eraser, Languages, Sun, Moon, Keyboard, FileDown,
} from "lucide-react";
import { useTheme } from "../theme.js";
import { useOskEnabled, openKeyboard } from "../osk.jsx";
import { get, post, put, del, newKey, printHtml, printRaw, savePdf } from "../api/pos.js";
import { tr, tn, getLang, setLang, isRtl, LANGS } from "../i18n.js";

/* ============================================================================
   DATA FROM THE SERVER (filled by applyCatalog() before this screen is shown)
   ========================================================================== */
const TINTS = ["#FFF3BF", "#DCEBFB", "#DCF2E3", "#FBE0E6", "#EBE2FA", "#FDE8D3", "#D6F2F1", "#E7EFDC", "#E6E9EF"];

let SETTINGS = {};
let OUTLET = { name: "", currency: "", precision: 2 };
let CATEGORIES = [];       // [{ id, name, tint, art }]
let ITEMS = [];            // top-level items (variations inside .variations)
let ITEM_BY_ID = {};       // every sellable item incl. variations, by server id
let WAITERS = [];          // [{ id, name }]
let INITIAL_CUSTOMERS = [];// [{ id, name, phone, email, address }]
let DEFAULT_CUSTOMER_ID = 1;
let PARTNERS = [];         // [{ id, name, logo }]
let PAYMENT_METHODS = [];  // [{ id, name, icon, cash }]
let REGISTER_OPEN = null;  // true / false / null (waiters: no register)
let DENOMINATIONS = [];    // [1, 2, 5, 10, ...] from tbl_denominations

// category illustration by name (only used when an item has no photo)
const ART_RULES = [
  [/falooda|ice|dessert|sweet/i, IceCreamCone], [/mix|grape|fruit/i, Grape], [/juice|passion|citrus|lemon|orange/i, Citrus],
  [/milk|shake|crush|roob|lassi/i, Milk], [/drink|soda|cola|bev/i, CupSoda], [/extra|side|cookie|snack/i, Cookie],
  [/kubz|grill|bbq|tikka/i, Flame], [/rice|soup|biryani|curry/i, Soup], [/club|wrap|sandwich|shawarma|roll/i, Sandwich],
  [/mojito|mocktail|cocktail/i, Martini], [/water|bottle/i, GlassWater], [/broast|chicken|wing/i, Drumstick], [/burger|beef|meat/i, Beef],
];
const artFor = (name) => (ART_RULES.find(([re]) => re.test(name || "")) || [null, UtensilsCrossed])[1];

// In-app confirm box. Native window.confirm()/alert() are not used: in Electron they leave the window's
// text fields unable to take typing until the window is re-focused.
let _ask = null;
const ask = (message, opts = {}) => (_ask ? _ask({ message, ...opts }) : Promise.resolve(false));
function ConfirmHost() {
  const [box, setBox] = useState(null);
  useEffect(() => { _ask = (o) => new Promise((res) => setBox({ ...o, res })); return () => { _ask = null; }; }, []);
  if (!box) return null;
  const done = (v) => { box.res(v); setBox(null); };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400 }}>
      <Modal title={box.title || tr("Please confirm")} onClose={() => done(false)} size="sm"
        footer={<><button className="btn" onClick={() => done(false)}>{box.cancelLabel || tr("Cancel")}</button>
          <button className="btn primary" autoFocus style={box.danger ? { background: "var(--danger)", borderColor: "var(--danger)" } : null} onClick={() => done(true)}>{box.confirmLabel || tr("OK")}</button></>}>
        <p style={{ margin: 0 }}>{box.message}</p>
      </Modal>
    </div>
  );
}

// names in the screen's language: Arabic uses the items' / categories' Arabic (secondary) names when set
const itemName = (it) => (getLang() === "ar" && it?.name2 ? it.name2 : it?.name || "");
const catName = (c) => (getLang() === "ar" && c?.name2 ? c.name2 : c?.name || "");
// order type of an order / invoice in the screen's language
const typeName = (o) => { const k = TYPE_KEY[Number(o?.order_type)]; return k ? tr(ORDER_TYPES[k].label) : (o?.order_type_name || ""); };

// loyalty points are not used in this app (payments, register)
const isLoyalty = (m) => !!m?.is_loyalty || /loyal/i.test(m?.name || "");
const PAY_ICON = (name) => (/card|visa|master|mada/i.test(name) ? CreditCard : /cash/i.test(name) ? Banknote : Smartphone);

/** Turn GET /v1/pos/bootstrap (+ GET /v1/customers) into what the screen uses. */
export function applyCatalog(boot, customers = []) {
  SETTINGS = boot.settings || {};
  OUTLET = { name: SETTINGS.outlet?.name || "", currency: SETTINGS.currency || "", precision: Number(SETTINGS.precision ?? 2) };
  CATEGORIES = (boot.categories || []).map((c, i) => ({ id: c.id, name: c.name, name2: c.secondary_name || "", tint: TINTS[i % TINTS.length], art: artFor(c.name) }));
  const catArt = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.art]));
  const mapItem = (it, parent = null) => ({
    id: it.id,
    code: it.code || String(it.id),
    name: parent ? `${parent.name} ${it.name}` : it.name,
    shortName: it.name,
    // Arabic name (secondary name in the web app), shown when the POS is in Arabic
    name2: parent ? [parent.name2, it.secondary_name].filter(Boolean).join(" ") : (it.secondary_name || ""),
    cat: it.category_id,
    prices: it.prices || { dine_in: 0, take_away: 0, delivery: 0, partners: {} },
    openPrice: !!it.open_price,
    modifiers: (it.modifiers || []).map((m) => ({ id: m.id, name: m.name, price: Number(m.price) || 0, openPrice: !!m.open_price })),
    veg: !!it.veg, bev: !!it.beverage, promo: !!it.promotion, promotion: it.promotion,
    combo: !!it.combo, comboGroups: it.combo?.type === 2 ? it.combo.groups || [] : null, comboItems: it.combo?.items || [],
    image: it.image_url || null,
    unavailable: !!it.unavailable,
    art: catArt[it.category_id],
    parentId: parent?.id || null,
    variations: [],
  });
  ITEMS = [];
  ITEM_BY_ID = {};
  (boot.items || []).forEach((it) => {
    const item = mapItem(it);
    item.variations = (it.variations || []).map((v) => mapItem(v, item));
    ITEMS.push(item);
    ITEM_BY_ID[item.id] = item;
    item.variations.forEach((v) => { ITEM_BY_ID[v.id] = v; });
  });
  WAITERS = (boot.waiters || []).map((w) => ({ id: w.id, name: w.name }));
  const dc = boot.default_customer;
  DEFAULT_CUSTOMER_ID = dc?.id || Number(SETTINGS.default_customer_id) || 1;
  const list = (Array.isArray(customers) ? customers : []).map((c) => ({ id: c.id, name: c.name, phone: c.phone || "", email: c.email || "", address: c.address || "" }));
  if (dc && !list.some((c) => c.id === dc.id)) list.unshift({ id: dc.id, name: dc.name, phone: dc.phone || "", email: "", address: "" });
  INITIAL_CUSTOMERS = list.sort((a, b) => (a.id === DEFAULT_CUSTOMER_ID ? -1 : b.id === DEFAULT_CUSTOMER_ID ? 1 : 0));
  PARTNERS = (boot.delivery_partners || []).map((p) => ({ id: p.id, name: p.name, logo: p.logo_url || null }));
  // loyalty points need a points field on the payment screen: use the web POS for those payments
  PAYMENT_METHODS = (boot.payment_methods || []).filter((m) => !isLoyalty(m))
    .map((m) => ({ id: m.id, name: m.name, icon: PAY_ICON(m.name), cash: m.id === 1 || /cash/i.test(m.name) }));
  REGISTER_OPEN = boot.register ? !!boot.register.open : null;
  // quick cash buttons in the payment popup: the outlet's denominations from the web app (Denomination list)
  DENOMINATIONS = (boot.denominations || []).map((d) => Number(d.amount)).filter((v) => v > 0);
}

/* ============================================================================
   HELPERS
   ========================================================================== */
const money = (n) => (Number(n) || 0).toFixed(OUTLET.precision ?? 2);
const ORDER_TYPES = {
  dine: { label: "Dine In", icon: UtensilsCrossed, id: 1 },
  take: { label: "Take Away", icon: ShoppingBag, id: 2 },
  delivery: { label: "Delivery", icon: Truck, id: 3 },
};
const TYPE_KEY = { 1: "dine", 2: "take", 3: "delivery" };
// the order can sit on several tables: [{ id, name, persons }]
const hasTables = (t) => Array.isArray(t) && t.length > 0;
const tblText = (t) => (t || []).map((x) => x.name).join(", ");
const tblPersons = (t) => (t || []).reduce((s, x) => s + (Number(x.persons) || 0), 0);
// open price, combo choices or modifiers: ask before adding to the cart
// item discount in the item popup is switched off for now; set to true to bring it back
const ITEM_DISCOUNT_ENABLED = false;
const needsOptions = (it) => !!(it && (it.openPrice || it.comboGroups || it.modifiers?.length));
const partnerById = (id) => PARTNERS.find((p) => String(p.id) === String(id));
const defaultTypeKey = () => TYPE_KEY[Number(SETTINGS.default_order_type)] || null;

/** list price of an item for an order type / delivery partner (same rule as the server) */
function priceFor(item, type, partnerId) {
  if (!item) return 0;
  const p = item.prices;
  if (type === "delivery") return Number((partnerId && p.partners?.[partnerId]) || p.delivery) || 0;
  if (type === "take") return Number(p.take_away) || 0;
  return Number(p.dine_in) || 0;
}
/** extra price of the options picked in a "choose per group" combo */
function comboExtra(item, selections, type) {
  if (!item?.comboGroups) return 0;
  const key = type === "delivery" ? "delivery" : type === "take" ? "take_away" : "dine_in";
  return item.comboGroups.reduce((sum, g) => {
    const opt = g.options.find((o) => selections?.includes(o.food_menu_id)) || g.options[0];
    return sum + (Number(opt?.prices?.[key]) || 0);
  }, 0);
}
// grouped combo: the options chosen for a saved line, read back from its text "Fries (Qty: 1), Pepsi (Qty: 1)"
function comboFromText(item, text) {
  if (!item?.comboGroups || !text) return [];
  const parts = String(text).split(/,\s*(?![^()]*\))/).map((x) => x.trim().toLowerCase());
  return item.comboGroups.map((g) => {
    const hit = g.options.find((o) => parts.includes(`${o.name} (Qty: ${Number(o.qty) || 1})`.toLowerCase()))
      || g.options.find((o) => parts.some((p2) => p2.startsWith(`${String(o.name).toLowerCase()} (`)));
    return hit?.food_menu_id;
  }).filter(Boolean);
}
// "not applicable" modifier: price is typed at the till when it is selected (like the web POS keypad)
const isOpenMod = (itemId, modId) => !!ITEM_BY_ID[itemId]?.modifiers.find((x) => x.id === modId)?.openPrice;
const lineUnit = (l) => l.price + l.mods.reduce((s, m) => s + m.price, 0);
const lineTotal = (l) => lineUnit(l) * l.qty * (1 - (Number(l.disc) || 0) / 100);
const amountStr = ({ mode, value }) => (Number(value) > 0 ? (mode === "percent" ? `${Number(value)}%` : String(Number(value))) : "");
const parseAmount = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return { mode: "fixed", value: 0 };
  return t.endsWith("%") ? { mode: "percent", value: Number(t.slice(0, -1)) || 0 } : { mode: "fixed", value: Number(t) || 0 };
};
const firstError = (e) => (e?.errors && Object.values(e.errors)[0]) || e?.message || "Something went wrong.";
const timeAgo = (when, at) => {
  // a self / online order keeps the customer's phone time; if that clock is ahead of the server the
  // minutes come out negative - show when it was placed instead of a wrong "just now"
  if (typeof when === "number" && when < 0 && at) return tr("placed {time}", { time: String(at).slice(11, 16) });
  const t = typeof when === "number" ? Date.now() - when * 60000 : new Date(String(when).replace(" ", "T"));
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? tr("just now") : m < 60 ? tr("{m} min ago", { m }) : tr("{h} h {m} min ago", { h: Math.floor(m / 60), m: m % 60 });
};
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- receipts (printed on the default Windows printer, 80 mm) ---------- */
const RECEIPT_CSS = `*{box-sizing:border-box}body{font:12px/1.35 Arial,Helvetica,sans-serif;width:72mm;margin:0 auto;padding:4mm 0;color:#000}
h1{font-size:16px;margin:0 0 2px;text-align:center}h2{font-size:14px;margin:6px 0;text-align:center}.c{text-align:center}.r{text-align:right}
.m{margin:2px 0}table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}.hr{border-top:1px dashed #000;margin:6px 0}
.b{font-weight:bold}.big{font-size:15px;font-weight:bold}.small{font-size:11px}img.qr{display:block;margin:6px auto;width:40mm;height:40mm}
.kitchen{page-break-after:always}.kitchen:last-child{page-break-after:auto}`;

// item amount after its discount + its modifiers (modifier price × qty), as stored by the server
const lineAmount = (it) => (Number(it.price_with_discount) || 0) + (it.modifiers || []).reduce((s, m) => s + (m.total != null ? Number(m.total) : (Number(m.price) || 0) * (Number(it.qty) || 0)), 0);


const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Noto+Sans+Arabic:wght@400;500;600;700;800&family=Noto+Sans+Devanagari:wght@400;500;600;700;800&display=swap');
.pos{--bg:#EDF0F4;--panel:#FFFFFF;--ink:#1D2433;--ink2:#5A6478;--line:#DCE1E8;--brand:#5B3FD1;--brand-2:#EEE9FF;--brand-d:#3F2A9E;
 --soft:#F6F7F9;--soft2:#F1F2F6;--hover:#FAFAFD;--line2:#EEF1F5;--muted:#9AA3B2;
 --warn-bg:#FFF1D6;--warn-ink:#7A4F00;--warn-line:#F4D38E;--danger-bg:#FDECEA;--danger-ink:#A4262C;--danger-line:#F5C2C0;--ok-bg:#DCF2E3;--info-bg:#E3EEFD;
 --modal-bg:rgba(18,22,34,.5);--tint-mix:100%;
 --ok:#1E9E6A;--danger:#DC3F35;--info:#1E7FD8;--amber:#E8A317;--veg:#1E8E3E;--radius:10px;
 font-family:Manrope,"Noto Sans Arabic","Noto Sans Devanagari",Tahoma,"Nirmala UI",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);
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
.badge{position:absolute;top:3px;inset-inline-end:3px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--danger);color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center}
.sync-pill{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:16px;border:1px solid var(--line);background:var(--panel);font-size:12px;font-weight:700;color:var(--ink2);white-space:nowrap;margin-inline-start:auto}
.sync-pill .dot{width:8px;height:8px;border-radius:50%;background:var(--ok)}
.sync-pill.off .dot{background:var(--danger)}.sync-pill.off{color:var(--danger)}
.sync-pill.busy .dot{background:var(--amber);animation:pulse 1s infinite}
@keyframes pulse{50%{opacity:.3}}
.sync-pill .q{background:var(--warn-bg);color:var(--warn-ink);border-radius:10px;padding:1px 7px}
.sync-pill + .brand{margin-inline-start:8px}
.brand{font-weight:800;font-size:18px;letter-spacing:.02em;color:var(--brand);padding:0 14px;border-inline-start:2px solid var(--line);border-inline-end:2px solid var(--line);white-space:nowrap;margin-inline-start:auto}
.chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
.chip{border:0;border-radius:8px;padding:8px 12px;font-weight:700;font-size:13px;white-space:nowrap;display:flex;align-items:center;gap:6px;color:#fff;opacity:.92}
.chip[aria-pressed=true]{opacity:1;box-shadow:inset 0 0 0 2px rgba(0,0,0,.25)}
.chip[aria-pressed=true]::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--panel)}
.chip-abbr{display:none}
.chip.veg{background:#4CAF50}.chip.bev{background:#5E7486}.chip.combo{background:#E8A317}.chip.promo{background:#E0245E}

/* main grid */
.main{flex:1;min-height:0;display:grid;grid-template-columns:220px minmax(370px,40fr) 60fr;gap:10px;padding:10px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);min-height:0;display:flex;flex-direction:column;overflow:hidden}

/* running orders */
.ro-head{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 6px}
.ro-head h2{margin:0;font-size:17px;font-weight:800}
.input{width:100%;height:38px;border:1px solid var(--line);border-radius:8px;padding:0 10px;font:inherit;font-size:13px;background:var(--panel);color:var(--ink)}
.ro-list{flex:1;overflow-y:auto;padding:6px 10px;display:flex;flex-direction:column;gap:6px}
.ro-card{text-align:start;border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:8px 10px;display:grid;gap:3px;font-size:12px}
.ro-card[aria-pressed=true]{border-color:var(--brand);background:var(--brand-2);box-shadow:inset 3px 0 0 var(--brand)}
.ro-card .row{display:flex;justify-content:space-between;align-items:center;gap:6px}
.ro-card b{font-size:14px}
.tag{font-size:11px;font-weight:700;padding:2px 6px;border-radius:5px;background:var(--soft2);color:var(--ink2)}
.tag.ready{background:var(--ok-bg);color:var(--ok)}.tag.cooking{background:var(--warn-bg);color:var(--warn-ink)}
.muted{color:var(--ink2)}
.ro-empty{margin:auto;text-align:center;color:var(--ink2);font-size:13px;padding:20px}
.ro-actions{padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:6px;border-top:1px solid var(--line)}
.op-btn{grid-column:span 2;height:36px;border:1px solid var(--line);border-radius:8px;background:var(--soft);font-size:12.5px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px}
.op-btn.half{grid-column:span 1}
.op-btn:hover:not(:disabled){background:var(--panel);border-color:var(--brand);color:var(--brand)}
.op-btn:disabled{opacity:.45;cursor:not-allowed}

/* cart */
.cart{container-type:inline-size}
.type-row{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:10px 10px 6px}
.type-btn{height:40px;border:1px solid var(--line);border-radius:8px;background:var(--soft);font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;overflow:hidden}
.type-btn[aria-pressed=true]{background:var(--brand);border-color:var(--brand);color:#fff}
.sel-row{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:6px;padding:0 10px 8px}
.select{height:38px;border:1px solid var(--line);border-radius:8px;padding:0 8px;font:inherit;font-size:13px;background:var(--panel);color:var(--ink);min-width:0;width:100%}
.select:disabled{background:var(--soft2);color:var(--muted)}
.sq-btn{width:38px;height:38px;border:1px solid var(--line);background:var(--soft);border-radius:8px;display:grid;place-items:center}
.sq-btn:hover{border-color:var(--brand);color:var(--brand)}
.sel-actions{display:flex;gap:6px}
.edit-banner{margin:0 10px 8px;padding:8px 10px;border-radius:8px;background:var(--warn-bg);color:var(--warn-ink);font-size:12.5px;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:8px}
.edit-banner button{border:0;background:transparent;font-weight:700;text-decoration:underline;color:var(--warn-ink)}
.context-line{padding:0 12px 6px;font-size:12px;color:var(--ink2);display:flex;gap:10px;flex-wrap:wrap}
.context-line b{color:var(--ink)}
.cart-table{flex:1;min-height:0;display:flex;flex-direction:column;margin:0 10px;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.cart-grid{display:grid;grid-template-columns:minmax(0,1fr) 70px 108px 76px 30px;align-items:center;gap:6px;padding:0 10px}
.cart-head{height:36px;background:var(--soft);border-bottom:1px solid var(--line);font-size:12px;font-weight:800;color:var(--ink2)}
.cart-head .r,.cart-row .r{text-align:end}
.cart-body{flex:1;overflow-y:auto}
.cart-row{user-select:none;min-height:50px;border-bottom:1px solid var(--line2);padding-top:6px;padding-bottom:6px}
.cart-row:hover{background:var(--hover)}
.cart-name{border:0;background:transparent;text-align:start;padding:0;font-weight:700;font-size:13.5px;min-width:0}
.cart-name small{display:block;font-weight:500;font-size:11.5px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qty{display:flex;align-items:center;border:1px solid var(--line);border-radius:8px;overflow:hidden;height:34px;width:max-content;justify-self:center}
.qty button{width:32px;height:100%;border:0;background:var(--soft);display:grid;place-items:center}
.qty button:hover{background:var(--brand-2);color:var(--brand)}
.qty span{min-width:34px;text-align:center;font-weight:800}
.del{border:0;background:transparent;color:var(--muted);width:30px;height:30px;border-radius:6px;display:grid;place-items:center}
.del:hover{color:var(--danger);background:var(--danger-bg)}
.cart-empty{height:100%;display:grid;place-items:center;text-align:center;color:var(--ink2);padding:20px;font-size:13px}
.cart-empty svg{color:var(--muted);margin-bottom:6px}
@container (max-width:430px){.cart-grid{grid-template-columns:minmax(0,1fr) 104px 70px 28px}.cart-grid .col-price{display:none}}
@container (max-width:420px){.act svg{display:none}.act{font-size:13px}}
@container (max-width:470px){.type-btn svg{display:none}.type-btn{font-size:12px;gap:0}}
.total-bar{margin:8px 10px 0;height:48px;border-radius:8px;background:var(--soft2);display:flex;align-items:center;justify-content:center;gap:6px;position:relative}
.total-bar .amount{font-size:24px;font-weight:800;color:var(--ink)}
.total-bar .lbl{font-size:15px;font-weight:600;color:var(--ink2);margin-inline-end:4px}
.date-pop{position:absolute;bottom:54px;inset-inline-start:0;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px;box-shadow:0 10px 30px rgba(20,24,40,.18);z-index:5;display:grid;gap:6px;font-size:12px;font-weight:700}
.act-row{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:8px;padding:8px 10px 10px}
.act{height:46px;border:0;border-radius:8px;color:#fff !important;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
.act.cancel{background:var(--danger)}.act.quick{background:#7C4DEB}.act.place{background:var(--info)}
.act:hover{filter:brightness(1.07)}

/* menu */
.menu-top{padding:10px 10px 8px}
.search{position:relative}
.search svg{position:absolute;inset-inline-start:11px;top:50%;transform:translateY(-50%);color:var(--muted)}
.search .input{padding-inline-start:36px;height:42px;font-size:14px}
.search kbd{position:absolute;inset-inline-end:10px;top:50%;transform:translateY(-50%);font:600 11px Manrope,sans-serif;color:var(--muted);border:1px solid var(--line);border-radius:5px;padding:1px 6px}
.menu-body{flex:1;min-height:0;display:grid;grid-template-columns:136px 1fr;gap:10px;padding:0 10px 10px}
.cats{overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding-inline-end:2px}
.cat{flex:none;min-height:42px;border:1px solid rgba(0,0,0,.05);border-radius:8px;font-weight:800;font-size:13px;padding:6px 8px;color:var(--ink)}
.cat[aria-pressed=true]{box-shadow:inset 0 0 0 2px var(--ink);}
.cat,.item{background:color-mix(in srgb,var(--tint,var(--panel)) var(--tint-mix),var(--panel))}
.cat.all{--tint:#FFF3BF}
.items{overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));grid-auto-rows:min-content;gap:10px;align-content:start;padding:8px 8px 8px 2px}
.item{position:relative;min-height:100px;border:1px solid rgba(0,0,0,.05);border-radius:10px;padding:24px 10px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;gap:8px;box-shadow:0 1px 0 rgba(0,0,0,.04)}
.item:hover{box-shadow:0 4px 14px rgba(30,40,70,.12)}
.item:active{transform:scale(.98)}
.item .nm{font-weight:700;font-size:15px;line-height:1.25}
.item .pr{font-weight:800;font-size:14px}
.item .pr span{font-weight:600;color:var(--ink2);font-size:12px}
.item .inq{position:absolute;top:-7px;inset-inline-end:-7px;min-width:26px;height:26px;padding:0 6px;border-radius:13px;background:var(--brand);color:#fff;font-weight:800;font-size:13px;display:grid;place-items:center;box-shadow:0 0 0 3px var(--panel)}
.item .marks{position:absolute;top:7px;inset-inline-start:7px;display:flex;gap:4px}
.vegmark{width:13px;height:13px;border:1.5px solid var(--veg);border-radius:2px;display:grid;place-items:center}
.vegmark::after{content:"";width:5px;height:5px;border-radius:50%;background:var(--veg)}
.mini{font-size:9.5px;font-weight:800;padding:1px 5px;border-radius:4px;color:#fff}
.mini.c{background:var(--amber)}.mini.p{background:#E0245E}
.item.has-img{padding:0;gap:0;justify-content:flex-start;overflow:visible;min-height:0}
.item.has-img .body{display:flex;flex-direction:column;justify-content:space-between;gap:4px;padding:8px 8px 10px;flex:1}
.item.has-img .nm{font-size:14px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.5em}
.item.has-img .inq{z-index:3}
.item.has-img .marks{z-index:3;top:6px;inset-inline-start:6px;background:rgba(255,255,255,.92);padding:3px;border-radius:6px}
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
.view-toggle button{width:42px;height:42px;border:0;background:var(--panel);display:grid;place-items:center;color:var(--ink2)}
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
 .running{position:fixed;top:0;bottom:0;inset-inline-start:0;width:280px;z-index:50;border-radius:0;transform:translateX(-102%);transition:transform .22s ease}
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
 .mob-tabs button{height:46px;border-radius:8px;border:1px solid var(--line);background:var(--soft);font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px}
 .mob-tabs button[aria-pressed=true]{background:var(--brand);color:#fff;border-color:var(--brand)}
 .tb-icons .opt-sm{display:none}
 .act{font-size:13px}
}
@media (max-height:720px){
 .type-btn,.select,.sq-btn{height:34px}.act{height:40px}.total-bar{height:42px}.total-bar .amount{font-size:20px}
 .item:not(.has-img){min-height:82px;padding:22px 8px 8px}.pos{--thumb-h:64px}.cat{min-height:36px}.op-btn{height:32px}
}

/* modal */
.modal-wrap{position:fixed;inset:0;z-index:100;background:var(--modal-bg);display:grid;place-items:start center;padding:4vh 12px;overflow-y:auto}
.modal{background:var(--panel);border-radius:14px;width:100%;max-width:560px;box-shadow:0 24px 60px rgba(10,14,30,.3);display:flex;flex-direction:column;max-height:92vh}
.modal.lg{max-width:820px}.modal.sm{max-width:420px}
.modal-h{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--line)}
.modal-h h3{margin:0;font-size:19px;font-weight:800}
.modal-b{padding:18px;overflow-y:auto}
.modal-f{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--line)}
.btn{height:42px;padding:0 18px;border-radius:8px;border:1px solid var(--line);background:var(--soft);font-weight:700;display:inline-flex;align-items:center;gap:6px}
.btn.primary{background:var(--brand);border-color:var(--brand);color:#fff !important}
.btn.ok{background:var(--ok);border-color:var(--ok);color:#fff !important}
.btn.danger{background:var(--danger);border-color:var(--danger);color:#fff !important}
.btn:disabled{opacity:.5;cursor:not-allowed}
.types{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.type-card{border:2px solid var(--line);border-radius:14px;background:var(--panel);padding:22px 10px 16px;display:grid;justify-items:center;gap:12px;font-weight:800;font-size:16px}
.type-card:hover{border-color:var(--brand);background:var(--brand-2)}
.type-card .ill{width:84px;height:84px;border-radius:50%;display:grid;place-items:center}
@media (max-width:480px){.types{grid-template-columns:1fr}.type-card{grid-template-columns:auto 1fr;justify-items:start;align-items:center;padding:12px}.type-card .ill{width:54px;height:54px}}
.field{display:grid;gap:5px;margin-bottom:12px;font-size:12.5px;font-weight:700;color:var(--ink2)}
.field textarea{min-height:64px;padding:8px 10px;height:auto}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mod-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px}
.mod{border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--panel);text-align:start;display:flex;justify-content:space-between;align-items:center;gap:6px;font-weight:600;font-size:13px}
.mod[aria-pressed=true]{border-color:var(--brand);background:var(--brand-2);color:var(--brand)}
.qty.big{height:44px}.qty.big button{width:44px}.qty.big span{min-width:50px;font-size:18px}
.sum-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px dashed var(--line);font-weight:600}
.sum-row.total{border:0;font-size:20px;font-weight:800;padding-top:14px}
.inline-edit{display:flex;gap:6px;align-items:center}
.inline-edit .input{width:90px;height:34px}.inline-edit .select{width:auto;height:34px}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.seg button{border:0;background:var(--panel);padding:8px 14px;font-weight:700;font-size:13px}
.seg button[aria-pressed=true]{background:var(--brand);color:#fff}
.tables{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin:14px 0}
.tbl{border:2px solid var(--line);border-radius:12px;background:var(--panel);padding:12px 8px;display:grid;justify-items:center;gap:4px}
.tbl b{font-size:18px}
.tbl.busy{background:var(--warn-bg);border-color:var(--warn-line)}
.tbl[aria-pressed=true]{border-color:var(--brand);background:var(--brand-2)}
.list{display:grid;gap:8px}
.list-row{border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.pay-methods{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.pm{border:2px solid var(--line);border-radius:10px;background:var(--panel);padding:12px 6px;display:grid;justify-items:center;gap:6px;font-weight:700;font-size:13px}
.pm[aria-pressed=true]{border-color:var(--brand);background:var(--brand-2);color:var(--brand)}
.quick-amts{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.quick-amts button{border:1px solid var(--line);background:var(--soft);border-radius:8px;padding:8px 12px;font-weight:700;position:relative}
.quick-amts button:disabled{opacity:.45;cursor:not-allowed}
.dcount{position:absolute;top:-7px;inset-inline-end:-7px;background:var(--brand);color:#fff;border-radius:999px;font-size:11px;min-width:18px;height:18px;display:grid;place-items:center;padding:0 4px}
.pay-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:16px}
@media(max-width:700px){.pay-grid{grid-template-columns:1fr}}
.pay-entry-label{font-size:12.5px;font-weight:700;color:var(--ink2);margin-bottom:6px}
.pay-entry{display:flex;gap:8px;margin-bottom:10px;align-items:stretch}
.pay-entry .input{flex:1;height:46px;font-size:17px;font-weight:700}
.pay-entry .btn{height:46px;flex:none}
.change-box{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:8px 0 10px;padding:12px 14px;border-radius:10px;
 background:var(--ok-bg);border:2px solid var(--ok);color:var(--ok);font-weight:800;font-size:16px}
.change-box b{font-size:26px;line-height:1}
.pay-side{background:var(--soft);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:4px}
.pay-lines{display:flex;flex-direction:column;gap:6px;margin-bottom:8px;min-height:60px}
.pay-line{display:flex;justify-content:space-between;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 6px 6px 10px;font-size:14px;font-weight:600}
.reg-sales{margin-top:14px}
.reg-sales-h{background:var(--soft2);font-weight:700;padding:7px 10px;border-radius:6px;font-size:13.5px}
.reg-sales table{width:100%;border-collapse:collapse;font-size:13px}
.reg-sales th{text-align:start;font-weight:700;padding:7px 4px;border-bottom:1px solid var(--line)}
.reg-sales td{padding:6px 4px;border-bottom:1px dashed var(--line)}
.reg-sales .r{text-align:end}
.reg-sales tfoot td{font-weight:800;border-bottom:none}
.modal.xl{max-width:1040px}
.so-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:16px;min-height:340px}
@media(max-width:820px){.so-grid{grid-template-columns:1fr}}
.so-row{width:100%;border:1px solid var(--line);background:var(--panel);cursor:pointer;font:inherit;color:inherit}
.so-row[aria-pressed=true]{border-color:var(--brand);background:var(--brand-2)}
.so-detail{border:1px solid var(--line);border-radius:10px;padding:12px;background:var(--soft)}
.so-items{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px}
.so-items th{text-align:start;padding:6px 4px;border-bottom:1px solid var(--line);font-weight:700}
.so-items td{padding:6px 4px;border-bottom:1px dashed var(--line);vertical-align:top}
.so-items .r{text-align:end}
.submit-ovl{position:fixed;inset:0;z-index:300;background:var(--modal-bg);display:grid;place-items:center;animation:sfade .15s ease-out}
.submit-box{background:var(--panel);border-radius:16px;padding:28px 40px;display:grid;justify-items:center;gap:10px;box-shadow:0 24px 60px rgba(10,14,30,.3);min-width:260px;text-align:center}
.submit-box svg{color:var(--brand)}.submit-box b{font-size:17px}
@keyframes sfade{from{opacity:0}to{opacity:1}}
.zatca-pill{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:999px;border:1px solid var(--line);background:var(--warn-bg);color:var(--warn-ink);font-weight:800;font-size:12px;white-space:nowrap}
.pay-change{display:flex;justify-content:space-between;color:var(--danger);font-weight:800;font-size:16px;margin-top:6px}
.pm:disabled{opacity:.5;cursor:not-allowed}
.pay-due{display:flex;justify-content:space-between;background:var(--soft2);border-radius:10px;padding:14px;font-size:18px;font-weight:800;margin-bottom:14px}
.menu-sheet{position:fixed;top:0;inset-inline-end:0;bottom:0;width:300px;max-width:88vw;background:var(--panel);z-index:60;box-shadow:-10px 0 40px rgba(10,14,30,.2);display:flex;flex-direction:column}
.menu-sheet .item-link{display:flex;align-items:center;gap:12px;width:100%;border:0;background:transparent;padding:12px 18px;font-weight:600;text-align:start;font-size:14px}
.menu-sheet .item-link:hover{background:var(--brand-2);color:var(--brand)}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1D2433;color:#fff;padding:11px 18px;border-radius:10px;font-weight:600;font-size:13.5px;z-index:200;display:flex;gap:8px;align-items:center;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:92vw}
@media (prefers-reduced-motion:reduce){.pos *{transition:none !important}}
`;

/* extra styles for the online screen (connection banner, server totals, invoice result) */
const CSS_ONLINE = `
/* ---- right-to-left (Arabic): logical properties above mirror the layout; these are the extras ---- */
@media (max-width:1279px){.pos[dir=rtl] .running:not(.open){transform:translateX(102%)}}   /* drawer slides in from the right */
.pos[dir=rtl] .num,.pos[dir=rtl] input[type=number],.pos[dir=rtl] input[type=date]{direction:ltr;unicode-bidi:isolate}
.pos[dir=rtl] .menu-sheet{box-shadow:10px 0 40px rgba(10,14,30,.2)}
.trial-badge{flex:none;background:#B45309;color:#fff;font-weight:800;font-size:11.5px;letter-spacing:.02em;border-radius:999px;padding:5px 10px;white-space:nowrap}
.lang-pick{display:flex;gap:6px;padding:10px 18px;border-top:1px solid var(--line)}
.lang-pick button{flex:1;height:36px;border:1px solid var(--line);border-radius:8px;background:var(--panel);font-weight:700;font-size:13px}
.lang-pick button[aria-pressed=true]{background:var(--brand);border-color:var(--brand);color:#fff}
.lang-btn{display:inline-flex;align-items:center;gap:4px;height:34px;padding:0 9px;border:1px solid var(--line);border-radius:8px;background:var(--panel);font-weight:800;font-size:12px;color:var(--ink2)}
.lang-menu{position:absolute;top:calc(100% + 4px);inset-inline-start:0;z-index:70;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 32px rgba(30,36,60,.16);padding:4px;min-width:150px}
.lang-menu button{display:flex;justify-content:space-between;width:100%;border:0;background:transparent;padding:8px 10px;border-radius:7px;font-weight:700;font-size:14px}
.lang-menu button:hover,.lang-menu button[aria-pressed=true]{background:var(--brand-2);color:var(--brand)}
.ss{position:relative;min-width:0}
.ss-btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:6px;text-align:start;cursor:pointer;background:var(--panel)}
.ss-btn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;unicode-bidi:plaintext}
.ss-pop{position:absolute;z-index:60;top:calc(100% + 4px);inset-inline-start:0;min-width:100%;width:max-content;max-width:min(360px,90vw);background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 32px rgba(30,36,60,.16);overflow:hidden}
.ss-search{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--line);color:var(--ink2)}
.ss-search input{border:0;outline:0;flex:1;font:inherit;font-size:14px;min-width:160px;color:var(--ink)}
.ss-list{max-height:280px;overflow:auto;padding:4px}
.ss-opt{display:flex;flex-direction:column;align-items:flex-start;width:100%;text-align:start;border:0;background:transparent;padding:8px 10px;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer}
.ss-opt small{color:var(--ink2);font-weight:500;font-size:12px}
.ss-opt.hi{background:var(--brand-2)}.ss-opt[aria-selected=true]{color:var(--brand)}
.ss-empty{padding:10px;color:var(--ink2);font-size:13px}
.ss-foot{display:flex;align-items:center;gap:6px;width:100%;border:0;border-top:1px solid var(--line);background:var(--hover);padding:9px 12px;font-weight:700;color:var(--brand);cursor:pointer}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 10px}
@media (max-width:700px){.grid3{grid-template-columns:1fr 1fr}}
.ferr{display:block;color:var(--danger);font-weight:600;margin-top:3px}
.addr-pick{display:flex;flex-direction:column;gap:6px;margin-bottom:8px;font-size:14px}
.addr-pick label{display:flex;gap:8px;align-items:center;cursor:pointer}
.na-head{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;font-weight:800;font-size:15px;margin:4px 0 10px;padding-top:12px;border-top:1px solid var(--line)}
.na-warn{color:var(--warn-ink);font-size:12.5px;font-weight:600}.na-ok{color:var(--ok);font-size:12.5px;font-weight:700;display:inline-flex;gap:4px;align-items:center}
.link-reset{border:0;background:transparent;color:var(--brand);font-weight:700;cursor:pointer;padding:0;font-size:12px}
.quick-amts button[aria-pressed=true]{border-color:var(--brand);background:var(--brand-2);color:var(--brand)}
.ro-filter{display:grid;grid-template-columns:auto repeat(3,1fr);gap:4px;padding:0 10px 8px}
.ro-filter button{border:1px solid var(--line);background:var(--panel);border-radius:8px;height:32px;display:flex;align-items:center;justify-content:center;gap:4px;font-size:12px;font-weight:700;color:var(--ink2);padding:0 4px;min-width:0}
.ro-filter button .lbl{white-space:nowrap}
.ro-filter button .n{background:var(--soft2);border-radius:999px;padding:0 6px;font-size:11px;line-height:17px}
.ro-filter button[aria-pressed=true]{background:var(--brand);border-color:var(--brand);color:#fff}
.ro-filter button[aria-pressed=true] .n{background:rgba(255,255,255,.25)}
.partner-pick{display:flex;align-items:center;gap:6px;text-align:start;overflow:hidden;white-space:nowrap;cursor:pointer}
.partner-pick img{width:22px;height:22px;object-fit:contain;border-radius:4px;flex:none}
.partner-pick span{overflow:hidden;text-overflow:ellipsis;unicode-bidi:plaintext}
.partner-pick:disabled{opacity:.55;cursor:not-allowed}
.partners{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;margin-bottom:16px}
.partner{position:relative;border:2px solid var(--line);border-radius:12px;background:var(--panel);padding:12px 8px;display:grid;justify-items:center;gap:8px;font-weight:800;font-size:14px}
.partner .logo{width:84px;height:84px;border-radius:14px;display:grid;place-items:center;overflow:hidden;background:var(--soft2);font-size:26px;color:var(--brand)}
.partner .logo img{width:100%;height:100%;object-fit:contain}
.partner[aria-pressed=true]{border-color:var(--brand);background:var(--brand-2);box-shadow:0 6px 18px rgba(91,63,209,.15)}
.partner .tick{position:absolute;top:-9px;inset-inline-start:-9px;width:24px;height:24px;border-radius:50%;background:var(--brand);color:#fff;display:grid;place-items:center}
.tsearch{margin-bottom:10px}
.tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:10px;margin-top:10px;align-items:start}
.tcard{border:1px solid var(--line);border-inline-start:4px solid var(--ok);border-radius:10px;background:var(--panel);padding:10px;display:grid;gap:8px}
.tcard.part{border-inline-start-color:#E5A11A}.tcard.full{border-inline-start-color:var(--danger)}
.tcard.sel{border-color:var(--brand);border-inline-start-color:var(--brand);background:var(--brand-2)}
.tcard .th{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
.tcard .th b{font-size:15px;display:block}
.tcard .th-r{display:flex;gap:6px;align-items:center}
.bk-btn{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line);background:var(--panel);border-radius:999px;padding:2px 8px;font-size:12px;font-weight:800;color:var(--brand);cursor:pointer}
.bk-btn:hover{border-color:var(--brand);background:var(--brand-2)}.tcard .th small{color:var(--ink2);font-size:11.5px}
.tcard .seats{border-radius:999px;padding:2px 8px;font-size:12px;font-weight:800;white-space:nowrap;background:var(--ok-bg);color:var(--ok)}
.tcard.part .seats{background:var(--warn-bg);color:var(--warn-ink)}.tcard.full .seats{background:var(--danger-bg);color:var(--danger)}
.bk{width:100%;font-size:13.5px;border-collapse:collapse;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.bk th{background:var(--brand-2);color:var(--brand-d);text-align:start;padding:8px 10px;font-weight:700;font-size:12.5px}
.bk td{padding:8px 10px;border-top:1px solid var(--line2)}.bk td:first-child{font-weight:700}
.tcard .add{display:flex;gap:6px;align-items:center}
.tcard .add .qty{flex:none}.tcard .add .btn.primary{flex:1;justify-content:center}
.tcard .add .btn{height:34px;padding:0 12px}
.tchips{display:flex;flex-wrap:wrap;gap:6px;margin-inline-end:auto;align-items:center;font-weight:700;font-size:13px}
.tchip{display:inline-flex;align-items:center;gap:6px;background:var(--brand-2);color:var(--brand-d,#3F2A9E);border-radius:999px;padding:4px 6px 4px 10px;font-size:12.5px;font-weight:700}
.tchip button{border:0;background:transparent;color:inherit;display:grid;place-items:center;padding:0;cursor:pointer}
.conn{display:flex;align-items:center;gap:8px;justify-content:center;background:var(--danger-bg);color:var(--danger-ink);font-weight:700;font-size:13px;padding:6px 10px;border-bottom:1px solid var(--danger-line)}
.who{font-size:12px;color:var(--ink2);white-space:nowrap;padding:0 6px;display:flex;flex-direction:column;line-height:1.2;text-align:end}
.who b{color:var(--ink);font-size:13px}
.calc-msg{margin:6px 10px 0;padding:6px 10px;border-radius:8px;background:var(--warn-bg);color:var(--warn-ink);font-size:12.5px;font-weight:600}
.total-bar .spin{animation:spin .8s linear infinite;color:var(--ink2)}@keyframes spin{to{transform:rotate(360deg)}}
.tag.new{background:var(--info-bg);color:var(--info)}.tag.bill{background:var(--brand-2);color:var(--brand)}
.var-list{display:grid;gap:8px}
.var-row{border:1px solid var(--line);border-radius:10px;background:var(--panel);padding:12px 14px;display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:14px}
.var-row:hover{border-color:var(--brand);background:var(--brand-2)}
.combo-group{margin-bottom:12px}.combo-group .field{margin-bottom:6px}
.done-box{text-align:center;padding:4px 0 8px}
.done-box .big{font-size:26px;font-weight:800;margin:6px 0}
.zatca{display:flex;gap:8px;align-items:flex-start;justify-content:center;margin-top:10px;font-size:13px;font-weight:700}
.zatca.ok{color:var(--ok)}.zatca.warn{color:var(--warn-ink)}
.act:disabled,.op-btn:disabled{opacity:.5;cursor:not-allowed}
.setting-row{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;font-weight:600;font-size:14px;border-top:1px solid var(--line)}

/* ---------- dark mode (<html data-theme="dark">) ---------- */
:root[data-theme=dark] .pos{--bg:#0F131B;--panel:#1A202B;--ink:#E8ECF3;--ink2:#A3ADBF;--line:#2E3746;--brand:#8B74F0;--brand-2:#2C2550;--brand-d:#C9BEFF;
 --soft:#222936;--soft2:#252D3B;--hover:#212836;--line2:#262E3C;--muted:#768196;
 --warn-bg:#3A2E12;--warn-ink:#F2C46B;--warn-line:#6B5520;--danger-bg:#3B1E1E;--danger-ink:#FF9C94;--danger-line:#6A2C2A;--ok-bg:#16352A;--info-bg:#17304C;
 --ok:#34C08A;--danger:#EF5A50;--info:#4A9BEA;--modal-bg:rgba(0,0,0,.62);--tint-mix:22%}
:root[data-theme=dark] .pos .cat,:root[data-theme=dark] .pos .item{border-color:rgba(255,255,255,.06)}
:root[data-theme=dark] .pos .thumb.art{background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.10),rgba(255,255,255,.02) 70%),color-mix(in srgb,var(--tint) 22%,var(--panel))}
:root[data-theme=dark] .pos .thumb.art svg{color:rgba(232,236,243,.6);filter:none}
:root[data-theme=dark] .pos .item.has-img .marks{background:rgba(26,32,43,.9)}
:root[data-theme=dark] .pos .toast{background:#E8ECF3;color:#141922}
:root[data-theme=dark] .pos input,:root[data-theme=dark] .pos textarea,:root[data-theme=dark] .pos select{color-scheme:dark}
:root[data-theme=dark] .pos ::placeholder{color:#6F7A8E}
`;

/* ============================================================================
   SMALL COMPONENTS
   ========================================================================== */
function Modal({ title, onClose, children, footer, size = "", closable = true }) {
  return (
    <div className="modal-wrap" onMouseDown={(e) => closable && e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h">
          <h3>{title}</h3>
          {closable && <button className="icon-btn" onClick={onClose} aria-label={tr("Close")}><X size={20} /></button>}
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
      <button onClick={() => onChange(value - 1)} aria-label={tr("Decrease")}><Minus size={15} /></button>
      <span className="num">{value}</span>
      <button onClick={() => onChange(value + 1)} aria-label={tr("Increase")}><Plus size={15} /></button>
    </div>
  );
}

function ItemThumb({ item, size = "", tint }) {
  const [broken, setBroken] = useState(false);
  const Art = item.art || UtensilsCrossed;
  if (item.image && !broken) {
    return <span className={`thumb ${size}`}><img src={item.image} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} /></span>;
  }
  const px = size === "sm" ? 18 : size === "lg" ? 72 : 40;
  return <span className={`thumb art ${size}`} style={{ "--tint": tint }} aria-hidden="true"><Art size={px} strokeWidth={1.6} /></span>;
}

const TYPE_ILL = { dine: ["#E3EEFD", "#1E7FD8"], take: ["#FDEBD8", "#D9711C"], delivery: ["#FFE3E0", "#DC3F35"] };
const KITCHEN_TAG = { new: ["new", "New"], cooking: ["cooking", "Cooking"], ready: ["ready", "Ready"] };   // labels go through tr()

/* ============================================================================
   MAIN
   ========================================================================== */
const SELF_POLL_MS = 20000;        // waiting self / online orders (badge on the top bar)
const RUNNING_POLL_MS = 10000;     // running orders + kitchen status (live sync with web POS / kitchen screen)
const NOTIF_POLL_MS = 15000;

export default function PosMainScreen({ user, onLogout = () => {}, trial = null }) {
  // language: English / Arabic (right-to-left) / Hindi - remembered on this PC
  const [lang, setLangState] = useState(getLang());
  const [langOpen, setLangOpen] = useState(false);
  const changeLang = (l) => { setLang(l); setLangState(l); setLangOpen(false); };
  const dir = isRtl(lang) ? "rtl" : "ltr";
  const isWaiter = !!user?.permissions?.is_waiter;
  const [theme, toggleTheme] = useTheme();
  const [oskOn, setOskOn] = useOskEnabled();
  const canPay = !isWaiter || !!user?.permissions?.pos?.pos_1;

  // catalogue & filters
  const [activeCat, setActiveCat] = useState("all");
  const [showImages, setShowImages] = useState(() => lsGet("pos.showImages", true));
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ veg: false, bev: false, combo: false, promo: false });

  // current order
  const firstWaiter = () => (isWaiter && WAITERS.some((w) => w.id === user.id) ? user.id : Number(SETTINGS.default_waiter_id) || WAITERS[0]?.id || "");
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState(defaultTypeKey);
  const [table, setTable] = useState(null);                  // [{ id, name, persons }] - one or more tables
  const [waiter, setWaiter] = useState(firstWaiter);
  const [customers, setCustomers] = useState(INITIAL_CUSTOMERS);
  const [customerId, setCustomerId] = useState(DEFAULT_CUSTOMER_ID);
  const [partner, setPartner] = useState("");                // delivery partner id or ""
  const [partnerRef, setPartnerRef] = useState("");          // partner's order / reference number
  const [roType, setRoType] = useState("all");               // running orders filter: all | dine | take | delivery
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [discount, setDiscount] = useState({ mode: "fixed", value: 0 });
  const [charge, setCharge] = useState({ mode: "percent", value: 0 });
  const [chargeTouched, setChargeTouched] = useState(false); // untouched = server default for the order type
  const [tips, setTips] = useState(0);
  const [editingId, setEditingId] = useState(null);          // running order id being modified
  const [editingSelf, setEditingSelf] = useState(false);     // it was a self / online order: full KOT after the update
  const [selfCount, setSelfCount] = useState(0);             // waiting self + online orders

  // server data
  const [calc, setCalc] = useState(null);                    // POST /orders/calculate result
  const [calcErr, setCalcErr] = useState("");
  const [calcBusy, setCalcBusy] = useState(false);
  const [running, setRunning] = useState([]);
  const [selectedRunning, setSelectedRunning] = useState(null);
  const [roQuery, setRoQuery] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [sales, setSales] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [seenNotif, setSeenNotif] = useState(() => new Set(lsGet("pos.seenNotif", [])));
  const [registerOpen, setRegisterOpen] = useState(REGISTER_OPEN);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(null);                    // name of the action in progress

  // ui
  const [modal, setModal] = useState(null); // {name, ...payload}
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState("menu");
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [datePop, setDatePop] = useState(false);
  const [prefs, setPrefs] = useState(() => lsGet("pos.prefs", { printKot: true, printInvoice: true }));
  const searchRef = useRef(null);
  const calcSeq = useRef(0);

  const customer = customers.find((c) => c.id === Number(customerId)) || customers[0] || { id: DEFAULT_CUSTOMER_ID, name: "Walk-in Customer" };
  const qtyById = useMemo(() => cart.reduce((m, l) => {
    const it = ITEM_BY_ID[l.itemId];
    const key = it?.parentId || l.itemId;
    return { ...m, [key]: (m[key] || 0) + l.qty };
  }, {}), [cart]);
  const catById = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, c])), []);
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);
  const totals = calc?.totals || null;

  const notify = (text, ms = 3200) => {
    setToast(text);
    clearTimeout(notify.t);
    notify.t = setTimeout(() => setToast(null), ms);
  };
  // every failed call goes through here: network -> banner, register closed -> open register, else the server's message
  const onError = useCallback((e, fallback) => {
    if (e?.network) { setOnline(false); notify(tr("No connection to the server. Try again when it is back.")); return; }
    if (e?.code === "REGISTER_CLOSED") { setRegisterOpen(false); setModal(null); return; }   // -> open register screen
    notify(firstError(e) || fallback);
  }, []);
  const ok = useCallback(() => setOnline(true), []);
  const savePrefs = (p) => { setPrefs(p); lsSet("pos.prefs", p); };
  // customers not in the loaded list (more than 200): ask the server and add the matches
  const searchCustomers = useCallback(async (q) => {
    try {
      const found = await get(`/v1/customers?search=${encodeURIComponent(q)}&limit=30`);
      setCustomers((cs) => {
        const have = new Set(cs.map((c) => c.id));
        const add = (found || []).filter((c) => !have.has(c.id)).map((c) => ({ id: c.id, name: c.name, phone: c.phone || "", email: c.email || "", address: c.address || "" }));
        return add.length ? [...cs, ...add] : cs;
      });
    } catch { /* keep the local matches */ }
  }, []);

  // closing the app while the register is open: ask first (close register & exit / exit / cancel)
  useEffect(() => {
    const guard = window.electronAPI?.closeGuard;
    if (!guard || isWaiter || !registerOpen) return undefined;
    return guard.onRequest(() => { setSheet(false); setDrawer(false); setModal({ name: "leave", exit: true }); });
  }, [isWaiter, registerOpen]);

  // log out / exit, optionally closing the register first (report is printed like "Close register" does)
  const leave = async ({ closeRegister, exit }) => {
    if (closeRegister) {
      try {
        const r = await post("/v1/register/close");
        setRegisterOpen(null);
        await printJob(r.print_job);                 // web: Escposbuilder::buildRegister on the receipt printer
      } catch (e) {
        if (e?.code !== "REGISTER_CLOSED") { onError(e, tr("The register was not closed.")); return false; }
      }
    }
    setModal(null);
    if (exit) window.electronAPI?.closeGuard?.confirm();
    else onLogout();
    return true;
  };

  // keyboard: "/" focuses search, Esc closes overlays
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { setModal(null); setDrawer(false); setSheet(false); setDatePop(false); }
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
        e.preventDefault(); setTab("menu"); searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { lsSet("pos.showImages", showImages); }, [showImages]);

  /* ---------- live data: running orders, notifications, drafts ---------- */
  const refreshRunning = useCallback(async () => {
    try { setRunning(await get("/v1/orders")); ok(); }
    catch (e) { if (e?.network) setOnline(false); }
  }, [ok]);
  const refreshNotifications = useCallback(async () => {
    try { setNotifications(await get("/v1/notifications")); ok(); } catch (e) { if (e?.network) setOnline(false); }
  }, [ok]);
  const refreshDrafts = useCallback(async () => { try { setDrafts(await get("/v1/drafts")); } catch { /* shown when opened */ } }, []);

  useEffect(() => {
    refreshRunning(); refreshNotifications(); refreshDrafts();
    const a = setInterval(refreshRunning, RUNNING_POLL_MS);
    const b = setInterval(refreshNotifications, NOTIF_POLL_MS);
    const onFocus = () => { refreshRunning(); refreshNotifications(); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(a); clearInterval(b); window.removeEventListener("focus", onFocus); };
  }, [refreshRunning, refreshNotifications, refreshDrafts]);

  // cashiers must open the register before taking orders (same rule as the web POS)

  // the selected running order disappeared (paid / cancelled on another till)
  useEffect(() => { if (selectedRunning && !running.some((o) => o.id === selectedRunning)) setSelectedRunning(null); }, [running, selectedRunning]);

  /* ---------- order body sent to the server ---------- */
  const orderBody = (type = orderType, tbl = table) => {
    const t = type || "take";
    const body = {
      order_type: ORDER_TYPES[t].id,
      customer_id: Number(customerId) || DEFAULT_CUSTOMER_ID,
      waiter_id: waiter ? Number(waiter) : null,
      delivery_partner_id: t === "delivery" && partner ? Number(partner) : null,
      delivery_partner_ref_no: t === "delivery" && partner ? partnerRef.trim() : "",
      tables: t === "dine" && hasTables(tbl) ? tbl.map((x) => ({ table_id: x.id, persons: Number(x.persons) || 1 })) : [],
      sale_date: orderDate,
      discount: amountStr(discount),
      tips: Number(tips) > 0 ? String(Number(tips)) : "",
      items: cart.map((l) => {
        const it = {
          food_menu_id: l.itemId,
          qty: l.qty,
          modifier_ids: l.mods.map((m) => (isOpenMod(l.itemId, m.id) ? { id: m.id, price: Number(m.price) || 0 } : m.id)),
          note: l.note || "",
          discount: l.discRaw != null ? l.discRaw : (Number(l.disc) > 0 ? `${Number(l.disc)}%` : ""),
        };
        if (l.lineId) it.line_id = l.lineId;
        if (l.openPrice) it.unit_price = l.price;
        if (l.priceEdited || l.openPrice) it.custom_price = l.price;     // price changed at the till (any item)
        if (l.comboSelections?.length) it.combo_selections = l.comboSelections;
        return it;
      }),
    };
    if (chargeTouched) body.charge = amountStr(charge);
    return body;
  };

  /* ---------- live totals from the server (tax, charges, promotions, rounding) ---------- */
  useEffect(() => {
    if (!cart.length) { setCalc(null); setCalcErr(""); setCalcBusy(false); return; }
    setCalcBusy(true);
    const seq = ++calcSeq.current;
    const t = setTimeout(async () => {
      try {
        const r = await post("/v1/orders/calculate", { ...orderBody(), ...(editingId ? { order_id: editingId } : {}) });
        if (seq !== calcSeq.current) return;
        setCalc(r); setCalcErr(""); ok();
        if (!chargeTouched) setCharge(parseAmount(r.totals?.charge_value));
      } catch (e) {
        if (seq !== calcSeq.current) return;
        if (e?.network) setOnline(false);
        setCalcErr(firstError(e));
      } finally { if (seq === calcSeq.current) setCalcBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [cart, orderType, table, waiter, customerId, partner, partnerRef, discount, chargeTouched, chargeTouched && charge, tips, orderDate, editingId]); // eslint-disable-line

  // list prices follow the order type / delivery partner (lines already in the kitchen keep their price)
  useEffect(() => {
    setCart((c) => c.map((l) => (l.lineId || l.openPrice || l.priceEdited ? l : { ...l, price: priceFor(ITEM_BY_ID[l.itemId], orderType, partner) + comboExtra(ITEM_BY_ID[l.itemId], l.comboSelections, orderType) })));
  }, [orderType, partner]);

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
      return it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q) || (catById[it.cat]?.name || "").toLowerCase().includes(q)
        || it.variations.some((v) => v.name.toLowerCase().includes(q) || v.code.toLowerCase().includes(q));
    });
  }, [activeCat, filters, query, catById]);
  const shownPrice = (it) => {
    if (it.variations.length) return Math.min(...it.variations.map((v) => priceFor(v, orderType, partner)));
    return priceFor(it, orderType, partner) + comboExtra(it, [], orderType);
  };

  /* ---------- cart ops ---------- */
  const addToCart = (item, opts = {}) => {
    const { qty = 1, mods = [], note = "", disc = 0, price, comboSelections = [], priceEdited = false } = opts;
    const unit = price != null ? Number(price) : priceFor(item, orderType, partner) + comboExtra(item, comboSelections, orderType);
    setCart((c) => {
      const plain = !mods.length && !note && !disc && !item.openPrice && !comboSelections.length && !priceEdited;
      if (plain) {
        const i = c.findIndex((l) => l.itemId === item.id && !l.lineId && !l.note && !l.disc && !l.mods.length && !l.openPrice && !l.comboSelections?.length);
        if (i > -1 && !c[i].priceEdited) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
      }
      return [...c, { key: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, itemId: item.id, name: item.name, price: unit, qty, mods, note, disc, openPrice: !!item.openPrice, comboSelections, lineId: null, priceEdited }];
    });
  };
  const onItemClick = (item) => {
    if (item.unavailable) return notify(tr("{name} is not available right now", { name: itemName(item) }));
    if (!orderType) return setModal({ name: "orderType", then: { kind: "add", item } });
    if (item.variations.length) return setModal({ name: "variations", item });
    if (needsOptions(item)) return setModal({ name: "item", item });
    addToCart(item);
  };
  const setLineQty = (key, q) => setCart((c) => (q <= 0 ? c.filter((l) => l.key !== key) : c.map((l) => (l.key === key ? { ...l, qty: q } : l))));
  const removeLine = (key) => setCart((c) => c.filter((l) => l.key !== key));

  const resetOrder = () => {
    setCart([]); setOrderType(defaultTypeKey()); setTable(null); setWaiter(firstWaiter()); setCustomerId(DEFAULT_CUSTOMER_ID);
    setPartner(""); setPartnerRef(""); setDiscount({ mode: "fixed", value: 0 }); setCharge({ mode: "percent", value: 0 }); setChargeTouched(false);
    setTips(0); setEditingId(null); setEditingSelf(false); setOrderDate(new Date().toISOString().slice(0, 10)); setCalc(null); setCalcErr("");
  };

  /* ---------- printing ----------
     KOT / draft / invoice are raw ESC/POS bytes made on the server (Escposbuilder) and sent by the
     desktop app straight to the printer set in the web app (network ip:port or Windows shared printer). */
  const print = async (html, what) => {          // register report only (HTML, default Windows printer)
    try { await printHtml(html); notify(tr("{what} sent to the printer", { what })); }
    catch (e) { notify(tr("{what} not printed: {error}", { what, error: e.message })); }
  };
  // one job -> { ok, title, error }
  const runJob = async (job) => {
    if (!job) return { ok: false, title: tr("Receipt"), error: tr("Nothing to print.") };
    if (!job.print_bytes) return { ok: false, title: job.title, error: job.error || tr("Nothing to print.") };
    try { await printRaw(job); return { ok: true, title: job.title }; }
    catch (e) { return { ok: false, title: job.title, error: e.message }; }
  };
  const printJob = async (job) => {
    const r = await runJob(job);
    if (r.ok) notify(tr("{what} sent to the printer", { what: r.title }));
    else notify(tr("{what} not printed: {error}", { what: r.title || tr("Receipt"), error: r.error }), 8000);
    return r.ok;
  };
  // register report: same ticket as the web POS (Sale::registerDetailsAsBytes -> Escposbuilder::buildRegister)
  const printRegister = async () => { try { await printJob(await get("/v1/register/print")); } catch (e) { onError(e); } };
  // register report as an A4 PDF (new layout with the outlet's details)
  const downloadRegister = async (summary) => {
    try {
      const s2 = summary || await get("/v1/register/summary");
      const r = await savePdf(registerA4Html(s2), { fileName: `register-report-${String(s2.opened_at || "").slice(0, 10) || "today"}-${new Date().toTimeString().slice(0, 8).replace(/:/g, "")}.pdf` });
      if (r?.saved) notify(tr("PDF saved: {path}", { path: r.path }), 6000);
    } catch (e) { onError(e); }
  };
  // KOT: one ticket per kitchen, each on its own kitchen printer
  const printKot = async (kot) => {
    const jobs = kot?.prints || [];
    if (!jobs.length) return;
    const res = [];
    for (const j of jobs) res.push(await runJob(j));      // one after the other: a busy printer is not hit twice at once
    const okNames = res.filter((r) => r.ok).map((r) => r.title.replace(/^KOT /, ""));
    const bad = res.filter((r) => !r.ok);
    if (!bad.length) notify(tr("KOT sent to {kitchens}", { kitchens: okNames.join(", ") }));
    else notify(`${okNames.length ? tr("KOT sent to {kitchens}", { kitchens: okNames.join(", ") }) + ". " : ""}${tr("Not printed: {list}", { list: bad.map((r) => `${r.title.replace(/^KOT /, "")} (${r.error})`).join("; ") })}`, 8000);
  };
  // reprint of a saved invoice (same receipt; ZATCA data untouched)
  const reprintInvoice = async (saleId) => {
    try { await printJob(await get(`/v1/invoices/${saleId}/print`)); } catch (e) { onError(e); }
  };

  /* ---------- order flow ---------- */
  // action: "place" | "invoice"
  const proceed = (action, type = orderType, tbl = table) => {
    if (!cart.length) return notify(tr("Add at least one item to the order"));
    if (!type) return setModal({ name: "orderType", then: { kind: action } });
    // dine in without a table is allowed (the table popup is optional)
    if (action === "place") return commitOrder(type, tbl);
    if (!canPay) return notify(tr("Waiters can't take payment. Place the order and send it to the cashier."));
    if (editingId) return notify(tr("Update the order first, then use Invoice in Running Orders."));
    openQuickPayment(type, tbl);
  };

  const commitOrder = async (type, tbl) => {
    if (busy) return;
    setBusy("place");
    try {
      const body = orderBody(type, tbl);
      const r = editingId
        ? await put(`/v1/orders/${editingId}`, body)
        : await post("/v1/orders", body, { idempotencyKey: await newKey() });
      ok();
      notify(tr(editingId ? "Order {n} updated — sent to the kitchen" : "Order {n} placed — sent to the kitchen", { n: r.order.order_number || r.order.sale_no }));
      let kot = r.kot;
      // a self / online order changed before it went to the kitchen: the kitchen gets the whole order now
      if (editingId && editingSelf) kot = await get(`/v1/orders/${editingId}/kot?all=1`).catch(() => r.kot);
      if (prefs.printKot && kot?.prints?.length) printKot(kot);
      resetOrder();
      setModal(null);
      setTab("menu");
      await refreshRunning();                 // select it once it is in the list (otherwise the selection is dropped)
      setSelectedRunning(r.order.id);
    } catch (e) { onError(e, tr("The order was not saved.")); }
    finally { setBusy(null); }
  };

  // Quick invoice: totals are confirmed by the server before the payment screen opens
  const openQuickPayment = async (type, tbl) => {
    setBusy("calc");
    try {
      const r = await post("/v1/orders/calculate", orderBody(type, tbl));
      setCalc(r);
      setModal({ name: "payment", source: "cart", type, tbl, due: r.totals.total_payable, allowDue: customer.id !== DEFAULT_CUSTOMER_ID, label: `${tr(ORDER_TYPES[type].label)}${hasTables(tbl) ? ` · ${tr("Table {name}", { name: tblText(tbl) })}` : ""}${type === "delivery" && partner ? ` · ${partnerById(partner)?.name || ""}` : ""} · ${customer.name}` });
    } catch (e) { onError(e); }
    finally { setBusy(null); }
  };

  const openOrderPayment = async (orderId) => {
    setBusy("calc");
    try {
      const o = await get(`/v1/orders/${orderId}`);
      setModal({ name: "payment", source: "running", orderId, due: o.totals.total_payable, allowDue: !!o.customer?.id && o.customer.id !== DEFAULT_CUSTOMER_ID && o.customer.name !== "Walk-in Customer", label: `${typeName(o)}${o.tables_text ? ` · ${tr("Table {name}", { name: o.tables_text })}` : ""} · ${o.customer?.name || ""}` });
    } catch (e) { onError(e); }
    finally { setBusy(null); }
  };

  const completePayment = async ({ payments, given, reference }) => {
    if (busy) return;
    const m = modal;
    const payBody = { payments, reference };
    if (given !== "" && given != null) payBody.given_amount = Number(given);
    setBusy("pay");
    setSubmitting(true);                                   // "Submitting invoice…" shown at least 1.5 s
    const shownAt = Date.now();
    try {
      const key = await newKey();
      // the previous invoice may still be with ZATCA (one sale at a time per outlet): wait and try again, same key
      const send = async () => {
        for (let i = 0; ; i++) {
          try {
            return m.source === "running"
              ? { invoice: await post(`/v1/orders/${m.orderId}/invoice`, payBody, { idempotencyKey: key }) }
              : await post("/v1/invoices/quick", { ...orderBody(m.type, m.tbl), ...payBody }, { idempotencyKey: key });
          } catch (e) {
            if (e?.code !== "ZATCA_BUSY" || i >= 40) throw e;
            notify(tr("Waiting for the previous invoice to finish with ZATCA…"), 4000);
            await new Promise((res) => setTimeout(res, 1500));
          }
        }
      };
      const r = await send();
      const invoice = r.invoice;
      await new Promise((res) => setTimeout(res, Math.max(0, 1500 - (Date.now() - shownAt))));
      if (m.source !== "running") {
        if (prefs.printKot && r.kot?.prints?.length) printKot(r.kot);
        resetOrder();
      }
      ok();
      if (m.source === "running" && selectedRunning === m.orderId) setSelectedRunning(null);
      refreshRunning();
      setSales((s) => [invoice, ...s.filter((x) => x.id !== invoice.id)]);
      // straight on to the next order; ZATCA runs on the server and the invoice prints when it is done
      setModal(null);
      setTab("menu");
      notify(tr("Invoice {n} saved — sending to ZATCA…", { n: invoice.sale_no }), 4000);
      watchZatca(invoice);
    } catch (e) { onError(e, tr("Payment was not saved.")); }
    finally { setBusy(null); setSubmitting(false); }
  };

  /* ---------- ZATCA after the sale (runs on the server after the reply) ---------- */
  const [zatcaQueue, setZatcaQueue] = useState([]);          // [{ id, sale_no }]
  const [submitting, setSubmitting] = useState(false);       // invoice submit overlay
  // the till's access period (Settings -> POS Devices): warn in the last 3 days
  const [accessUntil, setAccessUntil] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const load = () => window.electronAPI?.device?.get?.().then((d) => setAccessUntil(d?.access_until || null)).catch(() => {});
    load();
    const t = setInterval(() => { setNowTick(Date.now()); load(); }, 60000);     // follows changes made in the web app
    return () => clearInterval(t);
  }, []);
  const accessLeft = accessUntil && Date.parse(accessUntil) - nowTick <= 3 * 86400000
    ? { ms: Math.max(0, Date.parse(accessUntil) - nowTick), date: new Date(accessUntil).toLocaleString() } : null;
  const watchZatca = (invoice) => {
    if (!invoice?.zatca?.pending) {                          // older server: everything came with the reply
      if (prefs.printInvoice && invoice?.print_job) printJob(invoice.print_job);
      return;
    }
    setZatcaQueue((q) => [...q.filter((x) => x.id !== invoice.id), { id: invoice.id, sale_no: invoice.sale_no }]);
    const started = Date.now();
    const tick = async () => {
      let st = null;
      try { st = await get(`/v1/invoices/${invoice.id}/zatca`); } catch { /* network blip: try again */ }
      if (st?.state === "done") {
        setZatcaQueue((q) => q.filter((x) => x.id !== invoice.id));
        const z = st.zatca || {};
        if (z.synced) notify(tr("Invoice {n}: reported to ZATCA", { n: invoice.sale_no }));
        else notify(tr("Invoice {n}: ZATCA — {msg}", { n: invoice.sale_no, msg: z.message || tr("not reported yet") }), 9000);
        if (prefs.printInvoice && st.print_job) await printJob(st.print_job);
        return;
      }
      if (Date.now() - started > 15 * 60000) {                // give up watching; Recent sales still has it
        setZatcaQueue((q) => q.filter((x) => x.id !== invoice.id));
        notify(tr("Invoice {n}: ZATCA is taking long. Check it in Recent sales.", { n: invoice.sale_no }), 9000);
        return;
      }
      setTimeout(tick, Date.now() - started < 60000 ? 1500 : 5000);
    };
    setTimeout(tick, 800);
  };

  const onOrderTypePicked = (type) => {
    setOrderType(type);
    const then = modal?.then;
    setModal(null);
    if (type !== "dine") setTable(null);
    if (type !== "delivery") { setPartner(""); setPartnerRef(""); }
    if (!then) { if (type === "dine" && !hasTables(table)) setModal({ name: "table" }); else if (type === "delivery") setModal({ name: "partner" }); return; }
    if (then.kind === "add") {
      if (then.item.variations.length) return setModal({ name: "variations", item: then.item });
      if (needsOptions(then.item)) return setModal({ name: "item", item: then.item });
      addToCart(then.item);
      if (type === "dine" && !hasTables(table)) setModal({ name: "table" });
      else if (type === "delivery" && !partner) setModal({ name: "partner" });
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
  const typeCount = (k) => running.filter((o) => TYPE_KEY[o.order_type] === k).length;
  const filteredRunning = running.filter((o) => {
    if (roType !== "all" && TYPE_KEY[o.order_type] !== roType) return false;
    const q = roQuery.trim().toLowerCase();
    if (!q) return true;
    return [o.sale_no, o.order_number, o.tables_text, o.waiter?.name, o.customer?.name, partnerById(o.delivery_partner_id)?.name, o.delivery_partner_ref_no].some((v) => String(v || "").toLowerCase().includes(q));
  });

  // load a running order into the cart to change it (Modify Order)
  const modifyOrder = async () => {
    if (!sel) return;
    if (cart.length && !editingId && !(await ask(tr("Replace the items in the current order with this running order?"), { confirmLabel: tr("Replace") }))) return;
    setBusy("load");
    try {
      loadOrder(await get(`/v1/orders/${sel.id}`));
    } catch (e) { onError(e); }
    finally { setBusy(null); }
  };
  const loadOrder = (o, fromSelf = false) => {
    {
      setCart(o.items.filter((l) => !l.is_free).map((l) => {
        const d = parseAmount(l.discount);
        return {
          key: `line-${l.line_id}`, lineId: l.line_id, itemId: l.food_menu_id, name: l.name, price: Number(l.unit_price) || 0, qty: Number(l.qty) || 1,
          mods: (l.modifiers || []).map((x) => ({ id: x.id, name: x.name, price: Number(x.price) || 0 })), note: l.note || "",
          disc: d.mode === "percent" ? d.value : 0, discRaw: d.mode === "fixed" && d.value ? String(d.value) : null,
          openPrice: false, comboSelections: comboFromText(ITEM_BY_ID[l.food_menu_id], l.combo_items), cooking: l.cooking_status,
        };
      }));
      setOrderType(TYPE_KEY[o.order_type] || "take");
      setTable(o.tables?.length ? o.tables.map((t) => ({ id: t.table_id, name: t.name, persons: Number(t.persons) || 1 })) : null);
      setWaiter(o.waiter?.id || firstWaiter());
      if (o.customer && !customers.some((c) => c.id === o.customer.id)) setCustomers((cs) => [...cs, { id: o.customer.id, name: o.customer.name, phone: o.customer.phone || "" }]);
      setCustomerId(o.customer?.id || DEFAULT_CUSTOMER_ID);
      setPartner(o.delivery_partner?.id ? String(o.delivery_partner.id) : "");
      setPartnerRef(o.delivery_partner?.ref_no || "");
      setDiscount(parseAmount(o.totals?.discount));
      setCharge(parseAmount(o.totals?.charge)); setChargeTouched(true);
      setTips(Number(o.totals?.tips) || 0);
      setOrderDate(o.sale_date || new Date().toISOString().slice(0, 10));
      setEditingId(o.id); setEditingSelf(fromSelf); setDrawer(false); setTab("order");
      notify(tr("Editing order {n}", { n: o.order_number || o.sale_no }));
    }
  };

  /* ---------- self / online orders (web POS "Self/Online Orders") ---------- */
  const canSelf = !isWaiter && (user?.role === "Admin" || !!user?.permissions?.pos?.pos_17);
  const refreshSelf = useCallback(async () => {
    if (!canSelf) return;
    try { const r = await get("/v1/orders/self"); setSelfCount((r.self_orders?.length || 0) + (r.online_orders?.length || 0)); } catch { /* next time */ }
  }, [canSelf]);
  useEffect(() => { refreshSelf(); const t = setInterval(refreshSelf, SELF_POLL_MS); return () => clearInterval(t); }, [refreshSelf]);
  const acceptSelf = async (o) => {
    const r = await post(`/v1/orders/${o.id}/accept`);
    if (prefs.printKot && r.kot?.prints?.length) printKot(r.kot);
    notify(tr("Order {n} accepted — sent to the kitchen", { n: r.order.order_number || r.order.sale_no }));
    refreshSelf(); await refreshRunning(); setSelectedRunning(r.order.id);
  };
  const declineSelf = async (o) => {
    await post(`/v1/orders/${o.id}/decline`);
    notify(tr("Order {n} declined", { n: o.order_number || o.sale_no }));
    refreshSelf();
  };
  const modifySelf = async (o) => {
    if (cart.length && !(await ask(tr("Replace the items in the current order with this order?"), { confirmLabel: tr("Replace") }))) return false;
    const full = await post(`/v1/orders/${o.id}/accept-edit`);
    setModal(null);
    loadOrder(full, true);
    refreshSelf(); refreshRunning();
    return true;
  };
  const cancelRunning = () => { if (sel) setModal({ name: "cancelOrder", order: sel }); };
  const doCancel = async (o, reason) => {
    try {
      const r = await post(`/v1/orders/${o.id}/cancel`, { reason });
      if (prefs.printKot && r?.kot?.prints?.length) printKot(r.kot);      // "ORDER CANCELLED" ticket for each kitchen
      if (editingId === o.id) resetOrder();
      setSelectedRunning(null);
      setModal(null);
      notify(tr("Order {n} cancelled", { n: o.order_number || o.sale_no }));
      refreshRunning();
    } catch (e) { onError(e); }
  };
  // "Clear running orders" (same as the web POS): your open orders; Admin: all open orders of the outlet
  const doClearRunning = async (password) => {
    try {
      const r = await post("/v1/orders/clear-mine", { password });
      if (editingId) resetOrder();
      setSelectedRunning(null);
      setModal(null);
      notify(r.cleared ? tn(r.cleared, "{n} running order cleared", "{n} running orders cleared") : tr("No running orders to clear"));
      refreshRunning();
      return null;
    } catch (e) {
      if (e?.code === "WRONG_PASSWORD" || e?.code === "PASSWORD_REQUIRED") return tr("The password is not correct.");
      onError(e);
      return null;
    }
  };
  const reprintKot = async (id) => {
    try { printKot(await get(`/v1/orders/${id}/kot?full=1`)); } catch (e) { onError(e); }
  };
  const printBill = async (id) => {
    try {
      const r = await post(`/v1/orders/${id}/bill`);
      refreshRunning();
      await printJob(r.print_job);
    } catch (e) { onError(e); }
  };

  // Re-print KOT / Print Draft: the button spins for 1 s, the popup closes, printing carries on in the background
  const [spin, setSpin] = useState(null);                  // "kot" | "bill" (running panel / order details)
  const inBackground = (kind, work, closeModal = false) => {
    if (spin) return;
    setSpin(kind);
    work();                                                // not awaited: it reports by itself (toast)
    setTimeout(() => { setSpin(null); if (closeModal) setModal(null); }, 1000);
  };

  /* ---------- drafts ---------- */
  const saveDraft = async () => {
    if (!cart.length) return notify(tr("Nothing to save — the order is empty"));
    if (editingId) return notify(tr("This is a running order. Use Update Order to save changes."));
    try {
      await post("/v1/drafts", orderBody(), { idempotencyKey: await newKey() });
      resetOrder(); refreshDrafts();
      notify(tr("Order saved as draft"));
    } catch (e) { onError(e); }
  };
  const restoreDraft = async (d) => {
    if (cart.length && !(await ask(tr("Replace the current order with this draft?"), { confirmLabel: tr("Replace") }))) return;
    try {
      const r = await get(`/v1/drafts/${d.id}`);
      const o = r.order;
      const lines = [];
      (o.items || []).forEach((l) => {
        const it = ITEM_BY_ID[l.food_menu_id];
        if (!it) return;
        const dd = parseAmount(l.discount);
        lines.push({
          key: `draft-${l.food_menu_id}-${lines.length}`, itemId: it.id, name: it.name, price: Number(l.unit_price) || priceFor(it, TYPE_KEY[o.order_type], o.delivery_partner_id),
          qty: Number(l.qty) || 1, mods: (l.modifier_ids || []).map((x) => {
            const id = typeof x === "object" && x ? x.id : x;
            const base = it.modifiers.find((m) => m.id === id);
            return base && (typeof x === "object" && x && x.price != null ? { ...base, price: Number(x.price) || 0 } : base);
          }).filter(Boolean),
          note: l.note || "", disc: dd.mode === "percent" ? dd.value : 0, discRaw: dd.mode === "fixed" && dd.value ? String(dd.value) : null,
          openPrice: it.openPrice, comboSelections: (l.combo_selections || []).map(Number), lineId: null,
        });
      });
      setCart(lines);
      setOrderType(TYPE_KEY[o.order_type] || "take");
      setTable(o.tables?.length ? o.tables.map((t) => ({ id: t.table_id, name: t.name || `#${t.table_id}`, persons: Number(t.persons) || 1 })) : null);
      setWaiter(o.waiter_id || firstWaiter());
      setCustomerId(o.customer_id || DEFAULT_CUSTOMER_ID);
      setPartner(o.delivery_partner_id ? String(o.delivery_partner_id) : "");
      setPartnerRef(o.delivery_partner_ref_no || "");
      setDiscount(parseAmount(o.discount)); setTips(Number(o.tips) || 0);
      if (o.charge) { setCharge(parseAmount(o.charge)); setChargeTouched(true); }
      await del(`/v1/drafts/${d.id}`);
      refreshDrafts();
      setModal(null); setTab("order"); notify(tr("Draft restored"));
    } catch (e) { onError(e); }
  };

  /* ---------- header actions ---------- */
  const unread = notifications.filter((n) => !seenNotif.has(n.id)).length;
  const markSeen = () => { const s = new Set([...seenNotif, ...notifications.map((n) => n.id)]); setSeenNotif(s); lsSet("pos.seenNotif", [...s].slice(-300)); };
  const openRecent = () => setModal({ name: "recent" });
  const printLast = async () => {
    try {
      const list = sales.length ? sales : await get("/v1/invoices?limit=1");
      if (!list[0]) return notify(tr("No invoice to print"));
      await reprintInvoice(list[0].id);
    } catch (e) { onError(e); }
  };
  const HEADER = [
    { id: "logout", label: tr("Log out"), icon: LogOut, cls: "", on: async () => {
      // cashier / admin with an open register: offer to close it first
      if (!isWaiter && registerOpen) return setModal({ name: "leave", exit: false });
      if (await ask(tr("Log out of the POS?"), { title: tr("Log out"), confirmLabel: tr("Log out") })) onLogout();
    } },
    { id: "drafts", label: tr("Open drafts"), icon: FolderOpen, cls: "", badge: drafts.length, on: () => { setModal({ name: "drafts" }); refreshDrafts(); } },
    ...(canPay ? [{ id: "print", label: tr("Print last invoice"), icon: Printer, cls: "opt-sm", on: printLast }] : []),
    ...(canPay ? [{ id: "recent", label: tr("Recent sales"), icon: History, cls: "", on: openRecent }] : []),
    ...(canSelf ? [{ id: "self", label: tr("Self / Online orders"), icon: Smartphone, cls: "", badge: selfCount, on: () => setModal({ name: "selfOrders" }) }] : []),
    { id: "notif", label: tr("Kitchen notifications"), icon: Bell, cls: "", badge: unread, on: () => { setModal({ name: "notifications" }); markSeen(); refreshNotifications(); } },
    ...(!isWaiter ? [{ id: "register", label: tr("Register details"), icon: Wallet, cls: "opt-sm", on: () => setModal({ name: "register" }) }] : []),
    { id: "clear", label: tr("Clear running orders"), icon: Eraser, cls: "opt-md", danger: true, on: () => setModal({ name: "clearRunning" }) },
    { id: "refresh", label: tr("Refresh menu and orders"), icon: RefreshCw, cls: "opt-md", on: () => { refreshRunning(); notify(tr("Running orders refreshed")); } },
  ];

  const kitchenTag = (o) => (o.bill_printed ? ["bill", tr("Draft printed")] : KITCHEN_TAG[o.kitchen?.status] ? [KITCHEN_TAG[o.kitchen.status][0], tr(KITCHEN_TAG[o.kitchen.status][1])] : ["", tr(o.status)]);
  const busyCls = (name) => (busy === name ? { opacity: 0.6, pointerEvents: "none" } : {});

  /* ============================================================================
     RENDER
     ========================================================================== */
  // cashier / admin: the register must be open before the POS can be used (same rule as the web POS)
  if (!isWaiter && registerOpen === false) {
    return (
      <div className="pos" dir={dir} lang={lang}>
        <style>{CSS}</style>
        <style>{CSS_ONLINE}</style>
        <OpenRegisterModal gate user={user} onError={onError} onLogout={onLogout}
          onOpened={() => { setRegisterOpen(true); notify(tr("Register opened")); }} />
        <ConfirmHost />
        {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
      </div>
    );
  }

  return (
    <div className="pos" dir={dir} lang={lang}>
      <style>{CSS}</style>
      <style>{CSS_ONLINE}</style>

      {!online && <div className="conn" role="alert"><WifiOff size={16} />{tr("No connection to the server. Orders and payments will work again as soon as it is back.")}</div>}

      {/* ---------------- TOP BAR ---------------- */}
      <header className="topbar">
        <button className="icon-btn show-lt-xl" onClick={() => setDrawer(true)} aria-label={tr("Running orders")} title={tr("Running orders")}>
          <ListOrdered size={20} />{running.length > 0 && <span className="badge">{running.length}</span>}
        </button>
        <nav className="tb-icons" aria-label={tr("POS actions")}>
          {HEADER.map((h) => (
            <button key={h.id} className={`icon-btn ${h.cls} ${h.danger ? "danger" : ""}`} onClick={h.on} title={h.label} aria-label={h.label}>
              <h.icon size={20} />{h.badge > 0 && <span className="badge">{h.badge}</span>}
            </button>
          ))}
        </nav>
        <button className="icon-btn theme-btn" onClick={toggleTheme} title={theme === "dark" ? tr("Light mode") : tr("Dark mode")} aria-label={theme === "dark" ? tr("Light mode") : tr("Dark mode")}>
          {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <div style={{ position: "relative" }}>
          <button className="lang-btn" onClick={() => setLangOpen((v) => !v)} title={tr("Language")} aria-label={tr("Language")} aria-expanded={langOpen}>
            <Languages size={16} />{LANGS.find((x) => x.code === lang)?.short}
          </button>
          {langOpen && <>
            <div style={{ position: "fixed", inset: 0, zIndex: 65 }} onClick={() => setLangOpen(false)} />
            <div className="lang-menu" role="menu">
              {LANGS.map((x) => <button key={x.code} role="menuitemradio" aria-pressed={lang === x.code} onClick={() => changeLang(x.code)} lang={x.code}><span>{x.name}</span><span className="muted">{x.short}</span></button>)}
            </div>
          </>}
        </div>
        <button className="icon-btn" onClick={() => setSheet(true)} title={tr("Main menu")} aria-label={tr("Main menu")}><Menu size={22} /></button>
        {accessLeft !== null && (
          <span className="trial-badge" style={{ background: accessLeft.ms <= 86400000 ? "var(--danger)" : undefined }} title={tr("This till's access ends on {date}", { date: accessLeft.date })}>
            {accessLeft.ms <= 86400000 ? tr("Access ends today") : tr("Access ends in {n} days", { n: Math.ceil(accessLeft.ms / 86400000) })}
          </span>
        )}
        {zatcaQueue.length > 0 && (
          <button className="zatca-pill" onClick={openRecent} title={zatcaQueue.map((x) => x.sale_no).join(", ")} aria-label={tr("Invoices being sent to ZATCA")}>
            <Loader2 size={14} className="spin" />{tr("ZATCA")} · {zatcaQueue.length}
          </button>
        )}
        {trial?.enabled && (
          <span className="trial-badge" style={{ marginInlineStart: "auto" }} title={tr("Testing version: works until {date}", { date: new Date(trial.until).toLocaleString() })}>
            {tr("TESTING MODE")} · {trial.days_left > 1 ? tr("{n} days left", { n: trial.days_left }) : trial.hours_left >= 1 ? tr("{n} hours left", { n: trial.hours_left }) : tr("less than an hour left")}
          </span>
        )}
        <div className="who" style={{ marginInlineStart: trial?.enabled ? 0 : "auto" }}><b>{user?.name || ""}</b><span>{user?.device || ""}</span></div>
        <div className="brand" style={{ marginInlineStart: 0 }}>{OUTLET.name}</div>
        <div className="chips" role="group" aria-label={tr("Item filters")}>
          {[["veg", tr("Vegetarian")], ["bev", tr("Beverage")], ["combo", tr("Combo")], ["promo", tr("Promo")]].map(([k, l]) => (
            <button key={k} className={`chip ${k}`} aria-pressed={filters[k]} onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))} title={l}>
              <span className="chip-txt">{l}</span><span className="chip-abbr">{{ veg: tr("Veg"), bev: tr("Bev"), combo: tr("Combo"), promo: tr("Promo") }[k]}</span>
            </button>
          ))}
        </div>
      </header>

      {/* ---------------- MAIN ---------------- */}
      <main className="main" data-tab={tab}>
        {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}

        {/* Running orders */}
        <aside className={`panel running ${drawer ? "open" : ""}`} aria-label={tr("Running orders")}>
          <div className="ro-head">
            <h2>{tr("Running Orders")}</h2>
            <div style={{ display: "flex" }}>
              <button className="icon-btn" onClick={() => { refreshRunning(); notify(tr("Running orders refreshed")); }} aria-label={tr("Refresh")} title={tr("Refresh")}><RefreshCw size={17} /></button>
              <button className="icon-btn only-drawer" onClick={() => setDrawer(false)} aria-label={tr("Close")}><X size={18} /></button>
            </div>
          </div>
          <div className="ro-filter" role="group" aria-label={tr("Filter running orders by type")}>
            {[["all", tr("All"), ListOrdered, running.length], ...Object.entries(ORDER_TYPES).map(([k, v]) => [k, tr(v.label), v.icon, typeCount(k)])].map(([k, label, Icon, n]) => (
              <button key={k} aria-pressed={roType === k} onClick={() => setRoType(k)} title={label} aria-label={`${label} (${n})`}>
                {k === "all" ? <span className="lbl">{tr("All")}</span> : <Icon size={15} />}<span className="n">{n}</span>
              </button>
            ))}
          </div>
          <div style={{ padding: "0 10px" }}>
            <input className="input" placeholder={tr("Table, order number, waiter")} value={roQuery} onChange={(e) => setRoQuery(e.target.value)} />
          </div>
          <div className="ro-list">
            {filteredRunning.length === 0 && <div className="ro-empty">{running.length ? (roType !== "all" && !typeCount(roType) ? tr("No {type} orders running.", { type: tr(ORDER_TYPES[roType].label) }) : tr("No orders match your search.")) : tr("No running orders. Placed orders will appear here.")}</div>}
            {filteredRunning.map((o) => {
              const TI = ORDER_TYPES[TYPE_KEY[o.order_type]]?.icon || ShoppingBag;
              const [tagCls, tagTxt] = kitchenTag(o);
              return (
                <button key={o.id} className="ro-card" aria-pressed={selectedRunning === o.id} onClick={() => setSelectedRunning(o.id === selectedRunning ? null : o.id)} onDoubleClick={() => setModal({ name: "details", id: o.id })}>
                  <div className="row"><b className="num">#{o.order_number || o.sale_no}</b><span className={`tag ${tagCls}`}>{tagTxt}</span></div>
                  <div className="row muted"><span style={{ display: "flex", alignItems: "center", gap: 4 }}><TI size={13} />{o.order_type === 1 && o.tables_text ? tr("Table {name}", { name: o.tables_text }) : typeName(o)}{o.order_type === 3 && partnerById(o.delivery_partner_id) ? ` · ${partnerById(o.delivery_partner_id).name}` : ""}</span></div>
                  <div className="row muted"><span>{o.customer?.name}</span><span>{o.waiter?.name}</span></div>
                  <div className="row"><span className="muted" style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} />{timeAgo(o.minutes_open ?? o.date_time, o.date_time)}</span><b className="num" style={{ fontSize: 13 }}>{money(o.total_payable)}</b></div>
                  {editingId === o.id && <span className="tag" style={{ background: "var(--warn-bg)", color: "var(--warn-ink)", justifySelf: "start" }}>{tr("Editing")}</span>}
                </button>
              );
            })}
          </div>
          <div className="ro-actions">
            <button className="op-btn" disabled={!sel || !!busy} onClick={modifyOrder}><Edit3 size={14} />{tr("Modify Order")}</button>
            <button className="op-btn" disabled={!sel} onClick={() => setModal({ name: "details", id: sel.id })}><Info size={14} />{tr("Order Details")}</button>
            <button className="op-btn" disabled={!sel || !!spin} onClick={() => inBackground("kot", () => reprintKot(sel.id))}>{spin === "kot" && modal?.name !== "details" ? <Loader2 size={14} className="spin" /> : <Printer size={14} />}{tr("Re-print KOT")}</button>
            {canPay && <button className="op-btn half" disabled={!sel || !!busy} onClick={() => openOrderPayment(sel.id)}><Receipt size={14} />{tr("Invoice")}</button>}
            <button className={`op-btn ${canPay ? "half" : ""}`} onClick={saveDraft} title={tr("Save the current order as a draft")}><FileText size={14} />{tr("Draft")}</button>
            <button className="op-btn" disabled={!sel} onClick={cancelRunning}><Ban size={14} />{tr("Cancel Order")}</button>
          </div>
        </aside>

        {/* Cart */}
        <section className="panel cart" aria-label={tr("Current order")}>
          <div className="type-row">
            {Object.entries(ORDER_TYPES).map(([k, v]) => (
              <button key={k} className="type-btn" aria-pressed={orderType === k} onClick={() => onOrderTypePicked(k)}>
                <v.icon size={16} /><span className="lbl-long">{tr(v.label)}</span>
              </button>
            ))}
            <button className="type-btn" aria-pressed={orderType === "dine" && hasTables(table)} onClick={() => setModal({ name: "table" })} title={hasTables(table) ? tblText(table) : tr("Select tables")}>
              <LayoutGrid size={16} /><span className="lbl-long" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{hasTables(table) ? tblText(table) : tr("Table")}</span>
            </button>
          </div>

          <div className="sel-row">
            <SearchSelect label={tr("Waiter")} value={waiter} placeholder={WAITERS.length ? tr("Waiter") : tr("No waiters")}
              options={WAITERS.map((w) => ({ value: w.id, label: w.name }))} onChange={(v) => setWaiter(Number(v) || "")} />
            <SearchSelect label={tr("Customer")} value={customerId} placeholder={tr("Customer")}
              options={customers.map((c) => ({ value: c.id, label: c.name, sub: c.phone }))}
              onChange={(v) => setCustomerId(Number(v))} onSearch={searchCustomers}
              footer={{ label: tr("Add new customer"), onClick: () => setModal({ name: "customer" }) }} />
            <button type="button" className="select sel-partner partner-pick" disabled={orderType !== "delivery"} onClick={() => setModal({ name: "partner" })} aria-label={tr("Delivery partner")} title={orderType !== "delivery" ? tr("Select Delivery to choose a partner") : tr("Choose delivery partner")}>
              {partner ? <>{partnerById(partner)?.logo && <img src={partnerById(partner).logo} alt="" />}<span>{partnerById(partner)?.name}{partnerRef ? ` · ${partnerRef}` : ""}</span></> : <span className="muted">{tr("Delivery Partner")}</span>}
            </button>
            <div className="sel-actions">
              <button className="sq-btn" title={tr("Edit customer")} aria-label={tr("Edit customer")} disabled={customer.id === DEFAULT_CUSTOMER_ID} style={customer.id === DEFAULT_CUSTOMER_ID ? { opacity: .45 } : {}} onClick={() => setModal({ name: "customer", edit: customer })}><Pencil size={16} /></button>
              <button className="sq-btn" title={tr("Add customer")} aria-label={tr("Add customer")} onClick={() => setModal({ name: "customer" })}><UserPlus size={16} /></button>
            </div>
          </div>

          {editingId && (
            <div className="edit-banner">
              <span>{tr("Editing order #{n}. Press Update Order to save and send changes to the kitchen.", { n: running.find((o) => o.id === editingId)?.order_number || editingId })}</span>
              <button onClick={() => { resetOrder(); notify(tr("Changes discarded")); }}>{tr("Discard")}</button>
            </div>
          )}
          {(orderType || cart.length > 0) && (
            <div className="context-line">
              {orderType && <span>{tr("Type:")} <b>{tr(ORDER_TYPES[orderType].label)}</b></span>}
              {hasTables(table) && <span>{tr("Table:")} <b>{tblText(table)}</b> · {tr("{n} guests", { n: tblPersons(table) })}</span>}
              {orderType === "delivery" && partner && <span>{tr("Partner:")} <b>{partnerById(partner)?.name}</b>{partnerRef ? ` · ${tr("Ref {ref}", { ref: partnerRef })}` : ""}</span>}
              <span>{tr("Items:")} <b className="num">{itemCount}</b></span>
            </div>
          )}

          <div className="cart-table">
            <div className="cart-grid cart-head">
              <span>{tr("Item")}</span><span className="r col-price">{tr("Price")}</span><span style={{ textAlign: "center" }}>{tr("Qty")}</span><span className="r">{tr("Total")}</span><span />
            </div>
            <div className="cart-body">
              {cart.length === 0 ? (
                <div className="cart-empty"><div><ShoppingCart size={40} /><div>{tr("Tap an item on the menu to start an order.")}</div></div></div>
              ) : cart.map((l) => (
                <div key={l.key} className="cart-grid cart-row">
                  <button className={`cart-name ${showImages ? "with-thumb" : ""}`} onClick={() => setModal({ name: "item", line: l })} title={tr("Edit item")}>
                    {showImages && (() => { const it = ITEM_BY_ID[l.itemId]; return it ? <ItemThumb item={it} size="sm" tint={catById[it.cat]?.tint} /> : null; })()}
                    <span className="txt">{ITEM_BY_ID[l.itemId] ? itemName(ITEM_BY_ID[l.itemId]) : l.name}
                    {(l.mods.length > 0 || l.note || l.disc > 0 || l.discRaw || l.cooking) && (
                      <small>{[...l.mods.map((m) => m.name), l.disc > 0 ? tr("{v}% off", { v: l.disc }) : "", l.discRaw ? tr("{v} off", { v: l.discRaw }) : "", l.note ? `“${l.note}”` : "", l.cooking && l.cooking !== "New" ? tr(l.cooking) : ""].filter(Boolean).join(", ")}</small>
                    )}</span>
                  </button>
                  <span className="r num col-price" title={l.priceEdited ? tr("Price changed for this customer") : ""} style={l.priceEdited ? { color: "var(--warn-ink)", fontWeight: 800 } : null}>{money(lineUnit(l))}{l.priceEdited ? "*" : ""}</span>
                  <Qty value={l.qty} onChange={(q) => setLineQty(l.key, q)} />
                  <span className="r num" style={{ fontWeight: 800 }}>{money(lineTotal(l))}</span>
                  <button className="del" onClick={() => removeLine(l.key)} aria-label={tr("Remove {name}", { name: l.name })}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          {calcErr && cart.length > 0 && <div className="calc-msg" role="alert">{calcErr}</div>}
          <div className="total-bar">
            <button className="icon-btn" style={{ color: "var(--ink2)" }} onClick={() => setDatePop((v) => !v)} title={tr("Order date")} aria-label={tr("Order date")}><CalendarDays size={19} /></button>
            <button className="icon-btn" style={{ color: "var(--ink2)" }} onClick={() => setModal({ name: "summary" })} title={tr("Discount, VAT, charges and tips")} aria-label={tr("Order summary")}><Eye size={19} /></button>
            <span className="lbl">{tr("Total Payable:")}</span>
            <span className="amount num">{cart.length ? (totals ? money(totals.total_payable) : "—") : money(0)}</span>
            {calcBusy && <Loader2 size={16} className="spin" aria-label={tr("Calculating")} />}
            {datePop && (
              <div className="date-pop">
                Order date
                <input type="date" className="input" value={orderDate} onChange={(e) => { setOrderDate(e.target.value); setDatePop(false); }} />
              </div>
            )}
          </div>

          <div className="act-row">
            <button className="act cancel" onClick={async () => { if (!cart.length && !editingId) return resetOrder(); if (await ask(editingId ? tr("Discard changes to this order?") : tr("Clear the current order?"), { confirmLabel: editingId ? tr("Discard") : tr("Clear"), danger: true })) { resetOrder(); notify(editingId ? tr("Changes discarded") : tr("Order cleared")); } }}><X size={17} />{tr("Cancel")}</button>
            {canPay && <button className="act quick" disabled={!!busy || !!editingId} style={busyCls("calc")} onClick={() => proceed("invoice")} title={!canPay ? tr("Waiters can't take payment") : editingId ? tr("Update the order first") : ""}><Receipt size={17} />{tr("Quick Invoice")}</button>}
            <button className="act place" disabled={!!busy} style={busyCls("place")} onClick={() => proceed("place")}>{busy === "place" ? <Loader2 size={17} className="spin" /> : <ChefHat size={17} />}{editingId ? tr("Update Order") : tr("Place Order")}</button>
          </div>
        </section>

        {/* Menu */}
        <section className="panel menu" aria-label={tr("Menu")}>
          <div className="menu-top">
            <div className="search">
              <Search size={17} />
              <input ref={searchRef} className="input" placeholder={tr("Name or Code or Category or VEG or BEV or BAR")} value={query} onChange={(e) => setQuery(e.target.value)} />
              {query ? <button className="del" style={{ position: "absolute", insetInlineEnd: 6, top: 6 }} onClick={() => setQuery("")} aria-label={tr("Clear search")}><X size={16} /></button> : <kbd>/</kbd>}
            </div>
            <div className="view-toggle" role="group" aria-label={tr("Item view")}>
              <button aria-pressed={showImages} onClick={() => setShowImages(true)} title={tr("Show item images")} aria-label={tr("Show item images")}><ImageIcon size={18} /></button>
              <button aria-pressed={!showImages} onClick={() => setShowImages(false)} title={tr("Text only (faster on slow terminals)")} aria-label={tr("Text only")}><List size={18} /></button>
            </div>
          </div>
          <div className="menu-body">
            <div className="cats" role="tablist" aria-label={tr("Categories")}>
              <button className="cat all" aria-pressed={activeCat === "all"} onClick={() => setActiveCat("all")}>{tr("All")}</button>
              {CATEGORIES.map((c) => (
                <button key={c.id} className="cat" style={{ "--tint": c.tint }} aria-pressed={activeCat === c.id} onClick={() => setActiveCat(c.id)}>{catName(c)}</button>
              ))}
            </div>
            <div className="items">
              {visibleItems.length === 0 && <div className="no-items">{ITEMS.length ? tr("No items match. Clear the search or filters to see the full menu.") : tr("No items on the menu for this outlet yet.")}</div>}
              {visibleItems.map((it) => {
                const tint = catById[it.cat]?.tint;
                const priceTxt = it.openPrice ? tr("Open price") : it.variations.length ? tr("From {price}", { price: money(shownPrice(it)) }) : money(shownPrice(it));
                return (
                  <button key={it.id} className={`item ${showImages ? "has-img" : ""}`} style={{ "--tint": tint, opacity: it.unavailable ? 0.5 : 1 }} onClick={() => onItemClick(it)}
                    onContextMenu={(e) => { e.preventDefault(); if (!orderType || it.variations.length) return onItemClick(it); setModal({ name: "item", item: it }); }} title={`${it.code} · ${tr("right-click or long-press for options")}`}>
                    <span className="marks">{it.veg && <span className="vegmark" title={tr("Vegetarian")} />}{it.combo && <span className="mini c">{tr("COMBO")}</span>}{it.promo && <span className="mini p">{tr("PROMO")}</span>}</span>
                    {qtyById[it.id] > 0 && <span className="inq num">{qtyById[it.id]}</span>}
                    {showImages ? (
                      <>
                        <ItemThumb item={it} tint={tint} />
                        <span className="body">
                          <span className="nm">{itemName(it)}</span>
                          <span className="pr num"><span>{tr("Price:")} </span>{priceTxt}</span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="nm">{itemName(it)}</span>
                        <span className="pr num"><span>{tr("Price:")} </span>{priceTxt}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* Mobile switcher */}
      <nav className="mob-tabs" aria-label={tr("Switch panel")}>
        <button aria-pressed={tab === "menu"} onClick={() => setTab("menu")}><LayoutGrid size={18} />{tr("Menu")}</button>
        <button aria-pressed={tab === "order"} onClick={() => setTab("order")}><ShoppingCart size={18} />{tr("Order ({n})", { n: itemCount })} · <span className="num">{totals ? money(totals.total_payable) : "—"}</span></button>
      </nav>

      {/* Side menu sheet */}
      {sheet && (
        <>
          <div className="scrim" onClick={() => setSheet(false)} />
          <div className="menu-sheet" role="dialog" aria-label={tr("Main menu")}>
            <div className="modal-h"><h3>{tr("Main menu")}</h3><button className="icon-btn" onClick={() => setSheet(false)} aria-label={tr("Close")}><X size={20} /></button></div>
            <div style={{ overflowY: "auto", padding: "6px 0" }}>
              <button className="item-link" onClick={() => { setSheet(false); setDrawer(true); }}><ListOrdered size={18} />{tr("Running orders ({n})", { n: running.length })}</button>
              {HEADER.map((h) => (
                <button key={h.id} className="item-link" onClick={() => { setSheet(false); h.on(); }} style={h.danger ? { color: "var(--danger)" } : {}}>
                  <h.icon size={18} />{h.label}{h.badge > 0 ? ` (${h.badge})` : ""}
                </button>
              ))}
              <button className="item-link" onClick={toggleTheme}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}{theme === "dark" ? tr("Light mode") : tr("Dark mode")}</button>
              <div className="setting-row"><span style={{ display: "flex", gap: 8, alignItems: "center" }}><Keyboard size={16} />{tr("On-screen keyboard")}</span>
                <input type="checkbox" checked={oskOn} onChange={(e) => setOskOn(e.target.checked)} aria-label={tr("On-screen keyboard")} /></div>
              <div className="lang-pick" role="group" aria-label={tr("Language")}>
                {LANGS.map((x) => <button key={x.code} aria-pressed={lang === x.code} onClick={() => changeLang(x.code)} lang={x.code}>{x.name}</button>)}
              </div>
              <div className="setting-row"><span style={{ display: "flex", gap: 8, alignItems: "center" }}><Settings2 size={16} />{tr("Print KOT after placing an order")}</span>
                <input type="checkbox" checked={!!prefs.printKot} onChange={(e) => savePrefs({ ...prefs, printKot: e.target.checked })} /></div>
              <div className="setting-row"><span style={{ display: "flex", gap: 8, alignItems: "center" }}><Settings2 size={16} />{tr("Print invoice after payment")}</span>
                <input type="checkbox" checked={!!prefs.printInvoice} onChange={(e) => savePrefs({ ...prefs, printInvoice: e.target.checked })} /></div>
            </div>
          </div>
        </>
      )}

      {/* ---------------- MODALS ---------------- */}
      {modal?.name === "orderType" && (
        <Modal title={tr("Please select an order type")} onClose={() => setModal(null)} footer={<button className="btn" onClick={() => setModal(null)}>{tr("Cancel")}</button>}>
          <div className="types">
            {Object.entries(ORDER_TYPES).map(([k, v]) => (
              <button key={k} className="type-card" onClick={() => onOrderTypePicked(k)}>
                <span className="ill" style={{ background: `color-mix(in srgb, ${TYPE_ILL[k][0]} var(--tint-mix), var(--panel))`, color: TYPE_ILL[k][1] }}><v.icon size={40} strokeWidth={1.8} /></span>
                {tr(v.label)}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {modal?.name === "table" && <TableModal editingId={editingId} current={table} onClose={() => setModal(null)} onPick={onTablePicked} onError={onError} />}

      {modal?.name === "partner" && (
        <PartnerModal current={partner} currentRef={partnerRef} onClose={() => setModal(null)}
          onSubmit={(id, ref) => { setPartner(id ? String(id) : ""); setPartnerRef(id ? ref : ""); if (orderType !== "delivery") setOrderType("delivery"); setModal(null); }} />
      )}

      {modal?.name === "variations" && (
        <Modal title={itemName(modal.item)} onClose={() => setModal(null)} size="sm">
          <div className="var-list">
            {modal.item.variations.map((v) => (
              <button key={v.id} className="var-row" disabled={v.unavailable} style={v.unavailable ? { opacity: 0.5 } : {}} onClick={() => {
                if (needsOptions(v)) return setModal({ name: "item", item: v });
                addToCart(v); setModal(null);
              }}>
                <span>{getLang() === "ar" && v.name2 ? v.name2 : v.shortName}</span><span className="num">{v.openPrice ? tr("Open price") : money(priceFor(v, orderType, partner))}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {modal?.name === "item" && (() => {
        const item = modal.item || ITEM_BY_ID[modal.line.itemId];
        if (!item) return null;
        return (
          <ItemModal
            item={item}
            line={modal.line}
            basePrice={priceFor(item, orderType, partner)}
            orderType={orderType}
            onClose={() => setModal(null)}
            onSave={({ comboChanged, ...data }) => {
              // combo choice changed on a line the kitchen already has: it goes out as cancelled + a new line on the KOT
              if (modal.line && comboChanged) setCart((c) => c.map((l) => (l.key === modal.line.key ? { ...l, ...data, lineId: null, cooking: undefined, key: `${l.itemId}-${Date.now()}` } : l)));
              else if (modal.line) setCart((c) => c.map((l) => (l.key === modal.line.key ? { ...l, ...data } : l)));
              else addToCart(item, data);
              setModal(null);
            }}
            onRemove={modal.line ? () => { removeLine(modal.line.key); setModal(null); } : null}
          />
        );
      })()}

      {modal?.name === "summary" && (
        <Modal title={tr("Order summary")} onClose={() => setModal(null)} size="sm" footer={<button className="btn primary" onClick={() => setModal(null)}>{tr("Done")}</button>}>
          <div className="sum-row"><span>{tr("Total items")}</span><span className="num">{itemCount}</span></div>
          <div className="sum-row"><span>{tr("Subtotal")}</span><span className="num">{totals ? money(totals.sub_total) : "—"}</span></div>
          <div className="sum-row"><span>{tr("Discount")}</span>
            <div className="inline-edit">
              <input className="input num" type="number" min="0" value={discount.value} onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value }))} aria-label={tr("Discount value")} />
              <select className="select" value={discount.mode} onChange={(e) => setDiscount((d) => ({ ...d, mode: e.target.value }))} aria-label={tr("Discount type")}><option value="fixed">{OUTLET.currency}</option><option value="percent">%</option></select>
              <span className="num" style={{ minWidth: 60, textAlign: "end" }}>-{totals ? money(totals.total_discount_amount) : "—"}</span>
            </div>
          </div>
          <div className="sum-row"><span>{orderType === "delivery" ? tr("Delivery charge") : tr("Service charge")}</span>
            <div className="inline-edit">
              <input className="input num" type="number" min="0" value={charge.value} onChange={(e) => { setChargeTouched(true); setCharge((c) => ({ ...c, value: e.target.value })); }} aria-label={tr("Charge value")} />
              <select className="select" value={charge.mode} onChange={(e) => { setChargeTouched(true); setCharge((c) => ({ ...c, mode: e.target.value })); }} aria-label={tr("Charge type")}><option value="fixed">{OUTLET.currency}</option><option value="percent">%</option></select>
              <span className="num" style={{ minWidth: 60, textAlign: "end" }}>{totals ? money(totals.charge_amount) : "—"}</span>
            </div>
          </div>
          <div className="sum-row"><span>{tr("Tips")}</span>
            <div className="inline-edit"><input className="input num" type="number" min="0" value={tips} onChange={(e) => setTips(e.target.value)} aria-label={tr("Tips")} /><span className="num" style={{ minWidth: 60, textAlign: "end" }}>{totals ? money(totals.tips_amount) : "—"}</span></div>
          </div>
          {(totals?.taxes || []).map((t, i) => (
            <div key={i} className="sum-row"><span>{t.tax_field_type}</span><span className="num">{money(t.tax_field_amount)}</span></div>
          ))}
          {Number(totals?.rounding_amount) !== 0 && totals && <div className="sum-row"><span>{tr("Rounding")}</span><span className="num">{money(totals.rounding_amount)}</span></div>}
          <div className="sum-row total"><span>{tr("Total payable")}</span><span className="num">{OUTLET.currency} {totals ? money(totals.total_payable) : "—"}</span></div>
          {calcErr && <div className="calc-msg" style={{ margin: "8px 0 0" }}>{calcErr}</div>}
        </Modal>
      )}

      {modal?.name === "payment" && (
        <PaymentModal due={modal.due} label={modal.label} allowDue={modal.allowDue} busy={busy === "pay"} onClose={() => !busy && setModal(null)} onPay={completePayment} />
      )}

      {modal?.name === "done" && (() => {
        const inv = modal.invoice;
        const z = inv.zatca || {};
        return (
          <Modal title={tr("Payment received")} onClose={() => setModal(null)} size="sm"
            footer={<><button className="btn" onClick={async () => {
              if (!modal.printed && inv.print_job?.print_bytes) { if (await printJob(inv.print_job)) setModal((md) => ({ ...md, printed: true })); }
              else reprintInvoice(inv.id);
            }}><Printer size={16} />{modal.printed ? tr("Print copy") : tr("Print invoice")}</button><button className="btn primary" onClick={() => setModal(null)}>{tr("New order")}</button></>}>
            <div className="done-box">
              <div className="muted">{tr("Invoice")}</div>
              <div className="big num">{inv.sale_no}</div>
              <div className="sum-row"><span>{tr("Total")}</span><span className="num">{OUTLET.currency} {money(inv.totals?.total_payable)}</span></div>
              {Number(inv.totals?.change_amount) > 0 && <div className="sum-row"><span>{tr("Change to return")}</span><span className="num" style={{ fontSize: 18 }}>{money(inv.totals.change_amount)}</span></div>}
              {Number(inv.totals?.due_amount) > 0 && <div className="sum-row"><span>{tr("Due")}</span><span className="num">{money(inv.totals.due_amount)}</span></div>}
              {z.phase === "2" && (z.synced || z.reported
                ? <div className="zatca ok"><ShieldCheck size={18} />{tr("Reported to ZATCA")}</div>
                : <div className="zatca warn"><ShieldAlert size={18} />{tr("Not reported to ZATCA yet.")} {z.message || tr("Use “Sync ZATCA” in the web POS.")}</div>)}
              {!inv.print_job?.print_bytes && inv.print_job?.error && <div className="zatca warn"><Printer size={18} />{inv.print_job.error}</div>}
            </div>
          </Modal>
        );
      })()}

      {modal?.name === "customer" && (
        <CustomerModal edit={modal.edit} onClose={() => setModal(null)} onError={onError} onSave={async (id, body) => {
          const saved = id ? await put(`/v1/customers/${id}`, body) : await post("/v1/customers", body);   // field errors go back to the form
          const row = { id: saved.id, name: saved.name, phone: saved.phone || "", email: saved.email || "", address: saved.address || "" };
          setCustomers((cs) => (cs.some((x) => x.id === row.id) ? cs.map((x) => (x.id === row.id ? row : x)) : [...cs, row]));
          setCustomerId(row.id);
          notify(id ? tr("Customer updated") : tr("{name} added and selected", { name: row.name }));
          setModal(null);
        }} />
      )}

      {modal?.name === "details" && <OrderDetails id={modal.id} canPay={canPay} onClose={() => setModal(null)} onError={onError}
        spin={spin} onKot={() => inBackground("kot", () => reprintKot(modal.id), true)} onBill={() => inBackground("bill", () => printBill(modal.id), true)}
        onInvoice={() => openOrderPayment(modal.id)} />}

      {modal?.name === "drafts" && (
        <Modal title={tr("Drafts")} onClose={() => setModal(null)}>
          {drafts.length === 0 ? <p className="muted">{tr("No drafts yet. Use Draft in the running orders panel to park an order and come back to it.")}</p> : (
            <div className="list">
              {drafts.map((d) => (
                <div key={d.id} className="list-row">
                  <span><b>{d.customer?.name || tr("Customer")}</b><div className="muted" style={{ fontSize: 12 }}>{tn(d.total_items, "{n} item", "{n} items")} · {d.name} · {d.saved_at}</div></span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}><b className="num">{money(d.total_payable)}</b>
                    <button className="btn primary" onClick={() => restoreDraft(d)}>{tr("Restore")}</button>
                    <button className="btn" onClick={async () => { try { await del(`/v1/drafts/${d.id}`); refreshDrafts(); } catch (e) { onError(e); } }} aria-label={tr("Delete draft")}><Trash2 size={16} /></button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {modal?.name === "recent" && (
        <RecentSalesModal initial={sales} onClose={() => setModal(null)} onError={onError} onReprint={reprintInvoice} />
      )}

      {modal?.name === "notifications" && (
        <Modal title={tr("Kitchen notifications")} onClose={() => setModal(null)}
          footer={notifications.length > 0 && <button className="btn" onClick={async () => { try { await del("/v1/notifications", { ids: notifications.map((n) => n.id) }); setNotifications([]); } catch (e) { onError(e); } }}>{tr("Clear all")}</button>}>
          {notifications.length === 0 ? <p className="muted">{tr("You're all caught up.")}</p> : (
            <div className="list">
              {notifications.map((n) => (
                <div key={n.id} className="list-row">
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>{/ready/i.test(n.message) ? <Check size={18} color="var(--ok)" /> : <ChefHat size={18} color="var(--amber)" />}<span>{n.message}</span></span>
                  <button className="btn" onClick={async () => { try { await del(`/v1/notifications/${n.id}`); setNotifications((x) => x.filter((y) => y.id !== n.id)); } catch (e) { onError(e); } }}>{tr("Dismiss")}</button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}



      {modal?.name === "leave" && (
        <LeaveModal exit={modal.exit} onClose={() => setModal(null)} onLeave={leave}
          onPrint={printRegister} onPdf={() => downloadRegister()} />
      )}

      {modal?.name === "register" && (
        <RegisterModal onClose={() => setModal(null)} onError={onError} printJob={printJob} onPrint={printRegister} onPdf={downloadRegister}
          onClosed={() => { setModal(null); onLogout(); }} />
      )}

      {modal?.name === "cancelOrder" && (
        <CancelOrderModal order={modal.order} onClose={() => setModal(null)} onConfirm={(reason) => doCancel(modal.order, reason)} />
      )}

      {modal?.name === "clearRunning" && (
        <ClearRunningModal admin={user?.role === "Admin"} onClose={() => setModal(null)} onConfirm={doClearRunning} />
      )}

      {modal?.name === "selfOrders" && (
        <SelfOrdersModal onClose={() => setModal(null)} onError={onError} onAccept={acceptSelf} onDecline={declineSelf} onModify={modifySelf} />
      )}

      {submitting && (
        <div className="submit-ovl" role="status" aria-live="polite" aria-label={tr("Submitting invoice…")}>
          <div className="submit-box"><Loader2 size={44} className="spin" /><b>{tr("Submitting invoice…")}</b><span className="muted">{tr("Please wait a moment")}</span></div>
        </div>
      )}
      <ConfirmHost />
      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  );
}


/* ============================================================================
   MODAL COMPONENTS
   ========================================================================== */

// one row per order (an order can have several booking rows on the same table)
function groupBookings(list) {
  const m = new Map();
  (list || []).forEach((b) => {
    const k = b.order_id || b.sale_no || b.booking_id;
    const g = m.get(k) || { key: k, no: b.order_number || b.sale_no || "-", minutes: null, persons: 0 };
    g.persons += Number(b.persons) || 0;
    if (b.booked_minutes != null) g.minutes = Math.max(g.minutes ?? 0, Number(b.booked_minutes) || 0);
    m.set(k, g);
  });
  return [...m.values()];
}
const fmtMinutes = (m) => {
  if (m == null) return "-";
  if (m < 60) return tr("{m} min", { m });
  if (m < 1440) return tr("{h} h {m} min", { h: Math.floor(m / 60), m: m % 60 });
  return tr("{d} d {h} h", { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60) });
};

// Tables come live from the server (seats taken by running orders on any till / the web POS).
// An order can sit on several tables, like the web POS: set the guests on a table and press Add, repeat, then Done.
function TableModal({ editingId, current, onClose, onPick, onError }) {
  const [data, setData] = useState(null);
  const [area, setArea] = useState("all");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() => (current || []).map((t) => ({ id: t.id, name: t.name, persons: Number(t.persons) || 1 })));
  const [guests, setGuests] = useState({});   // table id -> guests in the stepper
  const [info, setInfo] = useState(null);     // table whose orders are shown in the small popup

  useEffect(() => {
    let alive = true;
    get("/v1/tables").then((r) => {
      if (!alive) return;
      const areaName = Object.fromEntries((r.areas || []).map((a) => [a.id, a.name]));
      const tables = (r.tables || []).map((t) => {
        // bookings of the order being edited don't count: those seats belong to this order
        const others = (t.orders || []).filter((o) => o.order_id !== editingId);
        const used = others.reduce((s, o) => s + (Number(o.persons) || 0), 0);
        const free = t.capacity > 0 ? Math.max(0, t.capacity - used) : null;
        return { ...t, others, used, free, area: areaName[t.area_id] || "" };
      });
      const areas = (r.areas || []).filter((a) => tables.some((t) => t.area_id === a.id));
      setData({ areas, tables });
      setGuests(Object.fromEntries(tables.map((t) => [t.id, Math.max(1, t.free ?? 2)])));
    }).catch((e) => { onError(e); onClose(); });
    return () => { alive = false; };
  }, []); // eslint-disable-line

  const mine = (id) => picked.find((p) => p.id === id);
  const add = (t) => {
    const n = Math.max(1, Number(guests[t.id]) || 1);
    setPicked((ps) => (ps.some((p) => p.id === t.id) ? ps.map((p) => (p.id === t.id ? { ...p, persons: n } : p)) : [...ps, { id: t.id, name: t.name, persons: n }]));
  };
  const remove = (id) => setPicked((ps) => ps.filter((p) => p.id !== id));
  const shown = (data?.tables || []).filter((t) => (area === "all" || t.area_id === area)
    && (!q.trim() || `${t.name} ${t.area}`.toLowerCase().includes(q.trim().toLowerCase())));

  return (<>
    <Modal title={tr("Select tables")} size="lg" onClose={onClose}
      footer={<>
        <div className="tchips">
          <Users size={18} />
          {picked.length === 0 ? <span className="muted">{tr("No table added yet")}</span> : picked.map((p) => (
            <span key={p.id} className="tchip">{p.name} · {p.persons}<button onClick={() => remove(p.id)} aria-label={tr("Remove {name}", { name: p.name })}><X size={14} /></button></span>
          ))}
        </div>
        <button className="btn" onClick={onClose}>{tr("Cancel")}</button>
        <button className="btn primary" onClick={() => onPick(picked)}>{picked.length > 1 ? tr("Done ({n} tables)", { n: picked.length }) : picked.length ? tr("Done") : tr("Continue without table")}</button>
      </>}>
      {!data ? <p className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={16} className="spin" />{tr("Loading tables…")}</p> : <>
        <input className="input tsearch" placeholder={tr("Search by floor/area or table name")} value={q} onChange={(e) => setQ(e.target.value)} />
        {data.areas.length > 1 && (
          <div className="seg" role="tablist">
            <button aria-pressed={area === "all"} onClick={() => setArea("all")}>{tr("All")}</button>
            {data.areas.map((a) => <button key={a.id} aria-pressed={area === a.id} onClick={() => setArea(a.id)}>{a.name}</button>)}
          </div>
        )}
        {data.tables.length === 0 && <p className="muted">{tr("No tables are set up for this outlet.")}</p>}
        <div className="tgrid">
          {shown.map((t) => {
            const sel = mine(t.id);
            const state = t.free === 0 ? "full" : t.used ? "part" : "";
            const max = t.free ?? 99;
            return (
              <div key={t.id} className={`tcard ${state} ${sel ? "sel" : ""}`}>
                <div className="th">
                  <span><b>{t.name}</b>{t.area && <small>{t.area}</small>}</span>
                  <span className="th-r">
                    {t.others.length > 0 && (
                      <button className="bk-btn" onClick={() => setInfo(t)} title={tr("Orders on this table")} aria-label={`Orders on ${t.name}`}>
                        <ListOrdered size={13} />{groupBookings(t.others).length}
                      </button>
                    )}
                    <span className="seats" title={tr("Free seats / seats")}><Users size={12} style={{ verticalAlign: -2 }} /> {t.free ?? "–"}/{t.capacity || "–"}</span>
                  </span>
                </div>
                {sel && <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand)" }}>{tr("Added · {n} guests", { n: sel.persons })}</div>}
                <div className="add">
                  <Qty value={guests[t.id] || 1} onChange={(v) => setGuests((g) => ({ ...g, [t.id]: Math.min(Math.max(1, v), Math.max(1, max)) }))} />
                  {sel
                    ? <><button className="btn primary" onClick={() => add(t)} disabled={max < 1}>{tr("Update")}</button><button className="btn" onClick={() => remove(t.id)} aria-label={tr("Remove table")}><Trash2 size={15} /></button></>
                    : <button className="btn primary" onClick={() => add(t)} disabled={max < 1} title={max < 1 ? "No free seats" : ""}>{tr("Add")}</button>}
                </div>
              </div>
            );
          })}
        </div>
      </>}
    </Modal>
    {info && (
      <Modal title={`${info.name} · orders`} size="sm" onClose={() => setInfo(null)} footer={<button className="btn primary" onClick={() => setInfo(null)}>{tr("Close")}</button>}>
        <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{info.free ?? "–"} of {info.capacity || "–"} seats free</div>
        <table className="bk">
          <thead><tr><th>{tr("Order No")}</th><th>{tr("Time")}</th><th style={{ textAlign: "end" }}>{tr("Persons")}</th></tr></thead>
          <tbody>{groupBookings(info.others).map((o) => (
            <tr key={o.key}><td>{o.no}</td><td>{fmtMinutes(o.minutes)}</td><td style={{ textAlign: "end" }}>{o.persons}</td></tr>
          ))}</tbody>
        </table>
      </Modal>
    )}
  </>);
}

// Delivery partner with logo + the partner's reference number (same as the web POS "Delivery Partners" popup).
function PartnerModal({ current, currentRef, onClose, onSubmit }) {
  const [sel, setSel] = useState(current ? String(current) : "");
  const [ref, setRef] = useState(currentRef || "");
  const [broken, setBroken] = useState({});
  return (
    <Modal title={tr("Delivery Partners")} onClose={onClose}
      footer={<>
        <button className="btn" style={{ marginInlineEnd: "auto" }} onClick={() => onSubmit("", "")}>{tr("Click Here to Uncheck")}</button>
        <button className="btn" onClick={onClose}>{tr("Cancel")}</button>
        <button className="btn primary" onClick={() => onSubmit(sel, ref.trim())}>{tr("Submit")}</button>
      </>}>
      {PARTNERS.length === 0 ? <p className="muted">{tr("No delivery partners are set up. Add them in the web app first.")}</p> : (
        <div className="partners">
          {PARTNERS.map((p) => {
            const on = sel === String(p.id);
            return (
              <button key={p.id} className="partner" aria-pressed={on} onClick={() => setSel(on ? "" : String(p.id))}>
                {on && <span className="tick"><Check size={14} /></span>}
                <span className="logo">{p.logo && !broken[p.id] ? <img src={p.logo} alt="" onError={() => setBroken((b) => ({ ...b, [p.id]: true }))} /> : (p.name || "?").slice(0, 2).toUpperCase()}</span>
                {p.name}
              </button>
            );
          })}
        </div>
      )}
      <label className="field">{tr("Reference Number")}
        <input className="input" placeholder={tr("Partner's order / reference number")} value={ref} onChange={(e) => setRef(e.target.value)} disabled={!sel}
          onKeyDown={(e) => e.key === "Enter" && onSubmit(sel, ref.trim())} />
      </label>
    </Modal>
  );
}

// Item options: open price, combo choices, modifiers, item discount, kitchen note.
function ItemModal({ item, line, basePrice, orderType, onClose, onSave, onRemove }) {
  const [qty, setQty] = useState(line?.qty || 1);
  const [mods, setMods] = useState(line?.mods || []);
  const [disc, setDisc] = useState(line?.disc || 0);
  const [note, setNote] = useState(line?.note || "");
  const [open, setOpen] = useState(line?.openPrice ? String(line.price) : "");
  // price for this customer: any item can be changed at the till
  const [edit, setEdit] = useState(line?.priceEdited ? String(line.price) : "");
  const [combo, setCombo] = useState(() => line?.comboSelections?.length ? line.comboSelections
    : (item.comboGroups || []).map((g) => g.options[0]?.food_menu_id).filter(Boolean));

  const kitchenLine = !!line?.lineId;   // already sent to the kitchen: price stays as ordered
  const sameSet = (a, b) => [...(a || [])].sort().join(",") === [...(b || [])].sort().join(",");
  const comboChanged = !!item.comboGroups && kitchenLine && !sameSet(combo, line.comboSelections);
  const listPrice = kitchenLine && !line.priceEdited && !comboChanged ? line.price : basePrice + comboExtra(item, combo, orderType);
  const edited = !item.openPrice && edit !== "" && Number(edit) >= 0 && Number(edit) !== listPrice;
  const price = item.openPrice ? Number(open) || 0 : edited ? Number(edit) : listPrice;
  const unit = price + mods.reduce((s, m) => s + m.price, 0);
  const [askMod, setAskMod] = useState(null);         // open-price modifier whose price is being entered
  const modPriceRef = useRef(null);
  const priceRef = useRef(null);
  const toggle = (m) => {
    if (mods.some((x) => x.id === m.id)) { setMods((ms) => ms.filter((x) => x.id !== m.id)); if (askMod === m.id) setAskMod(null); return; }
    if (m.openPrice) { setMods((ms) => [...ms, { ...m, price: 0, entered: "" }]); setAskMod(m.id); return; }
    setMods((ms) => [...ms, m]);
  };
  const setModPrice = (id, v) => setMods((ms) => ms.map((x) => (x.id === id ? { ...x, entered: v, price: Number(v) || 0 } : x)));
  // the number pad comes up by itself: open-price item as soon as the popup opens, open-price modifier when picked
  useEffect(() => { if (item.openPrice && !line) openKeyboard(priceRef.current); }, []); // eslint-disable-line
  useEffect(() => { if (askMod) openKeyboard(modPriceRef.current); }, [askMod]);
  const modNeedsPrice = mods.some((x) => x.openPrice && x.entered === "");
  const pickCombo = (g, id) => setCombo((c) => [...c.filter((x) => !g.options.some((o) => o.food_menu_id === x)), id]);
  const needPrice = (item.openPrice && !(Number(open) > 0)) || modNeedsPrice;

  return (
    <Modal title={item.name} onClose={onClose}
      footer={<>
        {onRemove && <button className="btn" style={{ marginInlineEnd: "auto", color: "var(--danger)" }} onClick={onRemove}><Trash2 size={16} />{tr("Remove")}</button>}
        <button className="btn" onClick={onClose}>{tr("Cancel")}</button>
        <button className="btn primary" disabled={needPrice} onClick={() => onSave({
          qty: Math.max(1, qty), mods: mods.map(({ entered, ...m }) => m), disc: Number(disc) || 0, note: note.trim(), price, priceEdited: edited,
          discRaw: Number(disc) > 0 ? null : (line?.discRaw ?? null),
          comboSelections: item.comboGroups ? combo : [], comboChanged,
        })}>
          {line ? tr("Update item") : tr("Add to order")} · {money(unit * Math.max(1, qty) * (1 - (Number(disc) || 0) / 100))}
        </button>
      </>}>
      <ItemThumb item={item} size="lg" tint={(CATEGORIES.find((c) => c.id === item.cat) || {}).tint} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span className="muted">{item.code}{item.openPrice ? "" : ` · ${money(price)} each`}{edited && <b style={{ color: "var(--amber, #9A6400)" }}> {tr("· price changed")}</b>}</span>
        <Qty big value={qty} onChange={(v) => setQty(Math.max(1, v))} />
      </div>
      {item.openPrice ? (
        <label className="field">{tr("Price ({currency})", { currency: OUTLET.currency })}
          <input ref={priceRef} className="input num" type="number" min="0" step="any" autoFocus value={open} onChange={(e) => setOpen(e.target.value)} placeholder={tr("Enter the price")} />
        </label>
      ) : (
        <label className="field">
          <span style={{ display: "flex", justifyContent: "space-between" }}>{tr("Price for this customer ({currency})", { currency: OUTLET.currency })}
            {edited && <button type="button" className="link-reset" onClick={() => setEdit("")}>{tr("Use list price {price}", { price: money(listPrice) })}</button>}</span>
          <input className="input num" type="number" min="0" step="any" value={edit === "" ? money(listPrice) : edit}
            onFocus={(e) => e.target.select()} onChange={(e) => setEdit(e.target.value)} />
        </label>
      )}
      {(item.comboGroups || []).map((g) => (
        <div key={g.group_name} className="combo-group">
          <div className="field">{g.group_name}</div>
          <div className="mod-grid">
            {g.options.map((o) => {
              const k = orderType === "delivery" ? "delivery" : orderType === "take" ? "take_away" : "dine_in";
              const extra = Number(o.prices?.[k]) || 0;
              return (
                <button key={o.food_menu_id} className="mod" aria-pressed={combo.includes(o.food_menu_id)} onClick={() => pickCombo(g, o.food_menu_id)}>
                  <span>{o.qty > 1 ? `${o.qty} × ` : ""}{o.name}</span><span className="num">{extra ? `+${money(extra)}` : tr("Included")}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {item.modifiers.length > 0 && <>
        <div className="field" style={{ marginBottom: 6 }}>{tr("Modifiers")}</div>
        <div className="mod-grid">
          {item.modifiers.map((m) => {
            const sel = mods.find((x) => x.id === m.id);
            const tag = m.openPrice ? (sel && sel.entered !== "" ? `+${money(sel.price)}` : tr("Enter price")) : m.price ? `+${money(m.price)}` : tr("Free");
            return (
              <button key={m.id} className="mod" aria-pressed={!!sel} onClick={() => toggle(m)}>
                <span>{m.name}</span><span className="num">{tag}</span>
              </button>
            );
          })}
        </div>
        {mods.filter((x) => x.openPrice).map((x) => (
          <label key={x.id} className="field" style={{ marginTop: 8 }}>{tr("Price for {name} ({currency})", { name: x.name, currency: OUTLET.currency })}
            <input ref={askMod === x.id ? modPriceRef : null} className="input num" type="number" min="0" step="any" value={x.entered ?? String(x.price)}
              onChange={(e) => setModPrice(x.id, e.target.value)} placeholder={tr("Enter the price")} aria-label={tr("Price for {name} ({currency})", { name: x.name, currency: OUTLET.currency })} />
          </label>
        ))}
      </>}
      {ITEM_DISCOUNT_ENABLED && (
        <label className="field">{tr("Item discount (%)")}<input className="input num" type="number" min="0" max="100" value={disc} onChange={(e) => setDisc(e.target.value)} /></label>
      )}
      <label className="field">{tr("Unit price with modifiers")}<input className="input num" readOnly value={money(unit)} /></label>
      <label className="field"><span style={{ display: "flex", gap: 6, alignItems: "center" }}><StickyNote size={14} />{tr("Preparation Note")}</span>
        <textarea className="input" placeholder={tr("e.g. less spicy, sauce on the side")} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Modal>
  );
}

// Finalize sale, same rules as the web POS "Finalize Sale" popup:
//  - several payment methods on one sale (mixed payment), each method once
//  - quick cash buttons are the outlet's denominations (tbl_denominations); tapping one adds it up
//  - cash can be more than what is left: the change is shown and saved (given / change amount)
//  - card / online can't be more than what is left
//  - Walk-in Customer must pay in full; a named customer can leave a due balance
//  - reference is saved on the sale
function PaymentModal({ due: dueIn, label, busy, allowDue, onClose, onPay }) {
  const P = OUTLET.precision ?? 2;
  const r2 = (n) => Number((Number(n) || 0).toFixed(P));
  const due = r2(dueIn);
  const [method, setMethod] = useState(PAYMENT_METHODS[0]?.id);
  const [amount, setAmount] = useState("");
  const [counts, setCounts] = useState({});       // denomination -> times tapped (badge)
  const [lines, setLines] = useState([]);         // [{ id, name, cash, amount, given }]
  const [reference, setReference] = useState("");
  const [err, setErr] = useState("");
  const m = PAYMENT_METHODS.find((x) => x.id === method);
  const paid = r2(lines.reduce((s, l) => s + l.amount, 0));
  const left = r2(Math.max(0, due - paid));
  const cashLine = lines.find((l) => l.cash);
  const change = cashLine ? r2(Math.max(0, cashLine.given - cashLine.amount)) : 0;

  // the payment line the typed amount would make (null + message when it can't be added)
  const lineFor = (mt, value, rest) => {
    if (!mt) return [null, tr("Choose a payment method")];
    if (lines.some((l) => l.id === mt.id)) return [null, tr("{name} is already added", { name: mt.name })];
    const v = value === "" ? rest : r2(value);
    if (!(v > 0)) return [null, rest > 0 ? tr("Enter an amount") : tr("Nothing left to pay")];
    if (rest <= 0) return [null, tr("Nothing left to pay")];
    if (!mt.cash && v > rest) return [null, tr("{name} can't be more than the amount left ({amount})", { name: mt.name, amount: money(rest) })];
    return [{ id: mt.id, name: mt.name, cash: mt.cash, amount: Math.min(v, rest), given: mt.cash ? v : Math.min(v, rest) }, ""];
  };
  const clearInput = () => { setAmount(""); setCounts({}); };
  const add = () => {
    const [line, msg] = lineFor(m, amount, left);
    if (!line) return setErr(msg);
    setErr(""); setLines((ls) => [...ls, line]); clearInput();
    const next = PAYMENT_METHODS.find((x) => x.id !== line.id && !lines.some((l) => l.id === x.id));
    if (next) setMethod(next.id);
  };
  const tapDenom = (v) => {
    setErr("");
    setCounts((c) => ({ ...c, [v]: (c[v] || 0) + 1 }));
    setAmount((a) => String(r2((Number(a) || 0) + v)));
  };
  const remove = (id) => { setLines((ls) => ls.filter((l) => l.id !== id)); setErr(""); };

  // "Complete sale": what is typed (or, with nothing added yet, the full amount) goes in as the last payment
  const finalLines = () => {
    const typed = amount !== "" || !lines.length;
    if (!typed || left <= 0) return [lines, ""];
    const [line, msg] = lineFor(m, amount, left);
    return line ? [[...lines, line], ""] : [lines, msg];
  };
  const [fl, flMsg] = finalLines();
  const flPaid = r2(fl.reduce((s, l) => s + l.amount, 0));
  const flDue = r2(Math.max(0, due - flPaid));
  const blocked = flMsg || (flDue > 0 && !allowDue ? tr("Walk-in Customer must pay the full amount. Choose a customer to leave a due balance.") : "");
  const submit = () => {
    if (blocked) return setErr(blocked);
    const cash = fl.find((l) => l.cash);
    onPay({ payments: fl.map((l) => ({ payment_method_id: l.id, amount: l.amount })), given: cash ? cash.given : "", reference: reference.trim() });
  };
  const preview = amount !== "" && m?.cash ? r2(Math.max(0, Number(amount) - left)) : 0;

  return (
    <Modal title={tr("Finalize Sale")} onClose={onClose} size="lg"
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>{tr("Cancel")}</button>
        <button className="btn ok" disabled={!PAYMENT_METHODS.length || busy || !!blocked} onClick={submit} title={blocked || ""}>
          {busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}{busy ? tr("Saving…") : tr("Complete sale")}
        </button>
      </>}>
      <div className="pay-due"><span>{tr("Amount due")}</span><span className="num">{OUTLET.currency} {money(due)}</span></div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{label}</div>
      {!PAYMENT_METHODS.length && <p className="muted">{tr("No payment methods are set up for this outlet.")}</p>}
      <div className="pay-grid">
        <div>
          <div className="pay-methods">
            {PAYMENT_METHODS.map((x) => {
              const used = lines.some((l) => l.id === x.id);
              return <button key={x.id} className="pm" aria-pressed={method === x.id} disabled={used || left <= 0} onClick={() => { setMethod(x.id); setErr(""); }}><x.icon size={22} />{x.name}{used && <Check size={14} />}</button>;
            })}
          </div>
          <div className="pay-entry-label">{m?.cash ? tr("Cash received") : tr("Amount")}</div>
          <div className="pay-entry">
            <input className="input num" type="number" min="0" value={amount} disabled={left <= 0} placeholder={money(left)}
              onChange={(e) => { setAmount(e.target.value); setCounts({}); setErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") add(); }} aria-label={tr("Amount")} />
            <button className="btn primary" onClick={add} disabled={left <= 0}><Plus size={16} />{tr("Add")}</button>
          </div>
          {/* denominations (quick cash) only for cash */}
          {m?.cash && (
            <div className="quick-amts" aria-label={tr("Quick cash")}>
              <button className="num" disabled={left <= 0} onClick={() => { setAmount(String(left)); setCounts({}); setErr(""); }}>{tr("Exact")} {money(left)}</button>
              {DENOMINATIONS.map((v) => (
                <button key={v} className="num denom" disabled={left <= 0} onClick={() => tapDenom(v)}>{money(v)}{counts[v] ? <span className="dcount">{counts[v]}</span> : null}</button>
              ))}
              <button disabled={amount === ""} onClick={clearInput}>{tr("Clear")}</button>
            </div>
          )}
          {preview > 0 && <div className="change-box" role="status"><span>{tr("Change to return")}</span><b className="num">{OUTLET.currency} {money(preview)}</b></div>}
          <label className="field">{tr("Reference")}
            <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={tr("Card slip / transaction reference")} maxLength={100} />
          </label>
        </div>
        <div className="pay-side">
          <div className="pay-lines">
            {lines.length === 0 ? <div className="muted" style={{ textAlign: "center", padding: "18px 6px", fontSize: 13 }}>{tr("Your added payments will be shown here")}</div>
              : lines.map((l) => (
                <div key={l.id} className="pay-line">
                  <span>{l.name}{l.cash && l.given > l.amount ? <span className="muted" style={{ fontSize: 12 }}> · {tr("received {amount}", { amount: money(l.given) })}</span> : null}</span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}><b className="num">{money(l.amount)}</b>
                    <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => remove(l.id)} aria-label={tr("Remove {name}", { name: l.name })}><X size={14} /></button></span>
                </div>
              ))}
          </div>
          <div className="sum-row"><span>{tr("Payable")}</span><span className="num">{money(due)}</span></div>
          <div className="sum-row"><span>{tr("Paid")}</span><span className="num">{money(paid)}</span></div>
          <div className="sum-row total"><span>{tr("Due")}</span><span className="num">{money(left)}</span></div>
          {change > 0 && <div className="change-box" role="status"><span>{tr("Change to return")}</span><b className="num">{OUTLET.currency} {money(change)}</b></div>}
        </div>
      </div>
      {(err || blocked) && <div role="alert" style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600, marginTop: 10 }}>{err || blocked}</div>}
    </Modal>
  );
}

// Same fields as the web POS customer form (Sale::add_customer_by_ajax), incl. the ZATCA national address.
const NATIONAL = [
  ["short_address_en", "Short Address - English"], ["short_address_ar", "Short Address - Arabic", true],
  ["building_no", "Building No"], ["secondary_no", "Secondary No"],
  ["street_en", "Street - English"], ["street_ar", "Street - Arabic", true],
  ["district_en", "District - English"], ["district_ar", "District - Arabic", true],
  ["city_en", "City - English"], ["city_ar", "City - Arabic", true],
  ["postal_code", "Postal Code"], ["country_en", "Country - English"], ["country_ar", "Country - Arabic", true],
];
// what printSaleByAjax needs to send a standard (B2B) ZATCA invoice with the buyer's details
const B2B_NEEDS = [["name", "Name"], ["trn_number", "TRN"], ["postal_code", "Postal code"], ["street", "Street"], ["building_no", "Building no"],
  ["secondary_no", "Secondary no"], ["district", "District"], ["city", "City"]];

function CustomerModal({ edit, onClose, onSave, onError }) {
  const empty = { name: "", phone: "", email: "", trn_number: "", cr_number: "", default_discount: "", gst_number: "", same_or_diff_state: "", address: "", national_address: {} };
  const [f, setF] = useState(edit ? { ...empty, ...edit } : empty);
  const [addresses, setAddresses] = useState([]);
  const [addrId, setAddrId] = useState("new");          // "new" or a saved address id
  const [loading, setLoading] = useState(!!edit);
  const [saving, setSaving] = useState(false);
  const [errs, setErrs] = useState({});

  useEffect(() => {
    if (!edit) return;
    get(`/v1/customers/${edit.id}`).then((c) => {
      setF({ ...empty, ...c, same_or_diff_state: c.same_or_diff_state ? String(c.same_or_diff_state) : "", national_address: c.national_address || {} });
      const list = c.addresses || [];
      setAddresses(list);
      const act = list.find((a) => a.is_active);
      if (act) { setAddrId(String(act.id)); setF((x) => ({ ...x, address: act.address })); }
    }).catch((e) => { onError(e); onClose(); }).finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const set = (k) => (e) => { const v = e.target.value; setF((x) => ({ ...x, [k]: v })); setErrs((x) => ({ ...x, [k]: undefined })); };
  const setNa = (k) => (e) => { const v = e.target.value; setF((x) => ({ ...x, national_address: { ...x.national_address, [k]: v } })); };
  const pickAddr = (id) => {
    setAddrId(id);
    setF((x) => ({ ...x, address: id === "new" ? "" : (addresses.find((a) => String(a.id) === id)?.address || "") }));
  };
  const na = f.national_address || {};
  const val = { name: f.name, trn_number: f.trn_number, postal_code: na.postal_code, street: na.street_en || na.street_ar, building_no: na.building_no,
    secondary_no: na.secondary_no, district: na.district_en || na.district_ar, city: na.city_en || na.city_ar };
  const missing = B2B_NEEDS.filter(([k]) => !String(val[k] || "").trim()).map(([, l]) => l);

  const save = async () => {
    setSaving(true); setErrs({});
    const body = {
      name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), trn_number: f.trn_number.trim(), cr_number: f.cr_number.trim(),
      default_discount: String(f.default_discount || "").trim(), address: f.address.trim(), national_address: na,
    };
    if (addrId !== "new") body.address_id = Number(addrId);
    if (SETTINGS.tax_is_gst) { body.gst_number = f.gst_number.trim(); if (f.same_or_diff_state) body.same_or_diff_state = Number(f.same_or_diff_state); }
    try { await onSave(edit?.id, body); }
    catch (e) { if (e?.errors) setErrs(e.errors); else onError(e); }
    finally { setSaving(false); }
  };
  const err = (k) => errs[k] && <small className="ferr">{errs[k]}</small>;
  const fld = (k, label, props = {}) => (
    <label className="field">{label}<input className="input" value={f[k] || ""} onChange={set(k)} {...props} />{err(k)}</label>
  );

  return (
    <Modal title={edit ? tr("Edit customer") : tr("Add customer")} onClose={onClose} size="lg"
      footer={<><button className="btn" onClick={onClose}>{tr("Cancel")}</button>
        <button className="btn primary" disabled={!f.name.trim() || saving || loading} onClick={save}>{saving && <Loader2 size={16} className="spin" />}{edit ? tr("Save customer") : tr("Add customer")}</button></>}>
      {loading ? <p className="muted">{tr("Loading…")}</p> : <>
        <div className="grid3">
          {fld("name", <span>{tr("Name")} <span style={{ color: "var(--danger)" }}>*</span></span>, { autoFocus: true })}
          {fld("phone", tr("Phone"), { inputMode: "tel" })}
          {fld("email", tr("Email"), { type: "email" })}
          {fld("trn_number", tr("TRN"))}
          {fld("cr_number", tr("CR Number"))}
          {fld("default_discount", tr("Default Discount (Flat/Percentage)"), { placeholder: tr("10 or 10%") })}
          {SETTINGS.tax_is_gst && fld("gst_number", tr("GST Number"))}
          {SETTINGS.tax_is_gst && (
            <label className="field">{tr("Same or different state")}
              <select className="select" value={f.same_or_diff_state} onChange={set("same_or_diff_state")}>
                <option value="">{tr("Select")}</option><option value="1">{tr("Same state")}</option><option value="2">{tr("Different state")}</option>
              </select>{err("same_or_diff_state")}</label>
          )}
        </div>

        <div className="field" style={{ marginBottom: 6 }}>{tr("Delivery Address")}</div>
        <div className="addr-pick">
          {addresses.map((a) => (
            <label key={a.id}><input type="radio" name="addr" checked={addrId === String(a.id)} onChange={() => pickAddr(String(a.id))} />{a.address}</label>
          ))}
          <label><input type="radio" name="addr" checked={addrId === "new"} onChange={() => pickAddr("new")} />{tr("New")}</label>
        </div>
        <textarea className="input" placeholder={tr("Delivery Address")} value={f.address} onChange={set("address")} style={{ marginBottom: 14 }} />
        {err("address")}

        <div className="na-head">{tr("National Address")}
          {f.trn_number.trim() ? (missing.length
            ? <span className="na-warn">{tr("For a ZATCA standard (B2B) invoice also fill: {list}", { list: missing.map((x) => tr(x)).join(", ") })}</span>
            : <span className="na-ok"><Check size={14} />{tr("Complete for a ZATCA standard (B2B) invoice")}</span>)
            : <span className="muted" style={{ fontWeight: 500 }}>{tr("Needed with a TRN for ZATCA standard (B2B) invoices")}</span>}
        </div>
        <div className="grid2">
          {NATIONAL.map(([k, label, ar]) => (
            <label key={k} className="field">{tr(label)}
              <input className="input" dir={ar ? "rtl" : undefined} value={na[k] || ""} onChange={setNa(k)} placeholder={tr(label)} />
              {errs[`national_address.${k}`] && <small className="ferr">{errs[`national_address.${k}`]}</small>}
            </label>
          ))}
        </div>
      </>}
    </Modal>
  );
}

// Running order details, live from the server (kitchen status per item).
function OrderDetails({ id, canPay, onClose, onError, onKot, onBill, onInvoice, spin }) {
  const [o, setO] = useState(null);
  useEffect(() => { get(`/v1/orders/${id}`).then(setO).catch((e) => { onError(e); onClose(); }); }, [id]); // eslint-disable-line
  const t = o?.totals || {};
  return (
    <Modal title={o ? tr("Order {n}", { n: o.order_number || o.sale_no }) : tr("Order details")} onClose={onClose} size="lg"
      footer={o && <>
        <button className="btn" disabled={!!spin} onClick={onKot}>{spin === "kot" ? <Loader2 size={16} className="spin" /> : <Printer size={16} />}{tr("Re-print KOT")}</button>
        <button className="btn" disabled={!!spin} onClick={onBill}>{spin === "bill" ? <Loader2 size={16} className="spin" /> : <FileText size={16} />}{tr("Print Draft")}</button>
        {canPay && <button className="btn primary" onClick={() => { onClose(); onInvoice(); }}><Receipt size={16} />{tr("Invoice")}</button>}
      </>}>
      {!o ? <p className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={16} className="spin" />{tr("Loading…")}</p> : <>
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          {typeName(o)}{o.tables_text ? ` · ${tr("Table {name}", { name: o.tables_text })}` : ""} · {o.customer?.name}{o.waiter?.name ? ` · ${tr("Waiter {name}", { name: o.waiter.name })}` : ""} · {o.date_time}
        </div>
        <div className="list">
          {(o.items || []).map((l, i) => (
            <div key={l.line_id || i} className="list-row">
              <span><b className="num">{l.qty} ×</b> {l.name}{l.is_free ? " (free)" : ""}
                {((l.modifiers || []).length > 0 || l.note) && <div className="muted" style={{ fontSize: 12 }}>{[...(l.modifiers || []).map((m) => m.name), l.note ? `“${l.note}”` : ""].filter(Boolean).join(", ")}</div>}
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {l.cooking_status && <span className={`tag ${/done|ready/i.test(l.cooking_status) ? "ready" : /start|cook/i.test(l.cooking_status) ? "cooking" : "new"}`}>{tr(l.cooking_status)}</span>}
                <b className="num">{money(lineAmount(l))}</b>
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="sum-row"><span>{tr("Subtotal")}</span><span className="num">{money(t.sub_total)}</span></div>
          {Number(t.total_discount_amount) > 0 && <div className="sum-row"><span>{tr("Discount")}</span><span className="num">-{money(t.total_discount_amount)}</span></div>}
          {Number(t.charge_amount) > 0 && <div className="sum-row"><span>{t.charge_type === "delivery" ? tr("Delivery charge") : tr("Service charge")}</span><span className="num">{money(t.charge_amount)}</span></div>}
          {Number(t.tips_amount) > 0 && <div className="sum-row"><span>{tr("Tips")}</span><span className="num">{money(t.tips_amount)}</span></div>}
          {(t.taxes || []).map((x, i) => <div key={i} className="sum-row"><span>{x.tax_field_type}</span><span className="num">{money(x.tax_field_amount)}</span></div>)}
          <div className="sum-row total"><span>{tr("Total payable")}</span><span className="num">{OUTLET.currency} {money(t.total_payable)}</span></div>
        </div>
      </>}
    </Modal>
  );
}

// Same rule as the web POS: a cashier opens the register with the opening amount per payment method.
function OpenRegisterModal({ onClose, onOpened, onError, gate = false, onLogout, user }) {
  const [methods, setMethods] = useState(null);       // all methods (loyalty is sent as 0, not shown)
  const [amounts, setAmounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const load = () => {
    setErr("");
    get("/v1/register").then((r) => {
      if (r.open) return onOpened();
      setMethods(r.payment_methods || []);
    }).catch((e) => { if (gate) setErr(firstError(e)); else { onError(e); onClose(); } });
  };
  useEffect(load, []); // eslint-disable-line
  const open = async () => {
    setSaving(true);
    try {
      await post("/v1/register/open", { opening_details: methods.map((m) => ({ payment_method_id: m.id, amount: isLoyalty(m) ? 0 : Number(amounts[m.id]) || 0 })) });
      onOpened();
    } catch (e) { if (gate) setErr(firstError(e)); else onError(e); }
    finally { setSaving(false); }
  };
  return (
    <Modal title={tr("Open register")} onClose={onClose || (() => {})} size="sm" closable={!gate}
      footer={<>
        {gate ? <button className="btn" onClick={onLogout}><LogOut size={16} />{tr("Log out")}</button> : <button className="btn" onClick={onClose}>{tr("Later")}</button>}
        <button className="btn primary" disabled={!methods || saving} onClick={open}>{saving ? <Loader2 size={16} className="spin" /> : <Wallet size={16} />}Open register</button>
      </>}>
      <p className="muted" style={{ marginTop: 0 }}>{gate ? tr("Hi {name}, your register is closed. Enter the opening balance to start.", { name: user?.name || "" }) : tr("Your register is closed. Enter the opening balance to start taking payments.")}</p>
      {err && <div className="calc-msg" style={{ margin: "0 0 10px" }}>{err} {gate && <button className="link-reset" onClick={load}>{tr("Try again")}</button>}</div>}
      {!methods ? (!err && <p className="muted">{tr("Loading…")}</p>) : methods.filter((m) => !isLoyalty(m)).map((m, k) => (
        <label key={m.id} className="field">{m.name}
          <input className="input num" type="number" min="0" step="any" autoFocus={k === 0} value={amounts[m.id] ?? ""} placeholder={money(0)}
            onChange={(e) => setAmounts((a) => ({ ...a, [m.id]: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && open()} />
        </label>
      ))}
    </Modal>
  );
}

function CancelOrderModal({ order, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const quick = [tr("Customer cancelled"), tr("Wrong order"), tr("Customer left"), tr("Duplicate order")];
  const go = async () => { if (!reason.trim()) return; setBusy(true); try { await onConfirm(reason.trim()); } finally { setBusy(false); } };
  return (
    <Modal title={tr("Cancel order {n}", { n: order.order_number || order.sale_no })} onClose={onClose} size="sm"
      footer={<><button className="btn" onClick={onClose}>{tr("Keep order")}</button>
        <button className="btn" style={{ background: "var(--danger)", borderColor: "var(--danger)", color: "#fff" }} disabled={!reason.trim() || busy} onClick={go}>
          {busy ? <Loader2 size={16} className="spin" /> : <Ban size={16} />}{tr("Cancel order")}</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>{typeName(order)}{order.tables_text ? ` · ${tr("Table {name}", { name: order.tables_text })}` : ""} · {order.customer?.name} · {money(order.total_payable)}. {tr("The kitchen is told the order is cancelled.")}</p>
      <div className="quick-amts" style={{ marginBottom: 8 }}>
        {quick.map((q) => <button key={q} onClick={() => setReason(q)} aria-pressed={reason === q}>{q}</button>)}
      </div>
      <label className="field">{tr("Reason")}
        <textarea className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr("Why is this order cancelled?")} />
      </label>
    </Modal>
  );
}

// Self / Online orders (web POS "Self/Online Orders"): orders customers placed themselves (QR self order, online shop).
// Accept -> a normal running order + KOT. Modify -> accepted and opened in the cart; KOT when Update Order is pressed.
// Decline -> removed from the list (web: set_as_running_order_decline).
function SelfOrdersModal({ onClose, onError, onAccept, onDecline, onModify }) {
  const [tab, setTab] = useState("self");
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState(null);
  const [o, setO] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(async () => { try { setData(await get("/v1/orders/self")); } catch (e) { onError(e); setData({ self_orders: [], online_orders: [] }); } }, []); // eslint-disable-line
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    setO(null);
    if (!selId) return;
    get(`/v1/orders/${selId}`).then(setO).catch((e) => { onError(e); setSelId(null); });
  }, [selId]); // eslint-disable-line
  const list = (data?.[tab === "self" ? "self_orders" : "online_orders"] || []).filter((r) => {
    const t = q.trim().toLowerCase();
    return !t || [r.sale_no, r.order_number, r.token_number, r.customer?.name, r.customer?.phone, r.tables_text].some((v) => String(v || "").toLowerCase().includes(t));
  });
  const sel = list.find((r) => r.id === selId) || (data ? [...data.self_orders, ...data.online_orders].find((r) => r.id === selId) : null);
  const act = async (kind) => {
    if (!sel) return;
    if (kind === "decline" && !(await ask(tr("Decline order {n}? The customer's order will not be made.", { n: sel.order_number || sel.sale_no }), { title: tr("Decline"), confirmLabel: tr("Decline"), danger: true }))) return;
    setBusy(kind);
    try {
      if (kind === "accept") await onAccept(sel);
      else if (kind === "decline") await onDecline(sel);
      else { if (await onModify(sel)) return; }
      setSelId(null); await load();
    } catch (e) { onError(e); await load(); setSelId(null); }
    finally { setBusy(null); }
  };
  const t = o?.totals || {};
  const count = (k) => data?.[k]?.length || 0;
  return (
    <Modal title={tr("Self / Online orders")} onClose={onClose} size="xl"
      footer={<>
        <button className="btn" disabled={!o || !!busy} onClick={() => act("modify")}>{busy === "modify" ? <Loader2 size={16} className="spin" /> : <Edit3 size={16} />}{tr("Modify Order")}</button>
        <button className="btn" disabled={!o || !!busy} onClick={() => act("decline")} style={{ color: "var(--danger)" }}>{busy === "decline" ? <Loader2 size={16} className="spin" /> : <Ban size={16} />}{tr("Decline")}</button>
        <button className="btn ok" disabled={!o || !!busy} onClick={() => act("accept")}>{busy === "accept" ? <Loader2 size={16} className="spin" /> : <Check size={16} />}{tr("Accept")}</button>
      </>}>
      <div className="so-grid">
        <div className="so-list">
          <div className="seg" role="tablist" style={{ marginBottom: 8 }}>
            <button aria-pressed={tab === "self"} onClick={() => { setTab("self"); setSelId(null); }}>{tr("Self Orders")} ({count("self_orders")})</button>
            <button aria-pressed={tab === "online"} onClick={() => { setTab("online"); setSelId(null); }}>{tr("Online Orders")} ({count("online_orders")})</button>
          </div>
          <input className="input" placeholder={tr("Search customer, mobile number or token")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr("Search")} style={{ marginBottom: 8 }} />
          {data === null ? <p className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={16} className="spin" />{tr("Loading…")}</p>
            : list.length === 0 ? <p className="muted">{tr("No new orders.")}</p> : (
            <div className="list">
              {list.map((r) => (
                <button key={r.id} className="list-row so-row" data-id={r.id} aria-pressed={selId === r.id} onClick={() => setSelId(r.id)}>
                  <span style={{ minWidth: 0, textAlign: "start" }}><b className="num">{r.order_number || r.sale_no}</b>{r.token_number ? ` · ${tr("Token")} ${r.token_number}` : ""} · {typeName(r)}
                    <div className="muted" style={{ fontSize: 12 }}>{r.customer?.name}{r.customer?.phone ? ` (${r.customer.phone})` : ""}{r.tables_text ? ` · ${tr("Table {name}", { name: r.tables_text })}` : ""}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{r.date_time || ""}</div></span>
                  <b className="num" style={{ flex: "none" }}>{money(r.total_payable)}</b>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="so-detail">
          <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{tr("Order Details")}</h3>
          {!selId ? <p className="muted">{tr("Choose an order on the left.")}</p> : !o ? <p className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={16} className="spin" />{tr("Loading…")}</p> : <>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
              {typeName(o)} · {o.customer?.name}{o.waiter?.name ? ` · ${tr("Waiter {name}", { name: o.waiter.name })}` : ""}{o.tables_text ? ` · ${tr("Table {name}", { name: o.tables_text })}` : ""}
            </div>
            <table className="so-items">
              <thead><tr><th>{tr("Item")}</th><th className="r">{tr("Price")}</th><th className="r">{tr("Qty")}</th><th className="r">{tr("Total")}</th></tr></thead>
              <tbody>
                {(o.items || []).map((l, i) => (
                  <tr key={l.line_id || i}><td>{getLang() === "ar" && l.secondary_name ? l.secondary_name : l.name}
                    {(l.modifiers?.length > 0 || l.combo_items || l.note) && <div className="muted" style={{ fontSize: 11.5 }}>{[...(l.modifiers || []).map((m) => m.name), l.combo_items, l.note ? `“${l.note}”` : ""].filter(Boolean).join(", ")}</div>}</td>
                    <td className="r num">{money(l.unit_price)}</td><td className="r num">{l.qty}</td><td className="r num">{money(l.total ?? l.price_with_discount ?? (l.unit_price * l.qty))}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="sum-row"><span>{tr("Subtotal")}</span><span className="num">{money(t.sub_total)}</span></div>
            {Number(t.total_discount_amount) > 0 && <div className="sum-row"><span>{tr("Discount")}</span><span className="num">-{money(t.total_discount_amount)}</span></div>}
            {Number(t.charge_amount) > 0 && <div className="sum-row"><span>{tr("Service charge")}</span><span className="num">{money(t.charge_amount)}</span></div>}
            <div className="sum-row"><span>{tr("Tax")}</span><span className="num">{money(t.total_vat)}</span></div>
            <div className="sum-row total"><span>{tr("Total payable")}</span><span className="num">{OUTLET.currency} {money(t.total_payable)}</span></div>
          </>}
        </div>
      </div>
    </Modal>
  );
}

// "Clear running orders": the user's own login password is checked by the server before anything is removed
function ClearRunningModal({ admin, onClose, onConfirm }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    if (!pw) return setErr(tr("Enter your login password."));
    setBusy(true); setErr("");
    try { const e = await onConfirm(pw); if (e) setErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={tr("Clear running orders")} onClose={onClose} size="sm"
      footer={<><button className="btn" onClick={onClose}>{tr("Cancel")}</button>
        <button className="btn primary" style={{ background: "var(--danger)", borderColor: "var(--danger)" }} disabled={busy || !pw} onClick={go}>
          {busy && <Loader2 size={16} className="spin" />}{tr("Clear running orders")}</button></>}>
      <p style={{ marginTop: 0 }}>{admin
        ? tr("This removes all open orders of this outlet, from the web POS and the kitchen screen too.")
        : tr("This removes your open orders (orders you placed or are the waiter of) from the web POS and the kitchen screen too. Other staff's orders stay.")}</p>
      <p className="muted">{tr("Paid invoices are not affected. This cannot be undone.")}</p>
      <label className="field">{tr("Your login password")}
        <input className="input" type="password" autoFocus value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") go(); }} autoComplete="current-password" aria-label={tr("Your login password")} />
      </label>
      {err && <div role="alert" style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600 }}>{err}</div>}
    </Modal>
  );
}

function ConfirmModal({ title, children, confirmLabel = "OK", danger = false, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} size="sm"
      footer={<><button className="btn" onClick={onClose}>{tr("Cancel")}</button>
        <button className="btn primary" style={danger ? { background: "var(--danger)", borderColor: "var(--danger)" } : null} disabled={busy}
          onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>
          {busy && <Loader2 size={16} className="spin" />}{confirmLabel}</button></>}>
      {children}
    </Modal>
  );
}

/** Select with a search box. options: [{ value, label, sub }]; onSearch(q) may load more (server search). */
function SearchSelect({ value, options, onChange, placeholder, label, onSearch, footer }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const box = useRef(null);
  const input = useRef(null);
  const current = options.find((o) => String(o.value) === String(value));
  const t = q.trim().toLowerCase();
  const list = (t ? options.filter((o) => `${o.label} ${o.sub || ""}`.toLowerCase().includes(t)) : options).slice(0, 100);
  useEffect(() => {
    if (!open) return;
    const off = (e) => { if (box.current && !box.current.contains(e.target) && !e.target.closest?.("[data-osk-root]")) setOpen(false); };
    document.addEventListener("mousedown", off);
    setTimeout(() => input.current?.focus(), 0);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  useEffect(() => {                                  // ask the server too, after a short pause
    if (!onSearch || t.length < 2) return;
    const h = setTimeout(() => onSearch(t), 300);
    return () => clearTimeout(h);
  }, [t]); // eslint-disable-line
  useEffect(() => setHi(0), [t]);
  const pick = (o) => { onChange(o.value); setOpen(false); setQ(""); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (list[hi]) pick(list[hi]); }
    else if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
  };
  return (
    <div className="ss" ref={box}>
      <button type="button" className="select ss-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={current ? "" : "muted"}>{current ? current.label : placeholder}</span><ChevronDown size={16} />
      </button>
      {open && (
        <div className="ss-pop" role="listbox" aria-label={label}>
          <div className="ss-search"><Search size={15} />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={tr("Search…")} aria-label={tr("Search {what}", { what: label })} />
          </div>
          <div className="ss-list">
            {list.length === 0 && <div className="ss-empty">{tr("No match")}{onSearch && t.length >= 2 ? ` (${tr("searching…")})` : ""}</div>}
            {list.map((o, k) => (
              <button type="button" key={o.value} role="option" aria-selected={String(o.value) === String(value)}
                className={`ss-opt ${k === hi ? "hi" : ""}`} onMouseEnter={() => setHi(k)} onClick={() => pick(o)}>
                <span>{o.label}</span>{o.sub && <small>{o.sub}</small>}
              </button>
            ))}
          </div>
          {footer && <button type="button" className="ss-foot" onClick={() => { setOpen(false); footer.onClick(); }}><UserPlus size={15} />{footer.label}</button>}
        </div>
      )}
    </div>
  );
}

function salesHtml(title, first, rows, always) {
  const list = rows || [];
  if (!list.length && !always) return "";
  const qty = list.reduce((a, r) => a + (Number(r.qty) || 0), 0);
  const amt = list.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  return `<div class="hr"></div><div class="m b">${esc(title)}</div><table><tr class="b"><td>${esc(first)}</td><td class="r">Qty</td><td class="r">Amount</td></tr>
${list.map((r) => `<tr><td>${esc(r.name)}</td><td class="r">${esc(String(r.qty))}</td><td class="r">${money(r.amount)}</td></tr>`).join("")}
${list.length ? `<tr class="b"><td>Total</td><td class="r">${qty}</td><td class="r">${money(amt)}</td></tr>` : `<tr><td>No sales</td><td></td><td></td></tr>`}</table>`;
}
// Register report, A4 (download as PDF): outlet header + per payment method + item / modifier wise sales.
function registerA4Html(s) {
  const o = SETTINGS.outlet || {};
  const logo = SETTINGS.invoice?.logo_url || o.logo_url || "";
  const t = s.totals || {};
  const cur = esc(OUTLET.currency);
  const m2 = (v) => esc(money(v));
  const methods = (s.methods || []).filter((m) => !isLoyalty(m));
  const rows = (cells, cls = "") => `<tr class="${cls}">${cells.map((c, i) => `<td class="${i ? "r" : ""}">${c}</td>`).join("")}</tr>`;
  const sales = (title, first, list) => {
    if (!list?.length) return "";
    const q = list.reduce((a, r) => a + (Number(r.qty) || 0), 0), amt = list.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    return `<h3>${esc(title)}</h3><table class="grid"><thead><tr><th>#</th><th>${esc(first)}</th><th class="r">Quantity</th><th class="r">Amount</th></tr></thead><tbody>
${list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td class="r">${esc(String(r.qty))}</td><td class="r">${m2(r.amount)}</td></tr>`).join("")}
<tr class="tot"><td></td><td>Total</td><td class="r">${esc(String(q))}</td><td class="r">${m2(amt)}</td></tr></tbody></table>`;
  };
  const info = [["Address", o.address], ["Phone", o.phone], ["Email", o.email], ["VAT No (TRN)", o.trn], ["CR No", o.cr_number]].filter(([, v]) => v);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Register report</title><style>
@page{size:A4;margin:14mm 12mm}
*{box-sizing:border-box}body{font:11.5px/1.45 "Segoe UI",Tahoma,Arial,"Noto Sans Arabic",sans-serif;color:#1d2433;margin:0}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #5b3fd1;padding-bottom:10px}
.head img{max-height:62px;max-width:170px;object-fit:contain}
.firm h1{margin:0;font-size:20px}.firm .ar{font-size:15px;direction:rtl;text-align:start}.firm .out{color:#5a6478;font-weight:600;margin-top:2px}
.kv{margin-top:6px;display:grid;grid-template-columns:auto 1fr;gap:1px 10px;font-size:10.5px;color:#3b4456}.kv b{font-weight:600;color:#5a6478}
.title{display:flex;justify-content:space-between;align-items:flex-end;margin:14px 0 8px}
.title h2{margin:0;font-size:17px}.title .ar{font-size:14px;color:#5a6478}
.meta{display:grid;grid-template-columns:1.1fr 1.3fr 1.3fr .8fr;gap:8px;margin-bottom:12px}
.meta div{background:#f3f4f8;border-radius:6px;padding:7px 9px;min-width:0}.meta span{display:block;font-size:9.5px;color:#5a6478;text-transform:uppercase;letter-spacing:.04em}.meta b{font-size:11.5px;white-space:nowrap}
h3{font-size:13px;margin:16px 0 6px;color:#3f2a9e}
table{width:100%;border-collapse:collapse}
.grid th{background:#eeeaff;color:#3f2a9e;text-align:start;padding:6px 8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em}
.grid td{padding:5px 8px;border-bottom:1px solid #e4e7ee}
.r{text-align:end !important}.tot td{font-weight:700;border-top:2px solid #1d2433;border-bottom:none}
.pm{page-break-inside:avoid}
.summary{margin-top:14px;margin-inline-start:auto;width:52%}
.summary td{padding:5px 8px;border-bottom:1px solid #e4e7ee}.summary .big td{font-size:15px;font-weight:800;border-bottom:none;border-top:2px solid #1d2433}
.foot{margin-top:24px;display:flex;justify-content:space-between;color:#8a93a6;font-size:9.5px;border-top:1px solid #e4e7ee;padding-top:6px}
.sign{margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:40px}.sign div{border-top:1px solid #1d2433;padding-top:4px;text-align:center;font-size:10.5px;color:#5a6478}
</style></head><body>
<div class="head">
  <div class="firm">
    <h1>${esc(o.firm_name_1 || o.name || "")}</h1>
    ${o.firm_name_2 ? `<div class="ar">${esc(o.firm_name_2)}</div>` : ""}
    <div class="out">${esc(o.name || "")}${o.code ? ` · ${esc(o.code)}` : ""}</div>
    <div class="kv">${info.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join("")}</div>
  </div>
  ${logo ? `<img src="${esc(logo)}" alt="">` : ""}
</div>
<div class="title"><h2>Register Report</h2><span class="ar">تقرير السجل النقدي</span></div>
<div class="meta">
  <div><span>User</span><b>${esc(s.user || "")}</b></div>
  <div><span>Opened</span><b>${esc(s.opened_at || "")}</b></div>
  <div><span>${s.closed_at ? "Closed" : "Printed"}</span><b>${esc(s.closed_at || new Date().toLocaleString())}</b></div>
  <div><span>Status</span><b>${s.status === "closed" ? "Closed" : "Open"}</b></div>
</div>
<h3>Payment methods</h3>
<table class="grid"><thead><tr><th>Payment method</th><th class="r">Opening</th><th class="r">Sales</th><th class="r">Due received</th><th class="r">Purchase</th><th class="r">Due paid</th><th class="r">Expense</th><th class="r">Refund</th><th class="r">Closing</th></tr></thead><tbody>
${methods.map((m) => rows([esc(m.name), m2(m.opening), m2(m.sale), m2(m.due_receive), m2(m.purchase), m2(m.due_payment), m2(m.expense), m2(m.refund), `<b>${m2(m.closing)}</b>`], "pm")).join("")}
${rows(["Total", m2(t.opening), m2(t.sale), m2(t.due_receive), m2(t.purchase), m2(t.due_payment), m2(t.expense), m2(t.refund), m2(t.closing)], "tot")}
</tbody></table>
<table class="summary"><tbody>
<tr><td>Opening balance</td><td class="r">${m2(t.opening)}</td></tr>
<tr><td>Sales</td><td class="r">${m2(t.sale)}</td></tr>
${Number(t.due_receive) ? `<tr><td>Due received</td><td class="r">${m2(t.due_receive)}</td></tr>` : ""}
${Number(t.purchase) ? `<tr><td>Purchase</td><td class="r">-${m2(t.purchase)}</td></tr>` : ""}
${Number(t.due_payment) ? `<tr><td>Due paid</td><td class="r">-${m2(t.due_payment)}</td></tr>` : ""}
${Number(t.expense) ? `<tr><td>Expense</td><td class="r">-${m2(t.expense)}</td></tr>` : ""}
${Number(t.refund) ? `<tr><td>Refund</td><td class="r">-${m2(t.refund)}</td></tr>` : ""}
<tr class="big"><td>Closing balance</td><td class="r">${cur} ${m2(t.closing)}</td></tr>
</tbody></table>
${sales("Item wise sales", "Food menu", s.item_sales)}
${sales("Modifier wise sales", "Modifier", s.modifier_sales)}
<div class="sign"><div>Cashier</div><div>Manager</div></div>
<div class="foot"><span>${esc(o.name || "")} — Register report</span><span>Generated ${esc(new Date().toLocaleString())} · Reztra POS</span></div>
</body></html>`;
}

// Recent sales (web POS "Recent Sales"): search by invoice no / customer, pick a day, see the invoice, reprint it.
// Reprint uses the saved sale (GET /v1/invoices/{id}/print): same ZATCA QR, nothing is sent to ZATCA again.
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function RecentSalesModal({ initial, onClose, onError, onReprint }) {
  const [q, setQ] = useState("");
  const [date, setDate] = useState(today());
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);       // invoice shown in detail
  const [printing, setPrinting] = useState(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ limit: "100", ...(date ? { date } : {}), ...(q.trim() ? { search: q.trim() } : {}) });
      get(`/v1/invoices?${qs}`).then((r) => alive && setList(r)).catch((e) => { if (alive) { setList(initial || []); onError(e); } });
    }, q ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, date]); // eslint-disable-line
  const view = async (id) => { try { setOpen(await get(`/v1/invoices/${id}`)); } catch (e) { onError(e); } };
  const reprint = async (id) => { setPrinting(id); try { await onReprint(id); } finally { setPrinting(null); } };
  const pbtn = (id) => (
    <button className="btn" disabled={printing === id} onClick={() => reprint(id)}>{printing === id ? <Loader2 size={16} className="spin" /> : <Printer size={16} />}{tr("Reprint")}</button>
  );

  if (open) {
    const t = open.totals || {};
    return (
      <Modal title={tr("Invoice {n}", { n: open.sale_no })} onClose={onClose} size="lg"
        footer={<><button className="btn" onClick={() => setOpen(null)}>{tr("Back")}</button>{pbtn(open.id)}</>}>
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          {typeName(open)}{open.tables_text ? ` · ${tr("Table {name}", { name: open.tables_text })}` : ""} · {open.customer?.name}{open.cashier ? ` · ${open.cashier}` : ""} · {open.date_time}
        </div>
        <div className="list">
          {(open.items || []).map((l, i) => (
            <div key={i} className="list-row">
              <span><b>{l.qty} × {getLang() === "ar" && l.secondary_name ? l.secondary_name : l.name}</b>
                {l.modifiers?.length > 0 && <div className="muted" style={{ fontSize: 12 }}>+ {l.modifiers.map((m) => m.name).join(", ")}</div>}</span>
              <span className="num">{money(l.price_with_discount)}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="sum-row"><span>{tr("Subtotal")}</span><span className="num">{money(t.sub_total)}</span></div>
          {Number(t.total_discount_amount) > 0 && <div className="sum-row"><span>{tr("Discount")}</span><span className="num">-{money(t.total_discount_amount)}</span></div>}
          {Number(t.charge_amount) > 0 && <div className="sum-row"><span>{t.charge_type === "delivery" ? tr("Delivery charge") : tr("Service charge")}</span><span className="num">{money(t.charge_amount)}</span></div>}
          {Number(t.tips_amount) > 0 && <div className="sum-row"><span>{tr("Tips")}</span><span className="num">{money(t.tips_amount)}</span></div>}
          <div className="sum-row"><span>{tr("Tax")}</span><span className="num">{money(t.total_vat)}</span></div>
          <div className="sum-row total"><span>{tr("Total payable")}</span><span className="num">{OUTLET.currency} {money(t.total_payable)}</span></div>
          {(open.payments || []).map((p, i) => <div key={i} className="sum-row"><span>{p.name}</span><span className="num">{money(p.amount)}</span></div>)}
          {Number(t.change_amount) > 0 && <div className="sum-row"><span>{tr("Given")} / {tr("Change Amount")}</span><span className="num">{money(t.given_amount)} / {money(t.change_amount)}</span></div>}
          {Number(t.due_amount) > 0 && <div className="sum-row" style={{ color: "var(--danger)" }}><span>{tr("Due")}</span><span className="num">{money(t.due_amount)}</span></div>}
          {open.reference && <div className="sum-row"><span>{tr("Reference")}</span><span>{open.reference}</span></div>}
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={tr("Recent sales")} onClose={onClose} size="lg">
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <input className="input" style={{ flex: "1 1 220px" }} placeholder={tr("Search invoice no, customer or phone")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr("Search")} />
        <input className="input" type="date" style={{ flex: "0 0 170px" }} value={date} onChange={(e) => setDate(e.target.value)} aria-label={tr("Date")} />
        {date && <button className="btn" onClick={() => setDate("")}>{tr("All days")}</button>}
      </div>
      {list === null ? <p className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={16} className="spin" />{tr("Loading…")}</p>
        : list.length === 0 ? <p className="muted">{date === today() && !q ? tr("No sales yet today.") : tr("No sales found.")}</p> : (
        <div className="list recent-list">
          {list.map((s) => (
            <div key={s.id} className="list-row">
              <span style={{ minWidth: 0 }}><b className="num">{s.sale_no}</b> · {typeName(s)}{s.tables_text ? ` · ${s.tables_text}` : ""} · {s.customer?.name}
                <div className="muted" style={{ fontSize: 12 }}>{s.cashier ? `${s.cashier} · ` : ""}{s.date_time}{Number(s.due_amount) > 0 ? ` · ${tr("Due")} ${money(s.due_amount)}` : ""}</div></span>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flex: "none" }}><b className="num">{OUTLET.currency} {money(s.total_payable ?? s.totals?.total_payable)}</b>
                <button className="btn" onClick={() => view(s.id)}><Eye size={16} />{tr("View")}</button>
                {pbtn(s.id)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// Log out / close the app while the register is open: close it first, or leave it open, or stay.
function LeaveModal({ exit, onClose, onLeave, onPrint, onPdf }) {
  const [busy, setBusy] = useState(null);
  const go = async (closeRegister) => { setBusy(closeRegister ? "close" : "keep"); const done = await onLeave({ closeRegister, exit }); if (!done) setBusy(null); };
  const printIt = async () => { setBusy("print"); try { await onPrint(); } finally { setBusy(null); } };
  const pdfIt = async () => { setBusy("pdf"); try { await onPdf(); } finally { setBusy(null); } };
  return (
    <Modal title={exit ? tr("Close the app") : tr("Log out")} onClose={() => !busy && onClose()} closable={!busy} size="lg"
      footer={<>
        <button className="btn" disabled={!!busy} onClick={printIt}>
          {busy === "print" ? <Loader2 size={16} className="spin" /> : <Printer size={16} />}{tr("Print")}
        </button>
        <button className="btn" disabled={!!busy} onClick={pdfIt} style={{ marginInlineEnd: "auto" }}>
          {busy === "pdf" ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />}{tr("Download PDF")}
        </button>
        <button className="btn" disabled={!!busy} onClick={() => go(false)}>
          {busy === "keep" ? <Loader2 size={16} className="spin" /> : <LogOut size={16} />}{exit ? tr("Exit without closing") : tr("Log out without closing")}
        </button>
        <button className="btn primary" disabled={!!busy} onClick={() => go(true)} style={{ background: "var(--danger)", borderColor: "var(--danger)" }}>
          {busy === "close" ? <Loader2 size={16} className="spin" /> : <Ban size={16} />}{exit ? tr("Close register & exit") : tr("Close register & log out")}
        </button>
      </>}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Wallet size={28} color="var(--amber)" style={{ flex: "none" }} />
        <p style={{ margin: 0 }}>{tr("Your register is still open. Do you want to close the register before you {action}?", { action: exit ? tr("close the app") : tr("log out") })}
          <br /><span className="muted" style={{ fontSize: 13 }}>{tr("Print or download the register report without closing the register. Closing the register prints it too.")}</span></p>
      </div>
    </Modal>
  );
}

// item / modifier wise sales of the register (web "Register Details": Item Wise Sales)
function SalesTable({ title, first, rows, hideEmpty = false }) {
  const list = rows || [];
  if (hideEmpty && !list.length) return null;
  const qty = list.reduce((a, r) => a + (Number(r.qty) || 0), 0);
  const amt = list.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  return (
    <div className="reg-sales">
      <div className="reg-sales-h">{title}</div>
      <table>
        <thead><tr><th>{first}</th><th className="r">{tr("Quantity")}</th><th className="r">{tr("Amount")}</th></tr></thead>
        <tbody>
          {list.length === 0 ? <tr><td colSpan={3} className="muted">{tr("No sales yet")}</td></tr>
            : list.map((r, i) => <tr key={i}><td>{r.name}</td><td className="r num">{r.qty}</td><td className="r num">{money(r.amount)}</td></tr>)}
        </tbody>
        {list.length > 0 && <tfoot><tr><td>{tr("Total")}</td><td className="r num">{qty}</td><td className="r num">{money(amt)}</td></tr></tfoot>}
      </table>
    </div>
  );
}

function RegisterModal({ onClose, onClosed, onError, printJob, onPrint, onPdf }) {
  const [s, setS] = useState(null);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(null);
  useEffect(() => { get("/v1/register/summary").then(setS).catch((e) => { onError(e); onClose(); }); }, []); // eslint-disable-line
  const close = async () => {
    if (!(await ask(tr("Close the register? The report is printed and you are logged out."), { title: tr("Close register"), confirmLabel: tr("Close register & log out"), danger: true }))) return;
    setClosing(true);
    try { const r = await post("/v1/register/close"); await printJob(r.print_job); onClosed(); }
    catch (e) { onError(e); }
    finally { setClosing(false); }
  };
  const t = s?.totals || {};
  return (
    <Modal title={tr("Register details")} onClose={onClose}
      footer={s && <><button className="btn" disabled={!!busy} onClick={async () => { setBusy("print"); try { await onPrint(); } finally { setBusy(null); } }}>{busy === "print" ? <Loader2 size={16} className="spin" /> : <Printer size={16} />}{tr("Print")}</button>
        <button className="btn" disabled={!!busy} onClick={async () => { setBusy("pdf"); try { await onPdf(s); } finally { setBusy(null); } }}>{busy === "pdf" ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />}{tr("Download PDF")}</button>
        <button className="btn" style={{ color: "var(--danger)", marginInlineStart: "auto" }} disabled={closing} onClick={close}>{closing ? <Loader2 size={16} className="spin" /> : <Ban size={16} />}{tr("Close register & log out")}</button></>}>
      {!s ? <p className="muted">{tr("Loading…")}</p> : <>
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{s.user} · opened {s.opened_at}</div>
        <div className="list">
          {(s.methods || []).filter((m) => !isLoyalty(m)).map((m) => (
            <div key={m.payment_method_id} className="list-row"><span><b>{m.name}</b><div className="muted" style={{ fontSize: 12 }}>{tr("Opening")} {money(m.opening)} · {tr("Sales")} {money(m.sale)}</div></span><b className="num">{money(m.closing)}</b></div>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="sum-row"><span>{tr("Opening")}</span><span className="num">{money(t.opening)}</span></div>
          <div className="sum-row"><span>{tr("Sales")}</span><span className="num">{money(t.sale)}</span></div>
          {Number(t.expense) > 0 && <div className="sum-row"><span>{tr("Expense")}</span><span className="num">-{money(t.expense)}</span></div>}
          {Number(t.refund) > 0 && <div className="sum-row"><span>{tr("Refund (not deducted)")}</span><span className="num">{money(t.refund)}</span></div>}
          <div className="sum-row total"><span>{tr("Closing balance")}</span><span className="num">{OUTLET.currency} {money(t.closing)}</span></div>
        </div>
        <SalesTable title={tr("Item Wise Sales")} first={tr("Food Menus")} rows={s.item_sales} />
        <SalesTable title={tr("Modifier Wise Sales")} first={tr("Modifiers")} rows={s.modifier_sales} hideEmpty />
      </>}
    </Modal>
  );
}