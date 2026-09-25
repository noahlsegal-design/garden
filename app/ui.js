// Everything on screen that isn't the 3D yard: month buttons, the plant card, the all-plants list, the photo viewer.

import {
  MONTHS, MONTH_NAMES, seasonOf, isUnconfirmed, dogSafety, isDogRisk, TOX_INFO,
  stateText, careFor, restOfYear, CARE_TYPES, sourceName, photoUrl, thumbUrl, esc,
} from "./data.js";

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
  if (p.confirmedByOwner) out.push(`<span class="badge safe">✓ Confirmed by you</span>`);
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
// A plant marked "finished" in plants.json (say, a crop done for the season) is off the yard and out of This week.
const finishedText = (p) => {
  const [y, m, d] = p.finished.split("-").map(Number);
  return ["Finished for the season", `Marked finished on ${MONTH_NAMES[m - 1]} ${d}, ${y}, so it's off the 3D yard and out of This week. To bring it back, delete its "finished" line in data/plants.json.`];
};

export function renderCard(sheet, { plant: p, species: sp, month, areaName, onClose, onPhoto }) {
  const [statusLabel, statusSentence] = p.finished ? finishedText(p) : stateText(sp, month);
  const now = p.finished ? [] : careFor(sp, month);
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

    ${p.photos?.length ? `<div class="photos">${p.photos.map((ph, i) =>
      `<button type="button" data-photo="${i}" aria-label="Open photo ${i + 1}"><img src="${thumbUrl(ph)}" alt="Photo of ${esc(title)}" loading="lazy"></button>`).join("")}</div>` : ""}

    <div class="box now" style="--c:${seasonOf(month).color}">
      <h3>Right now · ${MONTH_NAMES[month]}</h3>
      <div class="status">${esc(statusLabel)}</div>
      <p>${esc(statusSentence)}</p>
      ${p.issues?.length ? `<ul class="issues">${p.issues.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
      ${now.length ? `<ul class="tasks">${now.map(taskLi).join("")}</ul>` : p.finished ? "" : `<p class="small">No care needed this month.</p>`}
    </div>

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
      <p><b>ID:</b> ${p.confirmedByOwner ? "Confirmed by you." : `${p.idConfidence}% sure from photos.`}${p.alsoPossible?.length ? ` Also possible: ${esc(p.alsoPossible.join("; "))}.` : ""}</p>
      ${p.notes ? `<p>${esc(p.notes)}</p>` : ""}
      ${sp.notes ? `<p>${esc(sp.notes)}</p>` : ""}
      <p class="small">Plant ID in data/plants.json: <code>${esc(p.id)}</code> · kind: <code>${esc(sp.id)}</code></p>
    </details>

    <details>
      <summary>Sources & confidence</summary>
      <div class="conf"><b>${sp.confidence}/100</b><span class="small">${esc(sp.confidenceWhy)}</span></div>
      ${sp.sources?.length ? `<ul class="sources">${sp.sources.map((u) => `<li>${link(u)}</li>`).join("")}</ul>` : `<p class="small">No specific source for this general advice.</p>`}
    </details>
  `;
  sheet.hidden = false;
  sheet.scrollTop = 0;
  sheet.querySelector(".close").onclick = onClose;
  sheet.querySelectorAll("[data-photo]").forEach((b) => (b.onclick = () => onPhoto(p.photos, Number(b.dataset.photo))));
}

// ---------- all-plants list ----------
export function renderList(panel, { plants, species, areaNames, areaOrder, month, filters, onFilters, onPick, onShowInYard, onClose }) {
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
            <span class="pstate">${esc(p.finished ? "Finished" : stateText(sp, month)[0])}</span>
            ${b.length ? `<span class="pbadges">${b.join("")}</span>` : ""}
          </button></li>`;
        }).join("")}</ul>`).join("") : `<p class="empty">No plants match. Try clearing the filters.</p>`}
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
}

// ---------- photo viewer ----------
export function openLightbox(photos, start) {
  const box = $("lightbox");
  let i = start;
  const prevFocus = document.activeElement;
  const draw = () => {
    box.innerHTML = `
      <div class="lbbar"><span>Photo ${i + 1} of ${photos.length} · ${esc(photos[i].split("/").pop())}</span><button type="button" id="lbClose" aria-label="Close photo">✕</button></div>
      <div class="lbimg"><img src="${photoUrl(photos[i])}" alt="Garden photo ${i + 1}"></div>
      <div class="lbnav" ${photos.length > 1 ? "" : "hidden"}><button type="button" id="lbPrev" aria-label="Previous photo">‹ Prev</button><button type="button" id="lbNext" aria-label="Next photo">Next ›</button></div>`;
    box.querySelector("#lbClose").onclick = close;
    box.querySelector("#lbPrev").onclick = () => { i = (i - 1 + photos.length) % photos.length; draw(); };
    box.querySelector("#lbNext").onclick = () => { i = (i + 1) % photos.length; draw(); };
    box.querySelector("#lbClose").focus();
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
