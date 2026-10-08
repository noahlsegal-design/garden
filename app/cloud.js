// Talks to Supabase, the online database that keeps the shared garden once the app is on the internet: signing
// in, and loading and saving check-offs, first-frost dates, plant changes, each plant's notes and photos, and the
// photo checks (health checks and bugs) that Claude saves from the Claude app.
// Everyone listed as a garden member shares the same ones. It uses Supabase's plain web addresses, so no extra library is needed. The tables and
// security rules are in supabase/setup.sql.

import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const cloudReady = Boolean(SUPABASE_URL && SUPABASE_KEY);
const base = SUPABASE_URL.replace(/\/+$/, "");
const SESSION_KEY = "garden.session";
const KEEP_DAYS = 400; // check-offs older than about 13 months are cleared out

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function writeSession(s) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* private browsing: stays signed in until the page closes */ }
}

let session = cloudReady ? readSession() : null;
export const account = () => session?.email || "";

// Errors carry a status the check-off store understands: "offline" (couldn't reach Supabase), "signed-out"
// (needs a sign-in), "not-member" (signed in, but not added to the garden) or "setup" (the tables or rules from
// setup.sql are missing).
const fail = (status, message) => Object.assign(new Error(message || status), { status });

async function send(url, options) {
  try { return await fetch(url, options); } catch { throw fail("offline"); }
}

async function authCall(path, body) {
  const res = await send(`${base}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  if (res.status >= 500) throw fail("offline");
  throw fail("signed-out", data.error_description || data.msg || data.message);
}
function keep(data) {
  session = {
    access: data.access_token,
    refresh: data.refresh_token,
    expires: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: data.user?.id,
    email: data.user?.email,
  };
  writeSession(session);
}

export async function signIn(email, password) {
  try {
    keep(await authCall("token?grant_type=password", { email: email.trim(), password }));
  } catch (err) {
    if (err.status === "offline") throw new Error("Couldn't reach Supabase. Check your connection and try again.");
    throw new Error(/invalid login|invalid_grant/i.test(err.message) ? "That email and password don't match." : err.message || "Signing in didn't work.");
  }
}
export function signOut() {
  const old = session;
  session = null;
  writeSession(null);
  forgetPhotos();
  if (old) send(`${base}/auth/v1/logout`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${old.access}` } }).catch(() => {});
}

// Each request carries a short-lived pass from signing in, renewed a minute before it runs out.
let renewing = null;
async function pass(force = false) {
  if (!session) throw fail("signed-out");
  if (!force && session.expires - 60 > Date.now() / 1000) return session.access;
  renewing ??= authCall("token?grant_type=refresh_token", { refresh_token: session.refresh })
    .then(keep)
    .catch((err) => {
      if (err.status === "signed-out") { session = null; writeSession(null); }
      throw err;
    })
    .finally(() => { renewing = null; });
  await renewing;
  return session.access;
}

async function rest(path, { method = "GET", body, prefer } = {}, retried = false) {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${await pass()}` };
  if (body) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const res = await send(`${base}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && !retried) {
    await pass(true); // the pass may have just expired: renew it and try once more
    return rest(path, { method, body, prefer }, true);
  }
  if (res.status === 401) throw fail("signed-out");
  if (res.status === 403) {
    const err = await res.json().catch(() => ({}));
    throw fail(/row-level security/i.test(err.message || "") ? "not-member" : "setup");
  }
  if (res.status === 404) throw fail("setup");
  if (!res.ok) throw fail("offline");
  return method === "GET" ? res.json() : null;
}

const ymd = (d) => d.toISOString().slice(0, 10);
const quoted = (keys) => `(${keys.map((k) => encodeURIComponent(`"${k.replace(/["\\]/g, "\\$&")}"`)).join(",")})`;
const upsert = "resolution=merge-duplicates,return=minimal";

// Reads every row of a table, 1000 at a time (Supabase's most per request).
async function all(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await rest(`${path}&limit=1000&offset=${from}`);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

// Who's in the garden, or null if Supabase still has the setup from before the garden was shared (then each
// person has their own check-offs, and plant changes aren't available until setup.sql is run again).
async function members() {
  try {
    return await rest("garden_members?select=user_id,email");
  } catch (err) {
    if (err.status === "setup") return null;
    throw err;
  }
}

async function load() {
  const people = await members();
  if (people && !people.some((m) => m.user_id === session?.user)) throw fail("not-member");
  const cutoff = ymd(new Date(Date.now() - KEEP_DAYS * 86400000));
  const done = {}, frosts = {}, edits = {};
  let stale = false;
  for (const r of await all("checkoffs?select=key,done_on&order=key")) {
    if (r.done_on < cutoff) stale = true;
    else done[r.key] = r.done_on;
  }
  if (stale) rest(`checkoffs?done_on=lt.${cutoff}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
  for (const r of await rest("frosts?select=year,first_frost")) frosts[r.year] = r.first_frost;
  if (people) {
    const email = new Map(people.map((m) => [m.user_id, m.email]));
    for (const r of await all("plant_edits?select=plant_id,field,value,saved_to_file,file_had,user_id,changed_at&order=plant_id,field")) {
      const e = { v: r.value ?? null, at: r.changed_at, by: email.get(r.user_id) || "" };
      if (r.saved_to_file) Object.assign(e, { saved: true, fileHad: r.file_had ?? null });
      (edits[r.plant_id] ??= {})[r.field] = e;
    }
  }
  const others = (people || []).filter((m) => m.user_id !== session?.user).map((m) => m.email);
  return { done, frosts, edits, shared: Boolean(people), sharedWith: others };
}

const eq = (v) => `eq.${encodeURIComponent(v)}`;

async function save(change) {
  if (!session) throw fail("signed-out");
  const user_id = session.user;
  const set = Object.entries(change.set || {}).map(([key, done_on]) => ({ user_id, key, done_on }));
  if (set.length) await rest("checkoffs", { method: "POST", body: set, prefer: upsert });
  const unset = change.unset || [];
  for (let i = 0; i < unset.length; i += 40) { // a few at a time, so the address never gets too long
    await rest(`checkoffs?key=in.${quoted(unset.slice(i, i + 40))}`, { method: "DELETE", prefer: "return=minimal" });
  }
  for (const [year, day] of Object.entries(change.frosts || {})) {
    if (day) await rest("frosts", { method: "POST", body: [{ user_id, year: Number(year), first_frost: day }], prefer: upsert });
    else await rest(`frosts?year=eq.${Number(year)}`, { method: "DELETE", prefer: "return=minimal" });
  }
  const edits = [];
  for (const [plant_id, fields] of Object.entries(change.edits || {})) {
    for (const [field, e] of Object.entries(fields)) {
      if (e) edits.push({ plant_id, field, value: e.v ?? null, saved_to_file: Boolean(e.saved), file_had: e.saved ? e.fileHad ?? null : null, user_id });
      else await rest(`plant_edits?plant_id=${eq(plant_id)}&field=${eq(field)}`, { method: "DELETE", prefer: "return=minimal" });
    }
  }
  if (edits.length) await rest("plant_edits", { method: "POST", body: edits, prefer: upsert });
  return null; // the store applies the change to its own copy
}

export const cloudBackend = { load, save };

// ---------- notes and photos ----------
// Notes are rows in plant_notes. Photos sit in the private "plant-photos" storage folder, which has no public
// addresses: each one is fetched while signed in. A photo never changes once it's up, so each device keeps the
// ones it has fetched (in the browser's own storage, cleared on sign-out) and doesn't download them again. That
// keeps well inside the free plan's monthly downloads.
export const BUCKET = "plant-photos";
export const thumbOf = (photo) => photo.replace(/\.jpg$/, "-thumb.jpg");
const PHOTO_CACHE = "garden-photos";
const photoCache = () => (globalThis.caches ? caches.open(PHOTO_CACHE).catch(() => null) : Promise.resolve(null));

async function storage(path, { method = "GET", body, headers = {} } = {}, retried = false) {
  const res = await send(`${base}/storage/v1/${path}`, {
    method, body, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${await pass()}`, ...headers },
  });
  if (res.ok) return res;
  // Storage sometimes reports its real status inside the reply rather than as the reply's own status.
  const err = await res.json().catch(() => ({}));
  const code = Number(err.statusCode) || res.status;
  if (code === 401 && !retried) { // the pass may have just expired: renew it and try once more
    await pass(true);
    return storage(path, { method, body, headers }, true);
  }
  if (code === 409 || /already exists|duplicate/i.test(err.message || err.error || "")) return null; // sent before
  if (code === 401) throw fail("signed-out");
  if (code === 403 || /row-level security|unauthori[sz]ed/i.test(err.message || "")) throw fail("not-member");
  if (code === 404 || /bucket not found/i.test(err.message || err.error || "")) throw fail("setup");
  if (code === 413 || /too large|exceeded/i.test(err.message || "")) throw fail("too-big");
  throw fail("offline");
}

// Names to show on notes, from the garden's members: the name given in Supabase, or the start of their email.
let people = null;
async function peopleNames() {
  if (!people || people.user !== session?.user) {
    const rows = await rest("garden_members?select=user_id,email,name");
    people = { user: session?.user, names: new Map(rows.map((m) => [m.user_id, m.name || m.email.split("@")[0]])) };
  }
  return people.names;
}

const NOTE_COLUMNS = "id,plant_id,noted_on,body,photo,photo_w,photo_h,photo_bytes,user_id,created_at";
const noteOf = (r, names) => ({
  id: r.id, plantId: r.plant_id, date: r.noted_on, body: r.body || "", photo: r.photo || null,
  w: r.photo_w || null, h: r.photo_h || null, bytes: r.photo_bytes || 0, at: r.created_at,
  by: names.get(r.user_id) || "", mine: r.user_id === session?.user,
});

// A plant's notes, newest first.
async function listNotes(plantId) {
  const rows = await all(`plant_notes?select=${NOTE_COLUMNS}&plant_id=${eq(plantId)}&order=noted_on.desc,created_at.desc`);
  const names = await peopleNames();
  return rows.map((r) => noteOf(r, names));
}

// Sends a photo and its small copy to the private folder. Safe to repeat: one already there is left as it is.
async function sendPhoto(name, photo, thumb) {
  const headers = { "Content-Type": "image/jpeg", "cache-control": "max-age=31536000", "x-upsert": "false" };
  await storage(`object/${BUCKET}/${thumbOf(name)}`, { method: "POST", body: thumb, headers });
  await storage(`object/${BUCKET}/${name}`, { method: "POST", body: photo, headers });
}
// Deletes a photo and its small copy.
async function deletePhoto(name) {
  const paths = [name, thumbOf(name)];
  await storage(`object/${BUCKET}`, { method: "DELETE", body: JSON.stringify({ prefixes: paths }), headers: { "Content-Type": "application/json" } });
  dropCached(paths);
}

// Saves a note, sending its photo and small copy first. Safe to repeat: a photo or note that already got there
// last time is left as it is.
async function addNote(note, photo, thumb) {
  if (photo) await sendPhoto(note.photo, photo, thumb);
  const row = {
    id: note.id, plant_id: note.plantId, noted_on: note.date, body: note.body, photo: note.photo,
    photo_w: note.w, photo_h: note.h, photo_bytes: note.bytes || 0,
  };
  await rest("plant_notes", { method: "POST", body: [row], prefer: "resolution=ignore-duplicates,return=minimal" });
  const names = await peopleNames().catch(() => new Map());
  return noteOf({ ...row, user_id: session?.user, created_at: new Date().toISOString() }, names);
}

// Deletes a note and its photos (the photos first, so none are ever left behind with no note).
async function removeNote(note) {
  if (note.photo) await deletePhoto(note.photo);
  await rest(`plant_notes?id=${eq(note.id)}`, { method: "DELETE", prefer: "return=minimal" });
}

// A photo as an address the page can show, from this device's copy if it has one.
const shown = new Map(); // photo name -> address of the picture in memory
const photoKey = (path) => `${base}/storage/v1/object/authenticated/${BUCKET}/${path}`;
async function photoAddress(path) {
  if (shown.has(path)) return shown.get(path);
  const cache = await photoCache();
  let blob = await cache?.match(photoKey(path), { ignoreVary: true }).then((r) => r?.blob()).catch(() => null);
  if (!blob) {
    const res = await storage(`object/authenticated/${BUCKET}/${path}`);
    if (!res) throw fail("offline");
    blob = await res.blob();
    cache?.put(photoKey(path), new Response(blob, { headers: { "Content-Type": "image/jpeg" } })).catch(() => {});
  }
  const url = URL.createObjectURL(blob);
  shown.set(path, url);
  return url;
}
// A photo just taken on this device: kept, so it shows straight away and is never downloaded again.
function keepPhoto(path, blob) {
  if (!shown.has(path)) shown.set(path, URL.createObjectURL(blob));
  photoCache().then((c) => c?.put(photoKey(path), new Response(blob, { headers: { "Content-Type": "image/jpeg" } }))).catch(() => {});
}
function dropCached(paths) {
  for (const p of paths) {
    if (shown.has(p)) { URL.revokeObjectURL(shown.get(p)); shown.delete(p); }
  }
  photoCache().then((c) => c && Promise.all(paths.map((p) => c.delete(photoKey(p))))).catch(() => {});
}
// After signing out, this device doesn't keep anyone's photos.
function forgetPhotos() {
  for (const url of shown.values()) URL.revokeObjectURL(url);
  shown.clear();
  people = null;
  globalThis.caches?.delete(PHOTO_CACHE).catch(() => {});
}

// How many photos the garden has and how much room they take, against the free plan's 1 GB: notes' photos and
// the photo checks'.
async function photoUse() {
  const rows = await all("plant_notes?select=photo_bytes&photo=not.is.null&order=id");
  const checks = await all("photo_checks?select=photo_bytes&photo=not.is.null&order=id").catch(() => []);
  const both = [...rows, ...checks];
  return { count: both.length, bytes: both.reduce((t, r) => t + (r.photo_bytes || 0), 0) };
}

// The name shown on your own notes.
const myName = async () => (await peopleNames()).get(session?.user) || "";

export const notesBackend = { list: listNotes, add: addNote, remove: removeNote, photo: photoAddress, keepPhoto, use: photoUse, me: myName };

// ---------- photo checks: Plant health and Friend or foe ----------
// The app saves a check as "waiting" (with its photo), then you send the photo to Claude in the Claude app. Your
// Claude skill fills in the answer through the Supabase connector (private.record_check in setup.sql), and the
// check becomes "done". kind is "plant" or "bug"; report is Claude's whole answer.
const checkOf = (r, names) => ({
  id: r.id, kind: r.kind, plantId: r.plant_id || null, date: r.checked_on, status: r.status, note: r.note || "",
  report: r.report || null, photo: r.photo || null, w: r.photo_w || null, h: r.photo_h || null, bytes: r.photo_bytes || 0,
  at: r.created_at, doneAt: r.done_at || null, by: names.get(r.user_id) || "", mine: r.user_id === session?.user,
});
// Every check, newest first.
async function listChecks() {
  const rows = await all("photo_checks?select=*&order=checked_on.desc,created_at.desc");
  const names = await peopleNames();
  return rows.map((r) => checkOf(r, names));
}
// Saves a new check as waiting for Claude, its photo first. Safe to repeat.
async function addCheck(c, photo, thumb) {
  if (photo) await sendPhoto(c.photo, photo, thumb);
  const row = {
    id: c.id, kind: c.kind, plant_id: c.plantId || null, checked_on: c.date, note: c.note || "",
    photo: c.photo || null, photo_w: c.w || null, photo_h: c.h || null, photo_bytes: c.bytes || 0,
  };
  await rest("photo_checks", { method: "POST", body: [row], prefer: "resolution=ignore-duplicates,return=minimal" });
  const names = await peopleNames().catch(() => new Map());
  return checkOf({ ...row, status: "waiting", user_id: session?.user, created_at: new Date().toISOString() }, names);
}
// Deletes a check and its photos.
async function removeCheck(c) {
  if (c.photo) await deletePhoto(c.photo);
  await rest(`photo_checks?id=${eq(c.id)}`, { method: "DELETE", prefer: "return=minimal" });
}
// Moves a check to another plant, or to none.
async function moveCheck(c, plantId) {
  await rest(`photo_checks?id=${eq(c.id)}`, { method: "PATCH", body: { plant_id: plantId || null }, prefer: "return=minimal" });
}

export const checksBackend = { list: listChecks, add: addCheck, remove: removeCheck, move: moveCheck, photo: photoAddress, keepPhoto, use: photoUse };
