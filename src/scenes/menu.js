'use strict';
// ---------------------------------------------------------------------------
// MenuScene: pauses the game and shows one of: pause, controls (rebinding),
// rest, seals, travel, shop, map, inventory. It also opens from the title
// screen for rebinding. Up/down move, jump/Enter confirms, slash/Esc goes back.
// ---------------------------------------------------------------------------

// The faint kanji in the corner of each screen
const MENU_KANJI = { pause: '休', rest: '休息', seals: '封印', travel: '門', shop: '浦原商店', forge: '鍛冶', map: '地図', inventory: '持物', journal: '記録', settings: '設定', controls: '操作',
  assist: '助', slots: '旅', slot: '旅', forms: '斬魄刀', records: '記', trial: '霊王宮', duels: '決闘' };
const SLOT_KANJI = ['壱', '弐', '参'];
// Pins the player sets on the map: each press on the same spot moves to the next kind, then clears it
const PIN_KINDS = [['★', '#d9b35a'], ['!', '#ff5a64'], ['?', '#7fe8ff'], ['✕', '#b8b2c4']];

class MenuScene extends Phaser.Scene {
  constructor() { super('menu'); }
  init(data) { this.type = data.type; }

  create() {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x07070b, 0.94).setOrigin(0);
    // a faint kanji for the screen, large in the corner, and ink pooling at the edges
    this.add.image(-60, GAME_H + 40, 'ui_ink').setOrigin(0, 1).setTint(0x1a1424).setAlpha(0.45).setScale(2.4, 1.6);
    this.watermark = this.add.text(GAME_W - 40, GAME_H - 30, '', { fontFamily: FONT_DISPLAY, fontSize: '150px', fontStyle: '800', color: CRIMSON }).setOrigin(1, 1).setAlpha(0.07);
    this.layer = this.add.container(0, 0);
    this.sel = 0; this.col = 0;
    this.view = this.type;
    this.msg = '';
    this.listening = null;
    const off = Controls.on((code) => this.onKey(code));
    Sfx.muffle(true);   // the world's sound goes behind a door while a menu is open
    this.events.once('shutdown', () => { off(); Controls.capture = null; Sfx.muffle(false); });
    this.render();
    this.popIn();
  }

  close() {
    Sfx.play('select');
    if (this.scene.isPaused('game')) this.scene.resume('game');
    this.scene.stop();
  }

  // ------------------------------------------------------------------ helpers
  clear() { this.layer.list.forEach(c => this.tweens.killTweensOf(c)); this.layer.removeAll(true); }
  txt(x, y, s, size = 22, color = INK, o = {}) {
    const t = this.add.text(x, y, s, Object.assign({ fontFamily: o.display ? FONT_DISPLAY : FONT_BODY, fontSize: size + 'px', color, fontStyle: o.bold ? '700' : o.display ? '800' : 'normal', wordWrap: o.wrap ? { width: o.wrap } : undefined, lineSpacing: 4 }, o.style || {}));
    if (o.origin !== undefined) t.setOrigin(...[].concat(o.origin));
    this.layer.add(t);
    return t;
  }
  title(s, sub) {
    const st = this.add.image(GAME_W / 2, 110, 'ui_stroke').setTint(0xd8343f).setAlpha(0.55).setScale(0, 0.5);
    this.layer.add(st);
    this.tweens.add({ targets: st, scaleX: 0.55, duration: 380, ease: 'Cubic.out' });
    this.txt(GAME_W / 2, 70, s, 52, INK, { display: true, origin: 0.5 });
    if (sub) this.txt(GAME_W / 2, 136, sub, 18, MUTED, { origin: 0.5 });
    this.watermark.setText(MENU_KANJI[this.view] || '');
  }
  // A brush stroke behind the chosen row, swept in each time the choice changes
  selectStroke(x, y, w, h) {
    const st = this.add.image(x - 22, y + h / 2, 'ui_stroke').setOrigin(0, 0.5).setTint(0xd8343f).setAlpha(0.32).setScale(0.1, h / 52);
    const g = this.add.graphics();
    g.fillStyle(0xd8343f, 1).fillPoints([{ x: x - 10, y: y + h / 2 - 5 }, { x: x - 5, y: y + h / 2 }, { x: x - 10, y: y + h / 2 + 5 }, { x: x - 15, y: y + h / 2 }], true);
    this.layer.add([st, g]);
    this.tweens.add({ targets: st, scaleX: w / 470, duration: 180, ease: 'Cubic.out' });
  }
  list(items, x, y, gap = 46, w = 420) {
    items.forEach((it, i) => {
      const on = i === this.sel;
      if (on) this.selectStroke(x - 8, y + i * gap - 6, w, gap - 6);
      if (it.icon) this.icon(it.icon, x + 16, y + i * gap + 13, 32, it.disabled ? 0.4 : 1);
      this.txt(x + (it.icon ? 46 : 0), y + i * gap, it.label, 24, it.disabled ? '#5c5868' : on ? INK : '#b8b2c4', { bold: on });
      this.hit(x - 16, y + i * gap - 6, w, gap - 6, () => this.tapItem(i));
      if (it.right) this.txt(x + w - 32, y + i * gap, it.right, 20, it.rightColor || MUTED, { origin: [1, 0] });
    });
  }
  icon(key, x, y, size = 32, alpha = 1) {
    const im = this.add.image(x, y, key).setDisplaySize(size, size).setAlpha(alpha);
    this.layer.add(im);
    return im;
  }
  // Slide and fade the screen in whenever the view changes
  popIn() {
    this.tweens.killTweensOf(this.layer);
    this.layer.setAlpha(0).setY(12);
    this.tweens.add({ targets: this.layer, alpha: 1, y: 0, duration: 170, ease: 'Quad.out' });
  }
  footer(s) { this.txt(GAME_W / 2, GAME_H - 40, s, 16, MUTED, { origin: 0.5 }); }
  // Invisible tap target (touch screens); lives in the layer so every render rebuilds it
  hit(x, y, w, h, fn) {
    const z = this.add.zone(x, y, w, h).setOrigin(0).setInteractive();
    z.on('pointerdown', (ptr) => fn(ptr));
    this.layer.add(z);
  }
  tapItem(i) {
    const it = this.items && this.items[i];
    if (!it) return;
    this.sel = i;
    if (it.disabled) { Sfx.play('deny'); this.render(); } else it.act();
  }

  // ------------------------------------------------------------------ render
  render() {
    this.clear();
    const d = GS.data;
    switch (this.view) {
      case 'pause': {
        this.title('Paused', `${REGIONS[ROOMS[d.room].region].kanji}  ·  ${ROOMS[d.room].name}`);
        this.items = [{ label: 'Resume', act: () => this.close() }, { label: 'Map', act: () => this.go('map') },
          { label: 'Inventory', act: () => this.go('inventory') }, { label: 'Journal', act: () => this.go('journal') },
          { label: 'Records', act: () => this.go('records') },
          { label: 'Controls', act: () => this.go('controls') }, { label: 'Settings', act: () => this.go('settings') }];
        if (GS.rush) this.items.push({ label: 'Leave the trial', act: () => this.leaveTrial() });
        this.items.push({ label: 'Quit to title', act: () => this.quit() });
        this.list(this.items, GAME_W / 2 - 190, 182, 48);
        this.footer(GS.rush ? 'A trial is under way. Leaving it, or quitting, returns you to the palace with nothing lost.'
          : 'Progress saves at rest gates and when you collect things. Quitting returns you to your last rest gate.');
        break;
      }
      case 'controls': { this.renderControls(); break; }
      case 'settings': { this.renderSettings(); break; }
      case 'assist': { this.renderAssist(); break; }
      case 'slots': { this.renderSlots(); break; }
      case 'slot': { this.renderSlot(); break; }
      case 'rest': {
        this.title('Rest Gate', 'Progress saved · health restored · the Senkaimon hums'); 
        const gates = Object.keys(d.gates).length;
        const forms = FORM_ORDER.filter(f => d.forms[f]).length, palace = d.palace >= 1 && !d.gates.palace;
        this.items = [{ label: 'Equip seals', right: `${GS.usedSlots()}/${d.sealSlots} slots`, act: () => this.go('seals') }];
        if (forms > 1) this.items.push({ label: 'Zanpakutō form', right: GS.form().name, act: () => this.go('forms') });
        this.items.push({ label: 'Travel', right: gates > 1 || palace ? `${gates + (palace ? 1 : 0)} gates` : 'find more gates', disabled: gates < 2 && !palace, act: () => (gates > 1 || palace) && this.go('travel') });
        this.items.push({ label: 'Rise', act: () => this.close() });
        this.list(this.items, GAME_W / 2 - 210, 220, 50, 440);
        this.footer(Controls.fmt('{jump} select · {attack} rise'));
        break;
      }
      case 'seals': {
        this.title('Zanpakuto Seals', `Slots used ${GS.usedSlots()} / ${d.sealSlots}`);
        const owned = Object.keys(SEALS).filter(id => d.seals.includes(id));
        this.items = owned.map(id => {
          const s = SEALS[id], on = GS.sealOn(id);
          return { id, icon: 'icon_' + id, label: (on ? '● ' : '○ ') + s.name, right: '◆'.repeat(s.cost), rightColor: on ? GOLD : MUTED, act: () => this.toggleSeal(id) };
        });
        if (!owned.length) this.txt(GAME_W / 2, 260, 'You have no seals yet. They hide all over the world, and the shop sells a few.', 20, MUTED, { origin: 0.5 });
        this.list(this.items, 200, 188, 42, 460);
        const cur = this.items[this.sel];
        if (cur) {
          const s = SEALS[cur.id];
          this.icon('icon_' + cur.id, 770, 208, 64);
          this.txt(816, 190, s.name, 32, INK, { display: true });
          this.txt(816, 232, `Cost ${s.cost} slot${s.cost > 1 ? 's' : ''}`, 18, GOLD, { bold: true });
          this.txt(740, 290, s.desc, 22, INK, { wrap: 440 });
        }
        if (this.msg) this.txt(GAME_W / 2, GAME_H - 80, this.msg, 18, CRIMSON, { origin: 0.5 });
        this.footer(Controls.fmt('{jump} equip or remove · {attack} back'));
        break;
      }
      case 'forms': this.renderForms(); break;
      case 'trial': this.renderTrial(); break;
      case 'records': this.renderRecords(); break;
      case 'duels': this.renderDuels(); break;
      case 'travel': {
        this.title('Travel', 'Step through the gate to any rest gate you have found');
        this.items = Object.keys(ROOMS).filter(id => d.gates[id] || (id === 'palace' && d.palace >= 1)).map(id => ({
          label: ROOMS[id].name, right: id === d.room ? 'here' : REGIONS[ROOMS[id].region].name, disabled: id === d.room,
          act: () => { if (id !== d.room) this.travel(id); },
        }));
        this.list(this.items, GAME_W / 2 - 260, 190, 46, 520);
        this.footer(Controls.fmt('{jump} travel · {attack} back'));
        break;
      }
      case 'shop': {
        this.title('Urahara Shop', 'Kisuke Urahara tips his striped hat. "Reishi only, no refunds!"');
        this.items = SHOP_STOCK.map(it => {
          const sold = it.type === 'seal' ? d.seals.includes(it.id) : !!d.bought[it.id];
          const name = it.type === 'seal' ? SEALS[it.id].name + ' (seal)' : it.type === 'tool' ? TOOLS[it.id].name : 'Soul Fragment';
          return { it, icon: it.type === 'seal' || it.type === 'tool' ? 'icon_' + it.id : 'ui_shard', label: name, right: sold ? 'sold' : it.price + ' reishi', disabled: sold, rightColor: !sold && d.reishi >= it.price ? GOLD : MUTED, act: () => this.buy(it) };
        });
        if (GS.has('bakudo')) this.items.push({ label: 'The Study Room (trapdoor)', right: d.quests.urahara === 2 ? 'done' : 'a favour', rightColor: '#7fe8ff', act: () => this.toStudy() });
        this.items.push({ label: 'Leave', act: () => this.close() });
        this.list(this.items, 200, 200, 50, 520);
        const cur = this.items[this.sel];
        if (cur && cur.it) {
          const desc = cur.it.type === 'seal' ? SEALS[cur.it.id].desc : cur.it.type === 'tool' ? TOOLS[cur.it.id].desc : 'Collect four to grow your soul vessel by one mask.';
          this.txt(800, 200, desc, 21, INK, { wrap: 380 });
        } else if (cur && cur.label.startsWith('The Study Room')) {
          this.txt(800, 200, '"Oh, that? Just a little room I keep under the shop for exercise. Do go down. I insist."', 21, INK, { wrap: 380 });
        }
        this.txt(200, GAME_H - 110, `You carry ${d.reishi} reishi`, 20, '#7fe8ff', { bold: true });
        if (this.msg) this.txt(GAME_W / 2, GAME_H - 80, this.msg, 18, CRIMSON, { origin: 0.5 });
        this.footer(Controls.fmt('{jump} buy · {attack} leave'));
        break;
      }
      case 'forge': this.renderForge(); break;
      case 'map': this.renderMap(); break;
      case 'inventory': this.renderInventory(); break;
      case 'journal': this.renderJournal(); break;
    }
  }

  renderSettings() {
    this.title('Settings', 'Left and right change a value. Changes save right away.');
    this.items = Settings.schema.map(row => ({ row, label: row[1], right: Settings.label(row), rightColor: GOLD, act: () => this.adjustSetting(row, 1, true) }));
    this.items.push({ label: 'Assist and accessibility…', right: Settings.assisted() ? 'in use' : '', rightColor: '#7fe8ff', act: () => this.go('assist') });
    this.items.push({ label: 'Back', act: () => this.back() });
    this.list(this.items, GAME_W / 2 - 300, 178, 46, 600);
    this.footer(Controls.fmt('{left} {right} change · {jump} next value · {attack} back'));
  }
  // Gentler (or harsher) play, for anyone who wants it. Nothing is locked away for using it.
  renderAssist() {
    this.title('Assist', 'Make the journey gentler or harder. Every ending and trial stays open whatever you choose.');
    this.items = Settings.assist.map(row => ({ row, label: row[1], right: Settings.label(row), rightColor: GOLD, act: () => this.adjustSetting(row, 1, true) }));
    this.items.push({ label: 'Back', act: () => this.back() });
    this.list(this.items, GAME_W / 2 - 300, 200, 52, 600);
    const cur = this.items[this.sel], about = {
      damage: 'Half: every second blow costs a mask. None: blows still knock you back, but cost nothing. Double: every blow costs two.',
      invuln: 'How long you flicker, untouchable, after taking a blow.',
      reiatsuGain: 'How much Reiatsu each slash that lands draws out, for healing and Kidō.',
      speed: 'Slows the whole world: you, your foes, their attacks. Menus are unaffected.',
      warnings: 'Bold: a red mark appears over every foe while it winds up an attack.',
    }[cur && cur.row && cur.row[0]];
    if (about) this.txt(GAME_W / 2, GAME_H - 96, about, 18, '#b8b2c4', { origin: 0.5, wrap: 900, style: { align: 'center' } });
    this.footer(Controls.fmt('{left} {right} change · {jump} next value · {attack} back'));
  }

  // ------------------------------------------------------------------ save slots
  // Three journeys side by side. Choosing one opens what can be done with it.
  renderSlots() {
    this.title('Journeys', 'Three saves, each its own journey');
    this.items = [0, 1, 2].map(i => ({ slot: i, act: () => { this.slotSel = i; this.confirm = null; this.go('slot'); } }));
    this.items.push({ label: 'Back', act: () => this.close() });
    const g = this.add.graphics();
    this.layer.add(g);
    const x = GAME_W / 2 - 400, w = 800, h = 118;
    [0, 1, 2].forEach(i => {
      const y = 176 + i * 132, on = this.sel === i, sum = GS.summary(i);
      g.fillStyle(on ? 0x2a1a22 : 0x14121b, 0.92).fillRect(x, y, w, h);
      g.lineStyle(on ? 2 : 1, on ? 0xd8343f : 0xe9e4d8, on ? 0.9 : 0.18).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (on) g.fillStyle(0xd8343f, 1).fillRect(x, y, 5, h);
      this.txt(x + 58, y + h / 2, SLOT_KANJI[i], 54, on ? CRIMSON : '#4c4858', { display: true, origin: 0.5 });
      if (!sum) {
        this.txt(x + 120, y + 30, 'Empty', 28, on ? INK : '#8a8497', { display: true });
        this.txt(x + 120, y + 72, 'Begin a new journey here.', 18, MUTED);
      } else {
        const reg = REGIONS[sum.region];
        this.txt(x + 120, y + 18, sum.room, 28, on ? INK : '#cfc9d8', { display: true });
        this.txt(x + 120, y + 60, `${reg.kanji}  ${reg.name}`, 17, '#' + reg.color.toString(16).padStart(6, '0'), { bold: true });
        this.txt(x + 120, y + 86, `${this.fmtTime(sum.time)}  ·  ${sum.deaths} death${sum.deaths === 1 ? '' : 's'}${sum.plus ? `  ·  New Game+ ${sum.plus}` : ''}`, 16, MUTED);
        this.txt(x + w - 30, y + 22, `${sum.pct}%`, 40, sum.pct >= 100 ? GOLD : INK, { display: true, origin: [1, 0] });
        const marks = (sum.cleared ? '討' : '') + (sum.trueEnding ? '　真' : '');
        if (marks) this.txt(x + w - 30, y + 76, marks, 22, sum.trueEnding ? GOLD : CRIMSON, { display: true, origin: [1, 0] });
      }
      this.hit(x, y, w, h, () => this.tapItem(i));
    });
    const by = 176 + 3 * 132 + 4, bon = this.sel === 3;
    if (bon) this.selectStroke(GAME_W / 2 - 60, by, 160, 40);
    this.txt(GAME_W / 2, by + 6, 'Back', 22, bon ? INK : '#b8b2c4', { origin: [0.5, 0], bold: bon });
    this.hit(GAME_W / 2 - 100, by - 4, 200, 44, () => this.tapItem(3));
    this.footer(Controls.fmt('{up} {down} choose · {jump} open · {attack} back · 討 the journey was finished · 真 the true ending was seen'));
  }
  renderSlot() {
    const i = this.slotSel, sum = GS.summary(i), title = this.scene.get('title');
    this.title(`Journey ${SLOT_KANJI[i]}`, sum ? `${sum.room}  ·  ${sum.pct}% complete  ·  ${this.fmtTime(sum.time)}` : 'An empty page');
    const ask = (key, label, fn) => ({ label: this.confirm === key ? `${label}: press again to confirm` : label, danger: true,
      act: () => { if (this.confirm === key) fn(); else { this.confirm = key; Sfx.play('deny'); this.render(); } } });
    const start = (mode) => { this.scene.stop(); title.startSlot(i, mode); };
    if (sum) {
      this.items = [{ label: 'Continue', act: () => start('continue') }];
      if (sum.cleared) this.items.push({ label: `New Game+${sum.plus ? ' ' + (sum.plus + 1) : ''}`, right: 'keep your powers, face tougher foes', act: () => start('plus') });
      this.items.push(ask('over', 'Start over', () => start('new')));
      this.items.push(ask('erase', 'Erase this journey', () => { GS.wipe(i); Sfx.play('break'); this.confirm = null; this.view = 'slots'; this.sel = i; this.render(); }));
    } else this.items = [{ label: 'Begin a new journey', act: () => start('new') }];
    this.items.push({ label: 'Back', act: () => this.back() });
    this.items.forEach(it => { if (it.danger && this.confirm && it.label.includes('confirm')) it.rightColor = CRIMSON; });
    this.list(this.items, GAME_W / 2 - 300, 220, 54, 600);
    if (sum && sum.d.rush.wins) this.txt(GAME_W / 2, GAME_H - 96, `Trials of the Soul King Palace won: ${sum.d.rush.wins}  ·  best ${this.fmtTime(sum.d.rush.best)}`, 18, GOLD, { origin: 0.5, bold: true });
    this.footer(Controls.fmt('{jump} choose · {attack} back'));
  }
  adjustSetting(row, dir, wrap = false) {
    // Confirm and taps wrap a slider round to 0 instead of sticking at full
    if (wrap && row[2] === 'slider' && dir > 0 && Settings.get(row[0]) >= 1) Settings.set(row[0], 0);
    else Settings.adjust(row, dir);
    Sfx.play('select');
    this.render();
  }

  // Two tables of actions, each with a key, an alternate key (or mouse button) and a pad button.
  // Confirm on a cell listens for the new input; Backspace (or the pad's Y) clears an alternate or pad cell.
  renderControls() {
    this.title('Controls', 'Keys, mouse buttons and gamepads all rebind here. Changes save right away.');
    const n = ACTIONS.length, half = Math.ceil(n / 2);
    if (this.col === undefined) this.col = 0;
    this.items = ACTIONS.map(([id, label]) => ({ id, label, act: () => this.listen(id, this.col) }));
    this.items.push({ id: null, extra: 0, label: 'Reset to defaults', act: () => { Controls.reset(); this.msg = 'Controls reset to the defaults.'; Sfx.play('confirm'); this.render(); } });
    this.items.push({ id: null, extra: 1, label: 'Touch controls: ' + (Touch.enabled ? 'on' : 'off'), act: () => { Touch.setEnabled(!Touch.enabled); Sfx.play('confirm'); this.render(); } });
    this.items.push({ id: null, extra: 2, label: 'Edit touch layout…', act: () => Touch.openEditor() });
    const COLS = [{ dx: 236, w: 110, head: 'KEY' }, { dx: 352, w: 120, head: 'ALT / MOUSE' }, { dx: 478, w: 84, head: 'PAD' }];
    const tableX = [52, 662], rowH = 40, top = 196;
    const g = this.add.graphics();
    this.layer.add(g);
    tableX.forEach(tx => {
      COLS.forEach(c => this.txt(tx + c.dx + c.w / 2, top - 30, c.head, 12, MUTED, { bold: true, origin: 0.5, style: { letterSpacing: 2 } }));
      g.lineStyle(1, 0xe9e4d8, 0.12).lineBetween(tx - 8, top - 16, tx + 570, top - 16);
    });
    const padOn = Controls.padConnected;
    this.items.forEach((it, i) => {
      const on = i === this.sel;
      if (it.id) {
        const t = i < half ? 0 : 1, row = i < half ? i : i - half, x = tableX[t], y = top + row * rowH;
        if (on) { g.fillStyle(0xe9e4d8, 0.06).fillRect(x - 8, y - 6, 578, rowH - 4); g.fillStyle(0xd8343f, 1).fillRect(x - 8, y - 6, 3, rowH - 4); }
        this.txt(x + 6, y + 1, it.label, 19, on ? INK : '#b8b2c4', { bold: on });
        const cells = [Controls.keyName(Controls.bindings[it.id][0]), Controls.keyName(Controls.bindings[it.id][1]), Controls.padKey(it.id)];
        COLS.forEach((c, ci) => {
          const sel = on && this.col === ci, waiting = this.listening === it.id && this.listenCol === ci;
          const cx = x + c.dx, label = waiting ? '…' : cells[ci];
          if (sel || waiting) g.fillStyle(waiting ? 0xd9b35a : 0xd8343f, waiting ? 0.9 : 0.35).fillRoundedRect(cx, y - 3, c.w, rowH - 10, 6);
          else g.lineStyle(1, 0xe9e4d8, 0.14).strokeRoundedRect(cx + 0.5, y - 2.5, c.w - 1, rowH - 11, 6);
          const col = waiting ? '#07070b' : label === '—' ? '#4c4858' : ci === 2 && !padOn ? '#8a8497' : GOLD;
          const t2 = this.txt(cx + c.w / 2, y + 12, label, 17, col, { bold: true, origin: 0.5 });
          if (waiting) this.tweens.add({ targets: t2, alpha: 0.4, yoyo: true, repeat: -1, duration: 350 });
          this.hit(cx, y - 4, c.w, rowH - 8, () => { this.sel = i; this.col = ci; this.listen(it.id, ci); });
        });
        this.hit(x - 8, y - 6, 230, rowH - 4, () => { this.sel = i; this.render(); });
      } else {
        const w = 330, x = GAME_W / 2 - 510 + it.extra * 350, y = top + half * rowH + 18;
        if (on) g.fillStyle(0xd8343f, 0.35).fillRoundedRect(x, y - 6, w, 36, 8);
        else g.lineStyle(1, 0xe9e4d8, 0.2).strokeRoundedRect(x + 0.5, y - 5.5, w - 1, 35, 8);
        this.txt(x + w / 2, y + 12, it.label, 18, on ? INK : '#b8b2c4', { bold: on, origin: 0.5 });
        this.hit(x, y - 6, w, 36, () => this.tapItem(i));
      }
    });
    if (this.msg) this.txt(GAME_W / 2, GAME_H - 84, this.msg, 18, CRIMSON, { origin: 0.5 });
    const padNote = padOn ? `Gamepad connected (${{ ps: 'PlayStation', nintendo: 'Nintendo', xbox: 'Xbox-style' }[Controls.padStyle]} layout)` : 'No gamepad found: press any button on one to wake it';
    this.txt(GAME_W / 2, GAME_H - 62, padNote, 15, padOn ? '#7fe8ff' : MUTED, { origin: 0.5 });
    this.footer(this.listening ? 'Press a key, click a mouse button, or press a pad button. Esc cancels.'
      : 'Arrows / d-pad choose a cell · Enter or A change it · Backspace or Y clear an alternate or pad input · Esc or B back');
  }
  listen(id, col = 0) {
    this.listening = id;
    this.listenCol = col;
    this.msg = '';
    Sfx.play('select');
    this.render();
    if (this.listenTimer) this.listenTimer.remove();
    // A pad-only player cannot press Esc: give up quietly after a while
    this.listenTimer = this.time.delayedCall(7000, () => { if (this.listening) { Controls.capture = null; this.listening = null; this.render(); } });
    Controls.listen((code) => {
      this.listening = null;
      if (this.listenTimer) this.listenTimer.remove();
      if (code === 'Escape') { this.msg = ''; Sfx.play('select'); this.render(); return; }
      const name = (a) => (ACTIONS.find(x => x[0] === a) || [a, a])[1];
      const pad = code.startsWith('Pad');
      if (!pad && col === 2) { this.msg = 'That column takes a gamepad button.'; Sfx.play('deny'); this.render(); return; }
      const res = Controls.rebind(id, pad ? 0 : col, code);
      if (!res.ok) { this.msg = `${Controls.keyName(code)} is the only key for ${name(res.owner)}. Rebind that action first.`; Sfx.play('deny'); }
      else {
        this.msg = res.owner ? `Swapped: ${name(res.owner)} now uses ${pad ? Controls.padKey(res.owner) : Controls.keys(res.owner)}.` : pad && col !== 2 ? 'Pad buttons go in the PAD column.' : '';
        Sfx.play('confirm');
      }
      this.render();
    });
  }
  // Clear the selected alternate or pad cell (the main key always stays)
  clearCell() {
    const it = this.items[this.sel];
    if (!it || !it.id) return;
    if (this.col === 1 && Controls.bindings[it.id].length > 1) Controls.clearAlt(it.id);
    else if (this.col === 2 && (Controls.pad[it.id] || []).length) Controls.clearPad(it.id);
    else { Sfx.play('deny'); return; }
    this.msg = ''; Sfx.play('select'); this.render();
  }
  // Arrow / d-pad movement around the two tables and the row of buttons under them
  moveControls(dx, dy) {
    const half = Math.ceil(ACTIONS.length / 2), nA = ACTIONS.length;
    const it = this.items[this.sel];
    if (it && it.id) {
      const t = this.sel < half ? 0 : 1, row = t ? this.sel - half : this.sel;
      if (dx) {
        let c = this.col + dx, tt = t;
        if (c > 2) { if (t === 0 && half + row < nA) { tt = 1; c = 0; } else c = 2; }
        if (c < 0) { if (t === 1) { tt = 0; c = 2; } else c = 0; }
        this.col = c; this.sel = tt ? half + row : row;
      } else {
        const rows = t ? nA - half : half, r = row + dy;
        if (r >= rows) this.sel = nA + Math.min(2, t ? 2 : (this.col > 1 ? 1 : 0));
        else if (r >= 0) this.sel = t ? half + r : r;
      }
    } else if (it) {
      if (dx) this.sel = nA + Phaser.Math.Clamp(it.extra + dx, 0, 2);
      else if (dy < 0) this.sel = it.extra === 2 ? nA - 1 : half - 1;
    }
    this.msg = ''; Sfx.play('select'); this.render();
  }

  renderForge() {
    const d = GS.data, lvl = d.swordLevel || 0, next = FORGE[lvl];
    this.title('Swordsmith', '"Bring me reishi and the ore that grows where Hollows die. I will give that Zanpakutō its teeth back."');
    this.txt(GAME_W / 2, 186, `Zanpakuto edge  ·  level ${lvl} of ${FORGE.length}`, 26, INK, { origin: 0.5, display: true });
    const g = this.add.graphics();
    this.layer.add(g);
    for (let i = 0; i < FORGE.length; i++) {
      const cx = GAME_W / 2 - 40 + i * 40, cy = 236;
      g.fillStyle(i < lvl ? 0xd9b35a : 0x2a2733, 1);
      g.fillPoints([{ x: cx, y: cy - 10 }, { x: cx + 10, y: cy }, { x: cx, y: cy + 10 }, { x: cx - 10, y: cy }], true);
    }
    const dmgAt = (l) => Math.round((COMBAT.slashDamage + l * COMBAT.swordBonus) * GS.form().dmg * 10) / 10;
    this.txt(GAME_W / 2, 262, next ? `Slash damage ${dmgAt(lvl)} → ${dmgAt(lvl + 1)}` : `Slash damage ${dmgAt(lvl)}`, 20, GOLD, { origin: 0.5, bold: true });
    this.items = [];
    if (next) {
      const ok = d.reishi >= next.reishi && (d.ore || 0) >= next.ore;
      this.items.push({ label: 'Sharpen the edge', right: `${next.reishi} reishi${next.ore ? `  ·  ${next.ore} ore` : ''}`, rightColor: ok ? GOLD : MUTED, act: () => this.forge() });
    }
    // after the first sharpening, the smith offers to reforge the blade long
    if (lvl >= 1 && !d.forms.odachi) {
      const ok = d.reishi >= ODACHI_COST.reishi && (d.ore || 0) >= ODACHI_COST.ore;
      this.items.push({ label: 'Forge an Ōdachi form', right: `${ODACHI_COST.reishi} reishi  ·  ${ODACHI_COST.ore} ore`, rightColor: ok ? GOLD : MUTED, act: () => this.forgeOdachi() });
    }
    this.items.push({ label: 'Leave', act: () => this.close() });
    this.list(this.items, GAME_W / 2 - 270, 330, 52, 540);
    this.txt(GAME_W / 2, 470, `You carry ${d.reishi} reishi and ${d.ore || 0} reishi ore`, 20, '#7fe8ff', { origin: 0.5, bold: true });
    if (!next) this.txt(GAME_W / 2, 510, '"That edge cannot get any sharper. Go cut something worth cutting."', 19, MUTED, { origin: 0.5 });
    if (this.msg) this.txt(GAME_W / 2, GAME_H - 82, this.msg, 18, CRIMSON, { origin: 0.5 });
    this.footer(Controls.fmt('{jump} sharpen · {attack} leave'));
  }
  forge() {
    const d = GS.data, next = FORGE[d.swordLevel || 0];
    if (!next) return;
    if (d.reishi < next.reishi || (d.ore || 0) < next.ore) {
      Sfx.play('deny');
      const need = [];
      if (d.reishi < next.reishi) need.push(`${next.reishi - d.reishi} more reishi`);
      if ((d.ore || 0) < next.ore) need.push(`${next.ore - (d.ore || 0)} more ore`);
      this.msg = `You need ${need.join(' and ')}.`;
      this.render();
      return;
    }
    d.reishi -= next.reishi;
    d.ore = (d.ore || 0) - next.ore;
    d.swordLevel = (d.swordLevel || 0) + 1;
    GS.save();
    Sfx.play('clang'); Sfx.play('pickup');
    this.msg = '';
    this.game.events.emit('toast', `Your Zanpakuto's edge is sharper: level ${d.swordLevel}`);
    this.render();
  }

  forgeOdachi() {
    const d = GS.data, c = ODACHI_COST;
    if (d.reishi < c.reishi || (d.ore || 0) < c.ore) { Sfx.play('deny'); this.msg = `You need ${c.reishi} reishi and ${c.ore} ore.`; this.render(); return; }
    d.reishi -= c.reishi; d.ore -= c.ore;
    d.forms.odachi = true;
    GS.save();
    Sfx.play('clang'); Sfx.play('ability');
    this.msg = '';
    this.game.events.emit('toast', '"Long and heavy. It will not forgive a wasted swing." Change forms at any rest gate.');
    this.render();
  }

  // The shapes the blade can take, chosen at a rest gate
  renderForms() {
    const d = GS.data;
    this.title('Zanpakutō Form', 'The same blade in another shape. Changing it costs nothing.');
    this.items = FORM_ORDER.map(id => {
      const f = FORMS[id], have = !!d.forms[id], on = d.form === id;
      return { id, icon: have ? 'icon_' + id : 'icon_unknown', label: have ? (on ? '● ' : '○ ') + f.name : '? ? ?', disabled: !have, right: have ? f.jp : '', rightColor: on ? GOLD : MUTED,
        act: () => { d.form = id; GS.save(); Sfx.play('clang'); this.render(); } };
    });
    this.list(this.items, 170, 200, 54, 440);
    const cur = this.items[this.sel], f = cur && d.forms[cur.id] ? FORMS[cur.id] : null;
    const px = 700;
    if (f) {
      this.icon('icon_' + cur.id, px + 32, 216, 64);
      this.txt(px + 80, 192, f.name, 34, INK, { display: true });
      this.txt(px + 80, 236, f.jp, 18, CRIMSON, { display: true });
      this.txt(px, 282, f.desc, 20, INK, { wrap: 480 });
      const g = this.add.graphics(); this.layer.add(g);
      [['Speed', 1 / f.cd], ['Damage', f.dmg], ['Reach', f.reach], ['Reiatsu drawn', f.rei]].forEach(([k, v], i) => {
        const y = 380 + i * 40;
        this.txt(px, y, k, 18, '#b8b2c4');
        g.fillStyle(0x2a2733, 1).fillRect(px + 170, y + 6, 260, 10);
        g.fillStyle(v > 1.01 ? 0xd9b35a : v < 0.99 ? 0x8a7aa0 : 0xe9e4d8, 1).fillRect(px + 170, y + 6, 260 * Math.min(1, v / 1.6), 10);
        g.fillStyle(0xffffff, 0.6).fillRect(px + 170 + 260 / 1.6, y + 3, 2, 16);
      });
    } else if (cur) this.txt(px, 282, FORMS[cur.id].how || '', 20, MUTED, { wrap: 480 });
    this.footer(Controls.fmt('{jump} take this form · {attack} back'));
  }

  // ------------------------------------------------------------------ the trials
  renderTrial() {
    const d = GS.data, rec = d.rush, bind = rec.lastBind || (rec.lastBind = {});
    this.title('Altar of Trials', 'Every battle you have won, fought again as it was. Heal as you like; bind yourself if you dare.');
    const all = RUSH_ORDER.every(b => d.bosses[b]);
    this.items = [{ label: 'The Trial of the Ten', right: rec.best != null ? `best ${fmtClock(rec.best, true)}` : all ? 'unbeaten' : 'defeat every boss first', rightColor: GOLD, disabled: !all,
      act: () => this.beginTrial('gauntlet', RUSH_ORDER) }];
    BINDING_ORDER.forEach(k => this.items.push({ bind: k, label: `${BINDINGS[k].jp}   ${BINDINGS[k].name}`, right: bind[k] ? 'bound' : 'free', rightColor: bind[k] ? CRIMSON : MUTED,
      act: () => { bind[k] = !bind[k]; Sfx.play(bind[k] ? 'bakudo' : 'select'); this.render(); } }));
    this.items.push({ label: 'Single duels…', act: () => this.go('duels') });
    this.items.push({ label: 'Leave', act: () => this.close() });
    this.list(this.items, 150, 186, 50, 560);
    // the record, and what the selected row means
    const px = 760, g = this.add.graphics(); this.layer.add(g);
    g.fillStyle(0x16141f, 0.8).fillRect(px - 20, 180, 520, 380);
    g.lineStyle(1, 0xd9b35a, 0.3).strokeRect(px - 19.5, 180.5, 519, 379);
    this.txt(px, 196, 'THE ALTAR REMEMBERS', 14, MUTED, { bold: true, style: { letterSpacing: 3 } });
    this.txt(px, 226, rec.wins ? `Trial of the Ten won ${rec.wins} time${rec.wins > 1 ? 's' : ''}` : 'The Trial of the Ten has not been won.', 19, INK);
    BINDING_ORDER.forEach((k, i) => this.txt(px + i * 56, 262, BINDINGS[k].jp, 34, rec.bound[k] ? GOLD : '#3a3646', { display: true }));
    if (rec.bound.all) this.txt(px + 240, 270, 'all four at once', 16, GOLD, { bold: true });
    const cur = this.items[this.sel];
    const about = cur && cur.bind ? BINDINGS[cur.bind].desc
      : this.sel === 0 ? `All ten in order, from Grand Fisher to the Hollow within. You keep your health between fights; after the third, sixth and eighth, a respite heals you. Finish it to see what lies under the last name.`
      : cur && cur.label.startsWith('Single') ? 'Fight any one boss you have beaten, with the bindings you chose.' : '';
    this.txt(px, 330, about, 18, '#cfc9d8', { wrap: 480 });
    const on = BINDING_ORDER.filter(k => bind[k]).length;
    this.txt(px, 520, on ? `Bound ${on} way${on > 1 ? 's' : ''}: ${BINDING_ORDER.filter(k => bind[k]).map(k => BINDINGS[k].jp).join(' ')}` : 'No bindings chosen.', 18, on ? CRIMSON : MUTED, { bold: true });
    this.footer(Controls.fmt('{jump} choose or bind · {attack} leave'));
  }
  renderDuels() {
    const d = GS.data, rec = d.rush;
    this.title('Single Duels', 'One battle, with the bindings you chose at the altar');
    this.items = RUSH_ORDER.filter(b => d.bosses[b]).map(b => {
      const s = rec.single[b];
      return { b, label: BOSSES[b].name, right: s ? `${fmtClock(s.best, true)}  ${'●'.repeat(s.bound)}${'○'.repeat(BINDING_ORDER.length - s.bound)}` : 'not yet', rightColor: s ? GOLD : MUTED,
        act: () => this.beginTrial('single', [b]) };
    });
    if (!this.items.length) this.txt(GAME_W / 2, 300, 'Beat a boss somewhere in the world first.', 20, MUTED, { origin: 0.5 });
    this.items.push({ label: 'Back', act: () => this.back() });
    const per = 9, first = Phaser.Math.Clamp(this.sel - 4, 0, Math.max(0, this.items.length - per));
    const shown = this.items.slice(first, first + per);
    const sel = this.sel; this.sel = sel - first;
    this.list(shown, GAME_W / 2 - 330, 186, 48, 660);
    this.sel = sel;
    this.footer(Controls.fmt('{jump} fight · {attack} back  ·  ● each binding worn when it fell'));
  }
  beginTrial(mode, list) {
    const game = this.scene.get('game');
    Sfx.play('boss');
    this.scene.resume('game');
    this.scene.stop();
    game.startTrial(mode, list, GS.data.rush.lastBind || {});
  }
  leaveTrial() {
    const game = this.scene.get('game');
    this.scene.resume('game');
    this.scene.stop();
    game.game.events.emit('boss-end', { silent: true });
    Music.setBoss(false);
    GS.endRush(false);
    game.transitioning = false;
    game.goTo('palace', { spawn: 'rest' });
  }
  toStudy() {
    const game = this.scene.get('game');
    Sfx.play('door');
    this.scene.resume('game');
    this.scene.stop();
    game.goTo('kar_study', { spawn: 'start' });
  }

  // Splits for this journey against the best ever, every favour asked, and the trials
  renderRecords() {
    const d = GS.data, best = GS.bestSplits();
    this.title('Records', `${fmtClock(d.time)} on this journey · ${d.deaths} death${d.deaths === 1 ? '' : 's'}${d.plus ? ` · New Game+ ${d.plus}` : ''}`);
    const x = 110;
    this.txt(x, 178, 'SPLITS', 15, MUTED, { bold: true, style: { letterSpacing: 3 } });
    this.txt(x + 300, 178, 'THIS JOURNEY', 13, MUTED, { bold: true, origin: [1, 0] });
    this.txt(x + 430, 178, 'BEST', 13, MUTED, { bold: true, origin: [1, 0] });
    RUSH_ORDER.forEach((b, i) => {
      const y = 208 + i * 36, mine = d.splits[b], top = best[b], known = d.bosses[b] || mine != null;
      this.txt(x, y, known ? BOSSES[b].name : '? ? ?', 19, known ? INK : '#4c4858');
      this.txt(x + 300, y, mine != null ? fmtClock(mine) : '—', 19, mine != null && top != null && mine <= top ? '#8af0a0' : INK, { origin: [1, 0] });
      this.txt(x + 430, y, top != null ? fmtClock(top) : '—', 19, GOLD, { origin: [1, 0] });
    });
    const qx = 650;
    this.txt(qx, 178, 'FAVOURS', 15, MUTED, { bold: true, style: { letterSpacing: 3 } });
    QUEST_ORDER.forEach((id, i) => {
      const q = QUESTS[id], st = d.quests[id] || 0, y = 208 + i * 58;
      this.txt(qx, y, st ? q.name : '? ? ?', 20, st === 2 ? GOLD : st ? INK : '#4c4858', { bold: true });
      this.txt(qx + 520, y, st === 2 ? '✓ done' : st ? 'under way' : '', 16, st === 2 ? GOLD : '#7fe8ff', { origin: [1, 0] });
      this.txt(qx, y + 26, st === 2 ? `${q.giver} · ${q.reward}` : st ? `${q.giver}, ${q.where}: ${q.todo}${id === 'orihime' ? ` (${d.items.petals || 0}/${PETALS})` : ''}` : 'Someone in the world has a favour to ask.', 15, st ? '#b8b2c4' : '#5c5868', { wrap: 540 });
    });
    if (d.palace >= 1) {
      const r = d.rush;
      this.txt(qx, 520, 'THE SOUL KING PALACE', 15, MUTED, { bold: true, style: { letterSpacing: 3 } });
      this.txt(qx, 548, r.wins ? `Trial of the Ten: won ${r.wins}× · best ${fmtClock(r.best, true)}` : 'Trial of the Ten: not yet won', 18, r.wins ? GOLD : INK);
      this.txt(qx, 578, BINDING_ORDER.map(k => BINDINGS[k].jp).join('  '), 24, r.bound.all ? GOLD : '#7a7486', { display: true });
    }
    this.items = [];
    this.hit(0, 0, GAME_W, GAME_H, () => this.back());
    this.footer(Controls.fmt('{attack} back · splits are when each boss first fell; the best is over every journey'));
  }

  renderMap() {
    const d = GS.data;
    this.title('Map', 'Rooms you have walked through');
    const ids = Object.keys(ROOMS);
    const box = (id) => { const r = ROOMS[id], H = r.tiles.length, W = r.tiles[0].length; return { x: r.pos[0], y: r.pos[1], w: W / 10, h: H / 10 }; };
    // known neighbours appear as faint outlines
    const known = new Set();
    ids.forEach(id => { if (d.visited[id]) Object.values(ROOMS[id].doors).forEach(([to]) => known.add(to)); });
    // The map frames what you have seen, so it zooms in on a small journey and out on a large one
    const shown = ids.filter(id => d.visited[id] || known.has(id));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    (shown.length ? shown : ids).forEach(id => { const b = box(id); minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h); });
    const areaW = 1160, areaH = 470, ox = 60, oy = 170;
    const sc = Math.min(areaW / (maxX - minX), areaH / (maxY - minY), 34);
    const ex = (areaW - (maxX - minX) * sc) / 2, ey = (areaH - (maxY - minY) * sc) / 2;
    const P = (x, y) => ({ x: ox + ex + (x - minX) * sc, y: oy + ey + (y - minY) * sc });
    const g = this.add.graphics();
    this.layer.add(g);
    // the ways between rooms you have walked, door to door
    g.lineStyle(2, 0xd9b35a, 0.35);
    ids.forEach(id => {
      if (!d.visited[id]) return;
      const r = ROOMS[id];
      Object.entries(r.doors).forEach(([dd, [to, td]]) => {
        if (!d.visited[to] || id > to) return;
        const a2 = this.doorPoint(id, dd, box, P), b2 = this.doorPoint(to, td, box, P);
        // neighbours only: the long ways (Senkaimon shortcuts across the world) are not drawn as roads
        if (a2 && b2 && Phaser.Math.Distance.Between(a2.x, a2.y, b2.x, b2.y) < sc * 4) g.lineBetween(a2.x, a2.y, b2.x, b2.y);
      });
    });
    // a region's name in kanji above the rooms of it you have seen
    Object.keys(REGIONS).forEach(reg => {
      const mine = ids.filter(id => d.visited[id] && ROOMS[id].region === reg);
      if (!mine.length) return;
      let x0 = Infinity, y0 = Infinity;
      mine.forEach(id => { const b = box(id); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); });
      const p = P(x0, y0);
      this.txt(p.x, p.y - 4, REGIONS[reg].kanji + '  ' + REGIONS[reg].name, 14, '#' + REGIONS[reg].color.toString(16).padStart(6, '0'), { bold: true, origin: [0, 1] });
    });
    ids.forEach(id => {
      const b = box(id), p = P(b.x, b.y), w = b.w * sc, h = b.h * sc;
      if (d.visited[id]) {
        g.fillStyle(REGIONS[ROOMS[id].region].color, id === d.room ? 0.55 : 0.28).fillRect(p.x, p.y, w, h);
        g.lineStyle(2, id === d.room ? 0xffffff : 0xe9e4d8, id === d.room ? 1 : 0.6).strokeRect(p.x, p.y, w, h);
        if (sc * b.w > 60) this.txt(p.x + 4, p.y + h - 4, ROOMS[id].name, 13, INK, { origin: [0, 1] });
      } else if (known.has(id)) {
        g.lineStyle(1, 0xe9e4d8, 0.25).strokeRect(p.x, p.y, w, h);
      }
    });
    this.drawPins(g, P, box);
    // your own pins
    (d.pins || []).forEach(pin => {
      const pt = P(pin.x, pin.y), [ch, col] = PIN_KINDS[pin.k] || PIN_KINDS[0];
      g.fillStyle(0x07070b, 0.85).fillCircle(pt.x, pt.y, 11);
      g.lineStyle(2, Phaser.Display.Color.HexStringToColor(col).color, 1).strokeCircle(pt.x, pt.y, 11);
      this.txt(pt.x, pt.y + 1, ch, 15, col, { bold: true, origin: 0.5 });
    });
    this.mapView = { P, sc, toMap: (sx, sy) => ({ x: minX + (sx - ox - ex) / sc, y: minY + (sy - oy - ey) / sc }) };
    // the player
    const cur = box(d.room), game = this.scene.get('game');
    if (game && game.player) {
      const px = cur.x + game.player.x / TILE / 10, py = cur.y + game.player.y / TILE / 10;
      const p = P(px, py);
      g.fillStyle(0xd8343f, 1).fillCircle(p.x, p.y, 6);
      g.lineStyle(2, 0xffffff, 1).strokeCircle(p.x, p.y, 8);
      const pulse = this.add.circle(p.x, p.y, 8).setStrokeStyle(2, 0xd8343f).setFillStyle();
      this.layer.add(pulse);
      this.tweens.add({ targets: pulse, radius: 22, alpha: { from: 0.9, to: 0 }, duration: 1100, repeat: -1 });
    }
    // legend
    const legend = [['gate', 'rest gate'], ['shop', 'shop'], ['forge', 'swordsmith'], ['boss', 'boss']];
    if (d.bought.compass) legend.push(['power', 'power'], ['seal', 'seal'], ['frag', 'fragment'], ['plus', 'lost plus'], ['ore', 'ore']);
    const lg = this.add.graphics(); this.layer.add(lg);
    let lx = GAME_W / 2 - legend.length * 62;
    legend.forEach(([k, label]) => { this.pin(lg, k, lx, GAME_H - 76); this.txt(lx + 12, GAME_H - 86, label, 15, MUTED); lx += 28 + label.length * 8 + 28; });
    this.items = [];
    // a click pins the spot under it; the keyboard and pad move a cursor and pin with confirm
    this.hit(0, 150, GAME_W, GAME_H - 230, (ptr) => { const m = this.mapView.toMap(ptr.x, ptr.y); this.pinAt(m.x, m.y); });
    if (!this.cursor) {
      const cb = box(d.room), pl = game && game.player;
      this.cursor = pl ? { x: cb.x + pl.x / TILE / 10, y: cb.y + pl.y / TILE / 10 } : { x: cb.x + cb.w / 2, y: cb.y + cb.h / 2 };
    }
    this.cursorG = this.add.graphics();
    this.layer.add(this.cursorG);
    this.drawCursor();
    this.footer(Controls.fmt('Red marker: you · {left} {right} {up} {down} or click: place a pin, again to change it, a fourth time to clear · {map} or {attack} close'));
  }
  drawCursor() {
    if (!this.cursorG || !this.mapView) return;
    const p = this.mapView.P(this.cursor.x, this.cursor.y), g = this.cursorG;
    g.clear();
    g.lineStyle(2, 0xe9e4d8, 0.9).strokeCircle(p.x, p.y, 14);
    g.lineBetween(p.x - 22, p.y, p.x - 16, p.y).lineBetween(p.x + 16, p.y, p.x + 22, p.y).lineBetween(p.x, p.y - 22, p.x, p.y - 16).lineBetween(p.x, p.y + 16, p.x, p.y + 22);
  }
  // Add a pin, step an existing one to its next kind, or clear it after the last
  pinAt(x, y) {
    const d = GS.data, pins = d.pins || (d.pins = []), near = 14 / this.mapView.sc;
    const i = pins.findIndex(p => Math.hypot(p.x - x, p.y - y) < near);
    if (i < 0) { pins.push({ x, y, k: 0 }); Sfx.play('confirm'); }
    else if (pins[i].k + 1 < PIN_KINDS.length) { pins[i].k++; Sfx.play('select'); }
    else { pins.splice(i, 1); Sfx.play('deny'); }
    this.cursor = { x, y };
    GS.save();
    this.render();
  }
  // The map cursor glides while a direction is held
  update(time, delta) {
    if (this.view !== 'map' || !this.mapView || this.listening) return;
    const dx = (Controls.isDown('right') ? 1 : 0) - (Controls.isDown('left') ? 1 : 0);
    const dy = (Controls.isDown('down') ? 1 : 0) - (Controls.isDown('up') ? 1 : 0);
    if (!dx && !dy) return;
    const v = 340 / this.mapView.sc * delta / 1000;
    this.cursor.x += dx * v; this.cursor.y += dy * v;
    this.drawCursor();
  }

  // Where a door sits on the map: its tile, scaled into the room's box
  doorPoint(id, door, box, P) {
    const r = ROOMS[id], b = box(id);
    for (let y = 0; y < r.tiles.length; y++) {
      const x = r.tiles[y].indexOf(door);
      if (x >= 0) return P(b.x + (x + 0.5) / 10, b.y + (y + 0.5) / 10);
    }
    return null;
  }

  // Landmarks always show on rooms you have seen; with the Pin Compass, so does what is left to find
  drawPins(g, P, box) {
    const d = GS.data;
    Object.keys(ROOMS).forEach(id => {
      if (!d.visited[id]) return;
      const r = ROOMS[id], b = box(id), cnt = { k: 0, c: 0, f: 0, l: 0, o: 0 };
      r.tiles.forEach((row, ty) => {
        for (let tx = 0; tx < row.length; tx++) {
          const ch = row[tx];
          let kind = null;
          switch (ch) {
            case 'R': kind = 'gate'; break;
            case 'S': kind = 'shop'; break;
            case 'W': kind = 'forge'; break;
            case 'B': kind = d.bosses[r.boss] ? 'bossDone' : 'boss'; break;
            case 'k': { const i = cnt.k++, aid = (r.abilities || [])[i]; if (aid && !GS.isTaken(`${id}:k${i}`) && !GS.has(aid)) kind = 'power'; break; }
            case 'c': { const i = cnt.c++, sid = (r.seals || [])[i]; if (sid && !GS.isTaken(`${id}:c${i}`) && !d.seals.includes(sid)) kind = 'seal'; break; }
            case 'f': { const i = cnt.f++; if (!GS.isTaken(`${id}:f${i}`)) kind = 'frag'; break; }
            case 'l': { const i = cnt.l++; if (!GS.isTaken(`${id}:l${i}`)) kind = 'plus'; break; }
            case 'o': { const i = cnt.o++; if (!GS.isTaken(`${id}:o${i}`)) kind = 'ore'; break; }
          }
          if (!kind) continue;
          if (['power', 'seal', 'frag', 'plus', 'ore'].includes(kind) && !d.bought.compass) continue;
          if (kind === 'gate' && !d.gates[id]) continue;
          const pt = P(b.x + tx / 10, b.y + ty / 10);
          this.pin(g, kind, pt.x, pt.y);
        }
      });
    });
  }
  pin(g, kind, x, y) {
    switch (kind) {
      case 'gate': g.fillStyle(0xffe8b0, 1).fillCircle(x, y, 4); g.lineStyle(1, 0x07070b, 0.8).strokeCircle(x, y, 4); break;
      case 'shop': g.fillStyle(0x7fe8ff, 1).fillRect(x - 3, y - 3, 6, 6); break;
      case 'forge': g.fillStyle(0xff9a50, 1).fillTriangle(x, y - 4, x - 4, y + 3, x + 4, y + 3); break;
      case 'boss': g.fillStyle(0xd8343f, 1).fillPoints([{ x, y: y - 5 }, { x: x + 5, y }, { x, y: y + 5 }, { x: x - 5, y }], true); break;
      case 'bossDone': g.lineStyle(1.5, 0x8a8497, 1).strokePoints([{ x, y: y - 5 }, { x: x + 5, y }, { x, y: y + 5 }, { x: x - 5, y }], true); break;
      case 'power': g.fillStyle(0xffffff, 1).fillCircle(x, y, 3.5); g.lineStyle(1.5, 0xffe8b0, 1).strokeCircle(x, y, 6); break;
      case 'seal': g.fillStyle(0xffd75e, 1).fillPoints([{ x, y: y - 4 }, { x: x + 3, y }, { x, y: y + 4 }, { x: x - 3, y }], true); break;
      case 'frag': g.fillStyle(0x7fe8ff, 1).fillCircle(x, y, 2.5); break;
      case 'plus': g.fillStyle(0xe8f4ff, 1).fillCircle(x, y, 2.5); g.lineStyle(1, 0x7fe8ff, 1).strokeCircle(x, y, 4); break;
      case 'ore': g.fillStyle(0xb89aff, 1).fillCircle(x, y, 2.5); break;
    }
  }

  renderInventory() {
    const d = GS.data;
    this.title('Inventory', `${GS.completion()}% complete · ${this.fmtTime(d.time)}${d.plus ? ` · New Game+ ${d.plus}` : ''}`);
    this.txt(150, 172, 'POWERS', 15, MUTED, { bold: true, style: { letterSpacing: 3 } });
    ABILITY_ORDER.forEach((id, i) => {
      const a = ABILITIES[id], has = !!d.abilities[id];
      this.icon(has ? 'icon_' + id : 'icon_unknown', 166, 214 + i * 40, 32, has ? 1 : 0.6);
      this.txt(196, 194 + i * 40, has ? a.name : '? ? ?', 19, has ? INK : '#4c4858', { bold: has });
      if (has) this.txt(196, 216 + i * 40, Controls.fmt(a.key), 13, GOLD);
    });
    const x = 700;
    this.txt(x, 180, 'SOUL', 15, MUTED, { bold: true, style: { letterSpacing: 3 } });
    const T = GS.totals();
    const rows = [
      ['Health', `${d.maxHp} masks`], ['Soul fragments', `${d.fragments} / 4  (${d.fragmentsTotal} of ${T.fragments} found)`],
      ['Zanpakutō edge', `level ${d.swordLevel || 0} of ${FORGE.length}`], ['Reishi ore', String(d.ore || 0)],
      ['Lost pluses sent on', `${d.pluses} / ${T.pluses}`], ['Seal slots', `${GS.usedSlots()} / ${d.sealSlots} used`],
      ['Reishi', String(d.reishi)], ['Bosses felled', `${Object.keys(d.bosses).filter(b => BOSSES[b]).length} / ${T.bosses}`],
    ];
    rows.forEach(([k, v], i) => {
      this.txt(x, 214 + i * 36, k, 20, '#b8b2c4');
      this.txt(x + 460, 214 + i * 36, v, 20, INK, { bold: true, origin: [1, 0] });
    });
    this.txt(x, 520, 'EQUIPPED SEALS', 15, MUTED, { bold: true, style: { letterSpacing: 3 } });
    const eq = d.equipped.map(id => SEALS[id].name);
    d.equipped.forEach((id, i) => this.icon('icon_' + id, x + 18 + i * 42, 562, 34));
    this.txt(x, d.equipped.length ? 590 : 548, eq.length ? eq.join(' · ') : 'None. Equip seals at a rest gate.', 19, eq.length ? INK : MUTED, { wrap: 470 });
    this.items = [];
    this.hit(0, 0, GAME_W, GAME_H, () => this.back());
    this.footer(Controls.fmt('{inventory} or {attack} close · Journal from the pause menu'));
  }

  // The Journal: every kind of foe you have met, how many you have sent on, and what the
  // Konso let you hear them remember
  renderJournal() {
    const d = GS.data;
    const seen = (k) => (d.kills[k] || 0) > 0 || d.memories[k] || d.bosses[k];
    const met = BESTIARY.filter(([k]) => seen(k)).length;
    this.title('Journal', `Hollows, Shinigami and Arrancar you have faced · ${met} of ${BESTIARY.length}`);
    this.items = BESTIARY.map(([k, name]) => ({ k, label: seen(k) ? name : '? ? ?', disabled: false, act: () => {} }));
    const per = 11, first = Phaser.Math.Clamp(this.sel - 5, 0, Math.max(0, this.items.length - per));
    const x = 120, y = 186, gap = 40;
    this.items.slice(first, first + per).forEach((it, j) => {
      const i = first + j, on = i === this.sel, known = seen(it.k);
      if (on) this.selectStroke(x - 8, y + j * gap - 6, 400, gap - 6);
      const boss = BOSS_KINDS.includes(it.k);
      this.txt(x, y + j * gap, it.label, 20, !known ? '#4c4858' : on ? INK : '#b8b2c4', { bold: on });
      if (boss && known) this.txt(x + 380, y + j * gap + 2, d.bosses[it.k] ? '討' : '', 18, CRIMSON, { display: true, origin: [1, 0] });
      this.hit(x - 16, y + j * gap - 6, 400, gap - 6, () => { this.sel = i; this.render(); });
    });
    if (first > 0) this.txt(x + 180, y - 30, '▲', 14, MUTED, { origin: 0.5 });
    if (first + per < this.items.length) this.txt(x + 180, y + per * gap - 4, '▼', 14, MUTED, { origin: 0.5 });
    const cur = BESTIARY[this.sel];
    if (cur) {
      const [k, name, about] = cur, known = seen(k), boss = BOSS_KINDS.includes(k);
      const px = 620;
      const g = this.add.graphics();
      g.fillStyle(0x16141f, 0.8).fillRect(px - 20, 176, 560, 430);
      g.lineStyle(1, 0xe9e4d8, 0.18).strokeRect(px - 19.5, 176.5, 559, 429);
      this.layer.add(g);
      if (!known) {
        this.txt(px + 260, 380, 'You have not met this one yet.', 20, MUTED, { origin: 0.5 });
      } else {
        this.txt(px, 196, name, 32, INK, { display: true });
        if (boss) this.txt(px + 520, 204, BOSSES[k].jp, 20, CRIMSON, { display: true, origin: [1, 0] });
        this.txt(px, 246, boss ? BOSSES[k].title : '', 17, GOLD, { bold: true });
        this.txt(px, 282, about, 19, INK, { wrap: 510 });
        const kills = d.kills[k] || 0;
        this.txt(px, 392, boss ? (d.bosses[k] ? 'Defeated' : 'Not yet defeated') : `Sent on: ${kills}`, 18, '#7fe8ff', { bold: true });
        this.txt(px, 440, 'MEMORY', 14, MUTED, { bold: true, style: { letterSpacing: 3 } });
        const mem = d.memories[k] && MEMORIES[k] ? MEMORIES[k][0] : Controls.fmt('Strike it with the Konso hilt ({konso}) to hear what it remembers.');
        this.txt(px, 466, mem, 19, d.memories[k] ? '#cfe8ff' : '#5c5868', { wrap: 510, style: { fontStyle: d.memories[k] ? 'italic' : 'normal' } });
      }
    }
    this.footer(Controls.fmt('{up} {down} choose · {attack} back'));
  }

  fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }

  // ------------------------------------------------------------------ actions
  go(view) { this.view = view; this.sel = 0; this.msg = ''; Sfx.play('confirm'); this.render(); this.popIn(); }
  back() {
    const parent = { seals: 'rest', travel: 'rest', forms: 'rest', controls: 'pause', settings: 'pause', assist: 'settings', slot: 'slots', records: 'pause', duels: 'trial' }[this.view];
    if (parent && this.type !== this.view) { this.view = parent; this.sel = parent === 'slots' ? this.slotSel || 0 : 0; this.msg = ''; this.confirm = null; Sfx.play('select'); this.render(); this.popIn(); }
    else if (['map', 'inventory', 'journal', 'records'].includes(this.view) && this.type === 'pause') { this.view = 'pause'; this.sel = 0; this.render(); this.popIn(); }
    else this.close();
  }
  toggleSeal(id) {
    if (GS.toggleSeal(id)) { Sfx.play('confirm'); this.msg = ''; GS.save(); }
    else { Sfx.play('deny'); this.msg = 'Not enough free slots. Remove another seal first.'; }
    this.render();
  }
  buy(it) {
    const d = GS.data;
    const sold = it.type === 'seal' ? d.seals.includes(it.id) : !!d.bought[it.id];
    if (sold) return;
    if (d.reishi < it.price) { Sfx.play('deny'); this.msg = `You need ${it.price - d.reishi} more reishi.`; this.render(); return; }
    d.reishi -= it.price;
    if (it.type === 'seal') { d.seals.push(it.id); this.msg = ''; }
    else if (it.type === 'tool') { d.bought[it.id] = true; this.msg = ''; this.game.events.emit('toast', `${TOOLS[it.id].name} bought. Check the map.`); }
    else { d.bought[it.id] = true; const up = GS.addFragment(); this.msg = ''; this.game.events.emit('toast', up ? 'Four fragments fuse. Max health +1' : `Soul Fragment ${d.fragments}/4`); }
    GS.save();
    Sfx.play('pickup');
    this.render();
  }
  travel(id) {
    Sfx.play('door');
    this.scene.resume('game');
    this.scene.get('game').travelTo(id);
    this.scene.stop();
  }
  quit() {
    if (GS.rush) GS.endRush(false);
    GS.save();
    this.scene.stop('game');
    this.scene.stop('ui');
    this.scene.start('title');
  }

  onKey(code) {
    if (this.listening) return;
    const n = (this.items || []).length;
    if (this.view === 'controls') {
      // Fixed keys only here, so a rebinding mistake can never lock you out of this screen
      if (code === 'Backspace' || code === 'Delete' || code === 'Pad3') { this.clearCell(); return; }
      if (code === 'ArrowLeft' || code === 'PadLeft') { this.moveControls(-1, 0); return; }
      if (code === 'ArrowRight' || code === 'PadRight') { this.moveControls(1, 0); return; }
      if (code === 'ArrowUp' || code === 'PadUp') { this.moveControls(0, -1); return; }
      if (code === 'ArrowDown' || code === 'PadDown') { this.moveControls(0, 1); return; }
      if (code === 'Enter' || code === 'Space' || code === 'KeyZ' || code === 'Pad0') { const it = this.items[this.sel]; if (it) it.act(); return; }
      if (code === 'Escape' || code === 'Pad1') { this.back(); return; }
      return;
    }
    if (this.view === 'settings' || this.view === 'assist') {
      const it = this.items[this.sel], L = Controls.isLeft(code), R = Controls.isRight(code);
      if (it && it.row && (L || R)) { this.adjustSetting(it.row, L ? -1 : 1); return; }
    }
    if (this.view === 'map' && Controls.isConfirm(code)) { this.pinAt(this.cursor.x, this.cursor.y); return; }
    if (this.view === 'map' && (Controls.isUp(code) || Controls.isDownKey(code))) return;
    if (Controls.isUp(code)) { if (n) { this.sel = (this.sel + n - 1) % n; this.msg = ''; this.confirm = null; Sfx.play('select'); this.render(); } return; }
    if (Controls.isDownKey(code)) { if (n) { this.sel = (this.sel + 1) % n; this.msg = ''; this.confirm = null; Sfx.play('select'); this.render(); } return; }
    if (this.view === 'controls') return;
    if (Controls.isConfirm(code) || code === 'Space') {
      const it = this.items && this.items[this.sel];
      if (it && !it.disabled) it.act();
      else if (it && it.disabled) Sfx.play('deny');
      return;
    }
    if (Controls.isBack(code)) { this.back(); return; }
    if (Controls.is(code, 'map') && this.view === 'map') this.back();
    else if (Controls.is(code, 'inventory') && this.view === 'inventory') this.back();
    else if (Controls.is(code, 'pause') && this.view === 'pause') this.close();
  }
}
