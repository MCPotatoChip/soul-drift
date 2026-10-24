#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Placement checker. For every room it looks at where the foes stand and what
// the planks are for, using the movement model of check_world.js:
//
//   - foes too close to a way in (a door or a rest gate), measured from where
//     the player appears; flyers by the open-air path they would fly
//   - foes crowded together
//   - foes nobody can reach: a swarm idling near the roof far above every place
//     you can stand, a diver with nobody ever passing under it, a walker on a
//     ledge you can never get to
//   - planks (and moving platforms) that do nothing: nothing stands on them, and
//     taking them away changes nothing you can reach, with the powers you hold on
//     your first visit or with every power
//
//   node scripts/check_placement.js            every room
//   node scripts/check_placement.js sei_ward   one room
//   node scripts/check_placement.js --cuts     also list, room by room, the planks that can go (taken away one at a
//                                              time, so of two planks that stand in for each other one stays)
//
// It prints problems only; exit code 1 when there are any (boss arenas and the Study Room, where Urahara's
// exercises are fought, are not checked for planks: those are there to dodge on). The rules match place_foes in
// scripts/build_rooms.py, which puts the foes where this checker wants them.
// ---------------------------------------------------------------------------
'use strict';
const { ROOMS, TILE, ABIL, explore, journey, relevant } = require('./check_world.js');

const GROUND = 'eganiqmxbj';     // foes that walk the floor (the Adjuchas charges along it)
const FLYING = 'h';              // Lesser Hollow swarms
const CEILING = 'v';             // Pale Hollows hang from the roof
const FOES = GROUND + FLYING + CEILING;
const ENTRY_GROUND = 14;         // tiles (vertical distance counts half again) a walker keeps from where you appear
const ENTRY_FLY = 16;            // open-air tiles a swarm keeps (it wakes at 11)
const APART_GROUND = 6;          // tiles between two foes on the same floor
const APART_ANY = 5;             // tiles between any two foes
const REACH_FLY = 9;             // a swarm this far from every place you can stand never wakes
const ARENAS = ['kar_study'];    // rooms whose planks are for fighting on
// Planks the movement model calls redundant that are kept on purpose: [room, x0, y, why]. The model counts moves, not
// distance or danger, so it cannot see a staircase that shows the way, a bridge, or stepping stones over spikes.
const KEEP = [
  ['kar_alley', 20, 15, 'the first step of the stair to the floating Senkaimon'],
  ['kar_canal', 17, 15, 'the stair up onto the high walk, from the west'], ['kar_canal', 24, 11, 'the stair up onto the high walk, from the west'],
  ['sok_1', 14, 5, 'part of the bridge of planks to the Pressure Shrine'],
  ['sei_barracks', 29, 14, 'the step up to the caster on the high plank'],
  ['sok_stair', 25, 14, 'the stair toward the fragment pillar'], ['sok_stair', 35, 11, 'the stair toward the fragment pillar'], ['sok_stair', 55, 15, 'the step to the fragment pillar from the east'],
  ['hm_1', 67, 10, 'a bone step on the way up to the Sinking Dunes'],
  ['hm_2', 48, 18, 'the middle step of the stair to the upgrade'],
  ['hm_dunes', 27, 17, 'the stair toward the mesa'], ['hm_dunes', 75, 22, 'the stair up to the Bone Vault'], ['hm_dunes', 79, 18, 'the stair up to the Bone Vault'],
  ['hm_vault', 16, 11, 'the way across the top of the vault'],
  ['dangai_1', 53, 15, 'stepping stones over the spikes, with the Kototsu behind you'], ['dangai_1', 57, 15, 'stepping stones over the spikes, with the Kototsu behind you'],
  ['forest_depths', 19, 18, 'the first step of the stair to the upgrade'],
];

function cells(rows, set) {
  const out = [];
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (set.includes(row[x])) out.push({ ch: row[x], x, y }); });
  return out;
}
// Where the player appears through each way in, in tiles
function entries(rows) {
  const H = rows.length, W = rows[0].length, out = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < W; x++) {
      const ch = row[x];
      if (ch === 'R' || ch === 'P') { out.push({ id: ch, x, y }); continue; }
      if (!(ch >= '1' && ch <= '9')) continue;
      if (x === 0) out.push({ id: ch, x: 2, y });
      else if (x === W - 1) out.push({ id: ch, x: W - 2, y });
      else if (y === 0) out.push({ id: ch, x, y: 2 });
      else if (y === H - 1) out.push({ id: ch, x, y: H - 6 });   // a door in the floor throws you up into the room
    }
  });
  return out;
}
// Open-air steps from a cell to every other (4-way), for flyers
function airField(rows, sx, sy) {
  const H = rows.length, W = rows[0].length, dist = new Int32Array(W * H).fill(-1);
  const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !'#XGODQK~z'.includes(rows[y][x]);
  if (!open(sx, sy)) return dist;
  const q = [[sx, sy]]; dist[sy * W + sx] = 0;
  while (q.length) {
    const [x, y] = q.shift(), d = dist[y * W + x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (open(nx, ny) && dist[ny * W + nx] < 0) { dist[ny * W + nx] = d + 1; q.push([nx, ny]); }
    }
  }
  return dist;
}

// How many moves it takes to reach each door and target from each way in: { 'entry>what': moves }
function reachMap(rid, A, tiles) {
  const r = ROOMS[rid], out = {};
  for (const e of Object.keys(r.doors).concat(['rest', 'start'])) {
    const res = explore(rid, A, e, { tiles });
    if (!res) continue;
    for (const [what, d] of res.depth) out[e + '>' + (typeof what === 'string' ? 'door' + what : what.kind + what.x + ',' + what.feet)] = d;
  }
  return out;
}
// Taking something away hurts if anything becomes unreachable or takes more moves to reach
const worse = (base, now) => Object.keys(base).some(k => now[k] === undefined || now[k] > base[k]);
// Every place you can stand (tiles), from every way in, with every power. A lantern room is walked both lit (the model's
// usual view: gold barriers open, blue walls standing) and dark (gold barriers shut, no blue walls).
function standCells(rid, A) {
  const out = new Map(), rows = ROOMS[rid].tiles;
  const views = [undefined];
  if (rows.some(r => /[KQ]/.test(r))) views.push(rows.map(r => r.replace(/K/g, '.').replace(/Q/g, '#')));
  for (const tiles of views) for (const e of Object.keys(ROOMS[rid].doors).concat(['rest', 'start'])) {
    const res = explore(rid, A, e, { full: true, tiles });
    if (!res) continue;
    for (const st of res.stands) {
      const x = Math.floor(st.x / TILE), y = Math.floor((st.y - 1) / TILE);
      out.set(x + ',' + y, { x, y, cling: !!st.cling });
    }
  }
  return [...out.values()];
}
// Every set of powers the room is visited with over the journey: from the first visit, adding each power in the order
// the journey hands them out (only the powers that change something in this room tell two sets apart)
function visitSets(rid, first) {
  const order = (journey.order || []).slice(), sets = [], seen = new Set();
  const A = Object.assign({ konso: true }, first || {});
  const add = () => { const k = Object.keys(relevant(rid, A)).sort().join(','); if (!seen.has(k)) { seen.add(k); sets.push(Object.assign({}, A)); } };
  add();
  for (const a of order) { A[a] = true; add(); }
  ABIL.forEach(a => { A[a] = true; });
  add();
  return sets;
}
// Plank runs ('=' in a row) and moving platforms
function planks(rows) {
  const out = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] === '=' || row[x] === 'M') {
        const ch = row[x];
        let x1 = x;
        while (x1 + 1 < row.length && row[x1 + 1] === ch && ch === '=') x1++;
        out.push({ ch, x0: x, x1, y });
        x = x1 + 1;
      } else x++;
    }
  });
  return out;
}

function checkRoom(rid, first) {
  const r = ROOMS[rid], rows = r.tiles, W = rows[0].length, problems = [];
  const all = Object.fromEntries(ABIL.map(a => [a, true]));
  const foes = cells(rows, FOES), ins = entries(rows);
  const stands = standCells(rid, all);
  const where = (f) => `${f.ch}@${f.x},${f.y}`;

  // ---- foes and the ways in
  for (const f of foes) {
    if (FLYING.includes(f.ch)) {
      for (const e of ins) {
        const d = airField(rows, e.x, Math.max(0, e.y - 1))[f.y * W + f.x];
        if (d >= 0 && d < ENTRY_FLY) problems.push(`foe ${where(f)} is ${d} tiles of air from way in ${e.id}`);
      }
    } else {
      for (const e of ins) {
        const d = Math.hypot(f.x - e.x, (f.y - e.y) * 1.5);
        if (d < ENTRY_GROUND - 0.01) problems.push(`foe ${where(f)} is ${d.toFixed(1)} tiles from way in ${e.id}`);
      }
    }
  }
  // ---- foes crowded together
  for (let i = 0; i < foes.length; i++) for (let j = i + 1; j < foes.length; j++) {
    const a = foes[i], b = foes[j];
    const ground = GROUND.includes(a.ch) && GROUND.includes(b.ch);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < APART_ANY || (ground && Math.abs(a.y - b.y) <= 2 && Math.abs(a.x - b.x) < APART_GROUND)) problems.push(`foes ${where(a)} and ${where(b)} are ${d.toFixed(1)} tiles apart`);
  }
  // ---- foes out of everyone's way
  for (const f of foes) {
    if (FLYING.includes(f.ch)) {
      const near = Math.min(...stands.map(s => Math.hypot(s.x - f.x, s.y - 1 - f.y)));
      if (near > REACH_FLY) problems.push(`swarm ${where(f)} is ${near.toFixed(1)} tiles from anywhere you can stand`);
      if (f.y <= 3) problems.push(`swarm ${where(f)} hangs at the roof`);
    } else if (CEILING.includes(f.ch)) {
      if (!stands.some(s => Math.abs(s.x - f.x) <= 2 && s.y > f.y && s.y - f.y <= 12)) problems.push(`diver ${where(f)} has nobody passing under it`);
    } else {
      // a walker: on a floor you can reach, or near enough to one to come for you
      const near = Math.min(...stands.map(s => Math.abs(s.x - f.x) + 2 * Math.abs(s.y - f.y)));
      if (near > 6) problems.push(`walker ${where(f)} stands where you never go (${near} from the nearest place you stand)`);
    }
  }

  // ---- planks that do nothing (with --cuts, each one found is taken away before the next is tried)
  if (!r.boss && !ARENAS.includes(rid)) {
    let cur = rows.slice();
    const sets = visitSets(rid, first);
    let base = sets.map(A => reachMap(rid, A));
    const H = rows.length, below = [];
    rows[H - 1].split('').forEach((ch, x) => { if (ch >= '1' && ch <= '9') below.push(x); });
    for (const p of planks(rows)) {
      // over a doorway in the floor: it catches you as you come up, instead of letting you drop straight back out
      if (p.y >= H - 12 && below.some(x => x >= p.x0 && x <= p.x1)) continue;
      if (KEEP.some(([kr, kx, ky]) => kr === rid && kx === p.x0 && ky === p.y)) continue;
      // something stands on it, or hangs just above it
      const onIt = [];
      for (let x = p.x0; x <= p.x1; x++) for (const dy of [1, 2]) {
        const ch = (rows[p.y - dy] || '')[x];
        if (ch && !'.#=^'.includes(ch)) onIt.push(ch);
      }
      if (onIt.length) continue;
      const t = cur.map(row => row.split(''));
      for (let x = p.x0; x <= p.x1; x++) t[p.y][x] = '.';
      const tiles = t.map(row => row.join(''));
      const now = sets.map(A => reachMap(rid, A, tiles));
      if (!now.some((m, i) => worse(base[i], m))) {
        problems.push(`plank ${p.ch} x${p.x0}-${p.x1} y${p.y} (${p.x1 - p.x0 + 1} wide) leads nowhere and shortens no way`);
        if (CUTS) { cut.push([rid, p.x0, p.x1, p.y]); cur = tiles; base = now; }
      }
    }
  }
  return problems;
}

const CUTS = process.argv.includes('--cuts'), cut = [];
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
const J = journey();
journey.order = J.got.filter(e => e.what.startsWith('ability ')).map(e => e.what.split(' ')[1]);
const first = journey.first || {};
let bad = 0;
for (const rid of only.length ? only : Object.keys(ROOMS)) {
  if (!ROOMS[rid]) { console.log('no room', rid); process.exit(1); }
  const p = checkRoom(rid, first[rid]);
  if (!p.length) continue;
  bad += p.length;
  console.log(rid + (first[rid] ? `  (first visit with ${Object.keys(first[rid]).filter(k => first[rid][k]).join(' ') || 'nothing'})` : ''));
  p.forEach(s => console.log('  ' + s));
}
if (CUTS) console.log('\nplanks that can go (room, x0, x1, y):\n' + cut.map(c => '    ' + JSON.stringify(c).replace(/"/g, "'").replace(/^\[/, '(').replace(/\]$/, '),')).join('\n'));
console.log(bad ? `\n${bad} problem${bad > 1 ? 's' : ''}` : 'no problems');
process.exit(bad ? 1 : 0);
