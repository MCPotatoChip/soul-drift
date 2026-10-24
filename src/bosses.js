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
    // A sharper Zanpakutō (forge levels) means a tougher boss, so the upgrades do not turn fights into a formality
    this.hp = this.maxHp = Math.round(this.maxHp * GS.bossHpMul() * GS.diff().bossHp);
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
  // A new phase of the fight also raises the music and tells the HUD
  get phase() { return this._phase; }
  set phase(v) {
    const up = this._phase && v > this._phase;
    this._phase = v;
    if (up && this.scene && this.scene.bossStarted) { Music.setPhase(v); this.scene.game.events.emit('boss-phase', v); }
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
    // Never leave the room: a boss that ends up below the floor (or inside it) is set back on it
    if (this.fighting && !this.cfg.fly && this.body.bottom > this.arena.floor + 6) { this.body.reset(Phaser.Math.Clamp(this.x, this.arena.left + 8, this.arena.right - 8), this.arena.floor - this.body.height / 2); this.body.setVelocity(0, 0); }
    if (!this.fighting) { this.body.setVelocityX(0); return; }
    if (this.ai) this.ai.tick(dt * GS.diff().bossSpeed);
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
  // An aim line that follows the player, then freezes for the last `lock` seconds (the line turns solid and bright)
  // so the shot goes where the line was last seen. The band drawn is as wide as the beam that follows it.
  // Returns the locked angle: `const a = yield* this.lockOn(...)`.
  *lockOn(origin, t, color = 0xff3050, { lock = 0.22, turn = 6, width = 10, len = 720 } = {}) {
    const g = this.gfx, at = () => (typeof origin === 'function' ? origin() : origin);
    let o = at(), a = this.aimAt(o.x, o.y), e = 0;
    const total = Math.max(t, lock + 0.05);
    while (e < total) {
      e += this.dt;
      o = at();
      const locked = e >= total - lock;
      if (!locked) {
        const want = this.aimAt(o.x, o.y), diff = Phaser.Math.Angle.Wrap(want - a), step = turn * this.dt;
        a += Phaser.Math.Clamp(diff, -step, step);
      }
      const x2 = o.x + Math.cos(a) * len, y2 = o.y + Math.sin(a) * len;
      g.clear();
      g.lineStyle(width, color, locked ? 0.3 : 0.12); g.lineBetween(o.x, o.y, x2, y2);
      g.lineStyle(locked ? 2 : 1, color, locked ? 1 : 0.4 + 0.4 * Math.abs(Math.sin(e * 30))); g.lineBetween(o.x, o.y, x2, y2);
      yield 0;
    }
    g.clear();
    return a;
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
  // Run a second attack alongside the one in progress (it is a hazard: a phase change ends it too)
  aside(gen) {
    const co = new Co(gen);
    this.hazards.push({ tick(dt) { co.tick(dt); this.dead = co.done; }, destroy() { this.dead = true; } });
  }
  // A phase change cancels whatever attack was running, including its damage boxes and hazards
  setScript(gen) {
    // a blink, a feint or a shadow cut short leaves him faded and untouchable: put that right first
    this.setAlpha(1); this.invulnerable = false;
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
      case 'grimmjow': case 'ulquiorra': case 'espada': case 'nnoitra': case 'yammy': {   // the Hollow turns to ash, and the ash drifts up
        const c = { grimmjow: 0x58b8e8, ulquiorra: 0x3ae88a, espada: 0x8a5ad8, nnoitra: 0x8a7cff, yammy: 0xff8a40 }[this.id];
        fx.shatter(x, y, [0xece8f1, 0x9a96a8, c], 40, 100, -40, 1700);
        for (let i = 0; i < 3; i++) s.time.delayedCall(i * 180, () => fx.ring(x, y, c, 40 + i * 30, 500, 2));
        wisps(10, c);
        break;
      }
      case 'urahara':   // a flutter of red, and a fan snapping shut somewhere
        fx.shatter(x, y, [0xff4060, 0xffe0e4, 0x34453a], 36, 110, 70, 1500);
        fx.ring(x, y, 0xff4060, 100, 800, 3);
        wisps(8, 0xffb0c0);
        break;
      case 'vasto':   // crumbles to sand
        fx.shatter(x, y, [0xe0d8c0, 0xc8bea0, 0xffffff], 40, 120, 110, 1600);
        fx.dust(x, y, 30);
        fx.debris(x, y, 0xe0d8c0, 16);
        wisps(8);
        break;
      case 'aizen':   // Kyōka Suigetsu breaks for the last time: glass, and a violet light going out
        for (let i = 0; i < 4; i++) s.time.delayedCall(i * 200, () => fx.shatter(x, y - 4, [0xf4f0ff, 0xb048d8, 0xe0d0ff, 0x6a3c1c], 30, 120 + i * 30, 60, 1600));
        fx.ring(x, y, 0xb048d8, 140, 1000, 4);
        wisps(14, 0xe0c0ff);
        break;
      case 'yhwach':   // every eye closes at once
        fx.shatter(x, y, [0x0a0a10, 0xc8202c, 0x8ac8ff, 0xffffff], 50, 130, -30, 1900);
        for (let i = 0; i < 4; i++) s.time.delayedCall(i * 220, () => fx.ring(x, y, i % 2 ? 0xc8202c : 0x8ac8ff, 50 + i * 36, 600, 3));
        wisps(16, 0x8ac8ff);
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
    super(scene, x, feet, 'fisher', { id: 'fisher', hp: 320, dmg: 1, drop: 20, bw: 46, bh: 56, kind: 'fisher', frame: 'idle0', frameFeet: 84, burst: 0x2a1e18 });
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
    super(scene, x, feet, 'menos', { id: 'menos', hp: 340, dmg: 1, drop: 20, bw: 40, bh: 100, kind: 'menos', frame: 'idle0', frameFeet: 120 });
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
    this.orb.setPosition(m.x, m.y).setVisible(true).setScale(0.2);
    this.scene.tweens.add({ targets: this.orb, scale: 1.2, duration: 800 });
    this.setPose('cero', 1.5);
    let ang = yield* this.lockOn(m, 0.85, 0xff3050, { width: 12 });
    if (Math.cos(ang) * this.facing < 0.25) ang = this.facing > 0 ? 0.3 : Math.PI - 0.3;   // the mouth cannot point backward
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
    this.setPose('cast', aim / this.spd + dur + 0.2);
    const a = yield* this.lockOn(ox, aim / this.spd, col[1], { width });
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
    super(scene, x, feet, { id: 'renji', key: 'renji', hp: 440, drop: 25, kind: 'renji', bh: 27, auraTint: 0xff5040 });
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
    super(scene, x, feet, { id: 'byakuya', key: 'byakuya', hp: 560, drop: 25, kind: 'byakuya', bh: 26, auraTint: 0xff90b8 });
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
    this.setPose('cast', 0.9);
    const a = yield* this.lockOn(o, 0.5 / this.spd, 0xbfe6ff, { width: 5, lock: 0.16 });
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
    super(scene, x, feet, { id: 'kenpachi', key: 'kenpachi', hp: 640, drop: 35, kind: 'kenpachi', bh: 28, armor: 0.75, auraTint: 0xf2d040 });
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
    super(scene, x, feet, { id: 'grimmjow', key: 'grimmjow', hp: 600, drop: 30, kind: 'grimmjow', bh: 26, auraTint: 0x58b8e8 });
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
    const a = yield* this.lockOn(() => ({ x: this.x, y: this.y }), 0.4 / this.spd, 0x58b8e8, { width: 24, lock: 0.18, len: 420 });
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
    super(scene, x, feet, { id: 'ulquiorra', key: 'ulquiorra', hp: 680, drop: 35, kind: 'ulquiorra', bh: 26, auraTint: 0x3ae88a });
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
    const p = this.player;
    this.setPose('charge', 0.5);
    this.body.setVelocity(0, 0);
    // the line follows you, then locks: the dive goes exactly where it last pointed, and as far as you stood
    const a = yield* this.lockOn(() => ({ x: this.x, y: this.y }), 0.5 / this.spd, 0x3ae88a, { width: 24, lock: 0.2, len: 330 });
    const reach = Math.hypot(p.body.center.x - this.x, p.body.center.y - this.y);
    const hb = this.scene.addHurt(0, 0, 24, 26, 1, 1, (h) => { h.x = this.x - 12; h.y = this.y - 13; });
    this.setPose('dash', 0.8);
    Sfx.play('dash');
    let t = Phaser.Math.Clamp((reach + 40) / (470 * this.spd), 0.3, 0.75);
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
    this.setPose('cast', 2);
    const a = yield* this.lockOn(o, 0.95 / this.spd, 0x3ae88a, { width: 18, lock: 0.3 });
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
    super(scene, x, feet, { id: 'espada', key: 'aaroniero', hp: 600, drop: 30, kind: 'espada', bh: 27, auraTint: 0x8a5ad8 });
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
    super(scene, x, feet, { id: 'final', key: 'final', hp: 1700, drop: 0, kind: 'final', bh: 26, auraTint: 0xc8202c });
    this.walkSpeed = 100; this.prefer = 90; this.patience = 2.0; this.pause = 0.32;
    this.spd = 1.2;
    this.introLine = '"Which one of us is the King, and which one the horse?"';
    this.lineColor = '#ffffff';
  }
  // Four phases: the white Hollow, the masked one, Bankai, and what is left when he stops holding back.
  moveList() {
    return [
      { name: 'getsuga', w: 3, range: [100, 700], punish: true },
      { name: 'chainThrow', w: 2.5, range: [80, 360], punish: true, cd: 3 },
      { name: 'flashCross', w: 3 },
      { name: 'comboMove', w: 2.5, range: [0, 80] },
      { name: 'getsugaRain', w: 2.4, cd: 5, punish: true },
      { name: 'whiteCero', w: 2, phase: 2, range: [120, 700], cd: 3 },
      { name: 'ceroSweep', w: 2.2, phase: 2, range: [100, 700], cd: 5, punish: true },
      { name: 'mirrorStep', w: 2.4, phase: 2, cd: 3 },
      { name: 'tensaFlurry', w: 2.5, phase: 3, cd: 4, punish: true },
      { name: 'jujisho', w: 2.4, phase: 3, cd: 6, punish: true },
      { name: 'hollowNova', w: 2.6, phase: 4, cd: 5 },
      { name: 'finalStorm', w: 2.2, phase: 4, cd: 8, punish: true },
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
  *comboMove() { yield* this.combo(2 + this.phase, this.phase >= 3 ? 0xff4050 : 0xffffff); }
  *getsuga() {
    this.face();
    yield* this.tele(0.38, 0xffffff, 'windup');
    const key = this.phase >= 3 ? 'getsuga_b' : 'getsuga_w';
    const f = this.facing, s = this.scene;
    const n = this.phase >= 4 ? 3 : this.phase >= 3 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      this.setPose('strike', 0.25);
      new EnemyShot(s, this.x + f * 16, this.arena.floor - 22, key, f * (330 + 20 * i), 0, { dmg: 1, life: 2.4, w: 16, h: 40, pierce: true, flipX: f < 0 });
      Sfx.play('wave');
      s.fx.ring(this.x + f * 14, this.y, 0xffffff, 26, 260, 2);
      yield 0.32 / this.spd;
    }
    yield 0.3;
  }
  // Getsuga falling from the roof of the world in columns: the white flags show where
  *getsugaRain() {
    this.face();
    yield* this.tele(0.42, 0xffffff, 'cast');
    const s = this.scene, g = this.gfx, n = 3 + this.phase, key = this.phase >= 3 ? 'getsuga_b' : 'getsuga_w';
    const px = this.player.x, xs = [];
    for (let i = 0; i < n; i++) xs.push(Phaser.Math.Clamp(px + (i - (n - 1) / 2) * 60 + Phaser.Math.Between(-12, 12), this.arena.left + 10, this.arena.right - 10));
    let e = 0;
    const T = 0.75 / this.spd, top = this.arena.top, floor = this.arena.floor;
    while (e < T) {
      e += this.dt;
      g.clear();
      xs.forEach(x => g.fillStyle(0xffffff, 0.06 + 0.2 * Math.abs(Math.sin(e * 22))).fillRect(x - 5, top, 10, floor - top));
      yield 0;
    }
    g.clear();
    xs.forEach((x, i) => s.time.delayedCall(i * 80, () => {
      if (!this.alive) return;
      new EnemyShot(s, x, top + 6, key, 0, 430, { dmg: 1, life: 1.6, w: 14, h: 30, pierce: true, rotate: true });
      Sfx.play('wave');
    }));
    yield (n * 80) / 1000 + 0.7;
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
    // from the third phase on he throws it a second time, once you think it is over
    if (this.phase >= 3) {
      yield 0.18;
      this.face();
      const ex = this.player.x, ey = this.player.body.center.y;
      const b2 = s.add.image(this.x, this.y, 'thrownblade').setDepth(29);
      let e2 = 0;
      Sfx.play('whip');
      while (e2 < T * 2) {
        e2 += this.dt;
        const k = e2 < T ? Phaser.Math.Easing.Quadratic.Out(e2 / T) : 1 - Phaser.Math.Easing.Quadratic.In((e2 - T) / T);
        const bx = this.x + (ex - this.x) * k, by = this.y - 4 + (ey - this.y + 4) * k;
        b2.setPosition(bx, by).setRotation(e2 * 22);
        g.clear(); g.lineStyle(1, 0x15141b, 1).lineBetween(this.x + this.facing * 6, this.y - 2, bx, by);
        if (this.player.state !== 'dead' && Math.hypot(this.player.x - bx, this.player.body.center.y - by) < 16) this.player.takeDamage(1, bx);
        yield 0;
      }
      g.clear(); b2.destroy();
    }
    yield 0.3;
  }
  *flashCross() {
    yield* this.flashStep(0xffffff, 0.34);
    if (this.phase >= 2) yield* this.flashStep(0xff4050, 0.3);
    if (this.phase >= 4) yield* this.flashStep(0xffffff, 0.3);
  }
  // Two or three steps in a row from alternating sides, each ending in a cut
  *mirrorStep() {
    const n = this.phase >= 3 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const p = this.player, side = i % 2 ? 1 : -1;
      let tx = p.x + side * 46;
      if (tx < this.arena.left + 10 || tx > this.arena.right - 10) tx = p.x - side * 46;
      yield* this.blink(tx, this.floorY());
      yield* this.tele(0.3, 0xff6060);
      this.slashBox(38, 26, 0.12, 0xffffff);
      yield 0.16 / this.spd;
    }
    yield 0.3;
  }
  *whiteCero() { yield* this.cero([0xc8202c, 0xff4050, 0xffffff], 0.7, 0.5, 12); }
  // A Cero that does not stop where it was aimed: it sweeps down through the arena
  *ceroSweep() {
    this.face();
    const o = () => ({ x: this.x + this.facing * 10, y: this.y - 6 });
    const a = this.aimAt(o().x, o().y), dir = this.facing;
    const start = a - dir * 0.5, sweep = dir * (this.phase >= 4 ? 1.35 : 1.05);
    this.setPose('cast', 1.8);
    yield* this.aimLine(o().x, o().y, start, 0.65 / this.spd, 0xff4050);
    yield* this.beam(o, 0, start, 0.85, sweep, 14, 760, [0xc8202c, 0xff4050, 0xffffff]);
    yield 0.4;
  }
  // three Tensa dashes, back and forth across the arena
  *tensaFlurry() {
    const n = this.phase >= 4 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      this.face();
      yield* this.dashSlash(620, 0.3, 0xc8202c);
    }
  }
  // Getsuga Jūjishō: two crescents crossed into an X that crawls across the room. Its arms cover the floor and the air
  // above your head; the only way through is the hole where they cross, or over the top of it.
  *jujisho() {
    this.face();
    yield* this.tele(0.5, 0xff4050, 'windup');
    const s = this.scene, f = this.facing, a = this.arena, g = this.under;
    s.fx.floatText(this.x, this.y - 30, '"Getsuga... Jūjishō!"', '#ff9090');
    this.setPose('strike', 0.4);
    Sfx.play('wave'); Sfx.play('hado');
    const H = 120, cy = a.floor - 40;
    let x = this.x + f * 24, e = 0;
    while (x > a.left - 40 && x < a.right + 40 && e < 3) {
      e += this.dt;
      x += f * 210 * this.spd * this.dt;
      g.clear();
      for (const sgn of [-1, 1]) {
        const x1 = x - 26, y1 = cy - sgn * H / 2, x2 = x + 26, y2 = cy + sgn * H / 2;
        g.lineStyle(12, 0xc8202c, 0.35).lineBetween(x1, y1, x2, y2);
        g.lineStyle(5, 0x16141c, 1).lineBetween(x1, y1, x2, y2);
        g.lineStyle(2, 0xff4050, 1).lineBetween(x1, y1, x2, y2);
        // the arms hurt, the crossing (where you can slip through) does not
        s.beamHit(x1, y1, x + (x1 - x) * 0.42, cy + (y1 - cy) * 0.42, 5, 1);
        s.beamHit(x2, y2, x + (x2 - x) * 0.42, cy + (y2 - cy) * 0.42, 5, 1);
      }
      yield 0;
    }
    g.clear();
    yield 0.3;
  }
  // The air bursts: shock waves along the floor to both sides, a second one over the first's heels
  *hollowNova() {
    this.body.setVelocity(0, 0);
    this.setPose('charge', 1.2);
    this.telegraph(0xff4050);
    Sfx.play('telegraph');
    yield 0.55 / this.spd;
    this.untelegraph();
    const s = this.scene;
    for (let i = 0; i < 2; i++) {
      s.fx.ring(this.x, this.y, 0xff4050, 70, 500, 4);
      s.fx.shake(300, 0.012);
      Sfx.play('roarSmall');
      this.shock(this.x, -1, 0x1a1a22, 270, 1.3);
      this.shock(this.x, 1, 0x1a1a22, 270, 1.3);
      yield 0.55 / this.spd;
    }
    yield 0.3;
  }
  // The last thing he has: a cut, a Cero, a rain, one after another with no breath between them
  *finalStorm() {
    yield* this.flashStep(0xff4050, 0.2);
    yield* this.whiteCero();
    yield* this.getsugaRain();
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.7) { this.phase = 2; this.setScript(this.wearMask()); }
    else if (this.phase === 2 && this.hp <= this.maxHp * 0.45) { this.phase = 3; this.setScript(this.bankai()); }
    else if (this.phase === 3 && this.hp <= this.maxHp * 0.2) { this.phase = 4; this.setScript(this.noHolding()); }
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
    this.spd = 1.3; this.pause = 0.26;
    this.invulnerable = false;
    yield* this.brain();
  }
  *bankai() {
    yield* this.changeForm('final_b', '"Then let us both stop holding back. Bankai."', { text: 'BANKAI', color: '#e0303c', small: 'Tensa Zangetsu' }, 0xc8202c, '#ff9090');
    this.aura.emitting = true;
    this.scene.setDarkness(0.7);
    this.spd = 1.4; this.pause = 0.2;
    yield* this.brain();
  }
  // Under a fifth of his strength left, and no reason left to hold any of it
  *noHolding() {
    yield* this.changeForm('final_k', '"There is no King. There is no horse. There is only the blade."', { text: 'UNBOUND', color: '#ff2a3c', small: 'Hollow Ichigo, with nothing held back' }, 0xff2a3c, '#ff9090');
    this.aura.emitting = true;
    this.scene.setDarkness(0.82);
    this.spd = 1.55; this.pause = 0.15; this.noFlinch = true;
    yield* this.brain();
  }
}

// ---------------------------------------------------------------------------
// Kisuke Urahara: the shopkeeper who was once a captain. His cane is a sword, Hadō and Bakudō are tools to him,
// and he never stops talking. At half health the hat comes off: "Nake, Benihime."
class Urahara extends Duelist {
  constructor(scene, x, feet) {
    super(scene, x, feet, { id: 'urahara', key: 'urahara', hp: 640, drop: 30, kind: 'urahara', bh: 26, auraTint: 0xff5070 });
    this.walkSpeed = 80; this.prefer = 110; this.patience = 2.8; this.pause = 0.42;
    this.introLine = '"Ah. The light exercise is over. Shall we be serious?"';
    this.lineColor = '#ffe0e4';
  }
  moveList() {
    return [
      { name: 'combo', w: 2.2, range: [0, 90] },
      { name: 'flashCut', w: 3, range: [0, 600] },
      { name: 'shakkaho', w: 2.6, range: [100, 700], punish: true, cd: 3 },
      { name: 'sokatsui', w: 2, range: [140, 700], cd: 4 },
      { name: 'benihimeWave', w: 2.4, range: [80, 500], cd: 3.5, punish: true },
      { name: 'shibari', w: 1.8, range: [60, 500], cd: 8, punish: true },
      { name: 'kamisori', w: 2.4, phase: 2, range: [60, 600], cd: 5, punish: true },
      { name: 'juzutsunagi', w: 2.2, phase: 2, cd: 7 },
      { name: 'chikasumi', w: 1.6, phase: 2, cd: 11, when() { return !(this.shieldT > 0); } },
    ];
  }
  // Hadō #31: a volley of red fireballs, aimed anew each time
  *shakkaho() {
    yield* this.tele(0.35, 0xff9a60, 'cast');
    const n = this.phase >= 2 ? 4 : 3, s = this.scene;
    for (let i = 0; i < n; i++) {
      this.face();
      const o = { x: this.x + this.facing * 12, y: this.y - 8 }, a = this.aimAt(o.x, o.y);
      Sfx.play('hado');
      s.fx.ring(o.x, o.y, 0xff7a4a, 16, 200, 2);
      new EnemyShot(s, o.x, o.y, 'bala', Math.cos(a) * 300, Math.sin(a) * 300, { dmg: 1, life: 2.2, tint: 0xff7a4a, scale: 1.3, burst: 0xff7a4a });
      yield 0.4 / this.spd;
    }
    yield 0.3;
  }
  // Hadō #73: a blue cannon down the line
  *sokatsui() { yield* this.cero([0x4a8aff, 0x8ac0ff, 0xffffff], 0.75, 0.4, 10); }
  // A crimson crescent, and in the second phase three of them fanned
  *benihimeWave() {
    this.face();
    yield* this.tele(0.4, 0xff6070, 'windup');
    const f = this.facing, s = this.scene, fan = this.phase >= 2 ? [-90, 0, 90] : [0];
    this.setPose('strike', 0.3);
    Sfx.play('wave');
    s.fx.ring(this.x + f * 14, this.y, 0xff4060, 26, 260, 2);
    fan.forEach(vy => new EnemyShot(s, this.x + f * 16, this.arena.floor - 24, 'getsuga_w', f * 320, vy, { dmg: 1, life: 2.2, w: 16, h: 38, pierce: true, flipX: f < 0, tint: 0xff4a60 }));
    yield 0.6;
  }
  // Shibari Benihime: a net of red light thrown where you stand. Caught in it, you are held for a moment, and he comes for you.
  *shibari() {
    this.face();
    yield* this.tele(0.35, 0xff6070, 'cast');
    const s = this.scene, g = this.gfx, p = this.player;
    const tx = p.x, ty = p.body.center.y, ox = this.x + this.facing * 12, oy = this.y - 6;
    const T = 0.42 / this.spd;
    Sfx.play('whip');
    let e = 0;
    while (e < T) {
      e += this.dt;
      const k = e / T, x = ox + (tx - ox) * k, y = oy + (ty - oy) * k - Math.sin(Math.PI * k) * 26, r = 6 + 22 * k;
      g.clear();
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI; g.lineStyle(1, 0xff4060, 0.8).lineBetween(x + Math.cos(a) * r, y + Math.sin(a) * r, x - Math.cos(a) * r, y - Math.sin(a) * r); }
      g.lineStyle(1, 0xffb0c0, 0.7).strokeCircle(x, y, r);
      yield 0;
    }
    g.clear();
    s.fx.ring(tx, ty, 0xff4060, 30, 300, 2);
    if (Math.hypot(this.player.x - tx, this.player.body.center.y - ty) < 30 && this.player.state !== 'dead' && this.player.state !== 'dash') {
      this.player.bindStun(0.8);
      s.fx.chain(tx - 20, ty - 8, tx + 20, ty + 8); s.fx.chain(tx - 20, ty + 8, tx + 20, ty - 8);
      yield 0.2;
      yield* this.flashStep(0xff6070, 0.22);
    }
    yield 0.3;
  }
  // Kamisori Benihime: a spray of red razor crescents, fanned up from the blade
  *kamisori() {
    this.face();
    yield* this.tele(0.4, 0xff6070, 'windup');
    const s = this.scene, f = this.facing, base = this.aimAt(this.x, this.y - 4);
    this.setPose('strike', 0.3);
    Sfx.play('wave');
    for (let i = 0; i < 5; i++) {
      const a = base + (i - 2) * 0.16;
      new EnemyShot(s, this.x + f * 12, this.y - 4, 'getsuga_w', Math.cos(a) * 300, Math.sin(a) * 300, { dmg: 1, life: 1.6, w: 10, h: 18, rotate: true, tint: 0xff4a60, scale: 0.55, pierce: true });
    }
    s.fx.ring(this.x + f * 12, this.y, 0xff4060, 22, 240, 2);
    yield 0.55;
  }
  // Hiasobi Benihime Juzutsunagi: a string of red beads hung across the room, and then each one bursts, one after another
  *juzutsunagi() {
    this.setPose('raise', 1.8);
    const s = this.scene, g = this.gfx, a = this.arena, p = this.player;
    s.fx.floatText(this.x, this.y - 30, '"Hiasobi Benihime, Juzutsunagi."', '#ffb0c0');
    const y0 = Phaser.Math.Clamp(p.body.center.y, a.top + 30, a.floor - 14), dir = p.x > this.x ? 1 : -1;
    const beads = [];
    for (let x = this.x + dir * 30; x > a.left + 6 && x < a.right - 6; x += dir * 30) beads.push({ x, y: y0 + Math.sin(beads.length * 1.3) * 18 });
    Sfx.play('charge');
    let e = 0;
    const hang = 0.7 / this.spd;
    while (e < hang + beads.length * 0.09) {
      e += this.dt;
      g.clear();
      g.lineStyle(1, 0xff6070, 0.5);
      for (let i = 0; i + 1 < beads.length; i++) g.lineBetween(beads[i].x, beads[i].y, beads[i + 1].x, beads[i + 1].y);
      beads.forEach((b, i) => {
        const at = hang + i * 0.09;
        if (e < at) g.fillStyle(0xff4060, 0.55 + 0.4 * Math.abs(Math.sin(e * 18 + i))).fillCircle(b.x, b.y, 4);
        else if (!b.done) { b.done = true; s.addHurt(b.x - 16, b.y - 16, 32, 32, 1, 0.12); s.fx.burst(b.x, b.y, 0xff4060, 10); s.fx.ring(b.x, b.y, 0xffb0c0, 20, 200, 2); if (i % 2 === 0) Sfx.play('hit'); }
      });
      yield 0;
    }
    g.clear();
    yield 0.35;
  }
  // Chikasumi no Tate: a six-sided shield of blood mist. Bolts and crescents die on it; a blade gets through.
  *chikasumi() {
    this.setPose('cast', 0.5);
    Sfx.play('bakudo');
    this.shieldT = 4.5;
    this.scene.fx.floatText(this.x, this.y - 30, '"Chikasumi no Tate."', '#ffb0c0');
    yield 0.4;
  }
  blocks(dirX, o) {
    if (!(this.shieldT > 0) || !o.spell) return false;
    this.scene.fx.ring(this.x, this.y, 0xff4060, 26, 220, 2);
    Sfx.play('clang');
    return true;
  }
  afterTick(dt) {
    super.afterTick(dt);
    if (this.shieldT > 0) {
      this.shieldT -= dt;
      const g = this.under, r = 24 + Math.sin(this.clock * 6) * 1.5;
      g.clear();
      if (this.shieldT > 0) g.lineStyle(2, 0xff4060, 0.25 + 0.25 * Math.min(1, this.shieldT)).strokePoints([0, 1, 2, 3, 4, 5].map(i => ({ x: this.x + Math.cos(i * Math.PI / 3) * r, y: this.y + Math.sin(i * Math.PI / 3) * r })), true);
    }
  }
  *flashCut() {
    yield* this.flashStep(0xffd0d8, this.phase >= 2 ? 0.22 : 0.3);
    if (this.phase >= 2) yield* this.flashStep(0xff6070, 0.2);
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) { this.phase = 2; this.setScript(this.shikai()); }
  }
  *shikai() {
    yield* this.changeForm('urahara_r', '"Wail, Benihime."', { text: 'SHIKAI', color: '#ff5070', small: 'Benihime' }, 0xff4060, '#ffb0c0');
    this.aura.emitting = true;
    this.spd = 1.25; this.pause = 0.3;
    yield* this.brain();
  }
  onDie() { this.aura.destroy(); }
}

// ---------------------------------------------------------------------------
class Vasto extends Boss {
  constructor(scene, x, feet) {
    super(scene, x, feet, 'vasto', { id: 'vasto', hp: 600, dmg: 1, drop: 30, bw: 16, bh: 38, kind: 'vasto', fly: true, frame: 'float0', frameFeet: HF.FEET });
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

// ---------------------------------------------------------------------------
// Nnoitra Gilga, Quinta Espada (optional): a scythe taller than a doorway. He sweeps, sends
// crescent waves along the floor and vaults over you; released, Santa Teresa gives him four arms.
class Nnoitra extends Duelist {
  constructor(scene, x, feet) {
    super(scene, x, feet, { id: 'nnoitra', key: 'nnoitra', hp: 720, drop: 40, kind: 'nnoitra', bh: 28, scale: 1.12, auraTint: 0x8a7cff });
    this.walkSpeed = 58; this.prefer = 100; this.patience = 2.4; this.pause = 0.4; this.nearDist = 120;
    this.introLine = '"Ya want to see how a real Espada fights?"';
    this.lineColor = '#e0d8ff';
  }
  moveList() {
    return [
      { name: 'scytheSweep', w: 3, range: [0, 130] },
      { name: 'crescentWave', w: 2.5, range: [80, 520] },
      { name: 'vaultCut', w: 2, range: [60, 400], punish: true },
      { name: 'ceroSnap', w: 1.5, range: [140, 700], maxPhase: 1 },
      { name: 'fourArms', w: 3, phase: 2, range: [0, 200] },
      { name: 'sonidoPair', w: 2, phase: 2, punish: true, cd: 5 },
      { name: 'wideCero', w: 2, phase: 2, range: [120, 700], cd: 4 },
    ];
  }
  // one long sweep of the blade, a wave rolling off it
  *scytheSweep() {
    yield* this.walkToward(78, 1);
    this.face();
    yield* this.tele(0.5, 0xc8b8ff, 'windup');
    const f = this.facing;
    this.slashBox(104, 46, 0.18, 0xc8b8ff, 2.4);
    this.shock(this.x + f * 50, f, 0xc8b8ff, 240, 1.1);
    this.scene.fx.shake(180, 0.01);
    yield 0.55;
  }
  // two waves a beat apart: the first to jump, the second to jump again
  *crescentWave() {
    this.face();
    yield* this.tele(0.45, 0xc8b8ff, 'windup');
    for (let i = 0; i < 2; i++) {
      const f = this.facing;
      this.slashBox(60, 40, 0.1, 0xc8b8ff, 1.8);
      this.shock(this.x + f * 36, f, 0xc8b8ff, 300 + i * 40, 1.5);
      Sfx.play('wave');
      yield 0.42 / this.spd;
      this.face();
    }
    yield 0.25;
  }
  // over your head and down on the far side
  *vaultCut() {
    this.face();
    yield* this.tele(0.3, 0xc8b8ff, 'charge');
    this.setPose('jump', 0.6);
    yield* this.leapAt(this.player.x + this.player.facing * 40, -560);
    this.face();
    this.setPose('strike', 0.25);
    this.slashBox(90, 44, 0.14, 0xc8b8ff, 2.2);
    this.scene.fx.shake(250, 0.012);
    Sfx.play('break');
    this.shock(this.x - 20, -1, 0xc8b8ff, 260);
    this.shock(this.x + 20, 1, 0xc8b8ff, 260);
    yield 0.45;
  }
  *ceroSnap() { yield* this.cero([0x6a4ad8, 0xb8a8ff, 0xffffff], 0.6, 0.4, 10); }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) { this.phase = 2; this.setScript(this.release()); }
  }
  *release() {
    yield* this.changeForm('nnoitra_r', '"Praise... Santa Teresa."', { text: 'RESURRECCIÓN', color: '#c8b8ff', small: 'Santa Teresa' }, 0x8a6ad8, '#e0d8ff');
    this.aura.emitting = true;
    this.spd = 1.2; this.walkSpeed = 74; this.armor = 0.9;
    yield* this.brain();
  }
  // four arms, four cuts, stepping in
  *fourArms() {
    yield* this.walkToward(70, 0.7, this.walkSpeed * 1.6);
    for (let i = 0; i < 4; i++) {
      this.face();
      yield* this.tele(0.2, 0xff80d0);
      this.body.setVelocityX(this.facing * 120);
      this.slashBox(i % 2 ? 90 : 110, 40, 0.1, 0xc8b8ff, 2);
      yield 0.14;
      this.body.setVelocityX(0);
      yield 0.06 / this.spd;
    }
    yield 0.35;
  }
  *sonidoPair() {
    yield* this.flashStep(0xc8b8ff, 0.3);
    yield* this.flashStep(0xc8b8ff, 0.22);
  }
  *wideCero() { yield* this.cero([0x6a4ad8, 0xb8a8ff, 0xffffff], 0.8, 0.5, 16, this.facing * 0.2); }
}

// ---------------------------------------------------------------------------
// Yammy Llargo, Décima Espada (optional): slow, huge and never staggered. Fists, quakes and a
// great Cero; in Ira, columns of Reiatsu rise one after another where you stand.
class Yammy extends Duelist {
  constructor(scene, x, feet) {
    super(scene, x, feet, { id: 'yammy', key: 'yammy', hp: 860, drop: 45, kind: 'yammy', bh: 28, scale: 1.45, armor: 0.8, auraTint: 0xff8a40 });
    this.noFlinch = true;
    this.walkSpeed = 46; this.prefer = 70; this.patience = 2.6; this.pause = 0.55; this.nearDist = 110;
    this.introLine = '"Hah! Another bug to squash!"';
    this.lineColor = '#ffc890';
  }
  moveList() {
    return [
      { name: 'hammerFist', w: 3, range: [0, 100] },
      { name: 'quake', w: 2.5, range: [0, 400] },
      { name: 'bofetada', w: 2, range: [140, 700], punish: true },
      { name: 'bodyRush', w: 1.5, range: [100, 400], punish: true },
      { name: 'columns', w: 3, phase: 2, range: [0, 600], cd: 5 },
      { name: 'tantrum', w: 2, phase: 2, range: [0, 200], cd: 7 },
    ];
  }
  *hammerFist() {
    yield* this.walkToward(60, 1);
    this.face();
    yield* this.tele(0.6, 0xffa060, 'windup');
    const f = this.facing;
    this.slashBox(86, 64, 0.2, 0xffa060, 2.6);
    this.shock(this.x + f * 50, f, 0xffa060, 230, 1.5);
    this.scene.fx.shake(220, 0.014);
    yield 0.6;
  }
  // the floor bucks both ways
  *quake() {
    this.face();
    yield* this.tele(0.55, 0xffa060, 'charge');
    this.setPose('strike', 0.4);
    this.scene.addHurt(this.x - 60, this.y - 10, 120, 40, 1, 0.16);
    this.scene.fx.shake(380, 0.02);
    Controls.rumble(300, 0.9, 0.6);
    Sfx.play('break');
    this.shock(this.x - 30, -1, 0xffa060, 260, 1.7);
    this.shock(this.x + 30, 1, 0xffa060, 260, 1.7);
    yield 0.6;
  }
  // Cero Bofetada: a huge, slow beam
  *bofetada() { yield* this.cero([0xc85a20, 0xff9a50, 0xfff0d8], 1, 0.7, 26); }
  *bodyRush() {
    this.face();
    yield* this.tele(0.5, 0xffa060, 'charge');
    yield* this.dashSlash(300, 0.5, 0xffa060);
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) { this.phase = 2; this.setScript(this.ira()); }
  }
  *ira() {
    yield* this.changeForm('yammy_r', '"Rage... Ira!"', { text: 'IRA', color: '#ff8a40', small: 'Rage' }, 0xff8a40, '#ffc890');
    this.aura.emitting = true;
    this.spd = 1.2; this.walkSpeed = 60; this.armor = 0.85;
    yield* this.brain();
  }
  // columns of Reiatsu where you stood a moment ago, three in a row
  *columns() {
    this.setPose('charge', 1.4);
    Sfx.play('charge');
    for (let i = 0; i < 3; i++) {
      const x = this.player.x + (i === 0 ? 0 : (i % 2 ? 1 : -1) * 60 * i);
      yield* this.pillar(Phaser.Math.Clamp(x, this.arena.left + 30, this.arena.right - 30), 52, 150, 0.55 / this.spd, 0xff8a40, 0.28);
      this.scene.fx.shake(200, 0.012);
      Sfx.play('break');
    }
    yield 0.4;
  }
  // three fists in a row, each with a wave
  *tantrum() {
    yield* this.walkToward(60, 0.6, this.walkSpeed * 1.8);
    for (let i = 0; i < 3; i++) {
      this.face();
      yield* this.tele(0.3, 0xff6030, 'windup');
      const f = this.facing;
      this.slashBox(90, 66, 0.14, 0xffa060, 2.6);
      this.shock(this.x + f * 50, f, 0xffa060, 260, 1.4);
      this.scene.fx.shake(180, 0.012);
      yield 0.22 / this.spd;
    }
    yield 0.4;
  }
}

// ---------------------------------------------------------------------------
// An Aizen that is not there: Kyōka Suigetsu's illusion. It casts no shadow, cannot hurt you, and breaks like
// glass at a touch of the blade.
class AizenIllusion extends Enemy {
  constructor(boss, x, feet, pose = 'idle') {
    super(boss.scene, x, feet, boss.sheet, { hp: 1, dmg: 0, drop: 0, bw: 12, bh: 26, kind: 'illusion', frame: 'idle0', frameFeet: HF.FEET });
    this.boss = boss; this.harmless = true; this.summoned = true;
    this.body.setAllowGravity(false);
    this.facing = boss.facing;
    this.anim(pose);
  }
  get contactDamage() { return 0; }
  think() { this.body.setVelocity(this.dashV || 0, 0); }
  // glass breaks, and gives nothing back: no Reiatsu, no strike toward Bankai
  hit() { if (this.alive) this.die(); return 'none'; }
  die() {
    if (!this.alive) return;
    this.alive = false;
    this.body.enable = false;
    const s = this.scene;
    s.fx.shatter(this.x, this.y, [0xf4f0ff, 0xe0d0ff, 0xb048d8], 22, 90, 40, 900);
    Sfx.play('clang');
    this.destroy();
  }
}

// ---------------------------------------------------------------------------
// Sōsuke Aizen, at the end of the story, in the false Karakura. Kyōka Suigetsu shows you an Aizen who is not there
// (the real one always casts a shadow), Hadō #90 closes a black coffin around you, and one raised finger stops any
// blade (Kidō and Getsuga still reach him). At 60% the Hōgyoku takes him: Senjū Kōten Taihō, two coffins at once.
// At 30% six wings, and the air.
class Aizen extends Duelist {
  constructor(scene, x, feet) {
    super(scene, x, feet, { id: 'aizen', key: 'aizen', hp: 1500, drop: 0, kind: 'aizen', bh: 26, auraTint: 0xb048d8 });
    this.walkSpeed = 72; this.prefer = 120; this.patience = 2.6; this.pause = 0.4; this.spd = 1.1;
    this.introLine = '"Since when were you under the impression that you were looking at me?"';
    this.lineColor = '#e0d0ff';
    this.shade = scene.add.graphics().setDepth(14);
  }
  defaultPose() { return this.flying ? 'jump' : super.defaultPose(); }
  moveList() {
    return [
      { name: 'feint', w: 3, range: [0, 520] },
      { name: 'combo', w: 2, range: [0, 80], maxPhase: 2 },
      { name: 'mirror', w: 2.2, cd: 10, punish: true, maxPhase: 2 },
      { name: 'kurohitsugi', w: 2.4, cd: 5, punish: true },
      { name: 'oneFinger', w: 2, range: [0, 160], cd: 7, maxPhase: 2 },
      { name: 'senju', w: 2.6, phase: 2, cd: 5, punish: true },
      { name: 'feathers', w: 3, phase: 3, range: [60, 700] },
      { name: 'descend', w: 2.5, phase: 3, punish: true, cd: 3 },
    ];
  }
  // The shadow on the floor under the real one: the tell that tells Kyōka Suigetsu's images apart
  afterTick(dt) {
    super.afterTick(dt);
    const g = this.shade;
    g.clear();
    if (this.alive && this.alpha > 0.5 && this.arena) {
      const h = Math.max(0, this.arena.floor - this.body.bottom), w = Math.max(6, 20 - h * 0.08);
      g.fillStyle(0x07070b, Math.max(0.15, 0.5 - h * 0.002)).fillEllipse(this.x, this.arena.floor - 1, w, 4);
    }
  }
  // flying (the last form): drift above and beside the player between moves
  *closeIn() {
    if (this.flying) yield* this.flyTo(this.player.x - this.player.facing * 70, this.player.y - 60, 0.8);
    else yield* this.feint();
  }
  *breathe(t = this.pause) {
    if (!this.flying) { yield* super.breathe(t); return; }
    let e = t / this.spd;
    while (e > 0) { e -= this.dt; this.hover(this.player.x + (this.x < this.player.x ? -120 : 120), this.player.y - 80, 170); yield 0; }
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
    while (t > 0 && Math.hypot(tx - this.x, ty - this.y) > 14) { t -= this.dt; this.hover(tx, ty, 340); yield 0; }
  }
  illusions() { return this.scene.enemies.filter(e => e instanceof AizenIllusion && e.alive); }
  clearIllusions() { this.illusions().forEach(e => e.die()); }
  cleanup() { super.cleanup(); this.chanting = false; this.guarding = false; if (this.scene) this.clearIllusions(); }

  // Kyōka Suigetsu: an Aizen runs at you from the front (no shadow: he is not there), and the real one cuts from behind
  *feint() {
    const s = this.scene, p = this.player, a = this.arena;
    const fx = Phaser.Math.Clamp(p.x + p.facing * 150, a.left + 16, a.right - 16);
    const ill = new AizenIllusion(this, fx, this.flying ? p.body.bottom : a.floor, 'windup');
    ill.facing = Math.sign(p.x - fx) || -p.facing;
    if (this.flying) ill.body.reset(fx, p.y);
    s.fx.afterimage(ill, 0xe0d0ff, 0.4, 200);
    // the real one fades out where he stood
    this.setAlpha(0.1); this.invulnerable = true;
    Sfx.play('dash');
    yield 0.42 / this.spd;
    ill.anim('dash'); ill.dashV = ill.facing * 420;
    let t = 0.32;
    while (t > 0 && ill.alive) { t -= this.dt; if (Math.random() < 0.6) s.fx.afterimage(ill, 0xe0d0ff, 0.35, 160); yield 0; }
    if (ill.alive) ill.die();
    // and the cut comes from the other side
    let tx = p.x - p.facing * 40;
    if (tx < a.left + 10 || tx > a.right - 10) tx = p.x + p.facing * 40;
    this.setAlpha(1); this.invulnerable = false;
    yield* this.blink(tx, this.flying ? p.y : this.floorY());
    if (this.flying) this.body.setVelocity(0, 0);
    yield* this.tele(0.26, 0xe0d0ff);
    this.slashBox(40, 28, 0.12, 0xe0d0ff, 1.3);
    yield 0.4 / this.spd;
  }
  // Complete hypnosis: four of him stand in a row, all chanting. Only one casts a shadow. Strike him before the
  // incantation ends, or the full Hadō #90 falls on you.
  *mirror() {
    const s = this.scene, a = this.arena, span = a.right - a.left;
    const xs = Phaser.Utils.Array.Shuffle([0.14, 0.38, 0.62, 0.86].map(k => a.left + span * k));
    yield* this.blink(xs[0], this.floorY());
    this.face();
    s.fx.floatText(this.x, this.y - 32, '"Shatter, Kyōka Suigetsu."', '#e0d0ff');
    xs.slice(1).forEach(x => { const ill = new AizenIllusion(this, x, a.floor, 'cast'); ill.faceTo(this.player.x); s.fx.afterimage(ill, 0xe0d0ff, 0.5, 300); });
    this.setPose('cast', 3);
    this.chanting = true; this.mirrorHit = false;
    Sfx.play('charge');
    const g = this.gfx, T = 2.4 / this.spd;
    let e = 0;
    while (e < T && !this.mirrorHit) {
      e += this.dt;
      g.clear();
      for (const o of [this].concat(this.illusions())) g.lineStyle(1, 0xb048d8, 0.3 + 0.5 * (e / T)).strokeCircle(o.x, o.y, 30 - 18 * (e / T));
      yield 0;
    }
    g.clear();
    this.chanting = false;
    this.clearIllusions();
    if (this.mirrorHit) {
      s.fx.floatText(this.x, this.y - 30, '"...Well seen."', '#e0d0ff');
      this.setPose('hurt', 0.7);
      yield 0.7;
      return;
    }
    yield* this.kurohitsugi(true);
  }
  // Hadō #90 Kurohitsugi: a black box follows you, then holds still; its walls rise and the lid comes down. Be out of
  // it before it seals (over the walls while they are low, or out through the side). In full incantation, it is larger
  // and costs two masks.
  *kurohitsugi(full = false, second = false) {
    const s = this.scene, g = second ? this.under : this.gfx, a = this.arena;
    if (!second) {
      this.setPose('cast', 1.6);
      s.fx.floatText(this.x, this.y - 30, full ? '"Seep forth, the crest of turbidity... Hadō #90."' : '"Hadō #90. Kurohitsugi."', '#e0d0ff');
    }
    const W = full ? 100 : 76, H = full ? 96 : 78, floor = a.floor;
    let cx = Phaser.Math.Clamp(this.player.x + (second ? this.player.facing * 90 : 0), a.left + W / 2, a.right - W / 2), e = 0;
    const follow = (second ? 0.35 : 0.6) / this.spd, close = 0.55 / this.spd;
    Sfx.play('bakudo');
    if (this.phase >= 2 && !second && !full) s.time.delayedCall(250, () => { if (this.alive && this.phase >= 2) this.aside(this.kurohitsugi(false, true)); });
    while (e < follow) {
      e += this.dt;
      if (!second) cx = Phaser.Math.Clamp(cx + (this.player.x - cx) * Math.min(1, this.dt * 7), a.left + W / 2, a.right - W / 2);
      g.clear();
      g.lineStyle(1, 0x16141c, 0.5 + 0.4 * Math.abs(Math.sin(e * 20))).strokeRect(cx - W / 2, floor - H, W, H);
      g.lineStyle(1, 0xb048d8, 0.6).strokeRect(cx - W / 2 + 2, floor - H + 2, W - 4, H - 4);
      yield 0;
    }
    e = 0;
    const p = this.player;
    while (e < close) {
      e += this.dt;
      const k = e / close, wh = H * k, lid = (H - 10) * k;
      g.clear();
      g.lineStyle(1, 0xb048d8, 0.7).strokeRect(cx - W / 2, floor - H, W, H);
      g.fillStyle(0x0a0a10, 0.92).fillRect(cx - W / 2, floor - wh, 7, wh).fillRect(cx + W / 2 - 7, floor - wh, 7, wh).fillRect(cx - W / 2, floor - H, W, Math.max(2, lid * 0.25));
      // the rising walls hurt: you leave over them or not at all
      const pr = bodyRect(p.body);
      for (const wx of [cx - W / 2, cx + W / 2 - 7]) if (wh > 6 && Phaser.Geom.Intersects.RectangleToRectangle(pr, new Phaser.Geom.Rectangle(wx, floor - wh, 7, wh))) p.takeDamage(1, cx);
      yield 0;
    }
    // sealed: spears of black through the box
    g.clear();
    g.fillStyle(0x0a0a10, 0.95).fillRect(cx - W / 2, floor - H, W, H);
    s.addHurt(cx - W / 2 + 4, floor - H + 4, W - 8, H - 4, full ? 2 : 1, 0.14);
    s.fx.shake(300, 0.012);
    Sfx.play('break'); Sfx.play('slash');
    for (let i = 0; i < 6; i++) s.fx.impact(cx + Phaser.Math.Between(-W / 3, W / 3), floor - Phaser.Math.Between(10, H - 10), i % 2 ? 1 : -1, 0x16141c, 6, 30);
    if (!second) yield 0.18;
    g.clear();
    s.fx.burst(cx, floor - H / 2, 0x16141c, 26);
    s.fx.ring(cx, floor - H / 2, 0xb048d8, W * 0.7, 400, 2);
    yield 0.35;
  }
  // One finger. Strike him while it is raised and the blade stops dead, and he cuts you back the same instant.
  // Kidō and the Getsuga still reach him. Left alone, it ends in a push of force (Hadō #1, Shō).
  *oneFinger() {
    this.face();
    const s = this.scene;
    this.body.setVelocity(0, 0);
    this.setPose('guardIdle', 1.8);
    if (!this.fingerSaid) { this.fingerSaid = true; s.fx.floatText(this.x, this.y - 30, '"One finger will do."', '#e0d0ff'); }
    s.fx.ring(this.x + this.facing * 10, this.y - 10, 0xffffff, 10, 300, 2);
    this.guarding = true; this.countered = false;
    let t = 1.6 / this.spd;
    while (t > 0 && !this.countered) {
      t -= this.dt;
      if (Math.random() < 0.3) s.fx.motes(this.x + this.facing * 10, this.y - 10, 0xffffff, 1);
      yield 0;
    }
    this.guarding = false;
    if (this.countered) {
      yield 0.06;
      this.face();
      this.slashBox(44, 30, 0.12, 0xe0d0ff, 1.4);
      yield 0.45 / this.spd;
      return;
    }
    s.fx.ring(this.x, this.y, 0xe0d0ff, 50, 300, 3);
    s.addHurt(this.x - 46, this.y - 30, 92, 46, 1, 0.12);
    Sfx.play('wave');
    yield 0.4;
  }
  blocks(dirX, o) {
    if (!this.guarding || o.spell) return false;
    this.countered = true;
    this.scene.fx.spark(this.x + this.facing * 10, this.y - 8, 0xffffff, 10);
    Sfx.play('clang');
    this.scene.hitStop(0.08);
    return true;
  }
  hit(dmg, dirX, o = {}) {
    const r = super.hit(dmg, dirX, o);
    if (r === 'hit' && this.chanting) this.mirrorHit = true;
    return r;
  }
  // Hadō #91 Senjū Kōten Taihō: a crown of lights hangs over the room; each one, in turn, fires at where you stand
  *senju() {
    const s = this.scene, a = this.arena, g = this.gfx, n = 7 + this.phase;
    this.setPose('raise', 2);
    s.fx.floatText(this.x, this.y - 30, '"Hadō #91. Senjū Kōten Taihō."', '#e0d0ff');
    const pts = [];
    for (let i = 0; i < n; i++) pts.push({ x: a.left + (i + 0.5) * (a.right - a.left) / n, y: a.top + 12 + Math.sin(i * 1.7) * 10 });
    Sfx.play('charge');
    let e = 0;
    const lead = 0.6 / this.spd, gap = 0.13 / this.spd;
    while (e < lead + n * gap + 0.05) {
      e += this.dt;
      g.clear();
      pts.forEach((pt, i) => {
        const at = lead + i * gap;
        if (e < at) g.fillStyle(0xe0d0ff, 0.4 + 0.5 * Math.abs(Math.sin(e * 16 + i))).fillCircle(pt.x, pt.y, 3 + 2 * Math.min(1, e / lead));
        else if (!pt.done) {
          pt.done = true;
          const p = this.player, ang = Math.atan2(p.body.center.y - pt.y, p.x - pt.x);
          new EnemyShot(s, pt.x, pt.y, 'needle', Math.cos(ang) * 400, Math.sin(ang) * 400, { dmg: 1, life: 1.6, rotate: true, w: 6, h: 6, tint: 0xe0d0ff, scale: 1.8, pierce: true });
          s.fx.ring(pt.x, pt.y, 0xe0d0ff, 12, 200, 1);
          Sfx.play('zap');
        }
      });
      yield 0;
    }
    g.clear();
    yield 0.4;
  }
  // Six wings, six feathers of light, one after another
  *feathers() {
    this.face();
    if (this.flying) this.body.setVelocity(0, 0);
    yield* this.tele(0.35, 0xb048d8, 'cast');
    for (let i = 0; i < 6; i++) {
      const ox = this.x - this.facing * 10 + (i % 2 ? 8 : -8), oy = this.y - 10 + (i - 2.5) * 5;
      const a = this.aimAt(ox, oy) + (i - 2.5) * 0.06;
      new EnemyShot(this.scene, ox, oy, 'needle', Math.cos(a) * 330, Math.sin(a) * 330, { dmg: 1, life: 2, rotate: true, w: 5, h: 5, tint: 0xf4f0ff, scale: 1.5 });
      Sfx.play('throw');
      yield 0.1 / this.spd;
    }
    yield 0.4;
  }
  // From high above, straight down on where you stand, wings folded: the floor takes the blow and throws it both ways
  *descend() {
    const a = this.arena, p = this.player;
    yield* this.blink(p.x, a.top + 30);
    this.body.setVelocity(0, 0);
    const g = this.gfx, x = this.x;
    let e = 0;
    while (e < 0.5 / this.spd) { e += this.dt; this.body.setVelocity(0, 0); g.clear(); g.fillStyle(0xb048d8, 0.12 + 0.18 * Math.abs(Math.sin(e * 20))).fillRect(x - 12, this.y, 24, a.floor - this.y); yield 0; }
    g.clear();
    this.setPose('dash', 1);
    const hb = this.scene.addHurt(0, 0, 22, 30, 1, 2, (h) => { h.x = this.x - 11; h.y = this.y - 15; });
    this.body.setVelocity(0, 700);
    Sfx.play('dash');
    yield () => this.y > a.floor - 30 || this.body.blocked.down;
    hb.t = 0;
    this.body.setVelocity(0, 0);
    this.scene.fx.shake(260, 0.012);
    Sfx.play('break');
    this.shock(this.x - 12, -1, 0xe0d0ff, 280, 1.2);
    this.shock(this.x + 12, 1, 0xe0d0ff, 280, 1.2);
    yield 0.35 / this.spd;
    yield* this.flyTo(this.x, a.floor - 120, 0.5);
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.6) { this.phase = 2; this.setScript(this.hogyoku()); }
    else if (this.phase === 2 && this.hp <= this.maxHp * 0.3) { this.phase = 3; this.setScript(this.ascend()); }
  }
  *hogyoku() {
    yield* this.changeForm('aizen_h', '"The Hōgyoku has chosen me. I have gone beyond Shinigami and Hollow both."', { text: 'HŌGYOKU', color: '#b048d8', small: 'the chrysalis breaks' }, 0xb048d8, '#e0c0ff');
    this.aura.emitting = true;
    this.spd = 1.22; this.pause = 0.32;
    yield* this.brain();
  }
  *ascend() {
    yield* this.changeForm('aizen_w', '"Then I will stand in the heavens alone."', { text: 'TRANSCENDENCE', color: '#ff3a60', small: 'six wings' }, 0xb048d8, '#e0c0ff');
    this.aura.setParticleTint(0xff3a60);
    this.flying = true; this.walker = false;
    this.body.setAllowGravity(false);
    this.scene.setDarkness(0.4);
    this.spd = 1.32; this.pause = 0.26;
    yield* this.flyTo(this.x, this.arena.floor - 120, 1);
    yield* this.brain();
  }
  onDie() { super.onDie(); this.shade.destroy(); }
}

// ---------------------------------------------------------------------------
// Yhwach, the father of the Quincy: found only at the end of the Grand Trial, at the Soul King's throne. A broad sword
// of reishi, Heilig Pfeil (a fan of arrows, then a wall of them with one gap), Schatten (he sinks into a shadow and
// rises out of the one under you). At 65%, Auswählen: rays of light that take back power (a ray that finds you drains
// your Reiatsu and ends Bankai and the mask), and Blut Vene, veins of blue that turn a blade aside (Kidō pierces it).
// At 35%, the Almighty: he sees where you are going, and strikes there.
class Yhwach extends Duelist {
  constructor(scene, x, feet) {
    super(scene, x, feet, { id: 'yhwach', key: 'yhwach', hp: 1650, drop: 0, kind: 'yhwach', bh: 28, scale: 1.08, auraTint: 0x8ac8ff });
    this.walkSpeed = 66; this.prefer = 90; this.patience = 2.4; this.pause = 0.42; this.spd = 1.15;
    this.introLine = '"I have seen how this ends, my son. Kneel."';
    this.lineColor = '#cfe4ff';
    this.vene = 0;
  }
  moveList() {
    return [
      { name: 'broadCuts', w: 3.4, range: [0, 120] },
      { name: 'heiligPfeil', w: 2.2, range: [120, 700], cd: 4 },
      { name: 'arrowWall', w: 1.8, cd: 7, punish: true },
      { name: 'schatten', w: 2, range: [120, 700], cd: 4.5 },
      { name: 'auswahlen', w: 2.8, phase: 2, cd: 7, punish: true },
      { name: 'bluteVene', w: 1.8, phase: 2, cd: 12, when() { return this.vene <= 0; } },
      { name: 'almightyCut', w: 3, phase: 3, cd: 2.2 },
      { name: 'eyes', w: 2.6, phase: 3, cd: 6, punish: true },
    ];
  }
  // Where the player will be: the Almighty reads the next fraction of a second (only once he has it)
  future(t = 0.35) {
    const p = this.player, k = this.phase >= 3 ? t : 0;
    return { x: Phaser.Math.Clamp(p.x + p.body.velocity.x * k, this.arena.left + 12, this.arena.right - 12), y: p.body.center.y + Math.min(0, p.body.velocity.y) * k * 0.5 };
  }
  afterTick(dt) {
    super.afterTick(dt);
    if (this.vene > 0) {
      this.vene -= dt;
      if (Math.random() < dt * 20) this.scene.fx.motes(this.x + Phaser.Math.Between(-8, 8), this.y + Phaser.Math.Between(-14, 12), 0x8ac8ff, 1);
      if (this.vene <= 0) { this.armor = 1; this.untelegraph(); }
    }
  }
  // Heavy cuts of the broad sword (two, three once he starts taking back), the last throwing a blue wave along the
  // floor; then he stands a moment with the blade down, open
  *broadCuts() {
    yield* this.walkToward(56, 0.8, this.walkSpeed * 1.5);
    const n = this.phase >= 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const at = this.future(0.25);
      this.faceTo(at.x);
      yield* this.tele(i ? 0.32 : 0.48, 0x8ac8ff, 'windup');
      this.body.setVelocityX(this.facing * 60);
      this.slashBox(50, 36, 0.14, 0xbfe0ff, 1.9);
      if (i === n - 1 && this.phase >= 2) this.shock(this.x + this.facing * 30, this.facing, 0x8ac8ff, 280, 1.2);
      yield 0.16;
      this.body.setVelocityX(0);
      yield 0.12 / this.spd;
    }
    this.setPose('land', 0.6);
    yield 0.6;
  }
  // Heilig Pfeil: a bow of light, and five arrows fanned at you (at where you are going, once he is the Almighty)
  *heiligPfeil() {
    this.face();
    this.setPose('cast', 0.8);
    const s = this.scene, g = this.gfx, ox = this.x + this.facing * 12, oy = this.y - 6;
    let e = 0;
    Sfx.play('charge');
    while (e < 0.45 / this.spd) { e += this.dt; g.clear(); g.lineStyle(2, 0x8ac8ff, 0.8).beginPath().arc(ox, oy, 12, -1.2 + (this.facing < 0 ? Math.PI : 0), 1.2 + (this.facing < 0 ? Math.PI : 0)).strokePath(); yield 0; }
    g.clear();
    const at = this.future(0.3), base = Math.atan2(at.y - oy, at.x - ox), n = this.phase >= 2 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.1;
      new EnemyShot(s, ox, oy, 'needle', Math.cos(a) * 400, Math.sin(a) * 400, { dmg: 1, life: 1.8, rotate: true, w: 5, h: 5, tint: 0x8ac8ff, scale: 1.6 });
    }
    Sfx.play('zap');
    yield 0.45;
  }
  // A wall of arrows rises at the far end of the room and crosses all of it. Either it leaves the floor clear (stay
  // down) or it only covers the floor and the air just above it (jump it): the points of light show which.
  *arrowWall() {
    const s = this.scene, a = this.arena, g = this.gfx, waves = this.phase >= 2 ? 2 : 1;
    this.setPose('raise', 1.5);
    for (let wv = 0; wv < waves; wv++) {
      const fromLeft = this.player.x > (a.left + a.right) / 2, x0 = fromLeft ? a.left + 8 : a.right - 8, dir = fromLeft ? 1 : -1;
      const step = 18, low = Math.random() < 0.5;
      const ys = [];
      for (let r = 0; r < 7; r++) if (low ? r >= 2 : r <= 3) ys.push(a.floor - 10 - r * step);
      let e = 0;
      const T = 0.8 / this.spd;
      Sfx.play('telegraph');
      while (e < T) { e += this.dt; g.clear(); ys.forEach(y => g.fillStyle(0x8ac8ff, 0.3 + 0.6 * (e / T)).fillRect(x0 - 4, y - 1, 8, 2)); yield 0; }
      g.clear();
      ys.forEach(y => new EnemyShot(s, x0, y, 'needle', dir * 360, 0, { dmg: 1, life: 2.6, rotate: true, w: 8, h: 4, tint: 0xbfe0ff, scale: 1.6, passWalls: true }));
      Sfx.play('zap');
      yield 0.55 / this.spd;
    }
    yield 0.3;
  }
  // Schatten: he sinks into his shadow; a pool spreads under you, and he rises out of it with the sword
  *schatten() {
    const s = this.scene, a = this.arena, g = this.gfx;
    s.fx.burst(this.x, this.body.bottom - 4, 0x0a0a10, 16);
    this.setAlpha(0); this.invulnerable = true;
    Sfx.play('dash');
    let px = this.player.x, e = 0;
    const T = 0.65 / this.spd;
    while (e < T) {
      e += this.dt;
      if (e < T * 0.6) px += (this.player.x - px) * Math.min(1, this.dt * 6);
      g.clear(); g.fillStyle(0x0a0a10, 0.4 + 0.4 * (e / T)).fillEllipse(px, a.floor - 2, 20 + 40 * (e / T), 8);
      yield 0;
    }
    g.clear();
    this.body.reset(Phaser.Math.Clamp(px, a.left + 10, a.right - 10), this.floorY());
    this.setAlpha(1); this.invulnerable = false;
    this.face();
    this.setPose('strike', 0.3);
    s.addHurt(this.x - 20, a.floor - 70, 40, 70, 1, 0.16);
    s.fx.burst(this.x, a.floor - 4, 0x0a0a10, 20);
    s.fx.slashArc(this.x, this.y - 10, this.facing, 0x8ac8ff, 1.6);
    Sfx.play('slash');
    yield 0.45;
  }
  // Auswählen: thin rays of light fall from the sky, and whatever they touch is taken back. A ray that finds you costs a
  // mask, drains your Reiatsu, and ends Bankai and the mask.
  *auswahlen() {
    const s = this.scene, a = this.arena, g = this.gfx, p = this.player;
    this.setPose('raise', 2.4);
    if (!this.ausSaid) { this.ausSaid = true; s.fx.floatText(this.x, this.y - 34, '"Auswählen. I take back what I gave."', '#cfe4ff'); }
    for (let wv = 0; wv < 2; wv++) {
      const xs = [];
      const at = this.future(0.5).x;
      xs.push(at);
      for (let i = 1; i <= 3; i++) for (const sg of [-1, 1]) xs.push(at + sg * i * (wv ? 58 : 76));
      const cols = xs.filter(x => x > a.left + 8 && x < a.right - 8);
      let e = 0;
      const T = 0.85 / this.spd;
      Sfx.play('charge');
      while (e < T) { e += this.dt; g.clear(); cols.forEach(x => { g.lineStyle(1, 0xcfe4ff, 0.25 + 0.5 * (e / T)).lineBetween(x, a.top, x, a.floor); }); yield 0; }
      g.clear();
      Sfx.play('zap');
      cols.forEach(x => {
        s.fx.ring(x, a.floor - 6, 0xcfe4ff, 16, 260, 2);
        const img = s.add.rectangle(x, (a.top + a.floor) / 2, 12, a.floor - a.top, 0xe8f4ff, 0.8).setDepth(17).setBlendMode('ADD');
        s.tweens.add({ targets: img, alpha: 0, scaleX: 0.2, duration: 380, onComplete: () => img.destroy() });
        const pr = bodyRect(p.body);
        if (p.state !== 'dead' && pr.right > x - 7 && pr.left < x + 7 && p.takeDamage(1, x)) this.takeBack();
      });
      yield 0.5 / this.spd;
    }
    yield 0.3;
  }
  takeBack() {
    const s = this.scene, run = GS.run;
    GS.addReiatsu(-33);
    const had = run.bankaiT > 0 || run.maskOn;
    if (run.bankaiT > 0) { run.bankaiT = 0; run.bankaiCD = this.player.bankaiCooldown(); }
    if (run.maskOn) { run.maskOn = false; run.maskLock = 6; }
    s.fx.motes(this.player.x, this.player.y, 0xcfe4ff, 16);
    s.toast(had ? 'Auswählen tears your power away.' : 'Auswählen drains your Reiatsu.');
  }
  // Blut Vene: blue veins across his skin. A blade glances off (a quarter gets through); Kidō and the Getsuga do not.
  *bluteVene() {
    this.setPose('charge', 0.7);
    this.telegraph(0x8ac8ff);
    Sfx.play('bakudo');
    this.scene.fx.ring(this.x, this.y, 0x8ac8ff, 34, 400, 3);
    this.vene = 5;
    yield 0.5;
  }
  hit(dmg, dirX, o = {}) {
    if (this.vene > 0 && !o.spell) { dmg *= 0.25; this.scene.fx.spark(this.x, this.y, 0x8ac8ff, 4); }
    return super.hit(dmg, dirX, o);
  }
  // The Almighty: he goes to where you are about to be, and is already swinging when you arrive
  *almightyCut() {
    const at = this.future(0.42), a = this.arena;
    const side = Math.sign(this.player.body.velocity.x) || this.player.facing;
    const tx = Phaser.Math.Clamp(at.x + side * 30, a.left + 10, a.right - 10);
    yield* this.blink(tx, this.floorY());
    this.faceTo(at.x);
    yield* this.tele(0.22, 0xff2a3c);
    this.slashBox(50, 34, 0.13, 0xff2a3c, 1.7);
    yield 0.35 / this.spd;
  }
  // Eyes open all along the ceiling. Each in turn looks at where you will be, and a red line follows its gaze.
  *eyes() {
    const s = this.scene, a = this.arena, g = this.gfx, n = 6;
    this.setPose('raise', 2.4);
    const pts = [];
    for (let i = 0; i < n; i++) pts.push({ x: a.left + (i + 0.5) * (a.right - a.left) / n, y: a.top + 16 });
    for (let i = 0; i < n; i++) {
      const o = pts[i];
      const ang = yield* this.lockOn(o, 0.28 / this.spd, 0xff2a3c, { lock: 0.12, width: 6 });
      // the eye fires where you are heading, not where you were
      const at = this.future(0.25), a2 = this.phase >= 3 ? Math.atan2(at.y - o.y, at.x - o.x) : ang;
      yield* this.beam(o.x, o.y, a2, 0.12, 0, 6, 720, [0x6a0a14, 0xff2a3c, 0xffe0e4]);
      g.fillStyle(0xff2a3c, 1).fillCircle(o.x, o.y, 3);
    }
    g.clear();
    yield 0.35;
  }
  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.65) { this.phase = 2; this.setScript(this.takeBackPhase()); }
    else if (this.phase === 2 && this.hp <= this.maxHp * 0.35) { this.phase = 3; this.setScript(this.almighty()); }
  }
  *takeBackPhase() {
    yield* this.changeForm(null, '"You carry my blood. All of it returns to me."', { text: 'AUSWÄHLEN', color: '#8ac8ff', small: 'the father takes back' }, 0x8ac8ff, '#cfe4ff');
    this.aura.emitting = true;
    this.scene.setDarkness(0.45);
    this.spd = 1.25; this.pause = 0.34;
    yield* this.brain();
  }
  *almighty() {
    this.vene = 0; this.armor = 1;
    yield* this.changeForm('yhwach_a', '"The Almighty. I have seen every future, and you lose in all of them."', { text: 'THE ALMIGHTY', color: '#ff2a3c', small: 'every eye opens' }, 0xff2a3c, '#ffb0b8');
    this.aura.setParticleTint(0xff2a3c);
    this.scene.setDarkness(0.7);
    // a Bankai that is still burning breaks, as Tensa Zangetsu did
    if (GS.run.bankaiT > 0) {
      GS.run.bankaiT = 0; GS.run.bankaiCD = this.player.bankaiCooldown();
      this.scene.fx.shatter(this.player.x, this.player.y, [0x15141b, 0xc8202c, 0xffffff], 26, 110, 60, 1100);
      this.scene.toast('He looked at your Bankai, and it broke.');
      Sfx.play('break');
    }
    this.spd = 1.32; this.pause = 0.28;
    yield* this.brain();
  }
}

const BOSS_CLASSES = {
  fisher: GrandFisher, menos: Menos, renji: Renji, kenpachi: Kenpachi, byakuya: Byakuya,
  grimmjow: Grimmjow, vasto: Vasto, ulquiorra: Ulquiorra, espada: Aaroniero, final: HollowIchigo, urahara: Urahara, nnoitra: Nnoitra, yammy: Yammy,
  aizen: Aizen, yhwach: Yhwach,
};
