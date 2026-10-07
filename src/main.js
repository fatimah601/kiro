import { W, H, FPS, C, BEAT, DURATION, TOTAL_FRAMES, clamp, prog, rgba, text, MONO, dot, rng } from './engine.js';
import { SECTIONS } from './timeline.js';
import * as S from './scenes.js';
import { drumsOn, renderSoundtrack } from './audio.js';
import { muxWebM, makeOpusHead } from './webm.js';
import { drawMixed } from './glyphs.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });

const SCENE_FN = { intro: S.intro, title: S.title, tokenize: S.tokenize, embed: S.embed, attention: S.attention, layers: S.layers, predict: S.predict, learn: S.learn, recap: S.recap, end: S.endcard };

// kick envelope identical to the audio schedule
function kickPulse(t) {
  const bt = Math.floor(t / BEAT) * BEAT;
  if (!drumsOn(bt) && !(t >= 4 && t < 6)) return 0;
  return Math.exp(-(t - bt) * 7) * (t < 8 ? 0.35 : 1);
}

const STARS = (() => { const R = rng(99); return Array.from({ length: 160 }, () => [R() * W, R() * H, R(), R()]); })();
function background(t, pulse) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  if (t < 7.9) { // intro: subtle scanlines only
    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    return;
  }
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 1100);
  g.addColorStop(0, rgba('#1a2a6a', 0.55 + 0.25 * pulse)); g.addColorStop(0.6, rgba('#0a0f2a', 0.4)); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // drifting dot grid
  const sp = 60, off = (t * 12) % sp;
  ctx.fillStyle = rgba('#5b6cff', 0.08 + 0.08 * pulse);
  for (let y = -sp; y < H + sp; y += sp) for (let x = -sp; x < W + sp; x += sp) ctx.fillRect(x + off, y + off * 0.5, 2, 2);
  for (const [x, y, z, p] of STARS) { const a = 0.15 + 0.35 * Math.abs(Math.sin(t * (0.5 + p) + p * 10)); ctx.fillStyle = rgba(C.white, a * z); ctx.fillRect((x - t * 20 * z + W) % W, y, 2, 2); }
}

function overlay(t, pulse) {
  if (t < 8 || t > 68) return;
  // beat meter (bottom-left) + brand (bottom-right)
  const beatInBar = Math.floor(t / BEAT) % 4;
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i === beatInBar ? C.cyan : rgba(C.white, 0.15); ctx.fillRect(96 + i * 22, H - 92, 14, 14); }
  text(ctx, `${(120).toFixed(0)} BPM`, 196, H - 85, { size: 18, weight: 400, font: MONO, color: C.dim, align: 'left' });
  text(ctx, 'KIRO  //  HOW AI WORKS', W - 96, H - 85, { size: 18, weight: 600, font: MONO, color: C.dim, align: 'right', spacing: 3 });
  // progress line
  ctx.fillStyle = rgba(C.white, 0.08); ctx.fillRect(0, H - 4, W, 4);
  ctx.fillStyle = C.cyan; ctx.fillRect(0, H - 4, W * (t / DURATION), 4);
  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

function transitions(t) {
  // flash + light streak right after every section boundary
  for (const s of SECTIONS) {
    const dt = t - s.start;
    if (s.start === 0 || dt < 0 || dt > 0.5) continue;
    const a = Math.exp(-dt * 10);
    ctx.fillStyle = rgba('#ffffff', (s.start === 8 || s.start === 68 ? 0.95 : 0.35) * a); ctx.fillRect(0, 0, W, H);
    const y = H / 2 + (dt * 2000 % H) - H / 2;
    const gr = ctx.createLinearGradient(0, y - 60, 0, y + 60); gr.addColorStop(0, 'rgba(61,245,255,0)'); gr.addColorStop(0.5, rgba(C.cyan, 0.5 * a)); gr.addColorStop(1, 'rgba(61,245,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, y - 60, W, 120);
  }
}

export function drawFrame(t) {
  const pulse = kickPulse(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.setLineDash([]); ctx.letterSpacing = '0px';
  background(t, pulse);
  const sec = SECTIONS.find(s => t >= s.start && t < s.end) || SECTIONS[SECTIONS.length - 1];
  const lt = t - sec.start;
  // camera bump on kick
  const z = 1 + 0.012 * pulse;
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
  // fade-in at section start
  ctx.globalAlpha = sec.start === 0 ? 1 : clamp(lt / 0.15);
  SCENE_FN[sec.id](ctx, lt, t);
  ctx.restore();
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  overlay(t, pulse);
  transitions(t);
}

async function fontsReady() {
  const fams = ['900 40px "Noto Sans"', '700 40px "Noto Sans"', '600 40px "Noto Sans"', '400 40px "Noto Sans"', '700 40px "Source Code Pro"', '400 40px "Source Code Pro"'];
  await Promise.all(fams.map(f => document.fonts.load(f, 'AIabc0123≈−∇')));
}

async function saveBytes(name, bytes) {
  const CH = 3 * 1024 * 1024;
  for (let i = 0; i < bytes.length; i += CH) {
    const sub = bytes.subarray(i, i + CH);
    let bin = ''; for (let j = 0; j < sub.length; j += 0x8000) bin += String.fromCharCode.apply(null, sub.subarray(j, j + 0x8000));
    await window.saveChunk(name, btoa(bin));
  }
  await window.closeFile(name);
}

window.renderStill = async (t) => {
  drawFrame(t);
  const blob = await canvas.convertToBlob?.() || await new Promise(r => canvas.toBlob(r, 'image/png'));
  await saveBytes(`stills/t_${String(t.toFixed(2)).padStart(5, '0')}.png`, new Uint8Array(await blob.arrayBuffer()));
};

window.contactSheet = async (times, name) => {
  const sheet = new OffscreenCanvas(1920, 1620); const s = sheet.getContext('2d');
  s.fillStyle = '#222'; s.fillRect(0, 0, 1920, 1620);
  times.forEach((t, i) => {
    drawFrame(t);
    s.drawImage(canvas, (i % 2) * 960, Math.floor(i / 2) * 540, 956, 536);
    s.fillStyle = '#ff0'; s.font = '700 28px monospace'; s.fillText(t.toFixed(2), (i % 2) * 960 + 10, Math.floor(i / 2) * 540 + 30);
  });
  const blob = await sheet.convertToBlob();
  await saveBytes(`stills/${name}.png`, new Uint8Array(await blob.arrayBuffer()));
};

window.glyphSheet = async () => {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const lines = ['本片由 Kiro 自行制作', '总计 Token ≈ 2,600,000', '约 100 元', 'AI 如何工作', '下一个 token', '一工下个元本片由自行计约作制总如何'];
  lines.forEach((l, i) => drawMixed(ctx, l, 100, 110 + i * 160, { size: 110, font: `700 110px "Source Code Pro"`, color: '#fff' }));
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  await saveBytes('stills/glyphs.png', new Uint8Array(await blob.arrayBuffer()));
};

async function encodeAudio(buffer) {
  const chunks = []; let head = null, delay = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d);
      chunks.push({ ts: chunk.timestamp, data: d });
      if (meta?.decoderConfig?.description && !head) head = new Uint8Array(meta.decoderConfig.description);
    },
    error: e => console.log('audio enc error', e.message),
  });
  enc.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 });
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  const N = 4800;
  for (let i = 0; i < L.length; i += N) {
    const n = Math.min(N, L.length - i);
    const data = new Float32Array(n * 2); data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
    enc.encode(new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / 48000 * 1e6), data }));
  }
  await enc.flush(); enc.close();
  if (head && head.length >= 19 && String.fromCharCode(...head.slice(0, 8)) !== 'OpusHead') head = null;
  if (!head) head = makeOpusHead(2, 312);
  const preSkip = new DataView(head.buffer, head.byteOffset).getUint16(10, true);
  console.log(`audio: ${chunks.length} packets, preSkip=${preSkip}`);
  return { chunks, head, preSkip };
}

window.renderAudioOnly = async () => {
  const { buffer, peak } = await renderSoundtrack();
  console.log('soundtrack peak(before norm)=', peak.toFixed(3), 'len=', buffer.length);
  // write a WAV for inspection
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1), n = L.length;
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const ws = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  ws(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); ws(8, 'WAVE'); ws(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, 48000, true); out.setUint32(28, 48000 * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, clamp(L[i], -1, 1) * 32767, true); out.setInt16(46 + i * 4, clamp(R[i], -1, 1) * 32767, true); }
  await saveBytes('soundtrack.wav', new Uint8Array(out.buffer));
};

window.renderVideo = async (opts = {}) => {
  const OW = opts.width || W, OH = opts.height || H, BR = opts.bitrate || 14_000_000, NAME = opts.name || 'raw.webm';
  const small = OW !== W ? new OffscreenCanvas(OW, OH) : null;
  const sctx = small?.getContext('2d');
  const t0 = performance.now();
  const { buffer } = await renderSoundtrack();
  console.log(`soundtrack rendered in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  const audio = await encodeAudio(buffer);

  const video = [];
  const venc = new VideoEncoder({
    output: chunk => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); video.push({ ts: chunk.timestamp, key: chunk.type === 'key', data: d }); },
    error: e => console.log('video enc error', e.message),
  });
  venc.configure({ codec: 'vp09.00.40.08', width: OW, height: OH, bitrate: BR, framerate: FPS, latencyMode: 'quality', bitrateMode: 'variable' });
  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const t = f / FPS;
    drawFrame(t);
    if (small) { sctx.imageSmoothingQuality = 'high'; sctx.drawImage(canvas, 0, 0, OW, OH); }
    const frame = new VideoFrame(small || canvas, { timestamp: Math.round(f * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    venc.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 2));
    if (f % 150 === 0) console.log(`frame ${f}/${TOTAL_FRAMES}  ${((performance.now() - t0) / 1000).toFixed(0)}s`);
  }
  await venc.flush(); venc.close();
  console.log(`video: ${video.length} chunks`);
  const bytes = muxWebM({ width: OW, height: OH, video, audio: audio.chunks, opusHead: audio.head, durationMs: DURATION * 1000, codecDelayNs: Math.round(audio.preSkip / 48000 * 1e9) });
  console.log(`muxed ${(bytes.length / 1e6).toFixed(1)} MB`);
  await saveBytes(NAME, bytes);
};

await fontsReady();
window.__ready = true;
