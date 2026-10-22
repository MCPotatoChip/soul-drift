'use strict';
// ---------------------------------------------------------------------------
// MenuScene: pauses the game and shows one of: pause, controls (rebinding),
// rest, seals, travel, shop, map, inventory. It also opens from the title
// screen for rebinding. Up/down move, jump/Enter confirms, slash/Esc goes back.
// ---------------------------------------------------------------------------

class MenuScene extends Phaser.Scene {
  constructor() { super('menu'); }
  init(data) { this.type = data.type; }

  create() {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x07070b, 0.95).setOrigin(0);
    this.layer = this.add.container(0, 0);
    this.sel = 0;
    this.view = this.type;
    this.msg = '';
    this.listening = null;
    const off = Controls.on((code) => this.onKey(code));
    this.events.once('shutdown', () => { off(); Controls.capture = null; });
    this.render();
  }

  close() {
    Sfx.play('select');
    if (this.scene.isPaused('game')) this.scene.resume('game');
    this.scene.stop();
  }

  // ------------------------------------------------------------------ helpers
  clear() { this.layer.removeAll(true); }
  txt(x, y, s, size = 22, color = INK, o = {}) {
    const t = this.add.text(x, y, s, Object.assign({ fontFamily: o.display ? FONT_DISPLAY : FONT_BODY, fontSize: size + 'px', color, fontStyle: o.bold ? '700' : o.display ? '800' : 'normal', wordWrap: o.wrap ? { width: o.wrap } : undefined, lineSpacing: 4 }, o.style || {}));
    if (o.origin !== undefined) t.setOrigin(...[].concat(o.origin));
    this.layer.add(t);
    return t;
  }
  title(s, sub) {
    this.txt(GAME_W / 2, 70, s, 52, INK, { display: true, origin: 0.5 });
    const g = this.add.graphics();
    g.lineStyle(2, 0xd8343f, 1).lineBetween(GAME_W / 2 - 50, 112, GAME_W / 2 + 50, 112);
    this.layer.add(g);
    if (sub) this.txt(GAME_W / 2, 134, sub, 18, MUTED, { origin: 0.5 });
  }
  list(items, x, y, gap = 46, w = 420) {
    items.forEach((it, i) => {
      const on = i === this.sel;
      if (on) {
        const g = this.add.graphics();
        g.fillStyle(0xe9e4d8, 0.08).fillRect(x - 16, y + i * gap - 6, w, gap - 6);
        g.fillStyle(0xd8343f, 1).fillRect(x - 16, y + i * gap - 6, 3, gap - 6);
        this.layer.add(g);
      }
      this.txt(x, y + i * gap, it.label, 24, it.disabled ? '#5c5868' : on ? INK : '#b8b2c4', { bold: on });
      this.hit(x - 16, y + i * gap - 6, w, gap - 6, () => this.tapItem(i));
      if (it.right) this.txt(x + w - 32, y + i * gap, it.right, 20, it.rightColor || MUTED, { origin: [1, 0] });
    });
  }
  footer(s) { this.txt(GAME_W / 2, GAME_H - 40, s, 16, MUTED, { origin: 0.5 }); }
  // Invisible tap target (touch screens); lives in the layer so every render rebuilds it
  hit(x, y, w, h, fn) {
    const z = this.add.zone(x, y, w, h).setOrigin(0).setInteractive();
    z.on('pointerdown', fn);
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
        this.title('Paused', ROOMS[d.room].name);
        this.items = [{ label: 'Resume', act: () => this.close() }, { label: 'Controls', act: () => this.go('controls') }, { label: 'Map', act: () => this.go('map') },
          { label: 'Inventory', act: () => this.go('inventory') }, { label: 'Settings', act: () => this.go('settings') },
          { label: 'Quit to title', act: () => this.quit() }];
        this.list(this.items, GAME_W / 2 - 190, 210);
        this.footer('Progress saves at rest gates and when you collect things. Quitting returns you to your last rest gate.');
        break;
      }
      case 'controls': { this.renderControls(); break; }
      case 'settings': { this.renderSettings(); break; }
      case 'rest': {
        this.title('Senkaimon Rest Gate', 'Progress saved · health restored');
        const gates = Object.keys(d.gates).length;
        this.items = [{ label: 'Equip seals', right: `${GS.usedSlots()}/${d.sealSlots} slots`, act: () => this.go('seals') },
          { label: 'Travel', right: gates > 1 ? `${gates} gates` : 'find more gates', disabled: gates < 2, act: () => gates > 1 && this.go('travel') },
          { label: 'Rise', act: () => this.close() }];
        this.list(this.items, GAME_W / 2 - 210, 220, 50, 440);
        this.footer(Controls.fmt('{jump} select · {attack} rise'));
        break;
      }
      case 'seals': {
        this.title('Zanpakuto Seals', `Slots used ${GS.usedSlots()} / ${d.sealSlots}`);
        const owned = Object.keys(SEALS).filter(id => d.seals.includes(id));
        this.items = owned.map(id => {
          const s = SEALS[id], on = GS.sealOn(id);
          return { id, label: (on ? '● ' : '○ ') + s.name, right: '◆'.repeat(s.cost), rightColor: on ? GOLD : MUTED, act: () => this.toggleSeal(id) };
        });
        if (!owned.length) this.txt(GAME_W / 2, 260, 'You have no seals yet. They hide all over the world, and the shop sells a few.', 20, MUTED, { origin: 0.5 });
        this.list(this.items, 200, 190, 46, 460);
        const cur = this.items[this.sel];
        if (cur) {
          const s = SEALS[cur.id];
          this.txt(740, 190, s.name, 32, INK, { display: true });
          this.txt(740, 240, `Cost ${s.cost} slot${s.cost > 1 ? 's' : ''}`, 18, GOLD, { bold: true });
          this.txt(740, 280, s.desc, 22, INK, { wrap: 440 });
        }
        if (this.msg) this.txt(GAME_W / 2, GAME_H - 80, this.msg, 18, CRIMSON, { origin: 0.5 });
        this.footer(Controls.fmt('{jump} equip or remove · {attack} back'));
        break;
      }
      case 'travel': {
        this.title('Travel', 'Step through the gate to any rest gate you have found');
        this.items = Object.keys(ROOMS).filter(id => d.gates[id]).map(id => ({
          label: ROOMS[id].name, right: id === d.room ? 'here' : REGIONS[ROOMS[id].region].name, disabled: id === d.room,
          act: () => { if (id !== d.room) this.travel(id); },
        }));
        this.list(this.items, GAME_W / 2 - 260, 190, 46, 520);
        this.footer(Controls.fmt('{jump} travel · {attack} back'));
        break;
      }
      case 'shop': {
        this.title('Spirit Goods', 'The merchant tips a striped hat. "Reishi only, no refunds."');
        this.items = SHOP_STOCK.map(it => {
          const sold = it.type === 'seal' ? d.seals.includes(it.id) : !!d.bought[it.id];
          const name = it.type === 'seal' ? SEALS[it.id].name + ' (seal)' : 'Soul Fragment';
          return { it, label: name, right: sold ? 'sold' : it.price + ' reishi', disabled: sold, rightColor: !sold && d.reishi >= it.price ? GOLD : MUTED, act: () => this.buy(it) };
        });
        this.items.push({ label: 'Leave', act: () => this.close() });
        this.list(this.items, 200, 200, 50, 520);
        const cur = this.items[this.sel];
        if (cur && cur.it) {
          const desc = cur.it.type === 'seal' ? SEALS[cur.it.id].desc : 'Collect four to grow your soul vessel by one mask.';
          this.txt(800, 200, desc, 21, INK, { wrap: 380 });
        }
        this.txt(200, GAME_H - 110, `You carry ${d.reishi} reishi`, 20, '#7fe8ff', { bold: true });
        if (this.msg) this.txt(GAME_W / 2, GAME_H - 80, this.msg, 18, CRIMSON, { origin: 0.5 });
        this.footer(Controls.fmt('{jump} buy · {attack} leave'));
        break;
      }
      case 'forge': this.renderForge(); break;
      case 'map': this.renderMap(); break;
      case 'inventory': this.renderInventory(); break;
    }
  }

  renderSettings() {
    this.title('Settings', 'Left and right change a value. Changes save right away.');
    this.items = Settings.schema.map(row => ({ row, label: row[1], right: Settings.label(row), rightColor: GOLD, act: () => this.adjustSetting(row, 1, true) }));
    this.items.push({ label: 'Back', act: () => this.back() });
    this.list(this.items, GAME_W / 2 - 300, 200, 52, 600);
    this.footer(Controls.fmt('{left} {right} change · {jump} next value · {attack} back'));
  }
  adjustSetting(row, dir, wrap = false) {
    // Confirm and taps wrap a slider round to 0 instead of sticking at full
    if (wrap && row[2] === 'slider' && dir > 0 && Settings.get(row[0]) >= 1) Settings.set(row[0], 0);
    else Settings.adjust(row, dir);
    Sfx.play('select');
    this.render();
  }

  // Two columns of actions; confirm rebinds the main key, Backspace removes an alternate key
  renderControls() {
    this.title('Controls', 'Pick an action and press its new key. Changes save right away.');
    const n = ACTIONS.length, half = Math.ceil(n / 2);
    this.items = ACTIONS.map(([id, label]) => ({ id, label, act: () => this.listen(id) }));
    this.items.push({ id: null, label: 'Reset to defaults', act: () => { Controls.reset(); this.msg = 'Controls reset to the defaults.'; Sfx.play('confirm'); this.render(); } });
    this.items.push({ id: null, pos: { col: 1, row: half - 1 }, label: 'Touch controls: ' + (Touch.enabled ? 'on' : 'off'), act: () => { Touch.setEnabled(!Touch.enabled); Sfx.play('confirm'); this.render(); } });
    this.items.push({ id: null, pos: { col: 1, row: half }, label: 'Edit touch layout…', act: () => Touch.openEditor() });
    this.items.forEach((it, i) => {
      const col = it.pos ? it.pos.col : it.id ? (i < half ? 0 : 1) : 0;
      const row = it.pos ? it.pos.row : it.id ? (i < half ? i : i - half) : half + 0.6;
      const x = col ? 690 : 130, y = 176 + row * 46, w = 470, on = i === this.sel;
      const g = this.add.graphics();
      if (on) {
        g.fillStyle(0xe9e4d8, 0.08).fillRect(x - 14, y - 7, w, 40);
        g.fillStyle(0xd8343f, 1).fillRect(x - 14, y - 7, 3, 40);
      }
      this.layer.add(g);
      this.hit(x - 14, y - 7, w, 40, () => this.tapItem(i));
      this.txt(x, y, it.label, 21, on ? INK : '#b8b2c4', { bold: on });
      if (it.id) {
        const waiting = this.listening === it.id;
        const keyText = waiting ? 'press a key…' : Controls.keys(it.id);
        const t = this.txt(x + w - 30, y - 1, keyText, 19, waiting ? '#07070b' : GOLD, {
          bold: true, origin: [1, 0], style: waiting ? { backgroundColor: GOLD, padding: { x: 8, y: 2 } } : {},
        });
        if (waiting) this.tweens.add({ targets: t, alpha: 0.5, yoyo: true, repeat: -1, duration: 400 });
      }
    });
    if (this.msg) this.txt(GAME_W / 2, GAME_H - 82, this.msg, 18, CRIMSON, { origin: 0.5 });
    this.footer(this.listening ? 'Press the new key. Esc cancels.'
      : `${Controls.key('up')} ${Controls.key('down')} ${Controls.key('left')} ${Controls.key('right')} choose · Enter change key · Backspace remove the alternate key · Esc back`);
  }
  listen(id) {
    this.listening = id;
    this.msg = '';
    Sfx.play('select');
    this.render();
    Controls.capture = (code) => {
      this.listening = null;
      if (code === 'Escape') { this.msg = ''; Sfx.play('select'); this.render(); return; }
      const res = Controls.rebind(id, 0, code);
      const name = (a) => (ACTIONS.find(x => x[0] === a) || [a, a])[1];
      if (!res.ok) { this.msg = `${Controls.keyName(code)} is the only key for ${name(res.owner)}. Rebind that action first.`; Sfx.play('deny'); }
      else { this.msg = res.owner ? `Swapped: ${name(res.owner)} now uses ${Controls.keys(res.owner)}.` : ''; Sfx.play('confirm'); }
      this.render();
    };
  }

  renderForge() {
    const d = GS.data, lvl = d.swordLevel || 0, next = FORGE[lvl];
    this.title('Swordsmith', '"Bring me reishi and the ore that grows where Hollows die. I will give that blade its teeth back."');
    this.txt(GAME_W / 2, 186, `Zanpakuto edge  ·  level ${lvl} of ${FORGE.length}`, 26, INK, { origin: 0.5, display: true });
    const g = this.add.graphics();
    this.layer.add(g);
    for (let i = 0; i < FORGE.length; i++) {
      const cx = GAME_W / 2 - 40 + i * 40, cy = 236;
      g.fillStyle(i < lvl ? 0xd9b35a : 0x2a2733, 1);
      g.fillPoints([{ x: cx, y: cy - 10 }, { x: cx + 10, y: cy }, { x: cx, y: cy + 10 }, { x: cx - 10, y: cy }], true);
    }
    this.txt(GAME_W / 2, 262, next ? `Slash damage ${GS.slashDamage()} → ${GS.slashDamage() + COMBAT.swordBonus}` : `Slash damage ${GS.slashDamage()}`, 20, GOLD, { origin: 0.5, bold: true });
    this.items = [];
    if (next) {
      const ok = d.reishi >= next.reishi && (d.ore || 0) >= next.ore;
      this.items.push({ label: 'Sharpen the edge', right: `${next.reishi} reishi${next.ore ? `  ·  ${next.ore} ore` : ''}`, rightColor: ok ? GOLD : MUTED, act: () => this.forge() });
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

  renderMap() {
    const d = GS.data;
    this.title('Map', 'Rooms you have walked through');
    const ids = Object.keys(ROOMS);
    const box = (id) => { const r = ROOMS[id], H = r.tiles.length, W = r.tiles[0].length; return { x: r.pos[0], y: r.pos[1], w: W / 10, h: H / 10 }; };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ids.forEach(id => { const b = box(id); minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h); });
    const areaW = 1160, areaH = 470, ox = 60, oy = 170;
    const sc = Math.min(areaW / (maxX - minX), areaH / (maxY - minY));
    const P = (x, y) => ({ x: ox + (x - minX) * sc, y: oy + (y - minY) * sc });
    const g = this.add.graphics();
    this.layer.add(g);
    // known neighbours appear as faint outlines
    const known = new Set();
    ids.forEach(id => { if (d.visited[id]) Object.values(ROOMS[id].doors).forEach(([to]) => known.add(to)); });
    ids.forEach(id => {
      const b = box(id), p = P(b.x, b.y), w = b.w * sc, h = b.h * sc;
      if (d.visited[id]) {
        g.fillStyle(REGIONS[ROOMS[id].region].color, id === d.room ? 0.55 : 0.28).fillRect(p.x, p.y, w, h);
        g.lineStyle(2, id === d.room ? 0xffffff : 0xe9e4d8, id === d.room ? 1 : 0.6).strokeRect(p.x, p.y, w, h);
        if (d.gates[id]) {
          g.fillStyle(0xffe8b0, 1).fillCircle(p.x + 8, p.y + 8, 4);
        }
        if (sc * b.w > 60) this.txt(p.x + 4, p.y + h - 4, ROOMS[id].name, 13, INK, { origin: [0, 1] });
      } else if (known.has(id)) {
        g.lineStyle(1, 0xe9e4d8, 0.25).strokeRect(p.x, p.y, w, h);
      }
    });
    // the player
    const cur = box(d.room), game = this.scene.get('game');
    if (game && game.player) {
      const px = cur.x + game.player.x / TILE / 10, py = cur.y + game.player.y / TILE / 10;
      const p = P(px, py);
      g.fillStyle(0xd8343f, 1).fillCircle(p.x, p.y, 6);
      g.lineStyle(2, 0xffffff, 1).strokeCircle(p.x, p.y, 8);
    }
    this.items = [];
    this.hit(0, 0, GAME_W, GAME_H, () => this.back());
    this.footer(Controls.fmt('Red marker: you · gold dot: rest gate · {map} or {attack} close'));
  }

  renderInventory() {
    const d = GS.data;
    this.title('Inventory', `${GS.completion()}% complete · ${this.fmtTime(d.time)}`);
    this.txt(150, 180, 'ABILITIES', 15, MUTED, { bold: true, style: { letterSpacing: 3 } });
    ABILITY_ORDER.forEach((id, i) => {
      const a = ABILITIES[id], has = !!d.abilities[id];
      this.txt(150, 214 + i * 38, has ? a.name : '? ? ?', 22, has ? INK : '#4c4858', { bold: has });
      if (has) this.txt(520, 216 + i * 38, a.key, 17, GOLD, { origin: [1, 0] });
    });
    const x = 700;
    this.txt(x, 180, 'SOUL', 15, MUTED, { bold: true, style: { letterSpacing: 3 } });
    const rows = [
      ['Health', `${d.maxHp} masks`], ['Soul fragments', `${d.fragments} / 4  (${d.fragmentsTotal} of 8 found)`],
      ['Zanpakuto edge', `level ${d.swordLevel || 0} of ${FORGE.length}`], ['Reishi ore', String(d.ore || 0)],
      ['Lost pluses sent on', `${d.pluses} / 6`], ['Seal slots', `${GS.usedSlots()} / ${d.sealSlots} used`],
      ['Reishi', String(d.reishi)], ['Bosses felled', `${Object.keys(d.bosses).length} / 5`],
    ];
    rows.forEach(([k, v], i) => {
      this.txt(x, 214 + i * 36, k, 20, '#b8b2c4');
      this.txt(x + 460, 214 + i * 36, v, 20, INK, { bold: true, origin: [1, 0] });
    });
    this.txt(x, 520, 'EQUIPPED SEALS', 15, MUTED, { bold: true, style: { letterSpacing: 3 } });
    const eq = d.equipped.map(id => SEALS[id].name);
    this.txt(x, 548, eq.length ? eq.join(' · ') : 'None. Equip seals at a rest gate.', 19, eq.length ? INK : MUTED, { wrap: 470 });
    this.items = [];
    this.hit(0, 0, GAME_W, GAME_H, () => this.back());
    this.footer(Controls.fmt('{inventory} or {attack} close'));
  }

  fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }

  // ------------------------------------------------------------------ actions
  go(view) { this.view = view; this.sel = 0; this.msg = ''; Sfx.play('confirm'); this.render(); }
  back() {
    const parent = { seals: 'rest', travel: 'rest', controls: 'pause', settings: 'pause' }[this.view];
    if (parent && this.type !== this.view) { this.view = parent; this.sel = 0; this.msg = ''; Sfx.play('select'); this.render(); }
    else if ((this.view === 'map' || this.view === 'inventory') && this.type === 'pause') { this.view = 'pause'; this.sel = 0; this.render(); }
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
    GS.save();
    this.scene.stop('game');
    this.scene.stop('ui');
    this.scene.start('title');
  }

  onKey(code) {
    if (this.listening) return;
    const n = (this.items || []).length;
    if (this.view === 'controls') {
      const half = Math.ceil(ACTIONS.length / 2);
      if (code === 'Backspace' || code === 'Delete') {
        const it = this.items[this.sel];
        if (it && it.id && Controls.bindings[it.id].length > 1) { Controls.clearAlt(it.id); this.msg = ''; Sfx.play('select'); this.render(); }
        return;
      }
      if ((code === 'ArrowLeft' || code === 'ArrowRight' || Controls.is(code, 'left') || Controls.is(code, 'right')) && this.sel < ACTIONS.length) {
        this.sel = this.sel < half ? Math.min(this.sel + half, ACTIONS.length - 1) : this.sel - half;
        this.msg = ''; Sfx.play('select'); this.render();
        return;
      }
      if (code === 'Enter' || code === 'Space' || code === 'KeyZ') { const it = this.items[this.sel]; if (it) it.act(); return; }
      if (code === 'Escape') { this.back(); return; }
    }
    if (this.view === 'settings') {
      const it = this.items[this.sel], L = code === 'ArrowLeft' || Controls.is(code, 'left'), R = code === 'ArrowRight' || Controls.is(code, 'right');
      if (it && it.row && (L || R)) { this.adjustSetting(it.row, L ? -1 : 1); return; }
    }
    if (Controls.isUp(code)) { if (n) { this.sel = (this.sel + n - 1) % n; this.msg = ''; Sfx.play('select'); this.render(); } return; }
    if (Controls.isDownKey(code)) { if (n) { this.sel = (this.sel + 1) % n; this.msg = ''; Sfx.play('select'); this.render(); } return; }
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
