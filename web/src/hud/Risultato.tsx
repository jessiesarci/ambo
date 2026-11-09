// Il documento finale, come un foglio appena uscito dalla stampante, con il timbro del revisore.
import { Play, X } from 'lucide-react';
import { NOME, altro, type Dibattito } from '../../../motore/tipi.ts';
import { ETICHETTE_ESITO } from '../stato.ts';
import { BottoneMarkdown, NomeAgente, PastigliaStato, usaFinestra } from './comuni.tsx';
import { Produzione } from './Produzione.tsx';

export function Risultato({ dibattito: d, onChiudi, onRivedi, cartelle = [], soloLettura = false }: { dibattito: Dibattito; onChiudi: () => void; onRivedi?: () => void; cartelle?: { nome: string; file: number }[]; soloLettura?: boolean }) {
  const s = d.sintesi?.testo;
  const v = d.verifica?.testo;
  const revisore = d.sintesi ? NOME[altro(d.sintesi.relatore)] : '';
  const pannello = usaFinestra(onChiudi);
  const finali = (['claude', 'codex'] as const).map((a) => [...d.turni].reverse().find((t) => t.agente === a)).filter((t) => !!t);

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-[#0b0c0e]/35 p-2 sm:items-center sm:p-6" onClick={onChiudi}>
      <article
        ref={pannello}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titolo-risultato"
        className="relative flex max-h-[92vh] w-full max-w-2xl animate-[comparsa_.3s_ease-out] flex-col overflow-hidden rounded-[6px] bg-[#ffffff] shadow-[0_24px_60px_rgba(30,20,10,.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-dashed border-bordo px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <div className="etichetta">Documento finale</div>
            <h2 id="titolo-risultato" className="mt-1 font-titolo text-[22px] font-bold leading-tight">{d.esito ? ETICHETTE_ESITO[d.esito] : 'Partita non conclusa'}</h2>
            <p className="mt-1 text-[13px] text-grafite">{d.motivoEsito}</p>
            <p className="mt-2 line-clamp-3 text-[13px] italic" title={d.config.domanda}>«{d.config.domanda}»</p>
          </div>
          <button className="tasto tasto-icona" onClick={onChiudi} aria-label="Chiudi il documento">
            <X size={18} />
          </button>
        </div>

        <div className="scorri relative flex-1 overflow-y-auto px-5 py-4 text-[14px] leading-relaxed">
          {v && (
            <div
              className={`pointer-events-none absolute right-6 top-3 animate-[timbro_.5s_ease-out_forwards] rounded-md border-[3px] px-3 py-1 font-titolo text-[15px] font-bold uppercase tracking-widest opacity-0 ${v.approvata ? 'border-[#3f5600] text-[#3f5600]' : 'border-[#9b2626] text-[#9b2626]'}`}
              aria-label={v.approvata ? `Sintesi approvata da ${revisore}` : `Sintesi non approvata da ${revisore}`}
            >
              {v.approvata ? 'Approvata' : 'Non approvata'}
              <div className="text-center text-[10px] tracking-wider">{revisore}</div>
            </div>
          )}

          {s ? (
            <>
              <p className="mb-1 text-[12px] italic text-grafite">Sintesi scritta da {NOME[d.sintesi!.relatore]}{v ? `, verificata da ${revisore}` : ''}.</p>
              <h3 className="etichetta mt-3">Conclusione</h3>
              <p className="mt-1 pr-28">{s.conclusione}</p>
              <Sezione titolo="Decisioni condivise" voci={s.decisioni} vuoto="Nessuna decisione condivisa." />
              <Sezione titolo="Motivazioni" voci={s.motivazioni} />
              <h3 className="etichetta mt-4">Disaccordi irrisolti</h3>
              {s.disaccordi.length ? (
                <ul className="mt-1 space-y-2">
                  {s.disaccordi.map((x, i) => (
                    <li key={i} className="rounded-lg bg-cartaScura px-3 py-2">
                      <div className="font-semibold">{x.punto}</div>
                      <div className="mt-1 text-[13px]"><NomeAgente agente="claude" piccolo />: {x.posizione_claude}</div>
                      <div className="text-[13px]"><NomeAgente agente="codex" piccolo />: {x.posizione_codex}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-grafite">Nessuno riportato nella sintesi.</p>
              )}
              <Sezione titolo="Prossimi passi" voci={s.prossimi_passi} />
              {v && (
                <div className={`mt-4 rounded-xl border px-3 py-2 ${v.approvata ? 'border-[#b5f900] bg-[#f6fde3]' : 'border-[#141518] bg-[#f6f7f8]'}`}>
                  <h3 className="etichetta">Verifica di {revisore}</h3>
                  <p className="mt-1">{v.commento}</p>
                  {v.correzioni.length > 0 && <Sezione titolo="Correzioni" voci={v.correzioni} />}
                  {v.disaccordi_mancanti.length > 0 && <Sezione titolo="Disaccordi che la sintesi non riporta" voci={v.disaccordi_mancanti} />}
                </div>
              )}
            </>
          ) : (
            <p className="text-grafite">La sintesi non c'è: la partita si è fermata prima.</p>
          )}

          {finali.length > 0 && (
            <>
              <h3 className="etichetta mt-4">Posizioni finali dichiarate</h3>
              <ul className="mt-1 space-y-2">
                {finali.map((t) => (
                  <li key={t.agente} className="text-[13px]">
                    <span className="mr-2"><NomeAgente agente={t.agente} piccolo /></span>
                    <PastigliaStato stato={t.risposta.stato} />
                    <div className="mt-0.5">{t.risposta.posizione}</div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {d.dossier && (
            <p className="mt-4 text-[12.5px] text-grafite">Materiale dato in lettura: {d.dossier.file.length} file della cartella "{d.dossier.cartella}"{d.dossier.rimossi ? `, ${d.dossier.rimossi} possibili segreti cancellati` : ''}.</p>
          )}
          <Produzione dibattito={d} cartelle={cartelle} soloLettura={soloLettura} />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-bordo bg-carta px-5 py-3">
          <BottoneMarkdown id={d.id} primario />
          {onRivedi && (
            <button className="tasto" onClick={onRivedi}>
              <Play size={16} /> Rivedi la partita
            </button>
          )}
        </div>
      </article>
    </div>
  );
}

function Sezione({ titolo, voci, vuoto }: { titolo: string; voci: string[]; vuoto?: string }) {
  return (
    <>
      <h3 className="etichetta mt-4">{titolo}</h3>
      {voci.length ? (
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {voci.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      ) : (
        <p className="mt-1 text-grafite">{vuoto ?? '—'}</p>
      )}
    </>
  );
}
