// src/models/Counter.js
// Generic atomic counter collection, used to generate sequential values
// safely under concurrency (e.g. block-based student IDs per academic year).
//
// One document per "key" (e.g. "studentId:first-prep"). Each call to
// findOneAndUpdate with $inc atomically bumps `seq` and returns the new
// value — this avoids race conditions when two students are created at
// the same time.

const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', counterSchema);
