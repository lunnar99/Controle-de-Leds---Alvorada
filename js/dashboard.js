import { db } from "./firebase.js";
import { 
  collection, 
  getDocs, 
  addDoc, 
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  query,
  orderBy,
  Timestamp
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

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
let storeStatus = {}; // Armazena status ativo/inativo de cada loja
let marcaToRemove = null;

// Elementos DOM
const storesEl = document.getElementById("stores");
const contentEl = document.getElementById("content");
const storeTitle = document.getElementById("storeTitle");
const sectionTitle = document.getElementById("sectionTitle");
const sidebar = document.getElementById("sidebar");
const addBtn = document.getElementById("addBtn");
const searchInput = document.getElementById("searchInput");

// Modais
const modalMarca = document.getElementById("modalMarca");
const formMarca = document.getElementById("formMarca");
const cancelMarca = document.getElementById("cancelMarca");
const modalRetirar = document.getElementById("modalRetirar");
const cancelRetirar = document.getElementById("cancelRetirar");
const confirmRetirar = document.getElementById("confirmRetirar");

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
      const docRef = doc(db, "painel", store.id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        storeStatus[store.id] = docSnap.data().active !== false;
      } else {
        storeStatus[store.id] = true;
        await setDoc(docRef, { active: true });
      }
    } catch (e) {
      storeStatus[store.id] = true;
    }
  }
}

// Contar marcas ativas de uma loja
async function countActiveMarcas(storeId) {
  try {
    const ref = collection(db, "painel", storeId, "marcas");
    const snap = await getDocs(ref);
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
    const docRef = doc(db, "painel", storeId);
    await updateDoc(docRef, { active: newStatus });
  } catch (e) {
    console.error("Erro ao atualizar status:", e);
  }
  
  renderStores();
}

// Setup sidebar
function setupSidebar() {
  const navItems = sidebar.querySelectorAll('.nav-item');
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
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
      // Definir datas padrão
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('marcaEntrada').value = today;
      modalMarca.classList.add('active');
    }
  });
  
  cancelMarca.addEventListener('click', () => {
    modalMarca.classList.remove('active');
    formMarca.reset();
  });
  
  formMarca.addEventListener('submit', async (e) => {
    e.preventDefault();
    await criarMarca();
  });
  
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
    }
  });
  
  modalRetirar.addEventListener('click', (e) => {
    if (e.target === modalRetirar) {
      modalRetirar.classList.remove('active');
      marcaToRemove = null;
    }
  });
}

// Setup busca
function setupSearch() {
  searchInput.addEventListener('input', () => {
    loadContent();
  });
}

// Carregar conteúdo baseado na seção atual
async function loadContent() {
  contentEl.innerHTML = '<div class="empty-state"><p>Carregando...</p></div>';
  
  switch (currentSection) {
    case 'marcas':
      await loadMarcas();
      break;
    case 'saidas':
      await loadSaidas();
      break;
    case 'midias':
      await loadMidias();
      break;
  }
}

// Carregar marcas
async function loadMarcas() {
  const searchTerm = searchInput.value.toLowerCase();
  
  try {
    const ref = collection(db, "painel", currentStore.id, "marcas");
    const snap = await getDocs(ref);
    
    if (snap.empty) {
      contentEl.innerHTML = `
        <div class="empty-state">
          <p>Nenhuma marca cadastrada</p>
        </div>
      `;
      return;
    }
    
    let cardsHtml = '<div class="cards">';
    
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const id = docSnap.id;
      
      // Filtro de busca
      if (searchTerm && !data.nome.toLowerCase().includes(searchTerm)) {
        return;
      }
      
      // Calcular progresso
      const hoje = new Date();
      const entrada = new Date(data.entrada);
      const saida = new Date(data.saida);
      const totalDias = Math.ceil((saida - entrada) / (1000 * 60 * 60 * 24));
      const diasPassados = Math.ceil((hoje - entrada) / (1000 * 60 * 60 * 24));
      const progresso = Math.min(100, Math.max(0, (diasPassados / totalDias) * 100));
      
      // Cor baseada no progresso
      let cor = '#22c55e'; // verde
      if (progresso > 50) cor = '#f97316'; // laranja
      if (progresso > 75) cor = '#ef4444'; // vermelho
      
      // Formatar datas
      const entradaFormatada = formatDate(data.entrada);
      const saidaFormatada = formatDate(data.saida);
      
      cardsHtml += `
        <div class="card" data-id="${id}">
          <div class="card-content">
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
          <div class="card-progress">
            <div class="progress-fill" style="width:${progresso}%;background:${cor}"></div>
            <div class="progress-empty"></div>
          </div>
          <div class="card-actions">
            <button class="btn-retirar" onclick="window.openRetirarModal('${id}', '${data.nome}')">RETIRAR</button>
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
    
    // Setup checkboxes de observação
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

// Carregar saídas
async function loadSaidas() {
  const searchTerm = searchInput.value.toLowerCase();
  
  try {
    const ref = collection(db, "painel", currentStore.id, "saidas");
    const snap = await getDocs(ref);
    
    if (snap.empty) {
      contentEl.innerHTML = `
        <div class="empty-state">
          <p>Nenhuma saída registrada</p>
        </div>
      `;
      return;
    }
    
    let tableHtml = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Marcas</th>
              <th>Início</th>
              <th>Saída</th>
              <th>Retirada</th>
              <th>Obs</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    snap.forEach(docSnap => {
      const data = docSnap.data();
      
      // Filtro de busca
      if (searchTerm && !data.nome.toLowerCase().includes(searchTerm)) {
        return;
      }
      
      const statusClass = data.obs === 'Cancelado' ? 'status-cancel' : 'status-ok';
      
      tableHtml += `
        <tr>
          <td>${data.nome}</td>
          <td>${formatDate(data.entrada)}</td>
          <td>${formatDate(data.saida)}</td>
          <td>${formatDate(data.retirada)}</td>
          <td class="${statusClass}">${data.obs || 'Concluído'}</td>
        </tr>
      `;
    });
    
    tableHtml += '</tbody></table></div>';
    contentEl.innerHTML = tableHtml;
    
  } catch (e) {
    console.error("Erro ao carregar saídas:", e);
    contentEl.innerHTML = '<div class="empty-state"><p>Erro ao carregar saídas</p></div>';
  }
}

// Carregar mídias
async function loadMidias() {
  const searchTerm = searchInput.value.toLowerCase();
  
  try {
    const ref = collection(db, "painel", currentStore.id, "midias");
    const snap = await getDocs(ref);
    
    if (snap.empty) {
      contentEl.innerHTML = `
        <div class="empty-state">
          <p>Nenhuma mídia cadastrada</p>
        </div>
      `;
      return;
    }
    
    let gridHtml = '<div class="midias-grid">';
    
    snap.forEach(docSnap => {
      const data = docSnap.data();
      
      // Filtro de busca
      if (searchTerm && !data.nome.toLowerCase().includes(searchTerm) && 
          !data.marca.toLowerCase().includes(searchTerm)) {
        return;
      }
      
      const isVideo = data.tipo === 'video';
      
      gridHtml += `
        <div class="midia-item">
          <div class="midia-card">
            ${isVideo 
              ? `<video src="${data.url}" muted></video>`
              : `<img src="${data.url}" alt="${data.nome}">`
            }
          </div>
          <div class="midia-info">${data.nome} - ${data.marca}</div>
        </div>
      `;
    });
    
    gridHtml += '</div>';
    contentEl.innerHTML = gridHtml;
    
  } catch (e) {
    console.error("Erro ao carregar mídias:", e);
    contentEl.innerHTML = '<div class="empty-state"><p>Erro ao carregar mídias</p></div>';
  }
}

// Criar marca
async function criarMarca() {
  const nome = document.getElementById('marcaNome').value.toUpperCase();
  const entrada = document.getElementById('marcaEntrada').value;
  const saida = document.getElementById('marcaSaida').value;
  const midiaFile = document.getElementById('marcaMidia').files[0];
  
  try {
    // Criar marca
    const marcaRef = collection(db, "painel", currentStore.id, "marcas");
    const marcaData = {
      nome,
      entrada,
      saida,
      criadoEm: new Date().toISOString()
    };
    
    await addDoc(marcaRef, marcaData);
    
    // Se tiver mídia, salvar referência
    if (midiaFile) {
      const midiaRef = collection(db, "painel", currentStore.id, "midias");
      const isVideo = midiaFile.type.startsWith('video');
      
      // Em produção, você faria upload para Firebase Storage
      // Aqui vamos criar uma URL temporária como placeholder
      const midiaData = {
        nome: midiaFile.name,
        marca: nome,
        tipo: isVideo ? 'video' : 'image',
        url: URL.createObjectURL(midiaFile), // Temporário - usar Firebase Storage em produção
        criadoEm: new Date().toISOString()
      };
      
      await addDoc(midiaRef, midiaData);
    }
    
    modalMarca.classList.remove('active');
    formMarca.reset();
    renderStores(); // Atualizar contagem
    loadContent();
    
  } catch (e) {
    console.error("Erro ao criar marca:", e);
    alert("Erro ao criar marca. Tente novamente.");
  }
}

// Abrir modal de retirar
window.openRetirarModal = function(id, nome) {
  marcaToRemove = { id, nome };
  document.getElementById('retirarObs').value = '';
  modalRetirar.classList.add('active');
};

// Retirar marca
async function retirarMarca(marca) {
  const obs = document.getElementById('retirarObs').value || 'Concluído';
  
  try {
    // Buscar dados da marca
    const marcaRef = doc(db, "painel", currentStore.id, "marcas", marca.id);
    const marcaSnap = await getDoc(marcaRef);
    
    if (marcaSnap.exists()) {
      const data = marcaSnap.data();
      
      // Adicionar às saídas
      const saidaRef = collection(db, "painel", currentStore.id, "saidas");
      await addDoc(saidaRef, {
        nome: data.nome,
        entrada: data.entrada,
        saida: data.saida,
        retirada: new Date().toISOString().split('T')[0],
        obs: obs
      });
      
      // Remover da lista de marcas
      await deleteDoc(marcaRef);
    }
    
    renderStores(); // Atualizar contagem
    loadContent();
    
  } catch (e) {
    console.error("Erro ao retirar marca:", e);
    alert("Erro ao retirar marca. Tente novamente.");
  }
}

// Formatar data
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

// Iniciar aplicação
init();
