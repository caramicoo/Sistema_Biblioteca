-- Exemplos FICTÍCIOS. Execute depois de 01_schema.sql, se desejar dados para demonstrar.
-- Não inclui senhas nem funcionários. Crie o primeiro funcionário pelo comando npm run criar-funcionario.
USE biblioteca;
INSERT INTO livro (titulo, autor, isbn, categoria) VALUES
  ('Dom Casmurro', 'Machado de Assis', '9788535914849', 'Literatura brasileira'),
  ('O Cortiço', 'Aluísio Azevedo', '9788525406958', 'Romance'),
  ('Vidas Secas', 'Graciliano Ramos', '9788501067340', 'Literatura brasileira');
INSERT INTO exemplar (id_livro, tombo) VALUES
  ((SELECT id_livro FROM livro WHERE isbn = '9788535914849'), 'T-0001'),
  ((SELECT id_livro FROM livro WHERE isbn = '9788535914849'), 'T-0002'),
  ((SELECT id_livro FROM livro WHERE isbn = '9788525406958'), 'T-0003'),
  ((SELECT id_livro FROM livro WHERE isbn = '9788501067340'), 'T-0004');
INSERT INTO leitor (nome, identificacao, contato) VALUES
  ('Ana Oliveira', 'L-0001', 'ana@exemplo.com'),
  ('Bruno Santos', 'L-0002', 'bruno@exemplo.com');
