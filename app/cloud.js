// Talks to Supabase, the online database that keeps the shared garden once the app is on the internet: signing
// in, and loading and saving check-offs, first-frost dates and plant changes. Everyone listed as a garden member
// shares the same ones. It uses Supabase's plain web addresses, so no extra library is needed. The tables and
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
