// src/utils/nameSort.js
// Single source of truth for how student names are sorted alphabetically
// (Arabic collation) everywhere in the app — Students page, Attendance &
// Payments sheet, Grades sheet, and anywhere else a student roster is
// listed by name. Every place that needs "the same order as the Students
// page" should import and use this exact constant instead of writing its
// own { locale: 'ar' } literal, so there is never a place that silently
// falls out of sync.
//
// Usage:  Model.find(filter).sort({ name: 1 }).collation(ARABIC_NAME_COLLATION)

const ARABIC_NAME_COLLATION = { locale: 'ar' };

module.exports = { ARABIC_NAME_COLLATION };