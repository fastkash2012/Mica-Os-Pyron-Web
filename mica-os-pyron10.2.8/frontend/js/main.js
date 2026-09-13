/** Mica OS Pyron — shell / lock / desktop */

/* ── System sounds (Web Audio, no assets) ── */
window.MicaAudio = {
    ctx: null,
    enabled: localStorage.getItem('mica_sounds') !== '0',
    ensure() {
        if (!this.ctx) {
            try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return this.ctx;
    },
    beep(freq, dur, type, gain) {
        if (!this.enabled) return;
        const ctx = this.ensure();
        if (!ctx) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type || 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(gain || 0.04, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t + dur + 0.02);
    }
};
function micaSound(name) {
    if (localStorage.getItem('mica_sounds') === '0') return;
    const A = window.MicaAudio;
    if (!A) return;
    try {
        if (name === 'click' || name === 'tap') A.beep(620, 0.04, 'sine', 0.03);
        else if (name === 'open') { A.beep(440, 0.06, 'sine', 0.035); setTimeout(() => A.beep(660, 0.07, 'sine', 0.03), 40); }
        else if (name === 'close') { A.beep(520, 0.05, 'triangle', 0.03); setTimeout(() => A.beep(320, 0.08, 'triangle', 0.025), 35); }
        else if (name === 'whoosh') { A.beep(280, 0.1, 'sine', 0.025); setTimeout(() => A.beep(420, 0.08, 'sine', 0.02), 50); }
        else if (name === 'fullscreen') { A.beep(360, 0.08, 'sine', 0.03); setTimeout(() => A.beep(540, 0.1, 'sine', 0.028), 55); }
        else if (name === 'error') A.beep(180, 0.15, 'square', 0.03);
        else if (name === 'success') { A.beep(520, 0.06, 'sine', 0.03); setTimeout(() => A.beep(780, 0.1, 'sine', 0.03), 60); }
        else A.beep(500, 0.04, 'sine', 0.025);
    } catch (e) {}
}
function setMicaSounds(on) {
    localStorage.setItem('mica_sounds', on ? '1' : '0');
    if (window.MicaAppearance) MicaAppearance.set('mica_sounds', on ? '1' : '0');
    toast(on ? 'Sounds on' : 'Sounds off');
}
// Global click sounds on shell chrome
document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.closest('.tb-app-btn, .tb-start-btn, .bubble-btn, .sm-tile, .sm-list-item, .dt-icon, .qa-tile, .topbar-menu-item, .context-item, .primary-btn, #tb-taskview, #tb-bubble-pin')) {
        micaSound('click');
    }
}, true);



/* ── Appearance persistence (localStorage + disk) ── */
window.MicaAppearance = {
    KEYS: [
        'mica_dock_mode', 'mica_bubble_pin', 'mica_tb_pos', 'mica_theme',
        'mica_qa_mode', 'mica_perf', 'mica_setup_done', 'mica_bubble_slots',
        'mica_bubble_pos', 'mica_ui_scale', 'mica_display_res', 'mica_display_aspect',
        'mica_anim', 'mica_time_fmt', 'mica_pinned_apps', 'mica_icon_pos',
        'mica_hidden_icons', 'mica_volume', 'mica_brightness', 'mica_wallpaper',
        'mica_lock_wallpaper'
    ],
    snapshot() {
        const o = {};
        this.KEYS.forEach(k => {
            const v = localStorage.getItem(k);
            if (v != null) o[k] = v;
        });
        return o;
    },
    apply(o) {
        if (!o || typeof o !== 'object') return;
        Object.keys(o).forEach(k => {
            if (this.KEYS.includes(k) && o[k] != null) localStorage.setItem(k, o[k]);
        });
    },
    async saveToDisk() {
        try {
            if (typeof API === 'undefined' || !API.token) return;
            const data = JSON.stringify(this.snapshot(), null, 2);
            await API.writeText('System/appearance.json', data);
        } catch (e) { /* offline / no fs */ }
    },
    async loadFromDisk() {
        try {
            if (typeof API === 'undefined' || !API.token) return false;
            const t = await API.readText('System/appearance.json');
            if (!t) return false;
            const o = JSON.parse(t);
            this.apply(o);
            try {
                if (typeof applyTheme === 'function') applyTheme(localStorage.getItem('mica_theme') || 'theme-dark');
                if (typeof reassertShellLayout === 'function') reassertShellLayout();
            } catch (e2) {}
            return true;
        } catch (e) { return false; }
    },
    set(key, value) {
        localStorage.setItem(key, value);
        // debounce disk write
        clearTimeout(this._t);
        this._t = setTimeout(() => this.saveToDisk(), 400);
    }
};
function micaSet(key, val) {
    if (window.MicaAppearance) MicaAppearance.set(key, String(val));
    else localStorage.setItem(key, String(val));
}

/* ── Performance mode (9.3) ── */
function getPerfMode() {
    return localStorage.getItem('mica_perf') || 'full';
}
function setPerfMode(mode) {
    if (!['full', 'balanced', 'performance'].includes(mode)) mode = 'full';
    micaSet('mica_perf', mode);
    applyPerfMode();
    toast(mode === 'performance' ? 'Performance mode' : mode === 'balanced' ? 'Balanced' : 'Full visual quality');
}
function applyPerfMode() {
    const m = getPerfMode();
    document.body.classList.remove('perf-full', 'perf-balanced', 'perf-performance', 'no-anim');
    document.body.classList.add('perf-' + m);
    if (m === 'performance') {
        document.body.classList.add('no-anim');
        localStorage.setItem('mica_anim', '0');
    } else if (localStorage.getItem('mica_anim') === '0' && m !== 'performance') {
        // leave explicit anim off alone unless user chose performance
        document.body.classList.toggle('no-anim', localStorage.getItem('mica_anim') === '0');
    } else {
        document.body.classList.remove('no-anim');
        if (m === 'full' || m === 'balanced') {
            if (localStorage.getItem('mica_anim') == null) localStorage.setItem('mica_anim', '1');
        }
    }
}
function showBootLoader(on) {
    const el = document.getElementById('mica-boot-loader');
    if (!el) return;
    el.style.display = on ? 'flex' : 'none';
}




function appIconHtml(app, size) {
    size = size || 28;
    if (app && app.icon_data) {
        let src = app.icon_data;
        // normalize bare base64
        if (src && !src.startsWith('data:') && !src.startsWith('http') && !src.startsWith('/')) {
            src = 'data:image/png;base64,' + src;
        }
        return '<img src="' + src + '" alt="" onerror="this.style.display=\'none\';this.nextSibling&&(this.nextSibling.style.display=\'inline\')" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;border-radius:6px;"><span class="i" style="display:none">' + ((app && app.icon) || '📦') + '</span>';
    }
    if (app && app.id && API && API.token) {
        const src = '/api/apps/icon?id=' + encodeURIComponent(app.id) + '&token=' + encodeURIComponent(API.token);
        return '<img src="' + src + '" alt="" onerror="this.outerHTML=\'<span class=i>' + ((app && app.icon) || '📦') + '</span>\'" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;border-radius:6px;">';
    }
    return '<span class="i">' + ((app && app.icon) || '📦') + '</span>';
}


function qaSetVolume(v) {
    localStorage.setItem('mica_volume', String(v));
    const lab = document.getElementById('qa-vol-label');
    if (lab) lab.textContent = v + '%';
    const vol = Math.max(0, Math.min(1, Number(v) / 100));
    document.querySelectorAll('audio, video').forEach(el => { try { el.volume = vol; } catch(e) {} });
    // Host OS volume (Windows waveOut / Linux pactl)
    if (API && API.token) {
        clearTimeout(window.__volTimer);
        window.__volTimer = setTimeout(() => {
            API.systemVolumeSet(Number(v)).catch(() => {});
        }, 120);
    }
}

function qaSetBrightness(v) {
    localStorage.setItem('mica_brightness', String(v));
    const lab = document.getElementById('qa-br-label');
    if (lab) lab.textContent = v + '%';
    // Overlay filter on desktop root
    let overlay = document.getElementById('mica-brightness-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'mica-brightness-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999998;transition:opacity 0.15s;';
        document.body.appendChild(overlay);
    }
    const dim = Math.max(0, 1 - (Number(v) / 100));
    overlay.style.background = `rgba(0,0,0,${dim * 0.7})`;
}

async function qaRefreshStatus() {
    const bat = document.getElementById('qa-bat');
    const setBat = (pct, plugged) => {
        if (!bat) return;
        if (pct == null) { bat.textContent = '—'; return; }
        bat.textContent = pct + '%' + (plugged ? ' ⚡' : '');
    };
    try {
        if (API && API.token) {
            const st = await API.systemStatus();
            const b = st.battery || {};
            const v = st.volume || {};
            if (b.percent != null) setBat(b.percent, !!b.plugged);
            else setBat(null);
            if (v.percent != null) {
                const volEl = document.getElementById('qa-volume');
                const lab = document.getElementById('qa-vol-label');
                if (volEl && document.activeElement !== volEl) volEl.value = v.percent;
                if (lab) lab.textContent = v.percent + '%';
            }
            return;
        }
    } catch (e) {}
    if (navigator.getBattery) {
        try {
            const b = await navigator.getBattery();
            setBat(Math.round(b.level * 100), !!b.charging);
        } catch (e) { setBat(null); }
    } else setBat(null);
}


/* ── Unified clock (single controller for taskbar, quick menu, topbar) ── */
function getTimeFormat() {
    return localStorage.getItem('mica_time_fmt') || '12';
}
function setTimeFormat(fmt) {
    localStorage.setItem('mica_time_fmt', fmt === '24' ? '24' : '12');
    micaClockTick();
    toast(fmt === '24' ? '24-hour clock' : '12-hour clock');
}
function formatMicaTime(d) {
    d = d || new Date();
    const fmt = getTimeFormat();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    if (fmt === '24') {
        return String(h).padStart(2, '0') + ':' + m;
    }
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return h + ':' + m + ' ' + ampm;
}
function formatMicaDate(d) {
    d = d || new Date();
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function micaClockTick() {
    const time = formatMicaTime();
    const date = formatMicaDate();
    const tb = document.getElementById('tb-clock');
    if (tb) tb.textContent = time;
    document.querySelectorAll('#qa-clock-time, .mica-clock-time').forEach(el => { el.textContent = time; });
    document.querySelectorAll('#qa-clock-date, .mica-clock-date').forEach(el => { el.textContent = date; });
    const topTime = document.getElementById('topbar-clock');
    if (topTime) topTime.textContent = time;
}
function startMicaClock() {
    if (window.__micaClockTimer) clearInterval(window.__micaClockTimer);
    micaClockTick();
    window.__micaClockTimer = setInterval(micaClockTick, 1000);
}
function qaTickClock() { startMicaClock(); }

function qaInitControls() {
    const vol = localStorage.getItem('mica_volume') || '70';
    const br = localStorage.getItem('mica_brightness') || '100';
    const volEl = document.getElementById('qa-volume');
    const brEl = document.getElementById('qa-brightness');
    if (volEl) { volEl.value = vol; qaSetVolume(vol); }
    if (brEl) { brEl.value = br; qaSetBrightness(br); }
    qaRefreshStatus();
    window.addEventListener('online', qaRefreshStatus);
    window.addEventListener('offline', qaRefreshStatus);
}





function summonBubbleTo(clientX, clientY) {
    setBubblePin('floating');
    const el = document.getElementById('vertical-bubble');
    if (!el) return;
    el.style.left = Math.max(8, clientX - 30) + 'px';
    el.style.top = Math.max(8, clientY - 30) + 'px';
    el.style.right = 'auto';
    try {
        localStorage.setItem('mica_bubble_pos', JSON.stringify({ left: el.style.left, top: el.style.top }));
    } catch (e) {}
    try { clampBubbleInViewport(); } catch (e) {}
    toast('Bubble moved here');
}


function getQaMenuMode() {
    let m = localStorage.getItem('mica_qa_mode') || 'auto';
    if (m === 'auto') {
        const pin = (typeof getBubblePin === 'function') ? getBubblePin() : 'floating';
        if (pin === 'taskbar') return 'task';
        if (pin === 'topbar') return 'drop';
        return 'action';
    }
    if (['action', 'task', 'drop'].includes(m)) return m;
    return 'action';
}
function setQaMenuMode(mode) {
    micaSet('mica_qa_mode', mode || 'auto');
    if (typeof renderQuickMenu === 'function') renderQuickMenu();
    if (window.MicaUI && MicaUI.isQuickOpen && MicaUI.isQuickOpen()) {
        requestAnimationFrame(() => { try { MicaUI.positionQuick(); } catch (e) {} });
    }
}
function setQaMenuModeAuto() {
    setQaMenuMode('auto');
}

/* ── Quick Menu 9.2 — fixed modes, no widget system ── */
function renderQuickMenu() {
    const host = document.getElementById('qa-body');
    const qa = document.getElementById('quick-access');
    if (!host || !qa) return;
    const mode = getQaMenuMode();
    const pin = (typeof getBubblePin === 'function' ? getBubblePin() : 'floating');
    qa.classList.remove('qa-mode-action', 'qa-mode-task', 'qa-mode-drop', 'qa-pin-floating', 'qa-pin-taskbar', 'qa-pin-topbar');
    qa.classList.add('qa-mode-' + mode, 'qa-pin-' + pin, 'qa-compact');
    qa.dataset.mode = mode;
    qa.dataset.pin = pin;
    // Unified compact panel for all modes
    qa.style.width = '280px';
    qa.style.maxHeight = 'min(68vh, 340px)';
    host.innerHTML = renderCompactQuickMenu();
    const title = document.getElementById('qa-title');
    if (title) title.textContent = 'Control Center';
    qaInitControls();
    qaRefreshStatus();
    startMicaClock();
}
function renderCompactQuickMenu() {
    const vol = localStorage.getItem('mica_volume') || '70';
    const br = localStorage.getItem('mica_brightness') || '100';
    let recent = [];
    try {
        if (typeof micaGetRecentApps === 'function') recent = micaGetRecentApps() || [];
        else recent = JSON.parse(localStorage.getItem('mica_recent_apps') || '[]');
    } catch (e) { recent = []; }
    recent = (recent || []).filter(Boolean).slice(0, 4);
    while (recent.length < 4) recent.push(null);
    const recentHtml = recent.map(name => {
        if (!name) {
            return '<button type="button" class="qa-c-recent empty" disabled><span class="qa-c-ri">·</span><span class="qa-c-rn">—</span></button>';
        }
        const meta = (typeof BaseApps !== 'undefined' ? BaseApps.find(a => a.name === name) : null) || { icon: '◆' };
        const safe = String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return '<button type="button" class="qa-c-recent" onclick="App.open(\'' + safe + '\');toggleQuickAccess()">' +
          '<span class="qa-c-ri">' + (meta.icon || '◆') + '</span>' +
          '<span class="qa-c-rn">' + String(name).replace(/</g, '') + '</span></button>';
    }).join('');
    return (
      '<div class="qa-c-head">' +
        '<div class="qa-c-time mica-clock-time" id="qa-clock-time">--:--</div>' +
        '<div class="qa-c-date mica-clock-date" id="qa-clock-date">—</div>' +
      '</div>' +
      '<div class="qa-c-sliders">' +
        '<div class="qa-c-row"><span class="qa-c-ico">☀</span><input type="range" id="qa-brightness" min="0" max="100" value="' + br + '" oninput="qaSetBrightness(this.value)"></div>' +
        '<div class="qa-c-row"><span class="qa-c-ico">🔊</span><input type="range" id="qa-volume" min="0" max="100" value="' + vol + '" oninput="qaSetVolume(this.value)"></div>' +
      '</div>' +
      '<div class="qa-c-recent-label">Recent</div>' +
      '<div class="qa-c-recent-list">' + recentHtml + '</div>'
    );
}
function renderQuickWidgets() { renderQuickMenu(); }

function renderActionQuickMenu() {
    const vol = localStorage.getItem('mica_volume') || '70';
    const br = localStorage.getItem('mica_brightness') || '100';
    return (
      '<div class="qa-head-row">' +
        '<div class="qa-clock-block">' +
          '<div class="qa-clock-big mica-clock-time" id="qa-clock-time">--:--</div>' +
          '<div class="qa-clock-date mica-clock-date" id="qa-clock-date">—</div>' +
        '</div>' +
        '<div class="qa-bat-pill" title="Battery"><span class="qa-bat-ico">🔋</span><b id="qa-bat">—</b></div>' +
      '</div>' +
      '<div class="qa-slider-row"><span class="qa-ico">🔊</span>' +
        '<input type="range" id="qa-volume" min="0" max="100" value="' + vol + '" oninput="qaSetVolume(this.value)">' +
        '<b id="qa-vol-label" class="qa-val">' + vol + '%</b></div>' +
      '<div class="qa-slider-row"><span class="qa-ico">☀️</span>' +
        '<input type="range" id="qa-brightness" min="0" max="100" value="' + br + '" oninput="qaSetBrightness(this.value)">' +
        '<b id="qa-br-label" class="qa-val">' + br + '%</b></div>' +
      '<div class="qa-action-row">' +
        '<button type="button" class="qa-mini-btn" onclick="App.perfMode();toast(\'RAM cleared\')">🧹 Clear</button>' +
        '<button type="button" class="qa-mini-btn" onclick="logout()">⏻ Log out</button>' +
      '</div>'
    );
}

function renderTaskQuickMenu() {
    const vol = localStorage.getItem('mica_volume') || '70';
    const br = localStorage.getItem('mica_brightness') || '100';
    return (
      '<div class="qa-task-head">' +
        '<div class="qa-task-clock">' +
          '<span class="mica-clock-time" id="qa-clock-time">--:--</span>' +
          '<span class="mica-clock-date qa-muted" id="qa-clock-date">—</span>' +
        '</div>' +
        '<div class="qa-bat-pill"><span class="qa-bat-ico">🔋</span><b id="qa-bat">—</b></div>' +
      '</div>' +
      '<div class="qa-task-sliders">' +
        '<div class="qa-slider-block">' +
          '<div class="qa-slider-label"><span>🔊 Volume</span><b id="qa-vol-label">' + vol + '%</b></div>' +
          '<input type="range" id="qa-volume" min="0" max="100" value="' + vol + '" oninput="qaSetVolume(this.value)">' +
        '</div>' +
        '<div class="qa-slider-block">' +
          '<div class="qa-slider-label"><span>☀️ Brightness</span><b id="qa-br-label">' + br + '%</b></div>' +
          '<input type="range" id="qa-brightness" min="0" max="100" value="' + br + '" oninput="qaSetBrightness(this.value)">' +
        '</div>' +
      '</div>' +
      '<div class="qa-task-tiles">' +
        '<button type="button" class="qa-task-tile" onclick="App.perfMode();toast(\'RAM cleared\')"><span>🧹</span><span>Clear RAM</span></button>' +
        '<button type="button" class="qa-task-tile" onclick="App.open(\'Task Manager\');toggleQuickAccess()"><span>📊</span><span>Tasks</span></button>' +
        '<button type="button" class="qa-task-tile" onclick="logout()"><span>⏻</span><span>Log out</span></button>' +
      '</div>'
    );
}

function renderDropQuickMenu() {
    const vol = localStorage.getItem('mica_volume') || '70';
    const br = localStorage.getItem('mica_brightness') || '100';
    return (
      '<div class="qa-cc-top">' +
        '<div class="qa-cc-clock">' +
          '<div class="qa-clock-big mica-clock-time" id="qa-clock-time">--:--</div>' +
          '<div class="qa-clock-date mica-clock-date" id="qa-clock-date">—</div>' +
        '</div>' +
        '<div class="qa-cc-bat"><span>🔋</span><b id="qa-bat">—</b></div>' +
      '</div>' +
      '<div class="qa-cc-grid">' +
        '<div class="qa-cc-card qa-cc-wide">' +
          '<div class="qa-slider-label"><span>🔊 Volume</span><b id="qa-vol-label">' + vol + '%</b></div>' +
          '<input type="range" id="qa-volume" min="0" max="100" value="' + vol + '" oninput="qaSetVolume(this.value)">' +
        '</div>' +
        '<div class="qa-cc-card qa-cc-wide">' +
          '<div class="qa-slider-label"><span>☀️ Brightness</span><b id="qa-br-label">' + br + '%</b></div>' +
          '<input type="range" id="qa-brightness" min="0" max="100" value="' + br + '" oninput="qaSetBrightness(this.value)">' +
        '</div>' +
        '<button type="button" class="qa-cc-card" onclick="App.perfMode();toast(\'RAM cleared\')"><span class="qa-cc-ico">🧹</span><span>Clear RAM</span></button>' +
        '<button type="button" class="qa-cc-card" onclick="logout()"><span class="qa-cc-ico">⏻</span><span>Log out</span></button>' +
      '</div>'
    );
}

function qaEditWidgets() {
    /* Widget system removed in 9.2 — mode is set in Appearance settings */
    if (typeof App !== 'undefined') App.open('Amber Settings');
}

function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerText = msg;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 2500);
}


/* ═══════════════ MicaUI — menu system (ground-up) ═══════════════ */
window.MicaUI = {
    closeAll() {
        this.closeStart();
        this.closeQuick();
        document.querySelectorAll('.topbar-dd-menu.open').forEach(m => m.classList.remove('open'));
        const ctx = document.getElementById('tb-context');
        if (ctx) ctx.remove();
        const mm = document.getElementById('mica-ctx-menu');
        if (mm) mm.remove();
    },
    closeStart() {
        const sm = document.getElementById('start-menu');
        if (!sm) return;
        sm.style.display = 'none';
        sm.classList.remove('open', 'sm-centered', 'sm-anim-in');
        try { if (typeof pyroOnOsChromeChange === 'function') pyroOnOsChromeChange(); } catch (e) {}
    },
    closeQuick() {
        const qa = document.getElementById('quick-access');
        if (!qa) return;
        qa.classList.remove('open', 'qa-anim-in');
        qa.style.display = 'none';
        qa.style.visibility = '';
        try { if (typeof pyroOnOsChromeChange === 'function') pyroOnOsChromeChange(); } catch (e) {}
    },
    isStartOpen() {
        const sm = document.getElementById('start-menu');
        return sm && (sm.style.display === 'flex' || sm.classList.contains('open'));
    },
    isQuickOpen() {
        const qa = document.getElementById('quick-access');
        return qa && (qa.style.display === 'flex' || qa.classList.contains('open'));
    },
    positionStartMenu(anchor) {
        const sm = document.getElementById('start-menu');
        const tb = document.getElementById('taskbar');
        if (!sm) return;
        const dock = (typeof getDockMode === 'function' && getDockMode());
        const pos = localStorage.getItem('mica_tb_pos') || 'bottom';
        sm.style.bottom = 'auto';
        sm.style.top = 'auto';
        sm.style.left = 'auto';
        sm.style.right = 'auto';
        sm.style.transform = '';
        sm.classList.remove('sm-centered');

        // Resolve caller element
        let el = anchor;
        if (el && el.target) el = el.target;
        if (el && el.closest) {
            el = el.closest('.topbar-brand, .tb-start-btn, .bubble-btn, #tb-bubble-pin, button, [data-open-start]') || el;
        }
        const fromTopbar = !!(el && el.closest && (el.closest('#topbar-extras') || el.closest('.topbar-brand') || el.classList.contains('topbar-brand')));
        const fromTaskbar = !!(el && el.closest && (el.closest('#taskbar') || el.closest('.tb-start-btn')));

        // Contextual: open near the calling control when we have one
        if (fromTopbar) {
            const brand = document.querySelector('.topbar-brand') || el;
            const r = brand.getBoundingClientRect();
            sm.style.top = Math.max(32, r.bottom + 4) + 'px';
            sm.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 430)) + 'px';
            return;
        }
        if (fromTaskbar && !dock) {
            // fall through to classic taskbar placement below
        } else if (fromTaskbar && dock) {
            // fall through to dock centered
        }

        if (dock) {
            // App Dock → centered above dock
            sm.classList.add('sm-centered');
            sm.style.left = '50%';
            sm.style.transform = 'translateX(-50%)';
            if (pos === 'top') sm.style.top = '70px';
            else if (pos === 'left') {
                sm.style.top = '50%';
                sm.style.left = '80px';
                sm.style.transform = 'translateY(-50%)';
            } else if (pos === 'right') {
                sm.style.top = '50%';
                sm.style.right = '80px';
                sm.style.left = 'auto';
                sm.style.transform = 'translateY(-50%)';
            } else {
                sm.style.bottom = '80px';
            }
            return;
        }

        // Classic taskbar → corner near Start
        if (pos === 'bottom') {
            sm.style.bottom = '55px';
            sm.style.left = '10px';
        } else if (pos === 'top') {
            sm.style.top = '55px';
            sm.style.left = '10px';
        } else if (pos === 'left') {
            sm.style.top = '10px';
            sm.style.left = '55px';
        } else if (pos === 'right') {
            sm.style.top = '10px';
            sm.style.right = '55px';
        }
    },
    positionQuick() {
        const qa = document.getElementById('quick-access');
        if (!qa) return;
        const pin = (typeof getBubblePin === 'function') ? getBubblePin() : 'floating';
        const mode = (typeof getQaMenuMode === 'function') ? getQaMenuMode() : 'action';
        // Prefer measured size; fall back to fixed mode sizes so first paint is stable
        const defaults = { action: [260, 300], task: [360, 260], drop: [320, 380] };
        const def = defaults[mode] || defaults.action;
        const qw = qa.offsetWidth || def[0];
        const qh = qa.offsetHeight || def[1];
        const pad = 10;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        qa.style.right = 'auto';
        qa.style.bottom = 'auto';
        qa.style.transform = '';

        // Mode-aware anchors: drop→topbar, task→taskbar, action→bubble
        const prefer = mode === 'drop' ? 'topbar' : mode === 'task' ? 'taskbar' : pin;

        if (prefer === 'topbar' || (pin === 'topbar' && mode === 'drop')) {
            let left = vw - qw - 14;
            let top = (document.body.classList.contains('bubble-pin-topbar') ? 36 : 12);
            left = Math.max(pad, Math.min(left, vw - qw - pad));
            top = Math.max(pad, Math.min(top, vh - qh - pad));
            qa.style.left = left + 'px';
            qa.style.top = top + 'px';
            return;
        }
        if (prefer === 'taskbar' || pin === 'taskbar') {
            const pinBtn = document.getElementById('tb-bubble-pin');
            const tb = document.getElementById('taskbar');
            const pr = pinBtn ? pinBtn.getBoundingClientRect()
                : (tb ? tb.getBoundingClientRect() : { left: vw - 80, right: vw - 20, top: vh - 50, bottom: vh - 5 });
            let left = pr.right - qw;
            left = Math.max(pad, Math.min(left, vw - qw - pad));
            let top = pr.top - qh - 10;
            if (top < pad) top = Math.min(vh - qh - pad, (pr.bottom || pr.top) + 10);
            top = Math.max(pad, Math.min(top, vh - qh - pad));
            qa.style.left = left + 'px';
            qa.style.top = top + 'px';
            return;
        }
        // floating bubble / action mode
        const bubble = document.getElementById('vertical-bubble');
        if (bubble && bubble.offsetParent !== null && !bubble.classList.contains('pin-topbar') && !bubble.classList.contains('pin-taskbar')) {
            const br = bubble.getBoundingClientRect();
            let left = br.left - qw - 12;
            if (left < pad) left = br.right + 12;
            left = Math.max(pad, Math.min(left, vw - qw - pad));
            let top = br.top;
            top = Math.max(pad, Math.min(top, vh - qh - pad));
            qa.style.left = left + 'px';
            qa.style.top = top + 'px';
        } else {
            qa.style.left = Math.max(pad, vw - qw - 20) + 'px';
            qa.style.top = '56px';
        }
    },
    openStart() {
        if (!micaRequireSession('openStart')) return;
        this.closeQuick();
        const sm = document.getElementById('start-menu');
        if (!sm) return;
        // Position while fully invisible (opacity 0 + visibility) so dock centering never "teleports"
        sm.classList.remove('open', 'sm-anim-in');
        sm.style.opacity = '0';
        sm.style.visibility = 'hidden';
        sm.style.display = 'flex';
        sm.style.pointerEvents = 'none';
        this.positionStartMenu(window.__micaStartAnchor || null);
        void sm.offsetWidth;
        this.positionStartMenu(window.__micaStartAnchor || null);
        if (typeof renderStartMenu === 'function') renderStartMenu(window.__smMode || 'tiles');
        const u = document.getElementById('sm-user-label');
        if (u && typeof API !== 'undefined') u.textContent = API.username || 'User';
        // Reveal with fade/scale — no coordinate jump
        requestAnimationFrame(() => {
            sm.style.visibility = '';
            sm.style.pointerEvents = '';
            sm.classList.add('open', 'sm-anim-in');
            sm.style.opacity = '';
            try { if (typeof pyroOnOsChromeChange === 'function') pyroOnOsChromeChange(); } catch (e) {}
        });
        const s = document.getElementById('sm-search');
        if (s) { s.value = ''; setTimeout(() => s.focus(), 40); }
    },
    openQuick() {
        if (!micaRequireSession('openQuick')) return;
        this.closeStart();
        const qa = document.getElementById('quick-access');
        if (!qa) return;
        qa.classList.remove('open', 'qa-anim-in');
        qa.style.opacity = '0';
        qa.style.visibility = 'hidden';
        qa.style.display = 'flex';
        qa.style.pointerEvents = 'none';
        try {
            if (typeof renderQuickMenu === 'function') renderQuickMenu();
            else if (typeof renderQuickWidgets === 'function') renderQuickWidgets();
        } catch (e) { console.error('renderQuickMenu', e); }
        this.positionQuick();
        void qa.offsetWidth;
        this.positionQuick();
        requestAnimationFrame(() => {
            qa.style.visibility = '';
            qa.style.pointerEvents = '';
            qa.classList.add('open', 'qa-anim-in');
            qa.style.opacity = '';
            try {
                if (typeof qaInitControls === 'function') qaInitControls();
                if (typeof qaRefreshStatus === 'function') qaRefreshStatus();
                if (typeof startMicaClock === 'function') startMicaClock();
            } catch (e) {}
            this.positionQuick();
        });
    },
    toggleStart(e) {
        if (e) e.stopPropagation();
        window.__micaStartAnchor = e && (e.currentTarget || e.target) || null;
        if (this.isStartOpen()) this.closeStart();
        else this.openStart();
    },
    toggleQuick(e) {
        if (e) e.stopPropagation();
        if (this.isQuickOpen()) this.closeQuick();
        else this.openQuick();
    }
};

function closeMenus() {
    if (window.MicaUI) MicaUI.closeAll();
    else {
        const sm = document.getElementById('start-menu');
        if (sm) sm.style.display = 'none';
        const qa = document.getElementById('quick-access');
        if (qa) qa.style.display = 'none';
    }
}
function toggleMenu(e) {
    if (!micaRequireSession('start')) return;
    window.__micaStartAnchor = e && (e.currentTarget || e.target) || null;
    if (window.MicaUI) MicaUI.toggleStart(e);
}

/** True while lock-screen is visible / session not unlocked */
function micaIsLocked() {
    try {
        if (window.__MICA_SESSION_UNLOCKED === true) return false;
        const ls = document.getElementById('lock-screen');
        if (!ls) return true;
        if (ls.style.display === 'none') return false;
        // opacity 0 + pointer-events none after unlock animation still counts as unlocked once flagged
        const op = parseFloat(ls.style.opacity || '1');
        if (op === 0 && ls.style.pointerEvents === 'none') return false;
        // default: lock screen present in layout → locked
        const cs = window.getComputedStyle(ls);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        return true;
    } catch (e) { return !window.__MICA_SESSION_UNLOCKED; }
}
function micaRequireSession(action) {
    if (micaIsLocked()) {
        try { closeMenus(); } catch (e) {}
        try { toast('Unlock required'); } catch (e) {}
        return false;
    }
    return true;
}

function toggleQuickAccess(e) {
    if (!micaRequireSession('quick')) return;
    if (window.MicaUI) MicaUI.toggleQuick(e);
}
function positionQuickAccessNearBubble() {
    if (window.MicaUI) MicaUI.positionQuick();
}



function micaGetRecentApps() {
    try { return JSON.parse(localStorage.getItem('mica_recent_apps') || '[]'); } catch (e) { return []; }
}
function micaPushRecentApp(name) {
    if (!name) return;
    let arr = micaGetRecentApps().filter(n => n !== name);
    arr.unshift(name);
    arr = arr.slice(0, 12);
    try { localStorage.setItem('mica_recent_apps', JSON.stringify(arr)); } catch (e) {}
}
function micaGetRecentFiles() {
    try { return JSON.parse(localStorage.getItem('mica_recent_files') || '[]'); } catch (e) { return []; }
}
function micaPushRecentFile(path) {
    if (!path) return;
    let arr = micaGetRecentFiles().filter(p => p !== path);
    arr.unshift(path);
    arr = arr.slice(0, 10);
    try { localStorage.setItem('mica_recent_files', JSON.stringify(arr)); } catch (e) {}
}

function renderStartMenu(mode) {
    window.__smMode = mode || window.__smMode || 'tiles';
    const list = document.getElementById('sm-app-list');
    const label = document.getElementById('sm-section-label');
    if (!list) return;
    const q = (document.getElementById('sm-search') && document.getElementById('sm-search').value || '').trim().toLowerCase();
    let apps = (typeof BaseApps !== 'undefined' ? BaseApps : []).slice();
    if (q) {
        apps = apps.filter(a => (a.name || '').toLowerCase().includes(q) || (a.id || '').toLowerCase().includes(q));
        if (label) label.textContent = 'Search results (' + apps.length + ')';
        list.className = 'sm-list';
        list.innerHTML = apps.map(a =>
            '<div class="sm-list-item" onclick="App.open(\'' + String(a.name).replace(/\'/g, "\\'") + '\');toggleMenu();">' +
            (typeof appIconHtml === 'function' ? appIconHtml(a, 22) : (a.icon || '📦')) +
            '<span>' + a.name + '</span></div>'
        ).join('') || '<div style="opacity:0.5;padding:12px;">No apps found</div>';
        return;
    }
    if (window.__smMode === 'list') {
        if (label) label.textContent = 'All apps';
        list.className = 'sm-list';
        list.innerHTML = apps.map(a =>
            '<div class="sm-list-item" onclick="App.open(\'' + String(a.name).replace(/\'/g, "\\'") + '\');toggleMenu();">' +
            (typeof appIconHtml === 'function' ? appIconHtml(a, 22) : (a.icon || '📦')) +
            '<span>' + a.name + '</span></div>'
        ).join('') || '<div style="opacity:0.5;padding:12px;">No apps</div>';
        return;
    }
    // Features view — recent apps, recommended, recent files
    if (label) label.textContent = 'Features';
    list.className = 'sm-features';
    const recent = micaGetRecentApps();
    const recentApps = recent.map(n => (typeof BaseApps !== 'undefined' ? BaseApps : []).find(a => a.name === n)).filter(Boolean);
    const recommended = ['Jade Explorer', 'Ruby Editor', 'Pyro Browser', 'Beryl Studio', 'Amber Settings', 'Package Manager']
        .map(n => apps.find(a => a.name === n)).filter(Boolean).slice(0, 6);
    const files = micaGetRecentFiles();
    let html = '';
    html += '<div class="sm-feat-sec"><div class="sm-feat-h">Recent apps</div><div class="sm-feat-row">';
    if (recentApps.length) {
        html += recentApps.slice(0, 6).map(a =>
            '<button type="button" class="sm-feat-chip" onclick="App.open(\'' + String(a.name).replace(/\'/g, "\\'") + '\');toggleMenu();">' +
            (typeof appIconHtml === 'function' ? appIconHtml(a, 20) : (a.icon || '📦')) +
            '<span>' + a.name + '</span></button>'
        ).join('');
    } else {
        html += '<span class="sm-feat-empty">Open apps to see them here</span>';
    }
    html += '</div></div>';
    html += '<div class="sm-feat-sec"><div class="sm-feat-h">Recommended</div><div class="sm-feat-row">';
    html += recommended.map(a =>
        '<button type="button" class="sm-feat-chip" onclick="App.open(\'' + String(a.name).replace(/\'/g, "\\'") + '\');toggleMenu();">' +
        (typeof appIconHtml === 'function' ? appIconHtml(a, 20) : (a.icon || '📦')) +
        '<span>' + a.name + '</span></button>'
    ).join('');
    html += '</div></div>';
    html += '<div class="sm-feat-sec"><div class="sm-feat-h">Recent files</div><div class="sm-feat-files">';
    if (files.length) {
        html += files.slice(0, 8).map(p => {
            const name = p.split('/').pop() || p;
            const esc = String(p).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return '<button type="button" class="sm-feat-file" onclick="micaOpenRecentFile(\'' + esc + '\');toggleMenu();">📄 ' + name.replace(/</g, '') + '</button>';
        }).join('');
    } else {
        html += '<span class="sm-feat-empty">Files you open appear here</span>';
    }
    html += '</div></div>';
    list.innerHTML = html;
}

window.micaOpenRecentFile = function(path) {
    if (typeof App !== 'undefined') App.open('Ruby Editor', { path: path, scope: 'user' });
};
function filterStartMenu(q) {
    renderStartMenu(window.__smMode || 'tiles');
}




function dragBubble(e) {
    const el = document.getElementById('vertical-bubble');
    if (e.target.classList.contains('bubble-btn')) return;
    if (getBubblePin() !== 'floating') return;
    e.preventDefault();
    let sX = e.clientX, sY = e.clientY, sL = el.offsetLeft, sT = el.offsetTop;
    document.onmousemove = ev => {
        el.style.left = (sL + ev.clientX - sX) + 'px';
        el.style.top = (sT + ev.clientY - sY) + 'px';
        el.style.right = 'auto';
        // keep quick settings docked to bubble while dragging
        if (document.getElementById('quick-access')?.style.display === 'flex') {
            positionQuickAccessNearBubble();
        }
        try { localStorage.setItem('mica_bubble_pos', JSON.stringify({ left: el.style.left, top: el.style.top })); } catch (err) {}
    };
    document.onmouseup = () => { document.onmousemove = null; document.onmouseup = null; };
}

function restoreBubblePos() {
    try {
        const p = JSON.parse(localStorage.getItem('mica_bubble_pos') || 'null');
        const el = document.getElementById('vertical-bubble');
        if (p && el && (localStorage.getItem('mica_bubble_pin') || 'floating') === 'floating') {
            el.style.left = p.left;
            el.style.top = p.top;
            el.style.right = 'auto';
        }
    } catch (e) {}
    try { if (typeof applyBubblePin === 'function') applyBubblePin(); } catch (e) {}
    try { if (typeof applyDisplayLayout === 'function') applyDisplayLayout(); } catch (e) {}
}

/* ── Customizable bubble shortcuts (exactly 3 slots) ── */
const BUBBLE_DEFAULTS = [
    { icon: '⚡', title: 'Quick Access', type: 'toggle', action: 'quick' },
    { icon: '⚙️', title: 'Settings', type: 'app', action: 'Amber Settings' },
    { icon: '🧹', title: 'Clear RAM', type: 'event', action: 'clear_ram' },
];

function getBubbleConfig() {
    try {
        const raw = localStorage.getItem('mica_bubble_slots');
        if (raw) {
            const c = JSON.parse(raw);
            if (Array.isArray(c) && c.length === 3 && c.every(s => s && s.type && s.action)) return c;
        }
    } catch (e) {}
    return BUBBLE_DEFAULTS.map(x => ({ ...x }));
}

function saveBubbleConfig(cfg) {
    localStorage.setItem('mica_bubble_slots', JSON.stringify(cfg));
    try { renderBubbleSlots(); } catch (e) {}
    try { renderTopbarSlots(); } catch (e) {}
}

function renderBubbleSlots() {
    const cfg = getBubbleConfig();
    cfg.forEach((slot, i) => {
        const el = document.getElementById('bubble-slot-' + i);
        if (!el) return;
        el.textContent = slot.icon || '•';
        el.title = slot.title || ('Slot ' + (i + 1));
        el.style.color = (slot.action === 'clear_ram') ? '#ff5f56' : '';
    });
}


/** Three editable action slots on the menu bar (same config as floating bubble) */
function renderTopbarSlots() {
    const host = document.getElementById('topbar-slots');
    if (!host) return;
    const cfg = getBubbleConfig();
    host.innerHTML = cfg.map((slot, i) => {
        const color = (slot.action === 'clear_ram') ? ' style="color:#ff5f56"' : '';
        return '<button type="button" class="topbar-slot" data-slot="' + i + '" title="' +
            String(slot.title || ('Slot ' + (i + 1))).replace(/"/g, '&quot;') + '"' + color + '>' +
            (slot.icon || '•') + '</button>';
    }).join('');
    host.querySelectorAll('.topbar-slot').forEach(btn => {
        const i = parseInt(btn.getAttribute('data-slot'), 10);
        btn.onclick = (e) => { e.stopPropagation(); bubbleClick(i); };
        btn.oncontextmenu = (e) => bubbleContext(e, i);
    });
}

function bubbleClick(i) {
    const slot = getBubbleConfig()[i];
    if (!slot) return;
    if (slot.type === 'toggle' && slot.action === 'quick') {
        toggleQuickAccess();
        return;
    }
    if (slot.type === 'app') {
        App.open(slot.action);
        return;
    }
    if (slot.type === 'event') {
        if (slot.action === 'clear_ram') {
            App.perfMode();
            // also try to hint GC
            try { if (window.gc) window.gc(); } catch (e) {}
            toast('RAM cleared — windows closed');
            return;
        }
        if (slot.action === 'reboot') {
            micaSoftReboot('Bubble reboot');
            return;
        }
        if (slot.action === 'logout') {
            logout();
            return;
        }
        if (slot.action === 'explorer') {
            App.open('Jade Explorer');
            return;
        }
        if (slot.action === 'terminal') {
            App.open('Onyx Terminal');
            return;
        }
    }
    if (slot.type === 'toggle') {
        if (slot.action === 'start') toggleMenu();
        if (slot.action === 'anim') {
            const on = localStorage.getItem('mica_anim') === '0';
            osSetAnim(on);
            toast(on ? 'Animations on' : 'Animations off');
        }
    }
}

function bubbleContext(e, i) {
    e.preventDefault();
    e.stopPropagation();
    const apps = (typeof BaseApps !== 'undefined' ? BaseApps : []).map(a => a.name);
    const items = [
        { label: '⚡ Quick Settings panel', fn: () => bubbleSetSlot(i, { icon: '⚡', title: 'Quick Access', type: 'toggle', action: 'quick' }) },
        { label: '🧹 Clear RAM (close windows)', fn: () => bubbleSetSlot(i, { icon: '🧹', title: 'Clear RAM', type: 'event', action: 'clear_ram' }) },
        { label: '📁 Jade Explorer', fn: () => bubbleSetSlot(i, { icon: '📁', title: 'Explorer', type: 'event', action: 'explorer' }) },
        { label: '💻 Terminal', fn: () => bubbleSetSlot(i, { icon: '💻', title: 'Terminal', type: 'event', action: 'terminal' }) },
        { label: '🔄 Soft reboot', fn: () => bubbleSetSlot(i, { icon: '🔄', title: 'Reboot', type: 'event', action: 'reboot' }) },
        { label: '⏻ Log out', fn: () => bubbleSetSlot(i, { icon: '⏻', title: 'Log out', type: 'event', action: 'logout' }) },
        { label: '✨ Toggle animations', fn: () => bubbleSetSlot(i, { icon: '✨', title: 'Animations', type: 'toggle', action: 'anim' }) },
        '---',
    ];
    apps.forEach(name => {
        const meta = BaseApps.find(a => a.name === name) || {};
        items.push({
            label: (meta.icon || '📦') + ' ' + name,
            fn: () => bubbleSetSlot(i, { icon: meta.icon || '📦', title: name, type: 'app', action: name }),
        });
    });
    if (typeof showMicaMenu === 'function') {
        showMicaMenu(e.clientX, e.clientY, items);
    }
}

function bubbleSetSlot(i, def) {
    const cfg = getBubbleConfig();
    cfg[i] = Object.assign({}, def);
    saveBubbleConfig(cfg);
    // force write verify
    try { localStorage.setItem('mica_bubble_slots', JSON.stringify(cfg)); } catch (e) {}
    try { renderBubbleSlots(); } catch (e) {}
    try { renderTopbarSlots(); } catch (e) {}
    toast('Slot ' + (i + 1) + ' → ' + (def.title || def.action));
}



/* ── Bubble pin modes: floating | topbar | taskbar ── */
function getBubblePin() {
    return localStorage.getItem('mica_bubble_pin') || 'floating';
}
function setBubblePin(mode) {
    micaSet('mica_bubble_pin', mode);
    applyBubblePin();
    applyLayoutMode();
    if (typeof applyTaskbarPos === 'function') applyTaskbarPos();
    // If mode is auto (no forced), panel layout follows pin
    try {
        const qa = document.getElementById('quick-access');
        if (qa && (qa.style.display === 'flex' || qa.classList.contains('open'))) { if (typeof renderQuickMenu === 'function') renderQuickMenu(); if (window.MicaUI) MicaUI.positionQuick(); }
    } catch (e) {}
    toast(mode === 'topbar' ? 'Pinned to top bar' : mode === 'taskbar' ? 'Pinned to taskbar' : 'Floating bubble');
}

function topbarFillRecentFiles() {
    const box = document.getElementById('topbar-recent-files');
    if (!box) return;
    let files = [];
    try {
        if (typeof micaGetRecentFiles === 'function') files = micaGetRecentFiles() || [];
        else files = JSON.parse(localStorage.getItem('mica_recent_files') || '[]');
    } catch (e) { files = []; }
    files = (files || []).slice(0, 5);
    if (!files.length) {
        box.innerHTML = '<div class="topbar-dd-item" style="opacity:0.45;">No recent files</div>';
        return;
    }
    box.innerHTML = files.map(f => {
        const path = typeof f === 'string' ? f : (f.path || f.name || '');
        const label = path.split('/').pop() || path;
        return '<div class="topbar-dd-item" data-act="open-recent" data-path="' + String(path).replace(/"/g, '&quot;') + '">📄 ' + String(label).replace(/</g,'') + '</div>';
    }).join('');
    box.querySelectorAll('.topbar-dd-item').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.topbar-dd-menu.open').forEach(m => m.classList.remove('open'));
            const path = item.getAttribute('data-path');
            if (!path) return;
            const folder = path.includes('/') ? path.split('/').slice(0, -1).join('/') : 'Documents';
            App.open('Jade Explorer', { path: folder });
        };
    });
}


/* ── Top bar pinned apps + editable status buttons ── */
function getTopbarStatusBtns() {
    try {
        const a = JSON.parse(localStorage.getItem('mica_topbar_btns') || 'null');
        if (Array.isArray(a) && a.length) return a;
    } catch (e) {}
    return [
        { id: 'search', icon: '⌕', title: 'Search', act: 'start' },
        { id: 'cc', icon: '▣', title: 'Control Centre', act: 'quick' },
        { id: 'clock', icon: '', title: 'Clock', act: 'quick', clock: true },
    ];
}
function setTopbarStatusBtns(arr) {
    try { localStorage.setItem('mica_topbar_btns', JSON.stringify(arr || [])); } catch (e) {}
}
function topbarRenderStatusBtns() {
    const host = document.getElementById('topbar-right-btns');
    if (!host) return;
    const btns = getTopbarStatusBtns();
    host.innerHTML = btns.map(b => {
        if (b.clock) {
            return '<span class="topbar-clock mica-clock-time" data-act="' + (b.act || 'quick') + '" title="' + (b.title || 'Clock') + '">--:--</span>';
        }
        return '<span class="topbar-status" data-act="' + (b.act || 'quick') + '" data-btn-id="' + (b.id || '') + '" title="' + (b.title || '') + '">' + (b.icon || '•') + '</span>';
    }).join('');
    host.querySelectorAll('[data-act]').forEach(el => {
        el.onclick = (e) => {
            e.stopPropagation();
            const act = el.getAttribute('data-act');
            if (act === 'start') toggleMenu(e);
            else if (act === 'quick') toggleQuickAccess();
            else if (act === 'taskview' && typeof openTaskView === 'function') openTaskView();
            else if (act === 'settings') App.open('Amber Settings');
            else if (act === 'logout') logout();
            else toggleQuickAccess();
        };
    });
    try { if (typeof micaClockTick === 'function') micaClockTick(); } catch (e) {}
}
function topbarRenderPins() {
    const host = document.getElementById('topbar-pins');
    if (!host) return;
    const pinned = (typeof getPinnedApps === 'function') ? getPinnedApps() : [];
    host.innerHTML = pinned.map(name => {
        const meta = (typeof BaseApps !== 'undefined' ? BaseApps.find(a => a.name === name) : null) || { icon: '◆', name };
        const ico = meta.icon || '◆';
        const safe = String(name).replace(/'/g, "\\'");
        return '<button type="button" class="topbar-pin-btn" title="' + String(name).replace(/"/g, '&quot;') + '" data-app="' + safe + '">' +
          (meta.icon_data ? '<img src="' + meta.icon_data + '" alt="">' : '<span>' + ico + '</span>') +
          '</button>';
    }).join('');
    host.querySelectorAll('.topbar-pin-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const app = btn.getAttribute('data-app');
            if (app) App.open(app);
        };
        btn.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const app = btn.getAttribute('data-app');
            if (!app) return;
            if (typeof showMicaMenu === 'function') {
                showMicaMenu(e.clientX, e.clientY, [
                    { label: 'Open ' + app, fn: () => App.open(app) },
                    { label: 'Unpin from menu bar', fn: () => { unpinApp(app); topbarRenderPins(); if (App.updateTray) App.updateTray(); } },
                ]);
            } else {
                unpinApp(app);
                topbarRenderPins();
            }
        };
    });
}
function topbarContextMenu(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const apps = (typeof BaseApps !== 'undefined' ? BaseApps : []).map(a => a.name);
    const pinned = getPinnedApps();
    const pinItems = apps.slice(0, 16).map(name => ({
        label: (pinned.includes(name) ? '✓ ' : '') + name,
        fn: () => {
            if (pinned.includes(name)) unpinApp(name);
            else pinApp(name);
        }
    }));
    const menu = ['---'].concat(
        [{ label: 'Pin / unpin apps', fn: function(){} }]
    );
    // Flat usable list
    const items = pinItems.concat([
        '---',
        { label: 'Edit status buttons…', fn: () => topbarEditStatusBtns() },
        { label: 'Reset status buttons', fn: () => {
            localStorage.removeItem('mica_topbar_btns');
            topbarRenderStatusBtns();
            toast('Status buttons reset');
        }},
    ]);
    if (typeof showMicaMenu === 'function') showMicaMenu(e.clientX, e.clientY, items);
    else toast('Right-click menu unavailable');
}
function topbarEditStatusBtns() {
    const cur = getTopbarStatusBtns();
    const presets = [
        { id: 'search', icon: '⌕', title: 'Search', act: 'start' },
        { id: 'cc', icon: '▣', title: 'Control Centre', act: 'quick' },
        { id: 'tasks', icon: '▦', title: 'MicaTasking', act: 'taskview' },
        { id: 'settings', icon: '⚙', title: 'Settings', act: 'settings' },
        { id: 'clock', icon: '', title: 'Clock', act: 'quick', clock: true },
    ];
    // Cycle: allow up to 4 buttons from presets via simple prompt list
    const names = presets.map((p, i) => (i + 1) + ') ' + p.title).join('\n');
    const raw = prompt('Status buttons (comma-separated numbers, max 4):\n' + names + '\n\nCurrent: ' + cur.map(c => c.title).join(', '), '1,2,5');
    if (raw == null) return;
    const picks = raw.split(/[,\s]+/).map(s => parseInt(s, 10) - 1).filter(i => i >= 0 && i < presets.length).slice(0, 4);
    if (!picks.length) return toast('No buttons selected');
    const next = picks.map(i => presets[i]);
    setTopbarStatusBtns(next);
    topbarRenderStatusBtns();
    toast('Status buttons updated');
}

function applyBubblePin() {
    const mode = getBubblePin();
    const el = document.getElementById('vertical-bubble');
    document.body.classList.remove('bubble-pin-topbar', 'bubble-pin-taskbar');
    const extra = document.getElementById('topbar-extras');
    if (extra) extra.remove();
    document.querySelectorAll('.topbar-dd-menu.open').forEach(m => m.classList.remove('open'));

    if (el) {
        el.classList.remove('pin-topbar', 'pin-taskbar');
        if (mode === 'topbar') {
            el.classList.add('pin-topbar');
            document.body.classList.add('bubble-pin-topbar');
            el.style.left = '';
            el.style.top = '';
            el.style.right = '';
            const bar = document.createElement('div');
            bar.id = 'topbar-extras';
                        bar.innerHTML =
              '<div class="topbar-left">' +
              '<span class="topbar-brand" onclick="toggleMenu(event)" title="Start">❖</span>' +
              '<div class="topbar-dd">' +
                '<span class="topbar-menu-item" data-dd="go">Go</span>' +
                '<div class="topbar-dd-menu" id="topbar-dd-go">' +
                  '<div class="topbar-dd-item" data-act="taskview">MicaTasking</div>' +
                  '<div class="topbar-dd-item" data-act="desktop">Show desktop</div>' +
                  '<div class="topbar-dd-sep"></div>' +
                  '<div class="topbar-dd-item" data-open="Jade Explorer">Jade Explorer</div>' +
                  '<div class="topbar-dd-item" data-act="downloads">Downloads</div>' +
                  '<div class="topbar-dd-item" data-act="documents">Documents</div>' +
                  '<div class="topbar-dd-item" data-act="pictures">Pictures</div>' +
                '</div>' +
              '</div>' +
              '<div class="topbar-dd">' +
                '<span class="topbar-menu-item" data-dd="view">View</span>' +
                '<div class="topbar-dd-menu" id="topbar-dd-view">' +
                  '<div class="topbar-dd-item" data-act="dock-mode">App Dock mode</div>' +
                  '<div class="topbar-dd-item" data-act="classic-tb">Classic taskbar</div>' +
                  '<div class="topbar-dd-sep"></div>' +
                  '<div class="topbar-dd-item" data-act="time12">12-hour clock</div>' +
                  '<div class="topbar-dd-item" data-act="time24">24-hour clock</div>' +
                  '<div class="topbar-dd-sep"></div>' +
                  '<div class="topbar-dd-item" data-act="perf-full">Full effects</div>' +
                  '<div class="topbar-dd-item" data-act="perf-balanced">Balanced</div>' +
                  '<div class="topbar-dd-item" data-act="perf-speed">Performance</div>' +
                '</div>' +
              '</div>' +
              '<div class="topbar-dd">' +
                '<span class="topbar-menu-item" data-dd="window">Window</span>' +
                '<div class="topbar-dd-menu" id="topbar-dd-window">' +
                  '<div class="topbar-dd-item" data-open="Amber Settings">Settings</div>' +
                  '<div class="topbar-dd-item" data-open="Package Manager">Packages</div>' +
                  '<div class="topbar-dd-item" data-open="Task Manager">Task Manager</div>' +
                  '<div class="topbar-dd-sep"></div>' +
                  '<div class="topbar-dd-item" data-act="clear">Close all windows</div>' +
                  '<div class="topbar-dd-item" data-act="logout">Log out</div>' +
                '</div>' +
              '</div>' +
              '</div>' +
              '<div class="topbar-right">' +
              '<div class="topbar-slots" id="topbar-slots"></div>' +
              '<span class="topbar-clock mica-clock-time" id="topbar-clock" title="Control Centre">--:--</span>' +
              '</div>';

            el.insertBefore(bar, el.firstChild);
            try { renderTopbarSlots(); } catch (e) {}
            const clk = document.getElementById('topbar-clock');
            if (clk) clk.onclick = (e) => { e.stopPropagation(); toggleQuickAccess(); };
            bar.oncontextmenu = function(ev) {
                if (ev.target.closest && (ev.target.closest('.topbar-slot') || ev.target.closest('.topbar-dd-menu'))) return;
                ev.preventDefault();
                ev.stopPropagation();
                if (typeof bubbleShellContext === 'function') bubbleShellContext(ev);
            };

            // dropdown open
            bar.querySelectorAll('.topbar-menu-item[data-dd]').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const id = 'topbar-dd-' + btn.getAttribute('data-dd');
                    const menu = document.getElementById(id);
                    const was = menu && menu.classList.contains('open');
                    document.querySelectorAll('.topbar-dd-menu.open').forEach(m => m.classList.remove('open'));
                    if (menu && !was) menu.classList.add('open');
                };
            });
            try { topbarFillRecentFiles(); } catch (e) {}
            bar.querySelectorAll('.topbar-dd-item').forEach(item => {
                item.onclick = (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.topbar-dd-menu.open').forEach(m => m.classList.remove('open'));
                    const open = item.getAttribute('data-open');
                    const act = item.getAttribute('data-act');
                    if (open) { App.open(open); return; }
                    if (act === 'taskview') { if (typeof openTaskView === 'function') openTaskView(); return; }
                    if (act === 'desktop') {
                        Object.keys(Registry || {}).forEach(id => { try { App.minimize(id); } catch (err) {} });
                        toast('Desktop');
                        return;
                    }
                    if (act === 'downloads') { App.open('Jade Explorer', { path: 'Downloads' }); return; }
                    if (act === 'documents') { App.open('Jade Explorer', { path: 'Documents' }); return; }
                    if (act === 'pictures') { App.open('Jade Explorer', { path: 'Pictures' }); return; }
                    if (act === 'pin-app') {
                        const app = item.getAttribute('data-app');
                        if (app && typeof pinApp === 'function') { pinApp(app); if (App.updateTray) App.updateTray(); toast('Pinned ' + app); }
                        return;
                    }
                    if (act === 'unpin-all') {
                        if (typeof setPinnedApps === 'function') setPinnedApps(['Jade Explorer']);
                        if (App.updateTray) App.updateTray();
                        toast('Pinned apps reset');
                        return;
                    }
                    if (act === 'open-recent') {
                        const path = item.getAttribute('data-path');
                        if (path) App.open('Jade Explorer', { path: path.includes('/') ? path.split('/').slice(0,-1).join('/') : 'Documents' });
                        return;
                    }
                    if (act === 'toggle-topbar') {
                        const on = !document.body.classList.contains('bubble-pin-topbar');
                        if (typeof setBubblePin === 'function') setBubblePin(on ? 'topbar' : 'floating');
                        else if (typeof applyBubblePin === 'function') applyBubblePin(on ? 'topbar' : 'floating');
                        return;
                    }
                    if (act === 'dock-mode') {
                        if (typeof applyDockMode === 'function') applyDockMode(true);
                        else if (typeof setDockMode === 'function') setDockMode(true);
                        toast('App Dock');
                        return;
                    }
                    if (act === 'classic-tb') {
                        if (typeof applyDockMode === 'function') applyDockMode(false);
                        else if (typeof setDockMode === 'function') setDockMode(false);
                        toast('Classic taskbar');
                        return;
                    }
                    if (act === 'perf-full' && typeof applyPerfMode === 'function') { applyPerfMode('full'); toast('Full effects'); return; }
                    if (act === 'perf-balanced' && typeof applyPerfMode === 'function') { applyPerfMode('balanced'); toast('Balanced'); return; }
                    if (act === 'perf-speed' && typeof applyPerfMode === 'function') { applyPerfMode('performance'); toast('Performance'); return; }
                    if (act === 'clear') { App.perfMode(); toast('Windows closed'); return; }
                    if (act === 'logout') { logout(); return; }
                    if (act === 'time12') { setTimeFormat('12'); return; }
                    if (act === 'time24') { setTimeFormat('24'); return; }
                };
            });
            const w = document.getElementById('topbar-wifi');
            if (w) w.onclick = (e) => { e.stopPropagation(); toggleQuickAccess(); };
            const b = document.getElementById('topbar-bat');
            if (b) b.onclick = (e) => { e.stopPropagation(); toggleQuickAccess(); };
            const sr = document.getElementById('topbar-search');
            if (sr) sr.onclick = (e) => { e.stopPropagation(); toggleMenu(e); };
            const cl = document.getElementById('topbar-clock');
            if (cl) cl.onclick = (e) => { e.stopPropagation(); toggleQuickAccess(); };
            if (!window.__topbarDdBound) {
                window.__topbarDdBound = true;
                document.addEventListener('mousedown', (ev) => {
                    if (!ev.target.closest('.topbar-dd') && !ev.target.closest('#topbar-extras')) {
                        document.querySelectorAll('.topbar-dd-menu.open').forEach(m => m.classList.remove('open'));
                    }
                }, true);
            }
            micaClockTick();
            qaRefreshStatus().catch(() => {});
        } else if (mode === 'taskbar') {
            el.classList.add('pin-taskbar');
            document.body.classList.add('bubble-pin-taskbar');
        } else {
            try {
                const p = JSON.parse(localStorage.getItem('mica_bubble_pos') || 'null');
                if (p && p.left) { el.style.left = p.left; el.style.top = p.top; el.style.right = 'auto'; }
            } catch (e) {}
        }
    }
    const qa = document.getElementById('quick-access');
    if (qa) qa.style.display = 'none';
}


function bubbleShellContext(e) {
    e.preventDefault();
    e.stopPropagation();
    const mode = getBubblePin();
    const items = [
        { label: (mode === 'floating' ? '✓ ' : '') + 'Floating bubble', fn: () => setBubblePin('floating') },
        { label: (mode === 'topbar' ? '✓ ' : '') + 'Pin to top (menu bar)', fn: () => setBubblePin('topbar') },
        { label: (mode === 'taskbar' ? '✓ ' : '') + 'Pin to taskbar', fn: () => setBubblePin('taskbar') },
        '---',
        { label: '⚡ Open Quick Menu', fn: () => toggleQuickAccess() },
    ];
    if (typeof showMicaMenu === 'function') showMicaMenu(e.clientX, e.clientY, items);
    else {
        // fallback
        const pick = prompt('Pin mode: floating / topbar / taskbar', mode);
        if (pick) setBubblePin(pick);
    }
}

// Apply pin on boot
document.addEventListener('DOMContentLoaded', () => { setTimeout(applyBubblePin, 200); setTimeout(function(){ try { micaPrefetchWallpapers(); } catch(e){} }, 300); });


/**
 * Fixed concrete desktop grid.
 * Origin never moves when topbar toggles — TOP_PAD always reserves space for a top bar.
 * Only side classic taskbar shifts left/right origin.
 */
const MICA_DESK_GRID = {
    TOP_PAD: 28,   // fixed — topbar fits here without moving the grid
    LEFT_PAD: 14,
    RIGHT_PAD: 14,
    BOTTOM_PAD: 20,
    CELL_W: 88,
    CELL_H: 90,
};

function micaDesktopInsets() {
    const tbPos = localStorage.getItem('mica_tb_pos') || 'bottom';
    const dock = localStorage.getItem('mica_dock_mode') === '1';
    const sideClassic = !dock && (tbPos === 'left' || tbPos === 'right');
    return {
        top: MICA_DESK_GRID.TOP_PAD,
        left: (sideClassic && tbPos === 'left') ? 64 : MICA_DESK_GRID.LEFT_PAD,
        right: (sideClassic && tbPos === 'right') ? 64 : MICA_DESK_GRID.RIGHT_PAD,
        bottom: (!dock && tbPos === 'bottom') ? 8 : MICA_DESK_GRID.BOTTOM_PAD,
        cellW: MICA_DESK_GRID.CELL_W,
        cellH: MICA_DESK_GRID.CELL_H,
    };
}

function micaDesktopGridOrigin() {
    const ins = micaDesktopInsets();
    return { x: ins.left, y: ins.top, cellW: ins.cellW, cellH: ins.cellH, ins };
}

function micaDesktopDefaultPos(index) {
    const g = micaDesktopGridOrigin();
    const dt = document.getElementById('desktop');
    const availH = Math.max(200, (dt ? dt.clientHeight : window.innerHeight) - g.ins.top - g.ins.bottom);
    const rows = Math.max(1, Math.floor(availH / g.cellH));
    const col = Math.floor(index / rows);
    const row = index % rows;
    return { x: g.x + col * g.cellW, y: g.y + row * g.cellH };
}

function micaSnapIconPos(x, y, selfId) {
    const g = micaDesktopGridOrigin();
    let col = Math.round((x - g.x) / g.cellW);
    let row = Math.round((y - g.y) / g.cellH);
    col = Math.max(0, col);
    row = Math.max(0, row);
    let fX = g.x + col * g.cellW;
    let fY = g.y + row * g.cellH;
    // Never place above the fixed top pad
    if (fY < g.y) fY = g.y;
    const occupied = new Set();
    try {
        const sP = JSON.parse(localStorage.getItem('mica_icon_pos') || '{}');
        Object.entries(sP).forEach(([id, p]) => {
            if (id === selfId || !p) return;
            occupied.add(p.x + ',' + p.y);
        });
    } catch (e) {}
    let attempts = 0;
    while (occupied.has(fX + ',' + fY) && attempts < 80) {
        row++;
        const dt = document.getElementById('desktop');
        const maxY = (dt ? dt.clientHeight : window.innerHeight) - g.ins.bottom - g.cellH;
        if (g.y + row * g.cellH > maxY) {
            row = 0;
            col++;
        }
        fX = g.x + col * g.cellW;
        fY = g.y + row * g.cellH;
        attempts++;
    }
    return { x: fX, y: fY };
}

function renderDesktop(forceGrid) {
    const dt = document.getElementById('desktop');
    if (!dt) return;
    dt.innerHTML = '';
    let savedPos = {};
    try { savedPos = JSON.parse(localStorage.getItem('mica_icon_pos') || '{}'); } catch (e) { savedPos = {}; }
    let hiddenIcons = [];
    try { hiddenIcons = JSON.parse(localStorage.getItem('mica_hidden_icons') || '[]'); } catch (e) {}
    const apps = (typeof BaseApps !== 'undefined' ? BaseApps : []).filter(a => !hiddenIcons.includes(a.name));
    const g = micaDesktopGridOrigin();
    const used = new Set();
    const nextPos = {};

    // If saved positions are all stacked (same cell) or forceGrid, rebuild clean grid
    if (!forceGrid) {
        const coords = Object.values(savedPos).map(p => (p && p.x) + ',' + (p && p.y));
        const unique = new Set(coords.filter(Boolean));
        if (coords.length >= 3 && unique.size <= 1) forceGrid = true;
    }

    apps.forEach((a, index) => {
        const icon = document.createElement('div');
        icon.className = 'dt-icon';
        icon.id = 'dt_' + String(a.name).replace(/\s+/g, '_');
        icon.innerHTML = (typeof appIconHtml === 'function' ? appIconHtml(a, 32) : `<span class="i">${a.icon || '📱'}</span>`) +
            `<span>${(a.name.split(' ').pop() || a.name)}</span>`;
        icon.ondblclick = (e) => { e.stopPropagation(); App.open(a.name); };

        let pos;
        if (forceGrid || !savedPos[icon.id]) {
            pos = micaDesktopDefaultPos(index);
        } else {
            pos = { x: savedPos[icon.id].x, y: savedPos[icon.id].y };
            // Clamp into safe desktop region
            const maxX = Math.max(g.x, window.innerWidth - g.ins.right - 80);
            const maxY = Math.max(g.y, (dt.clientHeight || window.innerHeight) - g.ins.bottom - 80);
            if (pos.x < g.x - 4 || pos.x > maxX || pos.y < g.y - 4 || pos.y > maxY) {
                pos = micaDesktopDefaultPos(index);
            }
            // Resolve collisions with already-placed icons this pass
            let key = pos.x + ',' + pos.y;
            let n = 0;
            while (used.has(key) && n < 60) {
                pos = micaSnapIconPos(pos.x, pos.y + g.cellH, icon.id);
                key = pos.x + ',' + pos.y;
                n++;
            }
        }
        used.add(pos.x + ',' + pos.y);
        nextPos[icon.id] = pos;
        icon.style.left = pos.x + 'px';
        icon.style.top = pos.y + 'px';

        icon.onmousedown = function (e) {
            if (e.button !== 0) return;
            e.stopPropagation();
            let moved = false;
            const sX = e.clientX - icon.offsetLeft;
            const sY = e.clientY - icon.offsetTop;
            function onMM(ev) {
                moved = true;
                const maxX = window.innerWidth - 80;
                const maxY = (dt.clientHeight || window.innerHeight) - 80;
                icon.style.left = Math.max(0, Math.min(maxX, ev.clientX - sX)) + 'px';
                icon.style.top = Math.max(0, Math.min(maxY, ev.clientY - sY)) + 'px';
            }
            document.addEventListener('mousemove', onMM);
            document.onmouseup = function () {
                document.removeEventListener('mousemove', onMM);
                document.onmouseup = null;
                if (!moved) return;
                const snapped = micaSnapIconPos(icon.offsetLeft, icon.offsetTop, icon.id);
                icon.style.left = snapped.x + 'px';
                icon.style.top = snapped.y + 'px';
                try {
                    const sP = JSON.parse(localStorage.getItem('mica_icon_pos') || '{}');
                    sP[icon.id] = snapped;
                    localStorage.setItem('mica_icon_pos', JSON.stringify(sP));
                    if (window.MicaAppearance) MicaAppearance.set('mica_icon_pos', JSON.stringify(sP));
                } catch (err) {}
            };
        };
        dt.appendChild(icon);
    });

    try {
        localStorage.setItem('mica_icon_pos', JSON.stringify(nextPos));
    } catch (e) {}
}

window.resetDesktopGrid = function () {
    try { localStorage.removeItem('mica_icon_pos'); } catch (e) {}
    renderDesktop(true);
    toast('Desktop grid reset');
};

window.restoreDesktopShortcut = function (name) {
    let hidden = JSON.parse(localStorage.getItem('mica_hidden_icons') || '[]');
    hidden = hidden.filter(n => n !== name);
    localStorage.setItem('mica_hidden_icons', JSON.stringify(hidden));
    toast('Restored ' + name);
    renderDesktop();
};

function hideDesktopShortcut(name) {
    let hidden = JSON.parse(localStorage.getItem('mica_hidden_icons') || '[]');
    if (!hidden.includes(name)) {
        hidden.push(name);
        localStorage.setItem('mica_hidden_icons', JSON.stringify(hidden));
    }
    toast('Removed shortcut for ' + name);
    renderDesktop();
}



// Dynamic desktop / icon right-click
document.getElementById('desktop').addEventListener('contextmenu', e => {
    e.preventDefault();
    const icon = e.target.closest('.dt-icon');
    if (icon) {
        const name = (icon.querySelector('span:not(.i)') || icon.querySelector('span'))?.textContent?.trim();
        const app = (typeof BaseApps !== 'undefined' ? BaseApps : []).find(a =>
            a.name === name || a.name.split(' ').pop() === name || a.name.includes(name)
        );
        const full = app ? app.name : name;
        if (typeof showMicaMenu === 'function') {
            showMicaMenu(e.clientX, e.clientY, [
                { label: '⚡ Open', fn: () => App.open(full) },
                { label: 'Open new window', fn: () => App.open(full) },
                '---',
                { label: '❌ Remove desktop icon', fn: () => hideDesktopShortcut(full) },
                { label: '🔄 Refresh desktop', fn: () => renderDesktop() },
            ]);
        }
        return;
    }
    if (typeof showMicaMenu === 'function') {
        const hidden = JSON.parse(localStorage.getItem('mica_hidden_icons') || '[]');
        const items = [
            { label: '📂 Jade Explorer', fn: () => App.open('Jade Explorer') },
            { label: '📊 Task Manager', fn: () => App.open('Task Manager') },
            { label: '📄 New Document', fn: () => App.open('Ruby Editor') },
            { label: '🛠️ Studio', fn: () => App.open('Beryl Studio') },
            '---',
            { label: '⚙️ Settings', fn: () => App.open('Amber Settings') },
            { label: '📦 Package Manager', fn: () => App.open('Package Manager') },
            '---',
            { label: '📍 Summon menu bubble here', fn: () => summonBubbleTo(e.clientX, e.clientY) },
            { label: '🔄 Refresh desktop', fn: () => renderDesktop() },
            { label: '⊞ Reset icon grid', fn: () => resetDesktopGrid() },
            { label: '🎨 Personalize', fn: () => App.open('Amber Settings') },
        ];
        if (hidden.length) {
            items.push('---');
            hidden.forEach(n => {
                items.push({ label: '➕ Restore ' + n, fn: () => restoreDesktopShortcut(n) });
            });
        } else {
            items.push({ label: '➕ Add Shortcut (none hidden)', fn: () => toast('Hide an icon first, then restore it here') });
        }
        showMicaMenu(e.clientX, e.clientY, items);
    }
});


async function refreshUserList() {
    const sel = document.getElementById('ls-user');
    try {
        const { users } = await API.users();
        if (!users || !users.length) {
            showGate();
            if (sel) sel.innerHTML = '<option value="">(no accounts)</option>';
            return [];
        }
        if (sel) {
            sel.innerHTML = users.map(u => `<option value="${u}">${u}</option>`).join('');
            if (API.username && users.includes(API.username)) sel.value = API.username;
        }
        showLogin();
        return users;
    } catch {
        if (sel) sel.innerHTML = '<option value="">(kernel offline?)</option>';
        showGate();
        return [];
    }
}

function lsHideAllBoxes() {
    ['ls-gate', 'ls-login', 'ls-setup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}
function showGate() {
    lsHideAllBoxes();
    const g = document.getElementById('ls-gate');
    if (g) g.style.display = 'block';
}
function showSetup() {
    lsHideAllBoxes();
    const s = document.getElementById('ls-setup');
    if (s) s.style.display = 'block';
}
function lsChooseCreate() {
    // Brief welcome splash text, then account creation
    playLockSplash(function() {
        showSetup();
    });
}

function showLogin() {
    try { if (typeof micaPrefetchWallpapers === 'function') micaPrefetchWallpapers(); }
    catch (e) { try { if (typeof applyLockWallpaper === 'function') applyLockWallpaper(); } catch (e2) {} }
    lsHideAllBoxes();
    const login = document.getElementById('ls-login');
    if (login) login.style.display = 'block';
    // Only populate select — do not recurse into refreshUserList routing
    const sel = document.getElementById('ls-user');
    if (sel && !sel.options.length) {
        API.users().then(({ users }) => {
            if (users && users.length && sel) {
                sel.innerHTML = users.map(u => '<option value="' + u + '">' + u + '</option>').join('');
            }
        }).catch(function(){});
    }
}


async function setupOS() {
    const u = document.getElementById('setup-user').value.trim();
    const p = document.getElementById('setup-pin').value;
    if (!u || !p) return toast('Enter username and PIN');
    try {
        await API.create(u, p);
        // Token is set by API.create — hide account form, run first-run wizard
        try {
            const ls = document.getElementById('lock-screen');
            if (ls) { ls.style.opacity = '0'; ls.style.pointerEvents = 'none'; }
        } catch (e) {}
        showSetupWizard(true);
    } catch (e) {
        toast(e.message || 'Create failed');
    }
}


function playLockSplash(done) {
    const splash = document.getElementById('ls-splash');
    if (!splash) { if (done) done(); return; }
    splash.style.display = 'flex';
    splash.setAttribute('aria-hidden', 'false');
    splash.classList.remove('out', 'in');
    void splash.offsetWidth;
    splash.classList.add('in');
    clearTimeout(window.__lsSplashT);
    window.__lsSplashT = setTimeout(function() {
        splash.classList.remove('in');
        splash.classList.add('out');
        setTimeout(function() {
            splash.style.display = 'none';
            splash.classList.remove('out');
            splash.setAttribute('aria-hidden', 'true');
            if (done) done();
        }, 480);
    }, 1100);
}

async function enterGuestMode() {
    window.__MICA_GUEST = true;
    window.__MICA_SESSION_UNLOCKED = true;
    try { document.body.classList.remove('mica-locked'); } catch (e) {}
    // Ephemeral session — no token required for shell; DiskFS may be limited
    try {
        if (typeof API !== 'undefined') {
            API.token = API.token || 'guest';
            API.username = 'Guest';
        }
    } catch (e) {}
    playLockSplash(function() {
        micaForceHideLock();
        try { bootDesktop(); } catch (e) { console.error(e); }
        toast('Guest session — activity cleared on logout');
    });
}

function micaWipeGuestData() {
    if (!window.__MICA_GUEST) return;
    const kill = [
        'mica_recent_apps', 'mica_recent_files', 'mica_wp_recent',
        'mica_icon_pos', 'mica_custom_apps', 'mica_wp_desk_meta', 'mica_wp_lock_meta',
        'mica_wp_desktop', 'mica_wp_lock'
    ];
    kill.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    // Close all windows
    try {
        if (typeof Registry !== 'undefined') {
            Object.keys(Registry).forEach(id => { try { App.close(id, { force: true }); } catch (e) {} });
        }
    } catch (e) {}
    window.__MICA_GUEST = false;
}

async function unlockOS() {
    const u = document.getElementById('ls-user').value.trim() || document.getElementById('ls-user').options[0]?.value;
    const p = document.getElementById('ls-pin').value;
    if (!u || !p) return toast('Select user and enter PIN');
    try {
        const auth = await API.login(u, p);
        if (auth && auth.security) window.__MICA_DEVMODE = !!auth.security.devmode;
        window.__MICA_DISKFS_UNLOCKED = true;
        window.__MICA_GUEST = false;
        window.__MICA_SESSION_UNLOCKED = true;
        try { document.body.classList.remove('mica-locked'); } catch (e) {}
        try {
            if (window.__micaDeskWpCache && typeof applyDesktopWallpaper === 'function') {
                applyDesktopWallpaper(window.__micaDeskWpCache);
            } else if (typeof applyDesktopWallpaper === 'function') {
                Promise.resolve(applyDesktopWallpaper()).catch(function(){});
            }
        } catch (e) {}
        try {
            if (localStorage.getItem('mica_setup_done') !== '1') {
                localStorage.setItem('mica_setup_done', '1');
            }
        } catch (e) {}
        // Seamless welcome splash on lock, then fade lock and boot
        playLockSplash(function() {
            micaForceHideLock();
            try {
                if (typeof restoreWallpapersFromDisk === 'function') {
                    setTimeout(function(){ restoreWallpapersFromDisk(); }, 150);
                }
            } catch (e) {}
            bootDesktop();
        });
    } catch (e) {
        toast(e.message || 'Auth failed');
        try { document.getElementById('ls-pin').value = ''; } catch (e2) {}
    }
}

async function restoreMica(e) {
    const f = e.target.files[0];
    if (!f) return;
    toast('Restoring ' + f.name + '…');
    try {
        const d = await API.restoreMica(f);
        const name = d.username || d.user || 'user';
        toast('Restored ' + name + ' — enter PIN to unlock');
        await refreshUserList();
        const sel = document.getElementById('ls-user');
        if (sel) {
            // ensure option exists
            let found = false;
            for (const o of sel.options) if (o.value === name) found = true;
            if (!found) {
                const opt = document.createElement('option');
                opt.value = name; opt.textContent = name;
                sel.appendChild(opt);
            }
            sel.value = name;
        }
        showLogin();
        document.getElementById('ls-pin')?.focus();
    } catch (err) {
        toast(err.message || 'Restore failed');
    }
}


/* ── First-run setup wizard (9.3) ── */
window.__micaSetup = { step: 0, prefs: {} };


function micaShowWelcomeSplash() {
    try {
        let ov = document.getElementById('mica-welcome');
        if (ov) ov.remove();
        ov = document.createElement('div');
        ov.id = 'mica-welcome';
        ov.innerHTML = '<div class="mica-welcome-text">welcome</div>';
        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('show'));
        setTimeout(() => {
            ov.classList.add('hide');
            setTimeout(() => { try { ov.remove(); } catch (e) {} }, 700);
        }, 900);
    } catch (e) {}
}


function micaShowWelcomeSplash() {
    try {
        let el = document.getElementById('mica-welcome-splash');
        if (!el) {
            el = document.createElement('div');
            el.id = 'mica-welcome-splash';
            el.innerHTML = '<div class="mws-blur"></div><div class="mws-text">welcome</div>';
            document.body.appendChild(el);
        }
        el.classList.remove('mws-out');
        el.style.display = 'flex';
        void el.offsetWidth;
        requestAnimationFrame(() => el.classList.add('mws-in'));
        clearTimeout(window.__mwsT);
        window.__mwsT = setTimeout(() => {
            el.classList.remove('mws-in');
            el.classList.add('mws-out');
            setTimeout(() => { try { el.style.display = 'none'; } catch (e) {} }, 700);
        }, 1100);
    } catch (e) {}
}

function micaForceHideLock(opts) {
    opts = opts || {};
    try {
        const ls = document.getElementById('lock-screen');
        if (ls) {
            ls.style.pointerEvents = 'none';
            if (opts.instant) {
                ls.style.transition = 'none';
                ls.style.opacity = '0';
                ls.style.visibility = 'hidden';
                ls.style.display = 'none';
            } else {
                // Smooth fade — desktop wallpaper should already be applied underneath
                ls.style.transition = 'opacity 0.45s ease';
                ls.style.opacity = '0';
                setTimeout(function() {
                    try {
                        ls.style.visibility = 'hidden';
                        ls.style.display = 'none';
                    } catch (e) {}
                }, 480);
            }
        }
        const login = document.getElementById('ls-login');
        const setup = document.getElementById('ls-setup');
        if (login) login.style.display = 'none';
        if (setup) setup.style.display = 'none';
    } catch (e) {}
}

/** Prefetch wallpaper images so login → desktop does not flash */
async function micaPrefetchWallpapers() {
    try {
        // Load lock + desktop while lock screen is up (desktop sits underneath; chrome stays locked)
        if (typeof restoreWallpapersFromDisk === 'function' && API && API.token) {
            await restoreWallpapersFromDisk();
        } else {
            if (typeof applyLockWallpaper === 'function') await applyLockWallpaper();
            if (typeof applyDesktopWallpaper === 'function') await applyDesktopWallpaper();
        }
        // Warm decode into GPU/cache
        if (typeof micaWpGetMeta === 'function') {
            const meta = micaWpGetMeta('desktop');
            let url = null;
            if (meta && typeof micaWpResolveUrl === 'function') url = micaWpResolveUrl(meta);
            if (!url && meta && meta.type === 'file' && meta.path && typeof micaWpLoadFileAsDataUrl === 'function') {
                url = await micaWpLoadFileAsDataUrl(meta.path);
            }
            if (url) {
                window.__micaDeskWpCache = url;
                const img = new Image();
                img.decode && img.decode().catch(function(){});
                img.src = url;
            }
        }
    } catch (e) {}
}

function micaForceHideWizard() {
    try {
        const wiz = document.getElementById('setup-wizard');
        if (wiz) {
            wiz.classList.remove('open');
            wiz.style.display = 'none';
            wiz.style.pointerEvents = 'none';
        }
    } catch (e) {}
}

function showSetupWizard(afterCreate) {
    window.__micaSetup = {
        step: 0,
        afterCreate: !!afterCreate,
        prefs: {
            theme: localStorage.getItem('mica_theme') || 'theme-dark',
            dock: localStorage.getItem('mica_dock_mode') === '1',
            tbPos: localStorage.getItem('mica_tb_pos') || 'bottom',
            bubble: localStorage.getItem('mica_bubble_pin') || 'floating',
            perf: localStorage.getItem('mica_perf') || 'full',
        }
    };
    const wiz = document.getElementById('setup-wizard');
    if (!wiz) {
        try { bootDesktop(); } catch (e) { console.error(e); }
        return;
    }
    // Fully remove lock from interaction and stacking so wizard is the only UI
    micaForceHideLock();
    const ls = document.getElementById('lock-screen');
    if (ls) {
        // keep element but fully inert (display already none from force hide)
        ls.style.display = 'none';
    }
    wiz.classList.add('open');
    wiz.style.display = 'flex';
    wiz.style.pointerEvents = 'auto';
    wiz.style.zIndex = '1000000';
    try {
        renderSetupStep();
    } catch (e) {
        console.error('setup step', e);
        micaForceHideWizard();
        try { bootDesktop(); } catch (e2) { console.error(e2); }
    }
}

function renderSetupStep() {
    const s = window.__micaSetup;
    const host = document.getElementById('sw-step');
    const bar = document.getElementById('sw-bar');
    if (!host) return;
    const total = 5;
    if (bar) bar.style.width = ((s.step + 1) / total * 100) + '%';

    if (s.step === 0) {
        host.innerHTML =
          '<h2>Welcome to Mica OS</h2>' +
          '<p class="sw-sub">A short setup crafts your desktop — taskbar, theme, and menus.</p>' +
          '<div class="sw-nav"><button class="primary-btn" onclick="setupNext()">Continue</button></div>';
    } else if (s.step === 1) {
        const themes = [
            { v: 'theme-dark', ico: '🌑', n: 'Dark' },
            { v: 'theme-obsidian', ico: '⬛', n: 'Obsidian' },
            { v: 'theme-nova', ico: '🌌', n: 'Nova' },
            { v: '', ico: '☀️', n: 'Light' },
        ];
        host.innerHTML =
          '<h2>Choose a theme</h2>' +
          '<p class="sw-sub">You can change this anytime in Settings.</p>' +
          '<div class="sw-options" id="sw-themes"></div>' +
          '<div class="sw-nav">' +
            '<button onclick="setupBack()">Back</button>' +
            '<button class="primary-btn" onclick="setupNext()">Next</button></div>';
        const box = document.getElementById('sw-themes');
        themes.forEach(th => {
            const el = document.createElement('div');
            el.className = 'sw-opt' + (s.prefs.theme === th.v ? ' on' : '');
            el.innerHTML = '<span class="sw-ico">' + th.ico + '</span><span>' + th.n + '</span>';
            el.onclick = () => {
                s.prefs.theme = th.v;
                if (typeof applyTheme === 'function') applyTheme(th.v || '');
                box.querySelectorAll('.sw-opt').forEach(x => x.classList.remove('on'));
                el.classList.add('on');
            };
            box.appendChild(el);
        });
    } else if (s.step === 2) {
        host.innerHTML =
          '<h2>Taskbar style</h2>' +
          '<p class="sw-sub">Classic bar or a floating App Dock.</p>' +
          '<div class="sw-options">' +
            '<div class="sw-opt' + (!s.prefs.dock ? ' on' : '') + '" data-d="0"><span class="sw-ico">▬</span><span>Classic taskbar</span></div>' +
            '<div class="sw-opt' + (s.prefs.dock ? ' on' : '') + '" data-d="1"><span class="sw-ico">◆</span><span>App Dock (Start + Task View)</span></div>' +
          '</div>' +
          '<label style="display:block;margin:8px 0 4px;font-size:12px;opacity:0.7;">Position</label>' +
          '<select id="sw-pos" style="width:100%;padding:10px;margin-bottom:14px;">' +
            '<option value="bottom">Bottom</option><option value="top">Top</option>' +
            '<option value="left">Left</option><option value="right">Right</option></select>' +
          '<div class="sw-nav">' +
            '<button onclick="setupBack()">Back</button>' +
            '<button class="primary-btn" onclick="setupNext()">Next</button></div>';
        const sel = document.getElementById('sw-pos');
        if (sel) sel.value = s.prefs.tbPos;
        host.querySelectorAll('.sw-opt[data-d]').forEach(el => {
            el.onclick = () => {
                s.prefs.dock = el.getAttribute('data-d') === '1';
                host.querySelectorAll('.sw-opt[data-d]').forEach(x => x.classList.remove('on'));
                el.classList.add('on');
            };
        });
    } else if (s.step === 3) {
        host.innerHTML =
          '<h2>Menu bubble</h2>' +
          '<p class="sw-sub">Where the quick menu lives.</p>' +
          '<div class="sw-options">' +
            '<div class="sw-opt' + (s.prefs.bubble==='floating'?' on':'') + '" data-b="floating"><span class="sw-ico">🫧</span><span>Floating bubble</span></div>' +
            '<div class="sw-opt' + (s.prefs.bubble==='topbar'?' on':'') + '" data-b="topbar"><span class="sw-ico">▤</span><span>Top menu bar</span></div>' +
            '<div class="sw-opt' + (s.prefs.bubble==='taskbar'?' on':'') + '" data-b="taskbar"><span class="sw-ico">⚡</span><span>Pinned to taskbar</span></div>' +
          '</div>' +
          '<div class="sw-nav">' +
            '<button onclick="setupBack()">Back</button>' +
            '<button class="primary-btn" onclick="setupNext()">Next</button></div>';
        host.querySelectorAll('.sw-opt[data-b]').forEach(el => {
            el.onclick = () => {
                s.prefs.bubble = el.getAttribute('data-b');
                host.querySelectorAll('.sw-opt[data-b]').forEach(x => x.classList.remove('on'));
                el.classList.add('on');
            };
        });
    } else if (s.step === 4) {
        host.innerHTML =
          '<h2>Performance</h2>' +
          '<p class="sw-sub">Liquid glass and motion — or keep it light.</p>' +
          '<div class="sw-options">' +
            '<div class="sw-opt' + (s.prefs.perf==='full'?' on':'') + '" data-p="full"><span class="sw-ico">✨</span><span>Full — glass & animations</span></div>' +
            '<div class="sw-opt' + (s.prefs.perf==='balanced'?' on':'') + '" data-p="balanced"><span class="sw-ico">⚖️</span><span>Balanced — lighter blur</span></div>' +
            '<div class="sw-opt' + (s.prefs.perf==='performance'?' on':'') + '" data-p="performance"><span class="sw-ico">⚡</span><span>Performance — minimal effects</span></div>' +
          '</div>' +
          '<div class="sw-nav">' +
            '<button onclick="setupBack()">Back</button>' +
            '<button class="primary-btn" onclick="setupFinish()">Finish</button></div>';
        host.querySelectorAll('.sw-opt[data-p]').forEach(el => {
            el.onclick = () => {
                s.prefs.perf = el.getAttribute('data-p');
                host.querySelectorAll('.sw-opt[data-p]').forEach(x => x.classList.remove('on'));
                el.classList.add('on');
            };
        });
    }
}

function setupNext() {
    const s = window.__micaSetup;
    if (s.step === 2) {
        const sel = document.getElementById('sw-pos');
        if (sel) s.prefs.tbPos = sel.value;
    }
    s.step = Math.min(4, s.step + 1);
    renderSetupStep();
}
function setupBack() {
    window.__micaSetup.step = Math.max(0, window.__micaSetup.step - 1);
    renderSetupStep();
}
function setupFinish() {
    const s = window.__micaSetup || { prefs: {} };
    const p = s.prefs || {};
    try {
        const sel = document.getElementById('sw-pos');
        if (sel) p.tbPos = sel.value;
    } catch (e) {}
    const theme = (p.theme == null || p.theme === undefined) ? 'theme-dark' : p.theme;
    const dock = !!p.dock;
    const tbPos = p.tbPos || 'bottom';
    const bubble = p.bubble || 'floating';
    const perf = p.perf || 'full';
    try {
        localStorage.setItem('mica_theme', theme);
        localStorage.setItem('mica_dock_mode', dock ? '1' : '0');
        localStorage.setItem('mica_tb_pos', tbPos);
        localStorage.setItem('mica_bubble_pin', bubble);
        localStorage.setItem('mica_perf', perf);
        localStorage.setItem('mica_setup_done', '1');
        localStorage.setItem('mica_anim', perf === 'performance' ? '0' : '1');
        window.__micaPreferLocalTheme = true;
        try {
            if (typeof micaSet === 'function') {
                micaSet('mica_theme', theme);
                micaSet('mica_dock_mode', dock ? '1' : '0');
                micaSet('mica_tb_pos', tbPos);
                micaSet('mica_bubble_pin', bubble);
                micaSet('mica_perf', perf);
                micaSet('mica_setup_done', '1');
            }
        } catch (e) {}
        // Apply theme class only — layout is applied in bootDesktop via reassert
        try { if (typeof applyTheme === 'function') applyTheme(theme); } catch (e) {}
        try {
            if (typeof API !== 'undefined' && API.token && typeof API.themesActivate === 'function') {
                API.themesActivate(null, theme || 'theme-dark').catch(function(){});
            }
        } catch (e) {}
    } catch (e) { console.warn('setupFinish prefs', e); }

    micaForceHideWizard();
    micaForceHideLock();
    try { showBootLoader(true); } catch (e) {}
    setTimeout(function() {
        try { showBootLoader(false); } catch (e) {}
        try {
            bootDesktop();
        } catch (e) {
            console.error('bootDesktop failed', e);
            micaForceHideLock();
            micaForceHideWizard();
            try {
                if (typeof reassertShellLayout === 'function') reassertShellLayout();
            } catch (e2) {}
            try { toast('Desktop recovered — some features may need a restart'); } catch (e3) {}
        }
    }, 350);
}


async function bootDesktop() {
    window.__MICA_SESSION_UNLOCKED = true;
    try { document.body.classList.remove('mica-locked'); } catch (e) {}
    // 1. Kill every overlay that can block the desktop — never leave a black/blocked screen
    micaForceHideLock();
    micaForceHideWizard();
    try { showBootLoader(false); } catch (e) {}

    // Ensure body always has a usable baseline of layout classes
    try {
        if (!document.body.classList.contains('tb-pos-bottom') &&
            !document.body.classList.contains('tb-pos-top') &&
            !document.body.classList.contains('tb-pos-left') &&
            !document.body.classList.contains('tb-pos-right')) {
            document.body.classList.add('tb-pos-' + (localStorage.getItem('mica_tb_pos') || 'bottom'));
        }
    } catch (e) {}

    // 2. Wallpapers (best-effort)
    try {
        if (typeof restoreWallpapersFromDisk === 'function') restoreWallpapersFromDisk();
        else {
            if (typeof applyDesktopWallpaper === 'function') applyDesktopWallpaper();
            if (typeof applyLockWallpaper === 'function') applyLockWallpaper();
        }
    } catch (e) {}

    // 3. Optional disk appearance restore (does not override localStorage already set by setup)
    try {
        if (typeof MicaAppearance !== 'undefined' && MicaAppearance.loadFromDisk && API && API.token) {
            // Only fill missing keys — never clobber what setup just wrote
            const hadSetup = localStorage.getItem('mica_setup_done') === '1';
            if (!hadSetup || !localStorage.getItem('mica_theme')) {
                await MicaAppearance.loadFromDisk();
            }
        }
    } catch (e) {}

    // 4. Apps / plugins — never let failures stop the shell
    try {
        if (typeof refreshUserApps === 'function') await refreshUserApps();
    } catch (e) { console.warn('apps', e); }
    try {
        if (typeof loadAndApplyPlugins === 'function') await loadAndApplyPlugins();
    } catch (e) { console.warn('plugins', e); }

    // 5. Theme + layout in one tight pass (after a short paint)
    setTimeout(function() {
        micaForceHideLock();
        micaForceHideWizard();

        try {
            let theme = localStorage.getItem('mica_theme');
            if (theme == null) theme = 'theme-dark';
            window.__micaPreferLocalTheme = false;
            if (typeof applyTheme === 'function') applyTheme(theme);
            // Wallpapers AFTER theme so theme CSS cannot wipe them
            try {
                if (typeof restoreWallpapersFromDisk === 'function') {
                    Promise.resolve(restoreWallpapersFromDisk()).catch(function(){});
                } else {
                    if (typeof applyDesktopWallpaper === 'function') applyDesktopWallpaper();
                    if (typeof applyLockWallpaper === 'function') applyLockWallpaper();
                }
            } catch (e) {}
            if (!window.__micaSkipServerTheme && localStorage.getItem('mica_theme_is_custom') === '1' && typeof restorePersistedTheme === 'function') {
                try {
                    restorePersistedTheme().then(function(){
                        try { if (typeof restoreWallpapersFromDisk === 'function') restoreWallpapersFromDisk(); } catch (e) {}
                    }).catch(function(){});
                } catch (e) {}
            }
        } catch (e) { console.warn('theme', e); }

        try {
            if (typeof reassertShellLayout === 'function') reassertShellLayout();
            else {
                try { if (typeof applyPerfMode === 'function') applyPerfMode(); } catch (e) {}
                try { if (typeof applyDockMode === 'function') applyDockMode(); } catch (e) {}
                try { if (typeof applyBubblePin === 'function') applyBubblePin(); } catch (e) {}
                try { if (typeof applyTaskbarPos === 'function') applyTaskbarPos(); } catch (e) {}
                try { if (typeof applyLayoutMode === 'function') applyLayoutMode(); } catch (e) {}
            }
        } catch (e) { console.warn('layout', e); }

        try { if (typeof micaRestoreChrome === 'function') micaRestoreChrome(); } catch (e) {}
        try { if (typeof bindTaskbarContextMenu === 'function') bindTaskbarContextMenu(); } catch (e) {}
        try { if (typeof renderDesktop === 'function') renderDesktop(); } catch (e) {}
        try { if (typeof App !== 'undefined' && App.updateTray) App.updateTray(); } catch (e) {}
        try { startMicaClock(); } catch (e) {}
        try {
            const u = (typeof API !== 'undefined' && API.username) ? (' — ' + API.username) : '';
            toast('Pyron 10.2.8 ready' + u);
        } catch (e) {}
    }, 180);

    // 6. Safety net: if lock is still somehow visible after 1.2s, force-clear and reassert
    setTimeout(function() {
        try {
            const ls = document.getElementById('lock-screen');
            if (ls && (ls.style.display !== 'none' || getComputedStyle(ls).display !== 'none')) {
                micaForceHideLock();
            }
            micaForceHideWizard();
            if (typeof reassertShellLayout === 'function') reassertShellLayout();
            if (typeof micaRestoreChrome === 'function') micaRestoreChrome();
        } catch (e) {}
    }, 1200);
}

function logout() {
    try { micaWipeGuestData(); } catch (e) {}
    window.__MICA_SESSION_UNLOCKED = false;
    try { document.body.classList.add('mica-locked'); } catch (e) {}
    localStorage.removeItem('mica_token');
    API.token = '';
    location.reload();
}

/* clock: see micaClockTick */

window.onload = async () => {
    try { document.body.classList.add('mica-locked'); window.__MICA_SESSION_UNLOCKED = false; } catch (e) {}
    try { setTimeout(function(){ if (typeof micaPrefetchWallpapers === 'function') micaPrefetchWallpapers(); }, 100); } catch (e) {}
    try { if (typeof applyPerfMode === 'function') applyPerfMode(); } catch (e) {}
    try { startMicaClock(); } catch (e) {}
    try {
        const custom = JSON.parse(localStorage.getItem('mica_custom_apps') || '[]');
        custom.forEach(a => {
            if (!BaseApps.some(b => b.name === a.name)) BaseApps.push({ name: a.name, icon: a.icon || '📱' });
        });
    } catch (e) {}

    const users = await refreshUserList();
    if (users && users.length) {
        showLogin();
        const pin = document.getElementById('ls-pin');
        if (pin) pin.focus();
    }
    qaInitControls();
};


/* ═══════════════ Pyron 9.4 — Dock / Task View / Stability ═══════════════ */


function getPinnedApps() {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem('mica_pinned_apps') || '[]'); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    // Always keep Jade Explorer as a dock anchor (Finder-like) when under 3 pins
    if (!arr.includes('Jade Explorer')) {
        arr = ['Jade Explorer'].concat(arr);
        try { setPinnedApps(arr); } catch (e) {}
    }
    return arr;
}

/** Mac-style "file jumps into Finder" for saves/exports → Jade dock icon */
function micaDockJump(targetApp, fileLabel) {
    try {
        const tray = document.getElementById('tb-apps');
        if (!tray) return;
        // Prefer Jade Explorer button; else first dock icon
        let target = null;
        tray.querySelectorAll('.tb-app-btn').forEach(btn => {
            if ((btn.getAttribute('title') || '') === (targetApp || 'Jade Explorer')) target = btn;
        });
        if (!target) target = tray.querySelector('.tb-app-btn');
        if (!target) return;
        const tr = target.getBoundingClientRect();
        const fly = document.createElement('div');
        fly.className = 'mica-dock-fly';
        fly.textContent = '📄';
        fly.title = fileLabel || '';
        fly.style.left = (window.innerWidth / 2) + 'px';
        fly.style.top = (window.innerHeight / 2) + 'px';
        document.body.appendChild(fly);
        // Force layout then animate to dock icon
        requestAnimationFrame(() => {
            fly.style.left = (tr.left + tr.width / 2) + 'px';
            fly.style.top = (tr.top + tr.height / 2) + 'px';
            fly.style.opacity = '0';
            fly.style.transform = 'translate(-50%, -50%) scale(0.35)';
        });
        target.classList.add('dock-bounce');
        setTimeout(() => {
            try { fly.remove(); } catch (e) {}
            try { target.classList.remove('dock-bounce'); } catch (e) {}
        }, 700);
    } catch (e) {}
}
window.micaDockJump = micaDockJump;
function setPinnedApps(arr) {
    micaSet('mica_pinned_apps', JSON.stringify(arr || []));
    if (typeof App !== 'undefined' && App.updateTray) App.updateTray();
}
function pinApp(name) {
    const arr = getPinnedApps();
    if (!arr.includes(name)) { arr.push(name); setPinnedApps(arr); toast('Pinned: ' + name); }
    try { topbarRenderPins(); } catch (e) {}
    try { if (typeof App !== 'undefined' && App.updateTray) App.updateTray(); } catch (e) {}
}
function unpinApp(name) {
    setPinnedApps(getPinnedApps().filter(n => n !== name));
    toast('Unpinned: ' + name);
    try { topbarRenderPins(); } catch (e) {}
    try { if (typeof App !== 'undefined' && App.updateTray) App.updateTray(); } catch (e) {}
}
function isPinned(name) { return getPinnedApps().includes(name); }

function getDockMode() {
    return localStorage.getItem('mica_dock_mode') === '1';
}
function setDockMode(on) {
    micaSet('mica_dock_mode', on ? '1' : '0');
    applyDockMode();
    applyLayoutMode();
    toast(on ? 'App Dock on' : 'Classic taskbar');
}

function applyLayoutMode() {
    const body = document.body;
    const topbar = body.classList.contains('bubble-pin-topbar');
    const dock = getDockMode();
    const pos = localStorage.getItem('mica_tb_pos') || 'bottom';
    body.classList.toggle('layout-topbar', topbar);
    body.classList.toggle('layout-dock', dock);
    body.classList.toggle('layout-side', pos === 'left' || pos === 'right');
    // Desktop insets are CSS-owned (tb-pos-* / app-dock-on). Do not pad here —
    // padding-top + margin-top stacked into a second gap under the top bar.
    updateDockAutohide();
    // Fixed grid — do NOT rebuild icons on topbar/layout toggles (that caused collapse).
    // Only side taskbar left/right needs a soft re-clamp; keep positions otherwise.
}
function micaRestoreChrome() {
    const visFs = [...document.querySelectorAll('.window.true-fullscreen')].some(w => w.dataset.minimized !== '1' && w.style.display !== 'none');
    if (visFs) return;
    document.body.classList.remove('mica-true-fs');
    const tb = document.getElementById('taskbar');
    if (tb) {
        tb.classList.remove('chrome-hidden');
        tb.style.visibility = '';
        tb.style.opacity = '';
        tb.style.pointerEvents = '';
        if (!getDockMode()) {
            tb.style.transform = '';
            tb.classList.remove('dock-autohide');
        }
    }
    const bubble = document.getElementById('vertical-bubble');
    if (bubble) {
        bubble.classList.remove('chrome-hidden');
        bubble.style.visibility = '';
        bubble.style.opacity = '';
        bubble.style.pointerEvents = '';
        bubble.style.transform = '';
    }
}
function updateDockAutohide() {
    const tb = document.getElementById('taskbar');
    if (!tb) return;
    const bubble = document.getElementById('vertical-bubble');
    const vis = (w) => w && w.dataset.minimized !== '1' && w.style.display !== 'none';
    const anyFs = [...document.querySelectorAll('.window.true-fullscreen')].some(vis);

    if (anyFs) {
        document.body.classList.add('mica-true-fs');
        tb.classList.add('chrome-hidden');
        if (bubble) bubble.classList.add('chrome-hidden');
        tb.classList.remove('dock-autohide');
        return;
    }
    document.body.classList.remove('mica-true-fs');
    tb.classList.remove('chrome-hidden');
    if (bubble) bubble.classList.remove('chrome-hidden');

    // Autohide ONLY in App Dock mode, only while a maximized window is visible.
    // Classic taskbar never slides away — that was the 45px empty strip.
    const anyMax = [...document.querySelectorAll('.window.maximized')].some(w => vis(w) && !w.classList.contains('true-fullscreen'));
    if (anyMax && getDockMode() && tb.classList.contains('app-dock')) {
        tb.classList.add('dock-autohide');
    } else {
        tb.classList.remove('dock-autohide');
    }
}
function enterTrueFullscreen(winId) {
    if (typeof App !== 'undefined' && App.enterTrueFullscreen) App.enterTrueFullscreen(winId);
}
function exitTrueFullscreen() {
    if (typeof App !== 'undefined' && App.exitTrueFullscreen) App.exitTrueFullscreen();
    else document.body.classList.remove('mica-true-fs');
}

function applyDockMode() {
    if (window.__applyingDockMode) return;
    window.__applyingDockMode = true;
    try {
    const tb = document.getElementById('taskbar');
    if (!tb) return;
    const on = getDockMode();
    tb.classList.toggle('app-dock', on);
    document.body.classList.toggle('app-dock-on', on);
    const qpin = document.getElementById('tb-bubble-pin');
    if (qpin) qpin.style.display = on ? 'none' : '';
    const startBtn = tb.querySelector('.tb-start-btn');
    if (startBtn) {
        if (on) {
            startBtn.innerHTML = '❖';
            startBtn.title = 'Start';
        } else {
            startBtn.innerHTML = '❖ <span>Start</span>';
            startBtn.title = 'Start';
        }
        startBtn.onclick = function(e) { toggleMenu(e); };
    }
    ensureTaskViewBtn();
    if (on) setupDockMagnify();
    else {
        teardownDockMagnify();
        tb.style.transform = '';
        tb.querySelectorAll('.tb-app-btn, .tb-start-btn, #tb-bubble-pin, #tb-taskview').forEach(el => {
            el.style.transform = '';
            el.style.zIndex = '';
            el.style.marginLeft = el.style.marginRight = el.style.marginTop = el.style.marginBottom = '';
        });
        tb.classList.remove('dock-autohide');
    }
    applyLayoutMode();
    if (typeof applyTaskbarPos === 'function') applyTaskbarPos();
    } finally {
        window.__applyingDockMode = false;
    }
}
function ensureTaskViewBtn() {
    const tb = document.getElementById('taskbar');
    if (!tb) return;
    let btn = document.getElementById('tb-taskview');
    if (!btn) {
        btn = document.createElement('div');
        btn.id = 'tb-taskview';
        btn.className = 'tb-app-btn tb-fixed-slot';
        btn.title = 'MicaTasking';
        btn.innerHTML = '';
        btn.setAttribute('aria-label', 'MicaTasking');
        btn.onclick = function(e) { e.stopPropagation(); openTaskView(); };
        const apps = document.getElementById('tb-apps');
        if (apps && apps.parentNode) {
            // After start, before running apps — with equal dock slots
            apps.parentNode.insertBefore(btn, apps);
        } else {
            tb.appendChild(btn);
        }
    }
    // Normalize start as fixed slot
    const start = tb.querySelector('.tb-start-btn');
    if (start) start.classList.add('tb-fixed-slot');
}
function setupDockMagnify() {
    const tb = document.getElementById('taskbar');
    if (!tb || tb.dataset.dockMag === '1') return;
    tb.dataset.dockMag = '1';
    const BASE = 44;
    const handler = (e) => {
        if (!getDockMode()) return;
        const icons = [...tb.querySelectorAll('.tb-start-btn, #tb-taskview, .tb-app-btn, #tb-bubble-pin')]
            .filter(el => el && el.offsetParent !== null);
        const side = tb.classList.contains('pos-left') || tb.classList.contains('pos-right');
        const maxDist = 100;
        const maxScale = 1.55;
        const scales = icons.map(icon => {
            const r = icon.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const dist = side ? Math.abs(e.clientY - cy) : Math.abs(e.clientX - cx);
            if (dist >= maxDist) return 1;
            const t = 1 - dist / maxDist;
            return 1 + (t * t) * (maxScale - 1);
        });
        icons.forEach((icon, i) => {
            const s = scales[i];
            const grow = (BASE * (s - 1)) / 2;
            icon.style.transform = 'scale(' + s.toFixed(3) + ')';
            icon.style.zIndex = s > 1.05 ? String(10 + Math.round(s * 10)) : '1';
            if (side) {
                icon.style.marginTop = grow.toFixed(1) + 'px';
                icon.style.marginBottom = grow.toFixed(1) + 'px';
                icon.style.marginLeft = '';
                icon.style.marginRight = '';
            } else {
                icon.style.marginLeft = grow.toFixed(1) + 'px';
                icon.style.marginRight = grow.toFixed(1) + 'px';
                icon.style.marginTop = '';
                icon.style.marginBottom = '';
            }
        });
    };
    const leave = () => {
        tb.querySelectorAll('.tb-app-btn, .tb-start-btn, #tb-taskview, #tb-bubble-pin').forEach(el => {
            el.style.transform = '';
            el.style.zIndex = '';
            el.style.marginLeft = el.style.marginRight = el.style.marginTop = el.style.marginBottom = '';
        });
    };
    tb.__dockMove = handler;
    tb.__dockLeave = leave;
    tb.addEventListener('mousemove', handler);
    tb.addEventListener('mouseleave', leave);
}
function teardownDockMagnify() {
    const tb = document.getElementById('taskbar');
    if (!tb || tb.dataset.dockMag !== '1') return;
    if (tb.__dockMove) tb.removeEventListener('mousemove', tb.__dockMove);
    if (tb.__dockLeave) tb.removeEventListener('mouseleave', tb.__dockLeave);
    tb.querySelectorAll('.tb-app-btn, .tb-start-btn, #tb-taskview, #tb-bubble-pin').forEach(el => {
        el.style.transform = '';
        el.style.marginLeft = el.style.marginRight = el.style.marginTop = el.style.marginBottom = '';
    });
    delete tb.dataset.dockMag;
}

/* Virtual desktops + Task View */
window.MicaSpaces = {
    list: (function(){ try { return JSON.parse(localStorage.getItem('mica_spaces')||'["Desktop 1"]'); } catch(e){ return ['Desktop 1']; } })(),
    current: Number(localStorage.getItem('mica_space_i') || 0) || 0,
    assign: (function(){ try { return JSON.parse(localStorage.getItem('mica_space_assign')||'{}'); } catch(e){ return {}; } })(),
};
function saveSpaces() {
    localStorage.setItem('mica_spaces', JSON.stringify(MicaSpaces.list));
    localStorage.setItem('mica_space_i', String(MicaSpaces.current));
    localStorage.setItem('mica_space_assign', JSON.stringify(MicaSpaces.assign));
}
function ensureWindowSpace(id) {
    if (MicaSpaces.assign[id] == null) MicaSpaces.assign[id] = MicaSpaces.current;
}
function switchSpace(idx, animate) {
    if (idx < 0 || idx >= MicaSpaces.list.length) return;
    if (idx === MicaSpaces.current && animate) return;
    // Fullscreen is an overlay, not a space — drop it before switching
    if (document.body.classList.contains('mica-true-fs') && typeof App !== 'undefined' && App.exitTrueFullscreen) {
        try { App.exitTrueFullscreen(); } catch (e) {}
    }
    const prev = MicaSpaces.current;
    const goingRight = idx > prev;
    MicaSpaces.current = idx;
    saveSpaces();

    const wins = [...document.querySelectorAll('.window')];
    wins.forEach(w => {
        ensureWindowSpace(w.id);
        const belongs = (MicaSpaces.assign[w.id] === idx);
        const wasVisible = w.style.display !== 'none' && w.dataset.minimized !== '1';

        // Always strip animation classes
        w.classList.remove('space-out-left', 'space-out-right', 'space-in-left', 'space-in-right');

        if (w.classList.contains('true-fullscreen')) {
            w.style.display = 'flex';
            w.style.opacity = '1';
            return;
        }
        if (belongs) {
            if (w.dataset.minimized === '1') {
                w.style.display = 'none';
                return;
            }
            w.style.display = 'flex';
            w.style.opacity = '1';
            w.style.pointerEvents = '';
            if (animate) {
                w.classList.add(goingRight ? 'space-in-right' : 'space-in-left');
                setTimeout(() => {
                    w.classList.remove('space-in-left', 'space-in-right');
                    w.style.transform = '';
                    w.style.opacity = '1';
                }, 300);
            } else {
                w.style.transform = '';
                w.style.opacity = '1';
            }
        } else {
            // Leaving this space — keep assignment, just hide
            if (animate && wasVisible) {
                w.classList.add(goingRight ? 'space-out-left' : 'space-out-right');
                setTimeout(() => {
                    w.style.display = 'none';
                    w.classList.remove('space-out-left', 'space-out-right');
                    w.style.transform = '';
                    w.style.opacity = '1';
                }, 280);
            } else {
                w.style.display = 'none';
                w.style.transform = '';
                w.style.opacity = '1';
            }
        }
    });
    if (typeof updateDockAutohide === 'function') updateDockAutohide();
    if (typeof App !== 'undefined' && App.updateTray) App.updateTray();
}

function addSpace() {
    if (MicaSpaces.list.length >= 6) return toast('Max 6 desktops');
    MicaSpaces.list.push('Desktop ' + (MicaSpaces.list.length + 1));
    saveSpaces();
    switchSpace(MicaSpaces.list.length - 1, true);
}

/* ── MicaTasking (was Mission Control) ── */
function getSurfaceStrip() {
    // Desktops first, then each fullscreen app as its own surface
    const surfaces = [];
    MicaSpaces.list.forEach((name, i) => {
        surfaces.push({ type: 'space', index: i, name: name });
    });
    document.querySelectorAll('.window.true-fullscreen').forEach(w => {
        if (w.dataset.minimized === '1' || w.style.display === 'none') return;
        const title = (w.querySelector('.win-header span') || {}).textContent || w.id;
        surfaces.push({ type: 'fs', id: w.id, name: title });
    });
    return surfaces;
}
function getCurrentSurfaceIndex() {
    const strip = getSurfaceStrip();
    const fs = document.querySelector('.window.true-fullscreen');
    if (fs && fs.dataset.minimized !== '1' && fs.style.display !== 'none') {
        const i = strip.findIndex(s => s.type === 'fs' && s.id === fs.id);
        if (i >= 0) return i;
    }
    return strip.findIndex(s => s.type === 'space' && s.index === MicaSpaces.current);
}
function goToSurface(idx, animate) {
    const strip = getSurfaceStrip();
    if (idx < 0 || idx >= strip.length) return;
    const target = strip[idx];
    const anim = animate && localStorage.getItem('mica_anim') !== '0' && getPerfMode() !== 'performance';
    if (target.type === 'space') {
        if (document.body.classList.contains('mica-true-fs') && typeof App !== 'undefined' && App.exitTrueFullscreen) {
            try { App.exitTrueFullscreen(); } catch (e) {}
        }
        switchSpace(target.index, anim);
    } else if (target.type === 'fs') {
        ensureWindowSpace(target.id);
        const si = MicaSpaces.assign[target.id];
        if (si != null && si !== MicaSpaces.current) switchSpace(si, false);
        const w = document.getElementById(target.id);
        if (w && !w.classList.contains('true-fullscreen') && App.enterTrueFullscreen) {
            App.enterTrueFullscreen(target.id);
        } else if (w) {
            document.querySelectorAll('.window.true-fullscreen').forEach(x => {
                if (x.id !== target.id && typeof App !== 'undefined') {
                    try { App.exitTrueFullscreen(x.id, { stayMaximized: true }); } catch (e) {}
                }
            });
            w.style.display = 'flex';
            w.style.zIndex = ++App.z;
        }
    }
}
function switchSurface(dir) {
    const strip = getSurfaceStrip();
    if (strip.length < 2) return;
    let i = getCurrentSurfaceIndex();
    if (i < 0) i = 0;
    i = (i + dir + strip.length) % strip.length;
    goToSurface(i, true);
}

/** Build a simple visual preview of a window for MicaTasking cards */
function micaWindowPreviewHtml(w) {
    if (!w) return '';
    const title = ((w.querySelector('.win-header span') || {}).textContent || 'App').replace(/</g, '');
    const body = w.querySelector('.win-body, .win-content, [id^="win_body"], .content') || w;
    // Try to grab emoji/icon from header or first large text
    let ico = '▦';
    const header = w.querySelector('.win-header');
    if (header) {
        const t = header.textContent || '';
        const m = t.match(/[\u{1F300}-\u{1FAFF}]/u);
        if (m) ico = m[0];
    }
    const mini = (body && body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return (
      '<div class="mc-win-preview">' +
        '<div class="mc-win-titlebar"><span class="mc-win-dots"></span><span class="mc-win-ttl">' + title + '</span></div>' +
        '<div class="mc-win-body"><span class="mc-win-ico">' + ico + '</span>' +
        (mini ? '<span class="mc-win-snippet">' + mini.replace(/</g, '') + '</span>' : '') +
        '</div></div>'
    );
}

function openTaskView() {
    if (typeof micaRequireSession === 'function' && !micaRequireSession('micatasking')) return;
    let ov = document.getElementById('task-view');
    if (ov) { ov.remove(); return; }
    ov = document.createElement('div');
    ov.id = 'task-view';
    ov.className = 'mc mt'; // mc + MicaTasking
    const strip = getSurfaceStrip();
    const cur = getCurrentSurfaceIndex();

    let cards = '';
    strip.forEach((s, i) => {
        const active = i === cur ? ' active' : '';
        if (s.type === 'space') {
            const wins = [...document.querySelectorAll('.window')].filter(w => {
                ensureWindowSpace(w.id);
                return MicaSpaces.assign[w.id] === s.index
                    && !w.classList.contains('true-fullscreen')
                    && w.dataset.minimized !== '1'
                    && w.style.display !== 'none';
            });
            // Desktop surface thumbnail (clean) — app previews listed UNDER the card
            // Group by app type so multiple instances are visible (Windows Task View style)
            const byType = {};
            wins.forEach(w => {
                const reg = (typeof Registry !== 'undefined' && Registry[w.id]) ? Registry[w.id] : null;
                const tname = (reg && reg.type) || ((w.querySelector('.win-header span') || {}).textContent || 'App');
                if (!byType[tname]) byType[tname] = [];
                byType[tname].push(w);
            });
            const under = wins.length
                ? ('<div class="mc-under">' + Object.keys(byType).map(tname => {
                    const group = byType[tname];
                    return group.slice(0, 6).map((w, idx) => {
                      const title = ((w.querySelector('.win-header span') || {}).textContent || tname).replace(/</g, '');
                      const wid = w.id;
                      const inst = group.length > 1 ? (' #' + (idx + 1)) : '';
                      return '<div class="mc-under-row">' +
                        '<button type="button" class="mc-under-app" data-win="' + wid + '">' +
                        '<span class="mc-under-ico">▦</span><span class="mc-under-name">' + title + inst + '</span></button>' +
                        '<button type="button" class="mc-under-close" data-close="' + wid + '" title="Close">✕</button></div>';
                    }).join('');
                  }).join('') + '</div>')
                : '<div class="mc-under mc-under-empty">No open apps</div>';
            cards += '<div class="mc-card' + active + '" data-i="' + i + '">' +
              '<div class="mc-preview space"><div class="mc-desk-face"><span class="mc-desk-num">' + (s.index + 1) + '</span></div></div>' +
              '<div class="mc-label">' + s.name + (wins.length ? ' · ' + wins.length : '') + '</div>' +
              under +
              '</div>';
        } else {
            const w = document.getElementById(s.id);
            const title = String(s.name).replace(/</g, '');
            cards += '<div class="mc-card' + active + '" data-i="' + i + '">' +
              '<div class="mc-preview fs">' + (w ? micaWindowPreviewHtml(w) : ('<div class="mc-fs-title">⛶ ' + title + '</div>')) + '</div>' +
              '<div class="mc-label">⛶ ' + title + '</div>' +
              '<div class="mc-under"><button type="button" class="mc-under-app" data-win="' + s.id + '"><span class="mc-under-ico">⛶</span><span class="mc-under-name">Focus fullscreen</span></button></div>' +
              '</div>';
        }
    });

    ov.innerHTML =
      '<div class="tv-backdrop"></div>' +
      '<div class="mc-title">MicaTasking</div>' +
      '<div class="mc-strip">' + cards + '</div>' +
      '<div class="mc-dock">' +
        '<button type="button" id="tv-add">+ Desktop</button>' +
        '<button type="button" id="tv-close">Done</button>' +
      '</div>' +
      '<div class="mc-hint">Desktops · apps listed below each · fullscreen as own surface · Ctrl+↑ · Esc</div>';
    document.body.appendChild(ov);

    ov.querySelectorAll('.mc-card').forEach(card => {
        card.onclick = (e) => {
            if (e.target.closest('.mc-under-app')) return; // handled separately
            e.stopPropagation();
            goToSurface(Number(card.getAttribute('data-i')), true);
            ov.remove();
        };
    });
    ov.querySelectorAll('.mc-under-app').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const wid = btn.getAttribute('data-win');
            const w = document.getElementById(wid);
            if (!w) return;
            ensureWindowSpace(wid);
            const si = MicaSpaces.assign[wid];
            if (si != null && si !== MicaSpaces.current) switchSpace(si, false);
            if (w.classList.contains('true-fullscreen')) {
                goToSurface(strip.findIndex(s => s.type === 'fs' && s.id === wid), true);
            } else {
                w.style.display = 'flex';
                w.dataset.minimized = '0';
                w.style.zIndex = ++App.z;
                if (typeof App !== 'undefined' && App.updateTray) App.updateTray();
            }
            ov.remove();
        };
    });
    ov.querySelectorAll('.mc-under-close').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            const wid = btn.getAttribute('data-close');
            if (!wid) return;
            try {
                if (typeof App !== 'undefined' && App.close) App.close(wid);
            } catch (err) {}
            // Refresh MicaTasking after a short delay (dirty prompt may open)
            setTimeout(() => {
                const still = document.getElementById('task-view');
                if (still) { still.remove(); openTaskView(); }
            }, 180);
        };
    });
    ov.querySelector('#tv-add').onclick = (e) => {
        e.stopPropagation();
        addSpace();
        ov.remove();
        openTaskView();
    };
    ov.querySelector('#tv-close').onclick = () => ov.remove();
    ov.querySelector('.tv-backdrop').onclick = () => ov.remove();
    const onKey = (e) => {
        if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', onKey, true); }
    };
    document.addEventListener('keydown', onKey, true);

    requestAnimationFrame(() => {
        const active = ov.querySelector('.mc-card.active');
        if (active) active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: getPerfMode() === 'performance' ? 'auto' : 'smooth' });
    });
}


/* Hook new windows to current space */
(function hookAppSpaces() {
    const tryHook = () => {
        if (typeof App === 'undefined' || App.__spaceHooked) return;
        App.__spaceHooked = true;
        const origOpen = App.open.bind(App);
        App.open = function(type, filePath) {
            if (typeof micaSound === 'function') micaSound('open');
            origOpen(type, filePath);
            setTimeout(() => {
                const wins = [...document.querySelectorAll('.window')];
                const last = wins[wins.length - 1];
                if (last) { MicaSpaces.assign[last.id] = MicaSpaces.current; saveSpaces(); }
            }, 40);
        };
        const origMin = App.minimize.bind(App);
        App.minimize = function(id) {
            const w = document.getElementById(id);
            if (w) w.dataset.minimized = '1';
            origMin(id);
        };
        const origRest = App.restoreWindow.bind(App);
        App.restoreWindow = function(id) {
            const w = document.getElementById(id);
            if (w) {
                w.dataset.minimized = '0';
                w.style.opacity = '1';
                w.style.transform = '';
            }
            origRest(id);
        };
    };
    setTimeout(tryHook, 200);
    document.addEventListener('DOMContentLoaded', () => setTimeout(tryHook, 100));
})();

/* Zoom lock — block only, no transform hacks */
(function lockZoom() {
    document.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) e.preventDefault();
    }, { passive: false, capture: true });
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0' || e.code === 'NumpadAdd' || e.code === 'NumpadSubtract')) {
            e.preventDefault();
        }
    }, true);
})();

/* Gestures & shortcuts */
(function micaGestures() {
    document.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
        if ((e.ctrlKey && e.key === 'ArrowUp') || e.key === 'F3') {
            e.preventDefault(); openTaskView(); return;
        }
        if (e.ctrlKey && e.key === 'ArrowLeft') {
            e.preventDefault(); if (typeof switchSurface === 'function') switchSurface(-1); else switchSpace(Math.max(0, MicaSpaces.current - 1), true); return;
        }
        if (e.ctrlKey && e.key === 'ArrowRight') {
            e.preventDefault(); if (typeof switchSurface === 'function') switchSurface(1); else switchSpace(Math.min(MicaSpaces.list.length - 1, MicaSpaces.current + 1), true); return;
        }
        if (e.ctrlKey && e.key === 'Tab') {
            e.preventDefault();
            const wins = [...document.querySelectorAll('.window')].filter(w => {
                ensureWindowSpace(w.id);
                return MicaSpaces.assign[w.id] === MicaSpaces.current && w.dataset.minimized !== '1';
            });
            if (!wins.length || typeof App === 'undefined') return;
            wins.sort((a, b) => (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0));
            const next = wins[0];
            if (next) { next.style.zIndex = ++App.z; App.restoreWindow(next.id); }
            return;
        }
        if (e.key === 'Escape') {
            if (typeof App !== 'undefined' && App.exitTrueFullscreen &&
                (document.body.classList.contains('mica-true-fs') || document.querySelector('.window.true-fullscreen'))) {
                App.exitTrueFullscreen();
                return;
            }
            const tv = document.getElementById('task-view');
            if (tv) tv.remove();
            const qa = document.getElementById('quick-access');
            if (qa) { qa.style.display = 'none'; qa.classList.remove('open'); }
            document.querySelectorAll('.topbar-dd-menu.open').forEach(m => m.classList.remove('open'));
        }
    });
    let wheelAcc = 0, wheelTimer = null;
    document.addEventListener('wheel', (e) => {
        if (!e.altKey) return;
        e.preventDefault();
        wheelAcc += e.deltaY + e.deltaX;
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => { wheelAcc = 0; }, 200);
        if (wheelAcc > 80) { wheelAcc = 0; if (typeof switchSurface === 'function') switchSurface(1); else switchSpace(Math.min(MicaSpaces.list.length - 1, MicaSpaces.current + 1), true); }
        else if (wheelAcc < -80) { wheelAcc = 0; if (typeof switchSurface === 'function') switchSurface(-1); else switchSpace(Math.max(0, MicaSpaces.current - 1), true); }
    }, { passive: false });
})();


/* Stability: recover chrome if something throws after boot */
(function micaGlobalErrorGuard() {
    window.addEventListener('error', function() {
        try {
            if (typeof micaRestoreChrome === 'function') micaRestoreChrome();
            document.body.classList.remove('mica-true-fs');
        } catch (e) {}
    });
})();
