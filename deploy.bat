@echo off
setlocal
REM ===== DBD Skill-Check Trainer: build + commit + push =====
REM Run by typing  deploy  in this folder, or by double-clicking this file.

REM --- 1. Build the app (verifies it compiles before anything is pushed) ---
cd /d "%~dp0dbd-skillcheck-trainer"
echo === Building ===
call npm run build
if errorlevel 1 (
  echo.
  echo BUILD FAILED — nothing was pushed. Fix the errors above and run deploy again.
  pause
  exit /b 1
)

REM --- 2. Commit message (press Enter to use a default) ---
cd /d "%~dp0"
echo.
set "msg=Update trainer"
set /p "msg=Commit message [%msg%]: "

REM --- 3. Commit and push (triggers the GitHub Actions deploy) ---
echo.
echo === Committing and pushing ===
git add -A
git commit -m "%msg%"
git push

echo.
echo === Done. Open the Actions tab on GitHub to watch it deploy. ===
pause
