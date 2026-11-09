// Schermata iniziale sopra l'ufficio: nuova partita a sinistra, archivio a destra.
// Sul telefono le due parti sono schede.
import { Archive, CheckCircle2, CircleAlert, FolderLock, MessageSquare, Play, Swords } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Agente, ConfigInput } from '../../../motore/tipi.ts';
import { api, type Accessi, type Info, type Riassunto } from '../api.ts';
import { BottoneMarkdown } from '../hud/comuni.tsx';
import { ETICHETTE_ESITO } from '../stato.ts';
import { suona } from '../suoni.ts';

const ESITO_STILE: Record<string, string> = {
  accordo: 'bg-[#effcc9] text-[#3f5600]',
  limite_round: 'bg-[#eceef1] text-[#3d4249]',
  stallo: 'bg-[#f1f2f4] text-[#9b2626]',
  chiuso_da_utente: 'bg-[#eceef1] text-[#4a5058]',
};

export function Lobby({ info, accessi, archivio, serverGiu, onApri, onRivedi, onCartelle, onChat }: {
  info?: Info;
  accessi?: Accessi;
  archivio: Riassunto[] | null;
  serverGiu: boolean;
  onApri: (id: string) => void;
  onRivedi: (id: string) => void;
  onCartelle?: () => void;
  onChat?: () => void;
}) {
  const [scheda, setScheda] = useState<'nuova' | 'archivio'>('nuova');
  return (
    <div className="pointer-events-none flex h-full flex-col gap-2">
      <div className="pannello pointer-events-auto flex flex-wrap items-center gap-3 self-start px-4 py-2.5">
        {onChat && <button className="tasto" onClick={onChat}><MessageSquare size={16} /> Chat</button>}
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-inchiostro text-giallo"><Swords size={20} /></span>
        <div>
          <h1 className="font-titolo text-[20px] font-bold leading-none">Partite e produzione</h1>
          <p className="mt-1 text-[12.5px] text-grafite">Un obiettivo, Claude e Codex che preparano il piano, poi il lavoro fatto.</p>
        </div>
      </div>

      <div className="pointer-events-auto flex gap-1 self-start md:hidden" role="tablist">
        {(['nuova', 'archivio'] as const).map((s) => (
          <button key={s} role="tab" aria-selected={scheda === s} className={`tasto ${scheda === s ? 'tasto-primario' : ''}`} onClick={() => setScheda(s)}>
            {s === 'nuova' ? 'Nuova partita' : `Archivio${archivio ? ` (${archivio.length})` : ''}`}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 items-end gap-3 md:items-stretch md:justify-between">
        <div className={`${scheda === 'nuova' ? 'flex' : 'hidden'} min-h-0 w-full md:flex md:w-[420px]`}>
          <NuovaPartita info={info} accessi={accessi} archivio={archivio} serverGiu={serverGiu} onCreata={onApri} onCartelle={onCartelle} />
        </div>
        <div className={`${scheda === 'archivio' ? 'flex' : 'hidden'} min-h-0 w-full md:flex md:w-[360px]`}>
          <Archivio archivio={archivio} serverGiu={serverGiu} onApri={onApri} onRivedi={onRivedi} />
        </div>
      </div>
    </div>
  );
}

function Scelta<T extends string>({ valore, opzioni, onCambia, etichette, nome }: { valore: T; opzioni: readonly T[]; onCambia: (v: T) => void; etichette?: Record<string, string>; nome: string }) {
  return (
    <div className="inline-flex rounded-xl border border-bordo bg-[#ffffff] p-0.5" role="radiogroup" aria-label={nome}>
      {opzioni.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={valore === o} className={`rounded-[10px] px-3 py-1.5 font-titolo text-[13px] font-semibold ${valore === o ? 'bg-inchiostro text-white' : 'text-grafite hover:bg-cartaScura'}`} onClick={() => onCambia(o)}>
          {etichette?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

const AGENTI_ETICHETTE = { claude: 'Claude', codex: 'Codex' };

function NuovaPartita({ info, accessi, archivio, serverGiu, onCreata, onCartelle }: { info?: Info; accessi?: Accessi; archivio: Riassunto[] | null; serverGiu: boolean; onCreata: (id: string) => void; onCartelle?: () => void }) {
  const [domanda, setDomanda] = useState('');
  const [round, setRound] = useState(3);
  const [claude, setClaude] = useState('');
  const [claudeRag, setClaudeRag] = useState('');
  const [codex, setCodex] = useState('');
  const [codexRag, setCodexRag] = useState('medium');
  const [apre, setApre] = useState<Agente>('claude');
  const [relatore, setRelatore] = useState<Agente>('claude');
  const [web, setWeb] = useState(false);
  const [memoria, setMemoria] = useState(true);
  const [modo, setModo] = useState<'insieme' | 'confronto'>('insieme');
  const [cartella, setCartella] = useState('');
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string>();

  useEffect(() => {
    if (!info) return;
    setClaude((v) => v || info.claude.predefinito);
    setCodex((v) => v || info.codex.predefinito || info.codex.modelli[0] || '');
  }, [info]);

  const occupato = !!info?.attivi.length || !!archivio?.some((r) => r.inCorso || r.occupato);
  const inProduzione = !!archivio?.some((r) => r.occupato && (r.produzione === 'in_lavorazione' || r.produzione === 'collaudo'));
  const bloccato = !!accessi && (!accessi.claude.ok || !accessi.codex.ok);

  const avvia = async () => {
    setInvio(true);
    setErrore(undefined);
    suona('clic');
    try {
      const config: ConfigInput = {
        domanda,
        maxRound: round,
        apre,
        relatore,
        claude: { modello: claude || undefined, ragionamento: claudeRag || undefined },
        codex: { modello: codex || undefined, ragionamento: codexRag },
        ricercaWeb: web,
        memoria,
        modo,
        ...(cartella ? { cartella } : {}),
      };
      const { id } = await api.crea(config);
      onCreata(id);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setInvio(false);
    }
  };

  return (
    <form className="pannello pointer-events-auto scorri flex max-h-[70vh] w-full flex-col gap-3 overflow-y-auto p-4 md:max-h-none" onSubmit={(e) => { e.preventDefault(); void avvia(); }}>
      <h2 className="font-titolo text-[18px] font-bold">Nuova partita</h2>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="etichetta">Come lavorano</span>
        <Scelta nome="Come lavorano" valore={modo} opzioni={['insieme', 'confronto'] as const} onCambia={setModo} etichette={{ insieme: 'Insieme', confronto: 'Confronto' }} />
      </div>
      <p className="-mt-2 text-[12px] text-grafite">{modo === 'insieme' ? 'Lavorano insieme verso il tuo obiettivo: uno propone, l\'altro migliora e completa. Si discute, ma senza battibecchi per forza.' : 'Confronto critico: ognuno valuta e contesta le proposte dell\'altro. Utile per scegliere tra due strade.'}</p>
      <label className="flex flex-col gap-1">
        <span className="etichetta">{modo === 'insieme' ? 'L\'obiettivo' : 'La domanda'}</span>
        <textarea className="campo min-h-28 resize-y" value={domanda} onChange={(e) => setDomanda(e.target.value)} maxLength={20000} required placeholder={modo === 'insieme' ? 'Es. Preparare il piano per aggiungere la prenotazione dei corsi al sito di una palestra, con tempi e costi.' : 'Es. Per un sito di 20 pagine aggiornato di rado, meglio un generatore statico o un CMS? Budget limitato.'} />
      </label>

      <div className="flex items-center justify-between gap-3">
        <span className="etichetta">Round massimi</span>
        <div className="flex items-center gap-1">
          <button type="button" className="tasto tasto-icona" onClick={() => setRound((r) => Math.max(1, r - 1))} aria-label="Un round in meno">−</button>
          <span className="w-8 text-center font-dati text-[16px] font-semibold" aria-live="polite">{round}</span>
          <button type="button" className="tasto tasto-icona" onClick={() => setRound((r) => Math.min(info?.maxRound ?? 10, r + 1))} aria-label="Un round in più">+</button>
        </div>
      </div>

      <fieldset className="grid grid-cols-1 gap-2 rounded-xl border border-bordo p-2.5 sm:grid-cols-2">
        <legend className="etichetta px-1">Claude</legend>
        <select className="campo !py-2 text-[13px]" value={claude} onChange={(e) => setClaude(e.target.value)} aria-label="Modello di Claude">
          {(info?.claude.modelli ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="campo !py-2 text-[13px]" value={claudeRag} onChange={(e) => setClaudeRag(e.target.value)} aria-label="Ragionamento di Claude">
          <option value="">ragionamento predefinito</option>
          {(info?.claude.ragionamento ?? []).map((m) => <option key={m} value={m}>ragionamento {m}</option>)}
        </select>
      </fieldset>
      <fieldset className="grid grid-cols-1 gap-2 rounded-xl border border-bordo p-2.5 sm:grid-cols-2">
        <legend className="etichetta px-1">Codex</legend>
        <select className="campo !py-2 text-[13px]" value={codex} onChange={(e) => setCodex(e.target.value)} aria-label="Modello di Codex">
          {(info?.codex.modelli ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="campo !py-2 text-[13px]" value={codexRag} onChange={(e) => setCodexRag(e.target.value)} aria-label="Ragionamento di Codex">
          {(info?.codex.ragionamento ?? []).map((m) => <option key={m} value={m}>ragionamento {m}</option>)}
        </select>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="etichetta">Apre</span>
        <Scelta nome="Chi apre" valore={apre} opzioni={['claude', 'codex'] as const} onCambia={setApre} etichette={AGENTI_ETICHETTE} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="etichetta">Scrive la sintesi</span>
        <Scelta nome="Chi scrive la sintesi" valore={relatore} opzioni={['claude', 'codex'] as const} onCambia={setRelatore} etichette={AGENTI_ETICHETTE} />
      </div>
      <label className="flex items-center justify-between gap-2">
        <span>
          <span className="etichetta">Le mie note</span>
          <span className="block text-[12px] text-grafite">Profilo, cartella di note e decisioni salvate, in sola lettura</span>
        </span>
        <input type="checkbox" className="h-5 w-5 accent-[#b5f900]" checked={memoria} onChange={(e) => setMemoria(e.target.checked)} />
      </label>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="etichetta">Cartella da leggere</span>
          {onCartelle && <button type="button" className="text-[12.5px] font-semibold underline" onClick={onCartelle}><FolderLock size={13} className="mr-1 inline" />Gestisci</button>}
        </div>
        <select className="campo !py-2 text-[13px]" value={cartella} onChange={(e) => setCartella(e.target.value)} aria-label="Cartella da dare in lettura">
          <option value="">Nessuna</option>
          {(info?.cartelle ?? []).map((c) => <option key={c.nome} value={c.nome}>{c.nome} ({c.file} file)</option>)}
        </select>
      </div>
      <label className="flex items-center justify-between gap-2">
        <span className="etichetta">Ricerca web</span>
        <input type="checkbox" className="h-5 w-5 accent-[#b5f900]" checked={web} onChange={(e) => setWeb(e.target.checked)} />
      </label>

      <div className="rounded-xl bg-cartaScura px-3 py-2 text-[12.5px]">
        {!accessi ? (
          <span className="text-grafite">{serverGiu ? 'Il server del motore non risponde: non posso controllare gli abbonamenti.' : 'Controllo gli abbonamenti…'}</span>
        ) : (
          (['claude', 'codex'] as const).map((a) => (
            <div key={a} className="flex items-center gap-1.5">
              {accessi[a].ok ? <CheckCircle2 size={14} className="text-accordo" /> : <CircleAlert size={14} className="text-[#9b2626]" />}
              <span className="font-semibold">{AGENTI_ETICHETTE[a]}:</span> {accessi[a].dettaglio}
            </div>
          ))
        )}
        <div className="mt-1 text-grafite">Gira con i tuoi abbonamenti tramite le CLI ufficiali: niente API a consumo.</div>
      </div>

      {occupato && <p className="text-[13px] text-[#3d4249]">{inProduzione ? 'Il magazzino sta lavorando a una produzione: aspetta che finisca.' : "C'è già una partita in corso: aprila dall'archivio o aspetta che finisca."}</p>}
      {errore && <p className="text-[13px] text-[#9b2626]" role="alert">{errore}</p>}
      <button type="submit" className="tasto tasto-primario !min-h-12 text-[16px]" disabled={!domanda.trim() || invio || occupato || bloccato || serverGiu}>
        <Play size={18} /> {invio ? 'Preparo la sala…' : 'Inizia la partita'}
      </button>
    </form>
  );
}

function Archivio({ archivio, serverGiu, onApri, onRivedi }: { archivio: Riassunto[] | null; serverGiu: boolean; onApri: (id: string) => void; onRivedi: (id: string) => void }) {
  return (
    <section className="pannello pointer-events-auto flex max-h-[70vh] w-full flex-col overflow-hidden md:max-h-none" aria-label="Archivio delle partite">
      <div className="flex items-center gap-2 border-b border-bordo px-4 py-3">
        <Archive size={18} />
        <h2 className="font-titolo text-[18px] font-bold">Archivio</h2>
        <span className="ml-auto text-[12px] text-grafite">anche negli scaffali del magazzino</span>
      </div>
      <ul className="scorri flex-1 space-y-2 overflow-y-auto p-2">
        {!archivio && <li className="p-3 text-[13px] text-grafite">{serverGiu ? 'Archivio non disponibile: il server del motore non risponde.' : 'Carico l\x27archivio…'}</li>}
        {archivio && !archivio.length && <li className="p-3 text-[13px] text-grafite">Nessuna partita ancora. La prima finisce qui, e in una scatola sullo scaffale.</li>}
        {(archivio ?? []).map((r) => (
          <li key={r.id} className="rounded-xl border border-bordo bg-[#ffffff] p-2.5">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-dati text-grafite">{new Date(r.creato).toLocaleString('it-CH', { dateStyle: 'short', timeStyle: 'short' })}</span>
              {r.inCorso && <span className="rounded-full bg-[#141518] px-2 py-0.5 font-titolo font-bold uppercase text-white">in corso</span>}
              {r.esito ? (
                <span className={`rounded-full px-2 py-0.5 font-titolo font-bold uppercase ${ESITO_STILE[r.esito]}`}>{ETICHETTE_ESITO[r.esito]}</span>
              ) : !r.inCorso && <span className="rounded-full bg-[#eceef1] px-2 py-0.5 font-titolo font-bold uppercase text-[#4a5058]">{r.stato.replace('_', ' ')}</span>}
              {r.approvata === false && <span className="font-titolo font-bold uppercase text-[#9b2626]">sintesi contestata</span>}
            </div>
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug">{r.domanda}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <button className="tasto text-[13px]" onClick={() => onApri(r.id)}>Apri</button>
              {r.stato === 'concluso' && (
                <>
                  <button className="tasto text-[13px]" onClick={() => onRivedi(r.id)}><Play size={14} /> Rivedi</button>
                  <BottoneMarkdown id={r.id} compatto />
                </>
              )}
              <span className="ml-auto font-dati text-[11px] text-grafite">{r.turni} interventi</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
