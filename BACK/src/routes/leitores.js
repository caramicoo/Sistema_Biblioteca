'use strict';
const router = require('express').Router();
const { pool } = require('../db');
const { requiredString, positiveId, booleanField, queryText } = require('../lib/validate');
const { pagination } = require('../lib/pagination');
const { notFound, conflict } = require('../lib/errors');
function payload(body) {
  return {
    nome: requiredString(body.nome, 'Nome', 120),
    identificacao: requiredString(body.identificacao, 'Identificação', 40),
    contato: requiredString(body.contato, 'Contato', 160)
  };
}
router.get('/', async (req, res) => {
  const q = queryText(req.query.q);
  const { limit, offset, page } = pagination(req.query);
  const like = `%${q}%`;
  const [rows] = await pool.execute('SELECT id_leitor,nome,identificacao,contato,ativo FROM leitor WHERE nome LIKE ? OR identificacao LIKE ? ORDER BY nome LIMIT ? OFFSET ?', [like, like, limit, offset]);
  res.json({ page, limit, dados: rows });
});
router.get('/:id', async (req, res) => {
  const [rows] = await pool.execute('SELECT id_leitor,nome,identificacao,contato,ativo FROM leitor WHERE id_leitor=?', [positiveId(req.params.id)]);
  if (!rows.length) throw notFound('Leitor não encontrado.');
  res.json(rows[0]);
});
router.post('/', async (req, res) => {
  const value = payload(req.body);
  const [result] = await pool.execute('INSERT INTO leitor (nome,identificacao,contato) VALUES (?,?,?)', Object.values(value));
  res.status(201).json({ mensagem: 'Leitor cadastrado.', id_leitor: result.insertId });
});
router.put('/:id', async (req, res) => {
  const id = positiveId(req.params.id);
  const value = payload(req.body);
  const ativo = req.body.ativo === undefined ? null : booleanField(req.body.ativo);
  if (ativo === false) {
    const [loans] = await pool.execute('SELECT COUNT(*) AS total FROM emprestimo WHERE id_leitor=? AND data_devolucao IS NULL', [id]);
    if (loans[0].total) throw conflict('Não é possível desativar leitor com empréstimos abertos.');
  }
  const [result] = await pool.execute('UPDATE leitor SET nome=?,identificacao=?,contato=?,ativo=COALESCE(?, ativo) WHERE id_leitor=?', [...Object.values(value), ativo, id]);
  if (!result.affectedRows) throw notFound('Leitor não encontrado.');
  res.json({ mensagem: 'Leitor atualizado.' });
});
module.exports = router;
