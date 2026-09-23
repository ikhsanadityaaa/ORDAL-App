#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Bersihkan artefak build repo saja; app terpasang dan data user tetap aman.
rm -rf "$REPO_ROOT/dist" "$REPO_ROOT/.build-venv"
find "$REPO_ROOT" -type d -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null || true
find "$REPO_ROOT" -name '*.pyc' -delete 2>/dev/null || true

exec "$REPO_ROOT/build.sh"
