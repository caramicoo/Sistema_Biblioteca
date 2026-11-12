'use strict';
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const config = require('../config');
const { HttpError } = require('./errors');
async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return next(new HttpError(401, 'Informe token Bearer.', 'NAO_AUTENTICADO'));
  try {
    const payload = jwt.verify(match[1], config.jwtSecret, { algorithms: ['HS256'] });
    const [rows] = await pool.execute('SELECT id_funcionario, nome, login FROM funcionario WHERE id_funcionario = ? AND ativo = 1', [payload.sub]);
    if (!rows.length) return next(new HttpError(401, 'Funcionário não autorizado ou desativado.', 'NAO_AUTENTICADO'));
    req.funcionario = rows[0];
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') return next(new HttpError(401, 'Token inválido ou expirado.', 'TOKEN_INVALIDO'));
    return next(error);
  }
}
module.exports = { requireAuth };
