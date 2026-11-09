// Server locale della dashboard: API, eventi in tempo reale (SSE) e file della UI.
// Ascolta solo su 127.0.0.1: da fuori non si raggiunge, e non c'è nessuna parte online.
//   npm start   (oppure: node --env-file-if-exists=.env motore/server.ts)
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import {
  CARTELLA_DATI, MODELLI_CLAUDE, MODELLO_CLAUDE_PREDEFINITO, modelliCodex, modelloCodexPredefinito, RADICE,
  RAGIONAMENTO_CLAUDE, RAGIONAMENTO_CODEX, verificaAccessi, type Accessi,
} from './ambiente.ts';
import { aggiungiCartella, elencoCartelle, riepilogoCartelle, rimuoviCartella } from './cartelle.ts';
import { attivo, carica as caricaDibattito, ErroreComando, esegui, riassunto } from './comandi.ts';
import { IMPOSTAZIONI, riepilogoImpostazioni, scriviFontiNote } from './impostazioni.ts';
import { skillDisponibili } from './skill.ts';
import { Motore } from './dibattito.ts';
import type { Dibattito, Evento } from './tipi.ts';
import { AUDIO_MAX, estensioneAudio, Trascrittore } from './voce.ts';

const PORTA = Number(process.env.CONTRAPPUNTO_PORTA || 4317);
const HOST = '127.0.0.1';
const WEB = resolve(RADICE, 'web', 'dist');
const LIMITE_CORPO = 64 * 1024;
const VERSIONE = JSON.parse(readFileSync(join(RADICE, 'package.json'), 'utf8')).version as string;

// Contro il DNS rebinding: si risponde solo a richieste indirizzate a questo server.
const HOST_AMMESSI = new Set([`127.0.0.1:${PORTA}`, `localhost:${PORTA}`]);
// Contro il CSRF: i comandi devono arrivare da una pagina di questo stesso server.
// Con --dev vale anche il server di sviluppo di Vite (npm run server:dev).
const ORIGINI_AMMESSE = new Set([
  ...[...HOST_AMMESSI].map((h) => `http://${h}`),
  ...(process.argv.includes('--dev') ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : []),
]);

// Le fonti delle note (profilo, note, note salvate) per il server MCP che le CLI avviano.
scriviFontiNote();
const motore = new Motore();
// I messaggi vocali si trascrivono qui, sul PC (faster-whisper): l'audio non va altrove.
const voce = new Trascrittore(CARTELLA_DATI);
motore.setMaxListeners(100);
const recuperati = motore.recuperaInterrotti();

class ErroreHttp extends Error {
  codice: number;
  constructor(codice: number, messaggio: string) {
    super(messaggio);
    this.codice = codice;
  }
}

function json(res: ServerResponse, codice: number, corpo: unknown): void {
  res.writeHead(codice, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

async function leggiCorpo(req: IncomingMessage): Promise<unknown> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new ErroreHttp(415, 'serve Content-Type: application/json');
  let dimensione = 0;
  const parti: Buffer[] = [];
  for await (const pezzo of req) {
    dimensione += (pezzo as Buffer).length;
    if (dimensione > LIMITE_CORPO) throw new ErroreHttp(413, 'richiesta troppo grande');
    parti.push(pezzo as Buffer);
  }
  if (!dimensione) return {};
  try {
    return JSON.parse(Buffer.concat(parti).toString('utf8'));
  } catch {
    throw new ErroreHttp(400, 'JSON non valido');
  }
}

const attivoQui = (d: Dibattito) => attivo(motore, d);

// Un dibattito che sta girando nella CLI: qui si può solo guardare.
const altrove = (id: string) => motore.bloccatoAltrove(id);

function carica(id: string): Dibattito {
  try {
    return caricaDibattito(motore, id);
  } catch (e) {
    throw e instanceof ErroreComando ? new ErroreHttp(e.codice, e.message) : e;
  }
}

function comando(tipo: string, id: string | undefined, dati: unknown): unknown {
  try {
    return esegui(motore, tipo, id, dati);
  } catch (e) {
    throw e instanceof ErroreComando ? new ErroreHttp(e.codice, e.message) : e;
  }
}

let chiusura = false;
let cacheAccessi: { quando: number; dati: Accessi } | undefined;
const accessiRecenti = async () => {
  // Solo un esito buono resta in memoria: dopo il primo login, ricaricando la pagina si vede subito.
  const buono = cacheAccessi?.dati.claude.ok && cacheAccessi.dati.codex.ok;
  if (!cacheAccessi || !buono || Date.now() - cacheAccessi.quando > 60_000) cacheAccessi = { quando: Date.now(), dati: await verificaAccessi() };
  return cacheAccessi.dati;
};
// Nome e numero di file delle cartelle autorizzate (mai i percorsi): contarli costa, si tiene un minuto.
let cacheCartelle: { quando: number; dati: { nome: string; file: number }[] } | undefined;
const cartelle = () => {
  if (!cacheCartelle || Date.now() - cacheCartelle.quando > 60_000) cacheCartelle = { quando: Date.now(), dati: riepilogoCartelle() };
  return cacheCartelle.dati;
};
const info = () => ({
  claude: { modelli: MODELLI_CLAUDE, predefinito: MODELLO_CLAUDE_PREDEFINITO, ragionamento: RAGIONAMENTO_CLAUDE },
  codex: { modelli: modelliCodex(), predefinito: modelloCodexPredefinito() ?? null, ragionamento: RAGIONAMENTO_CODEX },
  attivi: motore.idPartiteAttive(),
  maxRound: 10,
  cartelle: cartelle(),
  voce: voce.stato(),
  // Le skill dell'utente le hanno gli agenti solo con l'ambiente acceso: senza, partono vuoti.
  skill: IMPOSTAZIONI.ambiente ? skillDisponibili() : { claude: [], codex: [] },
  impostazioni: riepilogoImpostazioni(),
});

function eventi(req: IncomingMessage, res: ServerResponse, id: string): void {
  carica(id);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  let n = 0;
  const invia = (tipo: string, dati: unknown) => res.write(`id: ${++n}\nevent: ${tipo}\ndata: ${JSON.stringify(dati)}\n\n`);
  const istantanea = () => {
    const d = motore.istantanea(id);
    if (d) invia('istantanea', { dibattito: d, inCorso: attivoQui(d), altrove: altrove(id), corrente: motore.corrente(id) ?? null });
  };
  // Se lo esegue la CLI gli eventi non passano da qui: si guarda il file e si rimanda lo stato.
  let ultimo = '';
  const sorveglia = setInterval(() => {
    if (!altrove(id)) return;
    const d = motore.istantanea(id);
    if (d && d.aggiornato !== ultimo) {
      ultimo = d.aggiornato;
      istantanea();
    }
  }, 2000);
  // La UI ricostruisce tutto dall'istantanea: dopo una disconnessione basta riaprire il flusso.
  istantanea();
  const ascolta = (idEvento: string, e: Evento) => {
    if (idEvento !== id) return;
    invia('evento', e);
    if (e.tipo !== 'attivita' && e.tipo !== 'turno_inizio' && e.tipo !== 'avviso') istantanea();
  };
  motore.on('evento', ascolta);
  const battito = setInterval(() => res.write(': battito\n\n'), 15_000);
  req.on('close', () => {
    motore.off('evento', ascolta);
    clearInterval(battito);
    clearInterval(sorveglia);
  });
}

async function api(req: IncomingMessage, res: ServerResponse, percorso: string[]): Promise<void> {
  const metodo = req.method ?? 'GET';
  const [, risorsa, id, azione] = percorso;

  if (risorsa === 'info' && metodo === 'GET') return json(res, 200, info());
  if (risorsa === 'accessi' && metodo === 'GET') return json(res, 200, await accessiRecenti());
  if (risorsa === 'cartelle') return apiCartelle(req, res, id, metodo);
  if (risorsa === 'voce') return apiVoce(req, res, metodo);
  if (risorsa === 'chat' && !id && metodo === 'POST') return json(res, 201, comando('chat', undefined, await leggiCorpo(req)));
  if (risorsa !== 'dibattiti') throw new ErroreHttp(404, 'risorsa sconosciuta');

  if (!id) {
    if (metodo === 'GET') return json(res, 200, motore.archivio.elenco().map((d) => riassunto(motore, d)));
    if (metodo === 'POST') return json(res, 201, comando('crea', undefined, await leggiCorpo(req)));
    throw new ErroreHttp(405, 'metodo non ammesso');
  }

  if (!azione && metodo === 'GET') {
    const d = carica(id);
    return json(res, 200, { dibattito: d, inCorso: attivoQui(d), altrove: altrove(id) });
  }
  if (azione === 'eventi' && metodo === 'GET') return eventi(req, res, id);
  if (azione === 'markdown' && metodo === 'GET') {
    carica(id);
    const file = motore.esportaMarkdown(id);
    res.writeHead(200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="dibattito-${id}.md"`,
      'Cache-Control': 'no-store',
    });
    return void createReadStream(file).pipe(res);
  }
  if (metodo !== 'POST') throw new ErroreHttp(405, 'metodo non ammesso');
  if (!azione || !AZIONI.includes(azione)) throw new ErroreHttp(404, 'azione sconosciuta');
  return json(res, 200, comando(azione, id, CON_CORPO.includes(azione) ? await leggiCorpo(req) : undefined));
}

const AZIONI = ['pausa', 'riprendi', 'concludi', 'nota', 'produzione', 'scrivi', 'salva', 'avvia'];
const CON_CORPO = ['nota', 'produzione', 'scrivi', 'avvia'];

// Messaggio vocale: l'audio grezzo nel corpo, il testo nella risposta.
async function apiVoce(req: IncomingMessage, res: ServerResponse, metodo: string): Promise<void> {
  if (metodo === 'GET') return json(res, 200, voce.stato());
  if (metodo !== 'POST') throw new ErroreHttp(405, 'metodo non ammesso');
  const tipo = String(req.headers['content-type'] ?? '');
  if (!estensioneAudio(tipo)) throw new ErroreHttp(415, 'formato audio non supportato');
  let dimensione = 0;
  const parti: Buffer[] = [];
  for await (const pezzo of req) {
    dimensione += (pezzo as Buffer).length;
    if (dimensione > AUDIO_MAX) throw new ErroreHttp(413, 'registrazione troppo lunga');
    parti.push(pezzo as Buffer);
  }
  try {
    return json(res, 200, await voce.trascrivi(Buffer.concat(parti), tipo));
  } catch (e) {
    throw new ErroreHttp(422, (e as Error).message);
  }
}

// Cartelle autorizzate: si aggiungono e si tolgono da qui; una partita ne riceve una copia filtrata.
async function apiCartelle(req: IncomingMessage, res: ServerResponse, azione: string | undefined, metodo: string): Promise<void> {
  if (!azione && metodo === 'GET') {
    const conti = new Map(cartelle().map((c) => [c.nome, c.file]));
    return json(res, 200, elencoCartelle().map((c) => ({ ...c, file: conti.get(c.nome) ?? 0 })));
  }
  if (metodo !== 'POST') throw new ErroreHttp(405, 'metodo non ammesso');
  const corpo = (await leggiCorpo(req)) as { nome?: unknown; percorso?: unknown };
  if (typeof corpo.nome !== 'string') throw new ErroreHttp(400, 'manca il nome');
  try {
    if (azione === 'aggiungi') {
      if (typeof corpo.percorso !== 'string') throw new ErroreHttp(400, 'manca il percorso');
      aggiungiCartella(corpo.nome, corpo.percorso);
    } else if (azione === 'rimuovi') {
      if (!rimuoviCartella(corpo.nome)) throw new ErroreHttp(404, 'cartella non trovata');
    } else throw new ErroreHttp(404, 'azione sconosciuta');
  } catch (e) {
    throw e instanceof ErroreHttp ? e : new ErroreHttp(400, (e as Error).message);
  }
  cacheCartelle = undefined;
  return json(res, 200, { ok: true });
}

const TIPI: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
};

const CSP = [
  "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self' data:", "connect-src 'self' blob: data:", "worker-src 'self' blob:", "media-src 'self' blob:",
  "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');

function statico(req: IncomingMessage, res: ServerResponse, percorso: string): void {
  if (!existsSync(join(WEB, 'index.html'))) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    return void res.end('La UI non è ancora compilata: lancia `npm run build` e ricarica.');
  }
  let file = resolve(WEB, `.${decodeURIComponent(percorso)}`);
  if (file !== WEB && !file.startsWith(WEB + sep)) file = join(WEB, 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(WEB, 'index.html');
  const immutabile = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'Content-Type': TIPI[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': immutabile ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Content-Security-Policy': CSP,
  });
  if (req.method === 'HEAD') return void res.end();
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  try {
    if (!HOST_AMMESSI.has(req.headers.host ?? '')) throw new ErroreHttp(421, 'host non ammesso');
    const url = new URL(req.url ?? '/', 'http://locale');
    const metodo = req.method ?? 'GET';
    if (metodo !== 'GET' && metodo !== 'HEAD') {
      if (chiusura) throw new ErroreHttp(503, 'il server si sta chiudendo');
      const origine = req.headers.origin;
      if (!origine || !ORIGINI_AMMESSE.has(origine)) throw new ErroreHttp(403, 'origine non ammessa');
    }
    const percorso = url.pathname.split('/').filter(Boolean);
    if (percorso[0] === 'api') return await api(req, res, percorso);
    if (metodo !== 'GET' && metodo !== 'HEAD') throw new ErroreHttp(405, 'metodo non ammesso');
    statico(req, res, url.pathname);
  } catch (e) {
    const codice = e instanceof ErroreHttp ? e.codice : 500;
    if (codice === 500) console.error(e);
    if (!res.headersSent) json(res, codice, { errore: (e as Error).message });
    else res.end();
  }
});

server.listen(PORTA, HOST, () => {
  console.log(`Contrappunto ${VERSIONE} · http://${HOST}:${PORTA}`);
  if (recuperati.length) console.log(`Dibattiti interrotti messi in pausa: ${recuperati.join(', ')}`);
});

// Chiudendo il server si fermano anche le CLI in corso, senza lasciare processi orfani.
async function chiudi(): Promise<void> {
  if (chiusura) process.exit(1);
  chiusura = true;
  const attivi = motore.idAttivi();
  for (const id of attivi) motore.pausa(id);
  await Promise.race([Promise.allSettled(attivi.map((id) => motore.avvia(id))), new Promise((r) => setTimeout(r, 5000))]);
  voce.chiudi();
  process.exit(0);
}
process.on('SIGINT', chiudi);
process.on('SIGTERM', chiudi);
// Su Windows chiudere la finestra del terminale manda SIGHUP (o SIGBREAK con Ctrl+Pausa):
// ci sono una decina di secondi per fermare le CLI in modo pulito.
process.on('SIGHUP', chiudi);
if (process.platform === 'win32') process.on('SIGBREAK', chiudi);
