// src/app.js
// Configures Express: middleware, routes, error handling.

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const { CLIENT_URL, NODE_ENV, COOKIE_SECRET } = require('./config/env');
const { errorHandler } = require('./middleware/error.middleware');
const { protect, isTeacher, isStudent } = require('./middleware/auth.middleware');

// ── Route imports ─────────────────────────────────────────────────────────────
const authRoutes        = require('./routes/auth.routes');
const studentRoutes     = require('./routes/student.routes');
const groupRoutes       = require('./routes/group.routes');
const attendanceRoutes  = require('./routes/attendance.routes');
const paymentRoutes     = require('./routes/payment.routes');
const monthRoutes       = require('./routes/month.routes');
const sessionRoutes     = require('./routes/session.routes');
const examRoutes        = require('./routes/exam.routes');
const paperExamSectionRoutes = require('./routes/paperExamSection.routes');
const gradeRoutes       = require('./routes/grade.routes');
const pointRoutes       = require('./routes/point.routes');
const noteRoutes        = require('./routes/note.routes');
const lessonRoutes      = require('./routes/lesson.routes');
const heroRoutes    = require('./routes/hero.routes');
require('./models/HeroAlbum'); // register HeroAlbum model
const studentSelfRoutes = require('./routes/studentSelf.routes');
const accountRoutes     = require('./routes/account.routes');
const fileRoutes        = require('./routes/file.routes');
const compression = require('compression');

const app = express();

// Vercel (and any reverse proxy) sits in front of this app — without this,
// Express doesn't know the connection is already terminated/proxied, which
// affects req.ip, req.secure, and secure-cookie detection, and triggers
// express-rate-limit's X-Forwarded-For validation warning on every request.
app.set('trust proxy', 1);

// ═══ TEMP DEBUG — Horion smart board login investigation — remove after diagnosis ═══
app.use((req, res, next) => {
  console.log('[HORION_DEBUG][first-middleware]', JSON.stringify({
    time:   new Date().toISOString(),
    method: req.method,
    url:    req.originalUrl,
    origin: req.headers['origin'] || null,
  }));
  next();
});
// ═══════════════════════════════════════════════════════════════════════════════════

app.use(compression());

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
// CLIENT_URL may have a trailing slash or different casing than what the
// browser actually sends in the Origin header (Origin never has a trailing
// slash or path). A plain string passed as `origin` to the `cors` package
// is echoed back in Access-Control-Allow-Origin UNCONDITIONALLY, regardless
// of whether it matches the real Origin — the browser then rejects the
// mismatch itself and never sends the actual request, which looks exactly
// like "OPTIONS succeeds, POST never arrives". Using a validator function
// with normalized comparison (and logging what we actually receive) fixes
// that class of mismatch and gives us visibility into the real value.
const normalizeOrigin = (o) => (o || '').trim().toLowerCase().replace(/\/+$/, '');
const allowedOrigin = normalizeOrigin(CLIENT_URL);

app.use(cors({
  origin: (requestOrigin, callback) => {
    // ═══ TEMP DEBUG ═══
    console.log('[HORION_DEBUG][cors]', JSON.stringify({
      requestOrigin: requestOrigin || null,
      allowedOrigin: CLIENT_URL,
      normalizedMatch: requestOrigin ? normalizeOrigin(requestOrigin) === allowedOrigin : 'no-origin-header',
    }));
    // ═══════════════════

    // No Origin header at all (server-to-server calls, curl, some native
    // webviews) — not a browser CORS request, allow it through.
    if (!requestOrigin) return callback(null, true);

    if (normalizeOrigin(requestOrigin) === allowedOrigin) {
      return callback(null, true);
    }

    console.log('[HORION_DEBUG][cors] REJECTED — origin did not match', JSON.stringify({ requestOrigin, allowedOrigin: CLIENT_URL }));
    return callback(new Error('Not allowed by CORS'));
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             300,
  message:         { success: false, message: 'طلبات كثيرة جداً، حاول مرة أخرى بعد قليل' },
  standardHeaders: true,
  legacyHeaders:   false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { success: false, message: 'محاولات تسجيل دخول كثيرة، حاول بعد 15 دقيقة' },
});

app.use(globalLimiter);

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(COOKIE_SECRET));

// ── Request logging ───────────────────────────────────────────────────────────
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Khatwa Plus API is running ✅',
    env:     NODE_ENV,
    version: '1.0.0',
    time:    new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────

// Auth (rate-limited separately)
app.use('/api/auth', authLimiter, authRoutes);

// Teacher-only routes (protect + isTeacher applied per-router or per-route)
app.use('/api/students',   protect, isTeacher, studentRoutes);
app.use('/api/groups',     protect, isTeacher, groupRoutes);

// "الحضور والفلوس" الجديدة — الشهور والحصص القابلة للإدارة داخل كل مجموعة
app.use('/api/months',     protect, isTeacher, monthRoutes);
app.use('/api/sessions',   protect, isTeacher, sessionRoutes);

// الروتس المشتركة والمحمية بـ protect المرتبة والمدعومة بالتحديثات الجديدة
app.use('/api/attendance', protect, attendanceRoutes);  // مختلط: المدرس يكتب، والطالب يقرأ
app.use('/api/payments',   protect, paymentRoutes);     // الـ isTeacher مطبق داخلياً لكل route
app.use('/api/exams',      protect, examRoutes);        // مختلط: امتحانات، تسليم، ونتائج أوراق الإجابة
app.use('/api/paper-exam-sections', protect, isTeacher, paperExamSectionRoutes); // أقسام الامتحانات الورقية
app.use('/api/grades',     protect, gradeRoutes);       // درجات الطلاب والتقييمات
app.use('/api/points',     protect, pointRoutes);       // نقاط ومكافآت الطلاب
app.use('/api/notes',      protect, noteRoutes);        // ملاحظات وإشعارات المقروء وغير المقروء
app.use('/api/lessons',    protect, lessonRoutes);      // الدروس، الـ Stream والـ Heartbeat الجديد لحساب وقت المشاهدة
// وسيط لتحميل ملفات PDF/الصور من Cloudinary عن طريق السيرفر نفسه (يحل مشكلة
// فتح ملفات الـ PDF اللي كانت بتفشل بسبب الـ CORS عند الجلب المباشر من المتصفح)
app.use('/api/files',      protect, fileRoutes);

// لوحة الشرف (الـ GET للعامة، والتعديل محمي جوة الـ router نفسه)
app.use('/api/heroes',     heroRoutes);

// البروفايل والحساب الشخصي (محروس داخلياً بـ protect جوة ملف الـ routes بتاعه)
app.use('/api/account',    accountRoutes);

// لوحة تحكم الطالب الخاصة (مؤمنة بالكامل للطالب فقط)
app.use('/api/student',    protect, isStudent, studentSelfRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `المسار ${req.originalUrl} غير موجود`,
  });
});

// ── Global error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

module.exports = app;