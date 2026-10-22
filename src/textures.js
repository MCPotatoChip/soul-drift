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
  end: { base: '#1e2636', mid: '#273044', dark: '#141a26', top: '#8fb4d8', line: '#334058', spike: '#c8e8ff', plank: '#3a4a66', plankHi: '#6a86ac' },
  dan: { base: '#281f3c', mid: '#32284c', dark: '#18122a', top: '#b49ae8', line: '#3e3260', spike: '#e6d8ff', plank: '#5a4a8a', plankHi: '#9a84d8' },
  for: { base: '#1d1a25', mid: '#25202f', dark: '#110f18', top: '#52705f', line: '#2b2537', spike: '#ece8f4', plank: '#cfcbe0', plankHi: '#ffffff' },
};

function makeTileset(scene, region) {
  const p = TILE_PAL[region];
  const N = 11;
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
      } else if (region === 'end') {
        c.fillStyle = p.mid; c.fillRect(ox + 1, 1, 14, 14);
        c.fillStyle = p.line; c.fillRect(ox + 2, 2, 1, 1); c.fillRect(ox + 13, 2, 1, 1); c.fillRect(ox + 2, 13, 1, 1); c.fillRect(ox + 13, 13, 1, 1);
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
  });
}

// ---------------------------------------------------------------------------
// Backgrounds: three 640x360 layers per region (sky, far, near), tiling in x
// ---------------------------------------------------------------------------
function makeBackgrounds(scene, region) {
  const W = VIEW_W, H = VIEW_H;
  const grad = (c, stops) => {
    const g = c.createLinearGradient(0, 0, 0, H);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  };
  const stars = (c, n, seed, alpha = 0.8) => {
    const r = seeded(seed);
    for (let i = 0; i < n; i++) {
      c.fillStyle = `rgba(255,255,255,${(0.2 + r() * alpha).toFixed(2)})`;
      c.fillRect(Math.floor(r() * W), Math.floor(r() * H * 0.7), 1, 1);
    }
  };
  const wrap = (fn) => { fn(0); fn(-W); fn(W); };
  const k = (n) => 'bg_' + region + '_' + n;

  if (region === 'kar') {
    canvasTex(scene, k(0), W, H, c => {
      grad(c, [[0, '#121330'], [0.55, '#3c2c5e'], [0.85, '#9a5574'], [1, '#c8786e']]);
      stars(c, 90, 3);
      c.fillStyle = '#f3e9d2'; c.beginPath(); c.arc(470, 70, 22, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(243,233,210,0.08)'; c.beginPath(); c.arc(470, 70, 40, 0, Math.PI * 2); c.fill();
    });
    canvasTex(scene, k(1), W, H, c => {
      const r = seeded(11);
      let x = 0;
      while (x < W) {
        const w = 26 + Math.floor(r() * 40), h = 90 + Math.floor(r() * 140);
        const bx = x;
        wrap(o => {
          c.fillStyle = '#25223f'; c.fillRect(bx + o, H - h, w, h);
        });
        const r2 = seeded(bx * 7 + 1);
        for (let wy = H - h + 8; wy < H - 10; wy += 9) for (let wx = bx + 4; wx < bx + w - 4; wx += 7) {
          if (r2() < 0.28) { c.fillStyle = r2() < 0.8 ? 'rgba(255,207,107,0.55)' : 'rgba(150,200,255,0.5)'; c.fillRect(wx, wy, 3, 4); }
        }
        x += w + 4 + Math.floor(r() * 10);
      }
    });
    canvasTex(scene, k(2), W, H, c => {
      c.fillStyle = '#121226';
      for (let px = 40; px < W; px += 200) {
        c.fillRect(px, 150, 4, H - 150); c.fillRect(px - 12, 160, 28, 3);
      }
      c.strokeStyle = 'rgba(18,18,38,0.9)'; c.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        c.beginPath();
        for (let px = 40 - 200; px < W + 200; px += 200) { c.moveTo(px - 10, 162 + i * 3); c.quadraticCurveTo(px + 90, 190 + i * 3, px + 190, 162 + i * 3); }
        c.stroke();
      }
      const r = seeded(5);
      let x = 0;
      while (x < W) { const w = 50 + r() * 60, h = 40 + r() * 50; c.fillRect(x, H - h, w, h); x += w + 20 + r() * 30; }
    });
  } else if (region === 'ruk') {
    canvasTex(scene, k(0), W, H, c => {
      grad(c, [[0, '#3a2a3e'], [0.5, '#a65a44'], [0.85, '#e5a868'], [1, '#f0c890']]);
      c.fillStyle = 'rgba(255,220,160,0.55)'; c.beginPath(); c.arc(180, 210, 46, 0, Math.PI * 2); c.fill();
    });
    canvasTex(scene, k(1), W, H, c => {
      c.fillStyle = '#6a4636';
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) c.lineTo(x, 250 + Math.sin(x / W * Math.PI * 4) * 22 + Math.sin(x / W * Math.PI * 10) * 6);
      c.lineTo(W, H); c.closePath(); c.fill();
    });
    canvasTex(scene, k(2), W, H, c => {
      const r = seeded(21);
      let x = 0;
      while (x < W) {
        const w = 40 + r() * 40, h = 30 + r() * 30, bx = x;
        wrap(o => {
          c.fillStyle = '#2c1f19'; c.fillRect(bx + o, H - h, w, h);
          c.beginPath(); c.moveTo(bx + o - 6, H - h); c.lineTo(bx + o + w * 0.4, H - h - 18); c.lineTo(bx + o + w + 6, H - h + 4); c.closePath(); c.fill();
        });
        x += w + 30 + r() * 50;
      }
    });
  } else if (region === 'sei') {
    canvasTex(scene, k(0), W, H, c => { grad(c, [[0, '#6f95b8'], [0.7, '#c8d6dc'], [1, '#ece6d6']]); });
    canvasTex(scene, k(1), W, H, c => {
      const r = seeded(31);
      for (let i = 0; i < 6; i++) {
        const bx = 30 + i * 105 + r() * 30, w = 30 + r() * 20, h = 140 + r() * 90;
        wrap(o => {
          c.fillStyle = '#e4dfd1'; c.fillRect(bx + o, H - h, w, h);
          c.fillStyle = '#3d5a64';
          for (let t = 0; t < 3; t++) {
            const ty = H - h + t * 40;
            c.beginPath(); c.moveTo(bx + o - 10, ty + 10); c.lineTo(bx + o + w / 2, ty - 6); c.lineTo(bx + o + w + 10, ty + 10); c.closePath(); c.fill();
          }
          c.fillStyle = 'rgba(60,70,80,0.3)'; c.fillRect(bx + o + w / 2 - 3, H - h + 50, 6, 8);
        });
      }
    });
    canvasTex(scene, k(2), W, H, c => {
      c.fillStyle = '#d6d0c0'; c.fillRect(0, 270, W, H - 270);
      c.fillStyle = '#4a4a4e'; c.fillRect(0, 262, W, 9);
      c.fillStyle = '#b8b2a2'; for (let x = 0; x < W; x += 64) c.fillRect(x, 271, 2, H - 271);
    });
  } else if (region === 'sok') {
    canvasTex(scene, k(0), W, H, c => {
      grad(c, [[0, '#24101a'], [0.5, '#7a2430'], [0.85, '#d8664a'], [1, '#f0a070']]);
      c.fillStyle = 'rgba(255,190,130,0.85)'; c.beginPath(); c.arc(420, 250, 60, 0, Math.PI * 2); c.fill();
    });
    canvasTex(scene, k(1), W, H, c => {
      c.fillStyle = '#3a1820';
      c.beginPath(); c.moveTo(0, H); c.lineTo(0, 260); c.quadraticCurveTo(240, 120, 420, 150); c.quadraticCurveTo(560, 170, W, 250); c.lineTo(W, H); c.closePath(); c.fill();
      // execution frame on the hilltop
      c.fillStyle = '#2a1016';
      c.fillRect(330, 40, 8, 120); c.fillRect(300, 50, 70, 7); c.fillRect(306, 70, 58, 4);
      c.fillRect(312, 40, 4, 30); c.fillRect(352, 40, 4, 30);
    });
    canvasTex(scene, k(2), W, H, c => {
      const r = seeded(41);
      c.fillStyle = '#1c0d10';
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W; x += 16) c.lineTo(x, 300 + r() * 30);
      c.lineTo(W, 315); c.lineTo(W, H); c.closePath(); c.fill();
    });
  } else if (region === 'hm') {
    canvasTex(scene, k(0), W, H, c => {
      grad(c, [[0, '#030308'], [0.75, '#0e0e1e'], [1, '#1a1a30']]);
      stars(c, 160, 7, 0.6);
      c.fillStyle = '#f2f0e6'; c.beginPath(); c.arc(500, 80, 38, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath(); c.arc(486, 70, 36, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'source-over';
    });
    canvasTex(scene, k(1), W, H, c => {
      c.fillStyle = '#4a4860';
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) c.lineTo(x, 280 + Math.sin(x / W * Math.PI * 2) * 18 + Math.sin(x / W * Math.PI * 6) * 8);
      c.lineTo(W, H); c.closePath(); c.fill();
      // distant dome palace
      c.fillStyle = '#2c2a3c';
      c.beginPath(); c.arc(150, 270, 60, Math.PI, 0); c.fill();
      c.fillRect(110, 190, 6, 50); c.fillRect(186, 200, 6, 40);
    });
    canvasTex(scene, k(2), W, H, c => {
      c.strokeStyle = '#cfcbe0'; c.lineCap = 'round';
      const tree = (x, s) => {
        c.lineWidth = 3 * s; c.beginPath(); c.moveTo(x, H); c.lineTo(x + 4, H - 90 * s); c.stroke();
        c.lineWidth = 2 * s;
        c.beginPath(); c.moveTo(x + 2, H - 50 * s); c.lineTo(x - 22 * s, H - 80 * s); c.stroke();
        c.beginPath(); c.moveTo(x + 3, H - 70 * s); c.lineTo(x + 28 * s, H - 104 * s); c.stroke();
        c.lineWidth = 1; c.beginPath(); c.moveTo(x - 12 * s, H - 66 * s); c.lineTo(x - 18 * s, H - 92 * s); c.stroke();
      };
      tree(90, 1); tree(380, 0.8); tree(560, 1.15);
    });
  } else if (region === 'dan') {
    const strands = (c, n, seed, col, wMin, wMax, amp) => {
      const r = seeded(seed);
      for (let i = 0; i < n; i++) {
        const x0 = r() * W, w = wMin + r() * (wMax - wMin), ph = r() * 6, freq = 2 + r() * 3;
        c.fillStyle = col;
        wrap(o => {
          c.beginPath();
          for (let y = 0; y <= H; y += 6) c.lineTo(x0 + o + Math.sin(y / H * Math.PI * freq + ph) * amp, y);
          for (let y = H; y >= 0; y -= 6) c.lineTo(x0 + o + w + Math.sin(y / H * Math.PI * freq + ph + 0.6) * amp, y);
          c.closePath(); c.fill();
        });
      }
    };
    canvasTex(scene, k(0), W, H, c => { grad(c, [[0, '#0a0614'], [0.5, '#1a0e2e'], [1, '#2a1442']]); stars(c, 60, 23, 0.4); });
    canvasTex(scene, k(1), W, H, c => strands(c, 9, 31, 'rgba(150,110,220,0.16)', 18, 46, 22));
    canvasTex(scene, k(2), W, H, c => {
      strands(c, 6, 37, 'rgba(70,40,120,0.55)', 8, 20, 14);
      const r = seeded(41);
      for (let i = 0; i < 18; i++) { c.fillStyle = `rgba(220,200,255,${(0.1 + r() * 0.3).toFixed(2)})`; c.fillRect(r() * W, r() * H, 2, 2); }
    });
  } else if (region === 'for') {
    canvasTex(scene, k(0), W, H, c => {
      grad(c, [[0, '#0d1216'], [0.4, '#070a0e'], [1, '#05060a']]);
      const g = c.createLinearGradient(0, 0, 0, 90);
      g.addColorStop(0, 'rgba(200,210,230,0.18)'); g.addColorStop(1, 'rgba(200,210,230,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, 90);
    });
    canvasTex(scene, k(1), W, H, c => {
      const r = seeded(51);
      // distant Menos silhouettes among the trunks
      for (let i = 0; i < 5; i++) {
        const x = 40 + i * 130 + r() * 40, top = 150 + r() * 60;
        wrap(o => {
          c.fillStyle = '#0c0b12'; c.beginPath(); c.moveTo(x + o, top); c.lineTo(x + o + 26, H); c.lineTo(x + o - 26, H); c.closePath(); c.fill();
          c.fillStyle = 'rgba(220,214,200,0.5)'; c.beginPath(); c.ellipse(x + o + 3, top + 4, 6, 7, 0, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.moveTo(x + o + 6, top + 2); c.lineTo(x + o + 22, top + 7); c.lineTo(x + o + 6, top + 9); c.closePath(); c.fill();
        });
      }
      c.fillStyle = 'rgba(190,186,206,0.22)';
      for (let i = 0; i < 6; i++) { const x = r() * W; wrap(o => c.fillRect(x + o, 0, 10 + r() * 8, H)); }
    });
    canvasTex(scene, k(2), W, H, c => {
      const trunk = (x, w) => {
        c.fillStyle = '#d8d4e4'; c.fillRect(x, 0, w, H);
        c.fillStyle = '#a8a4b8'; c.fillRect(x + w - 3, 0, 3, H);
        c.strokeStyle = '#d8d4e4'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(x + w, 120); c.lineTo(x + w + 50, 90); c.stroke();
        c.beginPath(); c.moveTo(x, 210); c.lineTo(x - 40, 180); c.stroke();
        c.fillStyle = 'rgba(5,6,10,0.35)'; c.fillRect(x, 0, w, H);
      };
      trunk(70, 22); trunk(420, 30);
    });
  } else if (region === 'end') {
    canvasTex(scene, k(0), W, H, c => {
      grad(c, [[0, '#05070c'], [1, '#18223a']]);
      c.strokeStyle = 'rgba(127,212,255,0.07)';
      for (let x = 0; x < W; x += 32) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
      for (let y = 0; y < H; y += 32) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
    });
    canvasTex(scene, k(1), W, H, c => {
      const r = seeded(51);
      for (let i = 0; i < 7; i++) {
        const bx = i * 92 + r() * 30, w = 16 + r() * 18, h = 120 + r() * 160;
        wrap(o => {
          c.fillStyle = '#26324a'; c.fillRect(bx + o, H - h, w, h);
          c.fillStyle = 'rgba(127,212,255,0.5)'; c.fillRect(bx + o, H - h, 1, h); c.fillRect(bx + o, H - h, w, 1);
        });
      }
    });
    canvasTex(scene, k(2), W, H, c => {
      const r = seeded(61);
      for (let i = 0; i < 14; i++) {
        const x = r() * W, y = 60 + r() * 260, s = 4 + r() * 10;
        c.fillStyle = `rgba(200,232,255,${(0.15 + r() * 0.3).toFixed(2)})`;
        c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 0.5, y); c.lineTo(x, y + s); c.lineTo(x - s * 0.5, y); c.closePath(); c.fill();
      }
    });
  }
}

// ---------------------------------------------------------------------------
function makeAllTextures(scene) {
  makeCharacterArt(scene);

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
