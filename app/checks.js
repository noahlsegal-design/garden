// Photo checks in the Claude app: "Plant health" (what's this plant, is it healthy, what's wrong and how to fix
// it) and "Friend or foe" (what's this bug, is it good for the garden). Also the health timeline (which plant had
// what, and when) and the bug catalog (every bug found, and on which plants).
//
// How a check goes: you pick the plant and the photo here, and the app saves the photo with a check that's
// "waiting". Then it copies a prompt (the check's id, the plant and the garden's details) and opens Claude. You
// attach the same photo there and send it. Your Claude skill (plant-diagnostics or friend-or-foe, in skills/)
// answers and saves the answer into the garden through the Supabase connector, and the check here fills in.
// Nothing here talks to Claude directly, so there's no Claude key and nothing to pay beyond your Claude plan.

import { esc } from "./data.js";
import { shrinkPhoto, newId, noteDate } from "./notes.js";
import {
  plantReportHtml, plantTitle, plantBadge, plantIsFinal, bugReportHtml, bugKey, catalogOf, verdictBadge,
  gardenContext, claudePrompt, claudeLinks, newestFirst, VERDICTS,
} from "./reports.js";

const WHY = {
  offline: "Can't reach your garden account right now. Check your connection and try again.",
  "signed-out": "Sign in under This week to use photo checks.",
  "not-member": "This account isn't in the garden yet, so it can't use photo checks.",
  setup: "Photo checks need one more Supabase step: run supabase/setup.sql again in the SQL Editor.",
  "too-big": "That photo is too big to save. Try another one.",
};
const why = (err) => WHY[err?.status] || WHY.offline;

const CAMERA = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`;
const LEAF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19l8-8"/></svg>`;
const BUG = `<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="14" rx="5" ry="6"/><path d="M12 8V20M9 6l-2-2M15 6l2-2M7 12H3M7 16l-3 2M17 12h4M17 16l3 2"/></svg>`;
const SPARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/></svg>`;

// A photo as a file the phone's share sheet can hand to the Claude app (or save to the photo library), or null
// where sharing files isn't possible (most computers).
function shareable(blob) {
  if (!blob || !navigator.canShare) return null;
  const file = new File([blob], "garden-photo.jpg", { type: "image/jpeg" });
  try { return navigator.canShare({ files: [file] }) ? file : null; } catch { return null; }
}

// Copies text, with the browser's clipboard where it's allowed, or the old way.
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* not allowed here */ }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;opacity:0;top:0;left:0";
  document.body.append(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { /* nothing more to try */ }
  area.remove();
  return ok;
}

// garden() gives { plants (all but removed), inYard, species, areaNames, areaOrder, site }. access() is what
// editing plants needs (null: no garden account; { can, note }). notes is the card's notes log (for context).
export function createChecks({ backend, notes, today, garden, access, onPlant, onShowInYard, onPhoto, onClose }) {
  const blank = () => ({ plantId: "", pic: null, preparing: false, note: "", phase: "idle", error: "", check: null, prompt: "", copied: false });
  const st = { tab: "plant", plant: blank(), bug: blank() };
  const data = { checks: [], status: "", at: 0 };
  const view = { filter: "all", bugFilter: "all", open: null, expanded: new Set(), asking: null, problem: {} };
  let panel = null, card = null; // the panel while it's open; the card's section and its plant
  let poll = null;

  // ---------- loading ----------
  let loading = null, again = false;
  async function load(force = false) {
    if (loading) { if (force) again = true; return loading; } // an answer saved while this was loading is fetched next
    if (!force && data.status === "saved" && Date.now() - data.at < 20000) return;
    if (data.status !== "saved") data.status = "loading";
    loading = backend.list().then((checks) => {
      data.checks = checks;
      data.status = "saved";
    }, (err) => {
      data.status = err.status || "offline";
    }).finally(() => {
      data.at = Date.now();
      loading = null;
      draw();
      keepChecking();
      if (again) { again = false; load(true); }
    });
    return loading;
  }
  // While a check is waiting for Claude and you're looking, look for its answer now and then. (Coming back
  // from the Claude app also looks, from main.js.)
  function keepChecking() {
    const waiting = data.checks.some((c) => c.status === "waiting");
    const looking = (panel && !panel.hidden) || card?.el?.isConnected;
    if (waiting && looking && !poll) poll = setInterval(() => { if (document.visibilityState === "visible") load(true); }, 15000);
    if ((!waiting || !looking) && poll) { clearInterval(poll); poll = null; }
  }

  const plantName = (id) => garden().plants.find((p) => p.id === id)?.name || "";

  // ---------- the prompt for a check ----------
  // Made straight away (no waiting), so it can be copied in the same tap as the button: phones only allow
  // copying during a tap. It uses the plant's notes as already loaded; warmNotes() loads them ahead.
  function promptFor(c) {
    const g = garden();
    const plant = c.plantId ? g.plants.find((p) => p.id === c.plantId) : null;
    const log = plant && notes ? notes.notesFor(plant.id) : [];
    const kinds = c.kind === "bug" ? [...new Set(g.plants.filter(g.inYard).map((p) => g.species.get(p.speciesId)?.commonName).filter(Boolean))].sort() : [];
    const context = gardenContext({
      today: today(), site: g.site, plant, species: plant && g.species.get(plant.speciesId),
      areaName: plant ? g.areaNames.get(plant.area) || plant.area : "", notes: log, kinds,
    });
    return claudePrompt({ kind: c.kind, id: c.id, plantId: plant ? plant.id : null, note: c.note, context });
  }

  const warmNotes = (plantId) => { if (plantId && notes) notes.load(plantId).catch(() => {}); };
  // Photos of waiting checks, ready to share again (sharing has to start in the tap, with the file at hand).
  const photoFiles = new Map(); // check id -> File
  function readyToShare(c) {
    if (!c.photo || photoFiles.has(c.id)) return;
    photoFiles.set(c.id, null);
    backend.photo(c.photo).then((url) => fetch(url)).then((r) => r.blob()).then((blob) => {
      photoFiles.set(c.id, shareable(blob));
      draw();
    }).catch(() => photoFiles.delete(c.id));
  }

  // ---------- starting a check ----------
  async function pickPhoto(which, file) {
    if (!file) return;
    const s = st[which];
    if (s.pic) URL.revokeObjectURL(s.pic.url);
    Object.assign(s, { pic: null, preparing: true, error: "" });
    draw();
    try {
      const pic = await shrinkPhoto(file);
      s.pic = { ...pic, url: URL.createObjectURL(pic.thumb) };
    } catch (err) {
      s.error = err.message;
    }
    s.preparing = false;
    draw();
  }

  // Saves the check (and its photo) as waiting, then shows the step that opens Claude.
  async function start(which) {
    const s = st[which];
    if (s.phase === "saving" || s.preparing) return;
    const id = newId();
    const c = { id, kind: which, plantId: s.plantId || null, date: today(), note: s.note.trim() };
    if (s.pic) Object.assign(c, { photo: `${id}.jpg`, w: s.pic.w, h: s.pic.h, bytes: s.pic.photo.size + s.pic.thumb.size });
    // The prompt is copied now, during the tap on Next, so it's ready to paste whichever way it reaches Claude.
    s.prompt = promptFor(c);
    s.copied = false;
    copyText(s.prompt).then((ok) => { s.copied = ok; });
    Object.assign(s, { phase: "saving", error: "" });
    draw();
    try {
      const saved = await backend.add(c, s.pic?.photo, s.pic?.thumb);
      if (s.pic) {
        backend.keepPhoto(c.photo, s.pic.photo);
        backend.keepPhoto(c.photo.replace(/\.jpg$/, "-thumb.jpg"), s.pic.thumb);
      }
      data.checks = [saved, ...data.checks.filter((x) => x.id !== saved.id)];
      s.check = saved;
      s.phase = "ready";
    } catch (err) {
      Object.assign(s, { phase: "idle", error: `The check wasn't saved. ${why(err)}` });
    }
    draw();
    reveal(which, s.phase === "ready" ? ".claudestep" : ".checkform");
    keepChecking();
  }
  // Scrolls the next step into view under the form, if that tab is the one showing.
  function reveal(which, selector) {
    if (!panel || panel.hidden || st.tab !== which) return;
    const list = panel.querySelector(".tlist"), el = panel.querySelector(selector);
    if (list && el) list.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - 12), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  async function remove(c) {
    view.asking = null;
    view.problem[c.id] = "Deleting…";
    draw();
    try {
      await backend.remove(c);
      data.checks = data.checks.filter((x) => x.id !== c.id);
      for (const w of ["plant", "bug"]) if (st[w].check?.id === c.id) st[w] = { ...blank(), plantId: st[w].plantId };
      delete view.problem[c.id];
    } catch (err) {
      view.problem[c.id] = `Couldn't delete it. ${why(err)}`;
    }
    draw();
  }
  async function move(c, plantId) {
    const before = c.plantId;
    c.plantId = plantId || null;
    draw();
    try {
      await backend.move(c, plantId);
      delete view.problem[c.id];
    } catch (err) {
      c.plantId = before;
      view.problem[c.id] = `Couldn't change the plant. ${why(err)}`;
    }
    draw();
  }

  // ---------- drawing pieces ----------
  function plantOptions(selected, none) {
    const g = garden();
    const byArea = new Map();
    for (const p of g.plants) (byArea.get(p.area) || byArea.set(p.area, []).get(p.area)).push(p);
    const groups = g.areaOrder.filter((a) => byArea.has(a)).map((a) => `<optgroup label="${esc(g.areaNames.get(a) || a)}">${byArea.get(a)
      .map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? "selected" : ""}>${esc(p.name)}${p.label?.startsWith("#") ? ` ${esc(p.label)}` : ""}</option>`).join("")}</optgroup>`).join("");
    return `<option value="" ${selected ? "" : "selected"}>${esc(none)}</option>${groups}`;
  }

  function formHtml(which) {
    const s = st[which];
    const busy = s.phase === "saving";
    const plantLabel = which === "plant" ? "Which plant is it?" : "Which plant was it on?";
    const none = which === "plant" ? "Not one of my plants, or not sure" : "Not on a plant, or not sure";
    const hint = which === "plant"
      ? "A clear photo of the leaves and stems works best, close enough to see any spots or bugs."
      : "Get as close as you can while it's in focus. A coin or finger in the photo helps with size.";
    return `<form class="editform checkform" data-form="${which}">
      <p class="stitle">1. The photo and the plant</p>
      <div class="notepick checkpick">
        ${s.preparing ? `<p class="small" role="status">Getting the photo ready…</p>`
          : s.pic ? `<img src="${s.pic.url}" alt="The photo to check"><label class="linkbtn">Use a different photo<input type="file" accept="image/*" class="offscreen" data-photo="${which}"></label>`
          : `<label class="pill primary"><input type="file" accept="image/*" class="offscreen" data-photo="${which}">${CAMERA}Take or choose a photo</label>`}
      </div>
      <p class="small">${hint} It's kept here with Claude's answer.</p>
      <label for="${which}Plant">${plantLabel}</label>
      <select id="${which}Plant" data-plant="${which}" ${busy ? "disabled" : ""}>${plantOptions(s.plantId, none)}</select>
      <label for="${which}Note">Anything Claude should know? <span class="small">(optional)</span></label>
      <textarea id="${which}Note" data-note="${which}" rows="2" maxlength="2000" ${busy ? "disabled" : ""} placeholder="${which === "plant" ? "Transplanted two weeks ago; lower leaves yellowing since the rain" : "Lots of them under the leaves; the leaves have holes"}">${esc(s.note)}</textarea>
      ${s.error ? `<p class="savewarn" role="alert">${esc(s.error)}</p>` : ""}
      <div class="formbtns"><button class="btn" type="submit" ${!s.preparing && !busy ? "" : "disabled"}>${busy ? "Saving…" : `${SPARK}Next: ask Claude`}</button></div>
      ${!s.pic && !s.preparing ? `<p class="small">No photo here? You can still go on; the log will have Claude's answer without a picture.</p>` : ""}
    </form>`;
  }

  // Step 2: open Claude with the prompt, attach the photo there, and send.
  function stepHtml(which) {
    const s = st[which];
    if (s.phase !== "ready" || !s.check) return "";
    const done = data.checks.find((x) => x.id === s.check.id);
    if (done?.status === "done") {
      const what = which === "plant"
        ? `${plantTitle(done.report)}${done.plantId && plantName(done.plantId) ? ` · ${plantName(done.plantId)}` : ""}`
        : `${done.report?.common_name || ""} · ${VERDICTS[done.report?.verdict]?.label || ""}`;
      return `<div class="claudestep done" role="status"><p class="stitle">✓ Claude's answer is in</p>
        <p>${esc(what)}. It's in the ${which === "plant" ? "timeline" : "catalog"} below.</p>
        <div class="formbtns"><button type="button" class="btn" data-show="${esc(done.id)}">See the answer</button><button type="button" class="linkbtn" data-new="${which}">Check another</button></div></div>`;
    }
    const links = claudeLinks(s.prompt);
    const file = s.pic && shareable(s.pic.photo);
    // With a photo on a phone: the share sheet sends the photo itself to the Claude app. Otherwise the link opens
    // Claude with the prompt filled in, and the photo is attached there.
    const how = file ? `
      <ol class="steps">
        <li>Tap <b>Send photo to Claude</b> and pick <b>Claude</b> in the share sheet. (To keep the photo, pick <b>Save Image</b> there first.)</li>
        <li>If the message is empty, paste: the prompt is copied. Send it.</li>
        <li>Come back here. The answer shows up once Claude has saved it.</li>
      </ol>
      <div class="formbtns"><button type="button" class="btn" data-share="${which}">${SPARK}Send photo to Claude</button>
        <button type="button" class="linkbtn" data-copy="${which}">${s.copied ? "Prompt copied ✓" : "Copy the prompt"}</button></div>
      <p class="small">Or <a href="${esc(links.app)}" data-claude="${which}">open Claude with the prompt filled in</a> and attach the photo there (it needs to be in your photo library).</p>` : `
      <ol class="steps">
        <li>Tap <b>Open Claude</b>. The prompt is filled in, or copied to paste.</li>
        <li>${s.pic ? "Attach the same photo" : "Attach a photo"} and send.</li>
        <li>Come back here. The answer shows up once Claude has saved it.</li>
      </ol>
      <div class="formbtns"><a class="btn" href="${esc(links.app)}" data-claude="${which}">${SPARK}Open Claude</a>
        <button type="button" class="linkbtn" data-copy="${which}">${s.copied ? "Prompt copied ✓" : "Copy the prompt"}</button></div>
      <p class="small">No Claude app on this device? <a href="${esc(links.web)}" target="_blank" rel="noopener" data-claude="${which}">Open Claude in the browser</a>.</p>`;
    return `<div class="claudestep">
      <p class="stitle">2. Ask Claude</p>${how}
      <details class="promptbox"><summary>See the prompt</summary><pre>${esc(s.prompt)}</pre></details>
      <div class="formbtns"><button type="button" class="linkbtn" data-new="${which}">Start a different check</button></div>
    </div>`;
  }

  // One check in a timeline or catalog: a line you can tap open to see the photo and Claude's whole answer.
  function itemHtml(c, { plant = true } = {}) {
    const open = view.expanded.has(c.id);
    const waiting = c.status !== "done";
    const title = waiting ? "Waiting for Claude's answer" : c.kind === "plant" ? plantTitle(c.report) : c.report?.common_name || "Bug";
    const badge = waiting ? `<span class="badge">Waiting</span>` : c.kind === "plant" ? plantBadge(c.report) : verdictBadge(c.report?.verdict);
    const where = plant ? (c.plantId ? plantName(c.plantId) || "A plant no longer in the garden" : c.kind === "plant" ? "No plant chosen" : "Not on a plant") : "";
    return `<li class="checkitem${waiting ? " waiting" : ""}">
      <button type="button" class="checkline" data-toggle="${esc(c.id)}" aria-expanded="${open}">
        <span class="bugthumb">${c.kind === "bug" ? BUG : LEAF}${c.photo ? `<img alt="" data-thumb="${esc(c.photo)}">` : ""}</span>
        <span class="bugname"><b>${esc(title)}</b><span class="small">${esc(noteDate(c.date, today()))}${where ? ` · ${esc(where)}` : ""}${c.by ? ` · ${esc(c.by)}` : ""}</span></span>
        ${badge}
      </button>
      ${open ? `<div class="checkbody">
        ${c.note ? `<p class="small"><b>Your note:</b> ${esc(c.note)}</p>` : ""}
        ${c.photo ? `<button type="button" class="notepic" data-pic="${esc(c.id)}" aria-label="Open the photo"${c.w && c.h ? ` style="aspect-ratio:${c.w} / ${c.h}"` : ""}><img alt="" data-thumb="${esc(c.photo)}"></button>` : ""}
        ${waiting ? waitingHtml(c)
          : `<div class="report">${c.kind === "plant" ? plantReportHtml(c.report) : bugReportHtml(c.report)}</div>`}
        <label class="growson small">${c.kind === "plant" ? "Plant" : "Found on"} <select data-move="${esc(c.id)}">${plantOptions(c.plantId || "", "No plant")}</select></label>
        ${view.asking === c.id ? `<div class="noteask" role="group" aria-label="Delete this check?"><span>Delete this check${c.photo ? " and its photo" : ""}?</span>
          <button type="button" class="btn danger" data-yes="${esc(c.id)}">Delete</button><button type="button" class="linkbtn" data-keep>Keep</button></div>`
          : `<button type="button" class="linkbtn" data-del="${esc(c.id)}">Delete this check</button>`}
        ${view.problem[c.id] ? `<p class="notewait" role="status">${esc(view.problem[c.id])}</p>` : ""}
      </div>` : ""}
    </li>`;
  }

  // A check still waiting: send it to Claude again, with its photo where the phone can share it.
  function waitingHtml(c) {
    readyToShare(c);
    const file = photoFiles.get(c.id);
    return `<p class="small">Send the photo to Claude with this check's prompt. The answer fills in here once Claude saves it.</p>
      <div class="formbtns">${file ? `<button type="button" class="btn" data-reshare="${esc(c.id)}">${SPARK}Send photo to Claude</button>` : ""}
        <a class="${file ? "linkbtn" : "btn"}" href="${esc(claudeLinks(promptFor(c)).app)}" data-reclaude="${esc(c.id)}">${file ? "Open Claude" : `${SPARK}Open Claude again`}</a></div>`;
  }

  const loadNote = () => (data.status && !["saved", "loading"].includes(data.status) && !data.checks.length ? `<p class="small">${esc(WHY[data.status] || WHY.offline)}</p>` : "");

  // The health timeline: every plant check, newest first.
  function timelineHtml() {
    const all = data.checks.filter((c) => c.kind === "plant").sort(newestFirst);
    const waiting = all.filter((c) => c.status !== "done");
    const done = all.filter((c) => c.status === "done" && plantIsFinal(c.report));
    const problems = done.filter((c) => c.report.outcome === "issues"), healthy = done.filter((c) => c.report.outcome === "healthy");
    const shown = view.filter === "problems" ? problems : view.filter === "healthy" ? healthy : done;
    const chip = (f, label, n) => `<button type="button" class="toggle" data-filter="${f}" aria-pressed="${view.filter === f}">${label} (${n})</button>`;
    return `<h3>Health timeline${done.length ? ` <span class="count">${done.length}</span>` : ""}</h3>
      ${loadNote()}
      ${waiting.length ? `<p class="stitle">Waiting for Claude</p><ul class="buglist">${waiting.map((c) => itemHtml(c)).join("")}</ul>` : ""}
      ${done.length ? `<div class="filters">${chip("all", "All", done.length)}${chip("problems", "Problems", problems.length)}${chip("healthy", "Healthy", healthy.length)}</div>
        <ul class="buglist">${shown.map((c) => itemHtml(c)).join("")}</ul>`
        : data.status === "loading" ? `<p class="small">Loading…</p>` : `<p class="small">Nothing yet. Each plant Claude checks shows up here, so you can see which plant had what, and when.</p>`}`;
  }

  // The bug catalog: one line per bug, or one bug's page with every sighting.
  function catalogHtml() {
    const waiting = data.checks.filter((c) => c.kind === "bug" && c.status !== "done").sort(newestFirst);
    const groups = catalogOf(data.checks);
    const head = `<h3>Your bug catalog${groups.length ? ` <span class="count">${groups.length}</span>` : ""}</h3>${loadNote()}
      ${waiting.length ? `<p class="stitle">Waiting for Claude</p><ul class="buglist">${waiting.map((c) => itemHtml(c)).join("")}</ul>` : ""}`;
    if (view.open) {
      const g = groups.find((x) => x.key === view.open);
      if (g) return head + groupHtml(g);
      view.open = null;
    }
    if (!groups.length) return head + (data.status === "loading" ? `<p class="small">Loading…</p>` : `<p class="small">Nothing yet. Every bug Claude identifies is added here, with the plant it was on.</p>`);
    const counts = { all: groups.length, foe: 0, friend: 0, neutral: 0 };
    for (const g of groups) counts[g.verdict] = (counts[g.verdict] || 0) + 1;
    const shown = groups.filter((g) => view.bugFilter === "all" || g.verdict === view.bugFilter);
    const chip = (f, label) => `<button type="button" class="toggle" data-bugfilter="${f}" aria-pressed="${view.bugFilter === f}">${label} (${counts[f] || 0})</button>`;
    return `${head}<div class="filters">${chip("all", "All")}${chip("foe", "Foes")}${chip("friend", "Friends")}${chip("neutral", "Neutral")}</div>
      <ul class="buglist">${shown.map((g) => groupLine(g, "data-group", true)).join("")}</ul>`;
  }
  function groupLine(g, attr, withPlants) {
    const pic = g.sightings.find((x) => x.photo)?.photo;
    const plants = withPlants && g.plants.length ? ` · on ${esc(g.plants.map(plantName).filter(Boolean).slice(0, 3).join(", "))}${g.plants.length > 3 ? "…" : ""}` : "";
    return `<li><button type="button" class="checkline" ${attr}="${esc(g.key)}">
      <span class="bugthumb">${BUG}${pic ? `<img alt="" data-thumb="${esc(pic)}">` : ""}</span>
      <span class="bugname"><b>${esc(g.name)}</b>${withPlants && g.scientific ? ` <i>${esc(g.scientific)}</i>` : ""}
        <span class="small">Seen ${g.count === 1 ? "once" : `${g.count} times`} · last ${esc(noteDate(g.last, today()))}${plants}</span></span>
      ${verdictBadge(g.verdict)}
    </button></li>`;
  }

  function groupHtml(g) {
    const plantIds = g.plants.filter((id) => plantName(id));
    return `<div class="buggroup">
      <button type="button" class="linkbtn" data-back>‹ All bugs</button>
      <div class="report">${bugReportHtml(g.report)}</div>
      ${plantIds.length ? `<div class="bugplants"><p class="stitle">Found on</p><div class="chips">${plantIds.map((id) => `<button type="button" class="pill" data-open-plant="${esc(id)}">${esc(plantName(id))}</button>`).join("")}</div>
        <button type="button" class="linkbtn" data-ring>Show these plants in the yard</button></div>` : ""}
      <p class="stitle">Sightings (${g.count})</p>
      <ul class="buglist">${g.sightings.map((c) => itemHtml(c)).join("")}</ul>
    </div>`;
  }

  function draw() {
    drawCard();
    if (!panel || panel.hidden) return;
    const a = access();
    const focusId = panel.contains(document.activeElement) ? document.activeElement.id : null;
    const old = panel.querySelector(".tlist");
    const scroll = old ? old.scrollTop : 0;
    const tab = (id, label, icon) => `<button type="button" role="tab" class="toggle" data-tab="${id}" aria-selected="${st.tab === id}" aria-pressed="${st.tab === id}">${icon}${label}</button>`;
    const body = !a?.can ? `<p class="lead">${esc(a?.note || WHY["signed-out"])}</p>`
      : st.tab === "plant" ? `
        <p class="lead">Take a photo of a plant and ask Claude to identify it, check its health, and say what to do about any problem, organic options first.</p>
        ${formHtml("plant")}${stepHtml("plant")}${timelineHtml()}`
      : `
        <p class="lead">Found a bug? Take its photo and ask Claude what it is and whether it's a friend or a foe. Every bug goes in your catalog below.</p>
        ${formHtml("bug")}${stepHtml("bug")}${catalogHtml()}`;
    panel.innerHTML = `
      <div class="listhead">
        <div class="row">
          <h2 id="checksTitle">Photo check</h2>
          <button class="close" type="button" aria-label="Close">✕</button>
        </div>
        <div class="filters checktabs" role="tablist">${tab("plant", "Plant health", LEAF)}${tab("bug", "Friend or foe", BUG)}</div>
      </div>
      <div class="tlist checks">
        ${body}
        ${a?.can ? `<p class="small checkcost">Claude answers in the Claude app, with your Plant Diagnostics and Friend or Foe skills, and saves the answer here through the Supabase connector. Photos are made smaller and their location is removed before they're saved. Only people in the garden can see them.</p>` : ""}
      </div>`;
    wire(panel);
    const list = panel.querySelector(".tlist");
    if (list) list.scrollTop = scroll;
    if (focusId) panel.querySelector(`#${CSS.escape(focusId)}`)?.focus({ preventScroll: true });
  }

  // Wires the buttons in the panel or the card's section.
  function wire(root) {
    root.querySelector(".close")?.addEventListener("click", close);
    root.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { st.tab = b.dataset.tab; draw(); }));
    root.querySelectorAll("[data-photo]").forEach((i) => i.addEventListener("change", (e) => pickPhoto(i.dataset.photo, e.target.files?.[0])));
    root.querySelectorAll("[data-plant]").forEach((sel) => (sel.onchange = () => { st[sel.dataset.plant].plantId = sel.value; warmNotes(sel.value); }));
    root.querySelectorAll("[data-note]").forEach((t) => (t.oninput = () => { st[t.dataset.note].note = t.value; }));
    root.querySelectorAll("[data-form]").forEach((f) => (f.onsubmit = (e) => { e.preventDefault(); start(f.dataset.form); }));
    // Opening Claude copies the prompt on the way (the link itself opens the app).
    root.querySelectorAll("[data-claude]").forEach((a) => a.addEventListener("click", () => {
      const s = st[a.dataset.claude];
      copyText(s.prompt).then((ok) => { if (ok && !s.copied) { s.copied = true; draw(); } });
    }));
    root.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => {
      const s = st[b.dataset.copy];
      if (await copyText(s.prompt)) { s.copied = true; draw(); }
    }));
    root.querySelectorAll("[data-new]").forEach((b) => (b.onclick = () => {
      const s = st[b.dataset.new];
      if (s.pic) URL.revokeObjectURL(s.pic.url);
      st[b.dataset.new] = { ...blank(), plantId: s.plantId };
      draw();
      panel?.querySelector(".tlist")?.scrollTo({ top: 0 });
    }));
    root.querySelectorAll("[data-show]").forEach((b) => (b.onclick = () => {
      const c = data.checks.find((x) => x.id === b.dataset.show);
      view.expanded.add(b.dataset.show);
      view.open = c?.kind === "bug" && c.report ? bugKey(c.report) : null; // a bug's answer is on its catalog page
      draw();
      root.querySelector(`[data-toggle="${CSS.escape(b.dataset.show)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }));
    root.querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = () => {
      const id = b.dataset.toggle;
      view.expanded.has(id) ? view.expanded.delete(id) : view.expanded.add(id);
      draw();
    }));
    // The share sheet, with the photo and the prompt (the prompt is also on the clipboard, for apps that only
    // take the photo). It has to start right in the tap.
    const share = (file, text) => navigator.share({ files: [file], text }).catch(() => { /* closed without picking */ });
    root.querySelectorAll("[data-share]").forEach((b) => (b.onclick = () => {
      const s = st[b.dataset.share];
      const file = s.pic && shareable(s.pic.photo);
      if (file) share(file, s.prompt);
    }));
    // A waiting check can be sent to Claude again: its prompt is made again (and copied on the way).
    root.querySelectorAll("[data-reshare]").forEach((b) => (b.onclick = () => {
      const c = data.checks.find((x) => x.id === b.dataset.reshare), file = photoFiles.get(b.dataset.reshare);
      if (c && file) share(file, promptFor(c));
    }));
    root.querySelectorAll("[data-reclaude]").forEach((a) => a.addEventListener("click", () => {
      const c = data.checks.find((x) => x.id === a.dataset.reclaude);
      if (c) copyText(promptFor(c));
    }));
    root.querySelectorAll("[data-filter]").forEach((b) => (b.onclick = () => { view.filter = b.dataset.filter; draw(); }));
    root.querySelectorAll("[data-bugfilter]").forEach((b) => (b.onclick = () => { view.bugFilter = b.dataset.bugfilter; draw(); }));
    root.querySelectorAll("[data-group]").forEach((b) => (b.onclick = () => { view.open = b.dataset.group; draw(); showGroup(); }));
    root.querySelector("[data-back]")?.addEventListener("click", () => { view.open = null; draw(); showGroup(".tlist > .filters"); });
    root.querySelectorAll("[data-open-plant]").forEach((b) => (b.onclick = () => { close(); onPlant(b.dataset.openPlant); }));
    const group = view.open && catalogOf(data.checks).find((g) => g.key === view.open);
    root.querySelector("[data-ring]")?.addEventListener("click", () => {
      close();
      onShowInYard(group.plants.filter((id) => plantName(id)), `${group.name} found here`, group.verdict === "foe" ? "#e0402f" : group.verdict === "friend" ? "#2f9e5b" : "#3b82f6");
    });
    const byId = new Map(data.checks.map((x) => [x.id, x]));
    root.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { view.asking = b.dataset.del; draw(); }));
    root.querySelector("[data-keep]")?.addEventListener("click", () => { view.asking = null; draw(); });
    root.querySelectorAll("[data-yes]").forEach((b) => (b.onclick = () => remove(byId.get(b.dataset.yes))));
    root.querySelectorAll("[data-move]").forEach((sel) => (sel.onchange = () => move(byId.get(sel.dataset.move), sel.value)));
    root.querySelectorAll("[data-pic]").forEach((b) => (b.onclick = () => {
      const c = byId.get(b.dataset.pic);
      const name = c.status !== "done" ? "Waiting for Claude" : c.kind === "plant" ? plantTitle(c.report) : c.report?.common_name;
      onPhoto([{ caption: `${name} · ${noteDate(c.date, today())}${c.plantId && plantName(c.plantId) ? ` · ${plantName(c.plantId)}` : ""}`, load: () => backend.photo(c.photo) }], 0);
    }));
    // Small copies of the photos, fetched as they're shown.
    root.querySelectorAll("img[data-thumb]").forEach((img) => {
      backend.photo(img.dataset.thumb.replace(/\.jpg$/, "-thumb.jpg")).then((url) => { img.src = url; }).catch(() => img.parentElement?.classList.add("missing"));
    });
  }
  // Scrolls a bug's page (or the catalog list) to the top, just under the catalog's heading, which stays put.
  function showGroup(selector = ".buggroup") {
    const list = panel?.querySelector(".tlist"), el = panel?.querySelector(selector), head = panel?.querySelector(".checks h3");
    if (list && el) list.scrollTop += el.getBoundingClientRect().top - list.getBoundingClientRect().top - (head?.offsetHeight || 0) - 4;
  }

  // ---------- the card's section ----------
  // Buttons to check this plant or a bug on it, its health checks, and the bugs found on it.
  function drawCard() {
    if (!card?.el?.isConnected) return;
    const { el, plant, access: a } = card;
    el.hidden = !a?.can;
    if (!a?.can) return void (el.innerHTML = "");
    const mine = data.checks.filter((c) => c.plantId === plant.id).sort(newestFirst);
    const health = mine.filter((c) => c.kind === "plant" || c.status !== "done");
    const bugs = catalogOf(mine);
    el.innerHTML = `
      <div class="noteshead"><h3 id="checksCardTitle">Photo check</h3></div>
      <div class="checkbtns">
        <button type="button" class="pill" data-card-check="plant">${LEAF}Check its health</button>
        <button type="button" class="pill" data-card-check="bug">${BUG}Found a bug on it?</button>
      </div>
      ${health.length ? `<p class="stitle">Health checks</p><ul class="buglist">${health.slice(0, 5).map((c) => itemHtml(c, { plant: false })).join("")}</ul>` : ""}
      ${bugs.length ? `<p class="stitle">Bugs found here</p><ul class="buglist">${bugs.map((g) => groupLine(g, "data-card-group", false)).join("")}</ul>` : ""}`;
    el.querySelectorAll("[data-card-check]").forEach((b) => (b.onclick = () => open({ tab: b.dataset.cardCheck, plantId: plant.id })));
    el.querySelectorAll("[data-card-group]").forEach((b) => (b.onclick = () => open({ tab: "bug", group: b.dataset.cardGroup })));
    wire(el);
  }

  function open({ tab = st.tab, plantId = null, group = null } = {}) {
    st.tab = tab;
    // Starting from a plant's card picks that plant, unless a check is part-way.
    const s = st[tab];
    if (plantId && s.phase !== "saving") {
      if (s.plantId !== plantId && s.phase === "ready") { if (s.pic) URL.revokeObjectURL(s.pic.url); st[tab] = blank(); }
      st[tab].plantId = plantId;
    }
    if (group) view.open = group;
    warmNotes(st[tab].plantId);
    panel = document.getElementById("checksPanel");
    panel.hidden = false;
    if (access()?.can) load(true);
    draw();
    panel.querySelector(".close")?.focus({ preventScroll: true });
    if (group) showGroup();
  }
  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    keepChecking();
    onClose?.();
  }

  return {
    open, close,
    get isOpen() { return Boolean(panel && !panel.hidden); },
    // Draws the card's section for a plant. access is as for notes: null hides it.
    drawCard(el, plant, a) {
      card = { el, plant, access: a };
      if (a?.can) load();
      drawCard();
      keepChecking();
    },
    // Coming back to the app (say, from Claude): look for answers.
    refresh() { if (access()?.can) load(true); },
    // After signing out, nobody's checks stay on screen.
    forget() {
      Object.assign(data, { checks: [], status: "", at: 0 });
      Object.assign(view, { open: null, asking: null, problem: {} });
      view.expanded.clear();
      draw();
    },
    // For the tests.
    state: st, data, start, promptFor,
  };
}
