// src/controllers/month.controller.js

const Month        = require('../models/Month');
const ClassSession  = require('../models/ClassSession');
const Attendance    = require('../models/Attendance');
const Payment       = require('../models/Payment');
const Group         = require('../models/Group');
const User          = require('../models/User');
const { success, created, notFound, error } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── GET /api/months?group= ─────────────────────────────────────────────────────
// Lists all months for a group, in the order they were created.
const getMonths = asyncHandler(async (req, res) => {
  const { group: groupId } = req.query;
  if (!groupId) return error(res, 'معرف المجموعة مطلوب', 400);

  const group = await Group.findById(groupId).lean();
  if (!group) return notFound(res, 'المجموعة غير موجودة');

  const months = await Month.find({ group: groupId }).sort({ createdAt: 1 }).lean();

  return success(res, { months, group });
});

// ── POST /api/months ───────────────────────────────────────────────────────────
// Body: { groupId, name, price }
const createMonth = asyncHandler(async (req, res) => {
  const { groupId, name, price } = req.body;

  const group = await Group.findById(groupId).lean();
  if (!group) return notFound(res, 'المجموعة غير موجودة');

  const month = await Month.create({ group: groupId, name, price });
  return created(res, { month }, 'تم إضافة الشهر بنجاح');
});

// ── PATCH /api/months/:id ──────────────────────────────────────────────────────
// Body: { name?, price? }
const updateMonth = asyncHandler(async (req, res) => {
  const month = await Month.findById(req.params.id);
  if (!month) return notFound(res, 'الشهر غير موجود');

  const { name, price } = req.body;
  if (name  !== undefined) month.name  = name;
  if (price !== undefined) month.price = price;

  await month.save();
  return success(res, { month }, 'تم تعديل الشهر بنجاح');
});

// ── DELETE /api/months/:id ─────────────────────────────────────────────────────
// Deletes the month and its sessions. Attendance records already taken stay
// in place (only unlinked from the deleted session) so the student's history
// and the teacher's reports are never affected. Payment records (money
// already collected) are also left untouched — deleting a month only removes
// it from the schedule, it never erases financial history.
const deleteMonth = asyncHandler(async (req, res) => {
  const month = await Month.findById(req.params.id);
  if (!month) return notFound(res, 'الشهر غير موجود');

  const sessions   = await ClassSession.find({ month: month._id }).select('_id').lean();
  const sessionIds = sessions.map((s) => s._id);

  if (sessionIds.length) {
    await Attendance.updateMany({ session: { $in: sessionIds } }, { $set: { session: null } });
    await ClassSession.deleteMany({ _id: { $in: sessionIds } });
  }

  await month.deleteOne();
  return success(res, {}, 'تم حذف الشهر بنجاح');
});

// ── GET /api/months/unpaid?group= ──────────────────────────────────────────────
// Students in this group who still owe money across any of its months —
// shown at the top of "الحضور والفلوس" so the teacher sees who hasn't paid
// without having to dig through every month/session.
const getUnpaidStudents = asyncHandler(async (req, res) => {
  const { group: groupId } = req.query;
  if (!groupId) return error(res, 'معرف المجموعة مطلوب', 400);

  const group = await Group.findById(groupId).lean();
  if (!group) return notFound(res, 'المجموعة غير موجودة');

  const students = await User
    .find({ group: groupId, role: 'student', isActive: true })
    .select('_id name codePlain studentId')
    .sort({ name: 1 })
    .lean();

  if (!students.length) return success(res, { students: [], group });

  const studentIds = students.map((s) => s._id);

  const payments = await Payment
    .find({ student: { $in: studentIds }, group: groupId })
    .select('student month requiredAmount paidAmount')
    .lean();

  const map = {};
  payments.forEach((p) => {
    const sid = p.student.toString();
    if (!map[sid]) map[sid] = { totalRequired: 0, totalPaid: 0, unpaidMonths: [] };
    map[sid].totalRequired += p.requiredAmount;
    map[sid].totalPaid     += p.paidAmount;
    if (p.paidAmount < p.requiredAmount) map[sid].unpaidMonths.push(p.month);
  });

  const unpaid = students
    .map((s) => {
      const m = map[s._id.toString()] || { totalRequired: 0, totalPaid: 0, unpaidMonths: [] };
      return {
        student:        s,
        totalRequired:  m.totalRequired,
        totalPaid:      m.totalPaid,
        totalRemaining: Math.max(0, m.totalRequired - m.totalPaid),
        unpaidMonths:   m.unpaidMonths,
      };
    })
    .filter((r) => r.totalRemaining > 0)
    .sort((a, b) => b.totalRemaining - a.totalRemaining);

  return success(res, { students: unpaid, group });
});

module.exports = {
  getMonths,
  createMonth,
  updateMonth,
  deleteMonth,
  getUnpaidStudents,
};
