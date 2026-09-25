// Starts the app: loads the data, builds the 3D yard, and wires up the buttons.

import { loadGarden, MONTH_NAMES, esc } from "./data.js";
import { createYard } from "./scene.js";
import { renderMonths, renderCard, renderList, renderSaveEdits, openLightbox } from "./ui.js";
import { buildWeek, openCount, createCheckStore, macBackend, mondayOf, parseYmd, ymd, servedByMac } from "./tasks.js";
import { cloudReady, cloudBackend, account, signIn, signOut } from "./cloud.js";
import { withEdits, editFor, unsavedEdits, staleEdits, describeEdits } from "./edits.js";
import { renderTasks } from "./tasklist.js";
import { bloomCounts, createBloomBar } from "./bloom.js";

const $ = (id) => document.getElementById(id);

// Today's date. For testing, add ?today=2026-10-16 to the address to see the app as if it were that day.
function today() {
  const d = parseYmd(new URLSearchParams(location.search).get("today")) || new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
const TODAY = today().getMonth();
const NO_FILTERS = { q: "", area: "all", unconfirmed: false, toxic: false, attention: false };

const HINT = matchMedia("(pointer: coarse)").matches
  ? "Drag to move around · Pinch to zoom · Slide two fingers to turn · Tap a plant"
  : "Drag to move around · Scroll to zoom · Shift-drag or right-drag to turn · Click a plant";
const state = { month: TODAY, bloom: false, selectedId: null, filters: { ...NO_FILTERS }, highlight: null, taskWeek: mondayOf(today()) };
let garden, yard, byId, areaOrder, store, bloomBar;
// data/plants.json as it is, before the plant changes made in the app (edits.js) go on top.
let filePlants, fileById;
let editsDrawn = null; // the plant changes the yard was last drawn with
let kinds = []; // every kind of plant, for "Confirm ID": [id, name, still a placeholder for an unidentified plant]
// This copy's plants.json is the Mac's own (the Mac copy, or a phone opening it over Wi-Fi), not the website's.
const ON_MAC = servedByMac();
// "Save app edits into files" writes into this Mac's files, so it's offered only in a browser on the Mac itself.
const MAC_ITSELF = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
let playTimer = null; // set while the bloom timeline is playing
let hintDone = false; // the how-to-move hint goes away once you've moved the view

async function start() {
  try {
    garden = await loadGarden();
  } catch (err) {
    $("status").innerHTML = `<div><p><b>The garden couldn't load.</b></p><pre>${String(err.message).replace(/</g, "&lt;")}</pre></div>`;
    return;
  }
  byId = new Map(garden.plants.map((p) => [p.id, p]));
  filePlants = garden.plants;
  fileById = byId;
  kinds = [...garden.species.values()]
    .map((s) => [s.id, s.commonName, /unconfirmed/i.test(s.commonName) || s.id.startsWith("unknown")])
    .sort((a, b) => a[1].localeCompare(b[1]));
  areaOrder = [...garden.layout.areas.map((a) => a.id), "fenceline"];
  // Check-offs and plant changes go to the shared garden on Supabase once it's set up (app/config.js), or to
  // the Mac until then.
  store = createCheckStore(filePlants, cloudReady ? cloudBackend : macBackend, () => {
    if (!applyEdits() && state.selectedId) showCard(); // the card's controls depend on being signed in
    if (!$("tasksPanel").hidden) drawTasks();
    updateTaskCount();
    setTimeout(clearOldEdits);
  });
  store.refresh();
  // Coming back to the app (say, after checking things off on the other device) fetches the latest list.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") store.refresh(); });

  let has3d = true;
  try {
    yard = createYard($("yard"), { layout: garden.layout, onPick: (id) => (id ? selectPlant(id) : closeCard()), onMove: movedView });
  } catch (err) {
    $("status").innerHTML = `<div><p><b>3D view couldn't start on this device.</b></p><p>You can still browse everything with the <b>All plants</b> and <b>This week</b> buttons.</p><pre>${String(err.message).replace(/</g, "&lt;")}</pre></div>`;
    $("status").style.pointerEvents = "none";
    $("status").style.background = "transparent";
    has3d = false;
    yard = { setPlants() {}, setMonth() {}, setBloom() {}, select() {}, focus() {}, resetView() {}, setHighlight() {}, fitTo() {}, views: () => [], goTo() {}, zoomBy() {}, turn() {} };
  }
  const growing = garden.plants.filter((p) => !p.finished);
  yard.setPlants(growing, garden.species, state.month);
  yard.setMonth(state.month);
  editsDrawn = JSON.stringify({});
  if (has3d) $("status").hidden = true;

  renderMonthsBar();
  bloomBar = createBloomBar($("bloomBar"), {
    counts: bloomCounts(growing, garden.species),
    onScrub: (m) => { stopPlaying(); setBloom(true); setMonth(m); },
    onPlay: () => (playTimer ? stopPlaying() : playYear()),
    onOff: () => { stopPlaying(); setBloom(false); },
  });
  updateBloomBar();
  updateHint();
  setUpMapButtons();
  $("listBtn").onclick = openList;
  $("tasksBtn").onclick = openTasks;
  updateTaskCount();
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !$("lightbox").hidden) return;
    if (!$("savePanel").hidden) closeSaveEdits();
    else if (!$("viewsMenu").hidden) { showViews(false); $("viewsBtn").focus(); }
    else if (!$("tasksPanel").hidden) closeTasks();
    else if (!$("listPanel").hidden) closeList();
    else if (state.selectedId) closeCard();
    else if (state.bloom) { stopPlaying(); setBloom(false); }
  });

  // Open straight to a plant (address ends in #plant=pb-05) or to This week (#tasks). Handy for bookmarks.
  const hash = new URLSearchParams(location.hash.slice(1));
  const fromHash = hash.get("plant");
  if (fromHash && byId.has(fromHash)) selectPlant(fromHash, { focus: true });
  else if (hash.has("tasks")) openTasks();
}

// Keeps the address in step with what's open, so a bookmark or refresh comes back to it.
function syncHash() {
  const h = !$("tasksPanel").hidden ? "#tasks" : state.selectedId ? `#plant=${encodeURIComponent(state.selectedId)}` : "";
  history.replaceState(null, "", location.pathname + location.search + h);
}

function renderMonthsBar() {
  renderMonths($("months"), state.month, TODAY, (m) => { stopPlaying(); setMonth(m); });
}

function setMonth(m) {
  state.month = m;
  renderMonthsBar();
  yard.setMonth(m);
  if (state.selectedId) showCard();
  if (!$("listPanel").hidden) drawList();
  updateHint();
  updateBloomBar();
}

// ---------- bloom timeline ----------
function updateBloomBar() {
  bloomBar.update({ month: state.month, on: state.bloom, playing: !!playTimer });
}
function setBloom(on) {
  if (on && !state.bloom) clearHighlight(); // one set of rings at a time
  state.bloom = on;
  yard.setBloom(on);
  updateBloomBar();
}
// Plays one lap of the year, a month at a time, and stops back on the month it started from.
function playYear() {
  setBloom(true);
  let steps = 0;
  const step = () => {
    setMonth((state.month + 1) % 12);
    if (++steps === 12) stopPlaying();
  };
  playTimer = setInterval(step, 1100);
  step();
}
function stopPlaying() {
  if (!playTimer) return;
  clearInterval(playTimer);
  playTimer = null;
  updateBloomBar();
}

// ---------- moving around the yard ----------
// The note in the top-left corner: how to move around until you've done it once, and which month is showing.
function updateHint() {
  const text = state.month !== TODAY ? `Showing ${MONTH_NAMES[state.month]}` : hintDone ? "" : HINT;
  $("hintText").textContent = text;
  $("hintText").hidden = !text;
}
function movedView() {
  if (hintDone) return;
  hintDone = true;
  updateHint();
}
function setUpMapButtons() {
  const act = (fn) => () => { movedView(); fn(); };
  $("resetBtn").onclick = act(() => yard.resetView());
  $("zoomInBtn").onclick = act(() => yard.zoomBy(0.6));
  $("zoomOutBtn").onclick = act(() => yard.zoomBy(1 / 0.6));
  $("turnLeftBtn").onclick = act(() => yard.turn(-Math.PI / 4)); // the yard swings counterclockwise, like the icon
  $("turnRightBtn").onclick = act(() => yard.turn(Math.PI / 4));

  const views = yard.views();
  const group = (g, title) => {
    const list = views.filter((v) => v.group === g);
    return list.length ? `<h3>${title}</h3>${list.map((v) => `<button type="button" data-view="${esc(v.id)}">${esc(v.name)}${v.note ? `<span>${esc(v.note)}</span>` : ""}</button>`).join("")}` : "";
  };
  $("viewsMenu").innerHTML = group("look", "Look from") + group("zoom", "Zoom to");
  $("viewsBtn").hidden = !views.length;
  $("viewsBtn").onclick = () => showViews($("viewsMenu").hidden);
  $("viewsMenu").onclick = (e) => {
    const b = e.target.closest("[data-view]");
    if (!b) return;
    showViews(false);
    movedView();
    yard.goTo(b.dataset.view);
  };
  // A tap anywhere else closes the menu.
  document.addEventListener("pointerdown", (e) => {
    if (!$("viewsMenu").hidden && !e.target.closest("#viewsMenu, #viewsBtn")) showViews(false);
  });
}
function showViews(open) {
  $("viewsMenu").hidden = !open;
  $("viewsBtn").setAttribute("aria-expanded", String(open));
  if (open) $("viewsMenu").querySelector("button")?.focus({ preventScroll: true });
}

// ---------- card ----------
function selectPlant(id, { focus = false } = {}) {
  state.selectedId = id;
  yard.select(id);
  if (focus) yard.focus(id);
  showCard();
  syncHash();
}
function showCard() {
  const p = byId.get(state.selectedId);
  if (!p) return closeCard();
  renderCard($("sheet"), {
    plant: p, species: garden.species.get(p.speciesId), month: state.month,
    areaName: garden.areaNames.get(p.area) || p.area, edit: editControls(p),
    onClose: closeCard, onPhoto: openLightbox,
  });
}
function closeCard() {
  state.selectedId = null;
  yard.select(null);
  $("sheet").hidden = true;
  syncHash();
}

// ---------- plant changes made in the app ----------
// Redraws everything that shows plants when the changes are different from last time (made here, or by
// someone else in the garden). Says whether anything changed.
function applyEdits() {
  const sig = JSON.stringify(store.checks.edits);
  if (!yard || editsDrawn == null || sig === editsDrawn) return false;
  editsDrawn = sig;
  garden.plants = withEdits(filePlants, store.checks.edits, garden.species, ON_MAC);
  byId = new Map(garden.plants.map((p) => [p.id, p]));
  const growing = garden.plants.filter((p) => !p.finished);
  yard.setPlants(growing, garden.species, state.month);
  bloomBar.setCounts(bloomCounts(growing, garden.species));
  updateBloomBar();
  if (state.selectedId) showCard();
  if (!$("listPanel").hidden) drawList();
  if (!$("savePanel").hidden && saving.phase === "review") drawSaveEdits();
  return true;
}

// What the card offers: confirm, rename and finish, once you're signed in to the garden.
function editControls(p) {
  const file = fileById.get(p.id);
  if (!file) return null;
  const { status, shared } = store.checks;
  if (!cloudReady && ["device", "old-server"].includes(status)) return null; // nowhere to save changes
  let note = "";
  if (cloudReady) {
    if (!account() || status === "signed-out") note = "Sign in under This week to confirm, rename or finish plants.";
    else if (status === "not-member") note = "This account isn't in the garden yet, so it can't change plants.";
    else if (shared === false) note = "Changing plants here needs the new Supabase setup: run supabase/setup.sql again.";
  }
  return {
    can: !note, note, kinds, today: ymd(today()),
    changes: describeEdits(file, store.checks.edits, garden.species, ON_MAC, account()),
    onSave: (values) => {
      const at = new Date().toISOString();
      const fields = Object.fromEntries(Object.entries(values).map(([f, v]) => [f, editFor(file, store.checks.edits, f, v, at)]));
      store.change({ edits: { [p.id]: fields } });
    },
    onUndo: (fields) => store.change({ edits: { [p.id]: Object.fromEntries(fields.map((f) => [f, null])) } }),
  };
}

// Online, a change saved into plants.json stays in Supabase until the website's plants.json has it too (once
// the garden is published). Then the website clears it.
const clearing = new Set();
function clearOldEdits() {
  if (ON_MAC || !cloudReady || store.checks.status !== "saved") return;
  const edits = {};
  for (const [id, field] of staleEdits(filePlants, store.checks.edits)) {
    if (clearing.has(`${id}|${field}`)) continue;
    clearing.add(`${id}|${field}`);
    (edits[id] ??= {})[field] = null;
  }
  if (Object.keys(edits).length) store.change({ edits });
}

// ---------- "Save app edits into files" (the Mac copy) ----------
const saving = { phase: "review", message: "" };
function openSaveEdits() {
  Object.assign(saving, { phase: "review", message: "" });
  drawSaveEdits();
}
function closeSaveEdits() {
  $("savePanel").hidden = true;
  if (!$("listPanel").hidden) { drawList(); $("listPanel").querySelector("#saveEditsBtn, #listSearch")?.focus({ preventScroll: true }); }
}
function drawSaveEdits() {
  renderSaveEdits($("savePanel"), {
    rows: unsavedEdits(filePlants, store.checks.edits), species: garden.species, cloud: cloudReady, ...saving,
    onSave: saveEditsIntoFiles, onClose: closeSaveEdits,
  });
}
async function saveEditsIntoFiles() {
  const rows = unsavedEdits(filePlants, store.checks.edits);
  const toFile = {};
  for (const r of rows) if (r.plant) (toFile[r.id] ??= {})[r.field] = r.to;
  Object.assign(saving, { phase: "saving", message: "" });
  drawSaveEdits();
  let fileHad;
  try {
    const res = await fetch("api/save-edits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edits: toFile }) });
    if (res.status === 404 || res.status === 501) throw new Error("This Mac is running the app's server from before this feature. Close the garden's Terminal window, double-click Start Garden.command, and try again.");
    if (!res.ok) throw new Error("plants.json couldn't be written, so nothing changed. Try again, and if it keeps happening, ask Claude to take a look.");
    ({ fileHad } = await res.json());
  } catch (err) {
    Object.assign(saving, { phase: "error", message: err.message.startsWith("Failed") || err.name === "TypeError" ? "Couldn't reach the app's server on this Mac. Is its Terminal window still open?" : err.message });
    return drawSaveEdits();
  }
  const fresh = await loadGarden();
  filePlants = fresh.plants;
  fileById = new Map(filePlants.map((p) => [p.id, p]));
  // Online, each change stays in Supabase marked "saved" until the website has the new file. With no garden
  // account, the file is all there is, so they're simply cleared.
  const at = new Date().toISOString(), change = {};
  let written = 0;
  for (const r of rows) {
    const had = fileHad?.[r.id];
    if (had && r.field in had) {
      written++;
      (change[r.id] ??= {})[r.field] = cloudReady ? { v: r.to, at, saved: true, fileHad: had[r.field] ?? null } : null;
    } else if (!r.plant) (change[r.id] ??= {})[r.field] = null;
  }
  editsDrawn = "";
  store.change({ edits: change });
  const left = rows.length - written - rows.filter((r) => !r.plant).length;
  Object.assign(saving, {
    phase: "done",
    message: `${written} change${written === 1 ? " is" : "s are"} now in the file.${left ? ` ${left} couldn't be written (for example, a kind of plant that's no longer in species.json) and ${left === 1 ? "is" : "are"} still waiting.` : ""} Next, ask Claude to “publish the garden”.${cloudReady ? " Until it's published, the website keeps showing these changes from your garden account, then clears them on its own." : ""}`,
  });
  drawSaveEdits();
}

// ---------- list ----------
function openList() {
  closeTasks({ restoreFocus: false });
  drawList();
  $("listPanel").querySelector("#listSearch")?.focus({ preventScroll: true });
}
function closeList() {
  $("listPanel").hidden = true;
  $("listBtn").focus();
}
function drawList() {
  renderList($("listPanel"), {
    plants: garden.plants, species: garden.species, areaNames: garden.areaNames, areaOrder,
    month: state.month, filters: state.filters,
    unsaved: MAC_ITSELF ? unsavedEdits(filePlants, store.checks.edits).length : 0, onSaveEdits: openSaveEdits,
    onFilters: (f) => { state.filters = f; drawList(); },
    onPick: (id) => { closeList(); selectPlant(id, { focus: true }); },
    onShowInYard: (ids) => { closeList(); setHighlight(ids, describeFilters(state.filters), filterColor(state.filters)); },
    onClose: closeList,
  });
}

// ---------- this week ----------
const weekFor = (monday) => buildWeek(garden, { weekStart: monday, frosts: store.checks.frosts, done: store.checks.done, areaOrder });

function openTasks() {
  $("listPanel").hidden = true;
  state.taskWeek = mondayOf(today());
  drawTasks();
  store.refresh();
  syncHash();
  $("tasksPanel").querySelector(".close")?.focus({ preventScroll: true });
}
function closeTasks({ restoreFocus = true } = {}) {
  if ($("tasksPanel").hidden) return;
  $("tasksPanel").hidden = true;
  syncHash();
  if (restoreFocus) $("tasksBtn").focus();
}
function drawTasks() {
  const now = today();
  const week = weekFor(state.taskWeek);
  const nowInWeek = now >= week.weekStart && now <= week.weekEnd;
  renderTasks($("tasksPanel"), {
    week, today: now, thisMonday: mondayOf(now), refDay: nowInWeek ? now : week.weekStart,
    site: garden.layout.site || {}, frosts: store.checks.frosts, done: store.checks.done, saveStatus: store.checks.status,
    cloud: cloudReady, account: account(), sharedWith: store.checks.sharedWith,
    onSignIn: async (email, password) => {
      await signIn(email, password); // shows its own message if it doesn't work
      await store.refresh();
    },
    onSignOut: () => { signOut(); store.forget(); },
    areaNames: garden.areaNames, areaOrder,
    onToggle: (keys, on) => {
      // Dated no earlier than the week shown, so a job ticked off ahead of time stays visible in that week.
      const stamp = ymd(now > week.weekStart ? now : week.weekStart);
      store.change(on ? { set: Object.fromEntries(keys.map((k) => [k, stamp])) } : { unset: keys });
    },
    onFrost: (value, year) => store.change({ frosts: { [value ? value.slice(0, 4) : year]: value || null } }),
    onWeek: (monday) => { state.taskWeek = mondayOf(monday); drawTasks(); },
    onRedraw: drawTasks,
    onPlant: (id) => { closeTasks({ restoreFocus: false }); selectPlant(id, { focus: true }); },
    onShowInYard: (ids, label) => { closeTasks({ restoreFocus: false }); setHighlight(ids, label, "#3b82f6"); },
    onClose: closeTasks,
  });
}
function updateTaskCount() {
  const n = openCount(weekFor(mondayOf(today())));
  $("tasksCount").textContent = n;
  $("tasksCount").hidden = !n;
  $("tasksBtn").setAttribute("aria-label", n ? `This week, ${n} to do` : "This week");
}

// ---------- rings in the yard ("Show these in the yard") ----------
function describeFilters(f) {
  const parts = [];
  if (f.toxic) parts.push("toxic to dogs");
  if (f.unconfirmed) parts.push("unconfirmed");
  if (f.attention) parts.push("needs attention");
  if (f.area !== "all") parts.push(garden.areaNames.get(f.area) || f.area);
  if (f.q) parts.push(`“${f.q}”`);
  return parts.join(" · ") || "selected plants";
}
const filterColor = (f) => (f.toxic ? "#e0402f" : f.attention ? "#f0a020" : f.unconfirmed ? "#f2c94c" : "#3b82f6");

function setHighlight(ids, label, color) {
  stopPlaying();
  setBloom(false);
  yard.setHighlight({ ids, color });
  const chip = $("highlightChip");
  chip.innerHTML = `<span>${ids.length} ringed: ${esc(label)}</span><button type="button" aria-label="Clear highlight">✕</button>`;
  chip.hidden = false;
  chip.querySelector("button").onclick = clearHighlight;
  yard.fitTo(ids);
}
function clearHighlight() {
  yard.setHighlight(null);
  $("highlightChip").hidden = true;
}

start();
