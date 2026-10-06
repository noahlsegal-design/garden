// Checks the plant-drawing data in app/look.js against the garden: every kind has a valid shape type, real sizes
// that make sense together (no leaf or flower bigger than its plant), and the spring growth curve in app/data.js.
// The 3D drawing itself (app/shapes.js) needs a browser; preview/compare.html shows each kind next to photos.
// Run from the project folder: node tests/shapes.test.mjs

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { LOOK, PLANT_LOOK, SHAPES, shapeFor, lookFor, plantHeight, plantRadius } from "../app/look.js";
import { growthFor, shownStateFor, seasonOverride, canOverrideSeason, MONTHS } from "../app/data.js";
import { ARCH_SHAPES, archOf, archProfile, archFeet, nearestArch } from "../app/arches.js";

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const species = read("species.json").species;
const plants = read("plants.json").plants;
const SHAPE_IDS = new Set(SHAPES.map((s) => s.id));
// The pictures and flower forms app/shapes.js knows how to draw.
const LEAF_PICTURES = new Set(["broad", "lance", "round", "lobed", "palmate", "compound", "trefoil", "fern", "thread", "sprig", "straps"]);
const FLOWER_FORMS = new Set(["spike", "daisy", "ball", "cup", "star", "cone", "cluster", "umbel", "plume", "bells", "iris"]);
const HABITS = new Set(["stems", "crown", "basal", "dome", "vine", "branched", "trailing"]);
let checks = 0;
const ok = (cond, msg) => { assert(cond, msg); checks++; };

// ---------- every kind ----------
for (const sp of species) {
  const look = LOOK[sp.id];
  ok(look, `${sp.id} has a look`);
  ok(SHAPE_IDS.has(look.shape), `${sp.id}: shape "${look.shape}" is a shape type`);
  ok(look.ft > 0 && look.ft <= 12, `${sp.id}: a real height in feet`);
  ok(look.wide > 0 && look.wide <= 8, `${sp.id}: a real spread in feet`);
  if (look.foliage) ok(LEAF_PICTURES.has(look.foliage), `${sp.id}: leaf picture "${look.foliage}" exists`);
  if (look.bloom) ok(FLOWER_FORMS.has(look.bloom), `${sp.id}: flower form "${look.bloom}" exists`);
  if (look.flower2Form) ok(FLOWER_FORMS.has(look.flower2Form), `${sp.id}: second flower form exists`);
  if (look.habit) ok(HABITS.has(look.habit), `${sp.id}: habit "${look.habit}" is drawn`);
  if (look.leaves != null) ok(look.leaves > 0 && look.leaves <= 1, `${sp.id}: leaves is a fraction of the height`);
  if (look.growFrom != null) ok(look.growFrom > 0 && look.growFrom < 1, `${sp.id}: growFrom is a fraction`);
  // Real leaf and flower sizes in inches, and never bigger than the plant they're on.
  if (look.leafIn != null) ok(look.leafIn > 0 && look.leafIn / 12 < look.ft, `${sp.id}: a leaf smaller than the plant`);
  if (look.flowerIn != null) ok(look.flowerIn > 0 && look.flowerIn / 12 < look.ft, `${sp.id}: a flower smaller than the plant`);
  if (look.spikeIn) ok(look.spikeIn[0] / 12 < look.ft && look.spikeIn[1] < look.spikeIn[0], `${sp.id}: a spike shorter than the plant, longer than wide`);
  // Each stage it says how to draw is one the kind actually has.
  for (const st of Object.keys(look.stage || {})) ok(Object.values(sp.seasonal).includes(st), `${sp.id}: stage "${st}" is one of its stages`);
  if (look.plumes) ok(look.plumes.every((m) => m >= 0 && m < 12), `${sp.id}: plume months are months`);
  for (const m of Object.keys(look.months || {})) ok(Number(m) >= 0 && Number(m) < 12, `${sp.id}: month looks are for months`);
  for (const [st, o] of Object.entries(look.stage || {})) {
    if (o.h != null) ok(o.h > 0 && o.h <= 1, `${sp.id}: ${st} height is a share of full height`);
    if (o.spread != null) ok(o.spread > 0 && o.spread <= 1, `${sp.id}: ${st} spread is a share of full width`);
  }
}
ok(Object.keys(LOOK).length === species.length, "no looks for kinds that don't exist");

// ---------- every plant ----------
for (const p of plants) {
  const sp = species.find((s) => s.id === p.speciesId);
  if (!sp) continue;
  const look = lookFor(p);
  ok(plantHeight(p, sp) === look.ft || p.height > 0, `${p.id}: drawn at its kind's (or variety's) height`);
  ok(plantRadius(p, sp) > 0, `${p.id}: has a spread`);
  ok(SHAPE_IDS.has(shapeFor(p)), `${p.id}: draws as a shape type`);
}
for (const id of Object.keys(PLANT_LOOK)) ok(plants.some((p) => p.id === id), `PLANT_LOOK ${id} is a real plant`);

// Named dahlias carry their grower's height and bloom size.
const cafe = plants.find((p) => p.id === "ds-1");
ok(lookFor(cafe).ft === 4.5 && lookFor(cafe).flowerIn === 9, "Cafe Au Lait: 4.5 ft with 9 in dinnerplates");

// ---------- a plant's own shape ----------
const peony = plants.find((p) => p.speciesId === "peony");
ok(shapeFor(peony) === "pompons", "a peony draws as big round blooms");
ok(shapeFor({ ...peony, shape: "mound" }) === "mound", "a plant's own shape wins");
ok(shapeFor({ ...peony, shape: "not-a-shape" }) === "pompons", "an unknown shape falls back to its kind's");
ok(shapeFor({ id: "x", speciesId: "no-such-kind" }) === "mound", "an unknown kind is a mound");

// ---------- spring growth ----------
const seasonal = (id) => species.find((s) => s.id === id).seasonal;
const m = (name) => MONTHS.indexOf(name);
const cone = seasonal("coneflower"); // in leaf Apr–Jun, flowers in July
ok(growthFor(cone, m("Apr"), 0.3) === 0.3, "coneflower starts April at the size it comes up");
ok(growthFor(cone, m("May"), 0.3) < growthFor(cone, m("Jun"), 0.3), "and grows through spring");

// ---------- crops done for the year are drawn spent, not left blank ----------
const kind = (id) => species.find((s) => s.id === id);
ok(shownStateFor(kind("cucumber"), m("Oct")) === "spent", "cucumbers finished in October stand spent");
ok(shownStateFor(kind("peas"), m("Dec")) === "spent", "peas stay spent through December");
ok(shownStateFor(kind("cucumber"), m("Mar")) === "gone", "nothing drawn before planting");
ok(shownStateFor(kind("radish"), m("Jun")) === "gone", "a gap between sowings stays empty");
ok(shownStateFor(kind("cucumber"), m("Aug")) === "fruit", "other stages unchanged");
ok(shownStateFor(kind("dahlia"), m("Oct")) === "bloom", "dahlias flower until frost");
ok(shownStateFor(kind("dahlia"), m("Dec")) === "stored", "stored dahlia tubers aren't spent");

// ---------- "Still growing" or "Dead" from the card, when the weather doesn't match the calendar ----------
const oct6 = new Date(2026, 9, 6);
const growing = seasonOverride({ state: "growing", on: "2026-10-06" }, oct6), dead = seasonOverride({ state: "dead", on: "2026-09-12" }, oct6);
ok(shownStateFor(kind("cucumber"), m("Oct"), growing) === "fruit", "cucumbers still growing in October keep fruiting");
ok(shownStateFor(kind("cucumber"), m("Nov"), growing) === "spent", "later months follow the calendar");
ok(shownStateFor(kind("cucumber"), m("Sep"), growing) === "fruit" && shownStateFor(kind("cucumber"), m("Aug"), dead) === "fruit", "earlier months are untouched");
ok(shownStateFor(kind("tomato"), m("Oct"), growing) === "fruit", "a tomato the frost missed");
ok(shownStateFor(kind("dill"), m("Oct"), growing) === "seedheads", "going to seed isn't dying");
ok(shownStateFor(kind("cucumber"), m("Sep"), dead) === "spent" && shownStateFor(kind("cucumber"), m("Dec"), dead) === "spent", "dead stays dead");
ok(shownStateFor(kind("dahlia"), m("Oct"), seasonOverride({ state: "dead", on: "2026-10-20" }, new Date(2026, 9, 20))) === "frost-blackened", "a dead dahlia is frost-blackened, ready to dig");
ok(shownStateFor(kind("dahlia"), m("Nov"), seasonOverride({ state: "growing", on: "2026-11-02" }, new Date(2026, 10, 2))) === "bloom", "dahlias blooming into November");
ok(seasonOverride({ state: "growing", on: "2025-10-06" }, oct6) === null, "last year's doesn't carry over");
ok(seasonOverride({ state: "growing", on: "2026-09-20" }, oct6).to === m("Oct"), "still growing lasts until you say otherwise this year");
ok(canOverrideSeason(kind("cucumber"), m("Oct")) && canOverrideSeason(kind("dahlia"), m("Oct")), "crops and dahlias can be marked");
ok(!canOverrideSeason(kind("cucumber"), m("Mar")), "not before it's planted");
ok(!canOverrideSeason(kind("peony"), m("Oct")) && !canOverrideSeason(kind("asparagus"), m("Oct")), "perennials follow their calendar");
ok(growthFor(cone, m("Jun"), 0.3) < 1, "but isn't full height until it flowers");
ok(growthFor(cone, m("Jul"), 0.3) === 1 && growthFor(cone, m("Jan"), 0.3) === 1, "flowering and dormant months are full size (or drawn by their own stage)");
const peonyS = seasonal("peony"); // in leaf again Jul–Sep after flowering in June
ok(growthFor(peonyS, m("Aug")) === 1, "after flowering a plant stays full size");
const grass = { Jan: "dormant", Feb: "dormant", Mar: "dormant", Nov: "dormant", Dec: "dormant" }; // in leaf Apr–Oct, no flowering stage
ok(growthFor(grass, m("Apr"), 0.15) === 0.15 && growthFor(grass, m("Jul"), 0.15) === 1, "a leaf-only plant is full size three months in");

// ---------- arch trellises ----------
for (const { id } of ARCH_SHAPES) for (const [width, height] of [[5, 7], [8, 6], [2, 3], [16, 14]]) {
  const a = archOf({ shape: id, width, height, x: 0, z: 0 });
  const pts = archProfile(a);
  ok(pts[0][0] === -width / 2 && pts[0][1] === 0 && pts.at(-1)[0] === width / 2 && pts.at(-1)[1] === 0, `${id} ${width}×${height}: stands on both legs`);
  ok(Math.abs(Math.max(...pts.map((p) => p[1])) - height) < 0.01, `${id} ${width}×${height}: reaches its height`);
  ok(pts.every(([u, y]) => Math.abs(u) <= width / 2 + 1e-9 && y >= 0), `${id} ${width}×${height}: stays inside its width`);
}
{
  const a = archOf({ x: 10, z: 20, width: 4, height: 7, turn: 90 });
  const [f1, f2] = archFeet(a);
  ok(Math.abs(f1[0] - 8) < 1e-9 && Math.abs(f2[0] - 12) < 1e-9 && Math.abs(f1[1] - 20) < 1e-9, "turned 90°, the legs stand side to side");
  ok(nearestArch([a], 12.5, 20)?.leg === 1 && nearestArch([a], 30, 20) === null, "a vine climbs the nearest leg within reach");
}

// ---------- timing the owner confirmed (October 2026) ----------
const blue = seasonal("blueberry");
ok(blue.Apr === "leafing" && blue.May === "bloom" && blue.Jun === "fruit", "blueberry: pink buds in April, flowers in May, berries from June");
ok(LOOK.blueberry.months[m("Jun")].fruit !== LOOK.blueberry.fruit, "blueberry: June berries are still green, blue from July");
const nast = seasonal("nasturtium");
ok(nast.Jun === "foliage" && nast.Jul === "bloom", "nasturtium: young plants in June, flowers from July");
for (const id of ["ornamental-grass", "unknown-pot", "weeds", "wild-fenceline"]) ok(!species.some((s) => s.id === id) && !LOOK[id], `${id}: taken out of the catalog`);
ok(species.some((s) => s.id === "unknown-perennial") && !plants.some((p) => p.speciesId === "unknown-perennial"), "unknown perennial stays only for adding unidentified plants");
ok(LOOK.iris.shape === "fan", "iris: bearded iris fans");

console.log(`shapes: ${checks} checks passed`);
