// Luce e "tavolo" del plastico. Il modello poggia su un basamento nero con un filo lime, sopra un
// tavolo grigio con la griglia del tappetino da taglio e un'ombra morbida: così l'edificio si stacca
// dallo sfondo invece di sciogliersi nel bianco.
// Luce: un sole caldo da sud-ovest, alto 45°, che disegna ombre lunghe e nette, un cielo freddo che riempie
// le ombre senza annerirle e lo studio HDRI per i riflessi sulla plastica.
import { Environment } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { materialeTerreno, texturaOmbra } from './materiali.ts';
import { LIME, NERO, PAVIMENTO } from './pianta.ts';

export const SFONDO = '#c3c8cf';
const SOLE = new THREE.Vector3(-21, 27, 17);
// Basamento: sporge oltre i muri perimetrali (spessi 0,3 m) e scende sotto il pavimento.
const BORDO = 0.6;
const ALTEZZA = 1.1;
const B = { x0: PAVIMENTO.x[0] - BORDO, x1: PAVIMENTO.x[1] + BORDO, z0: PAVIMENTO.z[0] - BORDO, z1: PAVIMENTO.z[1] + BORDO };

export function Luci({ ridotto }: { ridotto: boolean }) {
  const sole = useRef<THREE.DirectionalLight>(null!);
  // La camera delle ombre abbraccia esattamente edificio e basamento (con l'ombra del basamento sul
  // tavolo), così ogni texel della mappa cade dove serve.
  useLayoutEffect(() => {
    const l = sole.current;
    l.target.position.set(0, 0, 0);
    l.target.updateMatrixWorld();
    // Una camera, non un Object3D qualsiasi: lookAt la orienta con -z verso il bersaglio, come la luce.
    const vista = new THREE.OrthographicCamera();
    vista.position.copy(SOLE);
    vista.lookAt(0, 0, 0);
    vista.updateMatrixWorld();
    const inversa = vista.matrixWorld.clone().invert();
    const box = new THREE.Box3();
    const p = new THREE.Vector3();
    for (const x of [B.x0 - 1.2, B.x1 + 1.2]) for (const y of [-ALTEZZA, 3.3]) for (const z of [B.z0 - 1.2, B.z1 + 1.2]) box.expandByPoint(p.set(x, y, z).applyMatrix4(inversa));
    const c = l.shadow.camera;
    c.left = box.min.x;
    c.right = box.max.x;
    c.bottom = box.min.y;
    c.top = box.max.y;
    c.near = Math.max(0.1, -box.max.z - 1);
    c.far = -box.min.z + 1;
    c.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
  }, []);
  // Passando alla modalità ridotta la mappa va rifatta, altrimenti resta quella grande.
  useEffect(() => {
    const l = sole.current;
    l.shadow.map?.dispose();
    l.shadow.map = null;
  }, [ridotto]);
  return (
    <>
      <hemisphereLight args={['#eef3f8', '#dcdcda', 0.72]} />
      <directionalLight
        ref={sole}
        position={SOLE}
        color="#fff8ee"
        intensity={1.95}
        castShadow
        shadow-mapSize={ridotto ? [2048, 2048] : [4096, 4096]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.025}
        shadow-radius={ridotto ? 2 : 3}
      />
      {/* Controluce freddo da nord-est, senza ombre: stacca i fianchi in ombra dal pavimento. */}
      <directionalLight position={[24, 16, -20]} color="#dfe8ff" intensity={0.35} />
      <Environment files="/hdri/poly_haven_studio_1k.hdr" environmentIntensity={0.2} />
    </>
  );
}

export function Basamento() {
  const { terreno, ombra, materiali } = useMemo(() => {
    const terreno = materialeTerreno('#d5d9df', '#c8cdd4', new THREE.Color(SFONDO), [0, 0]);
    const ombra = new THREE.MeshBasicMaterial({ color: '#0d1014', alphaMap: texturaOmbra(B.x1 - B.x0, B.z1 - B.z0, 2.2), transparent: true, opacity: 0.55, depthWrite: false });
    const materiali = {
      corpo: new THREE.MeshStandardMaterial({ color: NERO, roughness: 0.55, metalness: 0.1 }),
      filo: new THREE.MeshBasicMaterial({ color: LIME, toneMapped: false }),
    };
    return { terreno, ombra, materiali };
  }, []);
  const lx = B.x1 - B.x0;
  const lz = B.z1 - B.z0;
  const cx = (B.x0 + B.x1) / 2;
  const cz = (B.z0 + B.z1) / 2;
  const yFilo = -0.16;
  return (
    <group>
      <mesh material={materiali.corpo} position={[cx, -ALTEZZA / 2 - 0.004, cz]} castShadow receiveShadow>
        <boxGeometry args={[lx, ALTEZZA, lz]} />
      </mesh>
      {/* Filo lime lungo i quattro lati, appena sotto il bordo. */}
      <mesh material={materiali.filo} position={[cx, yFilo, B.z1 + 0.006]}>
        <boxGeometry args={[lx + 0.012, 0.03, 0.012]} />
      </mesh>
      <mesh material={materiali.filo} position={[cx, yFilo, B.z0 - 0.006]}>
        <boxGeometry args={[lx + 0.012, 0.03, 0.012]} />
      </mesh>
      <mesh material={materiali.filo} position={[B.x1 + 0.006, yFilo, cz]}>
        <boxGeometry args={[0.012, 0.03, lz + 0.012]} />
      </mesh>
      <mesh material={materiali.filo} position={[B.x0 - 0.006, yFilo, cz]}>
        <boxGeometry args={[0.012, 0.03, lz + 0.012]} />
      </mesh>
      {/* Il tavolo e l'ombra morbida del basamento, spostata un poco verso nord-est come il sole. */}
      <mesh material={terreno} rotation-x={-Math.PI / 2} position={[0, -ALTEZZA, 0]} receiveShadow>
        <planeGeometry args={[900, 900]} />
      </mesh>
      <mesh material={ombra} rotation-x={-Math.PI / 2} position={[cx + 0.5, -ALTEZZA + 0.01, cz - 0.35]} renderOrder={-1}>
        <planeGeometry args={[lx + 2.2 * 4, lz + 2.2 * 4]} />
      </mesh>
    </group>
  );
}
