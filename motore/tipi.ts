// Tipi condivisi tra motore, CLI e dashboard.

export type Agente = 'claude' | 'codex';
export const AGENTI: readonly Agente[] = ['claude', 'codex'];
export const altro = (a: Agente): Agente => (a === 'claude' ? 'codex' : 'claude');
export const NOME: Record<Agente, string> = { claude: 'Claude', codex: 'Codex' };

// "proposta" vale solo per il primo intervento: il motore la corregge negli altri.
export type StatoDichiarato = 'proposta' | 'accordo' | 'accordo_parziale' | 'disaccordo';

export interface RispostaTurno {
  messaggio: string;
  stato: StatoDichiarato;
  posizione: string;
  punti_aperti: string[];
  cambi_di_posizione: string[];
}

export interface Sintesi {
  conclusione: string;
  motivazioni: string[];
  decisioni: string[];
  disaccordi: { punto: string; posizione_claude: string; posizione_codex: string }[];
  prossimi_passi: string[];
}

export interface Verifica {
  approvata: boolean;
  correzioni: string[];
  disaccordi_mancanti: string[];
  commento: string;
}

export type TipoRisposta = 'turno' | 'sintesi' | 'verifica' | 'chat';

export interface Uso {
  ingresso: number;
  inCache: number;
  uscita: number;
}

// Dati tecnici di un'esecuzione vera di una CLI: servono a dimostrare che il turno è autentico
// e che è passato dall'abbonamento.
export interface Chiamata {
  agente: Agente;
  modello: string;
  sessione: string;
  secondi: number;
  uso: Uso;
  controllo: string;
  tentativi: number;
}

export interface Turno {
  indice: number;
  round: number;
  agente: Agente;
  risposta: RispostaTurno;
  note: string[];
  interventi: string[];
  chiamata: Chiamata;
  ora: string;
}

export type Esito = 'accordo' | 'stallo' | 'limite_round' | 'chiuso_da_utente';
// aperta: una chat ferma che aspetta l'utente (le partite non ci passano mai).
export type StatoDibattito = 'nuovo' | 'in_corso' | 'in_pausa' | 'sintesi' | 'concluso' | 'errore' | 'aperta';

export interface Config {
  domanda: string;
  maxRound: number;
  apre: Agente;
  relatore: Agente;
  claude: { modello: string; ragionamento?: string };
  codex: { modello?: string; ragionamento: string };
  ricercaWeb: boolean;
  stallo: boolean;
  timeoutTurnoS: number;
  cartella?: string; // nome di una cartella autorizzata dall\'utente: gli agenti ne leggono una copia
  memoria?: boolean; // le note dell'utente (profilo, note, note salvate) in sola lettura
  // insieme: lavorano verso l'obiettivo dell'utente e si completano; confronto: valutazione critica tra alternative
  modo?: ModoLavoro;
  // Una chat con l'utente invece di una partita a turni: chi risponde di serie ai suoi messaggi.
  tipo?: 'chat';
  chi?: Destinatari;
  daChat?: string; // la partita nasce da questa chat: il suo contesto va agli agenti
  titolo?: string; // nome breve da mostrare, se la domanda è lunga (scheda compito)
  daProposta?: number; // il messaggio della chat con la scheda che l'ha avviata
  poiProduzione?: boolean; // con l'accordo pieno la decisione va in produzione da sola
}

export type ModoLavoro = 'insieme' | 'confronto';
export type Destinatari = 'entrambi' | Agente;

// Quello che arriva da CLI o dashboard: tutto facoltativo tranne la domanda.
export interface ConfigInput {
  domanda: string;
  maxRound?: number;
  apre?: Agente;
  relatore?: Agente;
  claude?: { modello?: string; ragionamento?: string };
  codex?: { modello?: string; ragionamento?: string };
  ricercaWeb?: boolean;
  stallo?: boolean;
  timeoutTurnoS?: number;
  cartella?: string;
  memoria?: boolean;
  modo?: ModoLavoro;
  tipo?: 'chat';
  chi?: Destinatari;
  daChat?: string;
  titolo?: string;
  daProposta?: number;
  poiProduzione?: boolean;
}

// Il materiale di una cartella autorizzata, letto una volta alla creazione del dibattito.
// Alla dashboard passa solo l'elenco dei file, non il testo.
export interface Dossier {
  cartella: string;
  file: { percorso: string; caratteri: number }[];
  omessi: number; // file adatti rimasti fuori per il limite di dimensione
  rimossi: number; // possibili segreti cancellati dal testo
  caratteri: number;
  testo: string;
  delimitatore?: string; // casuale per dibattito: chiude il materiale senza che un file possa imitarlo
}

export type StatoProduzione = 'in_lavorazione' | 'collaudo' | 'pronta' | 'fermata' | 'errore';

export interface Collaudo {
  approvato: boolean;
  problemi: string[];
  commento: string;
}

// Il magazzino: la decisione presa in sala diventa un lavoro. Claude costruisce in una cartella
// tutta sua (il cantiere), Codex collauda leggendo quello che ha fatto.
export interface Produzione {
  stato: StatoProduzione;
  base: string | null; // cartella autorizzata copiata nel cantiere, o null se si parte da zero
  cantiere: string;
  inizio: string;
  fine?: string;
  file: { percorso: string; caratteri: number; anteprima?: string }[];
  resoconto?: string;
  collaudo?: Collaudo; // l'ultimo
  // Il giro di lavoro: 1 la costruzione, poi una correzione per ogni collaudo non superato.
  giro?: number;
  giri?: { giro: number; resoconto: string; collaudo: Collaudo }[]; // i collaudi dei giri precedenti
  chiamate: Chiamata[];
  errore?: string;
}

// La scheda di un compito che un agente propone in chat: L'utente la avvia con un tocco.
export interface PropostaCompito {
  titolo: string;
  obiettivo: string;
  dopo: 'piano' | 'produzione'; // solo la partita, o anche la produzione se c'è l'accordo
  cartella?: string; // cartella autorizzata da dare come materiale e come base del cantiere
}

export type AutoreChat = Agente | 'utente' | 'motore';
export const nomeAutore = (a: AutoreChat): string => (a === 'utente' ? 'Utente' : a === 'motore' ? 'Motore' : NOME[a]);

// Un messaggio della chat. Le risposte degli agenti dicono fino a quale messaggio dell'utente
// rispondono (risponde) e portano i dati della chiamata come i turni. Il motore scrive in chat
// i fatti veri (compito avviato, partita finita, produzione pronta): agenti e l'utente li vedono.
export interface MessaggioChat {
  indice: number;
  autore: AutoreChat;
  testo: string;
  ora: string;
  a?: Agente[]; // a chi chiede risposta l\'utente
  voce?: boolean; // dettato a voce
  risponde?: number;
  passa?: boolean; // l'agente non aveva niente da aggiungere a quanto già detto
  chiamata?: Chiamata;
  azioni?: string[]; // cosa ha fatto mentre rispondeva (note lette, ricerche, skill), dagli eventi della CLI
  proposta?: PropostaCompito;
  // Solo per il motore: di quale partita parla e, se l'ha avviata una scheda, quale.
  evento?: { tipo: 'avviata' | 'conclusa' | 'produzione' | 'errore'; partita: string; proposta?: number };
}

export interface Dibattito {
  id: string;
  creato: string;
  aggiornato: string;
  config: Config;
  stato: StatoDibattito;
  sessioni: Partial<Record<Agente, string>>;
  turni: Turno[];
  interventi: { ora: string; testo: string }[];
  // Note dell'utente non ancora consegnate: ognuno dei due le riceve al suo turno successivo.
  daConsegnare: Record<Agente, string[]>;
  // Turno fermato a metà: la sessione dell'agente contiene già la domanda senza risposta.
  turnoInterrotto?: { indice: number; agente: Agente };
  esito?: Esito;
  motivoEsito?: string;
  sintesi?: { relatore: Agente; testo: Sintesi; chiamata: Chiamata };
  verifica?: { revisore: Agente; testo: Verifica; chiamata: Chiamata };
  errore?: { messaggio: string; recuperabile: boolean; ora: string };
  chiamateFallite: { ora: string; agente: Agente; errore: string }[];
  dossier?: Dossier;
  produzione?: Produzione;
  // Solo per le chat.
  chat?: MessaggioChat[];
  letti?: Partial<Record<Agente, number>>; // l'ultimo messaggio che ogni agente ha già ricevuto
  saltaFino?: number; // l\'utente ha fermato le risposte: i suoi messaggi fino a qui restano senza
  // Partita nata da una chat: le ultime battute, lette alla creazione (restano sul PC).
  contestoChat?: { id: string; testo: string; delimitatore?: string };
}

export type Fase = 'attesa' | 'ragionamento' | 'risposta' | 'strumento';
export type Ruolo = 'turno' | 'sintesi' | 'verifica' | 'chat';
// Che cosa sta usando l'agente quando la fase è "strumento": serve alla scena e al testo dal vivo.
export type Strumento = 'vault' | 'web' | 'skill' | 'file';

// Chi sta lavorando adesso: va nell'istantanea, così chi apre la pagina a metà turno lo vede.
export interface Corrente {
  agente: Agente;
  ruolo: Ruolo;
  indice: number;
  round: number;
  inizio: number;
  fase: Fase;
  testo: string;
  strumento?: Strumento;
  azione?: string; // cosa sta facendo con lo strumento, a parole
}

export type Evento =
  | { tipo: 'stato'; stato: StatoDibattito }
  | { tipo: 'turno_inizio'; agente: Agente; ruolo: Ruolo; indice: number; round: number }
  | { tipo: 'attivita'; agente: Agente; fase: Fase; testo?: string; strumento?: Strumento }
  | { tipo: 'turno'; turno: Turno }
  | { tipo: 'intervento'; testo: string }
  | { tipo: 'avviso'; testo: string }
  | { tipo: 'errore'; messaggio: string; recuperabile: boolean }
  | { tipo: 'concluso'; esito: Esito; motivo: string; approvata: boolean | null }
  | { tipo: 'produzione'; stato: StatoProduzione; testo?: string }
  | { tipo: 'messaggio'; messaggio: MessaggioChat };
