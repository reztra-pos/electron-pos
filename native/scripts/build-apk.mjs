// Builds an installable APK.
//   npm run apk:trial   -> trial build: stops working 3 days after it is built (node scripts/build-apk.mjs 3)
//   npm run apk:prod    -> production build, no end date                       (node scripts/build-apk.mjs off)
// The APK is copied to release/ with a clear name. src/build-info.json is always set back to "no trial"
// afterwards (also when the build fails), so `npx react-native run-android` never makes a trial by mistake.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'off';
const run = (cmd, args, cwd = root) => {
    const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
};
let failed = false;
try {
    run('node', ['scripts/make-trial.mjs', mode]);
    run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleRelease'], join(root, 'android'));
    run('node', ['scripts/copy-apk.mjs']);
} catch (e) {
    failed = true;
    console.error(`\nBuild failed: ${e.message}`);
} finally {
    if (mode !== 'off') run('node', ['scripts/make-trial.mjs', 'off']);
}
process.exit(failed ? 1 : 0);
