// La regia: dallo stato della partita decide dove va ciascun omino, che posa prende e che fumetto
// ha sopra la testa. Gestisce gli effetti a tempo (colpi, cambi di posizione, note, esito) e la
// consegna: il documento passa dall'ufficio (decisioni) al magazzino (produzione).
// Claude e Codex stanno in sala solo durante la riunione (sintesi e verifica comprese), poi
// tornano alle loro scrivanie in Direzione; in chat rispondono da lì. Codex scende al banco del
// collaudo quando la produzione è in collaudo. Gli assistenti siedono nel reparto del loro ruolo e,
// mentre la decisione è in produzione, alla loro stazione sulla catena (reparti.ts).
import { useFrame } from '@react-three/fiber';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { NOME, type Agente, type StatoDichiarato } from '../../../motore/tipi.ts';
import { coloreAgente } from '../avatar.ts';
import { alLavoro, avanzamento, breve, chiE, inCoda, usaSquadra } from '../squadra.ts';
import { ETICHETTE_ESITO, ETICHETTE_STATO, inCodaChat, type Azione, type Vista } from '../stato.ts';
import { AereoDiCarta, Coriandoli, FoglioStampante } from './Effetti.tsx';
import type { DatoEtichetta, FumettoDato, RegistroEtichette } from './Etichette.tsx';
import type { TonoFumetto } from './Fumetti.tsx';
import { Personaggio, type ModelloPersonaggio, type Posa } from './Personaggio.tsx';
import { COLORE_AGENTE, COLORI, FATTORINO, LINEA, percorso, posizioneDi, STAZIONI, TAVOLO, UFFICIO_UTENTE, type Posto, type Punto } from './pianta.ts';
import { luogoDi, riunioneAperta, type Disposizione, type Luogo } from './reparti.ts';

const TONO_STATO: Record<StatoDichiarato, TonoFumetto> = { proposta: 'parla', accordo: 'accordo', accordo_parziale: 'parziale', disaccordo: 'disaccordo' };
// Kenney Mini Characters: Claude in tailleur coi capelli arancioni, Codex con la maglia verde acqua.
const MODELLO: Record<Agente, ModelloPersonaggio> = { claude: 'female-d', codex: 'male-f' };
// Tempo che la scatola impiega a percorrere il nastro (0,9 m/s, come in Produzione.tsx).
const DURATA_NASTRO = ((LINEA.da - LINEA.a) / 0.9) * 1000;
// Con la grafica ridotta (telefono, PC che fatica) al massimo 4 assistenti animati: prima chi lavora,
// poi chi sta sulla catena, poi chi aspetta, poi gli ultimi chiamati.
export const MAX_ASSISTENTI_RIDOTTO = 4;

interface Transitorio {
  parlaFino: number;
  badge?: { testo: string; tono: TonoFumetto; fino: number };
  cambio?: number;
}

// Modelli già nel pacchetto, senza Claude, Codex e l'utente (restano riconoscibili) né il fattorino.
// Ogni standard ha il suo, così da una partita all'altra lo si ritrova; gli agenti dell'utente ne
// prendono uno dall'id. Si distinguono anche per la pallina sull'antenna, del colore dell'avatar.
const MODELLI_SQUADRA: ModelloPersonaggio[] = ['female-b', 'male-a', 'female-e', 'male-b', 'female-f', 'male-e'];
const PREFERITO: Record<string, number> = { ricerca: 0, analisi: 1, architettura: 2, testi: 3, design: 4, sviluppo: 5, controllo: 0 };
const impronta = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const modelloDi = (id: string): ModelloPersonaggio => MODELLI_SQUADRA[PREFERITO[id] ?? impronta(id) % MODELLI_SQUADRA.length]!;

// Materiali dei monitor: si accendono del colore dell'agente quando ragiona. Quello di Claude e di
// Codex sta sia sulla scrivania in Direzione sia sul portatile al tavolo della sala.
export function usaSchermi() {
  return useMemo(() => ({
    claude: new THREE.MeshBasicMaterial({ color: '#1d1f22', toneMapped: false }),
    codex: new THREE.MeshBasicMaterial({ color: '#1d1f22', toneMapped: false }),
    utente: new THREE.MeshBasicMaterial({ color: '#3f5a00', toneMapped: false }),
  }), []);
}
export const ContestoSchermi = createContext<ReturnType<typeof usaSchermi> | null>(null);

function SchermiVivi({ vista }: { vista: Vista }) {
  const schermi = useContext(ContestoSchermi);
  const c = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    if (!schermi) return;
    const t = clock.elapsedTime;
    for (const a of ['claude', 'codex'] as const) {
      const f = vista.fase[a];
      const m = schermi[a];
      if (f === 'ragionamento' || f === 'risposta') m.color.copy(c.set(COLORE_AGENTE[a])).multiplyScalar(0.75 + Math.sin(t * 5) * 0.25);
      // Mentre cerca nelle note lo schermo lampeggia di lime, più veloce.
      else if (f === 'strumento') m.color.copy(c.set(COLORI.linea)).multiplyScalar(0.7 + Math.sin(t * 11) * 0.3);
      else if (f === 'errore') m.color.set(Math.sin(t * 8) > 0 ? COLORI.errore : '#3a0d0b');
      else m.color.set('#2e343b');
    }
  });
  return null;
}

// Il fattorino: va alla stampante, prende il documento, lo porta all'inizio del nastro, torna.
// Le fasi avanzano quando arriva (non a tempo), così non taglia attraverso i muri se la scheda
// del browser era in secondo piano.
type FaseConsegna = 'casa' | 'va' | 'prende' | 'porta' | 'posa' | 'rientra';

function rottaFattorino(f: FaseConsegna): { percorso: Punto[]; destinazione: { punto: Punto; verso: number }; posa: Posa } {
  switch (f) {
    case 'va': return { percorso: FATTORINO.versoStampante, destinazione: { punto: FATTORINO.stampante, verso: Math.PI }, posa: 'fermo' };
    case 'prende': return { percorso: NESSUNO, destinazione: { punto: FATTORINO.stampante, verso: Math.PI }, posa: 'porta' };
    case 'porta': return { percorso: FATTORINO.versoNastro, destinazione: { punto: FATTORINO.nastro, verso: Math.PI }, posa: 'porta' };
    case 'posa': return { percorso: NESSUNO, destinazione: { punto: FATTORINO.nastro, verso: Math.PI }, posa: 'porta' };
    case 'rientra': return { percorso: NESSUNO, destinazione: { punto: FATTORINO.casa, verso: Math.PI / 2 }, posa: 'fermo' };
    default: return { percorso: NESSUNO, destinazione: { punto: FATTORINO.casa, verso: Math.PI / 2 }, posa: 'fermo' };
  }
}

interface Assistente {
  id: string;
  luogo: Luogo;
  posa: Posa;
  fumetti: FumettoDato[];
  lavora: boolean;
  priorita: number; // per il tetto della grafica ridotta
  ordine: number;
}

export function Direzione({ vista, invia, ridotto, onAgente, registro, onEtichette, onConsegna, onNastro, disp }: {
  vista: Vista;
  invia: (a: Azione) => void;
  ridotto: boolean;
  onAgente?: (a: Agente) => void;
  registro: RegistroEtichette;
  onEtichette: (d: DatoEtichetta[]) => void;
  onConsegna: (id: string | null) => void; // la scatola di questa partita è in viaggio, non ancora sullo scaffale
  onNastro: (decisione: boolean) => void; // fa partire la scatola sul nastro
  disp: Disposizione;
}) {
  const [ora, setOra] = useState(() => Date.now());
  const [tr, setTr] = useState<Record<Agente, Transitorio>>({ claude: { parlaFino: 0 }, codex: { parlaFino: 0 } });
  const [lancio, setLancio] = useState(0);
  const [nota, setNota] = useState<{ testo: string; fino: number } | null>(null);
  const d = vista.dibattito;
  const chat = d?.config.tipo === 'chat';
  const [utenteLanciaFino, setUtenteLanciaFino] = useState(0);
  const [festa, setFesta] = useState({ fino: 0, lancio: 0 });
  const [consegna, setConsegna] = useState<FaseConsegna>('casa');
  const [consegnato, setConsegnato] = useState<string | null>(null);
  // Il cartellino di un assistente che ha appena consegnato (o mancato) il rapporto, per qualche secondo.
  const [esitiSquadra, setEsitiSquadra] = useState<Record<string, { testo: string; tono: TonoFumetto; fino: number }>>({});
  const { squadra, apri } = usaSquadra();
  const timer = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timer.current.forEach(clearTimeout), []);

  // L'orologio della regia: niente più un giro ogni 400 ms. Si ridisegna solo quando scade qualcosa
  // (un fumetto, la festa, una nota), con un timer puntato alla prossima scadenza.
  const prossima = useMemo(() => {
    const scadenze = [
      ...(['claude', 'codex'] as const).flatMap((a) => [tr[a].parlaFino, tr[a].badge?.fino ?? 0, tr[a].cambio ?? 0]),
      nota?.fino ?? 0, utenteLanciaFino, festa.fino, festa.fino + 5000,
      ...Object.values(esitiSquadra).map((e) => e.fino),
    ].filter((t) => t > ora);
    return scadenze.length ? Math.min(...scadenze) : null;
  }, [tr, nota, utenteLanciaFino, festa, esitiSquadra, ora]);
  useEffect(() => {
    if (prossima === null) return;
    const t = setTimeout(() => setOra(Date.now()), Math.max(16, prossima - Date.now() + 20));
    return () => clearTimeout(t);
  }, [prossima]);

  const concluso = d?.stato === 'concluso';
  const inRiunione = riunioneAperta(d);
  // In produzione va solo ciò che si è deciso; il resto è un verbale.
  const decisione = !!d && (d.esito === 'accordo' || (d.sintesi?.testo.decisioni.length ?? 0) > 0);

  // Cambiando partita il fattorino torna a casa e il foglio della stampante si azzera.
  useEffect(() => {
    timer.current.forEach(clearTimeout);
    timer.current = [];
    setConsegna('casa');
    setConsegnato(null);
    onConsegna(null);
    return () => onConsegna(null);
  }, [d?.id, onConsegna]);

  const arrivoFattorino = useCallback(() => {
    setConsegna((f) => {
      if (f === 'va') {
        timer.current.push(setTimeout(() => setConsegna('porta'), 1200));
        return 'prende';
      }
      if (f === 'porta') {
        timer.current.push(setTimeout(() => {
          onNastro(decisione);
          timer.current.push(setTimeout(() => onConsegna(null), DURATA_NASTRO));
          setConsegna('rientra');
        }, 1200));
        return 'posa';
      }
      if (f === 'rientra') return 'casa';
      return f;
    });
  }, [onNastro, onConsegna, decisione]);

  // Effetti: si eseguono una volta e si segnano come consumati.
  useEffect(() => {
    if (!vista.effetti.length) return;
    const adesso = Date.now();
    setOra(adesso);
    for (const e of vista.effetti) {
      if (e.tipo === 'colpo') {
        const ultimo = vista.dibattito?.turni.at(-1);
        const parole = ultimo?.agente === e.da ? ultimo.risposta.messaggio.split(/\s+/).length : 120;
        const durata = Math.min(Math.max(parole * 45, 4000), 11000);
        setTr((p) => ({ ...p, [e.da]: { ...p[e.da], parlaFino: adesso + durata, badge: { testo: ETICHETTE_STATO[e.stato], tono: TONO_STATO[e.stato], fino: adesso + durata } } }));
      } else if (e.tipo === 'messaggio') {
        // In chat: chi ha appena risposto lo dice dalla scrivania, qualche secondo.
        const m = vista.dibattito?.chat?.findLast((x) => x.autore === e.agente);
        const durata = e.passa ? 3000 : Math.min(Math.max((m?.testo.split(/\s+/).length ?? 40) * 40, 3500), 8000);
        setTr((p) => ({ ...p, [e.agente]: { ...p[e.agente], parlaFino: adesso + durata, badge: { testo: e.passa ? 'Niente da aggiungere' : 'Ha risposto', tono: e.passa ? 'neutro' : 'accordo', fino: adesso + durata } } }));
      } else if (e.tipo === 'cambio') {
        setTr((p) => ({ ...p, [e.agente]: { ...p[e.agente], cambio: adesso + 5000 } }));
      } else if (e.tipo === 'nota') {
        setLancio((n) => n + 1);
        setUtenteLanciaFino(adesso + 1800);
        setNota({ testo: e.testo, fino: adesso + 7000 });
      } else if (e.tipo === 'esito') {
        if (e.esito === 'accordo') setFesta((f) => ({ fino: adesso + 4500, lancio: f.lancio + 1 }));
        // L'esito resta sopra le loro teste mentre tornano in Direzione.
        const badge = { testo: e.esito === 'accordo' ? 'Accordo' : ETICHETTE_ESITO[e.esito], tono: (e.esito === 'accordo' ? 'accordo' : e.esito === 'stallo' ? 'disaccordo' : 'neutro') as TonoFumetto, fino: adesso + (e.esito === 'accordo' ? 18000 : 9000) };
        setTr((p) => ({ claude: { ...p.claude, badge }, codex: { ...p.codex, badge } }));
        if (vista.dibattito) {
          onConsegna(vista.dibattito.id);
          setConsegnato(vista.dibattito.id);
        }
        setConsegna('va');
      } else if (e.tipo === 'rapporto') {
        setEsitiSquadra((p) => ({ ...p, [e.assistente]: { testo: e.ok ? 'Rapporto consegnato' : 'Incarico non riuscito', tono: e.ok ? 'accordo' : 'errore', fino: adesso + 5000 } }));
      }
      invia({ tipo: 'consumato', id: e.id });
    }
  }, [vista.effetti, vista.dibattito, invia, onConsegna]);

  // --- la squadra ------------------------------------------------------------------------------
  const catena = disp.catena;
  const lavori = chat ? [] : alLavoro(vista);
  const inAttesa = chat ? [] : inCoda(d);
  const assistenti: Assistente[] = [];
  disp.chiamati.forEach((id, ordine) => {
    const luogo = luogoDi(disp, id);
    if (!luogo) return; // oltre i posti dell'ufficio: solo nei pannelli
    const lavoro = lavori.find((l) => l.id === id);
    const coda = inAttesa.find((x) => x.assistente === id);
    const esito = esitiSquadra[id];
    const sullaCatena = luogo.dove !== 'ufficio';
    const lavora = sullaCatena ? catena.lavora?.id === id : !!lavoro && lavoro.tipo === 'incarico';
    const fumetti: FumettoDato[] = lavora ? [{ testo: `${luogo.dove === 'collaudo' ? 'Rivede' : 'Al lavoro'}: ${breve(lavoro?.cosa ?? catena.lavora?.cosa ?? '', 34)}`, tono: 'evidenza' }]
      : esito && esito.fino > ora ? [{ testo: esito.testo, tono: esito.tono }]
      // Sul telefono i fumetti di chi aspetta coprirebbero il cartellino di chi lavora.
      : coda && !ridotto ? [{ testo: `In coda: ${breve(coda.compito, 30)}`, tono: 'neutro' }]
      : [];
    const posa: Posa = luogo.dove === 'collaudo' ? (lavora ? 'lavora' : 'fermo') : lavora ? (luogo.scrivania ? 'scrive' : 'pensa') : 'seduto';
    assistenti.push({ id, luogo, posa, fumetti, lavora, priorita: lavora ? 3 : sullaCatena && catena.attiva ? 2 : coda ? 1 : 0, ordine });
  });
  const visibili = !ridotto ? assistenti : [...assistenti].sort((a, b) => b.priorita - a.priorita || b.ordine - a.ordine).slice(0, MAX_ASSISTENTI_RIDOTTO);

  // --- Claude e Codex --------------------------------------------------------------------------
  // Il posto di partenza è quello giusto per lo stato della partita: aprendo una riunione in corso
  // sono già al tavolo, aprendo una partita finita sono già in Direzione. Si cammina solo quando lo
  // stato cambia mentre la si guarda (fine riunione, collaudo).
  const rotte = useRef<{ partita: string | undefined; agenti: Record<Agente, { posto: Posto; percorso: Punto[] }> } | null>(null);
  const coda = chat ? inCodaChat(d, vista.parlante) : [];
  function bersaglio(a: Agente): { posto: Posto; posa: Posa; fumetto?: FumettoDato } {
    const f = vista.fase[a];
    const t = tr[a];
    const attivo = vista.parlante === a;
    const ruolo = attivo ? vista.ruolo : undefined;
    const badge = t.badge && t.badge.fino > ora ? { testo: t.badge.testo, tono: t.badge.tono } : undefined;
    // In chat la scrivania è casa sua: pensa, cerca e risponde da lì.
    if (chat) {
      if (f === 'errore') return { posto: 'scrivania', posa: 'errore', fumetto: { testo: 'Errore', tono: 'errore' } };
      if (attivo && f === 'strumento') return { posto: 'scrivania', posa: 'consulta', fumetto: { testo: vista.azione[a]?.testo ?? 'Consulta le note', tono: 'evidenza' } };
      if (attivo && f === 'risposta') return { posto: 'scrivania', posa: 'scrive', fumetto: { testo: 'ti scrive', tono: 'pensiero', puntini: true } };
      if (attivo) return { posto: 'scrivania', posa: 'pensa', fumetto: { testo: 'ci pensa', tono: 'pensiero', puntini: true } };
      if (t.parlaFino > ora) return { posto: 'scrivania', posa: 'parla_seduto', fumetto: badge };
      if (coda.includes(a)) return { posto: 'scrivania', posa: 'seduto', fumetto: { testo: 'risponde dopo', tono: 'neutro' } };
      return { posto: 'scrivania', posa: 'seduto' };
    }
    // Fuori dalla riunione: la festa in sala se c'è appena stato l'accordo, il collaudo per Codex,
    // altrimenti la propria scrivania in Direzione. Un errore lo si mostra dove l'agente si trova.
    if (!inRiunione) {
      if (f === 'errore') return { posto: rotte.current && rotte.current.partita === d?.id ? rotte.current.agenti[a].posto : 'scrivania', posa: 'errore', fumetto: { testo: 'Errore', tono: 'errore' } };
      if (d?.esito === 'accordo' && festa.fino > ora) return { posto: 'centro', posa: 'festeggia', fumetto: { testo: 'Accordo!', tono: 'accordo' } };
      if (d?.esito === 'accordo' && festa.fino + 5000 > ora) return { posto: 'centro', posa: 'stretta', fumetto: { testo: 'Accordo!', tono: 'accordo' } };
      if (a === 'codex' && catena.codex) {
        const rivede = catena.lavora ? chiE(squadra, catena.lavora.id).nome : null;
        return { posto: 'collaudo', posa: rivede ? 'fermo' : 'lavora', fumetto: rivede ? { testo: `aspetta ${rivede}`, tono: 'neutro' } : { testo: 'Collauda i file', tono: 'pensiero', puntini: true } };
      }
      if (attivo) return { posto: 'scrivania', posa: f === 'risposta' ? 'scrive' : 'pensa', fumetto: { testo: 'ci pensa', tono: 'pensiero', puntini: true } };
      return { posto: 'scrivania', posa: 'seduto', fumetto: badge };
    }
    // La riunione: tutto al tavolo della sala, pensare compreso (il portatile si accende).
    if (f === 'errore') return { posto: 'tavolo', posa: 'errore', fumetto: { testo: 'Errore', tono: 'errore' } };
    if (attivo) {
      if (f === 'strumento') return { posto: 'tavolo', posa: 'consulta', fumetto: { testo: vista.azione[a]?.testo ?? 'Consulta le note', tono: 'evidenza' } };
      if (f === 'risposta') {
        const cosa = ruolo === 'sintesi' ? 'scrive la sintesi' : ruolo === 'verifica' ? 'verifica la sintesi' : 'scrive l\'intervento';
        return { posto: 'tavolo', posa: 'scrive', fumetto: { testo: cosa, tono: 'pensiero', puntini: true } };
      }
      const cosa = ruolo === 'sintesi' ? 'pensa alla sintesi' : ruolo === 'verifica' ? 'rilegge la sintesi' : 'ci pensa';
      return { posto: 'tavolo', posa: 'pensa', fumetto: { testo: cosa, tono: 'pensiero', puntini: true } };
    }
    if (t.parlaFino > ora) return { posto: 'tavolo', posa: 'parla', fumetto: badge };
    if (d?.stato === 'in_pausa') return { posto: 'tavolo', posa: 'seduto', fumetto: { testo: 'in pausa', tono: 'neutro' } };
    // Un assistente lavora a un incarico che ha chiesto lui: resta al tavolo e aspetta il rapporto.
    const aspetta = lavori.find((l) => l.tipo === 'incarico' && l.da === a);
    if (aspetta) return { posto: 'tavolo', posa: 'seduto', fumetto: { testo: `aspetta ${chiE(squadra, aspetta.id).nome}`, tono: 'neutro' } };
    return { posto: 'tavolo', posa: 'seduto' };
  }

  const bersagli = { claude: bersaglio('claude'), codex: bersaglio('codex') };
  if (!rotte.current || rotte.current.partita !== d?.id) {
    rotte.current = { partita: d?.id, agenti: { claude: { posto: bersagli.claude.posto, percorso: [] }, codex: { posto: bersagli.codex.posto, percorso: [] } } };
  }
  const tappe = rotte.current.agenti;
  const agenti = (['claude', 'codex'] as const).map((a) => {
    const b = bersagli[a];
    const r = tappe[a];
    if (b.posto !== r.posto) tappe[a] = { posto: b.posto, percorso: percorso(a, r.posto, b.posto) };
    const fumetti: FumettoDato[] = [];
    if ((tr[a].cambio ?? 0) > ora) fumetti.push({ testo: 'Cambio di posizione', tono: 'evidenza' });
    if (b.fumetto) fumetti.push(b.fumetto);
    // Per parlare si alza e sta accanto alla sedia, non dentro.
    const inPiedi = tappe[a].posto === 'tavolo' && b.posa === 'parla';
    return { a, b, rotta: tappe[a], fumetti, inPiedi };
  });
  const utenteLancia = utenteLanciaFino > ora;
  const notaVisibile = nota && nota.fino > ora ? nota.testo : undefined;
  const fattorino = useMemo(() => rottaFattorino(consegna), [consegna]);
  const destinazioni = useMemo(() => {
    const di = (a: Agente) => ({ tavolo: posizioneDi(a, 'tavolo'), piedi: posizioneDi(a, 'tavolo', true), scrivania: posizioneDi(a, 'scrivania'), centro: posizioneDi(a, 'centro'), collaudo: posizioneDi(a, 'collaudo') });
    return { claude: di('claude'), codex: di('codex') };
  }, []);
  const fattorinoPorta = consegna === 'prende' || consegna === 'porta' || consegna === 'posa';

  // L'etichetta della scatola del lavoro sulla catena: la stazione e chi ci lavora.
  const prod = d?.produzione;
  const s = catena.scatola;
  const chiLavora = catena.lavora ? chiE(squadra, catena.lavora.id) : undefined;
  const nomeStazione = s ? (s.stazione === 2 ? `${STAZIONI[2].nome} ${catena.pacchetti.filter((x) => x.stato === 'fatto').length}/${catena.pacchetti.length}` : STAZIONI[s.stazione].nome) : '';
  // Chi lavora ha già il suo fumetto (l'assistente alla postazione, Codex al banco): la scatola
  // dice solo la stazione, e parla da sola a lavoro finito o fermo.
  const fumettoScatola: FumettoDato | null = !prod || !s ? null
    : s.tono === 'pronta' ? { testo: 'Consegna pronta', tono: 'accordo' }
    : s.tono === 'rivedere' ? { testo: 'Consegna da rivedere', tono: 'disaccordo' }
    : s.tono === 'errore' ? { testo: 'Produzione ferma per un errore', tono: 'errore' }
    : s.tono === 'ferma' ? { testo: 'Produzione fermata', tono: 'neutro' }
    : catena.lavora || catena.codex ? null
    : { testo: 'In attesa', tono: 'neutro' };
  const coloreScatola = chiLavora ? coloreAgente(chiLavora.id) : s?.stazione === 3 ? COLORE_AGENTE.codex : COLORI.linea;

  const dati: DatoEtichetta[] = [
    ...agenti.map(({ a, fumetti }) => ({ id: a, nome: NOME[a], colore: COLORE_AGENTE[a], fumetti })),
    { id: 'utente', nome: 'Tu', colore: COLORI.utente, fumetti: utenteLancia ? [{ testo: chat ? 'Scrive in chat' : 'Nota per la sala', tono: 'evidenza' as const }] : [] },
    ...(fattorinoPorta ? [{ id: 'fattorino', nome: 'Produzione', colore: COLORI.linea, fumetti: [{ testo: decisione ? 'Decisione da costruire' : 'Verbale in archivio', tono: 'evidenza' as const }] }] : []),
    ...(notaVisibile ? [{ id: 'nota', fumetti: [], nota: notaVisibile.length > 140 ? `${notaVisibile.slice(0, 140)}…` : notaVisibile, titoloNota: chat ? 'Hai scritto' : 'La tua nota' }] : []),
    ...(prod && s ? [{ id: 'cantiere', nome: nomeStazione, colore: coloreScatola, fumetti: fumettoScatola ? [fumettoScatola] : [] }] : []),
    ...visibili.map((x): DatoEtichetta => {
      const chi = chiE(squadra, x.id);
      return {
        id: `a:${x.id}`,
        assistente: x.id,
        nome: chi.nome,
        colore: coloreAgente(x.id),
        fumetti: x.fumetti,
        ...(chi.membro ? { livello: chi.membro.livello.livello, xp: Math.round(avanzamento(chi.membro) * 50) / 50 } : {}),
      };
    }),
  ];
  const firma = JSON.stringify(dati);
  useEffect(() => {
    onEtichette(JSON.parse(firma) as DatoEtichetta[]);
  }, [firma, onEtichette]);

  const ancore = useMemo(() => {
    const per = (id: string) => (o: THREE.Object3D | null) => {
      if (o) registro.ancore.set(id, o);
      else registro.ancore.delete(id);
    };
    // Una funzione per assistente, sempre la stessa: Personaggio riaggancia l'etichetta se cambia.
    const perAssistente = new Map<string, (o: THREE.Object3D | null) => void>();
    const assistente = (id: string) => {
      let f = perAssistente.get(id);
      if (!f) perAssistente.set(id, (f = per(`a:${id}`)));
      return f;
    };
    return { claude: per('claude'), codex: per('codex'), utente: per('utente'), nota: per('nota'), fattorino: per('fattorino'), assistente };
  }, [registro]);
  const clic = useMemo(() => ({ claude: () => onAgente?.('claude'), codex: () => onAgente?.('codex') }), [onAgente]);
  const clicAssistente = useRef(new Map<string, () => void>());
  const apriAssistente = (id: string) => {
    if (!apri) return undefined;
    let f = clicAssistente.current.get(id);
    if (!f) clicAssistente.current.set(id, (f = () => apri(id)));
    return f;
  };

  return (
    <group>
      <SchermiVivi vista={vista} />
      {agenti.map(({ a, b, rotta, inPiedi }) => (
        // Una partita nuova li rimette al loro posto (niente traversate da una partita all'altra).
        <Personaggio
          key={`${a}-${d?.id ?? ''}`}
          nome={a}
          modello={MODELLO[a]}
          inizio={destinazioni[a][rotta.posto].punto}
          percorso={rotta.percorso}
          destinazione={inPiedi ? destinazioni[a].piedi : destinazioni[a][rotta.posto]}
          posa={b.posa}
          onClick={onAgente ? clic[a] : undefined}
          ancora={ancore[a]}
        />
      ))}
      <Personaggio
        nome="utente"
        modello="male-d"
        inizio={UFFICIO_UTENTE.sedia}
        percorso={NESSUNO}
        destinazione={DESTINAZIONE_UTENTE}
        posa={utenteLancia ? 'lancia' : vista.inCorso && !chat ? 'scrive' : 'seduto'}
        ancora={ancore.utente}
        economico={ridotto}
      />
      <Personaggio
        nome="fattorino"
        modello="worker"
        inizio={FATTORINO.casa}
        percorso={fattorino.percorso}
        destinazione={fattorino.destinazione}
        posa={fattorino.posa}
        velocita={2}
        ancora={ancore.fattorino}
        onArrivo={arrivoFattorino}
        economico={ridotto}
      />
      {/* Un tecnico agli armadi server: solo con la grafica piena. */}
      {!ridotto && <Personaggio nome="tecnico" modello="worker" inizio={TECNICO.punto} percorso={NESSUNO} destinazione={TECNICO} posa="fermo" />}
      {visibili.map((x) => (
        // La chiave cambia con il posto (reparto compreso): passando dall'ufficio alla catena, o da un
        // reparto all'altro quando arrivano le info, l'omino ricompare lì invece di attraversare muri e mobili.
        <Personaggio
          key={`${x.id}-${x.luogo.dove}-${x.luogo.reparto ?? ''}-${x.luogo.indice}`}
          nome={`assistente-${x.id}`}
          modello={modelloDi(x.id)}
          inizio={x.luogo.punto}
          percorso={NESSUNO}
          destinazione={x.luogo}
          posa={x.posa}
          colore={coloreAgente(x.id)}
          onClick={apriAssistente(x.id)}
          ancora={ancore.assistente(x.id)}
          economico={ridotto}
        />
      ))}
      <group ref={ancore.nota} position={[TAVOLO.centro[0], 1.6, TAVOLO.centro[1]]} />
      <AereoDiCarta lancio={lancio} />
      <Coriandoli lancio={festa.lancio} ridotto={ridotto} />
      {/* Il foglio aspetta in stampante finché il fattorino non lo prende. */}
      <FoglioStampante pronto={concluso && (consegna === 'casa' ? consegnato !== d?.id : consegna === 'va')} />
    </group>
  );
}

const NESSUNO: Punto[] = [];
const DESTINAZIONE_UTENTE = { punto: UFFICIO_UTENTE.sedia, verso: 0 };
// Il tecnico controlla la fila di armadi più vicina alla linea.
const TECNICO = { punto: [-14.5, -9.85] as Punto, verso: Math.PI };
