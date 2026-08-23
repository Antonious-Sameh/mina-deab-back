// src/controllers/file.controller.js
//
// ── PDF FIX (root cause) ──────────────────────────────────────────────────────
// PDFViewer.jsx (pdf.js) was fetching Cloudinary PDF URLs DIRECTLY from the
// browser. That cross-origin fetch depends on Cloudinary sending the right
// CORS headers for that exact request — and in practice this fails silently
// for many accounts/plans/asset configurations, showing pdf.js's generic
// "تعذّر تحميل الملف" error with nothing more specific to go on.
//
// This proxy removes that cross-origin hop entirely: our own backend (server
// to server — no browser CORS rules apply there) downloads the file from
// Cloudinary, then serves the bytes back to the browser from OUR OWN domain
// with headers we fully control (correct Content-Type, inline disposition,
// UTF-8 filename support for Arabic names, CORS open to our own frontend).
// The browser then only ever talks to our API, same-origin — no third-party
// CORS behaviour to depend on at all.
//
// This is purely additive: a brand new route. Nothing existing is touched or
// removed — any code still pointing straight at a Cloudinary URL keeps
// working exactly as before.

const { asyncHandler } = require('../middleware/error.middleware');
const { error: apiError } = require('../utils/apiResponse');

// Only ever proxy Cloudinary URLs — prevents this endpoint being abused as an
// open proxy to fetch arbitrary internet addresses (SSRF protection).
const ALLOWED_HOST_SUFFIX = 'res.cloudinary.com';

const proxyFile = asyncHandler(async (req, res) => {
  const { url, name } = req.query;
  if (!url) return apiError(res, 'رابط الملف مطلوب', 400);

  let target;
  try {
    target = new URL(url);
  } catch {
    return apiError(res, 'رابط الملف غير صحيح', 400);
  }

  if (!target.hostname.endsWith(ALLOWED_HOST_SUFFIX)) {
    return apiError(res, 'هذا الرابط غير مسموح به', 403);
  }

  let upstream;
  try {
    upstream = await fetch(target.toString());
  } catch (err) {
    console.error('[file.controller] proxy network error:', err.message);
    return apiError(res, 'تعذّر الاتصال بالخادم لجلب الملف', 502);
  }

  if (!upstream.ok || !upstream.body) {
    // نطبع تفاصيل الخطأ الحقيقي في سجلات السيرفر (Logs) عشان نقدر نشخّص
    // السبب الحقيقي بدل رسالة عامة، مع رسالة أوضح للحالة الأكثر شيوعًا:
    // حساب Cloudinary مقفول عليه توصيل ملفات PDF/ZIP من إعدادات الأمان
    // (Settings → Security → "Allow delivery of PDF and ZIP files").
    // ده إعداد على مستوى الحساب مش ممكن يتغير من الكود خالص.
    let bodyText = '';
    try { bodyText = await upstream.text(); } catch {}
    console.error('[file.controller] Cloudinary refused the file:', {
      status: upstream.status,
      statusText: upstream.statusText,
      url: target.toString(),
      body: bodyText?.slice(0, 500),
    });

    if (upstream.status === 401 || upstream.status === 403) {
      return apiError(
        res,
        'الحساب مقفول عليه توصيل ملفات PDF من Cloudinary — لازم تتفعّل خاصية "Allow delivery of PDF and ZIP files" من إعدادات الأمان في لوحة تحكم Cloudinary',
        upstream.status,
      );
    }
    return apiError(res, 'تعذّر تحميل الملف من مصدره', upstream.status === 404 ? 404 : 502);
  }

  const contentType = upstream.headers.get('content-type') || 'application/pdf';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  // RFC 5987 encoding so Arabic file names survive in the header safely
  const safeName = name ? encodeURIComponent(name) : 'file.pdf';
  res.setHeader('Content-Disposition', `inline; filename="download"; filename*=UTF-8''${safeName}`);

  const buffer = Buffer.from(await upstream.arrayBuffer());
  return res.status(200).send(buffer);
});

module.exports = { proxyFile };