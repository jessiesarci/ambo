// Controllo prima di pubblicare: nei file del repository non ci devono essere dati personali, percorsi
// del disco, chiavi o segreti, né file che non devono uscire dal PC (dati, .env, credenziali), e
// l'email di chi fa i commit deve essere quella anonima di GitHub.
//   npm run controllo            (controlla i file che git pubblicherebbe)
//   npm run controllo -- <cartella o archivio estratto>   (controlla un pacchetto già fatto)
// Esce con codice 1 se trova qualcosa. Le parole personali in più (il tuo nome, i tuoi clienti, i
// tuoi progetti) si mettono in CONTRAPPUNTO_PAROLE_VIETATE="parola1,parola2", anche nel file .env.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { RADICE } from '../motore/ambiente.ts';

const base = process.argv[2] ?? RADICE;
const conGit = !process.argv[2];

const git = (args: string[]): string | undefined => {
  try {
    return execFileSync('git', args, { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return undefined;
  }
};

// I file da guardare: quelli di git se c'è un repository, altrimenti tutti (senza node_modules).
function elenco(): string[] {
  const daGit = conGit ? git(['ls-files', '--cached', '--others', '--exclude-standard']) : undefined;
  if (daGit !== undefined) return daGit.split('\n').filter(Boolean);
  const tutti: string[] = [];
  const giro = (d: string) => {
    for (const n of readdirSync(join(base, d))) {
      if (n === 'node_modules' || n === '.git') continue;
      const rel = d ? `${d}/${n}` : n;
      if (statSync(join(base, rel)).isDirectory()) giro(rel);
      else tutti.push(rel);
    }
  };
  giro('');
  return tutti;
}

// File che non devono mai finire in un pacchetto pubblico.
const FILE_VIETATI = [
  /^dati\//, /(^|\/)\.env$/, /(^|\/)\.env\.(?!esempio$)[^/]+$/, /(^|\/)profilo\.md$/, /(^|\/)auth\.json$/, /\.credentials\.json$/,
  /(^|\/)\.claude\.json$/, /(^|\/)id_(rsa|dsa|ecdsa|ed25519)/, /\.(pem|key|p12|pfx|jks|keystore)$/, /(^|\/)vapid\.json$/, /(^|\/)ponte\.json$/,
  /(^|\/)\.(npmrc|pypirc|netrc|git-credentials)$/, /\.log$/,
];

// Segreti e dati personali dentro i file di testo. Solo schemi precisi: un controllo che segnala
// tutto finisce ignorato.
const CONTENUTI: { nome: string; re: RegExp }[] = [
  { nome: 'chiave Anthropic', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { nome: 'chiave OpenAI', re: /\bsk-(proj-|svcacct-)?[A-Za-z0-9_-]{32,}/ },
  { nome: 'chiave Stripe', re: /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{10,}/ },
  { nome: 'token GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/ },
  { nome: 'chiave AWS', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { nome: 'chiave Google', re: /\bAIza[0-9A-Za-z_-]{35}\b|\bGOCSPX-[A-Za-z0-9_-]{20,}/ },
  { nome: 'token Slack', re: /\bxox[abprse]-[A-Za-z0-9-]{10,}/ },
  { nome: 'token di un servizio', re: /\b(sbp|npm|whsec|hf|gsk|glpat|dop_v1|shpat)_[A-Za-z0-9_-]{16,}/ },
  { nome: 'chiave Supabase', re: /\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}/ },
  { nome: 'progetto Supabase', re: /\b[a-z0-9]{20}\.supabase\.(co|com|in)\b|supabase\.com\/dashboard\/project\/[a-z0-9]{20}/ },
  { nome: 'id Vercel', re: /\b(team|prj)_[A-Za-z0-9]{20,}\b/ },
  { nome: 'token di un bot Telegram', re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/ },
  { nome: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { nome: 'chiave privata', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { nome: 'indirizzo con password', re: /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s"'`:/@]+:[^\s"'`@]{3,}@[^\s"'`]+/i },
  { nome: 'percorso Windows di un utente', re: /[A-Za-z]:[\\/]+Users[\\/]+(?!(?:<[^>]*>|\.\.\.|nome|tuonome|utente|you)(?:[\\/]|$))[A-Za-z0-9._-]+/i },
  { nome: 'percorso macOS o Linux di un utente', re: /\/(Users|home)\/(?!(?:<[^>]*>|nome|tuonome|utente|you|runner)(?:\/|$))[a-z0-9._-]{2,}\//i },
  { nome: 'indirizzo email', re: /[A-Za-z0-9._%+-]+@(?!example\.|esempio\.|users\.noreply\.github\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
];
const PAROLE = (process.env.CONTRAPPUNTO_PAROLE_VIETATE ?? '').split(',').map((p) => p.trim()).filter(Boolean);

// Le eccezioni note, con il motivo: il controllo stesso contiene gli schemi che cerca, e il filtro
// dei segreti delle cartelle autorizzate ha uno schema che assomiglia a un indirizzo con password.
const ECCEZIONI = new Set(['strumenti/controllo-sterile.ts']);
const ECCEZIONI_PER_CONTROLLO: Record<string, string[]> = { 'motore/cartelle.ts': ['indirizzo con password'] };

const problemi: string[] = [];
for (const rel of elenco()) {
  const r = rel.split(sep).join('/');
  if (FILE_VIETATI.some((re) => re.test(r))) problemi.push(`${r}: file che non deve essere pubblicato`);
  if (ECCEZIONI.has(r)) continue;
  let testo: string;
  try {
    const buf = readFileSync(join(base, r));
    // Tutti i file di testo, qualunque estensione abbiano; i binari (un byte zero) si saltano.
    if (buf.length > 5_000_000 || buf.includes(0)) continue;
    testo = buf.toString('utf8');
  } catch {
    continue;
  }
  testo.split('\n').forEach((riga, i) => {
    for (const c of CONTENUTI) if (c.re.test(riga) && !ECCEZIONI_PER_CONTROLLO[r]?.includes(c.nome)) problemi.push(`${r}:${i + 1}: ${c.nome}`);
    for (const p of PAROLE) if (riga.toLowerCase().includes(p.toLowerCase())) problemi.push(`${r}:${i + 1}: parola vietata «${p}»`);
  });
}

// L'email dei commit finisce nel repository pubblico: deve essere quella anonima di GitHub. Vuota non
// va bene, perché al primo commit git ne ricaverebbe una dal nome del PC. Nella CI (CI=true) non è
// configurata e non si fanno commit: lì si guardano solo i commit.
if (conGit) {
  const ammessa = (e: string) => /@users\.noreply\.github\.com$/i.test(e);
  const configurata = git(['config', 'user.email'])?.trim() ?? '';
  if (!configurata && !process.env.CI) problemi.push(`git: user.email non è impostato. Prima del primo commit metti l'indirizzo anonimo di GitHub: git config user.email <id>+<utente>@users.noreply.github.com`);
  else if (configurata && !ammessa(configurata)) problemi.push(`git: user.email è "${configurata}". Prima del primo commit metti l'indirizzo anonimo di GitHub: git config user.email <id>+<utente>@users.noreply.github.com`);
  const nelLog = new Set((git(['log', '--all', '--format=%ae%n%ce']) ?? '').split('\n').map((e) => e.trim()).filter(Boolean));
  for (const e of nelLog) if (!ammessa(e)) problemi.push(`git: un commit ha l'email "${e}"`);
}

if (problemi.length) {
  console.error(`Controllo NON superato (${problemi.length}):\n${problemi.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`Controllo superato: nessun dato personale, percorso o segreto in ${relative(process.cwd(), base) || '.'}.`);
