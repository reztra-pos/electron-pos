// Running orders, tables overview, recent sales, register and settings (printers).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { Armchair, ShoppingBag, Truck, Clock3, ChefHat, Receipt, Banknote, Pencil, Printer, Ban, Eye, LayoutGrid, Users, Wallet, LogOut, Bluetooth, Usb, Wifi, Cpu, RefreshCw, Check, Monitor, Sun, Moon, Smartphone, RotateCcw, CalendarClock, ChevronRight, Eraser, FileDown } from 'lucide-react-native';
import { get, post } from '../lib/api';
import { C, TYPE_KEY, isLoyaltyMethod } from '../lib/catalog';
import { firstError, minutesAgo, today } from '../lib/format';
import { listBluetooth, listUsb, getRoutes, setRoute, sendTo, testPage, MODES, ROLE, printDocument } from '../lib/printer';
import { registerA4Html } from '../lib/reports';
import { Btn, COLORS, Field, Input, Keypad, Money, Pill, Row, Segment, Sheet, Tag, useLayout, useTheme, useUi } from '../ui';

const TYPE_ICON = { dine: Armchair, take: ShoppingBag, delivery: Truck };
const KITCHEN = { new: ['New', 'brand'], cooking: ['Preparing', 'warn'], ready: ['Ready', 'ok'] };

/* ---------------- running orders ---------------- */
export function RunningView({ pos }) {
    const { isTablet, width } = useLayout();
    const [type, setType] = useState('all');
    const [refreshing, setRefreshing] = useState(false);
    const list = pos.running.filter((o) => type === 'all' || TYPE_KEY[o.order_type] === type);
    const cols = isTablet ? 3 : 1;
    const count = (k) => pos.running.filter((o) => TYPE_KEY[o.order_type] === k).length;
    const total = pos.running.reduce((s, o) => s + Number(o.total_payable || 0), 0);
    return (
        <View className="flex-1">
            <View className="flex-row items-end justify-between mb-3">
                <View><Text className="text-[22px] font-extrabold text-ink">Running orders</Text>
                    <View className="flex-row items-center"><Text className="text-ink-2">{pos.running.length} open · </Text><Money value={total} className="text-ink-2" /></View></View>
                <Btn size="sm" icon={Eraser} label="Clear running orders" onPress={() => pos.setModal({ name: 'clearRunning' })} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-grow-0 mb-3">
                <Pill label="All" count={pos.running.length} active={type === 'all'} onPress={() => setType('all')} />
                <Pill label="Dine In" icon={Armchair} count={count('dine')} active={type === 'dine'} onPress={() => setType('dine')} />
                <Pill label="Take Away" icon={ShoppingBag} count={count('take')} active={type === 'take'} onPress={() => setType('take')} />
                <Pill label="Delivery" icon={Truck} count={count('delivery')} active={type === 'delivery'} onPress={() => setType('delivery')} />
            </ScrollView>
            <FlatList data={list} key={cols} numColumns={cols} keyExtractor={(o) => String(o.id)}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await pos.refreshRunning(); setRefreshing(false); }} />}
                columnWrapperStyle={cols > 1 ? { gap: 12 } : undefined} contentContainerStyle={{ gap: 12, paddingBottom: 100 }}
                ListEmptyComponent={<Text className="text-ink-3 text-center mt-10">No running orders</Text>}
                renderItem={({ item: o }) => {
                    const k = TYPE_KEY[o.order_type];
                    const Icon = TYPE_ICON[k] || Receipt;
                    const [kl, kt] = o.bill_printed ? ['Bill printed', 'warn'] : KITCHEN[o.kitchen?.status] || ['New', 'brand'];
                    return (
                        <Pressable onPress={() => pos.setModal({ name: 'order', id: o.id })} className="bg-card rounded-2xl border border-line p-4" style={cols > 1 ? { width: (width - 84 - 36 - 24) / cols } : null}>
                            <View className="flex-row justify-between items-center"><Text className="text-[16px] font-extrabold text-ink">#{o.order_number || o.sale_no}</Text><Tag text={kl} tone={kt} /></View>
                            <View className="flex-row items-center mt-1.5"><Icon size={14} color={COLORS.ink2} /><Text className="text-ink-2 text-[13px] ml-1.5 flex-1" numberOfLines={1}>{o.order_type_name}{o.tables_text ? ` · ${o.tables_text}` : ''}{o.customer?.name ? ` · ${o.customer.name}` : ''}</Text></View>
                            <View className="flex-row items-center mt-1"><Clock3 size={14} color={COLORS.ink2} /><Text className="text-ink-2 text-[13px] ml-1.5">{minutesAgo(o.minutes_open ?? o.date_time)}</Text>
                                {o.waiter?.name ? <><ChefHat size={14} color={COLORS.ink2} style={{ marginLeft: 12 }} /><Text className="text-ink-2 text-[13px] ml-1.5">{o.waiter.name}</Text></> : null}</View>
                            <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-dashed border-line">
                                <Money value={o.total_payable} bold className="text-[18px] font-extrabold text-ink" />
                                <View className="flex-row" style={{ gap: 6 }}>
                                    <Btn size="sm" icon={Receipt} label="Bill" onPress={() => pos.printBill(o.id)} />
                                    {pos.canPay ? <Btn size="sm" icon={Banknote} label="Pay" variant="primary" onPress={() => pos.openOrderPayment(o.id)} /> : null}
                                </View>
                            </View>
                        </Pressable>
                    );
                }} />
        </View>
    );
}

export function OrderSheet({ pos, id, onClose }) {
    const { confirm } = useUi();
    const [o, setO] = useState(null);
    const [cancelling, setCancelling] = useState(false);
    const [reason, setReason] = useState('');
    useEffect(() => { get(`/v1/orders/${id}`).then(setO).catch((e) => { pos.onError(e); onClose(); }); }, [id]); // eslint-disable-line
    if (!o) return <Sheet title="Order" onClose={onClose} size="md"><ActivityIndicator color={COLORS.brand} /></Sheet>;
    if (cancelling) {
        return (
            <Sheet title={`Cancel order #${o.order_number || o.sale_no}`} onClose={onClose} size="sm"
                footer={<><Btn label="Back" onPress={() => setCancelling(false)} className="flex-1" /><Btn label="Cancel order" variant="danger" disabled={!reason.trim()} onPress={() => pos.cancelOrder(o.id, reason.trim())} className="flex-1" /></>}>
                <Field label="Reason"><Input value={reason} onChangeText={setReason} placeholder="e.g. customer left" autoFocus /></Field>
            </Sheet>
        );
    }
    return (
        <Sheet title={`Order #${o.order_number || o.sale_no}`} subtitle={`${o.order_type_name}${o.tables_text ? ` · ${o.tables_text}` : ''} · ${o.customer?.name || ''}`} onClose={onClose} size="md"
            footer={<View className="flex-1" style={{ gap: 8 }}>
                <View className="flex-row" style={{ gap: 8 }}>
                    {o.can_modify ? <Btn icon={Pencil} label="Modify" onPress={async () => { if (await pos.modifyOrder(o.id)) onClose(); }} className="flex-1" /> : null}
                    <Btn icon={Printer} label="KOT" onPress={() => { pos.reprintKot(o.id); onClose(); }} className="flex-1" />
                    <Btn icon={Receipt} label="Bill" onPress={() => { pos.printBill(o.id); onClose(); }} className="flex-1" />
                </View>
                <View className="flex-row" style={{ gap: 8 }}>
                    {o.can_modify ? <Btn icon={Ban} label="Cancel" textClass="text-danger" onPress={async () => { if (await confirm('Cancel this order? The kitchen will be told.', { confirmLabel: 'Yes, cancel', danger: true })) setCancelling(true); }} className="flex-1" /> : null}
                    {pos.canPay ? <Btn icon={Banknote} variant="primary" label="Pay" onPress={() => pos.openOrderPayment(o.id)} className="flex-[2]"
                        right={<View className="ml-2"><Money value={o.totals.total_payable} bold className="text-white font-extrabold" /></View>} /> : null}
                </View>
            </View>}>
            {o.items.map((l) => (
                <View key={l.line_id} className="flex-row justify-between py-2.5 border-b border-dashed border-line">
                    <View className="flex-1 pr-3"><Text className="font-bold text-ink">{l.qty} × {l.name}{l.is_free ? '  (free)' : ''}</Text>
                        {(l.modifiers || []).length || l.note ? <Text className="text-ink-3 text-[12.5px]">{[(l.modifiers || []).map((m) => m.name).join(', '), l.note].filter(Boolean).join(' · ')}</Text> : null}</View>
                    <Money value={l.line_total ?? l.price_with_discount} className="font-bold text-ink" />
                </View>
            ))}
            <View className="mt-2">
                <Row label="VAT" value={<Money value={o.totals.total_vat} className="font-bold text-ink" />} />
                <Row strong label="Total" value={<Money value={o.totals.total_payable} bold className="text-[20px] font-extrabold text-ink" />} />
            </View>
        </Sheet>
    );
}

/* ---------------- tables overview ---------------- */
export function TablesView({ pos, onStartOrder }) {
    const { isTablet, width } = useLayout();
    const [data, setData] = useState(null);
    const [area, setArea] = useState('all');
    const load = useCallback(() => get('/v1/tables').then(setData).catch((e) => pos.onError(e)), []); // eslint-disable-line
    useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
    if (!data) return <ActivityIndicator color={COLORS.brand} className="mt-10" />;
    const tables = (data.tables || []).filter((t) => area === 'all' || t.area_id === area);
    const busy = (data.tables || []).filter((t) => t.persons > 0).length;
    const guests = (data.tables || []).reduce((s, t) => s + (Number(t.persons) || 0), 0);
    const cols = isTablet ? 4 : 2;
    const w = isTablet ? (width - 84 - 36 - 12 * (cols - 1)) / cols : (width - 36 - 12) / 2;
    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
            <View className="flex-row items-center justify-between mb-3">
                <Text className="text-[22px] font-extrabold text-ink">Tables</Text>
                <Pressable onPress={load} className="flex-row items-center"><RefreshCw size={15} color={COLORS.ink2} /><Text className="ml-1 text-ink-2 font-semibold">Refresh</Text></Pressable>
            </View>
            <View className="flex-row mb-3" style={{ gap: 12 }}>
                <View className="flex-1 bg-card rounded-2xl border border-line p-3"><Text className="text-ink-2 text-[12.5px] font-semibold">Occupied</Text><Text className="text-[22px] font-extrabold text-ink">{busy} <Text className="text-ink-3 text-[14px]">/ {(data.tables || []).length}</Text></Text></View>
                <View className="flex-1 bg-card rounded-2xl border border-line p-3"><Text className="text-ink-2 text-[12.5px] font-semibold">Guests seated</Text><Text className="text-[22px] font-extrabold text-ink">{guests}</Text></View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-grow-0 mb-3">
                <Pill label="All" active={area === 'all'} onPress={() => setArea('all')} />
                {(data.areas || []).map((a) => <Pill key={a.id} label={a.name} active={area === a.id} onPress={() => setArea(a.id)} />)}
            </ScrollView>
            <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                {tables.map((t) => {
                    const used = Number(t.persons) || 0;
                    const free = used === 0;
                    const color = free ? COLORS.ok : t.status === 'full' ? COLORS.brand : '#F59E0B';
                    const orders = t.orders || [];
                    return (
                        <Pressable key={t.id} onPress={() => (orders.length === 1 ? pos.setModal({ name: 'order', id: orders[0].order_id }) : orders.length > 1 ? pos.setModal({ name: 'tableOrders', table: t }) : onStartOrder(t))}
                            className="bg-card rounded-2xl border border-line p-3.5 overflow-hidden" style={{ width: w, minHeight: 120, borderLeftWidth: 5, borderLeftColor: color }}>
                            <View className="flex-row justify-between items-center"><Text className="text-[16px] font-extrabold text-ink">{t.name}</Text>
                                <Tag text={free ? 'Free' : t.status === 'full' ? 'Occupied' : 'Partly booked'} tone={free ? 'ok' : t.status === 'full' ? 'brand' : 'warn'} /></View>
                            <View className="flex-row items-center mt-1.5"><Users size={14} color={COLORS.ink2} /><Text className="text-ink-2 text-[12.5px] ml-1.5 font-semibold">{used ? `${used}/` : ''}{t.capacity} seats</Text></View>
                            <Text className="text-ink-3 text-[12.5px] font-semibold mt-auto pt-3">{free ? 'Tap to start an order' : `${orders.length} order${orders.length === 1 ? '' : 's'} · ${orders.map((x) => x.sale_no).join(', ')}`}</Text>
                        </Pressable>
                    );
                })}
            </View>
        </ScrollView>
    );
}

export function TableOrdersSheet({ pos, table, onClose }) {
    return (
        <Sheet title={table.name} subtitle="Orders on this table" onClose={onClose} size="sm">
            {(table.orders || []).map((o) => (
                <Pressable key={o.order_id} onPress={() => pos.setModal({ name: 'order', id: o.order_id })} className="flex-row items-center justify-between px-3 py-3 rounded-xl border border-line mb-2">
                    <Text className="font-bold text-ink">#{o.sale_no}</Text><Text className="text-ink-2">{o.persons} guests</Text>
                </Pressable>
            ))}
        </Sheet>
    );
}

/* ---------------- recent sales ---------------- */
export function SalesView({ pos }) {
    const { isTablet } = useLayout();
    const [list, setList] = useState(null);
    const [q, setQ] = useState('');
    const [allDays, setAllDays] = useState(false);
    const [busy, setBusy] = useState(null);
    const load = useCallback(async () => {
        try {
            const qs = `limit=100${allDays ? '' : `&date=${today()}`}${q.trim() ? `&search=${encodeURIComponent(q.trim())}` : ''}`;
            setList(await get(`/v1/invoices?${qs}`));
        } catch (e) { setList([]); pos.onError(e); }
    }, [q, allDays]); // eslint-disable-line
    useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load, pos.sales]); // eslint-disable-line
    const reprint = async (id) => { setBusy(id); await pos.reprintInvoice(id); setBusy(null); };
    return (
        <View className="flex-1">
            <Text className="text-[22px] font-extrabold text-ink mb-3">Recent sales</Text>
            <Input value={q} onChangeText={setQ} placeholder="Invoice no, customer or phone" className="mb-3" />
            <View className="flex-row mb-3"><Pill label="Today" active={!allDays} onPress={() => setAllDays(false)} /><Pill label="All days" active={allDays} onPress={() => setAllDays(true)} /></View>
            {!list ? <ActivityIndicator color={COLORS.brand} /> : (
                <FlatList data={list} keyExtractor={(s) => String(s.id)} contentContainerStyle={{ paddingBottom: 100, gap: 8 }}
                    ListEmptyComponent={<Text className="text-ink-3 text-center mt-10">{allDays || q ? 'No sales found' : 'No sales today'}</Text>}
                    renderItem={({ item: s }) => (
                        <Pressable onPress={() => pos.setModal({ name: 'invoice', id: s.id })} className={`bg-card rounded-2xl border border-line p-3.5 active:opacity-80 ${isTablet ? 'flex-row items-center' : ''}`}>
                            <View className="flex-1">
                                <View className="flex-row items-center"><Text className="font-extrabold text-ink text-[15px]">{s.sale_no}</Text>{s.refund ? <Tag text={s.refund.refund_no || 'Credit note'} tone="warn" className="ml-2" /> : null}</View>
                                <Text className="text-ink-2 text-[12.5px]" numberOfLines={1}>{s.order_type_name} · {s.customer?.name}{s.tables_text ? ` · ${s.tables_text}` : ''} · {allDays ? s.date_time : String(s.date_time || '').slice(11, 16)}</Text>
                            </View>
                            <View className={`flex-row items-center ${isTablet ? '' : 'mt-2 justify-between'}`} style={{ gap: 8 }}>
                                <Money value={s.total_payable} bold className="font-extrabold text-ink text-[16px] mr-2" />
                                {pos.canRefund ? <Btn size="sm" icon={RotateCcw} label={s.refund ? 'Credit note' : 'Refund'} onPress={() => pos.setModal({ name: 'refund', sale: { id: s.id, sale_no: s.sale_no } })} /> : null}
                                <Btn size="sm" icon={Printer} label="Reprint" busy={busy === s.id} onPress={() => reprint(s.id)} />
                            </View>
                        </Pressable>
                    )} />
            )}
        </View>
    );
}

/* ---------------- register ---------------- */
export function OpenRegisterSheet({ pos, user, onOpened, onLogout }) {
    const [methods, setMethods] = useState(null);
    const [amounts, setAmounts] = useState({});
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const load = () => { setErr(''); get('/v1/register').then((r) => (r.open ? onOpened() : setMethods(r.payment_methods || []))).catch((e) => setErr(firstError(e))); };
    useEffect(load, []); // eslint-disable-line
    const open = async () => {
        setSaving(true);
        try { await post('/v1/register/open', { opening_details: methods.map((m) => ({ payment_method_id: m.id, amount: isLoyaltyMethod(m) ? 0 : Number(amounts[m.id]) || 0 })) }); onOpened(); }
        catch (e) { setErr(firstError(e)); } finally { setSaving(false); }
    };
    return (
        <Sheet title="Open register" onClose={() => { }} closable={false} size="sm"
            footer={<><Btn label="Log out" icon={LogOut} onPress={onLogout} className="flex-1" /><Btn label="Open register" icon={Wallet} variant="primary" busy={saving} disabled={!methods} onPress={open} className="flex-1" /></>}>
            <Text className="text-ink-2 mb-3">Hi {user?.name || ''}, your register is closed. Enter the opening balance to start.</Text>
            {err ? <Text className="text-danger font-semibold mb-2">{err}  <Text className="text-brand" onPress={load}>Try again</Text></Text> : null}
            {!methods ? (!err ? <ActivityIndicator color={COLORS.brand} /> : null) : methods.filter((m) => !isLoyaltyMethod(m)).map((m) => (
                <Field key={m.id} label={m.name}><Input keyboardType="decimal-pad" value={amounts[m.id] ?? ''} placeholder="0.00" onChangeText={(v) => setAmounts((a) => ({ ...a, [m.id]: v }))} /></Field>
            ))}
        </Sheet>
    );
}

export function RegisterSheet({ pos, onClose, onClosed }) {
    const { confirm } = useUi();
    const [s, setS] = useState(null);
    const [busy, setBusy] = useState(null);
    useEffect(() => { get('/v1/register/summary').then(setS).catch((e) => { pos.onError(e); onClose(); }); }, []); // eslint-disable-line
    const print = async () => { setBusy('print'); try { await pos.printJob(await get('/v1/register/print')); } catch (e) { pos.onError(e); } setBusy(null); };
    // A4 report -> Android's print screen: "Save as PDF" (then share it from Files), a printer, or Google Drive
    const pdf = async () => {
        setBusy('pdf');
        try {
            const s2 = await get('/v1/register/summary');
            await printDocument(registerA4Html(s2), `register-report-${String(s2.opened_at || '').slice(0, 10) || today()}`);
        } catch (e) { pos.onError(e); }
        setBusy(null);
    };
    const close = async () => {
        if (!(await confirm('Close the register and log out? The register report is printed.', { confirmLabel: 'Close register', danger: true }))) return;
        setBusy('close');
        try { const r = await post('/v1/register/close'); await pos.printJob(r.print_job); onClosed(); }
        catch (e) { pos.onError(e); setBusy(null); }
    };
    const t = s?.totals || {};
    return (
        <Sheet title="Register" subtitle={s ? `${s.user} · opened ${s.opened_at}` : ''} onClose={onClose} size="md"
            footer={s ? <><Btn icon={Printer} label="Print report" busy={busy === 'print'} onPress={print} className="flex-1" /><Btn icon={FileDown} label="PDF" busy={busy === 'pdf'} disabled={!!busy} onPress={pdf} className="flex-1" /><Btn icon={Ban} label="Close register" variant="danger" busy={busy === 'close'} onPress={close} className="flex-1" /></> : null}>
            {!s ? <ActivityIndicator color={COLORS.brand} /> : (
                <View>
                    {(s.methods || []).filter((m) => !isLoyaltyMethod(m)).map((m) => (
                        <View key={m.payment_method_id} className="flex-row items-center justify-between py-2.5 border-b border-dashed border-line">
                            <View className="flex-1"><Text className="font-bold text-ink">{m.name}</Text>
                                <Text className="text-ink-3 text-[12px]">Opening {Number(m.opening).toFixed(2)} · Sales {Number(m.sale).toFixed(2)}{Number(m.pre_order) > 0 ? ` · Pre-order ${Number(m.pre_order).toFixed(2)}` : ''}</Text></View>
                            <Money value={m.closing} bold className="font-extrabold text-ink" />
                        </View>
                    ))}
                    <View className="mt-3">
                        <Row label="Opening" value={<Money value={t.opening} className="font-bold text-ink" />} />
                        <Row label="Sales" value={<Money value={t.sale} className="font-bold text-ink" />} />
                        {Number(t.pre_order) > 0 ? <Row label="Pre-order payment" value={<Money value={t.pre_order} className="font-bold text-ink" />} /> : null}
                        {Number(t.expense) > 0 ? <Row label="Expense" value={<Money sign="−" value={t.expense} className="font-bold text-ink" />} /> : null}
                        <Row strong label="Closing balance" value={<Money value={t.closing} bold className="text-[20px] font-extrabold text-ink" />} />
                    </View>
                </View>
            )}
        </Sheet>
    );
}

/* ---------------- clear running orders (confirmed with the user's login PIN) ---------------- */
export function ClearRunningSheet({ pos, onClose }) {
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const admin = pos.user?.role === 'Admin';
    const onKey = (k) => { setErr(''); setPin((p) => (k === 'del' ? p.slice(0, -1) : k === 'clr' ? '' : (p + k).slice(0, 6))); };
    const go = async () => {
        if (!/^\d{4,6}$/.test(pin)) return setErr('Enter your login PIN.');
        setBusy(true); setErr('');
        const e = await pos.clearRunning(pin);
        if (e) { setErr(e); setPin(''); setBusy(false); }
    };
    return (
        <Sheet title="Clear running orders" onClose={() => !busy && onClose()} closable={!busy} size="sm"
            footer={<><Btn label="Cancel" disabled={busy} onPress={onClose} className="flex-1" />
                <Btn icon={Eraser} label="Clear orders" variant="danger" busy={busy} disabled={busy || pin.length < 4} onPress={go} className="flex-1" /></>}>
            <Text className="text-ink">{admin
                ? 'This removes all open orders of this outlet, from the web POS and the kitchen screen too.'
                : "This removes your open orders (orders you placed or are the waiter of) from the web POS and the kitchen screen too. Other staff's orders stay."}</Text>
            <Text className="text-ink-3 text-[13px] mt-1.5">Paid invoices are not affected. This cannot be undone.</Text>
            <Text className="text-[12.5px] font-semibold text-ink-2 mt-4 text-center">Your login PIN</Text>
            <View className="flex-row justify-center my-3" style={{ gap: 12 }} accessibilityLabel={`${pin.length} digits entered`}>
                {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                    <View key={i} className={`w-3.5 h-3.5 rounded-full ${i < pin.length ? 'bg-ink' : 'border-2 border-line'}`} />
                ))}
            </View>
            {err ? <Text className="text-danger font-semibold text-center mb-2">{err}</Text> : null}
            <View className="self-center" style={{ width: 252 }}>
                <Keypad onKey={onKey} keys={['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clr', '0', 'del']} keyClass="h-[54px]" />
            </View>
        </Sheet>
    );
}

/* ---------------- settings: printers ---------------- */
const THEMES = [{ value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }, { value: 'system', label: 'Auto', icon: Smartphone }];

export function SettingsView({ pos, user, device, onLogout, onOpenRegister, onOpenPreOrders }) {
    const { notify } = useUi();
    const theme = useTheme();
    const [routes, setRoutes] = useState(null);
    const [edit, setEdit] = useState(null);       // a row of the printer list
    useEffect(() => { getRoutes().then(setRoutes); }, []);
    const label = (r) => r.mode === 'auto' ? 'Web app printer' : r.mode === 'network' ? `Network ${r.ip || ''}` : r.mode === 'bluetooth' ? `Bluetooth · ${r.name || r.address}` : r.mode === 'usb' ? `USB · ${r.name || 'first printer'}` : 'Built-in printer';
    const web = (p) => (p ? { ...p, printer_ip_address: p.printer_ip_address ?? p.ip_address, printer_port: p.printer_port ?? p.port } : null);
    const kitchens = C.kitchens.length ? C.kitchens : [{ id: null, name: 'Kitchen', printer: null }];
    const rows = [
        { key: '*', title: 'Default printer of this device', sub: 'Used by everything below that has no printer of its own', isDefault: true },
        { key: ROLE.invoice, title: 'Invoice', sub: 'Invoices, credit notes, pre-order drafts, register report' },
        { key: ROLE.bill, title: 'Bill', sub: 'Draft bills of running orders' },
        ...kitchens.map((k) => ({
            key: k.id == null ? 'role:kot' : ROLE.kot(k.id), title: `KOT · ${k.name}`, server: web(k.printer),
            sub: k.printer ? `Web app printer: ${k.printer.title}${k.printer.ip_address ? ` (${k.printer.ip_address})` : ''}` : 'Kitchen order tickets'
        })),
    ];
    const shown = (r) => {
        const own = routes?.[r.key];
        if (own) return label(own);
        if (r.isDefault) return 'Not set';
        return routes?.['*'] ? `Default (${label(routes['*'])})` : 'Web app printer';
    };
    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
            <Text className="text-[22px] font-extrabold text-ink mb-3">Settings</Text>
            <View className="bg-card rounded-2xl border border-line p-4 mb-4">
                <View className="flex-row items-center"><Monitor size={18} color={COLORS.ink2} /><Text className="ml-2 font-bold text-ink flex-1">{device?.device_name} · {device?.outlet_name}</Text></View>
                <Text className="text-ink-2 mt-1">Logged in as {user?.name}{user?.role ? ` (${user.role})` : ''}</Text>
                <View className="flex-row mt-3" style={{ gap: 8 }}>
                    {!pos.isWaiter ? <Btn icon={Wallet} label="Register" onPress={onOpenRegister} className="flex-1" /> : null}
                    <Btn icon={LogOut} label="Log out" onPress={onLogout} className="flex-1" />
                </View>
            </View>
            {onOpenPreOrders && pos.canPay ? (
                <Pressable onPress={onOpenPreOrders} className="bg-card rounded-2xl border border-line p-4 mb-4 flex-row items-center active:opacity-80">
                    <View className="w-10 h-10 rounded-xl bg-brand-tint items-center justify-center"><CalendarClock size={20} color={COLORS.brand} /></View>
                    <View className="flex-1 ml-3"><Text className="font-extrabold text-ink text-[16px]">Pre-orders</Text><Text className="text-ink-2 text-[13px]">Orders for a later date: add, prepare, deliver</Text></View>
                    <ChevronRight size={20} color={COLORS.ink3} />
                </Pressable>
            ) : null}
            <View className="bg-card rounded-2xl border border-line p-4 mb-4">
                <Text className="font-extrabold text-ink text-[16px]">Appearance</Text>
                <Text className="text-ink-2 text-[13px] mb-3">Auto follows the light / dark setting of this device.</Text>
                <Segment options={THEMES} value={theme.mode} onChange={theme.setMode} />
            </View>
            <View className="bg-card rounded-2xl border border-line p-4 mb-4">
                <Text className="font-extrabold text-ink text-[16px] mb-2">Printing</Text>
                <View className="flex-row items-center justify-between py-2"><Text className="text-ink">Print KOT when an order is placed</Text><Switch value={pos.prefs.printKot} onValueChange={(v) => pos.savePrefs({ ...pos.prefs, printKot: v })} trackColor={{ true: COLORS.brand }} /></View>
                <View className="flex-row items-center justify-between py-2"><Text className="text-ink">Print the invoice after payment</Text><Switch value={pos.prefs.printInvoice} onValueChange={(v) => pos.savePrefs({ ...pos.prefs, printInvoice: v })} trackColor={{ true: COLORS.brand }} /></View>
            </View>
            <View className="bg-card rounded-2xl border border-line p-4">
                <Text className="font-extrabold text-ink text-[16px]">Printers</Text>
                <Text className="text-ink-2 text-[13px] mb-2">Choose where each receipt prints on this device. Anything without its own printer uses the default printer; with no default, the printer set in the web app.</Text>
                {!routes ? <ActivityIndicator color={COLORS.brand} /> : rows.map((r) => (
                    <Pressable key={r.key} onPress={() => setEdit(r)} accessibilityLabel={r.title} className="flex-row items-center py-3 border-t border-line active:opacity-70">
                        <View className="flex-1 pr-2"><Text className="font-bold text-ink">{r.title}</Text><Text className="text-ink-3 text-[12px]">{r.sub}</Text></View>
                        <Text className={`font-semibold text-[13px] text-right max-w-[45%] ${routes[r.key] ? 'text-brand' : 'text-ink-3'}`} numberOfLines={2}>{shown(r)}</Text>
                    </Pressable>
                ))}
            </View>
            {edit ? <PrinterSheet row={edit} route={routes[edit.key]} onClose={() => setEdit(null)}
                onSave={async (route) => { setRoutes(await setRoute(edit.key, route)); setEdit(null); notify('Printer saved'); }} /> : null}
        </ScrollView>
    );
}

function PrinterSheet({ row, route, onClose, onSave }) {
    const [mode, setMode] = useState(route?.mode || (row.isDefault ? 'builtin' : 'default'));
    const [ip, setIp] = useState(route?.ip || row.server?.printer_ip_address || '');
    const [port, setPort] = useState(String(route?.port || row.server?.printer_port || 9100));
    const [bt, setBt] = useState(null);
    const [usb, setUsb] = useState(null);
    const [sel, setSel] = useState(route || null);
    const [err, setErr] = useState('');
    const [testing, setTesting] = useState(false);
    useEffect(() => {
        setErr('');
        if (mode === 'bluetooth' && !bt) listBluetooth().then(setBt).catch((e) => { setBt([]); setErr(e.message); });
        if (mode === 'usb' && !usb) listUsb().then(setUsb).catch((e) => { setUsb([]); setErr(e.message); });
    }, [mode]); // eslint-disable-line
    const current = () => mode === 'default' ? 'default' : mode === 'auto' ? { mode: 'auto' } : mode === 'network' ? { mode, ip: ip.trim(), port: Number(port) || 9100 }
        : mode === 'bluetooth' ? (sel?.mode === 'bluetooth' ? sel : null) : mode === 'usb' ? (sel?.mode === 'usb' ? sel : { mode: 'usb', deviceName: '', name: 'first USB printer' }) : { mode: 'builtin' };
    const test = async () => {
        const r = current();
        if (!r) return setErr('Choose a printer first.');
        let target = r;
        if (r === 'default') { target = (await getRoutes())['*']; if (!target) return setErr('No default printer is set on this device yet.'); }
        if (target.mode === 'auto') {
            if (!row.server?.printer_ip_address) return setErr('The web app printer is used when a receipt prints. Print a receipt to test it.');
            target = { mode: 'network', ip: row.server.printer_ip_address, port: row.server.printer_port };
        }
        setTesting(true); setErr('');
        try { await sendTo(target, testPage(row.title), row.server); } catch (e) { setErr(e.message); }
        setTesting(false);
    };
    const modes = [...(row.isDefault ? [] : [{ id: 'default', label: 'Use the default printer of this device' }, { id: 'auto', label: 'Printer from the web app (network address)' }]), ...MODES];
    const ModeIcon = { default: Printer, auto: RefreshCw, network: Wifi, bluetooth: Bluetooth, usb: Usb, builtin: Cpu };
    return (
        <Sheet title={row.title} subtitle="Where it prints on this device" onClose={onClose} size="md"
            footer={<><Btn label="Test print" icon={Printer} busy={testing} onPress={test} className="flex-1" /><Btn label="Save" variant="primary" disabled={!current()} onPress={() => onSave(current() === 'default' ? null : current())} className="flex-1" /></>}>
            {modes.map((m) => {
                const Icon = ModeIcon[m.id];
                const on = mode === m.id;
                return (
                    <Pressable key={m.id} onPress={() => setMode(m.id)} accessibilityLabel={m.label} className={`flex-row items-center px-3 h-12 rounded-xl mb-1.5 border ${on ? 'border-brand bg-brand-tint' : 'border-line'}`}>
                        <Icon size={18} color={on ? COLORS.brand : COLORS.ink2} /><Text className={`ml-2 font-semibold flex-1 ${on ? 'text-brand-dark' : 'text-ink'}`}>{m.label}</Text>{on ? <Check size={18} color={COLORS.brand} /> : null}
                    </Pressable>
                );
            })}
            {mode === 'network' ? <View className="flex-row mt-2" style={{ gap: 8 }}>
                <Field label="IP address" className="flex-[2]"><Input value={ip} onChangeText={setIp} keyboardType="numeric" placeholder="192.168.1.50" /></Field>
                <Field label="Port" className="flex-1"><Input value={port} onChangeText={setPort} keyboardType="number-pad" /></Field></View> : null}
            {mode === 'bluetooth' ? (
                <View className="mt-2">
                    <Text className="text-ink-2 text-[12.5px] mb-1">Paired printers (pair new ones in Android Bluetooth settings)</Text>
                    {!bt ? <ActivityIndicator color={COLORS.brand} /> : bt.map((d) => {
                        const on = sel?.mode === 'bluetooth' && sel.address === d.address;
                        return <Pressable key={d.address} onPress={() => setSel({ mode: 'bluetooth', address: d.address, name: d.name })} className={`flex-row items-center px-3 py-3 rounded-xl mb-1 ${on ? 'bg-brand-tint' : ''}`}>
                            <Bluetooth size={16} color={COLORS.ink2} /><Text className="ml-2 font-bold text-ink flex-1">{d.name}</Text><Text className="text-ink-3 text-[12px]">{d.address}</Text></Pressable>;
                    })}
                </View>
            ) : null}
            {mode === 'usb' ? (
                <View className="mt-2">
                    {!usb ? <ActivityIndicator color={COLORS.brand} /> : !usb.length ? <Text className="text-ink-2">No USB printer is connected. The first printer plugged in will be used.</Text> : usb.map((d) => {
                        const on = sel?.mode === 'usb' && sel.deviceName === d.deviceName;
                        return <Pressable key={d.deviceName} onPress={() => setSel({ mode: 'usb', deviceName: d.deviceName, name: d.name })} className={`flex-row items-center px-3 py-3 rounded-xl mb-1 ${on ? 'bg-brand-tint' : ''}`}>
                            <Usb size={16} color={COLORS.ink2} /><Text className="ml-2 font-bold text-ink flex-1">{d.name}</Text>{d.printer ? <Tag text="Printer" tone="ok" /> : null}</Pressable>;
                    })}
                </View>
            ) : null}
            {mode === 'builtin' ? <Text className="text-ink-2 mt-2">Uses the printer inside the POS terminal (Sunmi, iMin and similar).</Text> : null}
            {err ? <Text className="text-danger font-semibold mt-3">{err}</Text> : null}
        </Sheet>
    );
}