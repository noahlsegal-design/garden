// The bar along the bottom of the yard while Edit mode is on: add a plant (choose its kind, name it, then tap
// where it goes), resize or remove the plant you've tapped, and undo the last change. Dragging a plant to move
// it happens in the yard itself (scene.js). main.js decides what the bar shows; this only draws it.
//
// `view` is "note" (can't edit right now, and why), "idle", "plant" (one is picked), "adding" (the kind and
// name form) or "placing" (waiting for a tap in the yard).

import { esc } from "./data.js";

export const SIZE_RANGE = { min: 0.4, max: 4, step: 0.1 };

const ICON = {
  add: '<path d="M12 5v14M5 12h14"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  remove: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  card: '<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
const kindOptions = (list, chosen) => list.map(([id, name]) => `<option value="${esc(id)}" ${id === chosen ? "selected" : ""}>${esc(name)}</option>`).join("");

export function renderEditBar(el, o) {
  // Keep what's typed in the add form, and where the focus was, when the bar redraws.
  const typed = { kind: el.querySelector("#addKind")?.value, name: el.querySelector("#addName")?.value };
  const focusId = el.contains(document.activeElement) ? document.activeElement.id : null;
  const undo = o.undo ? `<button type="button" class="pill" id="ebUndo">${icon("undo")}${esc(o.undo)}</button>` : "";
  const message = o.message ? `<p class="ebmsg" role="status">${esc(o.message)}</p>` : "";
  let body;
  if (o.view === "note") {
    body = `<div class="ebhead"><p class="ebtitle">Edit mode</p></div><p class="ebhelp">${esc(o.note)}</p>`;
  } else if (o.view === "adding") {
    const draft = { ...o.draft, ...(typed.kind != null ? typed : {}) };
    body = `
      <form class="ebform" id="ebAddForm">
        <div class="ebhead"><p class="ebtitle">Add a plant</p></div>
        <label for="addKind">Kind of plant</label>
        <select id="addKind" name="kind" required>
          <option value="" ${draft.kind ? "" : "selected"} disabled>Choose a kind…</option>
          ${kindOptions(o.kinds.filter((k) => !k[2]), draft.kind)}
          <optgroup label="Not identified yet">${kindOptions(o.kinds.filter((k) => k[2]), draft.kind)}</optgroup>
        </select>
        <label for="addName">Name</label>
        <input id="addName" name="name" value="${esc(draft.name || "")}" maxlength="120" required autocomplete="off" enterkeyhint="next" placeholder="For example, Café au Lait">
        <div class="formbtns"><button class="btn" type="submit">Next: place it</button><button class="linkbtn" type="button" id="ebCancel">Cancel</button></div>
      </form>`;
  } else if (o.view === "placing") {
    body = `
      <div class="ebhead"><p class="ebtitle">Tap where “${esc(o.draft.name)}” goes</p></div>
      <p class="ebhelp">Slide or zoom the map first if you need to. You can drag it to fine-tune afterwards.</p>
      <div class="formbtns"><button class="linkbtn" type="button" id="ebCancel">Cancel</button></div>`;
  } else if (o.view === "plant") {
    const p = o.plant;
    body = `
      <div class="ebhead">
        <div class="ebplant"><p class="ebtitle">${esc(p.name)}</p><span>${esc(p.where)}</span></div>
        <button type="button" class="close" id="ebClose" aria-label="Done with this plant">✕</button>
      </div>
      <div class="ebsize">
        <label for="ebSize">Size</label>
        <input type="range" id="ebSize" min="${SIZE_RANGE.min}" max="${SIZE_RANGE.max}" step="${SIZE_RANGE.step}" value="${p.size}" aria-valuetext="${esc(p.sizeText(p.size))}">
        <span class="ebsizetext" id="ebSizeText">${esc(p.sizeText(p.size))}</span>
      </div>
      ${message}
      <div class="ebbtns">
        <button type="button" class="pill" id="ebRemove">${icon("remove")}Remove</button>
        <button type="button" class="pill" id="ebCard">${icon("card")}Plant card</button>
        ${undo}
      </div>
      <p class="ebhelp">Drag it in the yard to move it.</p>`;
  } else {
    body = `
      <div class="ebhead"><p class="ebtitle">Edit mode</p></div>
      <p class="ebhelp">Drag a plant to move it. Tap one to resize or remove it.</p>
      ${message}
      <div class="ebbtns">
        <button type="button" class="pill primary" id="ebAdd">${icon("add")}Add a plant</button>
        ${undo}
      </div>`;
  }
  el.innerHTML = body;
  el.hidden = false;

  const q = (s) => el.querySelector(s);
  q("#ebUndo")?.addEventListener("click", o.onUndo);
  q("#ebAdd")?.addEventListener("click", o.onAdd);
  q("#ebCancel")?.addEventListener("click", o.onCancel);
  q("#ebClose")?.addEventListener("click", o.onClose);
  q("#ebRemove")?.addEventListener("click", o.onRemove);
  q("#ebCard")?.addEventListener("click", o.onCard);
  const size = q("#ebSize");
  if (size) {
    // The plant grows and shrinks in the yard as you slide; the new size is saved when you let go.
    const text = () => { const t = o.plant.sizeText(Number(size.value)); q("#ebSizeText").textContent = t; size.setAttribute("aria-valuetext", t); };
    size.addEventListener("input", () => { text(); o.onSize(Number(size.value), false); });
    size.addEventListener("change", () => { text(); o.onSize(Number(size.value), true); });
  }
  const form = q("#ebAddForm");
  if (form) {
    const kind = q("#addKind"), name = q("#addName");
    // Picking a kind suggests its name, until you type one of your own.
    let nameTouched = Boolean(name.value);
    name.oninput = () => { nameTouched = Boolean(name.value); };
    kind.onchange = () => {
      if (!nameTouched) name.value = (o.kinds.find(([id]) => id === kind.value)?.[1] || "").replace(/\s*\(unconfirmed\)/i, "");
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!kind.value) return kind.focus();
      if (!name.value.trim()) return name.focus();
      o.onNext({ kind: kind.value, name: name.value.trim() });
    };
  }
  if (focusId && q(`#${CSS.escape(focusId)}`)) q(`#${CSS.escape(focusId)}`).focus({ preventScroll: true });
  else if (o.focus) q(o.focus)?.focus({ preventScroll: true });
}
