import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { GraphLink, GraphNode } from '../../model/graph';
import type { Id } from '../../model/types';
import { uniqueEdges, untangle, type Pt } from '../../model/untangle';
import {
  controlPoint2D,
  highlightSets,
  linkAlpha,
  linkDistance,
  linkMidpoint2D,
  linkParticles,
  linkTooltip,
  nodeRadius,
  nodeVal,
  REL_SIZE,
  withAlpha,
  type GraphRenderProps,
} from './shared';

const FONT = '"Nunito", ui-rounded, system-ui, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function Graph2D(props: GraphRenderProps) {
  const { nodes, links, width, height, selectedId, selectedPair, particles, labels, dark, fitSignal, untangleSignal, autoUntangle } = props;
  const fg = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [hoverId, setHoverId] = useState<Id | null>(null);
  const fitted = useRef(false);

  const data = useMemo(() => ({ nodes, links }), [nodes, links]);
  const nameOf = useMemo(() => {
    const m = new Map(nodes.map((n) => [n.id, n.person.name]));
    return (id: Id) => m.get(id) ?? '?';
  }, [nodes]);

  const hl = useMemo(
    () => highlightSets(hoverId ?? selectedId, hoverId ? null : selectedPair, links),
    [hoverId, selectedId, selectedPair, links],
  );

  useEffect(() => {
    // Gentler forces than the default: friend groups need room to breathe.
    fg.current?.d3Force('charge')?.strength(-300);
    fg.current?.d3Force('link')?.distance(linkDistance);
  }, []);

  useEffect(() => {
    if (fitSignal) fg.current?.zoomToFit(500, 70);
  }, [fitSignal]);

  // ---- Crossing reduction -------------------------------------------------
  // Runs when the simulation comes to rest (once per data change) or on demand.
  // The engine is stopped by then, so nodes we glide to new spots stay put.
  const animating = useRef(false);
  const untangledLinks = useRef<GraphLink[] | null>(null);
  const runUntangle = useCallback(
    (onDone?: () => void) => {
      if (animating.current || nodes.length < 4) return onDone?.();
      const start = new Map<Id, Pt>();
      for (const n of nodes) if (n.x !== undefined && n.y !== undefined) start.set(n.id, { x: n.x, y: n.y });
      const edges = uniqueEdges(
        links
          .map((l) => [typeof l.source === 'object' ? l.source.id : l.source, typeof l.target === 'object' ? l.target.id : l.target] as const)
          .filter(([a, b]) => start.has(a) && start.has(b)),
      );
      const movable = new Set(nodes.filter((n) => n.fx === undefined && start.has(n.id)).map((n) => n.id));
      const r = untangle(start, edges, movable, { minGap: 34 });
      if (r.conflictsAfter >= r.conflictsBefore || !r.moved.length) return onDone?.();
      props.onUntangled?.(r.before, r.after);

      // Glide moved nodes to their new spots.
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const tracks = r.moved.map((id) => ({ n: byId.get(id)!, from: start.get(id)!, to: r.positions.get(id)! }));
      animating.current = true;
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 550);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; // easeInOutQuad
        for (const { n, from, to } of tracks) {
          n.x = from.x + (to.x - from.x) * e;
          n.y = from.y + (to.y - from.y) * e;
          n.vx = 0;
          n.vy = 0;
        }
        if (k < 1) requestAnimationFrame(step);
        else {
          animating.current = false;
          onDone?.();
        }
      };
      requestAnimationFrame(step);
    },
    // props.onUntangled is a stable callback from the parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, links],
  );

  useEffect(() => {
    if (untangleSignal) runUntangle(() => fg.current?.zoomToFit(500, 70));
  }, [untangleSignal, runUntangle]);

  // Glide to whoever was just selected (the inspector opening shifts the view).
  useEffect(() => {
    const n = selectedId ? nodes.find((x) => x.id === selectedId) : null;
    if (n?.x !== undefined && n.y !== undefined) fg.current?.centerAt(n.x, n.y, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on selection change
  }, [selectedId]);

  const drawNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = nodeRadius(node);
      const p = node.person;
      const dim = hl && !hl.nodes.has(node.id);
      const selected = node.id === selectedId || (selectedPair?.includes(node.id) ?? false);
      ctx.save();
      ctx.globalAlpha = dim ? 0.22 : 1;

      if (p.isMe) {
        // Warm halo so "you" is always easy to find.
        const g = ctx.createRadialGradient(x, y, r, x, y, r * 1.8);
        g.addColorStop(0, withAlpha('#ffd166', 0.55));
        g.addColorStop(1, withAlpha('#ffd166', 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = dark ? '#2b2440' : '#ffffff';
      ctx.fill();
      ctx.fillStyle = withAlpha(p.color, dark ? 0.55 : 0.6);
      ctx.fill();
      ctx.lineWidth = p.isMe ? 3 : 2;
      ctx.strokeStyle = p.isMe ? '#f4a300' : withAlpha(p.color, 1);
      ctx.stroke();

      if (selected) {
        ctx.beginPath();
        ctx.setLineDash([3, 2.5]);
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = dark ? '#fff' : '#5b3f8c';
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.font = `${r * 1.05}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.emoji, x, y + r * 0.07);

      if (labels && p.name) {
        const fs = Math.max(3.5, 12 / scale);
        ctx.font = `800 ${fs}px ${FONT}`;
        const label = p.isMe ? `👑 ${p.name}` : p.name;
        const w = ctx.measureText(label).width + fs * 1.1;
        const h = fs * 1.55;
        const ly = y + r + 3 + h / 2;
        roundRect(ctx, x - w / 2, ly - h / 2, w, h, h / 2);
        ctx.fillStyle = dark ? 'rgba(30,24,46,0.85)' : 'rgba(255,255,255,0.88)';
        ctx.fill();
        ctx.fillStyle = dark ? '#f6efff' : '#4a3566';
        ctx.fillText(label, x, ly + fs * 0.05);
      }
      ctx.restore();
    },
    [hl, selectedId, selectedPair, labels, dark],
  );

  // Bold types (primary partner) get a soft glow drawn underneath the line…
  const drawGlow = useCallback(
    (l: GraphLink, ctx: CanvasRenderingContext2D) => {
      const s = l.source as GraphNode;
      const t = l.target as GraphNode;
      if (s.x === undefined || t.x === undefined) return;
      const on = !hl || hl.links.has(l.id);
      const cp = controlPoint2D({ x: s.x, y: s.y! }, { x: t.x, y: t.y! }, l.curvature);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(s.x, s.y!);
      if (cp) ctx.quadraticCurveTo(cp.x, cp.y, t.x, t.y!);
      else ctx.lineTo(t.x, t.y!);
      ctx.lineCap = 'round';
      ctx.lineWidth = l.width + 9;
      ctx.strokeStyle = withAlpha(l.type.color, (on ? 0.28 : 0.06) * (l.speculative ? 0.5 : 1));
      ctx.shadowColor = l.type.color;
      ctx.shadowBlur = on ? 14 : 0;
      ctx.stroke();
      ctx.restore();
    },
    [hl],
  );

  // …and a heart badge at the midpoint, drawn after everything else so it's never hidden.
  const drawBadges = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      for (const l of links) {
        if (l.type.emphasis !== 'bold') continue;
        const s = l.source as GraphNode;
        const t = l.target as GraphNode;
        if (typeof s !== 'object' || s.x === undefined || t.x === undefined) continue;
        const m = linkMidpoint2D({ x: s.x, y: s.y! }, { x: t.x, y: t.y! }, l.curvature);
        const r = 7.5;
        ctx.save();
        ctx.globalAlpha = (!hl || hl.links.has(l.id) ? 1 : 0.25) * (l.speculative ? 0.55 : 1);
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.fillStyle = dark ? '#2b2440' : '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = l.type.color;
        ctx.stroke();
        ctx.font = `${r * 1.15}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(l.type.emoji, m.x, m.y + r * 0.08);
        ctx.restore();
      }
    },
    [links, hl, dark],
  );

  const paintPointer = useCallback((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, nodeRadius(node) + 2, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const linkOn = (l: GraphLink) => !hl || hl.links.has(l.id);

  return (
    <ForceGraph2D<GraphNode, GraphLink>
      ref={fg}
      graphData={data}
      width={width}
      height={height}
      backgroundColor="rgba(0,0,0,0)"
      nodeRelSize={REL_SIZE}
      nodeVal={nodeVal}
      nodeLabel={() => ''}
      nodeCanvasObject={drawNode}
      nodePointerAreaPaint={paintPointer}
      linkColor={(l) => withAlpha(l.type.color, linkAlpha(l, linkOn(l)))}
      linkWidth={(l) => (hl?.links.has(l.id) ? l.width + 1 : l.width)}
      linkCanvasObjectMode={(l) => (l.type.emphasis === 'bold' ? 'before' : undefined)}
      linkCanvasObject={drawGlow}
      onRenderFramePost={drawBadges}
      linkCurvature={(l) => l.curvature}
      linkLineDash={(l) => (l.speculative ? [2.5, 3.5] : l.type.dashed ? [4, 3] : null)}
      linkLabel={(l) => linkTooltip(l, nameOf)}
      linkDirectionalArrowLength={(l) => (l.mutual ? 0 : 6 + l.width)}
      linkDirectionalArrowRelPos={1}
      linkDirectionalArrowColor={(l) => withAlpha(l.type.color, Math.min(1, linkAlpha(l, linkOn(l)) + 0.1))}
      linkDirectionalParticles={(l) => (particles && linkOn(l) ? linkParticles(l) : 0)}
      linkDirectionalParticleWidth={(l) => 2 + l.width * 0.6}
      linkDirectionalParticleSpeed={0.006}
      linkDirectionalParticleColor={(l) => l.type.color}
      linkHoverPrecision={6}
      onNodeHover={(n) => setHoverId(n ? n.id : null)}
      onNodeClick={(n, e) => props.onNodeClick(n, e.shiftKey)}
      onLinkClick={(l) => props.onLinkClick(l)}
      onBackgroundClick={props.onBackgroundClick}
      onNodeDragEnd={(n) => {
        n.fx = n.x;
        n.fy = n.y;
        props.onNodeDragEnd(n);
      }}
      cooldownTicks={120}
      onEngineStop={() => {
        const fitOnce = () => {
          if (!fitted.current && nodes.length > 1) {
            fitted.current = true;
            fg.current?.zoomToFit(500, 70);
          }
        };
        if (autoUntangle && untangledLinks.current !== links) {
          untangledLinks.current = links;
          runUntangle(fitOnce);
        } else fitOnce();
      }}
      // Keep drawing while the engine is idle so untangle glides are visible.
      autoPauseRedraw={false}
      minZoom={0.2}
      maxZoom={8}
    />
  );
}

