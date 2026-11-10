// Etichette e fumetti sopra la testa degli omini (DOM agganciato alla posizione 3D).
import type { ReactNode } from 'react';

export type TonoFumetto = 'pensiero' | 'parla' | 'accordo' | 'parziale' | 'disaccordo' | 'errore' | 'neutro' | 'evidenza';

const TONI: Record<TonoFumetto, string> = {
  pensiero: 'bg-white text-[#141518] border-[#d9dce0]',
  parla: 'bg-white text-[#141518] border-[#d9dce0]',
  accordo: 'bg-[#b5f900] text-[#141518] border-[#9ad400]',
  parziale: 'bg-[#eceef1] text-[#141518] border-[#c4c8ce]',
  disaccordo: 'bg-[#141518] text-white border-[#141518]',
  errore: 'bg-[#ff3b30] text-white border-[#d42a20]',
  neutro: 'bg-white text-[#5d636c] border-[#d9dce0]',
  evidenza: 'bg-[#141518] text-[#b5f900] border-[#141518]',
};

export function Puntini() {
  return (
    <span className="inline-flex gap-[3px] align-middle" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 animate-[rimbalzo_1s_ease-in-out_infinite] rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

export function Fumetto({ tono, children }: { tono: TonoFumetto; children: ReactNode }) {
  return (
    <div className={`relative mb-1 whitespace-nowrap rounded-xl border px-2.5 py-1 font-titolo text-[12px] font-semibold shadow-md ${TONI[tono]} animate-[comparsa_.25s_ease-out]`}>
      {/* Un testo lungo (la nota che sta leggendo) non deve coprire mezza scena. */}
      <span className="block max-w-[46vw] overflow-hidden text-ellipsis md:max-w-[300px]">{children}</span>
      <span className={`absolute -bottom-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-b border-r ${TONI[tono]}`} />
    </div>
  );
}

// livello e xp (da 0 a 1 verso il livello dopo) solo per gli assistenti della squadra: il chip
// "Lv N" nella pillola e una barretta lime sotto, sottile per non coprire la scena. avatar: il mini
// ritratto al posto del pallino, così il cartellino e la carta della squadra si riconoscono.
export function Targhetta({ nome, colore, sotto, livello, xp, avatar }: { nome: string; colore: string; sotto?: ReactNode; livello?: number; xp?: number; avatar?: ReactNode }) {
  return (
    <div className="flex select-none flex-col items-center">
      {sotto}
      <div className={`flex items-center gap-1.5 rounded-full bg-[#141518]/85 py-0.5 pr-2 font-titolo text-[11px] font-semibold tracking-wide text-white shadow ${avatar ? 'pl-0.5' : 'pl-2'}`}>
        {avatar ?? <span className="h-2 w-2 rounded-full" style={{ background: colore }} />}
        {nome}
        {livello !== undefined && <span className="rounded-[4px] bg-[#b5f900] px-1 font-dati text-[9.5px] font-bold leading-[14px] text-[#141518]">Lv {livello}</span>}
      </div>
      {xp !== undefined && (
        <div className="mt-[3px] h-[3px] w-12 overflow-hidden rounded-full bg-[#141518]/55">
          <div className="h-full rounded-full bg-[#b5f900]" style={{ width: `${Math.round(xp * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
