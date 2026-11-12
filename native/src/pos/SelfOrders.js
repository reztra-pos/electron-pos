// Self / Online orders (customer QR self-ordering and online ordering of the web app), waiting for the cashier:
// Accept (-> running order + KOT), Decline, or Modify (accept and open it in the cart to change it first).
// Tablet: list and details side by side. Phone: list, then the details of the chosen order.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ban, Check, ChevronLeft, Pencil, Search, X } from 'lucide-react-native';
import { get } from '../lib/api';
import { C } from '../lib/catalog';
import { money } from '../lib/format';
import { Btn, COLORS, Input, Money, Row, Segment, Sheet, useLayout, useUi } from '../ui';

const typeName = (o) => o.order_type_name || C.orderTypes?.find?.((t) => String(t.id) === String(o.order_type))?.name || '';

export function SelfOrdersSheet({ pos, onClose }) {
    const { isTablet, height } = useLayout();
    const { confirm } = useUi();
    const [tab, setTab] = useState('self');
    const [data, setData] = useState(null);
    const [q, setQ] = useState('');
    const [selId, setSelId] = useState(null);
    const [o, setO] = useState(null);
    const [busy, setBusy] = useState(null);

    const load = useCallback(async () => {
        try { setData(await get('/v1/orders/self')); } catch (e) { pos.onError(e); setData({ self_orders: [], online_orders: [] }); }
    }, []); // eslint-disable-line
    useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
    useEffect(() => {
        setO(null);
        if (!selId) return;
        get(`/v1/orders/${selId}`).then(setO).catch((e) => { pos.onError(e); setSelId(null); });
    }, [selId]); // eslint-disable-line

    const count = (k) => data?.[k]?.length || 0;
    const list = (data?.[tab === 'self' ? 'self_orders' : 'online_orders'] || []).filter((r) => {
        const t = q.trim().toLowerCase();
        return !t || [r.sale_no, r.order_number, r.token_number, r.customer?.name, r.customer?.phone, r.tables_text].some((v) => String(v || '').toLowerCase().includes(t));
    });
    const sel = data ? [...(data.self_orders || []), ...(data.online_orders || [])].find((r) => r.id === selId) : null;

    const act = async (kind) => {
        if (!sel) return;
        if (kind === 'decline' && !(await confirm(`Decline order ${sel.order_number || sel.sale_no}? The customer's order will not be made.`, { title: 'Decline', confirmLabel: 'Decline', danger: true }))) return;
        setBusy(kind);
        try {
            if (kind === 'accept') await pos.acceptSelf(sel);
            else if (kind === 'decline') await pos.declineSelf(sel);
            else if (await pos.modifySelf(sel)) return;         // the order is now in the cart; this popup is closed
            setSelId(null); await load();
        } catch (e) { pos.onError(e); setSelId(null); await load(); }
        finally { setBusy(null); }
    };

    const t = o?.totals || {};
    const listView = (
        <View className="flex-1">
            <Segment options={[{ value: 'self', label: `Self orders (${count('self_orders')})` }, { value: 'online', label: `Online orders (${count('online_orders')})` }]}
                value={tab} onChange={(v) => { setTab(v); setSelId(null); }} />
            <View className="h-11 bg-card rounded-xl border border-line flex-row items-center px-3 mt-2.5 mb-2">
                <Search size={17} color={COLORS.ink3} />
                <Input value={q} onChangeText={setQ} placeholder="Customer, mobile number or token" className="flex-1 border-0 h-10" />
                {q ? <Pressable onPress={() => setQ('')} accessibilityLabel="Clear search"><X size={17} color={COLORS.ink3} /></Pressable> : null}
            </View>
            {data === null ? <View className="mt-6"><ActivityIndicator color={COLORS.brand} /></View> : !list.length ? <Text className="text-ink-3 text-center mt-8">No new orders.</Text> : (
                <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                    {list.map((r) => {
                        const on = selId === r.id;
                        return (
                            <Pressable key={r.id} onPress={() => setSelId(r.id)} accessibilityLabel={`Order ${r.order_number || r.sale_no}`}
                                className={`flex-row items-center px-3 py-3 rounded-xl mb-1.5 border ${on ? 'bg-brand-tint border-brand' : 'bg-card border-line'} active:opacity-80`}>
                                <View className="flex-1 pr-2">
                                    <Text className="font-extrabold text-ink" numberOfLines={1}>{r.order_number || r.sale_no}{r.token_number ? ` · Token ${r.token_number}` : ''}{typeName(r) ? ` · ${typeName(r)}` : ''}</Text>
                                    <Text className="text-ink-2 text-[12.5px]" numberOfLines={1}>{r.customer?.name}{r.customer?.phone ? ` (${r.customer.phone})` : ''}{r.tables_text ? ` · Table ${r.tables_text}` : ''}</Text>
                                    {r.date_time ? <Text className="text-ink-3 text-[12px]">{r.date_time}</Text> : null}
                                </View>
                                <Money value={r.total_payable} bold className="font-extrabold text-ink" />
                            </Pressable>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );

    const detail = (
        <View className="flex-1">
            {!isTablet ? (
                <Pressable onPress={() => setSelId(null)} className="flex-row items-center mb-2" accessibilityLabel="Back to the list">
                    <ChevronLeft size={20} color={COLORS.brand} /><Text className="text-brand font-bold">All orders</Text>
                </Pressable>
            ) : <Text className="font-extrabold text-ink text-[16px] mb-2">Order details</Text>}
            {!selId ? <Text className="text-ink-3">Choose an order.</Text> : !o ? <ActivityIndicator color={COLORS.brand} /> : (
                <ScrollView nestedScrollEnabled>
                    <Text className="text-ink-2 text-[13px] mb-2">{[typeName(o), o.customer?.name, o.waiter?.name ? `Waiter ${o.waiter.name}` : '', o.tables_text ? `Table ${o.tables_text}` : ''].filter(Boolean).join(' · ')}</Text>
                    {(o.items || []).map((l, i) => (
                        <View key={l.line_id || i} className="flex-row items-start py-2.5 border-b border-dashed border-line">
                            <View className="flex-1 pr-2">
                                <Text className="font-bold text-ink">{l.qty} × {l.name}</Text>
                                {(l.modifiers?.length || l.combo_items || l.note) ? (
                                    <Text className="text-ink-3 text-[12px]">{[...(l.modifiers || []).map((m) => m.name), l.combo_items, l.note ? `“${l.note}”` : ''].filter(Boolean).join(', ')}</Text>
                                ) : null}
                                <Text className="text-ink-3 text-[12px]">{money(l.unit_price)} each</Text>
                            </View>
                            <Text className="font-bold text-ink">{money(l.total ?? l.price_with_discount ?? (l.unit_price * l.qty))}</Text>
                        </View>
                    ))}
                    <View className="mt-2">
                        <Row label="Subtotal" value={<Text className="font-bold text-ink">{money(t.sub_total)}</Text>} />
                        {Number(t.total_discount_amount) > 0 ? <Row label="Discount" value={<Text className="font-bold text-ok">−{money(t.total_discount_amount)}</Text>} /> : null}
                        {Number(t.charge_amount) > 0 ? <Row label="Service charge" value={<Text className="font-bold text-ink">{money(t.charge_amount)}</Text>} /> : null}
                        <Row label="VAT" value={<Text className="font-bold text-ink">{money(t.total_vat)}</Text>} />
                        <Row strong label="Total payable" value={<Money value={t.total_payable} bold className="text-[20px] font-extrabold text-ink" />} />
                    </View>
                </ScrollView>
            )}
        </View>
    );

    const showDetail = isTablet || !!selId;
    return (
        <Sheet title="Self / Online orders" onClose={() => !busy && onClose()} closable={!busy} size={isTablet ? 'xl' : 'lg'} scroll={false}
            footer={showDetail ? <>
                <Btn icon={Pencil} label="Modify" busy={busy === 'modify'} disabled={!o || !!busy} onPress={() => act('modify')} className="flex-1" />
                <Btn icon={Ban} label="Decline" variant="danger" busy={busy === 'decline'} disabled={!o || !!busy} onPress={() => act('decline')} className="flex-1" />
                <Btn icon={Check} label="Accept" variant="ok" busy={busy === 'accept'} disabled={!o || !!busy} onPress={() => act('accept')} className="flex-1" />
            </> : <Btn label="Close" onPress={onClose} className="flex-1" />}>
            <View style={{ height: height * (isTablet ? 0.62 : 0.6) }}>
                {isTablet ? (
                    <View className="flex-1 flex-row" style={{ gap: 16 }}>
                        <View style={{ width: 360 }}>{listView}</View>
                        <View className="flex-1 bg-soft rounded-2xl p-3">{detail}</View>
                    </View>
                ) : selId ? detail : listView}
            </View>
        </Sheet>
    );
}