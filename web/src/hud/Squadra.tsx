// La squadra nell'interfaccia: la barra dell'esperienza, la scheda di un assistente e il
// pannello della lobby con tutto il catalogo e le procedure.
import { Users, X } from 'lucide-react';
import { useState } from 'react';
import { NOME, type MembroSquadra, type Procedura } from '../../../motore/tipi.ts';
import {
  alLavoro, avanzamento, breve, chiE, inCoda, lavoriDi, perEsperienza, STATO_INCARICO, STATO_PACCHETTO, usaSquadra, type VoceLavoro,
} from '../squadra.ts';
import type { Vista } from '../stato.ts';
import { quanti, TestoMd } from './comuni.tsx';

const FASE: Record<Procedura['passi'][number]['fase'], string> = { piano: 'piano', produzione: 'produzione', collaudo: 'collaudo' };

// La barra dell'XP: traccia scura e riempimento lime, come i cartellini in scena. Con "sottile" c'è
// solo la barra (le cifre le mette chi la usa).
export function BarraXP({ membro, sottile }: { membro?: MembroSquadra; sottile?: boolean }) {
  const l = membro?.livello;
  if (!membro || !l) return null;
  const pct = Math.round(avanzamento(membro) * 100);
  const cifre = l.prossimo === null ? `${l.xp} XP · livello massimo` : `${l.xp} / ${l.prossimo} XP`;
  return (
    <div className={sottile ? 'min-w-0 flex-1' : 'mt-2'}>
      {!sottile && (
        <div className="flex items-center justify-between">
          <span className="etichetta !text-[10px]">Livello {l.livello}</span>
          <span className="font-dati text-[11px] text-grafite">{cifre}</span>
        </div>
      )}
      <div
        className={`relative overflow-hidden rounded-full bg-[#141518] ${sottile ? 'h-1.5' : 'mt-1 h-2.5'}`}
        role="meter"
        aria-label={`Esperienza di ${membro.nome}: ${cifre}`}
        aria-valuemin={l.base}
        aria-valuemax={l.prossimo ?? l.xp}
        aria-valuenow={l.xp}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-[#b5f900] transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Livello({ membro, grande }: { membro?: MembroSquadra; grande?: boolean }) {
  if (!membro) return null;
  return (
    <span className={`inline-grid shrink-0 place-items-center rounded-[6px] bg-inchiostro font-dati font-bold text-giallo ${grande ? 'h-11 w-11 text-[13px] leading-none' : 'px-1.5 py-px text-[11px]'}`}>
      {grande ? <span className="text-center"><span className="block text-[9px] font-semibold tracking-wider text-white/70">LV</span>{membro.livello.livello}</span> : `Lv ${membro.livello.livello}`}
    </span>
  );
}

function Fonte({ fonte }: { fonte?: MembroSquadra['fonte'] }) {
  if (!fonte) return null;
  return fonte === 'utente'
    ? <span className="rounded-full bg-[#effcc9] px-1.5 py-px font-titolo text-[10px] font-bold uppercase tracking-wide text-[#3f5600]">Tuo agente</span>
    : <span className="rounded-full bg-[#eceef1] px-1.5 py-px font-titolo text-[10px] font-bold uppercase tracking-wide text-[#4a5058]">Standard</span>;
}

const quando = (iso?: string) => (iso ? new Date(iso).toLocaleString('it-CH', { dateStyle: 'short', timeStyle: 'short' }) : '');

// Un rapporto o un resoconto: le prime righe, e tutto il testo a richiesta.
export function TestoBreve({ testo, max = 260 }: { testo: string; max?: number }) {
  const [tutto, setTutto] = useState(false);
  const lungo = testo.length > max;
  return (
    <div className="mt-1">
      {tutto ? <div className="scorri max-h-64 overflow-y-auto rounded-lg bg-white px-2 py-1 text-[12.5px]"><TestoMd testo={testo} /></div> : <p className="text-[12.5px] leading-snug text-[#3a3d42]">{breve(testo, max)}</p>}
      {lungo && <button className="mt-0.5 text-[12px] font-semibold underline" onClick={() => setTutto(!tutto)} aria-expanded={tutto}>{tutto ? 'Mostra meno' : 'Leggi tutto'}</button>}
    </div>
  );
}

function VoceDellaPartita({ v }: { v: VoceLavoro }) {
  if (v.tipo === 'incarico') {
    const i = v.incarico;
    return (
      <li className="rounded-lg bg-cartaScura px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-x-1.5 font-dati text-[11px] text-grafite">
          <span className="font-semibold text-inchiostro">{i.id}</span> · chiesto da {NOME[i.da]} · {STATO_INCARICO[i.stato]}{i.xp ? ` · +${i.xp} XP` : ''}
        </div>
        <p className="mt-0.5 text-[13px] leading-snug">{breve(i.compito, 160)}</p>
        {i.rapporto && <TestoBreve testo={i.rapporto} />}
        {i.errore && <p className="mt-1 text-[12.5px] text-[#9b2626]">Non consegnato: {i.errore.split('\n')[0]}</p>}
      </li>
    );
  }
  if (v.tipo === 'pacchetto') {
    const p = v.pacchetto;
    return (
      <li className="rounded-lg bg-cartaScura px-2.5 py-2">
        <div className="font-dati text-[11px] text-grafite">
          <span className="font-semibold text-inchiostro">Pacchetto {v.numero} di {v.di}</span> · {STATO_PACCHETTO[p.stato]}{p.xp ? ` · +${p.xp} XP` : ''}
        </div>
        <p className="mt-0.5 text-[13px] font-semibold leading-snug">{p.titolo}</p>
        {p.scritti.length > 0 && <p className="mt-0.5 break-words font-dati text-[11px] text-grafite">{p.scritti.join(', ')}</p>}
        {p.resoconto && <TestoBreve testo={p.resoconto} />}
        {p.errore && <p className="mt-1 text-[12.5px] text-[#9b2626]">{p.errore.split('\n')[0]}</p>}
      </li>
    );
  }
  const r = v.revisione;
  return (
    <li className="rounded-lg bg-cartaScura px-2.5 py-2">
      <div className="font-dati text-[11px] text-grafite">
        <span className="font-semibold text-inchiostro">Collaudo, giro {r.giro}</span> · {r.esito ? (r.esito.approvato ? 'approvato' : `respinto, ${quanti(r.esito.problemi.length, 'problema', 'problemi')}`) : 'non arrivato'}{r.xp ? ` · +${r.xp} XP` : ''}
      </div>
      {r.esito && <TestoBreve testo={r.esito.commento} max={200} />}
      {r.errore && <p className="mt-1 text-[12.5px] text-[#9b2626]">{r.errore.split('\n')[0]}</p>}
    </li>
  );
}

// La scheda di un assistente: chi è, quanto ha lavorato, cosa sa fare e, in una partita aperta,
// cosa fa adesso e cosa ha consegnato.
export function SchedaAssistente({ id, vista, onChiudi }: { id: string; vista?: Vista; onChiudi: () => void }) {
  const { squadra } = usaSquadra();
  const chi = chiE(squadra, id);
  const m = chi.membro;
  const s = m?.statistiche;
  const d = vista?.dibattito;
  const lavoro = vista ? alLavoro(vista).find((l) => l.id === id) : undefined;
  const coda = inCoda(d).find((i) => i.assistente === id);
  const azione = vista?.assistente?.id === id ? vista.assistente.azione?.testo : undefined;
  const voci = lavoriDi(d, id).slice(0, 6);
  // In partita conta cosa fa adesso; nella lobby, quando ha lavorato l'ultima volta.
  const [titoloStato, testoStato] = d
    ? ['Adesso', lavoro ? `Al lavoro: ${breve(lavoro.cosa, 120)}${azione ? ` · ${azione}` : ''}` : coda ? `In coda: ${breve(coda.compito, 120)}` : 'Libero']
    : ['Ultimo lavoro', s?.ultimo ? quando(s.ultimo) : 'mai'];
  const numeri: [string, string][] = m && s ? [
    ['Chiamato', quanti(s.incarichi, 'volta', 'volte')],
    ['Completati', String(s.completati)],
    ['Falliti', String(s.falliti)],
    ['Pacchetti', String(s.pacchetti)],
    ['Collaudi superati', String(s.approvati)],
    ['Riuscita', m.riuscita === null ? '—' : `${m.riuscita}%`],
  ] : [];
  return (
    <div className="pannello pointer-events-auto scorri max-h-[70dvh] w-full max-w-sm animate-[comparsa_.2s_ease-out] overflow-y-auto p-3" role="dialog" aria-label={`Scheda di ${chi.nome}`}>
      <div className="flex items-start gap-2.5">
        <Livello membro={m} grande />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-titolo text-[17px] font-bold leading-tight">{chi.nome}</h3>
            <Fonte fonte={m?.fonte} />
          </div>
          <p className="mt-0.5 text-[12.5px] text-grafite">{[chi.ruolo, `lavora con ${NOME[chi.motore]}`, m?.produzione ? 'costruisce in produzione' : ''].filter(Boolean).join(' · ')}</p>
        </div>
        <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-grafite hover:bg-cartaScura" onClick={onChiudi} aria-label="Chiudi la scheda">
          <X size={16} />
        </button>
      </div>
      {m?.descrizione && <p className="mt-2 text-[13px] leading-snug">{m.descrizione}</p>}
      <BarraXP membro={m} />
      <p className={`mt-2.5 rounded-lg px-2.5 py-1.5 text-[13px] ${lavoro ? 'bg-inchiostro text-white' : 'bg-cartaScura'}`}>
        <span className={`etichetta mr-1 ${lavoro ? '!text-giallo' : ''}`}>{titoloStato}</span>{testoStato}
      </p>
      {/* In partita prima quello che ha fatto qui, poi i numeri di sempre e le skill. */}
      {d && (
        <div className="mt-2.5">
          <div className="etichetta">In questa partita</div>
          {voci.length ? <ul className="mt-1 space-y-1.5">{voci.map((v, i) => <VoceDellaPartita key={i} v={v} />)}</ul> : <p className="mt-0.5 text-[12.5px] text-grafite">Non è stato chiamato.</p>}
        </div>
      )}
      {numeri.length > 0 && (
        <dl className="mt-2.5 grid grid-cols-3 gap-1.5">
          {numeri.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-bordo px-2 py-1.5">
              <dt className="text-[10.5px] leading-tight text-grafite">{k}</dt>
              <dd className="font-dati text-[13px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {!m && <p className="mt-2 text-[12.5px] text-grafite">Non è più nel catalogo della squadra, o il PC non ha ancora mandato l'elenco: restano i lavori di questa partita.</p>}
      {m && m.skill.length > 0 && (
        <div className="mt-3 border-t border-bordo pt-2">
          <div className="etichetta">Skill</div>
          <ul className="mt-1 space-y-1">
            {m.skill.map((k) => (
              <li key={k.nome} className="text-[13px] leading-snug">
                <span className="font-semibold">{k.nome}</span>
                {k.descrizione && <span className="block text-[12px] text-grafite">{k.descrizione}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Le procedure in breve: per che lavoro servono e chi fa cosa, nell'ordine dei passi.
function Procedure({ procedure }: { procedure: Procedura[] }) {
  const { squadra } = usaSquadra();
  return (
    <details className="border-t border-bordo px-3 py-2">
      <summary className="cursor-pointer etichetta">Procedure ({procedure.length})</summary>
      <ul className="scorri mt-1.5 max-h-48 space-y-2 overflow-y-auto pr-1">
        {procedure.map((p) => (
          <li key={p.id} className="text-[12.5px] leading-snug">
            <div className="flex items-center gap-1.5">
              <span className="font-titolo text-[13px] font-bold">{p.nome}</span>
              {p.fonte === 'utente' && <span className="rounded-full bg-[#effcc9] px-1.5 font-titolo text-[10px] font-bold uppercase text-[#3f5600]">tua</span>}
            </div>
            <p className="text-grafite">{p.quando}</p>
            {p.passi.length > 0 && <p className="mt-0.5 font-dati text-[11px] text-[#3a3d42]">{p.passi.map((x) => `${chiE(squadra, x.assistente).nome} (${FASE[x.fase]})`).join(' → ')}</p>}
          </li>
        ))}
      </ul>
    </details>
  );
}

// Il pannello della lobby: tutto il catalogo, chi ha più esperienza in alto. Un tocco apre la scheda.
export function PannelloSquadra({ aperto, onApri, caricamento }: { aperto?: string | null; onApri: (id: string) => void; caricamento?: string }) {
  const { squadra, procedure } = usaSquadra();
  const ordinati = perEsperienza(squadra);
  return (
    <section className="pannello pointer-events-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden" aria-label="Squadra">
      <div className="flex items-center gap-2 border-b border-bordo px-4 py-3">
        <Users size={18} />
        <h2 className="font-titolo text-[18px] font-bold">Squadra</h2>
        <span className="ml-auto text-[12px] text-grafite">{squadra.length ? `${quanti(squadra.length, 'assistente', 'assistenti')}, per esperienza` : ''}</span>
      </div>
      <ul className="scorri min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {!squadra.length && <li className="p-3 text-[13px] text-grafite">{caricamento ?? 'Carico la squadra…'}</li>}
        {ordinati.map((m) => (
          <li key={m.id}>
            <button
              className={`w-full rounded-xl border px-2.5 py-2 text-left transition-colors ${aperto === m.id ? 'border-inchiostro bg-[#f1f2f4]' : 'border-transparent hover:bg-cartaScura'}`}
              onClick={() => onApri(m.id)}
              aria-pressed={aperto === m.id}
            >
              <div className="flex items-center gap-2">
                <Livello membro={m} />
                <span className="truncate font-titolo text-[14px] font-bold">{m.nome}</span>
                {m.fonte === 'utente' && <Fonte fonte="utente" />}
                <span className="ml-auto shrink-0 font-dati text-[11px] text-grafite">{m.statistiche.xp} XP</span>
              </div>
              <div className="mt-0.5 truncate text-[12px] text-grafite">{m.ruolo}</div>
              <div className="mt-1.5 flex items-center gap-2">
                <BarraXP membro={m} sottile />
                <span className="w-[7.5rem] shrink-0 text-right text-[11px] text-grafite">chiamato {quanti(m.statistiche.incarichi, 'volta', 'volte')}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {procedure.length > 0 && <Procedure procedure={procedure} />}
    </section>
  );
}
