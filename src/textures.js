'use strict';
// ---------------------------------------------------------------------------
// Procedural placeholder art. Everything is drawn into canvas textures at boot,
// so the game runs without any asset files. Swap these keys for real sprite
// sheets later (spec phase 13) without touching gameplay code.
// ---------------------------------------------------------------------------

function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  draw(ctx, w, h);
  tex.refresh();
  return tex;
}

function pixTex(scene, key, rows, pal) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  canvasTex(scene, key, w, h, ctx => {
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        const c = pal[r[x]];
        if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
      }
    });
  });
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

const TILE_PAL = {
  kar: { base: '#2c2f45', mid: '#363a56', dark: '#1d1f30', top: '#7b84b4', line: '#22253a', spike: '#c9cbe0', plank: '#6b5a46', plankHi: '#9a8466' },
  ruk: { base: '#4a3a2a', mid: '#574533', dark: '#33281d', top: '#8b9a4a', line: '#3a2d20', spike: '#e2d2b0', plank: '#7a5c3c', plankHi: '#a6825a' },
  sei: { base: '#b3ae9f', mid: '#c6c1b3', dark: '#8f8a7e', top: '#3f6468', line: '#9d988b', spike: '#4a4640', plank: '#8a3a34', plankHi: '#b65a4e' },
  sok: { base: '#4b3434', mid: '#5a3e3e', dark: '#2f2020', top: '#a0705c', line: '#3a2626', spike: '#eadad2', plank: '#6a4a3a', plankHi: '#94705a' },
  hm:  { base: '#aaa6b8', mid: '#bdb9cb', dark: '#858196', top: '#f4f2f8', line: '#97939f', spike: '#24212c', plank: '#6e6a84', plankHi: '#a4a0bc' },
  end: { base: '#4e6a8c', mid: '#6a88aa', dark: '#34486a', top: '#dceaf8', line: '#2a3c58', spike: '#e8f4ff', plank: '#8aa6c8', plankHi: '#ffffff' },
  dan: { base: '#281f3c', mid: '#32284c', dark: '#18122a', top: '#b49ae8', line: '#3e3260', spike: '#e6d8ff', plank: '#5a4a8a', plankHi: '#9a84d8' },
  for: { base: '#1d1a25', mid: '#25202f', dark: '#110f18', top: '#52705f', line: '#2b2537', spike: '#ece8f4', plank: '#cfcbe0', plankHi: '#ffffff' },
  stu: { base: '#6a5a48', mid: '#7a6a56', dark: '#4a3e32', top: '#b8a888', line: '#58493a', spike: '#e8dcc4', plank: '#8a6a4a', plankHi: '#b89470' },
  rei: { base: '#e8e2d2', mid: '#f4f0e4', dark: '#c8bea4', top: '#e8c46a', line: '#d4caae', spike: '#c8a040', plank: '#c89a3a', plankHi: '#f4d68a' },
  fkt: { base: '#5a6070', mid: '#686e80', dark: '#40444f', top: '#b8c2d4', line: '#4a4f5c', spike: '#e8ecf4', plank: '#8a8e9a', plankHi: '#c8ccd8' },
};

function makeTileset(scene, region) {
  const p = TILE_PAL[region];
  const N = 14;
  canvasTex(scene, 'tiles_' + region, TILE * N, TILE, (c) => {
    const rnd = seeded(region.length * 977 + region.charCodeAt(0));
    const solid = (ox) => {
      c.fillStyle = p.base; c.fillRect(ox, 0, 16, 16);
      if (region === 'kar') {
        c.fillStyle = p.line;
        for (let y = 0; y < 16; y += 5) {
          c.fillRect(ox, y, 16, 1);
          const off = (y / 5) % 2 ? 4 : 10;
          c.fillRect(ox + off, y, 1, 5);
        }
      } else if (region === 'sei') {
        c.fillStyle = p.mid; c.fillRect(ox + 1, 1, 14, 6); c.fillRect(ox + 1, 9, 14, 6);
        c.fillStyle = p.line; c.fillRect(ox, 7, 16, 2);
      } else if (region === 'dan') {
        c.fillStyle = p.line; c.fillRect(ox + 3, 0, 1, 16); c.fillRect(ox + 11, 0, 1, 16);
        c.fillStyle = p.mid; c.fillRect(ox + 4, 0, 1, 16);
      } else if (region === 'for') {
        c.fillStyle = p.line; for (let i = 0; i < 3; i++) c.fillRect(ox + Math.floor(rnd() * 12), Math.floor(rnd() * 12), 4, 1);
      } else if (region === 'rei') {   // white jade blocks with a gold seam
        c.fillStyle = p.mid; c.fillRect(ox + 1, 1, 14, 14);
        c.fillStyle = p.line; c.fillRect(ox, 15, 16, 1); c.fillRect(ox + 15, 0, 1, 16);
        c.fillStyle = 'rgba(232,196,106,0.55)'; c.fillRect(ox + 2, 2, 12, 1);
      } else if (region === 'stu') {   // packed rock with pale strata
        c.fillStyle = p.line; c.fillRect(ox, 5, 16, 1); c.fillRect(ox, 11, 16, 1);
      } else if (region === 'fkt') {   // the replica's asphalt: grey, with a painted road line and cracks from the fighting
        c.fillStyle = p.line; c.fillRect(ox, 11, 16, 1);
        c.fillStyle = 'rgba(230,226,200,0.35)'; c.fillRect(ox + 2, 6, 6, 1);
      } else if (region === 'end') {   // the glass and steel face of a fallen skyscraper
        c.fillStyle = p.line; c.fillRect(ox, 0, 16, 16);
        c.fillStyle = p.mid; c.fillRect(ox + 1, 1, 6, 6); c.fillRect(ox + 9, 1, 6, 6); c.fillRect(ox + 1, 9, 6, 6); c.fillRect(ox + 9, 9, 6, 6);
        c.fillStyle = 'rgba(220,236,252,0.45)'; c.fillRect(ox + 1, 1, 2, 2); c.fillRect(ox + 9, 1, 2, 2); c.fillRect(ox + 1, 9, 2, 2); c.fillRect(ox + 9, 9, 2, 2);
      }
      for (let i = 0; i < 9; i++) {
        c.fillStyle = rnd() < 0.5 ? p.dark : p.mid;
        c.fillRect(ox + Math.floor(rnd() * 15), Math.floor(rnd() * 15), 1 + Math.floor(rnd() * 2), 1);
      }
    };
    const top = (ox) => {
      solid(ox);
      c.fillStyle = p.top; c.fillRect(ox, 0, 16, 3);
      c.fillStyle = p.dark; c.fillRect(ox, 3, 16, 1);
      if (region === 'ruk') { c.fillStyle = p.top; for (let i = 0; i < 4; i++) c.fillRect(ox + 1 + i * 4, 0 - 0, 1, 2); }
      if (region === 'hm') { c.fillStyle = '#ffffff'; c.fillRect(ox, 0, 16, 1); }
    };
    // 0 solid, 1 top
    solid(0); top(16);
    // 2 one-way plank
    c.fillStyle = p.plank; c.fillRect(32, 0, 16, 4);
    c.fillStyle = p.plankHi; c.fillRect(32, 0, 16, 1);
    c.fillStyle = p.dark; c.fillRect(32, 4, 16, 1); c.fillRect(34, 5, 2, 4); c.fillRect(44, 5, 2, 4);
    // 3 spikes
    c.fillStyle = p.spike;
    for (let i = 0; i < 4; i++) {
      c.beginPath(); c.moveTo(48 + i * 4, 16); c.lineTo(48 + i * 4 + 2, 6); c.lineTo(48 + i * 4 + 4, 16); c.closePath(); c.fill();
    }
    c.fillStyle = p.dark; c.fillRect(48, 14, 16, 2);
    // 4 kido seal
    c.fillStyle = 'rgba(150,90,235,0.62)'; c.fillRect(64, 0, 16, 16);
    c.fillStyle = 'rgba(226,200,255,0.9)'; c.fillRect(64, 0, 1, 16); c.fillRect(79, 0, 1, 16);
    c.strokeStyle = 'rgba(240,225,255,0.85)'; c.lineWidth = 1;
    c.beginPath(); c.arc(72, 8, 4.5, 0, Math.PI * 2); c.stroke();
    c.fillRect(71, 2, 2, 12);
    // 5 senkaimon gate
    c.fillStyle = '#1a0f12'; c.fillRect(80, 0, 16, 16);
    c.fillStyle = '#5a1d22'; c.fillRect(82, 0, 3, 16); c.fillRect(91, 0, 3, 16);
    c.fillStyle = '#ff8a3a'; c.fillRect(80, 7, 16, 2);
    c.fillStyle = 'rgba(255,170,90,0.5)'; c.fillRect(80, 6, 16, 1); c.fillRect(80, 9, 16, 1);
    // 6 cracked wall (looks almost like solid)
    solid(96);
    c.fillStyle = p.dark;
    [[3, 2], [4, 3], [5, 4], [5, 5], [6, 6], [8, 7], [9, 8], [9, 9], [11, 10], [12, 11], [7, 7], [6, 9], [5, 10]].forEach(([x, y]) => c.fillRect(96 + x, y, 1, 1));
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(96 + 4, 2, 1, 1); c.fillRect(96 + 10, 8, 1, 1);
    // 7 bankai seal door
    c.fillStyle = '#0b0b10'; c.fillRect(112, 0, 16, 16);
    c.fillStyle = '#b4303a'; c.fillRect(112, 0, 2, 16); c.fillRect(126, 0, 2, 16);
    c.beginPath(); c.moveTo(120, 3); c.lineTo(125, 8); c.lineTo(120, 13); c.lineTo(115, 8); c.closePath(); c.fill();
    c.fillStyle = '#0b0b10'; c.fillRect(119, 7, 2, 2);
    // 8 hidden platform (true sight)
    c.fillStyle = 'rgba(140,230,255,0.38)'; c.fillRect(128, 0, 16, 5);
    c.fillStyle = 'rgba(200,250,255,0.95)';
    for (let x = 0; x < 16; x += 3) c.fillRect(128 + x, 0, 2, 1);
    c.fillRect(128, 4, 16, 1);
    // 9 boss lock bars
    c.fillStyle = '#e8e2d4';
    [1, 6, 11].forEach(x => c.fillRect(144 + x, 0, 4, 16));
    c.fillStyle = '#9a9384';
    [1, 6, 11].forEach(x => c.fillRect(144 + x + 3, 0, 1, 16));
    // 10 collapsing floor
    top(160);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(160, 4, 16, 12);
    c.fillStyle = p.dark;
    [[2, 5], [3, 6], [3, 7], [4, 8], [9, 4], [10, 5], [10, 6], [11, 7], [12, 8], [12, 9]].forEach(([x, y]) => c.fillRect(160 + x, y, 1, 1));
    // 11 gold Kidō barrier: a lattice of light
    c.fillStyle = 'rgba(242,200,90,0.35)'; c.fillRect(176, 0, 16, 16);
    c.fillStyle = 'rgba(255,230,150,0.95)';
    for (let i = 0; i < 16; i += 4) { c.fillRect(176 + i, 0, 1, 16); c.fillRect(176, i, 16, 1); }
    c.fillStyle = '#ffffff'; c.fillRect(183, 7, 2, 2);
    // 12 blue wall of light (stands only while a lantern burns)
    c.fillStyle = 'rgba(110,190,255,0.45)'; c.fillRect(192, 0, 16, 16);
    c.fillStyle = 'rgba(200,236,255,0.95)'; c.fillRect(192, 0, 2, 16); c.fillRect(206, 0, 2, 16);
    for (let y = 2; y < 16; y += 5) c.fillRect(196, y, 8, 1);
    // 13 quicksand: rippled sand with a darker, sinking middle
    c.fillStyle = region === 'hm' ? '#d8d4e2' : p.top; c.fillRect(208, 0, 16, 16);
    c.fillStyle = region === 'hm' ? '#b4b0c4' : p.mid;
    for (let y = 3; y < 16; y += 4) for (let x = (y % 8 ? 0 : 3); x < 16; x += 6) c.fillRect(208 + x, y, 3, 1);
    c.fillStyle = 'rgba(40,36,56,0.18)'; c.fillRect(208, 8, 16, 8);
  });
}

// ---------------------------------------------------------------------------
// Backgrounds: four 640x360 layers per region (sky, far, mid, near), tiling in
// x. Far layers are low in contrast and lean toward the sky's colour, so the
// eye reads distance; the near layer only fills the bottom of the frame.
// ---------------------------------------------------------------------------
const BG_FACTORS = [0.02, 0.08, 0.2, 0.42];

function makeBackgrounds(scene, region) {
  const W = VIEW_W, H = VIEW_H;
  const k = (n) => 'bg_' + region + '_' + n;
  const grad = (c, stops, x0 = 0, y0 = 0, x1 = 0, y1 = H) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    return g;
  };
  const sky = (c, stops) => { c.fillStyle = grad(c, stops); c.fillRect(0, 0, W, H); };
  const stars = (c, n, seed, alpha = 0.8, maxY = 0.7) => {
    const r = seeded(seed);
    for (let i = 0; i < n; i++) {
      const a = 0.2 + r() * alpha, x = Math.floor(r() * W), y = Math.floor(r() * H * maxY);
      c.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      c.fillRect(x, y, 1, 1);
      if (a > 0.85) { c.fillStyle = `rgba(255,255,255,${(a * 0.3).toFixed(2)})`; c.fillRect(x - 1, y, 3, 1); c.fillRect(x, y - 1, 1, 3); }
    }
  };
  const glowDisc = (c, x, y, r, inner, outer) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  };
  // long soft cloud bands, drawn at every horizontal offset so they tile
  const clouds = (c, n, seed, col, yMin, yMax, wMin, wMax, hMax = 5) => {
    const r = seeded(seed);
    for (let i = 0; i < n; i++) {
      const y = yMin + r() * (yMax - yMin), w = wMin + r() * (wMax - wMin), x = r() * W, h = 2 + r() * hMax;
      c.fillStyle = col;
      [-W, 0, W].forEach(o => { c.beginPath(); c.ellipse(x + o, y, w / 2, h, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(x + o + w * 0.18, y - h * 0.6, w * 0.28, h * 0.8, 0, 0, Math.PI * 2); c.fill(); });
    }
  };
  // a ridge line made of sine waves, filled to the bottom
  const ridge = (c, col, base, amps, seed = 0) => {
    c.fillStyle = col;
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) {
      let y = base;
      amps.forEach(([a, f], i) => { y += Math.sin((x / W) * Math.PI * 2 * f + seed + i * 1.7) * a; });
      c.lineTo(x, y);
    }
    c.lineTo(W, H); c.closePath(); c.fill();
  };
  // a piece drawn at x, -W and +W so anything crossing the seam lines up
  const tile = (fn) => [-W, 0, W].forEach(o => fn(o));

  if (region === 'kar') {
    canvasTex(scene, k(0), W, H, c => {
      sky(c, [[0, '#090a1e'], [0.45, '#1e1a44'], [0.75, '#4e2e5e'], [0.92, '#8e4e68'], [1, '#b8686a']]);
      stars(c, 130, 3, 0.75, 0.62);
      glowDisc(c, 470, 74, 90, 'rgba(243,233,210,0.18)', 'rgba(243,233,210,0)');
      c.fillStyle = '#f3e9d2'; c.beginPath(); c.arc(470, 74, 24, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(200,190,170,0.4)';
      [[462, 66, 5], [478, 82, 4], [482, 64, 2.5]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); });
      clouds(c, 7, 17, 'rgba(26,20,50,0.55)', 40, 150, 140, 300, 4);
      clouds(c, 4, 19, 'rgba(150,90,130,0.18)', 200, 260, 200, 360, 3);
    });
    canvasTex(scene, k(1), W, H, c => {
      // the far city: tall, flat, and blue with distance
      const r = seeded(11);
      let x = 0;
      while (x < W) {
        const w = 18 + Math.floor(r() * 30), h = 80 + Math.floor(r() * 120), bx = x;
        tile(o => {
          c.fillStyle = grad(c, [[0, '#2a2650'], [1, '#1c1a3a']], 0, H - h, 0, H); c.fillRect(bx + o, H - h, w, h);
          c.fillStyle = 'rgba(120,110,170,0.25)'; c.fillRect(bx + o, H - h, 1, h);
        });
        const r2 = seeded(bx * 7 + 1);
        for (let wy = H - h + 6; wy < H - 8; wy += 7) for (let wx = bx + 3; wx < bx + w - 3; wx += 5) {
          if (r2() < 0.18) { c.fillStyle = r2() < 0.85 ? 'rgba(255,214,140,0.32)' : 'rgba(170,210,255,0.3)'; c.fillRect(wx, wy, 2, 3); }
        }
        x += w + 2 + Math.floor(r() * 8);
      }
      // the Karakura TV tower, with its red light
      c.fillStyle = '#221f42'; c.fillRect(300, 70, 4, H - 70); c.fillRect(294, 110, 16, 6); c.fillRect(297, 150, 10, 4);
      c.beginPath(); c.moveTo(286, H); c.lineTo(302, 120); c.lineTo(318, H); c.closePath(); c.fill();
      c.fillStyle = '#ff4050'; c.fillRect(301, 66, 2, 2);
      glowDisc(c, 302, 67, 8, 'rgba(255,64,80,0.5)', 'rgba(255,64,80,0)');
    });
    canvasTex(scene, k(2), W, H, c => {
      // houses with tiled roofs, a few lit windows, poles and the wires between them
      const r = seeded(23);
      let x = 0;
      while (x < W) {
        const w = 56 + Math.floor(r() * 50), wall = 34 + Math.floor(r() * 30), roof = 18 + Math.floor(r() * 8), bx = x, top = H - wall;
        tile(o => {
          c.fillStyle = '#1a1830'; c.fillRect(bx + o, top, w, wall);
          c.fillStyle = '#24223e';
          c.beginPath(); c.moveTo(bx + o - 6, top + 2); c.lineTo(bx + o + w * 0.5, top - roof); c.lineTo(bx + o + w + 6, top + 2); c.closePath(); c.fill();
          c.fillStyle = '#3a3862'; c.fillRect(bx + o - 6, top + 1, w + 12, 2);
          c.strokeStyle = 'rgba(70,68,110,0.6)'; c.lineWidth = 1;
          for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(bx + o + w * 0.5, top - roof + 2); c.lineTo(bx + o - 6 + (w + 12) * i / 5, top + 1); c.stroke(); }
          const r3 = seeded(bx * 13 + 5);
          for (let i = 0; i < 3; i++) if (r3() < 0.6) {
            const wx = bx + o + 6 + r3() * (w - 18), wy = top + 8 + r3() * (wall - 20);
            c.fillStyle = 'rgba(255,200,120,0.75)'; c.fillRect(wx, wy, 8, 7);
            c.fillStyle = 'rgba(40,30,50,0.6)'; c.fillRect(wx + 3, wy, 1, 7);
            glowDisc(c, wx + 4, wy + 3, 14, 'rgba(255,190,110,0.16)', 'rgba(255,190,110,0)');
          }
        });
        x += w + 18 + Math.floor(r() * 30);
      }
      c.fillStyle = '#121128';
      for (let px = 70; px < W; px += 210) { c.fillRect(px, 120, 4, H - 120); c.fillRect(px - 12, 130, 28, 3); c.fillRect(px - 8, 140, 20, 2); }
      c.strokeStyle = 'rgba(18,17,40,0.95)'; c.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        for (let px = 70 - 210; px < W + 210; px += 210) { c.moveTo(px - 10, 132 + i * 4); c.quadraticCurveTo(px + 95, 160 + i * 4, px + 198, 132 + i * 4); }
        c.stroke();
      }
    });
    canvasTex(scene, k(3), W, H, c => {
      // block walls and hedges along the street, and a street lamp's pool of light
      const r = seeded(31);
      c.fillStyle = '#0b0a17';
      let x = 0;
      while (x < W) { const w = 40 + r() * 70, h = 18 + r() * 22; c.fillRect(x, H - h, w, h); x += w + r() * 10; }
      for (let i = 0; i < 9; i++) { const hx = r() * W, hr = 10 + r() * 14; tile(o => { c.beginPath(); c.arc(hx + o, H - 26, hr, 0, Math.PI * 2); c.fill(); }); }
      [120, 470].forEach(lx => {
        glowDisc(c, lx + 6, H - 76, 70, 'rgba(255,230,180,0.16)', 'rgba(255,230,180,0)');
        c.fillStyle = '#0b0a17'; c.fillRect(lx, H - 80, 3, 80); c.fillRect(lx, H - 80, 12, 3);
        c.fillStyle = '#ffeec0'; c.fillRect(lx + 8, H - 77, 5, 2);
      });
    });
  } else if (region === 'ruk') {
    canvasTex(scene, k(0), W, H, c => {
      sky(c, [[0, '#24183a'], [0.4, '#6a3448'], [0.7, '#c86848'], [0.88, '#eca460'], [1, '#f6d090']]);
      glowDisc(c, 180, 236, 120, 'rgba(255,220,150,0.45)', 'rgba(255,200,130,0)');
      c.fillStyle = 'rgba(255,232,180,0.95)'; c.beginPath(); c.arc(180, 236, 34, 0, Math.PI * 2); c.fill();
      clouds(c, 8, 41, 'rgba(120,50,70,0.35)', 60, 190, 160, 320, 4);
      clouds(c, 6, 43, 'rgba(255,180,120,0.25)', 150, 230, 100, 240, 3);
    });
    canvasTex(scene, k(1), W, H, c => {
      // on the horizon, the white walls of the Seireitei and the spire on Sokyoku Hill
      ridge(c, 'rgba(150,96,90,0.55)', 268, [[8, 2], [4, 7]]);
      c.fillStyle = 'rgba(236,214,200,0.55)';
      c.fillRect(0, 238, W, 22);
      c.fillStyle = 'rgba(190,150,140,0.55)'; c.fillRect(0, 236, W, 3);
      const r = seeded(47);
      for (let i = 0; i < 8; i++) {
        const tx = 20 + i * 80 + r() * 30, th = 30 + r() * 40;
        c.fillStyle = 'rgba(236,214,200,0.6)'; c.fillRect(tx, 238 - th, 12, th);
        c.fillStyle = 'rgba(110,80,90,0.6)';
        c.beginPath(); c.moveTo(tx - 5, 238 - th + 4); c.lineTo(tx + 6, 238 - th - 6); c.lineTo(tx + 17, 238 - th + 4); c.closePath(); c.fill();
      }
      c.fillStyle = 'rgba(120,70,80,0.55)';
      c.beginPath(); c.moveTo(430, 240); c.lineTo(470, 170); c.lineTo(510, 240); c.closePath(); c.fill();
      c.fillRect(468, 120, 4, 52);
    });
    canvasTex(scene, k(2), W, H, c => {
      ridge(c, '#5a3a2e', 262, [[16, 2], [6, 5]], 1);
      // shacks and their chimney smoke
      const r = seeded(53);
      for (let i = 0; i < 7; i++) {
        const bx = r() * W, w = 30 + r() * 26, h = 16 + r() * 12, by = 262 + Math.sin(bx / W * Math.PI * 4 + 1) * 16 - 2;
        tile(o => {
          c.fillStyle = '#3e2820'; c.fillRect(bx + o, by - h, w, h + 20);
          c.fillStyle = '#5e4030'; c.beginPath(); c.moveTo(bx + o - 5, by - h + 2); c.lineTo(bx + o + w / 2, by - h - 12); c.lineTo(bx + o + w + 5, by - h + 2); c.closePath(); c.fill();
          c.fillStyle = 'rgba(255,190,110,0.6)'; if (r() < 0.5) c.fillRect(bx + o + w * 0.3, by - h + 5, 4, 4);
          c.fillStyle = 'rgba(200,170,160,0.12)';
          for (let s = 0; s < 6; s++) { c.beginPath(); c.arc(bx + o + w * 0.7 - s * 4, by - h - 16 - s * 12, 4 + s * 2, 0, Math.PI * 2); c.fill(); }
        });
      }
    });
    canvasTex(scene, k(3), W, H, c => {
      const r = seeded(59);
      c.fillStyle = '#211611';
      let x = 0;
      while (x < W) {
        const w = 40 + r() * 40, h = 30 + r() * 26, bx = x;
        tile(o => {
          c.fillRect(bx + o, H - h, w, h);
          c.beginPath(); c.moveTo(bx + o - 6, H - h); c.lineTo(bx + o + w * 0.4, H - h - 16); c.lineTo(bx + o + w + 6, H - h + 4); c.closePath(); c.fill();
        });
        x += w + 40 + r() * 60;
      }
      for (let i = 0; i < 26; i++) { const gx = r() * W, gh = 5 + r() * 9; c.fillRect(gx, H - gh, 1, gh); c.fillRect(gx + 2, H - gh * 0.7, 1, gh * 0.7); }
      for (let fx = 0; fx < W; fx += 22) c.fillRect(fx, H - 22, 2, 22);
      c.fillRect(0, H - 18, W, 2);
    });
  } else if (region === 'sei') {
    canvasTex(scene, k(0), W, H, c => {
      sky(c, [[0, '#4a78ac'], [0.55, '#9cbcd8'], [0.85, '#dcdcd2'], [1, '#ece6d6']]);
      glowDisc(c, 520, 50, 160, 'rgba(255,250,230,0.35)', 'rgba(255,250,230,0)');
      clouds(c, 9, 61, 'rgba(255,255,255,0.45)', 40, 170, 90, 220, 7);
      clouds(c, 6, 67, 'rgba(255,255,255,0.25)', 150, 220, 160, 300, 5);
    });
    canvasTex(scene, k(1), W, H, c => {
      // pagodas fading into the haze, and the white Tower of Penitence above them all
      const r = seeded(31);
      for (let i = 0; i < 6; i++) {
        const bx = 30 + i * 105 + r() * 30, w = 26 + r() * 16, h = 120 + r() * 80;
        tile(o => {
          c.fillStyle = 'rgba(214,214,212,0.75)'; c.fillRect(bx + o, H - h, w, h);
          c.fillStyle = 'rgba(80,110,124,0.6)';
          for (let t = 0; t < 3; t++) { const ty = H - h + t * 36; c.beginPath(); c.moveTo(bx + o - 9, ty + 9); c.lineTo(bx + o + w / 2, ty - 5); c.lineTo(bx + o + w + 9, ty + 9); c.closePath(); c.fill(); }
        });
      }
      c.fillStyle = 'rgba(240,238,232,0.9)'; c.fillRect(420, 30, 22, H - 30);
      c.fillStyle = 'rgba(190,196,200,0.8)'; c.fillRect(436, 30, 6, H - 30);
      c.fillStyle = 'rgba(240,238,232,0.9)'; c.beginPath(); c.moveTo(412, 34); c.lineTo(431, 14); c.lineTo(450, 34); c.closePath(); c.fill();
      c.fillStyle = 'rgba(120,130,140,0.5)'; c.fillRect(428, 60, 6, 8);
    });
    canvasTex(scene, k(2), W, H, c => {
      // barracks roofs: dark teal tiles with upturned eaves, a red lantern here and there
      const r = seeded(71);
      let x = 0;
      while (x < W) {
        const w = 70 + r() * 60, h = 40 + r() * 30, bx = x, top = 250 - h * 0.4;
        tile(o => {
          c.fillStyle = '#d2ccbc'; c.fillRect(bx + o, top, w, H - top);
          c.fillStyle = '#2f4e56';
          c.beginPath(); c.moveTo(bx + o - 10, top + 4); c.quadraticCurveTo(bx + o - 4, top - 2, bx + o + 6, top - 10); c.lineTo(bx + o + w - 6, top - 10); c.quadraticCurveTo(bx + o + w + 4, top - 2, bx + o + w + 10, top + 4); c.closePath(); c.fill();
          c.fillStyle = '#4a6e78'; c.fillRect(bx + o + 6, top - 10, w - 12, 2);
          c.fillStyle = 'rgba(80,70,60,0.35)'; for (let px = bx + o + 8; px < bx + o + w - 8; px += 16) c.fillRect(px, top + 10, 8, 12);
          if (r() < 0.6) { c.fillStyle = '#c83a30'; c.fillRect(bx + o + w * 0.2, top + 4, 4, 6); glowDisc(c, bx + o + w * 0.2 + 2, top + 7, 10, 'rgba(255,120,80,0.3)', 'rgba(255,120,80,0)'); }
        });
        x += w + 26 + r() * 30;
      }
    });
    canvasTex(scene, k(3), W, H, c => {
      // the long white walls of the Seireitei, capped with tile
      c.fillStyle = '#d6d0c0'; c.fillRect(0, 286, W, H - 286);
      c.fillStyle = '#3a3a40'; c.fillRect(0, 278, W, 9);
      c.fillStyle = '#56565e'; c.fillRect(0, 278, W, 2);
      c.fillStyle = '#b8b2a2'; for (let x = 0; x < W; x += 64) c.fillRect(x, 287, 2, H - 287);
      c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, 287, W, 5);
    });
  } else if (region === 'sok') {
    canvasTex(scene, k(0), W, H, c => {
      sky(c, [[0, '#140810'], [0.4, '#4e1420'], [0.72, '#b03c30'], [0.9, '#e88050'], [1, '#f2aa70']]);
      glowDisc(c, 420, 250, 140, 'rgba(255,190,130,0.45)', 'rgba(255,190,130,0)');
      c.fillStyle = 'rgba(255,214,160,0.9)'; c.beginPath(); c.arc(420, 250, 44, 0, Math.PI * 2); c.fill();
      clouds(c, 9, 81, 'rgba(60,10,24,0.45)', 40, 200, 170, 340, 5);
    });
    canvasTex(scene, k(1), W, H, c => {
      // the hill, and on it the Sokyoku: a halberd as tall as a tower, held in its frame
      c.fillStyle = '#461822';
      c.beginPath(); c.moveTo(0, H); c.lineTo(0, 268); c.quadraticCurveTo(240, 128, 420, 156); c.quadraticCurveTo(560, 176, W, 252); c.lineTo(W, H); c.closePath(); c.fill();
      c.fillStyle = 'rgba(40,12,20,0.9)';
      c.fillRect(326, 22, 8, 136);
      c.beginPath(); c.moveTo(322, 26); c.lineTo(330, 0); c.lineTo(338, 26); c.closePath(); c.fill();
      c.fillRect(318, 30, 24, 4);
      c.fillRect(292, 70, 76, 6); c.fillRect(298, 94, 64, 4);
      c.fillRect(304, 70, 4, 88); c.fillRect(352, 70, 4, 88);
    });
    canvasTex(scene, k(2), W, H, c => {
      const r = seeded(87);
      c.fillStyle = '#3a141c';
      for (let i = 0; i < 6; i++) {
        const bx = r() * W, w = 40 + r() * 60, h = 60 + r() * 70;
        tile(o => { c.beginPath(); c.moveTo(bx + o, H); c.lineTo(bx + o + w * 0.35, H - h); c.lineTo(bx + o + w * 0.55, H - h * 0.8); c.lineTo(bx + o + w, H); c.closePath(); c.fill(); });
      }
      ridge(c, '#2e1016', 300, [[10, 3], [5, 9]], 2);
    });
    canvasTex(scene, k(3), W, H, c => {
      const r = seeded(41);
      c.fillStyle = '#170a0e';
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W; x += 16) c.lineTo(x, 318 + r() * 24);
      c.lineTo(W, 330); c.lineTo(W, H); c.closePath(); c.fill();
      for (let i = 0; i < 30; i++) { const gx = r() * W, gh = 6 + r() * 14; c.fillRect(gx, 330 - gh, 1, gh); }
    });
  } else if (region === 'hm') {
    canvasTex(scene, k(0), W, H, c => {
      sky(c, [[0, '#020206'], [0.7, '#0c0c1c'], [1, '#1a1a30']]);
      stars(c, 200, 7, 0.6, 0.8);
      glowDisc(c, 500, 80, 80, 'rgba(242,240,230,0.14)', 'rgba(242,240,230,0)');
      c.fillStyle = '#f2f0e6'; c.beginPath(); c.arc(500, 80, 38, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath(); c.arc(486, 70, 36, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'source-over';
    });
    canvasTex(scene, k(1), W, H, c => {
      // Las Noches on the horizon: a vast white dome ringed by towers
      ridge(c, 'rgba(60,58,82,0.9)', 286, [[10, 2], [5, 6]]);
      c.fillStyle = 'rgba(70,68,96,0.95)';
      c.beginPath(); c.arc(170, 286, 92, Math.PI, 0); c.fill();
      c.fillStyle = 'rgba(96,94,124,0.6)'; c.beginPath(); c.arc(150, 266, 60, Math.PI * 1.1, Math.PI * 1.6); c.lineTo(150, 266); c.fill();
      [[62, 70], [96, 110], [244, 100], [278, 66], [130, 40], [210, 46]].forEach(([tx, th]) => {
        c.fillStyle = 'rgba(70,68,96,0.95)'; c.fillRect(tx, 286 - th, 6, th);
        c.beginPath(); c.moveTo(tx - 2, 286 - th); c.lineTo(tx + 3, 286 - th - 10); c.lineTo(tx + 8, 286 - th); c.closePath(); c.fill();
      });
    });
    canvasTex(scene, k(2), W, H, c => {
      ridge(c, '#46445a', 300, [[14, 2], [6, 5]], 3);
      c.strokeStyle = 'rgba(207,203,224,0.7)'; c.lineCap = 'round';
      const tree = (x, s) => {
        c.lineWidth = 3 * s; c.beginPath(); c.moveTo(x, H); c.lineTo(x + 4, H - 90 * s); c.stroke();
        c.lineWidth = 2 * s;
        c.beginPath(); c.moveTo(x + 2, H - 50 * s); c.lineTo(x - 22 * s, H - 80 * s); c.stroke();
        c.beginPath(); c.moveTo(x + 3, H - 70 * s); c.lineTo(x + 28 * s, H - 104 * s); c.stroke();
        c.lineWidth = 1; c.beginPath(); c.moveTo(x - 12 * s, H - 66 * s); c.lineTo(x - 18 * s, H - 92 * s); c.stroke();
      };
      tree(90, 0.8); tree(380, 0.65); tree(560, 0.9);
    });
    canvasTex(scene, k(3), W, H, c => {
      ridge(c, '#26243a', 330, [[10, 1], [6, 4]], 5);
      c.strokeStyle = '#d6d2e6'; c.lineCap = 'round';
      [[40, 1.2], [470, 1.4]].forEach(([x, s]) => {
        c.lineWidth = 4 * s; c.beginPath(); c.moveTo(x, H); c.lineTo(x + 6, H - 110 * s); c.stroke();
        c.lineWidth = 2.5 * s; c.beginPath(); c.moveTo(x + 4, H - 64 * s); c.lineTo(x + 40 * s, H - 100 * s); c.stroke();
        c.beginPath(); c.moveTo(x + 5, H - 86 * s); c.lineTo(x - 26 * s, H - 118 * s); c.stroke();
      });
    });
  } else if (region === 'dan') {
    const strands = (c, n, seed, col, wMin, wMax, amp) => {
      const r = seeded(seed);
      for (let i = 0; i < n; i++) {
        const x0 = r() * W, w = wMin + r() * (wMax - wMin), ph = r() * 6, freq = 2 + r() * 3;
        c.fillStyle = col;
        tile(o => {
          c.beginPath();
          for (let y = 0; y <= H; y += 6) c.lineTo(x0 + o + Math.sin(y / H * Math.PI * freq + ph) * amp, y);
          for (let y = H; y >= 0; y -= 6) c.lineTo(x0 + o + w + Math.sin(y / H * Math.PI * freq + ph + 0.6) * amp, y);
          c.closePath(); c.fill();
        });
      }
    };
    canvasTex(scene, k(0), W, H, c => { sky(c, [[0, '#0a0614'], [0.5, '#1a0e2e'], [1, '#2a1442']]); stars(c, 60, 23, 0.4); });
    canvasTex(scene, k(1), W, H, c => strands(c, 9, 31, 'rgba(150,110,220,0.14)', 18, 46, 22));
    canvasTex(scene, k(2), W, H, c => {
      strands(c, 6, 37, 'rgba(70,40,120,0.5)', 8, 20, 14);
      const r = seeded(41);
      for (let i = 0; i < 18; i++) { c.fillStyle = `rgba(220,200,255,${(0.1 + r() * 0.3).toFixed(2)})`; c.fillRect(r() * W, r() * H, 2, 2); }
    });
    canvasTex(scene, k(3), W, H, c => {
      // the walls of the Precipice World ooze in from above and below
      const wall = (y0, dir) => {
        c.fillStyle = dir > 0 ? grad(c, [[0, 'rgba(40,20,70,0)'], [1, 'rgba(40,20,70,0.85)']], 0, y0, 0, y0 + 60) : grad(c, [[0, 'rgba(40,20,70,0.85)'], [1, 'rgba(40,20,70,0)']], 0, y0 - 60, 0, y0);
        c.beginPath(); c.moveTo(0, dir > 0 ? H : 0);
        for (let x = 0; x <= W; x += 8) c.lineTo(x, y0 + Math.sin(x / W * Math.PI * 6) * 10 + Math.sin(x / W * Math.PI * 14) * 4);
        c.lineTo(W, dir > 0 ? H : 0); c.closePath(); c.fill();
      };
      wall(320, 1); wall(26, -1);
    });
  } else if (region === 'for') {
    canvasTex(scene, k(0), W, H, c => {
      sky(c, [[0, '#0d1216'], [0.4, '#070a0e'], [1, '#05060a']]);
      c.fillStyle = grad(c, [[0, 'rgba(200,210,230,0.18)'], [1, 'rgba(200,210,230,0)']], 0, 0, 0, 90); c.fillRect(0, 0, W, 90);
    });
    canvasTex(scene, k(1), W, H, c => {
      const r = seeded(51);
      // distant Menos among the trunks
      for (let i = 0; i < 5; i++) {
        const x = 40 + i * 130 + r() * 40, top = 150 + r() * 60;
        tile(o => {
          c.fillStyle = '#0c0b12'; c.beginPath(); c.moveTo(x + o, top); c.lineTo(x + o + 26, H); c.lineTo(x + o - 26, H); c.closePath(); c.fill();
          c.fillStyle = 'rgba(220,214,200,0.45)'; c.beginPath(); c.ellipse(x + o + 3, top + 4, 6, 7, 0, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.moveTo(x + o + 6, top + 2); c.lineTo(x + o + 22, top + 7); c.lineTo(x + o + 6, top + 9); c.closePath(); c.fill();
        });
      }
      c.fillStyle = 'rgba(190,186,206,0.18)';
      for (let i = 0; i < 6; i++) { const x = r() * W, w = 10 + r() * 8; tile(o => c.fillRect(x + o, 0, w, H)); }
    });
    canvasTex(scene, k(2), W, H, c => {
      // mist lying between the stems
      clouds(c, 8, 57, 'rgba(120,150,140,0.1)', 180, 320, 200, 400, 14);
      const trunk = (x, w) => {
        c.fillStyle = '#c8c4d4'; c.fillRect(x, 0, w, H);
        c.fillStyle = '#9894a8'; c.fillRect(x + w - 3, 0, 3, H);
        c.fillStyle = 'rgba(5,6,10,0.45)'; c.fillRect(x, 0, w, H);
      };
      trunk(200, 16); trunk(560, 20);
    });
    canvasTex(scene, k(3), W, H, c => {
      const trunk = (x, w) => {
        c.fillStyle = '#d8d4e4'; c.fillRect(x, 0, w, H);
        c.fillStyle = '#a8a4b8'; c.fillRect(x + w - 4, 0, 4, H);
        c.strokeStyle = '#d8d4e4'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(x + w, 120); c.lineTo(x + w + 60, 84); c.stroke();
        c.beginPath(); c.moveTo(x, 210); c.lineTo(x - 50, 176); c.stroke();
        c.fillStyle = 'rgba(5,6,10,0.3)'; c.fillRect(x, 0, w, H);
      };
      trunk(70, 26); trunk(420, 34);
    });
  } else if (region === 'stu') {
    // The Study Room: a painted blue sky with painted clouds, and real crags rising from a dusty floor
    canvasTex(scene, k(0), W, H, c => {
      sky(c, [[0, '#4a90c8'], [0.6, '#8cc0e4'], [1, '#d8e8ee']]);
      clouds(c, 12, 211, 'rgba(255,255,255,0.75)', 30, 220, 60, 160, 8);
      // the seams of the painted ceiling, just visible
      c.fillStyle = 'rgba(40,70,100,0.12)';
      for (let x = 0; x < W; x += 80) c.fillRect(x, 0, 1, H * 0.6);
    });
    canvasTex(scene, k(1), W, H, c => {
      ridge(c, 'rgba(150,140,120,0.55)', 250, [[30, 2], [14, 5]], 1);
    });
    canvasTex(scene, k(2), W, H, c => {
      const r = seeded(213);
      c.fillStyle = '#8a7a62';
      for (let i = 0; i < 7; i++) {
        const bx = r() * W, w = 30 + r() * 50, h = 70 + r() * 110;
        tile(o => { c.beginPath(); c.moveTo(bx + o, H); c.lineTo(bx + o + w * 0.2, H - h); c.lineTo(bx + o + w * 0.7, H - h * 0.92); c.lineTo(bx + o + w, H); c.closePath(); c.fill(); });
      }
    });
    canvasTex(scene, k(3), W, H, c => {
      const r = seeded(217);
      c.fillStyle = '#4a3e30';
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) c.lineTo(x, 322 + r() * 18);
      c.lineTo(W, 330); c.lineTo(W, H); c.closePath(); c.fill();
    });
  } else if (region === 'rei') {
    // The Soul King Palace: gold-roofed halls on floating islands above a sea of cloud
    const hall = (c, x, y, w, col, roof) => {
      c.fillStyle = col; c.fillRect(x, y, w, 26);
      c.fillStyle = roof;
      c.beginPath(); c.moveTo(x - 10, y); c.lineTo(x + w / 2, y - 18); c.lineTo(x + w + 10, y); c.closePath(); c.fill();
      c.fillRect(x - 12, y - 1, w + 24, 3);
      c.fillStyle = 'rgba(0,0,0,0.18)'; for (let px = x + 4; px < x + w - 4; px += 8) c.fillRect(px, y + 6, 3, 20);
    };
    canvasTex(scene, k(0), W, H, c => {
      sky(c, [[0, '#f4d89a'], [0.45, '#f8ecd0'], [1, '#fcf8ee']]);
      glowDisc(c, 320, 60, 160, 'rgba(255,240,200,0.7)', 'rgba(255,240,200,0)');
      clouds(c, 8, 231, 'rgba(255,255,255,0.6)', 60, 200, 100, 220, 6);
    });
    canvasTex(scene, k(1), W, H, c => {
      const r = seeded(233);
      for (let i = 0; i < 4; i++) {
        const x = r() * W, y = 90 + r() * 80;
        tile(o => {
          c.fillStyle = 'rgba(200,180,140,0.5)';
          c.beginPath(); c.moveTo(x + o - 50, y + 26); c.lineTo(x + o + 90, y + 26); c.lineTo(x + o + 30, y + 70); c.closePath(); c.fill();
          hall(c, x + o - 20, y, 80, 'rgba(236,226,206,0.7)', 'rgba(210,170,80,0.7)');
        });
      }
    });
    canvasTex(scene, k(2), W, H, c => {
      clouds(c, 10, 237, 'rgba(255,255,255,0.85)', 230, 300, 140, 300, 12);
      const r = seeded(239);
      for (let i = 0; i < 2; i++) {
        const x = r() * W, y = 170 + r() * 40;
        tile(o => hall(c, x + o, y, 120, '#f0e8d6', '#d8a840'));
      }
    });
    canvasTex(scene, k(3), W, H, c => {
      clouds(c, 9, 241, 'rgba(255,255,255,0.95)', 320, 352, 160, 320, 16);
    });
  } else if (region === 'fkt') {
    // Fake Karakura Town: the replica in broad daylight, held up by four great white pillars at its corners
    const block = (c, x, w, h, col, win) => {
      c.fillStyle = col; c.fillRect(x, H - h, w, h);
      c.fillStyle = win;
      for (let wy = H - h + 5; wy < H - 6; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 6) c.fillRect(wx, wy, 3, 4);
    };
    const pillar = (c, x, w, top, col, shade) => {
      c.fillStyle = col; c.fillRect(x, top, w, H - top);
      c.fillStyle = shade; c.fillRect(x + w - 3, top, 3, H - top);
      for (let y = top + 18; y < H; y += 26) { c.fillStyle = shade; c.fillRect(x, y, w, 2); }
      c.fillStyle = col; c.fillRect(x - 3, top - 6, w + 6, 8);
    };
    canvasTex(scene, k(0), W, H, c => {
      sky(c, [[0, '#4a86c8'], [0.55, '#8ab8e8'], [1, '#d8e8f4']]);
      glowDisc(c, 150, 60, 120, 'rgba(255,250,230,0.45)', 'rgba(255,250,230,0)');
      clouds(c, 9, 301, 'rgba(255,255,255,0.7)', 40, 200, 120, 260, 7);
    });
    canvasTex(scene, k(1), W, H, c => {
      // the far replica, and two of the four pillars rising out of it
      const r = seeded(307);
      let x = 0;
      while (x < W) { const w = 24 + r() * 30, h = 60 + r() * 90, bx = x; tile(o => block(c, bx + o, w, h, 'rgba(150,170,196,0.6)', 'rgba(220,232,246,0.35)')); x += w + 2 + r() * 6; }
      tile(o => { pillar(c, 110 + o, 22, 40, 'rgba(232,236,244,0.85)', 'rgba(170,180,200,0.8)'); pillar(c, 470 + o, 22, 56, 'rgba(232,236,244,0.85)', 'rgba(170,180,200,0.8)'); });
    });
    canvasTex(scene, k(2), W, H, c => {
      const r = seeded(311);
      let x = 0;
      while (x < W) {
        const w = 40 + r() * 46, h = 70 + r() * 80, bx = x;
        tile(o => block(c, bx + o, w, h, '#5a6a84', 'rgba(200,220,240,0.55)'));
        x += w + 10 + r() * 24;
      }
      // a crack across the sky where a Garganta opened
      c.strokeStyle = 'rgba(10,10,16,0.7)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(380, 30); c.lineTo(395, 52); c.lineTo(388, 70); c.lineTo(402, 96); c.stroke();
    });
    canvasTex(scene, k(3), W, H, c => {
      // the street: walls, poles, wires
      const r = seeded(317);
      c.fillStyle = '#2e3442';
      let x = 0;
      while (x < W) { const w = 40 + r() * 60, h = 16 + r() * 18; c.fillRect(x, H - h, w, h); x += w + r() * 14; }
      c.fillStyle = '#262a36';
      for (let px = 60; px < W; px += 200) { c.fillRect(px, 150, 4, H - 150); c.fillRect(px - 10, 160, 24, 3); }
      c.strokeStyle = 'rgba(38,42,54,0.9)'; c.lineWidth = 1;
      c.beginPath(); for (let px = -140; px < W + 200; px += 200) { c.moveTo(px, 162); c.quadraticCurveTo(px + 100, 188, px + 200, 162); } c.stroke();
    });
  } else if (region === 'end') {
    // The Inner World: skyscrapers lying on their sides under a blue sky that never ends
    const slab = (c, x, y, w, h, col, win, frame) => {
      c.fillStyle = col; c.fillRect(x, y, w, h);
      c.fillStyle = win;
      for (let wx = x + 3; wx < x + w - 4; wx += 7) for (let wy = y + 3; wy < y + h - 3; wy += 6) c.fillRect(wx, wy, 5, 4);
      c.fillStyle = frame; c.fillRect(x, y, w, 1); c.fillRect(x, y + h - 1, w, 1);
    };
    canvasTex(scene, k(0), W, H, c => {
      sky(c, [[0, '#3e7ec4'], [0.5, '#7ab0e0'], [1, '#d4e6f4']]);
      clouds(c, 10, 91, 'rgba(255,255,255,0.6)', 30, 300, 80, 200, 9);
      clouds(c, 6, 93, 'rgba(255,255,255,0.3)', 60, 320, 160, 320, 6);
    });
    canvasTex(scene, k(1), W, H, c => {
      const r = seeded(97);
      for (let i = 0; i < 9; i++) {
        const y = 20 + i * 38 + r() * 14, w = 140 + r() * 220, h = 18 + r() * 14, fromLeft = i % 2 === 0;
        const x = fromLeft ? r() * W : r() * W - w;
        tile(o => slab(c, x + o, y, w, h, 'rgba(150,176,206,0.55)', 'rgba(220,234,248,0.4)', 'rgba(250,252,255,0.5)'));
      }
    });
    canvasTex(scene, k(2), W, H, c => {
      const r = seeded(101);
      for (let i = 0; i < 6; i++) {
        const y = 40 + i * 54 + r() * 18, w = 160 + r() * 200, h = 26 + r() * 16;
        const x = r() * W;
        tile(o => slab(c, x + o, y, w, h, '#6a8cb0', 'rgba(200,226,250,0.7)', '#e8f2fc'));
      }
    });
    canvasTex(scene, k(3), W, H, c => {
      const r = seeded(103);
      for (let i = 0; i < 3; i++) {
        const y = 290 + i * 26 + r() * 6, w = 200 + r() * 200, x = r() * W;
        tile(o => slab(c, x + o, y, w, 40, '#3e5a7e', 'rgba(150,190,230,0.55)', '#9ab8dc'));
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Menu and popup icons: a medallion (round for powers, a tablet for seals) with a kanji on it
const ICON_GLYPH = {
  dash: '瞬', hado: '破', grip: '握', bakudo: '縛', wings: '翼', getsuga: '牙', konso: '葬', burst: '門', bankai: '解', hollow: '虚',
  edge: '刃', swift: '速', harvest: '魂', focus: '集', quick: '癒', magnet: '磁', long: '長', grace: '恩', moonfang: '月', phantom: '蝉', will: '志',
  kaido: '回', bell: '鈴', shunko: '鬨', hierro: '鋼', gentei: '限', tesla: '雷', might: '力',
  raiko: '雷', recall: '憶', compass: '針',
  kidoPower: '威', kidoReach: '範', moonEdge: '弦', flow: '流', shunpoEdge: '瞬', maskHold: '仮', bankaiLast: '卍', burstDrive: '突',
  pride: '獅', shiba: '花', zangetsu: '斬', odachi: '大', kodachi: '小', soten: '舜', gikongan: '丸', petal: '華',
  unknown: '?',
};
function makeIcons(scene) {
  Object.keys(ICON_GLYPH).forEach(id => {
    const seal = !!SEALS[id], unknown = id === 'unknown';
    const hex = seal ? 0xd9b35a : unknown ? 0x5c5868 : (PICKUP_COLORS[id] || 0xffffff);
    const col = '#' + hex.toString(16).padStart(6, '0');
    canvasTex(scene, 'icon_' + id, 48, 48, c => {
      const g = c.createRadialGradient(24, 22, 3, 24, 24, 24);
      g.addColorStop(0, '#2c2936'); g.addColorStop(1, '#0d0c13');
      c.fillStyle = g; c.strokeStyle = col; c.lineWidth = 2.5;
      c.beginPath();
      if (seal) { c.moveTo(24, 2); c.lineTo(41, 9); c.lineTo(41, 33); c.lineTo(24, 46); c.lineTo(7, 33); c.lineTo(7, 9); c.closePath(); }
      else c.arc(24, 24, 21, 0, Math.PI * 2);
      c.fill(); c.stroke();
      c.globalAlpha = 0.35; c.lineWidth = 1; c.beginPath();
      if (seal) { c.moveTo(24, 6); c.lineTo(37, 11.5); c.lineTo(37, 31.5); c.lineTo(24, 41.5); c.lineTo(11, 31.5); c.lineTo(11, 11.5); c.closePath(); } else c.arc(24, 24, 17.5, 0, Math.PI * 2);
      c.stroke(); c.globalAlpha = 1;
      c.font = '800 25px ' + FONT_DISPLAY; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = col; c.shadowBlur = unknown ? 0 : 7;
      c.fillStyle = unknown ? '#6d687a' : '#f2ede2';
      c.fillText(ICON_GLYPH[id], 24, seal ? 24 : 25);
    });
  });
}

// Marks drawn over enemies, at twice the world resolution (shown at half scale, so crisp at 2x zoom):
// the bold attack warning, and the kanji medallion of each elite trait
function makeMarks(scene) {
  canvasTex(scene, 'warn_mark', 18, 26, c => {
    c.fillStyle = '#07070b'; c.beginPath(); c.moveTo(9, 0); c.lineTo(18, 13); c.lineTo(9, 26); c.lineTo(0, 13); c.closePath(); c.fill();
    c.fillStyle = '#ff3040'; c.beginPath(); c.moveTo(9, 2); c.lineTo(16, 13); c.lineTo(9, 24); c.lineTo(2, 13); c.closePath(); c.fill();
    c.fillStyle = '#ffffff'; c.fillRect(8, 6, 3, 9); c.fillRect(8, 17, 3, 3);
  });
  Object.entries(ELITE_TRAITS).forEach(([id, t]) => {
    const col = '#' + t.color.toString(16).padStart(6, '0');
    canvasTex(scene, 'elite_' + id, 26, 26, c => {
      c.fillStyle = 'rgba(7,7,11,0.85)'; c.beginPath(); c.arc(13, 13, 12, 0, Math.PI * 2); c.fill();
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(13, 13, 11, 0, Math.PI * 2); c.stroke();
      c.font = '800 15px ' + FONT_DISPLAY; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = col; c.fillText(t.jp, 13, 14);
    });
  });
}

function makeAllTextures(scene) {
  makeCharacterArt(scene);
  makeMarks(scene);

  // Effects
  canvasTex(scene, 'slash', 46, 34, c => {
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 8;
    c.beginPath(); c.arc(4, 17, 34, -1.0, 1.0); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 3;
    c.beginPath(); c.arc(4, 17, 36, -0.95, 0.95); c.stroke();
  });
  canvasTex(scene, 'slash_b', 46, 34, c => {
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(200,30,44,0.8)'; c.lineWidth = 9;
    c.beginPath(); c.arc(4, 17, 34, -1.0, 1.0); c.stroke();
    c.strokeStyle = 'rgba(10,8,12,0.95)'; c.lineWidth = 4;
    c.beginPath(); c.arc(4, 17, 35, -0.95, 0.95); c.stroke();
  });
  canvasTex(scene, 'wave', 22, 40, c => {
    c.fillStyle = 'rgba(200,30,44,0.85)';
    c.beginPath(); c.arc(0, 20, 21, -1.35, 1.35); c.arc(-6, 20, 18, 1.2, -1.2, true); c.closePath(); c.fill();
    c.fillStyle = '#0a080c';
    c.beginPath(); c.arc(0, 20, 18, -1.3, 1.3); c.arc(-6, 20, 16, 1.2, -1.2, true); c.closePath(); c.fill();
  });
  canvasTex(scene, 'wave_w', 22, 40, c => {
    c.fillStyle = 'rgba(150,170,255,0.6)';
    c.beginPath(); c.arc(0, 20, 21, -1.35, 1.35); c.arc(-6, 20, 18, 1.2, -1.2, true); c.closePath(); c.fill();
    c.fillStyle = '#f4f2ff';
    c.beginPath(); c.arc(0, 20, 18, -1.3, 1.3); c.arc(-6, 20, 16, 1.2, -1.2, true); c.closePath(); c.fill();
  });
  const orb = (key, size, inner, outer) => canvasTex(scene, key, size, size, c => {
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, inner); g.addColorStop(0.7, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, size, size);
  });
  orb('hado', 18, '#ff9a4a', 'rgba(220,40,40,0.8)');
  orb('bala', 12, '#ff6a8a', 'rgba(200,20,60,0.8)');
  orb('cero_orb', 26, '#ff8aa0', 'rgba(220,30,70,0.7)');
  orb('glow', 32, 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0.15)');
  orb('dot', 8, '#ffffff', 'rgba(255,255,255,0.4)');
  canvasTex(scene, 'px', 2, 2, c => { c.fillStyle = '#fff'; c.fillRect(0, 0, 2, 2); });
  canvasTex(scene, 'spark', 5, 5, c => { c.fillStyle = '#fff'; c.fillRect(2, 0, 1, 5); c.fillRect(0, 2, 5, 1); c.fillRect(1, 1, 3, 3); });
  canvasTex(scene, 'shock', 14, 20, c => {
    c.fillStyle = 'rgba(255,200,140,0.7)'; c.beginPath(); c.moveTo(0, 20); c.quadraticCurveTo(7, -4, 14, 20); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.moveTo(3, 20); c.quadraticCurveTo(7, 4, 11, 20); c.closePath(); c.fill();
  });
  canvasTex(scene, 'blade', 8, 48, c => {
    c.fillStyle = 'rgba(180,48,58,0.5)'; c.fillRect(0, 0, 8, 48);
    c.fillStyle = '#e8eef4'; c.beginPath(); c.moveTo(4, 48); c.lineTo(7, 12); c.lineTo(1, 12); c.closePath(); c.fill();
    c.fillStyle = '#c9a227'; c.fillRect(0, 9, 8, 3);
    c.fillStyle = '#17161f'; c.fillRect(3, 0, 2, 9);
  });
  canvasTex(scene, 'chain', 6, 4, c => { c.strokeStyle = '#ffd75e'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, 5, 3); });

  // Boss and enemy projectiles
  canvasTex(scene, 'petal', 4, 3, c => { c.fillStyle = '#ffe0ea'; c.fillRect(0, 1, 4, 1); c.fillRect(1, 0, 2, 3); });
  canvasTex(scene, 'needle', 12, 3, c => { c.fillStyle = '#e8e0d0'; c.fillRect(0, 1, 12, 1); c.fillStyle = '#ffffff'; c.fillRect(9, 0, 3, 3); });
  canvasTex(scene, 'acid', 10, 10, c => {
    const g = c.createRadialGradient(5, 5, 0, 5, 5, 5);
    g.addColorStop(0, '#f0ffd0'); g.addColorStop(0.4, '#9aff6a'); g.addColorStop(1, 'rgba(60,140,40,0)');
    c.fillStyle = g; c.fillRect(0, 0, 10, 10);
  });
  canvasTex(scene, 'kunai', 12, 4, c => { c.fillStyle = '#c8ced8'; c.beginPath(); c.moveTo(12, 2); c.lineTo(6, 0); c.lineTo(6, 4); c.closePath(); c.fill(); c.fillStyle = '#2a2834'; c.fillRect(0, 1, 6, 2); c.fillStyle = '#c8202c'; c.fillRect(0, 1, 1, 2); });
  canvasTex(scene, 'zabi', 12, 8, c => { c.fillStyle = '#c9d0d8'; c.beginPath(); c.moveTo(12, 4); c.lineTo(2, 0); c.lineTo(0, 4); c.lineTo(2, 8); c.closePath(); c.fill(); c.fillStyle = '#ffffff'; c.fillRect(4, 3, 7, 1); });
  canvasTex(scene, 'lanza', 44, 10, c => {
    const g = c.createLinearGradient(0, 0, 44, 0);
    g.addColorStop(0, 'rgba(58,232,138,0)'); g.addColorStop(0.3, 'rgba(58,232,138,0.8)'); g.addColorStop(1, '#e8fff0');
    c.fillStyle = g; c.beginPath(); c.moveTo(44, 5); c.lineTo(30, 1); c.lineTo(0, 4); c.lineTo(0, 6); c.lineTo(30, 9); c.closePath(); c.fill();
    c.fillStyle = '#ffffff'; c.fillRect(24, 4, 18, 2);
  });
  canvasTex(scene, 'giantblade', 14, 54, c => {
    c.fillStyle = 'rgba(255,144,184,0.35)'; c.fillRect(0, 0, 14, 54);
    c.fillStyle = '#f4f0f6'; c.beginPath(); c.moveTo(7, 0); c.lineTo(12, 14); c.lineTo(11, 54); c.lineTo(3, 54); c.lineTo(2, 14); c.closePath(); c.fill();
    c.fillStyle = '#ffd0e0'; c.fillRect(7, 6, 1, 48);
  });
  canvasTex(scene, 'thrownblade', 28, 28, c => {
    c.translate(14, 14); c.rotate(-0.6);
    c.fillStyle = '#1d1b25'; c.fillRect(-4, -12, 8, 20);
    c.fillStyle = '#6a6878'; c.fillRect(3, -12, 1, 20);
    c.fillStyle = '#15141b'; c.fillRect(-1, 8, 3, 6);
  });
  canvasTex(scene, 'waterwave', 20, 28, c => {
    c.fillStyle = 'rgba(74,180,255,0.55)'; c.beginPath(); c.moveTo(0, 28); c.quadraticCurveTo(4, 0, 20, 6); c.quadraticCurveTo(12, 10, 14, 28); c.closePath(); c.fill();
    c.fillStyle = 'rgba(220,240,255,0.9)'; c.beginPath(); c.moveTo(6, 28); c.quadraticCurveTo(8, 8, 18, 7); c.quadraticCurveTo(12, 12, 11, 28); c.closePath(); c.fill();
  });
  canvasTex(scene, 'getsuga_w', 30, 58, c => {
    c.fillStyle = 'rgba(20,18,26,0.9)';
    c.beginPath(); c.arc(0, 29, 30, -1.3, 1.3); c.arc(-9, 29, 26, 1.15, -1.15, true); c.closePath(); c.fill();
    c.fillStyle = '#f6f6fa';
    c.beginPath(); c.arc(0, 29, 26, -1.25, 1.25); c.arc(-8, 29, 23, 1.15, -1.15, true); c.closePath(); c.fill();
  });

  // Items & props
  canvasTex(scene, 'shard', 6, 9, c => {
    c.fillStyle = '#7fe8ff'; c.beginPath(); c.moveTo(3, 0); c.lineTo(6, 4); c.lineTo(3, 9); c.lineTo(0, 4); c.closePath(); c.fill();
    c.fillStyle = '#e8fcff'; c.fillRect(2, 2, 1, 3);
  });
  canvasTex(scene, 'fragment', 16, 16, c => {
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.arc(8, 8, 7, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#f4f1ea'; c.beginPath(); c.moveTo(4, 4); c.lineTo(12, 3); c.lineTo(11, 12); c.lineTo(6, 13); c.closePath(); c.fill();
    c.fillStyle = '#c8202c'; c.fillRect(8, 5, 1, 6);
  });
  canvasTex(scene, 'plus', 14, 22, c => {
    c.fillStyle = 'rgba(200,225,255,0.85)';
    c.beginPath(); c.arc(7, 5, 4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(2, 9); c.lineTo(12, 9); c.lineTo(13, 19); c.lineTo(10, 22); c.lineTo(7, 19); c.lineTo(4, 22); c.lineTo(1, 19); c.closePath(); c.fill();
    c.fillStyle = '#5a6070'; c.fillRect(6, 4, 1, 1); c.fillRect(8, 4, 1, 1);
    c.fillStyle = '#8a8a96'; for (let i = 0; i < 4; i++) c.fillRect(6, 11 + i * 2, 2, 1);
  });
  canvasTex(scene, 'npc', 14, 22, c => {
    c.fillStyle = '#8fa6c8'; c.beginPath(); c.arc(7, 5, 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5a6a88'; c.fillRect(3, 9, 8, 13);
    c.fillStyle = '#c8d4e8'; c.fillRect(4, 9, 6, 2);
    c.fillStyle = '#1a1a24'; c.fillRect(8, 4, 1, 1);
    c.fillStyle = '#9a9aa8'; c.fillRect(6, 13, 2, 1); c.fillRect(6, 15, 2, 1);
  });
  canvasTex(scene, 'shop', 20, 28, c => {
    c.fillStyle = '#2f4a36'; c.fillRect(4, 10, 12, 16);
    c.fillStyle = '#e9c9a0'; c.fillRect(6, 6, 8, 5);
    c.fillStyle = '#1a1a1a'; c.fillRect(11, 8, 1, 1);
    c.fillStyle = '#e4e2d6'; c.fillRect(3, 2, 14, 4); c.fillRect(1, 5, 18, 2);
    c.fillStyle = '#3a6a44'; for (let x = 4; x < 17; x += 3) c.fillRect(x, 2, 1, 4);
    c.fillStyle = '#8a6a3a'; c.fillRect(17, 12, 1, 15);
    c.fillStyle = '#1a1a1a'; c.fillRect(5, 26, 4, 2); c.fillRect(11, 26, 4, 2);
  });
  canvasTex(scene, 'stall', 30, 28, c => {
    c.fillStyle = '#3a2a1e'; c.fillRect(2, 8, 2, 20); c.fillRect(26, 8, 2, 20);
    for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#3a6a44' : '#ecebe2'; c.fillRect(i * 5, 2, 5, 6); }
    c.fillStyle = '#2a4a30'; c.fillRect(0, 7, 30, 1);
    c.fillStyle = '#6a4a30'; c.fillRect(1, 18, 28, 3);
    c.fillStyle = '#8a6a44'; c.fillRect(1, 18, 28, 1);
    c.fillStyle = '#4a3424'; c.fillRect(3, 21, 24, 7);
    [['#7fe8ff', 6], ['#ffd75e', 12], ['#c8a8ff', 18], ['#ff9a7a', 23]].forEach(([col, x]) => {
      c.fillStyle = 'rgba(240,240,250,0.8)'; c.fillRect(x - 1, 13, 4, 5);
      c.fillStyle = col; c.fillRect(x, 15, 2, 3);
    });
  });
  canvasTex(scene, 'brush', 420, 64, c => {
    const r = seeded(77);
    for (let i = 0; i < 26; i++) {
      const y = 14 + r() * 36, h = 5 + r() * 10, x0 = r() * 24, x1 = 380 + r() * 36;
      c.fillStyle = `rgba(200,40,52,${(0.28 + r() * 0.4).toFixed(2)})`;
      c.beginPath(); c.moveTo(x0, y); c.quadraticCurveTo(210, y - 6 + r() * 12, x1, y + r() * 6 - 3);
      c.lineTo(x1 - 6, y + h); c.quadraticCurveTo(210, y + h + r() * 8, x0 + 10, y + h); c.closePath(); c.fill();
    }
    c.fillStyle = 'rgba(160,20,32,0.5)';
    for (let i = 0; i < 40; i++) c.fillRect(380 + r() * 40, 16 + r() * 34, 2 + r() * 4, 1 + r() * 2);
  });
  canvasTex(scene, 'ore', 14, 14, c => {
    c.fillStyle = '#4a3a6a'; c.fillRect(2, 10, 10, 4);
    [[3, 11, 4, '#9a7aff'], [7, 12, 3, '#7fe8ff'], [10, 11, 3, '#c8a8ff']].forEach(([x, y, h, col]) => {
      c.fillStyle = col; c.beginPath(); c.moveTo(x - 1.5, y); c.lineTo(x, y - h * 2.2); c.lineTo(x + 1.5, y); c.closePath(); c.fill();
    });
    c.fillStyle = '#ffffff'; c.fillRect(7, 5, 1, 2);
  });
  canvasTex(scene, 'anvil', 22, 14, c => {
    c.fillStyle = '#3a3a44'; c.fillRect(2, 2, 18, 4); c.fillRect(0, 2, 4, 2);
    c.fillStyle = '#5a5a66'; c.fillRect(2, 2, 18, 1);
    c.fillStyle = '#2a2a32'; c.fillRect(7, 6, 8, 4); c.fillRect(4, 10, 14, 4);
    c.fillStyle = '#ff9a4a'; c.fillRect(9, 1, 3, 1);
  });
  canvasTex(scene, 'portal', 44, 62, c => {
    const g = c.createRadialGradient(22, 34, 2, 22, 34, 28);
    g.addColorStop(0, 'rgba(230,210,255,0.9)'); g.addColorStop(0.5, 'rgba(150,110,230,0.45)'); g.addColorStop(1, 'rgba(120,80,200,0)');
    c.fillStyle = g; c.fillRect(0, 4, 44, 58);
    c.fillStyle = '#3a2418'; c.fillRect(6, 10, 4, 52); c.fillRect(34, 10, 4, 52);
    c.fillStyle = '#5a3424'; c.fillRect(2, 6, 40, 4); c.fillRect(4, 14, 36, 3);
    c.fillStyle = '#2a1810'; c.fillRect(0, 4, 4, 2); c.fillRect(40, 4, 4, 2);
    c.fillStyle = 'rgba(240,232,214,0.55)'; c.fillRect(11, 18, 9, 42); c.fillRect(24, 18, 9, 42);
    c.fillStyle = 'rgba(120,90,180,0.6)'; c.fillRect(20, 18, 4, 42);
  });
  canvasTex(scene, 'kototsu', 160, 368, c => {
    const g = c.createLinearGradient(0, 0, 160, 0);
    g.addColorStop(0, 'rgba(200,180,255,0)'); g.addColorStop(0.6, 'rgba(210,190,255,0.55)'); g.addColorStop(0.92, 'rgba(245,240,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = g; c.fillRect(0, 0, 160, 368);
    const r = seeded(91);
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,255,255,${(0.1 + r() * 0.4).toFixed(2)})`; c.fillRect(60 + r() * 100, 0, 1 + r() * 2, 368); }
  });
  canvasTex(scene, 'getsuga', 30, 58, c => {
    c.fillStyle = 'rgba(140,190,255,0.5)';
    c.beginPath(); c.arc(0, 29, 30, -1.3, 1.3); c.arc(-9, 29, 26, 1.15, -1.15, true); c.closePath(); c.fill();
    c.fillStyle = '#f2f8ff';
    c.beginPath(); c.arc(0, 29, 26, -1.25, 1.25); c.arc(-8, 29, 23, 1.15, -1.15, true); c.closePath(); c.fill();
  });
  canvasTex(scene, 'getsuga_b', 30, 58, c => {
    c.fillStyle = 'rgba(220,40,56,0.85)';
    c.beginPath(); c.arc(0, 29, 30, -1.3, 1.3); c.arc(-9, 29, 26, 1.15, -1.15, true); c.closePath(); c.fill();
    c.fillStyle = '#0a080c';
    c.beginPath(); c.arc(0, 29, 26, -1.25, 1.25); c.arc(-8, 29, 23, 1.15, -1.15, true); c.closePath(); c.fill();
  });
  // A stone lantern (tōrō); the lit one glows from inside
  [['lantern_off', false], ['lantern_on', true]].forEach(([key, lit]) => canvasTex(scene, key, 14, 26, c => {
    c.fillStyle = '#6a6458'; c.fillRect(4, 18, 6, 8); c.fillRect(2, 24, 10, 2);
    c.fillStyle = '#8a8474'; c.fillRect(1, 6, 12, 2); c.fillRect(3, 8, 8, 9); c.fillRect(0, 16, 14, 2);
    c.beginPath(); c.moveTo(0, 6); c.lineTo(7, 0); c.lineTo(14, 6); c.closePath(); c.fill();
    c.fillStyle = lit ? '#ffd870' : '#1a1820'; c.fillRect(5, 10, 4, 5);
    if (lit) { c.fillStyle = '#ffffff'; c.fillRect(6, 11, 2, 2); }
  }));
  // The altar of the trials: a gold-capped stone with the Soul King's crest
  canvasTex(scene, 'altar', 30, 34, c => {
    c.fillStyle = '#c8bea4'; c.fillRect(3, 12, 24, 20); c.fillRect(0, 30, 30, 4);
    c.fillStyle = '#e8c46a'; c.fillRect(1, 9, 28, 4); c.fillRect(5, 4, 20, 5);
    c.fillStyle = '#f4f0e4'; c.fillRect(5, 14, 20, 14);
    c.strokeStyle = '#c89a3a'; c.lineWidth = 1.5; c.beginPath(); c.arc(15, 21, 5, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#c89a3a'; c.fillRect(14, 14, 2, 14);
  });
  // A rope ladder up to the shop
  canvasTex(scene, 'ladder', 14, 64, c => {
    c.fillStyle = '#8a6a4a'; c.fillRect(1, 0, 2, 64); c.fillRect(11, 0, 2, 64);
    c.fillStyle = '#b89470'; for (let y = 4; y < 64; y += 8) c.fillRect(1, y, 12, 2);
  });
  // A spirit of Orihime's hairpin: a small pale flower with a glow
  canvasTex(scene, 'petal', 14, 14, c => {
    c.fillStyle = '#ffd0e4';
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.beginPath(); c.ellipse(7 + Math.cos(a) * 3.5, 7 + Math.sin(a) * 3.5, 2.6, 1.6, a, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#7ab4ff'; c.fillRect(6, 6, 2, 2);
  });
  // Kon's spare Gikongan: a green pill
  canvasTex(scene, 'gikongan', 12, 12, c => {
    c.fillStyle = '#3ac86a'; c.beginPath(); c.arc(6, 6, 4.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#9af0b0'; c.fillRect(4, 3, 2, 2);
  });
  canvasTex(scene, 'restgate', 36, 52, c => {
    c.fillStyle = 'rgba(255,240,200,0.12)'; c.fillRect(6, 10, 24, 42);
    c.fillStyle = '#3a2418'; c.fillRect(4, 8, 4, 44); c.fillRect(28, 8, 4, 44);
    c.fillStyle = '#5a3424'; c.fillRect(0, 4, 36, 4); c.fillRect(2, 12, 32, 3);
    c.fillStyle = '#2a1810'; c.fillRect(0, 2, 4, 2); c.fillRect(32, 2, 4, 2);
    c.fillStyle = '#efe8d6'; c.fillRect(9, 16, 8, 34); c.fillRect(19, 16, 8, 34);
    c.fillStyle = 'rgba(120,100,80,0.5)';
    for (let y = 22; y < 50; y += 7) { c.fillRect(9, y, 8, 1); c.fillRect(19, y, 8, 1); }
    c.fillRect(13, 16, 1, 34); c.fillRect(23, 16, 1, 34);
  });
  canvasTex(scene, 'pickup', 22, 22, c => {
    const g = c.createRadialGradient(11, 11, 0, 11, 11, 11);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 22, 22);
    c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.beginPath(); c.moveTo(11, 3); c.lineTo(19, 11); c.lineTo(11, 19); c.lineTo(3, 11); c.closePath(); c.stroke();
  });
  canvasTex(scene, 'sealitem', 14, 14, c => {
    c.strokeStyle = '#d9b33a'; c.lineWidth = 2; c.beginPath(); c.arc(7, 7, 5, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#d9b33a'; c.fillRect(6, 0, 2, 3); c.fillRect(6, 11, 2, 3); c.fillRect(0, 6, 3, 2); c.fillRect(11, 6, 3, 2);
    c.fillStyle = '#fff3c0'; c.fillRect(5, 4, 1, 1);
  });
  canvasTex(scene, 'shade', 18, 24, c => {
    c.fillStyle = 'rgba(20,16,30,0.9)';
    c.beginPath(); c.arc(9, 8, 7, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(2, 9); c.lineTo(16, 9); c.lineTo(14, 24); c.lineTo(9, 19); c.lineTo(4, 24); c.closePath(); c.fill();
    c.fillStyle = '#ffffff'; c.fillRect(6, 7, 2, 3); c.fillRect(11, 7, 2, 3);
  });
  canvasTex(scene, 'mplat', 48, 10, c => {
    c.fillStyle = '#d8d2c0'; c.fillRect(0, 0, 48, 7);
    c.fillStyle = '#fff8e0'; c.fillRect(0, 0, 48, 1);
    c.fillStyle = '#8a8478'; c.fillRect(0, 7, 48, 3);
    c.fillStyle = '#c9a227'; c.fillRect(22, 2, 4, 3);
  });
  canvasTex(scene, 'butterfly', 8, 6, c => {
    c.fillStyle = '#0a0a10'; c.fillRect(0, 0, 3, 4); c.fillRect(5, 0, 3, 4); c.fillRect(1, 4, 2, 2); c.fillRect(5, 4, 2, 2);
    c.fillStyle = '#b4303a'; c.fillRect(1, 1, 1, 1); c.fillRect(6, 1, 1, 1);
    c.fillStyle = '#0a0a10'; c.fillRect(3, 1, 2, 4);
  });

  // Overlays
  canvasTex(scene, 'darkness', 700, 400, c => {
    const g = c.createRadialGradient(350, 200, 30, 350, 200, 330);
    g.addColorStop(0, 'rgba(2,2,8,0)'); g.addColorStop(0.3, 'rgba(2,2,8,0.35)'); g.addColorStop(0.75, 'rgba(2,2,8,0.85)'); g.addColorStop(1, 'rgba(2,2,8,0.97)');
    c.fillStyle = g; c.fillRect(0, 0, 700, 400);
  });
  canvasTex(scene, 'vignette', 640, 360, c => {
    const g = c.createRadialGradient(320, 180, 110, 320, 180, 380);
    g.addColorStop(0, 'rgba(160,0,10,0)'); g.addColorStop(1, 'rgba(160,0,10,1)');
    c.fillStyle = g; c.fillRect(0, 0, 640, 360);
  });

  // UI icons (drawn 1:1 in the UI layer)
  canvasTex(scene, 'ui_mask', 26, 30, c => {
    c.fillStyle = '#f4f1ea';
    c.beginPath(); c.moveTo(13, 1); c.quadraticCurveTo(26, 2, 24, 16); c.quadraticCurveTo(22, 27, 13, 29); c.quadraticCurveTo(4, 27, 2, 16); c.quadraticCurveTo(0, 2, 13, 1); c.fill();
    c.fillStyle = '#17161f'; c.beginPath(); c.ellipse(8.5, 13, 3, 2.4, -0.2, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(17.5, 13, 3, 2.4, 0.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c8202c'; c.fillRect(12, 4, 2, 6);
  });
  canvasTex(scene, 'ui_mask_empty', 26, 30, c => {
    c.strokeStyle = 'rgba(244,241,234,0.35)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(13, 2); c.quadraticCurveTo(25, 3, 23, 16); c.quadraticCurveTo(21, 26, 13, 28); c.quadraticCurveTo(5, 26, 3, 16); c.quadraticCurveTo(1, 3, 13, 2); c.stroke();
  });
  canvasTex(scene, 'ui_shard', 14, 20, c => {
    c.fillStyle = '#7fe8ff'; c.beginPath(); c.moveTo(7, 0); c.lineTo(14, 9); c.lineTo(7, 20); c.lineTo(0, 9); c.closePath(); c.fill();
    c.fillStyle = '#e8fcff'; c.fillRect(5, 4, 2, 7);
  });

  makeIcons(scene);
  makeUiArt(scene);

  // A floor vent for the reishi geysers
  canvasTex(scene, 'vent', 18, 5, c => {
    c.fillStyle = '#17161f'; c.fillRect(0, 1, 18, 4);
    c.fillStyle = '#3a3846'; c.fillRect(0, 0, 18, 1);
    c.fillStyle = '#08070c'; for (let x = 2; x < 16; x += 3) c.fillRect(x, 2, 2, 2);
  });
  // A hanging stalactite, point down
  canvasTex(scene, 'rock', 12, 20, c => {
    c.fillStyle = '#8a8494'; c.beginPath(); c.moveTo(0, 0); c.lineTo(12, 0); c.lineTo(8, 11); c.lineTo(6, 20); c.lineTo(4, 11); c.closePath(); c.fill();
    c.fillStyle = '#5c5868'; c.beginPath(); c.moveTo(6, 0); c.lineTo(12, 0); c.lineTo(8, 11); c.lineTo(6, 20); c.closePath(); c.fill();
    c.fillStyle = '#b8b2c4'; c.fillRect(2, 1, 2, 5);
  });

  // A soft vertical bar of light (Seireitei shafts): bright in the middle, fading at the sides and the bottom
  canvasTex(scene, 'shaft', 48, 220, c => {
    const h = c.createLinearGradient(0, 0, 48, 0);
    h.addColorStop(0, 'rgba(255,255,255,0)'); h.addColorStop(0.5, 'rgba(255,255,255,1)'); h.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = h; c.fillRect(0, 0, 48, 220);
    c.globalCompositeOperation = 'destination-in';
    const v = c.createLinearGradient(0, 0, 0, 220);
    v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.55, 'rgba(0,0,0,0.6)'); v.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = v; c.fillRect(0, 0, 48, 220);
    c.globalCompositeOperation = 'source-over';
  });
  // A fan of five feathers hinged at the lower right (drawn left-facing; flipped for the right wing)
  canvasTex(scene, 'wing', 36, 26, c => {
    const hx = 34, hy = 20;
    for (let i = 4; i >= 0; i--) {
      const a = Math.PI + 0.12 + i * 0.27, len = 31 - i * 2.2;
      c.save(); c.translate(hx, hy); c.rotate(a);
      c.fillStyle = `rgba(255,255,255,${(0.95 - i * 0.12).toFixed(2)})`;
      c.beginPath(); c.ellipse(len / 2, 0, len / 2, 2.6, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  });

  Object.keys(TILE_PAL).forEach(r => { makeTileset(scene, r); makeBackgrounds(scene, r); });
}

// ---------------------------------------------------------------------------
// UI brushwork: strokes drawn in white so the HUD can tint them (ink, crimson, gold)
function makeUiArt(scene) {
  // a dry horizontal brush stroke: thick at the start, frayed at the end
  canvasTex(scene, 'ui_stroke', 512, 64, c => {
    const r = seeded(201);
    for (let i = 0; i < 34; i++) {
      const y = 12 + r() * 40, h = 3 + r() * 9, x0 = r() * 20, x1 = 420 + r() * 80;
      c.fillStyle = `rgba(255,255,255,${(0.18 + r() * 0.5).toFixed(2)})`;
      c.beginPath(); c.moveTo(x0, y); c.quadraticCurveTo(256, y - 5 + r() * 10, x1, y + r() * 6 - 3);
      c.lineTo(x1 - 8, y + h); c.quadraticCurveTo(256, y + h + r() * 6, x0 + 12, y + h); c.closePath(); c.fill();
    }
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,255,${(0.2 + r() * 0.5).toFixed(2)})`; c.fillRect(440 + r() * 70, 14 + r() * 36, 2 + r() * 5, 1 + r() * 2); }
  });
  // a soft ink pool for the HUD to sit on
  canvasTex(scene, 'ui_ink', 460, 150, c => {
    const g = c.createRadialGradient(120, 75, 10, 160, 75, 260);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.55, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(170, 75, 240, 62, -0.04, 0, Math.PI * 2); c.fill();
    const r = seeded(207);
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,255,255,${(r() * 0.25).toFixed(2)})`; c.beginPath(); c.arc(40 + r() * 380, 30 + r() * 90, 2 + r() * 10, 0, Math.PI * 2); c.fill(); }
  });
  // a brushed ring for the Reiatsu vessel
  canvasTex(scene, 'ui_ring', 128, 128, c => {
    const r = seeded(211);
    c.translate(64, 64);
    for (let i = 0; i < 26; i++) {
      const a0 = r() * Math.PI * 2, len = 0.8 + r() * 2.2, rad = 52 + r() * 6, w = 1.5 + r() * 3.5;
      c.strokeStyle = `rgba(255,255,255,${(0.35 + r() * 0.6).toFixed(2)})`; c.lineWidth = w; c.lineCap = 'round';
      c.beginPath(); c.arc(0, 0, rad, a0, a0 + len); c.stroke();
    }
  });
  // a small brushed frame corner for menus and the boss bar
  canvasTex(scene, 'ui_cap', 32, 32, c => {
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(16, 0); c.lineTo(32, 16); c.lineTo(16, 32); c.lineTo(0, 16); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.beginPath(); c.moveTo(16, 8); c.lineTo(24, 16); c.lineTo(16, 24); c.lineTo(8, 16); c.closePath(); c.fill();
  });
  canvasTex(scene, 'ui_ore', 14, 14, c => {
    [[3, 13, 4, '#9a7aff'], [7, 13, 5, '#7fe8ff'], [11, 13, 3, '#c8a8ff']].forEach(([x, y, h, col]) => {
      c.fillStyle = col; c.beginPath(); c.moveTo(x - 2, y); c.lineTo(x, y - h * 2.4); c.lineTo(x + 2, y); c.closePath(); c.fill();
    });
  });
}
