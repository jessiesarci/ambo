// L'ufficio a reparti: per ogni reparto un tappeto appena colorato con il filo del suo
// colore, il cartello a terra e le postazioni. Il reparto dove qualcuno lavora ha un filo lime che
// pulsa; gli schermi delle postazioni occupate sono accesi (del colore dell'assistente se lavora).
// In Direzione siedono Claude e Codex, con la lavagna della partita aperta tra le due scrivanie.
// Tutto istanziato: poche chiamate di disegno anche con trenta scrivanie.
import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Cartello } from './Cartello.tsx';
import { ArrediUguali, KS, SchermiAccesi, Scrivanie, SchermoAcceso } from './Mobili.tsx';
import { LAVAGNA, LIME, NERO, REPARTI, SCRIVANIA_CLAUDE, SCRIVANIA_CODEX, type IdReparto, type Scrivania } from './pianta.ts';

// Un posto occupato in ufficio: chi c'è, se lavora e di che colore è il suo schermo.
export interface PostoAcceso {
  reparto: IdReparto;
  indice: number;
  lavora: boolean;
  colore: string;
}

export interface DatiLavagna {
  titolo: string;
  stato: string; // "Riunione · intervento 3", "In produzione · 2 di 3"...
  righe: string[]; // il piano: decisioni o pacchetti
}

const PAVIMENTO_UFFICIO = new THREE.Color('#f2f3f5');

// Le scrivanie con schermo dei reparti (la Direzione ha i suoi schermi, gli ospiti non ne hanno).
const SCRIVANIE_REPARTI: { reparto: IdReparto; indice: number; s: Scrivania }[] = REPARTI.filter((r) => r.id !== 'direzione').flatMap((r) => r.scrivanie.map((s, indice) => ({ reparto: r.id, indice, s })));
const TUTTE_LE_SCRIVANIE = REPARTI.flatMap((r) => r.scrivanie);
const SOLO_SCRIVANIE = SCRIVANIE_REPARTI.map((x) => x.s);

// Tappeti e fili a terra: due InstancedMesh di piani orizzontali, colori per copia.
function Pavimenti({ attivi }: { attivi: readonly IdReparto[] }) {
  const { tappeti, fili, accesi } = useMemo(() => {
    const piano = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const tappeti = new THREE.InstancedMesh(piano, new THREE.MeshStandardMaterial({ roughness: 0.62 }), REPARTI.length);
    const fili = new THREE.InstancedMesh(piano, new THREE.MeshStandardMaterial({ roughness: 0.5 }), REPARTI.length * 4);
    // Il reparto attivo: un filo lime appena fuori dal tappeto. Per i reparti fermi la copia è a scala zero.
    const accesi = new THREE.InstancedMesh(piano, new THREE.MeshBasicMaterial({ color: LIME, toneMapped: false }), REPARTI.length * 4);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    REPARTI.forEach((r, i) => {
      const [x0, z0, x1, z1] = r.area;
      tappeti.setMatrixAt(i, m.makeScale(x1 - x0, 1, z1 - z0).setPosition((x0 + x1) / 2, 0.004, (z0 + z1) / 2));
      tappeti.setColorAt(i, c.copy(PAVIMENTO_UFFICIO).lerp(new THREE.Color(r.colore), r.id === 'direzione' ? 0.05 : 0.09));
      const lati = [[(x0 + x1) / 2, z0, x1 - x0, 0.05], [(x0 + x1) / 2, z1, x1 - x0, 0.05], [x0, (z0 + z1) / 2, 0.05, z1 - z0], [x1, (z0 + z1) / 2, 0.05, z1 - z0]] as const;
      lati.forEach(([x, z, w, d], k) => {
        fili.setMatrixAt(i * 4 + k, m.makeScale(w, 1, d).setPosition(x, 0.006, z));
        fili.setColorAt(i * 4 + k, c.set(r.filo ?? r.colore));
      });
    });
    for (const x of [tappeti, fili, accesi]) {
      x.receiveShadow = true;
      x.frustumCulled = false;
    }
    return { tappeti, fili, accesi };
  }, []);

  // Il filo lime solo intorno ai reparti dove qualcuno lavora.
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    REPARTI.forEach((r, i) => {
      const [x0, z0, x1, z1] = r.area;
      const s = attivi.includes(r.id) ? 1 : 0;
      const e = 0.12;
      const lati = [[(x0 + x1) / 2, z0 - e, x1 - x0 + 2 * e + 0.08, 0.08], [(x0 + x1) / 2, z1 + e, x1 - x0 + 2 * e + 0.08, 0.08], [x0 - e, (z0 + z1) / 2, 0.08, z1 - z0 + 2 * e], [x1 + e, (z0 + z1) / 2, 0.08, z1 - z0 + 2 * e]] as const;
      lati.forEach(([x, z, w, d], k) => accesi.setMatrixAt(i * 4 + k, m.makeScale(w * s || 1e-4, 1, d * s || 1e-4).setPosition(x, 0.007, z)));
    });
    accesi.instanceMatrix.needsUpdate = true;
    accesi.visible = attivi.length > 0;
  }, [attivi, accesi]);

  // Il filo pulsa piano: si vede dov'è il lavoro anche da lontano.
  const base = useMemo(() => new THREE.Color(LIME), []);
  useFrame(({ clock }) => {
    if (!accesi.visible) return;
    (accesi.material as THREE.MeshBasicMaterial).color.copy(base).multiplyScalar(0.75 + Math.sin(clock.elapsedTime * 3) * 0.25);
  });

  useEffect(() => () => {
    for (const x of [tappeti, fili, accesi]) {
      x.dispose();
      (x.material as THREE.Material).dispose();
    }
    tappeti.geometry.dispose();
  }, [tappeti, fili, accesi]);

  return (
    <group>
      <primitive object={tappeti} />
      <primitive object={fili} />
      <primitive object={accesi} />
    </group>
  );
}

// La lavagna della Direzione: il titolo della partita aperta, a che punto è e il piano.
function Lavagna({ dati }: { dati: DatiLavagna | null }) {
  const { mappa, materiale } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = Math.round((1024 * LAVAGNA.altezza) / LAVAGNA.larghezza);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { mappa: t, materiale: new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 }) };
  }, []);
  const chiave = JSON.stringify(dati);
  useEffect(() => {
    const disegna = () => {
      const g = (mappa.image as HTMLCanvasElement).getContext('2d')!;
      const W = g.canvas.width;
      const H = g.canvas.height;
      g.fillStyle = '#f7f8f9';
      g.fillRect(0, 0, W, H);
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#8b9199';
      g.font = '600 30px "Chakra Petch", sans-serif';
      g.fillText(dati ? 'PARTITA APERTA' : 'DIREZIONE', 44, 62);
      if (!dati) {
        g.fillStyle = NERO;
        g.font = '700 54px "Chakra Petch", sans-serif';
        g.fillText('Nessuna partita aperta', 44, 170);
        mappa.needsUpdate = true;
        return;
      }
      // Lo stato in una pillola lime, a destra.
      g.font = '700 30px "Chakra Petch", sans-serif';
      const ws = g.measureText(dati.stato.toUpperCase()).width;
      g.fillStyle = LIME;
      g.fillRect(W - 44 - ws - 32, 30, ws + 32, 46);
      g.fillStyle = NERO;
      g.fillText(dati.stato.toUpperCase(), W - 44 - ws - 16, 63);
      // Il titolo su due righe al massimo.
      g.font = '700 56px "Chakra Petch", sans-serif';
      const righeTitolo = aCapo(g, dati.titolo, W - 88, 2);
      righeTitolo.forEach((r, i) => g.fillText(r, 44, 140 + i * 62));
      let y = 140 + righeTitolo.length * 62 + 22;
      g.fillStyle = '#d9dce0';
      g.fillRect(44, y - 30, W - 88, 3);
      g.font = '500 34px "IBM Plex Sans", sans-serif';
      for (const r of dati.righe.slice(0, 4)) {
        if (y > H - 30) break;
        g.fillStyle = LIME;
        g.fillRect(44, y - 14, 14, 14);
        g.fillStyle = '#2a2d31';
        g.fillText(aCapo(g, r, W - 130, 1)[0] ?? '', 76, y + 6);
        y += 50;
      }
      mappa.needsUpdate = true;
    };
    disegna();
    let vivo = true;
    void document.fonts?.ready.then(() => vivo && disegna());
    return () => { vivo = false; };
  }, [mappa, chiave]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    mappa.dispose();
    materiale.dispose();
  }, [mappa, materiale]);

  const [x, z] = LAVAGNA.punto;
  const { larghezza: L, altezza: A } = LAVAGNA;
  const basso = 0.78;
  return (
    <group position={[x, 0, z]}>
      <mesh material={materiale} position={[0, basso + A / 2, 0.026]}>
        <planeGeometry args={[L, A]} />
      </mesh>
      <mesh material={M_LAVAGNA.cornice} position={[0, basso + A / 2, 0]} castShadow>
        <boxGeometry args={[L + 0.08, A + 0.08, 0.05]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (L / 2 - 0.12), 0, 0]}>
          <mesh material={M_LAVAGNA.cornice} position={[0, (basso + A) / 2, -0.03]} castShadow>
            <boxGeometry args={[0.05, basso + A, 0.05]} />
          </mesh>
          <mesh material={M_LAVAGNA.cornice} position={[0, 0.02, -0.03]}>
            <boxGeometry args={[0.07, 0.04, 0.6]} />
          </mesh>
        </group>
      ))}
      {/* La mensola dei pennarelli: un filo lime */}
      <mesh material={M_LAVAGNA.lime} position={[0, basso - 0.03, 0.06]}>
        <boxGeometry args={[L * 0.6, 0.03, 0.07]} />
      </mesh>
    </group>
  );
}
const M_LAVAGNA = {
  cornice: new THREE.MeshStandardMaterial({ color: NERO, roughness: 0.45, metalness: 0.2 }),
  lime: new THREE.MeshBasicMaterial({ color: LIME, toneMapped: false }),
};

// Spezza un testo in righe che stanno nella larghezza; l'ultima finisce coi puntini se avanza.
function aCapo(g: CanvasRenderingContext2D, testo: string, larghezza: number, max: number): string[] {
  const parole = testo.replace(/\s+/g, ' ').trim().split(' ');
  const righe: string[] = [];
  let r = '';
  for (const p of parole) {
    const prova = r ? `${r} ${p}` : p;
    if (g.measureText(prova).width <= larghezza || !r) r = prova;
    else {
      righe.push(r);
      r = p;
      if (righe.length === max) break;
    }
  }
  if (righe.length < max && r) righe.push(r);
  else if (righe.length === max && parole.join(' ') !== righe.join(' ')) {
    let u = righe[max - 1]!;
    while (u.length > 1 && g.measureText(`${u}…`).width > larghezza) u = u.slice(0, -1);
    righe[max - 1] = `${u.replace(/[\s,.;:]+$/, '')}…`;
  }
  return righe;
}

// Piante agli angoli dei reparti (istanziate): verde finto, plastico come il resto.
const PIANTE = REPARTI.filter((r) => r.id !== 'ospiti').flatMap((r) => {
  const [x0, z0, x1, z1] = r.area;
  return r.id === 'direzione' ? [[x0 + 0.45, z0 + 0.45], [x1 - 0.45, z0 + 0.45]] : [[x0 + 0.4, z0 + 0.4]];
}).map(([x, z]) => ({ position: [x!, 0, z!] as [number, number, number] }));

export const Reparti = memo(function Reparti({ posti, attivi, lavagna, schermoClaude, schermoCodex }: {
  posti: readonly PostoAcceso[];
  attivi: readonly IdReparto[];
  lavagna: DatiLavagna | null;
  schermoClaude: THREE.Material;
  schermoCodex: THREE.Material;
}) {
  return (
    <group>
      <Pavimenti attivi={attivi} />
      {REPARTI.map((r) => (
        <Cartello key={r.id} sigla={r.sigla} testo={r.nome} x={r.cartello.punto[0]} z={r.cartello.punto[1]} larghezza={r.cartello.larghezza} colore={r.colore} />
      ))}
      <Scrivanie scrivanie={TUTTE_LE_SCRIVANIE} />
      <SchermiAccesi scrivanie={SOLO_SCRIVANIE} stati={SCRIVANIE_REPARTI.map((x) => posti.find((q) => q.reparto === x.reparto && q.indice === x.indice) ?? null)} />
      <SchermoAcceso scrivania={SCRIVANIA_CLAUDE} materiale={schermoClaude} />
      <SchermoAcceso scrivania={SCRIVANIA_CODEX} materiale={schermoCodex} />
      <Lavagna dati={lavagna} />
      <ArrediUguali n="plant" copie={PIANTE} scala={KS * 1.1} />
    </group>
  );
});
