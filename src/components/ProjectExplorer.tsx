/**
 * Project explorer (React island). Filters server-rendered project cards by
 * STATUS and by TECHNIQUE, animating layout changes with GSAP Flip. Cards stay
 * in the DOM (SEO/perf); this only owns filter state + the Flip choreography.
 */
import { useState, useEffect, useMemo, type FC } from 'react';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(Flip);

type Status = 'all' | 'active' | 'complete' | 'proposed';

interface Props {
  statusCounts: Record<string, number>;
  techniques: string[]; // unique, sorted
}

const STATUS_ORDER: Status[] = ['all', 'active', 'complete', 'proposed'];
const STATUS_LABELS: Record<Status, string> = {
  all: 'All',
  active: 'Active',
  complete: 'Complete',
  proposed: 'Proposed',
};

const ProjectExplorer: FC<Props> = ({ statusCounts, techniques }) => {
  const [status, setStatus] = useState<Status>('all');
  const [tech, setTech] = useState<string>('');

  const statuses = useMemo(
    () => STATUS_ORDER.filter((s) => s === 'all' || (statusCounts[s] ?? 0) > 0),
    [statusCounts],
  );

  const apply = (nextStatus: Status, nextTech: string) => {
    const cards = gsap.utils.toArray<HTMLElement>('[data-card]');
    if (!cards.length) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = Flip.getState(cards);

    let shown = 0;
    cards.forEach((card) => {
      const okStatus = nextStatus === 'all' || card.dataset.status === nextStatus;
      const techList = (card.dataset.techniques || '').split(',');
      const okTech = !nextTech || techList.includes(nextTech);
      const match = okStatus && okTech;
      if (match) shown++;
      card.classList.toggle('is-filtered-out', !match);
    });

    const empty = document.querySelector('[data-explorer-empty]');
    if (empty) (empty as HTMLElement).style.display = shown === 0 ? '' : 'none';

    if (!reduced) {
      Flip.from(state, {
        duration: 0.6,
        ease: 'power3.inOut',
        scale: true,
        absolute: true,
        onEnter: (els) =>
          gsap.fromTo(els, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'expo.out' }),
        onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.85, duration: 0.3 }),
      });
    }
  };

  const onStatus = (s: Status) => { setStatus(s); apply(s, tech); };
  const onTech = (t: string) => { const v = t === tech ? '' : t; setTech(v); apply(status, v); };

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      // @ts-expect-error optional global from motion.ts
      window.ScrollTrigger?.refresh?.();
    });
    return () => cancelAnimationFrame(id);
  }, [status, tech]);

  return (
    <div className="explorer">
      <div className="explorer__bar">
        <span className="explorer__label u-mono">STATUS</span>
        <div className="filter" role="group" aria-label="Filter by status">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              className={`filter__btn${status === s ? ' is-active' : ''}`}
              aria-pressed={status === s}
              onClick={() => onStatus(s)}
            >
              {STATUS_LABELS[s]}
              <span className="filter__count">
                {s === 'all' ? Object.values(statusCounts).reduce((a, b) => a + b, 0) : statusCounts[s] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {techniques.length > 0 && (
        <div className="explorer__bar">
          <span className="explorer__label u-mono">TECHNIQUE</span>
          <div className="explorer__techs" role="group" aria-label="Filter by technique">
            {techniques.map((t) => (
              <button
                key={t}
                type="button"
                className={`chip explorer__tech${tech === t ? ' is-active' : ''}`}
                aria-pressed={tech === t}
                onClick={() => onTech(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectExplorer;
