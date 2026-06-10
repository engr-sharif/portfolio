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
  uniform vec2 uPointer;   // pointer position in plane space
  uniform float uRipple;   // ripple strength (eases in/out with pointer presence)
  varying float vElevation;
  varying float vRipple;

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

    // Pointer ripple: a travelling ring of displacement around the cursor.
    float dist = distance(pos.xy, uPointer);
    float ring = sin(dist * 2.4 - uTime * 4.0) * exp(-dist * 0.5);
    float r = ring * uRipple * (1.0 - uReduced);
    vRipple = r;

    pos.z += e * 1.15 + r * 1.6;
    vElevation = e;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    // Bigger points so the field reads clearly (esp. on small/high-DPI screens).
    gl_PointSize = (3.4 + (e + 1.0) * 2.4 + abs(r) * 5.0) * (320.0 / -mv.z);
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;
  uniform vec3 uColorLow;
  uniform vec3 uColorHigh;
  varying float vElevation;
  varying float vRipple;

  void main() {
    // round, soft points
    float d = distance(gl_PointCoord, vec2(0.5));
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.08, d);
    vec3 c = mix(uColorLow, uColorHigh, smoothstep(-1.2, 1.3, vElevation));
    // points caught in the ripple flash brighter
    c += vec3(0.35, 0.6, 0.45) * abs(vRipple) * 1.4;
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
      uPointer: { value: new THREE.Vector2(999, 999) },
      uRipple: { value: 0 },
    }),
    [reduced],
  );

  // Pointer in plane space (the plane spans ~26×18 before scale).
  const planePointer = useRef(new THREE.Vector2(999, 999));
  const targetRipple = useRef(0);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
      // map screen → plane coords (scaled to the geometry extents)
      planePointer.current.set(
        (e.clientX / window.innerWidth - 0.5) * 26,
        -(e.clientY / window.innerHeight - 0.5) * 18,
      );
      targetRipple.current = 0.5;
    };
    const onLeave = () => {
      targetRipple.current = 0;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  useFrame((state, delta) => {
    const m = matRef.current;
    if (m) {
      m.uniforms.uTime.value += delta * 0.75;
      if (!reduced) {
        m.uniforms.uPointer.value.lerp(planePointer.current, 0.12);
        m.uniforms.uRipple.value = THREE.MathUtils.lerp(m.uniforms.uRipple.value, targetRipple.current, 0.06);
        // ripple settles back toward 0 so it fades when the pointer rests
        targetRipple.current *= 0.96;
      }
    }
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
