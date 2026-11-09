// Telecamera ortografica da diorama: elevazione 55°, leggera rotazione, niente distorsione.
// Inquadrature pronte (tutto, sala, produzione, il tuo ufficio): sul telefono mostrare tutto
// rende gli omini larghi pochi pixel, meglio andare dove succede qualcosa.
import { MapControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import type { Punto } from './pianta.ts';

export type Inquadratura = 'tutto' | 'sala' | 'produzione' | 'utente';

export const INQUADRATURE: Record<Inquadratura, { etichetta: string; centro: Punto; larghezza: number; altezza: number }> = {
  tutto: { etichetta: 'Tutto', centro: [1, 0.5], larghezza: 50, altezza: 33 },
  sala: { etichetta: 'Sala', centro: [9, -5], larghezza: 15, altezza: 17 },
  produzione: { etichetta: 'Produzione', centro: [-12, 0.5], larghezza: 25, altezza: 30 },
  utente: { etichetta: 'Tu', centro: [19.5, 9], larghezza: 11, altezza: 11 },
};

const ELEVAZIONE = THREE.MathUtils.degToRad(55);
const AZIMUT = THREE.MathUtils.degToRad(10);
const DISTANZA = 90;
const DIREZIONE = new THREE.Vector3(Math.sin(AZIMUT) * Math.cos(ELEVAZIONE), Math.sin(ELEVAZIONE), Math.cos(AZIMUT) * Math.cos(ELEVAZIONE)).multiplyScalar(DISTANZA);

// Seguendo chi lavora sul telefono si stringe: con l'inquadratura della sala un omino è alto 19 px.
const ZOOM_SEGUI_TELEFONO = 36;

export function Telecamera({ inquadratura, fuoco, segui, margineSinistro = 0 }: { inquadratura: Inquadratura; fuoco: Punto | null; segui: boolean; margineSinistro?: number }) {
  const controlli = useRef<MapControlsImpl>(null!);
  const { camera, size } = useThree();
  const toccato = useRef(-1e9);
  const meta = useRef({ target: new THREE.Vector3(), zoom: 20, attiva: true });
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const destra = useMemo(() => new THREE.Vector3(), []);
  const altezza = useRef(size.height);
  altezza.current = size.height;

  // Ogni cambio d'inquadratura (o di larghezza dello schermo) fissa una meta: ci si arriva con calma.
  // Non quando cambia solo l'altezza: è la tastiera del telefono, e la vista non deve saltare.
  // In verticale la metà bassa dello schermo è occupata da comandi e dialogo: si guarda più a sud,
  // così il punto d'interesse sale nella parte libera.
  const spostamento = size.width < size.height ? 5.5 : 0;
  const utile = Math.max(200, size.width - margineSinistro);
  useEffect(() => {
    const p = INQUADRATURE[inquadratura];
    const zoom = Math.min(altezza.current / p.altezza, utile / p.larghezza);
    meta.current = { target: new THREE.Vector3(p.centro[0], 0.8, p.centro[1] + spostamento), zoom, attiva: true };
    toccato.current = -1e9;
  }, [inquadratura, utile, spostamento]);

  // Con la chat aperta a sinistra il centro della vista si sposta a destra, nella parte libera.
  const fuoriChat = (v: THREE.Vector3, zoom: number) => {
    if (!margineSinistro) return v;
    destra.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
    return v.addScaledVector(destra, -(margineSinistro / 2) / zoom);
  };

  // Posizione di partenza, una volta sola.
  useEffect(() => {
    const p = INQUADRATURE[inquadratura];
    const t = new THREE.Vector3(p.centro[0], 0.8, p.centro[1]);
    camera.position.copy(t).add(DIREZIONE);
    (camera as THREE.OrthographicCamera).zoom = meta.current.zoom;
    camera.updateProjectionMatrix();
    controlli.current.target.copy(t);
    controlli.current.update();
  }, [camera]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const c = controlli.current;
    if (!c) return;
    const cam = camera as THREE.OrthographicCamera;
    const k = 1 - Math.exp(-2.2 * dt);
    const libero = performance.now() - toccato.current > 6000;
    const m = meta.current;
    // Verso la meta dell'inquadratura finché non tocchi la vista; poi, se attivo, segue chi lavora.
    let destinazione: THREE.Vector3 | null = null;
    let zoomVoluto: number | null = null;
    if (m.attiva) {
      destinazione = fuoriChat(tmp.copy(m.target), m.zoom);
      zoomVoluto = m.zoom;
    } else if (segui && fuoco && libero) {
      zoomVoluto = size.width < 768 ? Math.max(m.zoom, ZOOM_SEGUI_TELEFONO) : null;
      destinazione = fuoriChat(tmp.set(fuoco[0], 0.8, fuoco[1] + (zoomVoluto ? spostamento * (m.zoom / zoomVoluto) : spostamento)), zoomVoluto ?? cam.zoom);
    }
    if (destinazione) {
      const prima = c.target.clone();
      c.target.lerp(destinazione, k);
      camera.position.add(c.target.clone().sub(prima));
      if (zoomVoluto !== null) {
        cam.zoom += (zoomVoluto - cam.zoom) * k;
        cam.updateProjectionMatrix();
      }
      if (m.attiva && c.target.distanceTo(destinazione) < 0.05 && Math.abs(cam.zoom - m.zoom) < 0.05) m.attiva = false;
    }
    // Non uscire dall'edificio.
    const dx = THREE.MathUtils.clamp(c.target.x, -24, 24) - c.target.x;
    const dz = THREE.MathUtils.clamp(c.target.z, -15, 15) - c.target.z;
    if (dx || dz) {
      c.target.x += dx;
      c.target.z += dz;
      camera.position.x += dx;
      camera.position.z += dz;
    }
    c.update();
  });

  return (
    <MapControls
      ref={controlli}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      minZoom={6}
      maxZoom={140}
      minPolarAngle={0.45}
      maxPolarAngle={0.85}
      minAzimuthAngle={-0.6}
      maxAzimuthAngle={0.8}
      onStart={() => {
        toccato.current = performance.now();
        meta.current.attiva = false;
      }}
    />
  );
}
