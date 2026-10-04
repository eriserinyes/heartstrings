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
  return `<div class="tip"><b>${l.type.emoji} ${l.type.label}</b><br/>${escapeHtml(s)} ${arrow} ${escapeHtml(t)}</div>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
