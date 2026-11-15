// Copies the built APK to release/ with a clear name, e.g. release/ReztraPOS-trial-3d-2026-11-13.apk
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'android/app/build/outputs/apk/release/app-release.apk');
if (!existsSync(src)) { console.error(`No APK at ${src}. Did the Gradle build fail?`); process.exit(1); }
const info = JSON.parse(readFileSync(join(root, 'src/build-info.json'), 'utf8'));
const version = (readFileSync(join(root, 'android/app/build.gradle'), 'utf8').match(/versionName\s+"([^"]+)"/) || [])[1] || '';
const day = new Date().toISOString().slice(0, 10);
const name = info.trialUntil ? `ReztraPOS-${version}-trial-${info.trialDays}d-${day}.apk` : `ReztraPOS-${version}-${day}.apk`;
mkdirSync(join(root, 'release'), { recursive: true });
copyFileSync(src, join(root, 'release', name));
console.log(`APK ready: release/${name}`);
if (info.trialUntil) console.log(`Trial ends: ${new Date(info.trialUntil).toLocaleString()}`);
