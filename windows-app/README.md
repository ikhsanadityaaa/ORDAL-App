# ORDAL Windows App (.exe)

Cara build ORDAL jadi aplikasi desktop Windows (`ORDAL.exe`), setara dengan
`ORDAL.app` di Mac (lihat `../README.md` untuk versi Mac).

## Strategi

Sama seperti Mac app: **ORDAL.exe TIDAK membundle seluruh Python + FastAPI +
Playwright jadi satu file raksasa.** Itu pendekatan yang rapuh untuk app
sebesar ini (banyak native dependency: cryptography, playwright, dll).

Sebagai gantinya:

1. `ORDAL.exe` yang di-*freeze* PyInstaller hanya berisi **`bootstrap.py`**
   (stdlib Python murni — tidak ada fastapi/playwright/pywebview di dalamnya).
2. Saat pertama kali dijalankan, `bootstrap.py`:
   - Mencari Python asli di komputer user (prefer 3.12, tapi terima 3.11-3.14).
   - Menyalin `backend/`, `frontend/dist/`, `windows-app/launcher.py` yang
     dibundle di dalam `.exe` ke `%LOCALAPPDATA%\ORDAL\app\`.
   - Membuat **venv sungguhan** di `%LOCALAPPDATA%\ORDAL\venv` dan `pip
     install` semua dependency di sana (persis seperti kalau user jalankan
     `pip install -r requirements.txt` manual).
   - Install Playwright Chromium.
   - Menjalankan `launcher.py` (window app sesungguhnya) pakai python venv itu.
3. Run berikutnya: venv sudah ada → langsung buka window (skip semua step di
   atas), kecuali `requirements.txt` berubah (auto rebuild venv).

Hasilnya: user tetap dapat **satu file `ORDAL.exe`** yang bisa di-double-click,
tapi semua dependency berat tetap ter-install dengan cara yang teruji
reliable, dan user data selalu persist di `%LOCALAPPDATA%\ORDAL\`.

## Prasyarat

**Di komputer BUILD (Anda):**
- Windows 10/11
- Python 3.11-3.14 (versi apa saja di rentang ini, misal 3.12 atau 3.14) —
  https://www.python.org/downloads/ (centang "Add python.exe to PATH" saat install)
- Node.js 18+ — https://nodejs.org

**Di komputer USER AKHIR (yang menjalankan ORDAL.exe):**
- Windows 10 (21H2+) atau Windows 11 — sudah termasuk WebView2 Runtime secara
  default (dipakai `pywebview` untuk native window).
- Python 3.11-3.14 ter-install (versi apa saja di rentang ini — venv dibuat
  otomatis pakai versi yang tersedia, tidak wajib persis 3.12). Ini keterbatasan
  yang disengaja untuk menghindari kompleksitas embed Python — lihat bagian
  "Pengembangan Lanjutan" di bawah kalau ingin menghilangkan syarat ini sama sekali.

## Build

```bat
cd ordal-app
windows-app\build_windows.bat
```

Script ini akan:
1. Build frontend React (`VITE_APP_MODE=1 npm run build`)
2. Setup venv build sementara (`.build-venv`) + install PyInstaller
3. Freeze `bootstrap.py` → `windows-app\dist\ORDAL\ORDAL.exe`

Build manual (kalau tidak mau pakai .bat):

```bat
cd frontend
set VITE_APP_MODE=1
npm run build
cd ..
py -3 -m venv .build-venv
.build-venv\Scripts\activate
pip install pyinstaller
pyinstaller windows-app\ordal.spec --noconfirm --distpath windows-app\dist --workpath windows-app\build
```

## Distribusi

**Zip seluruh folder `windows-app\dist\ORDAL\`**, bukan cuma `ORDAL.exe`.
Semua file di sebelahnya (backend/, frontend/dist/, `_internal/` dari
PyInstaller, dll) dibutuhkan supaya exe-nya jalan.

## Cara Pakai (User Akhir)

1. Extract folder `ORDAL` ke mana saja (Desktop, `C:\Program Files\ORDAL`, dll).
2. Pastikan Python 3.11-3.14 ter-install (lihat Prasyarat di atas).
3. Double-click `ORDAL.exe`.
4. First-run: window kecil "ORDAL sedang menyiapkan environment..." muncul
   (~5-10 menit tergantung koneksi internet — install dependencies +
   Playwright Chromium). Window app utama terbuka otomatis setelah selesai.
5. Run berikutnya: langsung terbuka, tanpa setup ulang.

## Lokasi Data User

| Isi | Lokasi |
|---|---|
| Database, cookies, CV, API key | `%LOCALAPPDATA%\ORDAL\` |
| Python venv (dependencies) | `%LOCALAPPDATA%\ORDAL\venv\` |
| Copy source app (backend/frontend) | `%LOCALAPPDATA%\ORDAL\app\` |
| Log aplikasi | `%LOCALAPPDATA%\ORDAL\app.log` |

Update ke versi ORDAL.exe baru **tidak menghapus data user** — hanya folder
`app\` yang di-sinkron ulang tiap start; `venv\` dan file data lain tetap ada
(venv hanya di-rebuild otomatis kalau `requirements.txt` berubah).

## Troubleshooting

### "Python tidak ditemukan" saat buka ORDAL.exe
Install Python (3.11-3.14, versi apa saja) dari python.org, **centang "Add
python.exe to PATH"**, lalu buka ORDAL.exe lagi. ORDAL.exe akan otomatis
mendeteksi & memakai versi yang ter-install (prefer 3.12, tapi 3.14 dkk juga
diterima — dependency-nya sudah disesuaikan supaya kompatibel).

### Window blank / app tidak terbuka
Cek log: `%LOCALAPPDATA%\ORDAL\app.log`. Kalau errornya soal module Python
hilang, hapus folder venv dan buka ORDAL.exe lagi (setup akan diulang):
```bat
rmdir /s /q "%LOCALAPPDATA%\ORDAL\venv"
```

### Native window blank / WebView2 error
Install WebView2 Runtime (biasanya sudah ada di Win10/11 terbaru):
https://developer.microsoft.com/microsoft-edge/webview2/

### SmartScreen "Windows protected your PC"
Karena `.exe` belum di-code-sign dengan sertifikat berbayar, Windows
SmartScreen akan warning untuk build yang belum dikenal luas. Klik
**"More info" → "Run anyway"**. Untuk distribusi resmi ke banyak orang,
pertimbangkan beli code-signing certificate.

## Pengembangan Lanjutan (opsional)

Supaya user akhir tidak perlu install Python sama sekali, `bootstrap.py` bisa
dikembangkan lebih lanjut untuk auto-download & pakai
[Python embeddable package](https://docs.python.org/3/using/windows.html#the-embeddable-package)
dari python.org kalau tidak ada Python 3.11-3.14 di sistem, lalu pakai itu
untuk bikin venv. Belum diimplementasikan di versi ini supaya scope build
tetap sederhana.
