/**
 * Status filter bar (React island). The project cards are server-rendered by
 * Astro for SEO/perf; this island only owns the filter UI state and animates
 * the existing DOM cards with GSAP Flip on change. Reduced-motion users get an
 * instant show/hide with no Flip tween.
 */
import { useState, useEffect, type FC } from 'react';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(Flip);

type Status = 'all' | 'active' | 'complete' | 'proposed';

interface Props {
  counts: Record<string, number>;
}

const ORDER: Status[] = ['all', 'active', 'complete', 'proposed'];
const LABELS: Record<Status, string> = {
  all: 'All',
  active: 'Active',
  complete: 'Complete',
  proposed: 'Proposed',
};

const ProjectFilter: FC<Props> = ({ counts }) => {
  const [active, setActive] = useState<Status>('all');

  // Only show filters that actually have entries (plus "all").
  const available = ORDER.filter((s) => s === 'all' || (counts[s] ?? 0) > 0);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const shown = active === 'all' ? total : counts[active] ?? 0;

  const apply = (status: Status) => {
    setActive(status);
    const cards = gsap.utils.toArray<HTMLElement>('[data-card]');
    if (!cards.length) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = Flip.getState(cards);

    cards.forEach((card) => {
      const match = status === 'all' || card.dataset.status === status;
      card.classList.toggle('is-filtered-out', !match);
    });

    if (reduced) return;

    Flip.from(state, {
      duration: 0.6,
      ease: 'power3.inOut',
      scale: true,
      absolute: true,
      onEnter: (els) =>
        gsap.fromTo(els, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'expo.out' }),
      onLeave: (els) =>
        gsap.to(els, { opacity: 0, scale: 0.85, duration: 0.3 }),
    });
  };

  // Keep ScrollTrigger positions correct after a relayout.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      // @ts-expect-error optional global from motion.ts
      window.ScrollTrigger?.refresh?.();
    });
    return () => cancelAnimationFrame(id);
  }, [active]);

  return (
    <div className="filter" role="group" aria-label="Filter projects by status">
      {available.map((s) => (
        <button
          key={s}
          type="button"
          className={`filter__btn${active === s ? ' is-active' : ''}`}
          aria-pressed={active === s}
          onClick={() => apply(s)}
        >
          {LABELS[s]}
          <span className="filter__count">{s === 'all' ? total : counts[s] ?? 0}</span>
        </button>
      ))}
      <span aria-live="polite" className="sr-only">
        Showing {shown} {active === 'all' ? 'projects' : `${LABELS[active].toLowerCase()} projects`}.
      </span>
    </div>
  );
};

export default ProjectFilter;
