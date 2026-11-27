/**
 * مشروع الاستقبال المستقل لإحصائيات موقع داماي (Apps Script مرتبط بجدول جديد مستقل: «زيارات موقع داماي»).
 * يحتوي الاستقبال والأرشفة فقط، ولا شيء من المنظومة المالية، فيصحّ نشره بوصول «أي شخص» دون كشف أي دالة مالية.
 * النشر: Deploy ← New deployment ← Web app ← Execute as: Me ← Who has access: Anyone.
 * بعد اللصق: شغّل installIntakeTriggers مرة واحدة من المحرر بحساب المالك (يطلب تفويضًا لمرة واحدة).
 */
var AN_SHEET = 'زيارات الموقع';
var AN_ARCHIVE_SHEET = 'زيارات الموقع — أرشيف';
var AN_TZ = 'Asia/Kuala_Lumpur';
var AN_HEADERS = ['الوقت', 'معرّف الزائر', 'الحدث', 'الصفحة', 'العنوان', 'المصدر', 'الجهاز', 'النظام', 'المتصفح', 'الدولة', 'مصدر الدولة', 'اللغة', 'الشاشة'];
var AN_EVENTS = ['visit', 'download', 'whatsapp_click', 'form_submit', 'quiz_start', 'quiz_done'];
var AN_DAILY_CAP = 20000;   // أقصى صفوف في اليوم (حماية من الإغراق)
var AN_VID_CAP_10MIN = 60;  // أقصى أحداث لكل زائر كل 10 دقائق
var AN_TZ_COUNTRY = {
  'Africa/Cairo': 'EG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY', 'Africa/Tripoli': 'LY',
  'Africa/Casablanca': 'MA', 'Africa/Algiers': 'DZ', 'Africa/Tunis': 'TN', 'Asia/Riyadh': 'SA',
  'Asia/Baghdad': 'IQ', 'Asia/Jakarta': 'ID', 'Asia/Dubai': 'AE', 'Africa/Lagos': 'NG',
  'Europe/Paris': 'FR', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Europe/Istanbul': 'TR',
  'Africa/Mogadishu': 'SO', 'Asia/Damascus': 'SY', 'Asia/Amman': 'JO', 'Asia/Beirut': 'LB',
  'Asia/Kuwait': 'KW', 'Asia/Qatar': 'QA', 'Asia/Muscat': 'OM', 'Asia/Bahrain': 'BH',
  'Asia/Aden': 'YE', 'Africa/Khartoum': 'SD', 'Europe/London': 'GB', 'Asia/Singapore': 'SG'
};

function doGet() { // زيارة الرابط من متصفح لا تكشف شيئًا
  return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    if (e && e.postData && e.postData.contents) {
      var body = JSON.parse(e.postData.contents);
      if (body && body.source_system === 'libyandamai_site_analytics') return logSiteEvent_(body);
    }
  } catch (err) { /* تجاهل بصمت */ }
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
  var ccSource = 'cloudflare';
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

function intakeSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(AN_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, AN_HEADERS.length).setFontWeight('bold');
  } else if (sh.getRange(1, 3).getValue() !== AN_HEADERS[2]) {
    throw new Error('شيت «' + name + '» بترتيب أعمدة غير متوقع.');
  }
  return sh;
}

function logSiteEvent_(body) {
  var now = new Date();
  var row = buildRow_(body, now);
  if (!row) return json_({ ok: false });
  var cache = CacheService.getScriptCache();
  var dayKey = 'an_day_' + Utilities.formatDate(now, AN_TZ, 'yyyyMMdd');
  var vidKey = 'an_vid_' + row[1] + '_' + Math.floor(now.getTime() / 600000);
  var dayN = Number(cache.get(dayKey) || 0), vidN = Number(cache.get(vidKey) || 0);
  if (dayN >= AN_DAILY_CAP || vidN >= AN_VID_CAP_10MIN) return json_({ ok: false, limited: true });
  cache.put(dayKey, String(dayN + 1), 21600);
  cache.put(vidKey, String(vidN + 1), 600);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { intakeSheet_(AN_SHEET).appendRow(row); } finally { lock.releaseLock(); }
  return json_({ ok: true });
}

/* ===== الأرشفة: لا حذف. الصفوف الأقدم من 12 شهرًا تُنقل إلى الأرشيف بلا معرّف الزائر ===== */

function splitForArchive_(data, cut) {
  var old = [], keep = [];
  data.forEach(function (r) {
    if (r[0] instanceof Date && r[0] < cut) { var a = r.slice(); a[1] = ''; old.push(a); } else keep.push(r);
  });
  return { old: old, keep: keep };
}

function archiveOldVisitsJob() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = intakeSheet_(AN_SHEET), last = sh.getLastRow();
    if (last < 2) return 0;
    var cut = new Date(); cut.setMonth(cut.getMonth() - 12);
    var data = sh.getRange(2, 1, last - 1, AN_HEADERS.length).getValues();
    var sp = splitForArchive_(data, cut);
    if (!sp.old.length) return 0;
    var arc = intakeSheet_(AN_ARCHIVE_SHEET);
    arc.getRange(arc.getLastRow() + 1, 1, sp.old.length, AN_HEADERS.length).setValues(sp.old);
    sh.getRange(2, 1, last - 1, AN_HEADERS.length).clearContent();
    if (sp.keep.length) sh.getRange(2, 1, sp.keep.length, AN_HEADERS.length).setValues(sp.keep);
    return sp.old.length;
  } finally { lock.releaseLock(); }
}

/** شغّلها مرة واحدة من المحرر: مشغّل شهري (اليوم 1، 3 صباحًا). آمنة للتكرار. */
function installIntakeTriggers() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'archiveOldVisitsJob'; });
  if (!has) ScriptApp.newTrigger('archiveOldVisitsJob').timeBased().onMonthDay(1).atHour(3).create();
  intakeSheet_(AN_SHEET); // يُنشئ الشيت بالرؤوس إن لم يكن موجودًا
}
