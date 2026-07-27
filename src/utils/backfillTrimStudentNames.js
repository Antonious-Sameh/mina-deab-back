// src/utils/backfillTrimStudentNames.js
// One-off migration: removes any leading/trailing whitespace from EXISTING
// students' names (internal spaces, e.g. between first/last name, are left
// completely untouched). Safe to run multiple times — students whose name
// has no leading/trailing spaces are left completely untouched, and nothing
// else in the database is modified.
//
// Run: npm run backfill-trim-student-names

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const { MONGO_URI } = require('../config/env');
const User = require('../models/User');

const run = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅  MongoDB connected\n');

    const students = await User.find({ role: 'student' }).select('_id name');

    let fixed = 0;
    for (const student of students) {
      const trimmed = (student.name || '').trim();
      if (trimmed !== student.name) {
        student.name = trimmed;
        await student.save();
        fixed += 1;
      }
    }

    console.log(`🎉  تم بنجاح — عدد الطلاب اللي اتصلحت أسماؤهم: ${fixed} من أصل ${students.length}`);
    process.exit(0);
  } catch (err) {
    console.error('❌  فشل تنظيف الأسماء:', err);
    process.exit(1);
  }
};

run();