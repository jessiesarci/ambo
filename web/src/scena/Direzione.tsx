// La regia: dallo stato della partita decide dove va ciascun omino, che posa prende e che fumetto
// ha sopra la testa. Gestisce gli effetti a tempo (colpi, cambi di posizione, note, esito) e la
// consegna: il documento passa dall'ufficio (decisioni) al magazzino (produzione).
import { useFrame } from '@react-three/fiber';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { NOME, type Agente, type StatoDichiarato } from '../../../motore/tipi.ts';
import { ETICHETTE_ESITO, ETICHETTE_STATO, inCodaChat, type Azione, type Vista } from '../stato.ts';
import { AereoDiCarta, Coriandoli, FoglioStampante } from './Effetti.tsx';
import type { DatoEtichetta, FumettoDato, RegistroEtichette } from './Etichette.tsx';
import type { TonoFumetto } from './Fumetti.tsx';
import { Personaggio, type ModelloPersonaggio, type Posa } from './Personaggio.tsx';
import { COLORE_AGENTE, COLORI, FATTORINO, LINEA, percorso, posizioneDi, TAVOLO, UFFICIO_UTENTE, type Posto, type Punto } from './pianta.ts';

const TONO_STATO: Record<StatoDichiarato, TonoFumetto> = { proposta: 'parla', accordo: 'accordo', accordo_parziale: 'parziale', disaccordo: 'disaccordo' };
// Kenney Mini Characters: Claude in tailleur coi capelli arancioni, Codex con la maglia verde acqua.
const MODELLO: Record<Agente, ModelloPersonaggio> = { claude: 'female-d', codex: 'male-f' };
// Tempo che la scatola impiega a percorrere il nastro (0,9 m/s, come in Produzione.tsx).
const DURATA_NASTRO = ((LINEA.da - LINEA.a) / 0.9) * 1000;

interface Transitorio {
  parlaFino: number;
  badge?: { testo: string; tono: TonoFumetto; fino: number };
  cambio?: number;
}

// Materiali dei monitor delle scrivanie: si accendono del colore dell'agente quando ragiona.
export function usaSchermi() {
  return useMemo(() => ({
    claude: new THREE.MeshStandardMaterial({ color: '#0b0c0e', emissive: '#1d1f22', emissiveIntensity: 0.6, roughness: 0.3 }),
    codex: new THREE.MeshStandardMaterial({ color: '#0b0c0e', emissive: '#1d1f22', emissiveIntensity: 0.6, roughness: 0.3 }),
    utente: new THREE.MeshStandardMaterial({ color: '#0b0c0e', emissive: '#b5f900', emissiveIntensity: 0.35, roughness: 0.3 }),
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
      if (f === 'ragionamento' || f === 'risposta') {
        m.emissive.copy(c.set(COLORE_AGENTE[a]));
        m.emissiveIntensity = 1.1 + Math.sin(t * 5) * 0.5;
      } else if (f === 'strumento') {
        // Mentre cerca nelle note lo schermo lampeggia di lime, più veloce.
        m.emissive.copy(c.set(COLORI.linea));
        m.emissiveIntensity = 1.2 + Math.sin(t * 11) * 0.6;
      } else if (f === 'errore') {
        m.emissive.copy(c.set(COLORI.errore));
        m.emissiveIntensity = Math.sin(t * 8) > 0 ? 1.6 : 0.3;
      } else {
        m.emissive.copy(c.set('#1d1f22'));
        m.emissiveIntensity = 0.6;
      }
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
    case 'prende': return { percorso: [], destinazione: { punto: FATTORINO.stampante, verso: Math.PI }, posa: 'porta' };
    case 'porta': return { percorso: FATTORINO.versoNastro, destinazione: { punto: FATTORINO.nastro, verso: Math.PI }, posa: 'porta' };
    case 'posa': return { percorso: [], destinazione: { punto: FATTORINO.nastro, verso: Math.PI }, posa: 'porta' };
    case 'rientra': return { percorso: [], destinazione: { punto: FATTORINO.casa, verso: Math.PI / 2 }, posa: 'fermo' };
    default: return { percorso: [], destinazione: { punto: FATTORINO.casa, verso: Math.PI / 2 }, posa: 'fermo' };
  }
}

export function Direzione({ vista, invia, ridotto, onAgente, registro, onEtichette, onConsegna, onNastro }: {
  vista: Vista;
  invia: (a: Azione) => void;
  ridotto: boolean;
  onAgente?: (a: Agente) => void;
  registro: RegistroEtichette;
  onEtichette: (d: DatoEtichetta[]) => void;
  onConsegna: (id: string | null) => void; // la scatola di questa partita è in viaggio, non ancora sullo scaffale
  onNastro: (decisione: boolean) => void; // fa partire la scatola sul nastro
}) {
  const [ora, setOra] = useState(() => Date.now());
  const [tr, setTr] = useState<Record<Agente, Transitorio>>({ claude: { parlaFino: 0 }, codex: { parlaFino: 0 } });
  const [lancio, setLancio] = useState(0);
  const [nota, setNota] = useState<{ testo: string; fino: number } | null>(null);
  const chat = vista.dibattito?.config.tipo === 'chat';
  const [utenteLanciaFino, setUtenteLanciaFino] = useState(0);
  const [festa, setFesta] = useState({ fino: 0, lancio: 0 });
  const [consegna, setConsegna] = useState<FaseConsegna>('casa');
  const [consegnato, setConsegnato] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const t = setInterval(() => setOra(Date.now()), 400);
    return () => {
      clearInterval(t);
      timer.current.forEach(clearTimeout);
    };
  }, []);

  const d = vista.dibattito;
  const concluso = d?.stato === 'concluso';
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
        if (vista.dibattito) {
          onConsegna(vista.dibattito.id);
          setConsegnato(vista.dibattito.id);
        }
        setConsegna('va');
      }
      invia({ tipo: 'consumato', id: e.id });
    }
  }, [vista.effetti, vista.dibattito, invia, onConsegna]);

  const rotte = useRef<Record<Agente, { posto: Posto; percorso: Punto[] }>>({ claude: { posto: 'tavolo', percorso: [] }, codex: { posto: 'tavolo', percorso: [] } });

  // Dove sta ciascuno e cosa fa. Regola di fondo: chi lavora resta alla sua scrivania finché non ha
  // finito (pensa, consulta le note, scrive), qualunque cosa faccia nel frattempo; al tavolo si va
  // solo per presentare il turno di una partita. In chat la scrivania è casa sua.
  const coda = chat ? inCodaChat(d, vista.parlante) : [];
  const casa: Posto = chat ? 'scrivania' : 'tavolo';
  function bersaglio(a: Agente): { posto: Posto; posa: Posa; fumetto?: FumettoDato } {
    const f = vista.fase[a];
    const t = tr[a];
    const attivo = vista.parlante === a;
    const ruolo = attivo ? vista.ruolo : undefined;
    if (!chat && (concluso || f === 'conclusione')) {
      const esito = d?.esito;
      if (esito === 'accordo') {
        if (festa.fino > ora) return { posto: 'centro', posa: 'festeggia', fumetto: { testo: 'Accordo!', tono: 'accordo' } };
        if (festa.fino + 5000 > ora) return { posto: 'centro', posa: 'stretta', fumetto: { testo: 'Accordo!', tono: 'accordo' } };
        return { posto: 'tavolo', posa: 'seduto', fumetto: { testo: 'Accordo', tono: 'accordo' } };
      }
      return { posto: 'tavolo', posa: 'seduto', fumetto: esito ? { testo: ETICHETTE_ESITO[esito], tono: esito === 'stallo' ? 'disaccordo' : 'neutro' } : undefined };
    }
    if (f === 'errore') return { posto: rotte.current[a].posto, posa: 'errore', fumetto: { testo: 'Errore', tono: 'errore' } };
    if (attivo) {
      if (f === 'strumento') return { posto: 'scrivania', posa: 'consulta', fumetto: { testo: vista.azione[a]?.testo ?? 'Consulta le note', tono: 'evidenza' } };
      if (f === 'risposta') {
        const cosa = chat ? 'ti scrive' : ruolo === 'sintesi' ? 'scrive la sintesi' : ruolo === 'verifica' ? 'verifica la sintesi' : 'scrive il turno';
        return { posto: 'scrivania', posa: 'scrive', fumetto: { testo: cosa, tono: 'pensiero', puntini: true } };
      }
      const cosa = ruolo === 'sintesi' ? 'pensa alla sintesi' : ruolo === 'verifica' ? 'rilegge la sintesi' : 'ci pensa';
      return { posto: 'scrivania', posa: 'pensa', fumetto: { testo: cosa, tono: 'pensiero', puntini: true } };
    }
    if (t.parlaFino > ora) {
      const badge = t.badge && t.badge.fino > ora ? { testo: t.badge.testo, tono: t.badge.tono } : undefined;
      return chat ? { posto: 'scrivania', posa: 'parla_seduto', fumetto: badge } : { posto: 'tavolo', posa: 'parla', fumetto: badge };
    }
    if (coda.includes(a)) return { posto: casa, posa: 'seduto', fumetto: { testo: 'risponde dopo', tono: 'neutro' } };
    if (d?.stato === 'in_pausa') return { posto: 'tavolo', posa: 'seduto', fumetto: { testo: 'in pausa', tono: 'neutro' } };
    return { posto: casa, posa: 'seduto' };
  }

  const agenti = (['claude', 'codex'] as const).map((a) => {
    const b = bersaglio(a);
    const r = rotte.current[a];
    if (b.posto !== r.posto) rotte.current[a] = { posto: b.posto, percorso: percorso(a, r.posto, b.posto) };
    const fumetti: FumettoDato[] = [];
    if ((tr[a].cambio ?? 0) > ora) fumetti.push({ testo: 'Cambio di posizione', tono: 'evidenza' });
    if (b.fumetto) fumetti.push(b.fumetto);
    // Per parlare si alza e sta accanto alla sedia, non dentro.
    const inPiedi = rotte.current[a].posto === 'tavolo' && b.posa === 'parla';
    return { a, b, rotta: rotte.current[a], fumetti, inPiedi };
  });
  const utenteLancia = utenteLanciaFino > ora;
  const notaVisibile = nota && nota.fino > ora ? nota.testo : undefined;
  const fattorino = useMemo(() => rottaFattorino(consegna), [consegna]);
  const destinazioni = useMemo(() => ({
    claude: { tavolo: posizioneDi('claude', 'tavolo'), piedi: posizioneDi('claude', 'tavolo', true), scrivania: posizioneDi('claude', 'scrivania'), centro: posizioneDi('claude', 'centro') },
    codex: { tavolo: posizioneDi('codex', 'tavolo'), piedi: posizioneDi('codex', 'tavolo', true), scrivania: posizioneDi('codex', 'scrivania'), centro: posizioneDi('codex', 'centro') },
  }), []);
  const fattorinoPorta = consegna === 'prende' || consegna === 'porta' || consegna === 'posa';

  // Il cantiere al banco del magazzino: compare quando la decisione è in produzione.
  const prod = d?.produzione;
  const cantiereAttivo = prod?.stato === 'in_lavorazione' || prod?.stato === 'collaudo';
  const fumettoCantiere: FumettoDato | null = !prod ? null
    : prod.stato === 'in_lavorazione' ? { testo: 'Claude costruisce', tono: 'pensiero', puntini: true }
    : prod.stato === 'collaudo' ? { testo: 'Collaudo di Codex', tono: 'pensiero', puntini: true }
    : prod.stato === 'pronta' ? (prod.collaudo?.approvato ? { testo: 'Consegna pronta', tono: 'accordo' } : { testo: 'Consegna da rivedere', tono: 'disaccordo' })
    : prod.stato === 'errore' ? { testo: 'Produzione ferma', tono: 'errore' }
    : null;

  const dati: DatoEtichetta[] = [
    ...agenti.map(({ a, fumetti }) => ({ id: a, nome: NOME[a], colore: COLORE_AGENTE[a], fumetti })),
    { id: 'utente', nome: 'Tu', colore: COLORI.utente, fumetti: utenteLancia ? [{ testo: chat ? 'Scrive in chat' : 'Nota per la sala', tono: 'evidenza' as const }] : [] },
    ...(fattorinoPorta ? [{ id: 'fattorino', nome: 'Produzione', colore: COLORI.linea, fumetti: [{ testo: decisione ? 'Decisione da costruire' : 'Verbale in archivio', tono: 'evidenza' as const }] }] : []),
    ...(notaVisibile ? [{ id: 'nota', fumetti: [], nota: notaVisibile.length > 140 ? `${notaVisibile.slice(0, 140)}…` : notaVisibile, titoloNota: chat ? 'Hai scritto' : 'La tua nota' }] : []),
    ...(fumettoCantiere ? [{ id: 'cantiere', nome: prod?.stato === 'collaudo' ? 'Collaudo' : 'Cantiere', colore: prod?.stato === 'collaudo' ? COLORE_AGENTE.codex : COLORE_AGENTE.claude, fumetti: [fumettoCantiere] }] : []),
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
    return { claude: per('claude'), codex: per('codex'), utente: per('utente'), nota: per('nota'), fattorino: per('fattorino'), cantiere: per('cantiere') };
  }, [registro]);

  return (
    <group>
      <SchermiVivi vista={vista} />
      {agenti.map(({ a, b, rotta, inPiedi }) => (
        <Personaggio
          key={a}
          nome={a}
          modello={MODELLO[a]}
          inizio={destinazioni[a].tavolo.punto}
          percorso={rotta.percorso}
          destinazione={inPiedi ? destinazioni[a].piedi : destinazioni[a][rotta.posto]}
          posa={b.posa}
          onClick={onAgente ? () => onAgente(a) : undefined}
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
      />
      <Comparse ridotto={ridotto} />
      {prod && (
        <Personaggio nome="cantiere" modello="female-f" inizio={BANCO.punto} percorso={NESSUNO} destinazione={BANCO} posa={cantiereAttivo ? 'scrive' : 'seduto'} ancora={ancore.cantiere} />
      )}
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
// Seduto alla postazione del cantiere, nell'officina (la sedia della scrivania a -5,2; -7,6).
const BANCO = { punto: [-5.2, -6.78] as Punto, verso: Math.PI };

// Comparse: danno vita all'edificio, ma stanno ai loro posti e lavorano. Prima giravano in tondo
// attraversando la sala, e si confondevano con Claude e Codex.
const POSTI_COLLEGHI: { nome: string; modello: ModelloPersonaggio; punto: Punto; verso: number }[] = [
  { nome: 'collega-1', modello: 'male-e', punto: [19.5, -10.38], verso: Math.PI },
  { nome: 'collega-2', modello: 'female-b', punto: [20.92, -12.78], verso: 0 },
  { nome: 'collega-4', modello: 'female-e', punto: [3.58, -12.78], verso: 0 },
];
const SEDUTI = POSTI_COLLEGHI.map((s) => ({ ...s, destinazione: { punto: s.punto, verso: s.verso } }));
// In officina uno controlla gli armadi, uno sta alla banchina: fermi, al loro posto.
const IN_PIEDI: { nome: string; modello: ModelloPersonaggio; punto: Punto; verso: number }[] = [
  { nome: 'tecnico-1', modello: 'worker', punto: [-14.5, -9.85], verso: Math.PI },
  { nome: 'tecnico-2', modello: 'male-b', punto: [-12, 10.7], verso: 0 },
];

function Comparse({ ridotto }: { ridotto: boolean }) {
  return (
    <group>
      {SEDUTI.map((s) => (
        <Personaggio key={s.nome} nome={s.nome} modello={s.modello} inizio={s.punto} percorso={NESSUNO} destinazione={s.destinazione} posa="scrive" />
      ))}
      {!ridotto && IN_PIEDI.map((s) => (
        <Personaggio key={s.nome} nome={s.nome} modello={s.modello} inizio={s.punto} percorso={NESSUNO} destinazione={{ punto: s.punto, verso: s.verso }} posa="fermo" />
      ))}
    </group>
  );
}
