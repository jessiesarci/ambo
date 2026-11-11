// Chiamate al motore, sullo stesso server locale (http://127.0.0.1:4317): niente parte online.
import type { Allegato } from '../../motore/allegati.ts';
import type { Agente, ConfigInput, Corrente, Destinatari, Dibattito, Esito, Evento, MembroSquadra, Procedura, StatoDibattito } from '../../motore/tipi.ts';

export interface Info {
  claude: { modelli: string[]; predefinito: string; ragionamento: string[] };
  codex: { modelli: string[]; predefinito: string | null; ragionamento: string[] };
  attivi: string[];
  squadra?: MembroSquadra[]; // il catalogo degli assistenti con XP e livello
  procedure?: Procedura[];
  cartelle?: { nome: string; file: number }[];
  voce?: { disponibile: boolean; acceso: boolean; modello: string; perche?: string };
  skill?: Record<Agente, { nome: string; descrizione: string; fonte: string }[]>; // a disposizione sul PC, in sola lettura
  // Cosa ha configurato chi usa il programma (mai i percorsi).
  impostazioni?: { nome: string | null; profilo: boolean; note: boolean; ambiente: boolean; consentiApi: boolean };
}

// Una chat nuova: il primo messaggio (facoltativo) e le stesse opzioni di una partita.
export type NuovaChat = Pick<ConfigInput, 'chi' | 'memoria' | 'ricercaWeb' | 'claude' | 'codex' | 'cartella'> & { testo?: string; voce?: boolean };
export interface OpzioniMessaggio {
  a?: Destinatari;
  voce?: boolean;
}

export interface CartellaLocale {
  nome: string;
  percorso: string;
  aggiunta: string;
  file: number;
}

export interface Riassunto {
  id: string;
  creato: string;
  aggiornato: string;
  stato: StatoDibattito;
  esito: Esito | null;
  approvata: boolean | null;
  domanda: string;
  turni: number; // gli interventi della riunione
  incarichi?: number;
  claude: string;
  codex: string | null;
  inCorso: boolean;
  occupato?: boolean; // partita, produzione o CLI al lavoro: la stessa regola del motore
  produzione?: string | null;
  collaudo?: boolean | null; // l'ultimo collaudo della produzione: superato o respinto
  daChat?: string;
  tipo?: 'chat' | 'partita';
  messaggi?: number;
  ultimo?: { autore: Agente | 'utente'; testo: string; ora: string } | null;
}

export interface Accessi {
  claude: { ok: boolean; dettaglio: string };
  codex: { ok: boolean; dettaglio: string };
}

export interface Istantanea {
  dibattito: Dibattito;
  inCorso: boolean;
  altrove?: boolean;
  corrente?: Corrente | null;
}

export interface Ascolto {
  istantanea: (i: Istantanea) => void;
  evento: (e: Evento) => void;
  connessione: (connesso: boolean) => void;
  errore: (messaggio: string) => void;
}

class ErroreChiamata extends Error {
  codice: number;
  constructor(codice: number, messaggio: string) {
    super(messaggio);
    this.codice = codice;
  }
}

async function chiama<T>(percorso: string, corpo?: unknown): Promise<T> {
  const r = await fetch(`/api/${percorso}`, corpo === undefined
    ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const dati = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroreChiamata(r.status, (dati as { errore?: string }).errore ?? `errore ${r.status}`);
  return dati as T;
}

function scarica(nome: string, testo: string): void {
  const url = URL.createObjectURL(new Blob([testo], { type: 'text/markdown;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const locale = {
  info: () => chiama<Info>('info'),
  accessi: () => chiama<Accessi>('accessi'),
  elenco: () => chiama<Riassunto[]>('dibattiti'),
  dibattito: (id: string) => chiama<Istantanea>(`dibattiti/${id}`),
  crea: (config: ConfigInput) => chiama<{ id: string }>('dibattiti', config),
  pausa: (id: string) => chiama<{ ok: true }>(`dibattiti/${id}/pausa`, {}),
  riprendi: (id: string) => chiama<{ ok: true }>(`dibattiti/${id}/riprendi`, {}),
  concludi: (id: string) => chiama<{ ok: true }>(`dibattiti/${id}/concludi`, {}),
  nota: (id: string, testo: string) => chiama<{ ok: true }>(`dibattiti/${id}/nota`, { testo }),
  // Apre la cartella del cantiere in Esplora risorse (o nel Finder).
  apriCantiere: (id: string) => chiama<{ ok: true }>(`dibattiti/${id}/apri-cantiere`, {}),
  // Gli allegati di una chat (e la copia di una partita).
  allegati: (id: string) => chiama<Allegato[]>(`dibattiti/${id}/allegati`),
  urlAllegato: (id: string, aid: string) => `/api/dibattiti/${id}/allegati/${aid}`,
  // Con XMLHttpRequest per l'avanzamento: fetch non lo dà durante l'invio.
  caricaAllegato: (id: string, file: File, avanzamento?: (frazione: number) => void) => new Promise<Allegato>((ok, no) => {
    const x = new XMLHttpRequest();
    x.open('POST', `/api/dibattiti/${id}/allegati`);
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.setRequestHeader('x-nome', encodeURIComponent(file.name));
    x.upload.onprogress = (e) => { if (e.lengthComputable) avanzamento?.(e.loaded / e.total); };
    x.onload = () => {
      let dati: { errore?: string } = {};
      try { dati = JSON.parse(x.responseText); } catch { /* risposta vuota */ }
      if (x.status >= 200 && x.status < 300) ok(dati as Allegato);
      else no(new ErroreChiamata(x.status, dati.errore ?? `errore ${x.status}`));
    };
    x.onerror = () => no(new Error('Caricamento interrotto. Riprova.'));
    x.send(file);
  }),
  descriviAllegato: (id: string, aid: string, testo: string) => chiama<Allegato>(`dibattiti/${id}/allegati/${aid}/descrizione`, { testo }),
  async togliAllegato(id: string, aid: string): Promise<void> {
    const r = await fetch(`/api/dibattiti/${id}/allegati/${aid}`, { method: 'DELETE' });
    if (!r.ok) throw new ErroreChiamata(r.status, ((await r.json().catch(() => ({}))) as { errore?: string }).errore ?? `errore ${r.status}`);
  },
  produci: (id: string, base: string | null) => chiama<{ ok: true }>(`dibattiti/${id}/produzione`, { base }),
  creaChat: (dati: NuovaChat) => chiama<{ id: string }>('chat', dati),
  scrivi: (id: string, testo: string, op: OpzioniMessaggio = {}) => chiama<{ ok: true; indice: number }>(`dibattiti/${id}/scrivi`, { testo, ...op }),
  salvaNota: (id: string) => chiama<{ ok: true; nota: string }>(`dibattiti/${id}/salva`, {}),
  avvia: (id: string, indice: number) => chiama<{ ok: true; id: string; gia: boolean }>(`dibattiti/${id}/avvia`, { indice }),
  async trascrivi(audio: Blob): Promise<{ testo: string }> {
    const r = await fetch('/api/voce', { method: 'POST', headers: { 'Content-Type': audio.type || 'audio/webm' }, body: audio });
    const dati = await r.json().catch(() => ({}));
    if (!r.ok) throw new ErroreChiamata(r.status, (dati as { errore?: string }).errore ?? `errore ${r.status}`);
    return dati as { testo: string };
  },
  async scaricaMarkdown(id: string): Promise<void> {
    const r = await fetch(`/api/dibattiti/${id}/markdown`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`documento non disponibile (${r.status})`);
    scarica(`dibattito-${id}.md`, await r.text());
  },
  segui(id: string, a: Ascolto): () => void {
    // EventSource si riconnette da solo; a ogni riconnessione il server rimanda l'istantanea.
    let fonte: EventSource | undefined;
    let riprova: ReturnType<typeof setTimeout> | undefined;
    let tentativo = 0;
    let fermo = false;
    const apri = () => {
      fonte = new EventSource(`/api/dibattiti/${id}/eventi`);
      fonte.onopen = () => { tentativo = 0; a.connessione(true); };
      fonte.onerror = () => {
        a.connessione(false);
        // Su una risposta non 200 (partita cancellata, server spento) EventSource si arrende per
        // sempre: si controlla perché e, se la partita esiste, si riprova con attesa crescente.
        if (fonte?.readyState !== EventSource.CLOSED) return;
        const ancora = () => { if (!fermo) riprova = setTimeout(apri, Math.min(1000 * 2 ** tentativo++, 15_000)); };
        locale.dibattito(id).then(ancora).catch((e: Error) => {
          if (/non trovato|non valido/.test(e.message)) a.errore(`Partita non trovata: ${e.message}`);
          else ancora();
        });
      };
      fonte.addEventListener('istantanea', (m) => a.istantanea(JSON.parse((m as MessageEvent).data) as Istantanea));
      fonte.addEventListener('evento', (m) => a.evento(JSON.parse((m as MessageEvent).data) as Evento));
    };
    apri();
    return () => {
      fermo = true;
      fonte?.close();
      if (riprova) clearTimeout(riprova);
    };
  },
  cartelle: () => chiama<CartellaLocale[]>('cartelle'),
  aggiungiCartella: (nome: string, percorso: string) => chiama<{ ok: true }>('cartelle/aggiungi', { nome, percorso }),
  rimuoviCartella: (nome: string) => chiama<{ ok: true }>('cartelle/rimuovi', { nome }),
};

export const api = locale;
