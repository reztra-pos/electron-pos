/**
 * End-to-end flow against the POS API bench (real server, real ZATCA-step polling):
 * activation -> PIN login -> open register -> take away quick invoice (printed) -> dine-in place order (KOT) ->
 * pay it from Running orders -> credit note of an invoice -> pre-order: add, prepare, deliver (invoice).
 * Needs REZTRA_TEST_KEY (device key) in the environment.
 */
import React from 'react';
import { render, fireEvent, waitFor, screen, act } from '@testing-library/react-native';
import App from '../src/App';

const KEY = process.env.REZTRA_TEST_KEY;
const PIN = process.env.REZTRA_TEST_PIN || '1111';
const tap = (q) => fireEvent.press(q);
const byLabel = (l) => screen.getAllByLabelText(l)[0];
// phone: the order is in a sheet behind "View order"; tablet: it is always on screen
const openCart = () => {
    const v = screen.queryByText('View order');
    if (process.env.REZTRA_TEST_SCREEN === 'phone') expect(v).toBeTruthy();
    if (process.env.REZTRA_TEST_SCREEN === 'tablet') expect(v).toBeNull();
    if (v) tap(v);
};

(KEY ? test : test.skip)('activation, login, quick invoice, place order, pay running order', async () => {
    global.__clip = KEY;
    render(<App />);
    await screen.findByText('Activate this POS', {}, { timeout: 15000 });
    tap(screen.getByLabelText('Paste'));
    await screen.findByText(/Key (checked with the server|is valid)/, {}, { timeout: 15000 });
    tap(screen.getByLabelText('Activate'));
    await screen.findByText('Enter your PIN', {}, { timeout: 15000 });
    for (const d of PIN) tap(screen.getByLabelText(d));
    await waitFor(() => expect(screen.queryByText('Enter your PIN')).toBeNull(), { timeout: 20000 });

    // register gate
    const open = await screen.findAllByText(/Open register|Search items or code/, {}, { timeout: 20000 }).catch(() => []);
    if (screen.queryByLabelText('Open register')) {
        await waitFor(() => expect(screen.getByLabelText('Open register').props.accessibilityState?.disabled).toBeFalsy(), { timeout: 15000 });
        tap(screen.getByLabelText('Open register'));
        await waitFor(() => expect(screen.queryByLabelText('Open register')).toBeNull(), { timeout: 15000 });
    }
    expect(open).toBeTruthy();

    // ---- take away quick invoice ----
    tap(screen.getAllByText('Take Away')[0]);
    await waitFor(() => screen.getAllByLabelText(process.env.REZTRA_TEST_ITEM || 'Pepsi'), { timeout: 10000 });
    tap(byLabel(process.env.REZTRA_TEST_ITEM || 'Pepsi'));
    tap(byLabel(process.env.REZTRA_TEST_ITEM || 'Pepsi'));
    openCart();

    // ---- B2B customer (TRN + national address for a ZATCA standard invoice) ----
    const b2b = `B2B Test ${Date.now() % 100000}`;
    tap(screen.getAllByText('Walk-in Customer')[0]);
    tap(await screen.findByLabelText('New customer', {}, { timeout: 5000 }));
    await screen.findByText('National address', {}, { timeout: 5000 });
    const type = (label, v) => fireEvent.changeText(screen.getByLabelText(label), v);
    type('Name *', b2b);
    type('TRN (VAT number)', '310123456700003');
    await screen.findByText(/also fill: Postal code, Street, Building no, Secondary no, District, City/);
    type('Building no', '1234'); type('Secondary no', '5678'); type('Street - English', 'King Fahd Rd');
    type('District - English', 'Al Olaya'); type('City - English', 'Riyadh'); type('Postal code', '12211');
    type('Street - Arabic', 'طريق الملك فهد');
    await screen.findByText('Complete for a ZATCA standard (B2B) invoice');
    tap(screen.getByLabelText('Add customer'));
    await screen.findByText(`${b2b} added and selected`, {}, { timeout: 15000 });
    if (screen.queryByText('View order')) tap(screen.getByText('View order'));
    await screen.findByText(`${b2b} · B2B`, {}, { timeout: 5000 });
    global.__b2b = b2b;
    // edit loads the saved national address back
    tap(screen.getByText(`${b2b} · B2B`));
    tap(await screen.findByLabelText(`Edit ${b2b}`, {}, { timeout: 5000 }));
    await waitFor(() => expect(screen.getByLabelText('City - English').props.value).toBe('Riyadh'), { timeout: 15000 });
    expect(screen.getByLabelText('Street - Arabic').props.value).toBe('طريق الملك فهد');
    tap(screen.getByLabelText('Cancel'));
    tap(screen.getAllByLabelText('Close')[0]);
    if (screen.queryByText('View order')) tap(screen.getByText('View order'));
    await waitFor(() => expect(screen.getByLabelText('Pay now').props.accessibilityState?.disabled).toBeFalsy(), { timeout: 15000 });
    tap(screen.getByLabelText('Pay now'));
    await screen.findByText('Amount due', {}, { timeout: 15000 });
    const before = global.__prints.length;
    tap(screen.getByLabelText('Complete & print'));
    await screen.findByText('Payment received', {}, { timeout: 20000 });
    await waitFor(() => expect(global.__prints.length).toBeGreaterThan(before), { timeout: 30000 });
    await screen.findByText(/Reported to ZATCA|Invoice saved|ZATCA:/, {}, { timeout: 30000 });
    global.__invoiceNo = screen.getAllByText(/\d/).map((n) => n.props.children).find((t) => typeof t === 'string' && /^[A-Za-z]*[-\/]?\d+$/.test(t));
    expect(global.__invoiceNo).toBeTruthy();
    tap(screen.getByLabelText('New order'));

    // ---- dine in, place order -> KOT ----
    tap(screen.getAllByText('Dine In')[0]);
    const noTable = await screen.findByLabelText(/Continue without table/, {}, { timeout: 15000 }).catch(() => null);
    if (noTable) tap(noTable);
    tap(byLabel(process.env.REZTRA_TEST_ITEM || 'Pepsi'));
    openCart();
    const kotBefore = global.__prints.length;
    await waitFor(() => expect(screen.getByLabelText('Place order').props.accessibilityState?.disabled).toBeFalsy(), { timeout: 15000 });
    tap(screen.getByLabelText('Place order'));
    // the "placed" toast is replaced right away by the KOT print result
    await waitFor(() => expect(global.__prints.length).toBeGreaterThan(kotBefore), { timeout: 20000 });
    await screen.findByText(/KOT sent to|placed — sent to the kitchen/, {}, { timeout: 20000 });

    // ---- running orders: pay it ----
    tap(screen.getByLabelText('Running'));
    await screen.findByText('Running orders', {}, { timeout: 10000 });
    await waitFor(() => screen.getAllByLabelText('Pay'), { timeout: 20000 });
    tap(screen.getAllByLabelText('Pay')[0]);
    await screen.findByText('Amount due', {}, { timeout: 15000 });
    tap(screen.getByLabelText('Complete & print'));
    await screen.findByText('Payment received', {}, { timeout: 20000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 4000)); });
    tap(screen.getByLabelText('New order'));

    // ---- credit note (refund) of the latest invoice ----
    tap(screen.getByLabelText('Sales'));
    await screen.findByText('Recent sales', {}, { timeout: 10000 });
    await waitFor(() => screen.getAllByLabelText('Refund'), { timeout: 20000 });
    tap(screen.getAllByLabelText('Refund')[0]);
    await screen.findByText('Choose what the customer returns.', {}, { timeout: 15000 });
    tap(screen.getByLabelText('Refund all'));
    await waitFor(() => expect(screen.getByLabelText('Make credit note').props.accessibilityState?.disabled).toBeFalsy(), { timeout: 15000 });
    const cnPrints = global.__prints.length;
    tap(screen.getByLabelText('Make credit note'));
    tap(await screen.findByLabelText(/^Confirm refund/, {}, { timeout: 5000 }));
    await screen.findByLabelText('Print credit note', {}, { timeout: 40000 }).catch((e) => {
        console.log('credit note screen:', screen.queryAllByText(/./).map((n) => n.props.children).filter((t) => typeof t === 'string').join(' | '));
        throw e;
    });
    global.__creditNote = screen.getAllByText(/^Credit note \S+$/).map((n) => n.props.children).join(' ');
    await waitFor(() => expect(global.__prints.length).toBeGreaterThan(cnPrints), { timeout: 20000 });
    tap(screen.getAllByLabelText('Close')[0]);

    // ---- pre-order: add, start preparing, deliver -> invoice ----
    const phone = !!screen.queryByLabelText('More') || process.env.REZTRA_TEST_SCREEN === 'phone';
    if (screen.queryByLabelText('Pre-orders')) tap(screen.getByLabelText('Pre-orders'));
    else {
        tap(screen.getByLabelText('Settings'));
        // printers: Default, Invoice, Bill and a KOT row per kitchen of the outlet
        await screen.findByText('Default printer of this device', {}, { timeout: 5000 });
        expect(screen.getByText('Invoice')).toBeTruthy();
        expect(screen.getAllByText(/^KOT · /).length).toBeGreaterThan(0);
        tap(await screen.findByText('Pre-orders', {}, { timeout: 5000 }));
    }
    await screen.findByLabelText('Add pre-order', {}, { timeout: 10000 });
    tap(screen.getByLabelText('Add pre-order'));
    const item = process.env.REZTRA_TEST_ITEM || 'Pepsi';
    if (screen.queryByLabelText('Add items')) tap(screen.getByLabelText('Add items'));
    tap(await screen.findByLabelText(`Add ${item}`, {}, { timeout: 10000 }));
    tap(screen.getByLabelText(`Add ${item}`));
    if (screen.queryByLabelText('Done')) tap(screen.getByLabelText('Done'));
    await waitFor(() => expect(screen.getByLabelText('Save pre-order').props.accessibilityState?.disabled).toBeFalsy(), { timeout: 15000 });
    tap(screen.getByLabelText('Save pre-order'));
    const saved = await screen.findByText(/^Pre-order \S+ saved$/, {}, { timeout: 20000 });
    const poNo = saved.props.children.replace(/^Pre-order (\S+) saved$/, '$1');
    global.__preOrder = poNo;
    fireEvent.changeText(screen.getByPlaceholderText('Pre-order no, customer or phone'), poNo);
    await waitFor(() => expect(screen.getAllByLabelText('Start preparing').length).toBe(1), { timeout: 15000 });
    tap(screen.getByLabelText('Start preparing'));
    await waitFor(() => expect(screen.getAllByLabelText('Start preparing').length).toBe(2), { timeout: 5000 });
    tap(screen.getAllByLabelText('Start preparing')[1]);              // the confirm popup's button
    await screen.findByText(`${poNo} is now Preparing`, {}, { timeout: 15000 });
    tap(await screen.findByLabelText('Mark delivered', {}, { timeout: 15000 }));
    tap(await screen.findByLabelText('Delivered & invoice', {}, { timeout: 5000 }));
    await screen.findByText('Payment received', {}, { timeout: 60000 });
    global.__phone = phone;
    tap(screen.getByLabelText('New order'));

    // ---- clear running orders: confirmed with the user's own login PIN ----
    const item2 = process.env.REZTRA_TEST_ITEM || 'Pepsi';
    tap(screen.getByLabelText('Order'));
    tap(screen.getAllByText('Take Away')[0]);
    tap(await screen.findByLabelText(item2, {}, { timeout: 10000 }));
    openCart();
    await waitFor(() => expect(screen.getByLabelText('Place order').props.accessibilityState?.disabled).toBeFalsy(), { timeout: 15000 });
    tap(screen.getByLabelText('Place order'));
    await screen.findByText(/placed — sent to the kitchen|KOT sent to/, {}, { timeout: 20000 });
    tap(screen.getByLabelText('Running'));
    await waitFor(() => expect(screen.getAllByLabelText('Pay').length).toBeGreaterThan(0), { timeout: 20000 });
    tap(screen.getByLabelText('Clear running orders'));
    await screen.findByText('Your login PIN', {}, { timeout: 5000 });
    const key = (d) => tap(screen.getAllByLabelText(d).pop());
    for (const d of '9898') key(d);
    tap(screen.getByLabelText('Clear orders'));
    await screen.findByText('The PIN is not correct.', {}, { timeout: 15000 });
    for (const d of PIN) key(d);
    tap(screen.getByLabelText('Clear orders'));
    await screen.findByText(/running orders? cleared$/, {}, { timeout: 15000 });
    await waitFor(() => expect(screen.queryAllByLabelText('Pay').length).toBe(0), { timeout: 20000 });

    // ---- register report as A4 PDF (Android's print screen) ----
    tap(screen.getByLabelText('Settings'));
    tap(await screen.findByLabelText('Register', {}, { timeout: 5000 }));
    await screen.findByText('Closing balance', {}, { timeout: 15000 });
    const docs = (global.__docs || []).length;
    tap(screen.getByLabelText('PDF'));
    await waitFor(() => expect((global.__docs || []).length).toBe(docs + 1), { timeout: 15000 });
    expect(global.__docs[docs].html).toContain('Register Report');
    expect(global.__docs[docs].name).toMatch(/^register-report-/);
    tap(screen.getAllByLabelText('Close')[0]);

    // ---- log out with the register open: asks first (here: keep it open), then back to the PIN screen ----
    tap(await screen.findByLabelText('Log out', {}, { timeout: 5000 }));
    await screen.findByText(/Your register is still open/, {}, { timeout: 5000 });
    const regPrints = global.__prints.length;
    tap(screen.getByLabelText('Print report'));
    await waitFor(() => expect(global.__prints.length).toBe(regPrints + 1), { timeout: 15000 });
    tap(screen.getByLabelText('Log out without closing'));
    await screen.findByText('Enter your PIN', {}, { timeout: 15000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 3000)); });
    global.__done = true;
});