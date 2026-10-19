// The Today screen: how many jobs are left this week, the jobs themselves as photo cards with a done circle, the
// other person's latest check-off, and the newest plant photos. Also the two panels it opens: Settings (the
// gear) and every photo ("All"). tasks.js works out the jobs; this file only draws them and hands taps back to
// main.js.

import { CARE_TYPES, esc, thumbUrl } from "./data.js";
import { openCount, parseYmd } from "./tasks.js";
import { SAVE_NOTE, footNote } from "./tasklist.js";

const plainName = (sp) => sp.commonName.replace(/\s*\([^)]*\)/g, "").trim();
const typeName = (t) => CARE_TYPES[t] || t;
// The start of a job's instructions: its first sentence, or two when the first is very short.
export function firstSentence(text) {
  const [one, two] = (text || "").match(/[^.!?]+[.!?]+/g) || [text || ""];
  return one.trim().length < 24 && two ? `${one.trim()} ${two.trim()}` : one.trim();
}
const CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>`;

// A soft colour for a plant with no photo, the same every time for the same kind of plant.
export function hueOf(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

// ---------- the job cards ----------
// One card per job still on this week's list (one-time jobs, then the weekly rounds), each with what its done
// circle checks off.
function jobCards(week, done) {
  const cards = week.jobs.map((j) => ({
    key: j.key, keys: j.plantKeys, title: plainName(j.sp),
    line: `${j.doneCount && !j.done ? `${j.doneCount} of ${j.plants.length} done · ` : ""}${firstSentence(j.care.text)}`,
    state: j.done ? "true" : j.doneCount ? "mixed" : "false",
    // the picture comes from a plant still to do, if any are
    plants: [...j.plants.filter((p, i) => !done[j.plantKeys[i]]), ...j.plants],
    label: `${typeName(j.care.type)}: ${j.sp.commonName}`,
  }));
  for (const r of week.rounds) {
    const doneN = r.items.filter((i) => i.done).length;
    const names = [...new Set(r.items.map((i) => plainName(i.sp)))];
    cards.push({
      key: `round:${r.id}`, keys: r.items.map((i) => i.key), title: r.name,
      line: `${doneN && doneN < r.items.length ? `${doneN} of ${r.items.length} done · ` : ""}${names.length > 2 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : names.join(" and ")}`,
      state: doneN === 0 ? "false" : doneN === r.items.length ? "true" : "mixed",
      plants: [...r.items.filter((i) => !i.done), ...r.items].flatMap((i) => i.plants),
      label: r.name,
    });
  }
  return cards;
}

// Done jobs move to the end, but only when Today is opened afresh: a card checked off just now stays where it is,
// so it doesn't jump out from under your finger.
let order = [];
let resortNext = true;
export function resortJobs() { resortNext = true; }
function ordered(cards) {
  if (resortNext) {
    resortNext = false;
    order = [...cards.filter((c) => c.state !== "true"), ...cards.filter((c) => c.state === "true")].map((c) => c.key);
  }
  const at = new Map(order.map((k, i) => [k, i]));
  return [...cards].sort((a, b) => (at.get(a.key) ?? 1e9) - (at.get(b.key) ?? 1e9));
}

// A plant's picture: its newest photo from its notes, else its first photo in plants.json, else null.
function pictureOf(plants, notePhotos) {
  for (const p of plants) if (notePhotos.has(p.id)) return { note: notePhotos.get(p.id) };
  for (const p of plants) if (p.photos?.length) return { src: thumbUrl(p.photos[0]) };
  return null;
}
function placeholder(plant, cls = "") {
  return `<span class="placeholder ${cls}" style="--h:${hueOf(plant?.speciesId || plant?.name || "")}"><span>${esc(plant?.name || "")}</span></span>`;
}
// An <img> for a photo: straight away for the garden's own photos, once fetched for photos from notes.
const imgTag = (pic, alt) => pic.src
  ? `<img src="${esc(pic.src)}" alt="${esc(alt)}" loading="lazy">`
  : `<img alt="${esc(alt)}" data-note-thumb="${esc(pic.note.photo)}">`;

function cardHtml(c, notePhotos) {
  const pic = pictureOf(c.plants, notePhotos);
  return `
    <li class="jobcard${c.state === "true" ? " done" : ""}">
      <button type="button" class="jobopen" data-open-job="${esc(c.key)}" aria-label="${esc(c.label)}. ${esc(c.line)}">
        ${pic ? imgTag(pic, "") : placeholder(c.plants[0], "big")}
        <span class="jobtext"><b>${esc(c.title)}</b><span>${esc(c.line)}</span></span>
      </button>
      <button type="button" class="jobdone" role="checkbox" aria-checked="${c.state}" data-keys="${esc(c.keys.join(" "))}" data-f="d:${esc(c.key)}" aria-label="Done: ${esc(c.label)}">${CHECK}</button>
    </li>`;
}

// ---------- the other person's latest check-off ----------
function partnerLine(o) {
  const names = o.partners || [];
  if (!names.length) return "";
  // The most recent check-off someone else made that's still checked off. Check-offs only keep the day.
  let last = null;
  for (const [key, who] of Object.entries(o.doneBy || {})) {
    const on = o.done[key];
    if (on && (!last || on > last.on)) last = { key, who, on };
  }
  const who = last?.who || names[0];
  const circle = `<span class="initial" aria-hidden="true">${esc(who.trim().charAt(0).toUpperCase() || "?")}</span>`;
  if (!last) return `${circle}<span class="ptext"><b>Nothing checked off by ${esc(who)} lately</b><span>Jobs ${esc(who)} checks off show here</span></span>`;
  const [kind, item, , plantId] = last.key.split("|");
  const [speciesId, type] = item.split(":");
  const sp = o.species.get(speciesId);
  const plant = plantId && o.plantsById.get(plantId);
  const what = `${sp ? plainName(sp) : "a plant"}${plant?.label?.startsWith("#") ? ` ${plant.label}` : ""}`;
  const day = parseYmd(last.on), n = Math.round((o.today - day) / 86400000);
  const when = n <= 0 ? "Today" : n === 1 ? "Yesterday" : n < 7 ? day.toLocaleDateString("en-US", { weekday: "long" }) : day.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const job = kind === "w" ? `${typeName(type)} (weekly)` : typeName(type);
  return `${circle}<span class="ptext"><b>${esc(who)} checked off ${esc(what)}</b><span>${esc(job)} · ${esc(when)}</span></span>`;
}

// ---------- the photos ----------
// Every plant photo, newest first: photos from notes (dated), then the garden's own photos from plants.json,
// newest first by the camera's running number.
export function allPhotos(plants, notes) {
  const named = new Map(plants.map((p) => [p.id, p]));
  const out = notes.filter((n) => named.has(n.plantId)).map((n) => ({ note: n, plant: named.get(n.plantId) }));
  const seen = new Set();
  const own = [];
  for (const p of plants) for (const ph of p.photos || []) if (!seen.has(ph)) { seen.add(ph); own.push({ src: ph, plant: p }); }
  const num = (s) => Number(/(\d+)\D*$/.exec(s)?.[1] || 0);
  own.sort((a, b) => num(b.src) - num(a.src));
  return [...out, ...own];
}
const tileImg = (ph) => imgTag(ph.note ? { note: ph.note } : { src: thumbUrl(ph.src) }, ph.plant.name);
// What the photo viewer needs for each photo.
const viewerItems = (list, load) => list.map((ph) => (ph.note
  ? { caption: `${ph.plant.name} · ${ph.note.date}${ph.note.by ? ` · ${ph.note.by}` : ""}`, load: () => load(ph.note.photo) }
  : ph.src));

// Fills in the photos from notes, which are fetched while signed in.
function loadNoteThumbs(el, thumb) {
  el.querySelectorAll("img[data-note-thumb]").forEach((img) => {
    thumb(img.dataset.noteThumb).then((url) => { img.src = url; }).catch(() => img.classList.add("missing"));
  });
}

// ---------- the screen ----------
// o: { week, today, done, doneBy, partners, species, plantsById, plants (in the yard), notePhotos (newest first),
// checks (whether Photo check is available), thumb(photo) and full(photo) for photos from notes,
// onToggle(keys, on), onOpenJob(key), onWeek(), onPhoto(items, i), onAllPhotos(), onChecks() }
export function renderToday(o) {
  const $ = (id) => document.getElementById(id);
  const left = openCount(o.week);
  $("todayCount").textContent = left;
  $("todayCountLabel").innerHTML = `${left === 1 ? "job" : "jobs"}<br>today`;
  $("tasksBtn").setAttribute("aria-label", `${left} ${left === 1 ? "job" : "jobs"} left today. Open this week's list`);

  // The newest note photo for each plant.
  const newest = new Map();
  for (const n of o.notePhotos) if (!newest.has(n.plantId)) newest.set(n.plantId, n);

  const strip = $("todayJobs");
  const scroll = strip.querySelector(".jobstrip")?.scrollLeft || 0;
  const focusKey = strip.contains(document.activeElement) ? document.activeElement?.dataset?.f : null;
  const cards = ordered(jobCards(o.week, o.done));
  strip.innerHTML = cards.length
    ? `<ul class="jobstrip" aria-label="Today's jobs">${cards.map((c) => cardHtml(c, newest)).join("")}
        <li class="jobcard more"><button type="button" class="jobopen" data-week>See the whole week<span>Frost dates, heads-ups and what's coming up</span></button></li></ul>`
    : `<div class="nojobs glass"><b>Nothing to do this week</b><button type="button" class="linkbtn" data-week>See what's coming up</button></div>`;
  const row = strip.querySelector(".jobstrip");
  if (row) row.scrollLeft = scroll;
  if (focusKey) strip.querySelector(`[data-f="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  loadNoteThumbs(strip, o.thumb);
  strip.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.keys) return o.onToggle(b.dataset.keys.split(" "), b.getAttribute("aria-checked") !== "true");
    if (b.dataset.openJob) return o.onOpenJob(b.dataset.openJob);
    if (b.hasAttribute("data-week")) return o.onWeek();
  };

  const partner = partnerLine(o);
  $("todayPartner").innerHTML = partner;
  $("todayPartner").hidden = !partner;

  const photos = allPhotos(o.plants, o.notePhotos).slice(0, 4);
  $("todayPhotos").innerHTML = `
    <div class="photoshead">
      <h2>Latest photos</h2>
      ${o.checks ? `<button type="button" class="photocheck" id="checksBtn" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>Photo check</button>` : ""}
      <button type="button" class="linkbtn" data-all aria-haspopup="dialog">All</button>
    </div>
    ${photos.length ? `<div class="phototiles">${photos.map((ph, i) => `<button type="button" data-photo="${i}" aria-label="Photo of ${esc(ph.plant.name)}">${tileImg(ph)}</button>`).join("")}</div>`
      : `<p class="small">No photos yet. Add one from a plant's card.</p>`}`;
  loadNoteThumbs($("todayPhotos"), o.thumb);
  $("todayPhotos").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-all")) return o.onAllPhotos();
    if (b.id === "checksBtn") return o.onChecks();
    if (b.dataset.photo) return o.onPhoto(viewerItems(photos, o.full), Number(b.dataset.photo));
  };
}

// ---------- every photo ("All") ----------
export function renderAllPhotos(panel, { plants, notePhotos, thumb, full, onPhoto, onPlant, onClose }) {
  const photos = allPhotos(plants, notePhotos);
  panel.innerHTML = `
    <div class="listhead">
      <div class="row"><h2 id="photosTitle">Photos <span class="small">${photos.length}</span></h2><button class="close" type="button" aria-label="Close photos">✕</button></div>
    </div>
    <div class="tlist">
      <ul class="photogrid">${photos.map((ph, i) => `
        <li><button type="button" class="pgpic" data-photo="${i}" aria-label="Open photo of ${esc(ph.plant.name)}">${tileImg(ph)}</button>
          <button type="button" class="pgname" data-plant="${esc(ph.plant.id)}">${esc(ph.plant.name)}</button></li>`).join("")}</ul>
    </div>`;
  panel.hidden = false;
  loadNoteThumbs(panel, thumb);
  panel.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.classList.contains("close")) return onClose();
    if (b.dataset.photo) return onPhoto(viewerItems(photos, full), Number(b.dataset.photo));
    if (b.dataset.plant) return onPlant(b.dataset.plant);
  };
  panel.querySelector(".close").focus({ preventScroll: true });
}

// ---------- Settings (the gear) ----------
// The account check-offs are saved under (signing in and out), who the garden is shared with, and where things
// are being saved right now.
const settingsForm = { busy: false, error: "" };
export function renderSettings(panel, o) {
  const notes = o.cloud ? SAVE_NOTE.cloud : SAVE_NOTE.mac;
  const signedIn = o.cloud && o.account && o.saveStatus !== "signed-out";
  const typed = { email: panel.querySelector("#setEmail")?.value, password: panel.querySelector("#setPassword")?.value };
  panel.innerHTML = `
    <div class="listhead">
      <div class="row"><h2 id="settingsTitle">Settings</h2><button class="close" type="button" aria-label="Close settings">✕</button></div>
    </div>
    <div class="tlist settings">
      <h3>Account</h3>
      ${!o.cloud ? `<p>${esc(footNote(o, notes))}</p>`
        : signedIn ? `
          <div class="setrow"><span>Signed in as</span><b>${esc(o.account)}</b></div>
          ${o.sharedWith?.length ? `<div class="setrow"><span>Sharing the garden with</span><b>${o.sharedWith.map(esc).join(" and ")}</b></div>` : ""}
          <button type="button" class="btn" data-signout>Sign out</button>`
        : `
          <form class="signin" data-signin>
            <p class="stitle">Sign in to save your check-offs</p>
            <p>${esc(notes["signed-out"])}</p>
            <label for="setEmail">Email</label>
            <input id="setEmail" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" required>
            <label for="setPassword">Password</label>
            <input id="setPassword" type="password" autocomplete="current-password" required>
            <button type="submit" class="btn" ${settingsForm.busy ? "disabled" : ""}>${settingsForm.busy ? "Signing in…" : "Sign in"}</button>
            ${settingsForm.error ? `<p class="signinerror" role="alert">${esc(settingsForm.error)}</p>` : ""}
          </form>`}
      ${o.cloud && signedIn ? `<h3>Saving</h3><p>${esc(footNote(o, notes))}</p>` : ""}
    </div>`;
  panel.hidden = false;
  if (typed.email != null && panel.querySelector("#setEmail")) {
    panel.querySelector("#setEmail").value = typed.email;
    panel.querySelector("#setPassword").value = typed.password || "";
  }
  panel.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.classList.contains("close")) return o.onClose();
    if (b.hasAttribute("data-signout")) return o.onSignOut();
  };
  const form = panel.querySelector("[data-signin]");
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    if (settingsForm.busy) return;
    Object.assign(settingsForm, { busy: true, error: "" });
    o.onRedraw();
    try {
      await o.onSignIn(panel.querySelector("#setEmail").value, panel.querySelector("#setPassword").value);
    } catch (err) {
      settingsForm.error = err.message;
    }
    settingsForm.busy = false;
    o.onRedraw();
  };
}
