/**
 * Classic graph-theory problems, applied to a polycule. Everything here works
 * on a plain undirected simple graph (one edge per pair, weighted by the
 * strongest ♥ between them) and is pure, so it's easy to test.
 *
 * Several of these are hard in general, but friend groups are small: we solve
 * exactly where that's cheap and say so (`exact: false`) when we fall back to
 * a quick heuristic.
 */
import { pairKey } from './graph';
import type { Id } from './types';

export interface SimpleGraph {
  nodes: Id[];
  /** Neighbour → weight, both directions. */
  adj: Map<Id, Map<Id, number>>;
}

/** Collapse any number of (possibly repeated) edges into a simple graph. Self-loops are dropped. */
export function simpleGraph(edges: { a: Id; b: Id; w: number }[]): SimpleGraph {
  const adj = new Map<Id, Map<Id, number>>();
  const link = (x: Id, y: Id, w: number) => {
    const m = adj.get(x) ?? adj.set(x, new Map()).get(x)!;
    m.set(y, Math.max(m.get(y) ?? 0, w));
  };
  for (const { a, b, w } of edges) {
    if (a === b) continue;
    link(a, b, w);
    link(b, a, w);
  }
  return { nodes: [...adj.keys()].sort(), adj };
}

/** Each edge once, as [a, b, w] with a < b. */
export function edgeList(g: SimpleGraph): [Id, Id, number][] {
  const out: [Id, Id, number][] = [];
  for (const [a, m] of g.adj) for (const [b, w] of m) if (a < b) out.push([a, b, w]);
  return out.sort((x, y) => (x[0] + '|' + x[1] < y[0] + '|' + y[1] ? -1 : 1));
}

/** Connected components, each sorted. */
export function components(g: SimpleGraph, without?: { node?: Id; edge?: [Id, Id] }): Id[][] {
  const seen = new Set<Id>(without?.node ? [without.node] : []);
  const cut = without?.edge ? pairKey(...without.edge) : null;
  const out: Id[][] = [];
  for (const s of g.nodes) {
    if (seen.has(s)) continue;
    const comp = [s];
    seen.add(s);
    for (let i = 0; i < comp.length; i++) {
      for (const n of g.adj.get(comp[i])!.keys()) {
        if (seen.has(n) || (cut && pairKey(comp[i], n) === cut)) continue;
        seen.add(n);
        comp.push(n);
      }
    }
    out.push(comp.sort());
  }
  return out;
}

// ---- 💌 Valentine's Day: maximum matching -----------------------------------

export interface Matching {
  pairs: [Id, Id][];
  unmatched: Id[];
  /** Everybody has a date. */
  perfect: boolean;
  exact: boolean;
}

/** Above this many people in one polycule, the exact search gets slow: go greedy. */
const MATCHING_EXACT_LIMIT = 20;
/** Score = dates first, then total ♥. Intensities are ≤ 5, so this never overflows into the count. */
const DATE = 1000;

/**
 * As many simultaneous one-on-one dates as possible; among those, the most ♥.
 * Exact (memoised search over who's still free) per polycule up to 20 people.
 */
export function maxMatching(g: SimpleGraph): Matching {
  const pairs: [Id, Id][] = [];
  let exact = true;
  for (const comp of components(g)) {
    if (comp.length <= MATCHING_EXACT_LIMIT) pairs.push(...exactMatching(comp, g));
    else {
      exact = false;
      pairs.push(...greedyMatching(comp, g));
    }
  }
  const matched = new Set(pairs.flat());
  const unmatched = g.nodes.filter((n) => !matched.has(n));
  return { pairs: pairs.sort(), unmatched, perfect: unmatched.length === 0, exact };
}

function exactMatching(ids: Id[], g: SimpleGraph): [Id, Id][] {
  const idx = new Map(ids.map((id, i) => [id, i]));
  const nb = ids.map((id) => [...g.adj.get(id)!].map(([j, w]) => [idx.get(j)!, w] as const));
  const memo = new Map<number, number>();
  const low = (mask: number) => 31 - Math.clz32(mask & -mask);
  const best = (mask: number): number => {
    if (!mask) return 0;
    const hit = memo.get(mask);
    if (hit !== undefined) return hit;
    const i = low(mask);
    const rest = mask & ~(1 << i);
    let b = best(rest); // i sits this one out
    for (const [j, w] of nb[i]) if (rest & (1 << j)) b = Math.max(b, DATE + w + best(rest & ~(1 << j)));
    memo.set(mask, b);
    return b;
  };
  const pairs: [Id, Id][] = [];
  let mask = (1 << ids.length) - 1;
  while (mask) {
    const target = best(mask);
    const i = low(mask);
    const rest = mask & ~(1 << i);
    mask = rest;
    if (best(rest) === target) continue;
    for (const [j, w] of nb[i]) {
      if (rest & (1 << j) && DATE + w + best(rest & ~(1 << j)) === target) {
        pairs.push(ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]]);
        mask = rest & ~(1 << j);
        break;
      }
    }
  }
  return pairs;
}

function greedyMatching(ids: Id[], g: SimpleGraph): [Id, Id][] {
  const inComp = new Set(ids);
  const deg = (id: Id) => g.adj.get(id)!.size;
  // Heaviest bonds first; among equals, pair up the people with fewest options.
  const edges = edgeList(g)
    .filter(([a]) => inComp.has(a))
    .sort((x, y) => y[2] - x[2] || deg(x[0]) + deg(x[1]) - deg(y[0]) - deg(y[1]));
  const used = new Set<Id>();
  const out: [Id, Id][] = [];
  for (const [a, b] of edges) {
    if (used.has(a) || used.has(b)) continue;
    used.add(a).add(b);
    out.push([a, b]);
  }
  return out;
}

// ---- 📅 Date-night calendar: edge colouring ---------------------------------

export interface EdgeColouring {
  /** pairKey → night index (0-based). */
  night: Map<string, number>;
  nights: number;
  /** Most partners anyone has (Δ). Vizing: nights is Δ or Δ + 1. */
  maxDegree: number;
  /** The busiest person (a Δ-degree vertex). */
  busiest: Id | null;
  /** False if we couldn't prove Δ nights impossible in time. */
  exact: boolean;
}

const COLOUR_BUDGET = 200_000;

/**
 * Give every pair a regular night so nobody is ever double-booked, using as
 * few nights as possible. By Vizing's theorem that's the busiest person's
 * partner count (Class 1) or one more (Class 2). Backtracking search with a
 * step budget, smallest-choice-first.
 */
export function edgeColouring(g: SimpleGraph): EdgeColouring {
  const edges = edgeList(g).map(([a, b]) => [a, b] as [Id, Id]);
  let maxDegree = 0;
  let busiest: Id | null = null;
  for (const n of g.nodes) {
    const d = g.adj.get(n)!.size;
    if (d > maxDegree) [maxDegree, busiest] = [d, n];
  }
  if (!edges.length) return { night: new Map(), nights: 0, maxDegree: 0, busiest: null, exact: true };

  const tryK = (k: number): Map<string, number> | 'impossible' | 'gave-up' => {
    const used = new Map<Id, Set<number>>(g.nodes.map((n) => [n, new Set()]));
    const colour = new Map<string, number>();
    let steps = 0;
    // Symmetry break: the busiest person's dates can be nights 0..Δ-1 in any order.
    let i = 0;
    for (const n of g.adj.get(busiest!)!.keys()) {
      colour.set(pairKey(busiest!, n), i);
      used.get(busiest!)!.add(i);
      used.get(n)!.add(i);
      i++;
    }
    const todo = edges.filter(([a, b]) => !colour.has(pairKey(a, b)));
    const free = ([a, b]: [Id, Id]) => {
      const out: number[] = [];
      for (let c = 0; c < k; c++) if (!used.get(a)!.has(c) && !used.get(b)!.has(c)) out.push(c);
      return out;
    };
    const solve = (): boolean | null => {
      if (++steps > COLOUR_BUDGET) return null;
      // Most constrained edge next.
      let pick = -1;
      let opts: number[] = [];
      for (let e = 0; e < todo.length; e++) {
        if (colour.has(pairKey(...todo[e]))) continue;
        const f = free(todo[e]);
        if (pick < 0 || f.length < opts.length) [pick, opts] = [e, f];
        if (!f.length) return false;
      }
      if (pick < 0) return true;
      const [a, b] = todo[pick];
      const key = pairKey(a, b);
      for (const c of opts) {
        colour.set(key, c);
        used.get(a)!.add(c);
        used.get(b)!.add(c);
        const r = solve();
        if (r !== false) return r;
        colour.delete(key);
        used.get(a)!.delete(c);
        used.get(b)!.delete(c);
      }
      return false;
    };
    const r = solve();
    return r === true ? colour : r === null ? 'gave-up' : 'impossible';
  };

  const atDelta = tryK(maxDegree);
  if (atDelta instanceof Map) return { night: atDelta, nights: maxDegree, maxDegree, busiest, exact: true };
  const plusOne = tryK(maxDegree + 1);
  if (plusOne instanceof Map) return { night: plusOne, nights: maxDegree + 1, maxDegree, busiest, exact: atDelta === 'impossible' };

  // Practically unreachable at friend-group scale, but always return something valid.
  const night = new Map<string, number>();
  const used = new Map<Id, Set<number>>(g.nodes.map((n) => [n, new Set()]));
  let nights = 0;
  for (const [a, b] of edges) {
    let c = 0;
    while (used.get(a)!.has(c) || used.get(b)!.has(c)) c++;
    night.set(pairKey(a, b), c);
    used.get(a)!.add(c);
    used.get(b)!.add(c);
    nights = Math.max(nights, c + 1);
  }
  return { night, nights, maxDegree, busiest, exact: false };
}

// ---- 🔺 Love-triangle detector: bipartiteness & shortest odd cycle ----------

export interface Bipartition {
  bipartite: boolean;
  /** Two sides (only meaningful when bipartite). */
  side: Map<Id, 0 | 1>;
  /** The shortest odd cycle, in order (first person not repeated at the end). */
  oddCycle: Id[] | null;
}

/**
 * Can everyone be split into two sides with every bond crossing between them?
 * If not, an odd cycle is to blame — we find the shortest one.
 */
export function bipartition(g: SimpleGraph): Bipartition {
  const side = new Map<Id, 0 | 1>();
  let bipartite = true;
  for (const s of g.nodes) {
    if (side.has(s)) continue;
    side.set(s, 0);
    const q = [s];
    for (let i = 0; i < q.length; i++) {
      for (const n of g.adj.get(q[i])!.keys()) {
        if (!side.has(n)) {
          side.set(n, (1 - side.get(q[i])!) as 0 | 1);
          q.push(n);
        } else if (side.get(n) === side.get(q[i])) bipartite = false;
      }
    }
  }
  return { bipartite, side, oddCycle: bipartite ? null : shortestOddCycle(g) };
}

function shortestOddCycle(g: SimpleGraph): Id[] | null {
  let best: Id[] | null = null;
  for (const s of g.nodes) {
    const dist = new Map<Id, number>([[s, 0]]);
    const parent = new Map<Id, Id>();
    const q = [s];
    for (let i = 0; i < q.length; i++) {
      const u = q[i];
      if (best && 2 * dist.get(u)! + 1 >= best.length) break;
      for (const v of g.adj.get(u)!.keys()) {
        if (!dist.has(v)) {
          dist.set(v, dist.get(u)! + 1);
          parent.set(v, u);
          q.push(v);
        } else if (dist.get(v) === dist.get(u) && u < v) {
          const up = (x: Id) => {
            const path = [x];
            while (path[path.length - 1] !== s) path.push(parent.get(path[path.length - 1])!);
            return path;
          };
          const pu = up(u);
          const pv = up(v);
          // Both climb back to s; they must only meet there for a simple cycle.
          const onU = new Set(pu.slice(0, -1));
          if (pv.slice(0, -1).some((x) => onU.has(x))) continue;
          const cycle = [...pu.reverse(), ...pv.slice(0, -1)];
          if (!best || cycle.length < best.length) best = cycle;
        }
      }
    }
  }
  return best;
}

// ---- 🧱 Load-bearing relationships: bridges & articulation points -----------

export interface Fragility {
  /** Bonds on no loop: break one and a polycule splits. Each with the sizes of the two halves. */
  bridges: { a: Id; b: Id; sizes: [number, number] }[];
  /** People whose absence would split their polycule, with how many pieces are left. */
  hinges: { id: Id; pieces: number }[];
}

export function fragility(g: SimpleGraph): Fragility {
  const disc = new Map<Id, number>();
  const low = new Map<Id, number>();
  const bridgePairs: [Id, Id][] = [];
  const hingeIds = new Set<Id>();
  let t = 0;
  // Tarjan's bridge/articulation DFS. Recursion depth ≤ people count, fine here.
  const dfs = (u: Id, parent: Id | null) => {
    disc.set(u, t);
    low.set(u, t++);
    let children = 0;
    for (const v of g.adj.get(u)!.keys()) {
      if (v === parent) continue;
      if (disc.has(v)) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
        continue;
      }
      children++;
      dfs(v, u);
      low.set(u, Math.min(low.get(u)!, low.get(v)!));
      if (low.get(v)! > disc.get(u)!) bridgePairs.push(u < v ? [u, v] : [v, u]);
      if (parent !== null && low.get(v)! >= disc.get(u)!) hingeIds.add(u);
    }
    if (parent === null && children > 1) hingeIds.add(u);
  };
  for (const n of g.nodes) if (!disc.has(n)) dfs(n, null);

  const compOf = new Map<Id, number>();
  components(g).forEach((c, i) => c.forEach((id) => compOf.set(id, i)));
  const sameComp = (pieces: Id[][], member: Id) => pieces.filter((c) => compOf.get(c[0]) === compOf.get(member));

  const bridges = bridgePairs.sort().map(([a, b]) => {
    const pieces = sameComp(components(g, { edge: [a, b] }), a);
    const sa = pieces.find((c) => c.includes(a))!.length;
    const sb = pieces.find((c) => c.includes(b))!.length;
    return { a, b, sizes: [sa, sb] as [number, number] };
  });
  const hinges = [...hingeIds].sort().map((id) => ({ id, pieces: sameComp(components(g, { node: id }), id).length }));
  return { bridges, hinges };
}
