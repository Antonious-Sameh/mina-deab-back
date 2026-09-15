// src/services/passkey.service.js
// إعدادات WebAuthn المشتركة + إدارة كوكي الـ "challenge" المؤقت.
//
// rpID و origin لازم يتطابقوا مع الدومين الفعلي اللي الموقع شغال عليه —
// بنشتقهم من CLIENT_URL نفسه (نفس المتغيّر المستخدم أصلًا في إعداد CORS في
// app.js)، عشان نضمن إنهم دايمًا متطابقين مع بعض من غير ما نكرر القيمة.

const { CLIENT_URL, COOKIE_SECRET, NODE_ENV } = require('../config/env');

const clientUrl = new URL(CLIENT_URL);

// rpID = اسم الدومين بس (من غير بروتوكول أو بورت) — ده المطلوب في بروتوكول
// WebAuthn نفسه. لازم يكون نفس الدومين (أو دومين أب) بتاع الموقع اللي شغال
// عليه الفرونت إند فعليًا.
const RP_ID   = clientUrl.hostname;
const RP_NAME = 'خطوة بلس';
// origin المتوقّع من المتصفح وقت الـ verify — لازم يطابق حرفيًا (بروتوكول +
// دومين + بورت) اللي المتصفح بعتّه فعلًا.
const ORIGIN  = clientUrl.origin;

const isProd = NODE_ENV === 'production';

// ── كوكي الـ Challenge المؤقت ──────────────────────────────────────────────
// كل طلب (تفعيل أو دخول) بيولّد challenge عشوائي من مكتبة simplewebauthn،
// وبنخزّنه في كوكي موقّعة (signed) قصيرة العمر بدل الجلسة أو الداتابيز —
// خفيف، ومفيش داعي نخزنه بشكل دائم لأنه بيتستخدم مرة واحدة بس ثم يتشال.
const CHALLENGE_COOKIE_MAX_AGE_MS = 5 * 60 * 1000; // 5 دقايق

const cookieOptions = () => ({
  httpOnly: true,
  signed:   true,
  secure:   isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge:   CHALLENGE_COOKIE_MAX_AGE_MS,
});

/**
 * setChallengeCookie — بيخزّن الـ challenge في كوكي موقّعة باسم مميّز
 * (عشان نفرّق بين challenge التفعيل وchallenge الدخول لو الاتنين حصلوا
 * في نفس الوقت من نفس المتصفح).
 */
const setChallengeCookie = (res, cookieName, challenge) => {
  res.cookie(cookieName, challenge, cookieOptions());
};

/**
 * getChallengeCookie — بيرجّع الـ challenge المخزّن، أو null لو مش موجود
 * أو منتهي الصلاحية (الكوكي نفسها بتنتهي بعد 5 دقايق تلقائيًا).
 */
const getChallengeCookie = (req, cookieName) => {
  return req.signedCookies?.[cookieName] || null;
};

/**
 * clearChallengeCookie — بيمسح الكوكي بعد ما تُستخدم مرة (نجاح أو فشل)،
 * عشان محدّش يقدر يعيد استخدام نفس الـ challenge مرتين.
 */
const clearChallengeCookie = (res, cookieName) => {
  res.clearCookie(cookieName, cookieOptions());
};

const REGISTER_CHALLENGE_COOKIE = 'passkeyRegChallenge';
const LOGIN_CHALLENGE_COOKIE    = 'passkeyLoginChallenge';

module.exports = {
  RP_ID,
  RP_NAME,
  ORIGIN,
  REGISTER_CHALLENGE_COOKIE,
  LOGIN_CHALLENGE_COOKIE,
  setChallengeCookie,
  getChallengeCookie,
  clearChallengeCookie,
};