// Recent sales: invoice details and the credit note (refund) of an invoice.
// The credit note is the web app's Sale/refund through the API: ZATCA reporting and the receipt are made on the server.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Banknote, Check, CreditCard, Printer, RotateCcw, ShieldCheck, Smartphone } from 'lucide-react-native';
import { get, post, newKey } from '../lib/api';
import { C } from '../lib/catalog';
import { firstError, money } from '../lib/format';
import { Btn, COLORS, Money, Row, Sheet, Stepper, Tag } from '../ui';

const ICON = { cash: Banknote, card: CreditCard, other: Smartphone };

/** payment method buttons (refund by / advance / remaining due) */
export function MethodPicker({ value, onChange }) {
    return (
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {C.paymentMethods.map((m) => {
                const on = m.id === value;
                const Icon = ICON[m.kind] || Smartphone;
                return (
                    <Pressable key={m.id} onPress={() => onChange(m.id)} accessibilityRole="button" accessibilityLabel={m.name} accessibilityState={{ selected: on }}
                        className={`h-12 px-3.5 rounded-xl flex-row items-center border ${on ? 'bg-brand-tint border-brand' : 'bg-card border-line'}`}>
                        <Icon size={18} color={on ? COLORS.brand : COLORS.ink2} />
                        <Text className={`ml-2 font-bold ${on ? 'text-brand-dark' : 'text-ink'}`}>{m.name}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

const cashFirst = () => C.paymentMethods.find((m) => m.cash)?.id ?? C.paymentMethods[0]?.id;

/* ---------------- one invoice ---------------- */
export function InvoiceSheet({ pos, id, onClose, onRefund }) {
    const [inv, setInv] = useState(null);
    const [printing, setPrinting] = useState(false);
    useEffect(() => { get(`/v1/invoices/${id}`).then(setInv).catch((e) => { pos.onError(e); onClose(); }); }, [id]); // eslint-disable-line
    const t = inv?.totals || {};
    const reprint = async () => { setPrinting(true); await pos.reprintInvoice(id); setPrinting(false); };
    return (
        <Sheet title={inv ? `Invoice ${inv.sale_no}` : 'Invoice'} subtitle={inv ? `${inv.order_type_name || ''}${inv.tables_text ? ` · ${inv.tables_text}` : ''} · ${inv.customer?.name || ''} · ${inv.date_time || ''}` : ''}
            onClose={onClose} size="md"
            footer={inv ? <>
                {pos.canRefund ? <Btn icon={RotateCcw} label={inv.refund ? 'Credit note' : 'Refund'} onPress={() => onRefund({ id: inv.id, sale_no: inv.sale_no })} className="flex-1" /> : null}
                <Btn icon={Printer} label="Reprint" variant="primary" busy={printing} onPress={reprint} className="flex-1" />
            </> : null}>
            {!inv ? <ActivityIndicator color={COLORS.brand} /> : (
                <View>
                    {inv.refund ? (
                        <View className="flex-row items-center justify-between bg-warn-bg rounded-xl px-3 py-2.5 mb-3">
                            <Text className="text-warn font-bold">Credit note {inv.refund.refund_no}</Text>
                            <Money sign="−" value={inv.refund.total} bold className="text-warn font-extrabold" />
                        </View>
                    ) : null}
                    {(inv.items || []).map((l, i) => (
                        <View key={i} className="flex-row items-start justify-between py-2.5 border-b border-dashed border-line">
                            <View className="flex-1 pr-3">
                                <Text className="font-bold text-ink">{l.qty} × {l.name}</Text>
                                {l.modifiers?.length ? <Text className="text-ink-3 text-[12px]">+ {l.modifiers.map((m) => m.name).join(', ')}</Text> : null}
                            </View>
                            <Text className="font-bold text-ink">{money(l.price_with_discount)}</Text>
                        </View>
                    ))}
                    <View className="mt-3">
                        <Row label="Subtotal" value={<Text className="font-bold text-ink">{money(t.sub_total)}</Text>} />
                        {Number(t.total_discount_amount) > 0 ? <Row label="Discount" value={<Text className="font-bold text-ok">−{money(t.total_discount_amount)}</Text>} /> : null}
                        {Number(t.charge_amount) > 0 ? <Row label={t.charge_type === 'delivery' ? 'Delivery charge' : 'Service charge'} value={<Text className="font-bold text-ink">{money(t.charge_amount)}</Text>} /> : null}
                        {Number(t.tips_amount) > 0 ? <Row label="Tips" value={<Text className="font-bold text-ink">{money(t.tips_amount)}</Text>} /> : null}
                        <Row label="VAT" value={<Text className="font-bold text-ink">{money(t.total_vat)}</Text>} />
                        <Row strong label="Total" value={<Money value={t.total_payable} bold className="text-[20px] font-extrabold text-ink" />} />
                        {(inv.payments || []).map((p, i) => <Row key={i} label={p.name} value={<Text className="text-ink">{money(p.amount)}</Text>} />)}
                        {Number(t.change_amount) > 0 ? <Row label="Given / change" value={<Text className="text-ink">{money(t.given_amount)} / {money(t.change_amount)}</Text>} /> : null}
                        {Number(t.due_amount) > 0 ? <Row label="Due" value={<Text className="font-bold text-danger">{money(t.due_amount)}</Text>} /> : null}
                    </View>
                </View>
            )}
        </Sheet>
    );
}

/* ---------------- credit note ---------------- */
export function RefundSheet({ pos, sale, onClose, onDone }) {
    const [info, setInfo] = useState(null);
    const [qty, setQty] = useState({});              // sales_details id -> qty to refund
    const [prev, setPrev] = useState(null);          // server preview of the credit note
    const [prevErr, setPrevErr] = useState('');
    const [method, setMethod] = useState(cashFirst);
    const [reason, setReason] = useState('');
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(null);          // 'save' | 'print'
    const [err, setErr] = useState('');
    const [done, setDone] = useState(null);          // { refund, zatca, print_job, printed }
    const keyRef = useRef(null);                     // one Idempotency-Key per credit note: a retry never makes two

    useEffect(() => {
        get(`/v1/invoices/${sale.id}/refund`).then((r) => { setInfo(r); if (r.refund) setDone({ refund: r.refund }); })
            .catch((e) => { pos.onError(e); onClose(); });
    }, [sale.id]); // eslint-disable-line

    const items = info?.items || [];
    const chosen = items.filter((i) => Number(qty[i.id]) > 0).map((i) => ({ id: i.id, qty: Number(qty[i.id]) }));
    const all = items.length > 0 && items.every((i) => Number(qty[i.id] || 0) === Number(i.qty));
    const sig = JSON.stringify(chosen);
    useEffect(() => {
        setConfirm(false); setErr('');
        if (!chosen.length || done) { setPrev(null); setPrevErr(''); return undefined; }
        let alive = true;
        const t = setTimeout(() => {
            post(`/v1/invoices/${sale.id}/refund/preview`, { items: chosen })
                .then((r) => { if (alive) { setPrev(r); setPrevErr(''); } })
                .catch((e) => { if (alive) { setPrev(null); setPrevErr(firstError(e)); } });
        }, 250);
        return () => { alive = false; clearTimeout(t); };
    }, [sig]); // eslint-disable-line
    const setQ = (id, v, max) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(max, v)) }));
    const toggleAll = () => setQty(all ? {} : Object.fromEntries(items.map((i) => [i.id, Number(i.qty)])));
    const rowTotal = (id) => prev?.rows?.find((r) => r.id === id)?.total;

    const printCn = async (job) => {
        setBusy('print');
        try {
            await pos.printJob(job || await get(`/v1/invoices/${sale.id}/refund/print`));
            if (job) setDone((d) => (d ? { ...d, printed: true } : d));         // next press prints a copy
        } catch (e) { pos.onError(e); } finally { setBusy(null); }
    };
    const submit = async () => {
        if (!confirm) { setConfirm(true); return; }
        setBusy('save'); setErr('');
        try {
            if (!keyRef.current) keyRef.current = newKey();
            const r = await post(`/v1/invoices/${sale.id}/refund`, { items: chosen, payment_method_id: method, reason: reason.trim() }, { idempotencyKey: keyRef.current });
            setDone(r); onDone?.(sale.id, r.refund);
            setBusy(null);
            if (!C.outlet.printPopup) await printCn(r.print_job);           // print right away, like an invoice
        } catch (e) {
            setBusy(null); setConfirm(false);
            if (['ALREADY_REFUNDED', 'ZATCA_REFUSED', 'ZATCA'].includes(e?.code)) keyRef.current = null;   // nothing saved: a new try is a new request
            setErr(firstError(e));
        }
    };

    const title = `Credit note · ${sale.sale_no}`;
    if (!info) return <Sheet title={title} onClose={onClose} size="sm"><ActivityIndicator color={COLORS.brand} /></Sheet>;

    if (done) {
        const r = done.refund;
        const reported = r.reported || (done.zatca?.phase === '2' && done.zatca?.synced);
        return (
            <Sheet title={title} onClose={onClose} size="sm"
                footer={<><Btn label="Close" onPress={onClose} className="flex-1" />
                    <Btn icon={Printer} label="Print credit note" variant="primary" busy={busy === 'print'} onPress={() => printCn(done.print_job && !done.printed ? done.print_job : null)} className="flex-1" /></>}>
                <View className="items-center py-2">
                    <View className="w-14 h-14 rounded-full bg-ok-bg items-center justify-center"><Check size={30} color={COLORS.ok} /></View>
                    <Text className="text-[19px] font-extrabold text-ink mt-2">Credit note {r.refund_no}</Text>
                    <Text className="text-ink-2 text-[13px]">Invoice {sale.sale_no}{r.date_time ? ` · ${r.date_time}` : ''}</Text>
                </View>
                <View className="mt-3">
                    <Row label="VAT" value={<Text className="font-bold text-ink">{money(r.vat)}</Text>} />
                    <Row strong label="Refund total" value={<Money value={r.total} bold className="text-[20px] font-extrabold text-ink" />} />
                    {reported ? <Row label="ZATCA" value={<View className="flex-row items-center"><ShieldCheck size={15} color={COLORS.ok} /><Text className="text-ok font-bold ml-1">Reported</Text></View>} /> : null}
                    {done.zatca && !reported && done.zatca.message ? <Text className="text-warn text-[13px] mt-1">ZATCA: {done.zatca.message}</Text> : null}
                </View>
            </Sheet>
        );
    }

    return (
        <Sheet title={title} subtitle={`Invoice total ${money(info.total_payable)}`} onClose={() => !busy && onClose()} closable={!busy} size="lg"
            footer={<>
                <Btn label="Cancel" disabled={!!busy} onPress={onClose} className="flex-1" />
                <Btn icon={RotateCcw} variant={confirm ? 'danger' : 'primary'} busy={busy === 'save'} disabled={!!busy || !prev || !chosen.length || !method} onPress={submit} className="flex-1"
                    label={confirm ? `Confirm refund ${money(prev?.total)}` : 'Make credit note'} />
            </>}>
            <View className="flex-row items-center justify-between mb-2">
                <Text className="text-ink-2 text-[13px] flex-1 pr-2">Choose what the customer returns.</Text>
                <Btn size="sm" label={all ? 'Clear' : 'Refund all'} onPress={toggleAll} />
            </View>
            {items.map((it) => {
                const q = Number(qty[it.id] || 0);
                return (
                    <View key={it.id} className="flex-row items-center py-2.5 border-b border-dashed border-line">
                        <View className="flex-1 pr-2">
                            <Text className="font-bold text-ink" numberOfLines={2}>{it.name}</Text>
                            <Text className="text-ink-3 text-[12px]">{money(it.unit_price)} · sold {it.qty}{it.is_free ? ' · free' : ''}{it.discount && it.discount !== '0' ? ` · discount ${it.discount}` : ''}
                                {it.modifiers?.length ? ` · + ${it.modifiers.map((m) => m.name).join(', ')}` : ''}</Text>
                        </View>
                        <Stepper value={q} onChange={(v) => setQ(it.id, v, Number(it.qty))} />
                        <Text className="w-[72px] text-right font-bold text-ink">{q > 0 ? (rowTotal(it.id) != null ? money(rowTotal(it.id)) : '…') : ''}</Text>
                    </View>
                );
            })}
            <Text className="text-[12.5px] font-semibold text-ink-2 mt-4 mb-1.5">Refund by</Text>
            <MethodPicker value={method} onChange={setMethod} />
            <Text className="text-[12.5px] font-semibold text-ink-2 mt-4 mb-1.5">Reason</Text>
            <TextInput value={reason} onChangeText={setReason} maxLength={300} placeholder="e.g. Item returned" placeholderTextColor={COLORS.ink3}
                className="h-12 rounded-xl border border-line bg-card px-3 text-[15px] text-ink" />
            <View className="mt-4 bg-soft rounded-xl p-3">
                {!chosen.length ? <Text className="text-ink-3">Nothing chosen yet.</Text> : !prev ? (
                    prevErr ? <Text className="text-danger">{prevErr}</Text> : <ActivityIndicator color={COLORS.brand} />
                ) : (
                    <>
                        {prev.bill_discount > 0 ? <Row label="Discount" value={<Text className="font-bold text-ok">−{money(prev.bill_discount)}</Text>} /> : null}
                        {prev.charge > 0 ? <Row label="Service charge" value={<Text className="font-bold text-ink">{money(prev.charge)}</Text>} /> : null}
                        <Row label="Subtotal" value={<Text className="font-bold text-ink">{money(prev.sub_total)}</Text>} />
                        <Row label="VAT" value={<Text className="font-bold text-ink">{money(prev.vat)}</Text>} />
                        {Number(prev.rounding) !== 0 ? <Row label="Rounding" value={<Text className="font-bold text-ink">{money(prev.rounding)}</Text>} /> : null}
                        <Row strong label="Refund total" value={<Money value={prev.total} bold className="text-[20px] font-extrabold text-ink" />} />
                        {!prev.full && info.has_charge ? <Text className="text-ink-3 text-[12px] mt-1">Part refund: the service / delivery charge is only refunded when everything is returned.</Text> : null}
                    </>
                )}
            </View>
            {confirm ? <Text className="text-warn text-[13px] mt-3">Only one credit note can be made per invoice, and it is sent to ZATCA. Press again to confirm.</Text> : null}
            {err ? <Text className="text-danger text-[13px] mt-3">{err}</Text> : null}
            {info.refund ? <Tag text="Already refunded" tone="warn" className="mt-2" /> : null}
        </Sheet>
    );
}