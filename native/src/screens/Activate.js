// First run: paste the device API key made in the web app (Settings -> POS Devices).
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import Clipboard from '../lib/clipboard';
import { KeyRound, ClipboardPaste, Monitor, Store, CalendarClock, ShieldAlert, CheckCircle2 } from 'lucide-react-native';
import { Btn, COLORS, useLayout } from '../ui';
import { activate, previewKey } from '../lib/api';
import { deviceInfo } from '../lib/printer';

export default function ActivateScreen({ onActivated, notice = '' }) {
  const { isTablet } = useLayout();
  const [key, setKey] = useState('');
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');

  const check = async (k = key) => {
    setErr(''); setInfo(null);
    if (!k.trim()) return;
    setBusy('check');
    try { setInfo(await previewKey(k)); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const paste = async () => { const t = await Clipboard.getString(); setKey(t || ''); if (t) check(t); };
  const go = async () => {
    setBusy('go'); setErr('');
    try { onActivated(await activate(key, await deviceInfo().catch(() => ({})))); }
    catch (e) { setErr(e.message); setBusy(null); }
  };

  return (
    <ScrollView className="flex-1 bg-app" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
      <View className="w-full bg-white rounded-3xl border border-line p-6" style={{ maxWidth: isTablet ? 560 : 520, elevation: 2 }}>
        <View className="flex-row items-center mb-1">
          <View className="w-12 h-12 rounded-xl bg-brand items-center justify-center mr-3"><KeyRound size={24} color="#fff" /></View>
          <View className="flex-1"><Text className="text-[22px] font-extrabold text-ink">Activate this POS</Text>
            <Text className="text-[13.5px] text-ink-2">Connect this device to your outlet with a device key.</Text></View>
        </View>
        {notice ? <View className="flex-row items-start bg-danger-bg rounded-xl p-3 mt-3"><ShieldAlert size={18} color={COLORS.danger} /><Text className="text-danger font-semibold ml-2 flex-1">{notice}</Text></View> : null}
        <Text className="text-ink-2 text-[13.5px] mt-4 leading-6">1. In the web app open Settings → POS Devices and copy the device API key.{'\n'}2. Paste it below, check the device and outlet, then tap Activate.</Text>
        <Text className="text-[12.5px] font-bold text-ink-2 mt-4 mb-1.5">Device API key</Text>
        <TextInput value={key} onChangeText={(t) => { setKey(t); setInfo(null); }} onEndEditing={() => check()} multiline placeholder="RZT1.xxxxxxxx…" placeholderTextColor={COLORS.ink3}
          autoCapitalize="none" autoCorrect={false} className="min-h-[110px] rounded-xl border border-line p-3 text-[13px] text-ink" style={{ fontFamily: 'monospace', textAlignVertical: 'top' }} />
        <View className="flex-row mt-3" style={{ gap: 8 }}>
          <Btn label="Paste" icon={ClipboardPaste} onPress={paste} />
          <Btn label={info ? 'Activate' : 'Check key'} variant="primary" className="flex-1" busy={!!busy} disabled={!key.trim()} onPress={info ? go : () => check()} />
        </View>
        {err ? <Text className="text-danger font-semibold mt-3">{err}</Text> : null}
        {info ? (
          <View className="mt-4 border border-line rounded-xl overflow-hidden">
            <InfoRow icon={Monitor} label="Device" value={info.device_name || info.device_id} />
            <InfoRow icon={Store} label="Outlet" value={info.outlet_name || (info.outlet_id ? `#${info.outlet_id}` : '—')} />
            {info.expires ? <InfoRow icon={CalendarClock} label="Key valid until" value={new Date(info.expires).toLocaleString()} /> : null}
            {info.access_days ? <InfoRow icon={CalendarClock} label="Access" value={`${info.access_days} days`} /> : null}
            <View className="flex-row items-center px-3 py-2.5"><CheckCircle2 size={16} color={COLORS.ok} /><Text className="text-ok font-semibold ml-2">{info.checked ? 'Key checked with the server' : 'Key is valid'}</Text></View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <View className="flex-row items-center px-3 py-2.5 border-b border-[#EEF1F5]">
      <Icon size={16} color={COLORS.ink2} /><Text className="text-ink-2 w-28 ml-2">{label}</Text><Text className="font-bold text-ink flex-1">{value}</Text>
    </View>
  );
}
