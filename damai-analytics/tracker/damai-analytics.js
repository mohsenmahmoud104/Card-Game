/*!
 * damai-analytics.js — نبضة إحصائيات موقع داماي (الإصدار 2)
 * بلا ملفات تعريف ارتباط، بلا IP، بلا بيانات شخصية. معرّف الزائر عشوائي محلي في localStorage.
 * معطّلة تمامًا ما دام ENDPOINT فارغًا. تُحمَّل بوسم: <script src="/assets/js/damai-analytics.js" defer></script>
 * لتسجيل حدث مخصص (مثل المسابقات): window.damaiTrack('quiz_start') / ('quiz_done')
 */
(function () {
  'use strict';
  var ENDPOINT = ''; // ← رابط /exec لتطبيق الويب بعد النشر (انظر README)
  if (!ENDPOINT) return;
  try {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
    var path = location.pathname;
    if (/^\/(erp|staff|admin)(\/|$)/.test(path)) return;
    var ua = navigator.userAgent || '';
    if (/bot|crawl|spider|slurp|lighthouse|headless|preview|facebookexternalhit|whatsapp\/|curl|wget/i.test(ua)) return;

    var vid = '';
    try {
      vid = localStorage.getItem('damai_vid') || '';
      if (!/^[A-Za-z0-9_-]{8,40}$/.test(vid)) {
        var a = new Uint8Array(12); crypto.getRandomValues(a);
        vid = Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        localStorage.setItem('damai_vid', vid);
      }
    } catch (e) { vid = 'tmp' + Math.random().toString(36).slice(2, 12); }

    function device() {
      if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'تابلت';
      if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'موبايل';
      return 'كمبيوتر';
    }
    function os() {
      if (/Android/i.test(ua)) return 'Android';
      if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
      if (/Windows/i.test(ua)) return 'Windows';
      if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
      if (/Linux|X11|CrOS/i.test(ua)) return 'Linux';
      return 'أخرى';
    }
    function browser() {
      if (/Edg\//.test(ua)) return 'Edge';
      if (/OPR\/|Opera/.test(ua)) return 'Opera';
      if (/SamsungBrowser/.test(ua)) return 'Samsung';
      if (/Firefox\/|FxiOS/.test(ua)) return 'Firefox';
      if (/Chrome\/|CriOS/.test(ua)) return 'Chrome';
      if (/Safari\//.test(ua)) return 'Safari';
      return 'أخرى';
    }
    function source() {
      var u = new URLSearchParams(location.search).get('utm_source');
      if (u) return u.slice(0, 40);
      var r = document.referrer;
      if (!r) return 'مباشر';
      var h; try { h = new URL(r).hostname.replace(/^www\./, ''); } catch (e) { return 'مباشر'; }
      if (h === location.hostname.replace(/^www\./, '')) return 'داخلي';
      if (/(^|\.)(facebook|fb)\.com$|^l\.facebook|^lm\.facebook/.test(h)) return 'Facebook';
      if (/(^|\.)google\./.test(h)) return 'Google';
      if (/bing\.com$/.test(h)) return 'Bing';
      if (/duckduckgo\.com$/.test(h)) return 'DuckDuckGo';
      if (/(^|\.)(wa\.me|whatsapp\.com)$/.test(h)) return 'WhatsApp';
      if (/instagram\.com$/.test(h)) return 'Instagram';
      if (/^t\.co$|(^|\.)(twitter|x)\.com$/.test(h)) return 'X';
      if (/youtube\.com$|youtu\.be$/.test(h)) return 'YouTube';
      return h.slice(0, 60);
    }
    function title() { return (document.title || '').split(/\s[|–—-]\s/)[0].slice(0, 100); }

    var base = {
      source_system: 'libyandamai_site_analytics', v: 2, vid: vid, page: path,
      title: title(), source: source(), device: device(), os: os(), browser: browser(),
      lang: (document.documentElement.lang || 'ar').slice(0, 2),
      screen: screen.width + 'x' + screen.height, tz: ''
    };
    try { base.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}

    var country = null, queue = [];
    function post(o) {
      var body = JSON.stringify(o);
      try { if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return; } catch (e) {}
      try { fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: body }); } catch (e) {}
    }
    function send(ev, extra) {
      var o = {}; for (var k in base) o[k] = base[k];
      o.event = ev; o.country = country || '';
      if (extra) { o.title = extra.title || o.title; }
      if (country === null) queue.push(o); else post(o);
    }
    function flush() { var q = queue; queue = []; q.forEach(function (o) { o.country = country || ''; post(o); }); }

    // الدولة: /cdn-cgi/trace (يعمل على Cloudflare بلا دوال، ويقرأ المتصفح سطر loc فقط)، ثم /api/geo (Netlify/دالة).
    // لا يُرسَل أي IP إلى الخادم ولا يُخزَّن. مهلة قصيرة ثم نكمل بلا دولة (تُقدَّر من المنطقة الزمنية).
    var timer = setTimeout(function () { if (country === null) { country = ''; flush(); } }, 1500);
    function geoTrace() {
      return fetch('/cdn-cgi/trace', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.text(); })
        .then(function (t) { var m = /^loc=([A-Z]{2})$/m.exec(t); if (!m) throw 0; return m[1]; });
    }
    function geoApi() {
      return fetch('/api/geo', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (j) { if (!j || !/^[A-Z]{2}$/.test(j.country)) throw 0; return j.country; });
    }
    geoTrace().catch(geoApi).then(function (c) { country = c; }).catch(function () { country = ''; })
      .then(function () { clearTimeout(timer); flush(); });

    send('visit');
    window.damaiTrack = function (ev) { send(String(ev)); };

    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var h = a.getAttribute('href') || '';
      if (/\.pdf($|\?)/i.test(h)) send('download');
      else if (/wa\.me|whatsapp\.com|api\.whatsapp/i.test(h)) send('whatsapp_click');
    }, true);
    document.addEventListener('damai:form-success', function () { send('form_submit'); });
  } catch (e) { /* لا تؤثر على الموقع أبدًا */ }
})();
