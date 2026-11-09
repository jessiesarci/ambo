// Dove sono le CLI, con che account sono collegate e quali modelli offrono.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ambientePulito } from './processo.ts';

const execFileP = promisify(execFile);

export const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
// Un percorso dato da chi usa il programma: ~ è la cartella utente, /c/... (Git Bash) è C:\..., un
// percorso relativo vale dalla cartella del programma. Un a capo dentro vuol dire che nel .env il
// percorso Windows era tra virgolette doppie, che trasformano \n in un a capo: meglio fermarsi.
export function percorsoUtente(v: string | undefined, nome = 'percorso'): string | undefined {
  const p = v?.trim();
  if (!p) return undefined;
  if (/[\r\n]/.test(p)) throw new Error(`${nome}: il valore contiene un a capo. Nel file .env scrivi i percorsi Windows senza virgolette doppie (o con le barre /)`);
  let x = p;
  if (x === '~' || x.startsWith('~/') || x.startsWith('~\\')) x = join(homedir(), x.slice(1));
  else if (process.platform === 'win32' && /^\/[A-Za-z]\//.test(x)) x = `${x[1]!.toUpperCase()}:\\${x.slice(3)}`;
  return isAbsolute(x) ? resolve(x) : resolve(RADICE, x);
}

export const CARTELLA_DATI = percorsoUtente(process.env.AMBO_DATI, 'AMBO_DATI') ?? join(RADICE, 'dati');
// Di serie si accettano solo i login con l'abbonamento: una chiave API si paga a consumo.
export const CONSENTI_API = /^(1|si|true)$/i.test(process.env.AMBO_CONSENTI_API ?? '');
const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex');
// La cartella di Claude Code: quella di serie, o quella spostata con CLAUDE_CONFIG_DIR.
export const CARTELLA_CLAUDE = process.env.CLAUDE_CONFIG_DIR && isAbsolute(process.env.CLAUDE_CONFIG_DIR) ? resolve(process.env.CLAUDE_CONFIG_DIR) : join(homedir(), '.claude');
// Le cartelle delle CLI, con le credenziali dentro: quelle di serie più quelle spostate con
// CLAUDE_CONFIG_DIR o CODEX_HOME. Vanno vietate tutte, non solo ~/.claude e ~/.codex.
export function cartelleDelleCli(): string[] {
  const spostate = [process.env.CLAUDE_CONFIG_DIR, process.env.CODEX_HOME].filter((v): v is string => !!v && isAbsolute(v)).map((v) => resolve(v));
  return [...new Set([join(homedir(), '.claude'), join(homedir(), '.codex'), ...spostate])];
}

// I modelli Claude si passano per ID completo: con la CLI npm 2.1.96 gli alias "sonnet"/"opus"
// puntano ancora alla generazione 4.6.
export const MODELLI_CLAUDE = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'];
export const MODELLO_CLAUDE_PREDEFINITO = 'claude-sonnet-5-5';
export const RAGIONAMENTO_CLAUDE = ['low', 'medium', 'high', 'max'];
export const RAGIONAMENTO_CODEX = ['low', 'medium', 'high', 'xhigh'];

export interface Comando {
  comando: string;
  argsBase: string[];
}

// Un percorso dato a mano: un .js si lancia con node, il resto direttamente.
function daPercorso(v: string, nome: string): Comando {
  // Un nome semplice ("claude") resta un nome: lo cerca spawn nel PATH.
  const p = /[\\/]/.test(v) ? percorsoUtente(v, nome)! : v.trim();
  return /\.(c|m)?js$/i.test(p) ? { comando: process.execPath, argsBase: [p] } : { comando: p, argsBase: [] };
}

// npm su Windows mette nel PATH un file .cmd che spawn senza shell non può lanciare (e con la shell
// gli argomenti lunghi, come le istruzioni di sistema, si rovinano). Il .cmd dice cosa avvia: uno
// script .js da dare a node o un eseguibile, scritti come "%dp0%\node_modules\...".
export function obiettivoCmd(file: string): Comando | undefined {
  try {
    // Il primo "%dp0%\node.exe" è il node accanto allo shim, se c'è: serve quello dentro node_modules.
    // pnpm e Yarn mettono altre cartelle prima di node_modules ("%~dp0\global\5\node_modules\...").
    const m = /"%~?dp0%?\\((?:[^"%\\]+\\)*?node_modules\\[^"%]+\.(?:c?js|mjs|exe))"/i.exec(readFileSync(file, 'utf8'));
    if (!m) return undefined;
    const p = join(dirname(file), ...m[1]!.split('\\'));
    return existsSync(p) ? daPercorso(p, file) : undefined;
  } catch {
    return undefined;
  }
}

// La CLI nel PATH. Su macOS e Linux ci pensa spawn; su Windows si cerca il .exe o il .cmd di npm.
export function cercaNelPath(nome: string): Comando | undefined {
  if (process.platform !== 'win32') return undefined;
  for (const cartella of (process.env.PATH ?? process.env.Path ?? '').split(';').filter(Boolean)) {
    const exe = join(cartella, `${nome}.exe`);
    if (existsSync(exe)) return { comando: exe, argsBase: [] };
    const cmd = join(cartella, `${nome}.cmd`);
    if (existsSync(cmd)) {
      const obiettivo = obiettivoCmd(cmd);
      if (obiettivo) return obiettivo;
    }
  }
  return undefined;
}

// La CLI standalone di Claude Code (non il binario interno dell'app desktop): CLAUDE_BIN, poi
// l'installer nativo (~/.local/bin), poi quella nel PATH (anche installata con npm).
export function trovaClaude(): Comando {
  const bin = process.env.CLAUDE_BIN;
  if (bin) return daPercorso(bin, 'CLAUDE_BIN');
  const nativo = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude');
  if (existsSync(nativo)) return { comando: nativo, argsBase: [] };
  return cercaNelPath('claude') ?? { comando: 'claude', argsBase: [] };
}

// Codex: CODEX_BIN, la CLI nel PATH (npm o installer), poi l'app desktop di Codex, che tiene il
// binario in una cartella col nome di un hash che cambia a ogni aggiornamento.
export function trovaCodex(): Comando {
  if (process.env.CODEX_BIN) return daPercorso(process.env.CODEX_BIN, 'CODEX_BIN');
  const nelPath = cercaNelPath('codex');
  if (nelPath) return nelPath;
  // L'app desktop di Codex c'è solo su Windows; un LOCALAPPDATA vuoto darebbe una cartella relativa.
  const locale = process.env.LOCALAPPDATA ?? '';
  const base = join(locale, 'OpenAI', 'Codex', 'bin');
  if (process.platform === 'win32' && isAbsolute(locale) && existsSync(base)) {
    const candidati = readdirSync(base)
      .map((d) => join(base, d, process.platform === 'win32' ? 'codex.exe' : 'codex'))
      .filter((f) => existsSync(f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (candidati[0]) return { comando: candidati[0], argsBase: [] };
  }
  return { comando: 'codex', argsBase: [] };
}

export function modelloCodexPredefinito(): string | undefined {
  if (process.env.AMBO_MODELLO_CODEX) return process.env.AMBO_MODELLO_CODEX;
  try {
    return readFileSync(join(CODEX_HOME, 'config.toml'), 'utf8').match(/^\s*model\s*=\s*"([^"]+)"/m)?.[1];
  } catch {
    return undefined;
  }
}

export function modelliCodex(): string[] {
  try {
    const cache = JSON.parse(readFileSync(join(CODEX_HOME, 'models_cache.json'), 'utf8'));
    return (cache.models ?? []).filter((m: { visibility?: string }) => m.visibility === 'list').map((m: { slug: string }) => m.slug);
  } catch {
    return [];
  }
}

export interface Accessi {
  claude: { ok: boolean; dettaglio: string };
  codex: { ok: boolean; dettaglio: string };
}

// Controllo prima di ogni dibattito: entrambe le CLI devono essere collegate a un abbonamento,
// non a una chiave API (salvo AMBO_CONSENTI_API=1). Non legge i file delle credenziali: chiede alle CLI.
export async function verificaAccessi(): Promise<Accessi> {
  const env = ambientePulito();
  const claude = trovaClaude();
  const codex = trovaCodex();

  const risultatoClaude = await execFileP(claude.comando, [...claude.argsBase, 'auth', 'status'], { env, windowsHide: true, timeout: 30_000 })
    .then(({ stdout }) => {
      const s = JSON.parse(stdout) as { loggedIn?: boolean; authMethod?: string; subscriptionType?: string };
      if (!s.loggedIn) return { ok: false, dettaglio: 'Claude Code non è collegato: lancia `claude` e fai il login con il tuo account Claude' };
      if (s.authMethod !== 'claude.ai') {
        if (CONSENTI_API) return { ok: true, dettaglio: `Claude Code con "${s.authMethod}" (a consumo, ammesso da AMBO_CONSENTI_API)` };
        return { ok: false, dettaglio: `Claude Code usa "${s.authMethod}" invece dell'abbonamento: rifai il login con l'account Claude (o accetta il consumo con AMBO_CONSENTI_API=1)` };
      }
      return { ok: true, dettaglio: `abbonamento Claude ${s.subscriptionType ?? '?'}` };
    })
    .catch((e: Error) => ({ ok: false, dettaglio: `Claude Code non risponde: ${e.message.split('\n')[0]}` }));

  const risultatoCodex = await execFileP(codex.comando, [...codex.argsBase, 'login', 'status'], { env, windowsHide: true, timeout: 30_000 })
    .then(({ stdout, stderr }) => {
      const testo = `${stdout}\n${stderr}`;
      if (/ChatGPT/i.test(testo)) return { ok: true, dettaglio: 'abbonamento ChatGPT' };
      if (/API key/i.test(testo)) return CONSENTI_API
        ? { ok: true, dettaglio: 'chiave API di OpenAI (a consumo, ammessa da AMBO_CONSENTI_API)' }
        : { ok: false, dettaglio: 'Codex usa una chiave API: rifai il login con ChatGPT (`codex login`), o accetta il consumo con AMBO_CONSENTI_API=1' };
      return { ok: false, dettaglio: `Codex non risulta collegato: ${testo.trim().split('\n')[0]}` };
    })
    .catch((e: Error) => ({ ok: false, dettaglio: `Codex non risponde: ${e.message.split('\n')[0]}` }));

  return { claude: risultatoClaude, codex: risultatoCodex };
}
