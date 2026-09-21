#!/usr/bin/env bash
# ==============================================================================
# Build ORDAL Mac App (.app bundle) - CLEAN BUILD
# ==============================================================================
# Script ini melakukan clean build untuk memastikan app yang terbuild adalah
# versi terbaru. Menghapus semua cache, dist, build, dan venv sebelum build.
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
DIST_DIR="$REPO_ROOT/dist"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
INSTALLED_APP="/Applications/$APP_NAME.app"
USER_DATA_DIR="$HOME/Library/Application Support/ORDAL"
USER_VENV_DIR="$HOME/.ordal/venv"

echo "=========================================="
echo "  ORDAL Mac App Clean Build"
echo "=========================================="

# ── 0. CLEAN UP ───────────────────────────────────────────────────────────────
echo ""
echo "→ Membersihkan build sebelumnya..."

# Pertahankan user data: berisi URL Supabase, secret, CV, cookies, dan konfigurasi user.
# Clean build hanya menghapus artefak build, bukan data aplikasi.
if [[ -d "$USER_DATA_DIR" ]]; then
    echo "  ✓ Pertahankan user data $USER_DATA_DIR"
fi

# Hapus dist folder
if [[ -d "$DIST_DIR" ]]; then
    echo "  → Hapus $DIST_DIR"
    rm -rf "$DIST_DIR"
fi

# Hapus .build-venv jika ada
if [[ -d "$REPO_ROOT/.build-venv" ]]; then
    echo "  → Hapus $REPO_ROOT/.build-venv"
    rm -rf "$REPO_ROOT/.build-venv"
fi

# Hapus __pycache__ di seluruh project
echo "  → Hapus __pycache__ di seluruh project..."
find "$REPO_ROOT" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

# Hapus *.pyc files
find "$REPO_ROOT" -name "*.pyc" -delete 2>/dev/null || true

# Hapus frontend/node_modules (opsional, biar build fresh)
if [[ -d "$REPO_ROOT/frontend/node_modules" ]]; then
    echo "  → Hapus frontend/node_modules (biar npm install fresh)"
    rm -rf "$REPO_ROOT/frontend/node_modules"
fi

# Hapus frontend/dist
if [[ -d "$REPO_ROOT/frontend/dist" ]]; then
    echo "  → Hapus frontend/dist"
    rm -rf "$REPO_ROOT/frontend/dist"
fi

echo "✓ Pembersihan selesai."

# ── 1. Verify platform ────────────────────────────────────────────────────────
echo ""
echo "→ Cek platform..."
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

# ── 4. Build frontend ────────────────────────────────────────────────────────
echo ""
echo "→ Build frontend (VITE_APP_MODE=1)..."
cd "$REPO_ROOT/frontend"

echo "  → Install npm dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: npm install gagal."
    exit 1
fi

echo "  → Build frontend..."
export VITE_APP_MODE=1
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Build frontend gagal."
    exit 1
fi

cd "$REPO_ROOT"

if [[ ! -f "$REPO_ROOT/frontend/dist/index.html" ]]; then
    echo "ERROR: frontend/dist/index.html tidak ada setelah build."
    exit 1
fi
echo "✓ Frontend build selesai."

# ── 5. Create .app bundle structure ──────────────────────────────────────────
echo ""
echo "→ Buat .app bundle structure..."

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

# Copy frontend dist
echo "  → Copy frontend/dist/..."
cp -R frontend/dist "$APP_BUNDLE/Contents/Resources/frontend/dist"

# Copy launcher.py
echo "  → Copy mac-app/launcher.py..."
cp mac-app/launcher.py "$APP_BUNDLE/Contents/Resources/mac-app/launcher.py"

# ── 6. Generate icon ─────────────────────────────────────────────────────────
echo ""
echo "→ Generate app icon..."

ICON_PNG="$REPO_ROOT/mac-app/ordal_icon.png"
ICON_ICNS="$APP_BUNDLE/Contents/Resources/ordal.icns"

if [[ -f "$ICON_PNG" ]]; then
    # Convert PNG → icns using sips (Mac built-in)
    if sips -s format icns "$ICON_PNG" --out "$ICON_ICNS" 2>/dev/null; then
        echo "  ✓ Icon di-generate: ordal.icns (dari PNG via sips)"
    else
        echo "  ⚠ sips gagal convert ke icns. Coba iconutil..."
        ICONSET_DIR="/tmp/ordal_iconset.iconset"
        rm -rf "$ICONSET_DIR"
        mkdir -p "$ICONSET_DIR"
        for size in 16 32 64 128 256 512 1024; do
            sips -z $size $size "$ICON_PNG" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null 2>&1 || true
        done
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

# ── 7. (Optional) Ad-hoc sign ────────────────────────────────────────────────
echo ""
echo "→ Ad-hoc sign app..."
codesign --force --deep --sign - "$APP_BUNDLE" 2>&1 || echo "  ⚠ Codesign gagal — app tetap jalan, hanya Gatekeeper akan warning."

# ── 8. Done ───────────────────────────────────────────────────────────────────
APP_SIZE=$(du -sh "$APP_BUNDLE" | awk '{print $1}')

echo ""
echo "=========================================="
echo "  ✅ CLEAN BUILD BERHASIL!"
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
