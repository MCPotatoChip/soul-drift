'use strict';
// ---------------------------------------------------------------------------
// Bosses. Each attack is a generator: `yield 0.4` waits, `yield 0` waits one
// frame, `yield () => cond` waits for a condition. Phase changes swap the
// running coroutine.
//
// A shared director picks the next attack. Every move has a weight and a
// range it prefers; distance only tilts the odds instead of deciding them,
// the last few moves are unlikely to come again, a player who stays in one
// spot draws the moves that reach that spot, and a boss kept at a distance
// for too long comes to the player instead of waiting there.
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
    this.under = scene.add.graphics().setDepth(14);   // whips, serpents: drawn behind the boss
    this.poseName = null; this.poseT = 0;
    this.recent = []; this.used = {}; this.clock = 0;
    this.sinceNear = 0; this.history = []; this.histT = 0;
    this.hazards = [];
    this.armor = cfg.armor || 1;
    // tuning every boss may override
    this.walker = true; this.walkSpeed = 70; this.prefer = 90; this.patience = 3.2; this.pause = 0.45; this.nearDist = 110;
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
    const p = this.defaultPose();
    this.anim(p, p === 'run' ? Phaser.Math.Clamp(Math.abs(this.body.velocity.x) / 120, 0.6, 1.6) : 1);
  }
  // The moment the doors lock: a held pose, a ring of force and a flash of white
  intro() {
    const s = this.scene;
    s.fx.ring(this.x, this.y, 0xffffff, 80, 750, 3);
    s.fx.ring(this.x, this.y, 0xd8343f, 50, 600, 2);
    s.fx.dust(this.x, this.body.bottom, 16);
    this.telegraph(0xffffff);
    s.time.delayedCall(500, () => { if (this.alive) this.untelegraph(); });
    if (this.introPose) this.setPose(this.introPose, 0.95);
    if (this.introLine) s.fx.floatText(this.x, this.y - this.displayHeight * 0.6, this.introLine, this.lineColor || '#e8e4ff');
  }
  activate() {
    this.fighting = true;
    this.invulnerable = false;
    this.ai = new Co(this.brain());
  }
  get arena() { return this.scene.arena; }
  get player() { return this.scene.player; }
  think(dt) {
    this.clock += dt;
    const p = this.player;
    // where has the player been standing these last three seconds?
    this.histT -= dt;
    if (this.histT <= 0) { this.histT = 0.25; this.history.push(p.x); if (this.history.length > 12) this.history.shift(); }
    const near = Math.abs(p.x - this.x) < this.nearDist && Math.abs(p.y - this.y) < 90;
    this.sinceNear = near ? 0 : this.sinceNear + dt;
    for (const h of this.hazards) h.tick(dt);
    this.hazards = this.hazards.filter(h => !h.dead);
    if (!this.fighting) { this.body.setVelocityX(0); return; }
    if (this.ai) this.ai.tick(dt);
    this.checkPhase && this.checkPhase();
  }
  // The player has barely moved for a while (hiding on a ledge, waiting by a wall)
  camping() {
    if (this.history.length < 10) return false;
    return Math.max(...this.history) - Math.min(...this.history) < 48;
  }

  // ------------------------------------------------------------- choosing
  // moves: [{ name, w, range: [near, far], phase, maxPhase, cd, punish, when }]
  pickMove(moves) {
    const dist = Math.abs(this.player.x - this.x), camp = this.camping();
    const opts = [];
    let total = 0;
    for (const m of moves) {
      if (m.phase && this.phase < m.phase) continue;
      if (m.maxPhase && this.phase > m.maxPhase) continue;
      if (m.cd && this.clock - (this.used[m.name] ?? -99) < m.cd) continue;
      if (m.when && !m.when.call(this)) continue;
      let w = m.w || 1;
      const [lo, hi] = m.range || [0, 9999];
      if (dist < lo) w *= 0.2 + 0.8 * Math.max(0, 1 - (lo - dist) / 120);
      else if (dist > hi) w *= 0.2 + 0.8 * Math.max(0, 1 - (dist - hi) / 160);
      const r = this.recent.indexOf(m.name);
      w *= r === 0 ? 0.06 : r === 1 ? 0.35 : r === 2 ? 0.7 : 1;
      if (camp && m.punish) w *= 2.6;
      opts.push([m.name, w]); total += w;
    }
    let pick = opts.length ? opts[0][0] : null, roll = Math.random() * total;
    for (const [n, w] of opts) { roll -= w; if (roll <= 0) { pick = n; break; } }
    this.recent.unshift(pick); this.recent.length = Math.min(this.recent.length, 3);
    this.used[pick] = this.clock;
    return pick;
  }
  *brain() {
    yield 0.4;
    for (;;) {
      // Kept out of reach for too long: go to the player instead of waiting
      if (this.sinceNear > this.patience) { this.sinceNear = 0; yield* this.closeIn(); }
      const name = this.pickMove(this.moveList());
      if (name) yield* this[name]();
      yield* this.breathe();
    }
  }

  // ------------------------------------------------------------- moving
  // Ease toward a walking speed instead of snapping to it
  steerX(tx, speed) {
    const d = tx - this.x, v = Math.abs(d) < 6 ? 0 : Math.sign(d) * speed;
    this.body.setVelocityX(approach(this.body.velocity.x, v, Math.max(400, speed * 7) * this.dt));
    if (Math.abs(d) > 4) this.facing = Math.sign(d);
  }
  *halt() {
    while (Math.abs(this.body.velocity.x) > 6) { this.body.setVelocityX(approach(this.body.velocity.x, 0, 1100 * this.dt)); yield 0; }
    this.body.setVelocityX(0);
  }
  *walkToward(stop = 60, maxT = 1.2, speed = this.walkSpeed) {
    let t = maxT;
    while (t > 0) {
      t -= this.dt;
      const dx = this.player.x - this.x;
      if (Math.abs(dx) <= stop) break;
      this.steerX(this.player.x - Math.sign(dx) * stop * 0.7, speed * this.spd);
      yield 0;
    }
    yield* this.halt();
  }
  // Between attacks: catch breath, drifting in when the player is far away
  *breathe(t = this.pause) {
    let e = t / this.spd;
    while (e > 0) {
      e -= this.dt;
      const dx = this.player.x - this.x;
      if (this.walker && this.body.allowGravity && Math.abs(dx) > this.prefer) this.steerX(this.player.x, this.walkSpeed * 0.75 * this.spd);
      else this.body.setVelocityX(approach(this.body.velocity.x, 0, 900 * this.dt));
      this.face();
      yield 0;
    }
  }
  // Close the distance: walkers run in, others step through the air beside you
  *closeIn() {
    if (this.walker) yield* this.walkToward(this.prefer * 0.8, 1.6, this.walkSpeed * 1.8);
    else { const p = this.player; yield* this.blink(p.x - p.facing * 50, this.body.allowGravity ? this.floorY() : p.y - 30); }
  }
  face() { this.faceTo(this.player.x); }
  *wait(t) { yield t / this.spd; }
  *tele(t, color = 0xff6060, pose = this.telePose) {
    if (pose) this.setPose(pose, t / this.spd + 0.02);
    this.telegraph(color);
    Sfx.play('telegraph');
    yield t / this.spd;
    this.untelegraph();
  }
  // Teleport with afterimages (Shunpo / Sonido)
  *blink(x, y) {
    this.scene.fx.afterimage(this, 0xffffff, 0.6, 250);
    this.setAlpha(0.12);
    this.invulnerable = true;
    Sfx.play('dash');
    yield 0.18 / this.spd;
    const cx = Phaser.Math.Clamp(x, this.arena.left + 8, this.arena.right - 8);
    this.body.reset(cx, Math.min(y, this.floorY()));
    this.body.setVelocity(0, 0);
    this.setAlpha(1);
    this.scene.fx.afterimage(this, 0xffffff, 0.4, 180);
    this.invulnerable = false;
    this.face();
  }
  floorY() { return this.arena.floor - this.body.height / 2; }
  bodyFeet() { return this.body.bottom; }
  // Jump toward a point, landing on it
  *leapAt(tx, vy = -520) {
    const g = PHYS.gravity, T = 2 * -vy / g;
    this.body.setVelocity((Phaser.Math.Clamp(tx, this.arena.left + 20, this.arena.right - 20) - this.x) / T, vy);
    Sfx.play('jump');
    yield 0.1;
    yield () => this.body.blocked.down;
    this.body.setVelocityX(0);
  }

  // ------------------------------------------------------------- striking
  // A melee box in front that follows the boss for its lifetime
  slashBox(w = 34, h = 26, dur = 0.12, color = 0xffffff, scale = 1.1, pose = 'strike') {
    const f = this.facing;
    if (pose) this.setPose(pose, 0.24);
    this.scene.addHurt(0, 0, w, h, 1, dur, (hb) => { hb.x = this.x + (f > 0 ? 0 : -w); hb.y = this.y - h / 2; });
    this.scene.fx.slashArc(this.x + f * w * 0.45, this.y, f, color, scale);
    Sfx.play('slash');
    Controls.rumble(60, 0.2, 0.3);
  }
  *beam(ox, oy, angle, dur, sweep = 0, width = 12, len = 720, col = [0xff2a50, 0xff4a70, 0xffe0ea]) {
    const g = this.gfx;
    let e = 0;
    Sfx.play('cero');
    this.scene.fx.shake(dur * 1000, 0.006);
    while (e < dur) {
      e += this.dt;
      const o = typeof ox === 'function' ? ox() : { x: ox, y: oy };
      const a = angle + sweep * (e / dur);
      const x2 = o.x + Math.cos(a) * len, y2 = o.y + Math.sin(a) * len;
      const flick = 1 + Math.sin(e * 60) * 0.12;
      g.clear();
      g.lineStyle((width + 8) * flick, col[0], 0.35); g.lineBetween(o.x, o.y, x2, y2);
      g.lineStyle(width, col[1], 0.9); g.lineBetween(o.x, o.y, x2, y2);
      g.lineStyle(width * 0.4, col[2], 1); g.lineBetween(o.x, o.y, x2, y2);
      g.fillStyle(col[2], 1).fillCircle(o.x, o.y, width * 0.8 * flick);
      this.scene.beamHit(o.x, o.y, x2, y2, width / 2, 1);
      yield 0;
    }
    g.clear();
  }
  *aimLine(ox, oy, angle, t, color = 0xff3050) {
    const g = this.gfx;
    let e = 0;
    while (e < t) {
      e += this.dt;
      g.clear();
      g.lineStyle(1, color, 0.4 + 0.4 * Math.abs(Math.sin(e * 30)));
      g.lineBetween(ox, oy, ox + Math.cos(angle) * 720, oy + Math.sin(angle) * 720);
      yield 0;
    }
    g.clear();
  }
  aimAt(ox, oy) { const p = this.player; return Math.atan2(p.body.center.y - oy, p.x - ox); }
  // A ground shockwave rolling away along the floor
  shock(x, dir, tint, speed = 250, scale = 1) {
    const sh = new EnemyShot(this.scene, x, this.arena.floor - 10 * scale, 'shock', dir * speed, 0, { dmg: 1, life: 1.8, w: 12, h: 18, flipX: dir < 0, pierce: true, scale, tint });
    return sh;
  }
  // A flagged spot on the floor, then a damaging column there
  *pillar(x, w, h, tele, color, dur = 0.3) {
    const g = this.gfx, top = this.arena.floor - h;
    let e = 0;
    while (e < tele) { e += this.dt; g.clear(); g.fillStyle(color, 0.12 + 0.18 * Math.abs(Math.sin(e * 18))).fillRect(x - w / 2, top, w, h); yield 0; }
    g.clear();
    this.scene.addHurt(x - w / 2, top, w, h, 1, dur);
  }

  hit(dmg, dirX, o = {}) {
    if (!this.fighting) return 'none';
    const r = super.hit(dmg * this.armor, dirX, Object.assign({}, o, { knock: false }));
    if (r === 'hit') {
      this.scene.game.events.emit('boss-hp', Math.max(0, this.hp / this.maxHp));
      // a brief flinch, but never over a held wind-up the player is meant to read
      if (this.alive && !this.noFlinch && this.poseT <= 0 && this.scene.anims.exists(this.sheet + ':hurt')) this.setPose('hurt', 0.1);
    }
    return r;
  }
  bind(t) { super.bind(Math.min(t * 0.3, 1.2)); }
  // A phase change cancels whatever attack was running, including its damage boxes and hazards
  setScript(gen) {
    this.ai = new Co(gen);
    this.scene.hurtBoxes.length = 0;
    this.cleanup();
  }
  cleanup() {
    this.gfx.clear(); this.under.clear();
    this.hazards.forEach(h => h.destroy());
    this.hazards = [];
    this.untelegraph();
  }
  // Change form: a held pose, flashes, a banner
  *changeForm(sheet, line, banner, color, colorHex) {
    this.body.setVelocity(0, 0); this.body.setAllowGravity(true);
    this.invulnerable = true;
    yield () => this.body.blocked.down;
    const s = this.scene;
    if (line) s.fx.floatText(this.x, this.y - 34, line, colorHex || '#ffffff');
    this.setPose('charge', 1.2);
    yield 1.0;
    Sfx.play('bankai');
    s.fx.shake(600, 0.014);
    s.fx.flash(color, 300, 0.5);
    s.fx.ring(this.x, this.y, color, 90, 600, 4);
    s.fx.burst(this.x, this.y, color, 30);
    if (sheet) this.setSheet(sheet);
    if (banner) s.game.events.emit('banner', banner);
    Controls.rumble(400, 0.8, 0.6);
    yield 0.8;
    this.invulnerable = false;
  }
  // Swap to another form's sheet without losing the current clip
  setSheet(key) { const cur = this.anims.currentAnim && this.anims.currentAnim.key.split(':')[1]; this.sheet = key; this.setTexture(key, 'idle0'); this.anims.stop(); if (cur && this.scene.anims.exists(key + ':' + cur)) this.anim(cur); }

  // Each boss ends in its own way, on top of the shared bursts
  deathFx() {
    const s = this.scene, x = this.x, y = this.y, fx = s.fx;
    const wisps = (n, c = 0xbfe6ff) => { for (let i = 0; i < n; i++) s.time.delayedCall(i * 110, () => fx.wisp(x + Phaser.Math.Between(-24, 24), y + Phaser.Math.Between(-30, 20), c, 80)); };
    switch (this.id) {
      case 'fisher':   // the fur falls away and the mask splits around the lure
        fx.shatter(x, y - 10, [0x2a1e18, 0x4a3628, 0xefe8dc, 0xefe8dc], 40, 110, 80, 1400);
        fx.wisp(x + this.facing * 30, y - 40, 0xf4eef0, 120);
        wisps(10);
        break;
      case 'menos':   // a thousand faces break off and fall away
        fx.shatter(x, y - 10, [0xf4f1ea, 0xf4f1ea, 0x17161f, 0xc8202c], 34, 110, 90, 1400);
        s.time.delayedCall(260, () => fx.shatter(x, y - 30, [0xf4f1ea, 0x2c2636], 22, 90, 70, 1200));
        wisps(10);
        break;
      case 'byakuya':   // the last petals fall like a spring that has ended
        fx.shatter(x, y, [0xffc0d8, 0xff90b8, 0xffffff], 48, 140, 100, 1800);
        for (let i = 0; i < 3; i++) s.time.delayedCall(i * 180, () => fx.ring(x, y, 0xff90b8, 40 + i * 30, 500, 2));
        wisps(6, 0xffd0e0);
        break;
      case 'renji':   // Zabimaru comes apart, segment by segment
        fx.shatter(x, y, [0xc9d0d8, 0xffffff, 0xc8202c], 30, 120, 70, 1300);
        wisps(6, 0xff9080);
        break;
      case 'kenpachi':   // a last bell rings out
        fx.shatter(x, y, [0xf2d040, 0xffe080, 0x1c1a24], 30, 100, 60, 1200);
        fx.ring(x, y, 0xf2d040, 120, 900, 4);
        wisps(6, 0xffe080);
        break;
      case 'grimmjow': case 'ulquiorra': case 'espada': {   // the Hollow turns to ash, and the ash drifts up
        const c = { grimmjow: 0x58b8e8, ulquiorra: 0x3ae88a, espada: 0x8a5ad8 }[this.id];
        fx.shatter(x, y, [0xece8f1, 0x9a96a8, c], 40, 100, -40, 1700);
        for (let i = 0; i < 3; i++) s.time.delayedCall(i * 180, () => fx.ring(x, y, c, 40 + i * 30, 500, 2));
        wisps(10, c);
        break;
      }
      case 'vasto':   // crumbles to sand
        fx.shatter(x, y, [0xe0d8c0, 0xc8bea0, 0xffffff], 40, 120, 110, 1600);
        fx.dust(x, y, 30);
        fx.debris(x, y, 0xe0d8c0, 16);
        wisps(8);
        break;
      case 'final':   // a mirror breaks: glass in every direction, and a long white silence
        for (let i = 0; i < 3; i++) s.time.delayedCall(i * 220, () => fx.shatter(x, y - 4, [0xffffff, 0xbfe6ff, 0x7fd4ff, 0xc8202c], 30, 130 + i * 30, 70, 1500));
        fx.ring(x, y, 0xffffff, 120, 900, 4);
        wisps(14);
        break;
    }
  }
  die(dirX) {
    this.alive = false;
    this.fighting = false;
    this.body.enable = false;
    this.cleanup();
    GS.data.kills[this.kind] = (GS.data.kills[this.kind] || 0) + 1;
    const s = this.scene;
    s.eShots.forEach(p => p.active && p.destroy());
    s.hurtBoxes.length = 0;
    s.enemies.forEach(e => { if (e !== this && e.alive && e.summoned) e.die(0); });
    Sfx.play('roar');
    s.hitStop(0.4);
    s.fx.shake(900, 0.015);
    s.fx.flash(0xffffff, 400, 0.7);
    Controls.rumble(700, 1, 0.8);
    this.onDie && this.onDie();
    this.deathFx();
    let n = 0;
    s.time.addEvent({
      delay: 120, repeat: 8, callback: () => {
        n++;
        s.fx.burst(this.x + Phaser.Math.Between(-20, 20), this.y + Phaser.Math.Between(-30, 20), n % 2 ? 0xffffff : 0x17161f, 20);
        Sfx.play('hit');
      },
    });
    s.tweens.add({ targets: this, alpha: 0, delay: 900, duration: 600, onComplete: () => { this.gfx.destroy(); this.under.destroy(); this.destroy(); } });
    s.onBossDefeated(this);
  }
}

// ---------------------------------------------------------------------------
// Hazards a boss leaves running between its own moves. Each has tick(dt) and destroy().
// ---------------------------------------------------------------------------

// A cloud of blade petals (Senbonzakura). It homes on the player, then flows back.
class PetalSwarm {
  constructor(boss, x, y, o = {}) {
    this.b = boss; this.s = boss.scene;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.r = o.r || 18; this.speed = o.speed || 150; this.life = o.life || 2.6; this.turn = o.turn || 3.2;
    this.home = o.home || null;
    this.em = this.s.add.particles(0, 0, 'petal', {
      x: { min: -this.r, max: this.r }, y: { min: -this.r, max: this.r }, speed: { min: 6, max: 30 }, lifespan: 520,
      rotate: { min: 0, max: 360 }, scale: { start: 1.1, end: 0.3 }, alpha: { start: 0.95, end: 0 },
      frequency: Math.round(16 / Math.max(0.4, Settings.get('particles'))), tint: [0xffc0d8, 0xff90b8, 0xffe0ea], blendMode: 'ADD',
    }).setDepth(28);
    this.em.startFollow(this);
  }
  tick(dt) {
    if (this.dead) return;
    const p = this.s.player;
    this.life -= dt;
    const tx = this.life > 0 ? p.x : this.b.x, ty = this.life > 0 ? p.body.center.y : this.b.y - 6;
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dt * this.turn);
    this.vx += (dx / d * this.speed - this.vx) * k;
    this.vy += (dy / d * this.speed - this.vy) * k;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.life > -2 && Math.hypot(p.x - this.x, p.body.center.y - this.y) < this.r + 6 && this.life > 0) p.takeDamage(1, this.x);
    if (this.life <= 0 && d < 14) this.destroy();
    if (this.life < -2.5) this.destroy();
  }
  destroy() { if (this.dead) return; this.dead = true; this.em.stop(); this.s.time.delayedCall(600, () => this.em.destroy()); }
}

// Renji's Bankai: a serpent of bone plates. Its head follows a path of points; the body trails it.
class BoneSnake {
  constructor(boss) {
    this.b = boss; this.s = boss.scene; this.g = boss.under;
    this.trail = []; this.head = { x: boss.x, y: boss.y }; this.len = 22; this.plate = 11;
    this.path = null; this.out = false;
  }
  // Follow points in order at `speed`, then curl back to Renji
  run(points, speed, onDone, hold = false) { this.path = points.slice(); this.speed = speed; this.onDone = onDone; this.out = true; this.hold = hold; }
  tick(dt) {
    if (this.dead) return;
    const b = this.b;
    if (this.path && this.path.length) {
      const t = this.path[0], dx = t.x - this.head.x, dy = t.y - this.head.y, d = Math.hypot(dx, dy);
      const step = this.speed * dt;
      if (d <= step) { this.head.x = t.x; this.head.y = t.y; this.path.shift(); if (!this.path.length && this.onDone) { const f = this.onDone; this.onDone = null; f(); } }
      else { this.head.x += dx / d * step; this.head.y += dy / d * step; }
    } else if (!this.hold) {
      // rest coiled over Renji's shoulder
      const hx = b.x - b.facing * 14, hy = b.y - 30;
      this.head.x += (hx - this.head.x) * Math.min(1, dt * 6); this.head.y += (hy - this.head.y) * Math.min(1, dt * 6);
      this.out = false;
    }
    this.trail.unshift({ x: this.head.x, y: this.head.y });
    if (this.trail.length > this.len * 3) this.trail.length = this.len * 3;
    this.draw();
    if (this.out) {   // only the extended serpent hurts
      const p = this.s.player;
      for (let i = 0; i + 3 < this.trail.length; i += 3) {
        const a = this.trail[i], c = this.trail[i + 3];
        this.s.beamHit(a.x, a.y, c.x, c.y, i === 0 ? 10 : 7, 1);
      }
      if (p.t.invuln <= 0 && Math.hypot(p.x - this.head.x, p.body.center.y - this.head.y) < 14) p.takeDamage(1, this.head.x);
    }
  }
  draw() {
    const g = this.g;
    g.clear();
    for (let i = this.trail.length - 1; i >= 3; i -= 3) {
      const a = this.trail[i], k = 1 - i / (this.len * 3);
      const r = this.plate * (0.5 + 0.5 * k);
      g.fillStyle(0x8a1a22, 1).fillCircle(a.x, a.y, r + 1.5);
      g.fillStyle(0xf0e8d8, 1).fillCircle(a.x, a.y, r);
      g.fillStyle(0xc8202c, 1).fillTriangle(a.x - r * 0.4, a.y - r, a.x + r * 0.4, a.y - r, a.x, a.y - r - 5);
    }
    // the skull
    const h = this.head, n = this.trail[3] || { x: h.x - 1, y: h.y }, ang = Math.atan2(h.y - n.y, h.x - n.x);
    const c = Math.cos(ang), s = Math.sin(ang);
    const P = (fx, fy) => ({ x: h.x + c * fx - s * fy, y: h.y + s * fx + c * fy });
    const skull = [P(-8, -9), P(12, -6), P(18, 0), P(12, 5), P(-8, 8)];
    g.fillStyle(0xf4eee2, 1).fillPoints(skull, true);
    g.lineStyle(1, 0x2a0a10, 1).strokePoints(skull, true);
    const e = P(4, -3); g.fillStyle(0xff3040, 1).fillCircle(e.x, e.y, 2);
    const m1 = P(8, 2), m2 = P(17, 1); g.lineStyle(1, 0x2a0a10, 1).lineBetween(m1.x, m1.y, m2.x, m2.y);
    this.mouth = P(18, 0);
  }
  destroy() { this.dead = true; this.g.clear(); }
}

// ---------------------------------------------------------------------------
// Grand Fisher: burrows under the player, lashes with its lure, and in the
// second half sends the bait itself after you.
class GrandFisher extends Boss {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'fisher', { id: 'fisher', hp: 150, dmg: 1, drop: 20, bw: 46, bh: 56, kind: 'fisher', frame: 'idle0', frameFeet: 84, burst: 0x2a1e18 });
    this.telePose = 'windup';
    this.introPose = 'roar';
    this.introLine = '"You can see it, can\'t you? My pretty little lure."';
    this.lineColor = '#ffd0d0';
    this.walkSpeed = 60; this.prefer = 80; this.patience = 3.5;
    this.anim('idle');
  }
  defaultPose() { return this.buried ? 'burrow' : Math.abs(this.body.velocity.x) > 15 ? 'walk' : 'idle'; }
  get contactDamage() { return this.buried ? 0 : super.contactDamage; }
  hittable() { return super.hittable() && !this.buried; }
  moveList() {
    return [
      { name: 'swipe', w: 3, range: [0, 110] },
      { name: 'pounce', w: 2, range: [110, 420], punish: true },
      { name: 'burrow', w: 2, range: [0, 9999], punish: true, cd: 4 },
      { name: 'lash', w: 2, range: [70, 260] },
      { name: 'decoy', w: 2, phase: 2, cd: 7, when() { return this.scene.countEnemies('lure') === 0; } },
      { name: 'needles', w: 2, phase: 2, range: [60, 400], punish: true },
    ];
  }
  *swipe() {
    yield* this.walkToward(56, 0.9);
    this.face();
    yield* this.tele(0.45, 0xff6060, 'windup');
    const f = this.facing;
    this.body.setVelocityX(f * 130);
    this.setPose('swipe', 0.3);
    this.scene.addHurt(0, 0, 62, 54, 1, 0.18, (h) => { h.x = this.x + (f > 0 ? 6 : -68); h.y = this.y - 24; });
    this.scene.fx.slashArc(this.x + f * 40, this.y + 6, f, 0xffffff, 2.2);
    Sfx.play('slash'); Sfx.play('roarSmall');
    yield 0.2;
    yield* this.halt();
    yield 0.35;
  }
  *pounce() {
    this.face();
    yield* this.tele(0.4, 0xff6060, 'windup');
    this.setPose('roar', 0.2);
    yield* this.leapAt(this.player.x, -560);
    this.scene.fx.shake(240, 0.012);
    Sfx.play('break');
    this.scene.fx.dust(this.x, this.body.bottom, 18);
    this.shock(this.x - 24, -1);
    this.shock(this.x + 24, 1);
    Controls.rumble(200, 0.6, 0.4);
    yield 0.4;
  }
  // Sink into the ground, travel under the player as a moving mound, then erupt beneath them
  *burrow() {
    const s = this.scene, n = this.phase >= 2 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      this.setPose('burrow', 0.4);
      Sfx.play('break');
      s.fx.dust(this.x, this.body.bottom, 14);
      yield 0.35;
      this.buried = true; this.setAlpha(0);
      let t = 1.1 / this.spd;
      while (t > 0) {
        t -= this.dt;
        this.steerX(this.player.x, 300);
        if (Math.random() < 0.6) s.fx.dust(this.x + Phaser.Math.Between(-12, 12), this.arena.floor, 1);
        yield 0;
      }
      this.body.setVelocityX(0);
      // the ground trembles where it will come up
      const x = this.x, g = this.gfx;
      Sfx.play('geyser');
      let e = 0;
      while (e < 0.6 / this.spd) {
        e += this.dt;
        g.clear(); g.fillStyle(0x8a5a3a, 0.25 + 0.25 * Math.abs(Math.sin(e * 22))).fillEllipse(x, this.arena.floor - 2, 70, 10);
        if (Math.random() < 0.5) s.fx.debris(x + Phaser.Math.Between(-24, 24), this.arena.floor - 2, 0x6a4a34, 1);
        s.fx.shake(30, 0.003);
        yield 0;
      }
      g.clear();
      this.buried = false; this.setAlpha(1);
      this.setPose('rise', 0.3);
      s.addHurt(x - 30, this.arena.floor - 96, 60, 96, 1, 0.3);
      s.fx.debris(x, this.arena.floor - 4, 0x5a4634, 18);
      s.fx.shake(260, 0.014);
      Sfx.play('roarSmall');
      Controls.rumble(220, 0.7, 0.5);
      yield 0.55;
    }
  }
  // The lure whips out along the ground in front: jump it
  *lash() {
    this.face();
    yield* this.tele(0.5, 0xffc0d0, 'lure');
    const f = this.facing, feet = this.arena.floor;
    const g = this.under;
    let e = 0;
    Sfx.play('whip');
    while (e < 0.34) {
      e += this.dt;
      const reach = Math.min(1, e / 0.12) * 170;
      const x1 = this.x + f * 34, x2 = x1 + f * reach, y = feet - 18 + Math.sin(e * 40) * 3;
      g.clear();
      g.lineStyle(3, 0x2a1e18, 1).lineBetween(x1, this.y - 24, x2, y);
      g.fillStyle(0xf4eef0, 1).fillCircle(x2, y, 4);
      this.scene.beamHit(x1, y, x2, y, 9, 1);
      yield 0;
    }
    g.clear();
    yield 0.3;
  }
  // The bait walks out on its own: it bursts if it reaches you
  *decoy() {
    this.setPose('lure', 0.6);
    Sfx.play('roarSmall');
    yield 0.5;
    const d = new LureDecoy(this.scene, this.x + this.facing * 40, this.arena.floor);
    d.summoned = true;
    this.scene.fx.wisp(d.x, d.y, 0xf4eef0, 30);
    yield 0.4;
  }
  // It shakes itself and its fur flies off as needles, in falling arcs
  *needles() {
    yield* this.tele(0.45, 0xffa070, 'roar');
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.22, sp = 300;
      new EnemyShot(this.scene, this.x, this.y - 20, 'needle', Math.cos(a) * sp, Math.sin(a) * sp, { gravity: true, dmg: 1, life: 2.4, rotate: true, w: 4, h: 4 });
    }
    Sfx.play('wave');
    this.scene.fx.burst(this.x, this.y - 20, 0x4a3628, 20);
    yield 0.6;
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) { this.phase = 2; this.buried = false; this.setAlpha(1); this.setScript(this.enrage()); }
  }
  *enrage() {
    this.body.setVelocityX(0);
    this.invulnerable = true;
    this.telegraph(0xff4040);
    this.setPose('roar', 1.1);
    Sfx.play('roar');
    this.scene.fx.shake(700, 0.012);
    this.scene.fx.floatText(this.x, this.y - 60, '"Fifty years I have hunted. You will not be the one."', '#ffb0b0');
    yield 1.1;
    this.untelegraph();
    this.invulnerable = false;
    this.spd = 1.2;
    yield* this.brain();
  }
}

// The bait: a pale little girl who walks toward you and bursts into fur
class LureDecoy extends Enemy {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'lure', { hp: 5, dmg: 1, drop: 1, bw: 8, bh: 16, kind: 'lure', kb: 1.2, frame: 'idle0', frameFeet: HF.FEET, burst: 0xf4eef0 });
    this.life = 5;
    this.anim('run', 0.6);
  }
  think(dt) {
    const p = this.scene.player, b = this.body;
    this.life -= dt;
    this.faceTo(p.x);
    if (b.blocked.down) b.setVelocityX(approach(b.velocity.x, this.facing * 62, 300 * dt));
    if (Math.abs(p.x - this.x) < 16 && Math.abs(p.y - this.y) < 24) this.pop();
    else if (this.life <= 0) this.pop();
  }
  pop() {
    const s = this.scene;
    s.addHurt(this.x - 22, this.y - 22, 44, 44, 1, 0.15);
    s.fx.burst(this.x, this.y, 0x2a1e18, 18);
    s.fx.ring(this.x, this.y, 0xff8090, 26, 260, 2);
    Sfx.play('hit');
    this.drop = 0;
    this.die(0);
  }
}

// ---------------------------------------------------------------------------
class Menos extends Boss {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'menos', { id: 'menos', hp: 135, dmg: 1, drop: 20, bw: 40, bh: 100, kind: 'menos', frame: 'idle0', frameFeet: 120 });
    this.telePose = 'crouch';
    this.introPose = 'cero';
    this.walkSpeed = 34; this.prefer = 70; this.patience = 4; this.pause = 0.6;
    this.anim('idle');
    this.orb = scene.add.image(x, this.y, 'cero_orb').setDepth(29).setVisible(false);
  }
  mouth() { return { x: this.x + this.facing * 39, y: this.y - 43 }; }
  defaultPose() { return 'idle'; }
  afterTick(dt) {
    super.afterTick(dt);
    if (this.anims.currentAnim && this.anims.currentAnim.key === 'menos:idle') this.anims.timeScale = Math.abs(this.body.velocity.x) > 5 ? 2 : 1;
  }
  moveList() {
    return [
      { name: 'swipe', w: 3, range: [0, 90] },
      { name: 'stomp', w: 2, range: [0, 420], punish: true },
      { name: 'cero', w: 2, range: [110, 700] },
      { name: 'summon', w: 1.5, cd: 9, when() { return this.scene.countEnemies('hollow') < 2; } },
      { name: 'ceroSweep', w: 2, phase: 2, punish: true, cd: 6 },
    ];
  }
  *closeIn() { yield* this.stomp(); }
  *stomp() {
    const n = this.phase === 2 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      this.face();
      yield* this.tele(0.5);
      const p = this.player;
      this.body.setVelocity(Phaser.Math.Clamp((p.x - this.x) * 1.3, -220, 220), -520);
      yield 0.15;
      yield () => this.body.blocked.down;
      this.body.setVelocityX(0);
      this.scene.fx.shake(220, 0.012);
      Sfx.play('break');
      Controls.rumble(200, 0.7, 0.4);
      this.scene.fx.dust(this.x, this.body.bottom, 16);
      this.shock(this.x - 22, -1);
      this.shock(this.x + 22, 1);
      yield 0.35;
    }
  }
  *cero() {
    this.face();
    const m = this.mouth();
    let ang = this.aimAt(m.x, m.y);
    if (Math.cos(ang) * this.facing < 0.25) ang = this.facing > 0 ? 0.3 : Math.PI - 0.3;
    this.orb.setPosition(m.x, m.y).setVisible(true).setScale(0.2);
    this.scene.tweens.add({ targets: this.orb, scale: 1.2, duration: 800 });
    this.setPose('cero', 1.5);
    yield* this.aimLine(m.x, m.y, ang, 0.85);
    yield* this.beam(m.x, m.y, ang, 0.55, 0, 12);
    this.orb.setVisible(false);
    yield 0.3;
  }
  // A Cero dragged across the floor from one end of the ravine to the other: jump it
  *ceroSweep() {
    this.face();
    const m = this.mouth();
    const near = this.facing > 0 ? 0.55 : Math.PI - 0.55, far = this.facing > 0 ? 0.08 : Math.PI - 0.08;
    this.orb.setPosition(m.x, m.y).setVisible(true).setScale(0.2);
    this.scene.tweens.add({ targets: this.orb, scale: 1.4, duration: 900 });
    this.setPose('cero', 2.2);
    yield* this.aimLine(m.x, m.y, near, 0.9);
    yield* this.beam(m.x, m.y, near, 1.1, far - near, 12);
    this.orb.setVisible(false);
    yield 0.4;
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
      h.mode = 'chase'; h.summoned = true;
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
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) { this.phase = 2; this.orb.setVisible(false); this.setScript(this.enrage()); }
  }
  *enrage() {
    this.body.setVelocityX(0);
    this.invulnerable = true;
    this.telegraph(0xff4040);
    Sfx.play('roar');
    this.scene.fx.shake(700, 0.012);
    this.scene.fx.floatText(this.x, this.y - 70, 'A hundred voices howl at once.', '#ffb0b0');
    yield 1.0;
    this.untelegraph();
    this.invulnerable = false;
    this.spd = 1.15;
    yield* this.brain();
  }
  onDie() { this.orb.destroy(); }
}

// ---------------------------------------------------------------------------
// The base for the bosses who fight on two feet with a blade (or claws).
class Duelist extends Boss {
  constructor(scene, x, feet, cfg) {
    super(scene, x, feet, cfg.key, Object.assign({ bw: 12, bh: 26, dmg: 1, frame: 'idle0', frameFeet: HF.FEET }, cfg));
    this.telePose = 'windup';
    this.introPose = 'windup';
    this.anim('idle');
    this.aura = scene.add.particles(0, 0, 'dot', {
      speed: { min: 10, max: 50 }, angle: { min: 250, max: 290 }, lifespan: 600,
      scale: { start: 0.8, end: 0 }, alpha: { start: 0.7, end: 0 }, frequency: 50, emitting: false, tint: cfg.auraTint || 0x8a7cff,
    }).setDepth(14);
    this.aura.startFollow(this, 0, 8);
  }
  // Two or three quick cuts, stepping in
  *combo(n = this.phase >= 2 ? 4 : 3, color = 0xffffff) {
    yield* this.walkToward(40, 0.7, this.walkSpeed * 1.6);
    for (let i = 0; i < n; i++) {
      this.face();
      if (Math.abs(this.player.x - this.x) > 36) this.body.setVelocityX(this.facing * 170);
      yield* this.tele(0.22, 0xff8080);
      this.body.setVelocityX(this.facing * 110);
      this.slashBox(32, 24, 0.1, color);
      yield 0.14;
      this.body.setVelocityX(0);
      yield 0.08 / this.spd;
    }
    yield 0.35;
  }
  // Shunpo / Sonido behind the player and cut
  *flashStep(color = 0xffffff, tele = 0.3) {
    const p = this.player;
    let tx = p.x - p.facing * 44;
    if (tx < this.arena.left + 10 || tx > this.arena.right - 10) tx = p.x + p.facing * 44;
    yield* this.blink(tx, this.floorY());
    yield* this.tele(tele, 0xff6060);
    this.slashBox(36, 26, 0.12, color);
    yield 0.4 / this.spd;
  }
  // A straight dash along the floor with the blade out
  *dashSlash(speed = 470, t0 = 0.36, color = 0xb0b8ff) {
    this.face();
    yield* this.tele(0.38, 0xffffff);
    const dir = this.facing;
    let t = t0;
    const hb = this.scene.addHurt(0, 0, 32, 24, 1, t, (h) => { h.x = this.x + (dir > 0 ? -6 : -26); h.y = this.y - 12; });
    Sfx.play('dash');
    this.setPose('dash', t + 0.05);
    while (t > 0) {
      t -= this.dt;
      this.body.setVelocityX(dir * speed * this.spd);
      if (Math.random() < 0.6) this.scene.fx.afterimage(this, color, 0.4, 200);
      if (this.body.blocked.left || this.body.blocked.right) break;
      yield 0;
    }
    hb.t = 0;
    yield* this.halt();
    yield 0.3 / this.spd;
  }
  *cero(col = [0xff2a50, 0xff4a70, 0xffe0ea], aim = 0.7, dur = 0.45, width = 10, sweep = 0) {
    this.face();
    const ox = () => ({ x: this.x + this.facing * 10, y: this.y - 6 });
    const o = ox();
    const a = this.aimAt(o.x, o.y);
    this.setPose('cast', aim / this.spd + dur + 0.2);
    yield* this.aimLine(o.x, o.y, a, aim / this.spd, col[1]);
    yield* this.beam(o.x, o.y, a, dur, sweep, width, 720, col);
    yield 0.3;
  }
  onDie() { this.aura.destroy(); }
}

// ---------------------------------------------------------------------------
// Renji Abarai: Zabimaru, the snake-tail blade, stretches across the bridge in
// lashes and sweeps. In Bankai the blade becomes Hihio Zabimaru, a serpent of bone.
class Renji extends Duelist {
  constructor(scene, x, feet) {
    super(scene, x, feet, { id: 'renji', key: 'renji', hp: 240, drop: 25, kind: 'renji', bh: 27, auraTint: 0xff5040 });
    this.walkSpeed = 80; this.prefer = 120; this.patience = 3;
    this.introLine = '"You will not reach Rukia. Not while I still stand."';
    this.lineColor = '#ffc0b0';
  }
  moveList() {
    return [
      { name: 'lash', w: 3, range: [60, 280] },
      { name: 'sweep', w: 2, range: [0, 190], punish: true },
      { name: 'lowSweep', w: 2, range: [40, 230] },
      { name: 'combo', w: 2, range: [0, 70] },
      { name: 'leapLash', w: 2, range: [140, 500], punish: true },
      { name: 'higaZekko', w: 1.5, range: [100, 500], cd: 6, maxPhase: 1 },
      { name: 'snakeCharge', w: 3, phase: 2, punish: true, cd: 3 },
      { name: 'hikotsu', w: 2, phase: 2, range: [120, 700], cd: 6 },
      { name: 'snakeBite', w: 2, phase: 2, range: [60, 320] },
    ];
  }
  hand() { return { x: this.x + this.facing * 8, y: this.y - 2 }; }
  // Draw the segmented blade from the hand to `len` along `ang`; it hurts along its whole length
  drawWhip(ang, len, hurt = true) {
    const g = this.under, h = this.hand();
    g.clear();
    const seg = 9, n = Math.max(1, Math.floor(len / seg));
    let px = h.x, py = h.y;
    for (let i = 1; i <= n; i++) {
      const wob = Math.sin(this.clock * 30 + i) * 0.04 * (i / n);
      const x = h.x + Math.cos(ang + wob) * i * seg, y = h.y + Math.sin(ang + wob) * i * seg;
      g.lineStyle(4, 0x3a2028, 1).lineBetween(px, py, x, y);
      g.lineStyle(2, i % 2 ? 0xc9d0d8 : 0xffffff, 1).lineBetween(px, py, x, y);
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      g.fillStyle(0xffffff, 1).fillTriangle(x, y, x - Math.cos(ang) * 4 + nx * 3, y - Math.sin(ang) * 4 + ny * 3, x - Math.cos(ang) * 4, y - Math.sin(ang) * 4);
      px = x; py = y;
    }
    if (hurt) this.scene.beamHit(h.x, h.y, px, py, 5, 1);
    return { x: px, y: py };
  }
  *whip(angFn, reach, outT, holdT, inT) {
    let e = 0;
    const total = outT + holdT + inT;
    Sfx.play('whip');
    while (e < total) {
      e += this.dt;
      const k = e < outT ? e / outT : e < outT + holdT ? 1 : 1 - (e - outT - holdT) / inT;
      this.drawWhip(angFn(e / total), reach * Phaser.Math.Easing.Cubic.Out(Math.max(0, k)));
      yield 0;
    }
    this.under.clear();
  }
  *lash() {
    this.face();
    if (!this.called) { this.called = true; this.scene.fx.floatText(this.x, this.y - 30, '"Roar, Zabimaru!"', '#ffb0a0'); }
    const h = this.hand();
    let a = this.aimAt(h.x, h.y);
    a = this.facing > 0 ? Phaser.Math.Clamp(a, -0.9, 0.6) : (a > 0 ? Math.max(a, Math.PI - 0.6) : Math.min(a, -Math.PI + 0.9));
    this.setPose('cast', 0.9);
    yield* this.aimLine(h.x, h.y, a, 0.45 / this.spd, 0xff8070);
    yield* this.whip(() => a, 250, 0.14, 0.12, 0.2);
    yield 0.25;
  }
  // Overhead to the floor in front: get behind him or out of reach
  *sweep() {
    this.face();
    yield* this.tele(0.5, 0xff8070, 'windup');
    const f = this.facing, from = f > 0 ? -1.9 : -Math.PI + 1.9, to = f > 0 ? 0.35 : Math.PI - 0.35;
    this.setPose('strike', 0.5);
    yield* this.whip((k) => from + (to - from) * Math.min(1, k * 1.6), 175, 0.12, 0.3, 0.15);
    yield 0.3;
  }
  // Along the floor: jump it
  *lowSweep() {
    this.face();
    this.setPose('charge', 0.5);
    this.telegraph(0xffc080); Sfx.play('telegraph');
    yield 0.45 / this.spd;
    this.untelegraph();
    const f = this.facing;
    const ang = () => Math.atan2(this.arena.floor - 8 - this.hand().y, f * 200);
    this.setPose('strike', 0.4);
    yield* this.whip(ang, 230, 0.16, 0.1, 0.2);
    yield 0.25;
  }
  *leapLash() {
    this.face();
    yield* this.tele(0.3, 0xff8070, 'windup');
    this.body.setVelocityY(-500);
    Sfx.play('jump');
    yield 0.3;
    this.body.setAllowGravity(false); this.body.setVelocity(0, 0);
    const h = this.hand(), a = this.aimAt(h.x, h.y);
    this.setPose('cast', 0.8);
    yield* this.aimLine(h.x, h.y, a, 0.35 / this.spd, 0xff8070);
    yield* this.whip(() => a, 260, 0.14, 0.1, 0.18);
    this.body.setAllowGravity(true);
    yield () => this.body.blocked.down;
    yield 0.3;
  }
  // Higa Zekko: the segments fly apart, hang in the air, then shoot at you one after another
  *higaZekko() {
    this.face();
    this.setPose('raise', 1.6);
    Sfx.play('charge');
    const s = this.scene, segs = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.45;
      const img = s.add.image(this.x, this.y - 10, 'zabi').setDepth(29);
      segs.push(img);
      s.tweens.add({ targets: img, x: this.x + Math.cos(a) * 60, y: this.y - 30 + Math.sin(a) * 34, duration: 380, ease: 'Cubic.out' });
    }
    yield 0.6;
    for (const img of segs) {
      const p = this.player, a = Math.atan2(p.body.center.y - img.y, p.x - img.x);
      img.setRotation(a);
      yield 0.12 / this.spd;
      new EnemyShot(s, img.x, img.y, 'zabi', Math.cos(a) * 330, Math.sin(a) * 330, { dmg: 1, life: 1.6, rotate: true, w: 8, h: 8 });
      Sfx.play('throw');
      img.destroy();
    }
    yield 0.4;
  }
  // Hihio Zabimaru slithers along the floor to the far wall and back
  *snakeCharge() {
    const s = this.snake, f = Math.sign(this.player.x - this.x) || this.facing, fl = this.arena.floor - 12;
    this.facing = f;
    this.setPose('cast', 2);
    this.telegraph(0xff6050); Sfx.play('roarSmall');
    yield 0.5 / this.spd;
    this.untelegraph();
    const far = f > 0 ? this.arena.right - 10 : this.arena.left + 10;
    let done = false;
    s.run([{ x: this.x + f * 30, y: fl }, { x: far, y: fl }, { x: far - f * 40, y: fl - 60 }, { x: this.x, y: this.y - 30 }], 420 * this.spd, () => { done = true; });
    Sfx.play('whip');
    yield () => done;
    yield 0.35;
  }
  *snakeBite() {
    this.face();
    const s = this.snake, p = this.player;
    this.setPose('cast', 1.2);
    const tx = p.x, ty = p.body.center.y;
    yield* this.aimLine(s.head.x, s.head.y, Math.atan2(ty - s.head.y, tx - s.head.x), 0.45 / this.spd, 0xff6050);
    let done = false;
    s.run([{ x: tx + (tx - s.head.x) * 0.25, y: ty + (ty - s.head.y) * 0.25 }, { x: this.x, y: this.y - 30 }], 520 * this.spd, () => { done = true; });
    yield () => done;
    yield 0.3;
  }
  // Hikotsu Taiho: the serpent rears over Renji and breathes a beam of red
  *hikotsu() {
    const s = this.snake;
    this.face();
    let done = false;
    s.run([{ x: this.x - this.facing * 10, y: this.arena.top + 30 }], 380, () => { done = true; }, true);
    yield () => done;
    const g = this.gfx;
    Sfx.play('charge');
    let e = 0;
    while (e < 0.9 / this.spd) {
      e += this.dt;
      const m = s.mouth || s.head;
      g.clear(); g.fillStyle(0xff4a40, 0.3 + 0.3 * Math.sin(e * 30)).fillCircle(m.x, m.y, 6 + e * 10);
      yield 0;
    }
    g.clear();
    const m = s.mouth || s.head, a = Math.atan2(this.player.body.center.y - m.y, this.player.x - m.x);
    yield* this.beam(() => s.mouth || s.head, 0, a, 0.6, 0, 14, 720, [0xc8202c, 0xff5040, 0xffe0d0]);
    done = false;
    s.run([{ x: this.x, y: this.y - 30 }], 380, () => { done = true; });
    yield () => done;
    s.hold = false;
    yield 0.3;
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) { this.phase = 2; this.setScript(this.bankai()); }
  }
  *bankai() {
    yield* this.changeForm('renji_b', '"Bankai. Hihio Zabimaru!"', { text: 'BANKAI', color: '#ff5040', small: 'Hihio Zabimaru' }, 0xc8202c, '#ffb0a0');
    this.snake = new BoneSnake(this);
    this.hazards.push(this.snake);
    this.aura.emitting = true;
    this.spd = 1.1;
    this.prefer = 160;
    yield* this.brain();
  }
  cleanup() {
    super.cleanup();
    if (this.phase >= 2 && this.alive && this.snake) { this.snake = new BoneSnake(this); this.hazards.push(this.snake); }
  }
}

// ---------------------------------------------------------------------------
// Byakuya Kuchiki: he barely moves; Senbonzakura does it for him. Petals hunt
// you, sweep the floor and close around you; in Bankai a thousand blades rise.
class Byakuya extends Duelist {
  constructor(scene, x, feet) {
    super(scene, x, feet, { id: 'byakuya', key: 'byakuya', hp: 300, drop: 25, kind: 'byakuya', bh: 26, auraTint: 0xff90b8 });
    this.walker = false; this.patience = 2.6; this.prefer = 140; this.pause = 0.5;
    this.introLine = '"You will not take another step toward my sister."';
    this.lineColor = '#ffd0e0';
  }
  moveList() {
    return [
      { name: 'shunpoSlash', w: 3, range: [0, 600] },
      { name: 'senbonzakura', w: 2.5, range: [80, 600], punish: true, cd: 3.5, when() { return !this.hazards.some(h => h instanceof PetalSwarm); } },
      { name: 'petalWave', w: 2, cd: 4, punish: true },
      { name: 'byakurai', w: 2, range: [140, 700] },
      { name: 'rikujo', w: 1.5, phase: 2, cd: 9, punish: true },
      { name: 'kageyoshi', w: 2.5, phase: 2, punish: true, cd: 3 },
      { name: 'gokei', w: 2.5, phase: 3, cd: 6, punish: true },
    ];
  }
  *closeIn() { yield* this.shunpoSlash(); }
  *shunpoSlash() {
    yield* this.flashStep(0xffc0d8, this.phase >= 2 ? 0.26 : 0.32);
  }
  *senbonzakura() {
    this.face();
    if (!this.called) { this.called = true; this.scene.fx.floatText(this.x, this.y - 30, '"Scatter, Senbonzakura."', '#ffd0e0'); }
    this.setPose('raise', 0.6);
    Sfx.play('petals');
    yield 0.45 / this.spd;
    const n = this.phase >= 3 ? 2 : 1;
    for (let i = 0; i < n; i++) this.hazards.push(new PetalSwarm(this, this.x + this.facing * 14, this.y - 16 - i * 20, { speed: 135 + i * 20, life: 2.4, r: 17 }));
    this.setPose('guardIdle', 2.2);
    yield 1.6;
  }
  // A wall of petals rolls across the floor: jump over it (in Bankai a second one comes higher)
  *petalWave() {
    this.face();
    yield* this.tele(0.4, 0xffc0d8, 'cast');
    const s = this.scene, f = this.facing, waves = this.phase >= 2 ? 2 : 1;
    for (let i = 0; i < waves; i++) {
      const h = i === 0 ? 38 : 30, y = i === 0 ? this.arena.floor - h / 2 : this.arena.floor - 92;
      const sh = new EnemyShot(s, this.x + f * 20, y, 'px', f * 230, 0, { dmg: 1, life: 3, w: 18, h, pierce: true, passWalls: false });
      sh.setAlpha(0);
      const em = s.add.particles(0, 0, 'petal', {
        x: { min: -9, max: 9 }, y: { min: -h / 2, max: h / 2 }, speedX: { min: -30, max: 30 }, speedY: { min: -40, max: 10 }, lifespan: 420,
        rotate: { min: 0, max: 360 }, scale: { start: 1.1, end: 0.2 }, alpha: { start: 1, end: 0 }, frequency: 10, tint: [0xffc0d8, 0xff90b8], blendMode: 'ADD',
      }).setDepth(28);
      em.startFollow(sh);
      sh.once('destroy', () => { em.stop(); s.time.delayedCall(500, () => em.destroy()); });
      Sfx.play('petals');
      yield 0.55;
    }
    yield 0.4;
  }
  // Hado #4 Byakurai: a thin line of white lightning from one finger
  *byakurai() {
    this.face();
    const o = { x: this.x + this.facing * 10, y: this.y - 6 };
    const a = this.aimAt(o.x, o.y);
    this.setPose('cast', 0.9);
    yield* this.aimLine(o.x, o.y, a, 0.5 / this.spd, 0xbfe6ff);
    Sfx.play('zap');
    yield* this.beam(o.x, o.y, a, 0.14, 0, 5, 720, [0x7fb4ff, 0xd8ecff, 0xffffff]);
    yield 0.35;
  }
  // Bakudo #61 Rikujokoro: six rods close on where you stand. Caught, you cannot move for a moment.
  *rikujo() {
    const p = this.player, cx = p.x, cy = p.body.center.y, g = this.gfx;
    this.setPose('cast', 1.1);
    Sfx.play('bakudo');
    let e = 0;
    const T = 0.8 / this.spd;
    while (e < T) {
      e += this.dt;
      const k = e / T, r = 70 - 52 * k;
      g.clear();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + k * 0.6, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        g.fillStyle(0xffd75e, 0.5 + 0.5 * k).fillRect(x - 2, y - 9, 4, 18);
      }
      g.lineStyle(1, 0xffd75e, 0.3 + 0.4 * k).strokeCircle(cx, cy, r);
      yield 0;
    }
    g.clear();
    this.scene.fx.ring(cx, cy, 0xffd75e, 24, 300, 3);
    if (Math.hypot(p.x - cx, p.body.center.y - cy) < 22 && p.state !== 'dead' && p.state !== 'dash') {
      p.bindStun(0.9);
      this.scene.fx.chain(cx - 18, cy, cx + 18, cy);
      yield 0.25;
      yield* this.flashStep(0xffc0d8, 0.25);
    }
    yield 0.3;
  }
  // Senbonzakura Kageyoshi: rows of giant blades burst from the floor, rolling outward from him
  *kageyoshi() {
    this.face();
    this.setPose('raise', 1.6);
    const dirs = this.phase >= 3 ? [-1, 1] : [Math.sign(this.player.x - this.x) || this.facing];
    const g = this.gfx, cols = [];
    for (const d of dirs) for (let x = this.x + d * 28; x > this.arena.left && x < this.arena.right; x += d * 26) cols.push({ x, t: Math.abs(x - this.x) / 300 });
    Sfx.play('petals');
    let e = 0;
    const lead = 0.45 / this.spd;
    const fired = new Set();
    while (e < lead + 1.4) {
      e += this.dt;
      g.clear();
      for (const c of cols) {
        const until = c.t + lead - e;
        if (until > 0 && until < lead) g.fillStyle(0xff90b8, 0.15 + 0.35 * (1 - until / lead)).fillRect(c.x - 6, this.arena.floor - 4, 12, 4);
        if (until <= 0 && !fired.has(c)) {
          fired.add(c);
          this.scene.addHurt(c.x - 6, this.arena.floor - 52, 12, 52, 1, 0.28);
          const img = this.scene.add.image(c.x, this.arena.floor, 'giantblade').setOrigin(0.5, 1).setDepth(17).setScale(1, 0.1);
          this.scene.tweens.add({ targets: img, scaleY: 1, duration: 90, ease: 'Back.out', yoyo: true, hold: 160, onComplete: () => img.destroy() });
          if (fired.size % 3 === 0) Sfx.play('slash');
        }
      }
      if (fired.size >= cols.length) break;
      yield 0;
    }
    g.clear();
    yield 0.4;
  }
  // Gokei: a sphere of petals closes on where you stand: be somewhere else when it does
  *gokei() {
    const p = this.player, cx = p.x, cy = p.body.center.y, g = this.gfx;
    this.setPose('cast', 1.4);
    Sfx.play('petals');
    let e = 0;
    const T = 1.1 / this.spd;
    while (e < T) {
      e += this.dt;
      const r = 80 * (1 - e / T) + 10;
      g.clear();
      g.lineStyle(2, 0xff90b8, 0.35 + 0.4 * (e / T)).strokeCircle(cx, cy, r);
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2 + e * 3; g.fillStyle(0xffc0d8, 0.9).fillRect(cx + Math.cos(a) * r - 1, cy + Math.sin(a) * r - 1, 3, 2); }
      yield 0;
    }
    g.clear();
    this.scene.fx.burst(cx, cy, 0xff90b8, 26);
    this.scene.fx.ring(cx, cy, 0xffc0d8, 40, 300, 3);
    this.scene.addHurt(cx - 24, cy - 24, 48, 48, 1, 0.12);
    Sfx.play('hit');
    yield 0.4;
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.55) { this.phase = 2; this.setScript(this.bankai()); }
    else if (this.phase === 2 && this.hp <= this.maxHp * 0.22) { this.phase = 3; this.setScript(this.senkei()); }
  }
  *bankai() {
    yield* this.changeForm('byakuya_b', '"Bankai. Senbonzakura Kageyoshi."', { text: 'BANKAI', color: '#ff90b8', small: 'Senbonzakura Kageyoshi' }, 0xff90b8, '#ffd0e0');
    this.aura.emitting = true;
    this.spd = 1.1;
    this.scene.ambience && this.scene.ambience.petalStorm && this.scene.ambience.petalStorm();
    yield* this.brain();
  }
  *senkei() {
    this.invulnerable = true;
    this.scene.fx.floatText(this.x, this.y - 34, '"Senkei. You are the first in a hundred years to see it."', '#ffd0e0');
    this.setPose('raise', 1);
    yield 1.0;
    this.scene.setDarkness(0.45);
    this.invulnerable = false;
    this.spd = 1.25;
    yield* this.brain();
  }
}

// ---------------------------------------------------------------------------
// Kenpachi Zaraki: he walks at you and does not stop. He shrugs off weak cuts,
// never flinches, and with the eyepatch off his Reiatsu flares yellow.
class Kenpachi extends Duelist {
  constructor(scene, x, feet) {
    super(scene, x, feet, { id: 'kenpachi', key: 'kenpachi', hp: 420, drop: 35, kind: 'kenpachi', bh: 28, armor: 0.75, auraTint: 0xf2d040 });
    this.noFlinch = true;
    this.walkSpeed = 62; this.prefer = 40; this.patience = 2; this.pause = 0.25; this.nearDist = 80;
    this.introLine = '"Finally. Someone worth cutting."';
    this.lineColor = '#ffe080';
    this.bellT = 0;
  }
  afterTick(dt) {
    super.afterTick(dt);
    // the bells in his hair ring as he walks
    if (Math.abs(this.body.velocity.x) > 20) { this.bellT -= dt; if (this.bellT <= 0) { this.bellT = 0.42; Sfx.play('bell'); } }
  }
  moveList() {
    return [
      { name: 'overhead', w: 3, range: [0, 80] },
      { name: 'wideSlash', w: 2, range: [0, 100] },
      { name: 'lunge', w: 2.5, range: [80, 320], punish: true },
      { name: 'leap', w: 1.5, range: [160, 600], punish: true },
      { name: 'kendo', w: 2.5, phase: 2, range: [0, 400], punish: true },
      { name: 'pillar', w: 1.5, phase: 2, range: [0, 120], cd: 6 },
    ];
  }
  *overhead() {
    yield* this.walkToward(46, 1.2);
    this.face();
    yield* this.tele(0.45, 0xffe080, 'windup');
    const f = this.facing;
    this.slashBox(68, 52, 0.14, 0xffe080, 2);
    this.scene.fx.shake(160, 0.01);
    this.shock(this.x + f * 40, f, 0xffe080, 220, 0.9);
    yield 0.5;
  }
  // a two-handed swing all the way round
  *wideSlash() {
    yield* this.walkToward(50, 1);
    yield* this.tele(0.5, 0xffe080, 'charge');
    this.scene.addHurt(this.x - 64, this.y - 20, 128, 40, 1, 0.16);
    this.scene.fx.slashArc(this.x + 30, this.y, 1, 0xffe080, 2);
    this.scene.fx.slashArc(this.x - 30, this.y, -1, 0xffe080, 2);
    this.setPose('strike', 0.3);
    Sfx.play('slash'); Sfx.play('wave');
    yield 0.55;
  }
  *lunge() {
    this.face();
    yield* this.tele(0.4, 0xffe080, 'windup');
    yield* this.dashSlash(380, 0.38, 0xffe080);
  }
  *leap() {
    this.face();
    yield* this.tele(0.3, 0xffe080, 'charge');
    this.setPose('jump', 0.6);
    yield* this.leapAt(this.player.x, -540);
    this.setPose('strike', 0.25);
    this.scene.addHurt(this.x - 40, this.y - 20, 80, 40, 1, 0.14);
    this.scene.fx.shake(250, 0.014);
    Sfx.play('break');
    this.shock(this.x - 20, -1, 0xffe080);
    this.shock(this.x + 20, 1, 0xffe080);
    yield 0.45;
  }
  // Kendo, with both hands: one cut that sends a wave of Reiatsu along the ground
  *kendo() {
    yield* this.walkToward(120, 0.6);
    this.face();
    yield* this.tele(0.55, 0xf2d040, 'windup');
    const f = this.facing;
    this.slashBox(60, 48, 0.14, 0xf2d040, 2.2);
    this.shock(this.x + f * 30, f, 0xf2d040, 300, 1.8);
    this.scene.fx.shake(300, 0.016);
    Controls.rumble(250, 0.8, 0.5);
    yield 0.6;
  }
  // A pillar of yellow Reiatsu bursts up around him
  *pillar() {
    this.setPose('charge', 0.9);
    const g = this.gfx;
    let e = 0;
    Sfx.play('charge');
    while (e < 0.7 / this.spd) { e += this.dt; g.clear(); g.lineStyle(2, 0xf2d040, 0.4 + 0.4 * Math.abs(Math.sin(e * 20))).strokeCircle(this.x, this.y, 72); yield 0; }
    g.clear();
    this.scene.addHurt(this.x - 66, this.y - 66, 132, 132, 1, 0.2);
    this.scene.fx.ring(this.x, this.y, 0xf2d040, 90, 500, 5);
    this.scene.fx.burst(this.x, this.y, 0xf2d040, 30);
    this.scene.fx.shake(300, 0.014);
    Sfx.play('bankai');
    yield 0.5;
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) { this.phase = 2; this.setScript(this.unleash()); }
  }
  *unleash() {
    yield* this.changeForm('kenpachi_r', '"Ha! You are fun. Then I will take this off."', { text: 'UNLEASHED', color: '#f2d040', small: 'the eyepatch comes off' }, 0xf2d040, '#ffe080');
    this.aura.setParticleTint(0xf2d040);
    this.aura.emitting = true;
    this.armor = 0.85; this.spd = 1.25; this.walkSpeed = 85;
    yield* this.brain();
  }
}

// ---------------------------------------------------------------------------
// Grimmjow Jaegerjaquez: he pounces, kicks off the walls and claws; released as
// Pantera, Desgarron tears five blades of light out of the air.
class Grimmjow extends Duelist {
  constructor(scene, x, feet) {
    super(scene, x, feet, { id: 'grimmjow', key: 'grimmjow', hp: 340, drop: 30, kind: 'grimmjow', bh: 26, auraTint: 0x58b8e8 });
    this.walkSpeed = 95; this.prefer = 70; this.patience = 2.2; this.pause = 0.3;
    this.introLine = '"Come on, Shinigami! Show me that face again!"';
    this.lineColor = '#a8e4ff';
  }
  moveList() {
    return [
      { name: 'pounce', w: 3, range: [80, 420], punish: true },
      { name: 'clawCombo', w: 3, range: [0, 80] },
      { name: 'redCero', w: 2, range: [140, 700], maxPhase: 1 },
      { name: 'wallKick', w: 2, punish: true, cd: 4 },
      { name: 'desgarron', w: 3, phase: 2, range: [0, 260] },
      { name: 'garra', w: 2, phase: 2, range: [100, 600], punish: true },
      { name: 'granRey', w: 1.5, phase: 2, cd: 9 },
    ];
  }
  *pounce() {
    this.face();
    yield* this.tele(0.3, 0x58b8e8, 'charge');
    this.setPose('jump', 0.5);
    const hb = this.scene.addHurt(0, 0, 24, 26, 1, 2, (h) => { h.x = this.x - 12; h.y = this.y - 13; });
    yield* this.leapAt(this.player.x, -460);
    hb.t = 0;
    this.slashBox(36, 26, 0.12, 0xa8e4ff, 1.3);
    this.scene.fx.dust(this.x, this.body.bottom, 10);
    yield 0.3;
  }
  *clawCombo() { yield* this.combo(this.phase >= 2 ? 4 : 3, 0xa8e4ff); }
  *redCero() { yield* this.cero(undefined, 0.6, 0.35, 9); }
  // Sonido to the nearest wall, kick off it, and come down on the player at an angle
  *wallKick() {
    const left = Math.abs(this.x - this.arena.left) < Math.abs(this.x - this.arena.right);
    const wx = left ? this.arena.left + 10 : this.arena.right - 10;
    yield* this.blink(wx, this.arena.floor - 110);
    this.body.setAllowGravity(false); this.body.setVelocity(0, 0);
    this.facing = left ? 1 : -1;
    this.setPose('charge', 0.4);
    const p = this.player, a = Math.atan2(p.body.center.y - this.y, p.x - this.x);
    yield* this.aimLine(this.x, this.y, a, 0.35 / this.spd, 0x58b8e8);
    const hb = this.scene.addHurt(0, 0, 24, 26, 1, 1.2, (h) => { h.x = this.x - 12; h.y = this.y - 13; });
    this.setPose('dash', 1);
    Sfx.play('dash');
    let t = 0.8;
    while (t > 0 && !this.body.blocked.down) {
      t -= this.dt;
      this.body.setVelocity(Math.cos(a) * 480 * this.spd, Math.sin(a) * 480 * this.spd);
      if (Math.random() < 0.6) this.scene.fx.afterimage(this, 0x58b8e8, 0.4, 200);
      if (this.body.blocked.left || this.body.blocked.right) break;
      yield 0;
    }
    hb.t = 0;
    this.body.setAllowGravity(true);
    this.body.setVelocity(0, 0);
    yield () => this.body.blocked.down;
    this.scene.fx.dust(this.x, this.body.bottom, 10);
    yield 0.3;
  }
  // Desgarron: five claw-blades of light rake out from his fingers
  *desgarron() {
    yield* this.walkToward(110, 0.6, this.walkSpeed * 1.4);
    this.face();
    yield* this.tele(0.42, 0x58b8e8, 'windup');
    const g = this.under, f = this.facing, ox = this.x + f * 10, oy = this.y - 4;
    const base = this.aimAt(ox, oy);
    Sfx.play('wave');
    let e = 0;
    while (e < 0.36) {
      e += this.dt;
      const L = Math.min(1, e / 0.12) * 230 * (1 - Math.max(0, e - 0.24) / 0.12);
      g.clear();
      for (let i = -2; i <= 2; i++) {
        const a = base + i * 0.13, x2 = ox + Math.cos(a) * L, y2 = oy + Math.sin(a) * L;
        g.lineStyle(5, 0x58b8e8, 0.35).lineBetween(ox, oy, x2, y2);
        g.lineStyle(2, 0xe8f8ff, 1).lineBetween(ox, oy, x2, y2);
        if (e < 0.26) this.scene.beamHit(ox, oy, x2, y2, 3, 1);
      }
      yield 0;
    }
    g.clear();
    yield 0.35;
  }
  // Garra de la Pantera: a fan of needles fired from his elbows
  *garra() {
    this.face();
    yield* this.tele(0.4, 0x58b8e8, 'cast');
    const base = this.aimAt(this.x, this.y - 4);
    for (let i = 0; i < 7; i++) {
      const a = base + (i - 3) * 0.12;
      new EnemyShot(this.scene, this.x + this.facing * 8, this.y - 4, 'needle', Math.cos(a) * 340, Math.sin(a) * 340, { dmg: 1, life: 1.8, rotate: true, w: 5, h: 5, tint: 0xa8e4ff });
    }
    Sfx.play('throw');
    yield 0.5;
  }
  // Gran Rey Cero: his own blood on the palm, and a blue Cero that sweeps
  *granRey() {
    this.face();
    this.scene.fx.floatText(this.x, this.y - 34, '"Gran Rey Cero!"', '#a8e4ff');
    yield* this.cero([0x2a7ab0, 0x58b8e8, 0xe8f8ff], 0.95, 0.75, 18, this.facing * -0.35);
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) { this.phase = 2; this.setScript(this.release()); }
  }
  *release() {
    yield* this.changeForm('grimmjow_r', '"Grind, Pantera!"', { text: 'RESURRECCIÓN', color: '#58b8e8', small: 'Pantera' }, 0x58b8e8, '#a8e4ff');
    this.aura.emitting = true;
    this.spd = 1.3; this.walkSpeed = 120;
    yield* this.brain();
  }
}

// ---------------------------------------------------------------------------
// Ulquiorra Cifer: calm Cero and Sonido on the ground; released, he flies,
// throws the Lanza del Relampago, and at the last fires Cero Oscuras.
class Ulquiorra extends Duelist {
  constructor(scene, x, feet) {
    super(scene, x, feet, { id: 'ulquiorra', key: 'ulquiorra', hp: 420, drop: 35, kind: 'ulquiorra', bh: 26, auraTint: 0x3ae88a });
    this.walker = true; this.walkSpeed = 50; this.prefer = 150; this.patience = 2.6;
    this.introLine = '"Trash. Is that all the heart you have?"';
    this.lineColor = '#b8f8d0';
  }
  defaultPose() { return this.flying ? 'jump' : super.defaultPose(); }
  moveList() {
    return [
      { name: 'greenCero', w: 2.5, range: [100, 700] },
      { name: 'sonidoSlash', w: 3, range: [0, 700] },
      { name: 'balaFan', w: 2, range: [100, 600], maxPhase: 1 },
      { name: 'lanza', w: 3, phase: 2, punish: true, cd: 4 },
      { name: 'swoop', w: 2.5, phase: 2, punish: true },
      { name: 'tailWhip', w: 2, phase: 2, range: [0, 110] },
      { name: 'oscuras', w: 2, phase: 3, cd: 7 },
    ];
  }
  *closeIn() {
    if (this.flying) yield* this.flyTo(this.player.x - this.player.facing * 70, this.player.y - 60, 0.8);
    else yield* this.sonidoSlash();
  }
  *breathe(t = this.pause) {
    if (!this.flying) { yield* super.breathe(t); return; }
    // drift through the air, keeping above and a little away from the player
    let e = t / this.spd;
    while (e > 0) { e -= this.dt; this.hover(this.player.x + (this.x < this.player.x ? -110 : 110), this.player.y - 70, 160); yield 0; }
  }
  hover(tx, ty, sp) {
    const b = this.body, dx = tx - this.x, dy = Math.max(this.arena.top + 20, Math.min(this.arena.floor - 60, ty)) - this.y, d = Math.hypot(dx, dy) || 1;
    const v = Math.min(sp, d * 3);
    b.velocity.x += (dx / d * v - b.velocity.x) * Math.min(1, this.dt * 4);
    b.velocity.y += (dy / d * v - b.velocity.y) * Math.min(1, this.dt * 4);
    this.face();
  }
  *flyTo(tx, ty, maxT = 1) {
    let t = maxT;
    while (t > 0 && Math.hypot(tx - this.x, ty - this.y) > 14) { t -= this.dt; this.hover(tx, ty, 320); yield 0; }
  }
  *greenCero() { yield* this.cero([0x1a6a3a, 0x3ae88a, 0xe8fff0], 0.6, 0.45, 10); }
  *sonidoSlash() {
    if (this.flying) {
      yield* this.blink(this.player.x - this.player.facing * 40, this.player.y - 10);
      this.body.setVelocity(0, 0);
      yield* this.tele(0.28, 0x3ae88a, 'windup');
      this.slashBox(34, 30, 0.12, 0x3ae88a);
      yield 0.35;
    } else yield* this.flashStep(0x3ae88a, 0.3);
  }
  *balaFan() {
    this.face();
    yield* this.tele(0.4, 0x3ae88a, 'cast');
    const base = this.aimAt(this.x, this.y - 4);
    [-0.25, 0, 0.25].forEach(o => new EnemyShot(this.scene, this.x + this.facing * 10, this.y - 4, 'bala', Math.cos(base + o) * 240, Math.sin(base + o) * 240, { dmg: 1, life: 2.6, tint: 0x3ae88a, scale: 1.3 }));
    Sfx.play('hado');
    yield 0.5;
  }
  // Lanza del Relampago: a javelin of green light. Where it lands, everything goes.
  *lanza() {
    if (!this.flying) yield* this.flyTo(this.x, this.arena.floor - 120, 0.6);
    this.face();
    this.setPose('raise', 1.2);
    const s = this.scene;
    const spear = s.add.image(this.x, this.y - 22, 'lanza').setDepth(29).setScale(0.3);
    s.tweens.add({ targets: spear, scale: 1, duration: 500, ease: 'Back.out' });
    Sfx.play('charge');
    let e = 0;
    while (e < 0.75 / this.spd) { e += this.dt; this.body.setVelocity(0, 0); spear.setPosition(this.x, this.y - 22); yield 0; }
    // mark where it will land, then throw
    const p = this.player, tx = p.x, ty = s.arena.floor;
    const g = this.gfx;
    g.fillStyle(0x3ae88a, 0.25).fillEllipse(tx, ty - 2, 120, 14);
    const a = Math.atan2(ty - 6 - spear.y, tx - spear.x);
    spear.setRotation(a);
    Sfx.play('throw');
    const T = 0.32, sx = spear.x, sy = spear.y;
    e = 0;
    while (e < T) { e += this.dt; spear.setPosition(sx + (tx - sx) * (e / T), sy + (ty - 6 - sy) * (e / T)); yield 0; }
    spear.destroy();
    g.clear();
    s.fx.ring(tx, ty - 6, 0x3ae88a, 90, 500, 5);
    s.fx.ring(tx, ty - 6, 0xffffff, 60, 300, 2);
    s.fx.burst(tx, ty - 10, 0x3ae88a, 40);
    s.fx.flash(0x3ae88a, 220, 0.35);
    s.fx.shake(400, 0.018);
    Controls.rumble(350, 1, 0.6);
    Sfx.play('break'); Sfx.play('cero');
    s.addHurt(tx - 56, ty - 60, 112, 60, 1, 0.2);
    yield 0.5;
  }
  // a straight dive at the player, wings folded
  *swoop() {
    if (!this.flying) yield* this.flyTo(this.x, this.arena.floor - 120, 0.6);
    const p = this.player, a = Math.atan2(p.body.center.y - this.y, p.x - this.x);
    this.setPose('charge', 0.5);
    yield* this.aimLine(this.x, this.y, a, 0.4 / this.spd, 0x3ae88a);
    const hb = this.scene.addHurt(0, 0, 24, 26, 1, 1, (h) => { h.x = this.x - 12; h.y = this.y - 13; });
    this.setPose('dash', 0.8);
    Sfx.play('dash');
    let t = 0.55;
    while (t > 0) {
      t -= this.dt;
      this.body.setVelocity(Math.cos(a) * 470 * this.spd, Math.sin(a) * 470 * this.spd);
      if (Math.random() < 0.6) this.scene.fx.afterimage(this, 0x3ae88a, 0.4, 200);
      if (this.body.blocked.down || this.body.blocked.left || this.body.blocked.right) break;
      yield 0;
    }
    hb.t = 0;
    this.body.setVelocity(0, 0);
    yield* this.flyTo(this.x, this.y - 60, 0.5);
  }
  // his tail lashes out low
  *tailWhip() {
    this.face();
    yield* this.tele(0.35, 0x3ae88a, 'windup');
    const g = this.under, f = this.facing;
    let e = 0;
    Sfx.play('whip');
    while (e < 0.3) {
      e += this.dt;
      const L = Math.min(1, e / 0.1) * 110, x1 = this.x - f * 4, y1 = this.y + 8, x2 = x1 + f * L, y2 = y1 + 18;
      g.clear(); g.lineStyle(3, 0x16141c, 1).lineBetween(x1, y1, x2, y2); g.lineStyle(1, 0x3ae88a, 1).lineBetween(x1, y1, x2, y2);
      this.scene.beamHit(x1, y1, x2, y2, 5, 1);
      yield 0;
    }
    g.clear();
    yield 0.3;
  }
  *oscuras() {
    if (!this.flying) yield* this.flyTo(this.x, this.arena.floor - 140, 0.6);
    this.face();
    this.scene.fx.floatText(this.x, this.y - 30, '"Cero Oscuras."', '#b8f8d0');
    this.body.setVelocity(0, 0);
    const o = { x: this.x + this.facing * 10, y: this.y - 4 };
    const a = this.aimAt(o.x, o.y);
    this.setPose('cast', 2);
    yield* this.aimLine(o.x, o.y, a, 0.95 / this.spd, 0x3ae88a);
    yield* this.beam(o.x, o.y, a, 0.8, this.facing * 0.25, 18, 720, [0x0a0a10, 0x1a6a3a, 0x3ae88a]);
    yield 0.4;
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.6) { this.phase = 2; this.setScript(this.release()); }
    else if (this.phase === 2 && this.hp <= this.maxHp * 0.3) { this.phase = 3; this.setScript(this.segunda()); }
  }
  *release() {
    yield* this.changeForm('ulquiorra_r', '"Enclose, Murcielago."', { text: 'RESURRECCIÓN', color: '#3ae88a', small: 'Murciélago' }, 0x3ae88a, '#b8f8d0');
    this.aura.emitting = true;
    this.flying = true; this.walker = false;
    this.body.setAllowGravity(false);
    this.spd = 1.15;
    yield* this.flyTo(this.x, this.arena.floor - 120, 1);
    yield* this.brain();
  }
  *segunda() {
    this.body.setVelocity(0, 0);
    this.invulnerable = true;
    this.scene.fx.floatText(this.x, this.y - 30, '"Resurreccion: Segunda Etapa."', '#b8f8d0');
    this.scene.setDarkness(0.6);
    this.scene.fx.flash(0x0a0a10, 400, 0.6);
    yield 1.0;
    this.invulnerable = false;
    this.spd = 1.3;
    yield* this.brain();
  }
}

// ---------------------------------------------------------------------------
// Aaroniero Arruruerie, hidden in the dark of the Forest of Menos until struck
// with the Konso hilt. He fights with the stolen trident Nejibana; released
// (Gloteneria), he spits back up the Hollows he devoured.
class Aaroniero extends Duelist {
  constructor(scene, x, feet) {
    super(scene, x, feet, { id: 'espada', key: 'aaroniero', hp: 380, drop: 30, kind: 'espada', bh: 27, auraTint: 0x8a5ad8 });
    this.walkSpeed = 70; this.prefer = 110; this.patience = 3;
    this.waitsForReveal = true;
    this.revealed = false;
    this.harmless = true;
    this.setAlpha(0.1);
    this.setPose('guardIdle', 1e6);
    scene.time.addEvent({ delay: 280, loop: true, callback: () => {
      if (this.active && !this.revealed) scene.fx.motes(this.x + Phaser.Math.Between(-8, 8), this.y + Phaser.Math.Between(-12, 10), 0xb48aff, 1);
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
    s.fx.flash(0xb48aff, 220, 0.4);
    s.fx.ring(this.x, this.y, 0xb48aff, 60, 500, 3);
    s.fx.floatText(this.x, this.y - 30, '"You found me. Then I will wear your face next."', '#d8c8ff');
    this.face();
    s.startBoss();
  }
  moveList() {
    return [
      { name: 'thrust', w: 3, range: [40, 200] },
      { name: 'spin', w: 2, range: [0, 110] },
      { name: 'wave', w: 2.5, range: [80, 700], punish: true },
      { name: 'flashStep', w: 2, range: [150, 700] },
      { name: 'devour', w: 2, phase: 2, cd: 8, when() { return this.scene.countEnemies('hollow') < 3; } },
      { name: 'acidRain', w: 2.5, phase: 2, punish: true, cd: 4 },
    ];
  }
  *flashStep() { yield* super.flashStep(0xb48aff); }
  // Nejibana's long reach: a thrust that leaves a ribbon of water
  *thrust() {
    yield* this.walkToward(110, 0.6);
    this.face();
    yield* this.tele(0.38, 0x4ab4ff, 'windup');
    const f = this.facing, g = this.under;
    this.setPose('strike', 0.3);
    this.body.setVelocityX(f * 160);
    Sfx.play('whip');
    let e = 0;
    while (e < 0.25) {
      e += this.dt;
      const L = Math.min(1, e / 0.08) * 120, x1 = this.x + f * 10, y = this.y - 2, x2 = x1 + f * L;
      g.clear();
      g.lineStyle(3, 0x4ab4ff, 0.5).lineBetween(x1, y + Math.sin(e * 40) * 3, x2, y);
      g.lineStyle(2, 0xc8e8ff, 1).lineBetween(x1, y, x2, y);
      g.fillStyle(0xffffff, 1).fillTriangle(x2, y, x2 - f * 7, y - 4, x2 - f * 7, y + 4);
      this.scene.beamHit(x1, y, x2, y, 5, 1);
      yield 0;
    }
    g.clear();
    yield* this.halt();
    yield 0.35;
  }
  // a whirlpool of water around him, then a dash out of it
  *spin() {
    this.setPose('charge', 1);
    const g = this.gfx;
    let e = 0;
    Sfx.play('charge');
    while (e < 0.45 / this.spd) { e += this.dt; g.clear(); g.lineStyle(2, 0x4ab4ff, 0.3 + 0.4 * Math.abs(Math.sin(e * 20))).strokeCircle(this.x, this.y, 52); yield 0; }
    e = 0;
    Sfx.play('wave');
    while (e < 0.5) {
      e += this.dt;
      g.clear();
      for (let i = 0; i < 3; i++) g.lineStyle(3, i === 1 ? 0xc8e8ff : 0x4ab4ff, 0.8).beginPath().arc(this.x, this.y, 30 + i * 9, e * 14 + i, e * 14 + i + 3.5).strokePath();
      if (e < 0.4) { const p = this.player; if (Math.hypot(p.x - this.x, p.body.center.y - this.y) < 54) p.takeDamage(1, this.x); }
      yield 0;
    }
    g.clear();
    yield* this.dashSlash(420, 0.3, 0x4ab4ff);
  }
  // the trident into the ground: a wave of water runs along the floor
  *wave() {
    this.face();
    yield* this.tele(0.42, 0x4ab4ff, 'strike');
    const s = this.scene, f = this.facing;
    const sh = new EnemyShot(s, this.x + f * 20, this.arena.floor - 13, 'waterwave', f * 220, 0, { dmg: 1, life: 2.6, w: 18, h: 26, pierce: true, flipX: f < 0 });
    s.tweens.add({ targets: sh, scaleY: 1.4, duration: 1200 });
    Sfx.play('wave');
    yield 0.6;
  }
  *devour() {
    this.setPose('cast', 0.9);
    Sfx.play('roar');
    this.telegraph(0xb48aff);
    yield 0.6;
    this.untelegraph();
    for (const off of [-30, 30]) {
      const h = new Hollow(this.scene, this.x + off, this.y - 30);
      h.hp = h.maxHp = 6; h.mode = 'chase'; h.summoned = true;
      this.scene.fx.burst(h.x, h.y, 0x8a5ad8, 12);
    }
    yield 0.4;
  }
  // spits acid high, to fall across the clearing
  *acidRain() {
    yield* this.tele(0.4, 0x9aff6a, 'cast');
    const p = this.player;
    for (let i = 0; i < 5; i++) {
      const tx = Phaser.Math.Clamp(p.x + (i - 2) * 46, this.arena.left + 10, this.arena.right - 10);
      const T = 0.9, g = PHYS.gravity, ty = this.arena.floor - 6 - (this.y - 10);
      new EnemyShot(this.scene, this.x, this.y - 10, 'acid', (tx - this.x) / T, (ty - 0.5 * g * T * T) / T, { gravity: true, dmg: 1, life: 2.4, size: 8, tint: 0x9aff6a, burst: 0x9aff6a, splash: true });
      yield 0.08;
    }
    Sfx.play('spit');
    yield 0.6;
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) { this.phase = 2; this.setScript(this.release()); }
  }
  *release() {
    this.scene.setDarkness(0.82);
    yield* this.changeForm('aaroniero_r', '"Devour, Gloteneria."', { text: 'RESURRECCIÓN', color: '#b48aff', small: 'Glotonería' }, 0x8a5ad8, '#d8c8ff');
    this.aura.emitting = true;
    this.spd = 1.2;
    yield* this.brain();
  }
}

// ---------------------------------------------------------------------------
// The Hollow within: your own moves, turned against you. He throws his blade on
// its cloth like a boomerang, answers a heal with a rush, and in Bankai keeps
// the Getsuga coming.
class HollowIchigo extends Duelist {
  constructor(scene, x, feet) {
    super(scene, x, feet, { id: 'final', key: 'final', hp: 480, drop: 0, kind: 'final', bh: 26, auraTint: 0xc8202c });
    this.walkSpeed = 90; this.prefer = 90; this.patience = 2.4; this.pause = 0.35;
    this.spd = 1.1;
    this.introLine = '"Which one of us is the King, and which one the horse?"';
    this.lineColor = '#ffffff';
  }
  moveList() {
    return [
      { name: 'getsuga', w: 3, range: [100, 700], punish: true },
      { name: 'chainThrow', w: 2.5, range: [80, 360], punish: true, cd: 3 },
      { name: 'flashCross', w: 3 },
      { name: 'combo', w: 2.5, range: [0, 80] },
      { name: 'whiteCero', w: 2, phase: 2, range: [120, 700], cd: 3 },
      { name: 'tensaFlurry', w: 2.5, phase: 3, cd: 4, punish: true },
    ];
  }
  *brain() {
    yield 0.4;
    for (;;) {
      // a heal or a long charge in front of him is an invitation
      const p = this.player;
      if (['heal', 'charge', 'konso'].includes(p.state) && Math.abs(p.x - this.x) < 360) { yield* this.punish(); yield* this.breathe(0.3); continue; }
      if (this.sinceNear > this.patience) { this.sinceNear = 0; yield* this.closeIn(); }
      const name = this.pickMove(this.moveList());
      if (name) yield* this[name]();
      yield* this.breathe();
    }
  }
  *punish() {
    this.scene.fx.floatText(this.x, this.y - 30, '"Too slow, King."', '#ffffff');
    yield* this.dashSlash(560, 0.4, 0xffffff);
  }
  *getsuga() {
    this.face();
    yield* this.tele(0.38, 0xffffff, 'windup');
    const key = this.phase >= 3 ? 'getsuga_b' : 'getsuga_w';
    const f = this.facing, s = this.scene;
    const n = this.phase >= 3 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      this.setPose('strike', 0.25);
      new EnemyShot(s, this.x + f * 16, this.arena.floor - 22, key, f * 330, 0, { dmg: 1, life: 2.4, w: 16, h: 40, pierce: true, flipX: f < 0 });
      Sfx.play('wave');
      s.fx.ring(this.x + f * 14, this.y, 0xffffff, 26, 260, 2);
      yield 0.32 / this.spd;
    }
    yield 0.3;
  }
  // Zangetsu thrown on its cloth: out to where you stand, and back
  *chainThrow() {
    this.face();
    yield* this.tele(0.4, 0xffffff, 'windup');
    const s = this.scene, p = this.player;
    const tx = p.x, ty = p.body.center.y;
    const blade = s.add.image(this.x, this.y, 'thrownblade').setDepth(29);
    const g = this.under;
    this.setPose('cast', 1.4);
    Sfx.play('whip');
    let e = 0;
    const T = 0.45 / this.spd;
    const pos = () => {
      const k = e < T ? Phaser.Math.Easing.Quadratic.Out(e / T) : 1 - Phaser.Math.Easing.Quadratic.In((e - T) / T);
      return { x: this.x + (tx - this.x) * k, y: this.y - 4 + (ty - this.y + 4) * k - Math.sin(Math.PI * Math.min(1, e / (2 * T))) * 30 };
    };
    while (e < T * 2) {
      e += this.dt;
      const b = pos();
      blade.setPosition(b.x, b.y).setRotation(e * 22);
      g.clear(); g.lineStyle(1, 0x15141b, 1).lineBetween(this.x + this.facing * 6, this.y - 2, b.x, b.y);
      if (p.state !== 'dead' && Math.hypot(p.x - b.x, p.body.center.y - b.y) < 16) p.takeDamage(1, b.x);
      if (Math.random() < 0.4) s.fx.afterimage(blade, 0xffffff, 0.3, 120);
      yield 0;
    }
    g.clear();
    blade.destroy();
    yield 0.3;
  }
  *flashCross() {
    yield* this.flashStep(0xffffff, 0.28);
    if (this.phase >= 2) yield* this.flashStep(0xff4050, 0.22);
  }
  *whiteCero() { yield* this.cero([0xc8202c, 0xff4050, 0xffffff], 0.7, 0.5, 12); }
  // three Tensa dashes, back and forth across the arena
  *tensaFlurry() {
    for (let i = 0; i < 3; i++) {
      this.face();
      yield* this.dashSlash(620, 0.3, 0xc8202c);
    }
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.66) { this.phase = 2; this.setScript(this.wearMask()); }
    else if (this.phase === 2 && this.hp <= this.maxHp * 0.33) { this.phase = 3; this.setScript(this.bankai()); }
  }
  *wearMask() {
    this.body.setVelocity(0, 0); this.body.setAllowGravity(true);
    this.invulnerable = true;
    yield () => this.body.blocked.down;
    const s = this.scene;
    s.fx.floatText(this.x, this.y - 30, '"You keep it locked away. I wear it."', '#ffc0c0');
    yield 1.0;
    Sfx.play('mask');
    s.fx.flash(0xffffff, 200, 0.6);
    s.fx.burst(this.x, this.y - 8, 0xf4f1ea, 24);
    this.setSheet('final_m');
    this.spd = 1.2;
    this.invulnerable = false;
    yield* this.brain();
  }
  *bankai() {
    yield* this.changeForm('final_b', '"Then let us both stop holding back. Bankai."', { text: 'BANKAI', color: '#e0303c', small: 'Tensa Zangetsu' }, 0xc8202c, '#ff9090');
    this.aura.emitting = true;
    this.scene.setDarkness(0.7);
    this.spd = 1.35;
    yield* this.brain();
  }
}

// ---------------------------------------------------------------------------
class Vasto extends Boss {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'vasto', { id: 'vasto', hp: 320, dmg: 1, drop: 30, bw: 16, bh: 38, kind: 'vasto', fly: true, frame: 'float0', frameFeet: HF.FEET });
    this.telePose = 'cast';
    this.introPose = 'cast';
    this.walker = false; this.patience = 2.5;
    this.anim('float');
    this.orb = scene.add.image(x, this.y, 'cero_orb').setDepth(29).setVisible(false);
  }
  hoverY() { return this.arena.floor - 92; }
  defaultPose() { return this.body.blocked.down ? 'idle' : 'float'; }
  moveList() {
    return [
      { name: 'sonidoDive', w: 3, punish: true },
      { name: 'clawRush', w: 2.5, punish: true },
      { name: 'clawCombo', w: 2.5, range: [0, 200] },
      { name: 'ceroBurst', w: 2, range: [120, 700] },
      { name: 'ceroGrande', w: 2, phase: 2, cd: 6 },
    ];
  }
  *closeIn() { yield* this.clawCombo(); }
  // drift above the player between attacks instead of hanging still
  *breathe(t = 0.5) {
    let e = t / this.spd;
    while (e > 0) {
      e -= this.dt;
      const tx = this.player.x + (this.x < this.player.x ? -70 : 70), b = this.body;
      b.velocity.x += ((tx - this.x) * 2 - b.velocity.x) * Math.min(1, this.dt * 3);
      b.velocity.y += ((this.hoverY() - this.y) * 3 - b.velocity.y) * Math.min(1, this.dt * 3);
      this.face();
      yield 0;
    }
    this.body.setVelocity(0, 0);
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
    this.shock(this.x - 12, -1);
    this.shock(this.x + 12, 1);
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
  // up close: two rakes of the claws, then away
  *clawCombo() {
    const p = this.player;
    yield* this.blink(p.x - p.facing * 34, Math.min(p.y, this.floorY()));
    this.body.setVelocity(0, 0);
    for (let i = 0; i < 2; i++) {
      this.face();
      yield* this.tele(0.26, 0xff6060, 'rush');
      const f = this.facing;
      this.scene.addHurt(0, 0, 36, 36, 1, 0.12, (h) => { h.x = this.x + (f > 0 ? 0 : -36); h.y = this.y - 18; });
      this.scene.fx.slashArc(this.x + f * 16, this.y, f, 0xffffff, 1.4);
      Sfx.play('slash');
      yield 0.2 / this.spd;
    }
    yield 0.25;
    yield* this.blink(this.x, this.hoverY());
  }
  *ceroBurst() {
    const x = Phaser.Math.Between(this.arena.left + 60, this.arena.right - 60);
    yield* this.blink(x, this.hoverY() - 20);
    this.orb.setPosition(this.x, this.y - 4).setVisible(true).setScale(0.3);
    yield* this.tele(0.55, 0xff8aa0);
    this.orb.setVisible(false);
    const base = this.aimAt(this.x, this.y);
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
    const from = this.player.x < cx;
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
    this.orb.setVisible(false);
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
    this.orb.setVisible(false);
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

const BOSS_CLASSES = {
  fisher: GrandFisher, menos: Menos, renji: Renji, kenpachi: Kenpachi, byakuya: Byakuya,
  grimmjow: Grimmjow, vasto: Vasto, ulquiorra: Ulquiorra, espada: Aaroniero, final: HollowIchigo,
};
