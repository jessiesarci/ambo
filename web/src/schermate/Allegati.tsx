// Gli allegati della chat: la graffetta nel campo, le schede dei file sopra il campo (miniatura, nome,
// misura, togli) e, toccandone una, la descrizione per gli agenti con quello che si sa davvero di quel
// file. Le stesse schede, in sola lettura, stanno
// nel foglio del lavoro, con le tre righe distinte (cantiere, agenti, collaudo).
import { FileText, LoaderCircle, Paperclip, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Allegato } from '../../../motore/allegati.ts';
import type { Dibattito } from '../../../motore/tipi.ts';
import { api } from '../api.ts';

// Gli stessi tipi che accetta il motore: il selettore li propone, ma decide comunque il motore dai byte.
export const ACCETTATI = 'image/png,image/jpeg,image/webp,application/pdf,.md,.txt,.csv,.json,.html,.htm,.css,.js,.mjs,.ts,.tsx,.jsx,.py,.yml,.yaml,.sql,.sh,.ps1';
const MAX_BYTE = 10 * 1024 * 1024;

const immagine = (a: Allegato) => a.tipo === 'png' || a.tipo === 'jpeg' || a.tipo === 'webp';
const misura = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const maiuscola = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
// I nomi lunghi si tagliano nel mezzo: l'estensione resta leggibile.
const taglia = (nome: string, max = 24) => (nome.length <= max ? nome : `${nome.slice(0, max - 9)}…${nome.slice(-8)}`);

interface InCaricamento { chiave: string; nome: string; frazione: number; errore?: string }

export function usaAllegati(chat: string | undefined) {
  const [elenco, setElenco] = useState<Allegato[]>([]);
  const [invio, setInvio] = useState<InCaricamento[]>([]);
  const [aperto, setAperto] = useState<string>();
  const prima = useRef(chat);
  useEffect(() => {
    // La chat appena creata dalla graffetta tiene i caricamenti in corso; un'altra chat riparte da zero.
    if (prima.current && prima.current !== chat) {
      setInvio([]);
      setAperto(undefined);
    }
    prima.current = chat;
    setElenco([]);
    if (!chat) return;
    let vivo = true;
    api.allegati(chat).then((x) => { if (vivo) setElenco(x); }, () => undefined);
    return () => { vivo = false; };
  }, [chat]);

  // Uno per volta, ognuno con il suo avanzamento: un errore su uno non ferma gli altri.
  const aggiungi = async (file: File[], idChat: string) => {
    const nuovi = file.map((f, i) => ({ f, chiave: `${Date.now()}-${i}-${f.name}` }));
    setInvio((x) => [...x, ...nuovi.map(({ f, chiave }) => ({ chiave, nome: f.name, frazione: 0 }))]);
    for (const { f, chiave } of nuovi) {
      const segna = (y: Partial<InCaricamento>) => setInvio((x) => x.map((z) => (z.chiave === chiave ? { ...z, ...y } : z)));
      if (f.size > MAX_BYTE) {
        segna({ errore: `Il file supera i ${MAX_BYTE / 1024 / 1024} MB.` });
        continue;
      }
      try {
        const a = await api.caricaAllegato(idChat, f, (frazione) => segna({ frazione }));
        setInvio((x) => x.filter((z) => z.chiave !== chiave));
        setElenco((x) => (x.some((y) => y.id === a.id) ? x : [...x, a]));
      } catch (e) {
        segna({ errore: `${maiuscola((e as Error).message).replace(/\.?$/, '.')}` });
      }
    }
  };
  const togli = async (id: string, aid: string) => {
    await api.togliAllegato(id, aid);
    setElenco((x) => x.filter((y) => y.id !== aid));
    setAperto(undefined);
  };
  const descrivi = async (id: string, aid: string, testo: string) => {
    const a = await api.descriviAllegato(id, aid, testo);
    setElenco((x) => x.map((y) => (y.id === aid ? a : y)));
  };
  const chiudiErrore = (chiave: string) => setInvio((x) => x.filter((z) => z.chiave !== chiave));
  return { elenco, invio, aperto, setAperto, aggiungi, togli, descrivi, chiudiErrore };
}
export type StatoAllegati = ReturnType<typeof usaAllegati>;

function Miniatura({ id, a, grande }: { id: string; a: Allegato; grande?: boolean }) {
  const lato = grande ? 'h-12 w-12' : 'h-9 w-9';
  if (immagine(a)) return <img src={api.urlAllegato(id, a.id)} alt="" className={`${lato} shrink-0 rounded-lg border border-bordo bg-cartaScura object-cover`} />;
  return (
    <span className={`${lato} flex shrink-0 items-center justify-center rounded-lg border border-bordo bg-cartaScura font-dati text-[9.5px] font-semibold uppercase text-grafite`}>
      {a.tipo === 'testo' ? <FileText size={16} aria-hidden /> : a.tipo}
    </span>
  );
}

// La graffetta del campo: apre il selettore dei file del browser.
export function Graffetta({ onFile, disabilitato }: { onFile: (f: File[]) => void; disabilitato?: boolean }) {
  const scelta = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        className="flex h-11 w-9 shrink-0 items-center justify-center rounded-xl text-grafite hover:bg-cartaScura hover:text-inchiostro disabled:opacity-40"
        onClick={() => scelta.current?.click()} disabled={disabilitato}
        aria-label="Allega un file" title="Allega immagini, PDF o file di testo"
      >
        <Paperclip size={19} />
      </button>
      <input
        ref={scelta} type="file" multiple accept={ACCETTATI} className="hidden"
        onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) onFile(f); }}
      />
    </>
  );
}

// Le schede sopra il campo. Toccandone una si apre la descrizione, con quello che si sa davvero.
export function BarraAllegati({ chat, s }: { chat?: string; s: StatoAllegati }) {
  if (!chat && !s.invio.length) return null;
  if (!s.elenco.length && !s.invio.length) return null;
  const aperto = s.elenco.find((a) => a.id === s.aperto);
  return (
    <div className="mb-1.5 flex flex-col gap-1.5">
      <div className="scorri flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Allegati della chat">
        {s.elenco.map((a) => (
          <div key={a.id} className={`flex shrink-0 items-center gap-2 rounded-xl border bg-white py-1 pl-1 pr-1 text-[12.5px] ${s.aperto === a.id ? 'border-[#141518]' : 'border-bordo'}`}>
            <button className="flex items-center gap-2 text-left" onClick={() => s.setAperto(s.aperto === a.id ? undefined : a.id)} aria-expanded={s.aperto === a.id} title={a.nome}>
              <Miniatura id={chat!} a={a} />
              <span className="flex flex-col leading-tight">
                <span className="font-semibold">{taglia(a.nome)}</span>
                <span className="text-[11px] text-grafite">{misura(a.byte)}{a.descrizione ? ' · descritto' : ''}</span>
              </span>
            </button>
            <button className="flex h-8 w-7 items-center justify-center rounded-lg text-grafite hover:bg-cartaScura" onClick={() => void s.togli(chat!, a.id)} aria-label={`Togli ${a.nome}`}><X size={14} /></button>
          </div>
        ))}
        {s.invio.map((x) => (
          <div key={x.chiave} className={`flex max-w-[260px] shrink-0 items-center gap-2 rounded-xl border bg-white py-1 pl-2 pr-1 text-[12.5px] ${x.errore ? 'border-[#9b2626]' : 'border-bordo'}`} role={x.errore ? 'alert' : 'status'}>
            {!x.errore && <LoaderCircle size={15} className="shrink-0 animate-spin" aria-hidden />}
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-semibold">{taglia(x.nome)}</span>
              {x.errore
                ? <span className="text-[11px] text-[#9b2626]">{x.errore}</span>
                : <span className="mt-1 block h-1 w-24 overflow-hidden rounded-full bg-cartaScura"><span className="block h-full bg-[#b5f900]" style={{ width: `${Math.round(x.frazione * 100)}%` }} /></span>}
            </span>
            {x.errore && <button className="flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-grafite hover:bg-cartaScura" onClick={() => s.chiudiErrore(x.chiave)} aria-label="Chiudi"><X size={14} /></button>}
          </div>
        ))}
      </div>
      {aperto && chat && <Descrizione key={aperto.id} chat={chat} a={aperto} s={s} />}
    </div>
  );
}

function Descrizione({ chat, a, s }: { chat: string; a: Allegato; s: StatoAllegati }) {
  const [testo, setTesto] = useState(a.descrizione ?? '');
  const [stato, setStato] = useState<'' | 'salvo' | 'salvata' | string>('');
  const salva = () => {
    setStato('salvo');
    s.descrivi(chat, a.id, testo).then(() => setStato('salvata'), (e: Error) => setStato(e.message));
  };
  return (
    <div className="rounded-xl border border-bordo bg-white p-2.5">
      <div className="flex items-start gap-2.5">
        <Miniatura id={chat} a={a} grande />
        <div className="min-w-0 flex-1 text-[11.5px] leading-snug text-grafite">
          <p className="truncate text-[13px] font-semibold text-inchiostro" title={a.nome}>{a.nome}</p>
          <p>Cantiere: lo copia la prossima partita che avvii da questa chat.</p>
          <p>Agenti: {immagine(a) || a.tipo === 'pdf' ? 'non verificato se Claude e Codex lo guardano.' : 'Claude e Codex ricevono il testo.'}</p>
          {immagine(a) && <p>Collaudo: non controlla le immagini.</p>}
          {a.metadatiTolti && <p>Tolti posizione e dati del telefono.</p>}
          {!!a.segretiTolti && <p>Tolte {a.segretiTolti === 1 ? 'una riga che sembrava' : `${a.segretiTolti} righe che sembravano`} una password o una chiave.</p>}
        </div>
      </div>
      <label className="mt-2 block text-[12px] font-semibold" htmlFor={`descrizione-${a.id}`}>Descrivilo per gli agenti (facoltativo)</label>
      <textarea
        id={`descrizione-${a.id}`} className="campo mt-1 min-h-16 text-[14px]" value={testo} maxLength={1000}
        onChange={(e) => { setTesto(e.target.value); setStato(''); }}
        placeholder="Come lo descriveresti al telefono a chi non lo vede: forme, colori, scritte, dove va messo."
      />
      <div className="mt-1.5 flex items-center justify-end gap-2">
        {stato && stato !== 'salvo' && <span className={`text-[12px] ${stato === 'salvata' ? 'text-grafite' : 'text-[#9b2626]'}`} role="status">{stato === 'salvata' ? 'Salvata.' : stato}</span>}
        <button className="tasto !min-h-9 text-[13px]" onClick={salva} disabled={stato === 'salvo' || testo === (a.descrizione ?? '')}>
          {stato === 'salvo' ? <LoaderCircle size={14} className="animate-spin" /> : null} Salva
        </button>
      </div>
    </div>
  );
}

// Nel foglio del lavoro: gli allegati della partita, con tre righe distinte: cantiere, agenti, collaudo.
export function AllegatiDellaPartita({ d }: { d: Dibattito }) {
  const elenco = d.allegati?.elenco ?? [];
  if (!elenco.length) return null;
  const p = d.produzione;
  return (
    <ul className="flex flex-col gap-2">
      {elenco.map((a) => {
        const percorso = `allegati/${a.nome}`;
        const cantiere = p?.allegati?.includes(percorso) ? `copiato come ${percorso}.` : p ? 'non copiato.' : 'lo copia la produzione, prima dei costruttori.';
        return (
          <li key={a.id} className="flex items-start gap-2.5 rounded-xl border border-bordo bg-white px-2.5 py-2">
            <Miniatura id={d.id} a={a} />
            <div className="min-w-0 flex-1 text-[11.5px] leading-snug text-grafite">
              <p className="truncate text-[13px] font-semibold text-inchiostro" title={a.nome}>{a.nome} <span className="font-normal text-grafite">· {misura(a.byte)}</span></p>
              {a.descrizione && <p className="line-clamp-2 text-inchiostro">«{a.descrizione}»</p>}
              <p>Cantiere: {cantiere}</p>
              <p>Agenti: {immagine(a) || a.tipo === 'pdf' ? 'non verificato se lo guardano.' : 'ricevono il testo.'}</p>
              {immagine(a) && <p>Collaudo: non controlla le immagini.</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Le immagini richiamate da una pagina del cantiere (allegati/logo.png): nell'anteprima la pagina
// non ha una cartella, quindi le immagini arrivano dentro la pagina come dati.
export function usaPaginaConAllegati(d: Dibattito, html: string | undefined): string | undefined {
  const [pronta, setPronta] = useState<string>();
  const usate = (d.allegati?.elenco ?? []).filter((a) => immagine(a) && !!html?.includes(`allegati/${a.nome}`));
  const chiave = usate.map((a) => a.id).join(',');
  useEffect(() => {
    setPronta(undefined);
    if (!html || !usate.length) return;
    let vivo = true;
    void Promise.all(usate.map(async (a) => {
      const r = await fetch(api.urlAllegato(d.id, a.id), { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const b = await r.blob();
      const url = await new Promise<string>((ok, no) => {
        const f = new FileReader();
        f.onload = () => ok(String(f.result));
        f.onerror = () => no(f.error);
        f.readAsDataURL(b);
      });
      return [a.nome, url] as const;
    })).then((coppie) => {
      if (!vivo) return;
      let t = html;
      for (const [nome, url] of coppie) t = t.split(`./allegati/${nome}`).join(url).split(`allegati/${nome}`).join(url);
      setPronta(t);
    }, () => undefined);
    return () => { vivo = false; };
  }, [html, d.id, chiave]); // eslint-disable-line react-hooks/exhaustive-deps
  return pronta ?? html;
}
