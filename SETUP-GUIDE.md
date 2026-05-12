# دليل نشر تطبيق متابعة الحضور

## المتطلبات
- حساب GitHub (مجاني): https://github.com
- حساب Supabase (مجاني): https://supabase.com
- حساب Vercel (مجاني): https://vercel.com

---

## الخطوة 1: إعداد قاعدة البيانات في Supabase

1. افتح https://supabase.com وسجّل دخولك
2. اضغط "New Project" واختر اسمًا للمشروع
3. انتظر حتى يكتمل إنشاء المشروع (~2 دقيقة)
4. من القائمة الجانبية، اضغط **SQL Editor**
5. انسخ محتوى ملف `supabase-schema.sql` والصقه هناك
6. اضغط **Run** - يجب أن يظهر "Success"

### الحصول على مفاتيح Supabase:
- من القائمة الجانبية: **Settings > API**
- انسخ: **Project URL** و **anon public key**

---

## الخطوة 2: رفع الكود إلى GitHub

1. افتح https://github.com وأنشئ مستودعًا جديدًا (New Repository)
   - اسم مثلاً: `attendance-app`
   - اجعله **Public**
2. ارفع ملفات المشروع إلى المستودع
   - يمكنك استخدام زر "Upload files" مباشرةً في GitHub
   - ارفع جميع الملفات والمجلدات (pages, lib, styles, etc.)

---

## الخطوة 3: نشر التطبيق على Vercel

1. افتح https://vercel.com وسجّل دخولك بحساب GitHub
2. اضغط **Add New > Project**
3. اختر مستودع `attendance-app` من القائمة
4. قبل الضغط على Deploy، اضغط **Environment Variables** وأضف:
   ```
   NEXT_PUBLIC_SUPABASE_URL = (القيمة من Supabase)
   NEXT_PUBLIC_SUPABASE_ANON_KEY = (القيمة من Supabase)
   ```
5. اضغط **Deploy** وانتظر ~2 دقيقة
6. ستحصل على رابط مثل: `https://attendance-app-xxxx.vercel.app`

---

## الخطوة 4: البدء في الاستخدام

### لوحة المشرف:
```
https://attendance-app-xxxx.vercel.app/
```

### واجهة الموظفة:
1. افتح لوحة المشرف
2. اذهب إلى تبويب "الموظفات"
3. أضف اسم كل موظفة
4. انسخ رابطها الخاص وأرسله لها
   ```
   https://attendance-app-xxxx.vercel.app/checkin/[معرف-الموظفة]
   ```

---

## ملاحظات مهمة

- **مجاني تماماً**: Supabase يوفر 500MB مجاناً، Vercel لا حدود للنشر
- **تحديث فوري**: عندما تسجّل موظفة دخولها، يظهر فوراً في لوحة المشرف
- **بدون تسجيل دخول**: كل موظفة تصل عبر رابطها الخاص مباشرةً
- **يعمل على الموبايل**: الواجهة متجاوبة مع الهاتف

---

## بنية الملفات

```
attendance-app/
├── pages/
│   ├── index.js          ← لوحة المشرف
│   ├── _app.js           ← إعداد التطبيق
│   └── checkin/
│       └── [id].js       ← واجهة تسجيل الحضور للموظفة
├── lib/
│   └── supabase.js       ← اتصال قاعدة البيانات
├── styles/
│   └── globals.css       ← التصميم
├── supabase-schema.sql   ← كود إنشاء قاعدة البيانات
├── package.json
└── next.config.js
```
