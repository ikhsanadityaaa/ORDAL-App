@echo off
setlocal enabledelayedexpansion
REM ==============================================================================
REM  Build ORDAL.exe (Windows)
REM ==============================================================================
REM  Jalankan dari root repo:   windows-app\build_windows.bat
REM
REM  Requirements di komputer BUILD (bukan komputer user akhir):
REM    - Python 3.11+ (apa saja -- untuk build .exe, bukan untuk venv runtime app)
REM    - Node.js 18+  (https://nodejs.org)
REM
REM  Output: windows-app\dist\ORDAL\ORDAL.exe
REM  (folder ORDAL berisi ORDAL.exe + file pendukung -- zip/distribusikan
REM   SELURUH folder ORDAL, bukan cuma .exe-nya)
REM ==============================================================================

cd /d "%~dp0.."
set REPO_ROOT=%cd%

echo ==========================================
echo   ORDAL.exe Build (Windows)
echo ==========================================

REM ---- 1. Cek Python ----
echo.
echo [1/5] Cek Python...
py -3 --version >nul 2>&1
if errorlevel 1 (
    python --version >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Python tidak ditemukan.
        echo   Install dari: https://www.python.org/downloads/
        echo   Centang "Add python.exe to PATH" saat install.
        exit /b 1
    )
    set PYCMD=python
) else (
    set PYCMD=py -3
)
for /f "delims=" %%v in ('%PYCMD% --version') do set PYVER=%%v
echo   OK: %PYVER%
echo   (Build .exe ini jalan di Python versi apa saja -- venv APLIKASI runtime
echo    nanti dibuat otomatis oleh ORDAL.exe pakai Python yang ada di komputer
echo    user akhir, prefer 3.12 tapi terima 3.11-3.14.)

REM ---- 2. Cek Node.js ----
echo.
echo [2/5] Cek Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js tidak ditemukan. Install dari: https://nodejs.org
    exit /b 1
)
for /f "delims=" %%v in ('node --version') do set NODEVER=%%v
echo   OK: node %NODEVER%

REM ---- 3. Build frontend ----
echo.
echo [3/5] Build frontend...
cd "%REPO_ROOT%\frontend"
if not exist node_modules (
    echo   Install npm dependencies...
    call npm install
    if errorlevel 1 exit /b 1
)
:: v3: VITE_APP_MODE dihapus — app selalu mode login
call npm run build
if errorlevel 1 (
    echo ERROR: Build frontend gagal.
    exit /b 1
)
cd "%REPO_ROOT%"
if not exist "frontend\dist\index.html" (
    echo ERROR: frontend\dist\index.html tidak ada setelah build.
    exit /b 1
)
echo   OK: frontend\dist\ siap.

REM ---- 3b. Cek konfigurasi database (.env) ----
echo.
echo [3b/5] Cek backend\.env (database pusat)...
if exist "%REPO_ROOT%\backend\.env" (
    echo   OK: backend\.env ditemukan — akan di-bundle ke ORDAL.exe.
    findstr /C:"127.0.0.1:5432" "%REPO_ROOT%\backend\.env" >nul 2>&1
    if not errorlevel 1 (
        echo   [!] WARNING: .env masih memakai DATABASE URL development ^(127.0.0.1^).
        echo       Ganti ORDAL_DATABASE_URL dengan URL Supabase production sebelum
        echo       distribusi, atau app akan minta DATABASE URL saat pertama dibuka.
    )
) else (
    echo   [!] backend\.env tidak ada. App akan menampilkan dialog input
    echo       DATABASE URL saat pertama kali dibuka oleh user.
    echo       ^(Copy backend\.env.example ke backend\.env dan isi
    echo        ORDAL_DATABASE_URL untuk embed konfigurasi saat build.^)
)

REM ---- 4. Setup build-venv (hanya untuk PyInstaller, terpisah dari venv app) ----
echo.
echo [4/5] Siapkan build environment (PyInstaller)...
if not exist "%REPO_ROOT%\.build-venv" (
    %PYCMD% -m venv "%REPO_ROOT%\.build-venv"
)
call "%REPO_ROOT%\.build-venv\Scripts\activate.bat"
python -m pip install --upgrade pip >nul
pip install --upgrade pyinstaller >nul
if errorlevel 1 (
    echo ERROR: Gagal install PyInstaller.
    exit /b 1
)
echo   OK: PyInstaller siap.

REM ---- 5. Freeze bootstrap.py -> ORDAL.exe ----
echo.
echo [5/5] Freeze ORDAL.exe dengan PyInstaller...
cd "%REPO_ROOT%"
pyinstaller windows-app\ordal.spec --noconfirm --distpath windows-app\dist --workpath windows-app\build
if errorlevel 1 (
    echo ERROR: PyInstaller build gagal.
    call deactivate
    exit /b 1
)
call deactivate

echo.
echo ==========================================
echo   BUILD BERHASIL
echo ==========================================
echo.
echo   Output: %REPO_ROOT%\windows-app\dist\ORDAL\ORDAL.exe
echo.
echo   PENTING: distribusikan SELURUH folder "ORDAL" (zip folder ini),
echo   bukan cuma file ORDAL.exe -- semua file di sebelahnya dibutuhkan.
echo.
echo   Cara pakai (di komputer user akhir):
echo     1. Extract folder ORDAL ke mana saja (mis. Desktop atau Program Files).
echo     2. Pastikan Python 3.11-3.14 ter-install di komputer user
echo        (https://www.python.org/downloads/release/python-3120/,
echo        centang "Add python.exe to PATH").
echo     3. Double-click ORDAL.exe.
echo     4. First-run: dialog "menyiapkan environment" muncul (~5-10 menit,
echo        install dependencies + Chromium). Window app terbuka otomatis
echo        setelah selesai.
echo     5. Run berikutnya: langsung buka, tanpa setup ulang.
echo.
echo   Data user tersimpan di:  %%LOCALAPPDATA%%\ORDAL\
echo   Log aplikasi:            %%LOCALAPPDATA%%\ORDAL\app.log
echo.
