import { useEffect, useRef, useState, type ReactNode } from 'react';

export function EmojiPicker({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: string;
  options: string[];
  onChange: (e: string) => void;
  size?: 'md' | 'lg';
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="emoji-picker" ref={ref}>
      <button type="button" className={`emoji-btn emoji-${size}`} onClick={() => setOpen((o) => !o)} title="Change emoji">
        {value}
      </button>
      {open && (
        <div className="emoji-pop">
          <div className="emoji-grid">
            {options.map((e) => (
              <button
                type="button"
                key={e}
                className={e === value ? 'on' : ''}
                onClick={() => {
                  onChange(e);
                  setOpen(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
          <input
            className="emoji-custom"
            placeholder="or type/paste any emoji"
            value={custom}
            onChange={(ev) => setCustom(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && custom.trim()) {
                ev.preventDefault();
                onChange([...custom.trim()].slice(0, 2).join(''));
                setCustom('');
                setOpen(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

export function Swatches({ value, options, onChange }: { value: string; options: string[]; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {options.map((c) => (
        <button
          type="button"
          key={c}
          className={`swatch ${c === value ? 'on' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={`colour ${c}`}
        />
      ))}
      <label className="swatch swatch-custom" title="Custom colour">
        🎨
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

export function Hearts({ value, onChange, color }: { value: number; onChange: (n: number) => void; color: string }) {
  return (
    <span className="hearts" role="radiogroup" aria-label="intensity">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          key={n}
          role="radio"
          aria-checked={n === value}
          onClick={() => onChange(n)}
          style={{ color: n <= value ? color : undefined }}
          className={n <= value ? 'on' : ''}
          title={`${n}/5`}
        >
          {n <= value ? '♥' : '♡'}
        </button>
      ))}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  color,
  label,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  color?: string;
  label?: ReactNode;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" style={checked && color ? { background: color } : undefined}>
        <span className="toggle-thumb" />
      </span>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Two-step delete so nothing disappears from a single misclick. */
export function ConfirmButton({ children, onConfirm, label = 'Sure?' }: { children: ReactNode; onConfirm: () => void; label?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={`btn btn-danger ${armed ? 'armed' : ''}`} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? label : children}
    </button>
  );
}
