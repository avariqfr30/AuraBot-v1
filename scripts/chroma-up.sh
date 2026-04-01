#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
PID_FILE="$ROOT_DIR/.chroma.pid"
LOG_FILE="$ROOT_DIR/chroma.log"
CHROMA_PATH="${CHROMA_PATH:-$ROOT_DIR/chroma-data}"
CHROMA_HOST="${CHROMA_HOST:-127.0.0.1}"
CHROMA_PORT="${CHROMA_PORT:-8000}"

find_listening_pid() {
  lsof -tiTCP:"$CHROMA_PORT" -sTCP:LISTEN 2>/dev/null | head -n 1
}

if [ -x "$ROOT_DIR/.venv/bin/chroma" ]; then
  CHROMA_BIN="$ROOT_DIR/.venv/bin/chroma"
elif command -v chroma >/dev/null 2>&1; then
  CHROMA_BIN=$(command -v chroma)
else
  echo "Chroma CLI not found."
  echo "Install it with:"
  echo "  python3 -m venv .venv"
  echo "  ./.venv/bin/python -m pip install -U pip chromadb"
  exit 1
fi

if [ -f "$PID_FILE" ]; then
  EXISTING_PID=$(cat "$PID_FILE")
  if kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "Chroma is already running on PID $EXISTING_PID"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

LISTENING_PID=$(find_listening_pid || true)
if [ -n "${LISTENING_PID:-}" ]; then
  echo "$LISTENING_PID" > "$PID_FILE"
  echo "Chroma is already listening on http://$CHROMA_HOST:$CHROMA_PORT with PID $LISTENING_PID"
  exit 0
fi

mkdir -p "$CHROMA_PATH"

nohup "$CHROMA_BIN" run --path "$CHROMA_PATH" --host "$CHROMA_HOST" --port "$CHROMA_PORT" >"$LOG_FILE" 2>&1 &

ATTEMPTS=0
while [ "$ATTEMPTS" -lt 10 ]; do
  LISTENING_PID=$(find_listening_pid || true)
  if [ -n "${LISTENING_PID:-}" ]; then
    echo "$LISTENING_PID" > "$PID_FILE"
    echo "Chroma started on http://$CHROMA_HOST:$CHROMA_PORT with PID $LISTENING_PID"
    exit 0
  fi

  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 1
done

echo "Failed to start Chroma. Recent log output:"
tail -n 20 "$LOG_FILE" || true
rm -f "$PID_FILE"
exit 1
