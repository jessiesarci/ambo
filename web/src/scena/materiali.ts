// Superfici procedurali del plastico: niente texture da scaricare, tutto calcolato nello shader in
// coordinate mondo, così i giunti restano allineati da un pavimento all'altro e nitidi a ogni zoom.
import * as THREE from 'three';

const VARIANTE = 'varying vec3 vMondo;\n';
const POSIZIONE = `#include <begin_vertex>
  vMondo = (modelMatrix * vec4(transformed, 1.0)).xyz;`;

// Funzioni comuni: giunti antialiasati (larghi `w` metri, sfumati di un pixel) e rumore leggero.
const FUNZIONI = `
float giunto(vec2 p, float passo, float w) {
  vec2 d = abs(fract(p / passo + 0.5) - 0.5) * passo;
  vec2 aa = fwidth(p) * 0.75;
  vec2 l = 1.0 - smoothstep(vec2(w * 0.5) - aa, vec2(w * 0.5) + aa, d);
  // Da lontano i giunti diventano più fitti dei pixel: si spengono invece di fare moiré.
  float vicino = 1.0 - smoothstep(0.08, 0.25, max(aa.x, aa.y) / passo * 4.0);
  return max(l.x, l.y) * vicino;
}
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rumore(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}
`;

export interface OpzioniPavimento {
  colore: string;
  piastrella: number; // lato della piastrella in metri
  giunto: number; // quanto scuriscono i giunti (0..1)
  macchie?: number; // variazione del cemento (0..1)
  // Ombra finta lungo le pareti: un rettangolo [x0, z0, x1, z1] e la sua forza. Lavora anche sul
  // telefono, dove l'occlusione ambientale vera è spenta.
  bordo?: { rettangolo: [number, number, number, number]; forza: number };
  // Pareti interne (segmenti [x0, z0, x1, z1]) che fanno la stessa ombra a terra.
  pareti?: [number, number, number, number][];
  roughness?: number;
}

export function materialePavimento(o: OpzioniPavimento): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: o.colore, roughness: o.roughness ?? 0.72 });
  const pareti = o.pareti ?? [];
  const uniforms = {
    uPiastrella: { value: o.piastrella },
    uGiunto: { value: o.giunto },
    uMacchie: { value: o.macchie ?? 0 },
    uRett: { value: new THREE.Vector4(...(o.bordo?.rettangolo ?? [0, 0, 0, 0])) },
    uBordo: { value: o.bordo?.forza ?? 0 },
    uPareti: { value: pareti.map((p) => new THREE.Vector4(...p)).concat(Array.from({ length: Math.max(0, 4 - pareti.length) }, () => new THREE.Vector4(1e4, 1e4, 1e4, 1e4))) },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = VARIANTE + s.vertexShader.replace('#include <begin_vertex>', POSIZIONE);
    s.fragmentShader = `${VARIANTE}uniform float uPiastrella; uniform float uGiunto; uniform float uMacchie; uniform vec4 uRett; uniform float uBordo; uniform vec4 uPareti[4];
${FUNZIONI}
float distSegmento(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); return length(p - a - ab * t); }
${s.fragmentShader}`.replace('#include <map_fragment>', `#include <map_fragment>
      vec2 pm = vMondo.xz;
      float g = giunto(pm, uPiastrella, 0.025);
      float mac = (rumore(pm * 0.35) - 0.5) * 0.7 + (rumore(pm * 1.7) - 0.5) * 0.3;
      diffuseColor.rgb *= (1.0 - uGiunto * g) * (1.0 + uMacchie * mac);
      float dB = min(min(pm.x - uRett.x, uRett.z - pm.x), min(pm.y - uRett.y, uRett.w - pm.y));
      for (int i = 0; i < 4; i++) dB = min(dB, distSegmento(pm, uPareti[i].xy, uPareti[i].zw));
      diffuseColor.rgb *= 1.0 - uBordo * (1.0 - smoothstep(0.0, 1.1, dB)) * (1.0 - smoothstep(0.0, 1.1, dB));`);
  };
  m.customProgramCacheKey = () => 'pavimento-plastico';
  return m;
}

// Il tavolo su cui poggia il plastico: grigio con la griglia di un tappetino da taglio (1 m e 5 m)
// che si perde verso il fondo, fino a confondersi col colore dello sfondo.
export function materialeTerreno(vicino: string, lontano: string, sfondo: THREE.Color, centro: [number, number]): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: vicino, roughness: 0.9 });
  const uniforms = {
    uLontano: { value: new THREE.Color(lontano) },
    uSfondo: { value: sfondo },
    uCentro: { value: new THREE.Vector2(...centro) },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = VARIANTE + s.vertexShader.replace('#include <begin_vertex>', POSIZIONE);
    s.fragmentShader = `${VARIANTE}uniform vec3 uLontano; uniform vec3 uSfondo; uniform vec2 uCentro;
${FUNZIONI}
${s.fragmentShader}`
      .replace('#include <map_fragment>', `#include <map_fragment>
      vec2 pt = vMondo.xz - uCentro;
      float lontananza = smoothstep(30.0, 95.0, length(pt * vec2(0.75, 1.1)));
      diffuseColor.rgb = mix(diffuseColor.rgb, uLontano, lontananza);
      float griglia = giunto(vMondo.xz, 1.0, 0.03) * 0.05 + giunto(vMondo.xz, 5.0, 0.06) * 0.09;
      diffuseColor.rgb *= 1.0 - griglia * (1.0 - lontananza);`)
      // In fondo il terreno diventa esattamente il colore dello sfondo: nessun bordo visibile.
      .replace('#include <tonemapping_fragment>', `gl_FragColor.rgb = mix(gl_FragColor.rgb, uSfondo, smoothstep(55.0, 140.0, length(pt)));
      #include <tonemapping_fragment>`);
  };
  m.customProgramCacheKey = () => 'terreno-plastico';
  return m;
}

// Ombra morbida di contatto sotto il basamento: un rettangolo sfocato disegnato una volta su canvas.
export function texturaOmbra(larghezza: number, profondita: number, sfocatura: number): THREE.CanvasTexture {
  const scala = 12; // pixel per metro
  const W = Math.round((larghezza + sfocatura * 4) * scala);
  const H = Math.round((profondita + sfocatura * 4) * scala);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // Va usata come alphaMap (canale verde): fondo nero, ombra bianca. Il rettangolo sta fuori dal
  // canvas, così resta solo la sua ombra sfocata.
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.shadowColor = '#fff';
  g.shadowBlur = sfocatura * scala;
  g.shadowOffsetX = W;
  g.fillStyle = '#fff';
  g.fillRect(-W + sfocatura * 2 * scala, sfocatura * 2 * scala, larghezza * scala, profondita * scala);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
