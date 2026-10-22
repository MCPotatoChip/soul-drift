'use strict';
// ---------------------------------------------------------------------------
// Remappable controls. Keys are tracked by physical key code (KeyboardEvent
// .code), so bindings survive keyboard layouts. Every scene reads input
// through Controls; bindings persist in localStorage.
// ---------------------------------------------------------------------------

const ACTIONS = [
  ['left', 'Move left'], ['right', 'Move right'], ['up', 'Up (aim, climb)'], ['down', 'Down (aim, drop)'],
  ['jump', 'Jump'], ['attack', 'Slash'], ['dash', 'Black Step'], ['heal', 'Heal (hold)'],
  ['kido', 'Kido'], ['konso', 'Konso Blade (hold)'], ['burst', 'Senkaimon Burst (hold)'],
  ['bankai', 'Bankai'], ['mask', 'Hollow Mask'], ['interact', 'Interact'],
  ['map', 'Map'], ['inventory', 'Inventory'], ['pause', 'Pause'],
];

const DEFAULT_BINDINGS = {
  left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
  jump: ['KeyZ', 'Space'], attack: ['KeyX'], dash: ['KeyC'], heal: ['KeyA'],
  kido: ['KeyS'], konso: ['KeyD'], burst: ['KeyV'], bankai: ['KeyF'], mask: ['KeyQ'],
  interact: ['KeyE'], map: ['KeyM'], inventory: ['KeyI', 'Tab'], pause: ['Escape'],
};

const CONTROLS_KEY = 'soul-drift-controls-v1';
const LEGACY_KEYCODES = {
  8: 'Backspace', 9: 'Tab', 13: 'Enter', 16: 'ShiftLeft', 17: 'ControlLeft', 18: 'AltLeft', 27: 'Escape', 32: 'Space',
  37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 186: 'Semicolon', 188: 'Comma', 190: 'Period', 191: 'Slash',
};
const KEY_NAMES = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Escape: 'Esc', Enter: 'Enter',
  Backspace: 'Backspace', Tab: 'Tab', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt', AltRight: 'R-Alt', Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Quote: "'", BracketLeft: '[',
  BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
};

const Controls = {
  bindings: null,
  held: new Set(),
  pressed: new Set(),
  listeners: new Set(),
  changeListeners: new Set(),
  capture: null,

  init() {
    this.load();
    window.addEventListener('keydown', (e) => this.onDown(e));
    window.addEventListener('keyup', (e) => this.held.delete(this.codeOf(e)));
    window.addEventListener('blur', () => { this.held.clear(); this.vcount = {}; });
  },

  codeOf(e) {
    if (e.code) return e.code;
    const kc = e.keyCode;
    if (kc >= 65 && kc <= 90) return 'Key' + String.fromCharCode(kc);
    if (kc >= 48 && kc <= 57) return 'Digit' + (kc - 48);
    return LEGACY_KEYCODES[kc] || '';
  },

  onDown(e) {
    const code = this.codeOf(e);
    if (!code) return;
    if (this.capture) {
      e.preventDefault();
      const cb = this.capture;
      this.capture = null;
      cb(code);
      return;
    }
    // Browser shortcuts (Ctrl+S, Cmd+F, Alt+Tab...) are not game input: leave them alone, and
    // never register them as held (macOS never sends the keyup for a key pressed with Cmd)
    if ((e.ctrlKey || e.metaKey || e.altKey) && !/^(Control|Shift|Alt|Meta)/.test(code)) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code) || this.actionsFor(code).length) e.preventDefault();
    if (!e.repeat) this.pressed.add(code);
    this.held.add(code);
    this.listeners.forEach(fn => fn(code, e));
  },

  // Virtual keys (touch buttons): behave exactly like a physical key with this code.
  // Calls are counted so two fingers on the same key never release it early.
  vcount: {},
  press(code) {
    if (!code) return;
    this.vcount[code] = (this.vcount[code] || 0) + 1;
    if (this.vcount[code] > 1) return;
    if (this.capture) { const cb = this.capture; this.capture = null; cb(code); return; }
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
  codeFor(action) { return (this.bindings[action] || [])[0] || null; },

  // Subscribe to raw key presses (menus). Returns an unsubscribe function.
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  onChange(fn) { this.changeListeners.add(fn); return () => this.changeListeners.delete(fn); },

  // Gameplay polling: take this frame's presses (each press is seen once)
  takePresses() { const p = this.pressed; this.pressed = new Set(); return p; },
  clearPresses() { this.pressed.clear(); },
  releaseAll() { this.held.clear(); this.pressed.clear(); this.vcount = {}; },

  isDown(action) { return (this.bindings[action] || []).some(c => this.held.has(c)); },
  inSet(action, set) { return (this.bindings[action] || []).some(c => set.has(c)); },
  is(code, action) { return (this.bindings[action] || []).includes(code); },
  actionsFor(code) { return Object.keys(this.bindings).filter(a => this.bindings[a].includes(code)); },

  // Menu helpers: confirm/back also accept Enter / Escape regardless of bindings
  isConfirm(code) { return code === 'Enter' || this.is(code, 'jump') || this.is(code, 'interact'); },
  isBack(code) { return code === 'Escape' || code === 'Backspace' || this.is(code, 'attack'); },
  isUp(code) { return code === 'ArrowUp' || this.is(code, 'up'); },
  isDownKey(code) { return code === 'ArrowDown' || this.is(code, 'down'); },

  keyName(code) {
    if (!code) return '—';
    if (KEY_NAMES[code]) return KEY_NAMES[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return code;
  },
  key(action) { return this.keyName((this.bindings[action] || [])[0]); },
  keys(action) { return (this.bindings[action] || []).map(c => this.keyName(c)).join(' / ') || '—'; },
  // Replace {action} tokens in text with the bound key name
  fmt(text) { return String(text).replace(/\{(\w+)\}/g, (m, a) => (this.bindings[a] ? this.key(a) : m)); },

  // Bind `code` to `action` in `slot` (0 primary, 1 alternate). A key can only
  // belong to one action, so the previous owner receives this action's old key.
  rebind(action, slot, code) {
    const b = this.bindings;
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
  clearAlt(action) { this.bindings[action] = this.bindings[action].slice(0, 1); this.save(); },
  reset() { this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); this.save(); },

  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(CONTROLS_KEY) || 'null'); } catch (e) { saved = null; }
    this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    if (saved && typeof saved === 'object') {
      for (const a of Object.keys(this.bindings)) if (Array.isArray(saved[a]) && saved[a].length) this.bindings[a] = saved[a].slice(0, 2);
    }
  },
  save() {
    try { localStorage.setItem(CONTROLS_KEY, JSON.stringify(this.bindings)); } catch (e) { /* storage unavailable */ }
    this.changeListeners.forEach(fn => fn());
  },
};

Controls.init();
