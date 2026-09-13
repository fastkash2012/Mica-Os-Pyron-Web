#!/usr/bin/env bash
cd "$(dirname "$0")/backend"
python3 -m pip install -q -r requirements.txt
echo "Mica OS Pyron → http://127.0.0.1:8000"
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
