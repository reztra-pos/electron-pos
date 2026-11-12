// Self / Online orders (customer QR self-ordering and online ordering of the web app), waiting for the cashier:
// Accept (-> running order + KOT), Decline, or Modify (accept and open it in the cart to change it first).
// A screen like Running orders. Tablet: list and details side by side. Phone: list, then the details of the chosen order.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ban, Check, ChevronLeft, Pencil, Search, X } from 'lucide-react-native';
import { get } from '../lib/api';
import { C } from '../lib/catalog';
import { money } from '../lib/format';
import { Btn, COLORS, Input, Money, Row, Segment, useLayout, useUi } from '../ui';
import { flipX, tr } from '../lib/i18n';

const typeName = (o) => o.order_type_name || C.orderTypes?.find?.((t) => String(t.id) === String(o.order_type))?.name || '';

/** onModify: the order is now in the cart -> show the order screen */
export function SelfOrdersView({ pos, onModify }) {
    const { isTablet } = useLayout();
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
        if (kind === 'decline' && !(await confirm(tr("Decline order {v1}? The customer's order will not be made.", { v1: sel.order_number || sel.sale_no }), { title: tr("Decline"), confirmLabel: tr("Decline"), danger: true }))) return;
        setBusy(kind);
        try {
            if (kind === 'accept') await pos.acceptSelf(sel);
            else if (kind === 'decline') await pos.declineSelf(sel);
            else if (await pos.modifySelf(sel)) { onModify?.(); return; }   // the order is now in the cart
            setSelId(null); await load();
        } catch (e) { pos.onError(e); setSelId(null); await load(); }
        finally { setBusy(null); }
    };

    const t = o?.totals || {};
    const listView = (
        <View className="flex-1">
            <Segment options={[{ value: 'self', label: tr("Self orders ({v1})", { v1: count('self_orders') }) }, { value: 'online', label: tr("Online orders ({v1})", { v1: count('online_orders') }) }]}
                value={tab} onChange={(v) => { setTab(v); setSelId(null); }} />
            <View className="h-11 bg-card rounded-xl border border-line flex-row items-center px-3 mt-2.5 mb-2">
                <Search size={17} color={COLORS.ink3} />
                <Input value={q} onChangeText={setQ} placeholder={tr("Customer, mobile number or token")} className="flex-1 border-0 h-10" />
                {q ? <Pressable onPress={() => setQ('')} accessibilityLabel={tr("Clear search")}><X size={17} color={COLORS.ink3} /></Pressable> : null}
            </View>
            {data === null ? <View className="mt-6"><ActivityIndicator color={COLORS.brand} /></View> : !list.length ? <Text className="text-ink-3 text-center mt-8">{tr("No new orders.")}</Text> : (
                <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                    {list.map((r) => {
                        const on = selId === r.id;
                        return (
                            <Pressable key={r.id} onPress={() => setSelId(r.id)} accessibilityLabel={tr("Order {v1}", { v1: r.order_number || r.sale_no })}
                                className={`flex-row items-center px-3 py-3 rounded-xl mb-1.5 border ${on ? 'bg-brand-tint border-brand' : 'bg-card border-line'} active:opacity-80`}>
                                <View className="flex-1 pr-2">
                                    <Text className="font-extrabold text-ink" numberOfLines={1}>{r.order_number || r.sale_no}{r.token_number ? tr(" · Token {token_number}", { token_number: r.token_number }) : ''}{typeName(r) ? ` · ${typeName(r)}` : ''}</Text>
                                    <Text className="text-ink-2 text-[12.5px]" numberOfLines={1}>{r.customer?.name}{r.customer?.phone ? ` (${r.customer.phone})` : ''}{r.tables_text ? tr(" · Table {tables_text}", { tables_text: r.tables_text }) : ''}</Text>
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
                <Pressable onPress={() => setSelId(null)} className="flex-row items-center mb-2" accessibilityLabel={tr("Back to the list")}>
                    <ChevronLeft size={20} color={COLORS.brand} style={flipX()} /><Text className="text-brand font-bold">{tr("All orders")}</Text>
                </Pressable>
            ) : <Text className="font-extrabold text-ink text-[16px] mb-2">{tr("Order details")}</Text>}
            {!selId ? <Text className="text-ink-3">{tr("Choose an order.")}</Text> : !o ? <ActivityIndicator color={COLORS.brand} /> : (
                <ScrollView nestedScrollEnabled>
                    <Text className="text-ink-2 text-[13px] mb-2">{[typeName(o), o.customer?.name, o.waiter?.name ? tr('Waiter {name}', { name: o.waiter.name }) : '', o.tables_text ? tr('Table {name}', { name: o.tables_text }) : ''].filter(Boolean).join(' · ')}</Text>
                    {(o.items || []).map((l, i) => (
                        <View key={l.line_id || i} className="flex-row items-start py-2.5 border-b border-dashed border-line">
                            <View className="flex-1 pr-2">
                                <Text className="font-bold text-ink">{l.qty} × {l.name}</Text>
                                {(l.modifiers?.length || l.combo_items || l.note) ? (
                                    <Text className="text-ink-3 text-[12px]">{[...(l.modifiers || []).map((m) => m.name), l.combo_items, l.note ? `“${l.note}”` : ''].filter(Boolean).join(', ')}</Text>
                                ) : null}
                                <Text className="text-ink-3 text-[12px]">{money(l.unit_price)} {tr("each")}</Text>
                            </View>
                            <Text className="font-bold text-ink">{money(l.total ?? l.price_with_discount ?? (l.unit_price * l.qty))}</Text>
                        </View>
                    ))}
                    <View className="mt-2">
                        <Row label={tr("Subtotal")} value={<Text className="font-bold text-ink">{money(t.sub_total)}</Text>} />
                        {Number(t.total_discount_amount) > 0 ? <Row label={tr("Discount")} value={<Text className="font-bold text-ok">−{money(t.total_discount_amount)}</Text>} /> : null}
                        {Number(t.charge_amount) > 0 ? <Row label={tr("Service charge")} value={<Text className="font-bold text-ink">{money(t.charge_amount)}</Text>} /> : null}
                        <Row label={tr("VAT")} value={<Text className="font-bold text-ink">{money(t.total_vat)}</Text>} />
                        <Row strong label={tr("Total payable")} value={<Money value={t.total_payable} bold className="text-[20px] font-extrabold text-ink" />} />
                    </View>
                </ScrollView>
            )}
        </View>
    );

    const actions = (
        <View className="flex-row pt-3" style={{ gap: 8 }}>
            <Btn icon={Pencil} label={tr("Modify")} busy={busy === 'modify'} disabled={!o || !!busy} onPress={() => act('modify')} className="flex-1" />
            <Btn icon={Ban} label={tr("Decline")} variant="danger" busy={busy === 'decline'} disabled={!o || !!busy} onPress={() => act('decline')} className="flex-1" />
            <Btn icon={Check} label={tr("Accept")} variant="ok" busy={busy === 'accept'} disabled={!o || !!busy} onPress={() => act('accept')} className="flex-1" />
        </View>
    );
    return (
        <View className="flex-1 pb-3">
            <View className="flex-row items-center justify-between mb-3">
                <Text className="text-[22px] font-extrabold text-ink">{tr("Self / Online orders")}</Text>
                <Btn size="sm" label={tr("Refresh")} onPress={load} />
            </View>
            {isTablet ? (
                <View className="flex-1 flex-row" style={{ gap: 16 }}>
                    <View style={{ width: 360 }}>{listView}</View>
                    <View className="flex-1 bg-card border border-line rounded-2xl p-3">{detail}{selId ? actions : null}</View>
                </View>
            ) : selId ? <View className="flex-1">{detail}{actions}</View> : listView}
        </View>
    );
}