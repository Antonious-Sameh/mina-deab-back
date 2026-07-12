// src/routes/session.schemas.js

const Joi = require('joi');

const OBJECT_ID = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({ 'string.pattern.base': 'المعرف غير صحيح' });

// ── Create a new session inside a month ────────────────────────────────────────
const createSessionSchema = Joi.object({
  monthId: OBJECT_ID.required().messages({ 'any.required': 'معرف الشهر مطلوب' }),
  name:    Joi.string().trim().min(1).max(50).required().messages({
    'any.required': 'اسم الحصة مطلوب',
    'string.empty': 'اسم الحصة مطلوب',
  }),
});

// ── Rename an existing session ────────────────────────────────────────────────
const updateSessionSchema = Joi.object({
  name: Joi.string().trim().min(1).max(50).required().messages({
    'any.required': 'اسم الحصة مطلوب',
    'string.empty': 'اسم الحصة مطلوب',
  }),
});

// ── Submit attendance for one or more students in a session ──────────────────
const submitAttendanceSchema = Joi.object({
  records: Joi.array()
    .items(
      Joi.object({
        studentId: OBJECT_ID.required().messages({ 'any.required': 'معرف الطالب مطلوب' }),
        status:    Joi.string().valid('present', 'absent').required().messages({
          'any.only':     'الحالة يجب أن تكون present أو absent',
          'any.required': 'حالة الحضور مطلوبة',
        }),
      })
    )
    .min(1)
    .required()
    .messages({
      'array.min':    'يجب إرسال سجل لطالب واحد على الأقل',
      'any.required': 'سجلات الحضور مطلوبة',
    }),
});

module.exports = { createSessionSchema, updateSessionSchema, submitAttendanceSchema };
