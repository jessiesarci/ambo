// La chat con Claude e Codex: è la schermata principale. Scrivi o detti, rispondono tutti e due
// (o chi sceglie), e intanto si vede cosa stanno facendo: chi pensa, chi cerca nelle note, chi scrive.
// Da qui una conversazione diventa un compito (una partita e poi la produzione).
import {
  ArrowUpRight, Box, Bug, Check, Copy, Cpu, Ellipsis, FolderLock, ListChecks, LoaderCircle, Menu, MessageSquare, Mic, NotebookPen, Pause, Plus, RotateCcw, SendHorizontal, Timer, Volume2, VolumeX, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { NOME, nomeAutore, type Agente, type Destinatari, type Dibattito, type MessaggioChat } from '../../../motore/tipi.ts';
import { api, type Accessi, type Info, type Riassunto } from '../api.ts';
import { BarraAllegati, Graffetta, usaAllegati } from './Allegati.tsx';
import { Ambud } from '../hud/Ambud.tsx';
import { Finestra } from '../hud/Comandi.tsx';
import { chiudiMarcatori, COLORE, durata, quanti, TestoMd } from '../hud/comuni.tsx';
import { Puntini } from '../scena/Fumetti.tsx';
import { Avatar } from '../hud/Avatar.tsx';
import { attivo as lavoroAttivo, CartaLavoro, FoglioLavoro, MissioneBreve, partitaDellaScheda, type InCampo } from './Lavoro.tsx';
import { Plancia, UfficioGrande, type ComandiUfficio, type LavoroInPlancia } from './Plancia.tsx';
import { ETICHETTE_ESITO, inCodaChat, type Vista, type VoceDiario } from '../stato.ts';
import { leggi, puoDettare, puoLeggereSulPc as puoLeggere, puoRegistrare, smettiDiLeggere, usaVoce, type ModoVoce } from '../voce.ts';

const AGENTI: Agente[] = ['claude', 'codex'];
const SCELTE: { valore: Destinatari; etichetta: string }[] = [
  { valore: 'entrambi', etichetta: 'Tutti e due' },
  { valore: 'claude', etichetta: 'Claude' },
  { valore: 'codex', etichetta: 'Codex' },
];
// Per cominciare: qualche domanda di esempio.
const SPUNTI = [
  'Cosa sapete fare voi due insieme, e come vi divido il lavoro?',
  'Aiutami a fare un piano per una cosa che voglio fare questa settimana.',
  'Ho un testo da migliorare: ve lo incollo e mi dite cosa cambiereste.',
];
const SPUNTI_CON_NOTE = [
  'Leggete il mio profilo e ditemi in breve cosa avete capito di me.',
  'Ripassami le ultime decisioni prese qui, in breve.',
];

// Preferenze di questo browser: restano qui e basta.
function preferenza<T extends string>(chiave: string, iniziale: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { return (localStorage.getItem(chiave) as T | null) ?? iniziale; } catch { return iniziale; }
  });
  return [v, (x: T) => { setV(x); try { localStorage.setItem(chiave, x); } catch { /* niente storage */ } }];
}

const ora = (iso: string) => new Date(iso).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' });
const migliaia = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

function statoAgente(v: Vista, a: Agente, coda: Agente[]): { testo: string; vivo: boolean } {
  if (v.parlante === a) {
    const azione = v.azione[a];
    if (v.fase[a] === 'strumento' && azione) return { testo: azione.testo, vivo: true };
    if (v.fase[a] === 'risposta') return { testo: 'Scrive la risposta', vivo: true };
    return { testo: 'Ci sta pensando', vivo: true };
  }
  if (coda.includes(a)) return { testo: 'Risponde dopo', vivo: false };
  if (v.fase[a] === 'errore') return { testo: 'Si è fermato per un errore', vivo: false };
  return { testo: 'Libero', vivo: false };
}

// --- pezzi -----------------------------------------------------------------------------------

function Pallino({ agente, vivo }: { agente: Agente; vivo?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
      {vivo && <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: COLORE[agente] }} />}
      <span className="relative inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: COLORE[agente], boxShadow: '0 0 0 1px #141518' }} />
    </span>
  );
}

function Diario({ voci, onScheda }: { voci: VoceDiario[]; onScheda?: (a: Agente) => void }) {
  const schede = onScheda && (
    <div className="flex gap-1.5 px-1 pt-1.5">
      {AGENTI.map((a) => <button key={a} className="tasto !min-h-7 !px-2 text-[12px]" onClick={() => onScheda(a)}><Pallino agente={a} /> Scheda di {NOME[a]}</button>)}
    </div>
  );
  if (!voci.length) return <>{schede}<p className="px-1 py-2 text-[12px] text-grafite">Qui compare quello che fanno mentre rispondono: le note che cercano e leggono, le ricerche sul web, le skill.</p></>;
  return (
    <>{schede}<ol className="scorri max-h-40 overflow-y-auto py-1 text-[12px]">
      {[...voci].reverse().map((v) => (
        <li key={v.id} className="flex items-center gap-2 px-1 py-0.5">
          <span className="font-dati text-[10.5px] text-grafite">{new Date(v.ora).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <Pallino agente={v.agente} />
          <span className="min-w-0 truncate"><b className="font-semibold">{NOME[v.agente]}</b> · {v.testo}</span>
        </li>
      ))}
    </ol></>
  );
}

function BollaUtente({ m, inInvio }: { m: Pick<MessaggioChat, 'testo' | 'ora' | 'voce' | 'a'>; inInvio?: boolean }) {
  return (
    <div className="flex justify-end">
      <div className={`max-w-[85%] rounded-2xl rounded-br-md bg-[#141518] px-3.5 py-2 text-[15px] leading-snug text-white ${inInvio ? 'opacity-60' : ''}`}>
        <p className="whitespace-pre-wrap break-words">{m.testo}</p>
        <div className="mt-1 flex items-center justify-end gap-1.5 font-dati text-[10.5px] text-[#9aa0a6]">
          {m.a?.length === 1 && <span>a {NOME[m.a[0]!]}</span>}
          {m.voce && <Mic size={11} aria-label="dettato a voce" />}
          <span>{inInvio ? 'invio…' : ora(m.ora)}</span>
        </div>
      </div>
    </div>
  );
}

// Lo stato di una partita in poche parole, da quello che dice l'archivio.
function statoPartita(r: Riassunto | undefined): string {
  if (!r) return 'In partenza…';
  if (r.stato === 'concluso') {
    const esito = r.esito ? ETICHETTE_ESITO[r.esito] : 'Conclusa';
    const prod = r.produzione === 'in_lavorazione' ? 'la squadra costruisce' : r.produzione === 'collaudo' ? 'collaudo di Codex'
      : r.produzione === 'pronta' ? (r.collaudo ? 'produzione pronta, collaudo superato' : 'produzione pronta, respinta dal collaudo')
        : r.produzione === 'errore' ? 'produzione ferma per un errore' : r.produzione === 'fermata' ? 'produzione fermata' : '';
    return prod ? `${esito} · ${prod}` : esito;
  }
  if (r.stato === 'sintesi') return 'Scrivono la sintesi';
  if (r.stato === 'in_pausa') return 'In pausa';
  if (r.stato === 'errore') return 'Ferma per un errore';
  if (r.inCorso || r.stato === 'in_corso') return `Riunione in corso · ${quanti(r.turni, 'intervento', 'interventi')}`;
  return 'In partenza…';
}

// Cosa lavora adesso fuori dalla chat e cosa aspetta una decisione: l'elenco si apre toccando la
// squadra in campo, in cima alla chat.
type VoceLavori = { r: Riassunto; attivo: boolean; aspetta: boolean };
function lavoriDellaChat(partite: Riassunto[]): VoceLavori[] {
  const giorno = Date.now() - 24 * 3600_000;
  return partite.map((r) => {
    const attivo = lavoroAttivo(r);
    const aspetta = !attivo && new Date(r.aggiornato).getTime() > giorno
      && (r.stato === 'errore' || r.stato === 'in_pausa' || (r.stato === 'concluso' && !r.produzione) || r.produzione === 'errore' || (r.produzione === 'pronta' && r.collaudo === false));
    return { r, attivo, aspetta };
  }).filter((x) => x.attivo || x.aspetta)
    // Prima quello che aspetta una decisione, poi quello che lavora: l'ordine dell'archivio resta dentro.
    .sort((a, b) => Number(b.aspetta) - Number(a.aspetta));
}

// La squadra in campo, come le icone dei personaggi in un gioco: Claude e Codex sempre, poi chi
// lavora adesso ai lavori di questa chat. Chi lavora ha l'anello lime e due parole su cosa fa. Un
// tocco apre il diario e l'elenco dei lavori.
function SquadraInCampo({ vista, coda, inCampo, aperto, onApri }: { vista: Vista; coda: Agente[]; inCampo: InCampo[]; aperto: boolean; onApri: () => void }) {
  const [, setTic] = useState(0);
  useEffect(() => {
    if (!vista.parlante) return;
    const t = setInterval(() => setTic((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [vista.parlante]);
  const capo = (a: Agente): InCampo & { vivo: boolean } => {
    if (vista.parlante === a) {
      const t = statoAgente(vista, a, coda).testo;
      return { id: a, nome: NOME[a], azione: t === 'Ci sta pensando' ? 'pensa' : t === 'Scrive la risposta' ? 'scrive' : t.split(' ').slice(0, 2).join(' ').toLowerCase(), vivo: true };
    }
    const altrove = inCampo.find((x) => x.id === a);
    if (altrove) return { ...altrove, vivo: true };
    return { id: a, nome: NOME[a], azione: coda.includes(a) ? 'dopo' : vista.fase[a] === 'errore' ? 'errore' : 'libero', vivo: false };
  };
  const altri = [...new Map(inCampo.filter((x) => x.id !== 'claude' && x.id !== 'codex').map((x) => [x.id, x])).values()];
  const membri = [capo('claude'), capo('codex'), ...altri.map((x) => ({ ...x, vivo: true }))];
  return (
    <button className="scorri flex w-full items-start gap-2.5 overflow-x-auto pb-0.5 text-left" onClick={onApri} aria-expanded={aperto} aria-label="La squadra: apri il diario e i lavori">
      {membri.map((x) => (
        <span key={x.id} className="w-14 shrink-0 text-center">
          <span className={`relative mx-auto block w-fit rounded-[14px] ${x.vivo ? 'ring-[3px] ring-[#b5f900] ring-offset-1 ring-offset-white shadow-[0_0_0_4.5px_#141518]' : 'opacity-60 grayscale'}`}>
            <Avatar id={x.id} dimensione={40} />
            {x.vivo && <span className="absolute -bottom-1 -right-1 h-3 w-3 animate-pulse rounded-full border-2 border-white bg-[#b5f900] shadow-[0_0_0_1px_#141518]" aria-hidden />}
          </span>
          <span className="mt-1.5 block truncate font-titolo text-[11px] font-semibold leading-tight">{x.nome}</span>
          <span className={`block truncate font-dati text-[9.5px] leading-tight ${x.vivo ? 'text-inchiostro' : 'text-grafite'}`}>{x.azione}</span>
        </span>
      ))}
      {vista.parlante && vista.inizioTurno ? <span className="ml-auto self-center font-dati text-[10.5px] text-grafite">{durata(Date.now() - vista.inizioTurno)}</span> : null}
    </button>
  );
}


function Lavori({ voci, onApri }: { voci: VoceLavori[]; onApri: (id: string) => void }) {
  return (
    <ul id="lavori-chat" className="scorri mt-1.5 max-h-52 space-y-0.5 overflow-y-auto border-t border-bordo pt-1.5" aria-label="Lavori">
      {voci.map(({ r, attivo }) => (
        <li key={r.id}>
          <button className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[12.5px] hover:bg-cartaScura" onClick={() => onApri(r.id)}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${attivo ? 'animate-pulse bg-[#b5f900] ring-1 ring-[#141518]' : 'bg-[#141518]'}`} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{r.domanda}</span>
              <span className="block truncate text-[11.5px] text-grafite">{attivo ? 'Al lavoro' : 'Da decidere'} · {statoPartita(r)}</span>
            </span>
            <ArrowUpRight size={13} className="shrink-0 text-grafite" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

// Un fatto del programma scritto in chat dal motore: partita avviata, conclusa, produzione pronta.
// Di serie la prima frase su una riga; un tocco mostra il testo intero.
const primaFrase = (t: string) => t.split(/(?<=[.:»])\s+(?=[A-ZÀ-Ý])/)[0] ?? t;

function BollaMotore({ m, onApri }: { m: MessaggioChat; onApri: (id: string) => void }) {
  const id = m.evento?.partita;
  const [tutto, setTutto] = useState(false);
  const prima = primaFrase(m.testo);
  const lungo = prima.length < m.testo.length;
  return (
    <div className="flex items-start gap-2 px-1 text-[12.5px] leading-snug text-grafite">
      <Cpu size={13} className="mt-[3px] shrink-0" aria-hidden />
      {lungo
        ? <button className={`min-w-0 flex-1 text-left text-inchiostro ${tutto ? 'break-words' : 'truncate'}`} onClick={() => setTutto(!tutto)} aria-expanded={tutto}>{tutto ? m.testo : prima}</button>
        : <p className="min-w-0 flex-1 break-words text-inchiostro">{m.testo}</p>}
      <span className="mt-px shrink-0 font-dati text-[10.5px]">{ora(m.ora)}</span>
      {id && <button className="shrink-0 rounded-lg px-1 text-[12.5px] font-semibold text-inchiostro underline decoration-[#b5f900] decoration-2" onClick={() => onApri(id)}>Apri</button>}
    </div>
  );
}

// Tempi e token si vedono con un tocco sulla risposta, o sempre se lo si sceglie dal menu.
function BollaAgente({ m, leggendo, onLeggi, scheda, dettagli }: { m: MessaggioChat; leggendo: boolean; onLeggi: () => void; scheda?: ReactNode; dettagli: boolean }) {
  const agente = m.autore as Agente;
  const [copiato, setCopiato] = useState(false);
  const [aperta, setAperta] = useState(false);
  // Un tocco sul testo (non su un link, un tasto o una selezione) mostra o nasconde i numeri.
  const tocco = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('a, button, input, textarea, select') || window.getSelection()?.toString()) return;
    setAperta((x) => !x);
  };
  if (m.passa) {
    return (
      <div className="flex items-center gap-2 pl-1 text-[12px] text-grafite">
        <Pallino agente={agente} /> {NOME[agente]}: niente da aggiungere
      </div>
    );
  }
  const c = m.chiamata;
  return (
    <div className="flex">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-bordo bg-white px-3.5 pb-1 pt-2.5 shadow-[0_1px_0_#e2e4e8]" onClick={tocco}>
        <div className="mb-1 flex items-center gap-1.5 font-titolo text-[12.5px] font-bold">
          <Pallino agente={agente} /> {NOME[agente]}
          <span className="font-dati text-[10.5px] font-normal text-grafite">{ora(m.ora)}</span>
        </div>
        {m.testo && <div className="text-[15px] [&_.md]:text-[15px]"><TestoMd testo={m.testo} /></div>}
        {scheda}
        <div className="flex items-center justify-end gap-0.5 text-grafite">
          {c && (dettagli || aperta) && <span className="mr-auto font-dati text-[10.5px]" title={`${c.modello} · ${c.uso.ingresso} token in ingresso (${c.uso.inCache} dalla cache) · ${c.uso.uscita} in uscita`}>{c.secondi.toFixed(0)} s · {migliaia(c.uso.ingresso)} in · {migliaia(c.uso.uscita)} out</span>}
          <button className="rounded-lg p-1.5 hover:bg-cartaScura" onClick={() => void navigator.clipboard?.writeText(m.testo).then(() => { setCopiato(true); setTimeout(() => setCopiato(false), 1500); })} aria-label="Copia la risposta">
            {copiato ? <Check size={15} /> : <Copy size={15} />}
          </button>
          {puoLeggere() && (
            <button className="rounded-lg p-1.5 hover:bg-cartaScura" onClick={onLeggi} aria-label={leggendo ? 'Smetti di leggere' : 'Leggi ad alta voce'} aria-pressed={leggendo}>
              {leggendo ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// La risposta mentre arriva: il testo di Claude cresce, Codex lo manda tutto alla fine.
function BollaDalVivo({ vista }: { vista: Vista }) {
  const a = vista.parlante!;
  const azione = vista.azione[a];
  const testo = vista.testoParziale;
  return (
    <div className="flex" aria-live="off">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-dashed border-[#c4c8ce] bg-white/90 px-3.5 py-2.5">
        <div className="mb-1 flex items-center gap-1.5 font-titolo text-[12.5px] font-bold">
          <Pallino agente={a} vivo /> {NOME[a]}
          <span className="font-dati text-[10.5px] font-normal text-grafite">{azione && vista.fase[a] === 'strumento' ? azione.testo : vista.fase[a] === 'risposta' ? 'scrive' : 'ci pensa'}</span>
        </div>
        {testo ? <div className="text-[15px] [&_.md]:text-[15px]"><TestoMd testo={chiudiMarcatori(testo)} /></div> : <span className="text-grafite"><Puntini /></span>}
      </div>
    </div>
  );
}

function Scelta({ valore, onCambia, compatta }: { valore: Destinatari; onCambia: (v: Destinatari) => void; compatta?: boolean }) {
  return (
    <div className="inline-flex rounded-xl border border-bordo bg-cartaScura p-0.5" role="radiogroup" aria-label="Chi risponde">
      {SCELTE.map((s) => (
        <button
          key={s.valore}
          role="radio"
          aria-checked={valore === s.valore}
          className={`rounded-[10px] px-2.5 py-1 font-titolo text-[12px] font-semibold ${valore === s.valore ? 'bg-[#141518] text-white' : 'text-grafite'}`}
          onClick={() => onCambia(s.valore)}
        >
          {compatta && s.valore === 'entrambi' ? 'Tutti' : s.etichetta}
        </button>
      ))}
    </div>
  );
}

// Lo stato del campo e del vocale sta qui, nella schermata, non nel Composer: passando tra la chat
// intera e il foglio dell'ufficio il Composer si rimonta, e la bozza o il vocale non vanno persi.
function usaCampo(modoVoce: ModoVoce, voceSulPc: boolean, onInvia: (testo: string, voce: boolean) => Promise<boolean>) {
  const [testo, setTesto] = useState('');
  const [daVoce, setDaVoce] = useState(false);
  const [invio, setInvio] = useState(false);
  const [avvisoVoce, setAvvisoVoce] = useState<string>();
  const fuoco = useRef<() => void>(() => undefined);
  const voce = usaVoce({
    modo: modoVoce,
    onTesto: (t) => {
      setTesto((x) => (x.trim() ? `${x.trim()} ${t}` : t));
      setDaVoce(true);
      setTimeout(() => fuoco.current(), 50);
    },
  });
  const invia = async (disabilitato?: string) => {
    const t = testo.trim();
    if (!t || invio || disabilitato) return;
    setInvio(true);
    const ok = await onInvia(t, daVoce);
    setInvio(false);
    if (ok) {
      setTesto('');
      setDaVoce(false);
    }
  };
  // Senza la trascrizione sul PC non si passa da soli alla dettatura del browser: quella manda la
  // voce al servizio di chi fa il browser, e la scelta si fa dal menu.
  const avviaVoce = () => {
    if (modoVoce === 'pc' && !voceSulPc) {
      setAvvisoVoce(puoDettare()
        ? 'La trascrizione sul PC non è installata (npm run voce:installa). Dal menu ⋯ puoi usare la dettatura del browser, che passa dal servizio di chi fa il browser.'
        : 'La trascrizione sul PC non è installata, e questo browser non ha la dettatura.');
      return;
    }
    setAvvisoVoce(undefined);
    void voce.avvia();
  };
  return { testo, setTesto, daVoce, setDaVoce, invio, invia, voce, avviaVoce, avvisoVoce, chiudiAvviso: () => setAvvisoVoce(undefined), fuoco };
}
type Campo = ReturnType<typeof usaCampo>;

const SUL_COMPUTER = () => window.matchMedia('(pointer: fine)').matches;

// Il campo in basso: testo, microfono, invio. Mentre registra diventa la barra del vocale.
function Composer(op: {
  campo: Campo; disabilitato?: string; occupato: boolean; modoVoce: ModoVoce; chi: Destinatari; setChi: (c: Destinatari) => void;
  onStop?: () => void; compatto?: boolean;
  allegati?: ReactNode; onFile?: (f: File[]) => void;
}) {
  const { testo, setTesto, setDaVoce, invio, voce } = op.campo;
  const area = useRef<HTMLTextAreaElement>(null);
  op.campo.fuoco.current = () => area.current?.focus();
  // Il campo cresce con il testo, fino a un terzo dello schermo.
  useEffect(() => {
    const c = area.current;
    if (!c) return;
    c.style.height = 'auto';
    c.style.height = `${Math.min(c.scrollHeight, window.innerHeight / 3)}px`;
  }, [testo]);

  const invia = () => void op.campo.invia(op.disabilitato);
  const tasti = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Sul computer Invio manda e Maiusc+Invio va a capo; sul telefono Invio va a capo.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && SUL_COMPUTER()) {
      e.preventDefault();
      invia();
    }
  };
  const registra = voce.stato === 'registra';
  const microfono = op.modoVoce === 'browser' ? puoDettare() : puoRegistrare();
  const errore = voce.errore ?? op.campo.avvisoVoce;

  // Un file trascinato sul campo o incollato (una schermata copiata) diventa un allegato.
  const daFuori = (lista: FileList | null | undefined) => {
    const f = [...(lista ?? [])];
    if (!f.length || !op.onFile) return false;
    op.onFile(f);
    return true;
  };

  return (
    <div
      className="flex flex-col gap-1.5"
      onDragOver={op.onFile ? (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); } : undefined}
      onDrop={op.onFile ? (e) => { if (daFuori(e.dataTransfer.files)) e.preventDefault(); } : undefined}
    >
      {op.allegati}
      {errore && (
        <div className="flex items-start gap-2 rounded-xl border border-[#141518] bg-white px-3 py-2 text-[13px]" role="alert">
          <span className="flex-1">{errore}</span>
          <button className="text-grafite" onClick={() => { voce.chiudiErrore(); op.campo.chiudiAvviso(); }} aria-label="Chiudi"><X size={16} /></button>
        </div>
      )}
      {!op.compatto && (
        <div className="flex items-center justify-between gap-2">
          <Scelta valore={op.chi} onCambia={op.setChi} compatta />
          {op.occupato && op.onStop && <button className="tasto !min-h-8 !px-2.5 text-[12px]" onClick={op.onStop}><Pause size={14} /> Ferma</button>}
        </div>
      )}
      {registra || voce.stato === 'trascrive' ? (
        <div className="flex items-center gap-2 rounded-2xl border border-[#141518] bg-[#141518] px-2 py-2 text-white">
          <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#c4c8ce] hover:bg-white/10" onClick={voce.annulla} aria-label="Annulla il vocale" disabled={voce.stato === 'trascrive'}>
            <X size={20} />
          </button>
          <div className="min-w-0 flex-1">
            {voce.stato === 'trascrive' ? (
              <span className="flex items-center gap-2 text-[14px]"><LoaderCircle size={16} className="animate-spin" /> Trascrivo sul PC…</span>
            ) : voce.parziale ? (
              <span className="line-clamp-2 text-[14px]">{voce.parziale}</span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#ff3b30]" />
                <span className="font-dati text-[13px]">{voce.inizio ? durata(Date.now() - voce.inizio) : '0:00'}</span>
                <span className="flex h-6 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>
                  {Array.from({ length: 24 }, (_, i) => (
                    <span key={i} className="w-[3px] rounded-full bg-[#b5f900] transition-[height] duration-100" style={{ height: `${Math.max(3, voce.livello * 24 * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.7 + (voce.inizio ?? 0)))))}px` }} />
                  ))}
                </span>
              </span>
            )}
          </div>
          <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#b5f900] text-[#141518]" onClick={voce.ferma} aria-label="Fine del vocale" disabled={voce.stato === 'trascrive'}>
            {voce.stato === 'trascrive' ? <LoaderCircle size={20} className="animate-spin" /> : <Check size={20} />}
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5 rounded-2xl border border-bordo bg-white p-1.5 shadow-[0_2px_0_#e2e4e8] focus-within:border-[#141518]">
          {op.onFile && <Graffetta onFile={op.onFile} disabilitato={!!op.disabilitato} />}
          <textarea
            ref={area}
            rows={1}
            value={testo}
            onChange={(e) => { setTesto(e.target.value); if (!e.target.value) setDaVoce(false); }}
            onKeyDown={tasti}
            onPaste={op.onFile ? (e) => { if (daFuori(e.clipboardData.files)) e.preventDefault(); } : undefined}
            placeholder={op.disabilitato ?? (op.chi === 'entrambi' ? 'Scrivi a Claude e Codex…' : `Scrivi a ${NOME[op.chi as Agente]}…`)}
            disabled={!!op.disabilitato}
            maxLength={8000}
            aria-label="Messaggio"
            // Sul telefono Invio va a capo: la tastiera non deve mostrare "Invia".
            enterKeyHint={SUL_COMPUTER() ? 'send' : 'enter'}
            className="scorri max-h-[33dvh] min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-[16px] leading-snug outline-none placeholder:text-[#9aa0a6]"
          />
          {microfono && !testo.trim() ? (
            <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#141518] text-white disabled:opacity-40" onClick={op.campo.avviaVoce} disabled={!!op.disabilitato} aria-label={op.modoVoce === 'browser' ? 'Detta' : 'Registra un vocale'}>
              <Mic size={20} />
            </button>
          ) : (
            <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#b5f900] text-[#141518] shadow-[0_2px_0_#141518] disabled:opacity-40" onClick={invia} disabled={!testo.trim() || invio || !!op.disabilitato} aria-label="Invia">
              {invio ? <LoaderCircle size={20} className="animate-spin" /> : <SendHorizontal size={20} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Voce({ icona, children, onClick, disabled }: { icona: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button role="menuitem" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] hover:bg-cartaScura disabled:opacity-40" onClick={onClick} disabled={disabled}>
      {icona} {children}
    </button>
  );
}

function ElencoChat({ chats, id, onApri, onNuova, onPartite, onChiudi }: { chats: Riassunto[]; id?: string; onApri: (id: string) => void; onNuova: () => void; onPartite: () => void; onChiudi: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex bg-[#0b0c0e]/30" onClick={onChiudi}>
      <nav className="flex h-full w-[86%] max-w-[340px] flex-col bg-white pt-[env(safe-area-inset-top)] shadow-xl animate-[comparsa_.18s_ease-out]" onClick={(e) => e.stopPropagation()} aria-label="Le tue chat">
        <div className="flex items-center gap-2 border-b border-bordo p-3">
          <span className="flex-1 font-titolo text-[16px] font-bold">Chat</span>
          <button className="tasto tasto-primario !min-h-9" onClick={onNuova}><Plus size={16} /> Nuova</button>
        </div>
        <ul className="scorri flex-1 overflow-y-auto p-1.5">
          {!chats.length && <li className="p-3 text-[13px] text-grafite">Nessuna chat ancora.</li>}
          {chats.map((c) => (
            <li key={c.id}>
              <button className={`flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left ${c.id === id ? 'bg-cartaScura' : 'hover:bg-cartaScura'}`} onClick={() => onApri(c.id)}>
                <span className="flex items-center gap-1.5">
                  {c.inCorso && <span className="h-2 w-2 rounded-full bg-[#b5f900] ring-1 ring-[#141518]" aria-label="sta rispondendo" />}
                  <span className="min-w-0 flex-1 truncate font-titolo text-[14px] font-semibold">{c.domanda}</span>
                  <span className="font-dati text-[10.5px] text-grafite">{new Date(c.aggiornato).toLocaleDateString('it-CH', { day: '2-digit', month: '2-digit' })}</span>
                </span>
                {c.ultimo && <span className="truncate text-[12.5px] text-grafite">{c.ultimo.autore === 'utente' ? 'Tu' : NOME[c.ultimo.autore]}: {c.ultimo.testo}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-bordo p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button className="tasto w-full" onClick={onPartite}><ListChecks size={16} /> Partite e produzione</button>
        </div>
      </nav>
    </div>
  );
}

// Dalla chat a un compito: una partita "insieme" che riceve le ultime battute come contesto.
// L'obiettivo parte dall'ultima scheda proposta, se c'è: l'ultimo messaggio dell'utente era spesso un
// "come da briefing" e diventava l'obiettivo della partita.
function FinestraCompito({ d, onChiudi, onAvviata }: { d: Dibattito; onChiudi: () => void; onAvviata: () => void }) {
  const scheda = d.chat?.findLast((m) => m.proposta)?.proposta;
  const [obiettivo, setObiettivo] = useState(scheda?.obiettivo ?? '');
  const [titolo, setTitolo] = useState(scheda?.titolo ?? '');
  const [poi, setPoi] = useState(scheda?.dopo === 'produzione');
  const [errore, setErrore] = useState<string>();
  const [invio, setInvio] = useState(false);
  const avvia = () => {
    setInvio(true);
    setErrore(undefined);
    api.crea({
      domanda: obiettivo.trim(), ...(titolo.trim() ? { titolo: titolo.trim() } : {}), daChat: d.id, modo: 'insieme',
      memoria: d.config.memoria, claude: d.config.claude, codex: d.config.codex, ...(poi ? { poiProduzione: true } : {}),
    }).then(() => onAvviata(), (e: Error) => { setErrore(e.message); setInvio(false); });
  };
  return (
    <Finestra titolo="Trasforma in compito" onChiudi={onChiudi}>
      <p className="mb-2 text-[13px] text-grafite">Claude e Codex preparano il piano in una partita, con le ultime battute di questa chat come contesto. La partita compare qui in chat, con il suo stato.</p>
      <label className="etichetta" htmlFor="titolo-compito">Titolo</label>
      <input id="titolo-compito" className="campo mt-1 text-[16px]" value={titolo} onChange={(e) => setTitolo(e.target.value)} maxLength={120} placeholder="Es. Sito del negozio: prenotazioni" />
      <label className="etichetta mt-2 block" htmlFor="obiettivo">L'obiettivo</label>
      <textarea id="obiettivo" className="campo mt-1 min-h-28 text-[16px]" value={obiettivo} onChange={(e) => setObiettivo(e.target.value)} maxLength={20_000} placeholder="Cosa va fatto, il perimetro e le scelte già prese: la partita non legge tutta la chat." />
      <label className="mt-2 flex items-center gap-2 text-[13.5px]">
        <input type="checkbox" className="h-4 w-4 accent-[#141518]" checked={poi} onChange={(e) => setPoi(e.target.checked)} />
        Con l'accordo pieno, mandalo in produzione da solo
      </label>
      {errore && <p className="mt-2 text-[13px] text-[#9b2626]" role="alert">{errore}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button className="tasto" onClick={onChiudi}>Annulla</button>
        <button className="tasto tasto-primario" onClick={avvia} disabled={!obiettivo.trim() || invio}>{invio ? 'Avvio…' : 'Avvia la partita'}</button>
      </div>
    </Finestra>
  );
}

// Primo avvio: le due CLI vanno installate e collegate con il proprio account, dal terminale.
// Il programma non tocca i login: li fa chi lo usa, con il flusso ufficiale.
function PrimoAvvio({ accessi }: { accessi: Accessi }) {
  const passi: { agente: Agente; installa: string; collega: string; perche: string }[] = [
    { agente: 'claude', installa: 'npm install -g @anthropic-ai/claude-code', collega: 'claude', perche: 'poi, dentro Claude Code, /login con il tuo account Claude' },
    { agente: 'codex', installa: 'npm install -g @openai/codex', collega: 'codex login', perche: 'con il tuo account ChatGPT' },
  ];
  return (
    <div className="w-full rounded-xl border border-[#141518] bg-white p-3 text-left text-[13px]" role="status">
      <div className="etichetta">Prima di cominciare</div>
      <ul className="mt-1.5 space-y-2.5">
        {passi.map((x) => (
          <li key={x.agente}>
            <div className="flex items-center gap-1.5 font-semibold">
              {accessi[x.agente].ok ? <Check size={14} className="text-accordo" /> : <X size={14} className="text-[#9b2626]" />} {NOME[x.agente]}
            </div>
            <p className="text-grafite">{accessi[x.agente].dettaglio}</p>
            {!accessi[x.agente].ok && (
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                <li>Installa: <code className="break-all">{x.installa}</code></li>
                <li>In un terminale: <code>{x.collega}</code>, {x.perche}.</li>
              </ol>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-grafite">Poi ricarica questa pagina. Il programma non legge e non salva le credenziali: le tengono le CLI.</p>
    </div>
  );
}

// --- la schermata ----------------------------------------------------------------------------

export interface PropsChat {
  vista: Vista;
  id?: string;
  chats: Riassunto[];
  partite: Riassunto[]; // per lo stato delle partite nate dalla chat
  info?: Info;
  accessi?: Accessi; // Claude Code e Codex installati e collegati? Serve al primo avvio
  serverGiu: boolean;
  errore?: string;
  compatta?: boolean; // sul telefono, con l'ufficio in vista: solo stato, ultima risposta e campo
  onApri: (id: string) => void;
  onNuova: () => void;
  onPartite: () => void;
  onUfficio?: () => void;
  onChat?: () => void;
  onPartita: (id: string) => void;
  onScheda?: (a: Agente) => void; // la scheda dell'agente: cosa fa, cosa ha usato, le sue skill
  onChiudiErrore?: () => void;
  onCartelle?: () => void;
  onRapporti?: () => void; // i rapporti d'errore: chiedi, sempre o mai
  ufficio?: ComandiUfficio; // sul computer largo: il riquadro dell'ufficio 3D accanto alla plancia
}

export function Chat(p: PropsChat) {
  const haNote = !!p.info?.impostazioni && (p.info.impostazioni.profilo || p.info.impostazioni.note);
  const d = p.vista.dibattito && p.vista.dibattito.id === p.id ? p.vista.dibattito : undefined;
  const messaggi = d?.chat ?? [];
  const [chi, setChi] = useState<Destinatari>('entrambi');
  const [modoVoce, setModoVoce] = preferenza<ModoVoce>('ambo.voce', 'pc');
  const [leggiSempre, setLeggiSempre] = preferenza<'si' | 'no'>('ambo.leggi', 'no');
  const [elenco, setElenco] = useState(false);
  const [menu, setMenu] = useState(false);
  const [diario, setDiario] = useState(false);
  const [foglio, setFoglio] = useState<{ id: string; conProduzione: boolean } | null>(null);
  // Chi lavora adesso, missione per missione (l'indice è quello della scheda in chat).
  const [inCampo, setInCampo] = useState<Record<number, InCampo[]>>({});
  const segnaInCampo = useCallback((indice: number, membri: InCampo[]) => setInCampo((x) => {
    if (!membri.length && !x[indice]) return x;
    const y = { ...x };
    if (membri.length) y[indice] = membri; else delete y[indice];
    return y;
  }), []);
  // Tempi e token sotto ogni risposta: nascosti di serie, sempre visibili a scelta.
  const [dettagli, setDettagli] = preferenza<'si' | 'no'>('ambo.dettagli', 'no');
  const [compito, setCompito] = useState(false);
  const [errore, setErrore] = useState<string>();
  const [fatto, setFatto] = useState<string>();
  const [inInvio, setInInvio] = useState<{ testo: string; voce: boolean; a?: Agente[]; prima: number }>();
  const [leggendo, setLeggendo] = useState<number>();
  const scorri = useRef<HTMLDivElement>(null);
  const inFondo = useRef(true);
  const lettiAlta = useRef<number>(-1);

  useEffect(() => { setChi(d?.config.chi ?? 'entrambi'); }, [d?.id, d?.config.chi]);
  // Cambiando chat si ripulisce; ma la chat appena creata tiene il messaggio "in invio" finché arriva.
  const idPrima = useRef(p.id);
  useEffect(() => {
    if (idPrima.current) { setErrore(undefined); setInInvio(undefined); setDiario(false); }
    idPrima.current = p.id;
  }, [p.id]);
  // La trascrizione sul PC c'è solo se è installata. La dettatura del browser (servizio di chi
  // fa il browser) si sceglie dal menu: non ci si passa da soli.
  const voceSulPc = p.info?.voce?.disponibile !== false;
  const modo: ModoVoce = modoVoce;

  // Si scende in fondo a ogni novità, ma solo se si era già in fondo (non mentre si rilegge).
  useEffect(() => {
    const el = scorri.current;
    if (el && inFondo.current) el.scrollTop = el.scrollHeight;
  }, [messaggi.length, p.vista.testoParziale, p.vista.parlante, inInvio]);
  useEffect(() => { inFondo.current = true; }, [p.id]);
  useEffect(() => {
    const el = scorri.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (inFondo.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, [p.compatta]);

  // Il messaggio inviato resta "in invio" finché non arriva dal motore.
  useEffect(() => {
    // Il motore può ritoccare il testo (toglie un @nome iniziale): conta che ne sia arrivato uno nuovo.
    if (inInvio && messaggi.filter((m) => m.autore === 'utente').length > inInvio.prima) setInInvio(undefined);
  }, [messaggi, inInvio]);

  // Lettura automatica delle risposte nuove, se l'hai chiesta.
  useEffect(() => {
    const ultimo = messaggi.at(-1);
    if (lettiAlta.current < 0) { lettiAlta.current = ultimo?.indice ?? 0; return; }
    if (!ultimo || ultimo.indice <= lettiAlta.current) return;
    lettiAlta.current = ultimo.indice;
    if (leggiSempre === 'si' && ultimo.autore !== 'utente' && ultimo.autore !== 'motore' && !ultimo.passa && ultimo.testo) {
      setLeggendo(ultimo.indice);
      leggi(ultimo.testo, () => setLeggendo(undefined), { inCoda: true });
    }
  }, [messaggi, leggiSempre]);
  useEffect(() => { lettiAlta.current = -1; }, [p.id]);
  useEffect(() => () => smettiDiLeggere(), []);

  const coda = useMemo(() => inCodaChat(d, p.vista.parlante), [d, p.vista.parlante]);
  const occupato = !!d && (d.stato === 'in_corso' || coda.length > 0);
  const disabilitato = p.serverGiu ? 'Il motore non risponde: avvialo con npm start' : undefined;
  const ultimoUtente = messaggi.findLast((m) => m.autore === 'utente');
  const senzaRisposta = !!d && !occupato && !!ultimoUtente && ((d.saltaFino ?? 0) >= ultimoUtente.indice || !!d.errore)
    && (ultimoUtente.a ?? []).some((a) => !messaggi.some((m) => m.autore === a && (m.risponde ?? 0) >= ultimoUtente.indice));

  const invia = async (testo: string, voce: boolean): Promise<boolean> => {
    setErrore(undefined);
    const a = chi === 'entrambi' ? undefined : [chi as Agente];
    setInInvio({ testo, voce, a, prima: messaggi.filter((m) => m.autore === 'utente').length });
    inFondo.current = true;
    try {
      if (!p.id) {
        const r = await api.creaChat({ testo, voce, chi });
        p.onApri(r.id);
      } else {
        await api.scrivi(p.id, testo, { a: chi, voce });
      }
      return true;
    } catch (e) {
      setInInvio(undefined);
      setErrore((e as Error).message);
      return false;
    }
  };
  const azione = (f: () => Promise<unknown>, ok?: string) => {
    setMenu(false);
    setErrore(undefined);
    f().then(() => { if (ok) { setFatto(ok); setTimeout(() => setFatto(undefined), 4000); } }, (e: Error) => setErrore(e.message));
  };
  const leggiQuesto = (m: MessaggioChat) => {
    if (leggendo === m.indice) { smettiDiLeggere(); setLeggendo(undefined); return; }
    setLeggendo(m.indice);
    leggi(m.testo, () => setLeggendo(undefined));
  };

  const campo = usaCampo(modo, voceSulPc, invia);
  const allegati = usaAllegati(p.id);
  // Senza chat ancora aperta, il primo file la crea: gli allegati appartengono sempre a una chat.
  const allega = disabilitato ? undefined : (f: File[]) => void (async () => {
    let id = p.id;
    if (!id) {
      try {
        id = (await api.creaChat({ chi })).id;
        p.onApri(id);
      } catch (e) {
        setErrore((e as Error).message);
        return;
      }
    }
    await allegati.aggiungi(f, id);
  })();
  const lavori = useMemo(() => lavoriDellaChat(p.partite), [p.partite]);
  const vuota = !messaggi.length && !inInvio;
  const ultimaRisposta = messaggi.findLast((m) => m.autore !== 'utente' && !m.passa);
  const scheda = (m: MessaggioChat) => (m.proposta && d
    ? <CartaLavoro chat={d.id} m={m} messaggi={messaggi} partite={p.partite} disabilitato={disabilitato}
        onDettagli={(id) => setFoglio({ id, conProduzione: m.proposta!.dopo === 'produzione' })}
        onChiediModifica={(titolo) => { campo.setTesto(`Su «${titolo}»: `); setTimeout(() => campo.fuoco.current(), 30); }}
        onInCampo={segnaInCampo} />
    : undefined);
  const missioni = messaggi.filter((x) => x.proposta).map((x) => {
    const idP = partitaDellaScheda(messaggi, x.indice);
    const r = idP ? p.partite.find((y) => y.id === idP) : undefined;
    return { indice: x.indice, titolo: x.proposta!.titolo, conProduzione: x.proposta!.dopo === 'produzione', r };
  }).filter((x): x is typeof x & { r: Riassunto } => !!x.r);
  // Con l'ufficio 3D grande, a destra sopra l'ufficio: quelle al lavoro e l'ultima finita, al massimo tre.
  const plancia = [...missioni.filter((x) => lavoroAttivo(x.r)), ...missioni.filter((x) => !lavoroAttivo(x.r)).slice(-1)].slice(0, 3);
  const membriInCampo = Object.values(inCampo).flat();
  // La plancia del computer: tutti i lavori di questa chat (prima quelli al lavoro, poi i più nuovi) e
  // gli ultimi delle altre chat che stanno lavorando o hanno prodotto qualcosa.
  const recente = (a: { r: Riassunto }, b: { r: Riassunto }) => Number(lavoroAttivo(b.r)) - Number(lavoroAttivo(a.r)) || b.r.aggiornato.localeCompare(a.r.aggiornato);
  // Anche le partite avviate con "Trasforma in compito" sono di questa chat, pur senza una scheda.
  const senzaScheda = p.partite.filter((r) => !!d && r.daChat === d.id && !missioni.some((x) => x.r.id === r.id));
  const inPlancia: LavoroInPlancia[] = [
    ...missioni.map((x) => ({ r: x.r, titolo: x.titolo, conProduzione: x.conProduzione })),
    ...senzaScheda.map((r) => ({ r, titolo: r.domanda, conProduzione: !!r.produzione })),
  ].sort(recente);
  const altriInPlancia: LavoroInPlancia[] = p.partite
    .filter((r) => !inPlancia.some((x) => x.r.id === r.id) && (!!r.produzione || lavoroAttivo(r)))
    .map((r) => ({ r, titolo: r.domanda, conProduzione: !!r.produzione }))
    .sort(recente)
    .slice(0, 8);
  // I fatti del motore su un lavoro di questa chat (avviata, conclusa, produzione) stanno già nella sua
  // carta, che si aggiorna: in chat non si ripetono. Gli errori sì: la carta non dice il motivo.
  const nellaCarta = (m: MessaggioChat) => m.autore === 'motore' && m.evento?.proposta !== undefined && m.evento.tipo !== 'errore' && messaggi.some((x) => x.indice === m.evento!.proposta && x.proposta);

  // Sul telefono con l'ufficio aperto: un foglio in basso con lo stato e il campo.
  if (p.compatta) {
    return (
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 rounded-t-2xl border-t border-bordo bg-white/95 p-2.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(10,12,16,0.12)] backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><SquadraInCampo vista={p.vista} coda={coda} inCampo={membriInCampo} aperto={diario} onApri={() => setDiario(!diario)} /></div>
          <button className="tasto tasto-icona !min-h-9" onClick={p.onChat} aria-label="Torna alla chat"><MessageSquare size={18} /></button>
        </div>
        {diario && <Diario voci={p.vista.diario} onScheda={p.onScheda} />}
        {p.vista.parlante && p.vista.ruolo === 'chat' ? (
          <div className="max-h-28 overflow-hidden text-[13.5px] text-grafite [mask-image:linear-gradient(#000_60%,transparent)]">{p.vista.testoParziale || '…'}</div>
        ) : ultimaRisposta ? (
          <button className="line-clamp-3 text-left text-[13.5px] text-grafite" onClick={p.onChat}><b className="text-inchiostro">{nomeAutore(ultimaRisposta.autore)}:</b> {ultimaRisposta.autore === 'motore' ? primaFrase(ultimaRisposta.testo) : ultimaRisposta.testo || ultimaRisposta.proposta?.titolo}</button>
        ) : null}
        <Composer campo={campo} compatto disabilitato={disabilitato} occupato={occupato} modoVoce={modo} chi={chi} setChi={setChi} />
      </div>
    );
  }

  return (
    <section className="pointer-events-auto relative flex h-full w-full flex-col overflow-hidden bg-[#f7f8f9] md:rounded-2xl md:border md:border-bordo md:shadow-[0_12px_32px_rgba(10,12,16,0.14)]" aria-label="Chat con Claude e Codex">
      <header className="flex items-center gap-1 bg-white px-1.5 pb-1 pt-[max(0.4rem,env(safe-area-inset-top))]">
        <button className="tasto tasto-icona !min-h-9 !border-transparent !shadow-none" onClick={() => setElenco(true)} aria-label="Le tue chat"><Menu size={20} /></button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-titolo text-[15px] font-bold leading-tight">{d?.config.domanda ?? 'Nuova chat'}</h1>
          {d?.config.memoria === false && <p className="truncate text-[11.5px] text-grafite">Note spente</p>}
        </div>
        <div className="relative">
          <button className="tasto tasto-icona !min-h-9" onClick={() => setMenu(!menu)} aria-label="Altro" aria-expanded={menu} aria-haspopup="menu"><Ellipsis size={18} /></button>
          {menu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
              <div className="pannello absolute right-0 top-12 z-30 w-64 p-1.5" role="menu">
                <Voce icona={<Plus size={16} />} onClick={() => { setMenu(false); p.onNuova(); }}>Nuova chat</Voce>
                {p.onUfficio && <div className="md:hidden"><Voce icona={<Box size={16} />} onClick={() => { setMenu(false); p.onUfficio!(); }}>Guarda l'ufficio 3D</Voce></div>}
                <Voce icona={<ListChecks size={16} />} onClick={() => { setMenu(false); setCompito(true); }} disabled={!d || !messaggi.length || !!disabilitato}>Trasforma in compito</Voce>
                <Voce icona={<NotebookPen size={16} />} onClick={() => azione(async () => { const r = await api.salvaNota(d!.id); setFatto(`Salvata come nota: ${r.nota}`); })} disabled={!d || !messaggi.length || !!disabilitato}>Salva come nota</Voce>
                <Voce icona={<Timer size={16} />} onClick={() => { setMenu(false); setDettagli(dettagli === 'si' ? 'no' : 'si'); }}>{dettagli === 'si' ? 'Nascondi tempi e token' : 'Mostra tempi e token'}</Voce>
                {puoLeggere() && <Voce icona={leggiSempre === 'si' ? <VolumeX size={16} /> : <Volume2 size={16} />} onClick={() => { setMenu(false); setLeggiSempre(leggiSempre === 'si' ? 'no' : 'si'); if (leggiSempre === 'si') smettiDiLeggere(); }}>{leggiSempre === 'si' ? 'Non leggere più le risposte' : 'Leggi le risposte ad alta voce'}</Voce>}
                {puoDettare() && <Voce icona={<Mic size={16} />} onClick={() => { setMenu(false); setModoVoce(modoVoce === 'pc' ? 'browser' : 'pc'); }}>{modoVoce === 'pc' ? 'Voce: dettatura del browser (passa dal servizio del browser)' : 'Voce: trascrivi sul PC (resta sul PC, più precisa)'}</Voce>}
                <Voce icona={<ListChecks size={16} />} onClick={() => { setMenu(false); p.onPartite(); }}>Partite e produzione</Voce>
                {p.onRapporti && <Voce icona={<Bug size={16} />} onClick={() => { setMenu(false); p.onRapporti!(); }}>Rapporti d'errore</Voce>}
                {p.onCartelle && <Voce icona={<FolderLock size={16} />} onClick={() => { setMenu(false); p.onCartelle!(); }}>Cartelle autorizzate</Voce>}
              </div>
            </>
          )}
        </div>
      </header>

      <div className="border-b border-bordo bg-white px-2 pb-2 pt-0.5">
        <SquadraInCampo vista={p.vista} coda={coda} inCampo={membriInCampo} aperto={diario} onApri={() => setDiario(!diario)} />
        {diario && (
          <>
            <Diario voci={p.vista.diario} onScheda={p.onScheda} />
            {lavori.length > 0 && <Lavori voci={lavori} onApri={p.onPartita} />}
          </>
        )}
      </div>

      <div
        ref={scorri}
        className="scorri flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3"
        onScroll={(e) => { const el = e.currentTarget; inFondo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}
      >
        {vuota ? (
          <div className="m-auto flex max-w-sm flex-col items-center gap-3 px-2 text-center">
            <Ambud umore="saluta" dimensione={112} className="-mb-1" />
            <h2 className="font-titolo text-[22px] font-bold leading-tight">Claude e Codex sono in ufficio.</h2>
            <p className="text-[14px] text-grafite">Scrivi o registra un vocale: rispondono tutti e due, uno dopo l'altro{haNote ? ', e guardano nelle tue note quando serve' : ''}. Se una cosa va fatta, la trasformi in compito.</p>
            {p.accessi && (!p.accessi.claude.ok || !p.accessi.codex.ok) && <PrimoAvvio accessi={p.accessi} />}
            {p.info?.impostazioni && !p.info.impostazioni.profilo && (
              <p className="text-[12.5px] text-grafite">Facoltativo: scrivi chi sei e come lavori in <code>profilo.md</code>, nella cartella del programma (c'è un modello in <code>profilo.esempio.md</code>). Gli agenti lo leggono, in sola lettura.</p>
            )}
            {!disabilitato && (
              <div className="mt-1 flex w-full flex-col gap-1.5">
                {(haNote ? [...SPUNTI_CON_NOTE, SPUNTI[0]!] : SPUNTI).map((s) => (
                  <button key={s} className="rounded-xl border border-bordo bg-white px-3 py-2.5 text-left text-[14px] hover:border-[#141518]" onClick={() => void invia(s, false)}>{s}</button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {messaggi.map((m) => (m.autore === 'utente'
              ? <BollaUtente key={m.indice} m={m} />
              : m.autore === 'motore'
                ? (nellaCarta(m) ? null : <BollaMotore key={m.indice} m={m} onApri={p.onPartita} />)
                : <BollaAgente key={m.indice} m={m} leggendo={leggendo === m.indice} onLeggi={() => leggiQuesto(m)} scheda={scheda(m)} dettagli={dettagli === 'si'} />))}
            {inInvio && <BollaUtente m={{ ...inInvio, ora: new Date().toISOString() }} inInvio />}
            {p.vista.parlante && p.vista.ruolo === 'chat' && <BollaDalVivo vista={p.vista} />}
            {coda.length > 0 && !p.vista.parlante && <div className="flex items-center gap-2 text-[12px] text-grafite"><Ambud umore="pensa" testa dimensione={26} /><Puntini /> {coda.map((a) => NOME[a]).join(' e ')} {coda.length > 1 ? 'stanno' : 'sta'} per rispondere</div>}
          </>
        )}
        {d?.errore && !occupato && (
          <div className="flex items-start gap-3 rounded-xl border border-[#141518] bg-white p-3 text-[13px]" role="alert">
            <Ambud umore="scusa" testa dimensione={44} />
            <div className="min-w-0">
              <div className="etichetta !text-[#9b2626]">Risposta non arrivata</div>
              <p className="mt-1 break-words">{d.errore.messaggio}</p>
            </div>
          </div>
        )}
        {senzaRisposta && !disabilitato && (
          <button className="tasto self-start" onClick={() => azione(() => api.riprendi(d!.id))}><RotateCcw size={15} /> Fai rispondere</button>
        )}
      </div>

      <div className="border-t border-bordo bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {(errore || p.errore || fatto) && (
          <div className={`mb-1.5 flex items-start gap-2 rounded-xl border px-3 py-2 text-[13px] ${fatto && !errore ? 'border-[#9ad400] bg-[#f4ffd6]' : 'border-[#141518] bg-white'}`} role={errore ? 'alert' : 'status'}>
            <Ambud umore={errore || p.errore ? 'scusa' : 'contento'} testa dimensione={26} className="-my-0.5" />
            <span className="flex-1 break-words">{errore ?? p.errore ?? fatto}</span>
            <button className="text-grafite" onClick={() => { setErrore(undefined); setFatto(undefined); p.onChiudiErrore?.(); }} aria-label="Chiudi"><X size={16} /></button>
          </div>
        )}
        <Composer
          campo={campo} disabilitato={disabilitato} occupato={occupato} modoVoce={modo} chi={chi} setChi={setChi} onStop={d ? () => azione(() => api.pausa(d.id)) : undefined}
          allegati={<BarraAllegati chat={p.id} s={allegati} />} onFile={allega}
        />
      </div>

      {foglio && (
        <FoglioLavoro
          id={foglio.id}
          r={p.partite.find((x) => x.id === foglio.id)}
          conProduzione={foglio.conProduzione}
          onChiudi={() => setFoglio(null)}
          onUfficio={() => { const id = foglio.id; setFoglio(null); p.onPartita(id); }}
        />
      )}
      {p.ufficio && !p.ufficio.grande && (
        <Plancia questa={inPlancia} altri={altriInPlancia} ufficio={p.ufficio} onApri={(x) => setFoglio({ id: x.r.id, conProduzione: x.conProduzione })}>
          <Diario voci={p.vista.diario} onScheda={p.onScheda} />
        </Plancia>
      )}
      {p.ufficio?.grande && !foglio && <UfficioGrande u={p.ufficio} />}
      {/* Con l'ufficio grande, a destra sopra l'ufficio: le missioni di questa chat, sempre a vista. */}
      {p.ufficio?.grande && !foglio && plancia.length > 0 && (
        <div className="pointer-events-auto fixed bottom-3 right-3 z-20 flex w-[380px] flex-col gap-2" aria-label="Lavori di questa chat">
          {plancia.map((x) => <MissioneBreve key={x.indice} titolo={x.titolo} r={x.r} conProduzione={x.conProduzione} onApri={() => setFoglio({ id: x.r.id, conProduzione: x.conProduzione })} />)}
        </div>
      )}
      {elenco && <ElencoChat chats={p.chats} id={p.id} onApri={(id) => { setElenco(false); p.onApri(id); }} onNuova={() => { setElenco(false); p.onNuova(); }} onPartite={() => { setElenco(false); p.onPartite(); }} onChiudi={() => setElenco(false)} />}
      {compito && d && <FinestraCompito d={d} onChiudi={() => setCompito(false)} onAvviata={() => { setCompito(false); setFatto('Partita avviata: la trovi qui in chat, con il suo stato.'); }} />}
    </section>
  );
}

