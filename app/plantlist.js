// The Plants screen: a big title with how many plants are showing, a search field, one row of filter chips (with
// a filter button that opens a drop-down for sorting, beds, type and "show only"), and a two-column grid of photo
// cards. Tapping a card opens the plant's card. Plants removed from the yard are listed apart at the bottom.
// The filtering and sorting below don't draw anything, so tests can check them.

import { MONTH_NAMES, dogSafety, isDogRisk, stateText, shownStateFor, careFor, thumbUrl, esc } from "./data.js";
import { hueOf } from "./today.js";
import { dateText } from "./edits.js";

// ---------- what can be picked ----------
export const CHIPS = [["all", "All"], ["blooming", "Blooming"], ["pick", "Ready to pick"], ["toxic", "Dog-toxic"], ["safe", "Dog-safe"]];
export const SORTS = [["az", "A–Z"], ["newest", "Newest"], ["todos", "To-dos first"], ["feed", "Fertilizer"]];
export const TYPES = [["flowers", "Flowers"], ["edibles", "Edibles"]];
export const ONLY = [["todos", "Has to-dos"], ["new", "New this month"]];
// q: the search; chip: one of CHIPS; sort: one of SORTS; beds, types and only: the ticked boxes in the drop-down.
export const NO_FILTERS = { q: "", chip: "all", sort: "az", beds: [], types: [], only: [] };
// How many of the drop-down's options are in use (the number on the filter button). The search and the chips
// show for themselves.
export const activeCount = (f) => (f.sort !== "az" ? 1 : 0) + f.beds.length + f.types.length + f.only.length;

// ---------- what a plant is ----------
// A crop: it fruits or has a harvest that isn't a cut-flower window (herbs like basil and dill count).
export const isEdible = (sp) => Object.values(sp.seasonal || {}).some((s) => s === "fruit" || s === "harvest")
  || (sp.care || []).some((c) => c.type === "harvest" && !/^cut-flower/i.test(c.text));
// What it's fed with, from its feeding care, for the Fertilizer sort's headings (in the order shown).
export const FEEDS = [
  ["compost", "Compost"],
  ["low-n", "Low-nitrogen, high-potassium feed"],
  ["acid", "Acid feed for blueberries"],
  ["other", "Other feeds"],
  ["none", "No feeding listed"],
];
export function feedType(sp) {
  const text = (sp.care || []).filter((c) => c.type === "feed").map((c) => c.text).join(" ");
  if (!text) return "none";
  if (/acid/i.test(text)) return "acid";
  if (/low-nitrogen|potassium|tomato/i.test(text)) return "low-n";
  if (/compost/i.test(text)) return "compost";
  return "other";
}
// Stages where nothing is there to pick, even if the calendar says it's harvest time.
const NOTHING_LEFT = new Set(["spent", "frost-blackened", "stored", "gone", "dormant"]);
function chipMatches(chip, p, sp, month) {
  if (chip === "all") return true;
  if (chip === "toxic") return isDogRisk(p, sp); // toxic, may harm, or unknown: treated as a risk
  if (chip === "safe") return ["non-toxic", "not-listed"].includes(dogSafety(p, sp).status);
  if (p.finished) return false;
  const st = shownStateFor(sp, month, p.seasonNow);
  if (chip === "blooming") return st === "bloom" || st === "aging-bloom";
  if (chip === "pick") return !NOTHING_LEFT.has(st) && (st === "harvest" || careFor(sp, month).some((c) => c.type === "harvest"));
  return true;
}
const sameMonth = (d, today) => d && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();

// ctx: { species, areaNames, month (the month the yard shows), today, todos: Map id → open to-dos this week,
// added: Map id → Date added in the app }
export function filterPlants(plants, f, ctx) {
  const q = f.q.trim().toLowerCase();
  return plants.filter((p) => {
    const sp = ctx.species.get(p.speciesId);
    if (!chipMatches(f.chip, p, sp, ctx.month)) return false;
    if (f.beds.length && !f.beds.includes(p.area)) return false;
    if (f.types.length === 1 && isEdible(sp) !== (f.types[0] === "edibles")) return false;
    if (f.only.includes("todos") && !ctx.todos.get(p.id)) return false;
    if (f.only.includes("new") && !sameMonth(ctx.added.get(p.id), ctx.today)) return false;
    if (q) {
      const hay = [p.name, p.label, sp.commonName, sp.scientificName, ctx.areaNames.get(p.area), ...(p.alsoPossible || [])].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
// The plants in order, as groups: one group with no heading, or one per feed type for the Fertilizer sort.
const byName = (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }) || a.label.localeCompare(b.label, "en", { numeric: true });
export function sortPlants(list, sort, ctx) {
  const out = [...list];
  if (sort === "newest") out.sort((a, b) => (ctx.added.get(b.id)?.getTime() || 0) - (ctx.added.get(a.id)?.getTime() || 0) || byName(a, b));
  else if (sort === "todos") out.sort((a, b) => (ctx.todos.get(b.id) || 0) - (ctx.todos.get(a.id) || 0) || byName(a, b));
  else out.sort(byName);
  if (sort !== "feed") return [{ heading: null, plants: out }];
  return FEEDS.map(([id, heading]) => ({ heading, plants: out.filter((p) => feedType(ctx.species.get(p.speciesId)) === id) })).filter((g) => g.plants.length);
}

// ---------- drawing ----------
const FILTER_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>`;
const SEARCH_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>`;
const CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>`;

// Kept between redraws: whether the drop-down is open and what's been picked in it but not applied yet.
const ui = { menu: false, draft: null, removedOpen: false };

function cardHtml(p, sp, ctx, sort, newest) {
  const note = newest.get(p.id);
  const pic = note
    ? `<img alt="" data-note-thumb="${esc(note.photo)}">`
    : p.photos?.length ? `<img src="${esc(thumbUrl(p.photos[0]))}" alt="" loading="lazy" decoding="async">`
      : `<span class="placeholder" style="--h:${hueOf(p.speciesId || p.name)}"></span>`;
  const dog = dogSafety(p, sp);
  const tags = [];
  if (dog.status === "toxic") tags.push(`<span class="ptag toxic">Dog-toxic</span>`);
  else if (isDogRisk(p, sp)) tags.push(`<span class="ptag caution">Maybe dog-toxic</span>`);
  const todos = ctx.todos.get(p.id) || 0;
  if (sort === "newest") { if (sameMonth(ctx.added.get(p.id), ctx.today)) tags.push(`<span class="ptag new">NEW</span>`); }
  else if (todos) tags.push(`<span class="ptag todo">${todos} to-do${todos === 1 ? "" : "s"}</span>`);
  const status = p.finished ? "Finished" : stateText(sp, ctx.month, p.seasonNow)[0];
  const label = p.label.startsWith("#") ? p.label : "";
  return `<li><button type="button" class="pcard" data-id="${esc(p.id)}" aria-label="${esc(p.name)}${label ? ` ${esc(label)}` : ""}. ${esc(status)}${tags.length ? `. ${tags.map((t) => t.replace(/<[^>]+>/g, "")).join(", ")}` : ""}">
    ${pic}
    ${tags.length ? `<span class="ptags" aria-hidden="true">${tags.join("")}</span>` : ""}
    <span class="pcardtext" aria-hidden="true"><b>${esc(p.name)}</b><span>${esc(status)}${label ? ` · ${esc(label)}` : ""}</span></span>
  </button></li>`;
}

function menuHtml(d, beds, count) {
  const box = (name, value, label, on) => `<label class="fbox"><input type="checkbox" name="${name}" value="${esc(value)}" ${on ? "checked" : ""}><span class="fmark" aria-hidden="true">${CHECK}</span>${esc(label)}</label>`;
  return `
    <div class="fmenu glass" id="filterMenu" role="dialog" aria-label="Sort and filter">
      <div class="fmenuscroll">
        <fieldset><legend>Sort by</legend>
          <div class="fsorts">${SORTS.map(([id, label]) => `<label class="fsort"><input type="radio" name="sort" value="${id}" ${d.sort === id ? "checked" : ""}><span>${label}</span></label>`).join("")}</div>
        </fieldset>
        <fieldset><legend>Bed</legend>${beds.map(([id, name]) => box("beds", id, name, d.beds.includes(id))).join("")}</fieldset>
        <fieldset><legend>Type</legend>${TYPES.map(([id, label]) => box("types", id, label, d.types.includes(id))).join("")}</fieldset>
        <fieldset><legend>Show only</legend>${ONLY.map(([id, label]) => box("only", id, label, d.only.includes(id))).join("")}</fieldset>
      </div>
      <div class="fmenubtns">
        <button type="button" class="btn ghost" id="filterReset">Reset</button>
        <button type="button" class="btn" id="filterApply">${showText(count)}</button>
      </div>
    </div>`;
}
const showText = (n) => (n === 0 ? "No plants match" : `Show ${n} plant${n === 1 ? "" : "s"}`);

// o: { plants (all, removed ones too), species, areaNames, areaOrder, month, today, filters, todos, added,
// notePhotos (newest first), thumb(photo), unsaved, onFilters(f), onPick(id), onShowInYard(ids), onSaveEdits() }
export function renderPlantList(panel, o) {
  const f = o.filters;
  if (panel.hidden) { ui.menu = false; ui.draft = null; } // coming back to Plants starts with the drop-down shut
  const plants = o.plants.filter((p) => !p.removed);
  const removed = o.plants.filter((p) => p.removed);
  const ctx = { species: o.species, areaNames: o.areaNames, month: o.month, today: o.today, todos: o.todos, added: o.added };
  const matches = filterPlants(plants, f, ctx);
  const groups = sortPlants(matches, f.sort, ctx);
  const beds = o.areaOrder.filter((a) => plants.some((p) => p.area === a)).map((a) => [a, o.areaNames.get(a) || a]);
  const newest = new Map();
  for (const n of o.notePhotos) if (!newest.has(n.plantId)) newest.set(n.plantId, n);
  const n = activeCount(f);
  const filtered = f.q.trim() || f.chip !== "all" || f.beds.length || f.types.length || f.only.length;
  const draft = ui.draft || f;
  const draftCount = () => filterPlants(plants, { ...draft, q: f.q, chip: f.chip }, ctx).length;

  const focusId = document.activeElement?.id;
  const focusChip = panel.contains(document.activeElement) ? document.activeElement?.dataset?.chip : null;
  const scroller = panel.querySelector(".presults");
  const scrollTop = scroller?.scrollTop || 0;
  const chipScroll = panel.querySelector(".pchips")?.scrollLeft || 0;
  panel.innerHTML = `
    <div class="phead">
      <div class="ptitle"><h1 id="listTitle">Plants</h1><p class="pcount" aria-live="polite"><b>${matches.length}</b> of ${plants.length}</p></div>
      <label class="psearch glass">${SEARCH_ICON}
        <input id="listSearch" type="search" placeholder="Search plants, beds or kinds" value="${esc(f.q)}" aria-label="Search plants" autocomplete="off" enterkeyhint="search">
      </label>
      <div class="pchips" role="group" aria-label="Filters">
        <button type="button" class="pfilter glass" id="filterBtn" aria-haspopup="dialog" aria-expanded="${ui.menu}" aria-controls="filterMenu"
          aria-label="Sort and filter${n ? `, ${n} in use` : ""}">${FILTER_ICON}${n ? `<span class="pfiltern" aria-hidden="true">${n}</span>` : ""}</button>
        ${CHIPS.map(([id, label]) => `<button type="button" class="pchip ${f.chip === id ? "" : "glass"}" data-chip="${id}" aria-pressed="${f.chip === id}">${label}</button>`).join("")}
      </div>
      ${ui.menu ? `<div class="fscrim" id="filterScrim"></div>${menuHtml(draft, beds, draftCount())}` : ""}
    </div>
    <div class="presults">
      ${o.unsaved ? `<div class="editsnote glass"><p><b>${o.unsaved} change${o.unsaved === 1 ? "" : "s"} made in the app</b> ${o.unsaved === 1 ? "isn't" : "aren't"} in plants.json yet.</p><button type="button" class="btn" id="saveEditsBtn">Save app edits into files</button></div>` : ""}
      ${matches.length ? groups.map((g) => `
        ${g.heading ? `<h2 class="pgroup">${esc(g.heading)} <span>${g.plants.length}</span></h2>` : ""}
        <ul class="pgrid">${g.plants.map((p) => cardHtml(p, o.species.get(p.speciesId), ctx, f.sort, newest)).join("")}</ul>`).join("")
        : `<p class="empty">No plants match.${filtered ? ` <button type="button" class="linkbtn" id="listClear">Clear the filters</button>` : ""}</p>`}
      <p class="pfoot">Status for ${MONTH_NAMES[o.month]}${matches.length && filtered ? ` · <button type="button" class="linkbtn" id="listShow">Show ${matches.length === 1 ? "it" : `these ${matches.length}`} in the yard</button>` : ""}</p>
      ${removed.length ? `
        <details class="removedlist glass" ${ui.removedOpen ? "open" : ""}>
          <summary>Removed from the yard (${removed.length})</summary>
          <ul>${removed.map((p) => `<li><button type="button" data-id="${esc(p.id)}">
            <span class="pname">${esc(p.name)}${p.label.startsWith("#") ? ` <span class="plabel">${esc(p.label)}</span>` : ""}</span>
            <span class="pstate">${esc(dateText(p.removed).replace(/, \d{4}$/, ""))}</span>
          </button></li>`).join("")}</ul>
        </details>` : ""}
    </div>`;
  panel.hidden = false;
  panel.querySelector(".presults").scrollTop = scrollTop;
  panel.querySelector(".pchips").scrollLeft = chipScroll;

  const search = panel.querySelector("#listSearch");
  search.oninput = () => o.onFilters({ ...f, q: search.value });
  if (focusId === "listSearch") { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
  else if (focusChip) panel.querySelector(`[data-chip="${focusChip}"]`)?.focus({ preventScroll: true });
  else if (focusId === "filterBtn") panel.querySelector("#filterBtn").focus({ preventScroll: true });

  panel.querySelector(".pchips").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.id === "filterBtn") return setMenu(!ui.menu);
    if (b.dataset.chip) o.onFilters({ ...f, chip: b.dataset.chip });
  };
  panel.querySelector(".presults").onclick = (e) => {
    const b = e.target.closest("button");
    if (b?.dataset.id) o.onPick(b.dataset.id);
    else if (b?.id === "listClear") o.onFilters({ ...NO_FILTERS, sort: f.sort });
    else if (b?.id === "listShow") o.onShowInYard(matches.map((p) => p.id));
    else if (b?.id === "saveEditsBtn") o.onSaveEdits();
  };
  panel.querySelector(".removedlist")?.addEventListener("toggle", (e) => { ui.removedOpen = e.target.open; });

  // ---------- the drop-down ----------
  function setMenu(open, { apply = false } = {}) {
    const next = apply ? { ...f, ...ui.draft } : f;
    ui.menu = open;
    ui.draft = open ? { sort: f.sort, beds: [...f.beds], types: [...f.types], only: [...f.only] } : null;
    if (apply) o.onFilters(next); else renderPlantList(panel, o);
    const btn = panel.querySelector("#filterBtn");
    if (open) panel.querySelector("#filterMenu input:checked, #filterMenu input")?.focus({ preventScroll: true });
    else btn?.focus({ preventScroll: true });
  }
  const menu = panel.querySelector("#filterMenu");
  if (!menu) return;
  panel.querySelector("#filterScrim").onclick = () => setMenu(false);
  menu.onkeydown = (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    setMenu(false);
  };
  // Changes in the drop-down only update its own boxes and the count on its button, until "Show N plants".
  menu.onchange = (e) => {
    const t = e.target;
    if (t.name === "sort") ui.draft.sort = t.value;
    else if (t.name) {
      const list = ui.draft[t.name];
      ui.draft[t.name] = t.checked ? [...list, t.value] : list.filter((v) => v !== t.value);
    }
    menu.querySelector("#filterApply").textContent = showText(filterPlants(plants, { ...ui.draft, q: f.q, chip: f.chip }, ctx).length);
  };
  menu.querySelector("#filterReset").onclick = () => {
    Object.assign(ui.draft, { sort: "az", beds: [], types: [], only: [] });
    menu.querySelectorAll("input").forEach((i) => { i.checked = i.name === "sort" && i.value === "az"; });
    menu.querySelector("#filterApply").textContent = showText(filterPlants(plants, { ...ui.draft, q: f.q, chip: f.chip }, ctx).length);
  };
  menu.querySelector("#filterApply").onclick = () => setMenu(false, { apply: true });

  // Photos from notes are fetched while signed in.
  panel.querySelectorAll("img[data-note-thumb]").forEach((img) => {
    o.thumb(img.dataset.noteThumb).then((url) => { img.src = url; }).catch(() => img.classList.add("missing"));
  });
}
