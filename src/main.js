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
    scene: [BootScene, TitleScene, GameScene, UIScene, MenuScene, EndingScene],
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
  };
}

// Key legend under the game, rebuilt whenever bindings change
function renderKeyLegend() {
  const el = document.getElementById('keys');
  if (!el) return;
  const items = [
    [`${Controls.key('left')} ${Controls.key('right')}`, 'move'], [Controls.keys('jump'), 'jump'], [Controls.key('attack'), 'slash'],
    [Controls.key('heal'), 'heal (hold)'], [Controls.key('dash'), 'Black Step'], [Controls.key('kido'), `Kido (${Controls.key('up')}+${Controls.key('kido')} Bakudo)`],
    [Controls.key('konso'), 'Konso'], [Controls.key('burst'), 'Burst'], [Controls.key('bankai'), 'Bankai'], [Controls.key('mask'), 'Mask'],
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

(function boot() {
  const fonts = document.fonts
    ? Promise.all([
        document.fonts.load('800 40px "Shippori Mincho B1"'),
        document.fonts.load('400 20px "Zen Kaku Gothic New"'),
        document.fonts.load('700 20px "Zen Kaku Gothic New"'),
      ])
    : Promise.resolve();
  let started = false;
  const go = () => { if (!started) { started = true; startGame(); } };
  fonts.then(go, go);
  setTimeout(go, 2500);
})();
