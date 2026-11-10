// Light / dark mode for the whole app (same colours as the desktop app's light and dark themes).
//
// Every Tailwind colour in tailwind.config.js is a CSS variable (bg-card, text-ink, border-line ...).
// ThemeProvider sets those variables at the root with NativeWind's vars(), so all screens and popups
// switch together. COLORS (icons, spinners, switches) is updated in place for the same theme.
// The choice (light / dark / system) is kept on this device: getPref('theme').
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, StatusBar, View } from 'react-native';
import { vars } from 'nativewind';
import { getPref, setPref } from '../lib/storage';

export const LIGHT = {
    brand: '#5B3FD1', brandTint: '#EFEBFF', brandSoft: '#D9D0FF', brandDark: '#3F2A9E',
    ink: '#141A2A', ink2: '#5A6478', ink3: '#8B93A6',
    app: '#EEF0F5', card: '#FFFFFF', soft: '#FAFBFC', line: '#E3E7EE', chip: '#F1F3F7',
    rail: '#151B2E', inverse: '#141A2A',
    ok: '#12A15A', okBg: '#DFF5E8', warn: '#B76E00', warnBg: '#FFF2D9', warnBar: '#F59E0B',
    danger: '#D93545', dangerBg: '#FDE8EA', info: '#2563EB', infoBg: '#E3EDFF',
    white: '#FFFFFF', railText: '#AEB6CC',
};

export const DARK = {
    brand: '#8B74F0', brandTint: '#2C2550', brandSoft: '#4A3D8F', brandDark: '#C9BEFF',
    ink: '#E8ECF3', ink2: '#A3ADBF', ink3: '#768196',
    app: '#0F131B', card: '#1A202B', soft: '#1F2532', line: '#2E3746', chip: '#252D3B',
    rail: '#0B0F16', inverse: '#3A4357',
    ok: '#34C08A', okBg: '#16352A', warn: '#F2C46B', warnBg: '#3A2E12', warnBar: '#F59E0B',
    danger: '#EF5A50', dangerBg: '#3B1E1E', info: '#4A9BEA', infoBg: '#17304C',
    white: '#FFFFFF', railText: '#AEB6CC',
};

/** colours for JS props (icons, ActivityIndicator, Switch). Always the current theme. */
export const COLORS = { ...LIGHT };

// palette key -> CSS variable used by tailwind.config.js
const VARS = {
    brand: '--brand', brandTint: '--brand-tint', brandSoft: '--brand-soft', brandDark: '--brand-dark',
    ink: '--ink', ink2: '--ink-2', ink3: '--ink-3', app: '--app', card: '--card', soft: '--soft', line: '--line', chip: '--chip',
    rail: '--rail', inverse: '--inverse', ok: '--ok', okBg: '--ok-bg', warn: '--warn', warnBg: '--warn-bg', warnBar: '--warn-bar',
    danger: '--danger', dangerBg: '--danger-bg', info: '--info', infoBg: '--info-bg',
};

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toVars = (p) => Object.fromEntries(Object.entries(VARS).map(([k, v]) => [v, rgb(p[k]).join(' ')]));

/** a mix of two hex colours (a share of `a`) */
export function mix(a, b, share) {
    const x = rgb(a), y = rgb(b);
    return '#' + x.map((c, i) => Math.round(c * share + y[i] * (1 - share)).toString(16).padStart(2, '0')).join('');
}

/** category tint [background, icon] for a menu card in the current theme */
export function tintFor([bg, fg], scheme) {
    return scheme === 'dark' ? [mix(bg, DARK.card, 0.22), 'rgba(232,236,243,0.6)'] : [bg, fg];
}

const ThemeCtx = createContext({ mode: 'system', scheme: 'light', setMode: () => { } });
/** { mode: 'light'|'dark'|'system', scheme: 'light'|'dark', setMode } */
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children, initialMode }) {
    const [mode, setModeState] = useState(initialMode || 'system');
    const [system, setSystem] = useState(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');
    useEffect(() => {
        if (!initialMode) getPref('theme', 'system').then((m) => { if (m === 'light' || m === 'dark' || m === 'system') setModeState(m); });
        const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme === 'dark' ? 'dark' : 'light'));
        return () => sub.remove();
    }, []); // eslint-disable-line
    const scheme = mode === 'system' ? system : mode;
    const palette = scheme === 'dark' ? DARK : LIGHT;
    Object.assign(COLORS, palette);           // before the children render, so their icons get this theme
    const rootVars = useMemo(() => vars(toVars(palette)), [palette]);
    const value = useMemo(() => ({ mode, scheme, setMode: (m) => { setModeState(m); setPref('theme', m); } }), [mode, scheme]);
    return (
        <ThemeCtx.Provider value={value}>
            <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={palette.app} />
            <View style={[{ flex: 1, backgroundColor: palette.app }, rootVars]}>{children}</View>
        </ThemeCtx.Provider>
    );
}