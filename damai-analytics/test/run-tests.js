// اختبار منطق Analytics.gs بمحاكاة خدمات Apps Script الدنيا (بلا شبكة).
const fs = require('fs'), vm = require('vm'), path = require('path');
const code = ['Intake.gs', 'Analytics.gs'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const TZ = 'Asia/Kuala_Lumpur';
const fmt = (d, f) => { // تنسيق مكافئ لـ Utilities.formatDate بتوقيت كوالالمبور (UTC+8)
  const x = new Date(d.getTime() + 8 * 3600000), p = n => String(n).padStart(2, '0');
  const Y = x.getUTCFullYear(), M = p(x.getUTCMonth() + 1), D = p(x.getUTCDate()), h = p(x.getUTCHours()), m = p(x.getUTCMinutes());
  return f.replace('yyyy', Y).replace('MM', M).replace('dd', D).replace('HH', h).replace('mm', m).replace('yyyyMMdd', `${Y}${M}${D}`);
};
const ctx = { Date, Utilities: { formatDate: (d, tz, f) => fmt(d, f) }, console };
vm.createContext(ctx); vm.runInContext(code, ctx);
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('✗', m); } else console.log('✓', m); };

// 1) buildRow_ تحقق وتطهير
const now = new Date('2026-11-23T04:00:00Z');
const good = { event: 'visit', vid: 'abcdef1234567890', page: '/index.html', title: 'الرئيسية', source: 'Facebook', device: 'موبايل', os: 'Android', browser: 'Chrome', country: 'eg', lang: 'ar', screen: '390x844', tz: 'Asia/Kuala_Lumpur' };
let r = ctx.buildRow_(good, now);
ok(r && r[9] === 'EG' && r[10] === 'cloudflare', 'رمز الدولة من Netlify يُقبل ويُرفع لحروف كبيرة');
r = ctx.buildRow_(Object.assign({}, good, { country: '' }), now);
ok(r[9] === 'MY' && r[10] === 'tz', 'السقوط إلى المنطقة الزمنية عند غياب الدولة');
r = ctx.buildRow_(Object.assign({}, good, { country: '', tz: 'Mars/Base' }), now);
ok(r[9] === 'XX', 'منطقة غير معروفة ← XX');
ok(ctx.buildRow_(Object.assign({}, good, { event: 'hack' }), now) === null, 'حدث غير مسموح مرفوض');
ok(ctx.buildRow_(Object.assign({}, good, { vid: 'x' }), now) === null, 'معرّف زائر قصير مرفوض');
ok(ctx.buildRow_(Object.assign({}, good, { page: 'javascript:1' }), now) === null, 'صفحة لا تبدأ بـ / مرفوضة');
r = ctx.buildRow_(Object.assign({}, good, { title: '<script>alert(1)</script>' + 'x'.repeat(300) }), now);
ok(!/[<>]/.test(r[4]) && r[4].length <= 120, 'إزالة < > وقصّ العنوان');

// 2) computeStats_ ببيانات صناعية
const H = 3600000, mk = (hAgo, vid, ev, page, src, dev, cc, os = 'Android', br = 'Chrome') =>
  [new Date(now.getTime() - hAgo * H), vid, ev, page, page === '/' ? 'الرئيسية' : 'الأكاديميات', src, dev, os, br, cc, 'netlify', 'ar', '390x844'];
const rows = [
  mk(0.2, 'v1', 'visit', '/', 'Facebook', 'موبايل', 'EG'),
  mk(0.1, 'v1', 'visit', '/academics.html', 'داخلي', 'موبايل', 'EG'),
  mk(0.1, 'v1', 'whatsapp_click', '/academics.html', 'داخلي', 'موبايل', 'EG'),
  mk(5, 'v2', 'visit', '/', 'مباشر', 'كمبيوتر', 'MY', 'Windows', 'Edge'),
  mk(48, 'v3', 'visit', '/', 'Google', 'موبايل', 'LY'),
  mk(24 * 10, 'v4', 'visit', '/', 'Facebook', 'موبايل', 'MA'),       // داخل 30 يومًا وخارج 7 أيام
  mk(24 * 40, 'v5', 'visit', '/', 'Facebook', 'موبايل', 'MA'),       // الفترة السابقة لـ 30d
];
let s = ctx.computeStats_(rows, '30d', now);
ok(s.visitors === 4, `زوار فريدون 30 يومًا = 4 (النتيجة ${s.visitors})`);
ok(s.visitorsPrev === 1, `زوار الفترة السابقة = 1 (النتيجة ${s.visitorsPrev})`);
ok(s.pageviews === 5, `مشاهدات = 5 بلا الأحداث (النتيجة ${s.pageviews})`);
ok(s.onlineNow === 1 && s.events.whatsapp_click === 1, 'الآن على الموقع = 1، وحدث واتساب = 1');
ok(s.countries[0].label === 'EG' || s.countriesCount === 4, 'عدد الدول 4');
ok(!s.sources.some(x => x.label === 'داخلي'), 'المصادر لا تتضمن «داخلي»');
ok(s.recent.length === 6 && s.recent[0].t >= s.recent[1].t, 'آخر الزيارات مرتبة تنازليًا');
ok(s.daily.length >= 30 && s.daily.reduce((a, b) => a + b.v, 0) >= 4, 'سلسلة يومية مصفّرة الأيام');
s = ctx.computeStats_(rows, '7d', now);
ok(s.visitors === 3, `7 أيام = 3 زوار (النتيجة ${s.visitors})`);
s = ctx.computeStats_(rows, 'all', now);
ok(s.visitors === 5 && s.visitorsPrev === 0, 'كل الفترة = 5 ولا مقارنة سابقة');
s = ctx.computeStats_(rows, 'today', now);
ok(s.visitors >= 2, `اليوم يحتسب زوار اليوم (النتيجة ${s.visitors})`);
s = ctx.computeStats_([], '30d', now);
ok(s.visitors === 0 && s.countries.length === 0, 'شيت فارغ لا يكسر الحساب');

// 3) الأرشفة: تُجرَّد الصفوف القديمة من معرّف الزائر وتبقى الحديثة كما هي
const cut = new Date(now.getTime() - 365 * 24 * H);
const sp = ctx.splitForArchive_([mk(24 * 400, 'old1abcdefgh', 'visit', '/', 'Google', 'موبايل', 'EG'), mk(24, 'new1abcdefgh', 'visit', '/', 'Google', 'موبايل', 'EG')], cut);
ok(sp.old.length === 1 && sp.old[0][1] === '' && sp.old[0][9] === 'EG', 'الأرشيف: صف قديم بلا معرّف زائر');
ok(sp.keep.length === 1 && sp.keep[0][1] === 'new1abcdefgh', 'الأرشيف: الصف الحديث يبقى بمعرّفه');

fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'stats-fixture.json'), JSON.stringify(ctx.computeStats_(rows, '30d', now)));
// ثروة بيانات أكبر للمعاينة البصرية
const big = []; const ccs = ['EG','MY','MA','DZ','SA','IQ','ID','AE','NG','TN','FR','PK'], srcs = ['Facebook','مباشر','Google','داخلي'];
for (let i = 0; i < 600; i++) big.push(mk(Math.random() * 24 * 28, 'vv' + (i % 300) + 'abcdefgh', Math.random() < .85 ? 'visit' : 'whatsapp_click',
  Math.random() < .5 ? '/' : '/academics.html', srcs[i % 4], ['موبايل','موبايل','كمبيوتر','تابلت'][i % 4], ccs[Math.floor(Math.random() * Math.random() * 12)], ['Android','iOS','Windows','macOS'][i % 4], ['Chrome','Safari','Edge','Samsung'][i % 4]));
big.sort((a, b) => a[0] - b[0]);
fs.writeFileSync(path.join(__dirname, 'out', 'stats-big.json'), JSON.stringify(ctx.computeStats_(big, '30d', now)));
console.log(fail ? `\nفشل ${fail}` : '\nكل الاختبارات ناجحة'); process.exit(fail ? 1 : 0);
