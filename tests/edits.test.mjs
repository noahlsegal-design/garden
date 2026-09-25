// Checks the plant changes made in the app (app/edits.js) against the real garden data: how they layer on top of
// data/plants.json, what "Save app edits into files" would write, when the website clears saved ones, and that
// This week follows a plant that's finished or changes kind.
// Run from the project folder: node tests/edits.test.mjs

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { withEdits, editFor, unsavedEdits, staleEdits, describeEdits, fieldText, inForce } from "../app/edits.js";
import { buildWeek, mondayOf, parseYmd } from "../app/tasks.js";
import { dogSafety } from "../app/data.js";

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const species = new Map(read("species.json").species.map((s) => [s.id, s]));
const layout = read("layout.json");
const plants = read("plants.json").plants.filter((p) => species.has(p.speciesId));
const byId = new Map(plants.map((p) => [p.id, p]));
const untouched = JSON.stringify(plants);
const at = "2026-09-25T15:00:00.000Z";

// Pick real plants by what they are, so editing plants.json doesn't break these checks.
const unsure = plants.find((p) => !p.confirmedByOwner && p.dogToxicOverride);
const finished = plants.find((p) => p.finished);
const dahlias = plants.filter((p) => p.speciesId === "dahlia" && !p.finished);
const other = plants.find((p) => p.speciesId !== unsure.speciesId && !p.finished);
assert(unsure && finished && dahlias.length > 1 && other, "the garden still has the kinds of plants these checks use");

// ---------- layering ----------
{
  const edits = {
    [unsure.id]: { name: { v: "Confirmed thing", at }, confirmedByOwner: { v: true, at }, idConfidence: { v: 100, at }, speciesId: { v: other.speciesId, at } },
    [finished.id]: { finished: { v: null, at } },
    [dahlias[0].id]: { finished: { v: "2026-09-25", at }, speciesId: { v: "no-such-kind", at }, position: { v: { x: 0, z: 0 }, at } },
    "not-a-plant": { name: { v: "Ghost", at } },
  };
  const out = new Map(withEdits(plants, edits, species, false).map((p) => [p.id, p]));
  const u = out.get(unsure.id);
  assert.equal(u.name, "Confirmed thing");
  assert.equal(u.confirmedByOwner, true);
  assert.equal(u.speciesId, other.speciesId);
  assert(!("finished" in out.get(finished.id)), "an empty value takes the detail away");
  assert.equal(out.get(dahlias[0].id).finished, "2026-09-25");
  assert.equal(out.get(dahlias[0].id).speciesId, "dahlia", "a kind that isn't in species.json is ignored");
  assert.deepEqual(out.get(dahlias[0].id).position, dahlias[0].position, "details the app can't change yet are ignored");
  assert(!out.has("not-a-plant"), "a change to a plant that isn't in the file doesn't add one");
  assert.equal(out.size, plants.length);
  assert.equal(out.get(other.id), byId.get(other.id), "plants with no changes are left as they are");
  assert.equal(JSON.stringify(plants), untouched, "the file's plants are never changed in place");

  // Confirming stops the extra dog caution that was there only because the ID was uncertain.
  const sp = species.get(unsure.speciesId);
  assert.equal(dogSafety({ ...unsure, confirmedByOwner: true }, sp).status, (sp.dogToxic || { status: "check" }).status);
}

// ---------- saved changes: on the Mac and on the website ----------
{
  const saved = { v: "New name", saved: true, fileHad: "Old name", at };
  assert.equal(inForce(saved, "New name", true), false, "the Mac's file already has it");
  assert.equal(inForce(saved, "Old name", false), true, "the website shows it until it's published");
  assert.equal(inForce(saved, "New name", false), false, "published: the file has it");
  assert.equal(inForce(saved, "Changed by hand", false), false, "the file moved on: the file wins");
  assert.equal(inForce({ v: "x" }, "anything", true), true, "unsaved changes always show");

  const p = { ...unsure, name: "Old name" };
  const edits = { [p.id]: { name: saved } };
  assert.equal(withEdits([p], edits, species, false)[0].name, "New name");
  assert.equal(withEdits([p], edits, species, true)[0].name, "Old name");
  assert.deepEqual(staleEdits([p], edits), [], "not published yet: keep it");
  assert.deepEqual(staleEdits([{ ...p, name: "New name" }], edits), [[p.id, "name"]], "published: clear it");
  assert.deepEqual(staleEdits([], edits), [[p.id, "name"]], "plant gone from the file: clear it");
  assert.deepEqual(unsavedEdits([p], edits), [], "saved changes aren't offered for saving again");
}

// ---------- what to send for a change ----------
{
  assert.equal(editFor(unsure, {}, "name", unsure.name, at), null, "setting it back to the file's value clears the change");
  assert.deepEqual(editFor(unsure, {}, "name", "Something", at), { v: "Something", at });
  assert.deepEqual(editFor(unsure, {}, "finished", null, at), null, "not finished in the file, and not finished now: nothing to keep");
  assert.deepEqual(editFor(finished, {}, "finished", null, at), { v: null, at }, "bringing back a plant the file says is finished");
  const pending = { [unsure.id]: { name: { v: "Published soon", saved: true, fileHad: unsure.name } } };
  assert.deepEqual(editFor(unsure, pending, "name", unsure.name, at), { v: unsure.name, at }, "a saved change waiting to be published is overridden, not just cleared");
}

// ---------- "Save app edits into files" ----------
{
  const edits = {
    [unsure.id]: { name: { v: "Japanese anemone", at }, confirmedByOwner: { v: true, at }, idConfidence: { v: unsure.idConfidence, at } },
    [finished.id]: { finished: { v: null, at } },
    "gone-plant": { name: { v: "Ghost", at } },
  };
  const rows = unsavedEdits(plants, edits);
  const fields = rows.map((r) => `${r.id} ${r.field}`).sort();
  assert.deepEqual(fields, [`${finished.id} finished`, `${unsure.id} confirmedByOwner`, `${unsure.id} name`, "gone-plant name"].sort(), "changes that match the file already aren't listed");
  const nameRow = rows.find((r) => r.field === "name" && r.plant);
  assert.deepEqual(fieldText(nameRow, species), ["Name", `“${unsure.name}”`, "“Japanese anemone”"]);
  assert.deepEqual(fieldText(rows.find((r) => r.field === "finished"), species).slice(1), [fieldText({ field: "finished", from: finished.finished }, species)[1], "no"]);
  assert.equal(rows.find((r) => r.id === "gone-plant").plant, null);
}

// ---------- on the card ----------
{
  const edits = { [unsure.id]: {
    confirmedByOwner: { v: true, at, by: "partner@example.com" }, idConfidence: { v: 100, at }, speciesId: { v: other.speciesId, at: "2026-09-26T09:00:00.000Z", by: "partner@example.com" },
    name: { v: "Renamed", at },
  } };
  const lines = describeEdits(unsure, edits, species, false, "noah@example.com");
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, `ID confirmed as ${species.get(other.speciesId).commonName}`);
  assert.deepEqual(lines[0].fields.sort(), ["confirmedByOwner", "idConfidence", "speciesId"]);
  assert.equal(lines[0].who, "partner, Sep 26");
  assert.equal(lines[1].text, `Renamed from “${unsure.name}”`);
  assert.equal(lines[1].who, "you, Sep 25", "a change made on this device is yours");
  assert.deepEqual(describeEdits(unsure, { [unsure.id]: { name: { v: "x", saved: true, fileHad: unsure.name } } }, species, false, ""), [], "saved changes aren't listed as app changes");
}

// ---------- This week follows the changes ----------
{
  const weekOf = (list) => buildWeek({ species, plants: list, layout }, { weekStart: mondayOf(parseYmd("2026-10-19")), areaOrder: [] });
  const digging = (w) => [...w.jobs, ...w.soon].find((j) => j.sp.id === "dahlia" && j.care.type === "winter");
  const before = digging(weekOf(plants));
  assert(before.plants.some((p) => p.id === dahlias[0].id));
  const after = digging(weekOf(withEdits(plants, { [dahlias[0].id]: { finished: { v: "2026-09-25", at } } }, species, false)));
  assert.equal(after.plants.length, before.plants.length - 1, "a finished dahlia loses its box in the digging job");
  assert(!after.plants.some((p) => p.id === dahlias[0].id));
  const moved = withEdits(plants, { [dahlias[1].id]: { speciesId: { v: other.speciesId, at } } }, species, false);
  assert(!digging(weekOf(moved)).plants.some((p) => p.id === dahlias[1].id), "changing a plant's kind moves its jobs");
}

console.log("edits: all checks passed");
