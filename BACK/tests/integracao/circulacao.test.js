Attempting to perform the InitializeDefaultDrives operation on the 'FileSystem' provider failed.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const mysql = require('mysql2/promise');
const { hashPassword } = require('../../src/lib/password');
const { todayInTimeZone } = require('../../src/lib/validate');

test('Fluxos da biblioteca com Express e MySQL', async t => {
  const database = 'biblioteca_teste_' + randomBytes(8).toString('hex');
  const admin = await mysql.createConnection({
    host: process.env.MYSQL_TEST_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_TEST_PORT || 3306),
    user: process.env.MYSQL_TEST_USER || 'root',
    password: process.env.MYSQL_TEST_PASSWORD || '',
    multipleStatements: true
  });
  let criado = false;
  let pool, server;
  t.after(async () => {
    try {
      if (server?.listening) await new Promise(resolve => server.close(resolve));
      if (pool) await pool.end();
      if (criado) await admin.query('DROP DATABASE ??', [database]);
    } finally {
      await admin.end();
    }
  });

  const schema = await readFile(path.join(__dirname, '../../../DATABASE/01_schema.sql'), 'utf8');
  const partes = schema.split(/^USE biblioteca;[ \t]*\r?$/m);
  assert.equal(partes.length, 2, 'O esquema deve separar a sele��o do banco da defini��o das tabelas.');
  assert.doesNotMatch(partes[1], /^\s*(?:USE\s|(?:CREATE|DROP)\s+DATABASE\b)/im);
  await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
  criado = true;
  await admin.query('USE ??', [database]);
  await admin.query(partes[1]);
  const rotinas = await readFile(path.join(__dirname, '../../../DATABASE/03_rotinas_biblioteca.sql'), 'utf8');
  // DELIMITER � um comando do cliente Workbench; para o driver, cada bloco $$ � enviado separadamente.
  for (const bloco of rotinas.replace(/USE\s+biblioteca\s*;/i, '')
    .replace(/^\s*DELIMITER\s+[^\r\n]+\s*$/gim, '').split('$$')) {
    const sql = bloco.trim();
    if (sql) await admin.query(sql);
  }
  const [tabelas] = await admin.query('SHOW TABLES');
  assert.equal(tabelas.length, 7);

  Object.assign(process.env, {
    DB_NAME: database, DB_HOST: admin.config.host, DB_PORT: String(admin.config.port),
    DB_USER: admin.config.user, DB_PASSWORD: process.env.MYSQL_TEST_PASSWORD || '',
    JWT_SECRET: randomBytes(32).toString('hex'), CORS_ORIGINS: '', APP_TIMEZONE: 'America/Sao_Paulo'
  });
  const app = require('../../src/app');
  pool = require('../../src/db').pool;
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origem = 'http://127.0.0.1:' + server.address().port;
  const senha = randomBytes(20).toString('hex');
  const login = 'funcionario.teste';
  await admin.execute('INSERT INTO funcionario (nome,login,senha_hash) VALUES (?,?,?)',
    ['Funcion�rio de teste', login, await hashPassword(senha)]);
  let token;
  async function api(method, rota, status, body, origin = origem) {
    const headers = { Origin: origin };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(origem + '/api' + rota, { method, headers, body: JSON.stringify(body) });
    assert.equal(response.status, status, method + ' ' + rota);
    return response.json();
  }

  await t.test('Interface, sa�de e login pela mesma origem', async () => {
    const html = await fetch(origem);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /id="loginForm"/);
    const atalho = await fetch(origem + '/Abrir_Diretamente.html', { redirect: 'manual' });
    assert.equal(atalho.status, 302);
    assert.equal(atalho.headers.get('location'), '/');
    assert.equal((await api('GET', '/saude', 200)).status, 'ok');
    await api('GET', '/leitores', 401);
    await api('POST', '/auth/login', 403, { login, senha }, 'https://outra-origem.invalid');
    await api('POST', '/auth/login', 401, { login, senha: randomBytes(20).toString('hex') });
    const sessao = await api('POST', '/auth/login', 200, { login, senha });
    token = sessao.token;
    assert.ok(token);
    assert.equal((await api('GET', '/auth/me', 200)).login, login);
  });

  const obra = { titulo: 'Obra de teste', autor: 'Autora', isbn: 'ISBN-001', categoria: 'Literatura', tombo: 'T-001' };
  const { id_livro, id_exemplar } = await api('POST', '/livros/com-exemplar', 201, obra);
  const exemplarExtra = await api('POST', '/exemplares', 201, { id_livro, tombo: 'T-002' });
  const leitor = async nome => (await api('POST', '/leitores', 201,
    { nome, identificacao: nome, contato: nome + '@example.invalid' })).id_leitor;
  const primeiro = await leitor('Ana');
  const segundo = await leitor('Bia');
  const prazo = todayInTimeZone('America/Sao_Paulo');

  await t.test('Cadastros, pagina��o e revers�o de cadastro com tombo duplicado', async () => {
    await api('POST', '/livros/com-exemplar', 409, { ...obra, isbn: 'ISBN-duplicado' });
    assert.equal((await api('GET', '/livros?q=ISBN-duplicado', 200)).dados.length, 0);
    assert.equal((await api('GET', '/livros/' + id_livro, 200)).exemplares.length, 2);
    for (const rota of ['/livros', '/exemplares', '/leitores', '/emprestimos', '/reservas', '/emprestimos/vencidos']) {
      const pagina = await api('GET', rota + '?limit=1&page=2', 200);
      assert.equal(pagina.page, 2);
      assert.ok(pagina.dados.length <= 1);
    }
    assert.equal((await api('GET', '/leitores?limit=1&page=2', 200)).dados[0].nome, 'Bia');
  });

  const emprestar = (id_leitor, exemplar, status) => api('POST', '/emprestimos', status,
    { id_leitor, id_exemplar: exemplar, data_prevista: prazo });
  const situacao = async () => (await api('GET', '/exemplares/' + id_exemplar, 200)).situacao;
  await t.test('Reserva durante o empr�stimo, devolu��o e retirada pelo titular', async () => {
    const retirada = await emprestar(primeiro, id_exemplar, 201);
    await emprestar(segundo, id_exemplar, 409);
    const pedido = { id_leitor: segundo, id_exemplar };
    const reserva = await api('POST', '/reservas', 201, pedido);
    await api('POST', '/reservas', 409, pedido);
    assert.equal(await situacao(), 'emprestado');
    await api('PUT', '/emprestimos/' + retirada.id_emprestimo + '/devolucao', 200);
    assert.equal(await situacao(), 'reservado');
    await emprestar(primeiro, id_exemplar, 409);
    const proximo = await emprestar(segundo, id_exemplar, 201);
    assert.equal((await api('GET', '/reservas/' + reserva.id_reserva, 200)).situacao, 'atendida');
    await api('PUT', '/emprestimos/' + proximo.id_emprestimo + '/devolucao', 200);
    assert.equal(await situacao(), 'disponivel');
    const cancelavel = await api('POST', '/reservas', 201, pedido);
    await api('PUT', '/reservas/' + cancelavel.id_reserva + '/cancelamento', 200);
    assert.equal(await situacao(), 'disponivel');
  });

  await t.test('Consulta de vencidos e bloqueio de nova retirada at� a devolu��o', async () => {
    const retirada = await emprestar(primeiro, id_exemplar, 201);
    await admin.execute("UPDATE emprestimo SET data_retirada='2000-01-01', data_prevista='2000-01-02' WHERE id_emprestimo=?",
      [retirada.id_emprestimo]);
    const vencidos = await api('GET', '/emprestimos/vencidos', 200);
    assert.deepEqual(vencidos.dados.map(l => l.id_emprestimo), [retirada.id_emprestimo]);
    assert.ok(vencidos.dados[0].dias_atraso > 0);
    await emprestar(primeiro, exemplarExtra.id_exemplar, 409);
    await api('PUT', '/emprestimos/' + retirada.id_emprestimo + '/devolucao', 200);
    assert.equal((await api('GET', '/emprestimos/vencidos', 200)).dados.length, 0);
  });
});

