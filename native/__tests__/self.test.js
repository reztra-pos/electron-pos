/**
 * Self / Online orders against the POS API bench: badge -> list -> Accept (KOT) / Decline / Modify (cart, whole KOT).
 * Needs REZTRA_TEST_KEY (device key) and REZTRA_TEST_SEED (a command that makes the waiting orders and prints
 * {"accept": no, "decline": no, "modify": no}).
 */
import React from 'react';
import { execSync } from 'child_process';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import App from '../src/App';

const KEY = process.env.REZTRA_TEST_KEY;
const SEED = process.env.REZTRA_TEST_SEED;
const PIN = process.env.REZTRA_TEST_PIN || '1111';
const tap = (q) => fireEvent.press(q);

(KEY && SEED ? test : test.skip)('self / online orders: accept, decline, modify', async () => {
    const no = JSON.parse(execSync(SEED).toString());
    global.__clip = KEY;
    render(<App />);
    await screen.findByText('Activate this POS', {}, { timeout: 15000 });
    tap(screen.getByLabelText('Paste'));
    await screen.findByText(/Key (checked with the server|is valid)/, {}, { timeout: 15000 });
    tap(screen.getByLabelText('Activate'));
    await screen.findByText('Enter your PIN', {}, { timeout: 15000 });
    for (const d of PIN) tap(screen.getByLabelText(d));
    await waitFor(() => expect(screen.queryByText('Enter your PIN')).toBeNull(), { timeout: 20000 });
    if (await screen.findByLabelText('Open register', {}, { timeout: 4000 }).catch(() => null)) {
        await waitFor(() => expect(screen.getByLabelText('Open register').props.accessibilityState?.disabled).toBeFalsy(), { timeout: 15000 });
        tap(screen.getByLabelText('Open register'));
        await waitFor(() => expect(screen.queryByLabelText('Open register')).toBeNull(), { timeout: 15000 });
    }

    // badge: 3 waiting orders
    await waitFor(() => expect(screen.getByText('3')).toBeTruthy(), { timeout: 20000 });
    tap(screen.getByLabelText('Self / Online orders'));
    await screen.findByText('Self orders (2)', {}, { timeout: 15000 });
    expect(screen.getByText('Online orders (1)')).toBeTruthy();

    // accept -> KOT printed, order goes to running orders
    const p0 = global.__prints.length;
    tap(await screen.findByLabelText(`Order ${no.accept}`, {}, { timeout: 5000 }));
    await screen.findByText('Total payable', {}, { timeout: 15000 });
    tap(screen.getByLabelText('Accept'));
    // the "accepted" toast is replaced right away by the KOT print result
    await waitFor(() => expect(global.__prints.length).toBeGreaterThan(p0), { timeout: 15000 });
    await screen.findByText('Self orders (1)', {}, { timeout: 15000 });

    // decline (online)
    tap(screen.getByText('Online orders (1)'));
    tap(await screen.findByLabelText(`Order ${no.decline}`, {}, { timeout: 5000 }));
    await screen.findByText('Total payable', {}, { timeout: 15000 });
    tap(screen.getByLabelText('Decline'));
    await screen.findByText(/The customer's order will not be made/, {}, { timeout: 5000 });
    tap(screen.getAllByLabelText('Decline').pop());          // the confirm popup's button
    await screen.findByText(`Order ${no.decline} declined`, {}, { timeout: 15000 });
    await screen.findByText('Online orders (0)', {}, { timeout: 15000 });

    // modify -> opened in the cart; "Update order" sends the whole order to the kitchen
    tap(screen.getByText('Self orders (1)'));
    tap(await screen.findByLabelText(`Order ${no.modify}`, {}, { timeout: 5000 }));
    await screen.findByText('Total payable', {}, { timeout: 15000 });
    tap(screen.getByLabelText('Modify'));
    await screen.findByText(new RegExp(`^Editing order ${no.modify}$`), {}, { timeout: 15000 });
    if (screen.queryByText('View order')) tap(screen.getByText('View order'));
    await waitFor(() => expect(screen.getByLabelText('Update order').props.accessibilityState?.disabled).toBeFalsy(), { timeout: 15000 });
    const p1 = global.__prints.length;
    tap(screen.getByLabelText('Update order'));
    await waitFor(() => expect(global.__prints.length).toBeGreaterThan(p1), { timeout: 15000 });
    await waitFor(() => expect(screen.queryByLabelText('Self / Online orders')).toBeTruthy());
    global.__done = true;
});