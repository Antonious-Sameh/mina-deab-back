// src/routes/auth.routes.js

const express   = require('express');
const rateLimit = require('express-rate-limit');
const router    = express.Router();

const { login, refresh, logout, me } = require('../controllers/auth.controller');
const { protect }                    = require('../middleware/auth.middleware');
const { validate }                   = require('../middleware/validate.middleware');
const { loginSchema }                = require('./auth.schemas');

// ── Login-attempts limiter ────────────────────────────────────────────────
// BUGFIX: this used to be applied to the ENTIRE /api/auth router in app.js —
// including /refresh, which fires automatically in the background for every
// open tab/device to keep the session alive, and /me, checked on every page
// load. express-rate-limit counts by IP by default, so many students on the
// same school/center Wi-Fi shared that one counter — background traffic
// alone (not actual login attempts) could exhaust it, showing "محاولات
// تسجيل دخول كثيرة" to students who never mistyped a password.
// Now: applied ONLY to the real /login route, and only failed attempts
// count (skipSuccessfulRequests) — a student who logs in correctly never
// contributes to the counter, no matter how many other students share
// their network.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { success: false, message: 'محاولات تسجيل دخول كثيرة، حاول بعد 15 دقيقة' },
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,
});

// POST /api/auth/login
router.post('/login', loginLimiter, validate(loginSchema), login);

// POST /api/auth/refresh  (uses httpOnly cookie — no body needed)
router.post('/refresh', refresh);

// POST /api/auth/logout
router.post('/logout', logout);

// GET  /api/auth/me  (protected)
router.get('/me', protect, me);

module.exports = router;