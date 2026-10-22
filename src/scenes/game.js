'use strict';
// ---------------------------------------------------------------------------
// GameScene: builds one room at a time from ROOMS and runs everything in it.
// Room transitions restart this scene with an entry description; persistent
// progress lives in GS so nothing resets between rooms.
// ---------------------------------------------------------------------------

// Held (continuous) actions and the input flag each one drives
const HELD_ACTIONS_INPUT = { left: 'left', right: 'right', up: 'up', down: 'down', jump: 'jumpH', attack: 'attackH', heal: 'healH', konso: 'konsoH', burst: 'burstH' };
const HELD_ACTIONS = Object.keys(HELD_ACTIONS_INPUT);

class GameScene extends Phaser.Scene {
  constructor() { super('game'); }
  init(data) { this.entry = data || {}; }

  create() {
    const d = GS.data;
    this.roomId = ROOMS[this.entry.room] ? this.entry.room : (ROOMS[d.room] ? d.room : 'kar_hub');
    this.def = ROOMS[this.roomId];
    this.region = this.def.region;
    d.room = this.roomId;
    const firstVisit = !d.visited[this.roomId];
    d.visited[this.roomId] = true;

    this.transitioning = false;
    this.respawning = false;
    this.frozen = false;
    this.hitStopT = 0;
    this.inp = {};
    this.enemies = []; this.pShots = []; this.eShots = []; this.hurtBoxes = [];
    this.interactables = []; this.pickups = []; this.platforms = []; this.shards = [];
    this.doors = []; this.lockCells = []; this.collapseCells = []; this.bankaiCells = [];
    this.hinted = {};
    this.suppressed = new Set();
    this.carryP = null; this.lastP = new Set();
    this.slow = null; this.tscale = 1; this.lookT = 0;
    this.anims.globalTimeScale = 1;
    this.swing = null;
    this.crackHits = {};
    this.trueSight = GS.has('konso');
    this.boss = null; this.bossStarted = false;
    // The scene object is reused between rooms, so nothing room-specific may linger
    this.restGate = null; this.startPos = null; this.arena = null; this.shade = null;
    this.chase = null; this.chaseImg = null; this.chaseFx = null;
    this.lockedCells = []; this.bankaiOpened = false; this.revealHint = false;
    this.promptTarget = null; this.respawning = false;

    this.enemyGroup = this.add.group();
    this.platformGroup = this.add.group();
    this.shardGroup = this.add.group();

    this.fx = new Fx(this);
    this.buildBackground();
    this.buildMap();
    this.spawnPlayer();
    this.setupColliders();
    this.setupCamera();
    this.setupInput();

    const dark = REGIONS[this.region].dark;
    this.dark = this.add.image(this.player.x, this.player.y, 'darkness').setScale(2).setDepth(40).setAlpha(dark).setVisible(dark > 0);

    this.events.on('resume', this.onResume, this);
    this.events.once('shutdown', () => {
      this.anims.globalTimeScale = 1;
      this.events.off('resume', this.onResume, this);
      this.game.events.emit('prompt', null);
      if (this.bossStarted) this.game.events.emit('boss-end', { silent: true });
    });

    if (GS.run.region !== this.region) {
      GS.run.region = this.region;
      this.game.events.emit('area', { name: REGIONS[this.region].name, sub: REGIONS[this.region].sub });
    } else if (firstVisit) {
      this.game.events.emit('area', { name: this.def.name, small: true });
    }
    this.game.events.emit('room', this.roomId);
    // The Kototsu sweeps the Dangai from the left whenever you enter from that side
    if (this.def.chase && this.entry.door === '1') this.startChase();
    GS.save();
  }

  onResume() {
    Controls.clearPresses();
    if (this.player && this.player.state === 'locked') { this.player.state = 'normal'; this.player.poseT = Math.min(this.player.poseT, 0.2); }
  }

  // ------------------------------------------------------------------ build
  buildBackground() {
    const r = this.region;
    this.bgFactors = [0.02, 0.12, 0.3];
    this.bgLayers = [0, 1, 2].map(i => this.add.tileSprite(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, `bg_${r}_${i}`)
      .setOrigin(0).setScrollFactor(0).setDepth(-10 + i));
  }

  buildMap() {
    const def = this.def, d = GS.data, room = this.roomId;
    const rows = def.tiles;
    const H = rows.length, W = Math.max(...rows.map(r => r.length));
    this.W = W; this.H = H; this.pxW = W * TILE; this.pxH = H * TILE;
    const map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: W, height: H });
    const ts = map.addTilesetImage('tiles_' + this.region, 'tiles_' + this.region, TILE, TILE, 0, 0);
    this.map = map;
    this.hazLayer = map.createBlankLayer('haz', ts).setDepth(4);
    this.solid = map.createBlankLayer('solid', ts).setDepth(5);
    this.oneway = map.createBlankLayer('oneway', ts).setDepth(5);
    this.hidden = map.createBlankLayer('hidden', ts).setDepth(5);

    const get = (x, y) => (y >= 0 && y < H && x >= 0 && x < W) ? (rows[y][x] || '.') : '.';
    const solidAbove = (x, y) => '#XGOD~'.includes(get(x, y - 1)) && !GS.isBroken(room, x, y - 1);
    const cnt = { k: 0, c: 0, N: 0, M: 0, f: 0, l: 0, o: 0 };
    let bossPos = null;

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = get(x, y);
      const cx = x * TILE + TILE / 2, feet = (y + 1) * TILE;
      if ('XGOD'.includes(ch) && GS.isBroken(room, x, y)) continue;
      switch (ch) {
        case '#': this.solid.putTileAt(solidAbove(x, y) ? T.SOLID : T.TOP, x, y); break;
        case 'X': this.solid.putTileAt(T.KIDO, x, y); break;
        case 'G': this.solid.putTileAt(T.GATE, x, y); break;
        case 'O': this.solid.putTileAt(T.CRACK, x, y); break;
        case 'D': this.solid.putTileAt(T.BANKAI, x, y); this.bankaiCells.push({ x, y }); break;
        case '~':
          this.solid.putTileAt(T.COLLAPSE, x, y);
          this.collapseCells.push({ x, y });
          break;
        case '=': this.oneway.putTileAt(T.ONEWAY, x, y); break;
        case '^': this.hazLayer.putTileAt(T.SPIKE, x, y); break;
        case 'H': this.hidden.putTileAt(T.HIDDEN, x, y); break;
        case 'L': this.lockCells.push({ x, y }); break;
        case 'P': this.startPos = { x: cx, y: feet }; break;
        case 'R': this.restGate = new RestGate(this, cx, feet); this.interactables.push(this.restGate); break;
        case 'S': this.interactables.push(new ShopKeeper(this, cx, feet)); break;
        case 'N': this.interactables.push(new Npc(this, cx, feet, (def.npcs || [])[cnt.N++])); break;
        case 'B': bossPos = { x: cx, y: feet }; break;
        case 'k': {
          const i = cnt.k++, id = (def.abilities || [])[i], key = `${room}:k${i}`;
          if (id && !GS.isTaken(key) && !GS.has(id)) this.pickups.push(new Pickup(this, cx, feet - 12, 'ability', id, key));
          break;
        }
        case 'c': {
          const i = cnt.c++, id = (def.seals || [])[i], key = `${room}:c${i}`;
          if (id && !GS.isTaken(key) && !d.seals.includes(id)) this.pickups.push(new Pickup(this, cx, feet - 10, 'seal', id, key));
          break;
        }
        case 'f': {
          const key = `${room}:f${cnt.f++}`;
          if (!GS.isTaken(key)) this.pickups.push(new Pickup(this, cx, feet - 10, 'fragment', null, key));
          break;
        }
        case 'l': {
          const key = `${room}:l${cnt.l++}`;
          if (!GS.isTaken(key)) this.interactables.push(new LostPlus(this, cx, feet, key));
          break;
        }
        case 'M': {
          const pl = new MovingPlatform(this, cx, y * TILE, (def.platforms || [])[cnt.M++] || {});
          this.platforms.push(pl); this.platformGroup.add(pl);
          break;
        }
        case 'W': this.interactables.push(new Smith(this, cx, feet)); break;
        case 'Z': new Portal(this, cx, y * TILE + 8); break;
        case 'n': this.uid(x, y); new Gillian(this, cx, feet); break;
        case 'o': {
          const key = `${room}:o${cnt.o++}`;
          if (!GS.isTaken(key)) this.pickups.push(new Pickup(this, cx, feet - 10, 'ore', null, key));
          break;
        }
        case 'e': this.uid(x, y); new Thug(this, cx, feet); break;
        case 'g': this.uid(x, y); new Shinigami(this, cx, feet); break;
        case 'j': this.uid(x, y); new Adjuchas(this, cx, feet); break;
        case 'a': this.uid(x, y); new Arrancar(this, cx, feet); break;
        case 'h': for (let i = 0; i < 3; i++) { this.uid(x, y, i); new Hollow(this, cx + (i - 1) * 24, y * TILE + 8 - i * 6); } break;
        default:
          if (ch >= '1' && ch <= '9') {
            const edge = x === 0 ? 'left' : x === W - 1 ? 'right' : y === 0 ? 'top' : 'bottom';
            this.doors.push({ id: ch, x, y, edge });
          }
      }
    }

    this.solid.setCollision(SOLID_INDEXES);
    this.oneway.forEachTile(t => { if (t.index >= 0) t.setCollision(false, false, true, false); });
    this.hidden.forEachTile(t => { if (t.index >= 0) t.setCollision(false, false, true, false); });
    this.hidden.setVisible(this.trueSight);

    // Boss arena
    if (def.boss && bossPos) {
      let fy = Math.floor(bossPos.y / TILE);
      while (fy < H && !'#~'.includes(get(Math.floor(bossPos.x / TILE), fy))) fy++;
      this.arena = { left: TILE + 8, right: this.pxW - TILE - 8, top: 2 * TILE + 8, floor: fy * TILE };
      if (!d.bosses[def.boss]) {
        this.boss = new BOSS_CLASSES[def.boss](this, bossPos.x, def.boss === 'vasto' ? bossPos.y : this.arena.floor);
        this.boss.facing = -1;
      } else {
        this.collapseCells.forEach(c => this.solid.putTileAt(T.COLLAPSE, c.x, c.y));
        this.spawnReward((this.arena.left + this.arena.right) / 2);
      }
    }

    // Lingering reiatsu from the last death
    if (d.shade && d.shade.room === room) this.shade = new Shade(this, d.shade.x, d.shade.y, d.shade.amount);
  }

  // Stable id for the next enemy built, so per-placement facts (Konso Reiatsu) survive room reloads
  uid(x, y, n = 0) { this.nextUid = `${this.roomId}:${x},${y}:${n}`; }

  spawnPlayer() {
    const e = this.entry;
    let x = this.pxW / 2, feet = this.pxH / 2, vy = 0, facing = e.facing || 1;
    const door = e.door && this.doors.find(dr => dr.id === e.door);
    if (door) {
      switch (door.edge) {
        case 'left': x = (door.x + 2) * TILE; feet = (door.y + 1) * TILE; facing = 1; break;
        case 'right': x = (door.x - 1) * TILE; feet = (door.y + 1) * TILE; facing = -1; break;
        case 'top': x = door.x * TILE + 8; feet = (door.y + 2) * TILE + 4; break;
        case 'bottom': x = door.x * TILE + 8; feet = (door.y + 1) * TILE - 2; vy = -PHYS.popUp; break;
      }
    } else if (e.spawn === 'rest' && this.restGate) {
      x = this.restGate.x; feet = this.restGate.feet;
    } else if (this.startPos) {
      x = this.startPos.x; feet = this.startPos.y;
    } else if (this.restGate) {
      x = this.restGate.x; feet = this.restGate.feet;
    }
    this.player = new Player(this, x, feet);
    this.player.facing = facing;
    if (vy) this.player.body.velocity.y = vy;
    if (e.wake && e.spawn === 'rest') this.player.startWake();
    this.player.lastSafe = (door && (door.edge === 'top' || door.edge === 'bottom')) ? this.validSafe({ x, y: feet }) : { x, y: feet };
  }

  setupColliders() {
    const p = this.player;
    const oneWay = (o, tile) => (o.t ? o.t.drop <= 0 : true) && o.body.velocity.y >= 0 && (o.body.prev.y + o.body.height) <= tile.pixelY + 4;
    // One-way surfaces resolve first so walking off a plank onto level solid
    // ground never snags on the solid tile's side face.
    this.physics.add.collider(p, this.oneway, null, oneWay);
    this.hiddenCollider = this.physics.add.collider(p, this.hidden, null, oneWay);
    this.hiddenCollider.active = this.trueSight;
    this.physics.add.collider(p, this.platformGroup, null, (pl, plat) => pl.t.drop <= 0 && (pl.body.prev.y + pl.body.height) <= plat.body.prev.y + 6);
    this.physics.add.collider(p, this.solid);
    this.physics.add.collider(this.enemyGroup, this.solid);
    this.physics.add.collider(this.enemyGroup, this.oneway, null, (e, tile) => !e.isBoss && !e.cfg.fly && oneWay(e, tile));
    this.physics.add.collider(this.shardGroup, this.solid);
    this.physics.add.collider(this.shardGroup, this.oneway, null, (s, tile) => s.body.velocity.y >= 0);
  }

  setupCamera() {
    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBounds(0, 0, this.pxW, this.pxH);
    cam.startFollow(this.player, true, 0.14, 0.14);
    cam.setRoundPixels(true);
    cam.fadeIn(180, 0, 0, 0);
  }

  setupInput() {
    // Input comes from Controls (remappable, tracked by physical key code)
    Controls.clearPresses();
  }

  readInput() {
    const P = Controls.takePresses(), C = Controls, i = this.inp;
    // Presses made during a hit-stop were never seen by the player: carry them to the first live frame
    if (this.carryP) { this.carryP.forEach(c => P.add(c)); this.carryP = null; }
    this.lastP = P;
    i.left = C.isDown('left'); i.right = C.isDown('right'); i.up = C.isDown('up'); i.down = C.isDown('down');
    i.jumpP = C.inSet('jump', P); i.jumpH = C.isDown('jump');
    i.attackP = C.inSet('attack', P); i.attackH = C.isDown('attack'); i.dashP = C.inSet('dash', P);
    i.healH = C.isDown('heal'); i.kidoP = C.inSet('kido', P);
    i.konsoP = C.inSet('konso', P); i.konsoH = C.isDown('konso');
    i.burstP = C.inSet('burst', P); i.burstH = C.isDown('burst');
    i.bankaiP = C.inSet('bankai', P); i.maskP = C.inSet('mask', P);
    i.interactP = C.inSet('interact', P); i.upP = C.inSet('up', P);
    i.mapP = C.inSet('map', P); i.invP = C.inSet('inventory', P); i.pauseP = C.inSet('pause', P);
    // Held keys that must be let go of before they count again (see hazardRespawn)
    for (const a of this.suppressed) {
      if (C.isDown(a)) i[HELD_ACTIONS_INPUT[a]] = false; else this.suppressed.delete(a);
    }
  }

  // ------------------------------------------------------------------ loop
  update(time, delta) {
    let dt = Math.min(delta / 1000, 1 / 30);
    if (this.slow) {
      this.slow.t -= dt;
      if (this.slow.t <= 0) { this.slow = null; this.applyTimeScale(1); }
    }
    dt *= this.tscale;
    this.readInput();
    if (this.frozen) return;
    if (this.hitStopT > 0) {
      this.hitStopT -= dt;
      if (this.hitStopT > 0) { this.carryP = this.lastP; if (!this.physics.world.isPaused) this.physics.world.pause(); return; }
      this.physics.world.resume();
    }
    GS.data.time += dt;
    const p = this.player;
    p.update(dt);
    this.updateSwing(dt);
    for (const e of this.enemies.slice()) if (e.active) e.tick(dt);
    this.enemies = this.enemies.filter(e => e.active);
    for (const s of this.pShots.slice()) if (s.active) s.tick(dt);
    this.pShots = this.pShots.filter(s => s.active);
    for (const s of this.eShots.slice()) if (s.active) s.tick(dt);
    this.eShots = this.eShots.filter(s => s.active);
    this.updateChase(dt);
    for (const pl of this.platforms) {
      pl.tick(dt);
      // Ride the platform down instead of bouncing off it
      const b = p.body, pb = pl.body;
      const onTop = Math.abs(b.bottom - pb.top) < 4 && b.right > pb.left + 1 && b.left < pb.right - 1 && b.velocity.y >= -1 && p.t.drop <= 0;
      if (onTop && pb.velocity.y > 0) b.velocity.y = Math.max(b.velocity.y, pb.velocity.y);
    }
    this.updateShards(dt);
    this.updateHurtBoxes(dt);
    if (!this.transitioning && !this.respawning) {
      this.checkContact();
      this.checkPickups();
      this.checkHazards();
      this.checkInteract();
      this.checkHints();
      this.checkBoss();
      this.checkExits();
      this.handleMenus();
    }
    this.updateCamera(dt);
    this.updateBackground();
    if (this.dark.visible) this.dark.setPosition(p.x, p.y);
  }

  // Look ahead in the facing direction, and look up or down after standing still holding that way
  updateCamera(dt) {
    const p = this.player, cam = this.cameras.main, off = cam.followOffset;
    const moving = Math.abs(p.body.velocity.x) > 20 || p.state === 'dash' || p.state === 'burst';
    let tx = p.state === 'dead' ? 0 : -p.facing * (moving ? 30 : 12), ty = 0;
    const still = p.state === 'normal' && p.grounded && !moving && !this.respawning;
    if (still && (this.inp.up !== this.inp.down)) {
      this.lookT = (this.lookT || 0) + dt;
      if (this.lookT > 0.4) ty = this.inp.up ? 60 : -60;
    } else this.lookT = 0;
    const k = Math.min(1, dt * 3);
    off.x += (tx - off.x) * k;
    off.y += (ty - off.y) * k;
  }

  // Slow the whole simulation (bodies, tweens, timers, animations) for `ms` of real time
  slowMo(scale = 0.3, ms = 900) {
    this.slow = { t: ms / 1000 };
    this.applyTimeScale(scale);
  }
  applyTimeScale(k) {
    this.tscale = k;
    this.physics.world.timeScale = 1 / k;
    this.tweens.timeScale = k;
    this.time.timeScale = k;
    this.anims.globalTimeScale = k;
  }

  updateBackground() {
    const sx = this.cameras.main.scrollX;
    this.bgLayers.forEach((l, i) => { l.tilePositionX = sx * this.bgFactors[i]; });
  }

  hitStop(t) { this.hitStopT = Math.max(this.hitStopT, t); }

  freeze(on) {
    this.frozen = on;
    if (on) this.physics.world.pause(); else this.physics.world.resume();
  }

  // ------------------------------------------------------------------ queries
  isSolidAt(x, y) { const t = this.solid.getTileAtWorldXY(x, y); return !!(t && t.collides); }
  isOneWayAt(x, y) { return !!(this.oneway.getTileAtWorldXY(x, y) || (this.trueSight && this.hidden.getTileAtWorldXY(x, y))); }
  isGroundAt(x, y) { return this.isSolidAt(x, y) || this.isOneWayAt(x, y); }
  isSpikeAt(x, y) { return !!this.hazLayer.getTileAtWorldXY(x, y); }
  nearHazard(x, y) {
    for (const dx of [-14, 0, 14]) if (this.isSpikeAt(x + dx, y) || this.isSpikeAt(x + dx, y + 10)) return true;
    return false;
  }
  countEnemies(kind) { return this.enemies.filter(e => e.alive && e.kind === kind).length; }

  validSafe(pt) {
    const ok = (x, y) => {
      const t = this.solid.getTileAtWorldXY(x, y + 3);
      return t && t.collides && t.index !== T.COLLAPSE && !this.isSolidAt(x, y - 4) && !this.isSolidAt(x, y - 18) && !this.nearHazard(x, y - 6);
    };
    if (pt && ok(pt.x, pt.y)) return pt;
    const tx0 = Math.floor((pt ? pt.x : this.pxW / 2) / TILE), ty0 = Math.floor((pt ? pt.y : this.pxH / 2) / TILE);
    for (let r = 0; r < 60; r++) for (const sg of [1, -1]) {
      const tx = tx0 + r * sg;
      for (let dy = -4; dy <= 8; dy++) {
        const x = tx * TILE + 8, y = (ty0 + dy) * TILE;
        if (x > 0 && x < this.pxW && ok(x, y)) return { x, y };
      }
    }
    return { x: this.player.x, y: this.player.body.bottom };
  }

  // ------------------------------------------------------------------ combat
  startSwing(p, kind) {
    const bank = p.bankai;
    const scale = (bank ? 1.25 : 1) * (GS.sealOn('long') ? 1.35 : 1);
    p.swingAlt = !p.swingAlt;
    const img = this.add.image(p.x, p.y, bank ? 'slash_b' : 'slash').setDepth(21).setScale(scale * 0.8).setFlipY(p.swingAlt);
    if (GS.run.maskOn && !bank) img.setTint(0xffd0d0);
    this.tweens.add({ targets: img, alpha: 0, duration: 150, onComplete: () => img.destroy() });
    this.swing = { kind, t: kind === 'down' ? 0.14 : 0.1, hit: new Set(), scale, img, pogoed: false, crack: new Set() };
    Sfx.play('slash');
    if (bank && kind === 'side') {
      const mul = (GS.sealOn('edge') ? 1.4 : 1) * (GS.run.maskOn ? 1.5 : 1);
      new PlayerShot(this, p.x + p.facing * 16, p.body.center.y - 2, 'wave', p.facing * 430, { dmg: 9 * mul, life: 0.42, kind: 'wave', w: 14, h: 30 });
      Sfx.play('wave');
    }
    this.positionSwing();
  }
  // Hitboxes are measured from the physics body, not the sprite
  swingRect(p, sw) {
    const b = p.body, sc = sw.scale, cx = b.center.x, cy = b.center.y - 2;
    if (sw.kind === 'side') { const w = 34 * sc, h = 26 * sc; return new Phaser.Geom.Rectangle(p.facing > 0 ? cx + 2 : cx - 2 - w, cy - h / 2, w, h); }
    const w = 30 * sc;
    if (sw.kind === 'up') { const h = 36 * sc; return new Phaser.Geom.Rectangle(cx - w / 2, b.top + 4 - h, w, h); }
    const h = 38 * sc;
    return new Phaser.Geom.Rectangle(cx - w / 2, b.bottom - 8, w, h);
  }
  positionSwing() {
    const sw = this.swing, p = this.player;
    if (!sw || !sw.img.active) return;
    const r = this.swingRect(p, sw);
    sw.img.setPosition(r.centerX, r.centerY);
    if (sw.kind === 'side') { sw.img.setAngle(0).setFlipX(p.facing < 0); }
    else { sw.img.setFlipX(false).setAngle(sw.kind === 'up' ? -90 : 90); }
  }
  updateSwing(dt) {
    const sw = this.swing;
    if (!sw) return;
    sw.t -= dt;
    const p = this.player;
    this.positionSwing();
    const r = this.swingRect(p, sw);
    for (const e of this.enemies) {
      if (!e.alive || sw.hit.has(e) || !e.hittable()) continue;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(r, bodyRect(e.body))) continue;
      sw.hit.add(e);
      const dirX = sw.kind === 'side' ? p.facing : (Math.sign(e.x - p.x) || p.facing);
      const res = e.hit(GS.slashDamage() * p.dmgMul(), dirX, { kind: sw.kind, slash: true });
      if (res === 'hit') {
        GS.addReiatsu(COMBAT.reiatsuPerHit * (GS.sealOn('harvest') ? 1.5 : 1));
        if (GS.run.maskOn) GS.run.hollow += COMBAT.hollowPerHit;
        this.hitStop(0.045);
        this.fx.hit(e.x, e.y, sw.kind === 'side' ? dirX : 0, 0xffffff, 1);
        Sfx.play('hit');
        if (sw.kind === 'down') this.pogo();
        else if (sw.kind === 'side') { p.body.velocity.x = -p.facing * 110; p.t.recoil = 0.07; }
      } else if (res === 'block') {
        p.body.velocity.x = -p.facing * 230; p.t.recoil = 0.12;
        this.hitStop(0.06);
      }
    }
    // Cracked walls
    const tiles = this.solid.getTilesWithinWorldXY(r.x, r.y, r.width, r.height, { isNotEmpty: true });
    for (const t of tiles) {
      if (t.index !== T.CRACK) continue;
      const key = this.clusterKey(t.x, t.y, T.CRACK);
      if (sw.crack.has(key)) continue;
      sw.crack.add(key);
      this.crackHits[key] = (this.crackHits[key] || 0) + 1;
      this.fx.debris(t.pixelX + 8, t.pixelY + 8, 0x8a6a5a, 6);
      this.fx.shake(80, 0.004);
      Sfx.play('hit');
      if (this.crackHits[key] >= 3) { this.breakCluster(t.x, t.y, T.CRACK); break; }
    }
    // Pogo off spikes
    if (sw.kind === 'down' && !sw.pogoed) {
      // Only real spike tiles count (empty tiles used to make the air pogo-able)
      const spikes = this.hazLayer.getTilesWithinWorldXY(r.x, r.y, r.width, r.height, { isNotEmpty: true })
        .filter(t => r.bottom > t.pixelY + 6);
      if (spikes.length) { this.pogo(); this.fx.spark(p.x, spikes[0].pixelY + 6, 0xffffff, 6); Sfx.play('clang'); }
    }
    if (sw.t <= 0) this.swing = null;
  }
  pogo() {
    const p = this.player;
    if (this.swing) this.swing.pogoed = true;
    p.body.velocity.y = -PHYS.jumpVel * 0.85;
    p.t.pogo = 0.22;   // no contact damage from what you just bounced off
    p.jumping = false;
    p.canDash = true;
    p.airJumps = GS.has('wings') ? 1 : 0;
  }

  crackBelow(p) {
    const b = p.body;
    for (const x of [b.left + 1, b.center.x, b.right - 1]) {
      const t = this.solid.getTileAtWorldXY(x, b.bottom + 4);
      if (t && t.index === T.CRACK) return true;
    }
    return false;
  }
  clusterCells(tx, ty, index) {
    const stack = [[tx, ty]], seen = new Set(), cells = [];
    while (stack.length) {
      const [x, y] = stack.pop();
      const k = x + ',' + y;
      if (seen.has(k)) continue;
      seen.add(k);
      const t = this.solid.getTileAt(x, y);
      if (!t || t.index !== index) continue;
      cells.push([x, y]);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return cells;
  }
  clusterKey(tx, ty, index) {
    const cells = this.clusterCells(tx, ty, index);
    cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    return cells.length ? cells[0].join(',') : tx + ',' + ty;
  }
  breakCluster(tx, ty, index) {
    const cells = this.clusterCells(tx, ty, index);
    const color = { [T.KIDO]: 0xc8a8ff, [T.GATE]: 0xff8a3a, [T.CRACK]: 0x8a7a6a, [T.BANKAI]: 0xc8202c }[index] || 0xffffff;
    cells.forEach(([x, y]) => {
      this.solid.removeTileAt(x, y);
      GS.markBroken(this.roomId, x, y);
      this.fx.debris(x * TILE + 8, y * TILE + 8, color, 5);
    });
    Sfx.play('break');
    this.fx.shake(200, 0.01);
    if (index === T.KIDO) this.toast('The Kido seal shatters.');
    if (index === T.GATE) this.toast('The Senkaimon gate breaks open.');
    if (index === T.CRACK) Sfx.play('pickup');
    GS.save();
    return cells.length;
  }

  castHado(p) {
    new PlayerShot(this, p.x + p.facing * 12, p.body.center.y - 3, 'hado', p.facing * 480, { dmg: COMBAT.hadoDamage * p.spellMul(), life: 1.3, kind: 'hado', w: 12, h: 12 });
    Sfx.play('hado');
    this.fx.ring(p.x + p.facing * 10, p.y, 0xff7a4a, 18, 200);
  }

  castGetsuga(p) {
    const dmg = (COMBAT.getsugaDamage + (GS.data.swordLevel || 0) * 4) * p.dmgMul();
    new PlayerShot(this, p.x + p.facing * 18, p.body.center.y - 4, p.bankai ? 'getsuga_b' : 'getsuga', p.facing * 430, { dmg, life: 0.75, kind: 'getsuga', w: 18, h: 44 });
    Sfx.play('wave'); Sfx.play('hado');
    this.fx.shake(140, 0.007);
    this.fx.ring(p.x + p.facing * 16, p.body.center.y, p.bankai ? 0xc8202c : 0x9ac8ff, 26, 260, 2);
  }

  castBakudo(p) {
    const range = 260;
    let best = null, bestScore = Infinity;
    const consider = (obj, x, y) => {
      const dx = x - p.x, dy = y - p.y, dist = Math.hypot(dx, dy);
      if (dist > range) return;
      const score = dist + (Math.sign(dx) !== p.facing && Math.abs(dx) > 12 ? 140 : 0) - (obj instanceof MovingPlatform ? 40 : 0);
      if (score < bestScore) { best = obj; bestScore = score; }
    };
    this.enemies.forEach(e => { if (e.alive && e.hittable() && e.boundT <= 0) consider(e, e.x, e.y); });
    this.platforms.forEach(pl => { if (pl.boundT <= 0) consider(pl, pl.x, pl.y); });
    if (!best) { this.denied('Nothing to bind'); return false; }
    const focus = GS.sealOn('focus');
    this.fx.chain(p.x, p.y - 4, best.x, best.y);
    Sfx.play('bakudo');
    if (best instanceof MovingPlatform) best.bind(focus ? 7 : 5);
    else {
      best.hit(COMBAT.bakudoDamage * p.spellMul(), Math.sign(best.x - p.x) || 1, { kind: 'bakudo', knock: false, spell: true });
      if (best.alive) best.bind(focus ? 4.5 : 3);
    }
    return true;
  }

  konsoStrike(p) {
    const w = 46, h = 26;
    const r = new Phaser.Geom.Rectangle(p.facing > 0 ? p.x + 2 : p.x - 2 - w, p.body.center.y - 2 - h / 2, w, h);
    this.fx.slashArc(p.x + p.facing * 22, p.y, p.facing, 0xbfe6ff, 1.1);
    this.fx.motes(p.x + p.facing * 26, p.y, 0xbfe6ff, 10);
    Sfx.play('konso');
    for (const e of this.enemies) {
      if (!e.alive || !Phaser.Geom.Intersects.RectangleToRectangle(r, bodyRect(e.body))) continue;
      this.fx.floatText(e.x, e.y - e.height / 2 - 4, e.memory(), '#cfe8ff');
      if (e.reveal) e.reveal();
      if (!e.konsoed) {
        e.konsoed = true;
        const first = !e.uid || !GS.data.konsoed[e.uid];
        if (e.uid) GS.data.konsoed[e.uid] = true;
        if (first) GS.addReiatsu(33);
        this.fx.motes(e.x, e.y, 0xbfe6ff, 16);
        this.fx.ring(e.x, e.y, 0xbfe6ff, 24, 350);
      }
    }
    for (const it of this.interactables.slice()) {
      if (Math.abs(it.x - r.centerX) > w / 2 + 6 || Math.abs(it.y - p.y) > 24) continue;
      if (it instanceof LostPlus) it.interact();
      else if (it instanceof Npc) this.fx.floatText(it.x, it.y - 18, Controls.fmt(it.info.lines[0]), '#cfe8ff');
    }
  }

  spawnShards(x, y, n) {
    for (let i = 0; i < n; i++) {
      const s = new Shard(this, x, y);
      this.shards.push(s);
      this.shardGroup.add(s);
    }
  }
  updateShards(dt) {
    const p = this.player;
    const pr = bodyRect(p.body);
    pr.x -= 3; pr.y -= 3; pr.width += 6; pr.height += 6;
    for (const s of this.shards) {
      if (!s.active) continue;
      if (s.y > this.pxH + 48 || s.age > 50) { s.destroy(); continue; }
      s.tick(dt, p);
      if (p.state !== 'dead' && Phaser.Geom.Intersects.RectangleToRectangle(pr, bodyRect(s.body))) {
        GS.data.reishi += COMBAT.shardValue;
        Sfx.play('shard');
        this.fx.motes(s.x, s.y, 0x7fe8ff, 4);
        s.destroy();
      }
    }
    this.shards = this.shards.filter(s => s.active);
    if (this.shade && this.shade.active && p.state !== 'dead' && Phaser.Math.Distance.Between(p.x, p.y, this.shade.x, this.shade.y) < 18) {
      const amt = this.shade.amount;
      GS.data.reishi += amt;
      GS.data.shade = null;
      Sfx.play('pickup');
      this.fx.burst(this.shade.x, this.shade.y, 0x17161f, 20);
      this.fx.motes(this.shade.x, this.shade.y, 0x7fe8ff, 20);
      this.toast(`You reclaim your lingering Reiatsu: +${amt} reishi`);
      this.shade.destroy();
      this.shade = null;
      GS.save();
    }
  }

  spawnShock(x, feet, dir) {
    new EnemyShot(this, x, feet - 10, 'shock', dir * 250, 0, { dmg: 1, life: 1.6, w: 12, h: 18, flipX: dir < 0, pierce: true });
  }

  addHurt(x, y, w, h, dmg, dur, update) {
    const hb = { x, y, w, h, dmg, t: dur, update };
    if (update) update(hb);
    this.hurtBoxes.push(hb);
    return hb;
  }
  updateHurtBoxes(dt) {
    const p = this.player;
    const pr = bodyRect(p.body);
    for (const hb of this.hurtBoxes) {
      if (hb.update) hb.update(hb);
      hb.t -= dt;
      if (hb.t > 0 && p.state !== 'dead' && Phaser.Geom.Intersects.RectangleToRectangle(pr, new Phaser.Geom.Rectangle(hb.x, hb.y, hb.w, hb.h))) {
        p.takeDamage(hb.dmg, hb.x + hb.w / 2);
      }
    }
    this.hurtBoxes = this.hurtBoxes.filter(hb => hb.t > 0);
  }
  beamHit(x1, y1, x2, y2, halfW, dmg) {
    const p = this.player, px = p.body.center.x, py = p.body.center.y;
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1;
    const t = Phaser.Math.Clamp(((px - x1) * dx + (py - y1) * dy) / L2, 0, 1);
    if (Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t)) < halfW + 7) p.takeDamage(dmg, x1);
  }

  // ------------------------------------------------------------------ checks
  checkContact() {
    const p = this.player;
    if (p.state === 'dead' || p.state === 'burst' || p.t.pogo > 0) return;
    const pr = bodyRect(p.body);
    for (const e of this.enemies) {
      const dmg = e.contactDamage;
      if (!dmg) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(pr, bodyRect(e.body))) {
        if (p.takeDamage(dmg, e.x) && e.onContact) e.onContact();
        break;
      }
    }
  }

  checkPickups() {
    const p = this.player;
    if (p.state === 'dead') return;
    for (const pk of this.pickups) {
      if (pk.active && Math.abs(pk.x - p.x) < 14 && Math.abs(pk.y - p.y) < 20) { this.collectPickup(pk); break; }
    }
  }
  collectPickup(pk) {
    const d = GS.data, p = this.player;
    GS.markTaken(pk.key);
    this.pickups = this.pickups.filter(x => x !== pk);
    this.fx.ring(pk.x, pk.y, pk.color, 40, 500, 3);
    this.fx.motes(pk.x, pk.y, pk.color, 20);
    if (pk.type === 'ability') {
      d.abilities[pk.id] = true;
      Sfx.play('ability');
      this.fx.flash(0xffffff, 250, 0.5);
      if (pk.id === 'konso') this.enableTrueSight();
      if (pk.id === 'bankai') d.reiatsu = COMBAT.maxReiatsu;
      GS.save();
      pk.collect();
      p.body.setVelocity(0, p.body.velocity.y);
      p.setPose('raise', 1.0);
      this.showPopup({ kind: 'ability', id: pk.id });
    } else if (pk.type === 'seal') {
      if (!d.seals.includes(pk.id)) d.seals.push(pk.id);
      Sfx.play('pickup');
      GS.save();
      pk.collect();
      p.setPose('raise', 0.8);
      this.showPopup({ kind: 'seal', id: pk.id });
    } else if (pk.type === 'ore') {
      d.ore = (d.ore || 0) + 1;
      Sfx.play('pickup');
      GS.save();
      pk.collect();
      this.toast(`Reishi ore found (${d.ore} carried). The swordsmith in Rukongai works with it.`);
    } else {
      const up = GS.addFragment();
      Sfx.play('pickup');
      GS.save();
      pk.collect();
      this.toast(up ? 'Four fragments fuse. Max health +1' : `Soul Fragment ${d.fragments}/4`);
    }
  }
  enableTrueSight() {
    this.trueSight = true;
    this.hidden.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.hidden, alpha: 1, duration: 1400 });
    this.hiddenCollider.active = true;
  }

  checkHazards() {
    const p = this.player;
    if (p.state === 'dead') return;
    const b = p.body;
    const pts = [[b.left + 2, b.bottom - 2], [b.right - 2, b.bottom - 2], [b.center.x, b.bottom - 1], [b.left + 2, b.top + 6], [b.right - 2, b.top + 6]];
    for (const [x, y] of pts) {
      const t = this.hazLayer.getTileAtWorldXY(x, y);
      if (t && y >= t.pixelY + 7) { this.onSpike(); return; }
    }
  }
  onSpike() {
    const p = this.player;
    GS.data.hp -= 1;
    Sfx.play('hurt');
    this.fx.shake(200, 0.012);
    this.fx.flash(0xffffff, 100, 0.4);
    this.fx.burst(p.x, p.y, 0x17161f, 12);
    if (GS.data.hp <= 0) { GS.data.hp = 0; p.die(); return; }
    this.hazardRespawn();
  }
  hazardRespawn() {
    const p = this.player;
    this.respawning = true;
    // Whatever is held right now (usually a direction) stays dead until released, so
    // holding toward the spikes cannot walk the player straight back into them
    this.suppressed = new Set(HELD_ACTIONS.filter(a => Controls.isDown(a)));
    p.state = 'locked';
    p.body.setVelocity(0, 0);
    p.body.setAllowGravity(false);
    this.hitStop(0.12);
    this.cameras.main.fadeOut(160, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const s = this.validSafe(p.lastSafe);
      p.placeFeet(s.x, s.y);
      p.body.setAllowGravity(true);
      p.state = 'normal';
      p.t.invuln = 1.0;
      this.cameras.main.fadeIn(220, 0, 0, 0);
      this.respawning = false;
    });
  }

  checkInteract() {
    const p = this.player;
    let best = null, bd = Infinity;
    // No resting or chatting mid-boss-fight (the rest gate in a boss arena was a free full heal)
    const duel = this.bossStarted && this.boss && this.boss.alive;
    if (p.state === 'normal' && p.grounded && !duel) {
      for (const it of this.interactables) {
        if (!it.active) continue;
        const dx = Math.abs(it.x - p.x), dy = Math.abs(it.y - p.y);
        if (dx < 24 && dy < 34 && dx < bd) { best = it; bd = dx; }
      }
    }
    if (best !== this.promptTarget) {
      this.promptTarget = best;
      this.game.events.emit('prompt', best ? { target: best, text: best.prompt } : null);
    }
    // Up doubles as interact, but not while foes are close: it is also the up-slash aim
    const foeNear = this.enemies.some(e => e.alive && !e.harmless && Math.abs(e.x - p.x) < 150 && Math.abs(e.y - p.y) < 80);
    if (best && (this.inp.interactP || (this.inp.upP && !foeNear))) {
      this.game.events.emit('prompt', null);
      this.promptTarget = null;
      best.interact();
    }
  }

  checkHints() {
    const p = this.player;
    const t = this.solid.getTileAtWorldXY(p.x + p.facing * 12, p.y);
    if (t) {
      const msg = {
        [T.KIDO]: GS.has('hado') ? Controls.fmt('A violet Kido seal. Press {kido} to blast it with Hado.') : 'A violet Kido seal. Only Kido can shatter it.',
        [T.GATE]: GS.has('burst') ? Controls.fmt('A sealed Senkaimon. Hold {burst}, then release to burst through.') : 'A sealed Senkaimon. It would take a tremendous burst to break.',
        [T.BANKAI]: 'A seal that answers only to Bankai.',
      }[t.index];
      if (msg && !this.hinted[t.index]) { this.hinted[t.index] = true; this.toast(msg); }
    }
    if (this.bankaiCells.length && !this.bankaiOpened && GS.has('bankai')) {
      const c = this.bankaiCells.find(cell => this.solid.getTileAt(cell.x, cell.y));
      if (c && this.bankaiCells.some(cell => Math.abs(p.x - cell.x * TILE) < 6 * TILE && Math.abs(p.y - cell.y * TILE) < 3 * TILE)) {
        this.bankaiOpened = true;
        this.breakCluster(c.x, c.y, T.BANKAI);
        Sfx.play('door');
        this.fx.flash(0xc8202c, 200, 0.4);
        this.toast('The seal recognizes your Bankai.');
      }
    }
  }

  checkBoss() {
    if (!this.boss || this.bossStarted || !this.boss.alive) return;
    const p = this.player;
    if (this.boss.waitsForReveal) {
      if (!this.revealHint && Math.abs(p.x - this.boss.x) < 110) {
        this.revealHint = true;
        this.toast(Controls.fmt('The air here shimmers. Something unseen is watching. Strike it with the Konso Blade ({konso}).'));
      }
      return;
    }
    if (!p.grounded) return;
    const cells = this.lockCells.concat(this.doors);
    const near = cells.some(c => Math.abs(p.x - (c.x * TILE + 8)) < 7 * TILE && Math.abs(p.y - (c.y * TILE + 8)) < 8 * TILE);
    if (!near) this.startBoss();
  }
  startBoss() {
    this.bossStarted = true;
    this.lockedCells = this.lockCells.concat(this.doors.filter(dr => dr.edge === 'left' || dr.edge === 'right'));
    this.lockedCells.forEach(c => { this.solid.putTileAt(T.LOCK, c.x, c.y); this.fx.dust(c.x * TILE + 8, c.y * TILE + 8, 3); });
    Sfx.play('boss');
    this.fx.shake(500, 0.008);
    const info = BOSSES[this.boss.id];
    this.game.events.emit('boss-start', { name: info.name, title: info.title });
    this.time.delayedCall(1000, () => { if (this.boss && this.boss.alive) this.boss.activate(); });
  }
  onBossDefeated(boss) {
    const d = GS.data;
    d.bosses[boss.id] = true;
    this.game.events.emit('boss-end', {});
    this.slowMo(0.25, 1100);
    this.fx.zoomPunch(0.08, 700);
    if (boss.id === 'final') {
      d.cleared = true;
      GS.save();
      this.time.delayedCall(2400, () => this.finishGame());
      return;
    }
    d.sealSlots += 1;
    GS.save();
    const bx = Phaser.Math.Clamp(boss.x, this.arena.left + 40, this.arena.right - 40);
    this.time.delayedCall(1700, () => {
      (this.lockedCells || []).forEach(c => this.solid.removeTileAt(c.x, c.y));
      if (boss.cfg.drop) this.spawnShards(bx, this.arena.floor - 70, boss.cfg.drop);
      if (this.player.state === 'normal' && this.player.grounded) this.player.setPose('raise', 1.8);
      this.toast(`Seal capacity grows: ${d.sealSlots} slots`);
      this.spawnReward(bx);
      this.setDarkness(REGIONS[this.region].dark);
    });
  }
  spawnReward(x) {
    if (this.def.rewardItems) {
      const n = this.def.rewardItems.length;
      this.def.rewardItems.forEach((type, i) => {
        const key = this.roomId + ':reward' + i;
        if (GS.isTaken(key)) return;
        const px = x + (i - (n - 1) / 2) * 44;
        const pk = new Pickup(this, px, this.arena.floor - 16, type, null, key);
        this.pickups.push(pk);
        this.fx.ring(px, this.arena.floor - 16, pk.color, 40, 600, 3);
      });
      return;
    }
    const id = this.def.reward;
    if (!id || GS.has(id) || GS.isTaken(this.roomId + ':reward')) return;
    const pk = new Pickup(this, x, this.arena.floor - 16, 'ability', id, this.roomId + ':reward');
    this.pickups.push(pk);
    this.fx.ring(x, this.arena.floor - 16, pk.color, 50, 700, 3);
  }
  collapseFloor() {
    const g = this.add.graphics().setDepth(31);
    let n = 0;
    this.time.addEvent({
      delay: 100, repeat: 11, callback: () => {
        n++;
        g.clear();
        if (n % 2) { g.fillStyle(0xff3040, 0.4); this.collapseCells.forEach(c => g.fillRect(c.x * TILE, c.y * TILE, TILE, TILE)); }
      },
    });
    this.fx.shake(1200, 0.004);
    this.time.delayedCall(1250, () => {
      g.destroy();
      this.collapseCells.forEach(c => {
        this.solid.removeTileAt(c.x, c.y);
        if (Math.random() < 0.5) this.fx.debris(c.x * TILE + 8, c.y * TILE + 8, 0xaaa6b8, 3);
      });
      Sfx.play('break');
      this.fx.shake(300, 0.012);
    });
  }
  restoreFloor() {
    this.time.delayedCall(1500, () => this.collapseCells.forEach(c => this.solid.putTileAt(T.COLLAPSE, c.x, c.y)));
  }
  setDarkness(a) {
    if (a > 0) this.dark.setVisible(true);
    this.tweens.add({ targets: this.dark, alpha: a, duration: 800, onComplete: () => { if (a <= 0) this.dark.setVisible(false); } });
  }
  finishGame() {
    this.cameras.main.fadeOut(1600, 255, 255, 255);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('ui');
      this.scene.start('ending');
    });
  }

  // ------------------------------------------------------------------ the Kototsu
  startChase() {
    this.chase = { x: -230, speed: 124, delay: 1.5, done: false, rumble: 0 };
    this.chaseImg = this.add.image(-230, this.pxH / 2, 'kototsu').setOrigin(1, 0.5).setDepth(35).setDisplaySize(170, this.pxH);
    this.chaseFx = this.add.particles(-230, 0, 'dot', {
      x: { min: -6, max: 0 }, y: { min: 0, max: this.pxH }, speedX: { min: 40, max: 170 }, speedY: { min: -25, max: 25 },
      lifespan: 650, scale: { start: 0.9, end: 0 }, alpha: { start: 0.9, end: 0 }, frequency: 25, tint: 0xe6d8ff, blendMode: 'ADD',
    }).setDepth(36);
    this.toast('Something vast stirs behind you. Run.');
    Sfx.play('roar');
  }
  updateChase(dt) {
    const c = this.chase;
    if (!c || c.done) return;
    const p = this.player;
    // Rubber band: it never falls more than ~15 tiles behind, so it always looms
    const gap = p.body.left - c.x;
    if (c.delay > 0) c.delay -= dt; else c.x += (c.speed + Math.max(0, gap - 250) * 0.9) * dt;
    this.chaseImg.x = c.x;
    this.chaseFx.setPosition(c.x, 0);
    c.rumble -= dt;
    if (c.rumble <= 0) { c.rumble = 0.6; Sfx.play('door'); if (p.x - c.x < 220) this.fx.shake(250, 0.003); }
    if (p.x > this.pxW - 8 * TILE) {
      c.done = true;
      this.tweens.add({ targets: [this.chaseImg, this.chaseFx], alpha: 0, duration: 900 });
      this.toast('The Kototsu falls behind.');
      return;
    }
    if (p.state !== 'dead' && !this.transitioning && !this.respawning && p.body.left < c.x - 6) {
      c.done = true;
      GS.data.hp -= 1;
      Sfx.play('hurt');
      this.fx.flash(0xffffff, 400, 0.8);
      if (GS.data.hp <= 0) { GS.data.hp = 0; p.die(); return; }
      this.toast('The Kototsu sweeps you back to the gate.');
      this.goTo(this.roomId, { door: '1' });
    }
  }

  // ------------------------------------------------------------------ rooms
  checkExits() {
    const p = this.player, b = p.body;
    let edge = null;
    if (p.x < 0) edge = 'left';
    else if (p.x > this.pxW) edge = 'right';
    else if (b.bottom < 0) edge = 'top';
    else if (b.top > this.pxH) edge = 'bottom';
    if (!edge) return;
    let door = null, best = Infinity;
    for (const dr of this.doors) {
      if (dr.edge !== edge) continue;
      const dist = (edge === 'left' || edge === 'right') ? Math.abs(p.y - (dr.y * TILE + 8)) : Math.abs(p.x - (dr.x * TILE + 8));
      if (dist < best && dist < 5 * TILE) { best = dist; door = dr; }
    }
    if (!door) {
      if (edge === 'left') { p.body.reset(6, p.y); }
      else if (edge === 'right') { p.body.reset(this.pxW - 6, p.y); }
      else if (edge === 'bottom') { this.onSpike(); }
      return;
    }
    const [to, toDoor] = this.def.doors[door.id];
    this.goTo(to, { door: toDoor });
  }
  goTo(room, entry = {}) {
    if (this.transitioning) return;
    this.transitioning = true;
    this.game.events.emit('prompt', null);
    entry.room = room;
    entry.facing = this.player.facing;
    this.cameras.main.fadeOut(130, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart(entry));
  }
  travelTo(room) { this.goTo(room, { spawn: 'rest' }); }

  // ------------------------------------------------------------------ actions
  rest(gate) {
    const d = GS.data, p = this.player;
    d.hp = d.maxHp;
    d.restRoom = this.roomId;
    d.gates[this.roomId] = true;
    GS.save();
    Sfx.play('save');
    this.fx.motes(gate.x, gate.y, 0xffe8b0, 24);
    this.fx.ring(gate.x, gate.y, 0xffe8b0, 40, 500);
    p.state = 'locked';
    p.body.setVelocityX(0);
    p.setPose('pray', 99);
    this.openMenu('rest');
  }
  onPlusSent(key) {
    const d = GS.data;
    GS.markTaken(key);
    d.pluses++;
    d.reishi += 60;
    this.toast(`A lost soul crosses over (${d.pluses}/6). +60 reishi`);
    if (d.pluses === 2) { d.sealSlots++; this.toast('Gratitude of the departed: +1 seal slot'); }
    if (d.pluses === 4) {
      d.sealSlots++;
      if (!d.seals.includes('grace')) d.seals.push('grace');
      this.time.delayedCall(1400, () => this.showPopup({ kind: 'seal', id: 'grace' }));
    }
    if (d.pluses === 6) {
      d.sealSlots++;
      if (!d.seals.includes('will')) d.seals.push('will');
      this.time.delayedCall(1400, () => this.showPopup({ kind: 'seal', id: 'will' }));
    }
    GS.save();
  }
  onPlayerDeath() {
    const d = GS.data, p = this.player;
    d.deaths++;
    Sfx.play('die');
    this.fx.shake(500, 0.01);
    this.fx.burst(p.x, p.y, 0x17161f, 30);
    this.fx.burst(p.x, p.y, 0xf4f1ea, 16);
    this.game.events.emit('prompt', null);
    this.game.events.emit('boss-end', { silent: true });
    if (d.reishi > 0) {
      const s = this.validSafe(p.lastSafe);
      d.shade = { room: this.roomId, x: s.x, y: s.y - 14, amount: d.reishi };
      d.reishi = 0;
    }
    d.reiatsu = 0;
    GS.run = GS.freshRun();
    GS.save();
    this.transitioning = true;
    this.time.delayedCall(1300, () => {
      // Health refills only now, so the HUD can show the last mask breaking
      d.hp = d.maxHp;
      GS.save();
      this.game.events.emit('toast', d.shade ? 'Your reishi lingers where you fell.' : 'You wake at the rest gate.');
      this.cameras.main.fadeOut(700, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart({ room: d.restRoom || 'kar_hub', spawn: 'rest', wake: true }));
    });
  }

  // ------------------------------------------------------------------ UI bridges
  toast(msg) { this.game.events.emit('toast', msg); }
  denied(msg) {
    Sfx.play('deny');
    const now = this.time.now;
    if (this.lastDeny !== msg || now - (this.lastDenyT || 0) > 2500) { this.toast(msg); this.lastDeny = msg; this.lastDenyT = now; }
  }
  showPopup(info) {
    this.freeze(true);
    this.game.events.emit('popup', Object.assign({}, info, { onClose: () => this.freeze(false) }));
  }
  startDialog(name, lines) {
    this.freeze(true);
    this.game.events.emit('dialog', { name, lines: lines.map(l => Controls.fmt(l)), onClose: () => this.freeze(false) });
  }
  openMenu(type) {
    this.game.events.emit('prompt', null);
    this.scene.pause();
    this.scene.launch('menu', { type });
  }
  handleMenus() {
    const p = this.player, i = this.inp;
    if (p.state === 'dead' || p.state === 'locked') return;
    if (i.pauseP) this.openMenu('pause');
    else if (i.mapP) this.openMenu('map');
    else if (i.invP) this.openMenu('inventory');
  }
}
