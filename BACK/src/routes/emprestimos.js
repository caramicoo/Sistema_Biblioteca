Attempting to perform the InitializeDefaultDrives operation on the 'FileSystem' provider failed.
'use strict';
const router = require('express').Router();
const { pool, transaction } = require('../db');
const config = require('../config');
const { positiveId, isoDate, todayInTimeZone } = require('../lib/validate');
const { pagination } = require('../lib/pagination');
const { badRequest, notFound, conflict } = require('../lib/errors');
const { validarEmprestimo } = require('../lib/regras');
const today = () => todayInTimeZone(config.timeZone);
const detailSql = `SELECT em.id_emprestimo,em.id_leitor,le.nome AS leitor,em.id_exemplar,
  e.tombo,li.titulo,em.id_funcionario_retirada,em.id_funcionario_devolucao,
  em.data_retirada,em.data_prevista,em.data_devolucao,
  fn_situacao_emprestimo(em.data_prevista, em.data_devolucao, ?) AS situacao,
  fn_dias_atraso(em.data_prevista, ?) AS dias_atraso
  FROM emprestimo em JOIN leitor le ON le.id_leitor=em.id_leitor
  JOIN exemplar e ON e.id_exemplar=em.id_exemplar JOIN livro li ON li.id_livro=e.id_livro`;
router.get('/vencidos', async (req, res) => {
  const date = today();
  const { limit, offset, page } = pagination(req.query);
  const [rows] = await pool.execute(`${detailSql} WHERE em.data_devolucao IS NULL AND em.data_prevista < ? ORDER BY em.data_prevista ASC LIMIT ? OFFSET ?`, [date,date,date,limit,offset]);
  res.json({ data_consulta: date, page, limit, dados: rows });
});
router.get('/', async (req, res) => {
  const date = today();
  const { limit, offset, page } = pagination(req.query);
  const situacao = req.query.situacao;
  if (situacao !== undefined && !['aberto','vencido','devolvido'].includes(situacao)) throw badRequest('Situa��o inv�lida.');
  let where = '';
  let params = [date,date];
  if (situacao === 'devolvido') where = 'WHERE em.data_devolucao IS NOT NULL';
  if (situacao === 'vencido') { where = 'WHERE em.data_devolucao IS NULL AND em.data_prevista < ?'; params.push(date); }
  if (situacao === 'aberto') where = 'WHERE em.data_devolucao IS NULL';
  const [rows] = await pool.execute(`${detailSql} ${where} ORDER BY em.id_emprestimo DESC LIMIT ? OFFSET ?`, [...params,limit,offset]);
  res.json({ page, limit, dados: rows });
});
router.get('/:id', async (req, res) => {
  const date = today();
  const [rows] = await pool.execute(`${detailSql} WHERE em.id_emprestimo=?`, [date,date,positiveId(req.params.id)]);
  if (!rows.length) throw notFound('Empr�stimo n�o encontrado.');
  res.json(rows[0]);
});
router.post('/', async (req, res) => {
  const idLeitor = positiveId(req.body.id_leitor, 'id_leitor');
  const idExemplar = positiveId(req.body.id_exemplar, 'id_exemplar');
  const dataPrevista = isoDate(req.body.data_prevista, 'Prazo de devolu��o');
  const date = today();
  if (dataPrevista < date) throw badRequest('O prazo de devolu��o n�o pode ser anterior a hoje.');
  const id = await transaction(async connection => {
    // Bloqueio do exemplar impede empr�stimo e reserva concorrentes.
    const [copies] = await connection.execute('SELECT id_exemplar, situacao FROM exemplar WHERE id_exemplar=? FOR UPDATE', [idExemplar]);
    if (!copies.length) throw notFound('Exemplar n�o encontrado.');
    const [readers] = await connection.execute('SELECT id_leitor, ativo FROM leitor WHERE id_leitor=? FOR UPDATE', [idLeitor]);
    if (!readers.length || !readers[0].ativo) throw conflict('Leitor inexistente ou inativo.');
    const [late] = await connection.execute('SELECT COUNT(*) AS total FROM emprestimo WHERE id_leitor=? AND data_devolucao IS NULL AND data_prevista < ?', [idLeitor, date]);
    const [open] = await connection.execute('SELECT id_emprestimo FROM emprestimo WHERE id_exemplar=? AND data_devolucao IS NULL', [idExemplar]);
    const [reservations] = await connection.execute("SELECT id_reserva,id_leitor FROM reserva WHERE id_exemplar=? AND situacao='ativa' FOR UPDATE", [idExemplar]);
    validarEmprestimo({
      leitorAtivo: true, possuiAtraso: late[0].total > 0, exemplarEmprestado: open.length > 0,
      situacaoExemplar: copies[0].situacao, reservaAtiva: reservations[0] || null, leitorId: idLeitor
    });
    if (reservations.length) {
      await connection.execute("UPDATE reserva SET situacao='atendida' WHERE id_reserva=?", [reservations[0].id_reserva]);
    }
    const [result] = await connection.execute(`INSERT INTO emprestimo
      (id_leitor,id_exemplar,id_funcionario_retirada,data_retirada,data_prevista)
      VALUES (?,?,?,?,?)`, [idLeitor,idExemplar,req.funcionario.id_funcionario,date,dataPrevista]);
    await connection.execute("UPDATE exemplar SET situacao='emprestado' WHERE id_exemplar=?", [idExemplar]);
    return result.insertId;
  });
  res.status(201).json({ mensagem: 'Empr�stimo registrado.', id_emprestimo: id, data_retirada: date, data_prevista: dataPrevista });
});
router.put('/:id/devolucao', async (req, res) => {
  const loanId = positiveId(req.params.id);
  const date = today();
  const result = await transaction(async connection => {
    // Primeiro identifica o exemplar; depois bloqueia o exemplar e o empr�stimo (ordem consistente).
    const [reference] = await connection.execute('SELECT id_exemplar FROM emprestimo WHERE id_emprestimo=?', [loanId]);
    if (!reference.length) throw notFound('Empr�stimo n�o encontrado.');
    const exemplarId = reference[0].id_exemplar;
    await connection.execute('SELECT id_exemplar FROM exemplar WHERE id_exemplar=? FOR UPDATE', [exemplarId]);
    const [loans] = await connection.execute('SELECT id_emprestimo,data_devolucao FROM emprestimo WHERE id_emprestimo=? FOR UPDATE', [loanId]);
    if (loans[0].data_devolucao) throw conflict('O empr�stimo j� foi devolvido.');
    const [sets] = await connection.query(
      'CALL sp_registrar_devolucao(?,?,?)',
      [loanId, req.funcionario.id_funcionario, date]
    );
    return sets?.[0]?.[0]?.situacao_exemplar;
  });
  res.json({ mensagem: 'Devolu��o registrada.', data_devolucao: date, situacao_exemplar: result });
});
module.exports = router;

