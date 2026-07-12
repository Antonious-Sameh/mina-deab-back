// src/utils/backfillStudentIds.js
// One-off migration: assigns a permanent block-based "studentId" to every
// EXISTING student who doesn't have one yet (studentId === null).
//
// Safe to run multiple times — students who already have a studentId are
// left completely untouched. Nothing else in the database is modified.
//
// Students are backfilled academic-year by academic-year, in the same
// alphabetical order they already appear in on the Students page, so the
// numbers themselves stay meaningless/non-sequential-looking, while being
// stable and predictable to assign.
//
// Run: npm run backfill-student-ids

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const { MONGO_URI } = require('../config/env');
const User = require('../models/User');
const { generateStudentId } = require('./studentId');

const run = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅  MongoDB connected\n');

    const years = await User.distinct('academicYear', { role: 'student', studentId: null });

    let total = 0;
    for (const year of years) {
      if (!year) continue; // skip students without an academic year (shouldn't normally happen)

      const students = await User
        .find({ role: 'student', academicYear: year, studentId: null })
        .sort({ name: 1 });

      for (const student of students) {
        student.studentId = await generateStudentId(year);
        await student.save();
        total += 1;
      }

      console.log(`✅  ${year}: ${students.length} طالب تم تعيين ID لهم`);
    }

    console.log(`\n🎉  تم بنجاح — إجمالي الطلاب اللي اتحدّثوا: ${total}`);
    process.exit(0);
  } catch (err) {
    console.error('❌  فشل تعيين الـ IDs:', err);
    process.exit(1);
  }
};

run();
