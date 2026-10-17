import React, { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Activate from "./pages/Activate.jsx";
import Login from "./pages/Login.jsx";
import PosMain, { applyCatalog } from "./pages/PosMain.jsx";
import { authApi } from "./api/auth.js";
import { get } from "./api/pos.js";
import { useSession, signOut as clearSession } from "./session.js";

const EAPI = window.electronAPI;

// HashRouter is used because Electron loads the built app from file://
export default function App() {
  const [device, setDevice] = useState(EAPI?.device ? undefined : null); // undefined = still checking
  const [notice, setNotice] = useState("");                              // why we are on the activation / login screen

  useEffect(() => {
    if (!EAPI?.device) return;
    // Is this PC activated, and is it still enabled in Settings -> POS Devices?
    EAPI.device.get().then(async (d) => {
      if (!d) return setDevice(null);
      const st = await EAPI.device.check().catch(() => ({ active: true }));
      if (!st.active) { clearSession(); setNotice(st.message || "This device has been disabled. Activate it again."); return setDevice(null); }
      setDevice(d);
    }).catch(() => setDevice(null));
    // disabled while running -> back to activation; logged out by the server -> back to PIN
    const offRevoked = EAPI.device.onRevoked((msg) => { clearSession(); setNotice(msg || "This device has been disabled in the web app."); setDevice(null); window.location.hash = "#/activate"; });
    const offEnded = EAPI.auth.onSessionEnded((msg) => { clearSession(); setNotice(msg || "Your session has ended. Please log in again."); window.location.hash = "#/login"; });
    return () => { offRevoked(); offEnded(); };
  }, []);

  if (device === undefined) return <Splash text="Connecting to the server…" />;
  const needsActivation = !!EAPI?.device && !device;

  return (
    <HashRouter>
      <Routes>
        <Route path="/activate" element={needsActivation ? <ActivateRoute notice={notice} onDone={(d) => { setNotice(""); setDevice(d); }} /> : <Navigate to="/login" replace />} />
        <Route path="/login" element={needsActivation ? <Navigate to="/activate" replace /> : <LoginRoute notice={notice} clearNotice={() => setNotice("")} />} />
        <Route path="/pos" element={needsActivation ? <Navigate to="/activate" replace /> : <Protected><PosRoute /></Protected>} />
        <Route path="*" element={<Navigate to={needsActivation ? "/activate" : "/login"} replace />} />
      </Routes>
    </HashRouter>
  );
}

function ActivateRoute({ onDone, notice }) {
  const navigate = useNavigate();
  return <Activate notice={notice} onActivated={(info) => { onDone(info); navigate("/login", { replace: true }); }} />;
}

function LoginRoute({ notice, clearNotice }) {
  const navigate = useNavigate();
  const { user, signIn } = useSession();
  if (user) return <Navigate to="/pos" replace />;
  return (
    <>
      {notice && <Banner text={notice} onClose={clearNotice} />}
      <Login api={authApi} onLoginSuccess={(u) => { clearNotice(); signIn(u); navigate("/pos", { replace: true }); }} />
    </>
  );
}

// Loads menu, tables, waiters, customers, payment methods ... from the server, then shows the POS screen.
function PosRoute() {
  const navigate = useNavigate();
  const { user, signOut } = useSession();
  const [ready, setReady] = useState(!EAPI?.api);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!EAPI?.api) return;
    let alive = true;
    setError("");
    (async () => {
      // the PC was restarted but the screen kept its session: the server token is gone, log in again
      if (!(await EAPI.auth.active())) { signOut(); navigate("/login", { replace: true }); return; }
      const [boot, customers] = await Promise.all([get("/v1/pos/bootstrap"), get("/v1/customers?limit=200")]);
      if (!alive) return;
      applyCatalog(boot, customers);
      setReady(true);
    })().catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [attempt]);

  const logout = async () => { await EAPI?.auth.logout().catch(() => { }); signOut(); navigate("/login", { replace: true }); };

  if (error) return <Splash text={error} action={{ label: "Retry", onClick: () => setAttempt((n) => n + 1) }} second={{ label: "Log out", onClick: logout }} />;
  if (!ready) return <Splash text="Loading menu, tables and settings…" />;
  return <PosMain user={user} onLogout={logout} />;
}

function Protected({ children }) {
  const { user } = useSession();
  return user ? children : <Navigate to="/login" replace />;
}

function Banner({ text, onClose }) {
  return (
    <div role="alert" style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 500, background: "#FDECEA", color: "#A4262C", border: "1px solid #F5C2C0", borderRadius: 10, padding: "10px 14px", fontFamily: "Manrope, system-ui, sans-serif", fontWeight: 700, fontSize: 13.5, display: "flex", gap: 12, alignItems: "center", maxWidth: "92vw" }}>
      <span>{text}</span>
      <button onClick={onClose} style={{ border: 0, background: "transparent", color: "inherit", fontWeight: 800, cursor: "pointer" }} aria-label="Dismiss">✕</button>
    </div>
  );
}

function Splash({ text, action, second }) {
  const btn = { marginTop: 14, height: 42, padding: "0 18px", borderRadius: 10, border: 0, background: "#5B3FD1", color: "#fff", fontWeight: 800, cursor: "pointer" };
  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", fontFamily: "Manrope, system-ui, sans-serif", color: "#5A6478", background: "#EEF0F5", padding: 20, textAlign: "center" }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, maxWidth: 460 }}>{text}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {action && <button onClick={action.onClick} style={btn}>{action.label}</button>}
          {second && <button onClick={second.onClick} style={{ ...btn, background: "#E6E9EF", color: "#1D2433" }}>{second.label}</button>}
        </div>
      </div>
    </div>
  );
}