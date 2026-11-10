// Chi siede dove: il reparto di ogni assistente, il suo posto in ufficio e, mentre
// la decisione è in produzione, la sua postazione sulla catena di montaggio. Funzioni pure, senza
// 3D: le usano la regia (Direzione.tsx), la telecamera (Scena.tsx) e i test.
import type { Dibattito, Procedura, Produzione, StatoPacchetto } from '../../../motore/tipi.ts';
import { chiamatiNellaPartita } from '../squadra.ts';
import type { AssistenteVivo } from '../stato.ts';
import { MAX_POSTAZIONI_LINEA, POSTI_COLLAUDO, REPARTO, postiDi, SCRIVANIA_CORREZIONI, scrivanieCostruzione, sedile, type IdReparto, type Punto, type Stazione } from './pianta.ts';

// I 7 di serie hanno un reparto e un posto fissi: da una partita all'altra li si ritrova lì.
export const REPARTO_STANDARD: Record<string, { reparto: IdReparto; posto: number }> = {
  ricerca: { reparto: 'ricerca', posto: 0 },
  analisi: { reparto: 'ricerca', posto: 1 },
  architettura: { reparto: 'progettazione', posto: 0 },
  design: { reparto: 'progettazione', posto: 1 },
  testi: { reparto: 'contenuti', posto: 0 },
  sviluppo: { reparto: 'sviluppo', posto: 0 },
  controllo: { reparto: 'qualita', posto: 0 },
};

// Gli agenti dell'utente: il reparto si ricava da ruolo e descrizione (italiano o inglese).
const PAROLE: [IdReparto, RegExp][] = [
  ['qualita', /collaud|\bqa\b|\btest(s|ing)?\b|verific|controll|revision|critic|audit|accessib|a11y|wcag|perform|lighthouse|evaluat|valutaz|supervis|qualit/i],
  ['progettazione', /architett|architect|progett|design|\bui\b|\bux\b|wirefram|planning|pianific|\bspec/i],
  ['contenuti', /\btesti\b|\btesto\b|copy|scritt|scriv|contenut|redaz|documentaz|tradu|social|marketing|articol/i],
  ['ricerca', /ricerc|research|anali[sz]|\bdati\b|\bdata\b|indagin|fonti/i],
  ['sviluppo', /svilupp|codice|\bcode\b|build|costru|implement|develop|full.?stack|frontend|backend|programm/i],
];

export interface InfoAgente {
  id: string;
  ruolo?: string;
  descrizione?: string;
  produzione?: boolean;
  fonte?: 'standard' | 'utente';
}

// Il reparto di un assistente. Agenti dell'utente: chi fa collaudo in una procedura va in Qualità,
// chi costruisce (produzione) in Sviluppo, poi si guarda il ruolo; chi resta senza reparto è un ospite.
export function repartoDi(a: InfoAgente, procedure: readonly Procedura[] = []): IdReparto {
  const std = REPARTO_STANDARD[a.id];
  if (std && a.fonte !== 'utente') return std.reparto;
  const fasi = new Set(procedure.flatMap((p) => p.passi.filter((x) => x.assistente === a.id).map((x) => x.fase)));
  if (fasi.has('collaudo')) return 'qualita';
  if (a.produzione) return 'sviluppo';
  const testo = `${a.id.replace(/[-_]/g, ' ')} ${a.ruolo ?? ''} ${a.descrizione ?? ''}`;
  for (const [r, re] of PAROLE) if (re.test(testo)) return r;
  if (fasi.has('piano')) return 'progettazione';
  if (fasi.has('produzione')) return 'sviluppo';
  return 'ospiti';
}

export interface PostoUfficio {
  reparto: IdReparto;
  indice: number; // in postiDi(REPARTO[reparto])
}

// I posti dei 7 di serie restano loro anche quando non ci sono: un agente dell'utente non li prende,
// così nessuno cambia sedia a metà partita quando arriva un assistente nuovo.
const RISERVATI = new Map<IdReparto, Set<number>>();
for (const s of Object.values(REPARTO_STANDARD)) {
  if (!RISERVATI.has(s.reparto)) RISERVATI.set(s.reparto, new Set());
  RISERVATI.get(s.reparto)!.add(s.posto);
}

// Assegna i posti nell'ordine di chiamata. Un reparto pieno manda agli ospiti; pieni anche quelli,
// l'assistente si vede solo nei pannelli.
export function assegnaPosti(ids: readonly string[], reparto: (id: string) => IdReparto): Map<string, PostoUfficio> {
  const out = new Map<string, PostoUfficio>();
  const occupati = new Map<IdReparto, Set<number>>();
  const occ = (r: IdReparto) => {
    let s = occupati.get(r);
    if (!s) occupati.set(r, (s = new Set()));
    return s;
  };
  for (const id of ids) {
    if (out.has(id)) continue;
    const r = reparto(id);
    const std = REPARTO_STANDARD[id];
    if (std && std.reparto === r && !occ(r).has(std.posto)) {
      out.set(id, { reparto: r, indice: std.posto });
      occ(r).add(std.posto);
      continue;
    }
    for (const rep of r === 'ospiti' ? ['ospiti' as const] : [r, 'ospiti' as const]) {
      const n = postiDi(REPARTO[rep]).length;
      const riservati = RISERVATI.get(rep);
      const i = [...Array(n).keys()].find((k) => !riservati?.has(k) && !occ(rep).has(k));
      if (i !== undefined) {
        out.set(id, { reparto: rep, indice: i });
        occ(rep).add(i);
        break;
      }
    }
  }
  return out;
}

// --- la catena di montaggio ---------------------------------------------------------------------

export interface PostoCatena {
  dove: 'costruzione' | 'collaudo' | 'correzioni';
  indice: number; // la postazione della costruzione, o il posto al banco del collaudo (0 è di Codex)
}

export type TonoScatola = 'lavoro' | 'pronta' | 'rivedere' | 'ferma' | 'errore';

export interface StatoCatena {
  attiva: boolean; // in lavorazione o in collaudo
  pacchetti: { titolo: string; assistente: string; stato: StatoPacchetto }[]; // una postazione ciascuno
  scatola: { stazione: Stazione; indice?: number; tono: TonoScatola } | null;
  correzioni: boolean; // in questa produzione c'è stato almeno un giro di correzione
  posti: Map<string, PostoCatena>; // gli assistenti che adesso stanno sulla catena e non in ufficio
  codex: boolean; // Codex al banco del collaudo
  lavora?: { id: string; cosa: string }; // chi lavora adesso sulla catena (manca: Codex in collaudo)
}

const VUOTA: StatoCatena = { attiva: false, pacchetti: [], scatola: null, correzioni: false, posti: new Map(), codex: false };

export type FaseProduzione = 'costruzione' | 'collaudo' | 'correzioni' | 'consegna';

// In che fase è (o era, se ferma) la produzione. Dal vivo lo dicono stato e giro. Ferma (dall'utente o
// per un errore) si ricava da quello che il motore ha già scritto: il giro nasce solo a costruzione
// finita, e durante una correzione il resoconto resta quello respinto dall'ultimo collaudo finché chi
// corregge non ha finito.
export function faseProduzione(p: Produzione): FaseProduzione {
  if (p.stato === 'pronta') return 'consegna';
  if (p.stato === 'collaudo') return 'collaudo';
  if (p.stato === 'in_lavorazione') return (p.giro ?? 1) > 1 ? 'correzioni' : 'costruzione';
  if (p.giro === undefined) return 'costruzione';
  return p.giro > 1 && p.resoconto === p.giri?.at(-1)?.resoconto ? 'correzioni' : 'collaudo';
}

// Dallo stato vero della produzione: dove sta la scatola del lavoro e chi sta a quale stazione.
// vivo: l'assistente che lavora adesso in produzione (dagli eventi: correzione o revisione).
// revisori: gli assistenti di collaudo della procedura (e chi ha già fatto una revisione).
export function statoCatena(p: Produzione | undefined, vivo: { id: string; dove: string } | undefined, revisori: readonly string[]): StatoCatena {
  if (!p) return VUOTA;
  const giro = p.giro ?? 1;
  const attiva = p.stato === 'in_lavorazione' || p.stato === 'collaudo';
  const fase = faseProduzione(p);
  // Le produzioni salvate prima della squadra non hanno pacchetti: uno solo, di Paolo (sviluppo).
  // Fermata o in errore durante la costruzione non è un pacchetto consegnato (il motore segna così
  // anche il pacchetto fermato a metà).
  const pk = (p.pacchetti?.length ? p.pacchetti.map((x) => ({ titolo: x.titolo, assistente: x.assistente, stato: x.stato }))
    : [{ titolo: 'Tutta la decisione', assistente: 'sviluppo', stato: (fase !== 'costruzione' ? 'fatto' : p.stato === 'in_lavorazione' ? 'in_corso' : 'fallito') as StatoPacchetto }])
    .slice(0, MAX_POSTAZIONI_LINEA);
  const inCorso = pk.findIndex((x) => x.stato === 'in_corso');
  const primoAperto = pk.findIndex((x) => x.stato !== 'fatto');
  const dove = ((): { stazione: Stazione; indice?: number } => {
    if (fase === 'collaudo') return { stazione: 3 };
    if (fase === 'consegna') return { stazione: 5 };
    if (fase === 'correzioni') return { stazione: 4 };
    if (inCorso >= 0) return { stazione: 2, indice: inCorso };
    if (primoAperto >= 0) return pk.some((x) => x.stato !== 'attesa') ? { stazione: 2, indice: primoAperto } : { stazione: 1 };
    return { stazione: 3 }; // tutti fatti: la scatola va al collaudo
  })();
  const tono: TonoScatola = p.stato === 'pronta' ? (p.collaudo?.approvato ? 'pronta' : 'rivedere') : p.stato === 'fermata' ? 'ferma' : p.stato === 'errore' ? 'errore' : 'lavoro';

  const posti = new Map<string, PostoCatena>();
  let lavora: StatoCatena['lavora'];
  if (attiva) {
    // Chi ha un pacchetto siede alla sua postazione (con più pacchetti: quello in corso, o il primo).
    pk.forEach((x, i) => {
      if (!posti.has(x.assistente) || x.stato === 'in_corso') posti.set(x.assistente, { dove: 'costruzione', indice: i });
    });
    if (inCorso >= 0 && p.stato === 'in_lavorazione' && giro <= 1) lavora = { id: pk[inCorso]!.assistente, cosa: pk[inCorso]!.titolo };
    // Chi corregge è sempre uno dei costruttori (responsabile() nel motore): un vivo che non lo è
    // viene dalla fase prima (il revisore del collaudo). Quello giusto arriva col primo evento suo.
    if (p.stato === 'in_lavorazione' && giro > 1 && vivo?.dove === 'produzione' && pk.some((x) => x.assistente === vivo.id)) {
      posti.set(vivo.id, { dove: 'correzioni', indice: 0 });
      lavora = { id: vivo.id, cosa: 'corregge dopo il collaudo' };
    }
    if (p.stato === 'collaudo') {
      [...new Set(revisori)].slice(0, POSTI_COLLAUDO.length - 1).forEach((id, k) => posti.set(id, { dove: 'collaudo', indice: k + 1 }));
      if (vivo?.dove === 'produzione' && posti.get(vivo.id)?.dove === 'collaudo') lavora = { id: vivo.id, cosa: 'rivede i file' };
    }
  }
  return {
    attiva,
    pacchetti: pk,
    scatola: { ...dove, tono },
    correzioni: giro > 1 || (p.giri?.length ?? 0) > 0,
    posti,
    codex: p.stato === 'collaudo',
    lavora,
  };
}

// Gli assistenti di collaudo di una produzione: i passi "collaudo" della sua procedura, più chi ha
// già fatto una revisione (anche se la procedura nel frattempo è cambiata).
export function revisoriDi(p: Produzione | undefined, procedure: readonly Procedura[]): string[] {
  if (!p) return [];
  const proc = p.procedura ? procedure.find((x) => x.id === p.procedura) : undefined;
  return [...new Set([...(proc?.passi ?? []).filter((x) => x.fase === 'collaudo').map((x) => x.assistente), ...(p.revisioni ?? []).map((r) => r.assistente)])];
}

// --- la disposizione completa di una partita ------------------------------------------------------

export interface Disposizione {
  chiamati: string[]; // in ordine di prima chiamata
  ufficio: Map<string, PostoUfficio>; // il posto in ufficio di ognuno (anche di chi adesso è sulla catena)
  catena: StatoCatena;
}

export const DISPOSIZIONE_VUOTA: Disposizione = { chiamati: [], ufficio: new Map(), catena: VUOTA };

// Chi della squadra c'è in scena e dove: i chiamati nella partita siedono nel loro reparto, chi lavora
// sulla catena sta alla sua stazione. In chat nessuno: la chat è di Claude e Codex.
export function disposizione(d: Dibattito | undefined, vivo: AssistenteVivo | undefined, info: (id: string) => InfoAgente, procedure: readonly Procedura[]): Disposizione {
  if (!d || d.config.tipo === 'chat') return DISPOSIZIONE_VUOTA;
  const catena = statoCatena(d.produzione, vivo, revisoriDi(d.produzione, procedure));
  // In più chi sta sulla catena senza essere ancora scritto nella partita: gli assistenti di
  // collaudo della procedura, che compaiono al banco prima della loro prima revisione.
  const chiamati = [...new Set([...chiamatiNellaPartita(d, vivo?.id), ...catena.posti.keys()])];
  return { chiamati, ufficio: assegnaPosti(chiamati, (id) => repartoDi(info(id), procedure)), catena };
}

export interface Luogo {
  punto: Punto;
  verso: number;
  dove: 'ufficio' | 'costruzione' | 'collaudo' | 'correzioni';
  reparto?: IdReparto;
  indice: number;
  scrivania: boolean; // ha una scrivania davanti (gli ospiti e il collaudo no)
}

// Dove sta adesso un assistente: alla sua stazione sulla catena, altrimenti al suo posto in ufficio.
export function luogoDi(disp: Disposizione, id: string): Luogo | null {
  const c = disp.catena.posti.get(id);
  if (c) {
    if (c.dove === 'costruzione') {
      const s = scrivanieCostruzione(disp.catena.pacchetti.length || 2)[c.indice];
      if (s) return { ...sedile(s), dove: 'costruzione', indice: c.indice, scrivania: true };
    } else if (c.dove === 'correzioni') return { ...sedile(SCRIVANIA_CORREZIONI), dove: 'correzioni', indice: 0, scrivania: true };
    else return { punto: POSTI_COLLAUDO[c.indice] ?? POSTI_COLLAUDO[1]!, verso: Math.PI, dove: 'collaudo', indice: c.indice, scrivania: false };
  }
  const u = disp.ufficio.get(id);
  if (!u) return null;
  const r = REPARTO[u.reparto];
  const posto = postiDi(r)[u.indice];
  return posto ? { ...posto, dove: 'ufficio', reparto: u.reparto, indice: u.indice, scrivania: u.indice < r.scrivanie.length } : null;
}

// Il punto della scena dove succede qualcosa in una partita: chi lavora (Claude o Codex al tavolo
// durante la riunione, alla scrivania dopo; un assistente al suo posto), per la telecamera che segue.
// Una partita va in errore solo in riunione, sintesi o verifica (la produzione ha il suo stato): resta
// aperta anche con l'esito già scritto, che arriva prima della sintesi.
export function riunioneAperta(d: Dibattito | undefined): boolean {
  if (!d || d.config.tipo === 'chat') return false;
  return d.stato === 'nuovo' || d.stato === 'in_corso' || d.stato === 'in_pausa' || d.stato === 'sintesi' || d.stato === 'errore';
}

// La lavagna della Direzione: il titolo della partita aperta, a che punto è e il suo piano.
export function datiLavagna(d: Dibattito | undefined, nome: (id: string) => string): { titolo: string; stato: string; righe: string[] } | null {
  if (!d) return null;
  const titolo = d.config.titolo ?? d.config.domanda;
  if (d.config.tipo === 'chat') return { titolo, stato: 'Chat', righe: [] };
  const p = d.produzione;
  const pk = p?.pacchetti ?? [];
  const stato = d.stato === 'in_corso' ? `Riunione · I${Math.max(1, d.turni.length)}`
    : d.stato === 'sintesi' ? 'Sintesi'
    : d.stato === 'in_pausa' ? 'In pausa'
    : d.stato === 'errore' ? 'Ferma'
    : p?.stato === 'in_lavorazione' ? ((p.giro ?? 1) > 1 ? 'Correzioni' : `Costruzione ${pk.filter((x) => x.stato === 'fatto').length}/${Math.max(1, pk.length)}`)
    : p?.stato === 'collaudo' ? 'Collaudo'
    : p?.stato === 'pronta' ? (p.collaudo?.approvato ? 'Consegna pronta' : 'Da rivedere')
    : p ? 'Produzione ferma'
    : d.esito === 'accordo' ? 'Piano pronto'
    : d.esito ? 'Chiusa' : 'Riunione';
  const s = d.sintesi?.testo;
  const ultimo = d.turni.at(-1)?.risposta;
  const righe = s?.pacchetti?.length ? s.pacchetti.map((x, i) => `${pk[i]?.stato === 'fatto' ? '✓ ' : ''}${x.titolo} · ${nome(x.assistente)}`)
    : s ? s.decisioni
    : ultimo ? [ultimo.posizione, ...ultimo.punti_aperti.map((x) => `Aperto: ${x}`)]
    : [];
  return { titolo, stato, righe: righe.filter(Boolean) };
}
