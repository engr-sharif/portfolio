/**
 * Hero WebGL element — a slowly-drifting topographic point grid.
 *
 * Thematic, not generic: a regular grid of sample points displaced by smooth
 * noise reads as terrain / grid-sampling — a quiet nod to environmental
 * fieldwork. GPU-cheap (points + a tiny vertex shader), parallaxes to the
 * pointer, and goes fully static under reduced-motion or when off-screen.
 */
import { useRef, useMemo, useState, useEffect, type FC } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Grid density — reduced on small screens so phones stay smooth.
const DENSITY = { desktop: { cols: 104, rows: 66 }, mobile: { cols: 60, rows: 40 } };

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uReduced;
  varying float vElevation;

  // Cheap value-noise via sines — smooth, periodic, plenty for a backdrop.
  float wave(vec2 p, float t) {
    return sin(p.x * 0.9 + t) * 0.5
         + sin(p.y * 1.1 - t * 0.8) * 0.5
         + sin((p.x + p.y) * 0.6 + t * 0.5) * 0.35;
  }

  void main() {
    vec3 pos = position;
    float t = uTime * (1.0 - uReduced); // freeze when reduced
    float e = wave(pos.xy, t);
    pos.z += e * 1.15;
    vElevation = e;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    // Bigger points so the field reads clearly (esp. on small/high-DPI screens).
    gl_PointSize = (3.4 + (e + 1.0) * 2.4) * (320.0 / -mv.z);
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;
  uniform vec3 uColorLow;
  uniform vec3 uColorHigh;
  varying float vElevation;

  void main() {
    // round, soft points
    float d = distance(gl_PointCoord, vec2(0.5));
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.08, d);
    vec3 c = mix(uColorLow, uColorHigh, smoothstep(-1.2, 1.3, vElevation));
    gl_FragColor = vec4(c, a);
  }
`;

const Terrain: FC<{ reduced: boolean; cols: number; rows: number }> = ({ reduced, cols, rows }) => {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const { viewport } = useThree();

  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(26, 18, cols, rows);
  }, [cols, rows]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uReduced: { value: reduced ? 1 : 0 },
      uColorLow: { value: new THREE.Color('#2f6f4e') },
      uColorHigh: { value: new THREE.Color('#7fe3ad') },
    }),
    [reduced],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useFrame((state, delta) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += delta * 0.75;
    if (reduced) return;
    // gentle pointer parallax (small offset only — the tilt lives on the points)
    const g = state.scene;
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, pointer.current.y * 0.1, 0.04);
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, pointer.current.x * 0.06, 0.04);
  });

  // Gentle tilt — enough for depth, but the field fills the frame behind the
  // text rather than receding to a thin horizon band at the top.
  return (
    <points geometry={geometry} rotation={[0, 0, 0]} scale={Math.max(1.4, viewport.width / 9)}>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </points>
  );
};

const HeroScene: FC = () => {
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(true);
  const [small, setSmall] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Scale grid density + DPR down on small screens (smooth on phones).
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setSmall(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const density = small ? DENSITY.mobile : DENSITY.desktop;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Pause the render loop when the hero scrolls out of view.
  useEffect(() => {
    if (!wrapRef.current) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.01 },
    );
    io.observe(wrapRef.current);
    return () => io.disconnect();
  }, []);

  // reduced-motion / offscreen → render on demand only (one static frame).
  const frameloop = reduced || !visible ? 'demand' : 'always';

  return (
    <div ref={wrapRef} className="hero-canvas" aria-hidden="true">
      <Canvas
        frameloop={frameloop}
        camera={{ position: [0, 0, 8], fov: 50 }}
        dpr={small ? [1, 1.25] : [1, 1.5]}
        gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
      >
        <Terrain reduced={reduced} cols={density.cols} rows={density.rows} />
      </Canvas>
    </div>
  );
};

export default HeroScene;
