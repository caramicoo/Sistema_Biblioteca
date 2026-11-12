'use strict';
const { badRequest } = require('./errors');
function requiredString(value, label, maxLength=160) {
  if (typeof value !== 'string') throw badRequest(`${label} deve ser texto.`);
  const result = value.trim();
  if (!result || result.length > maxLength) throw badRequest(`${label} deve ter entre 1 e ${maxLength} caracteres.`);
  return result;
}
function optionalString(value, label, maxLength=160) {
  if (value === undefined || value === null || value === '') return null;
  return requiredString(value, label, maxLength);
}
function positiveId(value, label='ID') {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw badRequest(`${label} inválido.`);
  return parsed;
}
function booleanField(value, label='Ativo') {
  if (typeof value !== 'boolean') throw badRequest(`${label} deve ser true ou false.`);
  return value;
}
function isoDate(value, label='Data') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest(`${label} deve estar no formato AAAA-MM-DD.`);
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m-1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m-1 || date.getUTCDate() !== d) throw badRequest(`${label} inválida.`);
  return value;
}
function todayInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function queryText(value, max=120) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length > max) throw badRequest('Texto de pesquisa inválido.');
  return value.trim();
}
module.exports = { requiredString, optionalString, positiveId, booleanField, isoDate, todayInTimeZone, queryText };
