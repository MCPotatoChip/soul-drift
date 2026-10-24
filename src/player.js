'use strict';
// ---------------------------------------------------------------------------
// Player: a small state machine on top of an Arcade Physics sprite.
// States: normal, dash, cling, heal, konso, charge, burst, hurt, stunned,
//         locked (dialogs / resting), dead
// ---------------------------------------------------------------------------

class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, feetY) {
    super(scene, x, feetY - 12, 'ichigo', 'idle0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Origin sits 12px above the feet so `y` keeps meaning "body centre - 2"
    this.setOrigin(0.5, (HF.FEET - 12) / HF.H);
    this.body.setSize(10, 20).setOffset((HF.W - 10) / 2, HF.FEET - 20);
    this.body.reset(x, feetY - 12);
    this.setDepth(20);
    this.atkAnimT = 0; this.atkAnim = 'slashA'; this.castT = 0;
    this.poseName = null; this.poseT = 0; this.idleT = 0; this.waking = false;
    this.play('ichigo:idle');
    this.facing = 1;
    this.state = 'normal';
    this.t = { coyote: 0, buffer: 0, dashCD: 0, atkCD: 0, invuln: 0, wallLock: 0, drop: 0, hurt: 0, recoil: 0, kido: 0, state: 0, after: 0, beat: 0 };
    this.airJumps = 0;
    this.canDash = true;
    this.jumping = false;
    this.wallDir = 0;
    this.awayT = 0;
    this.graceT = 0;
    this.lastSafe = { x, y: feetY };
    this.safeTrail = [];
    this.wasGrounded = true;
    this.swingAlt = false;
    this.healBase = 0; this.healProg = 0;
    this.charge = 0;
    this.env = { sand: false, pressure: false };   // quicksand under the feet, spirit pressure around the body
    this.aura = scene.add.particles(0, 0, 'dot', {
      speed: { min: 10, max: 40 }, angle: { min: 250, max: 290 }, lifespan: 500,
      scale: { start: 0.7, end: 0 }, alpha: { start: 0.7, end: 0 }, frequency: 40, emitting: false, tint: 0xc8202c,
    }).setDepth(19);
    this.aura.startFollow(this, 0, 4);
    this.ring = scene.add.graphics().setDepth(27);   // charge progress (heal, Konso, Burst, Getsuga)
  }

  // A ring that fills around the body while something is charging, and pulses when it is ready
  drawRing() {
    const g = this.ring;
    g.clear();
    let p = 0, col = 0xffffff;
    if (this.state === 'heal') { p = this.healProg / this.healTime(); col = 0xe8f4ff; }
    else if (this.state === 'konso') { p = this.charge / 0.45; col = 0xbfe6ff; }
    else if (this.state === 'charge') { p = this.charge / this.chargeNeed(); col = 0xff8a3a; }
    else if (this.gHold > 0.15 && GS.has('getsuga')) { p = this.gHold / (COMBAT.getsugaCharge * (GS.sealOn('moonfang') ? 0.6 : 1)); col = this.bankai ? 0xc8202c : 0x9ac8ff; }
    if (p <= 0.02) return;
    const ready = p >= 1;
    p = Math.min(1, p);
    const x = this.x, y = this.body.center.y, r = 19, now = this.scene.time.now;
    g.lineStyle(3, 0x07070b, 0.45).strokeCircle(x, y, r);
    g.lineStyle(2, col, ready ? 1 : 0.85).beginPath().arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p, false).strokePath();
    if (ready) g.lineStyle(1, col, 0.4 + 0.3 * Math.sin(now / 70)).strokeCircle(x, y, r + 3 + Math.sin(now / 90) * 1.5);
  }

  placeFeet(x, feetY) { this.body.reset(x, feetY - 12); }
  // Hold a clip (raise, pray, rise) for `t` seconds while standing still
  setPose(name, t) { this.poseName = name; this.poseT = t; this.play(this.sheetKey() + ':' + name); }
  // Wake at a rest gate after dying: lying down, then up onto both feet
  startWake() {
    this.state = 'locked'; this.waking = true; this.t.wake = 0.74;
    this.setPose('rise', 0.74);
    this.scene.fx.motes(this.x, this.y + 8, 0xffe8b0, 10);
  }
  // Brief stretch / squash that eases back to normal (landing, jumping)
  squash(sx, sy, ms = 120) {
    if (this.state === 'dead') return;
    this.scene.tweens.killTweensOf(this);
    this.setScale(sx, sy);
    this.scene.tweens.add({ targets: this, scaleX: 1, scaleY: 1, duration: ms, ease: 'Quad.out' });
  }
  get grounded() { return this.body.blocked.down || this.body.touching.down; }
  get bankai() { return GS.run.bankaiT > 0; }

  speedMul() { return (this.bankai ? 1.15 : 1) * (GS.run.maskOn ? 1.1 : 1); }
  dmgMul() { return (GS.sealOn('edge') ? 1.4 : 1) * (GS.sealOn('might') ? 1.2 : 1) * (GS.run.maskOn ? 1.5 : 1) * (this.bankai ? 1.8 : 1) * this.bellMul() * (GS.sealOn('pride') && GS.data.hp === 1 ? 1.75 : 1); }
  // Bell of the Eleventh: each strike that follows quickly on the last hits a little harder
  bellMul() { return GS.sealOn('bell') && this.bellT > 0 ? 1 + Math.min(COMBAT.bellMax, this.bellN * COMBAT.bellStep) : 1; }
  landedHit() {
    if (!GS.sealOn('bell')) return;
    this.bellN = this.bellT > 0 ? Math.min(4, (this.bellN || 0) + 1) : 0;
    this.bellT = 0.9;
    if (this.bellN > 0) { Sfx.play('bell'); this.scene.fx.ring(this.x, this.body.center.y, 0xf2d040, 14 + this.bellN * 4, 220, 1); }
  }
  formReiatsu() { return GS.form().rei; }
  kidoCost(base) { return Math.round(base * (GS.sealOn('shiba') ? 0.75 : 1)); }
  // Orihime's gift (Sōten Kisshun) takes a quarter off every heal
  healTime() { return (GS.sealOn('quick') ? COMBAT.quickHealTime : COMBAT.healTime) * (GS.data.quests.orihime === 2 ? 0.75 : 1); }
  healCost() { return COMBAT.spellCost - (GS.sealOn('kaido') ? COMBAT.kaidoDiscount : 0); }
  // Caught by a binding Kido: held in place for a moment
  bindStun(t) {
    if (this.state === 'dead') return;
    if (['cling', 'dash', 'charge', 'burst'].includes(this.state)) this.body.setAllowGravity(true);
    this.state = 'stunned'; this.t.state = t;
    this.body.setVelocity(0, this.body.velocity.y);
    this.boundT = t;
    Sfx.play('bakudo');
  }
  spellMul() { return (GS.sealOn('focus') ? 1.5 : 1) * (GS.run.maskOn ? 1.3 : 1) * (this.bankai ? 1.3 : 1) * (1 + 0.2 * GS.upgrade('kidoPower')); }
  // How much larger the Kidō bolts and blasts grow (Kidō Reach)
  chargeNeed() { return PHYS.burstCharge * (1 - 0.15 * GS.upgrade('burstDrive')); }
  kidoSize() { return 1 + 0.25 * GS.upgrade('kidoReach'); }

  touchingWall(dir, lowOnly) {
    const b = this.body, s = this.scene;
    const x = dir > 0 ? b.right + 2 : b.left - 2;
    if (lowOnly) return s.isSolidAt(x, b.bottom - 4);
    return s.isSolidAt(x, b.center.y) && s.isSolidAt(x, b.bottom - 4);
  }
  onOneWay() {
    const b = this.body, s = this.scene, y = b.bottom + 3;
    return !s.isSolidAt(b.left + 1, y) && !s.isSolidAt(b.right - 1, y) && (s.isOneWayAt(b.center.x, y) || s.isOneWayAt(b.left + 1, y) || s.isOneWayAt(b.right - 1, y));
  }

  update(dt) {
    const s = this.scene, inp = s.inp, body = this.body;
    for (const k in this.t) if (this.t[k] > 0) this.t[k] -= dt;
    if (this.bellT > 0) this.bellT -= dt;
    if (this.boundT > 0) this.boundT -= dt;

    if (this.state === 'dead') { body.setVelocity(0, 0); return; }

    const grounded = this.grounded;
    if (grounded && !this.wasGrounded && body.velocity.y >= 0) {
      Sfx.play('land'); s.fx.dust(this.x, body.bottom, 5);
      if (this.airT > 0.25) { this.landT = 0.13; this.squash(1.2, 0.8, 130); s.fx.dust(this.x - 8, body.bottom, 3); s.fx.dust(this.x + 8, body.bottom, 3); }
    }
    this.airT = grounded ? 0 : (this.airT || 0) + dt;
    this.wasGrounded = grounded;
    // Quicksand is not ground, but you can still kick off it (feebly)
    if (grounded || this.env.sand) {
      this.t.coyote = PHYS.coyote;
      this.airJumps = GS.has('wings') ? 1 : 0;
      this.canDash = true;
    }
    if (inp.jumpP) this.t.buffer = PHYS.jumpBuffer;

    this.updatePowers(dt, inp);

    switch (this.state) {
      case 'locked':
        body.setVelocityX(0);
        if (this.waking && this.t.wake <= 0) { this.waking = false; this.state = 'normal'; }
        break;
      case 'hurt': if (this.t.hurt <= 0) this.state = 'normal'; break;
      case 'stunned': body.setVelocityX(approach(body.velocity.x, 0, 900 * dt)); if (this.t.state <= 0) this.state = 'normal'; break;
      case 'dash': this.updateDash(dt, inp); break;
      case 'heal': this.updateHeal(dt, inp); break;
      case 'konso': this.updateKonso(dt, inp); break;
      case 'charge': this.updateCharge(dt, inp); break;
      case 'burst': this.updateBurst(dt, inp); break;
      case 'cling': this.updateCling(dt, inp); break;
      default: this.updateNormal(dt, inp, grounded);
    }
    // Spirit pressure: the air itself pushes down
    if (this.env.pressure && body.allowGravity && this.state !== 'dash') body.velocity.y += PHYS.gravity * 0.6 * dt;
    if (body.velocity.y > PHYS.maxFall) body.velocity.y = PHYS.maxFall;
    this.updateGetsuga(dt, inp);
    this.updateVisual(dt);
    this.updateSafe();
  }

  // ---------------- normal movement ----------------
  updateNormal(dt, inp, grounded) {
    const body = this.body;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir !== 0 && this.t.recoil <= 0) this.facing = dir;

    if (this.t.recoil <= 0) {
      const max = PHYS.runSpeed * this.speedMul() * (this.env.sand ? 0.45 : this.env.pressure ? 0.78 : 1);
      const accel = grounded ? (dir !== 0 ? PHYS.accelGround : PHYS.decelGround) : PHYS.accelAir;
      const control = this.t.wallLock > 0 ? 0.2 : 1;
      body.velocity.x = approach(body.velocity.x, dir * max, accel * control * dt);
    }

    if (inp.down && inp.jumpP && grounded && this.onOneWay()) {
      this.t.drop = 0.25; this.t.buffer = 0; body.velocity.y = 60;
    } else if (this.t.buffer > 0 && (grounded || this.t.coyote > 0)) {
      this.doJump(PHYS.jumpVel, false);
    } else if (inp.jumpP && !grounded && this.t.coyote <= 0 && this.airJumps > 0) {
      this.airJumps--;
      this.doJump(PHYS.doubleJumpVel, true);
    }
    if (this.jumping && !inp.jumpH && body.velocity.y < 0) { body.velocity.y *= PHYS.jumpCut; this.jumping = false; }
    if (body.velocity.y >= 0) this.jumping = false;

    if (GS.has('grip') && !grounded && dir !== 0 && body.velocity.y > -200 && this.t.wallLock <= 0.04 && this.touchingWall(dir)) {
      this.enterCling(dir);
      return;
    }

    if (inp.attackP && this.t.atkCD <= 0) this.attack(inp, grounded);
    else if (inp.dashP && GS.has('dash') && this.canDash && this.t.dashCD <= 0) this.startDash(dir || this.facing);
    else if (inp.kidoP) this.castKido(inp);
    else if (inp.konsoP && GS.has('konso')) this.startKonso();
    else if (inp.burstP && GS.has('burst') && grounded) this.startCharge(0);
    else if (inp.healH && grounded && dir === 0 && this.canHeal()) this.startHeal();
  }

  sheetKey() { return (this.bankai ? 'ichigo_b' : 'ichigo') + (GS.run.maskOn ? (this.bankai ? 'm' : '_m') : ''); }
  doJump(v, air) {
    const body = this.body;
    body.velocity.y = -v * (this.env.sand ? 0.62 : this.env.pressure ? 0.82 : 1);
    this.landT = 0;
    if (this.atkAnimT <= 0) this.play(this.sheetKey() + ':jump');
    this.jumping = true;
    this.t.buffer = 0; this.t.coyote = 0;
    if (air) {
      Sfx.play('djump');
      this.scene.fx.motes(this.x, body.bottom, 0xe8f4ff, 12);
      this.scene.fx.ring(this.x, body.bottom, 0xe8f4ff, 16, 250, 1);
      this.scene.fx.wings(this.x, body.center.y);
      this.squash(0.86, 1.16, 150);
    } else {
      Sfx.play('jump');
      this.scene.fx.dust(this.x, body.bottom, 4);
      this.squash(0.88, 1.14, 140);
    }
  }

  // ---------------- Shunpo (flash step) ----------------
  startDash(dir) {
    this.state = 'dash';
    this.dashDir = dir; this.facing = dir;
    this.t.state = PHYS.dashTime * (1 + 0.1 * GS.upgrade('shunpoEdge'));
    this.body.setAllowGravity(false);
    this.body.velocity.y = 0;
    this.canDash = false;
    this.t.dashCD = PHYS.dashCooldown * (GS.sealOn('swift') ? 0.5 : 1) * (this.bankai ? 0.6 : 1) * (1 - 0.15 * GS.upgrade('shunpoEdge'));
    this.dashHit = new Set();
    Sfx.play('dash');
    this.scene.fx.dust(this.x, this.body.bottom, 6);
  }
  updateDash(dt, inp) {
    const body = this.body;
    body.velocity.x = this.dashDir * PHYS.dashSpeed * (this.bankai ? 1.2 : 1);
    body.velocity.y = 0;
    this.t.after -= dt;
    if (this.t.after <= 0) { this.t.after = 0.025; this.scene.fx.afterimage(this, this.bankai ? 0xc8202c : 0x6f7cff, 0.5); }
    const blocked = this.dashDir > 0 ? body.blocked.right : body.blocked.left;
    // Shunko: the flash step cuts whatever it passes through
    if (GS.sealOn('shunko')) {
      const s = this.scene, r = bodyRect(body);
      r.x -= 4; r.width += 8;
      for (const e of s.enemies) {
        if (!e.alive || this.dashHit.has(e) || !e.hittable() || !Phaser.Geom.Intersects.RectangleToRectangle(r, bodyRect(e.body))) continue;
        this.dashHit.add(e);
        if (e.hit(GS.slashDamage() * 1.2 * this.dmgMul(), this.dashDir, { kind: 'dash' }) === 'hit') { s.fx.hit(e.x, e.y, this.dashDir, 0xffe8a0, 1); Sfx.play('hit'); s.hitStop(0.03); GS.comboHit(); }
      }
    }
    if (inp.attackP) { this.endDash(); this.attack(inp, this.grounded); return; }
    if (inp.jumpP && this.t.coyote > 0) { this.endDash(); this.doJump(PHYS.jumpVel, false); return; }
    if (this.t.state <= 0 || blocked) this.endDash();
  }
  endDash() {
    this.state = 'normal';
    this.body.setAllowGravity(true);
    this.body.velocity.x = this.dashDir * PHYS.runSpeed;
  }

  // ---------------- Reiatsu Grip ----------------
  enterCling(dir) {
    this.state = 'cling';
    this.wallDir = dir;
    this.facing = -dir;
    this.awayT = 0;
    this.body.setAllowGravity(false);
    this.body.velocity.y = 0;
    this.canDash = true;
    this.airJumps = GS.has('wings') ? 1 : 0;
    this.jumping = false;
    this.scene.fx.dust(this.x + dir * 6, this.body.center.y, 3);
  }
  exitCling() {
    this.state = 'normal';
    this.body.setAllowGravity(true);
  }
  updateCling(dt, inp) {
    const body = this.body;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    body.velocity.x = this.wallDir * 30;
    if (inp.up) body.velocity.y = -PHYS.wallClimb;
    else if (inp.down) {
      body.velocity.y = PHYS.wallSlide;
      this.t.slide = (this.t.slide || 0) - dt;
      if (this.t.slide <= 0) { this.t.slide = 0.07; this.scene.fx.dust(this.x + this.wallDir * 5, body.center.y + 4, 2); }
    } else body.velocity.y = 0;
    if (this.env.pressure) body.velocity.y = Math.max(body.velocity.y, PHYS.wallSlide * 0.7);   // no holding on under spirit pressure

    if (!this.touchingWall(this.wallDir, true)) {
      // Climbed past the top edge: pop onto the ledge
      this.exitCling();
      if (inp.up || dir === this.wallDir) { body.velocity.y = -250; body.velocity.x = this.wallDir * 90; }
      return;
    }
    if (this.grounded && body.velocity.y >= 0) { this.exitCling(); return; }
    if (this.t.buffer > 0) {
      this.exitCling();
      body.velocity.x = -this.wallDir * PHYS.wallJumpX;
      body.velocity.y = -PHYS.wallJumpY;
      this.facing = -this.wallDir;
      this.t.wallLock = PHYS.wallJumpLock;
      this.jumping = true;
      this.t.buffer = 0;
      Sfx.play('jump');
      this.scene.fx.dust(this.x + this.wallDir * 6, body.center.y, 5);
      this.scene.fx.impact(this.x + this.wallDir * 6, body.center.y, -this.wallDir, 0xe8f4ff, 4, 16);
      this.squash(0.9, 1.12, 130);
      return;
    }
    // The grip holds only while you press toward the wall: let go of the direction and you drop off it
    if (dir !== this.wallDir) {
      this.awayT += dt;
      if (this.awayT > 0.08) { this.exitCling(); body.velocity.x = dir === 0 ? 0 : -this.wallDir * 110; return; }
    } else this.awayT = 0;
    if (inp.dashP && GS.has('dash') && this.t.dashCD <= 0) { this.exitCling(); this.startDash(-this.wallDir); return; }
    if (inp.burstP && GS.has('burst')) { this.startCharge(this.wallDir); return; }
    if (inp.attackP && this.t.atkCD <= 0) { this.facing = -this.wallDir; this.attack({ up: inp.up, down: false }, false); }
    if (inp.kidoP) { this.facing = -this.wallDir; this.castKido(inp); }
  }

  // ---------------- Zanpakuto ----------------
  attack(inp, grounded) {
    this.t.atkCD = (this.bankai ? COMBAT.bankaiSlashCooldown : COMBAT.slashCooldown) * GS.form().cd * (1 - 0.06 * GS.temper('quick'));
    let kind = 'side';
    if (inp.up) kind = 'up';
    else if (inp.down && (!grounded || this.scene.crackBelow(this))) kind = 'down';   // strike down into cracked ground
    this.scene.startSwing(this, kind);
    this.atkAnim = kind === 'side' ? (this.swingAlt ? 'slashB' : 'slashA') : kind;
    this.atkAnimT = 0.2;
    const sheet = (this.bankai ? 'ichigo_b' : 'ichigo') + (GS.run.maskOn ? (this.bankai ? 'm' : '_m') : '');
    this.play(sheet + ':' + this.atkAnim);
  }

  // ---------------- Getsuga Tensho ----------------
  // Keep holding slash after a strike to gather Reiatsu into the blade; release to fire.
  updateGetsuga(dt, inp) {
    if (!GS.has('getsuga')) return;
    const canHold = this.state === 'normal' || this.state === 'cling';
    const need = COMBAT.getsugaCharge * (GS.sealOn('moonfang') ? 0.6 : 1);
    if (inp.attackH && canHold) {
      this.gHold = (this.gHold || 0) + dt;
      if (this.gHold >= need && !this.gReady) {
        this.gReady = true;
        Sfx.play('charge');
        this.scene.fx.ring(this.x, this.body.center.y, this.bankai ? 0xc8202c : 0x9ac8ff, 20, 220, 2);
      }
      if (this.gHold > 0.15 && Math.random() < 0.45) {
        this.scene.fx.motes(this.x + this.facing * 8 + Phaser.Math.Between(-4, 4), this.body.center.y + Phaser.Math.Between(-10, 6), this.bankai ? 0xc8202c : 0x9ac8ff, 1);
      }
      return;
    }
    if (this.gReady && canHold) this.fireGetsuga();
    this.gHold = 0;
    this.gReady = false;
  }
  fireGetsuga() {
    const cost = COMBAT.getsugaCost - (GS.sealOn('moonfang') ? 11 : 0);
    if (GS.data.reiatsu < cost) { this.scene.denied(`Getsuga Tenshō needs ${cost} Reiatsu`); return; }
    GS.addReiatsu(-cost);
    if (this.state === 'cling') this.facing = -this.wallDir;
    this.scene.castGetsuga(this);
    this.atkAnim = 'slashB';
    this.atkAnimT = 0.2;
    this.play(this.sheetKey() + ':slashB');
    this.t.atkCD = 0.25;
    if (this.state === 'normal') { this.body.velocity.x = -this.facing * 90; this.t.recoil = 0.08; }
  }

  // ---------------- Kido ----------------
  castKido(inp) {
    if (this.t.kido > 0) return;
    const s = this.scene;
    if (inp.up && GS.has('bakudo')) {
      if (GS.data.reiatsu < this.kidoCost(COMBAT.spellCost)) { s.denied('Not enough Reiatsu'); return; }
      if (s.castBakudo(this)) { GS.addReiatsu(-this.kidoCost(COMBAT.spellCost)); this.t.kido = 0.35; this.castT = 0.3; }
    } else if (inp.down && GS.has('raiko') && this.state !== 'cling') {
      const cost = this.kidoCost(COMBAT.raikoCost);
      if (GS.data.reiatsu < cost) { s.denied(`Raikōhō needs ${cost} Reiatsu`); return; }
      GS.addReiatsu(-cost);
      s.castRaiko(this);
      this.castT = 0.4;
      this.t.kido = 0.7;
      this.body.velocity.x = -this.facing * 150;
      this.t.recoil = 0.12;
    } else if (GS.has('hado')) {
      if (GS.data.reiatsu < this.kidoCost(COMBAT.spellCost)) { s.denied('Not enough Reiatsu'); return; }
      GS.addReiatsu(-this.kidoCost(COMBAT.spellCost));
      s.castHado(this);
      this.castT = 0.3;
      this.t.kido = 0.35;
      this.body.velocity.x = -this.facing * 90;
      this.t.recoil = 0.08;
    }
  }

  // ---------------- Reiatsu Suppression (heal) ----------------
  canHeal() { return GS.data.reiatsu >= this.healCost() && GS.data.hp < GS.data.maxHp; }
  startHeal() {
    this.state = 'heal';
    this.healBase = GS.data.reiatsu;
    this.healProg = 0;
    this.body.velocity.x = 0;
    Sfx.play('focus');
  }
  updateHeal(dt, inp) {
    const body = this.body;
    body.velocity.x = 0;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (!inp.healH || dir !== 0 || !this.grounded) { this.state = 'normal'; return; }
    const time = this.healTime();
    if (this.bankai) this.healBase = Math.min(GS.reiCap(), this.healBase + COMBAT.bankaiRegen * dt);
    this.healProg += dt;
    GS.data.reiatsu = Math.max(0, this.healBase - this.healCost() * Math.min(1, this.healProg / time));
    if (Math.random() < 0.5) this.scene.fx.motes(this.x + Phaser.Math.Between(-8, 8), this.y + 8, 0xe8f4ff, 1);
    if (this.healProg >= time) {
      const d = GS.data;
      d.reiatsu = this.healBase - this.healCost();
      d.hp = Math.min(d.maxHp, d.hp + 1);
      Sfx.play('heal');
      this.scene.fx.ring(this.x, this.y, 0xe8f4ff, 26, 350);
      this.scene.fx.motes(this.x, this.y, 0xffffff, 14);
      this.healBase = d.reiatsu; this.healProg = 0;
      if (!this.canHeal()) this.state = 'normal';
    }
  }

  // ---------------- Konso (soul burial) ----------------
  startKonso() {
    this.state = 'konso';
    this.charge = 0;
    Sfx.play('charge');
  }
  updateKonso(dt, inp) {
    this.body.velocity.x = approach(this.body.velocity.x, 0, 1200 * dt);
    this.charge += dt;
    if (Math.random() < 0.6) this.scene.fx.motes(this.x + this.facing * 10, this.y, 0xbfe6ff, 1);
    if (!inp.konsoH) { this.state = 'normal'; return; }
    if (this.charge >= (GS.sealOn('recall') ? 0.3 : 0.45)) {
      this.scene.konsoStrike(this);
      this.state = 'normal';
      this.t.atkCD = 0.3;
    }
  }

  // ---------------- Senkaimon Burst ----------------
  startCharge(wallDir) {
    this.state = 'charge';
    this.charge = 0;
    this.chargeWall = wallDir;
    if (wallDir) { this.body.setAllowGravity(false); this.body.velocity.y = 0; this.facing = -wallDir; }
    Sfx.play('charge');
  }
  updateCharge(dt, inp) {
    const body = this.body;
    body.velocity.x = this.chargeWall ? this.chargeWall * 30 : approach(body.velocity.x, 0, 1500 * dt);
    if (this.chargeWall) body.velocity.y = 0;
    this.charge += dt;
    if (!this.chargeWall) {
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (dir) this.facing = dir;
    }
    const ready = this.charge >= this.chargeNeed();
    if (Math.random() < 0.7) {
      const a = Math.random() * Math.PI * 2;
      this.scene.fx.motes(this.x + Math.cos(a) * 20, this.y + Math.sin(a) * 20, ready ? 0xffb070 : 0xff8a3a, 1);
    }
    if (ready && !this.readyFlash) { this.readyFlash = true; this.scene.fx.ring(this.x, this.y, 0xffb070, 22, 200); }
    if (!this.chargeWall && !this.grounded) { this.cancelCharge(); return; }
    if (!inp.burstH) {
      this.readyFlash = false;
      if (ready) this.startBurst(); else this.cancelCharge();
    }
  }
  cancelCharge() {
    this.readyFlash = false;
    if (this.chargeWall && this.touchingWall(this.chargeWall, true)) { this.state = 'cling'; this.wallDir = this.chargeWall; }
    else { this.state = 'normal'; this.body.setAllowGravity(true); }
  }
  startBurst() {
    const dir = this.chargeWall ? -this.chargeWall : this.facing;
    this.enterBurst(dir);
    Sfx.play('burst');
    this.scene.fx.shake(150, 0.008);
    this.scene.fx.ring(this.x, this.y, 0xff8a3a, 30, 300, 3);
  }
  // Flying already: a Burst that left the last room through a door keeps going in this one, until a wall stops it
  enterBurst(dir) {
    this.state = 'burst';
    this.burstDir = dir; this.facing = dir;
    this.burstHit = new Set();
    this.body.setAllowGravity(false);
    this.body.velocity.y = 0;
    this.body.velocity.x = dir * PHYS.burstSpeed * (1 + 0.12 * GS.upgrade('burstDrive'));
  }
  updateBurst(dt, inp) {
    const body = this.body, s = this.scene;
    body.velocity.x = this.burstDir * PHYS.burstSpeed * (1 + 0.12 * GS.upgrade('burstDrive'));
    body.velocity.y = 0;
    this.t.after -= dt;
    if (this.t.after <= 0) { this.t.after = 0.02; s.fx.afterimage(this, 0xff8a3a, 0.6, 260); }
    const ax = this.burstDir > 0 ? body.right + 3 : body.left - 3;
    let broke = false;
    for (const y of [body.top + 2, body.center.y, body.bottom - 2]) {
      const t = s.solid.getTileAtWorldXY(ax, y);
      if (t && t.index === T.GATE) { s.breakCluster(t.x, t.y, T.GATE); broke = true; }
    }
    // Burst rams through enemies
    const r = bodyRect(body);
    for (const e of s.enemies) {
      if (!e.alive || this.burstHit.has(e) || !e.hittable()) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(r, bodyRect(e.body))) {
        this.burstHit.add(e);
        if (e.hit(18 * this.dmgMul(), this.burstDir, { kind: 'burst' }) === 'hit') { s.fx.spark(e.x, e.y, 0xffb070, 10); Sfx.play('hit'); s.hitStop(0.05); }
      }
    }
    const blocked = this.burstDir > 0 ? body.blocked.right : body.blocked.left;
    // a wall ends it (a gate it smashes does not); jump stops it early
    if (inp.jumpP || (blocked && !broke)) this.endBurst(blocked && !broke);
  }
  endBurst(crashed) {
    this.state = 'normal';
    this.body.setAllowGravity(true);
    this.body.velocity.x = crashed ? -this.burstDir * 80 : this.burstDir * PHYS.runSpeed;
    if (crashed) { this.scene.fx.shake(120, 0.008); this.scene.fx.dust(this.x + this.burstDir * 6, this.y, 8); }
  }

  // ---------------- Bankai / Hollow mask ----------------
  // Seconds Bankai rests after it fades: the difficulty's share of the base, a third less with Gentei Kaijo
  bankaiCooldown() { return COMBAT.bankaiCooldown * GS.diff().bankaiCd * (GS.sealOn('gentei') ? 2 / 3 : 1); }
  updatePowers(dt, inp) {
    const run = GS.run, s = this.scene;
    if (run.comboT > 0) { run.comboT -= dt; if (run.comboT <= 0) run.combo = 0; }
    if (run.bankaiCD > 0) {
      run.bankaiCD -= dt;
      if (run.bankaiCD <= 0) { run.bankaiCD = 0; if (GS.has('bankai')) { s.toast('Your Bankai stirs again.'); Sfx.play('charge'); } }
    }
    if (run.bankaiT > 0) {
      run.bankaiT -= dt;
      GS.addReiatsu(COMBAT.bankaiRegen * dt);
      if (run.bankaiT <= 0) {
        run.bankaiT = 0;
        run.bankaiCD = this.bankaiCooldown();
        run.primed = false; run.combo = 0;
        s.fx.burst(this.x, this.y, 0xc8202c, 20);
        s.toast('Bankai released');
      }
    }
    this.aura.emitting = run.bankaiT > 0;
    if (run.maskLock > 0) run.maskLock -= dt;
    if (run.maskOn) {
      run.hollow += COMBAT.hollowRise * (1 - 0.15 * GS.upgrade('maskHold')) * dt;
      if (run.hollow > 70) {
        this.t.beat -= dt;
        if (this.t.beat <= 0) { this.t.beat = 0.9 - (run.hollow - 70) / 100; Sfx.play('heartbeat'); }
      }
      if (run.hollow >= 100) this.overwhelm();
    } else run.hollow = Math.max(0, run.hollow - COMBAT.hollowDecay * dt);

    if (this.state === 'dead' || this.state === 'locked') return;
    if (inp.bankaiP) this.tryBankai();
    if (inp.maskP) this.toggleMask();

    // Grace of the Departed: stand still to regenerate
    const idle = this.state === 'normal' && this.grounded && Math.abs(this.body.velocity.x) < 1 && !inp.left && !inp.right;
    if (GS.sealOn('grace') && idle && GS.data.hp < GS.data.maxHp) {
      this.graceT += dt;
      if (this.graceT > 4) { this.graceT = 0; GS.data.hp++; Sfx.play('heal'); s.fx.motes(this.x, this.y, 0xffffff, 10); }
    } else this.graceT = 0;
  }
  tryBankai() {
    const s = this.scene;
    if (!GS.has('bankai') || this.bankai) return;
    if (GS.rush && GS.rush.bind.reiatsu) { s.denied('The binding on your Reiatsu holds Bankai back'); return; }
    if (GS.run.bankaiCD > 0) { s.denied(`Bankai is spent. It answers again in ${Math.ceil(GS.run.bankaiCD)}s`); return; }
    if (GS.data.reiatsu < COMBAT.maxReiatsu - 0.5) { s.denied('Bankai needs a full Reiatsu vessel'); return; }
    if (!GS.run.primed) { s.denied(`Bankai needs ${COMBAT.bankaiCombo} strikes in a row without being hit (${GS.run.combo}/${COMBAT.bankaiCombo})`); return; }
    GS.data.reiatsu = 0;
    GS.run.primed = false; GS.run.combo = 0;
    GS.run.bankaiT = COMBAT.bankaiDuration * (GS.sealOn('gentei') ? COMBAT.genteiMul : 1) * (1 + 0.2 * GS.upgrade('bankaiLast'));
    Controls.rumble(450, 0.9, 0.6);
    Sfx.play('bankai');
    s.fx.shake(400, 0.012);
    s.fx.flash(0xc8202c, 300, 0.45);
    s.fx.ring(this.x, this.y, 0xc8202c, 80, 500, 4);
    s.fx.burst(this.x, this.y, 0x0a0a0e, 40);
    s.game.events.emit('banner', { text: 'BANKAI', color: '#e0303c' });
    s.hitStop(0.25);
  }
  toggleMask() {
    const s = this.scene, run = GS.run;
    if (!GS.has('hollow')) return;
    if (run.maskOn) { run.maskOn = false; Sfx.play('unmask'); s.fx.burst(this.x, this.y - 6, 0xf4f1ea, 8); return; }
    if (run.maskLock > 0) { s.denied('The mask is still shattered (' + Math.ceil(run.maskLock) + 's)'); return; }
    run.maskOn = true;
    Sfx.play('mask');
    s.fx.flash(0xffffff, 120, 0.35);
    s.fx.burst(this.x, this.y - 6, 0xf4f1ea, 14);
  }
  overwhelm() {
    const s = this.scene, run = GS.run;
    run.maskOn = false; run.hollow = 35; run.maskLock = 20;
    s.toast('The Hollow surges. Your mask shatters.');
    s.fx.flash(0xa0000a, 500, 0.6);
    s.fx.shake(500, 0.015);
    Sfx.play('roar');
    this.takeDamage(1, this.x, { force: true, noKnock: true });
    if (this.state !== 'dead') { this.state = 'stunned'; this.t.state = 1.2; this.body.setAllowGravity(true); }
  }

  // ---------------- damage ----------------
  takeDamage(amount, srcX, o = {}) {
    if (this.state === 'dead' || this.scene.transitioning) return false;
    if (!o.force && this.t.invuln > 0) return false;
    if (!o.force && this.state === 'dash' && GS.sealOn('phantom')) return false;
    const s = this.scene, body = this.body;
    // Hierro: every fourth blow glances off, and none of them knock you around
    if (!o.force && GS.sealOn('hierro')) {
      this.hierroN = (this.hierroN || 0) + 1;
      o = Object.assign({}, o, { noKnock: true });
      if (this.hierroN % 4 === 0) { this.t.invuln = 0.5; Sfx.play('clang'); s.fx.spark(this.x, this.y, 0xe8e4d8, 10); s.fx.ring(this.x, this.body.center.y, 0xe8e4d8, 20, 200, 2); return false; }
    }
    Controls.rumble(200, 0.8, 0.5);
    if (['cling', 'dash', 'charge', 'burst'].includes(this.state)) body.setAllowGravity(true);
    GS.comboBreak();
    GS.data.hp -= o.force ? amount : GS.lose(amount, !!(s.boss && s.boss.fighting && s.boss.alive && (GS.diff().heavyBosses || []).includes(s.boss.id)));
    this.t.invuln = 1.1 * (o.force ? 1 : GS.diff().invuln) * (GS.sealOn('tesla') ? 1.4 : 1);
    Sfx.play('hurt');
    s.hitStop(0.1);
    s.fx.shake(180, 0.012);
    s.fx.flash(0xffffff, 90, 0.35);
    s.fx.burst(this.x, this.y, 0x17161f, 12);
    if (GS.data.hp <= 0) { GS.data.hp = 0; this.die(); return true; }
    if (!o.noKnock) {
      const dir = Math.sign(this.x - srcX) || -this.facing;
      body.velocity.x = dir * 190;
      body.velocity.y = -230;
      this.state = 'hurt';
      this.t.hurt = 0.22;
    } else if (this.state !== 'stunned') this.state = 'normal';
    return true;
  }
  die() {
    const sheet = this.sheetKey(), s = this.scene;
    this.state = 'dead';
    this.body.setVelocity(0, 0);
    this.body.setAllowGravity(false);
    GS.run.maskOn = false;
    GS.run.bankaiT = 0;
    this.aura.emitting = false;
    this.ring.clear();
    // Collapse: a white flash, the hurt pose, then the soul lifts away and the body dissolves
    this.setAlpha(1).setScale(1);
    this.play(sheet + ':death');
    this.setTintFill(0xffffff);
    s.time.delayedCall(90, () => { if (this.active) this.clearTint(); });
    s.tweens.add({ targets: this, alpha: 0, y: this.y - 14, scaleX: 0.7, scaleY: 1.25, duration: 850, delay: 420, ease: 'Cubic.in' });
    s.time.addEvent({ delay: 90, repeat: 9, callback: () => {
      if (this.active) s.fx.motes(this.x + Phaser.Math.Between(-6, 6), this.y + 10 - Phaser.Math.Between(0, 14), 0xe8f4ff, 2);
    } });
    this.scene.onPlayerDeath();
  }

  // ---------------- visuals & bookkeeping ----------------
  // Animation state machine: picks a clip from the gameplay state each frame
  animName() {
    if (this.atkAnimT > 0) return this.atkAnim;
    if (this.poseT > 0) {
      if ((this.state === 'normal' && this.grounded && Math.abs(this.body.velocity.x) < 20) || this.state === 'locked') return this.poseName;
      this.poseT = 0;   // moved, jumped or got hit: the held pose ends
    }
    switch (this.state) {
      case 'dead': case 'hurt': case 'stunned': return 'hurt';
      case 'dash': case 'burst': return 'dash';
      case 'charge': return 'charge';
      case 'heal': return 'focus';
      case 'konso': return 'cast';
      case 'cling': return 'cling';
    }
    if (this.castT > 0) return 'cast';
    if (!this.grounded) return this.body.velocity.y < -40 ? 'jump' : 'fall';
    if (this.landT > 0 && Math.abs(this.body.velocity.x) < 60) return 'land';
    if (Math.abs(this.body.velocity.x) > 25 && this.state !== 'locked') return 'run';
    return 'idle';
  }
  updateVisual(dt = 0) {
    this.atkAnimT -= dt; this.castT -= dt; this.poseT -= dt; this.landT = (this.landT || 0) - dt;
    const sheet = this.sheetKey();
    let name = this.animName();
    // Standing around for a while: glance up now and then
    if (name === 'idle' || name === 'look') {
      this.idleT += dt;
      if (this.idleT > 5.5 && this.idleT < 6.5) name = 'look';
      else if (this.idleT >= 6.5) this.idleT = Phaser.Math.FloatBetween(0, 2.5);
    } else this.idleT = 0;
    const key = sheet + ':' + name;
    const cur = this.anims.currentAnim;
    if (!cur || cur.key !== key) {
      // Keep the frame index when only the form (mask / bankai) changes
      const same = cur && cur.key.split(':')[1] === name && this.anims.currentFrame;
      this.play({ key, startFrame: same ? this.anims.currentFrame.index - 1 : 0 });
    }
    if (name === 'run') {
      this.anims.timeScale = Phaser.Math.Clamp(Math.abs(this.body.velocity.x) / PHYS.runSpeed, 0.6, 1.4);
      // a puff of dust on each footfall
      const fi = this.anims.currentFrame ? this.anims.currentFrame.index : 0;
      if (fi !== this.lastRunFrame && (fi === 1 || fi === RUN_N / 2 + 1)) { this.scene.fx.dust(this.x - this.facing * 4, this.body.bottom, 2); Sfx.step(REGION_SURFACE[this.scene.region]); }
      this.lastRunFrame = fi;
    } else this.anims.timeScale = 1;
    this.setFlipX(this.facing < 0);
    const blink = this.t.invuln > 0 && Math.floor(this.t.invuln * 18) % 2 === 0;
    this.setAlpha(this.state === 'dead' ? 0 : blink ? 0.35 : 1);
    if (this.boundT > 0) this.setTint(0xffd75e);
    else if (this.state === 'heal') this.setTint(0xdfe8ff);
    else if (this.state === 'charge') this.setTint(this.charge >= this.chargeNeed() ? 0xffd0a0 : 0xffa070);
    else if (this.state === 'konso') this.setTint(0xbfe6ff);
    else if (this.gReady) this.setTint(Math.floor(this.scene.time.now / 90) % 2 ? 0xcfe4ff : 0xffffff);
    else this.clearTint();
    this.drawRing();
  }
  updateSafe() {
    if (this.state !== 'normal' || !this.body.blocked.down) return;
    const b = this.body, s = this.scene, y = b.bottom + 3;
    const solidSafe = (x) => { const t = s.solid.getTileAtWorldXY(x, y); return (t && t.collides && t.index !== T.COLLAPSE) || !!s.oneway.getTileAtWorldXY(x, y); };
    if (solidSafe(b.left + 1) && solidSafe(b.right - 1) && !s.nearHazard(b.center.x, b.bottom - 6)) {
      this.lastSafe = { x: b.center.x, y: b.bottom };
      // A trail of the ground walked, so a spike respawn can step back to a spot far from the spikes
      const tr = this.safeTrail, last = tr[tr.length - 1];
      if (!last || Math.abs(last.x - this.lastSafe.x) + Math.abs(last.y - this.lastSafe.y) >= 20) { tr.push(this.lastSafe); if (tr.length > 60) tr.shift(); }
    }
  }
}
