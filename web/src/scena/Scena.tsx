// La tela 3D: luce, telecamera da diorama, edificio a reparti, catena di montaggio, omini ed effetti.
// Luce, basamento e tavolo stanno in Ambiente.tsx; occlusione, bagliore e tone mapping finale in
// Resa.tsx, solo con la grafica piena. Tone mapping Khronos PBR Neutral: tiene il bianco bianco e il
// lime lime.
// Grafica ridotta (telefono, o un PC che fatica): niente Resa, ombre aggiornate poche
// volte al secondo, al massimo 4 assistenti animati, animazioni ferme a 15 fotogrammi. Se il PC
// rallenta molto, o il browser perde il contesto WebGL, la tela si rifà da sola in modalità ridotta.
import { PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { Agente } from '../../../motore/tipi.ts';
import { coloreAgente } from '../avatar.ts';
import { alLavoro, chiE, usaSquadra } from '../squadra.ts';
import type { Azione, Vista } from '../stato.ts';
import { Basamento, Luci, SFONDO } from './Ambiente.tsx';
import { ContestoSchermi, Direzione, usaSchermi } from './Direzione.tsx';
import { Edificio, type ScatolaArchivio } from './Edificio.tsx';
import { creaRegistro, LivelloEtichette, Proiettore, type DatoEtichetta, type RegistroEtichette } from './Etichette.tsx';
import { posizioneDi, type IdReparto, type Punto } from './pianta.ts';
import { Produzione } from './Produzione.tsx';
import { datiLavagna, disposizione, luogoDi, riunioneAperta, type Disposizione, type InfoAgente } from './reparti.ts';
import { Reparti, type PostoAcceso } from './Reparti.tsx';
import { Resa } from './Resa.tsx';
import { Schermo } from './Schermo.tsx';
import { Telecamera, type Inquadratura } from './Telecamera.tsx';

export interface PropsScena {
  vista: Vista;
  invia: (a: Azione) => void;
  archivio: ScatolaArchivio[];
  segui: boolean;
  inquadratura: Inquadratura;
  onScatola?: (id: string) => void;
  onStampante?: () => void;
  onAgente?: (a: Agente) => void;
  pausa?: boolean; // coperta da un'altra schermata: niente disegno, niente batteria consumata
  margineSinistro?: number; // px coperti a sinistra dalla chat
}

type Qualita = 'alta' | 'bassa';

// Fotogrammi lunghi (oltre 250 ms, il segno di un PC in affanno o di una scheda video al limite): tre
// in 10 secondi e si passa alla grafica ridotta, senza aspettare le medie del PerformanceMonitor (che
// con un fotogramma ogni due secondi ci metterebbe un minuto). Si ignorano i primi secondi
// (compilazione degli shader) e le pause del browser: con la scheda nascosta o la finestra coperta
// (Alt+Tab su Windows) il disegno si ferma e il primo fotogramma al ritorno sembra lunghissimo. Per
// questo non conta niente finché la finestra non è visibile e in primo piano, scarta il fotogramma a
// cavallo di ogni cambio e riparte da zero quando l'orologio della tela si azzera (pausa tolta).
function Sentinella({ onLenta }: { onLenta: () => void }) {
  const lunghi = useRef<number[]>([]);
  const ultimo = useRef<number | null>(null);
  const davanti = useRef(typeof document === 'undefined' || document.hasFocus());
  useEffect(() => {
    const cambio = () => {
      davanti.current = document.hasFocus();
      ultimo.current = null;
    };
    const via = () => {
      davanti.current = false;
      ultimo.current = null;
    };
    document.addEventListener('visibilitychange', cambio);
    window.addEventListener('focus', cambio);
    window.addEventListener('blur', via);
    return () => {
      document.removeEventListener('visibilitychange', cambio);
      window.removeEventListener('focus', cambio);
      window.removeEventListener('blur', via);
    };
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ultimo.current !== null && t < ultimo.current) {
      lunghi.current = [];
      ultimo.current = null;
    }
    const dt = ultimo.current === null ? 0 : t - ultimo.current;
    ultimo.current = t;
    if (!davanti.current || document.visibilityState !== 'visible') return;
    if (t < 6 || dt < 0.25 || dt > 3) return;
    lunghi.current = [...lunghi.current.filter((x) => t - x < 10), t];
    if (lunghi.current.length >= 3) {
      lunghi.current = [];
      onLenta();
    }
  });
  return null;
}

// Un errore della tela (il contesto WebGL che non arriva più, un modello che non si carica) si ferma
// qui: senza, React smonterebbe tutta la pagina, chat e pannelli compresi.
class ProtezioneTela extends Component<{ children: ReactNode; onErrore: () => void }, { rotta: boolean }> {
  state = { rotta: false };
  static getDerivedStateFromError() {
    return { rotta: true };
  }
  componentDidCatch() {
    this.props.onErrore();
  }
  render() {
    return this.state.rotta ? null : this.props.children;
  }
}

// Prima di rifare la tela: il browser dà ancora un contesto WebGL 2? Dopo un reset della scheda video
// attribuito alla pagina, Chrome blocca il 3D del sito fino al ricaricamento. Il contesto di prova si
// libera subito (i contesti aperti sono pochi).
function webglDisponibile(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ok = !!gl && !gl.isContextLost();
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

// Al posto della tela quando il 3D non c'è più: lo sfondo della scena e due righe. Chat, pannelli e
// comandi restano quelli di sempre.
function SenzaGrafica({ margine }: { margine?: number }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6" style={{ background: SFONDO, paddingLeft: (margine ?? 0) + 24 }}>
      <div className="pannello max-w-xs p-4 text-center" role="status">
        <p className="font-titolo text-[15px] font-bold">Grafica 3D non disponibile</p>
        <p className="mt-1 text-[13px] text-grafite">Il browser non dà più la scheda video a questa pagina. Chat e pannelli funzionano lo stesso.</p>
        <button type="button" className="tasto mt-3" onClick={() => window.location.reload()}>Ricarica la pagina</button>
      </div>
    </div>
  );
}

const NESSUNA_ETICHETTA: DatoEtichetta[] = [];

export function Scena(p: PropsScena) {
  const telefono = typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760);
  const movimentoRidotto = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Solo in sviluppo: ?qualita=alta|bassa la fissa (misure e catture ripetibili, senza controlli automatici).
  const forzata = import.meta.env.DEV ? (new URLSearchParams(window.location.search).get('qualita') as Qualita | null) : null;
  const [qualita, setQualita] = useState<Qualita>(forzata ?? (telefono ? 'bassa' : 'alta'));
  // La tela si rifà da capo quando cambia la qualità (l'antialias si sceglie solo creandola) o quando
  // il browser perde il contesto WebGL. In due tempi: prima si smonta, poi dopo un attimo se ne crea una
  // nuova. Smontata e rifatta nello stesso istante, la nuova restava vuota e ferma (provato: è proprio
  // il "blocco" che si vede, perché la vecchia viene chiusa da @react-three/fiber mezzo secondo dopo).
  const [tela, setTela] = useState(0);
  const [montata, setMontata] = useState(true);
  // Il 3D non c'è più (il browser non dà un contesto, o la tela si è rotta troppe volte di fila): al
  // suo posto un riquadro, fino al ricaricamento.
  const [spenta, setSpenta] = useState(false);
  const ridotto = qualita === 'bassa';
  if (import.meta.env.DEV) (window as unknown as { __qualita?: string }).__qualita = qualita;
  const rifacendo = useRef(false);
  const rifatte = useRef<number[]>([]);
  const rifai = useCallback(() => {
    if (rifacendo.current) return;
    rifacendo.current = true;
    setMontata(false);
    setTimeout(() => {
      rifacendo.current = false;
      // Al massimo due rifacimenti al minuto: un contesto che si riperde subito non fa girare la pagina
      // a vuoto, ricaricando ogni volta modelli e shader.
      const adesso = Date.now();
      rifatte.current = rifatte.current.filter((x) => adesso - x < 60_000);
      if (rifatte.current.length >= 2 || !webglDisponibile()) {
        setSpenta(true);
        return;
      }
      rifatte.current.push(adesso);
      setQualita('bassa');
      setTela((n) => n + 1);
      setMontata(true);
    }, 900);
  }, []);
  // Si passa alla grafica ridotta fuori dal giro di disegno (PerformanceMonitor e Sentinella chiamano
  // da dentro useFrame), e una volta sola.
  const abbassa = useCallback(() => {
    setTimeout(() => {
      if (qualitaRef.current === 'alta') rifai();
    }, 0);
  }, [rifai]);
  const qualitaRef = useRef(qualita);
  qualitaRef.current = qualita;

  // Il browser può togliere il contesto WebGL (memoria della scheda video finita, driver riavviato):
  // la tela resterebbe ferma finché non si ricarica la pagina. Qui si rifà da sola, in modalità ridotta.
  // Conta solo la tela in pagina: anche @react-three/fiber, chiudendo quella vecchia, ne fa perdere il
  // contesto, e con il PC sotto sforzo l'evento arriva quando la nuova è già montata (provato: un
  // rifacimento ne chiamava un altro, e con il tetto si finiva nel riquadro senza 3D).
  const perso = useCallback((e: Event) => {
    if ((e.target as HTMLCanvasElement).isConnected) setTimeout(rifai, 300);
  }, [rifai]);

  const { squadra, procedure } = usaSquadra();
  const info = useCallback((id: string): InfoAgente => {
    const m = squadra.find((x) => x.id === id);
    return m ? { id, ruolo: m.ruolo, descrizione: m.descrizione, produzione: m.produzione, fonte: m.fonte } : { id, ruolo: chiE(squadra, id).ruolo };
  }, [squadra]);
  const v = p.vista;
  const d = v.dibattito;
  const disp = useMemo(() => disposizione(d, v.assistente, info, procedure), [d, v.assistente, info, procedure]);
  // La catena cambia di rado: si tiene lo stesso oggetto finché non cambia davvero (Produzione è memo).
  const firmaCatena = JSON.stringify({ ...disp.catena, posti: [...disp.catena.posti] });
  const catena = useMemo(() => disp.catena, [firmaCatena]); // eslint-disable-line react-hooks/exhaustive-deps
  const dispStabile = useMemo<Disposizione>(() => ({ ...disp, catena }), [disp, catena]);

  // Dove guardare: chi sta lavorando. In riunione il tavolo della sala, dopo la scrivania in Direzione
  // (o il banco del collaudo per Codex); se lavora un assistente, il suo posto. In produzione decide
  // la catena (chi ci lavora adesso, altrimenti Codex al banco), non l'ultimo assistente che ha
  // mandato un evento: nel collaudo è il costruttore, fermo alla sua postazione.
  const fuoco = useMemo<Punto | null>(() => {
    const a = v.parlante;
    if (a) return riunioneAperta(d) ? posizioneDi(a, 'tavolo').punto : posizioneDi(a, a === 'codex' && catena.codex ? 'collaudo' : 'scrivania').punto;
    if (d?.config.tipo === 'chat') return null;
    const chi = catena.attiva ? catena.lavora?.id : alLavoro(v).find((x) => x.tipo === 'incarico')?.id;
    const l = chi ? luogoDi(dispStabile, chi) : null;
    if (l) return l.punto;
    return catena.codex ? posizioneDi('codex', 'collaudo').punto : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.parlante, v.assistente, d, dispStabile, catena]);

  // Gli schermi accesi in ufficio e i reparti dove si lavora (filo lime a terra).
  const chat = d?.config.tipo === 'chat';
  const { posti, attivi } = useMemo(() => {
    const lavori = chat ? [] : alLavoro(v);
    const posti: PostoAcceso[] = [];
    const attivi = new Set<IdReparto>();
    for (const id of dispStabile.chiamati) {
      const l = luogoDi(dispStabile, id);
      if (!l || l.dove !== 'ufficio' || !l.reparto) continue;
      const lavora = lavori.some((x) => x.id === id && x.tipo === 'incarico');
      if (l.scrivania) posti.push({ reparto: l.reparto, indice: l.indice, lavora, colore: coloreAgente(id) });
      if (lavora) attivi.add(l.reparto);
    }
    // Claude e Codex lavorano in Direzione fuori dalla riunione (in chat, per esempio).
    if (v.parlante && !riunioneAperta(d)) attivi.add('direzione');
    return { posti, attivi: [...attivi].sort() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispStabile, v.parlante, v.assistente, d, chat]);
  const firmaReparti = JSON.stringify([posti, attivi]);
  const reparti = useMemo(() => ({ posti, attivi }), [firmaReparti]); // eslint-disable-line react-hooks/exhaustive-deps
  const nome = useCallback((id: string) => chiE(squadra, id).nome, [squadra]);
  const lavagnaNuova = datiLavagna(d, nome);
  const firmaLavagna = JSON.stringify(lavagnaNuova);
  const lavagna = useMemo(() => lavagnaNuova, [firmaLavagna]); // eslint-disable-line react-hooks/exhaustive-deps

  // Etichette: il registro collega le ancore 3D ai div; i dati arrivano dalla regia.
  const registro = useMemo(creaRegistro, []);
  const [etichette, setEtichette] = useState<DatoEtichetta[]>([]);
  // La scatola della partita appena chiusa compare sullo scaffale solo quando ha finito il nastro.
  const [inViaggio, setInViaggio] = useState<string | null>(null);
  const [nastro, setNastro] = useState({ giro: 0, decisione: true });
  const archivio = useMemo(() => (inViaggio ? p.archivio.filter((s) => s.id !== inViaggio) : p.archivio), [p.archivio, inViaggio]);
  const onNastro = useMemo(() => (decisione: boolean) => setNastro((n) => ({ giro: n.giro + 1, decisione })), []);
  // Le funzioni dell'App cambiano a ogni suo disegno: qui restano le stesse, così l'edificio (memo)
  // non si ridisegna per niente.
  const ultime = useRef(p);
  ultime.current = p;
  const onScatola = useCallback((id: string) => ultime.current.onScatola?.(id), []);
  const onStampante = useCallback(() => ultime.current.onStampante?.(), []);
  const ancoraScatola = useMemo(() => (o: THREE.Object3D | null) => {
    if (o) registro.ancore.set('cantiere', o);
    else registro.ancore.delete('cantiere');
  }, [registro]);
  const finoAlPiano = !!d && (!!d.produzione || (!!d.config.poiProduzione && d.esito === 'accordo'));

  return (
    <div className="absolute inset-0" aria-hidden={p.pausa}>
      {spenta && <SenzaGrafica margine={p.margineSinistro} />}
      {!spenta && montata && <ProtezioneTela key={`${qualita}-${tela}`} onErrore={rifai}><Canvas
        key={`${qualita}-${tela}`}
        frameloop={p.pausa ? 'never' : 'always'}
        orthographic
        shadows="percentage"
        // Con la grafica piena l'antialias lo fa Resa sul suo bersaglio: quello della tela sarebbe
        // memoria sprecata (a 1,5 di densità circa 50 MB in più sulla scheda video).
        dpr={ridotto ? [1, 1.25] : [1, 1.5]}
        camera={{ zoom: 20, near: 0.1, far: 220, position: [10, 70, 50] }}
        gl={{ antialias: ridotto, powerPreference: 'high-performance' }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1;
          gl.domElement.addEventListener('webglcontextlost', perso);
          // Solo in sviluppo: le misure di prova leggono gl.info (chiamate, geometrie, texture, programmi).
          if (import.meta.env.DEV) Object.assign(window, { __resa: gl, __scena: scene });
        }}
      >
        <color attach="background" args={[SFONDO]} />
        {!forzata && !ridotto && <PerformanceMonitor onDecline={abbassa} onFallback={abbassa} flipflops={2} />}
        {!forzata && !ridotto && <Sentinella onLenta={abbassa} />}
        <Suspense fallback={null}>
          <Luci ridotto={ridotto} />
          <Basamento />
          <Telecamera inquadratura={p.inquadratura} fuoco={fuoco} segui={p.segui && !movimentoRidotto} margineSinistro={p.margineSinistro} />
          <Contenuto
            vista={v}
            invia={p.invia}
            onAgente={p.onAgente}
            onScatola={onScatola}
            onStampante={onStampante}
            archivio={archivio}
            ridotto={ridotto || movimentoRidotto}
            registro={registro}
            onEtichette={setEtichette}
            onConsegna={setInViaggio}
            onNastro={onNastro}
            nastro={nastro}
            disp={dispStabile}
            reparti={reparti}
            lavagna={lavagna}
            finoAlPiano={finoAlPiano}
            ancoraScatola={ancoraScatola}
          />
          {!ridotto && <Resa />}
        </Suspense>
        <Proiettore registro={registro} />
      </Canvas></ProtezioneTela>}
      {/* Senza tela le etichette non hanno più dove agganciarsi: resterebbero ferme a mezz'aria. */}
      {!p.pausa && <LivelloEtichette dati={spenta ? NESSUNA_ETICHETTA : etichette} registro={registro} onAgente={p.onAgente} />}
    </div>
  );
}

function Contenuto(p: {
  vista: Vista;
  invia: (a: Azione) => void;
  onAgente?: (a: Agente) => void;
  onScatola: (id: string) => void;
  onStampante: () => void;
  archivio: ScatolaArchivio[];
  ridotto: boolean;
  registro: RegistroEtichette;
  onEtichette: (d: DatoEtichetta[]) => void;
  onConsegna: (id: string | null) => void;
  onNastro: (decisione: boolean) => void;
  nastro: { giro: number; decisione: boolean };
  disp: Disposizione;
  reparti: { posti: PostoAcceso[]; attivi: IdReparto[] };
  lavagna: ReturnType<typeof datiLavagna>;
  finoAlPiano: boolean;
  ancoraScatola: (o: THREE.Object3D | null) => void;
}) {
  const schermi = usaSchermi();
  return (
    <ContestoSchermi.Provider value={schermi}>
      <Edificio archivio={p.archivio} onScatola={p.onScatola} onStampante={p.onStampante} schermoClaude={schermi.claude} schermoCodex={schermi.codex} schermoUtente={schermi.utente} />
      <Reparti posti={p.reparti.posti} attivi={p.reparti.attivi} lavagna={p.lavagna} schermoClaude={schermi.claude} schermoCodex={schermi.codex} />
      <Produzione idProduzione={`${p.vista.dibattito?.id ?? ''}:${p.vista.dibattito?.produzione?.inizio ?? ''}`} catena={p.disp.catena} consegna={p.nastro.giro} decisione={p.nastro.decisione} finoAlPiano={p.finoAlPiano} ridotto={p.ridotto} ancora={p.ancoraScatola} />
      <Schermo dibattito={p.vista.dibattito} fase={p.vista.fase} />
      <Direzione vista={p.vista} invia={p.invia} ridotto={p.ridotto} onAgente={p.onAgente} registro={p.registro} onEtichette={p.onEtichette} onConsegna={p.onConsegna} onNastro={p.onNastro} disp={p.disp} />
    </ContestoSchermi.Provider>
  );
}
