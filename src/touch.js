'use strict';
// ---------------------------------------------------------------------------
// Touch controls: an on-screen stick and buttons drawn as a DOM overlay (so they
// sit on the letterbox bars too and handle many fingers at once). Every button
// can be dragged, resized, deleted, added, and pointed at any action. Buttons
// press the key that action is bound to, so keyboard remapping still applies.
// ---------------------------------------------------------------------------

const TOUCH_KEY = 'soul-drift-touch-v1';

const TOUCH_ACTIONS = [
  ['jump', 'JUMP', 'Jump'], ['attack', 'SLASH', 'Slash'], ['dash', 'SHUNPO', 'Shunpo'], ['kido', 'KIDŌ', 'Kidō'],
  ['heal', 'HEAL', 'Heal (hold)'], ['konso', 'KONSŌ', 'Konsō (hold)'], ['burst', 'BURST', 'Senkaimon Burst (hold)'],
  ['bankai', 'BANKAI', 'Bankai'], ['mask', 'MASK', 'Hollow Mask'], ['interact', 'USE', 'Interact'],
  ['map', 'MAP', 'Map'], ['inventory', 'BAG', 'Inventory'], ['pause', 'II', 'Pause'],
  ['up', '▲', 'Up'], ['down', '▼', 'Down'], ['left', '◀', 'Left'], ['right', '▶', 'Right'],
];
const TOUCH_LABEL = Object.fromEntries(TOUCH_ACTIONS.map(a => [a[0], a[1]]));

// Positions are percentages of the screen; sizes are percentages of its short side
const TOUCH_DEFAULT = {
  v: 1, enabled: null, scale: 1, opacity: 0.6,
  stick: { x: 15, y: 68, s: 34 },
  buttons: [
    { id: 'b1', action: 'jump', x: 91, y: 60, s: 17 },
    { id: 'b2', action: 'attack', x: 78, y: 74, s: 17 },
    { id: 'b3', action: 'dash', x: 91, y: 84, s: 13 },
    { id: 'b4', action: 'kido', x: 65, y: 85, s: 12 },
    { id: 'b5', action: 'heal', x: 78, y: 49, s: 11 },
    { id: 'b6', action: 'konso', x: 66, y: 67, s: 11 },
    { id: 'b7', action: 'burst', x: 52, y: 85, s: 11 },
    { id: 'b8', action: 'bankai', x: 91, y: 36, s: 10 },
    { id: 'b9', action: 'mask', x: 80, y: 31, s: 10 },
    { id: 'b10', action: 'interact', x: 66, y: 47, s: 10 },
    { id: 'b11', action: 'map', x: 3.5, y: 9, s: 7 },
    { id: 'b12', action: 'inventory', x: 3.5, y: 24, s: 7 },
    { id: 'b13', action: 'pause', x: 96, y: 9, s: 7 },
  ],
};

const Touch = {
  game: null,
  layout: null,
  enabled: false,
  mode: 'hidden',
  root: null,
  els: {},            // id -> element
  pointers: new Map(), // pointerId -> { kind, id, code } for buttons, { kind: 'stick' } for the stick
  stick: { dirs: { left: false, right: false, up: false, down: false } },
  editing: false,
  selected: null,
  resumeAfterEdit: false,

  // ---------------------------------------------------------------- setup
  attach(game) {
    this.game = game;
    this.load();
    this.build();
    const q = new URLSearchParams(location.search);
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    let on = this.layout.enabled;
    if (q.get('touch') === '1') on = true;
    if (q.get('touch') === '0') on = false;
    if (on === null || on === undefined) on = coarse || (navigator.maxTouchPoints > 0 && !(window.matchMedia && matchMedia('(hover: hover)').matches));
    this.setEnabled(!!on, false);
    // hybrid devices: the first real touch switches the overlay on
    window.addEventListener('touchstart', () => { if (!this.enabled && this.layout.enabled === null) this.setEnabled(true, false); }, { passive: true });
    window.addEventListener('pointerdown', () => { try { Sfx.init(); } catch (e) { /* audio unavailable */ } }, { capture: true });
    window.addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    setInterval(() => this.tick(), 100);
    window.addEventListener('resize', () => this.layoutAll());
    Controls.onChange(() => this.refreshLabels());
  },

  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(TOUCH_KEY) || 'null'); } catch (e) { saved = null; }
    const d = JSON.parse(JSON.stringify(TOUCH_DEFAULT));
    if (saved && saved.v === 1 && Array.isArray(saved.buttons)) {
      d.enabled = saved.enabled === undefined ? null : saved.enabled;
      d.scale = clampNum(saved.scale, 0.5, 1.8, 1);
      d.opacity = clampNum(saved.opacity, 0.15, 1, 0.6);
      if (saved.stick) d.stick = { x: clampNum(saved.stick.x, 0, 100, 15), y: clampNum(saved.stick.y, 0, 100, 68), s: clampNum(saved.stick.s, 18, 50, 34) };
      d.buttons = saved.buttons.filter(b => b && TOUCH_LABEL[b.action]).slice(0, 24)
        .map((b, i) => ({ id: String(b.id || 'b' + (100 + i)), action: b.action, x: clampNum(b.x, 0, 100, 50), y: clampNum(b.y, 0, 100, 50), s: clampNum(b.s, 5, 28, 12) }));
    }
    this.layout = d;
  },
  save() {
    try { localStorage.setItem(TOUCH_KEY, JSON.stringify(this.layout)); } catch (e) { /* storage unavailable */ }
  },

  setEnabled(on, persist = true) {
    this.enabled = on;
    if (persist) { this.layout.enabled = on; this.save(); }
    document.body.classList.toggle('touch', on);
    if (this.game && this.game.scale) setTimeout(() => this.game.scale.refresh(), 50);
    if (!on) this.releaseAll();
    this.applyMode(this.mode, true);
  },

  // ---------------------------------------------------------------- DOM
  build() {
    const root = document.createElement('div');
    root.id = 'touch';
    document.body.appendChild(root);
    this.root = root;
    // system buttons
    const sys = document.createElement('div');
    sys.className = 'tsys';
    sys.append(this.sysButton('⛶', 'Fullscreen', () => this.toggleFullscreen()), this.sysButton('⚙', 'Edit touch layout', () => this.openEditor()));
    root.appendChild(sys);
    this.sys = sys;
    // menu pad (navigation for menus)
    const nav = document.createElement('div');
    nav.className = 'tnav';
    const navBtn = (cls, label, code) => { const b = document.createElement('div'); b.className = 'tnb ' + cls; b.textContent = label; this.bindKey(b, () => code); nav.appendChild(b); return b; };
    navBtn('nu', '▲', 'ArrowUp'); navBtn('nd', '▼', 'ArrowDown');
    navBtn('ok', 'OK', 'Enter'); navBtn('bk', 'BACK', 'Escape');
    root.appendChild(nav);
    this.nav = nav;
    // stick
    const st = document.createElement('div');
    st.className = 'tstick';
    st.innerHTML = '<div class="tbase"></div><div class="tknob"></div>';
    root.appendChild(st);
    this.stickEl = st;
    this.bindStick(st);
    this.layout.buttons.forEach(b => this.makeButton(b));
    this.layoutAll();
  },

  sysButton(label, title, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.title = title; b.setAttribute('aria-label', title);
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  },

  makeButton(b) {
    const el = document.createElement('div');
    el.className = 'tbtn';
    el.dataset.id = b.id;
    el.innerHTML = '<span></span>';
    this.root.appendChild(el);
    this.els[b.id] = el;
    this.bindKey(el, () => {
      const cur = this.layout.buttons.find(x => x.id === b.id);
      return cur ? Controls.codeFor(cur.action) : null;
    }, b.id);
    return el;
  },

  // Attach press / release handling to an element that sends one key code
  bindKey(el, getCode, id) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (this.editing) return this.editDown(e, id);
      const code = getCode();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      el.classList.add('down');
      this.pointers.set(e.pointerId, { kind: 'key', el, code });
      if (code) Controls.press(code);
    });
    const up = (e) => {
      if (this.editing) return this.editUp(e, id);
      const p = this.pointers.get(e.pointerId);
      if (!p || p.kind !== 'key') return;
      this.pointers.delete(e.pointerId);
      p.el.classList.remove('down');
      if (p.code) Controls.release(p.code);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointermove', (e) => { if (this.editing) this.editMove(e, id); });
  },

  bindStick(el) {
    const R = () => { const r = el.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, rad: r.width / 2 }; };
    const apply = (e) => {
      const { cx, cy, rad } = R();
      let dx = (e.clientX - cx) / rad, dy = (e.clientY - cy) / rad;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      const knob = el.querySelector('.tknob');
      knob.style.transform = `translate(${dx * rad * 0.55}px, ${dy * rad * 0.55}px)`;
      this.setDirs({ left: dx < -0.3, right: dx > 0.3, up: dy < -0.55, down: dy > 0.55 });
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (this.editing) return this.editDown(e, 'stick');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      this.pointers.set(e.pointerId, { kind: 'stick' });
      apply(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (this.editing) return this.editMove(e, 'stick');
      if (this.pointers.get(e.pointerId)) apply(e);
    });
    const end = (e) => {
      if (this.editing) return this.editUp(e, 'stick');
      if (!this.pointers.get(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      el.querySelector('.tknob').style.transform = '';
      this.setDirs({ left: false, right: false, up: false, down: false });
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  },

  setDirs(next) {
    const cur = this.stick.dirs;
    for (const d of ['left', 'right', 'up', 'down']) {
      if (next[d] === cur[d]) continue;
      const code = Controls.codeFor(d);
      if (next[d]) Controls.press(code); else Controls.release(code);
      cur[d] = next[d];
    }
  },

  releaseAll() {
    this.setDirs({ left: false, right: false, up: false, down: false });
    for (const [, p] of this.pointers) { if (p.kind === 'key') { p.el.classList.remove('down'); if (p.code) Controls.release(p.code); } }
    this.pointers.clear();
    const knob = this.stickEl && this.stickEl.querySelector('.tknob');
    if (knob) knob.style.transform = '';
  },

  // Position and size every control from the saved layout
  layoutAll() {
    if (!this.root) return;
    const vmin = Math.min(window.innerWidth, window.innerHeight) / 100;
    const place = (el, o) => {
      const px = o.s * vmin * this.layout.scale;
      el.style.width = el.style.height = px + 'px';
      el.style.left = (o.x / 100 * window.innerWidth - px / 2) + 'px';
      el.style.top = (o.y / 100 * window.innerHeight - px / 2) + 'px';
      el.style.fontSize = Math.max(9, px * 0.2) + 'px';
    };
    place(this.stickEl, this.layout.stick);
    for (const b of this.layout.buttons) if (this.els[b.id]) place(this.els[b.id], b);
    this.root.style.setProperty('--top', this.layout.opacity);
    this.refreshLabels();
  },
  refreshLabels() {
    for (const b of this.layout.buttons) {
      const el = this.els[b.id]; if (!el) continue;
      el.firstChild.textContent = TOUCH_LABEL[b.action];
      el.classList.toggle('hold', ['heal', 'konso', 'burst', 'attack'].includes(b.action));
    }
  },

  // ---------------------------------------------------------------- modes
  detectMode() {
    const g = this.game;
    if (!g || !this.enabled) return 'hidden';
    if (this.editing) return 'edit';
    const sm = g.scene;
    if (sm.isActive('menu')) return 'menu';
    if (sm.isActive('title')) return 'title';
    if (sm.isActive('ending')) return 'dialog';
    if (sm.isActive('game')) {
      const ui = sm.getScene('ui');
      if (ui && (ui.popState || ui.dlgState)) return 'dialog';
      return 'play';
    }
    return 'hidden';
  },
  tick() {
    const m = this.detectMode();
    if (m !== this.mode) this.applyMode(m);
  },
  applyMode(m, force) {
    if (m === this.mode && !force) return;
    if (this.mode === 'play' && m !== 'play') this.releaseAll();
    this.mode = m;
    this.root.className = 'm-' + m + (this.enabled ? ' on' : '');
  },

  // ---------------------------------------------------------------- fullscreen
  toggleFullscreen() {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      return;
    }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    const p = req.call(el);
    const lock = () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not supported */ } };
    if (p && p.then) p.then(lock, () => {}); else lock();
  },

  // ---------------------------------------------------------------- layout editor
  openEditor() {
    if (this.editing) return;
    if (!this.enabled) this.setEnabled(true);
    const sm = this.game && this.game.scene;
    this.resumeAfterEdit = false;
    if (sm && sm.isActive('game')) { sm.pause('game'); this.resumeAfterEdit = true; }
    this.releaseAll();
    this.editing = true;
    this.selected = null;
    this.buildPanel();
    this.applyMode('edit', true);
    this.syncPanel();
  },
  closeEditor() {
    this.editing = false;
    this.selected = null;
    if (this.panel) { this.panel.remove(); this.panel = null; }
    this.root.querySelectorAll('.sel').forEach(e => e.classList.remove('sel'));
    this.save();
    const sm = this.game && this.game.scene;
    if (this.resumeAfterEdit && sm && sm.isPaused('game')) sm.resume('game');
    this.resumeAfterEdit = false;
    Controls.releaseAll();
    this.applyMode(this.detectMode(), true);
  },

  buildPanel() {
    const p = document.createElement('div');
    p.className = 'tpanel';
    const opts = TOUCH_ACTIONS.map(a => `<option value="${a[0]}">${a[2]}</option>`).join('');
    p.innerHTML = `
      <div class="tp-title">Touch layout <small>drag a button to move it · tap it to change it</small></div>
      <div class="tp-row tp-sel"><span class="tp-name">Nothing selected</span>
        <label>Does <select class="tp-action">${opts}</select></label>
        <label>Size <input class="tp-size" type="range" min="5" max="28" step="1"></label>
        <button type="button" class="tp-del">Remove</button></div>
      <div class="tp-row">
        <label>All buttons <input class="tp-scale" type="range" min="50" max="180" step="5"></label>
        <label>Opacity <input class="tp-op" type="range" min="15" max="100" step="5"></label></div>
      <div class="tp-row">
        <button type="button" class="tp-add">+ Add button</button>
        <button type="button" class="tp-mirror">Mirror left / right</button>
        <button type="button" class="tp-reset">Reset layout</button>
        <button type="button" class="tp-off">Turn touch controls off</button>
        <button type="button" class="tp-done">Done</button></div>`;
    document.body.appendChild(p);
    this.panel = p;
    // clicks inside the panel must never reach the game
    ['pointerdown', 'pointerup', 'touchstart'].forEach(ev => p.addEventListener(ev, e => e.stopPropagation()));
    const q = (s) => p.querySelector(s);
    q('.tp-action').addEventListener('change', (e) => { const b = this.selButton(); if (b) { b.action = e.target.value; this.refreshLabels(); this.save(); } });
    q('.tp-size').addEventListener('input', (e) => { const o = this.selObj(); if (o) { o.s = +e.target.value; this.layoutAll(); } });
    q('.tp-del').addEventListener('click', () => this.removeSelected());
    q('.tp-scale').addEventListener('input', (e) => { this.layout.scale = +e.target.value / 100; this.layoutAll(); });
    q('.tp-op').addEventListener('input', (e) => { this.layout.opacity = +e.target.value / 100; this.layoutAll(); });
    q('.tp-add').addEventListener('click', () => this.addButton());
    q('.tp-mirror').addEventListener('click', () => this.mirror());
    q('.tp-reset').addEventListener('click', () => this.resetLayout());
    q('.tp-off').addEventListener('click', () => { this.closeEditor(); this.setEnabled(false); });
    q('.tp-done').addEventListener('click', () => this.closeEditor());
    q('.tp-scale').value = Math.round(this.layout.scale * 100);
    q('.tp-op').value = Math.round(this.layout.opacity * 100);
  },
  selButton() { return this.layout.buttons.find(b => b.id === this.selected) || null; },
  selObj() { return this.selected === 'stick' ? this.layout.stick : this.selButton(); },
  syncPanel() {
    if (!this.panel) return;
    const q = (s) => this.panel.querySelector(s), o = this.selObj(), b = this.selButton();
    q('.tp-name').textContent = this.selected === 'stick' ? 'Move stick' : b ? TOUCH_LABEL[b.action] + ' button' : 'Nothing selected';
    q('.tp-action').disabled = !b; q('.tp-del').disabled = !b; q('.tp-size').disabled = !o;
    if (b) q('.tp-action').value = b.action;
    if (o) q('.tp-size').value = o.s;
    this.root.querySelectorAll('.sel').forEach(e => e.classList.remove('sel'));
    const el = this.selected === 'stick' ? this.stickEl : this.els[this.selected];
    if (el) el.classList.add('sel');
  },
  editDown(e, id) {
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    this.drag = { id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    this.selected = id;
    this.syncPanel();
  },
  editMove(e, id) {
    const d = this.drag;
    if (!d || d.pid !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    d.moved = true;
    const o = id === 'stick' ? this.layout.stick : this.layout.buttons.find(b => b.id === id);
    if (!o) return;
    o.x = Math.max(2, Math.min(98, e.clientX / window.innerWidth * 100));
    o.y = Math.max(3, Math.min(97, e.clientY / window.innerHeight * 100));
    this.layoutAll();
  },
  editUp(e) { if (this.drag && this.drag.pid === e.pointerId) { this.drag = null; this.save(); } },
  addButton() {
    if (this.layout.buttons.length >= 24) return;
    const id = 'b' + Date.now().toString(36);
    const b = { id, action: 'jump', x: 50, y: 60, s: 12 };
    this.layout.buttons.push(b);
    this.makeButton(b);
    this.applyMode('edit', true);
    this.layoutAll();
    this.selected = id;
    this.syncPanel();
    this.save();
  },
  removeSelected() {
    const b = this.selButton(); if (!b) return;
    this.layout.buttons = this.layout.buttons.filter(x => x !== b);
    const el = this.els[b.id]; if (el) el.remove();
    delete this.els[b.id];
    this.selected = null;
    this.syncPanel();
    this.save();
  },
  mirror() {
    this.layout.stick.x = 100 - this.layout.stick.x;
    this.layout.buttons.forEach(b => { b.x = 100 - b.x; });
    this.layoutAll(); this.save();
  },
  resetLayout() {
    const keepEnabled = this.layout.enabled;
    Object.values(this.els).forEach(el => el.remove());
    this.els = {};
    this.layout = JSON.parse(JSON.stringify(TOUCH_DEFAULT));
    this.layout.enabled = keepEnabled;
    this.layout.buttons.forEach(b => this.makeButton(b));
    this.selected = null;
    this.applyMode('edit', true);
    this.layoutAll();
    if (this.panel) {
      this.panel.querySelector('.tp-scale').value = 100;
      this.panel.querySelector('.tp-op').value = Math.round(this.layout.opacity * 100);
    }
    this.syncPanel(); this.save();
  },
};

function clampNum(v, lo, hi, dflt) { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt; }
