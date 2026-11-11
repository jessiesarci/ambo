// La plancia del computer, accanto alla chat: i lavori con le loro anteprime (prima quelli di questa
// chat, poi gli ultimi delle altre) e in alto a destra l'ufficio 3D in un riquadro. Il 3D resta acceso
// ma non fa più da sfondo: si ingrandisce a richiesta e si rimpicciolisce con un tasto.
import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Riassunto } from '../api.ts';
import { Ambud } from '../hud/Ambud.tsx';
import { quanti } from '../hud/comuni.tsx';
import { INQUADRATURE, type Inquadratura } from '../scena/Telecamera.tsx';
import { Miniatura, usaDibattito } from './Anteprime.tsx';
import { attivo, badgeDel, Chip, esitoDi, fa, faseDi, passiDelLavoro, Tappe, usaTic } from './Lavoro.tsx';

// Il riquadro dell'ufficio: largo poco più di un quarto dello schermo, tra 320 e 440 px. Lo stesso
// calcolo serve all'App, che ci disegna la scena, e alla plancia, che gli lascia il posto.
const misuraRiquadro = () => {
  const larghezza = Math.round(Math.min(440, Math.max(320, window.innerWidth * 0.28)));
  return { larghezza, altezza: Math.round(larghezza * 0.68) };
};
export function usaRiquadroUfficio(): { larghezza: number; altezza: number } {
  const [r, setR] = useState(misuraRiquadro);
  useEffect(() => {
    const f = () => setR(misuraRiquadro());
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return r;
}

export interface LavoroInPlancia { r: Riassunto; titolo: string; conProduzione: boolean }
export interface ComandiUfficio { grande: boolean; inquadratura: Inquadratura; onInquadratura: (i: Inquadratura) => void; onGrande: (grande: boolean) => void }

export function BottoniInquadratura({ u, piccoli }: { u: ComandiUfficio; piccoli?: boolean }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Inquadratura">
      {(Object.keys(INQUADRATURE) as Inquadratura[]).map((k) => (
        <button key={k} className={`tasto ${piccoli ? '!min-h-7 !px-2 text-[11px]' : '!min-h-8 !px-2.5 text-[12px]'} ${u.inquadratura === k ? 'tasto-primario' : ''}`} aria-pressed={u.inquadratura === k} onClick={() => u.onInquadratura(k)}>
          {INQUADRATURE[k].etichetta}
        </button>
      ))}
    </div>
  );
}

// Il tasto per tornare dalla vista grande dell'ufficio alla plancia, con le inquadrature.
export function UfficioGrande({ u }: { u: ComandiUfficio }) {
  return (
    <div className="pannello pointer-events-auto fixed right-3 top-3 z-20 flex items-center gap-1 p-1">
      <BottoniInquadratura u={u} />
      <button className="tasto !min-h-8 !px-2.5 text-[12px]" onClick={() => u.onGrande(false)}><Minimize2 size={14} /> Torna alla plancia</button>
    </div>
  );
}

// Senza file da mostrare: a che punto è, su fondo scuro come la testata del foglio.
function Copertina({ r, conclusione }: { r: Riassunto; conclusione?: string }) {
  const vivo = attivo(r);
  return (
    <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-[#141518] p-3 text-white">
      <span className="absolute right-3 top-3 opacity-90"><Ambud umore={vivo ? 'pensa' : r.stato === 'errore' || r.produzione === 'errore' ? 'scusa' : 'contento'} testa dimensione={40} /></span>
      <b className="font-titolo text-[17px] font-bold leading-tight text-[#b5f900]">{vivo ? faseDi(r) : esitoDi(r)}</b>
      {conclusione && <p className="line-clamp-3 text-[12px] leading-snug text-[#c9cdd2]">{conclusione}</p>}
    </div>
  );
}

function CartaPlancia({ x, onApri }: { x: LavoroInPlancia; onApri: () => void }) {
  const { r } = x;
  const vivo = attivo(r);
  usaTic(vivo);
  // La partita intera serve solo se ha file o una sintesi da mostrare.
  const d = usaDibattito(r.produzione || r.stato === 'concluso' ? r.id : undefined, r.aggiornato);
  const badge = badgeDel(r, true);
  const nFile = d?.produzione?.file.length ?? 0;
  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl border-[1.5px] border-[#141518] bg-white shadow-[0_2px_0_#141518] transition-shadow hover:shadow-[0_4px_0_#141518]">
      <div className="relative aspect-[16/10] w-full overflow-hidden border-b-[1.5px] border-[#141518] bg-[#eef0f2]">
        {d && nFile > 0 ? <Miniatura d={d} /> : <Copertina r={r} conclusione={d?.sintesi?.testo.conclusione} />}
        <span className="absolute left-2 top-2"><Chip stile={badge.stile}>{badge.testo}</Chip></span>
      </div>
      <div className="px-3 pb-3 pt-2.5">
        <h3 className="line-clamp-2 font-titolo text-[14px] font-bold leading-snug">{x.titolo}</h3>
        <Tappe passi={passiDelLavoro(r, d, x.conProduzione)} />
        <p className="mt-1.5 truncate font-dati text-[11px] text-grafite">
          {vivo ? `${faseDi(r)} · ultima novità ${fa(r.aggiornato)}` : [esitoDi(r), nFile ? quanti(nFile, 'file', 'file') : '', fa(r.aggiornato)].filter(Boolean).join(' · ')}
        </p>
      </div>
      {/* Tutta la carta apre il lavoro: il tasto le sta sopra, la cornice dell'anteprima non prende i tocchi. */}
      <button className="absolute inset-0 rounded-2xl focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[#b5f900]" onClick={onApri} aria-label={`Apri il lavoro: ${x.titolo}`} />
    </article>
  );
}

function Gruppo({ titolo, lavori, onApri }: { titolo: string; lavori: LavoroInPlancia[]; onApri: (x: LavoroInPlancia) => void }) {
  if (!lavori.length) return null;
  return (
    <section className="mt-4 first:mt-0">
      <h2 className="etichetta">{titolo} · {lavori.length}</h2>
      <div className="mt-2 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
        {lavori.map((x) => <CartaPlancia key={x.r.id} x={x} onApri={() => onApri(x)} />)}
      </div>
    </section>
  );
}

export function Plancia({ questa, altri, ufficio, onApri, children }: {
  questa: LavoroInPlancia[]; altri: LavoroInPlancia[]; ufficio: ComandiUfficio;
  onApri: (x: LavoroInPlancia) => void; children?: ReactNode;
}) {
  const riquadro = usaRiquadroUfficio();
  const alLavoro = [...questa, ...altri].filter((x) => attivo(x.r));
  return (
    <div className="pointer-events-none fixed inset-y-3 left-[464px] right-3 z-10 grid gap-3" style={{ gridTemplateColumns: `minmax(0,1fr) ${riquadro.larghezza}px` }}>
      <div className="scorri pointer-events-auto min-h-0 overflow-y-auto pb-3 pr-1" aria-label="I lavori e le loro anteprime">
        {questa.length || altri.length ? (
          <>
            <Gruppo titolo="I lavori di questa chat" lavori={questa} onApri={onApri} />
            <Gruppo titolo={questa.length ? 'Dalle altre chat' : 'Gli ultimi lavori'} lavori={altri} onApri={onApri} />
          </>
        ) : (
          <div className="grid h-full place-items-center text-center">
            <div className="flex max-w-sm flex-col items-center gap-2">
              <Ambud umore="saluta" dimensione={96} />
              <p className="font-titolo text-[17px] font-bold">Qui compaiono i lavori.</p>
              <p className="text-[13.5px] text-grafite">Quando una richiesta in chat diventa un compito, qui vedi a che punto è e l'anteprima di quello che hanno prodotto.</p>
            </div>
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-col gap-3">
        {/* Il posto del riquadro: la tela 3D la disegna l'App qui sotto, questo resta trasparente. */}
        <div className="relative shrink-0" style={{ height: riquadro.altezza }}>
          <div className="pointer-events-auto absolute inset-x-2 bottom-2 flex items-center justify-between gap-1">
            <BottoniInquadratura u={ufficio} piccoli />
            <button className="tasto tasto-icona !min-h-7 !w-7 !p-0" onClick={() => ufficio.onGrande(true)} aria-label="Ingrandisci l'ufficio 3D" title="Ingrandisci l'ufficio"><Maximize2 size={14} /></button>
          </div>
        </div>
        <div className="pannello scorri pointer-events-auto min-h-0 flex-1 overflow-y-auto p-3">
          <h2 className="etichetta">Adesso in ufficio</h2>
          {alLavoro.length ? (
            <ul className="mt-1.5 grid gap-1">
              {alLavoro.map((x) => (
                <li key={x.r.id}>
                  <button className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[12.5px] hover:bg-cartaScura" onClick={() => onApri(x)}>
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#b5f900] ring-1 ring-[#141518]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{x.titolo}</span>
                      <span className="block truncate text-[11.5px] text-grafite">{faseDi(x.r)} · {fa(x.r.aggiornato)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-[12.5px] text-grafite">Nessun lavoro in corso.</p>}
          {children && <div className="mt-3 border-t border-bordo pt-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}
