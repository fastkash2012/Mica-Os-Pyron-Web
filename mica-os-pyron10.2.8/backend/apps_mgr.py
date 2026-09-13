"""
Mica OS Pyron 5 — App manager
System: apps/system/<id>/
User:   apps/user/<username>/<id>/
.mapp v2: html + css + js + py (+ optional icon .ico/png as base64)
Legacy v1 html-only still supported.
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
SYSTEM_ROOT = ROOT / "apps" / "system"
USER_ROOT = ROOT / "apps" / "user"


def _slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "_", (name or "app").strip())
    return (s.strip("_") or "app")[:64]


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _load_dir_app(app_dir: Path, scope: str) -> dict[str, Any] | None:
    meta_path = app_dir / "app.json"
    if not meta_path.exists():
        return None
    try:
        meta = _read_json(meta_path)
    except Exception:
        return None
    meta = dict(meta)
    meta["id"] = meta.get("id") or app_dir.name
    meta["scope"] = scope
    meta["path"] = str(app_dir.relative_to(ROOT)).replace("\\", "/")

    def read_opt(name: str) -> str:
        p = app_dir / name
        if p.exists() and p.is_file():
            return p.read_text(encoding="utf-8", errors="replace")
        return ""

    meta["html"] = read_opt("index.html") or meta.get("html") or ""
    meta["css"] = read_opt("style.css") or meta.get("css") or ""
    meta["js"] = read_opt("script.js") or meta.get("js") or ""
    meta["py"] = read_opt("main.py") or meta.get("py") or ""

    # icon file → data URL
    icon_data = meta.get("icon_data") or ""
    for icon_name in ("icon.png", "icon.jpg", "icon.svg", "icon.ico"):
        ip = app_dir / icon_name
        if ip.exists() and ip.is_file():
            raw = ip.read_bytes()
            mime = {
                ".ico": "image/x-icon",
                ".png": "image/png",
                ".svg": "image/svg+xml",
                ".jpg": "image/jpeg",
            }.get(ip.suffix.lower(), "application/octet-stream")
            icon_data = f"data:{mime};base64," + base64.b64encode(raw).decode("ascii")
            break
    if icon_data:
        meta["icon_data"] = icon_data

    meta["format"] = int(meta.get("format") or (2 if (meta["css"] or meta["js"] or meta["py"]) else 1))
    return meta


def list_system_apps() -> list[dict[str, Any]]:
    SYSTEM_ROOT.mkdir(parents=True, exist_ok=True)
    out = []
    for d in sorted(SYSTEM_ROOT.iterdir()):
        if not d.is_dir():
            continue
        app = _load_dir_app(d, "system")
        if not app:
            continue
        out.append({
            "id": app["id"],
            "name": app.get("name") or app["id"],
            "icon": app.get("icon") or "📦",
            "icon_data": app.get("icon_data") or "",
            "scope": "system",
            "engine": app.get("engine") or "mapp",
            "builtin": app.get("builtin"),
            "format": app.get("format", 2),
        })
    return out


def list_user_apps(username: str) -> list[dict[str, Any]]:
    root = USER_ROOT / username
    root.mkdir(parents=True, exist_ok=True)
    out = []
    for d in sorted(root.iterdir()):
        if not d.is_dir():
            continue
        app = _load_dir_app(d, "user")
        if not app:
            continue
        out.append({
            "id": app["id"],
            "name": app.get("name") or app["id"],
            "icon": app.get("icon") or "📦",
            "icon_data": app.get("icon_data") or "",
            "scope": "user",
            "engine": app.get("engine") or "mapp",
            "format": app.get("format", 2),
        })
    return out


def list_all_apps(username: str) -> dict[str, list]:
    return {"system": list_system_apps(), "user": list_user_apps(username)}


def get_app(username: str, app_id: str, scope: str | None = None) -> dict[str, Any] | None:
    candidates = []
    if scope in (None, "user"):
        candidates.append((USER_ROOT / username / app_id, "user"))
    if scope in (None, "system"):
        candidates.append((SYSTEM_ROOT / app_id, "system"))
    for path, sc in candidates:
        if path.is_dir():
            app = _load_dir_app(path, sc)
            if app:
                return app
    return None


def decode_mapp_payload(raw: str | bytes) -> dict[str, Any]:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    text = raw.strip()
    if text.startswith("{"):
        return json.loads(text)
    # percent-encoded JSON (legacy .mapp)
    try:
        u = unquote(text)
        if u.strip().startswith("{"):
            return json.loads(u)
    except Exception:
        pass
    if text.startswith("data:") and "," in text[:120]:
        text = text.split(",", 1)[1]
    # base64
    try:
        pad = "=" * ((4 - len(text) % 4) % 4)
        decoded = base64.b64decode(text + pad)
        inner = decoded.decode("utf-8", errors="replace")
        try:
            return json.loads(unquote(inner))
        except Exception:
            return json.loads(inner)
    except Exception as e:
        raise ValueError(f"Could not decode .mapp: {e}")


def install_mapp(username: str, payload: dict[str, Any] | str | bytes, filename: str = "") -> dict[str, Any]:
    if not isinstance(payload, dict):
        payload = decode_mapp_payload(payload)

    name = (payload.get("name") or Path(filename).stem or "App").strip()
    app_id = _slug(payload.get("id") or name)
    icon = payload.get("icon") or "📦"
    icon_data = payload.get("icon_data") or ""
    fmt = int(payload.get("format") or (2 if payload.get("css") or payload.get("js") or payload.get("py") else 1))

    html = payload.get("html") or ""
    css = payload.get("css") or ""
    js = payload.get("js") or ""
    py = payload.get("py") or ""

    dest = USER_ROOT / username / app_id
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)

    meta = {
        "id": app_id,
        "name": name,
        "icon": icon,
        "type": "mapp",
        "format": fmt,
        "engine": "mapp",
        "scope": "user",
    }
    if icon_data:
        meta["icon_data"] = icon_data
        try:
            if isinstance(icon_data, str) and icon_data.startswith("data:") and "," in icon_data:
                hdr, b64 = icon_data.split(",", 1)
                raw_icon = base64.b64decode(b64)
                # Prefer PNG on disk for reliable WebEngine display
                if "png" in hdr:
                    (dest / "icon.png").write_bytes(raw_icon)
                elif "jpeg" in hdr or "jpg" in hdr:
                    (dest / "icon.jpg").write_bytes(raw_icon)
                elif "svg" in hdr:
                    (dest / "icon.svg").write_bytes(raw_icon)
                else:
                    # ico or unknown — still store, frontend falls back to emoji if img fails
                    (dest / "icon.ico").write_bytes(raw_icon)
                    # also store as png alias if browser can decode ico as image (often works)
                    (dest / "icon.png").write_bytes(raw_icon)
        except Exception:
            pass
        # also write binary icon file when possible
        try:
            data = icon_data
            if "," in data:
                header, b64 = data.split(",", 1)
                raw = base64.b64decode(b64)
                if "png" in header:
                    (dest / "icon.png").write_bytes(raw)
                elif "svg" in header:
                    (dest / "icon.svg").write_bytes(raw)
                else:
                    (dest / "icon.ico").write_bytes(raw)
            else:
                (dest / "icon.ico").write_bytes(base64.b64decode(data))
        except Exception:
            pass

    _write_json(dest / "app.json", meta)
    (dest / "index.html").write_text(html, encoding="utf-8")
    (dest / "style.css").write_text(css, encoding="utf-8")
    (dest / "script.js").write_text(js, encoding="utf-8")
    (dest / "main.py").write_text(py, encoding="utf-8")

    # Package layout script — tells the OS where assets live and how the app reads them
    layout = payload.get("layout")
    if not isinstance(layout, dict):
        layout = {}
    layout.setdefault("format", 3)
    layout.setdefault("assets_root", "assets")
    layout.setdefault("map", {})
    layout.setdefault(
        "runtime",
        {
            "assets": f"apps/user/{app_id}/assets",
            "root": f"apps/user/{app_id}",
            "read": "mica.asset(path) or relative assets/…",
        },
    )
    # optional extra files/folders (path -> content or data URL)
    extras = payload.get("files") or payload.get("assets") or {}
    if isinstance(extras, dict):
        assets_dir = dest / "assets"
        assets_dir.mkdir(parents=True, exist_ok=True)
        for rel, content in extras.items():
            rel_clean = str(rel).replace("\\", "/").lstrip("/")
            if not rel_clean or ".." in rel_clean.split("/"):
                continue
            # strip leading assets/ so map paths stay clean under assets/
            if rel_clean.startswith("assets/"):
                rel_clean = rel_clean[7:]
            target = (assets_dir / rel_clean).resolve()
            if not str(target).startswith(str(assets_dir.resolve())):
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(content, str) and content.startswith("data:"):
                try:
                    _, b64 = content.split(",", 1)
                    target.write_bytes(base64.b64decode(b64))
                except Exception:
                    continue
            elif isinstance(content, str):
                target.write_text(content, encoding="utf-8")
            layout.setdefault("map", {})[rel_clean] = f"assets/{rel_clean}"

    _write_json(dest / "layout.json", layout)
    # human-readable install hint for developers
    (dest / "INSTALL.txt").write_text(
        "Mica .mapp package folder\n"
        f"id: {app_id}\n"
        "index.html / style.css / script.js / main.py — app sources\n"
        "assets/ — packaged files (images, data, …)\n"
        "layout.json — tells the OS where assets are mapped for runtime reads\n"
        "Use mica.asset('logo.png') in app JS to resolve asset URLs.\n",
        encoding="utf-8",
    )

    return {
        "ok": True,
        "id": app_id,
        "name": name,
        "icon": icon,
        "icon_data": icon_data,
        "format": max(fmt, 3) if extras or layout.get("map") else fmt,
        "scope": "user",
        "path": str(dest.relative_to(ROOT)).replace("\\", "/"),
        "layout": layout,
    }


def uninstall_app(username: str, app_id: str) -> bool:
    dest = USER_ROOT / username / _slug(app_id)
    if dest.is_dir() and str(dest.resolve()).startswith(str((USER_ROOT / username).resolve())):
        shutil.rmtree(dest)
        return True
    return False


def build_srcdoc(app: dict[str, Any]) -> str:
    html = app.get("html") or ""
    css = app.get("css") or ""
    js = app.get("js") or ""
    app_id = app.get("id") or "app"
    # Assets served under app folder; frontend also exposes mica.asset()
    bridge = f"""
<script>
window.MICA_APP_ID = {json.dumps(app_id)};
window.MICA_ASSETS = {json.dumps("assets")};
window.mica = {{
  async py(code) {{
    return await window.parent.micaRunAppPy(window.MICA_APP_ID, code);
  }},
  async run() {{
    return await window.parent.micaRunAppMain(window.MICA_APP_ID);
  }},
  toast(msg) {{
    try {{ window.parent.toast(msg); }} catch (e) {{}}
  }},
  /** Resolve a packaged asset path (from layout.json map / assets folder). */
  asset(path) {{
    const p = String(path || '').replace(/^\\/+/, '').replace(/^assets\\//, '');
    try {{
      if (window.parent && window.parent.micaAppAssetUrl) {{
        return window.parent.micaAppAssetUrl(window.MICA_APP_ID, p);
      }}
    }} catch (e) {{}}
    return 'assets/' + p;
  }}
}};
</script>
"""
    if "<html" in html.lower():
        out = html
        inject = f"<style>{css}</style>{bridge}<script>{js}</script>"
        if re.search(r"</head>", out, re.I):
            out = re.sub(r"</head>", inject + "</head>", out, count=1, flags=re.I)
        else:
            out = inject + out
        return out

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
html,body {{ margin:0; padding:12px; font-family:-apple-system,BlinkMacSystemFont,sans-serif; background:#1a1a1e; color:#eee; }}
{css}
</style>
{bridge}
</head>
<body>
{html}
<script>
{js}
</script>
</body>
</html>"""
