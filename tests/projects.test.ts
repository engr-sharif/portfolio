import { describe, it, expect } from 'vitest';
import { dateRange } from '../src/lib/date-range';

describe('dateRange', () => {
  it('active projects always read "Present" even with a planned end', () => {
    expect(dateRange('2023-06', '2030-12', 'active')).toBe('Jun 2023 — Present');
  });
  it('completed projects show the real end', () => {
    expect(dateRange('2024-03', '2024-11', 'complete')).toBe('Mar 2024 — Nov 2024');
  });
  it('proposed projects show an estimate or "Planned"', () => {
    expect(dateRange('2026-01', '2027-06', 'proposed')).toBe('Jan 2026 — est. Jun 2027');
    expect(dateRange('2026-01', undefined, 'proposed')).toBe('Jan 2026 — Planned');
  });
  it('year-only dates stay as years', () => {
    expect(dateRange('2022', '2023', 'complete')).toBe('2022 — 2023');
  });
});
