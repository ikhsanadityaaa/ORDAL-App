#!/usr/bin/env bash
# ==============================================================================
# Build ORDAL Mac App (.app bundle — TANPA py2app)
# ==============================================================================
# Strategi: buat .app sebagai directory structure manual.
# Executable-nya adalah shell script yang:
#   - First-run: setup venv di ~/.ordal/venv + install deps + install Chromium
#   - Run launcher.py via venv python
#
# Requirements:
#   - macOS 11+
#   - Python 3.12 (install via: brew install python@3.12)
#   - Node.js 18+ & npm (install via: brew install node)
#   - Xcode CLT: xcode-select --install
# ==============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

APP_NAME="ORDAL"
APP_VERSION="2.0.0"
DIST_DIR="$REPO_ROOT/dist"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
INSTALLED_APP="/Applications/$APP_NAME.app"
USER_DATA_DIR="$HOME/Library/Application Support/ORDAL"
USER_VENV_DIR="$HOME/.ordal/venv"

echo "=========================================="
echo "  ORDAL Mac App Build"
echo "=========================================="

# ── 1. Verify platform ────────────────────────────────────────────────────────
if [[ "$(uname)" != "Darwin" ]]; then
    echo "ERROR: Build script ini hanya untuk macOS."
    exit 1
fi
echo "✓ Platform: $(sw_vers -productName) $(sw_vers -productVersion)"

# ── 2. Verify Python 3.12 ────────────────────────────────────────────────────
echo ""
echo "→ Cek Python 3.12..."
PYTHON=""
for candidate in python3.12 /opt/homebrew/bin/python3.12 /usr/local/bin/python3.12; do
    if command -v "$candidate" &>/dev/null; then
        PYTHON="$candidate"
        break
    fi
done
if [[ -z "$PYTHON" ]]; then
    echo "ERROR: Python 3.12 tidak ditemukan."
    echo "  Install: brew install python@3.12"
    exit 1
fi
PY_MINOR=$($PYTHON -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
if [[ "$PY_MINOR" != "3.12" ]]; then
    echo "ERROR: butuh Python 3.12, ketemu $PY_MINOR ($PYTHON)"
    echo "  Install: brew install python@3.12"
    exit 1
fi
echo "✓ Python: $PYTHON ($PY_MINOR)"

# ── 3. Verify Node.js ────────────────────────────────────────────────────────
echo ""
echo "→ Cek Node.js..."
if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js tidak ditemukan. Install: brew install node"
    exit 1
fi
echo "✓ Node.js: $(node --version)"

# ── 4. UPDATE STEP — pilih mode update ──────────────────────────────────────
echo ""
echo "=========================================="
echo "  UPDATE MODE"
echo "=========================================="
echo ""
echo "Pilih cara update:"
echo ""
echo "  [1] Soft Update (RECOMMENDED)"
echo "      → Replace app bundle saja"
echo "      → Keep venv (~/.ordal/venv)"
echo "      → Keep user data (CV, cookies, API keys, jadwal)"
echo "      → First-run setup TIDAK diulang"
echo "      → Cocok untuk update versi normal"
echo ""
echo "  [2] Full Clean"
echo "      → Hapus app lama + venv + user data"
echo "      → First-run setup diulang (5-10 menit)"
echo "      → Cocok kalau ada error aneh / fresh install"
echo ""
echo "  [3] Skip (saya akan replace manual)"
echo ""
read -p "Pilih [1/2/3] (default 1): " update_choice
update_choice=${update_choice:-1}

if [[ "$update_choice" == "1" ]]; then
    echo ""
    echo "→ Soft Update: hapus app lama saja, keep venv + data"
    rm -rf "$INSTALLED_APP"
    echo "  ✓ App lama dihapus"
    echo "  ✓ Venv keep: $USER_VENV_DIR"
    echo "  ✓ Data keep: $USER_DATA_DIR"

elif [[ "$update_choice" == "2" ]]; then
    echo ""
    echo "→ Full Clean: hapus app + venv + data"
    echo "  ⚠️  SEMUA data user akan hilang (CV, cookies, API keys, jadwal)"
    read -p "  Konfirmasi hapus semua data? (y/N): " confirm
    if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
        rm -rf "$INSTALLED_APP"
        rm -rf "$USER_VENV_DIR"
        rm -rf "$USER_DATA_DIR"
        echo "  ✓ App + venv + data dihapus"
    else
        echo "  → Batal full clean. Hapus app lama saja."
        rm -rf "$INSTALLED_APP"
    fi

else
    echo ""
    echo "→ Skip. Anda akan replace manual:"
    echo "  rm -rf /Applications/ORDAL.app"
    echo "  mv dist/ORDAL.app /Applications/"
fi
echo ""

# ── 5. Build frontend ────────────────────────────────────────────────────────
echo "→ Build frontend (React) dengan VITE_APP_MODE=1..."
cd frontend
if [[ ! -d "node_modules" ]]; then
    echo "  → Install npm dependencies..."
    npm install
fi
VITE_APP_MODE=1 npm run build
cd "$REPO_ROOT"
echo "✓ Frontend built ke frontend/dist/"

if [[ ! -f "frontend/dist/index.html" ]]; then
    echo "ERROR: frontend/dist/index.html tidak ada. Build frontend gagal."
    exit 1
fi

# ── 6. Build .app bundle structure ───────────────────────────────────────────
echo ""
echo "→ Build .app bundle..."

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources/backend"
mkdir -p "$APP_BUNDLE/Contents/Resources/frontend"
mkdir -p "$APP_BUNDLE/Contents/Resources/mac-app"

# Copy Info.plist
cp mac-app/Info.plist "$APP_BUNDLE/Contents/Info.plist"

# Copy executable script
cp mac-app/ORDAL_executable.sh "$APP_BUNDLE/Contents/MacOS/ORDAL"
chmod +x "$APP_BUNDLE/Contents/MacOS/ORDAL"

# Copy backend source
echo "  → Copy backend/..."
cp -R backend/* "$APP_BUNDLE/Contents/Resources/backend/"
find "$APP_BUNDLE/Contents/Resources/backend" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find "$APP_BUNDLE/Contents/Resources/backend" -name "*.pyc" -delete 2>/dev/null || true
rm -f "$APP_BUNDLE/Contents/Resources/backend/.env"
# v42: JANGAN copy _ordal_data / autoapply.db ke app bundle.
# Data user disimpan di ~/Library/Application Support/ORDAL/ (persistent).
rm -rf "$APP_BUNDLE/Contents/Resources/backend/_ordal_data"
rm -f "$APP_BUNDLE/Contents/Resources/backend/autoapply.db"
rm -rf "$APP_BUNDLE/Contents/Resources/_ordal_data"

# Copy frontend dist
echo "  → Copy frontend/dist/..."
cp -R frontend/dist "$APP_BUNDLE/Contents/Resources/frontend/dist"

# Copy launcher.py
echo "  → Copy mac-app/launcher.py..."
cp mac-app/launcher.py "$APP_BUNDLE/Contents/Resources/mac-app/launcher.py"

# ── 7. Generate icon ─────────────────────────────────────────────────────────
echo ""
echo "→ Generate app icon..."

ICON_PNG="$REPO_ROOT/mac-app/ordal_icon.png"
ICON_ICNS="$APP_BUNDLE/Contents/Resources/ordal.icns"

if [[ -f "$ICON_PNG" ]]; then
    # Convert PNG → icns using sips (Mac built-in)
    # sips can convert single PNG to icns (macOS will scale as needed)
    if sips -s format icns "$ICON_PNG" --out "$ICON_ICNS" 2>/dev/null; then
        echo "  ✓ Icon di-generate: ordal.icns (dari PNG via sips)"
    else
        echo "  ⚠ sips gagal convert ke icns. Coba iconutil..."
        # Fallback: iconutil (lebih robust, butuh iconset folder)
        ICONSET_DIR="/tmp/ordal_iconset.iconset"
        rm -rf "$ICONSET_DIR"
        mkdir -p "$ICONSET_DIR"
        # Generate berbagai size dari PNG source
        for size in 16 32 64 128 256 512 1024; do
            sips -z $size $size "$ICON_PNG" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null 2>&1 || true
        done
        # Untuk retina (2x)
        for size in 32 64 256 512 1024; do
            half=$((size / 2))
            sips -z $size $size "$ICON_PNG" --out "$ICONSET_DIR/icon_${half}x${half}@2x.png" >/dev/null 2>&1 || true
        done
        if iconutil -c icns "$ICONSET_DIR" -o "$ICON_ICNS" 2>/dev/null; then
            echo "  ✓ Icon di-generate via iconutil"
        else
            echo "  ⚠ iconutil juga gagal. App akan pakai icon default macOS."
            cp "$ICON_PNG" "$ICON_ICNS" 2>/dev/null || true
        fi
        rm -rf "$ICONSET_DIR"
    fi
else
    echo "  ⚠ mac-app/ordal_icon.png tidak ditemukan. App akan pakai icon default macOS."
fi

echo "✓ .app bundle created: $APP_BUNDLE"

# ── 8. (Optional) Ad-hoc sign ────────────────────────────────────────────────
echo ""
echo "→ Ad-hoc sign app..."
codesign --force --deep --sign - "$APP_BUNDLE" 2>&1 || echo "  ⚠ Codesign gagal — app tetap jalan, hanya Gatekeeper akan warning."

# ── 9. Done ───────────────────────────────────────────────────────────────────
APP_SIZE=$(du -sh "$APP_BUNDLE" | awk '{print $1}')

echo ""
echo "=========================================="
echo "  ✅ BUILD BERHASIL!"
echo "=========================================="
echo ""
echo "  📦 App:  $APP_BUNDLE"
echo "  📏 Size: $APP_SIZE"
echo "  🎨 Icon: orange square + white lightning bolt"
echo ""
echo "Cara pakai:"
echo "  1. Buka Finder → drag ORDAL.app ke /Applications/"
echo "  2. Double-click ORDAL.app"
echo "  3. First-run: macOS Gatekeeper warning → klik kanan → Open → Open anyway"
echo "  4. Dialog pertama akan muncul: 'ORDAL sedang menyiapkan environment...'"
echo "     (proses ~5-10 menit: install venv, deps, Chromium)"
echo "  5. Setelah selesai, app window akan terbuka otomatis."
echo "  6. Buka halaman Persiapan → input Gemini API Key + Telegram Bot Token + link akun Telegram."
echo "  7. Buka halaman AI → pilih provider (Gemini/OpenAI/Claude/Groq/OpenRouter)"
echo ""
echo "User data tersimpan di:"
echo "  ~/Library/Application Support/ORDAL/"
echo "  ~/.ordal/venv/  (Python venv)"
echo ""
echo "Log app:"
echo "  ~/Library/Application Support/ORDAL/app.log"
