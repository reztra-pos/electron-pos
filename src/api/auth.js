// Login — always checked by your server (POST /v1/auth/login with this device's token).
// No demo / mock logins: a disabled device or a disabled user can never log in.
const notInApp = () => Promise.reject(new Error("Open the Reztra POS desktop app to log in."));

export const authApi = {
  loginWithPin: (pin) => (window.electronAPI?.auth ? window.electronAPI.auth.pin(pin) : notInApp()),
  loginWithPassword: (email, password) => (window.electronAPI?.auth ? window.electronAPI.auth.password(email, password) : notInApp()),
};