// Paper size (58 mm / 80 mm) of the printers on THIS device. Saved only on the device, never on the server.
// Every API call sends it in the "X-Paper" header; the server's Escposbuilder lays the receipt out for that width.
// No choice on this device = no header = 80 mm, exactly as before.
//
// Saved as { '*': 58, 'role:invoice': 80, 'role:bill': 58, 'role:kot:3': { mm: 58, name: 'Grill' } }
//   '*' = default of this device; a receipt type without its own size uses it.
import { getPref, setPref } from './storage';

export const PAPERS = [58, 80];
let cache = null;

export async function getPaper() {
    if (!cache) cache = (await getPref('paper', {})) || {};
    return cache;
}
const mmOf = (v) => (v && typeof v === 'object' ? Number(v.mm) : Number(v)) || 0;

/** mm of one setting key ('*', 'role:invoice', 'role:bill', 'role:kot:<id>'); 0 = not set (uses the default) */
export const paperOf = (map, key) => mmOf(map?.[key]);

/** mm a receipt type actually prints at on this device */
export const paperUsed = (map, key) => paperOf(map, key) || paperOf(map, '*') || 80;

/** mm = 0 / null removes it (back to the default). kitchenName: the server also matches the KOT by name. */
export async function setPaper(key, mm, kitchenName = null) {
    const m = { ...(await getPaper()) };
    if (mm) m[key] = kitchenName ? { mm: Number(mm), name: kitchenName } : Number(mm); else delete m[key];
    cache = m;
    await setPref('paper', m);
    return m;
}

/** the X-Paper header, or null when nothing is chosen on this device */
export async function paperHeader() {
    const m = await getPaper();
    const keys = Object.keys(m);
    if (!keys.length) return null;
    const h = { default: paperOf(m, '*') || 80 };
    if (paperOf(m, 'role:invoice')) h.invoice = paperOf(m, 'role:invoice');
    if (paperOf(m, 'role:bill')) h.bill = paperOf(m, 'role:bill');
    if (paperOf(m, 'role:kot')) h.kot = paperOf(m, 'role:kot');
    for (const k of keys) {
        const id = /^role:kot:(.+)$/.exec(k)?.[1];
        if (!id || !paperOf(m, k)) continue;
        (h.kot_id = h.kot_id || {})[id] = paperOf(m, k);
        if (m[k]?.name) (h.kot_name = h.kot_name || {})[m[k].name] = paperOf(m, k);
    }
    return JSON.stringify(h);
}