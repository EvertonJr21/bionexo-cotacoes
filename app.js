// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://lhfxwmilmnmvczvmtdks.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoZnh3bWlsbW5tdmN6dm10ZGtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4OTY3OTksImV4cCI6MjA5NTQ3Mjc5OX0.nxcPfsq5eVLhVTriUrMnPaIn8drNjffKQ6TqiHrlw10';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── STATE ────────────────────────────────────────────────────────────────────
let meses = [];
let itensMesAtual = [];
let filtroAtivo = 'todos';
let pendingImport = null;
let chartDist = null;
let chartTop10 = null;
let chartHist = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  initImport();
  await checkDB();
  await carregarMeses();
});

async function checkDB() {
  try {
    const { error } = await sb.from('meses').select('id').limit(1);
    const dot = document.querySelector('.dot');
    const status = document.getElementById('db-status');
    if (error) {
      dot.className = 'dot err';
      status.innerHTML = '<span class="dot err"></span> erro no banco';
    } else {
      dot.className = 'dot ok';
      status.innerHTML = '<span class="dot ok"></span> conectado';
    }
  } catch(e) {
    document.getElementById('db-status').innerHTML = '<span class="dot err"></span> sem conexão';
  }
}

// ─── NAVEGAÇÃO ────────────────────────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const page = item.dataset.page;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('page-' + page).classList.add('active');
    });
  });
}

// ─── CARREGAR MESES ───────────────────────────────────────────────────────────
async function carregarMeses() {
  const { data, error } = await sb.from('meses').select('*').order('mes', { ascending: false });
  if (error) return;
  meses = data || [];

  ['select-mes-dash', 'select-mes-analise'].forEach(id => {
    const sel = document.getElementById(id);
    const prev = sel.value;
    sel.innerHTML = '<option value="">— selecione —</option>';
    meses.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = formatMes(m.mes) + ' — ' + m.qtde_itens + ' itens';
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
  });

  if (meses.length > 0) {
    document.getElementById('select-mes-dash').value = meses[0].id;
    document.getElementById('select-mes-analise').value = meses[0].id;
    await carregarDashboard(meses[0].id);
    await carregarAnalise(meses[0].id);
  }

  document.getElementById('select-mes-dash').onchange = e => carregarDashboard(e.target.value);
  document.getElementById('select-mes-analise').onchange = e => carregarAnalise(e.target.value);
}

function formatMes(mes) {
  const [ano, m] = mes.split('-');
  const nomes = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return nomes[parseInt(m)] + '/' + ano;
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function carregarDashboard(mesId) {
  if (!mesId) return;
  const { data: itens } = await sb.from('itens').select('*').eq('mes_id', mesId);
  if (!itens) return;

  const total = itens.reduce((s, i) => s + (i.preco_total || 0), 0);
  const negociar = itens.filter(i => calcVar(i) > 5);
  const impacto = negociar.reduce((s, i) => {
    const ref = i.preco_ref1;
    if (!ref || ref <= 0) return s;
    const diff = (i.preco_unitario - ref) * i.qtde;
    return s + (diff > 0 ? diff : 0);
  }, 0);

  document.getElementById('dash-cards').innerHTML = `
    <div class="card">
      <div class="card-label">Total do pedido</div>
      <div class="card-value">R$&nbsp;${total.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
    </div>
    <div class="card">
      <div class="card-label">Itens confirmados</div>
      <div class="card-value">${itens.length}</div>
    </div>
    <div class="card">
      <div class="card-label">Itens p/ negociar</div>
      <div class="card-value danger">${negociar.length} <span style="font-size:14px">(${Math.round(negociar.length/itens.length*100)}%)</span></div>
    </div>
    <div class="card">
      <div class="card-label">Economia potencial</div>
      <div class="card-value warn">R$&nbsp;${impacto.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
    </div>
  `;

  renderChartDist(itens);
  renderChartTop10(itens);
}

function renderChartDist(itens) {
  const faixas = [[-65,-20],[-20,-10],[-10,0],[0,5],[5,10],[10,20],[20,65]];
  const labels = ['< -20%','-20 a -10%','-10 a 0%','0 a 5%','5 a 10%','10 a 20%','> 20%'];
  const cores = ['#60d08a','#a3c94a','#c8f060','#5a5852','#ffb347','#ff8c42','#ff5f5f'];
  const contagens = faixas.map(([a,b]) => itens.filter(i => { const v = calcVar(i); return v !== null && v >= a && v < b; }).length);

  if (chartDist) chartDist.destroy();
  chartDist = new Chart(document.getElementById('chart-dist'), {
    type: 'bar',
    data: { labels, datasets: [{ data: contagens, backgroundColor: cores, borderRadius: 4, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 10 }, color: '#5a5852' }, grid: { display: false } },
        y: { ticks: { font: { size: 10 }, color: '#5a5852' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function renderChartTop10(itens) {
  const top = [...itens].sort((a,b) => b.preco_total - a.preco_total).slice(0, 10);
  if (chartTop10) chartTop10.destroy();
  chartTop10 = new Chart(document.getElementById('chart-top10'), {
    type: 'bar',
    data: {
      labels: top.map(i => i.nome.substring(0, 24) + '…'),
      datasets: [{ data: top.map(i => Math.round(i.preco_total)), backgroundColor: '#378ADD', borderRadius: 4, borderSkipped: false }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'R$ ' + ctx.raw.toLocaleString('pt-BR') } } },
      scales: {
        x: { ticks: { font: { size: 9 }, color: '#5a5852', callback: v => 'R$' + Math.round(v/1000) + 'k' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { font: { size: 9 }, color: '#5a5852' } }
      }
    }
  });
}

// ─── ANÁLISE ──────────────────────────────────────────────────────────────────
async function carregarAnalise(mesId) {
  if (!mesId) return;
  const { data } = await sb.from('itens').select('*').eq('mes_id', mesId);
  itensMesAtual = data || [];
  renderTabela();
  renderBanner();
}

function calcVar(item) {
  const ref = item.preco_ref1;
  if (!ref || ref <= 0) return null;
  return ((item.preco_unitario - ref) / ref) * 100;
}

function setFiltro(f) {
  filtroAtivo = f;
  ['todos','neg','ok'].forEach(x => document.getElementById('btn-' + x).classList.remove('active'));
  document.getElementById('btn-' + f).classList.add('active');
  renderTabela();
}

function renderBanner() {
  const limiar = parseFloat(document.getElementById('pct-slider').value) || 5;
  const neg = itensMesAtual.filter(i => { const v = calcVar(i); return v !== null && v > limiar; });
  const banner = document.getElementById('negocia-banner');

  if (neg.length === 0) { banner.style.display = 'none'; return; }
  banner.style.display = 'block';
  document.getElementById('badge-qtd-neg').textContent = neg.length + ' itens';
  document.getElementById('negocia-nums').innerHTML =
    '<strong>' + neg.length + ' itens:</strong> ' + neg.map(i => i.seq).join(', ');
}

function renderTabela() {
  const busca = document.getElementById('busca').value.toLowerCase();
  const limiar = parseFloat(document.getElementById('pct-slider').value) || 0;
  renderBanner();

  let lista = itensMesAtual.filter(i => {
    const v = calcVar(i);
    const matchBusca = i.nome.toLowerCase().includes(busca) || String(i.seq).includes(busca) || i.codigo.includes(busca);
    const matchFiltro = filtroAtivo === 'todos' ? true : filtroAtivo === 'neg' ? (v !== null && v > 5) : (v === null || v <= 5);
    const matchPct = v === null || Math.abs(v) >= limiar;
    return matchBusca && matchFiltro && matchPct;
  });

  document.getElementById('tabela-body').innerHTML = lista.map(item => {
    const v = calcVar(item);
    const vStr = v === null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    const neg = v !== null && v > 5;
    const badge = v === null ? 'badge-neutral' : v > 10 ? 'badge-danger' : v > 5 ? 'badge-warn2' : 'badge-ok2';
    const statusTxt = v === null ? 'sem ref' : v > 10 ? 'negociar' : v > 5 ? 'atenção' : v <= 0 ? 'abaixo' : 'ok';
    const barW = v === null ? 0 : Math.min(Math.abs(v) / 65 * 100, 100);
    const barColor = v > 10 ? '#ff5f5f' : v > 5 ? '#ffb347' : '#60d08a';
    return `<tr class="${neg ? 'neg-row' : ''}">
      <td style="font-family:var(--mono);color:var(--text3)">${item.seq}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${item.nome}">${item.nome}</td>
      <td style="font-family:var(--mono)">${Number(item.qtde).toLocaleString('pt-BR')}</td>
      <td style="font-family:var(--mono)">R$ ${Number(item.preco_unitario).toFixed(4)}</td>
      <td style="font-family:var(--mono)">${item.preco_ref1 && item.preco_ref1 > 0 ? 'R$ ' + Number(item.preco_ref1).toFixed(4) : '—'}</td>
      <td><div class="var-cell" style="color:${v===null?'var(--text3)':v>5?barColor:'var(--ok)'}">${vStr}<div class="var-bar"><div class="var-bar-fill" style="width:${barW}%;background:${barColor}"></div></div></div></td>
      <td style="font-family:var(--mono)">R$ ${Number(item.preco_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
      <td><span class="badge ${badge}">${statusTxt}</span></td>
    </tr>`;
  }).join('');

  document.getElementById('rodape').textContent = `${lista.length} de ${itensMesAtual.length} itens`;
}

function copiarItens() {
  const limiar = parseFloat(document.getElementById('pct-slider').value) || 5;
  const neg = itensMesAtual.filter(i => { const v = calcVar(i); return v !== null && v > limiar; });
  const txt = neg.map(i => `Item ${i.seq}: ${i.nome} — ${calcVar(i).toFixed(1)}% acima da ref.`).join('\n');
  navigator.clipboard.writeText(txt).then(() => toast('Lista copiada!', 'success'));
}

// ─── IMPORTAR ─────────────────────────────────────────────────────────────────
function initImport() {
  const zone = document.getElementById('drop-zone');
  const input = document.getElementById('file-input');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processarArquivo(file);
  });
  input.addEventListener('change', e => { if (e.target.files[0]) processarArquivo(e.target.files[0]); });
  document.getElementById('btn-cancelar').addEventListener('click', cancelarImport);
  document.getElementById('btn-importar').addEventListener('click', confirmarImport);
}

function processarArquivo(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const raw = JSON.parse(e.target.result);
      const confirmados = raw.filter(d => d['status'] === 'Confirmado');
      if (confirmados.length === 0) { toast('Nenhum item confirmado encontrado.', 'error'); return; }

      const datas = confirmados.map(d => d['data confirmacao']).filter(Boolean);
      const mesRef = inferirMes(datas);
      const total = confirmados.reduce((s, d) => s + (d['preco total'] || 0), 0);

      pendingImport = { raw: confirmados, mes: mesRef, total, qtde: confirmados.length };

      document.getElementById('preview-title').textContent = 'Cotação — ' + formatMes(mesRef);
      document.getElementById('preview-sub').textContent = confirmados.length + ' itens confirmados · Total R$ ' + total.toLocaleString('pt-BR', {minimumFractionDigits: 2});

      const previewCards = document.getElementById('preview-cards');
      previewCards.innerHTML = `
        <div class="card"><div class="card-label">Mês detectado</div><div class="card-value" style="font-size:18px">${formatMes(mesRef)}</div></div>
        <div class="card"><div class="card-label">Itens confirmados</div><div class="card-value" style="font-size:18px">${confirmados.length}</div></div>
        <div class="card"><div class="card-label">Total do pedido</div><div class="card-value" style="font-size:18px">R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div></div>
      `;

      const existente = meses.find(m => m.mes === mesRef);
      document.getElementById('alert-duplicado').style.display = existente ? 'flex' : 'none';

      await calcularDiff(confirmados, mesRef);

      document.getElementById('drop-zone').style.display = 'none';
      document.getElementById('import-preview').style.display = 'block';

    } catch (err) {
      toast('Erro ao ler o arquivo. Verifique se é o JSON correto do Bionexo.', 'error');
    }
  };
  reader.readAsText(file);
}

function inferirMes(datas) {
  const partes = datas.map(d => {
    const [dia, mes, ano] = d.split('/');
    return `${ano}-${mes.padStart(2,'0')}`;
  });
  const contagem = {};
  partes.forEach(p => contagem[p] = (contagem[p] || 0) + 1);
  return Object.entries(contagem).sort((a,b) => b[1]-a[1])[0][0];
}

async function calcularDiff(novosItens, mesRef) {
  const mesAnterior = meses[0];
  if (!mesAnterior || mesAnterior.mes === mesRef) {
    document.getElementById('diff-panel').style.display = 'none';
    return;
  }

  const { data: anteriores } = await sb.from('itens').select('codigo,nome,preco_unitario').eq('mes_id', mesAnterior.id);
  if (!anteriores || anteriores.length === 0) { document.getElementById('diff-panel').style.display = 'none'; return; }

  const mapAnt = {};
  anteriores.forEach(i => mapAnt[i.codigo] = i);

  const codigosNovos = new Set(novosItens.map(i => i['codigo produto']));
  const codigosAnt = new Set(Object.keys(mapAnt));

  const novos = novosItens.filter(i => !codigosAnt.has(i['codigo produto']));
  const removidos = anteriores.filter(i => !codigosNovos.has(i.codigo));
  const alterados = novosItens.filter(i => {
    const ant = mapAnt[i['codigo produto']];
    if (!ant) return false;
    const diff = Math.abs(i['preco unitario'] - ant.preco_unitario) / ant.preco_unitario;
    return diff > 0.01;
  });

  document.getElementById('diff-panel').style.display = 'block';
  document.getElementById('diff-content').innerHTML = `
    <div class="diff-grid">
      <div class="diff-item">
        <div class="diff-item-label">Itens novos</div>
        <div class="diff-item-value new">${novos.length}</div>
        ${novos.length > 0 ? '<div class="diff-list">' + novos.slice(0,3).map(i=>'<span>'+i['produto nome'].substring(0,35)+'</span>').join('<br>') + (novos.length>3?'<br>…e mais '+(novos.length-3):'') + '</div>' : ''}
      </div>
      <div class="diff-item">
        <div class="diff-item-label">Removidos</div>
        <div class="diff-item-value removed">${removidos.length}</div>
        ${removidos.length > 0 ? '<div class="diff-list">' + removidos.slice(0,3).map(i=>'<span>'+i.nome.substring(0,35)+'</span>').join('<br>') + (removidos.length>3?'<br>…e mais '+(removidos.length-3):'') + '</div>' : ''}
      </div>
      <div class="diff-item">
        <div class="diff-item-label">Preço alterado</div>
        <div class="diff-item-value changed">${alterados.length}</div>
        ${alterados.length > 0 ? '<div class="diff-list">' + alterados.slice(0,3).map(i=>{
          const ant = mapAnt[i['codigo produto']];
          const delta = ((i['preco unitario']-ant.preco_unitario)/ant.preco_unitario*100).toFixed(1);
          return '<span>'+i['produto nome'].substring(0,25)+'…</span> '+(delta>0?'+':'')+delta+'%';
        }).join('<br>') + (alterados.length>3?'<br>…e mais '+(alterados.length-3):'') + '</div>' : ''}
      </div>
    </div>
  `;
}

function cancelarImport() {
  pendingImport = null;
  document.getElementById('drop-zone').style.display = 'flex';
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('file-input').value = '';
}

async function confirmarImport() {
  if (!pendingImport) return;
  const btn = document.getElementById('btn-importar');
  btn.disabled = true;
  btn.textContent = 'Importando…';

  try {
    const existente = meses.find(m => m.mes === pendingImport.mes);
    if (existente) {
      await sb.from('itens').delete().eq('mes_id', existente.id);
      await sb.from('meses').delete().eq('id', existente.id);
    }

    const { data: novoMes, error: erroMes } = await sb.from('meses').insert({
      mes: pendingImport.mes,
      total_pedido: pendingImport.total,
      qtde_itens: pendingImport.qtde
    }).select().single();

    if (erroMes) throw erroMes;

    const itens = pendingImport.raw.map(d => ({
      mes_id: novoMes.id,
      seq: d['sequencia item'],
      codigo: d['codigo produto'],
      nome: d['produto nome'],
      unidade: d['produto unidade medida'],
      qtde: d['qtde venda'],
      preco_unitario: d['preco unitario'],
      preco_total: d['preco total'],
      preco_ref1: d['preco referencia'],
      preco_ref2: d['preco referencia 2'],
      preco_ref3: d['preco referencia 3'],
      fornecedor: d['fornec razao social'],
      forma_pgto: d['forma pagamento'],
      dias_entrega: d['dias para entrega']
    }));

    const CHUNK = 500;
    for (let i = 0; i < itens.length; i += CHUNK) {
      const { error } = await sb.from('itens').insert(itens.slice(i, i + CHUNK));
      if (error) throw error;
    }

    toast(pendingImport.qtde + ' itens importados com sucesso!', 'success');
    cancelarImport();
    await carregarMeses();

  } catch (err) {
    toast('Erro na importação: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Confirmar importação';
  }
}

// ─── HISTÓRICO ────────────────────────────────────────────────────────────────
async function buscarHistorico() {
  const codigo = document.getElementById('hist-codigo').value.trim();
  if (codigo.length < 1) {
    document.getElementById('hist-resultado').innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <p>Digite o código de um produto para ver o histórico de preços mês a mês.</p>
      </div>`;
    return;
  }

  const { data, error } = await sb
    .from('itens')
    .select('*, meses(mes)')
    .eq('codigo', codigo)
    .order('created_at', { ascending: true });

  if (error || !data || data.length === 0) {
    document.getElementById('hist-resultado').innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <p>Nenhum registro encontrado para o código <strong>${codigo}</strong>.</p>
      </div>`;
    return;
  }

  const sorted = [...data].sort((a,b) => a.meses.mes.localeCompare(b.meses.mes));
  const nome = sorted[sorted.length - 1].nome;

  const timeline = sorted.map((item, idx) => {
    const prev = sorted[idx - 1];
    let delta = '';
    if (prev) {
      const pct = ((item.preco_unitario - prev.preco_unitario) / prev.preco_unitario * 100);
      const cls = pct > 0 ? 'up' : 'down';
      delta = `<div class="hist-mes-delta ${cls}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</div>`;
    }
    return `
      <div class="hist-mes">
        <div class="hist-mes-label">${formatMes(item.meses.mes)}</div>
        <div class="hist-mes-preco">R$ ${Number(item.preco_unitario).toFixed(4)}</div>
        ${delta}
      </div>`;
  }).join('');

  const canvasId = 'chart-hist-' + codigo;
  document.getElementById('hist-resultado').innerHTML = `
    <div class="hist-produto">
      <div class="hist-nome">${nome}</div>
      <div class="hist-codigo">Código: ${codigo}</div>
      <div class="hist-timeline">${timeline}</div>
    </div>
    <div class="hist-chart-wrap">
      <div class="panel-title">Evolução do preço unitário</div>
      <div style="position:relative;height:200px"><canvas id="${canvasId}" role="img" aria-label="Gráfico de evolução de preço do produto ${nome}">Histórico de preços.</canvas></div>
    </div>
  `;

  if (chartHist) chartHist.destroy();
  chartHist = new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels: sorted.map(i => formatMes(i.meses.mes)),
      datasets: [{
        label: 'Preço unitário',
        data: sorted.map(i => Number(i.preco_unitario)),
        borderColor: '#c8f060',
        backgroundColor: 'rgba(200,240,96,0.08)',
        pointBackgroundColor: '#c8f060',
        pointRadius: 5,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'R$ ' + ctx.raw.toFixed(4) } } },
      scales: {
        x: { ticks: { color: '#5a5852', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#5a5852', font: { size: 11 }, callback: v => 'R$ ' + v.toFixed(2) }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.className = 'toast', 3200);
}
