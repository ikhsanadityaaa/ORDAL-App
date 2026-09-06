@echo off
setlocal enabledelayedexpansion
REM ==============================================================================
REM  ORDAL.exe Clean Build (Windows)
REM ==============================================================================
REM  Script ini melakukan clean build untuk memastikan app yang terbuild adalah
REM  versi terbaru. Menghapus semua cache, dist, build, dan venv sebelum build.
REM
REM  Jalankan dari root repo:   windows-app\build_clean_windows.bat
REM  Output: windows-app\dist\ORDAL\ORDAL.exe
REM ==============================================================================

cd /d "%~dp0.."
set REPO_ROOT=%cd%

echo ==========================================
echo   ORDAL.exe Clean Build (Windows)
echo ==========================================

REM ── 0. CLEAN UP ───────────────────────────────────────────────────────────────
echo.
echo [0/5] Membersihkan build sebelumnya...

REM Hapus user data (setara ~/Library/Application Support/ORDAL di Mac)
if exist "%LOCALAPPDATA%\ORDAL" (
    echo   ^→ Hapus %LOCALAPPDATA%\ORDAL
    rmdir /s /q "%LOCALAPPDATA%\ORDAL"
)

REM Hapus dist folder
if exist "%REPO_ROOT%\windows-app\dist" (
    echo   ^→ Hapus windows-app\dist
    rmdir /s /q "%REPO_ROOT%\windows-app\dist"
)

REM Hapus build folder
if exist "%REPO_ROOT%\windows-app\build" (
    echo   ^→ Hapus windows-app\build
    rmdir /s /q "%REPO_ROOT%\windows-app\build"
)

REM Hapus .build-venv
if exist "%REPO_ROOT%\.build-venv" (
    echo   ^→ Hapus .build-venv
    rmdir /s /q "%REPO_ROOT%\.build-venv"
)

REM Hapus __pycache__ di seluruh project
echo   ^→ Hapus __pycache__ di seluruh project...
for /d /r %REPO_ROOT% %%d in (__pycache__) do @rd /s /q "%%d" 2>nul

REM Hapus *.pyc files
for /r %REPO_ROOT% %%f in (*.pyc) do @del "%%f" 2>nul

REM Hapus frontend/node_modules (opsional, biar build fresh)
if exist "%REPO_ROOT%\frontend\node_modules" (
    echo   ^→ Hapus frontend\node_modules (biar npm install fresh)
    rmdir /s /q "%REPO_ROOT%\frontend\node_modules"
)

REM Hapus frontend/dist
if exist "%REPO_ROOT%\frontend\dist" (
    echo   ^→ Hapus frontend\dist
    rmdir /s /q "%REPO_ROOT%\frontend\dist"
)

echo ✓ Pembersihan selesai.

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
echo [3/5] Build frontend (VITE_APP_MODE=1)...
cd "%REPO_ROOT%\frontend"
set VITE_APP_MODE=1
call npm install
if errorlevel 1 (
    echo ERROR: npm install gagal.
    exit /b 1
)
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

REM ---- 4. Setup build-venv (hanya untuk PyInstaller, terpisah dari venv app) ----
echo.
echo [4/5] Siapkan build environment (PyInstaller)...
%PYCMD% -m venv "%REPO_ROOT%\.build-venv"
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
echo   CLEAN BUILD BERHASIL!
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
echo   Data user tersimpan di:  %LOCALAPPDATA%\ORDAL\
echo   Log aplikasi:            %LOCALAPPDATA%\ORDAL\app.log
echo.
