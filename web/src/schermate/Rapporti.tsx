// I rapporti d'errore: la scheda che chiede il permesso di mandarne uno, con quello che contiene, e
// il pannello con la scelta (chiedi ogni volta, manda sempre, non mandare mai). Il rapporto lo
// prepara e lo ripulisce il motore: qui si mostra così com'è, senza aggiungere niente.
import { Bug, ChevronDown, X } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { api, type Info, type Rapporto, type Scelta, type VistaRapporti } from '../api.ts';
import { Ambud } from '../hud/Ambud.tsx';
import { usaFinestra } from '../hud/comuni.tsx';

export const INFORMATIVA = 'https://github.com/jessiesarci/ambo/blob/main/docs/RAPPORTI-ERRORE.md';

const DOVE: Record<Rapporto['dove'], string> = {
  chat: 'chat', riunione: 'riunione', produzione: 'produzione', server: 'server del programma', dashboard: 'pagina del programma',
};

function Contenuto({ r }: { r: Rapporto }) {
  const righe: [string, string][] = [
    ['Versione', r.versione],
    ['Sistema', `${r.sistema} · Node ${r.node}`],
    ['Dove', DOVE[r.dove] ?? r.dove],
    ['Tipo', r.tipo],
    ['Messaggio', r.messaggio || '(vuoto)'],
    ['Impronta', r.impronta],
  ];
  return (
    <div className="mt-2 rounded-lg border border-bordo bg-[#f7f8f9] p-2.5 font-dati text-[11.5px] leading-snug">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        {righe.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="text-grafite">{k}</dt>
            <dd className="break-words">{v}</dd>
          </Fragment>
        ))}
        <dt className="text-grafite">Codice</dt>
        <dd>{r.stack.length ? <ul className="grid gap-0.5">{r.stack.map((x, i) => <li key={i} className="break-all">{x}</li>)}</ul> : '(nessun punto del programma)'}</dd>
      </dl>
    </div>
  );
}

// Compare quando c'è un rapporto in attesa e l'utente vuole che si chieda ogni volta.
export function SchedaRapporto({ info, onCambia }: { info?: Info; onCambia: () => void }) {
  const n = info?.rapporti?.attivi && info.rapporti.scelta === 'chiedi' ? info.rapporti.inAttesa : 0;
  const [vista, setVista] = useState<VistaRapporti>();
  const [aperto, setAperto] = useState(false);
  const [nascosta, setNascosta] = useState(false);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string>();
  useEffect(() => {
    if (!n) return;
    let vivo = true;
    api.rapporti().then((v) => { if (vivo) setVista(v); }, () => undefined);
    return () => { vivo = false; };
  }, [n]);
  const r = vista?.inAttesa[0];
  if (!n || !r || nascosta) return null;
  const esegui = (f: () => Promise<VistaRapporti & { esito?: string }>) => {
    setInvio(true);
    setErrore(undefined);
    f().then((v) => { setVista(v); setAperto(false); onCambia(); }, (e: Error) => setErrore(e.message)).finally(() => setInvio(false));
  };
  return (
    <section className="pannello pointer-events-auto fixed bottom-24 left-3 z-30 w-[min(420px,calc(100vw-24px))] p-3" role="alertdialog" aria-label="Rapporto d'errore" aria-describedby="rapporto-testo">
      <div className="flex items-start gap-2.5">
        <span className="shrink-0"><Ambud umore="scusa" testa dimensione={36} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-titolo text-[15px] font-bold leading-tight">Si è rotto qualcosa{vista.inAttesa.length > 1 ? ` · 1 di ${vista.inAttesa.length}` : ''}</h2>
          <p id="rapporto-testo" className="mt-1 text-[13px] leading-snug text-[#33363b]">Vuoi mandare il rapporto dell'errore a chi sviluppa Ambo? Serve a correggerlo. Ci sono solo dati tecnici: niente chat, file, note o percorsi.</p>
        </div>
        <button className="tasto tasto-icona !min-h-8 !w-8 shrink-0 !p-0" onClick={() => setNascosta(true)} aria-label="Decidi più tardi"><X size={15} /></button>
      </div>
      <button className="mt-2 flex items-center gap-1 text-[12.5px] font-semibold underline decoration-[#b5f900] decoration-2" onClick={() => setAperto(!aperto)} aria-expanded={aperto}>
        Cosa contiene <ChevronDown size={14} className={aperto ? 'rotate-180' : ''} aria-hidden />
      </button>
      {aperto && <Contenuto r={r} />}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button className="tasto tasto-primario !min-h-9 !px-3" disabled={invio} onClick={() => esegui(() => api.mandaRapporto(r.id))}>Manda</button>
        <button className="tasto !min-h-9 !px-3" disabled={invio} onClick={() => esegui(() => api.mandaRapporto(r.id, true))}>Manda sempre</button>
        <button className="tasto !min-h-9 !px-3" disabled={invio} onClick={() => esegui(() => api.scartaRapporto(r.id))}>Non mandare</button>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 text-[12px] text-grafite">
        <button className="underline" disabled={invio} onClick={() => esegui(() => api.sceltaRapporti('mai'))}>Non chiedere più</button>
        <a className="underline" href={INFORMATIVA} target="_blank" rel="noreferrer">Cosa succede ai rapporti</a>
      </p>
      {errore && <p className="mt-1 text-[12.5px] text-[#9b2626]" role="alert">{errore}</p>}
    </section>
  );
}

const SCELTE: { scelta: Scelta; titolo: string; testo: string }[] = [
  { scelta: 'chiedi', titolo: 'Chiedi ogni volta', testo: 'Ti mostro il rapporto e decidi tu. È la scelta di serie.' },
  { scelta: 'sempre', titolo: 'Manda sempre', testo: 'Partono da soli, al massimo 20 al giorno e lo stesso errore una volta all\'ora.' },
  { scelta: 'mai', titolo: 'Non mandare mai', testo: 'Gli errori restano solo sul tuo PC.' },
];

export function PannelloRapporti({ onChiudi }: { onChiudi: () => void }) {
  const pannello = usaFinestra(onChiudi);
  const [vista, setVista] = useState<VistaRapporti>();
  const [errore, setErrore] = useState<string>();
  useEffect(() => { api.rapporti().then(setVista, (e: Error) => setErrore(e.message)); }, []);
  const scegli = (s: Scelta) => {
    setErrore(undefined);
    api.sceltaRapporti(s).then(setVista, (e: Error) => setErrore(e.message));
  };
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-[#0b0c0e]/35 p-3" onClick={onChiudi}>
      <div ref={pannello} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Rapporti d'errore" className="pannello scorri flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto p-5 outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Bug size={20} />
          <h2 className="font-titolo text-[18px] font-bold">Rapporti d'errore</h2>
          <button className="tasto tasto-icona ml-auto" onClick={onChiudi} aria-label="Chiudi"><X size={16} /></button>
        </div>
        <p className="text-[13px] leading-snug text-grafite">
          Quando nel programma si rompe qualcosa puoi mandare un rapporto a chi sviluppa Ambo. Contiene la versione, il sistema, dove e che tipo di errore, la prima riga del messaggio ripulita e i punti del codice. Mai chat, file, note, nomi di cartelle o percorsi.
        </p>
        {vista && !vista.attivi ? (
          <p className="rounded-lg bg-[#f7f8f9] px-3 py-2 text-[13px]">I rapporti sono spenti su questo PC (<code>AMBO_RAPPORTI_URL=0</code> o un indirizzo non valido).</p>
        ) : (
          <fieldset className="grid gap-1.5" disabled={!vista}>
            <legend className="etichetta mb-1">Cosa faccio quando c'è un errore</legend>
            {SCELTE.map((x) => (
              <label key={x.scelta} className={`flex cursor-pointer gap-2.5 rounded-xl border px-3 py-2 ${vista?.scelta === x.scelta ? 'border-[#141518] bg-[#f4fbe0]' : 'border-bordo bg-white'}`}>
                <input type="radio" name="rapporti" className="mt-1 accent-[#141518]" checked={vista?.scelta === x.scelta} onChange={() => scegli(x.scelta)} />
                <span>
                  <b className="block font-titolo text-[14px]">{x.titolo}</b>
                  <span className="block text-[12.5px] text-grafite">{x.testo}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {!!vista?.inAttesa.length && vista.scelta === 'chiedi' && <p className="text-[12.5px] text-grafite">{vista.inAttesa.length === 1 ? 'Un rapporto aspetta' : `${vista.inAttesa.length} rapporti aspettano`} la tua risposta: lo trovi nella scheda in basso a sinistra.</p>}
        <a className="text-[13px] font-semibold underline decoration-[#b5f900] decoration-2" href={INFORMATIVA} target="_blank" rel="noreferrer">Cosa succede ai rapporti, chi li riceve e per quanto</a>
        {errore && <p className="text-[12.5px] text-[#9b2626]" role="alert">{errore}</p>}
      </div>
    </div>
  );
}
