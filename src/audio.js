// Procedural soundtrack, rendered offline (deterministic). 120 BPM, A minor.
// Every hit is scheduled from the same timeline the picture uses.
import { BEAT, BAR, DURATION } from './engine.js';
import { typingEvents, INTRO_LINES, STEP, isBreak } from './timeline.js';

const SR = 48000;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// i - VI - III - VII  : Am  F  C  G
const CHORDS = [
  { root: 45, pad: [57, 60, 64, 69] },   // Am
  { root: 41, pad: [57, 60, 65, 69] },   // F
  { root: 48, pad: [55, 60, 64, 67] },   // C
  { root: 43, pad: [55, 59, 62, 67] },   // G
];
const chordAt = t => CHORDS[Math.floor(t / BAR) % 4];

export function drumsOn(t) {
  return t >= 8 && t < 68 && !isBreak(t);
}

export async function renderSoundtrack() {
  const ctx = new OfflineAudioContext(2, SR * DURATION, SR);

  // ---------- shared resources ----------
  const noiseBuf = ctx.createBuffer(1, SR * 2, SR);
  { const d = noiseBuf.getChannelData(0); let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; } }
  const irBuf = ctx.createBuffer(2, SR * 3, SR);
  for (let c = 0; c < 2; c++) { const d = irBuf.getChannelData(c); let s = 777 + c * 99; for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 2147483648 - 1) * Math.pow(1 - i / d.length, 3.2); } }

  // ---------- buses ----------
  const master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.12;
  master.connect(comp); comp.connect(ctx.destination);

  const reverb = ctx.createConvolver(); reverb.buffer = irBuf;
  const revOut = ctx.createGain(); revOut.gain.value = 0.35; reverb.connect(revOut); revOut.connect(master);

  const delay = ctx.createDelay(2); delay.delayTime.value = BEAT * 0.75;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const delLP = ctx.createBiquadFilter(); delLP.type = 'lowpass'; delLP.frequency.value = 3500;
  delay.connect(delLP); delLP.connect(fb); fb.connect(delay);
  const delOut = ctx.createGain(); delOut.gain.value = 0.35; delLP.connect(delOut); delOut.connect(master);

  const drums = ctx.createGain(); drums.gain.value = 0.9; drums.connect(master);
  // sidechained music bus
  const music = ctx.createGain(); music.gain.value = 1; music.connect(master);
  const musicSend = ctx.createGain(); musicSend.gain.value = 0.6; music.connect(musicSend); musicSend.connect(reverb);
  const sfx = ctx.createGain(); sfx.gain.value = 0.8; sfx.connect(master);
  const sfxSend = ctx.createGain(); sfxSend.gain.value = 0.5; sfx.connect(sfxSend); sfxSend.connect(reverb);

  // ---------- instruments ----------
  const noise = (t, dur, { type = 'highpass', freq = 6000, q = 0.7, gain = 0.3, attack = 0.001, out = drums, sweepTo = null } = {}) => {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, (t * 7.31) % 1.5); src.stop(t + dur + 0.05);
  };
  const kick = (t, amp = 1) => {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.11); o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(amp * 1.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(drums); o.start(t); o.stop(t + 0.55);
    noise(t, 0.015, { freq: 3000, gain: 0.25 * amp });
    // sidechain duck
    music.gain.setValueAtTime(0.22, t); music.gain.linearRampToValueAtTime(1, t + 0.26);
  };
  const clap = (t, amp = 0.5) => {
    for (const d of [0, 0.011, 0.023]) noise(t + d, 0.03, { type: 'bandpass', freq: 1500, q: 1.2, gain: amp });
    noise(t + 0.03, 0.22, { type: 'bandpass', freq: 1300, q: 0.9, gain: amp * 0.7 });
  };
  const snare = (t, amp = 0.35) => {
    noise(t, 0.12, { type: 'bandpass', freq: 2200, q: 0.8, gain: amp });
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const g = ctx.createGain(); g.gain.setValueAtTime(amp * 0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g); g.connect(drums); o.start(t); o.stop(t + 0.12);
  };
  const hat = (t, open = false, amp = 0.12) => noise(t, open ? 0.22 : 0.035, { freq: open ? 7000 : 9000, gain: amp });
  const crash = t => { noise(t, 2.2, { freq: 4500, gain: 0.22, out: drums }); noise(t, 1.5, { freq: 5000, gain: 0.1, out: sfxSend }); };

  const voice = (t, freq, dur, { type = 'sawtooth', detune = 8, cutoff = 2000, cutEnd = null, q = 1, gain = 0.1, attack = 0.005, release = 0.1, out = music, voices = 2 } = {}) => {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = q;
    f.frequency.setValueAtTime(cutoff, t);
    if (cutEnd) f.frequency.exponentialRampToValueAtTime(cutEnd, t + Math.max(0.02, dur));
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur)); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, dur) + release);
    f.connect(g); g.connect(out);
    for (let v = 0; v < voices; v++) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      o.detune.value = voices > 1 ? (v / (voices - 1) - 0.5) * 2 * detune : 0;
      o.connect(f); o.start(t); o.stop(t + Math.max(attack, dur) + release + 0.05);
    }
  };
  const pad = (t, chord, dur, gain = 0.035, cutoff = 1400) => {
    for (const m of chord.pad) voice(t, mtof(m), dur, { detune: 14, cutoff, gain, attack: 0.4, release: 1.2, voices: 3 });
  };
  const bass = (t, midi, dur, gain = 0.16) => {
    voice(t, mtof(midi), dur, { type: 'sawtooth', cutoff: 900, cutEnd: 220, q: 4, gain, attack: 0.004, release: 0.05, voices: 1 });
    voice(t, mtof(midi - 12), dur, { type: 'sine', cutoff: 400, gain: gain * 1.4, attack: 0.004, release: 0.05, voices: 1 });
  };
  const pluck = (t, midi, gain = 0.05) => {
    const out = ctx.createGain(); out.connect(music); out.connect(delay);
    voice(t, mtof(midi), 0.06, { type: 'square', detune: 6, cutoff: 5200, cutEnd: 500, q: 3, gain, attack: 0.002, release: 0.16, out });
  };
  const stab = (t, chord, gain = 0.05) => {
    for (const m of chord.pad) voice(t, mtof(m + 12), 0.12, { detune: 18, cutoff: 6000, cutEnd: 900, q: 2, gain, attack: 0.003, release: 0.3, voices: 3 });
  };
  const bell = (t, midi, gain = 0.06) => {
    for (const [mul, a] of [[1, 1], [2.76, 0.4], [5.4, 0.15]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(midi) * mul;
      const g = ctx.createGain(); g.gain.setValueAtTime(gain * a, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6 / mul);
      o.connect(g); g.connect(sfx); o.start(t); o.stop(t + 1.8);
    }
  };
  const blip = (t, midi, gain = 0.07) => {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(mtof(midi), t); o.frequency.exponentialRampToValueAtTime(mtof(midi + 12), t + 0.04);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(sfx); o.start(t); o.stop(t + 0.15);
  };
  const typeClick = (t, space) => {
    noise(t, space ? 0.05 : 0.025, { type: 'bandpass', freq: space ? 1200 : 3800, q: 1.5, gain: space ? 0.25 : 0.35, out: sfx });
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = space ? 140 : 1900 + (t * 997 % 300);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.025, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    o.connect(g); g.connect(sfx); o.start(t); o.stop(t + 0.03);
  };
  const riser = (t0, t1, gain = 0.18) => {
    noise(t0, t1 - t0, { type: 'bandpass', freq: 300, sweepTo: 9000, q: 2, gain, attack: t1 - t0 - 0.05, out: sfx });
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(880, t1);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t0); f.frequency.exponentialRampToValueAtTime(6000, t1);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.05, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1);
    o.connect(f); f.connect(g); g.connect(sfx); o.start(t0); o.stop(t1);
  };
  const impact = (t, amp = 1) => {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(amp * 1.0, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 2.3);
    noise(t, 2.8, { type: 'lowpass', freq: 9000, sweepTo: 300, gain: 0.35 * amp, out: sfx });
    crash(t);
  };
  const whoosh = (t, dur = 0.6) => noise(t - dur, dur, { type: 'bandpass', freq: 600, sweepTo: 7000, q: 1.5, gain: 0.16, attack: dur * 0.9, out: sfx });
  const roll = (t0, t1) => {
    let t = t0, i = 0;
    while (t < t1 - 0.01) {
      const k = (t - t0) / (t1 - t0);
      snare(t, 0.08 + 0.3 * k);
      const step = k < 0.5 ? BEAT / 4 : k < 0.85 ? BEAT / 8 : BEAT / 16;
      t += step; i++;
    }
  };

  // ---------- INTRO (0-8) : keyboard + dark pad ----------
  for (let b = 0; b < 4; b++) pad(b * BAR, CHORDS[b], BAR, 0.022, 700 + b * 250);
  for (const e of typingEvents()) typeClick(e.t, e.space);
  INTRO_LINES.forEach((L, i) => { const n = [...L.text].length; bell(L.start + n * STEP + 0.05, [76, 79, 81][i], 0.05); });
  for (let t = 4; t < 6; t += BEAT) kick(t, 0.35);           // heartbeat
  riser(6, 8); roll(7, 7.94);

  // ---------- MAIN GROOVE ----------
  impact(8, 1);
  for (let t = 8; t < 68 - 1e-6; t += BEAT / 4) {
    const step = Math.round((t - 8) / (BEAT / 4)); // 16th index
    const inBeat = step % 4;
    const ch = chordAt(t);
    const brk = isBreak(t);
    const recap = t >= 60 && t < 64;
    if (!brk) {
      if (inBeat === 0) kick(t);
      if (inBeat === 0 && (step / 4) % 2 === 1) clap(t, 0.42);
      if (inBeat === 2) hat(t, t >= 52 && !recap, t >= 52 ? 0.08 : 0.12);
      if (inBeat % 2 === 1 && t >= 12) hat(t, false, 0.05);
      if (recap && inBeat === 0) stab(t, ch, 0.05);
      // bass: offbeat 8ths, root & octave
      if (inBeat === 2 || (inBeat === 3 && step % 8 === 7)) bass(t, ch.root + (inBeat === 3 ? 12 : 0), BEAT / 4 * 0.9);
      if (inBeat === 0 && step % 16 === 0) bass(t, ch.root, BEAT / 4 * 0.6, 0.1);
      // arp from 12s
      if (t >= 12 && !recap) {
        const notes = [ch.pad[0] + 12, ch.pad[1] + 12, ch.pad[2] + 12, ch.pad[3] + 12, ch.pad[2] + 24, ch.pad[3] + 12, ch.pad[1] + 12, ch.pad[2] + 12];
        pluck(t, notes[step % 8], t >= 44 ? 0.045 : 0.035);
      }
    }
    if (step % 16 === 0) pad(t, ch, BAR, brk ? 0.03 : 0.022, brk ? 2400 : 1500);
  }
  // section accents
  for (const s of [12, 20, 28, 36, 52, 60, 64]) { crash(s); whoosh(s); }
  // builds
  riser(42, 44); roll(43, 43.95); impact(44, 0.8);
  riser(66.5, 68); roll(67, 67.95);

  // ---------- picture-synced SFX ----------
  [0, 1, 2, 3, 4].forEach(i => blip(13 + i * 0.25, 76 + [0, 3, 5, 7, 10][i]));       // token chips split
  [0, 1, 2, 3, 4].forEach(i => blip(14.25 + i * 0.25, 88 - i * 2, 0.04));          // token ids
  [22, 22.5, 23, 23.5].forEach((t, i) => blip(t, 69 + i * 5, 0.05));                 // embed words land
  bell(25.5, 81, 0.07);                                                            // queen
  for (let i = 0; i < 5; i++) blip(29 + i * 0.5, 72 + i * 2, 0.05);                // attention arcs
  for (let i = 0; i < 5; i++) blip(44.5 + i * 0.25, 84 - i * 3, 0.05);             // probability bars
  bell(47, 84, 0.07);                                                              // 'mat' picked
  for (let i = 0; i < 5; i++) blip(48.5 + i * 0.5, 79 + (i % 2) * 5, 0.05);       // autoregressive tokens

  // ---------- END ----------
  impact(68, 1.1);
  voice(68, mtof(45), 3.4, { type: 'sawtooth', detune: 14, cutoff: 900, gain: 0.04, attack: 0.05, release: 0.5, voices: 3, out: music });
  pad(68, CHORDS[0], 3.2, 0.03, 1800);
  bell(68.02, 81, 0.07); bell(68.5, 88, 0.035);

  const buf = await ctx.startRendering();
  // normalise to -1 dBFS + fade out last 0.4s
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 0; for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = 0.89 / (peak || 1);
  const fadeStart = L.length - SR * 0.4;
  for (let i = 0; i < L.length; i++) { const f = i > fadeStart ? (L.length - i) / (SR * 0.4) : 1; L[i] *= k * f; R[i] *= k * f; }
  return { buffer: buf, peak };
}
