'use strict';
const router = require('express').Router();
const { pool, transaction } = require('../db');
const { requiredString, optionalString, positiveId, queryText } = require('../lib/validate');
const { pagination } = require('../lib/pagination');
const { notFound, conflict } = require('../lib/errors');
function payload(body) {
  return {
    titulo: requiredString(body.titulo, 'Título', 160),
    autor: requiredString(body.autor, 'Autor', 120),
    isbn: requiredString(body.isbn, 'ISBN', 22),
    categoria: optionalString(body.categoria, 'Categoria', 80)
  };
}
router.get('/', async (req, res) => {
  const q = queryText(req.query.q);
  const { limit, offset, page } = pagination(req.query);
  const like = `%${q}%`;
  const [rows] = await pool.execute(`
    SELECT l.id_livro, l.titulo, l.autor, l.isbn, l.categoria,
           COUNT(e.id_exemplar) AS total_exemplares,
           COALESCE(SUM(e.situacao = 'disponivel'), 0) AS disponiveis,
           COALESCE(SUM(e.situacao = 'emprestado'), 0) AS emprestados,
           COALESCE(SUM(e.situacao = 'reservado'), 0) AS reservados
    FROM livro l LEFT JOIN exemplar e ON e.id_livro=l.id_livro
    WHERE (l.titulo LIKE ? OR l.autor LIKE ? OR l.isbn LIKE ?)
    GROUP BY l.id_livro, l.titulo, l.autor, l.isbn, l.categoria
    ORDER BY l.titulo LIMIT ? OFFSET ?`, [like, like, like, limit, offset]);
  res.json({ page, limit, dados: rows });
});
router.get('/:id', async (req, res) => {
  const id = positiveId(req.params.id);
  const [rows] = await pool.execute('SELECT * FROM livro WHERE id_livro=?', [id]);
  if (!rows.length) throw notFound('Livro não encontrado.');
  const [exemplares] = await pool.execute('SELECT id_exemplar, tombo, situacao FROM exemplar WHERE id_livro=? ORDER BY id_exemplar', [id]);
  res.json({ ...rows[0], exemplares });
});
// Criação atômica da obra e do primeiro exemplar.
router.post('/com-exemplar', async (req, res) => {
  const value = payload(req.body);
  const tombo = requiredString(req.body.tombo, 'Tombo', 40);
  const ids = await transaction(async connection => {
    const [sets] = await connection.query(
      'CALL sp_cadastrar_livro_com_exemplar(?,?,?,?,?)',
      [value.titulo, value.autor, value.isbn, value.categoria || '', tombo]
    );
    const row = sets?.[0]?.[0];
    return { id_livro: row.id_livro, id_exemplar: row.id_exemplar };
  });
  res.status(201).json({ mensagem: 'Livro e exemplar cadastrados.', ...ids });
});
router.post('/', async (req, res) => {
  const value = payload(req.body);
  const [result] = await pool.execute('INSERT INTO livro (titulo,autor,isbn,categoria) VALUES (?,?,?,?)', Object.values(value));
  res.status(201).json({ mensagem: 'Livro cadastrado.', id_livro: result.insertId });
});
router.put('/:id', async (req, res) => {
  const id = positiveId(req.params.id);
  const value = payload(req.body);
  const [result] = await pool.execute('UPDATE livro SET titulo=?,autor=?,isbn=?,categoria=? WHERE id_livro=?', [...Object.values(value), id]);
  if (!result.affectedRows) throw notFound('Livro não encontrado.');
  res.json({ mensagem: 'Livro atualizado.', id_livro: id });
});
router.delete('/:id', async (req, res) => {
  const id = positiveId(req.params.id);
  const [copies] = await pool.execute('SELECT COUNT(*) AS total FROM exemplar WHERE id_livro=?', [id]);
  if (copies[0].total > 0) throw conflict('Remova os exemplares sem histórico antes de excluir o livro.');
  const [result] = await pool.execute('DELETE FROM livro WHERE id_livro=?', [id]);
  if (!result.affectedRows) throw notFound('Livro não encontrado.');
  res.json({ mensagem: 'Livro excluído.' });
});
module.exports = router;
