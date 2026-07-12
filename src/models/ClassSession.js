// src/models/ClassSession.js
// Represents a manageable "حصة" (class session) that belongs to one Month.
// The teacher names it freely (e.g. "حصة 1", "مراجعة", "امتحان"). Opening a
// session shows the attendance + payment table for its group's students.
//
// `date` is auto-set to the day the session was created and is kept in the
// same "YYYY-MM-DD" format used by the existing Attendance model — this is
// what lets attendance marked here flow into the same Attendance collection
// used by the student's history page and the teacher's reports, without any
// changes to that existing, working system.

const mongoose = require('mongoose');

const classSessionSchema = new mongoose.Schema(
  {
    month: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Month',
      required: [true, 'الشهر مطلوب'],
    },

    // Denormalized for fast queries (avoids populating month just to get group)
    group: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Group',
      required: [true, 'المجموعة مطلوبة'],
    },

    name: {
      type:      String,
      required:  [true, 'اسم الحصة مطلوب'],
      trim:      true,
      minlength: [1,  'اسم الحصة مطلوب'],
      maxlength: [50, 'اسم الحصة طويل جداً'],
    },

    date: {
      type:     String,
      required: [true, 'تاريخ الحصة مطلوب'],
      match:    [/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD'],
    },
  },
  { timestamps: true }
);

classSessionSchema.index({ month: 1, createdAt: 1 });
classSessionSchema.index({ group: 1, date: 1 });

module.exports = mongoose.model('ClassSession', classSessionSchema);
