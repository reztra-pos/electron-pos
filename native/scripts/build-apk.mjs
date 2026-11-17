// Builds installable APKs: Reztra POS (com.reztra.self) and / or Reztra Waiter (com.reztra.waiter).
//   node scripts/build-apk.mjs <trial> <app>
//     trial: off (production, no end date) | 3 (stops working 3 days after it is built)
//     app:   both (default) | pos | waiter
//   npm run apk:prod     -> both apps, production
//   npm run apk:pos      -> only Reztra POS, production
//   npm run apk:waiter   -> only Reztra Waiter, production
//   npm run apk:trial    -> both apps, 3-day trial
// The APKs are copied to release/ with a clear name. src/build-info.json is always set back to "no trial"
// afterwards (also when the build fails), so a normal run-android never makes a trial by mistake.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'off';
const which = process.argv[3] || 'both';
const apps = which === 'both' ? ['pos', 'waiter'] : [which];
if (!apps.every((a) => a === 'pos' || a === 'waiter')) { console.error('App must be pos, waiter or both.'); process.exit(1); }
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const run = (cmd, args, cwd = root) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
};
let failed = false;
try {
  run('node', ['scripts/make-trial.mjs', mode]);
  run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', apps.map((a) => `assemble${cap(a)}Release`), join(root, 'android'));
  run('node', ['scripts/copy-apk.mjs', ...apps]);
} catch (e) {
  failed = true;
  console.error(`\nBuild failed: ${e.message}`);
} finally {
  if (mode !== 'off') run('node', ['scripts/make-trial.mjs', 'off']);
}
process.exit(failed ? 1 : 0);
