// CONFIG: Coloca sua key do Replicate aqui
const REPLICATE_TOKEN = "SEU_TOKEN_AQUI";
const REPLICATE_API = "https://api.replicate.com/v1/predictions";

const uploadInput = document.getElementById('upload-manga');
const uploadArea = document.getElementById('upload-area');
const preview = document.getElementById('preview');
const listaProjetos = document.getElementById('lista-projetos');
const btnsEstilo = document.querySelectorAll('.btn-estilo');
const posAnime = document.getElementById('pos-anime');
const btnGravar = document.getElementById('btn-gravar');
const btnAplicarVoz = document.getElementById('btn-aplicar-voz');
const playerAudio = document.getElementById('player-audio');
const falasContainer = document.getElementById('falas-container');

let projetos = JSON.parse(localStorage.getItem('mangaScanProjetos')) || [];
let projetoAtual = null;
let mediaRecorder, audioChunks = [], audioBlob = null;

toggleBotoesEstilo(false);

// DRAG AND DROP
uploadArea.addEventListener('click', () => uploadInput.click());
uploadArea.addEventListener('dragover', e => {
  e.preventDefault();
  uploadArea.style.borderColor = '#7c3aed';
});
uploadArea.addEventListener('dragleave', () => uploadArea.style.borderColor = '');
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.style.borderColor = '';
  if (e.dataTransfer.files.length) {
    uploadInput.files = e.dataTransfer.files;
    handleUpload();
  }
});
uploadInput.addEventListener('change', handleUpload);

// UPLOAD + OCR
async function handleUpload() {
  const file = uploadInput.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return alert('Arquivo muito grande. Máximo 10MB');

  const reader = new FileReader();
  reader.onload = async e => {
    const imagem = e.target.result;
    preview.innerHTML = `<img src="${imagem}" alt="Preview"><p id="status-ocr">Lendo balões...</p>`;
    preview.classList.add('ativo');
    
    const { data: { text } } = await Tesseract.recognize(imagem, 'por', {
      logger: m => {
        if(m.status === 'recognizing text') {
          document.getElementById('status-ocr').innerText = `Lendo balões: ${Math.round(m.progress * 100)}%`;
        }
      }
    });
    
    projetoAtual = {
      id: Date.now(),
      nome: file.name,
      imagem: imagem,
      texto: text.trim(),
      status: 'Importado',
      data: new Date().toLocaleDateString('pt-BR')
    };
    
    preview.innerHTML = `<img src="${imagem}" alt="Preview">
      <div style="text-align:left; margin-top:10px; font-size:0.9rem; color:var(--text-sec);">
        <strong>Texto detectado:</strong> ${text.slice(0, 300)}...
      </div>`;
      
    salvarProjeto(projetoAtual);
    toggleBotoesEstilo(true);
  };
  reader.readAsDataURL(file);
}

function toggleBotoesEstilo(ativo) {
  btnsEstilo.forEach(btn => btn.disabled =!ativo);
}

// PIPELINE: ANIME 2D, LIVE-ACTION, EDITAR
btnsEstilo.forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!projetoAtual) return;
    const tipo = btn.dataset.tipo;
    
    if(tipo === 'anime') await gerarAnime2D();
    if(tipo === 'live') await gerarLiveAction();
    if(tipo === 'manga') alert('Editor de mangá em breve');
  });
});

async function gerarAnime2D() {
  if(REPLICATE_TOKEN === "SEU_TOKEN_AQUI") return alert('Coloca sua API key do Replicate no topo do script.js');
  
  projetoAtual.status = 'Gerando Anime 2D...';
  atualizarProjeto(projetoAtual);
  toggleBotoesEstilo(false);
  
  try {
    // Modelo: stable-video-diffusion - imagem pra vídeo
    const videoUrl = await replicateRun("stability-ai/stable-video-diffusion", {
      input_image: projetoAtual.imagem,
      prompt: `anime style, 2D animation, based on manga panel, ${projetoAtual.texto.slice(0, 200)}`
    });
    
    projetoAtual.videoAnime = videoUrl;
    projetoAtual.status = 'Anime 2D Concluído';
    salvarProjeto(projetoAtual);
    posAnime.style.display = 'block';
    mostrarFalasPraDublar(projetoAtual.texto);
    
  } catch(e) {
    alert('Erro ao gerar anime: ' + e.message);
    projetoAtual.status = 'Erro';
  }
  toggleBotoesEstilo(true);
  atualizarProjeto(projetoAtual);
}

async function gerarLiveAction() {
  if(!projetoAtual?.videoAnime) return alert('Gere o Anime 2D primeiro');
  if(REPLICATE_TOKEN === "SEU_TOKEN_AQUI") return alert('Coloca sua API key do Replicate');
  
  projetoAtual.status = 'Transformando em Live-Action...';
  atualizarProjeto(projetoAtual);
  toggleBotoesEstilo(false);
  
  try {
    // Modelo: video-to-video com prompt realista
    const videoUrl = await replicateRun("fofr/face-to-many", {
      image: projetoAtual.imagem,
      video: projetoAtual.videoAnime,
      prompt: "realistic, live action, 8k, cinematic lighting, photorealistic human actors, detailed faces"
    });
    
    projetoAtual.videoLive = videoUrl;
    projetoAtual.status = 'Live-Action Concluído';
    salvarProjeto(projetoAtual);
    
  } catch(e) {
    alert('Erro ao gerar Live-Action: ' + e.message);
    projetoAtual.status = 'Erro';
  }
  toggleBotoesEstilo(true);
  atualizarProjeto(projetoAtual);
}

// DUBLAGEM COM SUA VOZ
function mostrarFalasPraDublar(texto) {
  if(!texto) return falasContainer.innerHTML = '<p style="color:var(--text-sec)">Nenhum texto detectado.</p>';
  const falas = texto.split(/[.!?]+/).filter(f => f.trim().length > 5);
  falasContainer.innerHTML = '<strong>Falas pra dublar:</strong>' + 
    falas.slice(0, 5).map((f, i) => `<p style="margin:8px 0; color:var(--text-sec);">${i+1}. ${f.trim()}</p>`).join('');
}

btnGravar.addEventListener('click', async () => {
  if(mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    btnGravar.innerText = '🎙️ Gravar Dublagem';
    btnGravar.style.background = '#10b981';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      playerAudio.src = URL.createObjectURL(audioBlob);
      playerAudio.style.display = 'block';
      btnAplicarVoz.style.display = 'inline-block';
    };
    mediaRecorder.start();
    btnGravar.innerText = '⏹️ Parar Gravação';
    btnGravar.style.background = '#ef4444';
  } catch(err) {
    alert('Permita acesso ao microfone');
  }
});

btnAplicarVoz.addEventListener('click', async () => {
  if(!audioBlob ||!projetoAtual?.videoAnime) return alert('Grave sua voz e gere o Anime primeiro');
  if(REPLICATE_TOKEN === "SEU_TOKEN_AQUI") return alert('Coloca sua API key do Replicate');
  
  btnAplicarVoz.disabled = true;
  btnAplicarVoz.innerText = 'Sincronizando...';
  projetoAtual.status = 'Aplicando dublagem...';
  atualizarProjeto(projetoAtual);
  
  try {
    // Modelo: Wav2Lip pra sincronizar boca
    const videoDubladoUrl = await replicateRun("devxpy/cog-wav2lip", {
      face: projetoAtual.videoAnime,
      audio: await blobToBase64(audioBlob)
    });
    
    projetoAtual.videoDublado = videoDubladoUrl;
    projetoAtual.audioDublagem = URL.createObjectURL(audioBlob);
    projetoAtual.status = 'Dublagem Concluída';
    salvarProjeto(projetoAtual);
    
  } catch(e) {
    alert('Erro no lip-sync: ' + e.message);
  }
  btnAplicarVoz.disabled = false;
  btnAplicarVoz.innerText = '🔊 Sincronizar Boca';
  atualizarProjeto(projetoAtual);
});

// UTILS REPLICATE
async function replicateRun(version, input) {
  const start = await fetch(REPLICATE_API, {
    method: "POST",
    headers: {
      "Authorization": `Token ${REPLICATE_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ version, input })
  });
  let prediction = await start.json();
  if(prediction.error) throw new Error(prediction.error);
  
  while(prediction.status!== "succeeded" && prediction.status!== "failed") {
    await new Promise(r => setTimeout(r, 2500));
    const res = await fetch(`${REPLICATE_API}/${prediction.id}`, {
      headers: { "Authorization": `Token ${REPLICATE_TOKEN}` }
    });
    prediction = await res.json();
  }
  if(prediction.status === "failed") throw new Error(prediction.error);
  return prediction.output;
}

const blobToBase64 = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

// HISTÓRICO
function salvarProjeto(proj) {
  const index = projetos.findIndex(p => p.id === proj.id);
  if (index > -1) projetos[index] = proj;
  else projetos.unshift(proj);
  localStorage.setItem('mangaScanProjetos', JSON.stringify(projetos));
  renderizarHistorico();
}

function atualizarProjeto(proj) { salvarProjeto(proj); }

function apagarProjeto(id) {
  projetos = projetos.filter(p => p.id!== id);
  localStorage.setItem('mangaScanProjetos', JSON.stringify(projetos));
  renderizarHistorico();
  if (projetoAtual?.id === id) {
    projetoAtual = null;
    preview.classList.remove('ativo');
    preview.innerHTML = '';
    posAnime.style.display = 'none';
    toggleBotoesEstilo(false);
  }
}

function continuarProjeto(id) {
  projetoAtual = projetos.find(p => p.id === id);
  if (projetoAtual) {
    preview.innerHTML = `<img src="${projetoAtual.imagem}" alt="Preview">`;
    preview.classList.add('ativo');
    toggleBotoesEstilo(true);
    if(projetoAtual.videoAnime) {
      posAnime.style.display = 'block';
      mostrarFalasPraDublar(projetoAtual.texto);
    }
    if(projetoAtual.audioDublagem) {
      playerAudio.src = projetoAtual.audioDublagem;
      playerAudio.style.display = 'block';
      btnAplicarVoz.style.display = 'inline-block';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function renderizarHistorico() {
  if (projetos.length === 0) {
    listaProjetos.innerHTML = '<p class="vazio">Nenhum projeto ainda. Scaneie sua primeira obra!</p>';
    return;
  }
  listaProjetos.innerHTML = projetos.map(p => `
    <div class="item-projeto">
      <img src="${p.imagem}" alt="${p.nome}">
      <div class="info-projeto">
        <h3>${p.nome}</h3>
        <p>${p.status} • ${p.data}</p>
        ${p.videoAnime? '<span style="color:#7c3aed">🎌</span>' : ''}
        ${p.videoLive? '<span style="color:#10b981">🎬</span>' : ''}
        ${p.videoDublado? '<span style="color:#f59e0b">🎙️</span>' : ''}
      </div>
      <div class="acoes-projeto">
        <button class="btn-acao btn-continuar" onclick="continuarProjeto(${p.id})">Abrir</button>
        <button class="btn-acao btn-apagar" onclick="apagarProjeto(${p.id})">Apagar</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('limpar-tudo').addEventListener('click', () => {
  if (confirm('Apagar TODOS os projetos?')) {
    projetos = [];
    localStorage.removeItem('mangaScanProjetos');
    renderizarHistorico();
  }
});

renderizarHistorico();