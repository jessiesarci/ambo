// I cartelli a terra: fascia nera, quadrato colorato con un numero o una sigla, nome in bianco. Li
// usano le stazioni della catena di montaggio e i reparti dell'ufficio. Disegnati su un canvas una
// volta sola; la texture si libera quando il cartello sparisce o cambia testo.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { LIME, NERO } from './pianta.ts';

const W = 768;
const H = 150;

export function Cartello({ sigla, testo, x, z, larghezza = 2.8, colore = LIME, spento = false, rotazione = 0 }: {
  sigla: string;
  testo: string;
  x: number;
  z: number;
  larghezza?: number;
  colore?: string;
  spento?: boolean; // la stazione non serve in questa produzione (le correzioni senza correzioni)
  rotazione?: number;
}) {
  const { mappa, materiale } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { mappa: t, materiale: new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }) };
  }, []);
  useEffect(() => {
    const disegna = () => {
      const g = (mappa.image as HTMLCanvasElement).getContext('2d')!;
      g.fillStyle = NERO;
      g.fillRect(0, 0, W, H);
      g.fillStyle = spento ? '#3a3e44' : colore;
      g.fillRect(0, 0, H, H);
      g.fillStyle = spento ? '#8b9199' : NERO;
      g.font = `bold ${sigla.length > 2 ? 64 : 84}px "Chakra Petch", ui-sans-serif, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(sigla, H / 2, H / 2 + 5);
      g.textAlign = 'left';
      g.fillStyle = spento ? '#8b9199' : '#ffffff';
      g.font = 'bold 62px "Chakra Petch", ui-sans-serif, sans-serif';
      g.fillText(testo.toUpperCase(), H + 26, H / 2 + 5, W - H - 44);
      mappa.needsUpdate = true;
    };
    disegna();
    // Il font arriva dopo il primo disegno: si ridisegna quando c'è.
    let vivo = true;
    void document.fonts?.ready.then(() => vivo && disegna());
    return () => { vivo = false; };
  }, [mappa, sigla, testo, colore, spento]);
  useEffect(() => () => {
    mappa.dispose();
    materiale.dispose();
  }, [mappa, materiale]);
  return (
    <mesh position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, rotazione]} material={materiale} receiveShadow>
      <planeGeometry args={[larghezza, (larghezza * H) / W]} />
    </mesh>
  );
}
