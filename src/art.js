'use strict';
// ---------------------------------------------------------------------------
// Character art: a small pixel-art rig. Every humanoid frame is drawn from a
// style (palette, hair, outfit, weapon) and a pose (limb targets, lean, sword
// angle), straight into a pixel buffer, then outlined. In-between frames are
// interpolated from key poses, and fast swings get a translucent smear.
// Creatures (hollows, adjuchas, menos, butterflies) use hand-placed shapes on
// the same pen.
//
// Humanoid frames are 64x60 with the sandals on row 47; textures face right.
// ---------------------------------------------------------------------------

const HF = { W: 64, H: 60, FEET: 48, HX: 32 };

class Pen {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.img = new ImageData(w, h);
    this.data = new Uint32Array(this.img.data.buffer);
    this.cache = {};
    this.setFrame(0, 0, w, h);
  }
  setFrame(ox, oy, fw, fh) { this.ox = ox; this.oy = oy; this.fw = fw; this.fh = fh; }
  // '#rrggbb' or '#rrggbbaa'
  col(c) {
    if (this.cache[c] !== undefined) return this.cache[c];
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    const a = c.length > 7 ? parseInt(c.slice(7, 9), 16) : 255;
    return (this.cache[c] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0);
  }
  idx(x, y) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.fw || y >= this.fh) return -1;
    return (this.oy + y) * this.w + this.ox + x;
  }
  px(x, y, c) { if (!c) return; const i = this.idx(x, y); if (i >= 0) this.data[i] = this.col(c); }
  // Only paint empty pixels (smears and glows sit behind the figure)
  under(x, y, c) { const i = this.idx(x, y); if (i >= 0 && (this.data[i] >>> 24) === 0) this.data[i] = this.col(c); }
  erase(x, y) { const i = this.idx(x, y); if (i >= 0) this.data[i] = 0; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  line(x0, y0, x1, y1, c, w = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const o = Math.floor((w - 1) / 2);
    for (;;) {
      if (w === 1) this.px(x0, y0, c); else this.rect(x0 - o, y0 - o, w, w, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  poly(pts, c) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.round(xs[k]), xb = Math.round(xs[k + 1]);
        for (let x = xa; x < xb; x++) this.px(x, y, c);
      }
    }
  }
  limb(x0, y0, x1, y1, w0, w1, c) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    this.poly([[x0 + nx * w0 / 2, y0 + ny * w0 / 2], [x1 + nx * w1 / 2, y1 + ny * w1 / 2], [x1 - nx * w1 / 2, y1 - ny * w1 / 2], [x0 - nx * w0 / 2, y0 - ny * w0 / 2]], c);
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const t = (y + 0.5 - cy) / ry;
      if (Math.abs(t) > 1) continue;
      const hw = rx * Math.sqrt(1 - t * t);
      for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) this.px(x, y, c);
    }
  }
  // 1px outline around everything opaque in the current frame
  outline(c) {
    const v = this.col(c), W = this.w, d = this.data, fw = this.fw, fh = this.fh;
    const solid = new Uint8Array(fw * fh);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) solid[y * fw + x] = d[(this.oy + y) * W + this.ox + x] >>> 24 > 160 ? 1 : 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (solid[y * fw + x]) continue;
      if ((x > 0 && solid[y * fw + x - 1]) || (x < fw - 1 && solid[y * fw + x + 1]) ||
          (y > 0 && solid[(y - 1) * fw + x]) || (y < fh - 1 && solid[(y + 1) * fw + x])) {
        d[(this.oy + y) * W + this.ox + x] = v;
      }
    }
  }
  // Scale the alpha of everything in the frame (ghosts)
  fade(a) {
    const W = this.w, d = this.data;
    for (let y = 0; y < this.fh; y++) for (let x = 0; x < this.fw; x++) {
      const i = (this.oy + y) * W + this.ox + x, al = d[i] >>> 24;
      if (al) d[i] = ((Math.round(al * a) << 24) | (d[i] & 0xffffff)) >>> 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const CLEAVER = { type: 'cleaver', blade: '#cdd4dc', edge: '#f7f9fb', spine: '#78838f', hilt: '#e9e4d8', hiltShade: '#a9a294', cloth: '#e9e4d8', len: 20,
  backBlade: { blade: '#8f99a6', edge: '#c9d1da', spine: '#535c68' }, smear: '#dfe9ff70' };
const TENSA = { type: 'katana', blade: '#15141b', edge: '#8a2a34', guard: '#2a2830', hilt: '#1a1820', hiltShade: '#3a3844', chain: '#6a6a78', len: 16, manji: true, smear: '#c8202c66' };
const ALL_ANIMS = null;   // every clip
const ENEMY_ANIMS = ['idle', 'run', 'hurt', 'windup', 'strike', 'guard', 'guardIdle', 'recover', 'cast'];
const BOSS_ANIMS = ['idle', 'run', 'jump', 'fall', 'dash', 'cast', 'guardIdle', 'windup', 'strike', 'hurt', 'land'];

const STYLE_ICHIGO = {
  skin: '#f2c49b', skinShade: '#c98d62', eye: '#2a1810', brow: '#b4561a',
  hair: '#f0882a', hairHi: '#ffc26a', hairShade: '#b0520f', hairStyle: 'spiky',
  robe: '#1b1a23', robeHi: '#3a3846', robeShade: '#0c0b11', inner: '#ece7dc', sash: '#ece7dc',
  hakama: '#18171f', hakamaShade: '#0d0c12', hakamaHi: '#33313d', tabi: '#efebe2', sandal: '#7a5a36',
  strap: '#c23a3a', legLen: 8, torsoLen: 9, weapon: CLEAVER, carry: 'back', anims: ALL_ANIMS,
};
const MASK_HOLLOW = { base: '#f6f3ec', shade: '#cfcabe', stripe: '#c8202c', eye: '#f2c230' };

function variant(base, over) { return Object.assign({}, base, over); }

const SOUL = {   // shared palette for wandering souls
  skin: '#ecdccb', skinShade: '#b9a28c', eye: '#3a3040', brow: '#6a5040',
  hair: '#6a5040', hairHi: '#8a6a54', hairShade: '#4a3830', hairStyle: 'short',
  robe: '#dfe6f1', robeHi: '#ffffff', robeShade: '#a9b6c8', inner: '#b8c6da', sash: '#7a8aa4',
  hakama: '#d3dbe8', hakamaShade: '#a3afc2', hakamaHi: '#f4f8ff', tabi: '#e8eaee', sandal: '#7a6a58',
  chain: '#8f8f9e', legLen: 8, torsoLen: 9, carry: 'none', weapon: { type: 'none' }, anims: ['idle'], alpha: 0.88,
};

const STYLES = {
  ichigo: STYLE_ICHIGO,
  ichigo_m: variant(STYLE_ICHIGO, { mask: MASK_HOLLOW }),
  ichigo_b: variant(STYLE_ICHIGO, { strap: null, carry: 'hand', weapon: TENSA, coat: { col: '#0d0c12', hi: '#2c2a36', lining: '#b4303a' }, robe: '#121118', sash: '#121118', inner: '#b4303a' }),
  final: variant(STYLE_ICHIGO, {
    skin: '#e8e8ef', skinShade: '#a9a9b8', eye: '#f2c230', sclera: '#0a0a0e', brow: '#c8c8d4',
    hair: '#f4f4f8', hairHi: '#ffffff', hairShade: '#a8a8bc', robe: '#ebeaf1', robeHi: '#ffffff', robeShade: '#a9a7ba',
    inner: '#15141b', sash: '#15141b', hakama: '#e3e1ea', hakamaShade: '#a8a6b8', hakamaHi: '#ffffff', tabi: '#15141b', sandal: '#3a3a48',
    strap: '#15141b', legLen: 9, torsoLen: 10, anims: BOSS_ANIMS,
    weapon: variant(CLEAVER, { blade: '#1d1b25', edge: '#6a6878', spine: '#0a0a10', hilt: '#15141b', hiltShade: '#3a3846', cloth: '#15141b', smear: '#30304060', backBlade: { blade: '#26242e', edge: '#55536a', spine: '#0a0a10' } }),
  }),
  captain: {
    skin: '#e6bf98', skinShade: '#b88a62', eye: '#16141e', brow: '#1f2440',
    hair: '#1f2440', hairHi: '#3e4878', hairShade: '#10132a', hairStyle: 'long',
    robe: '#16151d', robeHi: '#34323f', robeShade: '#0b0a10', inner: '#dcd8cf', sash: '#dcd8cf',
    hakama: '#14131a', hakamaShade: '#0a090e', hakamaHi: '#2e2c38', tabi: '#efebe2', sandal: '#5a4630',
    haori: { col: '#f1f0ea', shade: '#c4c2ba', hem: '#22222c' }, legLen: 10, torsoLen: 10, carry: 'hand', anims: BOSS_ANIMS,
    weapon: { type: 'katana', blade: '#c9d0d8', edge: '#ffffff', guard: '#c9a227', hilt: '#3a2a52', hiltShade: '#5a4a72', len: 15, smear: '#dfe9ff60' },
  },
  shini: {
    skin: '#c8a88a', skinShade: '#94765c', eye: '#ff3040', brow: '#2a2633',
    hair: '#2a2633', hairHi: '#4a4458', hairShade: '#16141c', hairStyle: 'short',
    robe: '#2b2238', robeHi: '#4c3e60', robeShade: '#18121f', inner: '#9a93a8', sash: '#6b2b8a',
    hakama: '#241c30', hakamaShade: '#140f1c', hakamaHi: '#3c3050', tabi: '#c8c2b8', sandal: '#3a2a20',
    armband: '#e8e4d8', legLen: 8, torsoLen: 9, carry: 'hand', anims: ENEMY_ANIMS,
    weapon: { type: 'katana', blade: '#b4bac4', edge: '#e8ecf0', guard: '#6a6a7a', hilt: '#3a2a3a', hiltShade: '#5a4a5a', len: 14, smear: '#c8a8ff50' },
  },
  arrancar: {
    skin: '#dccdbd', skinShade: '#a8988a', eye: '#40e0ff', brow: '#2e2e3a',
    hair: '#2e2e3a', hairHi: '#4e4e5e', hairShade: '#18181f', hairStyle: 'short',
    robe: '#ece8f1', robeHi: '#ffffff', robeShade: '#a9a5b8', inner: '#16141c', sash: '#16141c',
    hakama: '#e3dfe9', hakamaShade: '#a8a4b6', hakamaHi: '#ffffff', tabi: '#16141c', sandal: '#16141c',
    jawMask: '#f6f4ee', hole: true, legLen: 8, torsoLen: 9, carry: 'none', weapon: { type: 'none' }, anims: ['idle', 'run', 'cast', 'hurt'],
  },
  thug: {
    skin: '#d8b48a', skinShade: '#a8845e', eye: '#1a1410', brow: '#3d2c20',
    hair: '#3d2c20', hairHi: '#5a4430', hairShade: '#2a1c14', hairStyle: 'hood',
    robe: '#5b4330', robeHi: '#7a5c42', robeShade: '#3a2a1e', inner: '#8b6b4a', sash: '#8b6b4a',
    hakama: '#4a3626', hakamaShade: '#2e2016', hakamaHi: '#664a34', tabi: '#3d2c20', sandal: '#2a1c12',
    patch: '#3a2a1e', legLen: 7, torsoLen: 8, carry: 'hand', anims: ENEMY_ANIMS,
    weapon: { type: 'club', col: '#7a5a3a', hi: '#a07a50', len: 11, smear: '#e8d8b850' },
  },
  vasto: {
    skin: '#eeeaf4', skinShade: '#b4b0c4', eye: '#f2c230', sclera: '#0a0a0e', brow: '#eeeaf4',
    hair: '#eeeaf4', hairHi: '#ffffff', hairShade: '#b4b0c4', hairStyle: 'horns', mane: '#e8e4f0',
    robe: '#eeeaf4', robeHi: '#ffffff', robeShade: '#a8a4ba', inner: '#8a1a2a', sash: '#16141c',
    hakama: '#e6e2ee', hakamaShade: '#aaa6bc', hakamaHi: '#ffffff', tabi: '#16141c', sandal: '#16141c',
    fur: '#17151d', claws: '#17151d', mask: { base: '#f6f3ec', shade: '#cfcabe', stripe: '#8a1a2a', eye: '#f2c230' },
    hole: true, legLen: 12, torsoLen: 12, carry: 'none', weapon: { type: 'none' }, anims: ['idle', 'float', 'dive', 'rush', 'cast', 'hurt'],
  },

  // NPCs
  npc_plus: variant(SOUL, {}),
  npc_faded: variant(SOUL, { hair: '#c9c9da', hairHi: '#ffffff', hairShade: '#9a9aae', hairStyle: 'long', alpha: 0.66 }),
  npc_lost: variant(SOUL, { hair: '#4a3a30', alpha: 0.8, chainBroken: true, basePose: { crouch: 3, lean: 1, fh: [4, 10], bh: [2, 11], ff: [3, 0], bf: [-3, 0], tilt: 1 } }),
  npc_old: {
    skin: '#d6ad8c', skinShade: '#a07a5c', eye: '#2a2018', brow: '#e8e4dc', beard: '#ece8e0',
    hair: '#6a5e50', hairHi: '#8a7c6a', hairShade: '#4a4036', hairStyle: 'hood',
    robe: '#6a5e50', robeHi: '#8a7c6a', robeShade: '#4a4036', inner: '#a89a84', sash: '#a89a84',
    hakama: '#544a3e', hakamaShade: '#3a3229', hakamaHi: '#6e6252', tabi: '#c8c0b0', sandal: '#4a3826',
    legLen: 7, torsoLen: 7, carry: 'hand', anims: ['idle'],
    weapon: { type: 'cane', col: '#7a5a3a', hi: '#a07a50' },
    basePose: { crouch: 1, lean: 1, fh: [5, 8], weapon: { mode: 'hand', angle: 88 } },
  },
  npc_clerk: {
    skin: '#efc8a0', skinShade: '#c09470', eye: '#2a2028', brow: '#2a2230',
    hair: '#2a2230', hairHi: '#4a3e52', hairShade: '#16121c', hairStyle: 'bun',
    robe: '#3a4a6a', robeHi: '#566a90', robeShade: '#26324a', inner: '#e8e4d8', sash: '#e8e4d8',
    hakama: '#2e3a54', hakamaShade: '#1e2638', hakamaHi: '#46567a', tabi: '#e8e4d8', sandal: '#5a4630',
    apron: '#e8e4d8', legLen: 8, torsoLen: 9, carry: 'none', weapon: { type: 'none' }, anims: ['idle'],
  },
  npc_merchant: {
    skin: '#ecc59e', skinShade: '#b88e68', eye: '#2a2018', brow: '#c8a850',
    hair: '#d8c070', hairHi: '#f0dc94', hairShade: '#a88e48', hairStyle: 'buckethat', hat: '#ecebe2', hatStripe: '#3a6a44',
    robe: '#16151c', robeHi: '#2e2c38', robeShade: '#0b0a10', inner: '#16151c', sash: '#16151c',
    hakama: '#1e2420', hakamaShade: '#121612', hakamaHi: '#2e3630', tabi: '#e8e4dc', sandal: '#5a4630',
    haori: { col: '#34453a', shade: '#24302a', hem: '#e8e4dc' }, legLen: 9, torsoLen: 9, carry: 'hand', anims: ['idle'],
    weapon: { type: 'cane', col: '#6a4a2a', hi: '#8a6a40' },
    basePose: { fh: [5, 8], bh: [1, 5], weapon: { mode: 'hand', angle: 88 } },
  },
  npc_masked: {
    skin: '#ecc8a6', skinShade: '#b8906c', eye: '#2a2018', brow: '#b89a40',
    hair: '#e2c25a', hairHi: '#fff0a0', hairShade: '#a8882c', hairStyle: 'long', sideMask: '#f6f3ec',
    robe: '#1f1d26', robeHi: '#3a3846', robeShade: '#0e0d12', inner: '#e8e4d8', sash: '#7a1a24',
    hakama: '#26242e', hakamaShade: '#16141c', hakamaHi: '#3a3846', tabi: '#16141c', sandal: '#16141c',
    legLen: 9, torsoLen: 9, carry: 'none', weapon: { type: 'none' }, anims: ['idle'],
    basePose: { fh: [3, 6], bh: [-1, 6] },
  },
};
Object.assign(STYLES, {
  npc_smith: {
    skin: '#d8a880', skinShade: '#a87a58', eye: '#2a2018', brow: '#6a6a72', beard: '#9a9aa4',
    hair: '#8a8a94', hairHi: '#b8b8c2', hairShade: '#5a5a64', hairStyle: 'short', headband: '#e8e4d8',
    robe: '#3a2e26', robeHi: '#5a4a3e', robeShade: '#221a14', inner: '#d8d0c0', sash: '#a83030', apron: '#6a4a2e',
    hakama: '#2e2620', hakamaShade: '#1a1410', hakamaHi: '#46382e', tabi: '#d8d0c0', sandal: '#3a2a1a',
    legLen: 8, torsoLen: 9, carry: 'hand', anims: ['idle'],
    weapon: { type: 'hammer', col: '#6a4a2a', head: '#5a5a66', hi: '#9a9aa6', len: 8 },
    basePose: { fh: [5, 6], weapon: { mode: 'hand', angle: 95 } },
  },
  npc_lostshini: variant(STYLES.shini, {
    eye: '#2a2028', robe: '#22202c', robeHi: '#3e3a4c', robeShade: '#121018', sash: '#e8e4d8', inner: '#d8d4cc',
    hakama: '#1e1c28', hakamaShade: '#100e16', hakamaHi: '#34324a', anims: ['idle'], alpha: 0.82,
    basePose: { fh: [3, 9], weapon: { mode: 'hand', angle: 100 } },
  }),
  npc_hiding: variant(SOUL, { hair: '#3a3040', legLen: 6, torsoLen: 7, alpha: 0.8, basePose: { crouch: 1, lean: -1, fh: [1, 4], bh: [-1, 4], tilt: 1 } }),
  espada: {
    skin: '#e2d4c6', skinShade: '#ae9e90', eye: '#40e0ff', brow: '#1a1a24',
    hair: '#1a1a24', hairHi: '#3a3a4a', hairShade: '#0a0a10', hairStyle: 'short',
    robe: '#ece8f1', robeHi: '#ffffff', robeShade: '#aaa6ba', inner: '#16141c', sash: '#16141c',
    hakama: '#e3dfe9', hakamaShade: '#a8a4b6', hakamaHi: '#ffffff', tabi: '#16141c', sandal: '#16141c',
    jawMask: '#f6f4ee', hole: true, legLen: 9, torsoLen: 10, carry: 'hand', anims: BOSS_ANIMS,
    weapon: { type: 'katana', blade: '#c8ced8', edge: '#ffffff', guard: '#2a2830', hilt: '#3a3a48', hiltShade: '#5a5a6a', len: 15, smear: '#7fe8ff60' },
  },
});
STYLES.espada_r = variant(STYLES.espada, {
  robe: '#24222e', robeHi: '#46445a', robeShade: '#121018', hakama: '#1c1a26', hakamaShade: '#0e0c14', hakamaHi: '#34324a',
  hairStyle: 'horns', hair: '#ece8f4', hairHi: '#ffffff', hairShade: '#a8a4bc', jawMask: null, claws: '#17151d',
  mask: { base: '#f6f3ec', shade: '#cfcabe', stripe: '#3aa0c8', eye: '#40e0ff' },
  weapon: variant(STYLES.espada.weapon, { blade: '#7fe8ff', edge: '#ffffff', guard: '#3aa0c8', smear: '#7fe8ff80' }),
});
STYLES.ichigo_bm = variant(STYLES.ichigo_b, { mask: MASK_HOLLOW });
STYLES.final_m = variant(STYLES.final, { mask: variant(MASK_HOLLOW, { stripe: '#c8202c' }) });
STYLES.final_b = variant(STYLES.final_m, {
  carry: 'hand', strap: null,
  weapon: variant(TENSA, { blade: '#f2f2f8', edge: '#8a8898', guard: '#d8d6e0', hilt: '#ecebf2', hiltShade: '#b8b6c4', chain: '#b8b8c4', smear: '#f0f0ff60' }),
  coat: { col: '#ecebf2', hi: '#ffffff', lining: '#15141b' },
});
STYLES.captain_b = variant(STYLES.captain, {
  haori: { col: '#2c2552', shade: '#1a1636', hem: '#a99cff' },
  weapon: variant(STYLES.captain.weapon, { blade: '#c8bcff', edge: '#ffffff', guard: '#8a7cff', smear: '#a99cff70' }),
  eye: '#a99cff',
});

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function drawSmear(pen, w, grip, from, to) {
  if (!w || w.type === 'none' || from === to) return;
  const L = (w.len || 12) + 2, c = w.smear || '#ffffff50';
  const step = (to > from ? 1 : -1) * 3;
  for (let a = from; (step > 0 ? a <= to : a >= to); a += step) {
    const r = a * Math.PI / 180, dx = Math.cos(r), dy = Math.sin(r);
    for (let t = L * 0.45; t <= L; t += 1) pen.under(grip.x + dx * t, grip.y + dy * t, c);
  }
}

function drawWeapon(pen, w, grip, deg, sway = 0) {
  if (!w || w.type === 'none') return;
  const a = deg * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const at = (t, n = 0) => [grip.x + dx * t + nx * n, grip.y + dy * t + ny * n];
  if (w.type === 'cleaver') {
    const L = w.len + 2, hw = 2.5;
    pen.poly([at(2, -hw), at(L - 4, -hw), at(L, hw), at(2, hw)], w.blade);
    pen.line(...at(2, hw - 0.6), ...at(L - 0.5, hw - 0.6), w.edge);
    pen.line(...at(2, -hw + 0.6), ...at(L - 4.5, -hw + 0.6), w.spine);
    pen.line(...at(-4), ...at(1.5), w.hilt, 2);
    pen.px(...at(-2), w.hiltShade); pen.px(...at(0), w.hiltShade);
    const p = at(-4);
    pen.line(p[0], p[1], p[0] - dx * 2 + nx * 2 + sway, p[1] - dy * 2 + ny * 2 + 2, w.cloth);
    pen.px(p[0] - dx * 3 + nx * 3 + sway * 1.5, p[1] - dy * 3 + ny * 3 + 3, w.cloth);
  } else if (w.type === 'katana') {
    const L = w.len + 2;
    pen.line(...at(2), ...at(L - 1), w.blade, 2);
    pen.line(...at(2, 1), ...at(L - 1, 1), w.edge);
    pen.px(...at(L), w.blade);
    const g = at(1.5);
    if (w.manji) {
      pen.rect(g[0] - 1.5, g[1] - 1.5, 3, 3, w.guard);
      pen.px(g[0], g[1], w.hiltShade);
    } else {
      pen.line(...at(1.5, -2), ...at(1.5, 2), w.guard, 1);
    }
    pen.line(...at(-4), ...at(0.5), w.hilt, 2);
    pen.px(...at(-2), w.hiltShade);
    if (w.chain) { const p = at(-4.5); pen.px(p[0], p[1] + 1, w.chain); pen.px(p[0] - 1 + sway * 0.5, p[1] + 2, w.chain); pen.px(p[0] - 1 + sway, p[1] + 3, w.chain); }
  } else if (w.type === 'club') {
    pen.limb(...at(-1), ...at(w.len), 2, 3.5, w.col);
    pen.line(...at(1, -0.5), ...at(w.len - 1, -1), w.hi);
    pen.px(...at(w.len - 2, 1.5), '#5a4030');
  } else if (w.type === 'hammer') {
    pen.line(...at(-2), ...at(w.len || 8), w.col, 1);
    const h = at((w.len || 8) + 1);
    pen.line(h[0] - nx * 2.5, h[1] - ny * 2.5, h[0] + nx * 2.5, h[1] + ny * 2.5, w.head, 3);
    pen.px(h[0] - nx * 2, h[1] - ny * 2, w.hi);
  } else if (w.type === 'cane') {
    pen.line(grip.x, grip.y - 1, grip.x + 1, HF.FEET - 1, w.col);
    pen.px(grip.x - 1, grip.y - 1, w.hi); pen.px(grip.x, grip.y - 2, w.hi);
  }
}

function drawHair(pen, st, sx, hy, sway) {
  const H = st.hair, S = st.hairShade, L = st.hairHi;
  const tri = (b1, b2, tip, c = H) => pen.poly([[sx + b1[0], hy + b1[1]], [sx + b2[0], hy + b2[1]], [sx + tip[0], hy + tip[1]]], c);
  switch (st.hairStyle) {
    case 'spiky':
      pen.ellipse(sx - 1, hy - 8.5, 4.6, 2.8, H);
      pen.poly([[sx - 2, hy - 9], [sx - 5, hy - 9], [sx - 5, hy - 4], [sx - 2, hy - 4]], H);
      tri([-3, -10], [-1, -11], [-8 + sway, -13]);
      tri([-4, -9], [-4, -7], [-9 + sway, -9]);
      tri([-5, -6], [-3, -4], [-8 + sway, -3], S);
      tri([-2, -11], [1, -11], [-2 + sway * 0.6, -15]);
      tri([0, -11], [3, -10], [3 + sway * 0.6, -15]);
      tri([2, -10], [4, -8], [7 + sway * 0.4, -11]);
      tri([2, -9], [4, -8], [5, -5]);
      tri([0, -9], [2, -9], [1, -6.5]);
      pen.line(sx - 2, hy - 12, sx + 1, hy - 12, L);
      pen.px(sx + 3, hy - 11, L); pen.px(sx - 5, hy - 10, L); pen.px(sx - 1, hy - 13, L);
      pen.line(sx - 5, hy - 5, sx - 3, hy - 4, S);
      break;
    case 'short':
      pen.ellipse(sx - 0.5, hy - 8.5, 4.2, 2.6, H);
      pen.poly([[sx - 2, hy - 9], [sx - 4, hy - 9], [sx - 4, hy - 5], [sx - 2, hy - 5]], H);
      tri([-3, -10], [0, -11], [-5 + sway, -12]);
      tri([0, -11], [3, -10], [2 + sway * 0.6, -13]);
      tri([2, -9], [4, -8], [5, -6]);
      pen.line(sx - 2, hy - 11, sx + 1, hy - 11, L);
      break;
    case 'long':
      pen.ellipse(sx - 0.5, hy - 8.5, 4.4, 2.7, H);
      pen.poly([[sx - 2, hy - 9], [sx - 5, hy - 9], [sx - 5, hy - 3], [sx - 2, hy - 4]], H);
      pen.limb(sx - 4, hy - 8, sx - 7 + sway, hy + 7, 3.5, 1.5, H);
      pen.line(sx - 5, hy - 6, sx - 7 + sway, hy + 6, S);
      tri([2, -9], [4, -8], [4, -5]);
      pen.line(sx - 2, hy - 11, sx + 2, hy - 11, L);
      break;
    case 'bun':
      pen.ellipse(sx - 0.5, hy - 8.5, 4.2, 2.6, H);
      pen.poly([[sx - 2, hy - 9], [sx - 4, hy - 9], [sx - 4, hy - 5], [sx - 2, hy - 5]], H);
      pen.ellipse(sx - 4, hy - 11, 2.2, 2, H);
      pen.line(sx - 6, hy - 12, sx - 2, hy - 10, '#c8a040');
      tri([1, -9], [4, -8], [4, -6]);
      pen.line(sx - 2, hy - 11, sx + 1, hy - 11, L);
      break;
    case 'buckethat':
      pen.poly([[sx - 2, hy - 7], [sx - 5, hy - 7], [sx - 5, hy - 3], [sx - 2, hy - 4]], H);
      pen.line(sx - 5, hy - 4, sx - 6 + sway, hy - 1, H);
      pen.rect(sx - 4, hy - 13, 8, 4, st.hat);
      for (let x = -3; x <= 3; x += 2) pen.line(sx + x, hy - 13, sx + x, hy - 10, st.hatStripe);
      pen.rect(sx - 6, hy - 9, 12, 1, st.hat);
      pen.line(sx - 6, hy - 8, sx + 5, hy - 8, '#b8b6aa');
      break;
    case 'hood':
      pen.poly([[sx - 6, hy - 2], [sx - 5, hy - 10], [sx - 1, hy - 12], [sx + 3, hy - 11], [sx + 5, hy - 8], [sx + 4, hy - 7], [sx + 1, hy - 8], [sx - 1, hy - 3]], st.robe);
      pen.line(sx - 5, hy - 9, sx + 2, hy - 11, st.robeHi);
      pen.line(sx - 6, hy - 3, sx - 4, hy - 1, st.robeShade);
      if (st.patch) { pen.px(sx - 3, hy - 8, st.patch); pen.px(sx - 2, hy - 8, st.patch); pen.px(sx - 3, hy - 7, st.patch); }
      break;
    case 'horns':
      if (st.mane) { pen.limb(sx - 3, hy - 9, sx - 9 + sway, hy + 2, 4, 2, st.mane); pen.line(sx - 4, hy - 7, sx - 9 + sway, hy + 1, S); }
      pen.ellipse(sx - 0.5, hy - 8.5, 4, 2.5, H);
      pen.limb(sx - 1, hy - 10, sx + 5, hy - 13, 3, 2, S);
      pen.limb(sx + 5, hy - 13, sx + 9, hy - 18, 2, 1, S);
      pen.limb(sx + 1, hy - 9, sx + 8, hy - 11, 3, 2, H);
      pen.limb(sx + 8, hy - 11, sx + 12, hy - 16, 2, 1, H);
      pen.line(sx - 2, hy - 11, sx + 1, hy - 11, L);
      break;
  }
}

function drawHead(pen, st, sx, sy, P) {
  const hy = sy + (P.tilt || 0);
  pen.rect(sx, hy - 2, 2, 2, st.skinShade);
  pen.rect(sx - 2, hy - 8, 6, 6, st.skin);
  pen.px(sx + 4, hy - 5, st.skin);
  pen.rect(sx - 1, hy - 3, 4, 1, st.skinShade);
  pen.rect(sx - 2, hy - 8, 6, 1, st.skinShade);
  if (st.mask) {
    const m = st.mask;
    pen.rect(sx - 2, hy - 8, 6, 6, m.base);
    pen.px(sx + 4, hy - 5, m.base); pen.px(sx + 4, hy - 4, m.base);
    pen.line(sx - 1, hy - 8, sx - 1, hy - 3, m.stripe);
    pen.line(sx + 1, hy - 8, sx + 1, hy - 5, m.stripe);
    pen.px(sx + 2, hy - 6, '#0a0a0e'); pen.px(sx + 3, hy - 6, m.eye);
    for (let x = sx; x <= sx + 4; x++) pen.px(x, hy - 3, (x - sx) % 2 ? '#0a0a0e' : m.base);
    pen.rect(sx - 2, hy - 2, 1, 1, m.shade);
  } else {
    const blink = P.blink;
    pen.px(sx + 2, hy - 6, blink ? st.skinShade : (st.sclera || st.eye));
    pen.px(sx + 3, hy - 6, blink ? st.skinShade : (st.sclera ? st.eye : st.skin));
    pen.px(sx + 1, hy - 7, st.brow); pen.px(sx + 2, hy - 7, st.brow); pen.px(sx + 3, hy - 8, st.brow);
    pen.px(sx + 3, hy - 3, st.skinShade);
    if (st.jawMask) {
      pen.rect(sx, hy - 4, 5, 2, st.jawMask);
      pen.px(sx + 1, hy - 3, '#16141c'); pen.px(sx + 3, hy - 3, '#16141c');
      pen.line(sx - 1, hy - 5, sx - 1, hy - 3, st.jawMask);
    }
    if (st.beard) { pen.rect(sx, hy - 3, 4, 2, st.beard); pen.px(sx + 1, hy - 1, st.beard); pen.px(sx + 2, hy - 1, st.beard); }
  }
  drawHair(pen, st, sx, hy, P.sway || 0);
  if (st.headband) {
    pen.line(sx - 3, hy - 8, sx + 3, hy - 8, st.headband);
    pen.line(sx - 4, hy - 8, sx - 6 + (P.sway || 0), hy - 6, st.headband);
  }
  if (st.sideMask) {   // a Hollow mask pushed up onto the side of the head
    pen.rect(sx - 4, hy - 10, 4, 4, st.sideMask);
    pen.px(sx - 3, hy - 9, '#16141c'); pen.px(sx - 2, hy - 7, '#c8202c');
  }
  if (!st.mask && st.hairStyle !== 'hood' && st.hairStyle !== 'buckethat') pen.px(sx - 1, hy - 5, st.skinShade);
}

function drawArm(pen, st, sh, hand, back) {
  const sleeve = back ? st.robeShade : st.robe;
  const ex = sh.x + (hand.x - sh.x) * 0.62, ey = sh.y + (hand.y - sh.y) * 0.62;
  pen.limb(sh.x, sh.y, ex, ey, 3.6, 4, sleeve);
  if (!back) pen.line(sh.x + 1, sh.y, ex + 1, ey, st.robeHi);
  if (!back && st.armband) pen.line(sh.x - 1, sh.y + 1, sh.x + 2, sh.y + 2, st.armband);
  const fore = st.coat ? (back ? st.robeShade : st.coat.col) : (back ? st.skinShade : st.skin);
  pen.limb(ex, ey, hand.x, hand.y, 2, 2, fore);
  if (st.claws) {
    pen.rect(hand.x - 1, hand.y - 1, 2, 2, st.claws);
    pen.px(hand.x + 1, hand.y + 1, st.claws); pen.px(hand.x, hand.y + 2, st.claws);
  } else pen.rect(hand.x - 1, hand.y - 1, 2, 2, back ? st.skinShade : st.skin);
}

function drawLeg(pen, st, hip, foot, back) {
  const col = back ? st.hakamaShade : st.hakama;
  const lift = HF.FEET - 1 - foot.y;
  const mx = (hip.x + foot.x) / 2 + (lift > 0 ? 1 + lift * 0.5 : 0), my = (hip.y + foot.y) / 2;
  pen.limb(hip.x, hip.y, mx, my, 4, 4.5, col);
  pen.limb(mx, my, foot.x, foot.y - 1.5, 4.5, 5.5, col);
  if (!back) pen.line(mx + 1, my, foot.x + 2, foot.y - 2, st.hakamaHi);
  if (st.claws) {
    pen.rect(foot.x - 1, foot.y - 1, 4, 2, st.claws);
  } else {
    pen.rect(foot.x - 1, foot.y - 1, 3, 1, st.tabi);
    pen.rect(foot.x - 1, foot.y, 4, 1, st.sandal);
  }
}

function drawHumanoid(pen, st, P) {
  const G = HF.FEET - 1, hx = HF.HX;
  const crouch = P.crouch || 0, lean = P.lean || 0, sway = P.sway || 0;
  const hipY = G + 1 - st.legLen + crouch;
  const sx = hx + lean, sy = hipY - st.torsoLen + (P.bob || 0);
  const ff = { x: hx + 2 + P.ff[0], y: G - P.ff[1] };
  const bf = { x: hx - 2 + P.bf[0], y: G - P.bf[1] };
  const fh = { x: sx + P.fh[0], y: sy + P.fh[1] };
  const bh = { x: sx + P.bh[0], y: sy + P.bh[1] };
  const wpn = P.weapon || (st.carry === 'back' ? { mode: 'back' } : st.carry === 'hand' ? { mode: 'hand', angle: 70 } : { mode: 'none' });
  const wl = hx - 4 + lean * 0.3, wr = hx + 3 + lean * 0.3;

  if (P.smear && wpn.mode === 'hand') drawSmear(pen, st.weapon, fh, P.smear[0], P.smear[1]);
  if (wpn.mode === 'back') drawWeapon(pen, Object.assign({}, st.weapon, st.weapon.backBlade || {}), { x: sx, y: sy - 7 }, 122, sway);
  if (st.coat) {
    const cs = P.coatSway || 0;
    pen.poly([[sx - 4, sy + 1], [sx + 1, sy + 2], [hx + 3 + cs, G - 1], [hx - 8 + cs * 1.6, G - 1]], st.coat.col);
    for (let x = Math.round(hx - 8 + cs * 1.6); x <= hx + 3 + cs; x += 2) pen.px(x, G - 1, st.coat.lining);
    pen.line(sx - 4, sy + 2, hx - 8 + cs * 1.6, G - 2, st.coat.hi);
  }
  if (st.haori) {
    const cs = P.coatSway || 0;
    pen.poly([[sx - 5, sy], [sx - 1, sy], [hx + 1 + cs, G - 5], [hx - 8 + cs * 1.4, G - 5]], st.haori.col);
    pen.line(sx - 5, sy + 1, hx - 8 + cs * 1.4, G - 6, st.haori.shade);
    for (let x = Math.round(hx - 8 + cs * 1.4); x <= hx + 1 + cs; x++) pen.px(x, G - 5, (x % 3 === 0) ? st.haori.col : st.haori.hem);
  }
  drawArm(pen, st, { x: sx - 2, y: sy + 1 }, bh, true);
  drawLeg(pen, st, { x: hx - 2, y: hipY }, bf, true);
  drawLeg(pen, st, { x: hx + 2, y: hipY }, ff, false);

  // torso
  pen.poly([[sx - 4, sy], [sx + 4, sy], [wr + 0.5, hipY], [wl - 0.5, hipY]], st.robe);
  pen.line(sx - 4, sy + 1, wl, hipY - 1, st.robeShade);
  pen.line(sx + 3, sy + 1, wr, hipY - 2, st.robeHi);
  if (st.fur) { pen.rect(sx - 4, sy - 1, 9, 2, st.fur); pen.px(sx - 5, sy, st.fur); pen.px(sx + 5, sy, st.fur); }
  else { pen.line(sx, sy, sx + 2, sy + 4, st.inner); pen.line(sx + 3, sy, sx + 2, sy + 3, st.inner); }
  if (st.apron) pen.poly([[sx - 1, sy + 3], [sx + 4, sy + 3], [wr + 1, hipY + 4], [wl + 1, hipY + 4]], st.apron);
  if (st.hole) { pen.erase(sx, sy + 4); pen.erase(sx + 1, sy + 4); pen.erase(sx, sy + 5); pen.erase(sx + 1, sy + 5); }
  pen.rect(wl, hipY - 2, wr - wl + 1, 2, st.sash);
  if (st.strap) pen.line(sx - 3, sy + 1, wr - 1, hipY - 3, st.strap);
  if (st.coat) pen.line(sx + 3, sy, wr + 1, hipY + 3, st.coat.lining);
  if (st.haori) {
    pen.poly([[sx + 2, sy], [sx + 5, sy + 1], [hx + 5, G - 7], [hx + 2, G - 7]], st.haori.col);
    pen.line(hx + 2, G - 7, hx + 5, G - 7, st.haori.hem);
  }
  if (st.chain) {   // chain of fate hanging from the chest
    const cx = sx + 1, cy = sy + 3;
    const n = st.chainBroken ? 3 : 6;
    for (let i = 0; i < n; i++) pen.px(cx + 1 + i * 0.5 + (i % 2), cy + i, i % 2 ? '#c8c8d4' : st.chain);
  }

  drawHead(pen, st, sx, sy, P);
  if (wpn.mode === 'hand') drawWeapon(pen, st.weapon, fh, wpn.angle, sway);
  drawArm(pen, st, { x: sx + 2, y: sy + 1 }, fh, false);
}

// ---------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------
const BASE_POSE = { bob: 0, lean: 0, crouch: 0, ff: [1, 0], bf: [-2, 0], fh: [2, 8], bh: [-3, 8], weapon: null, sway: 0, tilt: 0, coatSway: 0 };
const W = (angle) => ({ mode: 'hand', angle });

function lerpPose(a, b, t) {
  const o = {};
  for (const k of Object.keys(BASE_POSE)) {
    const va = a[k] ?? BASE_POSE[k], vb = b[k] ?? BASE_POSE[k];
    if (Array.isArray(va)) o[k] = va.map((v, i) => v + (vb[i] - v) * t);
    else if (typeof va === 'number') o[k] = va + (vb - va) * t;
    else o[k] = t < 0.5 ? va : vb;
  }
  if (a.weapon && b.weapon && a.weapon.mode === 'hand' && b.weapon.mode === 'hand') o.weapon = W(a.weapon.angle + (b.weapon.angle - a.weapon.angle) * t);
  return o;
}

// Four-beat swing: anticipation, smeared mid-swing, impact (smeared), follow-through
function swing(k0, k2, k3) {
  const k1 = lerpPose(k0, k2, 0.55);
  k1.smear = [k0.weapon.angle, k1.weapon.angle];
  const impact = Object.assign({}, k2, { smear: [k1.weapon.angle, k2.weapon.angle] });
  return [k0, k1, impact, k3];
}

function runFrames(n, o = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = i / n * Math.PI * 2, c = Math.cos(f), s = Math.sin(f);
    out.push(Object.assign({
      lean: 2, bob: Math.cos(2 * f) > 0.3 ? 1 : 0, sway: -1 - Math.abs(s) * 0.8, coatSway: -2 + s,
      ff: [Math.round(4.5 * c), Math.round(Math.max(0, s) * 3.5)],
      bf: [Math.round(-4.5 * c), Math.round(Math.max(0, -s) * 3.5)],
      fh: [Math.round(-3.5 * c) + 2, 7 - Math.round(Math.abs(c))], bh: [Math.round(3.5 * c) - 2, 7],
    }, o));
  }
  return out;
}

// name: [frames, frameRate, repeat]
function humanoidAnims(st) {
  const all = humanoidAnimsBase(st);
  all.windup = [[all.slashA[0][0]], 1, 0];
  all.strike = [all.slashA[0].slice(1), 16, 0];
  const keep = st.anims ? Object.fromEntries(Object.entries(all).filter(([k]) => st.anims.includes(k))) : all;
  if (st.basePose) {
    for (const v of Object.values(keep)) v[0] = v[0].map(p => Object.assign({}, p, st.basePose, p.weapon && !st.basePose.weapon ? { weapon: p.weapon } : {}));
  }
  return keep;
}
function humanoidAnimsBase(st) {
  const hand = st.carry !== 'back';
  const idleW = st.carry === 'hand' ? W(70) : null;
  const idle = [0, 0.33, 0.66, 1, 0.66, 0.33].map((t, i) => ({
    bob: Math.round(t), sway: t, coatSway: t * 0.6, fh: [2, 8 + Math.round(t)], bh: [-3, 8 + Math.round(t)],
    weapon: idleW ? W(70 + t * 3) : null, blink: i === 4,
  }));
  return {
    idle: [idle, 6, -1],
    run: [runFrames(8, { weapon: hand && st.carry === 'hand' ? W(150) : null }), 14, -1],
    jump: [[
      { crouch: 2, ff: [2, 0], bf: [-3, 0], fh: [3, 6], bh: [-4, 7], sway: 1, weapon: idleW },
      { ff: [3, 4], bf: [-2, 2], fh: [4, 3], bh: [-5, 5], sway: -1, lean: 1, weapon: idleW },
    ], 14, 0],
    fall: [[{ ff: [3, 1], bf: [-3, 2], fh: [5, -1], bh: [-5, 0], sway: 1, coatSway: 1, weapon: idleW }, { ff: [3, 2], bf: [-3, 1], fh: [5, -2], bh: [-6, -1], sway: 2, coatSway: 2, weapon: idleW }], 8, -1],
    land: [[
      { crouch: 3, ff: [3, 0], bf: [-4, 0], fh: [4, 7], bh: [-5, 8], sway: 2, coatSway: 2, weapon: idleW },
      { crouch: 1, ff: [2, 0], bf: [-3, 0], fh: [3, 8], bh: [-4, 8], sway: 1, weapon: idleW },
    ], 16, 0],
    dash: [[
      { lean: 4, crouch: 1, ff: [5, 2], bf: [-7, 1], fh: [-3, 7], bh: [-6, 6], sway: -2, coatSway: -4, weapon: hand ? W(165) : null },
      { lean: 4, crouch: 1, ff: [5, 2], bf: [-8, 2], fh: [-4, 7], bh: [-7, 6], sway: -3, coatSway: -5, weapon: hand ? W(168) : null },
    ], 16, -1],
    cling: [[{ lean: -1, ff: [1, 3], bf: [-6, 4], fh: [3, 6], bh: [-7, 1], weapon: idleW }, { lean: -1, bob: 1, ff: [1, 3], bf: [-6, 4], fh: [3, 7], bh: [-7, 1], sway: 0.5, weapon: idleW }], 3, -1],
    focus: [[{ crouch: 2, ff: [3, 0], bf: [-3, 0], fh: [4, 3], bh: [3, 4], weapon: hand ? W(80) : null }, { crouch: 2, bob: 1, ff: [3, 0], bf: [-3, 0], fh: [4, 4], bh: [3, 5], sway: 0.5, weapon: hand ? W(80) : null }], 4, -1],
    cast: [[
      { lean: -1, ff: [3, 0], bf: [-4, 0], fh: [-2, 4], bh: [-4, 7], sway: 1, weapon: idleW },
      { lean: 2, ff: [4, 0], bf: [-5, 0], fh: [8, 1], bh: [-5, 6], sway: -1, weapon: idleW },
      { lean: 2, ff: [4, 0], bf: [-5, 0], fh: [9, 0], bh: [-5, 6], sway: -1.5, weapon: idleW },
    ], 16, 0],
    charge: [[{ crouch: 3, lean: 2, ff: [5, 0], bf: [-6, 0], fh: [-1, 7], bh: [-4, 6], sway: -1, weapon: W(160) }, { crouch: 3, lean: 2, bob: 1, ff: [5, 0], bf: [-6, 0], fh: [-1, 8], bh: [-4, 7], sway: -2, weapon: W(162) }], 10, -1],
    hurt: [[{ lean: -2, tilt: -1, ff: [2, 1], bf: [-3, 0], fh: [5, -3], bh: [-6, -1], sway: 2, weapon: idleW }], 1, 0],
    slashA: [swing(
      { lean: -1, ff: [2, 0], bf: [-4, 0], fh: [0, -4], bh: [-3, -2], weapon: W(-125), sway: 1 },
      { lean: 2, ff: [5, 0], bf: [-5, 0], fh: [6, 1], bh: [-4, 5], weapon: W(4), sway: -1, coatSway: -2 },
      { lean: 1, ff: [5, 0], bf: [-5, 0], fh: [5, 5], bh: [-4, 6], weapon: W(55), sway: -1 },
    ), 22, 0],
    slashB: [swing(
      { lean: -1, ff: [2, 0], bf: [-4, 0], fh: [-2, 7], bh: [-3, 6], weapon: W(140), sway: 1 },
      { lean: 2, ff: [5, 0], bf: [-5, 0], fh: [6, 2], bh: [-4, 5], weapon: W(-4), sway: -1, coatSway: -2 },
      { lean: 1, ff: [5, 0], bf: [-5, 0], fh: [5, -2], bh: [-4, 5], weapon: W(-55), sway: -1 },
    ), 22, 0],
    up: [swing(
      { crouch: 1, ff: [3, 0], bf: [-3, 0], fh: [3, 6], bh: [-3, 6], weapon: W(120) },
      { ff: [3, 0], bf: [-3, 0], fh: [2, -6], bh: [-3, 2], weapon: W(-88), sway: 1 },
      { ff: [3, 0], bf: [-3, 0], fh: [1, -5], bh: [-3, 3], weapon: W(-110), sway: 1 },
    ), 22, 0],
    down: [swing(
      { ff: [3, 4], bf: [-2, 3], fh: [3, -4], bh: [-4, 1], weapon: W(-70) },
      { ff: [3, 4], bf: [-2, 3], fh: [2, 5], bh: [-4, 4], weapon: W(84), sway: 1 },
      { ff: [3, 4], bf: [-2, 3], fh: [3, 5], bh: [-4, 5], weapon: W(70), sway: 1 },
    ), 22, 0],
    guard: [runFrames(6, { lean: 1, fh: [4, 2], bh: [-2, 5], weapon: W(-80), sway: -0.5 }), 8, -1],
    guardIdle: [[{ fh: [4, 2], bh: [-2, 5], weapon: W(-80) }, { bob: 1, fh: [4, 3], bh: [-2, 6], weapon: W(-78), sway: 0.5 }], 3, -1],
    recover: [[{ crouch: 1, lean: 1, ff: [4, 0], bf: [-4, 0], fh: [5, 7], bh: [-4, 7], weapon: W(75), sway: 1 }], 1, 0],
    float: [[{ ff: [2, 3], bf: [-3, 2], fh: [5, 4], bh: [-5, 5] }, { bob: 1, ff: [2, 4], bf: [-3, 3], fh: [5, 5], bh: [-5, 6], sway: 0.5 }, { bob: 1, ff: [2, 4], bf: [-3, 3], fh: [5, 5], bh: [-5, 6], sway: 1 }, { ff: [2, 3], bf: [-3, 2], fh: [5, 4], bh: [-5, 5], sway: 0.5 }], 5, -1],
    dive: [[{ lean: 1, ff: [1, 0], bf: [-1, 1], fh: [3, 10], bh: [0, 10], sway: 2 }], 1, 0],
    rush: [[{ lean: 5, crouch: 2, ff: [6, 1], bf: [-7, 1], fh: [11, 3], bh: [8, 5], sway: -2 }], 1, 0],
  };
}

// ---------------------------------------------------------------------------
// Creatures
// ---------------------------------------------------------------------------
function drawHollowFlyer(pen, f) {
  const B = '#15131b', B2 = '#2c2636', W_ = '#efeae0', WS = '#bdb6aa', R = '#ff2a3a', Mem = '#3c2a44';
  const wing = [-62, -28, 22, -8][f], wing2 = wing + 12;
  const shoulder = [13, 10];
  const wingAt = (deg, len) => [shoulder[0] + Math.cos(deg * Math.PI / 180) * len * -0.55, shoulder[1] + Math.sin(deg * Math.PI / 180) * len];
  // back wing
  const t2 = wingAt(wing2, 10);
  pen.poly([shoulder, t2, [t2[0] - 2, t2[1] + 3], [8, 13]], '#241c2c');
  pen.line(shoulder[0], shoulder[1], t2[0], t2[1], WS);
  // tail
  pen.line(8, 13, 4, 15, B); pen.line(4, 15, 2, 13, B); pen.px(1, 12, B2);
  // body
  pen.ellipse(13, 12.5, 6.5, 4.5, B);
  pen.line(9, 10, 15, 9, B2);
  // claws
  const leg = f % 2;
  pen.line(11, 16, 10, 18 + leg, B); pen.line(15, 16, 15, 18 + (1 - leg), B);
  pen.px(9, 19 + leg, WS); pen.px(16, 19 + (1 - leg), WS);
  // bird-skull mask: angular brow, hooked beak, jagged teeth, swept-back horn
  pen.poly([[15, 8], [21, 6.5], [25, 9], [27, 12], [24, 12.5], [22, 15], [16, 14]], W_);
  pen.poly([[24, 12], [27, 12], [25, 15]], WS);
  pen.line(16, 13, 22, 13, B);
  for (let x = 17; x <= 22; x += 2) { pen.px(x, 12, W_); pen.px(x + 1, 14, W_); }
  pen.limb(17, 8, 13, 4, 2, 1, W_); pen.px(12, 3, W_);
  pen.line(18, 9, 20, 10, B); pen.px(19, 10, R); pen.px(20, 10, R);
  pen.line(21, 9, 22, 10, B); pen.px(22, 10, R);
  pen.line(16, 11, 18, 11, WS);
  // chest hole
  pen.erase(11, 12); pen.erase(12, 12); pen.erase(11, 13); pen.erase(12, 13);
  // front wing with membrane
  const t1 = wingAt(wing, 13);
  pen.poly([shoulder, t1, [t1[0] - 1, t1[1] + 4], [9, 12]], Mem);
  pen.line(shoulder[0], shoulder[1], t1[0], t1[1], W_);
  pen.px(t1[0], t1[1], W_);
}

function drawAdjuchas(pen, f, mode) {
  const B = '#1a1622', Hi = '#2e283a', Dk = '#0f0c14', W_ = '#efeae0', WS = '#c4bdb0', R = '#ff3a2a';
  const crouch = mode === 'windup' ? 3 : 0;
  const breath = mode === 'idle' ? f % 2 : 0;
  const by = 12 + crouch + breath;
  const ph = f / 6 * Math.PI * 2;
  // tail
  pen.limb(8, by - 1, 2, by - 5 + Math.sin(ph) * 2, 3, 1.5, B);
  pen.px(1, by - 6 + Math.sin(ph) * 2, Hi);
  // legs: [hipX, phase offset]
  [[11, 0, Dk], [24, Math.PI, Dk], [13, Math.PI, B], [26, 0, B]].forEach(([x, off, col]) => {
    const moving = mode === 'run';
    const dx = moving ? Math.cos(ph + off) * 3 : 0, lift = moving ? Math.max(0, Math.sin(ph + off)) * 2.5 : 0;
    pen.limb(x, by + 2, x + dx * 0.6, by + 7 - lift * 0.5, 3.5, 3, col);
    pen.limb(x + dx * 0.6, by + 7 - lift * 0.5, x + dx, 23 - lift, 3, 2, col);
    pen.rect(x + dx - 1, 23 - lift, 3, 1, WS);
  });
  // body and spine plates
  pen.ellipse(19, by, 12, 5.5, B);
  pen.line(9, by - 3, 27, by - 4, Hi);
  for (let i = 0; i < 5; i++) pen.poly([[8 + i * 4, by - 4], [10 + i * 4, by - 9 - (i % 2) - breath], [12 + i * 4, by - 4]], i % 2 ? W_ : WS);
  // mask: long snout with jaw
  const jaw = mode === 'windup' ? 2 : 0;
  pen.poly([[26, by - 6], [38, by - 1 + crouch * 0.4], [36, by + 3], [26, by + 2]], W_);
  pen.poly([[27, by + 2], [35, by + 3 + jaw], [28, by + 5 + jaw]], WS);
  pen.line(27, by + 2, 35, by + 2 + jaw, Dk);
  for (let x = 28; x <= 34; x += 2) pen.px(x, by + 3 + jaw * 0.5, W_);
  pen.px(29, by - 3, R); pen.px(30, by - 3, R);
  if (mode === 'windup') { pen.px(31, by - 3, '#ffd04a'); pen.under(28, by - 4, '#ff3a2a60'); pen.under(29, by - 5, '#ff3a2a40'); }
  pen.line(26, by - 6, 30, by - 9, W_);
  // hole
  pen.erase(15, by); pen.erase(16, by); pen.erase(15, by + 1); pen.erase(16, by + 1);
}

function drawMenos(pen, mode, f) {
  const B = '#121018', Hi = '#26222f', W_ = '#efe9df', Sh = '#c8c0b4', R = '#ff2a3a';
  const crouch = mode === 'crouch' ? 6 : 0;
  const sway = mode === 'idle' ? [-1, 0, 1, 0][f] : 0;
  const breathe = mode === 'idle' ? [0, 1, 0, -1][f] : 0;
  const top = 18 + crouch + breathe;
  pen.poly([[40, top], [72 + sway, 120], [8 + sway, 120]], B);
  pen.line(40, top + 2, 68 + sway, 118, Hi);
  pen.line(36, top + 30, 20 + sway, 116, Hi);
  for (let x = 10; x < 72; x += 6) pen.poly([[x + sway, 120], [x + 3 + sway, 112 + ((x / 6 + f) % 2 ? 2 : 0)], [x + 6 + sway, 120]], '#07060b');
  pen.ellipse(40, top + 6, 16, 20, B);
  for (let i = 0; i < 7; i++) { const x = 16 + i * 7; pen.poly([[x, top + 32], [x + 3.5, top + 20 - (i % 2) * 3], [x + 7, top + 32]], W_); }
  pen.rect(16, top + 30, 49, 4, W_);
  pen.line(16, top + 33, 64, top + 33, Sh);
  pen.ellipse(44, top + 4, 12, 13, W_);
  pen.poly([[50, top], [79, top + 9], [50, top + 13]], W_);
  pen.line(50, top + 12, 78, top + 9, Sh);
  pen.line(38, top - 6, 44, top - 8, Sh);
  pen.rect(42, top - 3, 4, 4, R); pen.rect(49, top - 3, 3, 4, R);
  pen.px(43, top - 2, '#ffb0b8');
  if (mode === 'cero') {
    pen.poly([[38, top + 11], [52, top + 11], [50, top + 18], [40, top + 18]], '#3a0a12');
    pen.ellipse(77, top + 9, 3.5, 3.5, '#ff8aa0'); pen.ellipse(77, top + 9, 1.5, 1.5, '#ffffff');
    for (let a = 0; a < 6; a++) pen.under(77 + Math.cos(a) * 6, top + 9 + Math.sin(a) * 6, '#ff4a7060');
  } else {
    pen.rect(36, top + 12, 14, 2, B);
    for (let i = 0; i < 4; i++) pen.px(37 + i * 3, top + 11, W_);
  }
  for (let y = top + 47; y <= top + 61; y++) for (let x = 33; x <= 47; x++) if (Math.hypot(x + 0.5 - 40, y + 0.5 - (top + 54)) < 6.5) pen.erase(x, y);
  pen.rect(13 + sway, 92 + crouch, 6, 4, W_); pen.rect(61 + sway, 92 + crouch, 6, 4, W_);
  pen.px(13 + sway, 96 + crouch, W_); pen.px(18 + sway, 96 + crouch, W_); pen.px(61 + sway, 96 + crouch, W_); pen.px(66 + sway, 96 + crouch, W_);
}

// Hell butterfly (black with red veins), used for souls crossing over and on the title screen
function drawButterfly(pen, f) {
  const B = '#0a0a10', R = '#b4303a';
  const open = [1, 0.5, 0.15, 0.5][f];
  const wx = 4 * open + 0.8;
  pen.poly([[6, 5], [6 - wx, 1], [6 - wx * 1.1, 6], [6, 6]], B);
  pen.poly([[6, 5], [6 + wx, 1], [6 + wx * 1.1, 6], [6, 6]], B);
  pen.poly([[6, 6], [6 - wx * 0.8, 9], [6, 8]], B);
  pen.poly([[6, 6], [6 + wx * 0.8, 9], [6, 8]], B);
  if (open > 0.4) { pen.px(6 - wx * 0.6, 3, R); pen.px(6 + wx * 0.6, 3, R); }
  pen.line(6, 3, 6, 9, '#1c1c26');
}

// ---------------------------------------------------------------------------
// Sheet building
// ---------------------------------------------------------------------------
function buildSheet(scene, key, fw, fh, frames, outline = '#08070c', alpha = 1) {
  const cols = Math.min(10, frames.length), rows = Math.ceil(frames.length / cols);
  const pen = new Pen(cols * fw, rows * fh);
  frames.forEach((fr, i) => {
    pen.setFrame((i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
    fr.draw(pen);
    if (outline) pen.outline(outline);
    if (alpha < 1) pen.fade(alpha);
  });
  pen.setFrame(0, 0, pen.w, pen.h);
  const tex = canvasTex(scene, key, pen.w, pen.h, (ctx) => ctx.putImageData(pen.img, 0, 0));
  frames.forEach((fr, i) => tex.add(fr.name, 0, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh));
  return tex;
}

function makeAnim(scene, key, sheet, names, frameRate, repeat) {
  if (scene.anims.exists(key)) scene.anims.remove(key);
  scene.anims.create({ key, frames: names.map(n => ({ key: sheet, frame: n })), frameRate, repeat });
}

function makeCharacterArt(scene) {
  // Humanoids
  Object.keys(STYLES).forEach(skey => {
    const st = STYLES[skey];
    const anims = humanoidAnims(st);
    const frames = [];
    Object.entries(anims).forEach(([name, [poses]]) => {
      poses.forEach((p, i) => frames.push({ name: name + i, draw: (pen) => drawHumanoid(pen, st, Object.assign({}, BASE_POSE, p)) }));
    });
    buildSheet(scene, skey, HF.W, HF.H, frames, '#08070c', st.alpha || 1);
    Object.entries(anims).forEach(([name, [poses, rate, repeat]]) => {
      makeAnim(scene, skey + ':' + name, skey, poses.map((_, i) => name + i), rate, repeat);
    });
  });

  // Lesser hollow (28x22, flying)
  buildSheet(scene, 'hollow', 28, 22, [0, 1, 2, 3].map(f => ({ name: 'fly' + f, draw: (pen) => drawHollowFlyer(pen, f) })));
  makeAnim(scene, 'hollow:fly', 'hollow', ['fly0', 'fly1', 'fly2', 'fly3'], 12, -1);

  // Adjuchas (40x26, feet on the bottom row)
  const adj = [];
  for (let f = 0; f < 6; f++) adj.push({ name: 'run' + f, draw: (pen) => drawAdjuchas(pen, f, 'run') });
  for (let f = 0; f < 2; f++) adj.push({ name: 'idle' + f, draw: (pen) => drawAdjuchas(pen, f, 'idle') });
  adj.push({ name: 'windup0', draw: (pen) => drawAdjuchas(pen, 0, 'windup') });
  buildSheet(scene, 'adjuchas', 40, 26, adj);
  makeAnim(scene, 'adjuchas:run', 'adjuchas', [0, 1, 2, 3, 4, 5].map(i => 'run' + i), 12, -1);
  makeAnim(scene, 'adjuchas:idle', 'adjuchas', ['idle0', 'idle1'], 3, -1);
  makeAnim(scene, 'adjuchas:windup', 'adjuchas', ['windup0'], 1, 0);

  // Menos Grande (80x120)
  buildSheet(scene, 'menos', 80, 120, [
    ...[0, 1, 2, 3].map(f => ({ name: 'idle' + f, draw: (pen) => drawMenos(pen, 'idle', f) })),
    { name: 'crouch0', draw: (pen) => drawMenos(pen, 'crouch', 0) },
    { name: 'cero0', draw: (pen) => drawMenos(pen, 'cero', 0) },
  ]);
  makeAnim(scene, 'menos:idle', 'menos', ['idle0', 'idle1', 'idle2', 'idle3'], 3, -1);
  makeAnim(scene, 'menos:crouch', 'menos', ['crouch0'], 1, 0);
  makeAnim(scene, 'menos:cero', 'menos', ['cero0'], 1, 0);

  // Hell butterfly (12x10)
  buildSheet(scene, 'hellfly', 12, 10, [0, 1, 2, 3].map(f => ({ name: 'f' + f, draw: (pen) => drawButterfly(pen, f) })), null);
  makeAnim(scene, 'hellfly:flap', 'hellfly', ['f0', 'f1', 'f2', 'f1'], 10, -1);
}

// NPC name -> sprite style
const NPC_STYLES = {
  'Wandering Plus': 'npc_plus', 'Shop Clerk on Break': 'npc_clerk', 'Old Rukongai Resident': 'npc_old',
  'Faded Spirit': 'npc_faded', 'Masked Wanderer': 'npc_masked',
  'Lost Shinigami': 'npc_lostshini', 'Hiding Spirit': 'npc_hiding',
};
