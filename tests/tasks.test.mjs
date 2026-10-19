// Checks the "This week" task engine (app/tasks.js) against the real garden data.
// Run from the project folder: node tests/tasks.test.mjs
// A few checks name particular plants (peonies, dahlias, loofah…). They skip themselves if that kind is no
// longer in the garden, so editing plants.json won't break them.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { buildWeek, openCount, mondayOf, parseYmd, ymd, addDays, repeatOf, jobsByDay } from "../app/tasks.js";

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const speciesFile = read("species.json"), plantsFile = read("plants.json"), layout = read("layout.json");
const species = new Map(speciesFile.species.map((s) => [s.id, s]));
const garden = { species, plants: plantsFile.plants.filter((p) => species.has(p.speciesId)), layout };
const areaOrder = [...layout.areas.map((a) => a.id), "fenceline"];

const week = (day, opts = {}) => buildWeek(garden, { weekStart: mondayOf(parseYmd(day)), areaOrder, ...opts });
const find = (list, spId, type) => list.find((i) => i.sp.id === spId && i.care.type === type);
const everything = (w) => [...w.jobs, ...w.rounds.flatMap((r) => r.items), ...w.tips];
const grown = (id) => garden.plants.some((p) => p.speciesId === id && !p.finished);
let ran = 0, skipped = 0;
function check(name, kinds, fn) {
  if (!kinds.every(grown)) { skipped++; return; }
  try { fn(); ran++; } catch (err) { err.message = `${name}: ${err.message}`; throw err; }
}

check("late September: jobs now, after-frost jobs coming up", ["peony", "dahlia"], () => {
  const w = week("2026-09-24");
  assert(find(w.jobs, "peony", "divide"), "peony division is a September job");
  assert(!find(w.jobs, "peony", "winter"), "peony cleanup waits for frost");
  assert(find(w.soon, "peony", "winter"), "peony cleanup shows under Coming up");
  assert.equal(ymd(find(w.soon, "dahlia", "winter").window.from), "2026-10-22", "dahlia digging a week after the typical Oct 15 frost");
  assert(w.milestones.some((m) => m.key === "earlyFrostWatch"));
});

check("mid-October with no frost recorded uses the typical date", ["peony", "dahlia"], () => {
  const w = week("2026-10-16");
  assert(find(w.jobs, "peony", "winter"));
  const dig = find(w.soon, "dahlia", "winter") || find(w.jobs, "dahlia", "winter");
  assert.equal(ymd(dig.window.from), "2026-10-22");
});

check("a recorded frost moves after-frost jobs and ends before-frost chores", ["peony", "dahlia", "cosmos", "loofah"], () => {
  const frosts = { 2026: "2026-10-06" };
  const w = week("2026-10-08", { frosts });
  assert(find(w.jobs, "peony", "winter"));
  const dig = find(w.jobs, "dahlia", "winter") || find(w.soon, "dahlia", "winter");
  assert.equal(ymd(dig.window.from), "2026-10-13");
  const rounds = w.rounds.flatMap((r) => r.items);
  assert(!rounds.some((i) => i.sp.id === "cosmos"), "cosmos deadheading stops the week of the frost");
  assert(rounds.some((i) => i.sp.id === "loofah"), "loofah picking runs until the hard freeze");
  const late = week("2026-10-26", { frosts });
  assert(!late.rounds.flatMap((r) => r.items).some((i) => i.sp.id === "loofah"), "and stops after it");
});

check("an early frost starts after-frost jobs before their listed months", ["peony", "dahlia", "basil"], () => {
  const w = week("2026-09-24", { frosts: { 2026: "2026-09-23" } });
  assert.equal(ymd(find(w.jobs, "peony", "winter").window.from), "2026-09-23");
  assert.equal(ymd(find(w.soon, "dahlia", "winter").window.from), "2026-09-30");
  assert(!find(w.jobs, "basil", "harvest"), "basil harvest is over once it has frosted");
});

check("one check-off per plant; done earlier is tucked away; rounds reset weekly", ["peony"], () => {
  const w0 = week("2026-09-24");
  const job = find(w0.jobs, "peony", "divide");
  assert.equal(job.plantKeys.length, job.plants.length);
  const some = Object.fromEntries(job.plantKeys.slice(0, 1).map((k) => [k, "2026-09-24"]));
  const all = Object.fromEntries(job.plantKeys.map((k) => [k, "2026-09-24"]));
  if (job.plants.length > 1) {
    const partial = find(week("2026-09-24", { done: some }).jobs, "peony", "divide");
    assert(!partial.done && partial.doneCount === 1, "one of several done is still open");
  }
  const w1 = week("2026-09-24", { done: all });
  assert(find(w1.jobs, "peony", "divide").done);
  assert.equal(openCount(w1), openCount(w0) - 1);
  const next = week("2026-09-28", { done: all });
  assert(next.earlier.some((j) => j.key === job.key) && !next.jobs.some((j) => j.key === job.key));
  const round = w0.rounds[0];
  const nextRound = week("2026-09-28", { done: { [round.items[0].key]: "2026-09-24" } }).rounds.find((r) => r.id === round.id);
  assert(!nextRound?.items.some((i) => i.done), "weekly rounds start fresh");
});

check("finished plants drop out from the week they finish", [], () => {
  for (const p of garden.plants.filter((pl) => pl.finished)) {
    const after = addDays(parseYmd(p.finished), 7);
    for (let d = after, i = 0; i < 20; i++, d = addDays(d, 14)) {
      const w = buildWeek(garden, { weekStart: mondayOf(d), areaOrder });
      assert(!everything(w).some((it) => it.plants.includes(p)), `${p.id} still listed in the week of ${ymd(mondayOf(d))}`);
    }
  }
});

check("monthly tuber checks: one row across New Year, one box per dahlia", ["dahlia"], () => {
  const w = week("2026-12-31");
  const rows = w.jobs.filter((j) => j.sp.id === "dahlia");
  assert.equal(rows.length, 1);
  assert(rows[0].key.endsWith("2026-12"));
  assert.equal(rows[0].plantKeys.length, garden.plants.filter((p) => p.speciesId === "dahlia" && !p.finished).length);
  const doneDec = Object.fromEntries(rows[0].plantKeys.map((k) => [k, "2026-12-10"]));
  assert(week("2026-12-31", { done: doneDec }).jobs.some((j) => j.sp.id === "dahlia" && j.key.endsWith("2027-01")));
});

check("spring planting waits for the safe planting date", ["tomato"], () => {
  assert(!find(week("2027-05-05").jobs, "tomato", "plant"));
  assert(find(week("2027-05-05").soon, "tomato", "plant"));
  assert.equal(ymd(find(week("2027-05-12").jobs, "tomato", "plant").window.from), "2027-05-15");
});

check("every care entry uses known timing words", [], () => {
  for (const s of species.values()) for (const c of s.care) {
    assert(["tip", "weekly", "monthly", "once"].includes(repeatOf(c)), `${s.id}: repeat "${c.repeat}"`);
    if (c.after) assert(layout.site[c.after], `${s.id}: unknown after "${c.after}"`);
    if (c.before) assert(layout.site[c.before], `${s.id}: unknown before "${c.before}"`);
  }
});

check("a whole year of weeks: no errors, nothing listed twice", [], () => {
  let d = parseYmd("2026-09-21");
  for (let i = 0; i < 53; i++, d = addDays(d, 7)) {
    const w = buildWeek(garden, { weekStart: d, areaOrder });
    const ids = everything(w).map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate in the week of ${ymd(d)}`);
  }
});

// The Calendar's days (jobsByDay): the same jobs as This week, each on one day.
const keysOn = (list) => list.flatMap((e) => (e.job ? e.plants.map((i) => e.job.plantKeys[i]) : e.items.map((it) => it.key)));
check("Calendar: this week's open jobs are on today, or on the day they start", ["dahlia"], () => {
  const today = parseYmd("2026-10-19"), w = week("2026-10-19");
  const days = jobsByDay(garden, { from: mondayOf(today), to: addDays(mondayOf(today), 6), today, areaOrder });
  const all = [...days.values()].flat();
  // Every open job and round on This week is somewhere this week, once.
  const keys = keysOn(all);
  assert.equal(new Set(keys).size, keys.length, "nothing twice");
  for (const j of w.jobs) for (const k of j.plantKeys) assert(keys.includes(k), `${j.sp.id} ${j.care.type} is on a day`);
  for (const r of w.rounds) for (const it of r.items) assert(keys.includes(it.key), `${it.sp.id} ${r.id} is on a day`);
  // Nothing before today, and dahlia digging waits for a week after the typical frost.
  assert([...days.keys()].every((d) => d >= "2026-10-19"));
  assert(days.get("2026-10-22").some((e) => e.job?.sp.id === "dahlia" && e.job.care.type === "winter"));
});

check("Calendar: check-offs are on the day they were made, open jobs aren't shown on past days", ["peony"], () => {
  const today = parseYmd("2026-10-21"), w = week("2026-10-19");
  const job = find(w.jobs, "peony", "winter"), round = w.rounds[0];
  const done = { [job.plantKeys[0]]: "2026-10-19", [round.items[0].key]: "2026-10-20" };
  const days = jobsByDay(garden, { from: parseYmd("2026-10-19"), to: parseYmd("2026-10-25"), today, done, areaOrder });
  assert.deepEqual(keysOn(days.get("2026-10-19")), [job.plantKeys[0]], "only the peony checked off on Monday");
  assert.deepEqual(keysOn(days.get("2026-10-20")), [round.items[0].key], "only the round item checked off on Tuesday");
  const rest = keysOn(days.get("2026-10-21"));
  assert(job.plantKeys.slice(1).every((k) => rest.includes(k)) && !rest.includes(job.plantKeys[0]), "the other peonies are still due today");
});

check("Calendar: later weeks put rounds on Monday and nothing open from before", [], () => {
  const today = parseYmd("2026-07-08");
  const from = parseYmd("2026-07-13"), to = parseYmd("2026-07-19");
  const days = jobsByDay(garden, { from, to, today, areaOrder });
  const w = buildWeek(garden, { weekStart: from, areaOrder });
  for (const [d, list] of days) for (const e of list) {
    if (e.round) assert(e.items.every((it) => ymd(it.window.from > from ? it.window.from : from) === d), `${e.round.id} on its first day`);
    else assert.equal(d, ymd(e.job.window.from), `${e.job.sp.id} ${e.job.care.type} on the day it starts`);
  }
  assert(w.rounds.every((r) => days.get("2026-07-13")?.some((e) => e.round?.id === r.id) || r.items.every((it) => it.window.from > from)));
});

console.log(`tasks: ${ran} checks passed${skipped ? `, ${skipped} skipped (those plants aren't in the garden now)` : ""}`);
