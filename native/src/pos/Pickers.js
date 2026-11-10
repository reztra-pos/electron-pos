// Order type, tables, customer, waiter and delivery partner pickers.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Check, UserPlus, Users, Search, Truck } from 'lucide-react-native';
import { get } from '../lib/api';
import { C } from '../lib/catalog';
import { firstError } from '../lib/format';
import { Btn, COLORS, Field, Input, Pill, Sheet, Stepper, Tag, useLayout } from '../ui';
import { TYPE_OPTIONS } from './Cart';

export function OrderTypeSheet({ pos, onClose }) {
  return (
    <Sheet title="Order type" subtitle="How is this order served?" onClose={onClose} size="sm">
      <View style={{ gap: 10 }}>
        {TYPE_OPTIONS.map((o) => {
          const Icon = o.icon;
          return (
            <Pressable key={o.value} onPress={() => pos.pickOrderType(o.value)} className="h-16 rounded-2xl border border-line bg-white flex-row items-center px-4 active:bg-brand-tint">
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
                <View key={t.id} className={`bg-white rounded-2xl p-3 border-l-[5px] ${on ? 'border-2 border-brand' : 'border border-line'}`} style={{ width: colW || '100%', borderLeftColor: tone === 'ok' ? COLORS.ok : tone === 'warn' ? '#F59E0B' : COLORS.brand }}>
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

export function CustomerSheet({ pos, onClose }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (q.trim().length >= 2) { const t = setTimeout(() => pos.searchCustomers(q.trim()), 350); return () => clearTimeout(t); } return undefined; }, [q]); // eslint-disable-line
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return pos.customers.filter((c) => !s || c.name.toLowerCase().includes(s) || (c.phone || '').includes(s)).slice(0, 80);
  }, [q, pos.customers]);
  const save = async () => {
    setBusy(true); setErr('');
    try { await pos.addCustomer({ name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() }); onClose(); }
    catch (e) { setErr(firstError(e)); setBusy(false); }
  };
  if (adding) {
    return (
      <Sheet title="New customer" onClose={onClose} size="sm"
        footer={<><Btn label="Back" onPress={() => setAdding(false)} className="flex-1" /><Btn label="Save customer" variant="primary" busy={busy} disabled={!form.name.trim()} onPress={save} className="flex-1" /></>}>
        <Field label="Name"><Input value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} autoFocus /></Field>
        <Field label="Phone"><Input value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" /></Field>
        <Field label="Email"><Input value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} keyboardType="email-address" autoCapitalize="none" /></Field>
        {err ? <Text className="text-danger font-semibold">{err}</Text> : null}
      </Sheet>
    );
  }
  return (
    <Sheet title="Customer" onClose={onClose} size="md" footer={<Btn label="New customer" icon={UserPlus} variant="secondary" onPress={() => setAdding(true)} className="flex-1" />}>
      <View className="h-12 bg-white rounded-xl border border-line flex-row items-center px-3 mb-3"><Search size={18} color={COLORS.ink3} />
        <Input value={q} onChangeText={setQ} placeholder="Name or phone" className="flex-1 border-0 h-11" /></View>
      {list.map((c) => {
        const on = c.id === Number(pos.customerId);
        return (
          <Pressable key={c.id} onPress={() => { pos.setCustomerId(c.id); onClose(); }} className={`flex-row items-center justify-between px-3 py-3 rounded-xl mb-1 ${on ? 'bg-brand-tint' : ''}`}>
            <View><Text className="font-bold text-ink text-[15px]">{c.name}</Text>{c.phone ? <Text className="text-ink-2 text-[12.5px]">{c.phone}</Text> : null}</View>
            {on ? <Check size={18} color={COLORS.brand} /> : null}
          </Pressable>
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
