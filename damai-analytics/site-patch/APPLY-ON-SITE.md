# تطبيق رقعة الموقع (على النسخة الكاملة الحية، لا على نسخة الكود فقط)
1. انسخ `tracker/damai-analytics.js` إلى `assets/js/` وضع رابط `/exec` في `ENDPOINT` (بعد دمج المنظومة).
2. أضف قبل `</body>` في كل صفحة (يُفضَّل من القالب `build_layout.py`): `<script src="/assets/js/damai-analytics.js" defer></script>` — واستثنِ صفحات `/erp` و`/staff` (المتتبّع نفسه يتجاهلها).
3. `_headers`: أضف إلى `connect-src` الموجودة: `https://script.google.com https://script.googleusercontent.com` (مع الإبقاء على قيمها الحالية).
4. انسخ `netlify/edge-functions/geo.js` إلى `netlify/edge-functions/geo.js` في جذر الموقع.
5. أدرج `privacy-analytics-section.html` في `privacy.html` (وحدّث تاريخ «آخر تحديث» فيها).
6. انشر **كامل الموقع** (لا نسخة الكود وحدها: نشر Netlify يستبدل الموقع كله، فنقص الصور يحذفها). احتفظ برقم النشر الحالي للرجوع.
7. اختبار: افتح الموقع من هاتف ← صف جديد في «زيارات الموقع» ← يظهر في اللوحة. ثم من المتصفح مع DNT مفعّل ← لا صف.
