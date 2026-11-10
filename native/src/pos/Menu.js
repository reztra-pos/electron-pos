// Menu: categories, search and the item grid (shared by tablet and phone).
import React, { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { C, priceFor, comboExtra } from '../lib/catalog';
import { COLORS, Money, Pill } from '../ui';

export function useMenuFilter() {
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return C.items.filter((it) => {
      if (cat !== 'all' && it.cat !== cat) return false;
      if (!q) return true;
      return it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q) || (it.name2 || '').includes(query.trim())
        || it.variations.some((v) => v.name.toLowerCase().includes(q) || v.code.toLowerCase().includes(q));
    });
  }, [cat, query]);
  return { cat, setCat, query, setQuery, items };
}

export function SearchBox({ value, onChange, className = '' }) {
  return (
    <View className={`h-12 bg-white rounded-2xl border border-line flex-row items-center px-3 ${className}`}>
      <Search size={19} color={COLORS.ink3} />
      <TextInput value={value} onChangeText={onChange} placeholder="Search items or code" placeholderTextColor={COLORS.ink3} className="flex-1 ml-2 text-[15px] text-ink" returnKeyType="search" />
      {value ? <Pressable onPress={() => onChange('')} accessibilityLabel="Clear search"><X size={18} color={COLORS.ink3} /></Pressable> : null}
    </View>
  );
}

export function CategoryBar({ cat, setCat }) {
  const counts = useMemo(() => C.items.reduce((m, it) => ({ ...m, [it.cat]: (m[it.cat] || 0) + 1 }), {}), []);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-grow-0" contentContainerStyle={{ paddingVertical: 2 }}>
      <Pill label="All" count={C.items.length} active={cat === 'all'} onPress={() => setCat('all')} />
      {C.categories.filter((c) => counts[c.id]).map((c) => <Pill key={c.id} label={c.name} count={counts[c.id]} active={cat === c.id} onPress={() => setCat(c.id)} />)}
    </ScrollView>
  );
}

function shownPrice(it, type, partner) {
  if (it.variations.length) return Math.min(...it.variations.map((v) => priceFor(v, type, partner)));
  return priceFor(it, type, partner) + comboExtra(it, [], type);
}

export function ItemCard({ item, qty, orderType, partner, onPress, width }) {
  const [bg, fg] = item.tint;
  const Art = item.art;
  const promo = item.promotion;
  return (
    <Pressable onPress={() => onPress(item)} accessibilityRole="button" accessibilityLabel={item.name}
      className={`bg-white rounded-card p-2 pb-3 m-1.5 ${qty ? 'border-2 border-brand' : 'border border-line'} ${item.unavailable ? 'opacity-50' : ''} active:opacity-80`} style={{ width }}>
      <View className="h-[84px] rounded-xl items-center justify-center overflow-hidden" style={{ backgroundColor: bg }}>
        {item.image ? <Image source={{ uri: item.image }} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : <Art size={34} color={fg} strokeWidth={1.6} />}
        {item.combo ? <View className="absolute top-1.5 left-1.5 bg-[#D97706] rounded-md px-1.5 py-0.5"><Text className="text-white text-[9.5px] font-extrabold">COMBO</Text></View> : null}
        {promo ? <View className="absolute bottom-1.5 right-1.5 bg-[#DB2777] rounded-md px-1.5 py-0.5"><Text className="text-white text-[9.5px] font-extrabold" numberOfLines={1}>{promo.type === 2 ? `BUY ${promo.buy_qty} GET ${promo.free_qty}` : 'PROMO'}</Text></View> : null}
        {item.unavailable ? <View className="absolute top-1.5 right-1.5 bg-ink rounded-md px-1.5 py-0.5"><Text className="text-white text-[9.5px] font-extrabold">NOT AVAILABLE</Text></View> : null}
      </View>
      {qty ? <View className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-brand border-[3px] border-white items-center justify-center"><Text className="text-white text-[12px] font-extrabold">{qty}</Text></View> : null}
      <Text numberOfLines={1} className="text-[14px] font-bold text-ink mt-2 mx-1">{item.name}</Text>
      {item.name2 ? <Text numberOfLines={1} className="text-[12px] text-ink-3 mx-1" style={{ writingDirection: 'rtl', textAlign: 'left' }}>{item.name2}</Text> : null}
      <View className="flex-row items-baseline mt-1 mx-1">
        {item.variations.length ? <Text className="text-[11px] text-ink-3 font-semibold mr-1">From</Text> : null}
        <Money value={shownPrice(item, orderType, partner)} bold className="text-[15px] font-extrabold text-ink" />
      </View>
    </Pressable>
  );
}

export function ItemGrid({ items, columns, width, qtyById, orderType, partner, onPress, footerSpace = 0 }) {
  const cardW = Math.floor(width / columns) - 12;
  return (
    <FlatList data={items} key={columns} numColumns={columns} keyExtractor={(it) => String(it.id)}
      renderItem={({ item }) => <ItemCard item={item} width={cardW} qty={qtyById[item.id]} orderType={orderType} partner={partner} onPress={onPress} />}
      contentContainerStyle={{ paddingBottom: 16 + footerSpace }} keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<Text className="text-ink-3 text-center mt-10">No items found</Text>} />
  );
}
