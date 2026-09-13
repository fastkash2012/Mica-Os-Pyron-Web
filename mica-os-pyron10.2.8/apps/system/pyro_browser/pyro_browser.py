import sys
import os
import json
import shutil
import importlib.util
from PyQt6.QtCore import QUrl, Qt, QStandardPaths, QSettings
from PyQt6.QtGui import QAction, QIcon, QKeySequence, QShortcut
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QTabWidget, QWidget, 
    QVBoxLayout, QHBoxLayout, QLineEdit, QPushButton, 
    QToolBar, QMenuBar, QMenu, QMessageBox, QStatusBar, 
    QPlainTextEdit, QLabel, QSizePolicy, QFileDialog, QStyle, 
    QSplitter, QStackedWidget, QListWidget, QDialog
)
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineProfile, QWebEngineSettings

class PyroBrowser(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Pyro Browser")
        self.setGeometry(100, 100, 1200, 800)

        # ---------------------------------------------------------------------
        # 1. WINDOWS 10 / METRO UI AESTHETICS (Flat, Compact, Stacking)
        # ---------------------------------------------------------------------
        self.edit_mode_active = False
        self.settings_manager = QSettings("PyroBrowser", "CoreLayout")
        
        self.default_style = """
            QMainWindow { background-color: #202020; color: #ffffff; }
            QMenuBar { background-color: #202020; color: #ffffff; border-bottom: 1px solid #333333; }
            QMenuBar::item { padding: 4px 10px; background: transparent; }
            QMenuBar::item:selected { background-color: #333333; }
            QMenu { background-color: #2b2b2b; color: #ffffff; border: 1px solid #444444; }
            QMenu::item { padding: 6px 24px; }
            QMenu::item:selected { background-color: #0078d7; }
            QToolBar { background-color: #2b2b2b; border-bottom: 1px solid #1a1a1a; padding: 4px; spacing: 4px; }
            QToolBar::handle:horizontal { background: #555555; width: 4px; margin: 2px 4px; }
            QPushButton { background: transparent; color: #ffffff; border: none; padding: 4px 12px; font-weight: bold;}
            QPushButton:hover { background: #444444; border-radius: 2px;}
            QPushButton:pressed { background: #1a1a1a; }
            QLineEdit { background: #1e1e1e; color: #ffffff; border: 1px solid #555555; padding: 6px 12px; font-size: 13px; margin: 0px 10px; border-radius: 2px;}
            QLineEdit:focus { border: 1px solid #0078d7; background: #000000; }
            
            /* Tab Overhaul */
            QTabWidget::pane { border-top: 1px solid #333333; background: #202020; }
            QTabBar::tab { background: #1e1e1e; color: #888888; padding: 8px 20px; border: none; border-right: 1px solid #2a2a2a; }
            QTabBar::tab:hover { background: #2a2a2a; color: #ffffff; }
            QTabBar::tab:selected { background: #2b2b2b; color: #ffffff; border-top: 2px solid #0078d7; }
            QPushButton#AddTabBtn { background: transparent; color: #888888; font-size: 18px; width: 28px; height: 28px; margin-bottom: 2px; }
            QPushButton#AddTabBtn:hover { background: #2a2a2a; color: #ffffff; }
            
            /* Sidebar & Utilities */
            QSplitter::handle { background-color: #333333; width: 2px; }
            QPlainTextEdit { background: #1e1e1e; color: #cccccc; border: 1px solid #444444; font-family: Consolas; }
            QStatusBar { background: #202020; color: #888888; border-top: 1px solid #333333; }
            QListWidget { background: #1e1e1e; color: #ffffff; border: 1px solid #444444; }
        """
        self.setStyleSheet(self.default_style)

        # Fullscreen Global Shortcut
        self.fs_shortcut = QShortcut(QKeySequence("F11"), self)
        self.fs_shortcut.activated.connect(self.toggle_fullscreen)

        # Track active extensions elements so we can safely tear them down on reload
        self.registered_plugin_widgets = []
        self.plugin_actions = []

        # ---------------------------------------------------------------------
        # 2. PERSISTENCE & DATA TRACKING
        # ---------------------------------------------------------------------
        self.data_dir = os.path.join(QStandardPaths.writableLocation(QStandardPaths.StandardLocation.AppDataLocation), "PyroBrowser")
        if not os.path.exists(self.data_dir): os.makedirs(self.data_dir)
        
        self.profile = QWebEngineProfile("PyroProfile", self)
        self.profile.setPersistentStoragePath(self.data_dir)
        self.profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.ForcePersistentCookies)
        
        self.engine_settings = self.profile.settings()
        self.engine_settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        self.engine_settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)

        self.bookmarks_file = os.path.join(self.data_dir, "bookmarks.json")
        self.bookmarks = self.load_bookmarks_data()

        # ---------------------------------------------------------------------
        # 3. CORE UI SETUP
        # ---------------------------------------------------------------------
        self.main_splitter = QSplitter(Qt.Orientation.Horizontal)
        self.setCentralWidget(self.main_splitter)

        self.tabs = QTabWidget()
        self.tabs.setDocumentMode(True)
        self.tabs.setTabsClosable(True)
        self.tabs.tabCloseRequested.connect(self.close_current_tab)
        self.tabs.currentChanged.connect(self.tab_changed)
        
        self.add_tab_btn = QPushButton("+")
        self.add_tab_btn.setObjectName("AddTabBtn")
        self.add_tab_btn.clicked.connect(lambda: self.add_new_tab())
        self.tabs.setCornerWidget(self.add_tab_btn, Qt.Corner.TopRightCorner)
        
        self.main_splitter.addWidget(self.tabs)

        self.create_dynamic_sidebar()
        self.create_top_menu_bar()
        self.create_navigation_bar()

        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)

        # ---------------------------------------------------------------------
        # 4. PLUGIN ENVIRONMENT SETUP
        # ---------------------------------------------------------------------
        self.plugin_dir = os.path.join(self.data_dir, "plugins")
        if not os.path.exists(self.plugin_dir): os.makedirs(self.plugin_dir)
        
        self.restore_layout_state()
        self.add_new_tab(QUrl("https://www.google.com"), "New Tab")
        self.load_plugins()

    # ---------------------------------------------------------------------
    # MENUS
    # ---------------------------------------------------------------------
    def create_top_menu_bar(self):
        menubar = self.menuBar()

        file_menu = menubar.addMenu("File")
        new_tab_act = QAction("New Tab", self)
        new_tab_act.triggered.connect(lambda: self.add_new_tab())
        file_menu.addAction(new_tab_act)
        exit_act = QAction("Exit", self)
        exit_act.triggered.connect(self.close)
        file_menu.addAction(exit_act)

        self.view_menu = menubar.addMenu("View")
        self.toggle_nav_act = QAction("Show Navigation Bar", self, checkable=True)
        self.toggle_nav_act.setChecked(True)
        self.toggle_nav_act.triggered.connect(lambda checked: self.nav_bar.setVisible(checked))
        self.view_menu.addAction(self.toggle_nav_act)
        
        fs_act = QAction("Webpage Fullscreen (F11)", self)
        fs_act.triggered.connect(self.toggle_fullscreen)
        self.view_menu.addAction(fs_act)
        
        layout_act = QAction("Unlock Layout (Edit Mode)", self, checkable=True)
        layout_act.triggered.connect(self.toggle_edit_mode)
        self.view_menu.addAction(layout_act)

        self.bookmarks_menu = menubar.addMenu("Bookmarks")
        self.render_bookmarks_menu()

        dev_menu = menubar.addMenu("Developer")
        self.inspect_act = QAction("Toggle Inspect", self, checkable=True)
        self.inspect_act.triggered.connect(lambda checked: self.toggle_sidebar(checked, 0))
        dev_menu.addAction(self.inspect_act)
        
        self.inject_act = QAction("Toggle Live Injector", self, checkable=True)
        self.inject_act.triggered.connect(lambda checked: self.toggle_sidebar(checked, 1))
        dev_menu.addAction(self.inject_act)

        # Base Extensions Menu Wrapper
        self.ext_menu = menubar.addMenu("Extensions")
        self.rebuild_extensions_menu_structure()

    def rebuild_extensions_menu_structure(self):
        """Clears and establishes clean base controls for the extensions hook."""
        self.ext_menu.clear()
        
        upload_act = QAction("Upload Python (.py) Plugin...", self)
        upload_act.triggered.connect(self.upload_py_plugin)
        self.ext_menu.addAction(upload_act)
        
        manage_act = QAction("Manage / Delete Plugins...", self)
        manage_act.triggered.connect(self.open_plugin_manager)
        self.ext_menu.addAction(manage_act)
        
        # Separator marks the line where .py plugin generated options will safely load below
        self.ext_menu.addSeparator()

    def toggle_fullscreen(self):
        if self.isFullScreen():
            self.showNormal()
            self.nav_bar.setVisible(self.toggle_nav_act.isChecked())
            self.menuBar().setVisible(True)
        else:
            self.showFullScreen()
            self.nav_bar.setVisible(False)
            self.menuBar().setVisible(False)

    # ---------------------------------------------------------------------
    # DYNAMIC SIDEBAR
    # ---------------------------------------------------------------------
    def create_dynamic_sidebar(self):
        self.sidebar_widget = QWidget()
        sidebar_layout = QVBoxLayout(self.sidebar_widget)
        sidebar_layout.setContentsMargins(0, 0, 0, 0)
        sidebar_layout.setSpacing(0)

        header = QWidget()
        header.setStyleSheet("background-color: #333333;")
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(10, 4, 4, 4)
        
        self.sidebar_title = QLabel("Sidebar")
        self.sidebar_title.setStyleSheet("font-weight: bold; color: #ffffff;")
        header_layout.addWidget(self.sidebar_title)
        
        close_btn = QPushButton("✕")
        close_btn.setStyleSheet("QPushButton { font-weight: bold; padding: 2px 6px; } QPushButton:hover { background: #d32f2f; }")
        close_btn.clicked.connect(self.close_sidebar)
        header_layout.addWidget(close_btn, 0, Qt.AlignmentFlag.AlignRight)
        
        sidebar_layout.addWidget(header)

        self.sidebar_stack = QStackedWidget()
        
        # Core Stack Assets
        self.devtools_view = QWebEngineView(self.profile)
        self.sidebar_stack.addWidget(self.devtools_view)
        self.sidebar_stack.addWidget(self.create_injector_widget())
        
        sidebar_layout.addWidget(self.sidebar_stack)
        self.main_splitter.addWidget(self.sidebar_widget)
        self.main_splitter.setSizes([800, 400])
        self.sidebar_widget.hide()

    def toggle_sidebar(self, checked, stack_index):
        if checked:
            self.sidebar_stack.setCurrentIndex(stack_index)
            self.sidebar_widget.show()
            
            if stack_index == 0:
                self.sidebar_title.setText("Developer Tools - Inspect")
                self.inject_act.setChecked(False)
                if self.current_browser():
                    self.current_browser().page().setDevToolsPage(self.devtools_view.page())
            elif stack_index == 1:
                self.sidebar_title.setText("Live Code Injector")
                self.inspect_act.setChecked(False)
                if self.current_browser():
                    self.current_browser().page().setDevToolsPage(None)
            
            # Loop and safely clear checkboxes on external plugin actions
            for act in self.plugin_actions:
                if act.isCheckable() and self.sidebar_stack.currentIndex() != stack_index:
                    act.setChecked(False)
        else:
            self.close_sidebar()

    def close_sidebar(self):
        self.sidebar_widget.hide()
        self.inspect_act.setChecked(False)
        self.inject_act.setChecked(False)
        for act in self.plugin_actions:
            if act.isCheckable(): act.setChecked(False)
        if self.current_browser():
            self.current_browser().page().setDevToolsPage(None)

    def create_injector_widget(self):
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setContentsMargins(5, 5, 5, 5)
        
        self.py_editor = QPlainTextEdit()
        self.py_editor.setPlaceholderText("Python Runtime (App Control)")
        layout.addWidget(self.py_editor)
        
        btn_py = QPushButton("Execute Python")
        btn_py.clicked.connect(self.run_live_python)
        layout.addWidget(btn_py)

        self.js_editor = QPlainTextEdit()
        self.js_editor.setStyleSheet("color: #eab308;")
        self.js_editor.setPlaceholderText("JavaScript Runtime (DOM Control)")
        layout.addWidget(self.js_editor)
        
        btn_js = QPushButton("Execute JavaScript")
        btn_js.clicked.connect(self.run_live_javascript)
        layout.addWidget(btn_js)

        self.console = QPlainTextEdit()
        self.console.setReadOnly(True)
        self.console.setMaximumHeight(100)
        layout.addWidget(self.console)
        return widget

    def run_live_python(self):
        try:
            exec(self.py_editor.toPlainText(), globals(), {'app': self})
        except Exception as e:
            self.console.appendPlainText(f"[ERR] {e}")

    def run_live_javascript(self):
        if self.current_browser():
            self.current_browser().page().runJavaScript(self.js_editor.toPlainText())

    # ---------------------------------------------------------------------
    # TOOLBAR CONTROL & LAYOUTS
    # ---------------------------------------------------------------------
    def create_navigation_bar(self):
        self.nav_bar = QToolBar("Navigation")
        self.nav_bar.setObjectName("NavigationBar")
        self.nav_bar.setMovable(False) 
        self.addToolBar(Qt.ToolBarArea.TopToolBarArea, self.nav_bar)

        for text, slot in [("◄", self.navigate_back), ("►", self.navigate_forward), ("↻", self.navigate_reload)]:
            btn = QPushButton(text)
            btn.clicked.connect(slot)
            self.nav_bar.addWidget(btn)

        self.url_bar = QLineEdit()
        self.url_bar.setPlaceholderText("Search Google or type a URL")
        self.url_bar.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.url_bar.returnPressed.connect(self.navigate_to_url)
        self.nav_bar.addWidget(self.url_bar)

        star_btn = QPushButton("★")
        star_btn.clicked.connect(self.add_bookmark)
        self.nav_bar.addWidget(star_btn)

    def toggle_edit_mode(self, checked):
        self.edit_mode_active = checked
        self.nav_bar.setMovable(checked)
        if checked:
            self.setStyleSheet(self.default_style + "QToolBar { border: 1px dashed #0078d7; }")
        else:
            self.setStyleSheet(self.default_style)
            self.save_layout_state()

    def save_layout_state(self):
        self.settings_manager.setValue("windowState", self.saveState())
        self.settings_manager.setValue("geometry", self.saveGeometry())
        self.settings_manager.setValue("splitter", self.main_splitter.saveState())

    def restore_layout_state(self):
        if self.settings_manager.value("windowState"):
            self.restoreState(self.settings_manager.value("windowState"))
        if self.settings_manager.value("geometry"):
            self.restoreGeometry(self.settings_manager.value("geometry"))
        if self.settings_manager.value("splitter"):
            self.main_splitter.restoreState(self.settings_manager.value("splitter"))

    # ---------------------------------------------------------------------
    # BOOKMARKS DROPDOWN
    # ---------------------------------------------------------------------
    def load_bookmarks_data(self):
        if os.path.exists(self.bookmarks_file):
            try:
                with open(self.bookmarks_file, 'r') as f: return json.load(f)
            except Exception: return {}
        return {"https://www.google.com": "Google"}

    def save_bookmarks_data(self):
        with open(self.bookmarks_file, 'w') as f: json.dump(self.bookmarks, f)

    def render_bookmarks_menu(self):
        self.bookmarks_menu.clear()
        for url, title in self.bookmarks.items():
            action = QAction(title, self)
            action.triggered.connect(lambda checked, u=url: self.current_browser().setUrl(QUrl(u)))
            self.bookmarks_menu.addAction(action)

    def add_bookmark(self):
        url = self.current_browser().url().toString()
        title = self.tabs.tabText(self.tabs.currentIndex())
        if url not in self.bookmarks:
            self.bookmarks[url] = title
            self.save_bookmarks_data()
            self.render_bookmarks_menu()

    # ---------------------------------------------------------------------
    # ENGINE & CORE TAB MANAGEMENT
    # ---------------------------------------------------------------------
    def current_browser(self) -> QWebEngineView:
        return self.tabs.currentWidget()

    def add_new_tab(self, qurl=None, title="New Tab"):
        if not qurl: qurl = QUrl("https://www.google.com")
        browser = QWebEngineView(self.profile)
        browser.setUrl(qurl)
        index = self.tabs.addTab(browser, title)
        self.tabs.setCurrentIndex(index)
        browser.urlChanged.connect(lambda url: self.update_url_bar(url, browser))
        browser.loadFinished.connect(lambda: self.update_tab_title(browser))

    def navigate_to_url(self):
        text = self.url_bar.text().strip()
        if not text: return
        if not text.startswith("http"):
            if "." in text and " " not in text: text = "https://" + text
            else: text = f"https://www.google.com/search?q={text}"
        self.current_browser().setUrl(QUrl(text))

    def update_url_bar(self, qurl, browser):
        if browser == self.current_browser(): self.url_bar.setText(qurl.toString())

    def update_tab_title(self, browser):
        index = self.tabs.indexOf(browser)
        if index != -1: self.tabs.setTabText(index, browser.page().title()[:20])

    def tab_changed(self, index):
        if index != -1: 
            self.url_bar.setText(self.current_browser().url().toString())

    def close_current_tab(self, index):
        if self.tabs.count() > 1:
            widget = self.tabs.widget(index)
            self.tabs.removeTab(index)
            widget.deleteLater()

    def navigate_back(self): self.current_browser().back()
    def navigate_forward(self): self.current_browser().forward()
    def navigate_reload(self): self.current_browser().reload()

    # ---------------------------------------------------------------------
    # DYNAMIC RUNTIME PLUGIN CORE (With Safety Flushes)
    # ---------------------------------------------------------------------
    def load_plugins(self):
        """Safely loads/reloads plugins, sweeping away old assets first to avoid duplication."""
        self.close_sidebar()
        
        # 1. Clean out old custom layout widgets appended by plugins from the sidebar stack
        while self.sidebar_stack.count() > 2:
            widget = self.sidebar_stack.widget(2)
            self.sidebar_stack.removeWidget(widget)
            widget.deleteLater()
            
        self.registered_plugin_widgets.clear()
        self.plugin_actions.clear()
        
        # 2. Re-establish clean menu foundation line
        self.rebuild_extensions_menu_structure()

        # 3. Look through directory and map modules cleanly
        loaded_count = 0
        if not os.path.exists(self.plugin_dir): return
        
        for filename in os.listdir(self.plugin_dir):
            if filename.endswith(".py"):
                path = os.path.join(self.plugin_dir, filename)
                try:
                    # Force Python interpreter to discard previous cached versions of this module code
                    module_name = filename[:-3]
                    if module_name in sys.modules:
                        del sys.modules[module_name]

                    spec = importlib.util.spec_from_file_location(module_name, path)
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    
                    if hasattr(module, "setup"): 
                        module.setup(self)
                        loaded_count += 1
                except Exception as e:
                    print(f"Error executing plugin build {filename}: {e}")
                    
        self.status_bar.showMessage(f"Engine environment active. Loaded {loaded_count} plugin(s).", 3000)

    def upload_py_plugin(self):
        file_path, _ = QFileDialog.getOpenFileName(self, "Upload Python Plugin", "", "Python Files (*.py)")
        if file_path:
            try:
                dest = os.path.join(self.plugin_dir, os.path.basename(file_path))
                shutil.copy(file_path, dest)
                self.load_plugins()
                QMessageBox.information(self, "Success", f"Plugin loaded successfully into workspace: {os.path.basename(file_path)}")
            except Exception as e:
                QMessageBox.critical(self, "Upload Error", f"Could not write target script to directory: {e}")

    def open_plugin_manager(self):
        """Launches a built-in interactive dashboard to permanently delete plugin files from the app folder."""
        dialog = QDialog(self)
        dialog.setWindowTitle("Manage Beryl Plugins")
        dialog.setMinimumSize(400, 300)
        dialog.setStyleSheet(self.styleSheet())
        
        layout = QVBoxLayout(dialog)
        lbl = QLabel("Installed System Extensions (.py):")
        layout.addWidget(lbl)
        
        list_widget = QListWidget()
        plugins = [f for f in os.listdir(self.plugin_dir) if f.endswith(".py")]
        list_widget.addItems(plugins)
        layout.addWidget(list_widget)
        
        btn_layout = QHBoxLayout()
        del_btn = QPushButton("Force Delete & Unload")
        del_btn.setStyleSheet("QPushButton { background-color: #551111; } QPushButton:hover { background-color: #cc2222; }")
        
        def delete_selected():
            selected_item = list_widget.currentItem()
            if not selected_item: return
            
            filename = selected_item.text()
            confirm = QMessageBox.question(
                dialog, "Confirm Force Removal", 
                f"Are you sure you want to permanently delete {filename} from the disk space?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )
            
            if confirm == QMessageBox.StandardButton.Yes:
                try:
                    target_file_path = os.path.join(self.plugin_dir, filename)
                    if os.path.exists(target_file_path):
                        os.remove(target_file_path)
                    
                    # Unload runtime immediately by forcing state re-index
                    self.load_plugins()
                    dialog.accept()
                    QMessageBox.information(self, "Deleted", f"Successfully removed {filename} completely.")
                except Exception as e:
                    QMessageBox.critical(dialog, "Error", f"Failed to complete disk erase routine: {e}")

        del_btn.clicked.connect(delete_selected)
        close_btn = QPushButton("Close")
        close_btn.clicked.connect(dialog.reject)
        
        btn_layout.addWidget(del_btn)
        btn_layout.addWidget(close_btn)
        layout.addLayout(btn_layout)
        dialog.exec()

    def closeEvent(self, event):
        if self.isFullScreen(): self.showNormal()
        self.save_layout_state()
        super().closeEvent(event)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle("Fusion") 
    window = PyroBrowser()
    window.show()
    sys.exit(app.exec())