// The Calendar screen, with a Year / Month / Week switch at the top.
// Year: the plants that matter this month (in flower, ready to pick, or with a job this month) as photo cards,
// then the whole year as a timeline of bloom (pink) and harvest (orange) from each kind's seasonal stages.
// Month: a month grid with a coloured dot for each kind of job on a day; tapping a day lists its jobs.
// Week: how many jobs each day has, then each day that has any in its own panel.
// The jobs are the same ones as Today and This week (jobsByDay in tasks.js). Past jobs show who checked them off.

import { MONTHS, MONTH_NAMES, CARE_TYPES, STATE_TEXT, careFor, shownStateFor, esc } from "./data.js";
import { jobsByDay, repeatOf, addDays, mondayOf, ymd, parseYmd } from "./tasks.js";
import { plainName, typeName, firstSentence, CHECK, pictureOf, placeholder, imgTag, loadNoteThumbs } from "./today.js";

const VIEWS = [["year", "Year"], ["month", "Month"], ["week", "Week"]];
const VIEW_KEY = "garden.calendar.view";
// What's showing: the view, the month and week shown, and the day picked in the month. Kept while the app is open.
const ui = { view: null, month: null, week: null, day: null, today: null };
function savedView() {
  try { const v = localStorage.getItem(VIEW_KEY); return VIEWS.some(([id]) => id === v) ? v : "month"; } catch { return "month"; }
}
function saveView(v) {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* private browsing: it just won't be remembered */ }
}

// ---------- dates ----------
const sameDay = (a, b) => a && b && a.getTime() === b.getTime();
const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthEnd = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const fmt = (d, opts) => d.toLocaleDateString("en-US", opts);
const longDay = (d) => fmt(d, { weekday: "long", month: "long", day: "numeric" });
function weekText(monday) {
  const sun = addDays(monday, 6);
  const a = fmt(monday, { month: "short", day: "numeric" });
  return monday.getMonth() === sun.getMonth() ? `${a} – ${sun.getDate()}` : `${a} – ${fmt(sun, { month: "short", day: "numeric" })}`;
}

// ---------- the kinds of job, and their dot colours ----------
// One-time jobs go by their care type, weekly rounds by the round (water, harvest, pest, tidy).
export const JOB_COLORS = {
  water: "#3D86C6", harvest: "#E0892B", pest: "#C9483A", tidy: "#4E8C45", prune: "#4E8C45",
  feed: "#9A7038", plant: "#86B85A", prep: "#86B85A", divide: "#C7A536", winter: "#9C7BD8",
};
const JOB_NAMES = { tidy: "Deadhead & weed", harvest: "Pick", pest: "Pests" };
const kindOf = (e) => (e.job ? e.job.care.type : e.round.id);
const kindName = (k) => JOB_NAMES[k] || CARE_TYPES[k] || k;

// ---------- one entry on a day ----------
// The check-off keys an entry covers that day, and the plants it's about.
const keysOf = (e) => (e.job ? e.plants.map((i) => e.job.plantKeys[i]) : e.items.map((it) => it.key));
const plantsOf = (e) => (e.job ? e.plants.map((i) => e.job.plants[i]) : e.items.flatMap((it) => it.plants));
function entryText(e) {
  if (e.job) {
    const n = e.plants.length;
    return { title: `${plainName(e.job.sp)}${n > 1 ? ` · ${n}` : ""}`, line: `${typeName(e.job.care.type)} · ${firstSentence(e.job.care.text)}`, label: `${typeName(e.job.care.type)}: ${e.job.sp.commonName}` };
  }
  const names = [...new Set(e.items.map((it) => plainName(it.sp)))];
  return { title: e.round.name, line: names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", "), label: e.round.name };
}

// Who checked an entry off: the other person's name from the shared garden, or yours.
function whoDid(keys, o) {
  const names = [];
  for (const k of keys) {
    if (!o.done[k]) continue;
    const name = o.doneBy[k] || o.me;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}
const initialOf = (name) => name.trim().charAt(0).toUpperCase() || "?";

function rowHtml(e, day, o, newest) {
  const keys = keysOf(e), plants = plantsOf(e);
  const t = entryText(e);
  const isToday = sameDay(day, o.today), past = day < o.today;
  const doneN = keys.filter((k) => o.done[k]).length;
  const state = doneN === 0 ? "false" : doneN === keys.length ? "true" : "mixed";
  const pic = pictureOf(plants, newest);
  const who = whoDid(keys, o);
  const whoHtml = who.length ? `<span class="jwho" aria-label="Done by ${esc(who.join(" and "))}">${who.map((n) =>
    `<span class="initial${n === o.me ? "" : " other"}" title="${esc(n)}" aria-hidden="true">${esc(initialOf(n))}</span>`).join("")}</span>` : "";
  return `
    <li class="jrow${state === "true" ? " done" : ""}">
      <button type="button" class="jopen" data-plant="${esc(plants[0]?.id || "")}" aria-label="${esc(t.label)}. ${esc(t.line)}">
        <span class="jpic" style="--c:${JOB_COLORS[kindOf(e)] || "var(--muted)"}">${pic ? imgTag(pic, "") : placeholder(plants[0])}</span>
        <span class="jtext"><b>${esc(t.title)}</b><span>${esc(t.line)}</span></span>
      </button>
      ${past || (!isToday && state !== "false") ? whoHtml : ""}
      ${isToday ? `${whoHtml}<button type="button" class="jcheck" role="checkbox" aria-checked="${state}" data-keys="${esc(keys.join(" "))}" data-f="c:${esc(e.key)}" aria-label="Done: ${esc(t.label)}">${CHECK}</button>` : ""}
    </li>`;
}
const rowsHtml = (list, day, o, newest) => `<ul class="jrows">${list.map((e) => rowHtml(e, day, o, newest)).join("")}</ul>`;

// The dots under a day in the month grid: one per kind of job, three at most.
function dotsHtml(list) {
  const kinds = [...new Set((list || []).map(kindOf))];
  return `<span class="mdots" aria-hidden="true">${kinds.slice(0, 3).map((k) => `<i style="--c:${JOB_COLORS[k] || "var(--muted)"}"></i>`).join("")}</span>`;
}
const jobCount = (list) => (list || []).length;
const countText = (n) => (n ? `${n} ${n === 1 ? "job" : "jobs"}` : "no jobs");

// jobsByDay takes a moment, so the last answer is kept until the check-offs, plants or dates change.
let memo = null;
function daysFor(o, from, to) {
  const key = JSON.stringify([ymd(from), ymd(to), ymd(o.today), o.done, o.frosts]);
  if (memo?.key === key && memo.plants === o.garden.plants) return memo.days;
  const days = jobsByDay(o.garden, { from, to, today: o.today, frosts: o.frosts, done: o.done, areaOrder: o.areaOrder });
  memo = { key, plants: o.garden.plants, days };
  return days;
}

// ---------- Year ----------
const BLOOM = new Set(["bloom", "aging-bloom"]);
const HARVEST = new Set(["fruit", "harvest"]);
// The months a kind blooms and is picked, from its seasonal stages (with "Still growing" or "Dead" from a card).
function yearOf(sp, plants) {
  const st = (m) => shownStateFor(sp, m, plants.find((p) => p.seasonNow)?.seasonNow || null);
  return MONTHS.map((_, m) => (BLOOM.has(st(m)) ? "b" : HARVEST.has(st(m)) ? "h" : ""));
}
// Unbroken runs of the same mark: [{ mark, from, to }].
function runsOf(marks) {
  const runs = [];
  marks.forEach((mk, m) => {
    if (!mk) return;
    const last = runs.at(-1);
    if (last && last.mark === mk && last.to === m - 1) last.to = m;
    else runs.push({ mark: mk, from: m, to: m });
  });
  return runs;
}
const monthsText = (r) => (r.from === r.to ? MONTH_NAMES[r.from] : `${MONTHS[r.from]}–${MONTHS[r.to]}`);

// Each kind in the yard, with its plants and its year.
function kindsInYard(o) {
  const byKind = new Map();
  for (const p of o.garden.plants) {
    if (p.finished || p.removed) continue;
    if (!byKind.has(p.speciesId)) byKind.set(p.speciesId, []);
    byKind.get(p.speciesId).push(p);
  }
  return [...byKind].map(([id, plants]) => {
    const sp = o.garden.species.get(id);
    return { sp, plants, marks: yearOf(sp, plants) };
  });
}

// The kinds that matter this month: in flower, ready to pick, or with a one-time job (bloom first, then harvest,
// then jobs).
function mattersNow(kinds, m) {
  const out = [];
  for (const k of kinds) {
    const jobs = careFor(k.sp, m).filter((c) => ["once", "monthly"].includes(repeatOf(c)));
    const mark = k.marks[m];
    if (!mark && !jobs.length) continue;
    const run = runsOf(k.marks).find((r) => r.from <= m && r.to >= m);
    const tags = [];
    if (mark) tags.push(STATE_TEXT[shownStateFor(k.sp, m, k.plants.find((p) => p.seasonNow)?.seasonNow || null)]?.[0] || "");
    for (const c of jobs) if (!tags.includes(typeName(c.type))) tags.push(typeName(c.type));
    const line = mark === "b" ? `Blooms ${monthsText(run)}` : mark === "h" ? `Picking ${monthsText(run)}` : firstSentence(jobs[0].text);
    out.push({ ...k, rank: mark === "b" ? 0 : mark === "h" ? 1 : 2, tags, line });
  }
  return out.sort((a, b) => a.rank - b.rank || plainName(a.sp).localeCompare(plainName(b.sp)));
}

function yearHtml(o, newest) {
  const m = o.today.getMonth();
  const kinds = kindsInYard(o);
  const matters = mattersNow(kinds, m);
  const rows = kinds.filter((k) => k.marks.some(Boolean))
    .map((k) => ({ ...k, runs: runsOf(k.marks) }))
    .sort((a, b) => a.runs[0].from - b.runs[0].from || plainName(a.sp).localeCompare(plainName(b.sp)));
  const card = (k) => {
    const pic = pictureOf(k.plants, newest);
    const n = k.plants.length;
    return `<li><button type="button" class="mcard" data-plant="${esc(k.plants[0].id)}" aria-label="${esc(plainName(k.sp))}${n > 1 ? `, ${n} plants` : ""}. ${esc(k.tags.join(", "))}. ${esc(k.line)}">
      ${pic ? imgTag(pic, "") : placeholder(k.plants[0])}
      <span class="ptags" aria-hidden="true">${k.tags.slice(0, 2).map((t, i) => `<span class="ptag${i === 0 && k.rank === 0 ? " bloomtag" : i === 0 && k.rank === 1 ? " picktag" : ""}">${esc(t)}</span>`).join("")}</span>
      <span class="pcardtext" aria-hidden="true"><b>${esc(plainName(k.sp))}${n > 1 ? ` <i>×${n}</i>` : ""}</b><span>${esc(k.line)}</span></span>
    </button></li>`;
  };
  const rowLabel = (k) => `${plainName(k.sp)}: ${k.runs.map((r) => `${r.mark === "b" ? "blooms" : "picking"} ${monthsText(r)}`).join(", ")}`;
  return `
    <section class="calsec" aria-labelledby="mattersTitle">
      <h2 class="calh2" id="mattersTitle">In ${MONTH_NAMES[m]}</h2>
      ${matters.length ? `<ul class="mstrip">${matters.map(card).join("")}</ul>` : `<p class="calempty glass">Nothing flowering, to pick or to do this month.</p>`}
    </section>
    <section class="yeartl glass" aria-labelledby="yearTitle">
      <div class="tlhead">
        <h2 id="yearTitle">The year</h2>
        <ul class="tlkey" aria-hidden="true"><li class="b"><i></i>Bloom</li><li class="h"><i></i>Harvest</li></ul>
      </div>
      <div class="tlrows" style="--m:${m}">
        <div class="tlmonths" aria-hidden="true"><span></span>${MONTHS.map((mm, i) => `<span class="${i === m ? "now" : ""}">${mm[0]}</span>`).join("")}</div>
        <ul>${rows.map((k) => `
          <li><button type="button" class="tlrow" data-plant="${esc(k.plants[0].id)}" aria-label="${esc(rowLabel(k))}">
            <span class="tlname">${esc(plainName(k.sp))}</span>
            ${k.runs.map((r) => `<i class="tlbar ${r.mark}" style="grid-column:${r.from + 2} / ${r.to + 3}" aria-hidden="true"></i>`).join("")}
          </button></li>`).join("")}</ul>
      </div>
    </section>`;
}

// ---------- Month ----------
function monthHtml(o, newest) {
  const first = ui.month, last = monthEnd(first);
  const days = daysFor(o, first, last);
  const cells = [];
  for (let i = 0; i < (first.getDay() + 6) % 7; i++) cells.push(`<span class="mday blank"></span>`);
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const list = days.get(ymd(d));
    const isToday = sameDay(d, o.today), sel = sameDay(d, ui.day);
    cells.push(`<button type="button" class="mday${isToday ? " today" : ""}${d < o.today ? " past" : ""}" data-day="${ymd(d)}" aria-pressed="${sel}"
      aria-label="${esc(longDay(d))}${isToday ? ", today" : ""}, ${countText(jobCount(list))}"><span class="mnum">${d.getDate()}</span>${dotsHtml(list)}</button>`);
  }
  const used = new Set([...days.values()].flat().map(kindOf));
  const kinds = Object.keys(JOB_COLORS).filter((k) => used.has(k) && !(k === "prune" && used.has("tidy")) && !(k === "prep" && used.has("plant")));
  const dayList = days.get(ymd(ui.day)) || [];
  const isThisMonth = first.getTime() === monthStart(o.today).getTime();
  return `
    <section class="calmonth glass" aria-labelledby="monthTitle">
      <div class="calnav">
        <button type="button" class="calarrow" data-step="-1" aria-label="Previous month">${PREV}</button>
        <h2 id="monthTitle">${MONTH_NAMES[first.getMonth()]} <span>${first.getFullYear()}</span></h2>
        ${isThisMonth ? "" : `<button type="button" class="todaybtn" data-go-today>Today</button>`}
        <button type="button" class="calarrow" data-step="1" aria-label="Next month">${NEXT}</button>
      </div>
      <div class="mweek" aria-hidden="true">${["M", "T", "W", "T", "F", "S", "S"].map((l) => `<span>${l}</span>`).join("")}</div>
      <div class="mgrid">${cells.join("")}</div>
      ${kinds.length ? `<ul class="mkey" aria-label="Dot colours">${kinds.map((k) => `<li><i style="--c:${JOB_COLORS[k]}"></i>${esc(kindName(k))}</li>`).join("")}</ul>` : ""}
    </section>
    <section class="dayjobs glass" aria-labelledby="dayTitle" aria-live="polite">
      <h3 class="dayhead" id="dayTitle">${esc(longDay(ui.day))}${sameDay(ui.day, o.today) ? ` <span class="todaytag">Today</span>` : ""}<span class="daycount">${countText(dayList.length)}</span></h3>
      ${dayList.length ? rowsHtml(dayList, ui.day, o, newest) : `<p class="calnone">${ui.day < o.today ? "Nothing was checked off this day." : "Nothing to do this day."}</p>`}
    </section>`;
}

// ---------- Week ----------
function weekHtml(o, newest) {
  const monday = ui.week, sunday = addDays(monday, 6);
  const days = daysFor(o, monday, sunday);
  const week = [...Array(7)].map((_, i) => addDays(monday, i));
  const isThisWeek = monday.getTime() === mondayOf(o.today).getTime();
  const withJobs = week.filter((d) => jobCount(days.get(ymd(d))));
  return `
    <section class="weekstrip glass" aria-labelledby="weekTitle">
      <div class="calnav">
        <button type="button" class="calarrow" data-step="-1" aria-label="Previous week">${PREV}</button>
        <h2 id="weekTitle">${esc(weekText(monday))}</h2>
        ${isThisWeek ? "" : `<button type="button" class="todaybtn" data-go-today>Today</button>`}
        <button type="button" class="calarrow" data-step="1" aria-label="Next week">${NEXT}</button>
      </div>
      <ol class="wdays">${week.map((d) => {
        const n = jobCount(days.get(ymd(d)));
        const cls = `wday${sameDay(d, o.today) ? " today" : ""}${d < o.today ? " past" : ""}${n ? "" : " none"}`;
        const inner = `<span class="wname">${fmt(d, { weekday: "short" })}</span><b class="wnum">${d.getDate()}</b><span class="wcount">${n || "–"}</span>`;
        return `<li>${n ? `<button type="button" class="${cls}" data-jump="${ymd(d)}" aria-label="${esc(longDay(d))}${sameDay(d, o.today) ? ", today" : ""}: ${countText(n)}">${inner}</button>`
          : `<span class="${cls}" aria-label="${esc(longDay(d))}: no jobs">${inner}</span>`}</li>`;
      }).join("")}</ol>
    </section>
    ${withJobs.length ? withJobs.map((d) => {
      const list = days.get(ymd(d));
      return `<section class="weekday glass" id="wd-${ymd(d)}" aria-labelledby="wdt-${ymd(d)}">
        <h3 class="dayhead" id="wdt-${ymd(d)}">${esc(longDay(d))}${sameDay(d, o.today) ? ` <span class="todaytag">Today</span>` : ""}<span class="daycount">${countText(list.length)}</span></h3>
        ${rowsHtml(list, d, o, newest)}
      </section>`;
    }).join("") : `<p class="calempty glass">${sunday < o.today ? "Nothing was checked off this week." : "Nothing to do this week."}</p>`}`;
}

const PREV = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`;
const NEXT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`;

// ---------- the screen ----------
// o: { garden: { plants, species, layout }, today, done, doneBy, frosts, areaOrder, me (your name, for the
// initials on jobs you checked off; "" when unknown), notePhotos (newest first), thumb(photo), onToggle(keys, on),
// onPlant(id) }
export function renderCalendar(el, o) {
  // Coming back on another day starts again from that day.
  if (!sameDay(ui.today, o.today)) Object.assign(ui, { today: o.today, month: monthStart(o.today), week: mondayOf(o.today), day: o.today });
  ui.view ??= savedView();
  const newest = new Map();
  for (const n of o.notePhotos) if (!newest.has(n.plantId)) newest.set(n.plantId, n);

  const scroll = el.scrollTop;
  const stripScroll = el.querySelector(".mstrip")?.scrollLeft || 0;
  const focusKey = el.contains(document.activeElement) ? document.activeElement?.dataset?.f : null;
  const body = ui.view === "year" ? yearHtml(o, newest) : ui.view === "week" ? weekHtml(o, newest) : monthHtml(o, newest);
  el.innerHTML = `
    <div class="calhead">
      <div class="ptitle"><h1 id="calendarTitle">Calendar</h1><p class="pcount">${esc(fmt(o.today, { month: "short", day: "numeric" }))}</p></div>
      <div class="calswitch glass" role="group" aria-label="Show the year, a month or a week">
        ${VIEWS.map(([id, label]) => `<button type="button" data-view="${id}" data-f="v:${id}" aria-pressed="${ui.view === id}">${label}</button>`).join("")}
      </div>
    </div>
    <div class="calbody calview-${ui.view}">${body}</div>`;
  el.scrollTop = scroll;
  const strip = el.querySelector(".mstrip");
  if (strip) strip.scrollLeft = stripScroll;
  if (focusKey) el.querySelector(`[data-f="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  loadNoteThumbs(el, o.thumb);

  const redraw = () => renderCalendar(el, o);
  el.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.view) {
      if (b.dataset.view === ui.view) return;
      ui.view = b.dataset.view;
      saveView(ui.view);
      el.scrollTop = 0;
      return redraw();
    }
    if (b.dataset.keys) return o.onToggle(b.dataset.keys.split(" "), b.getAttribute("aria-checked") !== "true");
    if (b.dataset.plant) return o.onPlant(b.dataset.plant);
    if (b.dataset.day) {
      ui.day = parseYmd(b.dataset.day);
      redraw();
      return el.querySelector(`[data-day="${b.dataset.day}"]`)?.focus({ preventScroll: true });
    }
    if (b.dataset.jump) return el.querySelector(`#wd-${b.dataset.jump}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    if (b.dataset.step) {
      const n = Number(b.dataset.step);
      if (ui.view === "week") ui.week = addDays(ui.week, 7 * n);
      else {
        ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() + n, 1);
        ui.day = ui.month.getTime() === monthStart(o.today).getTime() ? o.today : ui.month;
      }
      redraw();
      return el.querySelector(`[data-step="${n}"]`)?.focus({ preventScroll: true });
    }
    if (b.hasAttribute("data-go-today")) {
      Object.assign(ui, { month: monthStart(o.today), week: mondayOf(o.today), day: o.today });
      redraw();
      return el.querySelector(`[data-step="1"]`)?.focus({ preventScroll: true });
    }
  };
}
