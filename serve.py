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
LOCK = threading.Lock()  # one change at a time, even if the phone and computer save together
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
FIELD = re.compile(r"[A-Za-z]{1,40}")
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
# The details the app can change, and what a good value looks like. None takes the detail away.
def good_value(field, value, kinds):
    if field == "name":
        return isinstance(value, str) and 0 < len(value.strip()) <= 120
    if field == "speciesId":
        return value in kinds
    if field == "confirmedByOwner":
        return isinstance(value, bool)
    if field == "idConfidence":
        return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 100
    if field == "finished":
        return value is None or (isinstance(value, str) and DATE.fullmatch(value) is not None)
    return False


def set_detail(plant, field, value):
    if value is None:
        plant.pop(field, None)
    elif field in plant:
        plant[field] = value
    else:  # a new detail goes just under the plant's name, where it's easy to spot
        items = list(plant.items())
        plant.clear()
        for key, old in items:
            plant[key] = old
            if key == "name":
                plant[field] = value
        plant.setdefault(field, value)


# Writes {plantId: {field: value}} into plants.json and says what each detail was before.
def save_edits(edits):
    with open(PLANTS, encoding="utf-8") as f:
        data = json.load(f)
    with open(SPECIES, encoding="utf-8") as f:
        kinds = {s["id"] for s in json.load(f)["species"]}
    by_id = {p["id"]: p for p in data["plants"]}
    had, skipped = {}, []
    for plant_id, fields in edits.items():
        plant = by_id.get(plant_id)
        if plant is None or not isinstance(fields, dict):
            skipped.append(plant_id)
            continue
        for field, value in fields.items():
            if isinstance(value, str):
                value = value.strip()
            if not good_value(field, value, kinds):
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
