// src/config/multer.js
// Multer configuration using cloudinary v2 directly — no multer-storage-cloudinary.
// Uses custom CloudinaryStorageEngine that streams files to Cloudinary in memory.

const multer                               = require('multer');
const { CloudinaryStorageEngine, cloudinary } = require('./cloudinaryStorage');

// ── Avatar / Profile photo ────────────────────────────────────────────────────
const uploadAvatar = multer({
  storage: new CloudinaryStorageEngine({
    params: {
      folder:          'khatwa-plus/avatars',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      resource_type:   'image',
      transformation:  [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('الملف يجب أن يكون صورة (JPG, PNG, WEBP)'));
  },
});

// ── PDF documents ─────────────────────────────────────────────────────────────
// BUGFIX: was resource_type:'auto'. Cloudinary's 'auto' detection is not
// guaranteed to be consistent for every PDF (it can occasionally land the
// file under the 'raw' resource type, which has stricter/inconsistent public
// delivery rules and can make the file fail to open). Forcing resource_type
// to 'image' is Cloudinary's documented, deterministic way to store PDFs so
// they always get a stable, publicly-servable /image/upload/ URL that our
// pdf.js-based PDFViewer (and any browser) can open reliably.
const uploadPDF = multer({
  storage: new CloudinaryStorageEngine({
    params: {
      folder:        'khatwa-plus/pdfs',
      resource_type: 'image',
      access_mode:   'public',
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB (Vercel Free limit)
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('الملف يجب أن يكون PDF'));
  },
});

// ── Hero / achievement photos ─────────────────────────────────────────────────
const uploadHero = multer({
  storage: new CloudinaryStorageEngine({
    params: {
      folder:          'khatwa-plus/heroes',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      resource_type:   'image',
      transformation:  [{ width: 600, height: 600, crop: 'fill' }],
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('الملف يجب أن يكون صورة'));
  },
});

// ── Exam answer sheet (PDF or image) ─────────────────────────────────────────
const uploadAnswerSheet = multer({
  storage: new CloudinaryStorageEngine({
    // BUGFIX: force resource_type deterministically instead of 'auto' — see
    // note on uploadPDF above. Images stay 'image'; PDFs are stored as
    // 'image' too (Cloudinary's supported way to preview PDFs reliably).
    params: () => ({
      folder:        'khatwa-plus/answer-sheets',
      resource_type: 'image',
      access_mode:   'public', // ensure public CORS-accessible URL
    }),
  }),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('الملف يجب أن يكون PDF أو صورة'));
  },
});

// ── Note PDF attachment ────────────────────────────────────────────────────────
// Same proven pattern as uploadLessonFile (resource_type:'auto' + access_mode:
// 'public' → Cloudinary serves it with CORS headers so it can be opened inline
// in a viewer instead of forcing a download).
const uploadNotePDF = multer({
  storage: new CloudinaryStorageEngine({
    params: {
      folder:        'khatwa-plus/note-pdfs',
      resource_type: 'image',   // BUGFIX: deterministic instead of 'auto' — see uploadPDF note above
      access_mode:   'public',
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB (Vercel Free limit)
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('الملف يجب أن يكون PDF'));
  },
});

// ── Lesson content files (images + PDF) ──────────────────────────────────────
const uploadLessonFile = multer({
  storage: new CloudinaryStorageEngine({
    params: (req, file) => {
      const isPdf = file.mimetype === 'application/pdf';
      return {
        folder:        isPdf ? 'khatwa-plus/lesson-pdfs' : 'khatwa-plus/lesson-images',
        resource_type: 'image',   // BUGFIX: deterministic instead of 'auto' — see uploadPDF note above
        access_mode:   'public',
      };
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf','image/jpeg','image/jpg','image/png','image/webp','image/gif'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('الملف يجب أن يكون صورة أو PDF'));
  },
});

module.exports = {
  cloudinary,
  uploadAvatar,
  uploadPDF,
  uploadHero,
  uploadAnswerSheet,
  uploadLessonFile, // ضفنا المحرك الجديد هنا
  uploadNotePDF,
};