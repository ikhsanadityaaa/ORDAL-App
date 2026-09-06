<<<<<<< HEAD
# ORDAL Mac App

Wrapper desktop untuk ORDAL (bot auto-apply lowongan kerja) sebagai aplikasi macOS native (`.app`).

> **Cari versi Windows (`ORDAL.exe`)?** Lihat [`windows-app/README.md`](windows-app/README.md).

## Apa bedanya dengan ORDAL biasa?

| Aspek | ORDAL biasa (VPS/Telegram) | ORDAL Mac App |
|---|---|---|
| **Jalankan** | systemd service di VPS | Double-click `ORDAL.app` |
| **Auth** | Login/JWT multi-user | Single-user, auto-login (skip JWT) |
| **Config API key** | Edit `.env` manual | UI Settings → input + Save + Test |
| **Config SMTP** | Telegram command | UI Settings → form |
| **Capture cookie** | Telegram `/cookie` | UI Settings → klik Capture |
| **Auto-apply schedule** | Telegram `/autoapply` | UI Settings → toggle + jam + hari |
| **Notifikasi** | Telegram chat | Tetap Telegram (jika bot token di-set) |
| **Data lokasi** | `/opt/ordal/backend/autoapply.db` | `~/Library/Application Support/ORDAL/` |

## Strategi Build

Build script membuat `.app` sebagai **directory structure manual** (bukan py2app). Executable-nya adalah shell script yang:
- First-run: setup venv di `~/.ordal/venv/` + install deps + download Chromium (~5-10 menit)
- Run `launcher.py` via venv python → pywebview native window

Keunggulan vs py2app:
- Tidak ada masalah dengan playwright dynamic imports
- Tidak ada masalah dengan webview Cocoa deps
- App size kecil (~5MB) — venv & Chromium di user dir, tidak di-bundle
- Update app = tinggal copy folder Resources/, data user aman

## Prasyarat (Mac)

1. **macOS 11+** (Big Sur / Monterey / Sonoma / Sequoia)
2. **Python 3.12 (WAJIB)** via Homebrew:
   ```bash
   brew install python@3.12
   ```
   ⚠️ **Jangan pakai Python 3.13 atau 3.14** — `pydantic-core` & `greenlet` butuh
   compile dari source dan PyO3 belum support versi tersebut. Script build akan
   otomatis tolak kalau versi lain terdeteksi.
3. **Node.js 18+** & npm:
   ```bash
   brew install node
   ```
4. **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```

## Build .app

```bash
cd ordal-app
chmod +x build.sh
./build.sh
```

Script ini akan:
1. Setup Python venv di `.venv-app/`
2. Install semua dependency backend + `pywebview` + `py2app`
3. Install Playwright Chromium
4. Build frontend React ke `frontend/dist/` (dengan `VITE_APP_MODE=1`)
5. Build `.app` bundle via py2app ke `dist/ORDAL.app`
6. Bundle Playwright Chromium ke `.app` (~500MB ukuran app)

**Hasil**: `dist/ORDAL.app` siap di-drag ke `/Applications/`.

## Run di Dev Mode (tanpa build .app)

Untuk iterasi cepat (Linux atau Mac):

```bash
cd ordal-app
chmod +x run_dev.sh
./run_dev.sh
```

Ini akan:
- Setup venv + install deps
- Build frontend jika belum ada
- Set `ORDAL_APP_MODE=1` + `ORDAL_DATA_DIR=./_ordal_data`
- Jalankan `launcher.py` (buka native window langsung)

## Cara Pakai Setelah Install

1. **Double-click `ORDAL.app`** (atau via Spotlight: `Cmd+Space` → "ORDAL")
2. **Bypass Gatekeeper** (first-run, karena tidak code-signed):
   - Klik kanan `ORDAL.app` → **Open** → **Open anyway**
   - Atau: `System Settings → Privacy & Security → Open Anyway`
3. **App window terbuka** ke halaman default "Cari Kerja"
4. **Buka tab "Persiapan"** di sidebar untuk setup:
   - **API Keys & Bot Telegram**:
     - **Gemini API Key** — dapat dari https://aistudio.google.com/app/apikey → klik **SIMPAN** → klik **TEST** untuk verifikasi
     - **Telegram Bot Token** — dapat dari @BotFather → klik **SIMPAN** → klik **TEST**
   - **Jadwal & Preferensi**:
     - Toggle **ENABLE** untuk auto-apply
     - Set **JAM** & **MENIT** (WIB)
     - Pilih **HARI AKTIF** (Sen–Min)
     - Isi **EXPECTED SALARY** & **AVAILABLE JOIN**
     - Toggle **HEADLESS MODE** (browser tersembunyi)
     - Toggle **TESTING EMAIL MODE** (kirim email ke diri sendiri dulu)
   - **CV & Login Platform**:
     - Upload CV (PDF)
     - Klik **Capture Session** untuk LinkedIn & JobStreet → login manual di browser yang terbuka
     - Set SMTP config (smtp_host, port, sender_email, app_password Gmail)
5. **Buat target lowongan** di halaman **Cari Kerja** (posisi, lokasi, platform, employment_type)
6. **Klik "Mulai Cari Kerja"** untuk manual run, atau tunggu schedule auto-apply

## Lokasi Data User

Semua data disimpan di (persistent antar versi app):

```
~/Library/Application Support/ORDAL/
├── autoapply.db          ← SQLite database (users, targets, sessions, logs, ...)
├── uploads/cvs/          ← CV PDF yang di-upload
├── cookies/              ← Cookie session LinkedIn/JobStreet (plain JSON)
├── secret.key            ← JWT signing key (auto-generated)
└── encrypt.key           ← Fernet key untuk encrypt SMTP password + app_secrets
```

Untuk **reset total**: hapus folder ini lalu restart app.

## Cara Update App

1. `cd ordal-app && git pull`
2. `./build.sh`
3. Drag `dist/ORDAL.app` ke `/Applications/` (overwrite)

Data user tidak hilang karena disimpan di `~/Library/Application Support/ORDAL/`.

## Troubleshooting

### Build error: "failed to build wheel for pydantic-core / greenlet"

**Penyebab**: Anda pakai Python 3.13 atau 3.14 yang terlalu baru. PyO3 (yang dipakai pydantic-core & greenlet untuk compile Rust bindings) belum support versi tersebut.

**Solusi**: Install Python 3.12 via Homebrew:
```bash
brew install python@3.12
./build.sh   # script akan auto-detect python3.12
```

### Build error: "command '/usr/bin/clang++' failed with exit code 1" (libsql / steel-sdk / scrapling)

**Penyebab**: Package opsional butuh compile C++/Rust dari source. Default requirements.txt sudah menonaktifkannya (di-comment).

**Solusi**: Pastikan requirements.txt tidak uncomment baris libsql/steel-sdk/scrapling:
```bash
grep -E "^libsql|^steel-sdk|^scrapling" backend/requirements.txt
# Output harus kosong.
```

### First-run: dialog "ORDAL sedang menyiapkan environment..." muncul lama

Ini normal. First-run app akan setup venv (~5-10 menit):
1. Download Python deps dari PyPI
2. Download Chromium (~150MB)

Setelah selesai, app window akan terbuka otomatis. Selanjutnya first-run tidak diulang.

Cek progress di log:
```bash
tail -f ~/Library/Application\ Support/ORDAL/app.log
```

### First-run gagal / venv rusak

Reset venv (data user tetap aman):
```bash
rm -rf ~/.ordal/venv
# Lalu double-click ORDAL.app lagi
```

### "ORDAL.app is damaged and can't be opened"

Gatekeeper block app tidak code-signed. Fix:
```bash
xattr -cr /Applications/ORDAL.app
```
Atau klik kanan → Open → Open anyway.

### Window blank / "Frontend not built"

Build script gagal build frontend. Jalankan manual:
```bash
cd frontend
VITE_APP_MODE=1 npm run build
cd ..
./build.sh
```

### Playwright Chromium tidak ke-install di first-run

Manual install via venv user:
```bash
~/.ordal/venv/bin/python -m playwright install chromium
```

### App tidak jalan / ingin lihat error

Run via terminal untuk lihat stderr langsung:
```bash
/Applications/ORDAL.app/Contents/MacOS/ORDAL
```

Cek log:
```bash
cat ~/Library/Application\ Support/ORDAL/app.log
```

### Capture cookie gagal

- Pastikan tidak ada proses Chrome lain dengan profile yang sama
- Coba `killall "Google Chrome"` lalu capture ulang

### Telegram tidak konek

- Pastikan bot token benar (cek di @BotFather)
- Klik **TEST** di halaman Persiapan
- Cek apakah bot sudah di-/start oleh user

## Struktur Repo

```
ordal-app/
├── README.md                  ← file ini
├── build.sh                   ← build script untuk .app (TANPA py2app)
├── run_dev.sh                 ← run script untuk dev mode
├── .gitignore
├── mac-app/
│   ├── launcher.py            ← entry point pywebview (dipanggil oleh ORDAL_executable.sh)
│   ├── ORDAL_executable.sh    ← shell script yang menjadi Contents/MacOS/ORDAL
│   └── Info.plist             ← metadata bundle .app
├── backend/                   ← FastAPI + workers + services
│   ├── main.py                ← (PATCHED) serve frontend dist + app_config router
│   ├── database.py            ← (PATCHED) ORDAL_DATA_DIR + app_secrets table + auto user_id=1
│   ├── auth_utils.py          ← (PATCHED) skip JWT in APP_MODE
│   ├── encryption.py          ← (PATCHED) support ENCRYPTION_KEY_FILE
│   ├── app_secrets.py         ← (NEW) helper read/set secret dari DB
│   ├── routers/
│   │   └── app_config.py      ← (NEW) endpoint /api/app_config untuk UI Settings
│   ├── workers/
│   │   └── gemini_service.py  ← (PATCHED) baca API key dari DB
│   └── services/
│       └── telegram_service.py← (PATCHED) baca bot token dari DB
└── frontend/                  ← React + Vite
    ├── src/
    │   ├── api.js             ← (PATCHED) skip auth header in APP_MODE
    │   ├── App.jsx            ← (PATCHED) skip /login in APP_MODE
    │   ├── components/
    │   │   └── Layout.jsx     ← (PATCHED) hide logout in APP_MODE
    │   └── pages/
    │       ├── Persiapan.jsx  ← (PATCHED) integrate AppConfig
    │       └── AppConfig.jsx  ← (NEW) UI untuk API keys + schedule + preferences
    └── package.json
```

## Catatan Keamanan

- **Tidak code-signed**: macOS Gatekeeper akan warning. Bypass dengan klik kanan → Open.
- **Bot token & API key di-encrypt** dengan Fernet (AES-128) di DB lokal.
- **Cookie platform plain text** di `~/Library/Application Support/ORDAL/cookies/` — sama seperti ORDAL biasa. Patch ke depan: encrypt at-rest.
- **Tidak ada rate limiting** di endpoint auth (karena single-user di lokal, risiko rendah).
- **CORS di-buka lebar** untuk localhost saja (app mode).

## Build Tanpa Bundle Chromium (App Kecil)

Edit `build.sh`, comment-out bagian "Bundle Playwright Chromium". App jadi ~50MB, tapi user harus install Chromium saat first-run (butuh internet).

Atau set env var sebelum build:
```bash
SKIP_CHROMIUM_BUNDLE=1 ./build.sh
```

## Distribusi ke User Lain

Karena tidak code-signed, user lain juga harus bypass Gatekeeper. Untuk distribusi yang lebih rapi:
1. Daftar **Apple Developer ID** ($99/tahun)
2. Code-sign app: `codesign --deep --force --sign "Developer ID Application: Your Name" dist/ORDAL.app`
3. Notarize via `xcrun notarytool submit ...`
4. Atau distribusi via DMG installer.
=======
# ORDAL-App
Ordal
>>>>>>> 3ea25a787f888c9a36411a5ace8b6a21e9edb159
