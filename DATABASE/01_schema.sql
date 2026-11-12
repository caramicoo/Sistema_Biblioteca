-- SISTEMA DE BIBLIOTECA — ESQUEMA MySQL 8.0.16+
-- Baseline do projeto: 6 entidades (Livro, Exemplar, Leitor, Funcionario, Emprestimo, Reserva).
-- Empréstimo vencido é calculado por data_prevista; NÃO há alerta automático.
-- Executar somente uma vez em um banco vazio (ou restaurar backup antes de reinstalar).
CREATE DATABASE IF NOT EXISTS biblioteca
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE biblioteca;

CREATE TABLE IF NOT EXISTS livro (
  id_livro BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  titulo VARCHAR(160) NOT NULL,
  autor VARCHAR(120) NOT NULL,
  isbn VARCHAR(22) NOT NULL,
  categoria VARCHAR(80) NULL COMMENT 'Campo da interface do prototipo; complemento ao DER basico',
  PRIMARY KEY (id_livro),
  UNIQUE KEY uq_livro_isbn (isbn),
  KEY idx_livro_titulo (titulo),
  KEY idx_livro_autor (autor)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leitor (
  id_leitor BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  identificacao VARCHAR(40) NOT NULL,
  contato VARCHAR(160) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_leitor),
  UNIQUE KEY uq_leitor_identificacao (identificacao)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS funcionario (
  id_funcionario BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  login VARCHAR(60) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_funcionario),
  UNIQUE KEY uq_funcionario_login (login)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exemplar (
  id_exemplar BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_livro BIGINT UNSIGNED NOT NULL,
  tombo VARCHAR(40) NOT NULL,
  situacao ENUM('disponivel', 'emprestado', 'reservado') NOT NULL DEFAULT 'disponivel',
  PRIMARY KEY (id_exemplar),
  UNIQUE KEY uq_exemplar_tombo (tombo),
  KEY idx_exemplar_livro (id_livro),
  CONSTRAINT fk_exemplar_livro FOREIGN KEY (id_livro)
    REFERENCES livro (id_livro) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS emprestimo (
  id_emprestimo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_leitor BIGINT UNSIGNED NOT NULL,
  id_exemplar BIGINT UNSIGNED NOT NULL,
  id_funcionario_retirada BIGINT UNSIGNED NOT NULL,
  id_funcionario_devolucao BIGINT UNSIGNED NULL,
  data_retirada DATE NOT NULL,
  data_prevista DATE NOT NULL,
  data_devolucao DATE NULL,
  -- UNIQUE aceita NULL repetidos: impede DOIS empréstimos abertos do mesmo exemplar.
  exemplar_aberto BIGINT UNSIGNED GENERATED ALWAYS AS
    (CASE WHEN data_devolucao IS NULL THEN id_exemplar ELSE NULL END) STORED,
  PRIMARY KEY (id_emprestimo),
  UNIQUE KEY uq_emprestimo_aberto (exemplar_aberto),
  KEY idx_emp_leitor_prazo (id_leitor, data_prevista, data_devolucao),
  KEY idx_emp_exemplar (id_exemplar),
  CONSTRAINT fk_emp_leitor FOREIGN KEY (id_leitor) REFERENCES leitor (id_leitor) ON DELETE RESTRICT,
  CONSTRAINT fk_emp_exemplar FOREIGN KEY (id_exemplar) REFERENCES exemplar (id_exemplar) ON DELETE RESTRICT,
  CONSTRAINT fk_emp_func_retirada FOREIGN KEY (id_funcionario_retirada) REFERENCES funcionario (id_funcionario) ON DELETE RESTRICT,
  CONSTRAINT fk_emp_func_devolucao FOREIGN KEY (id_funcionario_devolucao) REFERENCES funcionario (id_funcionario) ON DELETE RESTRICT,
  CONSTRAINT chk_emp_prazo CHECK (data_prevista >= data_retirada),
  CONSTRAINT chk_emp_devolucao CHECK (data_devolucao IS NULL OR data_devolucao >= data_retirada),
  CONSTRAINT chk_emp_func_devolucao CHECK (
    (data_devolucao IS NULL AND id_funcionario_devolucao IS NULL) OR
    (data_devolucao IS NOT NULL AND id_funcionario_devolucao IS NOT NULL)
  )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reserva (
  id_reserva BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_leitor BIGINT UNSIGNED NOT NULL,
  id_exemplar BIGINT UNSIGNED NOT NULL,
  id_funcionario BIGINT UNSIGNED NOT NULL,
  data_reserva DATE NOT NULL,
  situacao ENUM('ativa', 'atendida', 'cancelada') NOT NULL DEFAULT 'ativa',
  -- Política PROVISÓRIA do protótipo: uma reserva ativa por exemplar.
  -- A futura fila de reservas depende de aprovação da biblioteca.
  exemplar_reservado BIGINT UNSIGNED GENERATED ALWAYS AS
    (CASE WHEN situacao = 'ativa' THEN id_exemplar ELSE NULL END) STORED,
  PRIMARY KEY (id_reserva),
  UNIQUE KEY uq_reserva_ativa_exemplar (exemplar_reservado),
  KEY idx_reserva_leitor_exemplar (id_leitor, id_exemplar),
  KEY idx_reserva_exemplar (id_exemplar),
  CONSTRAINT fk_reserva_leitor FOREIGN KEY (id_leitor) REFERENCES leitor (id_leitor) ON DELETE RESTRICT,
  CONSTRAINT fk_reserva_exemplar FOREIGN KEY (id_exemplar) REFERENCES exemplar (id_exemplar) ON DELETE RESTRICT,
  CONSTRAINT fk_reserva_func FOREIGN KEY (id_funcionario) REFERENCES funcionario (id_funcionario) ON DELETE RESTRICT
) ENGINE=InnoDB;
