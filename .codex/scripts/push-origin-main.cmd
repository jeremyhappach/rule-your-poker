@echo off
setlocal
cd /d "%~dp0..\.." || exit /b 1
"C:\Program Files\Git\cmd\git.exe" push origin main
