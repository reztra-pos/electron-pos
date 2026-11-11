// Device registration (server address + device token) is kept in the Android Keystore (react-native-keychain).
// Screen preferences and printer choices are in AsyncStorage.
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVICE = 'com.reztra.self.device';

export async function loadDevice() {
  try {
    const c = await Keychain.getGenericPassword({ service: SERVICE });
    return c ? JSON.parse(c.password) : null;
  } catch { return null; }
}
export async function saveDevice(data) {
  await Keychain.setGenericPassword('device', JSON.stringify(data), { service: SERVICE });
}
export async function clearDevice() {
  try { await Keychain.resetGenericPassword({ service: SERVICE }); } catch { /* nothing saved */ }
}

export async function getPref(key, fallback) {
  try { const v = await AsyncStorage.getItem(`reztra.${key}`); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export async function setPref(key, value) {
  try { await AsyncStorage.setItem(`reztra.${key}`, JSON.stringify(value)); } catch { /* ignore */ }
}
