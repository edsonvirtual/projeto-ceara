-- PROJETO CEARA - Banco MySQL
-- Importe este arquivo no banco criado no painel da Superdominios.
-- O script nao apaga tabelas ou dados existentes.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuarios_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clientes (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nome VARCHAR(255) NOT NULL,
    telefone VARCHAR(30) NULL,
    cpf VARCHAR(20) NULL,
    endereco VARCHAR(500) NULL,
    observacoes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_clientes_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS emprestimos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    cliente_id INT UNSIGNED NOT NULL,
    descricao VARCHAR(500) NOT NULL,
    valor_total DECIMAL(12,2) NOT NULL,
    numero_parcelas INT NOT NULL DEFAULT 1,
    juros_emprestimo_percentual DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
    juros_diario_percentual DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
    data_vencimento_original DATE NOT NULL,
    data_emprestimo DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Ativo',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_emprestimos_cliente_id (cliente_id),
    KEY idx_emprestimos_status (status),
    KEY idx_emprestimos_vencimento (data_vencimento_original),
    CONSTRAINT fk_emprestimos_cliente
        FOREIGN KEY (cliente_id) REFERENCES clientes (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parcelas (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    emprestimo_id INT UNSIGNED NOT NULL,
    numero_parcela INT UNSIGNED NOT NULL,
    valor_parcela DECIMAL(12,2) NOT NULL,
    data_vencimento DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pendente',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_parcela_numero (emprestimo_id, numero_parcela),
    KEY idx_parcelas_vencimento_status (data_vencimento, status),
    CONSTRAINT fk_parcelas_emprestimo
        FOREIGN KEY (emprestimo_id) REFERENCES emprestimos (id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS despesas (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    descricao VARCHAR(255) NOT NULL,
    valor DECIMAL(12,2) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    data_vencimento DATE NOT NULL,
    data_pagamento DATE NULL,
    forma_pagamento VARCHAR(50) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pendente',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_despesas_vencimento (data_vencimento),
    KEY idx_despesas_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- Depois de criar o banco, cadastre um usuario com senha bcrypt.
-- A aplicacao espera a senha criptografada na coluna usuarios.password.
