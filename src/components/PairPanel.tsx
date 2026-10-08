import { useState } from 'react';
import { newId } from '../model/defaults';
import { supersededBy } from '../model/graph';
import type { Id, Person, Relationship, RelationshipType, Vault } from '../model/types';
import type { Action } from '../state/reducer';
import { Hearts, Toggle } from './ui';

/**
 * The heart of the app: for a pair of people, every relationship type gets
 * its switches. Directional types (crush, friendship…) get two independent
 * ones, A→B and B→A; partner types get a single "together" switch, because a
 * one-way primary partnership isn't a thing.
 */
export default function PairPanel({
  vault,
  dispatch,
  a,
  b,
  onPick,
  onSelectPerson,
  showSpeculative,
  showSuperseded,
}: {
  vault: Vault;
  dispatch: (x: Action) => void;
  a: Id | null;
  b: Id | null;
  onPick: (a: Id | null, b: Id | null) => void;
  onSelectPerson: (id: Id) => void;
  /** When the speculative layer is hidden, only real connections are editable. */
  showSpeculative: boolean;
  showSuperseded: boolean;
}) {
  const [layerChoice, setLayer] = useState<'real' | 'spec'>('real');
  const layer = showSpeculative ? layerChoice : 'real';
  const specCount = (x: Id | null, y: Id | null) =>
    vault.relationships.filter((r) => r.speculative && ((r.from === x && r.to === y) || (r.from === y && r.to === x))).length;
  const pa = vault.people.find((p) => p.id === a) ?? null;
  const pb = vault.people.find((p) => p.id === b) ?? null;
  const outranked = showSuperseded ? new Map<Id, Id>() : supersededBy(pairRels(vault, a, b), vault.types);
  const sorted = [...vault.people].sort((x, y) => Number(y.isMe) - Number(x.isMe) || x.name.localeCompare(y.name));

  const picker = (value: Id | null, other: Id | null, onChange: (id: Id | null) => void) => (
    <select className="pair-select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Choose someone…</option>
      {sorted
        .filter((p) => p.id !== other)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.emoji} {p.name}
            {p.speculative ? ' 🔮' : ''}
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

      {pa && pb && showSpeculative && (
        <div className="layer-switch" role="radiogroup" aria-label="Layer">
          <button role="radio" aria-checked={layer === 'real'} className={layer === 'real' ? 'on' : ''} onClick={() => setLayer('real')}>
            💫 Real
          </button>
          <button role="radio" aria-checked={layer === 'spec'} className={layer === 'spec' ? 'on spec' : ''} onClick={() => setLayer('spec')}>
            🔮 Speculative{specCount(a, b) > 0 && <span className="layer-count">{specCount(a, b)}</span>}
          </button>
        </div>
      )}
      {pa && pb && (pa.speculative || pb.speculative) && (
        <p className="hint layer-hint">
          🔮 {[pa, pb].filter((p) => p.speculative).map((p) => p.name).join(' and ')}{' '}
          {pa.speculative && pb.speculative ? 'are' : 'is'} speculative, so everything between them is too.
        </p>
      )}
      {pa && pb && layer === 'spec' && (
        <p className="hint layer-hint">What-ifs and maybes. These sit alongside the real connections and vanish when the 🔮 layer is off.</p>
      )}

      {pa && pb ? (
        <div className={`type-rows ${layer === 'spec' ? 'spec' : ''}`}>
          {vault.types.map((t) => (
            <TypeRow
              key={t.id}
              type={t}
              a={pa}
              b={pb}
              vault={vault}
              dispatch={dispatch}
              speculative={layer === 'spec'}
              outranked={outranked}
            />
          ))}
        </div>
      ) : (
        <p className="hint center">Pick two people to see and edit everything between them.</p>
      )}
    </div>
  );
}

function pairRels(vault: Vault, a: Id | null, b: Id | null): Relationship[] {
  return vault.relationships.filter((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a));
}

function PersonSlot({ person, children, onClick }: { person: Person | null; children: React.ReactNode; onClick?: () => void }) {
  return (
    <div className="pair-slot">
      <button
        className={`pair-avatar ${person?.speculative ? 'spec' : ''}`}
        style={{ background: person?.color ?? 'var(--line)' }}
        onClick={onClick}
        disabled={!onClick}
      >
        {person?.emoji ?? '?'}
      </button>
      {children}
    </div>
  );
}

function TypeRow({
  type,
  a,
  b,
  vault,
  dispatch,
  speculative,
  outranked,
}: {
  type: RelationshipType;
  a: Person;
  b: Person;
  vault: Vault;
  dispatch: (x: Action) => void;
  speculative: boolean;
  /** Connections a bigger bond hides on the map → the type hiding them. */
  outranked: Map<Id, Id>;
}) {
  const find = (from: Person, to: Person) =>
    vault.relationships.find((r) => r.typeId === type.id && r.from === from.id && r.to === to.id && !!r.speculative === speculative);
  // A shared bond may be stored either way round; treat it as "ab".
  const ab = type.directed ? find(a, b) : (find(a, b) ?? find(b, a));
  const ba = type.directed ? find(b, a) : undefined;
  const [open, setOpen] = useState(false);
  const active = !!(ab || ba);

  const toggle = (from: Person, to: Person, existing: Relationship | undefined, on: boolean) => {
    if (on && !existing) {
      dispatch({
        type: 'addRelationships',
        rels: [
          { id: newId(), from: from.id, to: to.id, typeId: type.id, intensity: 3, notes: '', since: '', createdAt: Date.now(), speculative },
        ],
      });
    } else if (!on && existing) {
      dispatch({ type: 'removeRelationship', id: existing.id });
    }
  };

  // Only worth saying when everything switched on in this row is hidden.
  const live = [ab, ba].filter((r): r is Relationship => !!r);
  const hiderId = live.length && live.every((r) => outranked.has(r.id)) ? outranked.get(live[0].id) : undefined;
  const hider = vault.types.find((t) => t.id === hiderId);
  const one = (from: Person) => (type.arrowVerb ? `${from.name} ${type.arrowVerb}` : `${from.name} → ${from === a ? b.name : a.name}`);

  const status = !type.directed
    ? ab
      ? 'together 💫'
      : ''
    : ab && ba
      ? type.arrowVerb
        ? 'mutual'
        : 'mutual 💫'
      : ab
        ? one(a)
        : ba
          ? one(b)
          : '';

  return (
    <div className={`type-row ${active ? 'active' : ''} emph-${type.emphasis}`} style={{ '--c': type.color } as React.CSSProperties}>
      <div className="type-row-main">
        <span className="type-name">
          <span className="type-emoji">{type.emoji}</span>
          <span>
            {type.label}
            {status && <small>{status}</small>}
            {hider && (
              <small className="type-hidden-by" title="A bigger bond between them draws instead of this on the map">
                🙈 under {hider.emoji} {hider.label}
              </small>
            )}
          </span>
        </span>
        <div className="dir-toggles">
          {type.directed ? (
            <>
              <Toggle checked={!!ab} onChange={(on) => toggle(a, b, ab, on)} color={type.color} label={<DirLabel from={a} to={b} verb={type.arrowVerb} />} />
              <Toggle checked={!!ba} onChange={(on) => toggle(b, a, ba, on)} color={type.color} label={<DirLabel from={b} to={a} verb={type.arrowVerb} />} />
            </>
          ) : (
            <Toggle checked={!!ab} onChange={(on) => toggle(a, b, ab, on)} color={type.color} label={<DirLabel from={a} to={b} both />} />
          )}
        </div>
        {active && (
          <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Details" title="Details">
            {open ? '▴' : '▾'}
          </button>
        )}
      </div>
      {active && open && (
        <div className="type-row-detail">
          {ab && <RelDetail rel={ab} from={a} to={b} both={!type.directed} color={type.color} dispatch={dispatch} />}
          {ba && <RelDetail rel={ba} from={b} to={a} color={type.color} dispatch={dispatch} />}
        </div>
      )}
    </div>
  );
}

function DirLabel({ from, to, both = false, verb }: { from: Person; to: Person; both?: boolean; verb?: string }) {
  const title = both ? `${from.name} & ${to.name}, together` : verb ? `${from.name} ${verb}` : `${from.name} → ${to.name}`;
  return (
    <span className="dir-label" title={title}>
      {from.emoji}
      <i>{both ? '⇄' : '→'}</i>
      {to.emoji}
    </span>
  );
}

function RelDetail({
  rel,
  from,
  to,
  both = false,
  color,
  dispatch,
}: {
  rel: Relationship;
  from: Person;
  to: Person;
  both?: boolean;
  color: string;
  dispatch: (x: Action) => void;
}) {
  const set = (patch: Partial<Relationship>) => dispatch({ type: 'updateRelationship', id: rel.id, patch });
  return (
    <div className="rel-detail">
      <div className="rel-detail-head">
        <b>
          {from.name} {both ? '&' : '→'} {to.name}
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
