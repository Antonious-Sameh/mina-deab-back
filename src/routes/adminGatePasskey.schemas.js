// src/routes/adminGatePasskey.schemas.js
// Joi validation schemas لروابط بصمة الصفحات المحمية — نفس نمط
// passkey.schemas.js بالظبط.

const Joi = require('joi');

const deviceIdField = Joi.string().min(4).max(200).required().messages({
  'any.required': 'رقم الجهاز مطلوب',
});

const registerOptionsSchema = Joi.object({
  deviceId: deviceIdField,
  password: Joi.string().min(1).required().messages({
    'any.required': 'كلمة مرور الصفحات المحمية مطلوبة',
  }),
});

const registerVerifySchema = Joi.object({
  deviceId: deviceIdField,
  response: Joi.object({ id: Joi.string().required() }).unknown(true).required(),
});

const unlockOptionsSchema = Joi.object({
  deviceId: deviceIdField,
});

const unlockVerifySchema = Joi.object({
  deviceId: deviceIdField,
  response: Joi.object({ id: Joi.string().required() }).unknown(true).required(),
});

const removeMineSchema = Joi.object({
  deviceId: deviceIdField,
});

module.exports = {
  registerOptionsSchema,
  registerVerifySchema,
  unlockOptionsSchema,
  unlockVerifySchema,
  removeMineSchema,
};
