// Gli avatar della squadra: un ritratto da robot del diorama, stabile per ogni id. Qui solo
// i dati (tinta, testa, occhi, bocca, accessorio): il disegno SVG è in hud/Avatar.tsx. Per i 7 di
// serie le scelte sono fatte a mano e ben distinte; per gli agenti dell'utente si ricavano dall'id.
// coloreAgente serve anche al 3D, perché l'omino e l'avatar abbiano la stessa tinta.

export type Testa = 'tondo' | 'quadro' | 'capsula' | 'esagono' | 'scudo' | 'schermo' | 'ovale';
export type Occhi = 'punti' | 'visiera' | 'anelli' | 'lineette' | 'occhio' | 'quadrati';
export type Bocca = 'linea' | 'sorriso' | 'griglia' | 'nessuna';
export type Accessorio = 'antenna' | 'doppia' | 'cuffie' | 'elmetto' | 'basco' | 'cresta' | 'matita' | 'bulloni' | 'berretto' | 'nessuno';

export interface Tratti {
  tinta: string; // esadecimale #rrggbb
  testa: Testa;
  occhi: Occhi;
  bocca: Bocca;
  accessorio: Accessorio;
}

export const NERO = '#141518';
export const LIME = '#b5f900';

const STANDARD: Record<string, Tratti> = {
  ricerca: { tinta: '#1fb2a0', testa: 'capsula', occhi: 'anelli', bocca: 'sorriso', accessorio: 'antenna' },
  analisi: { tinta: '#3d7cf0', testa: 'schermo', occhi: 'visiera', bocca: 'linea', accessorio: 'doppia' },
  architettura: { tinta: '#f28a22', testa: 'esagono', occhi: 'quadrati', bocca: 'sorriso', accessorio: 'elmetto' },
  testi: { tinta: '#8b5cf6', testa: 'tondo', occhi: 'lineette', bocca: 'sorriso', accessorio: 'matita' },
  design: { tinta: '#e8468e', testa: 'ovale', occhi: 'punti', bocca: 'sorriso', accessorio: 'basco' },
  sviluppo: { tinta: '#f0533f', testa: 'quadro', occhi: 'punti', bocca: 'griglia', accessorio: 'cuffie' },
  controllo: { tinta: '#e3a400', testa: 'scudo', occhi: 'occhio', bocca: 'linea', accessorio: 'berretto' },
};

// Claude e Codex hanno già i loro colori nella sala: si tengono uguali.
const CAPI: Record<string, string> = { claude: LIME, codex: '#9aa3ad' };

const TESTE: readonly Testa[] = ['tondo', 'quadro', 'capsula', 'esagono', 'scudo', 'schermo', 'ovale'];
const OCCHI: readonly Occhi[] = ['punti', 'visiera', 'anelli', 'lineette', 'occhio', 'quadrati'];
const BOCCHE: readonly Bocca[] = ['linea', 'sorriso', 'griglia', 'nessuna'];
const ACCESSORI: readonly Accessorio[] = ['antenna', 'doppia', 'cuffie', 'elmetto', 'basco', 'cresta', 'matita', 'bulloni', 'berretto', 'nessuno'];

// FNV-1a a 32 bit: lo stesso id dà sempre lo stesso numero, su ogni dispositivo.
function impronta(t: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Un numero diverso per ogni tratto, dallo stesso id.
const pesca = <T>(lista: readonly T[], id: string, sale: string): T => lista[impronta(`${sale}:${id}`) % lista.length]!;

function esadecimale(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// La tinta di un agente dell'utente: tonalità dall'id, saturazione e luce fisse. Si salta la fascia
// del lime, che resta il colore d'accento della casa.
function tintaDa(id: string): string {
  let h = impronta(`tinta:${id}`) % 360;
  if (h >= 62 && h <= 108) h = (h + 60) % 360;
  return esadecimale(h, 0.62, 0.52);
}

export function tratti(id: string): Tratti {
  const s = STANDARD[id];
  if (s) return s;
  return {
    tinta: tintaDa(id),
    testa: pesca(TESTE, id, 'testa'),
    occhi: pesca(OCCHI, id, 'occhi'),
    bocca: pesca(BOCCHE, id, 'bocca'),
    accessorio: pesca(ACCESSORI, id, 'accessorio'),
  };
}

// La tinta di chiunque in scena: un assistente della squadra, un agente dell'utente o un capo reparto.
export function coloreAgente(id: string): string {
  return CAPI[id] ?? tratti(id).tinta;
}

// La tinta schiarita verso il bianco (0 = tinta, 1 = bianco): lo sfondo della tessera dell'avatar.
export function schiarisci(hex: string, quanto: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(x + (255 - x) * quanto));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
