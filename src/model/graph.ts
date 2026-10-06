import { PARTNER_TYPE_IDS } from './defaults';
import type { Id, Person, Relationship, RelationshipType, Vault } from './types';

export interface GraphNode {
  id: Id;
  person: Person;
  degree: number;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

export interface GraphLink {
  id: string;
  source: Id | GraphNode;
  target: Id | GraphNode;
  type: RelationshipType;
  /** One relationship for a one-way link; two (A→B and B→A) for a merged mutual link. */
  rels: Relationship[];
  mutual: boolean;
  speculative: boolean;
  curvature: number;
  width: number;
}

export interface GraphOptions {
  hiddenTypes: ReadonlySet<Id>;
  /** Merge A→B + B→A of the same type into one arrowless "mutual" line. */
  mergeMutual: boolean;
  /** Restrict to people within `focusDepth` hops of this person. */
  focusId: Id | null;
  focusDepth: number;
}

const CURVE_STEP = 0.28;

export function pairKey(a: Id, b: Id): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function intensityWidth(intensity: number, type?: RelationshipType): number {
  const w = 0.8 + intensity * 0.55;
  if (type?.emphasis === 'bold') return w * 1.8 + 2;
  if (type?.emphasis === 'subtle') return w * 0.6;
  return w;
}

/**
 * True when `rel` is mutual: its type is non-directional, or a counterpart of
 * the same type on the same layer points back.
 */
export function isMutual(rel: Relationship, all: Relationship[], type?: RelationshipType): boolean {
  if (type && !type.directed) return true;
  return all.some(
    (r) => r.typeId === rel.typeId && r.from === rel.to && r.to === rel.from && !!r.speculative === !!rel.speculative,
  );
}

/**
 * The vault as the rest of the UI should see it. With the speculative layer
 * switched off, speculative connections vanish everywhere — map, lists,
 * counts, metamours — exactly as if they'd never been added.
 */
export function visibleVault(vault: Vault, showSpeculative: boolean): Vault {
  if (showSpeculative) return vault;
  return { ...vault, relationships: vault.relationships.filter((r) => !r.speculative) };
}

/** People within `depth` undirected hops of `start`, along the given relationships. */
export function neighbourhood(start: Id, rels: Relationship[], depth: number): Set<Id> {
  const adj = new Map<Id, Id[]>();
  for (const r of rels) {
    (adj.get(r.from) ?? adj.set(r.from, []).get(r.from)!).push(r.to);
    (adj.get(r.to) ?? adj.set(r.to, []).get(r.to)!).push(r.from);
  }
  const seen = new Set<Id>([start]);
  let frontier = [start];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: Id[] = [];
    for (const id of frontier) {
      for (const n of adj.get(id) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

export function buildGraph(vault: Vault, opts: GraphOptions): { nodes: GraphNode[]; links: GraphLink[] } {
  const typeById = new Map(vault.types.map((t) => [t.id, t]));
  const personIds = new Set(vault.people.map((p) => p.id));

  let rels = vault.relationships.filter(
    (r) => !opts.hiddenTypes.has(r.typeId) && typeById.has(r.typeId) && personIds.has(r.from) && personIds.has(r.to),
  );

  let people = vault.people;
  if (opts.focusId && personIds.has(opts.focusId)) {
    const keep = neighbourhood(opts.focusId, rels, opts.focusDepth);
    people = people.filter((p) => keep.has(p.id));
    rels = rels.filter((r) => keep.has(r.from) && keep.has(r.to));
  }

  // 1. Turn relationships into links, optionally merging mutual same-type pairs.
  const links: GraphLink[] = [];
  const consumed = new Set<Id>();
  for (const r of rels) {
    if (consumed.has(r.id)) continue;
    const type = typeById.get(r.typeId)!;
    if (!type.directed) {
      // A shared bond: one arrowless line, oriented canonically for stable curvature.
      consumed.add(r.id);
      const [s, t] = r.from < r.to ? [r.from, r.to] : [r.to, r.from];
      links.push({
        id: `u:${r.id}`,
        source: s,
        target: t,
        type,
        rels: [r],
        mutual: true,
        speculative: !!r.speculative,
        curvature: 0,
        width: intensityWidth(r.intensity, type) + 0.6,
      });
      continue;
    }
    const back = opts.mergeMutual
      ? rels.find(
          (o) =>
            !consumed.has(o.id) &&
            o.id !== r.id &&
            o.typeId === r.typeId &&
            o.from === r.to &&
            o.to === r.from &&
            !!o.speculative === !!r.speculative,
        )
      : undefined;
    if (back) {
      consumed.add(r.id).add(back.id);
      // Orient merged links canonically so curvature assignment is stable.
      const [a, b] = r.from < r.to ? [r, back] : [back, r];
      links.push({
        id: `m:${a.id}:${b.id}`,
        source: a.from,
        target: a.to,
        type,
        rels: [a, b],
        mutual: true,
        speculative: !!a.speculative,
        curvature: 0,
        width: intensityWidth((a.intensity + b.intensity) / 2, type) + 0.6,
      });
    } else {
      consumed.add(r.id);
      links.push({
        id: `r:${r.id}`,
        source: r.from,
        target: r.to,
        type,
        rels: [r],
        mutual: false,
        speculative: !!r.speculative,
        curvature: 0,
        width: intensityWidth(r.intensity, type),
      });
    }
  }

  // 2. Fan out parallel links between the same pair so none overlap.
  //    force-graph curvature is relative to each link's own direction, so a
  //    link pointing "backwards" (relative to the sorted pair) is negated.
  const byPair = new Map<string, GraphLink[]>();
  for (const l of links) {
    const k = pairKey(l.source as Id, l.target as Id);
    (byPair.get(k) ?? byPair.set(k, []).get(k)!).push(l);
  }
  const typeOrder = new Map(vault.types.map((t, i) => [t.id, i]));
  for (const group of byPair.values()) {
    if (group.length < 2) continue;
    group.sort(
      (x, y) =>
        typeOrder.get(x.type.id)! - typeOrder.get(y.type.id)! ||
        Number(x.speculative) - Number(y.speculative) ||
        Number((x.source as Id) > (x.target as Id)) - Number((y.source as Id) > (y.target as Id)),
    );
    const mid = (group.length - 1) / 2;
    group.forEach((l, i) => {
      const offset = (i - mid) * CURVE_STEP;
      l.curvature = (l.source as Id) < (l.target as Id) ? offset : -offset;
    });
  }

  // 3. Nodes, sized by how connected they are.
  const degree = new Map<Id, number>();
  for (const r of rels) {
    degree.set(r.from, (degree.get(r.from) ?? 0) + 1);
    degree.set(r.to, (degree.get(r.to) ?? 0) + 1);
  }
  const nodes: GraphNode[] = people.map((p) => ({ id: p.id, person: p, degree: degree.get(p.id) ?? 0 }));

  return { nodes, links };
}

/**
 * Metamours: people who share a romantic/play partner with `id` but aren't
 * themselves romantically/sexually linked to `id`. Derived, never stored.
 */
export function metamours(id: Id, vault: Vault, partnerTypes: ReadonlySet<Id> = PARTNER_TYPE_IDS): Id[] {
  const partnersOf = (pid: Id) => {
    const s = new Set<Id>();
    for (const r of vault.relationships) {
      if (!partnerTypes.has(r.typeId)) continue;
      if (r.from === pid) s.add(r.to);
      if (r.to === pid) s.add(r.from);
    }
    return s;
  };
  const mine = partnersOf(id);
  const out = new Set<Id>();
  for (const p of mine) for (const m of partnersOf(p)) if (m !== id && !mine.has(m)) out.add(m);
  return [...out];
}
