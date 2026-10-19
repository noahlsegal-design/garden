// Checks the Plants screen's filters and sorting (app/plantlist.js) against the real garden data.
// Run from the project folder: node tests/plantlist.test.mjs

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { NO_FILTERS, filterPlants, sortPlants, activeCount, isEdible, feedType, FEEDS } from "../app/plantlist.js";
import { dogSafety } from "../app/data.js";

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const species = new Map(read("species.json").species.map((s) => [s.id, s]));
const plants = read("plants.json").plants.filter((p) => species.has(p.speciesId));
const today = new Date(2026, 9, 18);
const ctx = { species, areaNames: new Map(), month: 9, today, todos: new Map(), added: new Map() };
const run = (f, c = ctx) => filterPlants(plants, { ...NO_FILTERS, ...f }, c);
let checks = 0;
const ok = (cond, msg) => { assert(cond, msg); checks++; };

ok(run({}).length === plants.length, "All shows every plant");
// Dog-toxic and Dog-safe never overlap, and between them they cover every plant whose safety is known.
const toxic = new Set(run({ chip: "toxic" }).map((p) => p.id)), safe = run({ chip: "safe" });
ok(safe.every((p) => !toxic.has(p.id)), "no plant is both dog-toxic and dog-safe");
ok(toxic.size + safe.length === plants.length, "every plant is either a dog risk or safe");
ok(run({ chip: "toxic" }).every((p) => dogSafety(p, species.get(p.speciesId)).status !== "non-toxic"), "Dog-toxic leaves out non-toxic plants");

// October: dahlias are blooming and ready to cut; peonies are neither.
const names = (list) => new Set(list.map((p) => p.speciesId));
ok(names(run({ chip: "blooming" })).has("dahlia"), "dahlias bloom in October");
ok(!names(run({ chip: "blooming" })).has("peony"), "peonies don't bloom in October");
ok(names(run({ chip: "pick" })).has("dahlia"), "dahlias are ready to cut in October");
ok(!names(run({ chip: "pick" })).has("peony"), "peonies aren't ready to pick in October");
ok(!run({ chip: "blooming" }, { ...ctx, month: 0 }).length, "nothing blooms in January");

// Type: Flowers and Edibles split the garden; both ticked is the same as neither.
const edibles = run({ types: ["edibles"] }), flowers = run({ types: ["flowers"] });
ok(edibles.length + flowers.length === plants.length, "every plant is a flower or an edible");
ok(run({ types: ["flowers", "edibles"] }).length === plants.length, "ticking both types shows everything");
ok(isEdible(species.get("tomato")) && isEdible(species.get("basil")) && !isEdible(species.get("dahlia")) && !isEdible(species.get("peony")), "tomato and basil are edible; dahlia and peony aren't");

// Beds are any of the ticked ones.
const [a, b] = [...new Set(plants.map((p) => p.area))];
ok(run({ beds: [a, b] }).length === plants.filter((p) => p.area === a || p.area === b).length, "two beds show the plants in either");

// Show only: has to-dos, and new this month (added in the app this month).
const [p1, p2, p3] = plants;
const c2 = { ...ctx, todos: new Map([[p1.id, 2], [p2.id, 1]]), added: new Map([[p3.id, new Date(2026, 9, 2)], [p2.id, new Date(2026, 8, 30)]]) };
ok(run({ only: ["todos"] }, c2).length === 2, "Has to-dos");
ok(run({ only: ["new"] }, c2).map((p) => p.id).join() === p3.id, "New this month leaves out last month's");
ok(!run({ only: ["todos", "new"] }, c2).length, "Show only options all have to hold");

// Search looks at names, labels and kinds.
ok(run({ q: "DAHLIA" }).length === plants.filter((p) => p.speciesId === "dahlia" || /dahlia/i.test(p.name)).length, "search ignores case and finds kinds");

// Sorting.
const order = (sort, c = ctx) => sortPlants(plants, sort, c).flatMap((g) => g.plants.map((p) => p.id));
const az = sortPlants(plants, "az", ctx);
ok(az.length === 1 && az[0].heading === null && az[0].plants.length === plants.length, "A–Z is one group");
ok(az[0].plants.every((p, i, l) => !i || l[i - 1].name.localeCompare(p.name, "en", { sensitivity: "base", numeric: true }) <= 0), "A–Z is in name order");
ok(order("todos", c2).slice(0, 2).join() === `${p1.id},${p2.id}`, "To-dos first puts the most to-dos first");
ok(order("newest", c2).slice(0, 2).join() === `${p3.id},${p2.id}`, "Newest puts the latest added first");
const feed = sortPlants(plants, "feed", ctx);
ok(feed.every((g) => g.heading && g.plants.length), "Fertilizer groups each have a heading and plants");
ok(feed.reduce((n, g) => n + g.plants.length, 0) === plants.length, "Fertilizer groups hold every plant once");
ok(feed.map((g) => g.heading).join() === FEEDS.filter(([id]) => feed.some((g) => g.heading === FEEDS.find(([k]) => k === id)[1])).map(([, h]) => h).join(), "Fertilizer groups keep their set order");
ok(feedType(species.get("blueberry")) === "acid" && feedType(species.get("dahlia")) === "low-n" && feedType(species.get("peony")) === "compost" && feedType(species.get("hosta")) === "none", "feed types");

ok(activeCount(NO_FILTERS) === 0, "nothing in use by default");
ok(activeCount({ ...NO_FILTERS, sort: "feed", beds: ["a", "b"], only: ["new"], chip: "toxic", q: "x" }) === 4, "the filter button counts sort, beds, types and show only");

console.log(`plantlist: all ${checks} checks passed`);
