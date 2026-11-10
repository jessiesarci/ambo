// La squadra nella dashboard: chi sono gli assistenti, chi è stato chiamato nella
// partita aperta e chi lavora adesso. Funzioni pure sui dati del motore, più il contesto React che
// porta il catalogo (da /api/info) e l'apertura della scheda fino alla scena e all'HUD.
import { createContext, useContext } from 'react';
import type {
  Agente, Dibattito, Incarico, MembroSquadra, Pacchetto, Procedura, Revisione, StatoIncarico, StatoPacchetto,
} from '../../motore/tipi.ts';
import type { Vista } from './stato.ts';

// I 7 di serie, solo per i nomi quando il catalogo non è ancora arrivato (server appena avviato,
// replay aperto prima di /api/info). La fonte vera resta motore/squadra.ts.
const STANDARD: Record<string, { nome: string; ruolo: string; motore: Agente }> = {
  ricerca: { nome: 'Rita', ruolo: 'Ricerca', motore: 'claude' },
  analisi: { nome: 'Marco', ruolo: 'Analisi', motore: 'codex' },
  architettura: { nome: 'Elena', ruolo: 'Architettura', motore: 'claude' },
  testi: { nome: 'Luca', ruolo: 'Testi', motore: 'claude' },
  design: { nome: 'Sara', ruolo: 'Design', motore: 'claude' },
  sviluppo: { nome: 'Paolo', ruolo: 'Sviluppo', motore: 'claude' },
  controllo: { nome: 'Nadia', ruolo: 'Controllo qualità', motore: 'codex' },
};

export interface ChiAssistente {
  id: string;
  nome: string;
  ruolo: string;
  motore: Agente;
  membro?: MembroSquadra; // manca per un agente dell'utente tolto dal disco, o prima di /api/info
}

export function chiE(squadra: readonly MembroSquadra[] | undefined, id: string): ChiAssistente {
  const m = squadra?.find((x) => x.id === id);
  if (m) return { id, nome: m.nome, ruolo: m.ruolo, motore: m.motore, membro: m };
  const s = STANDARD[id];
  return s ? { id, ...s } : { id, nome: id, ruolo: '', motore: 'claude' };
}

// Il ruolo di un agente dell'utente è la sua descrizione accorciata: nelle righe resta breve.
export const conRuolo = (c: ChiAssistente) => (c.ruolo ? `${c.nome} (${breve(c.ruolo, 32)})` : c.nome);

// Una riga sola, tagliata su una parola: per fumetti, righe del registro e anteprime.
export function breve(t: string, max = 44): string {
  const x = t.replace(/\s+/g, ' ').trim();
  if (x.length <= max) return x;
  const tagliato = x.slice(0, max - 1);
  const spazio = tagliato.lastIndexOf(' ');
  return `${(spazio > max * 0.6 ? tagliato.slice(0, spazio) : tagliato).replace(/[,.;:\s]+$/, '')}…`;
}

export const STATO_INCARICO: Record<StatoIncarico, string> = { attesa: 'in coda', in_corso: 'al lavoro', fatto: 'fatto', fallito: 'non riuscito', annullato: 'annullato' };
export const STATO_PACCHETTO: Record<StatoPacchetto, string> = { attesa: 'in attesa', in_corso: 'in costruzione', fatto: 'fatto', fallito: 'non riuscito' };

export const incarichiDi = (d: Dibattito | undefined): Incarico[] => (d?.turni ?? []).flatMap((t) => t.incarichi ?? []);

// L'intervento a cui appartiene un incarico ("I3.1" è del 3); per le partite di prima vale l'id.
export const turnoDi = (i: Incarico): number => Number(/^I(\d+)\./.exec(i.id)?.[1] ?? 0);

const produzioneAttiva = (d: Dibattito | undefined) => d?.produzione?.stato === 'in_lavorazione' || d?.produzione?.stato === 'collaudo';

// Chi è stato chiamato nella partita, in ordine di prima chiamata: gli incarichi della riunione,
// poi i pacchetti e le revisioni della produzione. In coda chi lavora senza essere ancora scritto
// nella partita: una revisione si salva solo a lavoro finito.
export function chiamatiNellaPartita(d: Dibattito | undefined, vivo?: string): string[] {
  const visti = new Set<string>();
  for (const i of incarichiDi(d)) visti.add(i.assistente);
  for (const p of d?.produzione?.pacchetti ?? []) visti.add(p.assistente);
  for (const r of d?.produzione?.revisioni ?? []) visti.add(r.assistente);
  if (vivo) visti.add(vivo);
  return [...visti];
}

export interface Lavoro {
  id: string;
  tipo: 'incarico' | 'pacchetto' | 'revisione' | 'correzione';
  cosa: string; // il compito, il titolo del pacchetto o cosa fa nel collaudo
  incarico?: Incarico;
  turno?: number;
  da?: Agente; // il capo reparto che aspetta il rapporto
  numero?: number; // pacchetto n di
  di?: number;
}

// Chi lavora adesso. L'istantanea è la verità (incarico o pacchetto "in corso"); gli eventi dicono
// in più chi rivede i file o corregge dopo il collaudo, che nella partita si scrive solo alla fine.
export function alLavoro(v: Vista): Lavoro[] {
  const d = v.dibattito;
  const out: Lavoro[] = [];
  if (d?.stato === 'in_corso') {
    for (const t of d.turni) {
      for (const i of t.incarichi ?? []) if (i.stato === 'in_corso') out.push({ id: i.assistente, tipo: 'incarico', cosa: i.compito, incarico: i, turno: t.indice, da: i.da });
    }
  }
  const vivo = v.assistente;
  if (vivo?.dove === 'incarico' && !out.some((x) => x.id === vivo.id)) {
    out.push({ id: vivo.id, tipo: 'incarico', cosa: vivo.compito ?? 'incarico della riunione', turno: vivo.turno, da: d?.turni.find((t) => t.indice === vivo.turno)?.agente });
  }
  const p = d?.produzione;
  if (p && produzioneAttiva(d)) {
    const pk = p.pacchetti ?? [];
    const n = pk.findIndex((x) => x.stato === 'in_corso');
    if (n >= 0) {
      out.push({ id: pk[n]!.assistente, tipo: 'pacchetto', cosa: pk[n]!.titolo, numero: n + 1, di: pk.length });
    } else if (vivo?.dove === 'produzione') {
      const giro = p.giro ?? 1;
      if (p.stato === 'collaudo' && !p.revisioni?.some((r) => r.giro === giro && r.assistente === vivo.id)) out.push({ id: vivo.id, tipo: 'revisione', cosa: 'rivede i file prodotti' });
      else if (p.stato === 'in_lavorazione' && giro > 1) out.push({ id: vivo.id, tipo: 'correzione', cosa: 'corregge dopo il collaudo' });
    }
  }
  return out;
}

// Gli incarichi dell'ultimo intervento che aspettano il loro turno (si eseguono uno alla volta).
export function inCoda(d: Dibattito | undefined): Incarico[] {
  if (d?.stato !== 'in_corso') return [];
  return (d.turni.at(-1)?.incarichi ?? []).filter((i) => i.stato === 'attesa');
}

export type VoceLavoro =
  | { tipo: 'incarico'; incarico: Incarico }
  | { tipo: 'pacchetto'; pacchetto: Pacchetto; numero: number; di: number }
  | { tipo: 'revisione'; revisione: Revisione };

// Tutto quello che un assistente ha fatto nella partita aperta, dal più recente.
export function lavoriDi(d: Dibattito | undefined, id: string): VoceLavoro[] {
  const pk = d?.produzione?.pacchetti ?? [];
  const voci: VoceLavoro[] = [
    ...incarichiDi(d).filter((i) => i.assistente === id).map((incarico) => ({ tipo: 'incarico' as const, incarico })),
    ...pk.map((pacchetto, n) => ({ tipo: 'pacchetto' as const, pacchetto, numero: n + 1, di: pk.length })).filter((x) => x.pacchetto.assistente === id),
    ...(d?.produzione?.revisioni ?? []).filter((r) => r.assistente === id).map((revisione) => ({ tipo: 'revisione' as const, revisione })),
  ];
  return voci.reverse();
}

// Quanto manca al livello dopo, da 0 a 1 (pieno al livello massimo).
export function avanzamento(m: MembroSquadra | undefined): number {
  const l = m?.livello;
  if (!l) return 0;
  if (l.prossimo === null) return 1;
  return Math.min(1, Math.max(0, (l.xp - l.base) / Math.max(1, l.prossimo - l.base)));
}

// Il pannello della lobby: chi ha più esperienza in alto, a pari XP chi è stato chiamato di più.
export function perEsperienza(squadra: readonly MembroSquadra[]): MembroSquadra[] {
  return [...squadra].sort((a, b) => b.statistiche.xp - a.statistiche.xp || b.statistiche.incarichi - a.statistiche.incarichi);
}

// --- ordinamenti, podio, titoli e badge -----------------------------------------------------

export type Ordine = 'esperienza' | 'chiamate' | 'riuscita';
export const ORDINI: Record<Ordine, string> = { esperienza: 'Esperienza', chiamate: 'Chiamate', riuscita: 'Riuscita' };

// A pari valore decide l'esperienza; chi non ha mai finito un lavoro va in fondo per la riuscita.
export function ordina(squadra: readonly MembroSquadra[], ordine: Ordine): MembroSquadra[] {
  const xp = perEsperienza(squadra);
  if (ordine === 'chiamate') return xp.sort((a, b) => b.statistiche.incarichi - a.statistiche.incarichi);
  if (ordine === 'riuscita') return xp.sort((a, b) => (b.riuscita ?? -1) - (a.riuscita ?? -1));
  return xp;
}

// I primi tre per XP, solo chi ne ha.
export const podio = (squadra: readonly MembroSquadra[]): MembroSquadra[] => perEsperienza(squadra).filter((m) => m.statistiche.xp > 0).slice(0, 3);

// Un motore di una versione precedente non manda titolo e badge: il titolo si ricava dal livello.
const TITOLI = ['Apprendista', 'Operativo', 'Esperto', 'Veterano', 'Leggenda'];
export const titoloDi = (m: MembroSquadra): string => m.titolo ?? TITOLI[Math.min(4, Math.max(0, Math.floor((m.livello.livello - 1) / 2)))]!;
export const badgeDi = (m: MembroSquadra) => m.badge ?? [];

// Nella carta: gli ultimi badge presi (i più difficili), al massimo n.
export const badgeInVetrina = (m: MembroSquadra, n = 3) => badgeDi(m).filter((b) => b.preso).slice(-n).reverse();

// "mancano 140 XP al livello 5"; null al livello massimo.
export function mancano(m: MembroSquadra): { xp: number; livello: number } | null {
  const l = m.livello;
  return l.prossimo === null ? null : { xp: Math.max(0, l.prossimo - l.xp), livello: l.livello + 1 };
}

export interface ValoreSquadra {
  squadra: MembroSquadra[];
  procedure: Procedura[];
  apri?: (id: string) => void; // apre la scheda dell'assistente (manca dove non c'è una scheda da aprire)
}

// Arriva anche dentro la tela 3D: @react-three/fiber porta i contesti di React nel Canvas.
export const ContestoSquadra = createContext<ValoreSquadra>({ squadra: [], procedure: [] });
export const usaSquadra = () => useContext(ContestoSquadra);
