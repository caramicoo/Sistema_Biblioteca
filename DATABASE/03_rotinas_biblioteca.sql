-- Sistema de Biblioteca - rotinas avançadas MySQL 8.0+
-- Executar depois de DATABASE/01_schema.sql.
-- Este arquivo não contém senhas e pode ser versionado no GitHub.

USE biblioteca;

-- Histórico técnico das alterações de circulação.
CREATE TABLE IF NOT EXISTS historico_circulacao (
  id_historico BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entidade VARCHAR(30) NOT NULL,
  id_registro BIGINT UNSIGNED NOT NULL,
  acao VARCHAR(30) NOT NULL,
  detalhes JSON NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_historico),
  KEY idx_historico_registro (entidade, id_registro),
  KEY idx_historico_criado (criado_em)
) ENGINE=InnoDB;

DELIMITER ;
DROP FUNCTION IF EXISTS fn_dias_atraso;
DELIMITER $$
CREATE FUNCTION fn_dias_atraso(p_data_prevista DATE, p_data_referencia DATE)
RETURNS INT
DETERMINISTIC
NO SQL
BEGIN
  IF p_data_prevista IS NULL OR p_data_referencia IS NULL OR p_data_referencia <= p_data_prevista THEN
    RETURN 0;
  END IF;
  RETURN DATEDIFF(p_data_referencia, p_data_prevista);
END$$

DELIMITER ;
DROP FUNCTION IF EXISTS fn_situacao_emprestimo;
DELIMITER $$
CREATE FUNCTION fn_situacao_emprestimo(p_data_prevista DATE, p_data_devolucao DATE, p_data_referencia DATE)
RETURNS VARCHAR(12)
DETERMINISTIC
NO SQL
BEGIN
  IF p_data_devolucao IS NOT NULL THEN
    RETURN 'devolvido';
  ELSEIF p_data_prevista < p_data_referencia THEN
    RETURN 'vencido';
  END IF;
  RETURN 'aberto';
END$$
DELIMITER ;

DELIMITER ;
DROP PROCEDURE IF EXISTS sp_cadastrar_livro_com_exemplar;
DELIMITER $$
CREATE PROCEDURE sp_cadastrar_livro_com_exemplar(
  IN p_titulo VARCHAR(160),
  IN p_autor VARCHAR(120),
  IN p_isbn VARCHAR(22),
  IN p_categoria VARCHAR(80),
  IN p_tombo VARCHAR(40)
)
SQL SECURITY INVOKER
BEGIN
  DECLARE v_livro BIGINT UNSIGNED;
  INSERT INTO livro (titulo, autor, isbn, categoria)
    VALUES (p_titulo, p_autor, p_isbn, NULLIF(p_categoria, ''));
  SET v_livro = LAST_INSERT_ID();
  INSERT INTO exemplar (id_livro, tombo) VALUES (v_livro, p_tombo);
  SELECT v_livro AS id_livro, LAST_INSERT_ID() AS id_exemplar;
END$$

DELIMITER ;
DROP PROCEDURE IF EXISTS sp_registrar_devolucao;
DELIMITER $$
CREATE PROCEDURE sp_registrar_devolucao(
  IN p_id_emprestimo BIGINT UNSIGNED,
  IN p_id_funcionario BIGINT UNSIGNED,
  IN p_data_devolucao DATE
)
SQL SECURITY INVOKER
BEGIN
  DECLARE v_exemplar BIGINT UNSIGNED;
  DECLARE v_reservado INT DEFAULT 0;
  SELECT id_exemplar INTO v_exemplar FROM emprestimo
    WHERE id_emprestimo = p_id_emprestimo AND data_devolucao IS NULL FOR UPDATE;
  IF v_exemplar IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Empréstimo inexistente ou já devolvido.';
  END IF;
  UPDATE emprestimo
    SET data_devolucao = p_data_devolucao, id_funcionario_devolucao = p_id_funcionario
    WHERE id_emprestimo = p_id_emprestimo;
  SELECT COUNT(*) INTO v_reservado FROM reserva
    WHERE id_exemplar = v_exemplar AND situacao = 'ativa';
  UPDATE exemplar SET situacao = IF(v_reservado > 0, 'reservado', 'disponivel')
    WHERE id_exemplar = v_exemplar;
  SELECT v_exemplar AS id_exemplar,
         IF(v_reservado > 0, 'reservado', 'disponivel') AS situacao_exemplar;
END$$
DELIMITER ;

DELIMITER ;
DROP TRIGGER IF EXISTS trg_emprestimo_historico;
DELIMITER $$
CREATE TRIGGER trg_emprestimo_historico
AFTER INSERT ON emprestimo
FOR EACH ROW
INSERT INTO historico_circulacao (entidade, id_registro, acao, detalhes)
VALUES ('emprestimo', NEW.id_emprestimo, 'CRIADO', JSON_OBJECT(
  'id_leitor', NEW.id_leitor, 'id_exemplar', NEW.id_exemplar,
  'data_retirada', NEW.data_retirada, 'data_prevista', NEW.data_prevista
))$$

DELIMITER ;
DROP TRIGGER IF EXISTS trg_devolucao_historico;
DELIMITER $$
CREATE TRIGGER trg_devolucao_historico
AFTER UPDATE ON emprestimo
FOR EACH ROW
BEGIN
  IF OLD.data_devolucao IS NULL AND NEW.data_devolucao IS NOT NULL THEN
    INSERT INTO historico_circulacao (entidade, id_registro, acao, detalhes)
    VALUES ('emprestimo', NEW.id_emprestimo, 'DEVOLVIDO', JSON_OBJECT(
      'id_exemplar', NEW.id_exemplar, 'data_devolucao', NEW.data_devolucao,
      'id_funcionario', NEW.id_funcionario_devolucao
    ));
  END IF;
END$$
DELIMITER ;

