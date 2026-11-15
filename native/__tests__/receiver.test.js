// tbl_users.order_receiving_id: a user whose orders go to a cashier can place orders, bill and KOT,
// but can't invoice (Pay now / Pay a running order / deliver a pre-order) or make credit notes.
import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import App from '../src/App';
import { saveDevice } from '../src/lib/storage';

const tap = (q) => fireEvent.press(q);
let USER = null;
const BOOT = {
    settings: { outlet: { name: 'Main' }, currency_symbol: 'SAR', precision: 2, default_customer_id: 1, default_order_type: 2 },
    categories: [{ id: 1, name: 'Drinks' }], items: [{ id: 2, name: 'Pepsi', category_id: 1, prices: { dine_in: 5, take_away: 5, delivery: 6 } }],
    waiters: [{ id: 1, name: 'Admin' }], default_customer: { id: 1, name: 'Walk-in Customer' }, payment_methods: [{ id: 1, name: 'Cash' }], register: { open: true }, kitchens: [],
};
const RUNNING = [{ id: 9, sale_no: 'S9', order_number: 'A9', order_type: 2, order_type_name: 'Take Away', total_payable: 5, minutes_open: 3 }];
const SALES = [{ id: 7, sale_no: 'INV-7', total_payable: 5, date_time: '2026-11-15 10:00', customer: { name: 'Walk-in Customer' } }];
beforeAll(() => {
    global.fetch = jest.fn(async (url, o = {}) => {
        const p = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
        let d = [];
        if (p === '/v1/auth/login') d = USER;
        else if (p === '/v1/pos/bootstrap') d = BOOT;
        else if (p === '/v1/orders/self') d = { self_orders: [], online_orders: [] };
        else if (p === '/v1/orders' && (o.method || 'GET') === 'GET') d = RUNNING;
        else if (p === '/v1/invoices') d = SALES;
        else if (p === '/v1/orders/calculate') d = { total_payable: 5, sub_total: 5 };
        else if ((o.method || 'GET') !== 'GET') d = {};
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ success: true, data: d }) };
    });
});
async function login() {
    await screen.findByText('Enter your PIN', {}, { timeout: 10000 });
    for (const d of '1111') tap(screen.getByLabelText(d));
    await screen.findAllByLabelText('Pepsi', {}, { timeout: 10000 });
}
const go = (label) => tap(screen.getAllByLabelText(label)[0]);
async function check(canInvoice) {
    render(<App />);
    await login();
    tap(screen.getAllByLabelText('Pepsi')[0]);
    const phone = await screen.findByText('View order', {}, { timeout: 800 }).catch(() => null);
    if (phone) tap(phone);
    await screen.findAllByText('Place order');
    if (canInvoice) await screen.findByText('Pay now'); else expect(screen.queryByText('Pay now')).toBeNull();
    if (phone) tap(screen.getByLabelText('Close'));
    go('Running');
    await screen.findByText('#A9');
    expect(screen.getAllByText('Bill').length).toBeGreaterThan(0);
    expect(!!screen.queryByText('Pay')).toBe(canInvoice);
    go('Sales');
    await screen.findByText('INV-7');
    expect(!!screen.queryByText('Refund')).toBe(canInvoice);
    screen.unmount();
}

beforeEach(() => saveDevice({ url: 'http://pos.test', device_id: 'D1', device_token: 't', device_name: 'Tab', outlet_name: 'Main' }));

test('cashier with an order receiving user: no invoice, no credit note', async () => {
    USER = { token: 'x', user: { id: 3, name: 'Ali', role: 'Cashier', order_receiving_id: 5 }, permissions: { all: ['refund-123'], pos: { pos_1: true } } };
    await check(false);
});

test('same cashier without an order receiving user: invoice and credit note as before', async () => {
    USER = { token: 'x', user: { id: 3, name: 'Ali', role: 'Cashier', order_receiving_id: 0 }, permissions: { all: ['refund-123'], pos: { pos_1: true } } };
    await check(true);
});

test('Admin is never limited', async () => {
    USER = { token: 'x', user: { id: 1, name: 'Admin', role: 'Admin', order_receiving_id: 5 }, permissions: { all: [] } };
    await check(true);
});

test('Modify a running order opens the Order screen', async () => {
    USER = { token: 'x', user: { id: 1, name: 'Admin', role: 'Admin' }, permissions: { all: [] } };
    const prev = global.fetch;
    global.fetch = jest.fn(async (url, o) => {
        const p = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
        if (p === '/v1/orders/9') {
            const d = {
                id: 9, sale_no: 'S9', order_number: 'A9', order_type: 2, order_type_name: 'Take Away', can_modify: true, customer: { id: 1, name: 'Walk-in Customer' },
                totals: { sub_total: 5, total_payable: 5, discount: '0', charge: '0' },
                items: [{ line_id: 1, food_menu_id: 2, name: 'Pepsi', qty: 1, unit_price: 5, total: 5, modifiers: [] }]
            };
            return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ success: true, data: d }) };
        }
        return prev(url, o);
    });
    render(<App />);
    await login();
    go('Running');
    tap(await screen.findByText('#A9'));
    tap(await screen.findByText('Modify'));
    await screen.findAllByLabelText('Pepsi');                 // the menu (Order screen) is back
    expect(screen.queryByText('No running orders')).toBeNull();
    expect(screen.queryByText('#A9')).toBeNull();
    screen.unmount();
    global.fetch = prev;
});

async function payRunning(printInvoice) {
    USER = { token: 'x', user: { id: 1, name: 'Admin', role: 'Admin' }, permissions: { all: [] } };
    const { setPref } = require('../src/lib/storage');
    await setPref('prefs', { printKot: true, printInvoice });
    const prev = global.fetch;
    global.fetch = jest.fn(async (url, o) => {
        const p = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
        let d = null;
        if (p === '/v1/orders/9') d = {
            id: 9, sale_no: 'S9', order_number: 'A9', order_type: 2, order_type_name: 'Take Away', can_modify: true, customer: { id: 1, name: 'Walk-in Customer' },
            totals: { sub_total: 5, total_vat: 0, total_payable: 5, discount: '0', charge: '0' }, items: [{ line_id: 1, food_menu_id: 2, name: 'Pepsi', qty: 1, unit_price: 5, line_total: 5, modifiers: [] }]
        };
        else if (p === '/v1/orders/9/invoice') d = { id: 70, sale_no: 'INV-70', totals: { total_payable: 5, change_amount: 0 }, zatca: { synced: true }, print_job: null };
        if (!d) return prev(url, o);
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ success: true, data: d }) };
    });
    render(<App />);
    await login();
    go('Running');
    tap(await screen.findByText('#A9'));
    tap((await screen.findAllByText('Pay')).slice(-1)[0]);
    tap(await screen.findByText('Complete & print'));
    return () => { screen.unmount(); global.fetch = prev; };
}

test('"Print the invoice after payment" on: no popup, back to the Order screen', async () => {
    const done = await payRunning(true);
    await screen.findAllByLabelText('Pepsi');
    expect(screen.queryByText('Payment received')).toBeNull();
    expect(screen.queryByText('#A9')).toBeNull();
    await screen.findByText('Invoice INV-70 · printing');
    done();
});

for (const btn of ['New order', 'Print invoice']) {
    test(`"Print the invoice after payment" off: the Payment received popup; "${btn}" goes back to the Order screen`, async () => {
        const done = await payRunning(false);
        await screen.findByText('Payment received');
        tap(screen.getByText(btn));
        await waitFor(() => expect(screen.queryByText('Payment received')).toBeNull());
        await screen.findAllByLabelText('Pepsi');
        expect(screen.queryByText('#A9')).toBeNull();
        expect(screen.queryByText('View order') ? screen.queryByText('Editing order') : null).toBeNull();
        done();
    });
}

test('phone / tablet: Pay now from the cart, popup off -> "New order" closes the cart popup too', async () => {
    USER = { token: 'x', user: { id: 1, name: 'Admin', role: 'Admin' }, permissions: { all: [] } };
    const { setPref } = require('../src/lib/storage');
    await setPref('prefs', { printKot: true, printInvoice: false });
    const prev = global.fetch;
    global.fetch = jest.fn(async (url, o) => {
        const p = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
        let d = null;
        if (p === '/v1/orders/calculate') d = { totals: { sub_total: 5, total_vat: 0, total_payable: 5 } };
        else if (p === '/v1/invoices/quick') d = { invoice: { id: 71, sale_no: 'INV-71', totals: { total_payable: 5 }, zatca: { synced: true }, print_job: null } };
        if (!d) return prev(url, o);
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ success: true, data: d }) };
    });
    render(<App />);
    await login();
    tap(screen.getAllByLabelText('Pepsi')[0]);
    const phone = await screen.findByText('View order', {}, { timeout: 800 }).catch(() => null);
    if (phone) tap(phone);
    await screen.findByText('Pay now');
    // the cart total is calculated first (Pay now waits for it)
    await waitFor(() => { if (!screen.queryByText('Complete & print')) tap(screen.getByText('Pay now')); expect(screen.getByText('Complete & print')).toBeTruthy(); }, { timeout: 6000 });
    tap(await screen.findByText('Complete & print'));
    await screen.findByText('Payment received');
    tap(screen.getAllByText('New order').slice(-1)[0]);
    await waitFor(() => expect(screen.queryByText('Payment received')).toBeNull());
    if (phone) expect(screen.queryByText('Place order')).toBeNull();          // phone: the cart ("Order") popup is closed too
    screen.unmount(); global.fetch = prev;
});