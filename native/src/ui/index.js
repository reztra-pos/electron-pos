// Small UI kit (NativeWind / Tailwind classes; colours from tailwind.config.js = the design boards).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Minus, Plus, X, Delete } from 'lucide-react-native';
import { C } from '../lib/catalog';
import { money } from '../lib/format';

export const COLORS = { brand: '#5B3FD1', brandTint: '#EFEBFF', brandDark: '#3F2A9E', ink: '#141A2A', ink2: '#5A6478', ink3: '#8B93A6', line: '#E3E7EE', ok: '#12A15A', warn: '#B76E00', danger: '#D93545', info: '#2563EB', white: '#FFFFFF', rail: '#AEB6CC' };

/** tablet = shortest side 600dp or more (9" and up, landscape); phone = portrait */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  return { width, height, isTablet, wide: width >= 1366 };
}

/* ---------------- money with the currency sign (Saudi Riyal sign needs its own font) ---------------- */
const RIYAL = '⃁';
export function Money({ value, className = '', bold = false, plain = false, sign = '' }) {
  const cur = plain ? '' : C.outlet.currency || '';
  const amount = `${sign}${money(value)}`;
  const symbol = cur ? (cur === RIYAL || cur.includes(RIYAL)
    ? <Text style={{ fontFamily: bold ? 'SaudiRiyal-Bold' : 'SaudiRiyal' }}>{cur}</Text> : <Text>{cur}</Text>) : null;
  if (!symbol) return <Text className={className}>{amount}</Text>;
  return C.outlet.curAfter
    ? <Text className={className}>{amount} {symbol}</Text>
    : <Text className={className}>{symbol}{cur === RIYAL ? ' ' : ' '}{amount}</Text>;
}

/* ---------------- buttons ---------------- */
const BTN = {
  primary: ['bg-brand', 'text-white', COLORS.white],
  secondary: ['bg-brand-tint', 'text-brand-dark', COLORS.brandDark],
  neutral: ['bg-chip', 'text-ink', COLORS.ink],
  outline: ['bg-white border border-line', 'text-ink', COLORS.ink],
  danger: ['bg-danger', 'text-white', COLORS.white],
  ok: ['bg-ok', 'text-white', COLORS.white],
  ghost: ['bg-transparent', 'text-ink-2', COLORS.ink2],
};
export function Btn({ label, icon: Icon, onPress, variant = 'neutral', disabled, busy, className = '', size = 'md', right, textClass = '', accessibilityLabel }) {
  const [bg, fg, color] = BTN[variant] || BTN.neutral;
  const h = size === 'lg' ? 'h-14 px-5' : size === 'sm' ? 'h-10 px-3' : 'h-12 px-4';
  const ts = size === 'lg' ? 'text-[17px]' : size === 'sm' ? 'text-[13px]' : 'text-[15px]';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} disabled={disabled || busy} onPress={onPress}
      className={`${h} ${bg} rounded-btn flex-row items-center justify-center ${disabled ? 'opacity-50' : ''} active:opacity-80 ${className}`}>
      {busy ? <ActivityIndicator color={color} size="small" /> : Icon ? <Icon size={size === 'sm' ? 16 : 19} color={color} strokeWidth={2.1} /> : null}
      {label ? <Text numberOfLines={1} className={`${fg} ${ts} font-bold ${Icon || busy ? 'ml-2' : ''} ${textClass}`}>{label}</Text> : null}
      {right}
    </Pressable>
  );
}

export function IconBtn({ icon: Icon, onPress, label, className = '', color = COLORS.ink, badge }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      className={`w-11 h-11 rounded-xl bg-white border border-line items-center justify-center active:opacity-70 ${className}`}>
      <Icon size={20} color={color} strokeWidth={2} />
      {badge ? <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-danger items-center justify-center px-1"><Text className="text-white text-[10px] font-bold">{badge}</Text></View> : null}
    </Pressable>
  );
}

const TONES = { ok: 'bg-ok-bg text-ok', warn: 'bg-warn-bg text-warn', danger: 'bg-danger-bg text-danger', info: 'bg-info-bg text-info', brand: 'bg-brand-tint text-brand-dark', neutral: 'bg-chip text-ink-2' };
export function Tag({ text, tone = 'neutral', className = '' }) {
  const [bg, fg] = (TONES[tone] || TONES.neutral).split(' ');
  return <View className={`${bg} rounded-md px-2 py-0.5 self-start ${className}`}><Text className={`${fg} text-[11.5px] font-bold`}>{text}</Text></View>;
}

/** pill toggle (categories, filters, segments) */
export function Pill({ label, active, onPress, count, icon: Icon, className = '' }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}
      className={`h-10 px-4 rounded-xl flex-row items-center mr-2 ${active ? 'bg-ink' : 'bg-white border border-line'} ${className}`}>
      {Icon ? <Icon size={15} color={active ? '#fff' : COLORS.ink2} strokeWidth={2.2} /> : null}
      <Text className={`text-[14px] font-semibold ${Icon ? 'ml-1.5' : ''} ${active ? 'text-white' : 'text-ink-2'}`}>{label}</Text>
      {count != null ? <Text className={`ml-2 text-[11.5px] font-semibold ${active ? 'text-[#B9C0D3]' : 'text-ink-3'}`}>{count}</Text> : null}
    </Pressable>
  );
}

/** segmented control */
export function Segment({ options, value, onChange, className = '' }) {
  return (
    <View className={`flex-row bg-chip rounded-xl p-1 ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }}
            className={`flex-1 h-10 rounded-[9px] flex-row items-center justify-center ${on ? 'bg-white' : ''}`} style={on ? { elevation: 1 } : null}>
            {Icon ? <Icon size={16} color={on ? COLORS.brand : COLORS.ink2} strokeWidth={2.2} /> : null}
            <Text numberOfLines={1} className={`text-[13.5px] font-bold ${Icon ? 'ml-1.5' : ''} ${on ? 'text-brand' : 'text-ink-2'}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({ value, onChange, min = 0, big = false }) {
  const h = big ? 'h-12' : 'h-10';
  return (
    <View className={`flex-row items-center bg-chip rounded-xl ${h}`}>
      <Pressable accessibilityLabel="Decrease" onPress={() => onChange(Math.max(min, value - 1))} className={`w-10 ${h} items-center justify-center`}><Minus size={17} color={COLORS.ink2} strokeWidth={2.4} /></Pressable>
      <Text className="min-w-[24px] text-center text-[15px] font-bold text-ink">{value}</Text>
      <Pressable accessibilityLabel="Increase" onPress={() => onChange(value + 1)} className={`w-10 ${h} items-center justify-center`}><Plus size={17} color={COLORS.ink2} strokeWidth={2.4} /></Pressable>
    </View>
  );
}

export function Field({ label, children, error, className = '' }) {
  return (
    <View className={`mb-3 ${className}`}>
      {label ? <Text className="text-[12.5px] font-semibold text-ink-2 mb-1.5">{label}</Text> : null}
      {children}
      {error ? <Text className="text-danger text-[12.5px] mt-1">{error}</Text> : null}
    </View>
  );
}
export const Input = React.forwardRef(function Input({ className = '', ...p }, ref) {
  return <TextInput ref={ref} placeholderTextColor={COLORS.ink3} className={`h-12 rounded-xl border border-line bg-white px-3 text-[15px] text-ink ${className}`} {...p} />;
});

export function Row({ label, value, strong, className = '' }) {
  return (
    <View className={`flex-row justify-between items-center py-1 ${className}`}>
      <Text className={strong ? 'text-[16px] font-extrabold text-ink' : 'text-[13.5px] text-ink-2'}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? <Text className={strong ? 'text-[20px] font-extrabold text-ink' : 'text-[13.5px] font-bold text-ink'}>{value}</Text> : value}
    </View>
  );
}

/** number pad (payment, PIN, opening balance) */
export function Keypad({ onKey, keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'], className = '', keyClass = 'h-14' }) {
  return (
    <View className={`flex-row flex-wrap -m-1 ${className}`}>
      {keys.map((k) => (
        <View key={k} className="w-1/3 p-1">
          <Pressable accessibilityLabel={k === 'del' ? 'Delete' : k} onPress={() => onKey(k)}
            className={`${keyClass} rounded-xl bg-chip items-center justify-center active:bg-brand-tint`}>
            {k === 'del' ? <Delete size={22} color={COLORS.ink} /> : <Text className="text-[22px] font-bold text-ink">{k === 'clr' ? 'C' : k}</Text>}
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/* ---------------- modal: centred card on tablet, bottom sheet on phone ---------------- */
export function Sheet({ visible = true, title, subtitle, onClose, children, footer, size = 'md', scroll = true, closable = true }) {
  const { isTablet, height } = useLayout();
  const inset = useSafeAreaInsets();
  const maxW = size === 'xl' ? 1100 : size === 'lg' ? 820 : size === 'sm' ? 440 : 600;
  const Body = scroll ? ScrollView : View;
  const card = (
    <View className="bg-white overflow-hidden" style={isTablet
      ? { width: '92%', maxWidth: maxW, maxHeight: height * 0.92, borderRadius: 22 }
      : { width: '100%', maxHeight: height - inset.top - 24, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: inset.bottom }}>
      {!isTablet ? <View className="w-11 h-1.5 rounded-full bg-[#D3D8E2] self-center mt-2.5" /> : null}
      {title ? (
        <View className="flex-row items-center px-5 pt-4 pb-3 border-b border-line">
          <View className="flex-1"><Text className="text-[19px] font-extrabold text-ink" numberOfLines={1}>{title}</Text>
            {subtitle ? <Text className="text-[12.5px] text-ink-2 mt-0.5" numberOfLines={1}>{subtitle}</Text> : null}</View>
          {closable ? <Pressable accessibilityLabel="Close" onPress={onClose} className="w-10 h-10 rounded-xl items-center justify-center bg-chip"><X size={20} color={COLORS.ink2} /></Pressable> : null}
        </View>
      ) : null}
      <Body className={scroll ? '' : 'flex-shrink'} contentContainerStyle={scroll ? { padding: 20 } : undefined} keyboardShouldPersistTaps="handled" style={!scroll ? { padding: 20, flexShrink: 1 } : { flexShrink: 1 }}>
        {children}
      </Body>
      {footer ? <View className="flex-row px-5 py-3 border-t border-line bg-[#FAFBFC]" style={{ gap: 8 }}>{footer}</View> : null}
    </View>
  );
  return (
    <Modal visible={visible} transparent animationType={isTablet ? 'fade' : 'slide'} onRequestClose={() => closable && onClose?.()} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable className={`flex-1 bg-black/40 ${isTablet ? 'items-center justify-center' : 'justify-end'}`} onPress={() => closable && onClose?.()}>
          <Pressable onPress={() => {}} style={isTablet ? { width: '100%', alignItems: 'center' } : { width: '100%' }}>{card}</Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------------- toasts + confirm ---------------- */
const UiCtx = createContext({ notify: () => {}, confirm: async () => false });
export const useUi = () => useContext(UiCtx);

export function UiProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [dlg, setDlg] = useState(null);
  const tRef = useRef(null);
  const notify = useCallback((text, ms = 3200, tone = 'ink') => {
    setToast({ text, tone });
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setToast(null), ms);
  }, []);
  const confirm = useCallback((message, opts = {}) => new Promise((resolve) => setDlg({ message, ...opts, resolve })), []);
  useEffect(() => () => clearTimeout(tRef.current), []);
  const close = (v) => { dlg?.resolve(v); setDlg(null); };
  return (
    <UiCtx.Provider value={{ notify, confirm }}>
      {children}
      {toast ? (
        <View pointerEvents="none" className="absolute left-0 right-0 bottom-24 items-center px-4">
          <View className={`rounded-2xl px-4 py-3 max-w-[560px] ${toast.tone === 'danger' ? 'bg-danger' : 'bg-ink'}`} style={{ elevation: 6 }}>
            <Text className="text-white text-[14px] font-semibold">{toast.text}</Text>
          </View>
        </View>
      ) : null}
      {dlg ? (
        <Sheet title={dlg.title || 'Please confirm'} onClose={() => close(false)} size="sm" scroll={false}
          footer={<><Btn label={dlg.cancelLabel || 'Cancel'} onPress={() => close(false)} className="flex-1" />
            <Btn label={dlg.confirmLabel || 'OK'} variant={dlg.danger ? 'danger' : 'primary'} onPress={() => close(true)} className="flex-1" /></>}>
          <Text className="text-[15px] text-ink leading-6">{dlg.message}</Text>
        </Sheet>
      ) : null}
    </UiCtx.Provider>
  );
}

export function Splash({ text, action, second }) {
  return (
    <View className="flex-1 bg-app items-center justify-center p-6">
      <View className="w-14 h-14 rounded-2xl bg-brand items-center justify-center mb-4"><Text className="text-white text-2xl font-extrabold">R</Text></View>
      {!action ? <ActivityIndicator color={COLORS.brand} /> : null}
      <Text className="text-ink-2 text-[15px] mt-3 text-center">{text}</Text>
      {action ? <View className="flex-row mt-5" style={{ gap: 8 }}>
        {second ? <Btn label={second.label} onPress={second.onClick} /> : null}
        <Btn label={action.label} variant="primary" onPress={action.onClick} />
      </View> : null}
    </View>
  );
}
