import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EmojiGroup } from '../model/emoji';

export function EmojiPicker({
  value,
  groups,
  onChange,
  size = 'md',
}: {
  value: string;
  groups: EmojiGroup[];
  onChange: (e: string) => void;
  size?: 'md' | 'lg';
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  // Open on the tab that holds the current emoji, if any.
  const [tab, setTab] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const toggle = () => {
    if (!open) setTab(Math.max(0, groups.findIndex((g) => g.emoji.includes(value))));
    setOpen((o) => !o);
  };
  const pickOne = (e: string) => {
    onChange(e);
    setOpen(false);
  };
  const group = groups[tab] ?? groups[0];
  return (
    <div className="emoji-picker" ref={ref}>
      <button type="button" className={`emoji-btn emoji-${size}`} onClick={toggle} title="Change emoji">
        {value}
      </button>
      {open && (
        <div className="emoji-pop">
          <div className="emoji-tabs" role="tablist">
            {groups.map((g, i) => (
              <button
                type="button"
                key={g.label}
                role="tab"
                aria-selected={i === tab}
                className={i === tab ? 'on' : ''}
                onClick={() => setTab(i)}
                title={g.label}
              >
                {g.icon}
              </button>
            ))}
          </div>
          <div className="emoji-group-label">{group.label}</div>
          <div className="emoji-grid" role="tabpanel">
            {group.emoji.map((e) => (
              <button type="button" key={e} className={e === value ? 'on' : ''} onClick={() => pickOne(e)}>
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
                // Keep the first grapheme so ZWJ sequences (🏳️‍🌈, 🧑‍🚀) survive intact.
                const first = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(custom.trim())][0]?.segment;
                if (first) pickOne(first);
                setCustom('');
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
