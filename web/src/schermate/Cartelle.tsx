// Le cartelle che gli agenti possono leggere: da qui si aggiungono e si tolgono, e una partita ne
// riceve una copia filtrata.
import { FolderLock, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, type CartellaLocale } from '../api.ts';
import { usaFinestra } from '../hud/comuni.tsx';

export function Cartelle({ onChiudi }: { onChiudi: () => void }) {
  const pannello = usaFinestra(onChiudi);
  const [elenco, setElenco] = useState<CartellaLocale[]>();
  const [nome, setNome] = useState('');
  const [percorso, setPercorso] = useState('');
  const [errore, setErrore] = useState<string>();
  const [occupato, setOccupato] = useState(false);

  const aggiorna = useCallback(() => {
    api.cartelle().then(setElenco).catch((e: Error) => setErrore(e.message));
  }, []);
  useEffect(aggiorna, [aggiorna]);

  const esegui = async (f: () => Promise<unknown>) => {
    setOccupato(true);
    setErrore(undefined);
    try {
      await f();
      aggiorna();
      return true;
    } catch (e) {
      setErrore((e as Error).message);
      return false;
    } finally {
      setOccupato(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-[#0b0c0e]/35 p-3" onClick={onChiudi}>
      <div ref={pannello} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Cartelle autorizzate" className="pannello scorri flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto p-5 outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <FolderLock size={20} />
          <h2 className="font-titolo text-[18px] font-bold">Cartelle autorizzate</h2>
          <button className="tasto tasto-icona ml-auto" onClick={onChiudi} aria-label="Chiudi"><X size={16} /></button>
        </div>
        <p className="text-[13px] text-grafite">
          Gli agenti non toccano il disco. Per un dibattito ricevono una copia del testo dei file; per la produzione lavorano su un duplicato.
          Restano sempre fuori dipendenze, build, file di credenziali e le righe che sembrano chiavi o password.
        </p>

        <ul className="space-y-2">
          {!elenco && <li className="text-[13px] text-grafite">Carico…</li>}
          {elenco && !elenco.length && <li className="text-[13px] text-grafite">Nessuna cartella autorizzata.</li>}
          {(elenco ?? []).map((c) => (
            <li key={c.nome} className="flex items-start gap-2 rounded-xl border border-bordo bg-[#ffffff] p-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{c.nome}</div>
                <div className="break-all font-dati text-[11.5px] text-grafite">{c.percorso}</div>
                <div className="text-[12px] text-grafite">{c.file} file leggibili</div>
              </div>
              <button className="tasto tasto-icona" disabled={occupato} onClick={() => void esegui(() => api.rimuoviCartella(c.nome))} aria-label={`Togli ${c.nome}`}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>

        <form className="flex flex-col gap-2 border-t border-bordo pt-3" onSubmit={(e) => { e.preventDefault(); void esegui(() => api.aggiungiCartella(nome, percorso)).then((ok) => { if (ok) { setNome(''); setPercorso(''); } }); }}>
          <span className="etichetta">Aggiungi una cartella</span>
          <input className="campo" placeholder="Nome breve, es. Sito del negozio" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} aria-label="Nome della cartella" />
          <input className="campo font-dati text-[13px]" placeholder="C:\Users\nome\Desktop\progetto o /home/nome/progetto" value={percorso} onChange={(e) => setPercorso(e.target.value)} aria-label="Percorso completo" />
          <button type="submit" className="tasto tasto-primario" disabled={!nome.trim() || !percorso.trim() || occupato}>Autorizza</button>
          <p className="text-[12px] text-grafite">Non si possono autorizzare un disco intero, la cartella utente, le cartelle di Claude, Codex e SSH, né la cartella del programma e i suoi dati.</p>
        </form>
        {errore && <p className="text-[13px] text-[#9b2626]" role="alert">{errore}</p>}
      </div>
    </div>
  );
}
