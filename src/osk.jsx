// On-screen keyboard for touch POS terminals without a physical keyboard.
//
// Tap any input or text box -> a popup opens:
//   - number fields (type=number, inputMode numeric/decimal, tel)  -> number pad only
//   - every other text field / text area                         -> full keyboard: English (shift / caps),
//                                                                    Arabic, numbers & symbols
// What you type goes straight into the field (live), so search boxes filter while you type.
// "Done" keeps it, "Cancel" / X puts the old text back. A physical keyboard still works while it is open.
// Switch it off on PCs with a real keyboard: main menu -> "On-screen keyboard" (kept on this PC).
// A field can opt out with data-osk="off".
import React, { useCallback, useEffect, useRef, useState } from "react";
import { tr } from "./i18n.js";

const KEY = "pos.osk";
const subs = new Set();
const readOn = () => { try { return localStorage.getItem(KEY) !== "false"; } catch { return true; } };
export function setOskEnabled(on) {
  try { localStorage.setItem(KEY, on ? "true" : "false"); } catch { /* ignore */ }
  subs.forEach((fn) => fn(on));
}
export function useOskEnabled() {
  const [on, setOn] = useState(readOn);
  useEffect(() => { subs.add(setOn); return () => subs.delete(setOn); }, []);
  return [on, setOskEnabled];
}

// screens can open the keyboard for a field themselves, e.g. the price of an open-price item as soon as its popup opens
let opener = null;
export const openKeyboard = (el) => setTimeout(() => opener?.(el), 60);

const SKIP_TYPES = new Set(["checkbox", "radio", "file", "range", "date", "time", "datetime-local", "month", "week", "color", "hidden", "submit", "button", "reset", "image"]);
const isNumeric = (el) => el.tagName === "INPUT" && (el.type === "number" || el.type === "tel" || ["numeric", "decimal", "tel"].includes(el.inputMode));
const allowDot = (el) => !(el.inputMode === "numeric" || el.type === "tel" || (el.step && el.step !== "any" && !String(el.step).includes(".") && Number(el.step) >= 1));

// write into a React-controlled field: native setter + "input" event, so onChange runs
function writeValue(el, v) {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
function labelOf(el) {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria;
  const lab = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest("label");
  const txt = lab ? [...lab.childNodes].filter((n) => n.nodeType === 3 || (n.nodeType === 1 && !/INPUT|TEXTAREA|SELECT/.test(n.tagName))).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim() : "";
  return (txt || el.placeholder || el.name || "").slice(0, 70);
}

const EN = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
const AR = ["1234567890", "ضصثقفغعهخحجد", "شسيبلاتنمكط", "ئءؤر|لا|ىةوزظذ"];
const SYM = ["1234567890", "@#$%&*-+=/", "()'\":;!?,.", "_\\|~<>[]{}"];
const split = (row) => (row.includes("|") ? row.split("|").flatMap((part, i) => (i === 1 ? [part] : [...part])) : [...row]);

export default function OnScreenKeyboard() {
  const [on] = useOskEnabled();
  const [st, setSt] = useState(null);   // { el, kind, value, original, label, multi, password, dot, max }
  const [layout, setLayout] = useState("en");
  const [shift, setShift] = useState(false);
  const [caps, setCaps] = useState(false);
  const ref = useRef(null);
  ref.current = st;

  // open on tap / click of a field (or when a screen asks for it: openKeyboard(el))
  useEffect(() => {
    const openFor = (el) => {
      if (!readOn() || !el || !document.contains(el)) return;     // setting is read every time (main menu switch)
      if (el.closest("[data-osk-root]") || el.dataset.osk === "off" || el.disabled || el.readOnly) return;
      if (el.tagName === "INPUT" && SKIP_TYPES.has(el.type)) return;
      const kind = isNumeric(el) ? "num" : "text";
      setSt({ el, kind, value: el.value, original: el.value, label: labelOf(el), multi: el.tagName === "TEXTAREA",
        password: el.type === "password", dot: kind === "num" && allowDot(el), max: el.maxLength > 0 ? el.maxLength : 0 });
      setShift(false);
      if (kind === "text") setLayout(document.documentElement.lang === "ar" || el.dir === "rtl" || /arabic|عرب/i.test(labelOf(el)) ? "ar" : "en");
      el.blur();
    };
    const onClick = (e) => { const el = e.target?.closest?.("input, textarea"); if (el) openFor(el); };
    document.addEventListener("click", onClick, true);
    opener = openFor;
    return () => { document.removeEventListener("click", onClick, true); if (opener === openFor) opener = null; };
  }, []);
  useEffect(() => { if (!on) setSt(null); }, [on]);

  const set = useCallback((v) => {
    const s = ref.current;
    if (!s) return;
    if (s.max && v.length > s.max) v = v.slice(0, s.max);
    if (s.kind === "num") {
      // a number field can't hold "12." — keep the dot in the popup, send "12" until the next digit
      const clean = v.replace(/\.$/, "");
      if (clean === "" || clean === "-" || !Number.isNaN(Number(clean))) writeValue(s.el, clean === "-" ? "" : clean);
    } else writeValue(s.el, v);
    setSt({ ...s, value: v });
  }, []);
  const close = useCallback((keep) => {
    const s = ref.current;
    if (!s) return;
    if (!keep) writeValue(s.el, s.original);
    else if (s.kind === "num") writeValue(s.el, s.value.replace(/\.$/, ""));
    setSt(null);
    // fields that check themselves when you leave them (e.g. activation key) run their check now
    if (keep && document.contains(s.el)) { s.el.focus({ preventScroll: true }); s.el.blur(); }
  }, []);

  const type = useCallback((ch) => {
    const s = ref.current;
    if (!s) return;
    if (s.kind === "num") {
      if (ch === "." && (!s.dot || s.value.includes("."))) return;
      if (!/[0-9.]/.test(ch) && !(s.el.type === "tel" && /[+]/.test(ch))) return;
      set(s.value === "0" && ch !== "." ? ch : s.value + ch);
      return;
    }
    set(s.value + ch);
    if (shift && !caps) setShift(false);
  }, [set, shift, caps]);
  const back = useCallback(() => { const s = ref.current; if (s) set([...s.value].slice(0, -1).join("")); }, [set]);

  // physical keyboard while the popup is open
  useEffect(() => {
    if (!st) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.stopPropagation(); e.preventDefault();
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter") { if (ref.current?.multi && e.shiftKey) type("\n"); else close(true); }
      else if (e.key === "Backspace") back();
      else if (e.key.length === 1) type(e.key);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [st, close, back, type]);

  if (!st) return null;
  const shown = st.password ? "•".repeat(st.value.length) : st.value;
  const upper = shift || caps;
  const rows = (layout === "sym" ? SYM : layout === "ar" ? AR : EN).map(split);
  const paste = async () => { try { const t = await navigator.clipboard.readText(); if (t) set(ref.current.value + t.trim()); } catch { /* not allowed */ } };

  return (
    <div className="osk-wrap" data-osk-root onMouseDown={(e) => { if (e.target === e.currentTarget) close(true); }}>
      <style>{OSK_CSS}</style>
      <div className={`osk ${st.kind}`} role="dialog" aria-label={st.kind === "num" ? tr("Number pad") : tr("Keyboard")}>
        <div className="osk-head">
          <span className="osk-label">{st.label}</span>
          <button className="osk-x" onClick={() => close(false)} aria-label={tr("Cancel")}>✕</button>
        </div>
        <div className={`osk-value ${st.multi ? "multi" : ""}`} dir="auto" aria-live="polite">{shown || <span className="osk-ph">{st.el.placeholder || ""}</span>}<span className="osk-caret" /></div>

        {st.kind === "num" ? (
          <div className="osk-pad">
            {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((k) => <button key={k} onClick={() => type(k)}>{k}</button>)}
            {st.dot ? <button onClick={() => type(".")}>.</button> : st.el.type === "tel" ? <button onClick={() => type("+")}>+</button> : <span />}
            <button onClick={() => type("0")}>0</button>
            <button className="fn" onClick={back} aria-label="Backspace">⌫</button>
            <button className="fn wide" onClick={() => set("")}>{tr("Clear")}</button>
            <button className="ok wide" onClick={() => close(true)}>{tr("Done")}</button>
          </div>
        ) : (
          <div className="osk-keys" dir="ltr">
            {rows.map((r, i) => (
              <div key={i} className="osk-row">
                {i === 3 && layout === "en" && <button className={`fn ${upper ? "on" : ""}`} onClick={() => (shift ? (caps ? (setCaps(false), setShift(false)) : setCaps(true)) : setShift(true))}
                  onDoubleClick={() => { setCaps(true); setShift(true); }} aria-label="Shift">{caps ? "⇪" : "⇧"}</button>}
                {r.map((k) => {
                  const ch = layout === "en" && upper ? k.toUpperCase() : k;
                  return <button key={k} onClick={() => type(ch)}>{ch}</button>;
                })}
                {i === 3 && <button className="fn" onClick={back} aria-label="Backspace">⌫</button>}
              </div>
            ))}
            <div className="osk-row">
              <button className="fn" onClick={() => setLayout(layout === "sym" ? "en" : "sym")}>{layout === "sym" ? "ABC" : "?123"}</button>
              <button className="fn" onClick={() => setLayout(layout === "ar" ? "en" : "ar")}>{layout === "ar" ? "EN" : "ع"}</button>
              <button onClick={() => type(",")}>,</button>
              <button className="space" onClick={() => type(" ")} aria-label="Space">{tr("space")}</button>
              <button onClick={() => type(".")}>.</button>
              {st.multi && <button className="fn" onClick={() => type("\n")} aria-label="New line">↵</button>}
              <button className="fn" onClick={paste}>{tr("Paste")}</button>
              <button className="fn" onClick={() => set("")}>{tr("Clear")}</button>
              <button className="ok" onClick={() => close(true)}>{tr("Done")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const OSK_CSS = `
.osk-wrap{--k-panel:#FFFFFF;--k-key:#F1F3F7;--k-key2:#DFE3EB;--k-ink:#1D2433;--k-ink2:#5A6478;--k-line:#DCE1E8;--k-brand:#5B3FD1;--k-ok:#1E9E6A;
 position:fixed;inset:0;z-index:1000;background:rgba(18,22,34,.35);display:flex;align-items:flex-end;justify-content:center;padding:10px;
 font-family:Manrope,"Noto Sans Arabic",Tahoma,system-ui,"Segoe UI",sans-serif;-webkit-user-select:none;user-select:none}
:root[data-theme=dark] .osk-wrap{--k-panel:#1A202B;--k-key:#2A3242;--k-key2:#364052;--k-ink:#E8ECF3;--k-ink2:#A3ADBF;--k-line:#2E3746;--k-brand:#8B74F0;--k-ok:#2AA876;background:rgba(0,0,0,.5)}
.osk{background:var(--k-panel);color:var(--k-ink);border-radius:16px;box-shadow:0 -10px 40px rgba(0,0,0,.25);padding:12px;width:100%;max-width:980px}
.osk.num{max-width:360px;align-self:center}
.osk-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.osk-label{font-weight:700;font-size:14px;color:var(--k-ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.osk-x{border:0;background:var(--k-key);color:var(--k-ink);width:38px;height:38px;border-radius:10px;font-size:16px;cursor:pointer}
.osk-value{min-height:52px;border:2px solid var(--k-brand);border-radius:12px;padding:10px 14px;font-size:22px;font-weight:700;margin-bottom:10px;
 word-break:break-all;white-space:pre-wrap;max-height:110px;overflow:auto;unicode-bidi:plaintext;text-align:start}
.osk-value.multi{min-height:76px;font-size:18px}
.osk-ph{color:var(--k-ink2);font-weight:500;opacity:.7}
.osk-caret{display:inline-block;width:2px;height:1.1em;background:var(--k-brand);vertical-align:text-bottom;margin-inline-start:2px;animation:oskblink 1s steps(1) infinite}
@keyframes oskblink{50%{opacity:0}}
.osk button{font-family:inherit;cursor:pointer;border:1px solid var(--k-line);background:var(--k-key);color:var(--k-ink);border-radius:10px;font-weight:700;touch-action:manipulation}
.osk button:active{transform:scale(.96);background:var(--k-key2)}
.osk button.fn{background:var(--k-key2)}
.osk button.fn.on{background:var(--k-brand);color:#fff;border-color:var(--k-brand)}
.osk button.ok{background:var(--k-ok);border-color:var(--k-ok);color:#fff}
.osk-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.osk-pad button{height:62px;font-size:24px}
.osk-pad button.wide{font-size:17px}
.osk-pad .wide:first-of-type{grid-column:span 1}
.osk-pad button.ok.wide{grid-column:span 2}
.osk-keys{display:grid;gap:7px}
.osk-row{display:flex;gap:6px;justify-content:center}
.osk-row button{flex:1 1 0;min-width:0;height:54px;font-size:20px;max-width:84px}
.osk-row button.fn,.osk-row button.ok{font-size:15px;max-width:110px}
.osk-row button.space{flex:5 1 0;max-width:none;font-size:14px;color:var(--k-ink2)}
@media(max-height:620px){.osk-row button{height:44px;font-size:17px}.osk-pad button{height:50px}}
`;