// Testing build switch.
//   node scripts/make-trial.mjs 7      -> this build stops working 7 days from now (writes electron/build-info.json)
//   node scripts/make-trial.mjs off    -> normal build, no end date (removes the file)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "electron", "build-info.json");
const arg = (process.argv[2] || "7").toLowerCase();

if (arg === "off" || arg === "0") {
  fs.rmSync(file, { force: true });
  console.log("Normal build: no testing period.");
} else {
  const days = Number(arg);
  if (!Number.isFinite(days) || days <= 0) {
    console.error('Usage: node scripts/make-trial.mjs <days> | off');
    process.exit(1);
  }
  const built = new Date();
  const until = new Date(built.getTime() + days * 86_400_000);
  fs.writeFileSync(file, JSON.stringify({ trial: { days, built_at: built.toISOString(), until: until.toISOString() } }, null, 2));
  console.log(`Testing build: works until ${until.toString()} (${days} days).`);
}
