// La plancia di un lavoro nato dalla chat (la scheda compito e la partita che ne nasce): si guarda,
// non si legge. Una missione con la barra a tappe, chi ci lavora adesso e le sue ultime azioni dal
// vivo, l'anteprima del risultato e un campo per dire qualcosa alla squadra mentre lavora. Il foglio
// del lavoro si apre sopra la chat e si chiude tornando lì. Tutto viene da quello che il motore
// manda già (riassunto, istantanea, eventi): nessuna chiamata in più agli agenti.
import { FolderOpen, LoaderCircle, Play, SendHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NOME, altro, type Corrente, type Dibattito, type Evento, type MessaggioChat } from '../../../motore/tipi.ts';
import { api, type Riassunto } from '../api.ts';
import { AllegatiDellaPartita, usaPaginaConAllegati } from './Allegati.tsx';
import { conAnteprima, VisoreFile } from './Anteprime.tsx';
import { componiPagina, fileInOrdine, inCornice, tipoDi } from '../pagine.ts';
import { Ambud } from '../hud/Ambud.tsx';
import { Avatar } from '../hud/Avatar.tsx';
import { BottoneMarkdown, PastigliaStato, quanti, TestoMd, usaFinestra, usaLargo } from '../hud/comuni.tsx';
import { chiE, usaSquadra } from '../squadra.ts';
import { ETICHETTE_ESITO } from '../stato.ts';

// Le correzioni al massimo dopo un collaudo respinto: lo stesso tetto di MAX_CORREZIONI_PRODUZIONE
// nel motore (motore/produzione.ts, che qui non si importa perché usa i moduli di Node).
const MAX_CORREZIONI_PRODUZIONE = 2;

// La partita nata da una scheda: la dice il messaggio del motore scritto quando è partita.
export const partitaDellaScheda = (messaggi: MessaggioChat[], indice: number) =>
  messaggi.find((x) => x.autore === 'motore' && x.evento?.tipo === 'avviata' && x.evento.proposta === indice)?.evento?.partita;

// Un lavoro è attivo se la riunione, la sintesi o la produzione stanno andando: la stessa regola
// dell'elenco dei lavori.
export const attivo = (r: Riassunto) => r.inCorso || r.stato === 'in_corso' || r.stato === 'sintesi' || r.produzione === 'in_lavorazione' || r.produzione === 'collaudo';

// Cosa stanno facendo, in parole, per un lavoro attivo. Con un collaudo già respinto e la produzione
// di nuovo al lavoro, stanno correggendo.
export function faseDi(r: Riassunto): string {
  if (r.produzione === 'in_lavorazione') return r.collaudo === false ? 'Correggono i problemi del collaudo' : 'La squadra costruisce';
  if (r.produzione === 'collaudo') return 'Collaudo in corso';
  if (r.stato === 'sintesi') return 'Scrivono la sintesi';
  return 'Riunione in corso';
}

// Come è finito un lavoro, in due parole, per il titolo del foglio.
export function esitoDi(r: Riassunto): string {
  if (r.produzione === 'pronta') return r.collaudo ? 'Consegnato' : 'Consegnato, da rivedere';
  if (r.produzione === 'errore' || r.stato === 'errore') return 'Fermo per un errore';
  if (r.produzione === 'fermata') return 'Fermato';
  if (r.stato === 'in_pausa') return 'In pausa';
  if (r.stato === 'concluso') return r.esito === 'accordo' ? 'Piano pronto' : r.esito ? ETICHETTE_ESITO[r.esito] : 'Concluso';
  return 'In partenza';
}

// "adesso", "3 min fa", "2 h fa": quando è arrivata l'ultima novità.
export function fa(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'adesso';
  if (s < 3600) return `${Math.round(s / 60)} min fa`;
  return `${Math.round(s / 3600)} h fa`;
}
export const minuti = (da: string, a?: string) => Math.max(1, Math.round(((a ? Date.parse(a) : Date.now()) - Date.parse(da)) / 60_000));

// Un tic ogni 30 secondi, per tenere vero il "fa".
export function usaTic(attivo: boolean): void {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!attivo) return;
    const t = setInterval(() => setT((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, [attivo]);
}

// --- i passi del lavoro ----------------------------------------------------------------------

type StatoPasso = 'fatto' | 'ora' | 'dopo' | 'male' | 'attenzione';
interface Passo { nome: string; corto: string; stato: StatoPasso; nota?: string }

const ESITO_RIUNIONE: Record<string, string> = {
  accordo: 'accordo', stallo: 'nessun accordo', limite: 'chiusa al limite', limite_round: 'chiusa al limite', chiuso_da_utente: 'chiusa da te',
};

// I passi del lavoro, dai dati del riassunto e, se c'è, della partita intera.
export function passiDelLavoro(r: Riassunto, d: Dibattito | undefined, conProduzione: boolean): Passo[] {
  const passi: Passo[] = [];
  const interventi = quanti(r.turni, 'intervento', 'interventi');
  if (r.stato === 'errore') passi.push({ nome: 'Riunione', corto: 'riunione', stato: 'male', nota: 'ferma per un errore' });
  else if (r.stato === 'in_pausa') passi.push({ nome: 'Riunione', corto: 'riunione', stato: 'attenzione', nota: `in pausa dopo ${interventi}` });
  else if (r.stato === 'sintesi' || r.stato === 'concluso') passi.push({ nome: 'Riunione', corto: 'riunione', stato: r.esito === 'accordo' ? 'fatto' : 'attenzione', nota: `${r.esito ? ESITO_RIUNIONE[r.esito] ?? ETICHETTE_ESITO[r.esito] : 'conclusa'} in ${interventi}` });
  else passi.push({ nome: 'Riunione', corto: 'riunione', stato: 'ora', nota: r.turni ? `intervento ${r.turni + 1}` : 'si comincia' });

  // I ritocchi alla sintesi non sono un rifiuto del piano: la riunione era d'accordo.
  const ritocchi = d?.verifica?.testo.correzioni?.length ?? 0;
  if (r.stato === 'sintesi') passi.push({ nome: 'Sintesi', corto: 'sintesi', stato: 'ora', nota: 'la scrivono e la ricontrollano' });
  else if (r.stato === 'concluso' && r.approvata === false) passi.push({ nome: 'Sintesi', corto: 'sintesi', stato: 'attenzione', nota: ritocchi ? `${quanti(ritocchi, 'ritocco', 'ritocchi')} di ${NOME[d?.verifica?.revisore ?? 'codex']}` : `da ritoccare per ${NOME[d?.verifica?.revisore ?? 'codex']}` });
  else if (r.stato === 'concluso') passi.push({ nome: 'Sintesi', corto: 'sintesi', stato: 'fatto' });
  else passi.push({ nome: 'Sintesi', corto: 'sintesi', stato: 'dopo' });

  if (!conProduzione && !r.produzione) {
    passi.push({ nome: 'Produzione', corto: 'produzione', stato: 'dopo', nota: r.stato === 'concluso' ? 'la avvii tu, se serve' : undefined });
    return passi;
  }
  const p = d?.produzione;
  const pk = p?.pacchetti ?? [];
  const alLavoro = pk.findIndex((x) => x.stato === 'in_corso');
  const insieme = pk.filter((x) => x.stato === 'in_corso').length;
  const pronti = pk.filter((x) => x.stato === 'fatto').length;
  const correzione = p?.giro && p.giro > 1 ? p.giro - 1 : 0;
  if (r.produzione === 'in_lavorazione') passi.push({ nome: 'Produzione', corto: 'produzione', stato: 'ora', nota: correzione ? `correzione ${correzione} di ${MAX_CORREZIONI_PRODUZIONE}` : insieme > 1 ? `${insieme} pacchetti insieme · ${pronti} di ${pk.length} pronti` : alLavoro >= 0 ? `pacchetto ${alLavoro + 1} di ${pk.length}` : 'al lavoro' });
  else if (r.produzione === 'errore') passi.push({ nome: 'Produzione', corto: 'produzione', stato: 'male', nota: 'ferma per un errore' });
  else if (r.produzione === 'fermata') passi.push({ nome: 'Produzione', corto: 'produzione', stato: 'attenzione', nota: 'fermata' });
  else if (r.produzione === 'collaudo' || r.produzione === 'pronta') passi.push({ nome: 'Produzione', corto: 'produzione', stato: 'fatto', nota: p ? quanti(p.file.length, 'file', 'file') : undefined });
  else passi.push({ nome: 'Produzione', corto: 'produzione', stato: 'dopo' });

  const problemi = p?.collaudo?.problemi.length ?? 0;
  if (r.produzione === 'collaudo') passi.push({ nome: 'Collaudo', corto: 'collaudo', stato: 'ora', nota: correzione ? 'ricontrolla le correzioni' : undefined });
  else if (r.produzione === 'in_lavorazione' && r.collaudo === false) passi.push({ nome: 'Collaudo', corto: 'collaudo', stato: 'attenzione', nota: problemi ? `${quanti(problemi, 'problema', 'problemi')} da correggere` : 'da ricontrollare' });
  else if (r.produzione === 'pronta' && r.collaudo === false) passi.push({ nome: 'Collaudo', corto: 'collaudo', stato: 'male', nota: problemi ? `respinto, ${quanti(problemi, 'problema', 'problemi')}` : 'respinto' });
  else if (r.produzione === 'pronta' && r.collaudo) passi.push({ nome: 'Collaudo', corto: 'collaudo', stato: 'fatto', nota: 'superato' });
  else passi.push({ nome: 'Collaudo', corto: 'collaudo', stato: 'dopo' });

  if (r.produzione === 'pronta') passi.push({ nome: 'Consegna', corto: 'consegna', stato: r.collaudo ? 'fatto' : 'attenzione', nota: r.collaudo ? 'pronta' : 'da rivedere' });
  else passi.push({ nome: 'Consegna', corto: 'consegna', stato: 'dopo' });
  return passi;
}

const COLORE_TAPPA: Record<StatoPasso, string> = { fatto: 'bg-[#141518]', ora: 'bg-[#e6e8eb]', dopo: 'bg-[#e6e8eb]', male: 'bg-[#c63a2f]', attenzione: 'bg-[#f5d400]' };

// La barra a tappe: nera fatta, lime che si muove in corso, gialla da guardare, rossa non riuscita.
export function Tappe({ passi, scuro }: { passi: Passo[]; scuro?: boolean }) {
  return (
    <div className="mt-2.5" role="list" aria-label="Avanzamento">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${passi.length}, 1fr)` }}>
        {passi.map((x) => (
          <span key={x.nome} role="listitem" aria-label={`${x.nome}: ${x.stato === 'fatto' ? 'fatto' : x.stato === 'ora' ? 'in corso' : x.stato === 'male' ? 'non riuscito' : x.stato === 'attenzione' ? 'da guardare' : 'da fare'}${x.nota ? `, ${x.nota}` : ''}`}
            className={`relative h-2.5 overflow-hidden rounded-full ${scuro && (x.stato === 'dopo' || x.stato === 'ora') ? 'bg-[#34363b]' : scuro && x.stato === 'fatto' ? 'bg-white' : COLORE_TAPPA[x.stato]}`}>
            {x.stato === 'ora' && <span className="absolute inset-y-0 left-0 w-3/5 animate-pulse rounded-full bg-[#b5f900] shadow-[inset_0_0_0_1px_rgba(20,21,24,0.35)]" />}
          </span>
        ))}
      </div>
      <div className={`mt-1 grid gap-1 text-center font-dati text-[9.5px] leading-tight ${scuro ? 'text-[#9aa0a6]' : 'text-grafite'}`} style={{ gridTemplateColumns: `repeat(${passi.length}, 1fr)` }} aria-hidden>
        {passi.map((x) => <span key={x.nome} className="truncate">{x.corto}</span>)}
      </div>
    </div>
  );
}

// --- chi è in campo e cosa fa, dal vivo ------------------------------------------------------

export interface InCampo { id: string; nome: string; azione: string }
interface Riga { ora: string; testo: string }

// La partita intera e, mentre lavora, i suoi eventi: le ultime azioni vere (file letti e scritti,
// pacchetti che partono) e chi sta lavorando. Ferma, si rilegge solo quando l'archivio cambia.
function usaLavoro(id: string | undefined, r: Riassunto | undefined) {
  const { squadra } = usaSquadra();
  const [d, setD] = useState<Dibattito>();
  const [corrente, setCorrente] = useState<Corrente | null>(null);
  const [diario, setDiario] = useState<Riga[]>([]);
  const [ultimoAssistente, setUltimoAssistente] = useState<string>();
  const vivo = !!r && attivo(r);
  const deveLeggere = !!id && !!r && (vivo || r.stato === 'concluso' || r.stato === 'sintesi' || !!r.produzione);
  useEffect(() => {
    if (!deveLeggere) return;
    let ok = true;
    api.dibattito(id!).then((x) => { if (ok) { setD(x.dibattito); setCorrente(x.corrente ?? null); } }, () => undefined);
    return () => { ok = false; };
  }, [id, deveLeggere, r?.aggiornato]);
  const nomi = useRef(squadra);
  nomi.current = squadra;
  useEffect(() => {
    if (!id || !vivo) return;
    let rilettura: ReturnType<typeof setTimeout> | undefined;
    const rileggi = () => {
      if (rilettura) return;
      rilettura = setTimeout(() => {
        rilettura = undefined;
        api.dibattito(id).then((x) => { setD(x.dibattito); setCorrente(x.corrente ?? null); }, () => undefined);
      }, 1500);
    };
    const scrivi = (testo: string) => setDiario((x) => (x.at(-1)?.testo === testo ? x : [...x, { ora: new Date().toISOString(), testo }].slice(-8)));
    const ferma = api.segui(id, {
      istantanea: (i) => { setD(i.dibattito); setCorrente(i.corrente ?? null); },
      evento: (e: Evento) => {
        if (e.tipo === 'produzione' && e.testo) { scrivi(e.testo); rileggi(); }
        else if (e.tipo === 'attivita_assistente' && e.testo && e.fase === 'strumento') { setUltimoAssistente(e.assistente); scrivi(`${chiE(nomi.current, e.assistente).nome}: ${e.testo}`); }
        else if (e.tipo === 'attivita' && e.testo && e.fase === 'strumento') scrivi(`${NOME[e.agente]}: ${e.testo}`);
        else if (e.tipo === 'turno') { scrivi(`${NOME[e.turno.agente]}: ${e.turno.risposta.posizione.slice(0, 90)}`); rileggi(); }
        else if (e.tipo === 'stato' || e.tipo === 'concluso' || e.tipo === 'intervento') rileggi();
      },
      connessione: () => undefined,
      errore: () => undefined,
    });
    return () => { ferma(); if (rilettura) clearTimeout(rilettura); };
  }, [id, vivo]);
  return { d, corrente, diario, ultimoAssistente, vivo };
}

// Chi lavora adesso a questo lavoro, con due parole su cosa fa.
function inCampoDi(r: Riassunto, d: Dibattito | undefined, corrente: Corrente | null, ultimoAssistente: string | undefined, squadra: ReturnType<typeof usaSquadra>): InCampo[] {
  const nome = (id: string) => (id === 'claude' || id === 'codex' ? NOME[id] : chiE(squadra.squadra, id).nome);
  const membro = (id: string, azione: string): InCampo => ({ id, nome: nome(id), azione });
  if (r.stato === 'in_corso' && corrente) {
    const capo = membro(corrente.agente, corrente.azione ? corrente.azione.split(' ').slice(0, 2).join(' ').toLowerCase() : corrente.fase === 'risposta' ? 'parla' : 'pensa');
    return corrente.assistente ? [capo, membro(corrente.assistente, 'incarico')] : [capo];
  }
  if (r.stato === 'sintesi' && d) return [d.sintesi ? membro(altro(d.sintesi.relatore), 'ricontrolla') : membro(d.config.relatore, 'scrive la sintesi')];
  const p = d?.produzione;
  if (r.produzione === 'in_lavorazione' && p) {
    const al = (p.pacchetti ?? []).filter((x) => x.stato === 'in_corso');
    if (al.length) return al.map((x) => membro(x.assistente, x.titolo.split(/[:·,]/)[0]!.slice(0, 18).toLowerCase()));
    return [membro(ultimoAssistente ?? 'sviluppo', 'corregge')];
  }
  if (r.produzione === 'collaudo' && p) {
    const proc = squadra.procedure.find((x) => x.id === p.procedura);
    const revisori = [...new Set((proc?.passi ?? []).filter((x) => x.fase === 'collaudo').map((x) => x.assistente))];
    return [membro('codex', 'collauda'), ...revisori.map((x) => membro(x, 'rivede'))];
  }
  return [];
}

// --- l'anteprima del risultato ---------------------------------------------------------------

// La pagina prodotta, vista in piccolo in una cornice senza nessun permesso: niente script, niente
// moduli, origine opaca; i file esterni non si caricano (vale la CSP della dashboard). È un'occhiata
// al risultato, non una prova che funzioni: tutti i file si guardano nel foglio del lavoro.
export function Anteprima({ d, alta = 220 }: { d: Dibattito; alta?: number }) {
  const file = d.produzione?.file ?? [];
  const pagina = fileInOrdine(file).find((f) => tipoDi(f.percorso) === 'pagina' && f.anteprima);
  // I fogli di stile prodotti accanto alla pagina e le immagini degli allegati richiamate dalla
  // pagina (allegati/logo.png) entrano nella pagina.
  const html = usaPaginaConAllegati(d, pagina ? componiPagina(file, pagina) : undefined);
  if (!pagina) return null;
  return (
    <div className="relative mt-2.5 overflow-hidden rounded-xl border-[1.5px] border-[#141518] bg-[#d9dce0]" style={{ height: alta }}>
      <iframe
        title={`Anteprima di ${pagina.percorso}`}
        sandbox=""
        srcDoc={html && inCornice(html)}
        className="pointer-events-none origin-top-left border-0 bg-white"
        style={{ width: '200%', height: alta * 2, transform: 'scale(0.5)' }}
        tabIndex={-1}
        scrolling="no"
      />
      <span className="absolute left-2 top-2 rounded-md bg-[#141518]/85 px-1.5 py-1 font-titolo text-[10.5px] font-semibold text-white">Anteprima · {pagina.percorso}</span>
    </div>
  );
}

// --- dove sono i file ------------------------------------------------------------------------

// La cartella del cantiere da "dati" in poi: il resto del percorso è sempre lo stesso.
const cartellaBreve = (c: string) => {
  const i = c.search(/[\\/]dati[\\/]cantieri[\\/]/);
  return i >= 0 ? c.slice(i + 1) : c;
};

// Dove sono finiti i file, e il tasto che apre la cartella in Esplora risorse (o nel Finder).
export function DoveSonoIFile({ d, esteso }: { d: Dibattito; esteso?: boolean }) {
  const [errore, setErrore] = useState<string>();
  const p = d.produzione;
  if (!p?.cantiere) return null;
  const apri = () => { setErrore(undefined); api.apriCantiere(d.id).catch((e: Error) => setErrore(e.message)); };
  return (
    <div className={esteso ? 'rounded-xl border border-bordo bg-white px-3 py-2.5' : 'mt-2'}>
      <div className="flex items-center gap-2 text-[12.5px]">
        <FolderOpen size={15} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-dati text-[11.5px] text-grafite" title={p.cantiere}>{cartellaBreve(p.cantiere)}</span>
        <button className="shrink-0 font-titolo text-[12.5px] font-semibold underline decoration-[#b5f900] decoration-2" onClick={apri}>Apri la cartella</button>
      </div>
      {esteso && p.file.length > 0 && <p className="mt-1.5 line-clamp-2 font-dati text-[11px] leading-snug text-grafite">{quanti(p.file.length, 'file', 'file')}: {p.file.map((f) => f.percorso).join(', ')}</p>}
      {esteso && <p className="mt-1.5 text-[12px] leading-snug text-grafite">È la cartella chiusa del lavoro, dentro il programma: i tuoi progetti non si toccano. Per usarli altrove copiali da qui.</p>}
      {errore && <p className="mt-1 text-[12px] text-[#9b2626]" role="alert">{errore}</p>}
    </div>
  );
}

// --- la missione nella chat ------------------------------------------------------------------

type Badge = { testo: string; stile: string };
export function badgeDel(r: Riassunto | undefined, avviato: boolean): Badge {
  if (!r) return avviato ? { testo: 'In partenza', stile: 'bg-[#b5f900]' } : { testo: 'Da avviare', stile: 'bg-cartaScura' };
  if (r.stato === 'errore' || r.produzione === 'errore') return { testo: 'Ferma', stile: 'bg-[#ffe9e6] text-[#a2281f]' };
  if (r.stato === 'in_pausa') return { testo: 'In pausa', stile: 'bg-cartaScura' };
  if (r.produzione === 'fermata') return { testo: 'Fermata', stile: 'bg-cartaScura' };
  if (r.produzione === 'pronta') return r.collaudo ? { testo: 'Consegnato', stile: 'bg-[#effcc9] text-[#3f5600]' } : { testo: 'Da rivedere', stile: 'bg-[#ffe9e6] text-[#a2281f]' };
  if (attivo(r)) return { testo: 'In corso', stile: 'bg-[#b5f900]' };
  if (r.stato === 'concluso') return { testo: 'Piano pronto', stile: 'bg-[#effcc9] text-[#3f5600]' };
  return { testo: 'In partenza', stile: 'bg-[#b5f900]' };
}

// I problemi del collaudo accorciati alla prima frase: senza chiamate agli agenti.
export const primaFraseDi = (t: string) => {
  let x = t.replace(/^\[[^\]]+\]\s*/, '');
  // "03-rilascio.md, §3.4, I9-I10: testo": il riferimento al file resta nei dettagli, qui il testo.
  const rif = /^[^:]{0,90}\.(md|html|css|js|ts|tsx|json|txt)\b[^:]{0,80}:\s*/i.exec(x);
  if (rif) x = x.slice(rif[0].length);
  x = x.charAt(0).toUpperCase() + x.slice(1);
  const f = (x.split(/(?<=[.;])\s+/)[0] ?? x).replace(/;$/, '.');
  return f.length > 120 ? `${f.slice(0, 117).trimEnd()}…` : f;
};

export function Chip({ children, stile = 'bg-cartaScura' }: { children: ReactNode; stile?: string }) {
  return <span className={`inline-flex items-center rounded-md px-1.5 py-1 font-titolo text-[11px] font-semibold leading-none ${stile}`}>{children}</span>;
}

// Il campo per dire qualcosa alla squadra mentre lavora: in riunione lo legge chi parla dopo, in
// produzione il prossimo assistente che parte (o il collaudo).
// Una nota arriva a qualcuno solo in riunione o con la produzione al lavoro; durante il collaudo la
// leggono solo le correzioni, se servono.
export const accettaNote = (r: Riassunto | undefined): boolean => !!r && (r.stato === 'in_corso' || r.produzione === 'in_lavorazione' || r.produzione === 'collaudo');

function NotaAllaSquadra({ id, compatta, inCollaudo }: { id: string; compatta?: boolean; inCollaudo?: boolean }) {
  const [testo, setTesto] = useState('');
  const [invio, setInvio] = useState(false);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string }>();
  const manda = () => {
    const t = testo.trim();
    if (!t || invio) return;
    setInvio(true);
    setEsito(undefined);
    api.nota(id, t).then(
      () => { setTesto(''); setEsito({ ok: true, testo: inCollaudo ? 'Arrivata: la leggono le correzioni, se il collaudo respinge il lavoro.' : 'Arrivata: la legge chi parte dopo.' }); },
      (e: Error) => setEsito({ ok: false, testo: e.message }),
    ).finally(() => setInvio(false));
  };
  return (
    <div className={compatta ? 'mt-2.5' : ''}>
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); manda(); }}>
        <input className="campo !py-2 text-[13px]" value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Di' qualcosa alla squadra…" maxLength={2000} aria-label="Nota per la squadra al lavoro" />
        <button className="tasto tasto-icona !min-h-9 !bg-[#141518] !text-[#b5f900]" disabled={!testo.trim() || invio} aria-label="Manda la nota">{invio ? <LoaderCircle size={16} className="animate-spin" /> : <SendHorizontal size={16} />}</button>
      </form>
      {esito && <p className={`mt-1 text-[12px] ${esito.ok ? 'text-grafite' : 'text-[#9b2626]'}`} role={esito.ok ? 'status' : 'alert'}>{esito.testo}</p>}
    </div>
  );
}

export function CartaLavoro({ chat, m, messaggi, partite, disabilitato, onDettagli, onChiediModifica, onInCampo }: {
  chat: string; m: MessaggioChat; messaggi: MessaggioChat[]; partite: Riassunto[]; disabilitato?: string;
  onDettagli: (id: string) => void;
  onChiediModifica: (titolo: string) => void;
  onInCampo?: (indice: number, membri: InCampo[]) => void;
}) {
  const p = m.proposta!;
  const squadra = usaSquadra();
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string>();
  const [confermata, setConfermata] = useState<string>();
  const [aperta, setAperta] = useState(false);
  const id = partitaDellaScheda(messaggi, m.indice) ?? confermata;
  const r = id ? partite.find((x) => x.id === id) : undefined;
  const { d, corrente, diario, ultimoAssistente, vivo } = usaLavoro(id, r);
  usaTic(vivo);
  const membri = r && vivo ? inCampoDi(r, d, corrente, ultimoAssistente, squadra) : [];
  const chiave = membri.map((x) => `${x.id}:${x.azione}`).join('|');
  useEffect(() => { onInCampo?.(m.indice, membri); }, [chiave]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onInCampo?.(m.indice, []), []); // eslint-disable-line react-hooks/exhaustive-deps
  const badge = badgeDel(r, !!id);
  const conProduzione = p.dopo === 'produzione';
  const passi = r ? passiDelLavoro(r, d, conProduzione) : [];
  const ora = passi.find((x) => x.stato === 'ora');
  const resta = r?.produzione === 'pronta' && r.collaudo === false ? d?.produzione?.collaudo?.problemi ?? [] : [];
  // I problemi doppi (lo stesso visto da Codex e da un assistente) si contano una volta.
  const unici = [...new Map(resta.map((x) => [primaFraseDi(x).slice(0, 60), primaFraseDi(x)])).values()];
  const fatta = r?.produzione === 'pronta';
  const ritocchi = d?.verifica?.testo.correzioni?.length ?? 0;
  const assistenti = new Set((d?.produzione?.pacchetti ?? []).map((x) => x.assistente)).size;

  const esegui = (f: () => Promise<unknown>) => {
    setInvio(true);
    setErrore(undefined);
    f().catch((e: Error) => setErrore(e.message)).finally(() => setInvio(false));
  };
  const avvia = () => esegui(() => api.avvia(chat, m.indice).then((x) => setConfermata(x.id)));
  const produci = () => esegui(() => api.produci(id!, p.cartella ?? null));
  const daProdurre = r?.stato === 'concluso' && !r.produzione;
  const breve = d?.sintesi?.testo.conclusione;

  return (
    <div className="mt-2 rounded-2xl border-[1.5px] border-[#141518] bg-white p-3">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 font-titolo text-[15px] font-bold leading-snug">{p.titolo}</h3>
        <Chip stile={badge.stile}>{badge.testo}</Chip>
      </div>
      {!id && (
        <>
          <p className={`mt-1.5 whitespace-pre-wrap break-words text-[13.5px] leading-snug text-[#33363b] ${aperta ? '' : 'line-clamp-2'}`}>{p.obiettivo}</p>
          <button className="mt-0.5 text-[12px] font-semibold underline decoration-[#b5f900] decoration-2" onClick={() => setAperta(!aperta)} aria-expanded={aperta}>{aperta ? 'Meno' : 'Tutto l\'obiettivo'}</button>
        </>
      )}
      {r && <Tappe passi={passi} />}
      {id && !r && <p className="mt-2 text-[12.5px] text-grafite">La partita sta partendo…</p>}

      {vivo && r && (
        <div className="mt-2.5 flex items-center gap-2" aria-live="polite">
          {membri[0] ? <Avatar id={membri[0].id} dimensione={32} /> : <span className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-[#b5f900]" aria-hidden />}
          <span className="min-w-0">
            <b className="block font-titolo text-[14px] font-bold leading-tight">{faseDi(r)}</b>
            <span className="block truncate font-dati text-[11px] text-grafite">{[ora?.nota, d?.produzione && r.produzione ? `da ${minuti(d.produzione.inizio)} min` : '', `ultima novità ${fa(r.aggiornato)}`].filter(Boolean).join(' · ')}</span>
          </span>
        </div>
      )}
      {vivo && diario.length > 0 && (
        <ol className="mt-2 grid gap-0.5 rounded-lg bg-[#141518] px-2.5 py-1.5 font-dati text-[10.8px] leading-snug text-[#d9dce0]" aria-label="Ultime azioni">
          {diario.slice(-3).map((x) => (
            <li key={x.ora + x.testo} className="truncate"><span className="text-[#b5f900]">{new Date(x.ora).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' })}</span> {x.testo}</li>
          ))}
        </ol>
      )}

      {!vivo && breve && <p className={`mt-2 text-[13px] leading-snug text-[#33363b] ${aperta ? '' : 'line-clamp-2'}`} onClick={() => setAperta(!aperta)}>{breve}</p>}
      {fatta && d && (
        <div className="mt-2 flex flex-wrap gap-1">
          {d.produzione?.fine && <Chip>{minuti(d.produzione.inizio, d.produzione.fine)} min</Chip>}
          {assistenti > 0 && <Chip>{quanti(assistenti, 'assistente', 'assistenti')}</Chip>}
          <Chip stile={r!.collaudo ? 'bg-[#effcc9] text-[#3f5600]' : 'bg-[#ffe9e6] text-[#a2281f]'}>{r!.collaudo ? 'collaudo superato' : 'collaudo respinto'}</Chip>
          {ritocchi > 0 && <Chip stile="bg-[#fff3b0]">{quanti(ritocchi, 'ritocco', 'ritocchi')} di {NOME[d.verifica?.revisore ?? 'codex']}</Chip>}
        </div>
      )}
      {fatta && d && <Anteprima d={d} />}
      {d && (fatta || r?.produzione === 'errore' || r?.produzione === 'fermata') && <DoveSonoIFile d={d} />}
      {unici.length > 0 && (
        <div className="mt-2.5 rounded-xl bg-[#f7f8f9] px-2.5 py-2">
          <div className="etichetta !text-[11px]">Cosa resta</div>
          <ul className="mt-1 grid gap-1">
            {unici.slice(0, 3).map((x) => <li key={x} className="flex gap-2 text-[12.5px] leading-snug"><span className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded border-[1.5px] border-[#141518]" aria-hidden />{x}</li>)}
          </ul>
          {unici.length > 3 && <p className="mt-1 text-[12px] text-grafite">e {quanti(unici.length - 3, 'altro', 'altri')} nel lavoro</p>}
        </div>
      )}
      {id && accettaNote(r) && <NotaAllaSquadra id={id} compatta inCollaudo={r?.produzione === 'collaudo'} />}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {!id && (
          <button className="tasto tasto-primario !min-h-9 !px-3.5" onClick={avvia} disabled={invio || !!disabilitato}>
            {invio ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} />} {invio ? 'Avvio…' : 'Avvia'}
          </button>
        )}
        {daProdurre && <button className="tasto tasto-primario !min-h-9 !px-3.5" onClick={produci} disabled={invio || !!disabilitato}>Manda in produzione</button>}
        {id && <button className={`tasto !min-h-9 !px-3.5 ${fatta && r?.collaudo ? 'tasto-primario' : ''}`} onClick={() => onDettagli(id)}>{vivo ? 'Guarda il lavoro' : fatta ? 'Apri il lavoro' : 'Dettagli'}</button>}
        {fatta && <button className="tasto !min-h-9 !px-3.5" onClick={() => onChiediModifica(p.titolo)}>Chiedi una modifica</button>}
        {!id && <span className="text-[11.5px] leading-tight text-grafite">{disabilitato ?? (conProduzione ? 'Piano e poi produzione, se sono d’accordo.' : 'Claude e Codex fanno il piano.')}</span>}
      </div>
      {errore && <p className="mt-1.5 text-[12.5px] text-[#9b2626]" role="alert">{errore}</p>}
    </div>
  );
}

// Una missione in piccolo, per la plancia del computer: solo dal riassunto, senza eventi.
export function MissioneBreve({ titolo, r, conProduzione, onApri }: { titolo: string; r: Riassunto; conProduzione: boolean; onApri: () => void }) {
  usaTic(attivo(r));
  const badge = badgeDel(r, true);
  return (
    <button className="pannello w-full p-3 text-left" onClick={onApri}>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 truncate font-titolo text-[14px] font-bold">{titolo}</span>
        <Chip stile={badge.stile}>{badge.testo}</Chip>
      </div>
      <Tappe passi={passiDelLavoro(r, undefined, conProduzione)} />
      <span className="mt-1.5 block truncate font-dati text-[11px] text-grafite">{attivo(r) ? `${faseDi(r)} · ultima novità ${fa(r.aggiornato)}` : esitoDi(r)}</span>
    </button>
  );
}

// --- il foglio del lavoro --------------------------------------------------------------------

// Una battuta della riunione: due righe, intera con un tocco.
function Battuta({ stato, testo }: { stato: ReactNode; testo: string }) {
  const [intera, setIntera] = useState(false);
  return (
    <button className="min-w-0 flex-1 rounded-xl border border-bordo bg-white px-2.5 py-1.5 text-left text-[12.5px] leading-snug" onClick={() => setIntera(!intera)} aria-expanded={intera}>
      <span className={intera ? '' : 'line-clamp-2'}><span className="mr-1.5 align-middle">{stato}</span>{testo}</span>
    </button>
  );
}

const STILE_PACCHETTO: Record<string, string> = { attesa: 'w-0', in_corso: 'w-3/5 animate-pulse bg-[#b5f900] shadow-[inset_0_0_0_1px_rgba(20,21,24,0.35)]', fatto: 'w-full bg-[#141518]', fallito: 'w-full bg-[#c63a2f]' };

// Il lavoro aperto: sul telefono sale dal basso sopra la chat, in una colonna sola; sul computer sta a
// destra della chat su due colonne, con i file prodotti a tutta altezza a sinistra (o la riunione, se
// file non ce ne sono ancora) e lo stato del lavoro a destra. La X, il tasto Esc o un tocco fuori lo
// chiudono e si torna alla chat.
export function FoglioLavoro({ id, r, conProduzione, onChiudi, onUfficio }: {
  id: string; r: Riassunto | undefined; conProduzione: boolean;
  onChiudi: () => void; onUfficio: () => void;
}) {
  const squadra = usaSquadra();
  const largo = usaLargo();
  const { d, corrente, diario, ultimoAssistente, vivo } = usaLavoro(id, r);
  usaTic(vivo);
  const pannello = usaFinestra(onChiudi);
  const titolo = d?.config.titolo ?? d?.config.domanda ?? r?.domanda ?? 'Lavoro';
  const passi = r ? passiDelLavoro(r, d, conProduzione) : [];
  const ora = passi.find((x) => x.stato === 'ora');
  const membri = r && vivo ? inCampoDi(r, d, corrente, ultimoAssistente, squadra) : [];
  const pk = d?.produzione?.pacchetti ?? [];
  const ritocchi = d?.verifica?.testo.correzioni ?? [];
  const file = d?.produzione?.file ?? [];
  const pronta = r?.produzione === 'pronta';
  const conclusione = d?.sintesi?.testo.conclusione;
  const resoconto = d?.produzione?.resoconto;
  const resta = pronta && r?.collaudo === false ? d?.produzione?.collaudo?.problemi ?? [] : [];
  const unici = [...new Map(resta.map((x) => [primaFraseDi(x).slice(0, 60), primaFraseDi(x)])).values()];

  const inCampo = (membri.length > 0 || (vivo && diario.length > 0)) && (
    <section>
      {membri.length > 0 && (
        <>
          <h3 className="etichetta">In campo adesso</h3>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {membri.map((x) => (
              <span key={x.id + x.azione} className="flex items-center gap-2 rounded-xl border border-bordo bg-white py-1 pl-1 pr-2.5">
                <Avatar id={x.id} dimensione={28} />
                <span className="leading-tight"><b className="block font-titolo text-[12.5px] font-semibold">{x.nome}</b><span className="font-dati text-[10.5px] text-grafite">{x.azione}</span></span>
              </span>
            ))}
          </div>
        </>
      )}
      {vivo && diario.length > 0 && (
        <ol className="mt-3 grid gap-0.5 rounded-lg bg-[#141518] px-2.5 py-2 font-dati text-[11px] leading-snug text-[#d9dce0]" aria-label="Ultime azioni">
          {diario.slice(-6).map((x) => <li key={x.ora + x.testo} className="truncate"><span className="text-[#b5f900]">{new Date(x.ora).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' })}</span> {x.testo}</li>)}
        </ol>
      )}
    </section>
  );

  const iFile = d && file.length > 0 && (
    <section className={conAnteprima(d) ? 'flex min-h-0 flex-col lg:h-full' : ''}>
      <h3 className="etichetta">{pronta ? 'Il risultato' : 'I file finora'} · {quanti(file.length, 'file', 'file')}</h3>
      <div className={conAnteprima(d) ? 'mt-1.5 h-[68vh] min-h-0 lg:h-auto lg:flex-1' : 'mt-1.5'}><VisoreFile d={d} /></div>
    </section>
  );

  const inBreve = (conclusione || resoconto || unici.length > 0) && (
    <section>
      <h3 className="etichetta">In breve</h3>
      {conclusione && <p className="mt-1.5 text-[13.5px] leading-snug text-[#26282c]">{conclusione}</p>}
      {unici.length > 0 && (
        <div className="mt-2 rounded-xl bg-white px-2.5 py-2">
          <div className="etichetta !text-[11px] !text-[#a2281f]">Cosa resta, per il collaudo</div>
          <ul className="mt-1 grid gap-1">
            {unici.map((x) => <li key={x} className="flex gap-2 text-[12.5px] leading-snug"><span className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded border-[1.5px] border-[#141518]" aria-hidden />{x}</li>)}
          </ul>
        </div>
      )}
      {resoconto && (
        <details className="mt-2 rounded-xl border border-bordo bg-white px-3 py-2 text-[13px]">
          <summary className="cursor-pointer font-titolo font-semibold">Cosa scrive chi l'ha costruito</summary>
          <div className="mt-1"><TestoMd testo={resoconto} /></div>
        </details>
      )}
    </section>
  );

  const alLavoro = pk.length > 0 && (
    <section>
      <h3 className="etichetta">La squadra al lavoro</h3>
      <ul className="mt-1.5 grid gap-1.5">
        {pk.map((x, i) => (
          <li key={i} className="grid grid-cols-[28px_1fr_auto] items-center gap-2 rounded-xl border border-bordo bg-white px-2 py-1.5">
            <Avatar id={x.assistente} dimensione={28} />
            <span className="min-w-0">
              <b className="block truncate font-titolo text-[12.5px] font-semibold">{chiE(squadra.squadra, x.assistente).nome} · {x.titolo}</b>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#e6e8eb]"><span className={`block h-full rounded-full ${STILE_PACCHETTO[x.stato] ?? 'w-0'}`} /></span>
            </span>
            <span className="font-dati text-[10.5px] text-grafite">{x.stato === 'fatto' ? 'fatto' : x.stato === 'in_corso' ? (x.inizio ? `${minuti(x.inizio)} min` : 'al lavoro') : x.stato === 'fallito' ? 'fermo' : 'dopo'}</span>
          </li>
        ))}
      </ul>
    </section>
  );

  const numeri = d && (
    <section>
      <div className="grid grid-cols-3 gap-1.5">
        <span className="rounded-xl border border-bordo bg-white px-2 py-1.5"><b className="block font-titolo text-[18px] leading-none">{d.turni.length}</b><span className="text-[10.5px] leading-tight text-grafite">interventi</span></span>
        <span className="rounded-xl border border-bordo bg-white px-2 py-1.5"><b className={`block font-titolo text-[18px] leading-none ${ritocchi.length ? 'text-[#9a7a00]' : ''}`}>{ritocchi.length}</b><span className="text-[10.5px] leading-tight text-grafite">ritocchi di {NOME[d?.verifica?.revisore ?? 'codex']}</span></span>
        <span className="rounded-xl border border-bordo bg-white px-2 py-1.5"><b className="block font-titolo text-[18px] leading-none">{new Set(pk.map((x) => x.assistente)).size}</b><span className="text-[10.5px] leading-tight text-grafite">assistenti</span></span>
      </div>
      {ritocchi.length > 0 && (
        <details className="mt-2 rounded-xl border border-bordo bg-white px-3 py-2 text-[13px]">
          <summary className="cursor-pointer font-titolo font-semibold">I ritocchi di {NOME[d?.verifica?.revisore ?? 'codex']} alla sintesi</summary>
          <p className="mt-1 text-[12px] text-grafite">La riunione era d'accordo: sono correzioni al testo scritto dopo, non un rifiuto del piano.</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{ritocchi.map((x) => <li key={x}>{x}</li>)}</ul>
        </details>
      )}
    </section>
  );

  const allegati = d?.allegati?.elenco.length ? (
    <section>
      <h3 className="etichetta">Allegati</h3>
      <div className="mt-1.5"><AllegatiDellaPartita d={d} /></div>
    </section>
  ) : null;

  const doveSono = d?.produzione?.cantiere && (
    <section>
      <h3 className="etichetta">Dove sono i file</h3>
      <div className="mt-1.5"><DoveSonoIFile d={d} esteso /></div>
    </section>
  );

  const riunione = d && d.turni.length > 0 && (
    <section>
      <h3 className="etichetta">La riunione in {quanti(d.turni.length, 'battuta', 'battute')}</h3>
      <ol className="mt-1.5 grid gap-1.5">
        {d.turni.map((t) => (
          <li key={t.indice} className="flex items-start gap-2">
            <Avatar id={t.agente} dimensione={26} />
            <Battuta stato={<PastigliaStato stato={t.risposta.stato} />} testo={t.risposta.posizione} />
          </li>
        ))}
      </ol>
    </section>
  );

  const azioni = (
    <div className="flex flex-wrap gap-2">
      <button className="tasto !min-h-9" onClick={onUfficio}>Guarda nell'ufficio 3D</button>
      {d?.sintesi && <BottoneMarkdown id={id} />}
    </div>
  );

  // Sul computer a sinistra va quello che si guarda (i file, o la riunione se nessun file si può
  // mostrare), a destra lo stato.
  const fileASinistra = !!iFile && !!d && conAnteprima(d);
  const aSinistra = largo ? (fileASinistra ? iFile : riunione) || (
    <div className="grid h-full place-items-center text-center">
      <div className="flex max-w-xs flex-col items-center gap-2">
        <Ambud umore="pensa" dimensione={84} />
        <p className="text-[13.5px] text-grafite">{d ? 'Qui compaiono la riunione e poi i file, appena ci sono.' : 'Carico il lavoro…'}</p>
      </div>
    </div>
  ) : null;
  const colonna = largo
    ? [inCampo, inBreve, fileASinistra ? null : iFile, alLavoro, fileASinistra ? riunione : null, numeri, allegati, doveSono, azioni]
    : [inCampo, iFile, inBreve, alLavoro, allegati, doveSono, riunione, numeri, azioni];

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 bg-[#0b0c0e]/35 md:left-[464px] md:bg-transparent" onClick={onChiudi}>
      <div
        ref={pannello}
        role="dialog"
        aria-modal="true"
        aria-label={`Lavoro: ${titolo}`}
        className="absolute inset-x-0 bottom-0 top-[max(2.5rem,env(safe-area-inset-top))] flex flex-col overflow-hidden rounded-t-[22px] bg-[#f7f8f9] shadow-[0_-10px_30px_rgba(10,12,16,0.18)] md:inset-y-3 md:left-0 md:right-3 md:rounded-2xl md:border md:border-bordo md:shadow-[0_12px_32px_rgba(10,12,16,0.14)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bg-[#141518] px-4 pb-3.5 pt-3 text-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,46%)] lg:items-end lg:gap-x-8 lg:pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate font-titolo text-[15px] font-bold">{titolo}</h2>
              <button className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 lg:hidden" onClick={onChiudi} aria-label="Chiudi e torna alla chat"><X size={17} /></button>
            </div>
            <p className="mt-2.5 font-titolo text-[21px] font-bold leading-tight text-[#b5f900] lg:mt-1.5">{r ? (vivo ? faseDi(r) : esitoDi(r)) : 'Carico…'}</p>
            {r && <p className="mt-0.5 font-dati text-[11.5px] text-[#b7bcc3]">{[ora?.nota, vivo ? `ultima novità ${fa(r.aggiornato)}` : '', d?.produzione?.fine ? `${minuti(d.produzione.inizio, d.produzione.fine)} min di produzione` : ''].filter(Boolean).join(' · ') || ' '}</p>}
          </div>
          <div className="min-w-0 lg:flex lg:items-end lg:gap-3">
            {r && <div className="min-w-0 lg:flex-1"><Tappe passi={passi} scuro /></div>}
            <button className="hidden h-8 w-8 shrink-0 place-items-center self-start rounded-lg bg-white/10 lg:grid" onClick={onChiudi} aria-label="Chiudi e torna alla chat"><X size={17} /></button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:grid-rows-[minmax(0,1fr)]">
          {aSinistra && <div className="scorri hidden min-h-0 overflow-y-auto p-3.5 lg:block">{aSinistra}</div>}
          <div className="scorri min-h-0 flex-1 overflow-y-auto px-3.5 pb-6 pt-3 lg:border-l lg:border-bordo">
            {colonna.filter(Boolean).map((x, i) => <div key={i} className={i ? 'mt-4' : ''}>{x}</div>)}
          </div>
        </div>
        {accettaNote(r) && <div className="border-t border-bordo bg-white p-2.5 pb-[max(0.6rem,env(safe-area-inset-bottom))]"><NotaAllaSquadra id={id} inCollaudo={r?.produzione === 'collaudo'} /></div>}
      </div>
    </div>
  );
}
