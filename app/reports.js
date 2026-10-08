// Claude's answers to the photo checks, laid out for reading: "Plant health" (identify, health, diagnosis,
// treatment, the same steps as the Plant Diagnostics skill) and "Friend or foe" (what a bug is, and whether
// it's good for the garden). Also the prompt the app hands to the Claude app, with the garden's details.
// Nothing here talks to Supabase; checks.js uses these to draw.

import { MONTH_NAMES, esc } from "./data.js";

export const VERDICTS = {
  friend: { label: "Friend", cls: "safe", icon: "♥" },
  foe: { label: "Foe", cls: "toxic", icon: "⚠" },
  neutral: { label: "Neutral", cls: "", icon: "·" },
};

const pct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const list = (items) => (Array.isArray(items) ? items.filter((s) => typeof s === "string" && s.trim()) : []);
const ul = (items, cls = "") => (items.length ? `<ul class="${cls}">${items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : "");
const para = (s, cls = "") => (s && String(s).trim() ? `<p${cls ? ` class="${cls}"` : ""}>${esc(s)}</p>` : "");

// The 0–100 confidence, with why, and the sources Claude named.
function trustHtml(r) {
  const sources = list(r.sources);
  return `<div class="rtrust">
    <div class="conf"><b>${pct(r.confidence)}/100</b><span class="small">${esc(r.confidence_why || "")}</span></div>
    ${sources.length ? `<p class="small"><b>Sources:</b> ${sources.map(esc).join(" · ")}</p>` : ""}
  </div>`;
}

const chemicalHtml = (c) => (c && c.option ? `
  <div class="rchem">
    <p><b>Chemical option (second choice):</b> ${esc(c.option)}</p>
    ${para(c.notes, "small")}
    ${c.safety ? `<p class="small rsafety">⚠ ${esc(c.safety)}</p>` : ""}
  </div>` : "");

// ---------- Plant health ----------
export const plantIsFinal = (r) => Boolean(r && (r.outcome === "issues" || r.outcome === "healthy"));

// The ID line: "Dahlia (Dahlia pinnata) · 'Café au Lait' type".
function idHtml(id = {}) {
  const sci = id.scientific_name && !/^unknown$/i.test(id.scientific_name) ? ` <i>${esc(id.scientific_name)}</i>` : "";
  const cands = Array.isArray(id.candidates) ? id.candidates.filter((c) => c?.common_name) : [];
  return `<p class="rid"><b>${esc(id.common_name || "Not identified")}</b>${sci}</p>
    ${para(id.cultivar_note, "small")}
    ${id.confidence ? `<p class="small">Identification ${pct(id.confidence)}% sure.</p>` : ""}
    ${cands.length > 1 ? `<p class="small">Could be: ${cands.map((c) => `${esc(c.common_name)}${c.scientific_name ? ` (<i>${esc(c.scientific_name)}</i>)` : ""}`).join("; ")}.</p>` : ""}`;
}

export function plantReportHtml(r) {
  if (!r) return "";
  const section = (icon, title, body) => `<section class="rsec"><h4><span aria-hidden="true">${icon}</span> ${title}</h4>${body}</section>`;
  if (r.outcome === "needs_plant_name") return section("🌿", "Plant identification", para(r.message));
  const out = [section("🌿", "Plant identification", idHtml(r.identification))];
  if (r.outcome === "needs_better_photo") {
    out.push(section("🔍", "Health assessment", para(r.message)));
    return out.join("");
  }
  if (r.outcome === "healthy") {
    out.push(section("🔍", "Health assessment", `<p class="rhealthy">${esc(r.message)}</p>`));
  } else {
    out.push(section("🔍", "Health assessment", ul(list(r.symptoms))));
    const dx = (r.diagnoses || []).filter((d) => d?.cause);
    out.push(section("🐛", "Diagnosis", dx.map((d) => `
      <div class="rdx"><p><b>${esc(d.cause)}</b> <span class="small">${d.likelihood === "most_likely" ? "most likely" : "possible"}${d.category && d.category !== "other" ? ` · ${esc(d.category)}` : ""}</span></p>${para(d.reasoning)}</div>`).join("")));
    const tx = (r.treatments || []).filter((t) => t);
    out.push(section("💊", "Treatment", tx.map((t) => `
      <div class="rtx">${tx.length > 1 && t.for_cause ? `<p class="stitle">${esc(t.for_cause)}</p>` : ""}
        <p><b>Non-chemical:</b></p>${ul(list(t.non_chemical))}
        ${chemicalHtml(t.chemical)}
      </div>`).join("")));
  }
  if (r.cut_flower_note) out.push(`<p class="rnote"><b>Cut flowers:</b> ${esc(r.cut_flower_note)}</p>`);
  if (r.safety_note) out.push(`<p class="rnote rsafety"><b>Dog and wildlife:</b> ${esc(r.safety_note)}</p>`);
  out.push(trustHtml(r));
  return out.join("");
}

// A health check in a few words, for the timeline: "Powdery mildew", or "Healthy".
export function plantTitle(r) {
  if (!r) return "Waiting for Claude";
  if (r.outcome === "healthy") return "Healthy";
  const top = (r.diagnoses || []).find((d) => d.likelihood === "most_likely") || r.diagnoses?.[0];
  return top?.cause || r.message || "Checked";
}
// The kind of problem it found, for the timeline's badge.
export function plantBadge(r) {
  if (!r) return `<span class="badge">Waiting</span>`;
  if (r.outcome === "healthy") return `<span class="badge safe">Healthy</span>`;
  const top = (r.diagnoses || []).find((d) => d.likelihood === "most_likely") || r.diagnoses?.[0];
  const kinds = { pest: "Pest", fungal: "Disease", bacterial: "Disease", viral: "Disease", nutrient: "Nutrients", environmental: "Conditions" };
  return `<span class="badge attention">${esc(kinds[top?.category] || "Problem")}</span>`;
}

// ---------- Friend or foe ----------
export const bugIsFinal = (r) => Boolean(r && (!r.outcome || r.outcome === "identified") && VERDICTS[r.verdict] && r.common_name);

// Sightings of the same bug are grouped in the catalog by this: the scientific name, or else the common name.
export function bugKey(r) {
  const sci = String(r?.scientific_name || "").toLowerCase().replace(/[^a-z\s.-]/g, " ").replace(/\s+/g, " ").trim();
  if (sci && !/^unknown/.test(sci)) return sci.slice(0, 160);
  return String(r?.common_name || "unknown").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160) || "unknown";
}

export const verdictBadge = (v) => {
  const t = VERDICTS[v] || VERDICTS.neutral;
  return `<span class="badge verdict ${t.cls}"><span aria-hidden="true">${t.icon}</span> ${t.label}</span>`;
};

export function bugReportHtml(r, { verdict = true } = {}) {
  if (!r) return "";
  if (!bugIsFinal(r)) return `<section class="rsec">${para(r.message)}</section>`;
  const hosts = list(r.host_plants);
  return `
    <section class="rsec rbughead">
      ${verdict ? verdictBadge(r.verdict) : ""}
      <p class="rid"><b>${esc(r.common_name)}</b>${r.scientific_name ? ` <i>${esc(r.scientific_name)}</i>` : ""}</p>
      <p class="small">${[r.group, r.life_stage].filter(Boolean).map(esc).join(" · ")}</p>
      ${para(r.verdict_why)}
    </section>
    <section class="rsec"><h4>What it does</h4>${para(r.what_it_does)}${hosts.length ? `<p class="small"><b>Plants:</b> ${hosts.map(esc).join(", ")}</p>` : ""}</section>
    ${r.in_your_garden ? `<section class="rsec"><h4>In your garden</h4>${para(r.in_your_garden)}</section>` : ""}
    <section class="rsec"><h4>${r.verdict === "friend" ? "How to keep it around" : "What to do"}</h4>${ul(list(r.what_to_do))}${chemicalHtml(r.chemical)}</section>
    ${r.look_alikes ? `<p class="rnote"><b>Look-alikes:</b> ${esc(r.look_alikes)}</p>` : ""}
    ${r.safety_note ? `<p class="rnote rsafety"><b>Dog and wildlife:</b> ${esc(r.safety_note)}</p>` : ""}
    ${trustHtml(r)}`;
}

// The catalog: finished bug checks grouped by bug, the most recently seen first. Each group keeps the newest answer.
export const newestFirst = (a, b) => b.date.localeCompare(a.date) || String(b.at || "").localeCompare(String(a.at || ""));
export function catalogOf(checks) {
  const groups = new Map();
  for (const c of checks.filter((x) => x.kind === "bug" && bugIsFinal(x.report)).sort(newestFirst)) {
    const s = { ...c, key: bugKey(c.report) };
    const g = groups.get(s.key) || { key: s.key, name: s.report.common_name, scientific: s.report.scientific_name || "", verdict: s.report.verdict, report: s.report, sightings: [], plants: new Set() };
    g.sightings.push(s);
    if (s.plantId) g.plants.add(s.plantId);
    groups.set(s.key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, plants: [...g.plants], last: g.sightings[0].date, count: g.sightings.length }));
}

// ---------- the prompt for the Claude app ----------
// What the app copies and opens Claude with: which skill to use, the check's id and plant (so the skill saves
// the answer in the right place), the garden's details, and your note.
export function claudePrompt({ kind, id, plantId, note = "", context }) {
  const lines = kind === "plant"
    ? ["Plant health check from my garden app. Use my plant-diagnostics skill on the photo I'm attaching, then save the answer to my garden app with the Supabase connector, as the skill describes."]
    : ["Friend or foe? A bug from my garden app. Use my friend-or-foe skill on the photo I'm attaching, then save the answer to my garden app with the Supabase connector, as the skill describes."];
  lines.push("", `check_id: ${id}`, `plant_id: ${plantId || "none"}`);
  if (note.trim()) lines.push("", `My note: ${note.trim()}`);
  lines.push("", context);
  return lines.join("\n");
}
// The Claude app (claude://), or claude.ai in the browser, opened with the prompt filled in where it can be.
export const claudeLinks = (prompt) => ({
  app: `claude://claude.ai/new?q=${encodeURIComponent(prompt)}`,
  web: `https://claude.ai/new?q=${encodeURIComponent(prompt)}`,
});

// ---------- what Claude is told about the garden ----------
// Plain text: the date and season, frost dates, soil, and (when the photo is of a known plant) that plant's
// record and recent notes. For a bug, the kinds of plants in the garden, so it can say which ones it matters for.
export function gardenContext({ today, site = {}, plant = null, species = null, areaName = "", notes = [], kinds = [] }) {
  const [y, m, d] = today.split("-").map(Number);
  const md = (s) => { const [mm, dd] = String(s || "").split("-").map(Number); return mm ? `${MONTH_NAMES[mm - 1]} ${dd}` : ""; };
  const lines = [
    `Today is ${MONTH_NAMES[m - 1]} ${d}, ${y}.`,
    `Garden: ${site.location || "Salem, MA area"}, USDA zone ${site.usdaZone || "7a"}.`,
  ];
  if (site.lastSpringFrost) lines.push(`Typical last spring frost ${md(site.lastSpringFrost)}; safe planting date for tender plants ${md(site.safePlantingDate)}; first fall frost usually around ${md(site.firstFallFrost)} (watch from ${md(site.earlyFrostWatch)}); first hard freeze around ${md(site.hardFreeze)}.`);
  for (const s of site.soil || []) {
    if (s.results && !/not recorded/i.test(s.results)) lines.push(`Soil test, zone ${s.zone}: ${s.results} Where: ${s.where}`);
  }
  if (plant) {
    const sp = species || {};
    lines.push("", "The photo is of this plant in the garden:");
    lines.push(`- Name: ${plant.name}${plant.label && plant.label !== plant.name ? ` (${plant.label})` : ""}`);
    lines.push(`- Kind on record: ${sp.commonName || plant.speciesId}${sp.scientificName && sp.scientificName !== "unknown" ? ` (${sp.scientificName})` : ""}${plant.confirmedByOwner ? ", confirmed by Noah" : `, identified from photos with ${plant.idConfidence ?? "?"}% confidence`}`);
    if (plant.alsoPossible?.length && !plant.confirmedByOwner) lines.push(`- Could also be: ${plant.alsoPossible.join("; ")}`);
    if (areaName) lines.push(`- Where: ${areaName}`);
    if (plant.finished) lines.push(`- Marked finished for the season on ${plant.finished}`);
    if (plant.season?.state) lines.push(`- Marked "${plant.season.state === "dead" ? "dead" : "still growing"}" on ${plant.season.on}`);
    if (plant.issues?.length) lines.push(`- Known issues: ${plant.issues.join("; ")}`);
    if (plant.notes) lines.push(`- Notes: ${plant.notes}`);
    const recent = notes.filter((n) => n.body).slice(0, 6);
    if (recent.length) {
      lines.push("- Recent notes in Noah's log, newest first:");
      for (const n of recent) lines.push(`  - ${n.date}: ${n.body.slice(0, 300)}`);
    }
  }
  if (kinds.length) lines.push("", `Plants growing in the garden: ${kinds.join(", ")}.`);
  return lines.join("\n");
}
