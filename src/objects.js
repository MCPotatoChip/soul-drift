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
  burst(x, y, color = 0xffffff, n = 14) { this.burstE.setParticleTint(color); this.burstE.explode(n, x, y); }
  spark(x, y, color = 0xffffff, n = 7) { this.sparkE.setParticleTint(color); this.sparkE.explode(n, x, y); }
  dust(x, y, n = 6) { this.dustE.explode(n, x, y); }
  motes(x, y, color = 0xbfe6ff, n = 10) { this.moteE.setParticleTint(color); this.moteE.explode(n, x, y); }
  debris(x, y, color, n = 8) { this.debrisE.setParticleTint(color); this.debrisE.explode(n, x, y); }

  afterimage(sprite, tint = 0x9fb4ff, alpha = 0.55, dur = 220) {
    const g = this.s.add.image(sprite.x, sprite.y, sprite.texture.key)
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

  shake(ms = 120, intensity = 0.006) { this.s.cameras.main.shake(ms, intensity); }
  flash(color = 0xffffff, ms = 120, alpha = 0.6) { this.s.game.events.emit('flash', { color, ms, alpha }); }
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
    this.prompt = 'Shop';
    // a little stall behind the merchant
    this.stall = scene.add.image(x + 18, feet - 12, 'stall').setDepth(6);
  }
  interact() { this.scene.openMenu('shop'); }
}

class Smith extends Phaser.GameObjects.Sprite {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'npc_smith', 'idle0');
    scene.add.existing(this);
    npcSprite(this, 'npc_smith');
    this.setDepth(7);
    this.prompt = 'Forge';
    this.anvil = scene.add.image(x + 17, feet - 7, 'anvil').setDepth(6);
    scene.time.addEvent({ delay: 1700, loop: true, callback: () => { if (this.active) scene.fx.spark(x + 17, feet - 14, 0xffb070, 4); } });
  }
  interact() { Sfx.play('clang'); this.scene.openMenu('forge'); }
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
    const style = NPC_STYLES[(info || {}).name] || 'npc_plus';
    super(scene, x, feet, style, 'idle0');
    scene.add.existing(this);
    npcSprite(this, style);
    this.setDepth(7);
    this.info = info || { name: 'Spirit', lines: ['...'] };
    this.prompt = 'Listen';
    if (STYLES[style].alpha) {   // souls hover a little
      scene.tweens.add({ targets: this, y: feet - 2, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.inOut' });
    }
  }
  interact() {
    this.setFlipX(this.scene.player.x < this.x);
    this.scene.startDialog(this.info.name, this.info.lines);
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
  konso: 0xbfe6ff, burst: 0xff8a3a, bankai: 0xe0303c, hollow: 0xf4f1ea, getsuga: 0x9ac8ff,
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
    const target = this.baseY + (1 - Math.cos(this.clock / this.period * Math.PI * 2)) / 2 * this.range;
    this.body.setVelocityY((target - this.y) / Math.max(dt, 1 / 240));
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
      const col = this.kind === 'hado' ? 0xff7a4a : this.kind === 'getsuga' && this.texture.key === 'getsuga' ? 0x9ac8ff : 0xc8202c;
      s.fx.motes(this.x, this.y, col, this.kind === 'getsuga' ? 3 : 1);
    }
    const fx = this.x + Math.sign(this.body.velocity.x) * 6;
    const t = s.solid.getTileAtWorldXY(fx, this.y);
    if (t && t.collides) {
      if (t.index === T.KIDO && this.kind === 'hado') s.breakCluster(t.x, t.y, T.KIDO);
      return this.kill(true);
    }
    const r = bodyRect(this.body);
    for (const e of s.enemies) {
      if (!e.alive || this.hit.has(e) || !e.hittable()) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(r, bodyRect(e.body))) {
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
    if (!this.passWalls && s.isSolidAt(this.x, this.y)) { s.fx.burst(this.x, this.y, 0xff8aa0, 6); return this.destroy(); }
    const p = s.player;
    if (p.state !== 'dead' && Phaser.Geom.Intersects.RectangleToRectangle(bodyRect(this.body), bodyRect(p.body))) {
      p.takeDamage(this.dmg, this.x);
      if (!this.pierce) this.destroy();
    }
  }
}
