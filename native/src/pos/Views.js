// Running orders, tables overview, recent sales, register and settings (printers).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { Armchair, ShoppingBag, Truck, Clock3, ChefHat, Receipt, Banknote, Pencil, Printer, Ban, Eye, LayoutGrid, Users, Wallet, LogOut, Bluetooth, Usb, Wifi, Cpu, RefreshCw, Check, Monitor, Sun, Moon, Smartphone, RotateCcw, CalendarClock, ChevronRight, Eraser, FileDown, FileClock, Trash2 } from 'lucide-react-native';
import { get, post } from '../lib/api';
import { C, TYPE_KEY, isLoyaltyMethod } from '../lib/catalog';
import { firstError, minutesAgo, today } from '../lib/format';
import { listBluetooth, listUsb, getRoutes, setRoute, sendTo, testPage, MODES, ROLE, printDocument } from '../lib/printer';
import { PAPERS, getPaper, setPaper, paperOf, paperUsed } from '../lib/paper';
import { registerA4Html } from '../lib/reports';
import { Btn, COLORS, Field, Input, Keypad, Money, Pill, Row, Segment, Sheet, Tag, useLayout, useTheme, useUi } from '../ui';
import { flipX, LANGS, tr, trn, useLang } from '../lib/i18n';

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
                <View><Text className="text-[22px] font-extrabold text-ink">{tr("Running orders")}</Text>
                    <View className="flex-row items-center"><Text className="text-ink-2">{pos.running.length} {tr("open ·")} </Text><Money value={total} className="text-ink-2" /></View></View>
                <View className="flex-row" style={{ gap: 8 }}>
                    <Btn size="sm" icon={FileClock} label={tr("Drafts ({length})", { length: pos.drafts.length })} accessibilityLabel={tr("Drafts")} onPress={() => pos.setModal({ name: 'drafts' })} />
                    <Btn size="sm" icon={Eraser} label={tr("Clear running orders")} onPress={() => pos.setModal({ name: 'clearRunning' })} />
                </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-grow-0 mb-3">
                <Pill label={tr("All")} count={pos.running.length} active={type === 'all'} onPress={() => setType('all')} />
                <Pill label={tr("Dine In")} icon={Armchair} count={count('dine')} active={type === 'dine'} onPress={() => setType('dine')} />
                <Pill label={tr("Take Away")} icon={ShoppingBag} count={count('take')} active={type === 'take'} onPress={() => setType('take')} />
                <Pill label={tr("Delivery")} icon={Truck} count={count('delivery')} active={type === 'delivery'} onPress={() => setType('delivery')} />
            </ScrollView>
            <FlatList data={list} key={cols} numColumns={cols} keyExtractor={(o) => String(o.id)}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await pos.refreshRunning(); setRefreshing(false); }} />}
                columnWrapperStyle={cols > 1 ? { gap: 12 } : undefined} contentContainerStyle={{ gap: 12, paddingBottom: 100 }}
                ListEmptyComponent={<Text className="text-ink-3 text-center mt-10">{tr("No running orders")}</Text>}
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
                                    <Btn size="sm" icon={Receipt} label={tr("Bill")} onPress={() => pos.printBill(o.id)} />
                                    {pos.canInvoice ? <Btn size="sm" icon={Banknote} label={tr("Pay")} variant="primary" onPress={() => pos.openOrderPayment(o.id)} /> : null}
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
    if (!o) return <Sheet title={tr("Order")} onClose={onClose} size="md"><ActivityIndicator color={COLORS.brand} /></Sheet>;
    if (cancelling) {
        return (
            <Sheet title={tr("Cancel order #{v1}", { v1: o.order_number || o.sale_no })} onClose={onClose} size="sm"
                footer={<><Btn label={tr("Back")} onPress={() => setCancelling(false)} className="flex-1" /><Btn label={tr("Cancel order")} variant="danger" disabled={!reason.trim()} onPress={() => pos.cancelOrder(o.id, reason.trim())} className="flex-1" /></>}>
                <Field label={tr("Reason")}><Input value={reason} onChangeText={setReason} placeholder={tr("e.g. customer left")} autoFocus /></Field>
            </Sheet>
        );
    }
    return (
        <Sheet title={tr("Order #{v1}", { v1: o.order_number || o.sale_no })} subtitle={`${o.order_type_name}${o.tables_text ? ` · ${o.tables_text}` : ''} · ${o.customer?.name || ''}`} onClose={onClose} size="md"
            footer={<View className="flex-1" style={{ gap: 8 }}>
                <View className="flex-row" style={{ gap: 8 }}>
                    {o.can_modify ? <Btn icon={Pencil} label={tr("Modify")} onPress={async () => { if (await pos.modifyOrder(o.id)) onClose(); }} className="flex-1" /> : null}
                    <Btn icon={Printer} label={tr("KOT")} onPress={() => { pos.reprintKot(o.id); onClose(); }} className="flex-1" />
                    <Btn icon={Receipt} label={tr("Bill")} onPress={() => { pos.printBill(o.id); onClose(); }} className="flex-1" />
                </View>
                <View className="flex-row" style={{ gap: 8 }}>
                    {o.can_modify ? <Btn icon={Ban} label={tr("Cancel")} textClass="text-danger" onPress={async () => { if (await confirm(tr("Cancel this order? The kitchen will be told."), { confirmLabel: tr("Yes, cancel"), danger: true })) setCancelling(true); }} className="flex-1" /> : null}
                    {pos.canInvoice ? <Btn icon={Banknote} variant="primary" label={tr("Pay")} onPress={() => pos.openOrderPayment(o.id)} className="flex-[2]"
                        right={<View className="ml-2"><Money value={o.totals.total_payable} bold className="text-white font-extrabold" /></View>} /> : null}
                </View>
            </View>}>
            {o.items.map((l) => (
                <View key={l.line_id} className="flex-row justify-between py-2.5 border-b border-dashed border-line">
                    <View className="flex-1 pr-3"><Text className="font-bold text-ink">{l.qty} × {l.name}{l.is_free ? tr("  (free)") : ''}</Text>
                        {(l.modifiers || []).length || l.note ? <Text className="text-ink-3 text-[12.5px]">{[(l.modifiers || []).map((m) => m.name).join(', '), l.note].filter(Boolean).join(' · ')}</Text> : null}</View>
                    <Money value={l.line_total ?? l.price_with_discount} className="font-bold text-ink" />
                </View>
            ))}
            <View className="mt-2">
                <Row label={tr("VAT")} value={<Money value={o.totals.total_vat} className="font-bold text-ink" />} />
                <Row strong label={tr("Total")} value={<Money value={o.totals.total_payable} bold className="text-[20px] font-extrabold text-ink" />} />
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
                <Text className="text-[22px] font-extrabold text-ink">{tr("Tables")}</Text>
                <Pressable onPress={load} className="flex-row items-center"><RefreshCw size={15} color={COLORS.ink2} /><Text className="ml-1 text-ink-2 font-semibold">{tr("Refresh")}</Text></Pressable>
            </View>
            <View className="flex-row mb-3" style={{ gap: 12 }}>
                <View className="flex-1 bg-card rounded-2xl border border-line p-3"><Text className="text-ink-2 text-[12.5px] font-semibold">{tr("Occupied")}</Text><Text className="text-[22px] font-extrabold text-ink">{busy} <Text className="text-ink-3 text-[14px]">/ {(data.tables || []).length}</Text></Text></View>
                <View className="flex-1 bg-card rounded-2xl border border-line p-3"><Text className="text-ink-2 text-[12.5px] font-semibold">{tr("Guests seated")}</Text><Text className="text-[22px] font-extrabold text-ink">{guests}</Text></View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-grow-0 mb-3">
                <Pill label={tr("All")} active={area === 'all'} onPress={() => setArea('all')} />
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
                                <Tag text={free ? tr("Free") : t.status === 'full' ? tr("Occupied") : tr("Partly booked")} tone={free ? 'ok' : t.status === 'full' ? 'brand' : 'warn'} /></View>
                            <View className="flex-row items-center mt-1.5"><Users size={14} color={COLORS.ink2} /><Text className="text-ink-2 text-[12.5px] ml-1.5 font-semibold">{used ? `${used}/` : ''}{t.capacity} {tr("seats")}</Text></View>
                            <Text className="text-ink-3 text-[12.5px] font-semibold mt-auto pt-3">{free ? tr("Tap to start an order") : `${trn(orders.length, '{n} order', '{n} orders')} · ${orders.map((x) => x.sale_no).join(', ')}`}</Text>
                        </Pressable>
                    );
                })}
            </View>
        </ScrollView>
    );
}

export function TableOrdersSheet({ pos, table, onClose }) {
    return (
        <Sheet title={table.name} subtitle={tr("Orders on this table")} onClose={onClose} size="sm">
            {(table.orders || []).map((o) => (
                <Pressable key={o.order_id} onPress={() => pos.setModal({ name: 'order', id: o.order_id })} className="flex-row items-center justify-between px-3 py-3 rounded-xl border border-line mb-2">
                    <Text className="font-bold text-ink">#{o.sale_no}</Text><Text className="text-ink-2">{o.persons} {tr("guests")}</Text>
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
            <Text className="text-[22px] font-extrabold text-ink mb-3">{tr("Recent sales")}</Text>
            <Input value={q} onChangeText={setQ} placeholder={tr("Invoice no, customer or phone")} className="mb-3" />
            <View className="flex-row mb-3"><Pill label={tr("Today")} active={!allDays} onPress={() => setAllDays(false)} /><Pill label={tr("All days")} active={allDays} onPress={() => setAllDays(true)} /></View>
            {!list ? <ActivityIndicator color={COLORS.brand} /> : (
                <FlatList data={list} keyExtractor={(s) => String(s.id)} contentContainerStyle={{ paddingBottom: 100, gap: 8 }}
                    ListEmptyComponent={<Text className="text-ink-3 text-center mt-10">{allDays || q ? tr("No sales found") : tr("No sales today")}</Text>}
                    renderItem={({ item: s }) => (
                        <Pressable onPress={() => pos.setModal({ name: 'invoice', id: s.id })} className={`bg-card rounded-2xl border border-line p-3.5 active:opacity-80 ${isTablet ? 'flex-row items-center' : ''}`}>
                            <View className="flex-1">
                                <View className="flex-row items-center"><Text className="font-extrabold text-ink text-[15px]">{s.sale_no}</Text>{s.refund ? <Tag text={s.refund.refund_no || tr("Credit note")} tone="warn" className="ml-2" /> : null}</View>
                                <Text className="text-ink-2 text-[12.5px]" numberOfLines={1}>{s.order_type_name} · {s.customer?.name}{s.tables_text ? ` · ${s.tables_text}` : ''} · {allDays ? s.date_time : String(s.date_time || '').slice(11, 16)}</Text>
                            </View>
                            <View className={`flex-row items-center ${isTablet ? '' : 'mt-2 justify-between'}`} style={{ gap: 8 }}>
                                <Money value={s.total_payable} bold className="font-extrabold text-ink text-[16px] mr-2" />
                                {pos.canRefund ? <Btn size="sm" icon={RotateCcw} label={s.refund ? tr("Credit note") : tr("Refund")} onPress={() => pos.setModal({ name: 'refund', sale: { id: s.id, sale_no: s.sale_no } })} /> : null}
                                <Btn size="sm" icon={Printer} label={tr("Reprint")} busy={busy === s.id} onPress={() => reprint(s.id)} />
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
        <Sheet title={tr("Open register")} onClose={() => { }} closable={false} size="sm"
            footer={<><Btn label={tr("Log out")} icon={LogOut} onPress={onLogout} className="flex-1" /><Btn label={tr("Open register")} icon={Wallet} variant="primary" busy={saving} disabled={!methods} onPress={open} className="flex-1" /></>}>
            <Text className="text-ink-2 mb-3">{tr('Hi {name}, your register is closed. Enter the opening balance to start.', { name: user?.name || '' })}</Text>
            {err ? <Text className="text-danger font-semibold mb-2">{err}  <Text className="text-brand" onPress={load}>{tr("Try again")}</Text></Text> : null}
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
        if (!(await confirm(tr("Close the register and log out? The register report is printed."), { confirmLabel: tr("Close register"), danger: true }))) return;
        setBusy('close');
        try { const r = await post('/v1/register/close'); await pos.printJob(r.print_job); onClosed(); }
        catch (e) { pos.onError(e); setBusy(null); }
    };
    const t = s?.totals || {};
    return (
        <Sheet title={tr("Register")} subtitle={s ? tr("{user} · opened {opened_at}", { user: s.user, opened_at: s.opened_at }) : ''} onClose={onClose} size="md"
            footer={s ? <><Btn icon={Printer} label={tr("Print report")} busy={busy === 'print'} onPress={print} className="flex-1" /><Btn icon={FileDown} label={tr("PDF")} busy={busy === 'pdf'} disabled={!!busy} onPress={pdf} className="flex-1" /><Btn icon={Ban} label={tr("Close register")} variant="danger" busy={busy === 'close'} onPress={close} className="flex-1" /></> : null}>
            {!s ? <ActivityIndicator color={COLORS.brand} /> : (
                <View>
                    {(s.methods || []).filter((m) => !isLoyaltyMethod(m)).map((m) => (
                        <View key={m.payment_method_id} className="flex-row items-center justify-between py-2.5 border-b border-dashed border-line">
                            <View className="flex-1"><Text className="font-bold text-ink">{m.name}</Text>
                                <Text className="text-ink-3 text-[12px]">{tr("Opening")} {Number(m.opening).toFixed(2)} {tr("· Sales")} {Number(m.sale).toFixed(2)}{Number(m.pre_order) > 0 ? tr(" · Pre-order {v1}", { v1: Number(m.pre_order).toFixed(2) }) : ''}</Text></View>
                            <Money value={m.closing} bold className="font-extrabold text-ink" />
                        </View>
                    ))}
                    <View className="mt-3">
                        <Row label={tr("Opening")} value={<Money value={t.opening} className="font-bold text-ink" />} />
                        <Row label={tr("Sales")} value={<Money value={t.sale} className="font-bold text-ink" />} />
                        {Number(t.pre_order) > 0 ? <Row label={tr("Pre-order payment")} value={<Money value={t.pre_order} className="font-bold text-ink" />} /> : null}
                        {Number(t.expense) > 0 ? <Row label={tr("Expense")} value={<Money sign="−" value={t.expense} className="font-bold text-ink" />} /> : null}
                        <Row strong label={tr("Closing balance")} value={<Money value={t.closing} bold className="text-[20px] font-extrabold text-ink" />} />
                    </View>
                </View>
            )}
        </Sheet>
    );
}

/* ---------------- log out / close the app while the register is open ---------------- */
// Same choices as the desktop app: close the register first (prints the report), leave it open, or stay.
// Print / PDF give the register report without closing the register.
export function LeaveSheet({ pos, exit, onClose, onLeave }) {
    const [busy, setBusy] = useState(null);
    const go = async (closeRegister) => {
        setBusy(closeRegister ? 'close' : 'keep');
        if (closeRegister) {
            try {
                const r = await post('/v1/register/close');
                pos.setRegisterOpen(false);
                await pos.printJob(r.print_job);              // web: Escposbuilder::buildRegister on the receipt printer
            } catch (e) {
                if (e?.code !== 'REGISTER_CLOSED') { pos.onError(e, tr("The register was not closed.")); setBusy(null); return; }
            }
        }
        onLeave();
    };
    const printIt = async () => { setBusy('print'); try { await pos.printJob(await get('/v1/register/print')); } catch (e) { pos.onError(e); } setBusy(null); };
    const pdfIt = async () => {
        setBusy('pdf');
        try { const s2 = await get('/v1/register/summary'); await printDocument(registerA4Html(s2), `register-report-${String(s2.opened_at || '').slice(0, 10) || today()}`); }
        catch (e) { pos.onError(e); }
        setBusy(null);
    };
    return (
        <Sheet title={exit ? tr("Close the app") : tr("Log out")} onClose={() => !busy && onClose()} closable={!busy} size="md"
            footer={<View className="flex-1" style={{ gap: 8 }}>
                <View className="flex-row" style={{ gap: 8 }}>
                    <Btn icon={Printer} label={tr("Print report")} busy={busy === 'print'} disabled={!!busy} onPress={printIt} className="flex-1" />
                    <Btn icon={FileDown} label={tr("PDF")} busy={busy === 'pdf'} disabled={!!busy} onPress={pdfIt} className="flex-1" />
                </View>
                <Btn icon={LogOut} label={exit ? tr("Exit without closing") : tr("Log out without closing")} busy={busy === 'keep'} disabled={!!busy} onPress={() => go(false)} />
                <Btn icon={Ban} variant="danger" label={exit ? tr("Close register & exit") : tr("Close register & log out")} busy={busy === 'close'} disabled={!!busy} onPress={() => go(true)} />
            </View>}>
            <View className="flex-row items-start">
                <View className="w-11 h-11 rounded-xl bg-warn-bg items-center justify-center"><Wallet size={22} color={COLORS.warn} /></View>
                <View className="flex-1 ml-3">
                    <Text className="text-ink text-[15px] font-semibold">{exit ? tr('Your register is still open. Do you want to close the register before you close the app?') : tr('Your register is still open. Do you want to close the register before you log out?')}</Text>
                    <Text className="text-ink-3 text-[13px] mt-1.5">{tr("Print or save the register report without closing the register. Closing the register prints it too.")}</Text>
                </View>
            </View>
        </Sheet>
    );
}

/* ---------------- drafts (orders parked with "Draft") ---------------- */
export function DraftsSheet({ pos, onClose }) {
    const [busy, setBusy] = useState(null);
    useEffect(() => { pos.refreshDrafts(); }, []); // eslint-disable-line
    const restore = async (d) => { setBusy(`r${d.id}`); const ok = await pos.restoreDraft(d); if (!ok) setBusy(null); };
    const remove = async (d) => { setBusy(`d${d.id}`); await pos.deleteDraft(d); setBusy(null); };
    return (
        <Sheet title={tr("Drafts")} subtitle={pos.drafts.length ? tr("{length} saved", { length: pos.drafts.length }) : ''} onClose={onClose} size="md">
            {!pos.drafts.length ? <Text className="text-ink-3">{tr("No drafts yet. Use Draft on an order to park it and come back to it.")}</Text> : pos.drafts.map((d) => (
                <View key={d.id} className="flex-row items-center py-3 border-b border-line">
                    <View className="flex-1 pr-2">
                        <Text className="font-bold text-ink" numberOfLines={1}>{d.customer?.name || tr("Customer")}</Text>
                        <Text className="text-ink-3 text-[12.5px]" numberOfLines={2}>{d.total_items} {tr("item")}{Number(d.total_items) === 1 ? '' : 's'}{d.name ? ` · ${d.name}` : ''}{d.saved_at ? ` · ${d.saved_at}` : ''}</Text>
                    </View>
                    <Money value={d.total_payable} bold className="font-extrabold text-ink mr-2" />
                    <Btn size="sm" label={tr("Restore")} variant="primary" busy={busy === `r${d.id}`} disabled={!!busy} onPress={() => restore(d)} accessibilityLabel={tr("Restore draft {id}", { id: d.id })} />
                    <Pressable onPress={() => remove(d)} disabled={!!busy} accessibilityLabel={tr("Delete draft {id}", { id: d.id })} className="w-10 h-10 items-center justify-center ml-1 active:opacity-60">
                        {busy === `d${d.id}` ? <ActivityIndicator color={COLORS.danger} /> : <Trash2 size={18} color={COLORS.danger} />}
                    </Pressable>
                </View>
            ))}
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
        if (!/^\d{4,6}$/.test(pin)) return setErr(tr("Enter your login PIN."));
        setBusy(true); setErr('');
        const e = await pos.clearRunning(pin);
        if (e) { setErr(e); setPin(''); setBusy(false); }
    };
    return (
        <Sheet title={tr("Clear running orders")} onClose={() => !busy && onClose()} closable={!busy} size="sm"
            footer={<><Btn label={tr("Cancel")} disabled={busy} onPress={onClose} className="flex-1" />
                <Btn icon={Eraser} label={tr("Clear orders")} variant="danger" busy={busy} disabled={busy || pin.length < 4} onPress={go} className="flex-1" /></>}>
            <Text className="text-ink">{admin
                ? tr("This removes all open orders of this outlet, from the web POS and the kitchen screen too.")
                : tr("This removes your open orders (orders you placed or are the waiter of) from the web POS and the kitchen screen too. Other staff's orders stay.")}</Text>
            <Text className="text-ink-3 text-[13px] mt-1.5">{tr("Paid invoices are not affected. This cannot be undone.")}</Text>
            <Text className="text-[12.5px] font-semibold text-ink-2 mt-4 text-center">{tr("Your login PIN")}</Text>
            <View className="flex-row justify-center my-3" style={{ gap: 12 }} accessibilityLabel={tr("{length} digits entered", { length: pin.length })}>
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
    const lang = useLang();
    const [routes, setRoutes] = useState(null);
    const [paper, setPaperMap] = useState({});    // 58 / 80 mm per receipt type, this device only
    const [edit, setEdit] = useState(null);       // a row of the printer list
    useEffect(() => { getRoutes().then(setRoutes); getPaper().then(setPaperMap); }, []);
    const label = (r) => r.mode === 'auto' ? tr('Web app printer') : r.mode === 'network' ? tr('Network {ip}', { ip: r.ip || '' }) : r.mode === 'bluetooth' ? tr('Bluetooth · {name}', { name: r.name || r.address }) : r.mode === 'usb' ? tr('USB · {name}', { name: r.name || tr('first printer') }) : tr('Built-in printer');
    const web = (p) => (p ? { ...p, printer_ip_address: p.printer_ip_address ?? p.ip_address, printer_port: p.printer_port ?? p.port } : null);
    const kitchens = C.kitchens.length ? C.kitchens : [{ id: null, name: tr('Kitchen'), printer: null }];
    const rows = [
        { key: '*', title: tr("Default printer of this device"), sub: tr("Used by everything below that has no printer of its own"), isDefault: true },
        { key: ROLE.invoice, title: tr("Invoice"), sub: tr("Invoices, credit notes, pre-order drafts, register report") },
        { key: ROLE.bill, title: tr("Bill"), sub: tr("Draft bills of running orders") },
        ...kitchens.map((k) => ({
            key: k.id == null ? 'role:kot' : ROLE.kot(k.id), title: tr("KOT · {name}", { name: k.name }), server: web(k.printer), kitchenName: k.id == null ? null : k.name,
            sub: k.printer ? tr("Web app printer: {title}{v2}", { title: k.printer.title, v2: k.printer.ip_address ? ` (${k.printer.ip_address})` : '' }) : tr("Kitchen order tickets")
        })),
    ];
    const shown = (r) => {
        const own = routes?.[r.key];
        if (own) return label(own);
        if (r.isDefault) return tr("Not set");
        return routes?.['*'] ? tr('Default ({name})', { name: label(routes['*']) }) : tr('Web app printer');
    };
    const mmText = (r) => tr("{mm} mm", { mm: paperUsed(paper, r.key) });
    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
            <Text className="text-[22px] font-extrabold text-ink mb-3">{tr("Settings")}</Text>
            <View className="bg-card rounded-2xl border border-line p-4 mb-4">
                <View className="flex-row items-center"><Monitor size={18} color={COLORS.ink2} /><Text className="ml-2 font-bold text-ink flex-1">{device?.device_name} · {device?.outlet_name}</Text></View>
                <Text className="text-ink-2 mt-1">{tr("Logged in as")} {user?.name}{user?.role ? ` (${user.role})` : ''}</Text>
                <View className="flex-row mt-3" style={{ gap: 8 }}>
                    {!pos.isWaiter ? <Btn icon={Wallet} label={tr("Register")} onPress={onOpenRegister} className="flex-1" /> : null}
                    <Btn icon={LogOut} label={tr("Log out")} onPress={onLogout} className="flex-1" />
                </View>
            </View>
            {onOpenPreOrders && pos.canPay ? (
                <Pressable onPress={onOpenPreOrders} className="bg-card rounded-2xl border border-line p-4 mb-4 flex-row items-center active:opacity-80">
                    <View className="w-10 h-10 rounded-xl bg-brand-tint items-center justify-center"><CalendarClock size={20} color={COLORS.brand} /></View>
                    <View className="flex-1 ml-3"><Text className="font-extrabold text-ink text-[16px]">{tr("Pre-orders")}</Text><Text className="text-ink-2 text-[13px]">{tr("Orders for a later date: add, prepare, deliver")}</Text></View>
                    <ChevronRight size={20} color={COLORS.ink3} style={flipX()} />
                </Pressable>
            ) : null}
            <View className="bg-card rounded-2xl border border-line p-4 mb-4">
                <Text className="font-extrabold text-ink text-[16px]">{tr("Appearance")}</Text>
                <Text className="text-ink-2 text-[13px] mb-3">{tr("Auto follows the light / dark setting of this device.")}</Text>
                <Segment options={THEMES} value={theme.mode} onChange={theme.setMode} />
                <Text className="text-ink-2 text-[13px] mt-4 mb-2">{tr("Language")}</Text>
                <Segment options={LANGS} value={lang.lang} onChange={async (v) => { if (await lang.setLang(v) === 'restart') notify(tr('Close and open the app again to finish switching the language.'), 6000); }} />
            </View>
            <View className="bg-card rounded-2xl border border-line p-4 mb-4">
                <Text className="font-extrabold text-ink text-[16px] mb-2">{tr("Printing")}</Text>
                <View className="flex-row items-center justify-between py-2"><Text className="text-ink">{tr("Print KOT when an order is placed")}</Text><Switch value={pos.prefs.printKot} onValueChange={(v) => pos.savePrefs({ ...pos.prefs, printKot: v })} trackColor={{ true: COLORS.brand }} /></View>
                <View className="flex-row items-center justify-between py-2"><Text className="text-ink">{tr("Print the invoice after payment")}</Text><Switch value={pos.prefs.printInvoice} onValueChange={(v) => pos.savePrefs({ ...pos.prefs, printInvoice: v })} trackColor={{ true: COLORS.brand }} /></View>
            </View>
            <View className="bg-card rounded-2xl border border-line p-4">
                <Text className="font-extrabold text-ink text-[16px]">{tr("Printers")}</Text>
                <Text className="text-ink-2 text-[13px] mb-2">{tr("Choose where each receipt prints on this device. Anything without its own printer uses the default printer; with no default, the printer set in the web app.")}</Text>
                {!routes ? <ActivityIndicator color={COLORS.brand} /> : rows.map((r) => (
                    <Pressable key={r.key} onPress={() => setEdit(r)} accessibilityLabel={r.title} className="flex-row items-center py-3 border-t border-line active:opacity-70">
                        <View className="flex-1 pr-2"><Text className="font-bold text-ink">{r.title}</Text><Text className="text-ink-3 text-[12px]">{r.sub}</Text></View>
                        <View className="items-end max-w-[45%]">
                            <Text className={`font-semibold text-[13px] text-right ${routes[r.key] ? 'text-brand' : 'text-ink-3'}`} numberOfLines={2}>{shown(r)}</Text>
                            <Text className={`text-[12px] font-bold mt-0.5 ${paperOf(paper, r.key) ? 'text-brand' : 'text-ink-3'}`}>{mmText(r)}</Text>
                        </View>
                    </Pressable>
                ))}
            </View>
            {edit ? <PrinterSheet row={edit} route={routes[edit.key]} paper={paperOf(paper, edit.key)} defaultPaper={paperUsed(paper, '*')} onClose={() => setEdit(null)}
                onSave={async (route, mm) => {
                    setRoutes(await setRoute(edit.key, route));
                    setPaperMap(await setPaper(edit.key, mm, edit.kitchenName));
                    setEdit(null); notify(tr("Printer saved"));
                }} /> : null}
        </ScrollView>
    );
}

function PrinterSheet({ row, route, paper, defaultPaper, onClose, onSave }) {
    const [mode, setMode] = useState(route?.mode || (row.isDefault ? 'builtin' : 'default'));
    // paper: 0 = same as the default of this device (not for the default row itself: that one is 58 or 80)
    const [mm, setMm] = useState(row.isDefault ? (paper || 80) : (paper || 0));
    const paperOptions = [
        ...(row.isDefault ? [] : [{ value: 0, label: tr("Default ({mm} mm)", { mm: defaultPaper }) }]),
        ...PAPERS.map((p) => ({ value: p, label: tr("{mm} mm", { mm: p }) })),
    ];
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
        if (!r) return setErr(tr("Choose a printer first."));
        let target = r;
        if (r === 'default') { target = (await getRoutes())['*']; if (!target) return setErr(tr("No default printer is set on this device yet.")); }
        if (target.mode === 'auto') {
            if (!row.server?.printer_ip_address) return setErr(tr("The web app printer is used when a receipt prints. Print a receipt to test it."));
            target = { mode: 'network', ip: row.server.printer_ip_address, port: row.server.printer_port };
        }
        setTesting(true); setErr('');
        try { await sendTo(target, testPage(row.title), row.server); } catch (e) { setErr(e.message); }
        setTesting(false);
    };
    const modes = [...(row.isDefault ? [] : [{ id: 'default', label: tr("Use the default printer of this device") }, { id: 'auto', label: tr("Printer from the web app (network address)") }]), ...MODES];
    const ModeIcon = { default: Printer, auto: RefreshCw, network: Wifi, bluetooth: Bluetooth, usb: Usb, builtin: Cpu };
    return (
        <Sheet title={row.title} subtitle={tr("Where it prints on this device")} onClose={onClose} size="md"
            footer={<><Btn label={tr("Test print")} icon={Printer} busy={testing} onPress={test} className="flex-1" /><Btn label={tr("Save")} variant="primary" disabled={!current()} onPress={() => onSave(current() === 'default' ? null : current(), mm)} className="flex-1" /></>}>
            <Text className="text-[12.5px] font-semibold text-ink-2 mb-1.5">{tr("Paper size")}</Text>
            <Segment options={paperOptions} value={mm} onChange={setMm} />
            <Text className="text-ink-3 text-[12px] mt-1 mb-4">{row.isDefault ? tr("Used by every receipt below that has no paper size of its own. Only for this device.") : tr("Only for this device. The receipt is laid out for this width.")}</Text>
            <Text className="text-[12.5px] font-semibold text-ink-2 mb-1.5">{tr("Printer")}</Text>
            {modes.map((m) => {
                const Icon = ModeIcon[m.id];
                const on = mode === m.id;
                return (
                    <Pressable key={m.id} onPress={() => setMode(m.id)} accessibilityLabel={m.label} className={`flex-row items-center px-3 h-12 rounded-xl mb-1.5 border ${on ? 'border-brand bg-brand-tint' : 'border-line'}`}>
                        <Icon size={18} color={on ? COLORS.brand : COLORS.ink2} /><Text className={`ml-2 font-semibold flex-1 ${on ? 'text-brand-dark' : 'text-ink'}`}>{tr(m.label)}</Text>{on ? <Check size={18} color={COLORS.brand} /> : null}
                    </Pressable>
                );
            })}
            {mode === 'network' ? <View className="flex-row mt-2" style={{ gap: 8 }}>
                <Field label={tr("IP address")} className="flex-[2]"><Input value={ip} onChangeText={setIp} keyboardType="numeric" placeholder="192.168.1.50" /></Field>
                <Field label={tr("Port")} className="flex-1"><Input value={port} onChangeText={setPort} keyboardType="number-pad" /></Field></View> : null}
            {mode === 'bluetooth' ? (
                <View className="mt-2">
                    <Text className="text-ink-2 text-[12.5px] mb-1">{tr("Paired printers (pair new ones in Android Bluetooth settings)")}</Text>
                    {!bt ? <ActivityIndicator color={COLORS.brand} /> : bt.map((d) => {
                        const on = sel?.mode === 'bluetooth' && sel.address === d.address;
                        return <Pressable key={d.address} onPress={() => setSel({ mode: 'bluetooth', address: d.address, name: d.name })} className={`flex-row items-center px-3 py-3 rounded-xl mb-1 ${on ? 'bg-brand-tint' : ''}`}>
                            <Bluetooth size={16} color={COLORS.ink2} /><Text className="ml-2 font-bold text-ink flex-1">{d.name}</Text><Text className="text-ink-3 text-[12px]">{d.address}</Text></Pressable>;
                    })}
                </View>
            ) : null}
            {mode === 'usb' ? (
                <View className="mt-2">
                    {!usb ? <ActivityIndicator color={COLORS.brand} /> : !usb.length ? <Text className="text-ink-2">{tr("No USB printer is connected. The first printer plugged in will be used.")}</Text> : usb.map((d) => {
                        const on = sel?.mode === 'usb' && sel.deviceName === d.deviceName;
                        return <Pressable key={d.deviceName} onPress={() => setSel({ mode: 'usb', deviceName: d.deviceName, name: d.name })} className={`flex-row items-center px-3 py-3 rounded-xl mb-1 ${on ? 'bg-brand-tint' : ''}`}>
                            <Usb size={16} color={COLORS.ink2} /><Text className="ml-2 font-bold text-ink flex-1">{d.name}</Text>{d.printer ? <Tag text={tr("Printer")} tone="ok" /> : null}</Pressable>;
                    })}
                </View>
            ) : null}
            {mode === 'builtin' ? <Text className="text-ink-2 mt-2">{tr("Uses the printer inside the POS terminal (Sunmi, iMin and similar).")}</Text> : null}
            {err ? <Text className="text-danger font-semibold mt-3">{err}</Text> : null}
        </Sheet>
    );
}