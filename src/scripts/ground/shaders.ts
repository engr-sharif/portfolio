/**
 * Three point clouds share one look: round points whose alpha, not colour,
 * carries the light (so relief reads in both themes: dark dots on paper by
 * day, light dots on slate by night).
 *
 *   STATE    California on the statewide grid: rise, hillshade, contour
 *            bands, the torch under the cursor, the section cut, and a hole
 *            where a site's close-up takes over
 *   PATCH    a site's close-up: same styling, denser, with a precision ring
 *            at the radius the public position is rounded to
 *   SECTION  the schematic geology under the cut, each layer in its own
 *            lithology symbol, borings in cinnabar, the water table in blue
 *
 * The ground answers the mouse like a surface of loose grains (flow()): it
 * swells gently under the cursor, the grains along the pointer's path are
 * carried with it and spring back with a small overshoot, and each stroke
 * sends a ripple running out across the terrain. It is all a function of the
 * pointer's recent path and the time since, so there is no simulation state
 * and every grain settles back exactly where the data puts it.
 */

const COMMON = `
uniform mat4 uMVP;
uniform float uRelief;
uniform float uPx;
uniform vec3 uTorch;       // plane x, z, radius (0 = off)
uniform vec3 uLow, uHigh, uHot, uWater;
uniform float uAlpha;
uniform float uScreenK;    // device px per plane unit at distance 1
uniform float uFocus;      // camera distance to its target, for depth fog
out vec4 vCol;
flat out float vShape;
float torchW(vec2 p) { return uTorch.z > 0.0 ? 1.0 - smoothstep(0.0, uTorch.z, distance(p, uTorch.xy)) : 0.0; }
vec3 ramp(float e) { return mix(uLow, uHigh, smoothstep(0.0, 0.42, e)); }
float fog(float w) { return 1.0 - 0.62 * smoothstep(uFocus * 1.15, uFocus * 2.8, w); }
float band(float e) { return 1.0 - smoothstep(0.0, 0.14, fract(e * 11.0)); } // ~400 m contours

#define WAKE 14
uniform vec4 uWake[WAKE];   // the pointer's recent path: plane x, z, and its velocity x, z (units/s)
uniform vec2 uWakeT[WAKE];  // age (s, < 0 = unused), strength 0..1 (how fast it was moving)
uniform float uWakeR;       // the reach of the effect in plane units (0 = off)
// xyz: how far to move the grain; w: how much the moment lights it
vec4 flow(vec3 q) {
  vec4 o = vec4(0.0);
  float R = uWakeR;
  if (R <= 0.0) return o;
  // the swell under a resting cursor: lifted, and eased outward like a lens
  vec2 dt = q.xz - uTorch.xy;
  float tw = torchW(q.xz);
  float bulge = tw * tw * (3.0 - 2.0 * tw);
  o.y += bulge * R * 0.2;
  o.xz += (length(dt) > 1e-5 ? normalize(dt) : vec2(0.0)) * tw * (1.0 - tw) * R * 0.28;
  for (int i = 0; i < WAKE; i++) {
    float t = uWakeT[i].x;
    if (t < 0.0) continue;
    float s = uWakeT[i].y;
    vec2 d = q.xz - uWake[i].xy;
    float r2 = dot(d, d);
    // carried along the path, then back on a damped spring
    float near = exp(-r2 / (R * R * 0.55));
    o.xz += uWake[i].zw * near * 0.05 * exp(-t * 2.2) * cos(t * 6.5);
    // a ripple: one crest running outward from where the pointer passed
    float r = sqrt(r2);
    float front = (r - t * R * 1.9) / (R * 0.32);
    float crest = exp(-front * front) * exp(-t * 1.6) * s * smoothstep(0.0, 0.12, t);
    o.y += crest * R * 0.16;
    o.w += crest;
  }
  o.w = min(o.w, 1.0);
  return o;
}
`;

export const STATE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in float aElev;
layout(location=2) in float aKind;    // 0 land, 1 neighbour, 2 lake, 3 sea
layout(location=3) in float aShade;
layout(location=4) in float aDelay;
${COMMON}
uniform float uRise;
uniform float uCut, uCutZ, uCellZ;
uniform vec4 uPatch;                   // x0, z0, x1, z1
uniform float uPatchW;
uniform float uCell;                   // plane units between samples
void main() {
  float t = clamp((uRise - aDelay * 0.7) / 0.9, 0.0, 1.0);
  float rise = 1.0 - pow(1.0 - t, 4.0);
  bool sea = aKind > 2.5, lake = aKind > 1.5 && aKind < 2.5, nb = aKind > 0.5 && aKind < 1.5;
  float south = step(uCutZ + uCellZ * 0.5, aPos.y);
  float onLine = (1.0 - step(uCellZ * 0.6, abs(aPos.y - uCutZ))) * (sea ? 0.0 : 1.0) * (1.0 - south);
  float tw = torchW(aPos);
  float y = aElev * uRelief * rise - south * uCut * 0.5;
  vec4 fl = flow(vec3(aPos.x, y, aPos.y)) * rise;
  vec4 p = uMVP * vec4(aPos.x + fl.x, y + fl.y, aPos.y + fl.z, 1.0);
  gl_Position = p;

  // the close-up hides the state underneath it, feathered at the edge
  float edge = min(min(aPos.x - uPatch.x, uPatch.z - aPos.x), min(aPos.y - uPatch.y, uPatch.w - aPos.y));
  float under = uPatchW * smoothstep(0.0, (uPatch.z - uPatch.x) * 0.12, edge);

  vec3 col = ramp(aElev);
  col = mix(col, uHigh, band(aElev) * (0.3 + 0.5 * tw) * (nb ? 0.0 : 1.0));
  col = mix(col, uHot, band(aElev) * tw * 0.55);
  float a = sea ? 0.34 : lake ? 0.95 : nb ? 0.2 : mix(0.42, 1.0, aShade);
  if (sea || lake) col = uWater;
  a *= (0.3 + 0.7 * t) * (1.0 - south * uCut) * (1.0 - under);
  a = min(1.0, a + tw * 0.35 * (sea ? 0.0 : 1.0));
  col = mix(col, (sea || lake) ? uHigh : uHot, fl.w * 0.35);
  a = min(1.0, a + fl.w * 0.3);
  col = mix(col, uHot, onLine * uCut);
  a = max(a, onLine * uCut);
  vCol = vec4(col, a * uAlpha * fog(p.w));
  vShape = (sea || lake) ? 3.0 : 0.0;     // water: the map-maker's horizontal hatch
  // sized from the spacing on screen, so near ground reads as a surface and
  // far ground as fine grain; never below a visible dot or above a blob
  float spacingPx = uCell * uScreenK / max(p.w, 0.05);
  float f = sea ? 0.7 : lake ? 1.05 : nb ? 0.42 : mix(0.46, 0.72, aShade) + aElev * 0.35;
  f *= 1.0 + tw * 0.45 + onLine * uCut * 1.2 + fl.w * 0.35;
  gl_PointSize = clamp(spacingPx * f, (sea || lake ? 2.6 : 1.5) * uPx, (sea || lake ? 7.0 : 5.5) * uPx);
}`;

export const PATCH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in float aElev;
layout(location=2) in float aKind;
layout(location=3) in float aShade;
layout(location=4) in float aKm;
${COMMON}
uniform vec4 uPatch;
uniform float uPatchW;
uniform float uRadiusKm;
uniform float uSpacing;                // plane units between samples
uniform vec2 uRange;                   // the patch's own elevation range (0..1 of 4,400 m)
void main() {
  bool sea = aKind > 2.5, lake = aKind > 1.5 && aKind < 2.5;
  float y = aElev * uRelief;
  vec4 fl = flow(vec3(aPos.x, y, aPos.y));
  vec4 p = uMVP * vec4(aPos.x + fl.x, y + fl.y, aPos.y + fl.z, 1.0);
  gl_Position = p;
  float edge = min(min(aPos.x - uPatch.x, uPatch.z - aPos.x), min(aPos.y - uPatch.y, uPatch.w - aPos.y));
  float fade = smoothstep(0.0, (uPatch.z - uPatch.x) * 0.18, edge);
  float tw = torchW(aPos);
  // contrast from the site's own relief: a valley floor and its low hills
  // span the whole ramp, not a sliver of the statewide one
  float local = clamp((aElev - uRange.x) / max(uRange.y - uRange.x, 0.004), 0.0, 1.0);
  vec3 col = (sea || lake) ? uWater : mix(uLow, uHigh, 0.18 + 0.82 * local);
  col = mix(col, uHigh, (1.0 - smoothstep(0.0, 0.16, fract(local * 8.0))) * (0.2 + 0.5 * tw) * ((sea || lake) ? 0.0 : 1.0));
  float a = (sea || lake) ? 0.95 : mix(0.3, 1.0, aShade);
  // precision ring: the edge of where the site may really be
  float ringW = max(0.35, uRadiusKm * 0.08);
  float ring = 1.0 - smoothstep(0.0, ringW, abs(aKm - uRadiusKm));
  float inside = 1.0 - smoothstep(uRadiusKm - ringW, uRadiusKm, aKm);
  col = mix(col, uHot, max(ring, inside * 0.18));
  a = max(a, ring * 0.95);
  a = min(1.0, a + tw * 0.3 + fl.w * 0.3);
  col = mix(col, uHot, fl.w * 0.3 * ((sea || lake) ? 0.0 : 1.0));
  vCol = vec4(col, a * fade * uPatchW * uAlpha * fog(p.w));
  vShape = (sea || lake) ? 3.0 : 0.0;
  // sized from the sample spacing on screen, so the patch reads as a surface
  float spacingPx = uSpacing * uScreenK / max(p.w, 0.05);
  float f = (sea || lake) ? 0.95 : mix(0.42, 0.6, aShade);
  gl_PointSize = clamp(spacingPx * f * (1.0 + ring * 0.8), (sea || lake) ? 2.4 * uPx : 1.0, 7.0 * uPx);
}`;

export const SECTION_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in float aSurf;
layout(location=2) in float aDepth;
layout(location=3) in float aLayer;   // 0 sand 1 clay 2 gravel 3 rock 4 water 5 boring
layout(location=4) in float aReveal;
${COMMON}
uniform float uSection;               // 0..1.4 reveal clock
void main() {
  float r = smoothstep(aReveal, aReveal + 0.25, uSection);
  float y = aSurf * uRelief - aDepth;
  vec4 p = uMVP * vec4(aPos.x, y, aPos.y, 1.0);
  gl_Position = p;
  int L = int(aLayer + 0.5);
  vec3 col = L == 0 ? mix(uLow, uHigh, 0.35) : L == 1 ? mix(uLow, uHigh, 0.6) : L == 2 ? mix(uLow, uHigh, 0.5) : L == 3 ? mix(uLow, uHigh, 0.8) : L == 4 ? uWater : uHot;
  float a = L == 3 ? 0.55 : L == 4 ? 0.95 : L == 5 ? 1.0 : 0.75;
  vCol = vec4(col, a * r * uAlpha * fog(p.w));
  vShape = L == 2 ? 1.0 : L == 3 ? 2.0 : L == 1 ? 3.0 : 0.0;
  float size = L == 2 ? 3.2 : L == 3 ? 2.2 : L == 5 ? 2.6 : L == 4 ? 2.0 : L == 1 ? 1.7 : 1.3;
  gl_PointSize = size * uPx * clamp(12.0 / p.w, 0.5, 1.8) * mix(0.4, 1.0, r);
}`;

export const FS = `#version 300 es
precision mediump float;
in vec4 vCol;
flat in float vShape;
out vec4 color;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a;
  if (vShape > 2.5) {            // dash: a short horizontal stroke (clay)
    a = (1.0 - smoothstep(0.1, 0.18, abs(c.y))) * (1.0 - smoothstep(0.42, 0.5, abs(c.x)));
  } else if (vShape > 1.5) {     // block (bedrock)
    a = (1.0 - smoothstep(0.36, 0.46, max(abs(c.x), abs(c.y))));
  } else if (vShape > 0.5) {     // ring (gravel)
    a = (1.0 - smoothstep(0.44, 0.5, d)) * smoothstep(0.24, 0.3, d);
  } else {
    if (d > 0.5) discard;
    a = smoothstep(0.5, 0.3, d);
  }
  if (a <= 0.001) discard;
  color = vec4(vCol.rgb, vCol.a * a);
}`;
