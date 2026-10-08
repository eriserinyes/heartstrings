import { endId, type Overlay } from './graph/shared';
import { pairKey, type GraphLink } from '../model/graph';
import {
  bipartition,
  edgeColouring,
  fragility,
  maxMatching,
  simpleGraph,
  type Bipartition,
  type EdgeColouring,
  type Fragility,
  type Matching,
  type SimpleGraph,
} from '../model/theory';

/**
 * ✨ Graph Theory: classic graph problems as lenses over the map. Purely a
 * view — nothing here is saved, and it works on whatever's currently shown
 * (hidden types, 🔍 focus and the 🔮 layer all apply).
 */

export type LensId = 'valentine' | 'nights' | 'triangle' | 'hinge';
/** Which lines count: shared partner bonds only, or every connection. */
export type LensScope = 'partners' | 'everyone';

export const LENSES: { id: LensId; emoji: string; title: string; problem: string }[] = [
  { id: 'valentine', emoji: '💌', title: "Valentine's Day Problem", problem: 'Maximum matching' },
  { id: 'nights', emoji: '📅', title: 'Date Night Calendar', problem: 'Edge colouring · Vizing' },
  { id: 'triangle', emoji: '🔺', title: 'Love Triangle Detector', problem: 'Bipartiteness · odd cycles' },
  { id: 'hinge', emoji: '🧱', title: 'Load-Bearing Relationships', problem: 'Bridges & articulation points' },
];

const NIGHTS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const NIGHT_SHORT = ['M', 'Tu', 'W', 'Th', 'F', 'Sa', 'Su'];
const NIGHT_COLORS = ['#ff4f6d', '#ff9f1c', '#e0b100', '#2fbf71', '#2f9bff', '#8a5cff', '#ff5fcf', '#00b3a4', '#8d6e63', '#607d8b'];
export const nightName = (i: number) => NIGHTS[i % 7] + (i >= 7 ? ` (wk ${Math.floor(i / 7) + 1})` : '');
const nightShort = (i: number) => NIGHT_SHORT[i % 7] + (i >= 7 ? '²' : '');
export const nightColor = (i: number) => NIGHT_COLORS[i % NIGHT_COLORS.length];

export const TEAM = ['#ff6fae', '#3fa7ff'];
const ALERT = '#ff3b5c';
const HINGE = '#ff8a00';

export type LensResult = { overlay: Overlay | null; g: SimpleGraph } & (
  | { kind: 'empty' }
  | { kind: 'valentine'; m: Matching }
  | { kind: 'nights'; c: EdgeColouring }
  | { kind: 'triangle'; b: Bipartition }
  | { kind: 'hinge'; f: Fragility }
);

function scopeGraph(links: GraphLink[], scope: LensScope): SimpleGraph {
  return simpleGraph(
    links
      .filter((l) => scope === 'everyone' || !l.type.directed)
      .map((l) => ({ a: endId(l.source), b: endId(l.target), w: Math.max(...l.rels.map((r) => r.intensity)) })),
  );
}

/** Run a lens over the links currently on the map. */
export function runLens(lens: LensId, scope: LensScope, links: GraphLink[]): LensResult {
  const g = scopeGraph(links, scope);
  if (!g.nodes.length) return { kind: 'empty', g, overlay: null };
  const overlay: Overlay = { nodes: new Map(), links: new Map() };
  const everyone = () => {
    for (const n of g.nodes) overlay.nodes.set(n, {});
    for (const [a, m] of g.adj) for (const b of m.keys()) overlay.links.set(pairKey(a, b), {});
  };

  switch (lens) {
    case 'valentine': {
      const m = maxMatching(g);
      for (const [a, b] of m.pairs) overlay.links.set(pairKey(a, b), { badge: '💌' });
      for (const id of m.unmatched) overlay.nodes.set(id, { ring: '#b7a6d6', badge: '🕯️' });
      return { kind: 'valentine', m, g, overlay };
    }
    case 'nights': {
      const c = edgeColouring(g);
      for (const n of g.nodes) overlay.nodes.set(n, {});
      for (const [k, i] of c.night) overlay.links.set(k, { color: nightColor(i), badge: nightShort(i) });
      return { kind: 'nights', c, g, overlay };
    }
    case 'triangle': {
      const b = bipartition(g);
      if (b.bipartite) {
        everyone();
        for (const [id, s] of b.side) overlay.nodes.set(id, { ring: TEAM[s] });
      } else {
        const cyc = b.oddCycle!;
        cyc.forEach((id, i) => {
          overlay.nodes.set(id, { ring: ALERT, pulse: true });
          overlay.links.set(pairKey(id, cyc[(i + 1) % cyc.length]), { color: ALERT });
        });
      }
      return { kind: 'triangle', b, g, overlay };
    }
    case 'hinge': {
      const f = fragility(g);
      everyone();
      for (const { a, b } of f.bridges) overlay.links.set(pairKey(a, b), { color: HINGE, badge: '⚠️' });
      for (const { id } of f.hinges) overlay.nodes.set(id, { ring: HINGE, badge: '🧱', pulse: true });
      return { kind: 'hinge', f, g, overlay };
    }
  }
}
