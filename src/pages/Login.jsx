/**
 * Reztra POS — PIN login screen (React, Electron-ready)
 * -----------------------------------------------------
 * Dependencies: react (18+), lucide-react. Styles are injected by the component.
 *
 * Usage:
 *   <PosLogin onLoginSuccess={(user) => navigate("/pos")} />
 *
 * Wiring the backend: replace the two functions in `authApi` below with your real calls.
 * Both must resolve to a user object or throw an Error whose message is shown on screen.
 *
 * Electron (optional): if your preload exposes `window.electronAPI` with
 * { minimize(), maximize(), close(), getAppInfo() }, the title-bar buttons and the
 * terminal/version footer use it. Without it the screen still works in a browser.
 *
 * Demo credentials: PIN 1234, or username "admin" / password "admin".
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Delete, Eye, EyeOff, Lock, User, ArrowLeft, Loader2, Wifi, WifiOff,
  Minus, Square, X, Globe, Mail, ShieldAlert, KeyRound,
} from "lucide-react";

/* ============================================================================
   CONFIG + API (replace with real endpoints)
   ========================================================================== */
const CONFIG = {
  pinMin: 4,               // staff PINs can be 4 to 8 digits (same limit as the server)
  pinMax: 8,
  maxAttempts: 5,          // wrong PINs before a temporary lock
  lockSeconds: 30,
  brand: "Reztra",
  website: "www.reztra.com",
  supportEmail: "support@reztra.com",
  outlet: "Fryzo Grill — Main Branch",
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const mockAuthApi = {
  // POST /api/auth/pin  { pin, terminalId }  ->  { id, name, role, token }
  async loginWithPin(pin) {
    await wait(600);
    if (pin === "1234") return { id: 1, name: "Anas K", role: "Cashier", token: "demo-token" };
    throw new Error("Incorrect PIN. Please try again.");
  },
  // POST /api/auth/login  { username, password }  ->  { id, name, role, token }
  async loginWithPassword(username, password) {
    await wait(700);
    if (username === "admin" && password === "admin") return { id: 2, name: "Admin", role: "Manager", token: "demo-token" };
    throw new Error("Username or password is incorrect.");
  },
};

/* ============================================================================
   STYLES
   ========================================================================== */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
.lg{--bg:#EEF0F5;--panel:#fff;--ink:#1D2433;--ink2:#5A6478;--line:#DCE1E8;--brand:#5B3FD1;--brand-2:#EEE9FF;--brand-d:#3F2A9E;--danger:#DC3F35;--ok:#1E9E6A;
 font-family:Manrope,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);
 height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden;-webkit-font-smoothing:antialiased;user-select:none}
.lg *{box-sizing:border-box}
.lg button{font-family:inherit;cursor:pointer;color:inherit}
.lg button:focus-visible,.lg input:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.lg .num{font-variant-numeric:tabular-nums}

/* title bar (frameless Electron window) */
.tbar{height:36px;display:flex;align-items:center;justify-content:space-between;padding-left:14px;-webkit-app-region:drag;flex:none}
.tbar .t{font-size:12px;font-weight:700;color:var(--ink2);display:flex;gap:10px;align-items:center}
.status{display:inline-flex;align-items:center;gap:5px;font-weight:700}
.status.on{color:var(--ok)}.status.off{color:var(--danger)}
.wc{display:flex;-webkit-app-region:no-drag;height:100%}
.wc button{width:46px;height:100%;border:0;background:transparent;display:grid;place-items:center;color:var(--ink2)}
.wc button:hover{background:rgba(0,0,0,.06)}.wc button.close:hover{background:#E81123;color:#fff}

/* layout */
.body{flex:1;min-height:0;display:grid;grid-template-columns:1.1fr 1fr;align-items:center;gap:40px;padding:0 6vw 24px}
.intro{max-width:560px}
.intro h1{margin:0 0 6px;font-size:clamp(30px,3.4vw,46px);font-weight:800;line-height:1.08;letter-spacing:-.01em}
.intro h1 span{color:var(--brand)}
.intro .clock{font-size:clamp(44px,5vw,72px);font-weight:800;letter-spacing:-.02em;margin:26px 0 0;line-height:1}
.intro .date{color:var(--ink2);font-weight:600;margin:6px 0 26px}
.intro p{color:var(--ink2);font-size:15px;line-height:1.6;margin:0 0 12px;max-width:52ch}
.feats{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
.feats span{background:#fff;border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:700;color:var(--ink2)}

.card{justify-self:center;width:100%;max-width:420px;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:28px 30px 20px;box-shadow:0 20px 50px rgba(30,36,60,.08);display:flex;flex-direction:column;align-items:center}
.logo{display:flex;align-items:center;gap:10px;margin-bottom:4px}
.logo .mark{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#6A4BE6,#9A3FB8);display:grid;place-items:center;color:#fff}
.logo .word{font-size:28px;font-weight:800;letter-spacing:-.02em;color:var(--brand-d)}
.card h2{margin:6px 0 2px;font-size:19px;font-weight:700}
.card .sub{margin:0 0 18px;font-size:13px;color:var(--ink2);text-align:center}

.pins{display:flex;gap:12px;margin-bottom:8px}
.pins.shake{animation:shake .38s}
@keyframes shake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}
.pin{width:54px;height:60px;border:2px solid var(--line);border-radius:12px;display:grid;place-items:center;font-size:24px;font-weight:800;background:#F7F8FB;transition:border-color .12s}
.pin.filled{border-color:var(--brand);background:#fff}
.pin.active{border-color:var(--brand);box-shadow:0 0 0 4px var(--brand-2)}
.pin.err{border-color:var(--danger);background:#FDECEA}
.pin .dot{width:12px;height:12px;border-radius:50%;background:var(--ink)}
.pin-tools{display:flex;justify-content:space-between;align-items:center;width:100%;max-width:252px;min-height:26px;margin-bottom:10px}
.link-btn{border:0;background:transparent;font-size:12.5px;font-weight:700;color:var(--ink2);display:inline-flex;align-items:center;gap:5px;padding:4px}
.link-btn:hover{color:var(--brand)}
.msg{font-size:13px;font-weight:600;min-height:20px;text-align:center;margin-bottom:8px;display:flex;align-items:center;gap:6px;justify-content:center}
.msg.err{color:var(--danger)}.msg.info{color:var(--ink2)}

.pad{display:grid;grid-template-columns:repeat(3,76px);gap:10px;margin-bottom:16px}
.key{height:58px;border:1px solid var(--line);border-radius:12px;background:#F4F5F9;font-size:22px;font-weight:700;display:grid;place-items:center;transition:background .08s,transform .06s}
.key:hover:not(:disabled){background:#fff;border-color:#C9CFDA}
.key:active:not(:disabled),.key.pressed{transform:scale(.95);background:var(--brand-2);border-color:var(--brand);color:var(--brand)}
.key.fn{font-size:13px;color:var(--ink2)}
.key:disabled{opacity:.45;cursor:not-allowed}

.primary{width:100%;max-width:252px;height:50px;border:0;border-radius:12px;background:var(--brand);color:#fff !important;font-size:16px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px}
.primary:hover:not(:disabled){background:var(--brand-d)}
.primary:disabled{opacity:.55;cursor:not-allowed}
.spin{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}

.or{display:flex;align-items:center;gap:10px;width:100%;margin:18px 0 8px;color:var(--ink2);font-size:12.5px;font-weight:600}
.or::before,.or::after{content:"";flex:1;height:1px;background:var(--line)}
.alt{border:1px solid var(--line);background:#fff;border-radius:10px;height:42px;padding:0 16px;font-weight:700;font-size:14px;display:inline-flex;align-items:center;gap:8px}
.alt:hover{border-color:var(--brand);color:var(--brand)}

.form{width:100%;max-width:300px;display:grid;gap:12px;margin:4px 0 16px}
.field{display:grid;gap:6px;font-size:12.5px;font-weight:700;color:var(--ink2)}
.inp{position:relative}
.inp svg.lead{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#9AA3B2}
.inp input{width:100%;height:46px;border:1.5px solid var(--line);border-radius:10px;padding:0 42px 0 38px;font:inherit;font-size:15px;color:var(--ink);background:#fff;user-select:text}
.inp input:focus{border-color:var(--brand);outline:none;box-shadow:0 0 0 4px var(--brand-2)}
.inp .eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:transparent;width:34px;height:34px;border-radius:8px;display:grid;place-items:center;color:#9AA3B2}
.caps{font-size:12px;color:#9A6400;font-weight:700}

.foot{display:flex;gap:18px;flex-wrap:wrap;justify-content:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--line);width:100%;font-size:12.5px;color:var(--ink2)}
.foot span{display:inline-flex;align-items:center;gap:5px}
.meta{font-size:11.5px;color:#9AA3B2;margin-top:8px;text-align:center}

/* responsive: 1024x768 and smaller POS terminals */
@media (max-width:1100px){.body{gap:24px;padding:0 4vw 20px}.feats{display:none}}
@media (max-width:900px){
 .body{grid-template-columns:1fr;align-content:center;overflow-y:auto;padding:10px 16px 20px}
 .intro{display:none}
}
@media (max-height:820px){
 .card{padding:18px 24px 14px}.logo .mark{width:36px;height:36px}.logo .word{font-size:24px}
 .card .sub{margin-bottom:10px}.pin{height:52px;width:50px}.key{height:50px}.pad{gap:8px;margin-bottom:12px}
 .primary{height:44px}.or{margin:12px 0 6px}.foot{margin-top:10px;padding-top:10px}
}
@media (max-height:640px){.foot,.meta,.card .sub{display:none}.card{padding:14px 22px 12px}.key{height:44px}.pad{grid-template-columns:repeat(3,68px)}}
@media (prefers-reduced-motion:reduce){.lg *{animation:none !important;transition:none !important}}
`;

/* ============================================================================
   COMPONENT
   ========================================================================== */
export default function PosLogin({ onLoginSuccess = (u) => console.log("Logged in:", u), api = mockAuthApi }) {
  const [mode, setMode] = useState("pin"); // "pin" | "password"
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [pressed, setPressed] = useState(null);
  const [now, setNow] = useState(new Date());
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [appInfo, setAppInfo] = useState({ version: "1.0.0", terminal: "POS-01" });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const userRef = useRef(null);

  const electron = typeof window !== "undefined" ? window.electronAPI : undefined;
  const lockLeft = Math.max(0, Math.ceil((lockedUntil - now.getTime()) / 1000));
  const locked = lockLeft > 0;

  // clock, connectivity, app info
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    electron?.getAppInfo?.().then((i) => i && setAppInfo((a) => ({ ...a, ...i }))).catch(() => { });
    return () => { clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [electron]);

  useEffect(() => { if (!locked && attempts >= CONFIG.maxAttempts) { setAttempts(0); setError(""); } }, [locked, attempts]);
  useEffect(() => { if (mode === "password") setTimeout(() => userRef.current?.focus(), 0); }, [mode]);

  const fail = (message) => {
    setError(message);
    setShake(true);
    setTimeout(() => setShake(false), 400);
  };

  const submitPin = useCallback(async (value = pin) => {
    if (loading || locked) return;
    if (value.length < CONFIG.pinMin) return fail(`Enter your PIN (at least ${CONFIG.pinMin} digits)`);
    setLoading(true); setError("");
    try {
      const user = await api.loginWithPin(value);
      setAttempts(0);
      onLoginSuccess(user);
    } catch (e) {
      const n = attempts + 1;
      setAttempts(n);
      setPin("");
      if (n >= CONFIG.maxAttempts) {
        setLockedUntil(Date.now() + CONFIG.lockSeconds * 1000);
        fail(`Too many attempts. Try again in ${CONFIG.lockSeconds} seconds.`);
      } else {
        fail(`${e?.message || "Login failed."} ${CONFIG.maxAttempts - n} attempt${CONFIG.maxAttempts - n === 1 ? "" : "s"} left.`);
      }
    } finally {
      setLoading(false);
    }
  }, [pin, loading, locked, attempts, api, onLoginSuccess]);

  const press = useCallback((k) => {
    if (loading || locked) return;
    setPressed(k); setTimeout(() => setPressed(null), 110);
    if (k === "clear") { setPin(""); setError(""); return; }
    if (k === "back") { setPin((p) => p.slice(0, -1)); setError(""); return; }
    if (k === "enter") { submitPin(); return; }
    setError("");
    setPin((p) => (p.length >= CONFIG.pinMax ? p : p + k));   // PINs differ in length: submit with Login / Enter
  }, [loading, locked, submitPin]);

  // physical keyboard / numpad support in PIN mode
  useEffect(() => {
    if (mode !== "pin") return;
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Delete" || e.key === "Escape") press("clear");
      else if (e.key === "Enter") press("enter");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, press]);

  const submitPassword = async (e) => {
    e?.preventDefault();
    if (loading) return;
    if (!username.trim() || !password) return fail("Enter your email and password");
    setLoading(true); setError("");
    try {
      const user = await api.loginWithPassword(username.trim(), password);
      onLoginSuccess(user);
    } catch (err) {
      setPassword("");
      fail(err?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m) => { setMode(m); setError(""); setPin(""); setPassword(""); };

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="lg">
      <style>{CSS}</style>

      {/* Title bar — draggable in a frameless Electron window */}
      <div className="tbar">
        <div className="t">
          <span>{appInfo.outlet || CONFIG.outlet}</span>
          <span className={`status ${online ? "on" : "off"}`}>{online ? <Wifi size={13} /> : <WifiOff size={13} />}{online ? "Online" : "Offline"}</span>
        </div>
        {electron?.isFrameless && (
          <div className="wc">
            <button onClick={() => electron.minimize?.()} aria-label="Minimize"><Minus size={15} /></button>
            <button onClick={() => electron.maximize?.()} aria-label="Maximize"><Square size={12} /></button>
            <button className="close" onClick={() => electron.close?.()} aria-label="Close"><X size={16} /></button>
          </div>
        )}
      </div>

      <div className="body">
        {/* Left: welcome */}
        <section className="intro">
          <h1>Welcome to <span>{CONFIG.brand}</span></h1>
          <div className="clock num">{time}</div>
          <div className="date">{date}</div>
          <p>{CONFIG.brand} is a cloud POS billing and business management software for restaurants, hospitality, food &amp; beverage, QSR, food trucks, food courts and caterers.</p>
          <p>It brings tablet ordering, self-ordering, online ordering and door delivery together in one system.</p>
          <div className="feats"><span>Dine in</span><span>Take away</span><span>Delivery</span><span>Kitchen display</span><span>Online orders</span></div>
        </section>

        {/* Right: login card */}
        <section className="card" aria-label="Sign in">
          <div className="logo">
            <span className="mark"><KeyRound size={22} /></span>
            <span className="word">{CONFIG.brand}</span>
          </div>

          {mode === "pin" ? (
            <>
              <h2>Sign into your account</h2>
              <p className="sub">Enter your staff PIN and press Login</p>

              <div className={`pins ${shake ? "shake" : ""}`} role="group" aria-label="PIN">
                {Array.from({ length: Math.max(CONFIG.pinMin, pin.length) }, (_, i) => {
                  const ch = pin[i];
                  const cls = error && !pin ? "err" : ch ? "filled" : i === pin.length && !locked ? "active" : "";
                  return (
                    <div key={i} className={`pin ${cls}`} aria-label={ch ? `Digit ${i + 1} entered` : `Digit ${i + 1} empty`}>
                      {ch ? (showPin ? <span className="num">{ch}</span> : <span className="dot" />) : null}
                    </div>
                  );
                })}
              </div>

              <div className="pin-tools">
                <button className="link-btn" onClick={() => setShowPin((v) => !v)} aria-pressed={showPin}>
                  {showPin ? <EyeOff size={14} /> : <Eye size={14} />}{showPin ? "Hide PIN" : "Show PIN"}
                </button>
                <button className="link-btn" onClick={() => press("back")} disabled={!pin} aria-label="Delete last digit">
                  <Delete size={15} />Delete
                </button>
              </div>

              <div className={`msg ${error ? "err" : "info"}`} role="alert">
                {locked ? <><Lock size={14} />Locked. Try again in <span className="num">{lockLeft}</span>s.</> : error ? <><ShieldAlert size={14} />{error}</> : ""}
              </div>

              <div className="pad">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                  <button key={k} className={`key num ${pressed === k ? "pressed" : ""}`} onClick={() => press(k)} disabled={loading || locked}>{k}</button>
                ))}
                <button className={`key fn ${pressed === "clear" ? "pressed" : ""}`} onClick={() => press("clear")} disabled={loading || locked}>Clear</button>
                <button className={`key num ${pressed === "0" ? "pressed" : ""}`} onClick={() => press("0")} disabled={loading || locked}>0</button>
                <button className={`key fn ${pressed === "back" ? "pressed" : ""}`} onClick={() => press("back")} disabled={loading || locked} aria-label="Backspace"><Delete size={20} /></button>
              </div>

              <button className="primary" onClick={() => submitPin()} disabled={loading || locked || pin.length < CONFIG.pinMin}>
                {loading ? <><Loader2 size={18} className="spin" />Signing in…</> : "Login"}
              </button>

              <div className="or">Or login with</div>
              <button className="alt" onClick={() => switchMode("password")}><User size={16} />Email and password</button>
            </>
          ) : (
            <>
              <h2>Sign in with password</h2>
              <p className="sub">Use your back-office email and password</p>

              <form className={`form ${shake ? "pins shake" : ""}`} onSubmit={submitPassword} style={{ display: "grid" }}>
                <label className="field">Email
                  <div className="inp"><User size={17} className="lead" />
                    <input ref={userRef} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" inputMode="email" disabled={loading} />
                  </div>
                </label>
                <label className="field">Password
                  <div className="inp"><Lock size={17} className="lead" />
                    <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock"))} autoComplete="current-password" disabled={loading} />
                    <button type="button" className="eye" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}>
                      {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {caps && <span className="caps">Caps Lock is on</span>}
                </label>
                <div className="msg err" role="alert" style={{ marginBottom: 0 }}>{error && <><ShieldAlert size={14} />{error}</>}</div>
                <button type="submit" className="primary" style={{ maxWidth: "none" }} disabled={loading}>
                  {loading ? <><Loader2 size={18} className="spin" />Signing in…</> : "Login"}
                </button>
              </form>

              <button className="alt" onClick={() => switchMode("pin")}><ArrowLeft size={16} />Back to PIN login</button>
            </>
          )}

          <div className="foot">
            <span><Globe size={13} />{CONFIG.website}</span>
            <span><Mail size={13} />{CONFIG.supportEmail}</span>
          </div>
          <div className="meta">Terminal {appInfo.terminal} · Version {appInfo.version}</div>
        </section>
      </div>
    </div>
  );
}