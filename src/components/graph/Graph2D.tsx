import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { GraphLink, GraphNode } from '../../model/graph';
import type { Id } from '../../model/types';
import { uniqueEdges, untangle, type Pt } from '../../model/untangle';
import {
  activeHighlight,
  arrowTipParam,
  CHARGE_RANGE,
  controlPoint2D,
  gravityForce,
  linkAlpha,
  linkDistance,
  linkMidpoint2D,
  linkPairKey,
  linkParticles,
  linkTooltip,
  nodeRadius,
  nodeVal,
  overlayBadges,
  pointOnLink2D,
  REL_SIZE,
  separationForce,
  viewToShow,
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

/**
 * A bold arrowhead with an outline in the background colour, so it reads
 * against crossing lines, glows and the dotted paper alike.
 */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  tip: { x: number; y: number },
  dir: { x: number; y: number },
  len: number,
  color: string,
  outline: string,
) {
  const half = len * 0.6;
  const bx = tip.x - dir.x * len;
  const by = tip.y - dir.y * len;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(bx - dir.y * half, by + dir.x * half);
  ctx.lineTo(tip.x - dir.x * len * 0.68, tip.y - dir.y * len * 0.68); // notched back = friendlier shape
  ctx.lineTo(bx + dir.y * half, by - dir.x * half);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.2, len * 0.16);
  ctx.strokeStyle = outline;
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
}

/** A little round "?" badge — marks anything speculative. */
function drawQuestion(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, dark: boolean) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = dark ? '#2b2440' : '#ffffff';
  ctx.fill();
  ctx.setLineDash([]);
  ctx.lineWidth = Math.max(1, r * 0.22);
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.font = `700 ${r * 1.45}px "Fredoka", ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText('?', x, y + r * 0.1);
}

/** A round badge holding an emoji or a couple of letters (graph-theory lenses). */
function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, text: string, color: string, dark: boolean) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = dark ? '#2b2440' : '#ffffff';
  ctx.fill();
  ctx.setLineDash([]);
  ctx.lineWidth = Math.max(1, r * 0.22);
  ctx.strokeStyle = color;
  ctx.stroke();
  const emoji = /\p{Extended_Pictographic}/u.test(text);
  ctx.font = emoji
    ? `${r * 1.15}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`
    : `700 ${r * (text.length > 1 ? 1.05 : 1.35)}px "Fredoka", ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + r * 0.08);
}

/** 0→1→0 heartbeat for pulsing lens rings. */
const pulse = () => 0.5 + 0.5 * Math.sin(performance.now() / 260);

export default function Graph2D(props: GraphRenderProps) {
  const { nodes, links, width, height, selectedId, selectedPair, particles, labels, dark, fitSignal, untangleSignal, autoUntangle } = props;
  const { markerScale: ms, labelScale: ls, overlay } = props;
  const fg = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [hoverId, setHoverId] = useState<Id | null>(null);
  const fitted = useRef(false);

  const data = useMemo(() => ({ nodes, links }), [nodes, links]);
  const nameOf = useMemo(() => {
    const m = new Map(nodes.map((n) => [n.id, n.person.name]));
    return (id: Id) => m.get(id) ?? '?';
  }, [nodes]);

  const hl = useMemo(
    () => activeHighlight(hoverId, overlay, selectedId, selectedPair, links),
    [hoverId, overlay, selectedId, selectedPair, links],
  );
  const lensBadges = useMemo(() => overlayBadges(overlay, links), [overlay, links]);

  // Gentler forces than the default: friend groups need room to breathe.
  // Re-applied on every data change (not just on mount) so a mount where the
  // graph wasn't ready yet can't leave d3's cramped defaults in place.
  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    g.d3Force('charge')?.strength(-300).distanceMax(CHARGE_RANGE);
    g.d3Force('link')?.distance(linkDistance);
    g.d3Force('gravity', gravityForce(0.04));
    g.d3Force('separation', separationForce());
  }, [data]);

  useEffect(() => {
    if (fitSignal) fg.current?.zoomToFit(500, 70);
  }, [fitSignal]);

  // ---- Crossing reduction -------------------------------------------------
  // Runs when the simulation comes to rest (once per data change) or on demand.
  // The engine is stopped by then, so nodes we glide to new spots stay put.
  const animating = useRef(false);

  /**
   * After untangling, keep the people who were on screen on screen, without
   * touching the zoom unless we must: do nothing if they're all still visible,
   * otherwise pan just far enough, and zoom out only if panning can't fit them.
   */
  const keepInView = useCallback(
    (ids: Id[]) => {
      const g = fg.current;
      if (!g || !ids.length) return;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const id of ids) {
        const n = byId.get(id);
        if (!n || n.x === undefined || n.y === undefined) continue;
        const r = nodeRadius(n) + 18; // leave room for the name pill too
        minX = Math.min(minX, n.x - r);
        maxX = Math.max(maxX, n.x + r);
        minY = Math.min(minY, n.y - r);
        maxY = Math.max(maxY, n.y + r);
      }
      if (!Number.isFinite(minX)) return;
      const k = g.zoom();
      const c = g.centerAt() as unknown as { x: number; y: number };
      const next = viewToShow({ k, x: c.x, y: c.y }, { minX, minY, maxX, maxY }, width, height);
      if (!next) return;
      if (next.k < k) g.zoom(next.k, 450);
      g.centerAt(next.x, next.y, 450);
    },
    [nodes, width, height],
  );
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

      // Who's on screen right now? Only they get kept in view afterwards.
      const visible: Id[] = [];
      for (const [id, p] of start) {
        const sc = fg.current?.graph2ScreenCoords(p.x, p.y);
        if (sc && sc.x >= 0 && sc.x <= width && sc.y >= 0 && sc.y <= height) visible.push(id);
      }

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
          keepInView(visible);
          onDone?.();
        }
      };
      requestAnimationFrame(step);
    },
    // props.onUntangled is a stable callback from the parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, links, width, height, keepInView],
  );

  // On demand: untangle without reframing (keepInView handles anything pushed offscreen).
  useEffect(() => {
    if (untangleSignal) runUntangle();
  }, [untangleSignal, runUntangle]);

  // Glide to whoever was just selected (the inspector opening shifts the view).
  useEffect(() => {
    const n = selectedId ? nodes.find((x) => x.id === selectedId) : null;
    if (n?.x !== undefined && n.y !== undefined) fg.current?.centerAt(n.x, n.y, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on selection change
  }, [selectedId]);

  const drawNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = nodeRadius(node);
      const p = node.person;
      const dim = hl && !hl.nodes.has(node.id);
      const selected = node.id === selectedId || (selectedPair?.includes(node.id) ?? false);
      ctx.save();
      // Speculative people are a bit see-through, like they're not quite here yet.
      ctx.globalAlpha = (dim ? 0.22 : 1) * (p.speculative ? 0.72 : 1);

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
      if (p.speculative) ctx.setLineDash([2.5, 2.5]);
      ctx.stroke();
      ctx.setLineDash([]);

      const lens = overlay?.nodes.get(node.id);
      if (lens?.ring) {
        const beat = lens.pulse ? pulse() : 0;
        ctx.beginPath();
        ctx.arc(x, y, r + 3.5 + beat * 2, 0, Math.PI * 2);
        ctx.lineWidth = 3.5 + beat * 1.5;
        ctx.strokeStyle = withAlpha(lens.ring, 0.95 - beat * 0.35);
        ctx.stroke();
      }

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
      if (p.speculative) drawQuestion(ctx, x + r * 0.74, y - r * 0.74, r * 0.5 * ms, '#9a6bff', dark);
      if (lens?.badge) drawBadge(ctx, x - r * 0.74, y - r * 0.74, r * 0.5 * ms, lens.badge, lens.ring ?? '#9a6bff', dark);

      // Name labels are drawn later, in the overlay pass, so arrows and badges sit beneath them.
      ctx.restore();
    },
    [hl, overlay, selectedId, selectedPair, dark, ms],
  );

  /** A person's name pill. Drawn last of all so nothing covers a name. */
  const drawLabel = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const p = node.person;
      if (!p.name || node.x === undefined || node.y === undefined) return;
      const x = node.x;
      const y = node.y;
      const r = nodeRadius(node);
      const dim = hl && !hl.nodes.has(node.id);
      ctx.save();
      ctx.globalAlpha = (dim ? 0.22 : 1) * (p.speculative ? 0.72 : 1);
      const fs = Math.max(3.5, 12 / scale) * ls;
      ctx.font = `800 ${fs}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = p.isMe ? `👑 ${p.name}` : p.speculative ? `🔮 ${p.name}` : p.name;
      const w = ctx.measureText(label).width + fs * 1.1;
      const h = fs * 1.55;
      const ly = y + r + 3 + h / 2;
      roundRect(ctx, x - w / 2, ly - h / 2, w, h, h / 2);
      ctx.fillStyle = dark ? 'rgba(30,24,46,0.9)' : 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.fillStyle = dark ? '#f6efff' : '#4a3566';
      ctx.fillText(label, x, ly + fs * 0.05);
      ctx.restore();
    },
    [hl, dark, ls],
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
      const color = overlay?.links.get(linkPairKey(l))?.color ?? l.type.color;
      ctx.lineWidth = l.width + 9;
      ctx.strokeStyle = withAlpha(color, (on ? 0.28 : 0.06) * (l.speculative ? 0.5 : 1));
      ctx.shadowColor = color;
      ctx.shadowBlur = on ? 14 : 0;
      ctx.stroke();
      ctx.restore();
    },
    [hl, overlay],
  );

  // …plus midpoint badges, drawn after everything else so they're never hidden:
  // a heart for bold types, a "?" for anything speculative (tucked beside the
  // heart when a line is both).
  // Overlay pass, in stacking order: arrows → ?/💖 badges → name labels on top.
  const drawBadges = useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      const outline = dark ? '#1c1630' : '#ffffff';
      for (const l of links) {
        const bold = l.type.emphasis === 'bold';
        const oneWay = !l.mutual;
        if (!bold && !l.speculative && !oneWay) continue;
        const s = l.source as GraphNode;
        const t = l.target as GraphNode;
        if (typeof s !== 'object' || s.x === undefined || t.x === undefined) continue;
        const S = { x: s.x, y: s.y! };
        const T = { x: t.x, y: t.y! };
        const m = linkMidpoint2D(S, T, l.curvature);
        const on = !hl || hl.links.has(l.id);

        // One-way: a big arrowhead at the target plus a chevron partway along,
        // so direction reads even where lines bunch up near a busy person.
        if (oneWay) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, linkAlpha(l, on) + 0.15);
          const len = (8 + l.width * 1.4) * ms;
          const tipU = arrowTipParam(S, T, l.curvature, nodeRadius(t) + 2.5);
          const tip = pointOnLink2D(S, T, l.curvature, tipU);
          drawArrow(ctx, tip.p, tip.dir, len, l.type.color, outline);
          // Mid chevron sits before the midpoint when a ? badge lives there.
          const mid = pointOnLink2D(S, T, l.curvature, l.speculative || bold ? 0.32 : 0.5);
          drawArrow(ctx, mid.p, mid.dir, len * 0.7, l.type.color, outline);
          ctx.restore();
          if (!bold && !l.speculative) continue;
        }
        const r = 7.5 * ms;
        ctx.save();
        if (bold) {
          ctx.globalAlpha = (on ? 1 : 0.25) * (l.speculative ? 0.6 : 1);
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
        }
        if (l.speculative) {
          ctx.globalAlpha = on ? 1 : 0.25;
          const q = (bold ? 5.2 : 6.5) * ms;
          drawQuestion(ctx, bold ? m.x + r * 0.85 : m.x, bold ? m.y - r * 0.85 : m.y, q, l.type.color, dark);
        }
        ctx.restore();
      }
      // Graph-theory lens badges ride the line, past the midpoint so they miss 💖/? badges.
      for (const l of links) {
        const badge = lensBadges.get(l.id);
        const s = l.source as GraphNode;
        const t = l.target as GraphNode;
        if (!badge || typeof s !== 'object' || s.x === undefined || t.x === undefined) continue;
        const crowded = l.type.emphasis === 'bold' || l.speculative || !l.mutual;
        const { p } = pointOnLink2D({ x: s.x, y: s.y! }, { x: t.x, y: t.y! }, l.curvature, crowded ? 0.66 : 0.5);
        ctx.save();
        ctx.globalAlpha = !hl || hl.links.has(l.id) ? 1 : 0.25;
        drawBadge(ctx, p.x, p.y, 7.5 * ms, badge, overlay?.links.get(linkPairKey(l))?.color ?? l.type.color, dark);
        ctx.restore();
      }
      if (labels) for (const n of nodes) drawLabel(n, ctx, scale);
    },
    [links, nodes, hl, dark, ms, labels, drawLabel, lensBadges, overlay],
  );

  const paintPointer = useCallback((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, nodeRadius(node) + 2, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const linkOn = (l: GraphLink) => !hl || hl.links.has(l.id);
  const lensColor = (l: GraphLink) => overlay?.links.get(linkPairKey(l))?.color;

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
      linkColor={(l) => withAlpha(lensColor(l) ?? l.type.color, linkAlpha(l, linkOn(l)))}
      // Lens-recoloured lines get a minimum width so their colour reads.
      linkWidth={(l) => (lensColor(l) ? Math.max(l.width, 2.5) : l.width) + (hl?.links.has(l.id) ? 1 : 0)}
      linkCanvasObjectMode={(l) => (l.type.emphasis === 'bold' ? 'before' : undefined)}
      linkCanvasObject={drawGlow}
      onRenderFramePost={drawBadges}
      linkCurvature={(l) => l.curvature}
      linkLineDash={(l) => (l.speculative ? [2.5, 3.5] : l.type.dashed ? [4, 3] : null)}
      linkLabel={(l) => linkTooltip(l, nameOf)}
      // Arrowheads are drawn by drawBadges (bigger, outlined, plus a mid chevron).
      linkDirectionalArrowLength={0}
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

