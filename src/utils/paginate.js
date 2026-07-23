// src/utils/paginate.js
// Reusable pagination helper for Mongoose queries.

/**
 * @param {Object} query     - Mongoose Query object (before .exec())
 * @param {Object} reqQuery  - req.query from Express (page, limit)
 * @returns { data, pagination }
 */
const paginate = async (model, filter = {}, options = {}) => {
  const page  = Math.max(1, parseInt(options.page)  || 1);
  const limit = Math.min(100, parseInt(options.limit) || 20);
  const skip  = (page - 1) * limit;

  let query = model
    .find(filter)
    .sort(options.sort || { createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate(options.populate || []);

  // Optional — only applied when a caller explicitly passes it (e.g. sorting
  // Arabic names correctly). Every existing caller that doesn't pass this
  // keeps its exact previous behavior (plain binary/code-point sort).
  if (options.collation) query = query.collation(options.collation);

  const [data, total] = await Promise.all([
    query.lean(),
    model.countDocuments(filter),
  ]);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  };
};

module.exports = { paginate };