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
    scene: [BootScene, TitleScene, IntroScene, GameScene, UIScene, MenuScene, EndingScene],
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
