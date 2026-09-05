import { useState, type FC } from 'react';
import { KeyRound, FlaskConical } from 'lucide-react';
import { login, isMock, setMock } from '../../api';
import { MOCK_PASSWORD } from '../../app/mock';
import { Button, Input } from '../../ui/primitives';

/**
 * Sign-in card. Also shown as an overlay when a session expires mid-edit so
 * the editor (and its unsaved work) stays mounted underneath.
 */
export const Login: FC<{ onAuthed: () => void; overlay?: boolean; onCancel?: () => void }> = ({ onAuthed, overlay, onCancel }) => {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const mock = isMock();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw) return;
    setBusy(true); setErr('');
    try { await login(pw); onAuthed(); }
    catch (e: any) { setErr(e?.message || 'Sign-in failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className={`st-login${overlay ? ' st-login--overlay' : ''}`}>
      <form className="st-login__card" onSubmit={submit}>
        <div className="st-login__brand"><span className="brand__mark" aria-hidden>◆</span> Studio</div>
        <p className="st-login__sub">{overlay ? 'Your session expired. Sign in again — your unsaved work is still here.' : 'Sign in to edit the site. Saves are commits; the site rebuilds in about two minutes.'}</p>
        <label className="sf__label" htmlFor="pw">Password</label>
        <Input id="pw" type="password" className="st-login__input" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" invalid={!!err} />
        {err && <p className="st-login__err" role="alert">{err}</p>}
        <Button type="submit" variant="primary" className="st-login__btn" loading={busy} icon={<KeyRound size={15} />}>Sign in</Button>
        {overlay && onCancel && <Button variant="ghost" className="st-login__btn" onClick={onCancel}>Sign out instead</Button>}
        {mock ? (
          <p className="st-login__mock"><FlaskConical size={13} aria-hidden /> Demo mode is on — the password is <code>{MOCK_PASSWORD}</code>. <button type="button" className="link" onClick={() => { setMock(false); location.reload(); }}>Use the real site</button></p>
        ) : (
          <p className="st-login__mock"><button type="button" className="link" onClick={() => { setMock(true); location.reload(); }}>Try a demo</button> with an in-memory copy of the site — nothing gets published.</p>
        )}
      </form>
    </div>
  );
};
