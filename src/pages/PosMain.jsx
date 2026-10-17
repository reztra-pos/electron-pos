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
  Trash2, Maximize, Minimize, Menu, Search, RefreshCw, Pencil, Plus, Minus,
  X, UtensilsCrossed, Truck, LayoutGrid, CalendarDays, Eye, Info, Receipt, Ban, UserPlus,
  Check, CreditCard, Banknote, Smartphone, Clock, ChefHat, StickyNote, FileText, ListOrdered,
  ShoppingCart, Users, Edit3, Sandwich, CupSoda, IceCreamCone, Beef, Drumstick, Citrus, Grape, Milk,
  GlassWater, Cookie, Martini, Flame, Soup, Image as ImageIcon, List, ShoppingBag, WifiOff, Loader2,
  ShieldCheck, ShieldAlert, Settings2,
} from "lucide-react";
import { get, post, put, del, newKey, printHtml } from "../api/pos.js";

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
let PARTNERS = [];         // [{ id, name }]
let PAYMENT_METHODS = [];  // [{ id, name, icon, cash }]
let REGISTER_OPEN = null;  // true / false / null (waiters: no register)

// category illustration by name (only used when an item has no photo)
const ART_RULES = [
  [/falooda|ice|dessert|sweet/i, IceCreamCone], [/mix|grape|fruit/i, Grape], [/juice|passion|citrus|lemon|orange/i, Citrus],
  [/milk|shake|crush|roob|lassi/i, Milk], [/drink|soda|cola|bev/i, CupSoda], [/extra|side|cookie|snack/i, Cookie],
  [/kubz|grill|bbq|tikka/i, Flame], [/rice|soup|biryani|curry/i, Soup], [/club|wrap|sandwich|shawarma|roll/i, Sandwich],
  [/mojito|mocktail|cocktail/i, Martini], [/water|bottle/i, GlassWater], [/broast|chicken|wing/i, Drumstick], [/burger|beef|meat/i, Beef],
];
const artFor = (name) => (ART_RULES.find(([re]) => re.test(name || "")) || [null, UtensilsCrossed])[1];

const PAY_ICON = (name) => (/card|visa|master|mada/i.test(name) ? CreditCard : /cash/i.test(name) ? Banknote : Smartphone);

/** Turn GET /v1/pos/bootstrap (+ GET /v1/customers) into what the screen uses. */
export function applyCatalog(boot, customers = []) {
  SETTINGS = boot.settings || {};
  OUTLET = { name: SETTINGS.outlet?.name || "", currency: SETTINGS.currency || "", precision: Number(SETTINGS.precision ?? 2) };
  CATEGORIES = (boot.categories || []).map((c, i) => ({ id: c.id, name: c.name, tint: TINTS[i % TINTS.length], art: artFor(c.name) }));
  const catArt = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.art]));
  const mapItem = (it, parent = null) => ({
    id: it.id,
    code: it.code || String(it.id),
    name: parent ? `${parent.name} ${it.name}` : it.name,
    shortName: it.name,
    cat: it.category_id,
    prices: it.prices || { dine_in: 0, take_away: 0, delivery: 0, partners: {} },
    openPrice: !!it.open_price,
    modifiers: (it.modifiers || []).map((m) => ({ id: m.id, name: m.name, price: Number(m.price) || 0 })),
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
  PARTNERS = (boot.delivery_partners || []).map((p) => ({ id: p.id, name: p.name }));
  // loyalty points need a points field on the payment screen: use the web POS for those payments
  PAYMENT_METHODS = (boot.payment_methods || []).filter((m) => !m.is_loyalty)
    .map((m) => ({ id: m.id, name: m.name, icon: PAY_ICON(m.name), cash: m.id === 1 || /cash/i.test(m.name) }));
  REGISTER_OPEN = boot.register ? !!boot.register.open : null;
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
const lineUnit = (l) => l.price + l.mods.reduce((s, m) => s + m.price, 0);
const lineTotal = (l) => lineUnit(l) * l.qty * (1 - (Number(l.disc) || 0) / 100);
const amountStr = ({ mode, value }) => (Number(value) > 0 ? (mode === "percent" ? `${Number(value)}%` : String(Number(value))) : "");
const parseAmount = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return { mode: "fixed", value: 0 };
  return t.endsWith("%") ? { mode: "percent", value: Number(t.slice(0, -1)) || 0 } : { mode: "fixed", value: Number(t) || 0 };
};
const firstError = (e) => (e?.errors && Object.values(e.errors)[0]) || e?.message || "Something went wrong.";
const timeAgo = (when) => {
  const t = typeof when === "number" ? Date.now() - when * 60000 : new Date(String(when).replace(" ", "T"));
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
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
const qrSrc = (q) => (!q ? null : /^data:image\//.test(q) ? q : /^iVBOR/.test(q) ? `data:image/png;base64,${q}` : null);

// item amount after its discount + its modifiers (modifier price × qty), as stored by the server
const lineAmount = (it) => (Number(it.price_with_discount) || 0) + (it.modifiers || []).reduce((s, m) => s + (m.total != null ? Number(m.total) : (Number(m.price) || 0) * (Number(it.qty) || 0)), 0);

function invoiceHtml(inv, { bill = false } = {}) {
  const p = inv.print || {};
  const o = p.outlet || {};
  const t = inv.totals || {};
  const cur = p.currency || OUTLET.currency;
  const rows = (inv.items || []).map((it) => `<tr><td>${esc(it.qty)} × ${esc(it.name)}${it.secondary_name ? `<div class="small">${esc(it.secondary_name)}</div>` : ""}${(it.modifiers || []).map((m) => `<div class="small">+ ${esc(m.name)}${m.price ? ` (${money(m.price)})` : ""}</div>`).join("")}${it.note ? `<div class="small">“${esc(it.note)}”</div>` : ""}</td><td class="r">${money(lineAmount(it))}</td></tr>`).join("");
  const taxes = (t.taxes || []).map((x) => `<tr><td>${esc(x.tax_field_type)}</td><td class="r">${money(x.tax_field_amount)}</td></tr>`).join("");
  const pays = (inv.payments || []).map((x) => `<tr><td>${esc(x.name)}</td><td class="r">${money(x.amount)}</td></tr>`).join("");
  const qr = qrSrc(p.qr_code);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${RECEIPT_CSS}</style></head><body>
<h1>${esc(o.firm_name_1 || o.name || OUTLET.name)}</h1>${o.firm_name_2 ? `<div class="c">${esc(o.firm_name_2)}</div>` : ""}
<div class="c small">${esc(o.address || "")}${o.phone ? `<br>${esc(o.phone)}` : ""}${o.trn ? `<br>${esc(p.tax_title || "VAT")} No: ${esc(o.trn)}` : ""}</div>
<h2>${bill ? "BILL" : (p.tax_title ? "TAX INVOICE" : "INVOICE")}</h2>
<div class="m">${bill ? "Order" : "Invoice"}: <b>${esc(inv.sale_no)}</b></div>
<div class="m">Date: ${esc(inv.date_time || "")}</div>
<div class="m">${esc(inv.order_type_name || "")}${inv.tables_text ? ` · Table ${esc(inv.tables_text)}` : ""}${inv.token_number ? ` · Token ${esc(inv.token_number)}` : ""}</div>
<div class="m">Customer: ${esc(inv.customer?.name || "")}</div>
${inv.waiter ? `<div class="m">Waiter: ${esc(typeof inv.waiter === "object" ? inv.waiter.name : inv.waiter)}</div>` : ""}${inv.cashier ? `<div class="m">Cashier: ${esc(inv.cashier)}</div>` : ""}
<div class="hr"></div><table>${rows}</table><div class="hr"></div>
<table><tr><td>Subtotal</td><td class="r">${money(t.sub_total)}</td></tr>
${Number(t.total_discount_amount) ? `<tr><td>Discount</td><td class="r">-${money(t.total_discount_amount)}</td></tr>` : ""}
${Number(t.charge_amount) ? `<tr><td>${t.charge_type === "delivery" ? "Delivery charge" : "Service charge"}</td><td class="r">${money(t.charge_amount)}</td></tr>` : ""}
${Number(t.tips_amount) ? `<tr><td>Tips</td><td class="r">${money(t.tips_amount)}</td></tr>` : ""}${taxes}
${Number(t.rounding_amount) ? `<tr><td>Rounding</td><td class="r">${money(t.rounding_amount)}</td></tr>` : ""}
<tr><td class="big">Total</td><td class="r big">${esc(cur)} ${money(t.total_payable)}</td></tr></table>
${bill ? "" : `<div class="hr"></div><table>${pays}${Number(t.change_amount) ? `<tr><td>Change</td><td class="r">${money(t.change_amount)}</td></tr>` : ""}${Number(t.due_amount) ? `<tr><td class="b">Due</td><td class="r b">${money(t.due_amount)}</td></tr>` : ""}</table>`}
${!bill && qr ? `<img class="qr" src="${qr}" alt="">` : ""}
${p.invoice?.footer ? `<div class="hr"></div><div class="c small">${esc(p.invoice.footer)}</div>` : ""}
</body></html>`;
}

function kotHtml(kot) {
  const blocks = (kot.kitchens || []).map((k) => `<div class="kitchen">
<h1>${esc(k.kitchen_name || "Kitchen")}</h1><h2>${kot.reprint ? "KOT (REPRINT)" : "KOT"}</h2>
<div class="m big">Order ${esc(kot.order_number || kot.sale_no)}</div>
<div class="m">${esc(kot.order_type)}${kot.tables ? ` · Table ${esc(kot.tables)}` : ""}</div>
<div class="m">Waiter: ${esc(kot.waiter)} · ${esc(kot.customer)}</div><div class="m small">${esc(kot.date_time)}</div>
<div class="hr"></div><table>${(k.items || []).map((it) => `<tr><td class="big">${esc(it.qty)} ×</td><td class="big">${esc(it.name)}${(it.modifiers || []).map((m) => `<div class="small">+ ${esc(m)}</div>`).join("")}${it.combo_items ? `<div class="small">${esc(it.combo_items)}</div>` : ""}${it.note ? `<div class="small b">“${esc(it.note)}”</div>` : ""}</td></tr>`).join("")}</table>
${(k.cancelled || []).length ? `<div class="hr"></div><div class="b">CANCELLED</div><table>${k.cancelled.map((c) => `<tr><td>${esc(c.qty)} ×</td><td><s>${esc(c.name)}</s></td></tr>`).join("")}</table>` : ""}
</div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${RECEIPT_CSS}</style></head><body>${blocks}</body></html>`;
}

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

/* extra styles for the online screen (connection banner, server totals, invoice result) */
const CSS_ONLINE = `
.conn{display:flex;align-items:center;gap:8px;justify-content:center;background:#FDECEA;color:#A4262C;font-weight:700;font-size:13px;padding:6px 10px;border-bottom:1px solid #F5C2C0}
.who{font-size:12px;color:var(--ink2);white-space:nowrap;padding:0 6px;display:flex;flex-direction:column;line-height:1.2;text-align:right}
.who b{color:var(--ink);font-size:13px}
.calc-msg{margin:6px 10px 0;padding:6px 10px;border-radius:8px;background:#FFF1D6;color:#7A4F00;font-size:12.5px;font-weight:600}
.total-bar .spin{animation:spin .8s linear infinite;color:var(--ink2)}@keyframes spin{to{transform:rotate(360deg)}}
.tag.new{background:#E3EEFD;color:var(--info)}.tag.bill{background:#EBE2FA;color:#5B3FD1}
.var-list{display:grid;gap:8px}
.var-row{border:1px solid var(--line);border-radius:10px;background:#fff;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:14px}
.var-row:hover{border-color:var(--brand);background:var(--brand-2)}
.combo-group{margin-bottom:12px}.combo-group .field{margin-bottom:6px}
.done-box{text-align:center;padding:4px 0 8px}
.done-box .big{font-size:26px;font-weight:800;margin:6px 0}
.zatca{display:flex;gap:8px;align-items:flex-start;justify-content:center;margin-top:10px;font-size:13px;font-weight:700}
.zatca.ok{color:var(--ok)}.zatca.warn{color:#9A6400}
.act:disabled,.op-btn:disabled{opacity:.5;cursor:not-allowed}
.setting-row{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;font-weight:600;font-size:14px;border-top:1px solid var(--line)}
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
  const Art = item.art || UtensilsCrossed;
  if (item.image && !broken) {
    return <span className={`thumb ${size}`}><img src={item.image} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} /></span>;
  }
  const px = size === "sm" ? 18 : size === "lg" ? 72 : 40;
  return <span className={`thumb art ${size}`} style={{ "--tint": tint }} aria-hidden="true"><Art size={px} strokeWidth={1.6} /></span>;
}

const TYPE_ILL = { dine: ["#E3EEFD", "#1E7FD8"], take: ["#FDEBD8", "#D9711C"], delivery: ["#FFE3E0", "#DC3F35"] };
const KITCHEN_TAG = { new: ["new", "New"], cooking: ["cooking", "Cooking"], ready: ["ready", "Ready"] };

/* ============================================================================
   MAIN
   ========================================================================== */
const RUNNING_POLL_MS = 10000;     // running orders + kitchen status (live sync with web POS / kitchen screen)
const NOTIF_POLL_MS = 15000;

export default function PosMainScreen({ user, onLogout = () => { } }) {
  const isWaiter = !!user?.permissions?.is_waiter;
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
  const [table, setTable] = useState(null);                  // { id, name, persons }
  const [waiter, setWaiter] = useState(firstWaiter);
  const [customers, setCustomers] = useState(INITIAL_CUSTOMERS);
  const [customerId, setCustomerId] = useState(DEFAULT_CUSTOMER_ID);
  const [partner, setPartner] = useState("");                // delivery partner id or ""
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [discount, setDiscount] = useState({ mode: "fixed", value: 0 });
  const [charge, setCharge] = useState({ mode: "percent", value: 0 });
  const [chargeTouched, setChargeTouched] = useState(false); // untouched = server default for the order type
  const [tips, setTips] = useState(0);
  const [editingId, setEditingId] = useState(null);          // running order id being modified

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
  const [isFull, setIsFull] = useState(false);
  const [prefs, setPrefs] = useState(() => lsGet("pos.prefs", { printKot: false, printInvoice: true }));
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

  const notify = (text) => {
    setToast(text);
    clearTimeout(notify.t);
    notify.t = setTimeout(() => setToast(null), 3200);
  };
  // every failed call goes through here: network -> banner, register closed -> open register, else the server's message
  const onError = useCallback((e, fallback) => {
    if (e?.network) { setOnline(false); notify("No connection to the server. Try again when it is back."); return; }
    if (e?.code === "REGISTER_CLOSED") { setRegisterOpen(false); setModal({ name: "openRegister" }); return; }
    notify(firstError(e) || fallback);
  }, []);
  const ok = useCallback(() => setOnline(true), []);
  const savePrefs = (p) => { setPrefs(p); lsSet("pos.prefs", p); };

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
  useEffect(() => { if (registerOpen === false && !isWaiter) setModal({ name: "openRegister" }); }, []); // eslint-disable-line

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
      tables: t === "dine" && tbl ? [{ table_id: tbl.id, persons: tbl.persons || 1 }] : [],
      sale_date: orderDate,
      discount: amountStr(discount),
      tips: Number(tips) > 0 ? String(Number(tips)) : "",
      items: cart.map((l) => {
        const it = {
          food_menu_id: l.itemId,
          qty: l.qty,
          modifier_ids: l.mods.map((m) => m.id),
          note: l.note || "",
          discount: l.discRaw != null ? l.discRaw : (Number(l.disc) > 0 ? `${Number(l.disc)}%` : ""),
        };
        if (l.lineId) it.line_id = l.lineId;
        if (l.openPrice) it.unit_price = l.price;
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
  }, [cart, orderType, table, waiter, customerId, partner, discount, chargeTouched, chargeTouched && charge, tips, orderDate, editingId]); // eslint-disable-line

  // list prices follow the order type / delivery partner (lines already in the kitchen keep their price)
  useEffect(() => {
    setCart((c) => c.map((l) => (l.lineId || l.openPrice ? l : { ...l, price: priceFor(ITEM_BY_ID[l.itemId], orderType, partner) + comboExtra(ITEM_BY_ID[l.itemId], l.comboSelections, orderType) })));
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
    const { qty = 1, mods = [], note = "", disc = 0, price, comboSelections = [] } = opts;
    const unit = price != null ? Number(price) : priceFor(item, orderType, partner) + comboExtra(item, comboSelections, orderType);
    setCart((c) => {
      const plain = !mods.length && !note && !disc && !item.openPrice && !comboSelections.length;
      if (plain) {
        const i = c.findIndex((l) => l.itemId === item.id && !l.lineId && !l.note && !l.disc && !l.mods.length && !l.openPrice && !l.comboSelections?.length);
        if (i > -1) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
      }
      return [...c, { key: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, itemId: item.id, name: item.name, price: unit, qty, mods, note, disc, openPrice: !!item.openPrice, comboSelections, lineId: null }];
    });
  };
  const onItemClick = (item) => {
    if (item.unavailable) return notify(`${item.name} is not available right now`);
    if (!orderType) return setModal({ name: "orderType", then: { kind: "add", item } });
    if (item.variations.length) return setModal({ name: "variations", item });
    if (item.openPrice || item.comboGroups) return setModal({ name: "item", item });
    addToCart(item);
  };
  const setLineQty = (key, q) => setCart((c) => (q <= 0 ? c.filter((l) => l.key !== key) : c.map((l) => (l.key === key ? { ...l, qty: q } : l))));
  const removeLine = (key) => setCart((c) => c.filter((l) => l.key !== key));

  const resetOrder = () => {
    setCart([]); setOrderType(defaultTypeKey()); setTable(null); setWaiter(firstWaiter()); setCustomerId(DEFAULT_CUSTOMER_ID);
    setPartner(""); setDiscount({ mode: "fixed", value: 0 }); setCharge({ mode: "percent", value: 0 }); setChargeTouched(false);
    setTips(0); setEditingId(null); setOrderDate(new Date().toISOString().slice(0, 10)); setCalc(null); setCalcErr("");
  };

  /* ---------- printing ---------- */
  const print = async (html, what) => {
    try { await printHtml(html); notify(`${what} sent to the printer`); }
    catch (e) { notify(`${what} not printed: ${e.message}`); }
  };
  const printKot = (kot) => { if (kot?.kitchens?.length) print(kotHtml(kot), "KOT"); };
  const printInvoice = (inv) => print(invoiceHtml(inv), `Invoice ${inv.sale_no}`);

  /* ---------- order flow ---------- */
  // action: "place" | "invoice"
  const proceed = (action, type = orderType, tbl = table) => {
    if (!cart.length) return notify("Add at least one item to the order");
    if (!type) return setModal({ name: "orderType", then: { kind: action } });
    if (type === "dine" && !tbl) return setModal({ name: "table", then: { kind: action, type } });
    if (action === "place") return commitOrder(type, tbl);
    if (!canPay) return notify("Waiters can't take payment. Place the order and send it to the cashier.");
    if (editingId) return notify("Update the order first, then use Invoice in Running Orders.");
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
      notify(`Order ${r.order.order_number || r.order.sale_no} ${editingId ? "updated" : "placed"} — sent to the kitchen`);
      if (prefs.printKot && r.kot?.print_needed) printKot(r.kot);
      resetOrder();
      setModal(null);
      setTab("menu");
      setSelectedRunning(r.order.id);
      refreshRunning();
    } catch (e) { onError(e, "The order was not saved."); }
    finally { setBusy(null); }
  };

  // Quick invoice: totals are confirmed by the server before the payment screen opens
  const openQuickPayment = async (type, tbl) => {
    setBusy("calc");
    try {
      const r = await post("/v1/orders/calculate", orderBody(type, tbl));
      setCalc(r);
      setModal({ name: "payment", source: "cart", type, tbl, due: r.totals.total_payable, label: `${ORDER_TYPES[type].label}${tbl ? ` · Table ${tbl.name}` : ""} · ${customer.name}` });
    } catch (e) { onError(e); }
    finally { setBusy(null); }
  };

  const openOrderPayment = async (orderId) => {
    setBusy("calc");
    try {
      const o = await get(`/v1/orders/${orderId}`);
      setModal({ name: "payment", source: "running", orderId, due: o.totals.total_payable, label: `${o.order_type_name}${o.tables_text ? ` · Table ${o.tables_text}` : ""} · ${o.customer?.name || ""}` });
    } catch (e) { onError(e); }
    finally { setBusy(null); }
  };

  const completePayment = async ({ methodId, given }) => {
    if (busy) return;
    const m = modal;
    const method = PAYMENT_METHODS.find((x) => x.id === methodId);
    const due = Number(m.due) || 0;
    const paid = method.cash && Number(given) > due ? Number(given) : due;
    const payBody = { payments: [{ payment_method_id: methodId, amount: Number(paid.toFixed(4)) }] };
    if (method.cash && given !== "") payBody.given_amount = Number(given);
    setBusy("pay");
    try {
      const key = await newKey();
      let invoice;
      if (m.source === "running") {
        invoice = await post(`/v1/orders/${m.orderId}/invoice`, payBody, { idempotencyKey: key });
      } else {
        const r = await post("/v1/invoices/quick", { ...orderBody(m.type, m.tbl), ...payBody }, { idempotencyKey: key });
        invoice = r.invoice;
        if (prefs.printKot && r.kot?.print_needed) printKot(r.kot);
        resetOrder();
      }
      ok();
      if (m.source === "running" && selectedRunning === m.orderId) setSelectedRunning(null);
      refreshRunning();
      setSales((s) => [invoice, ...s.filter((x) => x.id !== invoice.id)]);
      setModal({ name: "done", invoice });
      if (prefs.printInvoice) printInvoice(invoice);
    } catch (e) { onError(e, "Payment was not saved."); }
    finally { setBusy(null); }
  };

  const onOrderTypePicked = (type) => {
    setOrderType(type);
    const then = modal?.then;
    setModal(null);
    if (type !== "dine") setTable(null);
    if (!then) { if (type === "dine") setModal({ name: "table" }); return; }
    if (then.kind === "add") {
      if (then.item.variations.length) return setModal({ name: "variations", item: then.item });
      if (then.item.openPrice || then.item.comboGroups) return setModal({ name: "item", item: then.item });
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
    return [o.sale_no, o.order_number, o.tables_text, o.waiter?.name, o.customer?.name].some((v) => String(v || "").toLowerCase().includes(q));
  });

  // load a running order into the cart to change it (Modify Order)
  const modifyOrder = async () => {
    if (!sel) return;
    if (cart.length && !editingId && !window.confirm("Replace the items in the current order with this running order?")) return;
    setBusy("load");
    try {
      const o = await get(`/v1/orders/${sel.id}`);
      setCart(o.items.filter((l) => !l.is_free).map((l) => {
        const d = parseAmount(l.discount);
        return {
          key: `line-${l.line_id}`, lineId: l.line_id, itemId: l.food_menu_id, name: l.name, price: Number(l.unit_price) || 0, qty: Number(l.qty) || 1,
          mods: (l.modifiers || []).map((x) => ({ id: x.id, name: x.name, price: Number(x.price) || 0 })), note: l.note || "",
          disc: d.mode === "percent" ? d.value : 0, discRaw: d.mode === "fixed" && d.value ? String(d.value) : null,
          openPrice: false, comboSelections: [], cooking: l.cooking_status,
        };
      }));
      setOrderType(TYPE_KEY[o.order_type] || "take");
      setTable(o.tables?.[0] ? { id: o.tables[0].table_id, name: o.tables.map((t) => t.name).join(", "), persons: o.tables[0].persons } : null);
      setWaiter(o.waiter?.id || firstWaiter());
      if (o.customer && !customers.some((c) => c.id === o.customer.id)) setCustomers((cs) => [...cs, { id: o.customer.id, name: o.customer.name, phone: o.customer.phone || "" }]);
      setCustomerId(o.customer?.id || DEFAULT_CUSTOMER_ID);
      setPartner(o.delivery_partner?.id ? String(o.delivery_partner.id) : "");
      setDiscount(parseAmount(o.totals?.discount));
      setCharge(parseAmount(o.totals?.charge)); setChargeTouched(true);
      setTips(Number(o.totals?.tips) || 0);
      setOrderDate(o.sale_date || new Date().toISOString().slice(0, 10));
      setEditingId(o.id); setDrawer(false); setTab("order");
      notify(`Editing order ${o.order_number || o.sale_no}`);
    } catch (e) { onError(e); }
    finally { setBusy(null); }
  };
  const cancelRunning = async () => {
    if (!sel) return;
    const reason = window.prompt(`Cancel order ${sel.order_number || sel.sale_no}? Enter the reason:`);
    if (reason === null) return;
    if (!reason.trim()) return notify("A reason is required to cancel an order");
    try {
      await post(`/v1/orders/${sel.id}/cancel`, { reason: reason.trim() });
      if (editingId === sel.id) resetOrder();
      setSelectedRunning(null);
      notify(`Order ${sel.order_number || sel.sale_no} cancelled`);
      refreshRunning();
    } catch (e) { onError(e); }
  };
  const reprintKot = async (id) => {
    try { printKot(await get(`/v1/orders/${id}/kot?full=1`)); } catch (e) { onError(e); }
  };
  const printBill = async (id) => {
    try {
      const r = await post(`/v1/orders/${id}/bill`);
      print(invoiceHtml({ ...r.order, print: { outlet: r.outlet, invoice: r.invoice, currency: OUTLET.currency, tax_title: SETTINGS.tax_title } }, { bill: true }), "Bill");
      refreshRunning();
    } catch (e) { onError(e); }
  };

  /* ---------- drafts ---------- */
  const saveDraft = async () => {
    if (!cart.length) return notify("Nothing to save — the order is empty");
    if (editingId) return notify("This is a running order. Use Update Order to save changes.");
    try {
      await post("/v1/drafts", orderBody(), { idempotencyKey: await newKey() });
      resetOrder(); refreshDrafts();
      notify("Order saved as draft");
    } catch (e) { onError(e); }
  };
  const restoreDraft = async (d) => {
    if (cart.length && !window.confirm("Replace the current order with this draft?")) return;
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
          qty: Number(l.qty) || 1, mods: (l.modifier_ids || []).map((id) => it.modifiers.find((m) => m.id === id)).filter(Boolean),
          note: l.note || "", disc: dd.mode === "percent" ? dd.value : 0, discRaw: dd.mode === "fixed" && dd.value ? String(dd.value) : null,
          openPrice: it.openPrice, comboSelections: [], lineId: null,
        });
      });
      setCart(lines);
      setOrderType(TYPE_KEY[o.order_type] || "take");
      setTable(o.tables?.[0] ? { id: o.tables[0].table_id, name: `#${o.tables[0].table_id}`, persons: o.tables[0].persons } : null);
      setWaiter(o.waiter_id || firstWaiter());
      setCustomerId(o.customer_id || DEFAULT_CUSTOMER_ID);
      setPartner(o.delivery_partner_id ? String(o.delivery_partner_id) : "");
      setDiscount(parseAmount(o.discount)); setTips(Number(o.tips) || 0);
      if (o.charge) { setCharge(parseAmount(o.charge)); setChargeTouched(true); }
      await del(`/v1/drafts/${d.id}`);
      refreshDrafts();
      setModal(null); setTab("order"); notify("Draft restored");
    } catch (e) { onError(e); }
  };

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => notify("Full screen isn't available here"));
  };

  /* ---------- header actions ---------- */
  const unread = notifications.filter((n) => !seenNotif.has(n.id)).length;
  const markSeen = () => { const s = new Set([...seenNotif, ...notifications.map((n) => n.id)]); setSeenNotif(s); lsSet("pos.seenNotif", [...s].slice(-300)); };
  const openRecent = async () => { setModal({ name: "recent" }); try { setSales(await get("/v1/invoices?limit=50")); } catch (e) { onError(e); } };
  const printLast = async () => {
    try {
      const list = sales.length ? sales : await get("/v1/invoices?limit=1");
      if (!list[0]) return notify("No invoice to print");
      printInvoice(await get(`/v1/invoices/${list[0].id}`));
    } catch (e) { onError(e); }
  };
  const HEADER = [
    { id: "logout", label: "Log out", icon: LogOut, cls: "", on: () => window.confirm("Log out of the POS?") && onLogout() },
    { id: "drafts", label: "Open drafts", icon: FolderOpen, cls: "", badge: drafts.length, on: () => { setModal({ name: "drafts" }); refreshDrafts(); } },
    ...(canPay ? [{ id: "print", label: "Print last invoice", icon: Printer, cls: "opt-sm", on: printLast }] : []),
    ...(canPay ? [{ id: "recent", label: "Recent sales", icon: History, cls: "", on: openRecent }] : []),
    { id: "notif", label: "Kitchen notifications", icon: Bell, cls: "", badge: unread, on: () => { setModal({ name: "notifications" }); markSeen(); refreshNotifications(); } },
    ...(!isWaiter ? [{ id: "register", label: "Register details", icon: Wallet, cls: "opt-sm", on: () => setModal({ name: registerOpen === false ? "openRegister" : "register" }) }] : []),
    { id: "refresh", label: "Refresh menu and orders", icon: RefreshCw, cls: "opt-md", on: () => { refreshRunning(); notify("Running orders refreshed"); } },
  ];

  const kitchenTag = (o) => (o.bill_printed ? ["bill", "Bill printed"] : KITCHEN_TAG[o.kitchen?.status] || ["", o.status]);
  const busyCls = (name) => (busy === name ? { opacity: 0.6, pointerEvents: "none" } : {});

  /* ============================================================================
     RENDER
     ========================================================================== */
  return (
    <div className="pos">
      <style>{CSS}</style>
      <style>{CSS_ONLINE}</style>

      {!online && <div className="conn" role="alert"><WifiOff size={16} />No connection to the server. Orders and payments will work again as soon as it is back.</div>}

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
        <div className="who" style={{ marginLeft: "auto" }}><b>{user?.name || ""}</b><span>{user?.device || ""}</span></div>
        <div className="brand" style={{ marginLeft: 0 }}>{OUTLET.name}</div>
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
              <button className="icon-btn" onClick={() => { refreshRunning(); notify("Running orders refreshed"); }} aria-label="Refresh" title="Refresh"><RefreshCw size={17} /></button>
              <button className="icon-btn only-drawer" onClick={() => setDrawer(false)} aria-label="Close"><X size={18} /></button>
            </div>
          </div>
          <div style={{ padding: "0 10px" }}>
            <input className="input" placeholder="Table, order number, waiter" value={roQuery} onChange={(e) => setRoQuery(e.target.value)} />
          </div>
          <div className="ro-list">
            {filteredRunning.length === 0 && <div className="ro-empty">{running.length ? "No orders match your search." : "No running orders. Placed orders will appear here."}</div>}
            {filteredRunning.map((o) => {
              const TI = ORDER_TYPES[TYPE_KEY[o.order_type]]?.icon || ShoppingBag;
              const [tagCls, tagTxt] = kitchenTag(o);
              return (
                <button key={o.id} className="ro-card" aria-pressed={selectedRunning === o.id} onClick={() => setSelectedRunning(o.id === selectedRunning ? null : o.id)} onDoubleClick={() => setModal({ name: "details", id: o.id })}>
                  <div className="row"><b className="num">#{o.order_number || o.sale_no}</b><span className={`tag ${tagCls}`}>{tagTxt}</span></div>
                  <div className="row muted"><span style={{ display: "flex", alignItems: "center", gap: 4 }}><TI size={13} />{o.order_type === 1 && o.tables_text ? `Table ${o.tables_text}` : o.order_type_name}</span></div>
                  <div className="row muted"><span>{o.customer?.name}</span><span>{o.waiter?.name}</span></div>
                  <div className="row"><span className="muted" style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} />{timeAgo(o.minutes_open ?? o.date_time)}</span><b className="num" style={{ fontSize: 13 }}>{money(o.total_payable)}</b></div>
                  {editingId === o.id && <span className="tag" style={{ background: "#FFF1D6", color: "#7A4F00", justifySelf: "start" }}>Editing</span>}
                </button>
              );
            })}
          </div>
          <div className="ro-actions">
            <button className="op-btn" disabled={!sel || !!busy} onClick={modifyOrder}><Edit3 size={14} />Modify Order</button>
            <button className="op-btn" disabled={!sel} onClick={() => setModal({ name: "details", id: sel.id })}><Info size={14} />Order Details</button>
            <button className="op-btn" disabled={!sel} onClick={() => reprintKot(sel.id)}><Printer size={14} />Re-print KOT</button>
            <button className="op-btn half" disabled={!sel || !canPay || !!busy} onClick={() => openOrderPayment(sel.id)}><Receipt size={14} />Invoice</button>
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
            <select className="select" value={waiter} onChange={(e) => setWaiter(Number(e.target.value) || "")} aria-label="Waiter">
              {!WAITERS.length && <option value="">No waiters</option>}
              {WAITERS.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <select className="select" value={customerId} onChange={(e) => setCustomerId(Number(e.target.value))} aria-label="Customer">
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>)}
            </select>
            <select className="select sel-partner" value={partner} onChange={(e) => setPartner(e.target.value)} disabled={orderType !== "delivery"} aria-label="Delivery partner" title={orderType !== "delivery" ? "Select Delivery to choose a partner" : ""}>
              <option value="">Delivery Partner</option>
              {PARTNERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="sel-actions">
              <button className="sq-btn" title="Edit customer" aria-label="Edit customer" disabled={customer.id === DEFAULT_CUSTOMER_ID} style={customer.id === DEFAULT_CUSTOMER_ID ? { opacity: .45 } : {}} onClick={() => setModal({ name: "customer", edit: customer })}><Pencil size={16} /></button>
              <button className="sq-btn" title="Add customer" aria-label="Add customer" onClick={() => setModal({ name: "customer" })}><UserPlus size={16} /></button>
            </div>
          </div>

          {editingId && (
            <div className="edit-banner">
              <span>Editing order #{running.find((o) => o.id === editingId)?.order_number || editingId}. Press Update Order to save and send changes to the kitchen.</span>
              <button onClick={() => { resetOrder(); notify("Changes discarded"); }}>Discard</button>
            </div>
          )}
          {(orderType || cart.length > 0) && (
            <div className="context-line">
              {orderType && <span>Type: <b>{ORDER_TYPES[orderType].label}</b></span>}
              {table && <span>Table: <b>{table.name}</b> · {table.persons} guests</span>}
              {orderType === "delivery" && partner && <span>Partner: <b>{PARTNERS.find((p) => String(p.id) === String(partner))?.name}</b></span>}
              <span>Items: <b className="num">{itemCount}</b></span>
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
                    {showImages && (() => { const it = ITEM_BY_ID[l.itemId]; return it ? <ItemThumb item={it} size="sm" tint={catById[it.cat]?.tint} /> : null; })()}
                    <span className="txt">{l.name}
                      {(l.mods.length > 0 || l.note || l.disc > 0 || l.discRaw || l.cooking) && (
                        <small>{[...l.mods.map((m) => m.name), l.disc > 0 ? `${l.disc}% off` : "", l.discRaw ? `${l.discRaw} off` : "", l.note ? `“${l.note}”` : "", l.cooking && l.cooking !== "New" ? l.cooking : ""].filter(Boolean).join(", ")}</small>
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

          {calcErr && cart.length > 0 && <div className="calc-msg" role="alert">{calcErr}</div>}
          <div className="total-bar">
            <button className="icon-btn" style={{ color: "var(--ink2)" }} onClick={() => setDatePop((v) => !v)} title="Order date" aria-label="Order date"><CalendarDays size={19} /></button>
            <button className="icon-btn" style={{ color: "var(--ink2)" }} onClick={() => setModal({ name: "summary" })} title="Discount, VAT, charges and tips" aria-label="Order summary"><Eye size={19} /></button>
            <span className="lbl">Total Payable:</span>
            <span className="amount num">{cart.length ? (totals ? money(totals.total_payable) : "—") : money(0)}</span>
            {calcBusy && <Loader2 size={16} className="spin" aria-label="Calculating" />}
            {datePop && (
              <div className="date-pop">
                Order date
                <input type="date" className="input" value={orderDate} onChange={(e) => { setOrderDate(e.target.value); setDatePop(false); }} />
              </div>
            )}
          </div>

          <div className="act-row">
            <button className="act cancel" onClick={() => { if (!cart.length && !editingId) return resetOrder(); if (window.confirm(editingId ? "Discard changes to this order?" : "Clear the current order?")) { resetOrder(); notify("Order cleared"); } }}><X size={17} />Cancel</button>
            <button className="act quick" disabled={!canPay || !!busy || !!editingId} style={busyCls("calc")} onClick={() => proceed("invoice")} title={!canPay ? "Waiters can't take payment" : editingId ? "Update the order first" : ""}><Receipt size={17} />Quick Invoice</button>
            <button className="act place" disabled={!!busy} style={busyCls("place")} onClick={() => proceed("place")}>{busy === "place" ? <Loader2 size={17} className="spin" /> : <ChefHat size={17} />}{editingId ? "Update Order" : "Place Order"}</button>
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
              {visibleItems.length === 0 && <div className="no-items">{ITEMS.length ? "No items match. Clear the search or filters to see the full menu." : "No items on the menu for this outlet yet."}</div>}
              {visibleItems.map((it) => {
                const tint = catById[it.cat]?.tint;
                const priceTxt = it.openPrice ? "Open price" : `${it.variations.length ? "From " : ""}${money(shownPrice(it))}`;
                return (
                  <button key={it.id} className={`item ${showImages ? "has-img" : ""}`} style={{ background: tint, opacity: it.unavailable ? 0.5 : 1 }} onClick={() => onItemClick(it)}
                    onContextMenu={(e) => { e.preventDefault(); if (!orderType || it.variations.length) return onItemClick(it); setModal({ name: "item", item: it }); }} title={`${it.code} · right-click or long-press for options`}>
                    <span className="marks">{it.veg && <span className="vegmark" title="Vegetarian" />}{it.combo && <span className="mini c">COMBO</span>}{it.promo && <span className="mini p">PROMO</span>}</span>
                    {qtyById[it.id] > 0 && <span className="inq num">{qtyById[it.id]}</span>}
                    {showImages ? (
                      <>
                        <ItemThumb item={it} tint={tint} />
                        <span className="body">
                          <span className="nm">{it.name}</span>
                          <span className="pr num"><span>Price: </span>{priceTxt}</span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="nm">{it.name}</span>
                        <span className="pr num"><span>Price: </span>{priceTxt}</span>
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
      <nav className="mob-tabs" aria-label="Switch panel">
        <button aria-pressed={tab === "menu"} onClick={() => setTab("menu")}><LayoutGrid size={18} />Menu</button>
        <button aria-pressed={tab === "order"} onClick={() => setTab("order")}><ShoppingCart size={18} />Order ({itemCount}) · <span className="num">{totals ? money(totals.total_payable) : "—"}</span></button>
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
              <div className="setting-row"><span style={{ display: "flex", gap: 8, alignItems: "center" }}><Settings2 size={16} />Print KOT after placing an order</span>
                <input type="checkbox" checked={!!prefs.printKot} onChange={(e) => savePrefs({ ...prefs, printKot: e.target.checked })} /></div>
              <div className="setting-row"><span style={{ display: "flex", gap: 8, alignItems: "center" }}><Settings2 size={16} />Print invoice after payment</span>
                <input type="checkbox" checked={!!prefs.printInvoice} onChange={(e) => savePrefs({ ...prefs, printInvoice: e.target.checked })} /></div>
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

      {modal?.name === "table" && <TableModal editingId={editingId} current={table} onClose={() => setModal(null)} onPick={onTablePicked} onError={onError} />}

      {modal?.name === "variations" && (
        <Modal title={modal.item.name} onClose={() => setModal(null)} size="sm">
          <div className="var-list">
            {modal.item.variations.map((v) => (
              <button key={v.id} className="var-row" disabled={v.unavailable} style={v.unavailable ? { opacity: 0.5 } : {}} onClick={() => {
                if (v.openPrice || v.comboGroups) return setModal({ name: "item", item: v });
                addToCart(v); setModal(null);
              }}>
                <span>{v.shortName}</span><span className="num">{v.openPrice ? "Open price" : money(priceFor(v, orderType, partner))}</span>
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
            onSave={(data) => {
              if (modal.line) setCart((c) => c.map((l) => (l.key === modal.line.key ? { ...l, ...data } : l)));
              else addToCart(item, data);
              setModal(null);
            }}
            onRemove={modal.line ? () => { removeLine(modal.line.key); setModal(null); } : null}
          />
        );
      })()}

      {modal?.name === "summary" && (
        <Modal title="Order summary" onClose={() => setModal(null)} size="sm" footer={<button className="btn primary" onClick={() => setModal(null)}>Done</button>}>
          <div className="sum-row"><span>Total items</span><span className="num">{itemCount}</span></div>
          <div className="sum-row"><span>Subtotal</span><span className="num">{totals ? money(totals.sub_total) : "—"}</span></div>
          <div className="sum-row"><span>Discount</span>
            <div className="inline-edit">
              <input className="input num" type="number" min="0" value={discount.value} onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value }))} aria-label="Discount value" />
              <select className="select" value={discount.mode} onChange={(e) => setDiscount((d) => ({ ...d, mode: e.target.value }))} aria-label="Discount type"><option value="fixed">{OUTLET.currency}</option><option value="percent">%</option></select>
              <span className="num" style={{ minWidth: 60, textAlign: "right" }}>-{totals ? money(totals.total_discount_amount) : "—"}</span>
            </div>
          </div>
          <div className="sum-row"><span>{orderType === "delivery" ? "Delivery charge" : "Service charge"}</span>
            <div className="inline-edit">
              <input className="input num" type="number" min="0" value={charge.value} onChange={(e) => { setChargeTouched(true); setCharge((c) => ({ ...c, value: e.target.value })); }} aria-label="Charge value" />
              <select className="select" value={charge.mode} onChange={(e) => { setChargeTouched(true); setCharge((c) => ({ ...c, mode: e.target.value })); }} aria-label="Charge type"><option value="fixed">{OUTLET.currency}</option><option value="percent">%</option></select>
              <span className="num" style={{ minWidth: 60, textAlign: "right" }}>{totals ? money(totals.charge_amount) : "—"}</span>
            </div>
          </div>
          <div className="sum-row"><span>Tips</span>
            <div className="inline-edit"><input className="input num" type="number" min="0" value={tips} onChange={(e) => setTips(e.target.value)} aria-label="Tips" /><span className="num" style={{ minWidth: 60, textAlign: "right" }}>{totals ? money(totals.tips_amount) : "—"}</span></div>
          </div>
          {(totals?.taxes || []).map((t, i) => (
            <div key={i} className="sum-row"><span>{t.tax_field_type}</span><span className="num">{money(t.tax_field_amount)}</span></div>
          ))}
          {Number(totals?.rounding_amount) !== 0 && totals && <div className="sum-row"><span>Rounding</span><span className="num">{money(totals.rounding_amount)}</span></div>}
          <div className="sum-row total"><span>Total payable</span><span className="num">{OUTLET.currency} {totals ? money(totals.total_payable) : "—"}</span></div>
          {calcErr && <div className="calc-msg" style={{ margin: "8px 0 0" }}>{calcErr}</div>}
        </Modal>
      )}

      {modal?.name === "payment" && (
        <PaymentModal due={modal.due} label={modal.label} busy={busy === "pay"} onClose={() => !busy && setModal(null)} onPay={completePayment} />
      )}

      {modal?.name === "done" && (() => {
        const inv = modal.invoice;
        const z = inv.zatca || {};
        return (
          <Modal title="Payment received" onClose={() => setModal(null)} size="sm"
            footer={<><button className="btn" onClick={() => printInvoice(inv)}><Printer size={16} />Print invoice</button><button className="btn primary" onClick={() => setModal(null)}>New order</button></>}>
            <div className="done-box">
              <div className="muted">Invoice</div>
              <div className="big num">{inv.sale_no}</div>
              <div className="sum-row"><span>Total</span><span className="num">{OUTLET.currency} {money(inv.totals?.total_payable)}</span></div>
              {Number(inv.totals?.change_amount) > 0 && <div className="sum-row"><span>Change to return</span><span className="num" style={{ fontSize: 18 }}>{money(inv.totals.change_amount)}</span></div>}
              {Number(inv.totals?.due_amount) > 0 && <div className="sum-row"><span>Due</span><span className="num">{money(inv.totals.due_amount)}</span></div>}
              {z.phase === "2" && (z.synced || z.reported
                ? <div className="zatca ok"><ShieldCheck size={18} />Reported to ZATCA</div>
                : <div className="zatca warn"><ShieldAlert size={18} />Not reported to ZATCA yet. {z.message || "Use “Sync ZATCA” in the web POS."}</div>)}
            </div>
          </Modal>
        );
      })()}

      {modal?.name === "customer" && (
        <CustomerModal edit={modal.edit} onClose={() => setModal(null)} onSave={async (c) => {
          try {
            const body = { name: c.name, phone: c.phone || "", email: c.email || "", address: c.address || "" };
            const saved = modal.edit ? await put(`/v1/customers/${c.id}`, body) : await post("/v1/customers", body);
            const row = { id: saved.id, name: saved.name, phone: saved.phone || "", email: saved.email || "", address: saved.address || "" };
            setCustomers((cs) => (modal.edit ? cs.map((x) => (x.id === row.id ? row : x)) : [...cs, row]));
            setCustomerId(row.id);
            notify(modal.edit ? "Customer updated" : `${row.name} added and selected`);
            setModal(null);
          } catch (e) { onError(e); }
        }} />
      )}

      {modal?.name === "details" && <OrderDetails id={modal.id} canPay={canPay} onClose={() => setModal(null)} onError={onError}
        onKot={() => reprintKot(modal.id)} onBill={() => printBill(modal.id)} onInvoice={() => openOrderPayment(modal.id)} />}

      {modal?.name === "drafts" && (
        <Modal title="Drafts" onClose={() => setModal(null)}>
          {drafts.length === 0 ? <p className="muted">No drafts yet. Use Draft in the running orders panel to park an order and come back to it.</p> : (
            <div className="list">
              {drafts.map((d) => (
                <div key={d.id} className="list-row">
                  <span><b>{d.customer?.name || "Customer"}</b><div className="muted" style={{ fontSize: 12 }}>{d.total_items} items · {d.name} · {d.saved_at}</div></span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}><b className="num">{money(d.total_payable)}</b>
                    <button className="btn primary" onClick={() => restoreDraft(d)}>Restore</button>
                    <button className="btn" onClick={async () => { try { await del(`/v1/drafts/${d.id}`); refreshDrafts(); } catch (e) { onError(e); } }} aria-label="Delete draft"><Trash2 size={16} /></button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {modal?.name === "recent" && (
        <Modal title="Recent sales" onClose={() => setModal(null)} size="lg">
          {sales.length === 0 ? <p className="muted">No sales yet today.</p> : (
            <div className="list">
              {sales.map((s) => (
                <div key={s.id} className="list-row">
                  <span><b className="num">{s.sale_no}</b> · {s.order_type_name} · {s.customer?.name}<div className="muted" style={{ fontSize: 12 }}>{s.cashier ? `${s.cashier} · ` : ""}{s.date_time}</div></span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}><b className="num">{OUTLET.currency} {money(s.total_payable ?? s.totals?.total_payable)}</b>
                    <button className="btn" onClick={async () => { try { printInvoice(await get(`/v1/invoices/${s.id}`)); } catch (e) { onError(e); } }}><Printer size={16} />Print</button></span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {modal?.name === "notifications" && (
        <Modal title="Kitchen notifications" onClose={() => setModal(null)}
          footer={notifications.length > 0 && <button className="btn" onClick={async () => { try { await del("/v1/notifications", { ids: notifications.map((n) => n.id) }); setNotifications([]); } catch (e) { onError(e); } }}>Clear all</button>}>
          {notifications.length === 0 ? <p className="muted">You're all caught up.</p> : (
            <div className="list">
              {notifications.map((n) => (
                <div key={n.id} className="list-row">
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>{/ready/i.test(n.message) ? <Check size={18} color="var(--ok)" /> : <ChefHat size={18} color="var(--amber)" />}<span>{n.message}</span></span>
                  <button className="btn" onClick={async () => { try { await del(`/v1/notifications/${n.id}`); setNotifications((x) => x.filter((y) => y.id !== n.id)); } catch (e) { onError(e); } }}>Dismiss</button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {modal?.name === "openRegister" && (
        <OpenRegisterModal onClose={() => setModal(null)} onError={onError}
          onOpened={() => { setRegisterOpen(true); setModal(null); notify("Register opened"); }} />
      )}

      {modal?.name === "register" && (
        <RegisterModal onClose={() => setModal(null)} onError={onError} print={print}
          onClosed={() => { setRegisterOpen(false); setModal(null); notify("Register closed"); }} />
      )}

      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  );
}


/* ============================================================================
   MODAL COMPONENTS
   ========================================================================== */

// Tables come live from the server (seats taken by running orders on any till / the web POS).
function TableModal({ editingId, current, onClose, onPick, onError }) {
  const [data, setData] = useState(null);
  const [area, setArea] = useState(null);
  const [picked, setPicked] = useState(current ? { id: current.id, name: current.name } : null);
  const [persons, setPersons] = useState(current?.persons || 2);

  useEffect(() => {
    let alive = true;
    get("/v1/tables").then((r) => {
      if (!alive) return;
      // seats of the order being edited are free for that order
      const tables = (r.tables || []).map((t) => {
        const mine = (t.orders || []).filter((o) => o.order_id === editingId).reduce((s, o) => s + (Number(o.persons) || 0), 0);
        const used = Math.max(0, (Number(t.persons) || 0) - mine);
        return { ...t, used, free: t.capacity > 0 ? Math.max(0, t.capacity - used) : null };
      });
      const areas = (r.areas || []).filter((a) => tables.some((t) => t.area_id === a.id));
      if (tables.some((t) => !areas.some((a) => a.id === t.area_id))) areas.push({ id: "other", name: areas.length ? "Other" : "All tables" });
      setData({ areas, tables });
      const cur = current && tables.find((t) => t.id === current.id);
      setArea(cur ? (areas.some((a) => a.id === cur.area_id) ? cur.area_id : "other") : areas[0]?.id ?? null);
    }).catch((e) => { onError(e); onClose(); });
    return () => { alive = false; };
  }, []); // eslint-disable-line

  const inArea = (t) => (area === "other" ? !data.areas.some((a) => a.id === t.area_id && a.id !== "other") : t.area_id === area);
  const pickedRow = data?.tables.find((t) => t.id === picked?.id);
  const tooMany = pickedRow && pickedRow.free !== null && persons > pickedRow.free;

  return (
    <Modal title="Select a table" size="lg" onClose={onClose}
      footer={<>
        <span style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: 10, fontWeight: 700 }}><Users size={18} />Guests <Qty value={persons} onChange={(v) => setPersons(Math.max(1, v))} /></span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!pickedRow || tooMany} onClick={() => onPick({ id: pickedRow.id, name: pickedRow.name, persons })}>Select table</button>
      </>}>
      {!data ? <p className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={16} className="spin" />Loading tables…</p> : <>
        {data.areas.length > 1 && (
          <div className="seg" role="tablist">
            {data.areas.map((a) => <button key={a.id} aria-pressed={area === a.id} onClick={() => setArea(a.id)}>{a.name}</button>)}
          </div>
        )}
        {data.tables.length === 0 && <p className="muted">No tables are set up for this outlet.</p>}
        <div className="tables">
          {data.tables.filter(inArea).map((t) => (
            <button key={t.id} className={`tbl ${t.used ? "busy" : ""}`} aria-pressed={picked?.id === t.id} onClick={() => setPicked(t)}>
              <b>{t.name}</b>
              <span className="muted" style={{ fontSize: 12 }}>{t.capacity} seats</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: t.used ? "#9A6400" : "var(--ok)" }}>{t.used ? `${t.free ?? 0} free` : "Available"}</span>
            </button>
          ))}
        </div>
        {tooMany && <div style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600, marginTop: 8 }}>Only {pickedRow.free} seats are free at {pickedRow.name}.</div>}
      </>}
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
  const [combo, setCombo] = useState(() => line?.comboSelections?.length ? line.comboSelections
    : (item.comboGroups || []).map((g) => g.options[0]?.food_menu_id).filter(Boolean));

  const kitchenLine = !!line?.lineId;   // already sent to the kitchen: price stays as ordered
  const price = item.openPrice ? Number(open) || 0 : kitchenLine ? line.price : basePrice + comboExtra(item, combo, orderType);
  const unit = price + mods.reduce((s, m) => s + m.price, 0);
  const toggle = (m) => setMods((ms) => (ms.some((x) => x.id === m.id) ? ms.filter((x) => x.id !== m.id) : [...ms, m]));
  const pickCombo = (g, id) => setCombo((c) => [...c.filter((x) => !g.options.some((o) => o.food_menu_id === x)), id]);
  const needPrice = item.openPrice && !(Number(open) > 0);

  return (
    <Modal title={item.name} onClose={onClose}
      footer={<>
        {onRemove && <button className="btn" style={{ marginRight: "auto", color: "var(--danger)" }} onClick={onRemove}><Trash2 size={16} />Remove</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={needPrice} onClick={() => onSave({
          qty: Math.max(1, qty), mods, disc: Number(disc) || 0, note: note.trim(), price,
          discRaw: Number(disc) > 0 ? null : (line?.discRaw ?? null),
          comboSelections: item.comboGroups ? combo : [],
        })}>
          {line ? "Update item" : "Add to order"} · {money(unit * Math.max(1, qty) * (1 - (Number(disc) || 0) / 100))}
        </button>
      </>}>
      <ItemThumb item={item} size="lg" tint={(CATEGORIES.find((c) => c.id === item.cat) || {}).tint} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span className="muted">{item.code}{item.openPrice ? "" : ` · ${money(price)} each`}</span>
        <Qty big value={qty} onChange={(v) => setQty(Math.max(1, v))} />
      </div>
      {item.openPrice && (
        <label className="field">Price ({OUTLET.currency})
          <input className="input num" type="number" min="0" step="any" autoFocus value={open} onChange={(e) => setOpen(e.target.value)} placeholder="Enter the price" />
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
                <button key={o.food_menu_id} className="mod" disabled={kitchenLine} aria-pressed={combo.includes(o.food_menu_id)} onClick={() => pickCombo(g, o.food_menu_id)}>
                  <span>{o.qty > 1 ? `${o.qty} × ` : ""}{o.name}</span><span className="num">{extra ? `+${money(extra)}` : "Included"}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
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
      {line?.discRaw && !(Number(disc) > 0) && <div className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 8 }}>Current discount: {line.discRaw} {OUTLET.currency}</div>}
      <label className="field"><span style={{ display: "flex", gap: 6, alignItems: "center" }}><StickyNote size={14} />Kitchen note</span>
        <textarea className="input" placeholder="e.g. less spicy, sauce on the side" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Modal>
  );
}

// "due" is the server's total for the order. Cash can be more than due (change is returned).
function PaymentModal({ due: dueIn, label, busy, onClose, onPay }) {
  const [method, setMethod] = useState(PAYMENT_METHODS[0]?.id);
  const [given, setGiven] = useState("");
  const m = PAYMENT_METHODS.find((x) => x.id === method);
  const due = Number(dueIn) || 0;
  const change = Math.max(0, (Number(given) || 0) - due);
  const short = m?.cash && given !== "" && Number(given) < due;
  const quick = [due, ...[10, 20, 50, 100, 200, 500].filter((v) => v > due).slice(0, 4)];
  return (
    <Modal title="Payment" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn ok" disabled={short || !m || busy} onClick={() => onPay({ methodId: method, given: m.cash ? given : "" })}>
          {busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}{busy ? "Saving…" : "Complete sale"}
        </button>
      </>}>
      <div className="pay-due"><span>Amount due</span><span className="num">{OUTLET.currency} {money(due)}</span></div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{label}</div>
      {!PAYMENT_METHODS.length && <p className="muted">No payment methods are set up for this outlet.</p>}
      <div className="pay-methods">
        {PAYMENT_METHODS.map((x) => (
          <button key={x.id} className="pm" aria-pressed={method === x.id} onClick={() => setMethod(x.id)}><x.icon size={24} />{x.name}</button>
        ))}
      </div>
      {m?.cash && <>
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
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => { setSaving(true); try { await onSave({ ...f, name: f.name.trim() }); } finally { setSaving(false); } };
  return (
    <Modal title={edit ? "Edit customer" : "Add customer"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name.trim() || saving} onClick={save}>{edit ? "Save customer" : "Add customer"}</button></>}>
      <label className="field">Name<input className="input" value={f.name} onChange={set("name")} autoFocus /></label>
      <div className="grid2">
        <label className="field">Phone<input className="input" value={f.phone || ""} onChange={set("phone")} /></label>
        <label className="field">Email<input className="input" type="email" value={f.email || ""} onChange={set("email")} /></label>
      </div>
      <label className="field">Delivery address<textarea className="input" value={f.address || ""} onChange={set("address")} /></label>
    </Modal>
  );
}

// Running order details, live from the server (kitchen status per item).
function OrderDetails({ id, canPay, onClose, onError, onKot, onBill, onInvoice }) {
  const [o, setO] = useState(null);
  useEffect(() => { get(`/v1/orders/${id}`).then(setO).catch((e) => { onError(e); onClose(); }); }, [id]); // eslint-disable-line
  const t = o?.totals || {};
  return (
    <Modal title={o ? `Order ${o.order_number || o.sale_no}` : "Order details"} onClose={onClose} size="lg"
      footer={o && <>
        <button className="btn" onClick={onKot}><Printer size={16} />Re-print KOT</button>
        <button className="btn" onClick={onBill}><FileText size={16} />Print bill</button>
        {canPay && <button className="btn primary" onClick={() => { onClose(); onInvoice(); }}><Receipt size={16} />Invoice</button>}
      </>}>
      {!o ? <p className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={16} className="spin" />Loading…</p> : <>
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          {o.order_type_name}{o.tables_text ? ` · Table ${o.tables_text}` : ""} · {o.customer?.name}{o.waiter?.name ? ` · Waiter ${o.waiter.name}` : ""} · {o.date_time}
        </div>
        <div className="list">
          {(o.items || []).map((l, i) => (
            <div key={l.line_id || i} className="list-row">
              <span><b className="num">{l.qty} ×</b> {l.name}{l.is_free ? " (free)" : ""}
                {((l.modifiers || []).length > 0 || l.note) && <div className="muted" style={{ fontSize: 12 }}>{[...(l.modifiers || []).map((m) => m.name), l.note ? `“${l.note}”` : ""].filter(Boolean).join(", ")}</div>}
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {l.cooking_status && <span className={`tag ${/done|ready/i.test(l.cooking_status) ? "ready" : /start|cook/i.test(l.cooking_status) ? "cooking" : "new"}`}>{l.cooking_status}</span>}
                <b className="num">{money(lineAmount(l))}</b>
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="sum-row"><span>Subtotal</span><span className="num">{money(t.sub_total)}</span></div>
          {Number(t.total_discount_amount) > 0 && <div className="sum-row"><span>Discount</span><span className="num">-{money(t.total_discount_amount)}</span></div>}
          {Number(t.charge_amount) > 0 && <div className="sum-row"><span>{t.charge_type === "delivery" ? "Delivery charge" : "Service charge"}</span><span className="num">{money(t.charge_amount)}</span></div>}
          {Number(t.tips_amount) > 0 && <div className="sum-row"><span>Tips</span><span className="num">{money(t.tips_amount)}</span></div>}
          {(t.taxes || []).map((x, i) => <div key={i} className="sum-row"><span>{x.tax_field_type}</span><span className="num">{money(x.tax_field_amount)}</span></div>)}
          <div className="sum-row total"><span>Total payable</span><span className="num">{OUTLET.currency} {money(t.total_payable)}</span></div>
        </div>
      </>}
    </Modal>
  );
}

// Same rule as the web POS: a cashier opens the register with the opening amount per payment method.
function OpenRegisterModal({ onClose, onOpened, onError }) {
  const [methods, setMethods] = useState(null);
  const [amounts, setAmounts] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    get("/v1/register").then((r) => {
      if (r.open) return onOpened();
      setMethods((r.payment_methods || []).filter((m) => !m.is_loyalty));
    }).catch((e) => { onError(e); onClose(); });
  }, []); // eslint-disable-line
  const open = async () => {
    setSaving(true);
    try {
      await post("/v1/register/open", { opening_details: methods.map((m) => ({ payment_method_id: m.id, amount: Number(amounts[m.id]) || 0 })) });
      onOpened();
    } catch (e) { onError(e); }
    finally { setSaving(false); }
  };
  return (
    <Modal title="Open register" onClose={onClose} size="sm"
      footer={<><button className="btn" onClick={onClose}>Later</button><button className="btn primary" disabled={!methods || saving} onClick={open}>{saving ? <Loader2 size={16} className="spin" /> : <Wallet size={16} />}Open register</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>Your register is closed. Enter the opening balance to start taking payments.</p>
      {!methods ? <p className="muted">Loading…</p> : methods.map((m) => (
        <label key={m.id} className="field">{m.name}
          <input className="input num" type="number" min="0" step="any" value={amounts[m.id] ?? ""} placeholder={money(0)} onChange={(e) => setAmounts((a) => ({ ...a, [m.id]: e.target.value }))} />
        </label>
      ))}
    </Modal>
  );
}

function registerHtml(s) {
  const rows = (s.methods || []).map((m) => `<tr><td>${esc(m.name)}</td><td class="r">${money(m.opening)}</td><td class="r">${money(m.sale)}</td><td class="r">${money(m.closing)}</td></tr>`).join("");
  const t = s.totals || {};
  return `<!doctype html><html><head><meta charset="utf-8"><style>${RECEIPT_CSS}</style></head><body>
<h1>${esc(OUTLET.name)}</h1><h2>REGISTER ${s.status === "closed" ? "CLOSED" : "DETAILS"}</h2>
<div class="m">User: ${esc(s.user)}</div><div class="m">Opened: ${esc(s.opened_at || "")}</div>${s.closed_at ? `<div class="m">Closed: ${esc(s.closed_at)}</div>` : ""}
<div class="hr"></div><table><tr class="b"><td>Method</td><td class="r">Open</td><td class="r">Sale</td><td class="r">Close</td></tr>${rows}</table><div class="hr"></div>
<table><tr><td>Opening</td><td class="r">${money(t.opening)}</td></tr><tr><td>Sales</td><td class="r">${money(t.sale)}</td></tr>
${Number(t.due_receive) ? `<tr><td>Due received</td><td class="r">${money(t.due_receive)}</td></tr>` : ""}${Number(t.purchase) ? `<tr><td>Purchase</td><td class="r">-${money(t.purchase)}</td></tr>` : ""}
${Number(t.due_payment) ? `<tr><td>Due payment</td><td class="r">-${money(t.due_payment)}</td></tr>` : ""}${Number(t.expense) ? `<tr><td>Expense</td><td class="r">-${money(t.expense)}</td></tr>` : ""}
${Number(t.refund) ? `<tr><td>Refund (not deducted)</td><td class="r">${money(t.refund)}</td></tr>` : ""}
<tr><td class="big">Closing</td><td class="r big">${esc(OUTLET.currency)} ${money(t.closing)}</td></tr></table></body></html>`;
}

function RegisterModal({ onClose, onClosed, onError, print }) {
  const [s, setS] = useState(null);
  const [closing, setClosing] = useState(false);
  useEffect(() => { get("/v1/register/summary").then(setS).catch((e) => { onError(e); onClose(); }); }, []); // eslint-disable-line
  const close = async () => {
    if (!window.confirm("Close the register? You will need to open it again to take payments.")) return;
    setClosing(true);
    try { const r = await post("/v1/register/close"); print(registerHtml(r), "Register report"); onClosed(); }
    catch (e) { onError(e); }
    finally { setClosing(false); }
  };
  const t = s?.totals || {};
  return (
    <Modal title="Register details" onClose={onClose}
      footer={s && <><button className="btn" onClick={() => print(registerHtml(s), "Register details")}><Printer size={16} />Print</button>
        <button className="btn" style={{ color: "var(--danger)" }} disabled={closing} onClick={close}>{closing ? <Loader2 size={16} className="spin" /> : <Ban size={16} />}Close register</button></>}>
      {!s ? <p className="muted">Loading…</p> : <>
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{s.user} · opened {s.opened_at}</div>
        <div className="list">
          {(s.methods || []).map((m) => (
            <div key={m.payment_method_id} className="list-row"><span><b>{m.name}</b><div className="muted" style={{ fontSize: 12 }}>Opening {money(m.opening)} · Sales {money(m.sale)}</div></span><b className="num">{money(m.closing)}</b></div>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="sum-row"><span>Opening</span><span className="num">{money(t.opening)}</span></div>
          <div className="sum-row"><span>Sales</span><span className="num">{money(t.sale)}</span></div>
          {Number(t.expense) > 0 && <div className="sum-row"><span>Expense</span><span className="num">-{money(t.expense)}</span></div>}
          {Number(t.refund) > 0 && <div className="sum-row"><span>Refund (not deducted)</span><span className="num">{money(t.refund)}</span></div>}
          <div className="sum-row total"><span>Closing balance</span><span className="num">{OUTLET.currency} {money(t.closing)}</span></div>
        </div>
      </>}
    </Modal>
  );
}