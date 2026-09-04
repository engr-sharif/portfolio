import { useEffect, useMemo, useState, type FC } from 'react';
import { history, readFileAt, isMissingRoute, type HistoryEntry } from './api';
import { condense, diffLines, diffStats } from './diff';
import { timeAgo } from './studio-lib';

interface Props {
  path: string;                 // repo path of the entry being edited
  current: string;              // what the editor would save right now (serialised)
  onRestore: (content: string, entry: HistoryEntry) => void;
  onClose: () => void;
}

/**
 * Version history drawer: every commit that touched this entry, newest first.
 * Selecting one shows a line diff against what's in the editor NOW (so the
 * author sees exactly what "Restore" would change), and Restore loads that
 * version into the form as an unsaved edit — nothing is published until they
 * press Save, and the save still goes through the normal conflict check.
 */
export const History: FC<Props> = ({ path, current, onRestore, onClose }) => {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loadingVersion, setLoadingVersion] = useState(false);

  useEffect(() => {
    let live = true;
    history(path, 30)
      .then((list) => { if (live) setEntries(list); })
      .catch((e) => {
        if (!live) return;
        setEntries([]);
        setError(isMissingRoute(e)
          ? 'History needs the latest Studio Worker. Re-deploy studio-worker/worker.js to enable it.'
          : e?.message || 'Could not load history.');
      });
    return () => { live = false; };
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = async (entry: HistoryEntry) => {
    setSelected(entry); setContent(null); setError(''); setLoadingVersion(true);
    try {
      const f = await readFileAt(path, entry.sha);
      setContent(f.content ?? '');
    } catch (e: any) { setError(e?.message || 'Could not load that version.'); }
    finally { setLoadingVersion(false); }
  };

  const ops = useMemo(() => (content == null ? null : diffLines(current, content)), [content, current]);
  const stats = ops ? diffStats(ops) : null;
  const rows = ops ? condense(ops) : [];
  const identical = !!ops && stats!.added === 0 && stats!.removed === 0;

  return (
    <>
      <div className="st-scrim st-scrim--history" onClick={onClose} aria-hidden="true" />
      <aside className="st-history" role="dialog" aria-modal="true" aria-label="Version history">
        <header className="st-history__head">
          <div>
            <h2 className="st-history__title">History</h2>
            <p className="st-history__sub u-mono">{path.split('/').pop()}</p>
          </div>
          <button className="st-btn st-btn--ghost" onClick={onClose} aria-label="Close history">✕</button>
        </header>

        {error && <div className="st-error" role="alert">{error}</div>}

        <div className="st-history__body">
          <ol className="st-history__list">
            {entries === null && <li className="st-loading">Loading…</li>}
            {entries?.length === 0 && !error && <li className="st-list__empty">No commits found for this file yet.</li>}
            {entries?.map((e, i) => (
              <li key={e.sha}>
                <button
                  type="button"
                  className={`st-history__item${selected?.sha === e.sha ? ' is-selected' : ''}`}
                  onClick={() => pick(e)}
                >
                  <span className="st-history__when u-mono">
                    {timeAgo(e.date)}{i === 0 && <span className="st-history__live"> · live</span>}
                  </span>
                  <span className="st-history__msg">{e.message.replace(/^studio:\s*/i, '')}</span>
                  <span className="st-history__meta u-mono">{e.sha.slice(0, 7)}{e.author ? ` · ${e.author}` : ''}</span>
                </button>
              </li>
            ))}
          </ol>

          <div className="st-history__detail">
            {!selected && <p className="st-history__hint">Pick a version to compare it with what's in the editor.</p>}
            {selected && loadingVersion && <p className="st-loading">Loading version…</p>}
            {selected && ops && (
              <>
                <div className="st-history__bar">
                  <span className="u-mono st-history__stats">
                    {identical ? 'Identical to the editor' : (
                      <>
                        <span className="st-diff__plus">+{stats!.added}</span> <span className="st-diff__minus">−{stats!.removed}</span>
                        <span className="st-history__vs"> vs. editor</span>
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    className="st-btn st-btn--primary"
                    disabled={identical}
                    onClick={() => onRestore(content ?? '', selected)}
                    title="Load this version into the editor. Nothing is published until you Save."
                  >
                    Restore this version
                  </button>
                </div>
                <pre className="st-diff" aria-label="Changes between the editor and this version">
                  {rows.map((r, i) => r.type === 'skip'
                    ? <span key={i} className="st-diff__skip">··· {r.count} unchanged line{r.count === 1 ? '' : 's'} ···{'\n'}</span>
                    : <span key={i} className={`st-diff__line st-diff__line--${r.type}`}>{r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' '} {r.text}{'\n'}</span>)}
                </pre>
                <p className="st-history__note">Lines marked + are in this version; − are only in the editor now.</p>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
