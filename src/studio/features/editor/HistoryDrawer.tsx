import { useEffect, useMemo, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw } from 'lucide-react';
import { readFileAt, isMissingRoute, type HistoryEntry } from '../../api';
import { useHistory } from '../../app/queries';
import { condense, diffLines, diffStats } from '../../diff';
import { timeAgo } from '../../studio-lib';
import { Button, IconButton, Skeleton } from '../../ui/primitives';

interface Props { path: string; current: string; onRestore: (content: string, entry: HistoryEntry) => void; onClose: () => void; normalize?: (content: string) => string }

/**
 * Version history drawer: every commit that touched this entry. Selecting one
 * diffs it against what is in the editor NOW; Restore loads it as an unsaved
 * edit (publishing still runs the normal conflict check).
 */
export const HistoryDrawer: FC<Props> = ({ path, current, onRestore, onClose, normalize = (s) => s }) => {
  const hist = useHistory(path, 30);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const pick = async (e: HistoryEntry) => {
    setSelected(e); setContent(null); setErr(''); setLoading(true);
    try { setContent((await readFileAt(path, e.sha)).content ?? ''); }
    catch (x: any) { setErr(x?.message || 'Could not load that version.'); }
    finally { setLoading(false); }
  };
  // Both sides go through the editor's own serializer so quoting/ordering
  // differences between a hand-written file and the Studio's output don't
  // masquerade as edits — only real content changes show up.
  const ops = useMemo(() => (content == null ? null : diffLines(current, normalize(content))), [content, current, normalize]);
  const stats = ops ? diffStats(ops) : null;
  const rows = ops ? condense(ops) : [];
  const identical = !!ops && stats!.added === 0 && stats!.removed === 0;
  const histErr = hist.error ? (isMissingRoute(hist.error) ? 'History needs the latest Studio Worker. Re-deploy studio-worker/worker.js to enable it.' : (hist.error as Error).message) : '';

  return createPortal(
    <>
      <div className="drawer-scrim" onClick={onClose} aria-hidden />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Version history">
        <header className="drawer__head">
          <div><h2 className="drawer__title">History</h2><p className="drawer__sub">{path.split('/').pop()}</p></div>
          <IconButton variant="ghost" label="Close history" icon={<X size={16} />} onClick={onClose} />
        </header>
        {(histErr || err) && <div className="callout callout--danger" role="alert"><div className="callout__body">{histErr || err}</div></div>}
        <div className="drawer__body">
          <ol className="vlist">
            {hist.isLoading && <li className="vlist__skel"><Skeleton h={14} /><Skeleton h={14} w="60%" /></li>}
            {hist.data?.length === 0 && <li className="vlist__empty">No commits found for this file yet.</li>}
            {hist.data?.map((e, i) => (
              <li key={e.sha}>
                <button type="button" className={`vlist__item${selected?.sha === e.sha ? ' is-selected' : ''}`} onClick={() => pick(e)}>
                  <span className="vlist__when">{timeAgo(e.date)}{i === 0 && <span className="vlist__live"> · live</span>}</span>
                  <span className="vlist__msg">{e.message.replace(/^studio:\s*/i, '')}</span>
                  <span className="vlist__meta">{e.sha.slice(0, 7)}{e.author ? ` · ${e.author}` : ''}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="drawer__detail">
            {!selected && <p className="drawer__hint">Pick a version to compare it with what's in the editor.</p>}
            {selected && loading && <p className="drawer__hint">Loading version…</p>}
            {selected && ops && (
              <>
                <div className="drawer__bar">
                  <span className="drawer__stats">{identical ? 'Identical to the editor' : <><span className="diff__plus">+{stats!.added}</span> <span className="diff__minus">−{stats!.removed}</span><span className="drawer__vs"> vs. editor</span></>}</span>
                  <Button variant="primary" size="sm" icon={<RotateCcw size={14} />} disabled={identical} onClick={() => onRestore(content ?? '', selected)} title="Load this version into the editor. Nothing is published until you Save.">Restore this version</Button>
                </div>
                <pre className="diff" aria-label="Changes between the editor and this version">
                  {rows.map((r, i) => r.type === 'skip'
                    ? <span key={i} className="diff__skip">··· {r.count} unchanged line{r.count === 1 ? '' : 's'} ···{'\n'}</span>
                    : <span key={i} className={`diff__line diff__line--${r.type}`}>{r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' '} {r.text}{'\n'}</span>)}
                </pre>
                <p className="drawer__hint">Lines marked + are in this version; − are only in the editor now.</p>
              </>
            )}
          </div>
        </div>
      </aside>
    </>,
    document.body,
  );
};
