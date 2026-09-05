import { useEffect, useState, type FC } from 'react';
import { Link, useLocation } from 'wouter';
import { Plus, ArrowRight, MapPin, History as HistoryIcon, ExternalLink } from 'lucide-react';
import { collections } from '../../schema';
import { useStats, useHistory } from '../../app/queries';
import { listCaptures } from '../../fieldlog-store';
import { timeAgo } from '../../studio-lib';
import { collectionIcon } from '../../ui/CommandPalette';
import { Button, Pill, Skeleton } from '../../ui/primitives';

const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export const Dashboard: FC = () => {
  const [, navigate] = useLocation();
  const stats = useStats();
  const activity = useHistory(undefined, 8);
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => { listCaptures().then((cs) => setPending(cs.filter((c) => c.status !== 'published').length)).catch(() => setPending(null)); }, []);

  const folders = collections.filter((c) => c.kind === 'folder');
  const drafts = stats.data?.reduce((n, s) => n + s.draft, 0) ?? 0;

  return (
    <div className="page dash">
      <header className="page__head">
        <div>
          <p className="eyebrow">{greeting()}</p>
          <h1 className="page__title">Your site, at a glance</h1>
        </div>
        <div className="page__actions">
          {folders.map((c) => <Button key={c.id} size="sm" icon={<Plus size={14} />} onClick={() => navigate(`/c/${c.id}/new`)}>{c.label.replace(/s$/, '')}</Button>)}
        </div>
      </header>

      {stats.isError && <div className="callout callout--danger" role="alert"><div className="callout__body">{(stats.error as Error)?.message}</div></div>}

      <section className="dash__grid" aria-label="Collections">
        {folders.map((c) => {
          const s = stats.data?.find((x) => x.id === c.id);
          return (
            <Link key={c.id} href={`/c/${c.id}`} className="card card--link">
              <div className="card__head"><span className="card__icon" aria-hidden>{collectionIcon(c.id, 18)}</span><span className="card__title">{c.label}</span><ArrowRight size={16} className="card__go" aria-hidden /></div>
              {s ? (
                <div className="card__stats">
                  <div><b className="num">{s.total}</b><span>total</span></div>
                  <div><b className="num num--live">{s.live}</b><span>live</span></div>
                  <div><b className={`num${s.draft ? ' num--draft' : ''}`}>{s.draft}</b><span>draft</span></div>
                </div>
              ) : <div className="card__stats"><Skeleton w={48} h={28} /><Skeleton w={48} h={28} /><Skeleton w={48} h={28} /></div>}
            </Link>
          );
        })}
        <Link href="/field-log" className="card card--link card--accent">
          <div className="card__head"><span className="card__icon" aria-hidden><MapPin size={18} /></span><span className="card__title">Field log</span><ArrowRight size={16} className="card__go" aria-hidden /></div>
          <div className="card__stats">
            <div><b className="num">{pending == null ? '–' : pending}</b><span>on this device</span></div>
            <div className="card__note">Capture with no signal; publish later.</div>
          </div>
        </Link>
      </section>

      <div className="dash__cols">
        <section className="panel" aria-labelledby="recent">
          <header className="panel__head"><h2 id="recent" className="panel__title"><HistoryIcon size={15} aria-hidden /> Recent changes</h2><span className="panel__meta">from the site's commit history</span></header>
          {activity.isLoading && <div className="panel__body"><Skeleton h={16} /><Skeleton h={16} /><Skeleton h={16} w="70%" /></div>}
          {activity.data && activity.data.length === 0 && <p className="panel__empty">No commits yet.</p>}
          {activity.data && activity.data.length > 0 && (
            <ol className="activity">
              {activity.data.map((a) => (
                <li key={a.sha} className="activity__row">
                  <span className="activity__when">{timeAgo(a.date)}</span>
                  <span className="activity__msg">{a.message.replace(/^studio:\s*/i, '')}</span>
                  <span className="activity__by">{a.author}</span>
                  {a.url && <a className="activity__sha" href={a.url} target="_blank" rel="noreferrer" title="Open commit on GitHub">{a.sha.slice(0, 7)} <ExternalLink size={11} aria-hidden /></a>}
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="panel" aria-labelledby="todo">
          <header className="panel__head"><h2 id="todo" className="panel__title">Needs attention</h2></header>
          <ul className="todo">
            <li className="todo__row"><Pill tone={drafts ? 'draft' : 'live'} dot>{drafts} draft{drafts === 1 ? '' : 's'}</Pill><span>{drafts ? 'Entries hidden from the site until published.' : 'Everything written is live.'}</span></li>
            <li className="todo__row"><Pill tone={pending ? 'info' : 'neutral'} dot>{pending ?? 0} capture{pending === 1 ? '' : 's'}</Pill><span>{pending ? 'Field-log captures waiting to be published from this device.' : 'No field captures waiting on this device.'}</span></li>
            <li className="todo__row"><Pill tone="neutral">⌘K</Pill><span>Jump anywhere, create anything, find any entry.</span></li>
          </ul>
        </section>
      </div>
    </div>
  );
};
