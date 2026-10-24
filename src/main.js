'use strict';
// ---------------------------------------------------------------------------
// Bootstrap. Waits briefly for the web fonts so canvas text uses them.
// ---------------------------------------------------------------------------

function startGame() {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_W,
    height: GAME_H,
    backgroundColor: '#07070b',
    pixelArt: true,
    roundPixels: true,
    physics: { default: 'arcade', arcade: { gravity: { y: PHYS.gravity }, tileBias: 20, debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { touch: { capture: true }, activePointers: 2 },
    scene: [BootScene, TitleScene, IntroScene, GameScene, UIScene, MenuScene, EndingScene, TrueEndingScene],
  });

  Touch.attach(game);

  // Console helpers for testing:  SD.give('all'), SD.goto('hm_boss'), SD.heal()
  window.SD = {
    game,
    get scene() { return game.scene.getScene('game'); },
    give(...ids) {
      const list = ids[0] === 'all' ? ABILITY_ORDER : ids;
      list.forEach(id => { GS.data.abilities[id] = true; });
      if (list.includes('konso') && this.scene && this.scene.sys.isActive()) this.scene.enableTrueSight();
      GS.data.reiatsu = COMBAT.maxReiatsu;
      return Object.keys(GS.data.abilities);
    },
    goto(room, door) {
      const s = this.scene;
      if (!ROOMS[room]) return 'unknown room: ' + Object.keys(ROOMS).join(', ');
      if (s && s.sys.isActive()) { s.transitioning = false; s.goTo(room, door ? { door } : { spawn: 'rest' }); }
      return room;
    },
    heal() { GS.data.hp = GS.data.maxHp; GS.data.reiatsu = COMBAT.maxReiatsu; },
    // Blows cost nothing while testing (they still knock you back): SD.god(true), and SD.god(false) after
    god(on = true) { GS.god = !!on; return GS.god; },
    rich() { GS.data.reishi += 1000; },
    errors: [],
    // Advance the game by hand, n frames of dt ms (testing in a background tab, where frames stall).
    // each(i) runs before every frame. Errors are collected in SD.errors instead of stopping the loop.
    step(n = 1, dt = 16.67, each) {
      for (let i = 0; i < n; i++) {
        this.t = (this.t || performance.now()) + dt;
        try { if (each) each(i); game.step(this.t, dt); } catch (e) { this.errors.push(String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); return false; }
      }
      return true;
    },
    // Fight a room's boss without playing it: the player stands still (a camper) and cannot be hurt,
    // the boss loses 30% health every `secs` seconds. Reports the phases and the moves it chose.
    bossTest(room, secs = 8) {
      const s = this.scene; s.transitioning = false; s.goTo(room, { spawn: 'rest' });
      this.step(30);
      const g = this.scene, p = g.player, boss = g.boss;
      if (!boss) return { room, err: 'no boss' };
      const cells = g.lockCells.concat(g.doors);
      let spot = null, far = -1;
      for (let x = g.arena.left + 20; x < g.arena.right - 20; x += 8) {
        if (cells.some(c => Math.abs(x - (c.x * TILE + 8)) < 7.5 * TILE && Math.abs(g.arena.floor - 12 - (c.y * TILE + 8)) < 8 * TILE)) continue;
        if (Math.abs(x - boss.x) > far) { far = Math.abs(x - boss.x); spot = x; }
      }
      const keep = () => { p.t.invuln = 1; GS.data.hp = GS.data.maxHp; p.body.reset(spot, p.body.center.y - 2); };
      p.body.reset(spot, g.arena.floor - 12);
      if (boss.waitsForReveal) { this.step(10, 16.67, keep); boss.reveal(); }
      this.step(100, 16.67, keep);
      const moves = {}, phases = [];
      let last = null, closest = Infinity;
      for (let k = 0; k < 4 && boss.alive; k++) {
        this.step(60 * secs, 16.67, () => {
          keep();
          if (boss.alive) closest = Math.min(closest, Math.abs(boss.x - p.x));
          const r = boss.recent[0];
          if (r && r + boss.used[r] !== last) { last = r + boss.used[r]; moves[r] = (moves[r] || 0) + 1; }
        });
        phases.push(boss.phase);
        if (boss.alive) { boss.hp = Math.max(1, boss.hp - boss.maxHp * 0.3); boss.hit(1, 1, {}); }
      }
      if (boss.alive) { boss.hp = 1; boss.hit(5, 1, {}); }
      this.step(120, 16.67, keep);
      return { room, id: boss.id, phases: phases.join(''), moves, closest: Math.round(closest), defeated: !!GS.data.bosses[boss.id], errors: this.errors.splice(0) };
    },
    // Robustness test: a player who presses keys at random (every power, Bankai and the mask now and then) and cannot be hurt,
    // in a room, or against its boss (whose health is knocked down by 30% every 15 s so every phase gets played). Runs without
    // drawing. Returns what happened and any errors thrown while the game ran.
    chaosTest(room, secs = 60) {
      const orig = this.game.scene.render, wasGod = GS.god;
      this.game.scene.render = () => {};
      try {
        this.give('all'); GS.god = true; this.errors.length = 0;
        if (ROOMS[room].boss) { GS.data.bosses[ROOMS[room].boss] = false; GS.data.cleared = false; }   // fight him again
        const s0 = this.scene; s0.transitioning = false; s0.goTo(room, { spawn: 'rest' });
        this.step(40);
        let g = this.scene, p = g.player; const boss = g.boss;
        if (!p) return { room, err: 'no player' };
        let spot = g.pxW / 2;
        if (boss) {   // far from every door and lock, like bossTest
          const cells = g.lockCells.concat(g.doors); let far = -1;
          for (let x = g.arena.left + 20; x < g.arena.right - 20; x += 8) {
            if (cells.some(c => Math.abs(x - (c.x * TILE + 8)) < 7.5 * TILE && Math.abs(g.arena.floor - 12 - (c.y * TILE + 8)) < 8 * TILE)) continue;
            if (Math.abs(x - boss.x) > far) { far = Math.abs(x - boss.x); spot = x; }
          }
          p.body.reset(spot, g.arena.floor - 12);
          if (boss.waitsForReveal) { this.step(10); boss.reveal(); }
          this.step(90);
        }
        const K = (c, on) => { if (on) { if (!Controls.held.has(c)) { Controls.held.add(c); Controls.pressed.add(c); } } else Controls.held.delete(c); };
        const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX', 'KeyC', 'KeyS', 'KeyD', 'KeyV', 'KeyF', 'KeyQ', 'KeyA'];
        const ui = this.game.scene.getScene('ui'), phases = new Set(boss ? [boss.phase] : []);
        let held = new Set(), next = 0, left = 0;
        for (let i = 0; i < secs * 60 && !(boss && !boss.alive) && this.errors.length < 4; i++) {
          if (this.scene !== g) { left++; g = this.scene; p = g.player; if (!p) break; }
          this.step(1, 16.667, () => {
            if (i >= next) {
              next = i + 6 + Math.floor(Math.random() * 30); held = new Set();
              const r = Math.random;
              const d = r() < 0.4 ? 'ArrowLeft' : r() < 0.7 ? 'ArrowRight' : null; if (d) held.add(d);
              [['Space', 0.3], ['ArrowUp', 0.14], ['ArrowDown', 0.14], ['KeyX', 0.7], ['KeyC', 0.18], ['KeyS', 0.15], ['KeyD', 0.04], ['KeyV', 0.05], ['KeyF', 0.05], ['KeyQ', 0.04], ['KeyA', 0.06]]
                .forEach(([k, pr]) => { if (r() < pr) held.add(k); });
              if (r() < 0.05) { GS.data.reiatsu = COMBAT.maxReiatsu; GS.run.primed = true; }   // so Bankai really happens
            }
            keys.forEach(k => K(k, held.has(k)));
            GS.data.hp = GS.data.maxHp;
            if (g.frozen) g.freeze(false);
            if (ui.popState) { ui.popState.t = -1e9; ui.closePopup(); }
            if (ui.dlgState) { ui.dlgState.wait = 0; ui.advanceDialog(); }
            if (this.game.scene.isActive('menu')) this.game.scene.getScene('menu').close();
            if (boss) {
              phases.add(boss.phase);
              if (p.body.center.y > g.arena.floor + 20) p.body.reset(spot, g.arena.floor - 12);
              if (i % 900 === 899 && boss.alive && boss.fighting) { boss.hp = Math.max(1, boss.hp - boss.maxHp * 0.3); boss.hit(1, 1, {}); }
            }
          });
        }
        Controls.releaseAll();
        return { room, boss: boss && boss.id, defeated: boss ? !boss.alive : null, phases: [...phases].join(''), left, errors: this.errors.splice(0, 4) };
      } finally { this.game.scene.render = orig; GS.god = wasGod; Controls.releaseAll(); }
    },
    // Enter every room by each of its doors, its rest gate and its start, step a moment, and list what is wrong: no player,
    // a player inside a wall, or an error. (end_boss door 2 is the rift wall, solid until the Hollow within falls: skipped.)
    sweepRooms(frames = 40) {
      const orig = this.game.scene.render, bad = [], needsBroken = [], keep = JSON.stringify(GS.data.broken);
      this.game.scene.render = () => {};
      // returns what is wrong with arriving this way, or null. A door in the floor of a cracked shaft (hm_1 door 3) only
      // exists once the cracks are broken from above, so it fails with every seal and crack intact.
      const arrive = (room, e) => {
        const s = this.scene; s.transitioning = false; s.scene.restart(Object.assign({ room }, e)); this.step(3);
        const g = this.scene, p = g.player;
        if (!p) return 'no player';
        if ((e.spawn === 'rest' && !g.restGate) || (e.spawn === 'start' && !g.startPos)) return 'skip';
        this.step(frames);
        const g2 = this.scene, p2 = g2.player;   // (a room can send you on at once if the way out is right there)
        if (!p2 || !p2.body || g2.roomId !== room) return `left the room within ${frames} frames`;
        const b = p2.body;
        return [[b.left + 1, b.top + 1], [b.right - 1, b.top + 1], [b.left + 1, b.bottom - 1], [b.right - 1, b.bottom - 1]].some(([x, y]) => g2.isSolidAt(x, y)) ? 'inside a wall' : null;
      };
      const breakAll = () => {
        GS.data.broken = {};
        Object.keys(ROOMS).forEach(id => ROOMS[id].tiles.forEach((row, y) => [...row].forEach((c, x) => { if ('XGOD'.includes(c)) GS.markBroken(id, x, y); })));
      };
      try {
        this.errors.length = 0; let n = 0;
        for (const room of Object.keys(ROOMS)) {
          const entries = Object.keys(ROOMS[room].doors).map(door => ({ door })).concat([{ spawn: 'rest' }, { spawn: 'start' }]);
          for (const e of entries) {
            if (room === 'end_boss' && e.door === '2') continue;   // the rift wall: solid until the Hollow within has fallen
            let why = arrive(room, e);
            if (why === 'skip') continue;
            n++;
            if (why) {
              const sealed = GS.data.broken; breakAll();
              const again = arrive(room, e);
              GS.data.broken = sealed;
              (again ? bad : needsBroken).push(`${room} ${JSON.stringify(e)}: ${why}${again ? ` (and ${again} with every seal and crack broken)` : ''}`);
            }
          }
        }
        return { entries: n, bad, needsBroken, errors: this.errors.splice(0, 5) };
      } finally { this.game.scene.render = orig; GS.data.broken = JSON.parse(keep); }
    },
    // Fight a boss with a scripted player who does nothing but walk up and swing (never dodges, never heals, never
    // casts). Health is topped up after every blow, so what comes back is how fast the sword alone ends the fight
    // (`ttk`, game seconds) and how often the boss lands a blow on someone who does not move out of the way.
    // Used to compare bosses and to check that none of them can be spammed down.
    // With bot: 'reactive' the scripted player also reacts the way a careful one would: it steps back when the boss winds up
    // (after a reaction time), jumps shots and flashes away from blows, then comes back and swings again.
    duelTest(room, { sword = 0, secs = 420, aimUp = true, form = 'zangetsu', bot = 'spam' } = {}) {
      GS.data.swordLevel = sword; GS.data.form = form;
      const bossId = room === 'kar_study' ? 'urahara' : ROOMS[room].boss;
      GS.data.bosses[bossId] = false; GS.data.cleared = false;
      GS.god = false;
      const s0 = this.scene; s0.transitioning = false;
      s0.goTo(room, { spawn: 'rest' });
      this.step(40);
      const g = this.scene, p = g.player;
      if (room === 'kar_study') { GS.data.quests.urahara = 2; g.startUraharaFight(g.interactables.find(it => it.info && it.info.name === 'Kisuke Urahara')); }
      const boss = g.boss;
      if (!boss) return { room, err: 'no boss' };
      const cells = g.lockCells.concat(g.doors);
      let spot = null, far = -1;
      for (let x = g.arena.left + 20; x < g.arena.right - 20; x += 8) {
        if (cells.some(c => Math.abs(x - (c.x * TILE + 8)) < 7.5 * TILE && Math.abs(g.arena.floor - 12 - (c.y * TILE + 8)) < 8 * TILE)) continue;
        if (Math.abs(x - boss.x) > far) { far = Math.abs(x - boss.x); spot = x; }
      }
      p.body.reset(spot, g.arena.floor - 12);
      if (boss.waitsForReveal) { this.step(10); boss.reveal(); }
      GS.data.hp = GS.data.maxHp = 6; GS.data.reiatsu = 0;
      const K = (c, on) => { if (on) { if (!Controls.held.has(c)) { Controls.held.add(c); Controls.pressed.add(c); } } else Controls.held.delete(c); };
      let t = 0, hits = 0, hpPrev = GS.data.hp, swing = 0, lastPhase = 1, reactAt = null, retreat = 0, wasCue = false, away = 1;
      const marks = [];
      const dt = 1 / 60;
      const rr = (o) => new Phaser.Geom.Rectangle(o.x, o.y, o.w, o.h);
      while (boss.alive && t < secs) {
        this.step(1, 16.667, () => {
          const dx = boss.x - p.x, dy = boss.y - p.y;
          if (bot === 'reactive') {
            const cue = boss.poseT > 0.05 && !['idle', 'run', 'walk', 'jump', 'fall', 'hurt', 'guardIdle', 'land', 'fly', 'float'].includes(boss.poseName);
            if (cue && !wasCue && Math.random() < 0.85) reactAt = t + 0.12;
            wasCue = cue;
            if (reactAt !== null && t >= reactAt) { reactAt = null; retreat = 0.9; away = dx > 0 ? -1 : 1; K('KeyC', false); K('KeyC', true); }
            const pr = new Phaser.Geom.Rectangle(p.body.left - 26, p.body.top - 18, p.body.width + 52, p.body.height + 36);
            const danger = g.hurtBoxes.some(h => h.t > 0 && Phaser.Geom.Intersects.RectangleToRectangle(pr, rr(h))) || g.eShots.some(e => e.active && Phaser.Geom.Intersects.RectangleToRectangle(pr, bodyRect(e.body)));
            if (danger && p.grounded && Math.random() < 0.3) { retreat = Math.max(retreat, 0.35); K('Space', false); K('Space', true); }
          }
          if (retreat > 0) {
            retreat -= dt;
            K('ArrowRight', away > 0); K('ArrowLeft', away < 0); K('ArrowUp', false);
            if (retreat <= 0) K('Space', false);
            K('KeyX', false);
          } else {
            K('KeyC', false);
            K('ArrowRight', dx > 26); K('ArrowLeft', dx < -26);
            K('ArrowUp', aimUp && dy < -34 && Math.abs(dx) < 50);
            K('Space', dy < -50 && p.grounded);
            swing -= dt;
            if (swing <= 0 && Math.abs(dx) < 52) { K('KeyX', false); K('KeyX', true); swing = 0.01 + (GS.form().cd * COMBAT.slashCooldown); }
            else if (swing > 0) K('KeyX', false);
          }
          if (GS.data.hp < hpPrev) hits++;
          GS.data.hp = GS.data.maxHp; hpPrev = GS.data.hp;
          GS.data.reiatsu = 0;
          if (boss.phase !== lastPhase) { lastPhase = boss.phase; marks.push(boss.phase + '@' + Math.round(t)); }
          if (g.frozen) { g.freeze(false); }
        });
        t += dt;
      }
      Controls.releaseAll();
      const out = { room, id: boss.id, sword, bot, maxHp: boss.maxHp, ttk: boss.alive ? null : Math.round(t), left: boss.alive ? Math.round(boss.hp / boss.maxHp * 100) + '%' : '0%', hits, perMin: Math.round(hits / Math.max(t, 1) * 60 * 10) / 10, phases: marks.join(' '), errors: this.errors.splice(0) };
      return out;
    },
  };
}

// Key legend under the game, rebuilt whenever bindings change
function renderKeyLegend() {
  const el = document.getElementById('keys');
  if (!el) return;
  const items = [
    [`${Controls.key('left')} ${Controls.key('right')}`, 'move'], [Controls.keys('jump'), 'jump'], [Controls.key('attack'), 'slash'],
    [Controls.key('heal'), 'heal (hold)'], [Controls.key('dash'), 'Shunpo'], [Controls.key('kido'), `Kidō (${Controls.key('up')}+${Controls.key('kido')} Bakudō)`],
    [Controls.key('konso'), 'Konsō'], [Controls.key('burst'), 'Burst'], [Controls.key('bankai'), 'Bankai'], [Controls.key('mask'), 'Mask'],
    [Controls.key('interact'), 'interact'], [`${Controls.key('map')} ${Controls.key('inventory')} ${Controls.key('pause')}`, 'map, inventory, pause'],
  ];
  el.replaceChildren(...items.map(([k, v]) => {
    const span = document.createElement('span');
    const kbd = document.createElement('kbd');
    kbd.textContent = k;
    span.append(kbd, v);
    return span;
  }));
}
renderKeyLegend();
Controls.onChange(renderKeyLegend);

const JAPANESE_TEXT = [...new Set((Object.values(ICON_GLYPH).join('') + Object.values(REGIONS).map(r => r.kanji).join('') +
  Object.values(BOSSES).map(b => b.jp).join('') + Object.values(MENU_KANJI).join('') + Object.values(BANNER_KANJI).join('') +
  Object.values(ELITE_TRAITS).map(t => t.jp).join('') + Object.values(FORMS).map(f => f.jp).join('') +
  Object.values(BINDINGS).map(b => b.jp).join('') + Object.values(DIFFICULTY).map(d => d.jp).join('') + '壱弐参真試旅助記斬魄刀決闘霊王宮勉強部屋卍' +
  '霊圧魂の漂流討浦原商店').split(''))].join('');

(function boot() {
  const fonts = document.fonts
    ? Promise.all([
        document.fonts.load('800 40px "Shippori Mincho B1"'),
        document.fonts.load('400 20px "Zen Kaku Gothic New"'),
        document.fonts.load('700 20px "Zen Kaku Gothic New"'),
        // every kanji and kana the game draws (icons, regions, bosses, menus), so their font
        // subsets are loaded before any text or texture uses them
        document.fonts.load('800 25px "Shippori Mincho B1"', JAPANESE_TEXT),
      ])
    : Promise.resolve();
  let started = false;
  const go = () => { if (!started) { started = true; startGame(); } };
  fonts.then(go, go);
  setTimeout(go, 2500);
})();
