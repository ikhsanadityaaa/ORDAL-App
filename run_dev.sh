#!/usr/bin/env bash
# ==============================================================================
# Run ORDAL in dev mode (Linux / Mac) — tanpa build .app
# ==============================================================================
# Cara pakai:
#   cd ordal-app
#   chmod +x run_dev.sh
#   ./run_dev.sh
#
# Apa yang dilakukan:
#   1. Resolve Python 3.12 (WAJIB — 3.13+ akan error compile pydantic-core/greenlet)
#   2. Setup venv + install backend deps (tanpa libsql/steel-sdk/scrapling)
#   3. Install pywebview
#   4. Set ORDAL_DATA_DIR=./_ordal_data (v3: tanpa APP_MODE, login wajib)
#   5. Jalankan launcher.py (buka native window ke backend)
#
# Untuk dev frontend (hot-reload), buka terminal lain:
#   cd frontend && npm run dev
# Lalu buka browser ke http://localhost:5173
# Backend tetap jalan di port random yang dipilih launcher.
# ==============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# ── 1. Resolve Python 3.12 (WAJIB) ─────────────────────────────────────────────
echo "→ Cari Python 3.12..."

if command -v python3.12 &>/dev/null; then
    PY="$(command -v python3.12)"
elif [[ -x "/opt/homebrew/bin/python3.12" ]]; then
    PY="/opt/homebrew/bin/python3.12"
elif [[ -x "/usr/local/bin/python3.12" ]]; then
    PY="/usr/local/bin/python3.12"
elif command -v pyenv &>/dev/null && pyenv versions 2>/dev/null | grep -q "3.12"; then
    PY="$(pyenv prefix 3.12)/bin/python3.12"
else
    echo ""
    echo "ERROR: Python 3.12 tidak ditemukan."
    echo ""
    echo "Python bawaan sistem Anda:"
    python3 --version 2>&1 || echo "  (tidak terdeteksi)"
    echo ""
    if [[ "$(uname)" == "Darwin" ]]; then
        echo "Solusi — install via Homebrew:"
        echo "    brew install python@3.12"
    else
        echo "Solusi (Linux):"
        echo "  Ubuntu/Debian:  sudo apt install python3.12 python3.12-venv"
        echo "  Fedora:          sudo dnf install python3.12"
        echo "  Atau pyenv:      curl https://pyenv.run | bash && pyenv install 3.12.7"
    fi
    exit 1
fi

echo "✓ Python: $PY ($($PY --version))"

PY_MINOR=$($PY -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
if [[ "$PY_MINOR" == "3.13" || "$PY_MINOR" == "3.14" ]]; then
    echo ""
    echo "ERROR: $PY_MINOR terlalu baru untuk backend deps (pydantic-core butuh PyO3 < 3.13)."
    echo "Install Python 3.12:  brew install python@3.12  (Mac)  /  sudo apt install python3.12  (Linux)"
    exit 1
fi

# ── 2. Setup venv ─────────────────────────────────────────────────────────────
if [[ ! -d ".venv-app" ]]; then
    echo "→ Membuat virtualenv .venv-app..."
    "$PY" -m venv .venv-app
fi

# shellcheck disable=SC1091
source .venv-app/bin/activate

echo "→ Upgrade pip..."
python -m pip install --upgrade pip wheel setuptools

echo "→ Install backend deps (tanpa libsql/steel-sdk/scrapling — opsional)..."
pip install -q -r backend/requirements.txt

echo "→ Install app-mode deps (pywebview)..."
pip install -q "pywebview>=4.0"

# ── 3. Install Playwright Chromium (jika belum) ──────────────────────────────
echo "→ Cek Playwright Chromium..."
if ! python -c "import playwright" 2>/dev/null; then
    echo "  → Install Playwright..."
    pip install -q playwright
fi
if ! python -m playwright install --dry-run chromium 2>/dev/null | grep -q "is already installed"; then
    echo "  → Install Chromium binary..."
    python -m playwright install chromium || echo "  ⚠ Chromium install gagal — lanjut saja, first-run akan retry."
fi

# ── 4. Build frontend (jangan rebuild kalau sudah ada) ───────────────────────
if [[ ! -d "frontend/dist" ]]; then
    echo "→ Build frontend..."
    cd frontend
    [[ -d "node_modules" ]] || npm install
    npm run build
    cd "$REPO_ROOT"
fi

# ── 5. Run launcher ───────────────────────────────────────────────────────────
# v3: ORDAL_APP_MODE dihapus — login wajib
export ORDAL_DATA_DIR="$REPO_ROOT/_ordal_data"
export ORDAL_BACKEND_DIR="$REPO_ROOT/backend"

echo ""
echo "=========================================="
echo "  ORDAL Dev Mode"
echo "=========================================="
echo "  Mode:        multi-user (login wajib, DB pusat)"
echo "  Data Dir:    $ORDAL_DATA_DIR"
echo "  Backend Dir: $ORDAL_BACKEND_DIR"
echo "=========================================="
echo ""

python mac-app/launcher.py
