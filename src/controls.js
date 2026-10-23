'use strict';
// ---------------------------------------------------------------------------
// Remappable controls. Keys are tracked by physical key code (KeyboardEvent
// .code), so bindings survive keyboard layouts. Mouse buttons ("Mouse0" is the
// left button) bind like keys, and gamepads get their own binding table
// ("Pad0" is A / Cross, "PadLeft" is the d-pad or left stick). Every scene
// reads input through Controls; bindings persist in localStorage.
// ---------------------------------------------------------------------------

const ACTIONS = [
  ['left', 'Move left'], ['right', 'Move right'], ['up', 'Up (aim, climb)'], ['down', 'Down (aim, drop)'],
  ['jump', 'Jump'], ['attack', 'Slash'], ['dash', 'Shunpo'], ['heal', 'Heal (hold)'],
  ['kido', 'Kidō'], ['konso', 'Konsō (hold)'], ['burst', 'Senkaimon Burst (hold)'],
  ['bankai', 'Bankai'], ['mask', 'Hollow Mask'], ['interact', 'Interact'],
  ['map', 'Map'], ['inventory', 'Inventory'], ['pause', 'Pause'],
];

const DEFAULT_BINDINGS = {
  left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
  jump: ['KeyZ', 'Space'], attack: ['KeyX', 'Mouse0'], dash: ['KeyC'], heal: ['KeyA'],
  kido: ['KeyS', 'Mouse2'], konso: ['KeyD'], burst: ['KeyV'], bankai: ['KeyF'], mask: ['KeyQ'],
  interact: ['KeyE'], map: ['KeyM'], inventory: ['KeyI', 'Tab'], pause: ['Escape'],
};

// Standard gamepad layout: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 View, 9 Menu, 10 LS, 11 RS.
// The d-pad and the left stick both drive PadUp / PadDown / PadLeft / PadRight.
const DEFAULT_PAD = {
  left: ['PadLeft'], right: ['PadRight'], up: ['PadUp'], down: ['PadDown'],
  jump: ['Pad0'], attack: ['Pad2'], dash: ['Pad5'], heal: ['Pad4'], kido: ['Pad1'], konso: ['Pad3'],
  burst: ['Pad7'], bankai: ['Pad6'], mask: ['Pad11'], interact: [], map: ['Pad8'], inventory: ['Pad10'], pause: ['Pad9'],
};

const CONTROLS_KEY = 'soul-drift-controls-v1';
const PAD_KEY = 'soul-drift-pad-v1';
const LEGACY_KEYCODES = {
  8: 'Backspace', 9: 'Tab', 13: 'Enter', 16: 'ShiftLeft', 17: 'ControlLeft', 18: 'AltLeft', 27: 'Escape', 32: 'Space',
  37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 186: 'Semicolon', 188: 'Comma', 190: 'Period', 191: 'Slash',
};
const KEY_NAMES = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Escape: 'Esc', Enter: 'Enter',
  Backspace: 'Backspace', Tab: 'Tab', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt', AltRight: 'R-Alt', Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Quote: "'", BracketLeft: '[',
  BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  Mouse0: 'L-Click', Mouse1: 'M-Click', Mouse2: 'R-Click', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
  PadUp: '↑', PadDown: '↓', PadLeft: '←', PadRight: '→',
};
const PAD_NAMES = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS'],
  ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3'],
  nintendo: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'LS', 'RS'],
};
const PAD_DIRS = ['PadUp', 'PadDown', 'PadLeft', 'PadRight'];

function padStyleOf(id) {
  const s = String(id || '').toLowerCase();
  if (/054c|playstation|dualshock|dualsense|sony/.test(s)) return 'ps';
  if (/057e|nintendo|switch|joy-con|pro controller/.test(s)) return 'nintendo';
  return 'xbox';
}

const Controls = {
  bindings: null,
  pad: null,
  held: new Set(),
  pressed: new Set(),
  listeners: new Set(),
  changeListeners: new Set(),
  capture: null,
  captureAt: 0,
  device: 'kb',          // 'kb' (keyboard and mouse) or 'pad': which names the hints show
  padStyle: 'xbox',
  padHeld: new Set(),
  padConnected: false,
  lastTouch: 0,

  init() {
    this.load();
    window.addEventListener('keydown', (e) => this.onDown(e));
    window.addEventListener('keyup', (e) => this.held.delete(this.codeOf(e)));
    window.addEventListener('blur', () => { this.held.clear(); this.vcount = {}; });
    // Mouse buttons: only real mice (touch screens send compatibility mouse events after a tap)
    window.addEventListener('touchstart', () => { this.lastTouch = performance.now(); }, { capture: true, passive: true });
    const stage = document.getElementById('game') || window;
    stage.addEventListener('mousedown', (e) => this.onMouse(e, true));
    window.addEventListener('mouseup', (e) => this.onMouse(e, false));
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('gamepadconnected', (e) => { this.padConnected = true; this.padStyle = padStyleOf(e.gamepad && e.gamepad.id); });
    const loop = () => { try { this.pollPads(); } catch (err) { /* a misbehaving pad never stops the game */ } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  },

  codeOf(e) {
    if (e.code) return e.code;
    const kc = e.keyCode;
    if (kc >= 65 && kc <= 90) return 'Key' + String.fromCharCode(kc);
    if (kc >= 48 && kc <= 57) return 'Digit' + (kc - 48);
    return LEGACY_KEYCODES[kc] || '';
  },

  setDevice(dev) {
    if (this.device === dev) return;
    this.device = dev;
    this.changeListeners.forEach(fn => fn());
  },

  // Rebinding: the next key, click or pad button goes to `cb`. Input arriving in the
  // same instant as the one that opened the listener (the click on the row) is ignored.
  listen(cb) { this.capture = cb; this.captureAt = performance.now(); },
  takeCapture(code, minAge = 0) {
    if (!this.capture || performance.now() - this.captureAt < minAge) return false;
    const cb = this.capture;
    this.capture = null;
    cb(code);
    return true;
  },

  onDown(e) {
    const code = this.codeOf(e);
    if (!code) return;
    this.setDevice('kb');
    if (this.capture) { e.preventDefault(); this.takeCapture(code); return; }
    // Browser shortcuts (Ctrl+S, Cmd+F, Alt+Tab...) are not game input: leave them alone, and
    // never register them as held (macOS never sends the keyup for a key pressed with Cmd)
    if ((e.ctrlKey || e.metaKey || e.altKey) && !/^(Control|Shift|Alt|Meta)/.test(code)) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code) || this.actionsFor(code).length) e.preventDefault();
    if (!e.repeat) this.pressed.add(code);
    this.held.add(code);
    this.listeners.forEach(fn => fn(code, e));
  },

  // Mouse buttons act as gameplay keys. They never drive menus (those take clicks directly).
  onMouse(e, down) {
    if (performance.now() - this.lastTouch < 900) return;
    const code = 'Mouse' + e.button;
    if (!down) { this.held.delete(code); return; }
    this.setDevice('kb');
    if (this.capture) { if (this.takeCapture(code, 250)) e.preventDefault(); return; }
    if (this.actionsFor(code).length) e.preventDefault();
    this.pressed.add(code);
    this.held.add(code);
  },

  // ---------------------------------------------------------------- gamepads
  pollPads() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    const now = new Set();
    let any = false;
    for (const gp of list || []) {
      if (!gp || gp.connected === false) continue;
      any = true;
      if (!this.padConnected) { this.padConnected = true; this.padStyle = padStyleOf(gp.id); }
      gp.buttons.forEach((b, i) => {
        const v = typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5;
        if (!v || i > 15) return;
        now.add(i === 12 ? 'PadUp' : i === 13 ? 'PadDown' : i === 14 ? 'PadLeft' : i === 15 ? 'PadRight' : 'Pad' + i);
      });
      // left stick, with a little hysteresis so a held direction does not flicker
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, was = (c) => this.padHeld.has(c);
      if (ax < (was('PadLeft') ? -0.3 : -0.45)) now.add('PadLeft');
      if (ax > (was('PadRight') ? 0.3 : 0.45)) now.add('PadRight');
      if (ay < (was('PadUp') ? -0.45 : -0.62)) now.add('PadUp');
      if (ay > (was('PadDown') ? 0.45 : 0.62)) now.add('PadDown');
    }
    this.padConnected = any;
    for (const c of now) if (!this.padHeld.has(c)) this.padDown(c);
    for (const c of this.padHeld) if (!now.has(c)) this.held.delete(c);
    this.padHeld = now;
    // menus repeat a held direction, like a held arrow key
    const t = performance.now();
    for (const c of PAD_DIRS) {
      if (!now.has(c)) { delete this.repeatAt[c]; continue; }
      if (this.repeatAt[c] && t >= this.repeatAt[c]) { this.repeatAt[c] = t + 110; this.listeners.forEach(fn => fn(c, { preventDefault() {}, repeat: true })); }
    }
  },
  repeatAt: {},
  padDown(code) {
    this.setDevice('pad');
    if (this.capture) { this.takeCapture(code, 150); return; }
    this.pressed.add(code);
    this.held.add(code);
    if (PAD_DIRS.includes(code)) this.repeatAt[code] = performance.now() + 380;
    this.listeners.forEach(fn => fn(code, { preventDefault() {} }));
  },
  // A short buzz on pads that support it (hits, Bankai, boss blows)
  rumble(ms = 120, strong = 0.5, weak = 0.3) {
    if (this.device !== 'pad' || (typeof Settings !== 'undefined' && !Settings.get('rumble'))) return;
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of list || []) {
      const act = gp && gp.vibrationActuator;
      if (act && act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
    }
  },

  // Virtual keys (touch buttons): behave exactly like a physical key with this code.
  // Calls are counted so two fingers on the same key never release it early.
  vcount: {},
  press(code) {
    if (!code) return;
    this.vcount[code] = (this.vcount[code] || 0) + 1;
    if (this.vcount[code] > 1) return;
    if (this.capture) { this.takeCapture(code); return; }
    this.pressed.add(code);
    this.held.add(code);
    this.listeners.forEach(fn => fn(code, { preventDefault() {} }));
  },
  release(code) {
    if (!code || !this.vcount[code]) return;
    if (--this.vcount[code] > 0) return;
    this.held.delete(code);
  },
  // The key a touch button should send for an action (its current primary binding)
  codeFor(action) { return (this.bindings[action] || []).find(c => !c.startsWith('Mouse')) || null; },

  // Subscribe to raw key presses (menus). Returns an unsubscribe function.
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  onChange(fn) { this.changeListeners.add(fn); return () => this.changeListeners.delete(fn); },

  // Gameplay polling: take this frame's presses (each press is seen once)
  takePresses() { const p = this.pressed; this.pressed = new Set(); return p; },
  clearPresses() { this.pressed.clear(); },
  releaseAll() { this.held.clear(); this.pressed.clear(); this.vcount = {}; },

  codesOf(action) { return (this.bindings[action] || []).concat(this.pad[action] || []); },
  isDown(action) { return this.codesOf(action).some(c => this.held.has(c)); },
  inSet(action, set) { return this.codesOf(action).some(c => set.has(c)); },
  is(code, action) { return this.codesOf(action).includes(code); },
  actionsFor(code) { return Object.keys(this.bindings).filter(a => this.is(code, a)); },

  // Menu helpers: Enter / Escape and the pad's A / B always confirm and go back, whatever the bindings
  isConfirm(code) { return code === 'Enter' || code === 'Pad0' || this.is(code, 'jump') || this.is(code, 'interact'); },
  isBack(code) { return code === 'Escape' || code === 'Backspace' || code === 'Pad1' || (this.is(code, 'attack') && !code.startsWith('Pad')); },
  isUp(code) { return code === 'ArrowUp' || code === 'PadUp' || this.is(code, 'up'); },
  isDownKey(code) { return code === 'ArrowDown' || code === 'PadDown' || this.is(code, 'down'); },
  isLeft(code) { return code === 'ArrowLeft' || code === 'PadLeft' || this.is(code, 'left'); },
  isRight(code) { return code === 'ArrowRight' || code === 'PadRight' || this.is(code, 'right'); },

  keyName(code) {
    if (!code) return '—';
    if (/^Pad\d+$/.test(code)) return (PAD_NAMES[this.padStyle] || PAD_NAMES.xbox)[+code.slice(3)] || code;
    if (KEY_NAMES[code]) return KEY_NAMES[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return code;
  },
  // The name of the first input for an action on the device in use (interact falls back to up on a pad)
  key(action) {
    if (this.device === 'pad') {
      const c = (this.pad[action] || [])[0] || (action === 'interact' ? (this.pad.up || [])[0] : null);
      if (c) return this.keyName(c);
    }
    return this.keyName((this.bindings[action] || [])[0]);
  },
  keys(action) { return (this.bindings[action] || []).map(c => this.keyName(c)).join(' / ') || '—'; },
  padKey(action) { return (this.pad[action] || []).map(c => this.keyName(c)).join(' / ') || '—'; },
  // Replace {action} tokens in text with the bound key name
  fmt(text) { return String(text).replace(/\{(\w+)\}/g, (m, a) => (this.bindings[a] ? this.key(a) : m)); },

  // Bind `code` to `action` in `slot` (0 primary, 1 alternate). A key can only
  // belong to one action, so the previous owner receives this action's old key.
  rebind(action, slot, code) {
    if (code.startsWith('Pad')) return this.rebindPad(action, code);
    const b = this.bindings;
    slot = Math.min(slot, b[action].length);
    const old = b[action][slot];
    const owner = Object.keys(b).find(a => a !== action && b[a].includes(code));
    if (owner && !old && b[owner].length === 1) return { ok: false, owner };
    for (const a of Object.keys(b)) {
      const i = b[a].indexOf(code);
      if (i >= 0 && !(a === action && i === slot)) {
        if (old) b[a][i] = old; else b[a].splice(i, 1);
      }
    }
    b[action][slot] = code;
    b[action] = b[action].filter(Boolean);
    this.save();
    return { ok: true, owner: owner && old ? owner : null };
  },
  // Pad buttons: one per action; taking another action's button swaps the two
  rebindPad(action, code) {
    const p = this.pad, old = (p[action] || [])[0] || null;
    const owner = Object.keys(p).find(a => a !== action && p[a].includes(code));
    if (owner) p[owner] = p[owner].filter(c => c !== code).concat(old ? [old] : []);
    p[action] = [code];
    this.save();
    return { ok: true, owner: owner || null, pad: true };
  },
  clearAlt(action) { this.bindings[action] = this.bindings[action].slice(0, 1); this.save(); },
  clearPad(action) { this.pad[action] = []; this.save(); },
  reset() {
    this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    this.pad = JSON.parse(JSON.stringify(DEFAULT_PAD));
    this.save();
  },

  load() {
    const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    const saved = read(CONTROLS_KEY), savedPad = read(PAD_KEY);
    this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    this.pad = JSON.parse(JSON.stringify(DEFAULT_PAD));
    if (saved && typeof saved === 'object') {
      for (const a of Object.keys(this.bindings)) if (Array.isArray(saved[a]) && saved[a].length) this.bindings[a] = saved[a].slice(0, 2);
    }
    if (savedPad && typeof savedPad === 'object') {
      for (const a of Object.keys(this.pad)) if (Array.isArray(savedPad[a])) this.pad[a] = savedPad[a].filter(c => typeof c === 'string').slice(0, 2);
    }
  },
  save() {
    try {
      localStorage.setItem(CONTROLS_KEY, JSON.stringify(this.bindings));
      localStorage.setItem(PAD_KEY, JSON.stringify(this.pad));
    } catch (e) { /* storage unavailable */ }
    this.changeListeners.forEach(fn => fn());
  },
};

Controls.init();
