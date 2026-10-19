// Starts the app: loads the data, builds the 3D yard, and wires up the buttons.

import { loadGarden, MONTH_NAMES, esc, areaAt, seasonOverride } from "./data.js";
import { createYard } from "./scene.js";
import { renderCard, renderSaveEdits, openLightbox } from "./ui.js";
import { renderCalendar } from "./calendar.js";
import { renderPlantList, NO_FILTERS, CHIPS, TYPES, ONLY } from "./plantlist.js";
import { buildWeek, openCount, createCheckStore, macBackend, mondayOf, parseYmd, ymd, servedByMac } from "./tasks.js";
import { cloudReady, cloudBackend, notesBackend, checksBackend, thumbOf, account, signIn, signOut } from "./cloud.js";
import { createNotes } from "./notes.js";
import { createChecks } from "./checks.js";
import { withEdits, editFor, unsavedEdits, staleEdits, describeEdits, basePlant, newPlant, newPlantId,
  STRUCTURE, isStructureEdit, structureBase, withStructureEdits, unsavedStructureEdits, staleStructureEdits } from "./edits.js";
import { renderTasks, revealRow } from "./tasklist.js";
import { renderToday, renderAllPhotos, renderSettings, resortJobs } from "./today.js";
import { THEMES, getPrefs, setPref } from "./prefs.js";
import { bloomCounts, createBloomBar } from "./bloom.js";
import { renderEditBar } from "./editbar.js";
import { plantHeight, plantRadius, isVine, SUPPORTS, SHAPES, LOOK } from "./look.js";
import { isArch, archOf } from "./arches.js";
import { createLabels, renderPeek, hidePeek } from "./yardview.js";
import { plainName } from "./today.js";

const $ = (id) => document.getElementById(id);

// Today's date. For testing, add ?today=2026-10-16 to the address to see the app as if it were that day.
function today() {
  const d = parseYmd(new URLSearchParams(location.search).get("today")) || new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
const TODAY = today().getMonth();

const HINT = matchMedia("(pointer: coarse)").matches
  ? "Drag to move around · Pinch to zoom · Twist two fingers to turn · Tap a plant"
  : "Drag to move around · Scroll to zoom · Shift-drag or right-drag to turn · Click a plant";
// selectedId is the plant picked in the yard; card says whether its card is open (in Edit mode a plant can be
// picked without opening its card). peek is the plant whose small card is up in the Yard view.
const state = { month: TODAY, bloom: false, selectedId: null, card: false, peek: null, filters: { ...NO_FILTERS }, highlight: null, taskWeek: mondayOf(today()) };
// Edit mode: `step` is "idle", "adding" (choosing the kind and name) or "placing" (waiting for a tap in the yard).
const editMode = { on: false, step: "idle", draft: null, message: "" };
let yardEditing = false; // whether the yard lets plants be dragged and placed (Edit mode, and allowed to save)
const undoStack = []; // Edit mode changes made on this device, newest last: { label, id, before } or { label, id, added: true }
// Plants that show in the yard, the bloom timeline and This week.
const inYard = (p) => !p.finished && !p.removed;
// Each plant with "Still growing" or "Dead" from its card worked out as the months it covers this year (seasonNow),
// which the yard, the card and the list draw it by.
const withSeasons = (plants) => plants.map((p) => (p.season ? { ...p, seasonNow: seasonOverride(p.season, today()) } : p));
let garden, yard, byId, areaOrder, store, bloomBar, labels;
let blooms = []; // how many plants in the yard flower in each month, Jan..Dec
// Each plant's notes and photos, kept in the shared garden on Supabase (none without a garden account).
const notes = cloudReady ? createNotes({ backend: notesBackend, thumbOf, today: () => ymd(today()), onPhoto: openLightbox }) : null;
// Photo checks answered in the Claude app (Plant health, Friend or foe): the health timeline and the bug
// catalog, also in the shared garden.
const checks = cloudReady ? createChecks({
  backend: checksBackend, notes, today: () => ymd(today()), onPhoto: openLightbox,
  garden: () => ({ plants: garden.plants.filter((p) => !p.removed), inYard, species: garden.species, areaNames: garden.areaNames, areaOrder, site: garden.layout.site || {} }),
  access: () => editAccess("use photo checks"),
  onPlant: (id) => { if (editMode.on) setEditing(false); selectPlant(id, { focus: true }); },
  onShowInYard: (ids, label, color) => setHighlight(ids, label, color),
  onClose: () => $("checksBtn")?.focus({ preventScroll: true }),
}) : null;
// data/plants.json as it is, before the plant changes made in the app (edits.js) go on top, and layout.json's
// structures (the arch trellises can be changed in Edit mode too).
let filePlants, fileById, fileStructures;
let editsDrawn = null; // the plant changes the yard was last drawn with
let kinds = []; // every kind of plant, for "Confirm ID": [id, name, still a placeholder for an unidentified plant]
// This copy's plants.json is the Mac's own (the Mac copy, or a phone opening it over Wi-Fi), not the website's.
const ON_MAC = servedByMac();
// "Save app edits into files" writes into this Mac's files, so it's offered only in a browser on the Mac itself.
const MAC_ITSELF = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
// Which screen the tab bar shows (today, calendar or plants), and whether Today has stepped aside for the Yard view.
const nav = { screen: "today", yard: false };
let playTimer = null; // set while the bloom timeline is playing
let notePhotos = []; // the newest notes with photos, across every plant (Today's job cards and Latest photos)
let myName = ""; // your name in the shared garden, for the initials on jobs you checked off (Calendar)
let hintDone = false; // the how-to-move hint goes away once you've moved the view

async function start() {
  try {
    garden = await loadGarden();
  } catch (err) {
    $("status").innerHTML = `<div><p><b>The garden couldn't load.</b></p><pre>${String(err.message).replace(/</g, "&lt;")}</pre></div>`;
    return;
  }
  filePlants = garden.plants;
  garden.plants = withSeasons(filePlants);
  byId = new Map(garden.plants.map((p) => [p.id, p]));
  fileById = new Map(filePlants.map((p) => [p.id, p]));
  fileStructures = garden.layout.structures;
  kinds = [...garden.species.values()]
    .map((s) => [s.id, s.commonName, /unconfirmed/i.test(s.commonName) || s.id.startsWith("unknown")])
    .sort((a, b) => a[1].localeCompare(b[1]));
  areaOrder = [...garden.layout.areas.map((a) => a.id), "fenceline"];
  // Check-offs and plant changes go to the shared garden on Supabase once it's set up (app/config.js), or to
  // the Mac until then.
  store = createCheckStore(filePlants, cloudReady ? cloudBackend : macBackend, () => {
    if (!applyEdits()) { // the card's controls depend on being signed in, and the Plants cards on the to-dos left
      refreshSelection();
      if (!$("listPanel").hidden) drawList();
    }
    updateEditButton();
    if (!$("tasksPanel").hidden) drawTasks();
    if (!$("settingsPanel").hidden) drawSettings();
    drawToday();
    if (nav.screen === "calendar") drawCalendar();
    updateYardView();
    setTimeout(clearOldEdits);
  });
  store.refresh();
  // Coming back to the app (say, after checking things off on the other device) fetches the latest list.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    store.refresh();
    notes?.refresh();
    checks?.refresh();
    resortJobs();
    refreshPhotos();
  });
  refreshPhotos();

  let has3d = true;
  try {
    yard = createYard($("yard"), {
      layout: garden.layout, onMove: movedView, onDrop: movedPlant, onPlace: placePlant, onRender: placeLabels, covered: yardCovered,
      onPick: (id, at) => (editMode.on ? pickToEdit(id) : pickedInYard((labelsShown() && labels.hit(at.x, at.y)) || id)),
    });
  } catch (err) {
    $("status").innerHTML = `<div><p><b>3D view couldn't start on this device.</b></p><p>You can still browse everything on the <b>Plants</b> tab and in <b>This week</b>.</p><pre>${String(err.message).replace(/</g, "&lt;")}</pre></div>`;
    $("status").style.pointerEvents = "none";
    $("status").style.background = "transparent";
    has3d = false;
    yard = { setPlants() {}, setMonth() {}, setBloom() {}, select() {}, focus() {}, resetView() {}, setHighlight() {}, fitTo() {}, views: () => [], goTo() {}, zoomBy() {}, turn() {}, updatePlant() {}, setEditing() {}, setPlacing() {}, setArches() {}, spots: () => [] };
  }
  yard.setArches(archesNow());
  const growing = garden.plants.filter(inYard);
  yard.setPlants(growing, garden.species, state.month);
  yard.setMonth(state.month);
  editsDrawn = JSON.stringify({});
  if (has3d) $("status").hidden = true;

  blooms = bloomCounts(growing, garden.species);
  bloomBar = createBloomBar($("bloomBar"), {
    counts: blooms,
    onScrub: (m) => { stopPlaying(); setBloom(true); setMonth(m); },
    onPlay: () => (playTimer ? stopPlaying() : playYear()),
    onOff: () => { stopPlaying(); setBloom(false); },
  });
  updateBloomBar();
  labels = createLabels($("yardLabels"), { onPick: (id) => pickedInYard(id) });
  drawMonths();
  updateHint();
  setUpMapButtons();
  setUpScreens();
  $("editBtn").dataset.no3d = has3d ? "" : "1"; // dragging and placing plants need the 3D yard
  $("editBtn").onclick = () => setEditing(!editMode.on);
  updateEditButton();
  // The map buttons in the corner sit just above the edit bar, however tall it is.
  new ResizeObserver(() => {
    if (editMode.on) $("stage").style.setProperty("--bloombar", `${$("editBar").offsetHeight}px`);
  }).observe($("editBar"));
  $("tasksBtn").onclick = () => openTasks();
  $("settingsBtn").onclick = openSettings;
  drawToday();
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !$("lightbox").hidden) return;
    if (!$("savePanel").hidden) closeSaveEdits();
    else if (!$("settingsPanel").hidden) closeSettings();
    else if (!$("photosPanel").hidden) closePhotos();
    else if (checks?.isOpen) checks.close();
    else if (!$("viewsMenu").hidden) { showViews(false); $("viewsBtn").focus(); }
    else if (!$("tasksPanel").hidden) closeTasks();
    else if (state.card) closeCard();
    else if (editMode.on && editMode.step !== "idle") cancelAdding();
    else if (editMode.on && state.selectedId) pickToEdit(null);
    else if (editMode.on) setEditing(false);
    else if (state.peek) closePeek();
    else if (state.bloom) { stopPlaying(); setBloom(false); }
    else if (nav.yard) setYardView(false);
  });

  // Open straight to a plant (address ends in #plant=pb-05), to This week (#tasks), or to the Calendar or Plants
  // screen (#calendar, #plants). Handy for bookmarks.
  const hash = new URLSearchParams(location.hash.slice(1));
  const fromHash = hash.get("plant");
  if (fromHash && byId.has(fromHash)) selectPlant(fromHash, { focus: true });
  else if (hash.has("tasks")) openTasks();
  else if (hash.has("calendar")) showScreen("calendar");
  else if (hash.has("plants")) showScreen("plants");
  else if (hash.has("yard")) setYardView(true);
}

// Keeps the address in step with what's open, so a bookmark or refresh comes back to it.
function syncHash() {
  const plant = state.selectedId && !isStructureEdit(state.selectedId) ? state.selectedId : null;
  const h = !$("tasksPanel").hidden ? "#tasks" : plant ? `#plant=${encodeURIComponent(plant)}` : nav.screen !== "today" ? `#${nav.screen}` : nav.yard ? "#yard" : "";
  history.replaceState(null, "", location.pathname + location.search + h);
}

// ---------- screens: Today, Calendar and Plants (the tab bar), and the Yard view ----------
function setUpScreens() {
  $("tabBar").onclick = (e) => {
    const tab = e.target.closest("[data-tab]");
    if (tab) showScreen(tab.dataset.tab);
  };
  $("searchBtn").onclick = () => {
    showScreen("plants");
    $("listSearch")?.focus({ preventScroll: true });
  };
  $("yardBack").onclick = () => setYardView(false);
  $("todayDate").textContent = today().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  document.body.dataset.screen = nav.screen;
}
function showScreen(name) {
  setYardView(false);
  if (name === nav.screen) return;
  if (name === "today") { resortJobs(); drawToday(); }
  nav.screen = name;
  document.body.dataset.screen = name;
  if (state.card) closeCard(); // the card belongs to the yard, which is only behind the veil on the other screens
  $("todayScreen").hidden = name !== "today";
  $("calendarScreen").hidden = name !== "calendar";
  if (name === "plants") drawList();
  else $("listPanel").hidden = true;
  if (name === "calendar") drawCalendar();
  $("tabBar").querySelectorAll("[data-tab]").forEach((t) => {
    if (t.dataset.tab === name) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  });
  syncHash();
}
// The Yard view: the live yard full screen (no tab bar), with a round back button, the month switcher and
// Views at the top, labels over the plants with jobs this week, and a small card that slides up for a plant.
// Leaving it ends Edit mode and the bloom view, whose controls live there.
function setYardView(on) {
  if (nav.yard === on) return;
  nav.yard = on;
  document.body.classList.toggle("yardview", on);
  if (!on) {
    if (editMode.on) setEditing(false);
    stopPlaying();
    setBloom(false);
    showViews(false);
    closePeek();
  }
  updateYardView();
  syncHash();
}
// A tap on the yard (or on a label): on Today it opens the Yard view, and in the Yard view a plant's small card
// slides up. A tap that missed every plant closes whatever card is open.
function pickedInYard(id) {
  if (state.card) return id ? selectPlant(id) : closeCard(); // the side panel on wide screens leaves the yard in view
  if (!nav.yard) {
    if (nav.screen !== "today") return;
    setYardView(true);
  }
  if (id) showPeek(id);
  else closePeek();
}

// ----- the small card -----
function showPeek(id) {
  const p = byId.get(id);
  if (!p) return closePeek();
  state.peek = id;
  yard.select(id);
  labels.setActive(id);
  drawPeek();
  document.body.classList.add("peeking");
}
function drawPeek() {
  const p = state.peek && byId.get(state.peek);
  if (!p) return;
  renderPeek($("peek"), {
    plant: p, species: garden.species.get(p.speciesId), areaName: garden.areaNames.get(p.area) || p.area,
    month: state.month, thisMonth: state.month === TODAY, jobs: jobsByPlant().get(p.id) || [],
    notePhotos: newestNotePhotos(), thumb: (photo) => notesBackend.photo(thumbOf(photo)),
    onOpen: () => selectPlant(p.id),
    onClose: closePeek,
  });
}
function closePeek() {
  if (!state.peek) return;
  state.peek = null;
  if (!state.card) yard.select(null);
  labels?.setActive(null);
  hidePeek($("peek"));
  document.body.classList.remove("peeking");
}
// Each plant's newest note with a photo.
function newestNotePhotos() {
  const out = new Map();
  for (const n of notePhotos) if (!out.has(n.plantId)) out.set(n.plantId, n);
  return out;
}

// ----- the labels -----
// They show in the Yard view for this month, and step aside for Edit mode, the bloom view, rings from
// "Show in the yard" and an open plant card.
const labelsShown = () => nav.yard && !editMode.on && !state.bloom && !state.card && state.month === TODAY && $("highlightChip").hidden;
function updateYardView() {
  if (!labels) return;
  const show = labelsShown();
  $("yardLabels").hidden = !show;
  if (show) {
    const items = [];
    for (const [id, jobs] of jobsByPlant()) {
      const p = byId.get(id);
      if (p && inYard(p)) items.push({ id, name: plainName(garden.species.get(p.speciesId)), count: jobs.length });
    }
    labels.set(items);
    placeLabels();
  }
  if (state.peek) {
    if (!byId.has(state.peek) || !inYard(byId.get(state.peek))) closePeek();
    else drawPeek();
  }
}
// Called after every redraw of the yard, so the labels follow the plants as you move around. They stay in the
// band between the top bar (and the how-to-move note) and the bloom timeline or the small card.
function placeLabels() {
  if (!labels || $("yardLabels").hidden) return;
  const above = $("hintText").hidden ? $("yardBack") : $("hintText");
  const below = $("peek").hidden ? $("bloomBar") : $("peek");
  labels.place(yard.spots(labels.ids()), {
    top: above.getBoundingClientRect().bottom + 6, bottom: below.getBoundingClientRect().top - 6, width: $("stage").clientWidth,
  });
}

// The month switcher at the top of the Yard view (tapping the month's name goes back to this month), and the
// note on Today saying which month the yard shows, when it isn't this month.
function drawMonths() {
  const back = `<button type="button" class="linkbtn" data-month-back>Back to ${MONTH_NAMES[TODAY]}</button>`;
  $("todayMonth").innerHTML = `Showing <b>${MONTH_NAMES[state.month]}</b> · ${back}`;
  $("todayMonth").hidden = state.month === TODAY;
  for (const b of document.querySelectorAll("[data-month-back]")) b.onclick = () => { stopPlaying(); setMonth(TODAY); };
  const name = $("monthName");
  const away = state.month !== TODAY;
  name.innerHTML = `${MONTH_NAMES[state.month]}${away ? `<span class="monthnow">Back to ${MONTH_NAMES[TODAY]}</span>` : ""}`;
  name.disabled = !away;
  name.setAttribute("aria-label", away ? `Showing ${MONTH_NAMES[state.month]}. Back to ${MONTH_NAMES[TODAY]}` : `Showing ${MONTH_NAMES[state.month]}, this month`);
}

function setMonth(m) {
  state.month = m;
  drawMonths();
  yard.setMonth(m);
  if (state.card) showCard();
  if (!$("listPanel").hidden) drawList();
  updateHint();
  updateBloomBar();
  updateYardView();
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
  updateYardView();
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
// The note under the top bar: how to move around, until you've done it once. (The month switcher says which
// month is showing.)
function updateHint() {
  const text = editMode.on || hintDone ? "" : HINT;
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
  const step = (d) => () => { stopPlaying(); setMonth((state.month + d + 12) % 12); };
  $("monthPrev").onclick = step(-1);
  $("monthNext").onclick = step(1);
  $("monthName").onclick = () => { stopPlaying(); setMonth(TODAY); };
  $("zoomInBtn").onclick = act(() => yard.zoomBy(0.6));
  $("zoomOutBtn").onclick = act(() => yard.zoomBy(1 / 0.6));
  $("turnLeftBtn").onclick = act(() => yard.turn(-Math.PI / 4)); // the yard swings counterclockwise, like the icon
  $("turnRightBtn").onclick = act(() => yard.turn(Math.PI / 4));

  const views = yard.views();
  const group = (g, title) => {
    const list = views.filter((v) => v.group === g);
    return list.length ? `<h3>${title}</h3>${list.map((v) => `<button type="button" data-view="${esc(v.id)}">${esc(v.name)}${v.note ? `<span>${esc(v.note)}</span>` : ""}</button>`).join("")}` : "";
  };
  $("viewsMenu").innerHTML = `<button type="button" data-view="reset">Reset view<span>Where it starts</span></button>` + group("look", "Look from") + group("zoom", "Zoom to");
  $("viewsBtn").onclick = () => showViews($("viewsMenu").hidden);
  $("viewsMenu").onclick = (e) => {
    const b = e.target.closest("[data-view]");
    if (!b) return;
    showViews(false);
    movedView();
    if (b.dataset.view === "reset") yard.resetView();
    else yard.goTo(b.dataset.view);
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
// On phones the card, This week, Photo check, All photos and the photo viewer cover the whole yard, so it stops
// redrawing behind them (the picked plant's pulsing ring would otherwise redraw it every frame while the card scrolls).
const WIDE = matchMedia("(min-width: 900px)");
const COVERS = ["sheet", "tasksPanel", "checksPanel", "photosPanel", "savePanel"];
function yardCovered() {
  return !$("lightbox").hidden || (!WIDE.matches && COVERS.some((id) => !$(id).hidden));
}
// From the Calendar and Plants screens the card opens over them, and closing the card goes back to them.
function selectPlant(id, { focus = false } = {}) {
  state.selectedId = id;
  state.card = true;
  yard.select(id);
  if (focus) yard.focus(id);
  showCard();
  syncHash();
  updateYardView();
}
// After the plants or the account change: redraws the open card and the edit bar.
function refreshSelection() {
  if (state.card) showCard();
  if (editMode.on) drawEditBar();
}
function showCard() {
  const p = byId.get(state.selectedId);
  if (!p) return closeCard();
  const now = today();
  renderCard($("sheet"), {
    plant: p, species: garden.species.get(p.speciesId), month: state.month,
    areaName: garden.areaNames.get(p.area) || p.area, edit: editControls(p),
    hero: heroOf(p), checkOffs: state.month === now.getMonth() ? checkOffsFor(p, weekFor(mondayOf(now))) : null,
    onToggle: (keys, on) => store.change(on ? { set: Object.fromEntries(keys.map((k) => [k, ymd(now)])) } : { unset: keys }),
    onClose: closeCard, onPhoto: openLightbox,
    onNotes: notes && ((el) => notes.draw(el, p.id, editAccess("see and add notes and photos"))),
    onChecks: checks && ((el) => checks.drawCard(el, p, editAccess("use photo checks"))),
  });
}
// The card's big photo: the plant's newest photo from its notes, else its first photo in plants.json.
function heroOf(p) {
  const n = notePhotos.find((x) => x.plantId === p.id);
  if (n) return { load: () => notesBackend.photo(n.photo), open: [{ caption: `${p.name} · ${n.date}${n.by ? ` · ${n.by}` : ""}`, load: () => notesBackend.photo(n.photo) }] };
  return p.photos?.length ? { src: p.photos[0], open: p.photos } : null;
}
// This week's check-offs for one plant, by care entry: the same keys This week and Today use (one per plant for
// one-time jobs, one for the whole kind for weekly rounds). Each is { keys, done }.
function checkOffsFor(p, week) {
  const out = new Map();
  for (const j of [...week.jobs, ...week.earlier]) {
    const i = j.plants.findIndex((x) => x.id === p.id);
    if (i >= 0 && !out.has(j.care)) out.set(j.care, { keys: [j.plantKeys[i]], done: Boolean(store.checks.done[j.plantKeys[i]]) });
  }
  for (const r of week.rounds) for (const it of r.items) {
    if (it.plants.some((x) => x.id === p.id) && !out.has(it.care)) out.set(it.care, { keys: [it.key], done: Boolean(it.done) });
  }
  return out;
}
function closeCard() {
  state.selectedId = null;
  state.card = false;
  yard.select(state.peek); // back to the Yard view's small card, if it was up
  $("sheet").hidden = true;
  updateYardView();
  syncHash();
  if (editMode.on) drawEditBar();
  refreshPhotos(); // a photo may have just been added on the card
}

// ---------- plant changes made in the app ----------
// Redraws everything that shows plants when the changes are different from last time (made here, or by
// someone else in the garden). Says whether anything changed.
function applyEdits() {
  const sig = JSON.stringify(store.checks.edits);
  if (!yard || editsDrawn == null || sig === editsDrawn) return false;
  editsDrawn = sig;
  garden.plants = withSeasons(withEdits(filePlants, store.checks.edits, garden.species, ON_MAC));
  byId = new Map(garden.plants.map((p) => [p.id, p]));
  yard.setArches(archesNow());
  const growing = garden.plants.filter(inYard);
  yard.setPlants(growing, garden.species, state.month);
  blooms = bloomCounts(growing, garden.species);
  bloomBar.setCounts(blooms);
  updateBloomBar();
  drawMonths();
  // A plant picked in Edit mode that's no longer in the yard (removed, say) is let go.
  if (editMode.on && state.selectedId && !state.card && !isStructureEdit(state.selectedId) && !(byId.has(state.selectedId) && inYard(byId.get(state.selectedId)))) {
    state.selectedId = null;
    yard.select(null);
  }
  refreshSelection();
  updateYardView();
  if (!$("listPanel").hidden) drawList();
  if (!$("savePanel").hidden && saving.phase === "review") drawSaveEdits();
  return true;
}

// Whether plants can be changed here, and if not, why (null when there's nowhere to save changes at all).
function editAccess(doing) {
  const { status, shared } = store.checks;
  if (!cloudReady && ["device", "old-server"].includes(status)) return null;
  let note = "";
  if (cloudReady) {
    if (!account() || status === "signed-out") note = `Sign in under This week to ${doing}.`;
    else if (status === "not-member") note = "This account isn't in the garden yet, so it can't change plants.";
    else if (shared === false) note = "Changing plants here needs the new Supabase setup: run supabase/setup.sql again.";
  }
  return { can: !note, note };
}
// What a plant's changes are measured against: its line in plants.json, or the details it was added with.
const baseOf = (id) => basePlant(filePlants, store.checks.edits, garden.species, ON_MAC, id);

// Saves new values for some of a plant's details. With a label, Edit mode's Undo can take it back.
function saveValues(id, values, undoLabel) {
  const base = baseOf(id);
  if (!base) return;
  const at = new Date().toISOString(), edits = store.checks.edits;
  const fields = Object.fromEntries(Object.entries(values).map(([f, v]) => [f, editFor(base, edits, f, v, at)]));
  if (undoLabel) undoStack.push({ label: undoLabel, id, before: Object.fromEntries(Object.keys(values).map((f) => [f, edits[id]?.[f] ?? null])) });
  store.change({ edits: { [id]: fields } });
}

// What the card offers: confirm, rename and finish (and put back a removed plant), once you're signed in.
function editControls(p) {
  const base = baseOf(p.id);
  const access = base && editAccess("confirm, rename or finish plants");
  if (!access) return null;
  return {
    ...access, kinds, today: ymd(today()),
    supports: isVine(p) ? SUPPORTS : null,
    shapes: SHAPES, defaultShape: LOOK[p.speciesId]?.shape || "mound", // a custom shape stays when the kind changes
    changes: describeEdits(base, store.checks.edits, garden.species, ON_MAC, account(), garden.areaNames),
    onSave: (values) => saveValues(p.id, values),
    onUndo: (fields) => store.change({ edits: { [p.id]: Object.fromEntries(fields.map((f) => [f, null])) } }),
  };
}

// ---------- arch trellises ----------
// The arches as the yard draws them: layout.json with Edit mode's changes, each with the ID its changes go under.
function archesNow() {
  return withStructureEdits(fileStructures, store?.checks.edits, ON_MAC).filter(isArch).map((s) => ({ ...archOf(s), hitId: STRUCTURE + s.id }));
}
const archById = (id) => archesNow().find((a) => a.hitId === id);
// Saves new values for an arch's details, like saveValues for a plant.
function saveArch(id, values, undoLabel) {
  const file = fileStructures.find((s) => STRUCTURE + s.id === id);
  if (!file) return;
  const base = structureBase(file), at = new Date().toISOString(), edits = store.checks.edits;
  const fields = Object.fromEntries(Object.entries(values).map(([f, v]) => [f, editFor(base, edits, f, v, at)]));
  if (undoLabel) undoStack.push({ label: undoLabel, id, before: Object.fromEntries(Object.keys(values).map((f) => [f, edits[id]?.[f] ?? null])) });
  store.change({ edits: { [id]: fields } });
}

// ---------- Edit mode: add, move, resize and remove plants ----------
function updateEditButton() {
  const btn = $("editBtn");
  if (!btn || !yard) return;
  const access = editAccess("edit the yard");
  if (!access && editMode.on) setEditing(false);
  btn.hidden = !access || btn.dataset.no3d === "1";
  if (editMode.on) drawEditBar();
}
function setEditing(on) {
  editMode.on = on;
  Object.assign(editMode, { step: "idle", draft: null, message: "" });
  const btn = $("editBtn");
  btn.setAttribute("aria-pressed", String(on));
  btn.textContent = on ? "Done" : "Edit";
  $("stage").classList.toggle("editing", on);
  if (!on) { yardEditing = false; yard.setEditing(false); }
  if (on) {
    stopPlaying();
    setBloom(false);
    closePeek();
    if (state.card) { state.card = false; $("sheet").hidden = true; } // the plant stays picked, with its controls in the bar
    if (state.selectedId && !inYard(byId.get(state.selectedId) || {})) { state.selectedId = null; yard.select(null); }
    drawEditBar();
  } else {
    $("editBar").hidden = true;
    $("stage").style.removeProperty("--bloombar");
    if (state.selectedId && !state.card) { state.selectedId = null; yard.select(null); }
  }
  updateHint();
  updateYardView();
  syncHash();
}
function pickToEdit(id) {
  if (editMode.step !== "idle") return;
  state.selectedId = id;
  state.card = false;
  $("sheet").hidden = true;
  editMode.message = "";
  yard.select(id);
  if (id && isStructureEdit(id)) yard.focus(id); // bring the arch into view above its controls
  drawEditBar();
  syncHash();
}
function drawEditBar() {
  if (!editMode.on) return;
  const access = editAccess("edit the yard");
  const last = undoStack.at(-1);
  const arch = state.selectedId && isStructureEdit(state.selectedId) ? archById(state.selectedId) : null;
  const p = !arch && state.selectedId && byId.get(state.selectedId);
  const sp = p && garden.species.get(p.speciesId);
  const view = !access?.can ? "note" : editMode.step !== "idle" ? editMode.step : arch ? "arch" : p && !state.card ? "plant" : "idle";
  if (yardEditing !== (view !== "note")) {
    yardEditing = view !== "note";
    yard.setEditing(yardEditing);
    if (!yardEditing) Object.assign(editMode, { step: "idle", draft: null });
  }
  renderEditBar($("editBar"), {
    view, note: access?.note || "", kinds, draft: editMode.draft || {}, message: editMode.message,
    undo: last ? last.label : "",
    plant: p && {
      name: p.name, stems: p.stems ?? null, ...measured(p, sp), estimated: p.width == null && p.height == null,
      where: [sp?.commonName, garden.areaNames.get(p.area) || p.area].filter(Boolean).join(" · "),
    },
    arch,
    // An arch's shape, size and direction: it changes in the yard as you slide, and is saved when you let go.
    onArch: (change, done) => {
      if (!done) return yard.setArches(archesNow().map((a) => (a.hitId === arch.hitId ? { ...a, ...change } : a)));
      editMode.message = "";
      saveArch(arch.hitId, change, change.shape ? "Undo shape" : change.turn != null ? "Undo turn" : "Undo resize");
    },
    focus: view === "adding" ? "#addKind" : null,
    onAdd: () => { editMode.step = "adding"; editMode.draft = { kind: "", name: "" }; editMode.message = ""; pickToEditQuietly(null); drawEditBar(); },
    onNext: (draft) => {
      editMode.draft = draft;
      editMode.step = "placing";
      yard.setPlacing(true);
      drawEditBar();
      updateHint();
    },
    onCancel: cancelAdding,
    onClose: () => pickToEdit(null),
    // Height, width and main stems. Height and width change separately: entering one keeps the other as it
    // looks now, so a plant made wider doesn't also grow taller.
    onMeasure: (change, done) => {
      const values = "stems" in change ? change : { ...measured(p, sp), ...change };
      if (!done) return yard.updatePlant({ ...p, ...values });
      editMode.message = "";
      saveValues(p.id, values, "stems" in change ? "Undo stems" : "Undo resize");
    },
    onRemove: () => {
      editMode.message = `Removed “${p.name}”. It's hidden from the yard and This week, not erased.`;
      pickToEditQuietly(null);
      saveValues(p.id, { removed: ymd(today()) }, "Undo remove");
    },
    onCard: () => { state.card = true; showCard(); syncHash(); },
    onUndo: undoLast,
  });
  if (!$("editBar").hidden) $("stage").style.setProperty("--bloombar", `${$("editBar").offsetHeight}px`);
}
// A plant's height and width in feet, to a tenth: what it was given, or what the yard draws for its kind.
function measured(p, sp) {
  return { height: Math.round(plantHeight(p, sp) * 10) / 10, width: Math.round(plantRadius(p, sp) * 20) / 10 };
}
function pickToEditQuietly(id) {
  state.selectedId = id;
  yard.select(id);
  syncHash();
}
function cancelAdding() {
  Object.assign(editMode, { step: "idle", draft: null });
  yard.setPlacing(false);
  drawEditBar();
  updateHint();
}
// A plant was dragged and let go somewhere new. Moving it into a different bed changes its bed too.
function movedPlant(id, position) {
  if (isStructureEdit(id)) {
    editMode.message = "";
    pickToEditQuietly(id);
    saveArch(id, { position }, "Undo move");
    drawEditBar();
    return;
  }
  const p = byId.get(id);
  if (!p) return;
  const values = { position };
  const area = areaAt(garden.layout, position.x, position.z);
  if (area && area !== p.area) values.area = area;
  editMode.message = "";
  pickToEditQuietly(id);
  saveValues(id, values, "Undo move");
}
// The yard was tapped while placing a new plant: add it there.
function placePlant(position) {
  const draft = editMode.draft;
  if (editMode.step !== "placing" || !draft) return;
  const kind = kinds.find(([id]) => id === draft.kind);
  const plant = newPlant({
    id: newPlantId(draft.kind), name: draft.name, speciesId: draft.kind, position,
    area: areaAt(garden.layout, position.x, position.z) || "lawn", unsure: Boolean(kind?.[2]),
  });
  Object.assign(editMode, { step: "idle", draft: null, message: `Added “${plant.name}”. Drag it to fine-tune its spot.` });
  yard.setPlacing(false);
  undoStack.push({ label: "Undo add", id: plant.id, added: true });
  store.change({ edits: { [plant.id]: { added: { v: plant, at: new Date().toISOString() } } } });
  pickToEditQuietly(plant.id);
  drawEditBar();
  updateHint();
}
// Takes back the last Edit mode change made on this device. Undoing an add takes the new plant away entirely.
function undoLast() {
  const u = undoStack.pop();
  if (!u) return;
  editMode.message = "";
  const fields = u.added ? Object.fromEntries(Object.keys(store.checks.edits[u.id] || {}).map((f) => [f, null])) : u.before;
  if (u.added && state.selectedId === u.id) pickToEditQuietly(null);
  store.change({ edits: { [u.id]: fields } });
  if (!u.added && (isStructureEdit(u.id) || (byId.has(u.id) && inYard(byId.get(u.id))))) pickToEditQuietly(u.id);
  drawEditBar();
}

// Online, a change saved into plants.json stays in Supabase until the website's plants.json has it too (once
// the garden is published). Then the website clears it.
const clearing = new Set();
function clearOldEdits() {
  if (ON_MAC || !cloudReady || store.checks.status !== "saved") return;
  const edits = {};
  for (const [id, field] of [...staleEdits(filePlants, store.checks.edits), ...staleStructureEdits(fileStructures, store.checks.edits)]) {
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
    rows: unsavedRows(), species: garden.species, areaNames: garden.areaNames, cloud: cloudReady, ...saving,
    onSave: saveEditsIntoFiles, onClose: closeSaveEdits,
  });
}
// Every change not in the files yet: plants (plants.json), then arches (layout.json).
const unsavedRows = () => [...unsavedEdits(filePlants, store.checks.edits, garden.species), ...unsavedStructureEdits(fileStructures, store.checks.edits)];
async function saveEditsIntoFiles() {
  const rows = unsavedRows();
  const toFile = {};
  for (const r of rows) {
    if (r.field === "added") { if (!r.dropped) toFile[r.id] = { added: r.to }; }
    else if (r.plant || r.structure) (toFile[r.id] ??= {})[r.field] = r.to;
  }
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
  fileStructures = fresh.layout.structures;
  // Online, each change stays in Supabase marked "saved" until the website has the new file. With no garden
  // account, the file is all there is, so they're simply cleared.
  const at = new Date().toISOString(), change = {};
  const clearAll = (id) => Object.fromEntries(Object.keys(store.checks.edits[id] || {}).map((f) => [f, null]));
  let written = 0, cleared = 0;
  for (const r of rows) {
    const had = fileHad?.[r.id];
    if (r.field === "added") {
      // A new plant is written whole, with its later changes folded in. Online, the website keeps showing it
      // from the saved "added" change until it's published.
      if (r.dropped) { cleared++; change[r.id] = clearAll(r.id); }
      else if (had && "added" in had) {
        written++;
        change[r.id] = { ...clearAll(r.id), added: cloudReady ? { v: r.to, at, saved: true, fileHad: null } : null };
      }
      continue;
    }
    if (had && r.field in had) {
      written++;
      (change[r.id] ??= {})[r.field] = cloudReady ? { v: r.to, at, saved: true, fileHad: had[r.field] ?? null } : null;
    } else if (!r.plant && !r.structure) { cleared++; (change[r.id] ??= {})[r.field] = null; }
  }
  editsDrawn = "";
  undoStack.length = 0; // what's in the file now can't be undone from here
  store.change({ edits: change });
  const left = rows.length - written - cleared;
  Object.assign(saving, {
    phase: "done",
    message: `${written} change${written === 1 ? " is" : "s are"} now in the file.${left ? ` ${left} couldn't be written (for example, a kind of plant that's no longer in species.json) and ${left === 1 ? "is" : "are"} still waiting.` : ""} Next, ask Claude to “publish the garden”.${cloudReady ? " Until it's published, the website keeps showing these changes from your garden account, then clears them on its own." : ""}`,
  });
  drawSaveEdits();
}

// ---------- photo checks ----------
function openChecks(options) {
  closeTasks({ restoreFocus: false });
  checks.open(options);
}

// ---------- the Plants screen ----------
function drawList() {
  renderPlantList($("listPanel"), {
    plants: garden.plants, species: garden.species, areaNames: garden.areaNames, areaOrder,
    month: state.month, today: today(), filters: state.filters, todos: todosByPlant(), added: addedDates(),
    notePhotos, thumb: (photo) => notesBackend.photo(thumbOf(photo)),
    unsaved: MAC_ITSELF ? unsavedRows().length : 0, onSaveEdits: openSaveEdits,
    onFilters: (f) => { state.filters = f; drawList(); },
    onPick: (id) => selectPlant(id),
    onShowInYard: (ids) => setHighlight(ids, describeFilters(state.filters), filterColor(state.filters)),
  });
}

// This week's to-dos still open for each plant (one-time jobs, then weekly rounds): plant ID -> [{ type, text }].
function jobsByPlant() {
  const week = weekFor(mondayOf(today()));
  const out = new Map();
  const add = (id, c) => (out.get(id) || out.set(id, []).get(id)).push({ type: c.type, text: c.text });
  for (const j of week.jobs) j.plants.forEach((p, i) => { if (!store.checks.done[j.plantKeys[i]]) add(p.id, j.care); });
  for (const r of week.rounds) for (const it of r.items) if (!it.done) for (const p of it.plants) add(p.id, it.care);
  return out;
}
const todosByPlant = () => new Map([...jobsByPlant()].map(([id, jobs]) => [id, jobs.length]));
// When each plant added in the app was added: from its "added" change, or, once that's been saved into
// plants.json, from the time in its ID (see newPlantId). Plants that were in plants.json from the start have none.
function addedDates() {
  const out = new Map();
  for (const p of garden.plants) {
    const at = store.checks.edits?.[p.id]?.added?.at;
    const fromId = /-([0-9a-z]{8,})[0-9a-z]{2}$/.exec(p.id)?.[1];
    const t = at ? Date.parse(at) : fromId ? parseInt(fromId, 36) : NaN;
    if (t > Date.UTC(2025, 0, 1) && t < Date.now() + 864e5) out.set(p.id, new Date(t));
  }
  return out;
}

// ---------- this week ----------
const weekFor = (monday) => buildWeek(garden, { weekStart: monday, frosts: store.checks.frosts, done: store.checks.done, areaOrder });

// Opens This week, with one job's row open when a job card on Today was tapped.
function openTasks(row) {
  checks?.close();
  state.taskWeek = mondayOf(today());
  if (row) revealRow(row);
  drawTasks();
  store.refresh();
  syncHash();
  if (!row) $("tasksPanel").querySelector(".close")?.focus({ preventScroll: true }); // otherwise the job's row has it
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
    onSignIn: signInHere,
    onSignOut: signOutHere,
    areaNames: garden.areaNames, areaOrder,
    onToggle: (keys, on) => {
      // Dated no earlier than the week shown, so a job ticked off ahead of time stays visible in that week.
      const stamp = ymd(now > week.weekStart ? now : week.weekStart);
      store.change(on ? { set: Object.fromEntries(keys.map((k) => [k, stamp])) } : { unset: keys });
    },
    onFrost: (value, year) => store.change({ frosts: { [value ? value.slice(0, 4) : year]: value || null } }),
    onWeek: (monday) => { state.taskWeek = mondayOf(monday); drawTasks(); },
    onRedraw: drawTasks,
    onPlant: (id) => { closeTasks({ restoreFocus: false }); if (editMode.on) setEditing(false); selectPlant(id, { focus: true }); },
    onShowInYard: (ids, label) => { closeTasks({ restoreFocus: false }); setHighlight(ids, label, "#3b82f6"); },
    onClose: closeTasks,
  });
}
async function signInHere(email, password) {
  await signIn(email, password); // shows its own message if it doesn't work
  await store.refresh();
  refreshPhotos();
}
function signOutHere() {
  signOut(); store.forget(); notes?.forget(); checks?.forget();
  notePhotos = [];
  myName = "";
  drawToday();
  if (nav.screen === "calendar") drawCalendar();
}

// ---------- Today ----------
function drawToday() {
  if (!garden || !store) return;
  const now = today();
  const { done, doneBy, partners, status } = store.checks;
  renderToday({
    week: weekFor(mondayOf(now)), today: now, done, doneBy, species: garden.species, plantsById: byId,
    partners: cloudReady && status !== "signed-out" ? partners : [],
    plants: garden.plants.filter((p) => !p.removed), notePhotos, checks: Boolean(checks), show: getPrefs(),
    thumb: (photo) => notesBackend.photo(thumbOf(photo)), full: (photo) => notesBackend.photo(photo),
    onToggle: (keys, on) => store.change(on ? { set: Object.fromEntries(keys.map((k) => [k, ymd(now)])) } : { unset: keys }),
    onOpenJob: (key) => openTasks(key),
    onWeek: () => openTasks(),
    onPhoto: openLightbox,
    onAllPhotos: openPhotos,
    onChecks: () => openChecks(),
  });
}
// ---------- Calendar ----------
function drawCalendar() {
  if (!garden || !store) return;
  const now = today();
  const { done, doneBy, frosts, status } = store.checks;
  const signedIn = cloudReady && account() && status !== "signed-out";
  renderCalendar($("calendarScreen"), {
    garden, today: now, done, doneBy: signedIn ? doneBy : {}, frosts, areaOrder, me: signedIn ? myName : "",
    notePhotos, thumb: (photo) => notesBackend.photo(thumbOf(photo)),
    onToggle: (keys, on) => store.change(on ? { set: Object.fromEntries(keys.map((k) => [k, ymd(now)])) } : { unset: keys }),
    onPlant: (id) => selectPlant(id),
  });
}

// The newest notes with photos, fetched again when coming back to the app or after a card closes.
let fetchingPhotos = null;
function refreshPhotos() {
  if (!cloudReady || !account() || fetchingPhotos) return;
  if (!myName) notesBackend.me().then((name) => { myName = name; if (name && nav.screen === "calendar") drawCalendar(); if (name && !$("settingsPanel").hidden) drawSettings(); }).catch(() => {});
  fetchingPhotos = notesBackend.latest()
    .then((list) => {
      const changed = JSON.stringify(list.map((n) => n.id)) !== JSON.stringify(notePhotos.map((n) => n.id));
      notePhotos = list;
      if (changed) { drawToday(); if (!$("photosPanel").hidden) drawPhotos(); if (!$("listPanel").hidden) drawList(); if (nav.screen === "calendar") drawCalendar(); if (state.card) showCard(); if (state.peek) drawPeek(); }
    })
    .catch(() => {}) // not signed in, offline or not in the garden: the garden's own photos still show
    .finally(() => { fetchingPhotos = null; });
}

// ---------- every photo ("All" under Latest photos) ----------
function openPhotos() { drawPhotos(); }
function drawPhotos() {
  renderAllPhotos($("photosPanel"), {
    plants: garden.plants.filter((p) => !p.removed), notePhotos,
    thumb: (photo) => notesBackend.photo(thumbOf(photo)), full: (photo) => notesBackend.photo(photo),
    onPhoto: openLightbox,
    onPlant: (id) => { closePhotos({ restoreFocus: false }); selectPlant(id, { focus: true }); },
    onClose: closePhotos,
  });
}
function closePhotos({ restoreFocus = true } = {}) {
  $("photosPanel").hidden = true;
  if (restoreFocus) $("todayPhotos").querySelector("[data-all]")?.focus({ preventScroll: true });
}

// ---------- Settings (the gear on Today) ----------
function openSettings() {
  drawSettings();
  $("settingsPanel").querySelector(".close")?.focus({ preventScroll: true });
}
function drawSettings() {
  renderSettings($("settingsPanel"), {
    prefs: getPrefs(), themes: THEMES,
    cloud: cloudReady, account: account(), saveStatus: store.checks.status, sharedWith: store.checks.sharedWith,
    me: myName, partners: store.checks.partners,
    onPref: (name, value) => { setPref(name, value); drawSettings(); drawToday(); }, // a new look shows at once (styles.css)
    onSignIn: signInHere, onSignOut: signOutHere, onRedraw: drawSettings, onClose: closeSettings,
  });
}
function closeSettings() {
  $("settingsPanel").hidden = true;
  $("settingsBtn").focus({ preventScroll: true });
}

// ---------- rings in the yard ("Show these in the yard") ----------
function describeFilters(f) {
  const named = (list, ids) => ids.map((id) => list.find(([k]) => k === id)?.[1] || id);
  const parts = [];
  if (f.chip !== "all") parts.push(named(CHIPS, [f.chip])[0].toLowerCase());
  parts.push(...named(TYPES, f.types).map((t) => t.toLowerCase()));
  parts.push(...f.beds.map((a) => garden.areaNames.get(a) || a));
  parts.push(...named(ONLY, f.only).map((t) => t.toLowerCase()));
  if (f.q.trim()) parts.push(`“${f.q.trim()}”`);
  return parts.join(" · ") || "selected plants";
}
const filterColor = (f) => (f.chip === "toxic" ? "#e0402f" : f.chip === "safe" ? "#2e9b4f" : f.chip === "blooming" ? "#d6487f" : "#3b82f6");

function setHighlight(ids, label, color) {
  showScreen("today");
  setYardView(true);
  stopPlaying();
  setBloom(false);
  yard.setHighlight({ ids, color });
  const chip = $("highlightChip");
  chip.innerHTML = `<span>${ids.length} ringed: ${esc(label)}</span><button type="button" aria-label="Clear highlight">✕</button>`;
  chip.hidden = false;
  chip.querySelector("button").onclick = clearHighlight;
  yard.fitTo(ids);
  updateYardView();
}
function clearHighlight() {
  yard.setHighlight(null);
  $("highlightChip").hidden = true;
  updateYardView();
}

start();
