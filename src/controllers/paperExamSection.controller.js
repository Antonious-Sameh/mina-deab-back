// src/controllers/paperExamSection.controller.js

const PaperExamSection = require('../models/PaperExamSection');
const Exam              = require('../models/Exam');
const { success, created, error } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// Escapes special regex characters so a section name can be safely used
// inside a case-insensitive exact-match regex.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Finds an existing section with the same name (case-insensitive) for this
// academic year, or creates a new one. Used both by the dedicated
// create-section endpoint and internally when creating a paper exam with a
// brand-new section name.
const findOrCreateSection = async (academicYear, name) => {
  const trimmed = name.trim();
  let section = await PaperExamSection.findOne({
    academicYear,
    name: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' },
  });
  if (!section) {
    section = await PaperExamSection.create({ academicYear, name: trimmed });
  }
  return section;
};

// ── GET /api/paper-exam-sections?year= ─────────────────────────────────────────
// Lists all sections for a year, each with a count of paper exams inside it.
const getSections = asyncHandler(async (req, res) => {
  const { year } = req.query;
  if (!year) return error(res, 'السنة الدراسية مطلوبة', 400);

  const sections = await PaperExamSection.find({ academicYear: year }).sort({ createdAt: 1 }).lean();

  const counts = await Exam.aggregate([
    { $match: { examType: 'paper', academicYear: year, section: { $ne: null } } },
    { $group: { _id: '$section', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  counts.forEach((c) => { countMap[c._id.toString()] = c.count; });

  return success(res, {
    sections: sections.map((s) => ({ ...s, examCount: countMap[s._id.toString()] || 0 })),
  });
});

// ── POST /api/paper-exam-sections ──────────────────────────────────────────────
// Body: { academicYear, name } — idempotent: returns the existing section if
// one with the same name (case-insensitive) already exists for that year.
const createSection = asyncHandler(async (req, res) => {
  const { academicYear, name } = req.body;
  if (!academicYear)  return error(res, 'السنة الدراسية مطلوبة', 400);
  if (!name?.trim())  return error(res, 'اسم القسم مطلوب', 400);

  const section = await findOrCreateSection(academicYear, name);
  return created(res, { section }, 'تم إضافة القسم بنجاح');
});

module.exports = { getSections, createSection, findOrCreateSection };
