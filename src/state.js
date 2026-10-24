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

// Where each room sat in world version 3 as [x, y, width in tiles, tiles added on its left by world 4]
const LEGACY3 = {"kar_hub":[0,0,60,9],"kar_alley":[-5,0,40,0],"kar_roof":[3.8,-3.2,50,0],"kar_river":[6.9,0,70,9],"kar_grave":[14.7,-3.2,48,0],"ruk_1":[22.7,0,70,9],"ruk_2":[38.3,0,60,9],"ruk_3":[45.1,0,64,9],"ruk_boss":[59.1,0,40,0],"sei_gate":[44.5,-6.4,52,9],"sei_ward":[57.7,-6.4,64,9],"sei_1":[71.7,-7,50,9],"sei_11":[66.6,-3.4,48,0],"sei_2":[75.6,-12.5,48,9],"sei_4":[87.6,-10.3,56,9],"sei_renji":[94,-10.3,52,0],"sok_1":[81.3,-15.3,48,9],"sok_boss":[93.9,-14.9,40,0],"hm_1":[98.8,-16.4,64,9],"hm_2":[115.3,-17.2,56,9],"hm_3":[121.8,-17.2,60,9],"hm_grimm":[136,-16.4,52,0],"hm_side":[116.4,-20.4,40,0],"hm_boss":[121.8,-12.5,48,0],"hm_dome":[122.2,-20.9,52,0],"forest_1":[102.3,-13.2,44,0],"forest_2":[115.7,-10.8,48,0],"dangai_1":[-16,-8,150,0],"dangai_2":[-0.2,-8,40,9],"end_1":[-6.8,3.4,60,9],"end_boss":[-12.4,3.4,48,0],"sei_lantern":[87.5,-6.9,52,0],"hm_sand":[99.5,-20.3,60,0],"sok_shrine":[75.4,-19.5,50,0],"kar_study":[2.2,3.2,60,0],"palace":[6,-14,56,0],"kar_canal":[14.7,0,72,9],"ruk_orchard":[30.5,-0.7,70,9],"ruk_kido_hall":[30.5,-3.9,44,9],"ruk_ravine_edge":[52.3,0,60,9],"sei_canal":[50.5,-6.4,64,9],"sei_barracks":[64.9,-6.4,60,9],"sei_infirmary":[81.2,-10.3,56,9],"sok_stair":[87,-14.9,60,9],"hm_dunes":[106,-17.1,84,9],"hm_vault":[110.8,-20.3,48,0],"hm_hall2":[128.7,-16.4,64,9],"forest_depths":[107.6,-11.1,72,9],"dangai_3":[4.6,-8,80,9]};

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
      temper: {},            // spare ore spent on the blade: keen, quick, long (see TEMPERS)
      ore: 0,                // reishi ore carried
      time: 0,
      cleared: false,
      deaths: 0,
      konsoed: {},           // enemy placements whose memory already yielded Reiatsu
      memories: {},          // kinds of enemy whose memories Konso has read
      quests: {},            // quest id -> 0 not started, 1 accepted, 2 done
      kills: {},             // enemy kind -> how many fell (the Journal)
      gifts: {},             // NPC name -> true once they have handed over their gift
      world: 5,              // layout version of the save (2: the expanded world, 3: upgrades, new rooms, new places for old rewards, 4: wider rooms, 5: difficulty, seal costs, Aizen)
      fallen: false,         // lost on a difficulty that allows one death: the save can no longer be continued
      difficulty: 'normal',  // see DIFFICULTY: chosen when the journey begins, changed only at a rest gate
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

  // combo: strikes landed in a row without being hit (comboT: time left for the next one); primed: Bankai's
  // five-strike condition met (kept until you are hit); bankaiCD: seconds before Bankai can be called again
  freshRun() {
    return { bankaiT: 0, maskOn: false, hollow: 0, maskLock: 0, region: null, debt: 0, combo: 0, comboT: 0, primed: false, bankaiCD: 0 };
  },
  // The difficulty of the journey being played
  diff() { return DIFFICULTY[(this.data && this.data.difficulty) || 'normal'] || DIFFICULTY.normal; },
  // A strike landed (one per swing): counts toward the five Bankai answers to
  comboHit() {
    const r = this.run;
    if (!r) return;
    r.combo = r.comboT > 0 ? r.combo + 1 : 1;
    r.comboT = COMBAT.comboWindow;
    if (r.combo >= COMBAT.bankaiCombo) r.primed = true;
  },
  comboBreak() { if (this.run) { this.run.combo = 0; this.run.comboT = 0; this.run.primed = false; } },
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

  // Damage bonus against a kind of foe you have studied: slain STUDY_KILLS of them, and heard its memory with the Konsō hilt
  studyMul(kind) {
    const d = this.data;
    return 1 + 0.05 * ((d.kills[kind] || 0) >= STUDY_KILLS ? 1 : 0) + 0.05 * (d.memories[kind] ? 1 : 0);
  },
  // Health of a non-boss foe on this difficulty (bosses use bossHpMul and the difficulty's bossHp)
  foeHpMul(kind) { return BOSS_KINDS.includes(kind) ? 1 : this.diff().foeHp; },
  // Bosses are tougher the sharper the Zanpakutō (a trial's blade binding counts as the plain edge)
  bossHpMul() { return 1 + BOSS_HP_PER_FORGE * this.swordLevel(); },
  // Levels of a power upgrade held (a trial that binds the seals leaves them be: upgrades are not seals)
  upgrade(id) { return (this.data.upgrades && this.data.upgrades[id]) || 0; },
  // The Pin Compass is not on the shelf until the story is over (a second journey keeps it for sale)
  shopOpen(it) { const d = this.data; return !(it.type === 'tool' && TOOLS[it.id] && TOOLS[it.id].needsClear) || !!d.cleared; },
  dropMul() { return this.data.equipped && this.data.equipped.includes('magnet') ? 1.25 : 1; },

  // A saved game without making it the current one (for the title screen and the slot list)
  peek(slot = this.slot) {
    try { const raw = localStorage.getItem(slotKey(slot)); return raw ? this.migrate(Object.assign(this.fresh(), JSON.parse(raw))) : null; } catch (e) { return null; }
  },

  form() { return FORMS[this.data.form] || FORMS.zangetsu; },
  // The edge of the blade: forge levels (unless a trial binds it back to the plain edge) and the form's weight
  slashDamage() {
    const lvl = this.rush && this.rush.bind.blade ? 0 : (this.data.swordLevel || 0);
    return (COMBAT.slashDamage + lvl * COMBAT.swordBonus) * this.form().dmg * (1 + 0.08 * this.temper('keen'));
  },
  // Levels of a temper (a trial that binds the blade back to its first edge sets them aside too)
  temper(id) { return this.rush && this.rush.bind.blade ? 0 : ((this.data.temper || {})[id] || 0); },
  swordLevel() { return this.rush && this.rush.bind.blade ? 0 : (this.data.swordLevel || 0); },

  // How full the Reiatsu vessel can get (a bound trial holds only a third)
  reiCap() { return this.rush && this.rush.bind.reiatsu ? COMBAT.spellCost : COMBAT.maxReiatsu; },
  addReiatsu(n, strike = false) {
    if (strike) n *= this.diff().reiatsu * (1 + 0.25 * this.upgrade('flow'));
    this.data.reiatsu = Phaser.Math.Clamp(this.data.reiatsu + n, 0, this.reiCap());
  },
  // Masks a blow of `n` really takes on this difficulty: half damage carries the remainder
  // to the next blow, so every second hit costs a mask. (GS.god, for testing, takes nothing.)
  lose(n) {
    const k = this.god ? 0 : this.diff().damage;
    this.comboBreak();
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
  // Move map pins that sat on rooms in `from` ({room: [x, y, ...]}) to where `to(room, pin)` says
  carryPins(pins, from, to) {
    if (!Array.isArray(pins) || !pins.length) return pins;
    return pins.map(pin => {
      let best = null, bestD = Infinity;
      Object.keys(from).forEach(id => {
        const r = ROOMS[id], o = from[id];
        if (!r) return;
        const w = (LEGACY3[id] ? LEGACY3[id][2] : r.tiles[0].length) / 10, h = r.tiles.length / 10;
        const dx = Math.max(o[0] - pin.x, 0, pin.x - (o[0] + w)), dy = Math.max(o[1] - pin.y, 0, pin.y - (o[1] + h));
        const dist = Math.hypot(dx, dy) + (dx === 0 && dy === 0 ? 0 : 1) + (w * h) / 1000;   // inside beats near, small rooms beat big ones
        if (dist < bestD) { bestD = dist; best = id; }
      });
      if (!best) return pin;
      const [x, y] = to(best, pin);
      return Object.assign({}, pin, { x, y });
    });
  },
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
      if (d.bought.compass && !d.cleared) {
        delete d.bought.compass;
        d.reishi = (d.reishi || 0) + 180;
        d.notes.push('Urahara took the Pin Compass back and refunded 180 reishi. It goes on sale again once the Hollow within has fallen.');
      }
      // Map pins are saved as map coordinates, and every room has moved: carry each pin along with the room it sat on
      d.pins = this.carryPins(d.pins, LEGACY_POS, (id, o) => [LEGACY3[id][0] + (o.x - LEGACY_POS[id][0]), LEGACY3[id][1] + (o.y - LEGACY_POS[id][1])]);
      // A body of work from before the update that already finished Byakuya has Raikōhō: nothing to do.
      // One that is still short of him finds it in the Kidō Shrine of Junrinan instead.
      if (d.bosses.byakuya && !d.abilities.raiko) d.abilities.raiko = true;
      d.world = 3;
    }
    if (d.world < 4) {
      // World 4 widened the rooms (a run-up beside each doorway) and spread the map sideways: pins follow their rooms again
      d.pins = this.carryPins(d.pins, LEGACY3, (id, o) => [ROOMS[id].pos[0] + (o.x - LEGACY3[id][0]) + LEGACY3[id][3] / 10, ROOMS[id].pos[1] + (o.y - LEGACY3[id][1])]);
      d.world = 4;
    }
    if (d.world < 5) {
      // World 5: the assist settings became a difficulty for each journey. A save takes the one closest to how it was played.
      d.notes = d.notes || [];
      {   // (the save itself never held one: what `fresh` filled in is replaced)
        let old = null;
        try { old = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) { /* storage unavailable */ }
        old = old || {};
        d.difficulty = old.bossHard || old.damage > 1 ? 'hard' : (old.damage !== undefined && old.damage < 1) || old.invuln > 1 || old.reiatsuGain > 1 || old.speed < 1 ? 'easy' : 'normal';
        d.notes.push(`This journey is played on ${DIFFICULTY[d.difficulty].name}. The difficulty can be changed at any rest gate.`);
      }
      // Some seals cost more slots now: take off the last ones put on until the rest fit
      const fit = () => d.equipped.reduce((n, id) => n + (SEALS[id] ? SEALS[id].cost : 0), 0) <= d.sealSlots;
      const off = [];
      while (d.equipped.length && !fit()) {
        const id = d.equipped.pop();
        off.push(SEALS[id] ? SEALS[id].name : id);
        if (id === 'will') { d.maxHp -= 1; d.hp = Math.min(d.hp, d.maxHp); }
      }
      if (off.length) d.notes.push(`Seal costs changed: ${off.join(', ')} ${off.length > 1 ? 'were' : 'was'} taken off to fit your slots. Equip seals again at a rest gate.`);
      d.world = 5;
    }
    if (!DIFFICULTY[d.difficulty]) d.difficulty = 'normal';
    d.upgrades = d.upgrades || {};
    d.notes = d.notes || [];
    d.temper = d.temper || {};
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
    return { d, room: room.name, region: room.region, pct: this.completion(d), time: d.time, deaths: d.deaths, fallen: !!d.fallen, cleared: d.cleared, trueEnding: d.trueEnding, difficulty: d.difficulty };
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
    t.bosses = STORY_BOSSES.length;
    return (this._totals = t);
  },

  completion(d = this.data) {
    const T = this.totals();
    let have = 0, total = 0;
    ABILITY_ORDER.forEach(a => { total++; if (d.abilities[a]) have++; });
    total += Object.keys(SEALS).length; have += d.seals.filter(id => SEALS[id]).length;
    total += T.fragments; have += Math.min(T.fragments, d.fragmentsTotal);
    total += T.pluses; have += Math.min(T.pluses, d.pluses);
    total += COMPLETION_BOSSES.length; have += COMPLETION_BOSSES.filter(b => d.bosses[b]).length;
    total += FORGE.length; have += d.swordLevel || 0;
    total += FORM_ORDER.length; have += FORM_ORDER.filter(f => d.forms && d.forms[f]).length;
    total += QUEST_ORDER.length; have += QUEST_ORDER.filter(q => d.quests[q] === 2).length;
    UPGRADE_ORDER.forEach(u => { total += UPGRADES[u].max; have += Math.min(UPGRADES[u].max, (d.upgrades && d.upgrades[u]) || 0); });
    const bonus = STORY_BOSSES.filter(b => BOSSES[b].bonus && d.bosses[b]).length;
    return Math.floor(have / total * 100) + (have >= total ? bonus : 0);
  },
};
