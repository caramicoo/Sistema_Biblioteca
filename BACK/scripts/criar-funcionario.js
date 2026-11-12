'use strict';
// Executar uma única vez para cadastrar o primeiro funcionário; não há credencial padrão.
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { pool } = require('../src/db');
const { hashPassword } = require('../src/lib/password');
const { requiredString } = require('../src/lib/validate');
async function main() {
  if (!stdin.isTTY) throw new Error('Execute este comando em um terminal interativo.');
  const rl = readline.createInterface({input:stdin, output:stdout, terminal:true});
  let nome, login, senha;
  try {
    nome = requiredString(await rl.question('Nome do funcionário: '), 'Nome', 120);
    login = requiredString(await rl.question('Login (sem espaços): '), 'Login', 60);
    if (!/^[A-Za-z0-9._-]+$/.test(login)) throw new Error('Login aceita letras, números, . _ -');
    stdout.write('Senha (mínimo 10 caracteres; digitação oculta): ');
    // A senha não é ecoada; não é passada em argumentos nem salva em texto puro.
    rl._writeToOutput = () => {};
    senha = await rl.question('');
    rl._writeToOutput = text => stdout.write(text);
    stdout.write('\n');
  } finally { rl.close(); }
  const senhaHash = await hashPassword(senha);
  const [result] = await pool.execute('INSERT INTO funcionario (nome,login,senha_hash) VALUES (?,?,?)', [nome,login,senhaHash]);
  console.log(`Funcionário criado: ID ${result.insertId}, login ${login}`);
}
main().catch(error => { console.error('Erro ao criar funcionário:', error.message); process.exitCode=1; }).finally(() => pool.end());
