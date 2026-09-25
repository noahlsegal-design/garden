// Checks the Supabase connection (app/cloud.js) and the check-off store against a pretend Supabase that follows
// the real one's rules: the publishable key in the apikey header, sign-in passes that expire, row-level security,
// and at most 1000 rows per request. Nothing here contacts the real project.
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
const sb = { up: true, users: { "noah@example.com": { id: "U1", pw: "right-pw" } }, access: new Map(), refresh: new Map(), checkoffs: [], frosts: [], missingTables: false, calls: [] };
let n = 0;
const issue = (uid, email) => {
  const a = `A${++n}`, r = `R${n}`;
  sb.access.set(a, uid); sb.refresh.set(r, { uid, email });
  return { access_token: a, refresh_token: r, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email } };
};
const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
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
  if (sb.missingTables) return json(404, { code: "PGRST205" });
  const table = u.pathname.replace("/rest/v1/", "");
  const rows = table === "checkoffs" ? sb.checkoffs : sb.frosts;
  const mine = rows.filter((r) => r.user_id === uid);
  if (method === "GET") {
    const limit = Number(u.searchParams.get("limit") || 1000), offset = Number(u.searchParams.get("offset") || 0);
    const sorted = table === "checkoffs" ? [...mine].sort((a, b) => a.key.localeCompare(b.key)) : mine;
    return json(200, sorted.slice(offset, offset + Math.min(limit, 1000)).map((r) => (table === "checkoffs" ? { key: r.key, done_on: r.done_on } : { year: r.year, first_frost: r.first_frost })));
  }
  if (method === "POST") {
    assert.match(h.Prefer, /resolution=merge-duplicates/);
    for (const row of JSON.parse(opts.body)) {
      if (row.user_id !== uid) return json(403, { code: "42501" });
      const id = table === "checkoffs" ? "key" : "year";
      const i = rows.findIndex((r) => r.user_id === uid && r[id] === row[id]);
      if (i >= 0) rows[i] = row; else rows.push(row);
    }
    return json(201, null);
  }
  if (method === "DELETE") {
    const [field, value] = [...u.searchParams][0];
    let keep;
    if (field === "key") {
      const list = [...value.slice(4, -1).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
      keep = (r) => !(r.user_id === uid && list.includes(r.key));
    } else if (field === "done_on") keep = (r) => !(r.user_id === uid && r.done_on < value.slice(3));
    else keep = (r) => !(r.user_id === uid && r.year === Number(value.slice(3)));
    const left = rows.filter(keep);
    rows.length = 0; rows.push(...left);
    return json(204, null);
  }
  return json(405, {});
};

const cloud = await import(pathToFileURL(join(dir, "cloud.js")).href);
const { createCheckStore } = await import(pathToFileURL(join(dir, "tasks.js")).href);
const tick = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };
assert(cloud.cloudReady);

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

// More than 1000 check-offs load in pages; very old ones are cleared; other accounts' rows never show.
for (let i = 0; i < 2345; i++) sb.checkoffs.push({ user_id: "U1", key: `w|bulk${String(i).padStart(4, "0")}|2026-09-21`, done_on: "2026-09-24" });
sb.checkoffs.push({ user_id: "U1", key: "w|ancient|2020-01-01", done_on: "2020-01-01" });
sb.checkoffs.push({ user_id: "U2", key: "someone-else", done_on: "2026-09-24" });
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

// Signing out forgets the list on this device.
cloud.signOut();
store.forget();
assert.equal(Object.keys(store.checks.done).length, 0);
console.log(`cloud (Supabase): all checks passed (${sb.calls.length} requests to the pretend Supabase)`);
