/**
 * Media fields: a YouTube link, a short silent loop, and audio (recorded on
 * the spot or uploaded). Each checks its limits up front and explains them in
 * plain words; each lands as ONE commit (a loop and its poster frame travel
 * together). Companion values — a loop's poster, a recording's waveform — are
 * written to their sibling fields through onSibling.
 */
import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { Film, Mic, Square, Upload, X, Link2 } from 'lucide-react';
import type { Field as FieldDef } from '../../schema';
import { rawRepoUrl, freeName } from '../../api';
import { LIMITS, checkSize, audioPeaks, audioExt, recorderType, youtubeId, youtubeCanonical, fmtBytes } from '../../media';
import { storeLoop, commitMedia } from '../../media-upload';
import { Button, Input } from '../../ui/primitives';

export interface MediaFieldProps {
  field: FieldDef;
  value: any;
  onChange: (v: any) => void;
  onSibling?: (name: string, value: unknown) => void;
  error?: string;
  siblings?: Record<string, unknown>;
}

const slug = (s: string) => s.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'clip';
const fromPublic = (p: string) => `public${p}`;

const Shell: FC<{ field: FieldDef; error?: string; msg?: string; children: ReactNode }> = ({ field, error, msg, children }) => (
  <div className={`sf${error || msg ? ' sf--invalid' : ''}`}>
    <span className="sf__label">{field.label}</span>
    {children}
    {msg && <p className="sf__err" role="alert">{msg}</p>}
    {error && <p className="sf__err" role="alert">{error}</p>}
    {field.hint && <p className="sf__hint">{field.hint}</p>}
  </div>
);

/* ------------------------------------------------------------------ YouTube */
export const YouTubeField: FC<MediaFieldProps> = ({ field, value, onChange, error }) => {
  const v = String(value ?? '');
  const id = youtubeId(v);
  const bad = v.trim() !== '' && !id;
  return (
    <Shell field={field} error={error} msg={bad ? 'That doesn’t look like a YouTube link. Paste the address from the video’s Share button.' : undefined}>
      <div className="mf-yt">
        <Input value={v} onChange={(e) => { const raw = e.target.value.trim(); onChange(youtubeCanonical(raw) ?? raw); }} placeholder="https://youtu.be/…" invalid={bad} aria-label={field.label} />
        {v && <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => onChange('')}>Clear</Button>}
      </div>
      {id && (
        <div className="mf-yt__preview">
          <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" loading="lazy" />
          <p className="sf__hint"><Link2 size={12} aria-hidden /> On the site this shows as a poster with a play button. YouTube loads only when a visitor presses play.</p>
        </div>
      )}
    </Shell>
  );
};

/* --------------------------------------------------------------------- Loop */
export const LoopField: FC<MediaFieldProps> = ({ field, value, onChange, onSibling, error, siblings }) => {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [local, setLocal] = useState('');
  const val = String(value ?? '');
  const posterField = field.posterField || 'loopPoster';
  const poster = String(siblings?.[posterField] ?? '');
  useEffect(() => () => { if (local) URL.revokeObjectURL(local); }, [local]);

  const pick = async (file?: File) => {
    if (!file) return;
    setMsg('');
    try {
      const { src, poster: still } = await storeLoop(file, setBusy);
      setLocal(URL.createObjectURL(file));
      onChange(src);
      onSibling?.(posterField, still);
    } catch (e: any) {
      setMsg(e?.message || 'Upload failed.');
    } finally { setBusy(''); }
  };

  return (
    <Shell field={field} error={error} msg={msg}>
      <div className="mf-media">
        {val ? (
          <video className="mf-media__video" src={local || rawRepoUrl(fromPublic(val))} poster={poster ? rawRepoUrl(fromPublic(poster)) : undefined} muted loop autoPlay playsInline />
        ) : (
          <span className="mf-media__empty"><Film size={20} aria-hidden /> No loop</span>
        )}
        <div className="mf-media__side">
          {val && <code className="imgfield__name">{val.split('/').pop()}</code>}
          <div className="sf__row-actions">
            <label className="btn btn--secondary btn--sm"><Upload size={14} aria-hidden /><span className="btn__label">{busy || (val ? 'Replace' : 'Upload a clip')}</span>
              <input type="file" accept="video/mp4,video/webm,.mp4,.webm" hidden disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pick(f); }} />
            </label>
            {val && <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => { onChange(''); onSibling?.(posterField, ''); }}>Remove</Button>}
          </div>
          <p className="sf__hint">Silent, up to {LIMITS.loopSeconds} s and {fmtBytes(LIMITS.loopBytes)}. A poster frame is taken for you.</p>
        </div>
      </div>
    </Shell>
  );
};

/* -------------------------------------------------------------------- Audio */
export const AudioField: FC<MediaFieldProps> = ({ field, value, onChange, onSibling, error }) => {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [local, setLocal] = useState('');
  const [rec, setRec] = useState<{ started: number; level: number } | null>(null);
  const [now, setNow] = useState(0);
  const mr = useRef<MediaRecorder | null>(null);
  const stopTimer = useRef<number>(0);
  const val = String(value ?? '');
  const peaksField = field.peaksField || 'audioPeaks';
  useEffect(() => () => { if (local) URL.revokeObjectURL(local); }, [local]);

  const store = async (blob: Blob, name: string) => {
    setMsg('');
    try {
      checkSize(blob, LIMITS.audioBytes, 'Export it as M4A or MP3 at 64–128 kbps. A minute of voice is about 1 MB.');
      setBusy('Drawing the waveform…');
      const { peaks } = await audioPeaks(blob);
      const file = await freeName('public/media/audio', `${slug(name)}.${audioExt(blob, name)}`);
      setBusy(`Uploading ${fmtBytes(blob.size)}…`);
      await commitMedia(`studio: add audio ${file}`, [{ path: `public/media/audio/${file}`, blob }]);
      setLocal(URL.createObjectURL(blob));
      onChange(`/media/audio/${file}`);
      onSibling?.(peaksField, peaks);
    } catch (e: any) {
      setMsg(e?.name === 'EncodingError' ? 'This browser can’t read that audio file. Try M4A or MP3.' : e?.message || 'Upload failed.');
    } finally { setBusy(''); }
  };

  const start = async () => {
    setMsg('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setMsg('This browser can’t record audio. Upload a file instead.'); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { setMsg('Microphone access was refused. Allow it in the browser’s site settings, or upload a file.'); return; }
    const type = recorderType();
    const recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 64000 });
    const chunks: Blob[] = [];
    // level meter
    const ctx = new AudioContext();
    const an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let raf = 0;
    const meter = () => { an.getByteTimeDomainData(buf); let m = 0; for (const b of buf) m = Math.max(m, Math.abs(b - 128)); setRec((r) => (r ? { ...r, level: m / 128 } : r)); setNow(Date.now()); raf = requestAnimationFrame(meter); };
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      cancelAnimationFrame(raf); clearTimeout(stopTimer.current);
      stream.getTracks().forEach((t) => t.stop()); ctx.close();
      setRec(null);
      const blob = new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' });
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      void store(blob, `voice-note-${stamp}`);
    };
    mr.current = recorder;
    recorder.start(1000);
    setRec({ started: Date.now(), level: 0 });
    meter();
    stopTimer.current = window.setTimeout(() => recorder.state === 'recording' && recorder.stop(), 10 * 60 * 1000);
  };
  const stop = () => { if (mr.current?.state === 'recording') mr.current.stop(); };

  const secs = rec ? Math.floor((now - rec.started) / 1000) : 0;
  return (
    <Shell field={field} error={error} msg={msg}>
      <div className="mf-media">
        {val ? <audio className="mf-media__audio" controls preload="metadata" src={local || rawRepoUrl(fromPublic(val))} /> : <span className="mf-media__empty">{rec ? <span className="mf-rec"><span className="mf-rec__dot" /> Recording {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}<span className="mf-rec__meter"><i style={{ transform: `scaleX(${Math.min(1, (rec.level || 0) * 2.2)})` }} /></span></span> : 'No audio'}</span>}
        <div className="mf-media__side">
          {val && <code className="imgfield__name">{val.split('/').pop()}</code>}
          <div className="sf__row-actions">
            {rec
              ? <Button size="sm" variant="primary" icon={<Square size={13} />} onClick={stop}>Stop and save</Button>
              : <Button size="sm" icon={<Mic size={14} />} onClick={start} disabled={!!busy}>{val ? 'Record again' : 'Record'}</Button>}
            {!rec && (
              <label className="btn btn--secondary btn--sm"><Upload size={14} aria-hidden /><span className="btn__label">{busy || 'Upload a file'}</span>
                <input type="file" accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm" hidden disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void store(f, f.name); }} />
              </label>
            )}
            {val && !rec && <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => { onChange(''); onSibling?.(peaksField, ''); }}>Remove</Button>}
          </div>
          <p className="sf__hint">Record straight from your phone, or upload up to {fmtBytes(LIMITS.audioBytes)}. The waveform is drawn for you.</p>
        </div>
      </div>
    </Shell>
  );
};
