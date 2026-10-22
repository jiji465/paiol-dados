// Função da Vercel que guarda os dados do sistema da Paiol num repositório privado do GitHub.
//
// GET    /api/estado                  devolve { estado, versao, perfil }
// PUT    /api/estado                  recebe { estado, versao } e grava um commit novo no arquivo de dados
// GET    /api/estado?versoes=1&pagina=N   lista os salvamentos anteriores do arquivo de dados
// GET    /api/estado?versao=<sha>     devolve o arquivo de dados como estava naquele salvamento
// GET    /api/estado?foto=fotos/x.jpg devolve uma foto
// PUT    /api/estado?foto=fotos/x.jpg recebe { dados } (JPEG em base64) e grava a foto
//
// Variáveis de ambiente (cadastradas na Vercel):
//   SENHA           senha de quem edita
//   SENHA_CONSULTA  opcional; senha de quem só consulta (vê tudo, não muda nada)
//   GITHUB_TOKEN    token do GitHub com permissão Contents (leitura e escrita) no repositório de dados
//   GITHUB_REPO     repositório de dados, no formato usuario/repositorio
//   GITHUB_ARQUIVO  opcional; padrão estado.json. As fotos ficam na pasta fotos, ao lado dele
//   GITHUB_BRANCH   opcional; padrão main
import { timingSafeEqual, createHash } from 'node:crypto';

const API = 'https://api.github.com';
const LIMITE = 900 * 1024;
const LIMITE_FOTO = 2.5 * 1024 * 1024;
const ESPERA_SENHA_ERRADA = 1500;
const MAX_ERROS = 8;
const JANELA = 15 * 60 * 1000;
const POR_PAGINA = 20;

// tentativas de senha errada por endereço; fica na memória da função enquanto ela estiver ativa
const erros = new Map();
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

function json(status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function enderecoDe(request) {
  const f = request.headers.get('x-forwarded-for') || '';
  return (f.split(',')[0] || request.headers.get('x-real-ip') || 'desconhecido').trim();
}
function minutosBloqueado(ip) {
  const t = erros.get(ip), agora = Date.now();
  if (!t) return 0;
  if (t.ate > agora) return Math.ceil((t.ate - agora) / 60000);
  if (agora - t.desde > JANELA) erros.delete(ip);
  return 0;
}
function anotarErro(ip) {
  const agora = Date.now();
  let t = erros.get(ip);
  if (!t || agora - t.desde > JANELA) t = { n: 0, desde: agora, ate: 0 };
  t.n += 1;
  if (t.n >= MAX_ERROS) t.ate = agora + JANELA;
  if (erros.size > 5000) erros.clear();
  erros.set(ip, t);
}

// compara resumos de mesmo tamanho para não revelar nada pelo tempo de resposta
function confere(dada, esperada) {
  if (!esperada) return false;
  const a = createHash('sha256').update(dada).digest();
  const b = createHash('sha256').update(esperada).digest();
  return timingSafeEqual(a, b);
}
function perfilDe(request) {
  const cab = request.headers.get('authorization') || '';
  let dada = cab.startsWith('Bearer ') ? cab.slice(7) : '';
  try { dada = decodeURIComponent(dada); } catch (e) { return null; }
  if (!dada) return null;
  if (confere(dada, process.env.SENHA || '')) return 'edicao';
  if (confere(dada, process.env.SENHA_CONSULTA || '')) return 'consulta';
  return null;
}

function configuracao() {
  const faltando = ['SENHA', 'GITHUB_TOKEN', 'GITHUB_REPO'].filter((k) => !process.env[k]);
  const arquivo = (process.env.GITHUB_ARQUIVO || 'estado.json').trim().replace(/^\/+/, '');
  const pasta = arquivo.indexOf('/') >= 0 ? arquivo.slice(0, arquivo.lastIndexOf('/') + 1) : '';
  return {
    faltando,
    repo: (process.env.GITHUB_REPO || '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, ''),
    arquivo,
    pasta,
    branch: (process.env.GITHUB_BRANCH || 'main').trim(),
    token: (process.env.GITHUB_TOKEN || '').trim()
  };
}

function cabecalhos(cfg, extra) {
  return Object.assign({
    Authorization: 'Bearer ' + cfg.token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'sistema-paiol'
  }, extra || {});
}
const caminhoUrl = (c) => c.split('/').map(encodeURIComponent).join('/');

// lê ou grava um arquivo do repositório pela API de conteúdo
function conteudo(cfg, metodo, caminho, o) {
  o = o || {};
  const url = API + '/repos/' + cfg.repo + '/contents/' + caminhoUrl(caminho) + (metodo === 'GET' ? '?ref=' + encodeURIComponent(o.ref || cfg.branch) : '');
  return fetch(url, {
    method: metodo,
    headers: cabecalhos(cfg, Object.assign(o.accept ? { Accept: o.accept } : {}, o.corpo ? { 'Content-Type': 'application/json' } : {})),
    body: o.corpo ? JSON.stringify(o.corpo) : undefined,
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

async function shaAtual(cfg, caminho) {
  const r = await conteudo(cfg, 'GET', caminho);
  if (!r.ok) return null;
  const d = await r.json().catch(() => ({}));
  return d.sha || null;
}

async function ler(cfg, perfil) {
  const r = await conteudo(cfg, 'GET', cfg.arquivo);
  if (r.status === 404) {
    // o arquivo ainda não existe; confere se o repositório existe para dar a mensagem certa
    const repo = await fetch(API + '/repos/' + cfg.repo, { headers: cabecalhos(cfg) });
    if (!repo.ok) return erroGithub(repo.status);
    return json(200, { estado: null, versao: null, perfil });
  }
  if (!r.ok) return erroGithub(r.status);
  const d = await r.json();
  let estado = null;
  try { estado = JSON.parse(Buffer.from(d.content || '', 'base64').toString('utf8')); } catch (e) { estado = null; }
  return json(200, { estado, versao: d.sha || null, perfil });
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
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await conteudo(cfg, 'PUT', cfg.arquivo, { corpo: pedido });
    if (r.ok) {
      const d = await r.json();
      return json(200, { versao: d.content && d.content.sha ? d.content.sha : null });
    }
    if (r.status === 409 || r.status === 422) {
      // o GitHub também recusa quando outro arquivo (uma foto) foi gravado no mesmo instante;
      // se o arquivo de dados continua na mesma versão, tenta de novo uma vez
      const atual = await shaAtual(cfg, cfg.arquivo);
      if (tentativa === 0 && corpo.versao && atual === String(corpo.versao)) { await esperar(700); continue; }
      return json(409, { erro: 'conflito' });
    }
    return erroGithub(r.status);
  }
  return json(409, { erro: 'conflito' });
}

async function listarVersoes(cfg, pagina) {
  const url = API + '/repos/' + cfg.repo + '/commits?path=' + encodeURIComponent(cfg.arquivo) + '&sha=' + encodeURIComponent(cfg.branch) +
    '&per_page=' + POR_PAGINA + '&page=' + pagina;
  const r = await fetch(url, { headers: cabecalhos(cfg), cache: 'no-store' });
  if (!r.ok) return erroGithub(r.status);
  const lista = await r.json();
  const versoes = (Array.isArray(lista) ? lista : []).map((c) => ({
    sha: c.sha,
    data: (c.commit && ((c.commit.committer && c.commit.committer.date) || (c.commit.author && c.commit.author.date))) || null,
    mensagem: (c.commit && c.commit.message) || ''
  }));
  return json(200, { versoes, mais: versoes.length === POR_PAGINA });
}

async function lerVersao(cfg, sha) {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) return json(400, { erro: 'pedido' });
  const r = await conteudo(cfg, 'GET', cfg.arquivo, { ref: sha });
  if (r.status === 404) return json(404, { erro: 'versao' });
  if (!r.ok) return erroGithub(r.status);
  const d = await r.json();
  let estado = null;
  try { estado = JSON.parse(Buffer.from(d.content || '', 'base64').toString('utf8')); } catch (e) { estado = null; }
  if (!pareceEstado(estado)) return json(404, { erro: 'versao' });
  return json(200, { estado });
}

const FOTO_VALIDA = /^fotos\/[a-z0-9][a-z0-9-]{3,60}\.jpg$/;

async function lerFoto(cfg, nome) {
  const r = await conteudo(cfg, 'GET', cfg.pasta + nome, { accept: 'application/vnd.github.raw+json' });
  if (r.status === 404) return json(404, { erro: 'foto' });
  if (!r.ok) return erroGithub(r.status);
  const bytes = await r.arrayBuffer();
  return new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' } });
}

async function gravarFoto(cfg, nome, request) {
  let corpo;
  try { corpo = await request.json(); } catch (e) { return json(400, { erro: 'pedido' }); }
  const dados = corpo && typeof corpo.dados === 'string' ? corpo.dados : '';
  const bytes = Buffer.from(dados, 'base64');
  if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return json(400, { erro: 'pedido' });
  if (bytes.length > LIMITE_FOTO) return json(413, { erro: 'grande' });
  const pedido = { message: 'Sistema Paiol: foto adicionada', content: bytes.toString('base64'), branch: cfg.branch };
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await conteudo(cfg, 'PUT', cfg.pasta + nome, { corpo: pedido });
    if (r.ok) return json(200, { arquivo: nome });
    if (r.status === 409 && tentativa === 0) { await esperar(700); continue; }
    if (r.status === 422) return json(409, { erro: 'foto-existe' });
    return erroGithub(r.status);
  }
  return json(409, { erro: 'conflito' });
}

export default {
  async fetch(request) {
    const cfg = configuracao();
    if (cfg.faltando.length) return json(500, { erro: 'config', faltando: cfg.faltando });
    const ip = enderecoDe(request);
    const bloqueado = minutosBloqueado(ip);
    if (bloqueado) return json(429, { erro: 'bloqueado', minutos: bloqueado });
    const perfil = perfilDe(request);
    if (!perfil) {
      anotarErro(ip);
      await esperar(ESPERA_SENHA_ERRADA);
      return json(401, { erro: 'senha' });
    }
    erros.delete(ip);
    const q = new URL(request.url).searchParams, metodo = request.method;
    const soEdicao = () => json(403, { erro: 'consulta' });
    try {
      if (q.has('foto')) {
        const nome = q.get('foto') || '';
        if (!FOTO_VALIDA.test(nome)) return json(400, { erro: 'pedido' });
        if (metodo === 'GET') return await lerFoto(cfg, nome);
        if (metodo === 'PUT') return perfil === 'edicao' ? await gravarFoto(cfg, nome, request) : soEdicao();
        return json(405, { erro: 'metodo' });
      }
      if (q.has('versoes')) {
        if (metodo !== 'GET') return json(405, { erro: 'metodo' });
        if (perfil !== 'edicao') return soEdicao();
        const pagina = Math.max(1, Math.min(200, parseInt(q.get('pagina') || '1', 10) || 1));
        return await listarVersoes(cfg, pagina);
      }
      if (q.has('versao')) {
        if (metodo !== 'GET') return json(405, { erro: 'metodo' });
        if (perfil !== 'edicao') return soEdicao();
        return await lerVersao(cfg, q.get('versao') || '');
      }
      if (metodo === 'GET') return await ler(cfg, perfil);
      if (metodo === 'PUT') return perfil === 'edicao' ? await gravar(cfg, request) : soEdicao();
      return json(405, { erro: 'metodo' });
    } catch (e) {
      return json(502, { erro: 'github' });
    }
  }
};
