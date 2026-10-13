// Tiny session store: keeps the logged-in user + token in sessionStorage,
// so a page reload keeps you logged in but closing the app logs you out.
import { useSyncExternalStore } from "react";

const KEY = "reztra.session";
const listeners = new Set();
let current = read();

function read() {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; }
}
function write(value) {
  current = value;
  try { value ? sessionStorage.setItem(KEY, JSON.stringify(value)) : sessionStorage.removeItem(KEY); } catch {}
  listeners.forEach((l) => l());
}

export const getToken = () => current?.token || null;
export const signOut = () => write(null);

export function useSession() {
  const user = useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => current);
  return { user, signIn: write, signOut };
}
