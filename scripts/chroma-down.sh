#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
PID_FILE="$ROOT_DIR/.chroma.pid"
CHROMA_PORT="${CHROMA_PORT:-8000}"

find_listening_pid() {
  lsof -tiTCP:"$CHROMA_PORT" -sTCP:LISTEN 2>/dev/null | head -n 1
}

if [ ! -f "$PID_FILE" ]; then
  PID=$(find_listening_pid || true)
  if [ -z "${PID:-}" ]; then
    echo "Chroma is not running from this workspace."
    exit 0
  fi
else
  PID=$(cat "$PID_FILE")
fi

if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "Stopped Chroma PID $PID"
else
  echo "No running Chroma process found for PID $PID"
fi

rm -f "$PID_FILE"
