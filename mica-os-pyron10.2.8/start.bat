@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Mica OS Pyron 10.2.8
cd /d "%~dp0"

echo ========================================
echo   Mica OS Pyron 10.2.8 - One Click Start
echo ========================================
echo.

set "PY="

REM --- Resolve a Python interpreter (many fallbacks) ---
where py >nul 2>&1
if %errorlevel%==0 (
  py -3.12 -c "import sys" >nul 2>&1 && set "PY=py -3.12"
  if not defined PY py -3 -c "import sys" >nul 2>&1 && set "PY=py -3"
  if not defined PY py -c "import sys" >nul 2>&1 && set "PY=py"
)

if not defined PY (
  where python >nul 2>&1 && set "PY=python"
)
if not defined PY (
  where python3 >nul 2>&1 && set "PY=python3"
)

REM Common install paths
if not defined PY if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PY=%LocalAppData%\Programs\Python\Python312\python.exe"
if not defined PY if exist "%LocalAppData%\Programs\Python\Python311\python.exe" set "PY=%LocalAppData%\Programs\Python\Python311\python.exe"
if not defined PY if exist "%ProgramFiles%\Python312\python.exe" set "PY=%ProgramFiles%\Python312\python.exe"
if not defined PY if exist "%ProgramFiles%\Python311\python.exe" set "PY=%ProgramFiles%\Python311\python.exe"
if not defined PY if exist "C:\Python312\python.exe" set "PY=C:\Python312\python.exe"
if not defined PY if exist "C:\Python311\python.exe" set "PY=C:\Python311\python.exe"

if not defined PY (
  echo Python was not found on this PC.
  echo.
  echo Opening the official Python download page...
  start "" "https://www.python.org/downloads/windows/"
  echo.
  echo Install Python 3.12+ and CHECK "Add python.exe to PATH".
  echo Then double-click start.bat again.
  pause
  exit /b 1
)

echo Using: %PY%
%PY% -c "import sys; print('Python', sys.version)" || (
  echo Failed to run Python.
  pause
  exit /b 1
)

echo.
echo Checking / installing requirements...
%PY% -m pip install --upgrade pip >nul 2>&1
%PY% -m pip install -r backend\requirements.txt
if errorlevel 1 (
  echo.
  echo pip install failed. Trying with --user ...
  %PY% -m pip install --user -r backend\requirements.txt
  if errorlevel 1 (
    echo FAILED to install requirements.
    pause
    exit /b 1
  )
)

echo.
echo Verifying critical imports...
%PY% -c "import fastapi,uvicorn,cryptography,psutil; from PyQt6.QtWebEngineWidgets import QWebEngineView; print('All OK')"
if errorlevel 1 (
  echo.
  echo Some packages missing - forcing reinstall...
  %PY% -m pip install --force-reinstall -r backend\requirements.txt
  %PY% -c "import fastapi,uvicorn,cryptography,psutil; from PyQt6.QtWebEngineWidgets import QWebEngineView; print('All OK')"
  if errorlevel 1 (
    echo Still missing packages. See errors above.
    pause
    exit /b 1
  )
)

echo.
echo Starting Mica OS Pyron...
%PY% native_app.py
set ERR=%errorlevel%
if not "%ERR%"=="0" (
  echo.
  echo App exited with code %ERR%
  pause
)
exit /b %ERR%
