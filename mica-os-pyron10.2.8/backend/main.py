"""
Mica OS Pyron — Python kernel
Real disk FS + restricted Python + HTML frontend
"""

from __future__ import annotations


import re
import sys
import secrets
from pathlib import Path
from typing import Optional

from fastapi import Request, FastAPI, HTTPException, Header, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from auth import (
    list_users, create_user, verify_pin, user_exists,
    get_meta, restore_mica,
)
from fs import MicaFS
from python_runtime import run_python
from themes_mgr import (
    list_themes, get_theme, save_theme, delete_theme,
    set_active as set_active_theme, get_active as get_active_theme,
)
from plugins_mgr import (
    list_plugins, get_plugin, install_mplug, install_legacy_file,
    uninstall_plugin, set_enabled, list_enabled_scripts,
    export_mica_backup,
)
import security
import system_ctrl
from security import (
    check_requirements, open_session, close_session, get_session,
    security_status, set_encryption, set_devmode, verify_admin, set_admin_pin,
    reveal_key_info, set_diskfs_unlocked, is_diskfs_unlocked,
)
from mupdate_mgr import install_mupdate, list_updates, inspect_mupdate, is_official_sign, uninstall_mupdate
from backup_mgr import export_mica, export_mdfs, mica_to_download_text, import_mdfs
from apps_mgr import (
    list_all_apps, get_app, install_mapp, uninstall_app,
    build_srcdoc, decode_mapp_payload,
)

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
SESSIONS: dict[str, str] = {}  # token -> username

app = FastAPI(title="Mica OS Pyron", version="pyron-6.0")
@app.on_event("startup")
def _boot_security_check():
    req = check_requirements()
    if not req.get("ok"):
        print("[Mica Security] MISSING:", req.get("missing"))
        print("[Mica Security] pip install -r backend/requirements.txt")
    else:
        print("[Mica Security] OK:", ", ".join(req.get("present") or []))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginBody(BaseModel):
    username: str
    pin: str


class CreateBody(BaseModel):
    username: str
    pin: str


class PathBody(BaseModel):
    path: str = ""


class WriteBody(BaseModel):
    path: str
    content: str


class MkdirBody(BaseModel):
    path: str


class MoveBody(BaseModel):
    src: str
    dest: str


class ExecBody(BaseModel):
    code: str


def _user(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization[7:].strip()
    user = SESSIONS.get(token)
    if not user:
        raise HTTPException(401, "Invalid session")
    return user


def _fs(authorization: Optional[str]) -> MicaFS:
    return MicaFS(_user(authorization))


# ── Auth ──────────────────────────────────────────────────────────────

@app.get("/api/users")
def api_users():
    return {"users": list_users()}


@app.post("/api/auth/login")
def api_login(body: LoginBody):
    if not verify_pin(body.username, body.pin):
        raise HTTPException(401, "Invalid credentials")
    token = secrets.token_hex(24)
    SESSIONS[token] = body.username
    try:
        sec = open_session(body.username, body.pin, token)
    except PermissionError as e:
        SESSIONS.pop(token, None)
        raise HTTPException(401, str(e))
    meta = get_meta(body.username) or {}
    return {
        "token": token,
        "username": body.username,
        "theme": meta.get("theme", "theme-dark"),
        "security": sec,
    }


@app.post("/api/auth/create")
def api_create(body: CreateBody):
    if not create_user(body.username, body.pin):
        raise HTTPException(400, "User exists or invalid")
    token = secrets.token_hex(24)
    SESSIONS[token] = body.username
    sec = open_session(body.username, body.pin, token)
    return {"token": token, "username": body.username, "theme": "theme-dark", "security": sec}


@app.post("/api/auth/logout")
def api_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        tok = authorization[7:].strip()
        SESSIONS.pop(tok, None)
        close_session(tok)
    return {"ok": True}


@app.post("/api/auth/restore")
async def api_restore(file: UploadFile = File(...)):
    tmp = ROOT / "data" / f"_restore_{secrets.token_hex(6)}.mica"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_bytes(await file.read())
    try:
        ok, result = restore_mica(tmp)
    finally:
        tmp.unlink(missing_ok=True)
    if not ok:
        raise HTTPException(400, result)
    return {"ok": True, "username": result}


# ── Filesystem ────────────────────────────────────────────────────────

@app.get("/api/fs/list")
def api_list(path: str = "", authorization: Optional[str] = Header(None)):
    try:
        return {"items": _fs(authorization).list(path)}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.get("/api/fs/read")
def api_read(path: str, authorization: Optional[str] = Header(None)):
    try:
        fs = _fs(authorization)
        token = (authorization or "").replace("Bearer", "").strip()
        raw = fs.read_bytes(path)
        raw = security.decrypt_bytes(token, raw)
        try:
            content = raw.decode("utf-8")
        except Exception:
            content = raw.decode("utf-8", errors="replace")
        return {"path": path, "content": content}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/fs/write")
def api_write(body: WriteBody, authorization: Optional[str] = Header(None)):
    try:
        import base64
        import re as _re
        fs = _fs(authorization)
        token = (authorization or "").replace("Bearer", "").strip()
        content = body.content or ""
        # If client sent a data URL, store real binary so Vynl/media can open it
        m = _re.match(r"^data:[^;]+;base64,(.+)$", content, _re.S)
        if m:
            raw = base64.b64decode(m.group(1))
        else:
            raw = content.encode("utf-8")
        data = security.encrypt_bytes(token, raw)
        p = fs.write_bytes(body.path, data)
        return {"ok": True, "path": p}
    except Exception as e:
        raise HTTPException(400, str(e))




class WriteBinaryBody(BaseModel):
    path: str
    content_b64: str = ""


@app.post("/api/fs/write_binary")
def api_write_binary(body: WriteBinaryBody, authorization: Optional[str] = Header(None)):
    """Write raw binary (base64) into user DiskFS — used for PNG/GLB saves."""
    import base64
    try:
        fs = _fs(authorization)
        token = (authorization or "").replace("Bearer", "").strip()
        raw = base64.b64decode(body.content_b64 or "")
        data = security.encrypt_bytes(token, raw)
        p = fs.write_bytes(body.path, data)
        return {"ok": True, "path": p}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/fs/mkdir")
def api_mkdir(body: MkdirBody, authorization: Optional[str] = Header(None)):
    try:
        p = _fs(authorization).mkdir(body.path)
        return {"ok": True, "path": p}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/fs/delete")
def api_delete(body: PathBody, authorization: Optional[str] = Header(None)):
    try:
        _fs(authorization).delete(body.path)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/fs/move")
def api_move(body: MoveBody, authorization: Optional[str] = Header(None)):
    try:
        p = _fs(authorization).move(body.src, body.dest)
        return {"ok": True, "path": p}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/fs/upload")
async def api_upload(
    path: str = Form(""),
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    fs = _fs(authorization)
    name = file.filename or "upload.bin"
    dest = f"{path.rstrip('/')}/{name}" if path else name
    data = await file.read()
    try:
        # text if possible
        try:
            text = data.decode("utf-8")
            p = fs.write_text(dest, text)
        except UnicodeDecodeError:
            p = fs.write_bytes(dest, data)
        return {"ok": True, "path": p}
    except Exception as e:
        raise HTTPException(400, str(e))



@app.get("/api/fs/raw")
def api_raw(
    path: str,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = None,
):
    """Serve binary file for media players (audio/video/images)."""
    from fastapi.responses import Response
    import mimetypes
    auth = authorization
    if not auth and token:
        auth = f"Bearer {token}"
    fs = _fs(auth)
    try:
        data = fs.read_bytes(path)
        tok = (authorization or "").replace("Bearer", "").strip()
        if not tok and token:
            tok = token
        data = security.decrypt_bytes(tok, data)
    except Exception as e:
        raise HTTPException(404, str(e))
    mime, _ = mimetypes.guess_type(path)
    return Response(content=data, media_type=mime or "application/octet-stream")


# ── Python ────────────────────────────────────────────────────────────


@app.post("/api/python/exec")
def api_exec(body: ExecBody, authorization: Optional[str] = Header(None)):
    _user(authorization)  # require auth
    return run_python(body.code)


@app.post("/api/python/run_file")
def api_run_file(body: PathBody, authorization: Optional[str] = Header(None)):
    fs = _fs(authorization)
    try:
        code = fs.read_text(body.path)
    except Exception as e:
        raise HTTPException(400, str(e))
    return run_python(code)





# ── Themes (disk-backed) ──────────────────────────────────────────────

class ThemeBody(BaseModel):
    name: str = "Theme"
    id: Optional[str] = None
    cssClass: Optional[str] = None
    cssVariables: Optional[str] = None
    bg: Optional[str] = None
    text: Optional[str] = None
    wp: Optional[str] = None


class ThemeActiveBody(BaseModel):
    theme_id: Optional[str] = None
    builtin: Optional[str] = None


@app.get("/api/themes/list")
def api_themes_list(authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    return {"themes": list_themes(user), "active": get_active_theme(user)}


@app.get("/api/themes/active")
def api_themes_active(authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    return get_active_theme(user) or {"mode": "builtin", "class": "theme-dark"}


@app.post("/api/themes/save")
def api_themes_save(body: ThemeBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    data = save_theme(user, body.model_dump())
    return {"ok": True, "theme": data}


@app.post("/api/themes/delete")
def api_themes_delete(body: PathBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    if not delete_theme(user, body.path):
        raise HTTPException(404, "Theme not found")
    return {"ok": True}


@app.post("/api/themes/activate")
def api_themes_activate(body: ThemeActiveBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    try:
        return set_active_theme(user, body.theme_id, body.builtin)
    except FileNotFoundError:
        raise HTTPException(404, "Theme not found")



# ── Plugins (.mplug + legacy) ─────────────────────────────────────────

class PluginInstallBody(BaseModel):
    content: str
    filename: str = "plugin.mplug"


class PluginIdBody(BaseModel):
    plugin_id: str
    enabled: Optional[bool] = None


@app.get("/api/plugins/list")
def api_plugins_list(authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    return {"plugins": list_plugins(user)}


@app.get("/api/plugins/enabled")
def api_plugins_enabled(authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    return {"scripts": list_enabled_scripts(user)}


@app.get("/api/plugins/get")
def api_plugins_get(plugin_id: str, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    p = get_plugin(user, plugin_id)
    if not p:
        raise HTTPException(404, "Plugin not found")
    return p


@app.post("/api/plugins/install")
def api_plugins_install(body: PluginInstallBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    try:
        name = (body.filename or "").lower()
        if name.endswith(".py") or name.endswith(".js"):
            return install_legacy_file(user, body.filename, body.content)
        return install_mplug(user, body.content, body.filename)
    except Exception as e:
        raise HTTPException(400, f"Plugin install failed: {e}")


@app.post("/api/plugins/uninstall")
def api_plugins_uninstall(body: PluginIdBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    ok = uninstall_plugin(user, body.plugin_id)
    if not ok:
        raise HTTPException(404, "Plugin not found")
    return {"ok": True, "reboot": True}


@app.post("/api/plugins/enable")
def api_plugins_enable(body: PluginIdBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    if body.enabled is None:
        raise HTTPException(400, "enabled required")
    if not set_enabled(user, body.plugin_id, body.enabled):
        raise HTTPException(404, "Plugin not found")
    return {"ok": True, "reboot": True}


@app.post("/api/plugins/run_py")
def api_plugins_run_py(body: PluginIdBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    p = get_plugin(user, body.plugin_id)
    if not p:
        raise HTTPException(404, "Plugin not found")
    code = p.get("py") or ""
    if not code.strip():
        return {"success": True, "stdout": "", "stderr": "", "error": None}
    return run_python(code)


@app.get("/api/backup/mica")
def api_backup_mica(authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    # pin not included for security — client can prompt
    data = export_mica_backup(user, pin_hint="")
    data.pop("pin", None)
    return data



# ── Apps (system + user .mapp) ────────────────────────────────────────

class AppInstallBody(BaseModel):
    content: str
    filename: str = "app.mapp"


class AppPyBody(BaseModel):
    app_id: str
    code: str = ""
    scope: Optional[str] = None


@app.get("/api/apps/list")
def api_apps_list(authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    return list_all_apps(user)


@app.get("/api/apps/get")
def api_apps_get(app_id: str, scope: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    app = get_app(user, app_id, scope)
    if not app:
        raise HTTPException(404, "App not found")
    if (app.get("engine") or "mapp") == "mapp" and not app.get("builtin"):
        app = dict(app)
        app["srcdoc"] = build_srcdoc(app)
    return app


@app.post("/api/apps/install")
def api_apps_install(body: AppInstallBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    try:
        return install_mapp(user, body.content, body.filename)
    except Exception as e:
        raise HTTPException(400, f"Install failed: {e}")


@app.post("/api/apps/uninstall")
def api_apps_uninstall(body: PathBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    if not uninstall_app(user, body.path):
        raise HTTPException(404, "User app not found")
    return {"ok": True}


@app.post("/api/apps/run_py")
def api_apps_run_py(body: AppPyBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    app = get_app(user, body.app_id, body.scope)
    if not app:
        raise HTTPException(404, "App not found")
    preamble = app.get("py") or ""
    if body.code.strip() and preamble.strip():
        combined = preamble + "\n\n# --- app call ---\n" + body.code
    elif body.code.strip():
        combined = body.code
    else:
        combined = preamble
    return run_python(combined)


@app.post("/api/apps/run_main")
def api_apps_run_main(body: AppPyBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    app = get_app(user, body.app_id, body.scope)
    if not app:
        raise HTTPException(404, "App not found")
    py = app.get("py") or ""
    if not py.strip():
        return {"success": True, "stdout": "", "stderr": "", "error": None}
    return run_python(py)




# ── Host FS (C: / drives, read + optional write under allowed roots) ───

class HostPathBody(BaseModel):
    path: str = ""


class HostCopyBody(BaseModel):
    src: str
    dest: str


def _host_roots() -> list[dict]:
    roots = []
    if sys.platform == "win32":
        import string
        for letter in string.ascii_uppercase:
            p = Path(f"{letter}:/")
            if p.exists():
                roots.append({"name": f"{letter}:", "path": f"{letter}:/", "is_dir": True})
    else:
        roots.append({"name": "/", "path": "/", "is_dir": True})
        home = Path.home()
        roots.append({"name": "Home", "path": str(home), "is_dir": True})
        media = Path("/media")
        if media.exists():
            for e in media.iterdir():
                if e.is_dir():
                    roots.append({"name": e.name, "path": str(e), "is_dir": True})
        mnt = Path("/mnt")
        if mnt.exists():
            for e in mnt.iterdir():
                if e.is_dir():
                    roots.append({"name": e.name, "path": str(e), "is_dir": True})
    return roots


def _safe_host(path: str) -> Path:
    p = Path(path).expanduser().resolve()
    return p


@app.get("/api/host/roots")
def api_host_roots(authorization: Optional[str] = Header(None)):
    _user(authorization)
    return {"roots": _host_roots()}


@app.get("/api/host/list")
def api_host_list(path: str = "", authorization: Optional[str] = Header(None)):
    _user(authorization)
    try:
        target = _safe_host(path) if path else None
        if not target or not path:
            return {"path": "", "items": _host_roots()}
        if not target.exists():
            raise HTTPException(404, "Path not found")
        if not target.is_dir():
            raise HTTPException(400, "Not a directory")
        items = []
        for entry in sorted(target.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            try:
                items.append({
                    "name": entry.name,
                    "path": str(entry.resolve()),
                    "is_dir": entry.is_dir(),
                    "size": entry.stat().st_size if entry.is_file() else 0,
                    "ext": entry.suffix.lower() if entry.is_file() else "",
                })
            except (PermissionError, OSError):
                continue
        return {"path": str(target), "items": items}
    except PermissionError:
        raise HTTPException(403, "Permission denied")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.get("/api/host/read")
def api_host_read(path: str, authorization: Optional[str] = Header(None)):
    _user(authorization)
    try:
        target = _safe_host(path)
        if not target.is_file():
            raise HTTPException(400, "Not a file")
        data = target.read_bytes()
        # return text if possible
        try:
            text = data.decode("utf-8")
            return {"path": str(target), "content": text, "binary": False}
        except UnicodeDecodeError:
            import base64
            return {"path": str(target), "content": base64.b64encode(data).decode("ascii"), "binary": True}
    except PermissionError:
        raise HTTPException(403, "Permission denied")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))



class HostWriteBody(BaseModel):
    path: str
    content: str = ""
    content_b64: str = ""


@app.post("/api/host/write")
def api_host_write(body: HostWriteBody, authorization: Optional[str] = Header(None)):
    """Write to host FS (C:/ and external drives)."""
    _user(authorization)
    target = _safe_host(body.path)
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        if body.content_b64:
            import base64 as _b64
            target.write_bytes(_b64.b64decode(body.content_b64))
        else:
            target.write_text(body.content, encoding="utf-8")
        return {"ok": True, "path": str(target)}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/host/copy")
def api_host_copy(body: HostCopyBody, authorization: Optional[str] = Header(None)):
    """Copy between user FS and host or host-to-host when unlocked."""
    import shutil as _sh
    user = _user(authorization)
    src, dest = body.src, body.dest
    # host path if looks like drive or absolute
    def is_host(p: str) -> bool:
        p = p.replace("\\", "/")
        return bool(re.match(r"^[A-Za-z]:/", p)) or p.startswith("/")

    try:
        if is_host(src) and is_host(dest):
            s, d = _safe_host(src), _safe_host(dest)
            d.parent.mkdir(parents=True, exist_ok=True)
            if s.is_dir():
                _sh.copytree(s, d, dirs_exist_ok=True)
            else:
                _sh.copy2(s, d)
            return {"ok": True, "path": str(d)}
        if is_host(src) and not is_host(dest):
            # host → user
            s = _safe_host(src)
            data = s.read_bytes()
            fs = _fs(authorization)
            # write bytes path
            rel = dest
            p = fs.write_bytes(rel, data)
            return {"ok": True, "path": p}
        if not is_host(src) and is_host(dest):
            # user → host
            fs = _fs(authorization)
            raw = fs.read_bytes(src)
            token = (authorization or "").replace("Bearer", "").strip()
            try:
                raw = security.decrypt_bytes(token, raw)
            except Exception:
                pass
            d = _safe_host(dest)
            d.parent.mkdir(parents=True, exist_ok=True)
            d.write_bytes(raw)
            return {"ok": True, "path": str(d)}
        # user → user
        fs = _fs(authorization)
        return {"ok": True, "path": fs.copy(src, dest)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/host/move")
def api_host_move(body: HostCopyBody, authorization: Optional[str] = Header(None)):
    import shutil as _sh
    user = _user(authorization)
    src, dest = body.src, body.dest
    def is_host(p: str) -> bool:
        p = p.replace("\\", "/")
        return bool(re.match(r"^[A-Za-z]:/", p)) or (p.startswith("/") and not p.startswith("/home/workdir"))
    try:
        if is_host(src) or is_host(dest):
            s, d = _safe_host(src), _safe_host(dest)
            d.parent.mkdir(parents=True, exist_ok=True)
            _sh.move(str(s), str(d))
            return {"ok": True, "path": str(d)}
        fs = _fs(authorization)
        return {"ok": True, "path": fs.move(src, dest)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))



@app.post("/api/fs/copy")
def api_fs_copy(body: MoveBody, authorization: Optional[str] = Header(None)):
    fs = _fs(authorization)
    try:
        return {"path": fs.copy(body.src, body.dest)}
    except Exception as e:
        raise HTTPException(400, str(e))




# ── Mica Security ─────────────────────────────────────────────────────

class SecurityToggleBody(BaseModel):
    enabled: bool
    pin: str = ""


class AdminBody(BaseModel):
    admin_pin: str
    action: Optional[str] = None


class AdminPinBody(BaseModel):
    current_pin: str
    new_admin_pin: str


class PyroBody(BaseModel):
    command: str


@app.get("/api/security/status")
def api_sec_status(authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    token = (authorization or "").replace("Bearer", "").strip()
    return security_status(user, token)


@app.get("/api/security/requirements")
def api_sec_reqs():
    return check_requirements()



class RevealKeyBody(BaseModel):
    admin_pin: str


@app.post("/api/security/reveal-key")
def api_reveal_key(body: RevealKeyBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    try:
        return reveal_key_info(user, body.admin_pin)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except Exception as e:
        raise HTTPException(400, str(e))




class DiskfsBody(BaseModel):
    enabled: bool
    admin_pin: str = ""


@app.post("/api/security/diskfs")
def api_diskfs(body: DiskfsBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    if body.admin_pin and not verify_admin(user, body.admin_pin):
        raise HTTPException(403, "Admin authentication failed")
    # require devmode
    st = security_status(user, (authorization or "").replace("Bearer", "").strip())
    if not st.get("devmode") and body.enabled:
        raise HTTPException(403, "Enable DevMode first")
    return set_diskfs_unlocked(user, body.enabled)


@app.post("/api/security/encryption")
def api_sec_enc(body: SecurityToggleBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    token = (authorization or "").replace("Bearer", "").strip()
    if not verify_pin(user, body.pin):
        raise HTTPException(401, "Invalid PIN")
    try:
        return set_encryption(user, token, body.enabled, body.pin)
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/security/devmode")
def api_sec_dev(body: SecurityToggleBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    if not verify_pin(user, body.pin):
        raise HTTPException(401, "Invalid PIN")
    return set_devmode(user, body.enabled)


@app.post("/api/security/admin/verify")
def api_admin_verify(body: AdminBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    if not verify_admin(user, body.admin_pin):
        raise HTTPException(403, "Admin authentication failed")
    return {"ok": True, "action": body.action}


@app.post("/api/security/admin/pin")
def api_admin_pin(body: AdminPinBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    if not set_admin_pin(user, body.current_pin, body.new_admin_pin):
        raise HTTPException(403, "Could not update admin PIN")
    return {"ok": True}


@app.post("/api/security/pyrouser")
def api_pyrouser(body: PyroBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    token = (authorization or "").replace("Bearer", "").strip()
    st = security_status(user, token)
    if not st.get("devmode"):
        raise HTTPException(403, "DevMode disabled — enable in Mica Security")
    cmd = (body.command or "").strip()
    import json as _json
    HELP = (
        "pyrouser — Mica kernel shell (DevMode)\n"
        "  help | whoami | security | sessions | reqs | version\n"
        "  fs.list [path] | fs.read <path> | fs.write <path> <text…>\n"
        "  updates | plugins | apps\n"
        "  diskfs | unlock (host FS always on in 10.x)\n"
        "  exec <python> | !<python> | <python one-liner>\n"
        "  mupdate list  (also: Terminal `mupdate list`)\n"
    )
    if not cmd or cmd in ("help", "?"):
        return {"success": True, "stdout": HELP, "stderr": "", "error": None}
    if cmd == "whoami":
        return {"success": True, "stdout": user, "stderr": "", "error": None}
    if cmd == "version":
        return {"success": True, "stdout": "Mica OS Pyron 10.1", "stderr": "", "error": None}
    if cmd == "security":
        return {"success": True, "stdout": _json.dumps(st, indent=2), "stderr": "", "error": None}
    if cmd == "sessions":
        return {"success": True, "stdout": str(list(security.SESSIONS.keys())), "stderr": "", "error": None}
    if cmd == "reqs":
        return {"success": True, "stdout": _json.dumps(check_requirements(), indent=2), "stderr": "", "error": None}
    if cmd in ("diskfs", "unlock"):
        return {
            "success": True,
            "stdout": "DiskFS / host drives: always unlocked in Pyron 10.x (no toggle).",
            "stderr": "",
            "error": None,
        }
    if cmd in ("updates", "mupdate list", "mupdate"):
        try:
            return {"success": True, "stdout": _json.dumps(list_updates(user), indent=2), "stderr": "", "error": None}
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e), "error": str(e)}
    if cmd == "plugins":
        try:
            return {"success": True, "stdout": _json.dumps(list_plugins(user), indent=2), "stderr": "", "error": None}
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e), "error": str(e)}
    if cmd == "apps":
        try:
            return {"success": True, "stdout": _json.dumps(list_all_apps(user), indent=2), "stderr": "", "error": None}
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e), "error": str(e)}
    if cmd.startswith("fs.list"):
        parts = cmd.split(maxsplit=1)
        path = parts[1] if len(parts) > 1 else ""
        try:
            return {"success": True, "stdout": _json.dumps(_fs(authorization).list(path), indent=2, default=str), "stderr": "", "error": None}
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e), "error": str(e)}
    if cmd.startswith("fs.read "):
        path = cmd[8:].strip()
        try:
            data = _fs(authorization).read(path)
            if isinstance(data, dict) and "content" in data:
                return {"success": True, "stdout": str(data.get("content", ""))[:8000], "stderr": "", "error": None}
            return {"success": True, "stdout": str(data)[:8000], "stderr": "", "error": None}
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e), "error": str(e)}
    if cmd.startswith("fs.write "):
        rest = cmd[9:].strip()
        parts = rest.split(maxsplit=1)
        if len(parts) < 2:
            return {"success": False, "stdout": "", "stderr": "usage: fs.write <path> <text>", "error": "usage"}
        path, text = parts[0], parts[1]
        try:
            _fs(authorization).write(path, text)
            return {"success": True, "stdout": f"wrote {path} ({len(text)} chars)", "stderr": "", "error": None}
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e), "error": str(e)}
    if cmd.startswith("exec "):
        return run_python(cmd[5:])
    if cmd.startswith("!"):
        return run_python(cmd[1:])
    return run_python(cmd)



@app.get("/api/updates/list")
def api_updates_list(authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    return {"updates": list_updates(user)}


class MupdateInstallBody(BaseModel):
    content: str
    filename: str = "update.mupdate"
    admin_approved: bool = False
    admin_pin: str = ""


@app.post("/api/updates/inspect")
def api_updates_inspect(body: MupdateInstallBody, authorization: Optional[str] = Header(None)):
    _user(authorization)
    try:
        return inspect_mupdate(body.content)
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/updates/install")
def api_updates_install(body: MupdateInstallBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    admin_ok = bool(body.admin_approved)
    if body.admin_pin:
        if verify_admin(user, body.admin_pin):
            admin_ok = True
        else:
            raise HTTPException(403, "Admin authentication failed")
    try:
        return install_mupdate(user, body.content, body.filename, admin_approved=admin_ok)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except Exception as e:
        raise HTTPException(400, f"mupdate failed: {e}")





@app.post("/api/updates/uninstall")
def api_updates_uninstall(body: PathBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    uid = (body.path or "").strip()
    if not uid:
        raise HTTPException(400, "update id required")
    ok = uninstall_mupdate(user, uid)
    if not ok:
        raise HTTPException(404, "Update not found")
    return {"ok": True, "id": uid}


@app.post("/api/apps/launch_native")
def api_launch_native(body: PathBody, authorization: Optional[str] = Header(None)):
    """Launch a native PyQt system app (e.g. Pyro Browser) as a separate process."""
    import subprocess, sys
    _user(authorization)
    app_id = (body.path or "").strip()
    mapping = {
        "pyro_browser": ROOT / "apps" / "system" / "pyro_browser" / "pyro_browser.py",
        "Pyro Browser": ROOT / "apps" / "system" / "pyro_browser" / "pyro_browser.py",
    }
    script = mapping.get(app_id)
    if not script or not script.exists():
        raise HTTPException(404, f"Native app not found: {app_id}")
    try:
        subprocess.Popen(
            [sys.executable, str(script)],
            cwd=str(script.parent),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {"ok": True, "launched": app_id}
    except Exception as e:
        raise HTTPException(500, str(e))





@app.get("/api/browser/proxy")
async def api_browser_proxy(
    request: Request,
    url: str = "",
    token: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    """Fetch remote page; keep search/forms/redirects inside proxy."""
    import urllib.request
    import urllib.parse
    import ssl
    import re as _re
    from fastapi.responses import Response, HTMLResponse

    target = (url or "").strip()
    # Form GET adds ?q= to proxy URL; merge into target
    try:
        extras = [(k, v) for k, v in request.query_params.multi_items() if k not in ("url", "token")]
        if extras and target:
            parsed = urllib.parse.urlparse(target)
            q = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
            q.extend(extras)
            target = urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(q, doseq=True)))
    except Exception:
        pass

    if not target:
        return HTMLResponse("<p>No URL</p>", status_code=400)
    if not target.startswith(("http://", "https://")):
        target = "https://" + target

    def proxify(abs_url: str) -> str:
        if not abs_url or abs_url.startswith(("data:", "javascript:", "blob:", "#", "mailto:", "tel:")):
            return abs_url
        if abs_url.startswith("//"):
            abs_url = "https:" + abs_url
        return "/api/browser/proxy?url=" + urllib.parse.quote(abs_url, safe="")

    NAV_SCRIPT = (
        '<script id="mica-proxy-nav">(function(){'
        'if(window.__micaProxyNav)return;window.__micaProxyNav=true;'
        'function toProxy(u){try{u=new URL(u,document.baseURI).href}catch(e){return u}'
        'if(!u||u.indexOf("javascript:")===0||u.indexOf("data:")===0)return u;'
        'if(u.indexOf("/api/browser/proxy")===0)return u;'
        'return "/api/browser/proxy?url="+encodeURIComponent(u)}'
        'document.addEventListener("click",function(e){'
        'var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;'
        'var href=a.getAttribute("href");'
        'if(!href||href.charAt(0)==="#"||href.indexOf("javascript:")===0||href.indexOf("mailto:")===0)return;'
        'if(a.target==="_blank"||a.target==="_new")return;'
        'e.preventDefault();e.stopPropagation();location.href=toProxy(href)},true);'
        'document.addEventListener("submit",function(e){'
        'var form=e.target;if(!form||form.tagName!=="FORM")return;'
        'e.preventDefault();e.stopPropagation();'
        'var action=form.getAttribute("action")||location.href;'
        'var m=action.match(/[?&]url=([^&]+)/);'
        'var target=m?decodeURIComponent(m[1]):action;'
        'try{target=new URL(target,document.baseURI).href}catch(err){}'
        'var method=(form.getAttribute("method")||"get").toLowerCase();'
        'if(method!=="post"){var fd=new FormData(form);var qs=new URLSearchParams(fd).toString();'
        'if(qs)target+=(target.indexOf("?")>=0?"&":"?")+qs;location.href=toProxy(target)}'
        'else{location.href=toProxy(target)}},true);'
        '})();</script>'
    )

    try:
        req = urllib.request.Request(
            target,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 MicaPyro/7.2",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
            method="GET",
        )
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=25, context=ctx) as resp:
            data = resp.read()
            ctype = resp.headers.get("Content-Type", "text/html; charset=utf-8")
            final = resp.geturl()

        is_html = (
            "text/html" in ctype.lower()
            or data[:40].lstrip().lower().startswith(b"<!doctype")
            or data[:20].lstrip().lower().startswith(b"<html")
        )
        if not is_html:
            return Response(
                content=data,
                media_type=ctype.split(";")[0] or "application/octet-stream",
                headers={"Cache-Control": "private, max-age=60"},
            )

        try:
            text = data.decode("utf-8")
        except Exception:
            text = data.decode("latin-1", errors="replace")

        base = final.rsplit("/", 1)[0] + "/"

        def abs_join(ref: str) -> str:
            return urllib.parse.urljoin(final, ref)

        def rewrite_attr(match):
            attr = match.group(1)
            quote = match.group(2)
            val = match.group(3)
            if not val or val.startswith(("data:", "javascript:", "#", "mailto:", "blob:", "tel:")):
                return match.group(0)
            full = abs_join(val)
            return attr + "=" + quote + proxify(full) + quote

        text = _re.sub(
            r'\b(href|src|action)\s*=\s*([\'"])(.*?)\2',
            rewrite_attr,
            text,
            flags=_re.I,
        )

        def rewrite_srcset(match):
            quote = match.group(1)
            parts = []
            for chunk in match.group(2).split(","):
                chunk = chunk.strip()
                if not chunk:
                    continue
                bits = chunk.split()
                if not bits:
                    continue
                bits[0] = proxify(abs_join(bits[0]))
                parts.append(" ".join(bits))
            return "srcset=" + quote + ", ".join(parts) + quote

        text = _re.sub(r'\bsrcset\s*=\s*([\'"])(.*?)\1', rewrite_srcset, text, flags=_re.I)

        if "<base " not in text.lower():
            inj = '<base href="' + base + '"><meta charset="utf-8">'
            if _re.search(r"(?i)<head[^>]*>", text):
                text = _re.sub(r"(?i)<head[^>]*>", lambda mm: mm.group(0) + inj, text, count=1)
            else:
                text = inj + text

        if "</body>" in text.lower():
            text = _re.sub(r"(?i)</body>", NAV_SCRIPT + "</body>", text, count=1)
        else:
            text = text + NAV_SCRIPT

        text = text.replace('target="_top"', 'target="_self"').replace("target='_top'", "target='_self'")
        text = text.replace("window.top.location", "window.location")
        text = text.replace("window.parent.location", "window.location")
        text = _re.sub(r"(?i)<meta[^>]+http-equiv=['\"]?refresh['\"]?[^>]*>", "", text)

        return Response(
            content=text,
            media_type="text/html; charset=utf-8",
            headers={
                "Content-Security-Policy": "frame-ancestors *;",
                "X-Frame-Options": "ALLOWALL",
                "Cache-Control": "no-store",
            },
        )
    except Exception as e:
        return HTMLResponse(
            "<!doctype html><html><body style='font-family:system-ui;padding:24px;background:#111;color:#eee'>"
            "<h3>Could not load page</h3>"
            "<p style='color:#f88'>" + str(e) + "</p>"
            "<p style='opacity:.6;word-break:break-all'>" + target + "</p>"
            "</body></html>",
            status_code=200,
        )








@app.post("/api/host/mkdir")
def api_host_mkdir(body: HostPathBody, authorization: Optional[str] = Header(None)):
    _user(authorization)
    target = _safe_host(body.path)
    try:
        target.mkdir(parents=True, exist_ok=True)
        return {"ok": True, "path": str(target)}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/host/delete")
def api_host_delete(body: HostPathBody, authorization: Optional[str] = Header(None)):
    import shutil as _sh
    _user(authorization)
    target = _safe_host(body.path)
    try:
        if not target.exists():
            raise HTTPException(404, "Not found")
        if target.is_dir():
            _sh.rmtree(target)
        else:
            target.unlink()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.get("/api/system/status")
def api_system_status(authorization: Optional[str] = Header(None)):
    _user(authorization)
    return system_ctrl.system_snapshot()


@app.get("/api/system/battery")
def api_system_battery(authorization: Optional[str] = Header(None)):
    _user(authorization)
    return system_ctrl.battery()


@app.get("/api/system/volume")
def api_system_volume_get(authorization: Optional[str] = Header(None)):
    _user(authorization)
    return system_ctrl.volume_get()


class VolumeBody(BaseModel):
    percent: int = 50


@app.post("/api/system/volume")
def api_system_volume_set(body: VolumeBody, authorization: Optional[str] = Header(None)):
    _user(authorization)
    return system_ctrl.volume_set(body.percent)


@app.get("/api/system/wifi")
def api_system_wifi(authorization: Optional[str] = Header(None)):
    _user(authorization)
    return system_ctrl.wifi_status()


class WifiConnectBody(BaseModel):
    ssid: str
    password: str = ""


@app.post("/api/system/wifi/connect")
def api_system_wifi_connect(body: WifiConnectBody, authorization: Optional[str] = Header(None)):
    _user(authorization)
    return system_ctrl.wifi_connect(body.ssid, body.password)


@app.get("/api/system/bluetooth")
def api_system_bluetooth(authorization: Optional[str] = Header(None)):
    _user(authorization)
    return system_ctrl.bluetooth_status()


@app.get("/api/system/stats")
def api_system_stats(authorization: Optional[str] = Header(None)):
    """Real-time host stats via psutil for Task Manager."""
    _user(authorization)
    import time
    out = {
        "cpu": None,
        "cpu_per_core": [],
        "ram": None,
        "ram_percent": None,
        "ram_used_mb": None,
        "ram_total_mb": None,
        "disk": None,
        "disk_percent": None,
        "disk_used_gb": None,
        "disk_total_gb": None,
        "net_sent_mb": None,
        "net_recv_mb": None,
        "net_up_kbps": None,
        "net_down_kbps": None,
        "gpu": None,
        "processes": None,
        "ts": time.time(),
    }
    try:
        import psutil
        out["cpu"] = round(psutil.cpu_percent(interval=0.15), 1)
        try:
            out["cpu_per_core"] = [round(x, 1) for x in psutil.cpu_percent(interval=0.05, percpu=True)]
        except Exception:
            pass
        vm = psutil.virtual_memory()
        out["ram_percent"] = vm.percent
        out["ram_used_mb"] = round(vm.used / 1048576)
        out["ram_total_mb"] = round(vm.total / 1048576)
        out["ram"] = f"{out['ram_used_mb']} / {out['ram_total_mb']} MB ({vm.percent}%)"
        # primary disk
        try:
            root = "C:\\\\" if sys.platform == "win32" else "/"
            du = psutil.disk_usage(root)
            out["disk_percent"] = du.percent
            out["disk_used_gb"] = round(du.used / (1024 ** 3), 1)
            out["disk_total_gb"] = round(du.total / (1024 ** 3), 1)
            out["disk"] = f"{out['disk_used_gb']} / {out['disk_total_gb']} GB ({du.percent}%)"
        except Exception:
            pass
        # network totals + rate
        try:
            n1 = psutil.net_io_counters()
            time.sleep(0.2)
            n2 = psutil.net_io_counters()
            out["net_sent_mb"] = round(n2.bytes_sent / 1048576, 1)
            out["net_recv_mb"] = round(n2.bytes_recv / 1048576, 1)
            out["net_up_kbps"] = round((n2.bytes_sent - n1.bytes_sent) / 204.8, 1)  # /0.2s -> KB/s
            out["net_down_kbps"] = round((n2.bytes_recv - n1.bytes_recv) / 204.8, 1)
        except Exception:
            pass
        try:
            out["processes"] = len(psutil.pids())
        except Exception:
            pass
        # GPU best-effort
        gpu_info = None
        try:
            import subprocess
            # nvidia-smi if present
            r = subprocess.run(
                ["nvidia-smi", "--query-gpu=name,utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=1.5,
            )
            if r.returncode == 0 and r.stdout.strip():
                line = r.stdout.strip().splitlines()[0]
                parts = [p.strip() for p in line.split(",")]
                if len(parts) >= 4:
                    gpu_info = {
                        "name": parts[0],
                        "util": float(parts[1]),
                        "mem_used_mb": float(parts[2]),
                        "mem_total_mb": float(parts[3]),
                        "label": f"{parts[0]} — {parts[1]}% · {parts[2]}/{parts[3]} MB",
                    }
        except Exception:
            pass
        if gpu_info is None:
            try:
                # Windows: basic adapter name via wmic (may be slow / missing)
                if sys.platform == "win32":
                    import subprocess
                    r = subprocess.run(
                        ["wmic", "path", "win32_VideoController", "get", "name"],
                        capture_output=True, text=True, timeout=2,
                    )
                    names = [ln.strip() for ln in (r.stdout or "").splitlines() if ln.strip() and ln.strip().lower() != "name"]
                    if names:
                        gpu_info = {"name": names[0], "util": None, "label": names[0]}
            except Exception:
                pass
        out["gpu"] = gpu_info
    except ImportError:
        out["error"] = "psutil not installed — run pip install -r backend/requirements.txt"
    except Exception as e:
        out["error"] = str(e)
    return out



@app.get("/api/apps/icon")
def api_app_icon(id: str, authorization: Optional[str] = Header(None), token: Optional[str] = None):
    """Serve installed app icon file."""
    auth = authorization
    if not auth and token:
        auth = f"Bearer {token}"
    user = _user(auth)
    from fastapi.responses import Response
    import mimetypes
    app_id = (id or "").strip()
    candidates = [
        ROOT / "apps" / "user" / user / app_id / "icon.png",
        ROOT / "apps" / "user" / user / app_id / "icon.ico",
        ROOT / "apps" / "system" / app_id / "icon.png",
        ROOT / "apps" / "system" / app_id / "icon.ico",
    ]
    for p in candidates:
        if p.exists():
            data = p.read_bytes()
            mime = "image/png" if p.suffix.lower() == ".png" else "image/x-icon"
            return Response(content=data, media_type=mime)
    raise HTTPException(404, "No icon")




class BackupMicaBody(BaseModel):
    pin: str = ""


@app.post("/api/backup/mica")
def api_backup_mica_v6(body: BackupMicaBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    payload = export_mica(user, body.pin or "")
    text = mica_to_download_text(payload)
    return {"filename": f"{user}_account.mica", "content": text, "format": "mica"}


@app.get("/api/backup/mdfs")
def api_backup_mdfs(authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    token = (authorization or "").replace("Bearer", "").strip()
    data = export_mdfs(user, token)
    import base64 as _b64
    return {
        "filename": f"{user}_files.mdfs",
        "content_b64": _b64.b64encode(data).decode("ascii"),
        "format": "mdfs",
    }




@app.get("/api/apps/content")
def api_apps_content(id: str, scope: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    app = get_app(user, id, scope)
    if not app:
        # try system prism html file
        p = ROOT / "apps" / "system" / id / "index.html"
        if p.exists():
            return {"id": id, "html": p.read_text(encoding="utf-8", errors="replace")}
        raise HTTPException(404, "App not found")
    return {
        "id": app.get("id"),
        "name": app.get("name"),
        "html": app.get("html") or "",
        "css": app.get("css") or "",
        "js": app.get("js") or "",
        "py": app.get("py") or "",
        "icon_data": app.get("icon_data") or "",
    }



class MdfsImportBody(BaseModel):
    content_b64: str = ""
    content: str = ""  # data URL or base64


@app.post("/api/backup/mdfs/import")
def api_mdfs_import(body: MdfsImportBody, authorization: Optional[str] = Header(None)):
    user = _user(authorization)
    token = (authorization or "").replace("Bearer", "").strip()
    raw = b""
    if body.content_b64:
        import base64 as _b64
        raw = _b64.b64decode(body.content_b64)
    elif body.content:
        raw = body.content.encode("utf-8")
    else:
        raise HTTPException(400, "No .mdfs content provided")
    try:
        return import_mdfs(user, raw, token)
    except Exception as e:
        raise HTTPException(400, f"mdfs import failed: {e}")




class UnzipBody(BaseModel):
    path: str
    dest: Optional[str] = None


@app.post("/api/fs/unzip")
def api_unzip(body: UnzipBody, authorization: Optional[str] = Header(None)):
    """Extract a zip from user FS into dest folder (default: same folder)."""
    import zipfile, io
    fs = _fs(authorization)
    src = body.path
    try:
        raw = fs.read_bytes(src)
    except Exception as e:
        raise HTTPException(404, str(e))
    # decrypt if needed
    token = (authorization or "").replace("Bearer", "").strip()
    try:
        raw = security.decrypt_bytes(token, raw)
    except Exception:
        pass
    dest_folder = body.dest
    if not dest_folder:
        # parent of zip
        parts = src.replace("\\", "/").rsplit("/", 1)
        dest_folder = parts[0] if len(parts) > 1 else ""
    extracted = []
    try:
        with zipfile.ZipFile(io.BytesIO(raw), "r") as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                name = info.filename.replace("\\", "/").lstrip("/")
                if not name or ".." in name.split("/"):
                    continue
                target = (dest_folder.rstrip("/") + "/" if dest_folder else "") + name
                data = zf.read(info)
                try:
                    data = security.encrypt_bytes(token, data)
                except Exception:
                    pass
                # write via fs
                p = fs.write_bytes(target, data)
                extracted.append(target)
    except zipfile.BadZipFile:
        raise HTTPException(400, "Not a valid zip file")
    except Exception as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "extracted": len(extracted), "files": extracted[:50]}



# ── Frontend ──────────────────────────────────────────────────────────

@app.get("/")
def index():
    return FileResponse(FRONTEND / "index.html")


app.mount("/static", StaticFiles(directory=str(FRONTEND)), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
