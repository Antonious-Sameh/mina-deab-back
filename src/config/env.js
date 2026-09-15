// src/config/env.js
// Validates all required environment variables on startup.
// Crashes early with a clear message rather than failing silently later.

const required = [
  'MONGO_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

function validateEnv() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `\n❌  Missing required environment variables:\n   ${missing.join('\n   ')}\n` +
      `   Copy .env.example to .env and fill in the values.\n`
    );
    process.exit(1);
  }

  // COOKIE_SECRET مش في القائمة اللي فوق لأن فيه fallback ليه، فمش بيوقف
  // السيرفر — لكن لو حصل مش موجود في الإنتاج، ده معناه إن أي حاجة بتعتمد
  // على كوكيز موقّعة (signed cookies، زي challenge الـ Passkey) هتفشل، وده
  // نوع من الأخطاء بيتخبى بسهولة وراء الـ fallback الصامت. التحذير ده
  // بيبان في لوج فيرسيل/السيرفر فورًا عشان تعرف السبب الحقيقي بدل التخمين.
  if (process.env.NODE_ENV === 'production' && !process.env.COOKIE_SECRET) {
    console.warn(
      '\n⚠️  COOKIE_SECRET غير مضبوط في بيئة الإنتاج — بيتم استخدام قيمة ' +
      'افتراضية مؤقتة. لو فيه مشاكل في الكوكيز الموقّعة (زي تفعيل البصمة)، ' +
      'أضف COOKIE_SECRET في متغيرات البيئة الخاصة بـ Production تحديدًا.\n'
    );
  }
}

module.exports = {
  validateEnv,
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGO_URI: process.env.MONGO_URI,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '15m',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || '30d',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  COOKIE_SECRET: process.env.COOKIE_SECRET || 'khatwa_cookie_secret',
};