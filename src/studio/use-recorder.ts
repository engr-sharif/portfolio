/**
 * A microphone recorder with a live level meter, shared by the voice-note
 * field and the field log. Opus in WebM where the browser has it, AAC in MP4
 * on Safari; 64 kbps mono-ish voice, about half a megabyte a minute. Stops by
 * itself at `maxMs` so a forgotten recording can't fill the phone.
 */
import { useEffect, useRef, useState } from 'react';
import { recorderType } from './media';

export interface Recording { blob: Blob; seconds: number }

export function useRecorder(onDone: (r: Recording) => void, maxMs = 10 * 60 * 1000) {
  const [rec, setRec] = useState<{ started: number; level: number } | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState('');
  const mr = useRef<MediaRecorder | null>(null);
  const stopTimer = useRef(0);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => () => { if (mr.current?.state === 'recording') mr.current.stop(); }, []);

  const start = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('This browser can’t record audio. Upload a file instead.'); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { setError('Microphone access was refused. Allow it in the browser’s site settings, or upload a file.'); return; }
    const type = recorderType();
    const recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 64000 });
    const chunks: Blob[] = [];
    const ctx = new AudioContext();
    const an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let raf = 0;
    const started = Date.now();
    const meter = () => {
      an.getByteTimeDomainData(buf);
      let m = 0; for (const b of buf) m = Math.max(m, Math.abs(b - 128));
      setRec((r) => (r ? { ...r, level: m / 128 } : r)); setNow(Date.now());
      raf = requestAnimationFrame(meter);
    };
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      cancelAnimationFrame(raf); clearTimeout(stopTimer.current);
      stream.getTracks().forEach((t) => t.stop()); void ctx.close();
      setRec(null);
      done.current({ blob: new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' }), seconds: Math.round((Date.now() - started) / 1000) });
    };
    mr.current = recorder;
    recorder.start(1000);
    setRec({ started, level: 0 });
    meter();
    stopTimer.current = window.setTimeout(() => recorder.state === 'recording' && recorder.stop(), maxMs);
  };
  const stop = () => { if (mr.current?.state === 'recording') mr.current.stop(); };

  const seconds = rec ? Math.max(0, Math.floor((now - rec.started) / 1000)) : 0;
  return { recording: !!rec, level: rec?.level ?? 0, seconds, error, start, stop };
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
