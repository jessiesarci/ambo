// Avvio di una CLI con prompt su stdin e lettura del suo output riga per riga.
import { spawn } from 'node:child_process';

export class Annullato extends Error {
  constructor() {
    super('turno annullato');
  }
}

export type TipoErrore = 'accesso' | 'consumo' | 'limite' | 'strumento' | 'formato' | 'tempo' | 'sessione' | 'altro';

// La CLI non trova la sessione da riprendere (cancellata dopo 30 giorni, o mai salvata).
export const SESSIONE_PERSA = /no (conversation|session|saved session|rollout|thread)[^\n]{0,40}(found|exists)|(session|thread|conversation)[^\n]{0,40}not found/i;

// recuperabile: il dibattito si può riprendere dallo stesso turno (limite che si azzera, rete...).
export class ErroreAgente extends Error {
  tipo: TipoErrore;
  recuperabile: boolean;
  constructor(messaggio: string, tipo: TipoErrore, recuperabile: boolean) {
    super(messaggio);
    this.tipo = tipo;
    this.recuperabile = recuperabile;
  }
}

// Un processo ucciso lascia vivi i figli. Su Windows taskkill /T chiude tutto l'albero; su macOS e
// Linux la CLI parte in un gruppo suo (detached) e si chiude il gruppo: il lanciatore npm di Codex
// non inoltra SIGKILL al binario vero, che resterebbe vivo con le pipe aperte.
export function chiudiAlbero(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try { process.kill(pid, 'SIGKILL'); } catch { /* già uscito */ }
  }
}

// Variabili da non passare mai agli agenti: chiavi API (porterebbero alla fatturazione a consumo),
// token OAuth passati per ambiente, le variabili della sessione Claude Code da cui il motore può
// essere lanciato, e in generale tutto ciò che dal nome sembra una chiave, un token o una password
// (GitHub, AWS, Hugging Face...): agli agenti non serve, e non deve finire in una risposta.
const DA_TOGLIERE = /^(ANTHROPIC_|CLAUDE|OPENAI_|CODEX_API_KEY$|CODEX_ACCESS_TOKEN$|AZURE_OPENAI|AWS_|GH_|GITHUB_|HF_|HUGGING|GEMINI_|GOOGLE_|GROQ_|MISTRAL_|COHERE_|XAI_|DEEPSEEK_|OPENROUTER_|SUPABASE_|VERCEL_|NETLIFY_|STRIPE_|SSH_AUTH_SOCK$)|TOKEN|SECRET|PASSWORD|PASSWD|PASSPHRASE|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIAL|_AUTH$/i;
// Configurazione, non credenziali: senza, Claude Code su Windows non trova git-bash o la sua cartella.
const DA_TENERE = new Set(['CLAUDE_CODE_GIT_BASH_PATH', 'CLAUDE_CONFIG_DIR']);

export function ambientePulito(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!DA_TOGLIERE.test(k) || DA_TENERE.has(k.toUpperCase())) env[k] = v;
  return { ...env, NO_COLOR: '1', ...extra };
}

export interface Esecuzione {
  codice: number | null;
  stderr: string;
  fermato?: string;
}

export function esegui(op: {
  comando: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  input: string;
  timeoutMs: number;
  signal?: AbortSignal;
  suRiga: (riga: string, ferma: (motivo: string) => void) => void;
}): Promise<Esecuzione> {
  if (op.signal?.aborted) return Promise.reject(new Annullato());

  return new Promise((resolve, reject) => {
    const figlio = spawn(op.comando, op.args, {
      cwd: op.cwd,
      env: op.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    });

    let fermato: string | undefined;
    let annullato = false;
    let resto = '';
    let stderr = '';

    const ferma = (motivo: string) => {
      fermato ??= motivo;
      chiudiAlbero(figlio.pid);
    };
    const annulla = () => {
      annullato = true;
      chiudiAlbero(figlio.pid);
    };
    op.signal?.addEventListener('abort', annulla, { once: true });
    const timer = setTimeout(() => ferma(`nessuna risposta entro ${Math.round(op.timeoutMs / 1000)} s`), op.timeoutMs);

    const leggi = (riga: string) => {
      if (fermato || annullato) return;
      try { op.suRiga(riga, ferma); } catch (e) { ferma(`errore nel leggere l'output: ${(e as Error).message}`); }
    };

    figlio.stdout.setEncoding('utf8');
    figlio.stdout.on('data', (blocco: string) => {
      resto += blocco;
      const righe = resto.split('\n');
      resto = righe.pop() ?? '';
      for (const r of righe) leggi(r);
    });
    figlio.stderr.setEncoding('utf8');
    figlio.stderr.on('data', (blocco: string) => { stderr = (stderr + blocco).slice(-4000); });

    figlio.on('error', (e) => {
      clearTimeout(timer);
      op.signal?.removeEventListener('abort', annulla);
      reject(new ErroreAgente(`la CLI non si avvia (${op.comando}): ${e.message}`, 'accesso', false));
    });
    figlio.on('close', (codice) => {
      clearTimeout(timer);
      op.signal?.removeEventListener('abort', annulla);
      if (resto) leggi(resto);
      if (annullato) return reject(new Annullato());
      resolve({ codice, stderr, fermato });
    });

    figlio.stdin.on('error', () => {}); // se la CLI muore prima di leggere, l'errore arriva da 'close'
    figlio.stdin.end(op.input, 'utf8');
  });
}

export function codaStderr(stderr: string, righe = 5): string {
  return stderr.trim().split('\n').slice(-righe).join('\n');
}
