// Light / dark mode for the whole app (activation, login, POS, popups).
// The choice is kept on this PC (localStorage "pos.theme") and set as <html data-theme="light|dark">;
// every screen's colours are CSS variables that switch on that attribute.
import { useEffect, useState } from "react";

const KEY = "pos.theme";
const listeners = new Set();

export function getTheme() {
    try { const t = localStorage.getItem(KEY); if (t === "dark" || t === "light") return t; } catch { /* ignore */ }
    return "light";
}

export function applyTheme(t = getTheme()) {
    if (typeof document !== "undefined") document.documentElement.dataset.theme = t;
}

export function setTheme(t) {
    try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
    applyTheme(t);
    listeners.forEach((fn) => fn(t));
}

export const toggleTheme = () => setTheme(getTheme() === "dark" ? "light" : "dark");

/** [theme, toggle] — re-renders when the theme changes anywhere */
export function useTheme() {
    const [t, setT] = useState(getTheme);
    useEffect(() => { listeners.add(setT); return () => listeners.delete(setT); }, []);
    return [t, toggleTheme];
}

applyTheme();