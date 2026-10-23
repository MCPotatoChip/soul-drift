'use strict';
// ---------------------------------------------------------------------------
// Tiny WebAudio synth for placeholder sound effects. No audio files needed.
// The context starts on the first key press (browsers block autoplay).
// ---------------------------------------------------------------------------

const Sfx = {
  ctx: null, out: null, noiseBuf: null, enabled: Settings.get('sfx') > 0, last: {},

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      // everything passes through one lowpass, which closes when the game is paused
      this.master = this.ctx.createBiquadFilter();
      this.master.type = 'lowpass'; this.master.frequency.value = 22000;
      this.master.connect(this.ctx.destination);
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.26 * Settings.get('sfx');
      this.out.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (typeof Music !== 'undefined') Music.attach();
    } catch (e) { this.ctx = null; }
  },

  // Close the world's sound behind a door while a menu is open
  muffle(on) {
    if (this.master) this.master.frequency.setTargetAtTime(on ? 650 : 22000, this.ctx.currentTime, 0.08);
  },

  // One footfall, in the voice of the ground underfoot
  step(surface = 'stone') {
    const v = 0.85 + Math.random() * 0.3;
    switch (surface) {
      case 'dirt': this.noise(0.07, { vol: 0.07 * v, freq: 650 * v, type: 'lowpass' }); break;
      case 'sand': this.noise(0.1, { vol: 0.05 * v, freq: 1100 * v, to: 500, type: 'lowpass' }); break;
      case 'crystal': this.tone(1500 * v, 0.08, { type: 'sine', vol: 0.025 }); this.noise(0.03, { vol: 0.04, freq: 5000, type: 'highpass' }); break;
      case 'ether': this.tone(260 * v, 0.14, { type: 'sine', vol: 0.03, to: 200 }); break;
      case 'wood': this.noise(0.05, { vol: 0.08 * v, freq: 900 * v }); this.tone(140 * v, 0.05, { vol: 0.04, to: 90 }); break;
      default: this.noise(0.04, { vol: 0.06 * v, freq: 2100 * v }); this.tone(110 * v, 0.04, { vol: 0.03, to: 70 });
    }
  },

  applyVolume() {
    this.enabled = Settings.get('sfx') > 0;
    if (this.out) this.out.gain.value = 0.26 * Settings.get('sfx');
  },

  tone(freq, dur, o = {}) {
    if (!this.ctx || !this.enabled) return;
    const { type = 'square', vol = 0.15, to = null, delay = 0, attack = 0.005 } = o;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.out);
    osc.start(t); osc.stop(t + dur + 0.05);
  },

  noise(dur, o = {}) {
    if (!this.ctx || !this.enabled) return;
    const { vol = 0.2, freq = 2000, to = null, type = 'bandpass', delay = 0, q = 1 } = o;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  },

  // Dialog letter blip; pitch varies per speaker
  blip(p = 1) { this.tone(300 * p + Math.random() * 35, 0.035, { type: 'square', vol: 0.035 }); },

  play(name) {
    if (!this.ctx) return;
    // Throttle identical sounds fired on the same frame
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.03) return;
    this.last[name] = now;
    switch (name) {
      case 'slash': this.noise(0.09, { vol: 0.22, freq: 4200, to: 1300 }); break;
      case 'wave': this.noise(0.25, { vol: 0.25, freq: 2500, to: 300 }); this.tone(220, 0.2, { type: 'sawtooth', vol: 0.06, to: 90 }); break;
      case 'hit': this.noise(0.08, { vol: 0.32, freq: 900 }); this.tone(170, 0.09, { vol: 0.12, to: 70 }); break;
      case 'clang': this.tone(1500, 0.18, { type: 'triangle', vol: 0.18, to: 1300 }); this.tone(2300, 0.14, { type: 'sine', vol: 0.1 }); break;
      case 'jump': this.tone(290, 0.07, { vol: 0.05, to: 520 }); break;
      case 'djump': this.tone(520, 0.14, { type: 'triangle', vol: 0.1, to: 980 }); this.noise(0.12, { vol: 0.08, freq: 5000 }); break;
      case 'dash': this.noise(0.16, { vol: 0.2, freq: 1600, to: 380, type: 'lowpass' }); break;
      case 'land': this.noise(0.05, { vol: 0.08, freq: 400, type: 'lowpass' }); break;
      case 'hurt': this.tone(240, 0.28, { type: 'sawtooth', vol: 0.16, to: 55 }); this.noise(0.22, { vol: 0.22, freq: 600 }); break;
      case 'heal': this.tone(520, 0.32, { type: 'sine', vol: 0.14, to: 820 }); this.tone(780, 0.3, { type: 'sine', vol: 0.06, delay: 0.08, to: 1100 }); break;
      case 'focus': this.tone(180, 0.12, { type: 'sine', vol: 0.05, to: 260 }); break;
      case 'hado': this.noise(0.32, { vol: 0.24, freq: 900, to: 180, type: 'lowpass' }); this.tone(170, 0.3, { type: 'sawtooth', vol: 0.1, to: 55 }); break;
      case 'bakudo': this.tone(880, 0.16, { type: 'triangle', vol: 0.12 }); this.tone(1320, 0.26, { type: 'triangle', vol: 0.08, delay: 0.06 }); this.tone(1760, 0.3, { type: 'sine', vol: 0.05, delay: 0.12 }); break;
      case 'konso': this.tone(660, 0.4, { type: 'sine', vol: 0.12, to: 990 }); this.tone(990, 0.5, { type: 'sine', vol: 0.06, delay: 0.1 }); break;
      case 'charge': this.tone(140, 0.5, { type: 'sawtooth', vol: 0.05, to: 420 }); break;
      case 'burst': this.noise(0.45, { vol: 0.3, freq: 300, to: 3000, type: 'bandpass' }); this.tone(90, 0.4, { type: 'square', vol: 0.08, to: 300 }); break;
      case 'pickup': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', vol: 0.11, delay: i * 0.07 })); break;
      case 'ability': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.1, delay: i * 0.09 })); break;
      case 'shard': this.tone(1150 + Math.random() * 350, 0.06, { type: 'sine', vol: 0.06 }); break;
      case 'break': this.noise(0.4, { vol: 0.34, freq: 500, type: 'lowpass' }); this.tone(80, 0.3, { vol: 0.08, to: 40 }); break;
      case 'boss': this.tone(65, 1.4, { type: 'sawtooth', vol: 0.16, to: 45 }); this.noise(1.2, { vol: 0.18, freq: 220, type: 'lowpass' }); break;
      case 'roar': this.noise(0.9, { vol: 0.3, freq: 300, to: 120, type: 'lowpass' }); this.tone(110, 0.8, { type: 'sawtooth', vol: 0.12, to: 60 }); break;
      case 'cero': this.noise(0.7, { vol: 0.22, freq: 1200, to: 400 }); this.tone(330, 0.7, { type: 'sawtooth', vol: 0.08, to: 200 }); break;
      case 'telegraph': this.tone(880, 0.1, { type: 'square', vol: 0.05 }); break;
      case 'bankai': this.noise(1.2, { vol: 0.3, freq: 150, to: 4000 }); [130, 196, 261, 392].forEach((f, i) => this.tone(f, 1.0, { type: 'sawtooth', vol: 0.06, delay: i * 0.12 })); break;
      case 'mask': this.tone(98, 0.5, { type: 'sawtooth', vol: 0.14, to: 196 }); this.noise(0.3, { vol: 0.15, freq: 700 }); break;
      case 'unmask': this.tone(196, 0.3, { type: 'triangle', vol: 0.1, to: 98 }); break;
      case 'heartbeat': this.tone(60, 0.12, { type: 'sine', vol: 0.3 }); this.tone(55, 0.12, { type: 'sine', vol: 0.22, delay: 0.16 }); break;
      case 'select': this.tone(660, 0.05, { vol: 0.05 }); break;
      case 'confirm': this.tone(660, 0.06, { vol: 0.06 }); this.tone(990, 0.08, { vol: 0.06, delay: 0.05 }); break;
      case 'deny': this.tone(160, 0.15, { vol: 0.08, to: 120 }); break;
      case 'save': [784, 988, 1175].forEach((f, i) => this.tone(f, 0.25, { type: 'sine', vol: 0.08, delay: i * 0.1 })); break;
      case 'die': this.tone(300, 1.2, { type: 'sawtooth', vol: 0.15, to: 40 }); this.noise(1.0, { vol: 0.2, freq: 400, to: 60, type: 'lowpass' }); break;
      case 'door': this.noise(0.6, { vol: 0.2, freq: 160, type: 'lowpass' }); break;
      case 'whip': this.noise(0.2, { vol: 0.2, freq: 3200, to: 900 }); this.tone(520, 0.12, { type: 'triangle', vol: 0.05, to: 260 }); break;
      case 'spit': this.noise(0.14, { vol: 0.14, freq: 700, to: 1800, type: 'bandpass', q: 2 }); this.tone(180, 0.1, { type: 'sine', vol: 0.06, to: 320 }); break;
      case 'throw': this.noise(0.08, { vol: 0.14, freq: 5000, to: 2500 }); break;
      case 'roarSmall': this.noise(0.4, { vol: 0.16, freq: 420, to: 200, type: 'lowpass' }); this.tone(150, 0.35, { type: 'sawtooth', vol: 0.06, to: 90 }); break;
      case 'bell': this.tone(1760 + Math.random() * 200, 0.25, { type: 'sine', vol: 0.05 }); this.tone(2640, 0.18, { type: 'sine', vol: 0.025 }); break;
      case 'petals': this.noise(0.6, { vol: 0.12, freq: 6000, to: 2000, type: 'highpass' }); this.tone(1320, 0.4, { type: 'sine', vol: 0.03, to: 1760 }); break;
      case 'zap': this.noise(0.12, { vol: 0.2, freq: 7000, type: 'highpass' }); this.tone(2200, 0.1, { type: 'square', vol: 0.05, to: 600 }); break;
      case 'saved': this.tone(880, 0.12, { type: 'sine', vol: 0.03 }); break;
      case 'geyser': this.noise(0.7, { vol: 0.18, freq: 260, to: 1900, type: 'bandpass', q: 0.8 }); this.tone(70, 0.6, { type: 'sine', vol: 0.1, to: 140 }); break;
    }
  },
};

window.addEventListener('keydown', () => Sfx.init());
window.addEventListener('pointerdown', () => Sfx.init());

document.addEventListener('visibilitychange', () => {
  if (!Sfx.ctx) return;
  if (document.hidden) Sfx.ctx.suspend(); else Sfx.ctx.resume();
});

// ---------------------------------------------------------------------------
// Music: generated live, so the game still needs no audio files. Each region has
// a theme (a root, a chord held as a slow pad, a scale for sparse echoing notes);
// a boss adds a pulse and tension on top and opens the pad up.
// ---------------------------------------------------------------------------
const Music = {
  name: null, theme: null, boss: false, ready: false, out: null, echo: null, pad: null, bossNodes: null,
  nextNote: 0, nextBeat: 0, beatNo: 0, deg: 2,

  THEMES: {
    title: { root: 55, chord: [0, 7, 12, 15], scale: [0, 3, 5, 7, 10, 12], pad: 'triangle', mel: 'sine', bright: 900, bpm: 52, density: 0.45 },
    kar: { root: 55, chord: [0, 7, 10, 15], scale: [0, 3, 5, 7, 10, 12, 15], pad: 'triangle', mel: 'triangle', bright: 1100, bpm: 56, density: 0.4 },
    ruk: { root: 49, chord: [0, 7, 12, 14], scale: [0, 2, 3, 7, 9, 12], pad: 'sawtooth', mel: 'triangle', bright: 650, bpm: 60, density: 0.5 },
    sei: { root: 58.27, chord: [0, 7, 11, 16], scale: [0, 2, 4, 7, 9, 11, 12], pad: 'triangle', mel: 'sine', bright: 1800, bpm: 64, density: 0.6 },
    sok: { root: 41.2, chord: [0, 7, 13, 19], scale: [0, 1, 5, 7, 8, 12], pad: 'sawtooth', mel: 'square', bright: 480, bpm: 70, density: 0.3 },
    hm: { root: 36.7, chord: [0, 7, 14], scale: [0, 5, 7, 12, 14], pad: 'sine', mel: 'sine', bright: 800, bpm: 44, density: 0.25 },
    end: { root: 65.4, chord: [0, 7, 12, 16, 19], scale: [0, 2, 4, 7, 9, 12, 14, 16], pad: 'triangle', mel: 'sine', bright: 2400, bpm: 60, density: 0.7 },
    dan: { root: 46.25, chord: [0, 6, 12, 18], scale: [0, 2, 4, 6, 8, 10, 12], pad: 'sawtooth', mel: 'sine', bright: 850, bpm: 50, density: 0.5 },
    for: { root: 43.65, chord: [0, 3, 7, 10], scale: [0, 3, 7, 10, 12], pad: 'triangle', mel: 'triangle', bright: 560, bpm: 42, density: 0.3 },
  },

  // Called once the AudioContext exists (after the first key press or tap)
  attach() {
    const ctx = Sfx.ctx;
    if (!ctx || this.ready) return;
    this.ready = true;
    this.out = ctx.createGain();
    this.out.gain.value = 0.5 * Settings.get('music');
    this.out.connect(Sfx.master);
    // a dark echo the notes are sent into
    this.echo = ctx.createDelay(1.5);
    this.echo.delayTime.value = 0.46;
    const fb = ctx.createGain(), lp = ctx.createBiquadFilter();
    fb.gain.value = 0.42; lp.type = 'lowpass'; lp.frequency.value = 1700;
    this.echo.connect(lp); lp.connect(fb); fb.connect(this.echo); lp.connect(this.out);
    this.nextNote = ctx.currentTime + 1;
    setInterval(() => { try { this.tick(); } catch (e) { /* never let music break the game */ } }, 120);
    this.buildPad();
  },
  applyVolume() { if (this.out) this.out.gain.setTargetAtTime(0.5 * Settings.get('music'), Sfx.ctx.currentTime, 0.1); },

  setRegion(name) { this.name = name; if (this.ready) this.buildPad(); },
  setBoss(on) { if (this.boss === on) return; this.boss = on; if (this.ready) this.applyBoss(); },

  buildPad() {
    const ctx = Sfx.ctx, th = this.THEMES[this.name] || this.THEMES.kar, now = ctx.currentTime;
    if (this.theme === th) return;
    this.theme = th;
    const old = this.pad;
    if (old) {
      old.gain.gain.setTargetAtTime(0, now, 0.9);
      setTimeout(() => { old.oscs.forEach(o => { try { o.stop(); } catch (e) { /* already stopped */ } }); old.gain.disconnect(); }, 5000);
    }
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    g.gain.value = 0; f.type = 'lowpass'; f.frequency.value = this.boss ? th.bright * 2.2 : th.bright; f.Q.value = 0.6;
    f.connect(g); g.connect(this.out);
    const oscs = th.chord.map((n, i) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = th.pad; o.frequency.value = th.root * Math.pow(2, n / 12); o.detune.value = i % 2 ? 7 : -7;
      og.gain.value = 0.1 / (1 + i * 0.3);
      o.connect(og); og.connect(f); o.start();
      return o;
    });
    // the pad slowly breathes
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.05 + Math.random() * 0.04; lg.gain.value = 0.3;
    lfo.connect(lg); lg.connect(g.gain); lfo.start(); oscs.push(lfo);
    g.gain.setTargetAtTime(0.7, now, 1.8);
    this.pad = { gain: g, oscs, filter: f };
    this.applyBoss();
  },

  applyBoss() {
    const ctx = Sfx.ctx, now = ctx.currentTime, th = this.theme;
    if (!th || !this.pad) return;
    this.pad.filter.frequency.setTargetAtTime(this.boss ? th.bright * 2.2 : th.bright, now, 0.6);
    if (this.boss && !this.bossNodes) {
      // an uneasy tritone under everything
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = th.root * Math.pow(2, 6 / 12);
      g.gain.value = 0; g.gain.setTargetAtTime(0.035, now, 0.8);
      o.connect(g); g.connect(this.pad.filter); o.start();
      this.bossNodes = { o, g };
      this.nextBeat = now + 0.3; this.beatNo = 0;
    } else if (!this.boss && this.bossNodes) {
      const n = this.bossNodes; this.bossNodes = null;
      n.g.gain.setTargetAtTime(0, now, 0.5);
      setTimeout(() => { try { n.o.stop(); } catch (e) { /* already stopped */ } }, 3000);
    }
  },

  tick() {
    const ctx = Sfx.ctx;
    if (!ctx || ctx.state !== 'running' || !this.theme) return;
    const now = ctx.currentTime, th = this.theme, beat = 60 / (this.boss ? 112 : th.bpm);
    if (this.nextNote < now) this.nextNote = now + 0.3;   // after a suspend
    while (this.nextNote < now + 0.4) {
      if (Math.random() < th.density * (this.boss ? 0.6 : 1)) this.note(this.nextNote, th, beat);
      this.nextNote += beat * (this.boss ? 1 : [2, 2, 3, 4, 6][Math.floor(Math.random() * 5)]);
    }
    if (this.boss) {
      if (this.nextBeat < now) this.nextBeat = now + 0.1;
      while (this.nextBeat < now + 0.4) { this.drum(this.nextBeat, this.beatNo++ % 4); this.nextBeat += beat; }
    }
  },

  note(t, th, beat) {
    const ctx = Sfx.ctx;
    this.deg = Math.min(th.scale.length - 1, Math.max(0, this.deg + Math.floor(Math.random() * 5) - 2));
    const f = th.root * Math.pow(2, (th.scale[this.deg] + 24 + (Math.random() < 0.2 ? 12 : 0)) / 12);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = th.mel; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(this.boss ? 0.07 : 0.11, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(2.8, beat * 3));
    o.connect(g); g.connect(this.out); g.connect(this.echo);
    o.start(t); o.stop(t + 3);
  },

  drum(t, i) {
    const ctx = Sfx.ctx;
    if (i === 0 || i === 2) {   // low thump
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.3);
    }
    if (Sfx.noiseBuf) {   // a dry tick on the off beats, a heavier hit on 4
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = Sfx.noiseBuf; f.type = i === 3 ? 'bandpass' : 'highpass'; f.frequency.value = i === 3 ? 900 : 6000;
      g.gain.setValueAtTime(i === 3 ? 0.22 : 0.07, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (i === 3 ? 0.16 : 0.05));
      src.connect(f); f.connect(g); g.connect(this.out); src.start(t, Math.random() * 0.5); src.stop(t + 0.2);
    }
  },
};
