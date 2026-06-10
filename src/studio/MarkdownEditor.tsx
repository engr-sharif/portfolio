import { useRef, useState, type FC } from 'react';
import { uploadImage } from './api';

interface Props {
  value: string;
  onChange: (v: string) => void;
  mediaDir?: string;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, '');

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

  const apply = (fn: (ta: HTMLTextAreaElement) => { next: string; caret: number }) => {
    const ta = ref.current; if (!ta) return;
    const { next, caret } = fn(ta);
    onChange(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(caret, caret); });
  };

  const insertImage = async (file: File) => {
    setUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file);
      });
      const name = slugify(file.name);
      const path = `${mediaDir}/${name}`;
      await uploadImage(path, base64, `studio: upload ${name}`);
      const ta = ref.current; if (!ta) return;
      const md = `\n![${file.name.replace(/\.[^.]+$/, '')}](/${path})\n`;
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
      </div>
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
