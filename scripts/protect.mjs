// Production protection step (runs after "vite build", before electron-builder):
//   1. renderer: obfuscate dist/assets/*.js in place (dist is build output only)
//   2. main process: obfuscate electron/*.cjs into build/app-electron/ — the source in electron/ is NOT touched;
//      electron-builder packs build/app-electron as "electron" (see package.json build.files)
//   3. no source maps are shipped
// Obfuscation makes the code very hard to read and change; it is not encryption (nothing running on a PC can be
// fully hidden), so secrets and rules that matter stay on the server.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import JavaScriptObfuscator from "javascript-obfuscator";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const common = {
  compact: true,
  identifierNamesGenerator: "hexadecimal",
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.8,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  numbersToExpressions: true,
  simplify: true,
  renameGlobals: false,          // keep module / browser globals working
  selfDefending: false,          // breaks with some minifiers; not needed
  sourceMap: false,
};
// renderer: big React bundle — no control-flow flattening (keeps the POS screen fast)
const rendererOpts = { ...common, target: "browser", controlFlowFlattening: false, deadCodeInjection: false };
// main process: small files — stronger settings
const mainOpts = { ...common, target: "node", controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.5, deadCodeInjection: true, deadCodeInjectionThreshold: 0.2 };

const kb = (n) => (n / 1024).toFixed(0) + " KB";
const obf = (src, opts) => JavaScriptObfuscator.obfuscate(src, opts).getObfuscatedCode();

// 1. renderer
const assets = path.join(root, "dist", "assets");
if (!fs.existsSync(assets)) { console.error("dist/assets not found — run vite build first."); process.exit(1); }
for (const f of fs.readdirSync(assets)) {
  const p = path.join(assets, f);
  if (f.endsWith(".map")) { fs.rmSync(p); continue; }
  if (!f.endsWith(".js")) continue;
  const src = fs.readFileSync(p, "utf8");
  fs.writeFileSync(p, obf(src, rendererOpts));
  console.log(`renderer  ${f}  ${kb(src.length)} -> ${kb(fs.statSync(p).size)}`);
}

// 2. main process -> build/app-electron
const from = path.join(root, "electron");
const to = path.join(root, "build", "app-electron");
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });
for (const f of fs.readdirSync(from)) {
  const s = path.join(from, f), d = path.join(to, f);
  if (fs.statSync(s).isDirectory()) { fs.cpSync(s, d, { recursive: true }); continue; }
  if (f.endsWith(".cjs") || f.endsWith(".js")) {
    fs.writeFileSync(d, obf(fs.readFileSync(s, "utf8"), mainOpts));
    console.log(`main      ${f}`);
  } else {
    fs.copyFileSync(s, d);       // e.g. build-info.json (testing build)
  }
}
console.log("Protected build ready.");
