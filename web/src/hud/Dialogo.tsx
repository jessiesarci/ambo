// Il riquadro di dialogo in basso. Resta sull'ultimo intervento finché il prossimo non comincia
// davvero a scrivere (Codex non manda testo in streaming: altrimenti i suoi messaggi sparirebbero
// subito). Il testo nuovo esce a macchina da scrivere; un tocco lo mostra tutto. Quando lavora un
// assistente della squadra lo dice (chi e cosa), e se il suo rapporto arriva a pezzi lo mostra.
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NOME } from '../../../motore/tipi.ts';
import { alLavoro, breve, chiE, conRuolo, STATO_INCARICO, usaSquadra, type Lavoro } from '../squadra.ts';
import type { Vista } from '../stato.ts';
import { Puntini } from '../scena/Fumetti.tsx';
import { chiudiMarcatori, NomeAgente, PastigliaStato, TestoMd, usaMacchinaDaScrivere } from './comuni.tsx';

// Che cosa fa l'assistente, in una riga.
function fraseLavoro(l: Lavoro, nome: string): string {
  if (l.tipo === 'pacchetto') return `${nome} costruisce ${l.di && l.di > 1 ? `il pacchetto ${l.numero} di ${l.di}` : 'la decisione'}: «${breve(l.cosa, 70)}»`;
  if (l.tipo === 'revisione') return `${nome} rivede i file prodotti`;
  if (l.tipo === 'correzione') return `${nome} corregge dopo il collaudo`;
  return `${nome} lavora ${l.incarico ? `all'incarico ${l.incarico.id}` : 'a un incarico'}${l.da ? ` chiesto da ${NOME[l.da]}` : ''}: «${breve(l.cosa, 80)}»`;
}

export function Dialogo({ vista, scelto, setScelto, velocita = 1 }: { vista: Vista; scelto: number | null; setScelto: (i: number | null) => void; velocita?: number }) {
  const { squadra } = usaSquadra();
  const d = vista.dibattito;
  const turni = d?.turni ?? [];
  const [aperto, setAperto] = useState(true);
  const corpo = useRef<HTMLDivElement>(null);
  const inDiretta = scelto === null;
  const chiLavora = inDiretta ? vista.parlante : undefined;
  // Un assistente al lavoro: i capi reparto aspettano, il dialogo dice chi lavora e su cosa.
  const lavoro = inDiretta && !chiLavora ? alLavoro(vista)[0] : undefined;
  const assistente = lavoro ? chiE(squadra, lavoro.id) : undefined;
  const vivo = lavoro && vista.assistente?.id === lavoro.id ? vista.assistente : undefined;
  const rapportoVivo = lavoro?.tipo === 'incarico' && vivo?.testo ? vivo.testo : '';
  // In diretta si passa al testo che arriva solo quando c'è davvero del testo.
  const inStreaming = (!!chiLavora && vista.testoParziale !== '') || !!rapportoVivo;
  const indice = scelto ?? turni.length - 1;
  const turno = inStreaming ? undefined : turni[indice];
  const nuovo = inDiretta && !!turno && indice === turni.length - 1;

  const testo = rapportoVivo || (inStreaming ? vista.testoParziale : turno?.risposta.messaggio ?? '');
  const chiaveVivo = rapportoVivo ? `rapporto-${lavoro?.id}-${vivo?.da}` : `live-${vista.indice}`;
  const [visibile, salta, scrive] = usaMacchinaDaScrivere(testo, inStreaming ? chiaveVivo : `t-${indice}`, !inStreaming && nuovo, 140 * velocita);

  useEffect(() => {
    if (inStreaming || scrive) corpo.current?.scrollTo({ top: corpo.current.scrollHeight });
  }, [visibile, inStreaming, scrive]);

  if (!d) return null;

  const chi = rapportoVivo ? undefined : inStreaming ? chiLavora : turno?.agente;
  const precedente = inStreaming ? turni.length - 1 : indice - 1;
  const azione = vivo?.azione?.testo;
  const stato = chiLavora && !inStreaming
    ? `${NOME[chiLavora]} ${vista.ruolo === 'sintesi' ? 'scrive la sintesi' : vista.ruolo === 'verifica' ? 'verifica la sintesi' : vista.fase[chiLavora] === 'ragionamento' ? 'sta ragionando' : 'prepara la risposta'}`
    : lavoro && assistente ? `${fraseLavoro(lavoro, conRuolo(assistente))}${azione ? ` · ${azione}` : ''}`
    : undefined;
  const vuoto = d.stato === 'in_pausa' ? 'In pausa. Nessun intervento finora.'
    : d.stato === 'errore' ? 'Nessun intervento: la partita si è fermata prima.'
    : 'Il primo intervento sta arrivando.';

  return (
    <section className="pannello pointer-events-auto flex max-h-[34vh] w-full flex-col overflow-hidden md:max-h-[38vh]" aria-label="Dialogo">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-bordo px-3 py-2">
        {rapportoVivo && assistente ? (
          <span className="inline-flex items-center gap-1.5 font-titolo text-[15px] font-bold">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-inchiostro ring-2 ring-giallo" />
            {assistente.nome}
            {assistente.ruolo && <span className="font-testo text-[12px] font-normal text-grafite">{assistente.ruolo}</span>}
          </span>
        ) : chi ? <NomeAgente agente={chi} /> : <span className="etichetta">Dialogo</span>}
        <span className="font-dati text-[12px] text-grafite">
          {rapportoVivo
            ? `rapporto${lavoro?.incarico ? ` ${lavoro.incarico.id}` : ''}`
            : inStreaming
              ? vista.ruolo === 'turno' ? `intervento ${vista.indice}` : vista.ruolo === 'sintesi' ? 'sintesi' : 'verifica'
              : turno ? `intervento ${turno.indice}` : ''}
        </span>
        {turno && <PastigliaStato stato={turno.risposta.stato} />}
        <div className="ml-auto flex items-center gap-1">
          <button className="tasto tasto-icona md:!min-h-8 md:!px-2" disabled={!turni.length || precedente < 0} onClick={() => setScelto(precedente)} aria-label="Intervento precedente">
            <ChevronLeft size={16} />
          </button>
          <button className="tasto tasto-icona md:!min-h-8 md:!px-2" disabled={inDiretta} onClick={() => setScelto(indice + 1 >= turni.length ? null : indice + 1)} aria-label="Intervento successivo">
            <ChevronRight size={16} />
          </button>
          <button className="tasto tasto-icona md:!min-h-8 md:!px-2" onClick={() => setAperto(!aperto)} aria-expanded={aperto} aria-label={aperto ? 'Riduci il dialogo' : 'Apri il dialogo'}>
            {aperto ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
        {stato && (
          <p className={`flex w-full items-center gap-2 text-[12.5px] ${lavoro ? 'rounded-lg bg-inchiostro px-2 py-1 text-white' : 'text-grafite'}`}>
            <Puntini /> <span className="min-w-0 flex-1 truncate" title={stato}>{stato}</span>
          </p>
        )}
      </div>
      {aperto && (
        <div ref={corpo} className="scorri min-h-[72px] overflow-y-auto px-4 py-3" onClick={salta}>
          {visibile ? (
            <TestoMd testo={scrive || inStreaming ? chiudiMarcatori(visibile) : visibile} />
          ) : (
            <p className="font-testo text-[14px] text-grafite">{chiLavora ? `${NOME[chiLavora]} sta preparando il primo intervento.` : vuoto}</p>
          )}
          {turno && !scrive && (
            <div className="mt-2 rounded-xl bg-cartaScura px-3 py-2 text-[13px]">
              <div><span className="etichetta mr-1">Posizione</span>{turno.risposta.posizione}</div>
              {turno.risposta.punti_aperti.length > 0 && (
                <div className="mt-1"><span className="etichetta mr-1">Punti aperti</span>{turno.risposta.punti_aperti.join(' · ')}</div>
              )}
              {turno.risposta.cambi_di_posizione.length > 0 && (
                <div className="mt-1"><span className="etichetta mr-1">Ha cambiato</span>{turno.risposta.cambi_di_posizione.join(' · ')}</div>
              )}
              {turno.interventi.length > 0 && (
                <div className="mt-1"><span className="etichetta mr-1">Tua nota ricevuta</span>{turno.interventi.join(' · ')}</div>
              )}
              {(turno.incarichi?.length ?? 0) > 0 && (
                <div className="mt-1"><span className="etichetta mr-1">Incarichi alla squadra</span>{turno.incarichi!.map((x) => `${chiE(squadra, x.assistente).nome} · ${STATO_INCARICO[x.stato]}`).join(', ')}</div>
              )}
            </div>
          )}
          {!inDiretta && (
            <button className="tasto mt-3 text-[13px]" onClick={() => setScelto(null)}>Torna alla diretta</button>
          )}
        </div>
      )}
    </section>
  );
}
