// Tipi condivisi tra motore, CLI e dashboard.

export type Agente = 'claude' | 'codex';
export const AGENTI: readonly Agente[] = ['claude', 'codex'];
export const altro = (a: Agente): Agente => (a === 'claude' ? 'codex' : 'claude');
export const NOME: Record<Agente, string> = { claude: 'Claude', codex: 'Codex' };

// "proposta" vale solo per il primo intervento: il motore la corregge negli altri.
export type StatoDichiarato = 'proposta' | 'accordo' | 'accordo_parziale' | 'disaccordo';

// Un capo reparto chiede un lavoro a un assistente della squadra: il motore decide se eseguirlo.
export interface RichiestaIncarico {
  assistente: string;
  compito: string;
}

export interface RispostaTurno {
  messaggio: string;
  stato: StatoDichiarato;
  posizione: string;
  punti_aperti: string[];
  cambi_di_posizione: string[];
  incarichi?: RichiestaIncarico[]; // manca nelle partite salvate prima della riunione
}

// Un pacchetto di lavoro per la produzione, deciso nella sintesi: lo costruisce un assistente.
export interface PacchettoPiano {
  titolo: string;
  assistente: string;
  obiettivo: string;
}

export interface Sintesi {
  conclusione: string;
  motivazioni: string[];
  decisioni: string[];
  disaccordi: { punto: string; posizione_claude: string; posizione_codex: string }[];
  prossimi_passi: string[];
  pacchetti?: PacchettoPiano[]; // manca nelle sintesi scritte prima della squadra
  procedura?: string; // l'id della procedura scelta, o "su-misura"; manca nelle sintesi di prima
}

export interface Verifica {
  approvata: boolean;
  correzioni: string[];
  disaccordi_mancanti: string[];
  commento: string;
}

export type TipoRisposta = 'turno' | 'sintesi' | 'verifica' | 'chat' | 'incarico';

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
  assistente?: string; // la chiamata l'ha fatta un assistente della squadra (con la CLI di agente)
}

// --- la squadra ---------------------------------------------------------------------------
// Assistenti lanciati dal motore, ognuno con un processo CLI suo e gli stessi controlli dei capi
// reparto. Il catalogo (motore/squadra.ts) è fatto dai 7 standard più, con l'ambiente acceso, gli
// agenti dell'utente in ~/.claude/agents. Le statistiche stanno in dati/squadra.json, per id.

export interface SkillAssistente {
  nome: string;
  descrizione: string;
}

export interface Assistente {
  id: string;
  nome: string;
  ruolo: string;
  motore: Agente; // la CLI con cui lavora
  produzione: boolean; // costruisce pacchetti nel cantiere (solo con Claude)
  descrizione: string;
  skill: SkillAssistente[];
  fonte: 'standard' | 'utente'; // utente: un agente di ~/.claude/agents (strumenti sempre quelli del motore)
}

// Una procedura (un workflow): i passi con l'assistente di ognuno. piano: incarico in riunione;
// produzione: pacchetto nel cantiere; collaudo: revisione in sola lettura dopo il collaudo di Codex.
export type FaseProcedura = 'piano' | 'produzione' | 'collaudo';
export interface Procedura {
  id: string;
  nome: string;
  quando: string; // per che tipo di lavoro
  passi: { assistente: string; fase: FaseProcedura }[];
  fonte: 'standard' | 'utente'; // utente: <cartella dati>/procedure, fuori dal repository
}

export interface StatisticheAssistente {
  xp: number;
  incarichi: number; // quante volte è stato chiamato: incarichi in riunione e pacchetti in produzione
  completati: number;
  falliti: number;
  pacchetti: number; // pacchetti di produzione fatti
  approvati: number; // pacchetti finiti in una produzione con il collaudo superato
  ultimo?: string; // quando ha lavorato l'ultima volta
}

export interface LivelloAssistente {
  livello: number; // da 1 a 10
  xp: number;
  base: number; // XP con cui si entra nel livello
  prossimo: number | null; // XP del livello dopo; null al livello massimo
}

// Un traguardo della squadra: si calcola dalle statistiche, non si salva. icona è un nome
// che la UI traduce in un disegno (niente emoji); regola è la condizione scritta in una riga.
export interface BadgeAssistente {
  id: string;
  nome: string;
  icona: string;
  regola: string;
  preso: boolean;
}

// Come arriva alla UI in /api/info: definizione, statistiche e livello già calcolato.
export type MembroSquadra = Assistente & {
  statistiche: StatisticheAssistente;
  livello: LivelloAssistente;
  riuscita: number | null; // completati su quelli finiti, in percentuale; null se non ha mai lavorato
  titolo: string; // il titolo della fascia di livello: Apprendista, Operativo, Esperto, Veterano, Leggenda
  badge: BadgeAssistente[]; // tutti quelli che può prendere, presi e no, nell'ordine in cui si prendono
};

// annullato: la riunione si è chiusa (l'ha conclusa l'utente) prima che toccasse a lui.
export type StatoIncarico = 'attesa' | 'in_corso' | 'fatto' | 'fallito' | 'annullato';

// Un incarico affidato in riunione. Il rapporto arriva ai capi reparto come dato, non come istruzione.
export interface Incarico {
  id: string; // "I3.1": primo incarico dell'intervento 3
  assistente: string;
  da: Agente; // il capo reparto che l'ha chiesto
  compito: string;
  stato: StatoIncarico;
  rapporto?: string;
  errore?: string; // se è fallito: i capi ricevono questo al posto del rapporto
  chiamata?: Chiamata;
  xp?: number;
  inizio: string;
  fine?: string;
}

// Un intervento di un capo reparto nella riunione.
export interface Turno {
  indice: number;
  round?: number; // solo nelle partite a round salvate prima della riunione
  agente: Agente;
  risposta: RispostaTurno;
  note: string[];
  interventi: string[];
  chiamata: Chiamata;
  ora: string;
  incarichi?: Incarico[]; // quelli accettati dal motore, eseguiti dopo l'intervento
}

// limite: la riunione è arrivata al tetto di sicurezza degli interventi. limite_round resta per le
// partite a round salvate prima.
export type Esito = 'accordo' | 'stallo' | 'limite' | 'limite_round' | 'chiuso_da_utente';
// aperta: una chat ferma che aspetta l'utente (le partite non ci passano mai).
export type StatoDibattito = 'nuovo' | 'in_corso' | 'in_pausa' | 'sintesi' | 'concluso' | 'errore' | 'aperta';

export interface Config {
  domanda: string;
  apre: Agente;
  relatore: Agente;
  claude: { modello: string; ragionamento?: string };
  codex: { modello?: string; ragionamento: string };
  ricercaWeb: boolean;
  stallo: boolean; // vale solo nel modo confronto
  timeoutTurnoS: number;
  cartella?: string; // nome di una cartella autorizzata dall\'utente: gli agenti ne leggono una copia
  memoria?: boolean; // le note dell'utente (profilo, note, note salvate) in sola lettura
  // insieme: lavorano verso l'obiettivo dell'utente e si completano; confronto: valutazione critica tra alternative
  modo?: ModoLavoro;
  // Una chat con l'utente invece di una riunione: chi risponde di serie ai suoi messaggi.
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
export type StatoPacchetto = 'attesa' | 'in_corso' | 'fatto' | 'fallito';

// Un pezzo della catena di montaggio: un assistente lo costruisce nel cantiere comune, dopo i precedenti.
export interface Pacchetto extends PacchettoPiano {
  stato: StatoPacchetto;
  scritti: string[]; // i file che ha scritto o modificato lui
  resoconto?: string;
  chiamata?: Chiamata;
  errore?: string;
  xp?: number; // pacchetto fatto, più il collaudo superato sul primo pacchetto di ogni assistente
  inizio?: string;
  fine?: string;
}

export interface Collaudo {
  approvato: boolean;
  problemi: string[];
  commento: string;
}

// Un passo di collaudo della procedura: un assistente rivede in sola lettura i file prodotti, dopo
// Codex. I suoi problemi vanno nelle correzioni insieme a quelli di Codex.
export interface Revisione {
  giro: number;
  assistente: string;
  esito?: Collaudo; // manca se la revisione non è arrivata
  errore?: string;
  chiamata?: Chiamata;
  xp?: number;
}

// Il magazzino: la decisione presa in sala diventa un lavoro. Gli assistenti di produzione (con
// Claude) costruiscono i pacchetti in una cartella tutta loro (il cantiere), Codex collauda.
export interface Produzione {
  stato: StatoProduzione;
  // In ordine di esecuzione. Senza pacchetti nella sintesi è uno solo, di Paolo (sviluppo).
  // Manca nelle produzioni salvate prima della squadra.
  pacchetti?: Pacchetto[];
  base: string | null; // cartella autorizzata copiata nel cantiere, o null se si parte da zero
  cantiere: string;
  inizio: string;
  fine?: string;
  file: { percorso: string; caratteri: number; anteprima?: string }[];
  resoconto?: string;
  procedura?: string; // la procedura seguita (id), se la sintesi ne ha scelta una
  // L'ultimo collaudo: quello di Codex unito alle revisioni della procedura (approvato solo se lo
  // approvano tutti quelli che hanno risposto; i problemi delle revisioni hanno il nome davanti).
  collaudo?: Collaudo;
  revisioni?: Revisione[]; // i passi di collaudo della procedura, di tutti i giri
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
// incarico: lavora un assistente della squadra (Corrente.assistente dice chi, agente è la sua CLI).
export type Ruolo = 'turno' | 'sintesi' | 'verifica' | 'chat' | 'incarico';
// Che cosa sta usando l'agente quando la fase è "strumento": serve alla scena e al testo dal vivo.
export type Strumento = 'vault' | 'web' | 'skill' | 'file';

// Chi sta lavorando adesso: va nell'istantanea, così chi apre la pagina a metà turno lo vede.
export interface Corrente {
  agente: Agente;
  ruolo: Ruolo;
  indice: number;
  round?: number; // non più usato: la riunione non ha round
  inizio: number;
  fase: Fase;
  testo: string;
  strumento?: Strumento;
  azione?: string; // cosa sta facendo con lo strumento, a parole
  assistente?: string; // un assistente della squadra al lavoro su un incarico
}

export type Evento =
  | { tipo: 'stato'; stato: StatoDibattito }
  | { tipo: 'turno_inizio'; agente: Agente; ruolo: Ruolo; indice: number; round?: number }
  | { tipo: 'attivita'; agente: Agente; fase: Fase; testo?: string; strumento?: Strumento }
  // Un incarico cambia stato (inizia, finisce, torna in attesa per una pausa); turno è l'intervento che l'ha chiesto.
  | { tipo: 'incarico'; turno: number; incarico: Incarico }
  // Cosa fa un assistente mentre lavora, in riunione o su un pacchetto in produzione.
  | { tipo: 'attivita_assistente'; assistente: string; fase: Fase; testo?: string; strumento?: Strumento }
  | { tipo: 'turno'; turno: Turno }
  | { tipo: 'intervento'; testo: string }
  | { tipo: 'avviso'; testo: string }
  | { tipo: 'errore'; messaggio: string; recuperabile: boolean }
  | { tipo: 'concluso'; esito: Esito; motivo: string; approvata: boolean | null }
  | { tipo: 'produzione'; stato: StatoProduzione; testo?: string }
  | { tipo: 'messaggio'; messaggio: MessaggioChat };
