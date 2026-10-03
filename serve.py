# The tiny web server behind "Start Garden.command". It's Python's built-in file server with two additions:
# - It tells browsers to check for a newer copy of each file every time (a quick "has it changed?" question),
#   so after an update your phone never runs a mix of old and new app files.
# - It keeps your This week check-offs, recorded frost dates and plant changes in data/checkoffs.json when no
#   garden account is connected (app/config.js), so your phone and computer share one list.
# - "Save app edits into files" (in the All plants list on this Mac) writes plant changes made in the app into
#   data/plants.json. Only the Mac itself can ask for that, not other devices on the Wi-Fi.
# Usage: python3 serve.py 8321

import http.server
import json
import os
import re
import sys
import threading
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.abspath(__file__))
CHECKOFFS = os.path.join(ROOT, "data", "checkoffs.json")
PLANTS = os.path.join(ROOT, "data", "plants.json")
SPECIES = os.path.join(ROOT, "data", "species.json")
LAYOUT = os.path.join(ROOT, "data", "layout.json")
LOCK = threading.Lock()  # one change at a time, even if the phone and computer save together
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
FIELD = re.compile(r"[A-Za-z]{1,40}")
PLANT_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,99}")
ABOUT = "Your This week check-offs, recorded first-frost dates and plant changes made in the app. The app keeps this file up to date, so there's no need to edit it."


def load():
    try:
        with open(CHECKOFFS, encoding="utf-8") as f:
            saved = json.load(f)
    except (OSError, ValueError):
        saved = {}
    return {"done": dict(saved.get("done") or {}), "frosts": dict(saved.get("frosts") or {}), "edits": dict(saved.get("edits") or {})}


def save(state):
    # Check-offs older than about 13 months are dropped so the file doesn't grow forever.
    cutoff = (date.today() - timedelta(days=400)).isoformat()
    state = {
        "done": {k: v for k, v in sorted(state["done"].items()) if v >= cutoff},
        "frosts": dict(sorted(state["frosts"].items())),
        "edits": {k: v for k, v in sorted(state["edits"].items()) if v},
    }
    write_json(CHECKOFFS, {"_about": ABOUT, **state})
    return state


def write_json(path, value):
    temp = path + ".saving"
    with open(temp, "w", encoding="utf-8") as f:
        json.dump(value, f, indent=2, ensure_ascii=False)
    os.replace(temp, path)  # swap in the new file all at once, so it's never half-written


def apply(state, change):
    for key, day in (change.get("set") or {}).items():
        if isinstance(key, str) and len(key) <= 300 and isinstance(day, str) and DATE.fullmatch(day):
            state["done"][key] = day
    for key in change.get("unset") or []:
        state["done"].pop(key, None)
    for year, day in (change.get("frosts") or {}).items():
        if not re.fullmatch(r"\d{4}", str(year)):
            continue
        if day is None:
            state["frosts"].pop(str(year), None)
        elif isinstance(day, str) and DATE.fullmatch(day):
            state["frosts"][str(year)] = day
    for plant_id, fields in (change.get("edits") or {}).items():
        if not (isinstance(plant_id, str) and 0 < len(plant_id) <= 100 and isinstance(fields, dict)):
            continue
        mine = state["edits"].setdefault(plant_id, {})
        for field, edit in fields.items():
            if not FIELD.fullmatch(field):
                continue
            if edit is None:
                mine.pop(field, None)
            elif isinstance(edit, dict) and "v" in edit and len(json.dumps(edit)) <= 10000:
                mine[field] = {k: edit[k] for k in ("v", "at", "saved", "fileHad") if k in edit}
        if not mine:
            del state["edits"][plant_id]


# ---------- "Save app edits into files" ----------
def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) != float("inf")


# The details the app can change, and what a good value looks like. Returns the value tidied up for the file
# (None takes the detail away), or BAD.
BAD = object()


def clean(field, value, kinds, areas):
    if isinstance(value, str):
        value = value.strip()
    if field == "name":
        return value if isinstance(value, str) and 0 < len(value) <= 120 else BAD
    if field == "speciesId":
        return value if value in kinds else BAD
    if field == "confirmedByOwner":
        return value if isinstance(value, bool) else BAD
    if field == "idConfidence":
        return value if isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 100 else BAD
    if field in ("finished", "removed"):  # a date, or None to bring the plant back
        return value if value is None or (isinstance(value, str) and DATE.fullmatch(value)) else BAD
    if field == "position":  # feet across and out from the deck, to a tenth of a foot
        if isinstance(value, dict) and set(value) == {"x", "z"} and all(is_number(value[k]) and abs(value[k]) <= 200 for k in value):
            return {"x": round(value["x"], 1), "z": round(value["z"], 1)}
        return BAD
    if field == "size":
        return round(value, 2) if is_number(value) and 0.2 <= value <= 6 else BAD
    if field == "height":  # feet tall when grown, or None to work it out from the width again
        return value if value is None else round(value, 1) if is_number(value) and 0.2 <= value <= 30 else BAD
    if field == "area":
        return value if value in areas else BAD
    return BAD


# A plant added in the app, laid out like the others in plants.json, or None if something about it is wrong.
NEW_PLANT_ORDER = ["id", "label", "area", "name", "speciesId", "idConfidence", "confirmedByOwner", "alsoPossible", "photos", "position", "size", "issues", "notes", "needsAttention"]


def new_plant(plant_id, value, kinds, areas):
    if not (isinstance(value, dict) and PLANT_ID.fullmatch(plant_id)):
        return None
    plant = {"id": plant_id}
    for field in ("area", "name", "speciesId", "idConfidence", "confirmedByOwner", "position", "size"):
        tidy = clean(field, value.get(field), kinds, areas)
        if tidy is BAD or tidy is None:
            return None
        plant[field] = tidy
    label = value.get("label") if isinstance(value.get("label"), str) and value.get("label").strip() else plant["name"]
    plant.update({"label": label.strip()[:120], "alsoPossible": [], "photos": [], "issues": [], "notes": None, "needsAttention": False})
    out = {k: plant[k] for k in NEW_PLANT_ORDER}
    for field in ("height", "finished", "removed"):
        tidy = clean(field, value.get(field), kinds, areas)
        if tidy is not BAD and tidy is not None:
            set_detail(out, field, tidy)
    return out


def set_detail(plant, field, value):
    if value is None:
        plant.pop(field, None)
    elif field in plant:
        plant[field] = value
    else:  # a new detail goes just under the plant's name, where it's easy to spot (a height goes with the size)
        after = "size" if field == "height" and "size" in plant else "name"
        items = list(plant.items())
        plant.clear()
        for key, old in items:
            plant[key] = old
            if key == after:
                plant[field] = value
        plant.setdefault(field, value)


# Writes {plantId: {field: value}} into plants.json and says what each detail was before. A plant added in the
# app comes as {plantId: {"added": the whole plant}} and goes in after the last plant in the same bed.
def save_edits(edits):
    with open(PLANTS, encoding="utf-8") as f:
        data = json.load(f)
    with open(SPECIES, encoding="utf-8") as f:
        kinds = {s["id"] for s in json.load(f)["species"]}
    with open(LAYOUT, encoding="utf-8") as f:
        areas = {a["id"] for a in json.load(f)["areas"]} | {"fenceline"}
    by_id = {p["id"]: p for p in data["plants"]}
    had, skipped = {}, []
    for plant_id, fields in edits.items():
        if isinstance(fields, dict) and "added" in fields:
            plant = None if plant_id in by_id else new_plant(plant_id, fields["added"], kinds, areas)
            if plant is None:
                skipped.append(f"{plant_id} added")
                continue
            same_bed = [i for i, p in enumerate(data["plants"]) if p.get("area") == plant["area"]]
            data["plants"].insert(same_bed[-1] + 1 if same_bed else len(data["plants"]), plant)
            by_id[plant_id] = plant
            had[plant_id] = {"added": None}
            continue
        plant = by_id.get(plant_id)
        if plant is None or not isinstance(fields, dict):
            skipped.append(plant_id)
            continue
        for field, value in fields.items():
            value = clean(field, value, kinds, areas)
            if value is BAD:
                skipped.append(f"{plant_id} {field}")
                continue
            had.setdefault(plant_id, {})[field] = plant.get(field)
            set_detail(plant, field, value)
    if had:
        write_json(PLANTS, data)
    return {"fileHad": had, "skipped": skipped}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):  # keep the Terminal window quiet
        pass

    def send_json(self, value):
        body = json.dumps(value).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/checkoffs":
            with LOCK:
                return self.send_json(load())
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        if path not in ("/api/checkoffs", "/api/save-edits"):
            return self.send_error(404)
        # Only the garden app itself may save: other web pages open in the browser can't send JSON here.
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            return self.send_error(415)
        if path == "/api/save-edits" and self.client_address[0] not in ("127.0.0.1", "::1", "::ffff:127.0.0.1"):
            return self.send_error(403, "Save app edits into files from the Mac itself")
        length = int(self.headers.get("Content-Length") or 0)
        if length > 1_000_000:
            return self.send_error(413)
        try:
            change = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return self.send_error(400)
        if not isinstance(change, dict):
            return self.send_error(400)
        with LOCK:
            if path == "/api/save-edits":
                edits = change.get("edits")
                return self.send_json(save_edits(edits)) if isinstance(edits, dict) else self.send_error(400)
            state = load()
            apply(state, change)
            state = save(state)
        return self.send_json(state)


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8321
http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
