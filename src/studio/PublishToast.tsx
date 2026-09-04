import { useEffect, useState, type FC } from 'react';
import { deployStatus, type DeployState } from './api';

/**
 * After a publish, show "Publishing… → Live ✓" — honestly. We poll the
 * Worker's deploy-status (backed by the Actions run for the deploy branch):
 *   live    — a rebuild triggered after the publish finished successfully
 *   failed  — the rebuild broke (link to the run so it can be inspected)
 *   unsure  — nothing could be confirmed within the wait window; we say so
 *             instead of pretending.
 */
type Phase = 'hidden' | 'building' | 'live' | 'failed' | 'unsure';
const MAX_WAIT_MS = 4 * 60 * 1000;
const SITE_URL = import.meta.env.BASE_URL; // the site's base path, whatever host it's on

export const PublishToast: FC<{ trigger: number }> = ({ trigger }) => {
  const [phase, setPhase] = useState<Phase>('hidden');
  const [runUrl, setRunUrl] = useState<string | undefined>();

  useEffect(() => {
    if (!trigger) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setPhase('building'); setRunUrl(undefined);

    const startedAt = Date.now();
    const finish = (p: Phase, url?: string, hideAfter = 7000) => {
      if (cancelled) return;
      setPhase(p); setRunUrl(url);
      timer = setTimeout(() => !cancelled && setPhase('hidden'), hideAfter);
    };

    const poll = async () => {
      if (cancelled) return;
      const s = await deployStatus(trigger);
      if (cancelled) return;
      const state: DeployState = s.state;
      if (state === 'live') return finish('live', s.url);
      if (state === 'failed') return finish('failed', s.url, 20000);
      if (Date.now() - startedAt > MAX_WAIT_MS) return finish('unsure', s.url, 12000);
      timer = setTimeout(poll, state === 'building' ? 6000 : 9000);
    };
    // give the Action a head start before first check
    timer = setTimeout(poll, 10000);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [trigger]);

  if (phase === 'hidden') return null;

  return (
    <div className={`st-toast st-toast--${phase}`} role="status" aria-live="polite">
      {phase === 'building' && (
        <>
          <span className="st-toast__spin" aria-hidden="true" />
          <div>
            <strong>Publishing…</strong>
            <span className="st-toast__sub">Committed to GitHub · building the site (~90s)</span>
          </div>
        </>
      )}
      {phase === 'live' && (
        <>
          <span className="st-toast__check" aria-hidden="true">✓</span>
          <div>
            <strong>Live</strong>
            <span className="st-toast__sub">
              Your change is published. <a href={SITE_URL} target="_blank" rel="noopener">View site ↗</a>
            </span>
          </div>
        </>
      )}
      {phase === 'failed' && (
        <>
          <span className="st-toast__check st-toast__check--bad" aria-hidden="true">!</span>
          <div>
            <strong>Build failed</strong>
            <span className="st-toast__sub">
              The change is committed but the site didn’t rebuild.{' '}
              {runUrl ? <a href={runUrl} target="_blank" rel="noopener">See the log ↗</a> : 'Check the Actions tab on GitHub.'}
            </span>
          </div>
        </>
      )}
      {phase === 'unsure' && (
        <>
          <span className="st-toast__check st-toast__check--dim" aria-hidden="true">?</span>
          <div>
            <strong>Probably live</strong>
            <span className="st-toast__sub">
              Committed, but the rebuild couldn’t be confirmed. <a href={SITE_URL} target="_blank" rel="noopener">Check the site ↗</a>
            </span>
          </div>
        </>
      )}
    </div>
  );
};
