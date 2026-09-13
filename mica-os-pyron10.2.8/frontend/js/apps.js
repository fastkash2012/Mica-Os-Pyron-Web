/** Built-in apps for Mica OS Pyron */

const BaseApps = [
    { name: 'Task Manager', icon: '📊', type: 'system' },
    { name: 'Jade Explorer', icon: '📂' },
    { name: 'Ruby Editor', icon: '✏️' },
    { name: 'Onyx Terminal', icon: '💻' },
    { name: 'Python Lab', icon: '🐍' },
    { name: 'Vynl', icon: '🎧' },
    { name: 'Pyro Browser', icon: '🌐' },
    { name: 'Creative Centre', icon: '🎨' },
    { name: 'Prism3D', icon: '🧊' },
    { name: 'Amber Settings', icon: '⚙️' },
    { name: 'Beryl Studio', icon: '🛠️' },
    { name: 'Package Manager', icon: '📦' },
    { name: 'Camera', icon: '📷' },
];

const AUDIO_EXT = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
const VIDEO_EXT = ['.mp4', '.webm', '.mkv', '.mov', '.avi'];
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
const CODE_EXT = ['.py', '.txt', '.md', '.json', '.js', '.html', '.css', '.mapp'];

function fileIcon(name, isDir) {
    if (isDir) return '📁';
    const ext = '.' + (name.split('.').pop() || '').toLowerCase();
    if (AUDIO_EXT.includes(ext)) return '🎵';
    if (VIDEO_EXT.includes(ext)) return '🎬';
    if (IMAGE_EXT.includes(ext)) return '🖼️';
    if (ext === '.py') return '🐍';
    if (ext === '.mapp') return '📦';
    return '📄';
}

function fmtSize(n) {
    if (!n) return '';
    if (n > 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n > 1024) return (n / 1024).toFixed(1) + ' KB';
    return n + ' B';
}

const Registry = {};

// ── Mica DiskFS save (override Windows downloads) ────────────────────
window.micaSaveBlob = async function(blob, filename, folder) {
    folder = folder || 'Downloads';
    filename = (filename || 'download.bin').replace(/[\\\/:*?"<>|]/g, '_');
    try { await API.mkdir(folder); } catch (e) {}
    const path = folder.replace(/\/$/, '') + '/' + filename;
    try {
        const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
        await API.upload(folder, file);
        toast('Saved to ' + path);
        if (window.__micaOpenExplorerAfterSave) {
            try { App.open('Jade Explorer', { path: folder }); } catch (e) {}
            window.__micaOpenExplorerAfterSave = false;
        }
        return path;
    } catch (e) {
        try {
            const b64 = await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(String(fr.result || '').split(',')[1] || '');
                fr.onerror = reject;
                fr.readAsDataURL(blob);
            });
            if (API.writeBinary) await API.writeBinary(path, b64);
            else await API.write(path, 'data:application/octet-stream;base64,' + b64);
            toast('Saved to ' + path);
            if (window.__micaOpenExplorerAfterSave) {
                try { App.open('Jade Explorer', { path: folder }); } catch (e2) {}
                window.__micaOpenExplorerAfterSave = false;
            }
            return path;
        } catch (e2) {
            toast(e2.message || e.message || 'Save failed');
            throw e2;
        }
    }
};
window.micaSaveDataUrl = async function(dataUrl, filename, folder) {
    folder = folder || 'Downloads';
    const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
    if (!m) {
        try { await API.mkdir(folder); } catch (e) {}
        const path = folder + '/' + filename;
        await API.write(path, dataUrl);
        toast('Saved to ' + path);
        try { App.open('Jade Explorer', { path: folder }); } catch (e) {}
        return path;
    }
    const bin = atob(m[2]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return micaSaveBlob(new Blob([arr], { type: m[1] }), filename, folder);
};
document.addEventListener('click', function(e) {
    const a = e.target && e.target.closest && e.target.closest('a[download]');
    if (!a) return;
    if (a.getAttribute('data-mica-windows') === '1') return;
    if (a.getAttribute('data-mica-force-windows') === '1') return;
    const href = a.getAttribute('href') || '';
    const fname = a.getAttribute('download') || 'download.bin';
    if (!href || href === '#') return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    (async () => {
        try {
            let blob;
            if (href.startsWith('data:')) {
                const m = href.match(/^data:([^;]+)(;base64)?,(.*)$/);
                if (m && m[2]) {
                    const bin = atob(m[3]);
                    const arr = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                    blob = new Blob([arr], { type: m[1] });
                } else if (m) {
                    blob = new Blob([decodeURIComponent(m[3])], { type: m[1] });
                } else blob = new Blob([href]);
            } else if (href.startsWith('blob:')) {
                blob = await (await fetch(href)).blob();
            } else {
                blob = await (await fetch(href, { headers: { Authorization: 'Bearer ' + (API.token || '') } })).blob();
            }
            const ext = (fname.split('.').pop() || '').toLowerCase();
            let folder = 'Downloads';
            if (['png','jpg','jpeg','gif','webp','bmp','svg','ico'].includes(ext)) folder = 'Pictures';
            else if (['mp3','wav','ogg','flac','m4a','aac'].includes(ext)) folder = 'Music';
            else if (['mp4','webm','mkv','mov','avi'].includes(ext)) folder = 'Videos';
            else if (['glb','gltf','obj','fbx','stl'].includes(ext)) folder = 'Documents';
            await micaSaveBlob(blob, fname, folder);
        } catch (err) { toast(err.message || 'Save to DiskFS failed'); }
    })();
}, true);
(function() {
    // Always prefer Jade over Windows pickers inside the OS
    const _origSave = window.showSaveFilePicker ? window.showSaveFilePicker.bind(window) : null;
    const _origOpen = window.showOpenFilePicker ? window.showOpenFilePicker.bind(window) : null;
    window.showSaveFilePicker = async function(opts) {
        if (window.__micaForceWindowsSave && _origSave) {
            window.__micaForceWindowsSave = false;
            return _origSave(opts);
        }
        const suggested = (opts && opts.suggestedName) || 'download.bin';
        return {
            name: suggested,
            async createWritable() {
                const chunks = [];
                return {
                    async write(data) {
                        if (data instanceof Blob) chunks.push(data);
                        else if (data && data.data) chunks.push(data.data);
                        else chunks.push(new Blob([data]));
                    },
                    async close() {
                        const blob = new Blob(chunks);
                        await new Promise((resolve, reject) => {
                            const ext = (suggested.split('.').pop() || '').toLowerCase();
                            let folder = 'Downloads';
                            if (['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext)) folder = 'Pictures';
                            else if (['txt','md','json','js','py','html','css','mapp'].includes(ext)) folder = 'Documents';
                            openJadeSaveDialog({
                                suggestedName: suggested,
                                folder,
                                title: 'Save',
                                onSave: async (fld, fname) => {
                                    try {
                                        await micaSaveBlob(blob, fname, fld || folder);
                                        resolve();
                                    } catch (e) { reject(e); }
                                }
                            });
                        });
                    },
                    async abort() {}
                };
            }
        };
    };
    if (window.showOpenFilePicker) {
        window.showOpenFilePicker = async function(opts) {
            if (window.__micaForceWindowsOpen && _origOpen) {
                window.__micaForceWindowsOpen = false;
                return _origOpen(opts);
            }
            // Jade open is async-callback based; return empty to discourage native use
            toast('Use Open in the app toolbar (Jade Explorer)');
            return [];
        };
    }
})();


const UserApps = [];

window.micaRunAppPy = async function(appId, code) {
    try { return await API.appsRunPy(appId, code || ''); }
    catch (e) { return { success: false, error: String(e.message || e), stdout: '', stderr: '' }; }
};
window.micaRunAppMain = async function(appId) {
    try { return await API.appsRunMain(appId); }
    catch (e) { return { success: false, error: String(e.message || e), stdout: '', stderr: '' }; }
};
/** Resolve packaged asset URL for a user app (layout.json / assets folder). */
window.micaAppAssetUrl = function(appId, path) {
    const p = String(path || '').replace(/^\/+/, '').replace(/^assets\//, '');
    const id = encodeURIComponent(appId || '');
    const file = encodeURIComponent(p);
    const tok = (typeof API !== 'undefined' && API.token) ? encodeURIComponent(API.token) : '';
    return '/api/apps/asset?id=' + id + '&path=' + file + (tok ? '&token=' + tok : '');
};


async function loadAndApplyPlugins() {
    try {
        const data = await API.pluginsEnabled();
        const scripts = data.scripts || [];
        // clear previous injected markers
        document.querySelectorAll('script[data-mplug]').forEach(s => s.remove());
        for (const p of scripts) {
            if (!p.js) continue;
            try {
                const s = document.createElement('script');
                s.setAttribute('data-mplug', p.id || p.name || 'plugin');
                s.textContent = p.js;
                document.body.appendChild(s);
                console.log('[mplug] loaded', p.name || p.id);
            } catch (e) {
                console.error('[mplug] failed', p.name, e);
            }
        }
        window.__MICA_PLUGINS_LOADED = scripts.map(p => p.id);
    } catch (e) {
        console.warn('loadAndApplyPlugins', e);
    }
}

/** Unsaved changes — real window, not a full-screen overlay lock-in */
function micaConfirmUnsaved(winId, typeName) {
    return new Promise(resolve => {
        try {
            const old = document.getElementById('mica-unsaved-dlg');
            if (old) old.remove();
            delete Registry['mica-unsaved-dlg'];
        } catch (e) {}

        const id = 'mica-unsaved-dlg';
        Registry[id] = { type: 'Unsaved Changes' };
        const win = document.createElement('div');
        win.id = id;
        win.className = 'window mica-unsaved-win';
        win.style.cssText = 'left:calc(50vw - 200px);top:22vh;width:400px;height:auto;min-height:160px;z-index:' + ((App.z || 10) + 50);
        App.z = (App.z || 10) + 50;
        const label = (typeName ? String(typeName) : 'This window').replace(/</g, '');

        // Build DOM with createElement so apostrophe in "Don't" cannot break markup
        const header = document.createElement('div');
        header.className = 'win-header';
        header.onmousedown = (e) => { try { dragWin(e, id); } catch (err) {} };
        header.innerHTML = '<span>Unsaved changes</span><div class="win-controls"><div class="win-btn close-btn" title="Cancel"></div></div>';
        header.querySelector('.close-btn').onclick = (e) => {
            e.stopPropagation();
            micaUnsavedChoice(id, 'cancel');
        };

        const body = document.createElement('div');
        body.className = 'win-content';
        body.style.padding = '16px 18px 14px';
        const p = document.createElement('p');
        p.style.cssText = 'margin:0 0 18px;opacity:0.8;font-size:13px;line-height:1.45;';
        p.textContent = label + ' has unsaved work. Save before closing?';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;';

        function mkBtn(text, choice, primary) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = text;
            if (primary) b.className = 'primary-btn';
            b.setAttribute('data-c', choice);
            b.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                micaUnsavedChoice(id, choice);
            });
            return b;
        }
        row.appendChild(mkBtn('Cancel', 'cancel', false));
        row.appendChild(mkBtn("Don't save", 'discard', false));
        row.appendChild(mkBtn('Save', 'save', true));
        body.appendChild(p);
        body.appendChild(row);
        win.appendChild(header);
        win.appendChild(body);

        document.getElementById('desktop').appendChild(win);
        try { if (typeof App !== 'undefined' && App.updateTray) App.updateTray(); } catch (e) {}

        window.__micaUnsavedResolve = resolve;
        window.__micaUnsavedFor = winId;
        win.onmousedown = () => { win.style.zIndex = ++App.z; };
    });
}

function micaUnsavedChoice(dlgId, choice) {
    const c = String(choice || 'cancel').toLowerCase();
    const resolve = window.__micaUnsavedResolve;
    const forId = window.__micaUnsavedFor;
    window.__micaUnsavedResolve = null;
    window.__micaUnsavedFor = null;

    // Always tear down the prompt window first
    try { delete Registry[dlgId]; } catch (e) {}
    try {
        const el = document.getElementById(dlgId);
        if (el) {
            el.style.display = 'none';
            if (el.parentNode) el.parentNode.removeChild(el);
            else el.remove();
        }
    } catch (e) {}
    try { if (typeof App !== 'undefined' && App.updateTray) App.updateTray(); } catch (e) {}

    // Resolve the promise so App.close can continue
    if (typeof resolve === 'function') {
        try { resolve(c); } catch (e) {}
    }

    // Hard fallback for Don't save: if promise path fails, still force-close the app
    if (c === 'discard' && forId) {
        setTimeout(() => {
            try {
                if (Registry[forId] || document.getElementById(forId)) {
                    try { if (App.markClean) App.markClean(forId); } catch (e) {}
                    App.close(forId, { force: true });
                }
            } catch (e) {}
        }, 0);
    }
}


function micaSoftReboot(reason) {
    toast(reason || 'Rebooting system…');
    setTimeout(() => location.reload(), 700);
}

async function refreshUserApps() {
    try {
        const data = await API.appsList();
        UserApps.length = 0;
        (data.user || []).forEach(a => UserApps.push(a));
        (data.user || []).forEach(a => {
            const exists = BaseApps.some(b => b.name === a.name || b.id === a.id);
            if (!exists) {
                BaseApps.push({
                    name: a.name,
                    icon: a.icon || '📦',
                    icon_data: a.icon_data || '',
                    id: a.id,
                    scope: 'user',
                    engine: a.engine || 'mapp',
                });
            } else {
                const b = BaseApps.find(x => x.name === a.name || x.id === a.id);
                if (b && a.icon_data) b.icon_data = a.icon_data;
            }
        });
    } catch (e) { console.warn('refreshUserApps', e); }
}

const App = {
    z: 10,
    pendingPath: null,

    open(type, filePath = null) {
        closeMenus();
        try { if (typeof micaPushRecentApp === 'function') micaPushRecentApp(type); } catch (e) {}
        if (filePath) {
            this.pendingPath = filePath;
            try {
                const p = (typeof filePath === 'string') ? filePath : (filePath.path || '');
                if (p && typeof micaPushRecentFile === 'function') micaPushRecentFile(p);
            } catch (e) {}
        }
        const pending = this.pendingPath;
        const id = 'win_' + Date.now();
        Registry[id] = { type, pending };
        const win = document.createElement('div');
        win.id = id;
        win.className = 'window';
        win.style.left = (10 + Math.random() * 8) + 'vw';
        win.style.top = (6 + Math.random() * 6) + 'vh';
        win.style.zIndex = ++this.z;
        win.style.opacity = '1';
        win.onmousedown = () => { win.style.zIndex = ++this.z; this.updateTray(); try { if (typeof pyroOnOsChromeChange === 'function') pyroOnOsChromeChange(); } catch (e) {} };

        win.innerHTML = `
            <div class="win-header" onmousedown="dragWin(event,'${id}')">
                <span>${type}</span>
                <div class="win-controls">
                    <div class="win-btn min-btn" title="Minimize" onclick="event.stopPropagation();App.minimize('${id}')"></div>
                    <div class="win-btn max-btn" title="Maximize" onclick="event.stopPropagation();App.toggleMaximize('${id}')"></div>
                    <div class="win-btn fs-btn" title="Fullscreen" onclick="event.stopPropagation();App.toggleTrueFullscreen('${id}')"></div>
                    <div class="win-btn close-btn" title="Close" onclick="event.stopPropagation();App.close('${id}')"></div>
                </div>
            </div>
            <div class="win-content" id="cont_${id}"></div>`;
        document.getElementById('desktop').appendChild(win);
        const usedPending = this.pendingPath;
        this.pendingPath = null;
        if (localStorage.getItem('mica_anim') !== '0' && (typeof getPerfMode !== 'function' || getPerfMode() !== 'performance')) {
            win.classList.add('win-loading');
            setTimeout(() => win.classList.remove('win-loading'), 420);
        }
        this.render(type, id, usedPending);
        this.updateTray();
        setTimeout(() => {
            const w = document.getElementById(id);
            if (!w || w.dataset.ctxBound) return;
            w.dataset.ctxBound = '1';
            const bar = w.querySelector('.win-header') || w.querySelector('.title-bar');
            if (bar) {
                bar.addEventListener('contextmenu', e => {
                    e.preventDefault(); e.stopPropagation();
                    if (typeof showMicaMenu !== 'function') return;
                    showMicaMenu(e.clientX, e.clientY, [
                        { label: '➖ Minimize', fn: () => App.minimize(id) },
                        { label: '⬜ Maximize', fn: () => App.toggleMaximize(id) },
                        { label: '⛶ Fullscreen', fn: () => App.toggleTrueFullscreen(id) },
                        { label: '✕ Close', fn: () => App.close(id) },
                        '---',
                        { label: '🔄 Refresh taskbar', fn: () => App.updateTray() },
                    ]);
                });
            }
            const cont = document.getElementById('cont_' + id);
            if (cont && type !== 'Jade Explorer') {
                cont.addEventListener('contextmenu', e => {
                    if (e.target.closest('input,textarea,button,a,canvas,select')) return;
                    e.preventDefault();
                    if (typeof showMicaMenu !== 'function') return;
                    showMicaMenu(e.clientX, e.clientY, [
                        { label: '🔄 Refresh window', fn: () => App.render(type, id) },
                        { label: '➖ Minimize', fn: () => App.minimize(id) },
                        { label: '✕ Close', fn: () => App.close(id) },
                    ]);
                });
            }
        }, 40);
    },

    close(id, opts) {
        opts = opts || {};
        // Never treat the unsaved prompt itself as a dirty close target
        if (id === 'mica-unsaved-dlg') {
            try { micaUnsavedChoice(id, 'cancel'); } catch (e) {}
            return;
        }
        const reg = Registry[id];
        const dirty = !!(reg && reg.dirty) || (document.getElementById(id) && document.getElementById(id).dataset.dirty === '1');
        if (dirty && !opts.force) {
            micaConfirmUnsaved(id, reg && reg.type).then(choice => {
                const c = String(choice || '').toLowerCase();
                if (c === 'cancel') return; // dialog already closed — keep app + dirty
                if (c === 'discard') {
                    // Don't save → dialog already closed; force-close the app (clear dirty first)
                    try { App.markClean(id); } catch (e) {}
                    App.close(id, { force: true });
                    return;
                }
                if (c === 'save') {
                    // Save → dialog already closed; open Jade / run save; clear dirty + close app on success
                    const saveFn = reg && reg.saveFn;
                    const doAfterSave = () => {
                        try { this.markClean(id); } catch (e) {}
                        try { if (typeof micaDockJump === 'function') micaDockJump('Jade Explorer'); } catch (e) {}
                        this.close(id, { force: true });
                    };
                    window.__micaAfterSaveClose = { id, fn: doAfterSave };
                    if (typeof saveFn === 'function') {
                        Promise.resolve(saveFn()).then((result) => {
                            if (result === 'pending' || result === false) return; // Jade dialog open — wait for onSave hook
                            window.__micaAfterSaveClose = null;
                            doAfterSave();
                        }).catch(() => { window.__micaAfterSaveClose = null; });
                        return;
                    }
                    try {
                        if (typeof openJadeSaveDialog === 'function') {
                            openJadeSaveDialog({
                                title: 'Save',
                                suggestedName: ((reg && reg.type) ? String(reg.type).replace(/\s+/g, '_') : 'Untitled') + '.txt',
                                onSave: async () => { doAfterSave(); }
                            });
                            return;
                        }
                    } catch (e) {}
                    window.__micaAfterSaveClose = null;
                    doAfterSave();
                    return;
                }
            });
            return;
        }
        delete Registry[id];
        const el = document.getElementById(id);
        const wasFs = el && (el.dataset.fs === '1' || el.classList.contains('true-fullscreen'));
        if (el && el.classList.contains('true-fullscreen')) {
            el.classList.remove('true-fullscreen');
            delete el.dataset.fs;
        }
        if (wasFs && typeof micaRestoreChrome === 'function') micaRestoreChrome();
        if (typeof updateDockAutohide === 'function') updateDockAutohide();
        this.updateTray();
        if (el) {
            el.style.transition = 'opacity 0.12s, transform 0.12s';
            el.style.opacity = '0';
            el.style.transform = 'scale(0.98)';
            setTimeout(() => { if (el.parentNode) el.remove(); }, 120);
            if (typeof micaSound === 'function') micaSound('close');
        }
        // Destroy native browser layers for this window
        try {
            if (reg && reg.type === 'Pyro Browser' && window.__pyroTabs && window.__pyroTabs[id]) {
                (window.__pyroTabs[id] || []).forEach(tab => {
                    try { if (tab.sid && window.micaNative) window.micaNative.browserClose(tab.sid); } catch (e) {}
                });
                delete window.__pyroTabs[id];
                if (window.__pyroActive) delete window.__pyroActive[id];
                if (window['__pyroLayout_' + id]) {
                    clearInterval(window['__pyroLayout_' + id]);
                    delete window['__pyroLayout_' + id];
                }
            }
        } catch (e) {}
        try { if (typeof pyroOnOsChromeChange === 'function') pyroOnOsChromeChange(); } catch (e) {}
    },

    markDirty(id, saveFn) {
        if (Registry[id]) {
            Registry[id].dirty = true;
            if (typeof saveFn === 'function') Registry[id].saveFn = saveFn;
        }
        const el = document.getElementById(id);
        if (el) el.dataset.dirty = '1';
        const title = el && el.querySelector('.win-header span');
        if (title && !title.textContent.startsWith('• ')) title.textContent = '• ' + title.textContent.replace(/^•\s*/, '');
    },

    markClean(id) {
        if (Registry[id]) {
            Registry[id].dirty = false;
            delete Registry[id].saveFn;
        }
        const el = document.getElementById(id);
        if (el) el.dataset.dirty = '0';
        const title = el && el.querySelector('.win-header span');
        if (title) title.textContent = title.textContent.replace(/^•\s*/, '');
    },

    minimize(id) {
        const w = document.getElementById(id);
        if (!w) return;
        if (w.dataset.fs === '1' || w.classList.contains('true-fullscreen')) {
            this.exitTrueFullscreen(id, { stayMaximized: true });
        }
        w.dataset.minimized = '1';
        const anim = localStorage.getItem('mica_anim') !== '0';
        if (anim) {
            w.classList.add('win-minimizing');
            setTimeout(() => {
                w.style.display = 'none';
                w.classList.remove('win-minimizing');
                w.style.opacity = '1';
                w.style.transform = '';
                this.updateTray();
                if (typeof updateDockAutohide === 'function') updateDockAutohide();
            }, 180);
        } else {
            w.style.display = 'none';
            this.updateTray();
        }
        if (typeof updateDockAutohide === 'function') updateDockAutohide();
        try { if (typeof pyroHideNativeForWindow === 'function') pyroHideNativeForWindow(id); } catch (e) {}
    },

    restoreWindow(id) {
        const w = document.getElementById(id);
        if (!w) return;
        w.dataset.minimized = '0';
        w.style.display = 'flex';
        w.style.opacity = '1';
        w.style.transform = '';
        w.classList.remove('is-dragging', 'win-minimizing');
        w.style.zIndex = ++this.z;
        if (w.classList.contains('maximized')) this.layoutWindowMax(w);
        const anim = localStorage.getItem('mica_anim') !== '0';
        if (anim) {
            w.classList.add('win-restoring');
            setTimeout(() => w.classList.remove('win-restoring'), 200);
        }
        this.updateTray();
        if (typeof updateDockAutohide === 'function') updateDockAutohide();
        try {
            if (Registry[id] && Registry[id].type === 'Pyro Browser' && typeof pyroSyncNative === 'function') {
                window['__pyroLastRect_' + id] = '';
                setTimeout(() => pyroSyncNative(id), 50);
            }
        } catch (e) {}
    },

    layoutWindowMax(win) {
        // Fill the desktop element. Classic taskbar already insets #desktop;
        // App Dock uses a full-viewport desktop so this also covers the dock gap.
        const desktop = document.getElementById('desktop');
        if (desktop && win.parentElement !== desktop) desktop.appendChild(win);
        win.style.position = 'absolute';
        win.style.left = '0';
        win.style.top = '0';
        win.style.right = 'auto';
        win.style.bottom = 'auto';
        win.style.width = '100%';
        win.style.height = '100%';
        win.style.borderRadius = '0';
        win.style.opacity = '1';
        win.style.transform = '';
        win.style.display = 'flex';
        win.classList.add('maximized');
        win.classList.remove('true-fullscreen', 'dock-fill');
        delete win.dataset.fs;
    },

    toggleMaximize(id) {
        const win = document.getElementById(id);
        if (!win) return;
        // Exit overlay-FS first, then apply maximize — never swallow the click
        if (win.dataset.fs === '1' || win.classList.contains('true-fullscreen')) {
            this.exitTrueFullscreen(id, { stayMaximized: true });
            return;
        }
        const anim = localStorage.getItem('mica_anim') !== '0';
        if (anim) win.classList.add('win-max-anim');
        if (win.classList.contains('maximized')) {
            win.style.left = win.dataset.oldLeft || '15vw';
            win.style.top = win.dataset.oldTop || '10vh';
            win.style.width = win.dataset.oldWidth || '720px';
            win.style.height = win.dataset.oldHeight || '520px';
            win.classList.remove('maximized', 'dock-fill', 'true-fullscreen');
            win.style.borderRadius = '';
            win.style.position = 'absolute';
            win.style.opacity = '1';
            win.style.transform = '';
        } else {
            win.dataset.oldLeft = win.style.left;
            win.dataset.oldTop = win.style.top;
            win.dataset.oldWidth = win.style.width || '720px';
            win.dataset.oldHeight = win.style.height || '520px';
            this.layoutWindowMax(win);
        }
        if (anim) setTimeout(() => win.classList.remove('win-max-anim'), 220);
        if (typeof micaRestoreChrome === 'function') micaRestoreChrome();
        if (typeof updateDockAutohide === 'function') updateDockAutohide();
        if (typeof micaSound === 'function') micaSound('whoosh');
        try {
            if (Registry[id] && Registry[id].type === 'Pyro Browser') {
                window['__pyroLastRect_' + id] = '';
                setTimeout(() => { if (typeof pyroSyncNative === 'function') pyroSyncNative(id); }, 60);
            }
        } catch (e) {}
    },

    toggleTrueFullscreen(id) {
        const win = document.getElementById(id);
        if (!win) return;
        if (win.dataset.fs === '1' || win.classList.contains('true-fullscreen')) {
            this.exitTrueFullscreen(id);
            return;
        }
        this.enterTrueFullscreen(id);
    },

    _fsHost() {
        return document.getElementById('mica-fs-layer') || document.body;
    },

    enterTrueFullscreen(id) {
        const win = document.getElementById(id);
        if (!win) return;
        // Only one overlay-FS window at a time
        document.querySelectorAll('.window.true-fullscreen').forEach(w => {
            if (w.id !== id) this.exitTrueFullscreen(w.id);
        });
        if (!win.classList.contains('maximized')) {
            win.dataset.oldLeft = win.style.left;
            win.dataset.oldTop = win.style.top;
            win.dataset.oldWidth = win.style.width || '720px';
            win.dataset.oldHeight = win.style.height || '520px';
        }
        win.dataset.fs = '1';
        win.dataset.minimized = '0';
        win.classList.add('true-fullscreen');
        win.classList.remove('maximized', 'dock-fill');
        win.style.transform = '';
        win.style.opacity = '1';
        win.style.display = 'flex';
        win.style.position = 'fixed';
        win.style.left = '0';
        win.style.top = '0';
        win.style.width = '100vw';
        win.style.height = '100vh';
        win.style.borderRadius = '0';
        win.style.zIndex = '400000';
        // Reparent out of #desktop so overflow:hidden / z-index:1 cannot clip or bury it
        try { this._fsHost().appendChild(win); } catch (e) {}
        document.body.classList.add('mica-true-fs');
        if (typeof updateDockAutohide === 'function') updateDockAutohide();
        if (typeof micaSound === 'function') micaSound('fullscreen');
    },

    exitTrueFullscreen(id, opts) {
        opts = opts || {};
        const desktop = document.getElementById('desktop');
        const win = id ? document.getElementById(id) : document.querySelector('.window.true-fullscreen');
        document.querySelectorAll('.window.true-fullscreen').forEach(w => {
            w.classList.remove('true-fullscreen');
            delete w.dataset.fs;
            w.style.borderRadius = '';
            w.style.opacity = '1';
            w.style.transform = '';
            w.style.position = 'absolute';
            if (desktop && w.parentElement !== desktop) {
                try { desktop.appendChild(w); } catch (e) {}
            }
        });
        document.body.classList.remove('mica-true-fs');
        if (typeof micaRestoreChrome === 'function') micaRestoreChrome();
        if (win) {
            win.style.display = win.dataset.minimized === '1' ? 'none' : 'flex';
            win.style.opacity = '1';
            win.style.zIndex = ++this.z;
            if (win.dataset.minimized === '1') {
                /* leave hidden */
            } else if (opts.stayMaximized) {
                this.layoutWindowMax(win);
            } else {
                win.classList.remove('maximized', 'dock-fill');
                win.style.left = win.dataset.oldLeft || '15vw';
                win.style.top = win.dataset.oldTop || '10vh';
                win.style.width = win.dataset.oldWidth || '720px';
                win.style.height = win.dataset.oldHeight || '520px';
            }
        }
        if (typeof updateDockAutohide === 'function') updateDockAutohide();
        if (typeof micaSound === 'function') micaSound('whoosh');
        this.updateTray();
    },

    perfMode() {
        Object.keys(Registry).forEach(id => this.close(id));
        toast('Windows cleared');
    },

    updateTray() {
        const tray = document.getElementById('tb-apps');
        if (!tray) return;
        Object.keys(Registry).forEach(id => {
            const el = document.getElementById(id);
            if (!el || !el.isConnected) delete Registry[id];
        });
        const pinned = (typeof getPinnedApps === 'function') ? getPinnedApps() : [];
        const running = Object.keys(Registry).filter(id => id !== 'mica-unsaved-dlg');
        const runningTypes = running.map(id => Registry[id] && Registry[id].type).filter(Boolean);
        const order = [];
        pinned.forEach(name => { if (!order.includes(name)) order.push(name); });
        runningTypes.forEach(name => { if (!order.includes(name)) order.push(name); });
        try {
            if (typeof getDockMode === 'function' && getDockMode()) {
                ['Jade Explorer', 'Ruby Editor', 'Pyro Browser'].forEach(n => {
                    if (!order.includes(n) && order.length < 3) order.push(n);
                });
                if (!order.includes('Jade Explorer')) order.unshift('Jade Explorer');
            }
        } catch (e) {}

        tray.innerHTML = order.map(type => {
            const meta = BaseApps.find(a => a.name === type) || { name: type, icon: '🪟' };
            let iconHtml;
            if (meta.icon_data) {
                iconHtml = '<img src="' + meta.icon_data + '" alt="" style="width:20px;height:20px;object-fit:contain;border-radius:4px;">';
            } else {
                iconHtml = '<span style="font-size:18px;line-height:1;">' + (meta.icon || '🪟') + '</span>';
            }
            const ids = running.filter(id => Registry[id] && Registry[id].type === type);
            const winId = ids[0];
            const hidden = ids.length > 0 && ids.every(id => {
                const w = document.getElementById(id);
                return w && (w.style.display === 'none' || w.dataset.minimized === '1');
            });
            const isActive = ids.some(id => {
                const w = document.getElementById(id);
                return w && w.style.display !== 'none' && w.dataset.minimized !== '1' && parseInt(w.style.zIndex || '0', 10) === this.z;
            });
            const isRun = ids.length > 0;
            const multi = ids.length > 1;
            const cls = 'tb-app-btn' + (isRun ? ' running' : '') + (isActive ? ' active' : '') + (hidden ? ' minimized' : '') + (pinned.includes(type) ? ' pinned' : '') + (multi ? ' multi' : '');
            const safeType = String(type).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const click = isRun
                ? (multi
                    ? "tbShowInstanceFlyout(event,'" + safeType + "');"
                    : "App.restoreWindow('" + winId + "');setTimeout(()=>App.updateTray(),40);")
                : "App.open('" + safeType + "');";
            const badge = multi ? '<span class="tb-inst-badge">' + ids.length + '</span>' : '';
            const closeBtn = (isRun && !multi)
                ? '<div class="tb-quick-close" title="Close" onclick="event.stopPropagation();App.close(\'' + winId + '\')">✕</div>'
                : '';
            const hover = multi ? (' onmouseenter="tbShowInstanceFlyout(event,\'' + safeType + '\',true)" ') : '';
            return '<div class="' + cls + '" data-app-type="' + safeType + '" title="' + type + (multi ? (' (' + ids.length + ')') : '') + '" onclick="' + click + '"' + hover + ' oncontextmenu="event.preventDefault();event.stopPropagation();tbAppContext(event,\'' + safeType + '\')">' +
                iconHtml + badge + closeBtn + '</div>';
        }).join('');
        if (typeof updateDockAutohide === 'function') updateDockAutohide();
        const visFs = [...document.querySelectorAll('.window.true-fullscreen')].some(w => w.dataset.minimized !== '1' && w.style.display !== 'none');
        if (!visFs && typeof micaRestoreChrome === 'function') micaRestoreChrome();
    },

    refreshTray() {
        this.updateTray();
    },

    async render(type, id, pending = null) {
        const c = document.getElementById('cont_' + id);
        if (pending) App.pendingPath = pending;
        if (type === 'Jade Explorer') return renderExplorer(id, c);
        if (type === 'Ruby Editor') return renderEditor(id, c);
        if (type === 'Onyx Terminal') return renderTerminal(id, c);
        if (type === 'Python Lab') return renderPythonLab(id, c);
        if (type === 'Vynl') return renderVynl(id, c);
        if (type === 'Pyro Browser') return renderPyroBrowser(id, c);
        if (type === 'Task Manager') return renderTaskManager(id, c);
        if (type === 'Creative Centre') return renderCreativeCentre(id, c);
        if (type === 'Prism3D') return renderPrism3D(id, c);
        if (type === 'Amber Settings') return renderSettings(id, c);
        if (type === 'Beryl Studio') return renderStudio(id, c);
        if (type === 'Package Manager') return renderPackageManager(id, c);
        if (type === 'Camera') return renderCamera(id, c);
        // Disk / user .mapp (v1 + v2)
        const ua = UserApps.find(a => a.name === type || a.id === type)
            || BaseApps.find(a => a.name === type && a.scope === 'user');
        if (ua && (ua.engine === 'mapp' || ua.scope === 'user')) {
            try {
                const app = await API.appsGet(ua.id || ua.name, 'user');
                c.innerHTML = '<iframe style="width:100%;height:100%;border:none;background:#1a1a1e;"></iframe>';
                c.querySelector('iframe').srcdoc = app.srcdoc || app.html || '';
            } catch (e) {
                c.innerHTML = `<div style="padding:30px;color:#ff5f56;">Failed to load app: ${e.message}</div>`;
            }
            return;
        }
        let custom = JSON.parse(localStorage.getItem('mica_custom_apps') || '[]');
        const match = custom.find(a => a.name === type);
        if (match) {
            c.innerHTML = '<iframe style="width:100%;height:100%;border:none;background:#1a1a1e;"></iframe>';
            c.querySelector('iframe').srcdoc = match.srcdoc || match.html || '';
            return;
        }
        c.innerHTML = `<div style="padding:30px;text-align:center;opacity:0.6;">${type}</div>`;
    },
};

// ── Enhanced Explorer ────────────────────────────────────────────────


// ── Jade Explorer (disk FS + host drives) ────────────────────────────

let JadeClipboard = { mode: null, path: null, name: null, scope: 'user', is_dir: false }; // mode: copy|cut
function pathBase(p) {
    const s = String(p || '').replaceAll(String.fromCharCode(92), '/');
    const parts = s.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : s;
}
function pathNorm(p) {
    return String(p || '').replaceAll(String.fromCharCode(92), '/');
}



/** Liquid-glass multi-instance previews with live window snapshots */
function tbHideInstanceFlyout() {
    clearTimeout(window.__tbFlyHideT);
    clearTimeout(window.__tbFlyShowT);
    const el = document.getElementById('tb-instance-flyout');
    if (el) {
        el.classList.remove('open');
        setTimeout(() => { try { el.remove(); } catch (e) {} }, 140);
    }
    window.__tbFlyType = null;
}
function tbScheduleHideFlyout(ms) {
    clearTimeout(window.__tbFlyHideT);
    window.__tbFlyHideT = setTimeout(() => {
        const fly = document.getElementById('tb-instance-flyout');
        const overBtn = document.querySelector('.tb-app-btn.multi:hover');
        const overFly = fly && fly.matches(':hover');
        if (!overBtn && !overFly) tbHideInstanceFlyout();
    }, ms == null ? 220 : ms);
}
/** Build a live scaled snapshot of a window into a host element */
function tbFillLivePreview(host, winId) {
    if (!host) return;
    const win = document.getElementById(winId);
    host.innerHTML = '';
    if (!win) {
        host.innerHTML = '<div class="tb-ic-empty">?</div>';
        return;
    }
    const mini = win.style.display === 'none' || win.dataset.minimized === '1';
    if (mini) {
        host.innerHTML = '<div class="tb-ic-empty">—</div>';
        host.classList.add('is-min');
        return;
    }
    try {
        const stage = document.createElement('div');
        stage.className = 'tb-ic-stage';
        const clone = win.cloneNode(true);
        clone.id = '';
        clone.classList.add('tb-ic-clone');
        clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
        clone.querySelectorAll('script').forEach(n => n.remove());
        // Freeze interactive bits
        clone.style.pointerEvents = 'none';
        clone.style.position = 'absolute';
        clone.style.left = '0';
        clone.style.top = '0';
        clone.style.margin = '0';
        clone.style.transformOrigin = 'top left';
        clone.style.boxShadow = 'none';
        clone.style.zIndex = '1';
        // Match natural size then scale into card
        const ww = Math.max(win.offsetWidth || 720, 320);
        const wh = Math.max(win.offsetHeight || 480, 220);
        clone.style.width = ww + 'px';
        clone.style.height = wh + 'px';
        const cardW = 168;
        const cardH = 100;
        const scale = Math.min(cardW / ww, cardH / wh);
        clone.style.transform = 'scale(' + scale + ')';
        stage.style.width = cardW + 'px';
        stage.style.height = cardH + 'px';
        stage.appendChild(clone);
        host.appendChild(stage);
    } catch (e) {
        host.innerHTML = '<div class="tb-ic-empty">▦</div>';
    }
}
function tbShowInstanceFlyout(e, type, fromHover) {
    if (e) { try { e.preventDefault(); e.stopPropagation(); } catch (err) {} }
    clearTimeout(window.__tbFlyHideT);
    const ids = Object.keys(Registry).filter(id => Registry[id] && Registry[id].type === type && id !== 'mica-unsaved-dlg');
    if (ids.length <= 1) {
        if (ids[0] && !fromHover) App.restoreWindow(ids[0]);
        return;
    }
    const existing = document.getElementById('tb-instance-flyout');
    if (existing && window.__tbFlyType === type) {
        existing.classList.add('open');
        return;
    }
    tbHideInstanceFlyout();
    window.__tbFlyType = type;
    const fly = document.createElement('div');
    fly.id = 'tb-instance-flyout';
    fly.className = 'tb-instance-flyout';
    fly.innerHTML =
      '<div class="tb-fly-head"><span class="tb-fly-title">' + String(type).replace(/</g, '') + '</span>' +
      '<span class="tb-fly-count">' + ids.length + '</span></div>' +
      '<div class="tb-fly-row"></div>';
    document.body.appendChild(fly);
    const row = fly.querySelector('.tb-fly-row');
    ids.forEach((id, idx) => {
        const w = document.getElementById(id);
        const title = ((w && w.querySelector('.win-header span')) ? w.querySelector('.win-header span').textContent : type).replace(/</g, '');
        const mini = w && (w.style.display === 'none' || w.dataset.minimized === '1');
        const card = document.createElement('div');
        card.className = 'tb-instance-card' + (mini ? ' is-min' : '');
        card.setAttribute('data-win', id);
        card.innerHTML =
          '<div class="tb-ic-close" data-close="' + id + '" title="Close" role="button">✕</div>' +
          '<div class="tb-ic-preview" data-preview="' + id + '"></div>' +
          '<div class="tb-ic-title">' + title + (ids.length > 1 ? ' · ' + (idx + 1) : '') + (mini ? ' · minimized' : '') + '</div>';
        row.appendChild(card);
        tbFillLivePreview(card.querySelector('.tb-ic-preview'), id);
    });

    const btn = (e && e.currentTarget) || document.querySelector('.tb-app-btn[data-app-type="' + (window.CSS && CSS.escape ? CSS.escape(type) : type) + '"]');
    const br = btn ? btn.getBoundingClientRect() : { left: 80, top: window.innerHeight - 60, width: 48, height: 48, bottom: window.innerHeight - 12 };
    // Position after layout
    requestAnimationFrame(() => {
        const fr = fly.getBoundingClientRect();
        let left = br.left + br.width / 2 - fr.width / 2;
        left = Math.max(10, Math.min(left, window.innerWidth - fr.width - 10));
        let top = br.top - fr.height - 14;
        if (top < 10) top = Math.min(br.bottom + 10, window.innerHeight - fr.height - 10);
        fly.style.left = left + 'px';
        fly.style.top = top + 'px';
        fly.classList.add('open');
    });

    // Use mousedown so close fires before any mouseleave hide
    fly.addEventListener('mousedown', (ev) => {
        const closeEl = ev.target.closest('.tb-ic-close');
        if (closeEl) {
            ev.preventDefault();
            ev.stopPropagation();
            const wid = closeEl.getAttribute('data-close');
            clearTimeout(window.__tbFlyHideT);
            if (wid && typeof App !== 'undefined') {
                try { App.close(wid); } catch (err) {}
            }
            setTimeout(() => {
                try { App.updateTray(); } catch (err) {}
                const still = Object.keys(Registry).filter(id => Registry[id] && Registry[id].type === type && id !== 'mica-unsaved-dlg');
                if (still.length > 1) {
                    tbHideInstanceFlyout();
                    const b = document.querySelector('.tb-app-btn.multi[data-app-type="' + String(type).replace(/"/g, '') + '"]');
                    if (b) tbShowInstanceFlyout({ currentTarget: b }, type, true);
                } else {
                    tbHideInstanceFlyout();
                }
            }, 80);
            return;
        }
        const card = ev.target.closest('.tb-instance-card');
        if (card && !ev.target.closest('.tb-ic-close')) {
            const wid = card.getAttribute('data-win');
            tbHideInstanceFlyout();
            if (wid) {
                App.restoreWindow(wid);
                setTimeout(() => App.updateTray(), 40);
            }
        }
    }, true);

    fly.onmouseenter = () => clearTimeout(window.__tbFlyHideT);
    fly.onmouseleave = () => tbScheduleHideFlyout(200);
    if (btn && !btn.dataset.flyBound) {
        btn.dataset.flyBound = '1';
        btn.addEventListener('mouseleave', () => tbScheduleHideFlyout(200));
    }
}
window.tbShowInstanceFlyout = tbShowInstanceFlyout;
window.tbHideInstanceFlyout = tbHideInstanceFlyout;
if (!window.__tbFlyClickBound) {
    window.__tbFlyClickBound = true;
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#tb-instance-flyout') && !e.target.closest('.tb-app-btn.multi')) tbHideInstanceFlyout();
    }, true);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') tbHideInstanceFlyout();
    });
}

async function renderExplorer(id, c) {
    c.innerHTML = `
    <div class="jade-win10" style="display:flex;flex-direction:column;height:100%;overflow:hidden;background:#1f1f23;color:#e8e8e8;font-family:'Segoe UI',system-ui,sans-serif;">
      <!-- Compact toolbar with dropdowns -->
      <div class="jade-toolbar">
        <div class="jade-tb-left">
          <button class="jade-nav-btn" onclick="exNavBack('${id}')" title="Back">◀</button>
          <button class="jade-nav-btn" onclick="exNavForward('${id}')" title="Forward">▶</button>
          <button class="jade-nav-btn" onclick="exUp('${id}')" title="Up">⬆</button>
          <div class="jade-dd">
            <button class="jade-dd-btn" onclick="exToggleDd('${id}','home')">Home ▾</button>
            <div class="jade-dd-menu" id="ex_dd_home_${id}">
              <div class="jade-dd-item" onclick="exGo('${id}','user','');exCloseDds('${id}')">🏠 Mica OS</div>
              <div class="jade-dd-item" onclick="exGo('${id}','user','Desktop');exCloseDds('${id}')">🖥 Desktop</div>
              <div class="jade-dd-item" onclick="exGo('${id}','user','Downloads');exCloseDds('${id}')">⬇ Downloads</div>
              <div class="jade-dd-item" onclick="exGo('${id}','user','Documents');exCloseDds('${id}')">📄 Documents</div>
              <div class="jade-dd-item" onclick="exGo('${id}','user','Pictures');exCloseDds('${id}')">🖼 Pictures</div>
              <div class="jade-dd-item" onclick="exGo('${id}','user','Music');exCloseDds('${id}')">🎵 Music</div>
              <div class="jade-dd-item" onclick="exGo('${id}','user','Videos');exCloseDds('${id}')">🎬 Videos</div>
              <div class="jade-dd-item" onclick="exGo('${id}','user','Apps');exCloseDds('${id}')">📦 Apps</div>
            </div>
          </div>
          <div class="jade-dd">
            <button class="jade-dd-btn" onclick="exToggleDd('${id}','org')">Organize ▾</button>
            <div class="jade-dd-menu" id="ex_dd_org_${id}">
              <div class="jade-dd-item" onclick="exClipboardAction('${id}','cut');exCloseDds('${id}')">✂ Cut</div>
              <div class="jade-dd-item" onclick="exClipboardAction('${id}','copy');exCloseDds('${id}')">📄 Copy</div>
              <div class="jade-dd-item" onclick="exPaste('${id}');exCloseDds('${id}')">📋 Paste</div>
              <div class="jade-dd-sep"></div>
              <div class="jade-dd-item" onclick="exNewFolder('${id}');exCloseDds('${id}')">📁 New folder</div>
              <div class="jade-dd-item" onclick="exToolbarRename('${id}');exCloseDds('${id}')">Rename</div>
              <div class="jade-dd-item danger" onclick="exToolbarDelete('${id}');exCloseDds('${id}')">Delete</div>
            </div>
          </div>
          <div class="jade-dd">
            <button class="jade-dd-btn" onclick="exToggleDd('${id}','xfer')">Transfer ▾</button>
            <div class="jade-dd-menu" id="ex_dd_xfer_${id}">
              <div class="jade-dd-item" onclick="document.getElementById('ex_up_${id}').click();exCloseDds('${id}')">⬆ Import from PC</div>
              <div class="jade-dd-item" onclick="exToolbarDownload('${id}');exCloseDds('${id}')">⬇ Export to PC</div>
              <div class="jade-dd-item" onclick="exOpenSaveDialog('${id}');exCloseDds('${id}')">💾 Save As…</div>
            </div>
          </div>
          <input type="file" id="ex_up_${id}" class="native-uploader" data-jade-bypass="1" multiple hidden onchange="exUpload(event,'${id}')">
          <div class="jade-dd">
            <button class="jade-dd-btn" onclick="exToggleDd('${id}','view')">View ▾</button>
            <div class="jade-dd-menu" id="ex_dd_view_${id}">
              <div class="jade-dd-item" onclick="exSetView('${id}','details');exCloseDds('${id}')">☰ Details</div>
              <div class="jade-dd-item" onclick="exSetView('${id}','icons');exCloseDds('${id}')">▦ Icons</div>
              <div class="jade-dd-item" onclick="exRefresh('${id}');exCloseDds('${id}')">🔄 Refresh</div>
            </div>
          </div>
        </div>
        <div class="jade-tb-right">
          <button class="jade-nav-btn" onclick="exRefresh('${id}')" title="Refresh">🔄</button>
        </div>
      </div>
      <!-- Address + search -->
      <div class="jade-addrbar">
        <div class="jade-addr-wrap">
          <span class="jade-addr-ico">📂</span>
          <input id="ex_addr_${id}" class="jade-addr-input" placeholder="Address" onkeydown="if(event.key==='Enter')exAddressGo('${id}')">
        </div>
        <div class="jade-search-wrap">
          <input id="ex_search_${id}" class="jade-search-input" placeholder="Search" onkeydown="if(event.key==='Enter')exSearch('${id}')">
          <button class="jade-search-btn" onclick="exSearch('${id}')">🔍</button>
        </div>
      </div>
      <!-- Body -->
      <div style="flex:1;display:flex;min-height:0;">
        <div class="jade-sidebar">
          <div class="jade-side-sec">Quick access</div>
          <div class="folder-item jade-side" onclick="exGo('${id}','user','Desktop')" ondragover="exSideDragOver(event,'${id}','user','Desktop')" ondragleave="exSideDragLeave(event)" ondrop="exSideDrop(event,'${id}','user','Desktop')">🖥 Desktop</div>
          <div class="folder-item jade-side" onclick="exGo('${id}','user','Downloads')" ondragover="exSideDragOver(event,'${id}','user','Downloads')" ondragleave="exSideDragLeave(event)" ondrop="exSideDrop(event,'${id}','user','Downloads')">⬇ Downloads</div>
          <div class="folder-item jade-side" onclick="exGo('${id}','user','Documents')" ondragover="exSideDragOver(event,'${id}','user','Documents')" ondragleave="exSideDragLeave(event)" ondrop="exSideDrop(event,'${id}','user','Documents')">📄 Documents</div>
          <div class="folder-item jade-side" onclick="exGo('${id}','user','Pictures')" ondragover="exSideDragOver(event,'${id}','user','Pictures')" ondragleave="exSideDragLeave(event)" ondrop="exSideDrop(event,'${id}','user','Pictures')">🖼 Pictures</div>
          <div class="folder-item jade-side" onclick="exGo('${id}','user','Music')" ondragover="exSideDragOver(event,'${id}','user','Music')" ondragleave="exSideDragLeave(event)" ondrop="exSideDrop(event,'${id}','user','Music')">🎵 Music</div>
          <div class="folder-item jade-side" onclick="exGo('${id}','user','Videos')" ondragover="exSideDragOver(event,'${id}','user','Videos')" ondragleave="exSideDragLeave(event)" ondrop="exSideDrop(event,'${id}','user','Videos')">🎬 Videos</div>
          <div class="jade-side-sec">Mica OS</div>
          <div class="folder-item jade-side" onclick="exGo('${id}','user','')" ondragover="exSideDragOver(event,'${id}','user','')" ondragleave="exSideDragLeave(event)" ondrop="exSideDrop(event,'${id}','user','')">🔐 Mica OS</div>
          <div class="folder-item jade-side" onclick="exGo('${id}','user','Apps')">📦 Apps</div>
          <div class="jade-side-sec">This PC</div>
          <div id="ex_drives_${id}" style="font-size:12px;opacity:0.7;padding:0 8px;">Loading…</div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;min-width:0;">
          <div id="ex_list_${id}" class="jade-list-details" style="flex:1;overflow:auto;padding:0;"
               ondragover="exDragOver(event)" ondrop="exDrop(event,'${id}')"
               oncontextmenu="if(event.target===this||event.target.id==='ex_list_${id}')exEmptyContextMenu(event,'${id}')"></div>
          <div id="ex_status_${id}" class="jade-statusbar">
            <span id="ex_status_left_${id}">0 items</span>
            <span id="ex_clip_${id}"></span>
          </div>
        </div>
      </div>
    </div>
    <style>
      .jade-toolbar{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:3px 6px;background:#2b2b30;border-bottom:1px solid #3a3a40;min-height:32px;}
      .jade-tb-left{display:flex;align-items:center;gap:4px;flex-wrap:wrap;}
      .jade-tb-right{display:flex;gap:4px;}
      .jade-nav-btn{background:#333;border:1px solid #444;color:#ccc;width:26px;height:26px;border-radius:3px;cursor:pointer;font-size:11px;padding:0;}
      .jade-nav-btn:hover{background:#3d3d44;}
      .jade-dd{position:relative;}
      .jade-dd-btn{background:#333338;border:1px solid #444;color:#eee;padding:3px 8px;border-radius:3px;cursor:pointer;font-size:11px;font-family:inherit;height:26px;}
      .jade-dd-btn:hover{background:#3d3d44;}
      .jade-dd-menu{display:none;position:absolute;top:100%;left:0;z-index:50;min-width:160px;background:#2b2b30;border:1px solid #444;border-radius:4px;box-shadow:0 8px 24px rgba(0,0,0,0.4);padding:4px 0;margin-top:2px;}
      .jade-dd-menu.open{display:block;}
      .jade-dd-item{padding:6px 12px;cursor:pointer;font-size:12px;white-space:nowrap;}
      .jade-dd-item:hover{background:rgba(0,120,212,0.25);}
      .jade-dd-item.danger{color:#ff8a80;}
      .jade-dd-sep{height:1px;background:#444;margin:4px 0;}
      .jade-addrbar{display:flex;align-items:center;gap:6px;padding:4px 6px;background:#25252a;border-bottom:1px solid #3a3a40;}
      .jade-addr-wrap{flex:1;display:flex;align-items:center;background:#1a1a1e;border:1px solid #3a3a40;border-radius:3px;padding:0 6px;min-width:0;height:26px;}
      .jade-addr-ico{opacity:0.5;margin-right:4px;font-size:12px;}
      .jade-addr-input{flex:1;border:none;background:transparent;color:#eee;padding:3px 0;outline:none;font-size:12px;}
      .jade-search-wrap{display:flex;align-items:center;background:#1a1a1e;border:1px solid #3a3a40;border-radius:3px;padding:0 6px;width:150px;height:26px;}
      .jade-search-input{flex:1;border:none;background:transparent;color:#eee;padding:3px 0;outline:none;font-size:11px;}
      .jade-search-btn{border:none;background:transparent;color:#aaa;cursor:pointer;font-size:12px;}
      .jade-sidebar{width:168px;background:#222226;border-right:1px solid #3a3a40;overflow:auto;padding:6px 0;flex-shrink:0;font-size:12px;}
      .jade-side-sec{font-size:10px;font-weight:600;opacity:0.4;padding:8px 10px 3px;text-transform:uppercase;letter-spacing:0.5px;}
      .folder-item.jade-side{padding:5px 10px;cursor:pointer;border-left:3px solid transparent;}
      .folder-item.jade-side:hover{background:rgba(255,255,255,0.06);}
      .jade-statusbar{padding:2px 10px;font-size:11px;background:#1a1a1e;border-top:1px solid #3a3a40;opacity:0.75;display:flex;justify-content:space-between;}
      .jade-list-details .file-item{display:grid;grid-template-columns:28px 1fr 90px 70px;gap:8px;align-items:center;padding:3px 12px;border-bottom:1px solid rgba(255,255,255,0.04);cursor:default;border-radius:0;background:transparent;border:none;margin:0;}
      .jade-list-details .file-item:hover{background:rgba(0,120,212,0.15);}
      .jade-list-details .file-item.selected{background:rgba(0,120,212,0.28);}
      .jade-list-icons{display:flex;flex-wrap:wrap;gap:8px;padding:12px !important;}
      .jade-list-icons .file-item{width:96px;flex-direction:column;text-align:center;padding:10px 6px;border-radius:6px;display:flex !important;grid-template-columns:none;}
    </style>`;
    window['ex_scope_' + id] = 'user';
    window['ex_path_' + id] = '';
    window['ex_view_' + id] = 'details';
    window['ex_hist_' + id] = [{scope:'user', path:''}];
    window['ex_hist_i_' + id] = 0;
    try {
        const { roots } = await API.hostRoots();
        const el = document.getElementById('ex_drives_' + id);
        if (el) {
            el.innerHTML = (roots || []).map(r => {
                const rp = String(r.path).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                return `<div class="folder-item jade-side" onclick="exGo('${id}','host','${rp}')"
                  ondragover="exSideDragOver(event,'${id}','host','${rp}')" ondragleave="exSideDragLeave(event)"
                  ondrop="exSideDrop(event,'${id}','host','${rp}')">💾 ${r.name}</div>`;
            }).join('') || '<span style="opacity:0.5;padding:0 12px;">No drives</span>';
        }
    } catch (e) {
        const el = document.getElementById('ex_drives_' + id);
        if (el) el.innerHTML = '<span style="opacity:0.5;padding:0 12px;">Host FS N/A</span>';
    }
    if (!window.__jadeDdBound) {
        window.__jadeDdBound = true;
        document.addEventListener('mousedown', function (ev) {
            if (!ev.target.closest('.jade-dd')) {
                document.querySelectorAll('.jade-dd-menu.open').forEach(m => m.classList.remove('open'));
            }
        }, true);
    }
    await exLoad(id);
}

function exToggleDd(id, name) {
    const menu = document.getElementById('ex_dd_' + name + '_' + id);
    if (!menu) return;
    const was = menu.classList.contains('open');
    document.querySelectorAll('.jade-dd-menu.open').forEach(m => m.classList.remove('open'));
    if (!was) menu.classList.add('open');
}
function exCloseDds(id) {
    document.querySelectorAll('.jade-dd-menu.open').forEach(m => m.classList.remove('open'));
}

function exSetView(id, mode) {
    window['ex_view_' + id] = mode;
    const list = document.getElementById('ex_list_' + id);
    if (!list) return;
    list.classList.toggle('jade-list-details', mode === 'details');
    list.classList.toggle('jade-list-icons', mode === 'icons');
    exLoad(id);
}
function exNavBack(id) {
    let i = window['ex_hist_i_' + id] || 0;
    const h = window['ex_hist_' + id] || [];
    if (i <= 0) return;
    i -= 1;
    window['ex_hist_i_' + id] = i;
    const e = h[i];
    window['ex_scope_' + id] = e.scope;
    window['ex_path_' + id] = e.path;
    exLoad(id);
}
function exNavForward(id) {
    let i = window['ex_hist_i_' + id] || 0;
    const h = window['ex_hist_' + id] || [];
    if (i >= h.length - 1) return;
    i += 1;
    window['ex_hist_i_' + id] = i;
    const e = h[i];
    window['ex_scope_' + id] = e.scope;
    window['ex_path_' + id] = e.path;
    exLoad(id);
}
function exClipboardAction(id, mode) {
    const sel = window['ex_sel_' + id];
    if (!sel || !sel.path) { toast('Select a file first'); return; }
    if (mode === 'copy') exCopyPath(sel.scope, sel.path, sel.name, sel.isDir);
    else if (mode === 'cut') exCutPath(sel.scope, sel.path, sel.name, sel.isDir);
}
function exToolbarRename(id) {
    const sel = window['ex_sel_' + id];
    if (!sel) { toast('Select a file first'); return; }
    exRename(id, sel.path);
}
function exToolbarDelete(id) {
    const sel = window['ex_sel_' + id];
    if (!sel) { toast('Select a file first'); return; }
    exDelete(id, sel.path, sel.scope || 'user');
}
function exOpenSaveDialog(id) {
    const sel = window['ex_sel_' + id];
    if (!sel || sel.isDir) { toast('Select a file to export'); return; }
    openJadeSaveDialog({
        mode: 'export',
        suggestedName: sel.name,
        folder: 'Downloads',
        title: 'Export / Save As',
        onSave: async (folder, name) => {
            // copy within FS or re-download blob then save
            try {
                if (sel.scope === 'user') {
                    const dest = (folder.replace(/\/$/, '') + '/' + name);
                    await API.copy ? API.copy(sel.path, dest) : await (async () => {
                        const r = await fetch(mediaUrl('user', sel.path), { headers: { Authorization: 'Bearer ' + (API.token||'') }});
                        const blob = await r.blob();
                        await micaSaveBlob(blob, name, folder);
                    })();
                } else {
                    const d = await API.hostRead(sel.path);
                    let blob;
                    if (d.binary) {
                        const bin = atob(d.content);
                        const arr = new Uint8Array(bin.length);
                        for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
                        blob = new Blob([arr]);
                    } else blob = new Blob([d.content]);
                    await micaSaveBlob(blob, name, folder);
                }
                toast('Saved ' + folder + '/' + name);
            } catch (e) { toast(e.message); }
        }
    });
}

async function exGo(id, scope, path) {
    window['ex_scope_' + id] = scope;
    window['ex_path_' + id] = path || '';
    // history
    if (!window['ex_hist_' + id]) window['ex_hist_' + id] = [];
    let i = window['ex_hist_i_' + id];
    if (i == null) i = -1;
    const h = window['ex_hist_' + id];
    h.splice(i + 1);
    h.push({ scope, path: path || '' });
    window['ex_hist_i_' + id] = h.length - 1;
    await exLoad(id);
}

async function exLoad(id) {
    const scope = window['ex_scope_' + id] || 'user';
    const path = window['ex_path_' + id] || '';
    const addr = document.getElementById('ex_addr_' + id);
    if (addr) addr.value = scope === 'host' ? path : (path || 'Mica OS');
    const clip = document.getElementById('ex_clip_' + id);
    if (clip) {
        clip.textContent = JadeClipboard.path ? (JadeClipboard.mode + ': ' + pathBase(JadeClipboard.path)) : '';
    }
    const list = document.getElementById('ex_list_' + id);
    if (!list) return;
    // Keep previous content visible (no Loading flash / flicker)
    list.style.opacity = '0.65';
    try {
        let items = [];
        if (scope === 'host') {
            const data = await API.hostList(path);
            items = data.items || [];
            window['ex_path_' + id] = data.path || path;
            if (addr) addr.value = window['ex_path_' + id];
        } else {
            const data = await API.list(path);
            items = data.items || data || [];
        }
        const st = document.getElementById('ex_status_left_' + id);
        if (st) st.textContent = items.length + ' item' + (items.length === 1 ? '' : 's');
        const view = window['ex_view_' + id] || 'details';
        list.classList.toggle('jade-list-details', view === 'details');
        list.classList.toggle('jade-list-icons', view === 'icons');
        if (!items.length) {
            list.innerHTML = '<div style="opacity:0.4;text-align:center;padding:40px;">This folder is empty</div>';
        } else {
            let head = '';
            if (view === 'details') {
                head = '<div style="display:grid;grid-template-columns:28px 1fr 90px 70px;gap:8px;padding:6px 12px;font-size:11px;opacity:0.5;border-bottom:1px solid #3a3a40;background:#222226;position:sticky;top:0;">' +
                  '<span></span><span>Name</span><span>Type</span><span style="text-align:right;">Size</span></div>';
            }
            // Build off-DOM then swap once
            const html = head + items.map(it => exRenderFileItem(id, scope, it)).join('');
            list.innerHTML = html;
        }
    } catch (e) {
        list.innerHTML = '<div style="color:#ff5f56;padding:20px;">' + (e.message || e) + '</div>';
    }
    list.style.opacity = '1';
}


function exRenderFileItem(id, scope, it) {
    const safe = String(it.path).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const nameSafe = (it.name || '').replace(/'/g, "\\'");
    const icon = it.is_dir ? '📁' : fileIcon(it.name || it.ext);
    const size = it.is_dir ? '' : formatSize(it.size || 0);
    const isDir = !!it.is_dir;
    const open = isDir
        ? `exGo('${id}','${scope}','${safe}')`
        : (window['ex_picker_' + id]
            ? `exSelect('${id}','${scope}','${safe}','${nameSafe}',false);jadeDialogConfirm('${id}')`
            : `exOpenFile('${scope}','${safe}','${nameSafe}')`);
    const sel = `exSelect('${id}','${scope}','${safe}','${nameSafe}',${isDir})`;
    const drag = `draggable="true" ondragstart="exDragStart(event,'${scope}','${safe}','${nameSafe}',${isDir})"`;
    const dropFolder = isDir
        ? `ondragover="exDragOver(event)" ondrop="exDropOnFolder(event,'${id}','${safe}')"`
        : '';
    const view = window['ex_view_' + id] || 'details';
    const typeLabel = isDir ? 'File folder' : ((it.name||'').split('.').pop() || 'File').toUpperCase() + ' File';
    if (view === 'icons') {
        return `<div class="file-item" data-path="${safe}" ${drag} ${dropFolder}
            style="cursor:default;"
            onclick="${sel}" ondblclick="${open}"
            oncontextmenu="event.preventDefault();exFileContextMenu(event,'${id}','${scope}','${safe}','${nameSafe}',${isDir})">
            <span style="font-size:36px;line-height:1;">${icon}</span>
            <div style="font-size:11px;margin-top:4px;word-break:break-word;">${it.name}</div>
          </div>`;
    }
    return `<div class="file-item" data-path="${safe}" ${drag} ${dropFolder}
        onclick="${sel}" ondblclick="${open}"
        oncontextmenu="event.preventDefault();exFileContextMenu(event,'${id}','${scope}','${safe}','${nameSafe}',${isDir})">
        <span style="font-size:18px;">${icon}</span>
        <div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.name}</div>
        <div style="font-size:11px;opacity:0.55;">${typeLabel}</div>
        <div style="font-size:11px;opacity:0.55;text-align:right;">${size}</div>
      </div>`;
}

function formatSize(n) {
    if (!n) return '';
    if (n > 1048576) return (n / 1048576).toFixed(2) + ' MB';
    if (n > 1024) return (n / 1024).toFixed(1) + ' KB';
    return n + ' B';
}

function exUp(id) {
    const scope = window['ex_scope_' + id] || 'user';
    let path = window['ex_path_' + id] || '';
    if (scope === 'host') {
        path = String(path).split('\\').join('/').split('\\').join('/');
        while (path.length > 3 && path.endsWith('/')) path = path.slice(0, -1);
        const isDrive = (path.length === 2 && path[1] === ':') || (path.length === 3 && path[1] === ':' && path[2] === '/');
        if (isDrive || path === '/') {
            window['ex_path_' + id] = '';
            return exLoad(id);
        }
        const parts = path.split('/').filter(Boolean);
        parts.pop();
        let parent = parts.join('/');
        if (parent.length === 2 && parent[1] === ':') parent += '/';
        window['ex_path_' + id] = parent;
        return exLoad(id);
    }
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    window['ex_path_' + id] = parts.join('/');
    return exLoad(id);
}

function exRefresh(id) { return exLoad(id); }

function exAddressGo(id) {
    const addr = document.getElementById('ex_addr_' + id).value.trim();
    if (/^[A-Za-z]:/.test(addr) || addr.startsWith('/') || addr.startsWith('\\\\')) {
        return exGo(id, 'host', addr);
    }
    const p = addr === 'Root' ? '' : addr;
    return exGo(id, 'user', p);
}

async function exSearch(id) {
    const q = (document.getElementById('ex_search_' + id).value || '').trim().toLowerCase();
    if (!q) return exLoad(id);
    const scope = window['ex_scope_' + id] || 'user';
    const path = window['ex_path_' + id] || '';
    const list = document.getElementById('ex_list_' + id);
    list.innerHTML = '<div style="opacity:0.5;padding:20px;text-align:center;">Searching…</div>';
    try {
        let items = [];
        if (scope === 'host') {
            const data = await API.hostList(path);
            items = (data.items || []).filter(it => (it.name || '').toLowerCase().includes(q));
        } else {
            // shallow search current + one level of folders
            const data = await API.list(path);
            items = (data.items || data || []).filter(it => (it.name || '').toLowerCase().includes(q));
            for (const it of (data.items || data || []).filter(x => x.is_dir)) {
                try {
                    const sub = await API.list(it.path);
                    (sub.items || sub || []).forEach(s => {
                        if ((s.name || '').toLowerCase().includes(q)) items.push(s);
                    });
                } catch (e) {}
            }
        }
        window._exSearchResults = items;
        // reuse render with filtered — temporary override path listing
        if (!items.length) {
            list.innerHTML = '<div style="opacity:0.4;text-align:center;padding:40px;">No matches</div>';
            return;
        }
        list.innerHTML = items.map(it => exRenderFileItem(id, scope, it)).join('');
    } catch (e) {
        list.innerHTML = `<div style="color:#ff5f56;padding:16px;">${e.message}</div>`;
    }
}

async function exUpload(e, id) {
    const files = e.target.files;
    if (!files || !files.length) return;
    const scope = window['ex_scope_' + id] || 'user';
    if (scope !== 'user') {
        toast('Upload only into Home (user FS)');
        e.target.value = '';
        return;
    }
    const base = window['ex_path_' + id] || '';
    for (const file of files) {
        const path = base ? base + '/' + file.name : file.name;
        const text = await file.text().catch(() => null);
        if (text !== null && !file.type.startsWith('image/') && !file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
            await API.write(path, text);
        } else {
            // binary via data URL write as text fallback — use FormData upload
            const fd = new FormData();
            fd.append('path', base || '');
            fd.append('file', file);
            await fetch('/api/fs/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + API.token }, body: fd });
        }
        toast('Uploaded ' + file.name);
    }
    e.target.value = '';
    await exLoad(id);
}

async function exNewFolder(id) {
    const name = prompt('Folder name', 'New folder');
    if (!name) return;
    const scope = window['ex_scope_' + id] || 'user';
    const base = window['ex_path_' + id] || '';
    try {
        if (scope === 'host') {
            const path = base ? (base.replace(/[\/]$/, '') + '/' + name.trim()) : name.trim();
            await API.hostMkdir(path);
        } else {
            const path = base ? base + '/' + name.trim() : name.trim();
            await API.mkdir(path);
        }
        await exLoad(id);
    } catch (e) { toast(e.message || String(e)); }
}



function hideMicaMenus() {
    document.querySelectorAll('.mica-ctx').forEach(el => el.remove());
}

function showMicaMenu(x, y, items) {
    hideMicaMenus();
    const m = document.createElement('div');
    m.className = 'mica-ctx';
    m.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;background:var(--win-bg);backdrop-filter:var(--blur);border:1px solid var(--dock-border);border-radius:12px;box-shadow:var(--shadow);padding:6px 0;min-width:200px;z-index:3000000;font-size:13px;color:var(--text);';
    (items || []).forEach((it) => {
        if (it === '---') {
            const sep = document.createElement('div');
            sep.style.cssText = 'height:1px;background:var(--dock-border);margin:4px 0;';
            m.appendChild(sep);
            return;
        }
        const row = document.createElement('div');
        row.className = 'context-item';
        row.textContent = it.label || '';
        row.style.cssText = 'padding:8px 14px;cursor:pointer;color:var(--text);' + (it.disabled ? 'opacity:0.4;pointer-events:none;' : '');
        row.onmouseenter = () => { row.style.background = 'var(--well-bg)'; };
        row.onmouseleave = () => { row.style.background = 'transparent'; };
        if (!it.disabled && typeof it.fn === 'function') {
            row.addEventListener('mousedown', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
            row.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                hideMicaMenus();
                try {
                    const r = it.fn();
                    if (r && typeof r.then === 'function') r.catch(err => toast(err.message || String(err)));
                } catch (err) {
                    console.error(err);
                    toast(err.message || String(err));
                }
            });
        }
        m.appendChild(row);
    });
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    let left = Number(x) || 0, top = Number(y) || 0;
    if (left + r.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - r.width - 8);
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - r.height - 8);
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    m.style.left = left + 'px';
    m.style.top = top + 'px';
    m.style.visibility = 'visible';
    setTimeout(() => {
        const closer = (ev) => {
            if (!m.contains(ev.target)) {
                m.remove();
                document.removeEventListener('mousedown', closer, true);
            }
        };
        document.addEventListener('mousedown', closer, true);
    }, 0);
}

function exFileContextMenu(e, id, scope, path, name, isDir) {
    e.preventDefault();
    e.stopPropagation();
    exSelect(id, scope, path, name, isDir);
    const items = [
        { label: '📂 Open', fn: () => isDir ? exGo(id, scope, path) : exOpenFile(scope, path, name) },
        { label: '📄 Copy', fn: () => exCopyPath(scope, path, name, isDir) },
    ];
    if (scope === 'user') {
        items.push({ label: '✂ Cut', fn: () => exCutPath(scope, path, name, isDir) });
        items.push({ label: '📋 Paste', fn: () => exPaste(id) });
        items.push({ label: '📦 Move to current folder', fn: () => {
            window['ex_sel_' + id] = { scope, path, name, is_dir: isDir };
            exToolbarMove(id);
        }});
    }
    items.push('---');
    if (!isDir) {
        items.push({ label: '⬇ Download to Windows', fn: () => exDownloadToWindows(scope, path, name) });
        const ext = (name.split('.').pop() || '').toLowerCase();
        if (ext === 'zip' || ext === 'mdfs') {
            items.push({ label: '🗜 Extract here', fn: () => exUnzip(id, path) });
        }
        items.push({ label: 'Open with…', fn: () => exOpenWith(scope, path, name) });
    }
    if (scope === 'user') {
        items.push('---');
        items.push({ label: '✏️ Rename', fn: () => exRename(id, path) });
        items.push({ label: '🗑 Delete', fn: () => exDelete(id, path) });
    }
    showMicaMenu(e.clientX, e.clientY, items);
}

async function exUnzip(id, path) {
    try {
        toast('Extracting…');
        const res = await API.unzip(path);
        toast('Extracted ' + res.extracted + ' files');
        await exLoad(id);
    } catch (e) {
        toast(e.message || 'Unzip failed');
    }
}

function exOpenWith(scope, path, name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const apps = [
        { name: 'Ruby Editor', match: () => true },
        { name: 'Vynl', match: () => MEDIA_EXT.includes(ext) },
        { name: 'Package Manager', match: () => PKG_EXT.includes(ext) },
        { name: 'Jade Explorer', match: () => true },
    ];
    const items = apps.filter(a => a.match()).map(a => ({
        label: a.name,
        fn: () => {
            if (a.name === 'Package Manager' && PKG_EXT.includes(ext)) {
                installPackageFromDisk(scope, path, name).catch(e => toast(e.message));
            } else if (a.name === 'Jade Explorer') {
                App.open('Jade Explorer');
            } else {
                App.open(a.name, { scope, path, name });
            }
        }
    }));
    showMicaMenu(innerWidth/2 - 100, innerHeight/2 - 80, items);
}

function exEmptyContextMenu(e, id) {
    e.preventDefault();
    const scope = window['ex_scope_' + id] || 'user';
    const items = [
        { label: '🔄 Refresh', fn: () => exRefresh(id) },
        { label: '📁 New folder', fn: () => exNewFolder(id) },
        { label: '📋 Paste', fn: () => exPaste(id), disabled: !JadeClipboard.path },
        { label: '📤 Upload…', fn: () => document.getElementById('ex_up_' + id)?.click() },
    ];
    showMicaMenu(e.clientX, e.clientY, items);
}

function exSelect(id, scope, path, name, isDir) {
    window['ex_sel_' + id] = { scope, path, name, isDir: !!isDir };
    const list = document.getElementById('ex_list_' + id);
    if (list) {
        list.querySelectorAll('.file-item').forEach(el => {
            el.classList.toggle('selected', el.getAttribute('data-path') === path);
        });
    }
    const nm = document.getElementById('dlg_name_' + id);
    if (nm && !isDir) nm.value = name || '';
}

function exToolbarCopy(id) {
    const sel = window['ex_sel_' + id];
    if (!sel || !sel.path) return toast('Select a file or folder first');
    exCopyPath(sel.scope, sel.path, sel.name, sel.is_dir);
}

function exToolbarCut(id) {
    const sel = window['ex_sel_' + id];
    if (!sel || !sel.path) return toast('Select a file or folder first');
    exCutPath(sel.scope, sel.path, sel.name, sel.is_dir);
}

async function exToolbarMove(id) {
    const sel = window['ex_sel_' + id];
    if (!sel || !sel.path) return toast('Select a file or folder first');
    if (!sel) return toast('Select a file first');
    const folder = window['ex_path_' + id] || '';
    const dest = (folder ? folder.replace(/\/$/, '') + '/' : '') + (sel.name || pathBase(sel.path));
    if (dest === sel.path || dest === sel.path + '/') return toast('Already here');
    try {
        await API.move(sel.path, dest);
        JadeClipboard = { mode: null, path: null, name: null, scope: 'user', is_dir: false };
        toast('Moved to ' + dest);
        await exLoad(id);
    } catch (e) {
        toast(e.message || 'Move failed');
    }
}

async function exToolbarDownload(id) {
    const sel = window['ex_sel_' + id];
    if (!sel || !sel.path) return toast('Select a file first');
    if (sel.is_dir) return toast('Select a file to download');
    await exDownloadToWindows(sel.scope, sel.path, sel.name || pathBase(sel.path));
}

function exCopyPath(scope, path, name, isDir) {
    JadeClipboard = {
        mode: 'copy',
        path,
        name: name || pathBase(path),
        scope: scope || 'user',
        is_dir: !!isDir,
    };
    toast('Copied ' + JadeClipboard.name);
    // update clip labels
    document.querySelectorAll('[id^="ex_clip_"]').forEach(el => {
        el.textContent = 'copy: ' + JadeClipboard.name;
    });
}

function exCutPath(scope, path, name, isDir) {
    if ((scope || 'user') !== 'user') return toast('Cut only works in Home FS');
    JadeClipboard = {
        mode: 'cut',
        path,
        name: name || pathBase(path),
        scope: 'user',
        is_dir: !!isDir,
    };
    toast('Cut ' + JadeClipboard.name);
    document.querySelectorAll('[id^="ex_clip_"]').forEach(el => {
        el.textContent = 'cut: ' + JadeClipboard.name;
    });
}

async function exPaste(id) {
    if (!JadeClipboard || !JadeClipboard.path) return toast('Clipboard empty — use Copy or Cut first');
    const scope = window['ex_scope_' + id] || 'user';
    const folder = window['ex_path_' + id] || '';
    const name = JadeClipboard.name || pathBase(JadeClipboard.path);
    const join = (base, n) => {
        if (!base) return n;
        const b = base.replace(/[\\/]+$/, '');
        return b + (scope === 'host' && /^[A-Za-z]:$/.test(b) ? '\\' : '/') + n;
    };
    let dest = join(folder, name);
    if (pathNorm(dest) === pathNorm(JadeClipboard.path)) {
        if (JadeClipboard.mode === 'copy') dest = join(folder, 'Copy of ' + name);
        else return toast('Already in this folder');
    }
    try {
        const srcScope = JadeClipboard.scope || 'user';
        if (srcScope === 'user' && scope === 'user') {
            if (JadeClipboard.mode === 'copy') await API.copy(JadeClipboard.path, dest);
            else {
                await API.move(JadeClipboard.path, dest);
                JadeClipboard = { mode: null, path: null, name: null, scope: 'user', is_dir: false };
            }
        } else {
            // host involved — use host copy/move API
            if (JadeClipboard.mode === 'copy') {
                await API.post ? await fetch('/api/host/copy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API.token },
                    body: JSON.stringify({ src: JadeClipboard.path, dest })
                }).then(async r => { if (!r.ok) throw new Error((await r.json()).detail || r.statusText); })
                : null;
            } else {
                await fetch('/api/host/move', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API.token },
                    body: JSON.stringify({ src: JadeClipboard.path, dest })
                }).then(async r => { if (!r.ok) throw new Error((await r.json()).detail || r.statusText); });
                JadeClipboard = { mode: null, path: null, name: null, scope: 'user', is_dir: false };
            }
        }
        toast('Pasted → ' + dest);
        document.querySelectorAll('[id^="ex_clip_"]').forEach(el => {
            el.textContent = JadeClipboard.path ? (JadeClipboard.mode + ': ' + (JadeClipboard.name || '')) : '';
        });
        await exLoad(id);
    } catch (e) {
        toast(e.message || 'Paste failed');
    }
}


window.__exHoverTimer = null;
window.__exHoverTarget = null;

function exSideDragOver(e, id, scope, path) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
    const el = e.currentTarget;
    el.style.background = 'rgba(79,140,255,0.25)';
    el.style.outline = '1px solid #4f8cff';
    // hover-to-open after 600ms
    const key = scope + '::' + path;
    if (window.__exHoverTarget !== key) {
        window.__exHoverTarget = key;
        clearTimeout(window.__exHoverTimer);
        window.__exHoverTimer = setTimeout(() => {
            // navigate into folder while still dragging
            try {
                window['ex_scope_' + id] = scope;
                window['ex_path_' + id] = path || '';
                exLoad(id);
            } catch (err) {}
        }, 650);
    }
}

function exSideDragLeave(e) {
    const el = e.currentTarget;
    if (el) {
        el.style.background = '';
        el.style.outline = '';
    }
}

async function exSideDrop(e, id, destScope, destPath) {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(window.__exHoverTimer);
    window.__exHoverTarget = null;
    const el = e.currentTarget;
    if (el) { el.style.background = ''; el.style.outline = ''; }

    let data = null;
    try { data = JSON.parse(e.dataTransfer.getData('application/x-mica-file') || 'null'); } catch (err) { data = null; }

    // external Windows files
    if ((!data || !data.path) && e.dataTransfer.files && e.dataTransfer.files.length) {
        if (destScope !== 'user') return toast('Upload only into Home FS');
        for (const f of e.dataTransfer.files) {
            try { await API.upload(destPath || '', f); } catch (err) { toast(err.message); }
        }
        toast('Uploaded ' + e.dataTransfer.files.length + ' file(s)');
        await exGo(id, 'user', destPath || '');
        return;
    }
    if (!data || !data.path) return;

    if (destScope === 'host') {
        // Host drive is always usable for transfer (DiskFS unlocked full-time)
        let data = null;
        try { data = JSON.parse(e.dataTransfer.getData('application/x-mica-file') || 'null'); } catch (err) { data = null; }
        if (!data || !data.path) return;
        const name = data.name || pathBase(data.path);
        const dest = (destPath || '').replace(/\\/g, '/').replace(/\/$/, '') + '/' + name;
        try {
            await API.hostCopy(data.path, dest);
            toast('Copied to host ' + dest);
            await exGo(id, 'host', destPath || '');
        } catch (err) { toast(err.message || 'Host drop failed'); }
        return;
    }
    const name = data.name || pathBase(data.path);
    const dest = (destPath ? destPath.replace(/\/$/, '') + '/' : '') + name;
    if (pathNorm(dest) === pathNorm(data.path)) return;
    try {
        if (data.scope === 'user') {
            if (e.shiftKey) await API.copy(data.path, dest);
            else await API.move(data.path, dest);
            toast((e.shiftKey ? 'Copied' : 'Moved') + ' → ' + dest);
        } else {
            const d = await API.hostRead(data.path);
            if (d.binary) await API.write(dest, 'data:application/octet-stream;base64,' + d.content);
            else await API.write(dest, d.content);
            toast('Imported → ' + dest);
        }
        await exGo(id, 'user', destPath || '');
    } catch (err) {
        toast(err.message || 'Drop failed');
    }
}


function exDragStart(e, scope, path, name, isDir) {
    e.dataTransfer.setData('application/x-mica-file', JSON.stringify({
        scope, path, name, is_dir: !!isDir
    }));
    e.dataTransfer.effectAllowed = 'copyMove';
    try {
        e.dataTransfer.setData('text/plain', path);
    } catch (err) {}
    // clear hover-open timers when drag ends
    const clear = () => {
        clearTimeout(window.__exHoverTimer);
        window.__exHoverTarget = null;
        document.querySelectorAll('.folder-item').forEach(el => {
            el.style.background = '';
            el.style.outline = '';
        });
        window.removeEventListener('dragend', clear);
    };
    window.addEventListener('dragend', clear);
}

function exDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
}

async function exDrop(e, id) {
    e.preventDefault();
    e.stopPropagation();
    let data = null;
    try {
        data = JSON.parse(e.dataTransfer.getData('application/x-mica-file') || 'null');
    } catch (err) {
        data = null;
    }
    // native files from Windows
    if ((!data || !data.path) && e.dataTransfer.files && e.dataTransfer.files.length) {
        const folder = window['ex_path_' + id] || '';
        for (const f of e.dataTransfer.files) {
            try {
                await API.upload(folder, f);
            } catch (err) {
                toast(err.message);
            }
        }
        toast('Uploaded ' + e.dataTransfer.files.length + ' file(s)');
        await exLoad(id);
        return;
    }
    if (!data || !data.path) return;
    const scope = window['ex_scope_' + id] || 'user';
    /* host drops allowed */
    const folder = window['ex_path_' + id] || '';
    const name = data.name || pathBase(data.path);
    const dest = (folder ? folder.replace(/\/$/, '') + '/' : '') + name;
    if (pathNorm(dest) === pathNorm(data.path)) return;
    try {
        if (data.scope === 'user') {
            if (e.shiftKey) {
                await API.copy(data.path, dest);
                toast('Copied here');
            } else {
                await API.move(data.path, dest);
                toast('Moved here');
            }
        } else {
            const d = await API.hostRead(data.path);
            if (d.binary) await API.write(dest, 'data:application/octet-stream;base64,' + d.content);
            else await API.write(dest, d.content);
            toast('Imported from host');
        }
        await exLoad(id);
    } catch (err) {
        toast(err.message || 'Drop failed');
    }
}

async function exDropOnFolder(e, id, destFolder) {
    e.preventDefault();
    e.stopPropagation();
    let data = null;
    try {
        data = JSON.parse(e.dataTransfer.getData('application/x-mica-file') || 'null');
    } catch (err) {
        data = null;
    }
    if (!data || !data.path) return;
    if ((window['ex_scope_' + id] || 'user') !== 'user') return;
    const name = data.name || pathBase(data.path);
    const dest = (destFolder ? destFolder.replace(/\/$/, '') + '/' : '') + name;
    if (pathNorm(dest) === pathNorm(data.path)) return;
    try {
        if (data.scope === 'user') {
            if (e.shiftKey) await API.copy(data.path, dest);
            else await API.move(data.path, dest);
        } else {
            const d = await API.hostRead(data.path);
            if (d.binary) await API.write(dest, 'data:application/octet-stream;base64,' + d.content);
            else await API.write(dest, d.content);
        }
        toast('Dropped into ' + destFolder);
        await exLoad(id);
    } catch (err) {
        toast(err.message || 'Drop failed');
    }
}

/** Force download to Windows (bypass Mica download interceptor) */
async function exDownloadToWindows(scope, path, name) {
    try {
        let blob;
        let fname = name || pathBase(path);
        if (scope === 'host') {
            const d = await API.hostRead(path);
            if (d.binary) {
                const bin = atob(d.content);
                const arr = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                blob = new Blob([arr]);
            } else {
                blob = new Blob([d.content], { type: 'text/plain;charset=utf-8' });
            }
        } else {
            // try raw endpoint first for binary
            try {
                const r = await fetch('/api/fs/raw?path=' + encodeURIComponent(path) + '&token=' + encodeURIComponent(API.token || ''), {
                    headers: { Authorization: 'Bearer ' + (API.token || '') }
                });
                if (r.ok) {
                    blob = await r.blob();
                } else {
                    throw new Error('raw fail');
                }
            } catch (e) {
                const d = await API.read(path);
                if (d.binary || (typeof d.content === 'string' && d.content.startsWith('data:'))) {
                    let b64 = d.content;
                    if (b64.startsWith('data:') && b64.includes(',')) b64 = b64.split(',')[1];
                    const bin = atob(b64);
                    const arr = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                    blob = new Blob([arr]);
                } else {
                    blob = new Blob([d.content], { type: 'text/plain;charset=utf-8' });
                }
            }
        }
        // Force real Windows / host Save dialog — never route through Jade
        window.__micaForceWindowsSave = true;
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: fname,
                    types: [{ description: 'File', accept: { 'application/octet-stream': ['.*'] } }],
                });
                window.__micaForceWindowsSave = false;
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                toast('Exported to PC: ' + fname);
                return;
            } catch (err) {
                window.__micaForceWindowsSave = false;
                if (err && err.name === 'AbortError') return;
                // fall through to classic download
            }
        }
        window.__micaForceWindowsSave = false;
        // Fallback: true browser/WebEngine download (bypass Mica interceptor)
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        a.setAttribute('data-mica-windows', '1');
        a.setAttribute('data-mica-force-windows', '1');
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast('Download started: ' + fname);
    } catch (e) {
        toast(e.message || 'Download failed');
    }
}

async function exDownload(scope, path, name) {
    // default: download to Windows
    return exDownloadToWindows(scope, path, name);
}

async function exRename(id, path) {
    const name = prompt('New name:', path.split('/').pop());
    if (!name) return;
    const parts = path.split('/');
    parts[parts.length - 1] = name.trim();
    const dest = parts.join('/');
    await API.move(path, dest);
    await exLoad(id);
}

async function exDelete(id, path, scope) {
    if (!confirm('Delete ' + path + '?')) return;
    scope = scope || window['ex_scope_' + id] || 'user';
    try {
        if (scope === 'host') await API.hostDelete(path);
        else await API.remove(path);
        await exLoad(id);
    } catch (e) { toast(e.message || String(e)); }
}

const TEXT_EXT = ['txt','md','json','js','html','htm','css','py','xml','csv','log','ini','cfg','yaml','yml','toml','ts','tsx','jsx','svg','sh','bat','c','cpp','h','java','rs','go','rb','php','sql'];
const PKG_EXT = ['mapp','mpkg','mplug','mupdate','mica'];
const MEDIA_EXT = ['mp3','wav','ogg','flac','m4a','aac','mp4','webm','mkv','mov','avi','png','jpg','jpeg','gif','webp','bmp','svg','ico'];

function mediaUrl(scope, path) {
    if (scope === 'host') {
        // host read returns base64 for binary — use blob via API later
        return null;
    }
    return '/api/fs/raw?path=' + encodeURIComponent(path) + '&token=' + encodeURIComponent(API.token || '');
}

async function loadFileText(scope, path) {
    if (scope === 'host') {
        const d = await API.hostRead(path);
        if (d.binary) throw new Error('Binary file — open in Vynl');
        return d.content;
    }
    const d = await API.read(path);
    return d.content;
}

async function exOpenFile(scope, path, name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (typeof PKG_EXT !== 'undefined' && PKG_EXT.includes(ext)) {
        if (!confirm('Install package "' + name + '" with Package Manager?')) return;
        try {
            await installPackageFromDisk(scope, path, name);
        } catch (e) {
            toast(e.message || 'Install failed');
        }
        return;
    }
    if (TEXT_EXT.includes(ext)) {
        App.open('Ruby Editor', { scope, path, name });
        return;
    }
    if (MEDIA_EXT.includes(ext)) {
        App.open('Vynl', { scope, path, name });
        return;
    }
    // unknown — try editor for text-like, else offer package manager
    if (confirm('Open "' + name + '" in Ruby Editor? (Cancel = Package Manager)')) {
        App.open('Ruby Editor', { scope, path, name });
    } else {
        App.open('Package Manager');
    }
}

async function installPackageFromDisk(scope, path, name) {
    if (scope !== 'user') throw new Error('Install packages from Home FS only');
    const lower = name.toLowerCase();
    const raw = await loadFileText('user', path);
    if (lower.endsWith('.mplug') || lower.endsWith('.py') || lower.endsWith('.js')) {
        const res = await API.pluginsInstall(raw, name);
        toast('Plugin installed: ' + res.name);
        micaSoftReboot('Plugin installed — rebooting…');
        return res;
    }
    return installPackageFromText(name, raw);
}

async function renderEditor(id, c) {
    const pending = App.pendingPath;
    App.pendingPath = null;
    c.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;">
      <div style="padding:8px 10px;background:var(--well-bg);border-bottom:1px solid var(--dock-border);display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <input id="re_name_${id}" placeholder="Documents/notes.txt" style="flex:1;min-width:120px;">
        <select id="re_lang_${id}" class="mica-select" style="padding:6px 8px;background:#2a2a2e;color:#eee;border:1px solid #444;" onchange="reHighlightDebounced('${id}')">
          <option value="auto">Auto</option>
          <option value="js">JavaScript</option>
          <option value="py">Python</option>
          <option value="html">HTML</option>
          <option value="css">CSS</option>
          <option value="json">JSON</option>
          <option value="md">Markdown</option>
          <option value="txt">Plain</option>
        </select>
        <button class="primary-btn" onclick="saveEditor('${id}')">Save</button>
        <button onclick="saveEditorAs('${id}')">Save As</button>
        <button onclick="openJadePickerForEditor('${id}')">Open</button>
        <button onclick="reFormat('${id}')">Format</button>
      </div>
      <div style="flex:1;display:flex;position:relative;overflow:hidden;background:#1e1e1e;">
        <pre id="re_hi_${id}" aria-hidden="true" style="position:absolute;inset:0;margin:0;padding:14px;overflow:auto;pointer-events:none;font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;color:#d4d4d4;"></pre>
        <textarea id="re_text_${id}" spellcheck="false"
          style="position:relative;flex:1;border:none;padding:14px;resize:none;outline:none;background:transparent;color:transparent;caret-color:#fff;font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:1.45;white-space:pre-wrap;z-index:1;"
          oninput="reHighlightDebounced('${id}')" onscroll="reSyncScroll('${id}')"></textarea>
      </div>
      <div id="re_status_${id}" style="padding:4px 10px;font-size:11px;opacity:0.55;border-top:1px solid var(--dock-border);display:flex;gap:12px;">
        <span id="re_pos_${id}">Ln 1, Col 1</span>
        <span id="re_info_${id}"></span>
      </div>
    </div>`;
    const ta = document.getElementById('re_text_' + id);
    ta.addEventListener('keyup', () => reUpdatePos(id));
    ta.addEventListener('click', () => reUpdatePos(id));
    ta.addEventListener('input', () => {
        if (typeof App !== 'undefined' && App.markDirty) {
            App.markDirty(id, () => saveEditor(id));
        }
    });
    if (pending && pending.path) {
        try {
            const text = await loadFileText(pending.scope || 'user', pending.path);
            document.getElementById('re_name_' + id).value = pending.path;
            ta.value = text;
            reDetectLang(id, pending.path);
            reHighlight(id);
            document.getElementById('re_info_' + id).textContent = 'Opened ' + pending.path;
        } catch (e) {
            document.getElementById('re_info_' + id).textContent = e.message || 'Open failed';
            toast(e.message || 'Open failed');
        }
    } else {
        reHighlight(id);
    }
}

function reDetectLang(id, path) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    const map = { js:'js', mjs:'js', ts:'js', py:'py', html:'html', htm:'html', css:'css', json:'json', md:'md', markdown:'md' };
    const sel = document.getElementById('re_lang_' + id);
    if (sel) sel.value = map[ext] || 'auto';
}

function reSyncScroll(id) {
    const ta = document.getElementById('re_text_' + id);
    const hi = document.getElementById('re_hi_' + id);
    if (ta && hi) { hi.scrollTop = ta.scrollTop; hi.scrollLeft = ta.scrollLeft; }
}

function reUpdatePos(id) {
    const ta = document.getElementById('re_text_' + id);
    if (!ta) return;
    const pos = ta.selectionStart || 0;
    const lines = ta.value.slice(0, pos).split('\n');
    const ln = lines.length;
    const col = lines[lines.length - 1].length + 1;
    const el = document.getElementById('re_pos_' + id);
    if (el) el.textContent = 'Ln ' + ln + ', Col ' + col;
}

function reEscape(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function reHighlightDebounced(id) {
    clearTimeout(window['__reHi_' + id]);
    window['__reHi_' + id] = setTimeout(() => {
        try { reHighlight(id); } catch (e) {}
    }, 80);
}
function reHighlight(id) {
    const ta = document.getElementById('re_text_' + id);
    const hi = document.getElementById('re_hi_' + id);
    if (!ta || !hi) return;
    let lang = document.getElementById('re_lang_' + id)?.value || 'auto';
    const path = document.getElementById('re_name_' + id)?.value || '';
    if (lang === 'auto') {
        const ext = (path.split('.').pop() || '').toLowerCase();
        lang = ({ js:'js', py:'py', html:'html', htm:'html', css:'css', json:'json', md:'md' })[ext] || 'txt';
    }
    // Avoid layout thrash while native <select> popup is open (WebEngine flicker)
    if (document.activeElement && document.activeElement.tagName === 'SELECT') return;
    const next = reColorize(ta.value, lang) + '\n';
    if (hi.dataset.lastHi === next) { reUpdatePos(id); return; }
    hi.dataset.lastHi = next;
    hi.innerHTML = next;
    reSyncScroll(id);
    reUpdatePos(id);
}

function reColorize(src, lang) {
    if (!src) return '';
    if (lang === 'txt') return reEscape(src);
    let html = reEscape(src);
    if (lang === 'py' || lang === 'js') {
        const kws = lang === 'py'
            ? 'def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|with|yield|lambda|pass|break|continue|and|or|not|in|is|None|True|False|async|await'
            : 'const|let|var|function|return|if|else|for|while|class|new|this|import|export|from|async|await|try|catch|throw|typeof|instanceof|true|false|null|undefined';
        html = html.replace(new RegExp('\\b(' + kws + ')\\b', 'g'), '<span style="color:#c586c0">$1</span>');
        html = html.replace(/(\/\/.*)$/gm, '<span style="color:#6a9955">$1</span>');
        html = html.replace(/(#.*)$/gm, '<span style="color:#6a9955">$1</span>');
        html = html.replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span style="color:#ce9178">$1</span>');
        html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#b5cea8">$1</span>');
    } else if (lang === 'html') {
        html = html.replace(/(&lt;\/?[a-zA-Z0-9:-]+)(.*?)(&gt;)/g, '<span style="color:#569cd6">$1</span><span style="color:#9cdcfe">$2</span><span style="color:#569cd6">$3</span>');
    } else if (lang === 'json') {
        html = html.replace(/(&quot;[^&]*&quot;)(\s*:)/g, '<span style="color:#9cdcfe">$1</span>$2');
        html = html.replace(/:\s*(&quot;[^&]*&quot;)/g, ': <span style="color:#ce9178">$1</span>');
        html = html.replace(/\b(true|false|null)\b/g, '<span style="color:#569cd6">$1</span>');
        html = html.replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span style="color:#b5cea8">$1</span>');
    } else if (lang === 'md') {
        html = html.replace(/^(#{1,6}\s.*)$/gm, '<span style="color:#569cd6;font-weight:600">$1</span>');
        html = html.replace(/(`[^`]+`)/g, '<span style="color:#ce9178">$1</span>');
    } else if (lang === 'css') {
        html = html.replace(/([a-zA-Z_-]+)(\s*:)/g, '<span style="color:#9cdcfe">$1</span>$2');
        html = html.replace(/(#[0-9a-fA-F]{3,8})\b/g, '<span style="color:#ce9178">$1</span>');
    }
    return html;
}

function reFormat(id) {
    const ta = document.getElementById('re_text_' + id);
    if (!ta) return;
    let lang = document.getElementById('re_lang_' + id)?.value || 'auto';
    const path = document.getElementById('re_name_' + id)?.value || '';
    if (lang === 'json' || (lang === 'auto' && path.endsWith('.json'))) {
        try {
            ta.value = JSON.stringify(JSON.parse(ta.value), null, 2);
            reHighlight(id);
            toast('Formatted JSON');
            return;
        } catch (e) { toast('Invalid JSON'); return; }
    }
    toast('Format supports JSON currently');
}

async function saveEditor(id, forceDialog) {
    const nameEl = document.getElementById('re_name_' + id);
    const textEl = document.getElementById('re_text_' + id);
    if (!nameEl || !textEl) return false;
    const current = (nameEl.value || '').trim();
    const text = textEl.value;
    const needsDialog = forceDialog || !current || current === 'Documents/Untitled.txt' || current === 'Untitled.txt';
    if (!needsDialog && !forceDialog) {
        try {
            await API.write(current, text);
            const _ri = document.getElementById('re_info_' + id);
            if (_ri) _ri.textContent = 'Saved ' + current;
            toast('Saved ' + current);
            if (typeof App !== 'undefined' && App.markClean) App.markClean(id);
            try { if (typeof micaPushRecentFile === 'function') micaPushRecentFile(current); } catch (e) {}
            try { if (typeof micaDockJump === 'function') micaDockJump('Jade Explorer', current); } catch (e) {}
            return true;
        } catch (e) {
            toast(e.message || 'Save failed');
        }
    }
    const base = current.includes('/') ? current.split('/').pop() : (current || 'Untitled.txt');
    const folder = current.includes('/') ? current.split('/').slice(0, -1).join('/') : 'Documents';
    openJadeSaveDialog({
        title: 'Save',
        suggestedName: base || 'Untitled.txt',
        folder: folder || 'Documents',
        onSave: async (fld, fname) => {
            const path = (fld || 'Documents').replace(/\/$/, '') + '/' + fname;
            try {
                const parts = path.split('/');
                if (parts.length > 1) {
                    try { await API.mkdir(parts.slice(0, -1).join('/')); } catch (e) {}
                }
                await API.write(path, text);
                nameEl.value = path;
                const _ri = document.getElementById('re_info_' + id);
                if (_ri) _ri.textContent = 'Saved ' + path;
                toast('Saved ' + path);
                if (typeof App !== 'undefined' && App.markClean) App.markClean(id);
                try { if (typeof micaPushRecentFile === 'function') micaPushRecentFile(path); } catch (e) {}
                try { if (typeof micaDockJump === 'function') micaDockJump('Jade Explorer', path); } catch (e) {}
                // If closed-from-unsaved requested after-save close
                try {
                    const hook = window.__micaAfterSaveClose;
                    if (hook && hook.id === id && typeof hook.fn === 'function') {
                        window.__micaAfterSaveClose = null;
                        hook.fn();
                    }
                } catch (e) {}
            } catch (e) {
                toast(e.message || 'Save failed');
            }
        }
    });
    return 'pending';
}
function saveEditorAs(id) { return saveEditor(id, true); }

function openJadePickerForEditor(id) {
    openJadePicker({ accept: TEXT_EXT, onPick: async (scope, path, name) => {
        try {
            const text = await loadFileText(scope, path);
            document.getElementById('re_name_' + id).value = path;
            document.getElementById('re_text_' + id).value = text;
            if (typeof reDetectLang==='function') reDetectLang(id, path);
            if (typeof reHighlight==='function') reHighlight(id);
            const info = document.getElementById('re_info_' + id);
            if (info) info.textContent = 'Opened ' + path;
            else { const st = document.getElementById('re_status_' + id); if (st) st.textContent = 'Opened ' + path; }
        } catch (e) { toast(e.message); }
    }});
}


function renderTaskManager(id, c) {
    c.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;padding:12px;gap:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <b>📊 Task Manager</b>
        <button class="primary-btn" style="padding:6px 10px;" onclick="tmRefresh('${id}')">Refresh</button>
      </div>
      <div id="tm_stats_${id}" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;"></div>
      <div id="tm_detail_${id}" style="font-size:11px;opacity:0.7;"></div>
      <div style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:12px;">
        <div>
          <div style="font-size:12px;opacity:0.6;margin-bottom:6px;">OPEN WINDOWS</div>
          <div id="tm_wins_${id}"></div>
        </div>
        <div>
          <div style="font-size:12px;opacity:0.6;margin-bottom:6px;">PLUGINS</div>
          <div id="tm_plugs_${id}"></div>
        </div>
      </div>
    </div>`;
    tmRefresh(id);
    if (window['__tm_' + id]) clearInterval(window['__tm_' + id]);
    window['__tm_' + id] = setInterval(() => {
        if (!document.getElementById('tm_stats_' + id)) {
            clearInterval(window['__tm_' + id]);
            return;
        }
        tmRefresh(id);
    }, 2000);
}

function tmBar(pct, color) {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    return `<div style="height:6px;background:rgba(255,255,255,0.08);border-radius:4px;margin-top:6px;overflow:hidden;">
      <div style="height:100%;width:${p}%;background:${color || '#4f8cff'};border-radius:4px;"></div>
    </div>`;
}

async function tmRefresh(id) {
    const stats = document.getElementById('tm_stats_' + id);
    const detail = document.getElementById('tm_detail_' + id);
    const wins = document.getElementById('tm_wins_' + id);
    const plugs = document.getElementById('tm_plugs_' + id);
    if (!stats) return;
    let d = {};
    try {
        const r = await fetch('/api/system/stats', { headers: { Authorization: 'Bearer ' + (API.token || '') } });
        if (r.ok) d = await r.json();
    } catch (e) {}
    const card = (title, value, barPct, color) => `
      <div style="padding:10px;background:var(--input-bg);border-radius:8px;border:1px solid var(--dock-border);">
        <div style="font-size:11px;opacity:0.55;">${title}</div>
        <b style="font-size:13px;">${value != null && value !== '' ? value : '—'}</b>
        ${barPct != null ? tmBar(barPct, color) : ''}
      </div>`;
    stats.innerHTML = [
        card('CPU', (d.cpu != null ? d.cpu + '%' : '—'), d.cpu, d.cpu > 85 ? '#ff5f56' : '#4f8cff'),
        card('Memory', d.ram || '—', d.ram_percent, d.ram_percent > 85 ? '#ff5f56' : '#34c759'),
        card('Storage', d.disk || '—', d.disk_percent, d.disk_percent > 90 ? '#ff5f56' : '#af52de'),
        card('Network ↓', (d.net_down_kbps != null ? d.net_down_kbps + ' KB/s' : '—'), null),
        card('Network ↑', (d.net_up_kbps != null ? d.net_up_kbps + ' KB/s' : '—'), null),
        card('GPU', (d.gpu && d.gpu.label) ? d.gpu.label : (d.gpu && d.gpu.name) || '—', d.gpu && d.gpu.util, '#ff9f0a'),
        card('Processes', d.processes != null ? d.processes : '—', null),
        card('Windows', Object.keys(Registry || {}).length, null),
    ].join('');
    if (detail) {
        let extra = '';
        if (d.net_recv_mb != null) extra += `Net total ↓ ${d.net_recv_mb} MB · ↑ ${d.net_sent_mb} MB. `;
        if (d.cpu_per_core && d.cpu_per_core.length) extra += `Cores: ${d.cpu_per_core.join('% · ')}%. `;
        if (d.error) extra += d.error;
        detail.textContent = extra || '';
    }
    if (wins) {
        const ids = Object.keys(Registry || {});
        if (!ids.length) wins.innerHTML = '<div style="opacity:0.45;font-size:12px;">No open windows</div>';
        else wins.innerHTML = ids.map(wid => {
            const type = Registry[wid].type;
            const el = document.getElementById(wid);
            const hidden = el && el.style.display === 'none';
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--input-bg);border-radius:8px;margin-bottom:4px;border:1px solid var(--dock-border);">
              <span>${type}${hidden ? ' <span style="opacity:0.45">(minimized)</span>' : ''}</span>
              <span style="display:flex;gap:6px;">
                <button style="padding:4px 8px;font-size:11px;" onclick="App.restoreWindow('${wid}')">Focus</button>
                <button style="padding:4px 8px;font-size:11px;color:#ff5f56;" onclick="App.close('${wid}');tmRefresh('${id}')">End task</button>
              </span>
            </div>`;
        }).join('');
    }
    if (plugs) {
        try {
            const data = await API.pluginsList();
            const list = data.plugins || data || [];
            if (!list.length) plugs.innerHTML = '<div style="opacity:0.45;font-size:12px;">No plugins loaded</div>';
            else plugs.innerHTML = list.map(p => {
                const name = p.name || p.id || 'plugin';
                const en = p.enabled !== false;
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--input-bg);border-radius:8px;margin-bottom:4px;border:1px solid var(--dock-border);">
                  <span>${en ? '🟢' : '⚪'} ${name}</span>
                  <button style="padding:4px 8px;font-size:11px;color:#ff5f56;" onclick="tmKillPlugin('${id}','${(p.id||name).replace(/'/g,"\\'")}')">Remove</button>
                </div>`;
            }).join('');
        } catch (e) {
            plugs.innerHTML = '<div style="opacity:0.45;font-size:12px;">' + (e.message || 'No plugin API') + '</div>';
        }
    }
}

async function tmKillPlugin(id, pluginId) {
    try {
        await API.pluginRemove(pluginId);
        toast('Plugin removed — reboot recommended');
        tmRefresh(id);
    } catch (e) {
        try {
            await API.post('/api/plugins/remove', { id: pluginId });
            toast('Plugin removed');
            tmRefresh(id);
        } catch (e2) { toast(e2.message || e.message); }
    }
}

function renderPyroBrowser(id, c) {
    if (!window.__pyroTabs) window.__pyroTabs = {};
    if (!window.__pyroTabs[id]) window.__pyroTabs[id] = [{ title: 'New Tab', url: 'https://www.google.com', sid: pyroNewSid() }];
    if (!window.__pyroActive) window.__pyroActive = {};
    if (window.__pyroActive[id] == null) window.__pyroActive[id] = 0;
    if (window.micaNative && window.micaNative.setSession) {
        try { window.micaNative.setSession(API.token || '', API.username || ''); } catch (e) {}
    }
    pyroBindNativeSignals();
    pyroRender(id, c);
    setTimeout(() => pyroSyncNative(id), 80);
    setTimeout(() => pyroSyncNative(id), 300);
}

function pyroNewSid() {
    return 'pyro_' + Date.now() + '_' + Math.floor(Math.random() * 9999);
}

function pyroNativeReady() {
    return !!(window.micaNative && typeof window.micaNative.browserCreate === 'function');
}

function pyroBindNativeSignals() {
    if (window.__pyroSignalsBound || !window.micaNative) return;
    window.__pyroSignalsBound = true;
    try {
        if (window.micaNative.urlChanged && window.micaNative.urlChanged.connect) {
            window.micaNative.urlChanged.connect(function(sid, url) { pyroOnNativeUrl(sid, url); });
        }
        if (window.micaNative.titleChanged && window.micaNative.titleChanged.connect) {
            window.micaNative.titleChanged.connect(function(sid, title) { pyroOnNativeTitle(sid, title); });
        }
        if (window.micaNative.downloadSaved && window.micaNative.downloadSaved.connect) {
            window.micaNative.downloadSaved.connect(function(sid, path) {
                try { toast('Saved to Downloads: ' + String(path).split(/[/\\]/).pop()); } catch (e) {}
            });
        }
    } catch (e) { console.warn('pyro signals', e); }
}

function pyroFindTabBySid(sid) {
    for (const wid of Object.keys(window.__pyroTabs || {})) {
        const tabs = window.__pyroTabs[wid] || [];
        for (let i = 0; i < tabs.length; i++) {
            if (tabs[i].sid === sid) return { wid, i, tab: tabs[i] };
        }
    }
    return null;
}

function pyroOnNativeUrl(sid, url) {
    const hit = pyroFindTabBySid(sid);
    if (!hit) return;
    hit.tab.url = url;
    const input = document.getElementById('pyro_url_' + hit.wid);
    if (input && (window.__pyroActive[hit.wid] || 0) === hit.i) input.value = url;
}

function pyroOnNativeTitle(sid, title) {
    const hit = pyroFindTabBySid(sid);
    if (!hit || !title) return;
    hit.tab.title = title;
    const c = document.getElementById('cont_' + hit.wid);
    if (c && (window.__pyroActive[hit.wid] || 0) === hit.i) {
        const el = c.querySelector('[data-pyro-tab="' + hit.i + '"]');
        if (el) {
            const label = el.querySelector('.pyro-tab-label');
            if (label) label.textContent = title.slice(0, 28);
        }
    }
}

function pyroSlotRect(id) {
    const slot = document.getElementById('pyro_slot_' + id);
    if (!slot) return null;
    const r = slot.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
}

/** True when OS chrome (menus / modals / save dialogs) must cover the native browser layer */
function pyroOsChromeBlocking() {
    if (document.getElementById('mica-unsaved-dlg')) return true;
    if (document.getElementById('task-view')) return true;
    if (document.getElementById('setup-wizard') && document.getElementById('setup-wizard').classList.contains('open')) return true;
    const sm = document.getElementById('start-menu');
    if (sm && (sm.style.display === 'flex' || sm.classList.contains('open'))) return true;
    const qa = document.getElementById('quick-access');
    if (qa && (qa.style.display === 'flex' || qa.classList.contains('open'))) return true;
    if (document.getElementById('tb-context') || document.getElementById('mica-ctx-menu') || document.querySelector('.mica-ctx')) return true;
    // Any Jade Save / Open picker window
    if (document.querySelector('[id^="win_save_"], [id^="win_pick_"]')) return true;
    if (document.querySelector('.window[data-picker="1"]')) return true;
    return false;
}

/** Is this browser window the topmost visible Mica window? */
function pyroWindowIsTop(id) {
    const win = document.getElementById(id);
    if (!win || win.style.display === 'none' || win.dataset.minimized === '1') return false;
    const z = parseInt(win.style.zIndex || '0', 10) || 0;
    let top = true;
    document.querySelectorAll('.window').forEach(w => {
        if (w.id === id) return;
        if (w.style.display === 'none' || w.dataset.minimized === '1') return;
        const wz = parseInt(w.style.zIndex || '0', 10) || 0;
        if (wz > z) top = false;
    });
    return top;
}

function pyroHideAllNative() {
    if (!pyroNativeReady()) return;
    try { window.micaNative.browserHideAll(); } catch (e) {}
}

function pyroSyncNative(id) {
    if (!pyroNativeReady()) return;
    const tabs = window.__pyroTabs[id] || [];
    const active = window.__pyroActive[id] || 0;
    const win = document.getElementById(id);
    // Park native layer when OS chrome is up, window minimized, or another app is focused
    if (!win || win.style.display === 'none' || win.dataset.minimized === '1' || pyroOsChromeBlocking() || !pyroWindowIsTop(id)) {
        tabs.forEach(tab => {
            if (!tab || !tab.sid) return;
            try {
                if (window.micaNative.browserSetVisible) window.micaNative.browserSetVisible(tab.sid, false);
                else window.micaNative.browserGeometry(tab.sid, -4000, -4000, 10, 10);
            } catch (e) {}
        });
        return;
    }
    const rect = pyroSlotRect(id);
    if (!rect || rect.w < 20 || rect.h < 20) return;
    const t = tabs[active];
    if (!t) return;
    if (!t.sid) t.sid = pyroNewSid();
    try {
        tabs.forEach((tab, i) => {
            if (i !== active && tab.sid) {
                try {
                    if (window.micaNative.browserSetVisible) window.micaNative.browserSetVisible(tab.sid, false);
                    else window.micaNative.browserGeometry(tab.sid, -4000, -4000, 10, 10);
                } catch (e) {}
            }
        });
        if (!t._nativeReady) {
            window.micaNative.browserCreate(t.sid, rect.x, rect.y, rect.w, rect.h, t.url || 'https://www.google.com');
            t._nativeReady = true;
        } else if (window.micaNative.browserGeometryEx) {
            window.micaNative.browserGeometryEx(t.sid, rect.x, rect.y, rect.w, rect.h, true);
        } else {
            window.micaNative.browserGeometry(t.sid, rect.x, rect.y, rect.w, rect.h);
        }
        try { window.micaNative.browserFocus(t.sid); } catch (e) {}
    } catch (e) { console.warn(e); }
}

function pyroHideNativeForWindow(id) {
    if (!pyroNativeReady()) return;
    (window.__pyroTabs[id] || []).forEach(t => {
        try {
            if (!t.sid) return;
            // Soft-hide on minimize; full close only when window is gone
            if (document.getElementById(id)) {
                if (window.micaNative.browserSetVisible) window.micaNative.browserSetVisible(t.sid, false);
                else window.micaNative.browserGeometry(t.sid, -4000, -4000, 10, 10);
            } else {
                window.micaNative.browserClose(t.sid);
            }
        } catch (e) {}
    });
}

/** Keep native browser under menus / dialogs — call from UI open/close paths */
function pyroOnOsChromeChange() {
    clearTimeout(window.__pyroChromeT);
    window.__pyroChromeT = setTimeout(() => {
        Object.keys(window.__pyroTabs || {}).forEach(wid => {
            try { pyroSyncNative(wid); } catch (e) {}
        });
    }, 40);
}
window.pyroOnOsChromeChange = pyroOnOsChromeChange;

function pyroRender(id, c) {
    const tabs = window.__pyroTabs[id] || [];
    let active = window.__pyroActive[id] || 0;
    if (active >= tabs.length) active = Math.max(0, tabs.length - 1);
    window.__pyroActive[id] = active;
    const cur = tabs[active] || { title: 'New Tab', url: 'https://www.google.com', sid: pyroNewSid() };
    const marks = JSON.parse(localStorage.getItem('mica_pyro_bookmarks') || '[]');
    const tabBar = tabs.map((t, i) =>
        `<div data-pyro-tab="${i}" onclick="pyroSwitch('${id}',${i})" style="padding:6px 12px;cursor:pointer;border-right:1px solid var(--dock-border);background:${i===active?'var(--input-bg)':'transparent'};max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;display:flex;align-items:center;gap:6px;">
          <span class="pyro-tab-label">${(t.title || 'Tab').slice(0, 28)}</span>
          <span onclick="event.stopPropagation();pyroCloseTab('${id}',${i})" style="opacity:0.5;">✕</span>
        </div>`
    ).join('');
    const markMenu = marks.slice(-8).reverse().map((m, i) =>
        `<button onclick="pyroOpenBookmark('${id}',${marks.length - 1 - i})" style="font-size:11px;padding:4px 8px;">${(m.title || m.url || '').slice(0, 24)}</button>`
    ).join('');
    const native = pyroNativeReady();
    c.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;background:#1a1a1e;" id="pyro_root_${id}">
      <div style="display:flex;align-items:stretch;background:var(--well-bg);border-bottom:1px solid var(--dock-border);overflow-x:auto;">
        ${tabBar}
        <div onclick="pyroNewTab('${id}')" style="padding:6px 12px;cursor:pointer;font-weight:bold;opacity:0.7;">+</div>
      </div>
      <div style="display:flex;gap:6px;padding:8px;align-items:center;border-bottom:1px solid var(--dock-border);background:rgba(0,0,0,0.2);">
        <button onclick="pyroNav('${id}','back')" title="Back">◀</button>
        <button onclick="pyroNav('${id}','fwd')" title="Forward">▶</button>
        <button onclick="pyroNav('${id}','reload')" title="Reload">↻</button>
        <input id="pyro_url_${id}" value="${(cur.url || '').replace(/"/g, '&quot;')}" style="flex:1;padding:8px 12px;"
          onkeydown="if(event.key==='Enter')pyroGo('${id}')" placeholder="Search or enter URL">
        <button class="primary-btn" onclick="pyroGo('${id}')">Go</button>
        <button onclick="pyroBookmark('${id}')" title="Bookmark">★</button>
      </div>
      <div style="display:flex;gap:4px;padding:4px 8px;border-bottom:1px solid var(--dock-border);flex-wrap:wrap;align-items:center;min-height:28px;">
        ${markMenu || '<span style="opacity:0.4;font-size:11px;">Bookmarks appear here</span>'}
        <span style="margin-left:auto;font-size:10px;opacity:0.45;">${native ? 'Native WebEngine' : 'Proxy fallback'}</span>
      </div>
      <div id="pyro_slot_${id}" style="flex:1;position:relative;background:#111;min-height:120px;">
        ${native ? '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0.35;font-size:13px;pointer-events:none;">Native view</div>' : `<iframe id="pyro_frame_${id}" src="${pyroProxyUrl(cur.url || 'https://www.google.com').replace(/"/g, '&quot;')}" style="border:none;background:#fff;width:100%;height:100%;" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation-by-user-activation" onload="pyroSyncUrlFromFrame('${id}')"></iframe>`}
      </div>
    </div>`;
    if (window['__pyroLayout_' + id]) clearInterval(window['__pyroLayout_' + id]);
    window['__pyroLayout_' + id] = setInterval(() => {
        if (!document.getElementById('pyro_slot_' + id)) {
            clearInterval(window['__pyroLayout_' + id]);
            // Window fully gone — destroy native views
            (window.__pyroTabs[id] || []).forEach(tab => {
                try { if (tab.sid && window.micaNative) window.micaNative.browserClose(tab.sid); } catch (e) {}
            });
            return;
        }
        const win = document.getElementById(id);
        if (win && (win.style.display === 'none' || win.dataset.minimized === '1')) {
            pyroHideNativeForWindow(id);
            window['__pyroLastRect_' + id] = '';
            return;
        }
        // Always re-evaluate chrome / focus stacking (not only geometry)
        const rect = pyroSlotRect(id);
        const chrome = pyroOsChromeBlocking() ? '1' : '0';
        const top = pyroWindowIsTop(id) ? '1' : '0';
        const key = (rect ? (rect.x+','+rect.y+','+rect.w+','+rect.h) : '') + '|' + chrome + '|' + top;
        if (window['__pyroLastRect_' + id] === key) return;
        window['__pyroLastRect_' + id] = key;
        pyroSyncNative(id);
    }, 200);
}

function pyroEnsure(id) {
    if (!window.__pyroTabs) window.__pyroTabs = {};
    if (!window.__pyroTabs[id]) window.__pyroTabs[id] = [{ title: 'New Tab', url: 'https://www.google.com', sid: pyroNewSid() }];
    if (!window.__pyroActive) window.__pyroActive = {};
}

function pyroSwitch(id, i) {
    pyroEnsure(id);
    window.__pyroActive[id] = i;
    const c = document.getElementById('cont_' + id);
    if (c) pyroRender(id, c);
    setTimeout(() => pyroSyncNative(id), 50);
}

function pyroNewTab(id) {
    pyroEnsure(id);
    window.__pyroTabs[id].push({ title: 'New Tab', url: 'https://www.google.com', sid: pyroNewSid() });
    window.__pyroActive[id] = window.__pyroTabs[id].length - 1;
    const c = document.getElementById('cont_' + id);
    if (c) pyroRender(id, c);
    setTimeout(() => pyroSyncNative(id), 50);
}

function pyroCloseTab(id, i) {
    pyroEnsure(id);
    if (window.__pyroTabs[id].length <= 1) return;
    const dead = window.__pyroTabs[id][i];
    if (dead && dead.sid && pyroNativeReady()) {
        try { window.micaNative.browserClose(dead.sid); } catch (e) {}
    }
    window.__pyroTabs[id].splice(i, 1);
    if (window.__pyroActive[id] >= window.__pyroTabs[id].length)
        window.__pyroActive[id] = window.__pyroTabs[id].length - 1;
    const c = document.getElementById('cont_' + id);
    if (c) pyroRender(id, c);
    setTimeout(() => pyroSyncNative(id), 50);
}

function pyroNormalizeUrl(text) {
    let u = (text || '').trim();
    if (!u) return 'https://www.google.com';
    if (/^https?:\/\//i.test(u) || /^about:/i.test(u) || /^file:/i.test(u)) return u;
    if (u.includes(' ') || !u.includes('.')) {
        return 'https://www.google.com/search?q=' + encodeURIComponent(u);
    }
    return 'https://' + u;
}

function pyroProxyUrl(url) {
    return '/api/browser/proxy?url=' + encodeURIComponent(url) +
        (API.token ? '&token=' + encodeURIComponent(API.token) : '');
}

function pyroGo(id) {
    pyroEnsure(id);
    const input = document.getElementById('pyro_url_' + id);
    const url = pyroNormalizeUrl(input && input.value);
    const i = window.__pyroActive[id] || 0;
    window.__pyroTabs[id][i].url = url;
    window.__pyroTabs[id][i]._nativeReady = window.__pyroTabs[id][i]._nativeReady; // keep
    try { window.__pyroTabs[id][i].title = new URL(url).hostname; } catch (e) { window.__pyroTabs[id][i].title = 'Tab'; }
    if (pyroNativeReady()) {
        const tab = window.__pyroTabs[id][i];
        const sid = tab.sid || (tab.sid = pyroNewSid());
        const rect = pyroSlotRect(id);
        if (rect && !tab._nativeReady) {
            window.micaNative.browserCreate(sid, rect.x, rect.y, rect.w, rect.h, url);
            tab._nativeReady = true;
        } else if (rect) {
            window.micaNative.browserGeometry(sid, rect.x, rect.y, rect.w, rect.h);
        }
        window.micaNative.browserNavigate(sid, url);
        window.micaNative.browserFocus(sid);
        if (input) input.value = url;
        return;
    }
    const frame = document.getElementById('pyro_frame_' + id);
    if (frame) {
        frame.onload = function(){ if (typeof pyroSyncUrlFromFrame === 'function') pyroSyncUrlFromFrame(id); };
        frame.src = pyroProxyUrl(url);
    }
    if (input) input.value = url;
}

function pyroNav(id, action) {
    pyroEnsure(id);
    const i = window.__pyroActive[id] || 0;
    const tab = window.__pyroTabs[id][i];
    if (pyroNativeReady() && tab && tab.sid) {
        try {
            if (action === 'back') window.micaNative.browserBack(tab.sid);
            else if (action === 'fwd') window.micaNative.browserForward(tab.sid);
            else if (action === 'reload') window.micaNative.browserReload(tab.sid);
        } catch (e) { toast(e.message); }
        return;
    }
    const frame = document.getElementById('pyro_frame_' + id);
    if (!frame) return;
    try {
        if (action === 'back') frame.contentWindow.history.back();
        else if (action === 'fwd') frame.contentWindow.history.forward();
        else if (action === 'reload') frame.src = frame.src;
    } catch (e) {
        if (action === 'reload') frame.src = frame.src;
        else toast('Navigation limited for this page');
    }
}

function pyroBookmark(id) {
    pyroEnsure(id);
    const i = window.__pyroActive[id] || 0;
    const tab = window.__pyroTabs[id][i];
    let marks = JSON.parse(localStorage.getItem('mica_pyro_bookmarks') || '[]');
    marks.push({ title: tab.title, url: tab.url });
    localStorage.setItem('mica_pyro_bookmarks', JSON.stringify(marks));
    toast('Bookmarked ' + (tab.title || tab.url));
    const c = document.getElementById('cont_' + id);
    if (c) pyroRender(id, c);
}

function pyroOpenBookmark(id, idx) {
    const marks = JSON.parse(localStorage.getItem('mica_pyro_bookmarks') || '[]');
    const m = marks[idx];
    if (!m) return;
    pyroEnsure(id);
    const i = window.__pyroActive[id] || 0;
    window.__pyroTabs[id][i].url = m.url;
    window.__pyroTabs[id][i].title = m.title || m.url;
    const input = document.getElementById('pyro_url_' + id);
    if (input) input.value = m.url;
    pyroGo(id);
}

function pyroSyncUrlFromFrame(id) {
    try {
        const frame = document.getElementById('pyro_frame_' + id);
        if (!frame) return;
        let href = '';
        try { href = frame.contentWindow.location.href; } catch (e) { return; }
        const m = href.match(/[?&]url=([^&]+)/);
        if (!m) return;
        const real = decodeURIComponent(m[1]);
        const input = document.getElementById('pyro_url_' + id);
        if (input) input.value = real;
        pyroEnsure(id);
        const i = window.__pyroActive[id] || 0;
        if (window.__pyroTabs[id] && window.__pyroTabs[id][i]) {
            window.__pyroTabs[id][i].url = real;
            try { window.__pyroTabs[id][i].title = new URL(real).hostname; } catch (e) {}
        }
    } catch (e) {}
}

(function patchAppCloseForPyro() {
    if (window.__pyroClosePatched) return;
    const tryPatch = () => {
        if (typeof App === 'undefined' || !App.close) return false;
        const _close = App.close.bind(App);
        App.close = function(id) {
            try {
                if (Registry[id] && Registry[id].type === 'Pyro Browser') {
                    pyroHideNativeForWindow(id);
                    if (window['__pyroLayout_' + id]) clearInterval(window['__pyroLayout_' + id]);
                }
            } catch (e) {}
            return _close(id);
        };
        window.__pyroClosePatched = true;
        return true;
    };
    if (!tryPatch()) setTimeout(tryPatch, 500);
})();

window.addEventListener('mica-native-ready', () => {
    try { if (window.micaNative && API.token) window.micaNative.setSession(API.token, API.username || ''); } catch (e) {}
});


async function renderVynl(id, c) {
    const pending = App.pendingPath;
    App.pendingPath = null;
    window['vy_' + id] = { zoom: 1, rot: 0, panX: 0, panY: 0, scope: null, path: null, name: null, kind: null };
    c.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;background:#0d0d12;">
      <div style="padding:8px 10px;display:flex;gap:6px;align-items:center;border-bottom:1px solid rgba(255,255,255,0.08);flex-wrap:wrap;">
        <b style="color:#eee;">Vynl</b>
        <span id="vy_title_${id}" style="flex:1;min-width:80px;color:#aaa;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
        <button class="primary-btn" onclick="openJadePickerForVynl('${id}')">Open</button>
        <span id="vy_tools_${id}" style="display:none;gap:4px;align-items:center;">
          <button onclick="vynlZoom('${id}',-0.15)" title="Zoom out">-</button>
          <button onclick="vynlZoom('${id}',0.15)" title="Zoom in">+</button>
          <button onclick="vynlResetView('${id}')" title="Reset">1:1</button>
          <button onclick="vynlRotate('${id}')" title="Rotate">Rotate</button>
          <button onclick="vynlFit('${id}')" title="Fit">Fit</button>
        </span>
      </div>
      <div id="vy_stage_${id}" style="flex:1;display:flex;align-items:center;justify-content:center;padding:12px;overflow:hidden;color:#888;position:relative;background:#0a0a0e;">
        Open an image, audio, or video file
      </div>
      <div id="vy_status_${id}" style="padding:4px 10px;font-size:11px;opacity:0.5;border-top:1px solid rgba(255,255,255,0.06);"></div>
    </div>`;
    if (pending && pending.path) {
        await vynlLoad(id, pending.scope || 'user', pending.path, pending.name || pending.path);
    }
}

async function vynlLoad(id, scope, path, name) {
    const stage = document.getElementById('vy_stage_' + id);
    const title = document.getElementById('vy_title_' + id);
    const tools = document.getElementById('vy_tools_' + id);
    const status = document.getElementById('vy_status_' + id);
    if (title) title.textContent = name || path;
    const st = window['vy_' + id] || (window['vy_' + id] = {});
    st.zoom = 1; st.rot = 0; st.panX = 0; st.panY = 0;
    st.scope = scope; st.path = path; st.name = name;
    const ext = (name || path).split('.').pop().toLowerCase();
    try {
        let url;
        if (scope === 'host') {
            const d = await API.hostRead(path);
            if (d.binary) url = 'data:' + guessMime(ext) + ';base64,' + d.content;
            else if (ext === 'svg') url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(d.content);
            else { toast('Cannot preview this host file'); return; }
        } else {
            try {
                const r = await fetch(mediaUrl('user', path), { headers: { Authorization: 'Bearer ' + (API.token || '') } });
                if (!r.ok) throw new Error('Load failed ' + r.status);
                const blob = await r.blob();
                const ct = (blob.type || '').toLowerCase();
                if (ct.startsWith('text/') || blob.size < 64) {
                    const text = await blob.text();
                    if (text.trim().startsWith('data:')) url = text.trim();
                    else url = URL.createObjectURL(new Blob([text]));
                } else {
                    url = URL.createObjectURL(blob);
                }
            } catch (e) {
                url = mediaUrl('user', path);
            }
        }
        st.url = url;
        const isImg = ['png','jpg','jpeg','gif','webp','bmp','svg','ico'].includes(ext);
        const isAud = ['mp3','wav','ogg','flac','m4a','aac'].includes(ext);
        const isVid = ['mp4','webm','mkv','mov','avi'].includes(ext);
        st.kind = isImg ? 'image' : isAud ? 'audio' : isVid ? 'video' : 'other';
        if (tools) tools.style.display = isImg ? 'inline-flex' : 'none';
        if (isImg) {
            stage.innerHTML = '<div id="vy_viewport_' + id + '" style="width:100%;height:100%;overflow:hidden;position:relative;cursor:grab;">' +
              '<img id="vy_img_' + id + '" src="' + url.replace(/"/g, '&quot;') + '" alt="" draggable="false" ' +
              'style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:none;user-select:none;"></div>';
            vynlBindImage(id);
            setTimeout(() => vynlFit(id), 50);
            if (status) status.textContent = 'Scroll zoom · drag pan · rotate/fit tools';
        } else if (isAud) {
            stage.innerHTML = '<div style="text-align:center;width:100%;"><div style="font-size:64px;margin-bottom:16px;">Music</div>' +
              '<audio id="vy_media_' + id + '" controls autoplay src="' + url.replace(/"/g, '&quot;') + '" style="width:90%;max-width:480px;"></audio></div>';
            if (status) status.textContent = name;
        } else if (isVid) {
            stage.innerHTML = '<video id="vy_media_' + id + '" controls autoplay src="' + url.replace(/"/g, '&quot;') + '" style="max-width:100%;max-height:100%;border-radius:8px;"></video>';
            if (status) status.textContent = name;
        } else {
            stage.innerHTML = '<div>Cannot preview .' + ext + '</div>';
        }
        const vol = Number(localStorage.getItem('mica_volume') || '70') / 100;
        stage.querySelectorAll('audio,video').forEach(el => { el.volume = vol; });
    } catch (e) {
        stage.innerHTML = '<div style="color:#ff5f56;">' + (e.message || e) + '</div>';
    }
}

function vynlBindImage(id) {
    const vp = document.getElementById('vy_viewport_' + id);
    const img = document.getElementById('vy_img_' + id);
    if (!vp || !img) return;
    const st = window['vy_' + id];
    img.onload = () => vynlFit(id);
    vp.onwheel = (e) => { e.preventDefault(); vynlZoom(id, e.deltaY > 0 ? -0.1 : 0.1); };
    let dragging = false, lx = 0, ly = 0;
    vp.onpointerdown = (e) => {
        if (e.button !== 0) return;
        dragging = true; lx = e.clientX; ly = e.clientY;
        vp.setPointerCapture(e.pointerId);
        vp.style.cursor = 'grabbing';
    };
    vp.onpointermove = (e) => {
        if (!dragging) return;
        st.panX += e.clientX - lx; st.panY += e.clientY - ly;
        lx = e.clientX; ly = e.clientY;
        vynlApplyTransform(id);
    };
    vp.onpointerup = () => { dragging = false; vp.style.cursor = 'grab'; };
}

function vynlApplyTransform(id) {
    const img = document.getElementById('vy_img_' + id);
    const st = window['vy_' + id];
    if (!img || !st) return;
    img.style.transform = 'translate(calc(-50% + ' + st.panX + 'px), calc(-50% + ' + st.panY + 'px)) scale(' + st.zoom + ') rotate(' + st.rot + 'deg)';
    const status = document.getElementById('vy_status_' + id);
    if (status) status.textContent = Math.round(st.zoom * 100) + '% · ' + st.rot + ' deg';
}
function vynlZoom(id, delta) {
    const st = window['vy_' + id];
    if (!st || st.kind !== 'image') return;
    st.zoom = Math.max(0.1, Math.min(8, st.zoom + delta));
    vynlApplyTransform(id);
}
function vynlRotate(id) {
    const st = window['vy_' + id];
    if (!st || st.kind !== 'image') return;
    st.rot = (st.rot + 90) % 360;
    vynlApplyTransform(id);
}
function vynlResetView(id) {
    const st = window['vy_' + id];
    if (!st) return;
    st.zoom = 1; st.rot = 0; st.panX = 0; st.panY = 0;
    vynlApplyTransform(id);
}
function vynlFit(id) {
    const st = window['vy_' + id];
    const img = document.getElementById('vy_img_' + id);
    const vp = document.getElementById('vy_viewport_' + id);
    if (!st || !img || !vp) return;
    const nw = img.naturalWidth || 1, nh = img.naturalHeight || 1;
    const bw = vp.clientWidth - 24, bh = vp.clientHeight - 24;
    st.zoom = Math.min(bw / nw, bh / nh, 1);
    st.panX = 0; st.panY = 0;
    vynlApplyTransform(id);
}
function guessMime(ext) {
    const map = {
        mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg', flac:'audio/flac', m4a:'audio/mp4', aac:'audio/aac',
        mp4:'video/mp4', webm:'video/webm', mkv:'video/webm', mov:'video/quicktime', avi:'video/x-msvideo',
        png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', bmp:'image/bmp', svg:'image/svg+xml', ico:'image/x-icon',
        glb:'model/gltf-binary', gltf:'model/gltf+json',
    };
    return map[ext] || 'application/octet-stream';
}
function vynlMediaHtml(ext, url) {
    if (['mp3','wav','ogg','flac','m4a','aac'].includes(ext)) {
        return '<div style="text-align:center;width:100%;"><audio controls autoplay src="' + url + '" style="width:90%;max-width:480px;"></audio></div>';
    }
    if (['mp4','webm','mkv','mov','avi'].includes(ext)) {
        return '<video controls autoplay src="' + url + '" style="max-width:100%;max-height:100%;border-radius:8px;"></video>';
    }
    return '<img src="' + url + '" alt="" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;">';
}
function openJadePickerForVynl(id) {
    openJadePicker({ accept: MEDIA_EXT, onPick: (scope, path, name) => vynlLoad(id, scope, path, name) });
}
async function renderMusic(id, c) { return renderVynl(id, c); }
async function renderVideo(id, c) { return renderVynl(id, c); }



// ── Jade file picker (overrides native file inputs) ─────────────────

function openJadePicker(opts) {
    // Open-file dialog (pick existing)
    opts = opts || {};
    opts.mode = opts.mode || 'open';
    if (opts.mode === 'save' || opts.mode === 'export') return openJadeSaveDialog(opts);
    return openJadeOpenDialog(opts);
}

function openJadeOpenDialog(opts) {
    opts = opts || {};
    const accept = opts.accept || null;
    const onPick = opts.onPick || (() => {});
    const title = opts.title || 'Open';
    const id = 'win_picker_' + Date.now();
    Registry[id] = { type: 'Jade Open' };
    const win = document.createElement('div');
    win.id = id;
    win.className = 'window';
    win.dataset.picker = '1';
    win.style.left = '10vw';
    win.style.top = '8vh';
    win.style.width = '760px';
    win.style.height = '520px';
    win.style.zIndex = ++App.z;
    win.onmousedown = () => { win.style.zIndex = ++App.z; try { pyroOnOsChromeChange(); } catch (e) {} };
    try { pyroHideAllNative(); } catch (e) {}
    win.innerHTML = `
        <div class="win-header" onmousedown="dragWin(event,'${id}')">
            <span>📂 ${title}</span>
            <div class="win-controls"><div class="win-btn close-btn" onclick="micaForceClosePicker('${id}')"></div></div>
        </div>
        <div class="win-content" id="cont_${id}" style="padding:0;"></div>`;
    document.getElementById('desktop').appendChild(win);
    window['picker_accept_' + id] = accept;
    window['picker_cb_' + id] = onPick;
    window['picker_mode_' + id] = 'open';
    renderJadeFileDialog(id, 'open');
    App.updateTray();
}

function openJadeSaveDialog(opts) {
    opts = opts || {};
    const userOnSave = opts.onSave || opts.onPick || (() => {});
    const onSave = async function(folder, name, scope) {
        try {
            await userOnSave(folder, name, scope);
        } finally {
            try {
                if (typeof micaDockJump === 'function')
                    micaDockJump('Jade Explorer', (folder ? folder + '/' : '') + (name || ''));
            } catch (e) {}
        }
    };
    const suggested = opts.suggestedName || 'Untitled.txt';
    const folder = opts.folder || 'Documents';
    const title = opts.title || (opts.mode === 'export' ? 'Export' : 'Save As');
    const id = 'win_save_' + Date.now();
    Registry[id] = { type: 'Jade Save' };
    const win = document.createElement('div');
    win.id = id;
    win.className = 'window';
    win.dataset.picker = '1';
    win.style.left = '10vw';
    win.style.top = '8vh';
    win.style.width = '760px';
    win.style.height = '520px';
    win.style.zIndex = ++App.z;
    win.onmousedown = () => { win.style.zIndex = ++App.z; try { pyroOnOsChromeChange(); } catch(e) {} };
    try { pyroHideAllNative(); } catch (e) {}
    win.innerHTML = `
        <div class="win-header" onmousedown="dragWin(event,'${id}')">
            <span>💾 ${title}</span>
            <div class="win-controls"><div class="win-btn close-btn" onclick="micaForceClosePicker('${id}')"></div></div>
        </div>
        <div class="win-content" id="cont_${id}" style="padding:0;"></div>`;
    document.getElementById('desktop').appendChild(win);
    window['picker_cb_' + id] = onSave;
    window['picker_mode_' + id] = 'save';
    window['picker_suggested_' + id] = suggested;
    renderJadeFileDialog(id, 'save', folder, suggested);
    App.updateTray();
}

async function renderJadeFileDialog(id, mode, folder, suggested) {
    const c = document.getElementById('cont_' + id);
    const isSave = mode === 'save';
    const btnLabel = isSave ? 'Save' : 'Open';
    c.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;background:#1f1f23;color:#eee;font-family:'Segoe UI',sans-serif;">
      <div style="display:flex;flex:1;min-height:0;">
        <div style="width:150px;background:#222226;border-right:1px solid #3a3a40;padding:8px 0;overflow:auto;font-size:13px;">
          <div class="folder-item jade-side" onclick="exGo('${id}','user','Desktop')">🖥 Desktop</div>
          <div class="folder-item jade-side" onclick="exGo('${id}','user','Documents')">📄 Documents</div>
          <div class="folder-item jade-side" onclick="exGo('${id}','user','Downloads')">⬇ Downloads</div>
          <div class="folder-item jade-side" onclick="exGo('${id}','user','Pictures')">🖼 Pictures</div>
          <div class="folder-item jade-side" onclick="exGo('${id}','user','Music')">🎵 Music</div>
          <div class="folder-item jade-side" onclick="exGo('${id}','user','Videos')">🎬 Videos</div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;min-width:0;">
          <div style="padding:6px 8px;border-bottom:1px solid #3a3a40;display:flex;gap:6px;align-items:center;background:#25252a;">
            <button class="jade-nav-btn" onclick="exUp('${id}')">⬆</button>
            <input id="ex_addr_${id}" style="flex:1;background:#1a1a1e;border:1px solid #3a3a40;color:#eee;padding:5px 8px;border-radius:3px;"
              onkeydown="if(event.key==='Enter')exAddressGo('${id}')">
            <button class="jade-nav-btn" onclick="exRefresh('${id}')">🔄</button>
          </div>
          <div id="ex_list_${id}" style="flex:1;overflow:auto;padding:4px 0;"></div>
        </div>
      </div>
      <div style="padding:10px 12px;border-top:1px solid #3a3a40;background:#2b2b30;display:flex;gap:10px;align-items:center;">
        <label style="font-size:12px;opacity:0.7;white-space:nowrap;">File name:</label>
        <input id="dlg_name_${id}" value="${(suggested||'').replace(/"/g,'&quot;')}" style="flex:1;padding:7px 10px;border-radius:3px;border:1px solid #3a3a40;background:#1a1a1e;color:#eee;"
          ${isSave ? '' : 'readonly'} placeholder="${isSave ? 'Enter file name' : 'Selected file'}">
        <button type="button" class="primary-btn" style="min-width:90px;padding:8px 16px;"
          onclick="event.preventDefault();event.stopPropagation();jadeDialogConfirm('${id}')">${btnLabel}</button>
        <button type="button" style="padding:8px 14px;"
          onclick="event.preventDefault();event.stopPropagation();micaForceClosePicker('${id}')">Cancel</button>
      </div>
    </div>`;
    window['ex_scope_' + id] = 'user';
    window['ex_path_' + id] = folder || (isSave ? 'Documents' : 'Documents');
    window['ex_picker_' + id] = true;
    window['ex_view_' + id] = 'details';
    await exLoad(id);
}

async function renderExplorerPicker(id) {
    return renderJadeFileDialog(id, window['picker_mode_' + id] || 'open');
}

function micaForceClosePicker(id) {
    // Pickers must close immediately — no dirty prompt, no delayed leave-behind
    try { delete Registry[id]; } catch (e) {}
    const el = document.getElementById(id);
    if (el) {
        try { el.style.display = 'none'; } catch (e) {}
        try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) {
            try { el.remove(); } catch (e2) {}
        }
    }
    // Nuclear: any leftover save/open picker windows
    try {
        document.querySelectorAll('.window[data-picker="1"], [id^="win_save_"], [id^="win_picker_"]').forEach(w => {
            try { delete Registry[w.id]; } catch (e) {}
            try { w.remove(); } catch (e) {}
        });
    } catch (e) {}
    try { if (window.App && App.updateTray) App.updateTray(); } catch (e) {}
    try {
        delete window['picker_cb_' + id];
        delete window['picker_mode_' + id];
        delete window['picker_suggested_' + id];
        delete window['picker_accept_' + id];
        delete window['ex_picker_' + id];
        delete window['ex_sel_' + id];
    } catch (e) {}
    try { if (typeof pyroOnOsChromeChange === 'function') pyroOnOsChromeChange(); } catch (e) {}
}

function micaPickerMode(id) {
    const m = window['picker_mode_' + id];
    if (m === 'save' || m === 'open') return m;
    try {
        if (Registry[id] && /save/i.test(Registry[id].type || '')) return 'save';
        if (Registry[id] && /open/i.test(Registry[id].type || '')) return 'open';
    } catch (e) {}
    const el = document.getElementById(id);
    if (el && /save/i.test((el.querySelector('.win-header span') || {}).textContent || '')) return 'save';
    const btn = el && el.querySelector('.primary-btn');
    if (btn && /^save$/i.test((btn.textContent || '').trim())) return 'save';
    return 'open';
}

async function jadeDialogConfirm(id) {
    const mode = micaPickerMode(id);
    const nameEl = document.getElementById('dlg_name_' + id);
    let name = (nameEl && nameEl.value || '').trim();
    const scope = window['ex_scope_' + id] || 'user';
    const folder = window['ex_path_' + id] || '';
    const sel = window['ex_sel_' + id];
    // Snapshot BEFORE close (close clears picker_cb_*)
    const cb = window['picker_cb_' + id];
    const accept = window['picker_accept_' + id];

    if (mode === 'save') {
        if (!name && sel && sel.name && !sel.is_dir && !sel.isDir) name = sel.name;
        if (!name) {
            toast('Enter a file name');
            try { if (nameEl) nameEl.focus(); } catch (e) {}
            return;
        }
        // Close FIRST — same path Cancel uses
        micaForceClosePicker(id);
        if (typeof cb === 'function') {
            try { await cb(folder, name, scope); }
            catch (e) { toast(e.message || 'Save failed'); }
        }
        return;
    }

    if (!sel || !sel.path || sel.is_dir || sel.isDir) {
        toast('Select a file');
        return;
    }
    if (accept && accept.length) {
        const ext = (sel.name.split('.').pop() || '').toLowerCase();
        if (!accept.includes(ext) && !accept.includes('.' + ext)) {
            toast('File type not accepted');
            return;
        }
    }
    const sScope = sel.scope || scope;
    const sPath = sel.path;
    const sName = sel.name;
    micaForceClosePicker(id);
    if (typeof cb === 'function') {
        try { await cb(sScope, sPath, sName); } catch (e) { toast(e.message); }
    }
}


// Patch: after listing, if picker mode, change file open to select
const _exLoadOrig = null;


async function exPickerSelect(id, scope, path, name) {
    const accept = window['picker_accept_' + id];
    if (accept && accept.length) {
        const ext = (name.split('.').pop() || '').toLowerCase();
        if (!accept.includes(ext)) {
            toast('File type not accepted here');
            return;
        }
    }
    const cb = window['picker_cb_' + id];
    App.close(id);
    if (typeof cb === 'function') {
        try { await cb(scope, path, name); } catch (e) { toast(e.message); }
    }
}

/** Intercept native file inputs → Jade picker (except .native-uploader for true PC import into Explorer) */
document.addEventListener('click', function(e) {
    const input = e.target && e.target.closest && e.target.closest('input[type=file]');
    if (!input) return;
    if (input.classList.contains('native-uploader')) return;
    if (input.dataset.jadeBypass === '1') return;
    e.preventDefault();
    e.stopPropagation();
    const acceptStr = (input.getAttribute('accept') || '').toLowerCase();
    let accept = null;
    if (acceptStr) {
        accept = acceptStr.split(',').map(s => s.trim().replace(/^\./, '').replace('.*', '')).filter(Boolean);
        // map .mplug etc
        accept = accept.map(a => a.includes('/') ? '' : a).filter(Boolean);
    }
    openJadePicker({
        accept: accept && accept.length ? accept : null,
        onPick: async (scope, path, name) => {
            if (scope !== 'user') {
                toast('Pick a file from Home FS for installs');
                return;
            }
            try {
                const text = await loadFileText('user', path);
                // Build a File + DataTransfer to feed the input
                const file = new File([text], name, { type: 'application/octet-stream' });
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                toast('Selected ' + name);
            } catch (err) {
                // binary packages — read via raw fetch
                try {
                    const r = await fetch('/api/fs/raw?path=' + encodeURIComponent(path) + '&token=' + encodeURIComponent(API.token));
                    const blob = await r.blob();
                    const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    input.files = dt.files;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    toast('Selected ' + name);
                } catch (e2) {
                    toast(e2.message || 'Select failed');
                }
            }
        }
    });
}, true);


// ── Terminal ─────────────────────────────────────────────────────────

function renderTerminal(id, c) {
    c.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;background:#0c0c0c;color:#d4d4d4;font-family:Consolas,'Courier New',monospace;font-size:13px;">
      <div id="term_out_${id}" style="flex:1;overflow:auto;padding:12px;white-space:pre-wrap;word-break:break-word;line-height:1.4;"></div>
      <div style="display:flex;gap:8px;padding:8px 12px;border-top:1px solid #333;align-items:center;background:#111;">
        <span id="term_prompt_${id}" style="color:#4ec9b0;font-weight:600;">mica&gt;</span>
        <input id="term_in_${id}" style="flex:1;background:transparent;border:none;color:#eee;outline:none;font-family:inherit;" autocomplete="off" spellcheck="false">
      </div>
    </div>`;
    const out = document.getElementById('term_out_' + id);
    termWrite(id, 'sys', 'Mica Terminal — type help. Enable DevMode in Security for pyrouser.\n');
    const input = document.getElementById('term_in_' + id);
    input.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        const line = input.value;
        input.value = '';
        const prompt = (document.getElementById('term_prompt_' + id)?.textContent) || 'mica>';
        termWrite(id, 'cmd', prompt + ' ' + line + '\n');
        await termExec(id, line);
        out.scrollTop = out.scrollHeight;
    });
    setTimeout(() => input.focus(), 50);
    termRefreshPrompt(id);
}

function termWrite(id, kind, text) {
    const out = document.getElementById('term_out_' + id);
    if (!out) return;
    const span = document.createElement('span');
    const colors = {
        cmd: '#dcdcaa',
        sys: '#569cd6',
        ok: '#4ec9b0',
        err: '#f44747',
        warn: '#ce9178',
        out: '#d4d4d4',
        path: '#9cdcfe',
    };
    span.style.color = colors[kind] || colors.out;
    span.textContent = text;
    out.appendChild(span);
}


async function termRefreshPrompt(id) {
    try {
        const st = await API.securityStatus();
        window.__MICA_DEVMODE = !!st.devmode;
        const p = document.getElementById('term_prompt_' + id);
        if (p) p.textContent = st.devmode ? 'pyrouser>' : 'mica>';
        if (p) p.style.color = st.devmode ? '#ce9178' : '#4ec9b0';
    } catch (e) {}
}

async function termExec(id, line) {
    const out = document.getElementById('term_out_' + id);
    const cmd = (line || '').trim();
    if (!cmd) return;
    const args = cmd.split(/\s+/);
    const c0 = args[0].toLowerCase();
    const write = (s, kind) => { termWrite(id, kind || 'out', (s && s.endsWith('\n')) ? s : (s + '\n')); };;

    if (c0 === 'help') {
        write(`Core: help clear echo reboot sysinfo open close killall
Media: volume <0-100> brightness <30-100> theme <dark|obsidian|nova|light>
FS: ls [path] mkdir <path> cat <path>
Apps: open <name> studio packages settings
Security: security
python <code>
DevMode: pyrouser <cmd> | mupdate list | mupdate help`);
        return;
    }
    if (c0 === 'clear') { out.innerHTML = ''; return; }
    if (c0 === 'echo') { write(args.slice(1).join(' ')); return; }
    if (c0 === 'reboot') { write('Rebooting…'); micaSoftReboot('Terminal reboot'); return; }
    if (c0 === 'sysinfo') {
        write(`Pyron 10.2.8 • user=${API.username} • windows=${Object.keys(Registry).length} • theme=${document.body.className} • devmode=${!!window.__MICA_DEVMODE}`);
        return;
    }
    if (c0 === 'open') {
        const name = args.slice(1).join(' ');
        if (!name) return write('Usage: open <App Name>');
        App.open(name); write('Opened ' + name); return;
    }
    if (c0 === 'close' || c0 === 'killall') {
        Object.keys(Registry).forEach(wid => App.close(wid));
        write('Windows closed'); return;
    }
    if (c0 === 'minimize') {
        Object.keys(Registry).forEach(wid => App.minimize(wid));
        write('Minimized'); return;
    }
    if (c0 === 'volume' && args[1]) { qaSetVolume(args[1]); write('Volume ' + args[1]); return; }
    if (c0 === 'brightness' && args[1]) { qaSetBrightness(args[1]); write('Brightness ' + args[1]); return; }
    if (c0 === 'theme' && args[1]) {
        const map = { dark: 'theme-dark', obsidian: 'theme-obsidian', nova: 'theme-nova', light: '' };
        if (typeof applyBuiltinTheme === 'function') applyBuiltinTheme(map[args[1]] !== undefined ? map[args[1]] : args[1]);
        else applyTheme(map[args[1]] !== undefined ? map[args[1]] : args[1]);
        write('Theme ' + args[1]); return;
    }
    if (c0 === 'studio') { App.open('Beryl Studio'); write('Studio'); return; }
    if (c0 === 'packages') { App.open('Package Manager'); write('Packages'); return; }
    if (c0 === 'settings') { App.open('Amber Settings'); write('Settings'); return; }
    if (c0 === 'security') {
        try { write(JSON.stringify(await API.securityStatus(), null, 2)); } catch (e) { write(e.message); }
        return;
    }
    if (c0 === 'ls') {
        try {
            const data = await API.list(args[1] || '');
            const items = data.items || data || [];
            write(items.map(i => (i.is_dir ? '[dir] ' : '     ') + i.name).join('\n') || '(empty)');
        } catch (e) { write(e.message); }
        return;
    }
    if (c0 === 'mkdir' && args[1]) {
        try { await API.mkdir(args[1]); write('Created ' + args[1]); } catch (e) { write(e.message); }
        return;
    }
    if (c0 === 'cat' && args[1]) {
        try { write((await API.read(args[1])).content); } catch (e) { write(e.message); }
        return;
    }
    if (c0 === 'python' || c0 === 'py') {
        const code = cmd.replace(/^python\s+/, '').replace(/^py\s+/, '');
        try {
            const res = await API.exec(code);
            write(((res.stdout || '') + (res.stderr || '') + (res.error || '')) || 'OK');
        } catch (e) { write(e.message); }
        return;
    }
    if (c0 === 'mupdate') {
        if (!window.__MICA_DEVMODE) return write('mupdate requires DevMode (Settings → Security)');
        const sub = args[1] || 'help';
        if (sub === 'help') {
            write(`mupdate v2 (pyrouser)
  mupdate list
  Install via Package Manager → Updates (or drag a .mupdate)
  Public packages need Admin PIN; trusted signs install directly
  Payload: { type:"mupdate", name, version, sign, files:{path:content}, plugins:[…], scripts:[…] }`);
            return;
        }
        if (sub === 'list') {
            try { write(JSON.stringify((await API.updatesList()).updates || [], null, 2)); }
            catch (e) { write(e.message); }
            return;
        }
        write('Unknown mupdate subcommand');
        return;
    }
    if (c0 === 'pyrouser' || window.__MICA_DEVMODE) {
        const sub = c0 === 'pyrouser' ? (cmd.slice(9).trim() || 'help') : cmd;
        try {
            const res = await API.pyrouser(sub);
            write(((res.stdout || '') + (res.stderr || '') + (res.error || '')) || 'OK');
        } catch (e) { write('pyrouser: ' + e.message, 'err'); }
        await termRefreshPrompt(id);
        return;
    }
    write("Unknown command. Type 'help'.", 'err');
}

function renderPythonLab(id, c) {
    c.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;">
      <div style="padding:10px;background:var(--well-bg);border-bottom:1px solid var(--dock-border);display:flex;gap:8px;">
        <button class="primary-btn" onclick="pyRun('${id}')">▶ Run</button>
        <button onclick="document.getElementById('py_out_${id}').innerText=''">Clear</button>
        <span style="opacity:0.5;font-size:12px;align-self:center;">Pyron kernel</span>
      </div>
      <div style="display:flex;flex:1;overflow:hidden;">
        <textarea id="py_code_${id}" style="flex:1;border:none;padding:12px;resize:none;outline:none;background:rgba(0,0,0,0.35);color:#eee;font-family:Consolas,monospace;">print("Hello from Pyron!")
import math
print("π ≈", round(math.pi, 5))
</textarea>
        <pre id="py_out_${id}" style="flex:1;margin:0;padding:12px;overflow:auto;background:#0c0c0c;color:#0f0;font-family:Consolas,monospace;"></pre>
      </div>
    </div>`;
}

async function pyRun(id) {
    const code = document.getElementById('py_code_' + id).value;
    const out = document.getElementById('py_out_' + id);
    try {
        const res = await API.exec(code);
        out.innerText = ((res.stdout || '') + (res.stderr || '') + (res.error || '')) || '(no output)';
    } catch (e) { out.innerText = e.message; }
}

// ── Media players ────────────────────────────────────────────────────

async function loadMediaLibrary(id, listId, playerId, extensions, autoPath) {
    const listEl = document.getElementById(`${listId}_${id}`);
    if (!listEl) return;
    let files = [];
    for (const folder of ['Music', 'Videos', 'Downloads', 'Documents', 'Pictures', '']) {
        try {
            const { items } = await API.list(folder);
            items.filter(it => !it.is_dir && extensions.includes(it.ext)).forEach(it => files.push(it));
        } catch {}
    }
    const seen = new Set();
    files = files.filter(f => (seen.has(f.path) ? false : seen.add(f.path)));
    if (!files.length) {
        listEl.innerHTML = '<p style="opacity:0.5;padding:20px;text-align:center;">No media yet — upload via Explorer</p>';
    } else {
        listEl.innerHTML = files.map(f => `
            <div style="padding:10px;background:var(--input-bg);border-radius:8px;margin-bottom:6px;cursor:pointer;border:1px solid var(--dock-border);display:flex;justify-content:space-between;"
                 onclick="playMediaFile('${id}','${playerId}','${f.path.replace(/'/g, "\\'")}')">
              <span>${fileIcon(f.name, false)} ${f.name}</span>
              <span style="font-size:10px;opacity:0.5;">${fmtSize(f.size)}</span>
            </div>`).join('');
    }
    if (autoPath) playMediaFile(id, playerId, autoPath);
}

function playMediaFile(id, playerId, path) {
    const player = document.getElementById(`${playerId}_${id}`);
    if (!player) return;
    fetch(mediaUrl(path), { headers: authFetchHeaders() })
        .then(r => { if (!r.ok) throw new Error('Load failed'); return r.blob(); })
        .then(blob => {
            player.src = URL.createObjectURL(blob);
            player.play().catch(() => {});
            toast('Playing ' + path.split('/').pop());
        })
        .catch(e => toast(e.message));
}

// ── Settings ─────────────────────────────────────────────────────────


// ── Settings (full) ──────────────────────────────────────────────────

function renderSettings(id, c) {
    c.innerHTML = `
    <div style="display:flex;height:100%;">
      <div style="width:160px;background:var(--well-bg);border-right:1px solid var(--dock-border);padding:10px;display:flex;flex-direction:column;gap:6px;">
        <button class="primary-btn" onclick="setTab('${id}','gen')">⚙️ General</button>
        <button class="primary-btn" onclick="setTab('${id}','app')">🎨 Appearance</button>
        <button class="primary-btn" onclick="setTab('${id}','display')">🖥 Display</button>
        <button class="primary-btn" onclick="setTab('${id}','desk')">📁 Desktop</button>
        <button class="primary-btn" onclick="setTab('${id}','sec')">🔒 Security</button>
        <button class="primary-btn" onclick="setTab('${id}','sys')">🔧 System</button>
        <p style="font-size:11px;opacity:0.55;margin-top:12px;">Packages → <b>Package Manager</b></p>
      </div>
      <div id="set_view_${id}" style="flex:1;padding:16px;overflow:auto;"></div>
    </div>`;
    setTab(id, 'gen');
}

function setTab(id, tab) {
    const view = document.getElementById('set_view_' + id);
    if (!view) return;
    if (tab === 'gen') {
        view.innerHTML = `
            <h3 style="margin-top:0;">General</h3>
            <p>Logged in as: <b>${API.username}</b></p>
            <p>Firmware: <b>Pyron 10.2.8</b></p>
            <button class="primary-btn" style="margin-top:12px;" onclick="App.open('Package Manager')">Open Package Manager</button>
            <button class="primary-btn" style="margin-top:8px;" onclick="logout()">Log Out</button>`;
    } else if (tab === 'app') {
        const cur = localStorage.getItem('mica_theme') || 'theme-dark';
        const tbPos = localStorage.getItem('mica_tb_pos') || 'bottom';
        const dockOn = localStorage.getItem('mica_dock_mode') === '1';
        const pin = localStorage.getItem('mica_bubble_pin') || 'floating';
        const qaMode = localStorage.getItem('mica_qa_mode') || 'auto';
        view.innerHTML = `
            <h3 style="margin-top:0;">Appearance</h3>
            <p style="opacity:0.7;font-size:12px;">Theme</p>
            <select id="set_theme_${id}" style="width:100%;padding:10px;margin-bottom:10px;" onchange="applyBuiltinTheme(this.value);micaSet('mica_theme',this.value)">
              <option value="theme-dark">Dark</option>
              <option value="theme-obsidian">Obsidian</option>
              <option value="theme-nova">Nova</option>
              <option value="">Light</option>
            </select>
            <div id="set_themes_${id}">Loading…</div>
            <hr style="border:0;border-top:1px solid var(--dock-border);margin:14px 0;">
            <h3>Shell layout</h3>
            <label style="display:block;margin:6px 0 4px;font-size:12px;opacity:0.7;">Taskbar position</label>
            <select id="set_tb_pos_select" style="width:100%;padding:10px;" onchange="setTaskbarPos(this.value)">
              <option value="bottom">Bottom</option>
              <option value="top">Top</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
            <label style="display:flex;align-items:center;gap:8px;margin-top:12px;">
              <input type="checkbox" id="set_dock_mode" onchange="setDockMode(this.checked)"> App Dock mode
            </label>
            <label style="display:block;margin:12px 0 4px;font-size:12px;opacity:0.7;">Menu bubble</label>
            <select id="set_bubble_pin_${id}" style="width:100%;padding:10px;" onchange="setBubblePin(this.value)">
              <option value="floating">Floating</option>
              <option value="topbar">Top menu bar</option>
              <option value="taskbar">Pinned to taskbar</option>
            </select>
            <label style="display:block;margin:12px 0 4px;font-size:12px;opacity:0.7;">Quick menu mode</label>
            <select id="set_qa_mode_${id}" style="width:100%;padding:10px;" onchange="setQaMenuMode(this.value)">
              <option value="auto">Auto (follows bubble pin)</option>
              <option value="action">Action — compact (bubble)</option>
              <option value="task">Task — Windows quick settings</option>
              <option value="drop">Drop — Control Centre (top bar)</option>
            </select>
            <p style="font-size:11px;opacity:0.5;margin:6px 0 0;">Action fits the floating bubble. Task anchors to the taskbar. Drop is Control Centre style for the top menu bar.</p>
            <button class="primary-btn" style="margin-top:12px;width:100%;" onclick="openTaskView()">Task View</button>
            <label style="display:block;margin:14px 0 4px;font-size:12px;opacity:0.7;">Performance</label>
            <select id="set_perf_${id}" style="width:100%;padding:10px;" onchange="setPerfMode(this.value)">
              <option value="full">Full — liquid glass & animations</option>
              <option value="balanced">Balanced — lighter blur</option>
              <option value="performance">Performance — minimal effects</option>
            </select>
            <p style="font-size:11px;opacity:0.5;margin:6px 0 0;">Performance mode disables glass blur and window motion.</p>
            <label style="display:flex;align-items:center;gap:8px;margin-top:14px;">
              <input type="checkbox" id="set_sounds_${id}" onchange="setMicaSounds(this.checked)"> Interface sounds
            </label>
            <hr style="border:0;border-top:1px solid var(--dock-border);margin:16px 0;">
            <h3>Wallpapers</h3>
            <p style="opacity:0.65;font-size:12px;margin:0 0 8px;">Desktop — presets & recent</p>
            <div id="wp_picker_desktop" class="wp-picker-host"></div>
            <div class="wp-actions">
              <button type="button" class="wp-btn" onclick="micaPickWallpaper('desktop')">⬆ Upload from disk</button>
              <button type="button" class="wp-btn ghost" onclick="clearDesktopWallpaper()">Clear</button>
            </div>
            <p style="opacity:0.65;font-size:12px;margin:14px 0 8px;">Lock screen</p>
            <div id="wp_picker_lock" class="wp-picker-host"></div>
            <div class="wp-actions">
              <button type="button" class="wp-btn" onclick="micaPickWallpaper('lock')">⬆ Upload from disk</button>
              <button type="button" class="wp-btn ghost" onclick="clearLockWallpaper()">Clear</button>
            </div>
            <p style="font-size:11px;opacity:0.5;margin-top:12px;">Appearance saves automatically. Wallpapers stay on disk across logins.</p>`;
        const sel = document.getElementById('set_theme_' + id);
        if (sel) sel.value = cur;
        const tbs = document.getElementById('set_tb_pos_select');
        if (tbs) tbs.value = tbPos;
        const dm = document.getElementById('set_dock_mode');
        if (dm) dm.checked = dockOn;
        const bp = document.getElementById('set_bubble_pin_' + id);
        if (bp) bp.value = pin;
        const qm = document.getElementById('set_qa_mode_' + id);
        if (qm) qm.value = qaMode;
        const pf = document.getElementById('set_perf_' + id);
        if (pf) pf.value = (typeof getPerfMode === 'function' ? getPerfMode() : localStorage.getItem('mica_perf') || 'full');
        const snd = document.getElementById('set_sounds_' + id);
        if (snd) snd.checked = localStorage.getItem('mica_sounds') !== '0';
        renderThemeList(id);
        setTimeout(function(){ try { renderWallpaperPicker(); } catch (e) {} }, 40);

    } else if (tab === 'display') {
        const scale = localStorage.getItem('mica_ui_scale') || '100';
        const res = localStorage.getItem('mica_display_res') || 'native';
        const aspect = localStorage.getItem('mica_display_aspect') || 'auto';
        const anim = localStorage.getItem('mica_anim') !== '0';
        view.innerHTML = `
            <h3 style="margin-top:0;">🖥 Display</h3>
            <label style="display:block;margin:8px 0 4px;font-size:12px;opacity:0.7;">System scaling (text density)</label>
            <select id="set_scale_${id}" style="width:100%;padding:8px;" onchange="osSetScale(this.value)">
              <option value="80">80% — Compact</option>
              <option value="90">90%</option>
              <option value="100">100% — Default</option>
              <option value="110">110%</option>
              <option value="125">125% — Large</option>
              <option value="150">150% — Extra large</option>
            </select>
            <label style="display:block;margin:14px 0 4px;font-size:12px;opacity:0.7;">Resolution preview (letterbox bars)</label>
            <select id="set_res_${id}" style="width:100%;padding:8px;" onchange="osSetResolution(this.value)">
              <option value="native">Native (full window)</option>
              <option value="1920x1080">1920 × 1080 (Full HD)</option>
              <option value="1600x900">1600 × 900</option>
              <option value="1366x768">1366 × 768</option>
              <option value="1280x720">1280 × 720 (HD)</option>
              <option value="1024x768">1024 × 768</option>
            </select>
            <p style="font-size:11px;opacity:0.5;margin:6px 0 0;">Preview only — does not move menus, bubble, or windows.</p>
            <label style="display:block;margin:14px 0 4px;font-size:12px;opacity:0.7;">Aspect ratio preview</label>
            <select id="set_aspect_${id}" style="width:100%;padding:8px;" onchange="osSetAspect(this.value)">
              <option value="auto">Auto</option>
              <option value="16:9">16:9 Widescreen</option>
              <option value="16:10">16:10</option>
              <option value="4:3">4:3 Classic</option>
              <option value="21:9">21:9 Ultrawide</option>
            </select>
            <label style="display:block;margin:14px 0 4px;font-size:12px;opacity:0.7;">Clock format</label>
            <select id="set_timefmt_${id}" style="width:100%;padding:8px;" onchange="setTimeFormat(this.value)">
              <option value="12">12-hour (1:30 PM)</option>
              <option value="24">24-hour (13:30)</option>
            </select>
            <label style="display:flex;align-items:center;gap:8px;margin-top:12px;">
              <input type="checkbox" ${anim ? 'checked' : ''} onchange="osSetAnim(this.checked)"> Window animations
            </label>
            <p style="font-size:11px;opacity:0.5;margin:6px 0 0;">For liquid glass vs speed, use <b>Appearance → Performance</b>.</p>
            <button class="primary-btn" style="margin-top:14px;width:100%;" onclick="osResetDisplay()">Reset display to defaults</button>
        `;
const sc = document.getElementById('set_scale_' + id);
        if (sc) sc.value = scale;
        const rs = document.getElementById('set_res_' + id);
        if (rs) rs.value = res;
        const as = document.getElementById('set_aspect_' + id);
        if (as) as.value = aspect;
        const tf = document.getElementById('set_timefmt_' + id);
        if (tf) tf.value = (typeof getTimeFormat === 'function' ? getTimeFormat() : '12');
    } else if (tab === 'desk') {
        const hidden = JSON.parse(localStorage.getItem('mica_hidden_icons') || '[]');
        const apps = (typeof BaseApps !== 'undefined' ? BaseApps : []);
        view.innerHTML = `
            <h3 style="margin-top:0;">📁 Desktop</h3>
            <p style="font-size:12px;opacity:0.6;">Wallpapers are under <b>Display</b>.</p>
            <h4>Desktop icons</h4>
            <p style="font-size:12px;opacity:0.65;">Show or hide app shortcuts on the desktop.</p>
            <div id="set_icons_${id}" style="margin-top:8px;"></div>
            <button class="primary-btn" style="margin-top:10px;" onclick="localStorage.removeItem('mica_icon_pos');renderDesktop();toast('Icon positions reset')">Reset icon positions</button>
            <button style="margin-top:6px;" onclick="localStorage.setItem('mica_hidden_icons','[]');renderDesktop();setTab('${id}','desk');toast('All icons restored')">Restore all icons</button>
        `;
        const box = document.getElementById('set_icons_' + id);
        if (box) {
            box.innerHTML = apps.map(a => {
                const hid = hidden.includes(a.name);
                return `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--dock-border);font-size:13px;">
                  <input type="checkbox" ${hid ? '' : 'checked'} onchange="deskToggleIcon('${a.name.replace(/'/g, "\\'")}', this.checked)">
                  <span>${a.icon || '📦'} ${a.name}</span>
                </label>`;
            }).join('') || '<p style="opacity:0.5;">No apps</p>';
        }
    } else if (tab === 'sec') {
        view.innerHTML = `<div id="sec_panel_${id}">Loading security…</div>`;
        loadSecurityPanel(id);
    } else {
        const hostFs = localStorage.getItem('mica_host_fs') !== '0';
        const anim = localStorage.getItem('mica_anim') !== '0';
        view.innerHTML = `
            <h3 style="margin-top:0;">System</h3>
            <p style="font-size:12px;opacity:0.65;">Display scale, resolution &amp; aspect are under <b>Display</b>.</p>
            <button class="primary-btn" style="margin-top:8px;" onclick="setTab('${id}','display')">Open Display settings</button>
            <label style="display:flex;align-items:center;gap:8px;margin-top:16px;">
              <input type="checkbox" id="set_anim_${id}" ${anim ? 'checked' : ''} onchange="osSetAnim(this.checked)"> Window animations
            </label>
            <label style="display:flex;align-items:center;gap:8px;margin-top:8px;">
              <input type="checkbox" id="set_host_${id}" ${hostFs ? 'checked' : ''} onchange="osSetHostFs(this.checked)"> Show host drives in Explorer
            </label>
            <label style="display:block;margin:14px 0 4px;font-size:12px;opacity:0.7;">Taskbar position</label>
            <select style="width:100%;padding:8px;background:var(--input-bg);color:var(--text);" onchange="setTaskbarPos(this.value)">
              <option value="bottom">Bottom</option>
              <option value="top">Top</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
            <hr style="border:0;border-top:1px solid var(--dock-border);margin:16px 0;">
            <p style="font-size:12px;opacity:0.65;">User FS: data/users/${API.username}/</p>
            <p style="font-size:12px;opacity:0.65;">Firmware: Pyron 10.2.8</p>
            <button class="primary-btn" style="margin-top:10px;" onclick="App.open('Package Manager')">Open Package Manager</button>
            <button class="primary-btn" style="margin-top:8px;" onclick="logout()">Log Out</button>`;
    }
}

function deskToggleIcon(name, show) {
    let hidden = JSON.parse(localStorage.getItem('mica_hidden_icons') || '[]');
    if (show) hidden = hidden.filter(n => n !== name);
    else if (!hidden.includes(name)) hidden.push(name);
    localStorage.setItem('mica_hidden_icons', JSON.stringify(hidden));
    if (typeof renderDesktop === 'function') renderDesktop();
}

function osSetScale(v) {
    const n = Math.max(80, Math.min(150, Number(v) || 100));
    localStorage.setItem('mica_ui_scale', String(n));
    applyDisplayLayout();
    toast('Scale ' + n + '%');
}
function osSetAnim(on) {
    localStorage.setItem('mica_anim', on ? '1' : '0');
    document.body.classList.toggle('no-anim', !on);
    if (on && localStorage.getItem('mica_perf') === 'performance') {
        // turning anim on lifts pure performance slightly
        localStorage.setItem('mica_perf', 'balanced');
        if (typeof applyPerfMode === 'function') applyPerfMode();
    }
}
function osSetHostFs(on) {
    localStorage.setItem('mica_host_fs', on ? '1' : '0');
    toast(on ? 'Host drives enabled' : 'Host drives hidden (reopen Explorer)');
}

function osSetResolution(v) {
    localStorage.setItem('mica_display_res', v || 'native');
    applyDisplayLayout();
    toast('Resolution: ' + (v || 'native'));
}
function osSetAspect(v) {
    localStorage.setItem('mica_display_aspect', v || 'auto');
    applyDisplayLayout();
    toast('Aspect: ' + (v || 'auto'));
}
function osResetDisplay() {
    localStorage.setItem('mica_ui_scale', '100');
    localStorage.setItem('mica_display_res', 'native');
    localStorage.setItem('mica_display_aspect', 'auto');
    applyDisplayLayout();
    toast('Display reset');
}

/**
 * Concrete display model (Pyron 10.2.8):
 * - Scale: CSS font-size + --ui-scale only (NO document.zoom — that breaks mouse/menus)
 * - Resolution / aspect: decorative letterbox bars only; UI stays full-window so
 *   coordinates for context menus, windows, and the bubble stay stable.
 */
function getMicaViewport() {
    // Always full window for hit-testing / placement
    return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
}

function getLetterboxMetrics() {
    const res = localStorage.getItem('mica_display_res') || 'native';
    const aspect = localStorage.getItem('mica_display_aspect') || 'auto';
    let tw = window.innerWidth, th = window.innerHeight;
    if (res !== 'native' && res.includes('x')) {
        const parts = res.split('x').map(Number);
        const rw = parts[0], rh = parts[1];
        if (rw > 0 && rh > 0) {
            const fit = Math.min(window.innerWidth / rw, window.innerHeight / rh);
            tw = Math.max(320, Math.round(rw * fit));
            th = Math.max(240, Math.round(rh * fit));
        }
    }
    if (aspect !== 'auto' && aspect.includes(':')) {
        const parts = aspect.split(':').map(Number);
        const aw = parts[0], ah = parts[1];
        if (aw > 0 && ah > 0) {
            const ratio = aw / ah;
            if (tw / th > ratio) tw = Math.round(th * ratio);
            else th = Math.round(tw / ratio);
        }
    }
    const ox = Math.round((window.innerWidth - tw) / 2);
    const oy = Math.round((window.innerHeight - th) / 2);
    return { x: ox, y: oy, w: tw, h: th, active: !(res === 'native' && aspect === 'auto') };
}

function applyDisplayLayout() {
    // CRITICAL: never use document zoom — it desyncs mouse vs menus/bubble/windows
    try { document.documentElement.style.zoom = ''; } catch (e) {}
    window.__micaZoom = 1;

    const scalePct = Math.max(80, Math.min(150, Number(localStorage.getItem('mica_ui_scale') || 100)));
    const scale = scalePct / 100;
    document.documentElement.style.setProperty('--ui-scale', String(scale));
    // Concrete scale: root font-size drives em-based UI density without moving fixed coords
    document.documentElement.style.fontSize = (14 * scale) + 'px';
    document.body.style.fontSize = '';

    window.__micaViewport = getMicaViewport();

    const lb = getLetterboxMetrics();
    document.body.classList.toggle('mica-letterbox', !!lb.active);

    // Geometry is owned by applyTaskbarPos / CSS classes — do not punch holes here
    if (typeof applyTaskbarPos === 'function') {
        try { applyTaskbarPos(); } catch (e) {}
    }

    let box = document.getElementById('mica-res-letterbox');
    let label = document.getElementById('mica-res-label');
    if (!lb.active) {
        if (box) box.remove();
        if (label) label.remove();
        return;
    }
    if (!box) {
        box = document.createElement('div');
        box.id = 'mica-res-letterbox';
        box.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;';
        document.body.insertBefore(box, document.body.firstChild);
    }
    // Decorative bars only — do not move interactive chrome
    box.style.boxShadow =
        'inset ' + lb.x + 'px 0 0 rgba(0,0,0,0.72), inset -' + lb.x + 'px 0 0 rgba(0,0,0,0.72), inset 0 ' + lb.y + 'px 0 rgba(0,0,0,0.72), inset 0 -' + lb.y + 'px 0 rgba(0,0,0,0.72)';
    box.style.background = 'transparent';

    if (!label) {
        label = document.createElement('div');
        label.id = 'mica-res-label';
        label.style.cssText = 'position:fixed;left:8px;bottom:52px;z-index:1;pointer-events:none;font-size:10px;opacity:0.45;background:rgba(0,0,0,0.5);color:#ccc;padding:3px 8px;border-radius:4px;';
        document.body.appendChild(label);
    }
    const res = localStorage.getItem('mica_display_res') || 'native';
    const aspect = localStorage.getItem('mica_display_aspect') || 'auto';
    label.textContent = res + (aspect !== 'auto' ? ' · ' + aspect : '') + ' · scale ' + scalePct + '%';
}

function clampBubbleInViewport() {
    const el = document.getElementById('vertical-bubble');
    if (!el) return;
    const pin = (typeof getBubblePin === 'function' ? getBubblePin() : 'floating');
    if (pin !== 'floating') return;
    const maxW = window.innerWidth;
    const maxH = window.innerHeight;
    const r = el.getBoundingClientRect();
    let left = r.left;
    let top = r.top;
    const w = r.width;
    const h = r.height;
    left = Math.max(8, Math.min(left, maxW - w - 8));
    top = Math.max(8, Math.min(top, maxH - h - 8));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.right = 'auto';
    try {
        localStorage.setItem('mica_bubble_pos', JSON.stringify({ left: el.style.left, top: el.style.top }));
    } catch (e) {}
}

window.addEventListener('resize', () => {
    try { applyDisplayLayout(); } catch (e) {}
    try { if (typeof applyTaskbarPos === 'function') applyTaskbarPos(); } catch (e) {}
    try { clampBubbleInViewport(); } catch (e) {}
    try {
        const qa = document.getElementById('quick-access');
        if (qa && qa.style.display === 'flex' && typeof positionQuickAccessNearBubble === 'function')
            positionQuickAccessNearBubble();
    } catch (e) {}
    document.querySelectorAll('.window.maximized').forEach(w => {
        if (w.dataset.minimized !== '1' && typeof App !== 'undefined' && App.layoutWindowMax) App.layoutWindowMax(w);
    });
});






async function renderThemeList(id) {
    const el = document.getElementById('set_themes_' + id);
    if (!el) return;
    try {
        const data = await API.themesList();
        const themes = data.themes || [];
        if (!themes.length) {
            el.innerHTML = '<p style="opacity:0.5;font-size:12px;">No disk themes yet. Create in Studio or install .mpkg in Package Manager.</p>';
            return;
        }
        el.innerHTML = themes.map(th => `
            <div style="padding:10px;background:var(--input-bg);border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;border:1px solid var(--dock-border);">
              <span>🎨 ${th.name}</span>
              <button class="primary-btn" style="padding:6px 10px;" onclick="applyDiskTheme('${th.id}')">Apply</button>
            </div>`).join('');
    } catch (e) {
        el.innerHTML = '<p style="color:#ff5f56;font-size:12px;">' + e.message + '</p>';
    }
}

/** Clear injected custom theme CSS + inline theme overrides (preview residue). */
function micaClearThemeOverrides() {
    const style = document.getElementById('mica-theme-active');
    if (style) style.innerHTML = '';
    const preview = document.getElementById('mica-theme-preview');
    if (preview) preview.remove();
    const b = document.body;
    // Remove inline theme variables set by Studio preview / mixed applies
    ['--bg', '--win-bg', '--text', '--input-bg', '--dock-bg', '--dock-border', '--well-bg', '--accent'].forEach(k => {
        try { b.style.removeProperty(k); } catch (e) {}
    });
    try {
        b.style.removeProperty('background');
        b.style.removeProperty('color');
        // Keep wallpaper if user set one — only clear if it was a solid theme bg without wallpaper intent
    } catch (e) {}
}

function applyThemeObject(th, silent) {
    if (!th) return;
    micaClearThemeOverrides();
    const cls = th.cssClass || ('theme-' + (th.id || 'custom'));
    let style = document.getElementById('mica-theme-active');
    if (!style) {
        style = document.createElement('style');
        style.id = 'mica-theme-active';
        document.head.appendChild(style);
    }
    // Scope ALL custom rules under body.<cls> so they never bleed into other themes
    let css = '';
    if (th.cssVariables) css += `body.${cls} { ${th.cssVariables} }\n`;
    if (th.bg) css += `body.${cls} { --bg: ${th.bg}; background: ${th.bg}; }\n`;
    if (th.text) css += `body.${cls} { --text: ${th.text}; color: ${th.text}; }\n`;
    if (th.win || th.winBg) css += `body.${cls} { --win-bg: ${th.win || th.winBg}; }\n`;
    style.innerHTML = css;
    if (typeof micaSetBodyThemeClass === 'function') {
        micaSetBodyThemeClass(cls);
    } else {
        const keep = [...document.body.classList].filter(c => c && !c.startsWith('theme-'));
        document.body.className = [cls].concat(keep).filter(Boolean).join(' ').trim();
    }
    localStorage.setItem('mica_theme', cls);
    localStorage.setItem('mica_theme_is_custom', '1');
    localStorage.setItem('mica_theme_disk_id', th.id || '');
    if (th.wp) {
        document.body.style.setProperty('background-image', 'url(' + th.wp + ')', 'important');
        document.body.style.setProperty('background-size', 'cover', 'important');
        document.body.style.setProperty('background-position', 'center', 'important');
    } else {
        try { if (typeof applyDesktopWallpaper === 'function') applyDesktopWallpaper(); } catch (e) {}
    }
    if (!silent) toast('Theme applied: ' + (th.name || cls));
}

async function applyDiskTheme(themeId) {
    try {
        await API.themesActivate(themeId, null);
        const data = await API.themesList();
        const th = (data.themes || []).find(x => x.id === themeId);
        if (th) applyThemeObject(th);
        else {
            const active = await API.themesActive();
            if (active && active.theme) applyThemeObject(active.theme);
        }
    } catch (e) { toast(e.message); }
}

/** legacy index-based apply — maps to disk list order if still used */
async function applyCustomTheme(index, silent) {
    try {
        const data = await API.themesList();
        const th = (data.themes || [])[index];
        if (!th) return;
        await API.themesActivate(th.id, null);
        applyThemeObject(th, silent);
    } catch (e) {
        if (!silent) toast(e.message);
    }
}


/* ═══════════════════════════════════════════════════════════════
   Wallpaper system v3 — disk-backed, persistent, recent gallery
   Meta (small): localStorage mica_wp_desk_meta / mica_wp_lock_meta
   Full image: Pictures/Wallpapers/* + Pictures/.wallpaper_{desktop|lock}
   Recent: Pictures/.wallpaper_recent.json + localStorage mica_wp_recent
   ═══════════════════════════════════════════════════════════════ */

const MICA_WP_PRESETS = {
    aurora_monterey: { id: 'aurora_monterey', name: 'Aurora', url: '/static/wallpapers/aurora_monterey.jpg' },
    bloom_ventura: { id: 'bloom_ventura', name: 'Bloom', url: '/static/wallpapers/bloom_ventura.jpg' },
};

function micaWpMetaKey(target) {
    return target === 'lock' ? 'mica_wp_lock_meta' : 'mica_wp_desk_meta';
}
function micaWpGetMeta(target) {
    try { return JSON.parse(localStorage.getItem(micaWpMetaKey(target)) || 'null'); } catch (e) { return null; }
}
function micaWpSetMeta(target, meta) {
    try {
        if (meta) localStorage.setItem(micaWpMetaKey(target), JSON.stringify(meta));
        else localStorage.removeItem(micaWpMetaKey(target));
    } catch (e) {}
}
function micaWpRecentGet() {
    try {
        const a = JSON.parse(localStorage.getItem('mica_wp_recent') || '[]');
        return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
}
function micaWpRecentSave(list) {
    const slim = (list || []).slice(0, 5);
    try { localStorage.setItem('mica_wp_recent', JSON.stringify(slim)); } catch (e) {}
    return slim;
}
async function micaWpRecentPush(entry) {
    // entry: { id, name, path, thumb }
    let list = micaWpRecentGet().filter(x => x && x.id !== entry.id && x.path !== entry.path);
    list.unshift(entry);
    list = list.slice(0, 5);
    micaWpRecentSave(list);
    try {
        if (API.token) {
            await API.mkdir('Pictures');
            await API.mkdir('Pictures/Wallpapers');
            await API.write('Pictures/.wallpaper_recent.json', JSON.stringify(list));
        }
    } catch (e) {}
    return list;
}
async function micaWpRecentLoadFromDisk() {
    if (!API.token) return micaWpRecentGet();
    try {
        const d = await API.read('Pictures/.wallpaper_recent.json');
        if (d && d.content) {
            const list = JSON.parse(typeof d.content === 'string' ? d.content : '[]');
            if (Array.isArray(list)) {
                micaWpRecentSave(list);
                return list;
            }
        }
    } catch (e) {}
    return micaWpRecentGet();
}

function micaWpResolveUrl(meta) {
    if (!meta) return null;
    if (meta.type === 'preset' && MICA_WP_PRESETS[meta.id]) return MICA_WP_PRESETS[meta.id].url;
    if (meta.type === 'url' && meta.url) return meta.url;
    if (meta.dataUrl) return meta.dataUrl;
    if (meta.url) return meta.url;
    return null;
}

function micaWpApplyTo(el, url) {
    if (!el) return;
    if (!url) {
        el.style.removeProperty('background-image');
        return;
    }
    el.style.setProperty('background-image', 'url("' + String(url).replace(/"/g, '\\"') + '")', 'important');
    el.style.setProperty('background-size', 'cover', 'important');
    el.style.setProperty('background-position', 'center', 'important');
    el.style.setProperty('background-repeat', 'no-repeat', 'important');
    if (el === document.body) {
        el.style.setProperty('background-attachment', 'fixed', 'important');
    }
}

async function micaWpLoadFileAsDataUrl(path) {
    if (!path || !API.token) return null;
    try {
        const d = await API.read(path);
        if (!d || d.content == null) return null;
        const c = d.content;
        if (typeof c === 'string' && c.startsWith('data:')) return c;
        // binary may be base64
        if (typeof c === 'string' && c.startsWith('data:')) return c;
        if (typeof c === 'string' && (c.startsWith('/9j/') || c.startsWith('iVBOR'))) {
            const mime = c.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
            return 'data:' + mime + ';base64,' + c;
        }
        if (typeof c === 'string' && c.length > 32) {
            // assume data url or raw - if looks like path skip
            if (c.startsWith('http') || c.startsWith('/static')) return c;
            if (c.startsWith('{')) return null;
            return c.startsWith('data:') ? c : ('data:image/jpeg;base64,' + c);
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function applyDesktopWallpaper(override) {
    let url = override || null;
    if (!url) {
        const meta = micaWpGetMeta('desktop');
        url = micaWpResolveUrl(meta);
        if (!url && meta && meta.type === 'file' && meta.path) {
            url = await micaWpLoadFileAsDataUrl(meta.path);
            if (url) {
                // cache small ref only; keep path as source of truth
                meta._cached = true;
            }
        }
        // legacy fallback
        if (!url) {
            try { url = localStorage.getItem('mica_wp_desktop'); } catch (e) {}
        }
    }
    micaWpApplyTo(document.body, url);
}

async function applyLockWallpaper(override) {
    const ls = document.getElementById('lock-screen');
    if (!ls) return;
    let url = override || null;
    if (!url) {
        const meta = micaWpGetMeta('lock');
        url = micaWpResolveUrl(meta);
        if (!url && meta && meta.type === 'file' && meta.path) {
            url = await micaWpLoadFileAsDataUrl(meta.path);
        }
        if (!url) {
            try { url = localStorage.getItem('mica_wp_lock'); } catch (e) {}
        }
    }
    micaWpApplyTo(ls, url);
}

async function micaWpPersistActive(target, meta, dataUrlOptional) {
    micaWpSetMeta(target, meta);
    // Clear legacy giant keys to free quota
    try {
        localStorage.removeItem(target === 'lock' ? 'mica_wp_lock' : 'mica_wp_desktop');
    } catch (e) {}
    if (!API.token) return;
    try {
        await API.mkdir('Pictures');
        await API.mkdir('Pictures/Wallpapers');
        const metaPath = target === 'lock' ? 'Pictures/.wallpaper_lock_meta.json' : 'Pictures/.wallpaper_desktop_meta.json';
        await API.write(metaPath, JSON.stringify(meta));
        // Also write a marker file the old restore path understands when dataUrl provided
        if (dataUrlOptional && typeof dataUrlOptional === 'string' && dataUrlOptional.startsWith('data:')) {
            const blobPath = target === 'lock' ? 'Pictures/.wallpaper_lock' : 'Pictures/.wallpaper_desktop';
            // Prefer storing path reference only for large files; store data for reliability of current
            try {
                await API.write(blobPath, dataUrlOptional);
            } catch (e) {
                // quota / size — store path only
                await API.write(blobPath, JSON.stringify({ ref: meta.path || meta.id, type: meta.type }));
            }
        } else if (meta.type === 'preset') {
            const blobPath = target === 'lock' ? 'Pictures/.wallpaper_lock' : 'Pictures/.wallpaper_desktop';
            await API.write(blobPath, JSON.stringify({ type: 'preset', id: meta.id }));
        }
    } catch (e) { console.warn('wp persist', e); }
}

async function applyPresetWallpaper(id, target) {
    const preset = MICA_WP_PRESETS[id];
    if (!preset) return toast('Unknown preset');
    const meta = { type: 'preset', id: preset.id, name: preset.name, url: preset.url };
    await micaWpPersistActive(target || 'desktop', meta, null);
    if ((target || 'desktop') === 'lock') await applyLockWallpaper(preset.url);
    else await applyDesktopWallpaper(preset.url);
    try { renderWallpaperPicker(); } catch (e) {}
    toast((target === 'lock' ? 'Lock' : 'Desktop') + ': ' + preset.name);
}


/** Pick wallpaper image via Jade Explorer (not Windows file dialog) */
function micaPickWallpaper(target) {
    if (typeof openJadePicker !== 'function') {
        toast('Jade picker unavailable');
        return;
    }
    openJadePicker({
        accept: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', 'image/*'],
        title: target === 'lock' ? 'Choose lock wallpaper' : 'Choose desktop wallpaper',
        folder: 'Pictures',
        onPick: async (scope, path, name) => {
            try {
                const full = (path ? (String(path).replace(/\/$/, '') + '/') : '') + name;
                let dataUrl = null;
                if (typeof micaWpLoadFileAsDataUrl === 'function') {
                    dataUrl = await micaWpLoadFileAsDataUrl(full);
                }
                if (!dataUrl && API.read) {
                    const d = await API.read(full);
                    if (d && d.content) {
                        const c = d.content;
                        if (typeof c === 'string' && c.startsWith('data:')) dataUrl = c;
                        else if (typeof c === 'string') dataUrl = (c.startsWith('/9j/') ? 'data:image/jpeg;base64,' : 'data:image/png;base64,') + c;
                    }
                }
                if (!dataUrl) { toast('Could not read image'); return; }
                let thumb = null;
                try { thumb = await micaWpMakeThumb(dataUrl, 160, 90); } catch (e) {}
                const ts = Date.now();
                const id = 'jade_' + ts;
                const meta = { type: 'file', id, name: name || 'Wallpaper', path: full, thumb };
                await micaWpRecentPush({ id, name: meta.name, path: full, thumb });
                await micaWpPersistActive(target === 'lock' ? 'lock' : 'desktop', meta, dataUrl);
                if (target === 'lock') await applyLockWallpaper(dataUrl);
                else await applyDesktopWallpaper(dataUrl);
                try { renderWallpaperPicker(); } catch (e) {}
                toast((target === 'lock' ? 'Lock' : 'Desktop') + ' wallpaper set');
            } catch (e) {
                toast(e.message || 'Wallpaper failed');
            }
        }
    });
}

function setDesktopWallpaper(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    micaWpIngestUpload(f, 'desktop');
    try { e.target.value = ''; } catch (err) {}
}
function setLockWallpaper(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    micaWpIngestUpload(f, 'lock');
    try { e.target.value = ''; } catch (err) {}
}

async function micaWpIngestUpload(file, target) {
    if (!file) return;
    toast('Saving wallpaper…');
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
    // Build a small thumb for recent gallery (canvas)
    let thumb = null;
    try {
        thumb = await micaWpMakeThumb(dataUrl, 160, 90);
    } catch (e) {}
    const ts = Date.now();
    const safe = String(file.name || 'wallpaper').replace(/[^\w.\-]+/g, '_').slice(0, 40);
    const path = 'Pictures/Wallpapers/wp_' + ts + '_' + safe;
    const id = 'up_' + ts;
    try {
        if (API.token) {
            await API.mkdir('Pictures');
            await API.mkdir('Pictures/Wallpapers');
            await API.write(path, dataUrl);
        }
    } catch (e) {
        console.warn('wp write', e);
    }
    const meta = { type: 'file', id, name: file.name || 'Upload', path, thumb: thumb || null };
    await micaWpRecentPush({ id, name: meta.name, path, thumb: thumb || dataUrl.slice(0, 0) || thumb });
    // If thumb failed store tiny placeholder path only
    if (!meta.thumb && thumb) meta.thumb = thumb;
    await micaWpPersistActive(target, meta, dataUrl);
    if (target === 'lock') await applyLockWallpaper(dataUrl);
    else await applyDesktopWallpaper(dataUrl);
    try { renderWallpaperPicker(); } catch (e) {}
    toast((target === 'lock' ? 'Lock' : 'Desktop') + ' wallpaper saved');
}

function micaWpMakeThumb(dataUrl, w, h) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            try {
                const cv = document.createElement('canvas');
                cv.width = w; cv.height = h;
                const ctx = cv.getContext('2d');
                const scale = Math.max(w / img.width, h / img.height);
                const sw = w / scale, sh = h / scale;
                const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
                resolve(cv.toDataURL('image/jpeg', 0.7));
            } catch (e) { reject(e); }
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
}

async function clearDesktopWallpaper() {
    micaWpSetMeta('desktop', null);
    try { localStorage.removeItem('mica_wp_desktop'); } catch (e) {}
    try {
        if (API.token) {
            await API.remove('Pictures/.wallpaper_desktop');
            await API.remove('Pictures/.wallpaper_desktop_meta.json');
        }
    } catch (e) {}
    document.body.style.removeProperty('background-image');
    try { renderWallpaperPicker(); } catch (e) {}
    toast('Desktop wallpaper cleared');
}

async function clearLockWallpaper() {
    micaWpSetMeta('lock', null);
    try { localStorage.removeItem('mica_wp_lock'); } catch (e) {}
    try {
        if (API.token) {
            await API.remove('Pictures/.wallpaper_lock');
            await API.remove('Pictures/.wallpaper_lock_meta.json');
        }
    } catch (e) {}
    const ls = document.getElementById('lock-screen');
    if (ls) ls.style.removeProperty('background-image');
    try { renderWallpaperPicker(); } catch (e) {}
    toast('Lock wallpaper cleared');
}

async function applyRecentWallpaper(id, target) {
    const list = micaWpRecentGet();
    const entry = list.find(x => x.id === id);
    if (!entry) return toast('Wallpaper not found');
    let url = entry.thumb;
    if (entry.path) {
        const full = await micaWpLoadFileAsDataUrl(entry.path);
        if (full) url = full;
    }
    if (!url) return toast('Could not load wallpaper');
    const meta = { type: 'file', id: entry.id, name: entry.name, path: entry.path, thumb: entry.thumb };
    await micaWpPersistActive(target || 'desktop', meta, url.startsWith('data:') ? url : null);
    if ((target || 'desktop') === 'lock') await applyLockWallpaper(url);
    else await applyDesktopWallpaper(url);
    await micaWpRecentPush(entry);
    try { renderWallpaperPicker(); } catch (e) {}
    toast('Wallpaper applied');
}

/** Unified quick-select UI used by Settings (and optionally Quick Menu) */
function renderWallpaperPicker(rootId) {
    const desk = document.getElementById(rootId || 'wp_picker_desktop');
    const lock = document.getElementById('wp_picker_lock');
    const targets = [];
    if (desk) targets.push({ el: desk, target: 'desktop' });
    if (lock) targets.push({ el: lock, target: 'lock' });
    if (!targets.length) return;
    const recent = micaWpRecentGet();
    const activeDesk = micaWpGetMeta('desktop');
    const activeLock = micaWpGetMeta('lock');
    targets.forEach(({ el, target }) => {
        const active = target === 'lock' ? activeLock : activeDesk;
        let html = '<div class="wp-gallery">';
        // Presets
        Object.values(MICA_WP_PRESETS).forEach(p => {
            const sel = active && active.type === 'preset' && active.id === p.id ? ' selected' : '';
            html += '<button type="button" class="wp-preset-card' + sel + '" data-wp-preset="' + p.id + '" data-wp-target="' + target + '">' +
              '<img src="' + p.url + '" alt="' + p.name + '"><span>' + p.name + '</span></button>';
        });
        // Recent uploads
        recent.forEach(r => {
            const sel = active && active.type === 'file' && (active.id === r.id || active.path === r.path) ? ' selected' : '';
            const src = r.thumb || '';
            html += '<button type="button" class="wp-preset-card' + sel + '" data-wp-recent="' + r.id + '" data-wp-target="' + target + '">' +
              (src ? '<img src="' + src + '" alt="">' : '<div class="wp-ph">📄</div>') +
              '<span>' + String(r.name || 'Upload').replace(/</g,'').slice(0, 18) + '</span></button>';
        });
        html += '</div>';
        el.innerHTML = html;
        el.querySelectorAll('[data-wp-preset]').forEach(btn => {
            btn.onclick = () => applyPresetWallpaper(btn.getAttribute('data-wp-preset'), btn.getAttribute('data-wp-target'));
        });
        el.querySelectorAll('[data-wp-recent]').forEach(btn => {
            btn.onclick = () => applyRecentWallpaper(btn.getAttribute('data-wp-recent'), btn.getAttribute('data-wp-target'));
        });
    });
}

async function restoreWallpapersFromDisk() {
    // Load recent list + meta from disk, then apply
    await micaWpRecentLoadFromDisk();
    if (API.token) {
        for (const target of ['desktop', 'lock']) {
            try {
                const metaPath = target === 'lock' ? 'Pictures/.wallpaper_lock_meta.json' : 'Pictures/.wallpaper_desktop_meta.json';
                const d = await API.read(metaPath);
                if (d && d.content) {
                    const meta = typeof d.content === 'string' ? JSON.parse(d.content) : d.content;
                    if (meta && meta.type) micaWpSetMeta(target, meta);
                }
            } catch (e) {}
            // Legacy blob recovery
            if (!micaWpGetMeta(target)) {
                try {
                    const blobPath = target === 'lock' ? 'Pictures/.wallpaper_lock' : 'Pictures/.wallpaper_desktop';
                    const d = await API.read(blobPath);
                    if (d && d.content) {
                        const c = d.content;
                        if (typeof c === 'string' && c.startsWith('data:')) {
                            micaWpSetMeta(target, { type: 'url', dataUrl: c, name: 'Saved' });
                        } else if (typeof c === 'string' && c.trim().startsWith('{')) {
                            try {
                                const ref = JSON.parse(c);
                                if (ref.type === 'preset' && ref.id) micaWpSetMeta(target, { type: 'preset', id: ref.id, url: (MICA_WP_PRESETS[ref.id] || {}).url });
                                else if (ref.ref) micaWpSetMeta(target, { type: 'file', path: ref.ref });
                            } catch (e2) {}
                        }
                    }
                } catch (e) {}
            }
        }
    }
    await applyDesktopWallpaper();
    await applyLockWallpaper();
    try { renderWallpaperPicker(); } catch (e) {}
}

async function applyBuiltinTheme(cls) {
    micaClearThemeOverrides();
    // Drop any leftover custom theme-* class before applying builtin
    if (typeof micaSetBodyThemeClass === 'function') micaSetBodyThemeClass(cls || 'theme-dark');
    else applyTheme(cls || 'theme-dark');
    localStorage.setItem('mica_theme', cls || 'theme-dark');
    localStorage.setItem('mica_theme_is_custom', '0');
    localStorage.removeItem('mica_theme_disk_id');
    try { if (typeof applyDesktopWallpaper === 'function') applyDesktopWallpaper(); } catch (e) {}
    try {
        if (typeof API !== 'undefined' && API.token && API.themesActivate) {
            await API.themesActivate(null, cls || 'theme-dark');
        }
    } catch (e) {}
    try { if (typeof reassertShellLayout === 'function') reassertShellLayout(); } catch (e) {}
}

async function restorePersistedTheme() {
    try {
        const active = await API.themesActive();
        if (active && active.mode === 'custom' && active.theme) {
            applyThemeObject(active.theme, true);
            try { applyDesktopWallpaper(); } catch (e) {}
            return;
        }
        if (active && active.mode === 'builtin') {
            applyTheme(active.class || 'theme-dark');
            try { applyDesktopWallpaper(); } catch (e) {}
            return;
        }
    } catch (e) {
        console.warn('theme restore', e);
    }
    const cls = localStorage.getItem('mica_theme') || 'theme-dark';
    applyTheme(cls);
    try { applyDesktopWallpaper(); } catch (e) {}
}

async function saveThemeToDisk(themeObj) {
    const saved = await API.themesSave(themeObj);
    await API.themesActivate(saved.theme.id, null);
    applyThemeObject(saved.theme, true);
    return saved.theme;
}


async function refreshPackageList(id) {
    const el = document.getElementById('pkg_list_' + id);
    if (!el) return;
    try {
        const { items } = await API.list('Apps');
        const pkgs = items.filter(i => !i.is_dir && ['.mapp', '.mpkg', '.mupdate', '.py'].includes(i.ext));
        if (!pkgs.length) {
            el.innerHTML = '<p style="opacity:0.5;">No packages in Apps/</p>';
            return;
        }
        el.innerHTML = pkgs.map(p => `
            <div style="padding:8px 10px;background:var(--input-bg);border-radius:8px;margin-bottom:4px;border:1px solid var(--dock-border);font-size:13px;">
              📦 ${p.name}
            </div>`).join('');
    } catch {
        el.innerHTML = '<p style="opacity:0.5;">Apps/ folder empty</p>';
    }
}

function refreshPluginList(id) {
    const el = document.getElementById('plugin_list_' + id);
    if (!el) return;
    const plugins = JSON.parse(localStorage.getItem('mica_py_plugins') || '[]');
    if (!plugins.length) {
        el.innerHTML = '<p style="opacity:0.5;font-size:12px;">No Python plugins installed.</p>';
        return;
    }
    el.innerHTML = plugins.map((p, i) => `
        <div style="padding:8px 10px;background:var(--input-bg);border-radius:8px;margin:4px 0;display:flex;justify-content:space-between;align-items:center;border:1px solid var(--dock-border);">
          <span>🐍 ${p.name}</span>
          <span>
            <button onclick="runPyPlugin(${i})" style="margin-right:4px;">▶ Run</button>
            <button onclick="editPlugin(${i})" style="margin-right:4px;">Edit</button>
            <button onclick="removePlugin(${i})" style="color:#ff5f56;">Remove</button>
          </span>
        </div>`).join('');
}

function refreshUpdateList(id) {
    const el = document.getElementById('update_list_' + id);
    if (!el) return;
    const updates = JSON.parse(localStorage.getItem('mica_updates') || '[]');
    if (!updates.length) {
        el.innerHTML = '<p style="opacity:0.5;font-size:12px;">No updates installed.</p>';
        return;
    }
    el.innerHTML = updates.map(u => `
        <div style="padding:10px;background:var(--input-bg);border-radius:8px;margin:6px 0;border:1px solid var(--dock-border);">
          <b>${u.name}</b> v${u.version || '?'}<br>
          <small style="opacity:0.6;">${u.changelog || ''}</small>
          <br><button style="margin-top:6px;color:#ff5f56;" onclick="removeMUpdate('${(u.name || '').replace(/'/g, "\\'")}','${u.version || ''}')">Remove</button>
        </div>`).join('');
}

async function runPyPlugin(index) {
    const plugins = JSON.parse(localStorage.getItem('mica_py_plugins') || '[]');
    const p = plugins[index];
    if (!p) return;
    try {
        const res = await API.runFile(p.path);
        const msg = ((res.stdout || '') + (res.error || '')).trim() || 'OK (no output)';
        toast(msg.slice(0, 160));
        console.log('plugin', p.name, res);
    } catch (e) {
        toast(e.message);
    }
}

async function editPlugin(index) {
    const plugins = JSON.parse(localStorage.getItem('mica_py_plugins') || '[]');
    const p = plugins[index];
    if (!p) return;
    App.open('Ruby Editor');
    setTimeout(async () => {
        const wins = Object.keys(Registry).filter(k => Registry[k].type === 'Ruby Editor');
        const id = wins[wins.length - 1];
        if (!id) return;
        try {
            const d = await API.read(p.path);
            document.getElementById('re_name_' + id).value = p.path;
            document.getElementById('re_text_' + id).value = d.content;
        } catch (e) {
            document.getElementById('re_name_' + id).value = p.path;
            toast(e.message);
        }
    }, 200);
}

async function removePlugin(index) {
    let plugins = JSON.parse(localStorage.getItem('mica_py_plugins') || '[]');
    const p = plugins[index];
    if (!p || !confirm('Remove plugin ' + p.name + '?')) return;
    try { await API.remove(p.path); } catch (e) {}
    plugins.splice(index, 1);
    localStorage.setItem('mica_py_plugins', JSON.stringify(plugins));
    toast('Plugin removed');
}

async function removeMUpdate(name, version) {
    let updates = JSON.parse(localStorage.getItem('mica_updates') || '[]');
    let plugins = JSON.parse(localStorage.getItem('mica_py_plugins') || '[]');
    const id = name + '@' + version;
    updates = updates.filter(u => !(u.name === name && String(u.version) === String(version)));
    const doomed = plugins.filter(p => p.fromUpdate === id);
    for (const p of doomed) {
        try { await API.remove(p.path); } catch (e) {}
    }
    plugins = plugins.filter(p => p.fromUpdate !== id);
    localStorage.setItem('mica_updates', JSON.stringify(updates));
    localStorage.setItem('mica_py_plugins', JSON.stringify(plugins));
    toast('Removed ' + name);
}


// ── Package installer (.mapp .mpkg .py .mupdate .mica) — Python plugins ─

async function installPackageFile(e, settingsId) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const name = f.name.toLowerCase();
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const raw = ev.target.result;
            if (name.endsWith('.mplug') || name.endsWith('.py') || name.endsWith('.js')) {
                const res = await API.pluginsInstall(raw, f.name);
                toast('Plugin installed: ' + res.name);
                micaSoftReboot('Plugin installed — rebooting…');
                return;
            } else if (name.endsWith('.mapp') || name.endsWith('.mpkg') || name.endsWith('.mupdate') || name.endsWith('.mica')) {
                await installEncodedPackage(f.name, raw);
            } else {
                toast('Unsupported package type');
            }
            if (settingsId) {
                refreshPackageList(settingsId);
                refreshPluginList(settingsId);
                refreshUpdateList(settingsId);
                renderThemeList(settingsId);
            }
        } catch (err) {
            console.error(err);
            toast('Install failed: ' + (err.message || err));
        }
    };
    reader.readAsText(f);
    e.target.value = '';
}

async function installPyPlugin(filename, code) {
    const pname = filename.replace(/\.py$/i, '');
    const path = 'Plugins/' + (filename.toLowerCase().endsWith('.py') ? filename : filename + '.py');
    try { await API.mkdir('Plugins'); } catch (e) {}
    await API.write(path, code);
    let plugins = JSON.parse(localStorage.getItem('mica_py_plugins') || '[]');
    plugins = plugins.filter(p => p.name !== pname);
    plugins.push({ name: pname, path: path, fromUpdate: null });
    localStorage.setItem('mica_py_plugins', JSON.stringify(plugins));
    toast('Python plugin installed: ' + pname);
}

function safeAtob(s) {
    try {
        let t = String(s || '').replace(/\s/g, '');
        if (t.includes(',')) t = t.split(',').pop();
        t += '='.repeat((4 - (t.length % 4)) % 4);
        return atob(t);
    } catch (e) {
        return null;
    }
}

function decodePackageText(raw) {
    let text = String(raw || '').trim();
    if (!text) throw new Error('Empty package');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    if (text.startsWith('{')) return text;
    // data URL
    if (text.startsWith('data:') && text.includes(',')) {
        const payload = text.split(',').pop();
        const decoded = safeAtob(payload);
        if (decoded) {
            try { return decodeURIComponent(decoded); } catch { return decoded; }
        }
    }
    // base64 of URI-encoded or plain JSON
    const decoded = safeAtob(text);
    if (decoded) {
        try {
            const uri = decodeURIComponent(decoded);
            if (uri.trim().startsWith('{')) return uri;
        } catch (e) {}
        if (decoded.trim().startsWith('{')) return decoded;
        // nested base64
        const nested = safeAtob(decoded);
        if (nested) {
            try {
                const uri2 = decodeURIComponent(nested);
                if (uri2.trim().startsWith('{')) return uri2;
            } catch (e) {}
            if (nested.trim().startsWith('{')) return nested;
        }
    }
    // last resort: return as-is
    return text;
}

function parsePackageObject(raw) {
    // Accept plain JSON, URI-encoded JSON, base64 JSON, or data: URLs
    let text = '';
    try {
        if (typeof decodePackageText === 'function') text = decodePackageText(raw);
        else text = String(raw || '');
    } catch (e) {
        text = String(raw || '');
    }
    text = (text || '').trim();
    const attempts = [];
    attempts.push(text);
    try { attempts.push(decodeURIComponent(text)); } catch (e) {}
    try {
        // base64
        const clean = text.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
        const pad = '='.repeat((4 - (clean.length % 4)) % 4);
        const decoded = atob(clean + pad);
        attempts.push(decoded);
        try { attempts.push(decodeURIComponent(decoded)); } catch (e) {}
    } catch (e) {}
    for (const a of attempts) {
        if (!a) continue;
        const s = a.trim();
        if (!s.startsWith('{') && !s.startsWith('[')) continue;
        try { return JSON.parse(s); } catch (e) {}
    }
    throw new Error('Invalid package JSON (could not decode .mapp / .mupdate payload)');
}

async function installEncodedPackage(filename, raw) {
    const d = parsePackageObject(raw);
    const lower = filename.toLowerCase();

    if (d.type === 'mapp' || lower.endsWith('.mapp')) {
        const result = await API.appsInstall(
            btoa(unescape(encodeURIComponent(JSON.stringify(d)))),
            filename
        );
        let custom = JSON.parse(localStorage.getItem('mica_custom_apps') || '[]');
        custom = custom.filter(a => a.name !== result.name);
        custom.push({ name: result.name, icon: result.icon || '📦', icon_data: result.icon_data || '', id: result.id, format: result.format });
        localStorage.setItem('mica_custom_apps', JSON.stringify(custom));
        await refreshUserApps();
        renderDesktop();
        toast('App installed: ' + result.name + (result.format >= 2 ? ' (mapp v2)' : ' (legacy)'));
        return;
    }

    if (d.type === 'mpkg' || lower.endsWith('.mpkg')) {
        const th = await saveThemeToDisk({
            name: d.name || 'Theme',
            id: d.id || d.cssClass,
            cssClass: d.cssClass,
            cssVariables: d.cssVariables,
            bg: d.bg,
            text: d.text,
            wp: d.wp,
        });
        toast('Theme saved to disk: ' + th.name);
        return;
    }

    if (d.type === 'mupdate' || lower.endsWith('.mupdate')) {
        return installMupdateSigned(d, lower.endsWith('.mupdate') ? lower : ((d.name || 'update') + '.mupdate'));
    }

    if (lower.endsWith('.mica') || d.user || d.username) {
        toast('Use lock screen Restore for full .mica profiles');
        return;
    }
    toast('Unknown package format');
}

// ── Beryl Studio (IDE-style workspace) ───────────────────────────────

/** Lightweight syntax highlighter for Studio editors */
window.StudioHL = {
    esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    },
    color(code, lang) {
        let s = this.esc(code);
        if (lang === 'html') {
            s = s.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="hl-cmt">$1</span>');
            s = s.replace(/(&lt;\/?)([\w:-]+)([^&]*?)(\/?&gt;)/g, function(_, a, tag, rest, b) {
                rest = rest.replace(/([\w:-]+)(=)/g, '<span class="hl-attr">$1</span>$2')
                           .replace(/(["'])(.*?)(\1)/g, '<span class="hl-str">$1$2$3</span>');
                return '<span class="hl-tag">' + a + '</span><span class="hl-kw">' + tag + '</span>' + rest + '<span class="hl-tag">' + b + '</span>';
            });
        } else if (lang === 'css') {
            s = s.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-cmt">$1</span>');
            s = s.replace(/([.#]?[\w-]+)(\s*\{)/g, '<span class="hl-sel">$1</span>$2');
            s = s.replace(/([\w-]+)(\s*:)/g, '<span class="hl-attr">$1</span>$2');
            s = s.replace(/(#[0-9a-fA-F]{3,8}|["'][^"']*["'])/g, '<span class="hl-str">$1</span>');
        } else if (lang === 'js') {
            s = s.replace(/(\/\/.*$)/gm, '<span class="hl-cmt">$1</span>');
            s = s.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-cmt">$1</span>');
            s = s.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '<span class="hl-str">$&</span>');
            s = s.replace(/\b(const|let|var|function|async|await|return|if|else|for|while|class|new|this|try|catch|throw|import|export|from|of|in)\b/g, '<span class="hl-kw">$1</span>');
            s = s.replace(/\b(true|false|null|undefined)\b/g, '<span class="hl-num">$1</span>');
            s = s.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-num">$1</span>');
        } else if (lang === 'py') {
            s = s.replace(/(#.*$)/gm, '<span class="hl-cmt">$1</span>');
            s = s.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, '<span class="hl-str">$1</span>');
            s = s.replace(/\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|with|yield|async|await|True|False|None|and|or|not|in|is|pass|break|continue|lambda|print)\b/g, '<span class="hl-kw">$1</span>');
            s = s.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-num">$1</span>');
        } else if (lang === 'json') {
            s = s.replace(/("(?:\\.|[^"\\])*")(\s*:)/g, '<span class="hl-attr">$1</span>$2');
            s = s.replace(/("(?:\\.|[^"\\])*")/g, '<span class="hl-str">$1</span>');
            s = s.replace(/\b(true|false|null)\b/g, '<span class="hl-kw">$1</span>');
            s = s.replace(/\b(-?\d+\.?\d*)\b/g, '<span class="hl-num">$1</span>');
        }
        return s;
    },
    bind(ta, pre, lang) {
        if (!ta || !pre) return;
        const sync = () => {
            pre.innerHTML = this.color(ta.value, lang) + '\n';
            pre.scrollTop = ta.scrollTop;
            pre.scrollLeft = ta.scrollLeft;
        };
        ta.addEventListener('input', sync);
        ta.addEventListener('scroll', () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; });
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const s = ta.selectionStart, end = ta.selectionEnd;
                ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(end);
                ta.selectionStart = ta.selectionEnd = s + 2;
                sync();
            }
        });
        sync();
        ta._studioHL = { pre, lang, sync };
    }
};

function renderStudio(id, c) {
    window['st_out_' + id] = window['st_out_' + id] || 'Apps';
    window['st_assets_' + id] = window['st_assets_' + id] || {};
    window['st_layout_' + id] = window['st_layout_' + id] || {
        format: 3,
        assets_root: 'assets',
        map: {},
        runtime: { assets: 'apps/user/{id}/assets', read: "mica.asset('file')" }
    };
    c.innerHTML = `
    <div class="studio-shell">
      <div class="studio-menubar">
        <div class="studio-brand">◆ Beryl Studio</div>
        <div class="studio-dd">
          <button type="button" class="studio-dd-btn">File ▾</button>
          <div class="studio-dd-menu">
            <button type="button" data-act="new-mapp">New App project</button>
            <button type="button" data-act="compile">Compile .mapp…</button>
            <button type="button" data-act="install">Install to system</button>
            <button type="button" data-act="save-py">Save Python…</button>
          </div>
        </div>
        <div class="studio-dd">
          <button type="button" class="studio-dd-btn">Project ▾</button>
          <div class="studio-dd-menu">
            <button type="button" data-act="mode-mapp">App (.mapp folder)</button>
            <button type="button" data-act="mode-mplug">Plugin (.mplug)</button>
            <button type="button" data-act="mode-theme">Theme (.mpkg)</button>
            <button type="button" data-act="mode-py">Python script</button>
          </div>
        </div>
        <div class="studio-dd">
          <button type="button" class="studio-dd-btn">Build ▾</button>
          <div class="studio-dd-menu">
            <button type="button" data-act="preview">Live preview</button>
            <button type="button" data-act="compile">Compile package…</button>
            <button type="button" data-act="install">Install</button>
            <button type="button" data-act="assets">Manage assets…</button>
          </div>
        </div>
        <div class="studio-dd">
          <button type="button" class="studio-dd-btn">View ▾</button>
          <div class="studio-dd-menu">
            <button type="button" data-act="browse-apps">Workspace · Apps/</button>
            <button type="button" data-act="browse-docs">Workspace · Documents/</button>
            <button type="button" data-act="browse-down">Workspace · Downloads/</button>
            <button type="button" data-act="refresh">Refresh files</button>
          </div>
        </div>
        <div class="studio-menubar-spacer"></div>
        <span class="studio-hint" id="st_hint_${id}">.mapp = folder · assets/ + layout.json</span>
      </div>
      <div class="studio-body">
        <div class="studio-rail">
          <div class="studio-rail-sec">PROJECT</div>
          <button class="studio-nav on" id="stnav_mapp_${id}" onclick="studioMode('${id}','mapp')">📦 App package</button>
          <button class="studio-nav" id="stnav_mplug_${id}" onclick="studioMode('${id}','mplug')">🔌 Plugin</button>
          <button class="studio-nav" id="stnav_theme_${id}" onclick="studioMode('${id}','theme')">🎨 Theme</button>
          <button class="studio-nav" id="stnav_py_${id}" onclick="studioMode('${id}','py')">🐍 Python</button>
          <div class="studio-rail-sec">WORKSPACE</div>
          <div class="studio-rail-row">
            <button type="button" onclick="studioBrowseFolder('${id}','Apps')">Apps</button>
            <button type="button" onclick="studioBrowseFolder('${id}','Documents')">Docs</button>
            <button type="button" onclick="studioBrowseFolder('${id}','Downloads')">Down</button>
          </div>
          <div id="st_files_${id}" class="studio-files"></div>
          <div class="studio-rail-foot">Install → <b>apps/user/&lt;id&gt;/</b><br>with assets/ + layout.json</div>
        </div>
        <div id="st_view_${id}" class="studio-view"></div>
      </div>
    </div>`;
    // menubar dropdowns
    const shell = c.querySelector('.studio-shell');
    if (shell) {
        shell.querySelectorAll('.studio-dd-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const dd = btn.parentElement;
                const open = dd.classList.contains('open');
                shell.querySelectorAll('.studio-dd.open').forEach(x => x.classList.remove('open'));
                if (!open) dd.classList.add('open');
            };
        });
        shell.querySelectorAll('.studio-dd-menu button').forEach(b => {
            b.onclick = (e) => {
                e.stopPropagation();
                shell.querySelectorAll('.studio-dd.open').forEach(x => x.classList.remove('open'));
                const act = b.getAttribute('data-act');
                if (act === 'new-mapp' || act === 'mode-mapp') studioMode(id, 'mapp');
                else if (act === 'mode-mplug') studioMode(id, 'mplug');
                else if (act === 'mode-theme') studioMode(id, 'theme');
                else if (act === 'mode-py') studioMode(id, 'py');
                else if (act === 'compile') studioMapp2Compile(id);
                else if (act === 'install') studioMapp2Install(id);
                else if (act === 'preview') studioMapp2Preview(id);
                else if (act === 'save-py') studioSavePy(id);
                else if (act === 'assets') studioShowAssetsPanel(id);
                else if (act === 'browse-apps') studioBrowseFolder(id, 'Apps');
                else if (act === 'browse-docs') studioBrowseFolder(id, 'Documents');
                else if (act === 'browse-down') studioBrowseFolder(id, 'Downloads');
                else if (act === 'refresh') studioRefreshFiles(id, window['st_browse_' + id] || 'Apps');
            };
        });
        document.addEventListener('click', function closeStudioDd(ev) {
            if (!shell.contains(ev.target)) shell.querySelectorAll('.studio-dd.open').forEach(x => x.classList.remove('open'));
        });
    }
    studioMode(id, 'mapp');
    studioRefreshFiles(id, 'Apps');
}

async function studioRefreshFiles(id, folder) {
    const host = document.getElementById('st_files_' + id);
    if (!host) return;
    folder = folder || window['st_browse_' + id] || 'Apps';
    window['st_browse_' + id] = folder;
    host.innerHTML = '<div style="opacity:0.5;padding:6px;">Loading ' + folder + '…</div>';
    try {
        try { await API.mkdir(folder); } catch (e) {}
        const { items } = await API.list(folder);
        const files = (items || []).filter(i => !i.is_dir).slice(0, 40);
        if (!files.length) {
            host.innerHTML = '<div style="opacity:0.45;padding:8px;">No files in ' + folder + '/</div>';
            return;
        }
        host.innerHTML = '';
        files.forEach(f => {
            const row = document.createElement('div');
            row.className = 'studio-file';
            row.style.cssText = 'padding:6px 8px;border-radius:8px;cursor:pointer;display:flex;gap:6px;align-items:center;';
            row.innerHTML = '<span style="opacity:0.6;">📄</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>';
            row.querySelector('span:last-child').textContent = f.name;
            const full = folder + '/' + f.name;
            row.onclick = () => studioOpenWorkspaceFile(id, full);
            host.appendChild(row);
        });
    } catch (e) {
        host.innerHTML = '<div style="opacity:0.5;padding:8px;">' + (e.message || 'Cannot list') + '</div>';
    }
}
function studioBrowseFolder(id, folder) {
    window['st_out_' + id] = folder;
    studioRefreshFiles(id, folder);
    toast('Workspace: ' + folder + '/');
}
async function studioOpenWorkspaceFile(id, path) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    if (['py','txt','md','json','js','html','css'].includes(ext)) {
        try {
            const text = await loadFileText('user', path);
            studioMode(id, 'py');
            setTimeout(() => {
                const n = document.getElementById('st_name_' + id);
                const c = document.getElementById('st_code_' + id);
                if (n) n.value = path;
                if (c) c.value = text;
            }, 30);
            toast('Opened ' + path);
        } catch (e) { toast(e.message || 'Open failed'); }
    } else {
        App.open('Jade Explorer', { path: path.includes('/') ? path.split('/').slice(0,-1).join('/') : path });
    }
}

function studioEditorPane(id, lang, key, code, visible) {
    return `<div class="studio-code-wrap" id="m2wrap_${key}_${id}" style="${visible ? '' : 'display:none'}">
      <pre class="studio-hl" id="m2hl_${key}_${id}" aria-hidden="true"></pre>
      <textarea id="m2_${key}_${id}" class="studio-code" spellcheck="false">${code}</textarea>
    </div>`;
}

function studioMode(id, mode) {
    const view = document.getElementById('st_view_' + id);
    if (!view) return;
    ['mapp','mplug','theme','py'].forEach(m => {
        const b = document.getElementById('stnav_' + m + '_' + id);
        if (b) b.classList.toggle('on', m === mode || (mode === 'mapp2' && m === 'mapp'));
    });

    if (mode === 'mapp' || mode === 'mapp2') {
        const layout = window['st_layout_' + id] || {};
        const layoutJson = JSON.stringify(layout, null, 2);
        view.innerHTML = `
          <div class="studio-toolbar">
            <input id="m2_name_${id}" value="My App" class="studio-name" placeholder="App name">
            <input id="m2_icon_${id}" value="🚀" class="studio-icon" title="Emoji fallback">
            <button type="button" onclick="studioPickIcon('${id}')">🖼 Icon</button>
            <button type="button" onclick="studioShowAssetsPanel('${id}')">📁 Assets</button>
            <div class="studio-toolbar-spacer"></div>
            <button type="button" onclick="studioMapp2Preview('${id}')">▶ Preview</button>
            <button type="button" class="primary-btn" onclick="studioMapp2Compile('${id}')">📦 Compile…</button>
            <button type="button" onclick="studioMapp2Install('${id}')">Install</button>
          </div>
          <div class="studio-subbar">
            <span class="studio-sub-hint">Package folder: <code>index.html</code> · <code>style.css</code> · <code>script.js</code> · <code>main.py</code> · <code>assets/</code> · <code>layout.json</code></span>
          </div>
          <div class="studio-tabs">
            <button type="button" class="primary-btn" id="m2tab_html_${id}" onclick="studioMapp2Tab('${id}','html')">HTML</button>
            <button type="button" id="m2tab_css_${id}" onclick="studioMapp2Tab('${id}','css')">CSS</button>
            <button type="button" id="m2tab_js_${id}" onclick="studioMapp2Tab('${id}','js')">JS</button>
            <button type="button" id="m2tab_py_${id}" onclick="studioMapp2Tab('${id}','py')">Python</button>
            <button type="button" id="m2tab_layout_${id}" onclick="studioMapp2Tab('${id}','layout')">layout.json</button>
            <button type="button" id="m2tab_assets_${id}" onclick="studioMapp2Tab('${id}','assets')">Assets</button>
          </div>
          <div class="studio-split">
            <div class="studio-editors">
              ${studioEditorPane(id, 'html', 'html', `<h1>Hello MAPP</h1>
<p>Assets via <code>mica.asset('logo.png')</code> · Python via <code>mica.py()</code>.</p>
<img id="logo" alt="" style="max-width:120px;display:none">
<button onclick="doRun()">Run Python</button>
<pre id="out"></pre>`, true)}
              ${studioEditorPane(id, 'css', 'css', `body { font-family: system-ui, sans-serif; padding: 16px; }
button { padding: 8px 14px; border-radius: 8px; cursor: pointer; }
#out { background: #0c0c0c; padding: 10px; border-radius: 8px; margin-top: 12px; }`, false)}
              ${studioEditorPane(id, 'js', 'js', `// layout.json maps assets; mica.asset resolves them at runtime
try {
  const img = document.getElementById('logo');
  if (img) { img.src = mica.asset('logo.png'); img.style.display = 'block'; }
} catch (e) {}

async function doRun() {
  const out = document.getElementById('out');
  out.textContent = 'Running…';
  const res = await mica.py("print(greet('MAPP'))");
  out.textContent = (res.stdout || '') + (res.error || res.stderr || '');
}
`, false)}
              ${studioEditorPane(id, 'py', 'py', `def greet(name):
    return f"Hello, {name}! from Pyron"

print("App module loaded")
`, false)}
              ${studioEditorPane(id, 'json', 'layout', layoutJson, false)}
              <div class="studio-assets-pane" id="m2wrap_assets_${id}" style="display:none">
                <div class="studio-assets-head">
                  <b>Package assets</b>
                  <span>Files land in <code>assets/</code>; layout.json maps names for <code>mica.asset()</code></span>
                  <button type="button" class="primary-btn" onclick="document.getElementById('m2_assets_input_${id}').click()">+ Add files</button>
                  <input type="file" id="m2_assets_input_${id}" hidden multiple onchange="studioAddAssets(event,'${id}')">
                </div>
                <div id="m2_assets_list_${id}" class="studio-assets-list"></div>
              </div>
            </div>
            <iframe id="m2_prev_${id}" class="studio-preview" title="Preview"></iframe>
          </div>`;
        ['html','css','js','py','layout'].forEach(k => {
            const ta = document.getElementById('m2_' + k + '_' + id);
            const pre = document.getElementById('m2hl_' + k + '_' + id);
            const lang = k === 'layout' ? 'json' : k;
            if (ta && pre && window.StudioHL) StudioHL.bind(ta, pre, lang);
        });
        studioRenderAssetsList(id);
        setTimeout(() => studioMapp2Preview(id), 50);
        // unsaved tracking for Studio package editors
        ['html','css','js','py','layout'].forEach(k => {
            const ta = document.getElementById('m2_' + k + '_' + id);
            if (ta && !ta.dataset.dirtyBound) {
                ta.dataset.dirtyBound = '1';
                ta.addEventListener('input', () => {
                    if (typeof App !== 'undefined' && App.markDirty)
                        App.markDirty(id, () => studioMapp2Compile(id));
                });
            }
        });
    } else if (mode === 'py') {
        view.innerHTML = `
          <div style="padding:10px;background:var(--well-bg);display:flex;gap:8px;border-bottom:1px solid var(--dock-border);align-items:center;flex-wrap:wrap;">
            <input id="st_name_${id}" value="hello.py" style="width:140px;">
            <button class="primary-btn" onclick="studioSavePy('${id}')">💾 Save Apps/</button>
            <button onclick="studioRun('${id}')">▶ Run</button>
            <button onclick="studioPyToMapp('${id}')">📦 Export .mapp</button>
          </div>
          <textarea id="st_code_${id}" style="flex:1;border:none;padding:14px;resize:none;outline:none;background:rgba(0,0,0,0.35);color:#eee;font-family:Consolas,monospace;">print("Hello from Beryl Studio")
for i in range(5):
    print("tick", i)
</textarea>`;
    } else if (mode === 'mplug') {
        view.innerHTML = `
          <div style="padding:10px;background:var(--well-bg);border-bottom:1px solid var(--dock-border);display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <input id="mp_name_${id}" value="MyPlugin" style="width:120px;">
            <input id="mp_ver_${id}" value="1.0" style="width:50px;">
            <input id="mp_desc_${id}" value="DOM + Python plugin" style="flex:1;min-width:120px;">
            <button class="primary-btn" onclick="studioCompileMplug('${id}')">📦 Compile .mplug</button>
            <button onclick="studioInstallMplug('${id}')">Install</button>
          </div>
          <div style="display:flex;gap:4px;padding:6px 10px;background:var(--well-bg);border-bottom:1px solid var(--dock-border);">
            <button class="primary-btn" id="mptab_js_${id}" onclick="studioMplugTab('${id}','js')">JS (DOM)</button>
            <button id="mptab_py_${id}" onclick="studioMplugTab('${id}','py')">Python</button>
          </div>
          <textarea id="mp_js_${id}" style="flex:1;border:none;padding:12px;resize:none;outline:none;background:rgba(0,0,0,0.35);color:#eee;font-family:Consolas,monospace;font-size:12px;">// Runs in the OS shell (DOM)
console.log('[MyPlugin] loaded');
// Example: toast on boot
try { toast('MyPlugin active'); } catch(e) {}
</textarea>
          <textarea id="mp_py_${id}" style="flex:1;border:none;padding:12px;resize:none;outline:none;background:rgba(0,0,0,0.35);color:#eee;font-family:Consolas,monospace;font-size:12px;display:none;"># Optional kernel-side code (Package Manager → ▶ Py)
print("MyPlugin python side OK")
</textarea>`;
    } else if (mode === 'theme') {
        view.innerHTML = `
          <div style="padding:20px;display:flex;flex-direction:column;gap:12px;overflow:auto;height:100%;box-sizing:border-box;">
            <h3 style="margin:0;">Theme Maker</h3>
            <label>Theme Name<br><input id="tm_name_${id}" value="My Custom Theme" style="width:100%;"></label>
            <label>Background<br><input type="color" id="tm_bg_${id}" value="#1e1e1e" style="width:100%;height:40px;border:none;"></label>
            <label>Window Color<br><input type="color" id="tm_win_${id}" value="#2c2c2c" style="width:100%;height:40px;border:none;"></label>
            <label>Text Color<br><input type="color" id="tm_text_${id}" value="#ffffff" style="width:100%;height:40px;border:none;"></label>
            <label>Wallpaper (optional)<br><input type="file" id="tm_wp_${id}" accept="image/*" style="width:100%;"></label>
            <div style="display:flex;gap:8px;">
              <button class="primary-btn" onclick="studioExportTheme('${id}')">📦 Compile .mpkg</button>
              <button onclick="studioPreviewTheme('${id}')">Preview</button>
            </div>
          </div>`;
    } else if (mode === 'update') {
        view.innerHTML = `
          <div style="padding:16px;display:flex;flex-direction:column;height:100%;box-sizing:border-box;gap:10px;">
            <h3 style="margin:0;">.mupdate (pyrouser)</h3>
            <p style="margin:0;font-size:12px;opacity:0.7;">Enable DevMode in Security, then use Terminal: <code>mupdate help</code></p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <input id="mu_name_${id}" value="MyUpdate" placeholder="Update name" style="width:140px;">
              <input id="mu_ver_${id}" value="1.0" placeholder="Version" style="width:70px;">
              <input id="mu_log_${id}" value="Bug fixes and plugins" placeholder="Changelog" style="flex:1;min-width:140px;">
            </div>
            <div style="display:flex;gap:8px;">
              <button class="primary-btn" onclick="document.getElementById('mu_files_${id}').click()">+ Add .py plugins</button>
              <input type="file" id="mu_files_${id}" hidden multiple accept=".py" onchange="studioAddUpdateFiles(event,'${id}')">
              <button class="primary-btn" onclick="studioCompileUpdate('${id}')">📦 Compile .mupdate</button>
            </div>
            <div id="mu_list_${id}" style="flex:1;overflow:auto;background:var(--input-bg);border-radius:10px;padding:10px;border:1px solid var(--dock-border);"></div>
          </div>`;
        window['mu_bundle_' + id] = window['mu_bundle_' + id] || [];
        studioRenderUpdateList(id);
    } else if (mode === 'audio') {
        view.innerHTML = `
          <div style="padding:24px;text-align:center;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;box-sizing:border-box;">
            <h3>Audio Studio</h3>
            <button class="primary-btn" style="padding:16px 28px;font-size:16px;border-radius:40px;margin-bottom:16px;" onclick="toast('Use Vynl + Jade Explorer for media')">🎙️ Open workflow tip</button>
            <p style="opacity:0.7;">Import audio into the OS:</p>
            <input type="file" accept="audio/*" multiple onchange="studioUploadMedia(event,'Music')">
          </div>`;
    } else if (mode === 'video') {
        view.innerHTML = `
          <div style="padding:20px;height:100%;display:flex;flex-direction:column;box-sizing:border-box;">
            <h3 style="margin-top:0;">Video Studio</h3>
            <input type="file" accept="video/*" onchange="studioPreviewVideo(event,'${id}')" style="margin-bottom:12px;">
            <video id="bs_vid_${id}" controls style="width:100%;height:260px;background:#000;border-radius:8px;"></video>
            <button class="primary-btn" style="margin-top:12px;" onclick="document.getElementById('bs_vid_up_${id}').click()">Save into Videos/</button>
            <input type="file" id="bs_vid_up_${id}" hidden accept="video/*" onchange="studioUploadMedia(event,'Videos')">
          </div>`;
    }
}

async function studioSavePy(id) {
    const nameEl = document.getElementById('st_name_' + id);
    const codeEl = document.getElementById('st_code_' + id);
    if (!nameEl || !codeEl) return;
    const current = nameEl.value || 'hello.py';
    const base = current.includes('/') ? current.split('/').pop() : current;
    const folder = current.includes('/') ? current.split('/').slice(0, -1).join('/') : (window['st_out_' + id] || 'Apps');
    openJadeSaveDialog({
        title: 'Save Python script',
        suggestedName: base.endsWith('.py') ? base : base + '.py',
        folder: folder || 'Apps',
        onSave: async (fld, fname) => {
            const path = (fld || 'Apps').replace(/\/$/, '') + '/' + fname;
            try {
                const parts = path.split('/');
                if (parts.length > 1) try { await API.mkdir(parts.slice(0, -1).join('/')); } catch (e) {}
                await API.write(path, codeEl.value);
                nameEl.value = path;
                toast('Saved ' + path);
                studioRefreshFiles(id, fld || 'Apps');
            } catch (e) { toast(e.message || 'Save failed'); }
        }
    });
}

async function studioRun(id) {
    try {
        const res = await API.exec(document.getElementById('st_code_' + id).value);
        toast(((res.stdout || '') + (res.error || '')).slice(0, 140) || 'OK');
    } catch (e) { toast(e.message); }
}

async function studioPyToMapp(id) {
    const fname = document.getElementById('st_name_' + id).value || 'app.py';
    const code = document.getElementById('st_code_' + id).value;
    const appName = fname.replace(/\.py$/i, '') || 'PythonApp';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:sans-serif;background:#1a1a1e;color:#eee;margin:0;padding:16px;}
pre{background:#0c0c0c;padding:14px;border-radius:8px;overflow:auto;}</style></head><body>
<h2>🐍 ${appName}</h2><p style="opacity:0.6;font-size:12px;">Run Apps/${appName}.py from Explorer</p>
<pre>${code.replace(/</g,'&lt;')}</pre></body></html>`;
    const pkg = { type: 'mapp', name: appName, icon: '🐍', html };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(pkg))));
    await API.write(`Apps/${appName}.mapp`, encoded);
    await API.write(`Apps/${appName}.py`, code);
    toast(`Exported Apps/${appName}.mapp + .py`);
}

function studioPreviewTheme(id) {
    const bg = document.getElementById('tm_bg_' + id).value;
    const win = document.getElementById('tm_win_' + id).value;
    const txt = document.getElementById('tm_text_' + id).value;
    // Isolated preview stylesheet — never pollutes body inline styles permanently
    let style = document.getElementById('mica-theme-preview');
    if (!style) {
        style = document.createElement('style');
        style.id = 'mica-theme-preview';
        document.head.appendChild(style);
    }
    style.innerHTML =
        `body { --bg: ${bg} !important; --win-bg: ${win} !important; --text: ${txt} !important; }` +
        `body { background: ${bg} !important; color: ${txt} !important; }`;
    toast('Theme preview (temporary) — Apply a theme or restart to clear');
}

window.micaRevertThemePreview = function () {
    const style = document.getElementById('mica-theme-preview');
    if (style) style.remove();
    const cls = localStorage.getItem('mica_theme') || 'theme-dark';
    if (localStorage.getItem('mica_theme_is_custom') === '1') {
        try { if (typeof restorePersistedTheme === 'function') restorePersistedTheme(); } catch (e) {}
    } else if (typeof applyBuiltinTheme === 'function') {
        applyBuiltinTheme(cls);
    } else if (typeof applyTheme === 'function') {
        applyTheme(cls);
    }
    toast('Preview cleared');
};

function studioExportTheme(id) {
    const name = document.getElementById('tm_name_' + id).value || 'Custom';
    const bg = document.getElementById('tm_bg_' + id).value;
    const win = document.getElementById('tm_win_' + id).value;
    const txt = document.getElementById('tm_text_' + id).value;
    const wpFile = document.getElementById('tm_wp_' + id).files[0];
    const cssVars = `--bg:${bg}; --win-bg:${win}; --text:${txt}; --input-bg:rgba(255,255,255,0.08); --dock-border:rgba(255,255,255,0.12);`;
    const tObj = { type: 'mpkg', name, cssClass: 'theme-' + Date.now(), cssVariables: cssVars, bg, text: txt, wp: null };

    const finish = async (obj) => {
        const compressed = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
        const a = document.createElement('a');
        a.href = 'data:application/mpkg;charset=utf-8,' + compressed;
        a.download = name.replace(/\s+/g, '') + '.mpkg';
        a.click();
        await API.write('Apps/' + name.replace(/\s+/g, '') + '.mpkg', compressed);
        try {
            await saveThemeToDisk(obj);
            toast('Theme compiled & saved to disk: ' + name);
        } catch (e) {
            toast('Theme downloaded; disk save failed: ' + e.message);
        }
    };

    if (wpFile) {
        const reader = new FileReader();
        reader.onloadend = () => { tObj.wp = reader.result; finish(tObj); };
        reader.readAsDataURL(wpFile);
    } else {
        finish(tObj);
    }
}

function studioAddUpdateFiles(e, id) {
    const bundle = window['mu_bundle_' + id] || [];
    const files = Array.from(e.target.files || []);
    let pending = files.length;
    if (!pending) return;
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
            const kind = 'py';
            bundle.push({ name: file.name.replace(/\.(js|py)$/i, ''), code: reader.result, kind });
            pending--;
            if (pending === 0) {
                window['mu_bundle_' + id] = bundle;
                studioRenderUpdateList(id);
                toast('Added ' + files.length + ' file(s)');
            }
        };
        reader.readAsText(file);
    });
    e.target.value = '';
}

function studioRenderUpdateList(id) {
    const el = document.getElementById('mu_list_' + id);
    const bundle = window['mu_bundle_' + id] || [];
    if (!el) return;
    if (!bundle.length) {
        el.innerHTML = '<p style="opacity:0.5;text-align:center;padding:20px;">No files yet — add .py plugins</p>';
        return;
    }
    el.innerHTML = bundle.map((p, i) => `
        <div style="padding:8px 10px;background:var(--win-bg);border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;border:1px solid var(--dock-border);">
          <span>${p.kind === 'py' ? '🐍' : '📜'} ${p.name}.${p.kind}</span>
          <button onclick="studioRemoveUpdateFile('${id}',${i})" style="color:#ff5f56;">Remove</button>
        </div>`).join('');
}

function studioRemoveUpdateFile(id, index) {
    const bundle = window['mu_bundle_' + id] || [];
    bundle.splice(index, 1);
    window['mu_bundle_' + id] = bundle;
    studioRenderUpdateList(id);
}

async function studioCompileUpdate(id) {
    const bundle = window['mu_bundle_' + id] || [];
    if (!bundle.length) return toast('Add at least one .py plugin');
    const name = document.getElementById('mu_name_' + id).value || 'Update';
    const version = document.getElementById('mu_ver_' + id).value || '1.0';
    const changelog = document.getElementById('mu_log_' + id).value || '';
    const obj = {
        type: 'mupdate',
        name,
        version,
        date: new Date().toISOString(),
        changelog,
        engine: 'python',
        plugins: bundle.map(p => ({ name: p.name, code: p.code, kind: 'py' })),
    };
    const compressed = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
    const a = document.createElement('a');
    a.href = 'data:application/mupdate;charset=utf-8,' + compressed;
    a.download = name.replace(/\s+/g, '') + '.mupdate';
    a.click();
    await API.write('Apps/' + name.replace(/\s+/g, '') + '.mupdate', compressed);
    toast('Compiled ' + name + ' v' + version);
}

async function studioUploadMedia(e, folder) {
    for (const f of e.target.files) {
        await API.upload(folder, f);
        toast('Saved to /' + folder + '/' + f.name);
    }
    e.target.value = '';
}

function studioPreviewVideo(e, id) {
    const file = e.target.files[0];
    if (!file) return;
    const v = document.getElementById('bs_vid_' + id);
    if (v) v.src = URL.createObjectURL(file);
    toast('Video loaded');
}


function studioMapp2Tab(id, tab) {
    ['html','css','js','py','layout','assets'].forEach(k => {
        const wrap = document.getElementById('m2wrap_' + k + '_' + id);
        const btn = document.getElementById('m2tab_' + k + '_' + id);
        if (wrap) wrap.style.display = (k === tab) ? (k === 'assets' ? 'flex' : 'block') : 'none';
        if (btn) {
            if (k === tab) btn.classList.add('primary-btn');
            else btn.classList.remove('primary-btn');
        }
    });
    if (tab === 'layout') {
        // keep layout editor in sync with asset map
        try {
            const ta = document.getElementById('m2_layout_' + id);
            if (ta && window['st_layout_' + id]) {
                const cur = JSON.parse(ta.value || '{}');
                cur.map = Object.assign({}, (window['st_layout_' + id].map || {}), cur.map || {});
                window['st_layout_' + id] = cur;
                ta.value = JSON.stringify(cur, null, 2);
                if (ta._studioHL) ta._studioHL.sync();
            }
        } catch (e) {}
    }
    if (tab === 'assets') studioRenderAssetsList(id);
}

function studioShowAssetsPanel(id) {
    studioMapp2Tab(id, 'assets');
}

function studioRenderAssetsList(id) {
    const host = document.getElementById('m2_assets_list_' + id);
    if (!host) return;
    const files = window['st_assets_' + id] || {};
    const names = Object.keys(files);
    if (!names.length) {
        host.innerHTML = '<div class="studio-assets-empty">No assets yet. Add images, JSON, or data files — they install into the app folder under <code>assets/</code>.</div>';
        return;
    }
    host.innerHTML = names.map(n => {
        const isImg = /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(n);
        const preview = isImg && String(files[n]).startsWith('data:image')
            ? `<img src="${files[n]}" alt="" class="studio-asset-thumb">`
            : `<span class="studio-asset-ico">📄</span>`;
        return `<div class="studio-asset-row">
          ${preview}
          <span class="studio-asset-name">${n}</span>
          <code class="studio-asset-path">mica.asset('${n}')</code>
          <button type="button" onclick="studioRemoveAsset('${id}','${n.replace(/'/g, "\\'")}')">Remove</button>
        </div>`;
    }).join('');
}

function studioAddAssets(e, id) {
    const bag = window['st_assets_' + id] || (window['st_assets_' + id] = {});
    const layout = window['st_layout_' + id] || (window['st_layout_' + id] = { format: 3, assets_root: 'assets', map: {}, runtime: {} });
    layout.map = layout.map || {};
    const files = Array.from(e.target.files || []);
    let left = files.length;
    if (!left) return;
    files.forEach(f => {
        const reader = new FileReader();
        reader.onload = () => {
            bag[f.name] = reader.result;
            layout.map[f.name] = 'assets/' + f.name;
            left--;
            if (left === 0) {
                window['st_layout_' + id] = layout;
                const ta = document.getElementById('m2_layout_' + id);
                if (ta) {
                    try {
                        const cur = JSON.parse(ta.value || '{}');
                        cur.map = Object.assign({}, cur.map || {}, layout.map);
                        ta.value = JSON.stringify(cur, null, 2);
                        if (ta._studioHL) ta._studioHL.sync();
                    } catch (err) {
                        ta.value = JSON.stringify(layout, null, 2);
                        if (ta._studioHL) ta._studioHL.sync();
                    }
                }
                studioRenderAssetsList(id);
                toast('Added ' + files.length + ' asset(s)');
            }
        };
        reader.readAsDataURL(f);
    });
    e.target.value = '';
}

function studioRemoveAsset(id, name) {
    const bag = window['st_assets_' + id] || {};
    delete bag[name];
    const layout = window['st_layout_' + id];
    if (layout && layout.map) delete layout.map[name];
    const ta = document.getElementById('m2_layout_' + id);
    if (ta) {
        try {
            const cur = JSON.parse(ta.value || '{}');
            if (cur.map) delete cur.map[name];
            ta.value = JSON.stringify(cur, null, 2);
            if (ta._studioHL) ta._studioHL.sync();
        } catch (e) {}
    }
    studioRenderAssetsList(id);
}

function studioMapp2ReadIcon(id) {
    return new Promise(resolve => {
        if (window['m2_icon_data_' + id]) return resolve(window['m2_icon_data_' + id]);
        const input = document.getElementById('m2_ico_' + id);
        const file = input && input.files && input.files[0];
        if (!file) return resolve('');
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
    });
}

async function studioMapp2Build(id) {
    const icon_data = await studioMapp2ReadIcon(id);
    const files = Object.assign({}, window['st_assets_' + id] || {});
    let layout = window['st_layout_' + id] || { format: 3, assets_root: 'assets', map: {} };
    try {
        const ta = document.getElementById('m2_layout_' + id);
        if (ta && ta.value.trim()) layout = JSON.parse(ta.value);
    } catch (e) { toast('layout.json invalid — using last good map'); }
    // ensure map covers assets
    layout.map = layout.map || {};
    Object.keys(files).forEach(n => { if (!layout.map[n]) layout.map[n] = 'assets/' + n; });
    layout.assets_root = layout.assets_root || 'assets';
    layout.format = 3;
    window['st_layout_' + id] = layout;
    return {
        type: 'mapp',
        format: 3,
        name: ((document.getElementById('m2_name_' + id) || {}).value || 'My App').trim(),
        icon: ((document.getElementById('m2_icon_' + id) || {}).value || '🚀'),
        icon_data: icon_data || '',
        html: ((document.getElementById('m2_html_' + id) || {}).value || ''),
        css: ((document.getElementById('m2_css_' + id) || {}).value || ''),
        js: ((document.getElementById('m2_js_' + id) || {}).value || ''),
        py: ((document.getElementById('m2_py_' + id) || {}).value || ''),
        files,
        assets: files,
        layout,
    };
}

function studioPickIcon(id) {
    openJadePicker({
        accept: ['.png','.ico','.svg','.jpg','.jpeg','.webp'],
        title: 'Choose app icon',
        onPick: async (scope, path, name) => {
            try {
                const d = await API.read(path);
                window['m2_icon_data_' + id] = d.content || d;
                toast('Icon set: ' + name);
            } catch (e) { toast(e.message || 'Icon load failed'); }
        }
    });
}

async function studioMapp2Preview(id) {
    const pkg = await studioMapp2Build(id);
    const bridge = `<script>
window.mica = {
  async py(code) {
    try { return await window.parent.micaRunAppPy('_preview', code); }
    catch(e) { return { error: String(e) }; }
  },
  async run() { return { stdout: '(preview)' }; },
  toast(m) { try { parent.toast(m); } catch(e) {} }
};
</script>`;
    let src;
    if ((pkg.html || '').toLowerCase().includes('<html')) {
        src = pkg.html.replace(/<\/head>/i, `<style>${pkg.css}</style>${bridge}<script>${pkg.js}</script></head>`);
    } else {
        src = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;font-family:sans-serif;background:#1a1a1e;color:#eee;} ${pkg.css}</style>${bridge}</head><body>${pkg.html}<script>${pkg.js}</script></body></html>`;
    }
    const iframe = document.getElementById('m2_prev_' + id);
    if (iframe) iframe.srcdoc = src;
}

async function studioMapp2Compile(id) {
    const pkg = await studioMapp2Build(id);
    const compressed = btoa(unescape(encodeURIComponent(JSON.stringify(pkg))));
    const fname = (pkg.name || 'App').replace(/\s+/g, '') + '.mapp';
    openJadeSaveDialog({
        title: 'Save .mapp package',
        suggestedName: fname,
        folder: window['st_out_' + id] || 'Apps',
        onSave: async (fld, name) => {
            const folder = fld || 'Apps';
            try { await API.mkdir(folder); } catch (e) {}
            const path = folder.replace(/\/$/, '') + '/' + name;
            await API.write(path, compressed);
            // also mirror to Apps if saved elsewhere so Package Manager / desktop can find it
            if (folder !== 'Apps') {
                try { await API.mkdir('Apps'); await API.write('Apps/' + name, compressed); } catch (e) {}
            }
            toast('Saved ' + path);
            studioRefreshFiles(id, folder);
        }
    });
}

async function studioMapp2Install(id) {
    const pkg = await studioMapp2Build(id);
    const compressed = btoa(unescape(encodeURIComponent(JSON.stringify(pkg))));
    try {
        const result = await API.appsInstall(compressed, pkg.name.replace(/\s+/g, '') + '.mapp');
        await refreshUserApps();
        renderDesktop();
        toast('Installed ' + result.name + ' → apps/user/…/' + result.id);
    } catch (e) {
        toast(e.message || 'Install failed');
    }
}



// ── Package Manager ──────────────────────────────────────────────────


function renderCreativeCentre(id, c) {
    c.innerHTML = `
    <div style="display:flex;height:100%;">
      <div style="width:150px;background:var(--well-bg);border-right:1px solid var(--dock-border);padding:12px;display:flex;flex-direction:column;gap:8px;">
        <b style="font-size:11px;opacity:0.55;">CREATIVE</b>
        <button class="primary-btn" id="cc_btn_paint_${id}" onclick="ccMode('${id}','paint')">🖌️ Paint</button>
        <button id="cc_btn_photo_${id}" onclick="ccMode('${id}','photo')">🖼️ Photo Edit</button>
        <button id="cc_btn_media_${id}" onclick="ccMode('${id}','media')">🎬 Media Edit</button>
      </div>
      <div id="cc_view_${id}" style="flex:1;min-width:0;display:flex;flex-direction:column;"></div>
    </div>`;
    ccMode(id, 'paint');
}

function ccMode(id, mode) {
    const view = document.getElementById('cc_view_' + id);
    if (!view) return;
    ['paint','photo','media'].forEach(m => {
        const b = document.getElementById('cc_btn_' + m + '_' + id);
        if (b) {
            if (m === mode) b.classList.add('primary-btn');
            else b.classList.remove('primary-btn');
        }
    });
    if (mode === 'photo') return ccPhotoEditor(id, view);
    if (mode === 'media') return ccMediaEditor(id, view);
    // Paint
    view.innerHTML = `
      <div style="display:flex;gap:8px;padding:8px 10px;background:var(--well-bg);border-bottom:1px solid var(--dock-border);align-items:center;flex-wrap:wrap;">
        <button onclick="paintTool('${id}','brush')" id="pt_brush_${id}" class="primary-btn">Brush</button>
        <button onclick="paintTool('${id}','pencil')">Pencil</button>
        <button onclick="paintTool('${id}','eraser')">Eraser</button>
        <button onclick="paintTool('${id}','line')">Line</button>
        <button onclick="paintTool('${id}','rect')">Rect</button>
        <button onclick="paintTool('${id}','ellipse')">Ellipse</button>
        <button onclick="paintTool('${id}','fill')">Fill</button>
        <button onclick="paintTool('${id}','picker')">Picker</button>
        <label>Size <input type="range" id="pt_size_${id}" min="1" max="80" value="6" style="width:80px;"></label>
        <input type="color" id="pt_color_${id}" value="#00aaff">
        <button onclick="paintUndo('${id}')">Undo</button>
        <button onclick="paintClear('${id}')">Clear</button>
        <button class="primary-btn" onclick="paintSave('${id}')">💾 Save PNG</button>
      </div>
      <div style="flex:1;overflow:auto;background:#2a2a2e;display:flex;align-items:center;justify-content:center;">
        <canvas id="pt_cv_${id}" width="900" height="560" style="background:#fff;cursor:crosshair;box-shadow:0 4px 24px rgba(0,0,0,0.4);"></canvas>
      </div>`;
    paintInit(id);
}

function ccPhotoEditor(id, view) {
    window['pe_' + id] = { img: null, filters: { brightness: 100, contrast: 100, saturate: 100, blur: 0, hue: 0 } };
    view.innerHTML = `
      <div style="display:flex;gap:8px;padding:8px 10px;background:var(--well-bg);border-bottom:1px solid var(--dock-border);align-items:center;flex-wrap:wrap;">
        <button class="primary-btn" onclick="peOpen('${id}')">📂 Open Image</button>
        <label>Bright <input type="range" id="pe_br_${id}" min="50" max="150" value="100" oninput="peApply('${id}')" style="width:70px;"></label>
        <label>Contrast <input type="range" id="pe_ct_${id}" min="50" max="150" value="100" oninput="peApply('${id}')" style="width:70px;"></label>
        <label>Saturate <input type="range" id="pe_sat_${id}" min="0" max="200" value="100" oninput="peApply('${id}')" style="width:70px;"></label>
        <label>Blur <input type="range" id="pe_blur_${id}" min="0" max="10" value="0" oninput="peApply('${id}')" style="width:70px;"></label>
        <label>Hue <input type="range" id="pe_hue_${id}" min="0" max="360" value="0" oninput="peApply('${id}')" style="width:70px;"></label>
        <button onclick="peReset('${id}')">Reset</button>
        <button class="primary-btn" onclick="peSave('${id}')">💾 Save</button>
      </div>
      <div style="flex:1;overflow:auto;background:#1a1a1e;display:flex;align-items:center;justify-content:center;padding:12px;">
        <canvas id="pe_cv_${id}" style="max-width:100%;max-height:100%;background:#111;box-shadow:0 4px 24px rgba(0,0,0,0.5);"></canvas>
      </div>`;
}

function peOpen(id) {
    openJadeOpenDialog({
        title: 'Open Image',
        accept: ['png','jpg','jpeg','gif','webp','bmp'],
        onPick: async (scope, path, name) => {
            try {
                let url;
                if (scope === 'host') {
                    const d = await API.hostRead(path);
                    url = 'data:' + (guessMime((name||'').split('.').pop()) || 'image/png') + ';base64,' + d.content;
                } else {
                    const r = await fetch(mediaUrl('user', path), { headers: { Authorization: 'Bearer ' + (API.token||'') }});
                    const blob = await r.blob();
                    url = URL.createObjectURL(blob);
                }
                const img = new Image();
                img.onload = () => {
                    window['pe_' + id].img = img;
                    peReset(id);
                    peApply(id);
                };
                img.src = url;
            } catch (e) { toast(e.message); }
        }
    });
}

function peReset(id) {
    const st = window['pe_' + id];
    if (!st) return;
    st.filters = { brightness: 100, contrast: 100, saturate: 100, blur: 0, hue: 0 };
    ['br','ct','sat','blur','hue'].forEach((k, i) => {
        const keys = ['br','ct','sat','blur','hue'];
        const vals = [100,100,100,0,0];
        const el = document.getElementById('pe_' + keys[i] + '_' + id);
        if (el) el.value = vals[i];
    });
    peApply(id);
}

function peApply(id) {
    const st = window['pe_' + id];
    const cv = document.getElementById('pe_cv_' + id);
    if (!st || !st.img || !cv) return;
    const f = {
        brightness: Number(document.getElementById('pe_br_' + id)?.value || 100),
        contrast: Number(document.getElementById('pe_ct_' + id)?.value || 100),
        saturate: Number(document.getElementById('pe_sat_' + id)?.value || 100),
        blur: Number(document.getElementById('pe_blur_' + id)?.value || 0),
        hue: Number(document.getElementById('pe_hue_' + id)?.value || 0),
    };
    st.filters = f;
    const img = st.img;
    cv.width = img.naturalWidth || img.width;
    cv.height = img.naturalHeight || img.height;
    const ctx = cv.getContext('2d');
    ctx.filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) blur(${f.blur}px) hue-rotate(${f.hue}deg)`;
    ctx.drawImage(img, 0, 0);
    ctx.filter = 'none';
}

async function peSave(id) {
    const cv = document.getElementById('pe_cv_' + id);
    if (!cv || !cv.width) { toast('Open an image first'); return; }
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    openJadeSaveDialog({
        mode: 'save', suggestedName: 'edited_' + Date.now() + '.png', folder: 'Pictures', title: 'Save Edited Photo',
        onSave: async (folder, fname) => { await micaSaveBlob(blob, fname, folder || 'Pictures'); }
    });
}

function ccMediaEditor(id, view) {
    window['me_' + id] = { url: null, type: null, blob: null };
    view.innerHTML = `
      <div style="display:flex;gap:8px;padding:8px 10px;background:var(--well-bg);border-bottom:1px solid var(--dock-border);align-items:center;flex-wrap:wrap;">
        <button class="primary-btn" onclick="meOpen('${id}')">📂 Open Media</button>
        <label>Volume <input type="range" id="me_vol_${id}" min="0" max="100" value="80" oninput="meVol('${id}')" style="width:90px;"></label>
        <label>Speed <select id="me_spd_${id}" onchange="meSpeed('${id}')" style="background:#222;color:#eee;border:1px solid #444;border-radius:4px;">
          <option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="1.5">1.5x</option><option value="2">2x</option>
        </select></label>
        <button onclick="mePlayPause('${id}')">⏯</button>
        <button onclick="meSkip('${id}',-5)">⏪ 5s</button>
        <button onclick="meSkip('${id}',5)">5s ⏩</button>
        <button class="primary-btn" onclick="meExport('${id}')">💾 Export</button>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#111;padding:16px;gap:12px;">
        <div id="me_stage_${id}" style="flex:1;width:100%;display:flex;align-items:center;justify-content:center;color:#666;">Open audio or video</div>
        <input type="range" id="me_seek_${id}" min="0" max="1000" value="0" style="width:90%;" oninput="meSeek('${id}')">
        <div id="me_time_${id}" style="font-size:12px;opacity:0.6;">0:00 / 0:00</div>
      </div>`;
}

function meOpen(id) {
    openJadeOpenDialog({
        title: 'Open Media',
        accept: ['mp3','wav','ogg','m4a','flac','mp4','webm','mkv','mov'],
        onPick: async (scope, path, name) => {
            try {
                const ext = (name||'').split('.').pop().toLowerCase();
                const isAud = ['mp3','wav','ogg','m4a','flac','aac'].includes(ext);
                let url, blob;
                if (scope === 'host') {
                    const d = await API.hostRead(path);
                    const bin = atob(d.content);
                    const arr = new Uint8Array(bin.length);
                    for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
                    blob = new Blob([arr], { type: guessMime(ext) });
                    url = URL.createObjectURL(blob);
                } else {
                    const r = await fetch(mediaUrl('user', path), { headers: { Authorization: 'Bearer ' + (API.token||'') }});
                    blob = await r.blob();
                    url = URL.createObjectURL(blob);
                }
                window['me_' + id] = { url, type: isAud ? 'audio' : 'video', blob, name };
                const stage = document.getElementById('me_stage_' + id);
                if (isAud) {
                    stage.innerHTML = `<div style="text-align:center;"><div style="font-size:48px;margin-bottom:12px;">🎵</div>
                      <audio id="me_el_${id}" src="${url}" controls style="width:min(480px,90%);" ontimeupdate="meTick('${id}')" onloadedmetadata="meTick('${id}')"></audio></div>`;
                } else {
                    stage.innerHTML = `<video id="me_el_${id}" src="${url}" controls style="max-width:100%;max-height:60vh;border-radius:8px;"
                      ontimeupdate="meTick('${id}')" onloadedmetadata="meTick('${id}')"></video>`;
                }
                meVol(id);
            } catch (e) { toast(e.message); }
        }
    });
}

function meEl(id) { return document.getElementById('me_el_' + id); }
function meVol(id) {
    const el = meEl(id);
    const v = Number(document.getElementById('me_vol_' + id)?.value || 80) / 100;
    if (el) el.volume = v;
}
function meSpeed(id) {
    const el = meEl(id);
    const s = Number(document.getElementById('me_spd_' + id)?.value || 1);
    if (el) el.playbackRate = s;
}
function mePlayPause(id) {
    const el = meEl(id);
    if (!el) return;
    if (el.paused) el.play(); else el.pause();
}
function meSkip(id, sec) {
    const el = meEl(id);
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + sec));
}
function meSeek(id) {
    const el = meEl(id);
    const sk = document.getElementById('me_seek_' + id);
    if (!el || !sk || !el.duration) return;
    el.currentTime = (Number(sk.value) / 1000) * el.duration;
}
function meTick(id) {
    const el = meEl(id);
    const sk = document.getElementById('me_seek_' + id);
    const tm = document.getElementById('me_time_' + id);
    if (!el) return;
    const fmt = (s) => {
        s = Math.floor(s || 0);
        return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
    };
    if (sk && el.duration) sk.value = Math.round((el.currentTime / el.duration) * 1000);
    if (tm) tm.textContent = fmt(el.currentTime) + ' / ' + fmt(el.duration);
}
async function meExport(id) {
    const st = window['me_' + id];
    if (!st || !st.blob) { toast('Open media first'); return; }
    const folder = st.type === 'audio' ? 'Music' : 'Videos';
    const name = (st.name || 'export') .replace(/\.[^.]+$/, '') + '_export.' + (st.type === 'audio' ? 'webm' : 'webm');
    // Lightweight: re-save original blob (full non-destructive export)
    openJadeSaveDialog({
        mode: 'save', suggestedName: name, folder, title: 'Export Media',
        onSave: async (folder2, fname) => { await micaSaveBlob(st.blob, fname, folder2 || folder); }
    });
}


function paintInit(id) {
    const cv = document.getElementById('pt_cv_' + id);
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    window['paint_' + id] = {
        tool: 'brush', drawing: false, lastX: 0, lastY: 0, startX: 0, startY: 0,
        history: [cv.toDataURL()],
        snapshot: null,
    };
    const st = () => window['paint_' + id];
    const color = () => document.getElementById('pt_color_' + id).value;
    const size = () => Number(document.getElementById('pt_size_' + id).value) || 6;

    function pushHist() {
        const h = st().history;
        h.push(cv.toDataURL());
        if (h.length > 30) h.shift();
    }
    function pos(e) {
        const r = cv.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (cv.width / r.width),
            y: (e.clientY - r.top) * (cv.height / r.height),
        };
    }
    function floodFill(x, y, fillColor) {
        const w = cv.width, h = cv.height;
        const img = ctx.getImageData(0, 0, w, h);
        const data = img.data;
        const sx = Math.floor(x), sy = Math.floor(y);
        const i0 = (sy * w + sx) * 4;
        const tr = data[i0], tg = data[i0+1], tb = data[i0+2], ta = data[i0+3];
        const fc = document.createElement('canvas').getContext('2d');
        // parse hex
        const hex = fillColor.replace('#','');
        const fr = parseInt(hex.substring(0,2),16), fg = parseInt(hex.substring(2,4),16), fb = parseInt(hex.substring(4,6),16);
        if (tr===fr && tg===fg && tb===fb) return;
        const stack = [[sx, sy]];
        while (stack.length) {
            const [cx, cy] = stack.pop();
            if (cx<0||cy<0||cx>=w||cy>=h) continue;
            const i = (cy * w + cx) * 4;
            if (data[i]!==tr || data[i+1]!==tg || data[i+2]!==tb || data[i+3]!==ta) continue;
            data[i]=fr; data[i+1]=fg; data[i+2]=fb; data[i+3]=255;
            stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
        }
        ctx.putImageData(img, 0, 0);
    }

    cv.onpointerdown = (e) => {
        cv.setPointerCapture(e.pointerId);
        const p = pos(e);
        const s = st();
        s.drawing = true;
        s.lastX = p.x; s.lastY = p.y;
        s.startX = p.x; s.startY = p.y;
        s.snapshot = ctx.getImageData(0, 0, cv.width, cv.height);
        if (s.tool === 'picker') {
            const d = ctx.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
            const hex = '#' + [d[0],d[1],d[2]].map(v => v.toString(16).padStart(2,'0')).join('');
            document.getElementById('pt_color_' + id).value = hex;
            s.drawing = false;
            return;
        }
        if (s.tool === 'fill') {
            floodFill(p.x, p.y, color());
            pushHist();
            s.drawing = false;
            return;
        }
        if (s.tool === 'brush' || s.tool === 'pencil' || s.tool === 'eraser') {
            ctx.beginPath();
            ctx.arc(p.x, p.y, (s.tool==='pencil'?1:size())/2, 0, Math.PI*2);
            ctx.fillStyle = s.tool==='eraser' ? '#ffffff' : color();
            ctx.fill();
        }
    };
    cv.onpointermove = (e) => {
        const s = st();
        if (!s.drawing) return;
        const p = pos(e);
        if (s.tool === 'brush' || s.tool === 'pencil' || s.tool === 'eraser') {
            ctx.beginPath();
            ctx.moveTo(s.lastX, s.lastY);
            ctx.lineTo(p.x, p.y);
            ctx.strokeStyle = s.tool==='eraser' ? '#ffffff' : color();
            ctx.lineWidth = s.tool==='pencil' ? 1 : size();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
            s.lastX = p.x; s.lastY = p.y;
        } else if (s.tool === 'line' || s.tool === 'rect' || s.tool === 'ellipse') {
            ctx.putImageData(s.snapshot, 0, 0);
            ctx.strokeStyle = color();
            ctx.lineWidth = size();
            ctx.beginPath();
            if (s.tool === 'line') {
                ctx.moveTo(s.startX, s.startY);
                ctx.lineTo(p.x, p.y);
            } else if (s.tool === 'rect') {
                ctx.strokeRect(s.startX, s.startY, p.x - s.startX, p.y - s.startY);
            } else {
                const rx = Math.abs(p.x - s.startX)/2, ry = Math.abs(p.y - s.startY)/2;
                const cx = (p.x + s.startX)/2, cy = (p.y + s.startY)/2;
                ctx.ellipse(cx, cy, Math.max(rx,0.1), Math.max(ry,0.1), 0, 0, Math.PI*2);
            }
            ctx.stroke();
        }
    };
    cv.onpointerup = () => {
        const s = st();
        if (s.drawing) pushHist();
        s.drawing = false;
    };
}

function paintTool(id, tool) {
    const s = window['paint_' + id];
    if (s) s.tool = tool;
}

function paintUndo(id) {
    const cv = document.getElementById('pt_cv_' + id);
    const s = window['paint_' + id];
    if (!cv || !s || s.history.length < 2) return;
    s.history.pop();
    const img = new Image();
    img.onload = () => {
        const ctx = cv.getContext('2d');
        ctx.clearRect(0,0,cv.width,cv.height);
        ctx.drawImage(img, 0, 0);
    };
    img.src = s.history[s.history.length - 1];
}

function paintClear(id) {
    const cv = document.getElementById('pt_cv_' + id);
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,cv.width,cv.height);
    const s = window['paint_' + id];
    if (s) s.history.push(cv.toDataURL());
}

async function paintSave(id) {
    const cv = document.getElementById('pt_cv_' + id);
    if (!cv) return;
    const name = 'painting_' + Date.now() + '.png';
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    openJadeSaveDialog({
        mode: 'save',
        suggestedName: name,
        folder: 'Pictures',
        title: 'Save Painting',
        onSave: async (folder, fname) => {
            try {
                if (blob) await micaSaveBlob(blob, fname, folder || 'Pictures');
                else await micaSaveDataUrl(cv.toDataURL('image/png'), fname, folder || 'Pictures');
            } catch (e) { toast(e.message || 'Save failed'); }
        }
    });
}

async function loadPrismInto(iframe) {
    if (!iframe) return;
    try {
        const d = await API.get('/api/apps/content?id=prism3d');
        iframe.srcdoc = d.html || d.content || '';
    } catch (e) {
        iframe.srcdoc = '<p style="color:#f66;padding:16px;">Prism3D: ' + e.message + '</p>';
    }
}

function renderPrism3D(id, c) {
    c.innerHTML = `<iframe id="prism_frame_${id}" style="width:100%;height:100%;border:none;background:#1e1e1e;"></iframe>`;
    (async () => {
        try {
            const d = await API.get('/api/apps/content?id=prism3d');
            let html = d.html || d.content || '';
            const bridge = '<scr' + 'ipt>(function(){function saveBlobToMica(blob,name){try{if(window.parent&&window.parent.micaSaveBlob){window.parent.micaSaveBlob(blob,name,"Documents");return true;}}catch(e){}return false;}document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[download]");if(!a)return;var href=a.getAttribute("href")||"";var name=a.getAttribute("download")||"MyScene.glb";if(!href)return;e.preventDefault();e.stopPropagation();(async function(){try{var blob;if(href.indexOf("blob:")===0){blob=await(await fetch(href)).blob();}else if(href.indexOf("data:")===0){var m=href.match(/^data:([^;]+);base64,(.+)$/);if(m){var bin=atob(m[2]);var arr=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);blob=new Blob([arr],{type:m[1]});}}if(blob)saveBlobToMica(blob,name);}catch(err){console.error(err);}})();},true);})();</scr' + 'ipt>';
            if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, bridge + '</body>');
            else html = html + bridge;
            document.getElementById('prism_frame_' + id).srcdoc = html;
        } catch (e) {
            document.getElementById('prism_frame_' + id).srcdoc = '<p style="color:#f66;padding:16px;">' + e.message + '</p>';
        }
    })();
}


function renderPackageManager(id, c) {
    c.innerHTML = `
    <div style="display:flex;height:100%;">
      <div style="width:160px;background:var(--well-bg);border-right:1px solid var(--dock-border);padding:10px;display:flex;flex-direction:column;gap:6px;">
        <b style="font-size:11px;opacity:0.55;">PACKAGE MANAGER</b>
        <button class="primary-btn" onclick="pmTab('${id}','plugins')">🔌 Plugins</button>
        <button class="primary-btn" onclick="pmTab('${id}','apps')">📱 Apps</button>
        <button class="primary-btn" onclick="pmTab('${id}','themes')">🎨 Themes</button>
        <button class="primary-btn" onclick="pmTab('${id}','updates')">⬆️ Updates</button>
        <button class="primary-btn" onclick="pmTab('${id}','export')">💾 Export</button>
        <button class="primary-btn" style="margin-top:auto;" onclick="document.getElementById('pm_up_${id}').click()">+ Install file…</button>
        <input type="file" id="pm_up_${id}" hidden accept=".mplug,.mapp,.mpkg,.mupdate,.py,.js,.mica" onchange="pmInstallFile(event,'${id}')">
      </div>
      <div id="pm_view_${id}" style="flex:1;padding:16px;overflow:auto;"></div>
    </div>`;
    pmTab(id, 'plugins');
}

async function pmTab(id, tab) {
    const view = document.getElementById('pm_view_' + id);
    if (!view) return;
    if (tab === 'plugins') {
        view.innerHTML = `
          <h3 style="margin-top:0;">Plugins (.mplug)</h3>
          <p style="font-size:12px;opacity:0.65;">Universal plugins: JS (DOM) + Python (kernel). Legacy .py/.js supported.</p>
          <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
            <button class="primary-btn" onclick="document.getElementById('pm_plug_${id}').click()">Install .mplug / .py / .js</button>
            <input type="file" id="pm_plug_${id}" hidden accept=".mplug,.py,.js" onchange="pmInstallFile(event,'${id}')">
            <button onclick="loadAndApplyPlugins();toast('Plugins re-applied')">Apply now</button>
          </div>
          <div id="pm_plist_${id}">Loading…</div>`;
        await pmRefreshPlugins(id);
    } else if (tab === 'apps') {
        view.innerHTML = `<h3 style="margin-top:0;">Installed Apps</h3><div id="pm_alist_${id}">Loading…</div>`;
        try {
            const data = await API.appsList();
            const apps = data.user || [];
            const el = document.getElementById('pm_alist_' + id);
            if (!apps.length) el.innerHTML = '<p style="opacity:0.5;">No user apps installed.</p>';
            else el.innerHTML = apps.map(a => `
              <div style="padding:10px;background:var(--input-bg);border-radius:8px;margin-bottom:6px;border:1px solid var(--dock-border);display:flex;justify-content:space-between;align-items:center;">
                <span>${a.icon_data ? '<img src="'+a.icon_data+'" style="width:20px;height:20px;vertical-align:middle;margin-right:6px;">' : (a.icon||'📦')} <b>${a.name}</b> <small style="opacity:0.5;">${a.id}</small></span>
                <button style="color:#ff5f56;" onclick="pmUninstallApp('${a.id}','${id}')">Remove</button>
              </div>`).join('');
        } catch (e) {
            document.getElementById('pm_alist_' + id).innerHTML = '<p style="color:#ff5f56;">' + e.message + '</p>';
        }
    } else if (tab === 'themes') {
        view.innerHTML = `
          <h3 style="margin-top:0;">Themes (.mpkg)</h3>
          <p style="font-size:12px;opacity:0.65;">Stored on disk under themes/user/ — survive reboot.</p>
          <button class="primary-btn" onclick="document.getElementById('pm_theme_${id}').click()">Install .mpkg</button>
          <input type="file" id="pm_theme_${id}" hidden accept=".mpkg" onchange="pmInstallFile(event,'${id}')">
          <div id="pm_themes_${id}" style="margin-top:12px;">Loading…</div>`;
        pmRefreshThemes(id);
    } else if (tab === 'updates') {
        view.innerHTML = `
          <h3 style="margin-top:0;">Updates (.mupdate v2)</h3>
          <p style="font-size:12px;opacity:0.65;">System packages with files, scripts, and plugins. Public builds need Admin approval.</p>
          <button class="primary-btn" onclick="document.getElementById('pm_upd_${id}').click()">Install .mupdate</button>
          <input type="file" id="pm_upd_${id}" class="native-uploader" hidden accept=".mupdate" onchange="pmInstallFile(event,'${id}')">
          <div id="pm_ulist_${id}" style="margin-top:12px;">Loading…</div>`;
        await pmRefreshUpdates(id);
    } else if (tab === 'export') {
        view.innerHTML = `
          <h3 style="margin-top:0;">Backup & Export</h3>
          <div style="padding:12px;background:var(--input-bg);border-radius:10px;border:1px solid var(--dock-border);margin-bottom:12px;">
            <b>.mica — Account package</b>
            <p style="font-size:12px;opacity:0.65;">Account details, themes, plugins, installed apps, and system configuration.</p>
            <button class="primary-btn" onclick="pmExportMica()">Export .mica</button>
          </div>
          <div style="padding:12px;background:var(--input-bg);border-radius:10px;border:1px solid var(--dock-border);margin-bottom:12px;">
            <b>.mdfs — Filesystem archive</b>
            <p style="font-size:12px;opacity:0.65;">Decrypts vault files (if encryption is on) and zips your user folders for export.</p>
            <button class="primary-btn" onclick="pmExportMdfs()">Export .mdfs</button>
            <button onclick="document.getElementById('pm_mdfs_${id}').click()" style="margin-left:8px;">Import .mdfs</button>
            <input type="file" id="pm_mdfs_${id}" class="native-uploader" hidden accept=".mdfs,.zip" onchange="pmImportMdfs(event)">
          </div>
          <p style="font-size:11px;opacity:0.5;">Unsigned / public .mupdate packages need Admin approval in Package Manager.</p>`;
    }
}

async function pmRefreshThemes(id) {
    const el = document.getElementById('pm_themes_' + id);
    if (!el) return;
    try {
        const data = await API.themesList();
        const themes = data.themes || [];
        const activeId = data.active && data.active.theme && data.active.theme.id;
        if (!themes.length) {
            el.innerHTML = '<p style="opacity:0.5;">No disk themes yet.</p>';
            return;
        }
        el.innerHTML = themes.map(th => `
            <div style="padding:10px;background:var(--input-bg);border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;border:1px solid var(--dock-border);">
              <span>🎨 ${th.name}${activeId === th.id ? ' <small style="opacity:0.6;">(active)</small>' : ''}</span>
              <span>
                <button class="primary-btn" onclick="applyDiskTheme('${th.id}')">Apply</button>
                <button style="color:#ff5f56;" onclick="pmDeleteTheme('${th.id}','${id}')">Remove</button>
              </span>
            </div>`).join('');
    } catch (e) {
        el.innerHTML = '<p style="color:#ff5f56;">' + e.message + '</p>';
    }
}

async function pmDeleteTheme(themeId, pmId) {
    if (!confirm('Delete theme ' + themeId + '?')) return;
    try {
        await API.themesDelete(themeId);
        toast('Theme deleted');
        if (pmId) pmRefreshThemes(pmId);
    } catch (e) { toast(e.message); }
}

async function pmRefreshPlugins(id) {
    const el = document.getElementById('pm_plist_' + id);
    if (!el) return;
    try {
        const data = await API.pluginsList();
        const plugins = data.plugins || [];
        if (!plugins.length) {
            el.innerHTML = '<p style="opacity:0.5;">No plugins installed.</p>';
            return;
        }
        el.innerHTML = plugins.map(p => `
          <div style="padding:12px;background:var(--input-bg);border-radius:10px;margin-bottom:8px;border:1px solid var(--dock-border);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <div>
                <b>${p.legacy ? '📜' : '🔌'} ${p.name}</b>
                <small style="opacity:0.55;"> v${p.version} · ${p.kind}${p.has_js ? ' · JS' : ''}${p.has_py ? ' · PY' : ''}</small>
                ${p.description ? '<div style="font-size:12px;opacity:0.65;margin-top:4px;">' + p.description + '</div>' : ''}
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <button onclick="pmTogglePlugin('${p.id}', ${p.enabled ? 'false' : 'true'})">${p.enabled ? 'Disable' : 'Enable'}</button>
                ${p.has_py ? `<button onclick="pmRunPluginPy('${p.id}')">▶ Py</button>` : ''}
                <button style="color:#ff5f56;" onclick="pmRemovePlugin('${p.id}')">Remove</button>
              </div>
            </div>
            <div style="font-size:11px;opacity:0.45;margin-top:6px;">${p.enabled ? 'Active (loaded on boot)' : 'Disabled'}</div>
          </div>`).join('');
    } catch (e) {
        el.innerHTML = '<p style="color:#ff5f56;">' + e.message + '</p>';
    }
}

async function pmInstallFile(e, id) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const name = f.name.toLowerCase();
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const raw = ev.target.result;
        try {
            if (name.endsWith('.mplug') || name.endsWith('.py') || name.endsWith('.js')) {
                const res = await API.pluginsInstall(raw, f.name);
                toast('Plugin installed: ' + res.name);
                micaSoftReboot('Plugin installed — rebooting…');
                return;
            }
            // fall through to existing package installer
            const fakeEvent = { target: { files: [f], value: '' } };
            // reuse installPackageFile by wrapping
            await installPackageFromText(f.name, raw);
            if (id) pmTab(id, name.endsWith('.mpkg') ? 'themes' : (name.endsWith('.mupdate') ? 'updates' : 'apps'));
        } catch (err) {
            toast(err.message || 'Install failed');
        }
    };
    reader.readAsText(f);
    e.target.value = '';
}


/** Prompt for admin PIN; resolves to pin string or null */
function promptAdminPin(action) {
    return new Promise((resolve) => {
        let overlay = document.getElementById('mica-admin-overlay');
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.id = 'mica-admin-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000000;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML =
          '<div style="background:var(--win-bg);border:1px solid var(--dock-border);border-radius:14px;padding:20px;min-width:300px;max-width:90vw;box-shadow:var(--shadow);">' +
            '<h3 style="margin:0 0 8px 0;">Admin permission</h3>' +
            '<p style="font-size:12px;opacity:0.7;margin:0 0 12px 0;">Action: <b>' + String(action || 'restricted').replace(/</g,'') + '</b></p>' +
            '<input id="mica_admin_pin" type="password" placeholder="Admin PIN" style="width:100%;margin-bottom:10px;">' +
            '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
              '<button type="button" id="mica_admin_cancel">Cancel</button>' +
              '<button type="button" class="primary-btn" id="mica_admin_ok">Allow</button>' +
            '</div></div>';
        document.body.appendChild(overlay);
        const done = (val) => { try { overlay.remove(); } catch (e) {} resolve(val); };
        document.getElementById('mica_admin_cancel').onclick = () => done(null);
        document.getElementById('mica_admin_ok').onclick = () => {
            const pin = (document.getElementById('mica_admin_pin').value || '').trim();
            if (!pin) { toast('Enter admin PIN'); return; }
            done(pin);
        };
        const inp = document.getElementById('mica_admin_pin');
        if (inp) inp.onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('mica_admin_ok').click(); };
        setTimeout(() => inp && inp.focus(), 40);
    });
}

/**
 * Install a .mupdate package (signed or admin-approved).
 * Lives in base OS so updates are not chicken-and-egg with missing helpers.
 */
async function installMupdateSigned(d, filename) {
    const name = (d && d.name) || (filename || 'update').replace(/\.mupdate$/i, '') || 'Update';
    const version = (d && d.version) || '1.0';
    // Backend accepts raw JSON or base64
    const raw = (typeof d === 'string') ? d : JSON.stringify(d);
    const fname = filename || ((name + '-v' + version).replace(/\s+/g, '') + '.mupdate');

    let info = null;
    try {
        info = await API.updatesInspect(raw, fname);
    } catch (e) {
        console.warn('updatesInspect', e);
        // Continue — still try install / local fallback
        info = {
            name, version,
            official: !!(d && (d.sign === 'FK20120708' || d.signature === 'FK20120708')),
            requires_admin: !(d && (d.sign === 'FK20120708' || d.signature === 'FK20120708')),
        };
    }

    let admin_approved = false;
    let admin_pin = '';
    if (info && info.requires_admin && !info.official) {
        admin_pin = await promptAdminPin('install-mupdate:' + name + ' v' + version);
        if (!admin_pin) throw new Error('Admin denied — unsigned update not installed');
        admin_approved = true;
        // Optional verify
        try { await API.adminVerify(admin_pin, 'install-mupdate:' + name); } catch (e) {
            throw new Error(e.message || 'Admin authentication failed');
        }
    }

    let result = null;
    try {
        result = await API.updatesInstall(raw, fname, admin_approved, admin_pin);
    } catch (e) {
        // Fallback: local frontend install path (plugins + registry) so a kernel hiccup
        // does not brick the whole package flow.
        console.warn('API.updatesInstall failed, local fallback', e);
        result = await installMupdateLocalFallback(d, fname);
    }

    // Track in UI list
    try {
        let updates = JSON.parse(localStorage.getItem('mica_updates') || '[]');
        updates = updates.filter(u => !(u.name === name && u.version === version));
        updates.push({
            name,
            version,
            changelog: (d && d.changelog) || (result && result.changelog) || '',
            date: new Date().toISOString(),
            official: !!(info && info.official),
            engine: 'python',
        });
        localStorage.setItem('mica_updates', JSON.stringify(updates));
    } catch (e) {}

    try { if (typeof micaDockJump === 'function') micaDockJump('Jade Explorer', fname); } catch (e) {}
    toast('Update installed: ' + name + ' v' + version);
    return result;
}

/** Local fallback when backend install is unavailable */
async function installMupdateLocalFallback(d, filename) {
    d = d || {};
    const name = d.name || 'Update';
    const version = d.version || '1.0';
    try { await API.mkdir('Plugins'); } catch (e) {}
    try { await API.mkdir('Apps'); } catch (e) {}
    let plugins = JSON.parse(localStorage.getItem('mica_py_plugins') || '[]');
    const fromId = name + '@' + version;
    let installed = 0;
    for (const p of (d.plugins || [])) {
        const kind = (p.kind || (p.py ? 'py' : (p.js ? 'js' : 'py'))).toLowerCase();
        if (kind === 'js' && !p.py) {
            console.warn('Skipping js-only plugin in mupdate fallback:', p.name);
            continue;
        }
        const pname = p.name || p.id || 'plugin';
        const path = 'Plugins/' + pname + '.py';
        const code = p.code || p.py || '';
        if (code) {
            await API.write(path, code);
            plugins = plugins.filter(x => x.name !== pname);
            plugins.push({ name: pname, path, fromUpdate: fromId });
            installed++;
        } else if (p.js || p.type === 'mplug') {
            try {
                await API.pluginsInstall(JSON.stringify(p), pname + '.mplug');
                installed++;
            } catch (e) { console.warn(e); }
        }
    }
    localStorage.setItem('mica_py_plugins', JSON.stringify(plugins));

    // Write staged files into user FS when paths are relative user paths
    const files = d.files || {};
    let filesWritten = 0;
    if (files && typeof files === 'object') {
        for (const [rel, content] of Object.entries(files)) {
            const clean = String(rel).replace(/\\/g, '/').replace(/^\//, '');
            if (!clean || clean.includes('..')) continue;
            // User-space paths only in fallback (system/backend need kernel)
            if (/^(system|backend|frontend)\//i.test(clean)) {
                console.warn('Fallback cannot write OS tree path:', clean);
                continue;
            }
            try {
                const parts = clean.split('/');
                if (parts.length > 1) {
                    try { await API.mkdir(parts.slice(0, -1).join('/')); } catch (e) {}
                }
                if (typeof content === 'string' && content.startsWith('data:')) {
                    // binary data URL — skip text write
                    continue;
                }
                await API.write(clean, typeof content === 'string' ? content : String(content));
                filesWritten++;
            } catch (e) { console.warn('write', clean, e); }
        }
    }

    try {
        await API.write('Apps/' + String(name).replace(/\s+/g, '') + '.mupdate',
            btoa(unescape(encodeURIComponent(JSON.stringify(d)))));
    } catch (e) {}

    return {
        name, version, plugins: installed, files: filesWritten,
        fallback: true, type: 'mupdate',
    };
}

async function installPackageFromText(filename, raw) {
    const lower = (filename || '').toLowerCase();
    if (lower.endsWith('.mplug') || lower.endsWith('.py') || lower.endsWith('.js')) {
        return API.pluginsInstall(typeof raw === 'string' ? raw : String(raw), filename);
    }
    const d = parsePackageObject(raw);
    if (d.type === 'mapp' || lower.endsWith('.mapp')) {
        const payload = btoa(unescape(encodeURIComponent(JSON.stringify(d))));
        const result = await API.appsInstall(payload, filename);
        await refreshUserApps();
        renderDesktop();
        toast('App installed: ' + result.name);
        return result;
    }
    if (d.type === 'mpkg' || lower.endsWith('.mpkg')) {
        const th = await saveThemeToDisk({
            name: d.name || 'Theme',
            id: d.id || d.cssClass,
            cssClass: d.cssClass,
            cssVariables: d.cssVariables,
            bg: d.bg,
            text: d.text,
            wp: d.wp,
        });
        toast('Theme saved to disk: ' + th.name);
        return th;
    }
    if (d.type === 'mupdate' || lower.endsWith('.mupdate')) {
        return installMupdateSigned(d, filename);
    }
    if (d.type === 'mplug') {
        const res = await API.pluginsInstall(JSON.stringify(d), filename);
        toast('Plugin installed: ' + res.name);
        micaSoftReboot('Plugin installed — rebooting…');
        return res;
    }
    throw new Error('Unknown package type');
}

async function pmRemovePlugin(pluginId) {
    if (!confirm('Remove plugin "' + pluginId + '"? System will reboot.')) return;
    try {
        await API.pluginsUninstall(pluginId);
        // also clear any legacy localStorage refs
        try {
            let legacy = JSON.parse(localStorage.getItem('mica_py_plugins') || '[]');
            legacy = legacy.filter(p => p.name !== pluginId && p.path !== pluginId);
            localStorage.setItem('mica_py_plugins', JSON.stringify(legacy));
        } catch (e) {}
        document.querySelectorAll('script[data-mplug="' + pluginId + '"]').forEach(s => s.remove());
        micaSoftReboot('Plugin removed — rebooting…');
    } catch (e) {
        toast(e.message || 'Remove failed');
    }
}

async function pmTogglePlugin(pluginId, enabled) {
    try {
        await API.pluginsEnable(pluginId, enabled === true || enabled === 'true');
        micaSoftReboot((enabled === true || enabled === 'true' ? 'Enabled' : 'Disabled') + ' — rebooting…');
    } catch (e) {
        toast(e.message);
    }
}

async function pmRunPluginPy(pluginId) {
    try {
        const res = await API.pluginsRunPy(pluginId);
        toast(((res.stdout || '') + (res.error || '')).slice(0, 160) || 'OK');
    } catch (e) { toast(e.message); }
}


async function pmRefreshUpdates(pmId) {
    const el = document.getElementById('pm_ulist_' + pmId);
    if (!el) return;
    let updates = [];
    try {
        if (API.updatesList) {
            const data = await API.updatesList();
            updates = data.updates || [];
        }
    } catch (e) { console.warn(e); }
    // merge localStorage registry
    try {
        const local = JSON.parse(localStorage.getItem('mica_updates') || '[]');
        local.forEach(u => {
            if (!updates.some(x => x.name === u.name && String(x.version) === String(u.version))) updates.push(u);
        });
    } catch (e) {}
    if (!updates.length) {
        el.innerHTML = '<p style="opacity:0.5;">No updates installed.</p>';
        return;
    }
    el.innerHTML = updates.map(u => {
        const name = (u.name || 'Update').replace(/'/g, "\\'");
        const ver = String(u.version || '?').replace(/'/g, "\\'");
        const uid = (u.id || (name + '_' + ver)).replace(/'/g, "\\'");
        return '<div style="padding:10px;background:var(--input-bg);border-radius:8px;margin-bottom:6px;border:1px solid var(--dock-border);display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
          '<div><b>' + (u.name || 'Update') + '</b> v' + (u.version || '?') +
          (u.official ? ' <small style="opacity:0.5;">official</small>' : '') +
          '<br><small style="opacity:0.6;">' + (u.changelog || u.id || '') + '</small></div>' +
          '<button style="color:#ff5f56;flex-shrink:0;" onclick="pmRemoveUpdate(\'' + uid + '\',\'' + name + '\',\'' + ver + '\',\'' + pmId + '\')">Remove</button></div>';
    }).join('');
}

async function pmRemoveUpdate(uid, name, version, pmId) {
    if (!confirm('Remove update "' + name + ' v' + version + '"? This does not undo file changes already applied.')) return;
    try {
        if (API.updatesUninstall) {
            try { await API.updatesUninstall(uid || name); } catch (e) {
                // fallback by name
                try { await API.updatesUninstall(name); } catch (e2) { console.warn(e2); }
            }
        }
        // localStorage registry
        try {
            let updates = JSON.parse(localStorage.getItem('mica_updates') || '[]');
            updates = updates.filter(u => !(u.name === name && String(u.version) === String(version)) && u.id !== uid);
            localStorage.setItem('mica_updates', JSON.stringify(updates));
        } catch (e) {}
        // staged Apps/*.mupdate blob
        try {
            const fname = String(name).replace(/\s+/g, '') + '.mupdate';
            await API.delete('Apps/' + fname);
        } catch (e) {}
        toast('Update removed: ' + name);
        if (pmId) pmTab(pmId, 'updates');
    } catch (e) {
        toast(e.message || 'Remove failed');
    }
}

async function pmUninstallApp(appId, pmId) {
    if (!confirm('Remove app ' + appId + '?')) return;
    try {
        await API.appsUninstall(appId);
        // drop from BaseApps
        const idx = BaseApps.findIndex(a => a.id === appId || a.name === appId);
        if (idx >= 0 && BaseApps[idx].scope === 'user') BaseApps.splice(idx, 1);
        await refreshUserApps();
        renderDesktop();
        toast('App removed');
        if (pmId) pmTab(pmId, 'apps');
    } catch (e) { toast(e.message); }
}

async function pmExportMica() {
    const pin = prompt('PIN to embed in .mica (needed for restore):', '') || '';
    try {
        const data = await API.backupMica(pin);
        const fname = data.filename || ((API.username || 'user') + '_account.mica');
        try { await API.mkdir('Downloads'); } catch (e) {}
        await API.write('Downloads/' + fname, data.content);
        toast('Saved Downloads/' + fname);
        App.open('Jade Explorer', { path: 'Downloads' });
    } catch (e) {
        toast(e.message || 'Export failed');
    }
}

async function pmExportMdfs() {
    try {
        toast('Building .mdfs archive…');
        const data = await API.backupMdfs();
        const fname = data.filename || ((API.username || 'user') + '_files.mdfs');
        try { await API.mkdir('Downloads'); } catch (e) {}
        // store as base64 data URL content for binary zip
        await API.write('Downloads/' + fname, 'data:application/zip;base64,' + data.content_b64);
        toast('Saved Downloads/' + fname);
        App.open('Jade Explorer', { path: 'Downloads' });
    } catch (e) {
        toast(e.message || 'Export failed');
    }
}

// Patch installPackageFile to accept .mplug


function studioMplugTab(id, tab) {
    const js = document.getElementById('mp_js_' + id);
    const py = document.getElementById('mp_py_' + id);
    const bjs = document.getElementById('mptab_js_' + id);
    const bpy = document.getElementById('mptab_py_' + id);
    if (js) js.style.display = tab === 'js' ? 'block' : 'none';
    if (py) py.style.display = tab === 'py' ? 'block' : 'none';
    if (bjs) { if (tab === 'js') bjs.classList.add('primary-btn'); else bjs.classList.remove('primary-btn'); }
    if (bpy) { if (tab === 'py') bpy.classList.add('primary-btn'); else bpy.classList.remove('primary-btn'); }
}

function studioMplugBuild(id) {
    return {
        type: 'mplug',
        format: 1,
        id: (document.getElementById('mp_name_' + id).value || 'plugin').replace(/\s+/g, '_'),
        name: document.getElementById('mp_name_' + id).value || 'Plugin',
        version: document.getElementById('mp_ver_' + id).value || '1.0',
        description: document.getElementById('mp_desc_' + id).value || '',
        js: document.getElementById('mp_js_' + id).value || '',
        py: document.getElementById('mp_py_' + id).value || '',
        hooks: ['boot'],
    };
}

async function studioCompileMplug(id) {
    const pkg = studioMplugBuild(id);
    const compressed = btoa(unescape(encodeURIComponent(JSON.stringify(pkg))));
    const a = document.createElement('a');
    a.href = 'data:application/mplug;charset=utf-8,' + compressed;
    a.download = pkg.name.replace(/\s+/g, '') + '.mplug';
    a.click();
    toast('Downloaded ' + a.download);
}

async function studioInstallMplug(id) {
    const pkg = studioMplugBuild(id);
    const compressed = btoa(unescape(encodeURIComponent(JSON.stringify(pkg))));
    try {
        const res = await API.pluginsInstall(compressed, pkg.name + '.mplug');
        toast('Installed ' + res.name);
        micaSoftReboot('Plugin installed — rebooting…');
    } catch (e) { toast(e.message); }
}





// ── Camera ───────────────────────────────────────────────────────────

async function renderCamera(id, c) {
    window['cam_' + id] = { stream: null, recorder: null, chunks: [], recording: false };
    c.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;background:#000;color:#eee;position:relative;">
      <div id="cam_stage_${id}" style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#000;">
        <video id="cam_video_${id}" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;"></video>
        <canvas id="cam_canvas_${id}" style="display:none;"></canvas>
        <div id="cam_msg_${id}" style="position:absolute;color:#aaa;font-size:14px;text-align:center;padding:20px;">Starting camera…</div>
      </div>
      <div style="position:absolute;left:0;right:0;bottom:0;padding:16px 20px;display:flex;align-items:center;justify-content:center;gap:20px;
        background:linear-gradient(transparent,rgba(0,0,0,0.75));">
        <button onclick="camSwitchMode('${id}','photo')" id="cam_mode_photo_${id}" class="primary-btn" style="border-radius:20px;padding:8px 16px;">Photo</button>
        <button onclick="camSwitchMode('${id}','video')" id="cam_mode_video_${id}" style="border-radius:20px;padding:8px 16px;background:#333;border:1px solid #555;color:#eee;">Video</button>
        <button id="cam_shutter_${id}" onclick="camShutter('${id}')" title="Capture"
          style="width:64px;height:64px;border-radius:50%;border:4px solid #fff;background:#fff;cursor:pointer;box-shadow:0 0 0 4px rgba(255,255,255,0.25);">
        </button>
        <button onclick="App.open('Jade Explorer',{path:'Pictures'})" style="border-radius:20px;padding:8px 14px;background:#333;border:1px solid #555;color:#eee;">Gallery</button>
        <span id="cam_status_${id}" style="font-size:12px;opacity:0.7;min-width:80px;">…</span>
      </div>
    </div>`;
    window['cam_mode_' + id] = 'photo';
    // auto-start after DOM paints
    setTimeout(() => camStart(id), 80);
}

async function camStart(id) {
    const st = window['cam_' + id];
    if (!st) return;
    const msg = document.getElementById('cam_msg_' + id);
    const status = document.getElementById('cam_status_' + id);
    if (msg) msg.textContent = 'Requesting camera…';
    // Stop previous without clearing UI message
    if (st.stream) {
        try { st.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
        st.stream = null;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (msg) msg.innerHTML = 'Camera API not available in this environment.<br><span style="font-size:12px;opacity:0.6">WebEngine needs media permission.</span>';
        if (status) status.textContent = 'Unavailable';
        return;
    }
    const attempts = [
        { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true },
        { video: true, audio: true },
        { video: true, audio: false },
        { video: { facingMode: 'user' } },
    ];
    let lastErr = null;
    for (const constraints of attempts) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            st.stream = stream;
            const v = document.getElementById('cam_video_' + id);
            if (v) {
                v.srcObject = stream;
                v.muted = true;
                v.playsInline = true;
                try { await v.play(); } catch (e) {}
            }
            if (msg) msg.style.display = 'none';
            if (status) status.textContent = 'Live';
            return;
        } catch (e) {
            lastErr = e;
        }
    }
    if (msg) {
        msg.style.display = 'block';
        msg.innerHTML = 'Could not open camera.<br><span style="font-size:12px;opacity:0.65">' +
            (lastErr && lastErr.message ? lastErr.message : 'Permission denied or no device') +
            '</span><br><button class="primary-btn" style="margin-top:12px;" onclick="camStart(\'' + id + '\')">Retry</button>';
    }
    if (status) status.textContent = 'Error';
}

function camSwitchMode(id, mode) {
    window['cam_mode_' + id] = mode;
    const p = document.getElementById('cam_mode_photo_' + id);
    const v = document.getElementById('cam_mode_video_' + id);
    const shutter = document.getElementById('cam_shutter_' + id);
    if (p) { p.className = mode === 'photo' ? 'primary-btn' : ''; p.style.background = mode === 'photo' ? '' : '#333'; }
    if (v) { v.className = mode === 'video' ? 'primary-btn' : ''; v.style.background = mode === 'video' ? '' : '#333'; }
    if (shutter) shutter.style.background = mode === 'video' ? '#ff5f56' : '#fff';
    // stop recording if switching away
    const st = window['cam_' + id];
    if (st && st.recording && mode === 'photo') camStopRecord(id);
}

function camShutter(id) {
    const mode = window['cam_mode_' + id] || 'photo';
    if (mode === 'video') camToggleRecord(id);
    else camTakePhoto(id);
}

async function camTakePhoto(id) {
    const st = window['cam_' + id];
    const v = document.getElementById('cam_video_' + id);
    const cv = document.getElementById('cam_canvas_' + id);
    if (!v || !cv || !st || !st.stream) { toast('Camera not ready'); return; }
    // flash
    const flash = document.createElement('div');
    flash.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0.7;pointer-events:none;z-index:5;';
    document.getElementById('cam_stage_' + id)?.appendChild(flash);
    setTimeout(() => flash.remove(), 120);
    cv.width = v.videoWidth || 1280;
    cv.height = v.videoHeight || 720;
    cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.92));
    const name = 'photo_' + new Date().toISOString().replace(/[:.]/g, '-') + '.jpg';
    openJadeSaveDialog({
        mode: 'save', suggestedName: name, folder: 'Pictures', title: 'Save Photo',
        onSave: async (folder, fname) => { await micaSaveBlob(blob, fname, folder || 'Pictures'); }
    });
}

function camStopRecord(id) {
    const st = window['cam_' + id];
    if (!st || !st.recording) return;
    try { st.recorder.stop(); } catch (e) {}
    st.recording = false;
    const status = document.getElementById('cam_status_' + id);
    if (status) status.textContent = 'Processing…';
    const shutter = document.getElementById('cam_shutter_' + id);
    if (shutter) shutter.style.boxShadow = '0 0 0 4px rgba(255,255,255,0.25)';
}

function camToggleRecord(id) {
    const st = window['cam_' + id];
    if (!st || !st.stream) { toast('Camera not ready'); return; }
    if (st.recording) { camStopRecord(id); return; }
    st.chunks = [];
    let mime = 'video/webm;codecs=vp9,opus';
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
        if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';
    }
    try {
        st.recorder = new MediaRecorder(st.stream, { mimeType: mime });
    } catch (e) {
        try { st.recorder = new MediaRecorder(st.stream); } catch (e2) {
            toast('Recording not supported'); return;
        }
    }
    st.recorder.ondataavailable = (e) => { if (e.data && e.data.size) st.chunks.push(e.data); };
    st.recorder.onstop = async () => {
        const blob = new Blob(st.chunks, { type: 'video/webm' });
        const name = 'video_' + new Date().toISOString().replace(/[:.]/g, '-') + '.webm';
        openJadeSaveDialog({
            mode: 'save', suggestedName: name, folder: 'Videos', title: 'Save Video',
            onSave: async (folder, fname) => { await micaSaveBlob(blob, fname, folder || 'Videos'); }
        });
        const s = document.getElementById('cam_status_' + id);
        if (s) s.textContent = 'Live';
    };
    st.recorder.start(200);
    st.recording = true;
    const status = document.getElementById('cam_status_' + id);
    if (status) status.textContent = '● REC';
    const shutter = document.getElementById('cam_shutter_' + id);
    if (shutter) shutter.style.boxShadow = '0 0 0 4px rgba(255,95,86,0.5)';
}


// ── Taskbar position engine ──────────────────────────────────────────

window.applyTaskbarPos = function() {
    if (window.__applyingTbPos) return;
    window.__applyingTbPos = true;
    try {
    const tb = document.getElementById('taskbar');
    const dt = document.getElementById('desktop');
    const sm = document.getElementById('start-menu');
    const pos = localStorage.getItem('mica_tb_pos') || 'bottom';
    const dock = localStorage.getItem('mica_dock_mode') === '1';
    if (!tb) return;

    tb.classList.remove('pos-bottom', 'pos-top', 'pos-left', 'pos-right');
    tb.classList.add('pos-' + pos);
    tb.classList.toggle('app-dock', dock);
    // Clear inline geometry — CSS classes own size/position so dock never
    // leaks into classic taskbar and display-layout cannot leave a 45px hole.
    tb.style.top = ''; tb.style.bottom = ''; tb.style.left = ''; tb.style.right = '';
    tb.style.width = ''; tb.style.height = '';
    if (!dock) tb.style.transform = '';

    document.body.classList.toggle('app-dock-on', dock);
    document.body.classList.toggle('layout-dock', dock);
    ['bottom', 'top', 'left', 'right'].forEach(p => {
        document.body.classList.toggle('tb-pos-' + p, p === pos);
    });

    if (dt) {
        dt.style.height = '';
        dt.style.width = '';
        dt.style.marginTop = '';
        dt.style.marginLeft = '';
        dt.style.marginRight = '';
        dt.style.marginBottom = '';
        dt.style.paddingTop = '';
        dt.style.left = '';
        dt.style.top = '';
    }

    if (sm && window.MicaUI) {
        MicaUI.positionStartMenu();
    } else if (sm) {
        sm.style.bottom = 'auto'; sm.style.top = 'auto';
        sm.style.left = 'auto'; sm.style.right = 'auto';
        sm.style.transform = '';
        if (pos === 'bottom') { sm.style.bottom = '55px'; sm.style.left = '10px'; }
        else if (pos === 'top') { sm.style.top = '55px'; sm.style.left = '10px'; }
        else if (pos === 'left') { sm.style.top = '10px'; sm.style.left = '55px'; }
        else if (pos === 'right') { sm.style.top = '10px'; sm.style.right = '55px'; }
    }
    const selectEl = document.getElementById('set_tb_pos_select');
    if (selectEl) selectEl.value = pos;
    if (typeof updateDockAutohide === 'function') updateDockAutohide();
    if (window.App && App.updateTray) App.updateTray();
    // Fixed desktop grid — no full re-layout on taskbar move (prevents icon collapse)
    } finally {
        window.__applyingTbPos = false;
    }
};


window.setTaskbarPos = function(pos) {
    if (typeof micaSet === 'function') micaSet('mica_tb_pos', pos); else localStorage.setItem('mica_tb_pos', pos);
    if (typeof applyDockMode === 'function') applyDockMode();
    else applyTaskbarPos();
    if (window.toast) toast('Taskbar pinned to ' + pos);
};


// Taskbar position + simple context menu (classic style)
window.applyTaskbarPos = window.applyTaskbarPos; // keep existing


function showTbMenu(x, y, html) {
    let m = document.getElementById('tb-context');
    if (m) m.remove();
    m = document.createElement('div');
    m.id = 'tb-context';
    m.className = 'mica-ctx';
    m.innerHTML = html;
    document.body.appendChild(m);
    // measure then clamp (fixed positioning = viewport aligned)
    m.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;background:var(--win-bg);backdrop-filter:var(--blur);border:1px solid var(--dock-border);border-radius:12px;box-shadow:var(--shadow);padding:6px 0;min-width:180px;z-index:3000000;font-size:13px;';
    const r = m.getBoundingClientRect();
    let left = x, top = y;
    if (left + r.width > innerWidth - 8) left = Math.max(8, innerWidth - r.width - 8);
    if (top + r.height > innerHeight - 8) top = Math.max(8, innerHeight - r.height - 8);
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    m.style.left = left + 'px';
    m.style.top = top + 'px';
    m.style.visibility = 'visible';
    m.querySelectorAll('.context-item').forEach(item => {
        item.style.padding = '8px 14px';
        item.style.cursor = 'pointer';
        item.onmouseenter = () => item.style.background = 'var(--well-bg)';
        item.onmouseleave = () => item.style.background = 'transparent';
    });
    setTimeout(() => {
        const closer = (ev) => {
            if (!m.contains(ev.target)) {
                m.remove();
                document.removeEventListener('mousedown', closer, true);
            }
        };
        document.addEventListener('mousedown', closer, true);
    }, 0);
}

function bindTaskbarContextMenu() {
    const tb = document.getElementById('taskbar');
    if (!tb) return;
    if (tb.dataset.ctxBound === 'v7') return;
    tb.dataset.ctxBound = 'v7';
    tb.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const appBtn = e.target.closest && e.target.closest('.tb-app-btn');
        if (appBtn) {
            const title = appBtn.getAttribute('title') || '';
            const id = Object.keys(Registry).find(rid => Registry[rid] && Registry[rid].type === title);
            showTbMenu(e.clientX, e.clientY, `
              <div class="context-item" onclick="document.getElementById('tb-context')?.remove();${id?`App.restoreWindow('${id}')`:''}">🗗 Focus</div>
              <div class="context-item" onclick="document.getElementById('tb-context')?.remove();${id?`App.minimize('${id}')`:''}">➖ Minimize</div>
              <div class="context-item" onclick="document.getElementById('tb-context')?.remove();${id?`App.close('${id}')`:''}">✕ Close</div>
              <div style="height:1px;background:var(--dock-border);margin:4px 0;"></div>
              <div class="context-item" onclick="document.getElementById('tb-context')?.remove();App.updateTray()">🔄 Refresh taskbar</div>
            `);
            return;
        }
        showTbMenu(e.clientX, e.clientY, `
          <div style="padding:6px 14px;font-weight:700;opacity:0.55;font-size:11px;">Taskbar Position</div>
          <div class="context-item" onclick="document.getElementById('tb-context')?.remove();setTaskbarPos('top')">⏫ Pin to Top</div>
          <div class="context-item" onclick="document.getElementById('tb-context')?.remove();setTaskbarPos('bottom')">⏬ Pin to Bottom</div>
          <div class="context-item" onclick="document.getElementById('tb-context')?.remove();setTaskbarPos('left')">⏪ Pin to Left</div>
          <div class="context-item" onclick="document.getElementById('tb-context')?.remove();setTaskbarPos('right')">⏩ Pin to Right</div>
          <div style="height:1px;background:var(--dock-border);margin:4px 0;"></div>
          <div class="context-item" onclick="document.getElementById('tb-context')?.remove();setDockMode(!(localStorage.getItem('mica_dock_mode')==='1'))">🎯 Toggle App Dock</div>
          <div class="context-item" onclick="document.getElementById('tb-context')?.remove();openTaskView()">🗂 MicaTasking</div>
          <div style="height:1px;background:var(--dock-border);margin:4px 0;"></div>
          <div class="context-item" onclick="document.getElementById('tb-context')?.remove();App.updateTray()">🔄 Refresh</div>
          <div class="context-item" onclick="document.getElementById('tb-context')?.remove();App.open('Amber Settings')">⚙️ Settings</div>
        `);
    });
}
bindTaskbarContextMenu();
setTimeout(bindTaskbarContextMenu, 400);
setTimeout(bindTaskbarContextMenu, 1500);

if (typeof window !== 'undefined') {
    const _oldBoot = window.bootDesktop;
}




// ── True Fullscreen for app windows ──────────────────────────────────

(function initTrueFullscreen() {
    if (window.__micaFS) return;
    window.__micaFS = true;
    let activeWindow = null;

    const style = document.createElement('style');
    style.textContent = `
        .mica-fs-btn {
            width: 12px; height: 12px; border-radius: 50%;
            border: 1px solid rgba(0,0,0,0.25); background: #c084fc;
            cursor: pointer; margin: 0 3px 0 0; padding: 0;
            display: inline-block; flex-shrink: 0;
        }
        .mica-fs-btn:hover { transform: scale(1.15); opacity: 1; }
        .mica-fs-exit {
            position: fixed; top: 20px; right: 20px; width: 42px; height: 42px;
            border-radius: 50%; background: rgba(0,0,0,.55);
            border: 1px solid rgba(255,255,255,.2); color: #fff;
            display: none; align-items: center; justify-content: center;
            cursor: pointer; font-size: 18px; z-index: 2147483647; opacity: 0.15;
            transition: 0.25s; user-select: none;
        }
        .mica-fs-exit:hover { opacity: 1; background: #ef4444; transform: scale(1.1); }
        :fullscreen .mica-fs-exit, :-webkit-full-screen .mica-fs-exit { display: flex; }
        .window.mica-fullscreen-window { border-radius: 0 !important; }
    `;
    document.head.appendChild(style);

    const exitBtn = document.createElement('div');
    exitBtn.className = 'mica-fs-exit';
    exitBtn.innerHTML = '🗗';
    exitBtn.title = 'Exit Fullscreen';
    exitBtn.onclick = () => {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    };
    document.body.appendChild(exitBtn);

    function enterFullscreen(win) {
        if (!win) return;
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen();
            return;
        }
        activeWindow = win;
        win.dataset.fsLeft = win.style.left;
        win.dataset.fsTop = win.style.top;
        win.dataset.fsWidth = win.style.width;
        win.dataset.fsHeight = win.style.height;
        win.classList.add('mica-fullscreen-window');
        win.style.zIndex = ++App.z;
        try {
            // Do not use the browser Fullscreen API — it hides the whole OS chrome.
            if (win.id && App.enterTrueFullscreen) App.enterTrueFullscreen(win.id);
        } catch (e) { console.error(e); }
    }

    function restoreWindow() {
        if (!activeWindow) return;
        const win = activeWindow;
        win.classList.remove('mica-fullscreen-window');
        if (win.dataset.fsLeft) win.style.left = win.dataset.fsLeft;
        if (win.dataset.fsTop) win.style.top = win.dataset.fsTop;
        if (win.dataset.fsWidth) win.style.width = win.dataset.fsWidth;
        if (win.dataset.fsHeight) win.style.height = win.dataset.fsHeight;
        win.style.zIndex = ++App.z;
        activeWindow = null;
    }

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) restoreWindow();
    });
    document.addEventListener('webkitfullscreenchange', () => {
        if (!document.webkitFullscreenElement) restoreWindow();
    });

    window.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'x' || e.key === 'X')) {
            e.preventDefault();
            if (document.exitFullscreen) document.exitFullscreen();
        }
        if (e.altKey && e.key === 'Enter') {
            e.preventDefault();
            const w = activeWindow || document.querySelector('.window');
            if (w && w.id) App.toggleTrueFullscreen(w.id);
        }
    }, true);

    function injectButton(win) {
        return; // disabled — use App.onMaxClick / toggleTrueFullscreen
        if (!win || win.dataset.fsInjected) return;
        const controls = win.querySelector('.win-controls');
        if (!controls) return;
        const fsBtn = document.createElement('div');
        fsBtn.className = 'mica-fs-btn';
        fsBtn.title = 'Fullscreen (Alt+Enter)';
        fsBtn.textContent = '';
        fsBtn.onclick = e => {
            e.stopPropagation();
            activeWindow = win;
            if (document.fullscreenElement) document.exitFullscreen();
            else enterFullscreen(win);
        };
        controls.insertBefore(fsBtn, controls.firstChild);
        win.dataset.fsInjected = '1';
    }

    const observer = new MutationObserver(() => {
        document.querySelectorAll('.window').forEach(injectButton);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll('.window').forEach(injectButton);

    document.addEventListener('mousedown', e => {
        const win = e.target.closest('.window');
        if (!win) return;
        activeWindow = win;
        win.style.zIndex = ++App.z;
        if (App.updateTray) App.updateTray();
    }, true);
})();



// ── Mica Security UI ─────────────────────────────────────────────────

async function loadSecurityPanel(id) {
    const el = document.getElementById('sec_panel_' + id);
    if (!el) return;
    try {
        const st = await API.securityStatus();
        const req = st.requirements || {};
        el.innerHTML = `
          <h3 style="margin-top:0;">🔒 Mica Security</h3>
          <p style="font-size:12px;opacity:0.7;">Vault encryption, DevMode, and admin controls. Password unlocks your profile and decrypts data.</p>
          <div style="padding:12px;background:var(--input-bg);border-radius:10px;border:1px solid var(--dock-border);margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <b>Encrypt user data</b>
              <span style="font-size:12px;opacity:0.6;">${st.encryption_enabled ? 'ON' : 'OFF'}</span>
            </div>
            <p style="font-size:11px;opacity:0.55;margin:0 0 8px 0;">Per-user random Fernet key (username-bound), wrapped with your PIN. Admin can recover the key.</p>
            <button class="primary-btn" onclick="secToggleEnc(${!st.encryption_enabled})">${st.encryption_enabled ? 'Disable encryption' : 'Enable encryption'}</button>
          </div>
          <div style="padding:12px;background:var(--input-bg);border-radius:10px;border:1px solid var(--dock-border);margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <b>DevMode</b>
              <span style="font-size:12px;opacity:0.6;">${st.devmode ? 'ON' : 'OFF'}</span>
            </div>
            <p style="font-size:11px;opacity:0.55;margin:0 0 8px 0;">Unlocks <code>pyrouser</code> in Terminal — full kernel access.</p>
            <button class="primary-btn" onclick="secToggleDev(${!st.devmode})">${st.devmode ? 'Disable DevMode' : 'Enable DevMode'}</button>
          </div>
          <div style="padding:12px;background:var(--input-bg);border-radius:10px;border:1px solid var(--dock-border);margin-bottom:12px;">
            <b>Host &amp; external storage</b>
            <p style="font-size:11px;opacity:0.55;margin:6px 0 0 0;">Main drives (C:, D:, …) and external storage are always available in Jade for normal use and PC transfer. DiskFS unlock was removed — access is full-time.</p>
          </div>
          <div style="padding:12px;background:var(--input-bg);border-radius:10px;border:1px solid var(--dock-border);margin-bottom:12px;">
            <b>Admin PIN</b>
            <p style="font-size:11px;opacity:0.55;">Required for major system changes (plugins, host FS policy, DevMode).</p>
            <button class="primary-btn" onclick="secChangeAdminPin()">Change admin PIN</button>
          </div>
          <div style="padding:12px;background:var(--input-bg);border-radius:10px;border:1px solid var(--dock-border);">
            <b>Requirements</b>
            <p style="font-size:12px;margin:6px 0;">${req.ok ? '✅ All packages present' : '⚠️ Missing: ' + (req.missing || []).join(', ')}</p>
            <button onclick="secRefreshReqs('${id}')">Re-check</button>
          <hr style="border:0;border-top:1px solid var(--dock-border);margin:14px 0;">
            <h4>Vault key</h4>
            <p style="font-size:12px;opacity:0.65;">Each user has a random encryption key bound to their username. Reveal with admin password.</p>
            <button class="primary-btn" onclick="secRevealKey('${id}')">🔑 Reveal vault key (admin)</button>
            <div id="sec_key_${id}" style="margin-top:8px;"></div>
          </div>`;
    } catch (e) {
        el.innerHTML = '<p style="color:#ff5f56;">' + e.message + '</p>';
    }
}

async function secToggleEnc(enable) {
    const ok = await requireAdmin('toggle-encryption');
    if (!ok) return;
    const pin = prompt('Account PIN to ' + (enable ? 'enable' : 'disable') + ' encryption:');
    if (!pin) return;
    try {
        await API.securityEncryption(enable, pin);
        toast(enable ? 'Encryption enabled' : 'Encryption disabled');
        micaSoftReboot('Security changed — rebooting…');
    } catch (e) { toast(e.message); }
}

async function secToggleDiskfs(enable) {
    if (!enable) {
        // lock does not need admin
    } else {
        const ok = await requireAdmin('diskfs-unlock');
        if (!ok) return;
    }
    try {
        await API.diskfsUnlock(!!enable);
        toast(enable ? 'DiskFS unlocked — host write enabled' : 'DiskFS locked');
        window.__MICA_DISKFS_UNLOCKED = !!enable;
    } catch (e) { toast(e.message); }
}

async function secToggleDev(enable) {

    const ok = await requireAdmin('toggle-devmode');
    if (!ok) return;
    const pin = prompt('Account PIN:');
    if (!pin) return;
    try {
        await API.securityDevmode(enable, pin);
        toast(enable ? 'DevMode ON — pyrouser available' : 'DevMode OFF');
        const st = await API.securityStatus();
        window.__MICA_DEVMODE = !!st.devmode;
    } catch (e) { toast(e.message); }
}

async function secChangeAdminPin() {
    const cur = prompt('Current PIN (account or admin):');
    if (!cur) return;
    const neu = prompt('New admin PIN:');
    if (!neu) return;
    try {
        await API.adminSetPin(cur, neu);
        toast('Admin PIN updated');
    } catch (e) { toast(e.message); }
}

async function secRefreshReqs(id) {
    await loadSecurityPanel(id);
}

/** Admin permission popup for major actions */
async function requireAdmin(action) {
    return new Promise((resolve) => {
        let overlay = document.getElementById('mica-admin-overlay');
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.id = 'mica-admin-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000000;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
          <div style="background:var(--win-bg);border:1px solid var(--dock-border);border-radius:14px;padding:20px;min-width:300px;max-width:90vw;box-shadow:var(--shadow);">
            <h3 style="margin:0 0 8px 0;">🔐 Admin permission</h3>
            <p style="font-size:12px;opacity:0.7;margin:0 0 12px 0;">Action: <b>${action || 'restricted'}</b></p>
            <input id="mica_admin_pin" type="password" placeholder="Admin PIN" style="width:100%;margin-bottom:10px;" onkeydown="if(event.key==='Enter')document.getElementById('mica_admin_ok').click()">
            <div style="display:flex;gap:8px;justify-content:flex-end;">
              <button id="mica_admin_cancel">Cancel</button>
              <button class="primary-btn" id="mica_admin_ok">Allow</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        document.getElementById('mica_admin_cancel').onclick = () => { overlay.remove(); resolve(false); };
        document.getElementById('mica_admin_ok').onclick = async () => {
            const pin = document.getElementById('mica_admin_pin').value;
            try {
                await API.adminVerify(pin, action);
                overlay.remove();
                resolve(true);
            } catch (e) {
                toast(e.message || 'Denied');
                resolve(false);
            }
        };
        setTimeout(() => document.getElementById('mica_admin_pin')?.focus(), 50);
    });
}

// Gate plugin install
const _pluginsInstall = API.pluginsInstall?.bind(API);
if (_pluginsInstall) {
    API.pluginsInstall = async function(content, filename) {
        const ok = await requireAdmin('install-plugin:' + (filename || ''));
        if (!ok) throw new Error('Admin denied');
        return _pluginsInstall(content, filename);
    };
}


function micaKeepLayoutClasses() {
    // Keep everything that is NOT a theme-* class. Theme swaps must never wipe dock/topbar/perf.
    return [...document.body.classList].filter(c => c && !c.startsWith('theme-'));
}
function micaSetBodyThemeClass(themeCls) {
    const keep = micaKeepLayoutClasses();
    const t = (themeCls == null || themeCls === 'null') ? '' : String(themeCls).trim();
    const next = (t ? [t] : []).concat(keep).filter(Boolean);
    // De-dupe while preserving order
    const seen = new Set();
    const final = [];
    next.forEach(c => { if (!seen.has(c)) { seen.add(c); final.push(c); } });
    document.body.className = final.join(' ').trim();
    return t;
}
function applyTheme(cls) {
    // Builtin path: clear custom CSS/inline residue first so preview never "mixes"
    try { document.documentElement.style.zoom = ''; } catch (e) {}
    const builtins = new Set(['theme-dark', 'theme-obsidian', 'theme-nova', '']);
    const themeCls = (cls == null || cls === 'null') ? '' : String(cls).trim();
    if (builtins.has(themeCls)) {
        micaClearThemeOverrides();
        localStorage.setItem('mica_theme_is_custom', '0');
        localStorage.removeItem('mica_theme_disk_id');
    }
    micaSetBodyThemeClass(themeCls);
    localStorage.setItem('mica_theme', themeCls);
}
function reassertShellLayout() {
    try { if (typeof applyPerfMode === 'function') applyPerfMode(); } catch (e) {}
    try { if (typeof applyDockMode === 'function') applyDockMode(); } catch (e) {}
    try { if (typeof applyBubblePin === 'function') applyBubblePin(); } catch (e) {}
    try { if (typeof applyTaskbarPos === 'function') applyTaskbarPos(); } catch (e) {}
    try { if (typeof applyLayoutMode === 'function') applyLayoutMode(); } catch (e) {}
}

function dragWin(e, id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.target.closest('.win-controls')) return;
    if (el.dataset.fs === '1' || el.classList.contains('true-fullscreen')) return;
    el.style.zIndex = ++App.z;
    el.classList.add('is-dragging');
    // Never dim the window — translucent bugs came from opacity + is-dragging
    el.style.opacity = '1';
    let sX = e.clientX, sY = e.clientY, sL = el.offsetLeft, sT = el.offsetTop;
    document.onmousemove = ev => {
        el.style.left = (sL + ev.clientX - sX) + 'px';
        el.style.top = (sT + ev.clientY - sY) + 'px';
        el.style.opacity = '1';
    };
    document.onmouseup = () => {
        document.onmousemove = null;
        document.onmouseup = null;
        el.classList.remove('is-dragging');
        el.style.opacity = '1';
        el.style.transform = '';
        if (typeof micaSound === 'function') micaSound('tap');
    };
}

/** Route OS downloads into Jade Downloads folder instead of Windows */
(function micaInterceptDownloads() {
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = async function () {
        try {
            if (this.download && this.href && (this.href.startsWith('data:') || this.href.startsWith('blob:'))) {
                const name = this.download || 'download.bin';
                let text = '';
                if (this.href.startsWith('data:')) {
                    const parts = this.href.split(',');
                    const meta = parts[0] || '';
                    const data = parts.slice(1).join(',');
                    if (/;base64/i.test(meta)) {
                        text = data; // keep base64 for binary-ish packages
                        try { await API.mkdir('Downloads'); } catch (e) {}
                        // if looks like text package, decode
                        if (/mapp|mpkg|mupdate|json|text|javascript/i.test(meta) || /\.(mapp|mpkg|mupdate|txt|json|js|html|css|py)$/i.test(name)) {
                            try {
                                const decoded = decodeURIComponent(escape(atob(data)));
                                await API.write('Downloads/' + name, decoded.startsWith('{') ? decoded : data);
                            } catch (e) {
                                await API.write('Downloads/' + name, data);
                            }
                        } else {
                            await API.write('Downloads/' + name, 'data:' + (meta.replace(/^data:/,'') ? meta.split(':')[1] : 'application/octet-stream') + ';base64,' + data);
                        }
                    } else {
                        text = decodeURIComponent(data);
                        try { await API.mkdir('Downloads'); } catch (e) {}
                        await API.write('Downloads/' + name, text);
                    }
                    toast('Saved to Downloads/' + name);
                    if (typeof App !== 'undefined') App.open('Jade Explorer', { path: 'Downloads' });
                    return;
                }
            }
        } catch (e) {
            console.warn('download intercept', e);
        }
        return origClick.apply(this, arguments);
    };
})();

setInterval(() => { try { if (typeof App !== 'undefined') App.updateTray(); } catch (e) {} }, 2000);


async function secRevealKey(id) {
    const pin = prompt('Admin password to reveal vault key:');
    if (!pin) return;
    try {
        const info = await API.revealKey(pin);
        const box = document.getElementById('sec_key_' + id);
        if (box) {
            box.innerHTML = `<p style="font-size:12px;word-break:break-all;"><b>Fingerprint:</b> ${info.key_fingerprint}<br><b>Key:</b> <code>${info.key_b64}</code></p>`;
        } else {
            alert('Fingerprint: ' + info.key_fingerprint + '\nKey: ' + info.key_b64);
        }
        toast('Vault key revealed (admin)');
    } catch (e) {
        toast(e.message || 'Reveal failed');
    }
}


function tbAppContext(e, name) {
    const items = [
        { label: 'Open ' + name, fn: () => App.open(name) },
        (typeof isPinned === 'function' && isPinned(name))
            ? { label: '📌 Unpin from taskbar', fn: () => unpinApp(name) }
            : { label: '📌 Pin to taskbar', fn: () => pinApp(name) },
        '---',
        { label: '🗂 MicaTasking', fn: () => openTaskView() },
    ];
    // close running instances
    Object.keys(Registry).forEach(id => {
        if (Registry[id].type === name) {
            items.push({ label: '✕ Close window', fn: () => App.close(id) });
        }
    });
    if (typeof showMicaMenu === 'function') showMicaMenu(e.clientX, e.clientY, items);
}
