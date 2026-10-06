// Stamps index.html with the app's current version, so browsers fetch fresh app files after each publish.
// GitHub Pages lets browsers keep each file for up to 10 minutes. Without a version, a browser right after a publish
// could run some old app files with some new ones, which don't fit together. With it, every app file's address
// ends in ?v=<version>, and the version changes whenever any file in app/ changes, so a new publish means new
// addresses and the browser fetches all of them fresh. data/*.json is always fetched fresh already (app/data.js).
// Run from the project folder before publishing: node stamp-version.mjs
// (tests/version.test.mjs says when it's needed.) Running it again with nothing changed does nothing.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));

export const appFiles = () => readdirSync(here("app/")).filter((f) => /\.(js|css)$/.test(f)).sort();

// A short fingerprint of everything in app/: it changes when any app file does, and only then.
export function currentVersion() {
  const hash = createHash("sha256");
  for (const f of appFiles()) hash.update(`${f}\0`).update(readFileSync(here(`app/${f}`))).update("\0");
  return hash.digest("hex").slice(0, 10);
}

// index.html with every app file's address carrying ?v=<version>: the stylesheet link, and an import map entry for
// each module (the app's own imports, like "./look.js", go through the import map, so the app code stays as is).
export function stamped(html, version = currentVersion()) {
  const block = /<script type="importmap">([\s\S]*?)<\/script>/;
  const match = html.match(block);
  if (!match) throw new Error("index.html has no import map");
  const imports = Object.entries(JSON.parse(match[1]).imports).filter(([k]) => !k.startsWith("./app/"));
  for (const f of appFiles().filter((f) => f.endsWith(".js"))) imports.push([`./app/${f}`, `./app/${f}?v=${version}`]);
  const map = `<script type="importmap">\n{ "imports": {\n${imports.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n")}\n} }\n</script>`;
  return html.replace(block, () => map).replace(/href="app\/([\w-]+\.css)(\?v=[^"]*)?"/g, (_, f) => `href="app/${f}?v=${version}"`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const html = readFileSync(here("index.html"), "utf8");
  const next = stamped(html);
  const version = currentVersion();
  if (next === html) console.log(`index.html is already stamped with the current version (${version}).`);
  else { writeFileSync(here("index.html"), next); console.log(`Stamped index.html with version ${version}.`); }
}
