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
    });
    this.data = d;
    this.run = this.freshRun();
  },
  // The saved game without making it the current one (for the title screen)
  peek() {
    try { const raw = localStorage.getItem(SAVE_KEY); return raw ? Object.assign(this.fresh(), JSON.parse(raw)) : null; } catch (e) { return null; }
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
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); return true; } catch (e) { return false; }
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      this.data = Object.assign(this.fresh(), JSON.parse(raw));
      this.run = this.freshRun();
      return true;
    } catch (e) { return false; }
  },
  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  },
  wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
  },

  completion() {
    const d = this.data;
    let have = 0, total = 0;
    ABILITY_ORDER.forEach(a => { total++; if (d.abilities[a]) have++; });
    total += Object.keys(SEALS).length; have += d.seals.length;
    total += 8; have += Math.min(8, d.fragmentsTotal);
    total += 6; have += d.pluses;
    total += 5; have += Object.keys(d.bosses).length;
    total += FORGE.length; have += d.swordLevel || 0;
    return Math.round(have / total * 100);
  },
};
