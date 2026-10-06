import { useCallback, useEffect, useMemo, useState } from 'react';
import GraphView from './components/graph/GraphView';
import { endId } from './components/graph/shared';
import LockScreen from './components/LockScreen';
import PairPanel from './components/PairPanel';
import { NewPersonForm, PersonPanel } from './components/PersonPanel';
import SettingsModal from './components/SettingsModal';
import { Toggle } from './components/ui';
import { buildGraph, visibleVault, type GraphLink, type GraphNode } from './model/graph';
import type { Id } from './model/types';
import { usePrefs, type Prefs } from './state/usePrefs';
import { useVault, type VaultApi } from './state/useVault';

export default function App() {
  const api = useVault();
  if (api.status !== 'unlocked') return <LockScreen api={api} />;
  return <Workspace api={api} />;
}

type Selection =
  | { kind: 'person'; id: Id }
  | { kind: 'pair'; a: Id | null; b: Id | null }
  | { kind: 'new-person' }
  | null;

function useDarkMode() {
  const q = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => window.matchMedia?.(q).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setDark(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return dark;
}

function useAutoLock(minutes: number, lock: () => void) {
  useEffect(() => {
    if (!minutes) return;
    let t = setTimeout(lock, minutes * 60_000);
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(lock, minutes * 60_000);
    };
    const evs = ['pointerdown', 'keydown', 'wheel', 'pointermove'] as const;
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes, lock]);
}

function Workspace({ api }: { api: VaultApi }) {
  const { vault, dispatch } = api;
  const [prefs, setPrefs] = usePrefs();
  const [sel, setSel] = useState<Selection>(null);
  const [focus, setFocus] = useState<{ id: Id; depth: number } | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [untangleSignal, setUntangleSignal] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  const onUntangled = useCallback(
    (before: number, after: number) =>
      setToast(
        after === before
          ? '✂️ Tidied lines away from people'
          : after === 0
            ? `✂️ Untangled: ${before} crossing${before === 1 ? '' : 's'} → none!`
            : `✂️ Untangled: ${before} → ${after} crossings`,
      ),
    [],
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dark = useDarkMode();

  useAutoLock(prefs.autoLockMinutes, api.lock);

  // On phones the people drawer overlays the map, so start closed and get
  // out of the way once someone is picked.
  const narrow = () => window.matchMedia('(max-width: 820px)').matches;
  useEffect(() => {
    if (narrow()) setPrefs({ peopleOpen: false });
  }, [setPrefs]);
  const select = useCallback(
    (s: Selection) => {
      setSel(s);
      if (s && narrow()) setPrefs({ peopleOpen: false });
    },
    [setPrefs],
  );

  // Everything that *reads* goes through `shown`; writes still use the full vault.
  const shown = useMemo(() => visibleVault(vault, prefs.showSpeculative), [vault, prefs.showSpeculative]);
  // How much the hidden layer holds (shown on the 🔮 pill as a reminder).
  const specCount = useMemo(
    () => vault.relationships.filter((r) => r.speculative).length + vault.people.filter((p) => p.speculative).length,
    [vault],
  );
  const hiddenTypes = useMemo(() => new Set(prefs.hiddenTypes), [prefs.hiddenTypes]);
  const graph = useMemo(
    () =>
      buildGraph(shown, {
        hiddenTypes,
        mergeMutual: prefs.mergeMutual,
        focusId: focus?.id ?? null,
        focusDepth: focus?.depth ?? 1,
      }),
    [shown, hiddenTypes, prefs.mergeMutual, focus],
  );

  // Drop a selection whose person was deleted (incl. via undo) or just hidden with the 🔮 layer.
  useEffect(() => {
    if (sel?.kind === 'person' && !shown.people.some((p) => p.id === sel.id)) setSel(null);
    if (sel?.kind === 'pair' && [sel.a, sel.b].some((id) => id && !shown.people.some((p) => p.id === id))) setSel(null);
    if (focus && !shown.people.some((p) => p.id === focus.id)) setFocus(null);
  }, [shown.people, sel, focus]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        api.undo();
      } else if (e.key === 'Escape' && !settingsOpen) {
        setSel(null);
      } else if (!typing && e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
        setSel({ kind: 'new-person' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [api, settingsOpen]);

  const onNodeClick = useCallback(
    (n: GraphNode, shift: boolean) => {
      if (shift && sel?.kind === 'person' && sel.id !== n.id) setSel({ kind: 'pair', a: sel.id, b: n.id });
      else setSel({ kind: 'person', id: n.id });
    },
    [sel],
  );
  const onLinkClick = useCallback((l: GraphLink) => setSel({ kind: 'pair', a: endId(l.source), b: endId(l.target) }), []);
  const onBackgroundClick = useCallback(() => setSel(null), []);
  const onNodeDragEnd = useCallback(
    (n: GraphNode) => {
      const pin = { x: n.x ?? 0, y: n.y ?? 0, ...(n.z !== undefined ? { z: n.z } : {}) };
      dispatch({ type: 'pinAll', pins: { [n.id]: pin } });
    },
    [dispatch],
  );

  const selectedId = sel?.kind === 'person' ? sel.id : null;
  const selectedPair: [Id, Id] | null = sel?.kind === 'pair' && sel.a && sel.b ? [sel.a, sel.b] : null;
  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...shown.people]
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
  }, [shown.people, query]);
  const degree = useMemo(() => {
    const m = new Map<Id, number>();
    for (const r of shown.relationships) {
      m.set(r.from, (m.get(r.from) ?? 0) + 1);
      m.set(r.to, (m.get(r.to) ?? 0) + 1);
    }
    return m;
  }, [shown.relationships]);

  const focusPerson = focus ? shown.people.find((p) => p.id === focus.id) : null;
  const empty = shown.people.length === 0;

  return (
    <div className={`app ${prefs.peopleOpen ? 'people-open' : ''} ${sel ? 'inspector-open' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <button className="icon-btn people-toggle" onClick={() => setPrefs({ peopleOpen: !prefs.peopleOpen })} title="People list">
            ☰
          </button>
          <span className="brand-heart">💗</span>
          <span className="brand-name">Heartstrings</span>
        </div>

        <div className="dim-toggle" role="radiogroup" aria-label="View mode">
          <button role="radio" aria-checked={prefs.mode === '2d'} className={prefs.mode === '2d' ? 'on' : ''} onClick={() => setPrefs({ mode: '2d' })}>
            ☀️ 2D
          </button>
          <button role="radio" aria-checked={prefs.mode === '3d'} className={prefs.mode === '3d' ? 'on' : ''} onClick={() => setPrefs({ mode: '3d' })}>
            🌌 3D
          </button>
          <span className={`dim-pill pill-${prefs.mode}`} />
        </div>

        <div className="top-actions">
          <button
            className={`spec-toggle ${prefs.showSpeculative ? 'on' : ''}`}
            onClick={() => setPrefs({ showSpeculative: !prefs.showSpeculative })}
            aria-pressed={prefs.showSpeculative}
            title={prefs.showSpeculative ? 'Hide the speculative layer' : 'Show the speculative layer'}
          >
            🔮<span className="hide-sm"> {prefs.showSpeculative ? 'Speculative on' : 'Speculative off'}</span>
            {!prefs.showSpeculative && specCount > 0 && <span className="spec-badge">{specCount}</span>}
          </button>
          <span className={`save-dot ${api.saveState}`} title={api.saveState === 'saved' ? 'Encrypted & saved' : api.saveState === 'saving' ? 'Saving…' : 'Save failed!'}>
            {api.saveState === 'saved' ? '🔐' : api.saveState === 'saving' ? '⏳' : '⚠️'}
          </span>
          <button className="icon-btn" onClick={api.undo} disabled={!api.canUndo} title="Undo (Ctrl+Z)">
            ↶
          </button>
          <button className="icon-btn" onClick={() => setFitSignal((s) => s + 1)} title="Fit everyone on screen">
            ⤢
          </button>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
            ⚙️
          </button>
          <button className="btn btn-lock" onClick={api.lock} title="Lock now">
            🔒<span className="hide-sm"> Lock</span>
          </button>
        </div>
      </header>

      <aside className="people">
        <div className="people-actions">
          <button className="btn btn-primary" onClick={() => select({ kind: 'new-person' })}>
            ＋ Person
          </button>
          <button className="btn" onClick={() => select({ kind: 'pair', a: vault.people.find((p) => p.isMe)?.id ?? null, b: null })} disabled={shown.people.length < 2}>
            💞 Connect
          </button>
        </div>
        <input className="search" placeholder="🔎 find someone" value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul className="people-list">
          {filteredPeople.map((p) => (
            <li key={p.id}>
              <button className={`person-row ${selectedId === p.id ? 'on' : ''}`} onClick={() => select({ kind: 'person', id: p.id })}>
                <span className="mini-emoji" style={{ background: p.color }}>
                  {p.emoji}
                </span>
                <span className={`person-name ${p.speculative ? 'spec' : ''}`} title={p.speculative ? 'Speculative person' : undefined}>
                  {p.speculative && '🔮 '}
                  {p.name || <i>unnamed</i>}
                  {p.isMe && <span className="me-badge">me</span>}
                </span>
                <span className="person-deg">{degree.get(p.id) ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
        {shown.people.length > 0 && filteredPeople.length === 0 && <p className="hint center">No one by that name.</p>}
      </aside>

      <main className="stage">
        <GraphView
          mode={prefs.mode}
          nodes={graph.nodes}
          links={graph.links}
          selectedId={selectedId}
          selectedPair={selectedPair}
          particles={prefs.particles}
          labels={prefs.labels}
          dark={dark}
          fitSignal={fitSignal}
          untangleSignal={untangleSignal}
          autoUntangle={prefs.autoUntangle}
          onUntangled={onUntangled}
          onNodeClick={onNodeClick}
          onLinkClick={onLinkClick}
          onBackgroundClick={onBackgroundClick}
          onNodeDragEnd={onNodeDragEnd}
        />

        {empty && !sel && (
          <div className="empty-card">
            <div className="empty-emoji">🌱</div>
            <h2>Your map is waiting</h2>
            <p>Start by adding yourself, then the people in your life. Every connection can point one way or both.</p>
            <button className="btn btn-primary btn-big" onClick={() => setSel({ kind: 'new-person' })}>
              Add me 💛
            </button>
          </div>
        )}

        {focusPerson && (
          <div className="focus-banner">
            🔍 Showing {focusPerson.emoji} {focusPerson.name}’s {focus!.depth === 1 ? 'circle' : '2-hop world'}
            <button className="linklike" onClick={() => setFocus(null)}>
              show everyone
            </button>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}

        <Legend prefs={prefs} setPrefs={setPrefs} api={api} onUntangle={() => setUntangleSignal((s) => s + 1)} />
      </main>

      {sel && (
        <aside className="inspector">
          <button className="icon-btn inspector-close" onClick={() => setSel(null)} aria-label="Close">
            ✕
          </button>
          {sel.kind === 'new-person' && (
            <NewPersonForm
              vault={shown}
              dispatch={dispatch}
              showSpeculative={prefs.showSpeculative}
              onCreated={(id) => setSel({ kind: 'person', id })}
              onCancel={() => setSel(null)}
            />
          )}
          {sel.kind === 'person' && (
            <PersonPanel
              key={sel.id}
              vault={shown}
              dispatch={dispatch}
              id={sel.id}
              onOpenPair={(a, b) => setSel({ kind: 'pair', a, b })}
              onFocus={(id, depth = 1) => setFocus(id ? { id, depth } : null)}
              focused={focus?.id === sel.id}
              showSpeculative={prefs.showSpeculative}
              onClose={() => setSel(null)}
            />
          )}
          {sel.kind === 'pair' && (
            <PairPanel
              vault={shown}
              dispatch={dispatch}
              a={sel.a}
              b={sel.b}
              onPick={(a, b) => setSel({ kind: 'pair', a, b })}
              onSelectPerson={(id) => setSel({ kind: 'person', id })}
              showSpeculative={prefs.showSpeculative}
            />
          )}
        </aside>
      )}

      {settingsOpen && <SettingsModal api={api} prefs={prefs} setPrefs={setPrefs} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function Legend({
  prefs,
  setPrefs,
  api,
  onUntangle,
}: {
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  api: VaultApi;
  onUntangle: () => void;
}) {
  // Starts tucked away on small screens so it doesn't cover the graph.
  const [open, setOpen] = useState(() => window.innerWidth > 1100);
  const hidden = new Set(prefs.hiddenTypes);
  const toggleType = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPrefs({ hiddenTypes: [...next] });
  };
  const anyPinned = api.vault.people.some((p) => p.pin);
  return (
    <div className={`legend ${open ? '' : 'collapsed'}`}>
      <button className="legend-head" onClick={() => setOpen((o) => !o)}>
        <span>✨ Legend</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          <div className="legend-types">
            {api.vault.types.map((t) => (
              <button
                key={t.id}
                className={`legend-chip ${hidden.has(t.id) ? 'off' : ''} emph-${t.emphasis}`}
                style={{ '--c': t.color } as React.CSSProperties}
                onClick={() => toggleType(t.id)}
                title={hidden.has(t.id) ? `Show ${t.label}` : `Hide ${t.label}`}
              >
                <span className={`legend-line ${t.dashed ? 'dashed' : ''} emph-${t.emphasis}`} />
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
          <div className="legend-key">
            <span>
              <b>→</b> one-way
            </span>
            <span>
              <b>—</b> mutual
            </span>
            <span>
              <b>thicker</b> = more ♥
            </span>
            {prefs.showSpeculative && (
              <span>
                <b>┈</b> 🔮 maybe
              </span>
            )}
          </div>
          <div className="legend-opts">
            <Toggle checked={prefs.mergeMutual} onChange={(mergeMutual) => setPrefs({ mergeMutual })} label="merge mutual lines" />
            <Toggle checked={prefs.particles} onChange={(particles) => setPrefs({ particles })} label="sparkles" />
            <Toggle checked={prefs.labels} onChange={(labels) => setPrefs({ labels })} label="names" />
            {prefs.mode === '2d' && (
              <>
                <Toggle checked={prefs.autoUntangle} onChange={(autoUntangle) => setPrefs({ autoUntangle })} label="auto-untangle" />
                <button className="linklike" onClick={onUntangle} title="Rearrange to reduce crossing lines">
                  ✂️ untangle now
                </button>
              </>
            )}
            {anyPinned && (
              <button className="linklike" onClick={() => api.dispatch({ type: 'clearPins' })}>
                📌 unpin everyone
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
