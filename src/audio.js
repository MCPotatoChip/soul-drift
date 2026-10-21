'use strict';
// ---------------------------------------------------------------------------
// Tiny WebAudio synth for placeholder sound effects. No audio files needed.
// The context starts on the first key press (browsers block autoplay).
// ---------------------------------------------------------------------------

const Sfx = {
  ctx: null, out: null, noiseBuf: null, enabled: true, last: {},

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.26;
      this.out.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
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
    }
  },
};

window.addEventListener('keydown', () => Sfx.init());
window.addEventListener('pointerdown', () => Sfx.init());
