// Claude nel cantiere: può leggere e scrivere file, ma solo dentro una cartella. Niente comandi,
// niente web, niente impostazioni o server MCP dell'utente (tranne, se attive, le note dell'utente in
// sola lettura). Il recinto lo fa la CLI con le regole dei permessi (dontAsk nega tutto il resto);
// il motore in più ferma il lavoro se vede un tentativo di scrivere fuori.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { CARTELLA_CLAUDE, cartelleDelleCli, CONSENTI_API, trovaClaude } from '../ambiente.ts';
import { MCP_MEMORIA, STRUMENTI_MEMORIA } from '../memoria.ts';
import { ambientePulito, codaStderr, ErroreAgente, esegui } from '../processo.ts';
import type { Uso } from '../tipi.ts';
import type { EsitoCli } from './claude.ts';

const FILE = ['Read', 'Write', 'Edit', 'Glob', 'Grep'];
const SCRITTURA = new Set(['Write', 'Edit']);

// C:\Users\nome\cantiere → //c/Users/nome/cantiere: la forma che Claude Code usa nelle regole dei permessi.
export function regolaPercorso(cartella: string): string {
  const posix = resolve(cartella).replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, l: string) => `/${l.toLowerCase()}`);
  return `/${posix}`;
}

// Cartelle che Claude Code autorizza da sé (la sua memoria automatica, le sue impostazioni): si
// vietano esplicitamente, perché le regole di divieto valgono prima di qualsiasi permesso.
export function vietateAlCantiere(): string[] {
  const casa = homedir();
  return [...cartelleDelleCli(), join(casa, '.ssh'), join(casa, 'AppData')];
}

// Dove scriverebbe davvero la CLI: "~/" è la cartella utente, "/c/..." è C:\..., il resto è relativo
// al cantiere. Tutto ciò che non si riesce a leggere così conta come "fuori".
export function percorsoReale(radice: string, p: unknown): string | undefined {
  if (typeof p !== 'string' || !p.trim()) return undefined;
  let x = p.trim();
  if (x === '~' || x.startsWith('~/') || x.startsWith('~\\')) x = join(homedir(), x.slice(1));
  else if (process.platform === 'win32' && /^\/[A-Za-z]\//.test(x)) x = `${x[1]!.toUpperCase()}:\\${x.slice(3)}`;
  else if (x.startsWith('\\\\') || x.startsWith('//')) return undefined; // UNC o percorsi speciali
  return isAbsolute(x) ? resolve(x) : resolve(radice, x);
}

// La cartella dove Claude Code terrebbe la memoria automatica di un progetto aperto nel cantiere.
export function memoriaAutomatica(cantiere: string): string {
  return join(CARTELLA_CLAUDE, 'projects', resolve(cantiere).replace(/[^A-Za-z0-9]/g, '-'), 'memory');
}

export interface OpzioniCantiere {
  prompt: string;
  sistema: string;
  cantiere: string;
  modello: string;
  ragionamento?: string;
  memoria: boolean;
  timeoutMs: number;
  maxTurni: number;
  signal?: AbortSignal;
  suAttivita?: (testo: string) => void;
  suScrittura?: (percorso: string) => void; // ogni file scritto o modificato, anche se poi il lavoro si ferma
}

export type EsitoCantiere = EsitoCli & { scritti: string[]; negati: number; finitiTurni: boolean };

export function costruisci(op: OpzioniCantiere): Promise<EsitoCantiere> {
  const { comando, argsBase } = trovaClaude();
  const radice = resolve(op.cantiere);
  // Un cantiere dentro una cartella vietata (AppData, .claude...) avrebbe tutte le scritture negate:
  // succede se i dati del programma stanno lì. Meglio dirlo subito che lasciar girare Claude a vuoto.
  const vietata = vietateAlCantiere().find((c) => (radice + sep).toLowerCase().startsWith((resolve(c) + sep).toLowerCase()));
  if (vietata) return Promise.reject(new ErroreAgente(`Cantiere: la cartella dei dati sta dentro ${vietata}, dove Claude non può scrivere. Sposta CONTRAPPUNTO_DATI in un'altra cartella`, 'strumento', false));
  const regola = regolaPercorso(radice);
  const memoria = op.memoria ? STRUMENTI_MEMORIA.claude : [];
  const ammessi = new Set([...FILE, ...memoria]);
  const args = [
    ...argsBase,
    '-p',
    '--output-format', 'stream-json', '--verbose',
    '--tools', FILE.join(','),
    ...(op.memoria ? ['--mcp-config', JSON.stringify({ mcpServers: { memoria: MCP_MEMORIA } })] : []),
    '--allowedTools', `Read(${regola}/**)`, `Edit(${regola}/**)`, ...memoria,
    '--disallowedTools', ...vietateAlCantiere().flatMap((c) => [`Edit(${regolaPercorso(c)}/**)`, `Read(${regolaPercorso(c)}/**)`]),
    '--permission-mode', 'dontAsk',
    '--strict-mcp-config',
    '--setting-sources', '',
    '--disable-slash-commands',
    '--system-prompt', op.sistema,
    '--model', op.modello,
    '--max-turns', String(op.maxTurni),
    ...(op.ragionamento ? ['--effort', op.ragionamento] : []),
  ];

  const inizio = Date.now();
  let sessione = '';
  let modello = op.modello;
  let testo: string | undefined;
  let erroreRisultato: string | undefined;
  let finitiTurni = false;
  let negati = 0;
  let uso: Uso = { ingresso: 0, inCache: 0, uscita: 0 };
  let limite: { tipo: string; reset?: number } | undefined;
  const scritti = new Set<string>();
  // Windows e macOS di solito non distinguono le maiuscole nei nomi dei file, Linux sì.
  const norma = (s: string) => (process.platform === 'linux' ? s : s.toLowerCase());
  const dentro = (p: unknown) => {
    const r = percorsoReale(radice, p);
    return !!r && (norma(r) === norma(radice) || norma(r).startsWith(norma(radice) + sep));
  };
  const memoriaPrima = existsSync(memoriaAutomatica(radice));

  return esegui({
    comando,
    args,
    cwd: radice,
    env: ambientePulito({ CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' }),
    input: op.prompt,
    timeoutMs: op.timeoutMs,
    signal: op.signal,
    suRiga: (riga, ferma) => {
      if (!riga.startsWith('{')) return;
      const ev = JSON.parse(riga);
      if (ev.type === 'system' && ev.subtype === 'init') {
        sessione = ev.session_id ?? sessione;
        modello = ev.model ?? modello;
        if (ev.apiKeySource !== 'none' && !CONSENTI_API) return ferma(`il cantiere userebbe una chiave API (apiKeySource=${ev.apiKeySource}): fermato prima di consumare`);
        const extra = (ev.tools ?? []).filter((t: string) => !ammessi.has(t));
        const server = (ev.mcp_servers ?? []).map((s: { name: string }) => s.name).filter((n: string) => n !== 'memoria' || !op.memoria);
        if (extra.length || server.length) return ferma(`il cantiere è partito con strumenti non previsti (${[...extra, ...server].join(', ')})`);
        op.suAttivita?.('Claude legge la decisione e prepara il lavoro');
      } else if (ev.type === 'rate_limit_event') {
        const info = ev.rate_limit_info ?? {};
        if (info.isUsingOverage) return ferma('Claude sta usando crediti extra a consumo: produzione fermata');
        if (info.status === 'rejected') {
          limite = { tipo: info.rateLimitType ?? 'abbonamento', reset: info.resetsAt };
          return ferma('limite');
        }
      } else if (ev.type === 'assistant') {
        for (const c of ev.message?.content ?? []) {
          if (c.type !== 'tool_use') continue;
          if (!ammessi.has(c.name)) return ferma(`Claude ha provato a usare uno strumento non ammesso (${c.name})`);
          const percorso = c.input?.file_path ?? c.input?.path;
          if (SCRITTURA.has(c.name)) {
            if (!dentro(percorso)) return ferma(`Claude ha provato a scrivere fuori dal cantiere (${percorso})`);
            const rel = relative(radice, percorsoReale(radice, percorso)!).split(sep).join('/');
            scritti.add(rel);
            op.suScrittura?.(rel);
            op.suAttivita?.(`${c.name === 'Write' ? 'Scrive' : 'Modifica'} ${rel}`);
          } else if (c.name === 'Read' && typeof percorso === 'string') {
            const letto = percorsoReale(radice, percorso);
            op.suAttivita?.(`Legge ${letto && dentro(percorso) ? relative(radice, letto).split(sep).join('/') : 'un file'}`);
          } else if (c.name.startsWith('mcp__memoria__')) {
            op.suAttivita?.('Consulta le note dell\'utente');
          }
        }
      } else if (ev.type === 'result') {
        sessione = ev.session_id ?? sessione;
        negati = (ev.permission_denials ?? []).length;
        const u = ev.usage ?? {};
        uso = {
          ingresso: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
          inCache: u.cache_read_input_tokens ?? 0,
          uscita: u.output_tokens ?? 0,
        };
        if (ev.subtype === 'error_max_turns') {
          finitiTurni = true;
          testo = typeof ev.result === 'string' && ev.result ? ev.result : 'Claude ha finito i passaggi a disposizione prima di chiudere il lavoro.';
        } else if (ev.is_error || ev.subtype !== 'success') erroreRisultato = typeof ev.result === 'string' && ev.result ? ev.result : ev.subtype;
        else testo = ev.result;
      }
    },
  }).then(({ codice, stderr, fermato }) => {
    // Controllo sul disco: la memoria automatica di Claude Code per questo cantiere non deve comparire.
    if (!memoriaPrima && existsSync(memoriaAutomatica(radice))) throw new ErroreAgente(`Cantiere: Claude ha scritto nella memoria automatica di Claude Code (${memoriaAutomatica(radice)}): produzione fermata, da controllare`, 'strumento', false);
    if (fermato === 'limite' && limite) {
      const quando = limite.reset ? new Date(limite.reset * 1000).toLocaleString('it-CH') : 'più tardi';
      throw new ErroreAgente(`Claude: limite dell'abbonamento raggiunto (${limite.tipo}), si azzera ${quando}`, 'limite', true);
    }
    if (fermato) throw new ErroreAgente(`Cantiere: ${fermato}`, /consumo|chiave/.test(fermato) ? 'consumo' : /entro/.test(fermato) ? 'tempo' : 'strumento', false);
    if (erroreRisultato) throw new ErroreAgente(`Claude: ${erroreRisultato}`, /limit|usage/i.test(erroreRisultato) ? 'limite' : 'altro', true);
    if (!testo) throw new ErroreAgente(`Claude è uscito con codice ${codice} senza resoconto\n${codaStderr(stderr)}`.trim(), 'altro', true);
    return {
      testo,
      sessione,
      modello,
      uso,
      secondi: Math.round((Date.now() - inizio) / 100) / 10,
      controllo: 'claude -p, login abbonamento, solo file del cantiere (Read/Edit limitati alla cartella), niente comandi',
      scritti: [...scritti],
      negati,
      finitiTurni,
    };
  });
}
