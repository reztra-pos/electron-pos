// Printer routing on the device: Invoice, Bill and each kitchen's KOT can print on their own printer;
// anything without its own choice uses the device default, and with no default the web app's printer.
import { jobRole, runJob, setRoute, ROLE } from '../src/lib/printer';

const net = (ip) => ({ id: 9, title: 'Web', type: 'network', printer_ip_address: ip, printer_port: 9100 });
const job = (title, extra = {}) => ({ title, printer: net('10.0.0.9'), print_bytes: 'QUJD', ...extra });
const last = () => global.__prints[global.__prints.length - 1];

test('receipt types', () => {
    expect(jobRole(job('Invoice INV1'))).toBe(ROLE.invoice);
    expect(jobRole(job('Credit note CRN-1'))).toBe(ROLE.invoice);
    expect(jobRole(job('Register report'))).toBe(ROLE.invoice);
    expect(jobRole(job('Pre-order draft PO-1'))).toBe(ROLE.invoice);
    expect(jobRole(job('Draft INV2'))).toBe(ROLE.bill);
    expect(jobRole(job('KOT Grill', { kitchen_id: 3 }))).toBe(ROLE.kot(3));
});

test('own printer -> default -> web app printer', async () => {
    // nothing set: the web app printer (network)
    expect((await runJob(job('Invoice INV1'))).ok).toBe(true);
    expect(last()).toMatchObject({ kind: 'tcp', host: '10.0.0.9' });

    // a default for the device: everything without its own choice goes there
    await setRoute('*', { mode: 'builtin' });
    await runJob(job('KOT Grill', { kitchen_id: 3 }));
    expect(last()).toMatchObject({ kind: 'bt', a: '00:11:22:33:44:55' });

    // each receipt type / kitchen on its own printer
    await setRoute(ROLE.invoice, { mode: 'network', ip: '192.168.1.20', port: 9100 });
    await setRoute(ROLE.bill, { mode: 'bluetooth', address: 'AA:BB', name: 'Bill BT' });
    await setRoute(ROLE.kot(3), { mode: 'network', ip: '192.168.1.31', port: 9100 });
    await setRoute(ROLE.kot(4), { mode: 'auto' });
    await runJob(job('Invoice INV1')); expect(last()).toMatchObject({ kind: 'tcp', host: '192.168.1.20' });
    await runJob(job('Credit note CRN-1')); expect(last()).toMatchObject({ kind: 'tcp', host: '192.168.1.20' });
    await runJob(job('Draft INV2')); expect(last()).toMatchObject({ kind: 'bt', a: 'AA:BB' });
    await runJob(job('KOT Grill', { kitchen_id: 3 })); expect(last()).toMatchObject({ kind: 'tcp', host: '192.168.1.31' });
    await runJob(job('KOT Bar', { kitchen_id: 4, printer: net('10.0.0.44') })); expect(last()).toMatchObject({ kind: 'tcp', host: '10.0.0.44' });
    await runJob(job('KOT Pizza', { kitchen_id: 5 })); expect(last()).toMatchObject({ kind: 'bt', a: '00:11:22:33:44:55' });   // no choice -> default

    // back to default
    await setRoute(ROLE.invoice, null);
    await runJob(job('Invoice INV1')); expect(last()).toMatchObject({ kind: 'bt', a: '00:11:22:33:44:55' });
});