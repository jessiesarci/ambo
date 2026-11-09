// Il magazzino nel documento: si manda in produzione la decisione, si segue il lavoro della squadra
// (la procedura, i pacchetti uno dopo l'altro, le revisioni) e si leggono i file consegnati con il
// collaudo. Si avvia solo con una conferma esplicita.
import { Factory, FileText, Square } from 'lucide-react';
import { useState } from 'react';
import type { Dibattito, Pacchetto, PacchettoPiano, Produzione as DatiProduzione, StatoPacchetto, StatoProduzione } from '../../../motore/tipi.ts';
import { api } from '../api.ts';
import { breve, chiE, conRuolo, STATO_PACCHETTO, usaSquadra } from '../squadra.ts';
import { quanti, TestoMd } from './comuni.tsx';

const STILE_PACCHETTO: Record<StatoPacchetto, string> = {
  attesa: 'bg-[#eceef1] text-[#4a5058]',
  in_corso: 'bg-[#141518] text-[#b5f900]',
  fatto: 'bg-[#effcc9] text-[#3f5600]',
  fallito: 'bg-[#f1f2f4] text-[#9b2626]',
};

// Chi costruisce: i pacchetti della sintesi, altrimenti uno solo di Paolo come prima della squadra.
const pacchettiPrevisti = (d: Dibattito): PacchettoPiano[] => {
  const pk = d.sintesi?.testo.pacchetti ?? [];
  return pk.length ? pk : [{ titolo: 'Tutta la decisione', assistente: 'sviluppo', obiettivo: '' }];
};

function Pacchetti({ p }: { p: DatiProduzione }) {
  const { squadra } = usaSquadra();
  const pk: Pacchetto[] = p.pacchetti ?? [];
  // Con un pacchetto solo il suo resoconto è il resoconto della produzione: si vede subito.
  const [aperto, setAperto] = useState<number | null>(pk.length === 1 ? 0 : null);
  if (!pk.length) return null;
  return (
    <div className="mt-2">
      <h4 className="etichetta">La catena ({quanti(pk.length, 'pacchetto', 'pacchetti')})</h4>
      <ol className="mt-1 space-y-1">
        {pk.map((x, n) => (
          <li key={n} className="rounded-lg border border-bordo bg-white px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-dati text-[11px] text-grafite">{n + 1}.</span>
              <span className="min-w-0 flex-1 font-semibold">{x.titolo}</span>
              <span className={`rounded-full px-2 py-0.5 font-titolo text-[10.5px] font-bold uppercase ${STILE_PACCHETTO[x.stato]}`}>{STATO_PACCHETTO[x.stato]}</span>
            </div>
            <p className="mt-0.5 text-[12.5px] text-grafite">{conRuolo(chiE(squadra, x.assistente))}{x.xp ? ` · +${x.xp} XP` : ''}</p>
            {x.scritti.length > 0 && <p className="mt-0.5 break-words font-dati text-[11.5px] text-[#3a3d42]">{x.scritti.join(', ')}</p>}
            {x.errore && <p className="mt-0.5 text-[12.5px] text-[#9b2626]">{x.errore.split('\n')[0]}</p>}
            {x.resoconto && (
              <>
                <button className="mt-1 text-[12px] font-semibold underline" onClick={() => setAperto(aperto === n ? null : n)} aria-expanded={aperto === n}>{aperto === n ? 'Chiudi il resoconto' : 'Resoconto'}</button>
                {aperto === n && <div className="scorri mt-1 max-h-60 overflow-y-auto rounded-md bg-[#f4f5f7] px-2 py-1"><TestoMd testo={x.resoconto} /></div>}
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Revisioni({ p }: { p: DatiProduzione }) {
  const { squadra } = usaSquadra();
  const r = p.revisioni ?? [];
  if (!r.length) return null;
  return (
    <div className="mt-2">
      <h4 className="etichetta">Revisioni della procedura</h4>
      <ul className="mt-1 space-y-1">
        {r.map((x, n) => (
          <li key={n} className="rounded-lg border border-bordo bg-white px-2.5 py-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-semibold">{conRuolo(chiE(squadra, x.assistente))}</span>
              <span className="font-dati text-[11px] text-grafite">giro {x.giro}</span>
              <span className={`ml-auto font-titolo text-[11px] font-bold uppercase ${x.esito?.approvato ? 'text-[#3f5600]' : 'text-[#9b2626]'}`}>
                {x.esito ? (x.esito.approvato ? 'approvato' : `respinto · ${quanti(x.esito.problemi.length, 'problema', 'problemi')}`) : 'non arrivata'}
              </span>
            </div>
            {x.esito && <p className="mt-0.5 text-[12.5px] text-[#3a3d42]">{breve(x.esito.commento, 220)}</p>}
            {x.errore && <p className="mt-0.5 text-[12.5px] text-[#9b2626]">{x.errore.split('\n')[0]}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATO: Record<StatoProduzione, { testo: string; stile: string }> = {
  in_lavorazione: { testo: 'In lavorazione', stile: 'bg-[#f1f2f4] text-[#141518]' },
  collaudo: { testo: 'In collaudo', stile: 'bg-[#eceef1] text-[#3d4249]' },
  pronta: { testo: 'Consegna pronta', stile: 'bg-[#effcc9] text-[#3f5600]' },
  fermata: { testo: 'Fermata', stile: 'bg-[#eceef1] text-[#4a5058]' },
  errore: { testo: 'Errore', stile: 'bg-[#f1f2f4] text-[#9b2626]' },
};

// soloLettura: nel replay si guarda soltanto, niente comandi.
export function Produzione({ dibattito: d, cartelle, soloLettura }: { dibattito: Dibattito; cartelle: { nome: string; file: number }[]; soloLettura: boolean }) {
  const { squadra, procedure } = usaSquadra();
  const p = d.produzione;
  const idProcedura = p?.procedura ?? d.sintesi?.testo.procedura;
  const procedura = idProcedura && idProcedura !== 'su-misura' ? procedure.find((x) => x.id === idProcedura) : undefined;
  const nomeProcedura = !idProcedura ? undefined : idProcedura === 'su-misura' ? 'Su misura' : procedura?.nome ?? idProcedura;
  const previsti = d.sintesi ? pacchettiPrevisti(d) : [];
  const costruttori = [...new Set(previsti.map((x) => conRuolo(chiE(squadra, x.assistente))))].join(', ');
  const revisori = [...new Set((procedura?.passi ?? []).filter((x) => x.fase === 'collaudo').map((x) => chiE(squadra, x.assistente).nome))];
  const [conferma, setConferma] = useState(false);
  const [base, setBase] = useState('');
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string>();
  const [aperto, setAperto] = useState<string | null>(null);
  // Avviata da qui, in attesa che la partita mostri la produzione nuova.
  const [avviata, setAvviata] = useState<string | null>(null);
  const inizioVisto = p?.inizio ?? null;
  const attesa = avviata !== null && avviata === (inizioVisto ?? '');
  const inCorso = p?.stato === 'in_lavorazione' || p?.stato === 'collaudo';

  const esegui = async (f: () => Promise<unknown>, avvio = false) => {
    setOccupato(true);
    setErrore(undefined);
    try {
      await f();
      if (avvio) setAvviata(inizioVisto ?? '');
      setConferma(false);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setOccupato(false);
    }
  };

  if (!d.sintesi || d.stato !== 'concluso') return null;

  return (
    <section className="mt-5 rounded-xl border border-bordo bg-[#f4f5f7] px-3 py-3" aria-label="Produzione">
      <div className="flex flex-wrap items-center gap-2">
        <Factory size={18} />
        <h3 className="font-titolo text-[16px] font-bold">Produzione</h3>
        {p && (p.stato === 'pronta' && p.collaudo && !p.collaudo.approvato ? (
          <span className="rounded-full bg-[#eceef1] px-2 py-0.5 font-titolo text-[11px] font-bold uppercase text-[#3d4249]">Consegna da rivedere</span>
        ) : (
          <span className={`rounded-full px-2 py-0.5 font-titolo text-[11px] font-bold uppercase ${STATO[p.stato].stile}`}>{STATO[p.stato].testo}</span>
        ))}
      </div>

      {nomeProcedura && (
        <p className="mt-1 text-[13px]">
          <span className="etichetta mr-1">Procedura</span>{nomeProcedura}
          {procedura?.quando && <span className="text-grafite"> · {procedura.quando}</span>}
        </p>
      )}
      {attesa && <p className="mt-1 text-[13px] text-grafite">Avvio della produzione…</p>}
      {!p && !conferma && !attesa && (
        <>
          <p className="mt-1 text-[13px] text-grafite">La decisione passa al magazzino: {previsti.length > 1 ? `${quanti(previsti.length, 'pacchetto', 'pacchetti')}, uno dopo l'altro, costruiti da ${costruttori}` : `la costruisce ${costruttori}`} in una cartella tutta della squadra, poi Codex fa il collaudo{revisori.length ? ` e ${revisori.join(', ')} rivede i file` : ''}. Se il collaudo la respinge si corregge e si ricontrolla, al massimo due volte.</p>
          {previsti.length > 1 && (
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-[13px]">
              {previsti.map((x, n) => <li key={n}><span className="font-semibold">{x.titolo}</span> · {chiE(squadra, x.assistente).nome}</li>)}
            </ol>
          )}
          <button className="tasto tasto-primario mt-2" disabled={soloLettura} onClick={() => setConferma(true)}><Factory size={16} /> Manda in produzione</button>
        </>
      )}

      {conferma && (
        <div className="mt-2 rounded-lg border border-[#c4c8ce] bg-[#f8fbe9] p-3 text-[13px]">
          <p className="font-semibold">Prima di partire, cosa possono fare gli agenti:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>{costruttori || 'Paolo (Sviluppo)'}, con Claude, {previsti.length > 1 ? 'scrivono' : 'scrive'} file solo in una cartella nuova (il cantiere), dentro i dati del programma sul PC.</li>
            <li>Niente comandi, niente installazioni, niente internet. Al massimo 40 passaggi e 25 minuti per pacchetto.</li>
            <li>Codex legge quello che è stato scritto e dà il collaudo{revisori.length ? `, poi ${revisori.join(', ')} rivede i file in sola lettura` : ''}; se lo respinge, si corregge e si ricontrolla (al massimo due correzioni). Tutti {d.config.memoria ? 'consultano le tue note in sola lettura' : 'lavorano senza le tue note'}.</li>
            <li>Consuma quota degli abbonamenti, come un dibattito un po' lungo.</li>
          </ul>
          <label className="mt-2 flex flex-col gap-1">
            <span className="etichetta">Da dove parte</span>
            <select className="campo !py-2" value={base} onChange={(e) => setBase(e.target.value)}>
              <option value="">Cartella vuota</option>
              {cartelle.map((c) => <option key={c.nome} value={c.nome}>Copia di "{c.nome}" ({c.file} file)</option>)}
            </select>
          </label>
          <p className="mt-1 text-[12px] text-grafite">Con una copia, la cartella originale non viene toccata: si lavora su un duplicato ripulito da credenziali e dipendenze.</p>
          <div className="mt-2 flex gap-2">
            <button className="tasto tasto-primario" disabled={occupato || soloLettura} onClick={() => void esegui(() => api.produci(d.id, base || null), true)}>{occupato ? 'Avvio…' : 'Sì, costruisci'}</button>
            <button className="tasto" onClick={() => setConferma(false)}>Annulla</button>
          </div>
        </div>
      )}

      {p && (
        <div className="mt-2 text-[13px]">
          <p className="text-grafite">
            {p.base ? `Partita da una copia di "${p.base}".` : 'Partita da una cartella vuota.'}
            {p.cantiere && <> I file sono in <code className="break-all">{p.cantiere}</code>.</>}
          </p>
          {inCorso && (
            <button className="tasto mt-2" disabled={occupato || soloLettura} onClick={() => void esegui(() => api.pausa(d.id))}><Square size={14} /> Ferma la produzione</button>
          )}
          {p.errore && <p className="mt-2 text-[#9b2626]">{p.errore.split('\n')[0]}</p>}
          <Pacchetti p={p} />
          {/* I resoconti dei pacchetti sono sotto ognuno: qui resta quello delle produzioni di prima
              della squadra, o dell'ultima correzione dopo un collaudo. */}
          {p.resoconto && (!p.pacchetti?.length || (p.giro ?? 1) > 1) && (
            <div className="mt-2 rounded-lg bg-[#ffffff] px-3 py-2">
              <h4 className="etichetta">{(p.giro ?? 1) > 1 ? 'Resoconto dell\'ultima correzione' : 'Resoconto di Claude'}</h4>
              <div className="mt-1"><TestoMd testo={p.resoconto} /></div>
            </div>
          )}
          {p.giri && p.giri.length > 0 && (
            <details className="mt-2 rounded-lg border border-bordo bg-white px-3 py-2">
              <summary className="cursor-pointer text-[12.5px] font-semibold">Collaudi precedenti ({p.giri.length}): respinti e corretti</summary>
              <ol className="mt-1 space-y-1.5">
                {p.giri.map((g) => (
                  <li key={g.giro}>
                    <span className="etichetta">Giro {g.giro}</span>
                    <ul className="list-disc pl-5">{g.collaudo.problemi.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </li>
                ))}
              </ol>
            </details>
          )}
          <Revisioni p={p} />
          {p.collaudo && (
            <div className={`mt-2 rounded-lg border px-3 py-2 ${p.collaudo.approvato ? 'border-[#b5f900] bg-[#f6fde3]' : 'border-[#141518] bg-[#f6f7f8]'}`}>
              <h4 className="etichetta">{p.revisioni?.length ? 'Collaudo di Codex e della procedura' : 'Collaudo di Codex'}{p.giro && p.giro > 1 ? ` (giro ${p.giro})` : ''}: {p.collaudo.approvato ? 'superato' : 'non superato'}</h4>
              <p className="mt-1">{p.collaudo.commento}</p>
              {p.collaudo.problemi.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5">{p.collaudo.problemi.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            </div>
          )}
          {p.file.length > 0 && (
            <>
              <h4 className="etichetta mt-3">File consegnati ({p.file.length})</h4>
              <ul className="mt-1 space-y-1">
                {p.file.map((f) => (
                  <li key={f.percorso}>
                    <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-cartaScura" aria-expanded={aperto === f.percorso} onClick={() => setAperto(aperto === f.percorso ? null : f.percorso)} disabled={f.anteprima === undefined}>
                      <FileText size={14} />
                      <span className="min-w-0 flex-1 truncate font-dati text-[12.5px]">{f.percorso}</span>
                      <span className="text-[11px] text-grafite">{f.anteprima === undefined ? 'troppo grande per l\'anteprima' : `${f.caratteri} car.`}</span>
                    </button>
                    {aperto === f.percorso && f.anteprima !== undefined && (
                      <pre className="scorri mt-1 max-h-72 overflow-auto rounded-md bg-[#0b0c0e] p-3 font-dati text-[12px] leading-snug text-[#e9ebee]">{f.anteprima}</pre>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {!inCorso && !attesa && (
            <button className="tasto mt-3" disabled={occupato || soloLettura} onClick={() => setConferma(true)}><Factory size={14} /> Rifai la produzione</button>
          )}
        </div>
      )}
      {errore && <p className="mt-2 text-[13px] text-[#9b2626]" role="alert">{errore}</p>}
    </section>
  );
}
