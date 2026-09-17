#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
exec node "$ROOT_DIR/scripts/chroma-down.js"
