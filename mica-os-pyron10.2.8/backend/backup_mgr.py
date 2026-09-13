
"""Account (.mica) and filesystem (.mdfs) backups for Pyron 6."""
from __future__ import annotations
import base64
import io
import json
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
USERS_ROOT = ROOT / "data" / "users"
THEMES_USER = ROOT / "themes" / "user"
PLUGINS_USER = ROOT / "plugins" / "user"
APPS_USER = ROOT / "apps" / "user"


def export_mica(username: str, pin: str = "") -> dict[str, Any]:
    """Account package: meta, themes, plugins, apps, configs (no full file tree)."""
    from auth import get_meta
    meta = get_meta(username) or {}
    # strip secrets from export except pin if provided for restore
    safe_meta = {k: v for k, v in meta.items() if k not in ("pin_hash", "admin_pin_hash", "enc_salt")}
    themes = []
    troot = THEMES_USER / username
    if troot.exists():
        for d in troot.iterdir():
            if d.is_dir() and (d / "theme.json").exists():
                try:
                    themes.append(json.loads((d / "theme.json").read_text(encoding="utf-8")))
                except Exception:
                    pass
    plugins = []
    proot = PLUGINS_USER / username
    if proot.exists():
        for d in proot.iterdir():
            if d.is_dir() and (d / "plugin.json").exists():
                try:
                    p = json.loads((d / "plugin.json").read_text(encoding="utf-8"))
                    for name in ("main.py", "plugin.py", "script.js", "plugin.js"):
                        fp = d / name
                        if fp.exists():
                            key = "py" if name.endswith(".py") else "js"
                            p[key] = fp.read_text(encoding="utf-8", errors="replace")
                    plugins.append(p)
                except Exception:
                    pass
    apps = []
    aroot = APPS_USER / username
    if aroot.exists():
        for d in aroot.iterdir():
            if not d.is_dir():
                continue
            entry: dict[str, Any] = {"id": d.name}
            for fname, key in [
                ("app.json", None),
                ("index.html", "html"),
                ("style.css", "css"),
                ("script.js", "js"),
                ("main.py", "py"),
            ]:
                fp = d / fname
                if not fp.exists():
                    continue
                if key is None:
                    try:
                        entry.update(json.loads(fp.read_text(encoding="utf-8")))
                    except Exception:
                        pass
                else:
                    entry[key] = fp.read_text(encoding="utf-8", errors="replace")
            for icon in ("icon.png", "icon.ico", "icon.jpg"):
                ip = d / icon
                if ip.exists():
                    entry["icon_data"] = "data:image/png;base64," + base64.b64encode(ip.read_bytes()).decode("ascii")
                    break
            entry["type"] = "mapp"
            apps.append(entry)

    active_theme = None
    ap = troot / "active.json" if troot.exists() else None
    if ap and ap.exists():
        try:
            active_theme = json.loads(ap.read_text(encoding="utf-8"))
        except Exception:
            pass

    return {
        "type": "mica",
        "format": 6,
        "user": username,
        "username": username,
        "pin": pin,
        "meta": safe_meta,
        "theme": safe_meta.get("theme") or "theme-dark",
        "themes": themes,
        "active_theme": active_theme,
        "plugins": plugins,
        "apps": apps,
        "config": {
            "security_version": meta.get("security_version", 6),
            "devmode": bool(meta.get("devmode")),
            "encryption_enabled": bool(meta.get("encryption_enabled")),
        },
        "exported_at": datetime.utcnow().isoformat() + "Z",
    }


def export_mdfs(username: str, token: str | None = None) -> bytes:
    """Zip of user filesystem (decrypted if vault session active)."""
    import security
    user_dir = USERS_ROOT / username
    buf = io.BytesIO()
    skip = {".mica_meta.json", ".mica_vault"}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if not user_dir.exists():
            zf.writestr("README.txt", "Empty user filesystem")
        else:
            for path in user_dir.rglob("*"):
                if not path.is_file():
                    continue
                if path.name in skip:
                    continue
                rel = path.relative_to(user_dir).as_posix()
                try:
                    data = path.read_bytes()
                    if token:
                        try:
                            data = security.decrypt_bytes(token, data)
                        except Exception:
                            pass
                    zf.writestr(rel, data)
                except Exception:
                    continue
        manifest = {
            "type": "mdfs",
            "format": 1,
            "user": username,
            "exported_at": datetime.utcnow().isoformat() + "Z",
        }
        zf.writestr(".mdfs_manifest.json", json.dumps(manifest, indent=2))
    return buf.getvalue()


def mica_to_download_text(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, ensure_ascii=False)
    return base64.b64encode(quote(raw).encode("utf-8")).decode("ascii")



def import_mdfs(username: str, data: bytes, token: str | None = None) -> dict[str, Any]:
    """Restore .mdfs zip into user filesystem (re-encrypt if vault active)."""
    import security
    user_dir = USERS_ROOT / username
    user_dir.mkdir(parents=True, exist_ok=True)
    # accept raw zip or data-url text
    if data[:4] != b"PK\x03\x04":
        text = data.decode("utf-8", errors="ignore").strip()
        if text.startswith("data:") and "," in text:
            text = text.split(",", 1)[1]
        try:
            data = base64.b64decode(text)
        except Exception as e:
            raise ValueError(f"Not a valid .mdfs zip: {e}")
    restored = 0
    skipped = 0
    with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename.replace("\\", "/").lstrip("/")
            if not name or name.endswith(".mdfs_manifest.json") or ".." in name.split("/"):
                skipped += 1
                continue
            if name in (".mica_meta.json", ".mica_vault"):
                skipped += 1
                continue
            target = (user_dir / name).resolve()
            if not str(target).startswith(str(user_dir.resolve())):
                skipped += 1
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            raw = zf.read(info)
            if token:
                try:
                    raw = security.encrypt_bytes(token, raw)
                except Exception:
                    pass
            target.write_bytes(raw)
            restored += 1
    return {"ok": True, "restored": restored, "skipped": skipped, "user": username}
