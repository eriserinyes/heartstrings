import { DEFAULT_TYPES, V1_TYPE_IDS } from '../model/defaults';
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
      return { ...v, people: [...people, a.person] };
    }
    case 'updatePerson':
      return {
        ...v,
        people: v.people.map((p) =>
          p.id === a.id ? { ...p, ...a.patch } : a.patch.isMe && p.isMe ? { ...p, isMe: false } : p,
        ),
      };
    case 'removePerson':
      return {
        ...v,
        people: v.people.filter((p) => p.id !== a.id),
        relationships: v.relationships.filter((r) => r.from !== a.id && r.to !== a.id),
      };
    case 'addRelationships': {
      // Ignore exact duplicates (same from/to/type/layer) — edit the existing one instead.
      const same = (r: Relationship, n: Relationship) =>
        r.from === n.from && r.to === n.to && r.typeId === n.typeId && !!r.speculative === !!n.speculative;
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
      const exists = v.types.some((t) => t.id === a.relType.id);
      return {
        ...v,
        types: exists ? v.types.map((t) => (t.id === a.relType.id ? a.relType : t)) : [...v.types, a.relType],
      };
    }
    case 'removeType':
      return {
        ...v,
        types: v.types.filter((t) => t.id !== a.id),
        relationships: v.relationships.filter((r) => r.typeId !== a.id),
      };
    case 'pinAll':
      return { ...v, people: v.people.map((p) => (a.pins[p.id] ? { ...p, pin: a.pins[p.id] } : p)) };
    case 'clearPins':
      return { ...v, people: v.people.map(({ pin: _pin, ...p }) => p) };
  }
}

/** Where a newly-introduced built-in should slot into an existing type list. */
const PLACEMENT: Record<Id, { after?: Id; before?: Id }> = {
  acquaintance: { after: 'friend' },
  primary: { before: 'romantic' },
};

/**
 * Add built-in types the vault has never been offered (e.g. ones shipped
 * after it was created), and backfill fields added since. Built-ins the user
 * deleted stay deleted, because they're already in seededTypeIds.
 */
function seedNewBuiltIns(rawTypes: RelationshipType[], seeded: Id[] = V1_TYPE_IDS) {
  const byId = new Map(DEFAULT_TYPES.map((t) => [t.id, t]));
  const types = rawTypes.map((t) => ({ ...t, emphasis: t.emphasis ?? byId.get(t.id)?.emphasis ?? 'normal' }));
  for (const d of DEFAULT_TYPES) {
    if (seeded.includes(d.id) || types.some((t) => t.id === d.id)) continue;
    const place = PLACEMENT[d.id] ?? {};
    const anchor = types.findIndex((t) => t.id === (place.after ?? place.before));
    const at = anchor < 0 ? types.length : place.after ? anchor + 1 : anchor;
    types.splice(at, 0, { ...d });
  }
  return { types, seededTypeIds: [...new Set([...seeded, ...DEFAULT_TYPES.map((t) => t.id)])] };
}

/** Light validation for imported/decrypted vaults so a bad file can't crash the UI. */
export function normaliseVault(raw: unknown): Vault {
  const v = raw as Partial<Vault>;
  if (!v || !Array.isArray(v.people) || !Array.isArray(v.relationships) || !Array.isArray(v.types)) {
    throw new Error('This file doesn’t look like a Heartstrings vault.');
  }
  return {
    version: 1,
    people: v.people.map((p: Partial<Person>) => ({ emoji: '🙂', color: '#ffc6ff', notes: '', isMe: false, ...p }) as Person),
    ...seedNewBuiltIns(v.types, v.seededTypeIds),
    relationships: v.relationships.map(
      (r: Partial<Relationship>) => ({ intensity: 3, notes: '', since: '', createdAt: Date.now(), speculative: false, ...r }) as Relationship,
    ),
  };
}
