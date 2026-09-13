"""Disk-backed themes for Pyron (survive reboot)."""

from __future__ import annotations
import json
import base64
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
THEMES_ROOT = ROOT / "themes" / "user"


def _slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "_", (name or "theme").strip())
    return (s.strip("_") or "theme")[:64]


def _user_dir(username: str) -> Path:
    p = THEMES_ROOT / username
    p.mkdir(parents=True, exist_ok=True)
    return p


def _active_path(username: str) -> Path:
    return _user_dir(username) / "active.json"


def list_themes(username: str) -> list[dict[str, Any]]:
    root = _user_dir(username)
    out = []
    for p in sorted(root.glob("*.json")):
        if p.name == "active.json":
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            out.append({
                "id": data.get("id") or p.stem,
                "name": data.get("name") or p.stem,
                "cssClass": data.get("cssClass") or f"theme-{p.stem}",
                "cssVariables": data.get("cssVariables") or "",
                "bg": data.get("bg"),
                "text": data.get("text"),
                "wp": data.get("wp"),
            })
        except Exception:
            continue
    return out


def get_theme(username: str, theme_id: str) -> dict[str, Any] | None:
    path = _user_dir(username) / f"{_slug(theme_id)}.json"
    if not path.exists():
        # try by name match
        for t in list_themes(username):
            if t["id"] == theme_id or t["name"] == theme_id:
                return t
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_theme(username: str, theme: dict[str, Any]) -> dict[str, Any]:
    name = (theme.get("name") or "Theme").strip()
    theme_id = _slug(theme.get("id") or theme.get("cssClass") or name)
    data = {
        "id": theme_id,
        "name": name,
        "type": "mpkg",
        "cssClass": theme.get("cssClass") or f"theme-{theme_id}",
        "cssVariables": theme.get("cssVariables") or "",
        "bg": theme.get("bg"),
        "text": theme.get("text"),
        "wp": theme.get("wp"),
    }
    path = _user_dir(username) / f"{theme_id}.json"
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def delete_theme(username: str, theme_id: str) -> bool:
    path = _user_dir(username) / f"{_slug(theme_id)}.json"
    if path.exists():
        path.unlink()
        # clear active if matched
        active = get_active(username)
        if active and active.get("id") == _slug(theme_id):
            _active_path(username).unlink(missing_ok=True)
        return True
    return False


def set_active(username: str, theme_id: str | None, builtin: str | None = None) -> dict[str, Any]:
    """Set active theme: either disk theme id or builtin class name."""
    payload: dict[str, Any] = {}
    if theme_id:
        t = get_theme(username, theme_id)
        if not t:
            raise FileNotFoundError("Theme not found")
        payload = {"mode": "custom", "id": t["id"], "theme": t}
    elif builtin is not None:
        payload = {"mode": "builtin", "class": builtin or "theme-dark"}
    else:
        payload = {"mode": "builtin", "class": "theme-dark"}
    _active_path(username).write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def get_active(username: str) -> dict[str, Any] | None:
    p = _active_path(username)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None
