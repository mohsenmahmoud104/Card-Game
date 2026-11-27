/**
 * جانب العرض داخل منظومة داماي ERP: يقرأ شيت «زيارات الموقع» من جدول الاستقبال المستقل ويحسب اللوحة.
 * لا يحتوي doPost ولا مشغّلات. يضيف إلى المنظومة ملفين فقط: هذا الملف وAnalyticsDashboard.html.
 * الإعداد: في خصائص سكربت المنظومة ضع ANALYTICS_SHEET_ID = معرّف جدول «زيارات موقع داماي» (يجب أن يكون
 * حساب مالك المنظومة قادرًا على فتحه). اختياريًا ANALYTICS_ADMINS = بريد1,بريد2 (غير المالك).
 */
var AN_SHEET = 'زيارات الموقع';
var AN_TZ = 'Asia/Kuala_Lumpur';
var AN_NCOLS = 13;
var AN_PERIODS = { today: 1, '7d': 7, '30d': 30, '3m': 90, '1y': 365, all: 3650 };
var AN_PERIOD_LABELS = { today: 'اليوم', '7d': 'آخر 7 أيام', '30d': 'آخر 30 يومًا', '3m': 'آخر 3 أشهر', '1y': 'آخر سنة', all: 'كل الفترة' };
var AN_MAX_ROWS_READ = 60000;
var AN_ONLINE_MIN = 30;

function startOfDay_(d) {
  var s = Utilities.formatDate(d, AN_TZ, 'yyyy-MM-dd');
  return new Date(s + 'T00:00:00+08:00').getTime();
}
function bump_(m, k) { k = k || 'أخرى'; m[k] = (m[k] || 0) + 1; }
function top_(m, n) {
  return Object.keys(m).map(function (k) { return { label: k, count: m[k] }; })
    .sort(function (a, b) { return b.count - a.count; }).slice(0, n);
}

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
      if (!vis[r[1]]) vis[r[1]] = r;
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

  var monthly = (end - start) / 86400000 > 92;
  var buckets = {}, order = [];
  var cursor = startOfDay_(new Date(start));
  while (cursor <= end) {
    var k = Utilities.formatDate(new Date(cursor), AN_TZ, monthly ? 'yyyy-MM' : 'MM/dd');
    if (!(k in buckets)) { buckets[k] = {}; order.push(k); }
    cursor += 86400000;
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

/** المالك + البريد المصرّح بها في ANALYTICS_ADMINS. افتراضيًا المالك فقط. عدّلها لتوافق نظام أدوار المنظومة. */
function assertAnalyticsAccess_() {
  var me = (Session.getActiveUser().getEmail() || '').toLowerCase();
  var ownerObj = SpreadsheetApp.getActiveSpreadsheet().getOwner();
  var owner = ownerObj ? ownerObj.getEmail().toLowerCase() : '';
  var extra = (PropertiesService.getScriptProperties().getProperty('ANALYTICS_ADMINS') || '').toLowerCase().split(',').map(function (s) { return s.trim(); });
  if (!me || (me !== owner && extra.indexOf(me) < 0)) throw new Error('غير مصرّح: لوحة إحصائيات الموقع للمدير فقط.');
}

function analyticsSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('ANALYTICS_SHEET_ID');
  if (!id) throw new Error('لم يُضبط ANALYTICS_SHEET_ID في خصائص السكربت.');
  var sh = SpreadsheetApp.openById(id).getSheetByName(AN_SHEET);
  if (!sh) throw new Error('لا يوجد شيت «' + AN_SHEET + '» في جدول الاستقبال بعد (لم تصل زيارات).');
  return sh;
}

function getAnalyticsStats(periodKey) {
  assertAnalyticsAccess_();
  var sh = analyticsSheet_(), last = sh.getLastRow();
  if (last < 2) return computeStats_([], periodKey, new Date());
  var from = Math.max(2, last - AN_MAX_ROWS_READ + 1);
  return computeStats_(sh.getRange(from, 1, last - from + 1, AN_NCOLS).getValues(), periodKey, new Date());
}

function renderAnalyticsDashboard() {
  assertAnalyticsAccess_();
  return HtmlService.createHtmlOutputFromFile('AnalyticsDashboard').setTitle('إحصائيات موقع داماي').setWidth(1200).setHeight(800);
}
