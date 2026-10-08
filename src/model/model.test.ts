import { describe, expect, it } from 'vitest';
import { createKey, seal, unseal, WrongPassphraseError } from '../crypto/vault';
import { collapseUndirected, normaliseVault, vaultReducer } from '../state/reducer';
import { DEFAULT_TYPES, emptyVault } from './defaults';
import { buildGraph, metamours, type GraphOptions, neighbourhood, visibleVault } from './graph';
import { PERSON_EMOJI_GROUPS, TYPE_EMOJI_GROUPS } from './emoji';
import { gravityForce, MIN_NODE_GAP, nodeRadius, separationForce, viewToShow } from '../components/graph/shared';
import type { GraphNode } from './graph';
import { countCrossings, countOverlaps, nearestDistances, segmentsCross, uniqueEdges, untangle, type Pt } from './untangle';
import type { Person, Relationship, Vault } from './types';

const person = (id: string, isMe = false): Person => ({ id, name: `P${id}`, emoji: '🐸', color: '#fff', isMe, notes: '' });
const rel = (id: string, from: string, to: string, typeId: string, intensity = 3, speculative = false): Relationship => ({
  id,
  from,
  to,
  typeId,
  intensity,
  notes: '',
  since: '',
  createdAt: 0,
  speculative,
});

function vaultWith(people: string[], rels: Relationship[]): Vault {
  return { ...emptyVault(), people: people.map((p, i) => person(p, i === 0)), relationships: rels };
}

const opts: GraphOptions = { hiddenTypes: new Set<string>(), mergeMutual: true, focusId: null, focusDepth: 1 };

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
    const g = buildGraph(v, { ...opts, showSuperseded: true });
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

describe('new built-in types', () => {
  const v1Types = DEFAULT_TYPES.filter((t) => ['friend', 'crush', 'romantic', 'play', 'qpr'].includes(t.id)).map(
    // v1 vaults had no emphasis field
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ emphasis: _e, ...t }) => t,
  );

  it('slots primary, acquaintance & ex into a v1 vault and backfills emphasis', () => {
    const v = normaliseVault({ people: [], relationships: [], types: v1Types });
    expect(v.types.map((t) => t.id)).toEqual(['friend', 'acquaintance', 'crush', 'primary', 'romantic', 'play', 'qpr', 'ex']);
    expect(v.types.find((t) => t.id === 'primary')!.emphasis).toBe('bold');
    expect(v.types.find((t) => t.id === 'friend')!.emphasis).toBe('normal');
    expect(v.seededTypeIds).toContain('primary');
  });

  it('does not resurrect a built-in the user deleted', () => {
    const seeded = normaliseVault({ people: [], relationships: [], types: v1Types });
    const withoutPrimary = { ...seeded, types: seeded.types.filter((t) => t.id !== 'primary') };
    expect(normaliseVault(withoutPrimary).types.some((t) => t.id === 'primary')).toBe(false);
  });

  it('draws bold types thicker and subtle types thinner', () => {
    const v = vaultWith(['a', 'b', 'c', 'd'], [rel('1', 'a', 'b', 'primary'), rel('2', 'a', 'c', 'friend'), rel('3', 'a', 'd', 'acquaintance')]);
    const w = Object.fromEntries(buildGraph(v, opts).links.map((l) => [l.type.id, l.width]));
    expect(w.primary).toBeGreaterThan(w.friend * 1.5);
    expect(w.acquaintance).toBeLessThan(w.friend);
  });

  it('counts primary partners for metamours', () => {
    const v = vaultWith(['me', 'p', 'm'], [rel('1', 'me', 'p', 'primary'), rel('2', 'p', 'm', 'romantic')]);
    expect(metamours('me', v)).toEqual(['m']);
  });
});

describe('speculative layer', () => {
  const v = vaultWith(
    ['a', 'b', 'c'],
    [
      rel('1', 'a', 'b', 'crush'),
      rel('2', 'b', 'a', 'crush', 3, true), // speculative return — must NOT make the real one mutual
      rel('3', 'a', 'c', 'crush', 3, true),
    ],
  );

  it('hidden layer behaves as if it does not exist', () => {
    const g = buildGraph(visibleVault(v, false), opts);
    expect(g.links.map((l) => l.id)).toEqual(['r:1']);
    expect(g.nodes.find((n) => n.id === 'c')!.degree).toBe(0);
  });

  it('shown layer keeps real and speculative links separate', () => {
    const g = buildGraph(visibleVault(v, true), opts);
    expect(g.links).toHaveLength(3);
    expect(g.links.every((l) => !l.mutual)).toBe(true);
    expect(g.links.filter((l) => l.speculative)).toHaveLength(2);
  });

  it('allows the same connection on both layers but no duplicates within one', () => {
    let x = vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'friend')]);
    x = vaultReducer(x, { type: 'addRelationships', rels: [rel('2', 'a', 'b', 'friend', 3, true), rel('3', 'a', 'b', 'friend', 3, true)] });
    expect(x.relationships.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('old relationships default to the real layer', () => {
    const n = normaliseVault({ people: [], types: [], relationships: [{ id: 'r', from: 'a', to: 'b', typeId: 'friend' }] });
    expect(n.relationships[0].speculative).toBe(false);
  });
});

describe('directional vs shared types', () => {
  it('partner types are shared bonds: one arrowless line even when mergeMutual is off', () => {
    const v = vaultWith(['a', 'b'], [rel('1', 'b', 'a', 'primary')]);
    const [l] = buildGraph(v, { ...opts, mergeMutual: false }).links;
    expect(l.mutual).toBe(true);
    expect(l.source).toBe('a'); // canonical orientation
  });

  it('folds old one-way partner records into single bonds on load', () => {
    const v = normaliseVault({
      people: [],
      types: DEFAULT_TYPES,
      relationships: [
        { ...rel('1', 'a', 'b', 'romantic', 2), notes: 'x', since: '2024-05-01' },
        { ...rel('2', 'b', 'a', 'romantic', 5), notes: 'y', since: '2023-01-01' },
        rel('3', 'a', 'c', 'play'), // lone one-way → just becomes mutual
        rel('4', 'a', 'b', 'crush'),
        rel('5', 'b', 'a', 'crush'), // directional: both kept
      ],
    });
    const romantic = v.relationships.filter((r) => r.typeId === 'romantic');
    expect(romantic).toHaveLength(1);
    expect(romantic[0]).toMatchObject({ intensity: 5, since: '2023-01-01', notes: 'x / y' });
    expect(v.relationships.filter((r) => r.typeId === 'play')).toHaveLength(1);
    expect(v.relationships.filter((r) => r.typeId === 'crush')).toHaveLength(2);
  });

  it('keeps real and speculative bonds separate when folding', () => {
    const out = collapseUndirected([rel('1', 'a', 'b', 'romantic'), rel('2', 'b', 'a', 'romantic', 3, true)], new Set(['romantic']));
    expect(out).toHaveLength(2);
  });

  it('rejects a reversed duplicate of a shared bond', () => {
    let v = vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'romantic')]);
    v = vaultReducer(v, { type: 'addRelationships', rels: [rel('2', 'b', 'a', 'romantic')] });
    expect(v.relationships).toHaveLength(1);
  });

  it('flipping a type to one-way splits bonds; flipping back merges them', () => {
    let v = vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'romantic', 4)]);
    const romantic = v.types.find((t) => t.id === 'romantic')!;
    v = vaultReducer(v, { type: 'upsertType', relType: { ...romantic, directed: true } });
    expect(v.relationships.map((r) => `${r.from}>${r.to}:${r.intensity}`).sort()).toEqual(['a>b:4', 'b>a:4']);
    v = vaultReducer(v, { type: 'upsertType', relType: { ...romantic, directed: false } });
    expect(v.relationships).toHaveLength(1);
  });

  it('only crush, friendship, acquaintance and ex are one-way by default', () => {
    expect(DEFAULT_TYPES.filter((t) => t.directed).map((t) => t.id).sort()).toEqual(['acquaintance', 'crush', 'ex', 'friend']);
  });
});

describe('exes', () => {
  it('point from whoever ended it, and a mutual breakup merges', () => {
    const one = buildGraph(vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'ex')]), opts).links;
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ source: 'a', target: 'b', mutual: false });
    expect(one[0].type.arrowVerb).toBe('ended it');
    const both = buildGraph(vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'ex'), rel('2', 'b', 'a', 'ex')]), opts).links;
    expect(both).toHaveLength(1);
    expect(both[0].mutual).toBe(true);
  });

  it('sit alongside everything and are never metamour partners', () => {
    // Back together after a breakup: the romance hides the friendship, never the ex line.
    const v = vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'ex'), rel('2', 'a', 'b', 'friend'), rel('3', 'a', 'b', 'romantic')]);
    expect(buildGraph(v, opts).links.map((l) => l.type.id).sort()).toEqual(['ex', 'romantic']);
    // c dates b, b's ex is a: a is not c's metamour.
    const w = vaultWith(['a', 'b', 'c'], [rel('1', 'a', 'b', 'ex'), rel('2', 'b', 'c', 'romantic')]);
    expect(metamours('c', w)).toEqual([]);
  });
});

describe('superseding', () => {
  const types = (v: Vault, o = opts) => buildGraph(v, o).links.map((l) => l.type.id).sort();

  it('climbs the ladder: acquaintance < friendship < relationship < primary', () => {
    const r = [rel('1', 'a', 'b', 'acquaintance'), rel('2', 'a', 'b', 'friend')];
    expect(types(vaultWith(['a', 'b'], r))).toEqual(['friend']);
    r.push(rel('3', 'a', 'b', 'crush'), rel('4', 'b', 'a', 'qpr'));
    expect(types(vaultWith(['a', 'b'], r))).toEqual(['qpr']);
    r.push(rel('5', 'a', 'b', 'primary'));
    expect(types(vaultWith(['a', 'b'], r))).toEqual(['primary']);
    expect(types(vaultWith(['a', 'b'], r), { ...opts, showSuperseded: true })).toHaveLength(5);
  });

  it('keeps parallel types: friends with a crush, play partners in parallel', () => {
    const v = vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'friend'), rel('2', 'a', 'b', 'crush'), rel('3', 'a', 'b', 'play'), rel('4', 'a', 'b', 'romantic')]);
    expect(types(v)).toEqual(['play', 'romantic']);
    expect(types(vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'friend'), rel('2', 'a', 'b', 'crush')]))).toEqual(['crush', 'friend']);
  });

  it('one-way types only outrank the same direction', () => {
    // a calls b a friend; b sees a as an acquaintance. Both are real and both show.
    const v = vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'friend'), rel('2', 'b', 'a', 'acquaintance'), rel('3', 'a', 'b', 'acquaintance')]);
    expect(buildGraph(v, { ...opts, mergeMutual: false }).links.map((l) => l.id).sort()).toEqual(['r:1', 'r:2']);
  });

  it('a what-if never hides something real, but real hides what-ifs', () => {
    const spec = vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'friend'), rel('2', 'a', 'b', 'romantic', 3, true)]);
    expect(types(spec)).toEqual(['friend', 'romantic']);
    const real = vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'crush', 3, true), rel('2', 'a', 'b', 'romantic')]);
    expect(types(real)).toEqual(['romantic']);
  });

  it('hiding the bigger type brings back what it covered', () => {
    const v = vaultWith(['a', 'b'], [rel('1', 'a', 'b', 'friend'), rel('2', 'a', 'b', 'romantic')]);
    expect(types(v, { ...opts, hiddenTypes: new Set(['romantic']) })).toEqual(['friend']);
  });

  it('two types can never outrank each other, and deleting a type drops it from the lists', () => {
    let v = vaultWith([], []);
    const acq = v.types.find((t) => t.id === 'acquaintance')!;
    v = vaultReducer(v, { type: 'upsertType', relType: { ...acq, supersedes: ['friend'] } });
    expect(v.types.find((t) => t.id === 'friend')!.supersedes).not.toContain('acquaintance');
    v = vaultReducer(v, { type: 'removeType', id: 'crush' });
    expect(v.types.some((t) => t.supersedes?.includes('crush'))).toBe(false);
  });

  it('backfills the default ladder into older vaults', () => {
    const old = DEFAULT_TYPES.map(({ supersedes: _s, ...t }) => t);
    const v = normaliseVault({ people: [], relationships: [], types: old });
    expect(v.types.find((t) => t.id === 'primary')!.supersedes).toContain('romantic');
    expect(v.types.find((t) => t.id === 'ex')!.supersedes).toEqual([]);
  });
});

describe('untangle', () => {
  const P = (x: number, y: number): Pt => ({ x, y });

  it('detects proper crossings only', () => {
    expect(segmentsCross(P(0, 0), P(10, 10), P(0, 10), P(10, 0))).toBe(true);
    expect(segmentsCross(P(0, 0), P(10, 0), P(0, 5), P(10, 5))).toBe(false);
    expect(segmentsCross(P(0, 0), P(10, 0), P(10, 0), P(10, 10))).toBe(false); // shared endpoint
  });

  it('dedupes parallel and reversed links', () => {
    expect(uniqueEdges([['a', 'b'], ['b', 'a'], ['a', 'b'], ['a', 'a']])).toEqual([['a', 'b']]);
  });

  it('uncrosses a twisted square', () => {
    // Cycle a-b-c-d drawn as a bow-tie: a-b and c-d cross.
    const pos = new Map([['a', P(0, 0)], ['b', P(100, 100)], ['c', P(100, 0)], ['d', P(0, 100)]]);
    const edges = uniqueEdges([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']]);
    expect(countCrossings(pos, edges)).toBe(1);
    const r = untangle(pos, edges, new Set(['a', 'b', 'c', 'd']), { maxMs: 1000, random: () => 0 });
    expect(r.after).toBe(0);
  });

  it('moves a person off a line that runs through them', () => {
    // c sits on the a–b line; c is connected to d off to the side.
    const pos = new Map([['a', P(0, 0)], ['b', P(200, 0)], ['c', P(100, 2)], ['d', P(100, 150)]]);
    const edges = uniqueEdges([['a', 'b'], ['c', 'd']]);
    expect(countOverlaps(pos, edges, 15)).toBe(1);
    const r = untangle(pos, edges, new Set(['c']), { maxMs: 1000, minGap: 30, random: () => 0 });
    expect(countOverlaps(r.positions, edges, 15)).toBe(0);
  });

  it('never moves pinned nodes and never makes things worse', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ids = Array.from({ length: 14 }, (_, i) => `n${i}`);
    const pos = new Map(ids.map((id) => [id, P(random() * 400, random() * 400)]));
    const pairs: [string, string][] = [];
    for (let i = 0; i < 26; i++) pairs.push([ids[Math.floor(random() * 14)], ids[Math.floor(random() * 14)]]);
    const edges = uniqueEdges(pairs);
    const movable = new Set(ids.slice(2)); // n0, n1 pinned
    const r = untangle(pos, edges, movable, { maxMs: 2000, random });
    expect(r.after).toBeLessThanOrEqual(r.before);
    expect(r.conflictsAfter).toBeLessThanOrEqual(r.conflictsBefore);
    expect(r.positions.get('n0')).toEqual(pos.get('n0'));
    expect(r.positions.get('n1')).toEqual(pos.get('n1'));
    expect(r.moved.every((id) => movable.has(id))).toBe(true);
  });
  it("doesn't fling people out or squash them together to dodge crossings", () => {
    let seed = 11;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ids = Array.from({ length: 18 }, (_, i) => `n${i}`);
    // Roughly evenly spaced grid, densely and randomly linked: many unavoidable crossings.
    const pos = new Map(ids.map((id, i) => [id, P((i % 5) * 100 + random() * 20, Math.floor(i / 5) * 100 + random() * 20)]));
    const pairs: [string, string][] = [];
    for (let i = 0; i < 40; i++) pairs.push([ids[Math.floor(random() * 18)], ids[Math.floor(random() * 18)]]);
    const edges = uniqueEdges(pairs);
    const lengths = (m: ReadonlyMap<string, Pt>) =>
      edges.map(([a, b]) => Math.hypot(m.get(a)!.x - m.get(b)!.x, m.get(a)!.y - m.get(b)!.y)).sort((x, y) => x - y);
    const before = lengths(pos);
    const r = untangle(pos, edges, new Set(ids), { maxMs: 2000, minGap: 34, random });
    expect(r.moved.length).toBeGreaterThan(0);
    const cap = Math.max(2.5 * before[before.length >> 1], before[before.length - 1]);
    expect(Math.max(...lengths(r.positions))).toBeLessThanOrEqual(cap + 1e-6);
    // Relocations keep ~the layout's own spacing, not just the 34px floor.
    expect(Math.min(...nearestDistances(r.positions))).toBeGreaterThan(60);
  });

  it('treats people as bubbles: lines must clear the whole bubble', () => {
    // The a–b line passes 22px from c's centre: clear of a point, but through a 20px bubble.
    const pos = new Map([['a', P(0, 0)], ['b', P(300, 0)], ['c', P(150, 22)], ['d', P(150, 200)]]);
    const edges = uniqueEdges([['a', 'b'], ['c', 'd']]);
    const radii = new Map([['a', 12], ['b', 12], ['c', 20], ['d', 12]]);
    const clear = (id: string) => radii.get(id)! + 14;
    expect(countOverlaps(pos, edges, 15)).toBe(0);
    expect(countOverlaps(pos, edges, clear)).toBe(1);
    const r = untangle(pos, edges, new Set(['c']), { maxMs: 1000, minGap: 28, radii, random: () => 0 });
    expect(countOverlaps(r.positions, edges, clear)).toBe(0);
  });

  it('never leaves bubbles overlapping after swaps and relocations', () => {
    let seed = 23;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ids = Array.from({ length: 16 }, (_, i) => `n${i}`);
    const radii = new Map(ids.map((id, i) => [id, i % 4 === 0 ? 24 : 10])); // a few big bubbles
    const pos = new Map(ids.map((id, i) => [id, P((i % 4) * 110 + random() * 10, Math.floor(i / 4) * 110 + random() * 10)]));
    const pairs: [string, string][] = [];
    for (let i = 0; i < 32; i++) pairs.push([ids[Math.floor(random() * 16)], ids[Math.floor(random() * 16)]]);
    const r = untangle(pos, uniqueEdges(pairs), new Set(ids), { maxMs: 2000, minGap: 28, radii, random });
    for (const a of ids)
      for (const b of ids) {
        if (a >= b) continue;
        const pa = r.positions.get(a)!;
        const pb = r.positions.get(b)!;
        expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeGreaterThanOrEqual(radii.get(a)! + radii.get(b)! + 14);
      }
  });
});

describe('layout forces', () => {
  const node = (id: string, x: number, y: number): GraphNode & { vx: number; vy: number } =>
    ({ id, person: person(id), degree: 0, x, y, vx: 0, vy: 0 }) as GraphNode & { vx: number; vy: number };
  const step = (ns: ReturnType<typeof node>[], forces: ((a: number) => void)[], ticks: number) => {
    for (let t = 0; t < ticks; t++) {
      for (const f of forces) f(0.5);
      for (const n of ns) {
        n.vx *= 0.6; // d3's velocity decay
        n.vy *= 0.6;
        n.x! += n.vx;
        n.y! += n.vy;
      }
    }
  };

  it('pulls a far-flung loner back toward the group', () => {
    const loner = node('a', 3000, -2000);
    const g = gravityForce(0.04);
    g.initialize([loner]);
    step([loner], [g], 200);
    expect(Math.hypot(loner.x!, loner.y!)).toBeLessThan(100);
  });

  it('pushes overlapping (even coincident) people apart to the minimum gap', () => {
    const ns = [node('a', 0, 0), node('b', 0, 0), node('c', 5, 3)];
    const s = separationForce();
    s.initialize(ns);
    step(ns, [s], 200);
    const min = 2 * nodeRadius(ns[0]) + MIN_NODE_GAP;
    for (let i = 0; i < ns.length; i++)
      for (let j = i + 1; j < ns.length; j++)
        expect(Math.hypot(ns[i].x! - ns[j].x!, ns[i].y! - ns[j].y!)).toBeGreaterThan(min - 1);
    expect(ns.every((n) => Number.isFinite(n.x) && Math.abs(n.x!) < 200)).toBe(true);
  });
});

describe('speculative people', () => {
  const v = (): Vault => {
    const base = vaultWith(['me', 'a', 'maybe'], [rel('1', 'me', 'a', 'friend'), rel('2', 'me', 'maybe', 'crush'), rel('3', 'a', 'maybe', 'romantic')]);
    base.people[2].speculative = true;
    return base;
  };

  it('hiding the layer removes the person and every connection they have', () => {
    const shown = visibleVault(v(), false);
    expect(shown.people.map((p) => p.id)).toEqual(['me', 'a']);
    expect(shown.relationships.map((r) => r.id)).toEqual(['1']);
    expect(metamours('me', shown)).toEqual([]);
  });

  it('connections to a speculative person draw as speculative, without changing their stored layer', () => {
    const g = buildGraph(visibleVault(v(), true), opts);
    const spec = Object.fromEntries(g.links.map((l) => [l.rels[0].id, l.speculative]));
    expect(spec).toEqual({ '1': false, '2': true, '3': true });
    expect(v().relationships.every((r) => !r.speculative)).toBe(true); // so making them real promotes these
  });

  it('"me" can never be speculative', () => {
    let x = v();
    x = vaultReducer(x, { type: 'updatePerson', id: 'maybe', patch: { isMe: true } });
    expect(x.people.find((p) => p.id === 'maybe')).toMatchObject({ isMe: true, speculative: false });
    x = vaultReducer(x, { type: 'addPerson', person: { ...person('z', true), speculative: true } });
    expect(x.people.find((p) => p.id === 'z')!.speculative).toBe(false);
  });
});

describe('emoji palettes', () => {
  const seg = (s: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].length;

  it.each([...PERSON_EMOJI_GROUPS, ...TYPE_EMOJI_GROUPS])('$label: single emoji, no duplicates', (g) => {
    expect(g.emoji.length).toBeGreaterThan(10);
    expect(new Set(g.emoji).size).toBe(g.emoji.length);
    for (const e of g.emoji) expect(seg(e)).toBe(1);
  });

  it('every built-in type emoji is offered in the type picker', () => {
    const all = new Set(TYPE_EMOJI_GROUPS.flatMap((g) => g.emoji));
    for (const t of DEFAULT_TYPES) expect(all.has(t.emoji)).toBe(true);
  });
});

describe('viewToShow (keep people in view after untangling)', () => {
  const view = { k: 2, x: 0, y: 0 }; // 800×600 canvas → visible graph box ±188 × ±138 after 24px padding

  it('leaves the view alone when everyone is still visible', () => {
    expect(viewToShow(view, { minX: -100, minY: -100, maxX: 100, maxY: 100 }, 800, 600)).toBeNull();
  });

  it('pans just enough without zooming when the box fits at this zoom', () => {
    const next = viewToShow(view, { minX: 100, minY: -50, maxX: 250, maxY: 50 }, 800, 600)!;
    expect(next.k).toBe(2);
    expect(next.x).toBeCloseTo(250 - 188);
    expect(next.y).toBe(0);
  });

  it('zooms out only as far as needed when the box is too big', () => {
    const next = viewToShow(view, { minX: -300, minY: -50, maxX: 300, maxY: 50 }, 800, 600)!;
    expect(next.k).toBeCloseTo(752 / 600);
    expect(next.k).toBeLessThan(2);
  });

  it('never zooms in', () => {
    const next = viewToShow({ k: 0.5, x: 0, y: 0 }, { minX: 1000, minY: 0, maxX: 1010, maxY: 10 }, 800, 600)!;
    expect(next.k).toBe(0.5);
  });
});
