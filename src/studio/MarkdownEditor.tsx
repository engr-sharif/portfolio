import { useRef, useState, type FC } from 'react';
import { uploadImage, aiAssist } from './api';
import { processImage } from './image-process';
import { aiGuide } from './studio-lib';

const AI_ACTIONS: { key: string; label: string }[] = [
  { key: 'polish', label: 'Polish' },
  { key: 'grammar', label: 'Fix grammar' },
  { key: 'summarize', label: 'Summarize' },
  { key: 'expand', label: 'Expand from notes' },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  mediaDir?: string;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, '');

/** Turn a YouTube/Vimeo URL into a responsive embed snippet, or null if it
 * isn't a recognised video URL. */
function videoEmbed(url: string): string | null {
  const u = url.trim();
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) {
    return `<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}" title="Video" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
  }
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) {
    return `<div class="video-embed"><iframe src="https://player.vimeo.com/video/${vm[1]}" title="Video" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  return null;
}

/** Wrap or insert markdown around the current selection in the textarea. */
function surround(ta: HTMLTextAreaElement, before: string, after = before, placeholder = '') {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const sel = value.slice(s, e) || placeholder;
  const next = value.slice(0, s) + before + sel + after + value.slice(e);
  return { next, caret: s + before.length + sel.length + after.length };
}
function prefixLines(ta: HTMLTextAreaElement, prefix: string) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  const block = value.slice(lineStart, e);
  const replaced = block.split('\n').map((l) => (l ? prefix + l : l)).join('\n');
  return { next: value.slice(0, lineStart) + replaced + value.slice(e), caret: lineStart + replaced.length };
}

export const MarkdownEditor: FC<Props> = ({ value, onChange, mediaDir = 'src/assets/blog' }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [uploading, setUploading] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoErr, setVideoErr] = useState('');
  // AI assist
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [aiErr, setAiErr] = useState('');
  const [aiOnSelection, setAiOnSelection] = useState(false);

  const runAi = async (task: string) => {
    const ta = ref.current;
    const sel = ta && ta.selectionEnd > ta.selectionStart ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : '';
    const input = sel || value;
    if (!input.trim()) { setAiErr('Write something first, or select text to work on.'); return; }
    setAiOnSelection(!!sel);
    setAiBusy(task); setAiErr(''); setAiResult('');
    try {
      const guide = await aiGuide();
      const { result } = await aiAssist(task, input, guide ? { system: guide } : {});
      if (!result) { setAiErr('The assistant returned nothing — try again.'); }
      else setAiResult(result);
    } catch (e: any) {
      setAiErr(e?.message || 'AI request failed.');
    } finally { setAiBusy(''); }
  };

  const acceptAi = (mode: 'replace' | 'insert') => {
    const ta = ref.current;
    if (mode === 'replace' && aiOnSelection && ta && ta.selectionEnd > ta.selectionStart) {
      const { selectionStart: s, selectionEnd: e } = ta;
      onChange(value.slice(0, s) + aiResult + value.slice(e));
    } else if (mode === 'replace') {
      onChange(aiResult);
    } else {
      const at = ta ? ta.selectionStart : value.length;
      onChange(value.slice(0, at) + `\n\n${aiResult}\n\n` + value.slice(at));
    }
    setAiResult(''); setAiOpen(false); setAiErr('');
  };

  const apply = (fn: (ta: HTMLTextAreaElement) => { next: string; caret: number }) => {
    const ta = ref.current; if (!ta) return;
    const { next, caret } = fn(ta);
    onChange(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(caret, caret); });
  };

  /** Insert a raw HTML block at the caret (or end). Blank lines on both sides
   * so the markdown parser treats it as a standalone HTML block. */
  const insertBlock = (html: string) => {
    const ta = ref.current;
    const at = ta ? ta.selectionStart : value.length;
    const block = `\n\n${html}\n\n`;
    onChange(value.slice(0, at) + block + value.slice(at));
  };

  const insertVideoUrl = () => {
    const embed = videoEmbed(videoUrl);
    if (!embed) { setVideoErr('Not a YouTube or Vimeo link. Check the URL.'); return; }
    insertBlock(embed);
    setVideoUrl(''); setVideoErr(''); setVideoOpen(false);
  };

  const insertVideoFile = async (file: File) => {
    setUploading(true); setVideoErr('');
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file);
      });
      const name = slugify(file.name);
      const path = `public/videos/${name}`;
      await uploadImage(path, base64, `studio: upload ${name}`);
      // Root-relative under the site base (/portfolio/), matching the rest of the codebase.
      insertBlock(`<video class="video-embed-native" controls preload="metadata" src="/portfolio/videos/${name}"></video>`);
      setVideoOpen(false);
    } catch (e: any) {
      setVideoErr(e?.message || 'Upload failed.');
    } finally { setUploading(false); }
  };

  const insertImage = async (file: File) => {
    setUploading(true);
    try {
      const { file: out } = await processImage(file); // HEIC→JPEG + downscale
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(out);
      });
      const name = slugify(out.name);
      const path = `${mediaDir}/${name}`;
      await uploadImage(path, base64, `studio: upload ${name}`);
      const ta = ref.current; if (!ta) return;
      const md = `\n![${out.name.replace(/\.[^.]+$/, '')}](/${path})\n`;
      const { selectionStart: s } = ta;
      const next = value.slice(0, s) + md + value.slice(s);
      onChange(next);
    } finally { setUploading(false); }
  };

  const tools = [
    { label: 'B', title: 'Bold', fn: (ta: HTMLTextAreaElement) => surround(ta, '**', '**', 'bold') },
    { label: 'I', title: 'Italic', fn: (ta: HTMLTextAreaElement) => surround(ta, '_', '_', 'italic') },
    { label: 'H2', title: 'Heading', fn: (ta: HTMLTextAreaElement) => prefixLines(ta, '## ') },
    { label: 'H3', title: 'Subheading', fn: (ta: HTMLTextAreaElement) => prefixLines(ta, '### ') },
    { label: '“ ”', title: 'Quote', fn: (ta: HTMLTextAreaElement) => prefixLines(ta, '> ') },
    { label: '•', title: 'Bulleted list', fn: (ta: HTMLTextAreaElement) => prefixLines(ta, '- ') },
    { label: '1.', title: 'Numbered list', fn: (ta: HTMLTextAreaElement) => prefixLines(ta, '1. ') },
    { label: '</>', title: 'Code', fn: (ta: HTMLTextAreaElement) => surround(ta, '`', '`', 'code') },
    { label: '🔗', title: 'Link', fn: (ta: HTMLTextAreaElement) => surround(ta, '[', '](https://)', 'text') },
  ];

  return (
    <div className="md">
      <div className="md__bar">
        {tools.map((t) => (
          <button type="button" key={t.label} className="md__btn" title={t.title} onMouseDown={(e) => { e.preventDefault(); apply(t.fn); }}>
            {t.label}
          </button>
        ))}
        <label className="md__btn md__btn--img" title="Insert image">
          {uploading ? '…' : '🖼'}
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) insertImage(f); }} />
        </label>
        <button type="button" className="md__btn" title="Insert video"
          onMouseDown={(e) => { e.preventDefault(); setVideoOpen((o) => !o); setVideoErr(''); }}>▶</button>
        <button type="button" className={`md__btn md__btn--ai${aiOpen ? ' is-on' : ''}`} title="AI assist"
          onMouseDown={(e) => { e.preventDefault(); setAiOpen((o) => !o); setAiErr(''); setAiResult(''); }}>✨</button>
      </div>

      {aiOpen && (
        <div className="md__ai">
          <p className="md__ai-label">Work on the selected text, or the whole write-up if nothing is selected:</p>
          <div className="md__ai-actions">
            {AI_ACTIONS.map((a) => (
              <button key={a.key} type="button" className="sf__btn" disabled={!!aiBusy}
                onClick={() => runAi(a.key)}>
                {aiBusy === a.key ? 'Working…' : a.label}
              </button>
            ))}
            <button type="button" className="sf__btn sf__btn--ghost" onClick={() => { setAiOpen(false); setAiResult(''); setAiErr(''); }}>Close</button>
          </div>
          {aiErr && <p className="md__ai-err">{aiErr}</p>}
          {aiResult && (
            <div className="md__ai-result">
              <textarea className="sf__input sf__textarea" rows={6} value={aiResult} onChange={(e) => setAiResult(e.target.value)} />
              <div className="md__ai-row">
                <button type="button" className="sf__btn sf__btn--upload" onClick={() => acceptAi('replace')}>{aiOnSelection ? 'Replace selection' : 'Replace all'}</button>
                <button type="button" className="sf__btn" onClick={() => acceptAi('insert')}>Insert below</button>
                <button type="button" className="sf__btn sf__btn--ghost" onClick={() => setAiResult('')}>Discard</button>
              </div>
            </div>
          )}
        </div>
      )}

      {videoOpen && (
        <div className="md__video">
          <p className="md__video-label">Paste a YouTube or Vimeo link…</p>
          <div className="md__video-row">
            <input
              className="sf__input sf__input--sm" placeholder="https://youtu.be/…" value={videoUrl} autoFocus
              onChange={(e) => { setVideoUrl(e.target.value); setVideoErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertVideoUrl(); } }}
            />
            <button type="button" className="sf__btn" onClick={insertVideoUrl}>Insert</button>
          </div>
          <p className="md__video-label">…or upload a short clip (MP4, keep it under ~50&nbsp;MB)</p>
          <div className="md__video-row">
            <label className="sf__btn sf__btn--upload">
              {uploading ? 'Uploading…' : 'Upload MP4'}
              <input type="file" accept="video/mp4,video/webm" hidden disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) insertVideoFile(f); }} />
            </label>
            <button type="button" className="sf__btn sf__btn--ghost" onClick={() => setVideoOpen(false)}>Cancel</button>
          </div>
          {videoErr && <p className="md__video-err">{videoErr}</p>}
        </div>
      )}
      <textarea
        ref={ref}
        className="sf__input sf__textarea sf__textarea--lg"
        rows={18}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Markdown — use the toolbar or type directly…"
        onDrop={(e) => {
          const f = e.dataTransfer.files?.[0];
          if (f && f.type.startsWith('image/')) { e.preventDefault(); insertImage(f); }
        }}
      />
    </div>
  );
};
