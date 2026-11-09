// Dallo stato salvato del dibattito e dal flusso di eventi a quello che la scena e l'HUD mostrano.
// L'istantanea è la verità; gli eventi portano solo ciò che è momentaneo (chi sta pensando,
// il testo che arriva, gli effetti da animare).
import {
  altro, type Agente, type Corrente, type Dibattito, type Esito, type Evento, type Fase, type MessaggioChat, type Ruolo, type StatoDichiarato, type Strumento,
} from '../../motore/tipi.ts';

export type FaseVista = 'attesa' | 'ragionamento' | 'risposta' | 'strumento' | 'errore' | 'conclusione';

// Cosa sta facendo adesso un agente con uno strumento (cerca nelle note, sul web...).
export interface AzioneVista {
  testo: string;
  strumento?: Strumento;
  da: number;
}

// Il diario dal vivo: le cose fatte dagli agenti, in ordine, per chi vuole vedere come lavorano.
export interface VoceDiario {
  id: number;
  agente: Agente;
  testo: string;
  strumento?: Strumento;
  ora: number;
}

// Un assistente della squadra al lavoro adesso: arriva dagli eventi (incarico,
// attivita_assistente) e, in riunione, dall'istantanea (Corrente.assistente). Intanto Claude e
// Codex restano fermi: parlante resta vuoto, così la scena non li fa parlare al suo posto.
export interface AssistenteVivo {
  id: string;
  dove: 'incarico' | 'produzione';
  compito?: string;
  turno?: number; // l'intervento che ha chiesto l'incarico
  fase: Fase;
  azione?: AzioneVista;
  testo: string; // il rapporto che arriva, se la CLI lo manda a pezzi
  da: number;
}

export type Effetto =
  | { id: number; tipo: 'colpo'; da: Agente; stato: StatoDichiarato }
  | { id: number; tipo: 'rapporto'; assistente: string; ok: boolean }
  | { id: number; tipo: 'cambio'; agente: Agente; testo: string }
  | { id: number; tipo: 'nota'; testo: string }
  | { id: number; tipo: 'esito'; esito: Esito; approvata: boolean | null }
  | { id: number; tipo: 'messaggio'; agente: Agente; passa: boolean };

export interface Vista {
  dibattito?: Dibattito;
  inCorso: boolean;
  altrove: boolean; // lo sta eseguendo la CLI: si guarda soltanto
  connesso: boolean;
  fase: Record<Agente, FaseVista>;
  parlante?: Agente;
  ruolo?: Ruolo;
  indice?: number;
  inizioTurno?: number;
  testoParziale: string;
  avvisi: { id: number; testo: string; grave: boolean }[];
  effetti: Effetto[];
  azione: Partial<Record<Agente, AzioneVista>>;
  diario: VoceDiario[];
  assistente?: AssistenteVivo;
}

export type Azione =
  | { tipo: 'istantanea'; dibattito: Dibattito; inCorso: boolean; altrove?: boolean; corrente?: Corrente | null }
  | { tipo: 'evento'; evento: Evento; ora?: number }
  | { tipo: 'connessione'; connesso: boolean }
  | { tipo: 'consumato'; id: number }
  | { tipo: 'chiudi_avviso'; id: number }
  | { tipo: 'azzera' };

export const vistaVuota = (): Vista => ({
  inCorso: false,
  altrove: false,
  connesso: false,
  fase: { claude: 'attesa', codex: 'attesa' },
  testoParziale: '',
  avvisi: [],
  effetti: [],
  azione: {},
  diario: [],
});

const DIARIO_MAX = 40;
const nelDiario = (v: Vista, voce: Omit<VoceDiario, 'id'>): VoceDiario[] => [...v.diario.slice(-(DIARIO_MAX - 1)), { id: nuovoId(), ...voce }];

// In chat il testo è libero (anche blocchi ```json veri): si toglie il blocco di stato solo nelle partite.
const parziale = (testo: string, ruolo: Ruolo | undefined) => (ruolo === 'chat' ? testo : pulisciParziale(testo));

let contatore = 0;
const nuovoId = () => ++contatore;

// Il testo di Claude arriva con il blocco ```json di stato in coda: a schermo non serve.
export function pulisciParziale(testo: string): string {
  const i = testo.lastIndexOf('```json');
  const senza = i >= 0 ? testo.slice(0, i) : testo;
  return senza.replace(/`{1,3}$/, '').trimEnd();
}

function fasiDaIstantanea(d: Dibattito, prima: Vista): Vista['fase'] {
  if (d.stato === 'concluso') return { claude: 'conclusione', codex: 'conclusione' };
  if (d.stato === 'errore') {
    const colpevole = d.chiamateFallite.at(-1)?.agente ?? prima.parlante;
    return { claude: colpevole === 'claude' ? 'errore' : 'attesa', codex: colpevole === 'codex' ? 'errore' : 'attesa' };
  }
  if (d.stato === 'in_pausa' || d.stato === 'nuovo' || d.stato === 'aperta') return { claude: 'attesa', codex: 'attesa' };
  return prima.fase;
}

const riposo = (f: FaseVista): FaseVista => (f === 'ragionamento' || f === 'risposta' || f === 'strumento' ? 'attesa' : f);

// L'assistente al lavoro resta finché l'istantanea non dice che ha finito: in riunione serve
// l'incarico ancora in corso (e nessun altro al lavoro), in produzione una produzione attiva.
function tieniAssistente(a: AssistenteVivo | undefined, d: Dibattito, c: Corrente | null | undefined): AssistenteVivo | undefined {
  if (!a) return undefined;
  if (a.dove === 'produzione') return d.produzione?.stato === 'in_lavorazione' || d.produzione?.stato === 'collaudo' ? a : undefined;
  if (d.stato !== 'in_corso' || c === null || (c && c.assistente !== a.id)) return undefined;
  return d.turni.some((t) => t.incarichi?.some((i) => i.assistente === a.id && i.stato === 'in_corso')) ? a : undefined;
}

export function riduci(v: Vista, a: Azione): Vista {
  switch (a.tipo) {
    case 'azzera':
      return vistaVuota();
    case 'connessione':
      return { ...v, connesso: a.connesso };
    case 'consumato':
      return { ...v, effetti: v.effetti.filter((e) => e.id !== a.id) };
    case 'chiudi_avviso':
      return { ...v, avvisi: v.avvisi.filter((x) => x.id !== a.id) };
    case 'istantanea': {
      const d = a.dibattito;
      const fermo = d.stato !== 'in_corso' && d.stato !== 'sintesi';
      const c = a.corrente;
      const base = { ...v, dibattito: d, inCorso: a.inCorso, altrove: !!a.altrove, fase: fasiDaIstantanea(d, v), assistente: tieniAssistente(v.assistente, d, c) };
      if (fermo) return { ...base, parlante: undefined, ruolo: undefined, testoParziale: '', inizioTurno: undefined, azione: {} };
      // Lavora un assistente con la CLI di Claude o di Codex: al lavoro c'è lui, non il capo reparto.
      if (c?.assistente) {
        const prima = v.assistente?.id === c.assistente ? v.assistente : undefined;
        const compito = d.turni.find((t) => t.indice === c.indice)?.incarichi?.find((i) => i.assistente === c.assistente && i.stato === 'in_corso')?.compito;
        return {
          ...base,
          parlante: undefined,
          ruolo: 'incarico',
          indice: c.indice,
          inizioTurno: prima ? v.inizioTurno ?? c.inizio : c.inizio,
          testoParziale: '',
          fase: { claude: riposo(base.fase.claude), codex: riposo(base.fase.codex) },
          azione: {},
          assistente: {
            id: c.assistente,
            dove: 'incarico',
            compito: compito ?? prima?.compito,
            turno: c.indice,
            fase: c.fase,
            testo: c.testo ? pulisciParziale(c.testo) : prima?.testo ?? '',
            azione: c.fase === 'strumento' && c.azione ? (prima?.azione?.testo === c.azione ? prima.azione : { testo: c.azione, strumento: c.strumento, da: Date.now() }) : undefined,
            da: prima?.da ?? c.inizio,
          },
        };
      }
      // Il server dice chi lavora adesso: serve a chi apre o ricarica la pagina a metà turno.
      if (c) {
        return {
          ...base,
          parlante: c.agente,
          ruolo: c.ruolo,
          indice: c.indice,
          inizioTurno: v.parlante === c.agente && v.indice === c.indice ? v.inizioTurno : c.inizio,
          testoParziale: c.testo ? parziale(c.testo, c.ruolo) : v.parlante === c.agente ? v.testoParziale : '',
          fase: { ...base.fase, [c.agente]: c.fase, [altro(c.agente)]: 'attesa' } as Vista['fase'],
          azione: c.fase === 'strumento' && c.azione
            ? { [c.agente]: v.azione[c.agente]?.testo === c.azione ? v.azione[c.agente] : { testo: c.azione, strumento: c.strumento, da: Date.now() } }
            : {},
        };
      }
      // Nessuno al lavoro (o PC spento): nessuno resta a "ragionare" in scena.
      if (c === null) {
        return { ...base, parlante: undefined, ruolo: undefined, testoParziale: '', inizioTurno: undefined, azione: {}, fase: { claude: riposo(base.fase.claude), codex: riposo(base.fase.codex) } };
      }
      return base;
    }
    case 'evento':
      return applica(v, a.evento, a.ora ?? Date.now());
  }
}

function applica(v: Vista, e: Evento, ora: number): Vista {
  switch (e.tipo) {
    case 'turno_inizio':
      return {
        ...v,
        assistente: v.assistente?.dove === 'produzione' ? v.assistente : undefined,
        parlante: e.agente,
        ruolo: e.ruolo,
        indice: e.indice,
        inizioTurno: ora,
        testoParziale: '',
        fase: { ...v.fase, [e.agente]: 'ragionamento', [altro(e.agente)]: 'attesa' } as Vista['fase'],
        azione: {},
      };
    case 'attivita':
      if (e.fase === 'strumento') {
        const testo = e.testo ?? 'Usa uno strumento';
        return {
          ...v,
          fase: { ...v.fase, [e.agente]: 'strumento' },
          azione: { ...v.azione, [e.agente]: { testo, strumento: e.strumento, da: ora } },
          diario: nelDiario(v, { agente: e.agente, testo, strumento: e.strumento, ora }),
        };
      }
      return {
        ...v,
        fase: { ...v.fase, [e.agente]: e.fase },
        azione: { ...v.azione, [e.agente]: undefined },
        testoParziale: e.testo !== undefined && e.agente === v.parlante ? parziale(e.testo, v.ruolo) : v.testoParziale,
      };
    case 'messaggio':
      return conMessaggio(v, e.messaggio);
    case 'turno': {
      const r = e.turno.risposta;
      const effetti: Effetto[] = [...v.effetti, { id: nuovoId(), tipo: 'colpo', da: e.turno.agente, stato: r.stato }];
      if (r.cambi_di_posizione.length) effetti.push({ id: nuovoId(), tipo: 'cambio', agente: e.turno.agente, testo: r.cambi_di_posizione[0]! });
      return { ...v, effetti, fase: { ...v.fase, [e.turno.agente]: 'attesa' }, parlante: undefined, testoParziale: '', inizioTurno: undefined };
    }
    case 'intervento':
      return { ...v, effetti: [...v.effetti, { id: nuovoId(), tipo: 'nota', testo: e.testo }] };
    case 'avviso':
      return { ...v, avvisi: [...v.avvisi.slice(-3), { id: nuovoId(), testo: e.testo, grave: false }] };
    case 'errore': {
      const chi = v.parlante;
      return {
        ...v,
        avvisi: [...v.avvisi.slice(-3), { id: nuovoId(), testo: e.messaggio, grave: true }],
        fase: chi ? { ...v.fase, [chi]: 'errore' } : v.fase,
      };
    }
    case 'concluso':
      return {
        ...v,
        assistente: v.assistente?.dove === 'produzione' ? v.assistente : undefined,
        fase: { claude: 'conclusione', codex: 'conclusione' },
        parlante: undefined,
        testoParziale: '',
        effetti: [...v.effetti, { id: nuovoId(), tipo: 'esito', esito: e.esito, approvata: e.approvata }],
      };
    case 'produzione': {
      const fermo = e.stato !== 'in_lavorazione' && e.stato !== 'collaudo';
      const w = fermo && v.assistente?.dove === 'produzione' ? { ...v, assistente: undefined } : v;
      return e.testo ? { ...w, avvisi: [...w.avvisi.slice(-3), { id: nuovoId(), testo: e.testo, grave: e.stato === 'errore' }] } : w;
    }
    // La squadra: un incarico che comincia mette al lavoro l'assistente e ferma i capi reparto.
    case 'incarico': {
      const i = e.incarico;
      if (i.stato === 'in_corso') {
        return {
          ...v,
          parlante: undefined,
          ruolo: 'incarico',
          indice: e.turno,
          inizioTurno: ora,
          testoParziale: '',
          fase: { claude: riposo(v.fase.claude), codex: riposo(v.fase.codex) },
          azione: {},
          assistente: { id: i.assistente, dove: 'incarico', compito: i.compito, turno: e.turno, fase: 'ragionamento', testo: '', da: ora },
        };
      }
      const suo = v.assistente?.id === i.assistente && v.assistente.dove === 'incarico';
      const finito = i.stato === 'fatto' || i.stato === 'fallito';
      return {
        ...v,
        assistente: suo ? undefined : v.assistente,
        ...(suo && v.ruolo === 'incarico' ? { ruolo: undefined, inizioTurno: undefined } : {}),
        effetti: finito ? [...v.effetti, { id: nuovoId(), tipo: 'rapporto', assistente: i.assistente, ok: i.stato === 'fatto' }] : v.effetti,
      };
    }
    // In riunione arriva con l'incarico già cominciato; in produzione è l'unico segnale di chi lavora.
    case 'attivita_assistente': {
      const prod = v.dibattito?.produzione;
      const inProduzione = prod?.stato === 'in_lavorazione' || prod?.stato === 'collaudo';
      const prima = v.assistente?.id === e.assistente ? v.assistente : undefined;
      const azione = e.fase === 'strumento' ? { testo: e.testo ?? 'Usa uno strumento', strumento: e.strumento, da: ora } : undefined;
      return {
        ...v,
        assistente: {
          id: e.assistente,
          dove: prima?.dove ?? (inProduzione ? 'produzione' : 'incarico'),
          compito: prima?.compito,
          turno: prima?.turno,
          fase: e.fase,
          azione,
          testo: e.fase !== 'strumento' && e.testo !== undefined ? pulisciParziale(e.testo) : prima?.testo ?? '',
          da: prima?.da ?? ora,
        },
      };
    }
    case 'stato':
      if (e.stato === 'in_pausa' || e.stato === 'aperta') return { ...v, parlante: undefined, testoParziale: '', inizioTurno: undefined, azione: {}, fase: { claude: 'attesa', codex: 'attesa' }, assistente: v.assistente?.dove === 'produzione' ? v.assistente : undefined };
      return v;
  }
}

// Un messaggio della chat: entra subito nella conversazione (l'istantanea dopo lo conferma).
function conMessaggio(v: Vista, m: MessaggioChat): Vista {
  const d = v.dibattito;
  const chat = d?.chat ?? [];
  const dibattito = d && !chat.some((x) => x.indice === m.indice) ? { ...d, chat: [...chat, m] } : d;
  if (m.autore === 'utente') return { ...v, dibattito, effetti: [...v.effetti, { id: nuovoId(), tipo: 'nota', testo: m.testo }] };
  // Il motore racconta un fatto (partita avviata, produzione pronta): niente animazioni degli omini.
  if (m.autore === 'motore') return { ...v, dibattito };
  return {
    ...v,
    dibattito,
    fase: { ...v.fase, [m.autore]: 'attesa' },
    azione: { ...v.azione, [m.autore]: undefined },
    parlante: v.parlante === m.autore ? undefined : v.parlante,
    testoParziale: v.parlante === m.autore ? '' : v.testoParziale,
    inizioTurno: v.parlante === m.autore ? undefined : v.inizioTurno,
    effetti: [...v.effetti, { id: nuovoId(), tipo: 'messaggio', agente: m.autore, passa: !!m.passa }],
    diario: nelDiario(v, { agente: m.autore, testo: m.passa ? 'Non ha niente da aggiungere' : 'Ha risposto', ora: Date.now() }),
  };
}

// Quanto sono vicini: media dell'ultimo stato dichiarato da ciascuno (0 disaccordo, 1 accordo).
const PESO: Record<StatoDichiarato, number> = { proposta: 0.3, disaccordo: 0, accordo_parziale: 0.55, accordo: 1 };

export function consenso(d: Dibattito | undefined): { valore: number; claude?: StatoDichiarato; codex?: StatoDichiarato } {
  if (!d?.turni.length) return { valore: 0.3 };
  const ultimo = (a: Agente) => [...d.turni].reverse().find((t) => t.agente === a)?.risposta.stato;
  const c = ultimo('claude');
  const x = ultimo('codex');
  const valori = [c, x].filter((s): s is StatoDichiarato => !!s).map((s) => PESO[s]);
  return { valore: valori.reduce((s, n) => s + n, 0) / valori.length, claude: c, codex: x };
}

export const ETICHETTE_STATO: Record<StatoDichiarato, string> = {
  proposta: 'Proposta',
  accordo: 'Accordo',
  accordo_parziale: 'Accordo parziale',
  disaccordo: 'Disaccordo',
};

export const ETICHETTE_ESITO: Record<Esito, string> = {
  accordo: 'Consenso raggiunto',
  stallo: 'Stallo',
  limite: 'Chiusa al limite di sicurezza',
  limite_round: 'Round finiti',
  chiuso_da_utente: 'Partita chiusa',
};

// In chat: chi deve ancora rispondere all'ultimo messaggio dell'utente, a parte chi sta già scrivendo.
export function inCodaChat(d: Dibattito | undefined, parlante?: Agente): Agente[] {
  const chat = d?.chat ?? [];
  const ultimo = chat.findLast((m) => m.autore === 'utente');
  if (!ultimo || (d?.stato !== 'in_corso' && ultimo.indice <= (d?.saltaFino ?? 0))) return [];
  return (ultimo.a ?? []).filter((a) => a !== parlante && !chat.some((m) => m.autore === a && (m.risponde ?? 0) >= ultimo.indice));
}
