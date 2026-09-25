// Plant changes made in the app: confirming an ID, renaming, and marking a plant finished for the season.
// They're saved (in Supabase, or on the Mac before the app went online) as changes layered on top of
// data/plants.json: the file stays the starting point, and each change replaces one detail of one plant.
// "Save app edits into files" on the Mac writes them into plants.json. Nothing here draws anything.
//
// The app keeps changes as { plantId: { field: edit } }, where field is the detail's name in plants.json and
// an edit is { v: the new value (null takes the detail away), at: when, by: who (empty for this device),
// saved: true once written into plants.json on the Mac, fileHad: what the file had before that }.

import { MONTH_NAMES } from "./data.js";

export const EDITABLE = ["name", "speciesId", "confirmedByOwner", "idConfidence", "finished"];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Whether a change shows. An unsaved one always does. A saved one is already in the Mac's plants.json, and the
// website keeps showing it until the website's own plants.json has moved on from what the file had (once the
// garden is published), so phones never flash back to the old name in between.
export function inForce(edit, fileValue, onMac) {
  if (!edit.saved) return true;
  return !onMac && same(fileValue, edit.fileHad);
}

// The plants with the app's changes on top.
export function withEdits(plants, edits, species, onMac) {
  return plants.map((p) => {
    const mine = edits?.[p.id];
    if (!mine) return p;
    let out = p;
    for (const [field, e] of Object.entries(mine)) {
      if (!EDITABLE.includes(field) || !e || !inForce(e, p[field], onMac)) continue;
      if (field === "speciesId" && !species.has(e.v)) continue;
      if (out === p) out = { ...p };
      if (e.v == null) delete out[field];
      else out[field] = e.v;
    }
    return out;
  });
}

// The change to send when a detail is set to `value`. Setting it back to what plants.json says clears the
// change instead, unless a saved change is still waiting to be published (then the new value has to win).
export function editFor(filePlant, edits, field, value, at) {
  const current = edits?.[filePlant.id]?.[field];
  if (same(filePlant[field], value) && !current?.saved) return null;
  return { v: value ?? null, at };
}

// Changes not yet written into plants.json that would change it: what "Save app edits into files" shows.
// A change to a plant that's no longer in the file comes back with plant: null.
export function unsavedEdits(plants, edits) {
  const byId = new Map(plants.map((p) => [p.id, p]));
  const out = [];
  for (const [id, fields] of Object.entries(edits || {})) {
    const plant = byId.get(id) || null;
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

// One line per detail, for the "Save app edits into files" review.
export function fieldText(row, species) {
  const f = row.field, show = (v) => (v == null || v === "" ? "—" : v);
  if (f === "name") return ["Name", `“${show(row.from)}”`, `“${show(row.to)}”`];
  if (f === "speciesId") return ["Kind", show(row.from && kindName(species, row.from)), show(row.to && kindName(species, row.to))];
  if (f === "confirmedByOwner") return ["ID confirmed", row.from ? "yes" : "no", row.to ? "yes" : "no"];
  if (f === "idConfidence") return ["ID confidence", row.from == null ? "—" : `${row.from}%`, row.to == null ? "—" : `${row.to}%`];
  if (f === "finished") return ["Finished for the season", row.from ? dateText(row.from) : "no", row.to ? dateText(row.to) : "no"];
  return [f, JSON.stringify(row.from), JSON.stringify(row.to)];
}

// What's been changed in the app on this plant, for its card: confirming the ID (which sets up to three
// details at once), renaming, and finishing. Each comes with the details to clear to undo it.
const ID_FIELDS = ["confirmedByOwner", "idConfidence", "speciesId"];
export function describeEdits(filePlant, edits, species, onMac, me) {
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
  return out;
}
