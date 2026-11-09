// Le impostazioni di chi usa il programma. Sono tutte facoltative: si mettono nel file .env della
// cartella del programma (vedi .env.esempio) o nelle variabili d'ambiente. Senza niente il programma
// parte vuoto: niente profilo, niente note, niente impostazioni personali di Claude Code.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { CARTELLA_DATI, percorsoUtente, RADICE } from './ambiente.ts';

const percorso = (nome: string): string | undefined => percorsoUtente(process.env[nome], nome);
const acceso = (v: string | undefined) => v === '1' || v?.toLowerCase() === 'si' || v?.toLowerCase() === 'true';

export const IMPOSTAZIONI = {
  // Come gli agenti chiamano chi usa il programma. Vuoto: "l'utente".
  nome: (process.env.CONTRAPPUNTO_NOME ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || undefined,
  // Chi sei e come lavori: un file markdown che gli agenti leggono (in sola lettura).
  profilo: percorso('CONTRAPPUNTO_PROFILO') ?? join(RADICE, 'profilo.md'),
  // Una cartella di note markdown da dare in lettura agli agenti (per esempio un vault Obsidian).
  note: percorso('CONTRAPPUNTO_NOTE'),
  // Dove il programma salva decisioni e chat come note markdown. Le rilegge anche, come memoria.
  salvaIn: percorso('CONTRAPPUNTO_SALVA_IN') ?? join(CARTELLA_DATI, 'note'),
  // Claude parte con le impostazioni utente di Claude Code (CLAUDE.md, plugin, skill).
  ambiente: acceso(process.env.CONTRAPPUNTO_AMBIENTE),
  // Accetta anche il login con chiave API, che si paga a consumo. Di serie no.
  consentiApi: acceso(process.env.CONTRAPPUNTO_CONSENTI_API),
};

// Il modo in cui gli agenti nominano chi usa il programma, e la riga che lo presenta.
export const UTENTE = IMPOSTAZIONI.nome ?? "l\'utente";
export const presentazioneUtente = (): string =>
  IMPOSTAZIONI.nome ? `Chi usa il programma si chiama ${IMPOSTAZIONI.nome}: chiamalo così. Nei messaggi è "Utente".` : '';

export interface FonteNote {
  nome: string;
  radice: string;
  file?: string; // fonte fatta di un solo file
}

// Le fonti che il server delle note (memoria-mcp.ts) può leggere. Le scrive il motore in un file,
// perché le CLI non passano sempre le variabili d'ambiente ai server MCP che avviano.
export function fontiNote(): FonteNote[] {
  // Le stesse cartelle che usano le CLI: homedir() (su Windows USERPROFILE) e CODEX_HOME per Codex.
  const casa = homedir();
  const codex = process.env.CODEX_HOME || join(casa, '.codex');
  const fonti: FonteNote[] = [];
  const p = IMPOSTAZIONI.profilo;
  // Il profilo è un file markdown: un altro tipo di file non si dà agli agenti.
  if (/\.md$/i.test(p)) fonti.push({ nome: 'profilo', radice: dirname(p), file: basename(p) });
  if (IMPOSTAZIONI.note) fonti.push({ nome: 'note', radice: IMPOSTAZIONI.note });
  fonti.push({ nome: 'salvate', radice: IMPOSTAZIONI.salvaIn });
  if (IMPOSTAZIONI.ambiente) {
    fonti.push(
      { nome: 'claude-md', radice: join(casa, '.claude'), file: 'CLAUDE.md' },
      { nome: 'skill', radice: join(casa, '.claude', 'skills') },
      { nome: 'agenti', radice: join(casa, '.claude', 'agents') },
      { nome: 'comandi', radice: join(casa, '.claude', 'commands') },
      { nome: 'skill-plugin', radice: join(casa, '.claude', 'plugins', 'cache') },
      { nome: 'skill-codex', radice: join(codex, 'skills') },
    );
  }
  return fonti.filter((f) => existsSync(f.file ? join(f.radice, f.file) : f.radice));
}

export const FILE_FONTI = join(CARTELLA_DATI, 'fonti-note.json');

const SPIEGAZIONE: Record<string, string> = {
  profilo: 'profilo (chi è e come lavora, scritto dall\'utente)',
  note: 'note (la sua cartella di note)',
  salvate: 'salvate (decisioni e chat salvate da questo programma)',
  'claude-md': 'claude-md (le sue istruzioni per Claude Code)',
  skill: 'skill (le sue skill di Claude Code)',
  agenti: 'agenti (i suoi agenti di Claude Code)',
  comandi: 'comandi (i suoi comandi di Claude Code)',
  'skill-plugin': 'skill-plugin (le skill dei suoi plugin)',
  'skill-codex': 'skill-codex (le sue skill di Codex)',
};

// Le fonti a parole, per le istruzioni degli agenti.
export function descriviFonti(): string {
  const fonti = fontiNote().map((f) => SPIEGAZIONE[f.nome] ?? f.nome);
  return fonti.length ? `Fonti: ${fonti.join('; ')}.` : 'Per ora non ci sono note.';
}

// Ci sono note da leggere? Se no, gli strumenti delle note non si danno agli agenti.
export function ciSonoNote(): boolean {
  return fontiNote().length > 0;
}

// Note attive per una conversazione: accese (di serie sì) e con almeno una fonte.
export const noteAttive = (c: { memoria?: boolean }): boolean => (c.memoria ?? true) && ciSonoNote();

export function scriviFontiNote(): FonteNote[] {
  const fonti = fontiNote();
  mkdirSync(CARTELLA_DATI, { recursive: true });
  writeFileSync(FILE_FONTI, JSON.stringify(fonti, null, 2));
  return fonti;
}

// Quello che la dashboard può sapere della configurazione: nomi e interruttori, mai percorsi.
export function riepilogoImpostazioni() {
  const fonti = fontiNote().map((f) => f.nome);
  return {
    nome: IMPOSTAZIONI.nome ?? null,
    profilo: fonti.includes('profilo'),
    note: fonti.includes('note'),
    ambiente: IMPOSTAZIONI.ambiente,
    consentiApi: IMPOSTAZIONI.consentiApi,
  };
}
