'use strict';
// ---------------------------------------------------------------------------
// Game state: the single source of truth for progress (saved) and the current
// run (not saved). Every scene reads and writes through GS so abilities never
// "reset" on a room transition.
// ---------------------------------------------------------------------------

const SAVE_KEY = 'soul-drift-save-v1';

const GS = {
  data: null,
  // Transient per-life state carried across rooms but never saved.
  run: null,

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
      world: 2,              // layout version of the save (2: the expanded world)
    };
  },

  freshRun() {
    return { bankaiT: 0, maskOn: false, hollow: 0, maskLock: 0, region: null };
  },

  newGame() {
    this.data = this.fresh();
    this.run = this.freshRun();
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
  dropMul() { return 1 + 0.5 * Math.min(3, this.data.plus || 0); },

  // A fresh journey that keeps what you earned: powers, seals, the edge of the blade and health
  newGamePlus(old) {
    const d = this.fresh();
    Object.assign(d, {
      abilities: Object.assign({}, old.abilities), seals: old.seals.slice(), equipped: old.equipped.slice(),
      sealSlots: old.sealSlots, swordLevel: old.swordLevel || 0, maxHp: old.maxHp, hp: old.maxHp,
      fragmentsTotal: old.fragmentsTotal, ore: old.ore || 0, reishi: old.reishi || 0, plus: (old.plus || 0) + 1,
      gifts: Object.assign({}, old.gifts),
    });
    this.data = d;
    this.run = this.freshRun();
  },
  // The saved game without making it the current one (for the title screen)
  peek() {
    try { const raw = localStorage.getItem(SAVE_KEY); return raw ? this.migrate(Object.assign(this.fresh(), JSON.parse(raw))) : null; } catch (e) { return null; }
  },

  slashDamage() { return COMBAT.slashDamage + (this.data.swordLevel || 0) * COMBAT.swordBonus; },

  addReiatsu(n) { this.data.reiatsu = Phaser.Math.Clamp(this.data.reiatsu + n, 0, COMBAT.maxReiatsu); },

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

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
      if (typeof window !== 'undefined' && window.SD && SD.game) SD.game.events.emit('saved');
      return true;
    } catch (e) { return false; }
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      this.data = this.migrate(Object.assign(this.fresh(), JSON.parse(raw)));
      this.run = this.freshRun();
      return true;
    } catch (e) { return false; }
  },
  // Saves from before the world grew: the Rogue Captain became Byakuya, Konso is learned from Rukia
  // at the start, and two arenas lost the rest gates that sat inside them.
  migrate(d) {
    if (d.bosses.captain) { d.bosses.byakuya = true; delete d.bosses.captain; }
    if ((d.world || 1) < 2) {
      d.abilities.konso = true;
      d.gifts['Rukia Kuchiki'] = true;
      d.world = 2;
    }
    const restOK = (id) => id && ROOMS[id] && ROOMS[id].tiles.some(r => r.includes('R'));
    const moved = { hm_boss: 'hm_2', forest_2: 'forest_1' };
    if (d.restRoom && !restOK(d.restRoom)) d.restRoom = moved[d.restRoom] || null;
    Object.keys(d.gates).forEach(id => { if (!restOK(id)) delete d.gates[id]; });
    if (!ROOMS[d.room]) d.room = d.restRoom || 'kar_hub';
    return d;
  },
  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  },
  wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
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

  completion() {
    const d = this.data, T = this.totals();
    let have = 0, total = 0;
    ABILITY_ORDER.forEach(a => { total++; if (d.abilities[a]) have++; });
    total += Object.keys(SEALS).length; have += d.seals.filter(id => SEALS[id]).length;
    total += T.fragments; have += Math.min(T.fragments, d.fragmentsTotal);
    total += T.pluses; have += Math.min(T.pluses, d.pluses);
    total += T.bosses; have += Object.keys(d.bosses).filter(b => BOSSES[b]).length;
    total += FORGE.length; have += d.swordLevel || 0;
    return Math.round(have / total * 100);
  },
};
