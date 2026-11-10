/**
 * End-to-end flow against the POS API bench (real server, real ZATCA-step polling):
 * activation -> PIN login -> open register -> take away quick invoice (printed) -> dine-in place order (KOT) ->
 * pay it from Running orders.  Needs REZTRA_TEST_KEY (device key) in the environment.
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
  global.__done = true;
});
