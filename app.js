// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBLiKdwjB77BR3XByLpbnpOkYM6L0wHr1Y",
  authDomain: "alvoleds-aab35.firebaseapp.com",
  projectId: "alvoleds-aab35",
  storageBucket: "alvoleds-aab35.firebasestorage.app",
  messagingSenderId: "397291431762",
  appId: "1:397291431762:web:2ff438e326bb5ae2f3fc8b"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// Lojas disponíveis
const stores = [
  { id: "unamar", name: "UNAMAR" },
  { id: "macae-ii", name: "MACAÉ II" },
  { id: "bacaxa-ii", name: "BACAXÁ II" },
  { id: "copacabana", name: "COPACABANA" },
  { id: "botafogo", name: "BOTAFOGO" }
];

// Estado da aplicação
let currentStore = stores[0];
let currentSection = "marcas";
let storeStatus = {};
let marcaToRemove = null;
let retirarLojasState = null;

// Elementos DOM
const storesEl = document.getElementById("stores");
const contentEl = document.getElementById("content");
const storeTitle = document.getElementById("storeTitle");
const sectionTitle = document.getElementById("sectionTitle");
const sidebar = document.getElementById("sidebar");
const addBtn = document.getElementById("addBtn");
const searchMarcas = document.getElementById("searchMarcas");
const searchBox = document.getElementById("searchBox");

// Modais
const modalMarca = document.getElementById("modalMarca");
const formMarca = document.getElementById("formMarca");
const cancelMarca = document.getElementById("cancelMarca");
const modalRetirar = document.getElementById("modalRetirar");
const cancelRetirar = document.getElementById("cancelRetirar");
const confirmRetirar = document.getElementById("confirmRetirar");
const modalRetirarLojas = document.getElementById("modalRetirarLojas");

// Helper para chave de aprovação no Firestore
function sanitizeRetiradaId(nome, saida) {
  const n = nome.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const d = saida.replace(/-/g, '');
  return `${n}__${d}`;
}

// Inicialização
async function init() {
  await loadStoreStatus();
  renderStores();
  setupSidebar();
  setupModals();
  setupSearch();
  loadContent();
}

// Carregar status das lojas do Firebase
async function loadStoreStatus() {
  for (const store of stores) {
    try {
      const doc = await db.collection("painel").doc(store.id).get();
      if (doc.exists) {
        storeStatus[store.id] = doc.data().active !== false;
      } else {
        storeStatus[store.id] = true;
        await db.collection("painel").doc(store.id).set({ active: true });
      }
    } catch (e) {
      storeStatus[store.id] = true;
    }
  }
}



// Contar marcas ativas de uma loja
async function countActiveMarcas(storeId) {
  try {
    const snap = await db.collection("painel").doc(storeId).collection("marcas").get();
    return snap.size;
  } catch (e) {
    return 0;
  }
}

// Contar saídas de uma loja
async function countSaidas(storeId) {
  try {
    const snap = await db.collection("painel").doc(storeId).collection("saidas").get();
    return snap.size;
  } catch (e) {
    return 0;
  }
}

// Renderizar lojas no header
async function renderStores() {
  storesEl.innerHTML = "";
  
  for (const store of stores) {
    const count = await countActiveMarcas(store.id);
    const isActive = storeStatus[store.id];
    const isSelected = store.id === currentStore.id;
    
    const pill = document.createElement("div");
    pill.className = `store-pill ${isSelected ? 'active' : ''} ${!isActive ? 'inactive' : ''}`;
    pill.innerHTML = `
      <div class="store-header">
        <span>${store.name}</span>
        <button class="power-btn" data-store="${store.id}" title="${isActive ? 'Desligar' : 'Ligar'} loja">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
            <line x1="12" y1="2" x2="12" y2="12"></line>
          </svg>
        </button>
      </div>
      <div class="store-count">
        <span class="dot"></span>
        <span>${count} MARCAS ATIVAS</span>
      </div>
    `;
    
    // Clique na pill para selecionar loja
    pill.addEventListener("click", (e) => {
      if (!e.target.closest('.power-btn')) {
        currentStore = store;
        renderStores();
        loadContent();
      }
    });
    
    // Clique no botão power
    const powerBtn = pill.querySelector('.power-btn');
    powerBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await toggleStoreStatus(store.id);
    });
    
    storesEl.appendChild(pill);
  }
  
  storeTitle.textContent = currentStore.name;
}

// Alternar status da loja
async function toggleStoreStatus(storeId) {
  const newStatus = !storeStatus[storeId];
  storeStatus[storeId] = newStatus;
  
  try {
    await db.collection("painel").doc(storeId).update({ active: newStatus });
  } catch (e) {
    console.error("Erro ao atualizar status:", e);
  }
  
  renderStores();
}

// Setup sidebar
function setupSidebar() {
  const navItems = sidebar.querySelectorAll('.nav-item');
  
  navItems.forEach(item => {
    item.addEventListener('click', async () => {
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      currentSection = item.dataset.section;
      sectionTitle.textContent = item.textContent;
      
      loadContent();
    });
  });
}

// Setup modais
function setupModals() {
  // Modal criar marca
  addBtn.addEventListener('click', () => {
    if (currentSection === 'marcas') {
      // Resetar modo de edição
      document.getElementById('marcaEditId').value = '';
      document.getElementById('modalMarcaTitle').textContent = 'Nova Marca';
      document.getElementById('submitMarca').textContent = 'Criar Marca';
      
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('marcaEntrada').value = today;
      document.getElementById('saidaIndeterminada').checked = false;
      document.getElementById('marcaSaida').disabled = false;
      document.getElementById('marcaSaida').required = true;
      
      modalMarca.classList.add('active');
      
      // Marcar loja atual por padrão e desabilitar lojas inativas
      document.querySelectorAll('input[name="storeSelect"]').forEach(cb => {
        const storeId = cb.value;
        const storeActive = storeStatus[storeId];
        const label = cb.closest('.store-checkbox');
        
        if (!storeActive) {
          cb.disabled = true;
          cb.checked = false;
          label.classList.add('disabled');
        } else {
          cb.disabled = false;
          label.classList.remove('disabled');
          cb.checked = cb.value === currentStore.id;
        }
      });
    }
  });
  
  // Listener para checkbox de data indeterminada
  const saidaIndeterminada = document.getElementById('saidaIndeterminada');
  const marcaSaida = document.getElementById('marcaSaida');
  
  saidaIndeterminada.addEventListener('change', () => {
    if (saidaIndeterminada.checked) {
      marcaSaida.disabled = true;
      marcaSaida.required = false;
      marcaSaida.value = '';
    } else {
      marcaSaida.disabled = false;
      marcaSaida.required = true;
    }
  });
  
  cancelMarca.addEventListener('click', () => {
    modalMarca.classList.remove('active');
    formMarca.reset();
    resetFileUpload();
    document.getElementById('marcaEditId').value = '';
    document.getElementById('saidaIndeterminada').checked = false;
    document.getElementById('marcaSaida').disabled = false;
  });
  
  formMarca.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('marcaEditId').value;
    if (editId) {
      await editarMarca(editId);
    } else {
      await criarMarca();
    }
  });
  
  // Setup file upload drag and drop
  setupFileUpload();
  
  // Modal retirar
  cancelRetirar.addEventListener('click', () => {
    modalRetirar.classList.remove('active');
    marcaToRemove = null;
  });
  
  confirmRetirar.addEventListener('click', async () => {
    if (marcaToRemove) {
      await retirarMarca(marcaToRemove);
      modalRetirar.classList.remove('active');
      marcaToRemove = null;
    }
  });
  
  // Fechar modal ao clicar fora
  modalMarca.addEventListener('click', (e) => {
    if (e.target === modalMarca) {
      modalMarca.classList.remove('active');
      formMarca.reset();
      resetFileUpload();
    }
  });
  
  modalRetirar.addEventListener('click', (e) => {
    if (e.target === modalRetirar) {
      modalRetirar.classList.remove('active');
      marcaToRemove = null;
    }
  });
  
  // Modal detalhes saída
  const modalSaidaDetalhes = document.getElementById('modalSaidaDetalhes');
  const closeSaidaDetalhes = document.getElementById('closeSaidaDetalhes');
  
  closeSaidaDetalhes.addEventListener('click', () => {
    modalSaidaDetalhes.classList.remove('active');
  });
  
  modalSaidaDetalhes.addEventListener('click', (e) => {
    if (e.target === modalSaidaDetalhes) {
      modalSaidaDetalhes.classList.remove('active');
    }
  });

  // Modal retirar lojas (seleção multi-loja)
  document.getElementById('cancelRetirarLojas').addEventListener('click', () => {
    modalRetirarLojas.classList.remove('active');
    retirarLojasState = null;
  });

  document.getElementById('confirmRetirarLojas').addEventListener('click', () => {
    confirmarRetiradaLojas();
  });

  modalRetirarLojas.addEventListener('click', (e) => {
    if (e.target === modalRetirarLojas) {
      modalRetirarLojas.classList.remove('active');
      retirarLojasState = null;
    }
  });
}

// Setup busca de marcas
function setupSearch() {
  if (!searchMarcas) return;
  
  searchMarcas.addEventListener('input', async (e) => {
    const term = e.target.value.trim();
    
    // Recarregar saídas com filtro
    if (currentSection === 'saidas') {
      await loadSaidas(term);
    }
  });
  
  // Limpar busca com ESC
  searchMarcas.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchMarcas.value = '';
      if (currentSection === 'saidas') {
        loadSaidas('');
      }
    }
  });
}

// Fechar cards ao clicar fora
document.addEventListener('click', (e) => {
  if (!e.target.closest('.card')) {
    document.querySelectorAll('.card.show-actions').forEach(card => {
      card.classList.remove('show-actions');
    });
  }
});

// Carregar conteúdo baseado na seção atual
async function loadContent() {
  contentEl.innerHTML = '<div class="empty-state"><p>Carregando...</p></div>';
  
  // Mostrar/ocultar busca e contador baseado na seção
  const searchBox = document.getElementById('searchBox');
  const searchMarcas = document.getElementById('searchMarcas');
  const saidasInfo = document.getElementById('saidasInfo');
  
  if (currentSection === 'saidas') {
    searchBox.style.display = 'block';
    saidasInfo.style.display = 'block';
    const count = await countSaidas(currentStore.id);
    document.getElementById('totalSaidasCount').textContent = count;
  } else {
    searchBox.style.display = 'none';
    saidasInfo.style.display = 'none';
    // Limpar busca ao sair de saídas
    if (searchMarcas) searchMarcas.value = '';
  }
  
  switch (currentSection) {
    case 'marcas':
      await loadMarcas();
      break;
    case 'saidas':
      await loadSaidas('');
      break;
    case 'midias':
      await loadMidias();
      break;
  }
}

// Carregar marcas
async function loadMarcas() {
  try {
    const snap = await db.collection("painel").doc(currentStore.id).collection("marcas").get();

    // Buscar aprovações de remoção feitas no dashboard
    const aprovados = new Set();
    try {
      const aprovSnap = await db.collection("remocoes_aprovadas").get();
      aprovSnap.forEach(doc => aprovados.add(doc.id));
    } catch (_) {}

    if (snap.empty) {
      contentEl.innerHTML = `
        <div class="empty-state">
          <p>Nenhuma marca cadastrada</p>
        </div>
      `;
      return;
    }
    
    let cardsHtml = '<div class="cards">';
    
    snap.forEach(doc => {
      const data = doc.data();
      const id = doc.id;
      
      // Verificar se é indeterminado
      const isIndeterminado = data.saida === 'indeterminado';
      
      let progresso, expirado, cor, saidaFormatada;
      
      if (isIndeterminado) {
        progresso = 100;
        expirado = false;
        cor = '#60a5fa'; // azul claro
        saidaFormatada = 'INDETERMINADO';
      } else {
        // Calcular progresso
        const hoje = new Date();
        const entrada = new Date(data.entrada);
        const saida = new Date(data.saida);
        const totalDias = Math.ceil((saida - entrada) / (1000 * 60 * 60 * 24));
        const diasPassados = Math.ceil((hoje - entrada) / (1000 * 60 * 60 * 24));
        progresso = Math.min(100, Math.max(0, (diasPassados / totalDias) * 100));
        
        // Verificar se está expirado
        expirado = hoje > saida;
        
        // Cor baseada no progresso
        cor = '#22c55e'; // verde
        if (progresso > 50) cor = '#f97316'; // laranja
        if (progresso > 75) cor = '#ef4444'; // vermelho
        
        saidaFormatada = formatDate(data.saida);
      }
      
      // Formatar datas
      const entradaFormatada = formatDate(data.entrada);

      // Verificar se foi aprovado para remoção no dashboard
      const aprovKey = isIndeterminado ? null : sanitizeRetiradaId(data.nome, data.saida);
      const isAprovadoRemocao = !!aprovKey && aprovados.has(aprovKey);

      const safeNome = data.nome.replace(/'/g, "\\'");
      const safeSaida = (data.saida || '').replace(/'/g, "\\'");

      cardsHtml += `
        <div class="card" data-id="${id}" data-expirado="${expirado}" data-aprovado="${isAprovadoRemocao}">
          ${isAprovadoRemocao ? '<div class="aprovado-badge">✓ APROVADO PARA REMOÇÃO</div>' : ''}
          <div class="card-content" onclick="toggleCardActions('${id}')">
            <h3>${data.nome}</h3>
            <div class="card-dates">
              <div class="date-group">
                <div class="date-label">ENTRADA:</div>
                <div class="date-value">${entradaFormatada}</div>
              </div>
              <div class="date-group">
                <div class="date-label">SAÍDA:</div>
                <div class="date-value">${saidaFormatada}</div>
              </div>
            </div>
          </div>
          <div class="card-progress" onclick="toggleCardActions('${id}')">
            <div class="progress-fill" style="width:${progresso}%;background:${cor}"></div>
            <div class="progress-empty"></div>
          </div>
          <div class="card-actions" onclick="event.stopPropagation()">
            <button class="btn-editar" onclick="openEditarModal('${id}')">EDITAR</button>
            ${isAprovadoRemocao
              ? `<button class="btn-remover" onclick="openRemoverAprovadoModal('${safeNome}', '${safeSaida}')">✓ REMOVER</button>`
              : `<button class="btn-retirar" onclick="openRetirarModal('${id}', '${safeNome}', ${expirado})">RETIRAR</button>`
            }
            <div class="obs-container">
              <input type="checkbox" id="obs-${id}">
              <label for="obs-${id}">Adicionar Obs</label>
            </div>
            <input type="text" class="obs-input" placeholder="OBS:" style="display:none" id="obs-input-${id}">
          </div>
        </div>
      `;
    });
    
    cardsHtml += '</div>';
    contentEl.innerHTML = cardsHtml;
    
    // Adicionar event listeners para os checkboxes
    document.querySelectorAll('.obs-container input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.id.replace('obs-', '');
        const obsInput = document.getElementById(`obs-input-${id}`);
        obsInput.style.display = e.target.checked ? 'block' : 'none';
      });
    });
    
  } catch (e) {
    console.error("Erro ao carregar marcas:", e);
    contentEl.innerHTML = '<div class="empty-state"><p>Erro ao carregar marcas</p></div>';
  }
}

// Toggle card actions ao clicar
function toggleCardActions(cardId) {
  console.log('Toggling card:', cardId);
  const card = document.querySelector(`.card[data-id="${cardId}"]`);
  
  if (!card) {
    console.error('Card não encontrado:', cardId);
    return;
  }
  
  const allCards = document.querySelectorAll('.card');
  
  // Fechar todos os outros cards
  allCards.forEach(c => {
    if (c !== card) {
      c.classList.remove('show-actions');
    }
  });
  
  // Toggle o card atual
  const isShowing = card.classList.toggle('show-actions');
  console.log('Card actions visível:', isShowing);
}
window.toggleCardActions = toggleCardActions;

// Carregar saídas - com cabeçalho sempre visível
async function loadSaidas(filterTerm = '') {
  try {
    const snap = await db.collection("painel").doc(currentStore.id).collection("saidas").get();
    
    // Sempre mostrar a tabela com cabeçalho, mesmo vazia
    let tableHtml = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Marcas</th>
              <th>Início</th>
              <th>Saída</th>
              <th>Retirada</th>
              <th>Obs</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    if (!snap.empty) {
      // Converter para array para ordenar
      const saidas = [];
      snap.forEach(doc => {
        const data = doc.data();
        saidas.push({ id: doc.id, ...data });
      });
      
      // Ordenar por data de retirada (mais recente primeiro)
      saidas.sort((a, b) => {
        const dateA = new Date(a.retirada || '1900-01-01');
        const dateB = new Date(b.retirada || '1900-01-01');
        return dateB - dateA; // Descendente
      });
      
      // Aplicar filtro se houver
      let saidasFiltradas = saidas;
      if (filterTerm) {
        const termLower = filterTerm.toLowerCase();
        saidasFiltradas = saidas.filter(data => 
          data.nome.toLowerCase().startsWith(termLower)
        );
      }
      
      // Renderizar linhas
      saidasFiltradas.forEach(data => {
        // Determinar cor do status
        let statusClass = 'status-ok'; // Verde por padrão (concluído)
        
        if (data.obs === 'Cancelado') {
          statusClass = 'status-cancel'; // Vermelho para cancelado
        } else {
          // Verificar se foi retirado antes da data de saída programada
          const retirada = new Date(data.retirada);
          const saida = new Date(data.saida);
          
          if (retirada < saida) {
            statusClass = 'status-early'; // Laranja - retirado antes do prazo
          }
        }
        
        tableHtml += `
          <tr>
            <td style="width:40px;padding:14px 10px;">
              <button class="btn-view-saida" onclick="openSaidaDetails('${data.nome}', '${data.midiaUrl || ''}')" title="Ver detalhes">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </td>
            <td>${data.nome}</td>
            <td>${formatDate(data.entrada)}</td>
            <td>${formatDate(data.saida)}</td>
            <td>${formatDate(data.retirada)}</td>
            <td class="${statusClass}">${data.obs || 'Concluído'}</td>
          </tr>
        `;
      });
      
      // Se o filtro não retornou resultados
      if (filterTerm && saidasFiltradas.length === 0) {
        tableHtml += `
          <tr>
            <td colspan="6" style="text-align:center;color:var(--muted);padding:40px;">
              Nenhuma saída encontrada com "${filterTerm}"
            </td>
          </tr>
        `;
      }
    }
    
    tableHtml += '</tbody></table></div>';
    contentEl.innerHTML = tableHtml;
    
  } catch (e) {
    console.error("Erro ao carregar saídas:", e);
    contentEl.innerHTML = '<div class="empty-state"><p>Erro ao carregar saídas</p></div>';
  }
}

// Carregar mídias
async function loadMidias() {
  try {
    // Buscar marcas ativas e seus midiaUrl
    const marcasSnap = await db.collection("painel").doc(currentStore.id).collection("marcas").get();
    const marcasAtivasNomes = new Set();
    const marcasMidiaUrl = {}; // nome -> midiaUrl

    marcasSnap.forEach(doc => {
      const d = doc.data();
      marcasAtivasNomes.add(d.nome);
      if (d.midiaUrl && d.midiaUrl.startsWith('http')) {
        marcasMidiaUrl[d.nome] = d.midiaUrl;
      }
    });

    const snap = await db.collection("painel").doc(currentStore.id).collection("midias").get();

    let gridHtml = '<div class="midias-grid">';
    let midiaCount = 0;
    const brandsCoveredByMidias = new Set(); // marcas já mostradas via coleção midias

    snap.forEach(doc => {
      const data = doc.data();

      // Verificar se a marca ainda está ativa
      if (!marcasAtivasNomes.has(data.marca)) {
        console.log(`Mídia da marca "${data.marca}" oculta - marca não está mais ativa`);
        return;
      }

      const isVideo = data.tipo === 'video';

      // Ignorar URLs blob antigas (inválidas)
      if (data.url && data.url.startsWith('blob:')) {
        console.warn('Mídia com URL blob encontrada (inválida):', doc.id);
        return;
      }

      // Verificar se tem URL válida
      if (!data.url || !data.url.startsWith('http')) {
        console.warn('Mídia sem URL válida:', doc.id);
        return;
      }

      brandsCoveredByMidias.add(data.marca);
      midiaCount++;
      gridHtml += `
        <div class="midia-item">
          <div class="midia-card">
            ${isVideo
              ? `<video src="${data.url}" muted controls></video>`
              : `<img src="${data.url}" alt="${data.marca}" onerror="console.error('Erro ao carregar imagem:', '${data.url}')">`
            }
          </div>
          <div class="midia-info">${data.marca}</div>
        </div>
      `;
    });

    // Incluir mídias de marcas ativas que têm midiaUrl mas não têm entrada na coleção midias
    for (const [nome, url] of Object.entries(marcasMidiaUrl)) {
      if (brandsCoveredByMidias.has(nome)) continue;
      const urlLower = url.toLowerCase();
      const isVideo = urlLower.includes('.mp4') || urlLower.includes('.webm') || urlLower.includes('.mov') || urlLower.includes('.avi');
      midiaCount++;
      gridHtml += `
        <div class="midia-item">
          <div class="midia-card">
            ${isVideo
              ? `<video src="${url}" muted controls></video>`
              : `<img src="${url}" alt="${nome}" onerror="console.error('Erro ao carregar imagem:', '${url}')">`
            }
          </div>
          <div class="midia-info">${nome}</div>
        </div>
      `;
    }

    gridHtml += '</div>';

    // Se não houver mídias válidas de marcas ativas
    if (midiaCount === 0) {
      contentEl.innerHTML = `
        <div class="empty-state">
          <p>Nenhuma mídia válida encontrada</p>
        </div>
      `;
      return;
    }

    contentEl.innerHTML = gridHtml;
    
  } catch (e) {
    console.error("Erro ao carregar mídias:", e);
    contentEl.innerHTML = '<div class="empty-state"><p>Erro ao carregar mídias</p></div>';
  }
}

// Criar marca com upload para Firebase Storage
async function criarMarca() {
  const nome = document.getElementById('marcaNome').value.toUpperCase();
  const entrada = document.getElementById('marcaEntrada').value;
  const saidaIndeterminada = document.getElementById('saidaIndeterminada').checked;
  const saida = saidaIndeterminada ? 'indeterminado' : document.getElementById('marcaSaida').value;
  const midiaFile = document.getElementById('marcaMidia').files[0];
  
  // Pegar lojas selecionadas
  const selectedStores = Array.from(document.querySelectorAll('input[name="storeSelect"]:checked'))
    .map(cb => cb.value);
  
  if (selectedStores.length === 0) {
    alert('Por favor, selecione pelo menos uma loja.');
    return;
  }
  
  try {
    let midiaUrl = null;
    const submitBtn = formMarca.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
    
    // Upload da mídia para Firebase Storage (uma vez, usar em todas as lojas)
    if (midiaFile) {
      console.log('Iniciando upload:', midiaFile.name, midiaFile.type);
      
      // Comprimir imagem se for imagem
      let fileToUpload = midiaFile;
      if (midiaFile.type.startsWith('image/')) {
        console.log('Comprimindo imagem...');
        submitBtn.textContent = 'Comprimindo imagem...';
        try {
          fileToUpload = await compressImage(midiaFile);
          const compressedSize = (fileToUpload.size / 1024 / 1024).toFixed(2);
          console.log('Imagem comprimida:', compressedSize, 'MB');
        } catch (compressError) {
          console.warn('Erro ao comprimir, usando original:', compressError);
          fileToUpload = midiaFile;
        }
      }
      
      submitBtn.textContent = 'Enviando...';
      const fileName = `${Date.now()}_${midiaFile.name}`;
      const storageRef = storage.ref(`midias/shared/${fileName}`);
      
      try {
        console.log('Upload para:', `midias/shared/${fileName}`);
        const uploadTask = await storageRef.put(fileToUpload);
        midiaUrl = await uploadTask.ref.getDownloadURL();
        console.log('Upload concluído! URL:', midiaUrl);
      } catch (uploadError) {
        console.error("Erro no upload:", uploadError);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Criar Marca';
        alert("Erro ao fazer upload da mídia: " + uploadError.message);
        return;
      }
    }
    
    // Criar marca em cada loja selecionada
    const marcaData = {
      nome,
      entrada,
      saida,
      midiaUrl: midiaUrl || null,
      criadoEm: new Date().toISOString()
    };
    
    const isVideo = midiaFile && midiaFile.type.startsWith('video');
    
    for (const storeId of selectedStores) {
      await db.collection("painel").doc(storeId).collection("marcas").add(marcaData);
      
      // Se tiver mídia, salvar referência separada
      if (midiaUrl) {
        await db.collection("painel").doc(storeId).collection("midias").add({
          nome: midiaFile.name,
          marca: nome,
          tipo: isVideo ? 'video' : 'image',
          url: midiaUrl,
          criadoEm: new Date().toISOString()
        });
      }
    }
    
    modalMarca.classList.remove('active');
    formMarca.reset();
    resetFileUpload();
    document.getElementById('saidaIndeterminada').checked = false;
    document.getElementById('marcaSaida').disabled = false;
    
      // Resetar botão
      submitBtn.disabled = false;
      submitBtn.textContent = 'Criar Marca';
    
    renderStores();
    loadContent();
    
  } catch (e) {
    console.error("Erro ao criar marca:", e);
    alert("Erro ao criar marca. Tente novamente.");
    
    // Resetar botão em caso de erro
    const submitBtn = formMarca.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Criar Marca';
  }
}

// Setup file upload with drag and drop
function setupFileUpload() {
  const fileInput = document.getElementById('marcaMidia');
  const uploadArea = document.getElementById('fileUploadArea');
  const uploadContent = document.getElementById('fileUploadContent');
  const filePreview = document.getElementById('filePreview');
  
  // Click na área para abrir seletor
  uploadContent.addEventListener('click', () => {
    fileInput.click();
  });
  
  // Prevenir comportamento padrão de drag
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadContent.addEventListener(eventName, preventDefaults, false);
  });
  
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  // Highlight ao arrastar
  ['dragenter', 'dragover'].forEach(eventName => {
    uploadContent.addEventListener(eventName, () => {
      uploadContent.classList.add('drag-over');
    });
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    uploadContent.addEventListener(eventName, () => {
      uploadContent.classList.remove('drag-over');
    });
  });
  
  // Handle drop
  uploadContent.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      fileInput.files = files;
      handleFileSelect(files[0]);
    }
  });
  
  // Handle file select
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  });
}

function handleFileSelect(file) {
  const uploadContent = document.getElementById('fileUploadContent');
  const filePreview = document.getElementById('filePreview');
  const fileInfo = document.getElementById('fileInfo');
  const filePreviewImg = document.getElementById('filePreviewImg');
  const filePreviewVideo = document.getElementById('filePreviewVideo');
  
  uploadContent.style.display = 'none';
  filePreview.style.display = 'flex';
  
  const fileSize = (file.size / 1024 / 1024).toFixed(2);
  fileInfo.textContent = `${file.name} (${fileSize} MB)`;
  
  if (file.type.startsWith('image/')) {
    filePreviewImg.src = URL.createObjectURL(file);
    filePreviewImg.style.display = 'block';
    filePreviewVideo.style.display = 'none';
  } else if (file.type.startsWith('video/')) {
    filePreviewVideo.src = URL.createObjectURL(file);
    filePreviewVideo.style.display = 'block';
    filePreviewImg.style.display = 'none';
  }
}

// Comprimir imagem para reduzir tamanho
async function compressImage(file, maxSizeMB = 1, maxWidth = 1920, maxHeight = 1080) {
  return new Promise((resolve, reject) => {
    // Se não for imagem, retornar o arquivo original
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Redimensionar se necessário
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Começar com qualidade 0.8
        let quality = 0.8;
        
        const attemptCompress = () => {
          canvas.toBlob((blob) => {
            const sizeMB = blob.size / 1024 / 1024;
            
            // Se está dentro do tamanho ou qualidade já está muito baixa
            if (sizeMB <= maxSizeMB || quality <= 0.5) {
              // Criar novo arquivo com o blob comprimido
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              // Reduzir qualidade e tentar novamente
              quality -= 0.1;
              attemptCompress();
            }
          }, 'image/jpeg', quality);
        };
        
        attemptCompress();
      };
      
      img.onerror = () => reject(new Error('Erro ao carregar imagem'));
    };
    
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
  });
}

function resetFileUpload() {
  const fileInput = document.getElementById('marcaMidia');
  const uploadContent = document.getElementById('fileUploadContent');
  const filePreview = document.getElementById('filePreview');
  const filePreviewImg = document.getElementById('filePreviewImg');
  const filePreviewVideo = document.getElementById('filePreviewVideo');
  
  fileInput.value = '';
  uploadContent.style.display = 'flex';
  filePreview.style.display = 'none';
  filePreviewImg.src = '';
  filePreviewVideo.src = '';
}
window.removeFile = resetFileUpload;

// Abrir modal para editar marca
async function openEditarModal(id) {
  try {
    // Buscar dados da marca
    const marcaDoc = await db.collection("painel").doc(currentStore.id).collection("marcas").doc(id).get();
    
    if (!marcaDoc.exists) {
      alert('Marca não encontrada');
      return;
    }
    
    const data = marcaDoc.data();
    
    // Preencher formulário
    document.getElementById('marcaEditId').value = id;
    document.getElementById('modalMarcaTitle').textContent = 'Editar Marca';
    document.getElementById('submitMarca').textContent = 'Salvar';
    document.getElementById('marcaNome').value = data.nome;
    document.getElementById('marcaEntrada').value = data.entrada;
    
    // Verificar se é indeterminado
    const isIndeterminado = data.saida === 'indeterminado';
    document.getElementById('saidaIndeterminada').checked = isIndeterminado;
    
    if (isIndeterminado) {
      document.getElementById('marcaSaida').value = '';
      document.getElementById('marcaSaida').disabled = true;
      document.getElementById('marcaSaida').required = false;
    } else {
      document.getElementById('marcaSaida').value = data.saida;
      document.getElementById('marcaSaida').disabled = false;
      document.getElementById('marcaSaida').required = true;
    }
    
    // Verificar quais lojas já possuem esta marca (pelo nome)
    const storeHasBrand = {};
    for (const store of stores) {
      if (store.id === currentStore.id) {
        storeHasBrand[store.id] = true;
        continue;
      }
      try {
        const snap = await db.collection("painel").doc(store.id).collection("marcas")
          .where("nome", "==", data.nome).get();
        storeHasBrand[store.id] = !snap.empty;
      } catch (e) {
        storeHasBrand[store.id] = false;
      }
    }

    // Configurar checkboxes de lojas
    document.querySelectorAll('input[name="storeSelect"]').forEach(cb => {
      const storeId = cb.value;
      const label = cb.closest('.store-checkbox');
      const storeActive = storeStatus[storeId];

      if (storeId === currentStore.id) {
        // Loja atual: marcada e desabilitada
        cb.checked = true;
        cb.disabled = true;
        label.classList.add('disabled');
      } else if (storeHasBrand[storeId]) {
        // Loja já tem esta marca: marcada e desabilitada
        cb.checked = true;
        cb.disabled = true;
        label.classList.add('disabled');
      } else if (!storeActive) {
        // Loja inativa: desmarcada e desabilitada
        cb.checked = false;
        cb.disabled = true;
        label.classList.add('disabled');
      } else {
        // Loja ativa sem esta marca: desmarcada e habilitada
        cb.checked = false;
        cb.disabled = false;
        label.classList.remove('disabled');
      }
    });
    
    // Resetar upload de arquivo
    resetFileUpload();
    
    modalMarca.classList.add('active');
    
  } catch (e) {
    console.error('Erro ao abrir modal de edição:', e);
    alert('Erro ao carregar dados da marca');
  }
}
window.openEditarModal = openEditarModal;

// Editar marca existente
async function editarMarca(id) {
  const nome = document.getElementById('marcaNome').value.toUpperCase();
  const entrada = document.getElementById('marcaEntrada').value;
  const saidaIndeterminada = document.getElementById('saidaIndeterminada').checked;
  const saida = saidaIndeterminada ? 'indeterminado' : document.getElementById('marcaSaida').value;
  const midiaFile = document.getElementById('marcaMidia').files[0];
  
  try {
    const submitBtn = formMarca.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando...';
    
    // Buscar dados atuais
    const marcaDoc = await db.collection("painel").doc(currentStore.id).collection("marcas").doc(id).get();
    const currentData = marcaDoc.data();
    
    let midiaUrl = currentData.midiaUrl; // Manter mídia atual por padrão
    
    // Se houver nova mídia, fazer upload
    if (midiaFile) {
      // Comprimir imagem se for imagem
      let fileToUpload = midiaFile;
      if (midiaFile.type.startsWith('image/')) {
        console.log('Comprimindo imagem...');
        submitBtn.textContent = 'Comprimindo imagem...';
        try {
          fileToUpload = await compressImage(midiaFile);
          const compressedSize = (fileToUpload.size / 1024 / 1024).toFixed(2);
          console.log('Imagem comprimida:', compressedSize, 'MB');
        } catch (compressError) {
          console.warn('Erro ao comprimir, usando original:', compressError);
          fileToUpload = midiaFile;
        }
      }
      
      submitBtn.textContent = 'Salvando...';
      const fileName = `${Date.now()}_${midiaFile.name}`;
      const storageRef = storage.ref(`midias/shared/${fileName}`);
      
      try {
        const uploadTask = await storageRef.put(fileToUpload);
        midiaUrl = await uploadTask.ref.getDownloadURL();
        
        // Se houver mídia antiga, poderia deletar aqui (opcional)
        // Mas vamos manter para não perder histórico
        
      } catch (uploadError) {
        console.error("Erro no upload:", uploadError);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Salvar';
        alert("Erro ao fazer upload da mídia: " + uploadError.message);
        return;
      }
    }
    
    // Atualizar marca na loja atual
    await db.collection("painel").doc(currentStore.id).collection("marcas").doc(id).update({
      nome,
      entrada,
      saida,
      midiaUrl,
      editadoEm: new Date().toISOString()
    });
    
    // Se houver nova mídia, atualizar coleção de mídias da loja atual
    if (midiaFile) {
      const isVideo = midiaFile.type.startsWith('video');
      await db.collection("painel").doc(currentStore.id).collection("midias").add({
        nome: midiaFile.name,
        marca: nome,
        tipo: isVideo ? 'video' : 'image',
        url: midiaUrl,
        criadoEm: new Date().toISOString()
      });
    }

    // Adicionar marca às novas lojas selecionadas (habilitadas e marcadas, exceto a loja atual)
    const newStores = Array.from(document.querySelectorAll('input[name="storeSelect"]:checked'))
      .filter(cb => !cb.disabled && cb.value !== currentStore.id)
      .map(cb => cb.value);

    for (const storeId of newStores) {
      await db.collection("painel").doc(storeId).collection("marcas").add({
        nome,
        entrada,
        saida,
        midiaUrl: midiaUrl || null,
        criadoEm: new Date().toISOString()
      });
      if (midiaUrl) {
        let midiaNome, midiaTipo;
        if (midiaFile) {
          midiaNome = midiaFile.name;
          midiaTipo = midiaFile.type.startsWith('video') ? 'video' : 'image';
        } else {
          // Usar mídia existente: derivar tipo e nome da URL
          const urlLower = midiaUrl.toLowerCase();
          midiaTipo = (urlLower.includes('.mp4') || urlLower.includes('.webm') || urlLower.includes('.mov') || urlLower.includes('.avi') || urlLower.includes('video')) ? 'video' : 'image';
          const urlPath = midiaUrl.split('?')[0];
          midiaNome = decodeURIComponent(urlPath.split('%2F').pop() || urlPath.split('/').pop() || nome);
        }
        await db.collection("painel").doc(storeId).collection("midias").add({
          nome: midiaNome,
          marca: nome,
          tipo: midiaTipo,
          url: midiaUrl,
          criadoEm: new Date().toISOString()
        });
      }
    }
    
    modalMarca.classList.remove('active');
    formMarca.reset();
    resetFileUpload();
    document.getElementById('marcaEditId').value = '';
    document.getElementById('saidaIndeterminada').checked = false;
    document.getElementById('marcaSaida').disabled = false;
    
    submitBtn.disabled = false;
    submitBtn.textContent = 'Salvar';
    
    renderStores();
    loadContent();
    
  } catch (e) {
    console.error("Erro ao editar marca:", e);
    alert("Erro ao editar marca. Tente novamente.");
    
    const submitBtn = formMarca.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Salvar';
  }
}

// Abrir modal de retirar — agora pergunta em quais lojas remover
async function openRetirarModal(id, nome, expirado) {
  await _openRetirarLojasModal(nome, expirado, false, null);
}
window.openRetirarModal = openRetirarModal;

// Abrir modal para remoção aprovada no dashboard
async function openRemoverAprovadoModal(nome, saida) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const saidaDate = new Date(saida + 'T00:00:00');
  const expirado = hoje >= saidaDate;
  await _openRetirarLojasModal(nome, expirado, true, saida);
}
window.openRemoverAprovadoModal = openRemoverAprovadoModal;

// Função interna: abre o modal multi-loja
async function _openRetirarLojasModal(nome, expirado, isAprovado, dataSaidaAprovada) {
  document.getElementById('retirarLojasNome').textContent = nome;
  document.getElementById('retirarLojasLista').innerHTML =
    '<p style="color:var(--muted);font-size:13px;">🔍 Buscando lojas...</p>';
  document.getElementById('retirarLojasObs').value = '';

  const obsLabel = document.getElementById('retirarLojasObsLabel');
  if (expirado) {
    obsLabel.style.color = 'var(--muted)';
    obsLabel.textContent = '(opcional)';
  } else {
    obsLabel.style.color = 'var(--red)';
    obsLabel.textContent = '* obrigatória (retirada antecipada)';
  }

  modalRetirarLojas.classList.add('active');

  // Buscar em quais lojas esta marca existe
  const lojaEntries = [];
  for (const store of stores) {
    try {
      const snap = await db.collection("painel").doc(store.id).collection("marcas")
        .where("nome", "==", nome).get();
      snap.forEach(doc => {
        lojaEntries.push({ storeId: store.id, storeName: store.name, docId: doc.id });
      });
    } catch (_) {}
  }

  retirarLojasState = { nome, expirado, lojaEntries, isAprovado, dataSaidaAprovada };

  if (lojaEntries.length === 0) {
    document.getElementById('retirarLojasLista').innerHTML =
      '<p style="color:var(--red);font-size:13px;">Marca não encontrada em nenhuma loja.</p>';
    return;
  }

  document.getElementById('retirarLojasLista').innerHTML = lojaEntries.map(e => `
    <label class="store-check-item">
      <input type="checkbox" value="${e.storeId}" checked>
      <span>${e.storeName}</span>
    </label>
  `).join('');
}

// Confirmar retirada das lojas selecionadas
async function confirmarRetiradaLojas() {
  if (!retirarLojasState) return;
  const { nome, expirado, lojaEntries, isAprovado, dataSaidaAprovada } = retirarLojasState;
  const obs = document.getElementById('retirarLojasObs').value.trim();

  if (!expirado && !obs) {
    alert('Por favor, adicione uma observação para retirar a marca antes do prazo.');
    return;
  }

  const selectedIds = new Set(
    Array.from(document.querySelectorAll('#retirarLojasLista input[type="checkbox"]:checked'))
      .map(cb => cb.value)
  );
  const selectedEntries = lojaEntries.filter(e => selectedIds.has(e.storeId));

  if (selectedEntries.length === 0) {
    alert('Selecione pelo menos uma loja.');
    return;
  }

  const confirmBtn = document.getElementById('confirmRetirarLojas');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Removendo...';

  try {
    for (const entry of selectedEntries) {
      const marcaDoc = await db.collection("painel").doc(entry.storeId)
        .collection("marcas").doc(entry.docId).get();
      if (!marcaDoc.exists) continue;
      const d = marcaDoc.data();

      await db.collection("painel").doc(entry.storeId).collection("saidas").add({
        nome: d.nome,
        entrada: d.entrada,
        saida: d.saida,
        midiaUrl: d.midiaUrl || null,
        retirada: new Date().toISOString().split('T')[0],
        obs: obs || 'Concluído'
      });

      await db.collection("painel").doc(entry.storeId)
        .collection("marcas").doc(entry.docId).delete();
    }

    // Limpar aprovação do dashboard se for remoção aprovada
    if (isAprovado && dataSaidaAprovada) {
      const docId = sanitizeRetiradaId(nome, dataSaidaAprovada);
      await db.collection("remocoes_aprovadas").doc(docId).delete().catch(() => {});
    }

    modalRetirarLojas.classList.remove('active');
    retirarLojasState = null;
    renderStores();
    loadContent();
  } catch (e) {
    console.error('Erro ao retirar marca:', e);
    alert('Erro ao retirar marca. Tente novamente.');
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Retirar das lojas selecionadas';
  }
}

// Abrir detalhes da saída (imagem e lojas participantes)
async function openSaidaDetails(nomeMarca, midiaUrl) {
  const modalSaidaDetalhes = document.getElementById('modalSaidaDetalhes');
  const saidaDetalhesNome = document.getElementById('saidaDetalhesNome');
  const saidaDetalhesImagem = document.getElementById('saidaDetalhesImagem');
  const saidaDetalhesLojas = document.getElementById('saidaDetalhesLojas');
  
  // Definir nome da marca
  saidaDetalhesNome.textContent = nomeMarca;
  
  // Exibir imagem/vídeo se existir
  if (midiaUrl && midiaUrl !== 'null' && midiaUrl !== '') {
    const isVideo = midiaUrl.includes('.mp4') || midiaUrl.includes('.mov') || midiaUrl.includes('.avi');
    
    if (isVideo) {
      saidaDetalhesImagem.innerHTML = `<video src="${midiaUrl}" controls style="width:100%;max-height:400px;"></video>`;
    } else {
      saidaDetalhesImagem.innerHTML = `<img src="${midiaUrl}" alt="${nomeMarca}" style="width:100%;max-height:400px;object-fit:contain;">`;
    }
    saidaDetalhesImagem.classList.remove('empty');
  } else {
    saidaDetalhesImagem.innerHTML = '<p>Sem mídia disponível</p>';
    saidaDetalhesImagem.classList.add('empty');
  }
  
  // Buscar lojas que têm ou tiveram essa marca
  saidaDetalhesLojas.innerHTML = '<p style="color:var(--muted);">Carregando...</p>';
  
  try {
    const lojasComMarca = [];
    
    for (const store of stores) {
      // Verificar se está em marcas ativas
      const marcasAtivas = await db.collection("painel").doc(store.id).collection("marcas")
        .where("nome", "==", nomeMarca).get();
      
      // Verificar se está em saídas
      const saidas = await db.collection("painel").doc(store.id).collection("saidas")
        .where("nome", "==", nomeMarca).get();
      
      if (!marcasAtivas.empty || !saidas.empty) {
        lojasComMarca.push(store);
      }
    }
    
    // Renderizar badges das lojas
    if (lojasComMarca.length > 0) {
      saidaDetalhesLojas.innerHTML = lojasComMarca.map(store => 
        `<div class="loja-badge">${store.name}</div>`
      ).join('');
    } else {
      saidaDetalhesLojas.innerHTML = '<p style="color:var(--muted);">Nenhuma loja encontrada</p>';
    }
    
  } catch (e) {
    console.error('Erro ao buscar lojas:', e);
    saidaDetalhesLojas.innerHTML = '<p style="color:var(--red);">Erro ao carregar lojas</p>';
  }
  
  // Abrir modal
  modalSaidaDetalhes.classList.add('active');
}
window.openSaidaDetails = openSaidaDetails;

// Retirar marca expirada automaticamente (sem observação)
async function retirarMarcaExpirada(marca) {
  try {
    const marcaDoc = await db.collection("painel").doc(currentStore.id).collection("marcas").doc(marca.id).get();
    
    if (marcaDoc.exists) {
      const data = marcaDoc.data();
      
      // Adicionar às saídas com status "Concluído"
      await db.collection("painel").doc(currentStore.id).collection("saidas").add({
        nome: data.nome,
        entrada: data.entrada,
        saida: data.saida,
        midiaUrl: data.midiaUrl || null,
        retirada: new Date().toISOString().split('T')[0],
        obs: 'Concluído'
      });
      
      // Remover da lista de marcas
      await db.collection("painel").doc(currentStore.id).collection("marcas").doc(marca.id).delete();
    }
    
    renderStores();
    loadContent();
    
  } catch (e) {
    console.error("Erro ao retirar marca:", e);
    alert("Erro ao retirar marca. Tente novamente.");
  }
}

// Retirar marca manualmente (antes do prazo) - com observação
async function retirarMarca(marca) {
  const obs = document.getElementById('retirarObs').value.trim();
  
  // Se não expirou e não tem observação, pedir observação
  if (!marca.expirado && !obs) {
    alert("Por favor, adicione uma observação para retirar a marca antes do prazo.");
    return;
  }
  
  try {
    const marcaDoc = await db.collection("painel").doc(currentStore.id).collection("marcas").doc(marca.id).get();
    
    if (marcaDoc.exists) {
      const data = marcaDoc.data();
      
      // Adicionar às saídas
      await db.collection("painel").doc(currentStore.id).collection("saidas").add({
        nome: data.nome,
        entrada: data.entrada,
        saida: data.saida,
        midiaUrl: data.midiaUrl || null,
        retirada: new Date().toISOString().split('T')[0],
        obs: obs || 'Concluído'
      });
      
      // Remover da lista de marcas
      await db.collection("painel").doc(currentStore.id).collection("marcas").doc(marca.id).delete();
    }
    
    renderStores();
    loadContent();
    
  } catch (e) {
    console.error("Erro ao retirar marca:", e);
    alert("Erro ao retirar marca. Tente novamente.");
  }
}



// Formatar data
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ── Botão de teste de email ───────────────────────────────────────────────────
const TESTAR_EMAIL_URL = "https://us-central1-alvoleds-aab35.cloudfunctions.net/testarEmailAgora";
const GERAR_RESUMO_URL = "https://us-central1-alvoleds-aab35.cloudfunctions.net/gerarResumoVisual";

document.addEventListener('DOMContentLoaded', () => {
  // Handler para botão "Criar Resumo"
  const btnResumo = document.getElementById('btnCriarResumo');
  if (btnResumo) {
    btnResumo.addEventListener('click', () => {
      btnResumo.disabled = true;
      btnResumo.textContent = 'Abrindo...';
      try {
        const janela = window.open('resumo.html', '_blank');
        if (!janela) throw new Error('Popup bloqueado pelo navegador');

        btnResumo.textContent = '✓ Resumo aberto!';
        btnResumo.style.borderColor = '#22c55e';
        btnResumo.style.color = '#86efac';
      } catch (e) {
        btnResumo.textContent = '✗ Falhou';
        btnResumo.style.borderColor = '#ef4444';
        btnResumo.style.color = '#fca5a5';
        console.error('Erro ao gerar resumo:', e);
      }
      setTimeout(() => {
        btnResumo.disabled = false;
        btnResumo.textContent = '📋 Criar Resumo';
        btnResumo.style.borderColor = '';
        btnResumo.style.color = '';
      }, 4000);
    });
  }

  // Handler para botão "Testar Email"
  const btn = document.getElementById('btnTestarEmail');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      const resp = await fetch(TESTAR_EMAIL_URL);
      const data = await resp.json();
      if (data.ok) {
        btn.textContent = '✓ Email enviado!';
        btn.style.borderColor = '#22c55e';
        btn.style.color = '#86efac';
      } else {
        throw new Error(data.mensagem || 'Erro desconhecido');
      }
    } catch (e) {
      btn.textContent = '✗ Falhou';
      btn.style.borderColor = '#ef4444';
      btn.style.color = '#fca5a5';
      console.error('Erro ao testar email:', e);
    }
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '📧 Testar Email';
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 4000);
  });
});

// Iniciar aplicação quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', init);
