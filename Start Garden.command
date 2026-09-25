#!/bin/bash
# Double-click this file to open the garden app.
# It runs a tiny web server (serve.py, using the Python built into macOS) that shares this folder with your browser,
# and with your phone if it's on the same Wi-Fi. Close this window to stop it.

cd "$(dirname "$0")"
PORT=8321

# Already running (for example in another window)? Just open it.
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "The garden app is already running. Opening it…"
  open "http://localhost:$PORT"
  exit 0
fi
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

echo ""
echo "  Noah's Garden is running."
echo ""
echo "  On this computer:  http://localhost:$PORT"
if [ -n "$IP" ]; then
echo "  On your phone:     http://$IP:$PORT   (phone must be on the same Wi-Fi)"
fi
echo ""
echo "  Leave this window open while you use the app. Close it (or press Ctrl+C) to stop."
echo ""

(sleep 1; open "http://localhost:$PORT") &
exec python3 serve.py "$PORT" 2>/dev/null
