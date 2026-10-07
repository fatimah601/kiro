// Headless render driver: serves ./ over a fake https origin, drives the page,
// collects stills / the encoded WebM.
// usage: node tools/render.cjs stills 1,9.5,20   |  node tools/render.cjs video  |  node tools/render.cjs glyphs
const fs = require('fs');
const path = require('path');
const { chromium } = require('/root/.nvm/versions/node/v22.23.3/lib/node_modules/@playwright/mcp/node_modules/playwright-core');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.json': 'application/json' };

(async () => {
  const [mode = 'stills', arg = '1'] = process.argv.slice(2);
  const browser = await chromium.launch({
    executablePath: '/opt/playwright/chromium-1232/chrome-linux64/chrome',
    args: ['--no-proxy-server', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('crash', () => console.log('[CRASH]')); page.on('pageerror', e => console.log('[pageerror]', e.message));
  const http = require('http');
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    const size = fs.statSync(file).size, type = MIME[path.extname(file)] || (file.endsWith('.webm') ? 'video/webm' : 'application/octet-stream');
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      const a = +m[1], b = m[2] ? +m[2] : size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1 });
      fs.createReadStream(file, { start: a, end: b }).pipe(res);
    } else { res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' }); fs.createReadStream(file).pipe(res); }
  });
  await new Promise(r => server.listen(8765, '127.0.0.1', r));
  const handles = {};
  await page.exposeFunction('saveChunk', (name, b64) => {
    const out = path.join(ROOT, 'out', name);
    if (!handles[name]) handles[name] = fs.openSync(out, 'w');
    fs.writeSync(handles[name], Buffer.from(b64, 'base64'));
    return true;
  });
  await page.exposeFunction('closeFile', name => { if (handles[name]) { fs.closeSync(handles[name]); delete handles[name]; } return true; });
  await page.goto('http://localhost:8765/src/index.html');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });

  const t0 = Date.now();
  if (mode === 'stills') {
    for (const t of arg.split(',').map(Number)) await page.evaluate(t => window.renderStill(t), t);
  } else if (mode === 'sheet') {
    const ts = arg.split(',').map(Number);
    for (let i = 0; i < ts.length; i += 6) await page.evaluate(([t, n]) => window.contactSheet(t, n), [ts.slice(i, i + 6), 'sheet' + (i / 6)]);
  } else if (mode === 'glyphs') {
    await page.evaluate(() => window.glyphSheet());
  } else if (mode === 'video') {
    await page.evaluate(o => window.renderVideo(o), arg === '1' ? {} : JSON.parse(arg));
  } else if (mode === 'verify') {
    const r = await page.evaluate(async (file) => {
      const out = {};
      // audio: decode the Opus track from the container
      try {
        const buf = await (await fetch(file)).arrayBuffer();
        const ab = await new OfflineAudioContext(2, 48000, 48000).decodeAudioData(buf);
        out.audioDur = ab.duration.toFixed(2);
        const L = ab.getChannelData(0); const rms = []; let pk = 0;
        for (let s = 0; s < 72; s += 4) { let e = 0, n = 0; for (let i = s * 48000; i < Math.min(L.length, (s + 4) * 48000); i++) { e += L[i] * L[i]; n++; pk = Math.max(pk, Math.abs(L[i])); } rms.push(`${s}:${(20 * Math.log10(Math.sqrt(e / n) + 1e-9)).toFixed(0)}`); }
        out.rmsDb = rms.join(' '); out.peak = pk.toFixed(2);
      } catch (e) { out.audioErr = String(e); }
      // video: seek & grab frames
      const v = document.createElement('video'); v.muted = true; v.src = file;
      await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(v.error?.message); });
      console.log('meta ok', v.duration); out.videoDur = v.duration; out.size = `${v.videoWidth}x${v.videoHeight}`;
      const sheet = new OffscreenCanvas(1920, 1620); const s = sheet.getContext('2d');
      const ts = [2.6, 9.5, 16, 27.5, 40.5, 64.8];
      for (let i = 0; i < ts.length; i++) {
        await new Promise(ok => { v.onseeked = ok; v.currentTime = ts[i]; });
        console.log('seeked', ts[i]); s.drawImage(v, (i % 2) * 960, Math.floor(i / 2) * 540, 956, 536);
      }
      const blob = await sheet.convertToBlob();
      const b = new Uint8Array(await blob.arrayBuffer()); let bin = ''; for (let j = 0; j < b.length; j += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(j, j + 0x8000));
      await window.saveChunk('stills/verify.png', btoa(bin)); await window.closeFile('stills/verify.png');
      return out;
    }, '/out/' + arg);
    console.log(JSON.stringify(r, null, 1));
  } else if (mode === 'audio') {
    await page.evaluate(() => window.renderAudioOnly());
  }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await browser.close(); server.close();
})();
