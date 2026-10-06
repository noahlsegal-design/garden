// Checks that index.html is stamped with the app's current version (see stamp-version.mjs), so a publish can't leave
// browsers running a mix of old and new app files. If this fails after changing a file in app/, run
// node stamp-version.mjs and run this again.
// Run from the project folder: node tests/version.test.mjs

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { appFiles, currentVersion, stamped } from "../stamp-version.mjs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const html = read("index.html");
const version = currentVersion();
let checks = 0;
const ok = (cond, msg) => { assert(cond, msg); checks++; };

ok(html === stamped(html, version), `index.html isn't stamped with the current version (${version}). Run: node stamp-version.mjs`);

// Every app file index.html points to carries the version, including the import map entry for each module.
const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
for (const f of appFiles().filter((f) => f.endsWith(".js"))) ok(map[`./app/${f}`] === `./app/${f}?v=${version}`, `the import map versions app/${f}`);
for (const [, f] of html.matchAll(/(?:src|href)="(app\/[^"]*)"/g)) ok(f.endsWith(`?v=${version}`), `${f} in index.html carries the version`);
ok(/import\("\.\/app\/main\.js"\)/.test(html), "index.html starts the app through the import map");

// The app's own imports must be plain "./name.js" so the import map catches them (no ../, no ?v of their own).
for (const f of appFiles().filter((f) => f.endsWith(".js"))) {
  for (const [, spec] of read(`app/${f}`).matchAll(/(?:^|\n)\s*(?:import|export)\b[^"'`;]*?\bfrom\s*["']([^"']+)["']/g)) {
    if (!spec.startsWith(".")) continue; // "three" and its addons
    ok(/^\.\/[\w-]+\.js$/.test(spec) && appFiles().includes(spec.slice(2)), `app/${f} imports ${spec} as a plain ./name.js of an app file`);
  }
}

// The garden data is fetched fresh every time, so it never needs a version.
ok(/fetch\(path, \{ cache: "no-store" \}\)/.test(read("app/data.js")), "app/data.js fetches data/*.json with no-store");

console.log(`version: ${checks} checks passed (${version})`);
