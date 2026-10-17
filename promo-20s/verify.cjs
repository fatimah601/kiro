// Verifies kiro_promo.mp4 by decoding it in Chromium: metadata, frame grabs, audio decode + beat-onset check.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/inner_container/opt/toolchains/.nvm/versions/node/v22.23.3/lib/node_modules/@playwright/mcp/node_modules/playwright-core');
const CHROME = fs.readdirSync('/inner_container/opt/playwright/chromium_headless_shell-1232').map(d => `/inner_container/opt/playwright/chromium_headless_shell-1232/${d}/chrome-headless-shell`).find(fs.existsSync);
(async () => {
  const srv = http.createServer((q, r) => {
    const f = path.join(__dirname, q.url.split('?')[0]); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    const size = fs.statSync(f).size, m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
    const type = f.endsWith('.mp4') ? 'video/mp4' : 'text/html';
    if (m) { const s = +m[1], e = m[2] ? +m[2] : size - 1; r.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 }); fs.createReadStream(f, { start: s, end: e }).pipe(r); }
    else { r.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' }); fs.createReadStream(f).pipe(r); }
  }).listen(0);
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-crash-reporter', '--no-zygote', '--disable-gpu'] });
  const p = await b.newPage();
  await p.goto(`http://localhost:${port}/blank.html`);
  const res = await p.evaluate(async (url) => {
    const out = {};
    const v = document.createElement('video'); v.muted = true; v.src = url; document.body.appendChild(v);
    await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('video error ' + v.error?.code + ' ' + v.error?.message)); });
    out.duration = v.duration; out.size = [v.videoWidth, v.videoHeight];
    const c = document.createElement('canvas'); c.width = 960; c.height = 540; const g = c.getContext('2d');
    out.frames = {};
    for (const t of [2.0, 8.6, 16.1, 18.6]) {
      v.currentTime = t; await new Promise(r => v.onseeked = r); g.drawImage(v, 0, 0, 960, 540);
      out.frames[t] = c.toDataURL('image/jpeg', 0.85);
    }
    const ab = await (await fetch(url)).arrayBuffer();
    const ac = new OfflineAudioContext(2, 48000, 48000);
    const au = await ac.decodeAudioData(ab);
    out.audio = { duration: au.duration, ch: au.numberOfChannels, sr: au.sampleRate };
    // find first strong transient after 3.95s (the 4.0s drop kick)
    const d = au.getChannelData(0); let peak = 0; for (const x of d) peak = Math.max(peak, Math.abs(x)); out.audio.peak = peak;
    const win = 96, env = t => { let s = 0; const i0 = Math.floor(t * 48000); for (let i = i0; i < i0 + win; i++) s += d[i] * d[i]; return Math.sqrt(s / win); };
    let base = env(3.9), onset = null; for (let t = 3.9; t < 4.2; t += 0.001) if (env(t) > base * 3 + 0.05) { onset = t; break; }
    out.audio.dropOnset = onset;
    return out;
  }, `http://localhost:${port}/kiro_promo.mp4`);
  for (const [t, u] of Object.entries(res.frames)) fs.writeFileSync(path.join(__dirname, 'preview', `decoded_${t}.jpg`), Buffer.from(u.split(',')[1], 'base64'));
  delete res.frames; console.log(JSON.stringify(res, null, 1));
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
