// L'edificio: a sinistra il magazzino (la produzione, in Produzione.tsx), a destra gli uffici dove si
// decide. Arredo Kenney Furniture Kit (CC0) a scala unica, gruppi funzionali invece di oggetti
// sparsi, vetrate con telai sottili e pareti verso la telecamera basse (vista "in sezione").
import { useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { memo, useLayoutEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { Esito } from '../../../motore/tipi.ts';
import { materialePavimento } from './materiali.ts';
import { Arredo, KS, Scrivanie, SchermoAcceso } from './Mobili.tsx';
import { Navetta } from './Navetta.tsx';
import { ARCHIVIO, COLORI, DIVISORIO_X, LINEA, LIVELLI, PAVIMENTO, RELAX, rivoltoVerso, SALA, STAMPANTE, TAVOLO, UFFICIO_UTENTE, type Scrivania } from './pianta.ts';

export interface ScatolaArchivio {
  id: string;
  esito: Esito | null;
  titolo: string;
}

const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const M = {
  // Magazzino in cemento a lastre grandi, uffici in piastrelle chiare: le due zone si distinguono
  // anche dall'alto. Il bordo scuro lungo i muri è un'ombra finta che regge anche sul telefono.
  pavMagazzino: materialePavimento({ colore: '#c9cdd2', piastrella: 3, giunto: 0.16, macchie: 0.09, roughness: 0.8, bordo: { rettangolo: [-24, -15, 24, 15], forza: 0.2 }, pareti: [[DIVISORIO_X, -15, DIVISORIO_X, 1.6], [DIVISORIO_X, 4.6, DIVISORIO_X, 15]] }),
  pavUfficio: materialePavimento({ colore: '#f2f3f5', piastrella: 1.2, giunto: 0.07, macchie: 0.02, roughness: 0.6, bordo: { rettangolo: [-24, -15, 24, 15], forza: 0.14 }, pareti: [[DIVISORIO_X, -15, DIVISORIO_X, 1.6], [DIVISORIO_X, 4.6, DIVISORIO_X, 15]] }),
  tappetoSala: mat('#16181b', { roughness: 0.9 }),
  parete: mat('#fafbfc', { roughness: 0.85 }),
  pareteScura: mat('#1a1c1f', { roughness: 0.8 }),
  // La testa dei muri è nera, come la sezione in un disegno d'architettura: disegna la pianta.
  cappello: mat('#141518', { roughness: 0.6 }),
  telaio: mat('#141518', { roughness: 0.4, metalness: 0.3 }),
  // Vetro appena azzurrato e lucido: si vede la stanza come volume, e riflette lo studio HDRI.
  vetro: new THREE.MeshStandardMaterial({ color: '#cfe0ec', transparent: true, opacity: 0.26, roughness: 0.04, metalness: 0.15, envMapIntensity: 1.8, depthWrite: false }),
  legno: mat('#f4f5f6', { roughness: 0.5 }),
  scuro: mat('#16181b', { roughness: 0.5 }),
  giallo: mat('#b5f900', { roughness: 0.6, emissive: '#b5f900', emissiveIntensity: 0.18 }),
  blu: mat('#141518', { roughness: 0.45, metalness: 0.25 }),
  arancio: mat('#b5f900', { roughness: 0.5, metalness: 0.1 }),
  grigioPiano: mat('#d9dce0', { roughness: 0.6 }),
};

const COLORE_ESITO: Record<Esito | 'aperto', string> = {
  accordo: COLORI.accordo,
  limite_round: COLORI.parziale,
  limite: COLORI.parziale,
  stallo: COLORI.disaccordo,
  chiuso_da_utente: COLORI.neutro,
  aperto: '#7aa7d9',
};

function Pavimento() {
  const [x0, x1] = PAVIMENTO.x;
  const [z0, z1] = PAVIMENTO.z;
  // Segnaletica gialla: bordo della linea di produzione e corsie degli scaffali.
  const linee = useMemo(() => [
    { x: (LINEA.da + LINEA.a) / 2, z: LINEA.z - 0.85, w: LINEA.da - LINEA.a, d: 0.07 },
    { x: (LINEA.da + LINEA.a) / 2, z: LINEA.z + 0.85, w: LINEA.da - LINEA.a, d: 0.07 },
    { x: -15.5, z: -6.6, w: 15, d: 0.07 },
    { x: -15.5, z: -13.2, w: 15, d: 0.07 },
    { x: -13.5, z: 11.3, w: 19, d: 0.07 },
  ], []);
  const cornice = useMemo(() => {
    const w = SALA.larga - 0.5 - 0.3;
    const d = SALA.profonda - 0.5 - 0.3;
    const [x, z] = SALA.centro;
    const s = 0.04;
    return [
      { x, z: z - d / 2, w: w + s, d: s },
      { x, z: z + d / 2, w: w + s, d: s },
      { x: x - w / 2, z, w: s, d },
      { x: x + w / 2, z, w: s, d },
    ];
  }, []);
  return (
    <group>
      <mesh material={M.pavMagazzino} rotation-x={-Math.PI / 2} position={[(x0 + DIVISORIO_X) / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[DIVISORIO_X - x0, z1 - z0]} />
      </mesh>
      <mesh material={M.pavUfficio} rotation-x={-Math.PI / 2} position={[(x1 + DIVISORIO_X) / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[x1 - DIVISORIO_X, z1 - z0]} />
      </mesh>
      {linee.map((r, i) => (
        <mesh key={i} material={M.giallo} rotation-x={-Math.PI / 2} position={[r.x, 0.004, r.z]}>
          <planeGeometry args={[r.w, r.d]} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[SALA.centro[0], 0.003, SALA.centro[1]]} material={M.tappetoSala} receiveShadow>
        <planeGeometry args={[SALA.larga - 0.5, SALA.profonda - 0.5]} />
      </mesh>
      {/* Filo lime lungo il bordo del tappeto: la sala è il palco, si trova a colpo d'occhio. */}
      {cornice.map((r, i) => (
        <mesh key={`c${i}`} material={M.giallo} rotation-x={-Math.PI / 2} position={[r.x, 0.005, r.z]}>
          <planeGeometry args={[r.w, r.d]} />
        </mesh>
      ))}
    </group>
  );
}

// Parete piena con altezza a scelta. Le facce del box sono +x, -x, +y, -y, +z, -z: la terza è la testa.
function Parete({ da, a, altezza, spessore = 0.16, materiale = M.parete }: { da: [number, number]; a: [number, number]; altezza: number; spessore?: number; materiale?: THREE.Material }) {
  const dx = a[0] - da[0];
  const dz = a[1] - da[1];
  const facce = useMemo(() => [materiale, materiale, M.cappello, materiale, materiale, materiale], [materiale]);
  return (
    <mesh material={facce} position={[(da[0] + a[0]) / 2, altezza / 2, (da[1] + a[1]) / 2]} rotation-y={-Math.atan2(dz, dx)} castShadow receiveShadow>
      <boxGeometry args={[Math.hypot(dx, dz), altezza, spessore]} />
    </mesh>
  );
}

// Vetrate leggere: lastre quasi trasparenti e telai da 5 cm, niente ombre dal vetro. Tutte insieme in
// due InstancedMesh (lastre e telai): prima erano una settantina di mesh, cioè altrettante chiamate di
// disegno a ogni passata (scena, ombre, occlusione).
type Segmento = { da: [number, number]; a: [number, number]; altezza?: number };
function Vetrate({ segmenti }: { segmenti: Segmento[] }) {
  const { lastre, telai } = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const pezzi: THREE.Matrix4[] = [];
    const vetri: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const y = new THREE.Vector3(0, 1, 0);
    const pezzo = (cx: number, cz: number, ang: number, lx: number, py: number, w: number, h: number, d: number) => {
      // Un pezzo lungo il segmento: lx è lo spostamento lungo la vetrata dal suo centro.
      const px = cx + Math.cos(ang) * lx;
      const pz = cz - Math.sin(ang) * lx;
      return new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), q.setFromAxisAngle(y, ang).clone(), new THREE.Vector3(w, h, d));
    };
    for (const { da, a, altezza = 2.3 } of segmenti) {
      const dx = a[0] - da[0];
      const dz = a[1] - da[1];
      const lungo = Math.hypot(dx, dz);
      const ang = -Math.atan2(dz, dx);
      const cx = (da[0] + a[0]) / 2;
      const cz = (da[1] + a[1]) / 2;
      const montanti = Math.max(1, Math.round(lungo / 1.8));
      vetri.push(pezzo(cx, cz, ang, 0, altezza / 2, lungo, altezza, 0.02));
      pezzi.push(pezzo(cx, cz, ang, 0, altezza, lungo, 0.05, 0.05));
      pezzi.push(pezzo(cx, cz, ang, 0, 0.025, lungo, 0.05, 0.05));
      for (let i = 0; i <= montanti; i++) pezzi.push(pezzo(cx, cz, ang, -lungo / 2 + (i * lungo) / montanti, altezza / 2, 0.05, altezza, 0.05));
    }
    const lastre = new THREE.InstancedMesh(box, M.vetro, vetri.length);
    vetri.forEach((m, i) => lastre.setMatrixAt(i, m));
    lastre.renderOrder = 1;
    const telai = new THREE.InstancedMesh(box, M.telaio, pezzi.length);
    pezzi.forEach((m, i) => telai.setMatrixAt(i, m));
    telai.castShadow = true;
    for (const x of [lastre, telai]) x.computeBoundingSphere();
    return { lastre, telai };
  }, [segmenti]);
  return (
    <>
      <primitive object={telai} />
      <primitive object={lastre} />
    </>
  );
}

function TavoloRiunioni() {
  const [x, z] = TAVOLO.centro;
  return (
    <group position={[x, 0, z]}>
      <mesh material={M.legno} position={[0, 0.74, 0]} scale={[TAVOLO.lungo / 2, 1, TAVOLO.largo / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[1, 1, 0.05, 48]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={M.scuro} position={[s * TAVOLO.lungo * 0.27, 0.36, 0]} castShadow>
          <boxGeometry args={[0.08, 0.72, TAVOLO.largo * 0.45]} />
        </mesh>
      ))}
    </group>
  );
}

// Lo scaffale dell'archivio a fine nastro: ogni scatola è un dibattito concluso, con un'etichetta
// del colore dell'esito. Cliccandola si riapre la partita.
function ScaffaleArchivio({ archivio, onScatola }: { archivio: ScatolaArchivio[]; onScatola?: (id: string) => void }) {
  const [sopra, setSopra] = useState<number | null>(null);
  useCursor(sopra !== null);
  const lungo = ARCHIVIO.z[1] - ARCHIVIO.z[0];
  const zc = (ARCHIVIO.z[0] + ARCHIVIO.z[1]) / 2;
  const posti = Math.floor(lungo / 0.95);
  const scatole = useMemo(() => new THREE.InstancedMesh(new THREE.BoxGeometry(), mat('#eef0f2', { roughness: 0.75 }), 64), []);
  const etichette = useMemo(() => new THREE.InstancedMesh(new THREE.PlaneGeometry(), mat('#ffffff', { roughness: 0.5 }), 64), []);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qe = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const c = new THREE.Color();
    let n = 0;
    archivio.slice(0, LIVELLI.length * posti).forEach((voce, i) => {
      const livello = Math.floor(i / posti);
      const k = i % posti;
      // Dal basso e dal lato del nastro: le partite più recenti sono a portata di mano.
      const z = ARCHIVIO.z[0] + 0.5 + (posti - 1 - k) * 0.95;
      const y = LIVELLI[livello]! + 0.33;
      const s = i === sopra ? 1.08 : 1;
      m.compose(new THREE.Vector3(ARCHIVIO.x, y, z), q, new THREE.Vector3(0.95 * s, 0.6 * s, 0.8 * s));
      scatole.setMatrixAt(n, m);
      scatole.setColorAt(n, c.set(i === sopra ? '#ffffff' : '#e3e6e9'));
      m.compose(new THREE.Vector3(ARCHIVIO.x + 0.485 * s, y, z), qe, new THREE.Vector3(0.5, 0.26, 1));
      etichette.setMatrixAt(n, m);
      etichette.setColorAt(n, c.set(COLORE_ESITO[voce.esito ?? 'aperto']));
      n++;
    });
    scatole.count = n;
    etichette.count = n;
    scatole.instanceMatrix.needsUpdate = true;
    etichette.instanceMatrix.needsUpdate = true;
    if (scatole.instanceColor) scatole.instanceColor.needsUpdate = true;
    if (etichette.instanceColor) etichette.instanceColor.needsUpdate = true;
  }, [archivio, sopra, posti, scatole, etichette]);

  const indice = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId !== undefined && e.instanceId < archivio.length ? e.instanceId : undefined);

  return (
    <group>
      <group position={[ARCHIVIO.x, 0, zc]}>
        {LIVELLI.map((y) => (
          <group key={y} position={[0, y, 0]}>
            <mesh material={M.grigioPiano} receiveShadow>
              <boxGeometry args={[1.3, 0.03, lungo]} />
            </mesh>
            {[-0.66, 0.66].map((x) => (
              <mesh key={x} material={M.arancio} position={[x, 0.02, 0]} castShadow>
                <boxGeometry args={[0.07, 0.12, lungo]} />
              </mesh>
            ))}
          </group>
        ))}
        {Array.from({ length: 4 }, (_, k) =>
          [-0.66, 0.66].map((x) => (
            <mesh key={`${k}${x}`} material={M.blu} position={[x, 1.6, -lungo / 2 + (k * lungo) / 3]} castShadow>
              <boxGeometry args={[0.07, 3.2, 0.07]} />
            </mesh>
          )),
        )}
      </group>
      {/* frustumCulled spento: il volume di riferimento è quello della geometria unitaria all'origine */}
      <primitive
        object={scatole}
        frustumCulled={false}
        castShadow
        receiveShadow
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          const a = indice(e);
          setSopra(a ?? null);
          if (a !== undefined) e.stopPropagation();
        }}
        onPointerOut={() => setSopra(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          const a = indice(e);
          if (a === undefined) return;
          e.stopPropagation();
          onScatola?.(archivio[a]!.id);
        }}
      />
      <primitive object={etichette} frustumCulled={false} />
    </group>
  );
}

// Le vetrate della sala (porte a nord) e del tuo ufficio (porta a ovest); a sud sono basse.
const VETRATE: Segmento[] = (() => {
  const [sx, sz] = SALA.centro;
  const x0 = sx - SALA.larga / 2;
  const x1 = sx + SALA.larga / 2;
  const z0 = sz - SALA.profonda / 2;
  const z1 = sz + SALA.profonda / 2;
  const [[a0, a1], [b0, b1]] = SALA.porte as [[number, number], [number, number]];
  const jm = UFFICIO_UTENTE.min;
  const jM = UFFICIO_UTENTE.max;
  return [
    { da: [x0, z0], a: [a0, z0] }, { da: [a1, z0], a: [b0, z0] }, { da: [b1, z0], a: [x1, z0] },
    { da: [x0, z0], a: [x0, z1] }, { da: [x1, z0], a: [x1, z1] }, { da: [x0, z1], a: [x1, z1], altezza: 0.9 },
    { da: [jm[0], jm[1]], a: [jM[0], jm[1]] }, { da: [jm[0], jm[1]], a: [jm[0], 7] }, { da: [jm[0], 9.2], a: [jm[0], jM[1]] },
    { da: [jm[0], jM[1]], a: [jM[0], jM[1]], altezza: 0.9 },
  ];
})();

// La scrivania dell'utente, nel suo ufficio: si siede a nord e guarda a sud, verso la porta.
const SCRIVANIA_UTENTE: Scrivania = { punto: [UFFICIO_UTENTE.scrivania[0], UFFICIO_UTENTE.scrivania[1] - 0.2], rotazione: Math.PI };
const SCRIVANIE_UTENTE = [SCRIVANIA_UTENTE];

// Il portatile al tavolo della sala, rivolto a chi siede in testa al tavolo, con lo schermo che si
// accende quando il capo reparto ci pensa (lo stesso materiale dello schermo della sua scrivania).
function Portatile({ x, verso, schermo }: { x: number; verso: number; schermo: THREE.Material }) {
  return (
    <Arredo n="laptop" position={[x, 0.765, TAVOLO.centro[1]]} rotation={verso}>
      <mesh material={schermo} position={[0, 0.176, 0.13]} rotation={[0.39, Math.PI, 0]}>
        <planeGeometry args={[0.4, 0.21]} />
      </mesh>
    </Arredo>
  );
}

function Ufficio({ schermoClaude, schermoCodex, schermoUtente, onStampante }: { schermoClaude: THREE.Material; schermoCodex: THREE.Material; schermoUtente: THREE.Material; onStampante?: () => void }) {
  const [sx, sz] = SALA.centro;
  const x0 = sx - SALA.larga / 2;
  const x1 = sx + SALA.larga / 2;
  const z1 = sz + SALA.profonda / 2;
  const [stampanteSopra, setStampanteSopra] = useState(false);
  useCursor(stampanteSopra && !!onStampante);

  return (
    <group>
      {/* Sala riunioni */}
      <Vetrate segmenti={VETRATE} />
      <TavoloRiunioni />
      {/* Le sedie guardano il tavolo: il kit ha il fronte verso -z. */}
      <Arredo n="chair-desk" position={[TAVOLO.centro[0] - 2.95, 0, TAVOLO.centro[1]]} rotation={rivoltoVerso(1, 0)} />
      <Arredo n="chair-desk" position={[TAVOLO.centro[0] + 2.95, 0, TAVOLO.centro[1]]} rotation={rivoltoVerso(-1, 0)} />
      {[-1.25, 0, 1.25].map((dx) => (
        <group key={dx}>
          <Arredo n="chair-desk" position={[TAVOLO.centro[0] + dx, 0, TAVOLO.centro[1] - 1.4]} rotation={rivoltoVerso(0, 1)} />
          <Arredo n="chair-desk" position={[TAVOLO.centro[0] + dx, 0, TAVOLO.centro[1] + 1.4]} rotation={rivoltoVerso(0, -1)} />
        </group>
      ))}
      {/* I portatili guardano chi siede in testa al tavolo (prima guardavano il centro). */}
      <Portatile x={TAVOLO.centro[0] - 1.7} verso={rivoltoVerso(-1, 0)} schermo={schermoClaude} />
      <Portatile x={TAVOLO.centro[0] + 1.7} verso={rivoltoVerso(1, 0)} schermo={schermoCodex} />
      <Arredo n="plant-small" scala={KS * 1.6} position={[TAVOLO.centro[0], 0.765, TAVOLO.centro[1]]} />
      <Arredo n="plant" position={[x0 + 0.45, 0, z1 - 0.45]} />
      <Arredo n="plant" position={[x1 - 0.45, 0, z1 - 0.45]} />

      {/* Librerie lungo la parete nord, rivolte verso l'ufficio (prima mostravano il retro). */}
      {[0.6, 8.8, 16.6].map((x) => (
        <Arredo key={x} n="bookcase-wide" position={[x, 0, -14.56]} rotation={rivoltoVerso(0, 1)} />
      ))}
      {[2.6, 7.2, 10.9, 23.1].map((x) => (
        <Arredo key={x} n="plant" position={[x, 0, -14.45]} />
      ))}

      {/* Angolo stampante: mobile, stampante, pianta e cestino. A fine partita il documento esce da qui:
          il fattorino lo prende dal lato sud, e mobile e stampante guardano lui. */}
      <group
        onPointerOver={(e) => { e.stopPropagation(); setStampanteSopra(true); }}
        onPointerOut={() => setStampanteSopra(false)}
        onClick={(e) => { if (onStampante) { e.stopPropagation(); onStampante(); } }}
      >
        <Arredo n="side-drawers" position={[STAMPANTE[0], 0, STAMPANTE[1]]} rotation={rivoltoVerso(0, 1)} />
        <Arredo n="printer" altezza={0.42} position={[STAMPANTE[0], 0.74, STAMPANTE[1]]} rotation={rivoltoVerso(0, 1)} />
      </group>
      <Arredo n="plant" position={[STAMPANTE[0] - 1.05, 0, STAMPANTE[1]]} />
      <Arredo n="trashcan" position={[STAMPANTE[0] + 0.85, 0, STAMPANTE[1] + 0.1]} />
      <Arredo n="corkboard" larghezza={1.4} position={[DIVISORIO_X + 0.12, 1.2, -7.5]} rotation={rivoltoVerso(1, 0)} />

      {/* Zona relax a est, la sala d'attesa degli ospiti: divano e poltrone guardano il tavolino. */}
      <Arredo n="rug" scala={KS * 1.4} position={[20.8, 0, -1.6]} rotation={Math.PI / 2} />
      <Arredo n="sofa-long" position={[RELAX.divano.punto[0], 0, RELAX.divano.punto[1]]} rotation={RELAX.divano.rotazione} />
      {RELAX.poltrone.map((p) => (
        <Arredo key={p.punto[1]} n="lounge-chair" position={[p.punto[0], 0, p.punto[1]]} rotation={p.rotazione} />
      ))}
      <Arredo n="coffee-table" position={[RELAX.tavolino[0], 0, RELAX.tavolino[1]]} rotation={Math.PI / 2} />
      <Arredo n="lamp-floor" position={[23.3, 0, -3.75]} />
      <Arredo n="plant" scala={KS * 1.2} position={[23.25, 0, 0.55]} />

      {/* Angolo caffè a sud */}
      <Arredo n="kitchen-bar" scala={KS * 1.1} position={[3.4, 0, 13.9]} />
      <Arredo n="kitchen-bar" scala={KS * 1.1} position={[4.35, 0, 13.9]} />
      <Arredo n="coffee-machine" position={[3.4, 0.86, 13.85]} />
      <Arredo n="plant" position={[1.9, 0, 13.9]} />
      <Arredo n="coat-rack" position={[0.2, 0, 13.6]} />

      {/* Il tuo ufficio */}
      <Arredo n="rug-round" scala={KS * 1.3} position={[UFFICIO_UTENTE.scrivania[0], 0, UFFICIO_UTENTE.scrivania[1] - 0.3]} />
      <Scrivanie scrivanie={SCRIVANIE_UTENTE} extra={false} />
      <Arredo n="lamp-table" position={[SCRIVANIA_UTENTE.punto[0] + 0.52, 0.745, SCRIVANIA_UTENTE.punto[1] + 0.16]} />
      <SchermoAcceso scrivania={SCRIVANIA_UTENTE} materiale={schermoUtente} />
      <Arredo n="bookcase-wide" position={[17.3, 0, 4.85]} rotation={rivoltoVerso(0, 1)} />
      {/* Il divano lime contro la parete est, rivolto verso la stanza: prima stava girato verso la
          vetrata sud e la toccava. */}
      <Arredo n="sofa-long" position={[22.55, 0, 10.9]} rotation={rivoltoVerso(-1, 0)} />
      <Arredo n="coffee-table" position={[20.75, 0, 10.9]} rotation={Math.PI / 2} />
      <Arredo n="plant" scala={KS * 1.2} position={[23, 0, 5.2]} />
      <Arredo n="speaker" position={[16.1, 0, 12.9]} />
    </group>
  );
}

// L'edificio non dipende dalla partita: si ridisegna solo se cambiano archivio o schermi, non a ogni
// istantanea né a ogni etichetta.
export const Edificio = memo(function Edificio(p: {
  archivio: ScatolaArchivio[];
  onScatola?: (id: string) => void;
  onStampante?: () => void;
  schermoClaude: THREE.Material;
  schermoCodex: THREE.Material;
  schermoUtente: THREE.Material;
}) {
  const [x0, x1] = PAVIMENTO.x;
  const [z0, z1] = PAVIMENTO.z;
  return (
    <group>
      <Pavimento />
      {/* A nord e a ovest pareti alte; a est e a sud basse, per vedere dentro come in sezione. */}
      <Parete da={[x0, z0]} a={[x1, z0]} altezza={3} spessore={0.3} />
      <Parete da={[x0, z0]} a={[x0, z1]} altezza={3} spessore={0.3} />
      <Parete da={[x1, z0]} a={[x1, z1]} altezza={1} spessore={0.3} />
      <Parete da={[x0, z1]} a={[-21, z1]} altezza={0.35} spessore={0.3} materiale={M.pareteScura} />
      <Parete da={[-17, z1]} a={[x1, z1]} altezza={0.35} spessore={0.3} materiale={M.pareteScura} />
      <Parete da={[DIVISORIO_X, z0]} a={[DIVISORIO_X, 1.6]} altezza={2.6} />
      <Parete da={[DIVISORIO_X, 4.6]} a={[DIVISORIO_X, z1]} altezza={2.6} />
      <ScaffaleArchivio archivio={p.archivio} onScatola={p.onScatola} />
      <Navetta x={[-19, -9]} z={9.7} />
      <Ufficio schermoClaude={p.schermoClaude} schermoCodex={p.schermoCodex} schermoUtente={p.schermoUtente} onStampante={p.onStampante} />
    </group>
  );
});
