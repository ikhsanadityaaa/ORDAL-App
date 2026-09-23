#!/bin/bash
# ==============================================================================
# ORDAL.app/Contents/MacOS/ORDAL — executable script (dipanggil saat app di-klik)
# ==============================================================================
# Tugas:
#   1. Cari Python 3.12 (cek absolute path dulu, lalu PATH)
#   2. First-run: buat venv di ~/.ordal/venv + install deps + install Chromium
#   3. Run launcher.py (pywebview window)
#
# PENTING: TIDAK pakai `set -e` karena macOS .app executable harus tetap jalan
# walau ada minor error. Semua error di-log ke file + dialog.
# ==============================================================================

# Resolve path ke Resources/ (lokasi launcher.py, backend/, frontend/dist/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESOURCES_DIR="$(cd "$SCRIPT_DIR/../Resources" && pwd)"

# Keep runtime imports from modifying the signed app bundle.
export PYTHONDONTWRITEBYTECODE=1

# User data dir (persistent antar versi app)
USER_DATA_DIR="$HOME/Library/Application Support/ORDAL"
VENV_DIR="$HOME/.ordal/venv"
LOG_FILE="$USER_DATA_DIR/app.log"

mkdir -p "$USER_DATA_DIR" 2>/dev/null

# Log helper — tulis ke file + stderr (stderr muncul di Console.app)
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE" 2>&1
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

log "=========================================="
log "  ORDAL.app launching"
log "=========================================="
log "Resources: $RESOURCES_DIR"
log "UserData:  $USER_DATA_DIR"
log "Venv:      $VENV_DIR"
log "Script PID: $$"
log "Script PPID: $PPID"
log "PATH: $PATH"
log "HOME: $HOME"

# ── 1. Cari Python 3.12 ──────────────────────────────────────────────────────
# macOS launchd pakai PATH minimal (/usr/bin:/bin:/usr/sbin:/sbin) — TIDAK include
# /opt/homebrew/bin atau /usr/local/bin. Jadi `command -v python3.12` bisa gagal
# meski binary ada. Solusi: cek absolute path dulu.
PYTHON=""
PYTHON_VERSION=""

# Lokasi umum Python 3.12 di Mac (urut dari paling umum)
PYTHON_CANDIDATES=(
    "/opt/homebrew/bin/python3.12"                                              # Homebrew Apple Silicon
    "/usr/local/bin/python3.12"                                                 # Homebrew Intel
    "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12"         # python.org
    "/usr/bin/python3"                                                          # System Python (3.9+, mungkin 3.12)
    "$HOME/.pyenv/versions/3.12/bin/python3.12"                                # pyenv
    "$HOME/.ordal/venv/bin/python"                                              # venv lama (kalau ada)
)

# Cek absolute path dulu (tidak depend PATH)
for candidate in "${PYTHON_CANDIDATES[@]}"; do
    if [[ -x "$candidate" ]]; then
        # Cek versi — kalau 3.12, langsung pakai
        VER_OUTPUT="$("$candidate" --version 2>&1)"
        if [[ "$VER_OUTPUT" == *"3.12"* ]]; then
            PYTHON="$candidate"
            PYTHON_VERSION="$VER_OUTPUT"
            log "Found Python 3.12 at: $PYTHON"
            break
        elif [[ "$candidate" == "/usr/bin/python3" ]] && [[ "$VER_OUTPUT" == *"Python 3."* ]]; then
            # System python3 — cek apakah 3.12+
            PY_MINOR="$("$candidate" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>&1)"
            log "System python3 version: $PY_MINOR"
            if [[ "$PY_MINOR" == "3.12" ]]; then
                PYTHON="$candidate"
                PYTHON_VERSION="$VER_OUTPUT"
                log "Using system python3 ($PY_MINOR)"
                break
            fi
        fi
    fi
done

# Fallback: cari di PATH (kalau absolute path tidak ketemu, coba command -v)
if [[ -z "$PYTHON" ]]; then
    log "Absolute path tidak ketemu, coba PATH..."
    # Tambah /opt/homebrew/bin dan /usr/local/bin ke PATH explicitly
    export PATH="/opt/homebrew/bin:/usr/local/bin:/Library/Frameworks/Python.framework/Versions/3.12/bin:$PATH"
    for cmd in python3.12 python3.11 python3; do
        if command -v "$cmd" &>/dev/null; then
            VER_OUTPUT="$("$cmd" --version 2>&1)"
            if [[ "$VER_OUTPUT" == *"3.12"* ]]; then
                PYTHON="$(command -v "$cmd")"
                PYTHON_VERSION="$VER_OUTPUT"
                log "Found Python 3.12 via PATH: $PYTHON"
                break
            fi
        fi
    done
fi

if [[ -z "$PYTHON" ]]; then
    log "ERROR: Python 3.12 tidak ditemukan."
    ERROR_MSG="Python 3.12 tidak ditemukan di Mac Anda.

Cek lokasi yang sudah dicari:
  /opt/homebrew/bin/python3.12 (Homebrew Apple Silicon)
  /usr/local/bin/python3.12 (Homebrew Intel)
  /Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 (python.org)

Install Python 3.12 via Homebrew:
  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"
  brew install python@3.12

Atau download dari python.org:
  https://www.python.org/downloads/release/python-3120/

Setelah install, jalankan ORDAL.app lagi."
    osascript -e "display dialog \"$ERROR_MSG\" buttons {\"OK\"} default button 1 with title \"ORDAL — Python Required\" with icon stop" 2>/dev/null || true
    exit 1
fi
log "Python: $PYTHON ($PYTHON_VERSION)"

# ── 2. First-run: setup venv + deps ──────────────────────────────────────────
FIRST_RUN=false
if [[ ! -d "$VENV_DIR" ]] || [[ ! -f "$VENV_DIR/.setup_complete" ]]; then
    FIRST_RUN=true
    log "First-run detected: setup venv + install deps (~5-10 menit)..."

    # Tampilkan progress dialog (background, tidak block)
    osascript -e 'display dialog "ORDAL sedang menyiapkan environment pertama kali.

Proses ini membutuhkan 5-10 menit:
• Setup Python venv
• Install dependencies
• Download Chromium

App akan terbuka otomatis setelah selesai.

Lihat progress di Terminal:
  tail -f ~/Library/Application Support/ORDAL/app.log" buttons {"OK"} default button 1 with title "ORDAL — First Run Setup" with icon note' 2>/dev/null &
    DIALOG_PID=$!
    log "Progress dialog PID: $DIALOG_PID"

    # Setup venv
    log "Creating venv at $VENV_DIR with $PYTHON..."
    rm -rf "$VENV_DIR"
    if ! "$PYTHON" -m venv "$VENV_DIR" >> "$LOG_FILE" 2>&1; then
        log "ERROR: Gagal create venv"
        osascript -e "display dialog \"Gagal membuat Python venv.

Cek log:
$LOG_FILE

Atau jalankan via terminal untuk lihat error:
  /Applications/ORDAL.app/Contents/MacOS/ORDAL\" buttons {\"OK\"} default button 1 with title \"ORDAL Error\" with icon stop" 2>/dev/null || true
        kill $DIALOG_PID 2>/dev/null || true
        exit 1
    fi

    log "Upgrading pip..."
    "$VENV_DIR/bin/python" -m pip install --upgrade pip wheel setuptools >> "$LOG_FILE" 2>&1 || log "WARNING: pip upgrade gagal (lanjut saja)"

    log "Installing backend dependencies..."
    if ! "$VENV_DIR/bin/pip" install -r "$RESOURCES_DIR/backend/requirements.txt" >> "$LOG_FILE" 2>&1; then
        log "ERROR: Gagal install backend deps"
        LAST_LINES=$(tail -20 "$LOG_FILE" 2>/dev/null | tr '\n' '|' | sed 's/|/\\\\n/g')
        osascript -e "display dialog \"Gagal install backend dependencies.

Last 20 lines log:
$LAST_LINES

Full log:
$LOG_FILE\" buttons {\"OK\"} default button 1 with title \"ORDAL Error\" with icon stop" 2>/dev/null || true
        kill $DIALOG_PID 2>/dev/null || true
        exit 1
    fi

    log "Installing pywebview..."
    if ! "$VENV_DIR/bin/pip" install "pywebview>=4.0" >> "$LOG_FILE" 2>&1; then
        log "ERROR: Gagal install pywebview"
        LAST_LINES=$(tail -20 "$LOG_FILE" 2>/dev/null | tr '\n' '|' | sed 's/|/\\\\n/g')
        osascript -e "display dialog \"Gagal install pywebview.

Last 20 lines log:
$LAST_LINES

Full log:
$LOG_FILE\" buttons {\"OK\"} default button 1 with title \"ORDAL Error\" with icon stop" 2>/dev/null || true
        kill $DIALOG_PID 2>/dev/null || true
        exit 1
    fi

    log "Installing Playwright Chromium (~150MB)..."
    "$VENV_DIR/bin/python" -m playwright install chromium >> "$LOG_FILE" 2>&1 || log "WARNING: Chromium install gagal (first-run akan retry)"

    touch "$VENV_DIR/.setup_complete"
    log "First-run setup complete."

    # Tutup progress dialog
    kill $DIALOG_PID 2>/dev/null || true
fi

# ── 3. Set env vars ──────────────────────────────────────────────────────────
# Login wajib melalui API HTTPS ORDAL-Web; data bot tetap di SQLite lokal.
export ORDAL_DATA_DIR="$USER_DATA_DIR"
export ORDAL_BACKEND_DIR="$RESOURCES_DIR/backend"
export JWT_SECRET_FILE="$USER_DATA_DIR/secret.key"
export ENCRYPTION_KEY_FILE="$USER_DATA_DIR/encrypt.key"
# Tambah homebrew paths supaya subprocess (playwright install, dll) bisa nemu tools
export PATH="/opt/homebrew/bin:/usr/local/bin:$VENV_DIR/bin:$PATH"

log "Env: ORDAL_DATA_DIR=$ORDAL_DATA_DIR"
log "Env: ORDAL_BACKEND_DIR=$ORDAL_BACKEND_DIR"
log "Env: PATH=$PATH"

# ── 4. Run launcher.py ───────────────────────────────────────────────────────
log "Starting launcher.py..."
log "  cwd: $RESOURCES_DIR"
log "  python: $VENV_DIR/bin/python"
log "  script: mac-app/launcher.py"

cd "$RESOURCES_DIR"

# Run launcher.py — capture exit code
"$VENV_DIR/bin/python" mac-app/launcher.py >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
log "Launcher exited with code $EXIT_CODE"

# Kalau launcher crash, tampilkan error dialog dengan log content
if [[ $EXIT_CODE -ne 0 ]]; then
    log "ERROR: Launcher crash dengan exit code $EXIT_CODE"
    
    # Ambil last 15 lines dari log untuk display
    LAST_LINES=$(tail -15 "$LOG_FILE" 2>/dev/null | tr '\n' '|' | sed 's/|/\\\\n/g')
    
    ERROR_MSG="ORDAL gagal start (exit code $EXIT_CODE).

Last 15 lines log:
$LAST_LINES

Cara debug:
1. Lihat log lengkap:
   open ~/Library/Application\\ Support/ORDAL/app.log

2. Jalankan via terminal untuk lihat error real-time:
   /Applications/ORDAL.app/Contents/MacOS/ORDAL

3. Reset venv (kalau error import module):
   rm -rf ~/.ordal/venv
   Lalu buka app lagi (first-run setup ulang)."
    
    osascript -e "display dialog \"$ERROR_MSG\" buttons {\"OK\"} default button 1 with title \"ORDAL Error\" with icon stop" 2>/dev/null || true
fi

exit $EXIT_CODE
