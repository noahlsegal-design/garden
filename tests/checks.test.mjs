// Checks the app's side of the photo checks: how Claude's answers are laid out and summed up (app/reports.js),
// the prompt handed to the Claude app with the garden's details, the bug catalog's grouping, and the calls in
// app/cloud.js (saving, listing, moving and deleting checks) against a pretend Supabase. The answers used here
// are the examples from the skills in skills/, so the app and the skills agree on their shape.
// Nothing here contacts the real project or Claude.
// Run from the project folder: node tests/checks.test.mjs

import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "garden-checks-test-"));
for (const f of ["cloud.js", "data.js", "reports.js"]) copyFileSync(fileURLToPath(new URL(`../app/${f}`, import.meta.url)), join(dir, f));
const KEY = "sb_publishable_TEST";
writeFileSync(join(dir, "config.js"), `export const SUPABASE_URL = "https://test.supabase.co";\nexport const SUPABASE_KEY = "${KEY}";\n`);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.caches = { open: async () => ({ match: async () => undefined, put: async () => {}, delete: async () => true }), delete: async () => true };
globalThis.URL.createObjectURL ??= () => "blob:x";

const R = await import(pathToFileURL(join(dir, "reports.js")).href);

// ---------- Plant health answers ----------
const ISSUES = {
  outcome: "issues", message: "Most likely powdery mildew.",
  identification: { common_name: "Zinnia", scientific_name: "Zinnia elegans", cultivar_note: "", confidence: 92, candidates: [] },
  symptoms: ["White powdery patches on older leaves"],
  diagnoses: [
    { cause: "Powdery mildew", category: "fungal", likelihood: "most_likely", reasoning: "Dry white patches that rub off." },
    { cause: "Spray residue", category: "other", likelihood: "possible", reasoning: "Less likely without spraying." },
  ],
  treatments: [{ for_cause: "Powdery mildew", non_chemical: ["Remove the worst leaves", "Water at the base in the morning"], chemical: { option: "Potassium bicarbonate", notes: "Every 7–10 days", safety: "Low risk to bees once dry" } }],
  cut_flower_note: "Stems are still fine to cut; strip the affected leaves.",
  safety_note: "", confidence: 85, confidence_why: "Classic look.", sources: ["UMass Amherst Extension: Powdery mildew"],
};
assert.equal(R.plantTitle(ISSUES), "Powdery mildew");
assert.equal(R.plantTitle({ outcome: "healthy", message: "x" }), "Healthy");
assert.ok(R.plantBadge(ISSUES).includes("Disease") && R.plantBadge({ outcome: "healthy" }).includes("Healthy"));
assert.ok(R.plantIsFinal(ISSUES) && R.plantIsFinal({ outcome: "healthy" }));
assert.ok(!R.plantIsFinal({ outcome: "needs_plant_name" }) && !R.plantIsFinal({ outcome: "needs_better_photo" }));
const html = R.plantReportHtml(ISSUES);
for (const part of ["🌿", "Plant identification", "🔍", "Health assessment", "🐛", "Diagnosis", "💊", "Treatment", "Non-chemical", "Chemical option (second choice)", "Cut flowers", "85/100", "UMass Amherst Extension"]) {
  assert.ok(html.includes(part), `the plant answer shows "${part}"`);
}
assert.ok(html.indexOf("Non-chemical") < html.indexOf("Chemical option"), "the non-chemical fix comes first");
const healthy = R.plantReportHtml({ ...ISSUES, outcome: "healthy", message: "This plant looks healthy.", diagnoses: [], treatments: [], symptoms: [] });
assert.ok(!healthy.includes("Diagnosis") && !healthy.includes("Treatment"), "a healthy plant gets no diagnosis or treatment");
const ask = R.plantReportHtml({ outcome: "needs_plant_name", message: "Could you tell me what it is?" });
assert.ok(ask.includes("Could you tell me what it is?") && !ask.includes("Health assessment"), "an unknown plant stops at identification");
const blurry = R.plantReportHtml({ ...ISSUES, outcome: "needs_better_photo", message: "Could you share a closer photo?" });
assert.ok(blurry.includes("closer photo") && !blurry.includes("Diagnosis"), "an unclear photo stops at the health assessment");
assert.ok(!R.plantReportHtml({ ...ISSUES, message: "<img src=x onerror=alert(1)>", symptoms: ["<b>x</b>"] }).includes("<b>x</b>"), "Claude's words are shown as text, never as page code");

// ---------- Friend or foe answers ----------
const BEETLE = {
  outcome: "identified", message: "A friend.", common_name: "Seven-spotted lady beetle", scientific_name: "Coccinella septempunctata",
  group: "Lady beetle (Coccinellidae)", life_stage: "Adult", verdict: "friend", verdict_why: "Eats aphids.", what_it_does: "Hunts aphids.",
  host_plants: [], in_your_garden: "Helps the roses.", what_to_do: ["Leave it be"], chemical: null, look_alikes: "", safety_note: "",
  confidence: 95, confidence_why: "Clear markings.", sources: ["Cornell: Lady beetles"],
};
assert.equal(R.bugKey(BEETLE), "coccinella septempunctata");
assert.equal(R.bugKey({ scientific_name: "Coccinella  Septempunctata (adult)" }), "coccinella septempunctata adult");
assert.equal(R.bugKey({ scientific_name: "", common_name: "Pill Bug" }), "pill bug");
assert.equal(R.bugKey({ scientific_name: "unknown", common_name: "Slug" }), "slug");
assert.ok(R.bugIsFinal(BEETLE));
assert.ok(!R.bugIsFinal({ ...BEETLE, outcome: "needs_better_photo" }) && !R.bugIsFinal({ ...BEETLE, verdict: "maybe" }));
assert.ok(R.bugIsFinal({ ...BEETLE, outcome: undefined }), "an answer saved without an outcome still counts");
const bhtml = R.bugReportHtml(BEETLE);
for (const part of ["Friend", "Seven-spotted lady beetle", "How to keep it around", "In your garden", "95/100"]) assert.ok(bhtml.includes(part), `the bug answer shows "${part}"`);
assert.ok(R.bugReportHtml({ ...BEETLE, verdict: "foe" }).includes("What to do"));
assert.ok(R.verdictBadge("foe").includes("Foe") && R.verdictBadge("neutral").includes("Neutral"));

// The catalog: one entry per bug, newest sighting first, with the plants it was on. Waiting checks and plant
// checks aren't in it.
const sight = (id, name, date, plantId, verdict = "foe") => ({ id, kind: "bug", status: "done", date, plantId, at: `${date}T12:00`, report: { id, common_name: name, scientific_name: "", verdict } });
const groups = R.catalogOf([
  sight("a", "Aphid", "2026-07-01", "pb-05"), sight("b", "Lady beetle", "2026-07-03", "pb-05", "friend"),
  sight("c", "Aphid", "2026-08-10", "ds-02"), sight("d", "Aphid", "2026-08-12", "pb-05"),
  { id: "e", kind: "bug", status: "waiting", date: "2026-09-01", report: null }, { id: "f", kind: "plant", status: "done", date: "2026-09-01", report: ISSUES },
]);
assert.deepEqual(groups.map((g) => [g.key, g.count, g.last, g.verdict]), [["aphid", 3, "2026-08-12", "foe"], ["lady beetle", 1, "2026-07-03", "friend"]]);
assert.deepEqual(groups[0].plants.sort(), ["ds-02", "pb-05"]);
assert.equal(groups[0].report.id, "d", "a bug's catalog entry shows its newest answer");

// The skills' example answers (skills/*/SKILL.md) are ones the app can show.
const example = (skill) => JSON.parse(readFileSync(fileURLToPath(new URL(`../skills/${skill}/SKILL.md`, import.meta.url)), "utf8").match(/```json\n([\s\S]*?)\n```/)[1]);
const plantExample = example("plant-diagnostics"), bugExample = example("friend-or-foe");
assert.equal(plantExample.kind, "plant");
assert.ok(R.plantReportHtml({ ...plantExample, outcome: "issues" }).includes("Powdery mildew"));
assert.equal(bugExample.kind, "bug");
assert.ok(R.bugIsFinal({ ...bugExample, verdict: "friend" }));
assert.equal(R.bugKey(bugExample), "coccinella septempunctata");

// ---------- what Claude is told ----------
const layout = JSON.parse(readFileSync(fileURLToPath(new URL("../data/layout.json", import.meta.url)), "utf8"));
const ctx = R.gardenContext({
  today: "2026-10-08", site: layout.site,
  plant: { id: "ds-09", name: "Dahlia #9", label: "#9", speciesId: "dahlia", idConfidence: 90, confirmedByOwner: false, alsoPossible: [], issues: ["Leaf spots"], notes: "" },
  species: { commonName: "Dahlia", scientificName: "Dahlia pinnata" }, areaName: "Dahlia strip",
  notes: [{ date: "2026-10-01", body: "Thrips on the flowers" }, { date: "2026-09-20", body: "" }],
});
for (const part of ["October 8, 2026", "zone 7a", "pH about 4.9", "first fall frost usually around October 15", "Dahlia #9", "Dahlia (Dahlia pinnata)", "90% confidence", "Dahlia strip", "Leaf spots", "2026-10-01: Thrips on the flowers"]) {
  assert.ok(ctx.includes(part), `the garden details include "${part}"`);
}
assert.ok(!ctx.includes("Zone A"), "soil zones with no results aren't sent");
const bugCtx = R.gardenContext({ today: "2026-07-04", site: layout.site, kinds: ["Dahlia", "Peony"] });
assert.ok(bugCtx.includes("Plants growing in the garden: Dahlia, Peony.") && !bugCtx.includes("The photo is of"));

// ---------- the prompt for the Claude app ----------
const ID = "1b4e28ba-2fa1-4d3b-9c6e-2f8a8e5b7a10";
const prompt = R.claudePrompt({ kind: "plant", id: ID, plantId: "ds-09", note: "  spots since the rain ", context: ctx });
assert.match(prompt, /plant-diagnostics skill/);
assert.match(prompt, /Supabase connector/);
assert.match(prompt, new RegExp(`^check_id: ${ID}$`, "m"), "the skill copies the check_id from its own line");
assert.match(prompt, /^plant_id: ds-09$/m);
assert.match(prompt, /^My note: spots since the rain$/m);
assert.ok(prompt.includes("Dahlia #9") && prompt.includes("zone 7a"));
const bugPrompt = R.claudePrompt({ kind: "bug", id: ID, plantId: null, context: bugCtx });
assert.match(bugPrompt, /friend-or-foe skill/);
assert.match(bugPrompt, /^plant_id: none$/m);
assert.doesNotMatch(bugPrompt, /My note/);
const links = R.claudeLinks(prompt);
assert.ok(links.app.startsWith("claude://claude.ai/new?q=") && links.web.startsWith("https://claude.ai/new?q="));
assert.equal(decodeURIComponent(links.web.split("?q=")[1]), prompt, "the whole prompt rides along in the link");
assert.ok(links.app.length < 14000, "short enough for the link (Claude keeps about 14,000 characters)");

// ---------- the pretend Supabase ----------
const sb = { checks: [], objects: new Map(), calls: [] };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const passes = { A1: "U1" };
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url), h = opts.headers || {}, method = opts.method || "GET";
  sb.calls.push(`${method} ${u.pathname}`);
  assert.equal(h.apikey, KEY);
  const uid = passes[(h.Authorization || "").replace("Bearer ", "")];
  if (!uid) return json(401, { message: "JWT expired" });
  if (u.pathname.startsWith("/storage/v1/object/plant-photos/")) { sb.objects.set(u.pathname.split("/").pop(), opts.body); return json(200, {}); }
  if (u.pathname === "/storage/v1/object/plant-photos" && method === "DELETE") { for (const p of JSON.parse(opts.body).prefixes) sb.objects.delete(p); return json(200, []); }
  if (u.pathname === "/rest/v1/garden_members") return json(200, [{ user_id: "U1", email: "noah@example.com", name: "Noah" }]);
  if (u.pathname === "/rest/v1/photo_checks") {
    const id = u.searchParams.get("id")?.replace(/^eq\./, "");
    if (method === "GET") return json(200, sb.checks.map((r) => ({ ...r })));
    if (method === "POST") {
      for (const row of JSON.parse(opts.body)) {
        assert.deepEqual(Object.keys(row).sort(), ["checked_on", "id", "kind", "note", "photo", "photo_bytes", "photo_h", "photo_w", "plant_id"], "the app only sends the columns it's allowed to add");
        if (!sb.checks.some((r) => r.id === row.id)) sb.checks.push({ ...row, status: "waiting", report: null, user_id: uid, created_at: "2026-10-08T10:00:00Z" });
      }
      return new Response(null, { status: 201 });
    }
    if (method === "PATCH") { assert.deepEqual(Object.keys(JSON.parse(opts.body)), ["plant_id"]); Object.assign(sb.checks.find((r) => r.id === id), JSON.parse(opts.body)); return new Response(null, { status: 204 }); }
    if (method === "DELETE") { sb.checks = sb.checks.filter((r) => r.id !== id); return new Response(null, { status: 204 }); }
  }
  return json(404, {});
};
mem.set("garden.session", JSON.stringify({ access: "A1", refresh: "R", expires: Math.floor(Date.now() / 1000) + 3600, user: "U1", email: "noah@example.com" }));
const cloud = await import(pathToFileURL(join(dir, "cloud.js")).href);
const C = cloud.checksBackend;

// A check is saved as waiting, its photo first.
const saved = await C.add({ id: ID, kind: "plant", plantId: "pb-05", date: "2026-10-08", note: "spots", photo: `${ID}.jpg`, w: 1600, h: 1200, bytes: 300 }, new Blob(["big"]), new Blob(["small"]));
assert.deepEqual([saved.status, saved.by, saved.mine, saved.report], ["waiting", "Noah", true, null]);
assert.ok(sb.objects.has(`${ID}.jpg`) && sb.objects.has(`${ID}-thumb.jpg`));
assert.ok(sb.calls.indexOf(`POST /storage/v1/object/plant-photos/${ID}.jpg`) < sb.calls.indexOf("POST /rest/v1/photo_checks"), "the photo goes before the row");
// A check without a photo.
await C.add({ id: "2b4e28ba-2fa1-4d3b-9c6e-2f8a8e5b7a10", kind: "bug", plantId: null, date: "2026-10-08", note: "" });
assert.equal(sb.objects.size, 2);
// Claude fills one in (through the connector, so here straight into the pretend table).
Object.assign(sb.checks[0], { status: "done", report: ISSUES, done_at: "2026-10-08T10:02:00Z" });
const list = await C.list();
assert.deepEqual(list.map((c) => [c.kind, c.status, c.plantId, c.date]), [["plant", "done", "pb-05", "2026-10-08"], ["bug", "waiting", null, "2026-10-08"]]);
assert.equal(list[0].report.diagnoses[0].cause, "Powdery mildew");
await C.move(list[0], "");
assert.equal(sb.checks[0].plant_id, null, "moved to no plant");
await C.remove(list[0]);
assert.equal(sb.checks.length, 1);
assert.equal(sb.objects.size, 0, "its photos are deleted too");

console.log("checks tests passed");
