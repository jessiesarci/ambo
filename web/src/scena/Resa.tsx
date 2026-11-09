// Resa finale: occlusione ambientale (GTAO) con i pass di three stesso, solo su computer.
// @react-three/postprocessing si rompe con three 0.187; questi addon sono della stessa versione.
// Ricetta e parametri dal consulto con ChatGPT (radius ~0.8 m, blend ~0.6, 16 campioni).
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

export function Occlusione() {
  const { gl, scene, camera, size, viewport } = useThree();
  const stato = useRef<{ composer: EffectComposer } | null>(null);

  useEffect(() => {
    // Il canvas ha l'antialias, ma il composer disegna su un suo render target: multisample.
    const bersaglio = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
    const composer = new EffectComposer(gl, bersaglio);
    const render = new RenderPass(scene, camera);
    const ao = new GTAOPass(scene, camera);
    ao.output = GTAOPass.OUTPUT.Default;
    ao.blendIntensity = 0.6;
    ao.updateGtaoMaterial({ radius: 0.8, thickness: 1, distanceExponent: 1, distanceFallOff: 1, scale: 1, samples: 16, screenSpaceRadius: false });
    const uscita = new OutputPass();
    composer.addPass(render);
    composer.addPass(ao);
    composer.addPass(uscita);
    stato.current = { composer };
    return () => {
      stato.current = null;
      render.dispose();
      ao.dispose();
      uscita.dispose();
      composer.dispose();
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    stato.current?.composer.setPixelRatio(viewport.dpr);
    stato.current?.composer.setSize(size.width, size.height);
  }, [size.width, size.height, viewport.dpr]);

  // Priorità 1: da qui in poi il rendering lo fa il composer.
  useFrame((_, delta) => {
    if (stato.current) stato.current.composer.render(delta);
    else gl.render(scene, camera);
  }, 1);

  return null;
}
