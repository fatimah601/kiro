// Kiro 20s promo — frame-exact canvas renderer + offline synth + WebCodecs + MP4 muxer.
const W = 1920, H = 1080, FPS = 60, DUR = 20, SR = 48000;
const Q = new URLSearchParams(location.search);
const TOKENS = Q.get('tokens') || '1,000,000';
const CNY = Q.get('cny') || '10.00';

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const buf = document.createElement('canvas'); buf.width = W; buf.height = H;
const bctx = buf.getContext('2d');

const C = {
  bg: '#07050d', purple: '#9b5cff', purple2: '#7c3aed', cyan: '#2de2e6', white: '#f5f3ff',
  gray: '#8b85a0', dim: '#4a4560', green: '#3ee6a0', pink: '#ff4fd8', ink: '#0b0614',
};

// ---------- utils ----------
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = x => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, x) => a + (b - a) * x;
const eOutCubic = x => 1 - Math.pow(1 - clamp(x), 3);
const eOutExpo = x => { x = clamp(x); return x === 1 ? 1 : 1 - Math.pow(2, -10 * x); };
const eOutBack = x => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const eInOut = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const eIn = x => { x = clamp(x); return x * x * x; };

// ---------- shared timeline ----------
const KICKS = [];
for (let t = 4; t < 17.9; t += 0.5) KICKS.push(+t.toFixed(3));
KICKS.push(18);
function since(times, t) { let best = -1e9; for (const k of times) if (k <= t && k > best) best = k; return t - best; }
const kickEnv = t => (t < 4 ? 0 : Math.exp(-since(KICKS, t) * 9));

// intro typewriter schedule (shared by audio + video)
const INTRO = [
  { font: '900 66px SC', segs: [['此视频由 ', C.white], ['Kiro', C.purple], [' 自行制作', C.white]] },
  { font: '700 50px Mono, SC', segs: [['总耗费 Token  ', C.gray], [TOKENS, C.cyan]] },
  { font: '700 50px Mono, SC', segs: [['约合人民币  ', C.gray], ['¥ ' + CNY, C.cyan]] },
];
INTRO.forEach(l => { l.chars = []; l.segs.forEach(([s, col]) => [...s].forEach(ch => l.chars.push({ ch, col }))); });
const TYPE_EV = (() => {
  const r = rng(7); const ev = []; let t = 0.35;
  INTRO.forEach((l, li) => {
    l.chars.forEach((c, ci) => { ev.push({ t, li, ci, ch: c.ch }); t += 0.042 + r() * 0.03 + (c.ch === ' ' ? 0.015 : 0); });
    t += 0.24;
  });
  const end = ev[ev.length - 1].t, target = 3.3;
  if (end > target) ev.forEach(e => e.t = 0.35 + (e.t - 0.35) * (target - 0.35) / (end - 0.35));
  return ev;
})();
const PROMPT_TXT = '做一条 20 秒的宣传片';

// ---------- audio ----------
let AUDIO = null, SPEC = null, WAVE = null, ASTATS = null;

async function renderAudio() {
  const ac = new OfflineAudioContext(2, SR * DUR, SR);
  const R = rng(42);
  const nbuf = ac.createBuffer(1, SR * 4, SR);
  { const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1; }
  const G = (v = 0) => { const g = ac.createGain(); g.gain.value = v; return g; };
  const F = (type, f, q = 0.7) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const P = p => { const s = ac.createStereoPanner(); s.pan.value = p; return s; };
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };
  const N = (t, dur) => { const s = ac.createBufferSource(); s.buffer = nbuf; s.start(t, R() * 1.5, dur); return s; };
  const O = (type, f, t, stop) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(stop); return o; };
  const perc = (g, t, v, a, tau) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.setTargetAtTime(0, t + a, tau); };

  const out = G(1); out.connect(ac.destination);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.15;
  comp.connect(out);
  const mix = G(0.55); mix.connect(comp);
  out.gain.setValueAtTime(1, 19.0); out.gain.linearRampToValueAtTime(0.0001, 19.97);

  // reverb
  const ir = ac.createBuffer(2, SR * 2.8, SR);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / d.length, 3.2); }
  const rev = ac.createConvolver(); rev.buffer = ir; chain(rev, G(0.45), mix);
  // dotted-8th delay
  const dly = ac.createDelay(1); dly.delayTime.value = 0.375;
  const fb = G(0.38), dlyF = F('lowpass', 3200);
  dly.connect(dlyF); dlyF.connect(fb); fb.connect(dly); chain(dlyF, G(0.32), mix);
  const drums = G(1); drums.connect(mix);
  const duck = G(1); duck.connect(mix);
  KICKS.forEach(k => { duck.gain.setValueAtTime(0.25, k); duck.gain.linearRampToValueAtTime(1, k + 0.22); });
  const send = (node, dest, v) => { const g = G(v); node.connect(g); g.connect(dest); };

  function kick(t, v = 1) {
    const o = O('sine', 160, t, t + 0.7); const g = G();
    o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.09); o.frequency.exponentialRampToValueAtTime(40, t + 0.45);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.003); g.gain.setTargetAtTime(0, t + 0.09, 0.1);
    chain(o, g, drums);
    const n = N(t, 0.03), gn = G(); chain(n, F('highpass', 1800), gn, drums); perc(gn, t, 0.35 * v, 0.0008, 0.008);
  }
  function clap(t, v = 0.55) {
    const s = N(t, 0.5), g = G(); chain(s, F('highpass', 700), F('bandpass', 1500, 0.9), g, drums); send(g, rev, 0.45);
    g.gain.setValueAtTime(0, t);
    [0, 0.011, 0.022].forEach(o => { g.gain.setValueAtTime(v, t + o); g.gain.setTargetAtTime(0, t + o + 0.001, 0.005); });
    g.gain.setValueAtTime(v, t + 0.033); g.gain.setTargetAtTime(0, t + 0.034, 0.075);
  }
  function snare(t, v = 0.4) {
    const s = N(t, 0.3), g = G(); chain(s, F('bandpass', 1900, 0.6), g, drums); perc(g, t, v, 0.001, 0.05); send(g, rev, 0.25);
    const o = O('triangle', 200, t, t + 0.2), g2 = G(); o.frequency.exponentialRampToValueAtTime(150, t + 0.08); chain(o, g2, drums); perc(g2, t, v * 0.6, 0.001, 0.035);
  }
  function hat(t, v = 0.12, open = false, p = 0) {
    const s = N(t, open ? 0.45 : 0.1), g = G(); chain(s, F('highpass', 7600), g, P(p), drums); perc(g, t, v, 0.001, open ? 0.075 : 0.016);
  }
  function crash(t, v = 0.3) {
    const s = N(t, 2.6), g = G(); chain(s, F('highpass', 3800), g, drums); send(g, rev, 0.6); perc(g, t, v, 0.002, 0.55);
  }
  function boom(t, v = 0.85) {
    const o = O('sine', 70, t, t + 2.6), g = G(); o.frequency.setValueAtTime(72, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.4);
    chain(o, g, mix); perc(g, t, v, 0.006, 0.5);
  }
  function bassNote(t, f, len = 0.11, v = 0.3) {
    const o1 = O('sawtooth', f, t, t + len + 0.3), o2 = O('sine', f / 2, t, t + len + 0.3);
    const lp = F('lowpass', 320, 2.5); lp.frequency.setValueAtTime(1500, t); lp.frequency.setTargetAtTime(320, t, 0.045);
    const g = G(); o1.connect(lp); chain(o2, G(0.9), lp); chain(lp, g, duck);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.setTargetAtTime(0, t + len * 0.6, 0.025);
  }
  function pad(t, dur, freqs, v = 0.035, c0 = 500, c1 = 2200) {
    const lp = F('lowpass', c0, 0.8); lp.frequency.setValueAtTime(c0, t); lp.frequency.linearRampToValueAtTime(c1, t + dur);
    const g = G(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + Math.min(0.5, dur * 0.4));
    g.gain.setValueAtTime(v, t + dur - 0.12); g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    freqs.forEach(f => [-9, 9].forEach(d => { const o = O('sawtooth', f, t, t + dur + 0.2); o.detune.value = d; o.connect(lp); }));
    chain(lp, g, duck); send(g, rev, 0.6);
  }
  function pluck(t, f, v = 0.075, p = 0, type = 'square') {
    const o = O(type, f, t, t + 0.6), lp = F('lowpass', 5000, 3); lp.frequency.setValueAtTime(5200, t); lp.frequency.setTargetAtTime(700, t, 0.045);
    const g = G(); chain(o, lp, g, P(p), duck); send(g, dly, 0.55); send(g, rev, 0.2); perc(g, t, v, 0.002, 0.075);
  }
  function stab(t, freqs, v = 0.05, len = 0.14) {
    const lp = F('lowpass', 3400, 1.2); lp.frequency.setValueAtTime(3600, t); lp.frequency.setTargetAtTime(900, t, len * 0.5);
    const g = G(); chain(lp, g, duck); send(g, rev, 0.5); send(g, dly, 0.25); perc(g, t, v, 0.003, len * 0.45);
    freqs.forEach(f => [-12, 12].forEach(d => { const o = O('sawtooth', f, t, t + len + 0.6); o.detune.value = d; o.connect(lp); }));
  }
  function riser(t0, t1, v = 0.22) {
    const s = N(t0, t1 - t0), bp = F('bandpass', 300, 1.6), g = G();
    bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(9000, t1);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t1 - 0.01); g.gain.linearRampToValueAtTime(0, t1);
    chain(s, bp, g, mix); send(g, rev, 0.4);
    const o = O('sawtooth', 110, t0, t1), lp = F('lowpass', 2400), g2 = G();
    o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(880, t1);
    g2.gain.setValueAtTime(0, t0); g2.gain.linearRampToValueAtTime(v * 0.22, t1 - 0.01); g2.gain.linearRampToValueAtTime(0, t1);
    chain(o, lp, g2, mix);
  }
  function whoosh(t, len = 0.3, v = 0.12) {
    const s = N(t, len + 0.2), bp = F('bandpass', 600, 1.2), g = G();
    bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(6000, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + len * 0.85); g.gain.linearRampToValueAtTime(0, t + len + 0.05);
    chain(s, bp, g, P(0), mix); send(g, rev, 0.4);
  }
  function blip(t, f, v = 0.08) { const o = O('sine', f, t, t + 0.4), g = G(); chain(o, g, mix); send(g, dly, 0.5); perc(g, t, v, 0.002, 0.05); }
  function click(t, v = 0.32) {
    const s = N(t, 0.04), g = G(); chain(s, F('bandpass', 2600 + R() * 2400, 1.1), g, P((R() - 0.5) * 0.4), mix); perc(g, t, v, 0.0005, 0.0065);
    const o = O('sine', 140 + R() * 70, t, t + 0.08), g2 = G(); chain(o, g2, mix); perc(g2, t, v * 0.55, 0.001, 0.012);
  }

  // --- notes ---
  const CH = [
    { b: 110.0, c: [220.0, 261.63, 329.63] },  // Am
    { b: 87.31, c: [174.61, 220.0, 261.63] },  // F
    { b: 130.81, c: [196.0, 261.63, 329.63] }, // C/G
    { b: 98.0, c: [196.0, 246.94, 293.66] },   // G
  ];

  // --- INTRO 0-4 ---
  TYPE_EV.forEach(e => { if (e.ch !== ' ') click(e.t, 0.3); });
  INTRO.forEach((l, li) => { const last = TYPE_EV.filter(e => e.li === li).pop(); blip(last.t + 0.09, [660, 880, 1320][li], 0.035); });
  pad(0, 2, CH[0].c, 0.022, 300, 1200);
  pad(2, 1.88, CH[1].c, 0.026, 500, 2600);
  riser(2.0, 3.875, 0.24);
  [3.0, 3.25, 3.375, 3.5, 3.5625, 3.625, 3.6875, 3.75, 3.78125, 3.8125, 3.84375].forEach((t, i) => snare(t, 0.12 + i * 0.03));

  // --- GROOVE 4-18 ---
  for (let bar = 0; bar < 7; bar++) {
    const t0 = 4 + bar * 2, ch = CH[bar % 4];
    for (let b = 0; b < 4; b++) {
      const tb = t0 + b * 0.5;
      kick(tb, tb >= 17 ? 0.85 : 1);
      if (tb >= 6 && tb < 16 && b % 2 === 1) clap(tb);
      if (tb < 17) hat(tb + 0.25, 0.14, true, 0.12);
      if (tb >= 8 && tb < 17) { hat(tb + 0.125, 0.05, false, -0.35); hat(tb + 0.375, 0.05, false, 0.35); }
      if (tb < 17.5) for (let s = 1; s < 4; s++) bassNote(tb + s * 0.125, ch.b, 0.11, s === 2 ? 0.32 : 0.26);
    }
    pad(t0, 2, ch.c, bar < 2 ? 0.02 : 0.028, 700, 2400);
    if (t0 >= 8 && t0 < 16) {
      const tones = [ch.c[0] * 2, ch.c[1] * 2, ch.c[2] * 2, ch.c[0] * 4];
      const pat = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2];
      for (let i = 0; i < 16; i++) pluck(t0 + i * 0.125, tones[pat[i]], i % 4 === 0 ? 0.08 : 0.06, i % 2 ? 0.3 : -0.3);
    }
    if (t0 >= 12 && t0 < 16) [0.25, 0.75, 1.25, 1.625].forEach(o => stab(t0 + o, ch.c.map(f => f * 2), 0.035));
  }
  [4, 8, 12, 16].forEach(t => crash(t, t === 4 ? 0.34 : 0.22));
  boom(4, 0.9);
  // scene sfx
  whoosh(5.7, 0.3, 0.1); whoosh(9.7, 0.3, 0.09); whoosh(13.7, 0.3, 0.09);
  [...PROMPT_TXT].forEach((ch, i) => { if (ch !== ' ') click(6 + i * 0.125, 0.18); });
  blip(7.5, 1320, 0.07); blip(7.5 + 0.125, 1760, 0.05); whoosh(7.45, 0.5, 0.1);
  [8, 8.5, 9].forEach(t => whoosh(t - 0.12, 0.16, 0.06));
  [9.25, 9.5, 9.75].forEach((t, i) => blip(t, [880, 1108.73, 1318.51][i], 0.07));
  for (let i = 0; i < 9; i++) click(12 + i * 0.2, 0.12);
  for (let i = 0; i < 6; i++) click(14 + i * 0.0625, 0.16);
  [880, 987.77, 1046.5, 1174.66, 1318.51, 1396.91, 1567.98, 1760].forEach((f, i) => blip(14.5 + i * 0.125, f, 0.045));
  blip(15.5, 1760, 0.08); blip(15.5, 2637, 0.04); boom(15.5, 0.35);
  // montage stabs on each cut
  [16, 16.25, 16.5, 16.75].forEach(t => stab(t, CH[2].c.map(f => f * 2), 0.05, 0.12));
  // build to final
  riser(17.0, 17.875, 0.2);
  for (let i = 0; i < 8; i++) snare(17 + i * 0.0625, 0.1 + i * 0.02);
  for (let i = 0; i < 6; i++) snare(17.5 + i * 0.0625, 0.26 + i * 0.03);
  // --- FINAL 18 ---
  kick(18, 1.1); boom(18, 0.95); crash(18, 0.36);
  {
    const t = 18, freqs = [110, 164.81, 220, 246.94, 261.63, 329.63, 440];
    const lp = F('lowpass', 4200, 0.9); lp.frequency.setValueAtTime(4800, t); lp.frequency.exponentialRampToValueAtTime(700, t + 1.9);
    const g = G(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.01); g.gain.setTargetAtTime(0, t + 0.05, 0.75);
    freqs.forEach(f => [-10, 0, 10].forEach(d => { const o = O('sawtooth', f, t, t + 2); o.detune.value = d; o.connect(lp); }));
    chain(lp, g, mix); send(g, rev, 0.9);
    [880, 1318.51, 1760, 2637].forEach((f, i) => pluck(t + 0.125 + i * 0.125, f, 0.05, i % 2 ? 0.4 : -0.4, 'triangle'));
  }

  const ab = await ac.startRendering();
  // normalize to -1 dBFS
  const L = ab.getChannelData(0), Rr = ab.getChannelData(1);
  let peak = 0; for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rr[i]));
  const gn = 0.89 / peak; let ss = 0;
  for (let i = 0; i < L.length; i++) { L[i] *= gn; Rr[i] *= gn; ss += L[i] * L[i] + Rr[i] * Rr[i]; }
  ASTATS = { peakBefore: peak, gain: gn, rmsDb: 10 * Math.log10(ss / (2 * L.length)) };
  return ab;
}

// FFT + per-frame spectrum, waveform peaks
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]];[im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
function analyze(ab) {
  const L = ab.getChannelData(0), Rr = ab.getChannelData(1), n = 2048, NB = 48, frames = FPS * DUR;
  SPEC = []; const prev = new Float32Array(NB);
  const edges = []; for (let b = 0; b <= NB; b++) edges.push(40 * Math.pow(16000 / 40, b / NB));
  const re = new Float32Array(n), im = new Float32Array(n);
  for (let f = 0; f < frames; f++) {
    const c = Math.floor(f / FPS * SR);
    for (let i = 0; i < n; i++) { const k = c - n + i; const s = k >= 0 && k < L.length ? (L[k] + Rr[k]) * 0.5 : 0; re[i] = s * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1))); im[i] = 0; }
    fft(re, im);
    const bands = new Float32Array(NB);
    for (let b = 0; b < NB; b++) {
      const i0 = Math.max(1, Math.floor(edges[b] / SR * n)), i1 = Math.max(i0 + 1, Math.floor(edges[b + 1] / SR * n));
      let m = 0; for (let i = i0; i < i1; i++) m = Math.max(m, Math.hypot(re[i], im[i]));
      const db = 20 * Math.log10(m + 1e-9);
      let v = clamp((db + 10) / 50);
      v = v > prev[b] ? v : prev[b] * 0.86 + v * 0.14;
      prev[b] = v; bands[b] = v;
    }
    SPEC.push(bands);
  }
  const NW = 2000; WAVE = new Float32Array(NW); const per = Math.floor(L.length / NW);
  for (let i = 0; i < NW; i++) { let m = 0; for (let j = i * per; j < (i + 1) * per; j++) m = Math.max(m, Math.abs(L[j]), Math.abs(Rr[j])); WAVE[i] = m; }
}
const specAt = t => SPEC[clamp(Math.round(t * FPS), 0, SPEC.length - 1)];

// ---------- drawing helpers ----------
const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
function txt(s, x, y, font, color, align = 'left', base = 'alphabetic', ls = '0px') {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.letterSpacing = ls; ctx.fillText(s, x, y); ctx.letterSpacing = '0px';
}
function ghostPath(h) {
  const w = h * 0.8, x0 = -w / 2, x1 = w / 2, top = -h / 2, bot = h / 2, cy = top + w / 2;
  ctx.beginPath(); ctx.moveTo(x0, cy); ctx.arc(0, cy, w / 2, Math.PI, 0); ctx.lineTo(x1, bot);
  const n = 3, sw = w / n;
  for (let i = 0; i < n; i++) { const xa = x1 - i * sw, xb = xa - sw; ctx.quadraticCurveTo((xa + xb) / 2, bot - sw * 0.75, xb, bot); }
  ctx.closePath();
}
function drawGhost(x, y, h, o = {}) {
  const { fill = C.white, glow = 50, glowCol = 'rgba(155,92,255,0.95)', eye = '#1a0f2e', blink = 0, alpha = 1 } = o;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y + Math.sin((o.t || 0) * 3) * h * 0.015);
  ctx.shadowColor = glowCol; ctx.shadowBlur = glow; ghostPath(h); ctx.fillStyle = fill; ctx.fill(); ctx.shadowBlur = 0;
  const w = h * 0.8, ey = -h / 2 + w * 0.55, ry = Math.max(1, w * 0.105 * (1 - blink));
  ctx.fillStyle = eye; ctx.beginPath(); ctx.ellipse(-w * 0.17, ey, w * 0.068, ry, 0, 0, 7); ctx.ellipse(w * 0.17, ey, w * 0.068, ry, 0, 0, 7); ctx.fill();
  ctx.restore();
}
function ring(cx, cy, t, t0, r0, r1, col, life = 1.1, lw = 10) {
  const d = t - t0; if (d < 0 || d > life) return; const p = d / life;
  ctx.save(); ctx.globalAlpha *= (1 - p) * 0.8; ctx.strokeStyle = col; ctx.lineWidth = lw * (1 - p) + 1;
  ctx.beginPath(); ctx.arc(cx, cy, r0 + eOutCubic(p) * (r1 - r0), 0, 7); ctx.stroke(); ctx.restore();
}
function burst(t, t0, cx, cy, n, seed, cols, life = 1.2, spd = 900) {
  const d = t - t0; if (d < 0 || d > life) return; const r = rng(seed);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, s = spd * (0.3 + r() * 0.9), sz = 2 + r() * 5, col = cols[i % cols.length];
    const dist = s * (1 - Math.exp(-d * 3.5)) / 3.5 * 3;
    ctx.globalAlpha = (1 - d / life) * (0.6 + r() * 0.4); ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist + d * d * 60, sz * (1 - d / life * 0.5), 0, 7); ctx.fill();
  }
  ctx.restore();
}
function glassPanel(x, y, w, h, r = 24, stroke = 'rgba(155,92,255,0.55)') {
  rr(x, y, w, h, r); ctx.fillStyle = 'rgba(20,14,36,0.82)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
}
function windowChrome(x, y, w, h, title) {
  ctx.save(); ctx.shadowColor = 'rgba(124,58,237,0.45)'; ctx.shadowBlur = 60; glassPanel(x, y, w, h, 20); ctx.restore();
  ctx.save(); rr(x, y, w, h, 20); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(x, y, w, 56);
  ctx.fillStyle = 'rgba(155,92,255,0.25)'; ctx.fillRect(x, y + 56, w, 1);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 32 + i * 26, y + 28, 7.5, 0, 7); ctx.fill(); });
  txt(title, x + w / 2, y + 29, '400 22px Mono', C.gray, 'center', 'middle');
  ctx.restore();
}
function checkMark(cx, cy, s, col, lw, p = 1) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pts = [[-0.42, 0.02], [-0.12, 0.32], [0.45, -0.3]];
  const L1 = Math.hypot(0.3, 0.3), L2 = Math.hypot(0.57, 0.62), tot = L1 + L2, d = p * tot;
  ctx.beginPath(); ctx.moveTo(cx + pts[0][0] * s, cy + pts[0][1] * s);
  if (d <= L1) { const q = d / L1; ctx.lineTo(cx + lerp(pts[0][0], pts[1][0], q) * s, cy + lerp(pts[0][1], pts[1][1], q) * s); }
  else { ctx.lineTo(cx + pts[1][0] * s, cy + pts[1][1] * s); const q = (d - L1) / L2; ctx.lineTo(cx + lerp(pts[1][0], pts[2][0], q) * s, cy + lerp(pts[1][1], pts[2][1], q) * s); }
  ctx.stroke(); ctx.restore();
}

// precomputed overlays
const vign = document.createElement('canvas'); vign.width = W; vign.height = H;
{ const v = vign.getContext('2d'); const g = v.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.72)'); v.fillStyle = g; v.fillRect(0, 0, W, H); }
const grain = document.createElement('canvas'); grain.width = 256; grain.height = 256;
{ const g = grain.getContext('2d'), id = g.createImageData(256, 256), r = rng(99); for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } g.putImageData(id, 0, 0); }
let grainPat = null;
const PARTS = (() => { const r = rng(5); return Array.from({ length: 110 }, () => ({ x: r() * W, y: r() * H, v: 10 + r() * 40, s: 0.8 + r() * 2.2, a: 0.15 + r() * 0.45, ph: r() * 6 })); })();

function background(t, k, glowMul = 1) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const gl = (t < 4 ? 0.1 + 0.22 * clamp((t - 1.5) / 2.4) : 0.22 + 0.32 * k) * glowMul;
  const g = ctx.createRadialGradient(W / 2, H * 0.48, 0, W / 2, H * 0.48, 950);
  g.addColorStop(0, `rgba(124,58,237,${gl})`); g.addColorStop(0.55, `rgba(80,30,160,${gl * 0.35})`); g.addColorStop(1, 'rgba(20,8,40,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const ga = t < 4 ? 0.025 + 0.09 * eIn((t - 1.8) / 2.07) : 0.045 + 0.06 * k;
  ctx.strokeStyle = `rgba(155,92,255,${ga})`; ctx.lineWidth = 1; ctx.beginPath();
  const off = (t * 30) % 80;
  for (let x = -80 + off; x < W + 80; x += 80) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = -80 + off * 0.5; y < H + 80; y += 80) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  for (const p of PARTS) {
    const y = ((p.y - t * p.v) % H + H) % H, x = p.x + Math.sin(t * 0.8 + p.ph) * 20;
    ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t * 2 + p.ph)) * (t < 4 ? 0.6 : 1); ctx.fillStyle = '#c4a8ff';
    ctx.beginPath(); ctx.arc(x, y, p.s, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function hud(t, label, idx) {
  ctx.save();
  if (label) {
    const a = eOutCubic((t - Math.floor(t / 2) * 2) / 0.25);
    txt(idx, 80, 92, '700 26px Mono', C.purple, 'left', 'alphabetic', '2px');
    txt(label, 128, 92, '700 26px Mono', C.white, 'left', 'alphabetic', '6px');
    ctx.fillStyle = C.purple; ctx.fillRect(80, 106, 220 * a, 3);
  } else if (t < 4) {
    ctx.globalAlpha = Math.floor(t * 2) % 2 === 0 ? 1 : 0.25; ctx.fillStyle = '#ff3b5c'; ctx.beginPath(); ctx.arc(90, 84, 9, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    txt('REC  ·  KIRO AUTONOMOUS RENDER', 112, 92, '700 22px Mono', C.gray, 'left', 'alphabetic', '3px');
  }
  // bpm
  const beat = t >= 4 ? Math.floor((t - 4) / 0.5) % 4 : -1;
  txt('120 BPM', W - 80 - 4 * 22 - 18, 92, '700 22px Mono', C.gray, 'right', 'alphabetic', '3px');
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i === beat ? C.purple : 'rgba(155,92,255,0.22)'; ctx.fillRect(W - 80 - (4 - i) * 22 + 4, 76, 14, 14); }
  const fr = Math.round(t * FPS), ss = Math.floor(fr / FPS), ff = fr % FPS;
  txt(`00:00:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`, 80, H - 70, '400 22px Mono', C.gray, 'left', 'alphabetic', '2px');
  txt('1920×1080 · 60FPS · H.264 + OPUS', W - 80, H - 70, '400 22px Mono', C.dim, 'right', 'alphabetic', '2px');
  ctx.fillStyle = 'rgba(155,92,255,0.18)'; ctx.fillRect(80, H - 48, W - 160, 3);
  ctx.fillStyle = C.purple; ctx.fillRect(80, H - 48, (W - 160) * t / DUR, 3);
  ctx.restore();
}

// ---------- scenes ----------
function drawIntroText(t, dx = 0, dy = 0, colOverride = null) {
  const X = 330, Y = [440, 560, 660];
  let cursor = null;
  INTRO.forEach((l, li) => {
    const typed = TYPE_EV.filter(e => e.li === li && e.t <= t).length;
    if (typed === 0) return;
    ctx.font = l.font; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    txt('›', X - 70 + dx, Y[li] + dy, '700 56px Mono, SC', colOverride || C.purple);
    ctx.font = l.font; let x = X;
    for (let i = 0; i < typed; i++) {
      const c = l.chars[i]; ctx.fillStyle = colOverride || c.col; ctx.font = l.font; ctx.fillText(c.ch, x + dx, Y[li] + dy); x += ctx.measureText(c.ch).width;
    }
    cursor = { x, y: Y[li], size: parseInt(l.font.split(' ')[1]) };
  });
  return cursor;
}
function sceneIntro(t) {
  const r = clamp((t - 3.25) / 0.625);
  if (t >= 3.875) {
    const d = (t - 3.875) / 0.125; ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(1 + d * 0.25, 1 + d * 0.25); ctx.translate(-W / 2, -H / 2);
    ctx.globalAlpha = 1 - d * 0.6; drawIntroText(t, 0, 0); ctx.restore(); return;
  }
  const sh = r * r * 6, dx = (hash(t * 60) - 0.5) * sh, dy = (hash(t * 60 + 3) - 0.5) * sh;
  if (r > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 * r;
    drawIntroText(t, dx - 10 * r, dy, C.cyan); drawIntroText(t, dx + 10 * r, dy, C.pink); ctx.restore();
  }
  const cur = drawIntroText(t, dx, dy);
  const lastT = TYPE_EV.filter(e => e.t <= t).pop()?.t ?? -1;
  const typing = lastT >= 0 && t - lastT < 0.25;
  const on = typing || Math.floor(t * 4) % 2 === 0;
  if (on) {
    const cx = cur ? cur.x + 8 : 330, cy = cur ? cur.y : 440, s = cur ? cur.size : 66;
    ctx.fillStyle = C.purple; ctx.fillRect(cx + dx, cy - s * 0.82 + dy, s * 0.5, s * 0.95);
  }
}
function sceneDrop(t, lt) {
  const cy = 470, up = -70 * eInOut((lt - 0.85) / 0.45);
  for (const kt of [4, 4.5, 5, 5.5]) ring(W / 2, cy + up, t, kt, 190, kt === 4 ? 1100 : 760, kt === 4 ? '#ffffff' : C.purple, 1.1, kt === 4 ? 16 : 8);
  burst(t, 4, W / 2, cy, 120, 3, [C.purple, C.cyan, '#ffffff'], 1.6, 1100);
  const s = eOutBack(lt / 0.42), k = kickEnv(t);
  drawGhost(W / 2, cy + up, 330 * (0.3 + 0.7 * s) * (1 + 0.04 * k), { glow: 60 + 60 * k, t });
  const wa = eOutCubic((lt - 0.95) / 0.35);
  if (wa > 0) {
    ctx.save(); ctx.globalAlpha = wa;
    txt('Kiro', W / 2, 850 + (1 - wa) * 50, '900 180px SC', C.white, 'center', 'alphabetic', '4px'); ctx.restore();
  }
}
function scenePrompt(t, lt) {
  const a = eOutCubic(lt / 0.2), sc = 0.9 + 0.1 * eOutBack(lt / 0.35);
  const sent = clamp((t - 7.5) / 0.3), lift = -60 * eOutCubic(sent);
  ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, 520 + lift); ctx.scale(sc, sc);
  const bw = 1260, bh = 156;
  ctx.save(); ctx.shadowColor = `rgba(155,92,255,${0.4 + 0.5 * sent})`; ctx.shadowBlur = 50 + 40 * sent;
  rr(-bw / 2, -bh / 2, bw, bh, 40); ctx.fillStyle = 'rgba(22,15,40,0.9)'; ctx.fill(); ctx.restore();
  const grd = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0); grd.addColorStop(0, C.purple); grd.addColorStop(1, C.cyan);
  rr(-bw / 2, -bh / 2, bw, bh, 40); ctx.lineWidth = 3; ctx.strokeStyle = grd; ctx.stroke();
  drawGhost(-bw / 2 + 82, 2, 74, { glow: 20 });
  const n = t >= 6 ? clamp(Math.floor((t - 6) / 0.125) + 1, 0, [...PROMPT_TXT].length) : 0;
  const s = [...PROMPT_TXT].slice(0, n).join('');
  txt(s, -bw / 2 + 150, 4, '700 58px SC', C.white, 'left', 'middle');
  ctx.font = '700 58px SC'; const tw = ctx.measureText(s).width;
  if (sent === 0 && (t - 6 < 1.45 || Math.floor(t * 4) % 2 === 0)) { ctx.fillStyle = C.purple; ctx.fillRect(-bw / 2 + 158 + tw, -32, 5, 64); }
  const ready = n === [...PROMPT_TXT].length, pulse = t >= 7.5 ? 1 + 0.35 * (1 - eOutCubic((t - 7.5) / 0.3)) : 1;
  ctx.save(); ctx.translate(bw / 2 - 86, 0); ctx.scale(pulse, pulse);
  ctx.fillStyle = ready ? C.purple : 'rgba(155,92,255,0.25)'; ctx.beginPath(); ctx.arc(0, 0, 48, 0, 7); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(0, -20); ctx.moveTo(-16, -4); ctx.lineTo(0, -20); ctx.lineTo(16, -4); ctx.stroke(); ctx.restore();
  ring(bw / 2 - 86, 0, t, 7.5, 50, 220, C.purple, 0.5, 6);
  ctx.restore();
  if (t > 7.6) {
    ctx.save(); ctx.globalAlpha = eOutCubic((t - 7.6) / 0.15);
    for (let i = 0; i < 3; i++) { const b = Math.max(0, Math.sin((t - 7.6) * 14 - i * 0.9)); ctx.fillStyle = [C.purple, '#b48cff', C.cyan][i]; ctx.beginPath(); ctx.arc(W / 2 - 40 + i * 40, 680 - b * 18, 11, 0, 7); ctx.fill(); }
    ctx.restore();
  }
}
function sceneSpec(t, lt) {
  const titles = ['需求', '设计', '任务'], files = ['requirements.md', 'design.md', 'tasks.md'];
  const cw = 470, ch = 560, gap = 60, x0 = W / 2 - (cw * 3 + gap * 2) / 2, y0 = 270;
  for (let i = 0; i < 2; i++) {
    const p = clamp((t - (8.35 + i * 0.5)) / 0.3); if (p <= 0) continue;
    const xa = x0 + cw * (i + 1) + 6, xb = xa + gap - 12, y = y0 + ch / 2;
    ctx.strokeStyle = C.purple; ctx.lineWidth = 3; ctx.setLineDash([8, 8]); ctx.lineDashOffset = -t * 60;
    ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(lerp(xa, xb, p), y); ctx.stroke(); ctx.setLineDash([]);
  }
  for (let i = 0; i < 3; i++) {
    const ti = 8 + i * 0.5, p = eOutBack((t - ti) / 0.35), a = eOutCubic((t - ti) / 0.2); if (a <= 0) continue;
    const x = x0 + i * (cw + gap), y = y0 + (1 - p) * 140;
    const tc = 9.25 + i * 0.25, done = t >= tc, cp = eOutBack((t - tc) / 0.3);
    ctx.save(); ctx.globalAlpha = a;
    ctx.save(); ctx.shadowColor = done ? 'rgba(62,230,160,0.45)' : 'rgba(124,58,237,0.4)'; ctx.shadowBlur = 50;
    glassPanel(x, y, cw, ch, 28, done ? 'rgba(62,230,160,0.8)' : 'rgba(155,92,255,0.6)'); ctx.restore();
    ctx.fillStyle = C.purple; ctx.beginPath(); ctx.arc(x + 70, y + 80, 30, 0, 7); ctx.fill();
    txt(String(i + 1), x + 70, y + 82, '700 32px Mono', '#fff', 'center', 'middle');
    txt(titles[i], x + 122, y + 96, '900 56px SC', C.white);
    txt(files[i], x + 44, y + 170, '400 26px Mono', C.gray);
    const r = rng(20 + i);
    for (let j = 0; j < 6; j++) {
      const grow = eOutCubic((t - ti - 0.15 - j * 0.06) / 0.3), wj = (0.45 + r() * 0.5) * (cw - 88);
      ctx.fillStyle = j === 0 ? 'rgba(155,92,255,0.55)' : 'rgba(255,255,255,0.13)';
      rr(x + 44, y + 220 + j * 46, wj * grow, 16, 8); ctx.fill();
    }
    if (done) {
      ctx.save(); ctx.translate(x + cw - 76, y + ch - 76); ctx.scale(cp, cp);
      ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.fill(); checkMark(0, 0, 44, C.ink, 9, clamp((t - tc) / 0.2));
      ctx.restore(); ring(x + cw - 76, y + ch - 76, t, tc, 40, 140, C.green, 0.5, 5);
    }
    ctx.restore();
  }
}
const CODE = [
  'import { render } from "kiro";',
  'const bpm  = 120;',
  'const beat = 60 / bpm;',
  '',
  'export async function promo(t) {',
  '  kick(every(beat));',
  '  bass(roll("Am F C G"));',
  '  type("此视频由 Kiro 自行制作");',
  '  ghost.pulse(onBeat(t));',
  '  scenes([prompt, spec, code,',
  '          edit, ship]).cut(beat);',
  '  return render({',
  '    fps: 60, size: "1080p",',
  '    codec: ["h264", "opus"],',
  '  });',
  '}',
];
const KW = new Set(['import', 'from', 'const', 'export', 'async', 'function', 'return']);
function tokenize(line) {
  const re = /("[^"]*")|(\b\d+\b)|([A-Za-z_]\w*)(?=\()|([A-Za-z_]\w*)|(\s+)|(.)/g; const out = []; let m;
  while ((m = re.exec(line))) {
    if (m[1]) out.push([m[1], '#a5e8a0']); else if (m[2]) out.push([m[2], '#ffb86c']); else if (m[3]) out.push([m[3], '#82aaff']);
    else if (m[4]) out.push([m[4], KW.has(m[4]) ? '#c792ea' : '#e6e1ff']); else if (m[5]) out.push([m[5], '#fff']); else out.push([m[6], '#8b85a0']);
  }
  return out;
}
const CODE_TOK = CODE.map(tokenize);
function sceneCode(t, lt) {
  const a = eOutCubic(lt / 0.2), sc = 0.94 + 0.06 * eOutBack(lt / 0.35);
  const x = 300, y = 150, w = 1320, h = 790;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
  windowChrome(x, y, w, h, 'promo.js — kiro');
  const lh = 41, ly0 = y + 110, k = kickEnv(t);
  let cur = -1, curX = x + 120;
  ctx.font = '400 28px Mono, SC'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  for (let i = 0; i < CODE.length; i++) {
    const ti = 10 + i * 0.115; if (t < ti) break; cur = i;
    const p = clamp((t - ti) / 0.1), total = CODE[i].length, show = Math.ceil(total * p);
    txt(String(i + 1).padStart(2, ' '), x + 40, ly0 + i * lh, '400 26px Mono', C.dim);
    let cx = x + 120, used = 0; ctx.font = '400 28px Mono, SC';
    for (const [s, col] of CODE_TOK[i]) {
      if (used >= show) break; const part = s.slice(0, show - used); used += part.length;
      ctx.fillStyle = col; ctx.fillText(part, cx, ly0 + i * lh); cx += ctx.measureText(part).width;
    }
    curX = cx;
  }
  if (cur >= 0) {
    ctx.fillStyle = `rgba(155,92,255,${0.1 + 0.12 * k})`; ctx.fillRect(x + 2, ly0 + cur * lh - 31, w - 4, lh);
    ctx.fillStyle = C.purple; ctx.fillRect(curX + 4, ly0 + cur * lh - 28, 4, 34);
    drawGhost(curX + 40, ly0 + cur * lh - 12, 34, { glow: 14 });
  }
  // minimap
  for (let i = 0; i <= cur; i++) { ctx.fillStyle = 'rgba(155,92,255,0.35)'; ctx.fillRect(x + w - 120, y + 90 + i * 9, Math.min(90, CODE[i].length * 2.6), 4); }
  ctx.restore();
}
const CLIPS = [[0, 4, 'INTRO'], [4, 6, 'DROP'], [6, 8, 'PROMPT'], [8, 10, 'SPEC'], [10, 12, 'CODE'], [12, 14, 'EDIT'], [14, 16, 'SHIP'], [16, 18, 'CUTS'], [18, 20, 'END']];
function sceneEdit(t, lt) {
  const a = eOutCubic(lt / 0.2);
  ctx.save(); ctx.globalAlpha = a;
  // preview monitor with live spectrum
  const mx = 480, my = 140, mw = 960, mh = 380;
  ctx.save(); ctx.shadowColor = 'rgba(124,58,237,0.45)'; ctx.shadowBlur = 50; glassPanel(mx, my, mw, mh, 20); ctx.restore();
  const sp = specAt(t), nb = sp.length, bw = (mw - 100) / nb, mid = my + mh / 2;
  const grd = ctx.createLinearGradient(mx, 0, mx + mw, 0); grd.addColorStop(0, C.purple); grd.addColorStop(1, C.cyan);
  ctx.fillStyle = grd;
  for (let i = 0; i < nb; i++) { const hgt = 6 + sp[i] * 150; rr(mx + 50 + i * bw + 2, mid - hgt, bw - 5, hgt * 2, 4); ctx.fill(); }
  // timeline
  const tx = 150, ty = 580, tw = 1620, th = 380;
  glassPanel(tx, ty, tw, th, 20);
  const cx0 = tx + 110, cw = tw - 140, X = s => cx0 + s / DUR * cw;
  for (let s = 0; s <= 20; s++) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(X(s), ty + 22, 2, s % 2 ? 8 : 16);
    if (s % 4 === 0) txt(s + 's', X(s) + 6, ty + 38, '400 16px Mono', C.gray);
  }
  [['V1', ty + 95], ['A1', ty + 205], ['♪', ty + 315]].forEach(([l, yy]) => txt(l, tx + 40, yy, '700 22px Mono, SC', C.gray, 'left', 'middle'));
  const cols = ['#5b2bd1', '#7c3aed', '#6d28d9', '#8b5cf6'];
  CLIPS.forEach(([s0, s1, name], i) => {
    const ti = 12 + i * 0.2, p = eOutBack((t - ti) / 0.25), al = clamp((t - ti) / 0.1); if (al <= 0) return;
    const yy = ty + 62 - (1 - p) * 70, ph = t >= 12 ? clamp((t - 12) / 2) * 20 : 0, act = ph >= s0 && ph < s1;
    ctx.save(); ctx.globalAlpha *= al; rr(X(s0) + 2, yy, X(s1) - X(s0) - 4, 66, 10);
    ctx.fillStyle = act ? C.purple : cols[i % 4]; ctx.fill(); if (act) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    txt(name, X(s0) + 14, yy + 40, '700 16px Mono', '#fff'); ctx.restore();
  });
  const wp = clamp((t - 12.1) / 0.9), nW = Math.floor(cw / 3 * wp);
  ctx.fillStyle = 'rgba(45,226,230,0.85)';
  for (let i = 0; i < nW; i++) { const v = WAVE[Math.floor(i * 3 / cw * WAVE.length)], hh = 3 + v * 46; ctx.fillRect(cx0 + i * 3, ty + 205 - hh, 2, hh * 2); }
  KICKS.forEach((kt, i) => {
    const ti = 12.2 + i * 0.05, al = clamp((t - ti) / 0.1); if (al <= 0) return;
    const ph = clamp((t - 12) / 2) * 20, hot = Math.abs(ph - kt) < 0.3;
    ctx.save(); ctx.globalAlpha *= al; ctx.translate(X(kt), ty + 315); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = hot ? C.pink : 'rgba(155,92,255,0.8)'; const z = hot ? 9 : 6; ctx.fillRect(-z, -z, z * 2, z * 2); ctx.restore();
  });
  const px = X(clamp((t - 12) / 2) * 20);
  ctx.fillStyle = C.pink; ctx.fillRect(px - 1.5, ty + 14, 3, th - 28);
  ctx.beginPath(); ctx.moveTo(px - 11, ty + 8); ctx.lineTo(px + 11, ty + 8); ctx.lineTo(px, ty + 24); ctx.fill();
  ctx.restore();
}
function sceneShip(t, lt) {
  const live = clamp((t - 15.5) / 0.25);
  const a = eOutCubic(lt / 0.2), sc = (0.94 + 0.06 * eOutBack(lt / 0.35)) * (1 - 0.08 * live);
  const x = 420, y = 250, w = 1080, h = 560;
  ctx.save(); ctx.globalAlpha = a * (1 - 0.7 * live); ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
  windowChrome(x, y, w, h, 'zsh — deploy');
  const cmd = '$ git push origin main', n = Math.floor(clamp((t - 14) / 0.375) * cmd.length);
  txt(cmd.slice(0, 1), x + 50, y + 130, '700 34px Mono', C.green);
  txt(cmd.slice(1, n), x + 50 + 21, y + 130, '700 34px Mono', C.white);
  if (t >= 14.5) {
    txt('▸ build  ▸ test  ▸ deploy', x + 50, y + 210, '400 28px Mono, SC', C.gray);
    const steps = clamp(Math.floor((t - 14.5) / 0.125) + 1, 0, 8), pw = w - 100;
    rr(x + 50, y + 260, pw, 34, 17); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    const g = ctx.createLinearGradient(x + 50, 0, x + 50 + pw, 0); g.addColorStop(0, C.purple); g.addColorStop(1, C.green);
    rr(x + 50, y + 260, pw * steps / 8, 34, 17); ctx.fillStyle = g; ctx.fill();
    txt(Math.round(steps / 8 * 100) + '%', x + w - 50, y + 350, '700 30px Mono', steps === 8 ? C.green : C.white, 'right');
  }
  if (t >= 15.5) txt('✓ production · live', x + 50, y + 450, '700 30px Mono, SC', C.green);
  ctx.restore();
  if (live > 0) {
    const p = eOutBack((t - 15.5) / 0.3);
    ring(W / 2, 500, t, 15.5, 120, 600, C.green, 0.6, 10);
    burst(t, 15.5, W / 2, 500, 70, 11, [C.green, C.cyan, '#fff'], 0.8, 900);
    ctx.save(); ctx.translate(W / 2, 500); ctx.scale(p, p); ctx.shadowColor = 'rgba(62,230,160,0.8)'; ctx.shadowBlur = 60;
    ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(0, 0, 130, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    checkMark(0, 0, 150, C.ink, 26, clamp((t - 15.55) / 0.2)); ctx.restore();
    ctx.save(); ctx.globalAlpha = clamp((t - 15.62) / 0.15);
    txt('已上线', W / 2, 760, '900 72px SC', C.white, 'center', 'alphabetic', '12px'); ctx.restore();
  }
}
function sceneCuts(t, lt) {
  if (t < 17) {
    const i = Math.floor((t - 16) / 0.25), l = (t - 16 - i * 0.25) / 0.25;
    const words = ['VIBE', 'SPEC', 'CODE', 'SHIP'], bgs = [C.purple, '#05030a', C.cyan, C.white], fgs = [C.ink, C.white, C.ink, C.ink];
    ctx.fillStyle = bgs[i]; ctx.fillRect(-100, -100, W + 200, H + 200);
    const z = 1.18 - 0.18 * eOutExpo(l / 0.6);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z);
    if (i === 1) { ctx.globalCompositeOperation = 'lighter'; txt(words[i], -8, 110, '900 320px SC', 'rgba(45,226,230,0.6)', 'center', 'alphabetic', '24px'); txt(words[i], 8, 110, '900 320px SC', 'rgba(255,79,216,0.6)', 'center', 'alphabetic', '24px'); ctx.globalCompositeOperation = 'source-over'; }
    txt(words[i], 0, 110, '900 320px SC', fgs[i], 'center', 'alphabetic', '24px'); ctx.restore();
    txt(`0${i + 1} / 04`, 80, H - 70, '700 26px Mono', fgs[i], 'left', 'alphabetic', '4px');
    drawGhost(W - 120, H - 110, 70, { fill: fgs[i], glow: 0, eye: bgs[i] });
    return;
  }
  // tunnel 17 - 18
  ctx.fillStyle = '#05030a'; ctx.fillRect(-100, -100, W + 200, H + 200);
  if (t >= 17.875) { drawGhost(W / 2, H / 2, 140 + (t - 17.875) * 300, { glow: 30, t }); return; }
  const ph = t - 17, travel = 5 * ph + 9 * ph * ph, fr = travel % 1, base = Math.floor(travel);
  for (let j = 14; j >= 0; j--) {
    const z = j + 1 - fr, s = 1 / (z * 0.32), size = 380 * s;
    if (size > 4000) continue;
    ctx.globalAlpha = clamp(1 - z / 15) * 0.9; ctx.strokeStyle = (j + base) % 2 ? C.purple : C.cyan; ctx.lineWidth = Math.max(1.5, 7 * s);
    rr(W / 2 - size / 2 * 1.6, H / 2 - size / 2, size * 1.6, size, size * 0.12); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (Math.floor(ph / 0.0625) % 2 === 0 && ph > 0.5) { ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(0, 0, W, H); }
  drawGhost(W / 2, H / 2, 70 + ph * 90, { glow: 40, t });
}
function sceneEnd(t, lt) {
  ring(W / 2, 420, t, 18, 160, 1200, '#ffffff', 1.4, 18);
  ring(W / 2, 420, t, 18.12, 160, 800, C.purple, 1.2, 8);
  burst(t, 18, W / 2, 420, 140, 21, [C.purple, C.cyan, '#ffffff', C.pink], 1.8, 1300);
  const s = 1 + 0.6 * (1 - eOutExpo(lt / 0.5));
  const bl = t > 19.2 && t < 19.36 ? Math.sin((t - 19.2) / 0.16 * Math.PI) : 0;
  drawGhost(W / 2, 420, 290 * s, { glow: 80, t, blink: bl });
  const wa = eOutCubic(lt / 0.35);
  ctx.save(); ctx.globalAlpha = wa; txt('Kiro', W / 2, 735 + (1 - wa) * 40, '900 160px SC', C.white, 'center', 'alphabetic', '4px'); ctx.restore();
  const ta = eOutCubic((lt - 0.4) / 0.4);
  if (ta > 0) {
    ctx.save(); ctx.globalAlpha = ta; ctx.beginPath(); ctx.rect(0, 770, W / 2 - 330 + 660 * ta, 80); ctx.clip();
    txt('从想法，到上线', W / 2, 828, '300 46px SC', '#d9ccff', 'center', 'alphabetic', '16px'); ctx.restore();
  }
  const ua = eOutCubic((lt - 0.8) / 0.4);
  if (ua > 0) { ctx.save(); ctx.globalAlpha = ua; txt('kiro.dev', W / 2, 900, '400 28px Mono', C.gray, 'center', 'alphabetic', '6px'); ctx.restore(); }
  const sp = specAt(t), nb = sp.length;
  for (let i = 0; i < nb; i++) {
    const v = sp[i], x1 = W / 2 + (i + 0.5) * 14, x2 = W / 2 - (i + 0.5) * 14, hh = 2 + v * 40;
    ctx.fillStyle = `rgba(155,92,255,${0.25 + v * 0.6})`; ctx.fillRect(x1 - 4, 990 - hh, 8, hh); ctx.fillRect(x2 - 4, 990 - hh, 8, hh);
  }
}

function glitch(amount, seed) {
  if (amount <= 0.01) return;
  bctx.globalCompositeOperation = 'copy'; bctx.drawImage(cv, 0, 0); bctx.globalCompositeOperation = 'source-over';
  const r = rng(seed), n = 5 + Math.floor(amount * 14);
  for (let i = 0; i < n; i++) {
    const y = Math.floor(r() * H), h = Math.floor(8 + r() * 90 * amount), dx = (r() - 0.5) * 220 * amount;
    ctx.drawImage(buf, 0, y, W, h, dx, y, W, h);
    if (r() < 0.35) { ctx.fillStyle = r() < 0.5 ? 'rgba(45,226,230,0.25)' : 'rgba(255,79,216,0.25)'; ctx.fillRect(0, y, W, h); }
  }
}

function drawFrame(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
  const k = kickEnv(t);
  background(t, k, t >= 18 ? 1.6 : 1);
  ctx.save();
  let sc = 1 + 0.016 * k, sx = 0, sy = 0;
  for (const [b, amp] of [[4, 16], [18, 14], [15.5, 6]]) if (t >= b && t < b + 0.4) { const a = (1 - (t - b) / 0.4) * amp; sx += (hash(t * 60) - 0.5) * a * 2; sy += (hash(t * 60 + 9) - 0.5) * a * 2; }
  ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
  if (t < 4) sceneIntro(t);
  else if (t < 6) sceneDrop(t, t - 4);
  else if (t < 8) scenePrompt(t, t - 6);
  else if (t < 10) sceneSpec(t, t - 8);
  else if (t < 12) sceneCode(t, t - 10);
  else if (t < 14) sceneEdit(t, t - 12);
  else if (t < 16) sceneShip(t, t - 14);
  else if (t < 18) sceneCuts(t, t - 16);
  else sceneEnd(t, t - 18);
  ctx.restore();
  const LBL = { 6: ['01', 'PROMPT'], 8: ['02', 'SPEC'], 10: ['03', 'CODE'], 12: ['04', 'EDIT'], 14: ['05', 'SHIP'] };
  if (t < 4) hud(t, null);
  else if (t >= 6 && t < 16) { const s = LBL[Math.floor(t / 2) * 2]; hud(t, s[1], s[0]); }
  // glitches at cuts
  let g = 0;
  if (t >= 3.875 && t < 4.06) g = 1;
  for (const b of [6, 8, 10, 12, 14, 16, 17]) g = Math.max(g, (1 - Math.abs(t - b) / 0.05) * 0.55);
  if (t >= 17.95 && t < 18.05) g = Math.max(g, 0.9);
  glitch(g, Math.floor(t * FPS) + 1);
  // flashes
  let fl = 0;
  for (const [b, s, d] of [[4, 0.95, 0.18], [18, 0.95, 0.22], [8, 0.3, 0.1], [12, 0.3, 0.1], [16, 0.25, 0.08], [15.5, 0.25, 0.1]]) if (t >= b && t < b + d) fl = Math.max(fl, s * (1 - (t - b) / d));
  if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${fl})`; ctx.fillRect(0, 0, W, H); }
  ctx.drawImage(vign, 0, 0);
  if (!grainPat) grainPat = ctx.createPattern(grain, 'repeat');
  ctx.save(); ctx.globalAlpha = 0.045; ctx.translate(Math.floor(hash(t * 7) * 256), Math.floor(hash(t * 11) * 256)); ctx.fillStyle = grainPat; ctx.fillRect(-256, -256, W + 512, H + 512); ctx.restore();
  if (t < 0.25) { ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.25})`; ctx.fillRect(0, 0, W, H); }
  if (t > 19.45) { ctx.fillStyle = `rgba(0,0,0,${eInOut((t - 19.45) / 0.5)})`; ctx.fillRect(0, 0, W, H); }
}

// ---------- MP4 muxer (H.264 + Opus, faststart) ----------
const te = new TextEncoder();
const cat = arrs => { let n = 0; for (const a of arrs) n += a.length; const o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; };
const u8 = v => new Uint8Array([v & 255]);
const u16 = v => new Uint8Array([(v >> 8) & 255, v & 255]);
const u32 = v => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
const str = s => te.encode(s);
const zeros = n => new Uint8Array(n);
const box = (type, ...parts) => { const body = cat(parts.flat(Infinity)); return cat([u32(body.length + 8), str(type), body]); };
const fbox = (type, ver, flags, ...parts) => box(type, u8(ver), u8(flags >> 16), u16(flags & 0xffff), ...parts);
const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(u32);

function buildMp4(vs, vdesc, as, preSkip) {
  const VTS = FPS * 1000, VD = 1000, ATS = SR;
  const vDur = vs.length * VD, aDur = as.reduce((s, a) => s + a.dur, 0);
  // interleave in 0.5s chunks
  const chunks = []; // {track, samples:[...]} in file order
  const step = 0.5;
  for (let c = 0; c * step < DUR + 1; c++) {
    const lo = c * step * 1e6, hi = (c + 1) * step * 1e6;
    const v = vs.filter(s => s.ts >= lo && s.ts < hi), a = as.filter(s => s.ts >= lo && s.ts < hi);
    if (v.length) chunks.push({ tr: 0, s: v }); if (a.length) chunks.push({ tr: 1, s: a });
  }
  const trackTables = base => {
    const off = [[], []], stsc = [[], []]; let p = base;
    chunks.forEach(ch => { off[ch.tr].push(p); stsc[ch.tr].push(ch.s.length); p += ch.s.reduce((s, x) => s + x.data.length, 0); });
    return { off, stsc };
  };
  const stscBox = counts => { const e = []; counts.forEach((n, i) => { if (!e.length || e[e.length - 1][1] !== n) e.push([i + 1, n]); }); return fbox('stsc', 0, 0, u32(e.length), e.map(([f, n]) => [u32(f), u32(n), u32(1)])); };
  const sttsBox = durs => { const e = []; durs.forEach(d => { if (e.length && e[e.length - 1][1] === d) e[e.length - 1][0]++; else e.push([1, d]); }); return fbox('stts', 0, 0, u32(e.length), e.map(([n, d]) => [u32(n), u32(d)])); };
  const dinf = box('dinf', fbox('dref', 0, 0, u32(1), fbox('url ', 0, 1)));
  const makeMoov = base => {
    const { off, stsc } = trackTables(base);
    const avc1 = box('avc1', zeros(6), u16(1), zeros(16), u16(W), u16(H), u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(0x18), u16(0xffff), box('avcC', vdesc));
    const opus = box('Opus', zeros(6), u16(1), zeros(8), u16(2), u16(16), u16(0), u16(0), u32(SR * 65536), box('dOps', u8(0), u8(2), u16(preSkip), u32(SR), u16(0), u8(0)));
    const vstbl = box('stbl', fbox('stsd', 0, 0, u32(1), avc1), sttsBox(vs.map(() => VD)),
      fbox('stss', 0, 0, u32(vs.filter(s => s.key).length), vs.map((s, i) => s.key ? u32(i + 1) : []).filter(x => !Array.isArray(x))),
      stscBox(stsc[0]), fbox('stsz', 0, 0, u32(0), u32(vs.length), vs.map(s => u32(s.data.length))), fbox('stco', 0, 0, u32(off[0].length), off[0].map(u32)));
    const astbl = box('stbl', fbox('stsd', 0, 0, u32(1), opus), sttsBox(as.map(s => s.dur)),
      stscBox(stsc[1]), fbox('stsz', 0, 0, u32(0), u32(as.length), as.map(s => u32(s.data.length))), fbox('stco', 0, 0, u32(off[1].length), off[1].map(u32)));
    const trak = (id, isV, ts, dur, stbl) => box('trak',
      fbox('tkhd', 0, 3, u32(0), u32(0), u32(id), u32(0), u32(Math.round(dur / ts * 1000)), zeros(8), u16(0), u16(0), u16(isV ? 0 : 0x0100), u16(0), MATRIX, u32(isV ? W * 65536 : 0), u32(isV ? H * 65536 : 0)),
      box('mdia', fbox('mdhd', 0, 0, u32(0), u32(0), u32(ts), u32(dur), u16(0x55c4), u16(0)),
        fbox('hdlr', 0, 0, u32(0), str(isV ? 'vide' : 'soun'), zeros(12), str(isV ? 'VideoHandler' : 'SoundHandler'), u8(0)),
        box('minf', isV ? fbox('vmhd', 0, 1, zeros(8)) : fbox('smhd', 0, 0, zeros(4)), dinf, stbl)));
    return box('moov', fbox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(Math.round(Math.max(vDur / VTS, aDur / ATS) * 1000)), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(3)),
      trak(1, true, VTS, vDur, vstbl), trak(2, false, ATS, aDur, astbl));
  };
  const ftyp = box('ftyp', str('isom'), u32(0x200), str('isom'), str('iso2'), str('avc1'), str('mp41'));
  const moovLen = makeMoov(0).length;
  const moov = makeMoov(ftyp.length + moovLen + 8);
  const payload = cat(chunks.flatMap(ch => ch.s.map(s => s.data)));
  return cat([ftyp, moov, u32(payload.length + 8), str('mdat'), payload]);
}

// ---------- pipeline ----------
async function loadFonts() {
  const list = [['SC', 'fonts/NotoSansSC-Light.otf', '300'], ['SC', 'fonts/NotoSansSC-Bold.otf', '700'], ['SC', 'fonts/NotoSansSC-Black.otf', '900'],
  ['Mono', 'fonts/SourceCodePro-Regular.ttf', '400'], ['Mono', 'fonts/SourceCodePro-Bold.ttf', '700']];
  for (const [f, u, w] of list) { const ff = new FontFace(f, `url(${u})`, { weight: w }); await ff.load(); document.fonts.add(ff); }
}
window.setup = async () => {
  await loadFonts();
  const t0 = performance.now(); AUDIO = await renderAudio(); analyze(AUDIO);
  return { audioMs: Math.round(performance.now() - t0), ...ASTATS, typeEnd: TYPE_EV[TYPE_EV.length - 1].t };
};
window.drawAt = t => { drawFrame(t); return cv.toDataURL('image/png'); };
window.sheet = (times, cols = 4) => {
  const tw = 480, th = 270, rows = Math.ceil(times.length / cols), s = document.createElement('canvas');
  s.width = cols * tw; s.height = rows * th; const g = s.getContext('2d');
  times.forEach((t, i) => {
    drawFrame(t); const x = (i % cols) * tw, y = Math.floor(i / cols) * th; g.drawImage(cv, x, y, tw, th);
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + 8, y + 8, 64, 24); g.fillStyle = '#fff'; g.font = '700 16px Mono'; g.fillText(t.toFixed(1) + 's', x + 14, y + 26);
  });
  return s.toDataURL('image/jpeg', 0.86);
};
window.renderAll = async () => {
  const t0 = performance.now();
  const vs = []; let vdesc = null, verr = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => {
      const d = meta?.decoderConfig?.description; if (d && !vdesc) vdesc = d instanceof ArrayBuffer ? new Uint8Array(d.slice(0)) : new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
      const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); vs.push({ data, ts: chunk.timestamp, key: chunk.type === 'key' });
    }, error: e => verr = e,
  });
  let vcfg = null;
  for (const codec of ['avc1.64002A', 'avc1.4D402A', 'avc1.42E02A', 'avc1.640028']) {
    const c = { codec, width: W, height: H, bitrate: 14_000_000, framerate: FPS, avc: { format: 'avc' }, latencyMode: 'quality', bitrateMode: 'variable' };
    if ((await VideoEncoder.isConfigSupported(c)).supported) { vcfg = c; break; }
  }
  venc.configure(vcfg);
  const frames = FPS * DUR;
  for (let i = 0; i < frames; i++) {
    drawFrame(i / FPS);
    const vf = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    venc.encode(vf, { keyFrame: i % 120 === 0 }); vf.close();
    while (venc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 1));
    if (verr) throw verr;
  }
  await venc.flush(); venc.close();
  const tv = performance.now();
  // audio
  const as = []; let adesc = null;
  const aenc = new AudioEncoder({
    output: (chunk, meta) => {
      const d = meta?.decoderConfig?.description; if (d && !adesc) adesc = new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer);
      const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); as.push({ data, ts: chunk.timestamp, dur: Math.round((chunk.duration || 20000) * SR / 1e6) });
    }, error: e => { throw e; },
  });
  aenc.configure({ codec: 'opus', sampleRate: SR, numberOfChannels: 2, bitrate: 192000 });
  const L = AUDIO.getChannelData(0), Rr = AUDIO.getChannelData(1), blk = 4800;
  for (let i = 0; i < L.length; i += blk) {
    const n = Math.min(blk, L.length - i), d = new Float32Array(n * 2); d.set(L.subarray(i, i + n), 0); d.set(Rr.subarray(i, i + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i * 1e6 / SR), data: d });
    aenc.encode(ad); ad.close();
  }
  await aenc.flush(); aenc.close();
  let preSkip = 312;
  if (adesc && adesc.length >= 12 && String.fromCharCode(...adesc.slice(0, 8)) === 'OpusHead') preSkip = adesc[10] | (adesc[11] << 8);
  vs.sort((a, b) => a.ts - b.ts); as.sort((a, b) => a.ts - b.ts);
  window.__mp4 = buildMp4(vs, vdesc, as, preSkip);
  const prof = vdesc ? [vdesc[1], vdesc[2], vdesc[3]] : null;
  return { bytes: window.__mp4.length, vFrames: vs.length, keys: vs.filter(s => s.key).length, aPackets: as.length, preSkip, codec: vcfg.codec, avcProfile: prof, videoMs: Math.round(tv - t0), totalMs: Math.round(performance.now() - t0) };
};
window.getChunk = (off, len) => {
  const s = window.__mp4.subarray(off, off + len); let b = '';
  for (let i = 0; i < s.length; i += 0x8000) b += String.fromCharCode.apply(null, s.subarray(i, i + 0x8000));
  return btoa(b);
};
