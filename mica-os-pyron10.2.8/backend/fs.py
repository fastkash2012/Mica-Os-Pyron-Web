"""Real on-disk sandboxed filesystem for Mica OS Pyron."""

from __future__ import annotations
from pathlib import Path
import shutil
from typing import Any

BASE = Path(__file__).resolve().parent.parent / "data" / "users"


class MicaFS:
    def __init__(self, username: str):
        self.username = username
        self.root = (BASE / username).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        for folder in ["Documents", "Pictures", "Videos", "Music", "Desktop", "Downloads", "Apps"]:
            (self.root / folder).mkdir(exist_ok=True)

    def _resolve(self, path: str) -> Path:
        clean = (path or "").replace(chr(92), "/").lstrip("/")
        if clean in ("", "Root", "."):
            return self.root
        target = (self.root / clean).resolve()
        if not str(target).startswith(str(self.root)):
            raise PermissionError("Path traversal blocked")
        return target

    def list(self, path: str = "") -> list[dict[str, Any]]:
        target = self._resolve(path)
        if not target.exists():
            return []
        if not target.is_dir():
            raise NotADirectoryError(path)
        items = []
        for entry in sorted(target.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            if entry.name.startswith("."):
                continue
            rel = str(entry.relative_to(self.root)).replace(chr(92), "/")
            items.append({
                "name": entry.name,
                "path": rel,
                "is_dir": entry.is_dir(),
                "size": entry.stat().st_size if entry.is_file() else 0,
                "ext": entry.suffix.lower() if entry.is_file() else "",
            })
        return items

    def read_text(self, path: str) -> str:
        return self._resolve(path).read_text(encoding="utf-8", errors="replace")

    def read_bytes(self, path: str) -> bytes:
        return self._resolve(path).read_bytes()

    def write_text(self, path: str, content: str) -> str:
        target = self._resolve(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return str(target.relative_to(self.root)).replace(chr(92), "/")

    def write_bytes(self, path: str, data: bytes) -> str:
        target = self._resolve(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return str(target.relative_to(self.root)).replace(chr(92), "/")

    def mkdir(self, path: str) -> str:
        target = self._resolve(path)
        target.mkdir(parents=True, exist_ok=True)
        return str(target.relative_to(self.root)).replace(chr(92), "/")

    def delete(self, path: str) -> None:
        target = self._resolve(path)
        if target == self.root:
            raise PermissionError("Cannot delete root")
        if target.is_dir():
            shutil.rmtree(target)
        elif target.exists():
            target.unlink()

    def exists(self, path: str) -> bool:
        try:
            return self._resolve(path).exists()
        except PermissionError:
            return False

    def move(self, src: str, dest: str) -> str:
        s = self._resolve(src)
        d = self._resolve(dest)
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(s), str(d))
        return str(d.relative_to(self.root)).replace(chr(92), "/")

    def copy(self, src: str, dest: str) -> str:
        s = self._resolve(src)
        d = self._resolve(dest)
        if s.is_dir():
            if d.exists():
                d = d / s.name
            shutil.copytree(s, d)
        else:
            d.parent.mkdir(parents=True, exist_ok=True)
            if d.is_dir():
                d = d / s.name
            shutil.copy2(s, d)
        return str(d.relative_to(self.root)).replace(chr(92), "/")
