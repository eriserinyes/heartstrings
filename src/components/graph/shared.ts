import { pairKey, type GraphLink, type GraphNode } from '../../model/graph';
import type { Id } from '../../model/types';

export interface GraphRenderProps {
  nodes: GraphNode[];
  links: GraphLink[];
  width: number;
  height: number;
  selectedId: Id | null;
  selectedPair: [Id, Id] | null;
  particles: boolean;
  labels: boolean;
  dark: boolean;
  /** Bump to ask the view to zoom-to-fit. */
  fitSignal: number;
  /** Bump to ask the 2D view to untangle crossings now. */
  untangleSignal: number;
  /** Untangle automatically whenever the layout settles after a change (2D). */
  autoUntangle: boolean;
  onUntangled?: (before: number, after: number) => void;
  /** Size multipliers from Settings → Display. */
  markerScale: number;
  /** An active ✨ Graph Theory lens, if any. */
  overlay: Overlay | null;
  labelScale: number;
  onNodeClick: (node: GraphNode, shift: boolean) => void;
  onLinkClick: (link: GraphLink) => void;
  onBackgroundClick: () => void;
  onNodeDragEnd: (node: GraphNode) => void;
}

export const endId = (e: Id | GraphNode): Id => (typeof e === 'object' ? e.id : e);

export function nodeRadius(n: GraphNode): number {
  return 9 + Math.min(n.degree, 12) * 0.7 + (n.person.isMe ? 4 : 0);
}

/** Node val such that force-graph's internal radius (relSize·√val) matches nodeRadius. */
export const REL_SIZE = 4;
export const nodeVal = (n: GraphNode) => (nodeRadius(n) / REL_SIZE) ** 2;

/**
 * A graph-theory lens painted over the map. Anything not listed is dimmed;
 * listed things can be recoloured, ringed and badged.
 */
export interface Overlay {
  nodes: Map<Id, { ring?: string; badge?: string; pulse?: boolean }>;
  /** Keyed by pairKey: every line between the two people is marked alike. */
  links: Map<string, { color?: string; badge?: string }>;
}

export const linkPairKey = (l: GraphLink) => pairKey(endId(l.source), endId(l.target));

/** The highlight set an overlay implies (people at either end of a marked line count too). */
export function overlayHighlight(o: Overlay, links: GraphLink[]): { nodes: Set<Id>; links: Set<string> } {
  const nodes = new Set(o.nodes.keys());
  const ls = new Set<string>();
  for (const l of links) {
    if (!o.links.has(linkPairKey(l))) continue;
    ls.add(l.id);
    nodes.add(endId(l.source)).add(endId(l.target));
  }
  return { nodes, links: ls };
}

/** Which single link per marked pair carries the overlay badge (so parallel lines don't repeat it). */
export function overlayBadges(o: Overlay | null, links: GraphLink[]): Map<string, string> {
  const out = new Map<string, string>();
  if (!o) return out;
  const done = new Set<string>();
  for (const l of links) {
    const k = linkPairKey(l);
    const badge = o.links.get(k)?.badge;
    if (!badge || done.has(k)) continue;
    done.add(k);
    out.set(l.id, badge);
  }
  return out;
}

/** Hover wins, then an active lens, then the selection. */
export function activeHighlight(
  hoverId: Id | null,
  overlay: Overlay | null,
  selectedId: Id | null,
  selectedPair: [Id, Id] | null,
  links: GraphLink[],
) {
  if (hoverId) return highlightSets(hoverId, null, links);
  if (overlay) return overlayHighlight(overlay, links);
  return highlightSets(selectedId, selectedPair, links);
}

/**
 * Which nodes/links to emphasise. Hover wins over selection; a selected pair
 * highlights just the two people and every link between them.
 */
export function highlightSets(
  focusNode: Id | null,
  pair: [Id, Id] | null,
  links: GraphLink[],
): { nodes: Set<Id>; links: Set<string> } | null {
  if (focusNode) {
    const nodes = new Set<Id>([focusNode]);
    const ls = new Set<string>();
    for (const l of links) {
      const s = endId(l.source);
      const t = endId(l.target);
      if (s === focusNode || t === focusNode) {
        nodes.add(s).add(t);
        ls.add(l.id);
      }
    }
    return { nodes, links: ls };
  }
  if (pair) {
    const [a, b] = pair;
    const ls = new Set<string>();
    for (const l of links) {
      const s = endId(l.source);
      const t = endId(l.target);
      if ((s === a && t === b) || (s === b && t === a)) ls.add(l.id);
    }
    return { nodes: new Set([a, b]), links: ls };
  }
  return null;
}

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function linkTooltip(l: GraphLink, nameOf: (id: Id) => string): string {
  const s = nameOf(endId(l.source));
  const t = nameOf(endId(l.target));
  const arrow = !l.type.directed ? '&' : l.mutual ? '⇄' : '→';
  const spec = l.speculative ? '<div class="tip-spec">🔮 speculative</div>' : '';
  return `<div class="tip">${spec}<b>${l.type.emoji} ${l.type.label}</b><br/>${escapeHtml(s)} ${arrow} ${escapeHtml(t)}</div>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

type XY = { x: number; y: number };

/**
 * Quadratic control point for a 2D curved link — mirrors force-graph's own
 * formula so our decorations sit exactly on the drawn line. Null = straight.
 */
export function controlPoint2D(s: XY, t: XY, curvature: number): XY | null {
  if (!curvature) return null;
  const l = Math.hypot(t.x - s.x, t.y - s.y);
  if (!l) return null;
  const a = Math.atan2(t.y - s.y, t.x - s.x);
  const d = l * curvature;
  return { x: (s.x + t.x) / 2 + d * Math.cos(a - Math.PI / 2), y: (s.y + t.y) / 2 + d * Math.sin(a - Math.PI / 2) };
}

/** Midpoint of a (possibly curved) 2D link. */
export function linkMidpoint2D(s: XY, t: XY, curvature: number): XY {
  const cp = controlPoint2D(s, t, curvature);
  if (!cp) return { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };
  return { x: 0.25 * s.x + 0.5 * cp.x + 0.25 * t.x, y: 0.25 * s.y + 0.5 * cp.y + 0.25 * t.y };
}

/** Base line opacity: speculative links are ghostly, subtle types faint. */
export function linkAlpha(l: GraphLink, highlighted: boolean): number {
  if (!highlighted) return l.type.emphasis === 'bold' ? 0.22 : 0.1;
  const base = l.type.emphasis === 'subtle' ? 0.5 : l.type.emphasis === 'bold' ? 1 : 0.9;
  return l.speculative ? base * 0.7 : base;
}

export function linkParticles(l: GraphLink): number {
  if (l.mutual || l.type.emphasis === 'subtle') return 0;
  if (l.speculative) return 1;
  return l.type.emphasis === 'bold' ? 3 : 2;
}

export function linkDistance(l: GraphLink): number {
  const base = l.type.emphasis === 'bold' ? 65 : l.type.emphasis === 'subtle' ? 150 : 100;
  return l.mutual ? base * 0.85 : base;
}

/** Point and unit tangent at parameter u along a (possibly curved) 2D link. */
export function pointOnLink2D(s: XY, t: XY, curvature: number, u: number): { p: XY; dir: XY } {
  const c = controlPoint2D(s, t, curvature) ?? { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };
  const a = 1 - u;
  const p = { x: a * a * s.x + 2 * a * u * c.x + u * u * t.x, y: a * a * s.y + 2 * a * u * c.y + u * u * t.y };
  const dx = 2 * a * (c.x - s.x) + 2 * u * (t.x - c.x);
  const dy = 2 * a * (c.y - s.y) + 2 * u * (t.y - c.y);
  const len = Math.hypot(dx, dy) || 1;
  return { p, dir: { x: dx / len, y: dy / len } };
}

/** Parameter u where the link is `gap` away from its target — i.e. where an arrowhead tip should sit. */
export function arrowTipParam(s: XY, t: XY, curvature: number, gap: number): number {
  let lo = 0.5;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const { p } = pointOnLink2D(s, t, curvature, mid);
    if (Math.hypot(p.x - t.x, p.y - t.y) > gap) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface View {
  k: number;
  x: number;
  y: number;
}

/**
 * The gentlest view change that shows a graph-space box: null if it's already
 * inside the viewport (minus padding); otherwise the smallest pan, plus a
 * zoom-out only when the box can't fit at the current zoom. Never zooms in.
 */
export function viewToShow(
  view: View,
  box: { minX: number; minY: number; maxX: number; maxY: number },
  width: number,
  height: number,
  pad = 24,
): View | null {
  const halfW = (width / 2 - pad) / view.k;
  const halfH = (height / 2 - pad) / view.k;
  if (box.minX >= view.x - halfW && box.maxX <= view.x + halfW && box.minY >= view.y - halfH && box.maxY <= view.y + halfH) {
    return null;
  }
  const k = Math.min(view.k, (width - 2 * pad) / (box.maxX - box.minX), (height - 2 * pad) / (box.maxY - box.minY));
  const hw = (width / 2 - pad) / k;
  const hh = (height / 2 - pad) / k;
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));
  return { k, x: clamp(view.x, box.maxX - hw, box.minX + hw), y: clamp(view.y, box.maxY - hh, box.minY + hh) };
}
