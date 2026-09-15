"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useFBO } from "@react-three/drei";
import { MathUtils, Mesh, OrthographicCamera, PlaneGeometry, Quaternion, Scene, ShaderMaterial, Vector3 } from "three";
import type { DrunkLevel } from "@/lib/drunk";

/** Jačina njihanja kamere i "pijanog" shadera po razini (0 trijezan … 4 povraća) */
const SWAY: Record<DrunkLevel, number> = { 0: 0, 1: 0.35, 2: 0.65, 3: 1, 4: 1.1 };
const WARP: Record<DrunkLevel, number> = { 0: 0, 1: 0, 2: 0.55, 3: 1, 4: 1.1 };

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Valovito izobličenje + dvostruka slika + mutnoća + tamniji rubovi
const fragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uStrength;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    uv += vec2(sin(uv.y * 7.0 + uTime * 1.3), cos(uv.x * 5.0 + uTime * 1.1)) * 0.005 * uStrength;

    vec2 offset = vec2(sin(uTime * 0.9), cos(uTime * 0.7)) * 0.014 * uStrength;
    vec4 base = texture2D(tDiffuse, uv);
    vec4 ghost = texture2D(tDiffuse, uv + offset);
    vec4 smear = texture2D(tDiffuse, uv - offset * 0.5);
    vec4 color = mix(base, (ghost + smear) * 0.5, 0.45 * clamp(uStrength, 0.0, 1.0));

    float d = distance(vUv, vec2(0.5));
    color.rgb *= 1.0 - smoothstep(0.4, 0.85, d) * 0.55 * uStrength;

    gl_FragColor = color;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Jedan zaslon po stranici — stvara se pri prvom korištenju
let screen: { scene: Scene; camera: OrthographicCamera; material: ShaderMaterial } | null = null;
function getScreen() {
  if (!screen) {
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uStrength: { value: 0 } },
      depthTest: false,
      depthWrite: false,
    });
    const scene = new Scene();
    scene.add(new Mesh(new PlaneGeometry(2, 2), material));
    screen = { scene, camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1), material };
  }
  return screen;
}

const savedPosition = new Vector3();
const savedQuaternion = new Quaternion();

/**
 * Preuzima iscrtavanje scene (useFrame s prioritetom 1) i dodaje "pijani" pogled
 * samo na ekranu gosta koji je popio. Njihanje kamere se primijeni samo za iscrtavanje
 * i odmah vrati, pa se ne "tuče" s OrbitControls.
 */
export default function DrunkVision({ level }: { level: DrunkLevel }) {
  const target = useFBO({ samples: 4 });
  const intensity = useRef({ sway: 0, warp: 0 });

  useFrame((state, delta) => {
    const { gl, scene, camera, clock } = state;
    const current = intensity.current;
    // Postupno ulazi i izlazi (limunada)
    current.sway = MathUtils.damp(current.sway, SWAY[level], 1.2, delta);
    current.warp = MathUtils.damp(current.warp, WARP[level], 1.2, delta);
    const t = clock.getElapsedTime();

    savedPosition.copy(camera.position);
    savedQuaternion.copy(camera.quaternion);
    if (current.sway > 0.001) {
      camera.position.x += Math.sin(t * 0.45) * 0.18 * current.sway;
      camera.position.y += Math.sin(t * 0.8) * 0.07 * current.sway;
      camera.rotateZ(Math.sin(t * 0.6) * 0.05 * current.sway);
      camera.updateMatrixWorld();
    }

    if (current.warp < 0.01) {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
    } else {
      gl.setRenderTarget(target);
      gl.render(scene, camera);
      gl.setRenderTarget(null);
      const s = getScreen();
      s.material.uniforms.tDiffuse.value = target.texture;
      s.material.uniforms.uTime.value = t;
      s.material.uniforms.uStrength.value = current.warp;
      gl.render(s.scene, s.camera);
    }

    camera.position.copy(savedPosition);
    camera.quaternion.copy(savedQuaternion);
    camera.updateMatrixWorld();
  }, 1);

  return null;
}
