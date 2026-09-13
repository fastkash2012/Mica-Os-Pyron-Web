@echo off
cd /d "%~dp0backend"
where py >nul 2>&1
if %errorlevel%==0 (set PY=py -3.12) else (set PY=python)
start "" http://127.0.0.1:8000
%PY% -m uvicorn main:app --host 127.0.0.1 --port 8000
pause
