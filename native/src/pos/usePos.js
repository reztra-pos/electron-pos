// The POS order logic, ported from the desktop app (src/pages/PosMain.jsx): cart -> order body -> server totals,
// place order (KOT), quick invoice / pay a running order (ZATCA runs on the server, then the invoice prints),
// running orders, reprints. Every amount comes from the server; the app only shows it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { get, post, put, newKey } from '../lib/api';
import { C, ORDER_TYPES, TYPE_KEY, defaultTypeKey, priceFor, comboExtra, needsOptions, isOpenMod } from '../lib/catalog';
import { amountStr, parseAmount, firstError, today } from '../lib/format';
import { runJob } from '../lib/printer';
import { getPref, setPref } from '../lib/storage';
import { RUNNING_POLL_MS } from '../lib/config';
import { useUi } from '../ui';

const hasTables = (t) => Array.isArray(t) && t.length > 0;
export const tblText = (t) => (t || []).map((x) => x.name).join(', ');

export function usePos(user) {
  const { notify, confirm } = useUi();
  const isWaiter = !!user?.permissions?.is_waiter;
  const canPay = !isWaiter || !!user?.permissions?.pos?.pos_1;
  const firstWaiter = () => (isWaiter && C.waiters.some((w) => w.id === user.id) ? user.id : Number(C.settings.default_waiter_id) || C.waiters[0]?.id || '');

  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState(defaultTypeKey);
  const [table, setTable] = useState(null);
  const [waiter, setWaiter] = useState(firstWaiter);
  const [customers, setCustomers] = useState(C.customers);
  const [customerId, setCustomerId] = useState(C.defaultCustomerId);
  const [partner, setPartner] = useState('');
  const [partnerRef, setPartnerRef] = useState('');
  const [discount, setDiscount] = useState({ mode: 'fixed', value: 0 });
  const [charge, setCharge] = useState({ mode: 'percent', value: 0 });
  const [chargeTouched, setChargeTouched] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [calc, setCalc] = useState(null);
  const [calcErr, setCalcErr] = useState('');
  const [calcBusy, setCalcBusy] = useState(false);
  const [running, setRunning] = useState([]);
  const [sales, setSales] = useState([]);
  const [registerOpen, setRegisterOpen] = useState(C.registerOpen);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(null);
  const [modal, setModal] = useState(null);
  const [prefs, setPrefsState] = useState({ printKot: true, printInvoice: true });
  const [zatcaQueue, setZatcaQueue] = useState([]);
  const calcSeq = useRef(0);

  useEffect(() => { getPref('prefs', null).then((p) => p && setPrefsState((x) => ({ ...x, ...p }))); }, []);
  const savePrefs = (p) => { setPrefsState(p); setPref('prefs', p); };
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const customer = customers.find((c) => c.id === Number(customerId)) || customers[0] || { id: C.defaultCustomerId, name: 'Walk-in Customer' };
  const totals = calc?.totals || null;
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);
  const ok = useCallback(() => setOnline(true), []);

  const onError = useCallback((e, fallback) => {
    if (e?.network) { setOnline(false); notify('No connection to the server. Try again when it is back.', 4000, 'danger'); return; }
    if (e?.code === 'REGISTER_CLOSED') { setRegisterOpen(false); setModal(null); return; }
    notify(firstError(e) || fallback, 5000, 'danger');
  }, [notify]);

  /* ---------- live data ---------- */
  const refreshRunning = useCallback(async () => {
    try { setRunning(await get('/v1/orders')); ok(); } catch (e) { if (e?.network) setOnline(false); }
  }, [ok]);
  useEffect(() => {
    refreshRunning();
    const t = setInterval(refreshRunning, RUNNING_POLL_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refreshRunning(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [refreshRunning]);

  const searchCustomers = useCallback(async (q) => {
    try {
      const found = await get(`/v1/customers?search=${encodeURIComponent(q)}&limit=30`);
      setCustomers((cs) => {
        const have = new Set(cs.map((c) => c.id));
        const add = (found || []).filter((c) => !have.has(c.id)).map((c) => ({ id: c.id, name: c.name, phone: c.phone || '' }));
        return add.length ? [...cs, ...add] : cs;
      });
    } catch { /* keep the local matches */ }
  }, []);
  const addCustomer = async (body) => {
    const saved = await post('/v1/customers', body);
    const row = { id: saved.id, name: saved.name, phone: saved.phone || '' };
    setCustomers((cs) => [...cs, row]);
    setCustomerId(row.id);
    return row;
  };

  /* ---------- order body ---------- */
  const orderBody = (type = orderType, tbl = table) => {
    const t = type || 'take';
    const body = {
      order_type: ORDER_TYPES[t].id,
      customer_id: Number(customerId) || C.defaultCustomerId,
      waiter_id: waiter ? Number(waiter) : null,
      delivery_partner_id: t === 'delivery' && partner ? Number(partner) : null,
      delivery_partner_ref_no: t === 'delivery' && partner ? partnerRef.trim() : '',
      tables: t === 'dine' && hasTables(tbl) ? tbl.map((x) => ({ table_id: x.id, persons: Number(x.persons) || 1 })) : [],
      sale_date: today(),
      discount: amountStr(discount),
      tips: '',
      items: cart.map((l) => {
        const it = {
          food_menu_id: l.itemId, qty: l.qty,
          modifier_ids: l.mods.map((m) => (isOpenMod(l.itemId, m.id) ? { id: m.id, price: Number(m.price) || 0 } : m.id)),
          note: l.note || '',
          discount: l.discRaw != null ? l.discRaw : Number(l.disc) > 0 ? `${Number(l.disc)}%` : '',
        };
        if (l.lineId) it.line_id = l.lineId;
        if (l.openPrice) it.unit_price = l.price;
        if (l.priceEdited || l.openPrice) it.custom_price = l.price;
        if (l.comboSelections?.length) it.combo_selections = l.comboSelections;
        return it;
      }),
    };
    if (chargeTouched) body.charge = amountStr(charge);
    return body;
  };

  /* ---------- server totals (debounced) ---------- */
  useEffect(() => {
    if (!cart.length) { setCalc(null); setCalcErr(''); setCalcBusy(false); return undefined; }
    setCalcBusy(true);
    const seq = ++calcSeq.current;
    const t = setTimeout(async () => {
      try {
        const r = await post('/v1/orders/calculate', { ...orderBody(), ...(editingId ? { order_id: editingId } : {}) });
        if (seq !== calcSeq.current) return;
        setCalc(r); setCalcErr(''); ok();
        if (!chargeTouched) setCharge(parseAmount(r.totals?.charge_value));
      } catch (e) {
        if (seq !== calcSeq.current) return;
        if (e?.network) setOnline(false);
        setCalcErr(firstError(e));
      } finally { if (seq === calcSeq.current) setCalcBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [cart, orderType, table, waiter, customerId, partner, partnerRef, discount, chargeTouched, chargeTouched && charge, editingId]); // eslint-disable-line

  // list prices follow the order type / partner (lines already in the kitchen keep their price)
  useEffect(() => {
    setCart((c) => c.map((l) => (l.lineId || l.openPrice || l.priceEdited ? l
      : { ...l, price: priceFor(C.byId[l.itemId], orderType, partner) + comboExtra(C.byId[l.itemId], l.comboSelections, orderType) })));
  }, [orderType, partner]);

  // the server's line for each cart row (promotion discount, free items)
  const srvLines = useMemo(() => {
    const out = [];
    let cur = null;
    for (const it of calc?.items || []) {
      if (it.is_free) { if (cur) cur.free.push(it); } else { cur = { ...it, free: [] }; out.push(cur); }
    }
    return out;
  }, [calc]);
  const srvFor = (i) => { const sl = srvLines[i]; return sl && cart[i] && Number(sl.food_menu_id) === Number(cart[i].itemId) && Number(sl.qty) === Number(cart[i].qty) ? sl : null; };

  /* ---------- cart ---------- */
  const addToCart = (item, opts = {}) => {
    const { qty = 1, mods = [], note = '', disc = 0, discRaw = null, price, comboSelections = [], priceEdited = false } = opts;
    const unit = price != null ? Number(price) : priceFor(item, orderType, partner) + comboExtra(item, comboSelections, orderType);
    setCart((c) => {
      const plain = !mods.length && !note && !disc && !discRaw && !item.openPrice && !comboSelections.length && !priceEdited;
      if (plain) {
        const i = c.findIndex((l) => l.itemId === item.id && !l.lineId && !l.note && !l.disc && !l.discRaw && !l.mods.length && !l.openPrice && !l.comboSelections?.length && !l.priceEdited);
        if (i > -1) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
      }
      return [...c, { key: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, itemId: item.id, name: item.name, price: unit, qty, mods, note, disc, discRaw, openPrice: !!item.openPrice, comboSelections, lineId: null, priceEdited }];
    });
  };
  const updateLine = (key, patch) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setLineQty = (key, q) => setCart((c) => (q <= 0 ? c.filter((l) => l.key !== key) : c.map((l) => (l.key === key ? { ...l, qty: q } : l))));
  const removeLine = (key) => setCart((c) => c.filter((l) => l.key !== key));

  const onItemPress = (item) => {
    if (item.unavailable) return notify(`${item.name} is not available right now`);
    if (!orderType) return setModal({ name: 'orderType', then: { kind: 'add', item } });
    if (item.variations.length) return setModal({ name: 'variations', item });
    if (needsOptions(item)) return setModal({ name: 'item', item });
    return addToCart(item);
  };

  const resetOrder = () => {
    setCart([]); setOrderType(defaultTypeKey()); setTable(null); setWaiter(firstWaiter()); setCustomerId(C.defaultCustomerId);
    setPartner(''); setPartnerRef(''); setDiscount({ mode: 'fixed', value: 0 }); setCharge({ mode: 'percent', value: 0 }); setChargeTouched(false);
    setEditingId(null); setCalc(null); setCalcErr('');
  };

  const pickOrderType = (type, then = modal?.then) => {
    setOrderType(type);
    setModal(null);
    if (type !== 'dine') setTable(null);
    if (type !== 'delivery') { setPartner(''); setPartnerRef(''); }
    const askTable = type === 'dine' && !hasTables(table) && !C.outlet.noTableAsk;
    if (!then) { if (askTable) setModal({ name: 'table' }); else if (type === 'delivery') setModal({ name: 'partner' }); return; }
    if (then.kind === 'add') {
      if (then.item.variations.length) return setModal({ name: 'variations', item: then.item });
      if (needsOptions(then.item)) return setModal({ name: 'item', item: then.item });
      addToCart(then.item);
      if (askTable) setModal({ name: 'table' });
      else if (type === 'delivery' && !partner) setModal({ name: 'partner' });
    } else proceed(then.kind, type, table);
  };
  const pickTables = (tbl) => {
    setTable(tbl && tbl.length ? tbl : null); setOrderType('dine');
    const then = modal?.then;
    setModal(null);
    if (then && (then.kind === 'place' || then.kind === 'invoice')) proceed(then.kind, 'dine', tbl);
  };

  /* ---------- printing ---------- */
  const printJob = async (job) => {
    const r = await runJob(job);
    if (r.ok) notify(`${r.title} sent to the printer`);
    else notify(`${r.title || 'Receipt'} not printed: ${r.error}`, 8000, 'danger');
    return r.ok;
  };
  const printKot = async (kot) => {
    const jobs = kot?.prints || [];
    if (!jobs.length) return;
    const res = [];
    for (const j of jobs) res.push(await runJob(j));      // one after the other
    const okNames = res.filter((r) => r.ok).map((r) => r.title.replace(/^KOT /, ''));
    const bad = res.filter((r) => !r.ok);
    if (!bad.length) notify(`KOT sent to ${okNames.join(', ')}`);
    else notify(`${okNames.length ? `KOT sent to ${okNames.join(', ')}. ` : ''}Not printed: ${bad.map((r) => `${r.title.replace(/^KOT /, '')} (${r.error})`).join('; ')}`, 8000, 'danger');
  };
  const reprintInvoice = async (saleId) => { try { await printJob(await get(`/v1/invoices/${saleId}/print`)); } catch (e) { onError(e); } };
  const reprintKot = async (id) => { try { await printKot(await get(`/v1/orders/${id}/kot?full=1`)); } catch (e) { onError(e); } };
  const printBill = async (id) => {
    try { const r = await post(`/v1/orders/${id}/bill`); refreshRunning(); await printJob(r.print_job); } catch (e) { onError(e); }
  };

  /* ---------- order flow ---------- */
  const proceed = (action, type = orderType, tbl = table) => {
    if (!cart.length) return notify('Add at least one item to the order');
    if (!type) return setModal({ name: 'orderType', then: { kind: action } });
    if (action === 'place') return commitOrder(type, tbl);
    if (!canPay) return notify("Waiters can't take payment. Place the order and send it to the cashier.");
    if (editingId) return notify('Update the order first, then take payment from Running orders.');
    return openQuickPayment(type, tbl);
  };

  const commitOrder = async (type, tbl) => {
    if (busy) return;
    setBusy('place');
    try {
      const body = orderBody(type, tbl);
      const r = editingId ? await put(`/v1/orders/${editingId}`, body) : await post('/v1/orders', body, { idempotencyKey: newKey() });
      ok();
      notify(`Order ${r.order.order_number || r.order.sale_no} ${editingId ? 'updated' : 'placed'} — sent to the kitchen`);
      if (prefsRef.current.printKot && r.kot?.prints?.length) printKot(r.kot);
      resetOrder();
      setModal(null);
      refreshRunning();
    } catch (e) { onError(e, 'The order was not saved.'); }
    finally { setBusy(null); }
  };

  const saveDraft = async () => {
    if (!cart.length) return notify('Nothing to save — the order is empty');
    if (editingId) return notify('This is a running order. Use Update order to save changes.');
    try { await post('/v1/drafts', orderBody(), { idempotencyKey: newKey() }); resetOrder(); notify('Order saved as draft'); }
    catch (e) { onError(e); }
  };

  const openQuickPayment = async (type, tbl) => {
    setBusy('calc');
    try {
      const r = await post('/v1/orders/calculate', orderBody(type, tbl));
      setCalc(r);
      setModal({ name: 'payment', source: 'cart', type, tbl, due: r.totals.total_payable, totals: r.totals,
        adjust: { discount, charge: chargeTouched ? charge : parseAmount(r.totals?.charge_value) },
        allowDue: customer.id !== C.defaultCustomerId,
        label: `${ORDER_TYPES[type].label}${hasTables(tbl) ? ` · ${tblText(tbl)}` : ''} · ${customer.name}` });
    } catch (e) { onError(e); }
    finally { setBusy(null); }
  };

  const openOrderPayment = async (orderId) => {
    setBusy('calc');
    try {
      const o = await get(`/v1/orders/${orderId}`);
      setModal({ name: 'payment', source: 'running', orderId, due: o.totals.total_payable, totals: o.totals,
        adjust: { discount: parseAmount(o.totals?.discount), charge: parseAmount(o.totals?.charge) },
        allowDue: !!o.customer?.id && o.customer.id !== C.defaultCustomerId,
        label: `${o.order_type_name || ''}${o.tables_text ? ` · ${o.tables_text}` : ''} · ${o.customer?.name || ''}` });
    } catch (e) { onError(e); }
    finally { setBusy(null); }
  };

  const adjustTotals = async ({ discount: d, charge: c }) => {
    const m = modal;
    if (m.source === 'running') return (await post(`/v1/orders/${m.orderId}/totals`, { discount: d, charge: c })).totals;
    const r = await post('/v1/orders/calculate', { ...orderBody(m.type, m.tbl), discount: d, charge: c });
    setDiscount(parseAmount(d)); setCharge(parseAmount(c)); setChargeTouched(true);
    return r.totals;
  };

  // ZATCA runs on the server after the reply; watch it, then print the invoice (or hand it to the "done" popup)
  const watchZatca = (invoice, popup = false) => {
    if (!invoice?.zatca?.pending) {
      if (!popup && prefsRef.current.printInvoice && invoice?.print_job) printJob(invoice.print_job);
      return;
    }
    setZatcaQueue((q) => [...q.filter((x) => x.id !== invoice.id), { id: invoice.id, sale_no: invoice.sale_no }]);
    const started = Date.now();
    const tick = async () => {
      let st = null;
      try { st = await get(`/v1/invoices/${invoice.id}/zatca`); } catch { /* network blip: try again */ }
      if (st?.state === 'done') {
        setZatcaQueue((q) => q.filter((x) => x.id !== invoice.id));
        const z = st.zatca || {};
        if (z.synced) notify(`Invoice ${invoice.sale_no}: reported to ZATCA`);
        else notify(`Invoice ${invoice.sale_no}: ZATCA — ${z.message || 'not reported yet'}`, 9000, 'danger');
        // the "Payment received" screen (if still open) shows the result and gets the print job
        setModal((md) => (md?.name === 'done' && md.invoice?.id === invoice.id
          ? { ...md, waiting: false, printed: !popup && prefsRef.current.printInvoice && !!st.print_job, invoice: { ...md.invoice, print_job: st.print_job || null, zatca: { ...(md.invoice.zatca || {}), ...z, pending: false } } } : md));
        if (!popup && prefsRef.current.printInvoice && st.print_job) await printJob(st.print_job);
        return;
      }
      if (Date.now() - started > 15 * 60000) {
        setZatcaQueue((q) => q.filter((x) => x.id !== invoice.id));
        notify(`Invoice ${invoice.sale_no}: ZATCA is taking long. Check it in Recent sales.`, 9000);
        return;
      }
      setTimeout(tick, Date.now() - started < 60000 ? 1500 : 5000);
    };
    setTimeout(tick, 800);
  };

  const completePayment = async ({ payments, given, reference, discount: d, charge: c }) => {
    if (busy) return;
    const m = modal;
    const payBody = { payments, reference };
    if (d !== undefined) { payBody.discount = d; payBody.charge = c; }
    if (given !== '' && given != null) payBody.given_amount = Number(given);
    setBusy('pay');
    try {
      const key = newKey();
      let r;
      for (let i = 0; ; i++) {
        try {
          r = m.source === 'running'
            ? { invoice: await post(`/v1/orders/${m.orderId}/invoice`, payBody, { idempotencyKey: key }) }
            : await post('/v1/invoices/quick', { ...orderBody(m.type, m.tbl), ...payBody }, { idempotencyKey: key });
          break;
        } catch (e) {
          if (e?.code !== 'ZATCA_BUSY' || i >= 40) throw e;
          notify('Waiting for the previous invoice to finish with ZATCA…', 4000);
          await new Promise((res) => setTimeout(res, 1500));
        }
      }
      const invoice = r.invoice;
      if (m.source !== 'running') {
        if (prefsRef.current.printKot && r.kot?.prints?.length) printKot(r.kot);
        resetOrder();
      }
      ok();
      refreshRunning();
      setSales((s) => [invoice, ...s.filter((x) => x.id !== invoice.id)]);
      if (C.outlet.printPopup) {
        setModal({ name: 'done', invoice: { ...invoice, print_job: invoice?.zatca?.pending ? null : invoice.print_job }, waiting: !!invoice?.zatca?.pending });
        watchZatca(invoice, true);
      } else {
        setModal({ name: 'done', invoice, auto: true, waiting: !!invoice?.zatca?.pending });
        watchZatca(invoice);
      }
    } catch (e) { onError(e, 'Payment was not saved.'); }
    finally { setBusy(null); }
  };

  /* ---------- running orders ---------- */
  const loadOrder = (o) => {
    setCart(o.items.filter((l) => !l.is_free).map((l) => {
      const d = parseAmount(l.discount);
      return {
        key: `line-${l.line_id}`, lineId: l.line_id, itemId: l.food_menu_id, name: l.name, price: Number(l.unit_price) || 0, qty: Number(l.qty) || 1,
        mods: (l.modifiers || []).map((x) => ({ id: x.id, name: x.name, price: Number(x.price) || 0 })), note: l.note || '',
        disc: d.mode === 'percent' ? d.value : 0, discRaw: d.mode === 'fixed' && d.value ? String(d.value) : null,
        openPrice: false, comboSelections: [], priceEdited: false,
      };
    }));
    setOrderType(TYPE_KEY[o.order_type] || 'take');
    setTable(o.tables?.length ? o.tables.map((t) => ({ id: t.table_id, name: t.name, persons: Number(t.persons) || 1 })) : null);
    setWaiter(o.waiter?.id || firstWaiter());
    if (o.customer && !customers.some((c) => c.id === o.customer.id)) setCustomers((cs) => [...cs, { id: o.customer.id, name: o.customer.name, phone: o.customer.phone || '' }]);
    setCustomerId(o.customer?.id || C.defaultCustomerId);
    setPartner(o.delivery_partner?.id ? String(o.delivery_partner.id) : '');
    setPartnerRef(o.delivery_partner?.ref_no || '');
    setDiscount(parseAmount(o.totals?.discount));
    setCharge(parseAmount(o.totals?.charge)); setChargeTouched(true);
    setEditingId(o.id);
    notify(`Editing order ${o.order_number || o.sale_no}`);
  };
  const modifyOrder = async (id) => {
    if (cart.length && !editingId && !(await confirm('Replace the items in the current order with this running order?', { confirmLabel: 'Replace' }))) return false;
    try { loadOrder(await get(`/v1/orders/${id}`)); setModal(null); return true; } catch (e) { onError(e); return false; }
  };
  const cancelOrder = async (id, reason) => {
    try { await post(`/v1/orders/${id}/cancel`, { reason }); notify('Order cancelled'); refreshRunning(); setModal(null); }
    catch (e) { onError(e); }
  };

  return {
    user, isWaiter, canPay, cart, orderType, table, waiter, setWaiter, customers, customer, customerId, setCustomerId, partner, setPartner, partnerRef, setPartnerRef,
    discount, charge, editingId, calc, calcErr, calcBusy, totals, srvFor, itemCount, running, sales, setSales, registerOpen, setRegisterOpen, online, busy, modal, setModal,
    prefs, savePrefs, zatcaQueue,
    onError, refreshRunning, searchCustomers, addCustomer, addToCart, updateLine, setLineQty, removeLine, onItemPress, resetOrder, pickOrderType, pickTables, setOrderType, setTable,
    printJob, printKot, reprintInvoice, reprintKot, printBill, proceed, saveDraft, openOrderPayment, adjustTotals, completePayment, modifyOrder, cancelOrder,
  };
}
