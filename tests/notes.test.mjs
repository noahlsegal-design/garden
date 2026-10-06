// Checks the notes and photo log (app/notes.js, and the notes half of app/cloud.js) against a pretend Supabase
// that follows the real one's rules from supabase/setup.sql: only garden members see or add notes and photos,
// photos sit in the private "plant-photos" folder and can't be replaced, and a note's id makes saving it twice
// harmless. Also checks that notes saved with no signal wait on the device and go once it's back.
// Nothing here contacts the real project. (The photo shrinking itself needs a browser; it's checked there.)
// Run from the project folder: node tests/notes.test.mjs

import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "garden-notes-test-"));
for (const f of ["cloud.js", "notes.js", "data.js"]) copyFileSync(fileURLToPath(new URL(`../app/${f}`, import.meta.url)), join(dir, f));
const KEY = "sb_publishable_TEST";
writeFileSync(join(dir, "config.js"), `export const SUPABASE_URL = "https://test.supabase.co";\nexport const SUPABASE_KEY = "${KEY}";\n`);

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

// The browser's photo storage, as far as the app uses it.
const cached = new Map();
globalThis.caches = {
  open: async () => ({
    match: async (k) => (cached.has(k) ? new Response(cached.get(k)) : undefined),
    put: async (k, res) => { cached.set(k, await res.blob()); },
    delete: async (k) => cached.delete(k),
  }),
  delete: async () => { cached.clear(); return true; },
};

// ---------- the pretend Supabase ----------
const sb = {
  up: true, noNotesYet: false, calls: [],
  users: { "noah@example.com": { id: "U1", pw: "pw1" }, "partner@example.com": { id: "U2", pw: "pw2" }, "stranger@example.com": { id: "U3", pw: "pw3" } },
  members: [{ user_id: "U1", email: "noah@example.com", name: "Noah" }, { user_id: "U2", email: "partner@example.com", name: null }],
  access: new Map(), notes: [], objects: new Map(),
};
let n = 0;
const issue = (uid, email) => {
  const a = `A${++n}`;
  sb.access.set(a, uid);
  return { access_token: a, refresh_token: `R${n}`, expires_in: 3600, user: { id: uid, email } };
};
const json = (status, body) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const NAME = /^[0-9a-f-]{36}(-thumb)?\.jpg$/;

globalThis.fetch = async (url, opts = {}) => {
  if (!sb.up) throw new TypeError("Failed to fetch");
  const u = new URL(url), h = opts.headers || {}, method = opts.method || "GET";
  sb.calls.push(`${method} ${u.pathname}`);
  assert.equal(h.apikey, KEY);
  if (u.pathname === "/auth/v1/token") {
    const body = JSON.parse(opts.body), user = sb.users[body.email];
    return user && user.pw === body.password ? json(200, issue(user.id, body.email)) : json(400, { error: "invalid_grant" });
  }
  if (u.pathname === "/auth/v1/logout") return json(204, null);
  const uid = sb.access.get(String(h.Authorization || "").replace("Bearer ", ""));
  if (!uid) return json(401, { message: "JWT expired" });
  const member = sb.members.some((m) => m.user_id === uid);

  // Storage: like the real one, it reports refusals as a 400 with the real status inside.
  if (u.pathname.startsWith("/storage/v1/object/")) {
    const rest = decodeURIComponent(u.pathname.slice("/storage/v1/object/".length));
    if (method === "POST") {
      const name = rest.replace("plant-photos/", "");
      assert(rest.startsWith("plant-photos/"));
      assert.equal(h["Content-Type"], "image/jpeg");
      assert.equal(h["x-upsert"], "false");
      if (!member || !NAME.test(name)) return json(400, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      if (sb.objects.has(name)) return json(400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
      if (opts.body.size > 2097152) return json(400, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
      sb.objects.set(name, opts.body);
      return json(200, { Key: rest });
    }
    if (method === "GET") {
      const name = rest.replace("authenticated/plant-photos/", "");
      if (!member || !sb.objects.has(name)) return json(400, { statusCode: "404", error: "not_found", message: "Object not found" });
      return new Response(sb.objects.get(name), { status: 200, headers: { "Content-Type": "image/jpeg" } });
    }
    if (method === "DELETE") {
      assert.equal(rest, "plant-photos");
      if (member) for (const p of JSON.parse(opts.body).prefixes) sb.objects.delete(p);
      return json(200, []);
    }
  }

  const table = u.pathname.replace("/rest/v1/", "");
  if (table === "plant_notes" && sb.noNotesYet) return json(404, { code: "PGRST205" });
  if (table === "garden_members") return json(200, member ? sb.members.map((m) => ({ ...m })) : []);
  assert.equal(table, "plant_notes");
  const where = (r) => [...u.searchParams].every(([c, e]) => {
    if (["select", "order", "limit", "offset"].includes(c)) return true;
    if (e === "not.is.null") return r[c] != null;
    return e.startsWith("eq.") ? String(r[c]) === e.slice(3) : true;
  });
  if (method === "GET") {
    const cols = u.searchParams.get("select").split(",");
    const found = member ? sb.notes.filter(where) : [];
    if (u.searchParams.get("order") === "noted_on.desc,created_at.desc") found.sort((a, b) => b.noted_on.localeCompare(a.noted_on) || b.created_at.localeCompare(a.created_at));
    const from = Number(u.searchParams.get("offset") || 0), limit = Number(u.searchParams.get("limit") || 1000);
    return json(200, found.slice(from, from + limit).map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null]))));
  }
  if (method === "POST") {
    assert.match(h.Prefer, /resolution=ignore-duplicates/);
    if (!member) return json(403, { code: "42501", message: 'new row violates row-level security policy for table "plant_notes"' });
    for (const row of JSON.parse(opts.body)) {
      assert(row.body || row.photo, "a note has words or a photo");
      if (row.photo) assert.match(row.photo, /^[0-9a-f-]{36}\.jpg$/);
      if (sb.notes.some((r) => r.id === row.id)) continue;
      sb.notes.push({ ...row, user_id: uid, created_at: new Date(Date.now() + sb.notes.length).toISOString() }); // stamped by the database
    }
    return json(201, null);
  }
  if (method === "DELETE") {
    if (member) sb.notes = sb.notes.filter((r) => !where(r));
    return json(204, null);
  }
  return json(405, {});
};

const cloud = await import(pathToFileURL(join(dir, "cloud.js")).href);
const { createNotes, memoryOutbox, noteDate, newId, megabytes } = await import(pathToFileURL(join(dir, "notes.js")).href);
const tick = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };
const jpegBytes = (size, fill = 1) => new Blob([new Uint8Array(size).fill(fill)], { type: "image/jpeg" });
const pic = (big = 300000) => ({ photo: jpegBytes(big), thumb: jpegBytes(25000, 2), w: 1600, h: 1200 });
const TODAY = "2026-06-12";

// ---------- small helpers ----------
assert.equal(noteDate("2026-06-12", TODAY), "June 12");
assert.equal(noteDate("2025-09-03", TODAY), "September 3, 2025", "an earlier year is spelled out");
assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const realUUID = crypto.randomUUID;
crypto.randomUUID = undefined; // a phone opening the Mac copy over Wi-Fi (not https) has no randomUUID
assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
crypto.randomUUID = realUUID;
assert.equal(megabytes(200000), "under 1 MB");
assert.equal(megabytes(14.4 * 1024 ** 2), "14 MB");

// ---------- signed out: nothing can be seen ----------
const outbox = memoryOutbox();
let log = createNotes({ backend: cloud.notesBackend, thumbOf: cloud.thumbOf, today: () => TODAY, outbox });
await log.ready;
await assert.rejects(cloud.notesBackend.list("pb-09"), (e) => e.status === "signed-out");

// ---------- Noah adds a note with a photo ----------
await cloud.signIn("noah@example.com", "pw1");
await log.load("pb-09");
assert.equal(log.notesFor("pb-09").length, 0);
const first = await log.add({ plantId: "pb-09", date: "2026-06-12", body: "  Thrips on dahlia #9  ", pic: pic() });
await tick();
assert.equal(log.waiting.length, 0, "sent straight away");
assert.equal(sb.notes.length, 1);
const row = sb.notes[0];
assert.equal(row.body, "Thrips on dahlia #9", "trimmed");
assert.equal(row.plant_id, "pb-09");
assert.equal(row.noted_on, "2026-06-12");
assert.equal(row.user_id, "U1");
assert.equal(row.photo, `${first.id}.jpg`);
assert.equal(row.photo_bytes, 325000, "both copies are counted");
assert.deepEqual([row.photo_w, row.photo_h], [1600, 1200]);
assert(sb.objects.has(`${first.id}.jpg`) && sb.objects.has(`${first.id}-thumb.jpg`), "photo and small copy uploaded");
const order = sb.calls.filter((c) => c.startsWith("POST")).slice(-3);
assert.deepEqual(order, ["POST /storage/v1/object/plant-photos/" + `${first.id}-thumb.jpg`, "POST /storage/v1/object/plant-photos/" + `${first.id}.jpg`, "POST /rest/v1/plant_notes"], "photos go up before the note");

// A note with words only, and one about an earlier day. Newest first, by the day each is about.
await log.add({ plantId: "pb-09", date: "2026-06-12", body: "Sprayed with soapy water" });
await log.add({ plantId: "pb-09", date: "2026-05-30", body: "First buds" });
assert.equal(await log.add({ plantId: "pb-09", body: "   " }), null, "an empty note isn't saved");
await tick();
await log.load("pb-09", true);
assert.deepEqual(log.notesFor("pb-09").map((x) => x.body), ["Sprayed with soapy water", "Thrips on dahlia #9", "First buds"]);
assert.deepEqual(log.notesFor("pb-09").map((x) => x.by), ["Noah", "Noah", "Noah"], "shows the name given in Supabase");
assert.equal(log.notesFor("pb-05").length, 0, "notes belong to their own plant");

// The photo that was just taken shows from this device, without downloading it again.
const before = sb.calls.length;
const thumbUrl = await cloud.notesBackend.photo(cloud.thumbOf(row.photo));
assert.match(thumbUrl, /^blob:/);
assert.equal(sb.calls.length, before, "no download for a photo taken on this device");

// ---------- the partner sees them, and adds one ----------
cloud.signOut();
log.forget();
assert.equal(cached.size, 0, "signing out clears the photos kept on this device");
await cloud.signIn("partner@example.com", "pw2");
log = createNotes({ backend: cloud.notesBackend, thumbOf: cloud.thumbOf, today: () => TODAY, outbox });
await log.load("pb-09");
assert.equal(log.notesFor("pb-09").length, 3);
assert.equal(log.notesFor("pb-09")[0].mine, false);
const full = await cloud.notesBackend.photo(row.photo);
assert.match(full, /^blob:/);
await tick();
assert.equal(cached.size, 1, "it's kept on this device");
assert.equal([...cached.values()][0].size, 300000, "the full-size photo comes down intact");
const downloads = () => sb.calls.filter((c) => c.startsWith("GET /storage")).length;
const d0 = downloads();
await cloud.notesBackend.photo(row.photo);
assert.equal(downloads(), d0, "opening it again doesn't download it again");
await log.add({ plantId: "pb-09", date: "2026-06-11", body: "Thrips gone" });
await tick();
await log.load("pb-09", true);
assert.equal(log.notesFor("pb-09").find((x) => x.body === "Thrips gone").by, "partner", "no name given: the start of their email");

// ---------- someone who isn't in the garden ----------
cloud.signOut();
await cloud.signIn("stranger@example.com", "pw3");
assert.deepEqual(await cloud.notesBackend.list("pb-09"), [], "sees no notes");
await assert.rejects(cloud.notesBackend.photo(row.photo), "can't fetch photos");
await assert.rejects(cloud.notesBackend.add({ id: newId(), plantId: "pb-09", date: TODAY, body: "hi", photo: null }), (e) => e.status === "not-member");
const id = newId();
await assert.rejects(cloud.notesBackend.add({ id, plantId: "pb-09", date: TODAY, body: "", photo: `${id}.jpg`, w: 1, h: 1, bytes: 2 }, jpegBytes(1), jpegBytes(1)), (e) => e.status === "not-member");
assert.equal(sb.objects.size, 2, "nothing uploaded");

// ---------- no signal in the yard ----------
cloud.signOut();
await cloud.signIn("noah@example.com", "pw1");
log = createNotes({ backend: cloud.notesBackend, thumbOf: cloud.thumbOf, today: () => TODAY, outbox });
await log.load("pb-09");
sb.up = false;
const offline = await log.add({ plantId: "pb-09", body: "Aphids on new growth", pic: pic(400000) });
await tick();
assert.equal(offline.date, TODAY, "dated today unless another day is picked");
assert.equal(log.waiting.length, 1);
assert.equal(log.waiting[0].status, "offline");
assert.equal(log.notesFor("pb-09")[0].id, offline.id, "shown at the top while it waits");
assert.equal((await outbox.all()).length, 1, "kept on the device, photo and all");

// The app is closed and opened again later, still without signal: the note is still there.
const reopened = createNotes({ backend: cloud.notesBackend, thumbOf: cloud.thumbOf, today: () => TODAY, outbox });
await reopened.ready;
await tick();
assert.equal(reopened.waiting.length, 1);
assert.equal(reopened.waiting[0].photoBlob.size, 400000);

// Half sent: the photos got there but the connection dropped before the note did. Sending again finishes it
// without uploading the photos twice or making two notes.
sb.up = true;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes("/rest/v1/plant_notes") && opts?.method === "POST") throw new TypeError("Failed to fetch");
  return realFetch(url, opts);
};
await reopened.flush();
assert.equal(sb.objects.has(`${offline.id}.jpg`), true);
assert.equal(reopened.waiting.length, 1, "still waiting: the note itself didn't arrive");
globalThis.fetch = realFetch;
await reopened.flush();
await tick();
assert.equal(reopened.waiting.length, 0);
assert.equal((await outbox.all()).length, 0, "cleared from the device once saved");
assert.equal(sb.notes.filter((r) => r.id === offline.id).length, 1, "saved once");
await reopened.flush();
assert.equal(sb.notes.filter((r) => r.id === offline.id).length, 1, "and only once");

// ---------- deleting ----------
await reopened.load("pb-09", true);
const withPhoto = reopened.notesFor("pb-09").find((x) => x.id === offline.id);
await reopened.remove(withPhoto);
assert(!sb.notes.some((r) => r.id === offline.id));
assert(!sb.objects.has(`${offline.id}.jpg`) && !sb.objects.has(`${offline.id}-thumb.jpg`), "its photos go too");
assert(!reopened.notesFor("pb-09").some((x) => x.id === offline.id));
// A waiting note can be deleted before it's ever sent.
sb.up = false;
const never = await reopened.add({ plantId: "pb-09", body: "typo" });
await tick();
await reopened.remove(reopened.waiting.find((x) => x.id === never.id));
sb.up = true;
await reopened.flush();
assert(!sb.notes.some((r) => r.id === never.id), "never sent");

// ---------- how much room the photos take ----------
const use = await cloud.notesBackend.use();
assert.deepEqual(use, { count: 1, bytes: 325000 });

// ---------- Supabase not set up for notes yet ----------
sb.noNotesYet = true;
await reopened.load("pb-05", true);
assert.equal(reopened.lists.get("pb-05").status, "setup");
sb.noNotesYet = false;

// ---------- a photo too big for the folder is refused, not retried forever ----------
await reopened.add({ plantId: "pb-05", body: "huge", pic: pic(3000000) });
await tick();
assert.equal(reopened.waiting[0].status, "too-big");

console.log("notes tests passed");
