// Ambud, il volto di Ambo: un mochi bianco con un germoglio di due foglie, lime come Claude e
// grigia come Codex. Le foglie recitano con lui: ricadono sulla testa quando chiede scusa e si toccano
// quando Claude e Codex si mettono d'accordo. Tutto in tracciati SVG, niente immagini.
// Questo file non è coperto dalla licenza MIT del file LICENSE. Il personaggio Ambud (disegno e nome)
// è © 2026 Jessie Sarcinella, tutti i diritti riservati: si può ridistribuire senza modifiche dentro Ambo
// o in una sua versione modificata che si chiama ancora Ambo. Dettagli nel README, "Licenza".
import { useId, type ReactNode } from 'react';

export type Umore = 'saluta' | 'contento' | 'pensa' | 'sorpreso' | 'scusa' | 'festeggia';

const C = { ink: '#141518', lime: '#b5f900', grey: '#9aa3ad', white: '#ffffff', paper: '#f1f2f4', pink: '#ffb3c1' };
const CORPO = 'M256 174 C261.3 174 266.6 174 272 174.2 C277.3 174.4 282.7 174.7 288.1 175.3 C293.5 175.9 298.9 176.6 304.3 177.7 C309.7 178.8 315.2 180.1 320.5 181.8 C325.9 183.5 331.2 185.5 336.3 187.9 C341.4 190.3 346.5 193.1 351.2 196.2 C355.9 199.4 360.5 202.9 364.7 206.7 C368.8 210.5 372.7 214.7 376.2 219.1 C379.7 223.4 382.9 228.1 385.7 232.9 C388.4 237.7 390.8 242.7 392.8 247.8 C394.9 252.8 396.5 257.9 398 263.1 C399.4 268.2 400.8 273.3 401.7 278.4 C402.5 283.5 402.9 288.7 403.3 293.8 C403.7 298.9 403.8 303.9 404.1 309 C404.3 314.1 404.6 319.1 404.8 324.2 C405 329.3 405.3 334.5 405.5 339.8 C405.7 345.1 405.9 350.5 406 356.2 C406.1 361.8 406.2 367.6 405.9 373.5 C405.7 379.5 405.4 385.7 404.3 391.8 C403.1 397.8 401.7 404.3 399 409.8 C396.3 415.4 392.7 420.8 388 425.1 C383.3 429.4 377.2 432.8 370.9 435.4 C364.7 438 357.4 439.5 350.5 440.8 C343.7 442 336.5 442.5 329.7 443 C323 443.5 316.3 443.6 309.9 443.8 C303.5 443.9 297.3 443.9 291.2 444 C285.1 444 279.3 444 273.4 444 C267.5 444 261.8 444 256 444 C250.2 444 244.5 444 238.6 444 C232.7 444 226.9 444 220.8 444 C214.7 443.9 208.5 443.9 202.1 443.8 C195.7 443.6 189 443.5 182.3 443 C175.5 442.5 168.3 442 161.5 440.8 C154.6 439.5 147.3 438 141.1 435.4 C134.8 432.8 128.7 429.4 124 425.1 C119.3 420.8 115.7 415.4 113 409.8 C110.3 404.3 108.9 397.8 107.7 391.8 C106.6 385.7 106.3 379.5 106.1 373.5 C105.8 367.6 105.9 361.8 106 356.2 C106.1 350.5 106.3 345.1 106.5 339.8 C106.7 334.5 107 329.3 107.2 324.2 C107.4 319.1 107.7 314.1 107.9 309 C108.2 303.9 108.3 298.9 108.7 293.8 C109.1 288.7 109.5 283.5 110.3 278.4 C111.2 273.3 112.6 268.2 114 263.1 C115.5 257.9 117.1 252.8 119.2 247.8 C121.2 242.7 123.6 237.7 126.3 232.9 C129.1 228.1 132.3 223.4 135.8 219.1 C139.3 214.7 143.2 210.5 147.3 206.7 C151.5 202.9 156.1 199.4 160.8 196.2 C165.5 193.1 170.6 190.3 175.7 187.9 C180.8 185.5 186.1 183.5 191.5 181.8 C196.8 180.1 202.3 178.8 207.7 177.7 C213.1 176.6 218.5 175.9 223.9 175.3 C229.3 174.7 234.7 174.4 240 174.2 C245.4 174 250.7 174 256 174 Z';
const FOGLIA = 'M0 0 C-1.4 3.2 -6.4 5.5 -9.3 7.2 C-12.1 9 -14.5 9.7 -17.1 10.5 C-19.7 11.4 -22.4 11.8 -25 12.3 C-27.6 12.7 -30 12.9 -32.5 13 C-34.9 13.1 -37.4 13 -39.8 12.8 C-42.2 12.5 -44.6 12.1 -46.9 11.5 C-49.3 11 -51.6 10.2 -53.8 9.3 C-56.1 8.4 -58.2 7.4 -60.4 6.2 C-62.6 5 -64.8 3.5 -66.8 1.9 C-68.8 0.4 -70.7 -1.2 -72.4 -2.9 C-74.2 -4.7 -75.9 -6.6 -77.4 -8.6 C-79 -10.6 -80.4 -12.7 -81.7 -14.9 C-83 -17.1 -84.2 -19.4 -85.2 -21.8 C-86.2 -24.2 -87.3 -27 -88 -29.6 C-88.7 -32.1 -89.3 -34.7 -89.6 -37.3 C-90 -39.9 -90.2 -42.6 -90.2 -45.2 C-90.3 -47.9 -90.1 -50.6 -89.8 -53.2 C-89.5 -55.8 -89 -58.5 -88.3 -61.1 C-87.6 -63.6 -86.8 -66.1 -85.7 -68.7 C-84.7 -71.2 -83.5 -73.8 -82 -76.2 C-80.6 -78.5 -79.1 -80.6 -77 -82.6 C-74.9 -84.6 -71.8 -88.1 -69.3 -88.1 C-66.8 -88.2 -64.1 -84.4 -61.9 -82.8 C-59.7 -81.2 -58.1 -79.9 -56.3 -78.5 C-54.5 -77.2 -52.8 -75.8 -51.1 -74.7 C-49.4 -73.6 -47.8 -72.7 -46.2 -71.8 C-44.7 -70.8 -43.2 -70 -41.7 -69.3 C-40.3 -68.5 -38.8 -67.8 -37.5 -67.1 C-36.1 -66.5 -34.9 -65.9 -33.6 -65.2 C-32.4 -64.6 -31.2 -64.1 -30.1 -63.5 C-29 -62.9 -27.8 -62.2 -26.8 -61.6 C-25.8 -61 -24.8 -60.4 -23.9 -59.8 C-23 -59.1 -22.2 -58.5 -21.3 -57.8 C-20.5 -57.1 -19.7 -56.3 -19 -55.5 C-18.2 -54.7 -17.5 -53.8 -16.8 -52.9 C-16.1 -51.9 -15.3 -50.8 -14.6 -49.7 C-13.9 -48.6 -13.3 -47.5 -12.7 -46.2 C-12 -44.9 -11.4 -43.6 -10.8 -42.2 C-10.1 -40.7 -9.5 -39.2 -8.8 -37.6 C-8.2 -35.9 -7.5 -34.2 -6.8 -32.3 C-6.2 -30.5 -5.5 -28.6 -4.8 -26.4 C-4.1 -24.3 -3.2 -22 -2.5 -19.6 C-1.8 -17.1 -1 -14.9 -0.6 -11.7 C-0.2 -8.4 1.4 -3.2 0 0 Z';
const LUCE = 'M-27.7 -33.3 C-28 -33.6 -28.9 -34.5 -29.5 -35.2 C-30.2 -35.8 -30.9 -36.5 -31.5 -37.2 C-32.1 -37.8 -32.6 -38.4 -33.3 -39 C-33.9 -39.6 -34.6 -40.4 -35.2 -41 C-35.8 -41.6 -36.3 -42.2 -36.9 -42.8 C-37.5 -43.4 -38 -44 -38.6 -44.6 C-39.2 -45.2 -39.9 -46 -40.5 -46.6 C-41.1 -47.2 -41.6 -47.8 -42.2 -48.4 C-42.8 -49.1 -43.5 -49.8 -44.1 -50.4 C-44.6 -51.1 -45.5 -52 -45.7 -52.3';
// Misure sulla tela da 512: corpo 300 x 270 con la cima a 174, nodino del germoglio a 124.
const CX = 256, TOP = 174, BOT = 444, NODO = 124;
const OCCHI_Y = 322.5, XL = 202, XR = 310;
const BRACCIO_Y = 330.6, BRACCIO_X = 133.1, BRACCIO_L = 38, BRACCIO_R = 17;
// Rotazione verso l'interno che porta le punte delle foglie al centro: si toccano (e si coprono un po'), il batti cinque.
const TOCCO = 36.5;

const tratto = (w: number, c = C.ink) => ({ stroke: c, strokeWidth: w, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const });

interface Posa {
  braccia: [number, number]; // gradi sotto l'orizzontale (negativo = in alto)
  foglie: [number, number]; // gradi verso l'interno (+) o l'esterno (-)
  inclina?: number; // tutto il ciuffo
  occhi: 'punto' | 'felici' | 'grandi' | 'piccoli';
  guarda?: [number, number];
  bocca: 'sorriso' | 'aperta' | 'o' | 'hmm' | 'onda';
  piega?: number;
  salto?: number;
}

const POSE: Record<Umore, Posa> = {
  saluta: { braccia: [35, -50], foglie: [0, 0], occhi: 'punto', bocca: 'sorriso' },
  contento: { braccia: [35, 35], foglie: [10, 10], occhi: 'felici', bocca: 'aperta' },
  pensa: { braccia: [35, -12], foglie: [0, 0], inclina: -22, occhi: 'punto', guarda: [3, -4], bocca: 'hmm', piega: 5 },
  sorpreso: { braccia: [12, 12], foglie: [-24, -24], occhi: 'grandi', bocca: 'o' },
  scusa: { braccia: [62, 62], foglie: [-62, -62], occhi: 'piccoli', bocca: 'onda' },
  festeggia: { braccia: [-58, -58], foglie: [12, 12], occhi: 'felici', bocca: 'aperta', salto: -10 },
};

// La rotazione sta nello stile: festeggiando l'animazione la porta da --riposo a --tocco e ritorno.
function Foglia({ colore, specchio, gradi, tocca }: { colore: string; specchio?: boolean; gradi: number; tocca?: boolean }) {
  const g = (
    <g
      className={tocca ? 'ambud-tocca' : undefined}
      style={{ transform: `rotate(${gradi}deg)`, ['--riposo' as string]: `${gradi}deg`, ['--tocco' as string]: `${TOCCO}deg` }}
    >
      <path d={FOGLIA} fill={colore} {...tratto(7)} />
      <path d={LUCE} fill="none" {...tratto(6.5, C.white)} opacity={0.75} />
    </g>
  );
  return specchio ? <g transform="scale(-1 1)">{g}</g> : g;
}

function Ciuffo({ p, festa }: { p: Posa; festa: boolean }) {
  return (
    <>
      <path d={`M${CX} ${TOP + 8} C${CX + 7} ${TOP - 14} ${CX - 7} ${TOP - 34} ${CX} ${NODO}`} fill="none" {...tratto(8)} />
      <g transform={`translate(${CX} ${NODO}) rotate(${p.inclina ?? 0})`}>
        <g className={festa ? undefined : 'ambud-ciuffo'}>
          <Foglia colore={C.lime} gradi={p.foglie[0]} tocca={festa} />
          <Foglia colore={C.grey} specchio gradi={p.foglie[1]} tocca={festa} />
          <circle r="7" fill={C.ink} />
        </g>
      </g>
    </>
  );
}

function Occhi({ p }: { p: Posa }) {
  const [dx, dy] = p.guarda ?? [0, 0];
  if (p.occhi === 'felici') {
    return (
      <g fill="none" {...tratto(7.5)}>
        <path d={`M${XL - 13} ${OCCHI_Y + 4} Q${XL} ${OCCHI_Y - 16} ${XL + 13} ${OCCHI_Y + 4}`} />
        <path d={`M${XR - 13} ${OCCHI_Y + 4} Q${XR} ${OCCHI_Y - 16} ${XR + 13} ${OCCHI_Y + 4}`} />
      </g>
    );
  }
  const s = p.occhi === 'piccoli' ? 0.78 : 1;
  const grandi = p.occhi === 'grandi';
  const rx = (grandi ? 14 : 11) * s, ry = (grandi ? 16 : 14) * s, rl = grandi ? 5 : 4;
  return (
    <>
      <ellipse cx={XL + dx} cy={OCCHI_Y + dy} rx={rx} ry={ry} fill={C.ink} />
      <ellipse cx={XR + dx} cy={OCCHI_Y + dy} rx={rx} ry={ry} fill={C.ink} />
      {p.occhi !== 'piccoli' && (
        <>
          <circle cx={XL + dx + 4} cy={OCCHI_Y + dy - 5} r={rl} fill={C.white} />
          <circle cx={XR + dx + 4} cy={OCCHI_Y + dy - 5} r={rl} fill={C.white} />
        </>
      )}
    </>
  );
}

function Bocca({ p }: { p: Posa }) {
  const y = OCCHI_Y + 13;
  switch (p.bocca) {
    case 'sorriso': return <path d={`M${CX - 22} ${y} Q${CX} ${y + 17} ${CX + 22} ${y}`} fill="none" {...tratto(6)} />;
    case 'aperta': return (
      <>
        <path d={`M${CX - 17} ${y - 2} Q${CX} ${y - 1} ${CX + 17} ${y - 2} Q${CX + 15} ${y + 20} ${CX} ${y + 20} Q${CX - 15} ${y + 20} ${CX - 17} ${y - 2} Z`} fill={C.ink} {...tratto(4)} />
        <path d={`M${CX - 9} ${y + 16} Q${CX} ${y + 7} ${CX + 9} ${y + 16} Q${CX} ${y + 20} ${CX - 9} ${y + 16} Z`} fill={C.pink} />
      </>
    );
    case 'o': return <ellipse cx={CX} cy={y + 6} rx="8" ry="10" fill={C.ink} />;
    case 'hmm': return <path d={`M${CX - 6} ${y + 5} Q${CX + 6} ${y + 1} ${CX + 16} ${y + 4}`} fill="none" {...tratto(6)} />;
    case 'onda': return <path d={`M${CX - 18} ${y + 6} Q${CX - 9} ${y - 3} ${CX} ${y + 6} Q${CX + 9} ${y + 15} ${CX + 18} ${y + 6}`} fill="none" {...tratto(6)} />;
  }
}

// Braccio: una capsula che spunta da dietro il corpo (il corpo, disegnato dopo, copre l'attacco).
function Braccio({ lato, gradi }: { lato: 1 | -1; gradi: number }) {
  const d = `M0 0 L${BRACCIO_L} 0`;
  return (
    <g transform={`translate(${CX + lato * BRACCIO_X} ${BRACCIO_Y}) scale(${lato} 1) rotate(${gradi})`}>
      <path d={d} fill="none" stroke={C.ink} strokeWidth={2 * BRACCIO_R + 18} strokeLinecap="round" />
      <path d={d} fill="none" stroke={C.white} strokeWidth={2 * BRACCIO_R} strokeLinecap="round" />
    </g>
  );
}

const rad = (g: number) => (g * Math.PI) / 180;
const stella = (x: number, y: number, s: number) => `M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z`;
const CORIANDOLI: [number, number, number, string][] = [
  [CX - 196, TOP - 40, 18, C.lime], [CX + 190, TOP - 30, -24, C.grey], [CX - 170, TOP + 40, 40, C.grey],
  [CX + 200, TOP + 50, -10, C.lime], [CX - 120, TOP - 96, -30, C.grey], [CX + 128, TOP - 104, 30, C.lime],
];

// I segni attorno: onde del saluto, puntini del pensiero, lineette della sorpresa, goccia della scusa, coriandoli.
function Contorno({ umore }: { umore: Umore }): ReactNode {
  switch (umore) {
    case 'saluta': {
      const hx = CX + BRACCIO_X + (BRACCIO_L + BRACCIO_R) * Math.cos(rad(-50));
      const hy = BRACCIO_Y + (BRACCIO_L + BRACCIO_R) * Math.sin(rad(-50));
      return (
        <g fill="none" {...tratto(6)}>
          <path d={`M${hx + 24} ${hy - 30} Q${hx + 38} ${hy - 22} ${hx + 40} ${hy - 6}`} />
          <path d={`M${hx + 34} ${hy - 54} Q${hx + 56} ${hy - 42} ${hx + 60} ${hy - 18}`} />
        </g>
      );
    }
    case 'pensa': return (
      <g fill={C.ink} className="ambud-puntini">
        <circle cx={CX + 140} cy={TOP - 26} r="7" /><circle cx={CX + 166} cy={TOP - 52} r="9" /><circle cx={CX + 198} cy={TOP - 80} r="11" />
      </g>
    );
    case 'sorpreso': return (
      <g fill="none" {...tratto(6)}>
        <path d={`M${CX - 132} ${TOP + 10} L${CX - 152} ${TOP - 10}`} /><path d={`M${CX - 160} ${TOP + 44} L${CX - 186} ${TOP + 36}`} />
        <path d={`M${CX + 132} ${TOP + 10} L${CX + 152} ${TOP - 10}`} /><path d={`M${CX + 160} ${TOP + 44} L${CX + 186} ${TOP + 36}`} />
      </g>
    );
    case 'scusa': return (
      <>
        <g fill="none" {...tratto(5)}>
          <path d={`M${XL - 16} ${OCCHI_Y - 24} L${XL + 12} ${OCCHI_Y - 32}`} /><path d={`M${XR - 12} ${OCCHI_Y - 32} L${XR + 16} ${OCCHI_Y - 24}`} />
        </g>
        <path d={`M${CX + 118} ${TOP + 36} C${CX + 110} ${TOP + 50} ${CX + 104} ${TOP + 60} ${CX + 104} ${TOP + 68} C${CX + 104} ${TOP + 78} ${CX + 111} ${TOP + 84} ${CX + 118} ${TOP + 84} C${CX + 125} ${TOP + 84} ${CX + 132} ${TOP + 78} ${CX + 132} ${TOP + 68} C${CX + 132} ${TOP + 60} ${CX + 126} ${TOP + 50} ${CX + 118} ${TOP + 36} Z`} fill={C.white} {...tratto(5)} />
      </>
    );
    case 'festeggia': return (
      <g>
        {CORIANDOLI.map(([x, y, a, c], i) => <rect key={i} x={x - 9} y={y - 5} width="18" height="10" rx="4" transform={`rotate(${a} ${x} ${y})`} fill={c} {...tratto(4)} />)}
        <path d={`${stella(CX - 214, TOP + 4, 12)} ${stella(CX + 222, TOP - 74, 10)} ${stella(CX + 170, TOP + 104, 8)}`} fill={C.ink} />
      </g>
    );
    default: return null;
  }
}

// dimensione: l'altezza in px. Con "testa" restano germoglio, corpo e viso (per i posti piccoli).
// Senza "etichetta" è decorativo: accanto c'è sempre un testo che dice la stessa cosa.
export function Ambud({ umore = 'saluta', dimensione = 120, testa, etichetta, className = '' }: {
  umore?: Umore; dimensione?: number; testa?: boolean; etichetta?: string; className?: string;
}) {
  const p = POSE[umore];
  const festa = umore === 'festeggia';
  const ritaglio = `ambud-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [vx, vy, vw, vh] = testa ? [96, 26, 320, 428] : [16, 12, 480, 480];
  return (
    <svg
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      height={dimensione}
      width={Math.round((dimensione * vw) / vh)}
      className={`shrink-0 ${className}`}
      role={etichetta ? 'img' : undefined}
      aria-label={etichetta}
      aria-hidden={etichetta ? undefined : true}
    >
      <clipPath id={ritaglio}><path d={CORPO} /></clipPath>
      {!testa && <ellipse cx={CX} cy={BOT + 21} rx={festa ? 109 : 128} ry={festa ? 7.6 : 9} fill={C.ink} opacity="0.08" />}
      <g className={festa ? 'ambud-salta' : undefined}>
        <g transform={`translate(0 ${p.salto ?? 0}) rotate(${p.piega ?? 0} ${CX} ${BOT + 18})`}>
          {!testa && (
            <>
              <g fill={C.white} {...tratto(9)}>
                <ellipse cx={CX - 45} cy={BOT + 3} rx="30" ry="15" />
                <ellipse cx={CX + 45} cy={BOT + 3} rx="30" ry="15" />
              </g>
              <Braccio lato={-1} gradi={p.braccia[0]} />
              <Braccio lato={1} gradi={p.braccia[1]} />
            </>
          )}
          <Ciuffo p={p} festa={festa} />
          <path d={CORPO} fill={C.paper} />
          <g clipPath={`url(#${ritaglio})`}><path d={CORPO} transform="translate(-15 -13)" fill={C.white} /></g>
          <path d={CORPO} fill="none" {...tratto(9)} />
          <ellipse cx={CX - 72} cy={OCCHI_Y + 24} rx="20" ry="12" fill={C.pink} />
          <ellipse cx={CX + 72} cy={OCCHI_Y + 24} rx="20" ry="12" fill={C.pink} />
          <Occhi p={p} />
          <Bocca p={p} />
          {(!testa || umore === 'scusa') && <Contorno umore={umore} />}
        </g>
      </g>
    </svg>
  );
}
