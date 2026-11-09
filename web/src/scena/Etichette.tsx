// Etichette e fumetti sopra la scena. Sono DOM normale, fuori dalla tela 3D: a ogni fotogramma il
// Proiettore calcola dove cade sullo schermo il punto d'aggancio di ciascuno e sposta il suo div.
// (Più robusto di drei Html con React 19, che ricreava le radici e a volte le perdeva.)
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { Fumetto, Puntini, Targhetta, type TonoFumetto } from './Fumetti.tsx';

export interface FumettoDato {
  testo: string;
  tono: TonoFumetto;
  puntini?: boolean;
}

export interface DatoEtichetta {
  id: string;
  nome?: string;
  colore?: string;
  fumetti: FumettoDato[];
  nota?: string; // riquadro "La tua nota"
  titoloNota?: string;
}

export interface RegistroEtichette {
  ancore: Map<string, THREE.Object3D>;
  nodi: Map<string, HTMLElement>;
}

export function creaRegistro(): RegistroEtichette {
  return { ancore: new Map(), nodi: new Map() };
}

// Dentro la tela: proietta le ancore sullo schermo.
export function Proiettore({ registro }: { registro: RegistroEtichette }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (const [id, nodo] of registro.nodi) {
      const ancora = registro.ancore.get(id);
      if (!ancora) {
        nodo.style.visibility = 'hidden';
        continue;
      }
      v.setFromMatrixPosition(ancora.matrixWorld).project(camera);
      const fuori = v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2;
      nodo.style.visibility = fuori ? 'hidden' : 'visible';
      if (fuori) continue;
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      nodo.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
  });
  return null;
}

// Fuori dalla tela: i div delle etichette.
// onAgente: il cartellino di Claude e di Codex si tocca e apre la loro scheda (l'omino da solo è piccolo).
export function LivelloEtichette({ dati, registro, onAgente }: { dati: DatoEtichetta[]; registro: RegistroEtichette; onAgente?: (a: 'claude' | 'codex') => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {dati.map((d) => (
        <div
          key={d.id}
          ref={(el) => {
            if (el) registro.nodi.set(d.id, el);
            else registro.nodi.delete(d.id);
          }}
          className="absolute left-0 top-0 will-change-transform"
          style={{ visibility: 'hidden' }}
        >
          {d.nota ? (
            <div className="max-w-[240px] animate-[comparsa_.3s_ease-out] rounded-xl border border-[#9ad400] bg-[#f4ffd6] px-3 py-2 font-testo text-[12px] leading-snug text-[#4d3a00] shadow-lg">
              <div className="font-titolo text-[11px] font-bold uppercase tracking-wider">{d.titoloNota ?? 'La tua nota'}</div>
              {d.nota}
            </div>
          ) : onAgente && (d.id === 'claude' || d.id === 'codex') ? (
            <button type="button" tabIndex={-1} className="pointer-events-auto cursor-pointer" onClick={() => onAgente(d.id as 'claude' | 'codex')}>
              <Targhetta
                nome={d.nome ?? ''}
                colore={d.colore ?? '#888'}
                sotto={
                  <div className="flex flex-col items-center">
                    {d.fumetti.map((f, i) => (
                      <Fumetto key={`${i}-${f.tono}`} tono={f.tono}>
                        {f.puntini && <><Puntini /> </>}
                        {f.testo}
                      </Fumetto>
                    ))}
                  </div>
                }
              />
            </button>
          ) : (
            <Targhetta
              nome={d.nome ?? ''}
              colore={d.colore ?? '#888'}
              sotto={
                <div className="flex flex-col items-center">
                  {d.fumetti.map((f, i) => (
                    <Fumetto key={`${i}-${f.tono}`} tono={f.tono}>
                      {f.puntini && <><Puntini /> </>}
                      {f.testo}
                    </Fumetto>
                  ))}
                </div>
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}
