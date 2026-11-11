// Il motore: tiene la riunione tra Claude e Codex (i due capi reparto, che parlano a turno e
// affidano incarichi alla squadra), decide quando è finita, fa scrivere la sintesi a uno e la fa
// verificare all'altro. Lo stato vive nell'archivio; gli eventi servono a chi guarda (CLI, dashboard).
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { costruisci } from './agenti/cantiere.ts';
import { turnoClaude, type EsitoCli } from './agenti/claude.ts';
import { turnoCodex } from './agenti/codex.ts';
import {
  CARTELLA_DATI, MODELLO_CLAUDE_PREDEFINITO, modelloCodexPredefinito, RADICE, RAGIONAMENTO_CLAUDE, RAGIONAMENTO_CODEX,
  verificaAccessi, type Accessi,
} from './ambiente.ts';
import { allegatiPerPrompt, firmaAllegati, passaAllegati } from './allegati.ts';
import { creaArchivio, nuovoId, type Archivio } from './archivio.ts';
import { creaDossier, disinnesca, elencoCartelle, trovaCartella } from './cartelle.ts';
import { contestoDaChat, datiFineLavoro, destinatari, leggiProposta, messaggiChat, passa, prossimaRisposta, prossimoIndice, promptChat, titoloChat, ultimoDaRispondere } from './chat.ts';
import { cartellaNoteSalvate, scriviNota, scriviNotaChat } from './obsidian.ts';
import { descriviFonti, IMPOSTAZIONI, noteAttive, scriviFontiNote } from './impostazioni.ts';
import { ErroreFormato, leggiRisposta, type RispostaChat } from './formato.ts';
import { inMarkdown } from './markdown.ts';
import { Annullato, ErroreAgente } from './processo.ts';
import { lavora, MAX_CORREZIONI_PRODUZIONE, pacchettiDaFare, producibile, SCHEMA_COLLAUDO, SISTEMA_COLLAUDO, type Operai } from './produzione.ts';
import {
  accetta, incarichiDi, MAX_INTERVENTI_RIUNIONE, promptCorrezione, promptIncarico, promptSintesi, promptTurno, promptVerifica,
} from './prompt.ts';
import {
  agentiPredefiniti, contaLavoro, creaCatalogo, fileSistema, MAX_INCARICHI_INTERVENTO, MAX_INCARICHI_RIUNIONE, MAX_RAPPORTO, nomeAssistente,
  normalizzaPacchetti, normalizzaProcedura, pulisciCompito, sistemaAssistente, squadraConStatistiche, taglia, trovaAssistente, XP,
  type Catalogo,
} from './squadra.ts';
import {
  altro, NOME,
  type Agente, type Chiamata, type Corrente, type Config, type Destinatari, type Dibattito, type Esito, type Evento, type Fase, type Incarico,
  type ConfigInput, type MembroSquadra, type MessaggioChat, type Procedura, type RispostaTurno, type Sintesi, type StatoDibattito, type Strumento, type TipoRisposta,
  type Turno, type Verifica,
} from './tipi.ts';

export type { ConfigInput };

type Valori = { turno: RispostaTurno; sintesi: Sintesi; verifica: Verifica; chat: RispostaChat; incarico: RispostaChat };

const SISTEMA_CLAUDE = join(RADICE, 'motore', 'istruzioni', 'sistema-claude.md');
const SISTEMA_CODEX = join(RADICE, 'motore', 'istruzioni', 'sistema-codex.md');
const SISTEMA_CHAT_CLAUDE = join(RADICE, 'motore', 'istruzioni', 'sistema-chat-claude.md');
const SISTEMA_CHAT_CODEX = join(RADICE, 'motore', 'istruzioni', 'sistema-chat-codex.md');
// Gli accessi alle CLI si controllano una volta ogni tanto in chat: a ogni messaggio sarebbero secondi persi.
const ACCESSI_CHAT_MS = 10 * 60_000;
const SCHEMI = join(RADICE, 'motore', 'schemi');
const MAX_CORREZIONI = 2;

// agente è la CLI che risponde. Con tipo 'incarico' lavora un assistente della squadra (assistente:
// il suo id; sistema: le regole del motore più il suo ruolo, già messe insieme dal motore) con le
// stesse funzioni di sola lettura dei capi reparto, sempre in una sessione nuova.
export type ChiamaAgente = (op: {
  agente: Agente;
  tipo: TipoRisposta;
  prompt: string;
  sessione?: string;
  assistente?: string;
  sistema?: string;
  config: Config;
  cartella: string;
  signal: AbortSignal;
  suAttivita: (fase: Fase, testo?: string, strumento?: Strumento) => void;
}) => Promise<EsitoCli>;

export const chiamaAgenteReale: ChiamaAgente = (op) => {
  // Le fonti si riscrivono a ogni chiamata: una nota salvata adesso vale già per la prossima risposta.
  scriviFontiNote();
  const comune = {
    prompt: op.prompt,
    sessione: op.sessione,
    ricercaWeb: op.config.ricercaWeb,
    // Le note si danno solo se ce ne sono: senza, gli strumenti delle note non servono a niente.
    memoria: noteAttive(op.config),
    cartella: op.cartella,
    timeoutMs: op.config.timeoutTurnoS * 1000,
    signal: op.signal,
    suAttivita: op.suAttivita,
  };
  // Un assistente: le sue istruzioni (regole comuni più il ruolo), testo libero, mai una sessione vecchia.
  if (op.tipo === 'incarico') {
    if (!op.assistente || !op.sistema) throw new ErroreAgente('incarico senza assistente o senza istruzioni', 'altro', false);
    if (op.agente === 'claude') {
      return turnoClaude({ ...comune, sessione: undefined, sistema: op.sistema, modello: op.config.claude.modello, ragionamento: op.config.claude.ragionamento });
    }
    return turnoCodex({
      ...comune, sessione: undefined, istruzioniFile: fileSistema(op.sistema, `assistente-${op.assistente}`), schemaFile: undefined,
      modello: op.config.codex.modello, ragionamento: op.config.codex.ragionamento,
    });
  }
  // In chat istruzioni sue e testo libero: niente blocco json, niente schema.
  const chat = op.tipo === 'chat';
  if (op.agente === 'claude') {
    return turnoClaude({ ...comune, sistema: readFileSync(chat ? SISTEMA_CHAT_CLAUDE : SISTEMA_CLAUDE, 'utf8'), modello: op.config.claude.modello, ragionamento: op.config.claude.ragionamento });
  }
  return turnoCodex({
    ...comune, istruzioniFile: chat ? SISTEMA_CHAT_CODEX : SISTEMA_CODEX, schemaFile: chat ? undefined : join(SCHEMI, `${op.tipo}.json`),
    modello: op.config.codex.modello, ragionamento: op.config.codex.ragionamento,
  });
};

// Gli operai del magazzino: gli assistenti di produzione costruiscono (Claude nel cantiere), Codex
// collauda, gli assistenti dei passi di collaudo rivedono. Collaudo e revisioni girano nella stanza
// vuota in sola lettura: i file li vedono solo nel prompt.
export const operaiReali = (stanza: string): Operai => ({
  costruisci,
  collauda: (op) => turnoCodex({
    prompt: op.prompt, istruzioniFile: SISTEMA_COLLAUDO, schemaFile: SCHEMA_COLLAUDO, modello: op.modello, ragionamento: op.ragionamento,
    ricercaWeb: false, memoria: op.memoria, cartella: stanza, timeoutMs: op.timeoutMs, signal: op.signal,
  }),
  revisiona: (op) => op.motore === 'claude'
    ? turnoClaude({
      prompt: op.prompt, sistema: op.sistema, modello: op.modello ?? MODELLO_CLAUDE_PREDEFINITO, ragionamento: op.ragionamento,
      ricercaWeb: false, memoria: op.memoria, cartella: stanza, timeoutMs: op.timeoutMs, signal: op.signal,
    })
    : turnoCodex({
      prompt: op.prompt, istruzioniFile: fileSistema(op.sistema, `revisione-${op.assistente}`), schemaFile: SCHEMA_COLLAUDO, modello: op.modello,
      ragionamento: op.ragionamento ?? 'medium', ricercaWeb: false, memoria: op.memoria, cartella: stanza, timeoutMs: op.timeoutMs, signal: op.signal,
    }),
});

// I modelli finiscono negli argomenti delle CLI: solo nomi semplici.
const NOME_MODELLO = /^[A-Za-z0-9][\w.:-]{0,79}$/;

export function normalizzaConfig(c: ConfigInput): Config {
  const domanda = c.domanda.trim();
  if (!domanda) throw new Error('la domanda è vuota');
  if (domanda.length > 20_000) throw new Error('la domanda supera i 20.000 caratteri');
  // Un maxRound mandato da una dashboard vecchia non conta più: la riunione si chiude da sola.
  for (const m of [c.claude?.modello, c.codex?.modello]) if (m !== undefined && !NOME_MODELLO.test(m)) throw new Error(`nome di modello non valido: ${m}`);
  if (c.claude?.ragionamento && !RAGIONAMENTO_CLAUDE.includes(c.claude.ragionamento)) throw new Error(`ragionamento Claude: ${RAGIONAMENTO_CLAUDE.join(', ')}`);
  if (c.codex?.ragionamento && !RAGIONAMENTO_CODEX.includes(c.codex.ragionamento)) throw new Error(`ragionamento Codex: ${RAGIONAMENTO_CODEX.join(', ')}`);
  if (c.cartella !== undefined && (typeof c.cartella !== 'string' || c.cartella.length > 40)) throw new Error('cartella non valida');
  if (c.modo !== undefined && c.modo !== 'insieme' && c.modo !== 'confronto') throw new Error('modo di lavoro: insieme o confronto');
  if (c.tipo !== undefined && c.tipo !== 'chat') throw new Error('tipo di conversazione non valido');
  for (const [nome, v] of [['chi apre', c.apre], ['chi scrive la sintesi', c.relatore]] as const) if (v !== undefined && v !== 'claude' && v !== 'codex') throw new Error(`${nome}: claude o codex`);
  if (c.timeoutTurnoS !== undefined && !Number.isFinite(c.timeoutTurnoS)) throw new Error('tempo massimo del turno non valido');
  if (c.chi !== undefined && !CHI.includes(c.chi)) throw new Error(`chi risponde: ${CHI.join(', ')}`);
  if (c.daChat !== undefined && (typeof c.daChat !== 'string' || !/^\d{8}-\d{4}-[0-9a-f]{6}$/.test(c.daChat))) throw new Error('chat di partenza non valida');
  if (c.titolo !== undefined && (typeof c.titolo !== 'string' || c.titolo.length > 120)) throw new Error('titolo non valido');
  if (c.daProposta !== undefined && !(Number.isInteger(c.daProposta) && c.daProposta > 0)) throw new Error('scheda di partenza non valida');
  if (c.poiProduzione !== undefined && typeof c.poiProduzione !== 'boolean') throw new Error('poiProduzione: vero o falso');
  return {
    domanda,
    apre: c.apre ?? 'claude',
    relatore: c.relatore ?? 'claude',
    claude: { modello: c.claude?.modello ?? MODELLO_CLAUDE_PREDEFINITO, ragionamento: c.claude?.ragionamento },
    codex: { modello: c.codex?.modello ?? modelloCodexPredefinito(), ragionamento: c.codex?.ragionamento ?? 'medium' },
    ricercaWeb: c.ricercaWeb ?? false,
    stallo: c.stallo ?? true,
    timeoutTurnoS: Math.min(Math.max(c.timeoutTurnoS ?? 600, 30), 1800),
    ...(c.cartella ? { cartella: c.cartella } : {}),
    // Le note dell'utente sono attive se non si dice il contrario: è come lavorano i suoi agenti.
    memoria: c.memoria ?? true,
    // Di serie lavorano insieme verso l'obiettivo: il confronto critico si sceglie.
    modo: c.modo ?? 'insieme',
    ...(c.tipo === 'chat' ? { tipo: 'chat' as const, chi: c.chi ?? 'entrambi' } : {}),
    ...(c.daChat && c.tipo !== 'chat' ? { daChat: c.daChat } : {}),
    ...(c.titolo?.trim() ? { titolo: c.titolo.replace(/\s+/g, ' ').trim() } : {}),
    ...(c.daChat && c.tipo !== 'chat' && c.daProposta ? { daProposta: c.daProposta } : {}),
    ...(c.poiProduzione && c.tipo !== 'chat' ? { poiProduzione: true } : {}),
  };
}

const CHI: readonly Destinatari[] = ['entrambi', 'claude', 'codex'];

// Le ultime battute di una chat per la partita che ne nasce: come il materiale delle cartelle,
// un delimitatore casuale che il testo non può imitare e le righe che fingono il motore tolte.
function contestoPerPartita(chat: Dibattito): NonNullable<Dibattito['contestoChat']> {
  const delimitatore = `CHAT-${randomBytes(6).toString('hex')}`;
  return { id: chat.id, testo: disinnesca(contestoDaChat(chat), delimitatore), delimitatore };
}
export const eChat = (d: Dibattito | undefined): boolean => d?.config.tipo === 'chat';
// Il nome da mostrare di una partita: il titolo della scheda, o l'inizio dell'obiettivo.
export const titoloPartita = (d: Dibattito): string => d.config.titolo ?? titoloChat(d.config.domanda);
const oraBreve = (iso: string) => new Date(iso).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' });
const ESITO_BREVE: Record<Esito, string> = {
  accordo: 'accordo pieno',
  stallo: 'stallo, senza accordo',
  limite: 'chiusa al limite di sicurezza, senza accordo pieno',
  limite_round: 'round finiti senza accordo pieno',
  chiuso_da_utente: 'chiusa dall\'utente',
};
const nomeDi = (id: string) => nomeAssistente(undefined, id);

// La partita avviata da una scheda: la dice il messaggio del motore scritto quando è nata.
export function partitaDaProposta(chat: Dibattito, indice: number): string | undefined {
  return chat.chat?.find((m) => m.autore === 'motore' && m.evento?.tipo === 'avviata' && m.evento.proposta === indice)?.evento?.partita;
}

// Lo stato di una partita detto agli agenti in chat, senza codici interni.
export function statoAParole(d: Dibattito, alLavoro: boolean): string {
  const p = d.produzione;
  const pk = p?.pacchetti ?? [];
  const ora = pk.findIndex((x) => x.stato === 'in_corso');
  const chiLavora = ora >= 0
    ? `${nomeDi(pk[ora]!.assistente)} costruisce ${pk.length > 1 ? `il pacchetto ${ora + 1} di ${pk.length} («${pk[ora]!.titolo}»)` : 'la decisione'}`
    : 'Claude costruisce';
  const prod = !p
    ? d.stato !== 'concluso' ? ''
      : d.config.poiProduzione && d.esito === 'accordo' ? 'produzione in partenza'
        : 'produzione non avviata (si avvia dalla partita, o dalla scheda in chat, con "Manda in produzione")'
    : p.stato === 'in_lavorazione' ? `produzione in corso: ${p.giro && p.giro > 1 ? `si corregge dopo il collaudo (giro ${p.giro})` : chiLavora} nel cantiere`
      : p.stato === 'collaudo' ? 'produzione in collaudo: Codex controlla i file'
        : p.stato === 'pronta' ? `produzione pronta, ${p.file.length} file, ${p.collaudo?.approvato ? 'collaudo superato' : `collaudo non superato (${p.collaudo?.problemi.length ?? 0} problemi${p.giri?.length ? ` dopo ${p.giri.length + 1} giri` : ''})`}`
          : p.stato === 'errore' ? `produzione ferma per un errore: ${(p.errore ?? '').split('\n')[0]}`
            : 'produzione fermata';
  const partita = d.stato === 'concluso'
    ? `partita conclusa, ${d.esito ? ESITO_BREVE[d.esito] : 'senza esito'}${d.verifica ? `, sintesi ${d.verifica.testo.approvata ? 'approvata' : 'non approvata'} da ${NOME[d.verifica.revisore]}` : ''}`
    : d.stato === 'errore' ? `partita ferma per un errore: ${(d.errore?.messaggio ?? '').split('\n')[0]}`
      : d.stato === 'in_pausa' ? `riunione in pausa dopo ${d.turni.length} interventi`
        : alLavoro ? `riunione in corso, ${d.turni.length} interventi${incarichiDi(d).length ? ` e ${incarichiDi(d).length} incarichi alla squadra` : ''}`
          : d.stato === 'nuovo' ? 'partita in partenza' : `partita ferma (${d.stato})`;
  return [partita, prod].filter(Boolean).join('; ');
}

// Il motore corregge solo ciò che contraddice le regole, e lo annota nel turno.
export function normalizza(r: RispostaTurno, indice: number): string[] {
  const note: string[] = [];
  if (indice === 1 && r.stato !== 'proposta') {
    note.push(`Primo intervento dichiarato "${r.stato}": registrato come proposta.`);
    r.stato = 'proposta';
  } else if (indice > 1 && r.stato === 'proposta') {
    note.push('Dichiarato "proposta" dopo il primo intervento: registrato come disaccordo.');
    r.stato = 'disaccordo';
  }
  if (r.stato === 'accordo' && r.punti_aperti.length) {
    note.push(`Dichiarato accordo con ${r.punti_aperti.length} punti aperti: registrato come accordo parziale.`);
    r.stato = 'accordo_parziale';
  }
  return note;
}

// Quando la riunione è finita. Piano pronto = due interventi consecutivi, uno per capo reparto,
// entrambi "accordo" senza punti aperti: il secondo ha letto il primo e lo sottoscrive. Lo stallo
// vale solo nel confronto critico; il limite di sicurezza tiene a bada la quota.
export function valuta(d: Dibattito): { esito: Esito; motivo: string } | null {
  const t = d.turni;
  const n = t.length;
  const [a, b] = [t[n - 2], t[n - 1]];
  if (a && b && accetta(a) && accetta(b)) {
    return { esito: 'accordo', motivo: `${NOME[a.agente]} (intervento ${a.indice}) e ${NOME[b.agente]} (intervento ${b.indice}) hanno dichiarato accordo pieno, senza punti aperti, uno dopo l'altro: il piano è pronto.` };
  }
  const ultimi = t.slice(-4);
  if (d.config.modo === 'confronto' && d.config.stallo && ultimi.length === 4 && ultimi.every((x) => x.risposta.stato === 'disaccordo' && x.risposta.cambi_di_posizione.length === 0)) {
    return { esito: 'stallo', motivo: `Negli ultimi 4 interventi (${ultimi[0]!.indice}-${ultimi[3]!.indice}) entrambi hanno dichiarato disaccordo senza cambiare posizione.` };
  }
  if (n >= MAX_INTERVENTI_RIUNIONE) {
    return { esito: 'limite', motivo: `Chiusa al limite di sicurezza di ${MAX_INTERVENTI_RIUNIONE} interventi, senza due dichiarazioni di accordo pieno consecutive.` };
  }
  return null;
}

// Gli incarichi chiesti in un intervento: si tengono quelli con un assistente vero e un compito, nei
// tetti per intervento e per riunione. Gli scarti si dicono (nelle note del motore), non si indovinano.
export function accettaIncarichi(d: Dibattito, r: RispostaTurno, indice: number, agente: Agente, cat: Catalogo): { incarichi: Incarico[]; note: string[] } {
  const incarichi: Incarico[] = [];
  const note: string[] = [];
  const richieste = r.incarichi ?? [];
  if (richieste.length && indice >= MAX_INTERVENTI_RIUNIONE) {
    note.push(`${richieste.length === 1 ? 'Un incarico chiesto' : `${richieste.length} incarichi chiesti`} nell'ultimo intervento: non eseguiti, la riunione si chiude.`);
    return { incarichi, note };
  }
  let gia = incarichiDi(d).length;
  const ora = new Date().toISOString();
  for (const x of richieste) {
    const a = trovaAssistente(cat.assistenti, x.assistente);
    const compito = pulisciCompito(x.compito);
    if (!a) note.push(`Incarico scartato: "${x.assistente}" non è nel catalogo della squadra.`);
    else if (!compito) note.push(`Incarico per ${a.nome} scartato: il compito è vuoto.`);
    else if (incarichi.length >= MAX_INCARICHI_INTERVENTO) note.push(`Incarico per ${a.nome} scartato: al massimo ${MAX_INCARICHI_INTERVENTO} per intervento.`);
    else if (gia >= MAX_INCARICHI_RIUNIONE) note.push(`Incarico per ${a.nome} scartato: gli ${MAX_INCARICHI_RIUNIONE} incarichi della riunione sono finiti.`);
    else {
      incarichi.push({ id: `I${indice}.${incarichi.length + 1}`, assistente: a.id, da: agente, compito, stato: 'attesa', inizio: ora });
      gia++;
    }
  }
  return { incarichi, note };
}

interface Esecuzione {
  controllo: AbortController;
  richiesta?: 'pausa' | 'concludi';
  promessa: Promise<Dibattito>;
  fermoFino?: number; // chat: l'ultimo messaggio dell\'utente al momento dello stop
}

export interface OpzioniMotore {
  cartellaDati?: string;
  chiamaAgente?: ChiamaAgente;
  verificaAccessi?: () => Promise<Accessi>;
  operai?: Operai;
  vault?: string | null; // dove scrivere le note delle decisioni; null = da nessuna parte
  cartellaAgenti?: string | null; // gli agenti dell'utente (~/.claude/agents); null = solo gli standard
  // Un errore che può essere un difetto del programma: per il rapporto d'errore, se l'utente lo vuole.
  segnala?: (e: unknown, dove: 'chat' | 'riunione' | 'produzione') => void;
}

export class Motore extends EventEmitter {
  readonly archivio: Archivio;
  private readonly chiama: ChiamaAgente;
  private readonly verifica: () => Promise<Accessi>;
  private readonly stanza: string;
  private readonly dati: string;
  private readonly operai: Operai;
  private readonly segnala: NonNullable<OpzioniMotore['segnala']>;
  private readonly vault: string | null;
  private readonly agenti: string | null;
  private readonly attivi = new Map<string, Esecuzione>();
  // Il dibattito che corri() sta modificando: le note dell'utente durante l'esecuzione vanno qui,
  // altrimenti il salvataggio successivo del motore le cancellerebbe.
  private readonly inMemoria = new Map<string, Dibattito>();
  private readonly correnti = new Map<string, Corrente>();
  // Le chat rispondono una alla volta (anche se sono più d'una): due CLI per chat in parallelo
  // non servono a niente e consumano il doppio.
  private codaChat: Promise<unknown> = Promise.resolve();
  private accessiChat?: { quando: number; accessi: Accessi };
  // Agenti fermati in chat per un addebito a consumo: non si richiamano finché l'utente non lo chiede.
  private readonly consumoBloccato = new Map<Agente, string>();

  constructor(op: OpzioniMotore = {}) {
    super();
    const dati = op.cartellaDati ?? CARTELLA_DATI;
    this.archivio = creaArchivio(dati);
    this.chiama = op.chiamaAgente ?? chiamaAgenteReale;
    this.verifica = op.verificaAccessi ?? verificaAccessi;
    // Cartella vuota in cui girano le CLI: niente progetto, niente CLAUDE.md o AGENTS.md locali.
    // Fuori dalla cartella del programma: risalendo da qui le CLI non devono trovare i CLAUDE.md o
    // AGENTS.md del repository (sono le regole per chi sviluppa il programma, non per gli agenti).
    this.stanza = join(tmpdir(), 'ambo', createHash('sha256').update(resolve(dati)).digest('hex').slice(0, 12), 'stanza');
    mkdirSync(this.stanza, { recursive: true });
    this.dati = dati;
    this.operai = op.operai ?? operaiReali(this.stanza);
    this.segnala = op.segnala ?? (() => undefined);
    // Le note salvate vere solo per il motore vero: i test (con una cartella dati loro) non le toccano.
    this.vault = op.vault !== undefined ? op.vault : op.cartellaDati ? null : cartellaNoteSalvate();
    // Gli agenti dell'utente (~/.claude/agents) solo con l'ambiente acceso (AMBO_AMBIENTE=1). I test
    // non leggono mai la cartella vera: se vogliono degli agenti, la passano loro.
    this.agenti = op.cartellaAgenti !== undefined ? op.cartellaAgenti : op.cartellaDati || !IMPOSTAZIONI.ambiente ? null : agentiPredefiniti();
  }

  // Chi si può chiamare in una partita: gli standard e, con l'ambiente acceso, gli agenti dell'utente;
  // più le procedure. Si rilegge ogni volta: sono pochi file.
  catalogo(_d?: Dibattito): Catalogo {
    return creaCatalogo(this.dati, this.agenti);
  }

  // Per /api/info: il catalogo con XP e livelli, e le procedure.
  squadra(): { squadra: MembroSquadra[]; procedure: Procedura[] } {
    const c = this.catalogo();
    return { squadra: squadraConStatistiche(this.dati, c.assistenti), procedure: c.procedure };
  }

  crea(config: ConfigInput): Dibattito {
    const ora = new Date().toISOString();
    const cfg = normalizzaConfig(config);
    // Il materiale si legge una volta sola, qui: se la cartella cambia dopo, il dibattito non cambia.
    const dossier = cfg.cartella ? creaDossier(cfg.cartella) : undefined;
    // Partita nata da una chat: le ultime battute, lette adesso come il materiale.
    const origine = cfg.daChat ? this.istantanea(cfg.daChat) : undefined;
    if (cfg.daChat && !eChat(origine)) throw new Error('la chat di partenza non esiste');
    const id = nuovoId();
    // Gli allegati della chat in questo momento diventano della partita: copia e sezione dei prompt.
    const allegati = origine ? passaAllegati(this.dati, origine.id, id) : [];
    const d: Dibattito = {
      id,
      creato: ora,
      aggiornato: ora,
      config: cfg,
      stato: cfg.tipo === 'chat' ? 'aperta' : 'nuovo',
      sessioni: {},
      turni: [],
      interventi: [],
      daConsegnare: { claude: [], codex: [] },
      chiamateFallite: [],
      ...(dossier ? { dossier } : {}),
      ...(cfg.tipo === 'chat' ? { chat: [], letti: {} } : {}),
      ...(origine ? { contestoChat: contestoPerPartita(origine) } : {}),
      ...(allegati.length ? { allegati: { elenco: allegati, testo: allegatiPerPrompt(this.dati, id) } } : {}),
    };
    this.archivio.salva(d);
    // La chat da cui nasce lo sa subito: L'utente vede dov'è finito il compito, gli agenti che esiste.
    if (origine) {
      const dopo = cfg.poiProduzione ? ' Con l\'accordo pieno la decisione va in produzione da sola.' : ' Alla fine la mandi in produzione dalla partita.';
      const conAllegati = allegati.length ? ` Con ${allegati.length === 1 ? 'un allegato' : `${allegati.length} allegati`} della chat.` : '';
      this.notaInChat(origine.id, `Partita avviata: «${titoloPartita(d)}». Claude e Codex preparano il piano in riunione, con la squadra se serve.${conAllegati}${dopo}`, { tipo: 'avviata', partita: d.id, ...(cfg.daProposta ? { proposta: cfg.daProposta } : {}) });
    }
    return d;
  }

  // Il tasto "Avvia" di una scheda compito. Una scheda avvia una partita sola: premuto di nuovo (o
  // ripetuto dalla dashboard) restituisce quella già creata.
  avviaProposta(chatId: string, indice: number): { id: string; gia: boolean } {
    const chat = this.inMemoria.get(chatId) ?? this.archivio.carica(chatId);
    if (!chat || !eChat(chat)) throw new Error('chat non trovata');
    const m = chat.chat?.find((x) => x.indice === indice);
    if (!m?.proposta) throw new Error('in questo messaggio non c\'è una scheda compito');
    const gia = partitaDaProposta(chat, indice);
    if (gia) return { id: gia, gia: true };
    const p = m.proposta;
    const d = this.crea({
      domanda: p.obiettivo, titolo: p.titolo, daChat: chatId, daProposta: indice, poiProduzione: p.dopo === 'produzione',
      modo: 'insieme', memoria: chat.config.memoria, ricercaWeb: chat.config.ricercaWeb,
      claude: chat.config.claude, codex: chat.config.codex, ...(p.cartella ? { cartella: p.cartella } : {}),
    });
    return { id: d.id, gia: false };
  }

  // Il motore scrive in chat un fatto vero. Se la chat sta rispondendo si scrive nella sua copia in
  // memoria (la salva anche il giro in corso); se la usa un altro processo, niente.
  // riepilogo: a fine lavoro chi apre la chat risponde al fatto con il riepilogo (come dopo un messaggio dell'utente).
  private notaInChat(chatId: string, testo: string, evento?: MessaggioChat['evento'], riepilogo = false): void {
    const inMem = this.inMemoria.get(chatId);
    if (!inMem && this.bloccatoAltrove(chatId)) return;
    const chat = inMem ?? this.archivio.carica(chatId);
    if (!chat || !eChat(chat)) return;
    const chi = chat.config.apre ?? 'claude';
    const m: MessaggioChat = { indice: prossimoIndice(chat), autore: 'motore', testo, ora: new Date().toISOString(), ...(evento ? { evento } : {}), ...(riepilogo ? { a: [chi] } : {}) };
    chat.chat!.push(m);
    this.archivio.salva(chat);
    this.emetti(chat, { tipo: 'messaggio', messaggio: m });
    if (riepilogo && !this.attivi.has(chatId)) this.rispondi(chatId);
  }

  // Quello che succede a una partita nata da una chat si racconta in quella chat.
  private raccontaInChat(d: Dibattito, e: Evento): void {
    const chat = d.config.daChat!;
    const base = { partita: d.id, ...(d.config.daProposta ? { proposta: d.config.daProposta } : {}) };
    const t = titoloPartita(d);
    if (e.tipo === 'concluso') {
      const dopo = d.produzione ? ''
        : d.config.poiProduzione && e.esito === 'accordo' ? ' La mando in produzione.'
          : d.config.poiProduzione ? ' Senza accordo pieno la produzione non parte da sola: decidi tu.'
            : '';
      // Se la produzione parte da sola il riepilogo arriva alla sua fine; altrimenti adesso.
      const finito = !d.produzione && !(d.config.poiProduzione && e.esito === 'accordo');
      this.notaInChat(chat, `Partita «${t}» conclusa: ${ESITO_BREVE[e.esito]}${d.verifica ? `, sintesi ${d.verifica.testo.approvata ? 'approvata' : 'con ritocchi'} da ${NOME[d.verifica.revisore]}` : ''}.${dopo}`, { tipo: 'conclusa', ...base }, finito);
    } else if (e.tipo === 'errore' && !eChat(d)) {
      this.notaInChat(chat, `Partita «${t}» ferma per un errore: ${e.messaggio.split('\n')[0]}`, { tipo: 'errore', ...base });
    } else if (e.tipo === 'produzione' && (e.stato === 'pronta' || e.stato === 'errore' || e.stato === 'fermata')) {
      const p = d.produzione!;
      const testo = e.stato === 'pronta'
        ? `Produzione «${t}» pronta: ${p.file.length} file, ${p.collaudo?.approvato ? 'collaudo superato' : `respinta dal collaudo (${p.collaudo?.problemi.length ?? 0} problemi${p.giri?.length ? ` dopo ${p.giri.length + 1} giri` : ''})`}.`
        : e.stato === 'errore' ? `Produzione «${t}» ferma per un errore: ${(p.errore ?? '').split('\n')[0]}` : `Produzione «${t}» fermata.`;
      // Fermata dall'utente: lo sa già, niente riepilogo.
      this.notaInChat(chat, testo, { tipo: 'produzione', ...base }, e.stato !== 'fermata');
    }
  }

  // Per gli agenti in chat: i compiti nati da questa chat e cosa sta lavorando adesso, dal motore.
  statoPerChat(chat: Dibattito): string {
    const tutti = this.archivio.elenco().map((x) => this.istantanea(x.id) ?? x);
    const figli = tutti.filter((x) => x.config.daChat === chat.id).sort((a, b) => a.creato.localeCompare(b.creato)).slice(-6);
    const attivi = new Set(this.idPartiteAttive());
    const righe = figli.map((x) => `- «${titoloPartita(x)}» (avviata alle ${oraBreve(x.creato)}): ${statoAParole(x, attivi.has(x.id))}`);
    if (!figli.length) righe.push('- Da questa chat non è ancora nato nessun compito.');
    for (const x of tutti.filter((y) => attivi.has(y.id) && y.config.daChat !== chat.id)) righe.push(`- Al lavoro adesso, nata altrove: «${titoloPartita(x)}»: ${statoAParole(x, true)}`);
    if (!attivi.size) righe.push('- In questo momento nessuna partita e nessuna produzione sta lavorando.');
    // Le note possono comparire dopo il primo messaggio (una decisione salvata): si ridice ogni volta.
    righe.push(noteAttive(chat.config) ? `- Note dell'utente: attive, strumenti "memoria". ${descriviFonti()}` : "- Note dell'utente: nessuna da consultare.");
    const cartelle = elencoCartelle().map((c) => c.nome);
    righe.push(cartelle.length ? `- Cartelle autorizzate (si possono indicare nella scheda compito): ${cartelle.map((n) => `"${n}"`).join(', ')}.` : '- Cartelle autorizzate: nessuna.');
    return righe.join('\n');
  }

  // Una chat nuova: il titolo è il primo messaggio (o "Nuova chat"), le opzioni come una partita.
  creaChat(input: Omit<ConfigInput, 'domanda' | 'tipo'> & { testo?: string }): Dibattito {
    const { testo, ...resto } = input;
    return this.crea({ ...resto, domanda: titoloChat(testo ?? ''), tipo: 'chat' });
  }

  // L'utente scrive. Il messaggio si salva subito; le risposte arrivano dal flusso degli eventi.
  // a: a chi chiede risposta (di serie quelli della chat, o chi è citato con @nome all'inizio).
  scrivi(id: string, testo: string, op: { a?: Destinatari; voce?: boolean } = {}): MessaggioChat {
    const d = this.inMemoria.get(id) ?? this.archivio.carica(id);
    if (!d || !eChat(d)) throw new Error('chat non trovata');
    if (!this.inMemoria.has(id) && this.bloccatoAltrove(id)) throw new Error('questa chat la sta usando un altro processo');
    const { a, testo: pulito } = destinatari(testo, op.a ?? d.config.chi, d.config.apre);
    if (!pulito) throw new Error('il messaggio è vuoto');
    const m: MessaggioChat = { indice: prossimoIndice(d), autore: 'utente', testo: pulito, ora: new Date().toISOString(), a, ...(op.voce ? { voce: true } : {}) };
    d.chat!.push(m);
    // Il titolo provvisorio diventa il primo messaggio vero.
    if (d.chat!.length === 1 && d.config.domanda === 'Nuova chat') d.config.domanda = titoloChat(pulito);
    // Un errore che si può riprendere sparisce con il messaggio nuovo; uno da crediti a consumo resta.
    if (d.errore?.recuperabile !== false) d.errore = undefined;
    this.archivio.salva(d);
    this.emetti(d, { tipo: 'messaggio', messaggio: m });
    if (!this.attivi.has(id)) this.rispondi(id);
    return m;
  }

  // Dopo un errore o uno stop: rifà rispondere a quello che è rimasto senza risposta. È anche il
  // gesto esplicito dell'utente che toglie il blocco dopo i crediti a consumo.
  riprendiChat(id: string): boolean {
    const d = this.archivio.carica(id);
    if (!d || !eChat(d) || this.attivi.has(id) || this.bloccatoAltrove(id)) return false;
    if (d.saltaFino) {
      // Quello che era stato fermato torna da rispondere: solo l'ultimo messaggio dell'utente conta.
      d.saltaFino = Math.max(0, ultimoDaRispondere(d) - 1);
      this.archivio.salva(d);
    }
    if (!prossimaRisposta(d)) return false;
    this.consumoBloccato.clear();
    d.errore = undefined;
    this.archivio.salva(d);
    this.rispondi(id);
    return true;
  }

  salvaChatComeNota(id: string): string {
    if (!this.vault) throw new Error('nessuna cartella per le note configurata');
    const d = this.istantanea(id);
    if (!d || !eChat(d)) throw new Error('chat non trovata');
    if (!d.chat?.length) throw new Error('la chat è vuota');
    return scriviNotaChat(this.vault, d);
  }

  // Le partite e le produzioni che tengono occupato il motore (le chat no: vanno in parallelo).
  idPartiteAttive(): string[] {
    return this.idAttivi().filter((id) => !eChat(this.istantanea(id)));
  }

  private rispondi(id: string): void {
    const d = this.archivio.carica(id);
    if (!d) return;
    if (!this.archivio.blocca(id)) {
      this.emetti(d, { tipo: 'errore', messaggio: 'questa chat la sta usando un altro processo: nessuno risponde da qui', recuperabile: true });
      return;
    }
    const es = { controllo: new AbortController() } as Esecuzione;
    const prima = this.codaChat;
    let agenteDelGiro: Agente | undefined;
    es.promessa = (async () => {
      this.inMemoria.set(id, d);
      try {
        // In coda dietro un'altra chat è già "in corso": si vede, e "Ferma" la toglie dalla coda.
        this.cambiaStato(d, 'in_corso');
        const fermata = new Promise<never>((_, rifiuta) => es.controllo.signal.addEventListener('abort', () => rifiuta(new Annullato()), { once: true }));
        fermata.catch(() => undefined);
        await Promise.race([prima, fermata]);
        for (let giro = prossimaRisposta(d); giro; giro = prossimaRisposta(d)) {
          agenteDelGiro = giro.agente;
          // Dopo un addebito a consumo quell'agente non riparte finché l'utente non lo chiede ("Fai rispondere").
          const bloccato = this.consumoBloccato.get(giro.agente);
          if (bloccato) throw new ErroreAgente(bloccato, 'consumo', false);
          // Serve solo l'abbonamento di chi risponde adesso.
          const accesso = (await this.accessiPerChat(giro.agente))[giro.agente];
          if (!accesso.ok) throw new ErroreAgente(accesso.dettaglio, 'accesso', true);
          await this.rispostaChat(d, es, giro.agente, giro.fino);
        }
        d.errore = undefined;
        this.cambiaStato(d, 'aperta');
      } catch (e) {
        if (e instanceof Annullato) {
          // Il limite l'ha fissato pausa() al momento dello stop: un messaggio arrivato dopo avrà risposta.
          d.saltaFino = Math.max(d.saltaFino ?? 0, es.fermoFino ?? ultimoDaRispondere(d));
          this.cambiaStato(d, 'aperta');
          this.emetti(d, { tipo: 'avviso', testo: 'Risposte fermate.' });
        } else {
          // Errore: quello che resta senza risposta non riparte da solo.
          d.saltaFino = ultimoDaRispondere(d);
          const err = e instanceof ErroreAgente ? e : new ErroreAgente((e as Error).message, 'altro', true);
          this.segnala(e, 'chat');
          if (err.tipo === 'accesso') this.accessiChat = undefined;
          if (err.tipo === 'consumo' && agenteDelGiro) this.consumoBloccato.set(agenteDelGiro, err.message);
          d.errore = { messaggio: err.message, recuperabile: err.recuperabile, ora: new Date().toISOString() };
          this.cambiaStato(d, 'aperta');
          this.emetti(d, { tipo: 'errore', messaggio: err.message, recuperabile: err.recuperabile });
        }
      } finally {
        this.inMemoria.delete(id);
      }
      return d;
    })().finally(() => {
      this.attivi.delete(id);
      this.archivio.sblocca(id);
      this.emit('libero', id);
      // Messaggi arrivati mentre le risposte si fermavano: hanno diritto alla loro.
      const dopo = this.archivio.carica(id);
      if (dopo && !dopo.errore && prossimaRisposta(dopo)) this.rispondi(id);
    });
    // La coda resta in ordine anche se questa chat esce prima perché fermata.
    this.codaChat = Promise.all([prima, es.promessa]).catch(() => undefined);
    this.attivi.set(id, es);
  }

  private async accessiPerChat(agente: Agente): Promise<Accessi> {
    const c = this.accessiChat;
    if (c && Date.now() - c.quando < ACCESSI_CHAT_MS && c.accessi[agente].ok) return c.accessi;
    const accessi = await this.verifica();
    this.accessiChat = { quando: Date.now(), accessi };
    return accessi;
  }

  private async rispostaChat(d: Dibattito, es: Esecuzione, agente: Agente, fino: number): Promise<void> {
    let vede = 0;
    const indice = prossimoIndice(d);
    this.emetti(d, { tipo: 'turno_inizio', agente, ruolo: 'chat', indice });
    // Le azioni dette dalla CLI mentre risponde restano sul messaggio: chi ha letto cosa, quale skill.
    const azioni: string[] = [];
    const ascolta = (id: string, e: Evento) => {
      if (id === d.id && e.tipo === 'attivita' && e.agente === agente && e.fase === 'strumento' && e.testo && !azioni.includes(e.testo) && azioni.length < 20) azioni.push(e.testo);
    };
    this.on('evento', ascolta);
    let esito: { valore: RispostaChat; chiamata: Chiamata };
    // Gli allegati della chat arrivano all'agente la prima volta e poi solo quando cambiano.
    const firma = firmaAllegati(this.dati, d.id);
    try {
      esito = await this.chiedi(d, es, agente, 'chat', () => {
        const fatto = messaggiChat(d).find((x) => x.indice === fino);
        const lavoro = fatto?.autore === 'motore' && fatto.evento?.partita ? this.istantanea(fatto.evento.partita) : undefined;
        const allegati = firma && (!d.sessioni[agente] || d.allegatiVisti?.[agente] !== firma) ? allegatiPerPrompt(this.dati, d.id, 12_000) : '';
        const p = promptChat(d, agente, fino, this.statoPerChat(d), lavoro ? datiFineLavoro(lavoro, titoloPartita(lavoro)) : undefined, allegati);
        vede = p.vede;
        return p.testo;
      });
    } finally {
      this.off('evento', ascolta);
    }
    const { valore, chiamata } = esito;
    const niente = passa(valore.messaggio);
    // Una scheda compito in fondo alla risposta: esce dal testo e diventa la scheda con "Avvia".
    let { testo, proposta } = niente ? { testo: '', proposta: undefined } : leggiProposta(valore.messaggio);
    if (proposta?.cartella) {
      try {
        trovaCartella(proposta.cartella);
      } catch (e) {
        testo = `${testo}\n\n_(${(e as Error).message}: la scheda parte senza cartella.)_`.trim();
        delete proposta.cartella;
      }
    }
    const m: MessaggioChat = {
      indice: prossimoIndice(d), autore: agente, testo, ora: new Date().toISOString(),
      risponde: fino, ...(niente ? { passa: true } : {}), ...(proposta ? { proposta } : {}), ...(azioni.length ? { azioni } : {}), chiamata,
    };
    d.chat!.push(m);
    d.letti = { ...d.letti, [agente]: vede };
    if (firma) d.allegatiVisti = { ...d.allegatiVisti, [agente]: firma };
    else delete d.allegatiVisti;
    this.archivio.salva(d);
    this.emetti(d, { tipo: 'messaggio', messaggio: m });
  }

  carica(id: string): Dibattito | undefined {
    return this.archivio.carica(id);
  }

  inCorso(id: string): boolean {
    return this.attivi.has(id);
  }

  idAttivi(): string[] {
    return [...this.attivi.keys()];
  }

  // Dibattiti che sta eseguendo un altro processo (la CLI mentre gira il server, o viceversa).
  idBloccatiAltrove(): string[] {
    return this.archivio.elenco().filter((d) => this.archivio.bloccatoDa(d.id) !== null).map((d) => d.id);
  }

  bloccatoAltrove(id: string): boolean {
    return this.archivio.bloccatoDa(id) !== null;
  }

  // Lo stato più fresco: quello in memoria se il dibattito sta girando, se no quello salvato.
  istantanea(id: string): Dibattito | undefined {
    return this.inMemoria.get(id) ?? this.archivio.carica(id);
  }

  // All'avvio del server: un dibattito rimasto "in corso" è stato interrotto da un crash o da
  // una chiusura. Non si rilancia da solo (potrebbe ripartire due volte): va in pausa.
  recuperaInterrotti(): string[] {
    const recuperati: string[] = [];
    for (const d of this.archivio.elenco()) {
      // Quelli che un altro processo sta ancora eseguendo non si toccano. Un "nuovo" senza turni
      // resta com'è: la UI lo tratta già come fermo e lo fa avviare.
      if ((d.stato === 'in_corso' || d.stato === 'sintesi') && !this.attivi.has(d.id) && !this.bloccatoAltrove(d.id)) {
        // Una chat interrotta torna aperta: quello che era senza risposta lo si rifà con "Riprova".
        if (eChat(d)) {
          d.stato = 'aperta';
          d.saltaFino = ultimoDaRispondere(d);
          this.archivio.salva(d);
          recuperati.push(d.id);
          continue;
        }
        d.stato = 'in_pausa';
        // Un incarico rimasto a metà si rifà alla ripresa, prima dell'intervento dopo.
        for (const i of incarichiDi(d)) if (i.stato === 'in_corso') i.stato = 'attesa';
        this.archivio.salva(d);
        recuperati.push(d.id);
      }
      // Una produzione rimasta a metà non riparte da sola: si segna fermata, i file restano nel cantiere.
      const p = d.produzione;
      if (p && (p.stato === 'in_lavorazione' || p.stato === 'collaudo') && !this.attivi.has(d.id) && !this.bloccatoAltrove(d.id)) {
        p.stato = 'fermata';
        p.errore = 'interrotta da una chiusura o da un riavvio del motore';
        p.fine = new Date().toISOString();
        for (const x of p.pacchetti ?? []) if (x.stato === 'in_corso') Object.assign(x, { stato: 'fallito', errore: p.errore, fine: p.fine });
        this.archivio.salva(d);
        recuperati.push(d.id);
      }
    }
    return recuperati;
  }

  // Avvia o riprende. Torna quando il dibattito si ferma: concluso, in pausa o in errore.
  avvia(id: string): Promise<Dibattito> {
    const gia = this.attivi.get(id);
    if (gia) return gia.promessa;
    const d = this.archivio.carica(id);
    if (!d) return Promise.reject(new Error(`dibattito ${id} non trovato`));
    if (d.stato === 'concluso') return Promise.resolve(d);
    if (eChat(d)) return Promise.reject(new Error('una chat non si avvia come una partita'));
    if (!this.archivio.blocca(id)) return Promise.reject(new ErroreAgente(`il dibattito ${id} lo sta già eseguendo un altro processo (la CLI o un altro server)`, 'accesso', true));
    const es = { controllo: new AbortController() } as Esecuzione;
    es.promessa = this.corri(d, es).finally(() => {
      this.attivi.delete(id);
      this.archivio.sblocca(id);
      // Da qui il dibattito non è più "in corso": chi lo mostra (la dashboard) si aggiorna.
      this.emit('libero', id);
      this.forseProduci(id);
    });
    this.attivi.set(id, es);
    return es.promessa;
  }

  // Scheda "piano e poi produzione": con l'accordo pieno la decisione va al magazzino da sola.
  private forseProduci(id: string): void {
    const d = this.archivio.carica(id);
    if (!d?.config.poiProduzione || d.stato !== 'concluso' || d.esito !== 'accordo' || d.produzione) return;
    try {
      void this.produci(id, d.config.cartella ?? null).catch((e: Error) => console.error(e.message));
    } catch (e) {
      if (d.config.daChat) this.notaInChat(d.config.daChat, `Produzione di «${titoloPartita(d)}» non partita: ${(e as Error).message}`, { tipo: 'errore', partita: d.id, ...(d.config.daProposta ? { proposta: d.config.daProposta } : {}) });
    }
  }

  // Manda in produzione la decisione di una partita conclusa. I controlli sono immediati (errore
  // subito a chi chiede), il lavoro va avanti in sottofondo e si ferma con pausa().
  produci(id: string, base: string | null): Promise<Dibattito> {
    if (this.attivi.has(id)) throw new Error('questa partita è già al lavoro');
    const d = this.archivio.carica(id);
    if (!d) throw new Error(`dibattito ${id} non trovato`);
    const no = producibile(d, this.produzioneOrfana(d));
    if (no) throw new Error(no);
    if (base) trovaCartella(base);
    // Le fonti delle note per il server MCP del cantiere e del collaudo, aggiornate adesso.
    scriviFontiNote();
    if (!this.archivio.blocca(id)) throw new ErroreAgente(`il dibattito ${id} lo sta già usando un altro processo (la CLI o un altro server)`, 'accesso', true);
    const es = { controllo: new AbortController() } as Esecuzione;
    const aggiorna = (testo?: string) => {
      this.archivio.salva(d);
      this.emetti(d, { tipo: 'produzione', stato: d.produzione!.stato, ...(testo ? { testo } : {}) });
    };
    es.promessa = (async () => {
      this.inMemoria.set(id, d);
      try {
        const accessi = await this.verifica();
        const mancanti = (['claude', 'codex'] as const).filter((a) => !accessi[a].ok).map((a) => accessi[a].dettaglio);
        // Senza abbonamenti non si parte, e la produzione precedente (se c'era) resta com'è.
        if (mancanti.length) {
          this.emetti(d, { tipo: 'avviso', testo: `Produzione non partita: ${mancanti.join('; ')}` });
          if (d.config.daChat) this.notaInChat(d.config.daChat, `Produzione di «${titoloPartita(d)}» non partita: ${mancanti.join('; ')}`, { tipo: 'errore', partita: d.id, ...(d.config.daProposta ? { proposta: d.config.daProposta } : {}) });
          return d;
        }
        const catalogo = this.catalogo(d);
        if (d.config.daChat) {
          const { pacchetti } = pacchettiDaFare(d, catalogo);
          const chi = [...new Set(pacchetti.map((x) => nomeAssistente(catalogo.assistenti, x.assistente)))].join(', ');
          this.notaInChat(d.config.daChat, `Produzione di «${titoloPartita(d)}» avviata: ${pacchetti.length > 1 ? `${pacchetti.length} pacchetti (${chi})` : chi} nel cantiere${base ? ` partendo da una copia di "${base}"` : ', una cartella vuota'}, poi il collaudo. Se il collaudo trova problemi si corregge e si ricontrolla, al massimo ${MAX_CORREZIONI_PRODUZIONE} volte.`, { tipo: 'produzione', partita: d.id, ...(d.config.daProposta ? { proposta: d.config.daProposta } : {}) });
        }
        await lavora(d, {
          dati: this.dati, base, operai: this.operai, signal: es.controllo.signal, aggiorna, catalogo,
          attivita: (assistente, testo) => this.emetti(d, { tipo: 'attivita_assistente', assistente, fase: 'strumento', testo, strumento: 'file' }),
          segnala: (e) => this.segnala(e, 'produzione'),
        });
        this.archivio.salvaMarkdown(d.id, inMarkdown(d));
        return d;
      } finally {
        this.inMemoria.delete(id);
      }
    })().finally(() => {
      this.attivi.delete(id);
      this.archivio.sblocca(id);
      this.emit('libero', id);
    });
    this.attivi.set(id, es);
    return es.promessa;
  }

  // In lavorazione sul disco, ma nessun processo la sta facendo.
  produzioneOrfana(d: Dibattito): boolean {
    const p = d.produzione;
    return !!p && (p.stato === 'in_lavorazione' || p.stato === 'collaudo') && !this.attivi.has(d.id) && !this.bloccatoAltrove(d.id);
  }

  pausa(id: string): boolean {
    const es = this.attivi.get(id);
    if (!es) return false;
    es.richiesta = 'pausa';
    // In chat lo stop vale per quello che c'era fino a qui, non per un messaggio scritto subito dopo.
    const d = this.inMemoria.get(id);
    if (eChat(d)) es.fermoFino = ultimoDaRispondere(d!);
    es.controllo.abort();
    return true;
  }

  // Chiude senza aspettare l'accordo e passa alla sintesi. Su un dibattito fermo lo riavvia.
  concludi(id: string): boolean {
    const es = this.attivi.get(id);
    if (es) {
      if (this.inMemoria.get(id)?.esito) return false;
      es.richiesta = 'concludi';
      es.controllo.abort();
      return true;
    }
    const d = this.archivio.carica(id);
    if (!d || eChat(d) || d.stato === 'concluso' || this.bloccatoAltrove(id)) return false;
    if (!d.esito) this.chiudiDaUtente(d);
    // Dopo un errore che non si può riprendere (crediti a consumo, strumenti, accesso) non si
    // richiamano gli agenti: si chiude con quello che c'è.
    if (d.stato === 'errore' && d.errore && !d.errore.recuperabile) {
      d.motivoEsito = `${d.motivoEsito ?? ''} Chiuso dopo un errore che non si poteva riprendere: ${d.errore.messaggio.split('\n')[0]}`.trim();
      this.cambiaStato(d, 'concluso');
      this.archivio.salvaMarkdown(d.id, inMarkdown(d));
      this.emetti(d, { tipo: 'concluso', esito: d.esito!, motivo: d.motivoEsito, approvata: d.verifica?.testo.approvata ?? null });
      return true;
    }
    this.archivio.salva(d);
    this.avvia(id).catch(() => undefined);
    return true;
  }

  // La nota arriva a tutti e due, ognuno al suo prossimo turno.
  intervieni(id: string, testo: string): boolean {
    const t = testo.trim();
    if (!t) return false;
    const d = this.inMemoria.get(id) ?? this.archivio.carica(id);
    if (!d || eChat(d) || (!this.inMemoria.has(id) && this.bloccatoAltrove(id))) return false;
    // A riunione finita la nota serve solo se la produzione sta lavorando: la legge il prossimo
    // assistente che parte (pacchetto, correzione o collaudo).
    if (d.stato === 'concluso' || d.esito) {
      const p = d.produzione;
      if (!p || (p.stato !== 'in_lavorazione' && p.stato !== 'collaudo')) return false;
      d.interventi.push({ ora: new Date().toISOString(), testo: t });
      this.archivio.salva(d);
      this.emetti(d, { tipo: 'intervento', testo: t });
      return true;
    }
    d.interventi.push({ ora: new Date().toISOString(), testo: t });
    d.daConsegnare.claude.push(t);
    d.daConsegnare.codex.push(t);
    this.archivio.salva(d);
    this.emetti(d, { tipo: 'intervento', testo: t });
    return true;
  }

  esportaMarkdown(id: string): string {
    const d = this.archivio.carica(id);
    if (!d) throw new Error(`dibattito ${id} non trovato`);
    return this.archivio.salvaMarkdown(id, inMarkdown(d));
  }

  corrente(id: string): Corrente | undefined {
    return this.correnti.get(id);
  }

  private emetti(d: Dibattito, e: Evento): void {
    // Il testo dal vivo della risposta resta anche mentre si usa uno strumento; quello dello strumento va a parte.
    const vivo = (c: Corrente, fase: Fase, testo: string | undefined, strumento: Strumento | undefined) => {
      c.fase = fase;
      if (fase === 'strumento') {
        c.strumento = strumento;
        c.azione = testo;
      } else {
        c.strumento = undefined;
        c.azione = undefined;
        if (testo !== undefined) c.testo = testo;
      }
    };
    if (e.tipo === 'turno_inizio') {
      this.correnti.set(d.id, { agente: e.agente, ruolo: e.ruolo, indice: e.indice, inizio: Date.now(), fase: 'ragionamento', testo: '' });
    } else if (e.tipo === 'attivita') {
      const c = this.correnti.get(d.id);
      if (c?.agente === e.agente && !c.assistente) vivo(c, e.fase, e.testo, e.strumento);
    } else if (e.tipo === 'incarico') {
      // Mentre un assistente lavora a un incarico, "chi lavora adesso" è lui (con la CLI del suo motore).
      const c = this.correnti.get(d.id);
      if (e.incarico.stato === 'in_corso') {
        const a = this.catalogo(d).assistenti.find((x) => x.id === e.incarico.assistente);
        this.correnti.set(d.id, { agente: a?.motore ?? 'claude', ruolo: 'incarico', indice: e.turno, inizio: Date.now(), fase: 'ragionamento', testo: '', assistente: e.incarico.assistente });
      } else if (c?.assistente === e.incarico.assistente) {
        this.correnti.delete(d.id);
      }
    } else if (e.tipo === 'attivita_assistente') {
      const c = this.correnti.get(d.id);
      if (c?.assistente === e.assistente) vivo(c, e.fase, e.testo, e.strumento);
    } else if (
      e.tipo === 'turno' || e.tipo === 'concluso' || e.tipo === 'errore' || (e.tipo === 'messaggio' && e.messaggio.autore !== 'utente' && e.messaggio.autore !== 'motore')
      || (e.tipo === 'stato' && e.stato !== 'in_corso' && e.stato !== 'sintesi')
    ) {
      this.correnti.delete(d.id);
    }
    this.emit('evento', d.id, e);
    if (d.config.daChat) this.raccontaInChat(d, e);
    // Le note salvate come memoria: la decisione (e poi la sua produzione) diventa una nota markdown.
    if (this.vault && (e.tipo === 'concluso' || (e.tipo === 'produzione' && (e.stato === 'pronta' || e.stato === 'errore' || e.stato === 'fermata')))) scriviNota(this.vault, d);
  }

  private cambiaStato(d: Dibattito, stato: StatoDibattito): void {
    d.stato = stato;
    this.archivio.salva(d);
    this.emetti(d, { tipo: 'stato', stato });
  }

  // Gli incarichi che non sono ancora partiti restano annullati: la riunione non li aspetta.
  private chiudiDaUtente(d: Dibattito): void {
    d.esito = 'chiuso_da_utente';
    d.motivoEsito = `Riunione chiusa dall\'utente dopo ${d.turni.length} interventi.`;
    for (const t of d.turni) {
      for (const i of t.incarichi ?? []) {
        if (i.stato !== 'attesa' && i.stato !== 'in_corso') continue;
        i.stato = 'annullato';
        i.fine = new Date().toISOString();
        this.emetti(d, { tipo: 'incarico', turno: t.indice, incarico: { ...i } });
      }
    }
  }

  private async corri(d: Dibattito, es: Esecuzione): Promise<Dibattito> {
    this.inMemoria.set(d.id, d);
    try {
      d.errore = undefined;
      const accessi = await this.verifica();
      const mancanti = (['claude', 'codex'] as const).filter((a) => !accessi[a].ok).map((a) => accessi[a].dettaglio);
      if (mancanti.length) throw new ErroreAgente(mancanti.join('; '), 'accesso', true);
      this.emetti(d, { tipo: 'avviso', testo: `Accessi verificati: Claude con ${accessi.claude.dettaglio}, Codex con ${accessi.codex.dettaglio}.` });

      for (;;) {
        try {
          await this.fasi(d, es);
          return d;
        } catch (e) {
          if (!(e instanceof Annullato)) throw e;
          if (es.richiesta === 'concludi' && !d.esito) {
            this.chiudiDaUtente(d);
            es.richiesta = undefined;
            es.controllo = new AbortController();
            continue;
          }
          this.cambiaStato(d, 'in_pausa');
          return d;
        }
      }
    } catch (e) {
      const err = e instanceof ErroreAgente ? e : new ErroreAgente((e as Error).message, 'altro', false);
      this.segnala(e, 'riunione');
      d.errore = { messaggio: err.message, recuperabile: err.recuperabile, ora: new Date().toISOString() };
      this.cambiaStato(d, 'errore');
      this.emetti(d, { tipo: 'errore', messaggio: err.message, recuperabile: err.recuperabile });
      return d;
    } finally {
      this.inMemoria.delete(d.id);
    }
  }

  private async fasi(d: Dibattito, es: Esecuzione): Promise<void> {
    if (!d.esito) {
      this.cambiaStato(d, 'in_corso');
      // Prima gli incarichi dell'ultimo intervento (anche quelli rimasti a metà per una pausa),
      // poi si guarda se la riunione è finita, poi parla l'altro.
      while (!d.esito) {
        await this.incarichi(d, es);
        const fine = valuta(d);
        if (fine) {
          d.esito = fine.esito;
          d.motivoEsito = fine.motivo;
          break;
        }
        await this.turno(d, es);
      }
      this.archivio.salva(d);
    }

    if (d.turni.length && (!d.sintesi || !d.verifica)) {
      this.cambiaStato(d, 'sintesi');
      const relatore = d.config.relatore;
      const revisore = altro(relatore);
      const catalogo = this.catalogo(d);
      if (!d.sintesi) {
        this.emetti(d, { tipo: 'turno_inizio', agente: relatore, ruolo: 'sintesi', indice: d.turni.length + 1 });
        // Note arrivate quando la riunione si stava chiudendo: le riceve chi scrive la sintesi.
        const note = d.daConsegnare[relatore];
        const { valore, chiamata } = await this.chiedi(d, es, relatore, 'sintesi', () => promptSintesi(d, relatore, catalogo, note));
        d.daConsegnare[relatore] = [];
        // Pacchetti e procedura si tengono solo se il catalogo li conosce: gli scarti si dicono.
        const { pacchetti, note: scarti } = normalizzaPacchetti(valore.pacchetti ?? [], catalogo.assistenti);
        const { procedura, nota } = normalizzaProcedura(valore.procedura, catalogo);
        valore.pacchetti = pacchetti;
        valore.procedura = procedura;
        for (const x of [...scarti, ...(nota ? [nota] : [])]) this.emetti(d, { tipo: 'avviso', testo: x });
        d.sintesi = { relatore, testo: valore, chiamata };
        this.archivio.salva(d);
      }
      if (!d.verifica) {
        this.emetti(d, { tipo: 'turno_inizio', agente: revisore, ruolo: 'verifica', indice: d.turni.length + 2 });
        const note = d.daConsegnare[revisore];
        const sintesi = d.sintesi.testo;
        const { valore, chiamata } = await this.chiedi(d, es, revisore, 'verifica', () => promptVerifica(d, revisore, sintesi, catalogo, note));
        d.daConsegnare[revisore] = [];
        d.verifica = { revisore, testo: valore, chiamata };
        this.archivio.salva(d);
      }
    }

    this.cambiaStato(d, 'concluso');
    this.archivio.salvaMarkdown(d.id, inMarkdown(d));
    this.emetti(d, { tipo: 'concluso', esito: d.esito!, motivo: d.motivoEsito ?? '', approvata: d.verifica?.testo.approvata ?? null });
  }

  // Un intervento di un capo reparto. Gli incarichi che chiede si registrano qui, in attesa: li
  // esegue il giro dopo in fasi(), così una pausa a metà non li perde.
  private async turno(d: Dibattito, es: Esecuzione): Promise<void> {
    const precedente = d.turni.at(-1);
    const agente = precedente ? altro(precedente.agente) : d.config.apre;
    const indice = d.turni.length + 1;
    const consegnate = d.daConsegnare[agente].length;
    const interventi = d.daConsegnare[agente].slice(0, consegnate);
    const catalogo = this.catalogo(d);

    this.emetti(d, { tipo: 'turno_inizio', agente, ruolo: 'turno', indice });
    const { valore, chiamata } = await this.chiedi(d, es, agente, 'turno', () => promptTurno(d, agente, catalogo), { indice });
    const note = normalizza(valore, indice);
    const { incarichi, note: scarti } = accettaIncarichi(d, valore, indice, agente, catalogo);
    note.push(...scarti);
    const t: Turno = { indice, agente, risposta: valore, note, interventi, chiamata, ora: new Date().toISOString(), ...(incarichi.length ? { incarichi } : {}) };
    d.turni.push(t);
    // Le note arrivate mentre l'agente rispondeva restano per il suo turno successivo.
    d.daConsegnare[agente] = d.daConsegnare[agente].slice(consegnate);
    d.turnoInterrotto = undefined;
    this.archivio.salva(d);
    for (const x of scarti) this.emetti(d, { tipo: 'avviso', testo: x });
    this.emetti(d, { tipo: 'turno', turno: t });
  }

  // Gli incarichi dell'ultimo intervento ancora da fare, uno alla volta e in ordine.
  private async incarichi(d: Dibattito, es: Esecuzione): Promise<void> {
    const t = d.turni.at(-1);
    if (!t) return;
    for (const i of t.incarichi ?? []) {
      if (i.stato === 'attesa' || i.stato === 'in_corso') await this.incarico(d, es, t, i);
    }
  }

  // Un incarico: l'assistente lavora in sola lettura con la CLI del suo motore, in una sessione nuova.
  // Se fallisce la riunione va avanti (i capi ricevono l'errore al posto del rapporto); si ferma
  // tutto solo per gli errori che non si possono riprendere (crediti a consumo, strumenti vietati,
  // server non previsti), come per i capi reparto.
  private async incarico(d: Dibattito, es: Esecuzione, t: Turno, i: Incarico): Promise<void> {
    const a = this.catalogo(d).assistenti.find((x) => x.id === i.assistente);
    const emetti = () => this.emetti(d, { tipo: 'incarico', turno: t.indice, incarico: { ...i } });
    const fallito = (messaggio: string) => {
      i.stato = 'fallito';
      i.errore = messaggio;
      i.fine = new Date().toISOString();
      contaLavoro(this.dati, [{ assistente: i.assistente, incarichi: 1, falliti: 1 }]);
      this.archivio.salva(d);
      emetti();
    };
    if (!a) {
      // Un agente dell'utente tolto dal disco tra l'intervento e l'incarico.
      fallito(`"${i.assistente}" non è più nel catalogo della squadra`);
      return;
    }
    i.stato = 'in_corso';
    i.inizio = new Date().toISOString();
    this.archivio.salva(d);
    emetti();
    try {
      const { valore, chiamata } = await this.chiedi(d, es, a.motore, 'incarico', () => promptIncarico(d, i, a), { assistente: a.id, sistema: sistemaAssistente(a) });
      i.stato = 'fatto';
      i.rapporto = taglia(valore.messaggio, MAX_RAPPORTO);
      i.chiamata = chiamata;
      i.xp = XP.rapporto;
      i.fine = new Date().toISOString();
      delete i.errore;
      contaLavoro(this.dati, [{ assistente: a.id, xp: XP.rapporto, incarichi: 1, completati: 1 }]);
      this.archivio.salva(d);
      emetti();
    } catch (e) {
      if (e instanceof Annullato) {
        // Pausa (o chiusura): l'incarico torna in attesa e si rifà alla ripresa.
        i.stato = 'attesa';
        this.archivio.salva(d);
        emetti();
        throw e;
      }
      const err = e instanceof ErroreAgente ? e : new ErroreAgente((e as Error).message, 'altro', true);
      const riga = err.message.split('\n')[0]!;
      fallito(riga);
      if (!err.recuperabile) throw err;
      this.emetti(d, { tipo: 'avviso', testo: `${a.nome}: incarico ${i.id} non riuscito (${riga}). La riunione continua.` });
    }
  }

  // Una chiamata all'agente, con le correzioni di formato e un nuovo tentativo sugli errori generici.
  // Con op.assistente lavora un assistente: mai una sessione dei capi, attività per conto suo.
  private async chiedi<T extends TipoRisposta>(
    d: Dibattito, es: Esecuzione, agente: Agente, tipo: T, prompt: () => string, op: { indice?: number; assistente?: string; sistema?: string } = {},
  ): Promise<{ valore: Valori[T]; chiamata: Chiamata }> {
    const indice = op.indice ?? 0;
    const chi = op.assistente;
    const nome = chi ? nomeAssistente(undefined, chi) : NOME[agente];
    let testoPrompt = prompt();
    let sessioneRifatta = false;
    let prosa: string | undefined;
    let tentativi = 0;
    let correzioni = 0;
    let fallimenti = 0;
    const totale = { secondi: 0, ingresso: 0, inCache: 0, uscita: 0 };

    for (;;) {
      tentativi++;
      let r: EsitoCli;
      try {
        r = await this.chiama({
          agente, tipo, prompt: testoPrompt, sessione: chi ? undefined : d.sessioni[agente], config: d.config, cartella: this.stanza,
          signal: es.controllo.signal,
          ...(chi ? { assistente: chi, sistema: op.sistema } : {}),
          suAttivita: chi
            ? (fase, testo, strumento) => this.emetti(d, { tipo: 'attivita_assistente', assistente: chi, fase, testo, ...(strumento ? { strumento } : {}) })
            : (fase, testo, strumento) => this.emetti(d, { tipo: 'attivita', agente, fase, testo, ...(strumento ? { strumento } : {}) }),
        });
      } catch (e) {
        if (e instanceof Annullato) {
          if (indice && !chi && d.sessioni[agente]) d.turnoInterrotto = { indice, agente };
          throw e;
        }
        const err = e instanceof ErroreAgente ? e : new ErroreAgente((e as Error).message, 'altro', true);
        d.chiamateFallite.push({ ora: new Date().toISOString(), agente, errore: chi ? `${nome}: ${err.message}` : err.message });
        this.archivio.salva(d);
        // La CLI non trova più la sessione (cancellata dopo 30 giorni, o rovinata): se ne apre una
        // nuova e il prompt, senza sessione, riporta tutta la discussione.
        if (err.tipo === 'sessione' && !sessioneRifatta && !chi) {
          sessioneRifatta = true;
          delete d.sessioni[agente];
          this.archivio.salva(d);
          testoPrompt = prompt();
          this.emetti(d, { tipo: 'avviso', testo: `${NOME[agente]}: la sessione precedente non c'è più, ne apro una nuova con tutta la discussione.` });
          continue;
        }
        if (err.tipo === 'altro' && ++fallimenti < 2) {
          this.emetti(d, { tipo: 'avviso', testo: `${err.message.split('\n')[0]}: riprovo una volta.` });
          continue;
        }
        throw err;
      }

      // La sessione di un assistente non si tiene: il prossimo incarico riparte da zero.
      if (!chi) d.sessioni[agente] = r.sessione;
      totale.secondi += r.secondi;
      totale.ingresso += r.uso.ingresso;
      totale.inCache += r.uso.inCache;
      totale.uscita += r.uso.uscita;
      this.archivio.salva(d);

      try {
        const valore = leggiRisposta(tipo, agente, r.testo, prosa);
        const chiamata: Chiamata = {
          agente, modello: r.modello, sessione: r.sessione, secondi: Math.round(totale.secondi * 10) / 10,
          uso: { ingresso: totale.ingresso, inCache: totale.inCache, uscita: totale.uscita },
          controllo: r.controllo, tentativi, ...(chi ? { assistente: chi } : {}),
        };
        return { valore: valore as Valori[T], chiamata };
      } catch (e) {
        if (!(e instanceof ErroreFormato)) throw e;
        if (correzioni >= MAX_CORREZIONI) throw new ErroreAgente(`${nome}: risposta ancora non valida dopo ${MAX_CORREZIONI} correzioni (${e.message})`, 'formato', true);
        correzioni++;
        const soloBlocco = tipo === 'turno' && agente === 'claude' && !!e.prosa;
        prosa = soloBlocco ? e.prosa : undefined;
        // Un assistente non ha una sessione da correggere: riceve di nuovo l'incarico intero.
        testoPrompt = chi ? prompt() : promptCorrezione(e.message, soloBlocco);
        this.emetti(d, { tipo: 'avviso', testo: `${nome}: formato non valido (${e.message}), chiedo la correzione.` });
      }
    }
  }
}
