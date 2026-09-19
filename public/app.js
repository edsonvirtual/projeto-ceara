const API_URL = `${window.location.origin}/api`;

/**
 * Função fetch global que adiciona o token de autenticação.
 */
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
        throw response; // Lança o objeto de resposta em caso de erro (4xx, 5xx)
    }
    return response; // Retorna a resposta em caso de sucesso
}

async function parseJsonResponse(response, context = 'Resposta da API') {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        return response.json();
    }

    const text = await response.text();
    const trimmed = text.trim();

    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
        throw new Error(`${context}: o servidor respondeu com a página HTML em vez de JSON. Verifique se o Node.js está rodando e se a rota /api está ativa.`);
    }

    if (!trimmed) {
        throw new Error(`${context}: o servidor respondeu sem conteúdo.`);
    }

    try {
        return JSON.parse(trimmed);
    } catch (error) {
        throw new Error(`${context}: resposta inesperada do servidor: ${trimmed.slice(0, 160)}`);
    }
}

/**
 * Tenta executar uma função que depende do servidor.
 * Se falhar, espera um pouco e tenta novamente.
 * Isso resolve os erros de conexão na inicialização.
 */
async function tryWithRetry(fn, retries = 5, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            await fn();
            return; // Sucesso, sai da função
        } catch (error) {
            console.warn(`Tentativa ${i + 1} falhou. Tentando novamente em ${delay / 1000}s...`);
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, delay));
            } else {
                // Verifica se o erro é uma resposta de fetch que falhou
                if (error && (error.status === 401 || error.status === 403)) {
                    console.error("Token inválido ou expirado. Redirecionando para login.");
                    logout();
                } else {
                    console.error("Não foi possível conectar ao servidor após várias tentativas.", error);
                    alert("ERRO: Não foi possível conectar ao servidor. Verifique se a janela preta (servidor) está aberta e sem erros.");
                }
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();

    document.getElementById('form-login').addEventListener('submit', handleLogin);
    document.getElementById('logout-button').addEventListener('click', logout);
    if (localStorage.getItem('authToken')) {
        tryWithRetry(carregarDashboard).then(() => showApp());
    }

    document.getElementById('form-cliente').addEventListener('submit', salvarCliente);
    document.getElementById('form-emprestimo').addEventListener('submit', registrarEmprestimo);
    document.getElementById('form-despesa').addEventListener('submit', salvarDespesa);

    // Modal logic
    const modal = document.getElementById('modal-parcelas');
    const span = document.getElementsByClassName('close-button')[0];
    span.onclick = () => modal.style.display = "none";

    // Lógica para o novo modal de edição de cliente
    const modalEditar = document.getElementById('modal-editar-cliente');
    const spanEditar = modalEditar.querySelector('.close-button');
    spanEditar.onclick = () => modalEditar.style.display = "none";
    document.getElementById('form-editar-cliente').addEventListener('submit', salvarEdicaoCliente);

    // Lógica para o novo modal de edição de empréstimo
    const modalEditarEmprestimo = document.getElementById('modal-editar-emprestimo');
    const spanEditarEmprestimo = modalEditarEmprestimo.querySelector('.close-button');
    spanEditarEmprestimo.onclick = () => modalEditarEmprestimo.style.display = "none";
    document.getElementById('form-editar-emprestimo').addEventListener('submit', salvarEdicaoEmprestimo);
    document.getElementById('fechar-modal-pagamento').onclick = fecharModalPagamento;
    document.getElementById('form-pagar-despesa').addEventListener('submit', confirmarPagamentoDespesa);

    // Lógica para a nova página de relatórios
    document.getElementById('form-relatorio').addEventListener('submit', gerarRelatorio);
    document.getElementById('btn-limpar-filtros').addEventListener('click', limparFiltrosRelatorio);

    window.onclick = (event) => {
        if (event.target == modalEditarEmprestimo) {
            modalEditarEmprestimo.style.display = "none";
        }
        if (event.target == modal) {
            modal.style.display = "none";
        }
        if (event.target == modalEditar) {
            modalEditar.style.display = "none";
        }
    }
});

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errorP = document.getElementById('login-error');
    errorP.textContent = '';

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const errorData = await parseJsonResponse(response, 'Login');
            throw new Error(errorData.message || 'Falha no login');
        }

        const { token } = await parseJsonResponse(response, 'Login');
        localStorage.setItem('authToken', token);
        showApp();

    } catch (error) {
        errorP.textContent = error.message;
    }
}

function showApp() {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    // Carrega os dados da página inicial (Dashboard)
    tryWithRetry(carregarDashboard);
}


function setupNavigation() {
    const navLinks = document.querySelectorAll('.menu a');
    const kpiCards = document.querySelectorAll('.kpi-card[data-page]');
    const menu = document.getElementById('menu-principal');
    const menuToggle = document.querySelector('.menu-toggle');

    menuToggle.addEventListener('click', () => {
        const aberto = menu.classList.toggle('menu-aberto');
        menuToggle.setAttribute('aria-expanded', aberto);
        menuToggle.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
        menuToggle.querySelector('i').className = aberto ? 'fas fa-times' : 'fas fa-bars';
    });

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            handlePageChange(e, link);
            menu.classList.remove('menu-aberto');
            menuToggle.setAttribute('aria-expanded', 'false');
            menuToggle.setAttribute('aria-label', 'Abrir menu');
            menuToggle.querySelector('i').className = 'fas fa-bars';
        });
    });

    kpiCards.forEach(card => {
        const navegar = () => {
            const link = document.querySelector(`.menu a[data-page="${card.dataset.page}"]`);
            if (link) link.click();
        };
        card.addEventListener('click', navegar);
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navegar();
            }
        });
    });
}

function handlePageChange(e, link) {
    e.preventDefault();
    const pageId = link.getAttribute('data-page');

    // Oculta todas as páginas e remove a classe 'active' dos links
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.menu a').forEach(a => a.classList.remove('active'));

    // Mostra a página selecionada e ativa o link
    document.getElementById(`page-${pageId}`).classList.add('active');
    link.classList.add('active');

    // Carrega os dados específicos da página, se necessário
    if (pageId === 'emprestimos') {
        tryWithRetry(carregarClientes); // O formulário de empréstimo precisa dos clientes
        tryWithRetry(carregarEmprestimos);
    } else if (pageId === 'dashboard') {
        tryWithRetry(carregarDashboard);
    } else if (pageId === 'clientes') {
        tryWithRetry(carregarClientes); // Carrega a lista de clientes para o formulário de empréstimo
        tryWithRetry(carregarTabelaClientes); // Carrega a tabela de clientes
    } else if (pageId === 'relatorios') {
        tryWithRetry(carregarClientesRelatorio); // Carrega clientes para o filtro do relatório
    } else if (pageId === 'despesas') {
        tryWithRetry(carregarDespesas);
    }
}

function logout(e) {
    if (e) e.preventDefault();
    localStorage.removeItem('authToken');
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-container').style.display = 'block';
}

async function carregarClientes() {
    const response = await authenticatedFetch(`${API_URL}/clientes`); // Esta linha pode falhar na inicialização
    const clientes = await response.json();
    // Popula o dropdown de empréstimos
    const select = document.getElementById('emprestimo-cliente');
    select.innerHTML = '<option value="">Selecione um cliente</option>';
    clientes.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.nome;
        select.appendChild(option);
    });
}

async function carregarClientesRelatorio() {
    const response = await authenticatedFetch(`${API_URL}/clientes`);
    const clientes = await response.json();
    // Popula o dropdown de relatórios
    const selectRelatorio = document.getElementById('relatorio-cliente');
    selectRelatorio.innerHTML = '<option value="">Todos os Clientes</option>';
    clientes.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.nome;
        selectRelatorio.appendChild(option);
    });
}

async function carregarTabelaClientes() {
    const response = await authenticatedFetch(`${API_URL}/clientes`);
    const clientes = await response.json();
    const tbody = document.querySelector('#tabela-clientes tbody');
    tbody.innerHTML = '';
    clientes.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c.nome}</td>
            <td>${c.cpf || 'N/A'}</td>
            <td>${c.telefone || 'N/A'}</td>
            <td>
                <button class="btn-pequeno" onclick="abrirModalEdicao(${c.id})">Editar</button>
                <button class="btn-pequeno btn-perigo" onclick="excluirCliente(${c.id}, '${c.nome}')">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function salvarCliente(e) {
    e.preventDefault();
    const nome = document.getElementById('cliente-nome').value;
    const telefone = document.getElementById('cliente-telefone').value;
    const cpf = document.getElementById('cliente-cpf').value;
    const endereco = document.getElementById('cliente-endereco').value;
    const observacoes = document.getElementById('cliente-observacoes').value;

    if (!nome) {
        alert('O nome do cliente é obrigatório.');
        return;
    }

    // Desabilita o botão para evitar cliques duplos
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
        const response = await authenticatedFetch(`${API_URL}/clientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, telefone, cpf, endereco, observacoes })
    });

    if (response.ok) {
        document.getElementById('form-cliente').reset();
        alert('Cliente salvo com sucesso!');
        tryWithRetry(carregarTabelaClientes); // Atualiza a tabela de clientes na mesma página
    } else {
        const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido no servidor.' }));
        console.error('Erro do servidor:', errorData);
        alert(`Falha ao salvar cliente: ${errorData.message || response.statusText}`);
    }
    } catch (error) {
        console.error('Erro de conexão ao salvar cliente:', error);
        alert('Não foi possível conectar ao servidor para salvar o cliente.');
    } finally {
        // Reabilita o botão
        btn.disabled = false;
        btn.textContent = 'Salvar Cliente';
    }
}

async function abrirModalEdicao(id) {
    // Busca os dados mais recentes do cliente para preencher o modal
    const response = await authenticatedFetch(`${API_URL}/clientes`);
    const clientes = await response.json();
    const cliente = clientes.find(c => c.id === id);

    document.getElementById('edit-cliente-id').value = cliente.id;
    document.getElementById('edit-cliente-nome').value = cliente.nome;
    document.getElementById('edit-cliente-telefone').value = cliente.telefone || '';
    document.getElementById('edit-cliente-cpf').value = cliente.cpf || '';
    document.getElementById('edit-cliente-endereco').value = cliente.endereco || '';
    document.getElementById('edit-cliente-observacoes').value = cliente.observacoes || '';
    document.getElementById('modal-editar-cliente').style.display = 'block';
}

async function salvarEdicaoCliente(e) {
    e.preventDefault();
    const id = document.getElementById('edit-cliente-id').value;
    const nome = document.getElementById('edit-cliente-nome').value;
    const telefone = document.getElementById('edit-cliente-telefone').value;
    const cpf = document.getElementById('edit-cliente-cpf').value;
    const endereco = document.getElementById('edit-cliente-endereco').value;
    const observacoes = document.getElementById('edit-cliente-observacoes').value;

    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
        const response = await authenticatedFetch(`${API_URL}/clientes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, telefone, cpf, endereco, observacoes })
        });

        if (response.ok) {
            alert('Cliente atualizado com sucesso!');
            document.getElementById('modal-editar-cliente').style.display = 'none';
            tryWithRetry(carregarTabelaClientes);
            tryWithRetry(carregarClientes);
        } else {
            const errorData = await response.json();
            alert(`Falha ao atualizar cliente: ${errorData.message}`);
        }
    } catch (error) {
        alert('Erro de conexão ao tentar atualizar o cliente.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar Alterações';
    }
}

async function excluirCliente(id, nome) {
    if (!confirm(`Tem certeza que deseja excluir o cliente "${nome}"? Esta ação não pode ser desfeita.`)) {
        return;
    }

    try {
        const response = await authenticatedFetch(`${API_URL}/clientes/${id}`, { method: 'DELETE' });

        if (response.ok) {
            alert('Cliente excluído com sucesso!');
            tryWithRetry(carregarTabelaClientes); // Atualiza a tabela
            tryWithRetry(carregarClientes); // Atualiza o dropdown de empréstimos
        } else {
            const errorData = await response.json();
            alert(`Falha ao excluir cliente: ${errorData.message}`);
        }
    } catch (error) {
        alert('Erro de conexão ao tentar excluir o cliente.');
    }
}

async function carregarEmprestimos() {
    const response = await authenticatedFetch(`${API_URL}/emprestimos`); // Esta linha pode falhar na inicialização
    const emprestimos = await response.json();
    const tbody = document.querySelector('#tabela-emprestimos tbody');
    tbody.innerHTML = '';
    emprestimos.forEach(e => {
        const tr = document.createElement('tr');
        const vencimentoTexto = String(e.data_vencimento_original || '').slice(0, 10);
        const [ano, mes, dia] = vencimentoTexto.split('-').map(Number);
        const hoje = new Date();
        const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
        const vencimentoUtc = Date.UTC(ano, mes - 1, dia);
        const diasAtrasoCalculados = vencimentoTexto
            ? Math.max(0, Math.floor((hojeUtc - vencimentoUtc) / 86400000))
            : 0;
        const temAtraso = e.status === 'Ativo' && diasAtrasoCalculados > 0;
        if (temAtraso) {
            tr.classList.add('emprestimo-atrasado');
        }
        const valorPrincipal = parseFloat(e.valor_total) || 0;
        const valorFinalAtualizado = parseFloat(e.valor_final_atualizado) || 0;

        const isPago = e.status === 'Pago';
        let statusClass = '';
        if (isPago) {
            statusClass = 'status-paga';
        } else if (temAtraso) {
            statusClass = 'status-atrasada';
        }
        // Não é necessário classe para 'Ativo', pois ele não tem cor especial.

        tr.innerHTML = `
            <td>${e.nome_cliente}</td>
            <td>${e.descricao}</td>
            <td>R$ ${valorPrincipal.toFixed(2)}</td>
            <td><b>R$ ${valorFinalAtualizado.toFixed(2)}</b></td>
            <td>${new Date(e.data_emprestimo).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
            <td>${new Date(e.data_vencimento_original).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
            <td>${(parseFloat(e.juros_emprestimo_percentual) || 0).toFixed(1)}%</td>
            <td class="${statusClass}">${temAtraso ? 'Atrasado' : (e.status || 'Ativo')}</td>
            <td style="color: ${diasAtrasoCalculados > 0 ? 'var(--color-danger)' : 'inherit'}; font-weight: ${diasAtrasoCalculados > 0 ? 'bold' : 'normal'};">${diasAtrasoCalculados}</td>
            <td>${(parseFloat(e.juros_diario_percentual) || 0).toFixed(1)}%</td>
            <td class="actions-cell">
                <div class="action-buttons">
                    <button class="btn-icon btn-quitar" onclick="quitarEmprestimo(${e.id}, ${valorFinalAtualizado})" title="Quitar Empréstimo" ${isPago ? 'disabled' : ''}><i class="fas fa-check-circle"></i></button>
                    <button class="btn-icon btn-edit" onclick="abrirModalEdicaoEmprestimo(${e.id})" title="Editar Empréstimo" ${isPago ? 'disabled' : ''}><i class="fas fa-edit"></i></button>
                    <button class="btn-icon btn-delete" onclick="excluirEmprestimo(${e.id})" title="Excluir Empréstimo"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function registrarEmprestimo(e) {
    e.preventDefault();
    const emprestimo = {
        cliente_id: document.getElementById('emprestimo-cliente').value,
        descricao: document.getElementById('emprestimo-descricao').value,
        data_emprestimo: document.getElementById('emprestimo-data').value,
        valor_total: parseFloat(document.getElementById('emprestimo-valor').value),
        data_vencimento_original: document.getElementById('emprestimo-vencimento').value,
        juros_emprestimo_percentual: parseFloat(document.getElementById('emprestimo-juros').value) || 0,
        juros_diario_percentual: parseFloat(document.getElementById('emprestimo-juros-diario').value) || 0,
    };

    // Desabilita o botão para evitar cliques duplos
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Registrando...';

    try {
        const response = await authenticatedFetch(`${API_URL}/emprestimos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emprestimo)
        });

        if (response.ok) {
            document.getElementById('form-emprestimo').reset();
            alert('Empréstimo registrado com sucesso!');
            tryWithRetry(carregarEmprestimos); // Recarrega a lista de empréstimos na mesma tela
            tryWithRetry(carregarDashboard); // Atualiza os KPIs e alertas no dashboard
        } else {
            const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido no servidor.' }));
            console.error('Erro do servidor:', errorData);
            alert(`Falha ao registrar empréstimo: ${errorData.message || response.statusText}`);
        }
    } catch (error) {
        console.error('Erro de conexão ao registrar empréstimo:', error);
        alert('Não foi possível conectar ao servidor para registrar o empréstimo.');
    } finally {
        // Reabilita o botão
        btn.disabled = false;
        btn.textContent = 'Registrar Empréstimo';
    }
}

async function abrirModalEdicaoEmprestimo(id) {
    // Busca os dados mais recentes do empréstimo
    const response = await authenticatedFetch(`${API_URL}/emprestimos`);
    const emprestimos = await response.json();
    const emprestimo = emprestimos.find(e => e.id === id);

    // Popula o dropdown de clientes dentro do modal
    const clienteSelect = document.getElementById('edit-emprestimo-cliente');
    const clientesResponse = await authenticatedFetch(`${API_URL}/clientes`);
    const clientes = await clientesResponse.json();
    clienteSelect.innerHTML = '';
    clientes.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.nome;
        clienteSelect.appendChild(option);
    });

    // Preenche o formulário do modal
    document.getElementById('edit-emprestimo-id').value = emprestimo.id;
    clienteSelect.value = emprestimo.cliente_id;
    document.getElementById('edit-emprestimo-descricao').value = emprestimo.descricao;
    document.getElementById('edit-emprestimo-valor').value = emprestimo.valor_total;
    document.getElementById('edit-emprestimo-vencimento').value = emprestimo.data_vencimento_original.split('T')[0];
    document.getElementById('edit-emprestimo-juros').value = emprestimo.juros_emprestimo_percentual;
    document.getElementById('edit-emprestimo-juros-diario').value = emprestimo.juros_diario_percentual;

    document.getElementById('modal-editar-emprestimo').style.display = 'block';
}

async function salvarEdicaoEmprestimo(e) {
    e.preventDefault();
    const id = document.getElementById('edit-emprestimo-id').value;
    const emprestimo = {
        cliente_id: document.getElementById('edit-emprestimo-cliente').value,
        descricao: document.getElementById('edit-emprestimo-descricao').value,
        valor_total: parseFloat(document.getElementById('edit-emprestimo-valor').value),
        data_vencimento_original: document.getElementById('edit-emprestimo-vencimento').value,
        juros_emprestimo_percentual: parseFloat(document.getElementById('edit-emprestimo-juros').value) || 0,
        juros_diario_percentual: parseFloat(document.getElementById('edit-emprestimo-juros-diario').value) || 0,
    };

    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
        const response = await authenticatedFetch(`${API_URL}/emprestimos/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emprestimo)
        });

        if (response.ok) {
            alert('Empréstimo atualizado com sucesso!');
            document.getElementById('modal-editar-emprestimo').style.display = 'none';
            await carregarEmprestimos();
            await carregarDashboard();
        } else {
            const errorData = await response.json();
            alert(`Falha ao atualizar empréstimo: ${errorData.message}`);
        }
    } catch (error) {
        const errorData = error instanceof Response
            ? await error.json().catch(() => ({}))
            : {};
        alert(`Erro ao atualizar empréstimo: ${errorData.message || 'não foi possível conectar ao servidor.'}`);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar Alterações';
    }
}

async function excluirEmprestimo(id) {
    if (!confirm('Tem certeza que deseja excluir este empréstimo? Todas as parcelas associadas também serão removidas. Esta ação não pode ser desfeita.')) return;

    await authenticatedFetch(`${API_URL}/emprestimos/${id}`, { method: 'DELETE' });
    alert('Empréstimo excluído com sucesso!');
    await carregarEmprestimos();
    await carregarDashboard();
}

async function quitarEmprestimo(id, valorFinal) {
    if (!confirm(`Tem certeza que deseja quitar este empréstimo no valor de R$ ${valorFinal.toFixed(2)}? Ele será movido para o status "Pago".`)) return;

    try {
        await authenticatedFetch(`${API_URL}/emprestimos/${id}/quitar`, { method: 'PATCH' });
        alert('Empréstimo quitado com sucesso!');
        await carregarEmprestimos();
        await carregarDashboard();
    } catch (error) {
        const errorData = error instanceof Response
            ? await error.json().catch(() => ({}))
            : {};
        alert(`Erro ao quitar empréstimo: ${errorData.message || 'não foi possível conectar ao servidor.'}`);
    }
}

async function reativarEmprestimo(id) {
    if (!confirm('Tem certeza que deseja reativar este empréstimo? Ele voltará para o status "Ativo".')) return;

    await authenticatedFetch(`${API_URL}/emprestimos/${id}/reativar`, { method: 'PATCH' });
    alert('Empréstimo reativado com sucesso!');
    // Regera o relatório para refletir a mudança
    document.getElementById('form-relatorio').dispatchEvent(new Event('submit'));
}


async function verParcelas(emprestimoId, nomeCliente) {
    const response = await authenticatedFetch(`${API_URL}/emprestimos/${emprestimoId}/parcelas`);
    const parcelas = await response.json();
    const modal = document.getElementById('modal-parcelas');
    const titulo = document.getElementById('modal-titulo');
    const tbody = document.querySelector('#tabela-parcelas tbody');

    titulo.textContent = `Parcelas de ${nomeCliente}`;
    tbody.innerHTML = '';

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    parcelas.forEach(p => {
        const tr = document.createElement('tr');
        const dataVenc = new Date(p.data_vencimento);
        let statusClass = '';
        let statusText = p.status;

        if (p.status === 'Pendente' && dataVenc < hoje) {
            statusClass = 'status-atrasada';
            statusText = 'Atrasada';
        } else if (p.status === 'Paga') {
            statusClass = 'status-paga';
        } else {
            statusClass = 'status-pendente';
        }

        tr.innerHTML = `
            <td>${p.numero_parcela}</td>
            <td>R$ ${parseFloat(p.valor_parcela).toFixed(2)}</td>
            <td>${dataVenc.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
            <td class="${statusClass}">${statusText}</td>
            <td>
                ${p.status === 'Pendente' ? `<button onclick="pagarParcela(${p.id}, ${emprestimoId})">Dar Baixa</button>` : 'OK'}
            </td>
        `;
        tbody.appendChild(tr);
    });

    modal.style.display = 'block';
}

async function pagarParcela(parcelaId, emprestimoId, nomeCliente) {
    if (!confirm('Confirmar o pagamento desta parcela?')) return;

    await authenticatedFetch(`${API_URL}/parcelas/${parcelaId}/pagar`, { method: 'PATCH' }); // A variável nomeCliente não é usada aqui
    await verParcelas(emprestimoId, document.getElementById('modal-titulo').textContent.replace('Parcelas de ', '')); // Recarrega o modal
    await carregarDashboard(); // Atualiza os KPIs e alertas no dashboard
}

function dataLocalDaApi(valor) {
    const texto = String(valor || '').slice(0, 10);
    const partes = texto.split('-').map(Number);
    if (partes.length !== 3 || partes.some(Number.isNaN)) return null;
    return new Date(partes[0], partes[1] - 1, partes[2]);
}

function formatarDataApi(valor) {
    const data = dataLocalDaApi(valor);
    return data ? data.toLocaleDateString('pt-BR') : '-';
}

async function carregarDespesas() {
    const response = await authenticatedFetch(`${API_URL}/despesas`);
    const despesas = await response.json();
    const tbody = document.querySelector('#tabela-despesas tbody');
    tbody.innerHTML = '';

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    despesas.forEach(d => {
        const tr = document.createElement('tr');
        const dataVenc = dataLocalDaApi(d.data_vencimento);
        let statusClass = '';

        if (d.status === 'Pendente' && dataVenc && dataVenc < hoje) {
            statusClass = 'status-atrasada'; // Reutiliza a classe de parcela atrasada
        } else if (d.status === 'Paga') {
            statusClass = 'status-paga';
        }

        tr.innerHTML = `
            <td>${d.descricao}</td>
            <td>${d.tipo}</td>
            <td>R$ ${parseFloat(d.valor).toFixed(2)}</td>
            <td>${formatarDataApi(d.data_vencimento)}</td>
            <td class="${statusClass}">${d.status}</td>
            <td>${d.forma_pagamento || '-'}</td>
            <td class="actions-cell">
                <div class="action-buttons">
                    ${d.status === 'Pendente' ? `<button class="btn-icon btn-quitar" onclick="pagarDespesa(${d.id})" title="Pagar conta" aria-label="Pagar conta"><i class="fas fa-check"></i></button>` : `<span class="pago-em">Pago em ${formatarDataApi(d.data_pagamento)}</span>`}
                    <button class="btn-icon btn-delete" onclick="excluirDespesa(${d.id})" title="Excluir conta" aria-label="Excluir conta"><i class="fas fa-trash-alt"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function salvarDespesa(e) {
    e.preventDefault();
    const despesa = {
        descricao: document.getElementById('despesa-descricao').value,
        valor: parseFloat(document.getElementById('despesa-valor').value),
        tipo: document.getElementById('despesa-tipo').value,
        data_vencimento: document.getElementById('despesa-vencimento').value,
    };

    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
        const response = await authenticatedFetch(`${API_URL}/despesas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(despesa)
        });

        if (response.ok) {
            document.getElementById('form-despesa').reset();
            alert('Despesa salva com sucesso!');
            await carregarDespesas();
        } else {
            alert('Falha ao salvar despesa.');
        }
    } catch (error) {
        alert('Erro de conexão ao salvar a despesa.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar Despesa';
    }
}

let despesaSelecionadaParaPagamento = null;

function pagarDespesa(id) {
    despesaSelecionadaParaPagamento = id;
    document.getElementById('forma-pagamento').value = '';
    document.getElementById('modal-pagar-despesa').style.display = 'block';
}

function fecharModalPagamento() {
    document.getElementById('modal-pagar-despesa').style.display = 'none';
    despesaSelecionadaParaPagamento = null;
}

async function confirmarPagamentoDespesa(e) {
    e.preventDefault();
    const formaPagamento = document.getElementById('forma-pagamento').value;
    if (!despesaSelecionadaParaPagamento || !formaPagamento) return;

    try {
        await authenticatedFetch(`${API_URL}/despesas/${despesaSelecionadaParaPagamento}/pagar`, {
            method: 'PATCH',
            body: JSON.stringify({ forma_pagamento: formaPagamento })
        });
        fecharModalPagamento();
        await carregarDespesas();
    } catch (error) {
        alert('Não foi possível registrar a forma de pagamento.');
    }
}

async function excluirDespesa(id) {
    if (!confirm('Tem certeza que deseja excluir esta despesa?')) return;
    await authenticatedFetch(`${API_URL}/despesas/${id}`, { method: 'DELETE' });
    await carregarDespesas();
}

async function gerarRelatorio(e) {
    e.preventDefault();
    const clienteId = document.getElementById('relatorio-cliente').value;
    const mes = document.getElementById('relatorio-mes').value;
    const dia = document.getElementById('relatorio-dia').value;

    const params = new URLSearchParams();
    if (clienteId) params.append('cliente_id', clienteId);
    if (mes) params.append('mes', mes);
    if (dia) params.append('dia', dia);

    const response = await authenticatedFetch(`${API_URL}/relatorios?${params.toString()}`);
    const dados = await response.json();

    const resultadoDiv = document.getElementById('resultado-relatorio');
    const resumoDiv = document.getElementById('relatorio-resumo');
    const tabelaBody = document.querySelector('#tabela-relatorio tbody');

    tabelaBody.innerHTML = '';

    if (dados.length === 0) {
        resumoDiv.innerHTML = '<p>Nenhum empréstimo encontrado para os filtros selecionados.</p>';
        tabelaBody.innerHTML = '<tr><td colspan="5">Nenhum empréstimo a ser exibido.</td></tr>';
    } else {
        let valorTotal = 0;
        dados.forEach(item => {
            valorTotal += parseFloat(item.valor_total);
            const tr = document.createElement('tr');
            let acoes = '';
            if (item.status === 'Pago') {
                acoes = `<button class="btn-icon" onclick="reativarEmprestimo(${item.id})" title="Reativar Empréstimo"><i class="fas fa-undo"></i></button>`;
            }

            tr.innerHTML = `
                <td>${item.nome_cliente}</td><td>R$ ${parseFloat(item.valor_total).toFixed(2)}</td><td>${new Date(item.data_emprestimo).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td><td>${item.status}</td>
                <td>${acoes}</td>
            `;
            tabelaBody.appendChild(tr);
        });

        resumoDiv.innerHTML = `
            <div class="report-metric"><span>Empréstimos encontrados</span><strong>${dados.length}</strong></div>
            <div class="report-metric"><span>Valor principal</span><strong>R$ ${valorTotal.toFixed(2)}</strong></div>
            <div class="report-metric"><span>Ticket médio</span><strong>R$ ${(valorTotal / dados.length).toFixed(2)}</strong></div>
        `;
    }

    resultadoDiv.style.display = 'block';
}

function limparFiltrosRelatorio() {
    document.getElementById('form-relatorio').reset();
    document.getElementById('resultado-relatorio').style.display = 'none';
}

async function verificarAlertas() {
    // Usando a nova rota otimizada para alertas
    const response = await authenticatedFetch(`${API_URL}/alertas`);
    const alertas = await response.json();
    const listaAlertas = document.getElementById('lista-alertas');
    listaAlertas.innerHTML = '';

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    alertas.forEach(alerta => {
        const dataVenc = new Date(alerta.data_vencimento + 'T00:00:00');
        const diffTime = dataVenc - hoje;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const itemAlerta = document.createElement('li');

        if (diffDays < 0) {
            itemAlerta.className = 'alerta-item vencido';
            itemAlerta.innerHTML = `<i class="fas fa-triangle-exclamation"></i><span><strong>Vencida</strong><small>Parcela ${alerta.numero_parcela} de ${alerta.nome_cliente}</small></span><time>${Math.abs(diffDays)} dia(s) em atraso</time>`;
        } else {
            itemAlerta.className = 'alerta-item proximo';
            itemAlerta.innerHTML = `<i class="fas fa-calendar-day"></i><span><strong>Próximo vencimento</strong><small>Parcela ${alerta.numero_parcela} de ${alerta.nome_cliente}</small></span><time>${diffDays === 0 ? 'Hoje' : `em ${diffDays} dia(s)`}</time>`;
        }
        listaAlertas.appendChild(itemAlerta);
    });

    if (listaAlertas.children.length === 0) {
        listaAlertas.innerHTML = '<li class="alerta-vazio"><i class="fas fa-circle-check"></i> Nenhum vencimento próximo.</li>';
    }
}

let emprestimosChartInstance = null; // Variável para guardar a instância do gráfico
let statusChartInstance = null; // Variável para o gráfico de pizza


async function carregarDashboard() {
    // Busca os dados dos KPIs e do gráfico
    const response = await authenticatedFetch(`${API_URL}/dashboard`);
    const data = await response.json();

    // DEBUG: Mostra no console (F12) os dados recebidos do servidor para o dashboard.
    console.log('Dados recebidos para o Dashboard:', data);

    // 1. Atualiza os cards de KPI
    document.getElementById('kpi-clientes').textContent = data.totalClientes;
    document.getElementById('kpi-emprestimos').textContent = data.totalEmprestimos;
    document.getElementById('kpi-valor-total').textContent = (parseFloat(data.valorTotal) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('kpi-emprestimos-atrasados').textContent = data.emprestimosAtrasados;
    document.getElementById('kpi-juros-receber').textContent = (parseFloat(data.jurosAReceber) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // O total a receber é a soma do valor principal emprestado mais os juros a receber.
    const totalAReceber = (parseFloat(data.valorTotal) || 0) + (parseFloat(data.jurosAReceber) || 0);
    document.getElementById('kpi-total-receber').textContent = totalAReceber.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
    
    // 2. Renderiza o gráfico
    renderEmprestimosChart(data.emprestimosPorMes);

    // 3. Renderiza o novo gráfico de pizza
    renderStatusChart(data.emprestimosPorStatus);

    // 4. Carrega os alertas (função que já existia)
    await verificarAlertas();
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function renderEmprestimosChart(emprestimosPorMes) {
    const ctx = document.getElementById('emprestimosChart').getContext('2d');
    
    // Mapeia os dados para o formato do gráfico
    const labels = emprestimosPorMes.map(item => {
        const [ano, mes] = item.mes.split('-');
        return `${mes}/${ano.slice(2)}`; // Formato "MM/AA"
    });
    const chartData = emprestimosPorMes.map(item => item.total);

    // Garante que o gráfico anterior seja destruído antes de renderizar um novo
    // Destrói o gráfico anterior se ele existir (para evitar sobreposição ao recarregar)
    if (emprestimosChartInstance) {
        emprestimosChartInstance.destroy();
    }

    // Pega as cores do tema atual dinamicamente
    const style = getComputedStyle(document.body);
    const accentColor = style.getPropertyValue('--accent-primary').trim();
    const textColor = style.getPropertyValue('--text-secondary').trim();
    const gridColor = style.getPropertyValue('--border-color').trim();

    // Cria um gradiente para o fundo das barras
    const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    gradient.addColorStop(0, hexToRgba(accentColor, 0.8));
    gradient.addColorStop(1, hexToRgba(accentColor, 0.2));

    emprestimosChartInstance = new Chart(ctx, {
        type: 'bar', // Tipo de gráfico: 'bar', 'line', 'pie', etc.
        data: {
            labels: labels,
            datasets: [{
                label: 'Nº de Empréstimos',
                data: chartData,
                backgroundColor: gradient,
                borderColor: accentColor,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: { color: textColor }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        // Garante que o eixo Y só mostre números inteiros
                        stepSize: 1,
                        color: textColor
                    },
                    grid: { color: gridColor }
                }
            }
        }
    });
}

function renderStatusChart(statusData) {
    const ctx = document.getElementById('statusChart').getContext('2d');

    const labels = statusData.map(item => item.status);
    const data = statusData.map(item => item.count);

    const style = getComputedStyle(document.body);
    const colorSuccess = style.getPropertyValue('--color-success').trim();
    const colorWarning = style.getPropertyValue('--color-warning').trim();
    const colorDanger = style.getPropertyValue('--color-danger').trim();
    const textColor = style.getPropertyValue('--text-secondary').trim();

    const backgroundColors = labels.map(label => {
        if (label.toLowerCase() === 'ativo') return hexToRgba(colorWarning, 0.8);
        if (label.toLowerCase() === 'pago') return hexToRgba(colorSuccess, 0.8);
        if (label.toLowerCase() === 'atrasado') return hexToRgba(colorDanger, 0.8);
        return hexToRgba(textColor, 0.5);
    });

    if (statusChartInstance) {
        statusChartInstance.destroy();
    }

    statusChartInstance = new Chart(ctx, {
        type: 'doughnut', // 'pie' ou 'doughnut'
        data: {
            labels: labels,
            datasets: [{
                label: 'Status dos Empréstimos',
                data: data,
                backgroundColor: backgroundColors,
                borderColor: style.getPropertyValue('--bg-medium').trim(),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: textColor
                    }
                }
            }
        }
    });
}
