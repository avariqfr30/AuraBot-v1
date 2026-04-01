#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
LOG_FILE="$ROOT_DIR/chroma.log"

if [ ! -f "$LOG_FILE" ]; then
  echo "No chroma.log file found yet."
  exit 0
fi

tail -f "$LOG_FILE"
