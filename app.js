/* Funções compartilhadas — avaliação PI1 */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

const $ = (s, r) => (r || document).querySelector(s);
const el = (tag, attrs, ...kids) => {
  const n = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  });
  kids.flat().forEach(k => n.append(k && k.nodeType ? k : document.createTextNode(k == null ? '' : k)));
  return n;
};

const apiConfigurada = () => typeof API_URL === 'string' && /^https:\/\/script\.google(usercontent)?\.com\//.test(API_URL);

async function apiFetch(url, opts, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 15000);
  try {
    const r = await fetch(url, Object.assign({ signal: ctl.signal, redirect: 'follow' }, opts || {}));
    return await r.json();
  } finally { clearTimeout(t); }
}
async function apiGet(params) {
  if (!apiConfigurada()) throw new Error('Sistema ainda não configurado (URL da API).');
  return apiFetch(API_URL + '?' + new URLSearchParams(params).toString());
}
async function apiPost(payload) {
  if (!apiConfigurada()) throw new Error('Sistema ainda não configurado (URL da API).');
  // text/plain evita a requisição "preflight" do navegador (Apps Script não responde a ela)
  return apiFetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) }, 25000);
}

/* ---------- navegador embutido (WhatsApp, Instagram...) ---------- */
function navegadorEmbutido() {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|Line\/|MicroMessenger|WhatsApp|; wv\)/i.test(ua);
}
function avisoNavegador() {
  if (!navegadorEmbutido()) return null;
  return el('div', { class: 'msg aviso' },
    '⚠️ Você abriu pelo WhatsApp (ou outro app). Para funcionar sem internet em sala, toque em ⋮ ou no ícone de compartilhar e escolha ',
    el('b', {}, 'Abrir no navegador'), ' (Chrome ou Safari). Depois abra sempre por esse mesmo navegador.');
}

/* ---------- lista de alunos (vem da planilha, nunca fica no site) ---------- */
function alunosDe(turma) { const c = LS.get('pi_config_' + turma, null); return (c && c.alunos) || []; }
function nomeAluno(id) {
  const t = String(id).charAt(0);
  const a = alunosDe(t).find(x => x.id === id);
  return a ? a.nome : id;
}
async function carregarConfig(turma) {
  const r = await apiGet({ action: 'config', turma });
  if (!r.ok) throw new Error(r.erro || 'Erro ao carregar.');
  LS.set('pi_config_' + turma, r);
  return r;
}

/* ---------- identificação do aluno ---------- */
function usuario() { return LS.get('pi_user', null); }

function telaLogin(destino, aoEntrar, textoBotao) {
  const u = usuario() || {};
  const turma = el('select', {},
    el('option', { value: '' }, 'Selecione…'),
    el('option', { value: 'A' }, 'Turma A (1I)'),
    el('option', { value: 'B' }, 'Turma B (2I)'));
  const nome = el('select', {}, el('option', { value: '' }, 'Selecione a turma primeiro'));
  const codigo = el('input', { type: 'tel', inputmode: 'numeric', maxlength: '4', placeholder: '4 últimos dígitos da matrícula', autocomplete: 'off' });
  const msg = el('div', {});
  const preencher = async () => {
    nome.innerHTML = '';
    if (!turma.value) { nome.append(el('option', { value: '' }, 'Selecione a turma primeiro')); return; }
    nome.append(el('option', { value: '' }, 'Carregando nomes…'));
    try { await carregarConfig(turma.value); } catch (e) { /* usa o que estiver salvo */ }
    const lista = alunosDe(turma.value);
    nome.innerHTML = '';
    if (!lista.length) { nome.append(el('option', { value: '' }, 'Sem internet: conecte-se uma vez para carregar os nomes')); return; }
    nome.append(el('option', { value: '' }, 'Selecione seu nome…'));
    lista.forEach(a => nome.append(el('option', { value: a.id }, a.nome)));
    if (u.id && u.turma === turma.value) nome.value = u.id;
  };
  turma.addEventListener('change', preencher);
  if (u.turma) { turma.value = u.turma; preencher(); codigo.value = u.codigo || ''; }
  const ok = el('button', { class: 'big', onclick: () => {
    msg.innerHTML = '';
    if (!turma.value || !nome.value || !/^\d{4}$/.test(codigo.value.trim())) {
      msg.append(el('div', { class: 'msg erro' }, 'Escolha turma e nome e digite os 4 últimos dígitos da matrícula.'));
      return;
    }
    const a = alunosDe(turma.value).find(x => x.id === nome.value);
    const novo = { id: a.id, nome: a.nome, turma: turma.value, codigo: codigo.value.trim() };
    LS.set('pi_user', novo);
    aoEntrar(novo);
  } }, textoBotao || 'Entrar');
  destino.replaceChildren(el('div', { class: 'card' },
    el('h2', {}, 'Quem é você?'),
    el('label', {}, 'Turma'), turma,
    el('label', {}, 'Seu nome'), nome,
    el('label', {}, 'Código (4 últimos dígitos da sua matrícula)'), codigo,
    msg, ok));
}

/* ---------- datas ---------- */
const hojeBR = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
};
const dataKey = s => { const m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(s || ''); return m ? m[3] + m[2] + m[1] : '99999999'; };

/* ---------- registro do service worker ---------- */
function registrarSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ---------- código de envio (plano B) ---------- */
function codificar(obj) { return 'PI1:' + btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
function decodificar(s) {
  const t = String(s).trim().replace(/^PI1:/, '');
  return JSON.parse(decodeURIComponent(escape(atob(t))));
}
