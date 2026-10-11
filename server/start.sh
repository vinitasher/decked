#!/usr/bin/env bash
# Start the flashcard server. Run this on boot or manually.
# Add to crontab: @reboot /path/to/decked/server/start.sh
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
nohup node server.js > server.log 2>&1 &
echo "Flashcard server PID $!"
