// La produzione come officina digitale: qui le decisioni diventano file e codice, non pacchi.
// Una linea attraversa quattro stazioni scritte a terra (decisione, cantiere di Claude, collaudo di
// Codex, consegna) fino all'archivio. Intorno, armadi server con le spie che lampeggiano, la
// postazione del cantiere con i suoi schermi e la console del collaudo, che si accendono quando la
// decisione della partita aperta è in lavorazione.
// Modelli: Kenney Factory Kit 3.0 (CC0) per nastro, bracci e scanner; il resto è fatto a mano.
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { StatoProduzione } from '../../../motore/tipi.ts';
import { Postazione } from './Edificio.tsx';
import { Modello, misura, precarica, temaScena } from './Modello.tsx';
import { COLORI, LIME, LINEA, NERO } from './pianta.ts';

const F = (n: string) => `/modelli/fabbrica/${n}.glb`;

precarica([
  F('conveyor-long-stripe-sides'), F('machine-window'), F('robot-arm-a'), F('robot-arm-b'), F('scanner-high'), F('box-small'),
  F('hopper-square'), F('screen-hanging-wide'),
]);

// Pacchetti che scorrono sulla linea, tutti in un InstancedMesh con la geometria della scatola Kenney.
function PacchettiSullaLinea({ consegna, decisione }: { consegna: number; decisione: boolean }) {
  const { scene } = useGLTF(F('box-small'));
  temaScena(scene);
  const N = 7;
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const speciale = useRef<THREE.Mesh>(null!);
  const avvio = useRef<{ giro: number; t: number } | null>(null);
  const ultimo = useRef(consegna);
  const { geometria, materiale, scala } = useMemo(() => {
    let g: THREE.BufferGeometry | undefined;
    let m: THREE.Material | undefined;
    scene.traverse((o) => {
      const x = o as THREE.Mesh;
      if (x.isMesh && !g) {
        g = x.geometry;
        m = x.material as THREE.Material;
      }
    });
    const dim = misura(scene).getSize(new THREE.Vector3());
    return { geometria: g!, materiale: m!, scala: 0.42 / dim.x };
  }, [scene]);
  const o = useMemo(() => new THREE.Object3D(), []);
  const lunghezza = LINEA.da - LINEA.a;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < N; i++) {
      const f = ((t * 0.55) / lunghezza + i / N) % 1;
      o.position.set(LINEA.da - f * lunghezza, 0.42, LINEA.z + Math.sin(i * 7.3) * 0.08);
      o.rotation.set(0, Math.sin(i * 3.1) * 0.25, 0);
      o.scale.setScalar(scala);
      o.updateMatrix();
      mesh.current.setMatrixAt(i, o.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;

    // La decisione appena arrivata: un pacchetto lime dall'inizio alla fine della linea.
    if (consegna !== ultimo.current) {
      ultimo.current = consegna;
      avvio.current = { giro: consegna, t };
    }
    const s = speciale.current;
    if (avvio.current) {
      const f = (t - avvio.current.t) / (lunghezza / 0.9);
      s.visible = f < 1;
      s.position.set(LINEA.da - Math.min(f, 1) * lunghezza, 0.47, LINEA.z);
      if (f >= 1) avvio.current = null;
    } else s.visible = false;
  });

  return (
    <>
      <instancedMesh ref={mesh} args={[geometria, materiale, N]} castShadow receiveShadow />
      <mesh ref={speciale} visible={false} castShadow>
        <boxGeometry args={[0.55, 0.42, 0.5]} />
        <meshStandardMaterial color={decisione ? COLORI.linea : '#c4c8ce'} roughness={0.55} emissive={decisione ? COLORI.linea : '#000000'} emissiveIntensity={0.25} />
      </mesh>
    </>
  );
}

// Armadi server in file (dove prima c'erano gli scaffali): neri, con le fessure delle unità e una
// spia per unità su ogni faccia. Le spie cambiano di continuo, a caso, tra lime, bianco e spento.
const FILE_SERVER = [
  { x: [-22.6, -18.2] as [number, number], z: -11.6, alto: 2.3 },
  { x: [-17.8, -13.4] as [number, number], z: -11.6, alto: 2.3 },
  { x: [-13, -8.6] as [number, number], z: -11.6, alto: 2.3 },
  { x: [-22.6, -18.2] as [number, number], z: -8.1, alto: 2.3 },
  { x: [-17.8, -13.4] as [number, number], z: -8.1, alto: 2.3 },
  { x: [-13, -8.6] as [number, number], z: -8.1, alto: 2.3 },
  // Unità basse lungo la parete sud, dove arrivavano i pallet.
  { x: [-20.8, -14.4] as [number, number], z: 12.6, alto: 1.15 },
];
const LARGO_UNITA = 0.72;
const PROFONDO = 0.95;
const M = {
  armadio: new THREE.MeshStandardMaterial({ color: NERO, roughness: 0.42, metalness: 0.35 }),
  fessura: new THREE.MeshStandardMaterial({ color: '#2a2d31', roughness: 0.6 }),
  lime: new THREE.MeshBasicMaterial({ color: LIME, toneMapped: false }),
};
const SPIE = [new THREE.Color(LIME), new THREE.Color('#ffffff'), new THREE.Color('#2a2d31'), new THREE.Color(LIME)];

function ArmadiServer() {
  const { armadi, fessure, spie, n } = useMemo(() => {
    const unita: { x: number; z: number; alto: number }[] = [];
    for (const f of FILE_SERVER) for (let x = f.x[0] + LARGO_UNITA / 2; x <= f.x[1] - LARGO_UNITA / 2 + 0.01; x += LARGO_UNITA + 0.02) unita.push({ x, z: f.z, alto: f.alto });
    const o = new THREE.Object3D();
    const armadi = new THREE.InstancedMesh(new THREE.BoxGeometry(), M.armadio, unita.length);
    const piani = unita.reduce((s, u) => s + Math.floor(u.alto / 0.26) * 2, 0);
    const fessure = new THREE.InstancedMesh(new THREE.BoxGeometry(), M.fessura, piani);
    const spie = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ toneMapped: false }), piani);
    let k = 0;
    unita.forEach((u, i) => {
      o.position.set(u.x, u.alto / 2, u.z);
      o.rotation.set(0, 0, 0);
      o.scale.set(LARGO_UNITA, u.alto, PROFONDO);
      o.updateMatrix();
      armadi.setMatrixAt(i, o.matrix);
      for (let y = 0.2; y < u.alto - 0.12; y += 0.26) {
        for (const lato of [-1, 1]) {
          o.position.set(u.x, y, u.z + lato * (PROFONDO / 2 + 0.006));
          o.scale.set(LARGO_UNITA - 0.1, 0.17, 0.012);
          o.updateMatrix();
          fessure.setMatrixAt(k, o.matrix);
          o.position.set(u.x + LARGO_UNITA / 2 - 0.12, y, u.z + lato * (PROFONDO / 2 + 0.014));
          o.scale.set(0.07, 0.025, 0.01);
          o.updateMatrix();
          spie.setMatrixAt(k, o.matrix);
          spie.setColorAt(k, SPIE[Math.floor(Math.abs(Math.sin(i * 12.9 + y * 78.2 + lato)) * 4) % 4]!);
          k++;
        }
      }
    });
    for (const m of [armadi, fessure, spie]) m.frustumCulled = false;
    armadi.castShadow = true;
    armadi.receiveShadow = true;
    return { armadi, fessure, spie, n: k };
  }, []);

  // Una manciata di spie cambia stato ogni 0,15 s: il lavoro dei server, senza costare nulla.
  const ultimo = useRef(0);
  useFrame(({ clock }) => {
    // Dopo una pausa della scena l'orologio riparte da zero.
    if (clock.elapsedTime < ultimo.current) ultimo.current = clock.elapsedTime;
    if (clock.elapsedTime - ultimo.current < 0.15) return;
    ultimo.current = clock.elapsedTime;
    for (let i = 0; i < 14; i++) spie.setColorAt(Math.floor(Math.random() * n), SPIE[Math.floor(Math.random() * SPIE.length)]!);
    spie.instanceColor!.needsUpdate = true;
  });

  return (
    <group>
      <primitive object={armadi} />
      <primitive object={fessure} />
      <primitive object={spie} />
      {/* Un filo lime in cima a ogni fila */}
      {FILE_SERVER.map((f, i) => (
        <mesh key={i} material={M.lime} position={[(f.x[0] + f.x[1]) / 2, f.alto + 0.012, f.z]}>
          <boxGeometry args={[f.x[1] - f.x[0] - 0.1, 0.025, 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

// Le stazioni della linea, scritte a terra: numero su un quadrato lime e nome in nero.
function Targa({ numero, testo, x, z, larghezza = 2.8 }: { numero: string; testo: string; x: number; z: number; larghezza?: number }) {
  const mappa = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 200;
    const g = c.getContext('2d')!;
    // Fascia nera, numero su quadrato lime, nome in bianco: si legge anche da lontano.
    g.fillStyle = NERO;
    g.fillRect(0, 0, 1024, 200);
    g.fillStyle = LIME;
    g.fillRect(0, 0, 200, 200);
    g.fillStyle = NERO;
    g.font = 'bold 112px "Chakra Petch", ui-sans-serif, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(numero, 100, 106);
    g.textAlign = 'left';
    g.fillStyle = '#ffffff';
    g.font = 'bold 78px "Chakra Petch", ui-sans-serif, sans-serif';
    g.fillText(testo.toUpperCase(), 236, 106, 760);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [numero, testo]);
  return (
    <mesh position={[x, 0.012, z]} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[larghezza, (larghezza * 200) / 1024]} />
      <meshStandardMaterial map={mappa} roughness={0.7} />
    </mesh>
  );
}

// Schermi che si accendono quando la loro stazione lavora.
function usaSchermo(acceso: boolean, colore: string) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0b0c0e', emissive: colore, emissiveIntensity: 0.15, roughness: 0.3 }), [colore]);
  useFrame(({ clock }) => {
    m.emissiveIntensity = acceso ? 0.9 + Math.sin(clock.elapsedTime * 4) * 0.35 : 0.12;
  });
  return m;
}

// La console del collaudo: un leggio nero con lo schermo inclinato.
function Console({ position, schermo }: { position: [number, number, number]; schermo: THREE.Material }) {
  return (
    <group position={position}>
      <mesh material={M.armadio} position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 1, 0.55]} />
      </mesh>
      <mesh material={schermo} position={[0, 1.08, 0.08]} rotation-x={-0.6}>
        <boxGeometry args={[0.82, 0.03, 0.42]} />
      </mesh>
      <mesh material={M.lime} position={[0, 0.03, 0.281]}>
        <boxGeometry args={[0.9, 0.04, 0.01]} />
      </mesh>
    </group>
  );
}

export function Produzione({ consegna, decisione, lavoro }: { consegna: number; decisione: boolean; lavoro?: StatoProduzione }) {
  const segmenti = useMemo(() => {
    const s: number[] = [];
    for (let x = LINEA.da - 1; x > LINEA.a; x -= 2) s.push(x);
    return s;
  }, []);
  const z = LINEA.z;
  const schermoCantiere = usaSchermo(lavoro === 'in_lavorazione', LIME);
  const schermoCollaudo = usaSchermo(lavoro === 'collaudo', LIME);
  return (
    <group>
      {/* La linea e le sue macchine */}
      {segmenti.map((x) => (
        <Modello key={x} url={F('conveyor-long-stripe-sides')} larghezza={2} position={[x, 0, z]} />
      ))}
      <Modello url={F('hopper-square')} altezza={1.1} position={[-4.4, 0, z - 1.3]} />
      <Modello url={F('machine-window')} profondita={1.5} position={[-7.5, 0, z]} rotation={Math.PI / 2} />
      <Modello url={F('screen-hanging-wide')} larghezza={0.9} position={[-7.5, 1.6, z - 1.1]} />
      <Modello url={F('robot-arm-a')} altezza={2.6} position={[-10.6, 0, z - 1.25]} rotation={Math.PI} />
      <Modello url={F('scanner-high')} altezza={1.5} position={[-13.4, 0, z]} rotation={Math.PI / 2} />
      <Modello url={F('robot-arm-b')} altezza={2.4} position={[-16.2, 0, z + 1.25]} />
      <PacchettiSullaLinea consegna={consegna} decisione={decisione} />

      {/* Le quattro stazioni, scritte a terra lungo la linea */}
      <Targa numero="01" testo="Decisione" x={-4.5} z={z + 2.1} larghezza={2.9} />
      <Targa numero="02" testo="Cantiere · Claude" x={-8.4} z={z + 2.1} larghezza={3.5} />
      <Targa numero="03" testo="Collaudo · Codex" x={-12.6} z={z + 2.1} larghezza={3.5} />
      <Targa numero="04" testo="Consegna" x={-17.6} z={z + 2.1} larghezza={2.9} />

      {/* Il cantiere: la postazione dove Claude costruisce, e la console del collaudo di Codex */}
      <Postazione position={[-5.2, 0, -7.6]} schermo={schermoCantiere} extra="lampada" />
      <Postazione position={[-3.78, 0, -7.6]} schermo={schermoCantiere} />
      <Console position={[-13.4, 0, z - 1.6]} schermo={schermoCollaudo} />

      <ArmadiServer />
    </group>
  );
}
