// Printing on Android. The receipt (KOT, bill, invoice, register report, credit note…) is raw ESC/POS made on the
// server, exactly like the desktop app. This file decides WHERE each receipt prints on this tablet / phone:
//
//   network   -> an IP:port over Wi-Fi / LAN
//   bluetooth -> a paired Bluetooth printer
//   usb       -> a USB printer (OTG cable)
//   builtin   -> the printer inside the POS terminal (Sunmi "InnerPrinter" over Bluetooth, else its USB printer)
//   auto      -> the printer set in the web app (its network address)
//
// Settings -> Printers has one choice per receipt type: Invoice, Bill, and KOT for each kitchen.
// A type without its own choice uses the default printer of this device; with no default either,
// it uses the printer from the web app (network address).
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { getPref, setPref } from './storage';

const P = NativeModules.ReztraPrinter;
const SUNMI_INNER = '00:11:22:33:44:55';

export const MODES = [
    { id: 'network', label: 'Network / Wi-Fi' },
    { id: 'bluetooth', label: 'Bluetooth' },
    { id: 'usb', label: 'USB' },
    { id: 'builtin', label: 'Built-in printer' },
];

export const printerKey = (p) => (p ? String(p.id || p.title || '') : '');

/** settings key of a receipt type */
export const ROLE = { invoice: 'role:invoice', bill: 'role:bill', kot: (kitchenId) => `role:kot:${kitchenId}` };

/** which receipt type a print job from the API is */
export function jobRole(job) {
    const title = String(job?.title || '');
    if (job?.kitchen_id != null || /^KOT\b/i.test(title)) return job?.kitchen_id != null ? ROLE.kot(job.kitchen_id) : 'role:kot';
    if (/^(Draft|Bill)\b/i.test(title)) return ROLE.bill;
    return ROLE.invoice;        // invoice, credit note, pre-order draft, register report
}

let routesCache = null;
export async function getRoutes() {
    if (!routesCache) routesCache = await getPref('printerRoutes', {});
    return routesCache;
}
export async function setRoute(key, route) {
    const r = { ...(await getRoutes()) };
    if (route) r[key] = route; else delete r[key];
    routesCache = r;
    await setPref('printerRoutes', r);
    return r;
}

async function needBluetoothPermission() {
    if (Platform.OS !== 'android' || Platform.Version < 31) return;
    const perm = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
    if (await PermissionsAndroid.check(perm)) return;
    const r = await PermissionsAndroid.request(perm, {
        title: 'Bluetooth printers',
        message: 'Reztra POS needs "Nearby devices" to print on Bluetooth printers.',
        buttonPositive: 'Allow',
    });
    if (r !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Allow "Nearby devices" for Reztra POS to use Bluetooth printers.');
}

export async function listBluetooth() {
    if (!P) throw new Error('Printing is not available in this build.');
    await needBluetoothPermission();
    return P.listBluetooth();
}
export async function listUsb() {
    if (!P) throw new Error('Printing is not available in this build.');
    return P.listUsb();
}

/** built-in printer of POS terminals: Sunmi = Bluetooth "InnerPrinter"; others (iMin, …) = their USB printer */
async function printBuiltin(base64) {
    let bt = [];
    try { bt = await listBluetooth(); } catch { /* no Bluetooth */ }
    const inner = bt.find((d) => d.address === SUNMI_INNER || /innerprinter/i.test(d.name || ''));
    if (inner) return P.printBluetooth(inner.address, base64);
    const usb = await P.listUsb();
    const usbPrinter = usb.find((d) => d.printer) || usb[0];
    if (usbPrinter) return P.printUsb(usbPrinter.deviceName, base64);
    throw new Error('No built-in printer found on this device.');
}

/** send bytes to one local route */
export async function sendTo(route, base64, serverPrinter = null) {
    if (!P) throw new Error('Printing is not available in this build.');
    switch (route.mode) {
        case 'network': {
            const ip = (route.ip || serverPrinter?.printer_ip_address || '').trim();
            if (!ip) throw new Error(`Printer "${serverPrinter?.title || route.name || ''}" has no IP address.`);
            return P.printTcp(ip, Number(route.port || serverPrinter?.printer_port) || 9100, base64, 8000);
        }
        case 'bluetooth':
            if (!route.address) throw new Error('Choose the Bluetooth printer in Settings → Printers.');
            await needBluetoothPermission();
            return P.printBluetooth(route.address, base64);
        case 'usb':
            return P.printUsb(route.deviceName || '', base64);
        case 'builtin':
            return printBuiltin(base64);
        default:
            throw new Error('Unknown printer type.');
    }
}

/** the web app's own printer for a job, when it has a network address */
function webPrinter(serverPrinter) {
    const ip = String(serverPrinter?.printer_ip_address || '').trim();
    const type = String(serverPrinter?.type || '').toLowerCase();
    return ip && (type === 'network' || !type) ? { mode: 'network', ip, port: serverPrinter.printer_port } : null;
}

/** where a receipt prints on this device: its own choice -> the device default -> the web app's printer */
export async function routeFor(serverPrinter, role = null) {
    const routes = await getRoutes();
    const own = role ? routes[role] : null;
    if (own && own.mode !== 'auto') return own;
    if (own && own.mode === 'auto') return webPrinter(serverPrinter) || routes['*'] || null;
    if (routes['*']) return routes['*'];
    return webPrinter(serverPrinter);
}

/**
 * Print one job from the API: { title, printer, print_bytes, error }.
 * Resolves { ok, title, error }.
 */
export async function runJob(job) {
    const title = job?.title || 'Receipt';
    if (!job) return { ok: false, title, error: 'Nothing to print.' };
    if (!job.print_bytes) return { ok: false, title, error: job.error || 'Nothing to print.' };
    try {
        const route = await routeFor(job.printer, jobRole(job));
        if (!route) return { ok: false, title, error: 'Choose a printer for this on this device (Settings → Printers).' };
        await sendTo(route, job.print_bytes, job.printer);
        return { ok: true, title };
    } catch (e) {
        return { ok: false, title, error: e?.message || String(e) };
    }
}

/** small ESC/POS test page */
export function testPage(name) {
    const t = `\x1b@\x1ba\x01\x1b!\x30Reztra POS\n\x1b!\x00Printer test\n${name || ''}\n${new Date().toLocaleString()}\n\n\n\x1dV\x01`;
    let bin = '';
    for (let i = 0; i < t.length; i++) bin += String.fromCharCode(t.charCodeAt(i) & 0xff);
    return btoaSafe(bin);
}
function btoaSafe(bin) {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    for (let i = 0; i < bin.length; i += 3) {
        const a = bin.charCodeAt(i), b = bin.charCodeAt(i + 1), c = bin.charCodeAt(i + 2);
        const n = (a << 16) | ((b || 0) << 8) | (c || 0);
        out += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < bin.length ? A[(n >> 6) & 63] : '=') + (i + 2 < bin.length ? A[n & 63] : '=');
    }
    return out;
}

export const deviceInfo = () => (P ? P.deviceInfo() : Promise.resolve({}));