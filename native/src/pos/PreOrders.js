// Pre-orders (the web app's Pre-Order module): list, create / edit, Submitted -> Preparing -> Delivered.
// "Mark delivered" makes the real invoice on the server (same pipeline as a Quick Invoice: ZATCA + print).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CalendarClock, Check, ChefHat, Pencil, Plus, Printer, Search, ShoppingBag, Trash2, Truck, UserRound, X } from 'lucide-react-native';
import { del, get, post, put, newKey } from '../lib/api';
import { C } from '../lib/catalog';
import { firstError, money, today } from '../lib/format';
import { Btn, COLORS, Field, Input, Money, Pill, Row, Segment, Sheet, Stepper, Tag, useLayout, useUi } from '../ui';
import { CustomerSheet } from './Pickers';
import { MethodPicker } from './Refund';

const STATUS = { 1: ['Submitted', 'info'], 2: ['Preparing', 'warn'], 3: ['Delivered', 'ok'] };
const FILTERS = [['', 'All'], ['1', 'Submitted'], ['2', 'Preparing'], ['3', 'Delivered']];
const plural = (n, one, many) => (n === 1 ? one : many).replace('{n}', n);
const dayPlus = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const cashFirst = () => C.paymentMethods.find((m) => m.cash)?.id ?? C.paymentMethods[0]?.id;

/* ---------------- list (a view, like Running orders) ---------------- */
export function PreOrdersView({ pos }) {
    const { isTablet } = useLayout();
    const { confirm, notify } = useUi();
    const [status, setStatus] = useState('');
    const [q, setQ] = useState('');
    const [list, setList] = useState(null);
    const [busy, setBusy] = useState(null);
    const load = useCallback(() => {
        const qs = [status ? `status=${status}` : '', q.trim() ? `search=${encodeURIComponent(q.trim())}` : ''].filter(Boolean).join('&');
        return get(`/v1/pre-orders${qs ? `?${qs}` : ''}`).then(setList).catch((e) => { setList([]); pos.onError(e); });
    }, [status, q]); // eslint-disable-line
    useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load, pos.preOrderTick]); // eslint-disable-line

    const act = async (key, fn) => { setBusy(key); try { await fn(); } catch (e) { pos.onError(e); } finally { setBusy(null); } };
    const draft = (po) => act(`d${po.id}`, async () => pos.printJob(await get(`/v1/pre-orders/${po.id}/draft`)));
    const prepare = (po) => act(`s${po.id}`, async () => {
        if (!(await confirm(`Move ${po.pre_order_no} to Preparing?`, { title: 'Start preparing', confirmLabel: 'Start preparing' }))) return;
        await post(`/v1/pre-orders/${po.id}/status`, { status: 2 }); notify(`${po.pre_order_no} is now Preparing`); load();
    });
    const remove = (po) => act(`x${po.id}`, async () => {
        if (!(await confirm(`Delete pre-order ${po.pre_order_no}?`, { title: 'Delete', confirmLabel: 'Delete', danger: true }))) return;
        await del(`/v1/pre-orders/${po.id}`); notify('Pre-order deleted'); load();
    });
    const edit = (po) => act(`e${po.id}`, async () => pos.setModal({ name: 'poForm', po: await get(`/v1/pre-orders/${po.id}`) }));
    const remaining = (po) => {
        if (po.status === 3) return null;
        const d = po.days_remaining;
        if (d > 0) return <Text className="text-ink-2 text-[12px]">{plural(d, 'In {n} day', 'In {n} days')}</Text>;
        if (d === 0) return <Text className="text-warn font-bold text-[12px]">Today</Text>;
        return <Text className="text-danger font-bold text-[12px]">{plural(-d, 'Overdue {n} day', 'Overdue {n} days')}</Text>;
    };

    return (
        <View className="flex-1">
            <View className="flex-row items-center justify-between mb-3">
                <Text className="text-[22px] font-extrabold text-ink">Pre-orders</Text>
                <Btn icon={Plus} label="Add pre-order" variant="primary" size="sm" onPress={() => pos.setModal({ name: 'poForm', po: null })} />
            </View>
            <Input value={q} onChangeText={setQ} placeholder="Pre-order no, customer or phone" className="mb-3" />
            <View className="mb-3"><ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {FILTERS.map(([v, l]) => <Pill key={v} label={l} active={status === v} onPress={() => setStatus(v)} />)}
            </ScrollView></View>
            {!list ? <ActivityIndicator color={COLORS.brand} /> : (
                <FlatList data={list} keyExtractor={(p) => String(p.id)} contentContainerStyle={{ paddingBottom: 100, gap: 8 }}
                    ListEmptyComponent={<Text className="text-ink-3 text-center mt-10">No pre-orders found</Text>}
                    renderItem={({ item: po }) => {
                        const [sName, sTone] = STATUS[po.status] || ['', 'neutral'];
                        return (
                            <View className="bg-card rounded-2xl border border-line p-3.5">
                                <View className={isTablet ? 'flex-row items-center' : ''}>
                                    <View className="flex-1">
                                        <View className="flex-row items-center"><Text className="font-extrabold text-ink text-[15px]">{po.pre_order_no}</Text><Tag text={sName} tone={sTone} className="ml-2" /></View>
                                        <Text className="text-ink-2 text-[12.5px]" numberOfLines={1}>{po.customer?.name}{po.customer?.phone ? ` · ${po.customer.phone}` : ''} · {po.order_type === 'delivery' ? 'Delivery' : 'Pickup'}{po.delivery_partner ? ` · ${po.delivery_partner.name}` : ''}{po.converted_sale_no ? ` · Invoice ${po.converted_sale_no}` : ''}</Text>
                                    </View>
                                    <View className={`flex-row items-center ${isTablet ? '' : 'mt-2 justify-between'}`} style={{ gap: 14 }}>
                                        <View><Text className="text-ink font-semibold text-[13px]">{po.delivery_date}{po.delivery_time ? ` ${po.delivery_time}` : ''}</Text>{remaining(po)}</View>
                                        <View className="items-end"><Money value={po.total_payable} bold className="font-extrabold text-ink text-[16px]" />
                                            {po.status !== 3 && po.due_amount > 0 ? <Text className="text-ink-3 text-[12px]">Due {money(po.due_amount)}</Text> : null}</View>
                                    </View>
                                </View>
                                <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
                                    {po.status !== 3 ? <Btn size="sm" icon={Pencil} label="Edit" busy={busy === `e${po.id}`} disabled={!!busy} onPress={() => edit(po)} /> : null}
                                    <Btn size="sm" icon={Printer} label="Draft" busy={busy === `d${po.id}`} disabled={!!busy} onPress={() => draft(po)} />
                                    {po.status === 1 ? <Btn size="sm" icon={ChefHat} label="Start preparing" busy={busy === `s${po.id}`} disabled={!!busy} onPress={() => prepare(po)} /> : null}
                                    {po.status === 2 ? <Btn size="sm" icon={Check} label="Mark delivered" variant="ok" disabled={!!busy} onPress={() => pos.setModal({ name: 'poDeliver', po })} /> : null}
                                    {po.status !== 3 && !po.is_converted ? <Btn size="sm" icon={Trash2} label="" accessibilityLabel="Delete" busy={busy === `x${po.id}`} disabled={!!busy} onPress={() => remove(po)} /> : null}
                                </View>
                            </View>
                        );
                    }} />
            )}
        </View>
    );
}

/* ---------------- deliver: collect the remaining due, then the invoice ---------------- */
export function PreOrderDeliverSheet({ pos, po, onClose }) {
    const [method, setMethod] = useState(C.paymentMethods.find((m) => m.id === po.advance_payment_method_id)?.id ?? cashFirst());
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const keyRef = useRef(null);
    const go = async () => {
        setBusy(true); setErr('');
        try {
            if (!keyRef.current) keyRef.current = newKey();
            let r = null;
            for (let i = 0; ; i++) {          // the previous invoice may still be with ZATCA: try again for a while
                try { r = await post(`/v1/pre-orders/${po.id}/deliver`, { payment_method_id: method }, { idempotencyKey: keyRef.current }); break; }
                catch (e) { if (e?.code !== 'ZATCA_BUSY' || i >= 40) throw e; await new Promise((res) => setTimeout(res, 1500)); }
            }
            pos.bumpPreOrders();
            pos.showInvoice(r.invoice);       // replaces this sheet with "Payment received" (ZATCA + print)
        } catch (e) { setErr(firstError(e)); setBusy(false); }
    };
    return (
        <Sheet title={`Deliver ${po.pre_order_no}`} subtitle={po.customer?.name} onClose={() => !busy && onClose()} closable={!busy} size="sm"
            footer={<><Btn label="Back" disabled={busy} onPress={onClose} className="flex-1" />
                <Btn icon={Check} variant="ok" label={busy ? 'Creating invoice…' : 'Delivered & invoice'} busy={busy} disabled={busy || (po.due_amount > 0 && !method)} onPress={go} className="flex-1" /></>}>
            <Row label="Total payable" value={<Money value={po.total_payable} bold className="font-bold text-ink" />} />
            <Row label={`Advance paid${po.advance_payment_method_name ? ` (${po.advance_payment_method_name})` : ''}`} value={<Text className="font-bold text-ink">{money(po.advance_amount)}</Text>} />
            <Row strong label="Due" value={<Money value={po.due_amount} bold className="text-[20px] font-extrabold text-ink" />} />
            {po.due_amount > 0 ? <>
                <Text className="text-[12.5px] font-semibold text-ink-2 mt-4 mb-1.5">Payment method for the remaining due</Text>
                <MethodPicker value={method} onChange={setMethod} />
            </> : null}
            <Text className="text-ink-3 text-[12px] mt-4">The invoice is made from the pre-order's items and prices and sent to ZATCA like any sale. Its total can differ by a few halalas from the pre-order estimate; the remaining due is taken from the invoice total.</Text>
            {err ? <Text className="text-danger text-[13px] mt-2">{err}</Text> : null}
        </Sheet>
    );
}

/* ---------------- item picker (phone: its own sheet; tablet: next to the form) ---------------- */
function usePickable() {
    return useMemo(() => {
        const all = [];
        C.items.forEach((it) => (it.variations.length ? it.variations : [it]).forEach((v) => { if (!v.unavailable && !v.comboGroups) all.push(v); }));
        return all;
    }, []);
}
function ItemPicker({ onAdd, counts, maxHeight }) {
    const pickable = usePickable();
    const [search, setSearch] = useState('');
    const t = search.trim().toLowerCase();
    const shown = (t ? pickable.filter((i) => `${i.name} ${i.name2} ${i.code}`.toLowerCase().includes(t)) : pickable).slice(0, 150);
    return (
        <View style={maxHeight ? { maxHeight } : { flex: 1 }}>
            <View className="h-12 bg-card rounded-xl border border-line flex-row items-center px-3 mb-2">
                <Search size={18} color={COLORS.ink3} />
                <TextInput value={search} onChangeText={setSearch} placeholder="Search items" placeholderTextColor={COLORS.ink3} className="flex-1 ml-2 text-[15px] text-ink" />
                {search ? <Pressable onPress={() => setSearch('')} accessibilityLabel="Clear search"><X size={18} color={COLORS.ink3} /></Pressable> : null}
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {shown.map((it) => (
                    <Pressable key={it.id} onPress={() => onAdd(it)} accessibilityLabel={`Add ${it.name}`}
                        className="flex-row items-center justify-between px-3 py-3 rounded-xl mb-1 bg-card border border-line active:opacity-70">
                        <View className="flex-1 pr-2"><Text className="font-bold text-ink" numberOfLines={1}>{it.name}</Text>{it.name2 ? <Text className="text-ink-3 text-[12px]" numberOfLines={1}>{it.name2}</Text> : null}</View>
                        <Text className="text-ink-2 font-semibold mr-2">{it.openPrice ? 'Open price' : money(it.prices.dine_in)}</Text>
                        {counts[it.id] ? <View className="min-w-[24px] h-6 rounded-full bg-brand items-center justify-center px-1.5"><Text className="text-white text-[12px] font-bold">{counts[it.id]}</Text></View> : <Plus size={18} color={COLORS.brand} />}
                    </Pressable>
                ))}
                {!shown.length ? <Text className="text-ink-3 text-center mt-6">No items found</Text> : null}
            </ScrollView>
        </View>
    );
}

/* ---------------- add / edit ---------------- */
export function PreOrderFormSheet({ pos, po, onClose }) {
    const { isTablet, height } = useLayout();
    const { notify } = useUi();
    const [customerId, setCustomerId] = useState(po?.customer?.id || C.defaultCustomerId);
    const [type, setType] = useState(po?.order_type || 'pickup');
    const [partner, setPartner] = useState(po?.delivery_partner?.id || '');
    const [date, setDate] = useState(po?.delivery_date || dayPlus(1));
    const [time, setTime] = useState(po?.delivery_time || '');
    const [note, setNote] = useState(po?.preparation_note || '');
    const [advance, setAdvance] = useState(po ? String(po.advance_amount || '') : '');
    const [advMethod, setAdvMethod] = useState(po?.advance_payment_method_id || cashFirst());
    const [lines, setLines] = useState(() => (po?.items || []).map((l, k) => {
        const it = C.byId[l.food_menu_id];
        return {
            key: `s${k}`, itemId: l.food_menu_id, name: l.name, qty: l.qty, note: l.note || '', price: l.unit_price, keep: true, entered: '',
            openPrice: !!it?.openPrice, allMods: it?.modifiers || [],
            mods: (l.modifiers || []).map((m) => ({ id: m.id, name: m.name, price: m.price, openPrice: !!it?.modifiers.find((x) => x.id === m.id)?.openPrice, entered: String(m.price) })),
        };
    }));
    const [picker, setPicker] = useState(false);          // phone: item picker sheet
    const [custOpen, setCustOpen] = useState(false);
    const [totals, setTotals] = useState(null);
    const [calcErr, setCalcErr] = useState('');
    const [busy, setBusy] = useState(false);
    const [errs, setErrs] = useState({});
    const keyRef = useRef(null);

    const customer = pos.customers.find((c) => c.id === Number(customerId)) || (po?.customer?.id === Number(customerId) ? po.customer : null);
    const counts = useMemo(() => lines.reduce((m, l) => ({ ...m, [l.itemId]: (m[l.itemId] || 0) + l.qty }), {}), [lines]);

    // same item again: one more on its line (a line with modifiers or its own price stays separate)
    const add = (it) => setLines((ls) => {
        const same = !it.openPrice && ls.find((l) => l.itemId === it.id && !l.openPrice && !l.mods.length && Number(l.price) === Number(it.prices.dine_in));
        if (same) return ls.map((l) => (l === same ? { ...l, qty: l.qty + 1 } : l));
        return [...ls, {
            key: `n${Date.now()}${Math.random()}`, itemId: it.id, name: it.name, qty: 1, note: '', price: it.openPrice ? 0 : it.prices.dine_in,
            openPrice: it.openPrice, entered: '', keep: false, mods: [], allMods: it.modifiers
        }];
    });
    const upd = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    const toggleMod = (l, m) => upd(l.key, { mods: l.mods.some((x) => x.id === m.id) ? l.mods.filter((x) => x.id !== m.id) : [...l.mods, { ...m, entered: m.openPrice ? '' : String(m.price) }] });
    const setModPrice = (l, id, v) => upd(l.key, { mods: l.mods.map((x) => (x.id === id ? { ...x, entered: v, price: Number(v) || 0 } : x)) });

    const body = () => ({
        customer_id: customerId, order_type: type, delivery_partner_id: type === 'delivery' ? partner || null : null,
        delivery_date: date.trim(), delivery_time: time.trim(), preparation_note: note, advance_amount: Number(advance) || 0, advance_payment_method_id: advMethod,
        items: lines.map((l) => ({
            food_menu_id: l.itemId, qty: l.qty, note: l.note,
            ...(l.keep || l.openPrice ? { custom_price: l.openPrice && !l.keep ? Number(l.entered) || 0 : l.price } : {}),
            modifier_ids: l.mods.map((m) => (m.openPrice ? { id: m.id, price: Number(m.entered) || 0 } : m.id)),
        })),
    });
    const incomplete = lines.some((l) => (l.openPrice && !l.keep && !(Number(l.entered) > 0)) || l.mods.some((m) => m.openPrice && !(Number(m.entered) > 0)));
    const sig = JSON.stringify(body());
    useEffect(() => {
        if (!lines.length || incomplete) { setTotals(null); setCalcErr(''); return undefined; }
        let alive = true;
        const h = setTimeout(() => post('/v1/pre-orders/calculate', body()).then((r) => { if (alive) { setTotals(r.totals); setCalcErr(''); } })
            .catch((e) => { if (alive) { setTotals(null); setCalcErr(firstError(e)); } }), 300);
        return () => { alive = false; clearTimeout(h); };
    }, [sig]); // eslint-disable-line

    const save = async () => {
        setBusy(true); setErrs({});
        try {
            let r;
            if (po) r = await put(`/v1/pre-orders/${po.id}`, body());
            else { if (!keyRef.current) keyRef.current = newKey(); r = await post('/v1/pre-orders', body(), { idempotencyKey: keyRef.current }); }
            notify(po ? `Pre-order ${r.pre_order_no} updated` : `Pre-order ${r.pre_order_no} saved`);
            pos.bumpPreOrders();
            onClose();
        } catch (e) { setErrs(e?.errors || {}); setCalcErr(firstError(e)); setBusy(false); }
    };
    const fe = (k) => (errs[k] ? <Text className="text-danger text-[12px] mt-1">{errs[k]}</Text> : null);

    const form = (
        <View>
            <Field label="Customer">
                <Pressable onPress={() => setCustOpen(true)} className="h-12 rounded-xl border border-line bg-card px-3 flex-row items-center" accessibilityLabel="Customer">
                    <UserRound size={18} color={COLORS.ink2} /><Text className="flex-1 ml-2 text-ink font-semibold" numberOfLines={1}>{customer?.name || 'Choose customer'}{customer?.phone ? ` · ${customer.phone}` : ''}</Text>
                </Pressable>{fe('customer_id')}
            </Field>
            <Field label="Order type">
                <Segment options={[{ value: 'pickup', label: 'Pickup', icon: ShoppingBag }, { value: 'delivery', label: 'Delivery', icon: Truck }]} value={type} onChange={setType} />
            </Field>
            {type === 'delivery' && C.partners.length ? (
                <Field label="Delivery partner">
                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                        {[{ id: '', name: 'None' }, ...C.partners].map((p) => <Pill key={String(p.id)} label={p.name} active={String(partner) === String(p.id)} onPress={() => setPartner(p.id)} className="mr-0" />)}
                    </View>{fe('delivery_partner_id')}
                </Field>
            ) : null}
            <View className="flex-row" style={{ gap: 10 }}>
                <Field label="Delivery date (YYYY-MM-DD)" className="flex-1"><Input value={date} onChangeText={setDate} placeholder={dayPlus(1)} keyboardType="numbers-and-punctuation" />{fe('delivery_date')}</Field>
                <Field label="Time (HH:MM)" className="w-[130px]"><Input value={time} onChangeText={setTime} placeholder="14:30" keyboardType="numbers-and-punctuation" />{fe('delivery_time')}</Field>
            </View>
            <View className="flex-row -mt-1 mb-3" style={{ gap: 8 }}>
                {[[today(), 'Today'], [dayPlus(1), 'Tomorrow'], [dayPlus(2), 'In 2 days']].map(([d, l]) => <Pill key={l} label={l} active={date === d} onPress={() => setDate(d)} className="mr-0 h-9" />)}
            </View>

            <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-[12.5px] font-semibold text-ink-2">Items</Text>
                {!isTablet ? <Btn size="sm" icon={Plus} label="Add items" onPress={() => setPicker(true)} /> : null}
            </View>
            <View className="bg-soft rounded-xl border border-line px-3 py-1 mb-3">
                {!lines.length ? <Text className="text-ink-3 py-3">{isTablet ? 'Tap items on the left to add them.' : 'No items yet. Tap "Add items".'}</Text> : null}
                {lines.map((l) => (
                    <View key={l.key} className="py-2.5 border-b border-dashed border-line">
                        <View className="flex-row items-center">
                            <View className="flex-1 pr-2"><Text className="font-bold text-ink" numberOfLines={2}>{l.name}</Text>
                                {!(l.openPrice && !l.keep) ? <Text className="text-ink-3 text-[12px]">{money(l.price)} each</Text> : null}</View>
                            {l.openPrice && !l.keep ? <Input value={l.entered} onChangeText={(v) => upd(l.key, { entered: v })} placeholder="Price" keyboardType="decimal-pad" className="w-[86px] h-10 mr-2" accessibilityLabel={`Price for ${l.name}`} /> : null}
                            <Stepper value={l.qty} min={1} onChange={(v) => upd(l.key, { qty: Math.max(1, v) })} />
                            <Pressable onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} accessibilityLabel={`Remove ${l.name}`} className="w-10 h-10 items-center justify-center ml-1"><Trash2 size={17} color={COLORS.danger} /></Pressable>
                        </View>
                        {l.allMods.length ? (
                            <View className="flex-row flex-wrap mt-2" style={{ gap: 6 }}>
                                {l.allMods.map((m) => {
                                    const on = l.mods.find((x) => x.id === m.id);
                                    return (
                                        <View key={m.id} className="flex-row items-center">
                                            <Pressable onPress={() => toggleMod(l, m)} className={`h-8 px-2.5 rounded-lg border justify-center ${on ? 'bg-brand-tint border-brand' : 'bg-card border-line'}`}>
                                                <Text className={`text-[12.5px] font-semibold ${on ? 'text-brand-dark' : 'text-ink-2'}`}>{m.name}{!m.openPrice ? ` +${money(m.price)}` : ''}</Text>
                                            </Pressable>
                                            {on && m.openPrice ? <Input value={on.entered} onChangeText={(v) => setModPrice(l, m.id, v)} placeholder="Price" keyboardType="decimal-pad" className="w-[76px] h-8 ml-1 text-[13px]" /> : null}
                                        </View>
                                    );
                                })}
                            </View>
                        ) : null}
                        <Input value={l.note} onChangeText={(v) => upd(l.key, { note: v })} maxLength={150} placeholder="Note" className="h-10 mt-2 text-[13.5px]" accessibilityLabel={`Note for ${l.name}`} />
                    </View>
                ))}
            </View>

            <Field label="Preparation note (whole order)"><Input value={note} onChangeText={setNote} /></Field>
            <Field label="Advance amount"><Input value={advance} onChangeText={setAdvance} placeholder="0.00" keyboardType="decimal-pad" /></Field>
            <Field label="Advance payment method"><MethodPicker value={advMethod} onChange={setAdvMethod} />{fe('advance_payment_method_id')}</Field>

            <View className="bg-soft rounded-xl p-3">
                {calcErr ? <Text className="text-danger text-[13px] mb-1">{calcErr}</Text> : null}
                <Row label="Sub total" value={<Text className="font-bold text-ink">{totals ? money(totals.sub_total) : '—'}</Text>} />
                <Row label="VAT" value={<Text className="font-bold text-ink">{totals ? money(totals.total_vat) : '—'}</Text>} />
                <Row strong label="Total payable" value={totals ? <Money value={totals.total_payable} bold className="text-[20px] font-extrabold text-ink" /> : <Text className="text-ink">—</Text>} />
                {totals && totals.advance_amount > 0 ? <Row label="Due" value={<Text className="font-bold text-ink">{money(totals.due_amount)}</Text>} /> : null}
            </View>
        </View>
    );

    const footer = <>
        <Btn label="Cancel" disabled={busy} onPress={onClose} className="flex-1" />
        <Btn icon={Check} label="Save pre-order" variant="primary" busy={busy} disabled={busy || !lines.length || incomplete || !date.trim() || !totals} onPress={save} className="flex-1" />
    </>;
    const title = po ? `Edit pre-order ${po.pre_order_no}` : 'Add pre-order';
    const sub = totals ? `Total ${money(totals.total_payable)}${totals.advance_amount > 0 ? ` · Due ${money(totals.due_amount)}` : ''}` : '';

    return (
        <>
            {isTablet ? (
                <Sheet title={title} subtitle={sub} onClose={() => !busy && onClose()} closable={!busy} size="xl" scroll={false} footer={footer}>
                    <View className="flex-row" style={{ gap: 16, height: height * 0.92 - 150 }}>
                        <View style={{ width: 300 }}><ItemPicker onAdd={add} counts={counts} /></View>
                        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>{form}</ScrollView>
                    </View>
                </Sheet>
            ) : (
                <Sheet title={title} subtitle={sub} onClose={() => !busy && onClose()} closable={!busy} size="lg" footer={footer}>{form}</Sheet>
            )}
            {picker ? (
                <Sheet title="Add items" subtitle={`${lines.reduce((s, l) => s + l.qty, 0)} in this pre-order`} onClose={() => setPicker(false)} size="md" scroll={false}
                    footer={<Btn label="Done" variant="primary" onPress={() => setPicker(false)} className="flex-1" />}>
                    <ItemPicker onAdd={add} counts={counts} maxHeight={height * 0.6} />
                </Sheet>
            ) : null}
            {custOpen ? <CustomerSheet pos={pos} value={customerId} onPick={setCustomerId} onClose={() => setCustOpen(false)} /> : null}
        </>
    );
}

export const PRE_ORDER_ICON = CalendarClock;