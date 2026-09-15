// src/controllers/passkey.controller.js
// تفعيل/استخدام "الدخول بالبصمة" (WebAuthn Passkeys).
//
// مبدأ أساسي: البصمة الفعلية (بيومترية) مش بتوصل للسيرفر ولا بتتخزن في أي
// خطوة هنا — كل اللي بيوصلنا هو نتيجة تحقق WebAuthn (public key / توقيع
// رقمي) بعد ما نظام تشغيل الجهاز نفسه يتحقق من البصمة محليًا.
//
// كل نجاح دخول هنا بينتهي بنفس استدعاءات auth.controller.js.login() حرفيًا
// (generateTokenPair + setRefreshToken + setRefreshCookie) — مفيش نظام
// جلسة موازي، ده بالظبط نفس نظام التوكنز العادي.

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const User    = require('../models/User');
const Passkey = require('../models/Passkey');
const {
  RP_ID, RP_NAME, ORIGIN,
  REGISTER_CHALLENGE_COOKIE, LOGIN_CHALLENGE_COOKIE,
  setChallengeCookie, getChallengeCookie, clearChallengeCookie,
} = require('../services/passkey.service');
const { generateTokenPair, setRefreshCookie } = require('../services/token.service');
const { success, unauthorized, notFound, error } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── قيد "الجهاز الواحد" بتاع الطالب — نفس القاعدة المطبّقة في auth.controller
// login()، بس هنا بنتحقق منها مرتين (وقت طلب التفعيل، ووقت التأكيد النهائي)
// زي ما طلب العميل بالظبط، عشان لو حصل Reset Device في المنتصف.
// المدرس مالوش أي قيد هنا برضه — بالظبط زي الدخول العادي.
function assertDeviceBound(user, deviceId) {
  if (user.role !== 'student') return true; // المدرس مالوش قيد أجهزة خالص
  if (!user.deviceId || user.deviceId !== deviceId) return false;
  return true;
}

// userID لازم يبقى Uint8Array ثابت لكل مستخدم (مش عشوائي)، عشان يفضل نفسه
// لو المستخدم سجّل بصمات على أكتر من جهاز.
function toUserIDBuffer(userId) {
  return new Uint8Array(Buffer.from(userId.toString(), 'utf-8'));
}

// ── POST /api/auth/passkey/register/options ───────────────────────────────
// (محمي بـ protect — المستخدم لازم يكون داخل عادي الأول)
const registerOptions = asyncHandler(async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return error(res, 'رقم الجهاز مطلوب', 400);

  const user = await User.findById(req.user.userId);
  if (!user) return unauthorized(res, 'المستخدم غير موجود');

  // ── التحقق الأول: الجهاز ده لازم يكون أصلاً مربوط بحساب الطالب ──────────
  if (!assertDeviceBound(user, deviceId)) {
    return unauthorized(res, 'سجّل دخول عادي من هذا الجهاز أولاً قبل تفعيل البصمة');
  }

  const existingPasskeys = await Passkey.find({ user: user._id }).select('credentialId transports');

  const options = await generateRegistrationOptions({
    rpName:   RP_NAME,
    rpID:     RP_ID,
    userName: user.codePlain,
    userID:   toUserIDBuffer(user._id),
    userDisplayName: user.name,
    // residentKey: 'required' → الـ credential بيتخزن على الجهاز نفسه
    // (discoverable) — ده اللي بيسمح بتسجيل الدخول "بدون اسم مستخدم"
    // (usernameless flow) بعد كده.
    authenticatorSelection: {
      residentKey:      'required',
      userVerification:  'preferred', // بصمة/وجه/PIN — حسب الجهاز
    },
    excludeCredentials: existingPasskeys.map((p) => ({
      id:         p.credentialId,
      transports: p.transports,
    })),
  });

  setChallengeCookie(res, REGISTER_CHALLENGE_COOKIE, options.challenge);

  return success(res, { options });
});

// ── POST /api/auth/passkey/register/verify ─────────────────────────────────
const registerVerify = asyncHandler(async (req, res) => {
  const { deviceId, response } = req.body;
  if (!deviceId || !response) return error(res, 'بيانات ناقصة', 400);

  const user = await User.findById(req.user.userId);
  if (!user) return unauthorized(res, 'المستخدم غير موجود');

  // ── التحقق الثاني: لازم نتأكد تاني إن الجهاز لسه مربوط (ممكن يكون حصل
  // Reset Device في المنتصف بين طلب الخيارات وتأكيد البصمة). ─────────────
  if (!assertDeviceBound(user, deviceId)) {
    return unauthorized(res, 'الجهاز لم يعد مرتبطاً بحسابك — سجّل دخول عادي أولاً');
  }

  const expectedChallenge = getChallengeCookie(req, REGISTER_CHALLENGE_COOKIE);
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
    clearChallengeCookie(res, REGISTER_CHALLENGE_COOKIE);
    return unauthorized(res, 'تعذّر التحقق من البصمة، حاول مرة أخرى');
  }

  clearChallengeCookie(res, REGISTER_CHALLENGE_COOKIE);

  if (!verification.verified || !verification.registrationInfo) {
    return unauthorized(res, 'تعذّر التحقق من البصمة');
  }

  const { credential } = verification.registrationInfo;

  // Upsert — لو فيه بصمة قديمة مسجّلة لنفس الجهاز، بتستبدلها بدل ما تضيف
  // نسخة تانية (فيه unique index على user+deviceId أصلاً).
  await Passkey.findOneAndUpdate(
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

  return success(res, {}, 'تم تفعيل الدخول بالبصمة على هذا الجهاز');
});

// ── POST /api/auth/passkey/login/options ────────────────────────────────────
// (مش محمي — ده بالظبط بديل صفحة الدخول، المستخدم لسه مش عارفين هو مين)
const loginOptions = asyncHandler(async (req, res) => {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'preferred',
    // مفيش allowCredentials — ده الـ "usernameless flow": المتصفح بيعرض
    // أي بصمة متخزنة عنده لهذا الموقع من غير ما نحدد مقدمًا مين المستخدم.
  });

  setChallengeCookie(res, LOGIN_CHALLENGE_COOKIE, options.challenge);

  return success(res, { options });
});

// ── POST /api/auth/passkey/login/verify ─────────────────────────────────────
const loginVerify = asyncHandler(async (req, res) => {
  const { response } = req.body;
  if (!response?.id) return error(res, 'بيانات ناقصة', 400);

  const expectedChallenge = getChallengeCookie(req, LOGIN_CHALLENGE_COOKIE);
  if (!expectedChallenge) {
    return unauthorized(res, 'انتهت صلاحية الطلب، حاول مرة أخرى');
  }

  const passkey = await Passkey.findOne({ credentialId: response.id });
  if (!passkey) {
    clearChallengeCookie(res, LOGIN_CHALLENGE_COOKIE);
    return unauthorized(res, 'هذه البصمة غير مسجّلة، سجّل دخول بالكود العادي');
  }

  const user = await User.findById(passkey.user).select('+refreshToken');
  if (!user || !user.isActive) {
    clearChallengeCookie(res, LOGIN_CHALLENGE_COOKIE);
    await Passkey.deleteOne({ _id: passkey._id });
    return unauthorized(res, 'الحساب غير موجود أو غير نشط');
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
    clearChallengeCookie(res, LOGIN_CHALLENGE_COOKIE);
    return unauthorized(res, 'تعذّر التحقق من البصمة، حاول مرة أخرى');
  }

  clearChallengeCookie(res, LOGIN_CHALLENGE_COOKIE);

  if (!verification.verified) {
    return unauthorized(res, 'تعذّر التحقق من البصمة');
  }

  // ── التحقق النهائي (طالب بس): الجهاز اللي سُجّلت عليه البصمة ده لازم
  // يكون لسه هو نفس الجهاز المربوط بالحساب دلوقتي. لو اتغيّر (Reset Device
  // أو ربط جهاز تاني) — نمسح البصمة القديمة دي فورًا ونرفض الدخول. ────────
  if (user.role === 'student' && user.deviceId !== passkey.deviceId) {
    await Passkey.deleteOne({ _id: passkey._id });
    return unauthorized(res, 'هذا الجهاز لم يعد مرتبطاً بحسابك، سجّل دخول بالكود العادي');
  }

  // تحديث العداد (منع إعادة استخدام/استنساخ الـ authenticator) وتاريخ آخر استخدام
  passkey.counter    = verification.authenticationInfo.newCounter;
  passkey.lastUsedAt = new Date();
  await passkey.save();

  // ── بالظبط نفس تسلسل auth.controller.js login() — نفس نظام التوكنز
  // والجلسة، مفيش نظام موازي. ──────────────────────────────────────────
  const { accessToken, refreshToken } = generateTokenPair(user);
  await user.setRefreshToken(refreshToken);
  await user.save({ validateBeforeSave: false });
  setRefreshCookie(res, refreshToken);

  return success(res, {
    accessToken,
    user: user.toSafeObject(),
  }, 'تم تسجيل الدخول بالبصمة بنجاح');
});

// ── GET /api/auth/passkey/status?deviceId=... ───────────────────────────────
// (محمي) — هل الجهاز الحالي عنده بصمة مفعّلة على هذا الحساب؟
const status = asyncHandler(async (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) return error(res, 'رقم الجهاز مطلوب', 400);

  const exists = await Passkey.exists({ user: req.user.userId, deviceId });
  return success(res, { enabled: !!exists });
});

// ── DELETE /api/auth/passkey/mine ───────────────────────────────────────────
// (محمي) — بيمسح بصمة الجهاز الحالي بس، مش كل أجهزة المستخدم.
const removeMine = asyncHandler(async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return error(res, 'رقم الجهاز مطلوب', 400);

  const result = await Passkey.deleteOne({ user: req.user.userId, deviceId });
  if (result.deletedCount === 0) {
    return notFound(res, 'لا توجد بصمة مفعّلة على هذا الجهاز');
  }

  return success(res, {}, 'تم إلغاء تفعيل الدخول بالبصمة على هذا الجهاز');
});

module.exports = {
  registerOptions, registerVerify,
  loginOptions,    loginVerify,
  status, removeMine,
};