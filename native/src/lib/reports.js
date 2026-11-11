// A4 documents made on the device (same layout as the desktop app), printed or saved as PDF through
// Android's print screen (ReztraPrinter.printHtml -> "Save as PDF", a printer, or Google Drive).
import { C, isLoyaltyMethod } from './catalog';
import { money } from './format';

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Register report, A4: outlet header + per payment method + item / modifier wise sales (desktop app: registerA4Html).
export function registerA4Html(s) {
    const o = C.settings?.outlet || {};
    const logo = C.settings?.invoice?.logo_url || o.logo_url || "";
    const t = s.totals || {};
    const cur = esc(C.outlet.currency);
    const m2 = (v) => esc(money(v));
    const methods = (s.methods || []).filter((m) => !isLoyaltyMethod(m));
    const rows = (cells, cls = "") => `<tr class="${cls}">${cells.map((c, i) => `<td class="${i ? "r" : ""}">${c}</td>`).join("")}</tr>`;
    const sales = (title, first, list) => {
        if (!list?.length) return "";
        const q = list.reduce((a, r) => a + (Number(r.qty) || 0), 0), amt = list.reduce((a, r) => a + (Number(r.amount) || 0), 0);
        return `<h3>${esc(title)}</h3><table class="grid"><thead><tr><th>#</th><th>${esc(first)}</th><th class="r">Quantity</th><th class="r">Amount</th></tr></thead><tbody>
${list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td class="r">${esc(String(r.qty))}</td><td class="r">${m2(r.amount)}</td></tr>`).join("")}
<tr class="tot"><td></td><td>Total</td><td class="r">${esc(String(q))}</td><td class="r">${m2(amt)}</td></tr></tbody></table>`;
    };
    const info = [["Address", o.address], ["Phone", o.phone], ["Email", o.email], ["VAT No (TRN)", o.trn], ["CR No", o.cr_number]].filter(([, v]) => v);
    return `<!doctype html><html><head><meta charset="utf-8"><title>Register report</title><style>
@page{size:A4;margin:14mm 12mm}
@font-face{font-family:SaudiRiyal;src:url(data:font/woff2;base64,d09GMgABAAAAAAT0AA0AAAAAC2QAAASeAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP0ZGVE0cGhgGYACCZhEICocEhXcLGgABNgIkAzAEIAWHLgeBBRvVCSCOwnEvSojJ5ORhKiWep9/bPPc32mdnUaW+wXeJKlVIJCg8CIfcQWViVHSETJeZqNqErgZPp/28VaAy13pTkXvNQZv4IHCbHD9In+dyevP5Cfy7K+slmC3ybGwuLx2T18L1PKA2pnPbFCvQCdbLLSJq0N0AB31thACv29f9APD1k6ZUJ0tAD4aoQDO8bhmyFC1UI+oCuAO15AO2Q8G5MwSqDefwClCi9Be6wX9nQPsMEKAeA1AQUIMaLCGACzQCljAqQE+OwoCjcu0D6kv8/x/sl6sfkIpP/3/9/WpgdgoEQAeYoIR0QACkAlSghuJ31w3LAXyr/P+vAvSAOTCAzAK5B6CBQzRNhcGgGoYLL+dYrlnFKgu9iOcEj646uXaI2W3sJ9lTI4EetCRQAgulmH6SYMZBziQb1xBipCaQaS6l0vWRWr1q1aFDnTA52r1fr8fUTpXKWvLQ4KnSwb0+PppFHxtVC1at2uXrO9JOSIUWTzV+QWdXLT0K2uhG0jpJEiZs6WjSR9KuG9Zv1u+P2q1UujpcsT1L3dNzqhQszNevVtPHSYnHKlXoGEWtDpi6yX/duUgVJGGvzwIypcpt/Ni4Jly1atcq32n6zc+V4+ld7k6gz53h7vgOHLKN10L3KkUS7kouYUcPhGVony1zOi//ctkTdm/3kAqubk+P0MptoSFlXH1d5ZyIwuAyWX7+z+picypWzAjs1xCbVaGJLgqt5qqbqg/Y6ntEjm76aneF9Yjvano5HXrdrjSkllfHmVOk+o/IY8O89mBNc9Lbwcoe28z7DRmFzSmN4wbrT5X+B/E2SdMQn2S1PFaUu1OkJfIXKxVt+w1pFa2xjdll47yrvsvczl7/4ETotcmj56Zkzxs3b+7w0ZMNx9wX7srQ8rIsghhH+yj839cG7rwS/FVUQnWXgYUdjUP+HL5C8fybvBJ6ZQRWMKOhfsi7ZqHZEz4e3TZxMtEqXR8kGN0n/5/a9jk9IKKiFlmPtlWvYKy8rF34efCtxR9snP0uNWnu7Jj8kj9HHV1INdJDNT2jhozoFXwqYPLE+VjfWDBpsq7FUrJmU3brXPVwppI6gm8PCAjcX9RU3FdX8KtcJcczkIBc+4K9C8ZdxNPL/LtD9KcF19fLgOpBtODVPMNO+5d0/C2p2BEBPefddskgYA8Aa9mMABgKQwChUg9RkbGjprcJDW9v0SJ+QccrQRhDkk6Os7mYoEtPTCIZQk6xo9ALyCFMI3lIDtjnGFLlm9EzZJUcNNIoAAUACL10ULSMoCUYAkaUk2BRfgAnwm+QoZJMytlMKIQkH0pUBpAqdhjUMjIGGlTuklr2MTzoI92UJ23+wONVGmQ40WC8UgM5iCwsRBYopXLQcHEwXzrQIVosogW4IRrFwqmv4ZzGEQ2Em8tRFmff4c5x4kDgmpXdKAOJhsMnRWOAIg8/SVZ+YGXZ5ee18vMkZYbYopod2PHxMh22lbggxy4aiTp8UzunkRxGMUliNsQgyayTKk8k+l05RzpGmT7YjNb5FSWKKTxHRVTCPj0ISoRIUaJDEZowhCWctufXnHPwkJG/e0pZDQA=) format("woff2");unicode-range:U+20C1,U+E900}
*{box-sizing:border-box}body{font:11.5px/1.45 SaudiRiyal,"Segoe UI",Tahoma,Arial,"Noto Sans Arabic",sans-serif;color:#1d2433;margin:0}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #5b3fd1;padding-bottom:10px}
.head img{max-height:62px;max-width:170px;object-fit:contain}
.firm h1{margin:0;font-size:20px}.firm .ar{font-size:15px;direction:rtl;text-align:start}.firm .out{color:#5a6478;font-weight:600;margin-top:2px}
.kv{margin-top:6px;display:grid;grid-template-columns:auto 1fr;gap:1px 10px;font-size:10.5px;color:#3b4456}.kv b{font-weight:600;color:#5a6478}
.title{display:flex;justify-content:space-between;align-items:flex-end;margin:14px 0 8px}
.title h2{margin:0;font-size:17px}.title .ar{font-size:14px;color:#5a6478}
.meta{display:grid;grid-template-columns:1.1fr 1.3fr 1.3fr .8fr;gap:8px;margin-bottom:12px}
.meta div{background:#f3f4f8;border-radius:6px;padding:7px 9px;min-width:0}.meta span{display:block;font-size:9.5px;color:#5a6478;text-transform:uppercase;letter-spacing:.04em}.meta b{font-size:11.5px;white-space:nowrap}
h3{font-size:13px;margin:16px 0 6px;color:#3f2a9e}
table{width:100%;border-collapse:collapse}
.grid th{background:#eeeaff;color:#3f2a9e;text-align:start;padding:6px 8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em}
.grid td{padding:5px 8px;border-bottom:1px solid #e4e7ee}
.r{text-align:end !important}.tot td{font-weight:700;border-top:2px solid #1d2433;border-bottom:none}
.pm{page-break-inside:avoid}
.summary{margin-top:14px;margin-inline-start:auto;width:52%}
.summary td{padding:5px 8px;border-bottom:1px solid #e4e7ee}.summary .big td{font-size:15px;font-weight:800;border-bottom:none;border-top:2px solid #1d2433}
.foot{margin-top:24px;display:flex;justify-content:space-between;color:#8a93a6;font-size:9.5px;border-top:1px solid #e4e7ee;padding-top:6px}
.sign{margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:40px}.sign div{border-top:1px solid #1d2433;padding-top:4px;text-align:center;font-size:10.5px;color:#5a6478}
</style></head><body>
<div class="head">
  <div class="firm">
    <h1>${esc(o.firm_name_1 || o.name || "")}</h1>
    ${o.firm_name_2 ? `<div class="ar">${esc(o.firm_name_2)}</div>` : ""}
    <div class="out">${esc(o.name || "")}${o.code ? ` · ${esc(o.code)}` : ""}</div>
    <div class="kv">${info.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join("")}</div>
  </div>
  ${logo ? `<img src="${esc(logo)}" alt="">` : ""}
</div>
<div class="title"><h2>Register Report</h2><span class="ar">تقرير السجل النقدي</span></div>
<div class="meta">
  <div><span>User</span><b>${esc(s.user || "")}</b></div>
  <div><span>Opened</span><b>${esc(s.opened_at || "")}</b></div>
  <div><span>${s.closed_at ? "Closed" : "Printed"}</span><b>${esc(s.closed_at || new Date().toLocaleString())}</b></div>
  <div><span>Status</span><b>${s.status === "closed" ? "Closed" : "Open"}</b></div>
</div>
<h3>Payment methods</h3>
<table class="grid"><thead><tr><th>Payment method</th><th class="r">Opening</th><th class="r">Sales</th>${Number(t.pre_order) ? `<th class="r">Pre-order payment</th>` : ""}<th class="r">Due received</th><th class="r">Purchase</th><th class="r">Due paid</th><th class="r">Expense</th><th class="r">Refund</th><th class="r">Closing</th></tr></thead><tbody>
${methods.map((m) => rows([esc(m.name), m2(m.opening), m2(m.sale), ...(Number(t.pre_order) ? [m2(m.pre_order)] : []), m2(m.due_receive), m2(m.purchase), m2(m.due_payment), m2(m.expense), m2(m.refund), `<b>${m2(m.closing)}</b>`], "pm")).join("")}
${rows(["Total", m2(t.opening), m2(t.sale), ...(Number(t.pre_order) ? [m2(t.pre_order)] : []), m2(t.due_receive), m2(t.purchase), m2(t.due_payment), m2(t.expense), m2(t.refund), m2(t.closing)], "tot")}
</tbody></table>
<table class="summary"><tbody>
<tr><td>Opening balance</td><td class="r">${m2(t.opening)}</td></tr>
<tr><td>Sales</td><td class="r">${m2(t.sale)}</td></tr>
${Number(t.pre_order) ? `<tr><td>Pre-order payment</td><td class="r">${m2(t.pre_order)}</td></tr>` : ""}
${Number(t.due_receive) ? `<tr><td>Due received</td><td class="r">${m2(t.due_receive)}</td></tr>` : ""}
${Number(t.purchase) ? `<tr><td>Purchase</td><td class="r">-${m2(t.purchase)}</td></tr>` : ""}
${Number(t.due_payment) ? `<tr><td>Due paid</td><td class="r">-${m2(t.due_payment)}</td></tr>` : ""}
${Number(t.expense) ? `<tr><td>Expense</td><td class="r">-${m2(t.expense)}</td></tr>` : ""}
${Number(t.refund) ? `<tr><td>Refund</td><td class="r">-${m2(t.refund)}</td></tr>` : ""}
<tr class="big"><td>Closing balance</td><td class="r">${cur} ${m2(t.closing)}</td></tr>
</tbody></table>
${sales("Item wise sales", "Food menu", s.item_sales)}
${sales("Modifier wise sales", "Modifier", s.modifier_sales)}
<div class="sign"><div>Cashier</div><div>Manager</div></div>
<div class="foot"><span>${esc(o.name || "")} — Register report</span><span>Generated ${esc(new Date().toLocaleString())} · Reztra POS</span></div>
</body></html>`;
}