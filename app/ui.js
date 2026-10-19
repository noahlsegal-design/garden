// Everything on screen that isn't the 3D yard or the Edit mode bar (editbar.js): the plant card
// (with its confirm, rename and finish controls; its notes and photos are drawn by notes.js, its photo checks by
// checks.js), "Save app edits into files", and the photo viewer.

import {
  MONTHS, MONTH_NAMES, seasonOf, isUnconfirmed, dogSafety, TOX_INFO,
  stateText, careFor, restOfYear, CARE_TYPES, sourceName, photoUrl, thumbUrl, esc, canOverrideSeason, seasonWords,
  shownStateFor, STATE_TEXT,
} from "./data.js";
import { firstSentence, hueOf } from "./today.js";
import { dateText, fieldText, spotText } from "./edits.js";
import { acrossText, tallText, stemsText } from "./look.js";

const $ = (id) => document.getElementById(id);

// ---------- small building blocks ----------
// Over the photo: the ID and whether it needs attention. (Dog safety has its own tile.)
function badgesHtml(p) {
  const out = [];
  if (p.confirmedByOwner) out.push(`<span class="badge safe">✓ ID confirmed</span>`);
  else if (isUnconfirmed(p)) out.push(`<span class="badge unconfirmed">? Unconfirmed ID · ${p.idConfidence}%</span>`);
  else out.push(`<span class="badge">ID ${p.idConfidence}% sure</span>`);
  if (p.issues?.length) out.push(`<span class="badge attention">Needs attention</span>`);
  return out.join("");
}
// The same, with dog safety, for About this plant.
function badgesFull(p, sp) {
  const dog = dogSafety(p, sp);
  const t = TOX_INFO[dog.status] || TOX_INFO.check;
  const dogBadge = dog.status !== "not-listed" ? `<span class="badge ${t.cls}">${dog.status === "toxic" ? "⚠ " : ""}${t.label}</span>` : "";
  return `<div class="badges">${badgesHtml(p)}${dogBadge}</div>`;
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

// ---------- the card's pieces ----------
// Months as short runs: ["Apr", "May", "Jun", "Sep"] → "Apr–Jun, Sep". A run can wrap past December (Dec–Feb).
function monthRuns(months) {
  const set = new Set(months.map((m) => MONTHS.indexOf(m)).filter((i) => i >= 0));
  if (set.size === 12) return "All year";
  const starts = [...set].filter((i) => !set.has((i + 11) % 12)).sort((a, b) => a - b);
  return starts.map((a) => {
    let b = a;
    while (set.has((b + 1) % 12)) b = (b + 1) % 12;
    return a === b ? MONTHS[a] : `${MONTHS[a]}–${MONTHS[b]}`;
  }).join(", ");
}
const careOfType = (sp, type) => (sp.care || []).filter((c) => c.type === type);
const careLines = (list) => list.map((c) => `<li><span class="tag">${esc(monthRuns(c.months))}</span>${esc(c.text)}</li>`).join("");

// Water and Feed tiles: when that care comes round, and whether it's due in the month shown.
function careTile(sp, type, month) {
  const list = careOfType(sp, type);
  const months = [...new Set(list.flatMap((c) => c.months))];
  if (!months.length) return { value: "Not listed", sub: "No set times", now: false };
  const now = months.includes(MONTHS[month]);
  let next = null;
  for (let i = 1; i < 12 && next == null; i++) if (months.includes(MONTHS[(month + i) % 12])) next = (month + i) % 12;
  return { value: monthRuns(months), sub: now ? "Due this month" : `Next in ${MONTH_NAMES[next]}`, now };
}
const DOG_SHORT = { toxic: "Toxic", caution: "Caution", check: "Unknown", "not-listed": "Not listed", "non-toxic": "Safe" };

// The season strip: what the plant is doing each month, grouped into a few colours.
const STAGE_GROUP = {
  dormant: "rest", bare: "rest", stored: "rest", gone: "rest", "bare-flowerheads": "rest", "dormant-tan": "rest",
  emerging: "up", seedling: "up", leafing: "up", rosette: "up",
  foliage: "leaf", evergreen: "leaf", ferns: "leaf",
  bloom: "bloom", "aging-bloom": "bloom",
  fruit: "crop", harvest: "crop",
  "fall-color": "fade", yellowing: "fade", seedheads: "fade", spent: "fade", "frost-blackened": "fade",
};
const GROUP_NAMES = { rest: "Resting", up: "Coming up", leaf: "In leaf", bloom: "In bloom", crop: "Fruit & harvest", fade: "Fading" };
function seasonStrip(sp, month, seasonNow) {
  const year = MONTHS.map((m, i) => {
    const st = shownStateFor(sp, i, seasonNow);
    return { i, st, group: STAGE_GROUP[st] || "leaf", label: (STATE_TEXT[st] || [st])[0] };
  });
  const used = Object.keys(GROUP_NAMES).filter((g) => year.some((y) => y.group === g));
  return `
    <section class="cpanel glass seasonpanel" aria-labelledby="seasonTitle">
      <h3 class="eyebrow" id="seasonTitle">Its year</h3>
      <ol class="seasonstrip">${year.map((y) => `
        <li class="${y.i === month ? "on" : ""}" style="--sc:var(--st-${y.group})" aria-label="${MONTH_NAMES[y.i]}: ${esc(y.label)}${y.i === month ? " (shown now)" : ""}" title="${MONTH_NAMES[y.i]}: ${esc(y.label)}">
          <i></i><span aria-hidden="true">${MONTHS[y.i][0]}</span></li>`).join("")}</ol>
      <ul class="seasonkey" aria-hidden="true">${used.map((g) => `<li style="--sc:var(--st-${g})"><i></i>${GROUP_NAMES[g]}</li>`).join("")}</ul>
    </section>`;
}

// One care entry in the Now box, with its done circle when it's on this week's list.
const CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>`;
function nowCareLi(c, checkOffs, i) {
  const off = checkOffs?.get(c);
  const what = CARE_TYPES[c.type] || c.type;
  return `<li class="${off?.done ? "done" : ""}">
    ${off ? `<button type="button" class="cdone" role="checkbox" aria-checked="${off.done}" data-done="${i}" data-focus="done-${i}" aria-label="Done: ${esc(what)}">${CHECK}</button>` : `<span class="cdot" aria-hidden="true"></span>`}
    <span><span class="tag">${esc(what)}</span>${esc(c.text)}</span></li>`;
}

// Which sections are open (kept as you move between plants) and which tile's details are showing.
const openSecs = new Set();
let openTile = null;
const section = (id, title, body, { hidden = false } = {}) => `
    <details class="cpanel glass csec" data-sec="${id}" ${openSecs.has(id) ? "open" : ""} ${hidden ? "hidden" : ""}>
      <summary><span>${title}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6"/></svg></summary>
      <div class="csecbody">${body}</div>
    </details>`;

export function renderCard(sheet, { plant: p, species: sp, month, areaName, edit, hero, checkOffs, onToggle, onClose, onPhoto, onNotes, onChecks }) {
  // Keep what's typed in an open form, and the scroll position, when the same card redraws.
  const same = lastCardId === p.id;
  if (!same) { editing = null; openTile = null; }
  const typed = same ? { name: sheet.querySelector("#editName")?.value, kind: sheet.querySelector("#editKind")?.value } : {};
  const focusId = same && sheet.contains(document.activeElement) ? document.activeElement.id || document.activeElement.dataset.focus : null;
  const scroll = same ? sheet.scrollTop : 0;
  lastCardId = p.id;
  if (editing?.id === p.id) openSecs.add("about");
  const away = p.removed || p.finished; // not in the yard right now
  const [statusLabel, calendarSentence] = p.removed ? removedText(p) : p.finished ? finishedText(p) : stateText(sp, month, p.seasonNow);
  const statusSentence = !away && covers(p, month)
    ? `${calendarSentence} Marked ${seasonWords(p.seasonNow.state)} on ${dateText(p.season.on).replace(/, \d{4}$/, "")}, so this goes by what you saw rather than the usual calendar.`
    : calendarSentence;
  const now = away ? [] : careFor(sp, month);
  const later = restOfYear(sp, month);
  // Next: the first later month with care that isn't already in Now (a job running Oct–Nov isn't "next").
  const next = away ? null : later.map(({ month: mm, items }) => ({ month: mm, items: items.filter((c) => !now.includes(c)) })).find((x) => x.items.length);
  const dog = dogSafety(p, sp);
  const dogInfo = TOX_INFO[dog.status] || TOX_INFO.check;
  const dogCls = dog.status === "toxic" ? "toxic" : ["caution", "check"].includes(dog.status) ? "caution" : dog.status === "non-toxic" ? "safe" : "";
  const unsure = isUnconfirmed(p) || (!p.confirmedByOwner && p.idConfidence < 70);
  const title = p.name;
  const water = careTile(sp, "water", month), feed = careTile(sp, "feed", month);
  const pests = careOfType(sp, "pest");
  const tile = (id, label, t, cls = "") => `
        <button type="button" class="ctile glass ${cls}${t.now ? " now" : ""}" data-tile="${id}" data-focus="tile-${id}" aria-expanded="${openTile === id}" aria-controls="tileMore">
          <span class="eyebrow">${label}</span><b>${esc(t.value)}</b><span class="tsub">${esc(t.sub)}</span></button>`;
  const tileMore = (id) => id === "water" || id === "feed"
    ? `<ul class="tasks">${careLines(careOfType(sp, id)) || `<li>No ${id === "water" ? "watering" : "feeding"} listed for this plant.</li>`}</ul>`
    : id === "dog" ? `
        <div class="status">${esc(dogInfo.label)}</div>
        <p>${esc(dog.detail)}</p>
        ${dog.source ? `<p class="small">Source: ${link(dog.source)}</p>` : ""}` : "";
  const tileMoreCls = (id) => `cpanel glass tilemore${id === "dog" ? ` dog ${dogCls}` : ""}`;
  const heroImg = hero?.src ? `<img src="${photoUrl(hero.src)}" alt="">` : hero?.load ? `<img alt="" data-hero>` : "";
  const glow = hero?.src ? `style="background-image:url('${photoUrl(hero.src)}')"` : "";

  sheet.innerHTML = `
    <header class="chero${heroImg ? "" : " nophoto"}" style="--h:${hueOf(p.speciesId || p.name)}">
      ${heroImg ? `<button type="button" class="cheropic" data-hero-open aria-label="Open the photo of ${esc(title)}">${heroImg}</button>` : ""}
      <div class="cherotop">
        <button class="cround glass cardback" type="button" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg></button>
        ${onNotes ? `<button class="cround glass" type="button" data-addphoto aria-label="Add a photo of ${esc(title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg></button>` : ""}
      </div>
      <div class="cherotext">
        <h2 id="sheetTitle">${esc(title)}</h2>
        <p class="where">${esc(p.label)} · ${esc(areaName)}${sp.scientificName && sp.scientificName !== "unknown" ? ` · <i>${esc(sp.scientificName)}</i>` : ""}</p>
        <div class="badges">${badgesHtml(p)}${hero?.open?.length > 1 ? `<span class="badge">${hero.open.length} photos</span>` : ""}</div>
      </div>
    </header>

    <div class="cbody">
      <div class="cglow" ${glow} aria-hidden="true"></div>

      <section class="cpanel glass nowbox" style="--c:${seasonOf(month).color}" aria-labelledby="nowTitle">
        <h3 class="eyebrow" id="nowTitle">Now · ${MONTH_NAMES[month]}</h3>
        <div class="status">${esc(statusLabel)}</div>
        <p class="nowsentence">${esc(statusSentence)}</p>
        ${seasonHtml(p, sp, month, edit)}
        ${p.issues?.length ? `<ul class="issues">${p.issues.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
        ${now.length ? `<ul class="nowcare">${now.map((c, i) => nowCareLi(c, checkOffs, i)).join("")}</ul>` : away ? "" : `<p class="small">No care needed this month.</p>`}
        ${unsure && !away ? `<p class="small">Care shown is for the best guess. It depends on confirming the ID${p.alsoPossible?.length ? `. It could also be: ${esc(p.alsoPossible.join("; "))}` : ""}.</p>` : ""}
        ${p.removed && edit?.can ? `<button type="button" class="btn" data-edit="restore">Put it back in the yard</button>`
          : p.finished && edit?.can ? `<button type="button" class="btn" data-edit="unfinish">Bring it back</button>` : ""}
        ${next ? `<button type="button" class="nextline" data-next>
          <span class="eyebrow" style="--c:${seasonOf(next.month).color}">Next · ${MONTH_NAMES[next.month]}</span>
          <span>${esc(CARE_TYPES[next.items[0].type] || next.items[0].type)}: ${esc(firstSentence(next.items[0].text))}${next.items.length > 1 ? ` <span class="more">+${next.items.length - 1} more</span>` : ""}</span></button>` : ""}
      </section>

      <div class="ctiles">
        ${tile("water", "Water", water)}
        ${tile("feed", "Feed", feed)}
        ${tile("dog", "Dog safety", { value: DOG_SHORT[dog.status] || dogInfo.label, sub: dog.source ? sourceName(dog.source) : "No source yet" }, `dog ${dogCls}`)}
      </div>
      <div class="${tileMoreCls(openTile)}" id="tileMore" ${openTile ? "" : "hidden"}>${tileMore(openTile)}</div>

      ${seasonStrip(sp, month, p.seasonNow)}

      ${section("care", "Care all year", MONTHS.map((_, k) => (month + k) % 12).map((mm) => {
        const items = careFor(sp, mm);
        return items.length ? `<div class="monthblock"><h4>${MONTH_NAMES[mm]}${mm === month ? ` <span class="small">· now</span>` : ""}</h4><ul class="tasks">${items.map(taskLi).join("")}</ul></div>` : "";
      }).join("") || `<p class="small">No care listed for this plant.</p>`)}

      ${sp.cutFlower ? section("cut", "Cut flowers", `
        <p><b>When:</b> ${esc(sp.cutFlower.when)}</p>
        <p><b>How:</b> ${esc(sp.cutFlower.how)}</p>
        <p class="small">Confidence ${sp.cutFlower.confidence}/100: ${esc(sp.cutFlower.confidenceWhy)}${sp.cutFlower.source ? ` Source: ${link(sp.cutFlower.source)}` : ""}</p>`) : ""}

      ${section("pests", "Pests to watch", `
        ${pests.length ? `<ul class="tasks">${careLines(pests)}</ul>` : `<p class="small">No pests or diseases listed for this kind of plant.</p>`}
        <section class="notes" id="cardChecks" aria-labelledby="checksCardTitle" hidden></section>`)}

      ${section("notes", "Notes &amp; photos", `<section class="notes" id="cardNotes" aria-labelledby="notesTitle" hidden></section>`, { hidden: !onNotes })}

      ${section("about", "About this plant", `
        ${badgesFull(p, sp)}
        <p><b>ID:</b> ${p.confirmedByOwner ? "Confirmed." : `${p.idConfidence}% sure from photos.`}${p.alsoPossible?.length && !p.confirmedByOwner ? ` Also possible: ${esc(p.alsoPossible.join("; "))}.` : ""}</p>
        ${p.notes ? `<p>${esc(p.notes)}</p>` : ""}
        ${sp.notes ? `<p>${esc(sp.notes)}</p>` : ""}
        <p><b>Size:</b> ${esc(tallText(p, sp))}, ${esc(acrossText(p, sp))}${p.stems ? `, ${esc(stemsText(p.stems))}` : ""}.${p.width == null && p.height == null ? " A guess for this kind; enter your own in Edit mode." : ""}</p>
        ${sp.wildlife ? `<p><b>Wildlife value:</b> ${esc(sp.wildlife)}</p>` : ""}
        ${p.photos?.length ? `<div class="photos">${p.photos.map((ph, i) =>
          `<button type="button" data-photo="${i}" aria-label="Open photo ${i + 1}"><img src="${thumbUrl(ph)}" alt="Photo of ${esc(title)}" loading="lazy"></button>`).join("")}</div>` : ""}
        ${editHtml(p, edit)}
        <p class="small">Plant ID in data/plants.json: <code>${esc(p.id)}</code> · kind: <code>${esc(sp.id)}</code></p>`)}

      ${section("sources", "Sources", `
        <div class="conf"><b>${sp.confidence}/100</b><span class="small">${esc(sp.confidenceWhy)}</span></div>
        ${sp.sources?.length ? `<ul class="sources">${sp.sources.map((u) => `<li>${link(u)}</li>`).join("")}</ul>` : `<p class="small">No specific source for this general advice.</p>`}
        ${dog.source ? `<p class="small">Dog safety: ${link(dog.source)}</p>` : ""}`)}
    </div>
  `;
  sheet.hidden = false;
  onChecks?.(sheet.querySelector("#cardChecks"));
  onNotes?.(sheet.querySelector("#cardNotes"));
  sheet.scrollTop = scroll;
  sheet.querySelector(".cardback").onclick = onClose;
  sheet.querySelectorAll("[data-photo]").forEach((b) => (b.onclick = () => onPhoto(p.photos, Number(b.dataset.photo))));
  // A photo from the notes is fetched first; the soft colour behind the panels comes from it too.
  const heroEl = sheet.querySelector("img[data-hero]");
  if (heroEl) hero.load().then((url) => {
    if (!heroEl.isConnected) return;
    heroEl.src = url;
    sheet.querySelector(".cglow").style.backgroundImage = `url("${url}")`;
  }).catch(() => heroEl.closest(".chero")?.classList.add("nophoto"));
  sheet.querySelector("[data-hero-open]")?.addEventListener("click", () => onPhoto(hero.open, 0));
  sheet.querySelectorAll("details[data-sec]").forEach((d) => d.addEventListener("toggle", () => {
    if (d.open) openSecs.add(d.dataset.sec); else openSecs.delete(d.dataset.sec);
  }));
  const openSec = (id) => {
    const d = sheet.querySelector(`details[data-sec="${id}"]`);
    d.open = true;
    openSecs.add(id);
    return d;
  };
  const reveal = (el) => el?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  sheet.querySelector("[data-next]")?.addEventListener("click", () => reveal(openSec("care")));
  // A tile opens its details just below the row (one at a time).
  sheet.querySelectorAll("[data-tile]").forEach((b) => (b.onclick = () => {
    openTile = openTile === b.dataset.tile ? null : b.dataset.tile;
    sheet.querySelectorAll("[data-tile]").forEach((t) => t.setAttribute("aria-expanded", String(t.dataset.tile === openTile)));
    const more = sheet.querySelector("#tileMore");
    Object.assign(more, { className: tileMoreCls(openTile), innerHTML: tileMore(openTile), hidden: !openTile });
  }));
  // The camera button starts a new note with a photo, the same as "Add a note" then "Add a photo".
  sheet.querySelector("[data-addphoto]")?.addEventListener("click", () => {
    const d = openSec("notes");
    sheet.querySelector("#cardNotes [data-noteadd]")?.click();
    const pick = sheet.querySelector("#notePhoto");
    reveal(d);
    pick?.click();
  });
  sheet.querySelectorAll("[data-done]").forEach((b) => (b.onclick = () => {
    const off = checkOffs.get(now[Number(b.dataset.done)]);
    onToggle(off.keys, !off.done);
  }));
  if (focusId && !sheet.contains(document.activeElement)) {
    const f = sheet.querySelector(`#${CSS.escape(focusId)}`) || sheet.querySelector(`[data-focus="${CSS.escape(focusId)}"]`);
    f?.focus({ preventScroll: true });
    if (f?.tagName === "TEXTAREA") f.setSelectionRange(f.value.length, f.value.length);
  }
  if (!edit?.can) return;

  const redraw = (focus) => {
    renderCard(sheet, { plant: p, species: sp, month, areaName, edit, hero, checkOffs, onToggle, onClose, onPhoto, onNotes, onChecks });
    if (focus) sheet.querySelector(focus)?.focus();
  };
  const name = sheet.querySelector("#editName"), kind = sheet.querySelector("#editKind");
  if (name && typed.name != null) name.value = typed.name;
  if (kind && typed.kind != null) kind.value = typed.kind;
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
    sheet.scrollTop = 0; // back up to the new name
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
