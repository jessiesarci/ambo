// Il magazzino: la catena di montaggio fedele alle fasi vere della produzione. Cinque
// stazioni lungo il nastro: 1 Piano (la sintesi approvata), 2 Costruzione (una postazione per
// pacchetto, con chi lo costruisce), 3 Collaudo (il banco di Codex e degli assistenti di collaudo
// della procedura), 4 Correzioni (solo se il collaudo le chiede), 5 Consegna, poi l'archivio.
// La scatola del lavoro sta alla stazione dove la produzione è davvero; ogni pacchetto finito lascia
// una scatoletta lime sulla sua postazione. Intorno, gli armadi server con le spie.
// Modelli: Kenney Factory Kit 3.0 (CC0) per nastro, bracci e scanner; il resto è fatto a mano.
import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { coloreAgente } from '../avatar.ts';
import { Cartello } from './Cartello.tsx';
import { Modello, precarica } from './Modello.tsx';
import { SchermiAccesi, Scrivanie, type StatoSchermo } from './Mobili.tsx';
import { CARTELLI_LINEA_Z, COLLAUDO, COLORI, LIME, LINEA, NERO, SCRIVANIA_CORREZIONI, scrivanieCostruzione, STAZIONI, type Stazione } from './pianta.ts';
import type { StatoCatena, TonoScatola } from './reparti.ts';

const F = (n: string) => `/modelli/fabbrica/${n}.glb`;

precarica([F('conveyor-long-stripe-sides'), F('machine-window'), F('robot-arm-a'), F('robot-arm-b'), F('scanner-high'), F('hopper-square'), F('screen-hanging-wide')]);

const TONO: Record<TonoScatola, string> = { lavoro: LIME, pronta: LIME, rivedere: '#c4c8ce', ferma: '#9aa0a6', errore: COLORI.errore };

// Dove sta la scatola sul nastro, per stazione (alla costruzione: davanti alla postazione del pacchetto).
function xScatola(stazione: Stazione, indice: number | undefined, n: number): number {
  if (stazione === 2 && indice !== undefined) return scrivanieCostruzione(n)[Math.min(indice, n - 1)]?.punto[0] ?? STAZIONI[2].x;
  return STAZIONI[stazione].x;
}

// La scatola del lavoro: scivola sul nastro fino alla stazione vera, senza salti. In più, a fine
// riunione, la decisione appena arrivata fa il suo giro dalla porta (fino al Piano se va in produzione,
// fino all'archivio se è un verbale).
function Scatole({ idProduzione, catena, consegna, decisione, finoAlPiano, ancora }: {
  idProduzione: string;
  catena: StatoCatena;
  consegna: number;
  decisione: boolean;
  finoAlPiano: boolean;
  ancora?: (o: THREE.Object3D | null) => void;
}) {
  const lavoro = useRef<THREE.Group>(null!);
  const materiale = useMemo(() => new THREE.MeshStandardMaterial({ color: LIME, roughness: 0.55, emissive: LIME, emissiveIntensity: 0.2 }), []);
  const speciale = useRef<THREE.Mesh>(null!);
  const avvio = useRef<number | null>(null);
  const ultimo = useRef(consegna);
  const s = catena.scatola;
  const meta = s ? xScatola(s.stazione, s.indice, catena.pacchetti.length) : LINEA.da;
  const colore = s ? TONO[s.tono] : LIME;
  const fine = finoAlPiano ? STAZIONI[1].x : LINEA.a;

  useFrame(({ clock }, dt) => {
    const g = lavoro.current;
    g.visible = !!s;
    // Sparita la produzione, la prossima (anche di un'altra partita) non parte da qui.
    if (!s) g.userData.produzione = undefined;
    if (s) {
      // Una produzione nuova, o un'altra partita, compare già al suo posto; poi scivola a 1,2 m/s circa.
      if (g.userData.produzione !== idProduzione) {
        g.position.x = meta;
        g.userData.produzione = idProduzione;
      }
      g.position.x = THREE.MathUtils.damp(g.position.x, meta, 1.6, Math.min(dt, 0.1));
      materiale.color.set(colore);
      materiale.emissive.set(s.tono === 'lavoro' || s.tono === 'pronta' ? LIME : '#000000');
      materiale.emissiveIntensity = s.tono === 'lavoro' ? 0.18 + Math.sin(clock.elapsedTime * 3) * 0.1 : 0.2;
    }
    if (consegna !== ultimo.current) {
      ultimo.current = consegna;
      avvio.current = clock.elapsedTime;
    }
    const sp = speciale.current;
    if (avvio.current !== null) {
      const f = ((clock.elapsedTime - avvio.current) * 0.9) / (LINEA.da - fine);
      sp.visible = f < 1 && f >= 0;
      sp.position.set(LINEA.da - Math.min(Math.max(f, 0), 1) * (LINEA.da - fine), 0.47, LINEA.z);
      if (f >= 1 || f < 0) avvio.current = null;
    } else sp.visible = false;
  });

  return (
    <>
      <group ref={lavoro} position={[meta, 0, LINEA.z]} visible={false}>
        <mesh material={materiale} position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.62, 0.48, 0.56]} />
        </mesh>
        {/* il nastro adesivo nero: si capisce che è una scatola anche dall'alto */}
        <mesh material={M.nastro} position={[0, 0.745, 0]}>
          <boxGeometry args={[0.63, 0.012, 0.12]} />
        </mesh>
        <group ref={ancora} position={[0, 1.15, 0]} />
      </group>
      <mesh ref={speciale} visible={false} castShadow>
        <boxGeometry args={[0.55, 0.42, 0.5]} />
        <meshStandardMaterial color={decisione ? COLORI.linea : '#c4c8ce'} roughness={0.55} emissive={decisione ? COLORI.linea : '#000000'} emissiveIntensity={0.25} />
      </mesh>
    </>
  );
}

// Armadi server in file: neri, con le fessure delle unità e una spia per unità su ogni faccia. Le spie
// cambiano a caso tra lime, bianco e spento (solo con la grafica piena: ridotto le tiene ferme).
const FILE_SERVER = [
  { x: [-22.6, -18.2] as [number, number], z: -11.6, alto: 2.3 },
  { x: [-17.8, -13.4] as [number, number], z: -11.6, alto: 2.3 },
  { x: [-13, -8.6] as [number, number], z: -11.6, alto: 2.3 },
  { x: [-22.6, -18.2] as [number, number], z: -8.1, alto: 2.3 },
  { x: [-17.8, -13.4] as [number, number], z: -8.1, alto: 2.3 },
  { x: [-13, -8.6] as [number, number], z: -8.1, alto: 2.3 },
  // Unità basse lungo la parete sud.
  { x: [-20.8, -14.4] as [number, number], z: 12.6, alto: 1.15 },
];
const LARGO_UNITA = 0.72;
const PROFONDO = 0.95;
const M = {
  armadio: new THREE.MeshStandardMaterial({ color: NERO, roughness: 0.42, metalness: 0.35 }),
  fessura: new THREE.MeshStandardMaterial({ color: '#2a2d31', roughness: 0.6 }),
  lime: new THREE.MeshBasicMaterial({ color: LIME, toneMapped: false }),
  nastro: new THREE.MeshStandardMaterial({ color: NERO, roughness: 0.5 }),
  fatto: new THREE.MeshStandardMaterial({ color: LIME, roughness: 0.55, emissive: LIME, emissiveIntensity: 0.15 }),
  fallito: new THREE.MeshStandardMaterial({ color: COLORI.errore, roughness: 0.55 }),
};
const SPIE = [new THREE.Color(LIME), new THREE.Color('#ffffff'), new THREE.Color('#2a2d31'), new THREE.Color(LIME)];

function ArmadiServer({ ridotto }: { ridotto: boolean }) {
  const { armadi, fessure, spie, n } = useMemo(() => {
    const unita: { x: number; z: number; alto: number }[] = [];
    for (const f of FILE_SERVER) for (let x = f.x[0] + LARGO_UNITA / 2; x <= f.x[1] - LARGO_UNITA / 2 + 0.01; x += LARGO_UNITA + 0.02) unita.push({ x, z: f.z, alto: f.alto });
    const o = new THREE.Object3D();
    const armadi = new THREE.InstancedMesh(new THREE.BoxGeometry(), M.armadio, unita.length);
    const piani = unita.reduce((s, u) => s + Math.floor(u.alto / 0.26) * 2, 0);
    const fessure = new THREE.InstancedMesh(new THREE.BoxGeometry(), M.fessura, piani);
    const spie = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ toneMapped: false }), piani);
    let k = 0;
    unita.forEach((u, i) => {
      o.position.set(u.x, u.alto / 2, u.z);
      o.rotation.set(0, 0, 0);
      o.scale.set(LARGO_UNITA, u.alto, PROFONDO);
      o.updateMatrix();
      armadi.setMatrixAt(i, o.matrix);
      for (let y = 0.2; y < u.alto - 0.12; y += 0.26) {
        for (const lato of [-1, 1]) {
          o.position.set(u.x, y, u.z + lato * (PROFONDO / 2 + 0.006));
          o.scale.set(LARGO_UNITA - 0.1, 0.17, 0.012);
          o.updateMatrix();
          fessure.setMatrixAt(k, o.matrix);
          o.position.set(u.x + LARGO_UNITA / 2 - 0.12, y, u.z + lato * (PROFONDO / 2 + 0.014));
          o.scale.set(0.07, 0.025, 0.01);
          o.updateMatrix();
          spie.setMatrixAt(k, o.matrix);
          spie.setColorAt(k, SPIE[Math.floor(Math.abs(Math.sin(i * 12.9 + y * 78.2 + lato)) * 4) % 4]!);
          k++;
        }
      }
    });
    for (const m of [armadi, fessure, spie]) m.frustumCulled = false;
    armadi.castShadow = true;
    armadi.receiveShadow = true;
    return { armadi, fessure, spie, n: k };
  }, []);

  // Una manciata di spie cambia stato ogni 0,15 s: il lavoro dei server, senza costare nulla.
  const ultimo = useRef(0);
  useFrame(({ clock }) => {
    if (ridotto) return;
    if (clock.elapsedTime < ultimo.current) ultimo.current = clock.elapsedTime;
    if (clock.elapsedTime - ultimo.current < 0.15) return;
    ultimo.current = clock.elapsedTime;
    for (let i = 0; i < 14; i++) spie.setColorAt(Math.floor(Math.random() * n), SPIE[Math.floor(Math.random() * SPIE.length)]!);
    spie.instanceColor!.needsUpdate = true;
  });

  return (
    <group>
      <primitive object={armadi} />
      <primitive object={fessure} />
      <primitive object={spie} />
      {FILE_SERVER.map((f, i) => (
        <mesh key={i} material={M.lime} position={[(f.x[0] + f.x[1]) / 2, f.alto + 0.012, f.z]}>
          <boxGeometry args={[f.x[1] - f.x[0] - 0.1, 0.025, 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

// Il banco del collaudo: lungo e nero, con tre schermi inclinati verso chi sta in piedi a sud.
function BancoCollaudo({ acceso }: { acceso: boolean }) {
  const schermo = useMemo(() => new THREE.MeshBasicMaterial({ color: '#15171a', toneMapped: false }), []);
  useFrame(({ clock }) => {
    schermo.color.set(acceso ? LIME : '#15171a');
    if (acceso) schermo.color.multiplyScalar(0.7 + Math.sin(clock.elapsedTime * 4) * 0.25);
  });
  const [xa, xb] = COLLAUDO.x;
  const lungo = Math.abs(xb - xa);
  const cx = (xa + xb) / 2;
  return (
    <group position={[cx, 0, COLLAUDO.z]}>
      <mesh material={M.armadio} position={[0, 0.48, 0]} castShadow receiveShadow>
        <boxGeometry args={[lungo, 0.96, 0.6]} />
      </mesh>
      {[-1, 0, 1].map((k) => (
        <mesh key={k} material={schermo} position={[k * lungo * 0.31, 1.04, 0.06]} rotation-x={-0.95}>
          <boxGeometry args={[0.72, 0.4, 0.025]} />
        </mesh>
      ))}
      <mesh material={M.lime} position={[0, 0.03, 0.301]}>
        <boxGeometry args={[lungo, 0.04, 0.01]} />
      </mesh>
    </group>
  );
}

export const Produzione = memo(function Produzione({ idProduzione, catena, consegna, decisione, finoAlPiano, ridotto, ancora }: {
  idProduzione: string; // partita e inizio della produzione: se cambia, la scatola non scivola dalla vecchia stazione
  catena: StatoCatena;
  consegna: number;
  decisione: boolean;
  finoAlPiano: boolean; // la decisione appena arrivata va in produzione: si ferma al Piano
  ridotto: boolean;
  ancora?: (o: THREE.Object3D | null) => void; // per l'etichetta della scatola del lavoro
}) {
  const segmenti = useMemo(() => {
    const s: number[] = [];
    for (let x = LINEA.da - 1; x > LINEA.a; x -= 2) s.push(x);
    return s;
  }, []);
  const z = LINEA.z;
  // Senza produzione la costruzione ha due postazioni libere; con la produzione una per pacchetto.
  const n = catena.pacchetti.length || 2;
  const costruzione = useMemo(() => scrivanieCostruzione(n), [n]);
  const scrivanie = useMemo(() => [...costruzione, SCRIVANIA_CORREZIONI], [costruzione]);
  const correzione = catena.lavora && catena.posti.get(catena.lavora.id)?.dove === 'correzioni' ? catena.lavora.id : undefined;
  const stati: (StatoSchermo | null)[] = [
    ...costruzione.map((_, i) => {
      const p = catena.pacchetti[i];
      if (!p) return null;
      return p.stato === 'in_corso' ? { colore: coloreAgente(p.assistente), lavora: catena.attiva } : p.stato === 'fatto' ? { colore: LIME, lavora: false } : null;
    }),
    correzione ? { colore: coloreAgente(correzione), lavora: true } : null,
  ];
  // Una scatoletta sulla postazione di ogni pacchetto finito (rossa se non è riuscito).
  const finiti = catena.pacchetti.map((p, i) => ({ p, s: costruzione[i] })).filter((x) => x.s && (x.p.stato === 'fatto' || x.p.stato === 'fallito'));
  const quale = catena.scatola?.stazione;

  return (
    <group>
      {/* Il nastro e le sue macchine */}
      {segmenti.map((x) => (
        <Modello key={x} url={F('conveyor-long-stripe-sides')} larghezza={2} position={[x, 0, z]} />
      ))}
      <Modello url={F('hopper-square')} altezza={1.1} position={[STAZIONI[1].x, 0, z - 1.3]} />
      {/* La macchina chiude la costruzione: la scatola davanti alle postazioni resta in vista. */}
      <Modello url={F('machine-window')} profondita={1.5} position={[-11.85, 0, z]} rotation={Math.PI / 2} />
      <Modello url={F('screen-hanging-wide')} larghezza={0.9} position={[-11.85, 1.6, z - 1.1]} />
      <Modello url={F('robot-arm-a')} altezza={2.6} position={[-6.4, 0, z - 1.25]} rotation={Math.PI} />
      <Modello url={F('scanner-high')} altezza={1.5} position={[STAZIONI[3].x, 0, z]} rotation={Math.PI / 2} />
      <Modello url={F('robot-arm-b')} altezza={2.4} position={[STAZIONI[4].x, 0, z - 1.25]} rotation={Math.PI} />
      <Scatole idProduzione={idProduzione} catena={catena} consegna={consegna} decisione={decisione} finoAlPiano={finoAlPiano} ancora={ancora} />

      {/* Le stazioni: postazioni della costruzione e delle correzioni, banco del collaudo */}
      <Scrivanie scrivanie={scrivanie} extra={false} />
      <SchermiAccesi scrivanie={scrivanie} stati={stati} />
      {finiti.map(({ p, s }, i) => (
        <mesh key={i} material={p.stato === 'fatto' ? M.fatto : M.fallito} position={[s!.punto[0] + 0.45, 0.745 + 0.11, s!.punto[1] + 0.05]} castShadow>
          <boxGeometry args={[0.26, 0.22, 0.24]} />
        </mesh>
      ))}
      <BancoCollaudo acceso={quale === 3 && !!catena.attiva} />

      {/* I cartelli delle stazioni: il nome della fase, non della CLI. Le correzioni restano spente
          finché il collaudo non ne chiede. */}
      {([1, 2, 3, 4, 5] as Stazione[]).map((k) => (
        <Cartello key={k} sigla={`0${k}`} testo={STAZIONI[k].nome} x={STAZIONI[k].cartello} z={CARTELLI_LINEA_Z} larghezza={STAZIONI[k].larghezza} spento={k === 4 && !catena.correzioni} />
      ))}

      <ArmadiServer ridotto={ridotto} />
    </group>
  );
});
