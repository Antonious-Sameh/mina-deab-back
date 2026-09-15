// src/models/Passkey.js
// تخزين "مفاتيح المرور" (WebAuthn Passkeys) — بديل اختياري لكود الدخول العادي.
//
// مهم جدًا: المُخزَّن هنا هو المفتاح العام (public key) بتاع بروتوكول WebAuthn
// بس — مفيش أي بيانات بيومترية (بصمة/وجه) اتبعتت للسيرفر أو اتخزنت هنا خالص.
// التحقق من البصمة/الوجه بيحصل محليًا جوه نظام تشغيل جهاز المستخدم فقط؛
// اللي بيوصلنا هو توقيع رقمي بيثبت إن نفس الجهاز اللي سجّل قبل كده.
//
// الـ deviceId هنا هو نفس الـ UUID الثابت اللي بيتولّد في المتصفح
// (front/src/lib/deviceId.js) ومُتبعت مع تسجيل الدخول العادي — مش أي حاجة
// تانية. بنستخدمه عشان نربط كل Passkey بجهاز معيّن، ونتأكد إن الجهاز ده لسه
// هو نفسه المسجّل في User.deviceId (نظام "جهاز واحد للطالب") وقت أي استخدام.

const mongoose = require('mongoose');

const passkeySchema = new mongoose.Schema(
  {
    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },

    // نفس الـ UUID الثابت بتاع الجهاز (lib/deviceId.js) وقت تسجيل الـ Passkey.
    // بيتقارن بـ User.deviceId عند كل استخدام — لو اختلفوا، الـ Passkey ده
    // بيتمسح فورًا (الجهاز بقى غير مربوط بالحساب).
    deviceId: {
      type:     String,
      required: true,
    },

    // معرّف الـ Credential بتاع WebAuthn — Base64URL، فريد لكل Passkey.
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

    // عداد استخدام يزوّد مع كل عملية دخول ناجحة — بيمنع "replay attacks"
    // (استنساخ الـ authenticator): لو القيمة الجاية من الجهاز أقل من أو تساوي
    // المخزّنة، ده مؤشر تلاعب ونرفض الدخول.
    counter: {
      type:     Number,
      required: true,
      default:  0,
    },

    // طرق النقل اللي الجهاز بلّغ عنها وقت التسجيل (internal, hybrid, usb...).
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

// لازم يبقى فيه Passkey واحد بس لكل زوج (مستخدم + جهاز) — تفعيل تاني على
// نفس الجهاز بيستبدل القديم بدل ما يضيف نسخة تانية.
passkeySchema.index({ user: 1, deviceId: 1 }, { unique: true });

module.exports = mongoose.model('Passkey', passkeySchema);