/**
 * Contact form — progressive enhancement. With a Web3Forms key it posts in
 * place and reports the result inline; without one it opens the visitor's mail
 * app with the message filled in. The form works as a plain POST with no JS.
 */
export function initContact() {
  document.querySelectorAll<HTMLFormElement>('[data-contact-form]').forEach((form) => {
    const hasKey = form.dataset.hasForm === 'true';
    const email = form.dataset.email || '';
    const status = form.querySelector<HTMLElement>('[data-contact-status]');
    const btn = form.querySelector<HTMLButtonElement>('[type="submit"]');

    const say = (msg: string, tone: 'ok' | 'err' | '') => {
      if (!status) return;
      status.textContent = msg;
      status.dataset.tone = tone;
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      if (!hasKey) {
        const subj = encodeURIComponent(`Portfolio enquiry from ${data.get('name') || ''}`);
        const body = encodeURIComponent(`${data.get('message') || ''}\n\n${data.get('name') || ''} (${data.get('email') || ''})`);
        location.href = `mailto:${email}?subject=${subj}&body=${body}`;
        return;
      }
      const label = btn?.textContent ?? '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      say('', '');
      try {
        const res = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body: data });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success) {
          form.reset();
          say('Sent. I’ll reply by email, usually within two working days.', 'ok');
        } else {
          say(json.message ? `Not sent: ${json.message}. Email me directly instead.` : 'Not sent. Please email me directly instead.', 'err');
        }
      } catch {
        say('Not sent — the connection dropped. Please email me directly instead.', 'err');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = label; }
      }
    });
  });
}
