// A 9" tablet held upright (800 x 1280): portrait layout, nothing wider than the screen.
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import App from '../src/App';
import { saveDevice } from '../src/lib/storage';

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

const tooWide = () => screen.UNSAFE_root.findAll((n) => typeof n.type === 'string' && [].concat(n.props.style || []).some((s) => s && (Number(s.width) > 800 || Number(s.minWidth) > 800)));

test('upright 9" tablet: login is the single PIN card, POS uses the portrait layout with a wider menu grid', async () => {
    if (process.env.REZTRA_TEST_SCREEN !== 'portrait') return;
    await saveDevice({ url: 'http://pos.test', device_id: 'D1', device_token: 't', device_name: 'Tab', outlet_name: 'Main' });
    render(<App />);
    await screen.findByText('Enter your PIN', {}, { timeout: 10000 });
    expect(screen.queryByText(/Welcome to/)).toBeNull();          // the side-by-side welcome text (940dp wide) is not used
    expect(tooWide()).toEqual([]);
    for (const d of '1111') tap(screen.getByLabelText(d));
    await screen.findAllByLabelText('Pepsi', {}, { timeout: 10000 });
    tap(screen.getAllByLabelText('Pepsi')[0]);
    await screen.findByText('View order');                       // portrait: order opens from the bottom bar
    const grid = screen.UNSAFE_root.findAll((n) => n.props?.numColumns != null)[0];
    expect(grid.props.numColumns).toBe(4);                       // (800 - 24) / 180 -> 4 columns, not 2 huge ones
    expect(tooWide()).toEqual([]);
    screen.unmount();
});