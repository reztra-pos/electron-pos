// Menu, settings and lists from GET /v1/pos/bootstrap (+ GET /v1/customers), shaped like the desktop app does it
// (src/pages/PosMain.jsx applyCatalog). Kept in one module-level object: loaded once after login.
import {
    Sandwich, Pizza, Drumstick, Beef, CupSoda, Coffee, Croissant, Soup, Salad, IceCreamCone, Fish, EggFried, UtensilsCrossed, Cookie,
} from 'lucide-react-native';

export const C = {
    kitchens: [],
    settings: {}, outlet: {}, categories: [], items: [], byId: {}, waiters: [], customers: [], defaultCustomerId: 1,
    partners: [], paymentMethods: [], denominations: [], registerOpen: null,
};

// tile colours for categories / items (bg, fg) — same palette as the design boards
const TINTS = [['#FFE8D6', '#C2410C'], ['#FFE4E4', '#B91C1C'], ['#FFF1CC', '#A16207'], ['#E6F4EA', '#15803D'], ['#E8F0FF', '#1D4ED8'],
['#FDE7F3', '#BE185D'], ['#E0F2FE', '#0369A1'], ['#F3E8FF', '#7E22CE'], ['#F5EBDD', '#92400E']];
const ART = [[/pizza/i, Pizza], [/broast|chicken|wing|drum/i, Drumstick], [/burger|beef|meat|kabab|kebab|grill/i, Beef], [/sandwich|shawarma|wrap|roll/i, Sandwich],
[/juice|soda|drink|bev|pepsi|cola|water/i, CupSoda], [/tea|coffee|karak|latte/i, Coffee], [/bakery|bread|croissant/i, Croissant], [/mandi|rice|soup|biryani/i, Soup],
[/salad|veg/i, Salad], [/dessert|ice|sweet|kunafa|cake/i, IceCreamCone], [/fish|sea|shrimp/i, Fish], [/egg|breakfast/i, EggFried], [/cookie|snack/i, Cookie]];
export const artFor = (name) => (ART.find(([re]) => re.test(name || '')) || [null, UtensilsCrossed])[1];
const isLoyalty = (m) => !!m?.is_loyalty || /loyal/i.test(m?.name || '');
const plain = (html) => String(html || '').split(/<br\s*\/?>/i)[0].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function applyCatalog(boot, customers = []) {
    const S = boot.settings || {};
    C.settings = S;
    // kitchens of the outlet (KOT printers): { id, name, printer: { id, title, type, ip_address, port } | null }
    C.kitchens = (boot.kitchens || []).map((k) => ({ id: k.id, name: k.name, printer: k.printer || null }));
    C.outlet = {
        name: S.outlet?.name || '', precision: Number(S.precision ?? 2),
        currency: S.currency_symbol || S.currency || '', curAfter: S.currency_position === 'After Amount',
        btnPlace: S.outlet?.place_order !== false, btnQuick: S.outlet?.quick_invoice !== false, btnDraft: S.outlet?.draft !== false,
        printPopup: !!S.outlet?.printing_popup, noTableAsk: !!S.outlet?.dine_in_without_table,
    };
    C.categories = (boot.categories || []).map((c, i) => ({ id: c.id, name: c.name, name2: c.secondary_name || '', tint: TINTS[i % TINTS.length], art: artFor(c.name) }));
    const catTint = Object.fromEntries(C.categories.map((c) => [c.id, c]));
    const mapItem = (it, parent = null) => ({
        id: it.id, code: it.code || String(it.id),
        name: parent ? `${parent.name} ${it.name}` : it.name, shortName: it.name,
        name2: parent ? [parent.name2, it.secondary_name].filter(Boolean).join(' ') : it.secondary_name || '',
        cat: it.category_id,
        prices: it.prices || { dine_in: 0, take_away: 0, delivery: 0, partners: {} },
        openPrice: !!it.open_price,
        modifiers: (it.modifiers || []).map((m) => ({ id: m.id, name: m.name, price: Number(m.price) || 0, openPrice: !!m.open_price })),
        promotion: it.promotion ? { ...it.promotion, text: plain(it.promotion.text) } : null,
        combo: !!it.combo, comboGroups: it.combo?.type === 2 ? it.combo.groups || [] : null,
        image: it.image_url || null, unavailable: !!it.unavailable,
        tint: catTint[it.category_id]?.tint || TINTS[0],
        art: artFor(`${it.name} ${catTint[it.category_id]?.name || ''}`),
        parentId: parent?.id || null, variations: [],
    });
    C.items = []; C.byId = {};
    (boot.items || []).forEach((it) => {
        const item = mapItem(it);
        item.variations = (it.variations || []).map((v) => mapItem(v, item));
        C.items.push(item);
        C.byId[item.id] = item;
        item.variations.forEach((v) => { C.byId[v.id] = v; });
    });
    C.waiters = (boot.waiters || []).map((w) => ({ id: w.id, name: w.name }));
    const dc = boot.default_customer;
    C.defaultCustomerId = dc?.id || Number(S.default_customer_id) || 1;
    const list = (Array.isArray(customers) ? customers : []).map((c) => ({ id: c.id, name: c.name, phone: c.phone || '' }));
    if (dc && !list.some((c) => c.id === dc.id)) list.unshift({ id: dc.id, name: dc.name, phone: dc.phone || '' });
    C.customers = list.sort((a, b) => (a.id === C.defaultCustomerId ? -1 : b.id === C.defaultCustomerId ? 1 : 0));
    C.partners = (boot.delivery_partners || []).map((p) => ({ id: p.id, name: p.name }));
    C.paymentMethods = (boot.payment_methods || []).filter((m) => !isLoyalty(m))
        .map((m) => ({ id: m.id, name: m.name, cash: m.id === 1 || /cash/i.test(m.name), kind: /card|visa|master|mada/i.test(m.name) ? 'card' : /cash/i.test(m.name) ? 'cash' : 'other' }));
    C.registerOpen = boot.register ? !!boot.register.open : null;
    C.denominations = (boot.denominations || []).map((d) => Number(d.amount)).filter((v) => v > 0);
}

export const ORDER_TYPES = { dine: { label: 'Dine In', id: 1 }, take: { label: 'Take Away', id: 2 }, delivery: { label: 'Delivery', id: 3 } };
export const TYPE_KEY = { 1: 'dine', 2: 'take', 3: 'delivery' };
export const defaultTypeKey = () => TYPE_KEY[Number(C.settings.default_order_type)] || null;
export const isLoyaltyMethod = isLoyalty;

/** list price of an item for an order type / delivery partner (same rule as the server) */
export function priceFor(item, type, partnerId) {
    if (!item) return 0;
    const p = item.prices;
    if (type === 'delivery') return Number((partnerId && p.partners?.[partnerId]) || p.delivery) || 0;
    if (type === 'take') return Number(p.take_away) || 0;
    return Number(p.dine_in) || 0;
}
export function comboExtra(item, selections, type) {
    if (!item?.comboGroups) return 0;
    const key = type === 'delivery' ? 'delivery' : type === 'take' ? 'take_away' : 'dine_in';
    return item.comboGroups.reduce((sum, g) => {
        const opt = g.options.find((o) => selections?.includes(o.food_menu_id)) || g.options[0];
        return sum + (Number(opt?.prices?.[key]) || 0);
    }, 0);
}
export const needsOptions = (it) => !!(it && (it.openPrice || it.comboGroups || it.modifiers?.length));
export const isOpenMod = (itemId, modId) => !!C.byId[itemId]?.modifiers.find((x) => x.id === modId)?.openPrice;