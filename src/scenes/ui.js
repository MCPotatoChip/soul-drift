'use strict';
// ---------------------------------------------------------------------------
// UIScene: HUD + overlays drawn at 1:1 resolution above the zoomed world.
// It polls GS every frame and listens to game.events for one-off messages.
// ---------------------------------------------------------------------------

const INK = '#e9e4d8', MUTED = '#9a94a8', CRIMSON = '#d8343f', GOLD = '#d9b35a';

class UIScene extends Phaser.Scene {
  constructor() { super('ui'); }

  create() {
    this.cache = {};
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0).setScale(ZOOM).setAlpha(0).setDepth(0);
    this.flashRect = this.add.rectangle(0, 0, GAME_W, GAME_H, 0xffffff).setOrigin(0).setAlpha(0).setDepth(100);

    // Reiatsu vessel + HP masks
    this.vessel = this.add.graphics().setDepth(10);
    this.masks = [];
    for (let i = 0; i < 12; i++) this.masks.push(this.add.image(150 + i * 32, 52, 'ui_mask').setVisible(false).setDepth(10));
    this.shardIcon = this.add.image(156, 98, 'ui_shard').setScale(0.9).setDepth(10);
    this.reishiText = this.add.text(172, 86, '0', { fontFamily: FONT_BODY, fontSize: '22px', fontStyle: '700', color: INK }).setDepth(10);
    this.bankaiBar = this.add.graphics().setDepth(10);
    this.bankaiLabel = this.add.text(150, 124, 'BANKAI', { fontFamily: FONT_DISPLAY, fontSize: '15px', color: CRIMSON, fontStyle: '800' }).setDepth(10).setVisible(false);

    // Area title
    this.areaName = this.add.text(GAME_W / 2, 210, '', { fontFamily: FONT_DISPLAY, fontSize: '68px', fontStyle: '800', color: INK }).setOrigin(0.5).setAlpha(0).setDepth(20);
    this.areaSub = this.add.text(GAME_W / 2, 270, '', { fontFamily: FONT_BODY, fontSize: '22px', color: MUTED }).setOrigin(0.5).setAlpha(0).setDepth(20);
    this.areaRule = this.add.graphics().setDepth(20).setAlpha(0);

    // Boss
    this.bossTitle = this.add.text(GAME_W / 2, 520, '', { fontFamily: FONT_BODY, fontSize: '20px', color: MUTED }).setOrigin(0.5).setAlpha(0).setDepth(20);
    this.bossName = this.add.text(GAME_W / 2, 560, '', { fontFamily: FONT_DISPLAY, fontSize: '54px', fontStyle: '800', color: INK }).setOrigin(0.5).setAlpha(0).setDepth(20);
    this.bossBar = this.add.graphics().setDepth(20).setVisible(false);
    this.bossBarName = this.add.text(GAME_W / 2, GAME_H - 64, '', { fontFamily: FONT_DISPLAY, fontSize: '20px', fontStyle: '700', color: INK }).setOrigin(0.5).setVisible(false).setDepth(20);
    this.bossHp = 1; this.bossHpShown = 1;

    // Banner (BANKAI)
    this.banner = this.add.text(GAME_W / 2, GAME_H / 2 - 40, '', { fontFamily: FONT_DISPLAY, fontSize: '120px', fontStyle: '800', color: CRIMSON, stroke: '#07070b', strokeThickness: 10 }).setOrigin(0.5).setAlpha(0).setDepth(60);
    this.bannerSmall = this.add.text(GAME_W / 2, GAME_H / 2 + 40, '', { fontFamily: FONT_BODY, fontSize: '22px', color: INK }).setOrigin(0.5).setAlpha(0).setDepth(60);

    // Prompt
    this.prompt = this.add.text(0, 0, '', { fontFamily: FONT_BODY, fontSize: '18px', fontStyle: '700', color: '#07070b', backgroundColor: INK, padding: { x: 10, y: 4 } }).setOrigin(0.5, 1).setVisible(false).setDepth(30);
    this.promptTarget = null;

    this.toasts = [];
    this.floats = [];
    this.buildDialog();
    this.buildPopup();

    this.hint = this.add.text(GAME_W - 24, GAME_H - 20, '', { fontFamily: FONT_BODY, fontSize: '15px', color: MUTED }).setOrigin(1, 1).setAlpha(0.7).setDepth(10);
    const refreshHints = () => {
      this.hint.setText(Touch.enabled ? '' : Controls.fmt('{pause} pause · {map} map · {inventory} inventory'));
      this.dlgMore.setText((Touch.enabled ? 'Tap' : Controls.key('jump')) + ' ▸');
      this.popFoot.setText(Touch.enabled ? 'Tap to continue' : Controls.fmt('Press {jump} to continue'));
    };
    refreshHints();
    const offChange = Controls.onChange(refreshHints);

    const ev = this.game.events;
    this.handlers = {
      area: (a) => this.showArea(a),
      toast: (m) => this.addToast(m),
      'boss-start': (b) => this.bossStart(b),
      'boss-hp': (v) => { this.bossHp = v; },
      'boss-end': (o) => this.bossEnd(o),
      dialog: (d) => this.openDialog(d),
      popup: (p) => this.openPopup(p),
      float: (f) => this.addFloat(f),
      dmgnum: (f) => this.addDamageNumber(f),
      prompt: (p) => this.setPrompt(p),
      flash: (f) => this.doFlash(f),
      banner: (b) => this.showBanner(b),
    };
    Object.entries(this.handlers).forEach(([k, fn]) => ev.on(k, fn));
    const offKey = Controls.on((code) => this.onKey(code));
    // Touch screens: tap anywhere to continue a dialog or popup
    this.input.on('pointerdown', () => { if (this.popState) this.closePopup(); else if (this.dlgState) this.advanceDialog(); });
    this.events.once('shutdown', () => {
      Object.entries(this.handlers).forEach(([k, fn]) => ev.off(k, fn));
      offKey(); offChange();
    });
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
    if (this.cache.rei !== rei || this.cache.bank !== bank) { this.cache.rei = rei; this.cache.bank = bank; this.drawVessel(rei, bank); }

    if (this.cache.hp !== d.hp || this.cache.maxHp !== d.maxHp) {
      if (this.cache.hp !== undefined && d.hp < this.cache.hp) {
        // i < maxHp: a mask that merely disappears with the max (unequipping a seal) does not break
        for (let i = d.hp; i < this.cache.hp && i < d.maxHp && i < this.masks.length; i++) this.breakMask(this.masks[i], i - d.hp);
      }
      this.cache.hp = d.hp; this.cache.maxHp = d.maxHp;
      this.masks.forEach((m, i) => {
        m.setVisible(i < d.maxHp);
        m.setTexture(i < d.hp ? 'ui_mask' : 'ui_mask_empty');
      });
    }
    if (this.cache.reishi !== d.reishi) { this.cache.reishi = d.reishi; this.reishiText.setText(String(d.reishi)); }

    this.bankaiBar.clear();
    this.bankaiLabel.setVisible(bank);
    if (bank) {
      const w = 200 * (GS.run.bankaiT / COMBAT.bankaiDuration);
      this.bankaiBar.fillStyle(0x07070b, 0.6).fillRect(214, 128, 204, 10);
      this.bankaiBar.fillStyle(0xd8343f, 1).fillRect(216, 130, w, 6);
    }

    // The hollow meter is never drawn as a bar: only the edges of sight redden
    const h = GS.run.hollow || 0;
    const target = Math.pow(Math.min(1, h / 100), 1.6) * 0.85;
    this.vignette.setAlpha(this.vignette.alpha + (target - this.vignette.alpha) * Math.min(1, dt * 4));

    if (this.bossBar.visible) {
      this.bossHpShown += (this.bossHp - this.bossHpShown) * Math.min(1, dt * 6);
      const W = 640, x = (GAME_W - W) / 2, y = GAME_H - 46;
      this.bossBar.clear();
      this.bossBar.fillStyle(0x07070b, 0.75).fillRect(x - 3, y - 3, W + 6, 16);
      this.bossBar.fillStyle(0x6a1a20, 1).fillRect(x, y, W * this.bossHpShown, 10);
      this.bossBar.fillStyle(0xd8343f, 1).fillRect(x, y, W * this.bossHp, 10);
    }

    if (this.promptTarget) {
      if (!this.promptTarget.active) this.setPrompt(null);
      else {
        const s = this.toScreen(this.promptTarget.x, this.promptTarget.y - this.promptTarget.height / 2 - 4);
        this.prompt.setPosition(s.x, s.y);
      }
    }

    // toasts stack upward from the bottom-left
    let ty = GAME_H - 60;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.life -= dt;
      const a = Math.min(1, t.life / 0.5, (3.6 - t.life) / 0.25);
      t.text.setAlpha(Math.max(0, a));
      t.y += (ty - t.y) * Math.min(1, dt * 12);
      t.text.setPosition(28, t.y);
      ty -= t.text.height + 8;
      if (t.life <= 0) { t.text.destroy(); this.toasts.splice(i, 1); }
    }
    this.updateDialog(dt);
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

  drawVessel(rei, bank) {
    const g = this.vessel, cx = 76, cy = 72, r = 46;
    g.clear();
    g.fillStyle(0x07070b, 0.55).fillCircle(cx, cy, r + 6);
    const frac = rei / COMBAT.maxReiatsu;
    const top = cy + r - frac * 2 * r;
    const color = bank ? 0xd8343f : rei >= COMBAT.spellCost ? 0xeef2fa : 0x9aa6c0;
    g.fillStyle(color, 1);
    for (let y = Math.ceil(top); y < cy + r; y += 2) {
      const dy = y - cy, hw = Math.sqrt(Math.max(0, r * r - dy * dy));
      g.fillRect(cx - hw, y, hw * 2, 2);
    }
    g.lineStyle(3, bank ? 0xd8343f : 0xe9e4d8, 1).strokeCircle(cx, cy, r + 2);
    g.lineStyle(1, 0x07070b, 0.5);
    [1, 2].forEach(k => { const y = cy + r - (k * COMBAT.spellCost / COMBAT.maxReiatsu) * 2 * r; const dy = y - cy, hw = Math.sqrt(r * r - dy * dy); g.lineBetween(cx - hw, y, cx + hw, y); });
  }

  // ------------------------------------------------------------------ messages
  showArea(a) {
    this.tweens.killTweensOf([this.areaName, this.areaSub, this.areaRule]);
    this.areaName.setText(a.name).setFontSize(a.small ? 40 : 68).setY(a.small ? 160 : 210);
    this.areaSub.setText(a.sub || '').setY(a.small ? 200 : 270);
    this.areaRule.clear();
    if (!a.small) {
      const w = this.areaName.width / 2 + 40;
      this.areaRule.lineStyle(2, 0xd8343f, 1).lineBetween(GAME_W / 2 - w, 246, GAME_W / 2 - 60, 246).lineBetween(GAME_W / 2 + 60, 246, GAME_W / 2 + w, 246);
    }
    const targets = [this.areaName, this.areaSub, this.areaRule];
    targets.forEach(t => t.setAlpha(0));
    this.tweens.add({ targets, alpha: 1, duration: 700, hold: a.small ? 1100 : 2000, yoyo: true });
  }
  addToast(msg) {
    if (this.toasts.some(t => t.msg === msg && t.life > 1)) return;
    const text = this.add.text(28, GAME_H - 60, msg, {
      fontFamily: FONT_BODY, fontSize: '19px', color: INK, backgroundColor: 'rgba(7,7,11,0.78)', padding: { x: 12, y: 7 },
      wordWrap: { width: 560 },
    }).setOrigin(0, 1).setDepth(40).setAlpha(0);
    this.toasts.push({ text, msg, life: 3.6, y: GAME_H - 40 });
    if (this.toasts.length > 4) { this.toasts[0].text.destroy(); this.toasts.shift(); }
  }
  addFloat(f) {
    const s = this.toScreen(f.x, f.y);
    const t = this.add.text(Phaser.Math.Clamp(s.x, 200, GAME_W - 200), s.y, f.text, {
      fontFamily: FONT_BODY, fontSize: '19px', fontStyle: 'italic', color: f.color || '#cfe8ff', align: 'center',
      stroke: '#07070b', strokeThickness: 4, wordWrap: { width: 380 },
    }).setOrigin(0.5, 1).setDepth(35).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, y: s.y - 16, duration: 300 });
    this.tweens.add({ targets: t, alpha: 0, y: s.y - 46, delay: 2600, duration: 700, onComplete: () => t.destroy() });
  }
  addDamageNumber(f) {
    const s = this.toScreen(f.x, f.y);
    const t = this.add.text(s.x + Phaser.Math.Between(-8, 8), s.y, f.text, { fontFamily: FONT_BODY, fontSize: '22px', fontStyle: '700', color: f.color || '#ffffff', stroke: '#07070b', strokeThickness: 4 })
      .setOrigin(0.5, 1).setDepth(34);
    this.tweens.add({ targets: t, y: s.y - 38, duration: 650, ease: 'Cubic.out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 350, duration: 300, onComplete: () => t.destroy() });
  }
  setPrompt(p) {
    if (!p) { this.promptTarget = null; this.prompt.setVisible(false); return; }
    this.promptTarget = p.target;
    this.prompt.setText(Controls.key('interact') + '  ' + p.text).setVisible(true);
  }
  doFlash(f) {
    this.flashRect.setFillStyle(f.color, 1).setAlpha(f.alpha);
    this.tweens.killTweensOf(this.flashRect);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: f.ms });
  }
  showBanner(b) {
    this.tweens.killTweensOf([this.banner, this.bannerSmall]);
    this.banner.setText(b.text).setColor(b.color || CRIMSON).setScale(1.6).setAlpha(0);
    this.bannerSmall.setText(b.small || '').setAlpha(0);
    this.tweens.add({ targets: this.banner, scale: 1, alpha: 1, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: this.bannerSmall, alpha: 1, duration: 300, delay: 200 });
    this.tweens.add({ targets: [this.banner, this.bannerSmall], alpha: 0, delay: 1300, duration: 500 });
  }
  bossStart(b) {
    this.bossTitle.setText(b.title).setAlpha(0);
    this.bossName.setText(b.name).setAlpha(0);
    this.tweens.add({ targets: [this.bossTitle, this.bossName], alpha: 1, duration: 600, hold: 1600, yoyo: true });
    this.bossHp = 1; this.bossHpShown = 1;
    this.bossBar.setVisible(true);
    this.bossBarName.setText(b.name).setVisible(true);
  }
  bossEnd() {
    this.bossBar.setVisible(false).clear();
    this.bossBarName.setVisible(false);
  }

  // ------------------------------------------------------------------ dialog
  buildDialog() {
    const W = 920, H = 168, x = (GAME_W - W) / 2, y = GAME_H - H - 40;
    this.dlg = this.add.container(0, 0).setDepth(50).setVisible(false);
    const bg = this.add.graphics();
    bg.fillStyle(0x07070b, 0.92).fillRect(x, y, W, H);
    bg.lineStyle(1, 0xe9e4d8, 0.35).strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
    bg.fillStyle(0xd8343f, 1).fillRect(x, y, 4, H);
    this.dlgName = this.add.text(x + 32, y + 20, '', { fontFamily: FONT_DISPLAY, fontSize: '24px', fontStyle: '800', color: GOLD });
    this.dlgText = this.add.text(x + 32, y + 60, '', { fontFamily: FONT_BODY, fontSize: '22px', color: INK, wordWrap: { width: W - 72 }, lineSpacing: 6 });
    this.dlgMore = this.add.text(x + W - 24, y + H - 16, 'Z ▸', { fontFamily: FONT_BODY, fontSize: '16px', color: MUTED }).setOrigin(1, 1);
    this.dlg.add([bg, this.dlgName, this.dlgText, this.dlgMore]);
    this.dlgState = null;
  }
  openDialog(d) {
    this.dlgState = { lines: d.lines, i: 0, shown: 0, onClose: d.onClose, wait: 0.15 };
    this.dlgName.setText(d.name);
    this.dlgText.setText('');
    this.dlg.setVisible(true);
  }
  updateDialog(dt) {
    const s = this.dlgState;
    if (!s) return;
    s.wait -= dt;
    const line = s.lines[s.i];
    if (s.shown < line.length) {
      s.shown = Math.min(line.length, s.shown + dt * 55);
      this.dlgText.setText(line.slice(0, Math.floor(s.shown)));
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
      this.dlg.setVisible(false);
      this.dlgState = null;
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
    bg.fillStyle(0x07070b, 0.94).fillRect(-400, -175, 800, 350);
    bg.lineStyle(1, 0xe9e4d8, 0.3).strokeRect(-399.5, -174.5, 799, 349);
    bg.lineStyle(2, 0xd8343f, 1).lineBetween(-60, -100, 60, -100);
    this.popEyebrow = this.add.text(0, -135, '', { fontFamily: FONT_BODY, fontSize: '16px', fontStyle: '700', color: MUTED, letterSpacing: 4 }).setOrigin(0.5);
    this.popName = this.add.text(0, -55, '', { fontFamily: FONT_DISPLAY, fontSize: '58px', fontStyle: '800', color: INK }).setOrigin(0.5);
    this.popKey = this.add.text(0, 12, '', { fontFamily: FONT_BODY, fontSize: '20px', fontStyle: '700', color: '#07070b', backgroundColor: GOLD, padding: { x: 12, y: 5 } }).setOrigin(0.5);
    this.popDesc = this.add.text(0, 78, '', { fontFamily: FONT_BODY, fontSize: '21px', color: INK, align: 'center', wordWrap: { width: 660 }, lineSpacing: 6 }).setOrigin(0.5);
    this.popFoot = this.add.text(0, 150, 'Press Z to continue', { fontFamily: FONT_BODY, fontSize: '15px', color: MUTED }).setOrigin(0.5);
    this.pop.add([bg, this.popEyebrow, this.popName, this.popKey, this.popDesc, this.popFoot]);
    this.popState = null;
  }
  openPopup(p) {
    if (p.kind === 'ability') {
      const a = ABILITIES[p.id];
      this.popEyebrow.setText('NEW ABILITY');
      this.popName.setText(a.name);
      this.popKey.setText(Controls.fmt(a.key)).setVisible(true);
      this.popDesc.setText(Controls.fmt(a.desc));
    } else {
      const s = SEALS[p.id];
      this.popEyebrow.setText('ZANPAKUTO SEAL FOUND');
      this.popName.setText(s.name);
      this.popKey.setText(`Costs ${s.cost} slot${s.cost > 1 ? 's' : ''} · equip it at a rest gate`).setVisible(true);
      this.popDesc.setText(s.desc);
    }
    this.pop.setVisible(true).setAlpha(0).setScale(0.95);
    this.tweens.add({ targets: this.pop, alpha: 1, scale: 1, duration: 260, ease: 'Cubic.out' });
    this.popState = { onClose: p.onClose, t: this.time.now };
  }
  closePopup() {
    const s = this.popState;
    if (!s || this.time.now - s.t < 450) return;
    this.popState = null;
    Sfx.play('confirm');
    this.tweens.add({ targets: this.pop, alpha: 0, duration: 180, onComplete: () => this.pop.setVisible(false) });
    s.onClose && s.onClose();
  }

  onKey(code) {
    if (!Controls.isConfirm(code) && !Controls.isBack(code) && code !== 'Space') return;
    if (this.popState) this.closePopup();
    else if (this.dlgState) this.advanceDialog();
  }
}
