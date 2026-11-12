'use strict';
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const config = require('../config');
const { verifyPassword } = require('../lib/password');
const { requiredString } = require('../lib/validate');
const { requireAuth } = require('../lib/auth');
const { HttpError } = require('../lib/errors');
router.post('/login', async (req, res) => {
  const login = requiredString(req.body.login, 'Login', 60);
  // Não remova espaços da senha: ela precisa ser conferida exatamente como foi criada.
  const senha = req.body.senha;
  if (typeof senha !== 'string' || !senha || senha.length > 200) {
    throw new HttpError(400, 'Senha inválida.', 'DADOS_INVALIDOS');
  }
  const [rows] = await pool.execute('SELECT id_funcionario, nome, login, senha_hash, ativo FROM funcionario WHERE login = ?', [login]);
  const funcionario = rows[0];
  if (!funcionario || !funcionario.ativo || !(await verifyPassword(senha, funcionario.senha_hash))) {
    throw new HttpError(401, 'Login ou senha inválidos.', 'CREDENCIAIS_INVALIDAS');
  }
  const token = jwt.sign({}, config.jwtSecret, { algorithm: 'HS256', subject: String(funcionario.id_funcionario), expiresIn: config.jwtExpiresIn });
  res.json({ token, tipo: 'Bearer', funcionario: { id_funcionario: funcionario.id_funcionario, nome: funcionario.nome, login: funcionario.login } });
});
router.get('/me', requireAuth, (req, res) => res.json(req.funcionario));
module.exports = router;
