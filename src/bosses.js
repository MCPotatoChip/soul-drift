'use strict';
// ---------------------------------------------------------------------------
// Bosses. Each attack is a generator: `yield 0.4` waits, `yield 0` waits one
// frame, `yield () => cond` waits for a condition. Phase changes swap the
// running coroutine.
// ---------------------------------------------------------------------------

class Boss extends Enemy {
  constructor(scene, x, feetY, key, cfg) {
    super(scene, x, feetY, key, cfg);
    this.isBoss = true;
    this.id = cfg.id;
    this.fighting = false;
    this.invulnerable = true;
    this.kbRes = 0;
    this.phase = 1;
    this.spd = 1;
    this.ai = null;
    this.gfx = scene.add.graphics().setDepth(30);
    this.poseName = null; this.poseT = 0;
  }
  // Hold an animation clip for a while (wind-ups, strikes, casts)
  setPose(name, t = 0.3) { this.poseName = name; this.poseT = t; this.anim(name); }
  defaultPose() {
    if (!this.body.allowGravity) return 'idle';
    if (!this.body.blocked.down) return this.body.velocity.y < 0 ? 'jump' : 'fall';
    return Math.abs(this.body.velocity.x) > 20 ? 'run' : 'idle';
  }
  afterTick(dt) {
    if (this.poseT > 0) { this.poseT -= dt; this.anim(this.poseName); return; }
    this.anim(this.defaultPose(), this.defaultPose() === 'run' ? 1.4 : 1);
  }
  activate() {
    this.fighting = true;
    this.invulnerable = false;
    this.ai = new Co(this.brain());
  }
  get arena() { return this.scene.arena; }
  get player() { return this.scene.player; }
  think(dt) {
    if (!this.fighting) { this.body.setVelocityX(0); return; }
    if (this.ai) this.ai.tick(dt);
    this.checkPhase && this.checkPhase();
  }
  hit(dmg, dirX, o = {}) {
    if (!this.fighting) return 'none';
    const r = super.hit(dmg, dirX, Object.assign({}, o, { knock: false }));
    if (r === 'hit') this.scene.game.events.emit('boss-hp', Math.max(0, this.hp / this.maxHp));
    return r;
  }
  bind(t) { super.bind(Math.min(t * 0.3, 1.2)); }
  setScript(gen) { this.ai = new Co(gen); }
  face() { this.faceTo(this.player.x); }
  *wait(t) { yield t / this.spd; }
  *tele(t, color = 0xff6060, pose = this.telePose) {
    if (pose) this.setPose(pose, t / this.spd + 0.02);
    this.telegraph(color);
    Sfx.play('telegraph');
    yield t / this.spd;
    this.untelegraph();
  }
  // Teleport with afterimages (sonido / flash step)
  *blink(x, y) {
    this.scene.fx.afterimage(this, 0xffffff, 0.6, 250);
    this.setAlpha(0.12);
    this.invulnerable = true;
    Sfx.play('dash');
    yield 0.2 / this.spd;
    this.body.reset(Phaser.Math.Clamp(x, this.arena.left + 8, this.arena.right - 8), y);
    this.setAlpha(1);
    this.invulnerable = false;
    this.face();
  }
  floorY() { return this.arena.floor - this.body.height / 2; }
  *beam(ox, oy, angle, dur, sweep = 0, width = 12, len = 720) {
    const g = this.gfx;
    let e = 0;
    Sfx.play('cero');
    this.scene.fx.shake(dur * 1000, 0.006);
    while (e < dur) {
      e += this.dt;
      const o = typeof ox === 'function' ? ox() : { x: ox, y: oy };
      const a = angle + sweep * (e / dur);
      const x2 = o.x + Math.cos(a) * len, y2 = o.y + Math.sin(a) * len;
      g.clear();
      g.lineStyle(width + 8, 0xff2a50, 0.35); g.lineBetween(o.x, o.y, x2, y2);
      g.lineStyle(width, 0xff4a70, 0.9); g.lineBetween(o.x, o.y, x2, y2);
      g.lineStyle(width * 0.4, 0xffe0ea, 1); g.lineBetween(o.x, o.y, x2, y2);
      this.scene.beamHit(o.x, o.y, x2, y2, width / 2, 1);
      yield 0;
    }
    g.clear();
  }
  *aimLine(ox, oy, angle, t) {
    const g = this.gfx;
    let e = 0;
    while (e < t) {
      e += this.dt;
      g.clear();
      g.lineStyle(1, 0xff3050, 0.4 + 0.4 * Math.abs(Math.sin(e * 30)));
      g.lineBetween(ox, oy, ox + Math.cos(angle) * 720, oy + Math.sin(angle) * 720);
      yield 0;
    }
    g.clear();
  }
  die(dirX) {
    this.alive = false;
    this.fighting = false;
    this.body.enable = false;
    this.gfx.clear();
    const s = this.scene;
    s.eShots.forEach(p => p.active && p.destroy());
    s.hurtBoxes.length = 0;
    Sfx.play('roar');
    s.hitStop(0.4);
    s.fx.shake(900, 0.015);
    s.fx.flash(0xffffff, 400, 0.7);
    this.onDie && this.onDie();
    let n = 0;
    s.time.addEvent({
      delay: 120, repeat: 8, callback: () => {
        n++;
        s.fx.burst(this.x + Phaser.Math.Between(-20, 20), this.y + Phaser.Math.Between(-30, 20), n % 2 ? 0xffffff : 0x17161f, 20);
        Sfx.play('hit');
      },
    });
    s.tweens.add({ targets: this, alpha: 0, delay: 900, duration: 600, onComplete: () => { this.gfx.destroy(); this.destroy(); } });
    s.onBossDefeated(this);
  }
}

// ---------------------------------------------------------------------------
class Menos extends Boss {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'menos', { id: 'menos', hp: 125, dmg: 1, drop: 20, bw: 40, bh: 100, kind: 'menos', frame: 'idle0', frameFeet: 120 });
    this.telePose = 'crouch';
    this.anim('idle');
    this.orb = scene.add.image(x, this.y, 'cero_orb').setDepth(29).setVisible(false);
  }
  mouth() { return { x: this.x + this.facing * 39, y: this.y - 43 }; }
  defaultPose() { return 'idle'; }
  *brain() {
    yield 0.6;
    for (;;) {
      this.face();
      const close = Math.abs(this.player.x - this.x) < 70;
      let opts = close ? ['swipe', 'swipe', 'stomp'] : ['stomp', 'cero', 'summon', 'walk', 'cero', 'walk'];
      if (this.phase === 2) opts = close ? ['swipe', 'stomp'] : ['stomp', 'cero', 'cero', 'summon', 'stomp'];
      let pick = Phaser.Utils.Array.GetRandom(opts);
      if (pick === 'summon' && this.scene.countEnemies('hollow') >= 2) pick = 'stomp';
      yield* this[pick]();
      yield this.phase === 2 ? 0.3 : 0.65;
    }
  }
  *walk() {
    let t = 1.0;
    while (t > 0) {
      t -= this.dt;
      this.face();
      this.body.setVelocityX(this.facing * (this.phase === 2 ? 55 : 35));
      yield 0;
    }
    this.body.setVelocityX(0);
  }
  *stomp() {
    const n = this.phase === 2 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      this.face();
      yield* this.tele(0.5);
      const p = this.player;
      this.body.setVelocity(Phaser.Math.Clamp((p.x - this.x) * 1.3, -200, 200), -520);
      yield 0.15;
      yield () => this.body.blocked.down;
      this.body.setVelocityX(0);
      this.scene.fx.shake(220, 0.012);
      Sfx.play('break');
      this.scene.fx.dust(this.x, this.body.bottom, 16);
      this.scene.spawnShock(this.x - 22, this.body.bottom, -1);
      this.scene.spawnShock(this.x + 22, this.body.bottom, 1);
      yield 0.35;
    }
  }
  *cero() {
    this.face();
    const m = this.mouth();
    const p = this.player;
    let ang = Math.atan2(p.y - m.y, p.x - m.x);
    if (Math.cos(ang) * this.facing < 0.25) ang = this.facing > 0 ? 0.3 : Math.PI - 0.3;
    this.orb.setPosition(m.x, m.y).setVisible(true).setScale(0.2);
    this.scene.tweens.add({ targets: this.orb, scale: 1.2, duration: 800 });
    this.setPose('cero', 1.5);
    yield* this.aimLine(m.x, m.y, ang, 0.85);
    const sweep = this.phase === 2 ? -Math.sign(Math.cos(ang)) * 0.5 : 0;
    yield* this.beam(m.x, m.y, ang, 0.55, sweep, 12);
    this.orb.setVisible(false);
    yield 0.3;
  }
  *summon() {
    this.telegraph(0xb080ff);
    this.setPose('cero', 0.7);
    Sfx.play('roar');
    this.scene.fx.shake(500, 0.006);
    yield 0.7;
    this.untelegraph();
    for (const off of [-50, 50]) {
      const h = new Hollow(this.scene, this.x + off, this.y - 70);
      h.hp = h.maxHp = 5;   // summons die to one slash and refill Reiatsu
      h.mode = 'chase';
      this.scene.fx.burst(h.x, h.y, 0x17161f, 12);
    }
    yield 0.4;
  }
  *swipe() {
    this.face();
    yield* this.tele(0.45);
    const f = this.facing;
    this.scene.addHurt(this.x + (f > 0 ? 0 : -74), this.y - 10, 74, 60, 1, 0.16);
    this.scene.fx.slashArc(this.x + f * 40, this.y + 18, f, 0xffffff, 2.2);
    Sfx.play('slash');
    yield 0.55;
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) { this.phase = 2; this.setScript(this.enrage()); }
  }
  *enrage() {
    this.body.setVelocityX(0);
    this.gfx.clear(); this.orb.setVisible(false);
    this.invulnerable = true;
    this.telegraph(0xff4040);
    Sfx.play('roar');
    this.scene.fx.shake(700, 0.012);
    this.scene.fx.floatText(this.x, this.y - 70, 'A hundred voices howl at once.', '#ffb0b0');
    yield 1.0;
    this.untelegraph();
    this.invulnerable = false;
    yield* this.brain();
  }
  onDie() { this.orb.destroy(); }
}

// ---------------------------------------------------------------------------
// Swordsman boss shared by the Rogue Captain and the Fallen Vizard
class SwordBoss extends Boss {
  constructor(scene, x, feet, cfg) {
    super(scene, x, feet, cfg.key, Object.assign({ bw: 12, bh: 26, dmg: 1, frame: 'idle0', frameFeet: HF.FEET }, cfg));
    this.telePose = 'windup';
    this.anim('idle');
    this.waveKey = cfg.waveKey || 'wave_w';
    this.moves = cfg.moves;
    this.waves = cfg.waves || 2;
    this.guarding = false; this.countered = false;
    this.aura = scene.add.particles(0, 0, 'dot', {
      speed: { min: 10, max: 50 }, angle: { min: 250, max: 290 }, lifespan: 600,
      scale: { start: 0.8, end: 0 }, alpha: { start: 0.7, end: 0 }, frequency: 50, emitting: false, tint: 0x8a7cff,
    }).setDepth(14);
    this.aura.startFollow(this, 0, 8);
  }
  *brain() {
    yield 0.5;
    for (;;) {
      const close = Math.abs(this.player.x - this.x) < 70;
      const list = this.moves.filter(m => (close ? m.near : m.far)).flatMap(m => Array(m.w).fill(m.name));
      yield* this[Phaser.Utils.Array.GetRandom(list)]();
      yield 0.4 / this.spd;
    }
  }
  // Swap to another form's sheet (bankai, mask) without losing the current clip
  setSheet(key) { const cur = this.anims.currentAnim && this.anims.currentAnim.key.split(':')[1]; this.sheet = key; this.setTexture(key, 'idle0'); this.anims.stop(); if (cur) this.anim(cur); }
  slashBox(w = 34, h = 26, dur = 0.12) {
    const f = this.facing;
    this.setPose('strike', 0.24);
    this.scene.addHurt(0, 0, w, h, 1, dur, (hb) => { hb.x = this.x + (f > 0 ? 0 : -w); hb.y = this.y - h / 2; });
    this.scene.fx.slashArc(this.x + f * 16, this.y, f, this.phase >= 3 ? 0xff4050 : 0xffffff, 1.1);
    Sfx.play('slash');
  }
  *dashSlash() {
    this.face();
    yield* this.tele(0.38, 0xffffff);
    const dir = this.facing;
    let t = 0.36;
    const hb = this.scene.addHurt(0, 0, 32, 24, 1, t, (h) => { h.x = this.x + (dir > 0 ? -6 : -26); h.y = this.y - 12; });
    Sfx.play('dash');
    this.setPose('dash', t + 0.05);
    while (t > 0) {
      t -= this.dt;
      this.body.setVelocityX(dir * 470 * this.spd);
      if (Math.random() < 0.6) this.scene.fx.afterimage(this, 0xb0b8ff, 0.4, 200);
      if (this.body.blocked.left || this.body.blocked.right) break;
      yield 0;
    }
    hb.t = 0;
    this.body.setVelocityX(0);
    yield 0.35 / this.spd;
  }
  *flashStep() {
    const p = this.player;
    let tx = p.x - p.facing * 46;
    if (tx < this.arena.left + 10 || tx > this.arena.right - 10) tx = p.x + p.facing * 46;
    yield* this.blink(tx, this.floorY());
    yield* this.tele(0.3, 0xff6060);
    this.slashBox();
    yield 0.4 / this.spd;
  }
  *combo() {
    const n = this.phase >= 2 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      this.face();
      if (Math.abs(this.player.x - this.x) > 36) this.body.setVelocityX(this.facing * 170);
      yield* this.tele(0.22, 0xff8080);
      this.body.setVelocityX(this.facing * 110);
      this.slashBox(32, 24, 0.1);
      yield 0.14;
      this.body.setVelocityX(0);
      yield 0.08 / this.spd;
    }
    yield 0.35;
  }
  // Leaps up and throws crescents down a fixed fan of lanes in front of him.
  // The lanes are shown first and never track the player, so they can be read and dodged.
  *waveToss() {
    this.face();
    const dir = this.facing;
    this.body.setVelocityY(-480);
    Sfx.play('jump');
    yield 0.28;
    this.body.setAllowGravity(false);
    this.body.setVelocity(0, 0);
    const lanes = this.waves >= 4 ? [14, 34, 54, 74] : this.waves === 3 ? [18, 42, 66] : [26, 56];
    const g = this.gfx;
    let t = 0.45 / this.spd;
    this.setPose('cast', t + lanes.length * 0.3);
    this.telegraph(0xb0b8ff);
    Sfx.play('telegraph');
    while (t > 0) {
      t -= this.dt;
      g.clear();
      g.lineStyle(1, 0xb0b8ff, 0.35 + 0.35 * Math.abs(Math.sin(t * 25)));
      lanes.forEach(d => { const r = d * Math.PI / 180; g.lineBetween(this.x, this.y, this.x + dir * Math.cos(r) * 420, this.y + Math.sin(r) * 420); });
      yield 0;
    }
    g.clear();
    this.untelegraph();
    for (const d of lanes) {
      const r = d * Math.PI / 180;
      new EnemyShot(this.scene, this.x, this.y, this.waveKey, dir * Math.cos(r) * 250, Math.sin(r) * 250,
        { dmg: 1, life: 2.4, rotate: true, w: 14, h: 14, scale: this.phase >= 2 ? 1.25 : 1 });
      Sfx.play('wave');
      yield 0.2 / this.spd;
    }
    this.body.setAllowGravity(true);
    yield () => this.body.blocked.down;
    yield 0.45 / this.spd;
  }
  *guard() {
    this.face();
    this.guarding = true;
    this.telegraph(0x9aa8ff);
    this.setPose('guardIdle', 1.15);
    let t = 1.1;
    while (t > 0 && !this.countered) { t -= this.dt; this.face(); yield 0; }
    this.guarding = false;
    this.untelegraph();
    if (this.countered) {
      this.countered = false;
      const p = this.player;
      yield* this.blink(p.x - p.facing * 40, this.floorY());
      yield* this.tele(0.25, 0xff4040);
      this.slashBox(38, 28);
      yield 0.4;
    }
  }
  blocks(dirX, o) {
    if (!this.guarding) return false;
    this.countered = true;
    this.scene.fx.spark(this.x + this.facing * 8, this.y, 0xb0b8ff, 12);
    Sfx.play('clang');
    return true;
  }
  // Blades fall on alternating fixed columns across the arena: two telegraphed volleys
  *bladeRain() {
    const cols = [];
    for (let x = this.arena.left + 20; x < this.arena.right - 10; x += 44) cols.push(x);
    const g = this.gfx;
    this.setPose('cast', 2.4);
    for (const parity of [0, 1]) {
      const xs = cols.filter((_, i) => i % 2 === parity);
      this.telegraph(0xff4040);
      Sfx.play('telegraph');
      g.clear();
      g.fillStyle(0xff3040, 0.2);
      xs.forEach(x => g.fillRect(x - 6, this.arena.top, 12, this.arena.floor - this.arena.top));
      yield 0.85 / this.spd;
      g.clear();
      this.untelegraph();
      xs.forEach((x, i) => {
        this.scene.time.delayedCall(i * 40, () => new EnemyShot(this.scene, x, this.arena.top, 'blade', 0, 700, { dmg: 1, life: 1.2, passWalls: true, w: 6, h: 40, pierce: true }));
      });
      Sfx.play('wave');
      yield 0.55;
    }
    yield 0.4;
  }
  *hadoShot() {
    this.face();
    yield* this.tele(0.35, 0xff7a4a, 'cast');
    const p = this.player;
    const a = Math.atan2(p.y - this.y, p.x - this.x);
    new EnemyShot(this.scene, this.x + this.facing * 10, this.y, 'hado', Math.cos(a) * 260, Math.sin(a) * 260, { dmg: 1, life: 2.5, size: 10 });
    Sfx.play('hado');
    yield 0.35;
  }
  *cero() {
    this.face();
    const ox = this.x + this.facing * 10, oy = this.y - 6;
    const p = this.player;
    const a = Math.atan2(p.y - oy, p.x - ox);
    this.setPose('cast', 1.3);
    yield* this.aimLine(ox, oy, a, 0.7 / this.spd);
    yield* this.beam(ox, oy, a, 0.45, 0, 10);
    yield 0.3;
  }
  onDie() { this.aura.destroy(); }
}

class Captain extends SwordBoss {
  constructor(scene, x, feet) {
    super(scene, x, feet, {
      id: 'captain', key: 'captain', hp: 200, drop: 25, kind: 'captain', bh: 26,
      moves: [
        { name: 'combo', near: true, far: false, w: 3 },
        { name: 'guard', near: true, far: false, w: 1 },
        { name: 'flashStep', near: true, far: true, w: 2 },
        { name: 'dashSlash', near: false, far: true, w: 3 },
        { name: 'waveToss', near: false, far: true, w: 2 },
      ],
    });
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) { this.phase = 2; this.setScript(this.preview()); }
  }
  *preview() {
    this.body.setVelocity(0, 0); this.body.setAllowGravity(true);
    this.gfx.clear(); this.guarding = false; this.untelegraph();
    this.invulnerable = true;
    yield () => this.body.blocked.down;
    this.scene.fx.floatText(this.x, this.y - 30, '"You want to see what waits for you? A glimpse, then."', '#c8c0ff');
    yield 1.0;
    Sfx.play('bankai');
    this.scene.fx.shake(500, 0.012);
    this.scene.fx.flash(0x6a5acd, 300, 0.5);
    this.scene.fx.ring(this.x, this.y, 0x8a7cff, 80, 600, 4);
    this.setSheet('captain_b');
    this.aura.emitting = true;
    this.scene.game.events.emit('banner', { text: 'BANKAI', color: '#9a8cff', small: 'a preview of your own power' });
    yield 1.0;
    this.invulnerable = false;
    this.spd = 1.12; this.waves = 3;
    this.moves.push({ name: 'bladeRain', near: true, far: true, w: 1 });
    yield* this.brain();
  }
}

class FinalBoss extends SwordBoss {
  constructor(scene, x, feet) {
    super(scene, x, feet, {
      id: 'final', key: 'final', hp: 460, drop: 0, kind: 'final', waveKey: 'wave',
      moves: [
        { name: 'combo', near: true, far: false, w: 3 },
        { name: 'flashStep', near: true, far: true, w: 2 },
        { name: 'dashSlash', near: false, far: true, w: 3 },
        { name: 'hadoShot', near: false, far: true, w: 2 },
        { name: 'waveToss', near: false, far: true, w: 1 },
      ],
    });
    this.spd = 1.1;
    this.aura.setParticleTint(0xc8202c);
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.66) { this.phase = 2; this.setScript(this.powerUp(2)); }
    else if (this.phase === 2 && this.hp <= this.maxHp * 0.33) { this.phase = 3; this.setScript(this.powerUp(3)); }
  }
  *powerUp(n) {
    this.body.setVelocity(0, 0); this.body.setAllowGravity(true);
    this.gfx.clear(); this.untelegraph();
    this.invulnerable = true;
    yield () => this.body.blocked.down;
    const s = this.scene;
    if (n === 2) {
      s.fx.floatText(this.x, this.y - 30, '"You keep it locked away. I wear it."', '#ffc0c0');
      yield 1.0;
      Sfx.play('mask');
      s.fx.flash(0xffffff, 200, 0.6);
      s.fx.burst(this.x, this.y - 8, 0xf4f1ea, 24);
      this.setSheet('final_m');
      this.spd = 1.2; this.waves = 3;
      this.moves.push({ name: 'cero', near: false, far: true, w: 2 });
    } else {
      s.fx.floatText(this.x, this.y - 30, '"Then let us both stop holding back."', '#ff9090');
      yield 1.0;
      Sfx.play('bankai');
      s.fx.shake(600, 0.015);
      s.fx.flash(0xc8202c, 300, 0.5);
      s.fx.ring(this.x, this.y, 0xc8202c, 90, 600, 4);
      this.setSheet('final_b');
      this.aura.emitting = true;
      s.setDarkness(0.75);
      s.game.events.emit('banner', { text: 'BANKAI', color: '#e0303c', small: 'the fallen vizard' });
      this.spd = 1.35; this.waves = 4;
      this.moves.push({ name: 'bladeRain', near: true, far: true, w: 3 });
    }
    yield 0.8;
    this.invulnerable = false;
    yield* this.brain();
  }
}

// ---------------------------------------------------------------------------
class Vasto extends Boss {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'vasto', { id: 'vasto', hp: 320, dmg: 1, drop: 30, bw: 16, bh: 38, kind: 'vasto', fly: true, frame: 'float0', frameFeet: HF.FEET });
    this.telePose = 'cast';
    this.anim('float');
    this.orb = scene.add.image(x, this.y, 'cero_orb').setDepth(29).setVisible(false);
  }
  hoverY() { return this.arena.floor - 92; }
  defaultPose() { return this.body.blocked.down ? 'idle' : 'float'; }
  *brain() {
    yield 0.5;
    for (;;) {
      let opts = ['sonidoDive', 'clawRush', 'ceroBurst', 'sonidoDive', 'clawRush'];
      if (this.phase >= 2) opts = opts.concat(['ceroGrande', 'ceroBurst']);
      yield* this[Phaser.Utils.Array.GetRandom(opts)]();
      yield 0.5 / this.spd;
    }
  }
  *sonidoDive() {
    yield* this.blink(this.player.x, this.arena.top + 40);
    const g = this.gfx;
    g.clear(); g.fillStyle(0xff3040, 0.15); g.fillRect(this.x - 10, this.y, 20, this.arena.floor - this.y);
    yield* this.tele(0.45, 0xff6060, 'dive');
    g.clear();
    this.setPose('dive', 2);
    const hb = this.scene.addHurt(0, 0, 18, 38, 1, 3, (h) => { h.x = this.x - 9; h.y = this.y - 19; });
    this.body.setVelocityY(640);
    yield () => this.body.blocked.down || this.y > this.arena.floor - 20;
    hb.t = 0;
    this.poseT = 0;
    this.body.setVelocityY(0);
    this.scene.fx.shake(200, 0.01);
    Sfx.play('break');
    this.scene.spawnShock(this.x - 12, this.body.bottom, -1);
    this.scene.spawnShock(this.x + 12, this.body.bottom, 1);
    yield 0.45 / this.spd;
    yield* this.blink(this.x, this.hoverY());
  }
  *clawRush() {
    const left = this.player.x > (this.arena.left + this.arena.right) / 2;
    const x = left ? this.arena.left + 24 : this.arena.right - 24;
    yield* this.blink(x, this.arena.floor - 19);
    yield* this.tele(0.5, 0xff6060, 'rush');
    const dir = left ? 1 : -1;
    this.facing = dir;
    const hb = this.scene.addHurt(0, 0, 26, 36, 1, 3, (h) => { h.x = this.x - 13; h.y = this.y - 18; });
    Sfx.play('dash');
    this.setPose('rush', 1.5);
    let t = 1.4;
    while (t > 0) {
      t -= this.dt;
      this.body.setVelocity(dir * 520 * this.spd, 0);
      if (Math.random() < 0.5) this.scene.fx.afterimage(this, 0xffffff, 0.4, 200);
      if ((dir > 0 && this.x > this.arena.right - 24) || (dir < 0 && this.x < this.arena.left + 24) || this.body.blocked.left || this.body.blocked.right) break;
      yield 0;
    }
    hb.t = 0;
    this.body.setVelocity(0, 0);
    yield 0.4 / this.spd;
    yield* this.blink(this.x, this.hoverY());
  }
  *ceroBurst() {
    const x = Phaser.Math.Between(this.arena.left + 60, this.arena.right - 60);
    yield* this.blink(x, this.hoverY() - 20);
    this.orb.setPosition(this.x, this.y - 4).setVisible(true).setScale(0.3);
    yield* this.tele(0.55, 0xff8aa0);
    this.orb.setVisible(false);
    const p = this.player;
    const base = Math.atan2(p.y - this.y, p.x - this.x);
    const n = this.phase >= 3 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.28;
      new EnemyShot(this.scene, this.x, this.y, 'bala', Math.cos(a) * 250, Math.sin(a) * 250, { dmg: 1, life: 3, scale: 1.4 });
    }
    Sfx.play('cero');
    yield 0.6 / this.spd;
  }
  *ceroGrande() {
    const cx = (this.arena.left + this.arena.right) / 2;
    yield* this.blink(cx, this.arena.top + 30);
    this.orb.setPosition(this.x, this.y + 10).setVisible(true).setScale(0.2);
    this.scene.tweens.add({ targets: this.orb, scale: 2, duration: 1000 });
    this.telegraph(0xff4060);
    Sfx.play('charge');
    yield 1.0;
    this.untelegraph();
    const from = Math.random() < 0.5;
    const a0 = from ? Math.PI / 2 + 1.05 : Math.PI / 2 - 1.05;
    yield* this.beam(this.x, this.y + 10, a0, 1.5 / this.spd, from ? -2.1 : 2.1, 14, 520);
    this.orb.setVisible(false);
    yield 0.4;
    yield* this.blink(this.x, this.hoverY());
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.6) { this.phase = 2; this.setScript(this.arenaShift()); }
    else if (this.phase === 2 && this.hp <= this.maxHp * 0.25) { this.phase = 3; this.setScript(this.rage()); }
  }
  *arenaShift() {
    this.gfx.clear(); this.orb.setVisible(false);
    this.invulnerable = true;
    yield* this.blink((this.arena.left + this.arena.right) / 2, this.arena.top + 40);
    this.invulnerable = true;
    Sfx.play('roar');
    this.scene.fx.floatText(this.x, this.y - 20, 'The sand throne cracks apart!', '#ffd0a0');
    this.scene.collapseFloor();
    yield 1.8;
    this.invulnerable = false;
    yield* this.blink(this.x, this.hoverY());
    yield* this.brain();
  }
  *rage() {
    this.gfx.clear(); this.orb.setVisible(false);
    this.invulnerable = true;
    this.telegraph(0xff3030);
    Sfx.play('roar');
    this.scene.fx.shake(700, 0.015);
    this.scene.setDarkness(0.82);
    yield 1.0;
    this.untelegraph();
    this.invulnerable = false;
    this.spd = 1.35;
    yield* this.brain();
  }
  onDie() { this.orb.destroy(); this.scene.restoreFloor(); }
}

// ---------------------------------------------------------------------------
// Optional boss in the Forest of Menos. It sits unseen until struck with the
// Konso Blade, then fights with sonido, Cero and a fixed fan of bala, and
// releases its Resurrección at half health.
class Espada extends SwordBoss {
  constructor(scene, x, feet) {
    super(scene, x, feet, {
      id: 'espada', key: 'espada', hp: 380, drop: 30, kind: 'espada',
      moves: [
        { name: 'combo', near: true, far: false, w: 3 },
        { name: 'flashStep', near: true, far: true, w: 3 },
        { name: 'dashSlash', near: false, far: true, w: 2 },
        { name: 'cero', near: false, far: true, w: 2 },
        { name: 'balaFan', near: false, far: true, w: 2 },
      ],
    });
    this.spd = 1.1;
    this.waitsForReveal = true;
    this.revealed = false;
    this.harmless = true;
    this.setAlpha(0.1);
    this.setPose('guardIdle', 1e6);
    this.aura.setParticleTint(0x40e0ff);
    scene.time.addEvent({ delay: 280, loop: true, callback: () => {
      if (this.active && !this.revealed) scene.fx.motes(this.x + Phaser.Math.Between(-8, 8), this.y + Phaser.Math.Between(-12, 10), 0x7fe8ff, 1);
    } });
  }
  reveal() {
    if (this.revealed || !this.alive) return;
    const s = this.scene;
    this.revealed = true;
    this.harmless = false;
    this.poseT = 0;
    s.tweens.add({ targets: this, alpha: 1, duration: 500 });
    Sfx.play('roar');
    s.fx.flash(0x7fe8ff, 220, 0.4);
    s.fx.ring(this.x, this.y, 0x7fe8ff, 60, 500, 3);
    s.fx.floatText(this.x, this.y - 30, '"So you can see me. How unfortunate for you."', '#bff4ff');
    this.face();
    s.startBoss();
  }
  *balaFan() {
    this.face();
    yield* this.tele(0.4, 0x40e0ff, 'cast');
    const dir = this.facing;
    [-28, -14, 0, 14, 28].forEach(deg => {
      const r = deg * Math.PI / 180;
      new EnemyShot(this.scene, this.x + dir * 10, this.y - 4, 'bala', dir * Math.cos(r) * 230, Math.sin(r) * 230, { dmg: 1, life: 2.6, tint: 0x40e0ff, scale: 1.3 });
    });
    Sfx.play('hado');
    yield 0.55 / this.spd;
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) { this.phase = 2; this.setScript(this.resurreccion()); }
  }
  *resurreccion() {
    this.body.setVelocity(0, 0); this.body.setAllowGravity(true);
    this.gfx.clear(); this.untelegraph();
    this.invulnerable = true;
    yield () => this.body.blocked.down;
    const s = this.scene;
    s.fx.floatText(this.x, this.y - 30, '"Then look closely. This is the last thing you will see."', '#bff4ff');
    yield 1.0;
    Sfx.play('bankai');
    s.fx.shake(600, 0.014);
    s.fx.flash(0x7fe8ff, 300, 0.5);
    s.fx.ring(this.x, this.y, 0x7fe8ff, 90, 600, 4);
    this.setSheet('espada_r');
    this.aura.emitting = true;
    s.game.events.emit('banner', { text: 'RESURRECCIÓN', color: '#7fe8ff', small: 'the espada releases its true form' });
    yield 0.9;
    this.invulnerable = false;
    this.spd = 1.25; this.waves = 3;
    this.moves.push({ name: 'bladeRain', near: true, far: true, w: 2 });
    yield* this.brain();
  }
}

const BOSS_CLASSES = { menos: Menos, captain: Captain, vasto: Vasto, final: FinalBoss, espada: Espada };
