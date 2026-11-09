// Pianta dell'ufficio: misure in metri, x verso destra, z verso chi guarda (la telecamera sta a sud).
// A sinistra il magazzino-archivio, a destra gli uffici con la sala del dibattito al centro.
import type { Agente } from '../../../motore/tipi.ts';

export type Punto = [number, number]; // [x, z]

// Palette: bianco, nero e un solo accento, il lime (#B5F900).
// Il resto della scena è un plastico in scala di grigi (vedi Modello.tsx).
export const LIME = '#b5f900';
export const NERO = '#141518';
export const COLORI = {
  pavimentoMagazzino: '#e2e4e7',
  pavimentoUfficio: '#f2f3f5',
  linea: LIME,
  muro: NERO,
  muroChiaro: '#f7f8f9',
  vetro: '#e3eef7',
  telaio: NERO,
  legno: '#d7dade',
  legnoChiaro: '#eceef0',
  scrivania: '#f4f5f6',
  metallo: '#9aa1a9',
  cartone: '#e6e8eb',
  cartoneScuro: '#c9cdd2',
  scaffaleBlu: NERO,
  scaffaleArancio: LIME,
  pianta: '#2a2d31',
  piantaChiara: '#4a4f55',
  vaso: '#f4f5f6',
  pelle: '#e9ebee',
  claude: LIME,
  codex: '#9aa3ad',
  utente: '#ffffff',
  accordo: LIME,
  parziale: '#9aa0a6',
  disaccordo: NERO,
  neutro: '#c4c8ce',
  errore: '#ff3b30',
} as const;

export const COLORE_AGENTE: Record<Agente, string> = { claude: COLORI.claude, codex: COLORI.codex };

export const PAVIMENTO = { x: [-24, 24], z: [-15, 15] } as const;
export const DIVISORIO_X = -1.5;

// La sala del dibattito: tavolo al centro, Claude a ovest e Codex a est. Due porte a nord, una per
// lato, verso le rispettive scrivanie; in mezzo, sulla parete, lo schermo.
export const SALA = { centro: [9, -2] as Punto, larga: 9, profonda: 6.6, porte: [[5.4, 6.8], [11.2, 12.6]] as [number, number][] };
export const TAVOLO = { centro: [9, -2] as Punto, lungo: 5, largo: 2 };
export const SCHERMO = { centro: [9, -5.1] as Punto, larghezza: 3.4, altezza: 1.9, quota: 1.65 };

export const UFFICIO_UTENTE = { min: [15.5, 4.5] as Punto, max: [23.5, 13.5] as Punto, sedia: [19.5, 7.6] as Punto, scrivania: [19.5, 8.6] as Punto };
export const STAMPANTE: Punto = [2.2, -7.2];

export type Posto = 'tavolo' | 'scrivania' | 'centro';

interface Rotte {
  tavolo: Punto;
  verso: number; // direzione dello sguardo da seduto, in radianti (0 = verso +z)
  scrivania: Punto;
  versoScrivania: number;
  centro: Punto;
  versoCentro: number;
  // In piedi accanto alla propria sedia, per parlare (non dentro la sedia).
  inPiedi: Punto;
  // Dal posto al tavolo fino alla sedia della scrivania, passando dalla porta della sala.
  aScrivania: Punto[];
  aCentro: Punto[];
}

export const ROTTE: Record<Agente, Rotte> = {
  claude: {
    tavolo: [6.05, -2],
    verso: Math.PI / 2,
    scrivania: [5, -10.3],
    versoScrivania: Math.PI,
    centro: [8.45, -4.15],
    versoCentro: Math.PI / 2,
    inPiedi: [6.15, -2.85],
    aScrivania: [[6.1, -4.4], [6.1, -6.2], [5, -8.8], [5, -10.3]],
    aCentro: [[6.9, -4.15], [8.45, -4.15]],
  },
  codex: {
    tavolo: [11.95, -2],
    verso: -Math.PI / 2,
    scrivania: [13, -10.3],
    versoScrivania: Math.PI,
    centro: [9.55, -4.15],
    versoCentro: -Math.PI / 2,
    inPiedi: [11.85, -2.85],
    aScrivania: [[11.9, -4.4], [11.9, -6.2], [13, -8.8], [13, -10.3]],
    aCentro: [[11.1, -4.15], [9.55, -4.15]],
  },
};

// Percorso da un posto all'altro: si passa sempre dal proprio posto al tavolo.
export function percorso(agente: Agente, da: Posto, a: Posto): Punto[] {
  if (da === a) return [];
  const r = ROTTE[agente];
  const versoTavolo = (p: Posto): Punto[] => (p === 'scrivania' ? [...r.aScrivania].reverse().slice(1).concat([r.tavolo]) : p === 'centro' ? [...r.aCentro].reverse().slice(1).concat([r.tavolo]) : []);
  const dalTavolo = (p: Posto): Punto[] => (p === 'scrivania' ? r.aScrivania : p === 'centro' ? r.aCentro : []);
  return [...versoTavolo(da), ...dalTavolo(a)];
}

export function posizioneDi(agente: Agente, posto: Posto, inPiedi = false): { punto: Punto; verso: number } {
  const r = ROTTE[agente];
  if (posto === 'tavolo' && inPiedi) return { punto: r.inPiedi, verso: r.verso };
  if (posto === 'scrivania') return { punto: r.scrivania, verso: r.versoScrivania };
  if (posto === 'centro') return { punto: r.centro, verso: r.versoCentro };
  return { punto: r.tavolo, verso: r.verso };
}

// Il magazzino è la produzione: un nastro parte dalla porta dell'ufficio (x -1.5, z 1.6-4.6) e va
// verso ovest fino allo scaffale dell'archivio, dove finiscono le decisioni.
export const LINEA = { da: -2.4, a: -19, z: 3.1 };
// Scaffale dell'archivio a fine nastro: ogni scatola è un dibattito concluso.
export const ARCHIVIO = { x: -21.6, z: [-1.4, 7.6] as [number, number] };
export const LIVELLI = [0.18, 0.95, 1.72, 2.49];

// Il fattorino porta il documento dalla stampante all'inizio del nastro, passando dalla porta.
export const FATTORINO = {
  casa: [-3.2, 5.6] as Punto,
  versoStampante: [[-2.2, 4.3], [-0.6, 4.3], [0.9, -1], [1.2, -5.6]] as Punto[],
  stampante: [2.2, -6.3] as Punto,
  versoNastro: [[1.2, -5.6], [0.9, -1], [-0.6, 4.3], [-2.2, 4.3]] as Punto[],
  nastro: [-2.6, 4.05] as Punto,
};

// Dove riprendere un percorso nuovo: il segmento più vicino a dove si trova adesso, e da lì in avanti.
// Col punto più vicino tornava indietro fino a un angolo già passato.
export function ripresa(da: Punto, punti: Punto[]): number {
  if (punti.length < 2) return 0;
  let migliore = 0;
  let distanza = Infinity;
  for (let i = 0; i < punti.length - 1; i++) {
    const [ax, az] = punti[i]!;
    const [bx, bz] = punti[i + 1]!;
    const lx = bx - ax;
    const lz = bz - az;
    const l2 = lx * lx + lz * lz || 1e-9;
    const t = Math.min(1, Math.max(0, ((da[0] - ax) * lx + (da[1] - az) * lz) / l2));
    const d = Math.hypot(ax + lx * t - da[0], az + lz * t - da[1]);
    if (d < distanza - 0.01) {
      distanza = d;
      // A metà segmento si va verso la sua fine; prima del suo inizio (t = 0) si passa dall'inizio,
      // altrimenti si taglia l'angolo (attraverso un muro o una sedia).
      migliore = t > 0 ? i + 1 : i;
    }
  }
  return migliore;
}
