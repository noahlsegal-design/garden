// Works out what's due in a given week from the care months in species.json and the frost dates in
// layout.json (site), and keeps your check-offs and recorded first-frost dates in sync with the Mac.
// Nothing here draws anything; tasklist.js draws the "This week" panel.

import { MONTHS } from "./data.js";

// ---------- dates (always local midnight) ----------
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? new Date(+m[1], m[2] - 1, +m[3]) : null;
}
// Weeks run Monday to Sunday so a weekend stays in one week.
export const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));

// ---------- the yard's key dates ----------
// Stored in layout.json → site as "MM-DD". A first frost you record replaces the typical date for that year.
export const EVENT_NAMES = {
  lastSpringFrost: "last spring frost",
  safePlantingDate: "safe planting date",
  earlyFrostWatch: "frost watch",
  firstFallFrost: "first frost",
  hardFreeze: "first hard freeze",
};
function typicalDate(site, key, year) {
  const m = /^(\d{2})-(\d{2})$/.exec(site?.[key] || "");
  return m ? new Date(year, m[1] - 1, +m[2]) : null;
}
export function eventDate(site, key, year, frosts = {}) {
  const typical = typicalDate(site, key, year);
  const recorded = parseYmd(frosts[year]);
  if (recorded && key === "firstFallFrost") return { date: recorded, recorded: true };
  // A hard freeze can't come before the first frost.
  if (recorded && key === "hardFreeze" && (!typical || recorded > typical)) return { date: recorded, recorded: true };
  return typical ? { date: typical, recorded: false } : null;
}

// ---------- how each care entry becomes a task ----------
// Water, harvest and pest entries are weekly rounds, and everything else is a one-time job for its stretch of
// months. A care entry can change that with "repeat" ("weekly", "monthly" or "once"). "tip": true makes it a
// reminder with no checkbox.
const WEEKLY_TYPES = ["water", "harvest", "pest"];
export function repeatOf(c) {
  if (c.tip) return "tip";
  if (["weekly", "monthly", "once"].includes(c.repeat)) return c.repeat;
  return WEEKLY_TYPES.includes(c.type) ? "weekly" : "once";
}

export const ROUNDS = [
  { id: "water", name: "Watering", blurb: "In dry spells" },
  { id: "harvest", name: "Picking & cutting", blurb: "Harvest what's ready and cut flowers" },
  { id: "pest", name: "Pest & disease check", blurb: "A quick look for these problems" },
  { id: "tidy", name: "Deadhead, pinch & weed", blurb: "Keeps flowers coming and weeds down" },
];
const roundOf = (c) => (WEEKLY_TYPES.includes(c.type) ? c.type : "tidy");

// A short fingerprint of the entry's text, so a check-off stays with its task even if entries get reordered.
// Rewording an entry starts it fresh.
function fingerprint(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const itemId = (speciesId, c) => `${speciesId}:${c.type}:${fingerprint(c.text || "")}`;

// The dates a care entry covers around day d: its unbroken run of months (which can wrap past December, like
// Dec–Mar), or just d's month for monthly tasks. Then trimmed by any "after"/"before" date from layout.json.
function windowAt(c, monthSet, d, site, frosts, monthly) {
  const m = d.getMonth(), y = d.getFullYear();
  let start = m, end = m;
  if (!monthly) {
    for (let n = 1; n < 12 && monthSet.has((start + 11) % 12); n++) start = (start + 11) % 12;
    for (let n = 1; n < 12 && monthSet.has((end + 1) % 12) && (end + 1) % 12 !== start; n++) end = (end + 1) % 12;
  }
  const naturalFrom = new Date(start <= m ? y : y - 1, start, 1);
  const naturalTo = new Date(end >= m ? y : y + 1, end + 1, 0);
  const w = { key: ymd(naturalFrom).slice(0, 7), from: naturalFrom, to: naturalTo, starts: null, ends: null };
  const year = naturalFrom.getFullYear();

  if (c.after) {
    const ev = eventDate(site, c.after, year, frosts);
    if (ev) {
      const days = Number(c.afterDays) || 0;
      const at = addDays(ev.date, days);
      w.starts = { event: c.after, eventDate: ev.date, recorded: ev.recorded, days };
      // A frost you recorded is the real start, even if it came before the months listed.
      if (at > w.from || ev.recorded) w.from = at;
      if (w.from > w.to) w.to = addDays(w.from, 13); // it came later than the months listed: still allow two weeks
    }
  }
  if (c.before) {
    const ev = eventDate(site, c.before, year, frosts);
    if (ev) {
      w.ends = { event: c.before, eventDate: ev.date, recorded: ev.recorded };
      const last = addDays(ev.date, -1);
      if (last < w.to) w.to = last;
    }
  }
  return w;
}

const LOOKBACK = 60; // days: catches stretches that began before this week
export const HORIZON = 28; // days after this week that "Coming up" covers

// Everything for the week starting on Monday `weekStart`.
// `done` maps check-off keys to the date they were checked; `frosts` maps a year to the first-frost date you recorded.
export function buildWeek(garden, { weekStart, frosts = {}, done = {}, areaOrder = [] }) {
  const site = garden.layout.site || {};
  const weekEnd = addDays(weekStart, 6);
  const horizonEnd = addDays(weekEnd, HORIZON);
  const areaRank = (p) => { const i = areaOrder.indexOf(p.area); return i < 0 ? 99 : i; };

  // Plants marked "finished" (for example, crops done for the season) drop out from that week on.
  const lastDay = ymd(weekEnd);
  const plantsBySpecies = new Map();
  for (const p of garden.plants) {
    if (p.finished && p.finished <= lastDay) continue;
    if (!plantsBySpecies.has(p.speciesId)) plantsBySpecies.set(p.speciesId, []);
    plantsBySpecies.get(p.speciesId).push(p);
  }

  const jobs = [], earlier = [], tips = [], soon = [];
  const rounds = new Map(ROUNDS.map((r) => [r.id, { ...r, items: [] }]));

  for (const sp of garden.species.values()) {
    const plants = plantsBySpecies.get(sp.id);
    if (!plants) continue;
    const rank = Math.min(...plants.map(areaRank));
    for (const c of sp.care || []) {
      const monthSet = new Set((c.months || []).map((m) => MONTHS.indexOf(m)).filter((i) => i >= 0));
      if (!monthSet.size) continue;
      const repeat = repeatOf(c);
      const id = itemId(sp.id, c);

      const windows = new Map();
      for (let d = addDays(weekStart, -LOOKBACK); d <= horizonEnd; d = addDays(d, 1)) {
        if (!monthSet.has(d.getMonth())) continue;
        const w = windowAt(c, monthSet, d, site, frosts, repeat === "monthly");
        if (!windows.has(w.key)) windows.set(w.key, w);
      }

      // Windows come out in date order. Each entry is listed at most once a week: when a monthly job's
      // next month starts mid-week, it waits until this month's is done and the week is over.
      let listed = false;
      for (const w of windows.values()) {
        if (w.to < w.from) continue; // e.g. the frost came before this stretch began
        // Once you've recorded the frost, "before frost" chores are over for that whole week.
        const tooLate = w.ends?.recorded && w.ends.eventDate <= weekEnd;
        const inWeek = w.from <= weekEnd && w.to >= weekStart && !tooLate;
        const item = { id, sp, care: c, plants, repeat, window: w, rank };
        if (repeat === "tip" || repeat === "weekly") {
          if (!inWeek || listed) continue;
          listed = true;
          if (repeat === "tip") tips.push(item);
          else {
            item.key = `w|${id}|${ymd(weekStart)}`;
            item.done = done[item.key] || null;
            rounds.get(roundOf(c)).items.push(item);
          }
          continue;
        }
        // One-time jobs get a check-off per plant (dig each dahlia, for example). The job is done when every
        // plant is, and counts as done on the last day one was checked.
        item.key = `j|${id}|${w.key}`;
        item.plantKeys = plants.map((p) => `${item.key}|${p.id}`);
        const stamps = item.plantKeys.map((k) => done[k]).filter(Boolean).sort();
        item.doneCount = stamps.length;
        item.done = stamps.length === plants.length ? stamps.at(-1) : null;
        if (inWeek) {
          if (item.done && parseYmd(item.done) < weekStart) earlier.push(item);
          else if (!listed) { jobs.push(item); listed = true; }
        } else if (w.from > weekEnd && w.from <= horizonEnd && !item.done) soon.push(item);
      }
    }
  }

  const byPlace = (a, b) => a.rank - b.rank || a.sp.commonName.localeCompare(b.sp.commonName);
  jobs.sort((a, b) => a.window.to - b.window.to || byPlace(a, b));
  earlier.sort(byPlace);
  tips.sort(byPlace);
  soon.sort((a, b) => a.window.from - b.window.from || byPlace(a, b));
  for (const r of rounds.values()) r.items.sort(byPlace);

  // Frost and planting milestones in the "Coming up" stretch.
  const milestones = [];
  for (const y of new Set([weekEnd.getFullYear(), horizonEnd.getFullYear()])) {
    for (const key of Object.keys(EVENT_NAMES)) {
      if (key === "earlyFrostWatch" && frosts[y]) continue; // no need to watch once it has frosted
      const ev = eventDate(site, key, y, frosts);
      if (ev && ev.date > weekEnd && ev.date <= horizonEnd) milestones.push({ key, ...ev });
    }
  }
  milestones.sort((a, b) => a.date - b.date);

  return { weekStart, weekEnd, jobs, earlier, rounds: [...rounds.values()].filter((r) => r.items.length), tips, soon, milestones };
}

// How many things are still open: each unfinished job, plus each weekly round with anything left in it.
export function openCount(week) {
  return week.jobs.filter((j) => !j.done).length + week.rounds.filter((r) => r.items.some((i) => !i.done)).length;
}

// What the frost note at the top of "This week" should say on a given day, or null for none.
export function frostStatus(site, day, frosts = {}) {
  const year = day.getFullYear(), m = day.getMonth();
  const get = (key) => eventDate(site, key, year, frosts);
  if (m >= 8 && m <= 10) { // September to November
    const first = get("firstFallFrost"), watch = get("earlyFrostWatch");
    if (!first) return null;
    if (first.recorded) return { phase: "recorded", year, first };
    if (watch && day < watch.date) return { phase: "before-watch", year, first, watch };
    return { phase: day <= first.date ? "watch" : "overdue", year, first, watch };
  }
  if (m >= 2 && m <= 4) { // March to May
    const safe = get("safePlantingDate"), last = get("lastSpringFrost");
    if (!safe) return null;
    return { phase: day < safe.date ? "spring" : "planting", year, safe, last };
  }
  return null;
}

// ---------- remembering check-offs ----------
// Check-offs are saved in one shared place so every device sees the same list: your garden account on
// Supabase once the app is online (cloud.js), or data/checkoffs.json on the Mac before that (serve.py).
// A change made while that place can't be reached waits in this browser and goes through the next time it can.
const API = "api/checkoffs";
const OLD_KEY = "garden.tasks.v1"; // where check-offs lived before they were shared
const WAITING_KEY = "garden.tasks.waiting";
const COPY_KEY = "garden.tasks.copy"; // the last list that was saved, for when it can't be reached

function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function writeLocal(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private browsing: nothing to do */ }
}

// A change is { set: {key: date}, unset: [keys], frosts: {year: date or null} }.
function applyChange(checks, change) {
  Object.assign(checks.done, change.set || {});
  for (const k of change.unset || []) delete checks.done[k];
  for (const [year, date] of Object.entries(change.frosts || {})) {
    if (date) checks.frosts[year] = date;
    else delete checks.frosts[year];
  }
  return checks;
}
function combine(a, b) {
  const out = { set: { ...(a?.set || {}) }, unset: [...(a?.unset || [])], frosts: { ...(a?.frosts || {}), ...(b.frosts || {}) } };
  for (const [k, v] of Object.entries(b.set || {})) { out.set[k] = v; out.unset = out.unset.filter((u) => u !== k); }
  for (const k of b.unset || []) { delete out.set[k]; if (!out.unset.includes(k)) out.unset.push(k); }
  return out;
}
const isEmpty = (c) => !c || (!Object.keys(c.set || {}).length && !(c.unset || []).length && !Object.keys(c.frosts || {}).length);
const copyOf = (state) => ({ done: { ...(state?.done || {}) }, frosts: { ...(state?.frosts || {}) } });

// True when the app is being served by the Mac itself (serve.py) rather than from the internet.
function servedByMac() {
  const host = globalThis.location?.hostname || "localhost";
  return host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

// The Mac (serve.py). Its errors say "offline"; "old-server" when the Mac runs an app from before check-offs
// were shared; or "device" when the app is online and no garden account is connected yet.
async function askMac(change) {
  let res;
  try {
    res = change
      ? await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) })
      : await fetch(API, { cache: "no-store" });
  } catch {
    throw Object.assign(new Error("offline"), { status: "offline" });
  }
  const missing = res.status === 404 || res.status === 501;
  if (!res.ok) throw Object.assign(new Error("mac"), { status: missing ? (servedByMac() ? "old-server" : "device") : "offline" });
  return res.json();
}
export const macBackend = { load: () => askMac(null), save: (change) => askMac(change) };

// Before, a whole job was checked off at once. Each plant now has its own box, so an old job check-off
// becomes one per plant of that kind.
function splitOldJobChecks(done, plants) {
  const out = {};
  for (const [k, v] of Object.entries(done || {})) {
    const parts = k.split("|");
    if (parts[0] === "j" && parts.length === 3) {
      const speciesId = parts[1].split(":")[0];
      for (const p of plants) if (p.speciesId === speciesId) out[`${k}|${p.id}`] = v;
    } else out[k] = v;
  }
  return out;
}

// The shared list of check-offs, kept in step with a backend (the Mac or Supabase). Each backend has
// load() → { done, frosts } and save(change) → the new list, or null to apply the change to the last copy.
// `status` is "loading", "saved", or why saving isn't possible right now: "offline", "signed-out",
// "old-server" or "setup".
export function createCheckStore(plants, backend, onUpdate) {
  const checks = { done: {}, frosts: {}, status: "loading" };
  let saved = copyOf(readLocal(COPY_KEY));
  let waiting = readLocal(WAITING_KEY);
  const old = readLocal(OLD_KEY);
  if (old) {
    waiting = combine({ set: splitOldJobChecks(old.done, plants), frosts: old.frosts || {} }, waiting || {});
    writeLocal(WAITING_KEY, waiting);
    writeLocal(OLD_KEY, null);
  }
  const queue = []; // changes on their way, oldest first
  let sending = false;

  function show(status = checks.status) {
    const now = copyOf(saved);
    if (waiting) applyChange(now, waiting);
    for (const c of queue) applyChange(now, c);
    Object.assign(checks, now, { status });
    onUpdate();
  }
  function keep(state) {
    saved = copyOf(state);
    writeLocal(COPY_KEY, saved);
  }
  const whyNot = (err) => err?.status || "offline";

  // Sends anything waiting in this browser, then fetches the latest list (say, after checking things off on
  // another device).
  async function refresh() {
    try {
      if (!isEmpty(waiting)) {
        keep((await backend.save(waiting)) || applyChange(copyOf(saved), waiting));
        waiting = null;
        writeLocal(WAITING_KEY, null);
      }
      keep(await backend.load());
      show("saved");
    } catch (err) {
      show(whyNot(err));
    }
  }

  function change(c) {
    queue.push(c);
    show();
    if (!sending) sendQueue();
  }
  async function sendQueue() {
    sending = true;
    while (queue.length) {
      const c = queue[0];
      try {
        const state = await backend.save(c);
        queue.shift();
        keep(state || applyChange(copyOf(saved), c));
        show("saved");
      } catch (err) {
        queue.shift();
        waiting = combine(waiting, c);
        writeLocal(WAITING_KEY, waiting);
        show(whyNot(err));
      }
    }
    sending = false;
  }

  // After signing out, the saved list isn't shown on this device any more.
  function forget() {
    keep({});
    writeLocal(COPY_KEY, null);
    show("signed-out");
  }

  return { checks, refresh, change, forget };
}
