# Publicar projeto-ceara na Superdominios

## 1. Criar o banco

No painel da Superdominios, crie um banco MySQL e um usuario com permissao para esse banco. Anote host, porta, nome, usuario e senha. O host deve ser o informado no painel; nao presuma que seja `localhost`.

## 2. Importar as tabelas

No phpMyAdmin, selecione o banco criado, abra a aba **SQL** e importe o arquivo `banco_mysql.sql`.

O arquivo cria as tabelas `usuarios`, `clientes`, `emprestimos`, `parcelas` e `despesas`.

## 3. Enviar o projeto

Envie estes itens para a pasta da aplicacao:

- `server.js`
- `package.json`
- `package-lock.json`
- `public/`
- `scripts/`
- `banco_mysql.sql`

Nao envie `node_modules/`, `emprestimos.db` ou o arquivo `.env.example` como `.env` sem preencher.

## 4. Configurar o ambiente

No painel da aplicacao Node.js, crie as variaveis usando `.env.example` como modelo. Defina principalmente `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` e `PORT`.

A aplicacao aceita tambem uma variavel unica `DATABASE_URL` no formato:

```text
mysql://usuario:senha@host:3306/nome_do_banco
```

## 5. Instalar e iniciar

Na pasta do projeto, execute:

```bash
npm ci --omit=dev
npm run create-admin -- administrador SuaSenhaForte123
npm start
```

A senha deve ter pelo menos 8 caracteres. O comando `npm start` executa as verificacoes/criacoes de tabelas antes de abrir o servidor.

## 6. Configurar o Node.js

No seletor de Node.js da hospedagem, use:

- Arquivo de inicializacao: `server.js`
- Comando: `npm start`
- Versao: Node.js 18 LTS ou superior
- Diretorio da aplicacao: a pasta onde esta o `server.js`

O painel pode fornecer a porta da aplicacao. Nesse caso, use o valor indicado na variavel `PORT`.

## 7. Testar

Abra o dominio e teste login, clientes, emprestimos, parcelas, contas e relatorios. Se aparecer erro de banco, confira o host e as permissoes do usuario no painel.
