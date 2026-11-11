#!/bin/zsh
set -euo pipefail
cd -- "$(dirname -- "$0")"
exec python3 -B tools/open_paradox.py
