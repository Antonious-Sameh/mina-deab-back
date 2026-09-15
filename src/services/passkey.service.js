// src/services/passkey.service.js
// إعدادات WebAuthn المشتركة + إدارة كوكي الـ "challenge" المؤقت.
//
// rpID و origin لازم يتطابقوا مع الدومين الفعلي اللي الموقع شغال عليه —
// بنشتقهم من CLIENT_URL نفسه (نفس المتغيّر المستخدم أصلًا في إعداد CORS في
// app.js)، عشان نضمن إنهم دايمًا متطابقين مع بعض من غير ما نكرر القيمة.

const crypto = require("crypto");
const { CLIENT_URL, COOKIE_SECRET, NODE_ENV } = require("../config/env");

const clientUrl = new URL(CLIENT_URL);

// rpID = اسم الدومين بس (من غير بروتوكول أو بورت) — ده المطلوب في بروتوكول
// WebAuthn نفسه. لازم يكون نفس الدومين (أو دومين أب) بتاع الموقع اللي شغال
// عليه الفرونت إند فعليًا.
const RP_ID = clientUrl.hostname;
const RP_NAME = "خطوة بلس";
// origin المتوقّع من المتصفح وقت الـ verify — لازم يطابق حرفيًا (بروتوكول +
// دومين + بورت) اللي المتصفح بعتّه فعلًا.
const ORIGIN = clientUrl.origin;

const isProd = NODE_ENV === "production";

// ── كوكي الـ Challenge المؤقت ──────────────────────────────────────────────
// كل طلب (تفعيل أو دخول) بيولّد challenge عشوائي من مكتبة simplewebauthn،
// وبنخزّنه في كوكي قصيرة العمر بدل الجلسة أو الداتابيز — خفيف، ومفيش داعي
// نخزنه بشكل دائم لأنه بيتستخدم مرة واحدة بس ثم يتشال.
//
// BUGFIX: كنا بنستخدم خاصية `signed: true` المدمجة في Express (اللي
// بتعتمد على `cookieParser(secret)` وبتحط قيمة في `req.secret`). المشكلة
// إن الخاصية دي بترمي خطأ صريح ("cookieParser(\"secret\") required for
// signed cookies") **حتى لو `COOKIE_SECRET` عندنا مضبوط تمام في env.js
// وشغّال في كل اختبار محلي** — تأكيدًا إن السبب مش في القيمة نفسها، لكن في
// إزاي بيئة التشغيل الفعلية (Vercel Serverless) بتمرر/بتربط الـ middleware
// بالـ request لكل استدعاء؛ تتبع السبب الدقيق ده مش هيّن ومش ضروري.
// الحل الأنضف: بدل ما نعتمد على آلية التوقيع المدمجة في Express (اللي
// عندها الشرط الصارم ده)، بنوقّع الـ challenge بنفسنا يدويًا بـ HMAC-SHA256
// باستخدام COOKIE_SECRET مباشرة — مستقل تمامًا عن `cookieParser(secret)`
// وعن أي شرط داخلي في Express، فمستحيل يحصل الخطأ ده تاني من المسار ده.
const CHALLENGE_COOKIE_MAX_AGE_MS = 5 * 60 * 1000; // 5 دقايق

const cookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  maxAge: CHALLENGE_COOKIE_MAX_AGE_MS,
});

// توقيع يدوي: القيمة المخزّنة فعليًا في الكوكي = "<challenge>.<hmac>"
function sign(value) {
  const hmac = crypto
    .createHmac("sha256", COOKIE_SECRET)
    .update(value)
    .digest("hex");
  return `${value}.${hmac}`;
}

// التحقق: بنعيد حساب الـ HMAC ونقارنه بطريقة آمنة (constant-time) عشان
// نتجنب أي هجوم توقيت (timing attack).
function verify(signedValue) {
  if (!signedValue || typeof signedValue !== "string") return null;
  const idx = signedValue.lastIndexOf(".");
  if (idx === -1) return null;

  const value = signedValue.slice(0, idx);
  const providedHmac = signedValue.slice(idx + 1);
  const expectedHmac = crypto
    .createHmac("sha256", COOKIE_SECRET)
    .update(value)
    .digest("hex");

  const a = Buffer.from(providedHmac, "hex");
  const b = Buffer.from(expectedHmac, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  return value;
}

/**
 * setChallengeCookie — بيخزّن الـ challenge (موقّع يدويًا) في كوكي باسم
 * مميّز (عشان نفرّق بين challenge التفعيل وchallenge الدخول لو الاتنين
 * حصلوا في نفس الوقت من نفس المتصفح).
 */
const setChallengeCookie = (res, cookieName, challenge) => {
  res.cookie(cookieName, sign(challenge), cookieOptions());
};

/**
 * getChallengeCookie — بيرجّع الـ challenge المخزّن بعد التحقق من التوقيع،
 * أو null لو مش موجود، أو منتهي الصلاحية، أو التوقيع غير صحيح (تلاعب).
 */
const getChallengeCookie = (req, cookieName) => {
  return verify(req.cookies?.[cookieName]);
};

/**
 * clearChallengeCookie — بيمسح الكوكي بعد ما تُستخدم مرة (نجاح أو فشل)،
 * عشان محدّش يقدر يعيد استخدام نفس الـ challenge مرتين.
 */
const clearChallengeCookie = (res, cookieName) => {
  const { maxAge, ...opts } = cookieOptions(); // maxAge مش مطلوبة عند المسح
  res.clearCookie(cookieName, opts);
};

const REGISTER_CHALLENGE_COOKIE = "passkeyRegChallenge";
const LOGIN_CHALLENGE_COOKIE = "passkeyLoginChallenge";

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
