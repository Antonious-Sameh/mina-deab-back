// src/routes/month.routes.js
// Teacher-only: managing "الشهور" (billing periods) per group.

const express = require('express');
const router  = express.Router();

const {
  getMonths,
  createMonth,
  updateMonth,
  deleteMonth,
  getUnpaidStudents,
} = require('../controllers/month.controller');

const { validate }  = require('../middleware/validate.middleware');
const { createMonthSchema, updateMonthSchema } = require('./month.schemas');

// GET /api/months/unpaid?group=  (before /:id-style routes — no clash here, but kept first for clarity)
router.get('/unpaid', getUnpaidStudents);

// GET /api/months?group=
router.get('/', getMonths);

// POST /api/months
router.post('/', validate(createMonthSchema), createMonth);

// PATCH /api/months/:id
router.patch('/:id', validate(updateMonthSchema), updateMonth);

// DELETE /api/months/:id
router.delete('/:id', deleteMonth);

module.exports = router;
