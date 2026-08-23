// src/routes/file.routes.js
const express = require('express');
const router  = express.Router();
const { proxyFile } = require('../controllers/file.controller');

// GET /api/files/proxy?url=&name=  — protect applied in app.js
router.get('/proxy', proxyFile);

module.exports = router;