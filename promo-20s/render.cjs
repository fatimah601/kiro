// Usage: node render.cjs [--preview t1,t2,...] [--tokens N] [--cny X] [--out file.mp4]
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/inner_container/opt/toolchains/.nvm/versions/node/v22.23.3/lib/node_modules/@playwright/mcp/node_modules/playwright-core');
const CHROME = fs.readdirSync('/inner_container/opt/playwright/chromium_headless_shell-1232').map(d => `/inner_container/opt/playwright/chromium_headless_shell-1232/${d}/chrome-headless-shell`).find(fs.existsSync);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.otf': 'font/otf', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };

(async () => {
  const srv = http.createServer((q, r) => {
    const f = path.join(__dirname, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(__dirname) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  }).listen(0);
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-crash-reporter', '--no-zygote', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  p.on('console', m => console.log('[page]', m.text()));
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  const qs = new URLSearchParams({ tokens: arg('tokens', '1,000,000'), cny: arg('cny', '10.00') });
  await p.goto(`http://localhost:${port}/index.html?${qs}`);
  console.log('setup', await p.evaluate(() => window.setup()));

  const prev = arg('preview');
  if (prev) {
    fs.mkdirSync(path.join(__dirname, 'preview'), { recursive: true });
    for (const t of prev.split(',').map(Number)) {
      const url = await p.evaluate(t => window.drawAt(t), t);
      fs.writeFileSync(path.join(__dirname, 'preview', `f_${t.toFixed(2)}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log('previews written');
  }
  const sheet = arg('sheet');
  if (sheet) {
    const url = await p.evaluate(ts => window.sheet(ts), sheet.split(',').map(Number));
    fs.writeFileSync(path.join(__dirname, 'preview_sheet.jpg'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('sheet written');
  }
  if (!process.argv.includes('--no-video')) {
    const info = await p.evaluate(() => window.renderAll());
    console.log('render', info);
    const out = path.join(__dirname, arg('out', 'kiro_promo.mp4'));
    const fd = fs.openSync(out, 'w'); const CH = 4 << 20;
    for (let o = 0; o < info.bytes; o += CH) fs.writeSync(fd, Buffer.from(await p.evaluate(([o, l]) => window.getChunk(o, l), [o, CH]), 'base64'));
    fs.closeSync(fd); console.log('wrote', out, fs.statSync(out).size);
  }
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
