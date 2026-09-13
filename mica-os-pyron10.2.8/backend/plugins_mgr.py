"""
Mica OS Pyron — Plugin manager
.mplug = universal plugin (JS DOM + Python backend)
Legacy: .py / .js still installable as limited plugins

Layout:
  plugins/user/<username>/<id>/
    plugin.json
    plugin.js
    plugin.py
"""

from __future__ import annotations
import json
import base64
import re
import shutil
from pathlib import Path
from typing import Any
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
PLUGINS_ROOT = ROOT / "plugins" / "user"


def _slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "_", (name or "plugin").strip())
    return (s.strip("_") or "plugin")[:64]


def _user_root(username: str) -> Path:
    p = PLUGINS_ROOT / username
    p.mkdir(parents=True, exist_ok=True)
    return p


def decode_payload(raw: str | bytes) -> dict[str, Any]:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    text = raw.strip()
    if text.startswith("{"):
        return json.loads(text)
    if "," in text[:80]:
        text = text.split(",", 1)[1]
    try:
        return json.loads(unquote(base64.b64decode(text).decode("utf-8", errors="replace")))
    except Exception:
        return json.loads(base64.b64decode(text).decode("utf-8", errors="replace"))


def _load_plugin_dir(d: Path) -> dict[str, Any] | None:
    meta_path = d / "plugin.json"
    if not meta_path.exists():
        return None
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    meta = dict(meta)
    meta["id"] = meta.get("id") or d.name
    js_p, py_p = d / "plugin.js", d / "plugin.py"
    meta["js"] = js_p.read_text(encoding="utf-8", errors="replace") if js_p.exists() else (meta.get("js") or "")
    meta["py"] = py_p.read_text(encoding="utf-8", errors="replace") if py_p.exists() else (meta.get("py") or "")
    meta["enabled"] = bool(meta.get("enabled", True))
    meta["legacy"] = bool(meta.get("legacy", False))
    return meta


def list_plugins(username: str) -> list[dict[str, Any]]:
    root = _user_root(username)
    out = []
    for d in sorted(root.iterdir()):
        if not d.is_dir():
            continue
        p = _load_plugin_dir(d)
        if not p:
            continue
        out.append({
            "id": p["id"],
            "name": p.get("name") or p["id"],
            "version": p.get("version") or "1.0",
            "description": p.get("description") or "",
            "enabled": p.get("enabled", True),
            "legacy": p.get("legacy", False),
            "kind": p.get("kind") or "mplug",
            "has_js": bool(p.get("js")),
            "has_py": bool(p.get("py")),
        })
    return out


def get_plugin(username: str, plugin_id: str) -> dict[str, Any] | None:
    d = _user_root(username) / _slug(plugin_id)
    if d.is_dir():
        return _load_plugin_dir(d)
    # try exact folder name
    for child in _user_root(username).iterdir():
        if child.is_dir() and child.name == plugin_id:
            return _load_plugin_dir(child)
    return None


def list_enabled_scripts(username: str) -> list[dict[str, Any]]:
    """JS payloads for boot injection."""
    out = []
    for p in list_plugins(username):
        if not p.get("enabled"):
            continue
        full = get_plugin(username, p["id"])
        if full and full.get("js"):
            out.append({
                "id": full["id"],
                "name": full.get("name"),
                "js": full["js"],
                "kind": full.get("kind") or "mplug",
            })
    return out


def install_mplug(username: str, payload: dict[str, Any] | str | bytes, filename: str = "") -> dict[str, Any]:
    if not isinstance(payload, dict):
        payload = decode_payload(payload)

    name = (payload.get("name") or Path(filename).stem or "Plugin").strip()
    plugin_id = _slug(payload.get("id") or name)
    kind = payload.get("kind") or payload.get("type") or "mplug"
    if kind in ("mplug", "plugin"):
        kind = "mplug"

    dest = _user_root(username) / plugin_id
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)

    js = payload.get("js") or payload.get("code") or ""
    py = payload.get("py") or ""
    # legacy pure py/js packages
    if payload.get("legacy") or kind in ("py", "js", "legacy_py", "legacy_js"):
        kind = "legacy_py" if (py and not js) else ("legacy_js" if js and not py else "mplug")

    meta = {
        "id": plugin_id,
        "name": name,
        "version": str(payload.get("version") or "1.0"),
        "description": payload.get("description") or "",
        "type": "mplug",
        "kind": kind if kind.startswith("legacy") else "mplug",
        "enabled": True,
        "legacy": kind.startswith("legacy") or bool(payload.get("legacy")),
        "hooks": payload.get("hooks") or ["boot"],
    }
    (dest / "plugin.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    (dest / "plugin.js").write_text(js, encoding="utf-8")
    (dest / "plugin.py").write_text(py, encoding="utf-8")

    return {
        "ok": True,
        "id": plugin_id,
        "name": name,
        "version": meta["version"],
        "kind": meta["kind"],
        "has_js": bool(js),
        "has_py": bool(py),
    }


def install_legacy_file(username: str, filename: str, content: str) -> dict[str, Any]:
    lower = filename.lower()
    name = Path(filename).stem
    if lower.endswith(".py"):
        return install_mplug(username, {
            "id": name,
            "name": name,
            "kind": "legacy_py",
            "legacy": True,
            "py": content,
            "js": "",
            "description": "Legacy Python plugin",
        }, filename)
    if lower.endswith(".js"):
        # Wrap legacy JS so it can run as DOM plugin safely
        wrapped = (
            "/* legacy js plugin: " + name + " */\n"
            "try {\n" + content + "\n} catch (e) { console.error('[mplug legacy]', e); }\n"
        )
        return install_mplug(username, {
            "id": name,
            "name": name,
            "kind": "legacy_js",
            "legacy": True,
            "js": wrapped,
            "py": "",
            "description": "Legacy JS plugin",
        }, filename)
    raise ValueError("Unsupported legacy plugin type")


def set_enabled(username: str, plugin_id: str, enabled: bool) -> bool:
    p = get_plugin(username, plugin_id)
    if not p:
        return False
    d = _user_root(username) / p["id"]
    meta_path = d / "plugin.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["enabled"] = bool(enabled)
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return True


def uninstall_plugin(username: str, plugin_id: str) -> bool:
    """Fully delete plugin from disk."""
    root = _user_root(username).resolve()
    # match by id field or folder name
    target = None
    for d in root.iterdir():
        if not d.is_dir():
            continue
        if d.name == plugin_id or d.name == _slug(plugin_id):
            target = d
            break
        meta = d / "plugin.json"
        if meta.exists():
            try:
                m = json.loads(meta.read_text(encoding="utf-8"))
                if m.get("id") == plugin_id or m.get("name") == plugin_id:
                    target = d
                    break
            except Exception:
                pass
    if not target:
        return False
    if not str(target.resolve()).startswith(str(root)):
        return False
    shutil.rmtree(target)
    return True


def export_mica_backup(username: str, pin_hint: str = "") -> dict[str, Any]:
    """Build a classic-style .mica profile snapshot (metadata + optional file list)."""
    from auth import get_meta, USERS_ROOT  # type: ignore
    meta = get_meta(username) or {}
    user_dir = USERS_ROOT / username
    files: dict[str, str] = {}
    if user_dir.exists():
        for path in user_dir.rglob("*"):
            if not path.is_file():
                continue
            if path.name.startswith("."):
                continue
            rel = str(path.relative_to(user_dir)).replace("\\", "/")
            try:
                files[rel] = path.read_text(encoding="utf-8")
            except Exception:
                try:
                    files[rel] = "data:application/octet-stream;base64," + base64.b64encode(path.read_bytes()).decode("ascii")
                except Exception:
                    continue
    # plugins summary
    plugs = list_plugins(username)
    return {
        "user": username,
        "username": username,
        "pin": pin_hint,  # caller may omit; restore needs real pin from user
        "theme": meta.get("theme") or "theme-dark",
        "wp": meta.get("wallpaper"),
        "files": files,
        "plugins": plugs,
        "type": "mica",
        "format": "pyron5",
    }
