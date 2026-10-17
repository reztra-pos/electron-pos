// Sends raw ESC/POS bytes (made on the server by Escposbuilder) straight to the printer,
// the same way the web app's print server (server.js, node-thermal-printer .raw()) does:
//
//   type "network"  -> tcp://printer_ip_address:printer_port      (default port 9100)
//   type "windows"  -> the shared printer //localhost/<path>      (share name of the printer in Windows)
//   any other type with a path (e.g. /dev/usb/lp0, COM port, \\server\share) -> written to that path
//
// printer = { type, printer_ip_address, printer_port, path }   (tbl_printers, as sent by the API)
const tcp = require("net");
const fs = require("fs/promises");

const TIMEOUT_MS = 8000;

function sendTcp(host, port, buf) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err) => { if (done) return; done = true; err ? reject(err) : resolve(true); };
    const sock = tcp.createConnection({ host, port });
    sock.setTimeout(TIMEOUT_MS);
    sock.on("connect", () => sock.end(buf));
    sock.on("close", (hadError) => { if (!hadError) finish(); });
    sock.on("timeout", () => { sock.destroy(); finish(new Error(`Printer ${host}:${port} did not answer. Is it switched on and on the network?`)); });
    sock.on("error", (e) => finish(new Error(`Printer ${host}:${port}: ${e.code === "ECONNREFUSED" ? "connection refused" : e.code === "EHOSTUNREACH" || e.code === "ENETUNREACH" ? "not reachable on the network" : e.message}`)));
  });
}

// "//localhost/POS80", "\\\\localhost\\POS80" or just "POS80" (share name) -> \\localhost\POS80
function windowsTarget(p) {
  const v = String(p || "").trim();
  if (/^(\\\\|\/\/)/.test(v)) return v.replace(/\//g, "\\");
  return `\\\\localhost\\${v}`;
}

async function printRaw(printer, base64) {
  if (!base64) throw new Error("Nothing to print.");
  if (!printer) throw new Error("No printer is set for this receipt in the web app.");
  const buf = Buffer.from(base64, "base64");
  const type = String(printer.type || "").toLowerCase();
  const ip = String(printer.printer_ip_address || "").trim();
  const pth = String(printer.path || "").trim();

  if (type === "network" || (!type && ip)) {
    if (!ip) throw new Error(`Printer "${printer.title || ""}" has no IP address (Printers, in the web app).`);
    return sendTcp(ip, Number(printer.printer_port) || 9100, buf);
  }
  if (type === "windows") {
    if (!pth) throw new Error(`Printer "${printer.title || ""}" has no share name (Printers -> path, in the web app).`);
    try { await fs.writeFile(windowsTarget(pth), buf); return true; }
    catch (e) { throw new Error(`Windows printer "${pth}" could not be reached (${e.code || e.message}). Share the printer in Windows with exactly this name.`); }
  }
  if (pth) {
    await fs.writeFile(pth, buf);
    return true;
  }
  throw new Error(`Printer "${printer.title || ""}" has no type / address set (Printers, in the web app).`);
}

module.exports = { printRaw };
