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
      // Ignore exact duplicates (same from/to/type) — edit the existing one instead.
      const fresh = a.rels.filter(
        (n) => !v.relationships.some((r) => r.from === n.from && r.to === n.to && r.typeId === n.typeId),
      );
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

/** Light validation for imported/decrypted vaults so a bad file can't crash the UI. */
export function normaliseVault(raw: unknown): Vault {
  const v = raw as Partial<Vault>;
  if (!v || !Array.isArray(v.people) || !Array.isArray(v.relationships) || !Array.isArray(v.types)) {
    throw new Error('This file doesn’t look like a Heartstrings vault.');
  }
  return {
    version: 1,
    people: v.people.map((p: Partial<Person>) => ({ emoji: '🙂', color: '#ffc6ff', notes: '', isMe: false, ...p }) as Person),
    types: v.types,
    relationships: v.relationships.map(
      (r: Partial<Relationship>) => ({ intensity: 3, notes: '', since: '', createdAt: Date.now(), ...r }) as Relationship,
    ),
  };
}
