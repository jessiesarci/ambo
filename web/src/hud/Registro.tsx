// Registro della partita: tutti i turni, le tue note e l'esito. Un tocco apre il turno nel dialogo.
import { X } from 'lucide-react';
import type { Vista } from '../stato.ts';
import { ETICHETTE_ESITO } from '../stato.ts';
import { NomeAgente, PastigliaStato } from './comuni.tsx';

export function Registro({ vista, scelto, setScelto, onChiudi }: { vista: Vista; scelto: number | null; setScelto: (i: number | null) => void; onChiudi: () => void }) {
  const d = vista.dibattito;
  if (!d) return null;
  return (
    <aside className="pannello pointer-events-auto flex max-h-full w-full flex-col overflow-hidden" aria-label="Registro della partita">
      <div className="flex items-center justify-between border-b border-bordo px-3 py-2">
        <span className="etichetta">Registro</span>
        <button className="tasto tasto-icona" onClick={onChiudi} aria-label="Chiudi il registro">
          <X size={16} />
        </button>
      </div>
      <p className="border-b border-bordo px-3 py-2 text-[12.5px] italic text-grafite">«{d.config.domanda}»</p>
      <ol className="scorri flex-1 space-y-1.5 overflow-y-auto p-2">
        {d.turni.map((t, i) => (
          <li key={t.indice}>
            <button
              className={`w-full rounded-xl border px-2.5 py-2 text-left transition-colors ${scelto === i ? 'border-giallo bg-[#f1f2f4]' : 'border-transparent hover:bg-cartaScura'}`}
              onClick={() => setScelto(i)}
            >
              <div className="flex items-center gap-2">
                <NomeAgente agente={t.agente} piccolo />
                <span className="font-dati text-[11px] text-grafite">T{t.indice} · R{t.round}</span>
                <span className="ml-auto"><PastigliaStato stato={t.risposta.stato} /></span>
              </div>
              <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-grafite">{t.risposta.posizione}</p>
              {t.risposta.cambi_di_posizione.length > 0 && <p className="mt-1 text-[11.5px] font-semibold text-[#3d4249]">Ha cambiato posizione</p>}
              {t.interventi.length > 0 && <p className="mt-1 text-[11.5px] text-[#3d4249]">Ha ricevuto una tua nota</p>}
            </button>
          </li>
        ))}
        {vista.parlante && vista.ruolo === 'turno' && (
          <li className="px-2.5 py-2 text-[12.5px] text-grafite">
            <NomeAgente agente={vista.parlante} piccolo /> sta lavorando al turno {vista.indice}…
          </li>
        )}
        {d.esito && (
          <li className="rounded-xl bg-inchiostro px-3 py-2 font-titolo text-[13px] font-bold uppercase tracking-wider text-giallo">
            {ETICHETTE_ESITO[d.esito]}
          </li>
        )}
      </ol>
    </aside>
  );
}
