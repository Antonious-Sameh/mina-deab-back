// src/models/AdminGatePasskey.js
// "بصمة الصفحات المحمية" — بديل اختياري لكلمة مرور AdminPasswordGate، على
// مستوى كل جهاز على حدة.
//
// مهم جدًا: ده Model مستقل تمامًا عن back/src/models/Passkey.js (بصمة تسجيل
// الدخول العادي بتاعة الطالب/المدرس) — مفيش أي ارتباط أو استخدام مشترك بين
// الاتنين، وده مقصود:
//   - Passkey.js مبني حوالين قاعدة "جهاز واحد للطالب" (بيقارن deviceId بتاع
//     البصمة مع User.deviceId في كل مرة، ويمسح البصمة لو اختلفوا).
//   - هنا مفيش أي قيد من النوع ده خالص — المدرس المفروض يقدر يسجّل بصمة
//     الصفحات المحمية دي على أكتر من جهاز (موبايله ولابتوبه مثلاً) من غير
//     أي تعارض أو مسح تلقائي لأي بصمة تانية.
//
// نفس مبدأ الأمان المتبع في Passkey.js: المُخزَّن هنا هو المفتاح العام
// (public key) بتاع بروتوكول WebAuthn بس — مفيش أي بيانات بيومترية (بصمة/
// وجه) بتوصل للسيرفر أو بتتخزن هنا خالص. التحقق الفعلي من البصمة بيحصل
// محليًا جوه نظام تشغيل جهاز المستخدم فقط.

const mongoose = require('mongoose');

const adminGatePasskeySchema = new mongoose.Schema(
  {
    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },

    // نفس الـ UUID الثابت بتاع الجهاز (front/src/lib/deviceId.js) — هنا
    // بنستخدمه بس عشان نفرّق بصمة كل جهاز عن التاني (نعرف نمسح بصمة جهاز
    // معيّن لوحده)، مش لأي قيد "جهاز واحد" زي Passkey.js.
    deviceId: {
      type:     String,
      required: true,
    },

    // معرّف الـ Credential بتاع WebAuthn — Base64URL، فريد لكل بصمة.
    credentialId: {
      type:     String,
      required: true,
      unique:   true,
    },

    // المفتاح العام (public key) — مش بيانات بيومترية، مجرد مفتاح تشفير عادي.
    publicKey: {
      type:     Buffer,
      required: true,
    },

    // عداد استخدام يزوّد مع كل عملية فتح ناجحة — بيمنع "replay attacks".
    counter: {
      type:     Number,
      required: true,
      default:  0,
    },

    transports: {
      type:    [String],
      default: [],
    },

    lastUsedAt: {
      type:    Date,
      default: null,
    },
  },
  { timestamps: true }
);

// بصمة واحدة بس لكل زوج (مستخدم + جهاز) — إعادة تسجيل على نفس الجهاز
// بتستبدل القديمة بدل ما تضيف نسخة تانية.
adminGatePasskeySchema.index({ user: 1, deviceId: 1 }, { unique: true });

module.exports = mongoose.model('AdminGatePasskey', adminGatePasskeySchema);
