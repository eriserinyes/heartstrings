import { DEFAULT_TYPES, newId, V1_TYPE_IDS } from '../model/defaults';
import { pairKey } from '../model/graph';
import type { Id, Person, Relationship, RelationshipType, Vault } from '../model/types';

export type Action =
  | { type: 'replace'; vault: Vault }
  | { type: 'addPerson'; person: Person }
  | { type: 'updatePerson'; id: Id; patch: Partial<Person> }
  | { type: 'removePerson'; id: Id }
  | { type: 'addRelationships'; rels: Relationship[] }
  | { type: 'updateRelationship'; id: Id; patch: Partial<Relationship> }
  | { type: 'removeRelationship'; id: Id }
  | { type: 'upsertType'; relType: RelationshipType }
  | { type: 'removeType'; id: Id }
  | { type: 'pinAll'; pins: Record<Id, Person['pin']> }
  | { type: 'clearPins' };

export function vaultReducer(v: Vault, a: Action): Vault {
  switch (a.type) {
    case 'replace':
      return a.vault;
    case 'addPerson': {
      // Only one "me": claiming it clears it from everyone else.
      const people = a.person.isMe ? v.people.map((p) => (p.isMe ? { ...p, isMe: false } : p)) : v.people;
      return { ...v, people: [...people, realIfMe(a.person)] };
    }
    case 'updatePerson':
      return {
        ...v,
        people: v.people.map((p) =>
          p.id === a.id ? realIfMe({ ...p, ...a.patch }) : a.patch.isMe && p.isMe ? { ...p, isMe: false } : p,
        ),
      };
    case 'removePerson':
      return {
        ...v,
        people: v.people.filter((p) => p.id !== a.id),
        relationships: v.relationships.filter((r) => r.from !== a.id && r.to !== a.id),
      };
    case 'addRelationships': {
      // Ignore duplicates (same type/layer, same direction — or either
      // direction for non-directional types). Edit the existing one instead.
      const undirected = undirectedIds(v.types);
      const same = (r: Relationship, n: Relationship) =>
        r.typeId === n.typeId &&
        !!r.speculative === !!n.speculative &&
        ((r.from === n.from && r.to === n.to) || (undirected.has(r.typeId) && r.from === n.to && r.to === n.from));
      const fresh: Relationship[] = [];
      for (const n of a.rels) {
        if (!v.relationships.some((r) => same(r, n)) && !fresh.some((r) => same(r, n))) fresh.push(n);
      }
      return { ...v, relationships: [...v.relationships, ...fresh] };
    }
    case 'updateRelationship':
      return { ...v, relationships: v.relationships.map((r) => (r.id === a.id ? { ...r, ...a.patch } : r)) };
    case 'removeRelationship':
      return { ...v, relationships: v.relationships.filter((r) => r.id !== a.id) };
    case 'upsertType': {
      const prev = v.types.find((t) => t.id === a.relType.id);
      const outranks = new Set(a.relType.supersedes ?? []);
      const types = (prev ? v.types.map((t) => (t.id === a.relType.id ? a.relType : t)) : [...v.types, a.relType]).map((t) =>
        // Two types can't outrank each other: the newer choice wins.
        outranks.has(t.id) && t.supersedes?.includes(a.relType.id)
          ? { ...t, supersedes: t.supersedes.filter((x) => x !== a.relType.id) }
          : t,
      );
      let relationships = v.relationships;
      // Flipping directionality converts existing connections so their meaning survives.
      if (prev && prev.directed && !a.relType.directed) relationships = collapseUndirected(relationships, new Set([prev.id]));
      if (prev && !prev.directed && a.relType.directed) relationships = expandToDirected(relationships, prev.id);
      return { ...v, types, relationships };
    }
    case 'removeType':
      return {
        ...v,
        types: v.types
          .filter((t) => t.id !== a.id)
          .map((t) => (t.supersedes?.includes(a.id) ? { ...t, supersedes: t.supersedes.filter((x) => x !== a.id) } : t)),
        relationships: v.relationships.filter((r) => r.typeId !== a.id),
      };
    case 'pinAll':
      return { ...v, people: v.people.map((p) => (a.pins[p.id] ? { ...p, pin: a.pins[p.id] } : p)) };
    case 'clearPins':
      return { ...v, people: v.people.map(({ pin: _pin, ...p }) => p) };
  }
}

/** You are never hypothetical. */
function realIfMe(p: Person): Person {
  return p.isMe && p.speculative ? { ...p, speculative: false } : p;
}

function undirectedIds(types: RelationshipType[]): Set<Id> {
  return new Set(types.filter((t) => !t.directed).map((t) => t.id));
}

/**
 * Merge connections of non-directional types down to one record per pair
 * (per layer). A→B + B→A becomes one bond, keeping the stronger intensity,
 * the earlier "since", and both notes; a lone A→B simply becomes mutual.
 */
export function collapseUndirected(rels: Relationship[], undirected: ReadonlySet<Id>): Relationship[] {
  const kept = new Map<string, Relationship>();
  const out: Relationship[] = [];
  for (const r of rels) {
    if (!undirected.has(r.typeId)) {
      out.push(r);
      continue;
    }
    const key = `${r.typeId}|${pairKey(r.from, r.to)}|${r.speculative ? 1 : 0}`;
    const k = kept.get(key);
    if (!k) {
      const copy = { ...r };
      kept.set(key, copy);
      out.push(copy);
      continue;
    }
    k.intensity = Math.max(k.intensity, r.intensity);
    if (r.since && (!k.since || r.since < k.since)) k.since = r.since;
    if (r.notes && r.notes !== k.notes) k.notes = k.notes ? `${k.notes} / ${r.notes}` : r.notes;
    k.createdAt = Math.min(k.createdAt, r.createdAt);
  }
  return out;
}

/** A shared bond becomes a pair of one-way connections (A→B and B→A). */
export function expandToDirected(rels: Relationship[], typeId: Id): Relationship[] {
  return rels.flatMap((r) => (r.typeId === typeId ? [r, { ...r, id: newId(), from: r.to, to: r.from }] : [r]));
}

/** Where a newly-introduced built-in should slot into an existing type list. */
const PLACEMENT: Record<Id, { after?: Id; before?: Id }> = {
  acquaintance: { after: 'friend' },
  primary: { before: 'romantic' },
  ex: { after: 'qpr' },
};

/**
 * Add built-in types the vault has never been offered (e.g. ones shipped
 * after it was created), and backfill fields added since. Built-ins the user
 * deleted stay deleted, because they're already in seededTypeIds.
 */
function seedNewBuiltIns(rawTypes: RelationshipType[], seeded: Id[] = V1_TYPE_IDS) {
  const byId = new Map(DEFAULT_TYPES.map((t) => [t.id, t]));
  const types = rawTypes.map((t) => ({
    ...t,
    emphasis: t.emphasis ?? byId.get(t.id)?.emphasis ?? 'normal',
    // Built-ins take the new default; custom types were always directional before.
    directed: t.directed ?? byId.get(t.id)?.directed ?? true,
    // Built-ins pick up the default ladder; custom types start out parallel to everything.
    supersedes: t.supersedes ?? byId.get(t.id)?.supersedes ?? [],
  }));
  for (const d of DEFAULT_TYPES) {
    if (seeded.includes(d.id) || types.some((t) => t.id === d.id)) continue;
    const place = PLACEMENT[d.id] ?? {};
    const anchor = types.findIndex((t) => t.id === (place.after ?? place.before));
    const at = anchor < 0 ? types.length : place.after ? anchor + 1 : anchor;
    types.splice(at, 0, { ...d, supersedes: [...(d.supersedes ?? [])] });
  }
  return { types, seededTypeIds: [...new Set([...seeded, ...DEFAULT_TYPES.map((t) => t.id)])] };
}

/** Light validation for imported/decrypted vaults so a bad file can't crash the UI. */
export function normaliseVault(raw: unknown): Vault {
  const v = raw as Partial<Vault>;
  if (!v || !Array.isArray(v.people) || !Array.isArray(v.relationships) || !Array.isArray(v.types)) {
    throw new Error('This file doesn’t look like a Heartstrings vault.');
  }
  const { types, seededTypeIds } = seedNewBuiltIns(v.types, v.seededTypeIds);
  const rels = v.relationships.map(
    (r: Partial<Relationship>) => ({ intensity: 3, notes: '', since: '', createdAt: Date.now(), speculative: false, ...r }) as Relationship,
  );
  return {
    version: 1,
    people: v.people.map((p: Partial<Person>) => ({ emoji: '🙂', color: '#ffc6ff', notes: '', isMe: false, ...p }) as Person),
    types,
    seededTypeIds,
    // Older vaults stored partner types as two one-way records; fold them into single bonds.
    relationships: collapseUndirected(rels, undirectedIds(types)),
  };
}
