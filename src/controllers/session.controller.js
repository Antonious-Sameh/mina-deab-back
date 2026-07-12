// src/controllers/session.controller.js

const ClassSession = require('../models/ClassSession');
const Month         = require('../models/Month');
const Group          = require('../models/Group');
const User            = require('../models/User');
const Attendance      = require('../models/Attendance');
const Payment         = require('../models/Payment');
const { success, created, notFound, error } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

const todayStr = () => new Date().toISOString().slice(0, 10);

// ── GET /api/sessions?month= ───────────────────────────────────────────────────
// Lists all sessions ("حصص") inside a month, in the order they were created.
const getSessions = asyncHandler(async (req, res) => {
  const { month: monthId } = req.query;
  if (!monthId) return error(res, 'معرف الشهر مطلوب', 400);

  const month = await Month.findById(monthId).lean();
  if (!month) return notFound(res, 'الشهر غير موجود');

  const sessions = await ClassSession.find({ month: monthId }).sort({ createdAt: 1 }).lean();

  return success(res, { sessions, month });
});

// ── POST /api/sessions ─────────────────────────────────────────────────────────
// Body: { monthId, name }
const createSession = asyncHandler(async (req, res) => {
  const { monthId, name } = req.body;

  const month = await Month.findById(monthId).lean();
  if (!month) return notFound(res, 'الشهر غير موجود');

  const session = await ClassSession.create({
    month: monthId,
    group: month.group,
    name,
    date:  todayStr(),
  });

  return created(res, { session }, 'تم إضافة الحصة بنجاح');
});

// ── PATCH /api/sessions/:id ────────────────────────────────────────────────────
// Body: { name }
const updateSession = asyncHandler(async (req, res) => {
  const session = await ClassSession.findById(req.params.id);
  if (!session) return notFound(res, 'الحصة غير موجودة');

  session.name = req.body.name;
  await session.save();

  return success(res, { session }, 'تم تعديل اسم الحصة بنجاح');
});

// ── DELETE /api/sessions/:id ───────────────────────────────────────────────────
// Deletes the session. Attendance records already taken for it stay in place
// (only unlinked) so the student's history and reports keep working.
const deleteSession = asyncHandler(async (req, res) => {
  const session = await ClassSession.findById(req.params.id);
  if (!session) return notFound(res, 'الحصة غير موجودة');

  await Attendance.updateMany({ session: session._id }, { $set: { session: null } });
  await session.deleteOne();

  return success(res, {}, 'تم حذف الحصة بنجاح');
});

// ── GET /api/sessions/:id/sheet ────────────────────────────────────────────────
// The combined table: الطالب | ID | حضور/غياب | دفع | باقي
// Merges the session's group students with:
//   - their Attendance record for this session's date
//   - their Payment record for this session's month (by month name)
const getSessionSheet = asyncHandler(async (req, res) => {
  const session = await ClassSession.findById(req.params.id).lean();
  if (!session) return notFound(res, 'الحصة غير موجودة');

  const [month, group] = await Promise.all([
    Month.findById(session.month).lean(),
    Group.findById(session.group).lean(),
  ]);

  const students = await User
    .find({ group: session.group, role: 'student', isActive: true })
    .select('_id name codePlain studentId')
    .sort({ name: 1 })
    .lean();

  const studentIds = students.map((s) => s._id);

  const [attRecords, payRecords] = await Promise.all([
    Attendance.find({ student: { $in: studentIds }, date: session.date }).select('student status').lean(),
    Payment.find({ student: { $in: studentIds }, month: month?.name }).select('student requiredAmount paidAmount').lean(),
  ]);

  const attMap = {};
  attRecords.forEach((r) => { attMap[r.student.toString()] = r.status; });

  const payMap = {};
  payRecords.forEach((r) => { payMap[r.student.toString()] = r; });

  const sheet = students.map((s) => {
    const pay = payMap[s._id.toString()];
    const requiredAmount = pay ? pay.requiredAmount : (month?.price || 0);
    const paidAmount     = pay ? pay.paidAmount     : 0;
    return {
      student: s,
      status:  attMap[s._id.toString()] || null,
      payment: {
        paymentId:       pay ? pay._id : null,
        requiredAmount,
        paidAmount,
        remainingAmount: Math.max(0, requiredAmount - paidAmount),
        isPaid:          requiredAmount > 0 && paidAmount >= requiredAmount,
      },
    };
  });

  return success(res, { session, month, group, sheet });
});

// ── POST /api/sessions/:id/attendance ──────────────────────────────────────────
// Body: { records: [{ studentId, status }] }
// Upserts into the SAME Attendance collection used everywhere else in the
// app (student history, group stats, reports) — keyed by the session's date,
// exactly like the original day-based attendance flow — plus a `session`
// link for the new session-scoped views.
const submitAttendance = asyncHandler(async (req, res) => {
  const session = await ClassSession.findById(req.params.id);
  if (!session) return notFound(res, 'الحصة غير موجودة');

  const { records } = req.body;
  const teacherId = req.user.userId;

  const ops = records.map(({ studentId, status }) => ({
    updateOne: {
      filter: { student: studentId, date: session.date },
      update: {
        $set: {
          student:    studentId,
          group:      session.group,
          date:       session.date,
          status,
          session:    session._id,
          recordedBy: teacherId,
        },
      },
      upsert: true,
    },
  }));

  await Attendance.bulkWrite(ops, { ordered: false });

  return success(res, { submitted: records.length }, 'تم حفظ الحضور بنجاح');
});

module.exports = {
  getSessions,
  createSession,
  updateSession,
  deleteSession,
  getSessionSheet,
  submitAttendance,
};
