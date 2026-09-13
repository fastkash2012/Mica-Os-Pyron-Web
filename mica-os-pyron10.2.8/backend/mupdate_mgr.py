"""Mupdate v2 — signed system payload installer for Pyron."""
from __future__ import annotations
import json
import base64
import re
import shutil
from pathlib import Path
from typing import Any
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
UPDATES_ROOT = ROOT / "updates"

OFFICIAL_SIGNS = {
    "FK20120708",
}


def is_official_sign(sign: str | None) -> bool:
    return (sign or "").strip() in OFFICIAL_SIGNS


def _slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "_", (name or "update").strip())
    return (s.strip("_") or "update")[:64]


def decode_payload(raw: str | bytes) -> dict[str, Any]:
    if isinstance(raw, bytes):
        try:
            raw = raw.decode("utf-8")
        except Exception:
            raw = raw.decode("latin-1", errors="replace")
    text = raw.strip()
    if text.startswith("{"):
        return json.loads(text)
    try:
        u = unquote(text)
        if u.strip().startswith("{"):
            return json.loads(u)
    except Exception:
        pass
    if "base64," in text[:80]:
        text = text.split("base64,", 1)[1]
    elif text.startswith("data:") and "," in text[:80]:
        text = text.split(",", 1)[1]
    text = "".join(text.split())
    pad = "=" * ((4 - len(text) % 4) % 4)
    decoded = base64.b64decode(text + pad)
    inner = decoded.decode("utf-8", errors="replace")
    try:
        return json.loads(unquote(inner))
    except Exception:
        return json.loads(inner)


def inspect_mupdate(payload: dict[str, Any] | str | bytes) -> dict[str, Any]:
    if not isinstance(payload, dict):
        payload = decode_payload(payload)
    sign = str(payload.get("sign") or payload.get("signature") or "").strip()
    scripts = payload.get("scripts") or payload.get("script") or []
    if isinstance(scripts, str):
        scripts = [scripts]
    return {
        "name": payload.get("name") or "Update",
        "version": str(payload.get("version") or "1.0"),
        "sign": sign,
        "official": is_official_sign(sign),
        "requires_admin": not is_official_sign(sign),
        "files_count": len(payload.get("files") or {}),
        "plugins_count": len(payload.get("plugins") or []),
        "scripts_count": len(scripts),
        "changelog": payload.get("changelog") or "",
        "format": int(payload.get("format") or 2),
    }


def install_mupdate(
    username: str,
    payload: dict[str, Any] | str | bytes,
    filename: str = "",
    *,
    admin_approved: bool = False,
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        payload = decode_payload(payload)

    sign = str(payload.get("sign") or payload.get("signature") or "").strip()
    official = is_official_sign(sign)
    if not official and not admin_approved:
        raise PermissionError(
            "UNSIGNED_UPDATE: this .mupdate is missing a trusted sign (FK20120708). "
            "Admin permission required to install."
        )

    name = (payload.get("name") or Path(filename).stem or "Update").strip()
    version = str(payload.get("version") or "1.0")
    uid = _slug(payload.get("id") or f"{name}_{version}")

    dest = UPDATES_ROOT / username / uid
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)

    files = payload.get("files") or {}
    written = []
    if isinstance(files, dict):
        for rel, content in files.items():
            rel_clean = str(rel).replace("\\", "/").lstrip("/")
            if not rel_clean or ".." in rel_clean.split("/"):
                continue
            if rel_clean.startswith(("system/", "apps/", "backend/", "frontend/", "plugins/")):
                target = ROOT / rel_clean
            else:
                target = dest / "files" / rel_clean
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(content, str) and content.startswith("data:"):
                _, b64 = content.split(",", 1)
                target.write_bytes(base64.b64decode(b64))
            elif isinstance(content, str):
                target.write_text(content, encoding="utf-8")
            try:
                written.append(str(target.relative_to(ROOT)).replace("\\", "/"))
            except Exception:
                written.append(rel_clean)

    scripts = payload.get("scripts") or payload.get("script") or []
    if isinstance(scripts, str):
        scripts = [scripts]
    (dest / "scripts.json").write_text(json.dumps(scripts, indent=2), encoding="utf-8")

    plugins_installed = []
    try:
        from plugins_mgr import install_mplug
        for plug in payload.get("plugins") or []:
            try:
                r = install_mplug(username, plug if isinstance(plug, dict) else str(plug))
                plugins_installed.append(r.get("id") or r.get("name"))
            except Exception as e:
                plugins_installed.append(f"ERR:{e}")
    except Exception as e:
        plugins_installed.append(f"ERR:{e}")

    applied = []
    for line in scripts:
        line = (line or "").strip()
        if not line or line.startswith("#"):
            continue
        applied.append(_run_script_line(username, line))

    meta = {
        "id": uid,
        "name": name,
        "version": version,
        "sign": sign,
        "official": official,
        "changelog": payload.get("changelog") or "",
        "files": written,
        "plugins": plugins_installed,
        "scripts_applied": applied,
        "type": "mupdate",
        "format": 2,
    }
    (dest / "update.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def _run_script_line(username: str, line: str) -> str:
    parts = line.split(maxsplit=1)
    cmd = parts[0].lower()
    arg = parts[1] if len(parts) > 1 else ""
    try:
        if cmd == "echo":
            return arg
        if cmd == "mkdir" and arg:
            p = ROOT / arg.replace("..", "")
            p.mkdir(parents=True, exist_ok=True)
            return f"mkdir {arg}"
        if cmd == "copy" and "->" in arg:
            src, dst = [x.strip() for x in arg.split("->", 1)]
            s, d = ROOT / src, ROOT / dst
            d.parent.mkdir(parents=True, exist_ok=True)
            if s.is_dir():
                shutil.copytree(s, d, dirs_exist_ok=True)
            else:
                shutil.copy2(s, d)
            return f"copy {src} -> {dst}"
        if cmd == "enable_plugin" and arg:
            from plugins_mgr import set_enabled
            set_enabled(username, arg, True)
            return f"enable_plugin {arg}"
        if cmd == "write" and "->" in arg:
            path, content = [x.strip() for x in arg.split("->", 1)]
            p = ROOT / path.replace("..", "")
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8")
            return f"write {path}"
        return f"skip:{line}"
    except Exception as e:
        return f"error:{e}"


def list_updates(username: str) -> list[dict[str, Any]]:
    root = UPDATES_ROOT / username
    if not root.exists():
        return []
    out = []
    for d in sorted(root.iterdir()):
        meta = d / "update.json"
        if meta.exists():
            try:
                out.append(json.loads(meta.read_text(encoding="utf-8")))
            except Exception:
                pass
    return out


def uninstall_mupdate(username: str, update_id: str) -> bool:
    """Remove staged update metadata folder. Does not reverse already-written system files."""
    root = UPDATES_ROOT / username
    if not root.exists():
        return False
    uid = (update_id or "").strip()
    if not uid:
        return False
    # exact folder id
    target = root / _slug(uid)
    if target.exists() and target.is_dir():
        shutil.rmtree(target, ignore_errors=True)
        return True
    # match by name or id in update.json
    for d in list(root.iterdir()):
        if not d.is_dir():
            continue
        meta = d / "update.json"
        if not meta.exists():
            continue
        try:
            data = json.loads(meta.read_text(encoding="utf-8"))
        except Exception:
            continue
        if data.get("id") == uid or data.get("name") == uid or _slug(str(data.get("name") or "")) == _slug(uid):
            shutil.rmtree(d, ignore_errors=True)
            return True
    return False
