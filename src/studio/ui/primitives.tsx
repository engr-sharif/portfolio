import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type FC, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';

/* ---------------------------------------------------------------- Button */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  loading?: boolean;
  kbd?: string;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant = 'secondary', size = 'md', icon, loading, kbd, className = '', children, disabled, type = 'button', ...rest }, ref) => (
  <button ref={ref} type={type} className={`btn btn--${variant} btn--${size}${className ? ` ${className}` : ''}`} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
    {loading ? <Loader2 className="btn__spin" size={15} aria-hidden /> : icon ? <span className="btn__icon" aria-hidden>{icon}</span> : null}
    {children && <span className="btn__label">{children}</span>}
    {kbd && <Kbd>{kbd}</Kbd>}
  </button>
));
Button.displayName = 'Button';

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(({ label, className = '', ...rest }, ref) => (
  <Button ref={ref} className={`btn--icon ${className}`} aria-label={label} title={label} {...rest} />
));
IconButton.displayName = 'IconButton';

/* ---------------------------------------------------------------- Inputs */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ className = '', invalid, ...rest }, ref) => (
  <input ref={ref} className={`inp${invalid ? ' is-invalid' : ''}${className ? ` ${className}` : ''}`} aria-invalid={invalid || undefined} {...rest} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(({ className = '', invalid, ...rest }, ref) => (
  <textarea ref={ref} className={`inp inp--area${invalid ? ' is-invalid' : ''}${className ? ` ${className}` : ''}`} aria-invalid={invalid || undefined} {...rest} />
));
Textarea.displayName = 'Textarea';

export const Select: FC<SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', children, ...rest }) => (
  <select className={`inp inp--select${className ? ` ${className}` : ''}`} {...rest}>{children}</select>
);

export const Switch: FC<{ checked: boolean; onChange: (v: boolean) => void; id?: string; label?: string; disabled?: boolean }> = ({ checked, onChange, id, label, disabled }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} id={id} disabled={disabled} className={`switch${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}>
    <span className="switch__knob" />
  </button>
);

/* ---------------------------------------------------------------- Display */
export const Kbd: FC<{ children: ReactNode }> = ({ children }) => <kbd className="kbd">{children}</kbd>;

export type Tone = 'neutral' | 'live' | 'draft' | 'danger' | 'info' | 'accent';
export const Pill: FC<{ tone?: Tone; children: ReactNode; className?: string; title?: string; dot?: boolean }> = ({ tone = 'neutral', children, className = '', title, dot }) => (
  <span className={`pill pill--${tone}${className ? ` ${className}` : ''}`} title={title}>{dot && <i className="pill__dot" aria-hidden />}{children}</span>
);

export const Skeleton: FC<{ w?: string | number; h?: string | number; className?: string; radius?: number }> = ({ w = '100%', h = 14, className = '', radius }) => (
  <span className={`skel${className ? ` ${className}` : ''}`} style={{ width: w, height: h, ...(radius != null ? { borderRadius: radius } : {}) }} aria-hidden />
);

export const EmptyState: FC<{ icon?: ReactNode; title: string; hint?: ReactNode; action?: ReactNode }> = ({ icon, title, hint, action }) => (
  <div className="empty">
    {icon && <div className="empty__icon" aria-hidden>{icon}</div>}
    <h3 className="empty__title">{title}</h3>
    {hint && <p className="empty__hint">{hint}</p>}
    {action && <div className="empty__action">{action}</div>}
  </div>
);

export const Callout: FC<{ tone?: 'info' | 'warn' | 'danger' | 'success'; children: ReactNode; onDismiss?: () => void; role?: string }> = ({ tone = 'info', children, onDismiss, role }) => (
  <div className={`callout callout--${tone}`} role={role ?? (tone === 'danger' ? 'alert' : 'status')}>
    <div className="callout__body">{children}</div>
    {onDismiss && <IconButton variant="ghost" size="sm" label="Dismiss" icon={<X size={14} />} onClick={onDismiss} />}
  </div>
);

/* ---------------------------------------------------------------- Dialog */
export const Dialog: FC<{ open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number | string; danger?: boolean }> = ({ open, onClose, title, children, footer, width = 480, danger }) => {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    const first = panel.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])');
    (first || panel.current)?.focus();
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="dlg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} className={`dlg__panel${danger ? ' dlg__panel--danger' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} style={{ maxWidth: width }}>
        <header className="dlg__head">
          <h2 id={id} className="dlg__title">{title}</h2>
          <IconButton data-close variant="ghost" size="sm" label="Close" icon={<X size={16} />} onClick={onClose} />
        </header>
        <div className="dlg__body">{children}</div>
        {footer && <footer className="dlg__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
};

/** Confirm dialog with a typed-in guard for destructive actions. */
export const Confirm: FC<{ open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean }> = ({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', danger, busy }) => (
  <Dialog open={open} onClose={onClose} title={title} danger={danger} width={440}
    footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy} autoFocus>{confirmLabel}</Button></>}>
    <div className="dlg__text">{body}</div>
  </Dialog>
);

/* ------------------------------------------------------------------ Menu */
/** Minimal dropdown: a trigger + items, closed on outside click / Esc. */
export const Menu: FC<{ trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode; items: { label: ReactNode; onSelect: () => void; danger?: boolean; icon?: ReactNode; disabled?: boolean }[]; align?: 'left' | 'right'; open: boolean; setOpen: (o: boolean) => void }> = ({ trigger, items, align = 'right', open, setOpen }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, setOpen]);
  return (
    <div className="menu" ref={ref}>
      {trigger({ onClick: () => setOpen(!open), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open && (
        <div className={`menu__list menu__list--${align}`} role="menu">
          {items.map((it, i) => (
            <button key={i} type="button" role="menuitem" className={`menu__item${it.danger ? ' menu__item--danger' : ''}`} disabled={it.disabled} onClick={() => { setOpen(false); it.onSelect(); }}>
              {it.icon && <span className="menu__icon" aria-hidden>{it.icon}</span>}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const Spinner: FC<{ size?: number }> = ({ size = 16 }) => <Loader2 className="spin" size={size} aria-hidden />;
