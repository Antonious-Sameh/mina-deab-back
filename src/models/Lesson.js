// src/models/Lesson.js — Extended: lesson is now a content container (items[])
// Backward-compatible: legacy videoUrl/fileUrl fields still work

const mongoose = require('mongoose');
const ACADEMIC_YEARS = ['first-prep','second-prep','third-prep','first-sec','second-sec','third-sec'];

// ── Content item sub-schema ───────────────────────────────────────────────────
const contentItemSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['video','image','pdf','article'],
    required: true,
  },
  order:    { type: Number, default: 0 },
  // video
  videoUrl: { type: String, default: null, trim: true },
  duration: { type: String, default: null },
  // image
  imageUrl:    { type: String, default: null },
  imageCaption:{ type: String, default: null, maxlength: 300 },
  // pdf
  pdfUrl:   { type: String, default: null },
  pdfName:  { type: String, default: null },
  // article
  title:    { type: String, default: null, trim: true, maxlength: 200 },
  body:     { type: String, default: null, maxlength: 10000 },
}, { _id: true, timestamps: true });

const lessonSchema = new mongoose.Schema({
  title:        { type: String, required: [true,'عنوان الدرس مطلوب'], trim: true, minlength: 2, maxlength: 200 },
  academicYear: { type: String, enum: { values: ACADEMIC_YEARS, message: 'السنة الدراسية غير صحيحة' }, required: true },
  description:  { type: String, default: null, trim: true, maxlength: 500 },
  // ── NEW: shown on the student's video poster/card ──────────────────────────
  branch:       { type: String, default: null, trim: true, maxlength: 150 },
  unit:         { type: String, default: null, trim: true, maxlength: 150 },
  order:        { type: Number, default: 0 },
  published:    { type: Boolean, default: false },

  // ── NEW: which kind of student this lesson is for ─────────────────────────
  // 'online', 'center', or 'all' (كل الطلاب — Online و Center مع بعض).
  // Lessons created BEFORE this field existed have no value stored (null) —
  // those must always be treated as visible to BOTH student types, exactly
  // like 'all', so existing data keeps working exactly as before this
  // feature was added (see getMyLessons in studentSelf.controller.js and
  // getStreamInfo/heartbeat/markWatched in lesson.controller.js, which all
  // read this the same way: `!lesson.audienceType || lesson.audienceType === 'all' || lesson.audienceType === student.studentType`).
  audienceType: { type: String, enum: { values: ['online','center','all'], message: 'نوع الطالب غير صحيح' }, default: null },

  // ── Content items (new multi-content system) ──────────────────────────────
  items: [contentItemSchema],

  // ── Legacy fields (kept for backward compat + video tracking) ────────────
  type:     { type: String, enum: ['video','file'], default: 'video' },
  videoUrl: { type: String, default: null, trim: true },
  duration: { type: String, default: null },
  thumbnailUrl: { type: String, default: null },
  fileUrl:  { type: String, default: null },
  fileType: { type: String, default: null },
  fileSize: { type: String, default: null },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

lessonSchema.index({ academicYear: 1, order: 1 });
lessonSchema.index({ academicYear: 1, published: 1 });
lessonSchema.index({ academicYear: 1, audienceType: 1, published: 1 });

module.exports = mongoose.model('Lesson', lessonSchema);