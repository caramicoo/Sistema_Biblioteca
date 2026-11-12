'use strict';
const { conflict } = require('./errors');
/** Regras centrais sem acesso ao banco: fáceis de revisar conforme os diagramas. */
function validarEmprestimo({ leitorAtivo, possuiAtraso, exemplarEmprestado, situacaoExemplar, reservaAtiva, leitorId }) {
  if (!leitorAtivo) throw conflict('Leitor inexistente ou inativo.');
  if (possuiAtraso) throw conflict('RN02: leitor possui empréstimo vencido e não pode retirar outro livro.');
  if (exemplarEmprestado || situacaoExemplar === 'emprestado') throw conflict('RN01: exemplar já está emprestado.');
  if (reservaAtiva && reservaAtiva.id_leitor !== leitorId) throw conflict('RN01: exemplar reservado para outro leitor.');
  if (!reservaAtiva && situacaoExemplar === 'reservado') throw conflict('Situação inconsistente: exemplar reservado sem reserva ativa.');
}
function validarNovaReserva(reservaAtiva, leitorId) {
  if (reservaAtiva && reservaAtiva.id_leitor === leitorId) throw conflict('RN06: leitor já possui reserva ativa desse exemplar.');
  if (reservaAtiva) throw conflict('Já existe uma reserva ativa para este exemplar. A fila de reservas ainda não foi definida.');
}
const situacaoAposDevolucao = temReservaAtiva => temReservaAtiva ? 'reservado' : 'disponivel';
module.exports = { validarEmprestimo, validarNovaReserva, situacaoAposDevolucao };
