// Il ritratto di un assistente: un robot del diorama su una tessera della sua tinta.
// Tratto nero pulito, lime per i dettagli accesi, nessuna emoji. I tratti vengono da avatar.ts.
import { useId, type ReactNode } from 'react';
import { LIME, NERO, schiarisci, tratti, type Accessorio, type Bocca, type Occhi, type Testa } from '../avatar.ts';

const T = { stroke: NERO, strokeWidth: 2.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

function testa(forma: Testa, tinta: string): ReactNode {
  const p = { fill: tinta, ...T };
  switch (forma) {
    case 'tondo': return <circle cx="32" cy="30" r="16" {...p} />;
    case 'quadro': return <rect x="15" y="14" width="34" height="32" rx="7" {...p} />;
    case 'capsula': return <rect x="17" y="11" width="30" height="36" rx="15" {...p} />;
    case 'esagono': return <path d="M32 12 L48 21 V39 L32 48 L16 39 V21 Z" {...p} />;
    case 'scudo': return <path d="M15 15 H49 V30 C49 40 41 46 32 47.5 C23 46 15 40 15 30 Z" {...p} />;
    case 'schermo': return <path d="M18 14 H46 Q48 14 48.4 16 L51 43 Q51 46 48 46 H16 Q13 46 13 43 L15.6 16 Q16 14 18 14 Z" {...p} />;
    case 'ovale': return <ellipse cx="32" cy="30" rx="15" ry="17.5" {...p} />;
  }
}

function occhi(tipo: Occhi): ReactNode {
  switch (tipo) {
    case 'punti': return <><circle cx="25.5" cy="29" r="3.3" fill={NERO} /><circle cx="38.5" cy="29" r="3.3" fill={NERO} /><circle cx="26.6" cy="27.9" r="1" fill="#fff" /><circle cx="39.6" cy="27.9" r="1" fill="#fff" /></>;
    case 'visiera': return <><rect x="19" y="24" width="26" height="10" rx="5" fill={NERO} /><rect x="23" y="27.5" width="6" height="3" rx="1.5" fill={LIME} /><rect x="35" y="27.5" width="6" height="3" rx="1.5" fill={LIME} /></>;
    case 'anelli': return <><path d="M30 29 H34" {...T} /><circle cx="25" cy="29" r="5" fill="#fff" {...T} /><circle cx="39" cy="29" r="5" fill="#fff" {...T} /><circle cx="25" cy="29" r="2" fill={NERO} /><circle cx="39" cy="29" r="2" fill={NERO} /></>;
    case 'lineette': return <><path d="M21 30.5 Q25 25.5 29 30.5" fill="none" {...T} strokeWidth={2.8} /><path d="M35 30.5 Q39 25.5 43 30.5" fill="none" {...T} strokeWidth={2.8} /></>;
    case 'occhio': return <><circle cx="32" cy="28" r="7.5" fill="#fff" {...T} /><circle cx="32" cy="28" r="4" fill={LIME} /><circle cx="32" cy="28" r="2" fill={NERO} /></>;
    case 'quadrati': return <><rect x="21.5" y="25.5" width="7" height="7" rx="1.6" fill={NERO} /><rect x="35.5" y="25.5" width="7" height="7" rx="1.6" fill={NERO} /><rect x="23" y="27" width="2.2" height="2.2" fill="#fff" /><rect x="37" y="27" width="2.2" height="2.2" fill="#fff" /></>;
  }
}

function bocca(tipo: Bocca): ReactNode {
  switch (tipo) {
    case 'linea': return <path d="M27.5 39 H36.5" fill="none" {...T} />;
    case 'sorriso': return <path d="M26.5 37.5 Q32 42.5 37.5 37.5" fill="none" {...T} />;
    case 'griglia': return <><rect x="25" y="36" width="14" height="6" rx="2" fill="#fff" {...T} strokeWidth={2} /><path d="M29.7 36 V42 M34.3 36 V42" {...T} strokeWidth={1.6} /></>;
    case 'nessuna': return null;
  }
}

// Gli accessori sotto la testa (spuntano da dietro) e quelli sopra (cappelli, cuffie).
function sotto(a: Accessorio): ReactNode {
  switch (a) {
    case 'antenna': return <><path d="M32 20 V6.5" fill="none" {...T} /><circle cx="32" cy="5.5" r="3.2" fill={LIME} {...T} strokeWidth={2} /></>;
    case 'doppia': return <><path d="M25 18 L20 6.5 M39 18 L44 6.5" fill="none" {...T} /><circle cx="19.6" cy="5.8" r="2.7" fill={LIME} {...T} strokeWidth={2} /><circle cx="44.4" cy="5.8" r="2.7" fill={LIME} {...T} strokeWidth={2} /></>;
    case 'cresta': return <path d="M25 17 L32 3.5 L39 17 Z" fill={LIME} {...T} strokeWidth={2} />;
    case 'matita': return <g transform="rotate(32 46 14)"><rect x="43" y="1" width="6.5" height="18" rx="1.2" fill={LIME} {...T} strokeWidth={2} /><path d="M43 19 L46.25 25 L49.5 19 Z" fill={NERO} /></g>;
    case 'bulloni': return <><rect x="9.5" y="25" width="8" height="10" rx="2" fill={LIME} {...T} strokeWidth={2} /><rect x="46.5" y="25" width="8" height="10" rx="2" fill={LIME} {...T} strokeWidth={2} /></>;
    default: return null;
  }
}

function sopra(a: Accessorio): ReactNode {
  switch (a) {
    case 'cuffie': return <><path d="M13.5 31 C13.5 11 50.5 11 50.5 31" fill="none" {...T} strokeWidth={3.4} /><rect x="9.5" y="25" width="8" height="13" rx="3" fill={NERO} /><rect x="46.5" y="25" width="8" height="13" rx="3" fill={NERO} /><circle cx="13.5" cy="31.5" r="1.8" fill={LIME} /><circle cx="50.5" cy="31.5" r="1.8" fill={LIME} /></>;
    case 'elmetto': return <><path d="M16 21 C16 8 48 8 48 21 Z" fill={LIME} {...T} strokeWidth={2.2} /><path d="M32 9.5 V20" {...T} strokeWidth={1.8} /><rect x="11.5" y="19.5" width="41" height="4.5" rx="2.2" fill={LIME} {...T} strokeWidth={2.2} /></>;
    case 'basco': return <><ellipse cx="29" cy="15.5" rx="17" ry="6.2" transform="rotate(-9 29 15.5)" fill={NERO} /><circle cx="27" cy="8.6" r="2.2" fill={NERO} /></>;
    case 'berretto': return <><path d="M16.5 21 C16.5 8.5 47.5 8.5 47.5 21 Z" fill={NERO} /><path d="M44 18.6 H56 Q58.4 18.6 57 21.4 L45.5 21.6 Z" fill={NERO} /><circle cx="32" cy="10.5" r="1.6" fill={LIME} /></>;
    default: return null;
  }
}

// dimensione in px; tondo per i posti piccoli (cartellini in scena). Il nome per gli screen reader
// lo mette chi lo usa (di solito accanto c'è già scritto): senza "etichetta" il ritratto è decorativo.
export function Avatar({ id, dimensione = 40, etichetta, tondo, className = '' }: { id: string; dimensione?: number; etichetta?: string; tondo?: boolean; className?: string }) {
  const t = tratti(id);
  const ritaglio = `avatar-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      viewBox="0 0 64 64"
      width={dimensione}
      height={dimensione}
      className={`shrink-0 ${className}`}
      role={etichetta ? 'img' : undefined}
      aria-label={etichetta}
      aria-hidden={etichetta ? undefined : true}
    >
      <clipPath id={ritaglio}>{tondo ? <circle cx="32" cy="32" r="32" /> : <rect width="64" height="64" rx="15" />}</clipPath>
      <g clipPath={`url(#${ritaglio})`}>
        <rect width="64" height="64" fill={schiarisci(t.tinta, 0.78)} />
        {/* Le spalle: un busto nero, come gli omini della sala. */}
        <path d="M13 64 C13 53 21 48.5 32 48.5 C43 48.5 51 53 51 64 Z" fill={NERO} />
        <path d="M27 48.5 H37 L35.5 54 H28.5 Z" fill={t.tinta} />
        {sotto(t.accessorio)}
        {testa(t.testa, t.tinta)}
        {occhi(t.occhi)}
        {bocca(t.bocca)}
        {sopra(t.accessorio)}
      </g>
    </svg>
  );
}
