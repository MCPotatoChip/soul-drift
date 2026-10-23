'use strict';
// ---------------------------------------------------------------------------
// Game state: the single source of truth for progress (saved) and the current
// run (not saved). Every scene reads and writes through GS so abilities never
// "reset" on a room transition.
// ---------------------------------------------------------------------------

// Three save slots. The first keeps the original key so saves from before slots existed load as slot 1.
const SAVE_KEY = 'soul-drift-save-v1';
const SLOT_COUNT = 3;
const SLOT_KEY = 'soul-drift-slot';
const slotKey = (i) => i ? `${SAVE_KEY}-${i + 1}` : SAVE_KEY;

// Where each room sat on the map before it was spread out (world version 3), so pins placed on the old map move with their rooms
const LEGACY_POS = {"kar_hub":[18,10],"kar_alley":[14,10],"kar_roof":[20,7.7],"kar_river":[24,10],"kar_grave":[31,7.6],"ruk_1":[31,10],"ruk_2":[38,10],"ruk_3":[44,10],"ruk_boss":[50.4,10],"sei_gate":[44,7.2],"sei_ward":[49.2,7.4],"sei_1":[55.6,6.4],"sei_11":[50.8,4.8],"sei_2":[59.6,1.8],"sei_4":[64.4,2.1],"sei_renji":[70,2.1],"sok_1":[64.4,-2],"sok_boss":[69.2,-3.1],"hm_1":[73.2,-4.6],"hm_2":[79.6,-5.4],"hm_3":[85.2,-5.4],"hm_grimm":[91.2,-4.6],"hm_side":[79.6,-7.7],"hm_boss":[85.2,-2.4],"hm_dome":[85.6,-8.2],"forest_1":[76.7,-2.3],"forest_2":[81.1,0.1],"dangai_1":[-1.5,5.6],"dangai_2":[-5.5,5.6],"end_1":[12,12.4],"end_boss":[7.2,12.4],"sei_lantern":[64.4,4.7],"hm_sand":[73.4,-6.9],"sok_shrine":[59.4,-2],"kar_study":[18.2,12.6],"palace":[18,4.5]};

const GS = {
  data: null,
  // Transient per-life state carried across rooms but never saved.
  run: null,
  // The slot being played (remembered between visits, so Continue picks it up)
  slot: (() => { try { return Phaser.Math.Clamp(parseInt(localStorage.getItem(SLOT_KEY), 10) || 0, 0, SLOT_COUNT - 1); } catch (e) { return 0; } })(),
  // A Soul King Palace trial in progress (see startRush): never saved, the real save waits in rush.backup
  rush: null,

  fresh() {
    return {
      room: 'kar_hub',
      restRoom: null,        // room id of the last rest gate used
      hp: 5, maxHp: 5,
      reiatsu: 0,
      reishi: 0,
      abilities: {},
      seals: [],             // owned seal ids
      equipped: [],          // equipped seal ids
      sealSlots: 3,
      fragments: 0,          // soul fragments toward the next max-HP upgrade
      fragmentsTotal: 0,
      pluses: 0,
      taken: {},             // collected pickups: "room:type:index" -> true
      bosses: {},            // defeated bosses
      broken: {},            // room -> ["x,y", ...] broken tiles
      visited: {},
      gates: {},             // discovered rest gates (fast travel)
      shade: null,           // { room, x, y, amount } lingering reiatsu after death
      bought: {},
      swordLevel: 0,         // swordsmith upgrades (0-3)
      ore: 0,                // reishi ore carried
      time: 0,
      cleared: false,
      deaths: 0,
      konsoed: {},           // enemy placements whose memory already yielded Reiatsu
      memories: {},          // kinds of enemy whose memories Konso has read
      quests: {},            // quest id -> 0 not started, 1 accepted, 2 done
      plus: 0,               // New Game+ cycles completed
      kills: {},             // enemy kind -> how many fell (the Journal)
      gifts: {},             // NPC name -> true once they have handed over their gift
      world: 3,              // layout version of the save (2: the expanded world, 3: upgrades, new rooms, new places for old rewards)
      upgrades: {},          // power upgrades found: track id -> level (see UPGRADES)
      notes: [],             // things the game tells the player once on loading (what a migration changed)
      forms: { zangetsu: true },   // Zanpakutō forms owned
      form: 'zangetsu',      // the form in hand
      pins: [],              // map pins: { room, x, y, kind } (x, y in tiles inside the room)
      splits: {},            // boss id -> play time when it first fell (the speedrun splits)
      items: {},             // quest items carried: id -> true
      palace: 0,             // 0 sealed, 1 the Royal Guard's message heard, 2 the palace visited
      rush: { best: null, bound: {}, wins: 0, single: {} },   // the Soul King Palace trials
      trueEnding: false,
    };
  },

  freshRun() {
    return { bankaiT: 0, maskOn: false, hollow: 0, maskLock: 0, region: null, debt: 0 };
  },
  useSlot(i) {
    this.slot = i;
    try { localStorage.setItem(SLOT_KEY, String(i)); } catch (e) { /* storage unavailable */ }
  },

  newGame() {
    this.data = this.fresh();
    this.run = this.freshRun();
    this.rush = null;
  },

  has(ability) { return !!(this.data && this.data.abilities[ability]); },
  sealOn(id) { return this.data.equipped.includes(id); },
  usedSlots() { return this.data.equipped.reduce((s, id) => s + (SEALS[id] ? SEALS[id].cost : 0), 0); },

  toggleSeal(id) {
    const d = this.data;
    if (d.equipped.includes(id)) {
      d.equipped = d.equipped.filter(s => s !== id);
      if (id === 'will') { d.maxHp -= 1; d.hp = Math.min(d.hp, d.maxHp); }
      return true;
    }
    if (this.usedSlots() + SEALS[id].cost > d.sealSlots) return false;
    d.equipped.push(id);
    if (id === 'will') { d.maxHp += 1; d.hp += 1; }
    return true;
  },

  // New Game+: enemies are tougher and pay more
  hpMul() { return 1 + 0.6 * Math.min(3, this.data.plus || 0); },
  // Bosses are tougher the sharper the Zanpakutō (a trial's blade binding counts as the plain edge)
  bossHpMul() { return 1 + BOSS_HP_PER_FORGE * this.swordLevel(); },
  // Levels of a power upgrade held (a trial that binds the seals leaves them be: upgrades are not seals)
  upgrade(id) { return (this.data.upgrades && this.data.upgrades[id]) || 0; },
  // The Pin Compass is not on the shelf until the story is over (a second journey keeps it for sale)
  shopOpen(it) { const d = this.data; return !(it.type === 'tool' && TOOLS[it.id] && TOOLS[it.id].needsClear) || !!d.cleared || (d.plus || 0) > 0; },
  dropMul() { return 1 + 0.5 * Math.min(3, this.data.plus || 0); },

  // A fresh journey that keeps what you earned: powers, seals, the edge of the blade and health
  newGamePlus(old) {
    const d = this.fresh();
    Object.assign(d, {
      abilities: Object.assign({}, old.abilities), seals: old.seals.slice(), equipped: old.equipped.slice(),
      sealSlots: old.sealSlots, swordLevel: old.swordLevel || 0, maxHp: old.maxHp, hp: old.maxHp,
      fragmentsTotal: old.fragmentsTotal, ore: old.ore || 0, reishi: old.reishi || 0, plus: (old.plus || 0) + 1,
      gifts: Object.assign({}, old.gifts), forms: Object.assign({}, old.forms), form: old.form,
      rush: old.rush, trueEnding: old.trueEnding, palace: old.palace, upgrades: Object.assign({}, old.upgrades),
    });
    this.data = d;
    this.run = this.freshRun();
  },
  // A saved game without making it the current one (for the title screen and the slot list)
  peek(slot = this.slot) {
    try { const raw = localStorage.getItem(slotKey(slot)); return raw ? this.migrate(Object.assign(this.fresh(), JSON.parse(raw))) : null; } catch (e) { return null; }
  },

  form() { return FORMS[this.data.form] || FORMS.zangetsu; },
  // The edge of the blade: forge levels (unless a trial binds it back to the plain edge) and the form's weight
  slashDamage() {
    const lvl = this.rush && this.rush.bind.blade ? 0 : (this.data.swordLevel || 0);
    return (COMBAT.slashDamage + lvl * COMBAT.swordBonus) * this.form().dmg;
  },
  swordLevel() { return this.rush && this.rush.bind.blade ? 0 : (this.data.swordLevel || 0); },

  // How full the Reiatsu vessel can get (a bound trial holds only a third)
  reiCap() { return this.rush && this.rush.bind.reiatsu ? COMBAT.spellCost : COMBAT.maxReiatsu; },
  addReiatsu(n, strike = false) {
    if (strike) n *= Settings.get('reiatsuGain') * (1 + 0.25 * this.upgrade('flow'));
    this.data.reiatsu = Phaser.Math.Clamp(this.data.reiatsu + n, 0, this.reiCap());
  },
  // Masks a blow of `n` really takes, after the assist setting: half damage carries the remainder
  // to the next blow, so every second hit costs a mask
  lose(n) {
    const k = Settings.get('damage');
    if (!k) return 0;
    this.run.debt = (this.run.debt || 0) + n * k;
    const lost = Math.floor(this.run.debt + 1e-6);
    this.run.debt -= lost;
    return lost;
  },

  addFragment() {
    const d = this.data;
    d.fragments += 1; d.fragmentsTotal += 1;
    if (d.fragments >= 4) { d.fragments = 0; d.maxHp += 1; d.hp = d.maxHp; return true; }
    return false;
  },

  markTaken(key) { this.data.taken[key] = true; },
  isTaken(key) { return !!this.data.taken[key]; },

  markBroken(room, x, y) {
    const b = this.data.broken[room] || (this.data.broken[room] = []);
    const k = x + ',' + y;
    if (!b.includes(k)) b.push(k);
  },
  isBroken(room, x, y) {
    const b = this.data.broken[room];
    return !!b && b.includes(x + ',' + y);
  },

  // During a trial only the real save (put aside when it began, plus the trial's records) is written
  save() {
    try {
      localStorage.setItem(slotKey(this.slot), JSON.stringify(this.rush ? this.rush.backup : this.data));
      if (typeof window !== 'undefined' && window.SD && SD.game) SD.game.events.emit('saved');
      return true;
    } catch (e) { return false; }
  },
  load(slot = this.slot) {
    try {
      const raw = localStorage.getItem(slotKey(slot));
      if (!raw) return false;
      this.data = this.migrate(Object.assign(this.fresh(), JSON.parse(raw)));
      this.run = this.freshRun();
      this.rush = null;
      this.useSlot(slot);
      return true;
    } catch (e) { return false; }
  },
  // Saves from before the world grew: the Rogue Captain became Byakuya, Konso is learned from Rukia
  // at the start, and two arenas lost the rest gates that sat inside them. World 3 (upgrades, new rooms,
  // Raikōhō and Shunkō moved out of Byakuya's corner) keeps every old pickup where it was found: seals and
  // powers are remembered by what you own, so the ones that moved are never handed out twice.
  migrate(d) {
    if (d.bosses.captain) { d.bosses.byakuya = true; delete d.bosses.captain; }
    if ((d.world || 1) < 2) {
      d.abilities.konso = true;
      d.gifts['Rukia Kuchiki'] = true;
      d.world = 2;
    }
    if ((d.world || 2) < 3) {
      d.upgrades = d.upgrades || {};
      d.notes = d.notes || [];
      // The compass is a reward for the end of the story: one bought early goes back on the shelf, refunded
      if (d.bought.compass && !d.cleared && !(d.plus > 0)) {
        delete d.bought.compass;
        d.reishi = (d.reishi || 0) + 180;
        d.notes.push('Urahara took the Pin Compass back and refunded 180 reishi. It goes on sale again once the Hollow within has fallen.');
      }
      // Map pins are saved as map coordinates, and every room has moved: carry each pin along with the room it sat on
      if (Array.isArray(d.pins) && d.pins.length) {
        d.pins = d.pins.map(pin => {
          let best = null, bestD = Infinity;
          Object.keys(LEGACY_POS).forEach(id => {
            const r = ROOMS[id], o = LEGACY_POS[id];
            if (!r) return;
            const w = r.tiles[0].length / 10, h = r.tiles.length / 10;
            const dx = Math.max(o[0] - pin.x, 0, pin.x - (o[0] + w)), dy = Math.max(o[1] - pin.y, 0, pin.y - (o[1] + h));
            const dist = Math.hypot(dx, dy) + (dx === 0 && dy === 0 ? 0 : 1) + (w * h) / 1000;   // inside beats near, small rooms beat big ones
            if (dist < bestD) { bestD = dist; best = id; }
          });
          if (!best) return pin;
          const o = LEGACY_POS[best], n = ROOMS[best].pos;
          return Object.assign({}, pin, { x: n[0] + (pin.x - o[0]), y: n[1] + (pin.y - o[1]) });
        });
      }
      // A body of work from before the update that already finished Byakuya has Raikōhō: nothing to do.
      // One that is still short of him finds it in the Kidō Shrine of Junrinan instead.
      if (d.bosses.byakuya && !d.abilities.raiko) d.abilities.raiko = true;
      d.world = 3;
    }
    d.upgrades = d.upgrades || {};
    d.notes = d.notes || [];
    const restOK = (id) => id && ROOMS[id] && ROOMS[id].tiles.some(r => r.includes('R'));
    const moved = { hm_boss: 'hm_2', forest_2: 'forest_1' };
    if (d.restRoom && !restOK(d.restRoom)) d.restRoom = moved[d.restRoom] || null;
    Object.keys(d.gates).forEach(id => { if (!restOK(id)) delete d.gates[id]; });
    if (!ROOMS[d.room]) d.room = d.restRoom || 'kar_hub';
    return d;
  },
  hasSave(slot = this.slot) {
    try { return !!localStorage.getItem(slotKey(slot)); } catch (e) { return false; }
  },
  wipe(slot = this.slot) {
    try { localStorage.removeItem(slotKey(slot)); } catch (e) { /* storage unavailable */ }
  },
  // ------------------------------------------------------------------ the trials of the palace
  // The real save is put aside; the trial plays on a copy with the bindings applied, and whatever
  // happens in it (bosses felled again, seal slots, deaths) is thrown away when it ends.
  startRush(mode, list, bind = {}) {
    const d = this.data;
    const b = Object.fromEntries(BINDING_ORDER.map(k => [k, !!bind[k]]));
    this.rush = { mode, list: list.slice(), i: 0, bind: b, t: 0, backup: JSON.parse(JSON.stringify(d)) };
    if (b.seals) { if (d.equipped.includes('will')) d.maxHp -= 1; d.equipped = []; }
    if (b.shell) d.maxHp = Math.min(d.maxHp, 4);
    d.hp = d.maxHp;
    d.reiatsu = 0;
    this.run = this.freshRun();
  },
  // Back to the real save, with the trial's records written into it. Returns { newBest, firstWin }.
  endRush(won) {
    const r = this.rush;
    if (!r) return {};
    const real = r.backup, rec = real.rush || (real.rush = { best: null, bound: {}, wins: 0, single: {} });
    this.rush = null;
    this.data = real;
    this.run = this.freshRun();
    const n = BINDING_ORDER.filter(k => r.bind[k]).length, res = { newBest: false, firstWin: false };
    if (won && r.mode === 'gauntlet') {
      res.firstWin = !rec.wins;
      rec.wins = (rec.wins || 0) + 1;
      if (rec.best == null || r.t < rec.best) { rec.best = r.t; res.newBest = true; }
      BINDING_ORDER.forEach(k => { if (r.bind[k]) rec.bound[k] = true; });
      if (n === BINDING_ORDER.length) rec.bound.all = true;
    } else if (won) {
      const id = r.list[0], s = rec.single[id] || (rec.single[id] = { best: null, bound: 0 });
      if (s.best == null || r.t < s.best) { s.best = r.t; res.newBest = true; }
      s.bound = Math.max(s.bound || 0, n);
    }
    real.hp = real.maxHp;
    this.save();
    return res;
  },

  // ------------------------------------------------------------------ speedrun splits
  // The best time each boss has ever first fallen at, over every journey and every slot
  bestSplits() {
    try { return JSON.parse(localStorage.getItem('soul-drift-splits') || '{}') || {}; } catch (e) { return {}; }
  },
  recordSplit(id, t) {
    const best = this.bestSplits();
    if (best[id] != null && best[id] <= t) return;
    best[id] = t;
    try { localStorage.setItem('soul-drift-splits', JSON.stringify(best)); } catch (e) { /* storage unavailable */ }
  },

  // What the slot list shows for each save
  summary(slot) {
    const d = this.peek(slot);
    if (!d) return null;
    const room = ROOMS[d.room] || ROOMS.kar_hub;
    return { d, room: room.name, region: room.region, pct: this.completion(d), time: d.time, deaths: d.deaths, plus: d.plus, cleared: d.cleared, trueEnding: d.trueEnding };
  },

  // How many of each collectible the world holds, counted from the rooms themselves
  totals() {
    if (this._totals) return this._totals;
    const t = { fragments: 0, pluses: 0, ore: 0 };
    Object.values(ROOMS).forEach(r => {
      const all = r.tiles.join('');
      t.fragments += (all.match(/f/g) || []).length;
      t.pluses += (all.match(/l/g) || []).length;
      t.ore += (all.match(/o/g) || []).length;
      (r.rewardItems || []).forEach(it => { if (it === 'fragment') t.fragments++; if (it === 'ore') t.ore++; });
    });
    t.fragments += SHOP_STOCK.filter(s => s.type === 'fragment').length;
    t.bosses = Object.keys(BOSSES).length;
    return (this._totals = t);
  },

  completion(d = this.data) {
    const T = this.totals();
    let have = 0, total = 0;
    ABILITY_ORDER.forEach(a => { total++; if (d.abilities[a]) have++; });
    total += Object.keys(SEALS).length; have += d.seals.filter(id => SEALS[id]).length;
    total += T.fragments; have += Math.min(T.fragments, d.fragmentsTotal);
    total += T.pluses; have += Math.min(T.pluses, d.pluses);
    total += T.bosses; have += Object.keys(d.bosses).filter(b => BOSSES[b]).length;
    total += FORGE.length; have += d.swordLevel || 0;
    total += FORM_ORDER.length; have += FORM_ORDER.filter(f => d.forms && d.forms[f]).length;
    total += QUEST_ORDER.length; have += QUEST_ORDER.filter(q => d.quests[q] === 2).length;
    UPGRADE_ORDER.forEach(u => { total += UPGRADES[u].max; have += Math.min(UPGRADES[u].max, (d.upgrades && d.upgrades[u]) || 0); });
    return Math.floor(have / total * 100);
  },
};
