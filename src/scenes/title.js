'use strict';
// ---------------------------------------------------------------------------
// Boot, title and ending scenes
// ---------------------------------------------------------------------------

class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }
  create() {
    makeAllTextures(this);
    this.scene.start('title');
  }
}

class TitleScene extends Phaser.Scene {
  constructor() { super('title'); }

  create() {
    this.cameras.main.setBackgroundColor('#05050a');
    Music.setRegion('title');
    this.makeTitleArt();
    // sky, moon, drifting cloud streaks, Karakura skyline
    this.add.image(0, 0, 'title_sky').setOrigin(0).setScale(ZOOM);
    this.moonGlow = this.add.image(1080, 178, 'glow').setScale(9).setAlpha(0.12).setTint(0xf3e9d2);
    this.clouds = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'title_clouds').setOrigin(0).setScale(ZOOM).setAlpha(0.9);
    this.city = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'bg_kar_1').setOrigin(0).setScale(ZOOM).setTint(0x6a6488).setAlpha(0.55);
    this.wires = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'bg_kar_2').setOrigin(0).setScale(ZOOM).setTint(0x3a3650);
    this.add.image(0, GAME_H, 'title_shade').setOrigin(0, 1).setScale(ZOOM);
    // reishi rising and wind streaks
    this.add.particles(0, 0, 'dot', {
      x: { min: 0, max: GAME_W }, y: GAME_H + 10, speedY: { min: -50, max: -16 }, speedX: { min: -20, max: 4 },
      lifespan: 10000, scale: { start: 0.9, end: 0.2 }, alpha: { start: 0.55, end: 0 }, frequency: 140, tint: 0xbfe6ff, blendMode: 'ADD',
    });
    this.add.particles(0, 0, 'px', {
      x: GAME_W + 10, y: { min: 380, max: 700 }, speedX: { min: -520, max: -340 }, speedY: { min: -10, max: 10 },
      lifespan: 4000, scaleX: { start: 6, end: 2 }, scaleY: 0.5, alpha: { start: 0.25, end: 0 }, frequency: 200,
    });

    // the rooftop and Ichigo, looking out over the town
    this.add.image(GAME_W, GAME_H, 'title_roof').setOrigin(1, 1).setScale(ZOOM);
    this.hero = this.add.sprite(1036, 596, 'ichigo').setOrigin(0.5, HF.FEET / HF.H).setScale(7).setFlipX(true).setAlpha(0);
    this.hero.play('ichigo:idle');
    this.tweens.add({ targets: this.hero, alpha: 1, y: 590, duration: 1600, delay: 300, ease: 'Cubic.out' });

    // hell butterflies drifting across
    for (let i = 0; i < 4; i++) {
      const bf = this.add.sprite(-40, 200 + i * 90, 'hellfly').play('hellfly:flap').setScale(3).setAlpha(0.9);
      bf.anims.setProgress(Math.random());
      this.flyPath(bf, i);
    }

    // title block: vertical kanji, wordmark, brush underline
    '魂の漂流'.split('').forEach((ch, i) => {
      const t = this.add.text(104, 150 + i * 44, ch, { fontFamily: FONT_DISPLAY, fontSize: '34px', color: '#d8343f', fontStyle: '800' }).setOrigin(0.5, 0).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 500, delay: 200 + i * 120 });
    });
    const title = this.add.text(150, 150, 'SOUL DRIFT', { fontFamily: FONT_DISPLAY, fontSize: '112px', fontStyle: '800', color: INK }).setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, x: 140, duration: 1200, ease: 'Cubic.out' });
    const stroke = this.add.image(132, 296, 'brush').setOrigin(0, 0.5).setScale(0, 0.32).setAlpha(0.95);
    this.tweens.add({ targets: stroke, scaleX: 1.62, duration: 700, delay: 500, ease: 'Cubic.out' });
    this.add.text(146, 326, 'A Bleach metroidvania: Karakura, Soul Society, Hueco Mundo and the world within', { fontFamily: FONT_BODY, fontSize: '19px', color: '#b8b2c4' });

    // menu
    this.hasSave = GS.hasSave();
    this.save = GS.peek();
    this.items = [];
    if (this.hasSave) this.items.push({ label: 'Continue', act: () => this.cont() });
    // A finished journey can be walked again, keeping your powers, against tougher foes
    if (this.save && this.save.cleared) this.items.push({ label: `New Game+${this.save.plus ? ' ' + (this.save.plus + 1) : ''}`, act: () => this.newGamePlus() });
    this.items.push({ label: 'New game', act: () => this.newGame() });
    this.items.push({ label: 'Controls', act: () => this.toggleControls() });
    this.items.push({ label: 'Settings', act: () => { Sfx.play('confirm'); this.scene.launch('menu', { type: 'settings' }); } });
    this.sel = 0;
    this.confirming = false;
    this.selBrush = this.add.image(128, 0, 'brush').setOrigin(0, 0.5).setScale(0.78, 0.62).setAlpha(0.9);
    this.menu = this.items.map((it, i) => {
      const t = this.add.text(156, 422 + i * 58, it.label, { fontFamily: FONT_BODY, fontSize: '28px', color: INK }).setOrigin(0, 0.5).setPadding(0, 12, 260, 12);
      t.setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => { Sfx.init(); if (this.scene.isActive('menu')) return; if (this.sel !== i) this.confirming = false; this.sel = i; this.refresh(); this.items[i].act(); });
      return t;
    });
    this.note = this.add.text(150, 422 + this.items.length * 58 + 10, '', { fontFamily: FONT_BODY, fontSize: '17px', color: GOLD });
    this.keyHint = this.add.text(28, GAME_H - 20, '', { fontFamily: FONT_BODY, fontSize: '15px', color: MUTED }).setOrigin(0, 1).setAlpha(0.8);
    const hint = () => this.keyHint.setText(Touch.enabled ? 'Tap an option to choose' : Controls.fmt('Click the game first · {up} {down} choose · {jump} or Enter confirm'));
    hint();
    const offHint = Controls.onChange(hint);
    this.events.once('shutdown', offHint);

    const off = Controls.on((code) => this.onKey(code));
    this.events.once('shutdown', off);
    this.cameras.main.fadeIn(900, 0, 0, 0);
    this.refresh(false);
  }

  // Generated backdrop pieces for the title screen
  makeTitleArt() {
    if (this.textures.exists('title_sky')) return;
    canvasTex(this, 'title_sky', VIEW_W, VIEW_H, c => {
      const g = c.createLinearGradient(0, 0, 0, VIEW_H);
      g.addColorStop(0, '#05050c'); g.addColorStop(0.55, '#141026'); g.addColorStop(1, '#2c1a34');
      c.fillStyle = g; c.fillRect(0, 0, VIEW_W, VIEW_H);
      const r = seeded(9);
      for (let i = 0; i < 140; i++) { c.fillStyle = `rgba(255,255,255,${(0.15 + r() * 0.6).toFixed(2)})`; c.fillRect(Math.floor(r() * VIEW_W), Math.floor(r() * 220), 1, 1); }
      const h = c.createRadialGradient(540, 89, 46, 540, 89, 124);
      h.addColorStop(0, 'rgba(243,233,210,0.22)'); h.addColorStop(1, 'rgba(243,233,210,0)');
      c.fillStyle = h; c.fillRect(400, 0, 240, 230);
      c.fillStyle = '#f3ead6'; c.beginPath(); c.arc(540, 89, 54, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(200,190,170,0.35)';
      [[522, 76, 9], [558, 104, 6], [566, 70, 4], [524, 110, 5]].forEach(([x, y, rr]) => { c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill(); });
    });
    canvasTex(this, 'title_clouds', VIEW_W, VIEW_H, c => {
      const r = seeded(13);
      for (let i = 0; i < 9; i++) {
        const y = 40 + r() * 150, w = 120 + r() * 200, x = r() * VIEW_W;
        c.fillStyle = `rgba(20,16,34,${(0.45 + r() * 0.35).toFixed(2)})`;
        [-VIEW_W, 0, VIEW_W].forEach(o => { c.beginPath(); c.ellipse(x + o, y, w / 2, 3 + r() * 4, 0, 0, Math.PI * 2); c.fill(); });
      }
    });
    canvasTex(this, 'title_shade', VIEW_W, 120, c => {
      const g = c.createLinearGradient(0, 0, 0, 120);
      g.addColorStop(0, 'rgba(5,5,10,0)'); g.addColorStop(1, 'rgba(5,5,10,0.9)');
      c.fillStyle = g; c.fillRect(0, 0, VIEW_W, 120);
    });
    canvasTex(this, 'title_roof', 300, 70, c => {
      c.fillStyle = '#0c0b13';
      c.beginPath(); c.moveTo(0, 10); c.lineTo(300, 10); c.lineTo(300, 70); c.lineTo(20, 70); c.closePath(); c.fill();
      c.fillStyle = '#2c2a3e'; c.fillRect(0, 9, 300, 2);
      c.fillStyle = '#16141f';
      for (let x = 6; x < 300; x += 10) c.fillRect(x, 13, 6, 3);
      for (let x = 2; x < 300; x += 10) c.fillRect(x, 20, 6, 3);
      c.fillStyle = '#1c1a28'; c.fillRect(220, 0, 8, 10); c.fillRect(216, 0, 16, 2);
    });
  }

  flyPath(bf, i) {
    const y0 = 160 + Math.random() * 360;
    bf.setPosition(-40, y0);
    this.tweens.add({
      targets: bf, x: GAME_W + 60, duration: 14000 + Math.random() * 8000, delay: i * 2600,
      onUpdate: (tw) => { bf.y = y0 + Math.sin(tw.progress * Math.PI * 6 + i) * 34; },
      onComplete: () => this.flyPath(bf, i),
    });
  }

  update(t, d) {
    this.clouds.tilePositionX += d * 0.006;
    this.city.tilePositionX += d * 0.003;
    this.wires.tilePositionX += d * 0.008;
    this.moonGlow.setAlpha(0.1 + Math.sin(t / 1400) * 0.03);
  }

  refresh(animate = true) {
    this.menu.forEach((m, i) => {
      const on = i === this.sel;
      m.setColor(on ? '#ffffff' : '#8a8497').setFontStyle(on ? '700' : 'normal').setFontSize(on ? 30 : 26);
    });
    const y = this.menu[this.sel].y;
    this.selBrush.setY(y + 2);
    if (animate) { this.selBrush.setScale(0.1, 0.62); this.tweens.add({ targets: this.selBrush, scaleX: 0.78, duration: 220, ease: 'Cubic.out' }); }
  }

  onKey(code) {
    Sfx.init();
    if (this.scene.isActive('menu')) return;
    if (Controls.isUp(code)) { this.sel = (this.sel + this.items.length - 1) % this.items.length; this.confirming = false; this.confirmingPlus = false; this.note.setText(''); Sfx.play('select'); this.refresh(); }
    else if (Controls.isDownKey(code)) { this.sel = (this.sel + 1) % this.items.length; this.confirming = false; this.confirmingPlus = false; this.note.setText(''); Sfx.play('select'); this.refresh(); }
    else if (Controls.isConfirm(code) || code === 'Space') this.items[this.sel].act();
  }

  toggleControls() { Sfx.play('confirm'); this.scene.launch('menu', { type: 'controls' }); }

  newGame() {
    if (this.hasSave && !this.confirming) {
      this.confirming = true;
      this.note.setText(Touch.enabled ? 'This overwrites your saved journey. Tap New game again to begin anew.' : Controls.fmt('This overwrites your saved journey. Press {jump} again to begin anew.'));
      Sfx.play('deny');
      return;
    }
    GS.wipe();
    GS.newGame();
    this.begin({ room: 'kar_hub', spawn: 'start' }, 'intro');
  }
  newGamePlus() {
    if (!this.confirmingPlus) {
      this.confirmingPlus = true;
      this.note.setText(Touch.enabled ? 'A new journey with your powers, against tougher foes. Tap again to begin.' : Controls.fmt('A new journey with your powers, against tougher foes. Press {jump} again to begin.'));
      Sfx.play('deny');
      return;
    }
    GS.newGamePlus(this.save);
    GS.save();
    this.begin({ room: 'kar_hub', spawn: 'start' });
  }
  cont() {
    if (!GS.load()) { this.note.setText('The save could not be read. Start a new game.'); return; }
    GS.data.hp = GS.data.maxHp;
    this.begin({ room: GS.data.restRoom || 'kar_hub', spawn: 'rest' });
  }
  begin(entry, via) {
    Sfx.play('confirm');
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (via === 'intro') { this.scene.start('intro', entry); return; }
      this.scene.start('game', entry);
      this.scene.launch('ui');
    });
  }
}

class EndingScene extends Phaser.Scene {
  constructor() { super('ending'); }
  create() {
    const d = GS.data;
    Music.setRegion('end');
    this.cameras.main.setBackgroundColor('#f4f1ea');
    this.cameras.main.fadeIn(1200, 255, 255, 255);
    const lines = [
      'The white one comes apart into drifting reishi, laughing.',
      'For a moment you see your own face in it, unmasked.',
      'Then only the blue sky of the Inner World remains, and the towers right themselves.',
    ];
    lines.forEach((l, i) => {
      const t = this.add.text(GAME_W / 2, 170 + i * 46, l, { fontFamily: FONT_BODY, fontSize: '24px', color: '#17161f' }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, delay: 1200 + i * 1500, duration: 1200 });
    });
    const t = this.add.text(GAME_W / 2, 400, 'SOUL DRIFT', { fontFamily: FONT_DISPLAY, fontSize: '84px', fontStyle: '800', color: '#17161f' }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, delay: 6000, duration: 1500 });
    const m = Math.floor(d.time / 60), s = Math.floor(d.time % 60);
    const stats = this.add.text(GAME_W / 2, 490, `Time ${m}:${String(s).padStart(2, '0')}   ·   ${GS.completion()}% complete   ·   ${d.deaths} deaths`, { fontFamily: FONT_BODY, fontSize: '20px', color: '#5a5668' }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: stats, alpha: 1, delay: 7000, duration: 1200 });
    const foot = this.add.text(GAME_W / 2, 620, (Touch.enabled ? 'Thank you for playing. Tap to return to the title.' : Controls.fmt('Thank you for playing. Press {jump} to return to the title.')), { fontFamily: FONT_BODY, fontSize: '17px', color: '#8a8497' }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: foot, alpha: 1, delay: 8000, duration: 1000 });
    this.time.delayedCall(3000, () => {
      const off = Controls.on((code) => { if (Controls.isConfirm(code)) { off(); this.scene.start('title'); } });
      this.events.once('shutdown', off);
      this.input.once('pointerdown', () => { off(); this.scene.start('title'); });
    });
  }
}


// The opening: three quiet lines on black, with reishi rising, then the town
class IntroScene extends Phaser.Scene {
  constructor() { super('intro'); }
  init(entry) { this.entry = entry || { room: 'kar_hub', spawn: 'start' }; }
  create() {
    Music.setRegion('title');
    this.cameras.main.setBackgroundColor('#05050a');
    this.cameras.main.fadeIn(900, 0, 0, 0);
    this.add.particles(0, 0, 'dot', {
      x: { min: 0, max: GAME_W }, y: GAME_H + 10, speedY: { min: -60, max: -20 }, speedX: { min: -8, max: 8 },
      lifespan: 9000, scale: { start: 0.9, end: 0.2 }, alpha: { start: 0.6, end: 0 }, frequency: 180, tint: 0xbfe6ff, blendMode: 'ADD',
    });
    const lines = [
      'Karakura Town. A quiet night.',
      'You have always seen the ones who never crossed over.',
      'Tonight, one of them sees you back.',
    ];
    this.texts = lines.map((l, i) => {
      const t = this.add.text(GAME_W / 2, GAME_H / 2 - 40 + i * 52, l, { fontFamily: FONT_DISPLAY, fontSize: '32px', fontStyle: '700', color: INK }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, y: t.y - 8, delay: 1200 + i * 2300, duration: 1400, ease: 'Sine.out' });
      return t;
    });
    this.add.graphics().lineStyle(2, 0xd8343f, 1).lineBetween(GAME_W / 2 - 50, GAME_H / 2 - 92, GAME_W / 2 + 50, GAME_H / 2 - 92);
    this.skip = this.add.text(GAME_W - 28, GAME_H - 22, Touch.enabled ? 'Tap to skip' : Controls.fmt('{jump} to skip'), { fontFamily: FONT_BODY, fontSize: '15px', color: MUTED }).setOrigin(1, 1).setAlpha(0.7);
    this.done = false;
    this.time.delayedCall(9800, () => this.finish());
    const off = Controls.on((code) => { if (Controls.isConfirm(code) || Controls.isBack(code)) this.finish(); });
    this.events.once('shutdown', off);
    this.input.once('pointerdown', () => this.finish());
  }
  finish() {
    if (this.done) return;
    this.done = true;
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('game', this.entry);
      this.scene.launch('ui');
    });
  }
}
