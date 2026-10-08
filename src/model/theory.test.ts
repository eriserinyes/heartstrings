import { describe, expect, it } from 'vitest';
import { pairKey } from './graph';
import { bipartition, edgeColouring, fragility, maxMatching, simpleGraph, type SimpleGraph } from './theory';

/** "a-b c-d:4" → edges (weight defaults to 3). */
const G = (spec: string): SimpleGraph =>
  simpleGraph(
    spec
      .split(/\s+/)
      .filter(Boolean)
      .map((e) => {
        const [pair, w] = e.split(':');
        const [a, b] = pair.split('-');
        return { a, b, w: w ? Number(w) : 3 };
      }),
  );

const cycle = (n: number) =>
  G(
    Array.from({ length: n }, (_, i) => `${String.fromCharCode(97 + i)}-${String.fromCharCode(97 + ((i + 1) % n))}`).join(' '),
  );

function validColouring(g: SimpleGraph, night: Map<string, number>) {
  for (const n of g.nodes) {
    const seen = new Set<number>();
    for (const m of g.adj.get(n)!.keys()) {
      const c = night.get(pairKey(n, m));
      expect(c).toBeDefined();
      expect(seen.has(c!)).toBe(false);
      seen.add(c!);
    }
  }
}

describe('simpleGraph', () => {
  it('collapses repeated edges, keeping the strongest ♥', () => {
    const g = simpleGraph([
      { a: 'a', b: 'b', w: 2 },
      { a: 'b', b: 'a', w: 5 },
      { a: 'a', b: 'a', w: 1 },
    ]);
    expect(g.nodes).toEqual(['a', 'b']);
    expect(g.adj.get('a')!.get('b')).toBe(5);
    expect(g.adj.get('a')!.has('a')).toBe(false);
  });
});

describe('maxMatching (💌 Valentine)', () => {
  it('finds a perfect matching on a path of four, not the greedy middle pair', () => {
    // Greedy-by-weight would grab the heavy b-c and strand a and d.
    const m = maxMatching(G('a-b:1 b-c:5 c-d:1'));
    expect(m.pairs).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(m.perfect).toBe(true);
    expect(m.exact).toBe(true);
  });

  it('leaves exactly one third wheel in a triad, preferring the most ♥', () => {
    const m = maxMatching(G('a-b:2 b-c:5 a-c:3'));
    expect(m.pairs).toEqual([['b', 'c']]);
    expect(m.unmatched).toEqual(['a']);
    expect(m.perfect).toBe(false);
  });

  it('a V (one hinge, two partners) strands one partner', () => {
    const m = maxMatching(G('me-x me-y'));
    expect(m.pairs).toHaveLength(1);
    expect(m.unmatched).toHaveLength(1);
  });

  it('handles separate polycules independently', () => {
    const m = maxMatching(G('a-b c-d d-e'));
    expect(m.pairs).toHaveLength(2);
    expect(m.unmatched).toHaveLength(1);
  });
});

describe('edgeColouring (📅 date nights)', () => {
  it('an even cycle is Class 1: two nights', () => {
    const g = cycle(4);
    const c = edgeColouring(g);
    expect(c.nights).toBe(2);
    expect(c.maxDegree).toBe(2);
    expect(c.exact).toBe(true);
    validColouring(g, c.night);
  });

  it('a triad is Class 2: three nights for two partners each', () => {
    const g = G('a-b b-c a-c');
    const c = edgeColouring(g);
    expect(c.maxDegree).toBe(2);
    expect(c.nights).toBe(3);
    expect(c.exact).toBe(true);
    validColouring(g, c.night);
  });

  it('a star needs as many nights as its centre has partners', () => {
    const g = G('h-a h-b h-c h-d');
    const c = edgeColouring(g);
    expect(c.nights).toBe(4);
    expect(c.busiest).toBe('h');
    validColouring(g, c.night);
  });

  it('the Petersen graph is famously Class 2', () => {
    const outer = 'a-b b-c c-d d-e e-a';
    const inner = 'f-h h-j j-g g-i i-f';
    const spokes = 'a-f b-g c-h d-i e-j';
    const g = G(`${outer} ${inner} ${spokes}`);
    const c = edgeColouring(g);
    expect(c.maxDegree).toBe(3);
    expect(c.nights).toBe(4);
    expect(c.exact).toBe(true);
    validColouring(g, c.night);
  });

  it('copes with no edges', () => {
    expect(edgeColouring(G('')).nights).toBe(0);
  });
});

describe('bipartition (🔺 love triangles)', () => {
  it('two-colours an even cycle so every edge crosses', () => {
    const g = cycle(6);
    const b = bipartition(g);
    expect(b.bipartite).toBe(true);
    expect(b.oddCycle).toBeNull();
    for (const [a, m] of g.adj) for (const n of m.keys()) expect(b.side.get(a)).not.toBe(b.side.get(n));
  });

  it('finds the smallest odd cycle, not a bigger one', () => {
    // A pentagon a..e with a triangle x-y-z hanging off it.
    const b = bipartition(G('a-b b-c c-d d-e e-a e-x x-y y-z z-x'));
    expect(b.bipartite).toBe(false);
    expect([...b.oddCycle!].sort()).toEqual(['x', 'y', 'z']);
  });

  it('returns a real cycle in order', () => {
    const g = cycle(5);
    const c = bipartition(g).oddCycle!;
    expect(c).toHaveLength(5);
    for (let i = 0; i < c.length; i++) expect(g.adj.get(c[i])!.has(c[(i + 1) % c.length])).toBe(true);
  });
});

describe('fragility (🧱 load-bearing)', () => {
  it('finds the bridge and hinges of a barbell', () => {
    // Two triads joined by c-d.
    const f = fragility(G('a-b b-c c-a c-d d-e e-f f-d'));
    expect(f.bridges).toEqual([{ a: 'c', b: 'd', sizes: [3, 3] }]);
    expect(f.hinges.map((h) => h.id)).toEqual(['c', 'd']);
    expect(f.hinges.every((h) => h.pieces === 2)).toBe(true);
  });

  it('a star centre splits into as many pieces as it has partners', () => {
    const f = fragility(G('h-a h-b h-c'));
    expect(f.bridges).toHaveLength(3);
    expect(f.hinges).toEqual([{ id: 'h', pieces: 3 }]);
  });

  it('a cycle has no single point of failure', () => {
    const f = fragility(cycle(5));
    expect(f.bridges).toEqual([]);
    expect(f.hinges).toEqual([]);
  });

  it('measures each half of a bridge within its own polycule only', () => {
    const f = fragility(G('a-b b-c x-y y-z z-x'));
    expect(f.bridges).toEqual([
      { a: 'a', b: 'b', sizes: [1, 2] },
      { a: 'b', b: 'c', sizes: [2, 1] },
    ]);
  });
});
