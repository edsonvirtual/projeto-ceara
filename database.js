const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// Função para abrir a conexão com o banco de dados
async function openDb() {
  return open({
    filename: 'karmemfa_teste.db', // O arquivo do banco de dados
    driver: sqlite3.Database
  });
}

// Função para configurar o banco de dados (criar tabelas)
async function setup() {
  const db = await openDb();
  await db.exec(`
    -- Tabela de Clientes
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT
    );

    -- Tabela de Empréstimos
    CREATE TABLE IF NOT EXISTS emprestimos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      descricao TEXT NOT NULL,
      valor_total REAL NOT NULL,
      numero_parcelas INTEGER NOT NULL,
      data_emprestimo TEXT NOT NULL,
      status TEXT DEFAULT 'Ativo', -- Ativo, Atrasado, Pago
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );

    -- Tabela das Parcelas de cada empréstimo
    CREATE TABLE IF NOT EXISTS parcelas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emprestimo_id INTEGER NOT NULL,
      numero_parcela INTEGER NOT NULL,
      valor_parcela REAL NOT NULL,
      data_vencimento TEXT NOT NULL,
      status TEXT DEFAULT 'Pendente', -- Pendente, Paga, Atrasada
      FOREIGN KEY (emprestimo_id) REFERENCES emprestimos(id) ON DELETE CASCADE
    );
  `);
  console.log('Banco de dados configurado com sucesso.');
}

// Exporta as funções para serem usadas em outros arquivos
module.exports = { openDb, setup };
