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
  // Rotate everything in the frame about (cx, cy); deg > 0 turns clockwise on screen.
  // Nearest-neighbour from the destination side, so no holes open up in the sprite.
  rotate(deg, cx, cy) {
    const th = deg * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th), fw = this.fw, fh = this.fh, W = this.w, d = this.data;
    const src = new Uint32Array(fw * fh);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) src[y * fw + x] = d[(this.oy + y) * W + this.ox + x];
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const sx = Math.floor(cx + dx * c + dy * sn), sy = Math.floor(cy - dx * sn + dy * c);
      d[(this.oy + y) * W + this.ox + x] = (sx >= 0 && sy >= 0 && sx < fw && sy < fh) ? src[sy * fw + sx] : 0;
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
const BOSS_ANIMS = ['idle', 'run', 'jump', 'fall', 'dash', 'cast', 'guardIdle', 'windup', 'strike', 'hurt', 'land', 'charge', 'raise'];
const NPC_ANIMS = ['idle'];

const STYLE_ICHIGO = {
  skin: '#f2c49b', skinShade: '#c98d62', eye: '#2a1810', brow: '#b4561a',
  hair: '#f0882a', hairHi: '#ffc26a', hairShade: '#b0520f', hairStyle: 'spiky',
  robe: '#1b1a23', robeHi: '#3a3846', robeShade: '#0c0b11', inner: '#ece7dc', sash: '#ece7dc',
  hakama: '#18171f', hakamaShade: '#0d0c12', hakamaHi: '#33313d', tabi: '#efebe2', sandal: '#7a5a36',
  strap: '#c23a3a', legLen: 8, torsoLen: 9, weapon: CLEAVER, carry: 'back', anims: ALL_ANIMS,
};
const MASK_HOLLOW = { base: '#f6f3ec', shade: '#cfcabe', stripe: '#c8202c', eye: '#f2c230' };

function variant(base, over) { return Object.assign({}, base, over); }

// The black robes of the Gotei 13 (shihakushō), shared by most Shinigami
const SHIHAKUSHO = {
  robe: '#1b1a23', robeHi: '#3a3846', robeShade: '#0c0b11', inner: '#ece7dc', sash: '#ece7dc',
  hakama: '#18171f', hakamaShade: '#0d0c12', hakamaHi: '#33313d', tabi: '#efebe2', sandal: '#5a4630',
};
const ARRANCAR_WHITE = {
  robe: '#ece8f1', robeHi: '#ffffff', robeShade: '#a9a5b8', inner: '#16141c', sash: '#16141c',
  hakama: '#e3dfe9', hakamaShade: '#a8a4b6', hakamaHi: '#ffffff', tabi: '#16141c', sandal: '#16141c',
};

const SOUL = {   // shared palette for wandering souls
  skin: '#ecdccb', skinShade: '#b9a28c', eye: '#3a3040', brow: '#6a5040',
  hair: '#6a5040', hairHi: '#8a6a54', hairShade: '#4a3830', hairStyle: 'short',
  robe: '#dfe6f1', robeHi: '#ffffff', robeShade: '#a9b6c8', inner: '#b8c6da', sash: '#7a8aa4',
  hakama: '#d3dbe8', hakamaShade: '#a3afc2', hakamaHi: '#f4f8ff', tabi: '#e8eaee', sandal: '#7a6a58',
  chain: '#8f8f9e', legLen: 8, torsoLen: 9, carry: 'none', weapon: { type: 'none' }, anims: NPC_ANIMS, alpha: 0.88,
};

const STYLES = {
  ichigo: STYLE_ICHIGO,
  ichigo_m: variant(STYLE_ICHIGO, { mask: MASK_HOLLOW }),
  ichigo_b: variant(STYLE_ICHIGO, { strap: null, carry: 'hand', weapon: TENSA, coat: { col: '#0d0c12', hi: '#2c2a36', lining: '#b4303a' }, robe: '#121118', sash: '#121118', inner: '#b4303a' }),
  // The Hollow inside: a white mirror of Ichigo with black eyes and a black blade
  final: variant(STYLE_ICHIGO, {
    skin: '#e8e8ef', skinShade: '#a9a9b8', eye: '#f2c230', sclera: '#0a0a0e', brow: '#c8c8d4',
    hair: '#f4f4f8', hairHi: '#ffffff', hairShade: '#a8a8bc', robe: '#ebeaf1', robeHi: '#ffffff', robeShade: '#a9a7ba',
    inner: '#15141b', sash: '#15141b', hakama: '#e3e1ea', hakamaShade: '#a8a6b8', hakamaHi: '#ffffff', tabi: '#15141b', sandal: '#3a3a48',
    strap: '#15141b', legLen: 9, torsoLen: 10, anims: BOSS_ANIMS, carry: 'hand',
    weapon: variant(CLEAVER, { blade: '#1d1b25', edge: '#6a6878', spine: '#0a0a10', hilt: '#15141b', hiltShade: '#3a3846', cloth: '#15141b', smear: '#30304060', backBlade: { blade: '#26242e', edge: '#55536a', spine: '#0a0a10' } }),
  }),
  shini: {
    skin: '#c8a88a', skinShade: '#94765c', eye: '#ff3040', brow: '#2a2633',
    hair: '#2a2633', hairHi: '#4a4458', hairShade: '#16141c', hairStyle: 'short',
    robe: '#2b2238', robeHi: '#4c3e60', robeShade: '#18121f', inner: '#9a93a8', sash: '#6b2b8a',
    hakama: '#241c30', hakamaShade: '#140f1c', hakamaHi: '#3c3050', tabi: '#c8c2b8', sandal: '#3a2a20',
    armband: '#e8e4d8', legLen: 8, torsoLen: 9, carry: 'hand', anims: ENEMY_ANIMS,
    weapon: { type: 'katana', blade: '#b4bac4', edge: '#e8ecf0', guard: '#6a6a7a', hilt: '#3a2a3a', hiltShade: '#5a4a5a', len: 14, smear: '#c8a8ff50' },
  },
  arrancar: Object.assign({
    skin: '#dccdbd', skinShade: '#a8988a', eye: '#40e0ff', brow: '#2e2e3a',
    hair: '#2e2e3a', hairHi: '#4e4e5e', hairShade: '#18181f', hairStyle: 'short',
    jawMask: '#f6f4ee', hole: true, legLen: 8, torsoLen: 9, carry: 'none', weapon: { type: 'none' }, anims: ['idle', 'run', 'cast', 'hurt'],
  }, ARRANCAR_WHITE),
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

  // ---- NPCs ----
  npc_plus: variant(SOUL, {}),
  npc_lost: variant(SOUL, { hair: '#4a3a30', alpha: 0.8, chainBroken: true, basePose: { crouch: 3, lean: 1, fh: [4, 10], bh: [2, 11], ff: [3, 0], bf: [-3, 0], tilt: 1 } }),
  npc_old: {
    skin: '#d6ad8c', skinShade: '#a07a5c', eye: '#2a2018', brow: '#e8e4dc', beard: '#ece8e0',
    hair: '#6a5e50', hairHi: '#8a7c6a', hairShade: '#4a4036', hairStyle: 'hood',
    robe: '#6a5e50', robeHi: '#8a7c6a', robeShade: '#4a4036', inner: '#a89a84', sash: '#a89a84',
    hakama: '#544a3e', hakamaShade: '#3a3229', hakamaHi: '#6e6252', tabi: '#c8c0b0', sandal: '#4a3826',
    legLen: 7, torsoLen: 7, carry: 'hand', anims: NPC_ANIMS,
    weapon: { type: 'cane', col: '#7a5a3a', hi: '#a07a50' },
    basePose: { crouch: 1, lean: 1, fh: [5, 8], weapon: { mode: 'hand', angle: 88 } },
  },
  // Ururu Tsumugiya of the Urahara Shop: twin tails and an apron
  npc_clerk: {
    skin: '#efc8a0', skinShade: '#c09470', eye: '#2a2028', brow: '#2a2230',
    hair: '#2a2230', hairHi: '#4a3e52', hairShade: '#16121c', hairStyle: 'pigtails',
    robe: '#c8a0b8', robeHi: '#e4c4d6', robeShade: '#8e6a80', inner: '#e8e4d8', sash: '#e8e4d8',
    hakama: '#3a4a6a', hakamaShade: '#26324a', hakamaHi: '#566a90', tabi: '#e8e4d8', sandal: '#5a4630',
    apron: '#e8e4d8', legLen: 7, torsoLen: 8, carry: 'none', weapon: { type: 'none' }, anims: NPC_ANIMS,
  },
  // Kisuke Urahara: striped bucket hat, dark green haori, a cane that is really a sword
  npc_merchant: {
    skin: '#ecc59e', skinShade: '#b88e68', eye: '#2a2018', brow: '#c8a850',
    hair: '#d8c070', hairHi: '#f0dc94', hairShade: '#a88e48', hairStyle: 'buckethat', hat: '#ecebe2', hatStripe: '#3a6a44',
    robe: '#16151c', robeHi: '#2e2c38', robeShade: '#0b0a10', inner: '#16151c', sash: '#16151c',
    hakama: '#1e2420', hakamaShade: '#121612', hakamaHi: '#2e3630', tabi: '#e8e4dc', sandal: '#5a4630',
    haori: { col: '#34453a', shade: '#24302a', hem: '#e8e4dc' }, legLen: 9, torsoLen: 9, carry: 'hand', anims: NPC_ANIMS,
    weapon: { type: 'cane', col: '#6a4a2a', hi: '#8a6a40' },
    basePose: { fh: [5, 8], bh: [1, 5], weapon: { mode: 'hand', angle: 88 } },
  },
  // Shinji Hirako of the Vizards: a straight blond bob and a Hollow mask pushed to the side
  npc_masked: {
    skin: '#ecc8a6', skinShade: '#b8906c', eye: '#2a2018', brow: '#b89a40',
    hair: '#e8cc6a', hairHi: '#fff0a0', hairShade: '#a8882c', hairStyle: 'bob', sideMask: '#f6f3ec',
    robe: '#1f1d26', robeHi: '#3a3846', robeShade: '#0e0d12', inner: '#e8e4d8', sash: '#7a1a24',
    hakama: '#26242e', hakamaShade: '#16141c', hakamaHi: '#3a3846', tabi: '#16141c', sandal: '#16141c',
    legLen: 9, torsoLen: 9, carry: 'none', weapon: { type: 'none' }, anims: NPC_ANIMS,
    basePose: { fh: [3, 6], bh: [-1, 6] },
  },
};
Object.assign(STYLES, {
  npc_smith: {
    skin: '#d8a880', skinShade: '#a87a58', eye: '#2a2018', brow: '#6a6a72', beard: '#9a9aa4',
    hair: '#8a8a94', hairHi: '#b8b8c2', hairShade: '#5a5a64', hairStyle: 'short', headband: '#e8e4d8',
    robe: '#3a2e26', robeHi: '#5a4a3e', robeShade: '#221a14', inner: '#d8d0c0', sash: '#a83030', apron: '#6a4a2e',
    hakama: '#2e2620', hakamaShade: '#1a1410', hakamaHi: '#46382e', tabi: '#d8d0c0', sandal: '#3a2a1a',
    legLen: 8, torsoLen: 9, carry: 'hand', anims: NPC_ANIMS,
    weapon: { type: 'hammer', col: '#6a4a2a', head: '#5a5a66', hi: '#9a9aa6', len: 8 },
    basePose: { fh: [5, 6], weapon: { mode: 'hand', angle: 95 } },
  },
  // Rukia Kuchiki: the Shinigami who gave you her power
  npc_rukia: Object.assign({
    skin: '#f0d0b4', skinShade: '#c09a7e', eye: '#4a3a6a', brow: '#16141c',
    hair: '#16141c', hairHi: '#34304a', hairShade: '#08070c', hairStyle: 'rukia',
    legLen: 7, torsoLen: 8, carry: 'hand', anims: NPC_ANIMS,
    weapon: { type: 'katana', blade: '#f4f8ff', edge: '#ffffff', guard: '#c8d8e8', hilt: '#e8eef4', hiltShade: '#b8c4d0', len: 13, smear: '#e0f0ff60' },
    basePose: { fh: [4, 7], weapon: { mode: 'hand', angle: 100 } },
  }, SHIHAKUSHO),
  // Yasutora Sado: tall, quiet, the right arm armoured
  npc_chad: {
    skin: '#a87452', skinShade: '#7a5036', eye: '#1a1410', brow: '#2a1c14',
    hair: '#3a2618', hairHi: '#5a3a26', hairShade: '#22160e', hairStyle: 'curly',
    robe: '#8a3a3a', robeHi: '#b45a50', robeShade: '#5a2424', inner: '#e8c870', sash: '#3a3040',
    hakama: '#3a3a48', hakamaShade: '#24242e', hakamaHi: '#54546a', tabi: '#2a2430', sandal: '#2a2430',
    armGuard: '#1a1820', legLen: 10, torsoLen: 11, carry: 'none', weapon: { type: 'none' }, anims: NPC_ANIMS,
    basePose: { fh: [4, 9], bh: [-3, 9] },
  },
  // Orihime Inoue, held in Las Noches: long auburn hair with the blue Shun Shun Rikka pins
  npc_orihime: Object.assign({
    skin: '#f4d6be', skinShade: '#c8a28a', eye: '#5a3a2a', brow: '#b4602e',
    hair: '#d8783a', hairHi: '#f4a46a', hairShade: '#a04e20', hairStyle: 'longflow', hairpin: '#7ab4ff',
    legLen: 8, torsoLen: 8, carry: 'none', weapon: { type: 'none' }, anims: NPC_ANIMS,
    basePose: { fh: [3, 5], bh: [1, 5] },
  }, ARRANCAR_WHITE),
  // Ganju Shiba of the Shiba clan: a bandana, a scowl and fireworks
  npc_ganju: {
    skin: '#d8a478', skinShade: '#a8764e', eye: '#1a1410', brow: '#2a1c14',
    hair: '#2a1c14', hairHi: '#4a3424', hairShade: '#140e0a', hairStyle: 'bandana', bandana: '#c84a3a',
    robe: '#8a6a3a', robeHi: '#b08a54', robeShade: '#5a4224', inner: '#e8dcc0', sash: '#c84a3a',
    hakama: '#5a4a34', hakamaShade: '#3a2e20', hakamaHi: '#7a6648', tabi: '#d8d0c0', sandal: '#3a2a1a',
    legLen: 8, torsoLen: 10, carry: 'none', weapon: { type: 'none' }, anims: NPC_ANIMS,
    basePose: { fh: [5, 4], bh: [2, 5], lean: 1 },
  },
  // Jidanbō Ikkanzaka, the giant who keeps the White Way Gate (drawn small, shown huge)
  npc_jidanbo: {
    skin: '#c8946a', skinShade: '#94683e', eye: '#1a1410', brow: '#2a1c14', beard: '#2a1c14',
    hair: '#2a1c14', hairHi: '#4a3424', hairShade: '#140e0a', hairStyle: 'topknot',
    robe: '#3a3a4a', robeHi: '#5a5a6e', robeShade: '#24242e', inner: '#e8e4d8', sash: '#a83030',
    hakama: '#2e2e3a', hakamaShade: '#1a1a24', hakamaHi: '#46465a', tabi: '#d8d0c0', sandal: '#3a2a1a',
    legLen: 8, torsoLen: 10, carry: 'none', weapon: { type: 'none' }, anims: NPC_ANIMS,
    basePose: { fh: [4, 9], bh: [-3, 9] },
  },
  // Hanatarō Yamada of the Fourth Division, with the relief pack he never puts down
  npc_hanataro: Object.assign({
    skin: '#f0d0b4', skinShade: '#c09a7e', eye: '#2a2a40', brow: '#16141c',
    hair: '#24202c', hairHi: '#443e52', hairShade: '#100e16', hairStyle: 'short', pack: '#7a6a50',
    legLen: 7, torsoLen: 8, carry: 'none', weapon: { type: 'none' }, anims: NPC_ANIMS,
    basePose: { fh: [3, 6], bh: [1, 7], tilt: 1 },
  }, SHIHAKUSHO, { sash: '#ece7dc', armband: '#7aa8d8' }),
  // Uryū Ishida, the last Quincy: white uniform, blue cross, glasses
  npc_uryu: {
    skin: '#f0d6c0', skinShade: '#c0a08a', eye: '#2a2a40', brow: '#16141c', glasses: '#c8d8f0',
    hair: '#1a1a26', hairHi: '#3a3a52', hairShade: '#0a0a12', hairStyle: 'rukia',
    robe: '#f4f6fa', robeHi: '#ffffff', robeShade: '#b8c0d0', inner: '#4a7ad8', sash: '#4a7ad8',
    hakama: '#eef0f6', hakamaShade: '#b0b8c8', hakamaHi: '#ffffff', tabi: '#1a1a26', sandal: '#1a1a26',
    legLen: 9, torsoLen: 9, carry: 'none', weapon: { type: 'none' }, anims: NPC_ANIMS,
    basePose: { fh: [4, 3], bh: [-2, 7] },
  },
  // Nel Tu, a small Hollow child with a cracked skull on her head
  npc_nel: {
    skin: '#e8d4c4', skinShade: '#b8a090', eye: '#3a2a3a', brow: '#3a7a5a',
    hair: '#4aa07a', hairHi: '#7ad0a4', hairShade: '#2a6a4a', hairStyle: 'nel',
    robe: '#5a8a6a', robeHi: '#7aaa8a', robeShade: '#3a5a4a', inner: '#e8e4d8', sash: '#3a5a4a',
    hakama: '#5a8a6a', hakamaShade: '#3a5a4a', hakamaHi: '#7aaa8a', tabi: '#e8d4c4', sandal: '#e8d4c4',
    legLen: 5, torsoLen: 6, carry: 'none', weapon: { type: 'none' }, anims: NPC_ANIMS,
    basePose: { fh: [3, 4], bh: [-2, 5], tilt: 1 },
  },
  // Old man Zangetsu: the spirit of the blade, in a long black coat and dark glasses
  npc_zangetsu: {
    skin: '#d8b8a0', skinShade: '#a88a72', eye: '#0a0a10', brow: '#16141c', glasses: '#2a2a36', beard: '#3a3440',
    hair: '#24202c', hairHi: '#3e384a', hairShade: '#100e16', hairStyle: 'wavy',
    robe: '#14131a', robeHi: '#2c2a36', robeShade: '#08070c', inner: '#3a3846', sash: '#14131a',
    hakama: '#14131a', hakamaShade: '#08070c', hakamaHi: '#2c2a36', tabi: '#14131a', sandal: '#14131a',
    coat: { col: '#121118', hi: '#2c2a36', lining: '#3a3846' }, legLen: 10, torsoLen: 10, carry: 'none', weapon: { type: 'none' }, anims: NPC_ANIMS, alpha: 0.92,
    basePose: { fh: [1, 7], bh: [-4, 7], coatSway: 1 },
  },
  // Ashido Kanō, the Shinigami who has lived in the Forest of Menos for years, wrapped in Hollow bone
  npc_ashido: Object.assign({
    skin: '#d8b090', skinShade: '#a88262', eye: '#2a1810', brow: '#8a2a20',
    hair: '#a8382a', hairHi: '#d05a40', hairShade: '#701e16', hairStyle: 'long', fur: '#d8d0c0',
    legLen: 9, torsoLen: 9, carry: 'hand', anims: NPC_ANIMS,
    weapon: { type: 'katana', blade: '#b4bac4', edge: '#e8ecf0', guard: '#6a6a7a', hilt: '#3a2a3a', hiltShade: '#5a4a5a', len: 14 },
    basePose: { fh: [3, 8], weapon: { mode: 'hand', angle: 95 } },
  }, SHIHAKUSHO, { robe: '#2a2620', robeShade: '#16120e' }),
  // Isshin's old acquaintance on the riverbank: a wandering soul who used to fish here
  npc_fisher: variant(SOUL, { hair: '#8a8a94', hairStyle: 'hood', robe: '#cfd8e8', basePose: { crouch: 1, fh: [5, 6], bh: [2, 7] } }),
});

// ---- Bosses ----
Object.assign(STYLES, {
  // Renji Abarai, Lieutenant of the Sixth Division: red ponytail, tattooed brows, Zabimaru
  renji: Object.assign({
    skin: '#e8b892', skinShade: '#b8885e', eye: '#2a1810', brow: '#16141c', tattoo: '#16141c',
    hair: '#c8202c', hairHi: '#f05a50', hairShade: '#8a1018', hairStyle: 'ponytail', headband: '#ece7dc',
    armband: '#ece7dc', legLen: 10, torsoLen: 10, carry: 'hand', anims: BOSS_ANIMS,
    weapon: { type: 'zabimaru', blade: '#c9d0d8', edge: '#ffffff', guard: '#6a6a7a', hilt: '#3a2028', hiltShade: '#6a3a44', len: 17, smear: '#ffb0a060' },
  }, SHIHAKUSHO),
  // Byakuya Kuchiki, Captain of the Sixth Division: kenseikan, the silver-white scarf, Senbonzakura
  byakuya: Object.assign({
    skin: '#f0dcc8', skinShade: '#c0a892', eye: '#3a3a52', brow: '#16141c',
    hair: '#16141c', hairHi: '#34304a', hairShade: '#08070c', hairStyle: 'kenseikan', scarf: '#d8e2e8',
    haori: { col: '#f1f0ea', shade: '#c4c2ba', hem: '#22222c' }, legLen: 10, torsoLen: 10, carry: 'hand', anims: BOSS_ANIMS,
    weapon: { type: 'katana', blade: '#d8dce4', edge: '#ffffff', guard: '#c9a227', hilt: '#3a2a52', hiltShade: '#5a4a72', len: 15, smear: '#ffc0d860' },
  }, SHIHAKUSHO),
  // Kenpachi Zaraki, Captain of the Eleventh Division: bells in his hair, an eyepatch, a ruined blade
  kenpachi: Object.assign({
    skin: '#d8a882', skinShade: '#a87a56', eye: '#2a1810', brow: '#16141c', eyepatch: '#0a0a10', scar: '#8a4a3a',
    hair: '#1c1a24', hairHi: '#3a3648', hairShade: '#0c0b10', hairStyle: 'kenpachi',
    haori: { col: '#e8e4d8', shade: '#b8b4a8', hem: '#5a5050' }, legLen: 11, torsoLen: 11, carry: 'hand', anims: BOSS_ANIMS,
    weapon: { type: 'jagged', blade: '#a8b0b8', edge: '#d8dee4', guard: '#3a3a44', hilt: '#2a2a34', hiltShade: '#4a4a56', len: 18, smear: '#ffe08060' },
  }, SHIHAKUSHO),
  // Grimmjow Jaegerjaquez, Sexta Espada: blue hair, the jaw of his mask, an open jacket
  grimmjow: Object.assign({
    skin: '#e8c8a8', skinShade: '#b8987a', eye: '#3ac8e8', brow: '#3a8ab4',
    hair: '#58b8e8', hairHi: '#a8e4ff', hairShade: '#2a7ab0', hairStyle: 'grimmjow', jawMask: '#f6f4ee', open: true,
    hole: true, legLen: 10, torsoLen: 10, carry: 'hand', anims: BOSS_ANIMS,
    weapon: { type: 'katana', blade: '#c8ced8', edge: '#ffffff', guard: '#3a8ab4', hilt: '#2a3a4a', hiltShade: '#4a5a6a', len: 14, smear: '#80e0ff60' },
  }, ARRANCAR_WHITE, { hakama: '#ece8f1', inner: '#e8c8a8' }),
  // Ulquiorra Cifer, Cuarta Espada: green tear lines, the broken helmet, a long white coat
  ulquiorra: Object.assign({
    skin: '#f4f4f8', skinShade: '#c0c0d0', eye: '#3ae88a', brow: '#16141c', tears: '#2a8a5a',
    hair: '#16141c', hairHi: '#34304a', hairShade: '#08070c', hairStyle: 'short', helmet: '#f6f4ee',
    coat: { col: '#ecebf2', hi: '#ffffff', lining: '#16141c' }, hole: true, legLen: 10, torsoLen: 10, carry: 'none', anims: BOSS_ANIMS,
    weapon: { type: 'none' }, basePose: null,
  }, ARRANCAR_WHITE),
  // Aaroniero Arruruerie, Noveno Espada, wearing the face of Kaien Shiba and his trident Nejibana
  aaroniero: Object.assign({
    skin: '#e0c4a8', skinShade: '#b0947a', eye: '#c8f0ff', brow: '#16141c',
    hair: '#16141c', hairHi: '#34304a', hairShade: '#08070c', hairStyle: 'spiky',
    armband: '#ece7dc', legLen: 10, torsoLen: 10, carry: 'hand', anims: BOSS_ANIMS,
    weapon: { type: 'trident', shaft: '#4a3a5a', head: '#c8e8ff', hi: '#ffffff', water: '#4ab4ff', len: 24, smear: '#4ab4ff70' },
  }, SHIHAKUSHO),
});
STYLES.ichigo_bm = variant(STYLES.ichigo_b, { mask: MASK_HOLLOW });
STYLES.final_m = variant(STYLES.final, { mask: variant(MASK_HOLLOW, { stripe: '#c8202c' }) });
STYLES.final_b = variant(STYLES.final_m, {
  carry: 'hand', strap: null,
  weapon: variant(TENSA, { blade: '#f2f2f8', edge: '#8a8898', guard: '#d8d6e0', hilt: '#ecebf2', hiltShade: '#b8b6c4', chain: '#b8b8c4', smear: '#f0f0ff60' }),
  coat: { col: '#ecebf2', hi: '#ffffff', lining: '#15141b' },
});
// Renji's Bankai: Hihiō Zabimaru, with the baboon's mantle across his shoulders
STYLES.renji_b = variant(STYLES.renji, { fur: '#e8e0d0', robe: '#1b1a23', weapon: variant(STYLES.renji.weapon, { blade: '#f0e8d8', edge: '#ffffff', smear: '#ff806070' }) });
// Byakuya in Bankai: the blade is gone, scattered into a thousand petals
STYLES.byakuya_b = variant(STYLES.byakuya, { carry: 'none', weapon: { type: 'none' }, eye: '#ff90b8', haori: { col: '#f6eef2', shade: '#d8b8c8', hem: '#c84a7a' } });
// Kenpachi with the eyepatch off: his reiatsu burns yellow
STYLES.kenpachi_r = variant(STYLES.kenpachi, { eyepatch: null, eye: '#f2c230', haori: { col: '#d8d0b0', shade: '#a8a080', hem: '#f2c230' }, weapon: variant(STYLES.kenpachi.weapon, { smear: '#ffd04080', edge: '#fff0a0' }) });
// Pantera: long blue mane, white armour, claws
STYLES.grimmjow_r = variant(STYLES.grimmjow, {
  hairStyle: 'mane', mane: '#58b8e8', jawMask: null, claws: '#f6f4ee', open: false, carry: 'none', weapon: { type: 'none' },
  robe: '#f4f2f6', robeHi: '#ffffff', robeShade: '#b4b0c0', hakama: '#f0eef4', inner: '#3ac8e8', sash: '#3ac8e8',
  mask: { base: '#f6f3ec', shade: '#cfcabe', stripe: '#3ac8e8', eye: '#3ac8e8' },
});
// Murciélago: horns, black bat wings, green-black blood
STYLES.ulquiorra_r = variant(STYLES.ulquiorra, { batWings: '#16141c', claws: '#16141c', hairStyle: 'horns', hair: '#16141c', hairHi: '#34304a', hairShade: '#08070c', helmet: null, coat: { col: '#f2f0f6', hi: '#ffffff', lining: '#2a8a5a' } });
// Glotonería: the borrowed face slips, and the devoured Hollows show through
STYLES.aaroniero_r = variant(STYLES.aaroniero, {
  robe: '#3a2a4a', robeHi: '#5a4a6e', robeShade: '#1a1224', hakama: '#2a1e38', hakamaShade: '#140e1c', hakamaHi: '#44325a',
  claws: '#2a1e38', hairStyle: 'horns', hair: '#e8e4f0', hairHi: '#ffffff', hairShade: '#a8a4bc',
  mask: { base: '#e8e4dc', shade: '#b8b4a8', stripe: '#8a3ab4', eye: '#c8f0ff' },
  weapon: variant(STYLES.aaroniero.weapon, { shaft: '#2a1e38', head: '#b48aff', water: '#8a5ad8', smear: '#b48aff70' }),
});

// Kisuke Urahara with the cane drawn: the sword Benihime, the hat still on. In Shikai the hat falls away
// and the haori turns crimson.
STYLES.urahara = variant(STYLES.npc_merchant, { anims: BOSS_ANIMS, basePose: null, legLen: 10, torsoLen: 10,
  weapon: { type: 'katana', blade: '#d8d4dc', edge: '#ffffff', guard: '#c9a227', hilt: '#3a2a20', hiltShade: '#6a5a4a', len: 15, smear: '#ff708060' } });
STYLES.urahara_r = variant(STYLES.urahara, { hairStyle: 'short', eye: '#ff4060', haori: { col: '#6a1a2c', shade: '#3e0e1a', hem: '#e8e4dc' },
  weapon: variant(STYLES.urahara.weapon, { blade: '#ff6a7a', edge: '#ffe0e4', smear: '#ff304880' }) });
// The Hollow with nothing held back: red hair and a black coat
STYLES.final_k = variant(STYLES.final_b, { skin: '#f2dadf', hair: '#ff2a3c', hairHi: '#ff7080', hairShade: '#a01020', eye: '#ffe030',
  coat: { col: '#1a0f14', hi: '#4a1a24', lining: '#c8202c' },
  weapon: variant(STYLES.final_b.weapon, { blade: '#ff2a3c', edge: '#ffffff', smear: '#ff2a3c80' }) });

// ---- Enemies drawn on the rig ----
Object.assign(STYLES, {
  // Kidō master: a hooded Shinigami in deep blue with glowing eyes, hands free for casting
  caster: variant(STYLES.shini, {
    skin: '#bfa38c', skinShade: '#8e725c', eye: '#7fe8ff', brow: '#1c2438',
    hair: '#1c2438', hairHi: '#3a4868', hairShade: '#0e1220', hairStyle: 'hood',
    robe: '#1b2a46', robeHi: '#3a5280', robeShade: '#0e1626', inner: '#7fa8d8', sash: '#3aa0c8',
    hakama: '#16203a', hakamaShade: '#0c1224', hakamaHi: '#2e4268', armband: '#9ad8ff',
    carry: 'none', weapon: { type: 'none' }, anims: ['idle', 'run', 'cast', 'hurt'],
  }),
  // Onmitsukidō (the Stealth Force): black hood, a cloth over the face, a short blade
  onmitsu: Object.assign({
    skin: '#c8a88a', skinShade: '#94765c', eye: '#e8e4d8', brow: '#0c0b10', faceMask: '#16141c',
    hair: '#16141c', hairHi: '#2a2834', hairShade: '#08070c', hairStyle: 'hood',
    legLen: 8, torsoLen: 8, carry: 'hand', anims: ENEMY_ANIMS.concat(['dash']),
    weapon: { type: 'katana', blade: '#b4bac4', edge: '#e8ecf0', guard: '#2a2830', hilt: '#16141c', hiltShade: '#2a2834', len: 9, smear: '#e8ecf060' },
  }, SHIHAKUSHO, { robe: '#121118', robeHi: '#24222e', inner: '#24222e', sash: '#3a3846', hakama: '#121118', tabi: '#121118' }),
  // Exequias: the executioners of Las Noches, skull-faced under black hoods
  exequias: {
    skin: '#d8d0c0', skinShade: '#a8a090', eye: '#ff3040', brow: '#16141c', skull: '#ece8dc',
    hair: '#16141c', hairHi: '#2a2834', hairShade: '#08070c', hairStyle: 'hood',
    robe: '#1a1820', robeHi: '#34303e', robeShade: '#0c0b10', inner: '#ece8dc', sash: '#ece8dc',
    hakama: '#16141c', hakamaShade: '#0a090e', hakamaHi: '#2a2834', tabi: '#ece8dc', sandal: '#16141c',
    legLen: 9, torsoLen: 9, carry: 'hand', anims: ENEMY_ANIMS.concat(['dash']),
    weapon: { type: 'katana', blade: '#c8ced8', edge: '#ffffff', guard: '#ece8dc', hilt: '#16141c', hiltShade: '#34303e', len: 14, smear: '#ff304060' },
  },
  // A brawler of the Eleventh Division: shaved head, sleeves torn off, all forward
  brawler: Object.assign({
    skin: '#d8a882', skinShade: '#a87a56', eye: '#1a1410', brow: '#3a2a1e',
    hair: '#d8a882', hairHi: '#f0c8a0', hairShade: '#a87a56', hairStyle: 'bald', bareArms: true,
    armband: '#e8e4d8', legLen: 8, torsoLen: 10, carry: 'hand', anims: ENEMY_ANIMS,
    weapon: { type: 'katana', blade: '#a8b0b8', edge: '#d8dee4', guard: '#5a4a3a', hilt: '#3a2a20', hiltShade: '#5a4430', len: 14, smear: '#ffe0a050' },
  }, SHIHAKUSHO),
  // The bait on Grand Fisher's lure: a pale little girl who is not a girl at all
  lure: variant(SOUL, { skin: '#f4eef0', skinShade: '#c8bcc4', hair: '#e8e4f0', hairHi: '#ffffff', hairShade: '#b8b4c8', hairStyle: 'longflow', eye: '#ff3040', robe: '#e8e4ee', legLen: 6, torsoLen: 7, chain: null, anims: ['idle', 'run'], alpha: 0.92 }),
});

// Ganju, ready for his rematch: the same bandana, a club, and every clip a fighter needs
STYLES.ganju_f = variant(STYLES.npc_ganju, { anims: ENEMY_ANIMS, carry: 'hand', basePose: null,
  weapon: { type: 'club', col: '#8a5a3a', hi: '#b47a50', len: 12, smear: '#ffb07060' } });
// Ichibē Hyōsube of the Royal Guard: bald, a great black beard, dark robes and a string of prayer beads
STYLES.npc_ichibe = {
  skin: '#c89a74', skinShade: '#94704e', eye: '#1a1410', brow: '#16121a', beard: '#16121a',
  hair: '#c89a74', hairHi: '#e0b890', hairShade: '#94704e', hairStyle: 'bald',
  robe: '#1c1a22', robeHi: '#34303e', robeShade: '#0e0c12', inner: '#e8e2d2', sash: '#c89a3a',
  hakama: '#1c1a22', hakamaShade: '#0e0c12', hakamaHi: '#34303e', tabi: '#e8e2d2', sandal: '#3a2a1a',
  armband: '#c89a3a', legLen: 9, torsoLen: 11, carry: 'none', weapon: { type: 'none' }, anims: NPC_ANIMS,
  basePose: { fh: [4, 6], bh: [-2, 7], lean: -1 },
};

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
  } else if (w.type === 'katana' || w.type === 'jagged' || w.type === 'zabimaru') {
    const L = w.len + 2;
    pen.line(...at(2), ...at(L - 1), w.blade, 2);
    pen.line(...at(2, 1), ...at(L - 1, 1), w.edge);
    pen.px(...at(L), w.blade);
    if (w.type === 'jagged') {   // a blade chipped all along its edge
      for (let t = 4; t < L - 1; t += 3) pen.erase(...at(t, 1 + (t % 2)));
      pen.px(...at(L + 1, -0.5), w.blade);
    } else if (w.type === 'zabimaru') {   // the segments of the snake blade, each with a hooked tooth
      for (let t = 5; t < L - 1; t += 4) { pen.px(...at(t, 2), w.edge); pen.px(...at(t + 1, 2.4), w.blade); pen.erase(...at(t - 1, -0.6)); }
    }
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
  } else if (w.type === 'trident') {   // Nejibana: a long shaft, three prongs, a ribbon of water
    const L = w.len;
    pen.line(...at(-7), ...at(L - 4), w.shaft, 1);
    pen.line(...at(L - 4, -2.5), ...at(L - 4, 2.5), w.head, 1);
    pen.line(...at(L - 4), ...at(L + 2), w.head, 1);
    pen.line(...at(L - 4, -2.5), ...at(L, -2.5), w.head, 1);
    pen.line(...at(L - 4, 2.5), ...at(L, 2.5), w.head, 1);
    pen.px(...at(L + 2), w.hi);
    for (let t = 0; t < 6; t++) pen.px(...at(L - 6 - t * 1.6, Math.sin(t * 1.4 + sway) * 2.2), w.water);
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
  const crown = (rx = 4.2, ry = 2.6) => pen.ellipse(sx - 0.5, hy - 8.5, rx, ry, H);
  const back = (bottom = -5) => pen.poly([[sx - 2, hy - 9], [sx - 4, hy - 9], [sx - 4, hy + bottom], [sx - 2, hy + bottom]], H);
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
      crown(); back();
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
    case 'longflow':   // waist-long hair that swings
      pen.ellipse(sx - 0.5, hy - 8.5, 4.4, 2.8, H);
      pen.poly([[sx - 2, hy - 9], [sx - 5, hy - 9], [sx - 6 + sway * 0.5, hy + 4], [sx - 2, hy - 3]], H);
      pen.limb(sx - 4, hy - 7, sx - 8 + sway * 1.4, hy + 13, 4.5, 2, H);
      pen.line(sx - 5, hy - 5, sx - 8 + sway * 1.4, hy + 12, S);
      pen.line(sx + 3, hy - 9, sx + 4, hy - 4, H);
      tri([0, -10], [3, -10], [3, -7]);
      pen.line(sx - 2, hy - 11, sx + 2, hy - 11, L);
      if (st.hairpin) { pen.px(sx - 1, hy - 10, st.hairpin); pen.px(sx, hy - 10, st.hairpin); pen.px(sx - 1, hy - 9, st.hairpin); }
      break;
    case 'rukia':   // a short bob with one strand down between the eyes
      crown(); back(-3);
      pen.line(sx - 4, hy - 3, sx - 3, hy - 2, S);
      tri([0, -10], [4, -9], [3, -6.5]);
      pen.line(sx + 2, hy - 9, sx + 2, hy - 4, H);
      pen.line(sx - 2, hy - 11, sx + 1, hy - 11, L);
      break;
    case 'bob':   // straight, chin length, a fringe cut square
      pen.ellipse(sx - 0.5, hy - 8.5, 4.5, 2.8, H);
      pen.poly([[sx - 2, hy - 9], [sx - 5, hy - 9], [sx - 5, hy - 2], [sx - 2, hy - 2]], H);
      pen.rect(sx - 1, hy - 9, 5, 2, H);
      pen.px(sx + 4, hy - 8, H);
      pen.line(sx - 5, hy - 2, sx - 3, hy - 2, S);
      pen.line(sx - 2, hy - 11, sx + 2, hy - 11, L);
      break;
    case 'pigtails':
      crown(); back();
      pen.limb(sx - 4, hy - 8, sx - 7 + sway, hy, 2.8, 1.4, H);
      pen.limb(sx - 3, hy - 7, sx - 5 + sway * 0.6, hy + 1, 2.2, 1.2, S);
      tri([0, -10], [4, -9], [3, -7]);
      pen.line(sx - 2, hy - 11, sx + 1, hy - 11, L);
      break;
    case 'curly':   // a mop of curls that hides the eyes
      pen.ellipse(sx - 0.5, hy - 8.5, 5, 3.4, H);
      [[-4, -10], [-2, -12], [1, -12], [3, -10], [-5, -7], [4, -7]].forEach(([x, y], i) => pen.ellipse(sx + x, hy + y, 1.6, 1.6, i % 2 ? S : H));
      pen.rect(sx, hy - 8, 5, 2, H);
      pen.px(sx + 1, hy - 11, L); pen.px(sx - 2, hy - 12, L);
      break;
    case 'bandana':
      crown(4, 2.2); back(-6);
      pen.ellipse(sx - 0.5, hy - 9, 4.6, 2.4, st.bandana);
      pen.line(sx - 3, hy - 8, sx + 4, hy - 8, st.bandana);
      pen.limb(sx - 5, hy - 9, sx - 9 + sway, hy - 7, 2, 1, st.bandana);
      pen.limb(sx - 5, hy - 8, sx - 8 + sway, hy - 4, 1.6, 1, st.bandana);
      break;
    case 'ponytail':   // Renji: short at the sides, a spiked tail tied high
      crown(4.2, 2.4); back(-6);
      pen.limb(sx - 2, hy - 11, sx - 6 + sway * 0.6, hy - 15, 3, 2.2, H);
      tri([-5, -16], [-7, -13], [-12 + sway, -15]);
      tri([-6, -14], [-6, -12], [-11 + sway, -10]);
      tri([-4, -15], [-3, -17], [-7 + sway, -20]);
      tri([-7, -15], [-5, -16], [-10 + sway, -18], S);
      pen.px(sx - 4, hy - 13, '#ece7dc');   // the tie
      tri([2, -9], [4, -8], [4, -6]);
      pen.line(sx - 2, hy - 11, sx + 1, hy - 11, L);
      break;
    case 'kenseikan':   // Byakuya: long and straight, with the white kenseikan pieces
      pen.ellipse(sx - 0.5, hy - 8.5, 4.4, 2.7, H);
      pen.poly([[sx - 2, hy - 9], [sx - 5, hy - 9], [sx - 6 + sway * 0.4, hy + 3], [sx - 3, hy + 3], [sx - 2, hy - 4]], H);
      pen.line(sx - 5, hy - 6, sx - 5 + sway * 0.4, hy + 2, S);
      pen.line(sx + 3, hy - 9, sx + 4, hy - 4, H);
      pen.px(sx + 2, hy - 9, H);
      pen.rect(sx - 4, hy - 11, 3, 1, '#f4f4f8'); pen.rect(sx - 5, hy - 9, 1, 3, '#f4f4f8'); pen.px(sx - 1, hy - 12, '#f4f4f8');
      pen.line(sx - 2, hy - 11, sx + 2, hy - 11, L);
      break;
    case 'kenpachi': {   // long spikes, a bell on every tip
      pen.ellipse(sx - 0.5, hy - 8.5, 4.6, 2.9, H);
      back(-5);
      const spikes = [[[-3, -10], [-1, -11], [-12 + sway, -17]], [[-1, -11], [1, -11], [-4 + sway * 0.6, -20]], [[1, -11], [3, -10], [6, -19]],
        [[2, -10], [4, -8], [10, -14]], [[-4, -9], [-4, -7], [-13 + sway, -10]], [[-4, -7], [-3, -5], [-11 + sway, -3]]];
      spikes.forEach(([a, b, tip], i) => { tri(a, b, tip, i % 3 === 2 ? S : H); pen.px(sx + tip[0], hy + tip[1], '#f2d040'); });
      pen.line(sx - 2, hy - 12, sx + 1, hy - 12, L);
      break;
    }
    case 'grimmjow':   // swept back, light blue
      crown(4.4, 2.6); back(-6);
      tri([-1, -11], [2, -11], [-7 + sway, -14]);
      tri([-3, -10], [-2, -12], [-10 + sway, -11]);
      tri([-4, -9], [-4, -7], [-10 + sway, -6]);
      tri([1, -11], [3, -10], [0 + sway * 0.4, -14]);
      tri([2, -10], [4, -8], [5, -6]);
      pen.line(sx - 2, hy - 12, sx + 1, hy - 11, L);
      break;
    case 'mane':   // a mane down to the waist (Pantera)
      pen.limb(sx - 3, hy - 9, sx - 9 + sway * 1.5, hy + 14, 6, 2, st.mane || H);
      pen.line(sx - 4, hy - 7, sx - 9 + sway * 1.5, hy + 12, S);
      crown(4.4, 2.8);
      tri([2, -10], [4, -8], [5, -5]);
      pen.line(sx - 2, hy - 11, sx + 2, hy - 11, L);
      break;
    case 'wavy':   // Zangetsu: dark waves to the shoulders
      crown(4.6, 2.9);
      pen.poly([[sx - 2, hy - 9], [sx - 5, hy - 9], [sx - 6 + sway * 0.5, hy + 2], [sx - 2, hy - 2]], H);
      for (let i = 0; i < 4; i++) pen.px(sx - 6 + (i % 2) + sway * 0.5, hy - 6 + i * 2, S);
      pen.limb(sx + 3, hy - 9, sx + 4, hy - 3, 1.6, 1, H);
      pen.line(sx - 2, hy - 12, sx + 1, hy - 12, L);
      break;
    case 'bald':
      pen.ellipse(sx - 0.5, hy - 8, 3.8, 2.2, st.skin);
      pen.line(sx - 3, hy - 8, sx - 3, hy - 5, st.skinShade);
      pen.px(sx + 1, hy - 10, '#ffffffa0'); pen.px(sx, hy - 10, '#ffffff60');
      break;
    case 'topknot':
      crown(4.2, 2.4); back(-5);
      pen.ellipse(sx - 1, hy - 12, 1.8, 1.6, H);
      pen.px(sx - 1, hy - 11, '#a83030');
      pen.line(sx - 2, hy - 11, sx + 1, hy - 11, L);
      break;
    case 'nel': {   // green hair under the skull of her old mask
      crown(4.2, 2.6); back(-4);
      tri([1, -10], [4, -9], [4, -6]);
      const sk = '#efeae0';
      pen.ellipse(sx - 0.5, hy - 11, 4, 2.2, sk);
      pen.line(sx - 3, hy - 12, sx - 6, hy - 14, sk); pen.line(sx + 2, hy - 12, sx + 4, hy - 15, sk);
      pen.px(sx, hy - 11, '#16141c'); pen.px(sx + 2, hy - 11, '#16141c');
      pen.line(sx - 1, hy - 10, sx + 3, hy - 10, '#c8202c');
      break;
    }
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
  } else if (st.skull) {   // a full skull for a face: black sockets with a red point in each
    pen.rect(sx - 2, hy - 8, 6, 6, st.skull);
    pen.px(sx + 4, hy - 5, st.skull); pen.px(sx + 4, hy - 4, st.skull);
    pen.rect(sx + 1, hy - 7, 3, 2, '#0a0a0e'); pen.px(sx + 2, hy - 6, st.eye);
    pen.px(sx + 4, hy - 4, '#0a0a0e');
    for (let x = sx; x <= sx + 4; x += 2) pen.px(x, hy - 3, '#0a0a0e');
  } else {
    const blink = P.blink;
    pen.px(sx + 2, hy - 6, blink ? st.skinShade : (st.sclera || st.eye));
    pen.px(sx + 3, hy - 6, blink ? st.skinShade : (st.sclera ? st.eye : st.skin));
    pen.px(sx + 1, hy - 7, st.brow); pen.px(sx + 2, hy - 7, st.brow); pen.px(sx + 3, hy - 8, st.brow);
    pen.px(sx + 3, hy - 3, st.skinShade);
    if (st.tears) { pen.line(sx + 2, hy - 5, sx + 2, hy - 3, st.tears); pen.px(sx + 3, hy - 4, st.tears); }
    if (st.eyepatch) { pen.rect(sx + 2, hy - 7, 2, 2, st.eyepatch); pen.line(sx + 1, hy - 7, sx - 2, hy - 8, st.eyepatch); }
    if (st.scar) { pen.px(sx + 1, hy - 5, st.scar); pen.px(sx + 1, hy - 4, st.scar); pen.px(sx + 2, hy - 3, st.scar); }
    if (st.glasses) { pen.line(sx + 1, hy - 6, sx + 4, hy - 6, st.glasses); pen.px(sx, hy - 7, st.glasses); }
    if (st.faceMask) pen.rect(sx, hy - 5, 5, 3, st.faceMask);
    if (st.jawMask) {
      pen.rect(sx, hy - 4, 5, 2, st.jawMask);
      pen.px(sx + 1, hy - 3, '#16141c'); pen.px(sx + 3, hy - 3, '#16141c');
      pen.line(sx - 1, hy - 5, sx - 1, hy - 3, st.jawMask);
    }
    if (st.beard) { pen.rect(sx, hy - 3, 4, 2, st.beard); pen.px(sx + 1, hy - 1, st.beard); pen.px(sx + 2, hy - 1, st.beard); }
  }
  drawHair(pen, st, sx, hy, P.sway || 0);
  if (st.tattoo) { pen.line(sx - 2, hy - 9, sx + 3, hy - 9, st.tattoo); pen.line(sx - 3, hy - 7, sx - 1, hy - 7, st.tattoo); }
  if (st.headband) {
    pen.line(sx - 3, hy - 8, sx + 3, hy - 8, st.headband);
    pen.line(sx - 4, hy - 8, sx - 6 + (P.sway || 0), hy - 6, st.headband);
  }
  if (st.sideMask) {   // a Hollow mask pushed up onto the side of the head
    pen.rect(sx - 4, hy - 10, 4, 4, st.sideMask);
    pen.px(sx - 3, hy - 9, '#16141c'); pen.px(sx - 2, hy - 7, '#c8202c');
  }
  if (st.helmet) {   // what is left of Ulquiorra's mask: half a helmet and a horn
    pen.rect(sx - 3, hy - 11, 5, 3, st.helmet);
    pen.limb(sx - 2, hy - 11, sx - 5, hy - 17, 2, 1, st.helmet);
    pen.px(sx + 1, hy - 9, st.helmet);
  }
  if (!st.mask && !st.skull && !['hood', 'buckethat', 'bald'].includes(st.hairStyle)) pen.px(sx - 1, hy - 5, st.skinShade);
}

function drawArm(pen, st, sh, hand, back) {
  const sleeve = st.bareArms ? (back ? st.skinShade : st.skin) : back ? st.robeShade : st.robe;
  const ex = sh.x + (hand.x - sh.x) * 0.62, ey = sh.y + (hand.y - sh.y) * 0.62;
  pen.limb(sh.x, sh.y, ex, ey, 3.6, 4, sleeve);
  if (!back && !st.bareArms) pen.line(sh.x + 1, sh.y, ex + 1, ey, st.robeHi);
  if (!back && st.armband) pen.line(sh.x - 1, sh.y + 1, sh.x + 2, sh.y + 2, st.armband);
  let fore = st.coat ? (back ? st.robeShade : st.coat.col) : (back ? st.skinShade : st.skin);
  if (st.armGuard && !back) fore = st.armGuard;
  pen.limb(ex, ey, hand.x, hand.y, 2, 2, fore);
  if (st.armGuard && !back) pen.px(ex + (hand.x - ex) * 0.5, ey + (hand.y - ey) * 0.5, '#c8202c');
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

  if (st.batWings) {   // Murciélago: two black wings, the membranes beating with the sway
    const flap = sway * 1.5;
    pen.poly([[sx - 1, sy + 1], [sx - 12, sy - 9 - flap], [sx - 16, sy - 2 - flap], [sx - 13, sy + 4], [sx - 9, sy + 3], [sx - 6, sy + 8]], st.batWings);
    pen.line(sx - 1, sy + 1, sx - 12, sy - 9 - flap, '#3a3646');
    pen.poly([[sx + 1, sy + 1], [sx + 9, sy - 11 - flap], [sx + 12, sy - 5 - flap], [sx + 8, sy + 2]], '#26232e');
  }
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
  if (st.pack) {   // a relief pack strapped on the back
    pen.rect(sx - 9, sy, 6, 9, st.pack);
    pen.rect(sx - 9, sy, 6, 1, '#9a8a6a');
    pen.px(sx - 7, sy + 4, '#c8202c'); pen.px(sx - 6, sy + 3, '#c8202c'); pen.px(sx - 6, sy + 5, '#c8202c'); pen.px(sx - 5, sy + 4, '#c8202c');
  }
  drawArm(pen, st, { x: sx - 2, y: sy + 1 }, bh, true);
  drawLeg(pen, st, { x: hx - 2, y: hipY }, bf, true);
  drawLeg(pen, st, { x: hx + 2, y: hipY }, ff, false);

  // torso
  pen.poly([[sx - 4, sy], [sx + 4, sy], [wr + 0.5, hipY], [wl - 0.5, hipY]], st.robe);
  pen.line(sx - 4, sy + 1, wl, hipY - 1, st.robeShade);
  pen.line(sx + 3, sy + 1, wr, hipY - 2, st.robeHi);
  if (st.open) pen.poly([[sx - 1, sy], [sx + 3, sy], [sx + 2, hipY - 2], [sx + 1, hipY - 2]], st.skin);
  if (st.fur) { pen.rect(sx - 4, sy - 1, 9, 2, st.fur); pen.px(sx - 5, sy, st.fur); pen.px(sx + 5, sy, st.fur); }
  else if (!st.open) { pen.line(sx, sy, sx + 2, sy + 4, st.inner); pen.line(sx + 3, sy, sx + 2, sy + 3, st.inner); }
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
  if (st.scarf) {   // Ginpaku Kazahana no Uzuginu: wrapped once, the end streaming behind
    pen.rect(sx - 3, sy - 1, 7, 2, st.scarf);
    pen.limb(sx - 3, sy, sx - 10 + sway * 2, sy + 7 + Math.abs(sway), 2.5, 1.5, st.scarf);
    pen.px(sx - 2, sy - 1, '#ffffff');
  }

  drawHead(pen, st, sx, sy, P);
  if (wpn.mode === 'hand') drawWeapon(pen, st.weapon, fh, wpn.angle, sway);
  drawArm(pen, st, { x: sx + 2, y: sy + 1 }, fh, false);
  // Falling over / getting up: tip the whole figure about a point just above the feet
  if (P.rot) pen.rotate(P.rot, hx, G - 3);
}

// ---------------------------------------------------------------------------
// Poses. Key poses are written by hand; the frames between them are eased in
// by tween(), so every clip moves in small, even steps.
// ---------------------------------------------------------------------------
const BASE_POSE = { bob: 0, lean: 0, crouch: 0, ff: [1, 0], bf: [-2, 0], fh: [2, 8], bh: [-3, 8], weapon: null, sway: 0, tilt: 0, coatSway: 0, rot: 0 };
const W = (angle) => ({ mode: 'hand', angle });
const RUN_N = 12;   // frames in a run cycle; feet touch down on frames 0 and RUN_N / 2
const easeSine = (t) => (1 - Math.cos(t * Math.PI)) / 2;

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

// n eased frames for each step between key poses; a looping clip also eases back to its first key
function tween(keys, n, loop = false, ease = easeSine) {
  const out = [], segs = loop ? keys.length : keys.length - 1;
  for (let s = 0; s < segs; s++) for (let i = 0; i < n; i++) out.push(lerpPose(keys[s], keys[(s + 1) % keys.length], ease(i / n)));
  if (!loop) out.push(lerpPose(keys[keys.length - 1], keys[keys.length - 1], 0));
  return out;
}

// Six-beat swing: anticipation, smeared mid-swing, smeared impact, a trailing follow-through,
// the settle, and a last ease back toward the guard
function swing(k0, k2, k3) {
  const k1 = lerpPose(k0, k2, 0.55);
  k1.smear = [k0.weapon.angle, k1.weapon.angle];
  const impact = Object.assign({}, k2, { smear: [k1.weapon.angle, k2.weapon.angle] });
  const follow = lerpPose(k2, k3, 0.55);
  follow.smear = [k2.weapon.angle + (k1.weapon.angle - k2.weapon.angle) * 0.3, follow.weapon.angle];
  const settle = lerpPose(k3, Object.assign({}, k3, { lean: 0, crouch: 0 }), 0.5);
  return [k0, k1, impact, follow, k3, settle];
}

function runFrames(n, o = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = i / n * Math.PI * 2, c = Math.cos(f), s = Math.sin(f);
    out.push(Object.assign({
      lean: 2, bob: Math.max(0, Math.cos(2 * f)) * 1.2, sway: -1 - Math.abs(s) * 0.8, coatSway: -2 + s,
      // the foot that is lifted swings forward; the planted one is dragged back under the body
      ff: [4.5 * c, Math.max(0, -s) * 3.5],
      bf: [-4.5 * c, Math.max(0, s) * 3.5],
      fh: [-3.5 * c + 2, 7 - Math.abs(c)], bh: [3.5 * c - 2, 7],
    }, o));
  }
  return out;
}

// name: [frames, frameRate, repeat]
function humanoidAnims(st) {
  const all = humanoidAnimsBase(st);
  all.windup = [[all.slashA[0][0]], 1, 0];
  all.strike = [all.slashA[0].slice(1), 26, 0];
  const keep = st.anims ? Object.fromEntries(Object.entries(all).filter(([k]) => st.anims.includes(k))) : all;
  if (st.basePose) {
    for (const v of Object.values(keep)) v[0] = v[0].map(p => Object.assign({}, p, st.basePose, p.weapon && !st.basePose.weapon ? { weapon: p.weapon } : {}));
  }
  return keep;
}
function humanoidAnimsBase(st) {
  const hand = st.carry !== 'back';
  const idleW = st.carry === 'hand' ? W(70) : null;
  // a slow breath: twelve frames eased in and out, a blink near the end
  const idle = [];
  for (let i = 0; i < 12; i++) {
    const t = (1 - Math.cos(i / 12 * Math.PI * 2)) / 2;
    idle.push({ bob: t, sway: t, coatSway: t * 0.6, fh: [2, 8 + t], bh: [-3, 8 + t], weapon: idleW ? W(70 + t * 3) : null, blink: i === 9 });
  }
  const jumpKeys = [
    { crouch: 2, ff: [2, 0], bf: [-3, 0], fh: [3, 6], bh: [-4, 7], sway: 1, weapon: idleW },
    { crouch: -1, ff: [2, 1], bf: [-2, 0], fh: [4, 4], bh: [-4, 6], sway: -0.5, weapon: idleW },
    { ff: [3, 4], bf: [-2, 2], fh: [4, 3], bh: [-5, 5], sway: -1, lean: 1, weapon: idleW },
    { ff: [3, 5], bf: [-2, 4], fh: [5, 2], bh: [-5, 4], sway: -1.5, lean: 1, coatSway: 0.5, weapon: idleW },
  ];
  return {
    idle: [idle, 9, -1],
    run: [runFrames(RUN_N, { weapon: hand && st.carry === 'hand' ? W(150) : null }), 21, -1],
    jump: [jumpKeys, 16, 0],
    fall: [tween([{ ff: [3, 1], bf: [-3, 2], fh: [5, -1], bh: [-5, 0], sway: 1, coatSway: 1, weapon: idleW }, { ff: [3, 2], bf: [-3, 1], fh: [5, -2], bh: [-6, -1], sway: 2, coatSway: 2, weapon: idleW }], 2, true), 9, -1],
    land: [[
      { crouch: 3, ff: [3, 0], bf: [-4, 0], fh: [4, 7], bh: [-5, 8], sway: 2, coatSway: 2, weapon: idleW },
      { crouch: 2, ff: [3, 0], bf: [-4, 0], fh: [3, 8], bh: [-5, 8], sway: 1.5, coatSway: 1.5, weapon: idleW },
      { crouch: 1, ff: [2, 0], bf: [-3, 0], fh: [3, 8], bh: [-4, 8], sway: 1, weapon: idleW },
    ], 20, 0],
    dash: [tween([
      { lean: 4, crouch: 1, ff: [5, 2], bf: [-7, 1], fh: [-3, 7], bh: [-6, 6], sway: -2, coatSway: -4, weapon: hand ? W(165) : null },
      { lean: 4, crouch: 1, ff: [5, 2], bf: [-8, 2], fh: [-4, 7], bh: [-7, 6], sway: -3, coatSway: -5, weapon: hand ? W(168) : null },
    ], 2, true), 18, -1],
    cling: [tween([{ lean: -1, ff: [1, 3], bf: [-6, 4], fh: [3, 6], bh: [-7, 1], weapon: idleW }, { lean: -1, bob: 1, ff: [1, 3], bf: [-6, 4], fh: [3, 7], bh: [-7, 1], sway: 0.5, weapon: idleW }], 2, true), 5, -1],
    focus: [tween([{ crouch: 2, ff: [3, 0], bf: [-3, 0], fh: [4, 3], bh: [3, 4], weapon: hand ? W(80) : null }, { crouch: 2, bob: 1, ff: [3, 0], bf: [-3, 0], fh: [4, 4], bh: [3, 5], sway: 0.5, weapon: hand ? W(80) : null }], 3, true), 7, -1],
    cast: [tween([
      { lean: -1, ff: [3, 0], bf: [-4, 0], fh: [-2, 4], bh: [-4, 7], sway: 1, weapon: idleW },
      { lean: 2, ff: [4, 0], bf: [-5, 0], fh: [8, 1], bh: [-5, 6], sway: -1, weapon: idleW },
      { lean: 2, ff: [4, 0], bf: [-5, 0], fh: [9, 0], bh: [-5, 6], sway: -1.5, weapon: idleW },
    ], 2), 22, 0],
    charge: [tween([{ crouch: 3, lean: 2, ff: [5, 0], bf: [-6, 0], fh: [-1, 7], bh: [-4, 6], sway: -1, weapon: W(160) }, { crouch: 3, lean: 2, bob: 1, ff: [5, 0], bf: [-6, 0], fh: [-1, 8], bh: [-4, 7], sway: -2, weapon: W(162) }], 2, true), 12, -1],
    hurt: [[{ lean: -3, tilt: -1, crouch: 1, ff: [2, 1], bf: [-3, 0], fh: [6, -4], bh: [-7, -2], sway: 3, coatSway: 2, weapon: idleW }, { lean: -2, tilt: -1, ff: [2, 1], bf: [-3, 0], fh: [5, -3], bh: [-6, -1], sway: 2, weapon: idleW }], 14, 0],
    slashA: [swing(
      { lean: -1, ff: [2, 0], bf: [-4, 0], fh: [0, -4], bh: [-3, -2], weapon: W(-125), sway: 1 },
      { lean: 2, ff: [5, 0], bf: [-5, 0], fh: [6, 1], bh: [-4, 5], weapon: W(4), sway: -1, coatSway: -2 },
      { lean: 1, ff: [5, 0], bf: [-5, 0], fh: [5, 5], bh: [-4, 6], weapon: W(55), sway: -1 },
    ), 30, 0],
    slashB: [swing(
      { lean: -1, ff: [2, 0], bf: [-4, 0], fh: [-2, 7], bh: [-3, 6], weapon: W(140), sway: 1 },
      { lean: 2, ff: [5, 0], bf: [-5, 0], fh: [6, 2], bh: [-4, 5], weapon: W(-4), sway: -1, coatSway: -2 },
      { lean: 1, ff: [5, 0], bf: [-5, 0], fh: [5, -2], bh: [-4, 5], weapon: W(-55), sway: -1 },
    ), 30, 0],
    up: [swing(
      { crouch: 1, ff: [3, 0], bf: [-3, 0], fh: [3, 6], bh: [-3, 6], weapon: W(120) },
      { ff: [3, 0], bf: [-3, 0], fh: [2, -6], bh: [-3, 2], weapon: W(-88), sway: 1 },
      { ff: [3, 0], bf: [-3, 0], fh: [1, -5], bh: [-3, 3], weapon: W(-110), sway: 1 },
    ), 30, 0],
    down: [swing(
      { ff: [3, 4], bf: [-2, 3], fh: [3, -4], bh: [-4, 1], weapon: W(-70) },
      { ff: [3, 4], bf: [-2, 3], fh: [2, 5], bh: [-4, 4], weapon: W(84), sway: 1 },
      { ff: [3, 4], bf: [-2, 3], fh: [3, 5], bh: [-4, 5], weapon: W(70), sway: 1 },
    ), 30, 0],
    guard: [runFrames(8, { lean: 1, fh: [4, 2], bh: [-2, 5], weapon: W(-80), sway: -0.5 }), 11, -1],
    guardIdle: [tween([{ fh: [4, 2], bh: [-2, 5], weapon: W(-80) }, { bob: 1, fh: [4, 3], bh: [-2, 6], weapon: W(-78), sway: 0.5 }], 3, true), 6, -1],
    recover: [[{ crouch: 1, lean: 1, ff: [4, 0], bf: [-4, 0], fh: [5, 7], bh: [-4, 7], weapon: W(75), sway: 1 }], 1, 0],
    float: [tween([{ ff: [2, 3], bf: [-3, 2], fh: [5, 4], bh: [-5, 5] }, { bob: 1, ff: [2, 4], bf: [-3, 3], fh: [5, 5], bh: [-5, 6], sway: 1 }], 4, true), 8, -1],
    dive: [[{ lean: 1, ff: [1, 0], bf: [-1, 1], fh: [3, 10], bh: [0, 10], sway: 2 }], 1, 0],
    rush: [[{ lean: 5, crouch: 2, ff: [6, 1], bf: [-7, 1], fh: [11, 3], bh: [8, 5], sway: -2 }], 1, 0],
    // Knocked backwards and down (death)
    death: [tween([
      { lean: -3, crouch: 1, rot: -10, ff: [2, 0], bf: [-3, 0], fh: [-4, -2], bh: [-6, 0], sway: 2, coatSway: 2 },
      { lean: -4, crouch: 2, rot: -38, ff: [3, 2], bf: [-2, 4], fh: [-5, -4], bh: [-7, -2], sway: 3, coatSway: 3 },
      { lean: -3, crouch: 2, rot: -68, ff: [3, 3], bf: [-3, 5], fh: [-7, -3], bh: [-8, -1], sway: 3, coatSway: 3 },
      { lean: -2, crouch: 1, rot: -88, ff: [2, 1], bf: [-3, 2], fh: [-8, -2], bh: [-9, 1], sway: 3, coatSway: 2 },
    ], 2, false, (t) => t), 14, 0],
    // Waking at a rest gate: up off the ground, onto a knee, then standing
    rise: [tween([
      { lean: -2, crouch: 1, rot: -88, ff: [2, 1], bf: [-3, 2], fh: [-8, -2], bh: [-9, 1], sway: 3, coatSway: 2 },
      { lean: -3, crouch: 2, rot: -60, ff: [3, 3], bf: [-3, 5], fh: [-6, -2], bh: [-8, 0], sway: 2 },
      { lean: 0, crouch: 3, rot: -22, ff: [3, 1], bf: [-4, 0], fh: [5, 6], bh: [-1, 6], sway: 1 },
      { lean: 2, crouch: 3, ff: [4, 0], bf: [-4, 0], fh: [4, 5], bh: [2, 6], sway: 1 },
      { lean: 1, crouch: 1, ff: [3, 0], bf: [-3, 0], fh: [3, 7], bh: [-2, 7], sway: 0 },
    ], 2), 12, 0],
    // Blade thrust skyward: a new power, a victory
    raise: [tween([
      { lean: -1, ff: [3, 0], bf: [-3, 0], fh: [3, -9], bh: [-3, 6], weapon: W(-92), sway: 1, coatSway: -1 },
      { lean: -1, bob: 1, ff: [3, 0], bf: [-3, 0], fh: [3, -10], bh: [-3, 6], weapon: W(-96), sway: -1, coatSway: 1 },
    ], 2, true), 6, -1],
    // Kneeling at a rest gate, hands together
    pray: [tween([
      { crouch: 2, lean: 1, ff: [3, 0], bf: [-3, 0], fh: [3, 4], bh: [2, 4], sway: 0 },
      { crouch: 2, lean: 1, bob: 1, ff: [3, 0], bf: [-3, 0], fh: [3, 5], bh: [2, 5], sway: 0.5 },
    ], 2, true), 3, -1],
    // An idle glance upward, now and then
    look: [tween([
      { tilt: -1, fh: [2, 8], bh: [-3, 8], sway: 0.5 },
      { tilt: -2, fh: [2, 8], bh: [-3, 8], sway: 1 },
      { tilt: -2, bob: 1, fh: [2, 8], bh: [-3, 9], sway: 1 },
      { tilt: -1, fh: [2, 8], bh: [-3, 8], sway: 0.5 },
    ], 2), 6, 0],
  };
}

// ---------------------------------------------------------------------------
// Creatures
// ---------------------------------------------------------------------------
function drawHollowFlyer(pen, f, n = 8) {
  const B = '#15131b', B2 = '#2c2636', W_ = '#efeae0', WS = '#bdb6aa', R = '#ff2a3a', Mem = '#3c2a44';
  // the wing beat is a smooth curve over n frames: a quick downstroke, a slower recovery
  const ph = f / n * Math.PI * 2, wing = -20 + Math.cos(ph) * 42, wing2 = wing + 12;
  const bob = Math.sin(ph) * 0.8;
  const shoulder = [13, 10 + bob];
  const wingAt = (deg, len) => [shoulder[0] + Math.cos(deg * Math.PI / 180) * len * -0.55, shoulder[1] + Math.sin(deg * Math.PI / 180) * len];
  // back wing
  const t2 = wingAt(wing2, 10);
  pen.poly([shoulder, t2, [t2[0] - 2, t2[1] + 3], [8, 13 + bob]], '#241c2c');
  pen.line(shoulder[0], shoulder[1], t2[0], t2[1], WS);
  // tail
  pen.line(8, 13 + bob, 4, 15, B); pen.line(4, 15, 2, 13 + Math.cos(ph), B); pen.px(1, 12 + Math.cos(ph), B2);
  // body
  pen.ellipse(13, 12.5 + bob, 6.5, 4.5, B);
  pen.line(9, 10 + bob, 15, 9 + bob, B2);
  // claws
  const leg = Math.sin(ph) > 0 ? 1 : 0;
  pen.line(11, 16 + bob, 10, 18 + leg, B); pen.line(15, 16 + bob, 15, 18 + (1 - leg), B);
  pen.px(9, 19 + leg, WS); pen.px(16, 19 + (1 - leg), WS);
  // bird-skull mask: angular brow, hooked beak, jagged teeth, swept-back horn
  const m = (x, y) => [x, y + bob];
  pen.poly([m(15, 8), m(21, 6.5), m(25, 9), m(27, 12), m(24, 12.5), m(22, 15), m(16, 14)], W_);
  pen.poly([m(24, 12), m(27, 12), m(25, 15)], WS);
  pen.line(16, 13 + bob, 22, 13 + bob, B);
  for (let x = 17; x <= 22; x += 2) { pen.px(x, 12 + bob, W_); pen.px(x + 1, 14 + bob, W_); }
  pen.limb(17, 8 + bob, 13, 4 + bob, 2, 1, W_); pen.px(12, 3 + bob, W_);
  pen.line(18, 9 + bob, 20, 10 + bob, B); pen.px(19, 10 + bob, R); pen.px(20, 10 + bob, R);
  pen.line(21, 9 + bob, 22, 10 + bob, B); pen.px(22, 10 + bob, R);
  pen.line(16, 11 + bob, 18, 11 + bob, WS);
  // chest hole
  pen.erase(11, 12 + bob); pen.erase(12, 12 + bob); pen.erase(11, 13 + bob); pen.erase(12, 13 + bob);
  // front wing with membrane
  const t1 = wingAt(wing, 13);
  pen.poly([shoulder, t1, [t1[0] - 1, t1[1] + 4], [9, 12 + bob]], Mem);
  pen.line(shoulder[0], shoulder[1], t1[0], t1[1], W_);
  pen.px(t1[0], t1[1], W_);
}

// A four-legged Hollow. pal and size let the same body serve the Adjuchas and the smaller
// Acidwire crawler of Karakura.
function drawAdjuchas(pen, f, mode, o = {}) {
  const B = o.body || '#1a1622', Hi = o.hi || '#2e283a', Dk = o.dark || '#0f0c14', W_ = o.mask || '#efeae0', WS = o.maskShade || '#c4bdb0', R = o.eye || '#ff3a2a';
  const n = o.frames || 8;
  const crouch = mode === 'windup' ? 3 : 0;
  const breath = mode === 'idle' ? Math.sin(f / 4 * Math.PI * 2) * 0.8 : 0;
  const by = 12 + crouch + breath;
  const ph = f / n * Math.PI * 2;
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
  const jaw = mode === 'windup' || mode === 'spit' ? 2 : 0;
  pen.poly([[26, by - 6], [38, by - 1 + crouch * 0.4], [36, by + 3], [26, by + 2]], W_);
  pen.poly([[27, by + 2], [35, by + 3 + jaw], [28, by + 5 + jaw]], WS);
  pen.line(27, by + 2, 35, by + 2 + jaw, Dk);
  for (let x = 28; x <= 34; x += 2) pen.px(x, by + 3 + jaw * 0.5, W_);
  pen.px(29, by - 3, R); pen.px(30, by - 3, R);
  if (mode === 'windup') { pen.px(31, by - 3, '#ffd04a'); pen.under(28, by - 4, '#ff3a2a60'); pen.under(29, by - 5, '#ff3a2a40'); }
  if (mode === 'spit') { pen.ellipse(37, by + 2, 2, 2, o.acid || '#9aff6a'); pen.under(39, by + 1, (o.acid || '#9aff6a') + '80'); }
  pen.line(26, by - 6, 30, by - 9, W_);
  // hole
  pen.erase(15, Math.round(by)); pen.erase(16, Math.round(by)); pen.erase(15, Math.round(by) + 1); pen.erase(16, Math.round(by) + 1);
}
const CRAWLER_PAL = { body: '#2a2a1e', hi: '#46462e', dark: '#16160e', mask: '#e8e4d0', maskShade: '#b8b498', eye: '#9aff6a', acid: '#9aff6a', frames: 8 };

function drawMenos(pen, mode, f, n = 8) {
  const B = '#121018', Hi = '#26222f', W_ = '#efe9df', Sh = '#c8c0b4', R = '#ff2a3a';
  const crouch = mode === 'crouch' ? 6 : 0;
  const ph = f / n * Math.PI * 2;
  const sway = mode === 'idle' ? Math.sin(ph) : 0;
  const breathe = mode === 'idle' ? Math.cos(ph) : 0;
  const top = 18 + crouch + breathe;
  pen.poly([[40, top], [72 + sway, 120], [8 + sway, 120]], B);
  pen.line(40, top + 2, 68 + sway, 118, Hi);
  pen.line(36, top + 30, 20 + sway, 116, Hi);
  for (let x = 10; x < 72; x += 6) pen.poly([[x + sway, 120], [x + 3 + sway, 112 + ((x / 6 + Math.floor(f / 2)) % 2 ? 2 : 0)], [x + 6 + sway, 120]], '#07060b');
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
  for (let y = Math.floor(top + 47); y <= top + 61; y++) for (let x = 33; x <= 47; x++) if (Math.hypot(x + 0.5 - 40, y + 0.5 - (top + 54)) < 6.5) pen.erase(x, y);
  pen.rect(13 + sway, 92 + crouch, 6, 4, W_); pen.rect(61 + sway, 92 + crouch, 6, 4, W_);
  pen.px(13 + sway, 96 + crouch, W_); pen.px(18 + sway, 96 + crouch, W_); pen.px(61 + sway, 96 + crouch, W_); pen.px(66 + sway, 96 + crouch, W_);
}

// Grand Fisher: a hunched mass of dark fur behind an angler's bone mask, a lure on a stalk from
// its brow. Frames are 96x84 with the feet on the bottom row; it faces right.
// mode: idle, walk, windup, swipe, burrow (k = how far under), lure (stalk thrown forward), roar
function drawGrandFisher(pen, mode, f = 0, k = 0) {
  const Fur = '#2a1e18', FurHi = '#4a3628', FurDk = '#160f0c', Bone = '#efe8dc', BoneSh = '#c4b8a4', R = '#ff3a2a', Claw = '#e8e0d0';
  const sink = mode === 'burrow' ? k * 64 : 0;
  const ph = f / 8 * Math.PI * 2;
  const breathe = mode === 'idle' ? Math.sin(ph) * 1.2 : 0;
  const step = mode === 'walk' ? Math.sin(ph) : 0;
  const crouch = mode === 'windup' ? 4 : mode === 'roar' ? -2 : 0;
  const cy = 52 + crouch + sink + Math.abs(step) * 1.5;
  // the lure: a stalk off the brow, ending in the bait
  if (sink < 40) {
    const thrown = mode === 'lure';
    const tipX = thrown ? 94 : 72 + Math.sin(ph) * 3, tipY = thrown ? 34 : 6 + Math.cos(ph) * 2 + sink;
    const midX = thrown ? 78 : 64, midY = thrown ? 14 + sink : 4 + sink;
    for (let t = 0; t <= 1; t += 0.05) {
      const x = (1 - t) * (1 - t) * 58 + 2 * (1 - t) * t * midX + t * t * tipX;
      const y = (1 - t) * (1 - t) * (cy - 22) + 2 * (1 - t) * t * midY + t * t * tipY;
      pen.rect(x, y, 2, 2, FurDk);
    }
    pen.ellipse(tipX, tipY + 4, 3, 4, '#f4eef0');
    pen.ellipse(tipX, tipY, 2.4, 2.4, '#e8e4f0');
    pen.px(tipX + 1, tipY, '#ff3040');
    for (let a = 0; a < 8; a++) pen.under(tipX + Math.cos(a * 0.8) * 6, tipY + 2 + Math.sin(a * 0.8) * 6, '#e8e4ff40');
  }
  // back arm
  const bClaw = mode === 'windup' ? [46, cy - 26] : mode === 'swipe' ? [70, cy + 18] : [56 - step * 4, 80 + sink];
  pen.limb(46, cy - 4, bClaw[0], bClaw[1], 8, 5, FurDk);
  // legs
  [[34, 1], [52, -1]].forEach(([x, s]) => {
    const lift = mode === 'walk' ? Math.max(0, Math.sin(ph) * s) * 4 : 0;
    pen.limb(x, cy + 12, x + step * s * 3, 82 - lift + sink, 9, 7, FurDk);
    pen.rect(x - 4 + step * s * 3, 81 - lift + sink, 9, 3, BoneSh);
  });
  // body: a shaggy mound
  pen.ellipse(42, cy, 27, 21 + breathe, Fur);
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (0.95 + i / 13 * 1.15), r = 25;
    const x = 42 + Math.cos(a) * r, y = cy + Math.sin(a) * (20 + breathe);
    pen.poly([[x - 3, y], [x + Math.cos(a) * 7 + Math.sin(ph + i) * 1.5, y + Math.sin(a) * 7], [x + 3, y]], i % 2 ? FurHi : Fur);
  }
  pen.ellipse(36, cy - 6, 14, 8, FurHi);
  // the mask: a wide angler skull with a jaw full of teeth
  const jaw = mode === 'roar' ? 8 : mode === 'swipe' ? 3 : 0;
  pen.ellipse(66, cy - 18, 14, 11, Bone);
  pen.poly([[54, cy - 12], [86, cy - 10 + jaw * 0.3], [80, cy - 2 + jaw], [58, cy - 4 + jaw]], Bone);
  pen.line(56, cy - 9 + jaw * 0.5, 84, cy - 8 + jaw * 0.5, FurDk);
  for (let x = 58; x <= 82; x += 3) { pen.px(x, cy - 10 + jaw * 0.4, Bone); pen.px(x + 1, cy - 7 + jaw * 0.6, Bone); }
  if (jaw > 4) pen.rect(60, cy - 8, 20, jaw - 2, '#3a0a12');
  pen.ellipse(64, cy - 21, 3.5, 3, FurDk); pen.ellipse(73, cy - 20, 3, 2.6, FurDk);
  pen.px(64, cy - 21, R); pen.px(73, cy - 20, R);
  pen.line(56, cy - 26, 70, cy - 29, BoneSh);
  pen.line(54, cy - 16, 60, cy - 13, BoneSh);
  // front arm with three long claws
  const fClaw = mode === 'windup' ? [58, cy - 34] : mode === 'swipe' ? [92, cy + 12] : [70 + step * 4, 80 + sink];
  pen.limb(56, cy + 2, fClaw[0], fClaw[1], 9, 6, Fur);
  const ca = Math.atan2(fClaw[1] - cy - 2, fClaw[0] - 56);
  for (let c = -1; c <= 1; c++) {
    const a = ca + c * 0.35;
    pen.line(fClaw[0], fClaw[1], fClaw[0] + Math.cos(a) * 8, fClaw[1] + Math.sin(a) * 8, Claw);
  }
  if (mode === 'swipe') for (let a = -1.6; a < 0.5; a += 0.08) pen.under(56 + Math.cos(a) * 40, cy + 2 + Math.sin(a) * 40, '#ffffff40');
  // the hole through it
  for (let y = Math.floor(cy - 2); y <= cy + 4; y++) for (let x = 36; x <= 42; x++) if (Math.hypot(x + 0.5 - 39, y + 0.5 - (cy + 1)) < 3.4) pen.erase(x, y);
  // churned earth when it digs
  if (mode === 'burrow') for (let i = 0; i < 18; i++) pen.rect(14 + i * 4 + (i % 3), 78 + (i % 2) * 2, 4, 6, i % 2 ? '#3a2e24' : '#5a4634');
}

// Kon: the mod soul stuffed in a lion plushie
function drawKon(pen, f) {
  const Y = '#f2c040', YS = '#c8962a', M = '#d87a20', W_ = '#f8f0e0', B = '#16141c';
  const hop = [0, 1, 2, 1][f];
  const by = 16 - hop, hy = 9 - hop;
  pen.ellipse(10, by, 5, 4.5, Y); pen.ellipse(10, by + 1, 3, 3, W_);
  pen.rect(6, by + 3, 3, 3, YS); pen.rect(11, by + 3, 3, 3, YS);
  pen.line(5, by - 1, 3, by + 1 + (f % 2), Y); pen.line(15, by - 1, 17, by + 1 - (f % 2), Y);
  pen.line(4, by + 1, 1, by + 2, Y); pen.px(1, by + 1, M);
  for (let a = 0; a < 12; a++) { const r = a / 12 * Math.PI * 2; pen.ellipse(10 + Math.cos(r) * 5, hy + Math.sin(r) * 5, 2, 2, M); }
  pen.ellipse(10, hy, 4.2, 4, Y);
  pen.px(9, hy - 1, B); pen.px(12, hy - 1, B); pen.px(10, hy + 1, '#8a3a2a'); pen.px(11, hy + 1, '#8a3a2a');
  pen.line(9, hy + 2, 12, hy + 2, YS);
  pen.px(13, by + 1, '#c8202c');   // stitching
}

// Yoruichi, as she prefers to be seen: a black cat with gold eyes
function drawCat(pen, f) {
  const B = '#14121a', B2 = '#2a2634', Y = '#f2c230';
  const swish = [0, 1, 2, 1][f];
  pen.limb(5, 14, 1 + swish, 6 - swish * 0.5, 2.4, 1.6, B);
  pen.ellipse(10, 13, 6, 4.5, B);
  pen.rect(6, 15, 2, 3, B); pen.rect(12, 15, 2, 3, B); pen.rect(14, 14, 2, 4, B);
  pen.ellipse(17, 8, 4, 3.6, B);
  pen.poly([[14, 6], [15, 2], [17, 5]], B); pen.poly([[18, 5], [20, 2], [21, 6]], B);
  pen.px(15, 4, B2); pen.px(20, 4, B2);
  pen.px(18, 8, Y); pen.px(20, 8, Y);
  pen.line(8, 11, 13, 10, B2);
}

// Hell butterfly (black with red veins), used for souls crossing over and on the title screen
function drawButterfly(pen, f) {
  const B = '#0a0a10', R = '#b4303a';
  const open = [1, 0.75, 0.45, 0.15, 0.45, 0.75][f];
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
  const cols = Math.min(12, frames.length), rows = Math.ceil(frames.length / cols);
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
// A creature sheet from named clips: { clip: [frameCount, rate, repeat, (pen, i) => draw] }
function creatureSheet(scene, key, fw, fh, clips, outline) {
  const frames = [];
  Object.entries(clips).forEach(([name, [n, , , draw]]) => { for (let i = 0; i < n; i++) frames.push({ name: name + i, draw: (pen) => draw(pen, i) }); });
  buildSheet(scene, key, fw, fh, frames, outline);
  Object.entries(clips).forEach(([name, [n, rate, repeat]]) => makeAnim(scene, key + ':' + name, key, Array.from({ length: n }, (_, i) => name + i), rate, repeat));
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

  // Lesser hollow (28x22, flying): eight frames of wingbeat
  creatureSheet(scene, 'hollow', 28, 22, { fly: [8, 16, -1, (pen, i) => drawHollowFlyer(pen, i, 8)] });

  // Adjuchas (40x26, feet on the bottom row)
  creatureSheet(scene, 'adjuchas', 40, 26, {
    run: [8, 15, -1, (pen, i) => drawAdjuchas(pen, i, 'run')],
    idle: [4, 5, -1, (pen, i) => drawAdjuchas(pen, i, 'idle')],
    windup: [1, 1, 0, (pen) => drawAdjuchas(pen, 0, 'windup')],
  });
  // Acidwire crawler (40x26): a smaller, greener cousin that spits
  creatureSheet(scene, 'crawler', 40, 26, {
    run: [8, 16, -1, (pen, i) => drawAdjuchas(pen, i, 'run', CRAWLER_PAL)],
    idle: [4, 5, -1, (pen, i) => drawAdjuchas(pen, i, 'idle', CRAWLER_PAL)],
    spit: [1, 1, 0, (pen) => drawAdjuchas(pen, 0, 'spit', CRAWLER_PAL)],
    windup: [1, 1, 0, (pen) => drawAdjuchas(pen, 0, 'windup', CRAWLER_PAL)],
  });

  // Menos Grande (80x120)
  creatureSheet(scene, 'menos', 80, 120, {
    idle: [8, 6, -1, (pen, i) => drawMenos(pen, 'idle', i, 8)],
    crouch: [1, 1, 0, (pen) => drawMenos(pen, 'crouch', 0)],
    cero: [1, 1, 0, (pen) => drawMenos(pen, 'cero', 0)],
  });

  // Grand Fisher (96x84)
  creatureSheet(scene, 'fisher', 96, 84, {
    idle: [8, 8, -1, (pen, i) => drawGrandFisher(pen, 'idle', i)],
    walk: [8, 10, -1, (pen, i) => drawGrandFisher(pen, 'walk', i)],
    windup: [1, 1, 0, (pen) => drawGrandFisher(pen, 'windup')],
    swipe: [1, 1, 0, (pen) => drawGrandFisher(pen, 'swipe')],
    lure: [1, 1, 0, (pen) => drawGrandFisher(pen, 'lure')],
    roar: [1, 1, 0, (pen) => drawGrandFisher(pen, 'roar')],
    burrow: [5, 14, 0, (pen, i) => drawGrandFisher(pen, 'burrow', 0, i / 4)],
    rise: [5, 18, 0, (pen, i) => drawGrandFisher(pen, 'burrow', 0, 1 - i / 4)],
  });

  // Kon and the black cat (NPCs that are not people)
  creatureSheet(scene, 'npc_kon', 20, 22, { idle: [4, 6, -1, (pen, i) => drawKon(pen, i)] });
  creatureSheet(scene, 'npc_cat', 24, 18, { idle: [4, 3, -1, (pen, i) => drawCat(pen, i)] }, '#3a3448');

  // Hell butterfly (12x10)
  buildSheet(scene, 'hellfly', 12, 10, [0, 1, 2, 3, 4, 5].map(f => ({ name: 'f' + f, draw: (pen) => drawButterfly(pen, f) })), null);
  makeAnim(scene, 'hellfly:flap', 'hellfly', ['f0', 'f1', 'f2', 'f3', 'f4', 'f5'], 14, -1);
}

// NPC name -> sprite style. Creature NPCs (Kon, the cat) have their own small sheets.
const NPC_STYLES = {
  'Wandering Plus': 'npc_plus', 'Ururu Tsumugiya': 'npc_clerk', 'Old Man of Junrinan': 'npc_old', 'Swordsmith': 'npc_smith',
  'Shinji Hirako': 'npc_masked', 'Zangetsu': 'npc_zangetsu', 'Kisuke Urahara': 'npc_merchant',
  'Rukia Kuchiki': 'npc_rukia', 'Kon': 'npc_kon', 'Yasutora Sado': 'npc_chad', 'Orihime Inoue': 'npc_orihime',
  'Ganju Shiba': 'npc_ganju', 'Jidanbō': 'npc_jidanbo', 'Hanatarō Yamada': 'npc_hanataro', 'Uryū Ishida': 'npc_uryu',
  'Yoruichi': 'npc_cat', 'Nel Tu': 'npc_nel', 'Ashido Kanō': 'npc_ashido', 'Old Fisherman': 'npc_fisher',
  'Ichibē Hyōsube': 'npc_ichibe',
};
// How big each NPC stands (Jidanbō is a giant, Ichibē merely enormous)
const NPC_SCALE = { npc_jidanbo: 3.2, npc_ichibe: 1.3 };
// Sheets that are not on the humanoid rig: [frame height, row of the feet]
const NPC_CREATURE = { npc_kon: [22, 21], npc_cat: [18, 17] };
