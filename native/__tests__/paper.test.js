// Paper size (58 / 80 mm) per receipt type, saved only on this device and sent to the server in "X-Paper".
import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import App from '../src/App';
import { saveDevice } from '../src/lib/storage';

const tap = (q) => fireEvent.press(q);
const BOOT = {
    settings: { outlet: { name: 'Main' }, currency_symbol: 'SAR', precision: 2, default_customer_id: 1, default_order_type: 2 },
    categories: [{ id: 1, name: 'Drinks' }], items: [{ id: 2, name: 'Pepsi', category_id: 1, prices: { dine_in: 5, take_away: 5, delivery: 6 } }],
    waiters: [{ id: 1, name: 'Admin' }], default_customer: { id: 1, name: 'Walk-in Customer' }, payment_methods: [{ id: 1, name: 'Cash' }], register: { open: true },
    kitchens: [{ id: 3, name: 'Grill' }, { id: 4, name: 'Bar' }],
};
const calls = [];
beforeAll(() => {
    global.fetch = jest.fn(async (url, o = {}) => {
        const p = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
        calls.push({ p, headers: o.headers || {} });
        let d = [];
        if (p === '/v1/auth/login') d = { token: 'x', user: { id: 1, name: 'Admin', role: 'Admin' }, permissions: { all: [] } };
        else if (p === '/v1/pos/bootstrap') d = BOOT;
        else if (p === '/v1/orders/self') d = { self_orders: [], online_orders: [] };
        else if ((o.method || 'GET') !== 'GET') d = {};
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ success: true, data: d }) };
    });
});
const lastPaper = () => { const h = calls[calls.length - 1].headers['X-Paper']; return h ? JSON.parse(h) : null; };
async function login() {
    await screen.findByText('Enter your PIN', {}, { timeout: 10000 });
    for (const d of '1111') tap(screen.getByLabelText(d));
    await screen.findAllByLabelText('Pepsi', {}, { timeout: 10000 });
}
async function choose(rowTitle, paperLabel) {
    tap(await screen.findByLabelText(rowTitle));
    tap((await screen.findAllByText(paperLabel)).slice(-1)[0]);
    tap(screen.getByText('Save'));
    await screen.findByText('Printer saved');
}

test('80 mm and no header until a size is chosen; then per receipt type, kept after log out', async () => {
    await saveDevice({ url: 'http://pos.test', device_id: 'D1', device_token: 't', device_name: 'Tab', outlet_name: 'Main' });
    render(<App />);
    await login();
    expect(calls.every((c) => !c.headers['X-Paper'])).toBe(true);     // nothing chosen: server prints 80 mm as before

    tap(screen.getAllByLabelText('Settings')[0]);
    await screen.findByText('Printers');
    expect(screen.getAllByText('80 mm').length).toBe(5);               // default, invoice, bill, 2 kitchens

    await choose('Invoice', '58 mm');
    await choose('KOT · Grill', '58 mm');
    await choose('Default printer of this device', '58 mm');
    await choose('KOT · Bar', '80 mm');
    expect(screen.getAllByText('58 mm').length).toBe(4);               // default, invoice, bill (default), Grill
    expect(screen.getAllByText('80 mm').length).toBe(1);               // Bar

    tap(screen.getAllByLabelText('Log out')[0]);
    if (await screen.findByLabelText('Log out without closing', {}, { timeout: 1500 }).catch(() => null)) tap(screen.getByLabelText('Log out without closing'));
    await login();
    expect(lastPaper()).toEqual({ default: 58, invoice: 58, kot_id: { 3: 58, 4: 80 }, kot_name: { Grill: 58, Bar: 80 } });

    // back to "Default" for the invoice
    tap(screen.getAllByLabelText('Settings')[0]);
    await screen.findByText('Printers');
    await choose('Invoice', 'Default (58 mm)');
    const { paperHeader } = require('../src/lib/paper');
    expect(JSON.parse(await paperHeader())).toEqual({ default: 58, kot_id: { 3: 58, 4: 80 }, kot_name: { Grill: 58, Bar: 80 } });
    expect(screen.getAllByText('58 mm').length).toBe(4);               // invoice now follows the default (58)
    screen.unmount();
});