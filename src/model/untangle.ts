/**
 * Crossing reduction for the 2D layout.
 *
 * The force simulation knows nothing about crossings, so after it settles we
 * run a small greedy local search over node positions:
 *   - swap two movable nodes' positions (keeps the overall spacing intact), or
 *   - relocate a node to a free spot near the centroid of its neighbours.
 * A move is kept if it strictly reduces crossings, or keeps them equal while
 * shortening the total line length (so ties drift toward tidier layouts and
 * the search can't cycle). A line running straight through a third person
 * counts as a conflict too, since it reads just as badly as a crossing.
 * Pinned nodes never move. Links are treated as straight segments between
 * their endpoints; parallel links collapse to one.
 */
import type { Id } from './types';

export interface Pt {
  x: number;
  y: number;
}
export type Edge = readonly [Id, Id];

function orient(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Proper crossing of segments ab and cd (touching/collinear doesn't count). */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** Distance from p to segment ab. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const shares = (e: Edge, f: Edge) => e[0] === f[0] || e[0] === f[1] || e[1] === f[0] || e[1] === f[1];

/** Unique undirected node pairs, dropping self-loops. */
export function uniqueEdges(pairs: Iterable<readonly [Id, Id]>): Edge[] {
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const [a, b] of pairs) {
    if (a === b) continue;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a < b ? [a, b] : [b, a]);
  }
  return out;
}

export function countCrossings(pos: ReadonlyMap<Id, Pt>, edges: readonly Edge[]): number {
  let n = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e = edges[i];
      const f = edges[j];
      if (shares(e, f)) continue;
      if (segmentsCross(pos.get(e[0])!, pos.get(e[1])!, pos.get(f[0])!, pos.get(f[1])!)) n++;
    }
  }
  return n;
}

/** (node, line) pairs where the line passes within `clearance` of a node it doesn't belong to. */
export function countOverlaps(pos: ReadonlyMap<Id, Pt>, edges: readonly Edge[], clearance: number): number {
  let n = 0;
  for (const e of edges) {
    const a = pos.get(e[0])!;
    const b = pos.get(e[1])!;
    for (const [id, p] of pos) if (id !== e[0] && id !== e[1] && distToSegment(p, a, b) < clearance) n++;
  }
  return n;
}

export interface UntangleOptions {
  /** Wall-clock budget; the search stops early when it runs out. */
  maxMs?: number;
  /** Relocated nodes must stay at least this far from every other node. */
  minGap?: number;
  /** Deterministic randomness for tests. */
  random?: () => number;
}

export interface UntangleResult {
  positions: Map<Id, Pt>;
  /** Line crossings before/after. */
  before: number;
  after: number;
  /** Crossings + lines-through-people, before/after (what the search minimises). */
  conflictsBefore: number;
  conflictsAfter: number;
  /** Ids whose position changed. */
  moved: Id[];
}

export function untangle(
  start: ReadonlyMap<Id, Pt>,
  edges: readonly Edge[],
  movable: ReadonlySet<Id>,
  { maxMs = 120, minGap = 30, random = Math.random }: UntangleOptions = {},
): UntangleResult {
  const pos = new Map<Id, Pt>([...start].map(([id, p]) => [id, { x: p.x, y: p.y }]));
  const clearance = minGap / 2;
  const before = countCrossings(pos, edges);
  const conflictsBefore = before + countOverlaps(pos, edges, clearance);
  const ids = [...pos.keys()].filter((id) => movable.has(id));
  const incident = new Map<Id, Edge[]>();
  for (const e of edges) for (const v of e) (incident.get(v) ?? incident.set(v, []).get(v)!).push(e);
  const edgeIndex = new Map(edges.map((e, i) => [e, i]));

  // Conflicts and length touching a set of nodes — enough to score a local
  // move exactly, since nothing outside this set changes.
  const localScore = (touched: Id[]): [number, number] => {
    const mine = new Set<Edge>();
    for (const v of touched) for (const e of incident.get(v) ?? []) mine.add(e);
    const touchedSet = new Set(touched);
    let crossings = 0;
    // Lines through people: touched people vs every line, plus touched lines vs everyone else.
    for (const v of touched) {
      const p = pos.get(v)!;
      for (const e of edges) if (e[0] !== v && e[1] !== v && distToSegment(p, pos.get(e[0])!, pos.get(e[1])!) < clearance) crossings++;
    }
    for (const e of mine) {
      const a = pos.get(e[0])!;
      const b = pos.get(e[1])!;
      for (const [id, p] of pos) {
        if (touchedSet.has(id) || id === e[0] || id === e[1]) continue;
        if (distToSegment(p, a, b) < clearance) crossings++;
      }
    }
    let length = 0;
    for (const e of mine) {
      const a = pos.get(e[0])!;
      const b = pos.get(e[1])!;
      length += Math.hypot(a.x - b.x, a.y - b.y);
      for (const f of edges) {
        if (f === e || shares(e, f)) continue;
        // Count a pair inside `mine` once, from its earlier member.
        if (mine.has(f) && edgeIndex.get(f)! < edgeIndex.get(e)!) continue;
        if (segmentsCross(a, b, pos.get(f[0])!, pos.get(f[1])!)) crossings++;
      }
    }
    return [crossings, length];
  };
  const better = ([c1, l1]: [number, number], [c0, l0]: [number, number]) => c1 < c0 || (c1 === c0 && l1 < l0 * 0.97);

  const free = (id: Id, p: Pt) => {
    for (const [o, q] of pos) if (o !== id && Math.hypot(q.x - p.x, q.y - p.y) < minGap) return false;
    return true;
  };

  const t0 = performance.now();
  const outOfTime = () => performance.now() - t0 > maxMs;
  let improved = true;
  while (improved && !outOfTime()) {
    improved = false;

    // 1. Pairwise swaps.
    for (let i = 0; i < ids.length && !outOfTime(); i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const u = ids[i];
        const v = ids[j];
        const s0 = localScore([u, v]);
        if (s0[0] === 0) continue; // nothing to fix around these two
        const pu = pos.get(u)!;
        const pv = pos.get(v)!;
        pos.set(u, pv);
        pos.set(v, pu);
        if (better(localScore([u, v]), s0)) improved = true;
        else {
          pos.set(u, pu);
          pos.set(v, pv);
        }
      }
    }

    // 2. Relocate a node near its neighbours' centroid.
    for (const u of ids) {
      if (outOfTime()) break;
      const nbrs = (incident.get(u) ?? []).map((e) => (e[0] === u ? e[1] : e[0]));
      if (!nbrs.length) continue;
      const s0 = localScore([u]);
      if (s0[0] === 0) continue;
      const cx = nbrs.reduce((s, n) => s + pos.get(n)!.x, 0) / nbrs.length;
      const cy = nbrs.reduce((s, n) => s + pos.get(n)!.y, 0) / nbrs.length;
      const orig = pos.get(u)!;
      let best: Pt | null = null;
      let bestScore = s0;
      const phase = random() * Math.PI * 2;
      for (const r of [minGap, minGap * 2, minGap * 3.5]) {
        for (let k = 0; k < 8; k++) {
          const a = phase + (k * Math.PI) / 4;
          const p = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
          if (!free(u, p)) continue;
          pos.set(u, p);
          const s = localScore([u]);
          if (better(s, bestScore)) {
            best = p;
            bestScore = s;
          }
        }
      }
      pos.set(u, best ?? orig);
      if (best) improved = true;
    }
  }

  const moved = ids.filter((id) => {
    const a = start.get(id)!;
    const b = pos.get(id)!;
    return a.x !== b.x || a.y !== b.y;
  });
  const after = countCrossings(pos, edges);
  return { positions: pos, before, after, conflictsBefore, conflictsAfter: after + countOverlaps(pos, edges, clearance), moved };
}
