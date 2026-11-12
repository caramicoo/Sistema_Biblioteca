'use strict';
const app = require('./app');
const config = require('./config');
const { pool } = require('./db');
async function main() {
  await pool.query('SELECT 1');
  const server = app.listen(config.port, () => console.log(`API da Biblioteca disponível em http://localhost:${config.port}`));
  async function shutdown() {
    server.close(async () => { await pool.end(); process.exit(0); });
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
main().catch(error => {
  console.error('Não foi possível iniciar a API. Verifique MySQL e arquivo .env:', error.message);
  process.exitCode = 1;
  pool.end().catch(() => {});
});
