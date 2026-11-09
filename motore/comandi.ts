// I comandi della dashboard e della CLI. Le regole stanno qui una volta sola: un dibattito attivo alla volta, niente comandi
// su un dibattito che sta eseguendo la CLI, limiti alla nota, configurazione validata dal motore.
import { LIMITE_MESSAGGIO, prossimaRisposta } from './chat.ts';
import { eChat, partitaDaProposta, titoloPartita, type Motore } from './dibattito.ts';
import { producibile } from './produzione.ts';
import { incarichiDi } from './prompt.ts';
import type { ConfigInput, Destinatari, Dibattito } from './tipi.ts';

export const LIMITE_NOTA = 2000;

export class ErroreComando extends Error {
  codice: number;
  constructor(codice: number, messaggio: string) {
    super(messaggio);
    this.codice = codice;
  }
}

// "In corso" dal punto di vista di chi guarda: il motore libera il dibattito un attimo dopo aver
// salvato lo stato finale, quindi conta lo stato salvato, non solo la promessa ancora aperta.
export function attivo(motore: Motore, d: Dibattito): boolean {
  return motore.inCorso(d.id) && (d.stato === 'in_corso' || d.stato === 'sintesi' || d.stato === 'nuovo');
}

export function riassunto(motore: Motore, d: Dibattito) {
  const chat = eChat(d);
  const ultimo = chat ? d.chat?.findLast((m) => !m.passa && m.autore !== 'motore') : undefined;
  return {
    tipo: chat ? 'chat' as const : 'partita' as const,
    ...(chat ? {
      messaggi: d.chat?.length ?? 0,
      ultimo: ultimo ? { autore: ultimo.autore, testo: ultimo.testo.replace(/\s+/g, ' ').slice(0, 140), ora: ultimo.ora } : null,
    } : {}),
    id: d.id,
    creato: d.creato,
    aggiornato: d.aggiornato,
    stato: d.stato,
    esito: d.esito ?? null,
    approvata: d.verifica?.testo.approvata ?? null,
    domanda: (chat ? d.config.domanda : titoloPartita(d)).slice(0, 200),
    ...(d.config.daChat ? { daChat: d.config.daChat } : {}),
    turni: d.turni.length, // gli interventi della riunione
    incarichi: incarichiDi(d).length,
    claude: d.config.claude.modello,
    codex: d.config.codex.modello ?? null,
    inCorso: attivo(motore, d),
    altrove: motore.bloccatoAltrove(d.id),
    // Occupa il motore (partita, produzione o CLI): la stessa regola di unSoloAttivo. Le chat no.
    occupato: !chat && (motore.inCorso(d.id) || motore.bloccatoAltrove(d.id)),
    produzione: d.produzione?.stato ?? null,
    collaudo: d.produzione?.collaudo?.approvato ?? null,
  };
}

export function carica(motore: Motore, id: string): Dibattito {
  let d: Dibattito | undefined;
  try {
    d = motore.istantanea(id);
  } catch {
    throw new ErroreComando(400, 'id non valido');
  }
  if (!d) throw new ErroreComando(404, 'dibattito non trovato');
  return d;
}

// Le chat non contano: si chatta anche mentre una partita o una produzione lavora.
function unSoloAttivo(motore: Motore, id?: string): void {
  const altri = [...motore.idPartiteAttive(), ...motore.idBloccatiAltrove()].filter((a) => a !== id);
  if (altri.length) throw new ErroreComando(409, `c'è già un dibattito in corso (${altri[0]}): mettilo in pausa o aspetta che finisca`);
}

const avviaInSottofondo = (motore: Motore, id: string) => void motore.avvia(id).catch((e: Error) => console.error(e.message));

export type TipoComando = 'crea' | 'pausa' | 'riprendi' | 'concludi' | 'nota' | 'produzione' | 'chat' | 'scrivi' | 'salva' | 'avvia';

const DESTINATARI: readonly Destinatari[] = ['entrambi', 'claude', 'codex'];

function testoMessaggio(dati: unknown): { testo: string; a?: Destinatari; voce?: boolean } {
  const { testo, a, voce } = (dati ?? {}) as { testo?: unknown; a?: unknown; voce?: unknown };
  if (typeof testo !== 'string' || !testo.trim()) throw new ErroreComando(400, 'il messaggio è vuoto');
  if (testo.length > LIMITE_MESSAGGIO) throw new ErroreComando(400, `il messaggio supera i ${LIMITE_MESSAGGIO} caratteri`);
  if (a !== undefined && !DESTINATARI.includes(a as Destinatari)) throw new ErroreComando(400, 'destinatario non valido');
  return { testo, ...(a ? { a: a as Destinatari } : {}), ...(voce === true ? { voce: true } : {}) };
}

export function esegui(motore: Motore, tipo: string, id: string | undefined, dati: unknown): unknown {
  if (tipo === 'chat') {
    const { testo, ...opzioni } = (dati ?? {}) as ConfigInput & { testo?: unknown };
    const primo = testo === undefined || testo === '' ? undefined : testoMessaggio(dati);
    let d: Dibattito;
    try {
      d = motore.creaChat({ ...opzioni, testo: primo?.testo });
    } catch (e) {
      throw new ErroreComando(400, (e as Error).message);
    }
    if (primo) motore.scrivi(d.id, primo.testo, primo);
    return { id: d.id };
  }
  if (tipo === 'crea') {
    unSoloAttivo(motore);
    const config = dati as ConfigInput;
    if (typeof config?.domanda !== 'string') throw new ErroreComando(400, 'manca la domanda');
    if (config.tipo !== undefined) throw new ErroreComando(400, 'una chat si apre con il comando chat');
    let d: Dibattito;
    try {
      d = motore.crea(config);
    } catch (e) {
      throw new ErroreComando(400, (e as Error).message);
    }
    avviaInSottofondo(motore, d.id);
    return { id: d.id };
  }
  if (!id) throw new ErroreComando(400, 'manca il dibattito');
  const d = carica(motore, id);
  if (motore.bloccatoAltrove(id)) throw new ErroreComando(409, 'questo dibattito lo sta eseguendo la CLI: da qui si può solo guardare');
  if (eChat(d)) return comandoChat(motore, tipo, d, dati);
  if (tipo === 'scrivi' || tipo === 'salva' || tipo === 'avvia') throw new ErroreComando(409, 'questo comando vale solo per le chat');
  if (tipo === 'pausa') {
    if (!motore.pausa(id)) throw new ErroreComando(409, 'né la partita né la sua produzione sono in corso');
    return { ok: true };
  }
  if (tipo === 'riprendi') {
    if (d.stato === 'concluso') throw new ErroreComando(409, 'il dibattito è già concluso');
    if (d.stato === 'errore' && d.errore?.recuperabile === false) throw new ErroreComando(409, 'dopo questo errore non si riprende: si può solo concludere');
    if (motore.inCorso(id)) return { ok: true };
    unSoloAttivo(motore, id);
    avviaInSottofondo(motore, id);
    return { ok: true };
  }
  if (tipo === 'concludi') {
    if (!motore.inCorso(id)) unSoloAttivo(motore, id);
    if (!motore.concludi(id)) throw new ErroreComando(409, 'il dibattito è già in chiusura o concluso');
    return { ok: true };
  }
  if (tipo === 'nota') {
    const testo = (dati as { testo?: unknown } | undefined)?.testo;
    if (typeof testo !== 'string' || !testo.trim()) throw new ErroreComando(400, 'la nota è vuota');
    if (testo.length > LIMITE_NOTA) throw new ErroreComando(400, `la nota supera i ${LIMITE_NOTA} caratteri`);
    if (!motore.intervieni(id, testo)) throw new ErroreComando(409, 'il dibattito è già chiuso: la nota non arriverebbe a nessuno');
    return { ok: true };
  }
  if (tipo === 'produzione') {
    const base = (dati as { base?: unknown } | undefined)?.base ?? null;
    if (base !== null && (typeof base !== 'string' || base.length > 40)) throw new ErroreComando(400, 'cartella di base non valida');
    const no = producibile(d, motore.produzioneOrfana(d));
    if (no) throw new ErroreComando(409, no);
    unSoloAttivo(motore, id);
    let lavoro: Promise<Dibattito>;
    try {
      lavoro = motore.produci(id, base as string | null);
    } catch (e) {
      throw new ErroreComando(409, (e as Error).message);
    }
    void lavoro.catch((e: Error) => console.error(e.message));
    return { ok: true };
  }
  throw new ErroreComando(404, 'comando sconosciuto');
}

function comandoChat(motore: Motore, tipo: string, d: Dibattito, dati: unknown): unknown {
  if (tipo === 'scrivi') {
    const m = testoMessaggio(dati);
    try {
      return { ok: true, indice: motore.scrivi(d.id, m.testo, m).indice };
    } catch (e) {
      throw new ErroreComando(409, (e as Error).message);
    }
  }
  if (tipo === 'pausa') {
    if (!motore.pausa(d.id)) throw new ErroreComando(409, 'nessuno sta rispondendo');
    return { ok: true };
  }
  if (tipo === 'riprendi') {
    if (motore.inCorso(d.id)) return { ok: true };
    if (!motore.riprendiChat(d.id)) throw new ErroreComando(409, prossimaRisposta(d) ? 'non riesco a riprendere questa chat adesso' : 'non c\'è niente da riprendere: scrivi un messaggio');
    return { ok: true };
  }
  if (tipo === 'salva') {
    try {
      return { ok: true, nota: motore.salvaChatComeNota(d.id) };
    } catch (e) {
      throw new ErroreComando(409, (e as Error).message);
    }
  }
  if (tipo === 'avvia') {
    // Il tasto "Avvia" di una scheda compito: una partita sola per scheda, anche premuto due volte.
    const indice = (dati as { indice?: unknown } | undefined)?.indice;
    if (!Number.isInteger(indice) || (indice as number) < 1) throw new ErroreComando(400, 'scheda non valida');
    if (!d.chat?.find((m) => m.indice === indice)?.proposta) throw new ErroreComando(404, 'in questo messaggio non c\'è una scheda compito');
    const gia = partitaDaProposta(d, indice as number);
    if (gia) return { ok: true, id: gia, gia: true };
    unSoloAttivo(motore);
    let r: { id: string; gia: boolean };
    try {
      r = motore.avviaProposta(d.id, indice as number);
    } catch (e) {
      throw new ErroreComando(409, (e as Error).message);
    }
    if (!r.gia) avviaInSottofondo(motore, r.id);
    return { ok: true, ...r };
  }
  throw new ErroreComando(409, 'questo comando non vale per le chat');
}
