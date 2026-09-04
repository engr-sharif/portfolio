/**
 * Contact form — progressive enhancement. AJAX-submits to Web3Forms with an
 * inline status line; when no access key is configured the form falls back to
 * a prefilled mailto:. Configuration comes from data attributes on the form
 * (no inline script → works under the site's strict Content-Security-Policy).
 */
function initContact() {
  const form = document.querySelector<HTMLFormElement>('[data-contact-form]');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';

  const hasForm = form.dataset.hasForm === 'true';
  const email = form.dataset.email || '';
  const statusEl = form.querySelector<HTMLElement>('[data-contact-status]');
  const btn = form.querySelector<HTMLButtonElement>('[data-contact-submit]');

  const setStatus = (msg: string, ok: boolean | null) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle('is-ok', ok === true);
    statusEl.classList.toggle('is-err', ok === false);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);

    // No backend key → fall back to mailto with the message prefilled.
    if (!hasForm) {
      const subj = encodeURIComponent(`Portfolio inquiry from ${data.get('name') || ''}`);
      const body = encodeURIComponent(`${data.get('message') || ''}\n\n— ${data.get('name') || ''} (${data.get('email') || ''})`);
      window.location.href = `mailto:${email}?subject=${subj}&body=${body}`;
      return;
    }

    const original = btn?.textContent ?? '';
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    setStatus('', null);

    try {
      const res = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body: data });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        form.reset();
        setStatus("Thanks — your message is on its way. I'll be in touch soon.", true);
      } else {
        setStatus(json.message || 'Something went wrong. Please email me directly.', false);
      }
    } catch {
      setStatus('Network error. Please email me directly.', false);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = original; }
    }
  });
}

document.addEventListener('astro:page-load', initContact);
