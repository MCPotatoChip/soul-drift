'use strict';
// ---------------------------------------------------------------------------
// Navigation for things that fly. A flow field is a breadth-first search out
// from a source cell through open air: every reachable cell learns how many
// steps it is from the source. A flyer then only has to step to a neighbour
// with a smaller number to follow the shortest path it can physically pass
// through, so bats go around walls instead of pressing against them.
// ---------------------------------------------------------------------------

class FlowField {
  // source(): the world point the field leads to. period: seconds between rebuilds (0 builds once).
  constructor(scene, source, period = 0.2, maxSteps = 160) {
    this.s = scene;
    this.W = scene.W; this.H = scene.H;
    this.dist = new Int16Array(this.W * this.H).fill(-1);
    this.source = source;
    this.period = period;
    this.maxSteps = maxSteps;
    this.t = 0;
    this.built = false;
  }
  // A cell a flyer can occupy: anything that is not a colliding solid tile (one-way planks are open)
  open(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return false;
    const t = this.s.solid.getTileAt(tx, ty);
    return !(t && t.collides);
  }
  update(dt) {
    if (this.built && !this.period) return;
    this.t -= dt;
    if (this.built && this.t > 0) return;
    this.t = this.period;
    this.build();
  }
  build() {
    const p = this.source();
    const W = this.W, H = this.H, d = this.dist;
    d.fill(-1);
    this.built = true;
    let sx = Math.floor(p.x / TILE), sy = Math.floor(p.y / TILE);
    // The source may sit against a wall: start from the nearest open cell
    if (!this.open(sx, sy)) {
      const near = [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1]].find(([dx, dy]) => this.open(sx + dx, sy + dy));
      if (!near) return;
      sx += near[0]; sy += near[1];
    }
    const q = new Int32Array(W * H);
    let head = 0, tail = 0;
    d[sy * W + sx] = 0;
    q[tail++] = sy * W + sx;
    while (head < tail) {
      const i = q[head++], x = i % W, y = (i - x) / W, nd = d[i] + 1;
      if (nd > this.maxSteps) continue;
      for (let k = 0; k < 8; k++) {
        const dx = DIR8[k][0], dy = DIR8[k][1], nx = x + dx, ny = y + dy;
        if (!this.open(nx, ny)) continue;
        // no squeezing diagonally between two solid corners
        if (dx && dy && (!this.open(x + dx, y) || !this.open(x, y + dy))) continue;
        const j = ny * W + nx;
        if (d[j] >= 0) continue;
        d[j] = nd;
        q[tail++] = j;
      }
    }
  }
  // Steps from a world point to the source along open air (-1: no way through)
  distAt(x, y) {
    const c = this.cellOf(x, y);
    return c < 0 ? -1 : this.dist[c];
  }
  // The cell index for a world point, nudged out of a wall if a body has slid into one
  cellOf(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return -1;
    const i = ty * this.W + tx;
    if (this.dist[i] >= 0) return i;
    let best = -1, bd = Infinity;
    for (const [dx, dy] of DIR8) {
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H) continue;
      const j = ny * this.W + nx;
      if (this.dist[j] >= 0 && this.dist[j] < bd) { bd = this.dist[j]; best = j; }
    }
    return best;
  }
  // Is the straight line between two points clear for a body of radius r?
  clear(x1, y1, x2, y2, r = 6) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    if (L < 1) return true;
    const nx = -dy / L * r, ny = dx / L * r, n = Math.ceil(L / 6);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x1 + dx * t, y = y1 + dy * t;
      if (!this.open(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
      if (r > 0 && (!this.open(Math.floor((x + nx) / TILE), Math.floor((y + ny) / TILE)) || !this.open(Math.floor((x - nx) / TILE), Math.floor((y - ny) / TILE)))) return false;
    }
    return true;
  }
  // Where a flyer at (x, y) should head to reach (gx, gy): straight there when the way is clear,
  // otherwise the furthest cell down the field that it can see (so it cuts corners smoothly).
  // Returns null when no path exists.
  steer(x, y, gx, gy, r = 6) {
    if (this.clear(x, y, gx, gy, r)) return { x: gx, y: gy, direct: true };
    let c = this.cellOf(x, y);
    if (c < 0) return null;
    let best = null, first = null;
    for (let step = 0; step < 6; step++) {
      const cx = c % this.W, cy = (c - cx) / this.W;
      let next = -1, nd = this.dist[c];
      for (const [dx, dy] of DIR8) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.open(nx, ny) || (dx && dy && (!this.open(cx + dx, cy) || !this.open(cx, cy + dy)))) continue;
        const j = ny * this.W + nx;
        if (this.dist[j] >= 0 && this.dist[j] < nd) { nd = this.dist[j]; next = j; }
      }
      if (next < 0) break;
      c = next;
      const px = (c % this.W) * TILE + TILE / 2, py = Math.floor(c / this.W) * TILE + TILE / 2;
      if (!first) first = { x: px, y: py };
      if (this.clear(x, y, px, py, r)) best = { x: px, y: py };
      else if (best) break;
    }
    return best || first;
  }
}
const DIR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
