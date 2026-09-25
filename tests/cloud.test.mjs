// Checks the Supabase connection (app/cloud.js) and the check-off store against a pretend Supabase that follows
// the real one's rules as set up by supabase/setup.sql: the publishable key in the apikey header, sign-in passes
// that expire, one shared garden that only its members can see or change, and at most 1000 rows per request.
// It can also act like the setup from before the garden was shared (one list per person, no plant changes).
// Nothing here contacts the real project.
// Run from the project folder: node tests/cloud.test.mjs

import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// A copy of the app code with a test config, so the real config.js isn't touched.
const dir = mkdtempSync(join(tmpdir(), "garden-cloud-test-"));
for (const f of ["cloud.js", "tasks.js", "data.js"]) copyFileSync(fileURLToPath(new URL(`../app/${f}`, import.meta.url)), join(dir, f));
const KEY = "sb_publishable_TEST";
writeFileSync(join(dir, "config.js"), `export const SUPABASE_URL = "https://test.supabase.co/";\nexport const SUPABASE_KEY = "${KEY}";\n`);

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

// ---------- the pretend Supabase ----------
const sb = {
  up: true, beforeSharing: false, missingTables: false, calls: [],
  users: { "noah@example.com": { id: "U1", pw: "right-pw" }, "partner@example.com": { id: "U2", pw: "their-pw" }, "stranger@example.com": { id: "U3", pw: "x" } },
  members: [{ user_id: "U1", email: "noah@example.com" }],
  access: new Map(), refresh: new Map(),
  checkoffs: [], frosts: [], plant_edits: [],
};
// What makes a row unique: in the shared garden the task itself; before sharing, the task and whose it was.
const KEYS = { checkoffs: ["key"], frosts: ["year"], plant_edits: ["plant_id", "field"] };
let n = 0;
const issue = (uid, email) => {
  const a = `A${++n}`, r = `R${n}`;
  sb.access.set(a, uid); sb.refresh.set(r, { uid, email });
  return { access_token: a, refresh_token: r, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email } };
};
const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
const RLS = { code: "42501", message: 'new row violates row-level security policy for table "checkoffs"' };

function matches(row, params) {
  for (const [col, expr] of params) {
    if (["select", "order", "limit", "offset"].includes(col)) continue;
    const op = expr.slice(0, expr.indexOf(".")), val = expr.slice(expr.indexOf(".") + 1);
    if (op === "eq" && String(row[col]) !== val) return false;
    if (op === "lt" && !(row[col] < val)) return false;
    if (op === "in") {
      const list = [...val.slice(1, -1).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
      if (!list.includes(row[col])) return false;
    }
  }
  return true;
}

globalThis.fetch = async (url, opts = {}) => {
  if (!sb.up) throw new TypeError("Failed to fetch");
  const u = new URL(url), h = opts.headers || {}, method = opts.method || "GET";
  sb.calls.push(`${method} ${u.pathname}${u.search}`);
  assert.equal(h.apikey, KEY, "every request carries the publishable key in the apikey header");
  assert(!String(h.Authorization || "").includes(KEY), "the publishable key never goes in Authorization");
  assert(!u.pathname.includes("//"), "no double slashes");
  if (u.pathname === "/auth/v1/token") {
    const body = JSON.parse(opts.body);
    if (u.searchParams.get("grant_type") === "password") {
      const user = sb.users[body.email];
      return user && user.pw === body.password ? json(200, issue(user.id, body.email)) : json(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
    }
    const r = sb.refresh.get(body.refresh_token);
    if (!r) return json(400, { error: "invalid_grant", error_description: "Refresh Token Not Found" });
    sb.refresh.delete(body.refresh_token);
    return json(200, issue(r.uid, r.email));
  }
  if (u.pathname === "/auth/v1/logout") return json(204, null);
  const uid = sb.access.get(String(h.Authorization || "").replace("Bearer ", ""));
  if (!uid) return json(401, { message: "JWT expired" });
  const table = u.pathname.replace("/rest/v1/", "");
  if (sb.missingTables) return json(404, { code: "PGRST205" });
  if (sb.beforeSharing && (table === "garden_members" || table === "plant_edits")) return json(404, { code: "PGRST205" });
  const member = sb.members.some((m) => m.user_id === uid);
  const params = [...u.searchParams];

  if (table === "garden_members") {
    if (method !== "GET") return json(403, { code: "42501", message: "permission denied for table garden_members" });
    return json(200, member ? sb.members.map((m) => ({ ...m })) : []);
  }
  const rows = sb[table];
  const key = sb.beforeSharing ? ["user_id", ...KEYS[table]] : KEYS[table];
  const visible = (r) => (sb.beforeSharing ? r.user_id === uid : member);
  if (method === "GET") {
    const limit = Number(u.searchParams.get("limit") || 1000), offset = Number(u.searchParams.get("offset") || 0);
    const cols = u.searchParams.get("select").split(",");
    const order = (u.searchParams.get("order") || "").split(",").filter(Boolean);
    const found = rows.filter((r) => visible(r) && matches(r, params))
      .sort((a, b) => { for (const c of order) { const x = String(a[c]).localeCompare(String(b[c])); if (x) return x; } return 0; });
    return json(200, found.slice(offset, offset + Math.min(limit, 1000)).map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null]))));
  }
  if (method === "POST") {
    assert.match(h.Prefer, /resolution=merge-duplicates/);
    const body = JSON.parse(opts.body);
    assert(body.every((r) => JSON.stringify(Object.keys(r)) === JSON.stringify(Object.keys(body[0]))), "every row in one request has the same columns");
    for (let row of body) {
      if (sb.beforeSharing ? row.user_id !== uid : !member) return json(403, RLS);
      if (table === "plant_edits") row = { ...row, user_id: uid, changed_at: new Date().toISOString() }; // the database stamps who and when
      const i = rows.findIndex((r) => key.every((k) => r[k] === row[k]));
      if (i >= 0) rows[i] = row; else rows.push(row);
    }
    return json(201, null);
  }
  if (method === "DELETE") {
    const left = rows.filter((r) => !(visible(r) && matches(r, params)));
    rows.length = 0; rows.push(...left);
    return json(204, null);
  }
  return json(405, {});
};

const cloud = await import(pathToFileURL(join(dir, "cloud.js")).href);
const { createCheckStore } = await import(pathToFileURL(join(dir, "tasks.js")).href);
const tick = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };
assert(cloud.cloudReady);
const signInAs = async (email, pw, store) => { cloud.signOut(); store.forget(); await cloud.signIn(email, pw); await store.refresh(); };

// ---------- check-offs, as before ----------
// Signed out: check-offs wait on the device.
const store = createCheckStore([{ id: "pb-05", speciesId: "peony" }], cloud.cloudBackend, () => {});
await store.refresh();
assert.equal(store.checks.status, "signed-out");
store.change({ set: { "j|peony:divide:x|2026-09|pb-05": "2026-09-24" } });
await tick();
assert(store.checks.done["j|peony:divide:x|2026-09|pb-05"]);

// Wrong password, then the right one: the waiting check-off uploads.
await assert.rejects(cloud.signIn("noah@example.com", "nope"), /don't match/);
await cloud.signIn(" noah@example.com ", "right-pw");
assert.equal(cloud.account(), "noah@example.com");
await store.refresh();
assert.equal(store.checks.status, "saved");
assert.equal(store.checks.shared, true);
assert.deepEqual(store.checks.sharedWith, [], "nobody else in the garden yet");
assert.equal(sb.checkoffs.length, 1);
assert.equal(sb.checkoffs[0].user_id, "U1");

// Awkward keys survive saving and deleting.
const odd = ["w|a:b|2026-09-21", "j|x,y|2026-09|pb-1", 'j|say "hi"|2026-09|pb-2', "j|back\\slash|2026-09|pb-3"];
store.change({ set: Object.fromEntries(odd.map((k) => [k, "2026-09-24"])), frosts: { 2026: "2026-10-12" } });
await tick();
assert.equal(sb.checkoffs.length, 5);
store.change({ unset: odd, frosts: { 2026: null } });
await tick();
assert.equal(sb.checkoffs.length, 1);
assert.equal(sb.frosts.length, 0);

// More than 1000 check-offs load in pages, and very old ones are cleared.
for (let i = 0; i < 2345; i++) sb.checkoffs.push({ user_id: "U1", key: `w|bulk${String(i).padStart(4, "0")}|2026-09-21`, done_on: "2026-09-24" });
sb.checkoffs.push({ user_id: "U1", key: "w|ancient|2020-01-01", done_on: "2020-01-01" });
await store.refresh();
assert.equal(Object.keys(store.checks.done).length, 1 + 2345);
await tick();
assert(!sb.checkoffs.some((r) => r.key === "w|ancient|2020-01-01"));

// An expired sign-in pass renews itself.
sb.access.clear();
store.change({ set: { "w|after-expiry|2026-09-21": "2026-09-24" } });
await tick();
assert(sb.checkoffs.some((r) => r.key === "w|after-expiry|2026-09-21"));

// Offline, then back.
sb.up = false;
store.change({ set: { "w|offline|2026-09-21": "2026-09-24" } });
await tick();
assert.equal(store.checks.status, "offline");
sb.up = true;
await store.refresh();
assert(sb.checkoffs.some((r) => r.key === "w|offline|2026-09-21"));

// Tables missing (setup.sql not run): says so.
sb.missingTables = true;
await store.refresh();
assert.equal(store.checks.status, "setup");
sb.missingTables = false;

// Signed out elsewhere: back to the sign-in box, and the change is saved after signing in again.
sb.access.clear(); sb.refresh.clear();
store.change({ set: { "w|revoked|2026-09-21": "2026-09-24" } });
await tick();
assert.equal(store.checks.status, "signed-out");
await cloud.signIn("noah@example.com", "right-pw");
await store.refresh();
assert(sb.checkoffs.some((r) => r.key === "w|revoked|2026-09-21"));

// ---------- plant changes ----------
const at = "2026-09-25T12:00:00.000Z";
store.change({ edits: { "pb-26": { name: { v: "Japanese anemone", at }, confirmedByOwner: { v: true, at } }, "rb3-squash": { finished: { v: null, at } } } });
await tick();
assert.equal(sb.plant_edits.length, 3);
const row = (id, f) => sb.plant_edits.find((r) => r.plant_id === id && r.field === f);
assert.equal(row("pb-26", "name").value, "Japanese anemone");
assert.equal(row("pb-26", "confirmedByOwner").value, true);
assert.equal(row("rb3-squash", "finished").value, null, "empty means the detail is taken away");
assert.equal(row("pb-26", "name").saved_to_file, false);
assert.equal(store.checks.edits["pb-26"].name.v, "Japanese anemone", "shows right away");

// ---------- the partner joins ----------
// Before being added to the garden, the partner's account sees nothing and is told why.
await signInAs("partner@example.com", "their-pw", store);
assert.equal(store.checks.status, "not-member");
assert.equal(Object.keys(store.checks.done).length, 0, "Noah's list isn't shown to someone outside the garden");
store.change({ set: { "w|partner-early|2026-09-21": "2026-09-25" } });
await tick();
assert.equal(store.checks.status, "not-member", "saving is refused, and the check-off waits on the device");
assert(!sb.checkoffs.some((r) => r.key === "w|partner-early|2026-09-21"));

// Added in Supabase (select private.add_member(...)): the partner sees the whole shared garden, and the
// check-off that was waiting goes through.
sb.members.push({ user_id: "U2", email: "partner@example.com" });
await store.refresh();
assert.equal(store.checks.status, "saved");
assert.deepEqual(store.checks.sharedWith, ["noah@example.com"]);
assert(store.checks.done["w|revoked|2026-09-21"], "sees Noah's check-offs");
assert(sb.checkoffs.some((r) => r.key === "w|partner-early|2026-09-21"));
assert.equal(store.checks.edits["pb-26"].name.v, "Japanese anemone", "sees Noah's plant changes");
assert.equal(store.checks.edits["pb-26"].name.by, "noah@example.com", "and who made them");

// The partner unchecks one of Noah's, records the frost, marks a plant finished and undoes a rename.
store.change({ unset: ["w|revoked|2026-09-21"], frosts: { 2026: "2026-10-09" }, edits: { "rb1-cucumber": { finished: { v: "2026-09-25", at } }, "pb-26": { name: null } } });
await tick();
assert(!sb.checkoffs.some((r) => r.key === "w|revoked|2026-09-21"));
assert(!row("pb-26", "name"), "undo clears the change");
assert.equal(row("rb1-cucumber", "finished").user_id, "U2");

// Back to Noah: everything the partner did is there.
await signInAs("noah@example.com", "right-pw", store);
assert.equal(store.checks.status, "saved");
assert(!store.checks.done["w|revoked|2026-09-21"]);
assert(store.checks.done["w|partner-early|2026-09-21"]);
assert.equal(store.checks.frosts[2026], "2026-10-09");
assert.equal(store.checks.edits["rb1-cucumber"].finished.by, "partner@example.com");
assert.equal(store.checks.edits["pb-26"].name, undefined);

// "Save app edits into files" marks changes saved, with what the file had before; loading keeps both.
store.change({ edits: { "pb-26": { confirmedByOwner: { v: true, at, saved: true, fileHad: false } } } });
await tick();
assert.equal(row("pb-26", "confirmedByOwner").saved_to_file, true);
assert.equal(row("pb-26", "confirmedByOwner").file_had, false);
await store.refresh();
assert.deepEqual({ ...store.checks.edits["pb-26"].confirmedByOwner, at: undefined, by: undefined }, { v: true, saved: true, fileHad: false, at: undefined, by: undefined });

// Someone with an account who was never added can't change anything.
await signInAs("stranger@example.com", "x", store);
assert.equal(store.checks.status, "not-member");
store.change({ edits: { "pb-01": { name: { v: "Mine now", at } } } });
await tick();
assert(!row("pb-01", "name"));

// ---------- Supabase still set up the old way (setup.sql not run again yet) ----------
// Check-offs keep working, one list per person, and plant changes wait with a note to run setup.sql.
sb.beforeSharing = true;
sb.checkoffs.length = 0;
mem.clear(); // a different device, without the stranger's refused change waiting on it
const laptop = createCheckStore([], cloud.cloudBackend, () => {});
await signInAs("noah@example.com", "right-pw", laptop);
assert.equal(laptop.checks.status, "saved");
assert.equal(laptop.checks.shared, false);
laptop.change({ set: { "w|old-way|2026-09-21": "2026-09-25" } });
await tick();
assert.equal(sb.checkoffs.find((r) => r.key === "w|old-way|2026-09-21").user_id, "U1");
laptop.change({ edits: { "pb-02": { name: { v: "Avens", at } } } });
await tick();
assert.equal(laptop.checks.status, "setup");
sb.beforeSharing = false;

// Signing out forgets the list on this device.
cloud.signOut();
laptop.forget();
assert.equal(Object.keys(laptop.checks.done).length, 0);
assert.deepEqual(Object.keys(laptop.checks.edits), ["pb-02"], "only the change still waiting to be saved stays on the device");
console.log(`cloud (Supabase): all checks passed (${sb.calls.length} requests to the pretend Supabase)`);
