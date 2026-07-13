// src/routes/paperExamSection.routes.js
// Teacher-only: managing "أقسام الامتحانات الورقية".

const express = require('express');
const router  = express.Router();

const { getSections, createSection } = require('../controllers/paperExamSection.controller');

router.get('/',  getSections);
router.post('/', createSection);

module.exports = router;
