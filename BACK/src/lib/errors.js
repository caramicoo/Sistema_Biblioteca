'use strict';
class HttpError extends Error {
  constructor(status, message, code='ERRO_REQUISICAO') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const badRequest = message => new HttpError(400, message, 'DADOS_INVALIDOS');
const notFound = message => new HttpError(404, message, 'NAO_ENCONTRADO');
const conflict = message => new HttpError(409, message, 'CONFLITO_REGRA_NEGOCIO');
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) return res.status(error.status).json({ erro: error.message, codigo: error.code });
  if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Registro duplicado: ISBN, identificação, tombo ou operação ativa já existe.', codigo: 'REGISTRO_DUPLICADO' });
  if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ erro: 'O registro possui vínculos e não pode ser excluído.', codigo: 'REGISTRO_EM_USO' });
  if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ erro: 'Referência a registro inexistente.', codigo: 'REFERENCIA_INVALIDA' });
  if (error.code === 'ER_CHECK_CONSTRAINT_VIOLATED') return res.status(400).json({ erro: 'Violação de restrição do banco de dados.', codigo: 'RESTRICAO_INVALIDA' });
  console.error('[ERRO INTERNO]', error);
  return res.status(500).json({ erro: 'Erro interno do servidor.', codigo: 'ERRO_INTERNO' });
}
module.exports = { HttpError, badRequest, notFound, conflict, errorHandler };
