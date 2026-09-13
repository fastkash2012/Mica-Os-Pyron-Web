#!/usr/bin/env python3
"""Mica OS Pyron — native shell with embedded Pyro Browser (real QWebEngineView)."""
from __future__ import annotations
import atexit
import base64
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))

HOST = "127.0.0.1"
PORT = 8000


def start_kernel():
    req = ROOT / "backend" / "requirements.txt"
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "-q", "-r", str(req)],
            cwd=str(ROOT),
        )
    except Exception as e:
        print("pip:", e)
    env = dict(**{k: v for k, v in __import__("os").environ.items()})
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--host", HOST, "--port", str(PORT)],
        cwd=str(ROOT / "backend"),
        env=env,
    )
    # wait for port
    import socket
    for _ in range(40):
        try:
            s = socket.create_connection((HOST, PORT), timeout=0.3)
            s.close()
            break
        except OSError:
            time.sleep(0.25)
    return proc


def main():
    from PyQt6.QtCore import (
        Qt, QUrl, QTimer, QObject, pyqtSlot, pyqtSignal, QStandardPaths, QPoint, QRect
    )
    from PyQt6.QtGui import QKeySequence, QShortcut
    from PyQt6.QtWidgets import QApplication, QMainWindow, QFileDialog
    from PyQt6.QtWebEngineWidgets import QWebEngineView
    from PyQt6.QtWebEngineCore import QWebEngineSettings, QWebEngineProfile, QWebEnginePage, QWebEngineDownloadRequest
    from PyQt6.QtWebChannel import QWebChannel

    kernel = start_kernel()
    if kernel:
        atexit.register(lambda: kernel.terminate() if kernel.poll() is None else None)

    QApplication.setHighDpiScaleFactorRoundingPolicy(
        Qt.HighDpiScaleFactorRoundingPolicy.PassThrough
    )
    app = QApplication(sys.argv)
    app.setApplicationName("Mica OS Pyron")

    class FullscreenWindow(QMainWindow):
        _force_fs = True

        def __init__(self):
            self._force_fs = True
            super().__init__()
            self.setWindowTitle("Mica OS Pyron 10.2.8")
            self.setWindowFlags(Qt.WindowType.Window | Qt.WindowType.FramelessWindowHint)
            self._force_fs = True

        def showEvent(self, event):
            super().showEvent(event)
            if getattr(self, "_force_fs", True):
                self.showFullScreen()

        def changeEvent(self, event):
            super().changeEvent(event)
            if getattr(self, "_force_fs", False) and not self.isFullScreen():
                QTimer.singleShot(50, self.showFullScreen)

        def keyPressEvent(self, event):
            # Keep the native window fullscreen, but do not swallow Esc —
            # the page uses it to exit in-OS true-fullscreen.
            if event.key() == Qt.Key.Key_Escape and not self.isFullScreen():
                self.showFullScreen()
            super().keyPressEvent(event)

    win = FullscreenWindow()

    # ── Browser manager: real WebEngine views over the OS shell ──
    class BrowserManager:
        def __init__(self, parent: QMainWindow):
            self.parent = parent
            self.views: dict[str, QWebEngineView] = {}
            self.pages: dict[str, QWebEnginePage] = {}
            self.profiles: dict[str, QWebEngineProfile] = {}
            self.token = ""
            self.username = ""

        def _profile(self, sid: str) -> QWebEngineProfile:
            if sid not in self.profiles:
                p = QWebEngineProfile(f"pyro_{sid}", self.parent)
                cache = ROOT / "data" / "webcache" / f"pyro_{sid}"
                cache.mkdir(parents=True, exist_ok=True)
                p.setCachePath(str(cache))
                p.setPersistentStoragePath(str(cache / "storage"))
                p.downloadRequested.connect(lambda dl, s=sid: self._on_download(s, dl))
                self.profiles[sid] = p
            return self.profiles[sid]

        def create(self, sid: str, x: int, y: int, w: int, h: int, url: str = "https://www.google.com"):
            if sid in self.views:
                # Geometry only — never re-navigate (avoids Google reload stutter)
                self.set_geometry(sid, x, y, w, h, raise_view=False)
                return
            profile = self._profile(sid)
            view = QWebEngineView(self.parent)
            page = QWebEnginePage(profile, view)
            view.setPage(page)
            settings = view.settings()
            settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.PluginsEnabled, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanOpenWindows, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
            # Keep under OS chrome when possible — stacking controlled by show/hide + focus
            view.setAttribute(Qt.WidgetAttribute.WA_NativeWindow, True)
            view.setGeometry(int(x), int(y), max(100, int(w)), max(100, int(h)))
            view.show()
            # Do NOT raise above all OS UI by default — focus path raises intentionally
            self.views[sid] = view
            self.pages[sid] = page

            # Relay URL / title to JS for address bar + tabs
            try:
                page.urlChanged.connect(lambda q, s=sid: self._emit_url(s, q))
                page.titleChanged.connect(lambda t, s=sid: self._emit_title(s, t))
            except Exception:
                pass

            if url:
                page.load(QUrl(url))

        def _emit_url(self, sid: str, qurl):
            try:
                bridge = getattr(self.parent, "_mica_bridge", None)
                if bridge is not None:
                    bridge.urlChanged.emit(sid, qurl.toString())
            except Exception:
                pass

        def _emit_title(self, sid: str, title: str):
            try:
                bridge = getattr(self.parent, "_mica_bridge", None)
                if bridge is not None:
                    bridge.titleChanged.emit(sid, title or "")
            except Exception:
                pass

        def set_geometry(self, sid: str, x: int, y: int, w: int, h: int, raise_view: bool = False):
            v = self.views.get(sid)
            if not v:
                return
            # Park off-screen instead of raise when hidden intentionally
            if w < 8 or h < 8 or x < -1000 or y < -1000:
                v.hide()
                return
            v.setGeometry(int(x), int(y), max(50, int(w)), max(50, int(h)))
            v.show()
            if raise_view:
                v.raise_()
            else:
                # Stay under transient OS chrome (menus / dialogs) unless focused
                v.lower()

        def navigate(self, sid: str, url: str):
            v = self.views.get(sid)
            if not v:
                return
            u = (url or "").strip()
            if not u:
                return
            if not u.startswith(("http://", "https://", "file://", "about:")):
                if " " in u or "." not in u:
                    u = "https://www.google.com/search?q=" + __import__("urllib.parse").quote(u)
                else:
                    u = "https://" + u
            v.page().load(QUrl(u))

        def back(self, sid: str):
            v = self.views.get(sid)
            if v:
                v.back()

        def forward(self, sid: str):
            v = self.views.get(sid)
            if v:
                v.forward()

        def reload(self, sid: str):
            v = self.views.get(sid)
            if v:
                v.reload()

        def close(self, sid: str):
            v = self.views.pop(sid, None)
            self.pages.pop(sid, None)
            if v:
                v.setParent(None)
                v.deleteLater()

        def hide_all(self):
            for v in self.views.values():
                v.hide()

        def show_sid(self, sid: str, raise_view: bool = True):
            for s, v in self.views.items():
                if s == sid:
                    v.show()
                    if raise_view:
                        v.raise_()
                else:
                    v.hide()

        def set_visible(self, sid: str, visible: bool):
            v = self.views.get(sid)
            if not v:
                return
            if visible:
                v.show()
            else:
                v.hide()

        def _on_download(self, sid: str, download):
            """Always prefer Mica user Downloads — avoid Windows save dialogs in-OS."""
            try:
                suggested = download.downloadFileName() or "download.bin"
                # Prefer logged-in user Downloads under DiskFS
                user_dir = None
                if self.username:
                    user_dir = ROOT / "data" / "users" / self.username / "Downloads"
                    user_dir.mkdir(parents=True, exist_ok=True)
                if not user_dir or not user_dir.exists():
                    user_dir = ROOT / "data" / "webcache" / "downloads"
                    user_dir.mkdir(parents=True, exist_ok=True)
                download.setDownloadDirectory(str(user_dir))
                download.setDownloadFileName(suggested)
                download.accept()
                try:
                    bridge = getattr(self.parent, "_mica_bridge", None)
                    if bridge is not None:
                        bridge.downloadSaved.emit(sid, str(user_dir / suggested))
                except Exception:
                    pass
            except Exception as e:
                print("download:", e)
                try:
                    download.accept()
                except Exception:
                    pass

    browsers = BrowserManager(win)

    class MicaBridge(QObject):
        urlChanged = pyqtSignal(str, str)
        titleChanged = pyqtSignal(str, str)
        downloadSaved = pyqtSignal(str, str)

        @pyqtSlot(str, str)
        def setSession(self, token: str, username: str):
            browsers.token = token or ""
            browsers.username = username or ""

        @pyqtSlot(str, int, int, int, int, str)
        def browserCreate(self, sid: str, x: int, y: int, w: int, h: int, url: str):
            browsers.create(sid, x, y, w, h, url or "https://www.google.com")

        @pyqtSlot(str, int, int, int, int)
        def browserGeometry(self, sid: str, x: int, y: int, w: int, h: int):
            browsers.set_geometry(sid, x, y, w, h)

        @pyqtSlot(str, str)
        def browserNavigate(self, sid: str, url: str):
            browsers.navigate(sid, url)

        @pyqtSlot(str)
        def browserBack(self, sid: str):
            browsers.back(sid)

        @pyqtSlot(str)
        def browserForward(self, sid: str):
            browsers.forward(sid)

        @pyqtSlot(str)
        def browserReload(self, sid: str):
            browsers.reload(sid)

        @pyqtSlot(str)
        def browserClose(self, sid: str):
            browsers.close(sid)

        @pyqtSlot(str)
        def browserFocus(self, sid: str):
            browsers.show_sid(sid)

        @pyqtSlot()
        def browserHideAll(self):
            browsers.hide_all()

        @pyqtSlot(str, bool)
        def browserSetVisible(self, sid: str, visible: bool):
            browsers.set_visible(sid, bool(visible))

        @pyqtSlot(str, int, int, int, int, bool)
        def browserGeometryEx(self, sid: str, x: int, y: int, w: int, h: int, raise_view: bool):
            browsers.set_geometry(sid, x, y, w, h, raise_view=bool(raise_view))

    bridge = MicaBridge()
    win._mica_bridge = bridge
    # Keep signal_holder for safety if create emits before bridge attr is set
    signal_holder = {"bridge": bridge}

    view = QWebEngineView()
    settings = view.settings()
    settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.PlaybackRequiresUserGesture, False)
    settings.setAttribute(QWebEngineSettings.WebAttribute.PluginsEnabled, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)

    profile = QWebEngineProfile.defaultProfile()
    cache = ROOT / "data" / "webcache"
    cache.mkdir(parents=True, exist_ok=True)
    profile.setCachePath(str(cache))
    profile.setPersistentStoragePath(str(cache / "storage"))

    channel = QWebChannel(view.page())
    channel.registerObject("micaNative", bridge)
    view.page().setWebChannel(channel)

    # Inject QWebChannel bootstrap after each load of OS shell
    def _inject_bridge(ok):
        if not ok:
            return
        js = r"""
        (function(){
          if (window.__micaBridgeReady) return;
          function boot(channel){
            window.micaNative = channel.objects.micaNative;
            window.__micaBridgeReady = true;
            window.dispatchEvent(new Event('mica-native-ready'));
          }
          if (typeof qt !== 'undefined' && qt.webChannelTransport) {
            if (typeof QWebChannel === 'undefined') {
              var s = document.createElement('script');
              s.src = 'qrc:///qtwebchannel/qwebchannel.js';
              s.onload = function(){ new QWebChannel(qt.webChannelTransport, boot); };
              document.head.appendChild(s);
            } else {
              new QWebChannel(qt.webChannelTransport, boot);
            }
          }
        })();
        """
        view.page().runJavaScript(js)

    view.loadFinished.connect(_inject_bridge)

    # Global downloads for shell (non-browser)
    try:
        def _on_download(download):
            try:
                suggested = download.downloadFileName() or "download.bin"
                start_dir = QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DownloadLocation)
                path, _ = QFileDialog.getSaveFileName(win, "Save file", str(Path(start_dir) / suggested))
                if not path:
                    try:
                        download.cancel()
                    except Exception:
                        pass
                    return
                download.setDownloadDirectory(str(Path(path).parent))
                download.setDownloadFileName(Path(path).name)
                download.accept()
            except Exception as e:
                print("download handler:", e)
                try:
                    download.accept()
                except Exception:
                    pass

        profile.downloadRequested.connect(_on_download)
    except Exception as e:
        print("download dialog setup failed:", e)

    def _on_fullscreen_request(request):
        try:
            request.accept()
            if request.toggleOn():
                win.showFullScreen()
        except Exception as e:
            print("fullscreen request", e)

    try:
        view.page().fullScreenRequested.connect(_on_fullscreen_request)
    except Exception as e:
        print("fullscreen hook failed", e)


    # Grant camera / microphone for Camera app (getUserMedia)
    try:
        def _on_feature_permission(origin, feature):
            try:
                granted = [
                    QWebEnginePage.Feature.MediaAudioCapture,
                    QWebEnginePage.Feature.MediaVideoCapture,
                    QWebEnginePage.Feature.MediaAudioVideoCapture,
                ]
                # Qt 6.7+ may use different enums — grant video/audio broadly
                try:
                    if feature in granted:
                        view.page().setFeaturePermission(
                            origin, feature,
                            QWebEnginePage.PermissionPolicy.PermissionGrantedByUser,
                        )
                        return
                except Exception:
                    pass
                # Fallback: grant all media-like features
                name = str(feature)
                if 'Media' in name or 'Video' in name or 'Audio' in name or 'Desktop' in name:
                    view.page().setFeaturePermission(
                        origin, feature,
                        QWebEnginePage.PermissionPolicy.PermissionGrantedByUser,
                    )
                else:
                    view.page().setFeaturePermission(
                        origin, feature,
                        QWebEnginePage.PermissionPolicy.PermissionDeniedByUser,
                    )
            except Exception as e:
                print("permission:", e)
        view.page().featurePermissionRequested.connect(_on_feature_permission)
    except Exception as e:
        print("featurePermission hook failed:", e)

    win.setCentralWidget(view)
    view.load(QUrl(f"http://{HOST}:{PORT}/"))

    QShortcut(QKeySequence("Ctrl+Q"), win, activated=app.quit)
    QShortcut(QKeySequence("Alt+F4"), win, activated=app.quit)

    win.showFullScreen()
    code = app.exec()
    if kernel and kernel.poll() is None:
        kernel.terminate()
    sys.exit(code)


if __name__ == "__main__":
    main()
