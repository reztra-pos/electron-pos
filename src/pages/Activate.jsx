/**
 * First-run screen: paste the device API key generated in the web app (Settings -> POS Devices).
 * The key is decrypted inside Electron (main process) and the device is registered with the server.
 * Also shown when the device was disabled in the web app ("notice" says why).
 */
import React, { useState } from "react";
import { KeyRound, Server, Monitor, Store, Loader2, ShieldAlert, CheckCircle2, ClipboardPaste, CalendarClock } from "lucide-react";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
.act{--ink:#1D2433;--ink2:#5A6478;--line:#DCE1E8;--brand:#5B3FD1;--brand-2:#EEE9FF;--brand-d:#3F2A9E;--danger:#DC3F35;--ok:#1E9E6A;
 font-family:Manrope,system-ui,"Segoe UI",sans-serif;color:var(--ink);background:#EEF0F5;height:100vh;display:grid;place-items:center;padding:20px;overflow:auto}
.act *{box-sizing:border-box}
.act .card{width:100%;max-width:560px;background:#fff;border:1px solid var(--line);border-radius:18px;padding:28px;box-shadow:0 20px 50px rgba(30,36,60,.08)}
.act .head{display:flex;gap:14px;align-items:center;margin-bottom:6px}
.act .mark{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#6A4BE6,#9A3FB8);display:grid;place-items:center;color:#fff;flex:none}
.act h1{margin:0;font-size:22px;font-weight:800}
.act p{margin:4px 0 0;color:var(--ink2);font-size:14px;line-height:1.5}
.act ol{margin:16px 0 18px;padding-left:20px;color:var(--ink2);font-size:13.5px;line-height:1.7}
.act label{display:block;font-size:12.5px;font-weight:700;color:var(--ink2);margin-bottom:6px}
.act textarea{width:100%;min-height:110px;border:1.5px solid var(--line);border-radius:10px;padding:12px;font:500 13px ui-monospace,Consolas,monospace;color:var(--ink);resize:vertical;word-break:break-all}
.act textarea:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 4px var(--brand-2)}
.act .row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.act button{font-family:inherit;cursor:pointer;height:46px;border-radius:10px;padding:0 18px;font-weight:800;font-size:14.5px;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:#F4F5F9;color:var(--ink)}
.act button.primary{background:var(--brand);border-color:var(--brand);color:#fff;flex:1;justify-content:center}
.act button.primary:hover:not(:disabled){background:var(--brand-d)}
.act button:disabled{opacity:.55;cursor:not-allowed}
.act .msg{margin-top:12px;font-size:13.5px;font-weight:600;display:flex;gap:8px;align-items:flex-start}
.act .msg.err{color:var(--danger)}.act .msg.ok{color:var(--ok)}
.act .info{margin-top:14px;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.act .info div{display:flex;gap:10px;align-items:center;padding:10px 12px;font-size:13.5px;border-bottom:1px solid #EEF1F5}
.act .info div:last-child{border:0}
.act .info span{color:var(--ink2);min-width:84px}
.act .info b{word-break:break-all}
.act .spin{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
`;

export default function Activate({ onActivated, notice = "" }) {
  const api = window.electronAPI;
  const [key, setKey] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");

  const check = async (value = key) => {
    setError(""); setPreview(null);
    if (!value.trim()) return;
    try { setPreview(await api.device.preview(value)); } catch (e) { setError(e.message); }
  };

  const paste = async () => {
    try { const t = await navigator.clipboard.readText(); setKey(t); check(t); } catch { setError("Couldn't read the clipboard. Paste with Ctrl+V."); }
  };

  const activate = async () => {
    setBusy(true); setError("");
    try {
      setStep("Connecting to the server…");
      const info = await api.device.activate(key);
      setStep("");
      onActivated(info);
    } catch (e) {
      setError(e.message); setStep("");
    } finally { setBusy(false); }
  };

  return (
    <div className="act">
      <style>{CSS}</style>
      <section className="card" aria-label="Activate this device">
        <div className="head">
          <span className="mark"><KeyRound size={24} /></span>
          <div><h1>Activate this POS</h1><p>Connect this computer to your outlet with a device key.</p></div>
        </div>
        {notice && <div className="msg err" role="alert" style={{ marginTop: 14 }}><ShieldAlert size={16} />{notice}</div>}
        <ol>
          <li>In the web app, open <b>Settings → POS Devices</b> and add this till (or click <b>Generate key</b> on an existing one).</li>
          <li>Click <b>Copy key</b>.</li>
          <li>Paste it below and click <b>Activate</b>.</li>
        </ol>

        <label htmlFor="key">Device API key</label>
        <textarea id="key" value={key} placeholder="RZT1.xxxxxxxx…" spellCheck={false} disabled={busy}
          onChange={(e) => { setKey(e.target.value); setPreview(null); setError(""); }}
          onPaste={(e) => { const t = e.clipboardData.getData("text").trim(); if (t) { e.preventDefault(); setKey(t); check(t); } }}
          onBlur={() => check()} />

        {preview && (
          <div className="info">
            <div><Server size={16} /><span>Server</span><b>{preview.url}</b></div>
            <div><Monitor size={16} /><span>Device ID</span><b>{preview.device_id}</b></div>
            {preview.outlet_id && <div><Store size={16} /><span>Outlet</span><b>{preview.outlet_id}</b></div>}
            {preview.expires && <div><CalendarClock size={16} /><span>Key expires</span><b>{new Date(preview.expires).toLocaleString()}</b></div>}
          </div>
        )}

        {error && <div className="msg err" role="alert"><ShieldAlert size={16} />{error}</div>}
        {step && <div className="msg" role="status"><Loader2 size={16} className="spin" />{step}</div>}
        {preview && !error && !busy && <div className="msg ok"><CheckCircle2 size={16} />Key is valid. Click Activate to connect.</div>}

        <div className="row">
          <button onClick={paste} disabled={busy}><ClipboardPaste size={17} />Paste</button>
          <button className="primary" onClick={activate} disabled={busy || !preview}>
            {busy ? <><Loader2 size={18} className="spin" />Activating…</> : "Activate"}
          </button>
        </div>
      </section>
    </div>
  );
}