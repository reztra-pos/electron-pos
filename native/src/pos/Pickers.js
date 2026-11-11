// Order type, tables, customer, waiter and delivery partner pickers.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Check, Pencil, UserPlus, Users, Search, Truck } from 'lucide-react-native';
import { get } from '../lib/api';
import { C } from '../lib/catalog';
import { Btn, COLORS, Field, Input, Pill, Sheet, Stepper, Tag, useLayout, useUi } from '../ui';
import { TYPE_OPTIONS } from './Cart';
import { CustomerFormSheet } from './CustomerForm';

export function OrderTypeSheet({ pos, onClose }) {
    return (
        <Sheet title="Order type" subtitle="How is this order served?" onClose={onClose} size="sm">
            <View style={{ gap: 10 }}>
                {TYPE_OPTIONS.map((o) => {
                    const Icon = o.icon;
                    return (
                        <Pressable key={o.value} onPress={() => pos.pickOrderType(o.value)} className="h-16 rounded-2xl border border-line bg-card flex-row items-center px-4 active:bg-brand-tint">
                            <View className="w-10 h-10 rounded-xl bg-brand-tint items-center justify-center"><Icon size={20} color={COLORS.brand} /></View>
                            <Text className="ml-3 text-[16px] font-bold text-ink">{o.label}</Text>
                        </Pressable>
                    );
                })}
            </View>
        </Sheet>
    );
}

const ST = { free: ['Free', 'ok'], partly_booked: ['Partly booked', 'warn'], full: ['Occupied', 'brand'] };

export function TableSheet({ pos, onClose }) {
    const { isTablet, width } = useLayout();
    const [data, setData] = useState(null);
    const [area, setArea] = useState('all');
    const [picked, setPicked] = useState(() => (pos.table || []).map((t) => ({ ...t })));
    const [guests, setGuests] = useState({});
    useEffect(() => {
        get('/v1/tables').then((r) => {
            const tables = (r.tables || []).map((t) => {
                const others = (t.orders || []).filter((o) => o.order_id !== pos.editingId);
                const used = others.reduce((s, o) => s + (Number(o.persons) || 0), 0);
                return { ...t, used, free: t.capacity > 0 ? Math.max(0, t.capacity - used) : null };
            });
            setData({ areas: (r.areas || []).filter((a) => tables.some((t) => t.area_id === a.id)), tables });
            setGuests(Object.fromEntries(tables.map((t) => [t.id, Math.max(1, t.free ?? 2)])));
        }).catch((e) => { pos.onError(e); onClose(); });
    }, []); // eslint-disable-line
    const mine = (id) => picked.find((p) => p.id === id);
    const toggle = (t) => setPicked((ps) => (mine(t.id) ? ps.filter((p) => p.id !== t.id) : [...ps, { id: t.id, name: t.name, persons: Math.max(1, Number(guests[t.id]) || 1) }]));
    const setG = (t, n) => { setGuests((g) => ({ ...g, [t.id]: n })); setPicked((ps) => ps.map((p) => (p.id === t.id ? { ...p, persons: n } : p))); };
    const shown = (data?.tables || []).filter((t) => area === 'all' || t.area_id === area);
    const cols = isTablet ? 3 : 1;
    const colW = isTablet ? Math.min(1100, width * 0.92) / cols - 26 : undefined;
    return (
        <Sheet title="Select tables" onClose={onClose} size="xl"
            footer={<>
                <View className="flex-1 flex-row items-center"><Users size={16} color={COLORS.ink2} /><Text className="ml-1.5 text-ink-2 font-semibold" numberOfLines={1}>{picked.length ? picked.map((p) => `${p.name} (${p.persons})`).join(', ') : 'No table added yet'}</Text></View>
                <Btn label={picked.length ? 'Use tables' : 'Continue without table'} variant="primary" onPress={() => pos.pickTables(picked)} />
            </>}>
            {!data ? <ActivityIndicator color={COLORS.brand} /> : (
                <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 flex-grow-0">
                        <Pill label="All" active={area === 'all'} onPress={() => setArea('all')} />
                        {data.areas.map((a) => <Pill key={a.id} label={a.name} active={area === a.id} onPress={() => setArea(a.id)} />)}
                    </ScrollView>
                    <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                        {shown.map((t) => {
                            const on = !!mine(t.id);
                            const [label, tone] = ST[t.used === 0 ? 'free' : t.free === 0 ? 'full' : 'partly_booked'];
                            return (
                                <View key={t.id} className={`bg-card rounded-2xl p-3 border-l-[5px] ${on ? 'border-2 border-brand' : 'border border-line'}`} style={{ width: colW || '100%', borderLeftColor: tone === 'ok' ? COLORS.ok : tone === 'warn' ? '#F59E0B' : COLORS.brand }}>
                                    <View className="flex-row justify-between items-center"><Text className="text-[16px] font-extrabold text-ink">{t.name}</Text><Tag text={`${t.free ?? '∞'}/${t.capacity || '∞'} free`} tone={tone} /></View>
                                    <Text className="text-ink-2 text-[12.5px] mt-0.5">{label}</Text>
                                    <View className="flex-row items-center mt-2" style={{ gap: 8 }}>
                                        <Stepper value={Number(guests[t.id]) || 1} min={1} onChange={(n) => setG(t, Math.max(1, n))} />
                                        <Btn label={on ? 'Added' : 'Add'} icon={on ? Check : undefined} variant={on ? 'secondary' : 'primary'} size="sm" onPress={() => toggle(t)} className="flex-1" />
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </>
            )}
        </Sheet>
    );
}

// value / onPick: choose a customer for something else than the order (e.g. a pre-order)
export function CustomerSheet({ pos, onClose, value, onPick }) {
    const current = value !== undefined ? value : pos.customerId;
    const pick = (id) => { if (onPick) onPick(id); else pos.setCustomerId(id); onClose(); };
    const { notify } = useUi();
    const [q, setQ] = useState('');
    const [form, setForm] = useState(null);          // { edit: row | null } -> the customer form
    useEffect(() => { if (q.trim().length >= 2) { const t = setTimeout(() => pos.searchCustomers(q.trim()), 350); return () => clearTimeout(t); } return undefined; }, [q]); // eslint-disable-line
    const list = useMemo(() => {
        const s = q.trim().toLowerCase();
        return pos.customers.filter((c) => !s || c.name.toLowerCase().includes(s) || (c.phone || '').includes(s) || (c.trn || '').includes(s)).slice(0, 80);
    }, [q, pos.customers]);
    if (form) {
        return (
            <CustomerFormSheet edit={form.edit} onClose={() => setForm(null)} onError={pos.onError}
                onSave={async (id, body) => {
                    const row = await pos.saveCustomer(id, body, !onPick && !id);
                    notify(id ? 'Customer updated' : `${row.name} added and selected`);
                    if (id) setForm(null); else pick(row.id);
                }} />
        );
    }
    return (
        <Sheet title="Customer" onClose={onClose} size="md" footer={<Btn label="New customer" icon={UserPlus} variant="secondary" onPress={() => setForm({ edit: null })} className="flex-1" />}>
            <View className="h-12 bg-card rounded-xl border border-line flex-row items-center px-3 mb-3"><Search size={18} color={COLORS.ink3} />
                <Input value={q} onChangeText={setQ} placeholder="Name, phone or TRN" className="flex-1 border-0 h-11" /></View>
            {list.map((c) => {
                const on = c.id === Number(current);
                const walkIn = c.id === C.defaultCustomerId;
                return (
                    <View key={c.id} className={`flex-row items-center rounded-xl mb-1 ${on ? 'bg-brand-tint' : ''}`}>
                        <Pressable onPress={() => pick(c.id)} accessibilityLabel={c.name} className="flex-1 flex-row items-center justify-between px-3 py-3">
                            <View className="flex-1 pr-2">
                                <View className="flex-row items-center"><Text className="font-bold text-ink text-[15px]" numberOfLines={1}>{c.name}</Text>{c.trn ? <Tag text="B2B" tone="info" className="ml-2" /> : null}</View>
                                {c.phone || c.trn ? <Text className="text-ink-2 text-[12.5px]">{[c.phone, c.trn ? `TRN ${c.trn}` : ''].filter(Boolean).join(' · ')}</Text> : null}
                            </View>
                            {on ? <Check size={18} color={COLORS.brand} /> : null}
                        </Pressable>
                        {!walkIn ? (
                            <Pressable onPress={() => setForm({ edit: c })} accessibilityLabel={`Edit ${c.name}`} className="w-11 h-11 items-center justify-center mr-1 active:opacity-60">
                                <Pencil size={17} color={COLORS.ink2} />
                            </Pressable>
                        ) : null}
                    </View>
                );
            })}
        </Sheet>
    );
}

export function WaiterSheet({ pos, onClose }) {
    return (
        <Sheet title="Waiter" onClose={onClose} size="sm">
            {C.waiters.map((w) => {
                const on = String(w.id) === String(pos.waiter);
                return <Pressable key={w.id} onPress={() => { pos.setWaiter(w.id); onClose(); }} className={`flex-row items-center justify-between px-3 py-3.5 rounded-xl mb-1 ${on ? 'bg-brand-tint' : ''}`}>
                    <Text className="font-bold text-ink text-[15px]">{w.name}</Text>{on ? <Check size={18} color={COLORS.brand} /> : null}</Pressable>;
            })}
        </Sheet>
    );
}

export function PartnerSheet({ pos, onClose }) {
    const [p, setP] = useState(pos.partner || '');
    const [ref, setRef] = useState(pos.partnerRef || '');
    return (
        <Sheet title="Delivery partner" onClose={onClose} size="sm"
            footer={<Btn label="Done" variant="primary" className="flex-1" onPress={() => { pos.setPartner(p ? String(p) : ''); pos.setPartnerRef(p ? ref : ''); onClose(); }} />}>
            <Pressable onPress={() => setP('')} className={`flex-row items-center justify-between px-3 py-3 rounded-xl mb-1 ${!p ? 'bg-brand-tint' : ''}`}>
                <Text className="font-bold text-ink">Own delivery (no partner)</Text>{!p ? <Check size={18} color={COLORS.brand} /> : null}</Pressable>
            {C.partners.map((x) => {
                const on = String(x.id) === String(p);
                return <Pressable key={x.id} onPress={() => setP(x.id)} className={`flex-row items-center justify-between px-3 py-3 rounded-xl mb-1 ${on ? 'bg-brand-tint' : ''}`}>
                    <View className="flex-row items-center"><Truck size={17} color={COLORS.ink2} /><Text className="ml-2 font-bold text-ink">{x.name}</Text></View>{on ? <Check size={18} color={COLORS.brand} /> : null}</Pressable>;
            })}
            {p ? <Field label="Partner order / reference no." className="mt-3"><Input value={ref} onChangeText={setRef} placeholder="e.g. 88231" /></Field> : null}
        </Sheet>
    );
}