// Le anteprime dei file prodotti: ogni pagina, documento e file di testo del cantiere, senza chiamate
// in più (il testo arriva già con la partita, fino a 20 000 caratteri a file). Le pagine si guardano
// in una cornice senza permessi: niente script, niente moduli, origine opaca. La cornice non può
// chiedere i file accanto alla pagina, quindi i fogli di stile e le immagini SVG prodotti nello stesso
// cantiere ci entrano dentro come testo, e la pagina ha una CSP sua che non lascia uscire richieste.
import { Monitor, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dibattito } from '../../../motore/tipi.ts';
import { api } from '../api.ts';
import { TestoMd } from '../hud/comuni.tsx';
import { usaPaginaConAllegati } from './Allegati.tsx';
import { componiPagina, copertinaDi, fileInOrdine, inCornice, nomeFile, tipoDi, type TipoFile } from '../pagine.ts';

// La partita intera, per le anteprime: si rilegge quando l'archivio dice che è cambiata.
export function usaDibattito(id: string | undefined, aggiornato: string | undefined): Dibattito | undefined {
  const [d, setD] = useState<Dibattito>();
  useEffect(() => {
    if (!id) return;
    let ok = true;
    api.dibattito(id).then((x) => { if (ok) setD(x.dibattito); }, () => undefined);
    return () => { ok = false; };
  }, [id, aggiornato]);
  return d?.id === id ? d : undefined;
}

// Una pagina larga come un computer (1280 px) rimpicciolita alla sua cornice. Ferma per le copertine,
// da scorrere nel foglio del lavoro.
export function PaginaInScala({ html, titolo, larga = 1280, interattiva }: { html: string; titolo: string; larga?: number; interattiva?: boolean }) {
  const cornice = useRef<HTMLDivElement>(null);
  const [scala, setScala] = useState(0);
  useEffect(() => {
    const el = cornice.current;
    if (!el) return;
    const misura = () => setScala(Math.min(1, el.clientWidth / larga));
    misura();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(misura);
    ro.observe(el);
    return () => ro.disconnect();
  }, [larga]);
  return (
    <div ref={cornice} className="absolute inset-0 overflow-hidden bg-white">
      {scala > 0 && (
        <iframe
          title={titolo}
          sandbox=""
          srcDoc={inCornice(html)}
          tabIndex={interattiva ? 0 : -1}
          scrolling={interattiva ? undefined : 'no'}
          className={`origin-top-left border-0 bg-white ${interattiva ? '' : 'pointer-events-none'}`}
          style={{ width: larga, height: `${100 / scala}%`, transform: `scale(${scala})` }}
        />
      )}
    </div>
  );
}

// La copertina di un lavoro nelle schede della plancia: la pagina, il documento o l'elenco dei file.
export function Miniatura({ d }: { d: Dibattito }) {
  const file = d.produzione?.file ?? [];
  const copertina = copertinaDi(file);
  const pagina = copertina && tipoDi(copertina.percorso) === 'pagina' ? copertina : undefined;
  const html = usaPaginaConAllegati(d, pagina ? componiPagina(file, pagina) : undefined);
  if (pagina && html !== undefined) return <PaginaInScala html={html} titolo={`Anteprima di ${pagina.percorso}`} />;
  if (copertina) {
    return (
      <div className="absolute inset-0 overflow-hidden bg-white px-4 pt-3 text-[12px] [mask-image:linear-gradient(#000_70%,transparent)]">
        <TestoMd testo={copertina.anteprima!.slice(0, 1200)} />
      </div>
    );
  }
  if (!file.length) return null;
  return (
    <ul className="absolute inset-0 overflow-hidden bg-white px-3 py-2.5 font-dati text-[11px] leading-relaxed text-grafite">
      {fileInOrdine(file).slice(0, 8).map((f) => <li key={f.percorso} className="truncate">{f.percorso}</li>)}
    </ul>
  );
}

const ETICHETTA_TIPO: Record<TipoFile, string> = { pagina: 'pagina', documento: 'documento', stile: 'stile', script: 'codice', dati: 'dati', testo: 'testo' };
const migliaia = (n: number) => n.toLocaleString('it-CH');

// Se nessun file si può mostrare: l'elenco, corto, al posto del visore.
export const conAnteprima = (d: Dibattito) => (d.produzione?.file ?? []).some((f) => f.anteprima !== undefined);

// Tutti i file prodotti, uno per scheda: la pagina come su un computer o su un telefono, i documenti
// impaginati, il resto come testo. Riempie l'altezza che le si dà. Si parte dal primo che si può
// mostrare; quelli troppo lunghi per l'anteprima restano nell'elenco con la loro misura.
export function VisoreFile({ d }: { d: Dibattito }) {
  const file = useMemo(() => fileInOrdine(d.produzione?.file ?? []), [d.produzione?.file]);
  const [scelto, setScelto] = useState<string>();
  const [schermo, setSchermo] = useState<'computer' | 'telefono'>('computer');
  const f = file.find((x) => x.percorso === scelto) ?? file.find((x) => x.anteprima !== undefined) ?? file[0];
  const tipo = f ? tipoDi(f.percorso) : 'testo';
  const html = usaPaginaConAllegati(d, f && tipo === 'pagina' && f.anteprima !== undefined ? componiPagina(file, f) : undefined);
  if (!f) return null;
  if (!conAnteprima(d)) {
    return (
      <div className="rounded-xl border border-bordo bg-white px-3 py-2.5">
        <p className="text-[12.5px] leading-snug text-grafite">Questi file non hanno l'anteprima (il limite è 20 000 caratteri a file e 150 000 per tutto il lavoro): li trovi interi nella cartella del lavoro.</p>
        <ul className="mt-1.5 grid gap-0.5 font-dati text-[11.5px]">
          {file.map((x) => <li key={x.percorso} className="flex gap-2"><span className="min-w-0 flex-1 truncate">{x.percorso}</span><span className="shrink-0 text-grafite">{migliaia(x.caratteri)} car.</span></li>)}
        </ul>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="scorri flex shrink-0 gap-1 overflow-x-auto pb-1" role="tablist" aria-label="File prodotti">
        {file.map((x) => {
          const attivo = x.percorso === f.percorso;
          return (
            <button
              key={x.percorso}
              role="tab"
              aria-selected={attivo}
              title={x.percorso}
              onClick={() => setScelto(x.percorso)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-titolo text-[12.5px] font-semibold ${attivo ? 'border-[#141518] bg-[#141518] text-white' : 'border-bordo bg-white hover:border-[#141518]'}`}
            >
              {nomeFile(x.percorso)}
              <span className={`font-dati text-[10px] font-normal ${attivo ? 'text-[#b5f900]' : 'text-grafite'}`}>{ETICHETTA_TIPO[tipoDi(x.percorso)]}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex shrink-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-dati text-[11px] text-grafite" title={f.percorso}>{f.percorso} · {migliaia(f.caratteri)} caratteri</span>
        {tipo === 'pagina' && html !== undefined && (
          <div className="flex gap-1" role="group" aria-label="Come guardare la pagina">
            <button className={`tasto !min-h-8 !px-2.5 text-[12px] ${schermo === 'computer' ? 'tasto-primario' : ''}`} aria-pressed={schermo === 'computer'} onClick={() => setSchermo('computer')}><Monitor size={14} /> Computer</button>
            <button className={`tasto !min-h-8 !px-2.5 text-[12px] ${schermo === 'telefono' ? 'tasto-primario' : ''}`} aria-pressed={schermo === 'telefono'} onClick={() => setSchermo('telefono')}><Smartphone size={14} /> Telefono</button>
          </div>
        )}
      </div>
      <div className="relative mt-1.5 min-h-0 flex-1 overflow-hidden rounded-xl border-[1.5px] border-[#141518] bg-[#d9dce0]" role="tabpanel" aria-label={f.percorso}>
        {f.anteprima === undefined ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <p className="max-w-sm text-[13px] text-grafite">{f.caratteri > 20_000 ? `Questo file è troppo lungo per l'anteprima (${migliaia(f.caratteri)} caratteri, il limite è 20 000).` : 'Le anteprime di questo lavoro hanno già raggiunto i 150 000 caratteri: questo file è rimasto fuori.'} Lo trovi intero nella cartella del lavoro.</p>
          </div>
        ) : tipo === 'pagina' && html !== undefined ? (
          schermo === 'computer'
            ? <PaginaInScala html={html} titolo={`Anteprima di ${f.percorso}`} interattiva />
            : (
              <div className="flex h-full justify-center overflow-hidden py-3">
                <iframe title={`Anteprima di ${f.percorso} su un telefono`} sandbox="" srcDoc={inCornice(html)} className="h-full w-[390px] max-w-full rounded-[18px] border-[6px] border-[#141518] bg-white" />
              </div>
            )
        ) : tipo === 'documento' ? (
          <div className="scorri h-full overflow-y-auto bg-white px-5 py-4 text-[14px]"><TestoMd testo={f.anteprima} /></div>
        ) : (
          <pre className="scorri h-full overflow-auto bg-white p-3 font-dati text-[12px] leading-relaxed text-[#26282c]">{f.anteprima}</pre>
        )}
      </div>
    </div>
  );
}
