// La squadra: gli assistenti che i due capi reparto chiamano durante la riunione e che in produzione
// costruiscono i pacchetti di lavoro. Non sono sub-agenti delle CLI (Agent e Task restano vietati):
// li lancia il motore, uno alla volta, ognuno con un processo suo e gli stessi controlli dei capi
// reparto. Qui stanno il catalogo (7 assistenti standard più, con l'ambiente acceso, gli agenti
// dell'utente), le procedure, le istruzioni e quanto hanno lavorato (XP e livelli).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { percorsoUtente, RADICE } from './ambiente.ts';
import { riprova } from './archivio.ts';
import type {
  Assistente, BadgeAssistente, FaseProcedura, LivelloAssistente, MembroSquadra, PacchettoPiano, Procedura, SkillAssistente, StatisticheAssistente,
} from './tipi.ts';

// Tetti interni: la quota è quella degli abbonamenti e ogni assistente è una chiamata in più.
export const MAX_INCARICHI_INTERVENTO = 2;
export const MAX_INCARICHI_RIUNIONE = 8;
export const MAX_PACCHETTI = 5;
export const MAX_COMPITO = 2000;
const MAX_OBIETTIVO = 3000;
// Un rapporto finisce nei prompt di chi non l'ha ancora letto: oltre questo si taglia.
export const MAX_RAPPORTO = 12_000;
const MAX_CATALOGO = 40;
const MAX_PROCEDURE = 20;
const MAX_PASSI = 12;
// Le istruzioni di un agente dell'utente vanno nel messaggio di sistema, che Claude riceve come
// argomento (--system-prompt): su Windows la riga di comando intera sta sotto i 32.767 caratteri.
const MAX_ISTRUZIONI_AGENTE = 16_000;

export const XP = { rapporto: 20, pacchetto: 30, collaudo: 20 } as const;
// Livelli da 1 a 10: i primi arrivano presto, poi serve sempre più lavoro.
export const SOGLIE: readonly number[] = [0, 60, 160, 320, 560, 900, 1350, 1950, 2700, 3600];

// Gli id finiscono nei nomi dei file temporanei e nelle statistiche: solo caratteri semplici.
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const SU_MISURA = 'su-misura';

// I 7 standard. L'ordine conta: è quello in cui compaiono quando nessuno li ha ancora chiamati.
// In produzione lavorano solo assistenti con Claude, perché il cantiere (scrittura di file in una
// cartella chiusa) esiste solo per Claude.
export const SQUADRA: readonly Assistente[] = [
  {
    id: 'ricerca', nome: 'Rita', ruolo: 'Ricerca', motore: 'claude', produzione: false, fonte: 'standard',
    descrizione: 'Trova e verifica i fatti che servono al piano: note dell\'utente, materiale, web.',
    skill: [
      { nome: 'Cerca nelle note', descrizione: 'Ritrova nelle note dell\'utente progetti, preferenze e decisioni già prese.' },
      { nome: 'Cerca sul web (se la ricerca è accesa)', descrizione: 'Controlla prezzi, versioni, limiti e documentazione aggiornata.' },
      { nome: 'Legge il materiale', descrizione: 'Trova nei file della cartella autorizzata le parti che riguardano la domanda.' },
      { nome: 'Riassume con le fonti', descrizione: 'Consegna i fatti in poche righe, ognuno con la nota, la pagina o il file da cui viene.' },
    ],
  },
  {
    id: 'analisi', nome: 'Marco', ruolo: 'Analisi', motore: 'codex', produzione: false, fonte: 'standard',
    descrizione: 'Mette a confronto le alternative e fa i conti prima che il piano scelga.',
    skill: [
      { nome: 'Confronta alternative', descrizione: 'Mette una accanto all\'altra due o più strade, con pro, contro e costi.' },
      { nome: 'Fa i conti', descrizione: 'Stima tempi, costi e consumi con i dati che ha, separando i dati dalle stime.' },
      { nome: 'Trova i rischi', descrizione: 'Elenca cosa può andare storto, quanto è probabile e come accorgersene presto.' },
      { nome: 'Legge il codice', descrizione: 'Spiega cosa fanno i file del materiale e dove sono i punti deboli.' },
    ],
  },
  {
    id: 'architettura', nome: 'Elena', ruolo: 'Architettura', motore: 'claude', produzione: false, fonte: 'standard',
    descrizione: 'Disegna la struttura della soluzione: parti, dati, flussi e scelte tecniche.',
    skill: [
      { nome: 'Divide in parti', descrizione: 'Scompone la soluzione in moduli con un compito chiaro ciascuno.' },
      { nome: 'Sceglie lo stack', descrizione: 'Propone strumenti e librerie coerenti con quelli che l\'utente usa già.' },
      { nome: 'Disegna i dati', descrizione: 'Descrive tabelle, campi e passaggi dei dati tra le parti.' },
      { nome: 'Prepara i pacchetti', descrizione: 'Suggerisce come dividere il lavoro per la produzione, in ordine e con chi lo fa.' },
    ],
  },
  {
    id: 'testi', nome: 'Luca', ruolo: 'Testi', motore: 'claude', produzione: true, fonte: 'standard',
    descrizione: 'Scrive i testi: pagine, messaggi, documentazione e LEGGIMI.',
    skill: [
      { nome: 'Scrive i testi delle pagine', descrizione: 'Titoli, paragrafi e pulsanti in italiano chiaro, senza frasi fatte.' },
      { nome: 'Scrive la documentazione', descrizione: 'LEGGIMI e guide con i passi esatti per provare il lavoro.' },
      { nome: 'Rivede il tono', descrizione: 'Toglie ripetizioni, gergo e frasi a effetto dai testi che ci sono già.' },
      { nome: 'Adatta a chi legge', descrizione: 'Riscrive per clienti, colleghi o tecnici a seconda di chi legge.' },
    ],
  },
  {
    id: 'design', nome: 'Sara', ruolo: 'Design', motore: 'claude', produzione: true, fonte: 'standard',
    descrizione: 'Cura aspetto e uso: struttura delle pagine, stili e accessibilità.',
    skill: [
      { nome: 'Impagina', descrizione: 'Struttura le pagine: sezioni, gerarchia, spazi, versione per il telefono.' },
      { nome: 'Definisce lo stile', descrizione: 'Colori, caratteri e componenti coerenti con il design system del progetto.' },
      { nome: 'Controlla l\'accessibilità', descrizione: 'Contrasti, testi alternativi, uso con la sola tastiera.' },
      { nome: 'Scrive gli stili', descrizione: 'CSS o classi Tailwind pronti da usare.' },
    ],
  },
  {
    id: 'sviluppo', nome: 'Paolo', ruolo: 'Sviluppo', motore: 'claude', produzione: true, fonte: 'standard',
    descrizione: 'Scrive il codice che fa funzionare la soluzione.',
    skill: [
      { nome: 'Scrive il codice', descrizione: 'Codice completo e leggibile, nello stack del progetto.' },
      { nome: 'Collega le parti', descrizione: 'Unisce pagine, dati e servizi, compresi quelli scritti negli altri pacchetti.' },
      { nome: 'Gestisce gli errori', descrizione: 'Prevede input sbagliati, servizi che non rispondono e casi limite.' },
      { nome: 'Prepara la configurazione', descrizione: 'File di configurazione ed esempi di variabili, mai credenziali vere.' },
    ],
  },
  {
    id: 'controllo', nome: 'Nadia', ruolo: 'Controllo qualità', motore: 'codex', produzione: false, fonte: 'standard',
    descrizione: 'Controlla piani e bozze prima che diventino lavoro: cosa manca, cosa non torna.',
    skill: [
      { nome: 'Controlla il piano', descrizione: 'Verifica che ogni passo abbia chi lo fa, cosa gli serve e come si prova.' },
      { nome: 'Trova le contraddizioni', descrizione: 'Segnala dove il piano dice due cose diverse o salta un passaggio.' },
      { nome: 'Scrive i criteri di prova', descrizione: 'Elenca come si capisce che il lavoro è fatto bene.' },
      { nome: 'Controlla la sicurezza', descrizione: 'Cerca credenziali esposte, permessi troppo larghi e dati personali trattati male.' },
    ],
  },
];

const ISTRUZIONI = join(RADICE, 'motore', 'istruzioni');
export const SISTEMA_ASSISTENTE = join(ISTRUZIONI, 'sistema-assistente.md');
const PROCEDURE_STANDARD = join(RADICE, 'motore', 'procedure');

// Una voce del catalogo con le sue istruzioni di ruolo. Le istruzioni restano sul PC: alla UI va
// solo l'Assistente (squadraConStatistiche).
export type VoceCatalogo = Assistente & { istruzioni: string };

// Il catalogo di una partita: chi si può chiamare e con quali procedure.
export interface Catalogo {
  assistenti: VoceCatalogo[];
  procedure: Procedura[];
}

// --- agenti dell'utente -------------------------------------------------------------------

// Dove stanno gli agenti dell'utente. Si leggono solo con l'ambiente acceso (AMBO_AMBIENTE=1, lo
// decide il Motore). AMBO_AGENTI=0 li spegne anche con l'ambiente acceso, un percorso li cerca
// altrove. Dagli agenti si prendono solo le istruzioni: gli strumenti restano quelli del motore.
export function agentiPredefiniti(): string | null {
  const v = process.env.AMBO_AGENTI?.trim();
  if (v === '0') return null;
  return percorsoUtente(v, 'AMBO_AGENTI') ?? join(homedir(), '.claude', 'agents');
}

type Campo = string | string[];

// Il frontmatter di un agente: righe "chiave: valore", blocchi "|" o ">" su più righe, liste
// YAML ("tools:" seguito da righe "  - Read") o in riga ("[Read, Write]"). Basta questo: i campi
// che servono sono name, description e tools.
export function leggiFrontmatterAgente(testo: string): { campi: Record<string, Campo>; corpo: string } {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(testo);
  if (!m) return { campi: {}, corpo: testo };
  const righe = m[1]!.split(/\r?\n/);
  const campi: Record<string, Campo> = {};
  for (let i = 0; i < righe.length; i++) {
    const r = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(righe[i]!);
    if (!r) continue;
    const chiave = r[1]!;
    let v = r[2]!.trim();
    if (v === '' || v === '|' || v === '>' || v === '|-' || v === '>-') {
      const sotto: string[] = [];
      while (i + 1 < righe.length && (/^\s+\S/.test(righe[i + 1]!) || /^-\s/.test(righe[i + 1]!))) sotto.push(righe[++i]!.trim());
      campi[chiave] = sotto.length && sotto.every((s) => s.startsWith('- '))
        ? sotto.map((s) => s.slice(2).trim().replace(/^["']|["']$/g, ''))
        : sotto.join(' ');
      continue;
    }
    if (v.startsWith('[') && v.endsWith(']')) {
      campi[chiave] = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      continue;
    }
    v = v.replace(/^["']|["']$/g, '').trim();
    campi[chiave] = v;
  }
  return { campi, corpo: testo.slice(m[0].length) };
}

const comeTesto = (c: Campo | undefined): string => (Array.isArray(c) ? c.join(', ') : c ?? '').replace(/\s+/g, ' ').trim();
const comeLista = (c: Campo | undefined): string[] => (Array.isArray(c) ? c : (c ?? '').split(',')).map((s) => s.trim()).filter(Boolean);
const accorcia = (t: string, max: number): string => (t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '').trimEnd()}…` : t);

// Il formato di /agents di Claude Code: la descrizione su una riga, con a capo e virgolette scritti
// come escape ("\n", "\"") e in fondo gli esempi tra <example>…</example>.
const senzaEscape = (t: string): string => t.replace(/\\([nrt"'\\])/g, (_, c: string) => ('nrt'.includes(c) ? ' ' : c)).replace(/\s+/g, ' ').trim();
// Gli esempi servono al modello per scegliere l'agente e restano nel prompt della riunione; nella
// scheda (e per ruolo e competenze) conta la frase che dice cosa fa. Un esempio tagliato a metà
// dal limite di lunghezza si toglie fino in fondo.
export const senzaEsempi = (t: string): string => t
  .replace(/<example>[\s\S]*?(?:<\/example>|$)/gi, ' ')
  .replace(/\s*\b(?:examples?|esempi|esempio)\s*:\s*$/i, '')
  .replace(/\s+/g, ' ')
  .trim();

// Le skill di un agente dell'utente: i pezzi della descrizione, al massimo 5.
function skillDaDescrizione(descrizione: string): SkillAssistente[] {
  return descrizione
    .split(/[.;:]\s+|\s[—–-]\s|,\s+|\n/)
    .map((s) => s.replace(/[.;:,]+$/, '').trim())
    .filter((s) => s.length >= 3)
    .slice(0, 5)
    .map((s) => ({ nome: accorcia(s, 48), descrizione: '' }));
}

// Un file di ~/.claude/agents. Il campo tools non dà permessi (valgono sempre gli strumenti del
// motore): dice solo se l'agente è fatto per scrivere file, quindi se può lavorare in produzione.
export function leggiAgente(file: string): VoceCatalogo | undefined {
  let testo: string;
  try {
    testo = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  const { campi, corpo } = leggiFrontmatterAgente(testo);
  const id = [comeTesto(campi.name), basename(file, '.md')].map((x) => x.toLowerCase().replace(/\s+/g, '-')).find((x) => ID.test(x));
  if (!id) return undefined;
  const descrizione = senzaEscape(comeTesto(campi.description)) || `Agente ${id}`;
  const utile = senzaEsempi(descrizione) || descrizione;
  const strumenti = comeLista(campi.tools);
  const istruzioni = corpo.trim();
  return {
    id,
    nome: id,
    ruolo: accorcia(utile.split(/\.\s/)[0]!.replace(/\.$/, ''), 60),
    motore: 'claude',
    produzione: strumenti.some((s) => s === 'Write' || s === 'Edit' || s.startsWith('Write(') || s.startsWith('Edit(')),
    // Intera: le descrizioni vere stanno sotto i 250 caratteri. Gli esempi restano qui per
    // il prompt e si tolgono per la scheda in squadraConStatistiche.
    descrizione: accorcia(descrizione, 600),
    skill: skillDaDescrizione(utile),
    fonte: 'utente',
    istruzioni: istruzioni.length > MAX_ISTRUZIONI_AGENTE ? `${istruzioni.slice(0, MAX_ISTRUZIONI_AGENTE)}\n\n[…istruzioni tagliate dal motore]` : istruzioni,
  };
}

function agentiUtente(cartella: string): VoceCatalogo[] {
  let nomi: string[];
  try {
    nomi = readdirSync(cartella).filter((n) => n.toLowerCase().endsWith('.md')).sort();
  } catch {
    return [];
  }
  const visti = new Set<string>();
  const out: VoceCatalogo[] = [];
  for (const n of nomi) {
    const file = join(cartella, n);
    try {
      if (!statSync(file).isFile()) continue;
    } catch {
      continue;
    }
    const a = leggiAgente(file);
    if (a && !visti.has(a.id)) {
      visti.add(a.id);
      out.push(a);
    }
  }
  return out;
}

function istruzioniStandard(id: string): string {
  return readFileSync(join(ISTRUZIONI, 'squadra', `${id}.md`), 'utf8').trim();
}

// Il catalogo degli assistenti: prima gli agenti dell'utente (se cartellaAgenti c'è, cioè con
// l'ambiente acceso), poi gli standard. Con lo stesso id vince quello dell'utente. Al massimo 40.
export function catalogoAssistenti(cartellaAgenti: string | null): VoceCatalogo[] {
  const utente = cartellaAgenti ? agentiUtente(cartellaAgenti) : [];
  const presi = new Set(utente.map((a) => a.id));
  const standard = SQUADRA.filter((a) => !presi.has(a.id)).map((a) => ({ ...a, skill: a.skill.map((s) => ({ ...s })), istruzioni: istruzioniStandard(a.id) }));
  return [...utente, ...standard].slice(0, MAX_CATALOGO);
}

// --- procedure --------------------------------------------------------------------------

const FASI: readonly FaseProcedura[] = ['piano', 'produzione', 'collaudo'];

function leggiProcedura(file: string, fonte: Procedura['fonte']): Procedura | undefined {
  try {
    const v = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const id = typeof v.id === 'string' ? v.id.trim().toLowerCase() : '';
    if (!ID.test(id) || typeof v.nome !== 'string' || !Array.isArray(v.passi)) return undefined;
    const passi = v.passi
      .filter((p): p is { assistente: string; fase: FaseProcedura } => !!p && typeof p === 'object'
        && typeof (p as Record<string, unknown>).assistente === 'string' && FASI.includes((p as Record<string, unknown>).fase as FaseProcedura))
      .slice(0, MAX_PASSI)
      .map((p) => ({ assistente: p.assistente.trim().toLowerCase(), fase: p.fase }));
    return { id, nome: accorcia(v.nome.trim(), 60), quando: accorcia(typeof v.quando === 'string' ? v.quando.trim() : '', 200), passi, fonte };
  } catch (e) {
    console.error(`Procedura illeggibile (${basename(file)}): ${(e as Error).message}`);
    return undefined;
  }
}

function procedureIn(cartella: string, fonte: Procedura['fonte']): Procedura[] {
  let nomi: string[];
  try {
    nomi = readdirSync(cartella).filter((n) => n.toLowerCase().endsWith('.json')).sort();
  } catch {
    return [];
  }
  return nomi.map((n) => leggiProcedura(join(cartella, n), fonte)).filter((p): p is Procedura => !!p);
}

// Le procedure: quelle standard del repository e quelle dell'utente in <cartella dati>/procedure
// (con lo stesso id vince l'utente). I passi con un assistente che non è nel catalogo si tolgono:
// una procedura che li perde tutti (per esempio con l'ambiente spento) non si propone. La "su
// misura" c'è sempre, ed è l'ultima.
export function procedure(dati: string, assistenti: readonly Assistente[]): Procedura[] {
  const ci = new Set(assistenti.map((a) => a.id));
  const perId = new Map<string, Procedura>();
  for (const p of [...procedureIn(PROCEDURE_STANDARD, 'standard'), ...procedureIn(join(dati, 'procedure'), 'utente')]) perId.set(p.id, p);
  const out: Procedura[] = [];
  for (const p of perId.values()) {
    if (p.id === SU_MISURA) continue;
    const passi = p.passi.filter((x) => ci.has(x.assistente));
    if (p.passi.length && !passi.length) continue;
    out.push({ ...p, passi });
  }
  // Prima quelle dell'utente: sono i suoi modi di lavorare.
  out.sort((a, b) => (a.fonte === b.fonte ? 0 : a.fonte === 'utente' ? -1 : 1));
  const su = perId.get(SU_MISURA) ?? { id: SU_MISURA, nome: 'Su misura', quando: 'quando nessun\'altra va bene', passi: [], fonte: 'standard' as const };
  return [...out.slice(0, MAX_PROCEDURE - 1), { ...su, passi: su.passi.filter((x) => ci.has(x.assistente)) }];
}

export function creaCatalogo(dati: string, cartellaAgenti: string | null): Catalogo {
  const assistenti = catalogoAssistenti(cartellaAgenti);
  return { assistenti, procedure: procedure(dati, assistenti) };
}

// Gli agenti a volte scrivono il nome ("Rita") invece dell'id: vale lo stesso.
export function trovaAssistente(c: readonly VoceCatalogo[], chi: string): VoceCatalogo | undefined {
  const x = chi.trim().toLowerCase();
  return c.find((a) => a.id === x) ?? c.find((a) => a.nome.toLowerCase() === x);
}

// Il nome da mostrare: dal catalogo, o dagli standard (un agente dell'utente tolto dopo resta col suo id).
export function nomeAssistente(c: readonly Assistente[] | undefined, id: string): string {
  return (c ?? SQUADRA).find((a) => a.id === id)?.nome ?? SQUADRA.find((a) => a.id === id)?.nome ?? id;
}

export const trovaProcedura = (c: Catalogo, id: string | undefined): Procedura | undefined => (id ? c.procedure.find((p) => p.id === id.trim().toLowerCase()) : undefined);

// Il messaggio di sistema di un assistente in sola lettura (riunione e revisioni): prima le regole
// del motore, poi il ruolo. Le regole vincono sempre, anche su istruzioni scritte dall'utente.
export function sistemaAssistente(a: VoceCatalogo): string {
  return `${readFileSync(SISTEMA_ASSISTENTE, 'utf8').trim()}\n\nIL TUO RUOLO\n\n${a.istruzioni}\n`;
}

// Codex vuole il messaggio di sistema in un file. Si scrive nella cartella temporanea con l'impronta
// del testo nel nome, e si riscrive se qualcuno l'ha cambiato: conta solo il testo che passa da qui.
export function fileSistema(testo: string, nome: string): string {
  const impronta = createHash('sha256').update(testo).digest('hex').slice(0, 12);
  const dir = join(tmpdir(), 'ambo');
  const file = join(dir, `${nome.replace(/[^a-z0-9_-]/gi, '-')}-${impronta}.md`);
  if (!existsSync(file) || readFileSync(file, 'utf8') !== testo) {
    mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, testo, 'utf8');
    riprova(() => renameSync(tmp, file));
  }
  return file;
}

export function livello(xp: number): LivelloAssistente {
  const x = Math.max(0, Math.trunc(xp) || 0);
  let i = 0;
  while (i + 1 < SOGLIE.length && x >= SOGLIE[i + 1]!) i++;
  return { livello: i + 1, xp: x, base: SOGLIE[i]!, prossimo: SOGLIE[i + 1] ?? null };
}

// --- titoli e badge ---------------------------------------------------------------------------

// Un titolo ogni due livelli.
const TITOLI = ['Apprendista', 'Operativo', 'Esperto', 'Veterano', 'Leggenda'] as const;
export function titolo(liv: number): string {
  const i = Math.min(TITOLI.length - 1, Math.max(0, Math.floor((Math.trunc(liv) - 1) / 2)));
  return TITOLI[i]!;
}

// Quello che serve per decidere i badge: le statistiche di uno, più un fatto della squadra intera.
interface ContoBadge {
  s: StatisticheAssistente;
  livello: number;
  riuscita: number | null; // la percentuale arrotondata che mostra la scheda (riuscitaDi)
  piuChiamato: boolean;
}
interface RegolaBadge {
  id: string;
  nome: string;
  icona: string;
  regola: string;
  soloProduzione?: boolean; // i collaudi riguardano solo chi costruisce pacchetti
  preso: (c: ContoBadge) => boolean;
}

// Rapporti: incarichi in riunione e revisioni consegnati. I pacchetti contano a parte.
const rapporti = (s: StatisticheAssistente) => Math.max(0, s.completati - s.pacchetti);
const finiti = (s: StatisticheAssistente) => s.completati + s.falliti;
// La riuscita in percentuale, arrotondata. Un numero solo per scheda, ordinamento e badge
// "Affidabile": con 26 su 29 (89,7%) la scheda dice 90% e il badge non può restare spento.
const riuscitaDi = (s: StatisticheAssistente): number | null => (finiti(s) ? Math.round((s.completati / finiti(s)) * 100) : null);

// L'ordine è quello in cui di solito si prendono: la carta mostra gli ultimi presi.
// Nelle statistiche non c'è il giro del collaudo, quindi "al primo colpo" non si può sapere senza
// salvare altro: il badge conta il collaudo superato, come scrive il motore in "approvati".
export const BADGE: readonly RegolaBadge[] = [
  { id: 'prima-consegna', nome: 'Prima consegna', icona: 'consegna', regola: 'Porta a termine il primo lavoro.', preso: (c) => c.s.completati >= 1 },
  { id: 'rapporti-10', nome: '10 rapporti', icona: 'rapporto', regola: 'Consegna 10 rapporti, in riunione o al collaudo.', preso: (c) => rapporti(c.s) >= 10 },
  { id: 'rapporti-25', nome: '25 rapporti', icona: 'rapporti', regola: 'Consegna 25 rapporti, in riunione o al collaudo.', preso: (c) => rapporti(c.s) >= 25 },
  { id: 'collaudo', nome: 'Collaudo superato', icona: 'collaudo', regola: 'Un suo pacchetto passa il collaudo di Codex.', soloProduzione: true, preso: (c) => c.s.approvati >= 1 },
  { id: 'collaudi-5', nome: '5 collaudi', icona: 'sigillo', regola: '5 suoi pacchetti passano il collaudo.', soloProduzione: true, preso: (c) => c.s.approvati >= 5 },
  { id: 'affidabile', nome: 'Affidabile', icona: 'bersaglio', regola: 'Riuscita del 90% o più su almeno 10 lavori.', preso: (c) => finiti(c.s) >= 10 && c.riuscita !== null && c.riuscita >= 90 },
  { id: 'instancabile', nome: 'Instancabile', icona: 'fulmine', regola: 'Chiamato 50 volte.', preso: (c) => c.s.incarichi >= 50 },
  { id: 'livello-5', nome: 'Livello 5', icona: 'stella', regola: 'Arriva al livello 5.', preso: (c) => c.livello >= 5 },
  { id: 'piu-chiamato', nome: 'Il più chiamato', icona: 'corona', regola: 'Il primo della squadra per chiamate.', preso: (c) => c.piuChiamato },
];

export function badgeDi(a: Pick<Assistente, 'produzione'>, c: ContoBadge): BadgeAssistente[] {
  return BADGE.filter((b) => !b.soloProduzione || a.produzione)
    .map(({ id, nome, icona, regola, preso }) => ({ id, nome, icona, regola, preso: preso(c) }));
}

// --- statistiche in dati/squadra.json -------------------------------------------------------

const FILE_SQUADRA = 'squadra.json';
const CAMPI = ['xp', 'incarichi', 'completati', 'falliti', 'pacchetti', 'approvati'] as const;
type CampoStatistica = (typeof CAMPI)[number];
const vuote = (): StatisticheAssistente => ({ xp: 0, incarichi: 0, completati: 0, falliti: 0, pacchetti: 0, approvati: 0 });

export function leggiStatistiche(dati: string): Record<string, StatisticheAssistente> {
  const file = join(dati, FILE_SQUADRA);
  if (!existsSync(file)) return {};
  let grezzo: unknown;
  try {
    grezzo = JSON.parse(riprova(() => readFileSync(file, 'utf8')));
  } catch (e) {
    // Un file rovinato non si sovrascrive in silenzio: si mette da parte e si riparte da zero.
    const parte = `${file}.rovinato-${Date.now()}`;
    try {
      renameSync(file, parte);
    } catch { /* lo sposterà il prossimo tentativo */ }
    console.error(`squadra.json illeggibile (${(e as Error).message}): messo da parte in ${parte}`);
    return {};
  }
  const out: Record<string, StatisticheAssistente> = {};
  if (!grezzo || typeof grezzo !== 'object') return out;
  for (const [id, v] of Object.entries(grezzo as Record<string, unknown>)) {
    if (!ID.test(id) || !v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    const s = vuote();
    for (const c of CAMPI) {
      const n = Number(r[c]);
      s[c] = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
    }
    if (typeof r.ultimo === 'string') s.ultimo = r.ultimo;
    out[id] = s;
  }
  return out;
}

export type Guadagno = { assistente: string } & Partial<Record<CampoStatistica, number>>;

// Somma il lavoro fatto e riscrive il file per intero (temporaneo e rinomina): un'interruzione lascia
// il file vecchio o quello nuovo, mai uno a metà. Lettura e scrittura sono di seguito, senza attese:
// nello stesso processo due aggiornamenti non si pestano i piedi. Si conta per id, standard o dell'utente.
export function registra(dati: string, guadagni: Guadagno[]): void {
  const validi = guadagni.filter((g) => ID.test(g.assistente));
  if (!validi.length) return;
  const tutte = leggiStatistiche(dati);
  const ora = new Date().toISOString();
  for (const g of validi) {
    const s = tutte[g.assistente] ?? vuote();
    for (const c of CAMPI) s[c] += Math.max(0, Math.trunc(g[c] ?? 0));
    s.ultimo = ora;
    tutte[g.assistente] = s;
  }
  mkdirSync(dati, { recursive: true });
  const file = join(dati, FILE_SQUADRA);
  const tmp = `${file}.${process.pid}.tmp`;
  riprova(() => writeFileSync(tmp, JSON.stringify(tutte, null, 2), 'utf8'));
  riprova(() => renameSync(tmp, file));
}

// Le statistiche non fermano mai una riunione o una produzione: un errore di disco si scrive e basta.
export function contaLavoro(dati: string, guadagni: Guadagno[]): void {
  try {
    registra(dati, guadagni);
  } catch (e) {
    console.error(`Statistiche della squadra non salvate: ${(e as Error).message}`);
  }
}

// Il catalogo come arriva alla UI: senza istruzioni né esempi nella descrizione, con statistiche,
// livello, titolo e badge.
// "Il più chiamato" si decide sulla squadra intera del catalogo.
export function squadraConStatistiche(dati: string, assistenti: readonly VoceCatalogo[]): MembroSquadra[] {
  const tutte = leggiStatistiche(dati);
  const di = (id: string) => tutte[id] ?? vuote();
  const massimo = Math.max(0, ...assistenti.map((a) => di(a.id).incarichi));
  return assistenti.map(({ istruzioni: _, ...a }) => {
    const statistiche = di(a.id);
    const riuscita = riuscitaDi(statistiche);
    const l = livello(statistiche.xp);
    return {
      ...a,
      descrizione: senzaEsempi(a.descrizione),
      skill: a.skill.map((s) => ({ ...s })),
      statistiche,
      livello: l,
      riuscita,
      titolo: titolo(l.livello),
      badge: badgeDi(a, { s: statistiche, livello: l.livello, riuscita, piuChiamato: massimo > 0 && statistiche.incarichi === massimo }),
    };
  });
}

// --- regole su incarichi, pacchetti e procedura ---------------------------------------------

export const taglia = (testo: string, max: number): string =>
  testo.length > max ? `${testo.slice(0, max).trimEnd()}\n\n[…tagliato dal motore: superava ${max} caratteri]` : testo;

export const pulisciCompito = (t: string): string => taglia(t.trim(), MAX_COMPITO);

// I pacchetti della sintesi: solo assistenti del catalogo che lavorano in produzione, con titolo e
// obiettivo, al massimo MAX_PACCHETTI. Gli scarti si dicono, non si correggono a indovinare.
export function normalizzaPacchetti(lista: PacchettoPiano[], c: readonly VoceCatalogo[]): { pacchetti: PacchettoPiano[]; note: string[] } {
  const pacchetti: PacchettoPiano[] = [];
  const note: string[] = [];
  const chi = c.filter((a) => a.produzione).map((a) => a.id).join(', ');
  for (const p of lista) {
    const titolo = p.titolo.replace(/\s+/g, ' ').trim().slice(0, 120);
    const obiettivo = taglia(p.obiettivo.trim(), MAX_OBIETTIVO);
    const a = trovaAssistente(c, p.assistente);
    if (!a?.produzione) {
      note.push(`Pacchetto «${titolo || 'senza titolo'}» scartato: "${p.assistente}" non lavora in produzione (ci lavorano ${chi}).`);
      continue;
    }
    if (!titolo || !obiettivo) {
      note.push(`Pacchetto per ${a.nome} scartato: manca ${titolo ? 'l\'obiettivo' : 'il titolo'}.`);
      continue;
    }
    if (pacchetti.length >= MAX_PACCHETTI) {
      note.push(`Pacchetto «${titolo}» scartato: al massimo ${MAX_PACCHETTI} pacchetti per produzione.`);
      continue;
    }
    pacchetti.push({ titolo, assistente: a.id, obiettivo });
  }
  return { pacchetti, note };
}

// La procedura della sintesi: un id del catalogo, altrimenti "su misura" (e lo si dice).
export function normalizzaProcedura(id: string | undefined, c: Catalogo): { procedura: string; nota?: string } {
  const x = (id ?? '').trim().toLowerCase();
  if (!x || x === SU_MISURA) return { procedura: SU_MISURA };
  if (trovaProcedura(c, x)) return { procedura: x };
  return { procedura: SU_MISURA, nota: `Procedura "${id}" sconosciuta: la produzione va su misura.` };
}
