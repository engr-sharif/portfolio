import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Placeholder from '@tiptap/extension-placeholder';
import type { Editor, Range } from '@tiptap/core';
import { Bold, Italic, Code, Link2, Heading2, Heading3, List, ListOrdered, Quote, SquareCode, Image as ImageIcon, Film, Minus, Undo2, Redo2, Sparkles, FileCode2, Pilcrow, Type, Loader2 } from 'lucide-react';
import { HtmlBlock, RepoImage, createSlash, type SlashItem, type SlashState } from './extensions';
import { uploadFile } from '../Field';
import { MarkdownEditor, videoEmbed } from '../../../MarkdownEditor';
import { aiAssist, uploadImage } from '../../../api';
import { aiGuide } from '../../../studio-lib';
import { Button, Dialog, IconButton, Input, Menu } from '../../../ui/primitives';

/**
 * Block editor for the markdown body. TipTap/ProseMirror in the browser, clean
 * markdown in the repo: every change is serialised back through the official
 * markdown extension, raw HTML embeds survive as blocks, images keep their
 * repo paths. "/" opens a block menu; selecting text shows inline formatting;
 * images can be dropped or pasted straight into the text. A "Markdown" toggle
 * swaps to the raw source (the previous editor) for anything unusual.
 */
interface Props { value: string; onChange: (md: string) => void; mediaDir?: string; placeholder?: string }
type Mode = 'blocks' | 'markdown';
const MODE_KEY = 'studio.editor';
const AI_TASKS = [
  { key: 'polish', label: 'Polish wording' },
  { key: 'grammar', label: 'Fix grammar only' },
  { key: 'summarize', label: 'Summarize' },
  { key: 'expand', label: 'Expand from notes' },
];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, '');

export const BlockEditor: FC<Props> = ({ value, onChange, mediaDir = 'src/assets/blog', placeholder = 'Write, or type “/” for blocks…' }) => {
  const [mode, setMode] = useState<Mode>(() => { try { return (localStorage.getItem(MODE_KEY) as Mode) || 'blocks'; } catch { return 'blocks'; } });
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoErr, setVideoErr] = useState('');
  const [busy, setBusy] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [ai, setAi] = useState<{ task: string; result: string; range: Range | null } | null>(null);
  const [aiErr, setAiErr] = useState('');
  const lastMd = useRef(value);
  const fileInput = useRef<HTMLInputElement>(null);

  const insertImages = useCallback(async (editor: Editor, files: File[], pos?: number) => {
    const imgs = files.filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!imgs.length) return false;
    setBusy(`Uploading ${imgs.length} image${imgs.length === 1 ? '' : 's'}…`);
    try {
      for (const f of imgs) {
        const { path } = await uploadFile(f, mediaDir);
        const node = { type: 'image', attrs: { src: path, alt: f.name.replace(/\.[^.]+$/, '') } };
        if (pos != null) editor.chain().focus().insertContentAt(pos, node).run(); else editor.chain().focus().insertContent(node).run();
      }
    } catch (e: any) { setAiErr(e?.message || 'Upload failed.'); }
    finally { setBusy(''); }
    return true;
  }, [mediaDir]);

  const slashItems = useMemo<SlashItem[]>(() => [
    { id: 'p', title: 'Text', hint: 'Plain paragraph', icon: <Pilcrow size={15} />, keywords: 'paragraph body', run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
    { id: 'h2', title: 'Heading 2', hint: 'Section', icon: <Heading2 size={15} />, keywords: 'h2 title section', run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
    { id: 'h3', title: 'Heading 3', hint: 'Subsection', icon: <Heading3 size={15} />, keywords: 'h3 sub', run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
    { id: 'ul', title: 'Bulleted list', icon: <List size={15} />, keywords: 'bullet list ul', run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
    { id: 'ol', title: 'Numbered list', icon: <ListOrdered size={15} />, keywords: 'ordered number ol steps', run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
    { id: 'quote', title: 'Quote', icon: <Quote size={15} />, keywords: 'blockquote callout', run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
    { id: 'code', title: 'Code block', hint: 'Snippet with syntax', icon: <SquareCode size={15} />, keywords: 'pre fence snippet', run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
    { id: 'img', title: 'Image', hint: 'Upload from device', icon: <ImageIcon size={15} />, keywords: 'photo picture upload', run: (e, r) => { e.chain().focus().deleteRange(r).run(); fileInput.current?.click(); } },
    { id: 'video', title: 'Video', hint: 'YouTube, Vimeo or upload', icon: <Film size={15} />, keywords: 'youtube vimeo embed', run: (e, r) => { e.chain().focus().deleteRange(r).run(); setVideoErr(''); setVideoOpen(true); } },
    { id: 'hr', title: 'Divider', icon: <Minus size={15} />, keywords: 'rule separator hr', run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
  ], []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noreferrer' } } }),
      Markdown.configure({ indentation: { style: 'space', size: 2 } }),
      Placeholder.configure({ placeholder }),
      RepoImage.configure({ mediaDir, inline: false, allowBase64: false }),
      HtmlBlock,
      createSlash(slashItems, setSlash),
    ],
    content: value,
    contentType: 'markdown',
    // TipTap would inject a <style> for ProseMirror's base rules; the Studio's
    // CSP forbids inline <style>, so those rules live in studio.css instead.
    injectCSS: false,
    editorProps: {
      attributes: { class: 'blk-prose', spellcheck: 'true' },
      handleDrop: (view, event, _slice, moved) => {
        const files = Array.from(event.dataTransfer?.files || []);
        if (moved || !files.length) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        event.preventDefault();
        void insertImages(editorRef.current!, files, pos);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files || []);
        if (!files.length) return false;
        event.preventDefault();
        void insertImages(editorRef.current!, files);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => { const md = e.getMarkdown(); lastMd.current = md; onChange(md); },
  }, [mediaDir]);
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  // External changes (restored draft/version, markdown-mode edits) flow in.
  useEffect(() => {
    if (!editor || value === lastMd.current) return;
    lastMd.current = value;
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
  }, [value, editor]);

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => e ? ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), code: e.isActive('code'), link: e.isActive('link'),
      h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }), p: e.isActive('paragraph'),
      ul: e.isActive('bulletList'), ol: e.isActive('orderedList'), quote: e.isActive('blockquote'), codeBlock: e.isActive('codeBlock'),
      canUndo: e.can().undo(), canRedo: e.can().redo(), hasSelection: !e.state.selection.empty,
    }) : null,
  });

  const setModeAndRemember = (m: Mode) => { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* fine */ } };

  const openLink = () => { if (!editor) return; setLinkUrl(editor.getAttributes('link').href || ''); setLinkOpen(true); };
  const applyLink = () => {
    if (!editor) return;
    const href = linkUrl.trim();
    if (!href) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: /^(https?:|mailto:|\/)/.test(href) ? href : `https://${href}` }).run();
    setLinkOpen(false);
  };
  const insertVideoUrl = () => {
    const html = videoEmbed(videoUrl);
    if (!html || !editor) { setVideoErr('Not a YouTube or Vimeo link. Check the URL.'); return; }
    editor.chain().focus().insertContent({ type: 'htmlBlock', attrs: { html } }).run();
    setVideoUrl(''); setVideoOpen(false);
  };
  const insertVideoFile = async (file: File) => {
    if (!editor) return;
    setBusy('Uploading video…'); setVideoErr('');
    try {
      const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
      const name = slugify(file.name);
      await uploadImage(`public/videos/${name}`, base64, `studio: upload ${name}`);
      editor.chain().focus().insertContent({ type: 'htmlBlock', attrs: { html: `<video class="video-embed-native" controls preload="metadata" src="${import.meta.env.BASE_URL}videos/${name}"></video>` } }).run();
      setVideoOpen(false);
    } catch (e: any) { setVideoErr(e?.message || 'Upload failed.'); }
    finally { setBusy(''); }
  };

  const runAi = async (task: string) => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    const text = empty ? editor.getMarkdown() : editor.state.doc.textBetween(from, to, '\n');
    if (!text.trim()) { setAiErr('Write something first, or select text to work on.'); return; }
    setAiOpen(false); setAiErr(''); setBusy(`Assistant: ${task}…`);
    try {
      const guide = await aiGuide();
      const { result } = await aiAssist(task, text, guide ? { system: guide } : {});
      if (!result) setAiErr('The assistant returned nothing — try again.'); else setAi({ task, result, range: empty ? null : { from, to } });
    } catch (e: any) { setAiErr(e?.message || 'AI request failed.'); }
    finally { setBusy(''); }
  };
  const applyAi = (how: 'replace' | 'insert') => {
    if (!editor || !ai) return;
    if (how === 'replace' && ai.range) editor.chain().focus().insertContentAt(ai.range, ai.result, { contentType: 'markdown' }).run();
    else if (how === 'replace') editor.commands.setContent(ai.result, { contentType: 'markdown' });
    else editor.chain().focus().insertContent(`\n\n${ai.result}\n\n`, { contentType: 'markdown' }).run();
    if (how === 'replace' && !ai.range) { const md = editor.getMarkdown(); lastMd.current = md; onChange(md); }
    setAi(null);
  };

  const Tb: FC<{ on: boolean | undefined; label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }> = ({ on, label, icon, onClick, disabled }) => (
    <button type="button" className={`blk-tb__btn${on ? ' is-on' : ''}`} title={label} aria-label={label} aria-pressed={on} onClick={onClick} disabled={disabled} onMouseDown={(e) => e.preventDefault()}>{icon}</button>
  );

  return (
    <div className={`blk${mode === 'markdown' ? ' blk--source' : ''}`}>
      <div className="blk-tb" role="toolbar" aria-label="Formatting">
        {mode === 'blocks' && editor && (
          <>
            <select className="blk-tb__select" aria-label="Block type" value={active?.h2 ? 'h2' : active?.h3 ? 'h3' : active?.codeBlock ? 'code' : active?.quote ? 'quote' : 'p'} onChange={(e) => { const v = e.target.value; const c = editor.chain().focus(); (v === 'h2' ? c.setHeading({ level: 2 }) : v === 'h3' ? c.setHeading({ level: 3 }) : v === 'code' ? c.setCodeBlock() : v === 'quote' ? c.setBlockquote() : c.setParagraph()).run(); }}>
              <option value="p">Text</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="quote">Quote</option><option value="code">Code block</option>
            </select>
            <span className="blk-tb__sep" />
            <Tb on={active?.bold} label="Bold (⌘B)" icon={<Bold size={15} />} onClick={() => editor.chain().focus().toggleBold().run()} />
            <Tb on={active?.italic} label="Italic (⌘I)" icon={<Italic size={15} />} onClick={() => editor.chain().focus().toggleItalic().run()} />
            <Tb on={active?.code} label="Inline code" icon={<Code size={15} />} onClick={() => editor.chain().focus().toggleCode().run()} />
            <Tb on={active?.link} label="Link (⌘K in text)" icon={<Link2 size={15} />} onClick={openLink} />
            <span className="blk-tb__sep" />
            <Tb on={active?.ul} label="Bulleted list" icon={<List size={15} />} onClick={() => editor.chain().focus().toggleBulletList().run()} />
            <Tb on={active?.ol} label="Numbered list" icon={<ListOrdered size={15} />} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
            <Tb on={active?.quote} label="Quote" icon={<Quote size={15} />} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
            <Tb on={active?.codeBlock} label="Code block" icon={<SquareCode size={15} />} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
            <span className="blk-tb__sep" />
            <Tb on={false} label="Image (or drop / paste one)" icon={<ImageIcon size={15} />} onClick={() => fileInput.current?.click()} />
            <Tb on={false} label="Video" icon={<Film size={15} />} onClick={() => { setVideoErr(''); setVideoOpen(true); }} />
            <Tb on={false} label="Divider" icon={<Minus size={15} />} onClick={() => editor.chain().focus().setHorizontalRule().run()} />
            <span className="blk-tb__sep" />
            <Tb on={false} label="Undo" icon={<Undo2 size={15} />} onClick={() => editor.chain().focus().undo().run()} disabled={!active?.canUndo} />
            <Tb on={false} label="Redo" icon={<Redo2 size={15} />} onClick={() => editor.chain().focus().redo().run()} disabled={!active?.canRedo} />
            <span className="blk-tb__sep" />
            <Menu open={aiOpen} setOpen={setAiOpen} align="left" trigger={(p) => <button type="button" className="blk-tb__btn blk-tb__btn--ai" title="AI assistant" {...p}><Sparkles size={15} /><span>Assist</span></button>}
              items={AI_TASKS.map((t) => ({ label: `${t.label}${active?.hasSelection ? ' (selection)' : ''}`, onSelect: () => runAi(t.key) }))} />
          </>
        )}
        <span className="blk-tb__spacer" />
        {busy && <span className="blk-tb__busy"><Loader2 className="spin" size={13} /> {busy}</span>}
        <div className="seg seg--sm" role="tablist" aria-label="Editor mode">
          <button type="button" role="tab" aria-selected={mode === 'blocks'} className={`seg__btn${mode === 'blocks' ? ' is-on' : ''}`} onClick={() => setModeAndRemember('blocks')}><Type size={13} /> Blocks</button>
          <button type="button" role="tab" aria-selected={mode === 'markdown'} className={`seg__btn${mode === 'markdown' ? ' is-on' : ''}`} onClick={() => setModeAndRemember('markdown')}><FileCode2 size={13} /> Markdown</button>
        </div>
      </div>

      {aiErr && <p className="sf__err blk-err" role="alert">{aiErr} <button type="button" className="link" onClick={() => setAiErr('')}>dismiss</button></p>}
      {ai && (
        <div className="blk-ai" role="status">
          <div className="blk-ai__head"><Sparkles size={14} aria-hidden /> Assistant · {AI_TASKS.find((t) => t.key === ai.task)?.label}{ai.range ? ' (selection)' : ''}</div>
          <pre className="blk-ai__text">{ai.result}</pre>
          <div className="sf__row-actions">
            <Button size="sm" variant="primary" onClick={() => applyAi('replace')}>{ai.range ? 'Replace selection' : 'Replace all'}</Button>
            <Button size="sm" onClick={() => applyAi('insert')}>Insert at cursor</Button>
            <Button size="sm" variant="ghost" onClick={() => setAi(null)}>Discard</Button>
          </div>
        </div>
      )}

      {mode === 'blocks' ? (
        <div className="blk-body">
          <EditorContent editor={editor} />
          {editor && (
            <BubbleMenu editor={editor} className="blk-bubble" options={{ placement: 'top', offset: 8 }}>
              <Tb on={active?.bold} label="Bold" icon={<Bold size={14} />} onClick={() => editor.chain().focus().toggleBold().run()} />
              <Tb on={active?.italic} label="Italic" icon={<Italic size={14} />} onClick={() => editor.chain().focus().toggleItalic().run()} />
              <Tb on={active?.code} label="Code" icon={<Code size={14} />} onClick={() => editor.chain().focus().toggleCode().run()} />
              <Tb on={active?.link} label="Link" icon={<Link2 size={14} />} onClick={openLink} />
              <span className="blk-tb__sep" />
              <Tb on={active?.h2} label="Heading 2" icon={<Heading2 size={14} />} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
              <Tb on={active?.quote} label="Quote" icon={<Quote size={14} />} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
              <Tb on={false} label="Assist with selection" icon={<Sparkles size={14} />} onClick={() => setAiOpen(true)} />
            </BubbleMenu>
          )}
        </div>
      ) : (
        <MarkdownEditor value={value} onChange={onChange} mediaDir={mediaDir} />
      )}

      <input ref={fileInput} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (editor && fs.length) void insertImages(editor, fs); }} />

      {slash && slash.rect && createPortal(
        <div className="slash" role="listbox" aria-label="Insert block" style={{ top: slash.rect.bottom + 6, left: Math.max(8, Math.min(slash.rect.left, window.innerWidth - 300)) }}>
          {slash.items.map((it, i) => (
            <button key={it.id} type="button" role="option" aria-selected={i === slash.index} className={`slash__item${i === slash.index ? ' is-active' : ''}`} onMouseDown={(e) => { e.preventDefault(); slash.select(i); }}>
              <span className="slash__icon" aria-hidden>{it.icon}</span>
              <span className="slash__title">{it.title}</span>
              {it.hint && <span className="slash__hint">{it.hint}</span>}
            </button>
          ))}
        </div>, document.body)}

      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} title="Link" width={420} footer={<><Button variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button>{active?.link && <Button variant="danger" onClick={() => { setLinkUrl(''); applyLink(); }}>Remove link</Button>}<Button variant="primary" onClick={applyLink}>Apply</Button></>}>
        <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" aria-label="URL" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } }} autoFocus />
      </Dialog>
      <Dialog open={videoOpen} onClose={() => setVideoOpen(false)} title="Add a video" width={460}>
        <div className="sf"><span className="sf__label">YouTube or Vimeo link</span>
          <div className="sf__row-actions"><Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtu.be/…" aria-label="Video URL" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertVideoUrl(); } }} /><Button variant="primary" onClick={insertVideoUrl}>Embed</Button></div>
        </div>
        <div className="sf"><span className="sf__label">Or upload a short MP4</span>
          <label className="btn btn--secondary btn--sm"><Film size={14} aria-hidden /><span className="btn__label">{busy || 'Choose file'}</span><input type="file" accept="video/mp4,video/webm" hidden disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void insertVideoFile(f); }} /></label>
          <p className="sf__hint">Keep it under ~20 MB; large files belong on YouTube or Vimeo.</p>
        </div>
        {videoErr && <p className="sf__err" role="alert">{videoErr}</p>}
      </Dialog>
    </div>
  );
};
