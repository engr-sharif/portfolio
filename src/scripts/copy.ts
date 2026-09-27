/** <button data-copy="text"> copies its text and says so, briefly. */
export function initCopy() {
  document.addEventListener('click', async (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLButtonElement>('[data-copy]');
    if (!btn) return;
    const label = btn.querySelector('[data-copy-label]') ?? btn;
    const original = label.textContent;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy || '');
      label.textContent = 'Copied';
    } catch {
      label.textContent = 'Select and copy';
    }
    btn.setAttribute('aria-live', 'polite');
    setTimeout(() => { label.textContent = original; }, 1800);
  });
}
