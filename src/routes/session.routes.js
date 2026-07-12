// src/routes/session.routes.js
// Teacher-only: managing "الحصص" (class sessions) per month, and their
// combined attendance + payment sheet.

const express = require('express');
const router  = express.Router();

const {
  getSessions,
  createSession,
  updateSession,
  deleteSession,
  getSessionSheet,
  submitAttendance,
} = require('../controllers/session.controller');

const { validate }  = require('../middleware/validate.middleware');
const {
  createSessionSchema,
  updateSessionSchema,
  submitAttendanceSchema,
} = require('./session.schemas');

// GET /api/sessions?month=
router.get('/', getSessions);

// POST /api/sessions
router.post('/', validate(createSessionSchema), createSession);

// PATCH /api/sessions/:id
router.patch('/:id', validate(updateSessionSchema), updateSession);

// DELETE /api/sessions/:id
router.delete('/:id', deleteSession);

// GET /api/sessions/:id/sheet
router.get('/:id/sheet', getSessionSheet);

// POST /api/sessions/:id/attendance
router.post('/:id/attendance', validate(submitAttendanceSchema), submitAttendance);

module.exports = router;
