/**
 * The Living Atlas — a persistent WebGL California behind the whole site.
 *
 * Real terrain: a 192×216 heightmap baked from SRTM-derived elevation tiles
 * (scripts/build-terrain.mjs) is sampled on the GPU, so the point field IS the
 * state — Sierra crest, Central Valley, Tahoe, the coast. Slow contour lines
 * climb the relief; the pointer sends a ripple across it; project sites glow as
 * nodes on their real coordinates.
 *
 * One scene, one canvas, mounted once in BaseLayout with transition:persist so
 * it survives View Transitions. Each page declares a *station* on <body>
 * (data-scene = home | page | site, plus data-scene-lat/lng for a site) and
 * the camera flies there; on the homepage scroll drives the flight from a low
 * oblique over the coast (hero) to a plan view (Atlas) to a quiet backdrop.
 *
 * Performance: ~41k points on desktop / ~10k on phones, one tiny shader, DPR
 * capped, render loop paused when the tab is hidden, everything else is CSS.
 * Reduced motion: no drift, no ripple, camera jumps instead of flying.
 *
 * Events (window):
 *   in  'atlas:active'  { detail: slug | null }  highlight a project node
 *   out 'atlas:pose'    { detail: { lat, lng } } camera target, for the HUD
 */
import { useRef, useMemo, useState, useEffect, type FC } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import meta from '../../data/ca-terrain.json';

/* --------------------------------------------------------------- geometry */
// Plane proportions follow real distance (lon degrees shrink with latitude).
const midLat = ((meta.bbox.north + meta.bbox.south) / 2) * (Math.PI / 180);
const PLANE_H = 10;
const PLANE_W = PLANE_H * ((meta.bbox.east - meta.bbox.west) * Math.cos(midLat)) / (meta.bbox.north - meta.bbox.south);
const RELIEF = 1.6; // vertical exaggeration of the 0..4400 m range, in plane units

const GRID = { desktop: { cols: meta.width - 1, rows: meta.height - 1 }, mobile: { cols: 95, rows: 107 } };

export interface Node { slug: string; lat: number; lng: number; status: string }

/** lon/lat → plane xy (z comes from the heightmap). */
export function toPlane(lng: number, lat: number) {
  const u = (lng - meta.bbox.west) / (meta.bbox.east - meta.bbox.west);
  const v = (lat - meta.bbox.south) / (meta.bbox.north - meta.bbox.south);
  return { x: (u - 0.5) * PLANE_W, y: (v - 0.5) * PLANE_H, u, v };
}
function toLonLat(x: number, y: number) {
  const u = x / PLANE_W + 0.5, v = y / PLANE_H + 0.5;
  return { lng: meta.bbox.west + u * (meta.bbox.east - meta.bbox.west), lat: meta.bbox.south + v * (meta.bbox.north - meta.bbox.south) };
}

/* ----------------------------------------------------------------- shaders */
const terrainVert = /* glsl */ `
  uniform sampler2D uHeight;   // R: elevation, G: sea, A: inside-CA mask
  uniform float uTime;
  uniform float uReduced;
  uniform vec2  uPointer;      // plane-space pointer
  uniform float uRipple;
  uniform float uRelief;
  uniform float uPx;           // point size scale (DPR-aware)
  varying float vElev;
  varying float vMask;
  varying float vSea;
  varying float vRipple;
  varying vec2  vUv;

  void main() {
    vUv = uv;
    vec4 h = texture2D(uHeight, uv);
    float e = h.r;               // 0..1 of the elevation range
    vSea  = h.g;
    vMask = h.a;                 // 1 in-state, ~.38 neighbours, 0 ocean
    vElev = e;

    vec3 pos = position;
    // pointer ripple — a travelling ring, damped with distance
    float d = distance(pos.xy, uPointer);
    float ring = sin(d * 3.2 - uTime * 4.0) * exp(-d * 0.9);
    float r = ring * uRipple * (1.0 - uReduced);
    vRipple = r;

    pos.z = e * uRelief + r * 0.35;
    if (vSea > 0.5) pos.z = -0.02;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    // ~2–5 px at the plan-view distance, growing as the camera closes in;
    // neighbouring states render smaller and much dimmer so California reads
    float inState = step(0.9, vMask);
    float base = mix(1.6, 3.2, inState) + e * 3.6 * inState + abs(r) * 3.0;
    gl_PointSize = base * uPx * clamp(14.0 / -mv.z, 0.5, 2.8);
  }
`;

const terrainFrag = /* glsl */ `
  uniform vec3  uLow;
  uniform vec3  uHigh;
  uniform vec3  uSea;
  uniform vec3  uContour;
  uniform float uTime;
  uniform float uReduced;
  uniform float uRippleSign;
  uniform float uAlpha;
  uniform float uDebug;
  uniform sampler2D uHeight;
  varying float vElev;
  varying float vMask;
  varying float vSea;
  varying float vRipple;
  varying vec2  vUv;

  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.22, d);
    // diagnostics (window.__atlas.uniforms.uDebug.value):
    //   1 → R=uv.x G=uv.y B=elev (vertex-stage sample)
    //   2 → fragment-stage sample of the heightmap: R=elev G=sea B=mask
    if (uDebug > 1.5) { vec4 h2 = texture2D(uHeight, vUv); gl_FragColor = vec4(h2.r, h2.g, h2.a, 1.0); return; }
    if (uDebug > 0.5) { gl_FragColor = vec4(vUv.x, vUv.y, vElev, 1.0); return; }

    // ocean: a faint, still scatter
    if (vSea > 0.5) {
      gl_FragColor = vec4(uSea, soft * 0.07 * uAlpha);
      return;
    }

    float inState = step(0.9, vMask);
    vec3 c = mix(uLow, uHigh, smoothstep(0.0, 0.75, vElev));

    // contour lines that slowly climb the relief (16 bands over the range)
    float t = uTime * 0.045 * (1.0 - uReduced);
    float band = abs(fract(vElev * 16.0 - t) - 0.5) * 2.0;   // 1 at band centre
    float line = smoothstep(0.80, 1.0, band) * inState;
    c = mix(c, uContour, line * 0.72);

    // ripple flash: brighter on Field (dark), deeper on Lab (light)
    c += uRippleSign * vec3(0.30, 0.55, 0.40) * abs(vRipple) * 1.6;

    // neighbouring land: a quiet, desaturated context so the state edge is
    // crisp — and faded toward the edge of the data so the bbox never shows
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float inside = soft * (0.55 + 0.45 * vElev + line * 0.9);
    float outside = soft * 0.13 * smoothstep(0.0, 0.16, edge);
    float a = mix(outside, inside, inState) * uAlpha;
    c = mix(mix(uLow, uSea, 0.5), c, inState);
    gl_FragColor = vec4(c, a);
  }
`;

const nodeVert = /* glsl */ `
  attribute float aActive;
  attribute vec3  aColor;
  uniform float uTime;
  uniform float uPx;
  varying vec3  vColor;
  varying float vActive;
  void main() {
    vColor = aColor; vActive = aActive;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float pulse = 0.5 + 0.5 * sin(uTime * 2.2);
    gl_PointSize = (18.0 + aActive * 16.0 + pulse * 4.0) * uPx * clamp(14.0 / -mv.z, 0.6, 2.2);
  }
`;
const nodeFrag = /* glsl */ `
  uniform float uTime;
  uniform float uAlpha;
  varying vec3  vColor;
  varying float vActive;
  void main() {
    float d = distance(gl_PointCoord, vec2(0.5)) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(0.32, 0.18, d);
    float ringR = fract(uTime * 0.5);                 // expanding ring
    float ring = smoothstep(0.06, 0.0, abs(d - ringR)) * (1.0 - ringR);
    float halo = smoothstep(1.0, 0.3, d) * 0.22;
    float a = (core + ring * (0.6 + vActive * 0.4) + halo) * uAlpha;
    gl_FragColor = vec4(vColor + vActive * 0.25, a);
  }
`;

/* ------------------------------------------------------------------ poses */
interface Pose { theta: number; phi: number; r: number; offX: number; offY: number; alpha: number; tx: number; ty: number }
const deg = (d: number) => (d * Math.PI) / 180;
const POSES: Record<string, Pose> = {
  // low oblique from the south-west, state pushed right — the hero
  hero:  { theta: deg(-118), phi: deg(56), r: 18.5, offX: 0.20, offY: -0.08, alpha: 1.0, tx: 0.2, ty: 0.4 },
  // plan view, state in the right half — the Atlas
  atlas: { theta: deg(-90),  phi: deg(10), r: 14.5, offX: 0.24, offY: 0.0,  alpha: 0.95, tx: 0, ty: 0 },
  // quiet backdrop for the rest of the homepage / listing pages
  deep:  { theta: deg(-96),  phi: deg(14), r: 17,   offX: 0.0,  offY: 0.0,  alpha: 0.22, tx: 0, ty: 0 },
  page:  { theta: deg(-100), phi: deg(24), r: 16,   offX: 0.12, offY: 0.05, alpha: 0.16, tx: 0, ty: 0 },
  // close over a project site
  site:  { theta: deg(-112), phi: deg(52), r: 4.2,  offX: 0.18, offY: -0.05, alpha: 0.5, tx: 0, ty: 0 },
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixPose = (a: Pose, b: Pose, t: number): Pose => ({
  theta: lerp(a.theta, b.theta, t), phi: lerp(a.phi, b.phi, t), r: lerp(a.r, b.r, t),
  offX: lerp(a.offX, b.offX, t), offY: lerp(a.offY, b.offY, t), alpha: lerp(a.alpha, b.alpha, t),
  tx: lerp(a.tx, b.tx, t), ty: lerp(a.ty, b.ty, t),
});
const ease = (t: number) => t * t * (3 - 2 * t);

/** What the current page + scroll position asks of the camera. */
function targetPose(): Pose {
  const b = document.body?.dataset ?? {};
  const scene = b.scene || 'page';
  if (scene === 'site' && b.sceneLat && b.sceneLng) {
    const p = toPlane(Number(b.sceneLng), Number(b.sceneLat));
    return { ...POSES.site, tx: p.x, ty: p.y };
  }
  if (scene !== 'home') return POSES.page;
  // homepage: hero → atlas → deep, driven by where the Atlas section sits
  const atlas = document.getElementById('atlas');
  const vh = window.innerHeight;
  if (!atlas) return mixPose(POSES.hero, POSES.deep, ease(Math.min(1, window.scrollY / (vh * 1.2))));
  const rect = atlas.getBoundingClientRect();
  // t1: 0 at page top → 1 when the atlas top reaches ~30% down the viewport
  const t1 = ease(Math.min(1, Math.max(0, 1 - (rect.top - vh * 0.3) / (vh * 0.9))));
  // t2: 0 while the atlas occupies the viewport → 1 once its bottom passes 40%
  const t2 = ease(Math.min(1, Math.max(0, 1 - (rect.bottom - vh * 0.4) / (vh * 0.6))));
  return mixPose(mixPose(POSES.hero, POSES.atlas, t1), POSES.deep, t2);
}

/* ------------------------------------------------------------------ scene */
const Scene: FC<{ reduced: boolean; small: boolean; nodes: Node[]; onAlpha: (a: number) => void }> = ({ reduced, small, nodes, onAlpha }) => {
  const { camera, gl, size, invalidate } = useThree();
  const terrainMat = useRef<THREE.ShaderMaterial>(null);
  const nodeMat = useRef<THREE.ShaderMaterial>(null);
  const nodeGeo = useRef<THREE.BufferGeometry>(null);
  const grid = small ? GRID.mobile : GRID.desktop;

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(PLANE_W, PLANE_H, grid.cols, grid.rows);
    // Deterministic jitter (≈ a third of a cell) so the field reads as a point
    // cloud rather than a lattice — a regular grid moirés under perspective.
    const pos = g.attributes.position as THREE.BufferAttribute;
    const cx = PLANE_W / grid.cols, cy = PLANE_H / grid.rows;
    for (let i = 0; i < pos.count; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 43758.5453;
      pos.setX(i, pos.getX(i) + ((h1 - Math.floor(h1)) - 0.5) * cx * 0.7);
      pos.setY(i, pos.getY(i) + ((h2 - Math.floor(h2)) - 0.5) * cy * 0.7);
    }
    pos.needsUpdate = true;
    return g;
  }, [grid.cols, grid.rows]);

  // Heightmap texture (GPU) + a CPU copy for node elevations.
  const [height, setHeight] = useState<THREE.Texture | null>(null);
  const heightPx = useRef<Uint8ClampedArray | null>(null);
  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}data/ca-terrain.png`;
    let alive = true;
    new THREE.TextureLoader().load(url, (tex) => {
      if (!alive) return;
      tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      setHeight(tex);
      kick();
      try {
        const img = tex.image as HTMLImageElement;
        const c = document.createElement('canvas'); c.width = meta.width; c.height = meta.height;
        const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0);
        heightPx.current = ctx.getImageData(0, 0, meta.width, meta.height).data;
        placeNodes();
      } catch { /* node heights fall back to 0 */ }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In on-demand mode (reduced motion / hidden tab) nothing renders unless
  // asked: request a short burst of frames so texture loads, theme changes,
  // scroll and navigation all make it to the screen.
  const kickUntil = useRef(0);
  const kick = () => { kickUntil.current = performance.now() + 900; invalidate(); };

  const sampleZ = (u: number, v: number) => {
    const px = heightPx.current; if (!px) return 0.05;
    const x = Math.min(meta.width - 1, Math.max(0, Math.round(u * (meta.width - 1))));
    const y = Math.min(meta.height - 1, Math.max(0, Math.round((1 - v) * (meta.height - 1))));
    return (px[(y * meta.width + x) * 4] / 255) * RELIEF;
  };

  // Node buffers
  const nodeData = useMemo(() => {
    const pos = new Float32Array(nodes.length * 3);
    const col = new Float32Array(nodes.length * 3);
    const act = new Float32Array(nodes.length);
    return { pos, col, act };
  }, [nodes]);
  const placeNodes = () => {
    const cs = getComputedStyle(document.documentElement);
    const hazard = new THREE.Color(cs.getPropertyValue('--color-hazard').trim() || '#e0a93b');
    const field = new THREE.Color(cs.getPropertyValue('--color-field-bright').trim() || '#57c08a');
    nodes.forEach((n, i) => {
      const p = toPlane(n.lng, n.lat);
      nodeData.pos.set([p.x, p.y, sampleZ(p.u, p.v) + 0.06], i * 3);
      const c = n.status === 'active' ? hazard : field;
      nodeData.col.set([c.r, c.g, c.b], i * 3);
    });
    if (nodeGeo.current) {
      nodeGeo.current.attributes.position.needsUpdate = true;
      nodeGeo.current.attributes.aColor.needsUpdate = true;
    }
    kick();
  };
  useEffect(() => { placeNodes(); window.addEventListener('themechange', placeNodes); return () => window.removeEventListener('themechange', placeNodes); }, [nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // R3F copies the `uniforms` prop into the material at creation, so runtime
  // writes must go to the material's own uniforms — never to this memo object.
  const U = () => (terrainMat.current?.uniforms ?? uniforms) as typeof uniforms;
  const NU = () => (nodeMat.current?.uniforms ?? nodeUniforms) as typeof nodeUniforms;
  const uniforms = useMemo(() => ({
    uHeight: { value: null as THREE.Texture | null },
    uTime: { value: 0 }, uReduced: { value: reduced ? 1 : 0 },
    uPointer: { value: new THREE.Vector2(999, 999) }, uRipple: { value: 0 },
    uRelief: { value: RELIEF }, uPx: { value: 1 },
    uLow: { value: new THREE.Color('#3f8f66') }, uHigh: { value: new THREE.Color('#7fe3ad') },
    uSea: { value: new THREE.Color('#2a5b6e') }, uContour: { value: new THREE.Color('#d6f5e3') },
    uRippleSign: { value: 1 }, uAlpha: { value: 1 }, uDebug: { value: 0 },
  }), [reduced]);
  const nodeUniforms = useMemo(() => ({ uTime: { value: 0 }, uPx: { value: 1 }, uAlpha: { value: 1 } }), []);
  useEffect(() => { U().uHeight.value = height; kick(); }, [height]); // eslint-disable-line react-hooks/exhaustive-deps
  // Debug handle for the probe scripts (live material uniforms).
  useEffect(() => { (window as any).__atlas = { get uniforms() { return U(); }, get texture() { return U().uHeight.value; } }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme tokens → colours
  useEffect(() => {
    const apply = () => {
      const cs = getComputedStyle(document.documentElement);
      const get = (k: string, fb: string) => cs.getPropertyValue(k).trim() || fb;
      const u = U();
      u.uLow.value.set(get('--hero-low', '#3f8f66'));
      u.uHigh.value.set(get('--hero-high', '#7fe3ad'));
      u.uSea.value.set(get('--hero-sea', '#2a5b6e'));
      u.uContour.value.set(get('--hero-contour', '#d6f5e3'));
      u.uRippleSign.value = parseFloat(get('--hero-ripple', '1')) || 1;
      // Field (dark): additive blending makes the points glow like instruments.
      // Lab (light): normal blending, or everything would wash toward white.
      const dark = document.documentElement.dataset.theme !== 'light';
      for (const m of [terrainMat.current, nodeMat.current]) if (m) m.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      kick();
    };
    apply();
    window.addEventListener('themechange', apply);
    return () => window.removeEventListener('themechange', apply);
  }, [height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pointer → plane-space ripple (uses the current camera to unproject)
  const planePointer = useRef(new THREE.Vector2(999, 999));
  const rippleTarget = useRef(0);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);
  useEffect(() => {
    if (reduced || matchMedia('(hover: none)').matches) return;
    const hit = new THREE.Vector3();
    const onMove = (e: PointerEvent) => {
      const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(groundPlane, hit)) { planePointer.current.set(hit.x, hit.y); rippleTarget.current = 0.6; }
    };
    const onLeave = () => { rippleTarget.current = 0; };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => { window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave); };
  }, [camera, ray, groundPlane, reduced]);

  // Active node (from the Atlas list) + scroll/page-driven pose
  const active = useRef<string | null>(null);
  const pose = useRef<Pose>({ ...POSES.hero });
  const want = useRef<Pose>(targetPose());
  const dirty = useRef(true);
  useEffect(() => {
    const onActive = (e: Event) => { active.current = (e as CustomEvent<string | null>).detail; dirty.current = true; kick(); };
    const mark = () => { dirty.current = true; kick(); };
    window.addEventListener('atlas:active', onActive);
    window.addEventListener('scroll', mark, { passive: true });
    window.addEventListener('resize', mark);
    document.addEventListener('astro:page-load', mark);
    document.addEventListener('astro:after-swap', mark);
    return () => {
      window.removeEventListener('atlas:active', onActive);
      window.removeEventListener('scroll', mark); window.removeEventListener('resize', mark);
      document.removeEventListener('astro:page-load', mark); document.removeEventListener('astro:after-swap', mark);
    };
  }, []);

  useEffect(() => { camera.up.set(0, 1, 0); }, [camera]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const lastHud = useRef(0);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    if (performance.now() < kickUntil.current) invalidate();
    const tm = terrainMat.current, nm = nodeMat.current;
    const px = gl.getPixelRatio();
    if (tm) {
      tm.uniforms.uTime.value += dt;
      tm.uniforms.uPx.value = px;
      if (!reduced) {
        tm.uniforms.uPointer.value.lerp(planePointer.current, 0.14);
        tm.uniforms.uRipple.value = THREE.MathUtils.lerp(tm.uniforms.uRipple.value, rippleTarget.current, 0.08);
        rippleTarget.current *= 0.97;
      }
    }
    if (nm) { nm.uniforms.uTime.value += dt; nm.uniforms.uPx.value = px; }

    // pose: re-read the target on scroll/nav, then glide toward it
    if (dirty.current) { want.current = targetPose(); dirty.current = false; }
    const w = { ...want.current };
    // active site pulls the target a little toward it
    if (active.current) {
      const n = nodes.find((x) => x.slug === active.current);
      if (n) { const p = toPlane(n.lng, n.lat); w.tx = lerp(w.tx, p.x, 0.35); w.ty = lerp(w.ty, p.y, 0.35); w.r *= 0.9; }
    }
    // idle drift (breathing) — subtle, never under reduced motion
    const t = state.clock.elapsedTime;
    if (!reduced) { w.theta += Math.sin(t * 0.11) * deg(1.6); w.r += Math.sin(t * 0.07) * 0.18; }

    const k = reduced ? 1 : 1 - Math.exp(-dt * 3.2); // frame-rate independent ease
    const p = pose.current;
    p.theta = lerp(p.theta, w.theta, k); p.phi = lerp(p.phi, w.phi, k); p.r = lerp(p.r, w.r, k);
    p.offX = lerp(p.offX, w.offX, k); p.offY = lerp(p.offY, w.offY, k); p.alpha = lerp(p.alpha, w.alpha, k);
    p.tx = lerp(p.tx, w.tx, k); p.ty = lerp(p.ty, w.ty, k);

    // place the camera on its sphere around the target; shift the target in
    // screen space so the state can sit off-centre behind the content
    const aspect = size.width / Math.max(1, size.height);
    const visH = 2 * p.r * Math.tan(deg(40) / 2);
    target.set(p.tx - p.offX * visH * aspect, p.ty - p.offY * visH, 0.35);
    const sp = Math.sin(p.phi), cp = Math.cos(p.phi);
    camera.position.set(target.x + p.r * sp * Math.cos(p.theta), target.y + p.r * sp * Math.sin(p.theta), target.z + p.r * cp);
    camera.lookAt(target);

    if (tm) tm.uniforms.uAlpha.value = p.alpha;
    if (nm) nm.uniforms.uAlpha.value = Math.min(1, p.alpha * 1.6);
    onAlpha(p.alpha);

    // node highlight
    if (nodeGeo.current) {
      let changed = false;
      nodes.forEach((n, i) => { const v = n.slug === active.current ? 1 : 0; if (nodeData.act[i] !== v) { nodeData.act[i] = v; changed = true; } });
      if (changed) nodeGeo.current.attributes.aActive.needsUpdate = true;
    }

    // HUD: camera target as lon/lat, ~10×/s
    if (t - lastHud.current > 0.1) {
      lastHud.current = t;
      const ll = toLonLat(p.tx, p.ty);
      window.dispatchEvent(new CustomEvent('atlas:pose', { detail: ll }));
    }
  });

  return (
    <>
      <points geometry={geometry} frustumCulled={false}>
        <shaderMaterial ref={terrainMat} vertexShader={terrainVert} fragmentShader={terrainFrag} uniforms={uniforms} transparent depthWrite={false} />
      </points>
      {nodes.length > 0 && (
        <points frustumCulled={false}>
          <bufferGeometry ref={nodeGeo}>
            <bufferAttribute attach="attributes-position" args={[nodeData.pos, 3]} />
            <bufferAttribute attach="attributes-aColor" args={[nodeData.col, 3]} />
            <bufferAttribute attach="attributes-aActive" args={[nodeData.act, 1]} />
          </bufferGeometry>
          <shaderMaterial ref={nodeMat} vertexShader={nodeVert} fragmentShader={nodeFrag} uniforms={nodeUniforms} transparent depthWrite={false} depthTest={false} />
        </points>
      )}
    </>
  );
};

/* ---------------------------------------------------------------- island */
const TerrainField: FC<{ nodes?: Node[] }> = ({ nodes = [] }) => {
  const [reduced, setReduced] = useState(false);
  const [small, setSmall] = useState(false);
  const [hidden, setHidden] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = matchMedia('(max-width: 768px)');
    const rm = matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { setSmall(mq.matches); setReduced(rm.matches); };
    apply();
    mq.addEventListener('change', apply); rm.addEventListener('change', apply);
    const vis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', vis);
    return () => { mq.removeEventListener('change', apply); rm.removeEventListener('change', apply); document.removeEventListener('visibilitychange', vis); };
  }, []);

  // Opacity of the whole layer follows the pose (CSSOM write, cheap).
  const onAlpha = (a: number) => { if (wrapRef.current) wrapRef.current.style.opacity = String(Math.min(1, a + 0.05)); };

  return (
    <div ref={wrapRef} className="atlas-layer" aria-hidden="true">
      <Canvas
        frameloop={hidden ? 'never' : reduced ? 'demand' : 'always'}
        camera={{ position: [0, -12, 8], fov: 40, near: 0.1, far: 100 }}
        dpr={small ? [1, 1.25] : [1, 1.5]}
        gl={{ antialias: false, alpha: true, powerPreference: 'high-performance', premultipliedAlpha: true }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <Scene reduced={reduced} small={small} nodes={nodes} onAlpha={onAlpha} />
      </Canvas>
    </div>
  );
};

export default TerrainField;
