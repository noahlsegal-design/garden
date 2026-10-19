// The Yard view's own pieces over the live 3D yard: the small glass labels floating over plants that have jobs
// this week, and the glass card that slides up when a label or a plant is tapped. main.js decides when they
// show and what's in them; scene.js says where each plant is on screen.

import { esc, MONTH_NAMES, CARE_TYPES, stateText, careFor } from "./data.js";
import { plainName, firstSentence, pictureOf, imgTag, placeholder, loadNoteThumbs } from "./today.js";

// ---------- labels ----------
// Labels never cover each other: the nearest plants get theirs first, and one that would overlap a label
// already placed (or the controls at the top and bottom) waits until there's room. They let every touch through
// to the yard, so dragging, pinching and twisting work over them too; a tap is matched to a label by where it
// landed (hit). They're still buttons for the keyboard.
export function createLabels(el, { onPick }) {
  let items = [], sig = "", active = null, placed = [];
  const nodes = new Map(); // id -> { node, w, h }
  el.onclick = (e) => {
    const b = e.target.closest("[data-label]");
    if (b) onPick(b.dataset.label);
  };
  return {
    // items: [{ id, name, count }]
    set(next) {
      const s = JSON.stringify(next);
      if (s === sig) return;
      sig = s;
      items = next;
      el.innerHTML = items.map((it) => `
        <button type="button" class="ylabel glass onsky" data-label="${esc(it.id)}" aria-label="${esc(it.name)}: ${it.count} ${it.count === 1 ? "job" : "jobs"} this week">
          <span class="ylname">${esc(it.name)}</span>${it.count > 1 ? `<span class="ylcount">${it.count}</span>` : ""}
        </button>`).join("");
      nodes.clear();
      for (const node of el.querySelectorAll("[data-label]")) nodes.set(node.dataset.label, { node, w: 0, h: 0 });
      this.setActive(active);
    },
    ids: () => items.map((it) => it.id),
    setActive(id) {
      active = id;
      for (const [k, n] of nodes) n.node.classList.toggle("on", k === id);
    },
    // spots: from the yard (scene.js spots). top and bottom: the free band between the controls, in pixels.
    place(spots, { top, bottom, width }) {
      for (const n of nodes.values()) if (!n.w) { n.w = n.node.offsetWidth; n.h = n.node.offsetHeight; }
      const order = spots.filter((s) => s.front && nodes.has(s.id))
        .sort((a, b) => (b.id === active) - (a.id === active) || a.dist - b.dist);
      placed = [];
      const shown = new Set();
      for (const s of order) {
        const n = nodes.get(s.id);
        const r = { id: s.id, x0: s.x - n.w / 2, x1: s.x + n.w / 2, y0: s.y - n.h - 7, y1: s.y };
        if (r.x0 < 4 || r.x1 > width - 4 || r.y0 < top || r.y1 > bottom) continue;
        if (placed.some((p) => r.x0 < p.x1 + 4 && r.x1 > p.x0 - 4 && r.y0 < p.y1 + 3 && r.y1 > p.y0 - 3)) continue;
        placed.push(r);
        shown.add(s.id);
        n.node.style.transform = `translate3d(${Math.round(r.x0)}px, ${Math.round(r.y0)}px, 0)`;
      }
      for (const [id, n] of nodes) n.node.classList.toggle("off", !shown.has(id));
    },
    // The plant whose label is under a tap, if any.
    hit(x, y) {
      for (let i = placed.length - 1; i >= 0; i--) {
        const p = placed[i];
        if (x >= p.x0 - 4 && x <= p.x1 + 4 && y >= p.y0 - 8 && y <= p.y1 + 8) return p.id; // a 44px-tall target for a 28px label
      }
      return null;
    },
  };
}

// ---------- the card that slides up ----------
const ARROW = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>`;

// What's happening with a plant: this week's jobs left (in this month), else its stage and the month's care.
function nowLines(p, sp, month, jobs, thisMonth) {
  const [label, sentence] = stateText(sp, month, p.seasonNow);
  if (thisMonth && jobs.length) {
    const first = jobs[0];
    return {
      eyebrow: `${jobs.length} ${jobs.length === 1 ? "job" : "jobs"} this week`,
      text: `${CARE_TYPES[first.type] || first.type}: ${firstSentence(first.text)}${jobs.length > 1 ? ` (+${jobs.length - 1} more)` : ""}`,
    };
  }
  const care = careFor(sp, month);
  return {
    eyebrow: thisMonth ? `Now · ${label}` : `${MONTH_NAMES[month]} · ${label}`,
    text: care.length && !thisMonth ? `${CARE_TYPES[care[0].type] || care[0].type}: ${firstSentence(care[0].text)}` : sentence,
  };
}

// o: { plant, species, areaName, month, thisMonth, jobs: [{ type, text }], notePhotos (Map plantId -> newest
// note with a photo), thumb(photo), onOpen(), onClose() }
export function renderPeek(el, o) {
  const p = o.plant, sp = o.species;
  const pic = pictureOf([p], o.notePhotos);
  const now = nowLines(p, sp, o.month, o.jobs, o.thisMonth);
  // Its number (#12), its bed, and its kind when the name doesn't already say it.
  const kind = plainName(sp);
  const where = [p.label !== p.name && p.label, o.areaName, !p.name.toLowerCase().includes(kind.toLowerCase()) && kind].filter(Boolean);
  const fresh = el.hidden || el.dataset.id !== p.id || el.classList.contains("out");
  el.dataset.id = p.id;
  el.innerHTML = `
    <span class="peekgrab" aria-hidden="true"></span>
    <button type="button" class="peekmain" data-open aria-label="Open the card for ${esc(p.name)}">
      <span class="peekpic">${pic ? imgTag(pic, "") : placeholder(p)}</span>
      <span class="peektext">
        <b class="peekname">${esc(p.name)}</b>
        <span class="peekwhere">${esc(where.join(" · "))}</span>
        <span class="peeknow"><span class="peekeyebrow">${esc(now.eyebrow)}</span> ${esc(now.text)}</span>
      </span>
    </button>
    <button type="button" class="peekgo" data-open aria-label="Open the card for ${esc(p.name)}">${ARROW}</button>`;
  loadNoteThumbs(el, o.thumb);
  let dragged = false;
  el.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => { if (!dragged) o.onOpen(); dragged = false; }));
  if (fresh) {
    el.classList.remove("out");
    el.hidden = false;
    // replays the slide-up for a different plant
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
  }
  // A swipe down puts it away.
  let y0 = null;
  el.onpointerdown = (e) => { y0 = e.clientY; dragged = false; };
  el.onpointermove = (e) => {
    if (y0 == null) return;
    const dy = Math.max(0, e.clientY - y0);
    if (dy > 6) dragged = true;
    el.style.transform = dy ? `translateY(${dy}px)` : "";
  };
  el.onpointerup = el.onpointercancel = (e) => {
    const dy = y0 == null ? 0 : e.clientY - y0;
    y0 = null;
    el.style.transform = "";
    if (dy > 40) o.onClose();
  };
}

// Slides the card away.
export function hidePeek(el) {
  if (el.hidden || el.classList.contains("out")) return;
  el.classList.add("out");
  const done = () => { if (el.classList.contains("out")) { el.hidden = true; el.classList.remove("out"); delete el.dataset.id; } };
  el.addEventListener("animationend", done, { once: true });
  setTimeout(done, 400); // in case animations are off
}
