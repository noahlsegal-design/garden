// Talks to Supabase, the online database that keeps your check-offs once the app is on the internet: signing in,
// and loading and saving check-offs and first-frost dates. It uses Supabase's plain web addresses, so no extra
// library is needed. The tables and security rules are in supabase/setup.sql.

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
// (needs a sign-in) or "setup" (the tables or rules from setup.sql are missing).
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
  if (res.status === 403 || res.status === 404) throw fail("setup");
  if (!res.ok) throw fail("offline");
  return method === "GET" ? res.json() : null;
}

const ymd = (d) => d.toISOString().slice(0, 10);
const quoted = (keys) => `(${keys.map((k) => encodeURIComponent(`"${k.replace(/["\\]/g, "\\$&")}"`)).join(",")})`;
const upsert = "resolution=merge-duplicates,return=minimal";

async function load() {
  const cutoff = ymd(new Date(Date.now() - KEEP_DAYS * 86400000));
  const done = {}, frosts = {};
  let stale = false;
  for (let from = 0; ; from += 1000) {
    const rows = await rest(`checkoffs?select=key,done_on&order=key&limit=1000&offset=${from}`);
    for (const r of rows) {
      if (r.done_on < cutoff) stale = true;
      else done[r.key] = r.done_on;
    }
    if (rows.length < 1000) break;
  }
  if (stale) rest(`checkoffs?done_on=lt.${cutoff}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
  for (const r of await rest("frosts?select=year,first_frost")) frosts[r.year] = r.first_frost;
  return { done, frosts };
}

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
  return null; // the store applies the change to its own copy
}

export const cloudBackend = { load, save };
