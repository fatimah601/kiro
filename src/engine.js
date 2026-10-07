// Frame-driven motion engine (Remotion-style: every frame is a pure function of time)
// + Manim-style primitives (Create / Write / Transform / axes / arrows).

export const W = 1920, H = 1080, FPS = 30;
export const BPM = 120;
export const BEAT = 60 / BPM;          // 0.5s
export const BAR = BEAT * 4;           // 2s
export const DURATION = 72;            // seconds
export const TOTAL_FRAMES = DURATION * FPS;

export const C = {
  bg: '#04050a',
  cyan: '#3df5ff',
  blue: '#3d7bff',
  violet: '#8b5cff',
  magenta: '#ff3da8',
  amber: '#ffc23d',
  green: '#3dffa2',
  white: '#f4f6ff',
  dim: '#5a6380',
  grid: '#1a2340',
};

// ---------- math / easing ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const easeInCubic = t => t * t * t;
export const easeInOutCubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
export const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
// Manim's default rate function
export const smooth = t => { t = clamp(t); const s = 1 - t; return t * t * t * (10 * s * s + 5 * s * t + t * t); };

// Remotion-like interpolate with clamping
export function interpolate(x, inR, outR, ease = v => v) {
  if (x <= inR[0]) return outR[0];
  if (x >= inR[inR.length - 1]) return outR[outR.length - 1];
  for (let i = 0; i < inR.length - 1; i++) {
    if (x >= inR[i] && x <= inR[i + 1]) {
      const t = ease((x - inR[i]) / (inR[i + 1] - inR[i]));
      return lerp(outR[i], outR[i + 1], t);
    }
  }
  return outR[outR.length - 1];
}
// progress of t within [start, start+dur], eased
export const prog = (t, start, dur, ease = smooth) => ease(clamp((t - start) / dur));

// Remotion-like spring (closed-form damped oscillator, mass=1)
export function spring(t, { stiffness = 170, damping = 14 } = {}) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(stiffness), zeta = damping / (2 * w0);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

// seeded random
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- beat helpers ----------
// envelope that spikes on each beat and decays (used for kick-reactive visuals)
export function beatPulse(t, from = 8, to = 60, decay = 6, every = BEAT) {
  if (t < from || t >= to) return 0;
  const k = (t - from) % every;
  return Math.exp(-k * decay);
}
export const beatIndex = (t, from = 0) => Math.floor((t - from) / BEAT);

// ---------- color ----------
export function rgba(hex, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function mix(h1, h2, t) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

// ---------- drawing primitives ----------
export const FONT = '"Noto Sans", sans-serif';
export const MONO = '"Source Code Pro", monospace';

export function text(ctx, str, x, y, { size = 48, weight = 700, color = C.white, align = 'center', base = 'middle', font = FONT, alpha = 1, spacing = 0, glow = 0 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = base;
  ctx.letterSpacing = spacing + 'px';
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

// glowing stroke: wide soft pass + crisp core
export function glowStroke(ctx, path, color, width = 3, glow = 1, alpha = 1) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (glow > 0) {
    ctx.globalAlpha = alpha * 0.18 * glow;
    ctx.strokeStyle = color; ctx.lineWidth = width * 5;
    ctx.stroke(path);
    ctx.globalAlpha = alpha * 0.35 * glow;
    ctx.lineWidth = width * 2.4;
    ctx.stroke(path);
  }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.stroke(path);
  ctx.restore();
}

export function line(x1, y1, x2, y2) { const p = new Path2D(); p.moveTo(x1, y1); p.lineTo(x2, y2); return p; }

// Manim "Create": draw a straight segment partially
export function createLine(ctx, x1, y1, x2, y2, t, color, width = 3, glow = 1, alpha = 1) {
  if (t <= 0) return;
  glowStroke(ctx, line(x1, y1, lerp(x1, x2, t), lerp(y1, y2, t)), color, width, glow, alpha);
}

export function arrow(ctx, x1, y1, x2, y2, t, color, width = 4, head = 18, alpha = 1) {
  if (t <= 0) return;
  const ex = lerp(x1, x2, t), ey = lerp(y1, y2, t);
  const a = Math.atan2(ey - y1, ex - x1);
  const len = Math.hypot(ex - x1, ey - y1);
  const h = Math.min(head, len * 0.5);
  const sx = ex - Math.cos(a) * h * 0.8, sy = ey - Math.sin(a) * h * 0.8;
  glowStroke(ctx, line(x1, y1, sx, sy), color, width, 1, alpha);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - Math.cos(a - 0.42) * h, ey - Math.sin(a - 0.42) * h);
  ctx.lineTo(ex - Math.cos(a + 0.42) * h, ey - Math.sin(a + 0.42) * h);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function dot(ctx, x, y, r, color, alpha = 1, glow = 1) {
  ctx.save();
  ctx.globalAlpha = alpha * 0.25 * glow;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  const p = new Path2D();
  p.roundRect(x, y, w, h, r);
  return p;
}

// polyline partially drawn (Manim Create for curves). pts: [[x,y],...]
export function polyPartial(pts, t) {
  const p = new Path2D();
  if (t <= 0 || pts.length < 2) return p;
  let total = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let left = total * clamp(t);
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    if (left >= seg[i - 1]) { p.lineTo(pts[i][0], pts[i][1]); left -= seg[i - 1]; }
    else { const k = left / seg[i - 1]; p.lineTo(lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)); break; }
  }
  return p;
}

// 3D projection helper (pseudo camera)
export function project(x, y, z, cam) {
  const { yaw = 0, pitch = 0.35, dist = 1400, cx = W / 2, cy = H / 2, scale = 1 } = cam;
  let X = x * Math.cos(yaw) - z * Math.sin(yaw);
  let Z = x * Math.sin(yaw) + z * Math.cos(yaw);
  let Y = y * Math.cos(pitch) - Z * Math.sin(pitch);
  Z = y * Math.sin(pitch) + Z * Math.cos(pitch);
  const f = dist / (dist + Z);
  return [cx + X * f * scale, cy - Y * f * scale, f, Z];
}

// section label (top-left HUD)
export function hud(ctx, idx, label, t, color = C.cyan) {
  const a = prog(t, 0, 0.4);
  ctx.save();
  ctx.globalAlpha = a;
  text(ctx, idx, 96, 92, { size: 22, weight: 600, font: MONO, color, align: 'left' });
  ctx.fillStyle = color; ctx.fillRect(146, 90, 60 * a, 2);
  text(ctx, label, 220, 92, { size: 22, weight: 600, font: MONO, color: C.white, align: 'left', spacing: 6 });
  ctx.restore();
}
