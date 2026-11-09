// Effetti a tempo: coriandoli per l'accordo, l'aereo di carta con la tua nota, il foglio
// che esce dalla stampante a fine partita.
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { COLORI, STAMPANTE, TAVOLO, UFFICIO_UTENTE } from './pianta.ts';

const COLORI_CORIANDOLI = [COLORI.linea, '#141518', '#ffffff', '#c4c8ce', COLORI.linea];

// Parte quando cambia `lancio` (un contatore) e cade fino a terra, anche se la festa finisce prima.
export function Coriandoli({ lancio, ridotto }: { lancio: number; ridotto: boolean }) {
  const N = ridotto ? 0 : 160;
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const inizio = useRef(-100);
  const ultimo = useRef(lancio);
  const dati = useMemo(
    () => Array.from({ length: N }, (_, i) => ({
      x: TAVOLO.centro[0] + (Math.sin(i * 12.9) * 0.5) * 6,
      z: TAVOLO.centro[1] + (Math.cos(i * 7.3) * 0.5) * 4,
      v: 0.9 + ((i * 37) % 10) / 10,
      ritardo: ((i * 53) % 100) / 60,
      giro: (i % 7) - 3,
    })),
    [N],
  );
  const oggetto = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const c = new THREE.Color();
    dati.forEach((_, i) => mesh.current.setColorAt(i, c.set(COLORI_CORIANDOLI[i % COLORI_CORIANDOLI.length]!)));
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [dati]);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    if (lancio !== ultimo.current) {
      ultimo.current = lancio;
      inizio.current = clock.elapsedTime;
    }
    // Dopo una pausa della scena l'orologio riparte da zero: i coriandoli già caduti non ricadono.
    if (clock.elapsedTime < inizio.current) inizio.current = -100;
    const t = clock.elapsedTime - inizio.current;
    mesh.current.visible = inizio.current > 0 && t < 9;
    if (!mesh.current.visible) return;
    dati.forEach((d, i) => {
      const tt = Math.max(0, t - d.ritardo);
      const y = 4.5 - tt * d.v * 0.9;
      oggetto.position.set(d.x + Math.sin(tt * 2 + i) * 0.3, Math.max(y, 0.02), d.z + Math.cos(tt * 1.7 + i) * 0.3);
      oggetto.rotation.set(tt * d.giro, tt * 1.3, tt * d.giro * 0.5);
      oggetto.scale.setScalar(tt > 0 ? 1 : 0);
      oggetto.updateMatrix();
      mesh.current.setMatrixAt(i, oggetto.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  if (!N) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, N]} visible={false}>
      <planeGeometry args={[0.12, 0.07]} />
      <meshStandardMaterial side={THREE.DoubleSide} roughness={0.6} />
    </instancedMesh>
  );
}

// Parte quando cambia `lancio` (un contatore): vola dalla tua scrivania al tavolo della sala.
export function AereoDiCarta({ lancio }: { lancio: number }) {
  const g = useRef<THREE.Group>(null!);
  const partenza = useRef<number | null>(null);
  const ultimo = useRef(lancio);
  const da = useMemo(() => new THREE.Vector3(UFFICIO_UTENTE.sedia[0], 1.6, UFFICIO_UTENTE.sedia[1]), []);
  const a = useMemo(() => new THREE.Vector3(TAVOLO.centro[0], 0.85, TAVOLO.centro[1]), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const prec = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    if (lancio !== ultimo.current) {
      ultimo.current = lancio;
      partenza.current = clock.elapsedTime;
    }
    if (partenza.current === null) {
      g.current.visible = false;
      return;
    }
    const f = (clock.elapsedTime - partenza.current) / 2.4;
    if (f >= 1.4 || f < 0) {
      partenza.current = null;
      return;
    }
    const k = Math.min(f, 1);
    g.current.visible = true;
    prec.copy(g.current.position);
    tmp.lerpVectors(da, a, k);
    tmp.y += Math.sin(k * Math.PI) * 3.5;
    g.current.position.copy(tmp);
    if (k < 1) g.current.lookAt(tmp.clone().add(tmp.clone().sub(prec)));
  });

  return (
    <group ref={g} visible={false}>
      <mesh rotation-x={Math.PI / 2} castShadow>
        <coneGeometry args={[0.16, 0.5, 3]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} flatShading />
      </mesh>
    </group>
  );
}

// Il documento finale: un foglio che esce dalla stampante e una luce verde accesa finché c'è.
export function FoglioStampante({ pronto }: { pronto: boolean }) {
  const foglio = useRef<THREE.Mesh>(null!);
  const luce = useRef<THREE.MeshStandardMaterial>(null!);
  const da = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (pronto && da.current === null) da.current = clock.elapsedTime;
    if (!pronto) da.current = null;
    const f = da.current === null ? 0 : Math.min((clock.elapsedTime - da.current) / 2, 1);
    foglio.current.visible = pronto;
    foglio.current.position.z = STAMPANTE[1] + 0.2 + f * 0.35;
    luce.current.emissiveIntensity = pronto ? 1.2 + Math.sin(clock.elapsedTime * 4) * 0.6 : 0;
  });
  return (
    <group>
      <mesh ref={foglio} position={[STAMPANTE[0], 0.82, STAMPANTE[1] + 0.2]} rotation-x={-Math.PI / 2} visible={false}>
        <planeGeometry args={[0.42, 0.55]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[STAMPANTE[0] + 0.3, 1.17, STAMPANTE[1] + 0.2]}>
        <sphereGeometry args={[0.05, 10, 8]} />
        <meshStandardMaterial ref={luce} color={COLORI.accordo} emissive={COLORI.accordo} emissiveIntensity={0} />
      </mesh>
    </group>
  );
}
