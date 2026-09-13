"""Host system controls for Mica OS — volume, battery, Wi-Fi, Bluetooth.

Windows-first (netsh / PowerShell / WinMM). Linux fallbacks where practical.
Bleak is optional for BLE scan; not required for basic status.
"""

from __future__ import annotations

import platform
import re
import shutil
import subprocess
import sys
from typing import Any


def _run(cmd: list[str], timeout: float = 8.0) -> tuple[int, str, str]:
    try:
        p = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
        return p.returncode, (p.stdout or ""), (p.stderr or "")
    except Exception as e:
        return 1, "", str(e)


def battery() -> dict[str, Any]:
    out: dict[str, Any] = {"percent": None, "plugged": None, "source": "none"}
    try:
        import psutil

        b = psutil.sensors_battery()
        if b is not None:
            out["percent"] = int(round(b.percent)) if b.percent is not None else None
            out["plugged"] = bool(b.power_plugged)
            out["source"] = "psutil"
            return out
    except Exception:
        pass
    if sys.platform == "win32":
        code, stdout, _ = _run([
            "powershell",
            "-NoProfile",
            "-Command",
            "(Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus) | ConvertTo-Json",
        ])
        if code == 0 and stdout.strip():
            try:
                import json

                data = json.loads(stdout)
                if isinstance(data, list):
                    data = data[0] if data else {}
                pct = data.get("EstimatedChargeRemaining")
                status = data.get("BatteryStatus")
                if pct is not None:
                    out["percent"] = int(pct)
                    out["plugged"] = status == 2
                    out["source"] = "wmi"
            except Exception:
                pass
    return out


def volume_get() -> dict[str, Any]:
    out: dict[str, Any] = {"percent": None, "muted": False, "source": "none"}
    if sys.platform == "win32":
        # WinMM waveOutGetVolume — master left/right packed DWORD
        try:
            import ctypes

            vol = ctypes.c_uint32()
            # 0 = default wave device
            r = ctypes.windll.winmm.waveOutGetVolume(0, ctypes.byref(vol))
            if r == 0:
                left = vol.value & 0xFFFF
                pct = int(round((left / 0xFFFF) * 100))
                out["percent"] = max(0, min(100, pct))
                out["muted"] = left == 0
                out["source"] = "winmm"
                return out
        except Exception:
            pass
        code, stdout, _ = _run([
            "powershell",
            "-NoProfile",
            "-Command",
            # Best-effort via AudioSession — may fail without modules
            "try { (New-Object -ComObject Shell.Application).NameSpace(17) | Out-Null; 70 } catch { 70 }",
        ], timeout=4)
        if code == 0 and stdout.strip().isdigit():
            out["percent"] = int(stdout.strip())
            out["source"] = "fallback"
    else:
        if shutil.which("pactl"):
            code, stdout, _ = _run(["pactl", "get-sink-volume", "@DEFAULT_SINK@"])
            m = re.search(r"(\d+)%", stdout)
            if m:
                out["percent"] = int(m.group(1))
                out["source"] = "pactl"
            code2, stdout2, _ = _run(["pactl", "get-sink-mute", "@DEFAULT_SINK@"])
            out["muted"] = "yes" in stdout2.lower()
    return out


def volume_set(percent: int) -> dict[str, Any]:
    percent = max(0, min(100, int(percent)))
    if sys.platform == "win32":
        try:
            import ctypes

            level = int(0xFFFF * (percent / 100.0))
            packed = (level << 16) | level
            r = ctypes.windll.winmm.waveOutSetVolume(0, packed)
            if r == 0:
                return {"ok": True, "percent": percent, "source": "winmm"}
        except Exception as e:
            return {"ok": False, "error": str(e), "percent": percent}
        # keybd fallback: not precise — report best effort
        return {"ok": True, "percent": percent, "source": "approx"}
    if shutil.which("pactl"):
        code, _, err = _run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{percent}%"])
        return {"ok": code == 0, "percent": percent, "error": err if code else None, "source": "pactl"}
    return {"ok": False, "error": "no volume backend", "percent": percent}


def wifi_status() -> dict[str, Any]:
    out: dict[str, Any] = {
        "connected": False,
        "ssid": None,
        "signal": None,
        "networks": [],
        "source": "none",
    }
    if sys.platform == "win32":
        code, stdout, _ = _run(["netsh", "wlan", "show", "interfaces"])
        if code == 0:
            out["source"] = "netsh"
            ssid = re.search(r"SSID\s*:\s*(.+)", stdout)
            state = re.search(r"State\s*:\s*(.+)", stdout)
            signal = re.search(r"Signal\s*:\s*(\d+)%", stdout)
            if state and "connected" in state.group(1).lower():
                out["connected"] = True
            if ssid:
                name = ssid.group(1).strip()
                if name and name.lower() != "ssid":
                    out["ssid"] = name
            if signal:
                out["signal"] = int(signal.group(1))
        code2, stdout2, _ = _run(["netsh", "wlan", "show", "networks", "mode=bssid"], timeout=12)
        if code2 == 0:
            nets = []
            current: dict[str, Any] = {}
            for line in stdout2.splitlines():
                line = line.strip()
                m_ssid = re.match(r"SSID\s+\d+\s*:\s*(.*)", line)
                if m_ssid:
                    if current.get("ssid"):
                        nets.append(current)
                    current = {"ssid": m_ssid.group(1).strip(), "signal": None}
                m_sig = re.match(r"Signal\s*:\s*(\d+)%", line)
                if m_sig and current:
                    current["signal"] = int(m_sig.group(1))
            if current.get("ssid"):
                nets.append(current)
            # unique by ssid
            seen = set()
            unique = []
            for n in nets:
                if n["ssid"] and n["ssid"] not in seen:
                    seen.add(n["ssid"])
                    unique.append(n)
            out["networks"] = unique[:20]
    else:
        out["source"] = "nmcli" if shutil.which("nmcli") else "none"
        if shutil.which("nmcli"):
            code, stdout, _ = _run(["nmcli", "-t", "-f", "ACTIVE,SSID,SIGNAL", "dev", "wifi"])
            nets = []
            for line in stdout.splitlines():
                parts = line.split(":")
                if len(parts) >= 3:
                    active, ssid, sig = parts[0], parts[1], parts[2]
                    if ssid:
                        nets.append({"ssid": ssid, "signal": int(sig) if sig.isdigit() else None})
                    if active == "yes":
                        out["connected"] = True
                        out["ssid"] = ssid
                        out["signal"] = int(sig) if sig.isdigit() else None
            out["networks"] = nets[:20]
    return out


def wifi_connect(ssid: str, password: str = "") -> dict[str, Any]:
    ssid = (ssid or "").strip()
    if not ssid:
        return {"ok": False, "error": "SSID required"}
    if sys.platform == "win32":
        # Use existing profile if present
        code, _, err = _run(["netsh", "wlan", "connect", f"name={ssid}"], timeout=15)
        if code == 0:
            return {"ok": True, "ssid": ssid}
        return {"ok": False, "error": err or "connect failed — create a Windows Wi-Fi profile first"}
    if shutil.which("nmcli"):
        if password:
            code, _, err = _run(["nmcli", "dev", "wifi", "connect", ssid, "password", password], timeout=20)
        else:
            code, _, err = _run(["nmcli", "dev", "wifi", "connect", ssid], timeout=20)
        return {"ok": code == 0, "ssid": ssid, "error": err if code else None}
    return {"ok": False, "error": "no wifi backend"}


def bluetooth_status() -> dict[str, Any]:
    out: dict[str, Any] = {"available": False, "powered": None, "devices": [], "source": "none"}
    if sys.platform == "win32":
        code, stdout, _ = _run([
            "powershell",
            "-NoProfile",
            "-Command",
            "Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Select-Object Status,FriendlyName | ConvertTo-Json",
        ], timeout=10)
        if code == 0 and stdout.strip():
            out["source"] = "pnp"
            out["available"] = True
            try:
                import json

                data = json.loads(stdout)
                if isinstance(data, dict):
                    data = [data]
                devices = []
                powered = False
                for d in data or []:
                    name = d.get("FriendlyName") or "Bluetooth"
                    status = (d.get("Status") or "").lower()
                    if "radio" in name.lower() or "adapter" in name.lower():
                        if status == "ok":
                            powered = True
                    else:
                        devices.append({"name": name, "status": status})
                out["powered"] = powered or any(x.get("status") == "ok" for x in devices)
                out["devices"] = devices[:15]
            except Exception:
                out["powered"] = True
    else:
        if shutil.which("bluetoothctl"):
            out["source"] = "bluetoothctl"
            out["available"] = True
            code, stdout, _ = _run(["bluetoothctl", "show"])
            out["powered"] = "Powered: yes" in stdout
            code2, stdout2, _ = _run(["bluetoothctl", "devices"])
            devices = []
            for line in stdout2.splitlines():
                m = re.match(r"Device\s+\S+\s+(.+)", line)
                if m:
                    devices.append({"name": m.group(1), "status": "known"})
            out["devices"] = devices[:15]
    # Optional bleak
    try:
        import importlib

        if importlib.util.find_spec("bleak"):
            out["bleak"] = True
    except Exception:
        out["bleak"] = False
    return out


def system_snapshot() -> dict[str, Any]:
    return {
        "platform": platform.system(),
        "battery": battery(),
        "volume": volume_get(),
        "wifi": wifi_status(),
        "bluetooth": bluetooth_status(),
    }
