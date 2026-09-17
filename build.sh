#!/usr/bin/env bash
# ==============================================================================
# Build ORDAL Mac App (.app bundle — TANPA py2app)
# ==============================================================================
# Strategi: buat .app sebagai directory structure manual.
# Executable-nya adalah shell script yang:
#   - First-run: setup venv di ~/.ordal/venv + install deps + install Chromium
#   - Run launcher.py via venv python
#
# v3.2.3 (15 Sep 2026):
#   - FIX ikon pecah/resolusi rendah: ordal.icns dirakit ulang dengan
#     mapping slot berdasar UKURAN PIKSEL PNG (ic07=128, ic08=256, ic09=512,
#     ic10=1024, ic11=32, ic12=64, ic13=256, ic14=512) — bukan nama file.
#   - FIX logo Google: tombol "Lanjut dengan Google" kini memakai logo "G"
#     resmi 4 warna Google (sebelumnya salah pakai ikon Chrome).
#   - Panduan login Google: OAuth Client tipe "Desktop app" (loopback PKCE).
# v3.2.2:
#   - FIX "app ter-build tapi tidak bisa dibuka": zip yang diunduh membawa
#     atribut quarantine (com.apple.quarantine) yang menular ke hasil build
#     → Gatekeeper memblokir app. Kini build membersihkan xattr SEBELUM
#     codesign (lihat seksi 8).
# v3.1.1:
#   - TANPA menu pilihan lagi — build OTOMATIS Soft Update
#     (replace app lama, KEEP venv + data user).
#   - backend/.env di-bundle ke dalam app (DATABASE URL pusat),
#     bisa di-prompt saat build jika belum diisi.
#   - Icon pakai logo baru (kotak oranye + ring "O" putih).
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
APP_VERSION="3.2.3"
DIST_DIR="$REPO_ROOT/dist"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
INSTALLED_APP="/Applications/$APP_NAME.app"
USER_DATA_DIR="$HOME/Library/Application Support/ORDAL"
USER_VENV_DIR="$HOME/.ordal/venv"

echo "=========================================="
echo "  ORDAL Mac App Build (v$APP_VERSION)"
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

# ── 4. UPDATE OTOMATIS — Soft Update (KEEP venv + data user) ──────────────────
# v3.1.1: menu pilihan (Soft Update / Full Clean / Skip) DIHAPUS.
# Build selalu otomatis melakukan Soft Update:
#   → Replace app bundle lama saja
#   → Keep venv (~/.ordal/venv) → first-run setup TIDAK diulang
#   → Keep user data (~/Library/Application Support/ORDAL:
#     device login, CV, cookies platform, API keys, jadwal, .env override)
echo ""
echo "→ Soft Update otomatis: replace app lama, KEEP venv + data user..."
rm -rf "$INSTALLED_APP"
echo "  ✓ App lama dihapus (jika ada)"
echo "  ✓ Venv keep : $USER_VENV_DIR"
echo "  ✓ Data keep : $USER_DATA_DIR"
echo ""

# ── 5. Build frontend ────────────────────────────────────────────────────────
echo "→ Build frontend (React)..."
cd frontend
if [[ ! -d "node_modules" ]]; then
    echo "  → Install npm dependencies..."
    npm install
fi
npm run build
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

# Secret produksi tetap di Vercel. Build desktop tidak boleh membawa .env.
if [[ -f "$REPO_ROOT/backend/.env" ]]; then
    echo "ERROR: hapus backend/.env sebelum build."
    exit 1
fi
rm -f "$APP_BUNDLE/Contents/Resources/backend/.env"

# ── 7. Icon app (logo ORDAL baru: kotak oranye + ring "O" putih) ─────────────
echo ""
echo "→ Pasang app icon (logo baru)..."

ICON_ICNS_SRC="$REPO_ROOT/mac-app/ordal.icns"
ICON_PNG="$REPO_ROOT/mac-app/ordal_icon.png"
ICON_ICNS="$APP_BUNDLE/Contents/Resources/ordal.icns"

# Info.plist memakai CFBundleIconFile=ordal → file harus bernama ordal.icns.
if [[ -f "$ICON_ICNS_SRC" ]]; then
    # Pakai ordal.icns pre-built (multi-size 16-1024px, logo baru ring-O).
    # Lebih andal daripada convert via sips (dulu build memakai PNG lama
    # sehingga icon app masih petir lama — fix v3.1.1).
    cp "$ICON_ICNS_SRC" "$ICON_ICNS"
    echo "  ✓ Icon: ordal.icns pre-built (multi-size, logo baru ring-O)"
elif [[ -f "$ICON_PNG" ]]; then
    # Fallback: convert PNG → icns via sips
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

# ── 8. Bersihkan quarantine xattr + Ad-hoc sign ──────────────────────────────
# FIX v3.2.2: zip source yang diunduh dari web membawa extended attribute
# com.apple.quarantine. Atribut ini MENULAR ke semua hasil copy (cp -R),
# termasuk app bundle hasil build → macOS Gatekeeper menganggap app berasal
# "dari internet tanpa identitas" dan menolak membukanya walau app sudah
# di-build ulang di mesin user sendiri. Solusi: hapus SEMUA xattr dari app
# bundle SEBELUM codesign (sign dilakukan setelah bersih = signature valid).
echo ""
echo "→ Bersihkan quarantine xattr (fix Gatekeeper v3.2.2)..."
if command -v xattr &>/dev/null; then
    xattr -cr "$APP_BUNDLE" 2>/dev/null || true
    echo "  ✓ xattr app bundle dibersihkan"
else
    echo "  ⚠ perintah xattr tidak ditemukan — skip (macOS modern selalu punya)"
fi

echo ""
echo "→ Ad-hoc sign app..."
codesign --force --deep --sign - "$APP_BUNDLE" 2>&1 || echo "  ⚠ Codesign gagal — app tetap jalan, hanya Gatekeeper akan warning."

# ── 9. Done ───────────────────────────────────────────────────────────────────
APP_SIZE=$(du -sh "$APP_BUNDLE" | awk '{print $1}')

echo ""
echo "=========================================="
echo "  ✅ BUILD BERHASIL! (v$APP_VERSION)"
echo "=========================================="
echo ""
echo "  📦 App:  $APP_BUNDLE"
echo "  📏 Size: $APP_SIZE"
echo "  🎨 Icon: logo baru — kotak oranye + ring \"O\" putih (icns multi-size fix v3.2.3)"
echo "  🔒 Gatekeeper: xattr quarantine dibersihkan sebelum sign (fix v3.2.2)"
echo "  🔐 Secret production: tidak disertakan dalam app"
echo ""
echo "Cara pakai:"
echo "  1. Buka Finder → drag ORDAL.app ke /Applications/"
echo "  2. Double-click ORDAL.app"
echo "  3. First-run: macOS Gatekeeper warning → klik kanan → Open → Open anyway"
echo "  4. Dialog pertama akan muncul: 'ORDAL sedang menyiapkan environment...'"
echo "     (proses ~5-10 menit: install venv, deps, Chromium)"
echo "  5. Setelah selesai, app window akan terbuka otomatis."
echo ""
echo "Update versi berikutnya:"
echo "  Jalankan ./build.sh lagi — otomatis Soft Update:"
echo "  app bundle baru di-install, venv + data user TETAP dipertahankan."
echo ""
echo "User data tersimpan di:"
echo "  ~/Library/Application Support/ORDAL/"
echo "  ~/.ordal/venv/  (Python venv)"
echo ""
echo "Log app:"
echo "  ~/Library/Application Support/ORDAL/app.log"
