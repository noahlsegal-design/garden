// Runs a copy of the Mac's server (serve.py) on a copy of the data and checks "Save app edits into files": it
// writes changes into plants.json in the same layout as before, refuses bad values, and leaves the file
// untouched when there's nothing to write, and handles Edit mode's moves, sizes, removals and new plants. Also checks plant changes kept on the Mac when no garden account
// is connected. Your real data/ files are never touched.
// Run from the project folder: node tests/serve.test.mjs

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(`../${f}`, import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "garden-serve-test-"));
mkdirSync(join(dir, "data"));
copyFileSync(here("serve.py"), join(dir, "serve.py"));
for (const f of ["plants.json", "species.json", "layout.json"]) copyFileSync(here(`data/${f}`), join(dir, "data", f));
const plantsPath = join(dir, "data", "plants.json");
const original = readFileSync(plantsPath, "utf8");
const file = () => JSON.parse(readFileSync(plantsPath, "utf8"));

const port = 20000 + Math.floor(Math.random() * 20000);
const server = spawn("python3", ["serve.py", String(port)], { cwd: dir, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
const post = (path, body, type = "application/json") =>
  fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": type }, body: JSON.stringify(body) });

try {
  for (let i = 0; ; i++) { // wait for it to start
    try { await fetch(`${base}/api/checkoffs`); break; } catch { if (i > 50) throw new Error("serve.py didn't start"); await new Promise((r) => setTimeout(r, 100)); }
  }

  const plants = file().plants;
  const unsure = plants.find((p) => !p.confirmedByOwner);
  const finished = plants.find((p) => p.finished);
  const plain = plants.find((p) => !p.finished && p.id !== unsure.id);
  const kind = JSON.parse(readFileSync(here("data/species.json"), "utf8")).species.find((s) => s.id !== unsure.speciesId).id;

  // Other web pages can't write here: the app always sends JSON, and a plain form or page can't.
  assert.equal((await post("/api/save-edits", { edits: {} }, "text/plain")).status, 415);
  assert.equal((await post("/api/checkoffs", { set: { a: "2026-09-25" } }, "text/plain")).status, 415);

  // Nothing valid to write: the file is left exactly as it was.
  let res = await post("/api/save-edits", { edits: { [unsure.id]: { name: "   ", idConfidence: 101, speciesId: "no-such-kind", confirmedByOwner: "yes", position: { x: 1 } }, "no-such-plant": { name: "Ghost" } } });
  let out = await res.json();
  assert.deepEqual(out.fileHad, {});
  assert.equal(out.skipped.length, 6);
  assert.equal(readFileSync(plantsPath, "utf8"), original, "untouched");

  // Real changes.
  res = await post("/api/save-edits", { edits: {
    [unsure.id]: { name: "  Japanese anemone ", confirmedByOwner: true, idConfidence: 100, speciesId: kind },
    [finished.id]: { finished: null },
    [plain.id]: { finished: "2026-09-25" },
  } });
  out = await res.json();
  assert.deepEqual(out.skipped, []);
  assert.deepEqual(out.fileHad[unsure.id], { name: unsure.name, confirmedByOwner: unsure.confirmedByOwner, idConfidence: unsure.idConfidence, speciesId: unsure.speciesId }, "says what each detail was before");
  assert.deepEqual(out.fileHad[finished.id], { finished: finished.finished });
  assert.deepEqual(out.fileHad[plain.id], { finished: null });

  const after = file();
  const get = (id) => after.plants.find((p) => p.id === id);
  assert.equal(get(unsure.id).name, "Japanese anemone", "spaces trimmed");
  assert.equal(get(unsure.id).confirmedByOwner, true);
  assert.equal(get(unsure.id).idConfidence, 100);
  assert.equal(get(unsure.id).speciesId, kind);
  assert(!("finished" in get(finished.id)), "brought back: the finished line is gone");
  const keys = Object.keys(get(plain.id));
  assert.equal(keys[keys.indexOf("name") + 1], "finished", "a new finished line goes just under the name");
  assert.equal(after.plants.length, plants.length);

  // Same layout as before: only the changed lines differ.
  const again = readFileSync(plantsPath, "utf8");
  assert.equal(again.endsWith("\n"), original.endsWith("\n"));
  const changedLines = again.split("\n").filter((l) => !original.split("\n").includes(l));
  assert(changedLines.length <= 5, `only the changed lines differ (${changedLines.length}: ${changedLines.join(" / ")})`);
  assert.equal(JSON.stringify(JSON.parse(again).plants.map((p) => p.id)), JSON.stringify(plants.map((p) => p.id)), "plants stay in the same order");

  // Edit mode: moving into another bed, resizing and removing.
  const before = file().plants;
  const mover = before.find((p) => p.area === "dahlia-strip" && !p.finished);
  const goner = before.find((p) => p.area === "perennial-bed" && !p.finished);
  res = await post("/api/save-edits", { edits: {
    [mover.id]: { position: { x: 4.04, z: 21.96 }, area: "island-bed", size: 1.456 },
    [goner.id]: { removed: "2026-10-03", position: { x: "far", z: 1 }, size: 50, area: "the moon" },
  } });
  out = await res.json();
  assert.deepEqual(out.skipped.sort(), [`${goner.id} area`, `${goner.id} position`, `${goner.id} size`]);
  assert.deepEqual(out.fileHad[mover.id], { position: mover.position, area: mover.area, size: mover.size });
  assert.deepEqual(out.fileHad[goner.id], { removed: null });
  let now = file();
  const moved = now.plants.find((p) => p.id === mover.id);
  assert.deepEqual(moved.position, { x: 4, z: 22 }, "spots are kept to a tenth of a foot");
  assert.equal(moved.area, "island-bed");
  assert.equal(moved.size, 1.46);
  const removed = now.plants.find((p) => p.id === goner.id);
  assert.equal(removed.removed, "2026-10-03", "removed plants stay in the file, marked");
  assert.deepEqual(removed.position, goner.position);
  res = await post("/api/save-edits", { edits: { [goner.id]: { removed: null } } });
  assert(!("removed" in file().plants.find((p) => p.id === goner.id)), "put back: the removed line is gone");

  // A plant added in the app goes in after the last plant in its bed, laid out like the others.
  const newId = "dahlia-test1234";
  const added = { id: newId, label: "Café au Lait", area: "dahlia-strip", name: " Café au Lait ", speciesId: "dahlia", idConfidence: 100, confirmedByOwner: true,
    alsoPossible: ["junk"], photos: ["/etc/passwd"], position: { x: -23.3, z: 3.1 }, size: 1, issues: [], notes: "<script>", needsAttention: true, extra: "dropped" };
  res = await post("/api/save-edits", { edits: {
    [newId]: { added },
    "Bad ID!": { added: { ...added, id: "Bad ID!" } },
    "dahlia-nokind": { added: { ...added, speciesId: "no-such-kind" } },
    [mover.id]: { added },
  } });
  out = await res.json();
  assert.deepEqual(out.fileHad, { [newId]: { added: null } });
  assert.deepEqual(out.skipped.sort(), ["Bad ID! added", "dahlia-nokind added", `${mover.id} added`].sort(), "bad IDs, unknown kinds and IDs already in the file are refused");
  now = file();
  const i = now.plants.findIndex((p) => p.id === newId);
  const strip = now.plants.map((p, k) => [p.area, k]).filter(([a]) => a === "dahlia-strip").map(([, k]) => k);
  assert.equal(i, Math.max(...strip.filter((k) => k !== i)) + 1, "right after the last plant in the same bed");
  assert.deepEqual(Object.keys(now.plants[i]), Object.keys(plants.find((p) => !p.dogToxicOverride && !p.finished)), "same details, in the same order, as the other plants");
  assert.equal(now.plants[i].name, "Café au Lait");
  assert.deepEqual([now.plants[i].photos, now.plants[i].alsoPossible, now.plants[i].notes], [[], [], null], "only the details the app sets are taken");
  assert.equal(now.plants.length, plants.length + 1);
  res = await post("/api/save-edits", { edits: { [newId]: { added } } });
  assert.deepEqual((await res.json()).skipped, [`${newId} added`], "saving the same new plant twice doesn't add it twice");

  // Plant changes kept on the Mac (no garden account connected): saved, cleared, and kept with check-offs.
  res = await post("/api/checkoffs", { set: { "w|x|2026-09-21": "2026-09-25" }, edits: { "pb-02": { name: { v: "Avens", at: "2026-09-25T10:00:00Z", junk: 1 } }, "pb-03": { finished: { v: null } } } });
  let state = await res.json();
  assert.deepEqual(state.edits["pb-02"].name, { v: "Avens", at: "2026-09-25T10:00:00Z" });
  assert.deepEqual(state.edits["pb-03"].finished, { v: null });
  res = await post("/api/checkoffs", { edits: { "pb-02": { name: null }, "pb-03": { "bad field": { v: 1 } } } });
  state = await res.json();
  assert(!state.edits["pb-02"], "clearing the last change on a plant removes the plant from the list");
  assert.equal(state.done["w|x|2026-09-21"], "2026-09-25");
  state = await (await fetch(`${base}/api/checkoffs`)).json();
  assert.deepEqual(Object.keys(state.edits), ["pb-03"]);
  console.log("serve (Mac server): all checks passed");
} finally {
  server.kill();
}
