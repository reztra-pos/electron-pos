// Languages: English, Hindi, Arabic. Arabic turns the whole app right-to-left (like the desktop app).
//
//  tr('Order {n} placed', { n: 12 })  -> the text in the chosen language (English if a text has no translation)
//  The English text is the key; the translations are in ./lang/hi.js and ./lang/ar.js.
//
// Right-to-left uses React Native's own RTL (I18nManager): rows, margins, positions and text alignment all
// flip, same as the desktop app with dir="rtl". Android applies a direction change when the app starts again,
// so switching to / from Arabic reloads the app once (ReztraPrinter.restartApp; in a debug build DevSettings.reload;
// in an older build without restartApp: "close and open the app again").
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DevSettings, I18nManager, NativeModules, View } from 'react-native';
import { getPref, setPref } from './storage';
import HI from './lang/hi';
import AR from './lang/ar';

export const LANGS = [
    { value: 'en', label: 'English' },
    { value: 'hi', label: 'हिन्दी' },
    { value: 'ar', label: 'العربية' },
];
const DICT = { hi: HI, ar: AR };
let current = 'en';

export const getLang = () => current;
export const isRtl = () => current === 'ar';

/** text in the current language; {name} placeholders are filled from vars */
export function tr(key, vars) {
    if (typeof key !== 'string' || !key) return key;
    const s = (current !== 'en' && DICT[current]?.[key]) || key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s;
}
/** "1 item" / "3 items" */
export const trn = (n, one, many) => tr(Number(n) === 1 ? one : many, { n });

/** turn an arrow / chevron the other way in Arabic (icons are not flipped by RTL) */
export const flipX = () => (I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : null);

/** restart so Android uses the new direction; false when this build can't (then: close and reopen) */
function restartApp() {
    try {
        if (NativeModules.ReztraPrinter?.restartApp) { NativeModules.ReztraPrinter.restartApp(); return true; }
        if (__DEV__ && DevSettings?.reload) { DevSettings.reload('language'); return true; }
    } catch { /* fall through */ }
    return false;
}
/** make Android's layout direction match the language; true when a restart is needed for it */
function applyDirection(lang) {
    const rtl = lang === 'ar';
    I18nManager.allowRTL(rtl);              // English / Hindi stay left-to-right even on an Arabic phone
    I18nManager.forceRTL(rtl);
    return I18nManager.isRTL !== rtl;
}

const LangCtx = createContext({ lang: 'en', setLang: async () => true, needsRestart: false });
/** { lang, setLang(l) -> true | 'restart' (close and reopen the app), needsRestart } */
export const useLang = () => useContext(LangCtx);

export function LangProvider({ children, initialLang }) {
    const [lang, setLangState] = useState(initialLang || null);
    const [needsRestart, setNeedsRestart] = useState(false);
    useEffect(() => {
        if (initialLang) return;
        getPref('lang', 'en').then((l) => {
            const v = ['en', 'hi', 'ar'].includes(l) ? l : 'en';
            current = v;
            setLangState(v);
            if (applyDirection(v) && !restartApp()) setNeedsRestart(true);
        }).catch(() => setLangState('en'));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    if (lang) current = lang;                 // before the children render
    const value = useMemo(() => ({
        lang: lang || 'en',
        needsRestart,
        setLang: async (l) => {
            if (!['en', 'hi', 'ar'].includes(l)) return true;
            current = l;
            setLangState(l);
            await setPref('lang', l);
            if (applyDirection(l)) {
                if (restartApp()) return true;
                setNeedsRestart(true);
                return 'restart';
            }
            setNeedsRestart(false);
            return true;
        },
    }), [lang, needsRestart]);
    if (!lang) return <View style={{ flex: 1 }} />;   // a few ms: the saved language is read first
    return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}