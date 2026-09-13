"""User accounts + .mica restore for Pyron."""

from __future__ import annotations
import json
import hashlib
import secrets
import base64
from pathlib import Path
from datetime import datetime
from urllib.parse import unquote
from typing import Any

USERS_ROOT = Path(__file__).resolve().parent.parent / "data" / "users"


def _meta(username: str) -> Path:
    return USERS_ROOT / username / ".mica_meta.json"


def list_users() -> list[str]:
    if not USERS_ROOT.exists():
        return []
    return sorted(
        p.name for p in USERS_ROOT.iterdir()
        if p.is_dir() and (p / ".mica_meta.json").exists()
    )


def user_exists(username: str) -> bool:
    return _meta(username).exists()


def create_user(username: str, pin: str, theme: str = "theme-dark") -> bool:
    username = (username or "").strip()
    if not username or not pin or user_exists(username):
        return False
    user_dir = USERS_ROOT / username
    user_dir.mkdir(parents=True, exist_ok=True)
    for folder in ["Documents", "Pictures", "Videos", "Music", "Desktop", "Downloads", "Apps"]:
        (user_dir / folder).mkdir(exist_ok=True)
    salt = secrets.token_hex(8)
    meta = {
        "username": username,
        "pin_hash": hashlib.sha256((salt + pin).encode()).hexdigest(),
        "salt": salt,
        "created": datetime.utcnow().isoformat(),
        "theme": theme,
    }
    _meta(username).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return True


def verify_pin(username: str, pin: str) -> bool:
    username = (username or "").strip()
    if not user_exists(username):
        return False
    try:
        meta = json.loads(_meta(username).read_text(encoding="utf-8"))
        expected = hashlib.sha256((meta["salt"] + pin).encode()).hexdigest()
        return secrets.compare_digest(expected, meta["pin_hash"])
    except Exception:
        return False


def get_meta(username: str) -> dict[str, Any]:
    if not user_exists(username):
        return {}
    return json.loads(_meta(username).read_text(encoding="utf-8"))



def restore_mica(path: Path) -> tuple[bool, str]:
    """Restore a .mica backup. Returns (ok, username_or_error)."""
    raw = path.read_bytes()

    def try_json(s: str):
        s = (s or "").strip()
        if not s:
            return None
        if s.startswith("{"):
            try:
                return json.loads(s)
            except Exception:
                return None
        return None

    def try_b64(s: str):
        s = (s or "").strip()
        if not s:
            return None
        if "base64," in s[:120]:
            s = s.split("base64,", 1)[1]
        elif s.startswith("data:") and "," in s[:120]:
            s = s.split(",", 1)[1]
        s = "".join(s.split())
        pad = "=" * ((4 - len(s) % 4) % 4)
        try:
            decoded = base64.b64decode(s + pad, validate=False)
        except Exception:
            return None
        try:
            text = decoded.decode("utf-8")
        except Exception:
            return None
        for variant in (text, unquote(text)):
            obj = try_json(variant)
            if obj is not None:
                return obj
            try:
                inner = "".join(variant.split())
                pad2 = "=" * ((4 - len(inner) % 4) % 4)
                decoded2 = base64.b64decode(inner + pad2, validate=False)
                text2 = decoded2.decode("utf-8")
                obj = try_json(text2) or try_json(unquote(text2))
                if obj is not None:
                    return obj
            except Exception:
                pass
        return None

    data = None
    try:
        data = try_json(raw.decode("utf-8"))
    except Exception:
        data = None
    if data is None:
        try:
            data = try_b64(raw.decode("utf-8", errors="ignore"))
        except Exception:
            data = None
    if data is None:
        try:
            data = try_b64(raw.decode("latin-1", errors="ignore"))
        except Exception:
            data = None

    if not isinstance(data, dict):
        return False, "Could not parse .mica file (expected JSON or base64 JSON)"

    username = (data.get("user") or data.get("username") or data.get("name") or "").strip()
    pin = str(data.get("pin") or data.get("password") or data.get("pass") or "")
    if not username:
        return False, "Backup missing username"
    if not pin:
        pin = "0000"

    user_dir = USERS_ROOT / username
    user_dir.mkdir(parents=True, exist_ok=True)
    for folder in ["Documents", "Pictures", "Videos", "Music", "Desktop", "Downloads", "Apps"]:
        (user_dir / folder).mkdir(exist_ok=True)

    salt = secrets.token_hex(8)
    meta = {
        "username": username,
        "pin_hash": hashlib.sha256((salt + pin).encode()).hexdigest(),
        "salt": salt,
        "created": datetime.utcnow().isoformat(),
        "theme": data.get("theme") or "theme-dark",
        "wallpaper": data.get("wp") or data.get("wallpaper"),
        "restored": True,
        "encryption_enabled": False,
        "devmode": False,
        "security_version": 6,
        "enc_salt": secrets.token_hex(16),
        "admin_pin_hash": hashlib.sha256((salt + pin).encode()).hexdigest(),
    }
    if pin == "0000" and not (data.get("pin") or data.get("password")):
        meta["must_reset_pin"] = True
    _meta(username).write_text(json.dumps(meta, indent=2), encoding="utf-8")

    files = data.get("files") or data.get("fs") or data.get("storage") or {}
    if isinstance(files, dict):
        for rel, content in files.items():
            rel_clean = str(rel).replace(chr(92), "/").lstrip("/")
            if not rel_clean or rel_clean.startswith(".mica"):
                continue
            target = (user_dir / rel_clean).resolve()
            try:
                if not str(target).startswith(str(user_dir.resolve())):
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                if isinstance(content, str) and content.startswith("data:"):
                    try:
                        _, b64 = content.split(",", 1)
                        target.write_bytes(base64.b64decode(b64))
                    except Exception:
                        continue
                elif isinstance(content, str):
                    target.write_text(content, encoding="utf-8", errors="replace")
            except Exception:
                continue

    return True, username


