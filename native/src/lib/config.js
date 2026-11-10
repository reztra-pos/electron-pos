// App settings. KEY_SECRET must be the SAME secret as the desktop app (electron/key-secret.cjs) and the web app
// that generates device keys (Settings -> POS Devices). Change it before shipping.
export const KEY_SECRET = 'change-me-reztra-device-key-secret-2026';
export const APP_VERSION = '1.0.0';
export const CLIENT = `android-pos ${APP_VERSION}`;
export const TIMEOUT_MS = 20000;
export const RUNNING_POLL_MS = 15000;
