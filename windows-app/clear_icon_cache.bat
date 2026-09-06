@echo off
REM ==============================================================================
REM  Clear Windows Icon Cache untuk ORDAL
REM ==============================================================================
REM  Jalankan script ini kalau icon ORDAL.exe masih kelihatan icon Python/kertas
REM  padahal sudah rebuild ORDAL.exe dengan icon baru.
REM
REM  Cara pakai: double-click file ini, atau jalankan dari Command Prompt.
REM  Setelah selesai, RESTART komputer (atau logout + login) supaya Explorer
REM  rebuild icon cache dengan icon terbaru.
REM ==============================================================================

echo ==========================================
echo   Clear Windows Icon Cache
echo ==========================================
echo.

echo [1/4] Stop Explorer.exe...
taskkill /f /im explorer.exe
echo   OK.
echo.

echo [2/4] Hapus IconCache.db...
if exist "%LOCALAPPDATA%\IconCache.db" (
    del /f /q "%LOCALAPPDATA%\IconCache.db"
    echo   Dihapus: %LOCALAPPDATA%\IconCache.db
) else (
    echo   IconCache.db tidak ditemukan (OK).
)
echo.

echo [3/4] Hapus Explorer thumbcache...
if exist "%LOCALAPPDATA%\Microsoft\Windows\Explorer" (
    del /f /q "%LOCALAPPDATA%\Microsoft\Windows\Explorer\thumbcache_*.db" 2>nul
    del /f /q "%LOCALAPPDATA%\Microsoft\Windows\Explorer\iconcache_*.db" 2>nul
    echo   Thumbcache di-clear.
) else (
    echo   Folder Explorer tidak ditemukan.
)
echo.

echo [4/4] Restart Explorer.exe...
start explorer.exe
echo   OK.
echo.

echo ==========================================
echo   DONE — Icon Cache di-clear
echo ==========================================
echo.
echo Sekarang jalankan ORDAL.exe lagi. Icon ORDAL (logo petir orange)
echo harus muncul di title bar dan taskbar.
echo.
echo Kalau icon masih Python, RESTART komputer dulu supaya Windows
echo benar-benar rebuild icon cache.
echo.
pause
