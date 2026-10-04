import { describe, expect, it } from 'vitest';
import { createKey, seal, unseal, WrongPassphraseError } from '../crypto/vault';
import { normaliseVault, vaultReducer } from '../state/reducer';
import { emptyVault } from './defaults';
import { buildGraph, metamours, neighbourhood } from './graph';
import type { Person, Relationship, Vault } from './types';

const person = (id: string, isMe = false): Person => ({ id, name: `P${id}`, emoji: '🐸', color: '#fff', isMe, notes: '' });
const rel = (id: string, from: string, to: string, typeId: string, intensity = 3): Relationship => ({
  id,
  from,
  to,
  typeId,
  intensity,
  notes: '',
  since: '',
  createdAt: 0,
});

function vaultWith(people: string[], rels: Relationship[]): Vault {
  return { ...emptyVault(), people: people.map((p, i) => person(p, i === 0)), relationships: rels };
}

const opts = { hiddenTypes: new Set<string>(), mergeMutual: true, focusId: null, focusDepth: 1 };

describe('vault crypto', () => {
  it('round-trips and never contains plaintext names', async () => {
    const v = vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'crush')]);
    v.people[0].name = 'Persephone Secretname';
    const vk = await createKey('correct horse battery');
    const sealed = await seal(v, vk);
    expect(JSON.stringify(sealed)).not.toContain('Persephone');
    const { vault } = await unseal(sealed, 'correct horse battery');
    expect(vault).toEqual(v);
  });

  it('rejects the wrong passphrase', async () => {
    const sealed = await seal(emptyVault(), await createKey('right one'));
    await expect(unseal(sealed, 'wrong one')).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('uses a fresh IV per save', async () => {
    const vk = await createKey('pass pass');
    const a = await seal(emptyVault(), vk);
    const b = await seal(emptyVault(), vk);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.ct).not.toBe(b.ct);
  });
});

describe('buildGraph', () => {
  it('merges same-type mutual pairs but keeps one-way links directional', () => {
    const v = vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'friend'), rel('2', 'b', 'a', 'friend'), rel('3', 'a', 'b', 'crush')]);
    const g = buildGraph(v, opts);
    expect(g.links).toHaveLength(2);
    const friend = g.links.find((l) => l.type.id === 'friend')!;
    const crush = g.links.find((l) => l.type.id === 'crush')!;
    expect(friend.mutual).toBe(true);
    expect(friend.rels).toHaveLength(2);
    expect(crush.mutual).toBe(false);
    expect(crush.source).toBe('a');
  });

  it('does not merge when mergeMutual is off', () => {
    const v = vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'friend'), rel('2', 'b', 'a', 'friend')]);
    const g = buildGraph(v, { ...opts, mergeMutual: false });
    expect(g.links).toHaveLength(2);
    // In the canonical a→b frame the two must sit on opposite sides.
    const canon = g.links.map((l) => (l.source === 'a' ? l.curvature : -l.curvature));
    expect(canon[0]).toBeCloseTo(-canon[1]);
    expect(canon[0]).not.toBe(0);
  });

  it('fans parallel links so none share a curve', () => {
    const v = vaultWith(
      ['a', 'b'],
      [rel('1', 'a', 'b', 'friend'), rel('2', 'a', 'b', 'crush'), rel('3', 'b', 'a', 'play'), rel('4', 'a', 'b', 'romantic')],
    );
    const g = buildGraph(v, opts);
    // Express each curvature in the canonical (a→b) frame — all must differ.
    const canon = g.links.map((l) => (l.source === 'a' ? l.curvature : -l.curvature));
    expect(new Set(canon).size).toBe(4);
  });

  it('hides filtered types and drops dangling relationships', () => {
    const v = vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'friend'), rel('2', 'a', 'ghost', 'friend'), rel('3', 'a', 'b', 'crush')]);
    const g = buildGraph(v, { ...opts, hiddenTypes: new Set(['crush']) });
    expect(g.links.map((l) => l.type.id)).toEqual(['friend']);
  });

  it('focus restricts to the neighbourhood', () => {
    const v = vaultWith(['a', 'b', 'c', 'd'], [rel('1', 'a', 'b', 'friend'), rel('2', 'b', 'c', 'friend'), rel('3', 'c', 'd', 'friend')]);
    expect(buildGraph(v, { ...opts, focusId: 'a', focusDepth: 1 }).nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(buildGraph(v, { ...opts, focusId: 'a', focusDepth: 2 }).nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect([...neighbourhood('d', v.relationships, 3)].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('metamours', () => {
  it('finds partners of partners, excluding self and own partners', () => {
    const v = vaultWith(
      ['me', 'p1', 'p2', 'm1', 'f'],
      [
        rel('1', 'me', 'p1', 'romantic'),
        rel('2', 'p2', 'me', 'play'),
        rel('3', 'p1', 'm1', 'romantic'),
        rel('4', 'p1', 'p2', 'romantic'), // p2 is my partner too — not a metamour
        rel('5', 'p1', 'f', 'friend'), // friends don't count
      ],
    );
    expect(metamours('me', v).sort()).toEqual(['m1']);
  });
});

describe('reducer', () => {
  it('keeps exactly one "me"', () => {
    let v = vaultWith(['a'], []);
    v = vaultReducer(v, { type: 'addPerson', person: person('b', true) });
    expect(v.people.filter((p) => p.isMe).map((p) => p.id)).toEqual(['b']);
    v = vaultReducer(v, { type: 'updatePerson', id: 'a', patch: { isMe: true } });
    expect(v.people.filter((p) => p.isMe).map((p) => p.id)).toEqual(['a']);
  });

  it('removing a person removes their relationships', () => {
    let v = vaultWith(['a', 'b', 'c'], [rel('1', 'a', 'b', 'friend'), rel('2', 'b', 'c', 'friend')]);
    v = vaultReducer(v, { type: 'removePerson', id: 'b' });
    expect(v.relationships).toHaveLength(0);
  });

  it('ignores duplicate relationships', () => {
    let v = vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'friend')]);
    v = vaultReducer(v, { type: 'addRelationships', rels: [rel('2', 'a', 'b', 'friend'), rel('3', 'b', 'a', 'friend')] });
    expect(v.relationships.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('normaliseVault rejects junk and fills defaults', () => {
    expect(() => normaliseVault({ nope: true })).toThrow();
    const v = normaliseVault({ people: [{ id: 'x', name: 'X' }], types: [], relationships: [] });
    expect(v.people[0].emoji).toBeTruthy();
  });
});
