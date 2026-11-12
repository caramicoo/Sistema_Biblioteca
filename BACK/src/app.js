'use strict';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { pool } = require('./db');
const { requireAuth } = require('./lib/auth');
const { errorHandler, HttpError } = require('./lib/errors');
const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin(origin, callback) {
  if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new HttpError(403, 'Origem não autorizada pelo CORS.', 'ORIGEM_NAO_AUTORIZADA'));
}}));
app.use(express.json({ limit: '30kb' }));
app.get('/api/saude', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', servico: 'Sistema de Biblioteca API' });
});
app.use('/api/auth', require('./routes/auth'));
app.use('/api/livros', requireAuth, require('./routes/livros'));
app.use('/api/exemplares', requireAuth, require('./routes/exemplares'));
app.use('/api/leitores', requireAuth, require('./routes/leitores'));
app.use('/api/emprestimos', requireAuth, require('./routes/emprestimos'));
app.use('/api/reservas', requireAuth, require('./routes/reservas'));
app.use((req,res) => res.status(404).json({ erro: 'Rota não encontrada.', codigo: 'ROTA_INEXISTENTE' }));
app.use(errorHandler);
module.exports = app;
