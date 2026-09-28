// hls.js's light build (no subtitles, DRM or alternate audio) ships no types of its own.
declare module 'hls.js/light' {
  export { default } from 'hls.js';
  export * from 'hls.js';
}
