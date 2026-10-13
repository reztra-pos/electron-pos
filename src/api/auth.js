// Login. Three modes, picked automatically:
//  - Electron (activated device): PIN is checked against the staff list synced to SQLite, so it works
//    offline; username/password goes to the server through the device connection.
//  - Browser with VITE_USE_MOCK=false: calls the API directly.
//  - Otherwise: demo logins (PIN 1234, admin/admin).
import { api } from "./client.js";
import { mockAuthApi } from "../pages/Login.jsx";

const electronAuthApi = {
  loginWithPin: (pin) => window.electronAPI.auth.pin(pin),
  loginWithPassword: (u, p) => window.electronAPI.auth.password(u, p),
};

const httpAuthApi = {
  async loginWithPin(pin) {
    const { data } = await api.post("/v1/auth/pin", { pin });
    return { ...data.user, token: data.token };
  },
  async loginWithPassword(username, password) {
    const { data } = await api.post("/v1/auth/login", { username, password });
    return { ...data.user, token: data.token };
  },
};

export const authApi = typeof window !== "undefined" && window.electronAPI?.auth
  ? electronAuthApi
  : import.meta.env.VITE_USE_MOCK === "false" ? httpAuthApi : mockAuthApi;
