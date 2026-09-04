/**
 * Hero HUD: shows what the Living Atlas camera is looking at. The scene emits
 * `atlas:pose` (~10×/s) with the camera target in lon/lat; we format it as an
 * instrument readout. Cheap DOM writes, no layout reads.
 */
const fmt = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;

function onPose(e: Event) {
  const { lat, lng } = (e as CustomEvent<{ lat: number; lng: number }>).detail;
  const la = document.querySelector('[data-hud-lat]');
  const lo = document.querySelector('[data-hud-lng]');
  if (la) la.textContent = fmt(lat, 'N', 'S');
  if (lo) lo.textContent = fmt(lng, 'E', 'W');
}

window.addEventListener('atlas:pose', onPose);

export {};
