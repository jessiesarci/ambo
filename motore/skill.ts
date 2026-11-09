// Le skill che Claude e Codex hanno a disposizione su questo PC, in sola lettura: nome, descrizione
// e da dove vengono. Servono alla scheda dell'agente ("skill a disposizione"); quelle usate davvero
// le dicono gli eventi della CLI, non questo elenco.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Skill {
  nome: string;
  descrizione: string;
  fonte: string; // "personale" o il nome del plugin
}

const MAX_PER_AGENTE = 200;
const DURATA_CACHE_MS = 10 * 60_000;

// name e description dal frontmatter di SKILL.md (riga semplice, o blocco "|"/">" su più righe).
export function leggiFrontmatter(testo: string): { nome?: string; descrizione?: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(testo);
  if (!m) return {};
  const righe = m[1]!.split(/\r?\n/);
  const valore = (chiave: string): string | undefined => {
    const i = righe.findIndex((r) => r.startsWith(`${chiave}:`));
    if (i < 0) return undefined;
    let v = righe[i]!.slice(chiave.length + 1).trim();
    if (v === '|' || v === '>' || v === '|-' || v === '>-' || v === '') {
      const corpo: string[] = [];
      for (const r of righe.slice(i + 1)) {
        if (!/^\s+/.test(r)) break;
        corpo.push(r.trim());
      }
      v = corpo.join(' ');
    }
    return v.replace(/^["']|["']$/g, '').trim();
  };
  return { nome: valore('name'), descrizione: valore('description') };
}

function cartelle(radice: string): string[] {
  try {
    return readdirSync(radice).filter((n) => {
      try { return statSync(join(radice, n)).isDirectory(); } catch { return false; }
    });
  } catch {
    return [];
  }
}

function skillIn(cartellaSkill: string, fonte: string): Skill[] {
  const out: Skill[] = [];
  for (const nome of cartelle(cartellaSkill)) {
    const file = join(cartellaSkill, nome, 'SKILL.md');
    if (!existsSync(file)) continue;
    try {
      const f = leggiFrontmatter(readFileSync(file, 'utf8').slice(0, 8000));
      const d = (f.descrizione ?? '').replace(/\s+/g, ' ');
      out.push({ nome: f.nome || nome, descrizione: d.length > 160 ? `${d.slice(0, 159)}…` : d, fonte });
    } catch {
      // una skill illeggibile non ferma l'elenco
    }
  }
  return out;
}

// I plugin attivi di Claude Code: "nome@marketplace": true nelle impostazioni dell'utente.
function pluginAttivi(casa: string): Set<string> {
  try {
    const s = JSON.parse(readFileSync(join(casa, '.claude', 'settings.json'), 'utf8')) as { enabledPlugins?: Record<string, boolean> };
    return new Set(Object.entries(s.enabledPlugins ?? {}).filter(([, v]) => v).map(([k]) => k));
  } catch {
    return new Set();
  }
}

// La versione più recente di un plugin nella cache: la cartella modificata per ultima.
function ultimaVersione(cartella: string): string | undefined {
  return cartelle(cartella).map((v) => ({ v, t: statSync(join(cartella, v)).mtimeMs })).sort((a, b) => b.t - a.t)[0]?.v;
}

export function elencaSkill(casa = homedir()): { claude: Skill[]; codex: Skill[] } {
  const claude = skillIn(join(casa, '.claude', 'skills'), 'personale');
  const attivi = pluginAttivi(casa);
  const cache = join(casa, '.claude', 'plugins', 'cache');
  for (const mercato of cartelle(cache)) {
    for (const plugin of cartelle(join(cache, mercato))) {
      if (!attivi.has(`${plugin}@${mercato}`)) continue;
      const v = ultimaVersione(join(cache, mercato, plugin));
      // Le skill di un plugin stanno in skills/ o, in alcuni plugin, in .claude/skills/.
      if (v) for (const sotto of ['skills', join('.claude', 'skills')]) claude.push(...skillIn(join(cache, mercato, plugin, v, sotto), plugin));
    }
  }
  // Le stesse che Codex può leggere dalle note (fonte skill-codex).
  const codex = skillIn(join(process.env.CODEX_HOME || join(casa, '.codex'), 'skills'), 'personale');
  const ordina = (l: Skill[]) => l.sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, MAX_PER_AGENTE);
  return { claude: ordina(claude), codex: ordina(codex) };
}

let cache: { quando: number; dati: ReturnType<typeof elencaSkill> } | undefined;
export function skillDisponibili(): ReturnType<typeof elencaSkill> {
  if (!cache || Date.now() - cache.quando > DURATA_CACHE_MS) cache = { quando: Date.now(), dati: elencaSkill() };
  return cache.dati;
}
