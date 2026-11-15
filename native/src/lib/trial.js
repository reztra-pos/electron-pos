// Trial (test) builds: the app stops working at the end date written into src/build-info.json by
// scripts/make-trial.mjs (npm run apk:trial = 3 days). Production builds have no end date.
//
// The end date is fixed in the APK, so reinstalling does not reset it. Moving the tablet's clock back
// does not help either: the latest time ever seen (device clock or the server's Date header) is kept,
// and a clock that jumps back more than 10 minutes locks the trial.
import AsyncStorage from '@react-native-async-storage/async-storage';
import INFO from '../build-info.json';

const KEY = 'reztra.trialSeen';
const UNTIL = INFO?.trialUntil ? Date.parse(INFO.trialUntil) : null;
let server = null;                 // { t: server time, at: device time when it was read }
let last = { trial: !!UNTIL, expired: false, daysLeft: null, until: UNTIL };

export const isTrialBuild = () => !!UNTIL;
/** the server's "Date" header of every API answer */
export function noteServerDate(header) {
    const t = header ? Date.parse(header) : NaN;
    if (Number.isFinite(t)) server = { t, at: Date.now() };
}
/** last checked state (for badges) */
export const trialNow = () => last;

/** { trial, expired, tampered, daysLeft, until } */
export async function checkTrial() {
    if (!UNTIL) return (last = { trial: false, expired: false, daysLeft: null, until: null });
    let seen = 0;
    try { seen = Number(await AsyncStorage.getItem(KEY)) || 0; } catch { /* first run */ }
    const now = Date.now();
    const serverNow = server ? server.t + (now - server.at) : 0;
    const latest = Math.max(now, seen, serverNow);
    if (latest > seen) { try { await AsyncStorage.setItem(KEY, String(latest)); } catch { /* next time */ } }
    const tampered = seen > 0 && now < seen - 10 * 60 * 1000;
    const expired = latest >= UNTIL || tampered;
    last = { trial: true, expired, tampered, until: UNTIL, daysLeft: expired ? 0 : Math.max(1, Math.ceil((UNTIL - latest) / 86400000)) };
    return last;
}