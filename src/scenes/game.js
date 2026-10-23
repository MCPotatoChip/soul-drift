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
    this.doors = []; this.lockCells = []; this.collapseCells = []; this.bankaiCells = []; this.hazards = [];
    this.hinted = {};
    this.inputLock = 0;
    this.carryP = null; this.lastP = new Set();
    this.slow = null; this.lookT = 0;
    this.applyTimeScale(1);
    this.swing = null;
    this.crackHits = {};
    this.trueSight = GS.has('konso');
    this.boss = null; this.bossStarted = false;
    // The scene object is reused between rooms, so nothing room-specific may linger
    this.restGate = null; this.startPos = null; this.arena = null; this.shade = null;
    this.chase = null; this.chaseImg = null; this.chaseFx = null;
    this.lockedCells = []; this.bankaiOpened = false; this.revealHint = false;
    this.promptTarget = null; this.respawning = false;
    this.lanterns = []; this.barriers = { gold: [], blue: [] }; this.litT = 0; this.litTick = 0;
    this.pressure = null; this.pressureT = 0; this.waves = null; this.duel = null; this.checkT = 1;
    this.waveSpotCache = null; this.arenaFloor = null; this.uraharaNpc = null; this.sealHint = 0;

    this.enemyGroup = this.add.group();
    this.platformGroup = this.add.group();
    this.shardGroup = this.add.group();

    this.fx = new Fx(this);
    this.buildBackground();
    this.buildMap();
    this.spawnPlayer();
    // Flyers find their way to the player through this field (see nav.js)
    this.flow = new FlowField(this, () => ({ x: this.player.x, y: this.player.body.center.y }), 0.2);
    this.flow.build();
    this.setupColliders();
    this.setupCamera();
    this.setupInput();

    const dark = REGIONS[this.region].dark;
    this.dark = this.add.image(this.player.x, this.player.y, 'darkness').setScale(2).setDepth(40).setAlpha(dark).setVisible(dark > 0);
    this.ambience = new Ambience(this, this.region);
    Music.setRegion(this.region);

    this.events.on('resume', this.onResume, this);
    this.events.once('shutdown', () => {
      this.anims.globalTimeScale = 1;
      this.events.off('resume', this.onResume, this);
      this.game.events.emit('prompt', null);
      if (this.bossStarted) { this.game.events.emit('boss-end', { silent: true }); Music.setBoss(false); }
    });

    if (GS.rush) {
      // a trial: no area titles, and the fight begins as soon as you arrive (a hidden boss waits to be found)
      if (this.boss && !this.boss.waitsForReveal) this.time.delayedCall(800, () => { if (!this.bossStarted && this.boss.alive) this.startBoss(); });
    } else if (GS.run.region !== this.region) {
      GS.run.region = this.region;
      this.game.events.emit('area', { name: REGIONS[this.region].name, sub: REGIONS[this.region].sub, kanji: REGIONS[this.region].kanji });
    } else if (firstVisit) {
      this.game.events.emit('area', { name: this.def.name, small: true });
    }
    this.game.events.emit('room', this.roomId);
    // The Kototsu sweeps the Dangai from the left whenever you enter from that side
    if (this.def.chase && this.entry.door === '1') this.startChase();
    // A new journey opens with Rukia, who hands over the Konso
    const rukia = this.interactables.find(it => it.info && it.info.gives === 'konso');
    if (rukia && !d.gifts[rukia.info.name] && this.entry.spawn === 'start') this.time.delayedCall(1100, () => { if (!this.transitioning) this.talkTo(rukia); });
    // What an update changed in this save (see GS.migrate), told once
    if (d.notes && d.notes.length && !GS.rush) {
      d.notes.splice(0).forEach((msg, i) => this.time.delayedCall(2600 + i * 4200, () => this.toast(msg)));
    }
    GS.save();
  }

  onResume() {
    Controls.clearPresses();
    if (!this.slow) this.applyTimeScale(1);   // the game speed may have changed in the menu
    if (this.player && this.player.state === 'locked') { this.player.state = 'normal'; this.player.poseT = Math.min(this.player.poseT, 0.2); }
  }

  // ------------------------------------------------------------------ build
  buildBackground() {
    const r = this.region;
    this.bgFactors = BG_FACTORS;
    this.bgLayers = BG_FACTORS.map((_, i) => this.add.tileSprite(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, `bg_${r}_${i}`)
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
    // quicksand is drawn in front of the player, so whatever sinks into it disappears
    this.sandLayer = map.createBlankLayer('sand', ts).setDepth(22);

    const get = (x, y) => (y >= 0 && y < H && x >= 0 && x < W) ? (rows[y][x] || '.') : '.';
    const solidAbove = (x, y) => '#XGOD~'.includes(get(x, y - 1)) && !GS.isBroken(room, x, y - 1);
    const cnt = { k: 0, c: 0, N: 0, M: 0, f: 0, l: 0, o: 0, r: 0, w: 0 };
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
        case 'w': {   // a power upgrade: found once each, until the track is full
          const i = cnt.w++, id = (def.upgrades || [])[i], key = `${room}:w${i}`;
          if (id && !GS.isTaken(key) && GS.upgrade(id) < UPGRADES[id].max) this.pickups.push(new Pickup(this, cx, feet - 12, 'upgrade', id, key));
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
        case 'Q': this.solid.putTileAt(T.BARRIER, x, y); this.barriers.gold.push({ x, y }); break;
        case 'K': this.barriers.blue.push({ x, y }); break;
        case 't': this.lanterns.push(new Lantern(this, cx, feet)); break;
        case 's': this.sandLayer.putTileAt(T.SAND, x, y); break;
        case 'p': (this.pressure || (this.pressure = new Uint8Array(W * H)))[y * W + x] = 1; break;
        case 'U': this.interactables.push(new Ladder(this, cx, feet)); break;
        case 'A': this.interactables.push(new TrialAltar(this, cx, feet)); break;
        case 'r': {
          const key = `${room}:r${cnt.r++}`;
          if (!GS.isTaken(key)) this.pickups.push(new Pickup(this, cx, feet - 10, 'petal', null, key));
          break;
        }
        case 'C': {
          const key = `${room}:C`;
          if (!GS.isTaken(key) && d.quests.kon !== 2) this.pickups.push(new Pickup(this, cx, feet - 10, 'item', 'gikongan', key));
          break;
        }
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
        case 'q': this.uid(x, y); new KidoCaster(this, cx, feet); break;
        case 'i': this.uid(x, y); new Crawler(this, cx, feet); break;
        case 'm': this.uid(x, y); new Onmitsu(this, cx, feet); break;
        case 'x': this.uid(x, y); new Exequias(this, cx, feet); break;
        case 'b': this.uid(x, y); new Brawler(this, cx, feet); break;
        case 'v': this.uid(x, y); new Diver(this, cx, y * TILE); break;
        case 'u': new Geyser(this, cx, feet); break;
        case 'y': new Stalactite(this, cx, y * TILE); break;
        case 'h': for (let i = 0; i < 3; i++) { this.uid(x, y, i); new Hollow(this, cx + (i - 1) * 24, y * TILE + 8 - i * 6); } break;
        default:
          if (ch >= '1' && ch <= '9') {
            const edge = x === 0 ? 'left' : x === W - 1 ? 'right' : y === 0 ? 'top' : 'bottom';
            this.doors.push({ id: ch, x, y, edge });
          }
      }
    }

    this.solid.setCollision(SOLID_INDEXES);
    if (this.pressure) this.buildPressure();
    this.oneway.forEachTile(t => { if (t.index >= 0) t.setCollision(false, false, true, false); });
    this.hidden.forEachTile(t => { if (t.index >= 0) t.setCollision(false, false, true, false); });
    this.hidden.setVisible(this.trueSight);

    // Boss arena
    if (def.boss && bossPos) {
      let fy = Math.floor(bossPos.y / TILE);
      while (fy < H && !'#~'.includes(get(Math.floor(bossPos.x / TILE), fy))) fy++;
      this.arena = { left: TILE + 8, right: this.pxW - TILE - 8, top: 2 * TILE + 8, floor: fy * TILE };
      if (!d.bosses[def.boss] || GS.rush) {
        this.boss = new BOSS_CLASSES[def.boss](this, bossPos.x, def.boss === 'vasto' ? bossPos.y : this.arena.floor);
        this.boss.facing = -1;
      } else {
        this.collapseCells.forEach(c => this.solid.putTileAt(T.COLLAPSE, c.x, c.y));
        this.spawnReward((this.arena.left + this.arena.right) / 2);
      }
    }

    // Lingering reiatsu from the last death (never inside a trial)
    if (d.shade && d.shade.room === room && !GS.rush) this.shade = new Shade(this, d.shade.x, d.shade.y, d.shade.amount);
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
    } else if (e.spawn === 'shop' && this.interactables.some(it => it instanceof ShopKeeper)) {
      const shop = this.interactables.find(it => it instanceof ShopKeeper);
      x = shop.x - 26; feet = shop.y; facing = 1;
    } else if (e.spawn === 'rush' && this.boss && this.arena) {
      const right = this.boss.x < (this.arena.left + this.arena.right) / 2;
      x = right ? this.arena.right - 48 : this.arena.left + 48; feet = this.arena.floor; facing = right ? -1 : 1;
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
    cam.fadeIn(200, ...this.regionTint(this.region));
  }

  setupInput() {
    // Input comes from Controls (remappable, tracked by physical key code)
    Controls.clearPresses();
  }

  readInput() {
    const P = Controls.takePresses(), C = Controls, i = this.inp;
    // The press that closed a dialog or popup is not also a jump or a slash
    if (this.swallowP) { P.clear(); this.swallowP = false; }
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
    // Held keys do not count while the post-respawn lock runs (see hazardRespawn)
    if (this.inputLock > 0) for (const a of HELD_ACTIONS) i[HELD_ACTIONS_INPUT[a]] = false;
  }

  // ------------------------------------------------------------------ loop
  update(time, delta) {
    let dt = Math.min(delta / 1000, 1 / 30);
    if (this.slow) {
      this.slow.t -= dt;
      if (this.slow.t <= 0) { this.slow = null; this.applyTimeScale(1); }
    }
    dt *= this.tscale;
    if (this.inputLock > 0) this.inputLock -= dt;
    this.readInput();
    if (this.frozen) return;
    if (this.hitStopT > 0) {
      this.hitStopT -= dt;
      if (this.hitStopT > 0) { this.carryP = this.lastP; if (!this.physics.world.isPaused) this.physics.world.pause(); return; }
      this.physics.world.resume();
    }
    GS.data.time += dt;
    if (GS.rush && !this.transitioning && this.bossStarted && this.boss && this.boss.alive) GS.rush.t += dt;
    const p = this.player;
    this.senseEnv();
    p.update(dt);
    this.updateEnv(dt);
    this.updateLanterns(dt);
    if (this.waves) this.updateWaves(dt);
    this.updateSwing(dt);
    this.flow.update(dt);
    for (const e of this.enemies.slice()) if (e.active) e.tick(dt);
    this.enemies = this.enemies.filter(e => e.active);
    for (const s of this.pShots.slice()) {
      if (!s.active) continue;
      s.tick(dt);
      if (s.active && !s.litLantern) for (const ln of this.lanterns) if (ln.rect.contains(s.x, s.y)) { s.litLantern = true; this.lightLanterns(ln); }
    }
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
    for (const h of this.hazards) if (h.active) h.tick(dt);
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
      this.checkPalace(dt);
    }
    this.updateCamera(dt);
    this.updateNpcs();
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
    // the follow lerp is per frame: scale it by the frame time so 60, 120 and 144 Hz all glide the same
    const l = 1 - Math.pow(1 - 0.14, Math.max(0.25, dt * 60));
    cam.setLerp(l, l);
  }

  // Slow the whole simulation (bodies, tweens, timers, animations) for `ms` of real time
  slowMo(scale = 0.3, ms = 900) {
    this.slow = { t: ms / 1000 };
    this.applyTimeScale(scale);
  }
  // k is on top of the game speed chosen in the assist settings
  applyTimeScale(k) {
    k *= Settings.get('speed');
    this.tscale = k;
    this.physics.world.timeScale = 1 / k;
    this.tweens.timeScale = k;
    this.time.timeScale = k;
    this.anims.globalTimeScale = k;
  }

  // Layers slide with the camera at their own pace; in tall rooms the nearer ones rise and sink a little too
  updateBackground() {
    const cam = this.cameras.main, sx = cam.scrollX;
    const ky = this.pxH > VIEW_H + 32 ? (cam.scrollY - (this.pxH - VIEW_H) / 2) : 0;
    this.bgLayers.forEach((l, i) => {
      l.tilePositionX = sx * this.bgFactors[i];
      l.y = VIEW_H / 2 - Phaser.Math.Clamp(ky * this.bgFactors[i] * 0.35, -40, 0) * (i > 1 ? 1 : 0);
    });
  }

  // A dark wash of a region's colour, used for the fade between rooms
  regionTint(region, k = 0.2) {
    const c = Phaser.Display.Color.IntegerToColor(REGIONS[region].color);
    return [Math.round(c.red * k), Math.round(c.green * k), Math.round(c.blue * k)];
  }

  // Townsfolk turn to face you as you come near, and shopkeepers greet you
  updateNpcs() {
    const p = this.player;
    for (const it of this.interactables) {
      if (!it.active || !it.faces) continue;
      const dx = p.x - it.x, near = Math.abs(dx) < 170 && Math.abs(p.y - it.y) < 60;
      if (near) it.setFlipX(dx < 0);
      if (near && Math.abs(dx) < 70 && !it.greeted && it.greet) { it.greeted = true; it.greet(); }
      else if (Math.abs(dx) > 220) it.greeted = false;
    }
  }

  hitStop(t) { this.hitStopT = Math.max(this.hitStopT, t); }

  freeze(on) {
    this.frozen = on;
    if (on) this.physics.world.pause(); else { this.physics.world.resume(); this.swallowP = true; }
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
      // Planks count as ground too: without them a spot on a plank was refused and the search
      // picked the nearest wall top, often on the ceiling blocks outside the room
      const t = this.solid.getTileAtWorldXY(x, y + 3);
      const ground = (t && t.collides && t.index !== T.COLLAPSE) || !!this.oneway.getTileAtWorldXY(x, y + 3);
      return ground && y >= 2 * TILE && !this.isSolidAt(x, y - 4) && !this.isSolidAt(x, y - 18) && !this.nearHazard(x, y - 6);
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
    const form = GS.form();
    const scale = (bank ? 1.25 : 1) * (GS.sealOn('long') ? 1.35 : 1) * form.reach;
    p.swingAlt = !p.swingAlt;
    const img = this.add.image(p.x, p.y, bank ? 'slash_b' : 'slash').setDepth(21).setScale(scale * 0.8).setFlipY(p.swingAlt);
    if (GS.run.maskOn && !bank) img.setTint(0xffd0d0);
    else if (!bank && form.tint !== 0xffffff) img.setTint(form.tint);
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
        p.landedHit();
        GS.addReiatsu(COMBAT.reiatsuPerHit * (GS.sealOn('harvest') ? 1.5 : 1) * p.formReiatsu(), true);
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
    for (const ln of this.lanterns) if (!sw.lit && Phaser.Geom.Intersects.RectangleToRectangle(r, ln.rect)) { sw.lit = true; this.lightLanterns(ln); }
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
      if (this.ambience) this.ambience.clearCell(x, y);
      GS.markBroken(this.roomId, x, y);
      this.fx.debris(x * TILE + 8, y * TILE + 8, color, 5);
    });
    Sfx.play('break');
    this.fx.shake(200, 0.01);
    if (index === T.KIDO) this.toast('The Kidō seal shatters.');
    if (index === T.GATE) this.toast('The Senkaimon gate breaks open.');
    if (index === T.CRACK) Sfx.play('pickup');
    GS.save();
    return cells.length;
  }

  castHado(p) {
    const k = p.kidoSize();
    const bolt = new PlayerShot(this, p.x + p.facing * 12, p.body.center.y - 3, 'hado', p.facing * 480, { dmg: COMBAT.hadoDamage * p.spellMul(), life: 1.3 + 0.12 * (k - 1) / 0.25, kind: 'hado', w: 12, h: 12 });
    if (k > 1) bolt.setScale(k);
    Sfx.play('hado');
    this.fx.ring(p.x + p.facing * 10, p.y, 0xff7a4a, 18, 200);
  }

  // Hado #63: a heavy bolt that bursts on the first thing it meets
  castRaiko(p) {
    const shot = new PlayerShot(this, p.x + p.facing * 14, p.body.center.y - 3, 'hado', p.facing * 400, { dmg: COMBAT.raikoDamage * p.spellMul(), life: 1.1, kind: 'raiko', w: 20, h: 20 });
    shot.setScale(2.2 * (1 + 0.2 * GS.upgrade('kidoReach')));
    Sfx.play('hado'); Sfx.play('wave');
    this.fx.ring(p.x + p.facing * 12, p.body.center.y, 0xff4a30, 30, 260, 3);
    this.fx.shake(150, 0.006);
  }
  raikoBlast(x, y, dmg) {
    const R = COMBAT.raikoRadius * (1 + 0.18 * GS.upgrade('kidoReach'));
    this.fx.ring(x, y, 0xff4a30, R * 1.4, 420, 4);
    this.fx.ring(x, y, 0xffffff, R, 260, 2);
    this.fx.burst(x, y, 0xff4a30, 26);
    this.fx.burst(x, y, 0xffd0a0, 14);
    this.fx.impact(x, y, 0, 0xffb070, 14, 40);
    this.fx.flash(0xff6a4a, 160, 0.22);
    this.fx.shake(300, 0.012);
    Sfx.play('break'); Sfx.play('hado');
    this.hitStop(0.08);
    for (const e of this.enemies) {
      if (!e.alive || !e.hittable()) continue;
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) > R + e.body.width / 2) continue;
      if (e.hit(dmg, Math.sign(e.x - x) || 1, { kind: 'raiko', spell: true, knock: true }) === 'hit') {
        this.fx.hit(e.x, e.y, 0, 0xffa060, 1.2);
        if (GS.run.maskOn) GS.run.hollow += 1;
      }
    }
    // Kido seals inside the blast give way
    for (const t of this.solid.getTilesWithinWorldXY(x - R, y - R, R * 2, R * 2, { isNotEmpty: true })) {
      if (t.index === T.KIDO && Phaser.Math.Distance.Between(x, y, t.pixelX + 8, t.pixelY + 8) <= R + 8) { this.breakCluster(t.x, t.y, T.KIDO); break; }
    }
  }

  castGetsuga(p) {
    const edge = GS.upgrade('moonEdge');
    const dmg = (COMBAT.getsugaDamage + GS.swordLevel() * 4) * p.dmgMul() * (1 + 0.25 * edge);
    const crescent = new PlayerShot(this, p.x + p.facing * 18, p.body.center.y - 4, p.bankai ? 'getsuga_b' : 'getsuga', p.facing * 430, { dmg, life: 0.75, kind: 'getsuga', w: 18, h: 44 });
    if (edge) crescent.setScale(1 + 0.2 * edge);
    Sfx.play('wave'); Sfx.play('hado');
    this.fx.shake(140, 0.007);
    this.fx.ring(p.x + p.facing * 16, p.body.center.y, p.bankai ? 0xc8202c : 0x9ac8ff, 26, 260, 2);
  }

  castBakudo(p) {
    const range = 260 + 60 * GS.upgrade('kidoReach');
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
        if (first) GS.addReiatsu(33 + (GS.sealOn('recall') ? 11 : 0));
        this.rememberMemory(e.kind);
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

  // What the dead remember, kept for the old man in Rukongai
  rememberMemory(kind) {
    const d = GS.data;
    if (d.memories[kind]) return;
    d.memories[kind] = true;
    if (d.quests.names === 1 && QUEST_NAMES.need.includes(kind)) {
      const have = QUEST_NAMES.need.filter(k => d.memories[k]).length;
      this.toast(`A memory for the old man in Rukongai (${have}/${QUEST_NAMES.need.length})`);
    }
    GS.save();
  }

  // Talking to someone: the quest giver, people with a gift, Orihime's healing, or plain lines
  talkTo(npc) {
    const d = GS.data, info = npc.info;
    let after = null;
    if (info.heals) {
      const hurt = d.hp < d.maxHp;
      d.hp = d.maxHp;
      this.fx.ring(this.player.x, this.player.y, 0xffb070, 30, 500, 2);
      this.fx.motes(this.player.x, this.player.y, 0xffd0a0, 18);
      if (hurt) Sfx.play('heal');
      GS.save();
    }
    const quest = this.questTalk(npc);
    if (quest) { this.startDialog(info.name, quest.lines, quest.after || null, npc); return; }
    let lines = this.npcLines(info);
    if ((info.gives || info.seal) && !d.gifts[info.name]) {
      d.gifts[info.name] = true;
      if (info.gives) d.abilities[info.gives] = true;
      if (info.seal && !d.seals.includes(info.seal)) d.seals.push(info.seal);
      GS.save();
      if (npc.glow) { this.tweens.killTweensOf(npc.glow); this.tweens.add({ targets: npc.glow, alpha: 0, duration: 600, onComplete: () => npc.glow.destroy() }); }
      after = () => {
        if (info.gives) { Sfx.play('ability'); this.fx.flash(0xffffff, 250, 0.5); this.player.setPose('raise', 1.0); if (info.gives === 'konso') this.enableTrueSight(); }
        else Sfx.play('pickup');
        this.showPopup(info.gives ? { kind: 'ability', id: info.gives } : { kind: 'seal', id: info.seal });
      };
    } else if ((info.gives || info.seal) && info.after) lines = info.after;
    this.startDialog(info.name, lines, after, npc);
  }

  // Quest dialogue for the old man of Junrinan; every other speaker just uses their lines
  npcLines(info) {
    const d = GS.data;
    if (info.name !== QUEST_NAMES.npc) return info.lines;
    const need = QUEST_NAMES.need, have = need.filter(k => d.memories[k]).length, st = d.quests.names || 0;
    if (st === 2) return info.lines.concat(['Thank you again. It is good to hear them, even secondhand. Keep that blade handy.']);
    if (st === 1 && have >= need.length) {
      d.quests.names = 2;
      d.reishi += QUEST_NAMES.reishi;
      if (!d.seals.includes(QUEST_NAMES.seal)) d.seals.push(QUEST_NAMES.seal);
      GS.save();
      this.time.delayedCall(1600, () => { if (this.sys.isActive()) this.showPopup({ kind: 'seal', id: QUEST_NAMES.seal }); });
      return ['A ruffian who wanted one more day. A Shinigami who stayed after the orders stopped. A Hollow who remembers bread.', 'They were people. I knew it. I just needed someone else to know it too.', `Take this. ${QUEST_NAMES.reishi} reishi, and a seal I carried out of the old district. It listens the way you do.`];
    }
    if (st === 1) return [`You have heard ${have} of the ${need.length} I asked for: a ruffian, a corrupted Shinigami, and a Hollow.`, 'Strike each with the hilt and listen. Then come tell me what they said.'];
    if (!GS.has('konso')) return info.lines.concat(['...They say there is a blade that lets you hear the dead. If you ever find it, come back. I have a favour to ask.']);
    d.quests.names = 1;
    GS.save();
    return info.lines.concat(['Wait. That blade at your side, the one that hums. Is it a soul-burier?', 'Then listen for me. Read the memories of a ruffian, a corrupted Shinigami and a Hollow with the Konso hilt, and tell me what they said. I would like to know they were somebody.']);
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
        this.game.events.emit('reishi-get', { x: s.x, y: s.y });
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

  // owner: the enemy swinging it. A box with an owner also hurts the other enemies it touches.
  addHurt(x, y, w, h, dmg, dur, update, owner = null) {
    const hb = { x, y, w, h, dmg, t: dur, update, owner, hit: new Set() };
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
      const rect = new Phaser.Geom.Rectangle(hb.x, hb.y, hb.w, hb.h);
      if (hb.t > 0 && p.state !== 'dead' && Phaser.Geom.Intersects.RectangleToRectangle(pr, rect)) {
        p.takeDamage(hb.dmg, hb.x + hb.w / 2);
      }
      if (hb.t > 0 && hb.owner) this.friendlyHit(rect, hb.owner, FRIENDLY.melee, hb.owner.facing, hb.hit);

    }
    this.hurtBoxes = this.hurtBoxes.filter(hb => hb.t > 0);
  }
  // One enemy's attack landing on another. Bosses are never hurt this way, and each victim is hurt once per `seen`.
  friendlyHit(rect, owner, dmg, dir, seen) {
    // only the nearest enemy in the way is hit: it absorbs the attack, the ones behind it are spared
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e === owner || e.isBoss || !e.alive || !e.hittable() || seen.has(e)) continue;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(rect, bodyRect(e.body))) continue;
      const d = Math.abs(e.x - owner.x);
      if (d < bd) { best = e; bd = d; }
    }
    if (!best) return null;
    seen.add(best);
    if (best.hit(dmg, dir || Math.sign(best.x - owner.x) || 1, { kind: 'enemy', knock: true }) === 'hit') { this.fx.hit(best.x, best.y, dir || 1, 0xff8a6a, 1); Sfx.play('hit'); }
    return best;
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
    } else if (pk.type === 'upgrade') {
      d.upgrades[pk.id] = Math.min(UPGRADES[pk.id].max, GS.upgrade(pk.id) + 1);
      Sfx.play('ability');
      this.fx.flash(0xffe0c0, 220, 0.4);
      GS.save();
      pk.collect();
      p.body.setVelocity(0, p.body.velocity.y);
      p.setPose('raise', 1.0);
      this.showPopup({ kind: 'upgrade', id: pk.id });
    } else if (pk.type === 'seal') {
      if (!d.seals.includes(pk.id)) d.seals.push(pk.id);
      Sfx.play('pickup');
      GS.save();
      pk.collect();
      p.setPose('raise', 0.8);
      this.showPopup({ kind: 'seal', id: pk.id });
    } else if (pk.type === 'petal') {
      d.items.petals = (d.items.petals || 0) + 1;
      Sfx.play('pickup'); Sfx.play('heal');
      GS.save();
      pk.collect();
      this.toast(d.items.petals >= PETALS ? 'The last spirit of Orihime\'s hairpin. Take them home to her, in Las Noches.'
        : `A spirit of Orihime's hairpin (${d.items.petals}/${PETALS}). It clings to you like a frightened petal.`);
    } else if (pk.type === 'item') {
      d.items[pk.id] = true;
      Sfx.play('pickup');
      GS.save();
      pk.collect();
      if (pk.id === 'gikongan') this.toast('Kon\'s spare Gikongan: a green pill in a cracked glass case. Kon will want this.');
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
    GS.data.hp -= GS.lose(1);
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
      // Held keys are ignored for half a second after landing, so holding toward the spikes
      // cannot walk the player straight back into them
      this.inputLock = 0.5;
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
        [T.KIDO]: GS.has('hado') ? Controls.fmt('A violet Kidō seal. Press {kido} to blast it with Shakkahō.') : 'A violet Kidō seal. Only Kidō can shatter it.',
        [T.GATE]: GS.has('burst') ? Controls.fmt('A sealed Senkaimon. Hold {burst}, then release to burst through.') : 'A sealed Senkaimon. It would take a tremendous burst to break.',
        [T.BANKAI]: 'A seal that answers only to Bankai.',
      }[t.index];
      if (msg && !this.hinted[t.index]) { this.hinted[t.index] = true; this.toast(msg); }
    }
    // The seal doors: Bankai opens the old ones; the one into the Inner World answers only to every power at once
    if (this.bankaiCells.length && !this.bankaiOpened) {
      const all = this.def.sealAll, missing = all ? ABILITY_ORDER.filter(a => !GS.has(a)) : [];
      const c = this.bankaiCells.find(cell => this.solid.getTileAt(cell.x, cell.y));
      const near = c && this.bankaiCells.some(cell => Math.abs(p.x - cell.x * TILE) < 6 * TILE && Math.abs(p.y - cell.y * TILE) < 3 * TILE);
      if (near && all && missing.length) {
        if (!this.sealHint || this.time.now - this.sealHint > 7000) {
          this.sealHint = this.time.now;
          this.denied(`The seal refuses you. Powers still missing: ${missing.map(a => ABILITIES[a].name.split(':')[0]).join(', ')}.`);
        }
      } else if (near && (all || GS.has('bankai'))) {
        this.bankaiOpened = true;
        this.breakCluster(c.x, c.y, T.BANKAI);
        Sfx.play('door');
        this.fx.flash(0xc8202c, 200, 0.4);
        this.toast(all ? 'Every power answers. The seal gives way.' : 'The seal recognizes your Bankai.');
      }
    }
  }

  checkBoss() {
    if (!this.boss || this.bossStarted || !this.boss.alive) return;
    const p = this.player;
    if (this.boss.waitsForReveal) {
      if (!this.revealHint && Math.abs(p.x - this.boss.x) < 110) {
        this.revealHint = true;
        this.toast(Controls.fmt('The air here shimmers. Something hides in the dark, watching. Strike it with the Konso hilt ({konso}).'));
      }
      return;
    }
    if (!p.grounded) return;
    const cells = this.lockCells.concat(this.doors);
    const near = cells.some(c => Math.abs(p.x - (c.x * TILE + 8)) < 7 * TILE && Math.abs(p.y - (c.y * TILE + 8)) < 8 * TILE);
    if (!near || GS.rush) this.startBoss();
  }
  startBoss() {
    this.bossStarted = true;
    this.lockedCells = this.lockCells.concat(this.doors.filter(dr => dr.edge === 'left' || dr.edge === 'right'));
    this.lockedCells.forEach(c => { this.solid.putTileAt(T.LOCK, c.x, c.y); this.fx.dust(c.x * TILE + 8, c.y * TILE + 8, 3); });
    Sfx.play('boss');
    Music.setBoss(true);
    this.fx.shake(500, 0.008);
    this.boss.faceTo(this.player.x);
    if (this.boss.intro) this.boss.intro();
    const info = BOSSES[this.boss.id];
    this.game.events.emit('boss-start', { name: info.name, title: info.title, jp: info.jp, notches: info.notches });
    Controls.rumble(500, 0.5, 0.5);
    this.time.delayedCall(1000, () => { if (this.boss && this.boss.alive) this.boss.activate(); });
  }
  onBossDefeated(boss) {
    const d = GS.data;
    this.game.events.emit('boss-end', {});
    Music.setBoss(false);
    this.slowMo(0.25, 1100);
    this.fx.zoomPunch(0.08, 700);
    if (GS.rush) { this.rushNext(); return; }
    // the speedrun split: the first time each boss falls on this journey
    if (!d.bosses[boss.id] && d.splits[boss.id] === undefined) {
      d.splits[boss.id] = d.time;
      const best = GS.bestSplits()[boss.id];
      this.game.events.emit('split', { name: BOSSES[boss.id].name, t: d.time, best });
      GS.recordSplit(boss.id, d.time);
    }
    d.bosses[boss.id] = true;
    if (boss.id === 'urahara') this.uraharaWon();
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
      if (boss.cfg.drop) this.spawnShards(bx, this.arena.floor - 70, Math.round(boss.cfg.drop * GS.dropMul()));
      if (this.player.state === 'normal' && this.player.grounded) this.player.setPose('raise', 1.8);
      this.toast(`Seal capacity grows: ${d.sealSlots} slots`);
      this.spawnReward(bx);
      this.setDarkness(REGIONS[this.region].dark);
    });
  }
  spawnReward(x) {
    if (this.def.rewardItems) {
      const n = this.def.rewardItems.length;
      this.def.rewardItems.forEach((item, i) => {
        const key = this.roomId + ':reward' + i;
        if (GS.isTaken(key)) return;
        const px = x + (i - (n - 1) / 2) * 44;
        const [type, id] = item.startsWith('seal:') ? ['seal', item.slice(5)] : [item, null];
        if (type === 'seal' && GS.data.seals.includes(id)) return;
        const pk = new Pickup(this, px, this.arena.floor - 16, type, id, key);
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

  // ------------------------------------------------------------------ favours
  // What someone with a favour to ask (or to repay) says. Null: they have nothing about it to say now.
  questTalk(npc) {
    const d = GS.data, info = npc.info, q = d.quests;
    const give = (kind, id) => () => { Sfx.play(kind === 'ability' || kind === 'form' ? 'ability' : 'pickup'); this.showPopup({ kind, id }); };
    switch (info.name) {
      case 'Kon': {
        if (q.kon === 2) return { lines: ['Look at me, Ichigo. Still a stuffed lion. But a stuffed lion with a SPARE BODY. That changes everything.'] };
        if (d.items.gikongan) {
          q.kon = 2;
          if (!d.seals.includes('pride')) d.seals.push('pride');
          GS.save();
          return { lines: ['Is that... MY GIKONGAN? You went into the Seireitei for me? Ichigo, I could kiss you. I will not. But I could.',
            'Here. I have been keeping this in my mane for emergencies. It is the pride of a lion: the more beaten you are, the harder you bite.'], after: give('seal', 'pride') };
        }
        if (q.kon === 1) return { lines: ['Any luck? My spare Gikongan. Green, round, locked away under the Fourth Division in the Seireitei. Under! Look down for once!'] };
        if (GS.has('grip')) {
          q.kon = 1; GS.save();
          return { lines: ['Ichigo! You can get into the Seireitei now, right? I need a favour.',
            'The Twelfth Division confiscated my spare Gikongan. My Mod Soul pill! They keep that sort of thing locked up under the Fourth Division, in a hall full of lanterns.',
            'Bring it back and I will give you something good. Lion\'s honour.'] };
        }
        return null;
      }
      case 'Ganju Shiba': {
        if (q.ganju === 2) return { lines: ['Next time I am bringing Bonnie. She is a boar. She bites. Remember that.', 'Hey. Kukaku says hi. She said it with a cannon, but she meant it.'] };
        if (!GS.has('hado')) return null;
        q.ganju = 1;
        return { lines: ['You again! I heard you brought down that Menos in the ravine. That makes you the number two delinquent of West Rukongai.',
          'And number two does not get to walk past number one. Fight me! Right here! Fists, clubs and fireworks!'], after: () => this.startDuel(npc) };
      }
      case 'Orihime Inoue': {
        const n = d.items.petals || 0;
        if (q.orihime === 2) return null;
        if (n >= PETALS) {
          q.orihime = 2; GS.save();
          return { lines: ['My Shun Shun Rikka! Ayame, Shun\'o, Baigon, Hinagiku, Lily... you found every one of them!',
            'Tsubaki is pretending not to care, but he is happy too. Let me thank you properly. Hold still.',
            'Soten Kisshun. I taught your Reiatsu how my flowers mend things. Your wounds will close faster now.'], after: give('perk', 'soten') };
        }
        q.orihime = 1; GS.save();
        return { lines: info.lines.concat([`One more thing, Kurosaki-kun. When they brought me here, the spirits of my hairpin scattered. You have found ${n} of ${PETALS}.`,
          'They look like small pale flowers. They hide where it is hard to reach: in the sky above the dunes, the shrine by the Sokyoku, the forest, the Dangai...']) };
      }
      case 'Kisuke Urahara': {
        if (!info.study) return null;
        if (q.urahara === 2) {
          if (!d.bosses.urahara) {
            // the first time, a warning; the second, the fight
            if (!d.items.uraharaAsked) {
              d.items.uraharaAsked = true; GS.save();
              return { lines: ['Hm? You want the real lesson? Marvellous. Heal up first: I intend to be a little less polite this time.',
                'When you are ready, speak to me again. I will not move until you do. I will fan myself, though.'] };
            }
            return { lines: ['Ready? Splendid. Please try not to dent Tessai\'s ceiling.'], after: () => this.startUraharaFight(npc) };
          }
          return { lines: ['Splendid work earlier! The Kodachi suits you. Short blades, short tempers.', 'The ladder is behind you. Mind the third rung.'] };
        }
        return { lines: ['Now then! A little light exercise before tea. Three waves of opponents, one after the other. Nothing serious.',
          'Beat them all, and I will give that Zanpakuto of yours a new shape. Ready? Of course you are.'], after: () => this.startWaves() };
      }
      case 'Ichibē Hyōsube': {
        if (d.palace < 2) { d.palace = 2; GS.save(); }
        if (d.trueEnding) return { lines: ['You saw it, then. What lies under the last name. Ho! Do not tell me. Some names are better kept.', 'The altar is always open. Bind yourself tighter, if you are bored.'] };
        return null;
      }
    }
    return null;
  }

  // Urahara's light exercise: three waves of foes in the Study Room
  startWaves() {
    const d = GS.data;
    d.quests.urahara = Math.max(d.quests.urahara || 0, 1);
    this.waves = { active: true, i: -1, foes: [], wait: 0.8, list: [['e', 'e', 'i', 'h'], ['g', 'm', 'q', 'b'], ['a', 'x', 'j', 'm', 'q']] };
    this.toast('Wave 1 of 3');
    Sfx.play('boss');
    Music.setBoss(true);
  }
  // Places a standing foe can be put: floor with three tiles of clear air above it, never inside a boulder or a wall
  waveSpots() {
    if (this.waveSpotCache) return this.waveSpotCache;
    const out = [];
    for (let tx = 3; tx < this.W - 3; tx++) {
      for (let ty = 3; ty < this.H - 1; ty++) {
        const x = tx * TILE + 8;
        if (!this.isSolidAt(x, ty * TILE + 8)) continue;
        const clear = [1, 2, 3].every(n => !this.isGroundAt(x, (ty - n) * TILE + 8) && !this.isSpikeAt(x, (ty - n) * TILE + 8));
        if (clear && !this.isSolidAt(x - TILE, (ty - 1) * TILE + 8) && !this.isSolidAt(x + TILE, (ty - 1) * TILE + 8)) out.push({ x, feet: ty * TILE });
        break;   // only the first floor under each column: the open ground, not what lies beneath it
      }
    }
    return (this.waveSpotCache = out);
  }
  updateWaves(dt) {
    const w = this.waves;
    if (!w.active) return;
    const spots = this.waveSpots();
    // A foe that somehow ends up below the ground (or outside the room) is put back on the floor
    w.foes.forEach(e => {
      if (!e.alive || e.cfg.fly) return;
      if (e.y > this.pxH + 8 || e.y < -60 || e.x < 0 || e.x > this.pxW) {
        const sp = Phaser.Utils.Array.GetRandom(spots.filter(s => Math.abs(s.x - this.player.x) > 5 * TILE)) || spots[0];
        if (sp) { e.body.reset(sp.x, sp.feet - e.body.height / 2 - 1); e.body.setVelocity(0, 0); }
      }
    });
    if (w.foes.some(e => e.alive)) return;
    w.wait -= dt;
    if (w.wait > 0) return;
    w.i++;
    if (w.i >= w.list.length) { this.wavesWon(); return; }
    if (w.i > 0) this.toast(`Wave ${w.i + 1} of ${w.list.length}`);
    const kinds = { e: Thug, g: Shinigami, j: Adjuchas, a: Arrancar, q: KidoCaster, i: Crawler, m: Onmitsu, x: Exequias, b: Brawler, h: Hollow };
    const p = this.player;
    const far = spots.filter(s => Math.abs(s.x - p.x) > 7 * TILE);
    const taken = [];
    w.foes = w.list[w.i].map((k) => {
      // spread the foes along the floor: not on top of each other, not next to you
      let pool = far.filter(s => taken.every(t => Math.abs(t - s.x) > 3 * TILE));
      if (!pool.length) pool = far.length ? far : spots;
      const sp = Phaser.Utils.Array.GetRandom(pool);
      taken.push(sp.x);
      const y = k === 'h' ? sp.feet - 90 : sp.feet;
      this.fx.ring(sp.x, y - 12, 0xbfe6ff, 30, 500, 2);
      this.fx.motes(sp.x, y - 12, 0xbfe6ff, 12);
      const e = new kinds[k](this, sp.x, y);
      e.summoned = true;
      return e;
    });
    w.wait = 1.5;
    Sfx.play('door');
  }
  findFloor() {
    const tx = Math.floor(this.player.x / TILE);
    for (let y = Math.floor(this.player.y / TILE); y < this.H; y++) if (this.isSolidAt(tx * TILE + 8, y * TILE + 8)) return y * TILE;
    return this.pxH - 4 * TILE;
  }
  wavesWon() {
    const d = GS.data;
    this.waves.active = false;
    Music.setBoss(false);
    d.quests.urahara = 2;
    d.forms.kodachi = true;
    d.reishi += 200;
    GS.save();
    Sfx.play('pickup');
    this.toast('Urahara applauds with his fan. +200 reishi');
    const urahara = this.interactables.find(it => it.info && it.info.name === 'Kisuke Urahara');
    this.time.delayedCall(900, () => this.startDialog('Kisuke Urahara', ['Bravo, bravo! Not a scratch on the scenery, either. Well, a few scratches.',
      'As promised: hold out your blade. There. Shorter, lighter, quicker. A Kodachi. Change between its shapes at any rest gate.',
      'Now. You did not think the exercise ended with my little menagerie, did you? Heal up. Speak to me again when you want the real lesson.'],
      () => { Sfx.play('ability'); this.showPopup({ kind: 'form', id: 'kodachi' }); }, urahara));
  }

  // The real lesson: Urahara himself, in the Study Room's open floor
  startUraharaFight(npc) {
    const floor = this.arenaFloor || (this.arenaFloor = this.findFloor());
    this.arena = { left: TILE + 8, right: this.pxW - TILE - 8, top: 2 * TILE + 8, floor };
    this.uraharaNpc = npc;
    npc.setVisible(false);
    this.interactables = this.interactables.filter(it => it !== npc);
    // he steps out on the far side of the room from you
    const px = this.player.x, spot = px < this.pxW / 2 ? this.arena.right - 5 * TILE : this.arena.left + 5 * TILE;
    this.boss = new Urahara(this, spot, floor);
    this.boss.facing = px < spot ? -1 : 1;
    this.fx.dust(spot, floor, 10);
    this.startBoss();
  }
  uraharaWon() {
    const d = GS.data, npc = this.uraharaNpc;
    if (npc) { npc.setVisible(true); this.interactables.push(npc); }
    d.reishi += 300;
    d.ore = (d.ore || 0) + 1;
    GS.save();
    this.time.delayedCall(2600, () => {
      this.toast('+300 reishi, +1 reishi ore');
      this.startDialog('Kisuke Urahara', ['Ahh, my back. You know, I really did not expect to need Benihime for that.',
        'Take this ore, and the reishi. Consider it a discount on everything in the shop. Not that I discount anything.',
        'That is the most a teacher can hope for: to be beaten by someone who learned just enough from him. Now go and finish what you started.'], null, npc);
    });
  }

  // Ganju's rematch: he steps out of the crowd and fights for real
  startDuel(npc) {
    npc.setVisible(false);
    this.interactables = this.interactables.filter(it => it !== npc);
    const foe = new GanjuFighter(this, npc.x, npc.y);
    foe.faceTo(this.player.x);
    this.duel = { npc, foe };
    this.fx.dust(npc.x, npc.y, 10);
    Sfx.play('roarSmall');
    Music.setBoss(true);
    this.toast('Ganju wants a fair fight.');
  }
  duelWon(foe) {
    const d = GS.data, npc = this.duel.npc;
    Music.setBoss(false);
    d.quests.ganju = 2;
    if (!d.seals.includes('shiba')) d.seals.push('shiba');
    GS.save();
    npc.setPosition(foe.x, npc.y).setVisible(true);
    this.interactables.push(npc);
    this.duel = null;
    this.time.delayedCall(700, () => this.startDialog('Ganju Shiba', ['Ow. Ow! OW. Fine! You win! Number one is you! Happy?',
      'Here, take this. The crest of the Shiba clan. My sister makes the fireworks; this makes the Kido cheaper. Do not ask how. Nobody knows how.'],
      () => { Sfx.play('pickup'); this.showPopup({ kind: 'seal', id: 'shiba' }); }, npc));
  }

  // ------------------------------------------------------------------ the Royal Guard
  // At 100% a Hell Butterfly brings word from the Soul King Palace
  checkPalace(dt) {
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 1;
    const d = GS.data, p = this.player;
    if (d.palace || GS.rush || this.bossStarted || this.frozen || p.state !== 'normal' || !p.grounded) return;
    if (GS.completion() < 100) return;
    d.palace = 1;
    GS.save();
    const bf = this.add.sprite(p.x - 170, p.y - 100, 'hellfly').play('hellfly:flap').setDepth(27).setScale(1.3);
    Sfx.play('ability');
    this.tweens.add({ targets: bf, x: p.x + p.facing * 12, y: p.y - 24, duration: 1900, ease: 'Sine.inOut', onComplete: () => {
      this.startDialog('Ichibē Hyōsube', [
        'A Hell Butterfly lands on your shoulder. A deep voice laughs out of it.',
        'Ho! This is Ichibe Hyosube, of the Royal Guard. Every power, every seal, every lost soul, every favour asked of you: you have gathered all of it.',
        'Then you have earned a name, and a fight. Come up to the Soul King Palace. Any rest gate will carry you there now.',
        'There is something under the last name you learned. Only those who carry everything to the end ever see it.',
      ], () => {
        this.toast('Rest gates can now carry you to the Soul King Palace.');
        this.tweens.add({ targets: bf, y: bf.y - 140, x: bf.x + 60, alpha: 0, duration: 2000, onComplete: () => bf.destroy() });
      }, { texture: { key: 'npc_ichibe' } });
    } });
  }

  // ------------------------------------------------------------------ the trials of the palace
  bossRoom(id) { return Object.keys(ROOMS).find(r => ROOMS[r].boss === id); }
  // mode 'gauntlet' (every boss in order) or 'single' (one boss); bind: the bindings chosen
  startTrial(mode, list, bind) {
    GS.startRush(mode, list, bind);
    this.transitioning = false;
    this.goTo(this.bossRoom(list[0]), { spawn: 'rush' });
  }
  rushNext() {
    const r = GS.rush, done = r.i;
    r.i++;
    if (r.i >= r.list.length) { this.time.delayedCall(2800, () => this.finishTrial(true)); return; }
    const rest = r.mode === 'gauntlet' && RUSH_RESTS.includes(done);
    this.time.delayedCall(2000, () => {
      if (!this.sys.isActive() || !GS.rush) return;
      if (rest) {
        GS.data.hp = GS.data.maxHp;
        Sfx.play('save');
        this.fx.ring(this.player.x, this.player.y, 0xffe8b0, 40, 600, 2);
        this.fx.motes(this.player.x, this.player.y, 0xffe8b0, 20);
        this.toast('A moment\'s respite. Your wounds close.');
      }
      this.toast(`Next: ${BOSSES[r.list[r.i]].name}  (${r.i + 1} of ${r.list.length})`);
    });
    this.time.delayedCall(rest ? 4600 : 3600, () => {
      if (!this.sys.isActive() || !GS.rush) return;
      this.transitioning = false;
      this.goTo(this.bossRoom(r.list[r.i]), { spawn: 'rush' });
    });
  }
  // The trial is over. Won as a whole: the true ending. Won as a duel: back to the palace. Lost: the same.
  finishTrial(won) {
    const r = GS.rush;
    if (!r) return;
    const info = { mode: r.mode, t: r.t, bind: Object.assign({}, r.bind), list: r.list.slice() };
    const res = GS.endRush(won);
    if (won && info.mode === 'gauntlet') {
      GS.data.trueEnding = true;
      GS.save();
      this.cameras.main.fadeOut(1800, 255, 255, 255);
      this.cameras.main.once('camerafadeoutcomplete', () => { this.scene.stop('ui'); this.scene.start('trueEnding', Object.assign(info, res)); });
      return;
    }
    if (won) {
      const n = BINDING_ORDER.filter(k => info.bind[k]).length;
      this.toast(`${BOSSES[info.list[0]].name} falls again: ${fmtClock(info.t, true)}${n ? `, bound ${n} way${n > 1 ? 's' : ''}` : ''}${res.newBest ? '. A new record.' : ''}`);
    }
    this.transitioning = false;
    this.goTo('palace', { spawn: 'rest' });
  }

  // ------------------------------------------------------------------ the land itself
  // Quicksand and spirit pressure around the player's body, read before the player moves
  senseEnv() {
    const p = this.player, b = p.body;
    p.env.sand = !!this.sandLayer.getTileAtWorldXY(b.center.x, b.bottom - 2);
    p.env.pressure = !!this.pressure && this.pressureAt(b.center.x, b.center.y);
  }
  pressureAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H && this.pressure[ty * this.W + tx] === 1;
  }
  updateEnv(dt) {
    const p = this.player, b = p.body;
    if (p.state === 'dead' || this.respawning || this.transitioning) return;
    // Quicksand holds you up a little and pulls you down slowly; go under and it spits you back out
    if (p.env.sand && p.state !== 'dash') {
      if (b.velocity.y > 22) b.velocity.y = 22;
      const t = this.sandLayer.getTileAtWorldXY(b.center.x, b.bottom - 2);
      let top = t.y;
      while (top > 0 && this.sandLayer.getTileAt(t.x, top - 1)) top--;
      if (Math.random() < dt * 10) this.fx.dust(p.x + Phaser.Math.Between(-5, 5), top * TILE + 1, 1);
      if (b.top > top * TILE + 2) { this.toast('The sand swallows you whole.'); this.onSpike(); return; }
    }
    // Spirit pressure drains the vessel; with nothing left to push back, it crushes
    if (p.env.pressure) {
      GS.addReiatsu(-9 * dt);
      if (Math.random() < dt * 14) this.fx.motes(p.x + Phaser.Math.Between(-8, 8), p.y - 14, 0xd04060, 1);
      this.pressureT += dt;
      if (GS.data.reiatsu <= 0 && this.pressureT > 2.2) { this.pressureT = 0; p.takeDamage(1, p.x, { noKnock: true }); }
    } else this.pressureT = Math.min(this.pressureT, 1.2);
  }
  // The heavy air is drawn as a dark red haze that breathes, with motes sinking through it
  buildPressure() {
    const g = this.add.graphics().setDepth(23).setBlendMode('MULTIPLY');
    const glow = this.add.graphics().setDepth(23).setBlendMode('ADD');
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      if (!this.pressure[y * this.W + x]) continue;
      g.fillStyle(0xb06080, 1).fillRect(x * TILE, y * TILE, TILE, TILE);
      if (!this.pressure[(y - 1) * this.W + x]) glow.fillStyle(0xff6080, 0.35).fillRect(x * TILE, y * TILE, TILE, 2);
    }
    this.tweens.add({ targets: g, alpha: 0.7, yoyo: true, repeat: -1, duration: 1300, ease: 'Sine.inOut' });
    let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
    for (let i = 0; i < this.pressure.length; i++) if (this.pressure[i]) { const x = i % this.W, y = (i - x) / this.W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    this.add.particles(0, 0, 'dot', {
      x: { min: x0 * TILE, max: (x1 + 1) * TILE }, y: { min: y0 * TILE, max: (y1 + 1) * TILE }, speedY: { min: 30, max: 70 },
      lifespan: 1400, scale: { start: 0.5, end: 0 }, alpha: { start: 0.5, end: 0 }, frequency: Math.round(70 / Settings.get('particles')), tint: 0xff7090, blendMode: 'ADD',
    }).setDepth(23);
  }

  // Strike a lantern: every lantern in the room lights, the gold barriers open and the blue walls rise
  lightLanterns(src) {
    const fresh = this.litT <= 0;
    this.litT = LANTERN_TIME;
    this.litTick = 1;
    this.lanterns.forEach(l => l.setLit(true));
    this.fx.ring(src.x, src.y, 0xffd870, 30, 400, 2);
    this.fx.motes(src.x, src.y - 4, 0xffd870, 10);
    Sfx.play('hado');
    if (!fresh) return;
    this.barriers.gold.forEach(c => { this.solid.removeTileAt(c.x, c.y); this.fx.motes(c.x * TILE + 8, c.y * TILE + 8, 0xffd870, 2); });
    this.barriers.blue.forEach(c => { if (!this.overlapsPlayer(c)) this.solid.putTileAt(T.LIGHT, c.x, c.y).setCollision(true); });
    Sfx.play('door');
  }
  overlapsPlayer(c) {
    const b = this.player.body;
    return b.right > c.x * TILE && b.left < (c.x + 1) * TILE && b.bottom > c.y * TILE && b.top < (c.y + 1) * TILE;
  }
  updateLanterns(dt) {
    if (this.litT <= 0) return;
    this.litT -= dt;
    this.litTick -= dt;
    // the flame ticks down, faster at the end, and the barriers flicker before they return
    if (this.litTick <= 0) { this.litTick = this.litT < 2 ? 0.25 : 1; Sfx.play(this.litT < 2 ? 'select' : 'telegraph'); }
    if (this.litT < 2) this.lanterns.forEach(l => l.setAlpha(0.6 + 0.4 * Math.abs(Math.sin(this.litT * 12))));
    if (this.litT > 0) return;
    // A barrier never closes on the player: it waits for them to step out of it
    if (this.barriers.gold.some(c => this.overlapsPlayer(c))) { this.litT = 0.1; return; }
    this.lanterns.forEach(l => { l.setLit(false); l.setAlpha(1); });
    this.barriers.gold.forEach(c => this.solid.putTileAt(T.BARRIER, c.x, c.y).setCollision(true));
    this.barriers.blue.forEach(c => { this.solid.removeTileAt(c.x, c.y); this.fx.motes(c.x * TILE + 8, c.y * TILE + 8, 0x9ad8ff, 1); });
    if (this.player.state === 'cling' && !this.player.touchingWall(this.player.wallDir)) this.player.exitCling();
    Sfx.play('door');
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
      GS.data.hp -= GS.lose(1);
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
    this.cameras.main.fadeOut(150, ...this.regionTint((ROOMS[room] || this.def).region));
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
    this.toast(`A lost soul crosses over to Soul Society (${d.pluses}/${GS.totals().pluses}). +60 reishi`);
    if (d.pluses === 2) { d.sealSlots++; this.toast('Gratitude of the departed: +1 seal slot'); }
    if (d.pluses === GS.totals().pluses) { d.sealSlots++; d.reishi += 300; this.toast('Every lost soul is home. +1 seal slot, +300 reishi'); }
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
    if (GS.rush) { this.trialDeath(); return; }
    if (this.waves) Music.setBoss(false);
    d.deaths++;
    Sfx.play('die');
    this.fx.shake(500, 0.01);
    this.fx.burst(p.x, p.y, 0x17161f, 30);
    this.fx.burst(p.x, p.y, 0xf4f1ea, 16);
    this.game.events.emit('prompt', null);
    this.game.events.emit('boss-end', { silent: true });
    this.game.events.emit('died');
    Music.setBoss(false);
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

  // Falling in a trial ends it: the real save comes back and you wake in the palace
  trialDeath() {
    const p = this.player;
    Sfx.play('die');
    this.fx.shake(500, 0.01);
    this.fx.burst(p.x, p.y, 0x17161f, 30);
    this.fx.burst(p.x, p.y, 0xf2d68a, 16);
    this.game.events.emit('prompt', null);
    this.game.events.emit('boss-end', { silent: true });
    this.game.events.emit('died');
    Music.setBoss(false);
    this.transitioning = true;
    const r = GS.rush, reached = r.i, total = r.list.length;
    this.time.delayedCall(1300, () => {
      GS.endRush(false);
      GS.data.hp = GS.data.maxHp;
      this.game.events.emit('toast', total > 1 ? `The trial ends at ${reached + 1} of ${total}. The altar will be there when you are ready.` : 'The duel is lost. The altar will be there when you are ready.');
      this.cameras.main.fadeOut(700, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart({ room: 'palace', spawn: 'rest', wake: true }));
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
  // after: runs once the last line is read. speaker: drawn as the portrait.
  startDialog(name, lines, after = null, speaker = null) {
    this.freeze(true);
    const portrait = speaker ? { key: speaker.texture.key, frame: 'idle0', creature: !!NPC_CREATURE[speaker.texture.key] } : null;
    this.game.events.emit('dialog', { name, portrait, lines: lines.map(l => Controls.fmt(l)), onClose: () => { this.freeze(false); if (after) after(); } });
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
