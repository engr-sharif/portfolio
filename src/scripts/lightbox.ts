/**
 * Figure viewer. Any <button data-lightbox="group" data-src data-caption> opens
 * a native modal <dialog> (focus trap, Esc and focus return for free). The
 * image grows out of its thumbnail (a FLIP animation with the Web Animations
 * API); arrows step through the group; swipe works on touch.
 */
interface Item { src: string; srcset?: string; alt: string; caption: string; no: string; trigger: HTMLElement }

export function initLightbox() {
  const dialog = document.createElement('dialog');
  dialog.className = 'lightbox';
  dialog.setAttribute('aria-label', 'Figure viewer');
  dialog.innerHTML = `
    <div class="lightbox__top">
      <span class="lightbox__count" data-count></span>
      <button class="iconbtn" type="button" data-close aria-label="Close viewer"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m3.5 3.5 9 9m0-9-9 9"/></svg></button>
    </div>
    <div class="lightbox__stage"><img class="lightbox__img" alt="" data-img /></div>
    <div class="lightbox__foot">
      <p class="lightbox__cap" data-cap></p>
      <div class="lightbox__nav">
        <button class="iconbtn" type="button" data-prev aria-label="Previous figure"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg></button>
        <button class="iconbtn" type="button" data-next aria-label="Next figure"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg></button>
      </div>
    </div>`;
  document.body.append(dialog);
  const img = dialog.querySelector<HTMLImageElement>('[data-img]')!;
  const cap = dialog.querySelector<HTMLElement>('[data-cap]')!;
  const count = dialog.querySelector<HTMLElement>('[data-count]')!;
  const prev = dialog.querySelector<HTMLButtonElement>('[data-prev]')!;
  const next = dialog.querySelector<HTMLButtonElement>('[data-next]')!;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  let items: Item[] = [];
  let at = 0;

  const show = (i: number) => {
    at = (i + items.length) % items.length;
    const it = items[at];
    img.src = it.src;
    if (it.srcset) { img.srcset = it.srcset; img.sizes = '100vw'; } else img.removeAttribute('srcset');
    img.alt = it.alt;
    cap.textContent = it.caption;
    count.textContent = `${it.no}  ·  ${at + 1} of ${items.length}`;
    const multi = items.length > 1;
    prev.hidden = next.hidden = !multi;
  };

  const flipFrom = (from: HTMLElement) => {
    if (reduced()) return;
    const thumb = from.querySelector('img') ?? from;
    const a = thumb.getBoundingClientRect();
    const run = () => {
      const b = img.getBoundingClientRect();
      if (!b.width || !a.width) return;
      const sx = a.width / b.width, sy = a.height / b.height;
      const s = Math.max(sx, sy);
      img.animate(
        [
          { transform: `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${s})`, opacity: 0.4 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 520, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
    };
    if (img.complete && img.naturalWidth) requestAnimationFrame(run); else img.addEventListener('load', () => requestAnimationFrame(run), { once: true });
  };

  const open = (trigger: HTMLElement) => {
    const group = trigger.dataset.lightbox || 'default';
    const triggers = [...document.querySelectorAll<HTMLElement>(`[data-lightbox="${CSS.escape(group)}"]`)];
    items = triggers.map((t) => ({
      src: t.dataset.src!,
      srcset: t.dataset.srcset,
      alt: t.querySelector('img')?.alt ?? '',
      caption: t.dataset.caption ?? '',
      no: t.dataset.no ?? '',
      trigger: t,
    }));
    show(triggers.indexOf(trigger));
    dialog.showModal();
    flipFrom(trigger);
  };

  dialog.addEventListener('close', () => { items[at]?.trigger.focus(); img.removeAttribute('src'); });
  dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
  prev.addEventListener('click', () => show(at - 1));
  next.addEventListener('click', () => show(at + 1));
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(at - 1);
    else if (e.key === 'ArrowRight') show(at + 1);
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog || (e.target as Element).classList.contains('lightbox__stage')) dialog.close(); });
  let x0: number | null = null;
  dialog.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  dialog.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 48) show(at + (dx < 0 ? 1 : -1));
    x0 = null;
  });

  document.addEventListener('click', (e) => {
    const t = (e.target as Element | null)?.closest<HTMLElement>('[data-lightbox]');
    if (!t) return;
    e.preventDefault();
    open(t);
  });
}
