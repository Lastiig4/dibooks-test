@echo off
cd /d "%~dp0.."
set /p MSG=Commit message: 
git add .
git commit -m "%MSG%"
git push
pause
