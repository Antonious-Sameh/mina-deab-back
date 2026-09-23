// src/controllers/adminGatePasskey.controller.js
// "بصمة الصفحات المحمية" — بديل اختياري لكلمة مرور AdminPasswordGate، على
// مستوى كل جهاز. مستقل تمامًا عن passkey.controller.js (بصمة تسجيل الدخول):
//   - مفيش أي قيد "جهاز واحد" هنا.
//   - مفيش أي علاقة بـ auth.controller.js/token.service.js — النتيجة هنا
//     مش "تسجيل دخول"، هي بس { valid: true/false } بالظبط زي
//     verifyAdminPassword في account.controller.js، عشان AdminPasswordGate
//     يقدر يعامل الاتنين (كلمة المرور والبصمة) بنفس الشكل.
//   - تسجيل بصمة جديدة على أي جهاز محتاج كلمة مرور الصفحات المحمية تتبعت
//     وتتأكد صحتها الأول (في خطوة /register/options) — يعني محدش يقدر
//     يسجّل بصمة على جهازه من غير ما يعرف كلمة المرور أصلاً. البصمة بعد
//     كده بتفضل خاصة بالجهاز ده بس (مربوطة فيزيائيًا بالـ hardware، مفيش
//     أي "كود" ينفع يتشارك عشان حد يكررها على جهاز تاني).

const crypto = require('crypto');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const User             = require('../models/User');
const AdminGatePasskey = require('../models/AdminGatePasskey');
const { CLIENT_URL, COOKIE_SECRET, NODE_ENV } = require('../config/env');
const { success, unauthorized, notFound, error, forbidden } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── إعدادات WebAuthn — نفس القيم المشتقة من CLIENT_URL بالظبط زي
// passkey.service.js (لازم تتطابق مع الدومين الفعلي اللي الموقع شغال
// عليه)، لكن محسوبة هنا بشكل مستقل عشان الميزة دي تفضل ملف قائم بذاته
// من غير أي استيراد من نظام بصمة تسجيل الدخول. ─────────────────────────────
const clientUrl = new URL(CLIENT_URL);
const RP_ID   = clientUrl.hostname;
const RP_NAME = 'خطوة بلس — الصفحات المحمية';
const ORIGIN  = clientUrl.origin;
const isProd  = NODE_ENV === 'production';

// ── كوكي الـ Challenge المؤقت (نفس أسلوب التوقيع اليدوي بـ HMAC المستخدم في
// passkey.service.js، ولنفس السبب بالظبط: الاعتماد على `signed: true`
// المدمجة في Express كان بيفشل في بيئة الإنتاج الفعلية). ────────────────────
const CHALLENGE_COOKIE_MAX_AGE_MS = 5 * 60 * 1000; // 5 دقايق
const REG_CHALLENGE_COOKIE    = 'gatePasskeyRegChallenge';
const UNLOCK_CHALLENGE_COOKIE = 'gatePasskeyUnlockChallenge';

const cookieOptions = () => ({
  httpOnly: true,
  secure:   isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge:   CHALLENGE_COOKIE_MAX_AGE_MS,
});

function sign(value) {
  const hmac = crypto.createHmac('sha256', COOKIE_SECRET).update(value).digest('hex');
  return `${value}.${hmac}`;
}

function verifySignedCookie(signedValue) {
  if (!signedValue || typeof signedValue !== 'string') return null;
  const idx = signedValue.lastIndexOf('.');
  if (idx === -1) return null;
  const value = signedValue.slice(0, idx);
  const providedHmac = signedValue.slice(idx + 1);
  const expectedHmac = crypto.createHmac('sha256', COOKIE_SECRET).update(value).digest('hex');
  const a = Buffer.from(providedHmac, 'hex');
  const b = Buffer.from(expectedHmac, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

const setChallengeCookie = (res, name, challenge) => res.cookie(name, sign(challenge), cookieOptions());
const getChallengeCookie = (req, name) => verifySignedCookie(req.cookies?.[name]);
const clearChallengeCookie = (res, name) => {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(name, opts);
};

// userID لازم يبقى Uint8Array ثابت لكل مستخدم (مش عشوائي).
function toUserIDBuffer(userId) {
  return new Uint8Array(Buffer.from(userId.toString(), 'utf-8'));
}

// ── POST /api/account/gate-passkey/register/options ───────────────────────
// (محمي بـ protect — ومحتاج كلمة مرور الصفحات المحمية صح كمان، هي دي
// الحماية الحقيقية من إن أي جهاز يسجّل بصمة من غير ما يعرف كلمة المرور)
const registerOptions = asyncHandler(async (req, res) => {
  if (req.user.role !== 'teacher') return forbidden(res, 'غير مصرح');

  const { deviceId, password } = req.body;
  if (!deviceId) return error(res, 'رقم الجهاز مطلوب', 400);
  if (!password) return error(res, 'كلمة مرور الصفحات المحمية مطلوبة', 400);

  const user = await User.findById(req.user.userId).select('+adminPagesPassword');
  if (!user) return notFound(res, 'المستخدم غير موجود');

  if (!user.adminPagesPassword || password !== user.adminPagesPassword) {
    return unauthorized(res, 'كلمة المرور غير صحيحة');
  }

  const existing = await AdminGatePasskey.find({ user: user._id }).select('credentialId transports');

  const options = await generateRegistrationOptions({
    rpName:   RP_NAME,
    rpID:     RP_ID,
    userName: user.codePlain,
    userID:   toUserIDBuffer(user._id),
    userDisplayName: user.name,
    authenticatorSelection: {
      residentKey:      'preferred',
      userVerification:  'preferred',
    },
    excludeCredentials: existing.map((p) => ({
      id:         p.credentialId,
      transports: p.transports,
    })),
  });

  setChallengeCookie(res, REG_CHALLENGE_COOKIE, options.challenge);
  return success(res, { options });
});

// ── POST /api/account/gate-passkey/register/verify ─────────────────────────
const registerVerify = asyncHandler(async (req, res) => {
  if (req.user.role !== 'teacher') return forbidden(res, 'غير مصرح');

  const { deviceId, response } = req.body;
  if (!deviceId || !response) return error(res, 'بيانات ناقصة', 400);

  const user = await User.findById(req.user.userId);
  if (!user) return notFound(res, 'المستخدم غير موجود');

  const expectedChallenge = getChallengeCookie(req, REG_CHALLENGE_COOKIE);
  if (!expectedChallenge) {
    return unauthorized(res, 'انتهت صلاحية طلب التفعيل، حاول مرة أخرى');
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID:   RP_ID,
    });
  } catch {
    clearChallengeCookie(res, REG_CHALLENGE_COOKIE);
    return unauthorized(res, 'تعذّر التحقق من البصمة، حاول مرة أخرى');
  }

  clearChallengeCookie(res, REG_CHALLENGE_COOKIE);

  if (!verification.verified || !verification.registrationInfo) {
    return unauthorized(res, 'تعذّر التحقق من البصمة');
  }

  const { credential } = verification.registrationInfo;

  // Upsert — بصمة قديمة لنفس الجهاز بتتستبدل بدل ما تتضاف نسخة تانية.
  await AdminGatePasskey.findOneAndUpdate(
    { user: user._id, deviceId },
    {
      user:         user._id,
      deviceId,
      credentialId: credential.id,
      publicKey:    Buffer.from(credential.publicKey),
      counter:      credential.counter,
      transports:   credential.transports || [],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return success(res, {}, 'تم تفعيل بصمة الصفحات المحمية على هذا الجهاز');
});

// ── POST /api/account/gate-passkey/unlock/options ──────────────────────────
// (محمي — المستخدم داخل بحسابه بالفعل، بس محتاج "يفتح" صفحة محمية)
const unlockOptions = asyncHandler(async (req, res) => {
  if (req.user.role !== 'teacher') return forbidden(res, 'غير مصرح');

  const { deviceId } = req.body;
  if (!deviceId) return error(res, 'رقم الجهاز مطلوب', 400);

  const passkey = await AdminGatePasskey.findOne({ user: req.user.userId, deviceId });
  if (!passkey) {
    return notFound(res, 'لا توجد بصمة مفعّلة لهذه الصفحات على هذا الجهاز');
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'preferred',
    allowCredentials: [{ id: passkey.credentialId, transports: passkey.transports }],
  });

  setChallengeCookie(res, UNLOCK_CHALLENGE_COOKIE, options.challenge);
  return success(res, { options });
});

// ── POST /api/account/gate-passkey/unlock/verify ────────────────────────────
// بيرجّع نفس شكل رد verifyAdminPassword بالظبط: { valid: boolean }
const unlockVerify = asyncHandler(async (req, res) => {
  if (req.user.role !== 'teacher') return forbidden(res, 'غير مصرح');

  const { deviceId, response } = req.body;
  if (!deviceId || !response?.id) return success(res, { valid: false });

  const passkey = await AdminGatePasskey.findOne({ user: req.user.userId, deviceId });
  if (!passkey || passkey.credentialId !== response.id) {
    clearChallengeCookie(res, UNLOCK_CHALLENGE_COOKIE);
    return success(res, { valid: false });
  }

  const expectedChallenge = getChallengeCookie(req, UNLOCK_CHALLENGE_COOKIE);
  if (!expectedChallenge) {
    return success(res, { valid: false });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID:   RP_ID,
      credential: {
        id:         passkey.credentialId,
        publicKey:  new Uint8Array(passkey.publicKey),
        counter:    passkey.counter,
        transports: passkey.transports,
      },
    });
  } catch {
    clearChallengeCookie(res, UNLOCK_CHALLENGE_COOKIE);
    return success(res, { valid: false });
  }

  clearChallengeCookie(res, UNLOCK_CHALLENGE_COOKIE);

  if (!verification.verified) {
    return success(res, { valid: false });
  }

  passkey.counter    = verification.authenticationInfo.newCounter;
  passkey.lastUsedAt = new Date();
  await passkey.save();

  return success(res, { valid: true });
});

// ── GET /api/account/gate-passkey/status?deviceId=... ───────────────────────
const status = asyncHandler(async (req, res) => {
  if (req.user.role !== 'teacher') return forbidden(res, 'غير مصرح');

  const { deviceId } = req.query;
  if (!deviceId) return error(res, 'رقم الجهاز مطلوب', 400);

  const exists = await AdminGatePasskey.exists({ user: req.user.userId, deviceId });
  return success(res, { enabled: !!exists });
});

// ── DELETE /api/account/gate-passkey/mine ────────────────────────────────────
const removeMine = asyncHandler(async (req, res) => {
  if (req.user.role !== 'teacher') return forbidden(res, 'غير مصرح');

  const { deviceId } = req.body;
  if (!deviceId) return error(res, 'رقم الجهاز مطلوب', 400);

  const result = await AdminGatePasskey.deleteOne({ user: req.user.userId, deviceId });
  if (result.deletedCount === 0) {
    return notFound(res, 'لا توجد بصمة مفعّلة على هذا الجهاز');
  }

  return success(res, {}, 'تم إلغاء تفعيل بصمة الصفحات المحمية على هذا الجهاز');
});

module.exports = {
  registerOptions, registerVerify,
  unlockOptions,   unlockVerify,
  status, removeMine,
};
