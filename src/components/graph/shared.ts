import type { GraphLink, GraphNode } from '../../model/graph';
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
  const arrow = l.mutual ? '⇄' : '→';
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
