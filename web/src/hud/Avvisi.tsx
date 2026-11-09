// Avvisi a comparsa, il grande cartello di fine partita, la scheda di un agente e i suoni.
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NOME, type Agente, type Esito } from '../../../motore/tipi.ts';
import type { Info } from '../api.ts';
import { alLavoro, chiE, usaSquadra } from '../squadra.ts';
import { suona } from '../suoni.ts';
import { ETICHETTE_ESITO, type Azione, type Vista } from '../stato.ts';
import { NomeAgente, PastigliaStato } from './comuni.tsx';
import { SchedaAssistente } from './Squadra.tsx';

export interface AvvisoExtra {
  testo: string;
  chiudi?: () => void;
}

// Il contenitore resta sempre montato: una regione live che compare insieme al suo testo di
// solito non viene letta dagli screen reader.
export function Avvisi({ vista, invia, extra = [] }: { vista: Vista; invia: (a: Azione) => void; extra?: AvvisoExtra[] }) {
  useEffect(() => {
    const t = vista.avvisi.filter((a) => !a.grave).map((a) => setTimeout(() => invia({ tipo: 'chiudi_avviso', id: a.id }), 6000));
    return () => t.forEach(clearTimeout);
  }, [vista.avvisi, invia]);

  const voci = [
    ...vista.avvisi.map((a) => ({ chiave: `a${a.id}`, testo: a.testo, grave: a.grave, chiudi: () => invia({ tipo: 'chiudi_avviso', id: a.id }) as void })),
    ...extra.map((x, i) => ({ chiave: `x${i}-${x.testo}`, testo: x.testo, grave: true, chiudi: x.chiudi })),
  ];
  return (
    <div className="pointer-events-none flex w-full max-w-sm flex-col gap-2" role="status" aria-live="polite">
      {voci.map((a) => (
        <div key={a.chiave} role={a.grave ? 'alert' : undefined} className={`pannello pointer-events-auto flex animate-[comparsa_.25s_ease-out] items-start gap-2 px-3 py-2 text-[13px] ${a.grave ? '!border-[#141518] !bg-[#f6f7f8]' : ''}`}>
          <span className="flex-1 break-words py-1.5">{a.testo}</span>
          {a.chiudi && (
            <button className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-grafite hover:bg-cartaScura" onClick={a.chiudi} aria-label="Chiudi l'avviso">
              <X size={16} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// Cartello grande al centro quando arriva l'esito, come la fine di un livello.
export function Cartello({ esito }: { esito: Esito | null }) {
  if (!esito) return null;
  const colore = esito === 'accordo' ? 'text-[#b5f900]' : esito === 'stallo' ? 'text-[#ff3b30]' : 'text-giallo';
  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center" aria-hidden>
      <div className={`animate-[banner_3.2s_ease-out_forwards] rounded-2xl bg-inchiostro/85 px-8 py-4 font-titolo text-[34px] font-bold uppercase sm:text-[52px] ${colore}`}>
        {ETICHETTE_ESITO[esito]}
      </div>
    </div>
  );
}

// Reazioni ai cambi di stato: suoni, cartello di fine partita, documento che si apre da solo.
// Aprendo dal vivo una partita già conclusa il documento si apre subito; vedendola finire,
// dopo il cartello.
export function usaReazioni(vista: Vista, onFine: () => void, dalVivo: boolean): Esito | null {
  const prec = useRef({ turni: -1, stato: '', interventi: -1, id: '' });
  const timer = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [cartello, setCartello] = useState<Esito | null>(null);
  const pulisci = () => {
    timer.current.forEach(clearTimeout);
    timer.current = [];
  };
  useEffect(() => pulisci, []);

  useEffect(() => {
    const d = vista.dibattito;
    if (!d) {
      pulisci();
      setCartello(null);
      prec.current = { turni: -1, stato: '', interventi: -1, id: '' };
      return;
    }
    const p = prec.current;
    const primoGiro = p.id !== d.id;
    if (primoGiro) {
      pulisci();
      setCartello(null);
      if (dalVivo && d.stato === 'concluso') timer.current.push(setTimeout(onFine, 900));
    } else {
      if (d.turni.length > p.turni && p.turni >= 0) {
        const ultimo = d.turni.at(-1)!;
        suona(ultimo.risposta.cambi_di_posizione.length ? 'cambio' : 'turno');
      }
      if (d.interventi.length > p.interventi && p.interventi >= 0) suona('nota');
      if (d.stato === 'errore' && p.stato !== 'errore') suona('errore');
      if (d.stato === 'concluso' && p.stato && p.stato !== 'concluso' && d.esito) {
        suona(d.esito === 'accordo' ? 'accordo' : 'fine');
        setCartello(d.esito);
        timer.current.push(setTimeout(() => setCartello(null), 3300), setTimeout(onFine, 3400));
      }
    }
    prec.current = { turni: d.turni.length, stato: d.stato, interventi: d.interventi.length, id: d.id };
  }, [vista.dibattito, onFine, dalVivo]);
  return cartello;
}

type SkillPc = { nome: string; descrizione: string; fonte: string };

// Cosa sta facendo adesso, a parole, dallo stato dal vivo. atteso: l'assistente che lavora a un
// incarico chiesto da lui.
function adesso(v: Vista, a: Agente, atteso?: string): string {
  if (v.parlante !== a) return v.fase[a] === 'errore' ? 'Fermo per un errore' : atteso ? `Aspetta il rapporto di ${atteso}` : 'Libero';
  const azione = v.azione[a];
  if (v.fase[a] === 'strumento' && azione) return azione.testo;
  return v.fase[a] === 'risposta' ? 'Scrive' : 'Ci sta pensando';
}

// Le skill: quelle usate davvero (le dice la CLI mentre lavora) e quelle che ha a disposizione sul PC.
function SkillAgente({ usate, disponibili }: { usate: string[]; disponibili?: SkillPc[] }) {
  const [filtro, setFiltro] = useState('');
  const [aperto, setAperto] = useState(false);
  const f = filtro.trim().toLowerCase();
  const elenco = (disponibili ?? []).filter((s) => !f || `${s.nome} ${s.descrizione} ${s.fonte}`.toLowerCase().includes(f));
  return (
    <div className="mt-3 border-t border-bordo pt-2 text-[13px]">
      <div className="etichetta">Skill in uso</div>
      {usate.length
        ? <ul className="mt-1 space-y-0.5">{usate.map((x) => <li key={x}>{x.replace(/^Usa la skill /, '')}</li>)}</ul>
        : <p className="mt-0.5 text-grafite">Nessuna rilevata qui. Compare solo quando la CLI dice che la sta usando.</p>}
      <button className="etichetta mt-2 flex w-full items-center gap-1 text-left" onClick={() => setAperto(!aperto)} aria-expanded={aperto}>
        Skill a disposizione ({disponibili?.length ?? '…'}) <span aria-hidden>{aperto ? '−' : '+'}</span>
      </button>
      {aperto && (
        <>
          {!disponibili && <p className="mt-0.5 text-grafite">Il motore non ha ancora mandato l'elenco.</p>}
          {disponibili?.length === 0 && <p className="mt-0.5 text-grafite">Nessuna: gli agenti partono senza le tue impostazioni. Per dargli le tue skill di Claude Code metti AMBO_AMBIENTE=1 nel file .env e riavvia.</p>}
          {disponibili && disponibili.length > 6 && (
            <input className="campo mt-1 !py-1.5 text-[16px] md:text-[13px]" placeholder="Cerca una skill" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Cerca una skill" />
          )}
          <ul className="scorri mt-1 max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {elenco.map((s) => (
              <li key={`${s.fonte}:${s.nome}`}>
                <span className="font-semibold">{s.nome}</span> <span className="font-dati text-[10.5px] text-grafite">{s.fonte}</span>
                {s.descrizione && <p className="line-clamp-2 text-[12px] leading-snug text-grafite">{s.descrizione}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// La scheda di chi è stato toccato in scena o nei pannelli: un capo reparto o un assistente.
export type SchedaAperta = { tipo: 'agente'; agente: Agente } | { tipo: 'assistente'; id: string };

export function Scheda({ scheda, vista, info, onChiudi }: { scheda: SchedaAperta; vista: Vista; info?: Info; onChiudi: () => void }) {
  return scheda.tipo === 'agente'
    ? <SchedaAgente agente={scheda.agente} vista={vista} onChiudi={onChiudi} skill={info?.skill?.[scheda.agente]} />
    : <SchedaAssistente id={scheda.id} vista={vista} onChiudi={onChiudi} />;
}

export function SchedaAgente({ agente, vista, onChiudi, skill }: { agente: Agente; vista: Vista; onChiudi: () => void; skill?: SkillPc[] }) {
  const { squadra } = usaSquadra();
  const d = vista.dibattito;
  const atteso = alLavoro(vista).find((l) => l.tipo === 'incarico' && l.da === agente);
  const ultimo = d ? [...d.turni].reverse().find((t) => t.agente === agente) : undefined;
  const modello = agente === 'claude' ? d?.config.claude.modello : d?.config.codex.modello;
  // In chat: le azioni della CLI salvate sui messaggi, più quelle dal vivo del diario.
  const chat = d?.config.tipo === 'chat';
  const fatte = [...new Set([
    ...(d?.chat ?? []).filter((m) => m.autore === agente).slice(-5).flatMap((m) => m.azioni ?? []),
    ...vista.diario.filter((v) => v.agente === agente && v.strumento).map((v) => v.testo),
  ])];
  const usate = fatte.filter((x) => x.startsWith('Usa la skill'));
  return (
    <div className="pannello pointer-events-auto scorri max-h-[70dvh] w-full max-w-sm animate-[comparsa_.2s_ease-out] overflow-y-auto p-3" role="dialog" aria-label={`Scheda di ${NOME[agente]}`}>
      <div className="flex items-center gap-2">
        <NomeAgente agente={agente} />
        <span className="font-dati text-[11px] text-grafite">{modello ?? ''}</span>
        <button className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-grafite hover:bg-cartaScura" onClick={onChiudi} aria-label="Chiudi la scheda">
          <X size={16} />
        </button>
      </div>
      <p className="mt-1 text-[13px]"><span className="etichetta">Adesso</span> {adesso(vista, agente, atteso ? chiE(squadra, atteso.id).nome : undefined)}</p>
      {chat ? (
        <div className="mt-2 text-[13px]">
          <div className="etichetta">In questa chat ha fatto</div>
          {fatte.length
            ? <ul className="mt-1 list-disc space-y-0.5 pl-5">{fatte.slice(-8).map((x) => <li key={x}>{x}</li>)}</ul>
            : <p className="mt-0.5 text-grafite">Ha risposto senza consultare note, web o skill.</p>}
        </div>
      ) : ultimo ? (
        <div className="mt-2 text-[13px]">
          <PastigliaStato stato={ultimo.risposta.stato} />
          <p className="mt-1.5">{ultimo.risposta.posizione}</p>
          {ultimo.risposta.punti_aperti.length > 0 && (
            <>
              <div className="etichetta mt-2">Punti aperti</div>
              <ul className="mt-1 list-disc pl-5">{ultimo.risposta.punti_aperti.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[13px] text-grafite">Non ha ancora parlato.</p>
      )}
      <SkillAgente usate={usate} disponibili={skill} />
    </div>
  );
}
