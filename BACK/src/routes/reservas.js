'use strict';
const router = require('express').Router();
const { pool, transaction } = require('../db');
const config = require('../config');
const { positiveId, todayInTimeZone } = require('../lib/validate');
const { pagination } = require('../lib/pagination');
const { badRequest, notFound, conflict } = require('../lib/errors');
const { validarNovaReserva } = require('../lib/regras');
const today = () => todayInTimeZone(config.timeZone);
router.get('/', async (req, res) => {
  const situacao = req.query.situacao;
  if (situacao !== undefined && !['ativa','atendida','cancelada'].includes(situacao)) throw badRequest('Situação de reserva inválida.');
  const { limit, offset, page } = pagination(req.query);
  const where = situacao ? 'WHERE r.situacao=?' : '';
  const [rows] = await pool.execute(`SELECT r.id_reserva,r.id_leitor,le.nome AS leitor,r.id_exemplar,e.tombo,
    li.titulo,r.id_funcionario,r.data_reserva,r.situacao FROM reserva r
    JOIN leitor le ON le.id_leitor=r.id_leitor JOIN exemplar e ON e.id_exemplar=r.id_exemplar
    JOIN livro li ON li.id_livro=e.id_livro ${where}
    ORDER BY r.id_reserva DESC LIMIT ? OFFSET ?`, [...(situacao ? [situacao] : []), limit, offset]);
  res.json({ page, limit, dados: rows });
});
router.get('/:id', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM reserva WHERE id_reserva=?', [positiveId(req.params.id)]);
  if (!rows.length) throw notFound('Reserva não encontrada.');
  res.json(rows[0]);
});
router.post('/', async (req, res) => {
  const idLeitor = positiveId(req.body.id_leitor, 'id_leitor');
  const idExemplar = positiveId(req.body.id_exemplar, 'id_exemplar');
  const date = today();
  const id = await transaction(async connection => {
    const [copies] = await connection.execute('SELECT id_exemplar,situacao FROM exemplar WHERE id_exemplar=? FOR UPDATE', [idExemplar]);
    if (!copies.length) throw notFound('Exemplar não encontrado.');
    const [readers] = await connection.execute('SELECT id_leitor,ativo FROM leitor WHERE id_leitor=? FOR UPDATE', [idLeitor]);
    if (!readers.length || !readers[0].ativo) throw conflict('Leitor inexistente ou inativo.');
    const [active] = await connection.execute("SELECT id_reserva,id_leitor FROM reserva WHERE id_exemplar=? AND situacao='ativa' FOR UPDATE", [idExemplar]);
    validarNovaReserva(active[0] || null, idLeitor);
    const [result] = await connection.execute(`INSERT INTO reserva
      (id_leitor,id_exemplar,id_funcionario,data_reserva,situacao)
      VALUES (?,?,?,?,'ativa')`, [idLeitor,idExemplar,req.funcionario.id_funcionario,date]);
    if (copies[0].situacao === 'disponivel') {
      await connection.execute("UPDATE exemplar SET situacao='reservado' WHERE id_exemplar=?", [idExemplar]);
    }
    return result.insertId;
  });
  res.status(201).json({ mensagem: 'Reserva registrada pelo funcionário.', id_reserva: id, data_reserva: date });
});
router.put('/:id/cancelamento', async (req, res) => {
  const idReserva = positiveId(req.params.id);
  const situation = await transaction(async connection => {
    const [reference] = await connection.execute('SELECT id_exemplar FROM reserva WHERE id_reserva=?', [idReserva]);
    if (!reference.length) throw notFound('Reserva não encontrada.');
    const exemplarId = reference[0].id_exemplar;
    await connection.execute('SELECT id_exemplar FROM exemplar WHERE id_exemplar=? FOR UPDATE', [exemplarId]);
    const [reservations] = await connection.execute('SELECT id_reserva,situacao FROM reserva WHERE id_reserva=? FOR UPDATE', [idReserva]);
    if (reservations[0].situacao !== 'ativa') throw conflict('Somente reservas ativas podem ser canceladas.');
    await connection.execute("UPDATE reserva SET situacao='cancelada' WHERE id_reserva=?", [idReserva]);
    const [loans] = await connection.execute('SELECT id_emprestimo FROM emprestimo WHERE id_exemplar=? AND data_devolucao IS NULL', [exemplarId]);
    const next = loans.length ? 'emprestado' : 'disponivel';
    await connection.execute('UPDATE exemplar SET situacao=? WHERE id_exemplar=?', [next,exemplarId]);
    return next;
  });
  res.json({ mensagem: 'Reserva cancelada.', situacao_exemplar: situation });
});
module.exports = router;
