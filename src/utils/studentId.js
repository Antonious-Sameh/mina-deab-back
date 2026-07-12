// src/utils/studentId.js
// Generates a stable, permanent, human-friendly "ID" for each student,
// unique within their own academic year only (the same ID number CAN be
// reused across different academic years).
//
// Instead of a plain sequence (11111, 11112, 11113, ...) the IDs are handed
// out in "blocks" of BLOCK_SIZE, so the true creation order of a student
// isn't obvious just from looking at their ID:
//
//   Block 1 → 11111, 11112, ... 11140   (30 IDs)
//   Block 2 → 22221, 22222, ... 22250   (30 IDs)
//   Block 3 → 33331, 33332, ... 33360   (30 IDs)
//   Block 4 → 44441, 44442, ... 44470   (30 IDs)
//   ...
//
// Once a block is used up, the next student automatically starts the next
// block. IDs are assigned once and never change or get reused — a new
// student always gets the next free slot at the *end* of the sequence,
// even if older students were deleted (no back-filling of gaps).

const Counter = require('../models/Counter');

const BLOCK_SIZE = 30;

// Turns a 1-indexed running position into its block-based ID.
function seqToStudentId(seq) {
  const blockIndex = Math.ceil(seq / BLOCK_SIZE);            // 1, 2, 3, ...
  const posInBlock  = seq - (blockIndex - 1) * BLOCK_SIZE;    // 1..BLOCK_SIZE
  return blockIndex * 11110 + posInBlock;
}

// Atomically reserves the next position for this academic year and
// returns its block-based student ID. Safe under concurrent requests.
async function generateStudentId(academicYear) {
  const key = `studentId:${academicYear}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return seqToStudentId(counter.seq);
}

module.exports = { generateStudentId, seqToStudentId, BLOCK_SIZE };
