const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), http = require('http');
(async () => {
  const stats = fs.readFileSync(path.join(__dirname, 'out', 'stats-big.json'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'AnalyticsDashboard.html'), 'utf8');
  const b = await chromium.launch();
  for (const [name, w, h] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(`window.google={script:{run:{withSuccessHandler:function(ok){return{withFailureHandler:function(){return{getAnalyticsStats:function(){setTimeout(function(){ok(${stats})},50)}}}}}}}}`);
    await p.route('http://dash.test/', r => r.fulfill({ body: html, contentType: 'text/html; charset=utf-8' })); await p.route('https://fonts.googleapis.com/**', r => r.abort()); await p.goto('http://dash.test/'); await p.waitForSelector('.tiles');
    const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await p.screenshot({ path: path.join(__dirname, 'out', `dash-${name}.png`), fullPage: true });
    console.log(name, 'overflow-x:', over, 'errors:', errs.length);
  }
  // اختبار المتتبّع مع نقطة نهاية محاكاة
  const hits = []; const srv = http.createServer((q, s) => {
    if (q.url.startsWith('/api/geo')) { s.setHeader('content-type', 'application/json'); return s.end('{"country":"EG"}'); }
    if (q.method === 'POST') { let d = ''; q.on('data', c => d += c); q.on('end', () => { hits.push(JSON.parse(d)); s.end('{}'); }); return; }
    s.setHeader('content-type', 'text/html'); s.end('<html lang="ar"><title>الرئيسية | داماي</title><a id=w href="https://wa.me/60128845307">w</a><a id=p href="/guide.pdf">p</a>');
  }).listen(0);
  const port = srv.address().port;
  const js = fs.readFileSync(path.join(__dirname, '..', 'tracker', 'damai-analytics.js'), 'utf8').replace("var ENDPOINT = '';", `var ENDPOINT = 'http://localhost:${port}/exec';`);
  const ctx2 = await b.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' }); const p = await ctx2.newPage(); await p.route('**/damai-analytics.js', r => r.fulfill({ body: js, contentType: 'text/javascript' }));
  await p.goto(`http://localhost:${port}/`); await p.addScriptTag({ url: `http://localhost:${port}/damai-analytics.js` });
  await p.waitForTimeout(600);
  await p.evaluate(() => { document.getElementById('w').addEventListener('click', e => e.preventDefault()); document.getElementById('p').addEventListener('click', e => e.preventDefault()); });
  await p.click('#w'); await p.click('#p'); await p.evaluate(() => window.damaiTrack('quiz_start')); await p.waitForTimeout(600);
  console.log('events:', hits.map(h => `${h.event}/${h.country}/${h.title}/${h.os}/${h.source}`).join(' | '));
  await b.close(); srv.close();
})();
