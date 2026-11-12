'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { requiredString, positiveId, isoDate, todayInTimeZone } = require('../src/lib/validate');
const { hashPassword, verifyPassword } = require('../src/lib/password');
test('valida campos obrigatórios', () => {
  assert.equal(requiredString('  Machado de Assis ', 'Autor'), 'Machado de Assis');
  assert.throws(() => requiredString(' ', 'Nome'), /1 e/);
});
test('recusa IDs inválidos', () => {
  assert.equal(positiveId('42'), 42);
  assert.throws(() => positiveId('0'), /inválido/);
  assert.throws(() => positiveId('abc'), /inválido/);
});
test('valida datas no formato do MySQL', () => {
  assert.equal(isoDate('2026-11-08'), '2026-11-08');
  assert.throws(() => isoDate('2026-02-30'), /inválida/);
  assert.throws(() => isoDate('08/11/2026'), /formato/);
});
test('usa fuso do projeto ao calcular a data', () => {
  assert.match(todayInTimeZone('America/Sao_Paulo'), /^\d{4}-\d{2}-\d{2}$/);
});
test('scrypt armazena apenas hash salgado e valida senha', async () => {
  const hash1 = await hashPassword('SenhaTesteMuitoForte123');
  const hash2 = await hashPassword('SenhaTesteMuitoForte123');
  assert.notEqual(hash1, hash2);
  assert.ok(!hash1.includes('SenhaTeste'));
  assert.equal(await verifyPassword('SenhaTesteMuitoForte123', hash1), true);
  assert.equal(await verifyPassword('SenhaIncorreta', hash1), false);
});
