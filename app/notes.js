// Each plant's notes and photos ("June 12: thrips on dahlia #9"), shown on its card newest first with who added
// them. They're saved to the shared garden in Supabase (cloud.js), the photos in a private storage folder.
//
// Photos are shrunk on the phone before they're sent: about 1600 px on the long side, plus a small copy for the
// card. Redrawing a photo this way keeps only its pixels, so its location and other camera details are left
// behind. A note saved with no signal waits on the phone (with its photo) and is sent once it's back online.

import { MONTH_NAMES, esc } from "./data.js";

export const PHOTO_PX = 1600;
export const THUMB_PX = 400;
const PHOTO_QUALITY = 0.82, THUMB_QUALITY = 0.72;
const MAX_PHOTO_BYTES = 1900000; // the storage folder takes up to 2 MB a file
export const FREE_BYTES = 1024 ** 3; // the free plan's 1 GB of storage
const FULL_BYTES = 900 * 1024 ** 2; // stop adding photos here, well before the limit
const SHOW_FIRST = 5; // older notes fold away behind "Show older notes"

// ---------- shrinking a photo ----------
// Reads a picture file the way the browser shows it (turned the right way up), then redraws it smaller as a
// fresh JPEG with nothing but the picture in it.
async function readPicture(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth) throw new Error("empty");
    return img;
  } catch {
    throw new Error("This photo couldn't be opened here. Try taking it again, or pick a JPEG or PNG.");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
const sizeOf = (src) => [src.naturalWidth || src.width, src.naturalHeight || src.height];
function drawScaled(src, longest) {
  const [w, h] = sizeOf(src);
  const k = Math.min(1, longest / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#fff"; // see-through parts of a PNG come out white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}
// Shrinking in two steps looks smoother than one big jump. The first step stays small enough for phones, which
// can't hold very large canvases.
function shrinkTo(src, longest) {
  const [w, h] = sizeOf(src);
  return drawScaled(Math.max(w, h) > longest * 2 ? drawScaled(src, longest * 2) : src, longest);
}
const jpeg = (canvas, quality) => new Promise((ok, no) =>
  canvas.toBlob((b) => (b ? ok(b) : no(new Error("The photo couldn't be shrunk on this device."))), "image/jpeg", quality));

export async function shrinkPhoto(file) {
  const img = await readPicture(file);
  const big = shrinkTo(img, PHOTO_PX);
  let photo = await jpeg(big, PHOTO_QUALITY);
  for (let q = PHOTO_QUALITY - 0.12; photo.size > MAX_PHOTO_BYTES && q > 0.4; q -= 0.12) photo = await jpeg(big, q);
  const thumb = await jpeg(shrinkTo(big, THUMB_PX), THUMB_QUALITY);
  return { photo, thumb, w: big.width, h: big.height };
}

// ---------- notes waiting on this device ----------
// A note is kept here (with its photos) from the moment it's saved until Supabase has it. The browser's
// database holds pictures; if it isn't available, notes wait in memory until the page closes.
export function memoryOutbox() {
  const items = new Map();
  return {
    all: async () => [...items.values()],
    put: async (item) => { items.set(item.id, item); },
    remove: async (id) => { items.delete(id); },
  };
}
export function deviceOutbox(name = "garden-notes") {
  const fallback = memoryOutbox();
  let db = null;
  const open = () => (db ??= new Promise((ok, no) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("waiting", { keyPath: "id" });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => no(req.error);
  }));
  const run = async (mode, fn) => {
    const store = await open();
    return new Promise((ok, no) => {
      const t = store.transaction("waiting", mode);
      const req = fn(t.objectStore("waiting"));
      t.oncomplete = () => ok(req.result);
      t.onerror = () => no(t.error);
    });
  };
  const either = (fn, backup) => async (...args) => {
    try { if (globalThis.indexedDB) return await fn(...args); } catch { /* private browsing, or storage turned off */ }
    return backup(...args);
  };
  return {
    all: either(async () => [...(await run("readonly", (s) => s.getAll())), ...(await fallback.all())], fallback.all),
    put: either((item) => run("readwrite", (s) => s.put(item)), fallback.put),
    remove: either(async (id) => { await fallback.remove(id); return run("readwrite", (s) => s.delete(id)); }, fallback.remove),
  };
}

// A new note's id. (crypto.randomUUID only exists on https pages, and a phone may open the Mac copy over Wi-Fi.)
export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// "June 12", with the year when it isn't this year's.
export function noteDate(day, today) {
  const [y, m, d] = day.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}${String(y) !== today.slice(0, 4) ? `, ${y}` : ""}`;
}
// Newest first: by the day each note is about, then by when it was added.
export const newestFirst = (a, b) => b.date.localeCompare(a.date) || String(b.at || "").localeCompare(String(a.at || ""));
export const megabytes = (bytes) => (bytes < 1024 ** 2 ? "under 1 MB" : `${Math.round(bytes / 1024 ** 2)} MB`);

const WHY = {
  offline: "Can't reach your garden account right now.",
  "signed-out": "Sign in under This week to see and add notes and photos.",
  "not-member": "This account isn't in the garden yet, so it can't see or add notes.",
  setup: "Notes and photos need one more Supabase step: run supabase/setup.sql again in the SQL Editor.",
  "too-big": "That photo is too big to save. Try another one.",
};
const waitText = (n) => (n.status === "sending" ? "Saving…" : n.status === "offline" ? "Waiting for a connection, it'll save by itself" : n.status ? `Not saved yet: ${WHY[n.status] || "try again later."}` : "Waiting to save");

// ---------- the log ----------
// backend: { list(plantId), add(note, photo, thumb), remove(note), photo(name), keepPhoto(name, blob), use(), me() }
// (cloudBackend's notes half in cloud.js, or a pretend one in the tests). today() gives "YYYY-MM-DD".
export function createNotes({ backend, today, outbox = deviceOutbox(), onPhoto = () => {}, shrink = shrinkPhoto, thumbOf = (p) => p.replace(/\.jpg$/, "-thumb.jpg") }) {
  const lists = new Map(); // plantId -> { notes, status: "loading" | "saved" | a reason it couldn't load, at }
  let waiting = [];        // notes on this device that Supabase doesn't have yet, each with its photos
  const draft = { plantId: null, date: "", body: "", pic: null, preparing: false, error: "", use: null };
  const view = { el: null, plantId: null, access: null, more: new Set(), asking: null, problem: {} };
  let flushing = false;
  let myName = ""; // the name on your own notes, for the ones still waiting on this device

  const ready = outbox.all().then((items) => {
    waiting = items.map((n) => ({ ...n, status: "" }));
    draw();
    flush();
  }).catch(() => {});
  if (typeof addEventListener === "function") addEventListener("online", () => refresh());

  const notesFor = (plantId) => [...waiting.filter((n) => n.plantId === plantId), ...(lists.get(plantId)?.notes || [])].sort(newestFirst);

  async function load(plantId, force = false) {
    const had = lists.get(plantId);
    if (had && (had.status === "loading" || (!force && had.status === "saved" && Date.now() - had.at < 30000))) return;
    lists.set(plantId, { notes: had?.notes || [], status: "loading", at: Date.now() });
    try {
      lists.set(plantId, { notes: await backend.list(plantId), status: "saved", at: Date.now() });
      if (!myName) backend.me?.().then((name) => { myName = name; draw(); }).catch(() => {});
    } catch (err) {
      lists.set(plantId, { notes: had?.notes || [], status: err.status || "offline", at: Date.now() });
    }
    draw();
  }

  // Sends the notes waiting on this device, oldest first, including any added while it's sending. Stops at the
  // first one that can't go yet.
  async function flush() {
    await ready;
    if (flushing || !waiting.length) return;
    flushing = true;
    const tried = new Set();
    try {
      for (;;) {
        const n = waiting.filter((w) => !tried.has(w)).sort((a, b) => String(a.at).localeCompare(String(b.at)))[0];
        if (!n) break;
        tried.add(n);
        n.status = "sending";
        draw();
        try {
          const saved = await backend.add(n, n.photoBlob, n.thumbBlob);
          if (n.photo) { backend.keepPhoto(n.photo, n.photoBlob); backend.keepPhoto(thumbOf(n.photo), n.thumbBlob); }
          waiting = waiting.filter((w) => w !== n);
          await outbox.remove(n.id).catch(() => {});
          const list = lists.get(n.plantId);
          if (list && !list.notes.some((x) => x.id === saved.id)) list.notes = [saved, ...list.notes];
          if (list && list.status !== "saved" && n.plantId === view.plantId) load(n.plantId, true); // connected again
          draw();
        } catch (err) {
          n.status = err.status || "offline";
          draw();
          if (n.status !== "too-big") break; // a photo that can never go is skipped; the rest wait for a connection
        }
      }
    } finally {
      flushing = false;
    }
  }

  // Keeps a new note on this device straight away, then sends it. pic is a shrunk photo from shrinkPhoto().
  async function add({ plantId, date, body, pic = null }) {
    body = (body || "").trim().slice(0, 2000);
    if (!plantId || (!body && !pic)) return null;
    const id = newId();
    const note = {
      id, plantId, date: date || today(), body, at: new Date().toISOString(), by: "", mine: true,
      photo: pic ? `${id}.jpg` : null, w: pic?.w || null, h: pic?.h || null,
      bytes: pic ? pic.photo.size + pic.thumb.size : 0, photoBlob: pic?.photo || null, thumbBlob: pic?.thumb || null, status: "",
    };
    if (pic?.url) note.thumbUrl = pic.url;
    waiting.push(note);
    draw();
    const { thumbUrl, status, ...kept } = note;
    await outbox.put(kept).catch(() => {});
    flush();
    return note;
  }

  async function remove(n) {
    view.asking = null;
    if (waiting.includes(n)) {
      waiting = waiting.filter((w) => w !== n);
      await outbox.remove(n.id).catch(() => {});
      return draw();
    }
    view.problem[n.id] = "Deleting…";
    draw();
    try {
      await backend.remove(n);
      const list = lists.get(n.plantId);
      if (list) list.notes = list.notes.filter((x) => x.id !== n.id);
      delete view.problem[n.id];
    } catch (err) {
      view.problem[n.id] = `Couldn't delete it. ${WHY[err.status] || WHY.offline}`;
    }
    draw();
  }

  async function pickPhoto(file) {
    if (!file) return;
    Object.assign(draft, { preparing: true, error: "" });
    draw();
    try {
      const pic = await shrink(file);
      const use = draft.use || (await backend.use().catch(() => null));
      if (use && use.bytes + pic.photo.size + pic.thumb.size > FULL_BYTES) {
        throw new Error(`Photo storage is nearly full (${megabytes(use.bytes)} of the free 1 GB), so this photo wasn't added. Delete some old photos first, or save the note without one.`);
      }
      if (draft.pic) URL.revokeObjectURL(draft.pic.url);
      draft.pic = { ...pic, url: URL.createObjectURL(pic.thumb) };
      draft.use = use;
    } catch (err) {
      draft.error = err.message;
    }
    draft.preparing = false;
    draw();
  }

  // Coming back to the app or back online: fetch the latest notes (the other person may have added some) and
  // send any that are waiting.
  function refresh() {
    if (view.plantId && view.access?.can) load(view.plantId, true);
    flush();
  }

  // ---------- drawing the card's section ----------
  function picHtml(n) {
    if (!n.photo) return "";
    const ratio = n.w && n.h ? ` style="aspect-ratio:${n.w} / ${n.h}"` : "";
    return `<button type="button" class="notepic" data-pic="${esc(n.id)}" aria-label="Open the photo from ${esc(noteDate(n.date, today()))}"${ratio}><img alt="" data-thumb="${esc(n.id)}"></button>`;
  }
  function noteHtml(n) {
    const isWaiting = waiting.includes(n);
    const who = n.by || (n.mine ? myName || "you" : "");
    const asking = view.asking === n.id;
    return `<li class="note${isWaiting ? " waiting" : ""}">
      <div class="notemeta"><b>${esc(noteDate(n.date, today()))}</b>${who ? `<span>· ${esc(who)}</span>` : ""}
        ${asking ? "" : `<button type="button" class="linkbtn inline" data-del="${esc(n.id)}" aria-label="Delete the note from ${esc(noteDate(n.date, today()))}">Delete</button>`}</div>
      ${asking ? `<div class="noteask" role="group" aria-label="Delete this note?"><span>Delete this note${n.photo ? " and its photo" : ""}?</span>
        <button type="button" class="btn danger" data-yes="${esc(n.id)}">Delete</button><button type="button" class="linkbtn" data-keep>Keep</button></div>` : ""}
      ${n.body ? `<p class="notebody">${esc(n.body)}</p>` : ""}
      ${picHtml(n)}
      ${isWaiting ? `<p class="notewait">${esc(waitText(n))}</p>` : ""}
      ${view.problem[n.id] ? `<p class="notewait" role="status">${esc(view.problem[n.id])}</p>` : ""}
    </li>`;
  }
  function formHtml() {
    const d = draft;
    const usage = d.use ? `<p class="small">The garden has ${d.use.count} photo${d.use.count === 1 ? "" : "s"}, using ${megabytes(d.use.bytes)} of the free 1 GB.</p>` : "";
    return `<form class="editform noteform" data-noteform>
      <p class="stitle">New note</p>
      <label for="noteDate">Day</label>
      <input id="noteDate" type="date" value="${esc(d.date)}" max="${esc(today())}" required>
      <label for="noteBody">What did you see or do?</label>
      <textarea id="noteBody" rows="3" maxlength="2000" placeholder="Thrips on the lower leaves, sprayed with soapy water">${esc(d.body)}</textarea>
      <div class="notepick">
        ${d.preparing ? `<p class="small" role="status">Getting the photo ready…</p>`
          : d.pic ? `<img src="${d.pic.url}" alt="The photo for this note"><button type="button" class="linkbtn" data-nophoto>Remove photo</button>`
          : `<label class="pill"><input type="file" accept="image/*" id="notePhoto" class="offscreen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Add a photo</label>`}
      </div>
      ${d.error ? `<p class="savewarn" role="alert">${esc(d.error)}</p>` : ""}
      <p class="small">Photos are made smaller on this phone and their location is removed before they're saved. Only people in the garden can see them.</p>
      ${usage}
      <div class="formbtns"><button class="btn" type="submit" ${(d.body.trim() || d.pic) && !d.preparing ? "" : "disabled"}>Save note</button><button class="linkbtn" type="button" data-notecancel>Cancel</button></div>
    </form>`;
  }

  function draw() {
    const el = view.el;
    if (!el?.isConnected) return;
    const { plantId, access } = view;
    el.hidden = !access;
    if (!access) return void (el.innerHTML = "");
    const focusId = el.contains(document.activeElement) ? document.activeElement.id : null;
    const list = lists.get(plantId);
    const notes = access.can ? notesFor(plantId) : [];
    const writing = draft.plantId === plantId;
    const showAll = view.more.has(plantId);
    const shown = showAll ? notes : notes.slice(0, SHOW_FIRST);
    const why = !access.can ? access.note || WHY["signed-out"] : list && list.status !== "saved" && list.status !== "loading" ? WHY[list.status] || WHY.offline : "";
    el.innerHTML = `
      <div class="noteshead">
        <h3 id="notesTitle">Notes and photos${notes.length ? ` <span>(${notes.length})</span>` : ""}</h3>
        ${access.can && !writing ? `<button type="button" class="pill" data-noteadd><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Add a note</button>` : ""}
      </div>
      ${why ? `<p class="small">${esc(why)}</p>` : ""}
      ${writing ? formHtml() : ""}
      ${shown.length ? `<ol class="notelist">${shown.map(noteHtml).join("")}</ol>`
        : access.can && !writing && list?.status === "saved" ? `<p class="small">Nothing yet. Add what you notice, like pests, first blooms or what you did, and a photo.</p>`
        : access.can && list?.status === "loading" && !writing ? `<p class="small">Loading notes…</p>` : ""}
      ${notes.length > SHOW_FIRST ? `<button type="button" class="linkbtn" data-notemore>${showAll ? "Show fewer" : `Show ${notes.length - SHOW_FIRST} older note${notes.length - SHOW_FIRST === 1 ? "" : "s"}`}</button>` : ""}`;
    wire(el, shown);
    if (focusId) {
      const f = el.querySelector(`#${CSS.escape(focusId)}`);
      f?.focus({ preventScroll: true });
      if (f?.tagName === "TEXTAREA") f.setSelectionRange(f.value.length, f.value.length);
    }
  }

  function wire(el, shown) {
    const byId = new Map(shown.map((n) => [n.id, n]));
    el.querySelector("[data-noteadd]")?.addEventListener("click", () => {
      Object.assign(draft, { plantId: view.plantId, date: today(), body: "", pic: null, error: "", use: null });
      draw();
      el.querySelector("#noteBody")?.focus();
      backend.use().then((use) => { if (draft.plantId === view.plantId) { draft.use = use; draw(); } }).catch(() => {});
    });
    el.querySelector("[data-notemore]")?.addEventListener("click", () => {
      view.more.has(view.plantId) ? view.more.delete(view.plantId) : view.more.add(view.plantId);
      draw();
    });
    const form = el.querySelector("[data-noteform]");
    if (form) {
      const body = form.querySelector("#noteBody"), date = form.querySelector("#noteDate"), save = form.querySelector("[type=submit]");
      body.oninput = () => { draft.body = body.value; save.disabled = !(draft.body.trim() || draft.pic) || draft.preparing; };
      date.onchange = () => { draft.date = date.value || today(); };
      form.querySelector("#notePhoto")?.addEventListener("change", (e) => pickPhoto(e.target.files?.[0]));
      form.querySelector("[data-nophoto]")?.addEventListener("click", () => { URL.revokeObjectURL(draft.pic.url); draft.pic = null; draw(); });
      form.querySelector("[data-notecancel]").onclick = () => {
        if (draft.pic) URL.revokeObjectURL(draft.pic.url);
        Object.assign(draft, { plantId: null, body: "", pic: null, error: "", use: null });
        draw();
      };
      form.onsubmit = (e) => {
        e.preventDefault();
        const { plantId, date, body, pic } = draft;
        Object.assign(draft, { plantId: null, body: "", pic: null, error: "", use: null });
        add({ plantId, date, body, pic });
      };
    }
    el.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { view.asking = b.dataset.del; draw(); el.querySelector("[data-keep]")?.focus(); }));
    el.querySelector("[data-keep]")?.addEventListener("click", () => { view.asking = null; draw(); });
    el.querySelectorAll("[data-yes]").forEach((b) => (b.onclick = () => remove(byId.get(b.dataset.yes))));
    // Small copies first; the full-size photo only when one is opened.
    const withPhotos = shown.filter((n) => n.photo);
    el.querySelectorAll("img[data-thumb]").forEach((img) => {
      const n = byId.get(img.dataset.thumb);
      if (n.thumbBlob) n.thumbUrl ??= URL.createObjectURL(n.thumbBlob); // still on this device
      if (n.thumbUrl) return void (img.src = n.thumbUrl);
      backend.photo(thumbOf(n.photo)).then((url) => { img.src = url; }).catch(() => img.closest(".notepic")?.classList.add("missing"));
    });
    el.querySelectorAll("[data-pic]").forEach((b) => (b.onclick = () => {
      const items = withPhotos.map((n) => ({
        caption: `${noteDate(n.date, today())}${n.by ? ` · ${n.by}` : ""}${n.body ? ` · ${n.body}` : ""}`,
        load: () => (n.photoBlob ? Promise.resolve(n.fullUrl ??= URL.createObjectURL(n.photoBlob)) : backend.photo(n.photo)),
      }));
      onPhoto(items, withPhotos.findIndex((n) => n.id === b.dataset.pic));
    }));
  }

  return {
    // Shows a plant's notes in the card's section. access is what editing plants needs: null hides the section,
    // { can: false, note } explains why notes can't be shown.
    draw(el, plantId, access) {
      if (view.plantId !== plantId) { view.asking = null; view.problem = {}; }
      Object.assign(view, { el, plantId, access });
      if (access?.can) load(plantId);
      draw();
      if (access?.can) flush();
    },
    refresh,
    // After signing out, nobody's notes stay on screen. (Notes still waiting to be sent stay on this device.)
    forget() {
      lists.clear();
      myName = "";
      draw();
    },
    // For the tests: the same steps the card's buttons take.
    add, remove, flush, load, notesFor, ready, lists,
    get waiting() { return waiting; },
  };
}
