// src/utils/fixAttendanceIndexes.js
// One-off migration required by the "كل حصة حضور مستقل" fix.
//
// The Attendance collection used to have ONE unique index: { student, date }.
// That's what caused the bug where two حصص ("class sessions") on the same
// calendar day shared/overwrote each other's attendance. The Attendance
// model now defines two *partial* unique indexes instead (one for the old
// day-based flow, one for the new session-scoped flow) — but MongoDB will
// NOT automatically replace the old index for you, since it has the same
// field names, just different options. This script drops the old rigid
// index so Mongoose can (re)create the correct partial ones on next boot.
//
// Safe to run multiple times — if the old index is already gone, it just
// does nothing. Doesn't touch or delete any data/documents, only an index.
//
// Run once: npm run fix-attendance-indexes

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const { MONGO_URI } = require('../config/env');

const run = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅  MongoDB connected\n');

    const collection = mongoose.connection.collection('attendances');
    const existing = await collection.indexes();

    // The old index has keys { student: 1, date: 1 } and no partialFilterExpression.
    const oldIndex = existing.find(
      (ix) =>
        ix.key &&
        Object.keys(ix.key).join(',') === 'student,date' &&
        !ix.partialFilterExpression
    );

    if (oldIndex) {
      await collection.dropIndex(oldIndex.name);
      console.log(`🗑️   تم حذف الـ index القديم (${oldIndex.name})`);
    } else {
      console.log('ℹ️   الـ index القديم مش موجود أصلاً — مفيش حاجة نعملها');
    }

    // Let Mongoose build the two new partial indexes declared on the schema.
    const Attendance = require('../models/Attendance');
    await Attendance.syncIndexes();
    console.log('✅  تم إنشاء الـ indexes الجديدة (حضور مستقل لكل حصة)');

    console.log('\n🎉  تم بنجاح');
    process.exit(0);
  } catch (err) {
    console.error('❌  فشل تعديل الـ indexes:', err);
    process.exit(1);
  }
};

run();