// Testing (trial) build: the app works until a fixed date, then stops.
//
// The end date is written into electron/build-info.json when a testing build is made:
//     npm run dist:trial          (7 days from now)     node scripts/make-trial.mjs 14   (other length)
// A normal build (npm run dist) removes the file, so it has no end date and no "testing mode" labels.
//
// "Now" is the latest of: this PC's clock, the latest time this app has ever seen on this PC (saved), and the
// server's clock (Date header of every API reply). Turning the PC clock back does not extend the test period.
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

let info = null;
try { info = JSON.parse(fs.readFileSync(path.join(__dirname, "build-info.json"), "utf8")); } catch { info = null; }
const UNTIL = info?.trial?.until ? new Date(info.trial.until).getTime() : null;
const BUILT = info?.trial?.built_at || null;

let lastSeen = 0;          // latest trusted time in ms
let stateFile = null;
function loadState() {
  if (stateFile) return;
  try {
    stateFile = path.join(app.getPath("userData"), "trial-state.json");
    lastSeen = Number(JSON.parse(fs.readFileSync(stateFile, "utf8")).last_seen) || 0;
  } catch { lastSeen = lastSeen || 0; }
}
function saveState() {
  try { fs.writeFileSync(stateFile, JSON.stringify({ last_seen: lastSeen })); } catch { /* read-only profile: keep in memory */ }
}

/** current trusted time (never goes backwards) */
function now() {
  loadState();
  const t = Math.max(Date.now(), lastSeen);
  if (t > lastSeen + 60_000) { lastSeen = t; saveState(); }
  return t;
}

/** called with the Date header of server replies */
function seeServerTime(dateHeader) {
  const t = Date.parse(dateHeader || "");
  if (!Number.isFinite(t)) return;
  loadState();
  if (t > lastSeen) { lastSeen = t; saveState(); }
}

function status() {
  if (!UNTIL) return { enabled: false };
  const n = now();
  const msLeft = UNTIL - n;
  return {
    enabled: true,
    until: new Date(UNTIL).toISOString(),
    built_at: BUILT,
    expired: msLeft <= 0,
    days_left: Math.max(0, Math.ceil(msLeft / 86_400_000)),
    hours_left: Math.max(0, Math.floor(msLeft / 3_600_000)),
  };
}

const isExpired = () => !!UNTIL && now() >= UNTIL;

class TrialExpiredError extends Error {
  constructor() {
    super("The testing period of this app has ended. Contact your supplier for the full version.");
    this.code = "TRIAL_EXPIRED";
    this.status = 0;
  }
}
/** throw if the testing period is over */
function guard() { if (isExpired()) throw new TrialExpiredError(); }

module.exports = { status, isExpired, guard, seeServerTime, enabled: !!UNTIL };
