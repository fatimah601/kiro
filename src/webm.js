// Minimal WebM (Matroska) muxer: one VP9 video track + one Opus audio track.

const enc = new TextEncoder();
function idBytes(id) { const b = []; let v = id; while (v > 0) { b.unshift(v & 0xff); v = Math.floor(v / 256); } return b; }
function sizeVint(n) {
  // 8-byte vint (always valid)
  const b = new Uint8Array(8); b[0] = 0x01; let v = n;
  for (let i = 7; i >= 1; i--) { b[i] = v & 0xff; v = Math.floor(v / 256); }
  return b;
}
function uintBytes(n) { const b = []; let v = n; do { b.unshift(v & 0xff); v = Math.floor(v / 256); } while (v > 0); return b; }
function concat(parts) {
  let len = 0; for (const p of parts) len += p.length;
  const out = new Uint8Array(len); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
const el = (id, data) => concat([new Uint8Array(idBytes(id)), sizeVint(data.length), data]);
const uint = (id, n) => el(id, new Uint8Array(uintBytes(n)));
const str = (id, s) => el(id, enc.encode(s));
const flt = (id, f) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, f); return el(id, b); };
const master = (id, children) => el(id, concat(children));

export function muxWebM({ width, height, video, audio, opusHead, durationMs, codecDelayNs = 6500000 }) {
  const header = master(0x1A45DFA3, [uint(0x4286, 1), uint(0x42F7, 1), uint(0x42F2, 4), uint(0x42F3, 8), str(0x4282, 'webm'), uint(0x4287, 4), uint(0x4285, 2)]);
  const info = master(0x1549A966, [uint(0x2AD7B1, 1000000), str(0x4D80, 'kiro-webm'), str(0x5741, 'kiro-motion'), flt(0x4489, durationMs)]);
  const vTrack = master(0xAE, [uint(0xD7, 1), uint(0x73C5, 1), uint(0x83, 1), str(0x86, 'V_VP9'),
    master(0xE0, [uint(0xB0, width), uint(0xBA, height)])]);
  const aTrack = master(0xAE, [uint(0xD7, 2), uint(0x73C5, 2), uint(0x83, 2), str(0x86, 'A_OPUS'),
    el(0x63A2, opusHead), uint(0x56AA, codecDelayNs), uint(0x56BB, 80000000),
    master(0xE1, [flt(0xB5, 48000), uint(0x9F, 2)])]);
  const tracks = master(0x1654AE6B, [vTrack, aTrack]);

  // interleave
  const blocks = [];
  for (const v of video) blocks.push({ track: 1, ts: v.ts / 1000, key: v.key, data: v.data });
  for (const a of audio) blocks.push({ track: 2, ts: a.ts / 1000, key: true, data: a.data });
  blocks.sort((x, y) => x.ts - y.ts || x.track - y.track);

  const clusters = []; let cur = null;
  const flush = () => { if (cur) { clusters.push(master(0x1F43B675, [uint(0xE7, cur.tc), ...cur.parts])); clusterTimes.push(cur.tc); } };
  const clusterTimes = [];
  for (const b of blocks) {
    const ms = Math.round(b.ts);
    if (!cur || (b.track === 1 && b.key) || ms - cur.tc > 30000) { flush(); cur = { tc: Math.max(0, ms), parts: [] }; }
    const rel = ms - cur.tc;
    const head = new Uint8Array(4);
    head[0] = 0x80 | b.track; head[1] = (rel >> 8) & 0xff; head[2] = rel & 0xff; head[3] = b.key ? 0x80 : 0x00;
    cur.parts.push(el(0xA3, concat([head, b.data])));
  }
  flush();
  // SeekHead (fixed size) + Cues so players can seek instantly
  const pos8 = n => { const b = new Uint8Array(8); let v = n; for (let i = 7; i >= 0; i--) { b[i] = v & 0xff; v = Math.floor(v / 256); } return b; };
  const seekHead = (pInfo, pTracks, pCues) => master(0x114D9B74, [
    master(0x4DBB, [el(0x53AB, new Uint8Array(idBytes(0x1549A966))), el(0x53AC, pos8(pInfo))]),
    master(0x4DBB, [el(0x53AB, new Uint8Array(idBytes(0x1654AE6B))), el(0x53AC, pos8(pTracks))]),
    master(0x4DBB, [el(0x53AB, new Uint8Array(idBytes(0x1C53BB6B))), el(0x53AC, pos8(pCues))]),
  ]);
  const shLen = seekHead(0, 0, 0).length;
  let off = shLen + info.length + tracks.length;
  const cuePoints = [];
  clusters.forEach((c, i) => { cuePoints.push(master(0xBB, [uint(0xB3, clusterTimes[i]), master(0xB7, [uint(0xF7, 1), el(0xF1, pos8(off))])])); off += c.length; });
  const cues = master(0x1C53BB6B, cuePoints);
  const sh = seekHead(shLen, shLen + info.length, off);
  const segment = master(0x18538067, [sh, info, tracks, ...clusters, cues]);
  return concat([header, segment]);
}

export function makeOpusHead(channels = 2, preSkip = 312, rate = 48000) {
  const b = new Uint8Array(19); const dv = new DataView(b.buffer);
  b.set(enc.encode('OpusHead'), 0); b[8] = 1; b[9] = channels;
  dv.setUint16(10, preSkip, true); dv.setUint32(12, rate, true); dv.setInt16(16, 0, true); b[18] = 0;
  return b;
}
