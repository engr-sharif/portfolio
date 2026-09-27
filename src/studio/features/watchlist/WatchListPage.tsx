/**
 * The watch list: names that must never reach the site — clients, sites,
 * people, anything under a confidentiality agreement. Every entry is checked
 * against it before it goes live. The repo only ever holds hashes, so the page
 * can add, check and remove a name, but cannot show the list back.
 */
import { useState, type FC, type FormEvent } from 'react';
import { EyeOff, Plus, Search, Trash2, ShieldCheck } from 'lucide-react';
import { useWatchList, useSaveWatchList } from '../../app/queries';
import { withTerm, hashTerm, normalise } from '../../confidentiality';
import { useToast } from '../../ui/Toaster';
import { Button, Callout, Input, Skeleton } from '../../ui/primitives';

export const WatchListPage: FC = () => {
  const q = useWatchList();
  const save = useSaveWatchList();
  const { toast, publish } = useToast();
  const [term, setTerm] = useState('');
  const [checked, setChecked] = useState<{ term: string; on: boolean } | null>(null);
  const [error, setError] = useState('');

  const count = q.data?.list.hashes.length ?? 0;
  const clean = normalise(term);

  const commit = async (remove: boolean) => {
    if (!q.data || !clean) return;
    setError('');
    const next = await withTerm(q.data.list, term, remove);
    if (next === q.data.list) { setChecked({ term, on: !remove }); return; }
    try {
      const r = await save.mutateAsync({ list: next, sha: q.data.sha, message: remove ? 'studio: remove a name from the watch list' : 'studio: add a name to the watch list' });
      toast({ kind: 'success', title: remove ? 'Removed from the watch list' : 'Added to the watch list', duration: 3500 });
      publish(r.commit, 'Saving');
      setChecked(null); setTerm('');
    } catch (e: any) { setError(e?.message || 'Could not save the list.'); }
  };
  const check = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!q.data || !clean) return;
    const h = await hashTerm(q.data.list, term);
    setChecked({ term, on: q.data.list.hashes.includes(h) });
  };

  return (
    <div className="page wl">
      <header className="page__head">
        <div>
          <h1 className="page__title">Watch list</h1>
          <p className="page__sub">Names that must never appear on the site. Every entry is checked against this list before it goes live.</p>
        </div>
      </header>

      <section className="wl__card">
        <div className="wl__count">
          {q.isLoading ? <Skeleton w={120} h={40} /> : <><span className="wl__num">{count}</span><span className="wl__unit">{count === 1 ? 'name' : 'names'} on the list</span></>}
        </div>
        <form className="wl__form" onSubmit={check}>
          <label htmlFor="wl-term" className="sf__label">A client, site, person or project</label>
          <div className="wl__row">
            <Input id="wl-term" value={term} autoComplete="off" spellCheck={false} placeholder="e.g. the client’s trading name" onChange={(e) => { setTerm(e.target.value); setChecked(null); }} />
            <Button type="button" variant="primary" icon={<Plus size={15} />} disabled={!clean || q.isLoading} loading={save.isPending} onClick={() => commit(false)}>Add</Button>
            <Button type="submit" icon={<Search size={15} />} disabled={!clean || q.isLoading}>Check</Button>
          </div>
          {checked && (
            <p className={`wl__result${checked.on ? ' is-on' : ''}`} role="status">
              {checked.on
                ? <><ShieldCheck size={15} aria-hidden /> “{checked.term}” is on the list. <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => commit(true)}>Remove it</Button></>
                : <>“{checked.term}” is not on the list.</>}
            </p>
          )}
          <p className="sf__hint">Matching ignores case, accents and punctuation: “Acme Metals, Inc.” also catches “ACME metals inc”. Add each form people actually write: a full name and a short name.</p>
        </form>
        {error && <Callout tone="danger">{error}</Callout>}
      </section>

      <Callout tone="info">
        <span className="wl__why"><EyeOff size={15} aria-hidden /> <span>The list is saved in the repo as one-way hashes, so the file never shows the names and this page can’t list them back. That keeps them from a casual reader. It won’t stop someone who already suspects a particular name, so the list is a safety net, not a vault.</span></span>
      </Callout>
    </div>
  );
};
