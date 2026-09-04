/**
 * Human date range for a project (pure; no Astro imports so it's unit-testable).
 * Status-aware: an active project always reads "… — Present" even when a
 * planned end date is on file (SBMM runs to 2030); a proposed one shows its
 * planned end as an estimate; a completed one shows the real end.
 */
export type ProjectStatus = 'active' | 'complete' | 'proposed';

function fmtMonth(s: string): string {
  const [y, m] = s.split('-');
  if (!m) return y;
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function dateRange(start: string, end?: string, status?: ProjectStatus): string {
  const from = fmtMonth(start);
  if (status === 'active') return `${from} — Present`;
  if (!end) return status === 'proposed' ? `${from} — Planned` : `${from} — Present`;
  if (status === 'proposed') return `${from} — est. ${fmtMonth(end)}`;
  return `${from} — ${fmtMonth(end)}`;
}
