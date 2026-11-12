'use strict';
require('dotenv').config();
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
const jwtSecret = process.env.JWT_SECRET || '';
if (jwtSecret.length < 32) throw new Error('Configure JWT_SECRET com pelo menos 32 caracteres no arquivo .env.');
const timeZone = process.env.APP_TIMEZONE || 'America/Sao_Paulo';
try { new Intl.DateTimeFormat('pt-BR', { timeZone }); } catch { throw new Error('APP_TIMEZONE inválido.'); }
const config = {
  port,
  isProduction: process.env.NODE_ENV === 'production',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  timeZone,
  allowedOrigins: (process.env.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean),
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'biblioteca',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
    decimalNumbers: true
  }
};
module.exports = config;
