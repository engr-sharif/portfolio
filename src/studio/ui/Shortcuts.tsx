import type { FC } from 'react';
import { Dialog, Kbd } from './primitives';

/** "?" anywhere (outside a text field) opens this sheet. */
const ROWS: { keys: string[]; what: string }[][] = [
  [
    { keys: ['⌘', 'K'], what: 'Search, jump anywhere, create anything' },
    { keys: ['⌘', 'S'], what: 'Save the open entry' },
    { keys: ['?'], what: 'This sheet' },
    { keys: ['Esc'], what: 'Close menus, dialogs and drawers' },
  ],
  [
    { keys: ['Space'], what: 'On a drag handle: pick up / drop' },
    { keys: ['↑', '↓'], what: 'While holding: move the row or photo' },
    { keys: ['/'], what: 'In the editor: insert a block' },
    { keys: ['⌘', 'B'], what: 'Bold · ⌘I italic · ⌘E code' },
    { keys: ['⌘', 'Z'], what: 'Undo · ⇧⌘Z redo' },
  ],
];

export const Shortcuts: FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => (
  <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" width={560}>
    <div className="keys">
      {ROWS.map((group, gi) => (
        <dl key={gi} className="keys__group">
          {group.map((r) => (
            <div key={r.what} className="keys__row">
              <dt>{r.keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}</dt>
              <dd>{r.what}</dd>
            </div>
          ))}
        </dl>
      ))}
    </div>
    <p className="sf__hint">On Windows and Linux, ⌘ is Ctrl.</p>
  </Dialog>
);
