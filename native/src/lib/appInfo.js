// Which app this build is: Reztra POS (com.reztra.self) or Reztra Waiter (com.reztra.waiter).
// Written into src/build-info.json by scripts/make-trial.mjs (npm run android / android:waiter / apk:*).
import INFO from '../build-info.json';

export const APP = INFO?.app === 'waiter' ? 'waiter' : 'pos';
export const isWaiterApp = APP === 'waiter';
/** name shown inside the app (use with tr(): tr(APP_NAME)) */
export const APP_NAME = isWaiterApp ? 'Reztra Waiter Panel' : 'Reztra POS';