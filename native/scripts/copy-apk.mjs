// Copies the built APKs to release/ with a clear name, e.g.
//   release/ReztraPOS-1.0.0-2026-11-16.apk
//   release/ReztraWaiter-1.0.0-trial-3d-2026-11-16.apk
//   node scripts/copy-apk.mjs pos waiter
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apps = process.argv.slice(2).length ? process.argv.slice(2) : ['pos', 'waiter'];
const NAME = { pos: 'ReztraPOS', waiter: 'ReztraWaiter' };
const info = JSON.parse(readFileSync(join(root, 'src/build-info.json'), 'utf8'));
const version = (readFileSync(join(root, 'android/app/build.gradle'), 'utf8').match(/versionName\s+"([^"]+)"/) || [])[1] || '';
const day = new Date().toISOString().slice(0, 10);
mkdirSync(join(root, 'release'), { recursive: true });
let missing = false;
for (const a of apps) {
  const src = join(root, `android/app/build/outputs/apk/${a}/release/app-${a}-release.apk`);
  if (!existsSync(src)) { console.error(`No APK at ${src}. Did the Gradle build fail?`); missing = true; continue; }
  const name = info.trialUntil ? `${NAME[a]}-${version}-trial-${info.trialDays}d-${day}.apk` : `${NAME[a]}-${version}-${day}.apk`;
  copyFileSync(src, join(root, 'release', name));
  console.log(`APK ready: release/${name}`);
}
if (info.trialUntil) console.log(`Trial ends: ${new Date(info.trialUntil).toLocaleString()}`);
process.exit(missing ? 1 : 0);
