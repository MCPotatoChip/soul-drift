'use strict';
// ---------------------------------------------------------------------------
// Visual effects helper + small world objects (pickups, gates, NPCs, shots)
// ---------------------------------------------------------------------------

function approach(v, target, delta) {
  if (v < target) return Math.min(v + delta, target);
  if (v > target) return Math.max(v - delta, target);
  return v;
}

function bodyRect(b) { return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height); }

// Generator runner used for boss scripts: `yield 0.5` waits seconds,
// `yield 0` waits a frame, `yield () => cond` waits until cond() is true.
class Co {
  constructor(gen) { this.gen = gen; this.wait = 0; this.cond = null; this.done = false; }
  tick(dt) {
    if (this.done) return;
    if (this.wait > 0) { this.wait -= dt; if (this.wait > 0) return; }
    if (this.cond) { if (!this.cond()) return; this.cond = null; }
    const r = this.gen.next();
    if (r.done) { this.done = true; return; }
    if (typeof r.value === 'number') this.wait = r.value;
    else if (typeof r.value === 'function') this.cond = r.value;
  }
}

class Fx {
  constructor(scene) {
    this.s = scene;
    const base = { lifespan: { min: 220, max: 480 }, scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 }, emitting: false };
    this.burstE = scene.add.particles(0, 0, 'px', Object.assign({ speed: { min: 40, max: 170 } }, base)).setDepth(26);
    this.sparkE = scene.add.particles(0, 0, 'spark', { speed: { min: 80, max: 220 }, lifespan: 180, scale: { start: 1, end: 0 }, emitting: false, blendMode: 'ADD' }).setDepth(26);
    this.dustE = scene.add.particles(0, 0, 'px', { speedX: { min: -50, max: 50 }, speedY: { min: -40, max: -5 }, lifespan: 320, alpha: { start: 0.55, end: 0 }, tint: 0xbbbbbb, emitting: false }).setDepth(19);
    this.moteE = scene.add.particles(0, 0, 'dot', { speed: { min: 10, max: 40 }, lifespan: 700, scale: { start: 0.6, end: 0 }, alpha: { start: 0.8, end: 0 }, emitting: false, blendMode: 'ADD' }).setDepth(26);
    this.debrisE = scene.add.particles(0, 0, 'px', { speed: { min: 60, max: 200 }, angle: { min: 200, max: 340 }, gravityY: 600, lifespan: 700, scale: { start: 1.5, end: 0.5 }, emitting: false }).setDepth(26);
  }
  // Every burst goes through Settings.count so the Particles setting (and phones) can thin them out
  burst(x, y, color = 0xffffff, n = 14) { this.burstE.setParticleTint(color); this.burstE.explode(Settings.count(n), x, y); }
  spark(x, y, color = 0xffffff, n = 7) { this.sparkE.setParticleTint(color); this.sparkE.explode(Settings.count(n), x, y); }
  dust(x, y, n = 6) { this.dustE.explode(Settings.count(n), x, y); }
  motes(x, y, color = 0xbfe6ff, n = 10) { this.moteE.setParticleTint(color); this.moteE.explode(Settings.count(n), x, y); }
  debris(x, y, color, n = 8) { this.debrisE.setParticleTint(color); this.debrisE.explode(Settings.count(n), x, y); }

  afterimage(sprite, tint = 0x9fb4ff, alpha = 0.55, dur = 220) {
    // Copy the exact frame, origin and scale: the ghost is a snapshot of the current pose
    const g = this.s.add.image(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name)
      .setOrigin(sprite.originX, sprite.originY).setScale(sprite.scaleX, sprite.scaleY)
      .setFlipX(sprite.flipX).setDepth(sprite.depth - 1).setAlpha(alpha).setTintFill(tint);
    this.s.tweens.add({ targets: g, alpha: 0, duration: dur, onComplete: () => g.destroy() });
  }

  ring(x, y, color = 0xffffff, radius = 30, dur = 300, width = 2) {
    const g = this.s.add.circle(x, y, 4).setStrokeStyle(width, color).setDepth(26);
    g.setFillStyle();
    this.s.tweens.add({ targets: g, radius, alpha: 0, duration: dur, onComplete: () => g.destroy() });
  }

  slashArc(x, y, dir, color = 0xffffff, scale = 1.4) {
    const s = this.s.add.image(x, y, 'slash').setDepth(24).setFlipX(dir < 0).setTint(color).setScale(scale);
    this.s.tweens.add({ targets: s, alpha: 0, duration: 160, onComplete: () => s.destroy() });
  }

  // Thin streaks thrown out of a point, biased toward `dir` (-1 / 1, or 0 for every way)
  impact(x, y, dir = 1, color = 0xffffff, n = 5, len = 22) {
    const count = Settings.count(n);
    for (let i = 0; i < count; i++) {
      const spread = dir ? Phaser.Math.FloatBetween(-0.95, 0.95) : Phaser.Math.FloatBetween(-Math.PI, Math.PI);
      const a = (dir < 0 ? Math.PI : 0) + spread, l = len * Phaser.Math.FloatBetween(0.6, 1.2);
      const g = this.s.add.image(x, y, 'px').setOrigin(0, 0.5).setRotation(a).setScale(l / 2, 0.6).setTint(color).setDepth(27).setBlendMode('ADD');
      this.s.tweens.add({ targets: g, x: x + Math.cos(a) * l * 1.5, y: y + Math.sin(a) * l * 1.5, scaleX: 0, alpha: 0, duration: Phaser.Math.Between(120, 200), ease: 'Cubic.out', onComplete: () => g.destroy() });
    }
  }
  // One call for "something was struck": sparks, directional streaks and a tiny ring
  hit(x, y, dirX = 1, color = 0xffffff, power = 1) {
    this.spark(x, y, color, Math.round(7 * power));
    this.impact(x, y, dirX, color, Math.round(5 * power), 18 + 8 * power);
    this.ring(x, y, color, 10 + 6 * power, 140, 1);
  }
  // Fragments that fly out, tumble and fall away: glass, bone, blade, sand
  shatter(x, y, colors, n = 16, spread = 90, fall = 60, dur = 1000) {
    const cols = [].concat(colors), count = Settings.count(n);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, d = spread * (0.35 + Math.random() * 0.65);
      const sh = this.s.add.image(x, y, 'px').setScale(Phaser.Math.Between(2, 5), Phaser.Math.Between(1, 3)).setTint(Phaser.Utils.Array.GetRandom(cols)).setDepth(28).setRotation(Math.random() * Math.PI);
      this.s.tweens.add({
        targets: sh, x: x + Math.cos(a) * d, y: { value: y + Math.sin(a) * d * 0.6 + fall, ease: 'Quad.in' },
        rotation: sh.rotation + Phaser.Math.FloatBetween(-6, 6), alpha: { value: 0, delay: dur * 0.45 }, duration: dur * Phaser.Math.FloatBetween(0.7, 1.2),
        ease: 'Cubic.out', onComplete: () => sh.destroy(),
      });
    }
  }
  // A soul-coloured glow that lifts and fades
  wisp(x, y, color = 0xbfe6ff, rise = 46) {
    const g = this.s.add.image(x, y, 'glow').setTint(color).setBlendMode('ADD').setDepth(26).setScale(0.7).setAlpha(0.8);
    this.s.tweens.add({ targets: g, y: y - rise, scale: 0.2, alpha: 0, duration: 900, ease: 'Sine.out', onComplete: () => g.destroy() });
  }
  // How an enemy comes apart: chunks in its own colour, a soul rising out, shake scaled to its size
  kill(e, dirX = 0) {
    const c = e.cfg.burst ?? 0xf4f1ea, big = e.maxHp >= 40;
    this.burst(e.x, e.y, c, big ? 20 : 12);
    this.debris(e.x, e.y - 4, c, big ? 12 : 7);
    this.motes(e.x, e.y, 0xbfe6ff, 16);
    this.impact(e.x, e.y, dirX, 0xffffff, big ? 8 : 5, 28);
    this.ring(e.x, e.y, 0xbfe6ff, big ? 44 : 30, 380, 2);
    this.wisp(e.x, e.y);
    this.shake(big ? 150 : 70, big ? 0.007 : 0.003);
  }
  // Two feathered wings snap out and fade (Hirenkyaku Wings)
  wings(x, y, color = 0xe8f4ff) {
    [-1, 1].forEach((side) => {
      const w = this.s.add.image(x + side * 3, y, 'wing').setOrigin(side < 0 ? 1 : 0, 0.7).setFlipX(side > 0).setTint(color)
        .setDepth(18).setBlendMode('ADD').setAlpha(0.9).setScale(0.3).setAngle(side * 30);
      this.s.tweens.add({ targets: w, scale: 1, angle: side * -8, y: y + 8, alpha: 0, duration: 340, ease: 'Cubic.out', onComplete: () => w.destroy() });
    });
  }
  // Small numbers over a struck enemy (only when the setting is on)
  damageNumber(x, y, dmg, color = '#ffffff') {
    if (Settings.get('damageNumbers')) this.s.game.events.emit('dmgnum', { x, y, text: String(Math.round(dmg)), color });
  }

  chain(x1, y1, x2, y2) {
    const g = this.s.add.graphics().setDepth(27);
    const draw = (a) => {
      g.clear();
      g.lineStyle(3, 0xffd75e, 0.35 * a); g.lineBetween(x1, y1, x2, y2);
      g.lineStyle(1, 0xfff3c0, a); g.lineBetween(x1, y1, x2, y2);
      const n = Math.max(2, Math.floor(Phaser.Math.Distance.Between(x1, y1, x2, y2) / 8));
      for (let i = 0; i <= n; i++) {
        g.fillStyle(0xffd75e, a);
        g.fillRect(x1 + (x2 - x1) * i / n - 1, y1 + (y2 - y1) * i / n - 1, 3, 3);
      }
    };
    const o = { a: 1 };
    draw(1);
    this.s.tweens.add({ targets: o, a: 0, duration: 380, onUpdate: () => draw(o.a), onComplete: () => g.destroy() });
  }

  floatText(x, y, text, color = '#cfe8ff') { this.s.game.events.emit('float', { x, y, text, color }); }

  shake(ms = 120, intensity = 0.006) {
    const k = Settings.shake();
    if (k > 0) this.s.cameras.main.shake(ms, intensity * k);
  }
  flash(color = 0xffffff, ms = 120, alpha = 0.6) {
    const k = Settings.flash();
    if (k > 0) this.s.game.events.emit('flash', { color, ms, alpha: alpha * k });
  }
  // A quick push in on the camera: weight for the big moments
  zoomPunch(amount = 0.05, ms = 220) {
    if (!Settings.shake()) return;
    const cam = this.s.cameras.main;
    this.s.tweens.killTweensOf(cam);
    cam.setZoom(ZOOM);
    this.s.tweens.add({ targets: cam, zoom: ZOOM * (1 + amount * Settings.shake()), duration: ms / 2, yoyo: true, ease: 'Sine.out', onComplete: () => cam.setZoom(ZOOM) });
  }
}

// ---------------------------------------------------------------------------
// Interactable / collectible world objects
// ---------------------------------------------------------------------------

class RestGate extends Phaser.GameObjects.Image {
  constructor(scene, x, feet) {
    super(scene, x, feet - 26, 'restgate');
    scene.add.existing(this);
    this.setDepth(6);
    this.feet = feet;
    this.prompt = 'Rest';
    this.glow = scene.add.image(x, feet - 24, 'glow').setScale(2.2, 3).setAlpha(0.18).setDepth(5).setTint(0xffe8b0);
    scene.tweens.add({ targets: this.glow, alpha: 0.32, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.inOut' });
  }
  interact() { this.scene.rest(this); }
}

// NPC sprites stand on their feet: origin sits on the sandal row of the frame
function npcSprite(obj, style) {
  obj.setOrigin(0.5, HF.FEET / HF.H);
  obj.play(style + ':idle');
  obj.anims.setProgress(Math.random());
}

class ShopKeeper extends Phaser.GameObjects.Sprite {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'npc_merchant', 'idle0');
    scene.add.existing(this);
    npcSprite(this, 'npc_merchant');
    this.setDepth(7).setFlipX(true);
    this.faces = true;
    this.prompt = 'Shop';
    // a little stall behind the merchant
    this.stall = scene.add.image(x + 18, feet - 12, 'stall').setDepth(6);
  }
  interact() { this.scene.openMenu('shop'); }
  // tips his hat with a little hop
  greet() { this.scene.tweens.add({ targets: this, y: this.y - 4, yoyo: true, duration: 120, ease: 'Quad.out', repeat: 1 }); }
}

class Smith extends Phaser.GameObjects.Sprite {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'npc_smith', 'idle0');
    scene.add.existing(this);
    npcSprite(this, 'npc_smith');
    this.setDepth(7);
    this.prompt = 'Forge';
    this.faces = true;
    this.anvil = scene.add.image(x + 17, feet - 7, 'anvil').setDepth(6);
    // the hammer swing: a lean into the blow, with sparks and a clang off the anvil
    scene.time.addEvent({ delay: 1700, loop: true, callback: () => {
      if (!this.active) return;
      scene.tweens.add({ targets: this, angle: { from: this.flipX ? 7 : -7, to: 0 }, duration: 190, ease: 'Quad.out' });
      scene.fx.spark(x + 17, feet - 14, 0xffb070, 4);
      scene.fx.impact(x + 17, feet - 14, 0, 0xffd0a0, 4, 10);
      if (Math.abs(scene.player.x - x) < 220) Sfx.play('clang');
    } });
  }
  interact() { Sfx.play('clang'); this.scene.openMenu('forge'); }
  greet() { this.scene.tweens.add({ targets: this, y: this.y - 2, yoyo: true, duration: 110, ease: 'Quad.out' }); }
}

// A Senkaimon hanging in the air (decoration marking a door to the Dangai)
class Portal extends Phaser.GameObjects.Image {
  constructor(scene, x, y) {
    super(scene, x, y, 'portal');
    scene.add.existing(this);
    this.setDepth(4).setAlpha(0.9);
    scene.tweens.add({ targets: this, alpha: 0.65, yoyo: true, repeat: -1, duration: 1300, ease: 'Sine.inOut' });
    scene.time.addEvent({ delay: 260, loop: true, callback: () => { if (this.active) scene.fx.motes(x + Phaser.Math.Between(-10, 10), y + 20, 0xc8a8ff, 1); } });
  }
}

class Npc extends Phaser.GameObjects.Sprite {
  constructor(scene, x, feet, info) {
    info = info || { name: 'Spirit', lines: ['...'] };
    const style = NPC_STYLES[info.name] || 'npc_plus';
    super(scene, x, feet, style, 'idle0');
    scene.add.existing(this);
    const creature = NPC_CREATURE[style];
    if (creature) { this.setOrigin(0.5, creature[1] / creature[0]); this.play(style + ':idle'); this.anims.setProgress(Math.random()); }
    else npcSprite(this, style);
    const sc = NPC_SCALE[style] || 1;
    this.setScale(sc).setDepth(sc > 1 ? 4 : 7);
    this.info = info;
    this.prompt = info.heals ? 'Be healed' : 'Listen';
    this.faces = true;
    if (STYLES[style] && STYLES[style].alpha) {   // souls hover a little
      scene.tweens.add({ targets: this, y: feet - 2, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.inOut' });
    }
    // someone with something to give glows faintly until they have given it
    if ((info.gives || info.seal) && !GS.data.gifts[info.name]) {
      this.glow = scene.add.image(x, feet - 14, 'glow').setTint(info.gives ? 0xbfe6ff : 0xffd75e).setBlendMode('ADD').setDepth(6).setAlpha(0.25).setScale(1.2);
      scene.tweens.add({ targets: this.glow, alpha: 0.5, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' });
    }
  }
  interact() {
    this.setFlipX(this.scene.player.x < this.x);
    this.scene.talkTo(this);
  }
}

class LostPlus extends Phaser.GameObjects.Sprite {
  constructor(scene, x, feet, key) {
    super(scene, x, feet, 'npc_lost', 'idle0');
    scene.add.existing(this);
    npcSprite(this, 'npc_lost');
    this.setDepth(7);
    this.key = key;
    this.prompt = 'Konso';
    this.faces = true;
    scene.tweens.add({ targets: this, alpha: 0.6, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.inOut' });
  }
  interact() {
    if (this.done) return;
    this.done = true;
    const s = this.scene;
    s.interactables = s.interactables.filter(i => i !== this);
    Sfx.play('konso');
    s.fx.motes(this.x, this.y, 0xe8f4ff, 20);
    for (let i = 0; i < 4; i++) {
      const b = s.add.sprite(this.x, this.y - 14, 'hellfly').play('hellfly:flap').setDepth(27);
      s.tweens.add({ targets: b, x: this.x + Phaser.Math.Between(-40, 40), y: this.y - Phaser.Math.Between(60, 110), alpha: 0, duration: 1600 + i * 200, ease: 'Sine.out', onComplete: () => b.destroy() });
    }
    s.tweens.killTweensOf(this);
    s.tweens.add({ targets: this, y: this.y - 50, alpha: 0, duration: 1200, onComplete: () => this.destroy() });
    s.onPlusSent(this.key);
  }
}

class Pickup extends Phaser.GameObjects.Image {
  // type: 'ability' | 'seal' | 'fragment'
  constructor(scene, x, y, type, id, key) {
    const tex = type === 'seal' ? 'sealitem' : type === 'fragment' ? 'fragment' : type === 'ore' ? 'ore' : 'pickup';
    super(scene, x, y, tex);
    scene.add.existing(this);
    this.type = type; this.id = id; this.key = key;
    this.setDepth(8);
    const color = type === 'ability' ? (PICKUP_COLORS[id] || 0xffffff) : type === 'seal' ? 0xffd75e : type === 'ore' ? 0xb89aff : 0xffffff;
    this.halo = scene.add.image(x, y, 'glow').setDepth(7).setTint(color).setAlpha(0.5).setScale(type === 'ability' ? 1.6 : 1);
    if (type === 'ability') this.setTint(color);
    scene.tweens.add({ targets: [this, this.halo], y: y - 4, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.inOut' });
    scene.tweens.add({ targets: this.halo, alpha: 0.2, yoyo: true, repeat: -1, duration: 700 });
    this.color = color;
  }
  collect() {
    this.scene.tweens.killTweensOf([this, this.halo]);
    this.halo.destroy();
    this.destroy();
  }
}

const PICKUP_COLORS = {
  dash: 0x9fb4ff, hado: 0xff6a4a, grip: 0x7fe8ff, bakudo: 0xffd75e, wings: 0xe8f4ff,
  konso: 0xbfe6ff, burst: 0xff8a3a, bankai: 0xe0303c, hollow: 0xf4f1ea, getsuga: 0x9ac8ff, raiko: 0xff4a30, compass: 0x7fe8ff,
};

class Shard extends Phaser.Physics.Arcade.Image {
  constructor(scene, x, y) {
    super(scene, x, y, 'shard');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(9);
    this.body.setSize(6, 8).setBounce(0.45, 0.4).setDragX(160).setMaxVelocity(400, 500);
    this.body.setVelocity(Phaser.Math.Between(-90, 90), Phaser.Math.Between(-240, -120));
    this.age = 0;
  }
  tick(dt, player) {
    this.age += dt;
    if (GS.sealOn('magnet') && this.age > 0.3) {
      const dx = player.x - this.x, dy = player.y - this.y, d = Math.hypot(dx, dy);
      if (d < 130) {
        this.body.setAllowGravity(false);
        this.body.setVelocity(dx / d * 220, dy / d * 220);
      } else this.body.setAllowGravity(true);
    }
  }
}

class Shade extends Phaser.GameObjects.Image {
  constructor(scene, x, y, amount) {
    super(scene, x, y, 'shade');
    scene.add.existing(this);
    this.setDepth(14).setAlpha(0.85);
    this.amount = amount;
    scene.tweens.add({ targets: this, y: y - 5, yoyo: true, repeat: -1, duration: 1000, ease: 'Sine.inOut' });
  }
}

class MovingPlatform extends Phaser.Physics.Arcade.Image {
  constructor(scene, x, topY, cfg) {
    super(scene, x, topY + 5, 'mplat');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(6);
    this.body.setAllowGravity(false).setImmovable(true);
    this.baseY = this.y;
    this.glow = scene.add.image(x, this.y + 6, 'glow').setDepth(5).setScale(2.2, 0.7).setTint(0xffe8a0).setAlpha(0.35);
    this.range = (cfg.dy || 6) * TILE;
    this.period = cfg.period || 2;
    this.clock = 0;
    this.boundT = 0;
  }
  tick(dt) {
    if (this.boundT > 0) {
      this.boundT -= dt;
      this.body.setVelocity(0, 0);
      if (this.boundT <= 0) this.clearTint();
      else if (this.boundT < 1 && Math.floor(this.boundT * 10) % 2 === 0) this.clearTint();
      else this.setTint(0xffd75e);
      return;
    }
    this.clock += dt;
    // Velocity comes straight from the motion curve (its derivative), so it does not depend on the
    // frame time. A small, clamped pull toward where the platform should be absorbs any drift. The old
    // "(target - y) / dt" fed position error back at full gain, which blew up whenever frames ran slow.
    const w = Math.PI * 2 / this.period;
    const target = this.baseY + (1 - Math.cos(this.clock * w)) / 2 * this.range;
    const v = (this.range / 2) * w * Math.sin(this.clock * w);
    this.body.setVelocityY(v + Phaser.Math.Clamp((target - this.y) * 5, -120, 120));
    this.glow.setPosition(this.x, this.y + 6);
  }
  bind(t) {
    this.boundT = t;
    this.setTint(0xffd75e);
    this.scene.fx.ring(this.x, this.y, 0xffd75e, 34, 400);
  }
}

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------

class PlayerShot extends Phaser.Physics.Arcade.Image {
  constructor(scene, x, y, key, vx, o = {}) {
    super(scene, x, y, key);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(22).setFlipX(vx < 0);
    this.body.setAllowGravity(false).setVelocity(vx, 0);
    this.body.setSize(o.w || 12, o.h || 12);
    this.dmg = o.dmg || 10; this.life = o.life || 1; this.kind = o.kind || 'hado';
    this.hit = new Set();
    this.trailT = 0;
    scene.pShots.push(this);
  }
  tick(dt) {
    const s = this.scene;
    this.life -= dt;
    if (this.life <= 0) return this.kill(false);
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.03;
      const col = this.kind === 'hado' ? 0xff7a4a : this.kind === 'raiko' ? 0xff3a2a : this.kind === 'getsuga' && this.texture.key === 'getsuga' ? 0x9ac8ff : 0xc8202c;
      s.fx.motes(this.x, this.y, col, this.kind === 'getsuga' ? 3 : 1);
    }
    const fx = this.x + Math.sign(this.body.velocity.x) * 6;
    const t = s.solid.getTileAtWorldXY(fx, this.y);
    if (t && t.collides) {
      if (t.index === T.KIDO && (this.kind === 'hado' || this.kind === 'getsuga')) s.breakCluster(t.x, t.y, T.KIDO);
      if (this.kind === 'raiko') return this.explode();
      return this.kill(true);
    }
    const r = bodyRect(this.body);
    for (const e of s.enemies) {
      if (!e.alive || this.hit.has(e) || !e.hittable()) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(r, bodyRect(e.body))) {
        if (this.kind === 'raiko') return this.explode();   // bursts on the first thing it meets
        this.hit.add(e);
        const res = e.hit(this.dmg, Math.sign(this.body.velocity.x), { kind: this.kind, spell: true });
        if (res === 'hit') { s.fx.spark(e.x, e.y, 0xffa060); Sfx.play('hit'); if (GS.run.maskOn) GS.run.hollow += 1; }
      }
    }
  }
  kill(fx) {
    if (fx) { this.scene.fx.burst(this.x, this.y, this.kind === 'hado' ? 0xff7a4a : 0xc8202c, 12); }
    this.destroy();
  }
  explode() {
    if (this.exploded) return;
    this.exploded = true;
    this.scene.raikoBlast(this.x, this.y, this.dmg);
    this.destroy();
  }
}

class EnemyShot extends Phaser.Physics.Arcade.Image {
  constructor(scene, x, y, key, vx, vy, o = {}) {
    super(scene, x, y, key);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(18);
    this.body.setAllowGravity(!!o.gravity).setVelocity(vx, vy);
    const size = o.size || 8;
    this.body.setSize(o.w || size, o.h || size);
    this.dmg = o.dmg || 1; this.life = o.life || 3; this.passWalls = !!o.passWalls; this.pierce = !!o.pierce;
    this.burstColor = o.burst ?? 0xff8aa0; this.debris = !!o.debris; this.splash = !!o.splash;
    this.owner = o.owner || null;   // set for shots fired by ordinary enemies: they hurt other enemies too
    if (o.rotate) this.setRotation(Math.atan2(vy, vx));
    if (o.flipX) this.setFlipX(true);
    if (o.scale) this.setScale(o.scale);
    if (o.tint) this.setTint(o.tint);
    scene.eShots.push(this);
  }
  tick(dt) {
    const s = this.scene;
    this.life -= dt;
    if (this.life <= 0) return this.destroy();
    if (!this.passWalls && s.isSolidAt(this.x, this.y)) {
      s.fx.burst(this.x, this.y, this.burstColor, 6);
      if (this.debris) { s.fx.debris(this.x, this.y, this.burstColor, 8); s.fx.dust(this.x, this.y, 6); s.fx.shake(90, 0.004); Sfx.play('break'); }
      // acid lands in a puddle that burns for a moment
      if (this.splash && this.body.velocity.y > 0) {
        const top = Math.floor(this.y / TILE) * TILE;
        s.addHurt(this.x - 10, top - 8, 20, 8, 1, 0.5);
        const pool = s.add.image(this.x, top, 'glow').setTint(this.burstColor).setBlendMode('ADD').setDepth(17).setScale(1, 0.25).setAlpha(0.7);
        s.tweens.add({ targets: pool, alpha: 0, scaleX: 1.4, duration: 600, onComplete: () => pool.destroy() });
        s.fx.motes(this.x, top - 3, this.burstColor, 5);
      }
      return this.destroy();
    }
    // The first enemy it meets takes the blast and the shot is spent, so a line of enemies is not wiped out
    if (this.owner) {
      const victim = s.friendlyHit(bodyRect(this.body), this.owner, FRIENDLY.shot, Math.sign(this.body.velocity.x), new Set());
      if (victim) { s.fx.burst(this.x, this.y, this.burstColor, 8); return this.destroy(); }
    }
    const p = s.player;
    if (p.state !== 'dead' && Phaser.Geom.Intersects.RectangleToRectangle(bodyRect(this.body), bodyRect(p.body))) {
      p.takeDamage(this.dmg, this.x);
      if (!this.pierce) this.destroy();
    }
  }
}


// ---------------------------------------------------------------------------
// Hazards: things in the room that act on their own timer. The scene ticks them.
// ---------------------------------------------------------------------------

// A reishi vent in the floor: it steams, rumbles, then blasts a column straight up
class Geyser extends Phaser.GameObjects.Image {
  constructor(scene, x, feet) {
    super(scene, x, feet - 2, 'vent');
    scene.add.existing(this);
    this.setDepth(6);
    this.feet = feet; this.homeX = x;
    this.period = 3.6;
    this.clock = Math.random() * this.period;   // so neighbouring vents are out of step
    this.col = scene.add.graphics().setDepth(17).setBlendMode('ADD');
    this.color = REGIONS[scene.region].color;
    this.glow = scene.add.image(x, feet - 2, 'glow').setTint(this.color).setBlendMode('ADD').setDepth(6).setScale(0.8, 0.4).setAlpha(0);
    this.puff = 0; this.fired = false;
    scene.hazards.push(this);
  }
  tick(dt) {
    const s = this.scene;
    this.clock = (this.clock + dt) % this.period;
    const t = this.clock, x = this.homeX;
    this.setX(x);
    this.col.clear();
    if (t < 1.7) {                      // idle: thin steam
      this.fired = false;
      this.glow.setAlpha(0.15);
      this.puff -= dt;
      if (this.puff <= 0) { this.puff = 0.35; s.fx.motes(x + Phaser.Math.Between(-3, 3), this.feet - 4, this.color, 1); }
    } else if (t < 2.5) {               // warning: it shakes and brightens
      const k = (t - 1.7) / 0.8;
      this.glow.setAlpha(0.2 + 0.5 * k);
      this.setX(x + (Math.random() - 0.5) * 1.5 * k);
      this.puff -= dt;
      if (this.puff <= 0) { this.puff = 0.07; s.fx.dust(x + Phaser.Math.Between(-5, 5), this.feet - 3, 1); s.fx.motes(x, this.feet - 4, this.color, 1); }
      if (t - dt < 1.7) Sfx.play('geyser');
    } else if (t < 3.4) {               // the blast
      if (!this.fired) {
        this.fired = true;
        s.addHurt(x - 7, this.feet - 88, 14, 88, 1, 0.9);
        s.fx.shake(160, 0.005);
        s.fx.ring(x, this.feet - 4, this.color, 26, 300, 2);
      }
      const k = Math.min(1, (t - 2.5) / 0.12) * (1 - Math.max(0, (t - 3.15) / 0.25));
      const h = 88 * k;
      this.col.fillStyle(this.color, 0.22 * k).fillRect(x - 8, this.feet - h, 16, h);
      this.col.fillStyle(0xffffff, 0.4 * k).fillRect(x - 3, this.feet - h, 6, h);
      this.glow.setAlpha(0.8);
      this.puff -= dt;
      if (this.puff <= 0) { this.puff = 0.04; s.fx.motes(x + Phaser.Math.Between(-5, 5), this.feet - Phaser.Math.Between(4, 80), 0xffffff, 1); }
    } else this.glow.setAlpha(0.1);
  }
}

// A stalactite hanging from the ceiling: it shakes loose when you pass beneath, then grows back
class Stalactite extends Phaser.GameObjects.Image {
  constructor(scene, x, topY) {
    super(scene, x, topY, 'rock');
    scene.add.existing(this);
    this.setOrigin(0.5, 0).setDepth(13);
    this.home = { x, y: topY };
    this.mode = 'hang'; this.t = 0;
    scene.hazards.push(this);
  }
  tick(dt) {
    const s = this.scene, p = s.player, dx = p.x - this.home.x, dy = p.y - this.home.y;
    this.t -= dt;
    switch (this.mode) {
      case 'hang':
        if (Math.abs(dx) < 22 && dy > 24 && dy < 280 && p.state !== 'dead') { this.mode = 'shake'; this.t = 0.5; Sfx.play('telegraph'); }
        break;
      case 'shake':
        this.x = this.home.x + (Math.random() - 0.5) * 2.2;
        if (Math.random() < 0.3) s.fx.dust(this.home.x + Phaser.Math.Between(-5, 5), this.home.y + 2, 1);
        if (this.t <= 0) {
          this.mode = 'gone'; this.t = 6; this.setVisible(false);
          new EnemyShot(s, this.home.x, this.home.y + 9, 'rock', 0, 40, { gravity: true, dmg: 1, w: 8, h: 14, life: 3, burst: 0x8a8494, debris: true });
          s.fx.burst(this.home.x, this.home.y + 4, 0x8a8494, 6);
        }
        break;
      case 'gone':
        if (this.t <= 0) { this.mode = 'hang'; this.x = this.home.x; this.setVisible(true).setAlpha(0); s.tweens.add({ targets: this, alpha: 1, duration: 600 }); }
        break;
    }
  }
}
