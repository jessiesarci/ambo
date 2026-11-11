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

// L'ultimo messaggio che chiede una risposta: dell'utente, o un fatto del motore che chiede il
// riepilogo. È il limite di uno stop: fermare la chat ferma anche il riepilogo.
export const ultimoDaRispondere = (d: Dibattito): number => {
  const m = messaggiChat(d).findLast((x) => x.autore === 'utente' || (x.autore === 'motore' && !!x.a?.length));
  return m?.indice ?? 0;
};

export const ultimoDellUtente = (d: Dibattito): number => {
  const m = messaggiChat(d).findLast((x) => x.autore === 'utente');
  return m?.indice ?? 0;
};

// Chi deve rispondere adesso, e fino a quale messaggio dell'utente. L'ordine è quello del primo
// messaggio ancora senza risposta: di serie prima chi apre, poi l'altro, che legge anche il primo.
export function prossimaRisposta(d: Dibattito): { agente: Agente; fino: number } | null {
  const salta = d.saltaFino ?? 0;
  // I fatti del motore che chiedono un riepilogo (un lavoro finito) contano come un messaggio dell'utente.
  const dallUtente = messaggiChat(d).filter((m) => (m.autore === 'utente' || (m.autore === 'motore' && !!m.a?.length)) && m.indice > salta);
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
export function promptChat(d: Dibattito, agente: Agente, fino: number, stato?: string, fineLavoro?: string, allegati?: string): { testo: string; vede: number } {
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
  if (allegati) parti.push(`${allegati}\nUna partita avviata da questa chat ne prende una copia: in riunione si leggono i testi e le descrizioni, in produzione i file sono nel cantiere.`);

  const altroAg = altro(agente);
  const giaRisposto = ultimaRisposta(d, altroAg) >= fino;
  const ultimo = messaggiChat(d).find((m) => m.indice === fino);
  const anche = ultimo?.a?.includes(altroAg) && !giaRisposto;
  if (ultimo?.autore === 'motore') {
    parti.push(fineLavoro ? `DATI DEL LAVORO APPENA FINITO, letti adesso dal motore:\n${fineLavoro}` : '');
    parti.push([
      'È appena finito un lavoro nato da questa chat (il messaggio del Motore qui sopra). Scrivi all\'utente il riepilogo di fine lavoro, come un collega che ha appena consegnato:',
      '- in una frase, cosa è pronto, oppure perché si è fermato;',
      '- dove sono i file: la cartella del cantiere (dall\'app la apre con «Apri la cartella» nella carta del lavoro);',
      '- cosa resta da fare o da controllare, se c\'è (problemi del collaudo, ritocchi alla sintesi);',
      '- cosa conviene fare adesso, in una riga.',
      'Al massimo 6 righe, senza titoli. Usa solo i dati qui sopra e non inventare. Se serve un lavoro nuovo, per esempio correggere i problemi del collaudo, puoi proporre una scheda compito.',
    ].join('\n'));
  } else if (giaRisposto) {
    parti.push(`${NOME[altroAg]} ha già risposto qui sopra. Non ripetere: aggiungi solo quello che manca o correggi quello che non regge. Se non hai niente di utile da aggiungere, rispondi solo PASSO.`);
  } else {
    parti.push(`Rispondi all\'utente.${anche ? ` Dopo di te risponderà anche ${NOME[altroAg]}.` : ''}`);
  }
  return { testo: parti.join('\n\n'), vede };
}

// I dati di un lavoro finito per il riepilogo in chat: esito, sintesi in breve, file, cartella, collaudo.
export function datiFineLavoro(p: Dibattito, titolo: string): string {
  const pr = p.produzione;
  const righe = [`Lavoro: «${titolo}».`];
  righe.push(`Riunione: ${p.esito ?? p.stato}, ${p.turni.length} interventi.`);
  if (p.sintesi) righe.push(`Piano in breve: ${p.sintesi.testo.conclusione.replace(/\s+/g, ' ').slice(0, 700)}`);
  if (p.verifica && !p.verifica.testo.approvata) righe.push(`Ritocchi di ${NOME[p.verifica.revisore]} alla sintesi: ${p.verifica.testo.correzioni.length} (${p.verifica.testo.correzioni.map((x) => x.slice(0, 120)).slice(0, 3).join(' | ')}).`);
  if (!pr) {
    righe.push('Produzione: non avviata. Si avvia dalla carta del lavoro con «Manda in produzione».');
    return righe.join('\n');
  }
  righe.push(`Produzione: ${pr.stato}${pr.fine ? `, ${Math.max(1, Math.round((Date.parse(pr.fine) - Date.parse(pr.inizio)) / 60_000))} minuti` : ''}${pr.pacchetti?.length ? `, ${pr.pacchetti.length} pacchetti` : ''}.`);
  if (pr.errore) righe.push(`Errore: ${pr.errore.split('\n')[0]}`);
  righe.push(`Cartella del cantiere: ${pr.cantiere}`);
  righe.push(`File (${pr.file.length}): ${pr.file.slice(0, 15).map((f) => f.percorso).join(', ')}${pr.file.length > 15 ? ', …' : ''}`);
  if (pr.collaudo) {
    righe.push(pr.collaudo.approvato ? 'Collaudo: superato (Codex legge i file, non li prova).' : `Collaudo: respinto, ${pr.collaudo.problemi.length} problemi: ${pr.collaudo.problemi.map((x) => x.replace(/\s+/g, ' ').slice(0, 160)).slice(0, 5).join(' | ')}`);
  }
  return righe.join('\n');
}

// "PASSO" (anche con un punto o in minuscolo): niente da aggiungere.
export const passa = (testo: string): boolean => /^\s*\**passo\**\.?\s*$/i.test(testo);

// Per una partita lanciata dalla chat: le ultime battute, come contesto.
export function contestoDaChat(chat: Dibattito): string {
  return coda(messaggiChat(chat).filter((m) => !m.passa), CONTESTO_MAX).testo;
}
