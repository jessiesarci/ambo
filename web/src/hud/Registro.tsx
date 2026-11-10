// Registro della partita: gli interventi della riunione con gli incarichi dati alla squadra, le
// tue note e l'esito. Un tocco apre l'intervento nel dialogo, o la scheda dell'assistente.
import { X } from 'lucide-react';
import type { Incarico } from '../../../motore/tipi.ts';
import { alLavoro, breve, chiE, conRuolo, STATO_INCARICO, usaSquadra } from '../squadra.ts';
import type { Vista } from '../stato.ts';
import { ETICHETTE_ESITO } from '../stato.ts';
import { Avatar } from './Avatar.tsx';
import { NomeAgente, PastigliaStato } from './comuni.tsx';

const STILE_INCARICO: Record<Incarico['stato'], string> = {
  attesa: 'text-grafite',
  in_corso: 'font-semibold text-inchiostro',
  fatto: 'text-[#3f5600]',
  fallito: 'text-[#9b2626]',
  annullato: 'text-grafite line-through',
};

export function Registro({ vista, scelto, setScelto, onAssistente, onChiudi }: {
  vista: Vista;
  scelto: number | null;
  setScelto: (i: number | null) => void;
  onAssistente?: (id: string) => void;
  onChiudi: () => void;
}) {
  const { squadra } = usaSquadra();
  const d = vista.dibattito;
  if (!d) return null;
  const alLavoroOra = alLavoro(vista).find((l) => l.tipo === 'incarico');
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
                <span className="font-dati text-[11px] text-grafite">I{t.indice}</span>
                <span className="ml-auto"><PastigliaStato stato={t.risposta.stato} /></span>
              </div>
              <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-grafite">{t.risposta.posizione}</p>
              {t.risposta.cambi_di_posizione.length > 0 && <p className="mt-1 text-[11.5px] font-semibold text-[#3d4249]">Ha cambiato posizione</p>}
              {t.interventi.length > 0 && <p className="mt-1 text-[11.5px] text-[#3d4249]">Ha ricevuto una tua nota</p>}
            </button>
            {/* Gli incarichi sotto l'intervento che li ha chiesti: un tocco apre la scheda dell'assistente. */}
            {(t.incarichi ?? []).map((x) => {
              const chi = chiE(squadra, x.assistente);
              return (
                <button
                  key={x.id}
                  className="ml-5 flex w-[calc(100%-1.25rem)] items-baseline gap-1.5 rounded-lg px-2 py-1 text-left text-[12px] leading-snug hover:bg-cartaScura disabled:hover:bg-transparent"
                  onClick={onAssistente ? () => onAssistente(x.assistente) : undefined}
                  disabled={!onAssistente}
                  title={x.compito}
                >
                  <Avatar id={x.assistente} dimensione={18} tondo className="self-center" />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{conRuolo(chi)}</span>: {breve(x.compito, 90)}
                    <span className={`whitespace-nowrap ${STILE_INCARICO[x.stato]}`}> · {STATO_INCARICO[x.stato]}</span>
                  </span>
                </button>
              );
            })}
          </li>
        ))}
        {vista.parlante && vista.ruolo === 'turno' && (
          <li className="px-2.5 py-2 text-[12.5px] text-grafite">
            <NomeAgente agente={vista.parlante} piccolo /> prepara l'intervento {vista.indice}…
          </li>
        )}
        {alLavoroOra && !d.turni.some((t) => t.incarichi?.some((x) => x.assistente === alLavoroOra.id && x.stato === 'in_corso')) && (
          <li className="px-2.5 py-2 text-[12.5px] text-grafite">{chiE(squadra, alLavoroOra.id).nome} lavora a un incarico…</li>
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
