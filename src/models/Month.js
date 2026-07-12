// src/models/Month.js
// Represents a manageable "شهر" (billing period) that belongs to one Group.
// The teacher names it freely (e.g. "أكتوبر", "مراجعة", "شهر 1") and sets its
// price. Months are the parent of ClassSessions ("حصص") and are the anchor
// for Payment records for that group (see Payment.monthRef).

const mongoose = require('mongoose');

const monthSchema = new mongoose.Schema(
  {
    group: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Group',
      required: [true, 'المجموعة مطلوبة'],
    },

    name: {
      type:      String,
      required:  [true, 'اسم الشهر مطلوب'],
      trim:      true,
      minlength: [1,  'اسم الشهر مطلوب'],
      maxlength: [50, 'اسم الشهر طويل جداً'],
    },

    price: {
      type:     Number,
      required: [true, 'سعر الشهر مطلوب'],
      min:      [0, 'السعر لا يمكن أن يكون سالباً'],
    },
  },
  { timestamps: true }
);

monthSchema.index({ group: 1, createdAt: 1 });

module.exports = mongoose.model('Month', monthSchema);
