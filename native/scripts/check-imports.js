// Finds imports that point at something that doesn't exist.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(js|jsx|ts|tsx)$/.test(f)) files.push(p);
  }
})(path.join(root, 'src'));
files.push(path.join(root, 'index.js'));
const cache = new Map();
function exportsFor(file) {
  if (cache.has(file)) return cache.get(file);
  const s = fs.readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+(\w+)/g)) names.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(',').map((x) => x.trim().split(/\s+as\s+/).pop()).filter(Boolean).forEach((n) => names.add(n));
  if (/export\s+default/.test(s)) names.add('default');
  cache.set(file, names);
  return names;
}
function resolve(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, base + '.js', base + '.jsx', base + '.ts', base + '.tsx', path.join(base, 'index.js')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}
const lsrc = fs.readFileSync(path.join(root, 'node_modules/lucide-react-native/dist/esm/lucide-react-native.mjs'), 'utf8');
const lucide = new Set([...lsrc.matchAll(/\bas (\w+)\b/g)].map((m) => m[1]));
let bad = 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g)) {
    const [, def, named, spec] = m;
    const names = (named || '').split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    const rel = path.relative(root, f);
    if (spec === 'lucide-react-native') {
      names.filter((n) => !lucide.has(n)).forEach((n) => { bad++; console.log(rel + ': icon "' + n + '" does not exist'); });
      continue;
    }
    if (!spec.startsWith('.') || spec.endsWith('.json')) continue;
    const target = resolve(f, spec);
    if (!target) { bad++; console.log(rel + ': file not found: ' + spec); continue; }
    const ex = exportsFor(target);
    names.filter((n) => !ex.has(n)).forEach((n) => { bad++; console.log(rel + ': "' + n + '" is not exported by ' + path.relative(root, target)); });
    if (def && !ex.has('default')) { bad++; console.log(rel + ': ' + path.relative(root, target) + ' has no default export'); }
  }
}
console.log(bad ? '\n' + bad + ' problem(s) found.' : 'All imports OK.');
