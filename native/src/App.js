// Reztra POS for Android (tablet landscape / phone portrait).
// Flow: activation (device key) -> PIN login -> load menu & settings -> (open register) -> POS.
import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UiProvider, Splash, ThemeProvider, useTheme } from './ui';
import * as api from './lib/api';
import { applyCatalog, C } from './lib/catalog';
import { firstError } from './lib/format';
import ActivateScreen from './screens/Activate';
import LoginScreen from './screens/Login';
import PosScreen from './pos/PosScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <UiProvider><Root /></UiProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  useTheme();      // re-render every screen when light / dark changes (icon colours come from COLORS)
  const [stage, setStage] = useState('boot');     // boot | activate | login | loading | pos | error
  const [notice, setNotice] = useState('');
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [device, setDevice] = useState(null);

  useEffect(() => {
    api.setHandlers({
      revoked: (msg) => { setUser(null); setNotice(msg || 'This device has been disabled in the web app.'); setStage('activate'); api.resetDevice(); },
      sessionEnded: (msg) => { setUser(null); setNotice(msg || 'Your session has ended. Please log in again.'); setStage('login'); },
    });
    (async () => {
      const d = await api.getDevice();
      if (!d) return setStage('activate');
      setDevice(d);
      const st = await api.checkDevice();
      if (!st.active) { setNotice(st.message || 'This device has been disabled. Activate it again.'); await api.resetDevice(); return setStage('activate'); }
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

  if (stage === 'boot') return <Splash text="Connecting to the server…" />;
  if (stage === 'activate') return <ActivateScreen notice={notice} onActivated={(d) => { setNotice(''); setDevice(d); setStage('login'); }} />;
  if (stage === 'login') return <LoginScreen notice={notice} device={device} onLogin={(u) => { setNotice(''); setUser(u); load(); }} onReset={async () => { await api.resetDevice(); setDevice(null); setStage('activate'); }} />;
  if (stage === 'loading') return <Splash text="Loading menu, tables and settings…" />;
  if (stage === 'error') return <Splash text={error} action={{ label: 'Retry', onClick: load }} second={{ label: 'Log out', onClick: logout }} />;
  return <PosScreen key={user?.id} user={user} device={device} onLogout={logout} registerOpen={C.registerOpen} />;
}