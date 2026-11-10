// PIN login (4 digits, logs in by itself), or email + password. Always checked by the server with this device's token.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Lock, Mail, KeyRound, ArrowLeft, ShieldAlert, Monitor } from 'lucide-react-native';
import { Btn, COLORS, Input, Keypad, useLayout, useUi } from '../ui';
import { loginPin, loginPassword } from '../lib/api';
import { firstError } from '../lib/format';

const PIN_LEN = 4;

export default function LoginScreen({ onLogin, notice = '', device, onReset }) {
  const { isTablet } = useLayout();
  const { confirm } = useUi();
  const [mode, setMode] = useState('pin');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);

  const submitPin = async (p) => {
    setBusy(true); setErr('');
    try { onLogin(await loginPin(p)); }
    catch (e) { setErr(firstError(e)); setPin(''); setBusy(false); }
  };
  const onKey = (k) => {
    if (busy) return;
    setErr('');
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    if (k === 'clr') return setPin('');
    const next = (pin + k).slice(0, PIN_LEN);
    setPin(next);
    if (next.length === PIN_LEN) submitPin(next);
  };
  const submitPassword = async () => {
    setBusy(true); setErr('');
    try { onLogin(await loginPassword(email.trim(), password)); }
    catch (e) { setErr(firstError(e)); setBusy(false); }
  };
  const reset = async () => {
    if (await confirm('Disconnect this device from the outlet? You will need a new device key to use it again.', { title: 'Reset activation', confirmLabel: 'Disconnect', danger: true })) onReset();
  };

  const card = (
    <View className="w-full bg-card rounded-3xl border border-line px-6 pt-6 pb-4 items-center" style={{ maxWidth: 420, elevation: 2 }}>
      <View className="flex-row items-center mb-1"><View className="w-11 h-11 rounded-xl bg-brand items-center justify-center mr-2"><Text className="text-white text-xl font-extrabold">R</Text></View><Text className="text-[26px] font-extrabold text-brand-dark">Reztra</Text></View>
      <Text className="text-[18px] font-bold text-ink mt-1">{mode === 'pin' ? 'Enter your PIN' : 'Log in with email'}</Text>
      <Text className="text-[13px] text-ink-2 mb-4">{device?.outlet_name || ''}{device?.device_name ? ` · ${device.device_name}` : ''}</Text>
      {mode === 'pin' ? (
        <>
          <View className="flex-row mb-3" style={{ gap: 12 }}>
            {Array.from({ length: PIN_LEN }).map((_, i) => (
              <View key={i} className={`w-14 h-16 rounded-xl border-2 items-center justify-center ${err ? 'border-danger bg-danger-bg' : i < pin.length ? 'border-brand bg-card' : i === pin.length ? 'border-brand bg-brand-tint' : 'border-line bg-soft'}`}>
                {i < pin.length ? <View className="w-3 h-3 rounded-full bg-ink" /> : null}
              </View>
            ))}
          </View>
          <Text className={`min-h-[20px] mb-2 text-[13px] font-semibold ${err ? 'text-danger' : 'text-ink-2'}`}>{err || (busy ? 'Checking…' : ' ')}</Text>
          <View style={{ width: 252 }}><Keypad onKey={onKey} keys={['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clr', '0', 'del']} keyClass="h-[58px]" /></View>
          <Pressable onPress={() => { setMode('password'); setErr(''); }} className="flex-row items-center mt-4 p-2"><Mail size={15} color={COLORS.ink2} /><Text className="text-ink-2 font-bold ml-1.5">Use email and password</Text></Pressable>
        </>
      ) : (
        <View className="w-full">
          <Input placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" className="mb-3" />
          <Input placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submitPassword} className="mb-3" />
          {err ? <Text className="text-danger font-semibold mb-2">{err}</Text> : null}
          <Btn label="Log in" icon={Lock} variant="primary" busy={busy} disabled={!email || !password} onPress={submitPassword} />
          <Pressable onPress={() => { setMode('pin'); setErr(''); }} className="flex-row items-center justify-center mt-4 p-2"><ArrowLeft size={15} color={COLORS.ink2} /><Text className="text-ink-2 font-bold ml-1.5">Back to PIN</Text></Pressable>
        </View>
      )}
      <Pressable onPress={reset} className="flex-row items-center mt-3 pt-3 border-t border-line w-full justify-center"><Monitor size={14} color={COLORS.ink3} /><Text className="text-ink-3 text-[12px] ml-1.5">Reset activation</Text></Pressable>
    </View>
  );

  return (
    <ScrollView className="flex-1 bg-app" contentContainerStyle={{ flexGrow: 1, padding: 20, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
      {notice ? <View className="flex-row items-center bg-danger-bg rounded-xl p-3 mb-4 self-center" style={{ maxWidth: 720 }}><ShieldAlert size={18} color={COLORS.danger} /><Text className="text-danger font-semibold ml-2">{notice}</Text></View> : null}
      {isTablet ? (
        <View className="flex-row items-center justify-center" style={{ gap: 60 }}>
          <View style={{ maxWidth: 460 }}>
            <Text className="text-[40px] font-extrabold text-ink leading-[46px]">Welcome to <Text className="text-brand">Reztra POS</Text></Text>
            <Text className="text-[64px] font-extrabold text-ink mt-6">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text className="text-ink-2 font-semibold text-[16px] mb-5">{now.toDateString()}</Text>
            <Text className="text-ink-2 text-[15px] leading-6">Take orders, send them to the kitchen, collect payments and print ZATCA invoices — all from this tablet.</Text>
            <View className="flex-row flex-wrap mt-4" style={{ gap: 8 }}>
              {['Dine in · Take away · Delivery', 'KOT printing', 'ZATCA invoices'].map((f) => <View key={f} className="bg-card border border-line rounded-full px-3 py-1.5"><Text className="text-ink-2 font-bold text-[12.5px]">{f}</Text></View>)}
            </View>
          </View>
          {card}
        </View>
      ) : <View className="items-center">{card}</View>}
      <View className="flex-row items-center justify-center mt-5"><KeyRound size={13} color={COLORS.ink3} /><Text className="text-ink-3 text-[12px] ml-1.5">support@reztra.com · www.reztra.com</Text></View>
    </ScrollView>
  );
}