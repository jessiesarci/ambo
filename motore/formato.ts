// Lettura e validazione delle risposte degli agenti.
// Codex risponde in JSON (lo impone --output-schema). Claude scrive il messaggio in markdown e lo
// chiude con un blocco ```json: con --json-schema, riprendendo la sessione saltava l'output strutturato.
import { z } from 'zod';
import { ErroreAgente } from './processo.ts';
import type { Agente, RispostaTurno, Sintesi, TipoRisposta, Verifica } from './tipi.ts';

const lista = z.array(z.string());
// incarichi, pacchetti e procedura hanno un valore di serie: una risposta senza (Claude che li
// dimentica, o un modello che non li conosce ancora) resta valida. Chi e quanti li decide poi il motore.
const Dichiarazione = z.object({
  stato: z.enum(['proposta', 'accordo', 'accordo_parziale', 'disaccordo']),
  posizione: z.string(),
  punti_aperti: lista,
  cambi_di_posizione: lista,
  incarichi: z.array(z.object({ assistente: z.string(), compito: z.string() })).default(() => []),
});
const TurnoZ = Dichiarazione.extend({ messaggio: z.string().trim().min(1) });
const SintesiZ = z.object({
  conclusione: z.string().trim().min(1),
  motivazioni: lista,
  decisioni: lista,
  disaccordi: z.array(z.object({ punto: z.string(), posizione_claude: z.string(), posizione_codex: z.string() })),
  prossimi_passi: lista,
  pacchetti: z.array(z.object({ titolo: z.string(), assistente: z.string(), obiettivo: z.string() })).default(() => []),
  procedura: z.string().default('su-misura'),
});
const VerificaZ = z.object({
  approvata: z.boolean(),
  correzioni: lista,
  disaccordi_mancanti: lista,
  commento: z.string(),
});

export interface RispostaChat {
  messaggio: string;
}

// prosa: il messaggio di Claude già scritto, quando manca solo il blocco json. Serve a chiedere
// la correzione del solo blocco invece di far riscrivere tutto l'intervento.
export class ErroreFormato extends ErroreAgente {
  prosa?: string;
  constructor(messaggio: string, prosa?: string) {
    super(messaggio, 'formato', true);
    this.prosa = prosa;
  }
}

// Ultimo blocco ```json (o ``` senza lingua) e il testo che lo precede. In mancanza di blocchi,
// prova con un oggetto JSON nudo in fondo al testo.
export function ultimoBloccoJson(testo: string): { prima: string; json?: string } {
  const blocchi = [...testo.matchAll(/```(?:json)?[ \t]*\r?\n([\s\S]*?)```/g)];
  const ultimo = blocchi.at(-1);
  if (ultimo && ultimo.index !== undefined) return { prima: testo.slice(0, ultimo.index), json: ultimo[1] };
  const fine = testo.trimEnd();
  if (fine.endsWith('}')) {
    for (let i = fine.indexOf('{'); i >= 0; i = fine.indexOf('{', i + 1)) {
      try {
        JSON.parse(fine.slice(i));
        return { prima: fine.slice(0, i), json: fine.slice(i) };
      } catch { /* prova la graffa successiva */ }
    }
  }
  return { prima: testo };
}

function valida<T>(schema: z.ZodType<T>, grezzo: string, prosa?: string): T {
  let dati: unknown;
  try {
    dati = JSON.parse(grezzo);
  } catch (e) {
    throw new ErroreFormato(`JSON non valido: ${(e as Error).message}`, prosa);
  }
  const r = schema.safeParse(dati);
  if (!r.success) throw new ErroreFormato(`campi non validi: ${z.prettifyError(r.error).replace(/\s+/g, ' ')}`, prosa);
  return r.data;
}

export function leggiRisposta(tipo: 'turno', agente: Agente, testo: string, prosa?: string): RispostaTurno;
export function leggiRisposta(tipo: 'sintesi', agente: Agente, testo: string, prosa?: string): Sintesi;
export function leggiRisposta(tipo: 'verifica', agente: Agente, testo: string, prosa?: string): Verifica;
export function leggiRisposta(tipo: 'chat' | 'incarico', agente: Agente, testo: string, prosa?: string): RispostaChat;
export function leggiRisposta(tipo: TipoRisposta, agente: Agente, testo: string, prosa?: string): RispostaTurno | Sintesi | Verifica | RispostaChat;
export function leggiRisposta(tipo: TipoRisposta, agente: Agente, testo: string, prosa?: string): RispostaTurno | Sintesi | Verifica | RispostaChat {
  // In chat e nei rapporti della squadra si risponde in testo libero, senza blocchi né schema.
  if (tipo === 'chat' || tipo === 'incarico') {
    const messaggio = testo.trim();
    if (!messaggio) throw new ErroreFormato('risposta vuota');
    return { messaggio };
  }
  const { prima, json } = ultimoBloccoJson(testo);
  const grezzo = json ?? testo;

  if (tipo === 'sintesi') return valida(SintesiZ, grezzo);
  if (tipo === 'verifica') return valida(VerificaZ, grezzo);
  if (agente === 'codex') return valida(TurnoZ, grezzo);

  // Claude: il messaggio è la prosa prima del blocco (o quella del tentativo precedente, se
  // questa risposta è la correzione del solo blocco).
  const messaggio = (prosa ?? prima).trim();
  if (!json) throw new ErroreFormato('manca il blocco ```json finale', messaggio || undefined);
  const d = valida(Dichiarazione, json, messaggio || undefined);
  if (!messaggio) {
    const conMessaggio = TurnoZ.safeParse(JSON.parse(json));
    if (conMessaggio.success) return conMessaggio.data;
    throw new ErroreFormato('il messaggio prima del blocco json è vuoto');
  }
  return { messaggio, ...d };
}
