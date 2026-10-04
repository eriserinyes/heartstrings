import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphLink, GraphNode } from '../../model/graph';
import Graph2D from './Graph2D';
import type { GraphRenderProps } from './shared';

// three.js is big — only load it when someone actually flips to 3D.
const Graph3D = lazy(() => import('./Graph3D'));

type Props = Omit<GraphRenderProps, 'width' | 'height'> & { mode: '2d' | '3d' };

/**
 * Hosts whichever renderer is active. Node objects are cached by id and
 * handed to both renderers, so the layout carries across a 2D⇄3D switch:
 * 3D picks up the 2D x/y and only has to invent z, and 2D reuses 3D's x/y.
 */
export default function GraphView({ mode, nodes, links, ...rest }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const cache = useRef(new Map<string, GraphNode>());

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ width: Math.round(e.contentRect.width), height: Math.round(e.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stable = useMemo(() => {
    const next = new Map<string, GraphNode>();
    const ns = nodes.map((n) => {
      const prev = cache.current.get(n.id);
      const node = prev ?? n;
      if (prev) {
        prev.person = n.person;
        prev.degree = n.degree;
      }
      const pin = n.person.pin;
      if (pin) {
        node.fx = pin.x;
        node.fy = pin.y;
        node.fz = pin.z;
        if (node.x === undefined) Object.assign(node, { x: pin.x, y: pin.y, z: pin.z });
      } else {
        delete node.fx;
        delete node.fy;
        delete node.fz;
      }
      next.set(n.id, node);
      return node;
    });
    cache.current = next;
    // Links are rebuilt fresh each time (force-graph rewrites source/target
    // into object refs), which is cheap at friend-group scale.
    const ls: GraphLink[] = links.map((l) => ({ ...l }));
    return { nodes: ns, links: ls };
  }, [nodes, links]);

  // Leaving 3D: drop z-pins so 2D isn't fighting phantom constraints.
  useEffect(() => {
    if (mode === '2d') for (const n of cache.current.values()) if (!n.person.pin) delete n.fz;
  }, [mode]);

  const common = { ...rest, nodes: stable.nodes, links: stable.links, ...size };

  return (
    <div ref={box} className={`graph-host graph-${mode}`}>
      {mode === '2d' ? (
        <Graph2D {...common} />
      ) : (
        <Suspense fallback={<div className="graph-loading">✨ unfolding a whole new dimension…</div>}>
          <Graph3D {...common} />
        </Suspense>
      )}
    </div>
  );
}
