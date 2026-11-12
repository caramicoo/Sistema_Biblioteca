'use strict';
const { randomBytes, scrypt: scryptCb, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(scryptCb);
async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) throw new Error('Senha deve ter de 10 a 200 caracteres.');
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
  const [kind, salt, hash] = storedHash.split('$');
  if (kind !== 'scrypt' || !/^[0-9a-f]{32}$/.test(salt || '') || !/^[0-9a-f]{128}$/.test(hash || '')) return false;
  const computed = await scrypt(password, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(Buffer.from(hash, 'hex'), computed);
}
module.exports = { hashPassword, verifyPassword };
