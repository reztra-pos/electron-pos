// Test doubles for the native parts (the JS logic and the real server API are tested for real).
/* global jest */
const mem = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: async (k) => (k in mem ? mem[k] : null),
        setItem: async (k, v) => { mem[k] = v; },
        removeItem: async (k) => { delete mem[k]; },
    },
}));
const kc = {};
jest.mock('react-native-keychain', () => ({
    getGenericPassword: async ({ service }) => (kc[service] ? { username: 'device', password: kc[service] } : false),
    setGenericPassword: async (u, p, { service }) => { kc[service] = p; return true; },
    resetGenericPassword: async ({ service }) => { delete kc[service]; return true; },
}));
jest.mock('@react-native-clipboard/clipboard', () => ({ __esModule: true, default: { getString: async () => global.__clip || '', setString: () => { } } }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// icons render nothing in tests, but only names the real package exports exist (an unknown icon is undefined, as on the device)
jest.mock('lucide-react-native', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../node_modules/lucide-react-native/dist/esm/lucide-react-native.mjs'), 'utf8');
    const names = new Set([...src.matchAll(/\bas (\w+)\b/g)].map((m) => m[1]));
    return Object.fromEntries([...names].map((n) => [n, () => null]));
});
global.__prints = [];
const { NativeModules } = require('react-native');
NativeModules.ReztraPrinter = {
    deviceInfo: async () => ({ manufacturer: 'test', model: 'jest' }),
    printTcp: async (host, port, b64) => { global.__prints.push({ kind: 'tcp', host, port, len: b64.length }); return true; },
    printBluetooth: async (a, b64) => { global.__prints.push({ kind: 'bt', a, len: b64.length }); return true; },
    printUsb: async (d, b64) => { global.__prints.push({ kind: 'usb', d, len: b64.length }); return true; },
    listBluetooth: async () => [{ name: 'InnerPrinter', address: '00:11:22:33:44:55' }],
    listUsb: async () => [],
};

// REZTRA_TEST_SCREEN=phone|tablet picks the window size (default: jest's 750x1334 -> tablet layout)
const SIZES = { phone: { width: 390, height: 844 }, tablet: { width: 1280, height: 800 } };
const size = SIZES[process.env.REZTRA_TEST_SCREEN];
if (size) {
    const RN = require('react-native');
    const win = { ...size, scale: 2, fontScale: 1 };
    jest.spyOn(RN.Dimensions, 'get').mockReturnValue(win);
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue(win);
}