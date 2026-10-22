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
    this.hp = this.maxHp = cfg.hp;
    this.dmg = cfg.dmg ?? 1;
    this.drop = cfg.drop ?? 2;
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
  }

  anim(name, timeScale = 1) {
    const key = this.sheet + ':' + name;
    if (!this.anims.currentAnim || this.anims.currentAnim.key !== key) this.play(key);
    this.anims.timeScale = timeScale;
  }
  // Humanoids: idle / run picked from movement
  moveAnim(speed = 150) {
    const vx = Math.abs(this.body.velocity.x);
    if (vx > 8) this.anim('run', Phaser.Math.Clamp(vx / speed, 0.4, 1.3)); else this.anim('idle');
  }

  // A boss that cannot be hurt (intro, blink, transformation) cannot hurt by touch either
  get contactDamage() { return this.alive && this.boundT <= 0 && !this.harmless && !(this.isBoss && this.invulnerable) ? this.dmg : 0; }
  hittable() { return this.alive && !this.invulnerable; }

  tick(dt) {
    if (!this.alive) return;
    this.dt = dt;
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
  telegraph(color) { this.tintState = color; if (this.flashT <= 0) this.refreshTint(); }
  untelegraph() { this.tintState = 0; if (this.flashT <= 0) this.refreshTint(); }

  hit(dmg, dirX, o = {}) {
    if (!this.alive || this.invulnerable) return 'none';
    if (this.blocks && this.blocks(dirX, o)) return 'block';
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
    s.spawnShards(this.x, this.y, this.drop);
    s.fx.kill(this, dirX || 0);
    Sfx.play('hit');
    this.onDie && this.onDie();
    this.anims.pause();
    this.setTintFill(0xffffff);
    // dissolve upward into reishi
    s.tweens.add({ targets: this, alpha: 0, scaleX: 0.6, scaleY: 1.25, y: this.y - 8, duration: 420, ease: 'Cubic.in', onComplete: () => this.destroy() });
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
        this.scene.addHurt(0, 0, 30, 18, 1, 0.15, (h) => { h.x = this.x + (f > 0 ? 2 : -32); h.y = this.y - 9; });
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
          this.scene.addHurt(0, 0, 26, 20, 1, 0.2, (h) => { h.x = this.x + (f > 0 ? 2 : -28); h.y = this.y - 10; });
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

// Lesser Hollow: small flyer that drifts near home, then swoops at the player
class Hollow extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y + 5, 'hollow', { hp: 8, dmg: 1, drop: 1, bw: 12, bh: 10, kind: 'hollow', fly: true, kb: 1.4, frame: 'fly0', frameFeet: 17 });
    this.anim('fly');
    this.home = { x, y };
    this.mode = 'idle';
    this.clk = Math.random() * 10;
  }
  // After landing a hit, peel away for a moment instead of swarming an invulnerable player
  onContact() { this.mode = 'retreat'; this.retreatT = 0.9; }
  think(dt) {
    const b = this.body;
    const { dx, dy } = this.playerDelta();
    const d = Math.hypot(dx, dy) || 1;
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
      b.setVelocity((tx - this.x) * 2.2, (ty - this.y) * 2.2);
      if (d < 170) { this.mode = 'chase'; Sfx.play('telegraph'); }
      this.facing = Math.sign(b.velocity.x) || this.facing;
    } else {
      const sp = 125;
      const k = Math.min(1, dt * 2.4);
      b.velocity.x += (dx / d * sp - b.velocity.x) * k;
      b.velocity.y += (dy / d * sp - b.velocity.y) * k;
      this.facing = Math.sign(dx) || this.facing;
      if (d > 340) this.mode = 'idle';
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
      if (this.mt <= 0) { this.untelegraph(); this.mode = 'charge'; this.mt = 1.1; Sfx.play('dash'); }
    } else if (this.mode === 'charge') {
      b.setVelocityX(this.facing * 230);
      if (Math.random() < 0.4) this.scene.fx.dust(this.x - this.facing * 10, b.bottom, 1);
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
      if (Math.hypot(dx, dy) < 240 && this.mt <= 0) { this.mode = 'aim'; this.mt = 0.6; this.telegraph(0x40e0ff); Sfx.play('telegraph'); }
    } else if (this.mode === 'aim') {
      if (this.mt <= 0) {
        this.untelegraph();
        const a = Math.atan2(dy, dx);
        new EnemyShot(s, this.x + this.facing * 8, this.y - 4, 'bala', Math.cos(a) * 210, Math.sin(a) * 210, { dmg: 1, life: 2.5, tint: 0x40e0ff });
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
      if (this.mt <= 0) { this.mode = 'cool'; this.mt = 2.4; g.clear(); }
      return;
    }
    if (this.mode === 'cool' && this.mt <= 0) this.mode = null;
    if (b.blocked.down && (this.wallAhead(this.facing) || !this.groundAhead(this.facing))) this.facing *= -1;
    b.setVelocityX(this.facing * 18);
    const sees = Math.abs(dy) < 50 && Math.abs(dx) < 280;
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
