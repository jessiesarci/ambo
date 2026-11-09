// La tela 3D: luce, telecamera da diorama, edificio, produzione, omini ed effetti.
// Ricetta di luce dal consulto con ChatGPT: una direzionale calda che dà la direzione, un HDRI
// neutro debole per volume e riflessi, poco emisfero e niente luce ambiente che appiattisce.
import { Environment, PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Agente } from '../../../motore/tipi.ts';
import type { Azione, Vista } from '../stato.ts';
import { ContestoSchermi, Direzione, usaSchermi } from './Direzione.tsx';
import { Edificio, type ScatolaArchivio } from './Edificio.tsx';
import { creaRegistro, LivelloEtichette, Proiettore, type DatoEtichetta, type RegistroEtichette } from './Etichette.tsx';
import { posizioneDi, type Punto } from './pianta.ts';
import { Produzione } from './Produzione.tsx';
import { Occlusione } from './Resa.tsx';
import { Schermo } from './Schermo.tsx';
import { Telecamera, type Inquadratura } from './Telecamera.tsx';

function Luci({ ridotto }: { ridotto: boolean }) {
  const sole = useRef<THREE.DirectionalLight>(null!);
  useEffect(() => {
    const c = sole.current.shadow.camera;
    c.left = -30;
    c.right = 30;
    c.top = 22;
    c.bottom = -22;
    c.near = 1;
    c.far = 100;
    c.updateProjectionMatrix();
    sole.current.target.position.set(0, 0, 0);
    sole.current.target.updateMatrixWorld();
  }, []);
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b9bdc3', 0.3]} />
      <directionalLight
        ref={sole}
        position={[-20, 30, 15]}
        color="#ffffff"
        intensity={2.3}
        castShadow
        shadow-mapSize={ridotto ? [1024, 1024] : [2048, 2048]}
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
        shadow-radius={2}
      />
      <Environment files="/hdri/poly_haven_studio_1k.hdr" environmentIntensity={0.32} />
    </>
  );
}

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

export function Scena(p: PropsScena) {
  const telefono = typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760);
  const movimentoRidotto = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [qualita, setQualita] = useState<'alta' | 'bassa'>(telefono ? 'bassa' : 'alta');
  const ridotto = qualita === 'bassa';

  // Dove guardare: chi sta lavorando, alla scrivania o in sala.
  const fuoco = useMemo<Punto | null>(() => {
    const a = p.vista.parlante;
    if (!a) return null;
    // Chi lavora sta alla sua scrivania finché non ha finito (vedi Direzione).
    return posizioneDi(a, 'scrivania').punto;
  }, [p.vista.parlante]);

  // Etichette: il registro collega le ancore 3D ai div; i dati arrivano dalla regia.
  const registro = useMemo(creaRegistro, []);
  const [etichette, setEtichette] = useState<DatoEtichetta[]>([]);
  // La scatola della partita appena chiusa compare sullo scaffale solo quando ha finito il nastro.
  const [inViaggio, setInViaggio] = useState<string | null>(null);
  const [nastro, setNastro] = useState({ giro: 0, decisione: true });
  const archivio = useMemo(() => (inViaggio ? p.archivio.filter((s) => s.id !== inViaggio) : p.archivio), [p.archivio, inViaggio]);
  const onNastro = useMemo(() => (decisione: boolean) => setNastro((n) => ({ giro: n.giro + 1, decisione })), []);

  return (
    <div className="absolute inset-0" aria-hidden={p.pausa}>
      <Canvas
        frameloop={p.pausa ? 'never' : 'always'}
        orthographic
        shadows="percentage"
        dpr={ridotto ? [1, 1.25] : [1, 1.75]}
        camera={{ zoom: 20, near: 0.1, far: 220, position: [10, 70, 50] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1;
        }}
      >
        <color attach="background" args={['#eceef1']} />
        <PerformanceMonitor onDecline={() => setQualita('bassa')} flipflops={2} />
        <Suspense fallback={null}>
          <Luci ridotto={ridotto} />
          <Telecamera inquadratura={p.inquadratura} fuoco={fuoco} segui={p.segui && !movimentoRidotto} margineSinistro={p.margineSinistro} />
          <Contenuto
            {...p}
            archivio={archivio}
            ridotto={ridotto || movimentoRidotto}
            registro={registro}
            onEtichette={setEtichette}
            onConsegna={setInViaggio}
            onNastro={onNastro}
            nastro={nastro}
          />
          {!ridotto && <Occlusione />}
        </Suspense>
        <Proiettore registro={registro} />
      </Canvas>
      {!p.pausa && <LivelloEtichette dati={etichette} registro={registro} onAgente={p.onAgente} />}
    </div>
  );
}

function Contenuto(p: PropsScena & {
  ridotto: boolean;
  registro: RegistroEtichette;
  onEtichette: (d: DatoEtichetta[]) => void;
  onConsegna: (id: string | null) => void;
  onNastro: (decisione: boolean) => void;
  nastro: { giro: number; decisione: boolean };
}) {
  const schermi = usaSchermi();
  return (
    <ContestoSchermi.Provider value={schermi}>
      <Edificio archivio={p.archivio} onScatola={p.onScatola} onStampante={p.onStampante} schermoClaude={schermi.claude} schermoCodex={schermi.codex} schermoUtente={schermi.utente} />
      <Produzione consegna={p.nastro.giro} decisione={p.nastro.decisione} lavoro={p.vista.dibattito?.produzione?.stato} />
      <Schermo dibattito={p.vista.dibattito} fase={p.vista.fase} />
      <Direzione vista={p.vista} invia={p.invia} ridotto={p.ridotto} onAgente={p.onAgente} registro={p.registro} onEtichette={p.onEtichette} onConsegna={p.onConsegna} onNastro={p.onNastro} />
    </ContestoSchermi.Provider>
  );
}
