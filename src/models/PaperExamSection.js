// src/models/PaperExamSection.js
// A named "قسم" (folder) that paper exams can belong to, so the teacher can
// organize them (e.g. "مسابقة 1", "شهر أكتوبر") instead of one long flat
// list. Scoped per academic year — the same section name can be reused
// independently across different years.

const mongoose = require('mongoose');

const paperExamSectionSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'اسم القسم مطلوب'],
      trim:      true,
      minlength: [1,  'اسم القسم مطلوب'],
      maxlength: [80, 'اسم القسم طويل جداً'],
    },

    academicYear: {
      type:     String,
      required: [true, 'السنة الدراسية مطلوبة'],
    },
  },
  { timestamps: true }
);

paperExamSectionSchema.index({ academicYear: 1, createdAt: 1 });

module.exports = mongoose.model('PaperExamSection', paperExamSectionSchema);
