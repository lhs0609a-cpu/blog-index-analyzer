@echo off
echo ========================================
echo  Blog Index Analyzer - Build EXE
echo ========================================
echo.

REM D”\ (¤À $X
echo [1/3] Installing dependencies...
pip install pyinstaller pystray pillow

REM 0t LÜ ¬
echo [2/3] Cleaning previous builds...
if exist "dist" rmdir /s /q dist
if exist "build" rmdir /s /q build

REM PyInstaller ä‰
echo [3/3] Building executable...
pyinstaller --clean build_exe.spec

echo.
echo ========================================
if exist "dist\BlogIndexAnalyzer.exe" (
    echo  Build SUCCESS!
    echo  Output: dist\BlogIndexAnalyzer.exe
) else (
    echo  Build FAILED! Check errors above.
)
echo ========================================
pause
