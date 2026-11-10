import { C } from './catalog';

export const money = (n) => (Number(n) || 0).toFixed(C.outlet.precision ?? 2);
export const r2 = (n) => Number((Number(n) || 0).toFixed(C.outlet.precision ?? 2));
export const amountStr = ({ mode, value }) => (Number(value) > 0 ? (mode === 'percent' ? `${Number(value)}%` : String(Number(value))) : '');
export const parseAmount = (s) => {
  const t = String(s ?? '').trim();
  if (!t) return { mode: 'fixed', value: 0 };
  return t.endsWith('%') ? { mode: 'percent', value: Number(t.slice(0, -1)) || 0 } : { mode: 'fixed', value: Number(t) || 0 };
};
export const firstError = (e) => (e?.errors && Object.values(e.errors)[0]) || e?.message || 'Something went wrong.';
export const minutesAgo = (when) => {
  const t = typeof when === 'number' ? Date.now() - when * 60000 : new Date(String(when).replace(' ', 'T')).getTime();
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
