/**
 * إحصائيات زوار موقع داماي — الإصدار 2 (داخل منظومة داماي ERP)
 * ملف سكربت إضافي في نفس مشروع Apps Script للمنظومة. التفاصيل في README.md.
 *
 * ما يضيفه عن إصدار 21/11:
 *  - التفريق بين الزائر (معرّف مجهول) ومشاهدات الصفحات، والمقارنة بالفترة السابقة.
 *  - «الآن على الموقع» (آخر 30 دقيقة)، وآخر الزيارات، ونظام التشغيل، وأحداث (تنزيل/واتساب/نموذج/مسابقة).
 *  - الدولة من رمز تأتي من Netlify (دقيقة) وتسقط إلى المنطقة الزمنية عند غيابها.
 *  - تحقق وحدود للمدخلات، وصلاحية لوحة مقصورة على المالك والمصرّح لهم.
 */

var AN_SHEET = 'زيارات الموقع';
var AN_ARCHIVE_SHEET = 'زيارات الموقع — أرشيف';
var AN_TZ = 'Asia/Kuala_Lumpur';
var AN_HEADERS = ['الوقت', 'معرّف الزائر', 'الحدث', 'الصفحة', 'العنوان', 'المصدر', 'الجهاز', 'النظام', 'المتصفح', 'الدولة', 'مصدر الدولة', 'اللغة', 'الشاشة'];
var AN_EVENTS = ['visit', 'download', 'whatsapp_click', 'form_submit', 'quiz_start', 'quiz_done'];
var AN_PERIODS = { today: 1, '7d': 7, '30d': 30, '3m': 90, '1y': 365, all: 3650 };
var AN_PERIOD_LABELS = { today: 'اليوم', '7d': 'آخر 7 أيام', '30d': 'آخر 30 يومًا', '3m': 'آخر 3 أشهر', '1y': 'آخر سنة', all: 'كل الفترة' };
var AN_MAX_ROWS_READ = 60000;
var AN_DAILY_CAP = 20000;      // أقصى عدد صفوف في اليوم (حماية من الإغراق)
var AN_VID_CAP_10MIN = 60;     // أقصى أحداث لكل زائر كل 10 دقائق
var AN_ONLINE_MIN = 30;

// تقدير الدولة من المنطقة الزمنية عند غياب رمز الدولة (تقريبي)
var AN_TZ_COUNTRY = {
  'Africa/Cairo': 'EG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY', 'Africa/Tripoli': 'LY',
  'Africa/Casablanca': 'MA', 'Africa/Algiers': 'DZ', 'Africa/Tunis': 'TN', 'Asia/Riyadh': 'SA',
  'Asia/Baghdad': 'IQ', 'Asia/Jakarta': 'ID', 'Asia/Dubai': 'AE', 'Africa/Lagos': 'NG',
  'Europe/Paris': 'FR', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Europe/Istanbul': 'TR',
  'Africa/Mogadishu': 'SO', 'Asia/Damascus': 'SY', 'Asia/Amman': 'JO', 'Asia/Beirut': 'LB',
  'Asia/Kuwait': 'KW', 'Asia/Qatar': 'QA', 'Asia/Muscat': 'OM', 'Asia/Bahrain': 'BH',
  'Asia/Aden': 'YE', 'Africa/Khartoum': 'SD', 'Europe/London': 'GB', 'Asia/Singapore': 'SG'
};

/* ============================ الاستقبال ============================ */

function doPost(e) {
  // إن وُجدت doPost في المنظومة فلا تُضِف هذه؛ انقل الفرع أدناه إلى بدايتها (انظر README).
  try {
    if (e && e.postData && e.postData.contents) {
      var body = JSON.parse(e.postData.contents);
      if (body && body.source_system === 'libyandamai_site_analytics') return logSiteEvent_(body);
    }
  } catch (err) { /* ليست نبضة إحصائيات */ }
  return json_({ ok: false });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, max);
}

/** يتحقق من النبضة ويحوّلها لصف؛ يعيد null إن كانت غير صالحة. دالة نقية للاختبار. */
function buildRow_(body, now) {
  var ev = clean_(body.event || 'visit', 20);
  if (AN_EVENTS.indexOf(ev) < 0) return null;
  var vid = clean_(body.vid, 40);
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(vid)) return null;
  var page = clean_(body.page, 200);
  if (!page || page.charAt(0) !== '/') return null;
  var cc = clean_(body.country, 2).toUpperCase();
  var ccSource = 'netlify';
  if (!/^[A-Z]{2}$/.test(cc)) {
    cc = AN_TZ_COUNTRY[clean_(body.tz, 60)] || '';
    ccSource = cc ? 'tz' : '';
  }
  return [
    now, vid, ev, page, clean_(body.title, 120), clean_(body.source, 60) || 'مباشر',
    clean_(body.device, 20) || 'أخرى', clean_(body.os, 20) || 'أخرى', clean_(body.browser, 20) || 'أخرى',
    cc || 'XX', ccSource, clean_(body.lang, 5) || 'ar', clean_(body.screen, 12)
  ];
}

function logSiteEvent_(body) {
  var now = new Date();
  var row = buildRow_(body, now);
  if (!row) return json_({ ok: false });
  // حدود الإغراق
  var cache = CacheService.getScriptCache();
  var dayKey = 'an_day_' + Utilities.formatDate(now, AN_TZ, 'yyyyMMdd');
  var vidKey = 'an_vid_' + row[1] + '_' + Math.floor(now.getTime() / 600000);
  var dayN = Number(cache.get(dayKey) || 0), vidN = Number(cache.get(vidKey) || 0);
  if (dayN >= AN_DAILY_CAP || vidN >= AN_VID_CAP_10MIN) return json_({ ok: false, limited: true });
  cache.put(dayKey, String(dayN + 1), 21600);
  cache.put(vidKey, String(vidN + 1), 600);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { ensureSheet_(AN_SHEET).appendRow(row); } finally { lock.releaseLock(); }
  return json_({ ok: true });
}

function ensureSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(AN_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, AN_HEADERS.length).setFontWeight('bold');
  } else if (sh.getRange(1, 3).getValue() !== AN_HEADERS[2]) {
    throw new Error('شيت «' + name + '» بترتيب أعمدة قديم؛ أعد تسميته إلى أرشيف قبل التشغيل.');
  }
  return sh;
}

/* ============================ الحساب ============================ */

function dayKey_(d) { return Utilities.formatDate(d, AN_TZ, 'yyyy-MM-dd'); }

/** دالة نقية: rows بصيغة الشيت (بدون الرؤوس). تعيد كائن الإحصائيات. */
function computeStats_(rows, periodKey, now) {
  var days = AN_PERIODS[periodKey] || 30;
  var end = now.getTime();
  var start = periodKey === 'today' ? startOfDay_(now) : end - days * 86400000;
  if (periodKey === 'all') {
    var first = end;
    rows.forEach(function (r) { if (r[0] instanceof Date && r[0].getTime() < first) first = r[0].getTime(); });
    start = Math.min(first, end - 86400000);
  }
  var prevStart = periodKey === 'all' ? end + 1 : start - (end - start);
  var cur = [], prev = [];
  rows.forEach(function (r) {
    var t = r[0] instanceof Date ? r[0].getTime() : NaN;
    if (isNaN(t) || t > end) return;
    if (t >= start) cur.push(r); else if (t >= prevStart) prev.push(r);
  });

  function agg(list) {
    var vis = {}, pv = 0;
    list.forEach(function (r) {
      if (r[2] === 'visit') pv++;
      if (!vis[r[1]]) vis[r[1]] = r; // أول ظهور للزائر في الفترة
    });
    return { vis: vis, pv: pv, n: Object.keys(vis).length };
  }
  var c = agg(cur), p = agg(prev);

  var byCountry = {}, byDevice = {}, byBrowser = {}, byOs = {}, bySource = {}, byPage = {}, titles = {}, events = {};
  Object.keys(c.vis).forEach(function (v) {
    var r = c.vis[v];
    bump_(byCountry, r[9] === 'XX' ? 'غير معروف' : r[9]);
    bump_(byDevice, r[6]); bump_(byBrowser, r[8]); bump_(byOs, r[7]);
    if (r[5] !== 'داخلي') bump_(bySource, r[5]);
  });
  cur.forEach(function (r) {
    if (r[2] === 'visit') { bump_(byPage, r[3]); titles[r[3]] = r[4] || r[3]; }
    else bump_(events, r[2]);
  });

  // السلسلة اليومية/الشهرية للزوار الفريدين
  var monthly = (end - start) / 86400000 > 92;
  var buckets = {}, order = [];
  var step = 86400000, cursor = startOfDay_(new Date(start));
  while (cursor <= end) {
    var k = Utilities.formatDate(new Date(cursor), AN_TZ, monthly ? 'yyyy-MM' : 'MM/dd');
    if (!(k in buckets)) { buckets[k] = {}; order.push(k); }
    cursor += step;
  }
  cur.forEach(function (r) {
    var k = Utilities.formatDate(r[0], AN_TZ, monthly ? 'yyyy-MM' : 'MM/dd');
    if (k in buckets) buckets[k][r[1]] = 1;
  });
  var daily = order.map(function (k) { return { k: k, v: Object.keys(buckets[k]).length }; });

  var onlineCut = end - AN_ONLINE_MIN * 60000, online = {};
  rows.forEach(function (r) { if (r[0] instanceof Date && r[0].getTime() >= onlineCut && r[0].getTime() <= end) online[r[1]] = 1; });

  var recent = cur.slice().sort(function (a, b) { return b[0] - a[0]; }).slice(0, 50).map(function (r) {
    return { t: Utilities.formatDate(r[0], AN_TZ, 'yyyy-MM-dd HH:mm'), country: r[9], page: titles[r[3]] || r[4] || r[3], event: r[2], source: r[5], device: r[6] };
  });

  return {
    period: periodKey, label: AN_PERIOD_LABELS[periodKey] || periodKey, generatedAt: now.toISOString(),
    visitors: c.n, visitorsPrev: p.n, pageviews: c.pv, pageviewsPrev: p.pv,
    onlineNow: Object.keys(online).length, countriesCount: Object.keys(byCountry).filter(function (k) { return k !== 'غير معروف'; }).length,
    events: events, granularity: monthly ? 'month' : 'day', daily: daily,
    countries: top_(byCountry, 15), devices: top_(byDevice, 10), browsers: top_(byBrowser, 10), os: top_(byOs, 10),
    sources: top_(bySource, 10),
    topPages: top_(byPage, 10).map(function (x) { return { label: titles[x.label] || x.label, count: x.count }; }),
    recent: recent
  };
}

function startOfDay_(d) {
  var s = Utilities.formatDate(d, AN_TZ, 'yyyy-MM-dd');
  return new Date(s + 'T00:00:00+08:00').getTime();
}
function bump_(m, k) { k = k || 'أخرى'; m[k] = (m[k] || 0) + 1; }
function top_(m, n) {
  return Object.keys(m).map(function (k) { return { label: k, count: m[k] }; })
    .sort(function (a, b) { return b.count - a.count; }).slice(0, n);
}

/* ============================ الواجهة والصلاحية ============================ */

/** المالك + البريد المصرّح بها في خاصية السكربت ANALYTICS_ADMINS (مفصولة بفواصل). افتراضيًا: المالك فقط. */
function assertAnalyticsAccess_() {
  var me = (Session.getActiveUser().getEmail() || '').toLowerCase();
  var owner = (SpreadsheetApp.getActiveSpreadsheet().getOwner() || { getEmail: function () { return ''; } }).getEmail().toLowerCase();
  var extra = (PropertiesService.getScriptProperties().getProperty('ANALYTICS_ADMINS') || '').toLowerCase().split(',').map(function (s) { return s.trim(); });
  if (!me || (me !== owner && extra.indexOf(me) < 0)) throw new Error('غير مصرّح: لوحة إحصائيات الموقع للمدير فقط.');
}

function getAnalyticsStats(periodKey) {
  assertAnalyticsAccess_();
  var sh = ensureSheet_(AN_SHEET);
  var last = sh.getLastRow();
  if (last < 2) return computeStats_([], periodKey, new Date());
  var from = Math.max(2, last - AN_MAX_ROWS_READ + 1);
  var rows = sh.getRange(from, 1, last - from + 1, AN_HEADERS.length).getValues();
  return computeStats_(rows, periodKey, new Date());
}

function renderAnalyticsDashboard() {
  assertAnalyticsAccess_();
  return HtmlService.createHtmlOutputFromFile('AnalyticsDashboard').setTitle('إحصائيات موقع داماي').setWidth(1200).setHeight(800);
}

/** أرشفة (لا حذف) الصفوف الأقدم من 12 شهرًا إلى شيت أرشيف. شغّلها يدويًا أو بمشغّل سنوي. */
function archiveOldVisits() {
  assertAnalyticsAccess_();
  var sh = ensureSheet_(AN_SHEET), last = sh.getLastRow();
  if (last < 2) return 0;
  var cut = new Date(); cut.setMonth(cut.getMonth() - 12);
  var data = sh.getRange(2, 1, last - 1, AN_HEADERS.length).getValues();
  var old = data.filter(function (r) { return r[0] instanceof Date && r[0] < cut; });
  if (!old.length) return 0;
  var arc = ensureSheet_(AN_ARCHIVE_SHEET);
  arc.getRange(arc.getLastRow() + 1, 1, old.length, AN_HEADERS.length).setValues(old);
  var keep = data.filter(function (r) { return !(r[0] instanceof Date && r[0] < cut); });
  sh.getRange(2, 1, last - 1, AN_HEADERS.length).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, AN_HEADERS.length).setValues(keep);
  return old.length;
}
