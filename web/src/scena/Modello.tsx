// Modelli GLB scaricati (Kenney, KayKit, Quaternius: tutti CC0). Ogni pacchetto usa la sua unità
// di misura, quindi qui si misura il modello e lo si porta alla dimensione voluta, appoggiato a
// terra e centrato sul punto d'origine. Geometrie e materiali restano condivisi tra le copie.
import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo, type ReactNode } from 'react';
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
  // Plastica satinata: il bianco un po' più ruvido, il nero più lucido (prende i riflessi dello studio).
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
      float temaL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      float temaT = smoothstep(0.015, 0.3, temaL);
      diffuseColor.rgb = mix(vec3(0.006, 0.0065, 0.0075), vec3(0.87, 0.88, 0.895), temaT);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(0.4, 0.62, temaT);`);
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
      if (!c) continue;
      const s = mat as THREE.MeshStandardMaterial;
      s.color.set(c);
      // I Kenney sono tutti ruvidi al massimo: il tessuto resta opaco, il resto diventa plastica satinata.
      s.roughness = mat.name.startsWith('carpet') ? 0.85 : mat.name.startsWith('metal') ? 0.42 : 0.55;
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

// Tante copie dello stesso mobile in un colpo solo: un InstancedMesh per ogni pezzo del modello,
// quindi una chiamata di disegno per pezzo invece che una per copia (le scrivanie dei reparti sono
// decine). Stessa resa di Modello: scala del kit, appoggiato a terra, centrato sul punto, tinte e tema.
export interface Copia {
  position: V3;
  rotation?: number;
}

export function Istanze({ url, copie, scala, tinte, ombre = true }: { url: string; copie: readonly Copia[]; scala: number; tinte?: Record<string, string>; ombre?: boolean }) {
  const { scene } = useGLTF(url);
  if (tinte) tingi(scene, tinte);
  temaScena(scene, tinte);
  const firma = JSON.stringify(copie);
  const istanze = useMemo(() => {
    if (!copie.length) return [];
    scene.updateMatrixWorld(true);
    const b = misura(scene);
    const centro = b.getCenter(new THREE.Vector3());
    // Dal modello alla copia: sposta a terra e al centro, scala, ruota, porta al punto.
    const base = new THREE.Matrix4().makeScale(scala, scala, scala).premultiply(new THREE.Matrix4().makeTranslation(-centro.x * scala, -b.min.y * scala, -centro.z * scala));
    const posa = copie.map((c) => new THREE.Matrix4().makeRotationY(c.rotation ?? 0).premultiply(new THREE.Matrix4().makeTranslation(...c.position)).multiply(base));
    const pezzi: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) pezzi.push(o as THREE.Mesh);
    });
    const m = new THREE.Matrix4();
    return pezzi.map((pezzo) => {
      const im = new THREE.InstancedMesh(pezzo.geometry, pezzo.material, copie.length);
      posa.forEach((p, i) => im.setMatrixAt(i, m.multiplyMatrices(p, pezzo.matrixWorld)));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = ombre;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      return im;
    });
  }, [scene, scala, ombre, firma]); // eslint-disable-line react-hooks/exhaustive-deps
  // Geometrie e materiali sono quelli del modello (condivisi): si libera solo il buffer delle copie.
  useEffect(() => () => istanze.forEach((im) => im.dispose()), [istanze]);
  return (
    <>
      {istanze.map((im, i) => (
        <primitive key={i} object={im} />
      ))}
    </>
  );
}
