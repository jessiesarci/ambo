// L'arredo Kenney Furniture Kit (CC0) a scala unica e le postazioni di lavoro. Il kit ha il fronte
// di ogni mobile verso -z (sedie, divani, poltrone, monitor, portatili, librerie): qui le rotazioni
// sono scritte una volta, così sedie e schermi guardano chi siede.
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Istanze, Modello, precarica, type Copia, type PropsModello } from './Modello.tsx';
import type { Scrivania } from './pianta.ts';

// Kenney Furniture Kit: unità piccole, ×1,95 porta la scrivania a 74 cm.
export const KS = 1.95;
export const U = (n: string) => `/modelli/ufficio/${n}.glb`;
precarica(['desk', 'chair-desk', 'screen', 'keyboard', 'plant', 'plant-small', 'bookcase-wide', 'sofa-long', 'lounge-chair', 'coffee-table', 'lamp-floor', 'lamp-table', 'rug', 'rug-round', 'trashcan', 'coffee-machine', 'kitchen-bar', 'side-drawers', 'printer', 'corkboard', 'laptop', 'books', 'coat-rack', 'speaker'].map(U));

// Palette del kit: il rosso "carpet" e il legno arancione diventano grigio tessuto, cuoio e legno
// naturale. Monitor e portatili: scocca chiara e schermo scuro, così il davanti si riconosce dal
// retro (prima lo schermo era chiaro e la scocca nera: sembravano girati).
export const TINTE_BASE: Record<string, string> = { wood: '#f1f2f3', carpet: '#1b1d20', carpetDarker: '#111214', metal: '#d4d8dc', metalMedium: '#2a2d31', metalDark: '#141518', metalLight: '#eceef0' };
export const TINTE: Record<string, Record<string, string>> = {
  'sofa-long': { ...TINTE_BASE, carpet: '#b5f900' },
  'lounge-chair': { ...TINTE_BASE, carpet: '#1b1d20' },
  rug: { ...TINTE_BASE, carpet: '#e6e8eb', carpetDarker: '#d3d6da' },
  'rug-round': { ...TINTE_BASE, carpet: '#1b1d20', carpetDarker: '#111214' },
  screen: { ...TINTE_BASE, metalDark: '#e4e6e9', metal: '#1d1f23' },
  laptop: { ...TINTE_BASE, metalDark: '#e4e6e9', metal: '#1d1f23' },
};

// Un pezzo d'arredo Kenney: scala del kit e palette, salvo misure esplicite.
export function Arredo({ n, ...resto }: { n: string } & Omit<PropsModello, 'url'>) {
  const misurato = resto.altezza ?? resto.larghezza ?? resto.profondita;
  return <Modello {...resto} url={U(n)} scala={misurato ? undefined : (resto.scala ?? KS)} tinte={TINTE[n] ?? TINTE_BASE} />;
}

// Tante copie dello stesso pezzo d'arredo, istanziate.
export function ArrediUguali({ n, copie, scala = KS, ombre }: { n: string; copie: readonly Copia[]; scala?: number; ombre?: boolean }) {
  return <Istanze url={U(n)} copie={copie} scala={scala} tinte={TINTE[n] ?? TINTE_BASE} ombre={ombre} />;
}

// Un punto della postazione (coordinate locali: chi siede sta a +z) portato nel mondo.
function locale(s: Scrivania, lx: number, ly: number, lz: number, rot = 0): Copia {
  const c = Math.cos(s.rotazione);
  const n = Math.sin(s.rotazione);
  return { position: [s.punto[0] + lx * c + lz * n, ly, s.punto[1] - lx * n + lz * c], rotation: s.rotazione + rot };
}

// Il piano della scrivania è alto 74,5 cm; lo schermo sta verso il fondo, la tastiera verso chi siede.
const PIANO = 0.745;
export const SCHERMO_LOCALE = { x: 0.05, y: PIANO + 0.33, z: -0.012, larghezza: 0.66, altezza: 0.36 };

// La matrice del vetro acceso davanti allo schermo di una postazione (un piano che guarda chi siede).
export function matriceSchermo(s: Scrivania, m = new THREE.Matrix4()): THREE.Matrix4 {
  const c = locale(s, SCHERMO_LOCALE.x, SCHERMO_LOCALE.y, SCHERMO_LOCALE.z);
  return m.compose(new THREE.Vector3(...c.position), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rotation ?? 0), new THREE.Vector3(SCHERMO_LOCALE.larghezza, SCHERMO_LOCALE.altezza, 1));
}

// Le postazioni: scrivania (cassetti verso chi siede), monitor e tastiera girati verso di lui, sedia
// con lo schienale dalla sua parte. Tutte insieme, istanziate. extra: lampada, pianta o libri a turno.
export function Scrivanie({ scrivanie, extra = true }: { scrivanie: readonly Scrivania[]; extra?: boolean }) {
  const pezzi = (() => {
    const p = { desk: [] as Copia[], screen: [] as Copia[], keyboard: [] as Copia[], chair: [] as Copia[], lamp: [] as Copia[], plant: [] as Copia[], books: [] as Copia[] };
    scrivanie.forEach((s, i) => {
      p.desk.push(locale(s, 0, 0, 0, Math.PI));
      p.screen.push(locale(s, 0.05, PIANO, -0.12, Math.PI));
      p.keyboard.push(locale(s, 0.05, PIANO, 0.17, Math.PI));
      p.chair.push(locale(s, 0, 0, 0.82));
      if (!extra) return;
      if (i % 3 === 0) p.lamp.push(locale(s, -0.52, PIANO, -0.16, Math.PI));
      else if (i % 3 === 1) p.plant.push(locale(s, -0.55, PIANO, -0.15));
      else p.books.push(locale(s, -0.5, PIANO, -0.12, 0.3));
    });
    return p;
  })();
  return (
    <group>
      <ArrediUguali n="desk" copie={pezzi.desk} />
      <ArrediUguali n="screen" copie={pezzi.screen} />
      <ArrediUguali n="keyboard" copie={pezzi.keyboard} ombre={false} />
      <ArrediUguali n="chair-desk" copie={pezzi.chair} />
      {pezzi.lamp.length > 0 && <ArrediUguali n="lamp-table" copie={pezzi.lamp} />}
      {pezzi.plant.length > 0 && <ArrediUguali n="plant-small" copie={pezzi.plant} scala={KS * 1.4} />}
      {pezzi.books.length > 0 && <ArrediUguali n="books" copie={pezzi.books} />}
    </group>
  );
}

// Lo schermo acceso di una postazione con un materiale suo (Claude, Codex, l'utente, la catena).
export function SchermoAcceso({ scrivania, materiale }: { scrivania: Scrivania; materiale: THREE.Material }) {
  const c = locale(scrivania, SCHERMO_LOCALE.x, SCHERMO_LOCALE.y, SCHERMO_LOCALE.z);
  return (
    <mesh material={materiale} position={c.position} rotation-y={c.rotation}>
      <planeGeometry args={[SCHERMO_LOCALE.larghezza, SCHERMO_LOCALE.altezza]} />
    </mesh>
  );
}

// Gli schermi di tante postazioni, istanziati: spenti (null), accesi piano se c'è qualcuno, del suo
// colore e pulsanti se lavora.
export interface StatoSchermo {
  colore: string;
  lavora: boolean;
}
const SPENTO = new THREE.Color('#15171a');
const FERMO = new THREE.Color('#2e343b');

export function SchermiAccesi({ scrivanie, stati }: { scrivanie: readonly Scrivania[]; stati: readonly (StatoSchermo | null)[] }) {
  const firma = JSON.stringify(scrivanie);
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, scrivanie.length));
    const m = new THREE.Matrix4();
    scrivanie.forEach((s, i) => im.setMatrixAt(i, matriceSchermo(s, m)));
    im.count = scrivanie.length;
    im.frustumCulled = false;
    return im;
  }, [firma]); // eslint-disable-line react-hooks/exhaustive-deps
  const lavoro = useRef<{ i: number; colore: THREE.Color }[]>([]);
  const chiave = JSON.stringify(stati);
  useLayoutEffect(() => {
    lavoro.current = [];
    const c = new THREE.Color();
    for (let i = 0; i < mesh.count; i++) {
      const s = stati[i];
      if (s?.lavora) lavoro.current.push({ i, colore: new THREE.Color(s.colore) });
      mesh.setColorAt(i, s ? (s.lavora ? c.set(s.colore) : FERMO) : SPENTO);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [chiave, mesh]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    if (!lavoro.current.length) return;
    const k = 0.75 + Math.sin(clock.elapsedTime * 5) * 0.25;
    for (const l of lavoro.current) mesh.setColorAt(l.i, c.copy(l.colore).multiplyScalar(k));
    mesh.instanceColor!.needsUpdate = true;
  });
  useEffect(() => () => {
    mesh.dispose();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }, [mesh]);
  return <primitive object={mesh} />;
}
