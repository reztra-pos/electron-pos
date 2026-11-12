/**
 * Languages (offline, fake server): the whole app in English, Hindi and Arabic on phone and tablet —
 * login, menu, order, payment, running orders, sales, pre-orders, settings — and Arabic switches to right-to-left.
 */
import React from 'react';
import { DevSettings, I18nManager } from 'react-native';
import { render, fireEvent, waitFor, screen, act } from '@testing-library/react-native';
import App from '../src/App';
import { saveDevice, setPref } from '../src/lib/storage';
import HI from '../src/lib/lang/hi';
import AR from '../src/lib/lang/ar';

const tap = (q) => fireEvent.press(q);
jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => { });
jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => { });
try { jest.spyOn(DevSettings, 'reload').mockImplementation(() => { }); } catch { /* not in this RN */ }
const BOOT = {
    settings: { outlet: { name: 'Main', place_order: true, quick_invoice: true, draft: true }, currency_symbol: 'SAR', precision: 2, default_customer_id: 1, default_order_type: 2 },
    categories: [{ id: 1, name: 'Drinks', secondary_name: 'مشروبات' }],
    items: [{ id: 2, name: 'Pepsi', secondary_name: 'بيبسي', category_id: 1, prices: { dine_in: 5, take_away: 5, delivery: 6, partners: {} } }],
    waiters: [{ id: 1, name: 'Admin' }], default_customer: { id: 1, name: 'Walk-in Customer' },
    payment_methods: [{ id: 1, name: 'Cash' }, { id: 2, name: 'Card' }], register: { open: true }, kitchens: [{ id: 1, name: 'Main Kitchen', printer: null }],
};
const TOTALS = { sub_total: 10, total_vat: 1.5, total_payable: 11.5, total_discount_amount: 0, charge_amount: 0 };
function fakeServer() {
    global.fetch = jest.fn(async (url, opts = {}) => {
        const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
        const m = opts.method || 'GET';
        let data = [];
        if (path === '/v1/auth/login') data = { token: 'tok', user: { id: 1, name: 'Admin', role: 'Admin' }, permissions: { all: [], pos: { pos_17: true } } };
        else if (path === '/v1/pos/bootstrap') data = BOOT;
        else if (path === '/v1/ping') data = { ok: true };
        else if (path === '/v1/orders/calculate') data = { totals: TOTALS, items: [{ line_total: 10 }] };
        else if (path === '/v1/orders/self') data = { self_orders: [], online_orders: [] };
        else if (path === '/v1/register/summary' || path === '/v1/register') data = { open: true, totals: {}, methods: [] };
        else if (m !== 'GET') data = {};
        return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, data }) };
    });
}

async function boot(lang) {
    fakeServer();
    await saveDevice({ url: 'http://pos.test', device_id: 'D1', device_token: 'dt', device_name: 'Tab 1', outlet_name: 'Main' });
    await setPref('lang', lang);
    render(<App />);
    const T = lang === 'hi' ? HI : lang === 'ar' ? AR : {};
    const t = (k) => T[k] || k;
    await screen.findByText(t('Enter your PIN'), {}, { timeout: 10000 });
    for (const d of '1111') tap(screen.getByLabelText(d));
    await screen.findByText(t('Search items or code').slice(0, 0) || 'Pepsi', {}, { timeout: 10000 }).catch(() => null);
    return t;
}

for (const lang of ['en', 'hi', 'ar']) {
    test(`${lang}: every main screen opens in this language`, async () => {
        const t = await boot(lang);
        // Arabic: the Arabic item name first
        await screen.findByText(lang === 'ar' ? 'بيبسي' : 'Pepsi', {}, { timeout: 10000 });
        expect(I18nManager.forceRTL).toHaveBeenLastCalledWith(lang === 'ar');

        // order + payment
        tap(screen.getAllByLabelText(lang === 'ar' ? 'Pepsi' : 'Pepsi')[0]);
        if (screen.queryByText(t('View order'))) tap(screen.getByText(t('View order')));
        await waitFor(() => expect(screen.getByLabelText(t('Pay now')).props.accessibilityState?.disabled).toBeFalsy(), { timeout: 10000 });
        expect(screen.getAllByText(t('VAT')).length).toBeGreaterThan(0);
        tap(screen.getByLabelText(t('Pay now')));
        await screen.findByText(t('Amount due'), {}, { timeout: 10000 });
        expect(screen.getAllByText(t('Payment')).length).toBeGreaterThan(0);
        tap(screen.getAllByLabelText(t('Close'))[0]);
        if (screen.queryAllByLabelText(t('Close')).length) tap(screen.getAllByLabelText(t('Close'))[0]);

        // other screens
        for (const [nav, title] of [['Running', 'Running orders'], ['Sales', 'Recent sales'], ['Tables', null]]) {
            tap(screen.getAllByLabelText(t(nav))[0]);
            if (title) await screen.findByText(t(title), {}, { timeout: 10000 });
        }
        // self / online orders and notifications are screens (not popups)
        tap(screen.getAllByLabelText(t('Order'))[0]);
        tap(screen.getAllByLabelText(t('Self / Online orders'))[0]);
        await screen.findByText(t('Self orders ({v1})').replace('{v1}', '0'), {}, { timeout: 10000 });
        expect(screen.getByText(t('No new orders.'))).toBeTruthy();
        tap(screen.getAllByLabelText(t('Order'))[0]);
        tap(screen.getAllByLabelText(t('Notifications'))[0]);
        await screen.findByText(t("You're all caught up."), {}, { timeout: 10000 });
        tap(screen.getAllByLabelText(t('Settings'))[0]);
        await screen.findByText(t('Language'), {}, { timeout: 10000 });
        expect(screen.getByText(t('Printers'))).toBeTruthy();
        expect(screen.getByText(t('Default printer of this device'))).toBeTruthy();
        expect(screen.getByText(`${t('KOT · {name}').replace('{name}', 'Main Kitchen')}`)).toBeTruthy();
        if (lang !== 'en') expect(screen.queryByText('Printers')).toBeNull();          // no English left on this screen header

        // pre-orders form (date / time pickers)
        tap(screen.queryAllByLabelText(t('Pre-orders'))[0] || screen.getAllByText(t('Pre-orders'))[0]);
        tap(await screen.findByLabelText(t('Add pre-order'), {}, { timeout: 10000 }));
        await screen.findByText(t('Delivery date'), {}, { timeout: 5000 });
        tap(screen.getAllByLabelText(t('Delivery date'))[0]);
        await screen.findByText(t('Tomorrow'), {}, { timeout: 5000 });
        await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    });
}

test('switching to Arabic turns the app right-to-left, back to English left-to-right', async () => {
    const t = await boot('en');
    await screen.findByText('Pepsi', {}, { timeout: 10000 });
    tap(screen.getAllByLabelText('Settings')[0]);
    await screen.findByText('Language', {}, { timeout: 10000 });
    I18nManager.forceRTL.mockClear();
    tap(screen.getByText('العربية'));
    await screen.findByText(AR['Language'], {}, { timeout: 5000 });          // texts change at once
    expect(I18nManager.forceRTL).toHaveBeenLastCalledWith(true);
    tap(screen.getByText('English'));
    await screen.findByText('Language', {}, { timeout: 5000 });
    expect(I18nManager.forceRTL).toHaveBeenLastCalledWith(false);
    tap(screen.getByText('हिन्दी'));
    await screen.findByText(HI['Language'], {}, { timeout: 5000 });
    expect(t('x')).toBe('x');
});