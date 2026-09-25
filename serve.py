# The tiny web server behind "Start Garden.command". It's Python's built-in file server with two additions:
# - It tells browsers to check for a newer copy of each file every time (a quick "has it changed?" question),
#   so after an update your phone never runs a mix of old and new app files.
# - It keeps your This week check-offs and recorded frost dates in data/checkoffs.json, so your phone and
#   computer share one list.
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
LOCK = threading.Lock()  # one change at a time, even if the phone and computer save together
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
ABOUT = "Your This week check-offs and recorded first-frost dates. The app keeps this file up to date, so there's no need to edit it."


def load():
    try:
        with open(CHECKOFFS, encoding="utf-8") as f:
            saved = json.load(f)
    except (OSError, ValueError):
        saved = {}
    return {"done": dict(saved.get("done") or {}), "frosts": dict(saved.get("frosts") or {})}


def save(state):
    # Check-offs older than about 13 months are dropped so the file doesn't grow forever.
    cutoff = (date.today() - timedelta(days=400)).isoformat()
    state = {
        "done": {k: v for k, v in sorted(state["done"].items()) if v >= cutoff},
        "frosts": dict(sorted(state["frosts"].items())),
    }
    temp = CHECKOFFS + ".saving"
    with open(temp, "w", encoding="utf-8") as f:
        json.dump({"_about": ABOUT, **state}, f, indent=2, ensure_ascii=False)
    os.replace(temp, CHECKOFFS)  # swap in the new file all at once, so it's never half-written
    return state


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
        if self.path.split("?")[0] != "/api/checkoffs":
            return self.send_error(404)
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
            state = load()
            apply(state, change)
            state = save(state)
        return self.send_json(state)


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8321
http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
