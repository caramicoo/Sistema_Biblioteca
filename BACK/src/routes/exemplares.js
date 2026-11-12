'use strict';
const router = require('express').Router();
const { pool } = require('../db');
const { positiveId, requiredString } = require('../lib/validate');
const { pagination } = require('../lib/pagination');
const { badRequest, notFound, conflict } = require('../lib/errors');
router.get('/', async (req, res) => {
  const { limit, offset, page } = pagination(req.query);
  const filters = [];
  const params = [];
  if (req.query.livro_id !== undefined) {
    filters.push('e.id_livro=?'); params.push(positiveId(req.query.livro_id, 'livro_id'));
  }
  if (req.query.situacao !== undefined) {
    if (!['disponivel','emprestado','reservado'].includes(req.query.situacao)) throw badRequest('Situação inválida.');
    filters.push('e.situacao=?'); params.push(req.query.situacao);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [rows] = await pool.execute(`SELECT e.id_exemplar,e.id_livro,e.tombo,e.situacao,l.titulo
      FROM exemplar e JOIN livro l ON l.id_livro=e.id_livro ${where}
      ORDER BY e.id_exemplar LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ page, limit, dados: rows });
});
router.get('/:id', async (req, res) => {
  const [rows] = await pool.execute('SELECT e.*,l.titulo FROM exemplar e JOIN livro l ON l.id_livro=e.id_livro WHERE e.id_exemplar=?', [positiveId(req.params.id)]);
  if (!rows.length) throw notFound('Exemplar não encontrado.');
  res.json(rows[0]);
});
router.post('/', async (req, res) => {
  const livroId = positiveId(req.body.id_livro, 'id_livro');
  const tombo = requiredString(req.body.tombo, 'Tombo', 40);
  const [exists] = await pool.execute('SELECT id_livro FROM livro WHERE id_livro=?', [livroId]);
  if (!exists.length) throw notFound('Livro não encontrado.');
  const [result] = await pool.execute('INSERT INTO exemplar (id_livro,tombo) VALUES (?,?)', [livroId, tombo]);
  res.status(201).json({ mensagem: 'Exemplar cadastrado.', id_exemplar: result.insertId, situacao: 'disponivel' });
});
router.put('/:id', async (req, res) => {
  const id = positiveId(req.params.id);
  const tombo = requiredString(req.body.tombo, 'Tombo', 40);
  const [result] = await pool.execute('UPDATE exemplar SET tombo=? WHERE id_exemplar=?', [tombo,id]);
  if (!result.affectedRows) throw notFound('Exemplar não encontrado.');
  res.json({ mensagem: 'Tombo atualizado.' });
});
router.delete('/:id', async (req, res) => {
  const id = positiveId(req.params.id);
  const [rows] = await pool.execute('SELECT situacao FROM exemplar WHERE id_exemplar=?', [id]);
  if (!rows.length) throw notFound('Exemplar não encontrado.');
  if (rows[0].situacao !== 'disponivel') throw conflict('Exemplar não está disponível para exclusão.');
  // FK RESTRICT protege histórico de empréstimos e reservas.
  await pool.execute('DELETE FROM exemplar WHERE id_exemplar=?', [id]);
  res.json({ mensagem: 'Exemplar excluído.' });
});
module.exports = router;
