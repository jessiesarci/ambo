// Navetta robot (al posto del muletto del vecchio magazzino): un carrello autonomo basso, nero con
// una fascia lime, che va avanti e indietro lungo la corsia sud portando un pacchetto.
import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { LIME, NERO } from './pianta.ts';

const M = {
  corpo: new THREE.MeshStandardMaterial({ color: NERO, roughness: 0.35, metalness: 0.4 }),
  fascia: new THREE.MeshBasicMaterial({ color: LIME, toneMapped: false }),
  pacchetto: new THREE.MeshStandardMaterial({ color: '#f3f4f6', roughness: 0.6 }),
  ruota: new THREE.MeshStandardMaterial({ color: '#2a2d31', roughness: 0.8 }),
};

export function Navetta({ x, z }: { x: [number, number]; z: number }) {
  const g = useRef<THREE.Group>(null!);
  const carico = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.09;
    const f = (Math.sin(t * Math.PI * 2) + 1) / 2;
    const v = Math.cos(t * Math.PI * 2);
    g.current.position.set(x[0] + (x[1] - x[0]) * f, 0, z);
    g.current.rotation.y = v >= 0 ? Math.PI / 2 : -Math.PI / 2;
    carico.current.position.y = 0.66 + Math.sin(clock.elapsedTime * 3) * 0.015;
  });
  return (
    <group ref={g}>
      <RoundedBox args={[0.9, 0.3, 1.25]} radius={0.08} position={[0, 0.25, 0]} material={M.corpo} castShadow />
      {/* fascia luminosa tutto intorno */}
      <mesh material={M.fascia} position={[0, 0.3, 0]}>
        <boxGeometry args={[0.92, 0.035, 1.27]} />
      </mesh>
      {[-0.36, 0.36].map((px) => [-0.45, 0.45].map((pz) => (
        <mesh key={`${px}${pz}`} material={M.ruota} position={[px, 0.09, pz]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.09, 0.09, 0.08, 12]} />
        </mesh>
      )))}
      <mesh ref={carico} material={M.pacchetto} position={[0, 0.66, 0]} castShadow>
        <boxGeometry args={[0.62, 0.42, 0.62]} />
      </mesh>
      {/* il sensore davanti */}
      <mesh material={M.fascia} position={[0, 0.3, 0.64]}>
        <boxGeometry args={[0.3, 0.06, 0.02]} />
      </mesh>
    </group>
  );
}
