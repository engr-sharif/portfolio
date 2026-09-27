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
  vec4 p = uMVP * vec4(aPos.x, y, aPos.y, 1.0);
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
  col = mix(col, uHot, onLine * uCut);
  a = max(a, onLine * uCut);
  vCol = vec4(col, a * uAlpha * fog(p.w));
  vShape = (sea || lake) ? 3.0 : 0.0;     // water: the map-maker's horizontal hatch
  // sized from the spacing on screen, so near ground reads as a surface and
  // far ground as fine grain; never below a visible dot or above a blob
  float spacingPx = uCell * uScreenK / max(p.w, 0.05);
  float f = sea ? 0.7 : lake ? 1.05 : nb ? 0.42 : mix(0.46, 0.72, aShade) + aElev * 0.35;
  f *= 1.0 + tw * 0.45 + onLine * uCut * 1.2;
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
  vec4 p = uMVP * vec4(aPos.x, y, aPos.y, 1.0);
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
  a = min(1.0, a + tw * 0.3);
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
