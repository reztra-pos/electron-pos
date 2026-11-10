// The order: type, table / customer / waiter / partner, lines, server totals and the actions.
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Armchair, ShoppingBag, Truck, LayoutGrid, UserRound, ChefHat, Receipt, Banknote, ChevronRight, Pencil, Trash2, Save, ShoppingCart } from 'lucide-react-native';
import { C } from '../lib/catalog';
import { Btn, COLORS, Money, Row, Segment, Stepper } from '../ui';
import { tblText } from './usePos';

export const TYPE_OPTIONS = [
  { value: 'dine', label: 'Dine In', icon: Armchair },
  { value: 'take', label: 'Take Away', icon: ShoppingBag },
  { value: 'delivery', label: 'Delivery', icon: Truck },
];

function Chip({ icon: Icon, text, onPress, active, className = '' }) {
  return (
    <Pressable onPress={onPress} className={`h-10 rounded-xl px-3 flex-row items-center border ${active ? 'bg-brand-tint border-brand-soft' : 'bg-white border-line'} ${className}`}>
      <Icon size={16} color={active ? COLORS.brandDark : COLORS.ink2} strokeWidth={2.2} />
      <Text numberOfLines={1} className={`ml-1.5 text-[13px] font-semibold flex-shrink ${active ? 'text-brand-dark' : 'text-ink'}`}>{text}</Text>
    </Pressable>
  );
}

export function OrderMeta({ pos }) {
  const { orderType, table, customer, waiter, partner } = pos;
  const waiterName = C.waiters.find((w) => String(w.id) === String(waiter))?.name;
  const partnerName = C.partners.find((p) => String(p.id) === String(partner))?.name;
  return (
    <View>
      <Segment options={TYPE_OPTIONS} value={orderType} onChange={(t) => pos.pickOrderType(t, null)} />
      <View className="flex-row flex-wrap mt-2.5" style={{ gap: 8 }}>
        {orderType === 'dine' ? <Chip icon={LayoutGrid} active={!!table} text={table ? tblText(table) : 'Table'} onPress={() => pos.setModal({ name: 'table' })} /> : null}
        {orderType === 'delivery' ? <Chip icon={Truck} active={!!partner} text={partnerName || 'Partner'} onPress={() => pos.setModal({ name: 'partner' })} /> : null}
        <Chip icon={UserRound} text={customer.name} onPress={() => pos.setModal({ name: 'customer' })} className="flex-1 min-w-[120px]" />
        {C.waiters.length && !pos.isWaiter ? <Chip icon={ChefHat} text={waiterName || 'Waiter'} onPress={() => pos.setModal({ name: 'waiter' })} /> : null}
      </View>
    </View>
  );
}

function Line({ l, i, pos }) {
  const srv = pos.srvFor(i);
  const total = srv ? Number(srv.line_total) : (l.price + l.mods.reduce((s, m) => s + m.price, 0)) * l.qty;
  const free = srv?.free?.reduce((a, f) => a + Number(f.qty || 0), 0) || 0;
  const sub = [l.mods.map((m) => m.name).join(' · '), l.note, free ? `${free} free (promotion)` : '', srv && Number(srv.discount_amount) > 0 ? `− ${Number(srv.discount_amount).toFixed(2)} discount` : '']
    .filter(Boolean).join(' · ');
  return (
    <Pressable onPress={() => pos.setModal({ name: 'item', item: C.byId[l.itemId], line: l })} className="flex-row items-center py-3 px-2 border-b border-dashed border-line">
      <View className="flex-1 pr-2">
        <Text className="text-[14px] font-bold text-ink" numberOfLines={2}>{l.name}</Text>
        {sub ? <Text className="text-[12px] text-brand-dark mt-0.5" numberOfLines={2}>{sub}</Text> : null}
        <View className="flex-row items-center mt-0.5"><Money value={l.price} className="text-[12px] text-ink-3" /><Text className="text-[12px] text-ink-3"> each</Text>{l.lineId ? <Text className="text-[11px] text-warn ml-2 font-bold">IN KITCHEN</Text> : null}</View>
      </View>
      <Stepper value={l.qty} onChange={(q) => pos.setLineQty(l.key, q)} />
      <Money value={total} bold className="text-[14.5px] font-extrabold text-ink w-[78px] text-right" />
    </Pressable>
  );
}

export function CartLines({ pos, footer }) {
  if (!pos.cart.length) {
    return (
      <View className="flex-1 items-center justify-center py-10">
        <ShoppingCart size={40} color={COLORS.ink3} strokeWidth={1.5} />
        <Text className="text-ink-3 mt-2">Tap an item on the menu to start an order.</Text>
      </View>
    );
  }
  return <FlatList data={pos.cart} keyExtractor={(l) => l.key} renderItem={({ item, index }) => <Line l={item} i={index} pos={pos} />} ListFooterComponent={footer} keyboardShouldPersistTaps="handled" />;
}

export function CartTotals({ pos }) {
  const t = pos.totals;
  return (
    <View className="px-4 py-3 border-t border-line bg-[#FAFBFC]">
      {pos.calcErr ? <Text className="text-danger text-[13px] mb-1">{pos.calcErr}</Text> : null}
      <Row label={`Items (${pos.itemCount})`} value={<Money value={t?.sub_total ?? 0} className="text-[13.5px] font-bold text-ink" />} />
      {Number(t?.total_discount_amount) > 0 ? <Row label="Discount" value={<Money sign="−" value={t.total_discount_amount} className="text-[13.5px] font-bold text-ok" />} /> : null}
      {Number(t?.charge_amount) > 0 ? <Row label={pos.orderType === 'delivery' ? 'Delivery charge' : 'Service charge'} value={<Money value={t.charge_amount} className="text-[13.5px] font-bold text-ink" />} /> : null}
      <Row label="VAT" value={<Money value={t?.total_vat ?? 0} className="text-[13.5px] font-bold text-ink" />} />
      {Number(t?.rounding_amount) ? <Row label="Rounding" value={<Money value={t.rounding_amount} className="text-[13.5px] font-bold text-ink" />} /> : null}
      <View className="flex-row justify-between items-baseline mt-1.5 pt-2 border-t border-line">
        <Text className="text-[15px] font-bold text-ink">Total{pos.calcBusy ? ' …' : ''}</Text>
        <Money value={t?.total_payable ?? 0} bold className="text-[26px] font-extrabold text-ink" />
      </View>
    </View>
  );
}

export function CartActions({ pos, onDone }) {
  const editing = !!pos.editingId;
  const empty = !pos.cart.length;
  const run = (fn) => () => { fn(); onDone?.(); };
  return (
    <View className="px-4 pt-3 pb-4" style={{ gap: 8 }}>
      <View className="flex-row" style={{ gap: 8 }}>
        {editing ? <Btn label="Cancel edit" icon={Trash2} onPress={pos.resetOrder} className="flex-1" />
          : C.outlet.btnDraft ? <Btn label="Draft" icon={Save} onPress={pos.saveDraft} disabled={empty} className="flex-1" /> : null}
        {C.outlet.btnPlace || editing
          ? <Btn label={editing ? 'Update order' : 'Place order'} icon={ChefHat} variant="secondary" busy={pos.busy === 'place'} disabled={empty} onPress={run(() => pos.proceed('place'))} className="flex-1" /> : null}
      </View>
      {pos.canPay && C.outlet.btnQuick && !editing ? (
        <Btn variant="primary" size="lg" disabled={empty || !pos.totals} busy={pos.busy === 'calc'} onPress={() => pos.proceed('invoice')} className="justify-between"
          icon={Banknote} label="Pay now" textClass="flex-1"
          right={<View className="flex-row items-center"><Money value={pos.totals?.total_payable ?? 0} bold className="text-white text-[17px] font-extrabold" /><ChevronRight size={20} color="#fff" /></View>} />
      ) : null}
    </View>
  );
}

export function CartHeader({ pos }) {
  return (
    <View className="flex-row items-center justify-between mb-3">
      <Text className="text-[18px] font-extrabold text-ink">{pos.editingId ? 'Editing order' : 'New order'}</Text>
      <View className="flex-row items-center">
        {pos.cart.length ? <Pressable onPress={pos.resetOrder} className="flex-row items-center px-2 py-1"><Trash2 size={15} color={COLORS.ink3} /><Text className="text-ink-3 text-[12.5px] font-semibold ml-1">Clear</Text></Pressable> : null}
        <Receipt size={15} color={COLORS.ink3} /><Text className="text-ink-3 text-[12.5px] font-semibold ml-1">{pos.itemCount} items</Text>
      </View>
    </View>
  );
}

export function CartPanel({ pos }) {
  return (
    <View className="flex-1 bg-white">
      <View className="px-4 pt-4 pb-3 border-b border-line"><CartHeader pos={pos} /><OrderMeta pos={pos} /></View>
      <View className="flex-1 px-2"><CartLines pos={pos} /></View>
      <CartTotals pos={pos} />
      <CartActions pos={pos} />
    </View>
  );
}
