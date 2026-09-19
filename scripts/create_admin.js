const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const [,, username, password] = process.argv;

if (!username || !password || password.length < 8) {
  console.error('Uso: npm run create-admin -- usuario senha-com-pelo-menos-8-caracteres');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const config = {
  host: databaseUrl?.hostname || process.env.DB_HOST || 'localhost',
  user: databaseUrl?.username || process.env.DB_USER || 'root',
  password: databaseUrl?.password || process.env.DB_PASSWORD || '',
  port: Number(databaseUrl?.port || process.env.DB_PORT || 3306),
  database: databaseUrl?.pathname.replace(/^\//, '') || process.env.DB_NAME || 'emprestimos',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
};

async function createAdmin() {
  const connection = await mysql.createConnection(config);
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await connection.query(
      `INSERT INTO usuarios (username, password) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE password = VALUES(password)`,
      [username, passwordHash]
    );
    console.log(`Usuario '${username}' criado/atualizado com sucesso.`);
  } finally {
    await connection.end();
  }
}

createAdmin().catch(error => {
  console.error('Nao foi possivel criar o usuario:', error.message);
  process.exit(1);
});
