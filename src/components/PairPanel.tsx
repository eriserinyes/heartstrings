import { useState } from 'react';
import { newId } from '../model/defaults';
import type { Id, Person, Relationship, RelationshipType, Vault } from '../model/types';
import type { Action } from '../state/reducer';
import { Hearts, Toggle } from './ui';

/**
 * The heart of the app: for a pair of people, every relationship type gets
 * two independent switches — A→B and B→A. A crush can be one-way, a
 * friendship mutual, and a play-partnership can sit alongside either.
 */
export default function PairPanel({
  vault,
  dispatch,
  a,
  b,
  onPick,
  onSelectPerson,
}: {
  vault: Vault;
  dispatch: (x: Action) => void;
  a: Id | null;
  b: Id | null;
  onPick: (a: Id | null, b: Id | null) => void;
  onSelectPerson: (id: Id) => void;
}) {
  const pa = vault.people.find((p) => p.id === a) ?? null;
  const pb = vault.people.find((p) => p.id === b) ?? null;
  const sorted = [...vault.people].sort((x, y) => Number(y.isMe) - Number(x.isMe) || x.name.localeCompare(y.name));

  const picker = (value: Id | null, other: Id | null, onChange: (id: Id | null) => void) => (
    <select className="pair-select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Choose someone…</option>
      {sorted
        .filter((p) => p.id !== other)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.emoji} {p.name}
          </option>
        ))}
    </select>
  );

  return (
    <div className="panel-body">
      <div className="pair-head">
        <PersonSlot person={pa} onClick={pa ? () => onSelectPerson(pa.id) : undefined}>
          {picker(a, b, (id) => onPick(id, b))}
        </PersonSlot>
        <button className="icon-btn swap" title="Swap sides" onClick={() => onPick(b, a)} disabled={!a || !b}>
          ⇄
        </button>
        <PersonSlot person={pb} onClick={pb ? () => onSelectPerson(pb.id) : undefined}>
          {picker(b, a, (id) => onPick(a, id))}
        </PersonSlot>
      </div>

      {pa && pb ? (
        <div className="type-rows">
          {vault.types.map((t) => (
            <TypeRow key={t.id} type={t} a={pa} b={pb} vault={vault} dispatch={dispatch} />
          ))}
        </div>
      ) : (
        <p className="hint center">Pick two people to see and edit everything between them.</p>
      )}
    </div>
  );
}

function PersonSlot({ person, children, onClick }: { person: Person | null; children: React.ReactNode; onClick?: () => void }) {
  return (
    <div className="pair-slot">
      <button className="pair-avatar" style={{ background: person?.color ?? 'var(--line)' }} onClick={onClick} disabled={!onClick}>
        {person?.emoji ?? '?'}
      </button>
      {children}
    </div>
  );
}

function TypeRow({ type, a, b, vault, dispatch }: { type: RelationshipType; a: Person; b: Person; vault: Vault; dispatch: (x: Action) => void }) {
  const ab = vault.relationships.find((r) => r.typeId === type.id && r.from === a.id && r.to === b.id);
  const ba = vault.relationships.find((r) => r.typeId === type.id && r.from === b.id && r.to === a.id);
  const [open, setOpen] = useState(false);
  const active = !!(ab || ba);

  const toggle = (from: Person, to: Person, existing: Relationship | undefined, on: boolean) => {
    if (on && !existing) {
      dispatch({
        type: 'addRelationships',
        rels: [{ id: newId(), from: from.id, to: to.id, typeId: type.id, intensity: 3, notes: '', since: '', createdAt: Date.now() }],
      });
    } else if (!on && existing) {
      dispatch({ type: 'removeRelationship', id: existing.id });
    }
  };

  const status = ab && ba ? 'mutual 💫' : ab ? `${a.name} → ${b.name}` : ba ? `${b.name} → ${a.name}` : '';

  return (
    <div className={`type-row ${active ? 'active' : ''}`} style={{ '--c': type.color } as React.CSSProperties}>
      <div className="type-row-main">
        <span className="type-name">
          <span className="type-emoji">{type.emoji}</span>
          <span>
            {type.label}
            {status && <small>{status}</small>}
          </span>
        </span>
        <div className="dir-toggles">
          <Toggle checked={!!ab} onChange={(on) => toggle(a, b, ab, on)} color={type.color} label={<DirLabel from={a} to={b} />} />
          <Toggle checked={!!ba} onChange={(on) => toggle(b, a, ba, on)} color={type.color} label={<DirLabel from={b} to={a} />} />
        </div>
        {active && (
          <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Details" title="Details">
            {open ? '▴' : '▾'}
          </button>
        )}
      </div>
      {active && open && (
        <div className="type-row-detail">
          {ab && <RelDetail rel={ab} from={a} to={b} color={type.color} dispatch={dispatch} />}
          {ba && <RelDetail rel={ba} from={b} to={a} color={type.color} dispatch={dispatch} />}
        </div>
      )}
    </div>
  );
}

function DirLabel({ from, to }: { from: Person; to: Person }) {
  return (
    <span className="dir-label" title={`${from.name} → ${to.name}`}>
      {from.emoji}
      <i>→</i>
      {to.emoji}
    </span>
  );
}

function RelDetail({ rel, from, to, color, dispatch }: { rel: Relationship; from: Person; to: Person; color: string; dispatch: (x: Action) => void }) {
  const set = (patch: Partial<Relationship>) => dispatch({ type: 'updateRelationship', id: rel.id, patch });
  return (
    <div className="rel-detail">
      <div className="rel-detail-head">
        <b>
          {from.name} → {to.name}
        </b>
        <Hearts value={rel.intensity} onChange={(intensity) => set({ intensity })} color={color} />
      </div>
      <div className="rel-detail-fields">
        <label>
          since
          <input type="date" value={rel.since} onChange={(e) => set({ since: e.target.value })} />
        </label>
        <input placeholder="a little note…" value={rel.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>
    </div>
  );
}
