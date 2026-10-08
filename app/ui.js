// Everything on screen that isn't the 3D yard or the Edit mode bar (editbar.js): month buttons, the plant card
// (with its confirm, rename and finish controls; its notes and photos are drawn by notes.js, its photo checks by
// checks.js), the all-plants
// list, "Save app edits into files", and the photo viewer.

import {
  MONTHS, MONTH_NAMES, seasonOf, isUnconfirmed, dogSafety, isDogRisk, TOX_INFO,
  stateText, careFor, restOfYear, CARE_TYPES, sourceName, photoUrl, thumbUrl, esc, canOverrideSeason, seasonWords,
} from "./data.js";
import { dateText, fieldText, spotText } from "./edits.js";
import { acrossText, tallText, stemsText } from "./look.js";

const $ = (id) => document.getElementById(id);

// ---------- month buttons ----------
export function renderMonths(el, month, today, onChange) {
  el.innerHTML = MONTHS.map((m, i) =>
    `<button type="button" data-m="${i}" aria-pressed="${i === month}" class="${i === today ? "today" : ""}"
      style="--c:${seasonOf(i).color}" aria-label="${MONTH_NAMES[i]}${i === today ? " (this month)" : ""}">${m}</button>`).join("");
  el.onclick = (e) => {
    const b = e.target.closest("button[data-m]");
    if (b) onChange(Number(b.dataset.m));
  };
  el.querySelector(`[data-m="${month}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
}

// ---------- small building blocks ----------
function badgesHtml(p, sp) {
  const out = [];
  if (p.confirmedByOwner) out.push(`<span class="badge safe">✓ ID confirmed</span>`);
  else if (isUnconfirmed(p)) out.push(`<span class="badge unconfirmed">? Unconfirmed ID · ${p.idConfidence}%</span>`);
  else out.push(`<span class="badge">ID ${p.idConfidence}% sure</span>`);
  const dog = dogSafety(p, sp);
  const t = TOX_INFO[dog.status] || TOX_INFO.check;
  if (dog.status !== "not-listed") out.push(`<span class="badge ${t.cls}">${dog.status === "toxic" ? "⚠ " : ""}${t.label}</span>`);
  if (p.issues?.length) out.push(`<span class="badge attention">Needs attention</span>`);
  return out.join("");
}

const link = (url) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(sourceName(url))}</a>`;
const taskLi = (c) => `<li><span class="tag">${esc(CARE_TYPES[c.type] || c.type)}</span>${esc(c.text)}</li>`;

// ---------- plant card ----------
// A plant marked "finished" (say, a crop done for the season) is off the yard and out of This week.
const finishedText = (p) => ["Finished for the season", `Marked finished on ${dateText(p.finished)}, so it's off the 3D yard and out of This week.`];
// A removed plant is hidden the same way, but kept, so it can be put back.
const removedText = (p) => ["Removed from the yard", `Removed on ${dateText(p.removed)}. It's hidden from the 3D yard and This week, not erased.`];

// The card's own controls: confirm the ID, rename, finish for the season. Only one form is open at a time,
// and it stays open (with what's typed in it) when the card redraws.
let editing = null; // { id, form: "confirm" | "rename" }
let lastCardId = null;

const kindOptions = (list, p) => list.map(([id, name]) => `<option value="${esc(id)}" ${id === p.speciesId ? "selected" : ""}>${esc(name)}</option>`).join("");

function editHtml(p, edit) {
  if (!edit) return "";
  if (!edit.can) return edit.note ? `<p class="small editnote">${esc(edit.note)}</p>` : "";
  const changes = edit.changes.length ? `<ul class="changes" aria-label="Changed in the app">${edit.changes.map((c) => `
    <li><span>${esc(c.text)}${c.who ? ` <span class="who">· ${esc(c.who)}</span>` : ""}</span>
      ${c.fields.length ? `<button type="button" class="linkbtn inline" data-undo="${esc(c.fields.join(" "))}">Undo</button>` : ""}</li>`).join("")}</ul>` : "";
  const form = editing?.id === p.id ? editing.form : null;
  const buttons = (label) => `<div class="formbtns"><button class="btn" type="submit">${label}</button><button class="linkbtn" type="button" data-edit="cancel">Cancel</button></div>`;
  const nameInput = `<label for="editName">Name</label><input id="editName" name="name" value="${esc(p.name)}" maxlength="120" required autocomplete="off" enterkeyhint="done">`;
  if (form === "rename") return `<form class="editform" data-form="rename"><p class="stitle">Rename</p>${nameInput}${buttons("Save name")}</form>${changes}`;
  if (form === "confirm") return `
    <form class="editform" data-form="confirm">
      <p class="stitle">Confirm what this plant is</p>
      <label for="editKind">Kind of plant</label>
      <select id="editKind" name="kind">
        ${kindOptions(edit.kinds.filter((k) => !k[2]), p)}
        <optgroup label="Not identified yet">${kindOptions(edit.kinds.filter((k) => k[2]), p)}</optgroup>
      </select>
      ${nameInput}
      <p class="small">Its care, dog safety and This week jobs follow the kind you choose. Not in the list? Ask Claude to add that kind, with its care.</p>
      ${buttons("Confirm ID")}
    </form>${changes}`;
  // How the 3D yard draws it, for when a plant's shape looks wrong or it grows differently than its kind usually does.
  const usual = edit.shapes?.find((s) => s.id === edit.defaultShape)?.name || "";
  const shapeChoice = edit.shapes ? `
    <label class="growson" for="editShape">Shape${p.shape ? ' <span class="small">(custom)</span>' : ""}
      <select id="editShape" data-shape>
        <option value="" ${p.shape ? "" : "selected"}>Use the default for this kind${usual ? ` (${esc(usual)})` : ""}</option>
        ${edit.shapes.map((s) => `<option value="${esc(s.id)}" ${s.id === p.shape ? "selected" : ""}>${esc(s.name)}</option>`).join("")}
      </select>
    </label>` : "";
  // A vine can be given something to grow on: the arch, a trellis, a pole or the ground.
  const growsOn = edit.supports ? `
    <label class="growson" for="editSupport">Grows on
      <select id="editSupport" data-support>
        <option value="" ${p.support ? "" : "selected"}>Its usual way</option>
        ${edit.supports.map((s) => `<option value="${esc(s.id)}" ${s.id === p.support ? "selected" : ""}>${esc(s.name)}</option>`).join("")}
      </select>
    </label>` : "";
  return `
    <div class="editbar">
      ${p.confirmedByOwner ? "" : `<button type="button" class="pill" data-edit="confirm"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Confirm ID</button>`}
      <button type="button" class="pill" data-edit="rename"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>Rename</button>
      ${p.finished || p.removed ? "" : `<button type="button" class="pill" data-edit="finish"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V11M12 11c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5z"/></svg>Finished for the season</button>`}
    </div>${shapeChoice}${growsOn}${changes}`;
}

// "Still growing" and "Dead", for when the weather doesn't match the calendar: shown for this month only (it's
// about how the plant is today), on crops, annuals and dahlias once they've been growing this year. Tapping the
// one that's on goes back to the calendar.
const covers = (p, month) => p.seasonNow && month >= p.seasonNow.from && month <= p.seasonNow.to;
function seasonHtml(p, sp, month, edit) {
  if (!edit?.can || p.finished || p.removed || month !== Number(edit.today.slice(5, 7)) - 1 || !canOverrideSeason(sp, month)) return "";
  const on = covers(p, month) ? p.seasonNow.state : null;
  const pill = (state, label, icon) => `<button type="button" class="pill" data-season="${state}" aria-pressed="${on === state}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg>${label}</button>`;
  return `
      <div class="seasonbtns" role="group" aria-label="How it's really doing">
        <span class="small">Not what you see?</span>
        ${pill("growing", "Still growing", "M12 21V11M12 11c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5z")}
        ${pill("dead", "Dead", "M12 21v-8c0-3-2-5-5-6M12 13c1-2 3-3 5-2-1 2-3 3-5 2z")}
      </div>
      ${on ? `<p class="small">Tap it again to go back to the calendar.</p>` : ""}`;
}

export function renderCard(sheet, { plant: p, species: sp, month, areaName, edit, onClose, onPhoto, onNotes, onChecks }) {
  // Keep what's typed in an open form, and the scroll position, when the same card redraws.
  const same = lastCardId === p.id;
  if (!same) editing = null;
  const typed = same ? { name: sheet.querySelector("#editName")?.value, kind: sheet.querySelector("#editKind")?.value } : {};
  const focusId = same && sheet.contains(document.activeElement) ? document.activeElement.id : null;
  const scroll = same ? sheet.scrollTop : 0;
  lastCardId = p.id;
  const away = p.removed || p.finished; // not in the yard right now
  const [statusLabel, calendarSentence] = p.removed ? removedText(p) : p.finished ? finishedText(p) : stateText(sp, month, p.seasonNow);
  const statusSentence = !away && covers(p, month)
    ? `${calendarSentence} Marked ${seasonWords(p.seasonNow.state)} on ${dateText(p.season.on).replace(/, \d{4}$/, "")}, so this goes by what you saw rather than the usual calendar.`
    : calendarSentence;
  const now = away ? [] : careFor(sp, month);
  const later = restOfYear(sp, month);
  const dog = dogSafety(p, sp);
  const dogCls = dog.status === "toxic" ? "dog-toxic" : ["caution", "check"].includes(dog.status) ? "dog-caution" : "";
  const unsure = isUnconfirmed(p) || (!p.confirmedByOwner && p.idConfidence < 70);
  const title = p.name;

  sheet.innerHTML = `
    <div class="grab" aria-hidden="true"></div>
    <div class="sheethead">
      <div>
        <h2 id="sheetTitle">${esc(title)}</h2>
        <p class="where">${esc(p.label)} · ${esc(areaName)}${sp.scientificName && sp.scientificName !== "unknown" ? ` · <i>${esc(sp.scientificName)}</i>` : ""}</p>
      </div>
      <button class="close" type="button" aria-label="Close">✕</button>
    </div>
    <div class="badges">${badgesHtml(p, sp)}</div>
    ${editHtml(p, edit)}

    ${p.photos?.length ? `<div class="photos">${p.photos.map((ph, i) =>
      `<button type="button" data-photo="${i}" aria-label="Open photo ${i + 1}"><img src="${thumbUrl(ph)}" alt="Photo of ${esc(title)}" loading="lazy"></button>`).join("")}</div>` : ""}

    <div class="box now" style="--c:${seasonOf(month).color}">
      <h3>Right now · ${MONTH_NAMES[month]}</h3>
      <div class="status">${esc(statusLabel)}</div>
      <p>${esc(statusSentence)}</p>
      ${seasonHtml(p, sp, month, edit)}
      ${p.issues?.length ? `<ul class="issues">${p.issues.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
      ${now.length ? `<ul class="tasks">${now.map(taskLi).join("")}</ul>` : away ? "" : `<p class="small">No care needed this month.</p>`}
      ${p.removed && edit?.can ? `<button type="button" class="btn" data-edit="restore">Put it back in the yard</button>`
        : p.finished && edit?.can ? `<button type="button" class="btn" data-edit="unfinish">Bring it back</button>` : ""}
    </div>

    <section class="notes" id="cardChecks" aria-labelledby="checksCardTitle" hidden></section>
    <section class="notes" id="cardNotes" aria-labelledby="notesTitle" hidden></section>

    ${unsure ? `<p class="small" style="margin-top:10px">Care shown is for the best guess. It depends on confirming the ID${p.alsoPossible?.length ? `. It could also be: ${esc(p.alsoPossible.join("; "))}` : ""}.</p>` : ""}

    <div class="box ${dogCls}">
      <h3>Dog safety</h3>
      <div class="status">${esc((TOX_INFO[dog.status] || TOX_INFO.check).label)}</div>
      <p>${esc(dog.detail)}</p>
      ${dog.source ? `<p class="small">Source: ${link(dog.source)}</p>` : ""}
    </div>

    <details ${later.length ? "" : "hidden"}>
      <summary>Rest of the year</summary>
      ${later.map(({ month: mm, items }) => `<div class="monthblock"><h4>${MONTH_NAMES[mm]}</h4><ul class="tasks">${items.map(taskLi).join("")}</ul></div>`).join("")}
    </details>

    ${sp.cutFlower ? `
    <details>
      <summary>Cut flowers</summary>
      <p><b>When:</b> ${esc(sp.cutFlower.when)}</p>
      <p><b>How:</b> ${esc(sp.cutFlower.how)}</p>
      <p class="small">Confidence ${sp.cutFlower.confidence}/100: ${esc(sp.cutFlower.confidenceWhy)}${sp.cutFlower.source ? ` Source: ${link(sp.cutFlower.source)}` : ""}</p>
    </details>` : ""}

    ${sp.wildlife ? `<details><summary>Wildlife value</summary><p>${esc(sp.wildlife)}</p></details>` : ""}

    <details>
      <summary>About this plant</summary>
      <p><b>ID:</b> ${p.confirmedByOwner ? "Confirmed." : `${p.idConfidence}% sure from photos.`}${p.alsoPossible?.length && !p.confirmedByOwner ? ` Also possible: ${esc(p.alsoPossible.join("; "))}.` : ""}</p>
      ${p.notes ? `<p>${esc(p.notes)}</p>` : ""}
      ${sp.notes ? `<p>${esc(sp.notes)}</p>` : ""}
      <p><b>Size:</b> ${esc(tallText(p, sp))}, ${esc(acrossText(p, sp))}${p.stems ? `, ${esc(stemsText(p.stems))}` : ""}.${p.width == null && p.height == null ? " A guess for this kind; enter your own in Edit mode." : ""}</p>
      <p class="small">Plant ID in data/plants.json: <code>${esc(p.id)}</code> · kind: <code>${esc(sp.id)}</code></p>
    </details>

    <details>
      <summary>Sources & confidence</summary>
      <div class="conf"><b>${sp.confidence}/100</b><span class="small">${esc(sp.confidenceWhy)}</span></div>
      ${sp.sources?.length ? `<ul class="sources">${sp.sources.map((u) => `<li>${link(u)}</li>`).join("")}</ul>` : `<p class="small">No specific source for this general advice.</p>`}
    </details>
  `;
  sheet.hidden = false;
  onChecks?.(sheet.querySelector("#cardChecks"));
  onNotes?.(sheet.querySelector("#cardNotes"));
  sheet.scrollTop = scroll;
  sheet.querySelector(".close").onclick = onClose;
  sheet.querySelectorAll("[data-photo]").forEach((b) => (b.onclick = () => onPhoto(p.photos, Number(b.dataset.photo))));
  if (!edit?.can) return;

  const redraw = (focus) => {
    renderCard(sheet, { plant: p, species: sp, month, areaName, edit, onClose, onPhoto, onNotes, onChecks });
    if (focus) sheet.querySelector(focus)?.focus();
  };
  const name = sheet.querySelector("#editName"), kind = sheet.querySelector("#editKind");
  if (name && typed.name != null) name.value = typed.name;
  if (kind && typed.kind != null) kind.value = typed.kind;
  if (focusId && !sheet.contains(document.activeElement)) {
    const f = sheet.querySelector(`#${CSS.escape(focusId)}`);
    f?.focus({ preventScroll: true });
    if (f?.tagName === "TEXTAREA") f.setSelectionRange(f.value.length, f.value.length);
  }
  // Picking a different kind suggests its name, until you type a name of your own.
  let nameTouched = typed.name != null && typed.name !== p.name;
  if (name) name.oninput = () => { nameTouched = true; };
  if (kind) kind.onchange = () => {
    if (!nameTouched) name.value = (edit.kinds.find(([id]) => id === kind.value)?.[1] || name.value).replace(/\s*\(unconfirmed\)/i, "");
  };

  sheet.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => {
    const what = b.dataset.edit;
    if (what === "confirm" || what === "rename") { editing = { id: p.id, form: what }; redraw(what === "confirm" ? "#editKind" : "#editName"); }
    else if (what === "cancel") { editing = null; redraw(".editbar .pill"); }
    else if (what === "finish") edit.onSave({ finished: edit.today });
    else if (what === "unfinish") edit.onSave({ finished: null });
    else if (what === "restore") edit.onSave({ removed: null });
  }));
  sheet.querySelectorAll("[data-season]").forEach((b) => (b.onclick = () =>
    edit.onSave({ season: b.getAttribute("aria-pressed") === "true" ? null : { state: b.dataset.season, on: edit.today } })));
  sheet.querySelectorAll("[data-undo]").forEach((b) => (b.onclick = () => edit.onUndo(b.dataset.undo.split(" "))));
  const support = sheet.querySelector("[data-support]");
  if (support) support.onchange = () => edit.onSave({ support: support.value || null }); // shown in the yard straight away
  const shape = sheet.querySelector("[data-shape]");
  if (shape) shape.onchange = () => edit.onSave({ shape: shape.value || null });
  const form = sheet.querySelector("[data-form]");
  if (form) form.onsubmit = (e) => {
    e.preventDefault();
    const newName = name.value.trim();
    if (!newName) return name.focus();
    const values = { name: newName };
    if (form.dataset.form === "confirm") Object.assign(values, { speciesId: kind.value, confirmedByOwner: true, idConfidence: 100 });
    editing = null;
    edit.onSave(values);
    sheet.scrollTop = 0; // back up to the new name and badges
  };
}

// ---------- "Save app edits into files" (the Mac copy) ----------
// Shows each change made in the app that isn't in data/plants.json yet, then writes them in.
// `phase` is "review", "saving", "done" or "error".
export function renderSaveEdits(panel, { rows, species, areaNames, phase, message, cloud, onSave, onClose }) {
  const byPlant = new Map();
  for (const r of rows) {
    if (!byPlant.has(r.id)) byPlant.set(r.id, []);
    byPlant.get(r.id).push(r);
  }
  const heading = (id, list) => {
    const p = list[0].plant, added = list[0].field === "added" ? list[0] : null;
    if (list[0].structure) return `<b>${esc(list[0].structure.name || "Arch trellis")}</b> <span class="small">Goes into layout.json</span>`;
    if (added?.dropped) return `<b>${esc(added.to.name)}</b> <span class="small">was added and removed again in the app, so there's nothing to write and it's just cleared</span>`;
    if (added) return `<b>${esc(added.to.name)}</b> <span class="small">New plant</span>`;
    if (!p) return `<b>${esc(id)}</b> <span class="small">isn't in plants.json any more, so this is just cleared</span>`;
    const newName = list.find((r) => r.field === "name")?.to;
    return `<b>${esc(newName || p.name)}</b>${p.label !== (newName || p.name) ? ` <span class="small">${esc(p.label)}</span>` : ""}`;
  };
  const n = rows.length;
  panel.innerHTML = `
    <div class="listhead">
      <div class="row">
        <h2 id="saveTitle">Save app edits into files</h2>
        <button class="close" type="button" aria-label="Close">✕</button>
      </div>
    </div>
    <div class="tlist saveedits">
      ${phase === "done" ? `
        <div class="season spring" role="status">
          <p class="stitle">Saved into the garden's files</p>
          <p>${esc(message)}</p>
          <button type="button" class="btn" data-done>Done</button>
        </div>` : `
        <p class="lead">${n ? `${n} change${n === 1 ? "" : "s"} made in the app ${n === 1 ? "isn't" : "aren't"} in the garden's files yet (<code>data/plants.json</code>, and <code>data/layout.json</code> for the arch). Saving writes ${n === 1 ? "it" : "them"} into the files on this Mac.` : "Every change made in the app is already in the garden's files."}</p>
        <ul class="editrows">${[...byPlant].map(([id, list]) => `
          <li><p class="erhead">${heading(id, list)}</p>
            ${list[0].field === "added" && !list[0].dropped ? newPlantLines(list[0].to, species, areaNames) : ""}
            ${list[0].plant || list[0].structure ? `<ul>${list.map((r) => {
              const [label, from, to] = fieldText(r, species, areaNames);
              return `<li><span class="erlabel">${esc(label)}</span><span><span class="erfrom">${esc(from)}</span> → <b>${esc(to)}</b></span></li>`;
            }).join("")}</ul>` : ""}
          </li>`).join("")}</ul>
        ${phase === "error" ? `<p class="savewarn" role="alert">${esc(message)}</p>` : ""}
        <p class="small">Once they're in the file, publish the garden to put them online.${cloud ? " Until then, phones and the website keep showing these changes from your garden account, so nothing looks different in between." : ""}</p>
        <div class="formbtns">
          <button type="button" class="btn" data-save ${n && phase !== "saving" ? "" : "disabled"}>${phase === "saving" ? "Saving…" : "Write into the files"}</button>
          <button type="button" class="linkbtn" data-cancel>Cancel</button>
        </div>`}
    </div>`;
  panel.hidden = false;
  panel.querySelector(".close").onclick = onClose;
  panel.querySelector("[data-cancel]")?.addEventListener("click", onClose);
  panel.querySelector("[data-done]")?.addEventListener("click", onClose);
  panel.querySelector("[data-save]")?.addEventListener("click", onSave);
  panel.querySelector(phase === "done" ? "[data-done]" : ".close").focus({ preventScroll: true });
}

// What a new plant will look like in plants.json, for the review.
function newPlantLines(p, species, areaNames) {
  const sp = species.get(p.speciesId);
  const line = (label, value) => `<li><span class="erlabel">${esc(label)}</span><b>${esc(value)}</b></li>`;
  return `<ul>${line("Kind", sp?.commonName || p.speciesId)}${line("Bed", areaNames?.get(p.area) || p.area)}${line("Spot", spotText(p.position))}${line("Width", acrossText(p, sp))}${line("Height", tallText(p, sp))}${p.stems ? line("Main stems or trunks", String(p.stems)) : ""}${p.finished ? line("Finished for the season", dateText(p.finished)) : ""}</ul>`;
}

// ---------- all-plants list ----------
export function renderList(panel, { plants: everything, species, areaNames, areaOrder, month, filters, unsaved = 0, onFilters, onPick, onShowInYard, onSaveEdits, onClose }) {
  // Plants removed from the yard are listed apart at the bottom, so they can be found and put back.
  const plants = everything.filter((p) => !p.removed);
  const removed = everything.filter((p) => p.removed);
  const q = filters.q.trim().toLowerCase();
  const matches = plants.filter((p) => {
    const sp = species.get(p.speciesId);
    if (filters.area !== "all" && p.area !== filters.area) return false;
    if (filters.unconfirmed && !isUnconfirmed(p)) return false;
    if (filters.toxic && !isDogRisk(p, sp)) return false;
    if (filters.attention && !p.issues?.length) return false;
    if (q) {
      const hay = [p.name, p.label, sp.commonName, sp.scientificName, areaNames.get(p.area), ...(p.alsoPossible || [])].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const byArea = new Map();
  for (const p of matches) {
    if (!byArea.has(p.area)) byArea.set(p.area, []);
    byArea.get(p.area).push(p);
  }
  const areasWithPlants = areaOrder.filter((a) => plants.some((p) => p.area === a));
  const anyFilter = filters.q || filters.area !== "all" || filters.unconfirmed || filters.toxic || filters.attention;

  const focusId = document.activeElement?.id;
  panel.innerHTML = `
    <div class="listhead">
      <div class="row">
        <h2 id="listTitle">All plants <span class="small">(${plants.length})</span></h2>
        <button class="close" type="button" aria-label="Close list">✕</button>
      </div>
      <input class="search" id="listSearch" type="search" placeholder="Search by name, number or kind…" value="${esc(filters.q)}" aria-label="Search plants" autocomplete="off">
      <div class="filters">
        <select id="listArea" aria-label="Area">
          <option value="all">All areas</option>
          ${areasWithPlants.map((a) => `<option value="${esc(a)}" ${filters.area === a ? "selected" : ""}>${esc(areaNames.get(a) || a)}</option>`).join("")}
        </select>
        <button class="toggle" type="button" data-f="unconfirmed" aria-pressed="${filters.unconfirmed}">Unconfirmed ID</button>
        <button class="toggle" type="button" data-f="toxic" aria-pressed="${filters.toxic}">Toxic or maybe toxic to dogs</button>
        <button class="toggle" type="button" data-f="attention" aria-pressed="${filters.attention}">Needs attention</button>
      </div>
      <div class="listmeta">
        <span>${matches.length} showing · status for ${MONTH_NAMES[month]}</span>
        <span>
          ${anyFilter ? `<button class="linkbtn" type="button" id="listClear">Clear</button> · ` : ""}
          <button class="linkbtn" type="button" id="listShow" ${matches.length && anyFilter ? "" : "disabled"}>Show these in the yard</button>
        </span>
      </div>
    </div>
    <div class="plist">
      ${unsaved ? `<div class="editsnote"><p><b>${unsaved} change${unsaved === 1 ? "" : "s"} made in the app</b> ${unsaved === 1 ? "isn't" : "aren't"} in plants.json yet.</p><button type="button" class="btn" id="saveEditsBtn">Save app edits into files</button></div>` : ""}
      ${matches.length ? areaOrder.filter((a) => byArea.has(a)).map((a) => `
        <h3>${esc(areaNames.get(a) || a)}</h3>
        <ul>${byArea.get(a).map((p) => {
          const sp = species.get(p.speciesId);
          const dog = dogSafety(p, sp);
          const b = [];
          if (isUnconfirmed(p)) b.push(`<span class="badge unconfirmed">Unconfirmed</span>`);
          if (dog.status === "toxic") b.push(`<span class="badge toxic">Toxic to dogs</span>`);
          else if (["caution", "check"].includes(dog.status)) b.push(`<span class="badge caution">${dog.status === "caution" ? "Dog caution" : "Dog safety unknown"}</span>`);
          if (p.issues?.length) b.push(`<span class="badge attention">Needs attention</span>`);
          return `<li><button type="button" data-id="${esc(p.id)}">
            <span class="pname">${esc(p.name)} <span class="plabel">${p.label.startsWith("#") ? esc(p.label) : ""}</span></span>
            <span class="pstate">${esc(p.finished ? "Finished" : stateText(sp, month, p.seasonNow)[0])}</span>
            ${b.length ? `<span class="pbadges">${b.join("")}</span>` : ""}
          </button></li>`;
        }).join("")}</ul>`).join("") : `<p class="empty">No plants match. Try clearing the filters.</p>`}
      ${removed.length ? `
        <details class="removedlist" ${listState.removedOpen ? "open" : ""}>
          <summary>Removed from the yard (${removed.length})</summary>
          <ul>${removed.map((p) => `<li><button type="button" data-id="${esc(p.id)}">
            <span class="pname">${esc(p.name)} <span class="plabel">${p.label.startsWith("#") ? esc(p.label) : ""}</span></span>
            <span class="pstate">${esc(dateText(p.removed).replace(/, \d{4}$/, ""))}</span>
          </button></li>`).join("")}</ul>
        </details>` : ""}
    </div>`;
  panel.hidden = false;

  panel.querySelector(".close").onclick = onClose;
  const search = panel.querySelector("#listSearch");
  search.oninput = () => onFilters({ ...filters, q: search.value });
  if (focusId === "listSearch") { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
  panel.querySelector("#listArea").onchange = (e) => onFilters({ ...filters, area: e.target.value });
  panel.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => onFilters({ ...filters, [b.dataset.f]: !filters[b.dataset.f] })));
  panel.querySelector("#listClear")?.addEventListener("click", () => onFilters({ q: "", area: "all", unconfirmed: false, toxic: false, attention: false }));
  panel.querySelector("#listShow").onclick = () => onShowInYard(matches.map((p) => p.id));
  panel.querySelectorAll("[data-id]").forEach((b) => (b.onclick = () => onPick(b.dataset.id)));
  panel.querySelector("#saveEditsBtn")?.addEventListener("click", onSaveEdits);
  panel.querySelector(".removedlist")?.addEventListener("toggle", (e) => { listState.removedOpen = e.target.open; });
}
const listState = { removedOpen: false }; // whether the removed plants are showing in the list

// ---------- photo viewer ----------
// photos are the garden's own photo names (from plants.json), or notes' photos as { caption, load }, where
// load() gives the picture's address once it's fetched.
export function openLightbox(photos, start) {
  const box = $("lightbox");
  let i = start;
  const prevFocus = document.activeElement;
  const draw = () => {
    const ph = photos[i];
    const caption = typeof ph === "string" ? ph.split("/").pop() : ph.caption;
    box.innerHTML = `
      <div class="lbbar"><span>Photo ${i + 1} of ${photos.length} · ${esc(caption)}</span><button type="button" id="lbClose" aria-label="Close photo">✕</button></div>
      <div class="lbimg"><img alt="Garden photo ${i + 1}" ${typeof ph === "string" ? `src="${photoUrl(ph)}"` : ""}><p class="lbwait" hidden></p></div>
      <div class="lbnav" ${photos.length > 1 ? "" : "hidden"}><button type="button" id="lbPrev" aria-label="Previous photo">‹ Prev</button><button type="button" id="lbNext" aria-label="Next photo">Next ›</button></div>`;
    box.querySelector("#lbClose").onclick = close;
    box.querySelector("#lbPrev").onclick = () => { i = (i - 1 + photos.length) % photos.length; draw(); };
    box.querySelector("#lbNext").onclick = () => { i = (i + 1) % photos.length; draw(); };
    box.querySelector("#lbClose").focus();
    if (typeof ph !== "string") {
      const img = box.querySelector(".lbimg img"), wait = box.querySelector(".lbwait"), shown = i;
      ph.load().then((url) => { if (shown === i) img.src = url; }).catch(() => {
        if (shown !== i) return;
        img.remove();
        wait.textContent = "This photo couldn't be loaded. Check your connection and try again.";
        wait.hidden = false;
      });
    }
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopImmediatePropagation(); close(); }
    if (e.key === "ArrowLeft" && photos.length > 1) { i = (i - 1 + photos.length) % photos.length; draw(); }
    if (e.key === "ArrowRight" && photos.length > 1) { i = (i + 1) % photos.length; draw(); }
  };
  function close() { box.hidden = true; box.innerHTML = ""; document.removeEventListener("keydown", onKey, true); prevFocus?.focus?.(); }
  document.addEventListener("keydown", onKey, true);
  box.hidden = false;
  draw();
}
