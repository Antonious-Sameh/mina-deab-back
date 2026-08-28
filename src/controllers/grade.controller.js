// src/controllers/grade.controller.js

const mongoose = require('mongoose');
const Grade    = require('../models/Grade');
const Exam     = require('../models/Exam');
const User     = require('../models/User');
const ExamSubmission = require('../models/ExamSubmission');
const PaperExamSection = require('../models/PaperExamSection');
const { success, created, notFound, error } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');
const { ARABIC_NAME_COLLATION } = require('../utils/nameSort');

// ── GET /api/grades?exam= ─────────────────────────────────────────────────────
// Full grade sheet for an exam — all students in the exam's year.
// ── GET /api/grades?exam= ─────────────────────────────────────────────────────
// Full grade sheet for an exam — all students in the exam's year.
const getExamGrades = asyncHandler(async (req, res) => {
  const { exam: examId } = req.query;
  if (!examId) return error(res, 'معرف الامتحان مطلوب', 400);

  const exam = await Exam.findById(examId).lean();
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  // All students in the same academic year
  const students = await User
    .find({ role: 'student', academicYear: exam.academicYear, isActive: true })
    .select('_id name codePlain studentId group')
    .populate('group', 'name')
    .sort({ name: 1 })
    .collation(ARABIC_NAME_COLLATION)
    .lean();

  // ── تجميع الدرجات بناءً على نوع الامتحان (إلكتروني أو ورقي) ──────────────────
  let scoreMap = {};

  if (exam.examType === 'electronic' || !exam.examType) {
    // تحويل صريح لـ ObjectId لضمان دقة الاستعلام في جدول الامتحانات الإلكترونية
    const examObjId = new mongoose.Types.ObjectId(examId);
    const submissions = await ExamSubmission
      .find({ exam: examObjId })
      .select('student score percentage submittedAt maxScore')
      .lean();

    submissions.forEach(s => {
      scoreMap[s.student.toString()] = {
        score:       s.score,
        percentage:  s.percentage ?? (s.maxScore > 0 ? Math.round((s.score / s.maxScore) * 100) : 0),
        submittedAt: s.submittedAt,
        maxScore:    s.maxScore,
      };
    });
  } else {
    // للامتحانات الورقية واليدوية — نقرأ من جدول Grade العادي
    const grades = await Grade
      .find({ exam: examId })
      .select('student score note correctedBy createdAt')
      .lean();

    grades.forEach((g) => {
      scoreMap[g.student.toString()] = {
        score:       g.score,
        percentage:  g.percentage || null,
        submittedAt: g.createdAt,
        note:        g.note || null,
        gradeId:     g._id,
      };
    });
  }

  // دمج البيانات: كل طالب يظهر مع درجته أو null وحساب النسبة المئوية
  const sheet = students.map((s) => {
    const entry = scoreMap[s._id.toString()];
    const pct = entry?.percentage
      ?? (entry && exam.maxScore > 0 ? Math.round((entry.score / exam.maxScore) * 100) : null);

    return {
      student:     s,
      gradeId:     entry?.gradeId     || null,
      score:       entry?.score       ?? null,
      note:        entry?.note        || null,
      pct,
      submittedAt: entry?.submittedAt || null,
      entered:     !!entry,
    };
  });

  const enteredRows = sheet.filter(r => r.entered);
  const enteredCount = enteredRows.length;
  const avgScore = enteredCount > 0
    ? (enteredRows.reduce((s, r) => s + (r.score || 0), 0) / enteredCount).toFixed(1) : 0;
  const highest  = enteredCount > 0 ? Math.max(...enteredRows.map(r => r.score || 0)) : 0;
  const lowest   = enteredCount > 0 ? Math.min(...enteredRows.map(r => r.score || 0)) : 0;

  return success(res, {
    exam,
    sheet,
    summary: {
      total:    students.length,
      entered:  enteredCount,           // رقم صريح مش مصفوفة
      pending:  students.length - enteredCount,
      avgScore: Number(avgScore),
      highest,
      lowest,
    },
  });
});

// ── GET /api/grades/section-total?sectionId=&year= ────────────────────────────
// "إجمالي درجات القسم" — a virtual, calculated-only row shown alongside the
// real paper exams inside a PaperExamSection folder (GradesPage → قسم ورقي).
// It is NOT a real Exam document and nothing is written to the database for
// it — it is a pure read-model computed on every request from the paper
// exams that already belong to this section + their existing Grade rows, so
// it is always up to date the instant a grade (or an exam) is added, edited,
// or deleted — nothing to keep in sync.
//
// Scoping matches the rest of the grades page exactly:
//  - only paper exams whose `section` is this sectionId
//  - only exams whose `academicYear` is the requested year (sections are
//    already scoped per year — this is just an extra safety check so a
//    stale/foreign sectionId can never leak grades across years)
//  - group filtering is left to the frontend, exactly like every other
//    sheet in this file (getExamGrades, getPaperExamSheet) — the frontend
//    filters `sheet` by `student.group._id` using the same ALL_GROUPS logic
//    already used for every other exam's grade sheet.
const getSectionTotalGrades = asyncHandler(async (req, res) => {
  const { sectionId, year } = req.query;
  if (!sectionId || !year) return error(res, 'القسم والسنة الدراسية مطلوبان', 400);

  const section = await PaperExamSection.findById(sectionId).lean();
  if (!section) return notFound(res, 'القسم غير موجود');
  if (section.academicYear !== year) return notFound(res, 'القسم غير موجود لهذه السنة');

  // Every paper exam currently inside this section — this list itself IS the
  // "what counts in the total" logic: add an exam to the section and it's
  // included automatically on the next load; remove/delete it and it's
  // excluded automatically. No separate list to maintain.
  const exams = await Exam
    .find({ examType: 'paper', section: sectionId, academicYear: year })
    .select('_id maxScore')
    .lean();

  const examIds    = exams.map(e => e._id);
  const examMaxMap = {};
  exams.forEach(e => { examMaxMap[e._id.toString()] = e.maxScore || 0; });
  const totalMaxScore = exams.reduce((s, e) => s + (e.maxScore || 0), 0);

  // Same student selection/sort used by every other grade sheet in the app.
  const students = await User
    .find({ role: 'student', academicYear: year, isActive: true })
    .select('_id name codePlain studentId group')
    .populate('group', 'name')
    .sort({ name: 1 })
    .collation(ARABIC_NAME_COLLATION)
    .lean();

  // Single query for every grade across every exam in the section — avoids
  // N+1 queries regardless of how many exams/students exist.
  const grades = examIds.length
    ? await Grade.find({ exam: { $in: examIds } }).select('student exam score').lean()
    : [];

  // studentId -> accumulated totals across only the exams they were graded in
  const totals = {};
  grades.forEach((g) => {
    const sId = g.student.toString();
    const max = examMaxMap[g.exam.toString()] || 0;
    if (!totals[sId]) totals[sId] = { totalScore: 0, totalMax: 0, examsGraded: 0 };
    totals[sId].totalScore  += g.score || 0;
    totals[sId].totalMax    += max;
    totals[sId].examsGraded += 1;
  });

  // A student with no grade entered in ANY exam of this section is treated
  // exactly like an ungraded exam elsewhere in the app (entered:false, score
  // shown as "—") — we don't invent a new "0 by default" behaviour that
  // doesn't exist anywhere else in the grading system.
  const sheet = students.map((s) => {
    const t = totals[s._id.toString()];
    const entered = !!t && t.examsGraded > 0;
    const pct = entered && t.totalMax > 0 ? Math.round((t.totalScore / t.totalMax) * 100) : null;
    return {
      student:     s,
      score:       entered ? t.totalScore : null,
      maxScore:    entered ? t.totalMax   : 0,
      pct,
      examsGraded: entered ? t.examsGraded : 0,
      examsTotal:  exams.length,
      entered,
    };
  });

  return success(res, {
    section: { _id: section._id, name: section.name },
    year,
    examCount:    exams.length,
    totalMaxScore,
    sheet,
  });
});

// ── POST /api/grades ──────────────────────────────────────────────────────────
// Enter or update a single grade (upsert).
const enterGrade = asyncHandler(async (req, res) => {
  const { studentId, examId, score, note } = req.body;
  const teacherId = req.user.userId;

  const [student, exam] = await Promise.all([
    User.findOne({ _id: studentId, role: 'student' }).lean(),
    Exam.findById(examId).lean(),
  ]);

  if (!student) return notFound(res, 'الطالب غير موجود');
  if (!exam)    return notFound(res, 'الامتحان غير موجود');

  if (exam.status === 'closed') {
    return error(res, 'لا يمكن إدخال درجات لامتحان مغلق', 400);
  }
  if (score > exam.maxScore) {
    return error(res, `الدرجة (${score}) أكبر من الدرجة الكاملة (${exam.maxScore})`, 400);
  }

  const grade = await Grade.findOneAndUpdate(
    { student: studentId, exam: examId },
    {
      $set: {
        score,
        note:        note || null,
        correctedBy: teacherId,
      },
    },
    { upsert: true, new: true, runValidators: false }
  );

  return success(res, { grade }, 'تم حفظ الدرجة بنجاح');
});

// ── POST /api/grades/bulk ─────────────────────────────────────────────────────
// Bulk upsert grades for an entire exam — one request for the whole sheet.
const bulkEnterGrades = asyncHandler(async (req, res) => {
  const { examId, grades } = req.body;
  const teacherId = req.user.userId;

  const exam = await Exam.findById(examId).lean();
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  if (exam.status === 'closed') {
    return error(res, 'لا يمكن إدخال درجات لامتحان مغلق', 400);
  }

  // Validate all scores within range
  const invalid = grades.filter((g) => g.score > exam.maxScore);
  if (invalid.length > 0) {
    return error(
      res,
      `${invalid.length} درجة تتجاوز الدرجة الكاملة (${exam.maxScore})`,
      400
    );
  }

  const ops = grades.map(({ studentId, score, note }) => ({
    updateOne: {
      filter: { student: studentId, exam: examId },
      update: {
        $set: {
          score,
          note:        note || null,
          correctedBy: teacherId,
        },
      },
      upsert: true,
    },
  }));

  const result = await Grade.bulkWrite(ops, { ordered: false });

  return success(res, {
    examId,
    submitted: grades.length,
    inserted:  result.upsertedCount,
    updated:   result.modifiedCount,
  }, `تم حفظ ${grades.length} درجة بنجاح`);
});

// ── PUT /api/grades/:id ───────────────────────────────────────────────────────
const updateGrade = asyncHandler(async (req, res) => {
  const { score, note } = req.body;

  const grade = await Grade.findById(req.params.id).populate('exam', 'maxScore status');
  if (!grade) return notFound(res, 'الدرجة غير موجودة');

  if (grade.exam?.status === 'closed') {
    return error(res, 'لا يمكن تعديل درجات امتحان مغلق', 400);
  }
  if (score > grade.exam?.maxScore) {
    return error(res, `الدرجة (${score}) أكبر من الدرجة الكاملة (${grade.exam.maxScore})`, 400);
  }

  grade.score        = score;
  grade.note         = note || null;
  grade.correctedBy  = req.user.userId;
  await grade.save();

  return success(res, { grade }, 'تم تعديل الدرجة بنجاح');
});

// ── GET /api/grades/student/:studentId ───────────────────────────────────────
// All grades for a student across all exams.
const getStudentGrades = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.studentId, role: 'student' }).lean();
  if (!student) return notFound(res, 'الطالب غير موجود');

  const grades = await Grade
    .find({ student: req.params.studentId })
    .populate('exam', 'title maxScore examDate academicYear status')
    .sort({ createdAt: -1 })
    .lean();

  const totalScore = grades.reduce((s, g) => s + g.score, 0);
  const totalMax   = grades.reduce((s, g) => s + (g.exam?.maxScore || 0), 0);

  return success(res, {
    student: { _id: student._id, name: student.name, academicYear: student.academicYear },
    grades,
    summary: {
      examCount:  grades.length,
      totalScore,
      totalMax,
      percentage: totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0,
    },
  });
});

// ── GET /api/grades/rankings?year= ────────────────────────────────────────────
// Ranks students in an academic year by total score — descending.
// ── GET /api/grades/rankings?year= ────────────────────────────────────────────
// ترتيب الطلاب بدمج الدرجات اليدوية + تسليمات التصحيح التلقائي
// ── GET /api/grades/rankings?year=&type= ─────────────────────────────────────
// type = 'electronic' | 'paper' | (empty = both)
const getRankings = asyncHandler(async (req, res) => {
  const { year, type } = req.query;
  if (!year) return error(res, 'السنة الدراسية مطلوبة', 400);

  // All active students in year
  const students = await User
    .find({ role: 'student', academicYear: year, isActive: true })
    .select('_id name codePlain group avatar')
    .populate('group', 'name')
    .lean();

  const scoreMap = new Map(); // studentId -> { totalScore, totalMax }
  students.forEach(s => scoreMap.set(s._id.toString(), { totalScore: 0, totalMax: 0 }));

  const addScores = (studentId, score, max) => {
    const entry = scoreMap.get(studentId.toString());
    if (entry) { entry.totalScore += score || 0; entry.totalMax += max || 0; }
  };

  // ── Electronic (ExamSubmission) and Paper (Grade) score gathering are
  // completely independent of each other — each only reads its own source
  // and writes into scoreMap via addScores — so run whichever branches are
  // needed concurrently instead of one after another.
  const tasks = [];

  if (!type || type === 'electronic') {
    tasks.push((async () => {
      const electronicExams = await Exam.find({
        academicYear: year,
        status: { $ne: 'draft' },
        $or: [{ examType: 'electronic' }, { examType: { $exists: false } }],
      }).select('_id maxScore').lean();

      const examMaxMap = {};
      electronicExams.forEach(e => { examMaxMap[e._id.toString()] = e.maxScore || 0; });

      const subs = await ExamSubmission.find({
        exam: { $in: electronicExams.map(e => e._id) },
      }).select('student exam score').lean();

      subs.forEach(s => addScores(s.student, s.score, examMaxMap[s.exam.toString()] || 0));
    })());
  }

  if (!type || type === 'paper') {
    tasks.push((async () => {
      const paperGrades = await Grade.find({
        examType: 'paper',
        exam: null,
      }).populate({ path: 'student', select: 'academicYear', match: { academicYear: year } })
        .select('student score maxScore').lean();

      paperGrades.forEach(g => {
        if (g.student) addScores(g.student._id, g.score, g.maxScore || 0);
      });
    })());
  }

  await Promise.all(tasks);

  // Build ranking list
  const ranked = students
    .map(s => ({
      student:    { _id: s._id, name: s.name, codePlain: s.codePlain, group: s.group, avatar: s.avatar },
      totalScore: scoreMap.get(s._id.toString())?.totalScore || 0,
      totalMax:   scoreMap.get(s._id.toString())?.totalMax   || 0,
      percentage: scoreMap.get(s._id.toString())?.totalMax > 0
        ? Math.round((scoreMap.get(s._id.toString()).totalScore / scoreMap.get(s._id.toString()).totalMax) * 100)
        : 0,
    }))
    .sort((a, b) => b.totalScore - a.totalScore);

  // Assign rank (ties get same rank)
  let rank = 1;
  ranked.forEach((r, i) => {
    if (i > 0 && r.totalScore < ranked[i-1].totalScore) rank = i + 1;
    r.rank = rank;
  });

  return success(res, { year, type: type || 'all', total: ranked.length, rankings: ranked });
});

// ══════════════════════════════════════════════════════════════════════════════
// PAPER EXAM GRADES — create exam entry + bulk enter scores
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/grades/paper-exams?year= ─────────────────────────────────────────
// List all paper exam "headers" (distinct examTitle per year)
const getPaperExams = asyncHandler(async (req, res) => {
  const { year } = req.query;
  if (!year) return error(res, 'السنة الدراسية مطلوبة', 400);

  const groups = await Grade.aggregate([
    { $match: { examType: 'paper', exam: null } },
    {
      $lookup: {
        from: 'users', localField: 'student', foreignField: '_id',
        as: 'studentData',
      },
    },
    { $unwind: '$studentData' },
    { $match: { 'studentData.academicYear': year } },
    {
      $group: {
        _id: '$examTitle',
        maxScore:    { $first: '$maxScore' },
        studentCount:{ $sum: 1 },
        createdAt:   { $first: '$createdAt' },
        ids:         { $push: '$_id' },
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  return success(res, { paperExams: groups, total: groups.length });
});

// ── GET /api/grades/paper-exam-sheet?year=&title= ────────────────────────────
// Get all students + their grades for a specific paper exam
const getPaperExamSheet = asyncHandler(async (req, res) => {
  const { year, title } = req.query;
  if (!year||!title) return error(res, 'السنة والعنوان مطلوبان', 400);

  const students = await User
    .find({ role:'student', academicYear:year, isActive:true })
    .select('_id name codePlain studentId group')
    .populate('group','name')
    .sort({ name:1 }).lean();

  const grades = await Grade.find({ examType:'paper', exam:null, examTitle:title }).lean();
  const gradeMap = {};
  grades.forEach(g => { gradeMap[g.student.toString()] = g; });

  const maxScore = grades[0]?.maxScore || 0;

  const sheet = students.map(s => ({
    student: s,
    gradeId: gradeMap[s._id.toString()]?._id || null,
    score:   gradeMap[s._id.toString()]?.score ?? null,
    entered: !!gradeMap[s._id.toString()],
  }));

  return success(res, { title, maxScore, year, sheet });
});

// ── POST /api/grades/paper-exam ────────────────────────────────────────────────
// Create a new paper exam header (just stores first batch of empty grades)
const createPaperExam = asyncHandler(async (req, res) => {
  const { title, maxScore, academicYear } = req.body;
  if (!title?.trim()||!academicYear) return error(res, 'الاسم والمرحلة مطلوبان', 400);

  // Check not duplicate
  const students = await User
    .find({ role:'student', academicYear, isActive:true })
    .select('_id').lean();

  if (!students.length) return error(res, 'لا يوجد طلاب في هذه المرحلة', 400);

  // Create placeholder grade rows so the exam "exists"
  const ops = students.map(s => ({
    updateOne: {
      filter: { student:s._id, examType:'paper', exam:null, examTitle:title.trim() },
      update: { $setOnInsert: { student:s._id, examType:'paper', exam:null, examTitle:title.trim(), maxScore:Number(maxScore)||0, score:0, correctedBy:null } },
      upsert: true,
    },
  }));
  await Grade.bulkWrite(ops);

  return created(res, { title:title.trim(), maxScore:Number(maxScore)||0, academicYear }, 'تم إنشاء الامتحان الورقي');
});

// ── POST /api/grades/paper-exam-bulk ─────────────────────────────────────────
// Bulk upsert scores for a paper exam
const bulkPaperGrades = asyncHandler(async (req, res) => {
  const { title, maxScore, academicYear, grades: gradeList } = req.body;
  if (!title||!gradeList?.length) return error(res, 'البيانات ناقصة', 400);

  const ops = gradeList.map(g => ({
    updateOne: {
      filter: { student:g.studentId, examType:'paper', exam:null, examTitle:title },
      update: { $set: { score:Number(g.score)||0, maxScore:Number(maxScore)||0, correctedBy:null } },
      upsert: true,
    },
  }));
  await Grade.bulkWrite(ops);
  return success(res, {}, 'تم حفظ الدرجات بنجاح');
});

// ── DELETE /api/grades/paper-exam ─────────────────────────────────────────────
const deletePaperExam = asyncHandler(async (req, res) => {
  const { title, year } = req.query;
  if (!title||!year) return error(res, 'العنوان والمرحلة مطلوبان', 400);
  const students = await User.find({ role:'student', academicYear:year }).select('_id').lean();
  const ids = students.map(s=>s._id);
  await Grade.deleteMany({ examType:'paper', exam:null, examTitle:title, student:{ $in:ids } });
  return success(res, {}, 'تم حذف الامتحان الورقي وجميع درجاته');
});

// ── GET /api/grades/exam-rankings?year=&examId=&examType= ─────────────────────
// Rank students by their score in ONE specific exam (electronic OR paper).
//
// ── BUGFIX (ranking page shows nothing after picking a stage) ────────────────
// Paper-exam grades are entered by the teacher through GradesPage → PaperGrades
// tab, which uses the SAME storage as electronic exams: a real `Exam` document
// (examType:'paper') + `Grade{ exam: examId, student, score }` rows — see
// GET /grades?exam= and POST /grades/bulk in this same file, used by
// front/src/pages/teacher/GradesPage.jsx's paper tab.
// This endpoint used to look for a completely different, unused storage shape
// (`Grade{ examType:'paper', exam:null, examTitle }`) that nothing in the app
// actually writes to anymore — so paper rankings (and the paper exam list in
// getPaperExams) were always empty. Reading paper scores the same way as
// electronic ones (by real exam._id) fixes this without touching the schema.
const getExamRankings = asyncHandler(async (req, res) => {
  const { year, examId, examType } = req.query;

  if (!year) return error(res, 'السنة الدراسية مطلوبة', 400);

  const students = await User
    .find({ role: 'student', academicYear: year, isActive: true })
    .select('_id name codePlain group')
    .populate('group', 'name')
    .lean();

  const scoreMap = new Map();

  if (examId && (examType === 'electronic' || examType === 'paper')) {
    const examObjId = new mongoose.Types.ObjectId(examId);
    const exam       = await Exam.findById(examObjId).select('maxScore title academicYear').lean();

    if (exam && exam.academicYear === year) {
      if (examType === 'electronic') {
        // Electronic: read from ExamSubmission
        const subs = await ExamSubmission.find({ exam: examObjId }).select('student score percentage').lean();
        subs.forEach(s => scoreMap.set(s.student.toString(), {
          score: s.score, maxScore: exam?.maxScore || 0, percentage: s.percentage || 0,
        }));
      } else {
        // Paper: read from Grade model — same shape used by GradesPage's paper tab
        const grades = await Grade.find({ exam: examObjId }).select('student score').lean();
        grades.forEach(g => scoreMap.set(g.student.toString(), {
          score: g.score || 0,
          maxScore: exam?.maxScore || 0,
          percentage: exam?.maxScore > 0 ? Math.round((g.score / exam.maxScore) * 100) : 0,
        }));
      }
    }
  }

  const ranked = students
    .map(s => ({
      student:    { _id: s._id, name: s.name, codePlain: s.codePlain, group: s.group },
      score:      scoreMap.get(s._id.toString())?.score      ?? null,
      maxScore:   scoreMap.get(s._id.toString())?.maxScore   ?? 0,
      percentage: scoreMap.get(s._id.toString())?.percentage ?? 0,
      entered:    scoreMap.has(s._id.toString()),
    }))
    .sort((a, b) => {
      // Students without score go to the bottom
      if (!a.entered && !b.entered) return 0;
      if (!a.entered) return 1;
      if (!b.entered) return -1;
      // Sort by score desc
      return b.score - a.score;
    });

  let rank = 1;
  ranked.forEach((r, i) => {
    if (!r.entered) { r.rank = null; return; }
    // Tie-breaker: same score = same rank
    if (i > 0 && ranked[i-1].entered && r.score < ranked[i-1].score) {
      rank = i + 1;
    }
    r.rank = rank;
  });

  return success(res, { year, examType, total: ranked.length, rankings: ranked });
});

module.exports = {
  getExamGrades,
  getSectionTotalGrades,
  enterGrade,
  bulkEnterGrades,
  updateGrade,
  getStudentGrades,
  getRankings,
  getPaperExams,
  getPaperExamSheet,
  createPaperExam,
  bulkPaperGrades,
  deletePaperExam,
  getExamRankings,
};