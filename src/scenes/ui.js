'use strict';
// ---------------------------------------------------------------------------
// UIScene: HUD + overlays drawn at 1:1 resolution above the zoomed world.
// It polls GS every frame and listens to game.events for one-off messages.
// The look is ink and brush: dark washes behind the HUD, crimson strokes under
// titles, and the Japanese name of every place and every boss.
// ---------------------------------------------------------------------------

const INK = '#e9e4d8', MUTED = '#9a94a8', CRIMSON = '#d8343f', GOLD = '#d9b35a';
// h:mm:ss, or m:ss.t when tenths are wanted and the time is under an hour
function fmtClock(t, tenths = false) {
  t = Math.max(0, t || 0);
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t % 60);
  if (tenths && !h) return `${m}:${String(s).padStart(2, '0')}.${Math.floor((t * 10) % 10)}`;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
// The kanji shown faintly behind each release banner
const BANNER_KANJI = { BANKAI: '卍解', 'RESURRECCIÓN': '帰刃', UNLEASHED: '剣八' };

class UIScene extends Phaser.Scene {
  constructor() { super('ui'); }

  create() {
    this.cache = {};
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0).setScale(ZOOM).setAlpha(0).setDepth(0);
    this.flashRect = this.add.rectangle(0, 0, GAME_W, GAME_H, 0xffffff).setOrigin(0).setAlpha(0).setDepth(100);
    // One red pulse at the edges of the screen when a single mask is left
    this.lowVig = this.add.image(0, 0, 'vignette').setOrigin(0).setScale(ZOOM).setTint(0xd8343f).setAlpha(0).setDepth(1);
    this.lowT = 0; this.beatT = 0;
    // Cinematic bars for boss introductions
    this.barTop = this.add.rectangle(0, -96, GAME_W, 96, 0x000000).setOrigin(0).setDepth(15);
    this.barBottom = this.add.rectangle(0, GAME_H, GAME_W, 96, 0x000000).setOrigin(0).setDepth(15);
    this.vesselFlash = 0; this.prevRei = 0; this.reishiShown = 0; this.bossShake = 0; this.bossNotches = [];

    // HUD: an ink wash, the Reiatsu vessel in a brushed ring, masks on a crimson stroke
    this.ink = this.add.image(8, 2, 'ui_ink').setOrigin(0).setTint(0x05050a).setAlpha(0.62).setDepth(9);
    this.maskStroke = this.add.image(132, 54, 'ui_stroke').setOrigin(0, 0.5).setTint(0xd8343f).setAlpha(0.28).setScale(0.62, 0.62).setDepth(9);
    this.vessel = this.add.graphics().setDepth(10);
    this.ring = this.add.image(76, 72, 'ui_ring').setTint(0xe9e4d8).setScale(0.92).setDepth(11).setAlpha(0.9);
    this.reiLabel = this.add.text(76, 128, '霊圧', { fontFamily: FONT_DISPLAY, fontSize: '13px', fontStyle: '800', color: MUTED }).setOrigin(0.5).setDepth(11).setAlpha(0.8);
    this.masks = [];
    for (let i = 0; i < 14; i++) this.masks.push(this.add.image(152 + i * 30, 52, 'ui_mask').setVisible(false).setDepth(10));
    this.shardIcon = this.add.image(156, 96, 'ui_shard').setScale(0.9).setDepth(10);
    this.reishiText = this.add.text(172, 84, '0', { fontFamily: FONT_BODY, fontSize: '22px', fontStyle: '700', color: INK }).setDepth(10);
    this.oreIcon = this.add.image(0, 96, 'ui_ore').setScale(1.3).setDepth(10).setVisible(false);
    this.oreText = this.add.text(0, 84, '', { fontFamily: FONT_BODY, fontSize: '20px', fontStyle: '700', color: '#c8a8ff' }).setDepth(10).setVisible(false);
    this.bankaiBar = this.add.graphics().setDepth(10);
    this.bankaiLabel = this.add.text(150, 120, '卍解  BANKAI', { fontFamily: FONT_DISPLAY, fontSize: '15px', color: CRIMSON, fontStyle: '800' }).setDepth(10).setVisible(false);

    // Where you are, quietly, in the top right
    this.locKanji = this.add.text(GAME_W - 26, 18, '', { fontFamily: FONT_DISPLAY, fontSize: '22px', fontStyle: '800', color: CRIMSON }).setOrigin(1, 0).setDepth(10).setAlpha(0.85);
    this.locName = this.add.text(GAME_W - 26, 48, '', { fontFamily: FONT_BODY, fontSize: '15px', color: MUTED }).setOrigin(1, 0).setDepth(10).setAlpha(0.85);
    this.locInk = this.add.image(GAME_W + 20, 40, 'ui_ink').setOrigin(1, 0.5).setTint(0x05050a).setAlpha(0.45).setScale(0.75, 0.6).setDepth(9).setFlipX(true);
    // The speedrun timer (a setting) and the split shown when a boss falls; in a trial, the trial's own clock
    this.timerText = this.add.text(GAME_W - 26, 74, '', { fontFamily: FONT_BODY, fontSize: '20px', fontStyle: '700', color: INK }).setOrigin(1, 0).setDepth(10).setVisible(false);
    this.splitText = this.add.text(GAME_W - 26, 100, '', { fontFamily: FONT_BODY, fontSize: '16px', fontStyle: '700', color: INK }).setOrigin(1, 0).setDepth(10).setAlpha(0);
    // The bindings of a trial, as four small kanji under the location
    this.bindText = this.add.text(GAME_W - 26, 126, '', { fontFamily: FONT_DISPLAY, fontSize: '18px', fontStyle: '800', color: GOLD }).setOrigin(1, 0).setDepth(10);

    // Area title: the name, a crimson stroke under it, the kanji large and faint behind
    this.areaKanji = this.add.text(GAME_W / 2, 230, '', { fontFamily: FONT_DISPLAY, fontSize: '170px', fontStyle: '800', color: CRIMSON }).setOrigin(0.5).setAlpha(0).setDepth(19);
    this.areaStroke = this.add.image(GAME_W / 2, 250, 'ui_stroke').setTint(0xd8343f).setAlpha(0).setDepth(19);
    this.areaName = this.add.text(GAME_W / 2, 210, '', { fontFamily: FONT_DISPLAY, fontSize: '68px', fontStyle: '800', color: INK, stroke: '#07070b', strokeThickness: 6 }).setOrigin(0.5).setAlpha(0).setDepth(20);
    this.areaSub = this.add.text(GAME_W / 2, 284, '', { fontFamily: FONT_BODY, fontSize: '22px', color: '#c8c2d4', stroke: '#07070b', strokeThickness: 4 }).setOrigin(0.5).setAlpha(0).setDepth(20);

    // Boss
    this.bossJp = this.add.text(GAME_W / 2, 470, '', { fontFamily: FONT_DISPLAY, fontSize: '30px', fontStyle: '800', color: CRIMSON }).setOrigin(0.5).setAlpha(0).setDepth(20);
    this.bossTitle = this.add.text(GAME_W / 2, 516, '', { fontFamily: FONT_BODY, fontSize: '20px', color: '#c8c2d4' }).setOrigin(0.5).setAlpha(0).setDepth(20);
    this.bossName = this.add.text(GAME_W / 2, 562, '', { fontFamily: FONT_DISPLAY, fontSize: '56px', fontStyle: '800', color: INK, stroke: '#07070b', strokeThickness: 6 }).setOrigin(0.5).setAlpha(0).setDepth(20);
    this.bossStroke = this.add.image(GAME_W / 2, 600, 'ui_stroke').setTint(0xd8343f).setAlpha(0).setDepth(19);
    this.bossBar = this.add.graphics().setDepth(20).setVisible(false);
    this.bossCaps = [this.add.image(0, 0, 'ui_cap'), this.add.image(0, 0, 'ui_cap')].map(c => c.setTint(0xd8343f).setScale(0.6).setDepth(21).setVisible(false));
    this.bossBarName = this.add.text((GAME_W - 640) / 2, GAME_H - 54, '', { fontFamily: FONT_DISPLAY, fontSize: '20px', fontStyle: '700', color: INK }).setOrigin(0, 1).setVisible(false).setDepth(20);
    this.bossBarJp = this.add.text((GAME_W + 640) / 2, GAME_H - 54, '', { fontFamily: FONT_DISPLAY, fontSize: '16px', fontStyle: '800', color: CRIMSON }).setOrigin(1, 1).setVisible(false).setDepth(20);
    this.bossHp = 1; this.bossHpShown = 1;

    // Banner (BANKAI, RESURRECCIÓN): a crimson stroke, a faint kanji, the word
    this.bannerKanji = this.add.text(GAME_W / 2, GAME_H / 2 - 40, '', { fontFamily: FONT_DISPLAY, fontSize: '260px', fontStyle: '800', color: '#ffffff' }).setOrigin(0.5).setAlpha(0).setDepth(59);
    this.bannerStroke = this.add.image(GAME_W / 2, GAME_H / 2 - 36, 'ui_stroke').setAlpha(0).setDepth(59).setScale(2.4, 2.2);
    this.banner = this.add.text(GAME_W / 2, GAME_H / 2 - 40, '', { fontFamily: FONT_DISPLAY, fontSize: '120px', fontStyle: '800', color: CRIMSON, stroke: '#07070b', strokeThickness: 10 }).setOrigin(0.5).setAlpha(0).setDepth(60);
    this.bannerSmall = this.add.text(GAME_W / 2, GAME_H / 2 + 44, '', { fontFamily: FONT_BODY, fontSize: '22px', color: INK, stroke: '#07070b', strokeThickness: 4 }).setOrigin(0.5).setAlpha(0).setDepth(60);

    // Prompt: the key in gold, the action beside it, and a little pointer
    this.prompt = this.add.container(0, 0).setDepth(30).setVisible(false);
    this.promptBg = this.add.graphics();
    this.promptKey = this.add.text(0, 0, '', { fontFamily: FONT_BODY, fontSize: '16px', fontStyle: '700', color: '#07070b' }).setOrigin(0, 0.5);
    this.promptText = this.add.text(0, 0, '', { fontFamily: FONT_BODY, fontSize: '17px', fontStyle: '700', color: INK }).setOrigin(0, 0.5);
    this.prompt.add([this.promptBg, this.promptKey, this.promptText]);
    this.promptTarget = null;

    // Saved: a hell butterfly flutters in the corner
    this.saveFly = this.add.sprite(GAME_W - 46, GAME_H - 62, 'hellfly').play('hellfly:flap').setScale(2.6).setAlpha(0).setDepth(40);
    this.saveText = this.add.text(GAME_W - 70, GAME_H - 62, 'saved', { fontFamily: FONT_BODY, fontSize: '14px', color: MUTED }).setOrigin(1, 0.5).setAlpha(0).setDepth(40);

    // When the soul scatters
    this.deathKanji = this.add.text(GAME_W / 2, GAME_H / 2 - 20, '魂', { fontFamily: FONT_DISPLAY, fontSize: '200px', fontStyle: '800', color: CRIMSON }).setOrigin(0.5).setAlpha(0).setDepth(70);
    this.deathText = this.add.text(GAME_W / 2, GAME_H / 2 + 92, 'Your soul scatters...', { fontFamily: FONT_DISPLAY, fontSize: '30px', fontStyle: '700', color: INK }).setOrigin(0.5).setAlpha(0).setDepth(70);

    this.toasts = [];
    this.buildDialog();
    this.buildPopup();

    this.hint = this.add.text(GAME_W - 24, GAME_H - 20, '', { fontFamily: FONT_BODY, fontSize: '15px', color: MUTED }).setOrigin(1, 1).setAlpha(0.7).setDepth(10);
    const refreshHints = () => {
      this.hint.setText(Touch.enabled ? '' : Controls.fmt('{pause} pause · {map} map · {inventory} inventory'));
      this.dlgMore.setText((Touch.enabled ? 'Tap' : Controls.key('jump')) + ' ▸');
      this.popFoot.setText(Touch.enabled ? 'Tap to continue' : Controls.fmt('Press {jump} to continue'));
      if (this.promptTarget) this.setPrompt({ target: this.promptTarget, text: this.promptLabel });
    };
    refreshHints();
    const offChange = Controls.onChange(refreshHints);

    const ev = this.game.events;
    this.handlers = {
      area: (a) => this.showArea(a),
      room: (id) => this.setLocation(id),
      toast: (m) => this.addToast(m),
      'boss-start': (b) => this.bossStart(b),
      'boss-hp': (v) => { if (v < this.bossHp) this.bossShake = 1; this.bossHp = v; },
      'reishi-get': (f) => this.flyShard(f),
      'boss-end': (o) => this.bossEnd(o),
      dialog: (d) => this.openDialog(d),
      popup: (p) => this.openPopup(p),
      float: (f) => this.addFloat(f),
      dmgnum: (f) => this.addDamageNumber(f),
      prompt: (p) => this.setPrompt(p),
      flash: (f) => this.doFlash(f),
      banner: (b) => this.showBanner(b),
      saved: () => this.showSaved(),
      died: () => this.showDeath(),
      split: (s) => this.showSplit(s),
      'boss-phase': () => { this.bossShake = 1.6; this.bossCaps.forEach(c => { c.setTintFill(0xffffff); this.time.delayedCall(160, () => c.setTint(0xd8343f)); }); },
    };
    Object.entries(this.handlers).forEach(([k, fn]) => ev.on(k, fn));
    const offKey = Controls.on((code) => this.onKey(code));
    // Clicks and taps anywhere continue a dialog or popup
    this.input.on('pointerdown', () => { if (this.popState) this.closePopup(); else if (this.dlgState) this.advanceDialog(); });
    this.events.once('shutdown', () => {
      Object.entries(this.handlers).forEach(([k, fn]) => ev.off(k, fn));
      offKey(); offChange();
    });
    const g = this.scene.get('game');
    if (g && g.roomId) this.setLocation(g.roomId);
  }

  gameCam() {
    const g = this.scene.get('game');
    return g && g.sys.isActive() || (g && g.sys.isPaused()) ? g.cameras.main : null;
  }
  toScreen(x, y) {
    const cam = this.gameCam();
    if (!cam) return { x: -100, y: -100 };
    return { x: (x - cam.worldView.x) * ZOOM, y: (y - cam.worldView.y) * ZOOM };
  }

  // ------------------------------------------------------------------ frame
  update(time, delta) {
    const d = GS.data;
    if (!d) return;
    const dt = delta / 1000;

    const rei = Math.round(d.reiatsu * 2) / 2;
    const bank = GS.run.bankaiT > 0;
    if (d.reiatsu - this.prevRei >= 4) this.vesselFlash = 1;   // a strike landed: the vessel flares
    this.prevRei = d.reiatsu;
    this.vesselFlash = Math.max(0, this.vesselFlash - dt * 4);
    this.drawVessel(rei, bank, time);
    this.ring.setAngle(this.ring.angle + dt * (bank ? 40 : 6)).setTint(bank ? 0xd8343f : 0xe9e4d8);

    if (this.cache.hp !== d.hp || this.cache.maxHp !== d.maxHp) {
      if (this.cache.hp !== undefined && d.hp < this.cache.hp) {
        // i < maxHp: a mask that merely disappears with the max (unequipping a seal) does not break
        for (let i = d.hp; i < this.cache.hp && i < d.maxHp && i < this.masks.length; i++) this.breakMask(this.masks[i], i - d.hp);
      } else if (this.cache.hp !== undefined && d.hp > this.cache.hp) {
        for (let i = this.cache.hp; i < d.hp && i < this.masks.length; i++) this.healMask(this.masks[i], i - this.cache.hp);
      }
      this.cache.hp = d.hp; this.cache.maxHp = d.maxHp;
      this.masks.forEach((m, i) => {
        m.setVisible(i < d.maxHp);
        m.setTexture(i < d.hp ? 'ui_mask' : 'ui_mask_empty');
      });
      this.maskStroke.setScale(Math.max(0.35, Math.min(14, d.maxHp) * 30 / 512 + 0.08), 0.62);
    }
    // Reishi counts up (and down) instead of jumping
    if (this.cache.reishi !== undefined && d.reishi > this.cache.reishi) this.bumpShardIcon();
    this.cache.reishi = d.reishi;
    if (Math.round(this.reishiShown) !== d.reishi) {
      const diff = d.reishi - this.reishiShown;
      this.reishiShown += Math.sign(diff) * Math.min(Math.abs(diff), Math.max(1, Math.abs(diff) * dt * 7));
      this.reishiText.setText(String(Math.round(this.reishiShown)));
    }
    // Reishi ore, once you carry any
    if (this.cache.ore !== (d.ore || 0) || this.cache.reishiW !== this.reishiText.width) {
      this.cache.ore = d.ore || 0; this.cache.reishiW = this.reishiText.width;
      const ox = 172 + this.reishiText.width + 26;
      this.oreIcon.setVisible(this.cache.ore > 0).setX(ox);
      this.oreText.setVisible(this.cache.ore > 0).setX(ox + 12).setText(String(this.cache.ore));
    }

    // One mask left: the screen edges pulse red with a heartbeat
    const game = this.scene.get('game');
    const low = d.hp === 1 && d.maxHp > 1 && game && game.sys.isActive();
    this.lowT += dt;
    this.lowVig.setAlpha(this.lowVig.alpha + ((low ? 0.2 + 0.16 * Math.sin(this.lowT * 5.4) : 0) - this.lowVig.alpha) * Math.min(1, dt * 5));
    if (low) { this.beatT -= dt; if (this.beatT <= 0) { this.beatT = 1.15; Sfx.play('heartbeat'); } } else this.beatT = 0;

    this.bankaiBar.clear();
    this.bankaiLabel.setVisible(bank);
    if (bank) {
      const full = COMBAT.bankaiDuration * (GS.sealOn('gentei') ? COMBAT.genteiMul : 1);
      const w = 200 * Math.min(1, GS.run.bankaiT / full);
      this.bankaiBar.fillStyle(0x07070b, 0.6).fillRect(262, 124, 204, 10);
      this.bankaiBar.fillStyle(0xd8343f, 1).fillRect(264, 126, w, 6);
      this.bankaiBar.fillStyle(0xffffff, 0.35 + 0.35 * Math.sin(time / 90)).fillRect(264 + w - 2, 126, 2, 6);
    }

    // The hollow meter is never drawn as a bar: only the edges of sight redden
    const h = GS.run.hollow || 0;
    const target = Math.pow(Math.min(1, h / 100), 1.6) * 0.85;
    this.vignette.setAlpha(this.vignette.alpha + (target - this.vignette.alpha) * Math.min(1, dt * 4));

    if (this.bossBar.visible) this.drawBossBar(dt);

    const showTimer = Settings.get('timer') || !!GS.rush;
    this.timerText.setVisible(showTimer);
    if (showTimer) this.timerText.setText((GS.rush ? '試  ' : '') + fmtClock(GS.rush ? GS.rush.t : d.time, true));
    const bindKey = GS.rush ? Object.keys(BINDINGS).filter(k => GS.rush.bind[k]).join() : '';
    if (this.cache.bind !== bindKey) {
      this.cache.bind = bindKey;
      this.bindText.setText(bindKey ? bindKey.split(',').map(k => BINDINGS[k].jp).join(' ') : '');
    }

    if (this.promptTarget) {
      if (!this.promptTarget.active) this.setPrompt(null);
      else {
        const t = this.promptTarget, top = t.y - t.displayHeight * t.originY;
        const s = this.toScreen(t.x, Math.max(top, t.y - 60) - 4);
        this.prompt.setPosition(s.x, s.y);
      }
    }

    // toasts stack upward from the bottom-left
    let ty = GAME_H - 58;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.life -= dt;
      const a = Math.min(1, t.life / 0.5, (t.max - t.life) / 0.25);
      t.box.setAlpha(Math.max(0, a));
      t.y += (ty - t.y) * Math.min(1, dt * 12);
      t.x += (24 - t.x) * Math.min(1, dt * 10);
      t.box.setPosition(t.x, t.y);
      ty -= t.h + 8;
      if (t.life <= 0) { t.box.destroy(); this.toasts.splice(i, 1); }
    }
    this.updateDialog(dt);
  }

  // A boss fell: its split against the best ever recorded (green when faster)
  showSplit(s) {
    if (!Settings.get('timer')) return;
    const diff = s.best == null ? '' : `   ${s.t <= s.best ? '−' : '+'}${fmtClock(Math.abs(s.t - s.best), true)}`;
    this.splitText.setText(`${s.name}  ${fmtClock(s.t, true)}${diff}`).setColor(s.best == null ? INK : s.t <= s.best ? '#8af0a0' : '#ff8a92');
    this.tweens.killTweensOf(this.splitText);
    this.splitText.setAlpha(0).setX(GAME_W - 10);
    this.tweens.add({ targets: this.splitText, alpha: 1, x: GAME_W - 26, duration: 300, ease: 'Cubic.out' });
    this.tweens.add({ targets: this.splitText, alpha: 0, delay: 5000, duration: 800 });
  }

  drawBossBar(dt) {
    this.bossHpShown += (this.bossHp - this.bossHpShown) * Math.min(1, dt * 6);
    const W = 640, x = (GAME_W - W) / 2, y = GAME_H - 46;
    this.bossShake = Math.max(0, this.bossShake - dt * 5);
    const ox = (Math.random() - 0.5) * 7 * this.bossShake, oy = (Math.random() - 0.5) * 4 * this.bossShake;
    const g = this.bossBar;
    g.clear();
    g.fillStyle(0x07070b, 0.8).fillRect(x - 4 + ox, y - 4 + oy, W + 8, 18);
    g.lineStyle(1, 0xe9e4d8, 0.25).strokeRect(x - 4.5 + ox, y - 4.5 + oy, W + 9, 19);
    g.fillStyle(0x6a1a20, 1).fillRect(x + ox, y + oy, W * this.bossHpShown, 10);
    g.fillStyle(0xd8343f, 1).fillRect(x + ox, y + oy, W * this.bossHp, 10);
    g.fillStyle(0xff8a92, 0.6).fillRect(x + ox, y + oy, W * this.bossHp, 2);
    if (this.bossShake > 0.2) g.fillStyle(0xffffff, this.bossShake * 0.7).fillRect(x + ox + W * this.bossHp - 3, y + oy, 6, 10);
    // Phase marks: where the fight changes
    this.bossNotches.forEach(n => g.fillStyle(n < this.bossHp ? 0x07070b : 0xe9e4d8, 0.9).fillRect(x + ox + W * n - 1, y + oy - 3, 2, 16));
    this.bossCaps[0].setPosition(x - 10 + ox, y + 5 + oy);
    this.bossCaps[1].setPosition(x + W + 10 + ox, y + 5 + oy);
  }

  // A lost mask splits down the middle: the halves tumble away and fall while bone
  // fragments scatter, and the empty outline pops into the slot they leave behind.
  breakMask(slot, order = 0) {
    const { x, y } = slot, w = slot.width, h = slot.height;
    const delay = order * 90;
    [-1, 1].forEach((dir) => {
      const half = this.add.image(x, y, 'ui_mask').setDepth(11).setTintFill(0xffffff);
      half.setCrop(dir < 0 ? 0 : w / 2, 0, w / 2, h);
      this.time.delayedCall(delay + 70, () => half.clearTint());
      this.tweens.add({ targets: half, x: x + dir * Phaser.Math.Between(12, 20), angle: dir * Phaser.Math.Between(24, 48), duration: 560, delay, ease: 'Quad.out' });
      this.tweens.add({ targets: half, y: y + Phaser.Math.Between(52, 80), duration: 560, delay, ease: 'Quad.in' });
      this.tweens.add({ targets: half, alpha: 0, duration: 260, delay: delay + 300, onComplete: () => half.destroy() });
    });
    for (let i = 0; i < 9; i++) {
      const shard = this.add.image(x, y, 'px').setDepth(11).setTint(i % 3 ? 0xf4f1ea : 0xc8202c).setScale(Phaser.Math.Between(1, 3)).setAlpha(0);
      const a = Phaser.Math.FloatBetween(-Math.PI, 0);
      this.tweens.add({ targets: shard, alpha: { from: 1, to: 0 }, x: x + Math.cos(a) * Phaser.Math.Between(14, 34), y: { value: y + Math.sin(a) * 22 + Phaser.Math.Between(30, 60), ease: 'Quad.in' }, angle: Phaser.Math.Between(-180, 180), duration: Phaser.Math.Between(380, 620), delay, onComplete: () => shard.destroy() });
    }
    this.tweens.add({ targets: slot, scale: { from: 1.35, to: 1 }, duration: 260, delay, ease: 'Back.out' });
  }

  // The vessel is redrawn every frame: the surface ripples, and it glows when something is ready
  // (a heal, Bankai when it is full) and flares when a strike fills it.
  drawVessel(rei, bank, time = 0) {
    const g = this.vessel, cx = 76, cy = 72, r = 44;
    g.clear();
    const frac = rei / COMBAT.maxReiatsu;
    const healCost = COMBAT.spellCost - (GS.sealOn('kaido') ? COMBAT.kaidoDiscount : 0);
    const ready = bank ? 0 : (rei >= COMBAT.maxReiatsu - 0.5 && GS.has('bankai')) ? 2 : rei >= healCost ? 1 : 0;
    if (ready) {
      const pulse = 0.5 + 0.5 * Math.sin(time / (ready === 2 ? 170 : 420)), col = ready === 2 ? 0xd8343f : 0xbfe6ff;
      g.lineStyle(8, col, 0.1 + 0.18 * pulse).strokeCircle(cx, cy, r + 10);
      g.lineStyle(2, col, 0.25 + 0.4 * pulse).strokeCircle(cx, cy, r + 6);
    }
    if (this.vesselFlash > 0) g.lineStyle(9, 0xffffff, this.vesselFlash * 0.45).strokeCircle(cx, cy, r + 4);
    g.fillStyle(0x07070b, 0.7).fillCircle(cx, cy, r + 4);
    const top = cy + r - frac * 2 * r;
    const color = bank ? 0xd8343f : rei >= healCost ? 0xeef2fa : 0x9aa6c0;
    g.fillStyle(color, 1);
    for (let y = Math.ceil(top) + (frac > 0.02 && frac < 0.98 ? 2 : 0); y < cy + r; y += 2) {
      const dy = y - cy, hw = Math.sqrt(Math.max(0, r * r - dy * dy));
      g.fillRect(cx - hw, y, hw * 2, 2);
    }
    // a lighter band near the top of the liquid, and the rippling surface
    if (frac > 0.02 && frac < 0.98) {
      const dy = top - cy, hw = Math.sqrt(Math.max(0, r * r - dy * dy)) - 1;
      g.fillStyle(0xffffff, bank ? 0.15 : 0.35);
      for (let y = Math.ceil(top) + 2; y < Math.min(cy + r, top + 8); y += 2) { const dd = y - cy, w2 = Math.sqrt(Math.max(0, r * r - dd * dd)); g.fillRect(cx - w2, y, w2 * 2, 1); }
      g.lineStyle(2, bank ? 0xff8a92 : 0xffffff, 0.75);
      g.beginPath();
      for (let x = -hw; x <= hw; x += 3) {
        const yy = top + Math.sin(x * 0.2 + time / 240) * 1.6 + Math.sin(x * 0.07 - time / 410) * 1.2 + 1;
        if (x === -hw) g.moveTo(cx + x, yy); else g.lineTo(cx + x, yy);
      }
      g.strokePath();
    }
    // a trial's binding: the vessel above a third is closed off
    const cap = GS.reiCap();
    if (cap < COMBAT.maxReiatsu) {
      const cy2 = cy + r - (cap / COMBAT.maxReiatsu) * 2 * r;
      g.fillStyle(0x07070b, 0.55);
      for (let y = cy - r; y < cy2; y += 2) { const dd = y - cy, w2 = Math.sqrt(Math.max(0, r * r - dd * dd)); g.fillRect(cx - w2, y, w2 * 2, 1); }
      const dy = cy2 - cy, hw = Math.sqrt(Math.max(0, r * r - dy * dy));
      g.lineStyle(2, 0xd9b35a, 0.9).lineBetween(cx - hw, cy2, cx + hw, cy2);
    }
    g.lineStyle(2, bank ? 0xd8343f : 0xe9e4d8, 0.9).strokeCircle(cx, cy, r + 1);
    // where a heal (and Bankai) become possible
    g.lineStyle(1, 0x07070b, 0.55);
    [healCost, healCost * 2].forEach(v => { const y = cy + r - (v / COMBAT.maxReiatsu) * 2 * r; const dy = y - cy, hw = Math.sqrt(Math.max(0, r * r - dy * dy)); g.lineBetween(cx - hw, y, cx + hw, y); });
  }

  // A mask comes back (a heal, or waking at a rest gate): it pops, rings out and sparkles
  healMask(slot, order = 0) {
    const delay = order * 90;
    this.tweens.add({ targets: slot, scale: { from: 1.7, to: 1 }, duration: 320, delay, ease: 'Back.out' });
    const ring = this.add.circle(slot.x, slot.y, 6).setStrokeStyle(2, 0xe8f4ff).setFillStyle().setDepth(11).setAlpha(0);
    this.tweens.add({ targets: ring, radius: 28, alpha: { from: 0.95, to: 0 }, duration: 460, delay, onComplete: () => ring.destroy() });
    for (let i = 0; i < 6; i++) {
      const sp = this.add.image(slot.x, slot.y, 'dot').setDepth(11).setBlendMode('ADD').setTint(0xe8f4ff).setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: sp, alpha: { from: 0.9, to: 0 }, x: slot.x + Phaser.Math.Between(-18, 18), y: slot.y - Phaser.Math.Between(18, 40), scale: 0.1, duration: Phaser.Math.Between(420, 640), delay });
      this.time.delayedCall(delay + 700, () => sp.destroy());
    }
  }

  // A shard of reishi flies from the world to the counter
  flyShard(f) {
    const p = this.toScreen(f.x, f.y);
    const sh = this.add.image(p.x, p.y, 'ui_shard').setScale(0.5).setDepth(12).setAlpha(0.95);
    const mid = { x: (p.x + this.shardIcon.x) / 2 + Phaser.Math.Between(-60, 60), y: Math.min(p.y, this.shardIcon.y) - Phaser.Math.Between(20, 80) };
    const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(p.x, p.y), new Phaser.Math.Vector2(mid.x, mid.y), new Phaser.Math.Vector2(this.shardIcon.x, this.shardIcon.y));
    const o = { t: 0 };
    this.tweens.add({ targets: o, t: 1, duration: Phaser.Math.Between(420, 560), delay: Phaser.Math.Between(0, 140), ease: 'Sine.in',
      onUpdate: () => { const pt = curve.getPoint(o.t); sh.setPosition(pt.x, pt.y).setScale(0.5 + o.t * 0.3).setAngle(o.t * 240); },
      onComplete: () => { sh.destroy(); this.bumpShardIcon(); } });
  }
  bumpShardIcon() {
    this.tweens.killTweensOf(this.shardIcon);
    this.shardIcon.setScale(1.25);
    this.tweens.add({ targets: this.shardIcon, scale: 0.9, duration: 180, ease: 'Quad.out' });
  }

  // ------------------------------------------------------------------ messages
  setLocation(id) {
    const r = ROOMS[id];
    if (!r) return;
    this.locKanji.setText(REGIONS[r.region].kanji || '');
    this.locName.setText(r.name);
    [this.locKanji, this.locName].forEach(t => { this.tweens.killTweensOf(t); t.setAlpha(0); this.tweens.add({ targets: t, alpha: 0.85, duration: 600, delay: 300 }); });
  }
  showArea(a) {
    const parts = [this.areaName, this.areaSub, this.areaKanji, this.areaStroke];
    this.tweens.killTweensOf(parts);
    const big = !a.small;
    this.areaName.setText(a.name).setFontSize(big ? 68 : 40).setY(big ? 210 : 160);
    this.areaSub.setText(a.sub || '').setY(big ? 286 : 200);
    this.areaKanji.setText(big ? (a.kanji || '') : '').setY(big ? 214 : 160);
    parts.forEach(t => t.setAlpha(0));
    const hold = big ? 2000 : 1100;
    this.areaName.setY(this.areaName.y + 10);
    this.tweens.add({ targets: this.areaName, alpha: 1, y: this.areaName.y - 10, duration: 700, ease: 'Cubic.out' });
    this.tweens.add({ targets: this.areaSub, alpha: 1, duration: 700, delay: 250 });
    this.tweens.add({ targets: this.areaKanji, alpha: 0.13, duration: 900 });
    if (big) {
      this.areaStroke.setY(250).setScale(0, 0.5).setAlpha(0.85);
      this.tweens.add({ targets: this.areaStroke, scaleX: Math.max(1, this.areaName.width / 380), duration: 650, delay: 120, ease: 'Cubic.out' });
    }
    this.tweens.add({ targets: parts, alpha: 0, delay: 700 + hold, duration: 800 });
  }
  addToast(msg) {
    if (this.toasts.some(t => t.msg === msg && t.life > 1)) return;
    const text = this.add.text(18, 0, msg, { fontFamily: FONT_BODY, fontSize: '18px', color: INK, wordWrap: { width: 540 }, lineSpacing: 3 }).setOrigin(0, 1);
    const w = text.width + 32, h = text.height + 16;
    const bg = this.add.graphics();
    bg.fillStyle(0x07070b, 0.84).fillRect(0, -h + 8, w, h);
    bg.fillStyle(0xd8343f, 1).fillRect(0, -h + 8, 3, h);
    text.setY(0);
    const box = this.add.container(-60, GAME_H - 40, [bg, text]).setDepth(40).setAlpha(0);
    this.toasts.push({ box, msg, life: 3.8, max: 3.8, y: GAME_H - 40, x: -60, h });
    if (this.toasts.length > 4) { this.toasts[0].box.destroy(); this.toasts.shift(); }
  }
  addFloat(f) {
    const s = this.toScreen(f.x, f.y);
    const t = this.add.text(Phaser.Math.Clamp(s.x, 200, GAME_W - 200), s.y, f.text, {
      fontFamily: FONT_BODY, fontSize: '19px', fontStyle: 'italic', color: f.color || '#cfe8ff', align: 'center',
      stroke: '#07070b', strokeThickness: 4, wordWrap: { width: 380 },
    }).setOrigin(0.5, 1).setDepth(35).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, y: s.y - 16, duration: 300, ease: 'Cubic.out' });
    this.tweens.add({ targets: t, alpha: 0, y: s.y - 46, delay: 2600, duration: 700, onComplete: () => t.destroy() });
  }
  addDamageNumber(f) {
    const s = this.toScreen(f.x, f.y);
    const t = this.add.text(s.x + Phaser.Math.Between(-8, 8), s.y, f.text, { fontFamily: FONT_BODY, fontSize: '22px', fontStyle: '700', color: f.color || '#ffffff', stroke: '#07070b', strokeThickness: 4 })
      .setOrigin(0.5, 1).setDepth(34).setScale(1.4);
    this.tweens.add({ targets: t, y: s.y - 38, scale: 1, duration: 650, ease: 'Cubic.out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 350, duration: 300, onComplete: () => t.destroy() });
  }
  setPrompt(p) {
    if (!p) { this.promptTarget = null; this.prompt.setVisible(false); return; }
    const wasShown = this.prompt.visible;
    this.promptTarget = p.target;
    this.promptLabel = p.text;
    this.promptKey.setText(Controls.key('interact'));
    this.promptText.setText(p.text);
    const kw = this.promptKey.width + 14, tw = this.promptText.width + 18, W = kw + tw, H = 30;
    const g = this.promptBg;
    g.clear();
    g.fillStyle(0x07070b, 0.85).fillRoundedRect(-W / 2, -H - 8, W, H, 6);
    g.fillStyle(0xd9b35a, 1).fillRoundedRect(-W / 2 + 3, -H - 5, kw - 3, H - 6, 4);
    g.fillStyle(0x07070b, 0.85).fillTriangle(-6, -8, 6, -8, 0, -1);
    this.promptKey.setPosition(-W / 2 + 9, -H / 2 - 8);
    this.promptText.setPosition(-W / 2 + kw + 8, -H / 2 - 8);
    this.prompt.setVisible(true);
    if (!wasShown) { this.tweens.killTweensOf(this.prompt); this.prompt.setScale(0.6).setAlpha(0); this.tweens.add({ targets: this.prompt, scale: 1, alpha: 1, duration: 200, ease: 'Back.out' }); }
  }
  doFlash(f) {
    this.flashRect.setFillStyle(f.color, 1).setAlpha(f.alpha);
    this.tweens.killTweensOf(this.flashRect);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: f.ms });
  }
  showBanner(b) {
    const parts = [this.banner, this.bannerSmall, this.bannerKanji, this.bannerStroke];
    this.tweens.killTweensOf(parts);
    const col = Phaser.Display.Color.HexStringToColor(b.color || CRIMSON).color;
    this.banner.setText(b.text).setColor(b.color || CRIMSON).setScale(1.6).setAlpha(0);
    this.bannerSmall.setText(b.small || '').setAlpha(0);
    this.bannerKanji.setText(BANNER_KANJI[b.text] || '').setColor(b.color || CRIMSON).setAlpha(0).setScale(1.3);
    this.bannerStroke.setTint(col).setAlpha(0).setScale(0, 2.2);
    this.tweens.add({ targets: this.bannerStroke, scaleX: 2.4, alpha: 0.5, duration: 280, ease: 'Cubic.out' });
    this.tweens.add({ targets: this.bannerKanji, alpha: 0.14, scale: 1, duration: 500, ease: 'Cubic.out' });
    this.tweens.add({ targets: this.banner, scale: 1, alpha: 1, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: this.bannerSmall, alpha: 1, duration: 300, delay: 200 });
    this.tweens.add({ targets: parts, alpha: 0, delay: 1400, duration: 500 });
  }
  bossStart(b) {
    // the boss's name takes the stage: an area title still showing steps aside
    const area = [this.areaName, this.areaSub, this.areaKanji, this.areaStroke];
    this.tweens.killTweensOf(area);
    this.tweens.add({ targets: area, alpha: 0, duration: 200 });
    const intro = [this.bossTitle, this.bossName, this.bossJp];
    this.bossJp.setText(b.jp || '').setAlpha(0);
    this.bossTitle.setText(b.title).setAlpha(0);
    this.bossName.setText(b.name).setAlpha(0).setScale(1.2);
    this.tweens.add({ targets: intro, alpha: 1, duration: 600, hold: 1600, yoyo: true });
    this.tweens.add({ targets: this.bossName, scale: 1, duration: 600, ease: 'Cubic.out' });
    this.bossStroke.setScale(0, 0.6).setAlpha(0.8);
    this.tweens.add({ targets: this.bossStroke, scaleX: Math.max(1, this.bossName.width / 360), duration: 500, delay: 200, ease: 'Cubic.out', hold: 1500, yoyo: true, onComplete: () => this.bossStroke.setAlpha(0) });
    this.bossHp = 1; this.bossHpShown = 1;
    this.bossNotches = b.notches || [];
    this.tweens.killTweensOf([this.barTop, this.barBottom]);
    this.barTop.setY(-96); this.barBottom.setY(GAME_H);
    this.tweens.add({ targets: this.barTop, y: 0, duration: 450, ease: 'Quad.out', hold: 1900, yoyo: true });
    this.tweens.add({ targets: this.barBottom, y: GAME_H - 96, duration: 450, ease: 'Quad.out', hold: 1900, yoyo: true });
    this.bossBar.setVisible(true);
    this.bossCaps.forEach(c => c.setVisible(true));
    this.bossBarName.setText(b.name).setVisible(true);
    this.bossBarJp.setText(b.jp || '').setVisible(true);
  }
  bossEnd() {
    this.bossBar.setVisible(false).clear();
    this.bossCaps.forEach(c => c.setVisible(false));
    this.bossBarName.setVisible(false);
    this.bossBarJp.setVisible(false);
  }
  showSaved() {
    this.tweens.killTweensOf([this.saveFly, this.saveText]);
    this.saveFly.setAlpha(0).setY(GAME_H - 56);
    this.tweens.add({ targets: [this.saveFly, this.saveText], alpha: { from: 0, to: 0.85 }, duration: 300, hold: 1100, yoyo: true });
    this.tweens.add({ targets: this.saveFly, y: GAME_H - 68, duration: 1700, ease: 'Sine.inOut' });
  }
  showDeath() {
    const parts = [this.deathKanji, this.deathText];
    this.tweens.killTweensOf(parts);
    this.deathKanji.setAlpha(0).setScale(1.3);
    this.deathText.setAlpha(0);
    this.tweens.add({ targets: this.deathKanji, alpha: 0.35, scale: 1, duration: 900, ease: 'Cubic.out' });
    this.tweens.add({ targets: this.deathText, alpha: 1, duration: 700, delay: 400 });
    this.tweens.add({ targets: parts, alpha: 0, delay: 1900, duration: 500 });
  }

  // ------------------------------------------------------------------ dialog
  buildDialog() {
    const W = 960, H = 176, x = (GAME_W - W) / 2, y = GAME_H - H - 36;
    this.dlgBox = { x, y, W, H };
    this.dlg = this.add.container(0, 0).setDepth(50).setVisible(false);
    const bg = this.add.graphics();
    bg.fillStyle(0x07070b, 0.93).fillRect(x, y, W, H);
    bg.lineStyle(1, 0xe9e4d8, 0.3).strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
    bg.fillStyle(0xd8343f, 1).fillRect(x, y, 4, H);
    this.dlgStroke = this.add.image(x + 140, y + 30, 'ui_stroke').setOrigin(0, 0.5).setTint(0xd8343f).setAlpha(0.3).setScale(0.6, 0.5);
    // portrait: the speaker drawn large in a framed window
    this.dlgPortBg = this.add.graphics();
    this.dlgPort = this.add.image(x + 76, y + H / 2, 'ichigo', 'idle0');
    this.dlgName = this.add.text(x + 150, y + 18, '', { fontFamily: FONT_DISPLAY, fontSize: '24px', fontStyle: '800', color: GOLD });
    this.dlgText = this.add.text(x + 150, y + 58, '', { fontFamily: FONT_BODY, fontSize: '21px', color: INK, wordWrap: { width: W - 190 }, lineSpacing: 6 });
    this.dlgMore = this.add.text(x + W - 24, y + H - 16, 'Z ▸', { fontFamily: FONT_BODY, fontSize: '16px', color: MUTED }).setOrigin(1, 1);
    this.dlg.add([bg, this.dlgStroke, this.dlgPortBg, this.dlgPort, this.dlgName, this.dlgText, this.dlgMore]);
    this.dlgState = null;
  }
  openDialog(d) {
    let hash = 0; for (const ch of String(d.name)) hash = (hash * 31 + ch.charCodeAt(0)) % 97;
    this.dlgState = { lines: d.lines, i: 0, shown: 0, onClose: d.onClose, wait: 0.15, pitch: 0.8 + (hash % 6) * 0.09 };
    this.dlgName.setText(d.name);
    this.dlgText.setText('');
    const { x, y, H } = this.dlgBox, g = this.dlgPortBg;
    g.clear();
    const hasPort = !!(d.portrait && this.textures.exists(d.portrait.key));
    const tx = hasPort ? x + 150 : x + 32;
    this.dlgName.setX(tx); this.dlgText.setX(tx).setWordWrapWidth(this.dlgBox.W - (tx - x) - 40);
    this.dlgStroke.setX(tx - 10);
    this.dlgPort.setVisible(hasPort);
    if (hasPort) {
      g.fillStyle(0x16141f, 1).fillRect(x + 18, y + 18, 116, H - 36);
      g.lineStyle(1, 0xd9b35a, 0.6).strokeRect(x + 18.5, y + 18.5, 115, H - 37);
      this.dlgPort.setTexture(d.portrait.key, 'idle0').setFlipX(false);
      if (d.portrait.creature) {
        this.dlgPort.setCrop().setScale(4).setOrigin(0.5).setPosition(x + 76, y + H / 2);
      } else {
        // head and shoulders, found from how tall the character stands in its frame, drawn four times over
        const st = STYLES[d.portrait.key] || STYLE_ICHIGO, top = HF.FEET - st.legLen - st.torsoLen - 15, sc = 4.3, size = 26;
        this.dlgPort.setScale(sc).setOrigin(0).setCrop(HF.HX - 13, top, size, size)
          .setPosition(x + 76 - (HF.HX - 13 + size / 2) * sc, y + H / 2 - (top + size / 2) * sc);
      }
      this.dlgPort.setAlpha(0);
      this.tweens.add({ targets: this.dlgPort, alpha: 1, duration: 220 });
    }
    this.dlg.setVisible(true).setAlpha(0).setY(14);
    this.tweens.add({ targets: this.dlg, alpha: 1, y: 0, duration: 200, ease: 'Cubic.out' });
  }
  updateDialog(dt) {
    const s = this.dlgState;
    if (!s) return;
    s.wait -= dt;
    const line = s.lines[s.i];
    if (s.shown < line.length) {
      const before = Math.floor(s.shown);
      s.shown = Math.min(line.length, s.shown + dt * 55);
      this.dlgText.setText(line.slice(0, Math.floor(s.shown)));
      // a soft blip for every other letter, pitched per speaker
      for (let k = before; k < Math.floor(s.shown); k++) if (k % 2 === 0 && line[k] !== ' ') Sfx.blip(s.pitch);
    }
    this.dlgMore.setAlpha(s.shown >= line.length ? 0.5 + 0.5 * Math.sin(this.time.now / 150) : 0);
  }
  advanceDialog() {
    const s = this.dlgState;
    if (!s || s.wait > 0) return;
    const line = s.lines[s.i];
    if (s.shown < line.length) { s.shown = line.length; this.dlgText.setText(line); return; }
    s.i++;
    Sfx.play('select');
    if (s.i >= s.lines.length) {
      this.dlgState = null;
      this.tweens.add({ targets: this.dlg, alpha: 0, y: 10, duration: 150, onComplete: () => this.dlg.setVisible(false) });
      s.onClose && s.onClose();
      return;
    }
    s.shown = 0;
    this.dlgText.setText('');
  }

  // ------------------------------------------------------------------ popup
  buildPopup() {
    this.pop = this.add.container(GAME_W / 2, GAME_H / 2).setDepth(55).setVisible(false);
    const bg = this.add.graphics();
    bg.fillStyle(0x07070b, 0.95).fillRect(-420, -185, 840, 370);
    bg.lineStyle(1, 0xe9e4d8, 0.3).strokeRect(-419.5, -184.5, 839, 369);
    bg.fillStyle(0xd8343f, 1).fillRect(-420, -185, 840, 3);
    this.popKanji = this.add.text(250, 10, '', { fontFamily: FONT_DISPLAY, fontSize: '230px', fontStyle: '800', color: '#ffffff' }).setOrigin(0.5).setAlpha(0.06);
    this.popGlow = this.add.image(0, -112, 'glow').setBlendMode('ADD').setScale(1.6).setAlpha(0.5);
    this.popIcon = this.add.image(0, -112, 'icon_unknown');
    this.popEyebrow = this.add.text(0, -160, '', { fontFamily: FONT_BODY, fontSize: '15px', fontStyle: '700', color: MUTED, letterSpacing: 4 }).setOrigin(0.5);
    this.popStroke = this.add.image(0, -44, 'ui_stroke').setTint(0xd8343f).setAlpha(0.35).setScale(1.1, 0.8);
    this.popName = this.add.text(0, -50, '', { fontFamily: FONT_DISPLAY, fontSize: '54px', fontStyle: '800', color: INK }).setOrigin(0.5);
    this.popKey = this.add.text(0, 14, '', { fontFamily: FONT_BODY, fontSize: '19px', fontStyle: '700', color: '#07070b', backgroundColor: GOLD, padding: { x: 12, y: 5 } }).setOrigin(0.5);
    this.popDesc = this.add.text(0, 84, '', { fontFamily: FONT_BODY, fontSize: '20px', color: INK, align: 'center', wordWrap: { width: 680 }, lineSpacing: 6 }).setOrigin(0.5);
    this.popFoot = this.add.text(0, 160, 'Press Z to continue', { fontFamily: FONT_BODY, fontSize: '15px', color: MUTED }).setOrigin(0.5);
    this.pop.add([bg, this.popKanji, this.popGlow, this.popIcon, this.popEyebrow, this.popStroke, this.popName, this.popKey, this.popDesc, this.popFoot]);
    this.popState = null;
  }
  openPopup(p) {
    if (p.kind === 'ability') {
      const a = ABILITIES[p.id];
      this.popEyebrow.setText('NEW POWER');
      this.popName.setText(a.name);
      this.popKey.setText(Controls.fmt(a.key)).setVisible(true);
      this.popDesc.setText(Controls.fmt(a.desc));
    } else if (p.kind === 'form') {
      const f = FORMS[p.id];
      this.popEyebrow.setText('ZANPAKUTŌ FORM');
      this.popName.setText(f.name);
      this.popKey.setText('Change forms at any rest gate').setVisible(true);
      this.popDesc.setText(f.desc);
    } else if (p.kind === 'perk') {   // a gift that is always on (Orihime's Sōten Kisshun)
      this.popEyebrow.setText('A GIFT');
      this.popName.setText('Sōten Kisshun');
      this.popKey.setText('Always with you').setVisible(true);
      this.popDesc.setText('Orihime\'s flowers taught your Reiatsu to mend: every heal takes a quarter less time.');
    } else {
      const s = SEALS[p.id];
      this.popEyebrow.setText('ZANPAKUTŌ SEAL');
      this.popName.setText(s.name);
      this.popKey.setText(`Costs ${s.cost} slot${s.cost > 1 ? 's' : ''} · equip it at a rest gate`).setVisible(true);
      this.popDesc.setText(s.desc);
    }
    this.popName.setFontSize(this.popName.text.length > 22 ? 42 : 54);
    this.popKanji.setText(ICON_GLYPH[p.id] || '');
    const col = p.kind === 'seal' ? 0xffd75e : (PICKUP_COLORS[p.id] || 0xffffff);
    this.popIcon.setTexture('icon_' + p.id).setScale(1.2);
    this.popGlow.setTint(col);
    this.pop.setVisible(true).setAlpha(0).setScale(0.95);
    this.tweens.add({ targets: this.pop, alpha: 1, scale: 1, duration: 260, ease: 'Cubic.out' });
    this.tweens.add({ targets: this.popIcon, scale: { from: 0.4, to: 1.2 }, duration: 480, ease: 'Back.out' });
    this.popStroke.setScale(0, 0.8);
    this.tweens.add({ targets: this.popStroke, scaleX: Math.max(1, this.popName.width / 420), duration: 500, delay: 120, ease: 'Cubic.out' });
    this.tweens.killTweensOf(this.popGlow);
    this.tweens.add({ targets: this.popGlow, alpha: { from: 0.7, to: 0.25 }, scale: { from: 2.4, to: 1.7 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const ring = this.add.circle(GAME_W / 2, GAME_H / 2 - 112, 10).setStrokeStyle(3, col).setFillStyle().setDepth(56);
    this.tweens.add({ targets: ring, radius: 120, alpha: { from: 0.9, to: 0 }, duration: 700, ease: 'Cubic.out', onComplete: () => ring.destroy() });
    this.popState = { onClose: p.onClose, t: this.time.now };
  }
  closePopup() {
    const s = this.popState;
    if (!s || this.time.now - s.t < 450) return;
    this.popState = null;
    Sfx.play('confirm');
    this.tweens.add({ targets: this.pop, alpha: 0, scale: 0.97, duration: 180, onComplete: () => this.pop.setVisible(false) });
    s.onClose && s.onClose();
  }

  onKey(code) {
    if (!Controls.isConfirm(code) && !Controls.isBack(code) && code !== 'Space') return;
    if (this.popState) this.closePopup();
    else if (this.dlgState) this.advanceDialog();
  }
}
