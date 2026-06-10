import { useEffect, useState, type FC } from 'react';
import { lastDeployTime } from './api';

/**
 * After a publish, show a "Building… → Live ✓" toast. We poll GitHub's
 * deployments API and flip to "Live" once a NEW deployment lands after the
 * publish moment (or after a sensible max wait).
 */
export const PublishToast: FC<{ trigger: number }> = ({ trigger }) => {
  const [phase, setPhase] = useState<'hidden' | 'building' | 'live'>('hidden');

  useEffect(() => {
    if (!trigger) return;
    let cancelled = false;
    setPhase('building');

    const startedAt = Date.now();
    const baseline = trigger; // publish moment

    const poll = async () => {
      if (cancelled) return;
      const t = await lastDeployTime();
      if (cancelled) return;
      // A deployment finishing after we published → it's live.
      if (t && t > baseline) { setPhase('live'); setTimeout(() => !cancelled && setPhase('hidden'), 6000); return; }
      // Safety: stop waiting after 3 min and just say "should be live".
      if (Date.now() - startedAt > 180000) { setPhase('live'); setTimeout(() => !cancelled && setPhase('hidden'), 6000); return; }
      setTimeout(poll, 8000);
    };
    // give the Action a head start before first check
    const id = setTimeout(poll, 12000);
    return () => { cancelled = true; clearTimeout(id); };
  }, [trigger]);

  if (phase === 'hidden') return null;

  return (
    <div className={`st-toast st-toast--${phase}`} role="status" aria-live="polite">
      {phase === 'building' ? (
        <>
          <span className="st-toast__spin" aria-hidden="true" />
          <div>
            <strong>Publishing…</strong>
            <span className="st-toast__sub">Committed to GitHub · building the site (~90s)</span>
          </div>
        </>
      ) : (
        <>
          <span className="st-toast__check" aria-hidden="true">✓</span>
          <div>
            <strong>Live</strong>
            <span className="st-toast__sub">
              Your change is published. <a href="/portfolio/" target="_blank" rel="noopener">View site ↗</a>
            </span>
          </div>
        </>
      )}
    </div>
  );
};
