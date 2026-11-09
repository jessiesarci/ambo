// Un personaggio del diorama: Kenney Mini Characters 2.0 (CC0), con scheletro e 32 animazioni.
// Cammina lungo un percorso e a destinazione prende una posa. Ogni posa è un'animazione del
// modello; scrivere al computer e gesticolare si ottengono muovendo le braccia sopra "sit" e
// "idle", che il pacchetto non ha.
import { useGLTF } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneScheletro } from 'three/addons/utils/SkeletonUtils.js';
import { temaScena } from './Modello.tsx';
import { ripresa, type Punto } from './pianta.ts';

export type Posa = 'fermo' | 'seduto' | 'scrive' | 'pensa' | 'consulta' | 'parla' | 'parla_seduto' | 'festeggia' | 'stretta' | 'errore' | 'spallucce' | 'porta' | 'lancia';

export type ModelloPersonaggio = 'female-d' | 'male-f' | 'male-d' | 'worker' | 'male-b' | 'female-b' | 'male-e' | 'female-e' | 'male-a' | 'female-f';
const url = (m: ModelloPersonaggio) => `/modelli/personaggi/character-${m}.glb`;
for (const m of ['female-d', 'male-f', 'male-d', 'worker', 'male-b', 'female-b', 'male-e', 'female-e', 'male-a', 'female-f'] as const) useGLTF.preload(url(m));

// Stessa scala del kit d'arredo Kenney: il personaggio risulta alto circa 1,3 m, in proporzione
// con scrivanie e sedie.
const SCALA = 1.95;

export interface PropsPersonaggio {
  modello: ModelloPersonaggio;
  inizio: Punto;
  percorso: Punto[];
  destinazione: { punto: Punto; verso: number };
  posa: Posa;
  velocita?: number;
  ancora?: (o: THREE.Object3D | null) => void; // punto sopra la testa a cui agganciare l'etichetta
  onClick?: () => void;
  nome?: string;
  ciclico?: boolean; // rifà il percorso all'infinito (comparse)
  onArrivo?: () => void; // chiamato quando arriva a destinazione dopo aver camminato
}

// Clip del pacchetto per ogni posa.
const CLIP: Record<Posa | 'cammina', string> = {
  cammina: 'walk',
  fermo: 'idle',
  seduto: 'sit',
  scrive: 'sit',
  pensa: 'sit',
  consulta: 'sit',
  parla: 'idle',
  parla_seduto: 'sit',
  festeggia: 'jump',
  stretta: 'interact-right',
  errore: 'emote-no',
  spallucce: 'emote-no',
  porta: 'idle',
  lancia: 'interact-right',
};
const SEDUTE = new Set<Posa>(['seduto', 'scrive', 'pensa', 'consulta', 'parla_seduto']);
// Gesti che si fanno una volta e poi si tengono: in loop la stretta di mano non finiva mai.
const UNA_VOLTA = new Set<Posa>(['stretta', 'lancia']);


function angolo(da: number, a: number, lambda: number, dt: number): number {
  let diff = a - da;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return da + diff * (1 - Math.exp(-lambda * dt));
}

const CARTONE = new THREE.MeshStandardMaterial({ color: '#b5f900', roughness: 0.7 });

export function Personaggio(p: PropsPersonaggio) {
  const { scene, animations } = useGLTF(url(p.modello));
  temaScena(scene);
  const radice = useRef<THREE.Group>(null!);
  const etichetta = useRef<THREE.Group>(null!);
  const scatola = useRef<THREE.Mesh>(null!);
  const { ancora } = p;
  const refEtichetta = useCallback((o: THREE.Group | null) => {
    if (o) etichetta.current = o;
    ancora?.(o);
  }, [ancora]);

  // Copia con scheletro indipendente (un semplice clone condividerebbe le ossa).
  const { rig, mixer, azioni, ossa } = useMemo(() => {
    const rig = cloneScheletro(scene);
    rig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    const mixer = new THREE.AnimationMixer(rig);
    const azioni: Record<string, THREE.AnimationAction> = {};
    for (const clip of animations) azioni[clip.name] = mixer.clipAction(clip);
    const ossa = { sinistro: rig.getObjectByName('arm-left'), destro: rig.getObjectByName('arm-right'), testa: rig.getObjectByName('head') };
    return { rig, mixer, azioni, ossa };
  }, [scene, animations]);
  useEffect(() => () => {
    mixer.stopAllAction();
    mixer.uncacheRoot(rig);
  }, [mixer, rig]);

  const stato = useRef({ x: p.inizio[0], z: p.inizio[1], verso: p.destinazione.verso, coda: [] as Punto[], fase: Math.random() * 10, inViaggio: false, clip: '' });

  // Un percorso nuovo fa ripartire la camminata, dal tratto più vicino a dove si trova.
  useEffect(() => {
    const st = stato.current;
    const punti = [...p.percorso, p.destinazione.punto];
    st.coda = p.ciclico ? punti : punti.slice(ripresa([st.x, st.z], punti));
    st.inViaggio = true;
  }, [p.percorso, p.destinazione.punto, p.ciclico]);
  const arrivo = useRef(p.onArrivo);
  arrivo.current = p.onArrivo;

  useFrame((s, dt) => {
    const st = stato.current;
    dt = Math.min(dt, 0.1);
    const t = s.clock.elapsedTime + st.fase;
    const vel = p.velocita ?? 2;

    let inMoto = false;
    while (st.coda.length) {
      const [tx, tz] = st.coda[0]!;
      const dx = tx - st.x;
      const dz = tz - st.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05) {
        st.coda.shift();
        continue;
      }
      const passo = Math.min(dist, vel * dt);
      st.x += (dx / dist) * passo;
      st.z += (dz / dist) * passo;
      st.verso = angolo(st.verso, Math.atan2(dx, dz), 12, dt);
      inMoto = true;
      break;
    }
    if (!inMoto && st.inViaggio && !p.ciclico) {
      st.inViaggio = false;
      arrivo.current?.();
    }
    if (!inMoto && p.ciclico && p.percorso.length) st.coda = [...p.percorso];
    if (!inMoto) st.verso = angolo(st.verso, p.destinazione.verso, 8, dt);

    radice.current.position.set(st.x, 0, st.z);
    radice.current.rotation.y = st.verso;

    // Animazione: dissolvenza di 0,25 s quando cambia la clip.
    const clip = inMoto ? CLIP.cammina : CLIP[p.posa];
    if (clip !== st.clip) {
      const prossima = azioni[clip] ?? azioni.idle!;
      const prima = st.clip ? azioni[st.clip] : undefined;
      const unaVolta = !inMoto && UNA_VOLTA.has(p.posa);
      prossima.setLoop(unaVolta ? THREE.LoopOnce : THREE.LoopRepeat, unaVolta ? 1 : Infinity);
      prossima.clampWhenFinished = unaVolta;
      prossima.reset().setEffectiveWeight(1).play();
      if (prima && prima !== prossima) prossima.crossFadeFrom(prima, 0.25, false);
      st.clip = clip;
    }
    const camminata = azioni.walk;
    if (camminata) camminata.timeScale = vel / 1.6;
    // La clip "sit" non muove la testa: si azzera prima, così la clip la anima se la anima, e una
    // testa piegata da una posa di prima non resta piegata.
    if (ossa.testa) ossa.testa.rotation.set(0, 0, 0);
    mixer.update(dt);

    // Pose che il pacchetto non ha: si muovono le braccia sopra la clip.
    const posa: Posa = inMoto ? (p.posa === 'porta' ? 'porta' : 'fermo') : p.posa;
    const { sinistro, destro, testa } = ossa;
    if (posa === 'pensa' && destro) {
      // Mano al mento, testa un po' piegata, che ogni tanto si muove.
      destro.rotation.x = -2.25;
      destro.rotation.z = 0.35;
      if (testa) {
        testa.rotation.x = 0.12;
        testa.rotation.y = Math.sin(t * 0.7) * 0.18;
      }
    } else if (posa === 'consulta' && sinistro && destro) {
      // Guarda il monitor e scorre: braccio avanti, l'altro sul tavolo.
      destro.rotation.x = -1.35 + Math.sin(t * 2.4) * 0.12;
      sinistro.rotation.x = -1.05;
      if (testa) testa.rotation.x = -0.12;
    } else if (posa === 'scrive' && sinistro && destro) {
      sinistro.rotation.x = -1.15 + Math.sin(t * 20) * 0.1;
      destro.rotation.x = -1.15 + Math.sin(t * 20 + 1.7) * 0.1;
      if (testa) testa.rotation.x = 0.18;
    } else if ((posa === 'parla' || posa === 'parla_seduto') && destro) {
      destro.rotation.x = -1 + Math.sin(t * 3.2) * 0.35;
      destro.rotation.z = -0.25;
      if (testa) testa.rotation.y = Math.sin(t * 1.3) * 0.25;
    } else if (posa === 'porta' && sinistro && destro) {
      sinistro.rotation.x = -1.2;
      destro.rotation.x = -1.2;
    } else if (posa === 'spallucce' && sinistro && destro) {
      sinistro.rotation.z = 0.5;
      destro.rotation.z = -0.5;
    }
    scatola.current.visible = posa === 'porta';
    const seduto = !inMoto && SEDUTE.has(p.posa);
    etichetta.current.position.y = THREE.MathUtils.damp(etichetta.current.position.y, seduto ? 1.5 : 1.85, 6, dt);
  });

  const click = p.onClick
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        p.onClick!();
      }
    : undefined;

  return (
    <group ref={radice} onClick={click} name={p.nome}>
      <primitive object={rig} scale={SCALA} />
      {/* Il modello animato si colpisce male con il raggio del clic: una sagoma trasparente lo copre. */}
      {click && (
        <mesh
          position={[0, 0.85, 0]}
          onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = ''; }}
        >
          <boxGeometry args={[0.9, 1.8, 0.9]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      <mesh ref={scatola} material={CARTONE} position={[0, 0.72, 0.38]} visible={false} castShadow>
        <boxGeometry args={[0.5, 0.36, 0.4]} />
      </mesh>
      <group ref={refEtichetta} position={[0, 1.85, 0]} />
    </group>
  );
}
