"""
Mica Security — per-user random vault keys (Pyron 7).
Fernet + PBKDF2. Each user gets a unique random encryption key,
wrapped with their login PIN (username-bound) and recoverable via admin PIN.
"""

from __future__ import annotations
import base64
import hashlib
import json
import secrets
from pathlib import Path
from typing import Any, Optional

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = Path(__file__).resolve().parent.parent
USERS_ROOT = ROOT / "data" / "users"
REQ_FILE = ROOT / "backend" / "requirements.txt"

# session_token -> security context
SESSIONS: dict[str, dict[str, Any]] = {}


def check_requirements() -> dict[str, Any]:
    missing = []
    present = []
    if not REQ_FILE.exists():
        return {"ok": False, "error": "requirements.txt missing", "missing": ["requirements.txt"], "present": []}
    lines = REQ_FILE.read_text(encoding="utf-8").splitlines()
    mapping = {
        "fastapi": "fastapi",
        "uvicorn": "uvicorn",
        "python-multipart": "multipart",
        "aiofiles": "aiofiles",
        "pydantic": "pydantic",
        "PyQt6": "PyQt6",
        "PyQt6-WebEngine": "PyQt6.QtWebEngineWidgets",
        "cryptography": "cryptography",
    }
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name = line.split(">")[0].split("=")[0].split("[")[0].strip()
        mod = mapping.get(name, name.replace("-", "_"))
        try:
            __import__(mod.split(".")[0])
            present.append(name)
        except Exception:
            missing.append(name)
    return {"ok": len(missing) == 0, "missing": missing, "present": present}


def _meta_path(username: str) -> Path:
    return USERS_ROOT / username / ".mica_meta.json"


def load_meta(username: str) -> dict[str, Any]:
    p = _meta_path(username)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_meta(username: str, meta: dict[str, Any]) -> None:
    p = _meta_path(username)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(meta, indent=2), encoding="utf-8")


def _kdf(password: str, salt: bytes, username: str, purpose: str = "vault") -> bytes:
    """Username-bound PBKDF2 → Fernet key material."""
    material = f"{purpose}:{username}:{password}".encode("utf-8")
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=200_000,
    )
    return base64.urlsafe_b64encode(kdf.derive(material))


def _wrap_key(user_key: bytes, password: str, salt: bytes, username: str, purpose: str) -> str:
    wrapper = Fernet(_kdf(password, salt, username, purpose))
    return wrapper.encrypt(user_key).decode("ascii")


def _unwrap_key(wrapped: str, password: str, salt: bytes, username: str, purpose: str) -> bytes:
    wrapper = Fernet(_kdf(password, salt, username, purpose))
    return wrapper.decrypt(wrapped.encode("ascii"))


def ensure_security_fields(meta: dict[str, Any], pin: str, username: str) -> dict[str, Any]:
    """Ensure per-user random vault key exists and is wrapped."""
    if "enc_salt" not in meta:
        meta["enc_salt"] = secrets.token_hex(16)
    salt = bytes.fromhex(meta["enc_salt"])

    if "user_key_wrapped" not in meta:
        # brand-new random Fernet key unique to this user
        user_key = Fernet.generate_key()
        meta["user_key_wrapped"] = _wrap_key(user_key, pin, salt, username, "vault")
        # also wrap with admin pin (defaults to account pin)
        admin_pin = pin
        meta["user_key_admin_wrapped"] = _wrap_key(user_key, admin_pin, salt, username, "admin")
        meta["key_fingerprint"] = hashlib.sha256(user_key).hexdigest()[:16]
        meta["security_version"] = 7
    else:
        # migrate old pin-derived scheme → random key if needed
        if meta.get("security_version", 6) < 7 and "user_key_wrapped" not in meta:
            user_key = Fernet.generate_key()
            meta["user_key_wrapped"] = _wrap_key(user_key, pin, salt, username, "vault")
            meta["user_key_admin_wrapped"] = _wrap_key(user_key, pin, salt, username, "admin")
            meta["key_fingerprint"] = hashlib.sha256(user_key).hexdigest()[:16]
            meta["security_version"] = 7

    if "encryption_enabled" not in meta:
        meta["encryption_enabled"] = False
    if "devmode" not in meta:
        meta["devmode"] = False
    if "diskfs_unlocked" not in meta:
        meta["diskfs_unlocked"] = True
    if "admin_pin_hash" not in meta:
        acct_salt = meta.get("salt") or secrets.token_hex(8)
        meta["admin_pin_hash"] = hashlib.sha256((acct_salt + pin).encode()).hexdigest()
    if "security_version" not in meta:
        meta["security_version"] = 7
    return meta


def _unlock_user_key(username: str, pin: str, meta: dict[str, Any]) -> bytes:
    salt = bytes.fromhex(meta["enc_salt"])
    wrapped = meta.get("user_key_wrapped")
    if not wrapped:
        # legacy: derive directly from pin (pre-v7)
        return _kdf(pin, salt, username, "legacy")
    try:
        return _unwrap_key(wrapped, pin, salt, username, "vault")
    except InvalidToken:
        # try admin wrap with same pin
        admin_wrapped = meta.get("user_key_admin_wrapped")
        if admin_wrapped:
            try:
                return _unwrap_key(admin_wrapped, pin, salt, username, "admin")
            except InvalidToken:
                pass
        raise PermissionError("Decryption failed — wrong password or corrupted vault key")


def recover_user_key_with_admin(username: str, admin_pin: str) -> bytes:
    """Reveal / recover the random user key using admin password."""
    meta = load_meta(username)
    if not meta:
        raise PermissionError("User not found")
    if not verify_admin(username, admin_pin):
        raise PermissionError("Admin authentication failed")
    salt = bytes.fromhex(meta.get("enc_salt") or secrets.token_hex(16))
    admin_wrapped = meta.get("user_key_admin_wrapped")
    if not admin_wrapped:
        raise PermissionError("No admin-wrapped key on this account")
    try:
        return _unwrap_key(admin_wrapped, admin_pin, salt, username, "admin")
    except InvalidToken as e:
        # admin pin may have changed — try with account salt rewrap failure
        raise PermissionError("Could not unwrap vault key with admin PIN") from e


def reveal_key_info(username: str, admin_pin: str) -> dict[str, Any]:
    """Admin-only: show fingerprint + base64 of vault key."""
    key = recover_user_key_with_admin(username, admin_pin)
    return {
        "username": username,
        "key_fingerprint": hashlib.sha256(key).hexdigest()[:16],
        "key_b64": key.decode("ascii") if isinstance(key, (bytes, bytearray)) else str(key),
        "security_version": load_meta(username).get("security_version", 7),
    }


def rewrap_keys_after_pin_change(username: str, old_pin: str, new_pin: str) -> None:
    meta = load_meta(username)
    if not meta.get("user_key_wrapped"):
        return
    salt = bytes.fromhex(meta["enc_salt"])
    user_key = _unlock_user_key(username, old_pin, meta)
    meta["user_key_wrapped"] = _wrap_key(user_key, new_pin, salt, username, "vault")
    # keep admin wrap unless admin pin equals old account pin
    save_meta(username, meta)


def open_session(username: str, pin: str, token: str) -> dict[str, Any]:
    meta = load_meta(username)
    meta = ensure_security_fields(meta, pin, username)
    save_meta(username, meta)
    user_key = _unlock_user_key(username, pin, meta)

    marker = USERS_ROOT / username / ".mica_vault"
    if meta.get("encryption_enabled") and marker.exists():
        try:
            Fernet(user_key).decrypt(marker.read_bytes())
        except InvalidToken as e:
            raise PermissionError("Decryption failed — wrong password or corrupted vault") from e
    elif meta.get("encryption_enabled"):
        marker.write_bytes(Fernet(user_key).encrypt(b"mica-vault-ok"))

    ctx = {
        "username": username,
        "key": user_key,
        "encryption_enabled": bool(meta.get("encryption_enabled")),
        "devmode": bool(meta.get("devmode")),
        "diskfs_unlocked": True,
        "token": token,
        "key_fingerprint": meta.get("key_fingerprint") or hashlib.sha256(user_key).hexdigest()[:16],
    }
    SESSIONS[token] = ctx
    return {
        "encryption_enabled": ctx["encryption_enabled"],
        "devmode": ctx["devmode"],
        "diskfs_unlocked": True,
        "security_version": meta.get("security_version", 7),
        "key_fingerprint": ctx["key_fingerprint"],
    }


def close_session(token: str) -> None:
    SESSIONS.pop(token, None)


def get_session(token: str) -> Optional[dict[str, Any]]:
    return SESSIONS.get(token)


def fernet_for(token: str) -> Optional[Fernet]:
    ctx = get_session(token)
    if not ctx or not ctx.get("encryption_enabled"):
        return None
    return Fernet(ctx["key"])


def encrypt_bytes(token: str, data: bytes) -> bytes:
    f = fernet_for(token)
    if not f:
        return data
    return f.encrypt(data)


def decrypt_bytes(token: str, data: bytes) -> bytes:
    f = fernet_for(token)
    if not f:
        return data
    looks_encrypted = data.startswith(b"gAAAA") or (len(data) > 100 and b"\n" not in data[:20])
    try:
        return f.decrypt(data)
    except InvalidToken:
        if looks_encrypted:
            raise
        return data


def set_encryption(username: str, token: str, enabled: bool, pin: str) -> dict[str, Any]:
    ctx = get_session(token)
    if not ctx or ctx.get("username") != username:
        raise PermissionError("No session")
    meta = load_meta(username)
    meta = ensure_security_fields(meta, pin, username)
    key = ctx["key"]
    meta["encryption_enabled"] = bool(enabled)
    ctx["encryption_enabled"] = bool(enabled)
    marker = USERS_ROOT / username / ".mica_vault"
    if enabled:
        marker.write_bytes(Fernet(key).encrypt(b"mica-vault-ok"))
        _migrate_tree(username, token, encrypt=True)
    else:
        _migrate_tree(username, token, encrypt=False)
        if marker.exists():
            try:
                marker.unlink()
            except Exception:
                pass
    save_meta(username, meta)
    return {"encryption_enabled": enabled, "key_fingerprint": ctx.get("key_fingerprint")}


def set_devmode(username: str, enabled: bool) -> dict[str, Any]:
    meta = load_meta(username)
    meta["devmode"] = bool(enabled)
    save_meta(username, meta)
    for ctx in SESSIONS.values():
        if ctx.get("username") == username:
            ctx["devmode"] = bool(enabled)
    return {"devmode": bool(enabled)}


def verify_admin(username: str, admin_pin: str) -> bool:
    meta = load_meta(username)
    salt = meta.get("salt") or ""
    expected = meta.get("admin_pin_hash") or ""
    got = hashlib.sha256((salt + admin_pin).encode()).hexdigest()
    return bool(expected) and secrets.compare_digest(expected, got)


def set_admin_pin(username: str, current_pin: str, new_admin_pin: str) -> bool:
    meta = load_meta(username)
    if not verify_pin(username, current_pin) and not verify_admin(username, current_pin):
        return False
    salt = meta.get("salt") or secrets.token_hex(8)
    # rewrap admin key with new admin pin if we can unlock
    try:
        user_key = None
        for tok, ctx in list(SESSIONS.items()):
            if ctx.get("username") == username:
                user_key = ctx.get("key")
                break
        if user_key is None and meta.get("user_key_admin_wrapped"):
            # try current pin as admin
            try:
                user_key = recover_user_key_with_admin(username, current_pin)
            except Exception:
                pass
        if user_key is not None:
            enc_salt = bytes.fromhex(meta["enc_salt"])
            meta["user_key_admin_wrapped"] = _wrap_key(user_key, new_admin_pin, enc_salt, username, "admin")
    except Exception:
        pass
    meta["admin_pin_hash"] = hashlib.sha256((salt + new_admin_pin).encode()).hexdigest()
    save_meta(username, meta)
    return True


def verify_pin(username: str, pin: str) -> bool:
    meta = load_meta(username)
    salt = meta.get("salt") or ""
    expected = meta.get("pin_hash") or meta.get("password_hash") or ""
    if not expected:
        return False
    got = hashlib.sha256((salt + pin).encode()).hexdigest()
    return secrets.compare_digest(expected, got)


def security_status(username: str, token: str) -> dict[str, Any]:
    meta = load_meta(username)
    ctx = get_session(token) or {}
    return {
        "encryption_enabled": bool(meta.get("encryption_enabled")),
        "devmode": bool(meta.get("devmode")),
        "diskfs_unlocked": True,
        "session_unlocked": token in SESSIONS,
        "security_version": meta.get("security_version", 7),
        "key_fingerprint": meta.get("key_fingerprint") or ctx.get("key_fingerprint"),
        "username_bound": True,
    }


def _migrate_tree(username: str, token: str, encrypt: bool) -> None:
    root = USERS_ROOT / username
    skip = {".mica_meta.json", ".mica_vault"}
    f = fernet_for(token)
    if not f and encrypt:
        return
    # when disabling, session still has key in ctx even if encryption_enabled flipped —
    # use session key directly
    ctx = get_session(token)
    if not ctx:
        return
    f = Fernet(ctx["key"])
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.name in skip:
            continue
        try:
            raw = path.read_bytes()
            if encrypt:
                if raw.startswith(b"gAAAA"):
                    continue
                path.write_bytes(f.encrypt(raw))
            else:
                if raw.startswith(b"gAAAA"):
                    path.write_bytes(f.decrypt(raw))
        except Exception:
            continue


def set_diskfs_unlocked(username: str, enabled: bool) -> dict[str, Any]:
    """DevMode: allow write/copy/move onto host drives (C:/ etc.)."""
    meta = load_meta(username)
    meta["diskfs_unlocked"] = bool(enabled)
    save_meta(username, meta)
    for ctx in SESSIONS.values():
        if ctx.get("username") == username:
            ctx["diskfs_unlocked"] = bool(enabled)
    return {"diskfs_unlocked": bool(enabled)}


def is_diskfs_unlocked(username: str) -> bool:
    # Host / external storage always available (9.8+)
    return True


