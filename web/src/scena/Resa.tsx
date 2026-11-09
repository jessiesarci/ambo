// Resa finale, solo su computer (in modalità ridotta la scena va dritta a schermo):
// 1. la scena in HDR su un bersaglio multisample che tiene anche la profondità;
// 2. occlusione ambientale GTAO a mezza risoluzione, col suo G-buffer ma senza vetri e sagome
//    invisibili per il clic (farebbero aloni) e senza ridisegnare la mappa delle ombre;
// 3. bagliore solo sulle luci sature (lime, rosso d'errore): il bianco del plastico non si accende;
// 4. un solo passaggio finale: occlusione ricomposta con la profondità a piena risoluzione,
//    vignettatura leggera, tone mapping e sRGB.
// Pass di three stesso (stessa versione 0.187): @react-three/postprocessing si rompe con three 0.187.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Le luci colorate (materiali base con toneMapped spento e colore saturo: fili lime, fascia della
// navetta) in HDR valgono di più: così il bagliore le separa dalle superfici lime solo illuminate,
// come il divano. Le spie dei server (materiale bianco, colore per istanza) restano fuori, altrimenti
// i rack diventano un'unica nebbia verde.
const SPINTA = 1.6;

// Passa-alto del bagliore: conta la saturazione oltre alla luminosità.
const PASSA_ALTO = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float luminosityThreshold;
uniform float smoothWidth;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(tDiffuse, vUv);
  float mx = max(max(t.r, t.g), t.b);
  float mn = min(min(t.r, t.g), t.b);
  float sat = (mx - mn) / max(mx, 1e-4);
  float v = mx * smoothstep(0.45, 0.8, sat);
  gl_FragColor = t * smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v);
}`;

const FINALE = {
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tScena;
uniform sampler2D tAO;
uniform sampler2D tProf;
uniform vec2 uRisAO;
uniform float uAO;
uniform float uVignetta;
uniform float uAspetto;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tScena, vUv);
  // L'occlusione è a mezza risoluzione: si ricompone pesando i texel vicini con la profondità,
  // così sui bordi degli oggetti non fa scalini né aloni sul pavimento dietro.
  float d0 = texture2D(tProf, vUv).r;
  // 3x3 texel con pesi a campana: assorbe anche la grana residua del rumore di GTAO.
  vec2 p = vUv * uRisAO;
  vec2 b = floor(p);
  float somma = 0.0;
  float peso = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 q = (b + vec2(float(i), float(j)) + 0.5) / uRisAO;
    vec2 dd = (b + vec2(float(i), float(j)) + 0.5) - p;
    float w = exp(-dot(dd, dd) * 0.9);
    w *= exp(-abs(texture2D(tProf, q).r - d0) * 1500.0) + 1e-4;
    somma += texture2D(tAO, q).r * w;
    peso += w;
  }
  float ao = somma / peso;
  c.rgb *= mix(1.0, ao, uAO);
  vec2 d = (vUv - 0.5) * vec2(uAspetto, 1.0);
  c.rgb *= 1.0 - uVignetta * smoothstep(0.35, 1.05, length(d));
  gl_FragColor = vec4(c.rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Un filo di rumore contro le bande sui grigi sfumati.
  gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}`,
};

function spingiLuci(scene: THREE.Object3D, originali: Map<THREE.MeshBasicMaterial, THREE.Color>) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const b = mat as THREE.MeshBasicMaterial;
      if (!b.isMeshBasicMaterial || b.toneMapped || b.transparent || originali.has(b)) continue;
      const { s } = b.color.getHSL({ h: 0, s: 0, l: 0 });
      if (s < 0.5) continue;
      originali.set(b, b.color.clone());
      b.color.multiplyScalar(SPINTA);
    }
  });
}

function cercaTrasparenti(scene: THREE.Object3D): THREE.Object3D[] {
  const lista: THREE.Object3D[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.every((x) => x.transparent || !x.depthWrite)) lista.push(m);
  });
  return lista;
}

export function Resa() {
  const { gl, scene, camera, size, viewport } = useThree();

  const r = useMemo(() => {
    const campioni = viewport.dpr > 1.3 ? 2 : 4;
    const profondita = new THREE.DepthTexture(1, 1);
    const scena = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: campioni, depthTexture: profondita });
    const ao = new GTAOPass(scene, camera, 1, 1);
    ao.output = GTAOPass.OUTPUT.Off;
    ao.updateGtaoMaterial({ radius: 0.75, thickness: 1, distanceExponent: 1.4, distanceFallOff: 1, scale: 1.7, samples: 24, screenSpaceRadius: false });
    ao.updatePdMaterial({ lumaPhi: 2, depthPhi: 1.5, normalPhi: 2, radius: 10, rings: 3, samples: 24 });
    const bagliore = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0, 1.0);
    (bagliore.highPassUniforms as Record<string, THREE.IUniform>).smoothWidth!.value = 0.35;
    bagliore.materialHighPassFilter.fragmentShader = PASSA_ALTO;
    bagliore.materialHighPassFilter.needsUpdate = true;
    // Alone stretto: solo i livelli fini. Quelli larghi stendono una nebbia verde sul nero dei rack.
    (bagliore.compositeMaterial.uniforms as Record<string, THREE.IUniform>).bloomFactors!.value = [1, 0.45, 0.1, 0, 0];
    const finale = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tScena: { value: scena.texture }, tAO: { value: ao.pdRenderTarget.texture }, tProf: { value: profondita }, uRisAO: { value: new THREE.Vector2(1, 1) }, uAO: { value: 1 }, uVignetta: { value: 0.2 }, uAspetto: { value: 1 } },
      vertexShader: FINALE.vertexShader,
      fragmentShader: FINALE.fragmentShader,
      depthTest: false,
      depthWrite: false,
    }));
    return { scena, ao, bagliore, finale, originali: new Map<THREE.MeshBasicMaterial, THREE.Color>(), trasparenti: [] as THREE.Object3D[] };
    // Il numero di campioni si sceglie una volta: cambiarlo rifarebbe tutti i bersagli.
  }, [scene, camera]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    for (const [m, c] of r.originali) m.color.copy(c);
    r.scena.dispose();
    r.scena.depthTexture?.dispose();
    r.ao.dispose();
    r.bagliore.dispose();
    r.finale.material.dispose();
    r.finale.dispose();
  }, [r]);

  useEffect(() => {
    const w = Math.max(1, Math.floor(size.width * viewport.dpr));
    const h = Math.max(1, Math.floor(size.height * viewport.dpr));
    r.scena.setSize(w, h);
    r.ao.setSize(Math.ceil(w / 2), Math.ceil(h / 2));
    (r.finale.material as THREE.ShaderMaterial).uniforms.uRisAO!.value.set(Math.ceil(w / 2), Math.ceil(h / 2));
    r.bagliore.setSize(w, h);
    (r.finale.material as THREE.ShaderMaterial).uniforms.uAspetto!.value = w / h;
  }, [r, size.width, size.height, viewport.dpr]);

  // Le luci nuove (un pacchetto, uno schermo) si cercano ogni tanto, non a ogni fotogramma.
  const prossimaRicerca = useRef(0);
  useFrame(({ clock }, delta) => {
    if (clock.elapsedTime >= prossimaRicerca.current || clock.elapsedTime < prossimaRicerca.current - 2) {
      spingiLuci(scene, r.originali);
      r.trasparenti = cercaTrasparenti(scene);
      prossimaRicerca.current = clock.elapsedTime + 1;
    }
    gl.setRenderTarget(r.scena);
    gl.clear();
    gl.render(scene, camera);
    // Il G-buffer dell'occlusione: senza vetri e sagome invisibili (farebbero aloni) e senza
    // ridisegnare la mappa delle ombre, già aggiornata dal giro principale.
    const nascosti = r.trasparenti.filter((o) => o.visible);
    for (const o of nascosti) o.visible = false;
    const ombre = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    r.ao.render(gl, null as never, null as never, delta, false);
    gl.shadowMap.autoUpdate = ombre;
    for (const o of nascosti) o.visible = true;
    r.bagliore.render(gl, null as never, r.scena, delta, false);
    gl.setRenderTarget(null);
    r.finale.render(gl);
  }, 1);

  return null;
}
