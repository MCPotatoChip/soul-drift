#!/usr/bin/env node
// ---------------------------------------------------------------------------
// World checker. Simulates the player's movement (jump arcs, Shunpo, the
// second jump, the wall grip, Senkaimon Burst) with the game's own constants
// to find what each room lets you reach from each door with a given set of
// abilities, then plays the whole progression from a new game to the final
// boss and reports, for every ability, where it is earned and how far the
// player has come since the last one.
//
//   node scripts/check_world.js            progression report + gate table
//   node scripts/check_world.js kar_river  only that room, every ability set
//
// It is a model, not the game: enemies, pogo jumps and tricks are left out,
// so it can only say a route exists using ordinary movement.
// ---------------------------------------------------------------------------
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { PHYS, TILE, BOSSES } = new Function(read('src/config.js') + '; return { PHYS, TILE, BOSSES };')();
const ROOMS = new Function(read('src/rooms.js') + '; return ROOMS;')();

const DT = 1 / 60, BW = 10, BH = 20;

// ------------------------------------------------------------------ the grid
function makeGrid(room, A) {
  const rows = room.tiles, H = rows.length, W = Math.max(...rows.map(r => r.length));
  const solid = new Uint8Array(W * H), oneway = new Uint8Array(W * H), spike = new Uint8Array(W * H);
  const doors = [], targets = [], plats = [];
  const cnt = { k: 0, c: 0, N: 0, M: 0 };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = rows[y][x] || '.', i = y * W + x;
    switch (ch) {
      case '#': case '~': solid[i] = 1; break;
      case 'X': if (!A.hado) solid[i] = 1; break;
      case 'G': if (!A.burst) solid[i] = 1; break;
      case 'D': if (!A.bankai) solid[i] = 1; break;
      case '=': oneway[i] = 1; break;
      case 'H': if (A.konso) oneway[i] = 1; break;
      case '^': spike[i] = 1; break;
      case 'M': plats.push({ x: x * TILE + 8, top: y * TILE, cfg: (room.platforms || [])[cnt.M++] || {} }); break;
    }
    const feet = (y + 1) * TILE, cx = x * TILE + 8;
    if (ch >= '1' && ch <= '9') doors.push({ id: ch, x, y, edge: x === 0 ? 'left' : x === W - 1 ? 'right' : y === 0 ? 'top' : 'bottom' });
    else if (ch === 'k') targets.push({ kind: 'ability', id: (room.abilities || [])[cnt.k++], x: cx, feet, r: 14 });
    else if (ch === 'c') targets.push({ kind: 'seal', id: (room.seals || [])[cnt.c++], x: cx, feet, r: 14 });
    else if (ch === 'N') { const npc = (room.npcs || [])[cnt.N++] || {}; targets.push({ kind: 'npc', id: npc.name, npc, x: cx, feet, r: 24, ground: true }); }
    else if ('flo'.includes(ch)) targets.push({ kind: { f: 'fragment', l: 'plus', o: 'ore' }[ch], x: cx, feet, r: ch === 'l' ? 24 : 14 });
    else if (ch === 'R') targets.push({ kind: 'rest', x: cx, feet, r: 24, ground: true });
    else if (ch === 'B') targets.push({ kind: 'boss', id: room.boss, x: cx, feet, r: 40 });
    else if (ch === 'P') targets.push({ kind: 'start', x: cx, feet, r: 1 });
  }
  // A bound moving platform can be stopped anywhere along its run: model it as a ladder of ledges
  const extra = [];
  if (A.bakudo) for (const p of plats) {
    const range = (p.cfg.dy || 6) * TILE, w = (p.cfg.w || 3) * TILE;
    for (let d = 0; d <= range; d += 8) extra.push({ l: p.x - w / 2, r: p.x + w / 2, top: p.top + d });
  }
  return { W, H, pxW: W * TILE, pxH: H * TILE, solid, oneway, spike, doors, targets, extra, rows };
}
const at = (g, arr, tx, ty) => (tx < 0 || ty < 0 || tx >= g.W || ty >= g.H) ? 0 : arr[ty * g.W + tx];
const solidAt = (g, x, y) => at(g, g.solid, Math.floor(x / TILE), Math.floor(y / TILE)) === 1;

// ------------------------------------------------------------------ one body, one frame at a time
function moveX(g, s) {
  const nx = s.x + s.vx * DT;
  s.blocked = 0;
  if (s.vx !== 0) {
    const edge = s.vx > 0 ? nx + BW / 2 - 0.01 : nx - BW / 2;
    const tx = Math.floor(edge / TILE);
    for (let ty = Math.floor((s.y - BH) / TILE); ty <= Math.floor((s.y - 0.01) / TILE); ty++) {
      if (at(g, g.solid, tx, ty)) {
        s.x = s.vx > 0 ? tx * TILE - BW / 2 : (tx + 1) * TILE + BW / 2;
        s.blocked = Math.sign(s.vx); s.vx = 0;
        return;
      }
    }
  }
  s.x = nx;
}
function moveY(g, s, drop) {
  const prev = s.y, ny = s.y + s.vy * DT;
  s.grounded = false;
  const l = Math.floor((s.x - BW / 2) / TILE), r = Math.floor((s.x + BW / 2 - 0.01) / TILE);
  if (s.vy > 0) {
    const ty = Math.floor(ny / TILE);
    for (let tx = l; tx <= r; tx++) {
      const top = ty * TILE;
      if (at(g, g.solid, tx, ty) || (!drop && at(g, g.oneway, tx, ty) && prev <= top + 4)) { s.y = top; s.vy = 0; s.grounded = true; return; }
    }
    for (const p of g.extra) if (!drop && s.x + BW / 2 > p.l && s.x - BW / 2 < p.r && prev <= p.top + 1 && ny >= p.top) { s.y = p.top; s.vy = 0; s.grounded = true; return; }
  } else if (s.vy < 0) {
    const ty = Math.floor((ny - BH) / TILE);
    for (let tx = l; tx <= r; tx++) if (at(g, g.solid, tx, ty)) { s.y = (ty + 1) * TILE + BH; s.vy = 0; return; }
  }
  s.y = ny;
}
function onSpikes(g, s) {
  for (const [x, y] of [[s.x - 3, s.y - 2], [s.x + 3, s.y - 2], [s.x, s.y - 1], [s.x - 3, s.y - BH + 6], [s.x + 3, s.y - BH + 6]]) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (at(g, g.spike, tx, ty) && y >= ty * TILE + 7) return true;
  }
  return false;
}
const touchingWall = (g, s, dir, lowOnly) => {
  const x = s.x + dir * (BW / 2 + 2);
  return lowOnly ? solidAt(g, x, s.y - 4) : solidAt(g, x, s.y - BH / 2) && solidAt(g, x, s.y - 4);
};
function exitDoor(g, s) {
  let edge = null;
  if (s.x < 0) edge = 'left'; else if (s.x > g.pxW) edge = 'right';
  else if (s.y < 0) edge = 'top'; else if (s.y - BH > g.pxH) edge = 'bottom';
  if (!edge) return null;
  let best = null, bd = Infinity;
  for (const d of g.doors) {
    if (d.edge !== edge) continue;
    const dist = (edge === 'left' || edge === 'right') ? Math.abs(s.y - 12 - (d.y * TILE + 8)) : Math.abs(s.x - (d.x * TILE + 8));
    if (dist < bd && dist < 5 * TILE) { bd = dist; best = d; }
  }
  return best ? best.id : (edge === 'bottom' ? 'dead' : edge === 'top' ? null : 'wall');
}

// Run a control script from a starting body. ctl(t, s) -> { dir, jump, jumpP, dash, up, drop, burst }
// Returns the rest states it reaches (standing or clinging), doors, and targets touched on the way.
function run(g, A, start, ctl, maxT = 2.6) {
  const s = Object.assign({ vx: 0, vy: 0, mode: 'normal', grounded: false, jumping: false, canDash: true, airJumps: A.wings ? 1 : 0, lock: 0, dashT: 0, coyote: 0, left: false, facing: 1 }, start);
  const out = { rests: [], doors: [], hits: new Set() };
  let airborne = !s.grounded;
  for (let f = 0; f * DT < maxT; f++) {
    const t = f * DT, c = ctl(t, s);
    if (c.stop) break;
    const dir = c.dir || 0;
    if (dir) s.facing = dir;
    if (s.lock > 0) s.lock -= DT;
    if (s.mode === 'burst') {
      s.vx = s.burstDir * PHYS.burstSpeed; s.vy = 0;
      if (c.jumpP || s.blocked) { s.mode = 'normal'; s.vx = s.burstDir * PHYS.runSpeed; }
    } else if (s.mode === 'dash') {
      s.vx = s.dashDir * PHYS.dashSpeed; s.vy = 0; s.dashT -= DT;
      if (s.dashT <= 0 || s.blocked === s.dashDir) { s.mode = 'normal'; s.vx = s.dashDir * PHYS.runSpeed; }
    } else if (s.mode === 'climb') {
      s.vx = s.wallDir * 30; s.vy = -PHYS.wallClimb;
      if (!touchingWall(g, s, s.wallDir, true)) { s.mode = 'normal'; s.vy = -250; s.vx = s.wallDir * 90; }
    } else {
      const accel = s.grounded ? (dir ? PHYS.accelGround : PHYS.decelGround) : PHYS.accelAir;
      const k = s.lock > 0 ? 0.2 : 1, target = dir * PHYS.runSpeed;
      s.vx = s.vx < target ? Math.min(target, s.vx + accel * k * DT) : Math.max(target, s.vx - accel * k * DT);
      if (c.jumpP && (s.grounded || s.coyote > 0)) { s.vy = -PHYS.jumpVel; s.jumping = true; s.coyote = 0; s.grounded = false; }
      else if (c.jumpP && !s.grounded && s.airJumps > 0) { s.airJumps--; s.vy = -PHYS.doubleJumpVel; s.jumping = true; }
      if (s.jumping && !c.jump && s.vy < 0) { s.vy *= PHYS.jumpCut; s.jumping = false; }
      if (s.vy >= 0) s.jumping = false;
      if (c.dash && A.dash && s.canDash) { s.mode = 'dash'; s.dashDir = dir || s.facing; s.dashT = PHYS.dashTime; s.canDash = false; s.vy = 0; }
      if (c.burst && A.burst && (s.grounded || c.fromWall)) { s.mode = 'burst'; s.burstDir = dir || s.facing; s.vy = 0; }
      if (A.grip && !s.grounded && dir && s.vy > -200 && s.lock <= 0.04 && s.mode === 'normal' && touchingWall(g, s, dir) && t > 0.02) {
        out.rests.push({ cling: dir, x: s.x, y: s.y });
        break;
      }
    }
    if (s.mode === 'normal') { s.vy = Math.min(PHYS.maxFall, s.vy + PHYS.gravity * DT); }
    moveX(g, s);
    moveY(g, s, c.drop && t < 0.25);
    if (s.grounded) { s.coyote = PHYS.coyote; s.canDash = true; s.airJumps = A.wings ? 1 : 0; } else if (s.coyote > 0) s.coyote -= DT;
    if (onSpikes(g, s)) { out.dead = true; break; }
    const ex = exitDoor(g, s);
    if (ex === 'dead') { out.dead = true; break; }
    if (ex === 'wall') { s.x = Math.max(6, Math.min(g.pxW - 6, s.x)); s.vx = 0; }
    else if (ex) { out.doors.push(ex); break; }
    for (const tg of g.targets) {
      if (out.hits.has(tg)) continue;
      if (Math.abs(s.x - tg.x) < tg.r && Math.abs(s.y - tg.feet) < (tg.ground ? 34 : 20) && (!tg.ground || s.grounded)) out.hits.add(tg);
    }
    if (!s.grounded) airborne = true;
    if (s.grounded && airborne && t > 0.05 && s.mode === 'normal') { out.rests.push({ x: s.x, y: s.y }); if (!c.walk) break; airborne = false; }
    if (s.grounded && c.walk && f % 4 === 0) out.rests.push({ x: s.x, y: s.y });
  }
  return out;
}

// ------------------------------------------------------------------ the scripts tried from each state
function groundScripts(A, onOneWay) {
  const S = [];
  for (const d of [-1, 1]) S.push({ ctl: (t) => ({ dir: d, walk: true }), maxT: 6 });
  for (const d of [-1, 0, 1]) for (const hold of [9, 0.13]) {
    S.push({ ctl: (t) => ({ dir: d, jump: t < hold, jumpP: t === 0 }) });
    if (d) S.push({ ctl: (t) => ({ dir: t > 0.18 ? d : 0, jump: t < hold, jumpP: t === 0 }) });
    if (d) S.push({ ctl: (t) => ({ dir: t > 0.4 ? -d : d, jump: true, jumpP: t === 0 }) });
  }
  if (A.dash) for (const d of [-1, 1]) {
    S.push({ ctl: (t) => ({ dir: d, dash: t < DT }) });
    for (const td of [0.08, 0.22, 0.36, 0.5]) S.push({ ctl: (t) => ({ dir: d, jump: true, jumpP: t === 0, dash: Math.abs(t - td) < DT / 2 }) });
  }
  if (A.wings) for (const d of [-1, 0, 1]) for (const tj of [0.25, 0.4, 0.55]) {
    S.push({ ctl: (t) => ({ dir: d, jump: true, jumpP: t === 0 || Math.abs(t - tj) < DT / 2 }) });
    if (d && A.dash) for (const td of [0.1, 0.25]) S.push({ ctl: (t) => ({ dir: d, jump: true, jumpP: t === 0 || Math.abs(t - tj) < DT / 2, dash: Math.abs(t - tj - td) < DT / 2 }) });
    if (d) S.push({ ctl: (t) => ({ dir: t > tj ? d : 0, jump: true, jumpP: t === 0 || Math.abs(t - tj) < DT / 2 }) });
  }
  if (A.burst) for (const d of [-1, 1]) S.push({ ctl: (t) => ({ dir: d, burst: t < DT }), maxT: 4 });
  if (onOneWay) for (const d of [-1, 0, 1]) S.push({ ctl: (t) => ({ dir: d, drop: true }) });
  return S;
}
function clingScripts(A, w) {
  const S = [];
  S.push({ climb: true, ctl: (t) => ({ dir: w, up: true }), maxT: 8 });
  for (const d of [-w, 0, w]) {
    S.push({ wallJump: true, ctl: (t) => ({ dir: d, jump: true }) });
    S.push({ wallJump: true, ctl: (t) => ({ dir: t > 0.16 ? d : -w, jump: true }) });
    if (A.wings) for (const tj of [0.2, 0.35, 0.5]) S.push({ wallJump: true, ctl: (t) => ({ dir: t > 0.16 ? d : -w, jump: true, jumpP: Math.abs(t - tj) < DT / 2 }) });
    if (A.dash && d) for (const td of [0.15, 0.3]) S.push({ wallJump: true, ctl: (t) => ({ dir: t > 0.16 ? d : -w, jump: true, dash: Math.abs(t - td) < DT / 2 }) });
  }
  S.push({ ctl: (t) => ({ dir: -w }) });
  if (A.dash) S.push({ ctl: (t) => ({ dir: -w, dash: t < DT }) });
  if (A.burst) S.push({ ctl: (t) => ({ dir: -w, burst: t < DT, fromWall: true }), maxT: 4 });
  return S;
}

// ------------------------------------------------------------------ search one room
const roomCache = new Map();
function explore(rid, A, entry) {
  const key = rid + '|' + Object.keys(A).filter(k => A[k]).sort().join(',') + '|' + entry;
  if (roomCache.has(key)) return roomCache.get(key);
  const room = ROOMS[rid], g = makeGrid(room, A);
  const seen = new Set(), queue = [], doors = new Set(), hits = new Set();
  const push = (st) => {
    const k = st.cling ? `c${st.cling}:${Math.round(st.x)}:${Math.round(st.y / 6)}` : `g${Math.round(st.x / 8)}:${Math.round(st.y)}`;
    if (seen.has(k)) return;
    seen.add(k); queue.push(st);
  };
  const take = (res) => { res.rests.forEach(push); res.doors.forEach(d => doors.add(d)); res.hits.forEach(h => hits.add(h)); };
  // where the player appears
  if (entry === 'start' || entry === 'rest') {
    const tg = g.targets.find(t => t.kind === (entry === 'start' ? 'start' : 'rest'));
    if (!tg) return null;
    take(run(g, A, { x: tg.x, y: tg.feet, grounded: true }, () => ({}), 0.1));
    push({ x: tg.x, y: tg.feet });
  } else {
    const d = g.doors.find(dd => dd.id === entry);
    if (!d) return null;
    if (d.edge === 'left') take(run(g, A, { x: (d.x + 2) * TILE, y: (d.y + 1) * TILE }, () => ({}), 0.6));
    else if (d.edge === 'right') take(run(g, A, { x: (d.x - 1) * TILE, y: (d.y + 1) * TILE }, () => ({}), 0.6));
    else if (d.edge === 'top') take(run(g, A, { x: d.x * TILE + 8, y: (d.y + 2) * TILE + 4 }, () => ({}), 2));
    else for (const dir of [-1, 0, 1]) take(run(g, A, { x: d.x * TILE + 8, y: (d.y + 1) * TILE - 2, vy: -PHYS.popUp }, () => ({ dir }), 2));
  }
  let steps = 0;
  while (queue.length && steps < 60000) {
    const st = queue.shift(); steps++;
    if (st.cling) {
      for (const sc of clingScripts(A, st.cling)) {
        const start = { x: st.x, y: st.y, vx: 0, vy: 0, canDash: true, airJumps: A.wings ? 1 : 0 };
        if (sc.climb) Object.assign(start, { mode: 'climb', wallDir: st.cling });
        if (sc.wallJump) Object.assign(start, { vx: -st.cling * PHYS.wallJumpX, vy: -PHYS.wallJumpY, jumping: true, lock: PHYS.wallJumpLock });
        take(run(g, A, start, sc.ctl, sc.maxT));
      }
      continue;
    }
    const tx = Math.floor(st.x / TILE), ty = Math.floor(st.y / TILE);
    const onOneWay = !at(g, g.solid, tx, ty) && at(g, g.oneway, tx, ty);
    for (const sc of groundScripts(A, onOneWay)) take(run(g, A, { x: st.x, y: st.y, grounded: true }, sc.ctl, sc.maxT));
  }
  const res = { doors, hits, states: seen.size, g };
  roomCache.set(key, res);
  return res;
}

// ------------------------------------------------------------------ the whole journey
const ABIL = ['konso', 'dash', 'hado', 'grip', 'bakudo', 'wings', 'raiko', 'burst', 'bankai', 'getsuga', 'hollow'];
function journey() {
  const A = {}, got = [], seen = new Set(), bosses = new Set(), seals = new Set(), items = { fragment: 0, plus: 0, ore: 0 };
  const log = (what, rid, via) => got.push({ what, rid, via });
  let changed = true, rounds = 0;
  const rooms = Object.keys(ROOMS);
  // Each round: find every (room, entry) reachable with the current powers, then take what is there
  while (changed && rounds++ < 40) {
    changed = false;
    const reach = new Map();   // rid -> Set(entries)
    const dist = new Map();
    const q = [['kar_hub', 'start', 0]];
    const visitKey = (r, e) => r + ':' + e;
    const vis = new Set([visitKey('kar_hub', 'start')]);
    dist.set('kar_hub', 0);
    while (q.length) {
      const [rid, entry, d] = q.shift();
      if (!reach.has(rid)) reach.set(rid, new Set());
      reach.get(rid).add(entry);
      const res = explore(rid, A, entry);
      if (!res) continue;
      for (const door of res.doors) {
        const [to, toDoor] = ROOMS[rid].doors[door] || [];
        if (!to) continue;
        if (!dist.has(to)) dist.set(to, d + 1);
        const k = visitKey(to, toDoor);
        if (!vis.has(k)) { vis.add(k); q.push([to, toDoor, d + 1]); }
      }
    }
    // collect: the first new thing in visiting order, so the order of the log is the order of play
    const order = [...reach.keys()].sort((a, b) => dist.get(a) - dist.get(b));
    outer:
    for (const rid of order) {
      for (const entry of reach.get(rid)) {
        const res = explore(rid, A, entry);
        if (!res) continue;
        for (const tg of res.hits) {
          const tag = rid + ':' + tg.kind + ':' + tg.x + ':' + tg.feet;
          if (seen.has(tag)) continue;
          if (tg.kind === 'ability' && tg.id && !A[tg.id]) { seen.add(tag); A[tg.id] = true; log('ability ' + tg.id, rid, entry); changed = true; break outer; }
          if (tg.kind === 'boss' && !bosses.has(tg.id)) {
            seen.add(tag); bosses.add(tg.id); log('boss ' + tg.id, rid, entry);
            const r = ROOMS[rid];
            if (r.reward && !A[r.reward]) { A[r.reward] = true; log('ability ' + r.reward, rid, 'reward'); }
            if (tg.id === 'byakuya') { A.raiko = true; }
            (r.rewardItems || []).forEach(it => { if (it.startsWith('seal:')) { seals.add(it.slice(5)); log('seal ' + it.slice(5), rid, 'reward'); } else items[it] = (items[it] || 0) + 1; });
            changed = true; break outer;
          }
          if (tg.kind === 'npc' && tg.npc && (tg.npc.gives || tg.npc.seal)) {
            seen.add(tag);
            if (tg.npc.gives && !A[tg.npc.gives]) { A[tg.npc.gives] = true; log('ability ' + tg.npc.gives, rid, tg.id); changed = true; break outer; }
            if (tg.npc.seal && !seals.has(tg.npc.seal)) { seals.add(tg.npc.seal); log('seal ' + tg.npc.seal, rid, tg.id); }
            continue;
          }
          if (tg.kind === 'seal') { seen.add(tag); if (!seals.has(tg.id)) { seals.add(tg.id); log('seal ' + tg.id, rid, entry); } continue; }
          if (['fragment', 'plus', 'ore'].includes(tg.kind)) { seen.add(tag); items[tg.kind]++; continue; }
        }
      }
    }
    journey.reach = reach;
  }
  return { A, got, bosses, seals, items };
}

// Rooms passed between two places on the door graph (shortest), with the powers held at the time
function roomsBetween(A, from, to) {
  if (from === to) return 0;
  const q = [[from, 0]], vis = new Set([from]);
  while (q.length) {
    const [rid, d] = q.shift();
    for (const entry of Object.keys(ROOMS[rid].doors).concat(['rest', 'start'])) {
      const res = explore(rid, A, entry);
      if (!res) continue;
      for (const door of res.doors) {
        const [nx] = ROOMS[rid].doors[door] || [];
        if (!nx || vis.has(nx)) continue;
        if (nx === to) return d + 1;
        vis.add(nx); q.push([nx, d + 1]);
      }
    }
  }
  return Infinity;
}

// ------------------------------------------------------------------ main
const only = process.argv[2];
if (only) {
  const r = ROOMS[only];
  if (!r) { console.log('no room', only); process.exit(1); }
  const sets = [[], ['dash'], ['dash', 'hado'], ['dash', 'hado', 'grip'], ['dash', 'hado', 'grip', 'bakudo'], ['dash', 'hado', 'grip', 'bakudo', 'wings'], ['dash', 'hado', 'grip', 'bakudo', 'wings', 'burst'], ['dash', 'hado', 'grip', 'bakudo', 'wings', 'burst', 'bankai']];
  for (const set of sets) {
    const A = { konso: true }; set.forEach(a => { A[a] = true; });
    const parts = [];
    for (const entry of Object.keys(r.doors).concat(['rest', 'start'])) {
      const res = explore(only, A, entry);
      if (!res) continue;
      const hit = [...res.hits].map(h => h.kind + (h.id ? '(' + h.id + ')' : '')).filter(k => k !== 'start');
      parts.push(`  from ${entry}: doors [${[...res.doors].join(' ')}]  ${hit.join(', ')}  (${res.states} states)`);
    }
    console.log(`with ${set.join('+') || 'nothing'}:`);
    console.log(parts.join('\n'));
  }
  process.exit(0);
}

const t0 = Date.now();
const J = journey();
console.log('Order of play (shortest route from the last power to the next):');
let prevRoom = 'kar_hub', n = 0;
const held = { konso: false };
for (const e of J.got) {
  const gap = e.what.startsWith('ability') ? roomsBetween(Object.assign({}, held), prevRoom, e.rid) : null;
  console.log(`  ${(++n + '.').padEnd(4)} ${e.what.padEnd(20)} in ${e.rid.padEnd(12)} ${gap !== null ? `(${gap} room${gap === 1 ? '' : 's'} from the last power)` : ''}`);
  if (e.what.startsWith('ability')) { held[e.what.split(' ')[1]] = true; prevRoom = e.rid; }
}
const missing = ABIL.filter(a => !J.A[a]);
const bossMissing = Object.keys(BOSSES).filter(b => !J.bosses.has(b));
console.log(`\nPowers never reached: ${missing.join(', ') || 'none'}`);
console.log(`Bosses never reached: ${bossMissing.join(', ') || 'none'}`);
console.log(`Seals: ${J.seals.size}  fragments: ${J.items.fragment}  lost pluses: ${J.items.plus}  ore: ${J.items.ore}`);
const unreached = Object.keys(ROOMS).filter(r => !journey.reach.has(r));
console.log(`Rooms never entered: ${unreached.join(', ') || 'none'}`);
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
