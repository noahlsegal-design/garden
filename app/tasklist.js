// The "This week" panel: the frost note, one-time jobs, weekly rounds, heads-up reminders and what's coming up.
// tasks.js works out the list; this file only draws it and hands taps back to main.js.

import { MONTHS, CARE_TYPES, isUnconfirmed, sourceName, esc } from "./data.js";
import { addDays, ymd, parseYmd, mondayOf, EVENT_NAMES, frostStatus, HORIZON } from "./tasks.js";

// What stays the same while the panel redraws: which rows are open, and the frost form.
const openRows = new Set();
let showEarlier = false;
let frostFormOpen = false;
let lastWeek = "";
let scrollPos = 0; // kept here because a hidden panel always reports 0
const signingIn = { busy: false, error: "" };

// Where check-offs are being saved, in words: on the Mac (before the app went online) or in the shared garden
// on Supabase.
const SAVE_NOTE = {
  mac: {
    loading: "Getting your check-offs from your Mac…",
    saved: "Check-offs are saved on your Mac, so your phone and computer share them.",
    offline: "Can't reach your Mac right now. Check-offs are kept on this device and will save to the Mac once it's back.",
    "old-server": "To share check-offs between devices, restart the app: close its Terminal window and double-click Start Garden.command. Until then they're kept on this device.",
    device: "Check-offs are kept on this device for now. They'll move to your garden account once it's connected.",
  },
  cloud: {
    loading: "Getting your check-offs…",
    saved: "Check-offs are saved to your garden account, so every device you sign in on shares them.",
    shared: "Check-offs, frost dates and plant changes are saved to your shared garden, so you both see the same on every device.",
    "not-member": "This account isn't in the garden yet, so it can't see or save the garden's check-offs. The garden's owner can add it in Supabase (the steps are in supabase/setup.sql). Until then, check-offs stay on this device.",
    offline: "Can't reach your garden account right now, so check-offs are kept on this device until it's back. If this lasts, your Supabase project may be paused after a quiet week: sign in at supabase.com and resume it.",
    "signed-out": "Sign in so your phone and computer share one list. Until then, check-offs stay on this device.",
    setup: "Your garden account isn't ready for check-offs yet: run supabase/setup.sql in Supabase's SQL Editor. Until then they're kept on this device.",
  },
};

// ---------- small helpers ----------
const fmt = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
const daysFrom = (a, b) => Math.round((b - a) / 86400000);
function inDays(from, to) {
  const n = daysFrom(from, to);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
const plainName = (sp) => sp.commonName.replace(/\s*\([^)]*\)/g, "").trim();
const typeName = (t) => CARE_TYPES[t] || t;
function splitFirst(text) {
  const m = /^(.+?[.!?])\s+(.+)$/s.exec(text || "");
  return m ? [m[1], m[2]] : [text || "", ""];
}
function weekLabel(ws) {
  const we = addDays(ws, 6);
  return ws.getMonth() === we.getMonth() ? `${fmt(ws)} – ${we.getDate()}` : `${fmt(ws)} – ${fmt(we)}`;
}
function relWeek(ws, thisMonday) {
  const n = Math.round(daysFrom(thisMonday, ws) / 7);
  return n === 0 ? "This week" : n === 1 ? "Next week" : n === -1 ? "Last week" : `Week of ${fmt(ws)}`;
}
const approx = (info) => (info && !info.recorded ? "~" : "");

function whereText(plants, o) {
  const areas = [...new Set(plants.map((p) => p.area))]
    .sort((a, b) => o.areaOrder.indexOf(a) - o.areaOrder.indexOf(b))
    .map((a) => o.areaNames.get(a) || a);
  const count = plants.length === 1 && plants[0].label.startsWith("#") ? plants[0].label : `${plants.length} plant${plants.length === 1 ? "" : "s"}`;
  return `${count} · ${areas.join(", ")}`;
}

// "from ~Oct 15" for jobs that haven't started yet, otherwise the deadline.
function whenPill(w, week, today) {
  if (w.from > week.weekStart && w.from > today) return { text: `from ${approx(w.starts)}${fmt(w.from)}`, cls: "" };
  const due = w.to <= week.weekEnd ? " due" : "";
  const frostFirst = w.ends && w.to >= addDays(w.ends.eventDate, -1);
  if (frostFirst) return { text: `before ${approx(w.ends)}${fmt(w.ends.eventDate)}`, cls: due };
  return { text: `by ${fmt(w.to)}`, cls: due };
}

// Explains a frost-timed job, e.g. "A week after the first frost (typically Oct 15)".
function anchorNote(w) {
  const bits = [];
  if (w.starts) {
    const d = w.starts.days;
    const lead = !d ? "After" : d % 7 === 0 ? (d === 7 ? "A week after" : `${d / 7} weeks after`) : `${d} days after`;
    bits.push(`${lead} the ${EVENT_NAMES[w.starts.event]} (${w.starts.recorded ? "you recorded" : "typically"} ${fmt(w.starts.eventDate)})`);
  }
  if (w.ends) bits.push(`Before the ${EVENT_NAMES[w.ends.event]} (${w.ends.recorded ? "you recorded" : "typically"} ${fmt(w.ends.eventDate)})`);
  return bits.join(". ");
}

const checkbox = (keys, state, label, focusId = keys[0]) =>
  `<button type="button" class="check" role="checkbox" aria-checked="${state}" data-keys="${esc(keys.join(" "))}" data-f="c:${esc(focusId)}" aria-label="${esc(label)}"></button>`;

function chips(plants) {
  return `<div class="chips">${plants.map((p) => {
    const unsure = isUnconfirmed(p);
    return `<button type="button" class="chip${unsure ? " unconfirmed" : ""}" data-plant="${esc(p.id)}" title="${esc(p.name)}">${esc(p.label)}${unsure ? " ?" : ""}</button>`;
  }).join("")}</div>`;
}

function sourcesHtml(sp) {
  const links = (sp.sources || []).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(sourceName(u))}</a>`).join(" · ");
  return `<p class="small">Confidence ${esc(sp.confidence)}/100: ${esc(sp.confidenceWhy || "")}${links ? ` Sources: ${links}` : ""}</p>`;
}

// ---------- the frost note ----------
function frostBanner(o) {
  const st = frostStatus(o.site, o.refDay, o.frosts);
  if (!st) return "";
  const s = o.site;
  const recordBtn = (text, cls = "btn") => `<button type="button" class="${cls}" data-frost="open">${text}</button>`;
  let title, text, action = "", notes;
  if (st.phase === "before-watch") {
    title = `Frost watch starts ${fmt(st.watch.date)} <span class="small">· ${inDays(o.refDay, st.watch.date)}</span>`;
    text = `The first frost usually comes around ${fmt(st.first.date)}. Jobs that wait for it, like cutting back peonies and digging dahlias, are under Coming up.`;
    action = recordBtn("Had a frost already? Record it", "linkbtn");
    notes = [s.earlyFrostWatchNote, s.firstFallFrostNote, s.hardFreezeNote];
  } else if (st.phase === "watch") {
    title = "Frost watch";
    text = `Check the forecast each evening. The first frost usually comes around ${fmt(st.first.date)} (${inDays(o.refDay, st.first.date)}). When it comes, record the date here so after-frost jobs, like digging dahlias, get the right dates.`;
    action = recordBtn("Record first frost");
    notes = [s.earlyFrostWatchNote, s.firstFallFrostNote, s.hardFreezeNote];
  } else if (st.phase === "overdue") {
    title = "Had your first frost yet?";
    text = `It usually comes around ${fmt(st.first.date)}. Until you record the real date, after-frost jobs are dated from ${fmt(st.first.date)}.`;
    action = recordBtn("Record first frost");
    notes = [s.firstFallFrostNote, s.hardFreezeNote];
  } else if (st.phase === "recorded") {
    title = `First frost: ${fmt(st.first.date)}`;
    text = "You recorded it, so after-frost jobs are dated from it.";
    action = recordBtn("Change", "linkbtn");
    notes = [s.firstFallFrostNote, s.hardFreezeNote];
  } else if (st.phase === "spring") {
    title = `Safe planting date: ${fmt(st.safe.date)} <span class="small">· ${inDays(o.refDay, st.safe.date)}</span>`;
    text = `The last frost usually comes around ${st.last ? fmt(st.last.date) : "late April"}. Wait until about ${fmt(st.safe.date)} to plant tender plants like dahlias and tomatoes.`;
    notes = [s.lastSpringFrostNote, s.safePlantingDateNote];
  } else {
    title = `Past the safe planting date (${fmt(st.safe.date)})`;
    text = "Tender plants can go out now. Check each job for its timing: some, like basil and eggplant, wait for warmer nights in early June.";
    notes = [s.lastSpringFrostNote, s.safePlantingDateNote];
  }
  const url = (s.frostSource || "").match(/https?:\/\/\S+/)?.[0];
  const fall = st.phase !== "spring" && st.phase !== "planting";
  return `
    <div class="season ${fall ? "fall" : "spring"}">
      <div class="stitle">${title}</div>
      <p>${esc(text)}</p>
      ${fall && frostFormOpen ? frostForm(o, st) : action}
      <details data-details="frostwhy" ${openRows.has("frostwhy") ? "open" : ""}>
        <summary>Where these dates come from</summary>
        <ul class="notes">${notes.filter(Boolean).map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
        <p class="small">${s.frostConfidence != null ? `Confidence ${esc(s.frostConfidence)}/100: ${esc(s.frostConfidenceWhy || "")} ` : ""}${url ? `Source: <a href="${esc(url)}" target="_blank" rel="noopener">${esc(sourceName(url))} 1991–2020 climate normals</a>` : ""}</p>
      </details>
    </div>`;
}

function frostForm(o, st) {
  const recorded = st.phase === "recorded";
  // Only dates from this frost season (August on) up to today make sense.
  const yearEnd = `${st.year}-12-31`, todayStr = ymd(o.today);
  const max = todayStr < yearEnd ? todayStr : yearEnd;
  const value = recorded ? ymd(st.first.date) : max;
  return `
    <form class="frostform" data-frostform>
      <label for="frostDate">Date of the first frost (32°F or colder)</label>
      <div class="frostrow">
        <input type="date" id="frostDate" value="${value}" min="${st.year}-08-01" max="${max}" required>
        <button type="submit" class="btn">Save</button>
        <button type="button" class="linkbtn" data-frost="cancel">Cancel</button>
        ${recorded ? `<button type="button" class="linkbtn" data-frost="clear">Remove</button>` : ""}
      </div>
    </form>`;
}

// ---------- rows ----------
function jobRow(j, o, shows) {
  const [first, rest] = splitFirst(j.care.text);
  const pill = whenPill(j.window, o.week, o.today);
  const note = anchorNote(j.window);
  const open = openRows.has(j.key);
  const unsure = j.plants.every(isUnconfirmed);
  const many = j.plants.length > 1;
  const state = j.done ? "true" : j.doneCount ? "mixed" : "false";
  // "Show in yard" rings the plants still to do, once some are done.
  const left = j.plants.filter((p, i) => !o.done[j.plantKeys[i]]);
  const partial = many && j.doneCount && !j.done;
  shows.set(j.key, { ids: (partial ? left : j.plants).map((p) => p.id), label: `${plainName(j.sp)}: ${typeName(j.care.type).toLowerCase()}${partial ? ", still to do" : ""}` });
  return `
    <li class="task${j.done ? " done" : ""}">
      ${checkbox(j.plantKeys, state, many ? `${j.sp.commonName}, ${typeName(j.care.type)}: all ${j.plants.length} done` : `Done: ${j.sp.commonName}, ${typeName(j.care.type)}`, j.key)}
      <div class="tbody">
        <button type="button" class="tmain" aria-expanded="${open}" data-open="${esc(j.key)}" data-f="o:${esc(j.key)}">
          <span class="thead"><span class="tname"><span class="tag">${esc(typeName(j.care.type))}</span>${esc(j.sp.commonName)}</span><span class="when${pill.cls}">${esc(pill.text)}</span></span>
          <span class="ttext">${esc(first)}</span>
          ${note ? `<span class="tnote">${esc(note)}</span>` : ""}
          <span class="twhere">${partial ? `<b class="progress">${j.doneCount} of ${j.plants.length} done</b> · ` : ""}${esc(whereText(j.plants, o))}${unsure ? ` · <span class="unconf">ID unconfirmed</span>` : ""}</span>
        </button>
        <div class="tmore"${open ? "" : " hidden"}>
          ${rest ? `<p>${esc(rest)}</p>` : ""}
          ${many ? plantChecks(j, o) : chips(j.plants)}
          ${sourcesHtml(j.sp)}
          <button type="button" class="linkbtn" data-show="${esc(j.key)}">${partial ? `Show the ${left.length} still to do in the yard` : "Show in yard"}</button>
        </div>
      </div>
    </li>`;
}

// One box per plant for a job that covers several, with the plant's name to open its card.
function plantChecks(j, o) {
  return `<ul class="plantchecks">${j.plants.map((p, i) => {
    const key = j.plantKeys[i], done = Boolean(o.done[key]);
    const detail = p.label.startsWith("#") ? p.name : o.areaNames.get(p.area) || p.area;
    return `<li class="${done ? "done" : ""}">
      ${checkbox([key], done ? "true" : "false", `Done: ${p.label}`)}
      <button type="button" class="pcname" data-plant="${esc(p.id)}"><b>${esc(p.label)}${isUnconfirmed(p) ? " ?" : ""}</b><span>${esc(detail)}</span></button>
    </li>`;
  }).join("")}</ul>`;
}

function roundRow(r, o, shows) {
  const doneN = r.items.filter((i) => i.done).length;
  const state = doneN === 0 ? "false" : doneN === r.items.length ? "true" : "mixed";
  const names = r.items.map((i) => plainName(i.sp));
  const summary = names.length > 4 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
  const rowId = `round:${r.id}`;
  const open = openRows.has(rowId);
  shows.set(rowId, { ids: [...new Set(r.items.flatMap((i) => i.plants.map((p) => p.id)))], label: r.name });
  return `
    <li class="task round${state === "true" ? " done" : ""}">
      ${checkbox(r.items.map((i) => i.key), state, `${r.name}: all done this week`, rowId)}
      <div class="tbody">
        <button type="button" class="tmain" aria-expanded="${open}" data-open="${rowId}" data-f="o:${rowId}">
          <span class="thead"><span class="tname">${esc(r.name)}</span><span class="when">${doneN} of ${r.items.length}</span></span>
          <span class="ttext">${esc(r.blurb)}: ${esc(summary)}</span>
        </button>
        <div class="tmore"${open ? "" : " hidden"}>
          <ul class="subtasks">${r.items.map((i) => subRow(i, o, shows)).join("")}</ul>
          <button type="button" class="linkbtn" data-show="${rowId}">Show all ${r.items.length} in the yard</button>
        </div>
      </div>
    </li>`;
}

function subRow(i, o, shows) {
  shows.set(i.key, { ids: i.plants.map((p) => p.id), label: `${plainName(i.sp)}: ${typeName(i.care.type).toLowerCase()}` });
  const note = anchorNote(i.window);
  return `
    <li class="${i.done ? "done" : ""}">
      ${checkbox([i.key], i.done ? "true" : "false", `Done this week: ${i.sp.commonName}`)}
      <div class="subbody">
        <span class="tname">${esc(i.sp.commonName)}</span>
        <span class="twhere">${esc(whereText(i.plants, o))} · <button type="button" class="linkbtn inline" data-show="${esc(i.key)}">Show</button></span>
        <span class="ttext">${esc(i.care.text)}</span>
        ${note ? `<span class="tnote">${esc(note)}</span>` : ""}
      </div>
    </li>`;
}

function tipsSection(tips, o, shows) {
  if (!tips.length) return "";
  return `
    <details class="tipsbox" data-details="tips" ${openRows.has("tips") ? "open" : ""}>
      <summary><span>Heads-up <span class="small">(${tips.length})</span></span></summary>
      <ul class="tiplist">${tips.map((t) => {
        const id = `tip:${t.id}`;
        shows.set(id, { ids: t.plants.map((p) => p.id), label: plainName(t.sp) });
        return `<li><span class="tname">${esc(t.sp.commonName)}</span>
          <span class="twhere">${esc(whereText(t.plants, o))} · <button type="button" class="linkbtn inline" data-show="${esc(id)}">Show</button></span>
          <span class="ttext">${esc(t.care.text)}</span></li>`;
      }).join("")}</ul>
    </details>`;
}

// Coming up, grouped by the day things start: frost milestones plus jobs, e.g. "~Oct 15 · Winter prep: Peony, Hosta".
const MILESTONE_TEXT = {
  lastSpringFrost: (r) => (r ? "Last spring frost" : "Typical last spring frost"),
  safePlantingDate: () => "Safe planting date for tender plants",
  earlyFrostWatch: () => "Frost watch starts: check the forecast each evening",
  firstFallFrost: (r) => (r ? "First frost (you recorded it)" : "Typical first frost"),
  hardFreeze: (r) => (r ? "Hard freeze" : "Typical first hard freeze (28°F)"),
};
function comingUp(week) {
  const days = new Map();
  const day = (d) => {
    const k = ymd(d);
    if (!days.has(k)) days.set(k, { date: d, approx: true, milestones: [], types: new Map() });
    return days.get(k);
  };
  for (const m of week.milestones) {
    const g = day(m.date);
    g.milestones.push(MILESTONE_TEXT[m.key](m.recorded));
    if (m.recorded || m.key === "earlyFrostWatch") g.approx = false;
  }
  for (const j of week.soon) {
    const g = day(j.window.from);
    if (!j.window.starts || j.window.starts.recorded) g.approx = false;
    const t = typeName(j.care.type);
    if (!g.types.has(t)) g.types.set(t, []);
    g.types.get(t).push(plainName(j.sp));
  }
  const groups = [...days.values()].sort((a, b) => a.date - b.date);
  if (!groups.length) return `<p class="empty small">Nothing new starts in the ${HORIZON / 7} weeks after this one.</p>`;
  return `<ul class="soon">${groups.map((g) => `
    <li><button type="button" class="soonbtn" data-week="${ymd(mondayOf(g.date))}" aria-label="Go to the week of ${fmt(g.date)}">
      <span class="sdate">${g.approx ? "~" : ""}${fmt(g.date)}</span>
      <span class="sbody">
        ${g.milestones.map((m) => `<b>${esc(m)}</b>`).join("")}
        ${[...g.types].map(([t, names]) => `<span><span class="tag">${esc(t)}</span>${esc([...new Set(names)].join(", "))}</span>`).join("")}
      </span>
    </button></li>`).join("")}</ul>`;
}

// Shown when check-offs go to the garden account and nobody's signed in on this device.
function signInBox(notes) {
  return `
    <form class="signin" data-signin>
      <p class="stitle">Sign in to save your check-offs</p>
      <p>${esc(notes["signed-out"])}</p>
      <label for="signinEmail">Email</label>
      <input id="signinEmail" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" required data-f="signinEmail">
      <label for="signinPassword">Password</label>
      <input id="signinPassword" type="password" autocomplete="current-password" required data-f="signinPassword">
      <button type="submit" class="btn" ${signingIn.busy ? "disabled" : ""}>${signingIn.busy ? "Signing in…" : "Sign in"}</button>
      ${signingIn.error ? `<p class="signinerror" role="alert">${esc(signingIn.error)}</p>` : ""}
    </form>`;
}

const footNote = (o, notes) => (o.saveStatus === "saved" && o.sharedWith?.length ? notes.shared : notes[o.saveStatus] || notes.saved);

// ---------- the panel ----------
export function renderTasks(panel, o) {
  const { week } = o;
  const weekKey = ymd(week.weekStart);
  const scroll = lastWeek === weekKey ? scrollPos : 0;
  const focusKey = panel.contains(document.activeElement) ? document.activeElement?.dataset?.f : null;
  // Whatever's typed into the sign-in box survives a redraw.
  const typed = { email: panel.querySelector("#signinEmail")?.value, password: panel.querySelector("#signinPassword")?.value };
  panel.querySelectorAll("details[data-details]").forEach((d) => (d.open ? openRows.add(d.dataset.details) : openRows.delete(d.dataset.details)));
  if (lastWeek !== weekKey) frostFormOpen = false;
  lastWeek = weekKey;

  const shows = new Map();
  const rel = relWeek(week.weekStart, o.thisMonday);
  const jobsDone = week.jobs.filter((j) => j.done).length;
  const roundsDone = week.rounds.filter((r) => r.items.every((i) => i.done)).length;
  const total = week.jobs.length + week.rounds.length;
  const earlierRows = showEarlier ? week.earlier : [];

  const notes = o.cloud ? SAVE_NOTE.cloud : SAVE_NOTE.mac;
  const warning = ["offline", "old-server", "setup", "not-member"].includes(o.saveStatus);
  const needsSignIn = o.cloud && o.saveStatus === "signed-out";
  panel.innerHTML = `
    <div class="listhead">
      <div class="row">
        <h2 id="tasksTitle">${esc(rel)}</h2>
        <button class="close" type="button" aria-label="Close ${esc(rel.toLowerCase())}">✕</button>
      </div>
      <div class="weeknav">
        <button type="button" class="navbtn prev" data-week="${ymd(addDays(week.weekStart, -7))}" data-f="prev" aria-label="Previous week"></button>
        <div class="wk"><b>${esc(weekLabel(week.weekStart))}</b><span>${total ? `${jobsDone + roundsDone} of ${total} done` : "Nothing to check off"}</span></div>
        <button type="button" class="navbtn next" data-week="${ymd(addDays(week.weekStart, 7))}" data-f="next" aria-label="Next week"></button>
      </div>
      ${rel === "This week" ? "" : `<button type="button" class="linkbtn backlink" data-week="${ymd(o.thisMonday)}">Back to this week</button>`}
      ${warning ? `<p class="savewarn" role="status">${esc(notes[o.saveStatus])}</p>` : ""}
    </div>
    <div class="tlist">
      ${needsSignIn ? signInBox(notes) : ""}
      ${frostBanner(o)}

      <h3>To do <span class="count">${week.jobs.length ? `${jobsDone} of ${week.jobs.length}` : ""}</span></h3>
      ${week.jobs.length || earlierRows.length
        ? `<ul class="tasklist">${week.jobs.map((j) => jobRow(j, o, shows)).join("")}${earlierRows.map((j) => jobRow(j, o, shows)).join("")}</ul>`
        : `<p class="empty small">No one-time jobs this week.</p>`}
      ${week.earlier.length ? `<button type="button" class="linkbtn" data-earlier>${showEarlier ? "Hide" : "Show"} ${week.earlier.length} done in earlier weeks</button>` : ""}

      ${week.rounds.length ? `
      <h3>Every week</h3>
      <ul class="tasklist">${week.rounds.map((r) => roundRow(r, o, shows)).join("")}</ul>` : ""}

      ${tipsSection(week.tips, o, shows)}

      <h3>Coming up</h3>
      ${comingUp(week)}

      <p class="small foot">${esc(footNote(o, notes))} Weekly rounds start fresh every Monday.${o.cloud && o.account ? ` Signed in as <b>${esc(o.account)}</b>${o.sharedWith?.length ? `, sharing with ${o.sharedWith.map((e) => `<b>${esc(e)}</b>`).join(" and ")}` : ""} · <button type="button" class="linkbtn inline" data-signout>Sign out</button>` : ""}</p>
    </div>`;
  panel.hidden = false;
  const list = panel.querySelector(".tlist");
  list.scrollTop = scrollPos = scroll;
  list.onscroll = () => { scrollPos = list.scrollTop; };
  if (typed.email != null && panel.querySelector("#signinEmail")) {
    panel.querySelector("#signinEmail").value = typed.email;
    panel.querySelector("#signinPassword").value = typed.password || "";
  }
  if (focusKey) panel.querySelector(`[data-f="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });

  panel.onclick = (e) => {
    const t = e.target.closest("button");
    if (!t || !panel.contains(t)) return;
    if (t.classList.contains("close")) return o.onClose();
    if (t.dataset.keys) return o.onToggle(t.dataset.keys.split(" "), t.getAttribute("aria-checked") !== "true");
    if (t.dataset.open) {
      const more = t.parentElement.querySelector(".tmore");
      const nowOpen = more.hidden;
      more.hidden = !nowOpen;
      t.setAttribute("aria-expanded", String(nowOpen));
      if (nowOpen) openRows.add(t.dataset.open); else openRows.delete(t.dataset.open);
      return;
    }
    if (t.dataset.plant) return o.onPlant(t.dataset.plant);
    if (t.dataset.show) { const s = shows.get(t.dataset.show); if (s) o.onShowInYard(s.ids, s.label); return; }
    if (t.dataset.week) return o.onWeek(parseYmd(t.dataset.week));
    if (t.hasAttribute("data-earlier")) { showEarlier = !showEarlier; return o.onRedraw(); }
    if (t.dataset.frost === "open") { frostFormOpen = true; o.onRedraw(); panel.querySelector("#frostDate")?.focus(); return; }
    if (t.dataset.frost === "cancel") { frostFormOpen = false; return o.onRedraw(); }
    if (t.dataset.frost === "clear") { frostFormOpen = false; return o.onFrost(null, ymd(o.refDay).slice(0, 4)); }
    if (t.hasAttribute("data-signout")) return o.onSignOut();
  };
  const signin = panel.querySelector("[data-signin]");
  if (signin) signin.onsubmit = async (e) => {
    e.preventDefault();
    if (signingIn.busy) return;
    Object.assign(signingIn, { busy: true, error: "" });
    o.onRedraw();
    try {
      await o.onSignIn(panel.querySelector("#signinEmail").value, panel.querySelector("#signinPassword").value);
    } catch (err) {
      signingIn.error = err.message;
    }
    signingIn.busy = false;
    o.onRedraw();
  };
  const form = panel.querySelector("[data-frostform]");
  if (form) form.onsubmit = (e) => {
    e.preventDefault();
    const v = form.querySelector("#frostDate").value;
    if (!parseYmd(v)) return;
    frostFormOpen = false;
    o.onFrost(v);
  };
}
