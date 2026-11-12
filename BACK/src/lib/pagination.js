'use strict';
const { badRequest } = require('./errors');
function pagination(query) {
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(page) || page < 1 || page > 100000) throw badRequest('Paginação inválida (limit entre 1 e 100; page >= 1).');
  return { limit, offset: (page-1)*limit, page };
}
module.exports = { pagination };
