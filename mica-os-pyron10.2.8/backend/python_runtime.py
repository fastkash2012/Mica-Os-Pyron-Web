"""Restricted Python execution for Terminal + Python Lab + .py apps."""

from __future__ import annotations
import io
import traceback
from contextlib import redirect_stdout, redirect_stderr
from typing import Any

SAFE_BUILTINS = {
    "abs": abs, "all": all, "any": any, "bin": bin, "bool": bool,
    "chr": chr, "dict": dict, "divmod": divmod, "enumerate": enumerate,
    "filter": filter, "float": float, "format": format, "frozenset": frozenset,
    "getattr": getattr, "hasattr": hasattr, "hash": hash, "hex": hex,
    "int": int, "isinstance": isinstance, "issubclass": issubclass,
    "iter": iter, "len": len, "list": list, "map": map, "max": max,
    "min": min, "next": next, "oct": oct, "ord": ord, "pow": pow,
    "print": print, "range": range, "repr": repr, "reversed": reversed,
    "round": round, "set": set, "slice": slice, "sorted": sorted,
    "str": str, "sum": sum, "tuple": tuple, "type": type, "zip": zip,
    "True": True, "False": False, "None": None,
    "Exception": Exception, "ValueError": ValueError, "TypeError": TypeError,
    "KeyError": KeyError, "IndexError": IndexError, "RuntimeError": RuntimeError,
}

ALLOWED_MODULES = {
    "math", "random", "datetime", "json", "re", "collections",
    "itertools", "functools", "operator", "string", "textwrap",
    "statistics", "decimal", "fractions", "time", "copy", "hashlib",
    "base64", "uuid", "pathlib", "os.path",
}


def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    root = name.split(".")[0]
    if root not in ALLOWED_MODULES and name not in ALLOWED_MODULES:
        raise ImportError(f"Import of '{name}' is not allowed in Mica sandbox")
    return __import__(name, globals, locals, fromlist, level)


def run_python(code: str, extra_globals: dict | None = None) -> dict[str, Any]:
    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    g: dict[str, Any] = {"__builtins__": SAFE_BUILTINS.copy(), "__name__": "__main__"}
    g["__builtins__"]["__import__"] = _safe_import
    if extra_globals:
        g.update(extra_globals)

    result = {"success": False, "stdout": "", "stderr": "", "error": None}
    try:
        with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
            exec(compile(code, "<mica>", "exec"), g)
        result["success"] = True
        result["stdout"] = stdout_buf.getvalue()
        result["stderr"] = stderr_buf.getvalue()
    except Exception:
        result["stdout"] = stdout_buf.getvalue()
        result["stderr"] = stderr_buf.getvalue()
        result["error"] = traceback.format_exc()
    return result
