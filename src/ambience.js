'use strict';
// ---------------------------------------------------------------------------
// Atmosphere: each region gets its own drifting particles, light, and small
// living details. Emitters sit in "view space" (scrollFactor 0): x 320..960,
// y 180..540 maps onto the screen, the same space the parallax layers use, so a
// room feels alive wherever the camera is. Everything respects the Particles
// setting (density) and costs nothing when it is turned down.
// ---------------------------------------------------------------------------

const VX0 = VIEW_W / 2, VX1 = VIEW_W / 2 + VIEW_W, VY0 = VIEW_H / 2, VY1 = VIEW_H / 2 + VIEW_H;

// freq: ms between particles at "normal" density. add: additive blending.
const AMBIENCE = {
  kar: {   // night town: reishi fireflies, and the odd hell butterfly passing through
    emitters: [
      { tex: 'dot', freq: 300, life: 8000, add: true, cfg: { speed: { min: 4, max: 14 }, angle: { min: 0, max: 360 }, scale: { start: 0.55, end: 0.1 }, alpha: { start: 0.75, end: 0 }, tint: 0xbfe6ff } },
      { tex: 'dot', freq: 900, life: 9000, add: true, cfg: { speed: { min: 3, max: 8 }, angle: { min: 250, max: 290 }, scale: { start: 0.9, end: 0.3 }, alpha: { start: 0.35, end: 0 }, tint: 0xf3e9d2 } },
    ],
    flyers: true,
  },
  ruk: {   // dusk slums: warm dust on a steady wind
    emitters: [
      { tex: 'dot', freq: 130, life: 5200, add: true, cfg: { speedX: { min: -34, max: -14 }, speedY: { min: -6, max: 8 }, scale: { start: 0.45, end: 0.1 }, alpha: { start: 0.55, end: 0 }, tint: 0xf0c080 } },
      { tex: 'px', freq: 700, life: 4200, cfg: { speedX: { min: -70, max: -45 }, speedY: { min: 4, max: 16 }, scaleX: { start: 5, end: 3 }, scaleY: 0.5, alpha: { start: 0.18, end: 0 }, tint: 0xf0d2a0 } },
    ],
  },
  sei: {   // sunlit barracks: drifting petals and long light shafts
    emitters: [
      { tex: 'px', freq: 420, life: 8000, cfg: { speedX: { min: -34, max: -10 }, speedY: { min: 10, max: 26 }, scaleX: { start: 3, end: 2 }, scaleY: 2, rotate: { start: 0, end: 360 }, alpha: { start: 0.85, end: 0.2 }, tint: [0xffd4dc, 0xffe6ea, 0xf6b8c8] } },
    ],
    shafts: true,
  },
  sok: {   // the execution grounds: embers climbing, a far-off storm
    emitters: [
      { tex: 'spark', freq: 100, life: 3600, add: true, y: { min: VY0 + 120, max: VY1 + 10 }, cfg: { speedY: { min: -46, max: -16 }, speedX: { min: -16, max: 10 }, scale: { start: 0.55, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: [0xff7040, 0xff9a50, 0xffc070] } },
    ],
    lightning: 0xff7a60,
  },
  hm: {    // white sand under a pale moon: wind streaks, drifting grit
    emitters: [
      { tex: 'px', freq: 150, life: 2600, x: { min: VX1, max: VX1 + 14 }, cfg: { speedX: { min: -330, max: -190 }, speedY: { min: -8, max: 10 }, scaleX: { start: 9, end: 4 }, scaleY: 0.5, alpha: { start: 0.28, end: 0 }, tint: 0xdde4f4 } },
      { tex: 'dot', freq: 260, life: 6000, add: true, cfg: { speedX: { min: -30, max: -12 }, speedY: { min: -4, max: 6 }, scale: { start: 0.4, end: 0.1 }, alpha: { start: 0.4, end: 0 }, tint: 0xb8c4dc } },
    ],
    lightning: 0xffa0b8,
  },
  end: {   // the Inner World: a steady wind across the fallen towers, motes of light riding it
    emitters: [
      { tex: 'px', freq: 120, life: 2400, x: { min: VX0 - 14, max: VX0 }, cfg: { speedX: { min: 220, max: 360 }, speedY: { min: -6, max: 6 }, scaleX: { start: 10, end: 4 }, scaleY: 0.5, alpha: { start: 0.3, end: 0 }, tint: 0xffffff } },
      { tex: 'dot', freq: 260, life: 6000, add: true, cfg: { speedX: { min: 30, max: 70 }, speedY: { min: -10, max: 4 }, scale: { start: 0.6, end: 0.1 }, alpha: { start: 0.7, end: 0 }, tint: [0xffffff, 0xd8ecff] } },
    ],
  },
  dan: {   // the Dangai: reishi streaming through the precipice world
    emitters: [
      { tex: 'dot', freq: 80, life: 4200, add: true, cfg: { speedX: { min: -90, max: -40 }, speedY: { min: -14, max: 14 }, scale: { start: 1.1, end: 0.2 }, alpha: { start: 0.5, end: 0 }, tint: [0xb89aff, 0x9a7ad8, 0xd8c8ff] } },
      { tex: 'spark', freq: 400, life: 3000, add: true, cfg: { speedX: { min: -120, max: -70 }, speedY: { min: -6, max: 6 }, scale: { start: 0.5, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: 0xe6d8ff } },
    ],
  },
  for: {   // under the sand: mist drifting between the stems, slow drips
    emitters: [
      { tex: 'glow', freq: 1000, life: 10000, add: true, cfg: { speedX: { min: 4, max: 12 }, scale: { start: 2.6, end: 3.4 }, alpha: { start: 0.07, end: 0 }, tint: 0x8aaa9a } },
      { tex: 'px', freq: 360, life: 1100, y: { min: VY0, max: VY0 + 140 }, cfg: { speedY: { min: 150, max: 230 }, speedX: 0, scaleX: 0.7, scaleY: { start: 3, end: 1.5 }, alpha: { start: 0.5, end: 0 }, tint: 0x9ac0b0 } },
      { tex: 'dot', freq: 520, life: 6000, add: true, cfg: { speedX: { min: -8, max: 8 }, speedY: { min: -6, max: 6 }, scale: { start: 0.5, end: 0.1 }, alpha: { start: 0.6, end: 0 }, tint: 0xa8ffd8 } },
    ],
  },
};

class Ambience {
  constructor(scene, region) {
    this.s = scene;
    this.glows = {};      // "x,y" -> glow image, for seal and gate tiles
    this.cfg = AMBIENCE[region] || {};
    this.buildEmitters();
    if (this.cfg.shafts) this.buildShafts();
    if (this.cfg.flyers) this.scheduleFlyer(4000);
    if (this.cfg.lightning) this.scheduleLightning();
    this.buildSealGlows();
    this.scheduleGlints();
    this.liftLights();
  }

  buildEmitters() {
    const s = this.s, dens = Math.max(0.2, Settings.get('particles'));
    (this.cfg.emitters || []).forEach(e => {
      const conf = Object.assign({
        x: e.x || { min: VX0, max: VX1 }, y: e.y || { min: VY0, max: VY1 },
        lifespan: e.life, frequency: Math.round(e.freq / dens), quantity: 1,
      }, e.cfg);
      if (e.add) conf.blendMode = 'ADD';
      const em = s.add.particles(0, 0, e.tex, conf).setScrollFactor(0).setDepth(e.depth || 25);
      // Start the room already full of particles instead of filling in over a few seconds
      if (em.fastForward) em.fastForward(Math.min(e.life * 0.75, 5000));
    });
  }

  // Slanted bars of light that breathe, drifting a little against the camera
  buildShafts() {
    const s = this.s;
    [[0.18, 0.1, 0.7], [0.42, 0.07, 1.0], [0.66, 0.09, 0.8], [0.86, 0.06, 1.2]].forEach(([fx, a, sc], i) => {
      const img = s.add.image(VX0 + VIEW_W * fx, VY0 + VIEW_H / 2, 'shaft').setScrollFactor(0.04 * (i + 1)).setDepth(24)
        .setBlendMode('ADD').setAlpha(a).setRotation(0.32).setScale(sc * 1.2, 2.4).setTint(0xfff0d0);
      s.tweens.add({ targets: img, alpha: a * 0.35, duration: 3200 + i * 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    });
  }

  // A hell butterfly crosses the view every so often
  scheduleFlyer(delay) {
    const s = this.s;
    s.time.delayedCall(delay, () => {
      if (!s.sys.isActive()) return;
      const y0 = Phaser.Math.Between(VY0 + 40, VY0 + 220), dir = Math.random() < 0.5 ? 1 : -1;
      const bf = s.add.sprite(dir > 0 ? VX0 - 20 : VX1 + 20, y0, 'hellfly').play('hellfly:flap').setScrollFactor(0).setDepth(23).setScale(1.3).setAlpha(0.85).setFlipX(dir < 0);
      s.tweens.add({
        targets: bf, x: dir > 0 ? VX1 + 20 : VX0 - 20, duration: Phaser.Math.Between(11000, 17000),
        onUpdate: (tw) => { bf.y = y0 + Math.sin(tw.progress * Math.PI * 7) * 16; },
        onComplete: () => bf.destroy(),
      });
      this.scheduleFlyer(Phaser.Math.Between(9000, 18000));
    });
  }

  // Distant light in the clouds: a faint flash, never harsh
  scheduleLightning() {
    const s = this.s;
    s.time.delayedCall(Phaser.Math.Between(7000, 15000), () => {
      if (!s.sys.isActive()) return;
      s.fx.flash(this.cfg.lightning, 260, 0.09);
      s.time.delayedCall(140, () => s.fx.flash(this.cfg.lightning, 200, 0.06));
      this.scheduleLightning();
    });
  }

  // Kido seals, Senkaimon gates and Bankai doors glow, so you can see what is breakable
  buildSealGlows() {
    const s = this.s, spec = { [T.KIDO]: [0xc8a8ff, 0.5], [T.GATE]: [0xff8a3a, 0.45], [T.BANKAI]: [0xc8202c, 0.55] };
    s.solid.forEachTile((t) => {
      const sp = spec[t.index];
      if (!sp) return;
      const g = s.add.image(t.pixelX + TILE / 2, t.pixelY + TILE / 2, 'glow').setTint(sp[0]).setBlendMode('ADD').setDepth(6).setScale(0.95).setAlpha(sp[1] * 0.5);
      s.tweens.add({ targets: g, alpha: sp[1], duration: 900 + ((t.x * 7 + t.y * 13) % 5) * 160, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.glows[t.x + ',' + t.y] = g;
    }, null, 0, 0, s.W, s.H, { isNotEmpty: true });
  }
  clearCell(x, y) {
    const g = this.glows[x + ',' + y];
    if (g) { this.s.tweens.killTweensOf(g); g.destroy(); delete this.glows[x + ',' + y]; }
  }

  // Byakuya's Bankai: blade petals drift across the whole arena for the rest of the fight
  petalStorm() {
    const s = this.s, dens = Math.max(0.3, Settings.get('particles'));
    const em = s.add.particles(0, 0, 'petal', {
      x: { min: VX0, max: VX1 }, y: { min: VY0 - 10, max: VY0 }, speedX: { min: -50, max: 20 }, speedY: { min: 20, max: 60 }, lifespan: 7000,
      rotate: { start: 0, end: 360 }, scale: { start: 1.2, end: 0.6 }, alpha: { start: 0.8, end: 0 }, frequency: Math.round(70 / dens), tint: [0xffc0d8, 0xff90b8, 0xffe0ea], blendMode: 'ADD',
    }).setScrollFactor(0).setDepth(25);
    if (em.fastForward) em.fastForward(3000);
  }

  // A glint runs along the spikes now and then
  scheduleGlints() {
    const s = this.s;
    const spikes = s.hazLayer.filterTiles(t => t.index >= 0);
    if (!spikes.length) return;
    s.time.addEvent({
      delay: 700, loop: true, callback: () => {
        const view = s.cameras.main.worldView;
        for (let tries = 0; tries < 6; tries++) {
          const t = spikes[Phaser.Math.Between(0, spikes.length - 1)];
          if (t.pixelX > view.x && t.pixelX < view.right && t.pixelY > view.y && t.pixelY < view.bottom) {
            s.fx.spark(t.pixelX + Phaser.Math.Between(3, 13), t.pixelY + 7, 0xffffff, 1);
            break;
          }
        }
      },
    });
  }

  // In dark regions, things that give light shine through the darkness
  liftLights() {
    const s = this.s;
    if (!(REGIONS[s.region].dark > 0)) return;
    const lift = (img) => { if (img && img.setBlendMode) img.setDepth(41).setBlendMode('ADD'); };
    s.interactables.forEach(i => lift(i.glow));
    s.pickups.forEach(p => lift(p.halo));
    s.platforms.forEach(p => lift(p.glow));
  }
}
