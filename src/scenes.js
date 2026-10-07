import {
  W, H, C, BEAT, clamp, lerp, prog, smooth, interpolate, spring, rng, easeOutCubic, easeOutExpo, easeInCubic, easeOutBack,
  text, glowStroke, line, createLine, arrow, dot, roundRect, polyPartial, project, hud, rgba, mix, FONT, MONO,
} from './engine.js';
import { drawMixed, drawGlyph, mixedWidth } from './glyphs.js';
import { INTRO_LINES, STEP, CREDIT } from './timeline.js';

// =====================================================================
// 0. INTRO — terminal typewriter credit (0–8s)
// =====================================================================
let introCanvas = null;
export function intro(ctx, t) {
  if (!introCanvas) { introCanvas = new OffscreenCanvas(W, H); }
  const o = introCanvas.getContext('2d');
  o.clearRect(0, 0, W, H);

  // terminal chrome
  text(o, 'kiro@studio:~$ ./make_film --topic "how ai works" --autonomous', 120, 96, { size: 24, weight: 400, font: MONO, color: C.dim, align: 'left', alpha: prog(t, 0, 0.3) });
  const rec = Math.floor(t / BEAT) % 2 === 0;
  dot(o, W - 400, 96, 8, '#ff3d5a', rec ? 1 : 0.25, 0.6);
  text(o, 'REC  ' + tc(t), W - 380, 96, { size: 24, weight: 400, font: MONO, color: C.dim, align: 'left' });

  const size = 76, x0 = 300, ys = [430, 560, 690];
  const font = `700 ${size}px ${MONO}`;
  let cursor = null;
  INTRO_LINES.forEach((L, li) => {
    if (t < L.start - 0.25) return;
    const n = [...L.text].length;
    const visible = Math.floor((t - L.start) / STEP) + 1;
    text(o, '>', x0 - 80, ys[li], { size, weight: 700, font: MONO, color: C.dim, align: 'left' });
    if (visible > 0) {
      const r = drawMixed(o, L.text, x0, ys[li], { size, color: L.color, font, visible: Math.min(n, visible), glow: li ? 18 : 10, weight: 0.075 });
      cursor = { x: r.endX + 10, y: ys[li], typing: visible <= n };
    } else cursor = { x: x0, y: ys[li], typing: true };
  });
  if (cursor) {
    const blinkOn = cursor.typing || (t % BEAT) < BEAT / 2;
    if (blinkOn) { o.fillStyle = C.cyan; o.globalAlpha = 0.9; o.fillRect(cursor.x, cursor.y - size * 0.45, size * 0.5, size * 0.9); o.globalAlpha = 1; }
  }
  // small footnote
  text(o, '* token / cost = session estimate', x0, 800, { size: 22, weight: 400, font: MONO, color: C.dim, align: 'left', alpha: prog(t, 6.3, 0.4) });

  // glitch-out 7.0 → 8.0
  const g = prog(t, 7.0, 1.0, easeInCubic);
  if (g <= 0) { ctx.drawImage(introCanvas, 0, 0); return; }
  const R = rng(Math.floor(t * 30));
  const slices = 28;
  for (let i = 0; i < slices; i++) {
    const y = (i / slices) * H, h = H / slices + 1;
    const off = (R() - 0.5) * 260 * g * (R() < 0.5 ? 1 : 0.2);
    ctx.globalAlpha = 1 - g * 0.6;
    ctx.drawImage(introCanvas, 0, y, W, h, off, y, W, h);
  }
  // rgb split ghosts
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35 * g; ctx.drawImage(introCanvas, -18 * g, 0);
  ctx.globalAlpha = 0.35 * g; ctx.drawImage(introCanvas, 18 * g, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}
function tc(t) { const s = Math.floor(t), f = Math.floor((t % 1) * 30); return `00:00:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`; }

// =====================================================================
// 1. TITLE DROP (8–12)
// =====================================================================
const burst = (() => { const R = rng(7); return Array.from({ length: 260 }, () => ({ a: R() * Math.PI * 2, v: 300 + R() * 900, r: 1 + R() * 3, c: [C.cyan, C.violet, C.magenta, C.white][Math.floor(R() * 4)] })); })();
export function title(ctx, lt) {
  const cx = W / 2, cy = H / 2 - 30;
  // particles
  for (const p of burst) {
    const d = p.v * (1 - Math.exp(-lt * 2.2));
    const a = clamp(1 - lt / 3.6);
    dot(ctx, cx + Math.cos(p.a) * d, cy + Math.sin(p.a) * d * 0.62, p.r, p.c, a * 0.8, 0.6);
  }
  // shock rings on every beat
  for (let k = 0; k < 8; k++) {
    const dt = lt - k * BEAT; if (dt < 0 || dt > 1.2) continue;
    const r = 120 + dt * 1100, a = (1 - dt / 1.2) * 0.5;
    const p = new Path2D(); p.ellipse(cx, cy, r, r * 0.62, 0, 0, Math.PI * 2);
    glowStroke(ctx, p, k % 2 ? C.violet : C.cyan, 2, 1, a);
  }
  const s = 1 + 0.35 * (1 - spring(lt, { stiffness: 220, damping: 16 }));
  const exit = prog(lt, 3.55, 0.45, easeInCubic);
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(s * (1 + exit * 0.8), s * (1 + exit * 0.8)); ctx.translate(-cx, -cy);
  ctx.globalAlpha = 1 - exit;
  drawMixed(ctx, 'AI 如何工作', cx, cy, { size: 190, font: `900 190px ${FONT}`, color: C.white, align: 'center', glow: 30, weight: 0.12 });
  // subtitle reveal
  const sub = 'HOW  AI  WORKS';
  const vis = Math.floor(clamp((lt - 0.5) / 0.6) * sub.length);
  text(ctx, sub.slice(0, vis), cx, cy + 170, { size: 34, weight: 700, font: MONO, color: C.cyan, spacing: 16, glow: 14 });
  const bw = 520 * prog(lt, 0.4, 0.8, easeOutExpo);
  ctx.fillStyle = C.cyan; ctx.fillRect(cx - bw / 2, cy + 120, bw, 3);
  ctx.restore();
}

// =====================================================================
// 2. TOKENIZE (12–20)
// =====================================================================
const WORDS = ['The', 'cat', 'sat', 'on', 'the'];
const IDS = ['464', '3797', '3332', '319', '262'];
const TOK_COL = [C.cyan, C.violet, C.magenta, C.amber, C.green];
const VEC = (() => { const R = rng(42); return WORDS.map(() => Array.from({ length: 8 }, () => +(R() * 2 - 1).toFixed(2))); })();

export function tokenize(ctx, lt) {
  hud(ctx, '01', 'TOKENIZE', lt);
  const size = 120, font = `900 ${size}px ${FONT}`;
  ctx.font = font;
  const widths = WORDS.map(w => ctx.measureText(w).width);
  const space = ctx.measureText(' ').width;
  const gapT = WORDS.map((_, i) => spring(lt - 1 - i * 0.25, { stiffness: 260, damping: 18 }));
  // layout: words start as a sentence, then separate with extra gap & chip padding
  const pad = 34;
  const totalW = widths.reduce((a, b) => a + b, 0) + space * 4 + gapT.reduce((a, g, i) => a + (i ? g * 60 : 0) + g * pad * 2 * 0, 0);
  let x = W / 2 - totalW / 2;
  const cy = 470;
  const collapse = prog(lt, 4.4, 1.0);
  const exit = prog(lt, 7.4, 0.6, easeInCubic);
  const appear = prog(lt, 0, 0.6, easeOutCubic);

  WORDS.forEach((w, i) => {
    const g = clamp(gapT[i], 0, 1.2);
    if (i) x += space + 60 * gapT[i];
    const wx = x, ww = widths[i];
    x += ww;
    const col = TOK_COL[i];
    const yOff = -collapse * 120 - exit * 60;
    ctx.save();
    ctx.globalAlpha = appear * (1 - exit);
    // chip
    if (g > 0.01) {
      const chip = roundRect(ctx, wx - pad * g, cy - 85 + yOff, ww + pad * 2 * g, 170, 26);
      ctx.save(); ctx.globalAlpha *= 0.14 * clamp(g); ctx.fillStyle = col; ctx.fill(chip); ctx.restore();
      glowStroke(ctx, chip, col, 3, 0.8, clamp(g) * ctx.globalAlpha);
    }
    text(ctx, w, wx + ww / 2, cy + 6 + yOff, { size, weight: 900, color: g > 0.5 ? mix(C.white, col, 0.15) : C.white, alpha: 1 - collapse * 0.3 });
    // id
    const idT = prog(lt, 2.25 + i * 0.25, 0.3, easeOutBack);
    if (idT > 0) {
      createLine(ctx, wx + ww / 2, cy + 90 + yOff, wx + ww / 2, cy + 90 + 50 * idT + yOff, 1, col, 2, 0.6, 0.8);
      text(ctx, IDS[i], wx + ww / 2, cy + 175 + yOff, { size: 54 * idT, weight: 700, font: MONO, color: col, glow: 12 });
    }
    // vector column (embedding lookup)
    if (collapse > 0) {
      const vx = wx + ww / 2, vy0 = cy + 250 + yOff;
      VEC[i].forEach((v, k) => {
        const kt = prog(lt, 4.6 + k * 0.06 + i * 0.12, 0.3, easeOutCubic);
        if (kt <= 0) return;
        const yy = vy0 + k * 40;
        const bwid = 70 * Math.abs(v) * kt;
        ctx.fillStyle = rgba(v > 0 ? col : C.dim, 0.75);
        ctx.fillRect(vx - (v < 0 ? bwid : 0), yy - 13, bwid, 26);
        text(ctx, (v >= 0 ? '+' : '') + v.toFixed(2), vx + (v < 0 ? 12 : -12), yy, { size: 20, weight: 400, font: MONO, color: C.white, align: v < 0 ? 'left' : 'right', alpha: kt * 0.85 });
      });
    }
    ctx.restore();
  });
  // caption
  const cap = ['TEXT', 'TOKENS', 'IDS', 'VECTORS'];
  const capT = [0.2, 1.2, 2.4, 4.6];
  let cxp = W / 2 - 430;
  cap.forEach((c, i) => {
    const a = prog(lt, capT[i], 0.3) * (1 - exit);
    text(ctx, c, cxp + i * 290, 960, { size: 28, weight: 700, font: MONO, color: i === cap.findLastIndex((_, j) => lt >= capT[j]) ? C.cyan : C.dim, alpha: a, spacing: 6 });
    if (i < 3) text(ctx, '→', cxp + i * 290 + 145, 960, { size: 28, font: MONO, color: C.dim, alpha: prog(lt, capT[i + 1], 0.3) * (1 - exit) });
  });
}

// =====================================================================
// 3. EMBED (20–28) — 3D semantic space, vector arithmetic
// =====================================================================
const CLOUD = (() => { const R = rng(9); return Array.from({ length: 320 }, () => { const u = R() * 2 - 1, th = R() * Math.PI * 2, r = 200 + R() * 330; return [Math.sqrt(1 - u * u) * Math.cos(th) * r, u * r * 0.7, Math.sqrt(1 - u * u) * Math.sin(th) * r, R()]; }); })();
const LABELS = [
  { w: 'cat', p: [230, 120, -80], c: C.violet, t: 2.0 }, { w: 'dog', p: [300, 60, -20], c: C.violet, t: 2.0 }, { w: 'tiger', p: [190, 200, -150], c: C.violet, t: 2.0 },
  { w: 'pizza', p: [60, -250, -160], c: C.amber, t: 2.5 }, { w: 'bread', p: [150, -200, -230], c: C.amber, t: 2.5 },
  { w: 'king', p: [-330, 250, -60], c: C.cyan, t: 3.0 }, { w: 'man', p: [-350, -130, -80], c: C.cyan, t: 3.0 }, { w: 'woman', p: [-110, -90, 250], c: C.magenta, t: 3.5 },
  { w: 'queen', p: [-90, 290, 270], c: C.magenta, t: 99 },
];
export function embed(ctx, lt) {
  hud(ctx, '02', 'EMBED', lt);
  const exit = prog(lt, 7.4, 0.6, easeInCubic);
  const cam = { yaw: -0.5 + lt * 0.11, pitch: 0.28 + 0.06 * Math.sin(lt * 0.6), dist: 1500, cx: W / 2, cy: H / 2 + 20, scale: 1.05 + 0.1 * prog(lt, 0, 8) + exit * 0.8 };
  ctx.save(); ctx.globalAlpha = 1 - exit;
  // axes (Manim Create)
  const L = 480;
  [[[-L, 0, 0], [L, 0, 0]], [[0, -L * 0.8, 0], [0, L * 0.8, 0]], [[0, 0, -L], [0, 0, L]]].forEach(([a, b], i) => {
    const t = prog(lt, i * 0.2, 0.9);
    const A = project(...a, cam), B = project(...b, cam);
    arrow(ctx, A[0], A[1], B[0], B[1], t, rgba(C.white, 0.35), 2, 14);
  });
  // grid plane
  ctx.save(); ctx.globalAlpha *= 0.12 * prog(lt, 0.3, 1);
  for (let g = -4; g <= 4; g++) {
    const a1 = project(g * 110, 0, -440, cam), b1 = project(g * 110, 0, 440, cam);
    const a2 = project(-440, 0, g * 110, cam), b2 = project(440, 0, g * 110, cam);
    ctx.strokeStyle = C.blue; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke();
  }
  ctx.restore();
  // cloud
  for (const [x, y, z, r] of CLOUD) {
    const a = prog(lt, 0.4 + r * 1.2, 0.4);
    if (a <= 0) continue;
    const P = project(x, y, z, cam);
    ctx.globalAlpha = (1 - exit) * a * 0.55 * P[2];
    ctx.fillStyle = r > 0.8 ? C.violet : C.blue;
    ctx.fillRect(P[0] - 1.5, P[1] - 1.5, 3 * P[2], 3 * P[2]);
  }
  ctx.globalAlpha = 1 - exit;
  // labelled words
  const vec = (w) => LABELS.find(l => l.w === w).p;
  const O = project(0, 0, 0, cam);
  for (const l of LABELS) {
    let a = l.w === 'queen' ? prog(lt, 5.5, 0.3, easeOutBack) : prog(lt, l.t, 0.35, easeOutBack);
    if (a <= 0) continue;
    const P = project(...l.p, cam);
    const glowQ = l.w === 'queen' ? 1 + 0.6 * Math.exp(-(lt - 5.5) * 2) : 1;
    dot(ctx, P[0], P[1], 7 * P[2] * a * glowQ, l.c, 1, 1.2);
    text(ctx, l.w, P[0] + 16, P[1] - 18, { size: 30 * P[2], weight: 700, font: MONO, color: l.c, align: 'left', alpha: clamp(a), glow: 8 });
  }
  // vector arithmetic: king - man + woman = queen
  const pt = w => project(...vec(w), cam);
  const K = pt('king'), M = pt('man'), Wm = pt('woman'), Q = pt('queen');
  arrow(ctx, O[0], O[1], K[0], K[1], prog(lt, 4.0, 0.45), C.cyan, 3.5, 16);
  arrow(ctx, O[0], O[1], M[0], M[1], prog(lt, 4.25, 0.45), C.cyan, 3.5, 16, 0.8);
  arrow(ctx, M[0], M[1], K[0], K[1], prog(lt, 4.6, 0.4), C.amber, 3, 14, 0.9);         // king - man
  arrow(ctx, O[0], O[1], Wm[0], Wm[1], prog(lt, 4.8, 0.4), C.magenta, 3.5, 16);
  arrow(ctx, Wm[0], Wm[1], Q[0], Q[1], prog(lt, 5.1, 0.45), C.amber, 3, 14, 0.9);       // + (king - man)
  // equation
  const eq = prog(lt, 5.6, 0.4);
  if (eq > 0) {
    const parts = [['king', C.cyan], [' − ', C.dim], ['man', C.cyan], [' + ', C.dim], ['woman', C.magenta], [' ≈ ', C.dim], ['queen', C.magenta]];
    ctx.font = `700 46px ${MONO}`;
    const tw = parts.reduce((a, [s]) => a + ctx.measureText(s).width, 0);
    let x = W / 2 - tw / 2;
    for (const [s, c] of parts) { text(ctx, s, x, 950 + (1 - eq) * 20, { size: 46, font: MONO, color: c, align: 'left', alpha: eq, glow: 10 }); x += ctx.measureText(s).width; }
  }
  text(ctx, 'MEANING = POSITION', W - 96, 92, { size: 22, weight: 600, font: MONO, color: C.dim, align: 'right', alpha: prog(lt, 1, 0.5), spacing: 4 });
  ctx.restore();
}

// =====================================================================
// 4. ATTENTION (28–36)
// =====================================================================
const ATT_TOK = ['The', 'cat', 'sat', 'on', 'the', '▢'];
const ATT_W = [0.05, 0.46, 0.17, 0.08, 0.24];
const MAT = (() => {
  const R = rng(5); const n = 6, m = [];
  for (let i = 0; i < n; i++) { const row = []; let s = 0; for (let j = 0; j <= i; j++) { const v = Math.pow(R(), 2) + (j === 1 ? 0.6 : 0) + (i === j ? 0.3 : 0); row.push(v); s += v; } m.push(row.map(v => v / s)); }
  return m;
})();
export function attention(ctx, lt) {
  hud(ctx, '03', 'ATTENTION', lt);
  const exit = prog(lt, 7.4, 0.6, easeInCubic);
  const phase2 = prog(lt, 4.0, 0.9);
  ctx.save(); ctx.globalAlpha = 1 - exit;
  // token row (moves up & shrinks in phase 2)
  const spacing = lerp(250, 0, 0);
  const y = lerp(700, 700, phase2);
  const xs = ATT_TOK.map((_, i) => W / 2 + (i - 2.5) * spacing);
  const rowA = 1 - phase2;
  if (rowA > 0.01) {
    ctx.save(); ctx.globalAlpha *= rowA;
    ATT_TOK.forEach((tk, i) => {
      const a = prog(lt, i * 0.08, 0.4, easeOutBack);
      const q = i === 5;
      const pulse = q ? 0.5 + 0.5 * Math.sin(lt * Math.PI * 4) : 0;
      const chip = roundRect(ctx, xs[i] - 90, y - 50, 180, 100, 22);
      ctx.save(); ctx.globalAlpha *= 0.12 * a; ctx.fillStyle = q ? C.amber : C.blue; ctx.fill(chip); ctx.restore();
      glowStroke(ctx, chip, q ? C.amber : rgba(C.white, 0.5), 2.5, q ? 0.6 + pulse : 0.2, a * ctx.globalAlpha);
      if (q) text(ctx, '?', xs[i], y + 4, { size: 62, weight: 900, color: C.amber, glow: 20 * (0.5 + pulse) });
      else text(ctx, tk, xs[i], y + 4, { size: 54, weight: 700, color: C.white, alpha: a });
    });
    // arcs from query to each previous token
    ATT_W.forEach((w, i) => {
      const t = prog(lt, 1.0 + i * 0.5, 0.45, easeOutCubic);
      if (t <= 0) return;
      const x1 = xs[5], x2 = xs[i], h = 120 + (5 - i) * 70;
      const pts = []; for (let k = 0; k <= 40; k++) { const u = k / 40; pts.push([lerp(x1, x2, u), y - 60 - Math.sin(u * Math.PI) * h]); }
      const col = mix(C.blue, C.cyan, clamp(w * 2.2));
      glowStroke(ctx, polyPartial(pts, t), col, 2 + w * 26, 0.9, ctx.globalAlpha);
      // flowing particles toward query
      if (t >= 1) for (let p = 0; p < 3; p++) {
        const u = 1 - ((lt * 0.8 + p / 3 + i * 0.13) % 1);
        dot(ctx, lerp(x1, x2, u), y - 60 - Math.sin(u * Math.PI) * h, 3 + w * 8, C.white, ctx.globalAlpha * 0.9, 1);
      }
      const lp = prog(lt, 1.25 + i * 0.5, 0.3);
      text(ctx, w.toFixed(2), x2, y + 90, { size: 30, weight: 700, font: MONO, color: col, alpha: lp * ctx.globalAlpha, glow: 8 });
    });
    ctx.restore();
  }
  // phase 2: attention matrix
  if (phase2 > 0) {
    const n = 6, cell = 84, mx = W / 2 - (n * cell) / 2 + 60, my = 250;
    ATT_TOK.forEach((tk, i) => {
      const a = phase2;
      text(ctx, tk === '▢' ? '?' : tk, mx - 24, my + i * cell + cell / 2, { size: 30, weight: 700, font: MONO, color: i === 5 ? C.amber : C.white, align: 'right', alpha: a });
      ctx.save(); ctx.translate(mx + i * cell + cell / 2, my - 22); ctx.rotate(-0.6);
      text(ctx, tk === '▢' ? '?' : tk, 0, 0, { size: 28, weight: 700, font: MONO, color: i === 5 ? C.amber : C.dim, align: 'left', alpha: a });
      ctx.restore();
    });
    let k = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const masked = j > i;
      const ct = prog(lt, 4.4 + k * (BEAT / 4) * 0.5, 0.25, easeOutBack); k++;
      if (ct <= 0) continue;
      const v = masked ? 0 : MAT[i][j];
      const x = mx + j * cell, yy = my + i * cell;
      const s = (cell - 8) * clamp(ct, 0, 1.15);
      ctx.fillStyle = masked ? rgba(C.grid, 0.8) : mix('#0b1430', v > 0.35 ? C.cyan : C.violet, clamp(Math.sqrt(v) * 1.4));
      ctx.fillRect(x + cell / 2 - s / 2, yy + cell / 2 - s / 2, s, s);
      if (!masked && v > 0.25) { ctx.save(); ctx.shadowColor = C.cyan; ctx.shadowBlur = 24; ctx.fillRect(x + cell / 2 - s / 2, yy + cell / 2 - s / 2, s, s); ctx.restore(); }
      if (!masked && ct > 0.9) text(ctx, (v >= 0.995 ? '1.0' : v.toFixed(2).slice(1)), x + cell / 2, yy + cell / 2, { size: 20, weight: 700, font: MONO, color: v > 0.3 ? '#001018' : rgba(C.white, 0.75) });
    }
    // formula
    text(ctx, 'softmax( Q·Kᵀ / √d ) · V', W / 2 + 60, 840 + 40, { size: 40, weight: 700, font: MONO, color: C.white, alpha: prog(lt, 5.2, 0.5), glow: 10 });
    text(ctx, 'EVERY WORD LOOKS AT EVERY OTHER WORD', W / 2 + 60, 940, { size: 22, weight: 600, font: MONO, color: C.dim, alpha: prog(lt, 5.8, 0.5), spacing: 4 });
  }
  ctx.restore();
}

// =====================================================================
// 5. LAYERS (36–44) — neural net forward pass → stacked transformer
// =====================================================================
const NET = [4, 7, 9, 7, 4];
const netNodes = (cx, cy, sx, sy) => NET.map((n, l) => Array.from({ length: n }, (_, i) => [cx + (l - (NET.length - 1) / 2) * sx, cy + (i - (n - 1) / 2) * sy]));
export function layers(ctx, lt) {
  hud(ctx, '04', 'LAYERS', lt);
  const shrink = prog(lt, 3.9, 1.2);
  const exit = prog(lt, 7.6, 0.4, easeInCubic);
  const cx = W / 2, cy = H / 2 + 10;
  ctx.save(); ctx.globalAlpha = 1 - exit;
  // 3D stack of blocks (appears as the net shrinks)
  if (shrink > 0) {
    const nBlocks = 14;
    for (let b = nBlocks - 1; b >= 0; b--) {
      const bt = prog(lt, 4.3 + b * 0.09, 0.4, easeOutCubic);
      if (bt <= 0) continue;
      const depth = b * 46 * bt;
      const w = 520 - b * 14, h = 300 - b * 8;
      const x = cx - w / 2 + depth * 0.9 - 260, y = cy - h / 2 - depth * 0.55 + 90;
      const r = roundRect(ctx, x, y, w, h, 18);
      const pulse = Math.exp(-((lt * 2 - b * 0.35) % 4 + 4) % 4 * 2.5);
      ctx.save(); ctx.globalAlpha *= bt * (0.2 + 0.25 * pulse); ctx.fillStyle = b ? C.blue : C.cyan; ctx.fill(r); ctx.restore();
      glowStroke(ctx, r, mix(C.violet, C.cyan, 1 - b / nBlocks), 2, 0.6, bt * (1 - b / (nBlocks + 4)) * ctx.globalAlpha);
    }
    // counter
    const c = prog(lt, 4.8, 2.2, t => 1 - Math.pow(1 - t, 4));
    const n = Math.floor(c * 175e9);
    text(ctx, n.toLocaleString('en-US'), cx, 900, { size: 72, weight: 900, color: C.white, alpha: prog(lt, 4.8, 0.3), glow: 20 });
    text(ctx, 'PARAMETERS', cx, 970, { size: 24, weight: 600, font: MONO, color: C.cyan, alpha: prog(lt, 5.0, 0.3), spacing: 10 });
    text(ctx, '× 96 LAYERS', cx + 330, cy - 230, { size: 40, weight: 700, font: MONO, color: C.cyan, align: 'left', alpha: prog(lt, 5.4, 0.3), glow: 12 });
  }
  // network
  const s = 1 - shrink * 0.62;
  const sx = 230 * s, sy = 88 * s;
  const ncx = cx, ncy = cy;
  const nodes = netNodes(ncx, ncy, sx, sy);
  const netA = 1 - shrink * 0.3;
  const activeL = lt >= 1.5 ? Math.floor((lt - 1.5) / BEAT) % (NET.length + 1) : -1;
  const sinceBeat = lt >= 1.5 ? ((lt - 1.5) % BEAT) / BEAT : 0;
  const R = rng(3);
  for (let l = 0; l < NET.length - 1; l++) {
    const lt0 = prog(lt, 0.15 + l * 0.22, 0.5);
    for (let i = 0; i < nodes[l].length; i++) for (let j = 0; j < nodes[l + 1].length; j++) {
      const [x1, y1] = nodes[l][i], [x2, y2] = nodes[l + 1][j];
      const wgt = R();
      const live = activeL === l + 1;
      const col = live ? mix(C.blue, C.cyan, wgt) : C.blue;
      createLine(ctx, x1, y1, x2, y2, lt0, col, live ? 1 + wgt * 2.5 : 1, live ? 0.7 : 0, (live ? 0.25 + wgt * 0.6 * (1 - sinceBeat * 0.6) : 0.22) * netA * ctx.globalAlpha);
      if (live && wgt > 0.6) { const u = easeOutCubic(sinceBeat); dot(ctx, lerp(x1, x2, u), lerp(y1, y2, u), 3 * s, C.white, (1 - u) * netA * ctx.globalAlpha, 1); }
    }
  }
  nodes.forEach((layer, l) => layer.forEach(([x, y], i) => {
    const a = prog(lt, 0.1 + l * 0.22 + i * 0.03, 0.35, easeOutBack);
    if (a <= 0) return;
    const act = activeL === l ? (1 - sinceBeat) * (0.4 + 0.6 * ((i * 37 + l * 11) % 7) / 6) : 0;
    const col = l === 0 ? C.cyan : l === NET.length - 1 ? C.magenta : C.violet;
    const P = new Path2D(); P.arc(x, y, 17 * s * a, 0, Math.PI * 2);
    ctx.save(); ctx.globalAlpha *= netA; ctx.fillStyle = mix('#0a0f22', col, 0.2 + act * 0.8); ctx.fill(P); ctx.restore();
    glowStroke(ctx, P, col, 2.5 * s, 0.4 + act, netA * ctx.globalAlpha);
  }));
  // labels
  const la = prog(lt, 0.8, 0.4) * (1 - shrink);
  text(ctx, 'INPUT', nodes[0][0][0], nodes[0][0][1] - 70, { size: 22, weight: 600, font: MONO, color: C.cyan, alpha: la, spacing: 4 });
  text(ctx, 'OUTPUT', nodes[NET.length - 1][0][0], nodes[NET.length - 1][0][1] - 70, { size: 22, weight: 600, font: MONO, color: C.magenta, alpha: la, spacing: 4 });
  // break build-up glow (42-44)
  const build = prog(lt, 6, 2, easeInCubic);
  if (build > 0) { const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 900); g.addColorStop(0, rgba(C.cyan, 0.35 * build)); g.addColorStop(1, rgba(C.cyan, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// =====================================================================
// 6. PREDICT (44–52)
// =====================================================================
const CANDS = [['mat', 0.62], ['floor', 0.14], ['sofa', 0.09], ['roof', 0.05], ['moon', 0.01]];
const CONT = ['and', 'dreamed', 'of', 'fish', '.'];
export function predict(ctx, lt) {
  hud(ctx, '05', 'PREDICT', lt);
  const exit = prog(lt, 7.5, 0.5, easeInCubic);
  ctx.save(); ctx.globalAlpha = 1 - exit;
  const move = prog(lt, 3.6, 0.8);
  const fs = lerp(60, 58, move);
  const baseX = 110;
  const sy = lerp(H / 2, 470, move);
  // sentence tokens
  const words = ['The', 'cat', 'sat', 'on', 'the'];
  const picked = lt >= 3.0;
  const contN = lt < 4.5 ? 0 : Math.min(CONT.length, Math.floor((lt - 4.5) / BEAT) + 1);
  const all = [...words, ...(picked ? ['mat'] : []), ...CONT.slice(0, contN)];
  ctx.font = `700 ${fs}px ${MONO}`;
  const widths = all.map(w => ctx.measureText(w + ' ').width);
  const totalW = widths.reduce((a, b) => a + b, 0);
  const finalW = [...words, 'mat', ...CONT].reduce((acc, w) => acc + ctx.measureText(w + ' ').width, 0);
  let x = lerp(baseX, W / 2 - finalW / 2, move);
  all.forEach((w, i) => {
    const isNew = i >= words.length;
    const bornAt = i === words.length ? 3.0 : 4.5 + (i - words.length - 1) * BEAT;
    const a = isNew ? prog(lt, bornAt, 0.25, easeOutBack) : prog(lt, i * 0.06, 0.3);
    const col = !isNew ? C.white : i === words.length ? C.amber : C.cyan;
    text(ctx, w, x, sy - (1 - clamp(a)) * 30, { size: fs, weight: 700, font: MONO, color: col, align: 'left', alpha: clamp(a), glow: isNew ? 16 : 0 });
    x += widths[i];
  });
  // cursor
  if ((lt % BEAT) < BEAT * 0.6) { ctx.fillStyle = C.cyan; ctx.fillRect(x, sy - fs * 0.45, fs * 0.5, fs * 0.9); }
  // probability bars (phase 1)
  const barsA = 1 - move;
  if (barsA > 0.01) {
    const bx = 1200, by = H / 2 - 210, bh = 64, gap = 22, maxW = 560;
    ctx.save(); ctx.globalAlpha *= barsA;
    text(ctx, 'P( next token )', bx, by - 60, { size: 26, weight: 600, font: MONO, color: C.dim, align: 'left', alpha: prog(lt, 0.2, 0.4) });
    CANDS.forEach(([w, p], i) => {
      const t = spring(lt - 0.5 - i * 0.25, { stiffness: 180, damping: 15 });
      const yy = by + i * (bh + gap);
      const top = i === 0;
      const hl = top && lt > 2.5 ? 0.5 + 0.5 * Math.sin((lt - 2.5) * Math.PI * 4) : 0;
      const col = top ? C.amber : mix(C.blue, C.violet, i / 4);
      text(ctx, w, bx - 24, yy + bh / 2, { size: 34, weight: 700, font: MONO, color: top ? C.amber : C.white, align: 'right', alpha: clamp(t * 3) });
      const r = roundRect(ctx, bx, yy, Math.max(4, maxW * p / 0.62 * clamp(t, 0, 1.1)), bh, 10);
      ctx.save(); ctx.fillStyle = col; ctx.globalAlpha *= 0.85; if (top) { ctx.shadowColor = C.amber; ctx.shadowBlur = 20 + 30 * hl; } ctx.fill(r); ctx.restore();
      text(ctx, Math.round(p * 100 * clamp(t, 0, 1)) + '%', bx + maxW * p / 0.62 * clamp(t, 0, 1) + 20, yy + bh / 2, { size: 30, weight: 700, font: MONO, color: col, align: 'left', alpha: clamp(t * 3) });
    });
    ctx.restore();
  }
  // mini flicker bars under cursor during autoregression
  if (lt > 4.5 && lt < 7.3) {
    const k = (lt - 4.5) % BEAT / BEAT;
    const R = rng(Math.floor((lt - 4.5) / BEAT) + 11);
    for (let i = 0; i < 4; i++) {
      const p = i === 0 ? 0.7 : R() * 0.4;
      ctx.fillStyle = i === 0 ? C.cyan : rgba(C.blue, 0.7);
      ctx.globalAlpha = (1 - exit) * (1 - k);
      ctx.fillRect(x, sy + 60 + i * 18, 160 * p * easeOutCubic(Math.min(1, k * 3)), 10);
    }
    ctx.globalAlpha = 1 - exit;
  }
  // loop arrow + caption
  const ca = prog(lt, 5.0, 0.4);
  if (ca > 0) {
    const pts = []; for (let k = 0; k <= 60; k++) { const u = k / 60, a = Math.PI * (0.15 + 1.7 * u); pts.push([W / 2 + Math.cos(a) * 520, 690 + Math.sin(a) * 70]); }
    text(ctx, 'ONE TOKEN AT A TIME', W / 2, 860, { size: 30, weight: 700, font: MONO, color: C.cyan, alpha: ca, spacing: 10, glow: 10 });
  }
  ctx.restore();
}

// =====================================================================
// 7. LEARN (52–60) — gradient descent on a loss landscape
// =====================================================================
const lossF = x => 1.5 + 0.16 * x * x + 0.42 * Math.sin(2.1 * x + 0.6);
const lossD = x => 0.32 * x + 0.882 * Math.cos(2.1 * x + 0.6);
const GD = (() => { let x = -3.7, v = 0; const out = [x]; for (let i = 0; i < 15; i++) { v = 0.55 * v - 0.55 * lossD(x); x += v; out.push(x); } return out; })();
export function learn(ctx, lt) {
  hud(ctx, '06', 'LEARN', lt);
  const exit = prog(lt, 7.5, 0.5, easeInCubic);
  ctx.save(); ctx.globalAlpha = 1 - exit;
  // axes (left panel)
  const ox = 180, oy = 860, aw = 1000, ah = 600;
  const X = x => ox + (x + 4.2) / 8.4 * aw, Y = y => oy - (y - 0.4) / 4.4 * ah;
  arrow(ctx, ox, oy, ox + aw + 30, oy, prog(lt, 0, 0.6), rgba(C.white, 0.5), 2, 14);
  arrow(ctx, ox, oy, ox, oy - ah - 30, prog(lt, 0.1, 0.6), rgba(C.white, 0.5), 2, 14);
  text(ctx, 'weights', ox + aw, oy + 36, { size: 22, weight: 600, font: MONO, color: C.dim, align: 'right', alpha: prog(lt, 0.4, 0.4) });
  text(ctx, 'error', ox - 20, oy - ah - 10, { size: 22, weight: 600, font: MONO, color: C.dim, align: 'right', alpha: prog(lt, 0.4, 0.4) });
  const pts = []; for (let k = 0; k <= 200; k++) { const x = -4 + 8 * k / 200; pts.push([X(x), Y(lossF(x))]); }
  const curve = polyPartial(pts, prog(lt, 0.3, 1.2));
  // fill under curve
  ctx.save(); ctx.globalAlpha *= 0.12 * prog(lt, 1.0, 0.6);
  const fill = new Path2D(); fill.moveTo(pts[0][0], oy); pts.forEach(p => fill.lineTo(p[0], p[1])); fill.lineTo(pts[pts.length - 1][0], oy); fill.closePath();
  const gr = ctx.createLinearGradient(0, oy - ah, 0, oy); gr.addColorStop(0, C.violet); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fill(fill);
  ctx.restore();
  glowStroke(ctx, curve, C.violet, 4, 1, ctx.globalAlpha);
  // ball: hop to next GD position each beat starting at 1.5
  const stepF = clamp((lt - 1.5) / BEAT, 0, GD.length - 1);
  const si = Math.floor(stepF), sf = smooth(Math.min(1, (stepF - si) * 2.2));
  const xa = GD[si], xb = GD[Math.min(GD.length - 1, si + 1)];
  const bxv = lerp(xa, xb, sf);
  const hop = Math.sin(sf * Math.PI) * 60 * Math.min(1, Math.abs(xb - xa));
  const bx = X(bxv), by = Y(lossF(bxv)) - 18 - hop;
  const ba = prog(lt, 1.2, 0.3, easeOutBack);
  if (ba > 0) {
    // trail
    for (let i = 0; i <= si; i++) dot(ctx, X(GD[i]), Y(lossF(GD[i])), 4, C.amber, 0.35, 0.5);
    // tangent (gradient)
    const g = lossD(bxv), tl = 120;
    const dx = tl / Math.sqrt(1 + g * g * (ah / 4.4 / (aw / 8.4)) ** 2);
    const slope = g * (ah / 4.4) / (aw / 8.4);
    createLine(ctx, bx - dx, by + 18 + hop + slope * dx, bx + dx, by + 18 + hop - slope * dx, ba, C.cyan, 2, 0.6, 0.8);
    dot(ctx, bx, by, 16 * ba, C.amber, 1, 1.4);
    if (si < GD.length - 1 && Math.abs(g) > 0.05) { const dir = g > 0 ? -1 : 1; arrow(ctx, bx, by - 40, bx + dir * 90, by - 40 + Math.min(40, Math.abs(slope) * 30), ba, C.cyan, 3, 14, 0.9); }
  }
  // right panel: training loss curve
  const px = 1300, py = 260, pw = 460, ph = 330;
  const pa = prog(lt, 0.6, 0.5);
  ctx.save(); ctx.globalAlpha *= pa;
  const panel = roundRect(ctx, px, py, pw, ph, 18);
  ctx.fillStyle = rgba('#0a1024', 0.8); ctx.fill(panel); glowStroke(ctx, panel, rgba(C.white, 0.2), 1.5, 0, ctx.globalAlpha);
  text(ctx, 'LOSS', px + 28, py + 40, { size: 22, weight: 700, font: MONO, color: C.dim, align: 'left', spacing: 4 });
  const R = rng(21); const lp = [];
  for (let k = 0; k <= 160; k++) { const u = k / 160; lp.push([px + 30 + u * (pw - 60), py + 80 + (1 - Math.exp(-u * 4.5)) * (ph - 120) + (R() - 0.5) * 26 * Math.exp(-u * 2)]); }
  const lpp = prog(lt, 1.0, 6.0, t => t);
  glowStroke(ctx, polyPartial(lp, lpp), C.green, 2.5, 0.7, ctx.globalAlpha);
  const steps = Math.floor(Math.pow(lpp, 2) * 1000000);
  text(ctx, 'STEP ' + steps.toLocaleString('en-US'), px + pw - 28, py + 40, { size: 22, weight: 700, font: MONO, color: C.green, align: 'right' });
  ctx.restore();
  text(ctx, 'GUESS → ERROR → ADJUST', px + pw / 2, py + ph + 70, { size: 26, weight: 700, font: MONO, color: C.white, alpha: prog(lt, 2.5, 0.4), spacing: 4 });
  text(ctx, '× TRILLIONS OF TOKENS', px + pw / 2, py + ph + 120, { size: 26, weight: 700, font: MONO, color: C.amber, alpha: prog(lt, 3.5, 0.4), spacing: 4, glow: 10 });
  ctx.restore();
}

// =====================================================================
// 8. RECAP (60–68)
// =====================================================================
const RECAP = [['TOKEN', C.cyan], ['VECTOR', C.violet], ['ATTENTION', C.magenta], ['LAYERS', C.blue], ['PREDICT', C.amber], ['LEARN', C.green], ['REPEAT', C.white], ['∞', C.cyan]];
export function recap(ctx, lt) {
  const cx = W / 2, cy = H / 2;
  if (lt < 4) {
    const i = Math.min(RECAP.length - 1, Math.floor(lt / BEAT));
    const k = (lt - i * BEAT) / BEAT;
    const [w, col] = RECAP[i];
    // geometric backdrop that rotates per hit
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(i * 0.4 + k * 0.15);
    const sz = 380 + 60 * (1 - easeOutCubic(k));
    const sq = new Path2D(); sq.rect(-sz, -sz, sz * 2, sz * 2);
    glowStroke(ctx, sq, col, 3, 1, 0.5 * (1 - k * 0.6));
    ctx.rotate(Math.PI / 4); const sq2 = new Path2D(); sq2.rect(-sz * 0.7, -sz * 0.7, sz * 1.4, sz * 1.4);
    glowStroke(ctx, sq2, col, 1.5, 0.5, 0.3);
    ctx.restore();
    const s = 1 + 0.25 * (1 - easeOutExpo(Math.min(1, k * 2.5)));
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
    text(ctx, w, 0, 0, { size: w === '∞' ? 320 : 190, weight: 900, color: col, glow: 40 });
    ctx.restore();
    // flash on hit
    ctx.fillStyle = rgba(col, 0.25 * Math.exp(-k * 10)); ctx.fillRect(0, 0, W, H);
    // beat counter dots
    for (let j = 0; j < RECAP.length; j++) dot(ctx, cx - 140 + j * 40, 930, 5, j <= i ? col : C.grid, 1, j <= i ? 1 : 0);
    return;
  }
  // 64–68 : the one-line truth
  const t = lt - 4;
  const conv = prog(t, 2.5, 1.5, easeInCubic); // break: everything gathers
  const R = rng(17);
  for (let i = 0; i < 140; i++) {
    const a = R() * Math.PI * 2, r0 = 300 + R() * 900;
    const r = r0 * (1 - conv * 0.9) + Math.sin(t * 2 + i) * 6;
    dot(ctx, cx + Math.cos(a + t * 0.15) * r, cy + Math.sin(a + t * 0.15) * r * 0.6, 1.5 + R() * 2, [C.cyan, C.violet, C.magenta][i % 3], 0.6 * prog(t, 0, 0.6), 0.5);
  }
  const size = 200;
  const font = `900 ${size}px ${FONT}`;
  const full = '下一个 token';
  const wTot = mixedWidth(ctx, full, size, font);
  const x0 = cx - wTot / 2;
  const glyphs = ['下', '一', '个'];
  glyphs.forEach((g, i) => drawGlyph(ctx, g, x0 + i * size * 1.04, cy - 40, size, C.white, { t: prog(t, i * 0.35, 0.6, smooth), weight: 0.12, glow: 30 }));
  const ta = prog(t, 1.2, 0.4, easeOutCubic);
  text(ctx, ' token', x0 + 3 * size * 1.04, cy - 40 + size * 0.04, { size, weight: 900, color: C.cyan, align: 'left', alpha: ta, glow: 30 });
  text(ctx, 'IT  ALL  COMES  DOWN  TO  THE  NEXT  TOKEN', cx, cy + 140, { size: 28, weight: 700, font: MONO, color: C.dim, alpha: prog(t, 1.6, 0.5), spacing: 4 });
  // pre-impact white
  ctx.fillStyle = rgba('#ffffff', 0.9 * prog(t, 3.75, 0.25, easeInCubic)); ctx.fillRect(0, 0, W, H);
}

// =====================================================================
// 9. END CARD (68–72)
// =====================================================================
export function endcard(ctx, lt) {
  const cx = W / 2, cy = H / 2 - 40;
  // shock ring
  const r = 100 + lt * 900; const ring = new Path2D(); ring.arc(cx, cy, r, 0, Math.PI * 2);
  glowStroke(ctx, ring, C.cyan, 3, 1, clamp(1 - lt / 1.5) * 0.7);
  const s = 1 + 0.2 * (1 - spring(lt, { stiffness: 200, damping: 18 }));
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.font = `900 200px ${FONT}`; ctx.letterSpacing = '24px';
  const g = ctx.createLinearGradient(-320, 0, 320, 0); g.addColorStop(0, C.cyan); g.addColorStop(0.5, C.violet); g.addColorStop(1, C.magenta);
  ctx.fillStyle = g; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = C.violet; ctx.shadowBlur = 40;
  ctx.fillText('KIRO', 12, 0);
  ctx.restore();
  ctx.save(); ctx.globalAlpha = prog(lt, 0.4, 0.5);
  drawMixed(ctx, '本片由 Kiro 自行制作', cx, cy + 170, { size: 46, font: `700 46px ${MONO}`, color: C.white, align: 'center', weight: 0.08 });
  ctx.restore();
  text(ctx, `${CREDIT.tokens} TOKENS  ·  ≈ ¥${CREDIT.yuan}  ·  0 TEMPLATES`, cx, cy + 250, { size: 24, weight: 600, font: MONO, color: C.dim, alpha: prog(lt, 0.8, 0.5), spacing: 4 });
  // fade to black
  ctx.fillStyle = rgba('#000000', prog(lt, 3.0, 1.0, t => t)); ctx.fillRect(0, 0, W, H);
}
