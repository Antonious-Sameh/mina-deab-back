// src/routes/adminGatePasskey.routes.js
// روابط "بصمة الصفحات المحمية" — بتتحمل تحت /api/admin-gate-passkey في
// app.js. مستقلة تمامًا عن /api/auth/passkey (بصمة تسجيل الدخول)، ومستقلة
// عن /api/account/verify-admin-password (كلمة المرور نفسها لسه شغالة زي ما
// هي بدون أي تغيير).

const express   = require('express');
const rateLimit = require('express-rate-limit');
const router    = express.Router();

const {
  registerOptions, registerVerify,
  unlockOptions,   unlockVerify,
  status, removeMine,
} = require('../controllers/adminGatePasskey.controller');
const { protect }   = require('../middleware/auth.middleware');
const { validate }  = require('../middleware/validate.middleware');
const {
  registerOptionsSchema, registerVerifySchema,
  unlockOptionsSchema,   unlockVerifySchema,
  removeMineSchema,
} = require('./adminGatePasskey.schemas');

// كل الروابط هنا محتاجة تسجيل دخول عادي الأول (المستخدم داخل فعلاً بحسابه)
router.use(protect);

// محاولات فتح الصفحات بالبصمة — نفس فكرة passkeyLoginLimiter، بيعد
// المحاولات الفاشلة بس.
const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      30,
  message:  { success: false, message: 'محاولات كثيرة، حاول بعد قليل' },
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { success: false, message: 'محاولات كثيرة، حاول بعد قليل' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── تسجيل بصمة جديدة على الجهاز الحالي (محتاج كلمة المرور الصح أولاً) ──────
router.post('/register/options', registerLimiter, validate(registerOptionsSchema), registerOptions);
router.post('/register/verify',  registerLimiter, validate(registerVerifySchema),  registerVerify);

// ── فتح صفحة محمية بالبصمة (بديل كتابة كلمة المرور) ─────────────────────────
router.post('/unlock/options', unlockLimiter, validate(unlockOptionsSchema), unlockOptions);
router.post('/unlock/verify',  unlockLimiter, validate(unlockVerifySchema),  unlockVerify);

// ── حالة التفعيل على الجهاز الحالي + الإلغاء ────────────────────────────────
router.get('/status', status);
router.delete('/mine', validate(removeMineSchema), removeMine);

module.exports = router;