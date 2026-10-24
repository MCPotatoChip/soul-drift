#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Chase checker. check_world.js says whether a way through a room exists; this says how fast the quickest way
// is, then sets the Kototsu's schedule (read from src/scenes/game.js: startChase / updateChase) against it.
//
//   node scripts/check_chase.js                 the Dangai, entered from its first door
//   node scripts/check_chase.js dangai_1 1      room and door
//
// It searches the same movement model as check_world.js (jump arcs, Shunpo, the second jump, the wall grip),
// but orders the search by elapsed time, so every standing place is reached as early as it can be. Two numbers
// matter: the fastest possible crossing, and how much longer than that a player has before the Kototsu
// catches them (the `budget`). It exits with 1 when the budget is under 1.5x the fastest crossing, which would
// leave no room for a single mistake.
//
// Shunpo's own cooldown (0.42 s) is not modelled, so the fastest crossing is a little optimistic.
// ---------------------------------------------------------------------------
'use strict';
const fs = require('fs'), path = require('path');
const { ROOMS, PHYS, TILE, DT, makeGrid, run, groundScripts, clingScripts, at } = require('./check_world.js');

const rid = process.argv[2] || 'dangai_1', entryDoor = process.argv[3] || '1';
const A = {}; ['konso', 'dash', 'hado', 'grip', 'bakudo', 'wings', 'raiko'].forEach(a => { A[a] = true; });   // what you hold on the way in

// The Kototsu, as the game has it
const game = fs.readFileSync(path.join(__dirname, '..', 'src/scenes/game.js'), 'utf8');
const m = /this\.chase = \{ x: (-?\d+), speed: (\d+), delay: ([\d.]+)/.exec(game);
const band = /Math\.max\(0, gap - (\d+)\) \* ([\d.]+)/.exec(game);
if (!m || !band) { console.error('could not read the chase from src/scenes/game.js'); process.exit(2); }
const C = { x: +m[1], speed: +m[2], delay: +m[3], slack: +band[1], pull: +band[2] };

const g = makeGrid(ROOMS[rid], A);
const door = g.doors.find(d => d.id === entryDoor);
if (!door) { console.error(`room ${rid} has no door ${entryDoor}`); process.exit(2); }

const key = (st) => st.cling ? `c${st.cling}:${Math.round(st.x)}:${Math.round(st.y / 6)}` : `g${Math.round(st.x / 12)}:${Math.round(st.y)}`;
const best = new Map(), queue = [], exits = [];
const add = (st) => { const k = key(st), old = best.get(k); if (old && old.time <= st.time) return; best.set(k, st); queue.push(st); };
const take = (res, base, parent) => {
  for (const r of res.rests) add(Object.assign({}, r, { time: base + r.t, parent }));
  for (const d of res.doors) exits.push({ id: d, time: base + res.doorT, x: res.doorX, parent });
};
const x0 = door.edge === 'left' ? (door.x + 2) * TILE : (door.x - 1) * TILE, y0 = (door.y + 1) * TILE;
const start = { x: x0, y: y0, time: 0, parent: null, t: 0 };
take(run(g, A, { x: x0, y: y0 }, () => ({}), 0.6), 0, start);
while (queue.length) {
  let bi = 0; for (let i = 1; i < queue.length; i++) if (queue[i].time < queue[bi].time) bi = i;
  const st = queue.splice(bi, 1)[0];
  if (best.get(key(st)) !== st) continue;
  if (st.cling) {
    for (const sc of clingScripts(A, st.cling)) {
      const s0 = { x: st.x, y: st.y, vx: 0, vy: 0, canDash: true, airJumps: A.wings ? 1 : 0 };
      if (sc.climb) Object.assign(s0, { mode: 'climb', wallDir: st.cling });
      if (sc.wallJump) Object.assign(s0, { vx: -st.cling * PHYS.wallJumpX, vy: -PHYS.wallJumpY, jumping: true, lock: PHYS.wallJumpLock });
      take(run(g, A, s0, sc.ctl, sc.maxT), st.time, st);
    }
    continue;
  }
  const tx = Math.floor(st.x / TILE), ty = Math.floor(st.y / TILE);
  const onOneWay = !at(g, g.solid, tx, ty) && at(g, g.oneway, tx, ty);
  for (const sc of groundScripts(A, onOneWay)) take(run(g, A, { x: st.x, y: st.y, grounded: true }, sc.ctl, sc.maxT), st.time, st);
}

const out = exits.filter(e => e.id !== entryDoor).sort((a, b) => a.time - b.time)[0];
if (!out) { console.log(`${rid}: no way through from door ${entryDoor}`); process.exit(1); }
const fastest = out.time, dist = out.x - x0;

// The Kototsu's own clock: it starts after `delay`, then runs at `speed` and pulls harder the further behind it falls.
// The player is caught when the body's left edge is behind it. Walk the player along the fastest path to find the
// slowest the player can afford to be: scale the whole crossing by k and find the largest k that is still safe.
const path_ = []; for (let s = out; s; s = s.parent) path_.push(s); path_.reverse();
const pts = path_.map(p => [p.time || 0, p.x === undefined ? x0 : p.x]); pts[0] = [0, x0]; pts.push([fastest, out.x]);
const at_ = (t, k) => { t /= k; for (let i = 1; i < pts.length; i++) { const [t0, a] = pts[i - 1], [t1, b] = pts[i]; if (t <= t1 || i === pts.length - 1) return t1 <= t0 ? b : a + (b - a) * Math.max(0, Math.min(1, (t - t0) / (t1 - t0))); } return out.x; };
const caught = (k) => {
  let c = C.x;
  for (let t = 0; t <= fastest * k; t += DT) {
    const p = at_(t, k) - 5;
    if (t > C.delay) c += (C.speed + Math.max(0, (p - c) - C.slack) * C.pull) * DT;
    if (p < c - 6) return true;
  }
  return false;
};
let lo = 1, hi = 8;
if (caught(1)) { lo = 0; hi = 1; }
for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (caught(mid)) hi = mid; else lo = mid; }
console.log(`${rid}, in by door ${entryDoor}, out by door ${out.id}: ${Math.round(dist / TILE)} tiles; the fastest crossing takes ${fastest.toFixed(1)} s (running flat out would take ${(dist / PHYS.runSpeed).toFixed(1)} s)`);
console.log(`The Kototsu gives ${C.delay} s of start, runs at ${C.speed} px/s and begins ${Math.round((x0 - C.x) / TILE)} tiles behind you.`);
console.log(`A player moving at the same pace as that crossing, only slower, is caught once they take more than ${(fastest * lo).toFixed(1)} s: ${lo.toFixed(2)}x the fastest crossing.`);
if (lo < 1.5) { console.log('too tight: one mistake and it has you'); process.exit(1); }
console.log('fair: there is room for mistakes');
