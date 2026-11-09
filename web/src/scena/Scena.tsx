// La tela 3D: luce, telecamera da diorama, edificio, produzione, omini ed effetti.
// Luce, basamento e tavolo stanno in Ambiente.tsx; occlusione, bagliore e tone mapping finale in
// Resa.tsx, solo su computer. Tone mapping Khronos PBR Neutral: tiene il bianco bianco e il lime lime.
import { PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { Agente } from '../../../motore/tipi.ts';
import type { Azione, Vista } from '../stato.ts';
import { Basamento, Luci, SFONDO } from './Ambiente.tsx';
import { ContestoSchermi, Direzione, fuocoSquadra, usaSchermi } from './Direzione.tsx';
import { Edificio, type ScatolaArchivio } from './Edificio.tsx';
import { creaRegistro, LivelloEtichette, Proiettore, type DatoEtichetta, type RegistroEtichette } from './Etichette.tsx';
import { posizioneDi, type Punto } from './pianta.ts';
import { Produzione } from './Produzione.tsx';
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

export function Scena(p: PropsScena) {
  const telefono = typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760);
  const movimentoRidotto = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [qualita, setQualita] = useState<'alta' | 'bassa'>(telefono ? 'bassa' : 'alta');
  const ridotto = qualita === 'bassa';

  // Dove guardare: chi sta lavorando, alla scrivania o in sala. Se non parla un capo reparto e lavora
  // un assistente, la telecamera va alla sua scrivania.
  const fuoco = useMemo<Punto | null>(() => {
    const a = p.vista.parlante;
    if (!a) return fuocoSquadra(p.vista);
    // Chi lavora sta alla sua scrivania finché non ha finito (vedi Direzione).
    return posizioneDi(a, 'scrivania').punto;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.vista.parlante, p.vista.assistente, p.vista.dibattito]);

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
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1;
        }}
      >
        <color attach="background" args={[SFONDO]} />
        <PerformanceMonitor onDecline={() => setQualita('bassa')} flipflops={2} />
        <Suspense fallback={null}>
          <Luci ridotto={ridotto} />
          <Basamento />
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
          {!ridotto && <Resa />}
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
