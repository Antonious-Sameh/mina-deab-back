// src/routes/passkey.schemas.js
// Joi validation schemas لروابط الـ Passkey.
// استجابات WebAuthn نفسها (response) كائن متداخل شكله معرّف من بروتوكول
// WebAuthn نفسه (مكتبة @simplewebauthn/browser هي اللي بتبنيه) — بنتحقق
// بس إنه object موجود وفيه id، والتحقق الحقيقي من صحته بيحصل في
// verifyRegistrationResponse/verifyAuthenticationResponse في الكنترولر.

const Joi = require('joi');

const deviceIdField = Joi.string().min(4).max(200).required().messages({
  'any.required': 'رقم الجهاز مطلوب',
});

const registerOptionsSchema = Joi.object({
  deviceId: deviceIdField,
});

const registerVerifySchema = Joi.object({
  deviceId: deviceIdField,
  response: Joi.object({ id: Joi.string().required() }).unknown(true).required(),
});

const loginVerifySchema = Joi.object({
  response: Joi.object({ id: Joi.string().required() }).unknown(true).required(),
});

const removeMineSchema = Joi.object({
  deviceId: deviceIdField,
});

module.exports = {
  registerOptionsSchema,
  registerVerifySchema,
  loginVerifySchema,
  removeMineSchema,
};