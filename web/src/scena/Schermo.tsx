// Il grande schermo sulla parete della sala: round, stato dei due e quanto sono vicini.
// Disegnato su un canvas 2D usato come texture, così il testo resta nitido e non serve caricare font 3D.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Dibattito } from '../../../motore/tipi.ts';
import { consenso, ETICHETTE_ESITO, ETICHETTE_STATO, type FaseVista } from '../stato.ts';
import { COLORI, SCHERMO } from './pianta.ts';

const CORNICE = new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.4 });
const STAFFA = new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.4, metalness: 0.3 });

const FASI: Record<FaseVista, string> = {
  attesa: 'in attesa',
  ragionamento: 'sta ragionando',
  risposta: 'sta parlando',
  strumento: 'consulta le note',
  errore: 'errore',
  conclusione: 'ha finito',
};

function disegna(ctx: CanvasRenderingContext2D, d: Dibattito | undefined, fase: Record<'claude' | 'codex', FaseVista>) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = '#0b0c0e';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#16181b';
  ctx.fillRect(0, 0, W, 92);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8b9199';
  ctx.font = '600 38px "Chakra Petch", sans-serif';
  ctx.fillText('SALA DEL DIBATTITO', 40, 48);

  if (!d) {
    ctx.fillStyle = '#f3f4f6';
    ctx.font = '600 64px "Chakra Petch", sans-serif';
    ctx.fillText('In attesa di una domanda', 40, 260);
    return;
  }

  const round = Math.max(1, Math.ceil(d.turni.length / 2));
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORI.linea;
  ctx.font = '700 44px "Chakra Petch", sans-serif';
  ctx.fillText(d.esito ? ETICHETTE_ESITO[d.esito].toUpperCase() : `ROUND ${round}/${d.config.maxRound}`, W - 40, 48);
  ctx.textAlign = 'left';

  const righe: ['claude' | 'codex', string, string][] = [
    ['claude', 'Claude', COLORI.claude],
    ['codex', 'Codex', COLORI.codex],
  ];
  const c = consenso(d);
  righe.forEach(([a, nome, colore], i) => {
    const y = 175 + i * 120;
    ctx.fillStyle = colore;
    ctx.beginPath();
    ctx.arc(62, y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f3f4f6';
    ctx.font = '700 54px "Chakra Petch", sans-serif';
    ctx.fillText(nome, 104, y - 4);
    ctx.fillStyle = '#8b9199';
    ctx.font = '500 36px "Chakra Petch", sans-serif';
    const dichiarato = c[a] ? ETICHETTE_STATO[c[a]!] : '—';
    ctx.fillText(`${FASI[fase[a]]} · ${dichiarato}`, 104 + 230, y - 2);
  });

  // Barra del consenso: rosso → ambra → verde.
  const x0 = 40;
  const x1 = W - 40;
  const y = H - 90;
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, COLORI.disaccordo);
  g.addColorStop(0.55, COLORI.parziale);
  g.addColorStop(1, COLORI.accordo);
  ctx.fillStyle = '#1d1f22';
  ctx.fillRect(x0, y, x1 - x0, 34);
  ctx.fillStyle = g;
  ctx.fillRect(x0, y, (x1 - x0) * c.valore, 34);
  ctx.fillStyle = '#8b9199';
  ctx.font = '500 30px "Chakra Petch", sans-serif';
  ctx.fillText('CONSENSO', x0, y - 30);
}

export function Schermo({ dibattito, fase }: { dibattito?: Dibattito; fase: Record<'claude' | 'codex', FaseVista> }) {
  const { canvas, texture, materiale } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 576;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const materiale = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    return { canvas, texture, materiale };
  }, []);

  // Si ridisegna (e si ricarica la texture sulla GPU) solo quando cambia quello che si vede, non a
  // ogni pezzo di testo in arrivo.
  const c = consenso(dibattito);
  const chiave = dibattito ? [dibattito.id, dibattito.turni.length, dibattito.config.maxRound, dibattito.esito ?? '', fase.claude, fase.codex, c.claude ?? '', c.codex ?? ''].join('|') : 'vuoto';
  useEffect(() => {
    const ctx = canvas.getContext('2d')!;
    const ridisegna = () => {
      disegna(ctx, dibattito, fase);
      texture.needsUpdate = true;
    };
    ridisegna();
    // I font arrivano dopo il primo disegno: si ridisegna appena sono pronti.
    void document.fonts.ready.then(ridisegna);
  }, [canvas, texture, chiave]); // eslint-disable-line react-hooks/exhaustive-deps

  const [x, z] = SCHERMO.centro;
  return (
    <group position={[x, SCHERMO.quota, z]}>
      <mesh material={CORNICE} castShadow>
        <boxGeometry args={[SCHERMO.larghezza + 0.08, SCHERMO.altezza + 0.08, 0.05]} />
      </mesh>
      <mesh material={materiale} position={[0, 0, 0.035]}>
        <planeGeometry args={[SCHERMO.larghezza, SCHERMO.altezza]} />
      </mesh>
      <mesh material={STAFFA} position={[0, -SCHERMO.quota / 2 - 0.05, -0.05]}>
        <boxGeometry args={[0.06, SCHERMO.quota - 0.2, 0.05]} />
      </mesh>
    </group>
  );
}
