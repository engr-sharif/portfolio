import { describe, it, expect } from 'vitest';
import { smartQuotes } from '../src/lib/typography';
import { blogSchema } from '../src/content/schemas';

describe('smartQuotes', () => {
  it('turns keyboard quotes into printer’s quotes', () => {
    expect(smartQuotes(`The 'diff every number' rule`)).toBe('The ‘diff every number’ rule');
    expect(smartQuotes(`Here's the "paragraph-diff" workflow (it's short)`)).toBe('Here’s the “paragraph-diff” workflow (it’s short)');
    expect(smartQuotes(`"Quoted" at the start — 'and' after a dash`)).toBe('“Quoted” at the start — ‘and’ after a dash');
    expect(smartQuotes('no quotes at all')).toBe('no quotes at all');
  });
  it('is applied when content is read, not when it is saved', () => {
    const out = blogSchema.parse({ title: `The 'rule'`, description: `Here's why`, pubDate: '2026-01-01' });
    expect(out.title).toBe('The ‘rule’');
    expect(out.description).toBe('Here’s why');
  });
});
