// Barra in alto: torna all'archivio, round, cronometro del turno, consenso, audio e telecamera.
import { ArrowLeft, Crosshair, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { consenso } from '../stato.ts';
import { audioAttivo, setAudio } from '../suoni.ts';
import { ETICHETTE_ESITO, type Vista } from '../stato.ts';
import { Consenso, durata } from './comuni.tsx';

export function Barra({ vista, onIndietro, segui, setSegui, etichetta }: { vista: Vista; onIndietro: () => void; segui: boolean; setSegui: (s: boolean) => void; etichetta?: string }) {
  const d = vista.dibattito;
  const [ora, setOra] = useState(Date.now());
  const [audio, setAudioStato] = useState(audioAttivo());
  useEffect(() => {
    if (!vista.inizioTurno) return;
    const t = setInterval(() => setOra(Date.now()), 500);
    return () => clearInterval(t);
  }, [vista.inizioTurno]);

  // La riunione non ha round: si conta l'intervento in corso (o l'ultimo fatto).
  const intervento = d ? Math.max(1, d.turni.length + (vista.parlante && vista.ruolo === 'turno' ? 1 : 0)) : 0;
  const statoTesto = !d ? 'Collegamento…'
    : d.esito ? ETICHETTE_ESITO[d.esito]
    : d.stato === 'in_pausa' ? 'In pausa'
    : d.stato === 'errore' ? 'Errore'
    : d.stato === 'sintesi' ? 'Sintesi finale'
    : `Riunione · intervento ${intervento}`;
  // Sul telefono la barra è stretta: stato corto e consenso in percentuale.
  const statoBreve = d && !d.esito && d.stato !== 'in_pausa' && d.stato !== 'errore' && d.stato !== 'sintesi' ? `I${intervento}` : statoTesto;
  const [domandaAperta, setDomandaAperta] = useState(false);

  return (
    <>
    <header className="pannello pointer-events-auto flex items-center gap-2 px-2 py-1.5 sm:gap-3 sm:px-3">
      <button className="tasto tasto-icona" onClick={onIndietro} aria-label="Torna all'archivio">
        <ArrowLeft size={18} />
      </button>
      <div className="hidden min-w-0 flex-1 md:block">
        <div className="etichetta">{etichetta ?? 'Sala del dibattito'}</div>
        <div className="truncate font-testo text-[13px] text-grafite" title={d?.config.domanda}>{d?.config.titolo ?? d?.config.domanda ?? '…'}</div>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
        <span className="truncate rounded-lg bg-inchiostro px-2.5 py-1 font-titolo text-[13px] font-bold uppercase tracking-wider text-giallo">
          <span className="sm:hidden">{statoBreve}</span>
          <span className="hidden sm:inline">{statoTesto}</span>
        </span>
        <span className="font-dati text-[12px] text-grafite sm:hidden" aria-label="Consenso">{Math.round(consenso(d).valore * 100)}%</span>
        {vista.inizioTurno && (
          <span className="font-dati text-[13px] text-grafite" aria-label="Durata del turno">{durata(ora - vista.inizioTurno)}</span>
        )}
      </div>
      <div className="hidden sm:flex"><Consenso dibattito={d} stretto /></div>
      <span className={`h-2.5 w-2.5 rounded-full ${vista.connesso ? 'bg-accordo' : 'bg-disaccordo animate-pulse'}`} title={vista.connesso ? 'Collegato' : 'Collegamento perso: riprovo'} aria-label={vista.connesso ? 'Collegato' : 'Non collegato'} />
      <button className={`tasto tasto-icona ${segui ? '!bg-[#eceef1]' : ''}`} onClick={() => setSegui(!segui)} aria-pressed={segui} aria-label="La telecamera segue chi lavora" title="Segui chi lavora">
        <Crosshair size={18} />
      </button>
      <button
        className="tasto tasto-icona"
        onClick={() => { setAudio(!audio); setAudioStato(!audio); }}
        aria-pressed={audio}
        aria-label={audio ? 'Spegni i suoni' : 'Accendi i suoni'}
      >
        {audio ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>
    </header>
    {d && (
      <button className="pannello pointer-events-auto px-3 py-1.5 text-left text-[12.5px] italic text-grafite md:hidden" onClick={() => setDomandaAperta(!domandaAperta)} aria-expanded={domandaAperta}>
        <span className={domandaAperta ? '' : 'line-clamp-1'}>{d.config.titolo && !domandaAperta ? d.config.titolo : `«${d.config.domanda}»`}</span>
      </button>
    )}
    </>
  );
}
