// Pezzi d'interfaccia condivisi: pastiglie di stato, misuratore del consenso, macchina da scrivere.
import { Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { NOME, type Agente, type StatoDichiarato } from '../../../motore/tipi.ts';
import { api } from '../api.ts';
import { consenso, ETICHETTE_STATO } from '../stato.ts';
import type { Dibattito } from '../../../motore/tipi.ts';

export const COLORE: Record<Agente, string> = { claude: '#b5f900', codex: '#9aa3ad' };

const STILE_STATO: Record<StatoDichiarato, string> = {
  proposta: 'bg-[#f1f2f4] text-[#141518] border-[#c4c8ce]',
  accordo: 'bg-[#effcc9] text-[#3f5600] border-[#b5f900]',
  accordo_parziale: 'bg-[#eceef1] text-[#3d4249] border-[#c4c8ce]',
  disaccordo: 'bg-[#f1f2f4] text-[#9b2626] border-[#141518]',
};

export function PastigliaStato({ stato }: { stato: StatoDichiarato }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-titolo text-[11px] font-semibold uppercase tracking-wide ${STILE_STATO[stato]}`}>{ETICHETTE_STATO[stato]}</span>;
}

export function NomeAgente({ agente, piccolo }: { agente: Agente; piccolo?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-titolo font-bold ${piccolo ? 'text-[13px]' : 'text-[15px]'}`}>
      <span className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: COLORE[agente] }} />
      {NOME[agente]}
    </span>
  );
}

// Quanto sono vicini i due, dall'ultimo stato dichiarato da ciascuno.
export function Consenso({ dibattito, stretto }: { dibattito?: Dibattito; stretto?: boolean }) {
  const c = consenso(dibattito);
  const pct = Math.round(c.valore * 100);
  return (
    <div className={`flex flex-col ${stretto ? 'w-24' : 'w-40'}`} title={`Consenso ${pct}%`}>
      <div className="flex items-center justify-between">
        <span className="etichetta !text-[10px]">Consenso</span>
        <span className="font-dati text-[11px] text-grafite">{pct}%</span>
      </div>
      <div
        className="relative mt-1 h-2.5 overflow-hidden rounded-full bg-[#e3e5e8]"
        role="meter"
        aria-label="Consenso tra Claude e Codex"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#141518,#9aa0a6 55%,#b5f900)' }} />
      </div>
    </div>
  );
}

// Rivela il testo a pezzi. Si riavvia quando cambia `chiave`; `salta()` mostra tutto subito.
export function usaMacchinaDaScrivere(testo: string, chiave: string, attiva: boolean, caratteriAlSecondo = 140): [string, () => void, boolean] {
  const [n, setN] = useState(attiva ? 0 : testo.length);
  const ultimaChiave = useRef(chiave);
  useEffect(() => {
    if (ultimaChiave.current !== chiave) {
      ultimaChiave.current = chiave;
      setN(attiva ? 0 : testo.length);
    }
  }, [chiave, attiva, testo.length]);
  useEffect(() => {
    if (!attiva || n >= testo.length) return;
    const t = setTimeout(() => setN((x) => Math.min(testo.length, x + Math.ceil(caratteriAlSecondo / 20))), 50);
    return () => clearTimeout(t);
  }, [n, attiva, testo.length, caratteriAlSecondo]);
  const visibile = attiva ? testo.slice(0, n) : testo;
  return [visibile, () => setN(testo.length), visibile.length < testo.length];
}

// Durante la scrittura un grassetto o un codice può essere ancora aperto: lo si chiude per non
// mostrare gli asterischi.
export function chiudiMarcatori(t: string): string {
  let s = t;
  if ((s.match(/\*\*/g) ?? []).length % 2) s += '**';
  if ((s.match(/`/g) ?? []).length % 2) s += '`';
  return s;
}

export function TestoMd({ testo }: { testo: string }) {
  return (
    <div className="md">
      <Markdown remarkPlugins={[remarkGfm]}>{testo}</Markdown>
    </div>
  );
}

// Finestre modali: focus sul primo controllo, Esc per chiudere, Tab che resta dentro, e alla
// chiusura il focus torna al tasto che le ha aperte.
// Con modale = false (le schede sopra la scena, che lasciano usare il resto) restano Esc e il
// ritorno del focus, ma Esc chiude solo il livello più alto: le modali ascoltano su document e
// segnano il tasto con preventDefault, le schede ascoltano su window, che viene dopo, e lasciano
// stare un Esc già usato. Il focus torna indietro solo se intanto non è andato altrove.
export function usaFinestra(onChiudi: () => void, modale = true) {
  const pannello = useRef<HTMLDivElement>(null);
  const chiudi = useRef(onChiudi);
  chiudi.current = onChiudi;
  useEffect(() => {
    const prima = document.activeElement as HTMLElement | null;
    if (!modale) {
      const esc = (e: KeyboardEvent) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        e.preventDefault();
        chiudi.current();
      };
      window.addEventListener('keydown', esc);
      return () => {
        window.removeEventListener('keydown', esc);
        // Chiusa con la X o con Esc il focus è finito sul body: torna a chi l'ha aperta, se c'è ancora.
        const ora = document.activeElement;
        if (prima && prima !== document.body && prima.isConnected && (!ora || ora === document.body)) prima.focus({ preventScroll: true });
      };
    }
    const focalizzabili = () => [...(pannello.current?.querySelectorAll<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])') ?? [])].filter((e) => !e.hasAttribute('disabled'));
    const campo = pannello.current?.querySelector<HTMLElement>('textarea, input');
    (campo ?? focalizzabili()[0])?.focus();
    const tasti = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        chiudi.current();
      } else if (e.key === 'Tab') {
        const f = focalizzabili();
        if (!f.length) return;
        const [primo, ultimo] = [f[0]!, f[f.length - 1]!];
        if (e.shiftKey && document.activeElement === primo) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primo.focus();
        }
      }
    };
    document.addEventListener('keydown', tasti);
    return () => {
      document.removeEventListener('keydown', tasti);
      prima?.focus?.();
    };
  }, [modale]);
  return pannello;
}

// Computer largo, da 1024 px (lg: di Tailwind): la plancia accanto alla chat e i fogli su due colonne.
export function usaLargo(): boolean {
  const [l, setL] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)');
    const f = () => setL(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return l;
}

// "1 messaggio", "3 messaggi": il numero col nome giusto.
export const quanti = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti}`;

export function durata(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Scarica il documento Markdown dal server del programma.
export function BottoneMarkdown({ id, compatto, primario }: { id: string; compatto?: boolean; primario?: boolean }) {
  const [stato, setStato] = useState<'pronto' | 'scarico' | 'errore'>('pronto');
  const scarica = () => {
    setStato('scarico');
    api.scaricaMarkdown(id).then(() => setStato('pronto'), () => setStato('errore'));
  };
  const titolo = stato === 'errore' ? 'Documento non disponibile, riprova' : 'Scarica il Markdown';
  return compatto ? (
    <button className="tasto tasto-icona" onClick={scarica} disabled={stato === 'scarico'} aria-label={titolo} title={titolo}><Download size={14} /></button>
  ) : (
    <button className={`tasto ${primario ? 'tasto-primario' : ''}`} onClick={scarica} disabled={stato === 'scarico'}>
      <Download size={16} /> {stato === 'scarico' ? 'Scarico…' : stato === 'errore' ? 'Non disponibile, riprova' : 'Scarica Markdown'}
    </button>
  );
}
