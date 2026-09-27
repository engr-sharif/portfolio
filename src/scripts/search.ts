/**
 * Site search — a small command palette over /search.json (projects, tools,
 * notes, pages), fetched the first time it opens. "/" or ⌘K / Ctrl-K opens it
 * from anywhere; ↑↓ move, ↵ opens, Esc closes (native <dialog>).
 */
interface Entry { t: string; d: string; k: string; u: string; s: string }

let index: Entry[] | null = null;
let loading: Promise<Entry[]> | null = null;

function load(url: string) {
  if (index) return Promise.resolve(index);
  loading ??= fetch(url).then((r) => r.json()).then((d: Entry[]) => (index = d)).catch(() => (index = []));
  return loading;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function score(e: Entry, terms: string[]): number {
  const t = norm(e.t), d = norm(e.d), s = norm(e.s);
  let total = 0;
  for (const term of terms) {
    let best = 0;
    if (t.startsWith(term)) best = 12;
    else if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) best = 9;
    else if (t.includes(term)) best = 6;
    else if (d.includes(term)) best = 3;
    else if (s.includes(term)) best = 1;
    if (!best) return 0;
    total += best;
  }
  return total;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function initSearch() {
  const dialog = document.querySelector<HTMLDialogElement>('[data-search]');
  const input = dialog?.querySelector<HTMLInputElement>('[data-search-input]');
  const list = dialog?.querySelector<HTMLUListElement>('[data-search-list]');
  if (!dialog || !input || !list) return;
  const url = dialog.dataset.index!;
  let results: Entry[] = [];
  let sel = 0;
  let lastFocus: HTMLElement | null = null;

  const render = () => {
    const q = norm(input.value.trim());
    const all = index ?? [];
    if (!q) results = all.filter((e) => e.k !== 'Page').slice(0, 8);
    else {
      const terms = q.split(/\s+/).filter(Boolean);
      results = all.map((e) => ({ e, s: score(e, terms) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 12).map((x) => x.e);
    }
    sel = Math.min(sel, Math.max(0, results.length - 1));
    if (!results.length) {
      list.innerHTML = `<li class="search__empty">${index ? `Nothing matches “${esc(input.value.trim())}”.` : 'Loading…'}</li>`;
      input.removeAttribute('aria-activedescendant');
      return;
    }
    list.innerHTML = results.map((e, i) =>
      `<li class="search__item" role="presentation"><a id="sr-${i}" role="option" href="${esc(e.u)}" aria-selected="${i === sel}"><span class="t">${esc(e.t)}</span><span class="k">${esc(e.k)}</span>${e.d ? `<span class="d">${esc(e.d)}</span>` : ''}</a></li>`,
    ).join('');
    input.setAttribute('aria-activedescendant', `sr-${sel}`);
  };

  const move = (by: number) => {
    if (!results.length) return;
    sel = (sel + by + results.length) % results.length;
    list.querySelectorAll('[role="option"]').forEach((a, i) => a.setAttribute('aria-selected', String(i === sel)));
    input.setAttribute('aria-activedescendant', `sr-${sel}`);
    list.querySelector(`#sr-${sel}`)?.scrollIntoView({ block: 'nearest' });
  };

  const open = () => {
    if (dialog.open) return;
    lastFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    input.value = '';
    sel = 0;
    render();
    load(url).then(render);
  };

  dialog.addEventListener('close', () => lastFocus?.focus?.());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.querySelector('[data-search-close]')?.addEventListener('click', () => dialog.close());
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' && results[sel]) { e.preventDefault(); location.href = results[sel].u; }
  });

  document.querySelectorAll('[data-search-open]').forEach((b) => b.addEventListener('click', open));
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    const typing = target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
      e.preventDefault();
      open();
    }
  });
}
