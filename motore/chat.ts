// La chat con l'utente: scrive (o detta), rispondono Claude, Codex o tutti e due, uno dopo l'altro.
// Ogni agente tiene la sua sessione della CLI, quindi a ogni giro riceve solo quello che è stato
// scritto dopo il suo ultimo messaggio. Qui stanno le regole pure; chi esegue è il Motore.
import { descriviFonti, IMPOSTAZIONI, noteAttive, presentazioneUtente } from './impostazioni.ts';
import { materiale } from './prompt.ts';
import { altro, NOME, nomeAutore, type Agente, type Destinatari, type Dibattito, type MessaggioChat, type PropostaCompito } from './tipi.ts';

export const LIMITE_MESSAGGIO = 8000;
const STORIA_MAX = 60_000; // caratteri di chat da riportare a chi non ha ancora una sessione
const CONTESTO_MAX = 30_000; // caratteri di chat passati a una partita nata dalla chat

export const titoloChat = (testo: string): string => {
  const t = testo.replace(/\s+/g, ' ').trim();
  return t.length > 90 ? `${t.slice(0, 89)}…` : t || 'Nuova chat';
};

// "@codex ..." o "@claude ..." all'inizio del messaggio: risponde solo lui. "@tutti" tutti e due.
export function destinatari(testo: string, chi: Destinatari | undefined, apre: Agente): { a: Agente[]; testo: string } {
  const m = /^\s*@(claude|codex|tutti|entrambi)\b[\s,:]*/i.exec(testo);
  const scelta = m ? m[1]!.toLowerCase() : chi ?? 'entrambi';
  const resto = m ? testo.slice(m[0].length).trim() || testo.trim() : testo.trim();
  if (scelta === 'claude' || scelta === 'codex') return { a: [scelta], testo: resto };
  return { a: [apre, altro(apre)], testo: resto };
}

export const messaggiChat = (d: Dibattito): MessaggioChat[] => d.chat ?? [];
export const prossimoIndice = (d: Dibattito): number => (messaggiChat(d).at(-1)?.indice ?? 0) + 1;

// Fino a quale messaggio dell'utente ha già risposto (o passato) l'agente.
export function ultimaRisposta(d: Dibattito, agente: Agente): number {
  let n = 0;
  for (const m of messaggiChat(d)) if (m.autore === agente && (m.risponde ?? 0) > n) n = m.risponde!;
  return n;
}

export const ultimoDellUtente = (d: Dibattito): number => {
  const m = messaggiChat(d).findLast((x) => x.autore === 'utente');
  return m?.indice ?? 0;
};

// Chi deve rispondere adesso, e fino a quale messaggio dell'utente. L'ordine è quello del primo
// messaggio ancora senza risposta: di serie prima chi apre, poi l'altro, che legge anche il primo.
export function prossimaRisposta(d: Dibattito): { agente: Agente; fino: number } | null {
  const salta = d.saltaFino ?? 0;
  const dallUtente = messaggiChat(d).filter((m) => m.autore === 'utente' && m.indice > salta);
  for (const m of dallUtente) {
    for (const agente of m.a ?? []) {
      if (ultimaRisposta(d, agente) >= m.indice) continue;
      const fino = Math.max(...dallUtente.filter((x) => x.a?.includes(agente)).map((x) => x.indice));
      return { agente, fino };
    }
  }
  return null;
}

const ora = (iso: string) => new Date(iso).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' });

// Il testo di un agente può citare cose trovate nelle note o sul web: una riga che imita
// l'intestazione di un messaggio ("[Utente · …]", "[Motore · …]") non deve valere come un messaggio vero.
const IMITAZIONE = /^(\s*)\[(Utente|Claude|Codex|Motore)(\s*·)/gim;

function riga(m: MessaggioChat): string {
  const chi = nomeAutore(m.autore);
  const extra = [ora(m.ora), m.voce ? 'dettato a voce' : '', m.autore === 'utente' && m.a?.length === 1 ? `scrive a ${NOME[m.a[0]!]}` : ''].filter(Boolean).join(' · ');
  const testo = m.autore === 'utente' || m.autore === 'motore' ? m.testo : m.testo.replace(IMITAZIONE, '$1(citato) [$2$3');
  // La scheda è uscita dal testo quando è arrivata: chi rilegge la chat deve sapere che c'era.
  const scheda = m.proposta ? `\n(Scheda compito proposta: «${m.proposta.titolo}», ${m.proposta.dopo === 'produzione' ? 'piano e poi produzione' : 'solo il piano'}${m.proposta.cartella ? `, cartella "${m.proposta.cartella}"` : ''}. Obiettivo: ${m.proposta.obiettivo.replace(IMITAZIONE, '$1(citato) [$2$3')})` : '';
  return `[${chi} · ${extra}]\n${testo}${scheda}`;
}

// La scheda compito: un blocco ```compito in fondo alla risposta di un agente. Il motore la toglie
// dal testo e la mostra come scheda con il tasto "Avvia". Forma:
//   ```compito
//   titolo: Rendere open source il programma
//   dopo: produzione        (oppure: piano)
//   cartella: nome          (facoltativa, una cartella autorizzata)
//   ---
//   L'obiettivo completo, anche su più righe.
//   ```
const BLOCCO_COMPITO = /```compito[^\n]*\n([\s\S]*?)(?:\n```[^\S\n]*(?=\n|$)|$)/g;

export function leggiProposta(testo: string): { testo: string; proposta?: PropostaCompito } {
  const blocchi = [...testo.matchAll(BLOCCO_COMPITO)];
  const ultimo = blocchi.at(-1);
  if (!ultimo) return { testo };
  const righe = ultimo[1]!.split('\n');
  const campi: Record<string, string> = {};
  let corpo: string[] = [];
  for (let i = 0; i < righe.length; i++) {
    const r = righe[i]!;
    if (/^\s*-{3,}\s*$/.test(r)) { corpo = righe.slice(i + 1); break; }
    const m = /^\s*(titolo|dopo|cartella|obiettivo)\s*:\s*(.*)$/i.exec(r);
    if (!m) { corpo = righe.slice(i); break; }
    const chiave = m[1]!.toLowerCase();
    // "obiettivo:" senza separatore: il resto del blocco è l'obiettivo.
    if (chiave === 'obiettivo') { corpo = [m[2]!, ...righe.slice(i + 1)]; break; }
    campi[chiave] = m[2]!.trim();
  }
  const obiettivo = corpo.join('\n').trim();
  const titolo = (campi.titolo ?? '').replace(/\s+/g, ' ').trim();
  if (!titolo || obiettivo.length < 20) return { testo };
  const cartella = campi.cartella && !/^(nessuna|no|-)$/i.test(campi.cartella) ? campi.cartella.slice(0, 40) : undefined;
  // Tutti i blocchi compito escono dal testo: a schermo resta la scheda dell'ultimo.
  const pulito = testo.replace(BLOCCO_COMPITO, '').replace(/\n{3,}/g, '\n\n').trim();
  return {
    testo: pulito,
    proposta: {
      titolo: titolo.length > 120 ? `${titolo.slice(0, 119)}…` : titolo,
      obiettivo: obiettivo.slice(0, 20_000),
      dopo: /produz/i.test(campi.dopo ?? '') ? 'produzione' : 'piano',
      ...(cartella ? { cartella } : {}),
    },
  };
}

// Le ultime battute che stanno nel limite, dalla più vecchia alla più recente.
function coda(messaggi: MessaggioChat[], max: number): { testo: string; tagliati: number } {
  const scelte: string[] = [];
  let tot = 0;
  let i = messaggi.length - 1;
  for (; i >= 0; i--) {
    const r = riga(messaggi[i]!);
    if (tot + r.length > max && scelte.length) break;
    scelte.unshift(r.length > max ? `${r.slice(0, max)}…` : r);
    tot += r.length;
  }
  return { testo: scelte.join('\n\n'), tagliati: i + 1 };
}

function intestazione(d: Dibattito, agente: Agente): string {
  const c = d.config;
  return [
    `Questa è una chat di gruppo tra l\'utente, ${NOME[agente]} (tu) e ${NOME[altro(agente)]}. L\'utente scrive quando vuole; a volte chiede a uno solo di voi.`,
    presentazioneUtente(),
    agente === 'claude' && IMPOSTAZIONI.ambiente ? "Le skill di Claude Code dell'utente sono attive: leggile con lo strumento Skill quando servono." : '',
    noteAttive(c)
      ? `Hai in sola lettura le note dell\'utente (strumenti "memoria": cerca, leggi, elenco). ${descriviFonti()} Usale quando servono e dì quali hai usato.`
      : 'In questa chat non ci sono note dell\'utente da consultare.',
    c.ricercaWeb ? 'La ricerca web è attiva: usala per verificare fatti recenti, non per tutto.' : '',
    d.dossier ? materiale(d) : '',
  ].filter(Boolean).join('\n\n');
}

// Il messaggio per l'agente. vede: l'ultimo messaggio incluso, da segnare come già letto.
// stato: cosa c'è davvero nel programma adesso (compiti di questa chat, lavori in corso), dal motore.
export function promptChat(d: Dibattito, agente: Agente, fino: number, stato?: string): { testo: string; vede: number } {
  const tutti = messaggiChat(d).filter((m) => !m.passa);
  const vede = messaggiChat(d).at(-1)?.indice ?? 0;
  const parti: string[] = [];
  if (!d.sessioni[agente]) {
    parti.push(intestazione(d, agente));
    const { testo, tagliati } = coda(tutti, STORIA_MAX);
    parti.push(`${tagliati ? `(La chat è più lunga: qui ci sono gli ultimi messaggi, ${tagliati} più vecchi sono rimasti fuori.)\n\n` : ''}La chat finora:\n\n${testo}`);
  } else {
    const visti = d.letti?.[agente] ?? 0;
    const nuovi = tutti.filter((m) => m.indice > visti && m.autore !== agente);
    if (nuovi.length) parti.push(`Nuovi messaggi nella chat:\n\n${coda(nuovi, STORIA_MAX).testo}`);
  }
  if (stato) parti.push(`STATO DEL PROGRAMMA, letto adesso dal motore (è la verità su cosa esiste e cosa gira):\n${stato}`);

  const altroAg = altro(agente);
  const giaRisposto = ultimaRisposta(d, altroAg) >= fino;
  const ultimo = messaggiChat(d).find((m) => m.indice === fino);
  const anche = ultimo?.a?.includes(altroAg) && !giaRisposto;
  if (giaRisposto) {
    parti.push(`${NOME[altroAg]} ha già risposto qui sopra. Non ripetere: aggiungi solo quello che manca o correggi quello che non regge. Se non hai niente di utile da aggiungere, rispondi solo PASSO.`);
  } else {
    parti.push(`Rispondi all\'utente.${anche ? ` Dopo di te risponderà anche ${NOME[altroAg]}.` : ''}`);
  }
  return { testo: parti.join('\n\n'), vede };
}

// "PASSO" (anche con un punto o in minuscolo): niente da aggiungere.
export const passa = (testo: string): boolean => /^\s*\**passo\**\.?\s*$/i.test(testo);

// Per una partita lanciata dalla chat: le ultime battute, come contesto.
export function contestoDaChat(chat: Dibattito): string {
  return coda(messaggiChat(chat).filter((m) => !m.passa), CONTESTO_MAX).testo;
}
