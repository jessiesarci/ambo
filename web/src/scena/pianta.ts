// Pianta dell'ufficio: misure in metri, x verso destra, z verso chi guarda (la telecamera sta a sud).
// A sinistra il magazzino con la catena di montaggio, a destra gli uffici divisi in reparti, con la
// sala riunioni al centro.
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

// La sala riunioni: tavolo al centro, Claude a ovest e Codex a est. Due porte a nord, una per lato,
// verso le rispettive scrivanie in Direzione; in mezzo, sulla parete, lo schermo.
export const SALA = { centro: [9, -2] as Punto, larga: 9, profonda: 6.6, porte: [[5.4, 6.8], [11.2, 12.6]] as [number, number][] };
export const TAVOLO = { centro: [9, -2] as Punto, lungo: 5, largo: 2 };
export const SCHERMO = { centro: [9, -5.1] as Punto, larghezza: 3.4, altezza: 1.9, quota: 1.65 };

export const UFFICIO_UTENTE = { min: [15.5, 4.5] as Punto, max: [23.5, 13.5] as Punto, sedia: [19.5, 7.6] as Punto, scrivania: [19.5, 8.6] as Punto };
export const STAMPANTE: Punto = [2.2, -7.2];

// Una scrivania: il centro del piano e la rotazione. rotazione 0: chi siede sta a sud (+z) e guarda
// a nord, verso lo schermo; π: il contrario. Il kit Kenney ha il fronte dei mobili verso -z (sedie,
// divani, poltrone, monitor, portatili, librerie): per guardare verso (dx, dz) la rotazione è
// atan2(-dx, -dz).
export interface Scrivania {
  punto: Punto;
  rotazione: number;
}
export const DISTANZA_SEDIA = 0.82;
export const rivoltoVerso = (dx: number, dz: number) => Math.atan2(-dx, -dz);

// Dove siede chi lavora a una scrivania, e verso dove guarda (verso 0 = verso +z, come i personaggi).
export function sedile(s: Scrivania): { punto: Punto; verso: number } {
  return { punto: [s.punto[0] + Math.sin(s.rotazione) * DISTANZA_SEDIA, s.punto[1] + Math.cos(s.rotazione) * DISTANZA_SEDIA], verso: s.rotazione + Math.PI };
}

// Un'isola di scrivanie: due file schiena a schiena. I posti si occupano in diagonale (davanti a
// sinistra, dietro a destra, ...): due vicini di reparto non hanno i cartellini uno sull'altro. Chi
// siede davanti dà le spalle alla telecamera e il suo schermo acceso si vede.
function isola(cx: number, cz: number, colonne: number): Scrivania[] {
  const xs = Array.from({ length: colonne }, (_, i) => cx + (i - (colonne - 1) / 2) * 1.42);
  return xs.flatMap((x, i): Scrivania[] => [{ punto: [x, cz + 0.38], rotazione: 0 }, { punto: [xs[colonne - 1 - i]!, cz - 0.38], rotazione: Math.PI }]);
}

// --- reparti ---------------------------------------------------------------------------------
// A nord, da ovest: Ricerca e analisi, Direzione (Claude e Codex, sopra la sala), Progettazione,
// Contenuti. A sud, vicino alla porta del magazzino: Sviluppo e Qualità. Gli ospiti nella zona relax.
export type IdReparto = 'direzione' | 'ricerca' | 'progettazione' | 'contenuti' | 'sviluppo' | 'qualita' | 'ospiti';

export interface Reparto {
  id: IdReparto;
  nome: string;
  sigla: string; // sul quadrato del cartello
  colore: string; // discreto: il filo a terra e il quadrato del cartello
  filo?: string; // il filo a terra, se diverso (la Direzione: il lime è del reparto attivo)
  area: [number, number, number, number]; // x0, z0, x1, z1 del tappeto a terra
  cartello: { punto: Punto; larghezza: number };
  scrivanie: Scrivania[]; // nell'ordine in cui si occupano (gli ospiti non ne hanno)
  sedute?: { punto: Punto; verso: number }[]; // posti senza scrivania (poltrone e divano)
}

const NORD = -10.5;
const SUD = 7.5;
export const SCRIVANIA_CLAUDE: Scrivania = { punto: [6.1, -10.12], rotazione: 0 };
export const SCRIVANIA_CODEX: Scrivania = { punto: [11.9, -10.12], rotazione: 0 };
// La lavagna della Direzione, tra le due scrivanie: guarda a sud, verso la sala e la telecamera.
export const LAVAGNA = { punto: [9, -11.3] as Punto, larghezza: 2.6, altezza: 1.4 };

// La zona relax è la sala d'attesa degli ospiti: due poltrone e il divano, rivolti al tavolino.
export const RELAX = {
  tavolino: [20.6, -1.6] as Punto,
  divano: { punto: [22.55, -1.6] as Punto, rotazione: rivoltoVerso(-1, 0) },
  poltrone: [
    { punto: [19, -3.1] as Punto, rotazione: rivoltoVerso(1.6, 1.5) },
    { punto: [19, -0.1] as Punto, rotazione: rivoltoVerso(1.6, -1.5) },
  ],
};

export const REPARTI: Reparto[] = [
  { id: 'direzione', nome: 'Direzione', sigla: 'DI', colore: LIME, filo: '#3a3e44', area: [4.9, -12.7, 13.1, -8.3], cartello: { punto: [9, -8.78], larghezza: 2.4 }, scrivanie: [SCRIVANIA_CLAUDE, SCRIVANIA_CODEX] },
  { id: 'ricerca', nome: 'Ricerca e analisi', sigla: 'RA', colore: '#6f9fd8', area: [0.4, -12.7, 4.6, -8.3], cartello: { punto: [2.5, -8.78], larghezza: 3.4 }, scrivanie: isola(2.7, NORD, 2) },
  { id: 'progettazione', nome: 'Progettazione', sigla: 'PR', colore: '#d99a52', area: [13.5, -12.7, 17.7, -8.3], cartello: { punto: [15.6, -8.78], larghezza: 3.0 }, scrivanie: isola(15.6, NORD, 2) },
  { id: 'contenuti', nome: 'Contenuti', sigla: 'CO', colore: '#a98bc6', area: [18.8, -12.7, 23.0, -8.3], cartello: { punto: [20.9, -8.78], larghezza: 2.6 }, scrivanie: isola(20.9, NORD, 2) },
  { id: 'sviluppo', nome: 'Sviluppo', sigla: 'SV', colore: '#de7c62', area: [1.6, 5.1, 7.6, 9.9], cartello: { punto: [4.6, 9.42], larghezza: 2.4 }, scrivanie: isola(4.6, SUD, 3) },
  { id: 'qualita', nome: 'Qualità', sigla: 'QA', colore: '#cfae3f', area: [7.9, 5.1, 13.9, 9.9], cartello: { punto: [10.9, 9.42], larghezza: 2.2 }, scrivanie: isola(10.9, SUD, 3) },
  {
    id: 'ospiti', nome: 'Ospiti', sigla: 'OS', colore: '#9aa3ad', area: [18.1, -4.1, 23.6, 0.9], cartello: { punto: [19.55, 0.6], larghezza: 1.8 }, scrivanie: [],
    sedute: [
      ...RELAX.poltrone.map((p) => ({ punto: p.punto, verso: p.rotazione + Math.PI })),
      { punto: [22.72, -2.15] as Punto, verso: RELAX.divano.rotazione + Math.PI },
      { punto: [22.72, -1.05] as Punto, verso: RELAX.divano.rotazione + Math.PI },
    ],
  },
];
export const REPARTO = Object.fromEntries(REPARTI.map((r) => [r.id, r])) as Record<IdReparto, Reparto>;
// I posti di un reparto: le scrivanie, poi le sedute senza scrivania.
export const postiDi = (r: Reparto): { punto: Punto; verso: number }[] => [...r.scrivanie.map(sedile), ...(r.sedute ?? [])];

// --- Claude e Codex -----------------------------------------------------------------------------
// Dove può stare un capo reparto: al tavolo della sala (riunione), in mezzo alla sala (festa), alla
// sua scrivania in Direzione, o al banco del collaudo nel magazzino (solo Codex).
export type Posto = 'tavolo' | 'scrivania' | 'centro' | 'collaudo';

// Il banco del collaudo nel magazzino (Produzione.tsx): chi collauda sta in piedi a sud del banco.
export const COLLAUDO = { x: [-12.9, -15.9] as [number, number], z: 5.25, inPiedi: 6.1 };
// Il primo è di Codex; gli altri degli assistenti di collaudo della procedura.
export const POSTI_COLLAUDO: Punto[] = [[-13.35, 6.1], [-14.3, 6.1], [-15.2, 6.1], [-12.45, 6.25], [-16.0, 6.25]];

interface Rotte {
  tavolo: Punto;
  verso: number; // direzione dello sguardo da seduto, in radianti (0 = verso +z)
  scrivania: Punto;
  versoScrivania: number;
  centro: Punto;
  versoCentro: number;
  // In piedi accanto alla propria sedia, per parlare (non dentro la sedia).
  inPiedi: Punto;
  // Da ogni posto fino all'uscio: appena fuori dalla propria porta della sala, nel corridoio tra la
  // sala e la Direzione. Tutte le rotte passano da lì, così nessuno attraversa vetri o mobili.
  daTavolo: Punto[];
  daCentro: Punto[];
  daScrivania: Punto[];
  daCollaudo?: Punto[];
}

const SEDE_CLAUDE = sedile(SCRIVANIA_CLAUDE);
const SEDE_CODEX = sedile(SCRIVANIA_CODEX);

export const ROTTE: Record<Agente, Rotte> = {
  claude: {
    tavolo: [6.05, -2],
    verso: Math.PI / 2,
    scrivania: SEDE_CLAUDE.punto,
    versoScrivania: SEDE_CLAUDE.verso,
    centro: [8.45, -4.15],
    versoCentro: Math.PI / 2,
    inPiedi: [6.15, -2.85],
    daTavolo: [[6.05, -2], [6.1, -4.4], [6.1, -6.3]],
    daCentro: [[8.45, -4.15], [6.9, -4.15], [6.1, -4.4], [6.1, -6.3]],
    daScrivania: [SEDE_CLAUDE.punto, [6.1, -6.3]],
  },
  codex: {
    tavolo: [11.95, -2],
    verso: -Math.PI / 2,
    scrivania: SEDE_CODEX.punto,
    versoScrivania: SEDE_CODEX.verso,
    centro: [9.55, -4.15],
    versoCentro: -Math.PI / 2,
    inPiedi: [11.85, -2.85],
    daTavolo: [[11.95, -2], [11.9, -4.4], [11.9, -6.3]],
    daCentro: [[9.55, -4.15], [11.1, -4.15], [11.9, -4.4], [11.9, -6.3]],
    daScrivania: [SEDE_CODEX.punto, [11.9, -6.3]],
    // Fino al banco del collaudo: lungo il corridoio nord, giù dal passaggio del fattorino, dentro
    // la porta del magazzino e lungo il nastro dal lato sud, tra il nastro e le postazioni.
    daCollaudo: [POSTI_COLLAUDO[0]!, [-12.4, 6.1], [-12.4, 4.45], [-2.2, 4.4], [-0.6, 4.3], [0.9, -1], [1.3, -6.3], [11.9, -6.3]],
  },
};

const IN_SALA = new Set<Posto>(['tavolo', 'centro']);
const rotta = (r: Rotte, p: Posto): Punto[] => (p === 'tavolo' ? r.daTavolo : p === 'centro' ? r.daCentro : p === 'collaudo' ? (r.daCollaudo ?? r.daScrivania) : r.daScrivania);

// Percorso da un posto all'altro (senza il punto d'arrivo, che è la destinazione). Dentro la sala si
// va dritti dal tavolo al centro; fuori si passa dall'uscio della propria porta.
export function percorso(agente: Agente, da: Posto, a: Posto): Punto[] {
  if (da === a) return [];
  const r = ROTTE[agente];
  if (IN_SALA.has(da) && IN_SALA.has(a)) return [r.daCentro[1]!];
  return [...rotta(r, da).slice(1), ...[...rotta(r, a)].reverse().slice(1, -1)];
}

export function posizioneDi(agente: Agente, posto: Posto, inPiedi = false): { punto: Punto; verso: number } {
  const r = ROTTE[agente];
  if (posto === 'tavolo' && inPiedi) return { punto: r.inPiedi, verso: r.verso };
  if (posto === 'scrivania') return { punto: r.scrivania, verso: r.versoScrivania };
  if (posto === 'centro') return { punto: r.centro, verso: r.versoCentro };
  if (posto === 'collaudo' && r.daCollaudo) return { punto: r.daCollaudo[0]!, verso: Math.PI };
  return { punto: r.tavolo, verso: r.verso };
}

// --- la catena di montaggio ------------------------------------------------------------------
// Il nastro parte dalla porta dell'ufficio (x -1.5, z 1.6-4.6) e va verso ovest fino all'archivio.
// Cinque stazioni: le postazioni della costruzione e il banco del collaudo stanno a sud del nastro
// (chi lavora dà le spalle alla telecamera e il suo schermo si vede); i cartelli a terra ancora più
// a sud, davanti a tutto.
export const LINEA = { da: -2.4, a: -19, z: 3.1 };
export type Stazione = 1 | 2 | 3 | 4 | 5;
export const STAZIONI: Record<Stazione, { nome: string; x: number; cartello: number; larghezza: number }> = {
  1: { nome: 'Piano', x: -3.5, cartello: -3.5, larghezza: 2.2 },
  2: { nome: 'Costruzione', x: -8.0, cartello: -8.0, larghezza: 3.6 },
  3: { nome: 'Collaudo', x: -14.4, cartello: -14.0, larghezza: 3.0 },
  4: { nome: 'Correzioni', x: -17.0, cartello: -17.1, larghezza: 2.2 },
  5: { nome: 'Consegna', x: -18.6, cartello: -19.6, larghezza: 2.2 },
};
export const CARTELLI_LINEA_Z = 8.1;
export const MAX_POSTAZIONI_LINEA = 5;
// Le postazioni della costruzione, una per pacchetto, centrate sulla stazione 2 (la prima a est),
// con un passaggio tra l'una e l'altra: i cartellini di chi costruisce non si coprono.
export function scrivanieCostruzione(n: number): Scrivania[] {
  const k = Math.max(1, Math.min(MAX_POSTAZIONI_LINEA, n));
  return Array.from({ length: k }, (_, i): Scrivania => ({ punto: [STAZIONI[2].x + ((k - 1) / 2 - i) * 1.8, 5.25], rotazione: 0 }));
}
export const SCRIVANIA_CORREZIONI: Scrivania = { punto: [STAZIONI[4].x, 5.25], rotazione: 0 };

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
