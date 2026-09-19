const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const dbConfig = {
  host: databaseUrl?.hostname || process.env.DB_HOST || 'localhost',
  user: databaseUrl?.username || process.env.DB_USER || 'root',
  password: databaseUrl?.password || process.env.DB_PASSWORD || '',
  port: Number(databaseUrl?.port || process.env.DB_PORT || 3306),
  database: databaseUrl?.pathname.replace(/^\//, '') || process.env.DB_NAME || 'emprestimos',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0
};

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET nao configurado. Defina essa variavel antes de iniciar o servidor.');
  process.exit(1);
}

let pool;

async function openDb() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

function dataSomente(data) {
  if (data instanceof Date) {
    return data.toISOString().slice(0, 10);
  }

  const texto = String(data || '');
  const dataISO = texto.match(/\d{4}-\d{2}-\d{2}/);
  if (dataISO) return dataISO[0];

  const dataConvertida = new Date(texto);
  return Number.isNaN(dataConvertida.getTime()) ? '' : dataConvertida.toISOString().slice(0, 10);
}
// ---------------------------------------------------------
const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve os arquivos da pasta 'public'

// Rota de Login (pública)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const db = await openDb();
  const [users] = await db.query('SELECT * FROM usuarios WHERE username = ?', [username]);

  if (users.length === 0) {
    return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
  }

  const user = users[0];
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

// Middleware de Autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401); // Não autorizado

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403); // Token inválido/expirado
    req.user = user;
    next();
  });
};

// API para Clientes
app.get('/api/clientes', authenticateToken, async (req, res) => {
  const db = await openDb();
  const [clientes] = await db.query('SELECT * FROM clientes ORDER BY nome');
  res.json(clientes);
});

app.post('/api/clientes', authenticateToken, async (req, res) => {
  const { nome, telefone, cpf, endereco, observacoes } = req.body;
  if (!nome || nome.trim() === '') {
    return res.status(400).json({ message: 'O nome do cliente é obrigatório.' });
  }

  const db = await openDb();
  const [result] = await db.query('INSERT INTO clientes (nome, telefone, cpf, endereco, observacoes) VALUES (?, ?, ?, ?, ?)', [nome, telefone, cpf, endereco, observacoes]);
  res.status(201).json({ id: result.insertId, nome, telefone, cpf, endereco, observacoes });
});

app.delete('/api/clientes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const db = await openDb();

  // Verifica se o cliente tem empréstimos associados
  const [emprestimos] = await db.query('SELECT COUNT(id) as count FROM emprestimos WHERE cliente_id = ?', [id]);

  if (emprestimos[0].count > 0) {
    return res.status(400).json({ message: 'Não é possível excluir cliente com empréstimos ativos.' });
  }

  // Se não houver empréstimos, exclui o cliente
  await db.query('DELETE FROM clientes WHERE id = ?', [id]);
  res.json({ message: 'Cliente excluído com sucesso.' });
});

app.put('/api/clientes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { nome, telefone, cpf, endereco, observacoes } = req.body;

  if (!nome || nome.trim() === '') {
    return res.status(400).json({ message: 'O nome do cliente é obrigatório.' });
  }

  const db = await openDb();
  await db.query('UPDATE clientes SET nome = ?, telefone = ?, cpf = ?, endereco = ?, observacoes = ? WHERE id = ?', [nome, telefone, cpf, endereco, observacoes, id]);
  res.json({ message: 'Cliente atualizado com sucesso.' });
});

// API para Empréstimos
app.get('/api/emprestimos', authenticateToken, async (req, res) => {
  const db = await openDb();

  const [emprestimos] = await db.query(`
    SELECT 
      e.*, 
      DATEDIFF(CURDATE(), e.data_vencimento_original) AS dias_atraso_banco,
      c.nome as nome_cliente
    FROM emprestimos e
    JOIN clientes c ON e.cliente_id = c.id
    ORDER BY FIELD(e.status, 'Ativo', 'Pago') ASC, e.data_emprestimo DESC
  `);

  const emprestimosCalculados = emprestimos.map(e => {
    const valorPrincipal = parseFloat(e.valor_total);
    const jurosFixo = valorPrincipal * (parseFloat(e.juros_emprestimo_percentual) / 100);
    const diasCalculados = Number(e.dias_atraso_banco) || 0;
    const diasAtraso = Math.max(0, diasCalculados);
    const temAtraso = e.status === 'Ativo' && diasAtraso > 0;
    let valorFinalAtualizado = valorPrincipal + jurosFixo;

    if (temAtraso) {
        valorFinalAtualizado += valorPrincipal * (parseFloat(e.juros_diario_percentual) / 100) * diasAtraso;
    }

    return {
      ...e,
      status_formatado: temAtraso ? 'Atrasado' : e.status,
      valor_final_atualizado: valorFinalAtualizado,
      tem_atraso: temAtraso,
      dias_atraso: diasAtraso
    };
  });

  res.json(emprestimosCalculados);
});

app.post('/api/emprestimos', authenticateToken, async (req, res) => {
  let { cliente_id, descricao, valor_total, juros_emprestimo_percentual, juros_diario_percentual, data_vencimento_original, data_emprestimo } = req.body;

  if (!cliente_id || !descricao || !valor_total || !data_vencimento_original || !data_emprestimo) {
    return res.status(400).json({ message: 'Todos os campos do empréstimo são obrigatórios.' });
  }

  const db = await openDb();

  // 1. Insere o empréstimo
  const [result] = await db.query(
    'INSERT INTO emprestimos (cliente_id, descricao, valor_total, juros_emprestimo_percentual, juros_diario_percentual, data_vencimento_original, data_emprestimo) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [cliente_id, descricao, valor_total, juros_emprestimo_percentual || 0, juros_diario_percentual || 0, data_vencimento_original, data_emprestimo || new Date().toISOString().split('T')[0]]
  );
  const emprestimoId = result.insertId;

  res.status(201).json({ id: emprestimoId, message: 'Empréstimo criado com sucesso!' });
});

app.put('/api/emprestimos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { cliente_id, descricao, valor_total, juros_emprestimo_percentual, juros_diario_percentual, data_vencimento_original } = req.body;

  if (!cliente_id || !descricao || !valor_total || !data_vencimento_original) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
  }

  const db = await openDb();
  await db.query(
    'UPDATE emprestimos SET cliente_id = ?, descricao = ?, valor_total = ?, juros_emprestimo_percentual = ?, juros_diario_percentual = ?, data_vencimento_original = ? WHERE id = ?',
    [cliente_id, descricao, valor_total, juros_emprestimo_percentual, juros_diario_percentual, data_vencimento_original, id]
  );
  res.json({ message: 'Empréstimo atualizado com sucesso.' });
});

app.delete('/api/emprestimos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const db = await openDb();
  // Graças ao "ON DELETE CASCADE" na tabela parcelas, todas as parcelas associadas serão excluídas automaticamente.
  await db.query('DELETE FROM emprestimos WHERE id = ?', [id]);
  res.json({ message: 'Empréstimo excluído com sucesso.' });
});

// API para quitar (pagar) um empréstimo
app.patch('/api/emprestimos/:id/quitar', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const db = await openDb();
    await db.query("UPDATE emprestimos SET status = 'Pago' WHERE id = ?", [id]);
    res.json({ message: 'Empréstimo quitado com sucesso!' });
});

// API para reativar um empréstimo pago por engano
app.patch('/api/emprestimos/:id/reativar', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const db = await openDb();
    await db.query("UPDATE emprestimos SET status = 'Ativo' WHERE id = ? AND status = 'Pago'", [id]);
    res.json({ message: 'Empréstimo reativado com sucesso!' });
});

// API para Relatórios
app.get('/api/relatorios', authenticateToken, async (req, res) => {
  const { cliente_id, mes, dia } = req.query;
  const db = await openDb();

  let query = `
    SELECT e.*, c.nome as nome_cliente 
    FROM emprestimos e
    JOIN clientes c ON e.cliente_id = c.id
  `;
  const params = [];
  const whereClauses = [];

  if (cliente_id) {
    whereClauses.push('e.cliente_id = ?');
    params.push(cliente_id);
  }
  if (mes) {
    whereClauses.push("DATE_FORMAT(e.data_emprestimo, '%Y-%m') = ?");
    params.push(mes);
  }
  if (dia) {
    whereClauses.push('e.data_emprestimo = ?');
    params.push(dia);
  }

  if (whereClauses.length > 0) {
    query += ' WHERE ' + whereClauses.join(' AND ');
  }

  query += ' ORDER BY e.data_emprestimo DESC';

  const [relatorio] = await db.query(query, params);
  res.json(relatorio);
});

// API para buscar parcelas de um empréstimo
app.get('/api/emprestimos/:id/parcelas', authenticateToken, async (req, res) => {
    const db = await openDb();
    const [parcelas] = await db.query('SELECT * FROM parcelas WHERE emprestimo_id = ? ORDER BY numero_parcela', [req.params.id]);
    res.json(parcelas);
});

// API para dar baixa (pagar) uma parcela
app.patch('/api/parcelas/:id/pagar', authenticateToken, async (req, res) => {
    const db = await openDb();
    await db.query("UPDATE parcelas SET status = 'Paga' WHERE id = ?", [req.params.id]);
    res.json({ message: 'Parcela paga com sucesso!' });
});

// API Otimizada para Alertas de Vencimento
app.get('/api/alertas', authenticateToken, async (req, res) => {
  const db = await openDb();
  const hoje = new Date().toISOString().split('T')[0];
  const diasAlerta = 7;
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() + diasAlerta);
  const dataLimiteStr = dataLimite.toISOString().split('T')[0];

  const [alertas] = await db.query(`
    SELECT p.numero_parcela, p.data_vencimento, c.nome as nome_cliente
    FROM parcelas p
    JOIN emprestimos e ON p.emprestimo_id = e.id
    JOIN clientes c ON e.cliente_id = c.id
    WHERE p.status = 'Pendente' AND p.data_vencimento <= ?
  `, [dataLimiteStr]);
  res.json(alertas);
});

// API para dados do Dashboard
app.get('/api/dashboard', authenticateToken, async (req, res) => {
  const db = await openDb();
  const hoje = new Date().toISOString().split('T')[0];

  try {
    const [[totalClientes]] = await db.query("SELECT COUNT(id) as count FROM clientes");
    const [[totalEmprestimos]] = await db.query("SELECT COUNT(id) as count FROM emprestimos WHERE status = 'Ativo'");
    const [[valorTotal]] = await db.query("SELECT SUM(valor_total) as sum FROM emprestimos WHERE status = 'Ativo'");
    const [[emprestimosAtrasados]] = await db.query("SELECT COUNT(id) as count FROM emprestimos WHERE status = 'Ativo' AND data_vencimento_original < ?", [hoje]);
    const [[jurosAReceber]] = await db.query("SELECT SUM(valor_total * (juros_emprestimo_percentual / 100)) as sum FROM emprestimos WHERE status = 'Ativo'");

    // Dados para o gráfico: agrupa empréstimos por ano e mês
    const [emprestimosPorMes] = await db.query(`
      SELECT 
        DATE_FORMAT(data_emprestimo, '%Y-%m') as mes, 
        COUNT(id) as total 
      FROM emprestimos 
      GROUP BY mes 
      ORDER BY mes 
      LIMIT 12
    `);

    const [emprestimosPorStatus] = await db.query(`
      SELECT status, COUNT(id) as count 
      FROM emprestimos 
      GROUP BY status
    `);

    res.json({
      totalClientes: totalClientes.count || 0,
      totalEmprestimos: totalEmprestimos.count || 0,
      valorTotal: parseFloat(valorTotal.sum) || 0,
      emprestimosAtrasados: emprestimosAtrasados.count || 0,
      jurosAReceber: parseFloat(jurosAReceber.sum) || 0,
      emprestimosPorMes: emprestimosPorMes,
      emprestimosPorStatus: emprestimosPorStatus
    });
  } catch (error) {
    console.error("Erro ao buscar dados do dashboard:", error);
    res.status(500).json({ message: "Erro interno ao buscar dados do dashboard." });
  }
});

// API para Despesas
app.get('/api/despesas', authenticateToken, async (req, res) => {
  const db = await openDb();
  const [despesas] = await db.query('SELECT * FROM despesas ORDER BY data_vencimento DESC');
  res.json(despesas);
});

app.post('/api/despesas', authenticateToken, async (req, res) => {
  const { descricao, valor, tipo, data_vencimento } = req.body;
  if (!descricao || !valor || !tipo || !data_vencimento) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
  }
  const db = await openDb();
  const [result] = await db.query(
    'INSERT INTO despesas (descricao, valor, tipo, data_vencimento, status) VALUES (?, ?, ?, ?, ?)',
    [descricao, valor, tipo, data_vencimento, 'Pendente']
  );
  res.status(201).json({ id: result.insertId, ...req.body });
});

app.patch('/api/despesas/:id/pagar', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { forma_pagamento } = req.body;
  if (!forma_pagamento || forma_pagamento.trim() === '') {
    return res.status(400).json({ message: 'A forma de pagamento é obrigatória.' });
  }
  const db = await openDb();
  const data_pagamento = new Date().toISOString().split('T')[0];
  await db.query(
    "UPDATE despesas SET status = 'Paga', data_pagamento = ?, forma_pagamento = ? WHERE id = ?",
    [data_pagamento, forma_pagamento, id]
  );
  res.json({ message: 'Despesa marcada como paga.' });
});

app.delete('/api/despesas/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const db = await openDb();
  await db.query('DELETE FROM despesas WHERE id = ?', [id]);
  res.json({ message: 'Despesa excluída com sucesso.' });
});

/**
 * Verifica se uma coluna existe em uma tabela e a adiciona se não existir.
 * @param {*} db - Conexão com o banco.
 * @param {string} tableName - Nome da tabela.
 * @param {string} columnName - Nome da coluna.
 * @param {string} columnDefinition - Definição da coluna (ex: "VARCHAR(255) NOT NULL").
 */
async function checkAndAddColumn(db, tableName, columnName, columnDefinition) {
    const [columns] = await db.query(
        `SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [dbConfig.database, tableName, columnName]
    );
    if (columns.length === 0) {
        await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    }
}

async function setupDatabase() {
  const db = await openDb();
  console.log('Verificando e criando tabelas se necessário...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      telefone VARCHAR(20),
      cpf VARCHAR(20),
      endereco TEXT,
      observacoes TEXT
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS emprestimos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cliente_id INT NOT NULL,
      descricao TEXT NOT NULL,
      valor_total DECIMAL(10, 2) NOT NULL,
      numero_parcelas INT NOT NULL DEFAULT 1,
      juros_emprestimo_percentual DECIMAL(5, 2) DEFAULT 0.00,
      juros_diario_percentual DECIMAL(5, 2) DEFAULT 0.00,
      juros_parcelamento_mensal DECIMAL(5, 2) DEFAULT 0.00,
      data_emprestimo DATE NOT NULL,
      data_vencimento_original DATE,
      status VARCHAR(20) DEFAULT 'Ativo',
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );
  `);
  // Garante que as colunas mais recentes existam, mesmo que a tabela já tenha sido criada
  await checkAndAddColumn(db, 'emprestimos', 'juros_emprestimo_percentual', 'DECIMAL(5, 2) DEFAULT 0.00');
  await checkAndAddColumn(db, 'emprestimos', 'juros_diario_percentual', 'DECIMAL(5, 2) DEFAULT 0.00');
  await checkAndAddColumn(db, 'emprestimos', 'juros_parcelamento_mensal', 'DECIMAL(5, 2) DEFAULT 0.00');
  await checkAndAddColumn(db, 'emprestimos', 'data_vencimento_original', 'DATE');
  await db.query(`
    CREATE TABLE IF NOT EXISTS parcelas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      emprestimo_id INT NOT NULL,
      numero_parcela INT NOT NULL,
      valor_parcela DECIMAL(10, 2) NOT NULL,
      data_vencimento DATE NOT NULL,
      status VARCHAR(20) DEFAULT 'Pendente',
      FOREIGN KEY (emprestimo_id) REFERENCES emprestimos(id) ON DELETE CASCADE
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS despesas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      descricao VARCHAR(255) NOT NULL,
      valor DECIMAL(10, 2) NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      data_vencimento DATE NOT NULL,
      data_pagamento DATE,
      forma_pagamento VARCHAR(50),
      status VARCHAR(20) DEFAULT 'Pendente'
    );
  `);
  await checkAndAddColumn(db, 'despesas', 'forma_pagamento', 'VARCHAR(50)');
  await db.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL
    );
  `);

  console.log('Tabelas prontas.');

}

/**
 * Função principal para iniciar a aplicação.
 * Garante que o banco de dados seja configurado antes do servidor iniciar.
 */
async function startServer() {
  try {
    await setupDatabase(); // 1. Espera o banco de dados ser configurado.
    app.listen(port, () => { // 2. Só então, liga o servidor.
      console.log(`--- SISTEMA DE EMPRÉSTIMOS CEARÁ LIGADO ---`);
      console.log(`✅ Servidor pronto e ouvindo na porta ${port}`);
      console.log(`➡️  Acesse em: http://localhost:${port}`);
    });
  } catch (error) {
    console.error('❌ FALHA CRÍTICA AO INICIAR O SERVIDOR ❌');
    console.error(error);
    process.exit(1); // Encerra a aplicação se o banco de dados falhar.
  }
}

// Inicia a aplicação
startServer();
