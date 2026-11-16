// Change an item's price in the cart; modifier prices can be changed too, and 0 is accepted.
import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import App from '../src/App';
import { saveDevice } from '../src/lib/storage';

const tap = (q) => fireEvent.press(q);
const BOOT = {
    settings: { outlet: { name: 'Main' }, currency_symbol: 'SAR', precision: 2, default_customer_id: 1, default_order_type: 2 },
    categories: [{ id: 1, name: 'Food' }],
    items: [
        { id: 2, name: 'Pepsi', category_id: 1, prices: { dine_in: 5, take_away: 5, delivery: 6 } },
        {
            id: 3, name: 'Burger', category_id: 1, prices: { dine_in: 20, take_away: 20, delivery: 22 },
            modifiers: [{ id: 7, name: 'Cheese', price: 2 }, { id: 8, name: 'Extra sauce', price: 0, open_price: true }]
        },
    ],
    waiters: [{ id: 1, name: 'Admin' }], default_customer: { id: 1, name: 'Walk-in Customer' }, payment_methods: [{ id: 1, name: 'Cash' }], register: { open: true }, kitchens: [],
};
let placed = null;
beforeAll(() => {
    global.fetch = jest.fn(async (url, o = {}) => {
        const p = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
        const m = o.method || 'GET';
        let d = [];
        if (p === '/v1/auth/login') d = { token: 'x', user: { id: 1, name: 'Admin', role: 'Admin' }, permissions: { all: [] } };
        else if (p === '/v1/pos/bootstrap') d = BOOT;
        else if (p === '/v1/orders/self') d = { self_orders: [], online_orders: [] };
        else if (p === '/v1/orders' && m === 'POST') { placed = JSON.parse(o.body); d = { id: 50, sale_no: 'S50', order_number: 'A50', print_jobs: [] }; }
        else if (m !== 'GET') d = {};
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ success: true, data: d }) };
    });
});
async function login() {
    await screen.findByText('Enter your PIN', {}, { timeout: 10000 });
    for (const d of '1111') tap(screen.getByLabelText(d));
    await screen.findAllByLabelText('Pepsi', {}, { timeout: 10000 });
}
const type = (label, v) => fireEvent.changeText(screen.getByLabelText(label), v);

test('price of a cart line and of modifiers can be changed; modifier price 0 is accepted', async () => {
    await saveDevice({ url: 'http://pos.test', device_id: 'D1', device_token: 't', device_name: 'Tab', outlet_name: 'Main' });
    render(<App />);
    await login();

    // Burger: options sheet. Price 20 -> 18, Cheese 2 -> 0, open-price Extra sauce left empty (= 0)
    tap(screen.getAllByLabelText('Burger')[0]);
    await screen.findByLabelText('Item price');
    type('Item price', '18');
    await screen.findByText('Changed from the menu price 20.00');
    tap(screen.getByText(/Cheese/));
    tap(screen.getByText(/Extra sauce/));
    type('Price of Cheese', '0');
    const add = screen.getByText(/Add to order/);
    expect(add.props.children).toContain('18.00');
    tap(add);

    // Pepsi: added straight to the cart; open the line and change 5 -> 4
    tap(screen.getAllByLabelText('Pepsi')[0]);
    const phone = await screen.findByText('View order', {}, { timeout: 800 }).catch(() => null);
    if (phone) tap(phone);
    tap((await screen.findAllByText('Pepsi')).slice(-1)[0]);
    await screen.findByLabelText('Item price');
    type('Item price', '4');
    tap(screen.getByText(/Update item/));
    await waitFor(() => expect(screen.getAllByText('PRICE CHANGED').length).toBe(2));

    tap(screen.getAllByText('Place order').slice(-1)[0]);
    await waitFor(() => expect(placed).not.toBeNull());
    const burger = placed.items.find((i) => i.food_menu_id === 3);
    const pepsi = placed.items.find((i) => i.food_menu_id === 2);
    expect(burger.custom_price).toBe(18);
    expect(burger.modifier_ids).toEqual([{ id: 7, price: 0 }, { id: 8, price: 0 }]);
    expect(pepsi.custom_price).toBe(4);
    screen.unmount();
});

test('menu price unchanged: no custom price, modifiers sent as before', async () => {
    placed = null;
    render(<App />);
    await login();
    tap(screen.getAllByLabelText('Burger')[0]);
    await screen.findByLabelText('Item price');
    tap(screen.getByText(/Cheese/));
    tap(screen.getByText(/Add to order/));
    const phone = await screen.findByText('View order', {}, { timeout: 800 }).catch(() => null);
    if (phone) tap(phone);
    tap((await screen.findAllByText('Place order')).slice(-1)[0]);
    await waitFor(() => expect(placed).not.toBeNull());
    expect(placed.items[0].custom_price).toBeUndefined();
    expect(placed.items[0].modifier_ids).toEqual([7]);
    screen.unmount();
});