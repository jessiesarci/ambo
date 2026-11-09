// Le cartelle che l'utente autorizza. Gli agenti non toccano mai il disco: per un dibattito ricevono
// nel messaggio una copia del testo dei file (il dossier), per la produzione lavorano su una copia
// dentro il cantiere. L'elenco si cambia solo dal PC (dashboard o CLI).
// Dai file si tolgono cartelle di dipendenze e build, file di credenziali e righe che sembrano segreti.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, extname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { CARTELLA_DATI, cartelleDelleCli, RADICE } from './ambiente.ts';
import type { Dossier } from './tipi.ts';

export interface Cartella {
  nome: string;
  percorso: string;
  aggiunta: string;
}

const FILE = join(CARTELLA_DATI, 'cartelle.json');
const NOME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,39}$/u;

const CARTELLE_ESCLUSE = new Set([
  'node_modules', '.git', '.hg', '.svn', '.next', '.nuxt', '.svelte-kit', '.astro', 'dist', 'build', 'out',
  '.vercel', '.netlify', '.turbo', '.cache', '.parcel-cache', 'coverage', '.venv', 'venv', 'env',
  '__pycache__', '.mypy_cache', '.pytest_cache', '.idea', '.gradle', 'target', 'vendor', '.terraform',
]);
// File che di solito contengono credenziali: non si leggono nemmeno.
const FILE_SEGRETI = /(^\.env($|\.)|\.pem$|\.key$|\.p12$|\.pfx$|\.jks$|\.keystore$|^id_(rsa|dsa|ecdsa|ed25519)|credential|secret|\.npmrc$|\.pypirc$|\.netrc$|auth\.json$|\.sqlite3?$|\.db$|\.kdbx$|\.tfstate)/i;
const TESTO = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.jsonc', '.md', '.mdx', '.txt', '.css', '.scss', '.sass', '.less',
  '.html', '.htm', '.astro', '.vue', '.svelte', '.py', '.toml', '.yaml', '.yml', '.sql', '.prisma', '.graphql', '.gql',
  '.sh', '.ps1', '.bat', '.cmd', '.xml', '.svg', '.csv', '.ini', '.cfg', '.conf', '.go', '.rs', '.java', '.kt', '.php',
  '.rb', '.c', '.h', '.cpp', '.hpp', '.cs', '.swift', '.dart', '.lua', '.r', '.tex', '.rst', '.adoc', '.env.example',
]);
const SENZA_ESTENSIONE = new Set(['Dockerfile', 'Makefile', 'Procfile', 'LICENSE', 'README', '.gitignore', '.editorconfig', '.prettierrc', '.eslintrc']);
// Righe che sembrano credenziali: si cancellano dal testo prima che arrivi a un agente.
const SEGRETI_NEL_TESTO: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{10,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{30,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\bsb_secret_[A-Za-z0-9_-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis):\/\/[^\s"'`]*:[^\s"'`@]+@[^\s"'`]+/g,
  /\b(sbp|npm|whsec|hf|gsk|glpat|dop_v1|shpat|xoxe|pat)_[A-Za-z0-9_-]{16,}/g,
  /\bGOCSPX-[A-Za-z0-9_-]{20,}/g,
  /\b\d{8,10}:[A-Za-z0-9_-]{30,}/g, // token dei bot Telegram
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g,
  /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s"'`:/@]+:[^\s"'`@]+@[^\s"'`]+/gi, // schema://utente:password@host
  /((?:^|[\s;{,(])(?:password|pwd|passwd)\s*=\s*)[^;\s"']{4,}/gim, // Password=...; nelle stringhe di connessione
  /(define\(\s*["'][A-Z_]*(?:PASS|SECRET|KEY|TOKEN|SALT|AUTH)[A-Z_]*["']\s*,\s*)["'][^"'\n]{4,}["']/g,
  // Chiave che contiene pass/pwd/secret/token/key/auth (anche DB_PASSWORD, AWS_SECRET_ACCESS_KEY):
  // con il valore tra virgolette ovunque (codice, JSON); senza virgolette solo a inizio riga (.env, .ini, YAML),
  // così `const token = getToken()` resta leggibile.
  /((?:^|[\s{,(])["']?[A-Za-z0-9_.-]*(?:pass(?:word|wd)?|pwd|secret|token|api[_-]?key|private[_-]?key|access[_-]?key|auth|credential)[A-Za-z0-9_.-]*["']?\s*[:=]\s*)(?:"[^"\n]{4,}"|'[^'\n]{4,}')/gim,
  /^(\s*(?:export\s+|set\s+)?[A-Za-z0-9_.-]*(?:pass(?:word|wd)?|pwd|secret|token|api[_-]?key|private[_-]?key|access[_-]?key|auth|credential)[A-Za-z0-9_.-]*\s*[:=]\s*)(?!\[RIMOSSO)[^\s"'#;]{6,}/gim,
];
const MAX_FILE = 200 * 1024;
const MAX_VISITATI = 4000;

// --- l'elenco delle cartelle autorizzate ----------------------------------------------------

export function elencoCartelle(): Cartella[] {
  if (!existsSync(FILE)) return [];
  try {
    const dati = JSON.parse(readFileSync(FILE, 'utf8')) as unknown;
    if (!Array.isArray(dati)) throw new Error('non è un elenco');
    return (dati as Cartella[]).filter((c) => typeof c?.nome === 'string' && typeof c.percorso === 'string' && NOME.test(c.nome) && isAbsolute(c.percorso));
  } catch (e) {
    // Un file rovinato non deve fermare il motore: niente cartelle finché non si sistema.
    console.error(`${FILE} non leggibile (${(e as Error).message}): nessuna cartella autorizzata`);
    return [];
  }
}

function salva(cartelle: Cartella[]): void {
  mkdirSync(CARTELLA_DATI, { recursive: true });
  writeFileSync(`${FILE}.tmp`, JSON.stringify(cartelle, null, 2));
  renameSync(`${FILE}.tmp`, FILE);
}

// Cartelle che non si autorizzano mai: la radice di un disco, la home intera, i dati delle CLI
// (con le credenziali) e i dati di questo progetto.
function vietata(percorso: string): string | undefined {
  const p = resolve(percorso).toLowerCase();
  const casa = homedir().toLowerCase();
  if (parse(p).root.toLowerCase() === p || p === casa) return 'una cartella troppo ampia (un disco intero o la cartella utente)';
  for (const sensibile of [...cartelleDelleCli(), join(casa, '.ssh'), join(casa, 'AppData'), resolve(CARTELLA_DATI)]) {
    const s = sensibile.toLowerCase();
    if (p === s || p.startsWith(s + sep) || s.startsWith(p + sep)) return `una cartella che contiene o sta dentro ${sensibile}`;
  }
  if (p === resolve(RADICE).toLowerCase()) return 'la cartella del programma stesso';
  return undefined;
}

export function aggiungiCartella(nome: string, percorso: string): Cartella {
  const n = nome.trim();
  if (!NOME.test(n)) throw new Error('nome non valido: lettere, numeri, spazi, punto, trattino; al massimo 40 caratteri');
  if (!isAbsolute(percorso)) throw new Error('serve il percorso completo, per esempio C:\\Users\\nome\\Desktop\\progetto o /home/nome/progetto');
  if (!existsSync(percorso) || !statSync(percorso).isDirectory()) throw new Error('la cartella non esiste');
  const vero = realpathSync(percorso);
  const motivo = vietata(vero);
  if (motivo) throw new Error(`non si può autorizzare ${motivo}`);
  const cartelle = elencoCartelle();
  if (cartelle.some((c) => c.nome.toLowerCase() === n.toLowerCase())) throw new Error(`c'è già una cartella chiamata "${n}"`);
  const c = { nome: n, percorso: vero, aggiunta: new Date().toISOString() };
  salva([...cartelle, c]);
  return c;
}

export function rimuoviCartella(nome: string): boolean {
  const cartelle = elencoCartelle();
  const resto = cartelle.filter((c) => c.nome !== nome);
  if (resto.length === cartelle.length) return false;
  salva(resto);
  return true;
}

export function trovaCartella(nome: string): Cartella {
  const c = elencoCartelle().find((x) => x.nome === nome);
  if (!c) throw new Error(`la cartella "${nome}" non è autorizzata`);
  const motivo = vietata(c.percorso);
  if (motivo) throw new Error(`la cartella "${nome}" non è più ammessa: è ${motivo}`);
  if (!existsSync(c.percorso)) throw new Error(`la cartella "${nome}" non esiste più (${c.percorso})`);
  return c;
}

// --- quali file si leggono -------------------------------------------------------------------

function adatto(nome: string): boolean {
  if (FILE_SEGRETI.test(nome)) return false;
  return TESTO.has(extname(nome).toLowerCase()) || SENZA_ESTENSIONE.has(nome);
}

// Solo file veri: niente collegamenti (che potrebbero portare fuori dalla cartella).
export function elencaFile(radice: string): { percorso: string; byte: number }[] {
  const trovati: { percorso: string; byte: number }[] = [];
  let visitati = 0;
  const giro = (cartella: string, profondita: number) => {
    if (profondita > 10 || visitati > MAX_VISITATI) return;
    let voci;
    try {
      voci = readdirSync(cartella, { withFileTypes: true });
    } catch {
      return;
    }
    for (const v of voci) {
      if (++visitati > MAX_VISITATI) return;
      if (v.isSymbolicLink()) continue;
      const pieno = join(cartella, v.name);
      if (v.isDirectory()) {
        if (!CARTELLE_ESCLUSE.has(v.name) && !v.name.startsWith('.')) giro(pieno, profondita + 1);
      } else if (v.isFile() && adatto(v.name)) {
        const byte = lstatSync(pieno).size;
        if (byte > 0 && byte <= MAX_FILE) trovati.push({ percorso: relative(radice, pieno).split(sep).join('/'), byte });
      }
    }
  };
  giro(radice, 0);
  return trovati;
}

// Prima quello che spiega il progetto, poi la configurazione, poi il resto dal più in superficie.
function priorita(p: string): number {
  const nome = p.split('/').pop()!.toLowerCase();
  const profondita = p.split('/').length - 1;
  if (/^readme/.test(nome)) return profondita * 10;
  if (/^(package\.json|pyproject\.toml|cargo\.toml|go\.mod|composer\.json|tsconfig\.json|astro\.config|next\.config|vite\.config)/.test(nome)) return 100 + profondita * 10;
  if (/\.(md|mdx|txt)$/.test(nome) && profondita <= 1) return 200 + profondita * 10;
  if (/(lock|\.min\.)/.test(nome)) return 10_000;
  return 1000 + profondita * 50;
}

export function pulisci(testo: string): { testo: string; rimossi: number } {
  let rimossi = 0;
  let t = testo;
  for (const re of SEGRETI_NEL_TESTO) {
    t = t.replace(re, (_m, prefisso?: string) => {
      rimossi++;
      return `${typeof prefisso === 'string' && /[:=,]\s*$/.test(prefisso) ? prefisso : ''}[RIMOSSO: possibile segreto]`;
    });
  }
  return { testo: t, rimossi };
}

function leggiTesto(file: string): string | undefined {
  const buf = readFileSync(file);
  if (buf.includes(0)) return undefined;
  return buf.toString('utf8');
}

// Il testo che ricevono gli agenti, con un tetto di caratteri.
// Nel materiale niente che possa sembrare un pezzo del messaggio del motore: il delimitatore del
// dibattito e le intestazioni che il motore usa (nota del moderatore, problema) si disinnescano.
export function disinnesca(testo: string, delimitatore: string): string {
  return testo
    .split(delimitatore).join('[delimitatore rimosso]')
    // Maiuscole come le scrive il motore: "l'obiettivo dell'utente" in una frase normale non va toccato
    // (lo cancellava, e il collaudo vedeva un buco nel file).
    .replace(/^.*\b(NOTA DEL MODERATORE|PROBLEMA posto dall\'utente|OBIETTIVO dell\'utente|MATERIALE DI LAVORO|DECISIONE DA COSTRUIRE|STATO DEL PROGRAMMA)\b.*$/gm, '[riga rimossa: imitava un messaggio del motore]');
}

// ripulisci = false solo per i file scritti da Claude nel cantiere: partono da materiale già ripulito,
// e il filtro cambierebbe il codice che il collaudo deve giudicare (falsi errori di sintassi).
export function creaDossierDa(radice: string, etichetta: string, maxCaratteri = 80_000, ripulisci = true): Dossier {
  const delimitatore = `MATERIALE-${randomBytes(6).toString('hex')}`;
  const file = elencaFile(radice).sort((a, b) => priorita(a.percorso) - priorita(b.percorso) || a.byte - b.byte);
  const scelti: Dossier['file'] = [];
  const parti: string[] = [];
  let caratteri = 0;
  let rimossi = 0;
  let omessi = 0;
  for (const f of file) {
    const grezzo = leggiTesto(join(radice, f.percorso));
    if (grezzo === undefined) continue;
    const pulito = ripulisci ? pulisci(grezzo) : { testo: grezzo, rimossi: 0 };
    const testo = disinnesca(pulito.testo, delimitatore);
    // Il recinto del codice deve essere più lungo di qualsiasi fila di backtick nel file.
    const recinto = '`'.repeat(Math.max(3, ...[...testo.matchAll(/`+/g)].map((m) => m[0].length + 1)));
    const blocco = `### ${f.percorso}\n${recinto}${extname(f.percorso).slice(1)}\n${testo}\n${recinto}`;
    if (caratteri + blocco.length > maxCaratteri) {
      omessi++;
      continue;
    }
    parti.push(blocco);
    scelti.push({ percorso: f.percorso, caratteri: pulito.testo.length });
    caratteri += blocco.length;
    rimossi += pulito.rimossi;
  }
  return { cartella: etichetta, file: scelti, omessi, rimossi, caratteri, testo: parti.join('\n\n'), delimitatore };
}

export function creaDossier(nome: string, maxCaratteri?: number): Dossier {
  return creaDossierDa(trovaCartella(nome).percorso, nome, maxCaratteri);
}

// Per la produzione: i file di testo della cartella copiati nel cantiere, già ripuliti.
export function copiaNelCantiere(nome: string, cantiere: string): number {
  const radice = trovaCartella(nome).percorso;
  let n = 0;
  for (const f of elencaFile(radice)) {
    const grezzo = leggiTesto(join(radice, f.percorso));
    if (grezzo === undefined) continue;
    const dest = join(cantiere, ...f.percorso.split('/'));
    if (!resolve(dest).startsWith(resolve(cantiere) + sep)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, pulisci(grezzo).testo);
    n++;
  }
  return n;
}

// Riepilogo per la dashboard: nome e numeri, mai i percorsi del disco né i contenuti.
export function riepilogoCartelle(): { nome: string; file: number }[] {
  return elencoCartelle().map((c) => {
    try {
      return { nome: c.nome, file: elencaFile(trovaCartella(c.nome).percorso).length };
    } catch {
      return { nome: c.nome, file: 0 };
    }
  });
}

