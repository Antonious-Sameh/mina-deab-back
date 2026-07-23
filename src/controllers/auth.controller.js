// src/controllers/auth.controller.js

const User = require('../models/User');
const {
  generateTokenPair,
  setRefreshCookie,
  clearRefreshCookie,
  verifyRefreshToken,
} = require('../services/token.service');
const { success, unauthorized } = require('../utils/apiResponse');
const { asyncHandler }          = require('../middleware/error.middleware');

// بعض لوحات المفاتيح الافتراضية (خصوصًا على أجهزة زي الشاشات الذكية التفاعلية
// لما نظام التشغيل يكون بلغة عربية) بترسل أرقام عربية-هندية أو فارسية بدل
// الأرقام الإنجليزية العادية، رغم إن الرقم اللي المستخدم شايفه على الشاشة
// هو نفسه بالظبط. النص المُرسَل يبقى مختلف تمامًا (Unicode code points مختلفة)
// عن الكود المخزّن، فالمقارنة تفشل بشكل شرعي. بنحوّل أي أرقام من الشكلين دول
// لأرقام إنجليزية عادية قبل أي مقارنة — نفس القيمة الرقمية بالظبط، بس بترميز موحّد.
const ARABIC_INDIC_DIGITS  = '٠١٢٣٤٥٦٧٨٩'; // U+0660–U+0669
const PERSIAN_DIGITS       = '۰۱۲۳۴۵۶۷۸۹'; // U+06F0–U+06F9
function normalizeDigits(str) {
  return str.replace(/[٠-٩۰-۹]/g, (ch) => {
    const arabicIdx  = ARABIC_INDIC_DIGITS.indexOf(ch);
    if (arabicIdx !== -1) return String(arabicIdx);
    const persianIdx = PERSIAN_DIGITS.indexOf(ch);
    if (persianIdx !== -1) return String(persianIdx);
    return ch;
  });
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
const login = asyncHandler(async (req, res) => {
  const { code, deviceId } = req.body;

  if (!code || typeof code !== 'string' || code.trim().length < 4) {
    return unauthorized(res, 'الكود مطلوب ويجب أن يكون 4 أحرف على الأقل');
  }

  const enteredCode = normalizeDigits(code.trim()).toUpperCase();

  // Fast lookup by codePlain (indexed) — no need to scan all users
  const user = await User
    .findOne({ codePlain: enteredCode, isActive: true })
    .select('+codeHash +refreshToken');

  if (!user) {
    return unauthorized(res, 'الكود غير صحيح أو الحساب غير نشط');
  }

  // Verify against bcrypt hash
  const isMatch = await user.compareCode(enteredCode);
  if (!isMatch) {
    return unauthorized(res, 'الكود غير صحيح');
  }

  // ── Student single-device lock (teachers are never restricted) ────────────
  // First login ever for this student → binds the account to that device.
  // Any later login from a different device is rejected until the teacher
  // resets it (see resetDevice in student.controller.js). If the client
  // didn't send a deviceId at all (e.g. an older cached build), we don't
  // enforce the check for that request rather than blocking a legitimate login.
  if (user.role === 'student' && deviceId) {
    if (!user.deviceId) {
      user.deviceId = deviceId;
    } else if (user.deviceId !== deviceId) {
      return unauthorized(res, 'هذا الحساب مرتبط بجهاز آخر، برجاء التواصل مع المدرس');
    }
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokenPair(user);

  // Store hashed refresh token (also persists deviceId set above, same document/save)
  await user.setRefreshToken(refreshToken);
  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, refreshToken);

  return success(res, {
    accessToken,
    user: user.toSafeObject(),
  }, 'تم تسجيل الدخول بنجاح');
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    return unauthorized(res, 'لا توجد جلسة نشطة');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    return unauthorized(res, 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً');
  }

  const user = await User.findById(decoded.userId).select('+refreshToken +previousRefreshToken +refreshTokenRotatedAt');
  if (!user || !user.isActive) {
    return unauthorized(res, 'المستخدم غير موجود أو غير نشط');
  }

  const isValid = await user.compareRefreshToken(token);
  if (!isValid) {
    clearRefreshCookie(res);
    return unauthorized(res, 'تم اكتشاف استخدام مشبوه للجلسة');
  }

  // Token rotation
  const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(user);
  await user.setRefreshToken(newRefreshToken);
  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, newRefreshToken);

  return success(res, { accessToken }, 'تم تجديد الجلسة');
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (token) {
    try {
      const decoded = verifyRefreshToken(token);
      await User.findByIdAndUpdate(decoded.userId, { refreshToken: null });
    } catch {
      // Token invalid — clear cookie anyway
    }
  }

  clearRefreshCookie(res);
  return success(res, {}, 'تم تسجيل الخروج بنجاح');
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
const me = asyncHandler(async (req, res) => {
  const user = await User
    .findById(req.user.userId)
    .populate('group', 'name academicYear')
    .lean();

  if (!user) return unauthorized(res, 'المستخدم غير موجود');

  delete user.codeHash;
  delete user.refreshToken;
  delete user.__v;

  return success(res, { user });
});

module.exports = { login, refresh, logout, me };