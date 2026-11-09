// Il magazzino nel documento: si manda in produzione la decisione, si segue il lavoro e si leggono
// i file consegnati con il collaudo di Codex. Si avvia solo con una conferma esplicita.
import { Factory, FileText, Square } from 'lucide-react';
import { useState } from 'react';
import type { Dibattito, StatoProduzione } from '../../../motore/tipi.ts';
import { api } from '../api.ts';
import { TestoMd } from './comuni.tsx';

const STATO: Record<StatoProduzione, { testo: string; stile: string }> = {
  in_lavorazione: { testo: 'In lavorazione', stile: 'bg-[#f1f2f4] text-[#141518]' },
  collaudo: { testo: 'In collaudo', stile: 'bg-[#eceef1] text-[#3d4249]' },
  pronta: { testo: 'Consegna pronta', stile: 'bg-[#effcc9] text-[#3f5600]' },
  fermata: { testo: 'Fermata', stile: 'bg-[#eceef1] text-[#4a5058]' },
  errore: { testo: 'Errore', stile: 'bg-[#f1f2f4] text-[#9b2626]' },
};

// soloLettura: nel replay si guarda soltanto, niente comandi.
export function Produzione({ dibattito: d, cartelle, soloLettura }: { dibattito: Dibattito; cartelle: { nome: string; file: number }[]; soloLettura: boolean }) {
  const p = d.produzione;
  const [conferma, setConferma] = useState(false);
  const [base, setBase] = useState('');
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string>();
  const [aperto, setAperto] = useState<string | null>(null);
  // Avviata da qui, in attesa che la partita mostri la produzione nuova.
  const [avviata, setAvviata] = useState<string | null>(null);
  const inizioVisto = p?.inizio ?? null;
  const attesa = avviata !== null && avviata === (inizioVisto ?? '');
  const inCorso = p?.stato === 'in_lavorazione' || p?.stato === 'collaudo';

  const esegui = async (f: () => Promise<unknown>, avvio = false) => {
    setOccupato(true);
    setErrore(undefined);
    try {
      await f();
      if (avvio) setAvviata(inizioVisto ?? '');
      setConferma(false);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setOccupato(false);
    }
  };

  if (!d.sintesi || d.stato !== 'concluso') return null;

  return (
    <section className="mt-5 rounded-xl border border-bordo bg-[#f4f5f7] px-3 py-3" aria-label="Produzione">
      <div className="flex flex-wrap items-center gap-2">
        <Factory size={18} />
        <h3 className="font-titolo text-[16px] font-bold">Produzione</h3>
        {p && (p.stato === 'pronta' && p.collaudo && !p.collaudo.approvato ? (
          <span className="rounded-full bg-[#eceef1] px-2 py-0.5 font-titolo text-[11px] font-bold uppercase text-[#3d4249]">Consegna da rivedere</span>
        ) : (
          <span className={`rounded-full px-2 py-0.5 font-titolo text-[11px] font-bold uppercase ${STATO[p.stato].stile}`}>{STATO[p.stato].testo}</span>
        ))}
      </div>

      {attesa && <p className="mt-1 text-[13px] text-grafite">Avvio della produzione…</p>}
      {!p && !conferma && !attesa && (
        <>
          <p className="mt-1 text-[13px] text-grafite">La decisione passa al magazzino: Claude la costruisce in una cartella tutta sua, Codex fa il collaudo. Se il collaudo la respinge, Claude corregge e Codex ricontrolla, al massimo due volte.</p>
          <button className="tasto tasto-primario mt-2" disabled={soloLettura} onClick={() => setConferma(true)}><Factory size={16} /> Manda in produzione</button>
        </>
      )}

      {conferma && (
        <div className="mt-2 rounded-lg border border-[#c4c8ce] bg-[#f8fbe9] p-3 text-[13px]">
          <p className="font-semibold">Prima di partire, cosa possono fare gli agenti:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>Claude scrive file solo in una cartella nuova (il cantiere), dentro i dati del programma sul PC.</li>
            <li>Niente comandi, niente installazioni, niente internet. Al massimo 40 passaggi e 25 minuti.</li>
            <li>Codex legge quello che è stato scritto e dà il collaudo; se lo respinge, Claude corregge e Codex ricontrolla (al massimo due correzioni). Tutti e due {d.config.memoria ? 'consultano le tue note in sola lettura' : 'lavorano senza le tue note'}.</li>
            <li>Consuma quota degli abbonamenti, come un dibattito un po' lungo.</li>
          </ul>
          <label className="mt-2 flex flex-col gap-1">
            <span className="etichetta">Da dove parte</span>
            <select className="campo !py-2" value={base} onChange={(e) => setBase(e.target.value)}>
              <option value="">Cartella vuota</option>
              {cartelle.map((c) => <option key={c.nome} value={c.nome}>Copia di "{c.nome}" ({c.file} file)</option>)}
            </select>
          </label>
          <p className="mt-1 text-[12px] text-grafite">Con una copia, la cartella originale non viene toccata: si lavora su un duplicato ripulito da credenziali e dipendenze.</p>
          <div className="mt-2 flex gap-2">
            <button className="tasto tasto-primario" disabled={occupato || soloLettura} onClick={() => void esegui(() => api.produci(d.id, base || null), true)}>{occupato ? 'Avvio…' : 'Sì, costruisci'}</button>
            <button className="tasto" onClick={() => setConferma(false)}>Annulla</button>
          </div>
        </div>
      )}

      {p && (
        <div className="mt-2 text-[13px]">
          <p className="text-grafite">
            {p.base ? `Partita da una copia di "${p.base}".` : 'Partita da una cartella vuota.'}
            {p.cantiere && <> I file sono in <code className="break-all">{p.cantiere}</code>.</>}
          </p>
          {inCorso && (
            <button className="tasto mt-2" disabled={occupato || soloLettura} onClick={() => void esegui(() => api.pausa(d.id))}><Square size={14} /> Ferma la produzione</button>
          )}
          {p.errore && <p className="mt-2 text-[#9b2626]">{p.errore.split('\n')[0]}</p>}
          {p.resoconto && (
            <div className="mt-2 rounded-lg bg-[#ffffff] px-3 py-2">
              <h4 className="etichetta">Resoconto di Claude</h4>
              <div className="mt-1"><TestoMd testo={p.resoconto} /></div>
            </div>
          )}
          {p.giri && p.giri.length > 0 && (
            <details className="mt-2 rounded-lg border border-bordo bg-white px-3 py-2">
              <summary className="cursor-pointer text-[12.5px] font-semibold">Collaudi precedenti ({p.giri.length}): respinti e corretti</summary>
              <ol className="mt-1 space-y-1.5">
                {p.giri.map((g) => (
                  <li key={g.giro}>
                    <span className="etichetta">Giro {g.giro}</span>
                    <ul className="list-disc pl-5">{g.collaudo.problemi.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </li>
                ))}
              </ol>
            </details>
          )}
          {p.collaudo && (
            <div className={`mt-2 rounded-lg border px-3 py-2 ${p.collaudo.approvato ? 'border-[#b5f900] bg-[#f6fde3]' : 'border-[#141518] bg-[#f6f7f8]'}`}>
              <h4 className="etichetta">Collaudo di Codex{p.giro && p.giro > 1 ? ` (giro ${p.giro})` : ''}: {p.collaudo.approvato ? 'superato' : 'non superato'}</h4>
              <p className="mt-1">{p.collaudo.commento}</p>
              {p.collaudo.problemi.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5">{p.collaudo.problemi.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            </div>
          )}
          {p.file.length > 0 && (
            <>
              <h4 className="etichetta mt-3">File consegnati ({p.file.length})</h4>
              <ul className="mt-1 space-y-1">
                {p.file.map((f) => (
                  <li key={f.percorso}>
                    <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-cartaScura" aria-expanded={aperto === f.percorso} onClick={() => setAperto(aperto === f.percorso ? null : f.percorso)} disabled={f.anteprima === undefined}>
                      <FileText size={14} />
                      <span className="min-w-0 flex-1 truncate font-dati text-[12.5px]">{f.percorso}</span>
                      <span className="text-[11px] text-grafite">{f.anteprima === undefined ? 'troppo grande per l\'anteprima' : `${f.caratteri} car.`}</span>
                    </button>
                    {aperto === f.percorso && f.anteprima !== undefined && (
                      <pre className="scorri mt-1 max-h-72 overflow-auto rounded-md bg-[#0b0c0e] p-3 font-dati text-[12px] leading-snug text-[#e9ebee]">{f.anteprima}</pre>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {!inCorso && !attesa && (
            <button className="tasto mt-3" disabled={occupato || soloLettura} onClick={() => setConferma(true)}><Factory size={14} /> Rifai la produzione</button>
          )}
        </div>
      )}
      {errore && <p className="mt-2 text-[13px] text-[#9b2626]" role="alert">{errore}</p>}
    </section>
  );
}
