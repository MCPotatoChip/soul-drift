'use strict';
// ---------------------------------------------------------------------------
// Player-facing settings, saved in localStorage (separate from the game save).
// Everything that scales an effect reads through here so the pause menu can
// tune it: sound, music, screen shake, screen flashes, particle density.
// ---------------------------------------------------------------------------

const SETTINGS_KEY = 'soul-drift-settings-v1';

const Settings = {
  data: null,
  // Menu rows: [key, label, kind, options]. 'steps' cycle through named values.
  schema: [
    ['sfx', 'Sound effects', 'slider'],
    ['music', 'Music', 'slider'],
    ['shake', 'Screen shake', 'steps', [[0, 'off'], [0.5, 'light'], [1, 'full']]],
    ['flash', 'Screen flashes', 'steps', [[0, 'off'], [0.5, 'soft'], [1, 'full']]],
    ['particles', 'Particles', 'steps', [[0.4, 'low'], [1, 'normal'], [1.6, 'high']]],
    ['damageNumbers', 'Damage numbers', 'steps', [[false, 'off'], [true, 'on']]],
    ['rumble', 'Controller rumble', 'steps', [[false, 'off'], [true, 'on']]],
  ],

  defaults() {
    const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    return { sfx: 0.8, music: 0.55, shake: 1, flash: 1, particles: coarse ? 0.4 : 1, damageNumbers: false, rumble: true };
  },

  load() {
    this.data = this.defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        for (const k of Object.keys(this.data)) if (typeof saved[k] === typeof this.data[k]) this.data[k] = saved[k];
      }
    } catch (e) { /* storage unavailable: defaults */ }
    return this.data;
  },
  save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ }
  },

  get(k) { return this.data[k]; },
  set(k, v) {
    this.data[k] = v;
    this.save();
    if (typeof Sfx !== 'undefined') Sfx.applyVolume();
    if (typeof Music !== 'undefined') Music.applyVolume();
  },

  // Scale a particle count, never dropping a visible effect to nothing
  count(n) { return Math.max(1, Math.round(n * this.data.particles)); },
  shake() { return this.data.shake; },
  flash() { return this.data.flash; },

  // Step a 'steps' or 'slider' row by dir (-1 / +1)
  adjust(row, dir) {
    const [key, , kind, opts] = row;
    const cur = this.data[key];
    if (kind === 'slider') { this.set(key, Math.round(Math.min(1, Math.max(0, cur + dir * 0.1)) * 10) / 10); return; }
    let i = opts.findIndex(o => o[0] === cur);
    if (i < 0) i = 0;
    this.set(key, opts[(i + dir + opts.length) % opts.length][0]);
  },
  label(row) {
    const [key, , kind, opts] = row;
    const cur = this.data[key];
    if (kind === 'slider') return cur <= 0 ? 'off' : '▮'.repeat(Math.round(cur * 10)) + '▯'.repeat(10 - Math.round(cur * 10));
    const o = opts.find(x => x[0] === cur);
    return o ? o[1] : String(cur);
  },
};

Settings.load();
