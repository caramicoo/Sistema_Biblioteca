'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validarEmprestimo, validarNovaReserva, situacaoAposDevolucao } = require('../src/lib/regras');
const base = { leitorAtivo:true, possuiAtraso:false, exemplarEmprestado:false, situacaoExemplar:'disponivel', reservaAtiva:null, leitorId:1 };
test('RF05/RN01 empréstimo normal permitido', () => assert.doesNotThrow(() => validarEmprestimo(base)));
test('RN01 exemplar já emprestado é bloqueado', () => assert.throws(() => validarEmprestimo({...base,exemplarEmprestado:true}), /RN01/));
test('RN02 leitor com atraso é bloqueado', () => assert.throws(() => validarEmprestimo({...base,possuiAtraso:true}), /RN02/));
test('RN01 reserva de outro leitor bloqueia a retirada', () => assert.throws(() => validarEmprestimo({...base,situacaoExemplar:'reservado',reservaAtiva:{id_leitor:2}}), /RN01/));
test('RN01 reserva do próprio leitor permite retirada', () => assert.doesNotThrow(() => validarEmprestimo({...base,situacaoExemplar:'reservado',reservaAtiva:{id_leitor:1}})));
test('RN06 impede reserva duplicada do mesmo leitor', () => assert.throws(() => validarNovaReserva({id_leitor:1},1), /RN06/));
test('fila de reserva indefinida bloqueia segunda reserva', () => assert.throws(() => validarNovaReserva({id_leitor:2},1), /fila de reservas/));
test('RN05 devolução mantém reserva ou libera exemplar', () => {
  assert.equal(situacaoAposDevolucao(true),'reservado');
  assert.equal(situacaoAposDevolucao(false),'disponivel');
});
