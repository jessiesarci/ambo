// La squadra nell'interfaccia: la barra dell'esperienza, i badge, la scheda completa di un
// assistente e il pannello della lobby con podio, carte compatte e procedure.
import { Award, BadgeCheck, Crown, FileText, Files, PackageCheck, ShieldCheck, Star, Target, Users, X, Zap, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NOME, type BadgeAssistente, type MembroSquadra, type Procedura } from '../../../motore/tipi.ts';
import {
  alLavoro, avanzamento, badgeDi, badgeInVetrina, breve, chiE, inCoda, lavoriDi, mancano, ORDINI, ordina, podio, STATO_INCARICO, STATO_PACCHETTO,
  titoloDi, usaSquadra, type Ordine, type VoceLavoro,
} from '../squadra.ts';
import type { Vista } from '../stato.ts';
import { Avatar } from './Avatar.tsx';
import { quanti, TestoMd, usaFinestra } from './comuni.tsx';

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
          <span className="etichetta !text-[10px]">Esperienza</span>
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

export function Livello({ membro }: { membro?: MembroSquadra }) {
  if (!membro) return null;
  return <span className="inline-grid shrink-0 place-items-center rounded-[6px] bg-inchiostro px-1.5 py-px font-dati text-[11px] font-bold text-giallo">Lv {membro.livello.livello}</span>;
}

function Fonte({ fonte }: { fonte?: MembroSquadra['fonte'] }) {
  if (!fonte) return null;
  return fonte === 'utente'
    ? <span className="rounded-full bg-[#effcc9] px-1.5 py-px font-titolo text-[10px] font-bold uppercase tracking-wide text-[#3f5600]">Tuo agente</span>
    : <span className="rounded-full bg-[#eceef1] px-1.5 py-px font-titolo text-[10px] font-bold uppercase tracking-wide text-[#4a5058]">Standard</span>;
}

// --- badge ------------------------------------------------------------------------------------

const ICONE: Record<string, LucideIcon> = {
  consegna: PackageCheck, rapporto: FileText, rapporti: Files, collaudo: BadgeCheck, sigillo: ShieldCheck,
  bersaglio: Target, fulmine: Zap, stella: Star, corona: Crown,
};

// Un badge come icona: nero con il disegno lime se preso, grigio chiaro se ancora da prendere.
export function IconaBadge({ b, dimensione = 26 }: { b: BadgeAssistente; dimensione?: number }) {
  const Icona = ICONE[b.icona] ?? Award;
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-[8px] ${b.preso ? 'bg-inchiostro text-giallo' : 'border border-dashed border-[#c4c8ce] bg-[#f6f7f8] text-[#a9aeb5]'}`}
      style={{ width: dimensione, height: dimensione }}
      title={`${b.nome}: ${b.regola}`}
      aria-hidden
    >
      <Icona size={Math.round(dimensione * 0.56)} strokeWidth={2.2} />
    </span>
  );
}

function Badge({ b }: { b: BadgeAssistente }) {
  return (
    <li className="flex items-start gap-2">
      <IconaBadge b={b} dimensione={30} />
      <span className="min-w-0">
        <span className={`block font-titolo text-[13px] font-bold leading-tight ${b.preso ? '' : 'text-grafite'}`}>{b.nome}<span className="sr-only">{b.preso ? ', preso' : ', da prendere'}</span></span>
        <span className="block text-[11.5px] leading-snug text-grafite">{b.regola}</span>
      </span>
    </li>
  );
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

function Sezione({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <section className="mt-3 border-t border-bordo pt-2.5">
      <h4 className="etichetta">{titolo}</h4>
      {children}
    </section>
  );
}

// La scheda completa di un assistente: chi è, livello e quanto manca, tutti i badge, la
// descrizione intera, cosa sa fare, i numeri e, in una partita aperta, cosa fa adesso e cosa ha
// consegnato. Sul telefono riempie lo schermo (lo decide chi la contiene); si chiude con X o Esc.
// modale: sta sopra un velo che copre tutto (la lobby), quindi tiene il Tab dentro di sé.
export function SchedaAssistente({ id, vista, onChiudi, className = '', modale = false }: { id: string; vista?: Vista; onChiudi: () => void; className?: string; modale?: boolean }) {
  const { squadra } = usaSquadra();
  const chi = chiE(squadra, id);
  const m = chi.membro;
  const s = m?.statistiche;
  const d = vista?.dibattito;
  const lavoro = vista ? alLavoro(vista).find((l) => l.id === id) : undefined;
  const coda = inCoda(d).find((i) => i.assistente === id);
  const azione = vista?.assistente?.id === id ? vista.assistente.azione?.testo : undefined;
  const voci = lavoriDi(d, id).slice(0, 6);
  // Esc e il focus che torna a chi l'ha aperta; prima di spostare il focus sulla X, così si sa da dove viene.
  const pannello = usaFinestra(onChiudi, modale);
  const chiudi = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    chiudi.current?.focus({ preventScroll: true });
  }, [id]);
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
  const manca = m ? mancano(m) : null;
  const badge = m ? badgeDi(m) : [];
  const presi = badge.filter((b) => b.preso).length;
  return (
    <div ref={pannello} className={`pannello pointer-events-auto scorri flex w-full flex-col overflow-y-auto overscroll-contain p-4 animate-[comparsa_.2s_ease-out] ${className}`} role="dialog" aria-modal={modale} aria-label={`Scheda di ${chi.nome}`}>
      <div className="flex items-start gap-3">
        <Avatar id={id} dimensione={76} />
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="font-titolo text-[20px] font-bold leading-tight [overflow-wrap:anywhere]">{chi.nome}</h3>
          <p className="mt-0.5 text-[12.5px] leading-snug text-grafite">{[chi.ruolo, `lavora con ${NOME[chi.motore]}`, m?.produzione ? 'costruisce in produzione' : ''].filter(Boolean).join(' · ')}</p>
          {m && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Livello membro={m} />
              <span className="font-titolo text-[13px] font-bold">{titoloDi(m)}</span>
              <Fonte fonte={m.fonte} />
            </div>
          )}
        </div>
        <button ref={chiudi} className="-mr-1 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-grafite hover:bg-cartaScura" onClick={onChiudi} aria-label="Chiudi la scheda">
          <X size={18} />
        </button>
      </div>
      <BarraXP membro={m} />
      {m && <p className="mt-1 text-[12px] text-grafite">{manca ? `Mancano ${manca.xp} XP al livello ${manca.livello}.` : 'Livello massimo raggiunto.'}</p>}
      <p className={`mt-2.5 rounded-lg px-2.5 py-1.5 text-[13px] ${lavoro ? 'bg-inchiostro text-white' : 'bg-cartaScura'}`}>
        <span className={`etichetta mr-1 ${lavoro ? '!text-giallo' : ''}`}>{titoloStato}</span>{testoStato}
      </p>
      {m?.descrizione && <p className="mt-2.5 whitespace-pre-line text-[14px] leading-snug">{m.descrizione}</p>}
      {!m && <p className="mt-2 text-[12.5px] text-grafite">Non è più nel catalogo della squadra, o il motore non ha ancora mandato l'elenco: restano i lavori di questa partita.</p>}
      {/* In partita prima quello che ha fatto qui. */}
      {d && (
        <Sezione titolo="In questa partita">
          {voci.length ? <ul className="mt-1 space-y-1.5">{voci.map((v, i) => <VoceDellaPartita key={i} v={v} />)}</ul> : <p className="mt-0.5 text-[12.5px] text-grafite">Non è stato chiamato.</p>}
        </Sezione>
      )}
      {badge.length > 0 && (
        <Sezione titolo={`Badge · ${presi} di ${badge.length}`}>
          <ul className="mt-1.5 grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">{badge.map((b) => <Badge key={b.id} b={b} />)}</ul>
        </Sezione>
      )}
      {m && m.skill.length > 0 && (
        <Sezione titolo="Competenze">
          <ul className="mt-1 space-y-1">
            {m.skill.map((k) => (
              <li key={k.nome} className="text-[13px] leading-snug">
                <span className="font-semibold">{k.nome}</span>
                {k.descrizione && <span className="block text-[12px] text-grafite">{k.descrizione}</span>}
              </li>
            ))}
          </ul>
        </Sezione>
      )}
      {numeri.length > 0 && (
        <Sezione titolo="Statistiche">
          <dl className="mt-1.5 grid grid-cols-3 gap-1.5">
            {numeri.map(([k, v]) => (
              <div key={k} className="rounded-lg border border-bordo px-2 py-1.5">
                <dt className="text-[10.5px] leading-tight text-grafite">{k}</dt>
                <dd className="font-dati text-[13px] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Sezione>
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

// I primi tre per esperienza, il primo al centro e più in alto.
function Podio({ primi, onApri }: { primi: MembroSquadra[]; onApri: (id: string) => void }) {
  if (primi.length < 2) return null;
  const posti = [primi[1], primi[0], primi[2]] as (MembroSquadra | undefined)[];
  const gradino = ['h-6', 'h-8', 'h-5'];
  const numero = [2, 1, 3];
  return (
    <ol className="grid grid-cols-3 items-end gap-1.5 border-b border-bordo px-3 pb-0 pt-2.5" aria-label="Podio per esperienza">
      {posti.map((m, i) => (
        <li key={m?.id ?? `vuoto-${i}`} className="flex min-w-0 flex-col items-center" style={{ order: i }}>
          {m && (
            <button className="flex w-full min-w-0 flex-col items-center rounded-lg px-1 pt-1 hover:bg-cartaScura" onClick={() => onApri(m.id)} aria-label={`${numero[i]}° posto: ${m.nome}, ${m.statistiche.xp} XP`}>
              <Avatar id={m.id} dimensione={i === 1 ? 50 : 40} />
              <span className="mt-1 w-full truncate text-center font-titolo text-[12.5px] font-bold leading-tight">{m.nome}</span>
              <span className="font-dati text-[10.5px] text-grafite">{m.statistiche.xp} XP</span>
            </button>
          )}
          <span className={`mt-1 grid w-full place-items-center rounded-t-md ${m ? 'bg-inchiostro' : 'bg-transparent'} ${gradino[i]} font-dati text-[10.5px] font-bold leading-none text-giallo`} aria-hidden>{m ? numero[i] : ''}</span>
        </li>
      ))}
    </ol>
  );
}

// Una carta compatta: avatar, nome, livello con il titolo, barra XP e al massimo tre badge.
function Carta({ m, aperto, onApri }: { m: MembroSquadra; aperto: boolean; onApri: () => void }) {
  const vetrina = badgeInVetrina(m);
  return (
    <button
      className={`flex w-full min-w-0 flex-col gap-1.5 rounded-xl border p-2 text-left transition-colors ${aperto ? 'border-inchiostro bg-[#f1f2f4]' : 'border-bordo bg-white hover:border-[#c4c8ce] hover:bg-[#fafafb]'}`}
      onClick={onApri}
      aria-pressed={aperto}
      aria-label={`${m.nome}, livello ${m.livello.livello}, ${titoloDi(m)}, ${m.statistiche.xp} XP`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Avatar id={m.id} dimensione={40} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-titolo text-[13.5px] font-bold leading-tight [overflow-wrap:anywhere]">{m.nome}</span>
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-grafite"><Livello membro={m} /> {titoloDi(m)}</span>
        </span>
      </span>
      <BarraXP membro={m} sottile />
      <span className="flex h-[22px] items-center gap-1">
        {vetrina.map((b) => <IconaBadge key={b.id} b={b} dimensione={22} />)}
        <span className="ml-auto font-dati text-[10.5px] text-grafite">{m.statistiche.xp} XP</span>
      </span>
    </button>
  );
}

// Il pannello della lobby: podio, ordinamento a scelta e la griglia delle carte. Un tocco apre la scheda.
export function PannelloSquadra({ aperto, onApri, caricamento }: { aperto?: string | null; onApri: (id: string) => void; caricamento?: string }) {
  const { squadra, procedure } = usaSquadra();
  const [ordine, setOrdine] = useState<Ordine>('esperienza');
  const ordinati = ordina(squadra, ordine);
  return (
    <section className="pannello pointer-events-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden" aria-label="Squadra">
      <div className="flex items-center gap-2 border-b border-bordo px-3 py-2.5">
        <Users size={18} aria-hidden />
        <h2 className="font-titolo text-[17px] font-bold">Squadra</h2>
        {squadra.length > 0 && <span className="font-dati text-[11px] text-grafite">{squadra.length}</span>}
        <div className="ml-auto inline-flex rounded-lg border border-bordo bg-cartaScura p-0.5" role="radiogroup" aria-label="Ordina la squadra">
          {(Object.keys(ORDINI) as Ordine[]).map((o) => (
            <button key={o} role="radio" aria-checked={ordine === o} className={`rounded-md px-2 py-1 font-titolo text-[11.5px] font-semibold ${ordine === o ? 'bg-inchiostro text-white' : 'text-grafite hover:text-inchiostro'}`} onClick={() => setOrdine(o)}>
              {ORDINI[o]}
            </button>
          ))}
        </div>
      </div>
      <div className="scorri min-h-0 flex-1 overflow-y-auto">
        {!squadra.length && <p className="p-3 text-[13px] text-grafite">{caricamento ?? 'Carico la squadra…'}</p>}
        <Podio primi={podio(squadra)} onApri={onApri} />
        <ul className="grid grid-cols-2 gap-1.5 p-2">
          {ordinati.map((m) => (
            <li key={m.id} className="min-w-0"><Carta m={m} aperto={aperto === m.id} onApri={() => onApri(m.id)} /></li>
          ))}
        </ul>
      </div>
      {procedure.length > 0 && <Procedure procedure={procedure} />}
    </section>
  );
}
