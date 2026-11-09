// L'edificio: a sinistra il magazzino (la produzione, in Produzione.tsx), a destra gli uffici dove si
// decide. Arredo Kenney Furniture Kit (CC0) a scala unica, gruppi funzionali invece di oggetti
// sparsi, vetrate con telai sottili e pareti verso la telecamera basse (vista "in sezione").
import { useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { Esito } from '../../../motore/tipi.ts';
import { materialePavimento } from './materiali.ts';
import { Modello, precarica, type PropsModello } from './Modello.tsx';
import { Navetta } from './Navetta.tsx';
import { ARCHIVIO, COLORI, DIVISORIO_X, LINEA, LIVELLI, PAVIMENTO, SALA, STAMPANTE, TAVOLO, UFFICIO_UTENTE } from './pianta.ts';

export interface ScatolaArchivio {
  id: string;
  esito: Esito | null;
  titolo: string;
}

// Kenney Furniture Kit: unità piccole, ×1,95 porta la scrivania a 74 cm.
const KS = 1.95;
const U = (n: string) => `/modelli/ufficio/${n}.glb`;
precarica(['desk', 'chair-desk', 'screen', 'keyboard', 'plant', 'plant-small', 'bookcase-wide', 'sofa-long', 'lounge-chair', 'coffee-table', 'lamp-floor', 'lamp-table', 'rug', 'rug-round', 'trashcan', 'coffee-machine', 'kitchen-bar', 'side-drawers', 'printer', 'corkboard', 'laptop', 'books', 'coat-rack', 'speaker'].map(U));

// Palette del kit Kenney: il rosso "carpet" e il legno arancione diventano grigio tessuto, cuoio
// e legno naturale, più vicini al riferimento.
const TINTE_BASE: Record<string, string> = { wood: '#f1f2f3', carpet: '#1b1d20', carpetDarker: '#111214', metal: '#d4d8dc', metalMedium: '#2a2d31', metalDark: '#141518', metalLight: '#eceef0' };
const TINTE: Record<string, Record<string, string>> = {
  'sofa-long': { ...TINTE_BASE, carpet: '#b5f900' },
  'lounge-chair': { ...TINTE_BASE, carpet: '#1b1d20' },
  rug: { ...TINTE_BASE, carpet: '#e6e8eb', carpetDarker: '#d3d6da' },
  'rug-round': { ...TINTE_BASE, carpet: '#1b1d20', carpetDarker: '#111214' },
};

// Un pezzo d'arredo Kenney: scala del kit e palette, salvo misure esplicite.
function Arredo({ n, ...resto }: { n: string } & Omit<PropsModello, 'url'>) {
  const misurato = resto.altezza ?? resto.larghezza ?? resto.profondita;
  return <Modello {...resto} url={U(n)} scala={misurato ? undefined : (resto.scala ?? KS)} tinte={TINTE[n] ?? TINTE_BASE} />;
}

const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const M = {
  // Magazzino in cemento a lastre grandi, uffici in piastrelle chiare: le due zone si distinguono
  // anche dall'alto. Il bordo scuro lungo i muri è un'ombra finta che regge anche sul telefono.
  pavMagazzino: materialePavimento({ colore: '#c9cdd2', piastrella: 3, giunto: 0.16, macchie: 0.09, roughness: 0.8, bordo: { rettangolo: [-24, -15, 24, 15], forza: 0.2 }, pareti: [[DIVISORIO_X, -15, DIVISORIO_X, 1.6], [DIVISORIO_X, 4.6, DIVISORIO_X, 15]] }),
  pavUfficio: materialePavimento({ colore: '#f2f3f5', piastrella: 1.2, giunto: 0.07, macchie: 0.02, roughness: 0.6, bordo: { rettangolo: [-24, -15, 24, 15], forza: 0.14 }, pareti: [[DIVISORIO_X, -15, DIVISORIO_X, 1.6], [DIVISORIO_X, 4.6, DIVISORIO_X, 15]] }),
  tappetoSala: mat('#16181b', { roughness: 0.9 }),
  parete: mat('#fafbfc', { roughness: 0.85 }),
  pareteScura: mat('#1a1c1f', { roughness: 0.8 }),
  // La testa dei muri è nera, come la sezione in un disegno d'architettura: disegna la pianta.
  cappello: mat('#141518', { roughness: 0.6 }),
  telaio: mat('#141518', { roughness: 0.4, metalness: 0.3 }),
  // Vetro appena azzurrato e lucido: si vede la stanza come volume, e riflette lo studio HDRI.
  vetro: new THREE.MeshStandardMaterial({ color: '#cfe0ec', transparent: true, opacity: 0.26, roughness: 0.04, metalness: 0.15, envMapIntensity: 1.8, depthWrite: false }),
  legno: mat('#f4f5f6', { roughness: 0.5 }),
  scuro: mat('#16181b', { roughness: 0.5 }),
  giallo: mat('#b5f900', { roughness: 0.6, emissive: '#b5f900', emissiveIntensity: 0.18 }),
  blu: mat('#141518', { roughness: 0.45, metalness: 0.25 }),
  arancio: mat('#b5f900', { roughness: 0.5, metalness: 0.1 }),
  grigioPiano: mat('#d9dce0', { roughness: 0.6 }),
};

const COLORE_ESITO: Record<Esito | 'aperto', string> = {
  accordo: COLORI.accordo,
  limite_round: COLORI.parziale,
  limite: COLORI.parziale,
  stallo: COLORI.disaccordo,
  chiuso_da_utente: COLORI.neutro,
  aperto: '#7aa7d9',
};

function Pavimento() {
  const [x0, x1] = PAVIMENTO.x;
  const [z0, z1] = PAVIMENTO.z;
  // Segnaletica gialla: bordo della linea di produzione e corsie degli scaffali.
  const linee = useMemo(() => [
    { x: (LINEA.da + LINEA.a) / 2, z: LINEA.z - 0.85, w: LINEA.da - LINEA.a, d: 0.07 },
    { x: (LINEA.da + LINEA.a) / 2, z: LINEA.z + 0.85, w: LINEA.da - LINEA.a, d: 0.07 },
    { x: -15.5, z: -6.6, w: 15, d: 0.07 },
    { x: -15.5, z: -13.2, w: 15, d: 0.07 },
    { x: -13.5, z: 11.3, w: 19, d: 0.07 },
  ], []);
  const cornice = useMemo(() => {
    const w = SALA.larga - 0.5 - 0.3;
    const d = SALA.profonda - 0.5 - 0.3;
    const [x, z] = SALA.centro;
    const s = 0.04;
    return [
      { x, z: z - d / 2, w: w + s, d: s },
      { x, z: z + d / 2, w: w + s, d: s },
      { x: x - w / 2, z, w: s, d },
      { x: x + w / 2, z, w: s, d },
    ];
  }, []);
  return (
    <group>
      <mesh material={M.pavMagazzino} rotation-x={-Math.PI / 2} position={[(x0 + DIVISORIO_X) / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[DIVISORIO_X - x0, z1 - z0]} />
      </mesh>
      <mesh material={M.pavUfficio} rotation-x={-Math.PI / 2} position={[(x1 + DIVISORIO_X) / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[x1 - DIVISORIO_X, z1 - z0]} />
      </mesh>
      {linee.map((r, i) => (
        <mesh key={i} material={M.giallo} rotation-x={-Math.PI / 2} position={[r.x, 0.004, r.z]}>
          <planeGeometry args={[r.w, r.d]} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[SALA.centro[0], 0.003, SALA.centro[1]]} material={M.tappetoSala} receiveShadow>
        <planeGeometry args={[SALA.larga - 0.5, SALA.profonda - 0.5]} />
      </mesh>
      {/* Filo lime lungo il bordo del tappeto: la sala è il palco, si trova a colpo d'occhio. */}
      {cornice.map((r, i) => (
        <mesh key={`c${i}`} material={M.giallo} rotation-x={-Math.PI / 2} position={[r.x, 0.005, r.z]}>
          <planeGeometry args={[r.w, r.d]} />
        </mesh>
      ))}
    </group>
  );
}

// Parete piena con altezza a scelta. Le facce del box sono +x, -x, +y, -y, +z, -z: la terza è la testa.
function Parete({ da, a, altezza, spessore = 0.16, materiale = M.parete }: { da: [number, number]; a: [number, number]; altezza: number; spessore?: number; materiale?: THREE.Material }) {
  const dx = a[0] - da[0];
  const dz = a[1] - da[1];
  const facce = useMemo(() => [materiale, materiale, M.cappello, materiale, materiale, materiale], [materiale]);
  return (
    <mesh material={facce} position={[(da[0] + a[0]) / 2, altezza / 2, (da[1] + a[1]) / 2]} rotation-y={-Math.atan2(dz, dx)} castShadow receiveShadow>
      <boxGeometry args={[Math.hypot(dx, dz), altezza, spessore]} />
    </mesh>
  );
}

// Vetrata leggera: lastra quasi trasparente e telai da 5 cm, niente ombre dal vetro.
function Vetrata({ da, a, altezza = 2.3 }: { da: [number, number]; a: [number, number]; altezza?: number }) {
  const dx = a[0] - da[0];
  const dz = a[1] - da[1];
  const lungo = Math.hypot(dx, dz);
  const montanti = Math.max(1, Math.round(lungo / 1.8));
  return (
    <group position={[(da[0] + a[0]) / 2, 0, (da[1] + a[1]) / 2]} rotation-y={-Math.atan2(dz, dx)}>
      <mesh material={M.vetro} position={[0, altezza / 2, 0]} renderOrder={1}>
        <boxGeometry args={[lungo, altezza, 0.02]} />
      </mesh>
      <mesh material={M.telaio} position={[0, altezza, 0]} castShadow>
        <boxGeometry args={[lungo, 0.05, 0.05]} />
      </mesh>
      <mesh material={M.telaio} position={[0, 0.025, 0]}>
        <boxGeometry args={[lungo, 0.05, 0.05]} />
      </mesh>
      {Array.from({ length: montanti + 1 }, (_, i) => (
        <mesh key={i} material={M.telaio} position={[-lungo / 2 + (i * lungo) / montanti, altezza / 2, 0]}>
          <boxGeometry args={[0.05, altezza, 0.05]} />
        </mesh>
      ))}
    </group>
  );
}

// Postazione: scrivania, monitor, tastiera e sedia dalla parte di chi siede.
// rotation 0: chi siede sta a sud (+z) e guarda a nord; lo schermo guarda verso di lui.
export function Postazione({ position, rotation = 0, schermo, extra }: { position: [number, number, number]; rotation?: number; schermo?: THREE.Material; extra?: 'lampada' | 'pianta' | 'libri' }) {
  return (
    <group position={position} rotation-y={rotation}>
      <Arredo n="desk" />
      {/* Il monitor Kenney ha il fronte verso -z: lo si gira verso chi siede. */}
      <Arredo n="screen" position={[0.05, 0.745, -0.12]} rotation={Math.PI} />
      {schermo && (
        <mesh material={schermo} position={[0.05, 0.745 + 0.33, -0.012]}>
          <planeGeometry args={[0.66, 0.36]} />
        </mesh>
      )}
      <Arredo n="keyboard" position={[0.05, 0.745, 0.17]} />
      {extra === 'lampada' && <Arredo n="lamp-table" position={[-0.52, 0.745, -0.16]} />}
      {extra === 'pianta' && <Arredo n="plant-small" scala={KS * 1.4} position={[-0.55, 0.745, -0.15]} />}
      {extra === 'libri' && <Arredo n="books" position={[-0.5, 0.745, -0.12]} rotation={0.3} />}
      <Arredo n="chair-desk" position={[0, 0, 0.82]} rotation={Math.PI} />
    </group>
  );
}

function TavoloRiunioni() {
  const [x, z] = TAVOLO.centro;
  return (
    <group position={[x, 0, z]}>
      <mesh material={M.legno} position={[0, 0.74, 0]} scale={[TAVOLO.lungo / 2, 1, TAVOLO.largo / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[1, 1, 0.05, 48]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={M.scuro} position={[s * TAVOLO.lungo * 0.27, 0.36, 0]} castShadow>
          <boxGeometry args={[0.08, 0.72, TAVOLO.largo * 0.45]} />
        </mesh>
      ))}
    </group>
  );
}

// Lo scaffale dell'archivio a fine nastro: ogni scatola è un dibattito concluso, con un'etichetta
// del colore dell'esito. Cliccandola si riapre la partita.
function ScaffaleArchivio({ archivio, onScatola }: { archivio: ScatolaArchivio[]; onScatola?: (id: string) => void }) {
  const [sopra, setSopra] = useState<number | null>(null);
  useCursor(sopra !== null);
  const lungo = ARCHIVIO.z[1] - ARCHIVIO.z[0];
  const zc = (ARCHIVIO.z[0] + ARCHIVIO.z[1]) / 2;
  const posti = Math.floor(lungo / 0.95);
  const scatole = useMemo(() => new THREE.InstancedMesh(new THREE.BoxGeometry(), mat('#eef0f2', { roughness: 0.75 }), 64), []);
  const etichette = useMemo(() => new THREE.InstancedMesh(new THREE.PlaneGeometry(), mat('#ffffff', { roughness: 0.5 }), 64), []);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qe = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const c = new THREE.Color();
    let n = 0;
    archivio.slice(0, LIVELLI.length * posti).forEach((voce, i) => {
      const livello = Math.floor(i / posti);
      const k = i % posti;
      // Dal basso e dal lato del nastro: le partite più recenti sono a portata di mano.
      const z = ARCHIVIO.z[0] + 0.5 + (posti - 1 - k) * 0.95;
      const y = LIVELLI[livello]! + 0.33;
      const s = i === sopra ? 1.08 : 1;
      m.compose(new THREE.Vector3(ARCHIVIO.x, y, z), q, new THREE.Vector3(0.95 * s, 0.6 * s, 0.8 * s));
      scatole.setMatrixAt(n, m);
      scatole.setColorAt(n, c.set(i === sopra ? '#ffffff' : '#e3e6e9'));
      m.compose(new THREE.Vector3(ARCHIVIO.x + 0.485 * s, y, z), qe, new THREE.Vector3(0.5, 0.26, 1));
      etichette.setMatrixAt(n, m);
      etichette.setColorAt(n, c.set(COLORE_ESITO[voce.esito ?? 'aperto']));
      n++;
    });
    scatole.count = n;
    etichette.count = n;
    scatole.instanceMatrix.needsUpdate = true;
    etichette.instanceMatrix.needsUpdate = true;
    if (scatole.instanceColor) scatole.instanceColor.needsUpdate = true;
    if (etichette.instanceColor) etichette.instanceColor.needsUpdate = true;
  }, [archivio, sopra, posti, scatole, etichette]);

  const indice = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId !== undefined && e.instanceId < archivio.length ? e.instanceId : undefined);

  return (
    <group>
      <group position={[ARCHIVIO.x, 0, zc]}>
        {LIVELLI.map((y) => (
          <group key={y} position={[0, y, 0]}>
            <mesh material={M.grigioPiano} receiveShadow>
              <boxGeometry args={[1.3, 0.03, lungo]} />
            </mesh>
            {[-0.66, 0.66].map((x) => (
              <mesh key={x} material={M.arancio} position={[x, 0.02, 0]} castShadow>
                <boxGeometry args={[0.07, 0.12, lungo]} />
              </mesh>
            ))}
          </group>
        ))}
        {Array.from({ length: 4 }, (_, k) =>
          [-0.66, 0.66].map((x) => (
            <mesh key={`${k}${x}`} material={M.blu} position={[x, 1.6, -lungo / 2 + (k * lungo) / 3]} castShadow>
              <boxGeometry args={[0.07, 3.2, 0.07]} />
            </mesh>
          )),
        )}
      </group>
      {/* frustumCulled spento: il volume di riferimento è quello della geometria unitaria all'origine */}
      <primitive
        object={scatole}
        frustumCulled={false}
        castShadow
        receiveShadow
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          const a = indice(e);
          setSopra(a ?? null);
          if (a !== undefined) e.stopPropagation();
        }}
        onPointerOut={() => setSopra(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          const a = indice(e);
          if (a === undefined) return;
          e.stopPropagation();
          onScatola?.(archivio[a]!.id);
        }}
      />
      <primitive object={etichette} frustumCulled={false} />
    </group>
  );
}

function Ufficio({ schermoClaude, schermoCodex, schermoUtente, onStampante }: { schermoClaude: THREE.Material; schermoCodex: THREE.Material; schermoUtente: THREE.Material; onStampante?: () => void }) {
  const [sx, sz] = SALA.centro;
  const x0 = sx - SALA.larga / 2;
  const x1 = sx + SALA.larga / 2;
  const z0 = sz - SALA.profonda / 2;
  const z1 = sz + SALA.profonda / 2;
  const [[a0, a1], [b0, b1]] = SALA.porte as [[number, number], [number, number]];
  const jm = UFFICIO_UTENTE.min;
  const jM = UFFICIO_UTENTE.max;
  const [stampanteSopra, setStampanteSopra] = useState(false);
  useCursor(stampanteSopra && !!onStampante);

  return (
    <group>
      {/* Sala del dibattito */}
      <Vetrata da={[x0, z0]} a={[a0, z0]} />
      <Vetrata da={[a1, z0]} a={[b0, z0]} />
      <Vetrata da={[b1, z0]} a={[x1, z0]} />
      <Vetrata da={[x0, z0]} a={[x0, z1]} />
      <Vetrata da={[x1, z0]} a={[x1, z1]} />
      <Vetrata da={[x0, z1]} a={[x1, z1]} altezza={0.9} />
      <TavoloRiunioni />
      <Arredo n="chair-desk" position={[TAVOLO.centro[0] - 2.95, 0, TAVOLO.centro[1]]} rotation={-Math.PI / 2} />
      <Arredo n="chair-desk" position={[TAVOLO.centro[0] + 2.95, 0, TAVOLO.centro[1]]} rotation={Math.PI / 2} />
      {[-1.25, 0, 1.25].map((dx) => (
        <group key={dx}>
          <Arredo n="chair-desk" position={[TAVOLO.centro[0] + dx, 0, TAVOLO.centro[1] - 1.4]} rotation={Math.PI} />
          <Arredo n="chair-desk" position={[TAVOLO.centro[0] + dx, 0, TAVOLO.centro[1] + 1.4]} />
        </group>
      ))}
      <Arredo n="laptop" position={[TAVOLO.centro[0] - 1.7, 0.765, TAVOLO.centro[1]]} rotation={-Math.PI / 2} />
      <Arredo n="laptop" position={[TAVOLO.centro[0] + 1.7, 0.765, TAVOLO.centro[1]]} rotation={Math.PI / 2} />
      <Arredo n="plant-small" scala={KS * 1.6} position={[TAVOLO.centro[0], 0.765, TAVOLO.centro[1]]} />
      <Arredo n="plant" position={[x0 + 0.45, 0, z1 - 0.45]} />
      <Arredo n="plant" position={[x1 - 0.45, 0, z1 - 0.45]} />

      {/* Isole di scrivanie lungo la parete nord. Claude e Codex hanno la loro (schermo colorato). */}
      <Postazione position={[5, 0, -11.2]} schermo={schermoClaude} extra="lampada" />
      <Postazione position={[5, 0, -11.96]} rotation={Math.PI} />
      <Postazione position={[3.58, 0, -11.2]} extra="libri" />
      <Postazione position={[3.58, 0, -11.96]} rotation={Math.PI} extra="pianta" />
      <Postazione position={[13, 0, -11.2]} schermo={schermoCodex} extra="pianta" />
      <Postazione position={[13, 0, -11.96]} rotation={Math.PI} extra="libri" />
      <Postazione position={[14.42, 0, -11.2]} />
      <Postazione position={[14.42, 0, -11.96]} rotation={Math.PI} extra="lampada" />
      <Postazione position={[19.5, 0, -11.2]} extra="libri" />
      <Postazione position={[20.92, 0, -11.2]} extra="pianta" />
      <Postazione position={[19.5, 0, -11.96]} rotation={Math.PI} extra="lampada" />
      <Postazione position={[20.92, 0, -11.96]} rotation={Math.PI} />
      {[0.6, 8.8, 16.6].map((x) => (
        <Arredo key={x} n="bookcase-wide" position={[x, 0, -14.65]} />
      ))}
      {[2.6, 7.2, 10.9, 23.1].map((x) => (
        <Arredo key={x} n="plant" position={[x, 0, -14.5]} />
      ))}

      {/* Angolo stampante: mobile, stampante, pianta e cestino. A fine partita il documento esce da qui. */}
      <group
        onPointerOver={(e) => { e.stopPropagation(); setStampanteSopra(true); }}
        onPointerOut={() => setStampanteSopra(false)}
        onClick={(e) => { if (onStampante) { e.stopPropagation(); onStampante(); } }}
      >
        <Arredo n="side-drawers" position={[STAMPANTE[0], 0, STAMPANTE[1]]} />
        <Arredo n="printer" altezza={0.42} position={[STAMPANTE[0], 0.74, STAMPANTE[1]]} rotation={Math.PI} />
      </group>
      <Arredo n="plant" position={[STAMPANTE[0] - 1.05, 0, STAMPANTE[1]]} />
      <Arredo n="trashcan" position={[STAMPANTE[0] + 0.85, 0, STAMPANTE[1] + 0.1]} />
      <Arredo n="corkboard" larghezza={1.4} position={[DIVISORIO_X + 0.12, 1.2, -7.5]} rotation={Math.PI / 2} />

      {/* Zona relax a est */}
      <Arredo n="rug" scala={KS * 1.4} position={[20.8, 0, -1.6]} rotation={Math.PI / 2} />
      <Arredo n="sofa-long" position={[22.6, 0, -1.6]} rotation={-Math.PI / 2} />
      <Arredo n="lounge-chair" position={[19, 0, -3.1]} rotation={Math.PI * 0.2} />
      <Arredo n="lounge-chair" position={[19, 0, 0]} rotation={Math.PI * 0.8} />
      <Arredo n="coffee-table" position={[20.6, 0, -1.6]} rotation={Math.PI / 2} />
      <Arredo n="lamp-floor" position={[23.2, 0, -3.6]} />
      <Arredo n="plant" scala={KS * 1.2} position={[23.2, 0, 1.2]} />

      {/* Angolo caffè a sud */}
      <Arredo n="kitchen-bar" scala={KS * 1.1} position={[3.4, 0, 13.9]} />
      <Arredo n="kitchen-bar" scala={KS * 1.1} position={[4.35, 0, 13.9]} />
      <Arredo n="coffee-machine" position={[3.4, 0.86, 13.85]} />
      <Arredo n="plant" position={[1.9, 0, 13.9]} />
      <Arredo n="coat-rack" position={[0.2, 0, 13.6]} />

      {/* Il tuo ufficio */}
      <Vetrata da={[jm[0], jm[1]]} a={[jM[0], jm[1]]} />
      <Vetrata da={[jm[0], jm[1]]} a={[jm[0], 7]} />
      <Vetrata da={[jm[0], 9.2]} a={[jm[0], jM[1]]} />
      <Vetrata da={[jm[0], jM[1]]} a={[jM[0], jM[1]]} altezza={0.9} />
      <Arredo n="rug-round" scala={KS * 1.3} position={[UFFICIO_UTENTE.scrivania[0], 0, UFFICIO_UTENTE.scrivania[1] - 0.3]} />
      <Postazione position={[UFFICIO_UTENTE.scrivania[0], 0, UFFICIO_UTENTE.scrivania[1] - 0.2]} rotation={Math.PI} schermo={schermoUtente} extra="lampada" />
      <Arredo n="bookcase-wide" position={[17.3, 0, 4.85]} rotation={Math.PI} />
      <Arredo n="sofa-long" position={[21.4, 0, 12.6]} rotation={Math.PI} />
      <Arredo n="plant" scala={KS * 1.2} position={[23, 0, 5.2]} />
      <Arredo n="speaker" position={[16.1, 0, 12.9]} />
    </group>
  );
}

export function Edificio(p: {
  archivio: ScatolaArchivio[];
  onScatola?: (id: string) => void;
  onStampante?: () => void;
  schermoClaude: THREE.Material;
  schermoCodex: THREE.Material;
  schermoUtente: THREE.Material;
}) {
  const [x0, x1] = PAVIMENTO.x;
  const [z0, z1] = PAVIMENTO.z;
  return (
    <group>
      <Pavimento />
      {/* A nord e a ovest pareti alte; a est e a sud basse, per vedere dentro come in sezione. */}
      <Parete da={[x0, z0]} a={[x1, z0]} altezza={3} spessore={0.3} />
      <Parete da={[x0, z0]} a={[x0, z1]} altezza={3} spessore={0.3} />
      <Parete da={[x1, z0]} a={[x1, z1]} altezza={1} spessore={0.3} />
      <Parete da={[x0, z1]} a={[-21, z1]} altezza={0.35} spessore={0.3} materiale={M.pareteScura} />
      <Parete da={[-17, z1]} a={[x1, z1]} altezza={0.35} spessore={0.3} materiale={M.pareteScura} />
      <Parete da={[DIVISORIO_X, z0]} a={[DIVISORIO_X, 1.6]} altezza={2.6} />
      <Parete da={[DIVISORIO_X, 4.6]} a={[DIVISORIO_X, z1]} altezza={2.6} />
      <ScaffaleArchivio archivio={p.archivio} onScatola={p.onScatola} />
      <Navetta x={[-19, -9]} z={8.6} />
      <Ufficio schermoClaude={p.schermoClaude} schermoCodex={p.schermoCodex} schermoUtente={p.schermoUtente} onStampante={p.onStampante} />
    </group>
  );
}
