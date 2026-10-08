import type { ReactNode } from 'react';
import { pairKey, type GraphNode } from '../model/graph';
import type { Id, Person } from '../model/types';
import { LENSES, nightColor, nightName, TEAM, type LensId, type LensResult, type LensScope } from './lenses';

const POLYGONS: Record<number, string> = { 3: 'triangle', 5: 'pentagon', 7: 'heptagon', 9: 'nonagon', 11: 'hendecagon' };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function GraphTheoryPanel({
  onClose,
  lens,
  onLensChange,
  scope,
  onScopeChange,
  result,
  nodes,
  onSelectPerson,
  onSelectPair,
}: {
  onClose: () => void;
  lens: LensId | null;
  onLensChange: (lens: LensId | null) => void;
  scope: LensScope;
  onScopeChange: (scope: LensScope) => void;
  result: LensResult | null;
  nodes: GraphNode[];
  onSelectPerson: (id: Id) => void;
  onSelectPair: (a: Id, b: Id) => void;
}) {
  const people = new Map<Id, Person>(nodes.map((n) => [n.id, n.person]));
  const bond = scope === 'partners' ? 'partner bond' : 'connection';
  // Plain render helpers (not components) so rows aren't remounted every render.
  const who = (id: Id) => {
    const p = people.get(id);
    return (
      <button key={id} className="who" onClick={() => onSelectPerson(id)} title="Show this person">
        <span className="mini-emoji" style={{ background: p?.color }}>
          {p?.emoji ?? '?'}
        </span>
        {p?.name || <i>unnamed</i>}
      </button>
    );
  };
  const pairRow = (a: Id, b: Id, extra?: ReactNode) => (
    <li key={pairKey(a, b)} className="lens-row">
      {who(a)}
      <button className="linklike pair-link" onClick={() => onSelectPair(a, b)} title="Open this pair">
        &amp;
      </button>
      {who(b)}
      {extra && <span className="lens-row-extra">{extra}</span>}
    </li>
  );
  const name = (id: Id | null) => (id ? people.get(id)?.name || 'someone' : 'someone');

  const body = (): ReactNode => {
    if (!result) return null;
    if (result.kind === 'empty')
      return (
        <p className="hint">
          No {bond}s on the map right now. {scope === 'partners' && 'Try “every connection” above, or add some partners.'}
        </p>
      );
    const approx = (exact: boolean) =>
      !exact && <p className="lens-approx">≈ This polycule is big enough that this is a quick best guess, not a proven optimum.</p>;

    switch (result.kind) {
      case 'valentine': {
        const { m } = result;
        return (
          <>
            <p className="lens-headline">
              {m.perfect
                ? '💯 Everyone gets a date!'
                : `💌 ${plural(m.pairs.length, 'date')} · 🕯️ ${m.unmatched.length} dining alone`}
            </p>
            <p className="lens-explain">
              A <b>maximum matching</b>: as many one-on-one dates on the same night as possible, then the most ♥ among those.{' '}
              {m.perfect
                ? 'It’s a perfect matching: nobody’s left out.'
                : 'No arrangement does better, so somebody has to sit this one out.'}
            </p>
            {approx(m.exact)}
            <ul className="lens-list">
              {m.pairs.map(([a, b]) => (
                pairRow(a, b, <>♥{result.g.adj.get(a)!.get(b)}</>)
              ))}
              {m.unmatched.map((id) => (
                <li key={id} className="lens-row">
                  🕯️ {who(id)} <span className="lens-row-extra">table for one</span>
                </li>
              ))}
            </ul>
          </>
        );
      }
      case 'nights': {
        const { c } = result;
        const byNight = Array.from({ length: c.nights }, () => [] as [Id, Id][]);
        for (const [k, i] of c.night) byNight[i].push(k.split('|') as [Id, Id]);
        const class1 = c.nights === c.maxDegree;
        return (
          <>
            <p className="lens-headline">
              📅 {plural(c.nights, 'night')} a week, zero double-bookings
            </p>
            <p className="lens-explain">
              Every pair gets a regular night and nobody has two dates at once. The busiest person ({name(c.busiest)},{' '}
              {plural(c.maxDegree, bond)}) needs {c.maxDegree} nights no matter what.{' '}
              {class1 ? (
                <>
                  <b>Class 1</b>: that’s all it takes. Beautifully efficient.
                </>
              ) : (
                <>
                  <b>Class 2</b>: it takes one more. Vizing’s theorem says that’s the worst it can ever get, so: one night of pure
                  chaos.
                </>
              )}
              {c.nights > 7 && ' That’s more than a week. Respect.'}
            </p>
            {!c.exact && !class1 && (
              <p className="lens-approx">≈ Couldn’t rule out {c.maxDegree} nights in time, so this may be one night too many.</p>
            )}
            <ul className="lens-list">
              {byNight.map((pairs, i) => (
                <li key={i} className="night-group">
                  <span className="night-chip" style={{ '--c': nightColor(i) } as React.CSSProperties}>
                    {nightName(i)}
                  </span>
                  <ul className="lens-list">
                    {pairs.map(([a, b]) => (
                      pairRow(a, b)
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        );
      }
      case 'triangle': {
        const { b } = result;
        if (b.bipartite) {
          const team = (s: 0 | 1) => [...b.side].filter(([, x]) => x === s).map(([id]) => id);
          return (
            <>
              <p className="lens-headline">⚖️ Perfectly two-sided</p>
              <p className="lens-explain">
                The {bond}s are <b>bipartite</b>: every one runs between Team 🩷 and Team 💙, with no odd loops. The practical
                upshot: you could split into two houses and nobody would share a roof with a {scope === 'partners' ? 'partner' : 'connection'}.
              </p>
              {([0, 1] as const).map((s) => (
                <div key={s} className="team" style={{ '--c': TEAM[s] } as React.CSSProperties}>
                  <span className="team-name">{s === 0 ? 'Team 🩷' : 'Team 💙'}</span>
                  <div className="team-members">
                    {team(s).map((id) => (
                      who(id)
                    ))}
                  </div>
                </div>
              ))}
            </>
          );
        }
        const cyc = b.oddCycle!;
        const shape = POLYGONS[cyc.length] ?? `${cyc.length}-gon`;
        return (
          <>
            <p className="lens-headline">🔺 Love {shape} found!</p>
            <p className="lens-explain">
              There’s no way to split everyone into two sides with every {bond} crossing between them: an <b>odd cycle</b> always
              spoils it. Here’s the smallest one, glowing on the map:
            </p>
            <ol className="lens-list cycle">
              {cyc.map((id, i) => (
                <li key={id} className="lens-row">
                  {who(id)}
                  <button className="linklike pair-link" onClick={() => onSelectPair(id, cyc[(i + 1) % cyc.length])} title="Open this pair">
                    ↻
                  </button>
                </li>
              ))}
            </ol>
          </>
        );
      }
      case 'hinge': {
        const { f } = result;
        if (!f.bridges.length && !f.hinges.length)
          return (
            <>
              <p className="lens-headline">🛡️ No single point of failure</p>
              <p className="lens-explain">
                Every {bond} sits on a loop, so no one breakup and no one person stepping away can split a polycule in two.
                Structurally sound!
              </p>
            </>
          );
        return (
          <>
            <p className="lens-headline">
              🧱 {plural(f.bridges.length, `load-bearing ${bond}`)} · {plural(f.hinges.length, 'hinge person', 'hinge people')}
            </p>
            <p className="lens-explain">
              A <b>bridge</b> is a {bond} that isn’t part of any loop: if it ends, the polycule splits. A <b>hinge</b> (articulation
              point) is someone whose absence would do the same.
            </p>
            {f.bridges.length > 0 && (
              <ul className="lens-list">
                {f.bridges.map(({ a, b, sizes }) => (
                  pairRow(a, b, <>⚠️ {sizes[0]} + {sizes[1]}</>)
                ))}
              </ul>
            )}
            {f.hinges.length > 0 && (
              <ul className="lens-list">
                {f.hinges.map(({ id, pieces }) => (
                  <li key={id} className="lens-row">
                    🧱 {who(id)} <span className="lens-row-extra">holds {pieces} groups together</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      }
    }
  };

  return (
    <aside className="theory-panel" aria-label="Graph Theory">
      <div className="theory-head">
        <h3 className="panel-title">Graph Theory ✨</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close Graph Theory">
          ✕
        </button>
      </div>
      <p className="hint">Classic graph problems, applied to your polycule. Pick one to see it on the map. Nothing is saved.</p>
      <div className="theory-scope" role="radiogroup" aria-label="Which lines count">
        {(
          [
            ['partners', '💞 Partner bonds'],
            ['everyone', '🕸️ Every connection'],
          ] as const
        ).map(([s, label]) => (
          <button key={s} role="radio" aria-checked={scope === s} className={scope === s ? 'on' : ''} onClick={() => onScopeChange(s)}>
            {label}
          </button>
        ))}
      </div>
      {LENSES.map((l) => {
        const on = lens === l.id;
        return (
          <section key={l.id} className={`lens-card ${on ? 'on' : ''}`}>
            <button className="lens-head" onClick={() => onLensChange(on ? null : l.id)} aria-expanded={on}>
              <span className="lens-emoji">{l.emoji}</span>
              <span className="lens-title">
                <b>{l.title}</b>
                <small>{l.problem}</small>
              </span>
              <span className="lens-caret">{on ? '▾' : '▸'}</span>
            </button>
            {on && <div className="lens-body">{body()}</div>}
          </section>
        );
      })}
    </aside>
  );
}
