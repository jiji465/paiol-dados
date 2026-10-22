// Função da Vercel que guarda os dados do sistema da Paiol num repositório privado do GitHub.
// GET  /api/estado  devolve { estado, versao }
// PUT  /api/estado  recebe { estado, versao } e grava um commit novo no arquivo de dados
//
// Variáveis de ambiente (cadastradas na Vercel):
//   SENHA          senha de acesso ao sistema
//   GITHUB_TOKEN   token do GitHub com permissão Contents (leitura e escrita) no repositório de dados
//   GITHUB_REPO    repositório de dados, no formato usuario/paiol-dados
//   GITHUB_ARQUIVO opcional; padrão estado.json
//   GITHUB_BRANCH  opcional; padrão main
import { timingSafeEqual, createHash } from 'node:crypto';

const API = 'https://api.github.com';
const LIMITE = 900 * 1024;

function json(status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function senhaConfere(request) {
  const esperada = process.env.SENHA || '';
  const cab = request.headers.get('authorization') || '';
  let dada = cab.startsWith('Bearer ') ? cab.slice(7) : '';
  try { dada = decodeURIComponent(dada); } catch (e) { return false; }
  // compara resumos de mesmo tamanho para não revelar nada pelo tempo de resposta
  const a = createHash('sha256').update(dada).digest();
  const b = createHash('sha256').update(esperada).digest();
  return esperada.length > 0 && timingSafeEqual(a, b);
}

function configuracao() {
  const faltando = ['SENHA', 'GITHUB_TOKEN', 'GITHUB_REPO'].filter((k) => !process.env[k]);
  return {
    faltando,
    repo: (process.env.GITHUB_REPO || '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, ''),
    arquivo: process.env.GITHUB_ARQUIVO || 'estado.json',
    branch: process.env.GITHUB_BRANCH || 'main',
    token: process.env.GITHUB_TOKEN || ''
  };
}

function github(cfg, metodo, corpo) {
  const caminho = cfg.arquivo.split('/').map(encodeURIComponent).join('/');
  const url = API + '/repos/' + cfg.repo + '/contents/' + caminho + (metodo === 'GET' ? '?ref=' + encodeURIComponent(cfg.branch) : '');
  return fetch(url, {
    method: metodo,
    headers: {
      Authorization: 'Bearer ' + cfg.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sistema-paiol',
      ...(corpo ? { 'Content-Type': 'application/json' } : {})
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: 'no-store'
  });
}

function erroGithub(status) {
  if (status === 401 || status === 403) return json(502, { erro: 'token' });
  if (status === 404) return json(502, { erro: 'repositorio' });
  return json(502, { erro: 'github', status });
}

function pareceEstado(e) {
  return !!(e && typeof e === 'object' && e.planta && Array.isArray(e.planta.itens) && Array.isArray(e.setores) && Array.isArray(e.processos));
}

async function ler(cfg) {
  const r = await github(cfg, 'GET');
  if (r.status === 404) {
    // o arquivo ainda não existe; confere se o repositório existe para dar a mensagem certa
    const repo = await fetch(API + '/repos/' + cfg.repo, { headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'sistema-paiol' } });
    if (!repo.ok) return erroGithub(repo.status);
    return json(200, { estado: null, versao: null });
  }
  if (!r.ok) return erroGithub(r.status);
  const d = await r.json();
  let estado = null;
  try { estado = JSON.parse(Buffer.from(d.content || '', 'base64').toString('utf8')); } catch (e) { estado = null; }
  return json(200, { estado, versao: d.sha || null });
}

async function gravar(cfg, request) {
  let corpo;
  try { corpo = await request.json(); } catch (e) { return json(400, { erro: 'pedido' }); }
  if (!corpo || !pareceEstado(corpo.estado)) return json(400, { erro: 'pedido' });
  const texto = JSON.stringify(corpo.estado, null, 1);
  if (Buffer.byteLength(texto, 'utf8') > LIMITE) return json(413, { erro: 'grande' });
  const pedido = {
    message: 'Sistema Paiol: dados salvos em ' + new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
    content: Buffer.from(texto, 'utf8').toString('base64'),
    branch: cfg.branch
  };
  if (corpo.versao) pedido.sha = String(corpo.versao);
  const r = await github(cfg, 'PUT', pedido);
  if (r.ok) {
    const d = await r.json();
    return json(200, { versao: d.content && d.content.sha ? d.content.sha : null });
  }
  // 409: o arquivo mudou depois que a página abriu; 422 sem versão: o arquivo já existia
  if (r.status === 409 || (r.status === 422 && !corpo.versao)) return json(409, { erro: 'conflito' });
  return erroGithub(r.status);
}

export default {
  async fetch(request) {
    const cfg = configuracao();
    if (cfg.faltando.length) return json(500, { erro: 'config', faltando: cfg.faltando });
    if (!senhaConfere(request)) return json(401, { erro: 'senha' });
    try {
      if (request.method === 'GET') return await ler(cfg);
      if (request.method === 'PUT') return await gravar(cfg, request);
      return json(405, { erro: 'metodo' });
    } catch (e) {
      return json(502, { erro: 'github' });
    }
  }
};
