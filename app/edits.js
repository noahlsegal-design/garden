// Plant changes made in the app: confirming an ID, renaming, marking a plant finished for the season, and (in
// Edit mode) adding, moving, resizing and removing plants. They're saved (in Supabase, or on the Mac before the app went online) as changes layered on top of
// data/plants.json: the file stays the starting point, and each change replaces one detail of one plant.
// "Save app edits into files" on the Mac writes them into plants.json. Nothing here draws anything.
//
// The app keeps changes as { plantId: { field: edit } }, where field is the detail's name in plants.json and
// an edit is { v: the new value (null takes the detail away), at: when, by: who (empty for this device),
// saved: true once written into plants.json on the Mac, fileHad: what the file had before that }.
//
// A plant added in the app isn't in plants.json at all. Its starting details are one change, "added", whose
// value is the whole plant as plants.json would have it; later changes (a move, say) go on top as usual.
// "removed" hides a plant from the yard and This week without erasing it, so it can be put back.
//
// Arch trellises changed in Edit mode (moved, resized, turned, given another shape) are kept the same way, under
// the ID "structure-" plus the arch's id in data/layout.json, and "Save app edits into files" writes them there.

import { MONTH_NAMES, SEASON_STATES, seasonWords } from "./data.js";
import { acrossText, tallText, stemsText, isSupport, SUPPORTS, SHAPES } from "./look.js";
import { ARCH_FIELDS, ARCH_SHAPES, usableArchValue } from "./arches.js";

export const EDITABLE = ["name", "speciesId", "confirmedByOwner", "idConfidence", "finished", "position", "size", "width", "height", "stems", "shape", "support", "area", "removed", "season"];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const num = (v) => typeof v === "number" && Number.isFinite(v);
// Whether a value makes sense for its detail. One that doesn't (from an older or newer copy of the app, say) is ignored.
function usable(field, v, species) {
  if (v == null) return !["position", "size", "area", "speciesId", "name"].includes(field); // a height can be taken away
  if (field === "speciesId") return species.has(v);
  if (field === "position") return num(v.x) && num(v.z);
  if (field === "size") return num(v) && v > 0 && v <= 10;
  if (field === "width" || field === "height") return num(v) && v > 0 && v <= 40; // feet
  if (field === "stems") return Number.isInteger(v) && v >= 1 && v <= 999;
  if (field === "support") return isSupport(v);
  if (field === "shape") return SHAPES.some((s) => s.id === v);
  if (field === "season") return SEASON_STATES.includes(v.state) && /^\d{4}-\d{2}-\d{2}$/.test(v.on || "");
  return true;
}

// ---------- plants added in the app ----------
// A permanent ID for a new plant: its kind plus when it was added, so two phones never pick the same one.
export function newPlantId(speciesId, now = Date.now()) {
  return `${speciesId.slice(0, 40)}-${now.toString(36)}${Math.floor(Math.random() * 36 ** 2).toString(36).padStart(2, "0")}`;
}
// A new plant's details, laid out like the others in plants.json. Choosing a kind that's still a placeholder
// ("unknown perennial") leaves its ID unconfirmed.
export function newPlant({ id, name, speciesId, area, position, unsure = false }) {
  return {
    id, label: name, area, name, speciesId,
    idConfidence: unsure ? 30 : 100, confirmedByOwner: !unsure, alsoPossible: [], photos: [],
    position: { x: Math.round(position.x * 10) / 10, z: Math.round(position.z * 10) / 10 },
    size: 1, issues: [], notes: null, needsAttention: false,
  };
}
// The starting details of a plant added in the app, or null if it isn't one (or isn't showing on this copy).
function addedBase(id, fields, species, onMac) {
  const e = fields?.added;
  const v = e?.v;
  if (!v || typeof v !== "object" || !inForce(e, null, onMac)) return null;
  if (!species.has(v.speciesId) || !usable("position", v.position, species) || typeof v.name !== "string") return null;
  return { alsoPossible: [], photos: [], issues: [], size: 1, ...v, id };
}
// What a plant's changes are measured against: its line in plants.json, or for a plant added in the app, the
// details it was added with.
export function basePlant(plants, edits, species, onMac, id) {
  return plants.find((p) => p.id === id) || addedBase(id, edits?.[id], species, onMac);
}

// Whether a change shows. An unsaved one always does. A saved one is already in the Mac's plants.json, and the
// website keeps showing it until the website's own plants.json has moved on from what the file had (once the
// garden is published), so phones never flash back to the old name in between.
export function inForce(edit, fileValue, onMac) {
  if (!edit.saved) return true;
  return !onMac && same(fileValue, edit.fileHad);
}

function layer(p, mine, species, onMac) {
  if (!mine) return p;
  let out = p;
  for (const [field, e] of Object.entries(mine)) {
    if (!EDITABLE.includes(field) || !e || !inForce(e, p[field], onMac) || !usable(field, e.v, species)) continue;
    if (out === p) out = { ...p };
    if (e.v == null) delete out[field];
    else out[field] = e.v;
  }
  return out;
}

// The plants with the app's changes on top, followed by any plants added in the app. Removed plants are still
// listed (with "removed" set), so their cards can offer to put them back.
export function withEdits(plants, edits, species, onMac) {
  const out = plants.map((p) => layer(p, edits?.[p.id], species, onMac));
  const inFile = new Set(plants.map((p) => p.id));
  for (const [id, fields] of Object.entries(edits || {})) {
    const base = !inFile.has(id) && addedBase(id, fields, species, onMac);
    if (!base) continue;
    const p = layer(base, fields, species, onMac);
    out.push(p.label === base.name && p.name !== base.name ? { ...p, label: p.name } : p);
  }
  return out;
}

// The change to send when a detail is set to `value`. Setting it back to what plants.json says clears the
// change instead, unless a saved change is still waiting to be published (then the new value has to win).
export function editFor(filePlant, edits, field, value, at) {
  const current = edits?.[filePlant.id]?.[field];
  if (same(filePlant[field], value) && !current?.saved) return null;
  return { v: value ?? null, at };
}

// Changes not yet written into plants.json that would change it: what "Save app edits into files" shows.
// A change to a plant that's no longer in the file comes back with plant: null. A plant added in the app is
// one row (field "added") whose `to` is the whole plant with any later changes folded in; `dropped` means it
// was removed again before ever reaching the file, so there's nothing to write.
export function unsavedEdits(plants, edits, species) {
  const byId = new Map(plants.map((p) => [p.id, p]));
  const out = [];
  for (const [id, fields] of Object.entries(edits || {})) {
    if (isStructureEdit(id)) continue; // arches have their own (unsavedStructureEdits)
    const plant = byId.get(id) || null;
    if (!plant && fields.added) {
      const base = species && !fields.added.saved && addedBase(id, fields, species, true);
      if (!base) continue;
      const to = withEdits([], { [id]: fields }, species, true)[0];
      out.push({ id, plant: null, field: "added", from: null, to, edit: fields.added, dropped: Boolean(to.removed) });
      continue;
    }
    for (const [field, e] of Object.entries(fields)) {
      if (!e || e.saved || !EDITABLE.includes(field)) continue;
      if (plant && same(plant[field], e.v)) continue;
      out.push({ id, plant, field, from: plant ? plant[field] ?? null : null, to: e.v ?? null, edit: e });
    }
  }
  return out;
}

// Saved changes this copy of plants.json has moved past (the garden was published, or the file was changed
// by hand since): nothing uses them any more, so the website clears them.
export function staleEdits(plants, edits) {
  const byId = new Map(plants.map((p) => [p.id, p]));
  const out = [];
  for (const [id, fields] of Object.entries(edits || {})) {
    if (isStructureEdit(id)) continue;
    for (const [field, e] of Object.entries(fields)) {
      if (!e?.saved) continue;
      // A saved new plant waits until the file has it; any other saved change, until the file has moved past it.
      if (field === "added" ? byId.has(id) : !byId.has(id) || !same(byId.get(id)[field], e.fileHad)) out.push([id, field]);
    }
  }
  return out;
}

// ---------- arch trellises ----------
export const STRUCTURE = "structure-";
export const isStructureEdit = (id) => id.startsWith(STRUCTURE);
// An arch as its changes are measured against: its details in layout.json (position as { x, z }), with the
// change ID as its id.
export function structureBase(s) {
  const out = { id: STRUCTURE + s.id, position: { x: s.x, z: s.z } };
  for (const f of ARCH_FIELDS) if (f !== "position" && s[f] != null) out[f] = s[f];
  return out;
}
// layout.json's structures with Edit mode's changes on top.
export function withStructureEdits(structures, edits, onMac) {
  return structures.map((s) => {
    const mine = edits?.[STRUCTURE + s.id];
    if (!mine) return s;
    const base = structureBase(s);
    let out = s;
    for (const [field, e] of Object.entries(mine)) {
      if (!ARCH_FIELDS.includes(field) || !e || !inForce(e, base[field], onMac) || !usableArchValue(field, e.v)) continue;
      if (out === s) out = { ...s };
      if (field === "position") Object.assign(out, { x: e.v.x, z: e.v.z });
      else out[field] = e.v;
    }
    return out;
  });
}
// Arch changes not yet in layout.json, like unsavedEdits: { id, structure, field, from, to, edit }.
export function unsavedStructureEdits(structures, edits) {
  const out = [];
  for (const s of structures) {
    const base = structureBase(s);
    for (const [field, e] of Object.entries(edits?.[base.id] || {})) {
      if (!e || e.saved || !ARCH_FIELDS.includes(field) || same(base[field], e.v)) continue;
      out.push({ id: base.id, structure: s, field, from: base[field] ?? null, to: e.v ?? null, edit: e });
    }
  }
  return out;
}
// Saved arch changes this copy of layout.json has moved past, like staleEdits.
export function staleStructureEdits(structures, edits) {
  const byId = new Map(structures.map((s) => [STRUCTURE + s.id, structureBase(s)]));
  const out = [];
  for (const [id, fields] of Object.entries(edits || {})) {
    if (!isStructureEdit(id)) continue;
    for (const [field, e] of Object.entries(fields)) {
      if (e?.saved && (!byId.has(id) || !same(byId.get(id)[field], e.fileHad))) out.push([id, field]);
    }
  }
  return out;
}

// ---------- in words ----------
export function dateText(ymdText) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymdText || "");
  return m ? `${MONTH_NAMES[m[2] - 1].slice(0, 3)} ${Number(m[3])}, ${m[1]}` : "";
}
const shortDate = (iso) => dateText(iso).replace(/, \d{4}$/, "");
const kindName = (species, id) => species.get(id)?.commonName || id;
// A spot in the yard in words: feet left or right of the middle of the deck, and out from it.
export function spotText(pos) {
  if (!pos) return "—";
  const x = Math.round(Math.abs(pos.x) * 10) / 10, z = Math.round(pos.z * 10) / 10;
  return `${x ? `${x} ft ${pos.x < 0 ? "left" : "right"}` : "center"}, ${z} ft out`;
}

// One line per detail, for the "Save app edits into files" review.
const shapeName = (v) => (v ? SHAPES.find((s) => s.id === v)?.name || v : "Its kind's usual shape");
const supportName = (v) => (v ? SUPPORTS.find((s) => s.id === v)?.name || v : "Its kind's usual way");
export function fieldText(row, species, areaNames = new Map()) {
  const f = row.field, show = (v) => (v == null || v === "" ? "—" : v);
  if (row.structure) {
    const feet = (v) => (v == null ? "—" : `${v} ft`);
    if (f === "position") return ["Spot", spotText(row.from), spotText(row.to)];
    if (f === "shape") return ["Shape", show(ARCH_SHAPES.find((a) => a.id === row.from)?.name || "Round"), show(ARCH_SHAPES.find((a) => a.id === row.to)?.name)];
    if (f === "turn") return ["Turned", `${row.from ?? 0}°`, `${row.to}°`];
    return [{ width: "Width", height: "Height", depth: "Depth" }[f] || f, feet(row.from), feet(row.to)];
  }
  const sp = row.plant && species.get(row.plant.speciesId);
  if (f === "name") return ["Name", `“${show(row.from)}”`, `“${show(row.to)}”`];
  if (f === "speciesId") return ["Kind", show(row.from && kindName(species, row.from)), show(row.to && kindName(species, row.to))];
  if (f === "confirmedByOwner") return ["ID confirmed", row.from ? "yes" : "no", row.to ? "yes" : "no"];
  if (f === "idConfidence") return ["ID confidence", row.from == null ? "—" : `${row.from}%`, row.to == null ? "—" : `${row.to}%`];
  if (f === "finished") return ["Finished for the season", row.from ? dateText(row.from) : "no", row.to ? dateText(row.to) : "no"];
  if (f === "position") return ["Spot", spotText(row.from), spotText(row.to)];
  if (f === "size") return ["Width", row.from == null ? "—" : acrossText({ ...row.plant, size: row.from }, sp), acrossText({ ...row.plant, size: row.to }, sp)];
  if (f === "width") return ["Width", acrossText({ ...row.plant, width: row.from }, sp), acrossText({ ...row.plant, width: row.to }, sp)];
  if (f === "height") return ["Height", tallText({ ...row.plant, height: row.from }, sp), tallText({ ...row.plant, height: row.to }, sp)];
  if (f === "stems") return ["Main stems or trunks", row.from == null ? "—" : String(row.from), row.to == null ? "—" : String(row.to)];
  if (f === "support") return ["Grows on", supportName(row.from), supportName(row.to)];
  if (f === "shape") return ["Shape", shapeName(row.from), shapeName(row.to)];
  if (f === "area") return ["Bed", show(areaNames.get(row.from) || row.from), show(areaNames.get(row.to) || row.to)];
  if (f === "season") {
    const said = (v) => (v ? `${seasonWords(v.state)} (${dateText(v.on)})` : "as the calendar says");
    return ["How it's really doing", said(row.from), said(row.to)];
  }
  if (f === "removed") return ["Removed from the yard", row.from ? dateText(row.from) : "no", row.to ? dateText(row.to) : "no"];
  return [f, JSON.stringify(row.from), JSON.stringify(row.to)];
}

// What's been changed in the app on this plant, for its card: adding it, confirming the ID (which sets up to
// three details at once), renaming, finishing, moving, resizing and removing. Each comes with the details to
// clear to undo it (none for adding: removing a plant is how to take it out of the yard).
const ID_FIELDS = ["confirmedByOwner", "idConfidence", "speciesId"];
export function describeEdits(filePlant, edits, species, onMac, me, areaNames = new Map()) {
  const mine = edits?.[filePlant.id] || {};
  const live = (f) => {
    const e = mine[f];
    return e && !e.saved && inForce(e, filePlant[f], onMac) && !same(filePlant[f], e.v) ? e : null;
  };
  const who = (list) => {
    const latest = list.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))[0];
    const by = !latest.by || latest.by === me ? "you" : latest.by.split("@")[0];
    return [by, shortDate(latest.at)].filter(Boolean).join(", ");
  };
  const out = [];
  const added = mine.added && !mine.added.saved ? mine.added : null;
  if (added && !filePlant.added) out.push({ key: "added", text: "Added in the app", fields: [], who: who([added]) });
  const idEdits = ID_FIELDS.filter(live);
  if (idEdits.length) {
    const kind = live("speciesId");
    const text = live("confirmedByOwner")?.v
      ? `ID confirmed${kind ? ` as ${kindName(species, kind.v)}` : ""}`
      : kind ? `Kind changed to ${kindName(species, kind.v)}` : "ID details changed";
    out.push({ key: "id", text, fields: idEdits, who: who(idEdits.map(live)) });
  }
  const name = live("name");
  if (name) out.push({ key: "name", text: `Renamed from “${filePlant.name}”`, fields: ["name"], who: who([name]) });
  const fin = live("finished");
  if (fin) out.push({ key: "finished", text: fin.v ? "Marked finished for the season" : "Brought back for the season", fields: ["finished"], who: who([fin]) });
  const moves = ["position", "area"].filter(live);
  if (moves.length) {
    const area = live("area");
    out.push({ key: "moved", text: area ? `Moved to ${areaNames.get(area.v) || area.v}` : "Moved", fields: moves, who: who(moves.map(live)) });
  }
  const sizes = ["size", "width", "height"].filter(live);
  if (sizes.length) out.push({ key: "size", text: "Resized", fields: sizes, who: who(sizes.map(live)) });
  const stems = live("stems");
  if (stems) out.push({ key: "stems", text: stems.v ? `Set to ${stemsText(stems.v)}` : "Main stems cleared", fields: ["stems"], who: who([stems]) });
  const shape = live("shape");
  if (shape) out.push({ key: "shape", text: shape.v ? `Shape set to ${shapeName(shape.v)}` : "Shape back to its kind's usual", fields: ["shape"], who: who([shape]) });
  const support = live("support");
  if (support) out.push({ key: "support", text: support.v ? `Grows on ${supportName(support.v).replace(/^The /, "the ").replace(/^A /, "a ")}` : "Grows its kind's usual way", fields: ["support"], who: who([support]) });
  const season = live("season");
  if (season) out.push({ key: "season", text: season.v ? `Marked ${seasonWords(season.v.state)}` : "Back to the calendar", fields: ["season"], who: who([season]) });
  const gone = live("removed");
  if (gone) out.push({ key: "removed", text: gone.v ? "Removed from the yard" : "Put back in the yard", fields: ["removed"], who: who([gone]) });
  return out;
}
