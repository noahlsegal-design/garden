// Checks the check-off store with the Mac backend (serve.py): moving old browser check-offs over, sharing
// between devices, and working while the Mac can't be reached. Uses a pretend browser and a pretend Mac.
// Run from the project folder: node tests/store.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const mac = { done: {}, frosts: {}, up: true, oldServer: false };
globalThis.fetch = async (url, opts = {}) => {
  if (!mac.up) throw new TypeError("Failed to fetch");
  if (mac.oldServer) return { ok: false, status: opts.method === "POST" ? 501 : 404 };
  if (opts.method === "POST") {
    const c = JSON.parse(opts.body);
    Object.assign(mac.done, c.set || {});
    for (const k of c.unset || []) delete mac.done[k];
    for (const [y, d] of Object.entries(c.frosts || {})) { if (d) mac.frosts[y] = d; else delete mac.frosts[y]; }
  }
  return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify({ done: mac.done, frosts: mac.frosts })) };
};
const { createCheckStore, macBackend } = await import("../app/tasks.js");
const plants = JSON.parse(readFileSync(new URL("../data/plants.json", import.meta.url), "utf8")).plants;
const tick = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };

// Old browser check-offs (one per whole job) become one per plant and move over.
mem.set("garden.tasks.v1", JSON.stringify({ v: 1, done: { "j|peony:divide:old|2026-09": "2026-09-24", "w|dahlia:water:abc|2026-09-21": "2026-09-24" }, frosts: { 2026: "2026-10-10" } }));
const store = createCheckStore(plants, macBackend, () => {});
await store.refresh();
const peonies = plants.filter((p) => p.speciesId === "peony").length;
assert.equal(Object.keys(mac.done).filter((k) => k.startsWith("j|peony:divide:old|2026-09|")).length, peonies, "one check per peony");
assert(mac.done["w|dahlia:water:abc|2026-09-21"], "weekly check-offs carried over as they were");
assert.equal(mac.frosts[2026], "2026-10-10");
assert(!mem.has("garden.tasks.v1"), "the old browser copy is cleared once it's moved");
assert.equal(store.checks.status, "saved");

// A change shows right away and reaches the Mac; another device's change shows up on refresh.
store.change({ set: { "j|x|2026-09|pb-01": "2026-09-25" } });
assert(store.checks.done["j|x|2026-09|pb-01"]);
await tick();
assert(mac.done["j|x|2026-09|pb-01"]);
mac.done["j|y|2026-09|pb-02"] = "2026-09-25";
await store.refresh();
assert(store.checks.done["j|y|2026-09|pb-02"]);

// Offline: the change waits in the browser, then goes through.
mac.up = false;
store.change({ unset: ["j|x|2026-09|pb-01"], set: { "j|z|2026-09|pb-03": "2026-09-26" } });
await tick();
assert.equal(store.checks.status, "offline");
assert(store.checks.done["j|z|2026-09|pb-03"] && !store.checks.done["j|x|2026-09|pb-01"]);
mac.up = true;
await store.refresh();
assert(mac.done["j|z|2026-09|pb-03"] && !mac.done["j|x|2026-09|pb-01"]);
assert.equal(store.checks.status, "saved");

// A Mac running the older app says so, and keeps changes until it's restarted.
mac.oldServer = true;
store.change({ frosts: { 2026: null } });
await tick();
assert.equal(store.checks.status, "old-server");
mac.oldServer = false;
await store.refresh();
assert.equal(mac.frosts[2026], undefined);
console.log("store (Mac): all checks passed");
