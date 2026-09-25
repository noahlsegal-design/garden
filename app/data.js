// Loads the garden data files and answers questions about them (what a plant looks like this month,
// what care is due, is it safe for the dog). Nothing here draws anything.

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function seasonOf(m) {
  if (m <= 1 || m === 11) return { name: "Winter", color: "var(--winter)" };
  if (m <= 4) return { name: "Spring", color: "var(--spring)" };
  if (m <= 7) return { name: "Summer", color: "var(--summer)" };
  return { name: "Fall", color: "var(--fall)" };
}

async function loadJson(path) {
  let res;
  try {
    res = await fetch(path, { cache: "no-store" });
  } catch (e) {
    throw new Error(`Couldn't reach ${path}. Is the garden app running? (Open it with "Start Garden.command" rather than double-clicking index.html.)`);
  }
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status}).`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${path} has a typo, so it can't be read. This usually means a missing comma or quote near the spot below.\n\n${e.message}`);
  }
}

export async function loadGarden() {
  const [plantsFile, speciesFile, layout] = await Promise.all([
    loadJson("data/plants.json"), loadJson("data/species.json"), loadJson("data/layout.json"),
  ]);
  const species = new Map(speciesFile.species.map((s) => [s.id, s]));
  const plants = plantsFile.plants.filter((p) => {
    if (species.has(p.speciesId)) return true;
    console.warn(`Plant ${p.id} points to unknown speciesId "${p.speciesId}" and was skipped.`);
    return false;
  });
  const areaNames = new Map(layout.areas.map((a) => [a.id, a.name]));
  areaNames.set("fenceline", "Along the back chain-link");
  return { plants, species, layout, areaNames };
}

// ---------- ID confidence ----------
export const isUnconfirmed = (p) => !p.confirmedByOwner && p.idConfidence < 50;

// ---------- dog safety ----------
// Order matters: the most cautious answer wins.
const TOX_RANK = { toxic: 4, caution: 3, check: 2, "not-listed": 1, "non-toxic": 0 };
export const TOX_INFO = {
  toxic: { label: "Toxic to dogs", cls: "toxic" },
  caution: { label: "Caution: may harm dogs", cls: "caution" },
  check: { label: "Dog safety unknown", cls: "caution" },
  "not-listed": { label: "Not on ASPCA toxic list", cls: "" },
  "non-toxic": { label: "Non-toxic to dogs", cls: "safe" },
};

export function dogSafety(plant, sp) {
  const base = sp.dogToxic || { status: "check", detail: "No information yet.", source: null };
  // The extra caution is for plants whose ID isn't confirmed, so it stops once you confirm one.
  const override = plant.confirmedByOwner ? null : plant.dogToxicOverride;
  if (!override || TOX_RANK[override] <= TOX_RANK[base.status]) return base;
  const alts = plant.alsoPossible?.length ? ` It could also be: ${plant.alsoPossible.join("; ")}.` : "";
  return { status: override, detail: `${base.detail} This plant's ID isn't confirmed, so treat it with caution until it is.${alts}`, source: base.source };
}
export const isDogRisk = (plant, sp) => ["toxic", "caution", "check"].includes(dogSafety(plant, sp).status);

// ---------- what the plant is doing this month ----------
export const STATE_TEXT = {
  dormant: ["Dormant", "Resting until spring. Nothing showing above ground, or just a crown."],
  "dormant-tan": ["Dormant (tan)", "Tan foliage left standing for winter cover and seeds."],
  emerging: ["Coming up", "New shoots are emerging."],
  seedling: ["Young plants", "Seedlings or young transplants."],
  leafing: ["Leafing out", "Buds are opening into new leaves."],
  rosette: ["Leafy rosette", "A low clump of leaves close to the ground."],
  foliage: ["In leaf", "Leafy and growing."],
  evergreen: ["Evergreen", "Keeps its leaves through winter."],
  bloom: ["In bloom", "Flowering now."],
  "aging-bloom": ["Flowers aging", "Flowers are fading to pink or tan and can be left on."],
  fruit: ["Fruiting", "Fruit is forming or ripening."],
  harvest: ["Harvest time", "Ready to pick."],
  ferns: ["Ferny growth", "Tall feathery growth that feeds next year's crop. Let it grow."],
  seedheads: ["Gone to seed", "Seed heads are standing, which is good winter food for birds."],
  "fall-color": ["Fall color", "Leaves are changing color and dying back."],
  yellowing: ["Yellowing", "Leaves are yellowing and dying back for the year."],
  "frost-blackened": ["Frost-blackened", "Frost has killed the top growth. For dahlias, dig the tubers 1–2 weeks after this."],
  stored: ["Tubers in storage", "Dug up and stored indoors (cool, above freezing) for winter."],
  bare: ["Bare branches", "Leafless for winter."],
  "bare-flowerheads": ["Bare, with dried flower heads", "Leafless, with dried flowers left on for winter interest."],
  gone: ["Not in the ground", "Finished for the season or not planted yet."],
};

export function stateFor(sp, m) {
  return sp.seasonal?.[MONTHS[m]] || "foliage";
}
export function stateText(sp, m) {
  const s = stateFor(sp, m);
  return STATE_TEXT[s] || [s, ""];
}

// ---------- care ----------
export const CARE_TYPES = {
  prep: "Prep", plant: "Plant", prune: "Prune", water: "Water", feed: "Feed",
  pest: "Pests", divide: "Divide", harvest: "Harvest", winter: "Winter prep",
};
export function careFor(sp, m) {
  return (sp.care || []).filter((c) => c.months.includes(MONTHS[m]));
}
// Care for the other 11 months, starting with next month.
export function restOfYear(sp, m) {
  const out = [];
  for (let i = 1; i < 12; i++) {
    const mm = (m + i) % 12;
    const items = careFor(sp, mm);
    if (items.length) out.push({ month: mm, items });
  }
  return out;
}

// ---------- sources ----------
const HOSTS = [
  ["aspca.org", "ASPCA"], ["missouribotanicalgarden.org", "Missouri Botanical Garden"], ["plantfinder.mobot.org", "Missouri Botanical Garden"],
  ["ces.ncsu.edu", "NC State Extension"], ["umass.edu", "UMass Extension"], ["unh.edu", "UNH Extension"], ["uvm.edu", "UVM Extension"],
  ["osu.edu", "Ohio State Extension"], ["illinois.edu", "University of Illinois Extension"], ["uconn.edu", "UConn Extension"],
  ["iastate.edu", "Iowa State Extension"], ["cornell.edu", "Cornell"], ["msu.edu", "Michigan State Extension"],
  ["noaa.gov", "NOAA"],
];
export function sourceName(url) {
  try {
    const host = new URL(url).hostname;
    return (HOSTS.find(([h]) => host.endsWith(h)) || [null, host.replace(/^www\./, "")])[1];
  } catch { return url; }
}

// ---------- photos (web-sized copies live in /photos) ----------
export const photoName = (path) => path.split("/").pop().replace(/\.[^.]+$/, "");
export const photoUrl = (path) => `photos/${photoName(path)}.jpg`;
export const thumbUrl = (path) => `photos/thumbs/${photoName(path)}.jpg`;

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
