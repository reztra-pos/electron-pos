// Menu: categories, search and the item grid (shared by tablet and phone).
import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Search, X } from 'lucide-react-native';
import { C, priceFor, comboExtra } from '../lib/catalog';
import { COLORS, Money, Pill, tintFor, useTheme } from '../ui';

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
    <View className={`h-12 bg-card rounded-2xl border border-line flex-row items-center px-3 ${className}`}>
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

const SHADOW = { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 };

function Badges({ item }) {
  const promo = item.promotion;
  return (
    <>
      {item.combo ? <View className="absolute top-1.5 left-1.5 bg-[#D97706] rounded-md px-1.5 py-0.5"><Text className="text-white text-[9.5px] font-extrabold">COMBO</Text></View> : null}
      {promo ? <View className={`absolute ${item.image ? 'top-1.5' : 'bottom-1.5'} right-1.5 bg-[#DB2777] rounded-md px-1.5 py-0.5`}><Text className="text-white text-[9.5px] font-extrabold" numberOfLines={1}>{promo.type === 2 ? `BUY ${promo.buy_qty} GET ${promo.free_qty}` : 'PROMO'}</Text></View> : null}
      {item.unavailable ? <View className={`absolute ${item.image && promo ? 'top-7' : 'top-1.5'} right-1.5 bg-inverse rounded-md px-1.5 py-0.5`}><Text className="text-white text-[9.5px] font-extrabold">NOT AVAILABLE</Text></View> : null}
    </>
  );
}

// memo: when the cart changes, only the cards whose qty changed re-render (not the whole menu)
export const ItemCard = memo(function ItemCard({ item, qty, orderType, partner, onPress, width, scheme }) {
  const [bg, fg] = tintFor(item.tint, scheme);
  const Art = item.art;
  const qtyBadge = qty ? <View className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-brand border-[3px] border-card items-center justify-center z-10"><Text className="text-white text-[12px] font-extrabold">{qty}</Text></View> : null;
  const price = (
    <View className="flex-row items-baseline mt-1 mx-1">
      {item.variations.length ? <Text className={`text-[11px] font-semibold mr-1 ${item.image ? 'text-white/80' : 'text-ink-3'}`} style={item.image ? SHADOW : null}>From</Text> : null}
      <Money value={shownPrice(item, orderType, partner)} bold className={`text-[15px] font-extrabold ${item.image ? 'text-white' : 'text-ink'}`} />
    </View>
  );

  // photo: the picture fills the whole card; name and price sit on a dark fade at the bottom (as on Windows)
  if (item.image) {
    return (
      <Pressable onPress={() => onPress(item)} accessibilityRole="button" accessibilityLabel={item.name}
        className={`rounded-card m-1.5 ${qty ? 'border-2 border-brand' : ''} ${item.unavailable ? 'opacity-50' : ''} active:opacity-80`} style={{ width, minHeight: 158 }}>
        <View className="absolute inset-0 rounded-card overflow-hidden" style={{ backgroundColor: bg }}>
          <Image source={{ uri: item.image }} resizeMode="cover" fadeDuration={0} style={StyleSheet.absoluteFill} />
          <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
            <Defs>
              <LinearGradient id={`fade${item.id}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0.38" stopColor="#000" stopOpacity="0" />
                <Stop offset="0.66" stopColor="#000" stopOpacity="0.55" />
                <Stop offset="1" stopColor="#000" stopOpacity="0.8" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="1" height="1" fill={`url(#fade${item.id})`} />
          </Svg>
        </View>
        <Badges item={item} />
        <View className="flex-1 justify-end px-1.5 pb-2.5">
          <Text numberOfLines={2} className="text-[14px] font-bold text-white mx-1" style={SHADOW}>{item.name}</Text>
          {item.name2 ? <Text numberOfLines={1} className="text-[12px] text-white/80 mx-1" style={[SHADOW, { writingDirection: 'rtl', textAlign: 'left' }]}>{item.name2}</Text> : null}
          {price}
        </View>
        {qtyBadge}
      </Pressable>
    );
  }

  return (
    <Pressable onPress={() => onPress(item)} accessibilityRole="button" accessibilityLabel={item.name}
      className={`bg-card rounded-card p-2 pb-3 m-1.5 ${qty ? 'border-2 border-brand' : 'border border-line'} ${item.unavailable ? 'opacity-50' : ''} active:opacity-80`} style={{ width }}>
      <View className="h-[84px] rounded-xl items-center justify-center overflow-hidden" style={{ backgroundColor: bg }}>
        <Art size={34} color={fg} strokeWidth={1.6} />
        <Badges item={item} />
      </View>
      {qtyBadge}
      <Text numberOfLines={1} className="text-[14px] font-bold text-ink mt-2 mx-1">{item.name}</Text>
      {item.name2 ? <Text numberOfLines={1} className="text-[12px] text-ink-3 mx-1" style={{ writingDirection: 'rtl', textAlign: 'left' }}>{item.name2}</Text> : null}
      {price}
    </Pressable>
  );
});

export function ItemGrid({ items, columns, width, qtyById, orderType, partner, onPress, footerSpace = 0 }) {
  const cardW = Math.floor(width / columns) - 12;
  // onPress changes on every render of the POS screen; a stable wrapper keeps the memoised cards from re-rendering
  const pressRef = useRef(onPress);
  pressRef.current = onPress;
  const press = useCallback((it) => pressRef.current(it), []);
  const { scheme } = useTheme();
  const renderItem = useCallback(({ item }) => (
    <ItemCard item={item} width={cardW} qty={qtyById[item.id]} orderType={orderType} partner={partner} onPress={press} scheme={scheme} />
  ), [cardW, qtyById, orderType, partner, press, scheme]);
  return (
    <FlatList data={items} key={columns} numColumns={columns} keyExtractor={(it) => String(it.id)}
      renderItem={renderItem} extraData={renderItem}
      initialNumToRender={columns * 4} maxToRenderPerBatch={columns * 3} windowSize={7} removeClippedSubviews
      contentContainerStyle={{ paddingBottom: 16 + footerSpace }} keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<Text className="text-ink-3 text-center mt-10">No items found</Text>} />
  );
}