// Menu style (pictures / names only): switches at once and is remembered on this device after log out and restart.
import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import App from '../src/App';
import { getPref, saveDevice } from '../src/lib/storage';

const tap = (q) => fireEvent.press(q);
const BOOT = {
    settings: { outlet: { name: 'Main' }, currency_symbol: 'SAR', precision: 2, default_customer_id: 1, default_order_type: 2 },
    categories: [{ id: 1, name: 'Drinks' }], items: [{ id: 2, name: 'Pepsi', category_id: 1, prices: { dine_in: 5, take_away: 5, delivery: 6 } }],
    waiters: [{ id: 1, name: 'Admin' }], default_customer: { id: 1, name: 'Walk-in Customer' }, payment_methods: [{ id: 1, name: 'Cash' }], register: { open: true }, kitchens: [],
};
beforeAll(() => {
    global.fetch = jest.fn(async (url, o = {}) => {
        const p = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
        let d = [];
        if (p === '/v1/auth/login') d = { token: 'x', user: { id: 1, name: 'Admin', role: 'Admin' }, permissions: { all: [] } };
        else if (p === '/v1/pos/bootstrap') d = BOOT;
        else if (p === '/v1/orders/self') d = { self_orders: [], online_orders: [] };
        else if ((o.method || 'GET') !== 'GET') d = {};
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ success: true, data: d }) };
    });
});
const selected = (label) => !!screen.getByLabelText(label).props.accessibilityState?.selected;
async function login() {
    await screen.findByText('Enter your PIN', {}, { timeout: 10000 });
    for (const d of '1111') tap(screen.getByLabelText(d));
    await screen.findAllByLabelText('Pepsi', {}, { timeout: 10000 });
}

test('pictures by default; "Names only" is kept after log out and after the app restarts', async () => {
    await saveDevice({ url: 'http://pos.test', device_id: 'D1', device_token: 't', device_name: 'Tab', outlet_name: 'Main' });
    render(<App />);
    await login();
    expect(selected('Show item pictures')).toBe(true);
    tap(screen.getByLabelText('Names only'));
    expect(selected('Names only')).toBe(true);
    await waitFor(async () => expect(await getPref('menuView')).toBe('text'));

    // log out -> log in again
    tap(screen.getAllByLabelText('Settings')[0]);
    tap(await screen.findByLabelText('Log out'));
    if (await screen.findByLabelText('Log out without closing', {}, { timeout: 1500 }).catch(() => null)) tap(screen.getByLabelText('Log out without closing'));
    await login();
    await waitFor(() => expect(selected('Names only')).toBe(true));
    screen.unmount();

    // app restart
    render(<App />);
    await login();
    await waitFor(() => expect(selected('Names only')).toBe(true));
    tap(screen.getByLabelText('Show item pictures'));
    await waitFor(async () => expect(await getPref('menuView')).toBe('images'));
});