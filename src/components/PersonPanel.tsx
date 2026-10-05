import { useMemo, useState } from 'react';
import { metamours } from '../model/graph';
import { ME_COLOR, newId, PERSON_COLORS, PERSON_EMOJI, pick } from '../model/defaults';
import type { Id, Person, Relationship, Vault } from '../model/types';
import type { Action } from '../state/reducer';
import { ConfirmButton, EmojiPicker, Swatches, Toggle } from './ui';

interface Common {
  vault: Vault;
  dispatch: (a: Action) => void;
}

export function NewPersonForm({ vault, dispatch, onCreated, onCancel }: Common & { onCreated: (id: Id) => void; onCancel: () => void }) {
  const noMe = !vault.people.some((p) => p.isMe);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(() => pick(PERSON_EMOJI));
  const [isMe, setIsMe] = useState(noMe);
  const [color, setColor] = useState(() => (noMe ? ME_COLOR : pick(PERSON_COLORS)));

  function save() {
    if (!name.trim()) return;
    const person: Person = { id: newId(), name: name.trim(), emoji, color, isMe, notes: '' };
    dispatch({ type: 'addPerson', person });
    onCreated(person.id);
  }

  return (
    <form
      className="panel-body"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h3 className="panel-title">{noMe && isMe ? 'Let’s start with you 💛' : 'Add someone ✨'}</h3>
      <div className="person-head">
        <EmojiPicker value={emoji} options={PERSON_EMOJI} onChange={setEmoji} size="lg" />
        <input
          className="name-input"
          autoFocus
          placeholder={isMe ? 'Your name' : 'Their name'}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Swatches value={color} options={[ME_COLOR, ...PERSON_COLORS]} onChange={setColor} />
      <Toggle checked={isMe} onChange={setIsMe} color={ME_COLOR} label="This is me 👑" />
      <div className="row-end">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!name.trim()}>
          Add to the map
        </button>
      </div>
    </form>
  );
}

interface PairSummary {
  other: Person;
  out: Relationship[];
  inc: Relationship[];
}

export function PersonPanel({
  vault,
  dispatch,
  id,
  onOpenPair,
  onFocus,
  focused,
  onClose,
}: Common & {
  id: Id;
  onOpenPair: (a: Id, b: Id) => void;
  onFocus: (id: Id | null, depth?: number) => void;
  focused: boolean;
  onClose: () => void;
}) {
  const person = vault.people.find((p) => p.id === id);
  const typeById = useMemo(() => new Map(vault.types.map((t) => [t.id, t])), [vault.types]);

  const pairs = useMemo<PairSummary[]>(() => {
    const m = new Map<Id, PairSummary>();
    const byId = new Map(vault.people.map((p) => [p.id, p]));
    for (const r of vault.relationships) {
      const otherId = r.from === id ? r.to : r.to === id ? r.from : null;
      if (!otherId || !byId.has(otherId)) continue;
      const s = m.get(otherId) ?? { other: byId.get(otherId)!, out: [], inc: [] };
      (r.from === id ? s.out : s.inc).push(r);
      m.set(otherId, s);
    }
    return [...m.values()].sort((a, b) => Number(b.other.isMe) - Number(a.other.isMe) || a.other.name.localeCompare(b.other.name));
  }, [vault, id]);

  const metas = useMemo(() => metamours(id, vault), [id, vault]);
  const [connectTo, setConnectTo] = useState('');

  if (!person) return null;
  const set = (patch: Partial<Person>) => dispatch({ type: 'updatePerson', id, patch });
  const nameOf = (pid: Id) => vault.people.find((p) => p.id === pid);

  return (
    <div className="panel-body">
      <div className="person-head">
        <EmojiPicker value={person.emoji} options={PERSON_EMOJI} onChange={(emoji) => set({ emoji })} size="lg" />
        <input className="name-input" value={person.name} onChange={(e) => set({ name: e.target.value })} aria-label="Name" />
      </div>
      <Swatches value={person.color} options={[ME_COLOR, ...PERSON_COLORS]} onChange={(color) => set({ color })} />
      <Toggle checked={person.isMe} onChange={(isMe) => set({ isMe })} color={ME_COLOR} label="This is me 👑" />

      <section>
        <h4>Connections</h4>
        {pairs.length === 0 && <p className="hint">No connections yet — add one below!</p>}
        <ul className="conn-list">
          {pairs.map(({ other, out, inc }) => {
            // One chip per type per layer, so speculative bonds read as separate.
            const keys = [...new Set([...out, ...inc].map((r) => `${r.typeId}|${r.speculative ? 1 : 0}`))];
            return (
              <li key={other.id}>
                <button className="conn-row" onClick={() => onOpenPair(id, other.id)}>
                  <span className="conn-who">
                    <span className="mini-emoji" style={{ background: other.color }}>
                      {other.emoji}
                    </span>
                    {other.name}
                  </span>
                  <span className="conn-chips">
                    {keys.map((key) => {
                      const [tid, specFlag] = key.split('|');
                      const spec = specFlag === '1';
                      const t = typeById.get(tid);
                      if (!t) return null;
                      const match = (r: Relationship) => r.typeId === tid && !!r.speculative === spec;
                      const o = out.some(match);
                      const i = inc.some(match);
                      const arrow = o && i ? '⇄' : o ? '→' : '←';
                      const dir = o && i ? `mutual ${t.label}` : o ? `${person.name} → ${other.name}` : `${other.name} → ${person.name}`;
                      return (
                        <span
                          key={key}
                          className={`chip ${spec ? 'chip-spec' : ''}`}
                          style={{ '--c': t.color } as React.CSSProperties}
                          title={spec ? `🔮 speculative: ${dir}` : dir}
                        >
                          {spec && '🔮'}
                          {t.emoji}
                          <b>{arrow}</b>
                        </span>
                      );
                    })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="connect-row">
          <select value={connectTo} onChange={(e) => setConnectTo(e.target.value)} aria-label="Connect with">
            <option value="">Connect with…</option>
            {vault.people
              .filter((p) => p.id !== id)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.name}
                </option>
              ))}
          </select>
          <button className="btn btn-primary" disabled={!connectTo} onClick={() => onOpenPair(id, connectTo)}>
            💞 Go
          </button>
        </div>
        <p className="hint">Tip: with someone selected, shift-click another person on the map to connect them.</p>
      </section>

      {metas.length > 0 && (
        <section>
          <h4>Metamours 🪐</h4>
          <p className="hint">Partners of {person.isMe ? 'your' : `${person.name}’s`} partners.</p>
          <div className="meta-list">
            {metas.map((m) => {
              const p = nameOf(m);
              return p ? (
                <span key={m} className="meta-pill" style={{ background: p.color }}>
                  {p.emoji} {p.name}
                </span>
              ) : null;
            })}
          </div>
        </section>
      )}

      <section>
        <h4>Notes</h4>
        <textarea
          rows={3}
          value={person.notes}
          placeholder="Birthdays, pronouns, inside jokes…"
          onChange={(e) => set({ notes: e.target.value })}
        />
      </section>

      <div className="row-wrap">
        {focused ? (
          <button className="btn" onClick={() => onFocus(null)}>
            🔭 Show everyone
          </button>
        ) : (
          <>
            <button className="btn" onClick={() => onFocus(id, 1)}>
              🔍 Just their circle
            </button>
            <button className="btn" onClick={() => onFocus(id, 2)}>
              🔍 2 hops
            </button>
          </>
        )}
        {person.pin && (
          <button className="btn" onClick={() => set({ pin: undefined })} title="Let them float freely again">
            📌 Unpin
          </button>
        )}
        <ConfirmButton
          onConfirm={() => {
            dispatch({ type: 'removePerson', id });
            onClose();
          }}
          label="Really remove?"
        >
          Remove
        </ConfirmButton>
      </div>
    </div>
  );
}
