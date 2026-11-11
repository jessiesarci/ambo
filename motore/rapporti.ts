// I rapporti d'errore: quando nel programma si rompe qualcosa, chi lo usa può mandare a chi sviluppa
// Ambo un rapporto tecnico, solo se lo vuole. Di serie il programma chiede ogni volta e mostra cosa
// manda; con "sempre" lo manda da solo, con "mai" non tiene nemmeno il rapporto.
// Il rapporto ha solo campi fissi: versione, sistema, dove e che tipo di errore, la prima riga del
// messaggio ripulita e i punti del codice del programma. Gli errori delle CLI hanno un messaggio fisso
// per tipo, perché il loro testo può contenere pezzi di risposte. Gli errori che non sono difetti
// (login mancante, crediti a consumo, limiti di quota, sessione scaduta, arresti di sicurezza, uno
// stop) non diventano rapporti.
// AMBO_RAPPORTI_URL=0 spegne tutto; un altro indirizzo https li manda lì (per chi pubblica una sua
// versione del programma). È l'unica chiamata del programma a un servizio che non è una CLI.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir, release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { RADICE } from './ambiente.ts';
import { pulisci } from './cartelle.ts';
import { Annullato, ErroreAgente, type TipoErrore } from './processo.ts';

// La funzione che li riceve, su Supabase (server a Zurigo). Non salva l'indirizzo IP.
export const URL_RAPPORTI = 'https://armntvqchbkdbxwawdsv.supabase.co/functions/v1/ambo-rapporti';

export type Scelta = 'chiedi' | 'sempre' | 'mai';
export type Dove = 'chat' | 'riunione' | 'produzione' | 'server' | 'dashboard';
export const DOVE: readonly Dove[] = ['chat', 'riunione', 'produzione', 'server', 'dashboard'];

// Quello che parte, e solo questo: è anche quello che la dashboard mostra prima di chiedere.
export interface Contenuto {
  versione: string;
  sistema: string; // es. "win32 x64 10.0"
  node: string;
  dove: Dove;
  tipo: string; // il nome dell'errore, o "agente:<tipo>" per gli errori delle CLI
  messaggio: string; // la prima riga, ripulita, al massimo 300 caratteri
  stack: string[]; // solo i punti del codice del programma (funzione e file:riga:colonna), al massimo 12
  impronta: string; // la stessa per lo stesso difetto: serve a raggrupparli
}
// In più, solo sul PC: un id per sceglierlo nella dashboard e l'ora in cui è nato.
export interface Rapporto extends Contenuto { id: string; ora: string }

export interface VistaRapporti { attivi: boolean; scelta: Scelta; inAttesa: Rapporto[] }
export type EsitoInvio = 'mandato' | 'gia' | 'limite' | 'errore';
interface StatoRapporti {
  scelta: Scelta;
  inAttesa: Rapporto[];
  // I limiti degli invii restano anche dopo un riavvio.
  mandati: Record<string, number>; // impronta → ora dell'ultimo invio
  oggi: { giorno: string; quanti: number };
}

// Le condizioni normali o di sicurezza, che non sono difetti del codice: login, crediti, limiti di
// quota, sessione scaduta, arresti per uno strumento non ammesso o una scrittura fuori dal cantiere
// (e la cartella dei dati in AppData).
const NON_DIFETTI = new Set<TipoErrore>(['accesso', 'consumo', 'limite', 'sessione', 'strumento']);
export function eDifetto(e: unknown): boolean {
  if (e instanceof Annullato) return false;
  if (e instanceof ErroreAgente) return !NON_DIFETTI.has(e.tipo);
  return e instanceof Error || typeof e === 'string';
}

// Il testo degli errori delle CLI non si manda mai: può contenere pezzi di risposte o di stderr.
const MESSAGGI_AGENTE: Partial<Record<TipoErrore, string>> = {
  formato: 'una CLI ha risposto in un formato che il programma non capisce',
  tempo: 'una CLI non ha finito nel tempo massimo',
  altro: 'una CLI si è fermata con un errore',
};

const VERSIONE = (() => {
  try {
    return String(JSON.parse(readFileSync(join(RADICE, 'package.json'), 'utf8')).version);
  } catch {
    return '0.0.0';
  }
})();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Il messaggio senza niente di chi usa il programma:
// - le cartelle note diventano segnaposto (del programma resta il percorso relativo);
// - ogni testo tra virgolette, di qualsiasi tipo e lunghezza, sparisce (può venire dalla chat, da un
//   file o da una risposta); resta solo il nome della proprietà negli errori come "(reading 'x')";
// - da dove comincia un percorso si toglie tutto fino alla parentesi o alla fine (i nomi delle
//   cartelle possono avere spazi), e ogni parola rimasta con una barra;
// - email e valori che sembrano segreti.
export function pulisciTesto(t: string, max = 300, dati?: string): string {
  let s = t.split('\n')[0] ?? '';
  const note: [string, string][] = [[RADICE, '<programma>'], [homedir(), '<home>'], [tmpdir(), '<temp>']];
  if (dati) note.unshift([dati, '<dati>']);
  for (const [p, segnaposto] of note.filter(([p]) => p.length > 3).sort((a, b) => b[0].length - a[0].length)) {
    for (const forma of new Set([p, p.replace(/\\/g, '/')])) s = s.replace(new RegExp(escapeRe(forma), 'gi'), segnaposto);
  }
  const proprieta: string[] = [];
  s = s.replace(/\((reading|setting) '([A-Za-z_$][\w$]{0,40})'\)/g, (_m, verbo: string, nome: string) => `(${verbo} \u0001${proprieta.push(nome) - 1}\u0001)`);
  s = s.replace(/(?<!\p{L})'[^'\n]*'|"[^"\n]*"|`[^`\n]*`|“[^”\n]*”|‘[^’\n]*’|«[^»\n]*»/gu, '…');
  s = s.replace(/(?:<home>|<dati>|<temp>|[A-Za-z]:[\\/]|\\\\|\/\/|\.{1,2}[\\/]|file:\/\/)[^)\]\n]*/g, '<percorso>');
  s = s.split(/(\s+)/).map((p) => (/[\\/]/.test(p) && !p.startsWith('<programma>') && !p.startsWith('<percorso>') ? '<percorso>' : p)).join('');
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>');
  s = pulisci(s).testo;
  s = s.replace(/\u0001(\d+)\u0001/g, (_m, i: string) => `'${proprieta[Number(i)]}'`);
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Dallo stack solo le righe dei punti di codice (non il messaggio, che può avere più righe), e solo
// quelle che stanno nel programma: funzione e file:riga:colonna, con il percorso relativo.
export function puntiDelCodice(stack: string | undefined, radice = RADICE): string[] {
  const base = radice.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  const punti: string[] = [];
  for (const riga of (stack ?? '').split('\n')) {
    const r = riga.replace(/\\/g, '/');
    const nodo = /^\s+at\s/.test(r);
    if (!nodo && !/^[\w$.<>]*@/.test(r)) continue;
    const posto = /\(?([^()\s@]+):(\d+):(\d+)\)?\s*$/.exec(r);
    if (!posto) continue;
    const file = posto[1]!.replace(/^file:\/\/\/?/i, '');
    const rel = file.toLowerCase().startsWith(`${base}/`) ? file.slice(base.length + 1) : '';
    const nome = /^(?:motore|web\/src|strumenti)\/[\w./-]+\.(?:ts|tsx|js|mjs)$/.test(rel) ? rel
      : /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/(assets\/index-[\w-]+\.js)$/i.exec(file)?.[1];
    if (!nome) continue;
    const funzione = nodo ? /^\s+at\s+(?:async\s+)?([\w$.<>]+)\s+\(/.exec(r)?.[1] : /^([\w$.<>]+)@/.exec(r)?.[1];
    punti.push(`${funzione ? `${funzione} ` : ''}${nome}:${posto[2]}:${posto[3]}`);
    if (punti.length >= 12) break;
  }
  return punti;
}

export function componi(e: unknown, dove: Dove, dati?: string): Rapporto {
  const err = e instanceof Error ? e : new Error(String(e));
  const agente = e instanceof ErroreAgente ? e : undefined;
  const tipo = agente ? `agente:${agente.tipo}` : (err.name || 'Error').replace(/[^\w.-]/g, '').slice(0, 40) || 'Error';
  const messaggio = agente ? MESSAGGI_AGENTE[agente.tipo] ?? 'una CLI si è fermata con un errore' : pulisciTesto(err.message, 300, dati);
  const stack = puntiDelCodice(err.stack);
  // Senza stack si raggruppa sul messaggio senza numeri (misure, tempi, id cambiano da un caso all'altro).
  const base = stack.length ? stack.map((x) => x.replace(/:\d+$/, '')) : [messaggio.replace(/\d+/g, '#')];
  return {
    id: randomBytes(8).toString('hex'),
    ora: new Date().toISOString(),
    versione: VERSIONE,
    sistema: `${process.platform} ${process.arch} ${release().split('.').slice(0, 2).join('.')}`,
    node: process.versions.node,
    dove,
    tipo,
    messaggio,
    stack,
    impronta: createHash('sha256').update([dove, tipo, ...base].join('|')).digest('hex').slice(0, 12),
  };
}

// Un errore della pagina, come lo manda la dashboard: si ripulisce qui, nel motore, come gli altri.
// Senza almeno un punto del codice del programma non è un errore di Ambo (estensioni, script esterni).
export function componiDaPagina(corpo: unknown, dati?: string): Rapporto | undefined {
  const c = (corpo ?? {}) as { tipo?: unknown; messaggio?: unknown; stack?: unknown };
  if (typeof c.messaggio !== 'string' || !c.messaggio.trim() || typeof c.stack !== 'string') return undefined;
  const err = new Error(c.messaggio.slice(0, 2000));
  err.name = typeof c.tipo === 'string' ? c.tipo.slice(0, 40) : 'Error';
  err.stack = `${err.name}: x\n${c.stack.slice(0, 8000)}`;
  const r = componi(err, 'dashboard', dati);
  return r.stack.length ? r : undefined;
}

// Solo i campi che partono, ricostruiti uno per uno: niente di più, anche se il file è stato toccato.
export function contenuto(r: Rapporto): Contenuto {
  return { versione: r.versione, sistema: r.sistema, node: r.node, dove: r.dove, tipo: r.tipo, messaggio: r.messaggio, stack: [...r.stack], impronta: r.impronta };
}

// Un rapporto letto da rapporti.json: se un campo non è come deve essere, non si tiene.
function valido(x: unknown): Rapporto | undefined {
  const r = (x ?? {}) as Record<string, unknown>;
  const testo = (v: unknown, max: number, re?: RegExp) => typeof v === 'string' && v.length <= max && (!re || re.test(v));
  if (!testo(r.id, 16, /^[0-9a-f]{16}$/) || !testo(r.ora, 40) || !testo(r.versione, 20, /^\d+\.\d+\.\d+$/) || !testo(r.sistema, 60)
    || !testo(r.node, 20) || !DOVE.includes(r.dove as Dove) || !testo(r.tipo, 60, /^[\w.:-]+$/) || !testo(r.messaggio, 300)
    || !testo(r.impronta, 12, /^[0-9a-f]{12}$/) || !Array.isArray(r.stack) || r.stack.length > 12 || !r.stack.every((s) => testo(s, 200))) return undefined;
  return { id: r.id as string, ora: r.ora as string, ...contenuto(r as unknown as Rapporto) };
}

const indirizzo = (): string | null => {
  const v = (process.env.AMBO_RAPPORTI_URL ?? '').trim();
  if (v === '0') return null;
  if (!v) return URL_RAPPORTI;
  // Solo https (o un indirizzo locale, per le prove): il rapporto non viaggia in chiaro.
  return /^https:\/\//i.test(v) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(v) ? v : null;
};

export type Invia = (url: string, c: Contenuto) => Promise<void>;
const inviaDavvero: Invia = async (url, c) => {
  const risposta = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c), signal: AbortSignal.timeout(8000) });
  if (!risposta.ok) throw new Error(`il servizio dei rapporti ha risposto ${risposta.status}`);
};

const MAX_IN_ATTESA = 10;
const MAX_AL_GIORNO = 20;
const UN_ORA = 3_600_000;

export class Rapporti {
  private readonly dati: string;
  private readonly invia: Invia;
  private readonly file: string;
  private readonly url: string | null;
  // Lo stesso difetto non si manda più di una volta all'ora, e al massimo 20 rapporti al giorno:
  // un errore che si ripete in un giro non deve diventare una raffica.
  private stato: StatoRapporti = { scelta: 'chiedi', inAttesa: [], mandati: {}, oggi: { giorno: '', quanti: 0 } };

  constructor(dati: string, invia: Invia = inviaDavvero, url: string | null = indirizzo()) {
    this.dati = dati;
    this.invia = invia;
    this.file = join(dati, 'rapporti.json');
    this.url = url;
    try {
      if (existsSync(this.file)) {
        const letto = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<StatoRapporti>;
        if (letto.scelta === 'chiedi' || letto.scelta === 'sempre' || letto.scelta === 'mai') this.stato.scelta = letto.scelta;
        if (Array.isArray(letto.inAttesa)) this.stato.inAttesa = letto.inAttesa.map(valido).filter((x): x is Rapporto => !!x).slice(-MAX_IN_ATTESA);
        if (letto.mandati && typeof letto.mandati === 'object') {
          for (const [k, v] of Object.entries(letto.mandati)) if (/^[0-9a-f]{12}$/.test(k) && typeof v === 'number') this.stato.mandati[k] = v;
        }
        if (typeof letto.oggi?.giorno === 'string' && typeof letto.oggi.quanti === 'number') this.stato.oggi = { giorno: letto.oggi.giorno, quanti: letto.oggi.quanti };
      }
    } catch {
      // un file rovinato: si riparte da "chiedi"
    }
  }

  vista(): VistaRapporti {
    return { attivi: !!this.url, scelta: this.stato.scelta, inAttesa: this.url ? this.stato.inAttesa : [] };
  }

  scegli(scelta: Scelta): void {
    this.stato.scelta = scelta;
    if (scelta === 'mai') this.stato.inAttesa = [];
    this.salva();
  }

  // Si chiama dove il programma registra un errore. Non lancia mai: un rapporto non deve rompere niente.
  segnala(e: unknown, dove: Dove): void {
    try {
      if (!this.url || this.stato.scelta === 'mai' || !eDifetto(e)) return;
      this.accoda(componi(e, dove, this.dati));
    } catch (x) {
      console.error('Rapporto d\'errore non preparato:', (x as Error).message);
    }
  }

  segnalaDaPagina(corpo: unknown): void {
    try {
      if (!this.url || this.stato.scelta === 'mai') return;
      const r = componiDaPagina(corpo, this.dati);
      if (r) this.accoda(r);
    } catch (x) {
      console.error('Rapporto d\'errore non preparato:', (x as Error).message);
    }
  }

  // Manda un rapporto in attesa, dopo il sì dell'utente; con "sempre" cambia anche la scelta.
  // Se non parte per un problema di rete resta in attesa; se lo stesso errore è già partito nell'ultima
  // ora non serve rimandarlo; oltre i 20 del giorno aspetta domani.
  async manda(id: string, sempre = false): Promise<EsitoInvio | undefined> {
    const r = this.stato.inAttesa.find((x) => x.id === id);
    if (!r || !this.url) return undefined;
    if (sempre) this.stato.scelta = 'sempre';
    const esito = await this.spedisci(r);
    if (esito === 'mandato' || esito === 'gia') this.stato.inAttesa = this.stato.inAttesa.filter((x) => x.id !== id);
    this.salva();
    return esito;
  }

  scarta(id: string): boolean {
    const prima = this.stato.inAttesa.length;
    this.stato.inAttesa = this.stato.inAttesa.filter((x) => x.id !== id);
    this.salva();
    return this.stato.inAttesa.length < prima;
  }

  private accoda(r: Rapporto): void {
    if (this.stato.scelta === 'sempre') {
      void this.spedisci(r).then(() => this.salva());
      return;
    }
    if (this.stato.inAttesa.some((x) => x.impronta === r.impronta)) return;
    this.stato.inAttesa = [...this.stato.inAttesa, r].slice(-MAX_IN_ATTESA);
    this.salva();
  }

  private async spedisci(r: Rapporto): Promise<EsitoInvio> {
    const ora = Date.now();
    const giorno = new Date(ora).toISOString().slice(0, 10);
    if (this.stato.oggi.giorno !== giorno) this.stato.oggi = { giorno, quanti: 0 };
    if (ora - (this.stato.mandati[r.impronta] ?? 0) < UN_ORA) return 'gia';
    if (this.stato.oggi.quanti >= MAX_AL_GIORNO) return 'limite';
    this.stato.oggi.quanti++;
    this.stato.mandati[r.impronta] = ora;
    try {
      await this.invia(this.url!, contenuto(r));
      return 'mandato';
    } catch (e) {
      // Niente rapporto sul rapporto: si dice nel log e si libera il posto per riprovare.
      this.stato.oggi.quanti--;
      delete this.stato.mandati[r.impronta];
      console.error('Rapporto d\'errore non mandato:', (e as Error).message);
      return 'errore';
    }
  }

  private salva(): void {
    const ora = Date.now();
    for (const [k, v] of Object.entries(this.stato.mandati)) if (ora - v >= UN_ORA) delete this.stato.mandati[k];
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.stato, null, 2));
      renameSync(tmp, this.file);
    } catch (e) {
      console.error('Scelta dei rapporti d\'errore non salvata:', (e as Error).message);
    }
  }
}
