# Sistema de Biblioteca — FATEC

Aplicação web para apoio a bibliotecas escolares. Frontend em HTML/CSS/JavaScript, API Node.js/Express e banco MySQL.

## Configuração

1. Instale MySQL Server 8.4 e Node.js 20+.
2. Abra `DATABASE/01_schema.sql` no MySQL Workbench e execute no servidor local **apenas se ainda não criou as tabelas**.
3. No VS Code, abra o terminal na pasta `BACK`. Execute `npm ci` para instalar as versões registradas no projeto.
4. Copie `BACK/.env.example` para `BACK/.env` e preencha os campos `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=biblioteca` e um `JWT_SECRET` com no mínimo 32 caracteres. **Não suba .env ao GitHub.**
5. Execute `npm run criar-funcionario` para cadastrar o funcionário. O script pergunta nome, login e senha no terminal. Nesta versão de desenvolvimento, **a senha fica visível durante a digitação**, para evitar a incompatibilidade do terminal do Windows. Execute em ambiente privado.
6. Execute `npm run dev` em `BACK` e abra **http://localhost:3000/** no navegador.

**Importante:** nesta versão o Node.js serve o frontend e a API no mesmo endereço. Não abra o HTML diretamente por duplo clique nem use o Live Server para a integração.

## Fluxo de validação

1. Entre com o login e a senha do funcionário cadastrado.
2. Cadastre livro e primeiro exemplar, com tombo único.
3. Cadastre leitor, registre empréstimo e confira a mudança de estado.
4. Registre devolução e confirme que o exemplar voltou a ficar disponível, se não houver reserva ativa.
5. Registre uma reserva e confira as restrições de empréstimo.
6. Feche e reabra o navegador; os dados continuam no MySQL.
7. Confira no MySQL Workbench os registros correspondentes.

### Testes automatizados

Na pasta `BACK`, execute `npm test` para verificar as regras de circulação, datas e senhas.

Para testar a API com MySQL 8.4, execute `npm run test:integracao`. A suíte gera um banco `biblioteca_teste_…`, cria as seis tabelas a partir do SQL do projeto e remove esse banco ao terminar. Ela verifica autenticação, listagem paginada, cadastro de exemplares, empréstimos, reservas, devoluções e consulta de vencidos.

Configure `MYSQL_TEST_USER` e `MYSQL_TEST_PASSWORD` no ambiente do terminal para uma conta de teste com permissão de criar e remover bancos de teste. `MYSQL_TEST_HOST` e `MYSQL_TEST_PORT` permitem ajustar o endereço padrão `127.0.0.1:3306`. O GitHub Actions executa a suíte em um MySQL temporário com senha gerada a cada execução.

### Limites

O leitor não se autentica: as operações são realizadas pelo funcionário. Consulta de empréstimos vencidos é manual, sem alertas. A política de fila de reservas e os prazos definitivos ainda precisam ser validados. Este projeto é destinado a demonstração acadêmica, não a dados reais de menores de idade sem avaliação adicional de privacidade e segurança.
