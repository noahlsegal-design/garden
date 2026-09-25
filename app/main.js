// Starts the app: loads the data, builds the 3D yard, and wires up the buttons.

import { loadGarden, MONTH_NAMES, esc } from "./data.js";
import { createYard } from "./scene.js";
import { renderMonths, renderCard, renderList, openLightbox } from "./ui.js";
import { buildWeek, openCount, createCheckStore, macBackend, mondayOf, parseYmd, ymd } from "./tasks.js";
import { cloudReady, cloudBackend, account, signIn, signOut } from "./cloud.js";
import { renderTasks } from "./tasklist.js";

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
const state = { month: TODAY, selectedId: null, filters: { ...NO_FILTERS }, highlight: null, taskWeek: mondayOf(today()) };
let garden, yard, byId, areaOrder, store;
let hintDone = false; // the how-to-move hint goes away once you've moved the view

async function start() {
  try {
    garden = await loadGarden();
  } catch (err) {
    $("status").innerHTML = `<div><p><b>The garden couldn't load.</b></p><pre>${String(err.message).replace(/</g, "&lt;")}</pre></div>`;
    return;
  }
  byId = new Map(garden.plants.map((p) => [p.id, p]));
  areaOrder = [...garden.layout.areas.map((a) => a.id), "fenceline"];
  // Check-offs go to the garden account on Supabase once it's set up (app/config.js), or to the Mac until then.
  store = createCheckStore(garden.plants, cloudReady ? cloudBackend : macBackend, () => {
    if (!$("tasksPanel").hidden) drawTasks();
    updateTaskCount();
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
    yard = { setPlants() {}, setMonth() {}, select() {}, focus() {}, resetView() {}, setHighlight() {}, fitTo() {}, views: () => [], goTo() {}, zoomBy() {}, turn() {} };
  }
  yard.setPlants(garden.plants.filter((p) => !p.finished), garden.species, state.month);
  yard.setMonth(state.month);
  if (has3d) $("status").hidden = true;

  renderMonthsBar();
  updateHint();
  setUpMapButtons();
  $("listBtn").onclick = openList;
  $("tasksBtn").onclick = openTasks;
  updateTaskCount();
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !$("lightbox").hidden) return;
    if (!$("viewsMenu").hidden) { showViews(false); $("viewsBtn").focus(); }
    else if (!$("tasksPanel").hidden) closeTasks();
    else if (!$("listPanel").hidden) closeList();
    else if (state.selectedId) closeCard();
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
  renderMonths($("months"), state.month, TODAY, setMonth);
}

function setMonth(m) {
  state.month = m;
  renderMonthsBar();
  yard.setMonth(m);
  if (state.selectedId) showCard();
  if (!$("listPanel").hidden) drawList();
  updateHint();
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
  renderCard($("sheet"), {
    plant: p, species: garden.species.get(p.speciesId), month: state.month,
    areaName: garden.areaNames.get(p.area) || p.area,
    onClose: closeCard, onPhoto: openLightbox,
  });
}
function closeCard() {
  state.selectedId = null;
  yard.select(null);
  $("sheet").hidden = true;
  syncHash();
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
    cloud: cloudReady, account: account(),
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
  yard.setHighlight({ ids, color });
  const chip = $("highlightChip");
  chip.innerHTML = `<span>${ids.length} ringed: ${esc(label)}</span><button type="button" aria-label="Clear highlight">✕</button>`;
  chip.hidden = false;
  chip.querySelector("button").onclick = () => { yard.setHighlight(null); chip.hidden = true; };
  yard.fitTo(ids);
}

start();
