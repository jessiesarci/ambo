// Comandi della partita dal vivo (pausa, riprendi, nota, concludi) e del replay (play, velocità).
import { FileText, Flag, ListOrdered, MessageSquarePlus, Pause, Play, RotateCcw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { api } from '../api.ts';
import type { ControlliReplay } from '../usaPartita.ts';
import type { Vista } from '../stato.ts';
import { usaFinestra } from './comuni.tsx';

export function ComandiDalVivo({ vista, onRegistro, onDocumento, onErrore }: { vista: Vista; onRegistro: () => void; onDocumento: () => void; onErrore: (m: string) => void }) {
  const d = vista.dibattito;
  const [nota, setNota] = useState<string | null>(null);
  const [conferma, setConferma] = useState(false);
  const [occupato, setOccupato] = useState(false);
  if (!d) return null;

  const esegui = async (f: () => Promise<unknown>) => {
    setOccupato(true);
    try {
      await f();
    } catch (e) {
      onErrore((e as Error).message);
    } finally {
      setOccupato(false);
    }
  };

  const concluso = d.stato === 'concluso';
  const fermo = d.stato === 'in_pausa' || d.stato === 'errore' || (d.stato === 'nuovo' && !vista.inCorso);
  const apribile = !concluso && !d.esito && !vista.altrove;
  // Dopo un errore che non si può riprendere resta solo la chiusura, senza nuove chiamate agli agenti.
  const bloccato = d.stato === 'errore' && d.errore?.recuperabile === false;

  return (
    <>
      <div className="pannello pointer-events-auto flex flex-wrap items-center gap-1.5 p-1.5">
        <button className="tasto tasto-icona" onClick={onRegistro} aria-label="Registro della partita" title="Registro">
          <ListOrdered size={18} />
        </button>
        {vista.inCorso && (d.stato === 'in_corso' || d.stato === 'sintesi') && (
          <button className="tasto" disabled={occupato} onClick={() => esegui(() => api.pausa(d.id))}>
            <Pause size={16} /> Pausa
          </button>
        )}
        {vista.altrove && (
          <span className="px-2 text-[12.5px] text-grafite">La sta eseguendo la CLI: da qui puoi solo guardare.</span>
        )}
        {fermo && !concluso && !bloccato && !vista.altrove && (
          <button className="tasto tasto-primario" disabled={occupato} onClick={() => esegui(() => api.riprendi(d.id))}>
            <Play size={16} /> Riprendi
          </button>
        )}
        {apribile && (
          <button className="tasto" disabled={occupato} onClick={() => setNota('')}>
            <MessageSquarePlus size={16} /> Nota
          </button>
        )}
        {(apribile || (bloccato && !vista.altrove)) && (
          <button className="tasto tasto-pericolo" disabled={occupato} onClick={() => setConferma(true)}>
            <Flag size={16} /> Concludi
          </button>
        )}
        {concluso && (
          <button className="tasto tasto-primario" onClick={onDocumento}>
            <FileText size={16} /> Documento
          </button>
        )}
      </div>

      {nota !== null && (
        <Finestra titolo="Nota del moderatore" onChiudi={() => setNota(null)}>
          <p className="mb-2 text-[13px] text-grafite">La ricevono Claude e Codex al loro prossimo turno, una volta sola, con la precedenza sul resto.</p>
          <textarea className="campo min-h-28" maxLength={2000} autoFocus value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Es. tenete conto che il budget è limitato" />
          <div className="mt-3 flex justify-end gap-2">
            <button className="tasto" onClick={() => setNota(null)}>Annulla</button>
            <button className="tasto tasto-primario" disabled={!nota.trim() || occupato} onClick={() => esegui(async () => { await api.nota(d.id, nota); setNota(null); })}>
              Manda in sala
            </button>
          </div>
        </Finestra>
      )}

      {conferma && (
        <Finestra titolo="Concludere adesso?" onChiudi={() => setConferma(false)}>
          <p className="text-[14px]">{bloccato
            ? 'La partita si chiude con quello che c\x27è, senza chiamare di nuovo gli agenti: dopo questo errore non si riprende.'
            : 'L\x27intervento in corso si ferma, gli incarichi non ancora partiti si annullano e si passa alla sintesi. Se non si sono dichiarati d\x27accordo, il documento lo dirà: nessun accordo viene inventato.'}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button className="tasto" onClick={() => setConferma(false)}>Continua la partita</button>
            <button className="tasto tasto-primario" disabled={occupato} onClick={() => esegui(async () => { await api.concludi(d.id); setConferma(false); })}>
              {bloccato ? 'Chiudi la partita' : 'Concludi e fai la sintesi'}
            </button>
          </div>
        </Finestra>
      )}
    </>
  );
}

export function ComandiReplay({ r, onRegistro, onDocumento, concluso }: { r: ControlliReplay; onRegistro: () => void; onDocumento: () => void; concluso: boolean }) {
  return (
    <div className="pannello pointer-events-auto flex flex-wrap items-center gap-1.5 p-1.5">
      <span className="rounded-md bg-[#141518] px-2 py-1 font-titolo text-[11px] font-bold uppercase tracking-widest text-white">Replay</span>
      <button className="tasto tasto-icona" onClick={onRegistro} aria-label="Registro della partita">
        <ListOrdered size={18} />
      </button>
      <button className="tasto tasto-icona" onClick={() => r.setInPausa(!r.inPausa)} aria-label={r.inPausa ? 'Riprendi il replay' : 'Metti in pausa il replay'}>
        {r.inPausa ? <Play size={18} /> : <Pause size={18} />}
      </button>
      {[1, 2, 4].map((v) => (
        <button key={v} className={`tasto !min-w-10 !px-2 ${r.velocita === v ? 'tasto-primario' : ''}`} onClick={() => r.setVelocita(v)} aria-pressed={r.velocita === v}>
          {v}×
        </button>
      ))}
      <button className="tasto tasto-icona" onClick={r.ricomincia} aria-label="Ricomincia il replay">
        <RotateCcw size={18} />
      </button>
      {concluso && (
        <button className="tasto" onClick={onDocumento}>
          <FileText size={16} /> Documento
        </button>
      )}
    </div>
  );
}

export function Finestra({ titolo, onChiudi, children }: { titolo: string; onChiudi: () => void; children: ReactNode }) {
  const pannello = usaFinestra(onChiudi);
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-[#0b0c0e]/35 p-2 sm:items-center" onClick={onChiudi}>
      <div ref={pannello} role="dialog" aria-modal="true" aria-label={titolo} className="pannello w-full max-w-md animate-[comparsa_.2s_ease-out] p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 font-titolo text-[18px] font-bold">{titolo}</h2>
        {children}
      </div>
    </div>
  );
}
