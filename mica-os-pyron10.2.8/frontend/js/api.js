/** Mica OS Pyron — API client (talks to Python kernel) */

const API = {
    token: localStorage.getItem('mica_token') || '',
    username: localStorage.getItem('mica_user') || '',

    headers(json = true) {
        const h = {};
        if (json) h['Content-Type'] = 'application/json';
        if (this.token) h['Authorization'] = `Bearer ${this.token}`;
        return h;
    },

    async writeText(path, content) {
        return this.post('/api/fs/write', { path, content, text: true });
    },
    async readText(path) {
        const r = await this.get('/api/fs/read?path=' + encodeURIComponent(path) + '&text=1');
        return r && (r.content != null ? r.content : r.text);
    },

    async get(url) {
        const r = await fetch(url, { headers: this.headers(false) });
        if (!r.ok) throw new Error(await r.text());
        return r.json();
    },

    async post(url, body) {
        const r = await fetch(url, {
            method: 'POST',
            headers: this.headers(true),
            body: JSON.stringify(body),
        });
        if (!r.ok) {
            let msg = await r.text();
            try { msg = JSON.parse(msg).detail || msg; } catch {}
            throw new Error(msg);
        }
        return r.json();
    },

    async login(username, pin) {
        const d = await this.post('/api/auth/login', { username, pin });
        this.token = d.token;
        this.username = d.username;
        localStorage.setItem('mica_token', d.token);
        localStorage.setItem('mica_user', d.username);
        // Do not overwrite a local theme preference (setup / settings)
        if (d.theme && !localStorage.getItem('mica_theme')) {
            localStorage.setItem('mica_theme', d.theme);
        }
        return d;
    },

    async create(username, pin) {
        const d = await this.post('/api/auth/create', { username, pin });
        this.token = d.token;
        this.username = d.username;
        localStorage.setItem('mica_token', d.token);
        localStorage.setItem('mica_user', d.username);
        return d;
    },

    async users() {
        return this.get('/api/users');
    },

    async list(path = '') {
        return this.get('/api/fs/list?path=' + encodeURIComponent(path));
    },

    async read(path) {
        return this.get('/api/fs/read?path=' + encodeURIComponent(path));
    },

    async write(path, content) {
        return this.post('/api/fs/write', { path, content });
    },

    async writeBinary(path, content_b64) {
        return this.post('/api/fs/write_binary', { path, content_b64 });
    },

    async mkdir(path) {
        return this.post('/api/fs/mkdir', { path });
    },

    async remove(path) {
        return this.post('/api/fs/delete', { path });
    },

    async move(src, dest) {
        return this.post('/api/fs/move', { src, dest });
    },

    async exec(code) {
        return this.post('/api/python/exec', { code });
    },

    async runFile(path) {
        return this.post('/api/python/run_file', { path });
    },

    async upload(path, file) {
        const fd = new FormData();
        fd.append('path', path || '');
        fd.append('file', file);
        const r = await fetch('/api/fs/upload', {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.token}` },
            body: fd,
        });
        if (!r.ok) throw new Error(await r.text());
        return r.json();
    },

    async restoreMica(file) {
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch('/api/auth/restore', { method: 'POST', body: fd });
        if (!r.ok) throw new Error(await r.text());
        return r.json();
    },

    async appsList() {
        return this.get('/api/apps/list');
    },

    async appsGet(appId, scope = null) {
        let url = '/api/apps/get?app_id=' + encodeURIComponent(appId);
        if (scope) url += '&scope=' + encodeURIComponent(scope);
        return this.get(url);
    },

    async appsInstall(content, filename = 'app.mapp') {
        return this.post('/api/apps/install', { content, filename });
    },

    async appsUninstall(appId) {
        return this.post('/api/apps/uninstall', { path: appId });
    },

    async appsRunPy(appId, code = '', scope = null) {
        return this.post('/api/apps/run_py', { app_id: appId, code, scope });
    },

    async appsRunMain(appId, scope = null) {
        return this.post('/api/apps/run_main', { app_id: appId, code: '', scope });
    },

    async pluginsList() {
        return this.get('/api/plugins/list');
    },

    async pluginsEnabled() {
        return this.get('/api/plugins/enabled');
    },

    async pluginsGet(pluginId) {
        return this.get('/api/plugins/get?plugin_id=' + encodeURIComponent(pluginId));
    },

    async pluginsInstall(content, filename = 'plugin.mplug') {
        return this.post('/api/plugins/install', { content, filename });
    },

    async pluginsUninstall(pluginId) {
        return this.post('/api/plugins/uninstall', { plugin_id: pluginId });
    },

    async pluginsEnable(pluginId, enabled) {
        return this.post('/api/plugins/enable', { plugin_id: pluginId, enabled });
    },

    async pluginsRunPy(pluginId) {
        return this.post('/api/plugins/run_py', { plugin_id: pluginId });
    },

    async backupMica() {
        return this.get('/api/backup/mica');
    },

    async themesList() {
        return this.get('/api/themes/list');
    },

    async themesActive() {
        return this.get('/api/themes/active');
    },

    async themesSave(theme) {
        return this.post('/api/themes/save', theme);
    },

    async themesDelete(themeId) {
        return this.post('/api/themes/delete', { path: themeId });
    },

    async themesActivate(themeId = null, builtin = null) {
        return this.post('/api/themes/activate', { theme_id: themeId, builtin });
    },

    async copy(src, dest) {
        return this.post('/api/fs/copy', { src, dest });
    },

    async hostRoots() {
        return this.get('/api/host/roots');
    },

    async systemStatus() {
        return this.get('/api/system/status');
    },
    async systemBattery() {
        return this.get('/api/system/battery');
    },
    async systemVolumeGet() {
        return this.get('/api/system/volume');
    },
    async systemVolumeSet(percent) {
        return this.post('/api/system/volume', { percent: Number(percent) });
    },
    async systemWifi() {
        return this.get('/api/system/wifi');
    },
    async systemWifiConnect(ssid, password = '') {
        return this.post('/api/system/wifi/connect', { ssid, password });
    },
    async systemBluetooth() {
        return this.get('/api/system/bluetooth');
    },
    async hostMkdir(path) {
        return this.post('/api/host/mkdir', { path });
    },
    async hostDelete(path) {
        return this.post('/api/host/delete', { path });
    },

    async hostList(path = '') {
        return this.get('/api/host/list?path=' + encodeURIComponent(path));
    },

    async hostRead(path) {
        return this.get('/api/host/read?path=' + encodeURIComponent(path));
    },

    async securityStatus() {
        return this.get('/api/security/status');
    },
    async securityReqs() {
        return this.get('/api/security/requirements');
    },
    async securityEncryption(enabled, pin) {
        return this.post('/api/security/encryption', { enabled, pin });
    },
    async securityDevmode(enabled, pin) {
        return this.post('/api/security/devmode', { enabled, pin });
    },
    async adminVerify(admin_pin, action = null) {
        return this.post('/api/security/admin/verify', { admin_pin, action });
    },
    async adminSetPin(current_pin, new_admin_pin) {
        return this.post('/api/security/admin/pin', { current_pin, new_admin_pin });
    },
    async pyrouser(command) {
        return this.post('/api/security/pyrouser', { command });
    },

    async launchNative(appId) {
        return this.post('/api/apps/launch_native', { path: appId });
    },

    async backupMica(pin = '') {
        return this.post('/api/backup/mica', { pin });
    },
    async backupMdfs() {
        return this.get('/api/backup/mdfs');
    },

    async updatesList() {
        return this.get('/api/updates/list');
    },
    async updatesInspect(content, filename = 'update.mupdate') {
        return this.post('/api/updates/inspect', { content, filename });
    },
    async updatesInstall(content, filename = 'update.mupdate', admin_approved = false, admin_pin = '') {
        return this.post('/api/updates/install', { content, filename, admin_approved, admin_pin });
    },
    async updatesUninstall(update_id) {
        return this.post('/api/updates/uninstall', { path: update_id });
    },
    async mdfsImport(content_b64) {
        return this.post('/api/backup/mdfs/import', { content_b64 });
    },
    async mdfsImportText(content) {
        return this.post('/api/backup/mdfs/import', { content });
    },

    async unzip(path, dest = null) {
        return this.post('/api/fs/unzip', { path, dest });
    },

    async revealKey(admin_pin) {
        return this.post('/api/security/reveal-key', { admin_pin });
    },

    async diskfsUnlock(enabled, admin_pin = '') {
        return this.post('/api/security/diskfs', { enabled, admin_pin });
    },
    async hostWrite(path, content) {
        return this.post('/api/host/write', { path, content });
    },
    async hostCopy(src, dest) {
        return this.post('/api/host/copy', { src, dest });
    },
    async hostMove(src, dest) {
        return this.post('/api/host/move', { src, dest });
    },
};
