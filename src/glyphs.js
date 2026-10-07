// Hand-built monoline CJK glyphs (sandbox has no CJK font installed).
// Each glyph: list of strokes, each stroke = polyline in a 100x100 box (y down).
// Rendered with rounded joins; curves are smoothed through midpoints.

const G = {
  '一': [[[10, 52], [90, 52]]],
  '工': [[[20, 20], [80, 20]], [[50, 20], [50, 82]], [[10, 82], [90, 82]]],
  '下': [[[10, 16], [90, 16]], [[46, 16], [46, 94]], [[54, 40], [72, 58]]],
  '个': [[[50, 6], [30, 30], [8, 48]], [[50, 6], [70, 30], [92, 46]], [[50, 40], [50, 96]]],
  '元': [[[28, 14], [72, 14]], [[8, 40], [92, 40]], [[38, 40], [36, 66], [12, 92]], [[62, 40], [62, 82], [68, 90], [88, 90], [92, 74]]],
  '本': [[[8, 30], [92, 30]], [[50, 4], [50, 96]], [[48, 32], [30, 58], [8, 78]], [[52, 32], [70, 58], [92, 76]], [[32, 72], [68, 72]]],
  '片': [[[30, 10], [30, 64], [26, 80], [12, 94]], [[58, 6], [58, 34]], [[30, 34], [86, 34]], [[30, 58], [72, 58], [72, 96]]],
  '由': [[[18, 30], [18, 90]], [[18, 30], [82, 30], [82, 90]], [[50, 4], [50, 90]], [[18, 60], [82, 60]], [[18, 90], [82, 90]]],
  '自': [[[54, 2], [44, 16]], [[22, 18], [22, 96]], [[22, 18], [78, 18], [78, 96]], [[22, 44], [78, 44]], [[22, 70], [78, 70]], [[22, 96], [78, 96]]],
  '行': [[[34, 6], [12, 26]], [[36, 34], [10, 58]], [[24, 46], [24, 96]], [[48, 16], [86, 16]], [[44, 42], [94, 42]], [[72, 42], [72, 92], [60, 86]]],
  '计': [[[12, 10], [24, 22]], [[6, 40], [22, 40], [22, 84], [34, 72]], [[40, 48], [94, 48]], [[66, 8], [66, 96]]],
  '约': [[[30, 4], [14, 30], [32, 32]], [[40, 20], [10, 64], [40, 56]], [[8, 88], [42, 74]], [[62, 6], [48, 34]], [[56, 26], [88, 26], [88, 80], [82, 94], [70, 88]], [[60, 48], [72, 62]]],
  '作': [[[32, 4], [8, 46]], [[22, 30], [22, 96]], [[58, 4], [42, 34]], [[52, 22], [94, 22]], [[58, 22], [58, 96]], [[58, 48], [90, 48]], [[58, 72], [90, 72]]],
  '制': [[[22, 6], [12, 22]], [[12, 24], [60, 24]], [[4, 44], [64, 44]], [[34, 6], [34, 96]], [[14, 60], [14, 86]], [[14, 60], [54, 60], [54, 82], [46, 80]], [[74, 16], [74, 70]], [[92, 4], [92, 90], [80, 84]]],
  '总': [[[30, 4], [40, 16]], [[70, 4], [60, 16]], [[24, 26], [24, 54]], [[24, 26], [76, 26], [76, 54]], [[24, 54], [76, 54]], [[14, 70], [6, 88]], [[30, 64], [32, 88], [40, 95], [72, 95], [78, 82]], [[50, 64], [58, 76]], [[78, 64], [92, 82]]],
  '如': [[[28, 4], [14, 46], [46, 92]], [[42, 22], [34, 62], [6, 94]], [[4, 42], [52, 42]], [[62, 30], [62, 82]], [[62, 30], [92, 30], [92, 82]], [[62, 82], [92, 82]]],
  '何': [[[32, 4], [8, 46]], [[22, 30], [22, 96]], [[40, 18], [96, 18]], [[48, 38], [48, 66]], [[48, 38], [72, 38], [72, 66]], [[48, 66], [72, 66]], [[86, 18], [86, 92], [72, 86]]],
};

export const hasGlyph = ch => !!G[ch];

function strokePath(pts, s, ox, oy) {
  const p = new Path2D();
  const P = pts.map(([x, y]) => [ox + x * s, oy + y * s]);
  p.moveTo(P[0][0], P[0][1]);
  if (P.length === 2) { p.lineTo(P[1][0], P[1][1]); return p; }
  // smooth: quadratic through midpoints, but keep sharp corners for right-angle turns
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) + 1e-9);
    if (cos < 0.3) { p.lineTo(b[0], b[1]); continue; } // corner
    const m = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
    p.quadraticCurveTo(b[0], b[1], i === P.length - 2 ? c[0] : m[0], i === P.length - 2 ? c[1] : m[1]);
    if (i === P.length - 2) return p;
  }
  p.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
  return p;
}

// draw glyph in box [x, y-size/2 .. ] centered vertically at y. progress t: Manim "Write" (stroke by stroke)
export function drawGlyph(ctx, ch, x, y, size, color, { t = 1, weight = 0.085, glow = 0 } = {}) {
  const strokes = G[ch]; if (!strokes) return;
  const s = size / 100 * 0.86, ox = x + size * 0.07, oy = y - size * 0.43;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = color; ctx.lineWidth = size * weight;
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  const n = strokes.length;
  for (let i = 0; i < n; i++) {
    const local = Math.min(1, Math.max(0, t * n - i));
    if (local <= 0) break;
    const path = strokePath(strokes[i], s, ox, oy);
    if (local < 1) {
      // partial stroke via dash
      const len = strokeLen(strokes[i]) * s * 1.05;
      ctx.setLineDash([len * local, len * 2]);
    } else ctx.setLineDash([]);
    ctx.stroke(path);
  }
  ctx.restore();
}
function strokeLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }

// Mixed CJK/Latin text. Returns total width. `visible` = number of chars shown (typewriter)
export function mixedWidth(ctx, str, size, font) {
  ctx.save(); ctx.font = font; let w = 0;
  for (const ch of str) w += hasGlyph(ch) ? size * 1.04 : ctx.measureText(ch).width;
  ctx.restore(); return w;
}
export function drawMixed(ctx, str, x, y, { size = 64, color = '#fff', font, visible = Infinity, glow = 0, align = 'left', weight = 0.085, colors = null } = {}) {
  font = font || `700 ${size}px "Noto Sans", sans-serif`;
  const total = mixedWidth(ctx, str, size, font);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.save(); ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  let i = 0;
  for (const ch of str) {
    if (i >= visible) break;
    const col = colors ? (colors[i] || color) : color;
    if (hasGlyph(ch)) { drawGlyph(ctx, ch, cx, y, size, col, { glow, weight }); cx += size * 1.04; }
    else {
      ctx.fillStyle = col;
      if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow; } else ctx.shadowBlur = 0;
      ctx.fillText(ch, cx, y + size * 0.04); cx += ctx.measureText(ch).width;
    }
    i++;
  }
  ctx.restore();
  return { width: total, endX: cx };
}
