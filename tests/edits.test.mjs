// Checks the plant changes made in the app (app/edits.js) against the real garden data: how they layer on top of
// data/plants.json, what "Save app edits into files" would write, when the website clears saved ones, and that
// This week follows a plant that's finished or changes kind. Also Edit mode's changes: adding a plant (a new
// dahlia gets its own box in This week), moving, resizing and removing one.
// Run from the project folder: node tests/edits.test.mjs

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { withEdits, editFor, unsavedEdits, staleEdits, describeEdits, fieldText, inForce, newPlant, newPlantId, basePlant, spotText,
  withStructureEdits, unsavedStructureEdits, staleStructureEdits, structureBase } from "../app/edits.js";
import { isArch, archOf } from "../app/arches.js";
import { buildWeek, mondayOf, parseYmd } from "../app/tasks.js";
import { dogSafety, areaAt } from "../app/data.js";
import { plantRadius, acrossText, plantHeight, tallText, widthScale, LOOK, lookFor, isVine, supportFor, shapeFor } from "../app/look.js";

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
    [dahlias[0].id]: { finished: { v: "2026-09-25", at }, speciesId: { v: "no-such-kind", at }, notes: { v: "Changed", at }, position: { v: { x: "far" }, at }, size: { v: null, at } },
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
  assert.equal(out.get(dahlias[0].id).notes, dahlias[0].notes, "details the app can't change yet are ignored");
  assert.deepEqual(out.get(dahlias[0].id).position, dahlias[0].position, "a spot that makes no sense is ignored");
  assert.equal(out.get(dahlias[0].id).size, dahlias[0].size, "a plant's size can't be taken away");
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

// ---------- which bed a spot is in ----------
{
  const inBed = (id) => plants.find((p) => p.area === id && !p.finished);
  for (const area of ["dahlia-strip", "perennial-bed", "island-bed", "raised-bed-2"]) {
    const p = inBed(area);
    assert.equal(areaAt(layout, p.position.x, p.position.z), area, `${p.id} is in ${area}`);
  }
  assert.equal(areaAt(layout, 5, 40), "lawn");
  assert.equal(areaAt(layout, 0, 64.5), "fenceline", "past the lawn's far edge is the back chain-link");
  assert.equal(areaAt(layout, 0, -5), "deck");
  assert.equal(areaAt(layout, 200, 40), null, "outside the yard");
}

// ---------- Edit mode: add, move, resize, remove ----------
{
  const id = newPlantId("dahlia", Date.parse(at));
  assert.match(id, /^dahlia-[a-z0-9]+$/);
  assert.notEqual(id, newPlantId("dahlia", Date.parse(at)), "two plants added in the same moment still get different IDs");
  const added = newPlant({ id, name: "Café au Lait", speciesId: "dahlia", area: "dahlia-strip", position: { x: -23.34, z: 3.06 } });
  assert.deepEqual(Object.keys(added), Object.keys(dahlias[0]).filter((k) => k in added), "a new plant's details are in the same order as the others");
  assert.deepEqual(added.position, { x: -23.3, z: 3.1 }, "spots are kept to a tenth of a foot");
  assert.equal(added.confirmedByOwner, true);
  assert.equal(newPlant({ id: "x", name: "?", speciesId: "unknown-perennial", area: "lawn", position: { x: 0, z: 0 }, unsure: true }).confirmedByOwner, false, "a placeholder kind leaves the ID unconfirmed");

  const edits = {
    [id]: { added: { v: added, at }, name: { v: "Café au Lait Royal", at } },
    [dahlias[1].id]: { position: { v: { x: 4, z: 22 }, at }, area: { v: "island-bed", at }, size: { v: 1.5, at } },
    [dahlias[2].id]: { removed: { v: "2026-10-03", at } },
  };
  const list = withEdits(plants, edits, species, false);
  const out = new Map(list.map((p) => [p.id, p]));
  assert.equal(list.length, plants.length + 1, "the new plant is added to the list");
  assert.equal(list.at(-1).id, id, "after the plants in the file");
  assert.equal(out.get(id).name, "Café au Lait Royal", "later changes go on top of a new plant");
  assert.equal(out.get(id).label, "Café au Lait Royal", "a new plant's label follows its name");
  assert.deepEqual(out.get(dahlias[1].id).position, { x: 4, z: 22 });
  assert.equal(out.get(dahlias[1].id).area, "island-bed");
  assert.equal(out.get(dahlias[1].id).size, 1.5);
  assert.equal(out.get(dahlias[2].id).removed, "2026-10-03", "a removed plant is still listed, so it can be put back");
  assert.equal(basePlant(plants, edits, species, false, id).name, "Café au Lait", "a new plant's changes are measured against how it was added");
  assert.equal(basePlant(plants, edits, species, false, dahlias[1].id), byId.get(dahlias[1].id));
  assert.equal(withEdits(plants, { "x-1": { added: { v: { ...added, speciesId: "no-such-kind" }, at } } }, species, false).length, plants.length, "a new plant of an unknown kind isn't shown");

  // Moving into another bed, resizing and removing, on the card.
  const lines = describeEdits(byId.get(dahlias[1].id), edits, species, false, "", new Map([["island-bed", "Shed island bed"]]));
  assert.deepEqual(lines.map((l) => l.text), ["Moved to Shed island bed", "Resized"]);
  assert.deepEqual(lines[0].fields.sort(), ["area", "position"], "undoing a move puts back both the spot and the bed");
  assert.deepEqual(describeEdits(byId.get(dahlias[2].id), edits, species, false, "").map((l) => l.text), ["Removed from the yard"]);
  const newLines = describeEdits(basePlant(plants, edits, species, false, id), edits, species, false, "");
  assert.deepEqual(newLines.map((l) => [l.text, l.fields.length]), [["Added in the app", 0], [`Renamed from “Café au Lait”`, 1]], "adding has no Undo on the card");
  assert.equal(editFor(byId.get(dahlias[1].id), edits, "size", byId.get(dahlias[1].id).size, at), null, "sizing it back clears the change");

  // This week: the new dahlia gets its own box, and the removed one drops out.
  const weekOf = (l) => buildWeek({ species, plants: l, layout }, { weekStart: mondayOf(parseYmd("2026-10-19")), areaOrder: [] });
  const digging = (w) => [...w.jobs, ...w.soon].find((j) => j.sp.id === "dahlia" && j.care.type === "winter");
  const before = digging(weekOf(plants)), after = digging(weekOf(list));
  assert.equal(after.plants.length, before.plants.length, "one dahlia added and one removed");
  assert(after.plantKeys.includes(`${after.key}|${id}`), "the new dahlia has its own box");
  assert(!after.plants.some((p) => p.id === dahlias[2].id), "the removed dahlia has none");

  // "Save app edits into files": a new plant is one row with its later changes folded in.
  const rows = unsavedEdits(plants, edits, species);
  const addRow = rows.find((r) => r.id === id);
  assert.equal(addRow.field, "added");
  assert.equal(addRow.to.name, "Café au Lait Royal");
  assert.equal(addRow.dropped, false);
  assert.equal(rows.filter((r) => r.id === id).length, 1);
  assert.deepEqual(rows.filter((r) => r.id === dahlias[1].id).map((r) => r.field).sort(), ["area", "position", "size"]);
  const moveRow = rows.find((r) => r.field === "position");
  assert.deepEqual(fieldText(moveRow, species).slice(1), [spotText(dahlias[1].position), "4 ft right, 22 ft out"]);
  assert.deepEqual(fieldText(rows.find((r) => r.field === "area"), species, new Map([["island-bed", "Shed island bed"]])).slice(2), ["Shed island bed"]);
  assert.equal(fieldText(rows.find((r) => r.field === "size"), species)[2], acrossText({ ...dahlias[1], size: 1.5 }, species.get("dahlia")));
  assert.equal(fieldText(rows.find((r) => r.field === "removed"), species)[2], "Oct 3, 2026");
  const gone = unsavedEdits(plants, { [id]: { added: { v: added, at }, removed: { v: "2026-10-03", at } } }, species);
  assert.equal(gone[0].dropped, true, "added and removed again: nothing to write");

  // Saved into the Mac's file: the website keeps showing the new plant until it's published, then clears it.
  const saved = { [id]: { added: { v: addRow.to, at, saved: true, fileHad: null } } };
  assert.equal(withEdits(plants, saved, species, false).at(-1).id, id, "the website shows it until it's published");
  assert.equal(withEdits(plants, saved, species, true).length, plants.length, "the Mac's file has it, so it isn't added twice");
  assert.deepEqual(staleEdits(plants, saved), [], "not published yet: keep it");
  assert.deepEqual(staleEdits([...plants, addRow.to], saved), [[id, "added"]], "published: clear it");
  assert.deepEqual(unsavedEdits(plants, saved, species), [], "a saved new plant isn't offered for saving again");
}

// ---------- sizes ----------
{
  const shrub = plants.find((p) => species.get(p.speciesId)?.kind === "shrub");
  const small = dahlias[0];
  assert(plantRadius({ ...small, size: 2 }, species.get(small.speciesId)) === 2 * plantRadius({ ...small, size: 1 }, species.get(small.speciesId)));
  // Each kind is drawn at its usual spread from the research (look.js "wide"), scaled by "size".
  assert.equal(acrossText({ ...small, size: 1 }, species.get("dahlia")), `about ${LOOK.dahlia.wide} ft across`);
  if (shrub) assert.equal(plantRadius({ ...shrub, size: 1 }, species.get(shrub.speciesId)), lookFor(shrub).wide / 2, "shrubs too");

  // Height: the kind's (or named variety's) usual height until a plant has one of its own, whatever its width.
  const sp = species.get(small.speciesId);
  const h1 = plantHeight({ ...small, size: 1 }, sp);
  assert.equal(h1, lookFor(small).ft, "a plant without a height of its own is its kind's or variety's usual height");
  assert.equal(plantHeight({ ...small, size: 2 }, sp), h1, "and making it wider doesn't change that");
  assert.equal(plantHeight({ ...small, size: 2, height: 3.3 }, sp), 3.3, "a height of its own wins");
  assert.equal(tallText({ ...small, height: 4.24 }, sp), "4.2 ft tall", "a height you entered is shown as entered");
  assert.equal(tallText({ ...small, height: null }, sp), `about ${Math.max(0.5, Math.round(h1 * 2) / 2)} ft tall`, "a worked-out one is rounded");

  // Width in feet takes over from "size", and leaves and flowers scale with it.
  assert.equal(plantRadius({ ...small, size: 2, width: 3 }, sp), 1.5);
  assert.equal(acrossText({ ...small, width: 3 }, sp), "3 ft across");
  assert.equal(widthScale({ ...small, width: LOOK.dahlia.wide * 2 }, sp), widthScale({ ...small, size: 2 }, sp), "twice the usual width is size 2");

  const edits = { [small.id]: { height: { v: 5, at }, width: { v: 2.5, at }, stems: { v: 3, at } } };
  const out = withEdits(plants, edits, species, false).find((p) => p.id === small.id);
  assert.equal(out.height, 5);
  assert.equal(out.width, 2.5);
  assert.equal(out.stems, 3);
  for (const bad of [0, 2.5, "3", 1000]) {
    assert.equal(withEdits(plants, { [small.id]: { stems: { v: bad, at } } }, species, false).find((p) => p.id === small.id).stems, small.stems, `${JSON.stringify(bad)} stems is ignored`);
  }
  assert.equal(withEdits(plants, { [small.id]: { height: { v: 99, at } } }, species, false).find((p) => p.id === small.id).height, small.height, "a height that makes no sense is ignored");
  const resized = describeEdits(small, edits, species, false, "");
  assert.deepEqual(resized.map((l) => [l.text, l.fields.sort()]), [["Resized", ["height", "width"]], ["Set to 3 main stems", ["stems"]]], "undoing a resize puts back width and height together");
  const rows = unsavedEdits(plants, edits, species);
  assert.deepEqual(fieldText(rows.find((r) => r.field === "height"), species), ["Height", tallText(small, sp), "5 ft tall"]);
  assert.deepEqual(fieldText(rows.find((r) => r.field === "width"), species), ["Width", acrossText(small, sp), "2.5 ft across"]);
  assert.deepEqual(fieldText(rows.find((r) => r.field === "stems"), species), ["Main stems or trunks", "—", "3"]);
}

// ---------- arch trellises (Edit mode) ----------
{
  const structures = layout.structures;
  const file = structures.find(isArch);
  assert(file, "the yard still has an arch trellis");
  const id = `structure-${file.id}`;
  const edits = { [id]: { shape: { v: "pointed", at }, turn: { v: 35, at }, position: { v: { x: -20, z: 15 }, at }, width: { v: 99, at } } };
  const arch = withStructureEdits(structures, edits, false).find(isArch);
  assert.deepEqual([arch.shape, arch.turn, arch.x, arch.z, arch.width], ["pointed", 35, -20, 15, file.width], "changes layer on top; a width out of range is ignored");
  assert.equal(JSON.stringify(withStructureEdits(structures, {}, false)), JSON.stringify(structures), "no changes, no difference");
  assert.equal(archOf(file).shape, "round", "an arch from the old layout is round, a single hoop, facing as before");
  assert.deepEqual([archOf(file).depth, archOf(file).turn], [0, 0]);
  // Arch changes stay out of the plants' lists, and get their own rows.
  assert.equal(withEdits(plants, edits, species, false).length, plants.length, "an arch is never taken for a new plant");
  assert.equal(unsavedEdits(plants, edits, species).length, 0, "plants.json has nothing to write for an arch");
  assert.equal(staleEdits(plants, { [id]: { shape: { v: "low", saved: true, fileHad: null } } }).length, 0);
  const rows = unsavedStructureEdits(structures, edits);
  assert.deepEqual(rows.map((r) => r.field).sort(), ["position", "shape", "turn", "width"]);
  assert.deepEqual(fieldText(rows.find((r) => r.field === "shape"), species), ["Shape", "Round", "Pointed"]);
  assert.deepEqual(fieldText(rows.find((r) => r.field === "turn"), species), ["Turned", "0°", "35°"]);
  assert.equal(editFor(structureBase(file), {}, "width", file.width, at), null, "setting an arch back to what the file says clears the change");
  // Saved arch changes are cleared once the published layout has moved past them.
  const saved = { [id]: { shape: { v: "pointed", at, saved: true, fileHad: null } } };
  assert.equal(staleStructureEdits(structures, saved).length, 0, "still waiting for the website's layout.json");
  assert.deepEqual(staleStructureEdits(structures.map((x) => (x === file ? { ...x, shape: "pointed" } : x)), saved), [[id, "shape"]]);
}

// ---------- what a vine grows on ----------
{
  const luffa = plants.find((p) => p.speciesId === "loofah");
  const melon = plants.find((p) => p.speciesId === "honeydew");
  assert(isVine(luffa) && isVine(melon) && !isVine(other), "luffa and melon are vines; other plants aren't");
  const grown = withEdits(plants, { [melon.id]: { support: { v: "trellis", at } }, [other.id]: { support: { v: "rope", at } } }, species, false);
  assert.equal(supportFor(grown.find((p) => p.id === melon.id)), "trellis", "a melon can be trained up a trellis");
  assert.equal(grown.find((p) => p.id === other.id).support, undefined, "an unknown support is ignored");
  assert.equal(supportFor({ ...other, support: "pole" }), null, "only vines grow on things");
  const card = describeEdits(melon, { [melon.id]: { support: { v: "arch", at } } }, species, false, "");
  assert.equal(card[0].text, "Grows on the arch");
}

// ---------- a plant's own shape (the card's Shape choice) ----------
{
  const p = other;
  const edits = { [p.id]: { shape: { v: "fan", at } } };
  const shaped = withEdits(plants, edits, species, false).find((q) => q.id === p.id);
  assert.equal(shapeFor(shaped), "fan", "a chosen shape is drawn");
  assert.equal(withEdits(plants, { [p.id]: { shape: { v: "blob", at } } }, species, false).find((q) => q.id === p.id).shape, undefined, "an unknown shape is ignored");
  // Confirming a different kind keeps the chosen shape (the owner's choice, October 2026).
  const kind = [...species.keys()].find((k) => k !== p.speciesId && LOOK[k]?.shape !== "fan");
  const confirmed = withEdits(plants, { [p.id]: { shape: { v: "fan", at }, speciesId: { v: kind, at }, confirmedByOwner: { v: true, at } } }, species, false).find((q) => q.id === p.id);
  assert.equal(shapeFor(confirmed), "fan", "a custom shape stays when the kind is changed");
  assert.equal(shapeFor({ ...confirmed, shape: undefined }), LOOK[kind].shape, "and without one it follows the new kind");
  const rows = unsavedEdits(plants, edits, species);
  assert.deepEqual(fieldText(rows.find((r) => r.field === "shape"), species), ["Shape", "Its kind's usual shape", "Strappy fan"]);
  assert.equal(describeEdits(p, edits, species, false, "")[0].text, "Shape set to Strappy fan");
  assert.deepEqual(describeEdits(p, edits, species, false, "")[0].fields, ["shape"], "Undo clears the shape");
}

// ---------- "Still growing" or "Dead" from the card ----------
{
  const cuke = plants.find((p) => p.speciesId === "cucumber");
  const said = { state: "growing", on: "2026-10-06" };
  const out = withEdits(plants, { [cuke.id]: { season: { v: said, at } }, [other.id]: { season: { v: { state: "dormant", on: "2026-10-06" }, at } } }, species, false);
  assert.deepEqual(out.find((p) => p.id === cuke.id).season, said, "a plant can be marked still growing");
  assert.equal(out.find((p) => p.id === other.id).season, undefined, "an unknown state is ignored");
  const card = describeEdits(cuke, { [cuke.id]: { season: { v: said, at } } }, species, false, "");
  assert.equal(card[0].text, "Marked still growing");
  assert.deepEqual(card[0].fields, ["season"], "Undo goes back to the calendar");
  assert.deepEqual(fieldText({ plant: cuke, field: "season", from: null, to: { state: "dead", on: "2026-10-06" } }, species).slice(1), ["as the calendar says", "dead (Oct 6, 2026)"]);
}

console.log("edits: all checks passed");
