'use strict';
// ---------------------------------------------------------------------------
// Enemies. Every enemy faces right in its texture; `facing` flips it.
// ---------------------------------------------------------------------------

class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, feetY, key, cfg) {
    super(scene, x, 0, key, cfg.frame);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.cfg = cfg;
    this.sheet = key;
    // Origin on the body centre, so `y` is the middle of the hitbox for every sheet
    const fy = cfg.frameFeet ?? this.height;
    const sc = cfg.scale || 1;
    if (sc !== 1) this.setScale(sc);
    this.setOrigin(0.5, (fy - cfg.bh / 2) / this.height);
    this.body.setSize(cfg.bw, cfg.bh).setOffset((this.width - cfg.bw) / 2, fy - cfg.bh);
    this.body.reset(x, feetY - cfg.bh * sc / 2);
    this.hp = this.maxHp = Math.round(cfg.hp * GS.hpMul());
    this.dmg = cfg.dmg ?? 1;
    this.drop = Math.round((cfg.drop ?? 2) * GS.dropMul());
    this.kbRes = cfg.kb ?? 1;
    this.kind = cfg.kind;
    this.uid = scene.nextUid || null; scene.nextUid = null;
    this.alive = true;
    this.boundT = 0; this.flashT = 0; this.stunT = 0;
    this.facing = -1;
    this.konsoed = false;
    this.isBoss = false;
    this.invulnerable = false;
    this.harmless = false;
    this.setDepth(15);
    if (cfg.fly) this.body.setAllowGravity(false);
    scene.enemies.push(this);
    scene.enemyGroup.add(this);
    this.makeElite();
  }

  // Some placements are elite: decided by the placement itself, so the same spot stays elite
  makeElite() {
    if (!this.uid || BOSS_KINDS.includes(this.kind) || GS.rush) return;
    const plus = Math.min(3, GS.data.plus || 0);
    const chance = plus ? 0.15 + 0.1 * plus : ELITE_REGIONS.includes(this.scene.region) ? 0.16 : 0;
    if (!chance) return;
    let h = 2166136261;
    for (const ch of this.uid + ':' + plus) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    if ((h % 1000) / 1000 >= chance) return;
    const traits = Object.keys(ELITE_TRAITS);
    this.elite = traits[(h >>> 10) % traits.length];
    this.hp = this.maxHp = Math.round(this.maxHp * 1.6);
    this.drop *= 2;
    const t = ELITE_TRAITS[this.elite], s = this.scene;
    this.eliteMark = s.add.image(this.x, this.y, 'elite_' + this.elite).setDepth(26).setAlpha(0.95).setScale(0.5);
    this.eliteAura = s.add.particles(0, 0, 'dot', {
      speed: { min: 6, max: 22 }, angle: { min: 240, max: 300 }, lifespan: 600, scale: { start: 0.6, end: 0 },
      alpha: { start: 0.6, end: 0 }, frequency: Math.round(110 / Settings.get('particles')), tint: t.color, blendMode: 'ADD',
    }).setDepth(14);
    this.eliteAura.startFollow(this);
    this.calmT = 0;
    this.once('destroy', () => { this.eliteMark.destroy(); this.eliteAura.destroy(); });
  }
  eliteTick(dt) {
    this.eliteMark.setPosition(this.x, this.body.top - 9 + Math.sin(this.scene.time.now / 260) * 1.5);
    if (this.elite === 'undying') {
      this.calmT += dt;
      if (this.calmT > 2 && this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.05 * dt);
        if (Math.random() < dt * 4) this.scene.fx.motes(this.x, this.y, 0x9aff6a, 1);
      }
    }
  }

  anim(name, timeScale = 1) {
    const key = this.sheet + ':' + name;
    if (!this.anims.currentAnim || this.anims.currentAnim.key !== key) this.play(key);
    this.anims.timeScale = timeScale * (this.elite === 'hasty' ? 1.35 : 1);
  }
  // Humanoids: idle / run picked from movement
  moveAnim(speed = 150) {
    const vx = Math.abs(this.body.velocity.x);
    if (vx > 8) this.anim('run', Phaser.Math.Clamp(vx / speed, 0.4, 1.3)); else this.anim('idle');
  }

  // A boss that cannot be hurt (intro, blink, transformation) cannot hurt by touch either
  get contactDamage() { return this.alive && this.boundT <= 0 && !this.harmless && !(this.isBoss && this.invulnerable) ? this.dmg : 0; }
  hittable() { return this.alive && !this.invulnerable; }

  // Ground enemies that end up on spikes (knocked in, or hit there) die
  inSpikes() {
    const b = this.body, s = this.scene, y = b.bottom - 2;
    for (const x of [b.left + 2, b.center.x, b.right - 2]) {
      const t = s.hazLayer.getTileAtWorldXY(x, y);
      if (t && y >= t.pixelY + 7) return true;
    }
    return false;
  }

  tick(dt) {
    if (!this.alive) return;
    if (this.elite) { this.eliteTick(dt); if (this.elite === 'hasty') dt *= 1.35; }
    if (this.warnOn !== undefined) this.updateWarn();
    this.dt = dt;
    if (!this.isBoss && !this.cfg.fly && this.inSpikes()) { this.drop = 0; this.die(0); return; }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.refreshTint(); }
    if (this.boundT > 0) {
      this.boundT -= dt;
      this.body.setVelocityX(0);
      if (!this.body.allowGravity) this.body.setVelocityY(0);
      if (this.boundT <= 0) this.refreshTint();
      this.afterTick && this.afterTick(dt);
      this.hurtPose(dt);
      return;
    }
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.body.velocity.x *= 0.9;
      if (!this.body.allowGravity) this.body.velocity.y *= 0.9;
    } else if (!this.isBoss && this.scene.entryCalm > 0) {
      this.body.velocity.x *= 0.8;   // just arrived: nobody pounces on the first heartbeat
      if (!this.body.allowGravity) this.body.velocity.y *= 0.8;
    } else this.think(dt);
    this.setFlipX(this.facing < 0);
    this.afterTick && this.afterTick(dt);
    this.hurtPose(dt);
  }
  // The clip every humanoid sheet already has: held briefly after a hit so enemies visibly flinch
  hurtPose(dt) {
    if (this.hurtT > 0 && this.alive) {
      this.hurtT -= dt;
      if (this.canHurt === undefined) this.canHurt = this.scene.anims.exists(this.sheet + ':hurt');
      if (this.canHurt) this.anim('hurt');
    }
  }
  think() {}
  refreshTint() {
    this.clearTint();
    if (this.boundT > 0) this.setTint(0xffd75e);
    else if (this.tintState) this.setTint(this.tintState);
  }
  telegraph(color) { this.tintState = color; if (this.flashT <= 0) this.refreshTint(); this.warn(color !== 0x8080a0); }
  untelegraph() { this.tintState = 0; if (this.flashT <= 0) this.refreshTint(); this.warn(false); }
  // Bold attack warnings (an assist setting): a mark over the head for as long as a wind-up lasts
  warn(on) {
    this.warnOn = on && Settings.get('warnings') && this.alive;
    if (this.warnOn && !this.warnMark) this.warnMark = this.scene.add.image(this.x, this.y, 'warn_mark').setDepth(32);
    if (this.warnMark) { this.warnMark.setVisible(this.warnOn); this.updateWarn(); }
  }
  updateWarn() {
    const m = this.warnMark;
    if (!m) return;
    if (!this.alive || !this.active) { m.destroy(); this.warnMark = null; this.warnOn = undefined; return; }
    if (!this.warnOn) return;
    m.setPosition(this.x, this.body.top - (this.elite ? 20 : 10)).setScale(0.5 + 0.08 * Math.abs(Math.sin(this.scene.time.now / 70)));
  }

  hit(dmg, dirX, o = {}) {
    if (!this.alive || this.invulnerable) return 'none';
    if (this.blocks && this.blocks(dirX, o)) return 'block';
    if (this.elite === 'armored') dmg *= 0.67;
    this.calmT = 0;
    this.hp -= dmg;
    this.flashT = 0.08;
    if (!this.isBoss) this.hurtT = 0.16;
    this.scene.fx.damageNumber(this.x, this.y - this.displayHeight / 2 - 2, dmg);
    this.setTintFill(0xffffff);
    if (this.hp <= 0) { this.die(dirX); return 'hit'; }
    if (!this.isBoss && o.knock !== false) {
      this.body.velocity.x = dirX * 170 * this.kbRes;
      if (this.body.allowGravity) this.body.velocity.y = -90 * this.kbRes;
      else this.body.velocity.y = (o.kind === 'up' ? -1 : o.kind === 'down' ? 1 : 0) * 140 * this.kbRes;
      this.stunT = 0.14 * this.kbRes;
    }
    this.onHurt && this.onHurt(dirX, o);
    return 'hit';
  }

  bind(t) {
    this.boundT = t;
    this.setTint(0xffd75e);
    this.scene.fx.ring(this.x, this.y, 0xffd75e, 26, 400);
  }

  die(dirX) {
    this.alive = false;
    this.body.enable = false;
    const s = this.scene;
    GS.data.kills[this.kind] = (GS.data.kills[this.kind] || 0) + 1;
    s.spawnShards(this.x, this.y, this.drop);
    s.fx.kill(this, dirX || 0);
    Sfx.play('hit');
    if (this.warnMark) { this.warnMark.destroy(); this.warnMark = null; }
    if (this.elite === 'volatile') this.burstOnDeath();
    this.onDie && this.onDie();
    this.anims.pause();
    this.setTintFill(0xffffff);
    // dissolve upward into reishi
    s.tweens.add({ targets: this, alpha: 0, scaleX: 0.6, scaleY: 1.25, y: this.y - 8, duration: 420, ease: 'Cubic.in', onComplete: () => this.destroy() });
  }

  // A Volatile elite's last act: a ring that swells, then bursts
  burstOnDeath() {
    const s = this.scene, x = this.x, y = this.y, R = 30;
    s.fx.ring(x, y, 0xff7a4a, R, 450, 2);
    Sfx.play('telegraph');
    s.time.delayedCall(450, () => {
      if (!s.sys.isActive()) return;
      s.fx.ring(x, y, 0xffd0a0, R * 1.3, 300, 3);
      s.fx.burst(x, y, 0xff7a4a, 16);
      s.fx.shake(150, 0.006);
      Sfx.play('break');
      s.addHurt(x - R, y - R, R * 2, R * 2, 1, 0.12);
    });
  }

  memory() { return Phaser.Utils.Array.GetRandom(MEMORIES[this.kind] || ['"..."']); }

  groundAhead(dir) {
    const b = this.body, s = this.scene, x = dir > 0 ? b.right + 2 : b.left - 2;
    return s.isGroundAt(x, b.bottom + 4) && !s.isSpikeAt(x, b.bottom - 4) && !s.isSpikeAt(x, b.bottom + 4);
  }
  wallAhead(dir) {
    const b = this.body, s = this.scene, x = dir > 0 ? b.right + 2 : b.left - 2;
    return s.isSolidAt(x, b.center.y) || s.isSolidAt(x, b.bottom - 4);
  }
  playerDelta() { const p = this.scene.player; return { dx: p.x - this.x, dy: p.y - this.y }; }
  faceTo(x) { this.facing = Math.sign(x - this.x) || this.facing; }
  // Can this enemy see the player (nothing solid on the straight line between them)?
  sees(r = 0) { const s = this.scene, p = s.player; return !s.flow || s.flow.clear(this.x, this.y, p.x, p.body.center.y, r); }
  // Flyers spread out a little instead of stacking on one spot
  separate(dt) {
    for (const o of this.scene.enemies) {
      if (o === this || !o.alive || !o.cfg.fly || o.isBoss) continue;
      const dx = this.x - o.x, dy = this.y - o.y, d = Math.hypot(dx, dy);
      if (d > 0.1 && d < 16) { this.body.velocity.x += dx / d * 260 * dt; this.body.velocity.y += dy / d * 260 * dt; }
    }
  }
}

// Rukongai thug: simple patrol that turns at walls and ledges
class Thug extends Enemy {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'thug', { hp: 15, dmg: 1, drop: 3, bw: 10, bh: 18, kind: 'thug', burst: 0xb08a60, frame: 'idle0', frameFeet: HF.FEET });
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.anim('idle');
  }
  afterTick() {
    if (this.mode === 'windup') this.anim('windup');
    else if (this.mode === 'strike') this.anim('strike');
    else if (this.mode === 'recover') this.anim('idle');
    else this.moveAnim(110);
  }
  // Patrols, then swings its club at close range (telegraphed)
  think(dt) {
    const b = this.body;
    this.mt = (this.mt || 0) - dt;
    if (this.mode === 'windup') {
      b.setVelocityX(0);
      if (this.mt <= 0) {
        this.untelegraph();
        this.mode = 'strike'; this.mt = 0.25;
        const f = this.facing;
        this.scene.addHurt(0, 0, 30, 18, 1, 0.15, (h) => { h.x = this.x + (f > 0 ? 2 : -32); h.y = this.y - 9; }, this);
        Sfx.play('slash');
      }
      return;
    }
    if (this.mode === 'strike') { b.setVelocityX(0); if (this.mt <= 0) { this.mode = 'recover'; this.mt = 0.6; } return; }
    if (this.mode === 'recover') { b.setVelocityX(0); if (this.mt <= 0) this.mode = null; return; }
    if (!b.blocked.down) return;
    if (this.wallAhead(this.facing) || !this.groundAhead(this.facing)) this.facing *= -1;
    const { dx, dy } = this.playerDelta();
    if (Math.abs(dx) < 34 && Math.abs(dy) < 24 && Math.sign(dx) === this.facing) {
      this.mode = 'windup'; this.mt = 0.42; b.setVelocityX(0);
      this.telegraph(0xffa070); Sfx.play('telegraph');
      return;
    }
    const chasing = Math.abs(dx) < 110 && Math.abs(dy) < 30 && Math.sign(dx) === this.facing;
    b.setVelocityX(this.facing * (chasing ? 75 : 40));
  }
}

// Corrupted Shinigami: guards from the front; open only after its lunge
class Shinigami extends Enemy {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'shini', { hp: 30, dmg: 1, drop: 6, bw: 10, bh: 20, kind: 'shini', kb: 0.55, burst: 0x9a7ac8, frame: 'idle0', frameFeet: HF.FEET });
    this.mode = 'patrol'; this.mt = 0; this.guard = true;
    this.anim('idle');
  }
  blocks(dirX, o) {
    if (!this.guard || this.boundT > 0 || !o.slash || o.kind !== 'side') return false;
    const p = this.scene.player;
    if (Math.sign(p.x - this.x) !== this.facing) return false;
    this.scene.fx.spark(this.x + this.facing * 8, this.y - 2, 0xffffff, 10);
    Sfx.play('clang');
    return true;
  }
  think(dt) {
    const b = this.body;
    const { dx, dy } = this.playerDelta();
    this.mt -= dt;
    switch (this.mode) {
      case 'patrol':
        this.guard = true;
        if (b.blocked.down && (this.wallAhead(this.facing) || !this.groundAhead(this.facing))) this.facing *= -1;
        b.setVelocityX(this.facing * 28);
        if (Math.abs(dx) < 150 && Math.abs(dy) < 40) this.mode = 'approach';
        break;
      case 'approach':
        this.faceTo(this.scene.player.x);
        this.guard = true;
        if (Math.abs(dx) > 44) b.setVelocityX(this.groundAhead(this.facing) ? this.facing * 55 : 0);
        else { b.setVelocityX(0); this.mode = 'windup'; this.mt = 0.5; this.telegraph(0xff7070); Sfx.play('telegraph'); }
        if (Math.abs(dx) > 230 || Math.abs(dy) > 90) this.mode = 'patrol';
        break;
      case 'windup':
        b.setVelocityX(0);
        if (this.mt <= 0) {
          this.untelegraph();
          this.mode = 'lunge'; this.mt = 0.2; this.guard = false;
          b.setVelocityX(this.groundAhead(this.facing) ? this.facing * 210 : 0);
          const f = this.facing;
          this.scene.addHurt(0, 0, 26, 20, 1, 0.2, (h) => { h.x = this.x + (f > 0 ? 2 : -28); h.y = this.y - 10; }, this);
          this.scene.fx.slashArc(this.x + f * 14, this.y, f, 0xc8a8ff, 0.9);
          Sfx.play('slash');
        }
        break;
      case 'lunge':
        if (!this.groundAhead(this.facing)) b.setVelocityX(0);
        if (this.mt <= 0) { this.mode = 'recover'; this.mt = 0.8; b.setVelocityX(0); this.telegraph(0x8080a0); }
        break;
      case 'recover':
        b.setVelocityX(0);
        if (this.mt <= 0) { this.mode = 'approach'; this.untelegraph(); }
        break;
    }
  }
  afterTick() {
    const moving = Math.abs(this.body.velocity.x) > 8;
    switch (this.mode) {
      case 'patrol': this.moveAnim(110); break;
      case 'approach': this.anim(moving ? 'guard' : 'guardIdle'); break;
      case 'windup': this.anim('windup'); break;
      case 'lunge': this.anim('strike'); break;
      default: this.anim('recover');
    }
  }
}

// Lesser Hollow: small flyer that drifts near home, then swoops at the player. It follows the
// room's flow field, so it hunts you around walls and through gaps instead of into the stone.
class Hollow extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y + 5, 'hollow', { hp: 8, dmg: 1, drop: 1, bw: 12, bh: 10, kind: 'hollow', fly: true, kb: 1.4, frame: 'fly0', frameFeet: 17 });
    this.anim('fly');
    this.anims.setProgress(Math.random());
    this.home = { x, y };
    this.mode = 'idle';
    this.clk = Math.random() * 10;
  }
  // After landing a hit, peel away for a moment instead of swarming an invulnerable player
  onContact() { this.mode = 'retreat'; this.retreatT = 0.9; }
  think(dt) {
    const b = this.body, s = this.scene, p = s.player;
    const px = p.x, py = p.body.center.y;
    const dx = px - this.x, dy = py - this.y, d = Math.hypot(dx, dy) || 1;
    const steps = s.flow ? s.flow.distAt(this.x, this.y) : (d / TILE);   // path length in tiles, -1 when walled off
    const k = Math.min(1, dt * 2.6);
    this.clk += dt;
    if (this.mode === 'retreat') {
      this.retreatT -= dt;
      b.velocity.x += (-dx / d * 110 - b.velocity.x) * Math.min(1, dt * 4);
      b.velocity.y += (-80 - b.velocity.y) * Math.min(1, dt * 4);
      if (this.retreatT <= 0) this.mode = 'chase';
      return;
    }
    if (this.mode === 'idle') {
      const tx = this.home.x + Math.cos(this.clk * 1.3) * 22, ty = this.home.y + Math.sin(this.clk * 2.1) * 10;
      b.velocity.x += ((tx - this.x) * 2.2 - b.velocity.x) * k;
      b.velocity.y += ((ty - this.y) * 2.2 - b.velocity.y) * k;
      if (steps >= 0 && steps <= 11 && p.state !== 'dead') { this.mode = 'chase'; Sfx.play('telegraph'); }
      this.facing = Math.sign(b.velocity.x) || this.facing;
    } else {
      // Head for the next corner on the shortest open path (or straight at you when nothing is in the way)
      const tgt = (s.flow && s.flow.steer(this.x, this.y, px, py, 6)) || { x: px, y: py };
      const tx = tgt.x - this.x, ty = tgt.y - this.y, td = Math.hypot(tx, ty) || 1;
      const sp = 125, bob = Math.sin(this.clk * 7) * 18;
      b.velocity.x += (tx / td * sp - b.velocity.x) * k;
      b.velocity.y += (ty / td * sp + bob - b.velocity.y) * k;
      this.separate(dt);
      this.facing = Math.sign(dx) || this.facing;
      if (steps < 0 || steps > 24) { this.mode = 'idle'; this.home = { x: this.x, y: this.y }; }
    }
  }
}

// Adjuchas: heavy beast that telegraphs and charges along the ground
class Adjuchas extends Enemy {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'adjuchas', { hp: 42, dmg: 2, drop: 10, bw: 22, bh: 14, kind: 'adjuchas', kb: 0.45, frame: 'run0', frameFeet: 24 });
    this.mode = 'patrol'; this.mt = 0;
  }
  afterTick() {
    if (this.mode === 'windup') this.anim('windup');
    else if (Math.abs(this.body.velocity.x) > 8) this.anim('run', this.mode === 'charge' ? 1.8 : 0.8);
    else this.anim('idle');
  }
  think(dt) {
    const b = this.body;
    const { dx, dy } = this.playerDelta();
    this.mt -= dt;
    if (this.mode === 'patrol') {
      if (b.blocked.down && (this.wallAhead(this.facing) || !this.groundAhead(this.facing))) this.facing *= -1;
      b.setVelocityX(this.facing * 45);
      if (Math.abs(dx) < 180 && Math.abs(dy) < 40 && Math.sign(dx) === this.facing && this.mt <= 0) {
        this.mode = 'windup'; this.mt = 0.45; b.setVelocityX(0); this.telegraph(0xff6060); Sfx.play('telegraph');
      }
    } else if (this.mode === 'windup') {
      b.setVelocityX(0);
      if (this.mt <= 0) { this.untelegraph(); this.mode = 'charge'; this.mt = 1.1; this.trampled = new Set(); Sfx.play('dash'); }
    } else if (this.mode === 'charge') {
      b.setVelocityX(this.facing * 230);
      if (Math.random() < 0.4) this.scene.fx.dust(this.x - this.facing * 10, b.bottom, 1);
      // it tramples whatever it runs through, but each enemy only once per charge
      this.scene.friendlyHit(bodyRect(b), this, FRIENDLY.charge, this.facing, this.trampled || (this.trampled = new Set()));
      if (this.mt <= 0 || this.wallAhead(this.facing) || !this.groundAhead(this.facing)) { this.mode = 'recover'; this.mt = 0.7; b.setVelocityX(0); }
    } else {
      b.setVelocityX(0);
      if (this.mt <= 0) { this.mode = 'patrol'; this.mt = 0.6; }
    }
  }
}

// Shade Arrancar: invisible and dormant without Konso true sight; fires bala, then sonido-steps
class Arrancar extends Enemy {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'arrancar', { hp: 48, dmg: 2, drop: 15, bw: 10, bh: 20, kind: 'arrancar', kb: 0.5, frame: 'idle0', frameFeet: HF.FEET });
    this.mode = 'idle'; this.mt = 1;
    this.anim('idle');
  }
  afterTick() { this.anim(this.mode === 'aim' || this.mode === 'cool' ? 'cast' : 'idle'); }
  think(dt) {
    const s = this.scene, b = this.body;
    const seen = s.trueSight;
    this.harmless = !seen; this.invulnerable = !seen;
    this.setAlpha(seen ? 1 : 0.05);
    if (!seen) { b.setVelocityX(0); return; }
    const { dx, dy } = this.playerDelta();
    this.mt -= dt;
    b.setVelocityX(0);
    this.faceTo(s.player.x);
    if (this.mode === 'idle') {
      if (Math.hypot(dx, dy) < 240 && this.mt <= 0 && this.sees()) { this.mode = 'aim'; this.mt = 0.6; this.telegraph(0x40e0ff); Sfx.play('telegraph'); }
    } else if (this.mode === 'aim') {
      if (this.mt <= 0) {
        this.untelegraph();
        const a = Math.atan2(dy, dx);
        new EnemyShot(s, this.x + this.facing * 8, this.y - 4, 'bala', Math.cos(a) * 210, Math.sin(a) * 210, { dmg: 1, life: 2.5, tint: 0x40e0ff, owner: this });
        Sfx.play('hado');
        this.mode = 'cool'; this.mt = 0.7;
      }
    } else if (this.mode === 'cool') {
      if (this.mt <= 0) { this.sonido(); this.mode = 'idle'; this.mt = 1.2; }
    }
  }
  sonido() {
    const s = this.scene, b = this.body;
    const feet = b.bottom;
    for (let i = 0; i < 6; i++) {
      const tx = this.x + (Math.random() < 0.5 ? -1 : 1) * Phaser.Math.Between(50, 90);
      if (s.isGroundAt(tx, feet + 4) && !s.isSolidAt(tx, feet - 8) && !s.isSolidAt(tx, feet - 20) && !s.isSpikeAt(tx, feet - 4) && tx > 16 && tx < s.pxW - 16) {
        s.fx.afterimage(this, 0x40e0ff, 0.6, 300);
        b.reset(tx, this.y);
        Sfx.play('dash');
        return;
      }
    }
  }
}

// Gillian: a lesser Menos of the forest. Slow, sturdy, and it fires a level Cero
// down the line it is facing after a clear aim line.
class Gillian extends Enemy {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'menos', { hp: 70, dmg: 1, drop: 12, bw: 40, bh: 100, kind: 'gillian', kb: 0.15, frame: 'idle0', frameFeet: 120, scale: 0.55, burst: 0x1a1622 });
    this.mode = null; this.mt = 1.2;
    this.gfx = scene.add.graphics().setDepth(30);
    this.anim('idle');
  }
  mouth() { return { x: this.x + this.facing * 21, y: this.y - 24 }; }
  think(dt) {
    const b = this.body, s = this.scene;
    const { dx, dy } = this.playerDelta();
    this.mt -= dt;
    if (this.mode === 'aim') {
      b.setVelocityX(0);
      const m = this.mouth(), g = this.gfx, a = this.aimAngle;
      g.clear(); g.lineStyle(1, 0xff3060, 0.4 + 0.4 * Math.abs(Math.sin(this.mt * 30)));
      g.lineBetween(m.x, m.y, m.x + Math.cos(a) * 340, m.y + Math.sin(a) * 340);
      if (this.mt <= 0) { this.mode = 'fire'; this.mt = 0.5; this.untelegraph(); Sfx.play('cero'); }
      return;
    }
    if (this.mode === 'fire') {
      b.setVelocityX(0);
      const m = this.mouth(), g = this.gfx, a = this.aimAngle;
      const x2 = m.x + Math.cos(a) * 340, y2 = m.y + Math.sin(a) * 340;
      g.clear();
      g.lineStyle(14, 0xff2a50, 0.35); g.lineBetween(m.x, m.y, x2, y2);
      g.lineStyle(7, 0xff4a70, 0.9); g.lineBetween(m.x, m.y, x2, y2);
      g.lineStyle(3, 0xffe0ea, 1); g.lineBetween(m.x, m.y, x2, y2);
      s.beamHit(m.x, m.y, x2, y2, 5, 1);
      this.beamSeen = this.beamSeen || new Set();
      const beamBox = new Phaser.Geom.Rectangle(Math.min(m.x, x2), Math.min(m.y, y2) - 5, Math.abs(x2 - m.x), Math.abs(y2 - m.y) + 10);
      s.friendlyHit(beamBox, this, FRIENDLY.beam, this.facing, this.beamSeen);
      if (this.mt <= 0) { this.mode = 'cool'; this.mt = 2.4; g.clear(); this.beamSeen = null; }
      return;
    }
    if (this.mode === 'cool' && this.mt <= 0) this.mode = null;
    if (b.blocked.down && (this.wallAhead(this.facing) || !this.groundAhead(this.facing))) this.facing *= -1;
    b.setVelocityX(this.facing * 18);
    const sees = Math.abs(dy) < 50 && Math.abs(dx) < 280 && this.sees();
    if (sees && this.mt <= 0 && this.mode !== 'cool') {
      if (Math.sign(dx) !== this.facing) { this.facing = Math.sign(dx) || this.facing; this.mt = 0.5; return; }
      this.mode = 'aim'; this.mt = 0.9; b.setVelocityX(0);
      // aim at where the player stands now, then hold that line
      const m = this.mouth(), p = s.player;
      const ang = Math.atan2(p.body.center.y - m.y, Math.abs(p.body.center.x - m.x));
      const clamped = Phaser.Math.Clamp(ang, -0.5, 0.6);
      this.aimAngle = this.facing > 0 ? clamped : Math.PI - clamped;
      this.telegraph(0xff6080); Sfx.play('telegraph');
    }
  }
  afterTick() { this.anim(this.mode === 'aim' || this.mode === 'fire' ? 'cero' : 'idle'); }
  onDie() { this.gfx.destroy(); }
}


// Corrupted Kido master: it never closes in. It keeps its distance, backs away if you
// come near, and every so often charges a blue bala and fires it at where you stand.
class KidoCaster extends Enemy {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'caster', { hp: 34, dmg: 1, drop: 8, bw: 10, bh: 20, kind: 'caster', kb: 0.8, burst: 0x5a7ad8, frame: 'idle0', frameFeet: HF.FEET });
    this.mode = 'watch'; this.mt = 0.9;
    this.anim('idle');
  }
  afterTick() {
    if (this.mode === 'aim' || this.mode === 'cool') this.anim('cast');
    else this.moveAnim(70);
  }
  think(dt) {
    const b = this.body, s = this.scene;
    const { dx, dy } = this.playerDelta();
    const d = Math.abs(dx);
    this.mt -= dt;
    this.faceTo(s.player.x);
    switch (this.mode) {
      case 'watch': {
        let vx = 0;
        if (d < 90 && this.groundAhead(-this.facing) && !this.wallAhead(-this.facing)) vx = -this.facing * 70;       // too close: back away
        else if (d > 190 && d < 320 && this.groundAhead(this.facing) && !this.wallAhead(this.facing)) vx = this.facing * 35;   // too far: drift in
        b.setVelocityX(b.blocked.down ? vx : b.velocity.x);
        if (this.mt <= 0 && d < 290 && Math.abs(dy) < 80 && this.sees()) {
          this.mode = 'aim'; this.mt = 0.62; b.setVelocityX(0);
          this.telegraph(0x7fa8ff); Sfx.play('telegraph');
        }
        break;
      }
      case 'aim':
        b.setVelocityX(0);
        if (Math.random() < 0.5) s.fx.motes(this.x + this.facing * 9, this.y - 4, 0x7fa8ff, 1);
        if (this.mt <= 0) {
          this.untelegraph();
          const a = Math.atan2(s.player.body.center.y - (this.y - 4), s.player.x - this.x);
          new EnemyShot(s, this.x + this.facing * 9, this.y - 4, 'bala', Math.cos(a) * 235, Math.sin(a) * 235, { dmg: 1, life: 2.4, tint: 0x8ab4ff, scale: 1.25, burst: 0x8ab4ff, owner: this });
          Sfx.play('hado');
          this.mode = 'cool'; this.mt = 0.55;
        }
        break;
      case 'cool':
        b.setVelocityX(0);
        if (this.mt <= 0) { this.mode = 'watch'; this.mt = 1.4; }
        break;
    }
  }
}

// Pale Hollow that hangs from the ceiling. When you pass beneath it quivers, then drops
// on you in a straight line, and afterwards crawls back up to hang again.
class Diver extends Enemy {
  constructor(scene, x, ceilY) {
    super(scene, x, ceilY + 11, 'hollow', { hp: 12, dmg: 1, drop: 3, bw: 12, bh: 10, kind: 'diver', fly: true, kb: 0.8, burst: 0x6a78c8, frame: 'fly0', frameFeet: 17 });
    this.baseTint = 0x9aa8ff;
    this.tintState = this.baseTint; this.refreshTint();
    this.home = { x, y: this.y };
    this.mode = 'hang'; this.mt = 0;
    this.anim('fly');
    this.facing = -1;
  }
  untelegraph() { this.tintState = this.baseTint; if (this.flashT <= 0) this.refreshTint(); this.warn(false); }
  afterTick() {
    if (this.anims.currentAnim) this.anims.timeScale = this.mode === 'hang' ? 0.15 : this.mode === 'dive' ? 1.8 : 1;
  }
  think(dt) {
    const b = this.body, s = this.scene;
    const { dx, dy } = this.playerDelta();
    this.mt -= dt;
    switch (this.mode) {
      case 'hang':
        b.setVelocity(0, 0);
        this.facing = Math.sign(dx) || this.facing;
        if (Math.abs(dx) < 34 && dy > 12 && dy < 200 && this.sees(4)) { this.mode = 'shake'; this.mt = 0.42; this.telegraph(0xff6060); Sfx.play('telegraph'); }
        break;
      case 'shake':
        b.setVelocity(0, 0);
        this.x = this.home.x + (Math.random() - 0.5) * 3;
        if (this.mt <= 0) {
          this.untelegraph();
          const a = Math.atan2(s.player.body.center.y - this.y, s.player.x - this.x);
          b.setVelocity(Math.cos(a) * 300, Math.sin(a) * 300);
          this.mode = 'dive'; this.mt = 1.0; Sfx.play('dash');
        }
        break;
      case 'dive':
        this.facing = Math.sign(b.velocity.x) || this.facing;
        if (Math.random() < 0.5) s.fx.afterimage(this, 0x9aa8ff, 0.35, 180);
        if (b.blocked.down || b.blocked.up || b.blocked.left || b.blocked.right || this.mt <= 0) {
          b.setVelocity(0, 0); this.mode = 'rest'; this.mt = 0.6;
          s.fx.dust(this.x, b.bottom, 4);
        }
        break;
      case 'rest':
        b.setVelocity(0, 0);
        if (this.mt <= 0) this.mode = 'return';
        break;
      case 'return': {
        // crawl home along open air (a field built once toward its perch), not through the floor
        if (!this.homeFlow) this.homeFlow = new FlowField(s, () => this.home, 0, 60);
        this.homeFlow.update(dt);
        const dist = Math.hypot(this.home.x - this.x, this.home.y - this.y);
        if (dist < 4) { b.reset(this.home.x, this.home.y); this.mode = 'hang'; break; }
        const tgt = this.homeFlow.steer(this.x, this.y, this.home.x, this.home.y, 5) || this.home;
        const rx = tgt.x - this.x, ry = tgt.y - this.y, rd = Math.hypot(rx, ry) || 1;
        const k = Math.min(1, dt * 6);
        b.velocity.x += (rx / rd * 85 - b.velocity.x) * k;
        b.velocity.y += (ry / rd * 85 - b.velocity.y) * k;
        break;
      }
    }
  }
}


// ---------------------------------------------------------------------------
// Acidwire: a lizard-shaped Hollow of the Karakura riverbanks. It creeps along,
// and when it sees you it rears back and lobs a burning glob that lands where you stand.
class Crawler extends Enemy {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'crawler', { hp: 16, dmg: 1, drop: 4, bw: 18, bh: 11, kind: 'crawler', kb: 0.8, burst: 0x6a8a3a, frame: 'run0', frameFeet: 24 });
    this.mode = 'patrol'; this.mt = 0.8;
    this.facing = Math.random() < 0.5 ? -1 : 1;
  }
  afterTick() {
    if (this.mode === 'aim') this.anim('windup');
    else if (this.mode === 'spit') this.anim('spit');
    else if (Math.abs(this.body.velocity.x) > 6) this.anim('run', 0.8);
    else this.anim('idle');
  }
  think(dt) {
    const b = this.body, s = this.scene, p = s.player;
    const { dx, dy } = this.playerDelta();
    this.mt -= dt;
    if (this.mode === 'aim') {
      b.setVelocityX(approach(b.velocity.x, 0, 600 * dt));
      if (this.mt <= 0) {
        this.untelegraph();
        // a lob that comes down on the player's feet
        const T = Phaser.Math.Clamp(Math.abs(dx) / 150, 0.45, 0.95), g = PHYS.gravity;
        const tx = p.x - (this.x + this.facing * 16), ty = p.body.bottom - 6 - (this.y - 2);
        new EnemyShot(s, this.x + this.facing * 16, this.y - 2, 'acid', tx / T, (ty - 0.5 * g * T * T) / T,
          { gravity: true, dmg: 1, life: 2.2, size: 8, tint: 0x9aff6a, burst: 0x9aff6a, owner: this, splash: true });
        Sfx.play('spit');
        this.mode = 'spit'; this.mt = 0.35;
      }
      return;
    }
    if (this.mode === 'spit') { b.setVelocityX(0); if (this.mt <= 0) { this.mode = 'patrol'; this.mt = 1.6; } return; }
    if (!b.blocked.down) return;
    if (this.wallAhead(this.facing) || !this.groundAhead(this.facing)) this.facing *= -1;
    if (this.mt <= 0 && Math.abs(dx) < 170 && Math.abs(dy) < 100 && this.sees()) {
      this.faceTo(p.x);
      this.mode = 'aim'; this.mt = 0.55;
      this.telegraph(0xc8ff80); Sfx.play('telegraph');
      return;
    }
    b.setVelocityX(approach(b.velocity.x, this.facing * 38, 300 * dt));
  }
}

// Onmitsukido agent (the Stealth Force): throws a fan of kunai, vanishes,
// and comes back out of the air behind you with a short blade.
class Onmitsu extends Enemy {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'onmitsu', { hp: 22, dmg: 1, drop: 6, bw: 10, bh: 20, kind: 'onmitsu', kb: 0.7, burst: 0x34303e, frame: 'idle0', frameFeet: HF.FEET });
    this.mode = 'watch'; this.mt = 0.8;
    this.home = { x, feet };
    this.anim('idle');
  }
  hittable() { return this.alive && !this.invulnerable && this.mode !== 'gone'; }
  get contactDamage() { return this.mode === 'gone' ? 0 : super.contactDamage; }
  afterTick() {
    switch (this.mode) {
      case 'throw': this.anim('cast'); break;
      case 'windup': this.anim('windup'); break;
      case 'strike': this.anim('strike'); break;
      case 'gone': case 'appear': this.anim('dash'); break;
      default: this.moveAnim(90);
    }
  }
  think(dt) {
    const b = this.body, s = this.scene, p = s.player;
    const { dx, dy } = this.playerDelta();
    this.mt -= dt;
    switch (this.mode) {
      case 'watch':
        this.faceTo(p.x);
        b.setVelocityX(approach(b.velocity.x, 0, 500 * dt));
        if (this.mt <= 0 && Math.abs(dx) < 230 && Math.abs(dy) < 90 && this.sees()) {
          this.mode = 'throw'; this.mt = 0.38; this.telegraph(0xd0d0e0); Sfx.play('telegraph');
        }
        break;
      case 'throw':
        if (this.mt <= 0) {
          this.untelegraph();
          const a = Math.atan2(p.body.center.y - (this.y - 3), p.x - this.x);
          [-0.16, 0, 0.16].forEach(o => new EnemyShot(s, this.x + this.facing * 8, this.y - 3, 'kunai', Math.cos(a + o) * 290, Math.sin(a + o) * 290, { dmg: 1, life: 1.6, rotate: true, w: 8, h: 4, owner: this }));
          Sfx.play('throw');
          this.mode = 'vanish'; this.mt = 0.3;
        }
        break;
      case 'vanish':
        if (this.mt <= 0) {
          s.fx.afterimage(this, 0x16141c, 0.7, 260);
          s.fx.dust(this.x, b.bottom, 4);
          this.setAlpha(0); this.mode = 'gone'; this.mt = 0.55;
          Sfx.play('dash');
        }
        break;
      case 'gone': {
        b.setVelocity(0, 0);
        if (this.mt > 0) break;
        // reappear just behind the player, on solid ground, or fall back home
        const feet = p.body.bottom, cands = [p.x - p.facing * 36, p.x + p.facing * 36];
        const spot = cands.find(tx => s.isGroundAt(tx, feet + 4) && !s.isSolidAt(tx, feet - 8) && !s.isSolidAt(tx, feet - 20) && !s.nearHazard(tx, feet - 6) && tx > 16 && tx < s.pxW - 16);
        if (spot !== undefined && p.state !== 'dead' && Math.abs(dy) < 120) b.reset(spot, feet - 10);
        else b.reset(this.home.x, this.home.feet - 10);
        this.faceTo(p.x);
        s.tweens.add({ targets: this, alpha: 1, duration: 140 });
        s.fx.afterimage(this, 0x6a6878, 0.5, 200);
        this.mode = 'windup'; this.mt = 0.32; this.telegraph(0xff7070); Sfx.play('telegraph');
        break;
      }
      case 'windup':
        b.setVelocityX(0);
        if (this.mt <= 0) {
          this.untelegraph();
          const f = this.facing;
          b.setVelocityX(this.groundAhead(f) ? f * 150 : 0);
          this.scene.addHurt(0, 0, 24, 18, 1, 0.14, (h) => { h.x = this.x + (f > 0 ? 2 : -26); h.y = this.y - 9; }, this);
          s.fx.slashArc(this.x + f * 12, this.y, f, 0xe8ecf0, 0.8);
          Sfx.play('slash');
          this.mode = 'strike'; this.mt = 0.2;
        }
        break;
      case 'strike':
        if (!this.groundAhead(this.facing)) b.setVelocityX(0);
        if (this.mt <= 0) { this.mode = 'recover'; this.mt = 0.6; b.setVelocityX(0); }
        break;
      case 'recover':
        b.setVelocityX(approach(b.velocity.x, 0, 600 * dt));
        if (this.mt <= 0) { this.mode = 'watch'; this.mt = 1.3; }
        break;
    }
  }
}

// Exequias: the executioners of Las Noches. They square up, then cut straight
// through you with Sonido and turn around on the far side. Usually in pairs.
class Exequias extends Enemy {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'exequias', { hp: 40, dmg: 1, drop: 10, bw: 10, bh: 20, kind: 'exequias', kb: 0.5, burst: 0x1a1820, frame: 'idle0', frameFeet: HF.FEET });
    this.mode = 'stalk'; this.mt = Math.random() * 0.8;
    this.anim('idle');
  }
  afterTick() {
    switch (this.mode) {
      case 'windup': this.anim('windup'); break;
      case 'dash': this.anim('dash'); break;
      case 'recover': this.anim('recover'); break;
      default: this.moveAnim(80);
    }
  }
  think(dt) {
    const b = this.body, s = this.scene, p = s.player;
    const { dx, dy } = this.playerDelta();
    this.mt -= dt;
    switch (this.mode) {
      case 'stalk': {
        this.faceTo(p.x);
        const want = Math.abs(dx) > 110 ? this.facing * 70 : Math.abs(dx) < 60 ? -this.facing * 40 : 0;
        const ok = this.groundAhead(Math.sign(want) || this.facing) && !this.wallAhead(Math.sign(want) || this.facing);
        b.setVelocityX(approach(b.velocity.x, ok && Math.abs(dy) < 80 ? want : 0, 500 * dt));
        if (this.mt <= 0 && Math.abs(dx) < 150 && Math.abs(dy) < 40 && this.sees()) {
          this.mode = 'windup'; this.mt = 0.45; b.setVelocityX(0); this.telegraph(0xff4050); Sfx.play('telegraph');
        }
        break;
      }
      case 'windup':
        b.setVelocityX(0);
        if (this.mt <= 0) {
          this.untelegraph();
          this.dashDir = this.facing; this.mode = 'dash'; this.mt = 0.24; this.cut = new Set();
          Sfx.play('dash');
        }
        break;
      case 'dash': {
        const f = this.dashDir;
        b.setVelocityX(this.groundAhead(f) && !this.wallAhead(f) ? f * 520 : 0);
        if (Math.random() < 0.7) s.fx.afterimage(this, 0xff4050, 0.35, 180);
        const r = new Phaser.Geom.Rectangle(this.x - 10, this.y - 10, 20, 20);
        if (p.state !== 'dead' && Phaser.Geom.Intersects.RectangleToRectangle(r, bodyRect(p.body))) p.takeDamage(1, this.x - f * 10);
        s.friendlyHit(r, this, FRIENDLY.charge, f, this.cut);
        if (this.mt <= 0 || b.velocity.x === 0) {
          b.setVelocityX(0);
          s.fx.slashArc(this.x - f * 10, this.y, -f, 0xff8090, 1.1);
          Sfx.play('slash');
          this.mode = 'recover'; this.mt = 0.55;
        }
        break;
      }
      case 'recover':
        b.setVelocityX(approach(b.velocity.x, 0, 900 * dt));
        if (this.mt <= 0) { this.mode = 'stalk'; this.mt = 0.9; }
        break;
    }
  }
}

// A brawler of the Eleventh Division: sees you, charges, and swings three times.
// It never looks where it runs, so a ledge or a spike pit can end the charge for you.
class Brawler extends Enemy {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'brawler', { hp: 34, dmg: 1, drop: 8, bw: 11, bh: 21, kind: 'brawler', kb: 0.6, burst: 0xd8a882, frame: 'idle0', frameFeet: HF.FEET });
    this.mode = 'patrol'; this.mt = 0.5;
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.anim('idle');
  }
  afterTick() {
    switch (this.mode) {
      case 'charge': this.anim('run', 1.4); break;
      case 'windup': this.anim('windup'); break;
      case 'strike': this.anim('strike'); break;
      case 'recover': this.anim('recover'); break;
      default: this.moveAnim(110);
    }
  }
  think(dt) {
    const b = this.body, s = this.scene, p = s.player;
    const { dx, dy } = this.playerDelta();
    this.mt -= dt;
    switch (this.mode) {
      case 'patrol':
        if (b.blocked.down && (this.wallAhead(this.facing) || !this.groundAhead(this.facing))) this.facing *= -1;
        b.setVelocityX(approach(b.velocity.x, this.facing * 42, 400 * dt));
        if (this.mt <= 0 && Math.abs(dx) < 190 && Math.abs(dy) < 50 && this.sees()) {
          this.faceTo(p.x); this.mode = 'charge'; this.mt = 1.6; Sfx.play('roarSmall');
        }
        break;
      case 'charge':
        if (b.blocked.down) b.setVelocityX(approach(b.velocity.x, this.facing * 190, 900 * dt));
        if (Math.random() < 0.3 && b.blocked.down) s.fx.dust(this.x - this.facing * 6, b.bottom, 1);
        if (Math.abs(dx) < 30 && Math.abs(dy) < 30) { this.mode = 'windup'; this.mt = 0.2; this.hits = 3; this.telegraph(0xffb060); }
        else if (this.mt <= 0 || this.wallAhead(this.facing) || Math.sign(dx) !== this.facing) { this.mode = 'recover'; this.mt = 0.5; }
        break;
      case 'windup':
        b.setVelocityX(approach(b.velocity.x, 0, 1200 * dt));
        if (this.mt <= 0) {
          this.untelegraph();
          const f = this.facing;
          this.scene.addHurt(0, 0, 26, 20, 1, 0.12, (h) => { h.x = this.x + (f > 0 ? 2 : -28); h.y = this.y - 10; }, this);
          s.fx.slashArc(this.x + f * 13, this.y, f, 0xffe0a0, 0.9);
          Sfx.play('slash');
          b.setVelocityX(f * 80);
          this.mode = 'strike'; this.mt = 0.18;
        }
        break;
      case 'strike':
        if (this.mt <= 0) {
          if (--this.hits > 0) { this.faceTo(p.x); this.mode = 'windup'; this.mt = 0.12; }
          else { this.mode = 'recover'; this.mt = 0.85; b.setVelocityX(0); this.telegraph(0x8080a0); }
        }
        break;
      case 'recover':
        b.setVelocityX(approach(b.velocity.x, 0, 800 * dt));
        if (this.mt <= 0) { this.untelegraph(); this.mode = 'patrol'; this.mt = 0.7; }
        break;
    }
  }
}

// Ganju Shiba, fighting for real (his rematch in Inuzuri): he rushes in swinging, lobs fireworks when
// you keep away, leaps on you when you climb, and yields instead of dying
class GanjuFighter extends Enemy {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'ganju_f', { hp: 130, dmg: 1, drop: 0, bw: 11, bh: 21, kind: 'ganju', kb: 0.3, burst: 0xc84a3a, frame: 'idle0', frameFeet: HF.FEET });
    this.mode = 'stalk'; this.mt = 0.9; this.tossT = 1.5; this.hits = 0;
    this.anim('idle');
  }
  afterTick() {
    switch (this.mode) {
      case 'windup': this.anim('windup'); break;
      case 'strike': this.anim('strike'); break;
      case 'recover': this.anim('recover'); break;
      case 'toss': this.anim('cast'); break;
      case 'leap': this.anim('run', 0.4); break;
      default: this.moveAnim(120);
    }
  }
  think(dt) {
    const b = this.body, s = this.scene, p = s.player;
    const { dx, dy } = this.playerDelta(), dist = Math.abs(dx);
    this.mt -= dt; this.tossT -= dt;
    switch (this.mode) {
      case 'stalk':
        this.faceTo(p.x);
        b.setVelocityX(approach(b.velocity.x, dist > 30 ? this.facing * 95 : 0, 700 * dt));
        if (this.mt > 0 || !b.blocked.down) break;
        if (dist < 40 && Math.abs(dy) < 30) { this.mode = 'windup'; this.mt = 0.36; this.hits = 2; this.telegraph(0xffa060); Sfx.play('telegraph'); }
        else if (dy < -50 && dist < 130) { this.mode = 'leap'; this.leap(p.x); }
        else if (dist > 90 && this.tossT <= 0) { this.mode = 'toss'; this.mt = 0.45; this.tossT = 2.6; b.setVelocityX(0); this.telegraph(0xff8a3a); Sfx.play('charge'); }
        break;
      case 'windup':
        b.setVelocityX(approach(b.velocity.x, 0, 1200 * dt));
        if (this.mt <= 0) {
          this.untelegraph();
          const f = this.facing;
          s.addHurt(0, 0, 28, 20, 1, 0.13, (h) => { h.x = this.x + (f > 0 ? 2 : -30); h.y = this.y - 10; }, this);
          s.fx.slashArc(this.x + f * 14, this.y, f, 0xffc080, 1);
          Sfx.play('slash');
          b.setVelocityX(f * 110);
          this.mode = 'strike'; this.mt = 0.2;
        }
        break;
      case 'strike':
        if (this.mt <= 0) {
          if (--this.hits > 0) { this.faceTo(p.x); this.mode = 'windup'; this.mt = 0.16; this.telegraph(0xffa060); }
          else { this.mode = 'recover'; this.mt = 0.75; b.setVelocityX(0); this.telegraph(0x8080a0); }
        }
        break;
      case 'toss':
        if (this.mt <= 0) {
          this.untelegraph();
          // a firework lobbed to land where you stand
          const T = 0.85, vx = Phaser.Math.Clamp(dx / T, -280, 280), vy = (dy - 0.5 * PHYS.gravity * T * T) / T;
          new EnemyShot(s, this.x + this.facing * 6, this.y - 8, 'acid', vx, Math.max(-520, vy), { gravity: true, dmg: 1, life: 2.5, burst: 0xff8a3a, splash: true, tint: 0xff9a40, owner: this });
          Sfx.play('throw');
          this.mode = 'recover'; this.mt = 0.35;
        }
        break;
      case 'leap':
        if (this.mt <= 0 && b.blocked.down) {
          b.setVelocityX(0);
          s.fx.dust(this.x, b.bottom, 10); s.fx.shake(180, 0.008); Sfx.play('land');
          s.spawnShock(this.x - 6, b.bottom, -1); s.spawnShock(this.x + 6, b.bottom, 1);
          this.mode = 'recover'; this.mt = 0.6; this.telegraph(0x8080a0);
        }
        break;
      case 'recover':
        b.setVelocityX(approach(b.velocity.x, 0, 900 * dt));
        if (this.mt <= 0) { this.untelegraph(); this.mode = 'stalk'; this.mt = 0.4; }
        break;
    }
  }
  leap(tx) {
    const T = 0.8;
    this.body.setVelocity(Phaser.Math.Clamp((tx - this.x) / T, -220, 220), -PHYS.gravity * T / 2);
    this.mt = 0.2;
    Sfx.play('jump');
  }
  // He does not die: he sits down hard and gives up
  die(dirX) {
    const s = this.scene;
    this.alive = false;
    this.body.enable = false;
    this.untelegraph();
    if (this.warnMark) { this.warnMark.destroy(); this.warnMark = null; }
    s.hitStop(0.25);
    s.fx.burst(this.x, this.y, 0xff8a3a, 18);
    s.fx.dust(this.x, this.y + 10, 10);
    Sfx.play('hit');
    this.anim('hurt');
    s.tweens.add({ targets: this, alpha: 0, delay: 650, duration: 350, onComplete: () => this.destroy() });
    s.time.delayedCall(700, () => { if (s.sys.isActive() && s.duel) s.duelWon(this); });
  }
}
