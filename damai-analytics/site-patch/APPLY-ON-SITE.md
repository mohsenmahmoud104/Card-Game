# تطبيق رقعة الموقع (على النسخة الكاملة الحالية، لا على نسخة الكود وحدها)
**الاستضافة (محدَّثة 27/11):** الموقع ينتقل من Netlify إلى **Cloudflare Pages** (نفد رصيد Netlify). الأساس هو أحدث إصدار موحّد (v3: `damai-site-cloudflare_2026-11-25_withdraw.zip` أو ما بعده)، وليس نسخة 22/11.
1. انسخ `tracker/damai-analytics.js` إلى `assets/js/` وضع رابط `/exec` في `ENDPOINT` (بعد دمج المنظومة).
2. أضف قبل `</body>` في كل صفحة (يُفضَّل من القالب `build_layout.py`): `<script src="/assets/js/damai-analytics.js" defer></script>`. المتتبّع يتجاهل `/erp` و`/staff` بنفسه.
3. `_headers` (صيغة Cloudflare Pages): أضف إلى `connect-src` الموجودة: `https://script.google.com https://script.googleusercontent.com` مع الإبقاء على قيمها الحالية. (`script-src 'self'` يكفي لأن المتتبّع ملف خارجي لا inline.)
4. **الدولة:** المتتبّع يجرّب `/cdn-cgi/trace` أولًا، وهو يعمل على Cloudflare بلا أي دالة (يقرأ المتصفح سطر `loc` فقط، ولا يُرسل IP ولا يُخزَّن). تأكد أن `connect-src 'self'` يسمح به (نفس الأصل). لا حاجة لـ `netlify/edge-functions/geo.js` على Cloudflare؛ يبقى احتياطًا فقط إن عاد الموقع إلى Netlify.
5. أدرج `privacy-analytics-section.html` في `privacy.html` وحدّث تاريخ «آخر تحديث».
6. انشر **النسخة الكاملة** عبر Create deployment في Cloudflare Pages (لا نسخة الكود وحدها: تفتقد الصور والفيديو). سجّل رقم النشر الحالي أولًا؛ الرجوع بـ Rollback من تبويب Deployments.
7. اختبار: على `libyandamai.pages.dev` أولًا (قبل ربط النطاق): زيارة من هاتف ← صف جديد في «زيارات الموقع» بدولة صحيحة ← يظهر في اللوحة. ثم مع DNT مفعّل ← لا صف. ثم بعد ربط `libyandamai.com` أعد الاختبار.
