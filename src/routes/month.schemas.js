// src/routes/month.schemas.js

const Joi = require('joi');

const OBJECT_ID = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({ 'string.pattern.base': 'المعرف غير صحيح' });

// ── Create a new month for a group ─────────────────────────────────────────────
const createMonthSchema = Joi.object({
  groupId: OBJECT_ID.required().messages({ 'any.required': 'معرف المجموعة مطلوب' }),
  name:    Joi.string().trim().min(1).max(50).required().messages({
    'any.required':   'اسم الشهر مطلوب',
    'string.empty':   'اسم الشهر مطلوب',
  }),
  price:   Joi.number().min(0).required().messages({
    'any.required': 'سعر الشهر مطلوب',
    'number.min':   'السعر لا يمكن أن يكون سالباً',
  }),
});

// ── Edit an existing month's name/price ────────────────────────────────────────
const updateMonthSchema = Joi.object({
  name:  Joi.string().trim().min(1).max(50),
  price: Joi.number().min(0),
}).min(1).messages({ 'object.min': 'يجب إرسال حقل واحد على الأقل للتعديل' });

module.exports = { createMonthSchema, updateMonthSchema };
