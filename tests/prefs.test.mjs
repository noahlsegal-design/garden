// Checks the choices Settings keeps on this phone (app/prefs.js): the defaults, and that anything odd saved falls
// back to them. Run from the project folder: node tests/prefs.test.mjs

import assert from "node:assert/strict";
import { cleanPrefs, DEFAULTS, THEMES, getPrefs } from "../app/prefs.js";

let checks = 0;
const ok = (cond, msg) => { assert(cond, msg); checks++; };

ok(DEFAULTS.photos === true && DEFAULTS.whoDid === true, "Latest photos and Who did it start on");
ok(DEFAULTS.theme === "auto", "the look starts on Auto, following the phone");
ok(JSON.stringify(cleanPrefs(null)) === JSON.stringify(DEFAULTS), "nothing saved gives the defaults");
ok(JSON.stringify(cleanPrefs("junk")) === JSON.stringify(DEFAULTS), "something unreadable saved gives the defaults");
ok(cleanPrefs({ photos: false }).photos === false && cleanPrefs({ photos: false }).whoDid === true, "turning one off leaves the other on");
ok(cleanPrefs({ photos: "no" }).photos === true, "a switch saved as something other than on/off goes back to on");
for (const [id] of THEMES) ok(cleanPrefs({ theme: id }).theme === id, `the ${id} look is kept`);
ok(cleanPrefs({ theme: "sepia" }).theme === "auto", "an unknown look goes back to Auto");
ok(JSON.stringify(getPrefs()) === JSON.stringify(DEFAULTS), "with no storage at all (here, in Node) the defaults still work");

console.log(`prefs: ${checks} checks passed`);
