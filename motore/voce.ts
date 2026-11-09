// Trascrizione dei messaggi vocali sul PC, con faster-whisper in locale (motore/voce/trascrivi.py).
// Il processo Python parte alla prima richiesta, tiene il modello in memoria e si spegne dopo un po' di
// inattività per liberare la RAM. L'audio sta su disco solo il tempo della trascrizione.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { percorsoUtente } from './ambiente.ts';
import { ambientePulito, chiudiAlbero } from './processo.ts';

const RADICE = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(RADICE, 'motore', 'voce', 'trascrivi.py');

export const AUDIO_MAX = 6 * 1024 * 1024; // ~6 minuti di opus, oltre è quasi certamente un errore
const SPEGNI_DOPO_MS = 10 * 60_000;
const AVVIO_MAX_MS = 180_000; // il primo avvio scarica il modello
const TRASCRIZIONE_MAX_MS = 120_000;

const ESTENSIONI: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

export function estensioneAudio(tipo: string): string | null {
  return ESTENSIONI[tipo.split(';')[0]!.trim().toLowerCase()] ?? null;
}

export interface Trascrizione {
  testo: string;
  secondi: number; // tempo impiegato
  audio: number; // durata dell'audio
}

export interface StatoVoce {
  disponibile: boolean;
  acceso: boolean;
  modello: string;
  perche?: string;
}

type Attesa = { risolvi: (t: Trascrizione) => void; rifiuta: (e: Error) => void; timer: NodeJS.Timeout };

export class Trascrittore {
  private figlio?: ChildProcessWithoutNullStreams;
  private pronto?: Promise<void>;
  private attese = new Map<string, Attesa>();
  private spegni?: NodeJS.Timeout;
  private coda: Promise<unknown> = Promise.resolve();
  private readonly python: string;
  private readonly cartella: string;
  readonly modello = process.env.AMBO_WHISPER_MODELLO || 'small';

  constructor(dati: string) {
    this.python = percorsoUtente(process.env.AMBO_VOCE_PYTHON, 'AMBO_VOCE_PYTHON') ?? join(dati, 'voce-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    this.cartella = join(dati, 'voce');
    // Vocali rimasti da una chiusura a metà trascrizione: non servono più a nessuno.
    rmSync(this.cartella, { recursive: true, force: true });
  }

  stato(): StatoVoce {
    const disponibile = existsSync(this.python) && existsSync(SCRIPT);
    return {
      disponibile,
      acceso: !!this.figlio,
      modello: this.modello,
      ...(disponibile ? {} : { perche: 'trascrizione sul PC non installata: lancia `npm run voce:installa` (serve Python 3.10 o più recente)' }),
    };
  }

  // Una trascrizione alla volta: su CPU due in parallelo andrebbero entrambe a metà velocità.
  trascrivi(audio: Buffer, tipo: string): Promise<Trascrizione> {
    const lavoro = this.coda.then(() => this.una(audio, tipo));
    this.coda = lavoro.catch(() => {});
    return lavoro;
  }

  private async una(audio: Buffer, tipo: string): Promise<Trascrizione> {
    const est = estensioneAudio(tipo);
    if (!est) throw new Error(`formato audio non supportato: ${tipo}`);
    if (audio.length < 200) throw new Error('registrazione vuota');
    if (audio.length > AUDIO_MAX) throw new Error('registrazione troppo lunga');
    if (!this.stato().disponibile) throw new Error(this.stato().perche);
    await this.avvia();
    // Mentre trascrive il processo non si spegne per inattività: il timer riparte alla fine.
    if (this.spegni) clearTimeout(this.spegni);

    mkdirSync(this.cartella, { recursive: true });
    const id = randomBytes(8).toString('hex');
    const file = join(this.cartella, `${id}.${est}`);
    writeFileSync(file, audio);
    try {
      return await new Promise<Trascrizione>((risolvi, rifiuta) => {
        const timer = setTimeout(() => {
          this.attese.delete(id);
          rifiuta(new Error('la trascrizione ci mette troppo'));
          this.chiudi(); // un processo bloccato non serve a nessuno
        }, TRASCRIZIONE_MAX_MS);
        this.attese.set(id, { risolvi, rifiuta, timer });
        this.figlio!.stdin.write(JSON.stringify({ id, file }) + '\n');
      });
    } finally {
      rmSync(file, { force: true });
      this.rimanda();
    }
  }

  private avvia(): Promise<void> {
    if (this.figlio && this.pronto) return this.pronto;
    // -I isola Python (niente variabili PYTHON*, niente cartella corrente nel path): per questo
    // l'UTF-8 va chiesto con -X utf8, altrimenti su Windows le lettere accentate escono in cp1252.
    const figlio = spawn(this.python, ['-X', 'utf8', '-I', SCRIPT], {
      cwd: RADICE,
      env: ambientePulito({ HF_HUB_DISABLE_TELEMETRY: '1' }),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.figlio = figlio;
    let stderr = '';
    figlio.stderr.setEncoding('utf8');
    figlio.stderr.on('data', (b: string) => { stderr = (stderr + b).slice(-2000); });

    this.pronto = new Promise<void>((risolvi, rifiuta) => {
      const timer = setTimeout(() => { rifiuta(new Error('il modello di trascrizione non si avvia')); this.chiudi(); }, AVVIO_MAX_MS);
      let resto = '';
      figlio.stdout.setEncoding('utf8');
      figlio.stdout.on('data', (blocco: string) => {
        resto += blocco;
        const righe = resto.split('\n');
        resto = righe.pop() ?? '';
        for (const riga of righe) {
          let r: { id: string | null; ok: boolean; testo?: string; errore?: string; secondi?: number; audio?: number; pronto?: string };
          try { r = JSON.parse(riga); } catch { continue; }
          if (r.id === null) {
            clearTimeout(timer);
            if (r.ok) risolvi(); else { rifiuta(new Error(r.errore ?? 'trascrittore non disponibile')); this.chiudi(); }
            continue;
          }
          const a = this.attese.get(r.id);
          if (!a) continue;
          this.attese.delete(r.id);
          clearTimeout(a.timer);
          if (r.ok) a.risolvi({ testo: r.testo ?? '', secondi: r.secondi ?? 0, audio: r.audio ?? 0 });
          else a.rifiuta(new Error(r.errore ?? 'trascrizione non riuscita'));
        }
      });
      figlio.on('error', (e) => { clearTimeout(timer); rifiuta(new Error(`il trascrittore non parte: ${e.message}`)); this.chiudi(); });
      figlio.on('close', () => {
        clearTimeout(timer);
        rifiuta(new Error(`il trascrittore si è chiuso${stderr ? `: ${stderr.trim().split('\n').pop()}` : ''}`));
        for (const a of this.attese.values()) { clearTimeout(a.timer); a.rifiuta(new Error('il trascrittore si è chiuso')); }
        this.attese.clear();
        if (this.figlio === figlio) { this.figlio = undefined; this.pronto = undefined; }
      });
    });
    this.pronto.catch(() => {});
    this.rimanda();
    return this.pronto;
  }

  private rimanda(): void {
    if (this.spegni) clearTimeout(this.spegni);
    this.spegni = setTimeout(() => this.chiudi(), SPEGNI_DOPO_MS);
    this.spegni.unref();
  }

  chiudi(): void {
    if (this.spegni) clearTimeout(this.spegni);
    const f = this.figlio;
    this.figlio = undefined;
    this.pronto = undefined;
    if (f) { f.stdin.end(); chiudiAlbero(f.pid); }
  }
}
