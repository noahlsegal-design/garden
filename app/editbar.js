// The bar along the bottom of the yard while Edit mode is on: add a plant (choose its kind, name it, then tap
// where it goes), set the height, width and main stems of the plant you've tapped or remove it, and undo the
// last change. Dragging a plant to move
// it happens in the yard itself (scene.js). main.js decides what the bar shows; this only draws it.
//
// `view` is "note" (can't edit right now, and why), "idle", "plant" (one is picked), "adding" (the kind and
// name form) or "placing" (waiting for a tap in the yard).

import { esc } from "./data.js";

// Heights and widths in feet. The sliders stretch the small end, where most plants are: halfway along is
// about 2.5 ft. The boxes take any value in range, to a tenth of a foot.
export const FEET = { min: 0.3, slider: 20, max: 40 };
const toFeet = (v) => Math.round(FEET.min * (FEET.slider / FEET.min) ** (v / 100) * 10) / 10;
const toSlider = (ft) => Math.round((100 * Math.log(Math.min(Math.max(ft, FEET.min), FEET.slider) / FEET.min)) / Math.log(FEET.slider / FEET.min));
const ft = (v) => String(Math.round(v * 10) / 10);

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
        ${[["height", "Height", "tall"], ["width", "Width", "across"]].map(([f, label, word]) => `
          <label for="eb-${f}">${label}</label>
          <input type="range" id="eb-${f}-slider" min="0" max="100" step="1" value="${toSlider(p[f])}" aria-label="${label}" aria-valuetext="${ft(p[f])} feet ${word}">
          <span class="ebnum"><input type="number" id="eb-${f}" inputmode="decimal" min="0.1" max="${FEET.max}" step="0.1" value="${ft(p[f])}" enterkeyhint="done"><span>ft</span></span>`).join("")}
        <label for="eb-stems" class="ebwide">Main stems or trunks</label>
        <span class="ebnum"><input type="number" id="eb-stems" inputmode="numeric" min="1" max="999" step="1" value="${p.stems ?? ""}" placeholder="?" enterkeyhint="done"></span>
        <p class="ebnote">${p.estimated ? "Height and width are the app's guess for this kind until you enter your own." : "Your measurements."} Stems are kept on the plant's card for now.</p>
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
      <p class="ebhelp">Drag a plant to move it. Tap one to change its width or height, or remove it.</p>
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
  // The plant grows and shrinks in the yard as you slide or type; the new size is saved when you let go of the
  // slider or leave the box. A box left empty or out of range goes back to what it was.
  for (const [f, word] of [["height", "tall"], ["width", "across"]]) {
    const slider = q(`#eb-${f}-slider`), box = q(`#eb-${f}`);
    if (!slider) continue;
    const show = (v) => slider.setAttribute("aria-valuetext", `${ft(v)} feet ${word}`);
    slider.addEventListener("input", () => { const v = toFeet(Number(slider.value)); box.value = ft(v); show(v); o.onMeasure({ [f]: v }, false); });
    slider.addEventListener("change", () => o.onMeasure({ [f]: toFeet(Number(slider.value)) }, true));
    const typed = () => { const v = Math.round(Number(box.value) * 10) / 10; return box.value !== "" && v >= 0.1 && v <= FEET.max ? v : null; };
    box.addEventListener("input", () => { const v = typed(); if (v != null) { slider.value = toSlider(v); show(v); o.onMeasure({ [f]: v }, false); } });
    box.addEventListener("change", () => {
      const v = typed();
      if (v == null) { box.value = ft(o.plant[f]); slider.value = toSlider(o.plant[f]); return o.onMeasure({ [f]: o.plant[f] }, false); }
      if (v !== o.plant[f]) o.onMeasure({ [f]: v }, true);
    });
  }
  const stems = q("#eb-stems");
  stems?.addEventListener("change", () => {
    const n = Number(stems.value);
    if (stems.value === "") return o.onMeasure({ stems: null }, true);
    if (!Number.isInteger(n) || n < 1 || n > 999) { stems.value = o.plant.stems ?? ""; return; }
    if (n !== o.plant.stems) o.onMeasure({ stems: n }, true);
  });
  for (const box of el.querySelectorAll(".ebnum input")) box.addEventListener("keydown", (e) => { if (e.key === "Enter") box.blur(); });
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
