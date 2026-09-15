// src/routes/passkey.routes.js
// روابط "الدخول بالبصمة" (WebAuthn). تتحمل تحت /api/auth/passkey في app.js.
//
// ملحوظة مهمة عن الـ rate limiting: زي بالظبط الدرس المستفاد من loginLimiter
// في auth.routes.js — الـ limiter هنا مطبّق على كل route لوحده (مش على
// الراوتر كله)، عشان أي حركة خلفية عادية (زي فحص status) متأثرش على حد
// محاولات تسجيل الدخول الفعلية.

const express   = require('express');
const rateLimit = require('express-rate-limit');
const router    = express.Router();

const {
  registerOptions, registerVerify,
  loginOptions,    loginVerify,
  status, removeMine,
} = require('../controllers/passkey.controller');
const { protect }   = require('../middleware/auth.middleware');
const { validate }  = require('../middleware/validate.middleware');
const {
  registerOptionsSchema, registerVerifySchema,
  loginVerifySchema, removeMineSchema,
} = require('./passkey.schemas');

// محاولات دخول بالبصمة — نفس منطق loginLimiter تمامًا: بيعد المحاولات
// الفاشلة بس، عشان مستخدم بينجح في الدخول ميأثرش على العداد.
const passkeyLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { success: false, message: 'محاولات دخول كثيرة، حاول بعد 15 دقيقة' },
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,
});

// طلبات تفعيل البصمة (مستخدم داخل بالفعل) — حد أهدأ، مش محتاج حماية زي الدخول.
const passkeyRegisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      30,
  message:  { success: false, message: 'محاولات كثيرة، حاول بعد قليل' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── تفعيل البصمة (محمي — المستخدم لازم يكون داخل عادي الأول) ──────────────
router.post(
  '/register/options',
  protect, passkeyRegisterLimiter, validate(registerOptionsSchema),
  registerOptions
);
router.post(
  '/register/verify',
  protect, passkeyRegisterLimiter, validate(registerVerifySchema),
  registerVerify
);

// ── الدخول بالبصمة (مش محمي — ده بديل صفحة تسجيل الدخول) ──────────────────
router.post('/login/options', passkeyLoginLimiter, loginOptions);
router.post(
  '/login/verify',
  passkeyLoginLimiter, validate(loginVerifySchema),
  loginVerify
);

// ── حالة التفعيل + الإلغاء (محمي) ──────────────────────────────────────────
router.get('/status', protect, status);
router.delete('/mine', protect, validate(removeMineSchema), removeMine);

module.exports = router;