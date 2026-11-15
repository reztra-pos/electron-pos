// Reztra POS for Android (tablet landscape / phone portrait).
// Flow: activation (device key) -> PIN login -> load menu & settings -> (open register) -> POS.
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS, UiProvider, Splash, ThemeProvider, useTheme } from './ui';
import * as api from './lib/api';
import { applyCatalog, C } from './lib/catalog';
import { firstError } from './lib/format';
import ActivateScreen from './screens/Activate';
import LoginScreen from './screens/Login';
import PosScreen from './pos/PosScreen';
import { LangProvider, tr, useLang } from './lib/i18n';
import { checkTrial } from './lib/trial';
import { dateLabel } from './pos/DateTime';

export default function App() {
  return (
    <SafeAreaProvider>
      <LangProvider>
        <ThemeProvider>
          <UiProvider><Root /></UiProvider>
        </ThemeProvider>
      </LangProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  useTheme();      // re-render every screen when light / dark changes (icon colours come from COLORS)
  useLang();       // ... and when the language changes
  const [stage, setStage] = useState('boot');     // boot | activate | login | loading | pos | error
  const [notice, setNotice] = useState('');
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [device, setDevice] = useState(null);
  const [trialEnd, setTrialEnd] = useState(null);     // trial build that has ended -> locked

  // trial builds: check at start, every 5 minutes, and whenever the app comes back to the screen
  useEffect(() => {
    const check = () => checkTrial().then((t) => { if (t.expired) setTrialEnd(t); }).catch(() => { });
    check();
    const timer = setInterval(check, 5 * 60 * 1000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') check(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, []);

  useEffect(() => {
    api.setHandlers({
      revoked: (msg) => { setUser(null); setNotice(msg || tr('This device has been disabled in the web app.')); setStage('activate'); api.resetDevice(); },
      sessionEnded: (msg) => { setUser(null); setNotice(msg || tr('Your session has ended. Please log in again.')); setStage('login'); },
    });
    (async () => {
      const d = await api.getDevice();
      if (!d) return setStage('activate');
      setDevice(d);
      const st = await api.checkDevice();
      if (!st.active) { setNotice(st.message || tr('This device has been disabled. Activate it again.')); await api.resetDevice(); return setStage('activate'); }
      setStage('login');
    })();
  }, []);

  const load = useCallback(async () => {
    setStage('loading'); setError('');
    try {
      const [boot, customers] = await Promise.all([api.get('/v1/pos/bootstrap'), api.get('/v1/customers?limit=200')]);
      applyCatalog(boot, customers);
      setStage('pos');
    } catch (e) { setError(firstError(e)); setStage('error'); }
  }, []);

  const logout = useCallback(async () => { await api.logout(); setUser(null); setStage('login'); }, []);

  if (trialEnd) return <TrialEnded until={trialEnd.until} />;
  if (stage === 'boot') return <Splash text={tr("Connecting to the server…")} />;
  if (stage === 'activate') return <ActivateScreen notice={notice} onActivated={(d) => { setNotice(''); setDevice(d); setStage('login'); }} />;
  if (stage === 'login') return <LoginScreen notice={notice} device={device} onLogin={(u) => { setNotice(''); setUser(u); load(); }} onReset={async () => { await api.resetDevice(); setDevice(null); setStage('activate'); }} />;
  if (stage === 'loading') return <Splash text={tr("Loading menu, tables and settings…")} />;
  if (stage === 'error') return <Splash text={error} action={{ label: tr("Retry"), onClick: load }} second={{ label: tr("Log out"), onClick: logout }} />;
  return <PosScreen key={user?.id} user={user} device={device} onLogout={logout} registerOpen={C.registerOpen} />;
}
// the trial (test) version has ended: nothing else can be used
function TrialEnded({ until }) {
  const d = new Date(until);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (
    <View className="flex-1 bg-app items-center justify-center px-8">
      <View className="w-20 h-20 rounded-3xl bg-warn-bg items-center justify-center"><Lock size={38} color={COLORS.warn} /></View>
      <Text className="text-[24px] font-extrabold text-ink mt-5 text-center">{tr('The trial version has ended')}</Text>
      <Text className="text-ink-2 text-[15px] mt-2 text-center">{tr('This test version of Reztra POS stopped working on {date}. Contact Reztra to get the full version.', { date: dateLabel(day) })}</Text>
      <Text className="text-ink-3 text-[13px] mt-6">support@reztra.com · www.reztra.com</Text>
    </View>
  );
}