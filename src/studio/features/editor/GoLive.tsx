/**
 * "Before it goes live": the clearance checklist (projects) and the automatic
 * confidentiality read (every collection that publishes). The checklist gates
 * the Published switch; the automatic findings are advisory — each can be
 * marked reviewed, and a reviewed finding no longer stops a publish.
 */
import type { FC } from 'react';
import { ShieldCheck, ShieldAlert, Check, CornerDownRight } from 'lucide-react';
import type { Collection } from '../../schema';
import { KIND_INFO, normalise, type Finding } from '../../confidentiality';
import { Switch } from '../../ui/primitives';

export const CLEARANCE = [
  { key: 'names', label: 'Names', text: 'Client, site and people are public, or left out.' },
  { key: 'photos', label: 'Photos', text: 'No faces, plates, signage or logos that identify.' },
  { key: 'location', label: 'Location', text: 'The map precision suits this site.' },
  { key: 'data', label: 'Data', text: 'No unpublished results, figures or deliverables.' },
] as const;

export type Clearance = Partial<Record<(typeof CLEARANCE)[number]['key'], boolean>> & { by?: string; date?: string };
export const isCleared = (c: Clearance | undefined) => CLEARANCE.every((i) => c?.[i.key] === true);
export const findingKey = (f: Finding) => `${f.kind}|${normalise(f.match)}`;

/** Where a finding sits, in the author's words. */
export const whereLabel = (collection: Collection, field: string) =>
  field === 'body' ? collection.bodyLabel || 'Body' : collection.fields.find((f) => f.name === field.split('.')[0])?.label || field;

/** Scroll to the field a finding came from. */
export function revealField(field: string) {
  const el = field === 'body' ? document.querySelector<HTMLElement>('.blk-prose, .blk--source textarea') : document.getElementById(`f-${field.split('.')[0]}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('is-flagged'); void el.offsetWidth; el.classList.add('is-flagged');
  window.setTimeout(() => el.focus({ preventScroll: true }), 350);
}

interface Props {
  collection: Collection;
  data: Record<string, any>;
  set: (name: string, v: any) => void;
  findings: Finding[] | null;       // null while the first read runs
  reviewed: Set<string>;
  onReview: (key: string) => void;
}

export const GoLive: FC<Props> = ({ collection, data, set, findings, reviewed, onReview }) => {
  const clearance: Clearance = data.clearance ?? {};
  const cleared = isCleared(clearance);
  const live = !!data[collection.statusField!];
  const open = findings?.filter((f) => !reviewed.has(findingKey(f))) ?? [];
  const done = findings?.filter((f) => reviewed.has(findingKey(f))) ?? [];

  const tick = (key: string, on: boolean) => {
    const next: Clearance = { ...clearance, [key]: on };
    if (isCleared(next)) next.date = new Date().toISOString().slice(0, 10);
    else delete next.date;
    set('clearance', next);
    if (!on && live) set(collection.statusField!, false); // un-clearing takes it offline
  };

  return (
    <section className="ed__card ed__card--side golive" aria-labelledby="golive-h">
      <h2 className="ed__cardtitle" id="golive-h">Before it goes live</h2>

      {collection.clearance && (
        <>
          <fieldset className="golive__list">
            <legend className="golive__sub">Clearance</legend>
            {CLEARANCE.map((i) => (
              <label key={i.key} className={`golive__item${clearance[i.key] ? ' is-on' : ''}`}>
                <input type="checkbox" checked={!!clearance[i.key]} onChange={(e) => tick(i.key, e.target.checked)} />
                <span className="golive__box" aria-hidden><Check size={12} strokeWidth={3} /></span>
                <span><strong>{i.label}</strong> {i.text}</span>
              </label>
            ))}
          </fieldset>
          <div className={`golive__publish${cleared ? '' : ' is-locked'}`}>
            <div className="golive__row">
              <Switch id="f-published" checked={live} disabled={!cleared && !live} onChange={(v) => set(collection.statusField!, v)} label="Published" />
              <label htmlFor="f-published" className="golive__label">Published</label>
            </div>
            <p className="sf__hint">
              {live && !cleared ? 'Published before this checklist existed. Tick all four to keep it live.'
                : cleared ? `Cleared${clearance.date ? ` ${clearance.date}` : ''}. ${live ? 'Visible on the site.' : 'Switch on to publish.'}`
                : 'Tick all four to publish.'}
            </p>
          </div>
        </>
      )}

      <div className="golive__scan" aria-live="polite">
        <p className="golive__sub">Automatic check</p>
        {findings === null ? (
          <p className="golive__ok is-pending">Reading…</p>
        ) : open.length === 0 ? (
          <p className="golive__ok"><ShieldCheck size={15} aria-hidden /> {done.length ? `Nothing left to review · ${done.length} reviewed` : 'Nothing flagged'}</p>
        ) : (
          <>
            <p className="golive__warn"><ShieldAlert size={15} aria-hidden /> {open.length === 1 ? '1 thing to look at' : `${open.length} things to look at`}</p>
            <ul className="golive__findings">
              {open.slice(0, 8).map((f, i) => (
                <li key={`${findingKey(f)}-${i}`} className="finding">
                  <button type="button" className="finding__go" onClick={() => revealField(f.field)} title={KIND_INFO[f.kind].why}>
                    <span className="finding__kind">{KIND_INFO[f.kind].title}</span>
                    <span className="finding__ctx">{f.before}<mark>{f.match}</mark>{f.after}</span>
                    <span className="finding__where"><CornerDownRight size={11} aria-hidden /> {whereLabel(collection, f.field)}</span>
                  </button>
                  <button type="button" className="finding__ok" onClick={() => onReview(findingKey(f))}>Reviewed</button>
                </li>
              ))}
            </ul>
            {open.length > 8 && <p className="sf__hint">and {open.length - 8} more.</p>}
          </>
        )}
      </div>
    </section>
  );
};
