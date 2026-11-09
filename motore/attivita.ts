// Cosa sta facendo un agente quando usa uno strumento, detto a parole: è il testo che l'utente vede dal
// vivo ("Cerca nelle note: «Alfa»") e il tipo che fa muovere l'omino giusto nella scena.
import type { Strumento } from './tipi.ts';

const corto = (t: unknown, max = 60): string => {
  const s = typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// "note/Progetti/Alfa.md" → "Alfa"
const nomeNota = (n: unknown): string => corto(typeof n === 'string' ? n.split('/').pop()!.replace(/\.md$/i, '') : '');

const FONTI: Record<string, string> = {
  profilo: 'il profilo', note: 'le note', salvate: 'le note salvate', 'claude-md': 'le istruzioni di Claude Code', skill: 'le skill',
  agenti: 'gli agenti', comandi: 'i comandi', 'skill-plugin': 'le skill dei plugin', 'skill-codex': 'le skill di Codex',
};

export interface Descrizione {
  testo: string;
  strumento: Strumento;
}

// nome: come lo chiama la CLI (Claude: mcp__memoria__cerca, WebSearch, Skill; Codex: cerca, web_search).
export function descriviStrumento(nome: string, input: unknown): Descrizione {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const base = nome.replace(/^mcp__memoria__/, '');
  if (base === 'cerca') return { testo: i.testo ? `Cerca nelle note: «${corto(i.testo)}»` : 'Cerca nelle note dell\'utente', strumento: 'vault' };
  // Una skill letta dalle note (Codex le legge così): è la skill che sta usando, non una nota qualsiasi.
  if (base === 'leggi' && typeof i.nota === 'string' && /(^|\/)SKILL\.md$/i.test(i.nota)) {
    return { testo: `Usa la skill «${corto(i.nota.split('/').at(-2) ?? 'skill', 40)}»`, strumento: 'skill' };
  }
  if (base === 'leggi') return { testo: i.nota ? `Legge la nota «${nomeNota(i.nota)}»` : 'Legge una nota', strumento: 'vault' };
  if (base === 'elenco') return { testo: `Sfoglia ${FONTI[String(i.fonte)] ?? 'le note dell\'utente'}`, strumento: 'vault' };
  if (nome === 'WebSearch' || nome === 'web_search') return { testo: i.query ? `Cerca sul web: «${corto(i.query)}»` : 'Cerca sul web', strumento: 'web' };
  if (nome === 'Skill') return { testo: i.skill || i.name ? `Usa la skill «${corto(i.skill ?? i.name, 40)}»` : 'Usa una skill', strumento: 'skill' };
  return { testo: `Usa ${corto(nome, 40)}`, strumento: 'file' };
}

// Gli argomenti di Codex possono arrivare come oggetto o come stringa JSON.
export function argomenti(a: unknown): unknown {
  if (typeof a !== 'string') return a;
  try { return JSON.parse(a); } catch { return {}; }
}
