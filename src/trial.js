// Testing build status from the Electron main process (electron/trial.cjs). Normal builds: { enabled: false }.
import { useEffect, useState } from "react";

const E = typeof window !== "undefined" ? window.electronAPI : undefined;

export function useTrial() {
  const [trial, setTrial] = useState(E?.trial ? undefined : { enabled: false });   // undefined = still asking
  useEffect(() => {
    if (!E?.trial) return undefined;
    let alive = true;
    const load = () => E.trial.get().then((t) => alive && setTrial(t)).catch(() => alive && setTrial({ enabled: false }));
    load();
    const off = E.trial.onExpired((t) => setTrial({ ...t, expired: true }));
    const timer = setInterval(load, 10 * 60_000);       // keep "days left" current
    return () => { alive = false; off(); clearInterval(timer); };
  }, []);
  return trial;
}

export const trialDate = (t) => (t?.until ? new Date(t.until).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
