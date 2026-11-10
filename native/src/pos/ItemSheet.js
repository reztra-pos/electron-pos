// Item options: quantity, modifiers (open-price ones ask for the price), combo choices, open price, item discount, note.
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Trash2, Check } from 'lucide-react-native';
import { C, priceFor, comboExtra } from '../lib/catalog';
import { money } from '../lib/format';
import { Btn, COLORS, Field, Input, Money, Segment, Sheet, Stepper, useLayout } from '../ui';

export function ItemSheet({ pos, item, line, onClose }) {
  const { isTablet } = useLayout();
  const [qty, setQty] = useState(line?.qty || 1);
  const [mods, setMods] = useState(line?.mods?.map((m) => ({ ...m, entered: String(m.price) })) || []);
  const [note, setNote] = useState(line?.note || '');
  const [open, setOpen] = useState(line?.openPrice ? String(line.price) : '');
  const [discMode, setDiscMode] = useState(line?.discRaw ? 'fixed' : 'percent');
  const [disc, setDisc] = useState(line?.discRaw ? String(line.discRaw) : line?.disc ? String(line.disc) : '');
  const [combo, setCombo] = useState(() => line?.comboSelections?.length ? line.comboSelections : (item.comboGroups || []).map((g) => g.options[0]?.food_menu_id).filter(Boolean));
  const kitchenLine = !!line?.lineId;
  const listPrice = kitchenLine ? line.price : priceFor(item, pos.orderType, pos.partner) + comboExtra(item, combo, pos.orderType);
  const price = item.openPrice ? Number(open) || 0 : listPrice;
  const unit = price + mods.reduce((s, m) => s + (Number(m.price) || 0), 0);
  const promoDisc = item.promotion?.type === 1 && !!item.promotion.discount;
  const discOn = C.settings.item_discount !== false && !promoDisc && !item.openPrice;
  const discNum = Number(disc) || 0;
  const discBad = discOn && discNum > 0 && (discMode === 'percent' ? discNum > 100 : discNum > price);
  const off = discOn && !discBad && discNum > 0 ? (discMode === 'percent' ? Math.round(price * discNum) / 100 : discNum) * qty : 0;
  const needPrice = (item.openPrice && !(Number(open) > 0)) || mods.some((m) => m.openPrice && !(Number(m.entered) > 0));

  const toggle = (m) => setMods((ms) => (ms.some((x) => x.id === m.id) ? ms.filter((x) => x.id !== m.id) : [...ms, { ...m, price: m.openPrice ? 0 : m.price, entered: m.openPrice ? '' : String(m.price) }]));
  const setModPrice = (id, v) => setMods((ms) => ms.map((x) => (x.id === id ? { ...x, entered: v, price: Number(v) || 0 } : x)));
  const pickCombo = (g, id) => setCombo((c) => [...c.filter((x) => !g.options.some((o) => o.food_menu_id === x)), id]);

  const save = () => {
    const data = {
      qty: Math.max(1, qty), mods: mods.map(({ entered, ...m }) => m), note: note.trim(), price,
      disc: discOn && discMode === 'percent' && discNum > 0 ? discNum : 0,
      discRaw: discOn && discMode === 'fixed' && discNum > 0 ? String(discNum) : null,
      comboSelections: item.comboGroups ? combo : [],
    };
    if (line) pos.updateLine(line.key, { ...data, openPrice: !!item.openPrice });
    else pos.addToCart(item, data);
    onClose();
  };

  const left = (
    <View style={{ flex: 1 }}>
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-ink-2">{item.code}{item.openPrice ? '' : ` · ${money(listPrice)} each`}</Text>
        <Stepper big value={qty} min={1} onChange={(v) => setQty(Math.max(1, v))} />
      </View>
      {item.openPrice ? <Field label={`Price (${C.outlet.currency})`}><Input keyboardType="decimal-pad" value={open} onChangeText={setOpen} placeholder="Enter the price" autoFocus /></Field> : null}
      {discOn ? (
        <Field label="Item discount" error={discBad ? (discMode === 'percent' ? 'A percentage cannot be more than 100%.' : 'Discount cannot be more than the item price.') : null}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Input keyboardType="decimal-pad" value={disc} onChangeText={setDisc} placeholder="0" className="flex-1" />
            <Segment className="w-40" options={[{ value: 'percent', label: '%' }, { value: 'fixed', label: 'each' }]} value={discMode} onChange={setDiscMode} />
          </View>
        </Field>
      ) : null}
      <Field label="Preparation note"><Input value={note} onChangeText={setNote} placeholder="e.g. less spicy, sauce on the side" /></Field>
    </View>
  );
  const right = (item.comboGroups?.length || item.modifiers.length || item.promotion) ? (
    <View style={{ flex: 1 }}>
      {item.promotion ? (
        <View className="bg-[#FDE7F3] rounded-xl p-3 mb-3">
          <Text className="text-[#BE185D] font-extrabold">PROMO{item.promotion.text ? ` · ${item.promotion.text}` : ''}</Text>
          {item.promotion.type === 2 ? <Text className="text-ink-2 text-[13px] mt-1">Buy {item.promotion.buy_qty}, get {item.promotion.free_qty} free — added by the server.</Text>
            : <Text className="text-ink-2 text-[13px] mt-1">Discount {item.promotion.discount} applied by the server.</Text>}
        </View>
      ) : null}
      {(item.comboGroups || []).map((g) => (
        <View key={g.group_name} className="mb-3">
          <Text className="text-[12.5px] font-semibold text-ink-2 mb-1.5">{g.group_name}</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {g.options.map((o) => {
              const on = combo.includes(o.food_menu_id);
              return <Pressable key={o.food_menu_id} onPress={() => pickCombo(g, o.food_menu_id)} className={`px-3 h-10 rounded-xl flex-row items-center border ${on ? 'bg-brand-tint border-brand' : 'bg-white border-line'}`}>
                {on ? <Check size={15} color={COLORS.brand} /> : null}<Text className={`ml-1 font-semibold ${on ? 'text-brand-dark' : 'text-ink'}`}>{o.name}</Text></Pressable>;
            })}
          </View>
        </View>
      ))}
      {item.modifiers.length ? <Text className="text-[12.5px] font-semibold text-ink-2 mb-1.5">Modifiers</Text> : null}
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {item.modifiers.map((m) => {
          const sel = mods.find((x) => x.id === m.id);
          return (
            <View key={m.id} className="flex-row items-center">
              <Pressable onPress={() => toggle(m)} className={`px-3 h-11 rounded-xl flex-row items-center border ${sel ? 'bg-brand-tint border-brand' : 'bg-white border-line'}`}>
                {sel ? <Check size={15} color={COLORS.brand} /> : null}
                <Text className={`ml-1 font-semibold ${sel ? 'text-brand-dark' : 'text-ink'}`}>{m.name}{m.openPrice ? '' : ` +${money(m.price)}`}</Text>
              </Pressable>
              {sel && m.openPrice ? <Input keyboardType="decimal-pad" value={sel.entered} onChangeText={(v) => setModPrice(m.id, v)} placeholder="Price" className="w-24 ml-2 h-11" /> : null}
            </View>
          );
        })}
      </View>
    </View>
  ) : null;

  return (
    <Sheet title={item.name} subtitle={item.name2} onClose={onClose} size={right ? 'lg' : 'md'}
      footer={<>
        {line ? <Btn icon={Trash2} label="Remove" onPress={() => { pos.removeLine(line.key); onClose(); }} textClass="text-danger" /> : null}
        <Btn label="Cancel" onPress={onClose} className="flex-1" />
        <Btn variant="primary" className="flex-[2]" disabled={needPrice || discBad} onPress={save}
          label={`${line ? 'Update item' : 'Add to order'} · ${money(unit * Math.max(1, qty) - off)}`} />
      </>}>
      {isTablet && right ? <View className="flex-row" style={{ gap: 20 }}>{left}{right}</View> : <View>{left}{right ? <View className="mt-2">{right}</View> : null}</View>}
    </Sheet>
  );
}

export function VariationSheet({ pos, item, onClose }) {
  return (
    <Sheet title={item.name} subtitle="Choose a size / variation" onClose={onClose} size="md">
      <View className="flex-row flex-wrap" style={{ gap: 10 }}>
        {item.variations.map((v) => (
          <Pressable key={v.id} onPress={() => { onClose(); setTimeout(() => pos.onItemPress({ ...v, variations: [] }), 50); }} disabled={v.unavailable}
            className={`bg-white border border-line rounded-2xl p-3 min-w-[150px] ${v.unavailable ? 'opacity-40' : ''}`}>
            <Text className="font-bold text-ink text-[15px]">{v.shortName}</Text>
            <Money value={priceFor(v, pos.orderType, pos.partner)} bold className="text-[15px] font-extrabold text-brand mt-1" />
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
