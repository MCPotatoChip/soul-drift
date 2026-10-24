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
//
// It prints problems only; exit code 1 when there are any (boss arenas are not
// checked for planks: those are there to dodge on).
// ---------------------------------------------------------------------------
'use strict';
const { ROOMS, TILE, ABIL, explore, journey } = require('./check_world.js');

const GROUND = 'eganiqmxbj';     // foes that walk the floor (the Adjuchas charges along it)
const FLYING = 'h';              // Lesser Hollow swarms
const CEILING = 'v';             // Pale Hollows hang from the roof
const FOES = GROUND + FLYING + CEILING;
const ENTRY_GROUND = 12;         // tiles a walker keeps from where you appear
const ENTRY_FLY = 14;            // open-air tiles a swarm keeps (it wakes at 11)
const APART_GROUND = 5;          // tiles between two foes on the same floor
const APART_FLY = 6;
const REACH_FLY = 9;             // a swarm this far from every place you can stand never wakes

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
      else if (y === H - 1) out.push({ id: ch, x, y: H - 4 });
    }
  });
  return out;
}
// Open-air steps from a cell to every other (4-way), for flyers
function airField(rows, sx, sy) {
  const H = rows.length, W = rows[0].length, dist = new Int32Array(W * H).fill(-1);
  const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !'#XGODQK~'.includes(rows[y][x]);
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

// Everything reachable (doors and targets) from every way in, as one string to compare
function reachKey(rid, A, tiles) {
  const r = ROOMS[rid], keys = [];
  for (const e of Object.keys(r.doors).concat(['rest', 'start'])) {
    const res = explore(rid, A, e, { tiles });
    if (!res) continue;
    keys.push(e + ':' + [...res.doors].sort().join('') + ':' + [...res.hits].map(h => h.kind + h.x + ',' + h.feet).sort().join(';'));
  }
  return keys.join('|');
}
// Every place you can stand (tiles), from every way in, with every power
function standCells(rid, A) {
  const out = new Map();
  for (const e of Object.keys(ROOMS[rid].doors).concat(['rest', 'start'])) {
    const res = explore(rid, A, e, { full: true });
    if (!res) continue;
    for (const st of res.stands) {
      const x = Math.floor(st.x / TILE), y = Math.floor((st.y - 1) / TILE);
      out.set(x + ',' + y, { x, y, cling: !!st.cling });
    }
  }
  return [...out.values()];
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
  const early = Object.assign({ konso: true }, first || {});
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
        if (d < ENTRY_GROUND) problems.push(`foe ${where(f)} is ${d.toFixed(1)} tiles from way in ${e.id}`);
      }
    }
  }
  // ---- foes crowded together
  for (let i = 0; i < foes.length; i++) for (let j = i + 1; j < foes.length; j++) {
    const a = foes[i], b = foes[j];
    const fly = FLYING.includes(a.ch) || FLYING.includes(b.ch);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (fly ? d < APART_FLY : (Math.abs(a.y - b.y) <= 2 && Math.abs(a.x - b.x) < APART_GROUND)) problems.push(`foes ${where(a)} and ${where(b)} are ${d.toFixed(1)} tiles apart`);
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

  // ---- planks that do nothing
  if (!r.boss) {
    const base = { early: reachKey(rid, early), all: reachKey(rid, all) };
    for (const p of planks(rows)) {
      // something stands on it, or hangs just above it
      const onIt = [];
      for (let x = p.x0; x <= p.x1; x++) for (const dy of [1, 2]) {
        const ch = (rows[p.y - dy] || '')[x];
        if (ch && !'.#=^'.includes(ch)) onIt.push(ch);
      }
      if (onIt.length) continue;
      const t = rows.map(row => row.split(''));
      for (let x = p.x0; x <= p.x1; x++) t[p.y][x] = '.';
      const tiles = t.map(row => row.join(''));
      const needEarly = reachKey(rid, early, tiles) !== base.early, needAll = reachKey(rid, all, tiles) !== base.all;
      if (!needEarly && !needAll) problems.push(`plank ${p.ch} x${p.x0}-${p.x1} y${p.y} (${p.x1 - p.x0 + 1} wide) reaches nothing new`);
    }
  }
  return problems;
}

const only = process.argv[2];
journey();
const first = journey.first || {};
let bad = 0;
for (const rid of only ? [only] : Object.keys(ROOMS)) {
  if (!ROOMS[rid]) { console.log('no room', rid); process.exit(1); }
  const p = checkRoom(rid, first[rid]);
  if (!p.length) continue;
  bad += p.length;
  console.log(rid + (first[rid] ? `  (first visit with ${Object.keys(first[rid]).filter(k => first[rid][k]).join(' ') || 'nothing'})` : ''));
  p.forEach(s => console.log('  ' + s));
}
console.log(bad ? `\n${bad} problem${bad > 1 ? 's' : ''}` : 'no problems');
process.exit(bad ? 1 : 0);
