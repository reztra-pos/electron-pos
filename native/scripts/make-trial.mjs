// Trial builds (same idea as the desktop app's scripts/make-trial.mjs).
//   node scripts/make-trial.mjs 3      -> this build stops working 3 days after it is built
//   node scripts/make-trial.mjs off    -> normal (production) build, no end date
// Writes src/build-info.json, which is bundled into the app.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const arg = process.argv[2] || 'off';
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'build-info.json');
const now = new Date();
let info;
if (arg === 'off') {
    info = { trialUntil: null, builtAt: now.toISOString() };
    console.log('Production build: no trial end date.');
} else {
    const days = Number(arg);
    if (!Number.isFinite(days) || days <= 0 || days > 365) { console.error('Use: node scripts/make-trial.mjs <days 1-365> | off'); process.exit(1); }
    const until = new Date(now.getTime() + days * 86400000);
    info = { trialUntil: until.toISOString(), builtAt: now.toISOString(), trialDays: days };
    console.log(`Trial build: works until ${until.toLocaleString()} (${days} days).`);
}
writeFileSync(file, `${JSON.stringify(info, null, 2)}\n`);
