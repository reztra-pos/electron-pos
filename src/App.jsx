import React, { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Activate from "./pages/Activate.jsx";
import Login from "./pages/Login.jsx";
import PosMain, { applyCatalog } from "./pages/PosMain.jsx";
import { authApi } from "./api/auth.js";
import { useSession } from "./session.js";

const EAPI = window.electronAPI;

// HashRouter is used because Electron loads the built app from file://
export default function App() {
  const [device, setDevice] = useState(EAPI?.device ? undefined : null); // undefined = still checking
  useEffect(() => { if (EAPI?.device) EAPI.device.get().then(setDevice).catch(() => setDevice(null)); }, []);
  if (device === undefined) return <Splash text="Starting…" />;
  const needsActivation = !!EAPI?.device && !device;

  return (
    <HashRouter>
      <Routes>
        <Route path="/activate" element={needsActivation ? <ActivateRoute onDone={setDevice} /> : <Navigate to="/login" replace />} />
        <Route path="/login" element={needsActivation ? <Navigate to="/activate" replace /> : <LoginRoute />} />
        <Route path="/pos" element={needsActivation ? <Navigate to="/activate" replace /> : <Protected><PosRoute /></Protected>} />
        <Route path="*" element={<Navigate to={needsActivation ? "/activate" : "/login"} replace />} />
      </Routes>
    </HashRouter>
  );
}

function ActivateRoute({ onDone }) {
  const navigate = useNavigate();
  return <Activate onActivated={(info) => { onDone(info); navigate("/login", { replace: true }); }} />;
}

function LoginRoute() {
  const navigate = useNavigate();
  const { user, signIn } = useSession();
  if (user) return <Navigate to="/pos" replace />;
  return <Login api={authApi} onLoginSuccess={(u) => { signIn(u); navigate("/pos", { replace: true }); }} />;
}

function PosRoute() {
  const navigate = useNavigate();
  const { user, signOut } = useSession();
  // In Electron, load the menu, tables, staff… from SQLite before showing the POS
  const [ready, setReady] = useState(!EAPI?.data);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!EAPI?.data) return;
    Promise.all([EAPI.data.catalog(), EAPI.orders.load(), EAPI.invoices.recent(50)])
      .then(([catalog, running, recent]) => {
        if (!catalog.items.length) throw new Error("No menu data on this PC yet. Connect to the internet and click Retry.");
        applyCatalog(catalog, { running: running || [], recent: recent || [] });
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Splash text={error} action={{ label: "Retry", onClick: () => EAPI.data.refresh().then(() => window.location.reload()).catch((e) => setError(e.message)) }} />;
  if (!ready) return <Splash text="Loading menu…" />;
  return <PosMain user={user} onLogout={() => { signOut(); navigate("/login", { replace: true }); }} />;
}

function Protected({ children }) {
  const { user } = useSession();
  return user ? children : <Navigate to="/login" replace />;
}

function Splash({ text, action }) {
  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", fontFamily: "Manrope, system-ui, sans-serif", color: "#5A6478", background: "#EEF0F5", padding: 20, textAlign: "center" }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, maxWidth: 420 }}>{text}</div>
        {action && <button onClick={action.onClick} style={{ marginTop: 14, height: 42, padding: "0 18px", borderRadius: 10, border: 0, background: "#5B3FD1", color: "#fff", fontWeight: 800, cursor: "pointer" }}>{action.label}</button>}
      </div>
    </div>
  );
}
