// src/models/User.js
// Single collection for both teacher and student.
// Discriminated by the `role` field.
//
// Auth design:
//   - codeHash: bcrypt hash of the plain code (for secure login comparison)
//   - codeLookup: plain code stored for fast DB lookup (we query by this, then verify hash)
//   This avoids scanning ALL users on every login request.

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const ACADEMIC_YEARS = [
  'first-prep', 'second-prep', 'third-prep', 'first-sec', 'second-sec', 'third-sec',
];

const userSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'الاسم مطلوب'],
      trim:      true,
      minlength: [2,   'الاسم يجب أن يكون حرفين على الأقل'],
      maxlength: [100, 'الاسم طويل جداً'],
    },

    // Stores the plain code in UPPERCASE for fast lookup.
    // NEVER used for password comparison — only for finding the user.
    codePlain: {
      type:     String,
      required: [true, 'كود الدخول مطلوب'],
      unique:   true,
      trim:     true,
      uppercase: true,   // safe here — this is the plain index field
    },

    // Stores the bcrypt hash of the code.
    // NEVER uppercased — bcrypt hashes must stay as-is.
    codeHash: {
      type:   String,
      select: false,  // not returned in queries by default
    },

    role: {
      type:     String,
      enum:     ['teacher', 'student'],
      required: [true, 'نوع المستخدم مطلوب'],
    },

    phone: {
      type:    String,
      trim:    true,
      default: null,
    },

    avatar: {
      type:    String,
      default: null,
    },

    isActive: {
      type:    Boolean,
      default: true,
    },

    // ── Student-only ──────────────────────────────────────────────────────────
    academicYear: {
      type:    String,
      enum:    ACADEMIC_YEARS,
      default: null,
    },

    group: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Group',
      default: null,
    },

    // Stable, permanent numeric ID shown to the teacher — unique within the
    // student's own academic year only (may repeat across different years).
    // Auto-generated once on creation and never changes afterwards.
    studentId: {
      type:    Number,
      default: null,
    },

    parentPhone: {
      type:    String,
      trim:    true,
      default: null,
    },

    // Locks a STUDENT account to a single device/browser (see auth.controller.js
    // login()). Never enforced for teachers. null = no device registered yet
    // (next login binds it); reset to null by the teacher via resetDevice.
    deviceId: {
      type:    String,
      default: null,
    },

    // ── Teacher-only ──────────────────────────────────────────────────────────
    subjects: {
      type:    [String],
      default: [],
    },

    // ── Auth ──────────────────────────────────────────────────────────────────
    refreshToken: {
      type:    String,
      default: null,
      select:  false,
    },

    // Previous refresh token hash + when it was rotated out — kept briefly so
    // a duplicate/near-simultaneous refresh request using the just-replaced
    // token (e.g. two requests racing right at rotation time, very common on
    // mobile browsers where background tabs throttle timers and then fire a
    // burst of delayed calls) doesn't get treated as session theft and force
    // a false-positive logout. See compareRefreshToken() below.
    previousRefreshToken: {
      type:    String,
      default: null,
      select:  false,
    },
    refreshTokenRotatedAt: {
      type:    Date,
      default: null,
      select:  false,
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
userSchema.index({ role: 1, academicYear: 1 });
userSchema.index({ group: 1 });
// codePlain already has unique: true → automatic index

// studentId must be unique within its academic year, but many documents
// (teachers, or students not yet backfilled) have studentId === null —
// a partial index only enforces uniqueness where studentId is an actual
// number, so those null documents never collide with each other.
userSchema.index(
  { academicYear: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { studentId: { $type: 'number' } } }
);

// ── Virtual: academic year label ──────────────────────────────────────────────
const YEAR_LABELS = {
  'first-prep':  'الصف الأول الإعدادي',
  'second-prep': 'الصف الثاني الإعدادي',
  'third-prep':  'الصف الثالث الإعدادي',
  'first-sec':   'الصف الأول الثانوي',
  'second-sec':  'الصف الثاني الثانوي',
  'third-sec':   'الصف الثالث الثانوي',
};

userSchema.virtual('academicYearLabel').get(function () {
  return YEAR_LABELS[this.academicYear] || null;
});

// ── Pre-save: hash the code into codeHash ─────────────────────────────────────
// codePlain is set by the caller (plain text).
// We derive codeHash from it automatically.
userSchema.pre('save', async function (next) {
  // Only re-hash if the plain code changed
  if (!this.isModified('codePlain')) return next();

  const salt    = await bcrypt.genSalt(10);
  this.codeHash = await bcrypt.hash(this.codePlain.toUpperCase(), salt);
  next();
});

// ── Instance method: compare entered code with stored hash ────────────────────
userSchema.methods.compareCode = async function (enteredCode) {
  if (!this.codeHash) return false;
  return bcrypt.compare(enteredCode.trim().toUpperCase(), this.codeHash);
};

// ── Instance method: hash & store refresh token ───────────────────────────────
userSchema.methods.setRefreshToken = async function (token) {
  const salt = await bcrypt.genSalt(10);
  // Keep the token being replaced around briefly (grace window), instead of
  // discarding it immediately — see compareRefreshToken().
  this.previousRefreshToken  = this.refreshToken || null;
  this.refreshTokenRotatedAt = new Date();
  this.refreshToken = await bcrypt.hash(token, salt);
};

// Grace window during which a just-rotated-out refresh token is still
// accepted — covers legitimate duplicate/racing refresh requests (e.g. a
// proactive refresh and a reactive 401-triggered refresh firing close
// together, or a mobile browser's throttled background timer delivering a
// burst of delayed calls). A genuinely stale/stolen token presented after
// this window still gets correctly rejected.
const REFRESH_GRACE_MS = 15 * 1000;

userSchema.methods.compareRefreshToken = async function (token) {
  if (this.refreshToken && await bcrypt.compare(token, this.refreshToken)) {
    return true;
  }
  if (
    this.previousRefreshToken &&
    this.refreshTokenRotatedAt &&
    (Date.now() - this.refreshTokenRotatedAt.getTime()) < REFRESH_GRACE_MS &&
    await bcrypt.compare(token, this.previousRefreshToken)
  ) {
    return true;
  }
  return false;
};

// ── Hide sensitive fields from JSON output ────────────────────────────────────
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.codeHash;
  delete obj.refreshToken;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);