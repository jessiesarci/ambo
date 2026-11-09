// Modelli GLB scaricati (Kenney, KayKit, Quaternius: tutti CC0). Ogni pacchetto usa la sua unità
// di misura, quindi qui si misura il modello e lo si porta alla dimensione voluta, appoggiato a
// terra e centrato sul punto d'origine. Geometrie e materiali restano condivisi tra le copie.
import { useGLTF } from '@react-three/drei';
import { useMemo, type ReactNode } from 'react';
import * as THREE from 'three';

type V3 = [number, number, number];

export interface PropsModello {
  url: string;
  // Una sola dimensione guida la scala (in metri), le altre seguono le proporzioni del modello.
  larghezza?: number;
  altezza?: number;
  profondita?: number;
  scala?: number; // fattore diretto, per tenere coerente un intero kit (es. Kenney ×1,95)
  position?: V3;
  rotation?: number;
  ombre?: boolean;
  // Sostituisce il colore di un materiale (per nome) solo in questa copia.
  colori?: Record<string, string>;
  // Palette del kit: ricolora i materiali (per nome) del modello originale, una volta sola per file.
  tinte?: Record<string, string>;
  onClick?: () => void;
  children?: ReactNode;
}

const misure = new WeakMap<THREE.Object3D, THREE.Box3>();
const tinti = new WeakSet<THREE.Object3D>();
const temati = new WeakSet<THREE.Material>();

// Il plastico: ogni materiale dei modelli scaricati diventa una scala di grigi dal nero al bianco,
// anche con le texture (si lavora sul colore già campionato, nello shader). Le tinte messe a mano
// con la palette restano come sono: è da lì che passano il nero e il lime.
export function applicaTema(mat: THREE.Material): void {
  if (temati.has(mat)) return;
  temati.add(mat);
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float temaL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = mix(vec3(0.011, 0.012, 0.014), vec3(0.84, 0.85, 0.87), smoothstep(0.015, 0.32, temaL));`);
  };
  mat.customProgramCacheKey = () => 'tema-plastico';
  mat.needsUpdate = true;
}

export function temaScena(scene: THREE.Object3D, tinte?: Record<string, string>): void {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (!tinte?.[mat.name]) applicaTema(mat);
  });
}

function tingi(scene: THREE.Object3D, tinte: Record<string, string>): void {
  if (tinti.has(scene)) return;
  tinti.add(scene);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const c = tinte[mat.name];
      if (c) (mat as THREE.MeshStandardMaterial).color.set(c);
    }
  });
}

export function misura(oggetto: THREE.Object3D): THREE.Box3 {
  let b = misure.get(oggetto);
  if (!b) {
    oggetto.updateMatrixWorld(true);
    b = new THREE.Box3().setFromObject(oggetto);
    misure.set(oggetto, b);
  }
  return b;
}

export function Modello({ url, larghezza, altezza, profondita, scala: scalaFissa, position, rotation = 0, ombre = true, colori, tinte, onClick, children }: PropsModello) {
  const { scene } = useGLTF(url);
  if (tinte) tingi(scene, tinte);
  temaScena(scene, tinte);
  const { copia, scala, spostamento } = useMemo(() => {
    const copia = scene.clone(true);
    copia.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = ombre;
      m.receiveShadow = true;
      if (colori) {
        const lista = Array.isArray(m.material) ? m.material : [m.material];
        const nuovi = lista.map((mat) => {
          const c = colori[mat.name];
          if (!c) return mat;
          const n = (mat as THREE.MeshStandardMaterial).clone();
          n.color = new THREE.Color(c);
          return n;
        });
        m.material = Array.isArray(m.material) ? nuovi : nuovi[0]!;
      }
    });
    const b = misura(scene);
    const dim = b.getSize(new THREE.Vector3());
    const scala = scalaFissa ?? (larghezza ? larghezza / dim.x : altezza ? altezza / dim.y : profondita ? profondita / dim.z : 1);
    const centro = b.getCenter(new THREE.Vector3());
    const spostamento: V3 = [-centro.x * scala, -b.min.y * scala, -centro.z * scala];
    return { copia, scala, spostamento };
    // colori arriva spesso come oggetto letterale: conta il contenuto, non l'identità.
  }, [scene, larghezza, altezza, profondita, scalaFissa, ombre, JSON.stringify(colori)]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <group position={position} rotation-y={rotation} onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}>
      <primitive object={copia} scale={scala} position={spostamento} />
      {children}
    </group>
  );
}

export const precarica = (urls: string[]) => urls.forEach((u) => useGLTF.preload(u));
