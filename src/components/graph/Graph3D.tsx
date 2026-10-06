import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import type { GraphLink, GraphNode } from '../../model/graph';
import type { Id } from '../../model/types';
import {
  highlightSets,
  linkAlpha,
  linkDistance,
  linkParticles,
  linkTooltip,
  nodeRadius,
  nodeVal,
  REL_SIZE,
  withAlpha,
  type GraphRenderProps,
} from './shared';

const SCALE_3D = 0.6;
const BG = '#17122b';

interface NodeUserData {
  materials: THREE.Material[];
}

/** A round "?" sprite — marks anything speculative. */
function questionSprite(size: number, color: string): SpriteText {
  const q = new SpriteText('?', size, color);
  q.fontFace = '"Fredoka", "Nunito", ui-rounded, sans-serif';
  q.fontWeight = '700';
  q.backgroundColor = 'rgba(255,255,255,0.95)';
  q.borderColor = color;
  q.borderWidth = 0.5;
  q.borderRadius = size;
  q.padding = [size * 0.28, size * 0.06];
  const m = q.material as THREE.SpriteMaterial;
  m.depthTest = false;
  q.renderOrder = 12;
  return q;
}

/** Remember each material's resting opacity so hover-dimming can scale it. */
function track(materials: THREE.Material[], m: THREE.Material) {
  m.userData.baseOpacity = m.opacity;
  materials.push(m);
}

function makeStarfield(): THREE.Points {
  const n = 900;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // Random points on a big shell so they never sit inside the graph.
    const r = 1400 + Math.random() * 900;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: '#ffe8ff', size: 3, sizeAttenuation: true, transparent: true, opacity: 0.8 });
  const pts = new THREE.Points(g, m);
  pts.name = 'heartstrings-stars';
  return pts;
}

export default function Graph3D(props: GraphRenderProps) {
  const { nodes, links, width, height, selectedId, selectedPair, particles, labels, fitSignal } = props;
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
    const g = fg.current;
    if (!g) return;
    g.d3Force('charge')?.strength(-260);
    g.d3Force('link')?.distance((l: GraphLink) => linkDistance(l) * 0.8);
    const scene = g.scene();
    if (!scene.getObjectByName('heartstrings-stars')) scene.add(makeStarfield());
  }, []);

  useEffect(() => {
    if (fitSignal) fg.current?.zoomToFit(600, 60);
  }, [fitSignal]);

  // Fly the camera toward whoever was just selected.
  useEffect(() => {
    const n = selectedId ? nodes.find((x) => x.id === selectedId) : null;
    if (!n || n.x === undefined || n.y === undefined || n.z === undefined) return;
    const dist = 170;
    const ratio = 1 + dist / Math.max(1, Math.hypot(n.x, n.y, n.z));
    fg.current?.cameraPosition({ x: n.x * ratio, y: n.y * ratio, z: n.z * ratio }, { x: n.x, y: n.y, z: n.z }, 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on selection change
  }, [selectedId]);

  const buildNode = useCallback(
    (node: GraphNode) => {
      const p = node.person;
      const r = nodeRadius(node) * SCALE_3D;
      const group = new THREE.Group();
      const materials: THREE.Material[] = [];

      const sphereMat = new THREE.MeshLambertMaterial({
        color: p.color,
        emissive: new THREE.Color(p.color).multiplyScalar(0.35),
        transparent: true,
        opacity: p.speculative ? 0.45 : 0.95, // speculative people are ghostly
      });
      track(materials, sphereMat);
      group.add(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), sphereMat));

      if (p.isMe) {
        const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.9 });
        track(materials, ringMat);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.45, r * 0.12, 8, 40), ringMat);
        ring.rotation.x = Math.PI / 2.6;
        group.add(ring);
      }

      const emoji = new SpriteText(p.emoji, r * 1.1);
      emoji.fontFace = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      // Drawn on top of its own sphere (otherwise it'd be hidden inside it).
      const emojiMat = emoji.material as THREE.SpriteMaterial;
      emojiMat.depthTest = false;
      emojiMat.depthWrite = false;
      emoji.renderOrder = 10;
      track(materials, emoji.material as THREE.Material);
      group.add(emoji);

      if (p.speculative) {
        const q = questionSprite(r * 0.75, '#9a6bff');
        q.position.set(r * 0.85, r * 0.85, 0);
        track(materials, q.material as THREE.Material);
        group.add(q);
      }

      if (labels && p.name) {
        const label = new SpriteText(p.isMe ? `👑 ${p.name}` : p.speculative ? `🔮 ${p.name}` : p.name, 5, '#fff6ff');
        label.fontFace = '"Nunito", ui-rounded, system-ui, sans-serif';
        label.fontWeight = '800';
        label.backgroundColor = 'rgba(40,28,70,0.72)';
        label.padding = [3, 1.5];
        label.borderRadius = 3;
        label.position.set(0, -(r + 5), 0);
        track(materials, label.material as THREE.Material);
        group.add(label);
      }

      (group.userData as NodeUserData).materials = materials;
      return group;
    },
    // Rebuilt whenever the data changes, so renames / emoji / speculative show up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labels, nodes],
  );

  // Dim non-highlighted nodes by tweaking material opacity in place —
  // cheaper than rebuilding every node's three.js object on hover.
  useEffect(() => {
    for (const n of nodes) {
      const obj = (n as GraphNode & { __threeObj?: THREE.Object3D }).__threeObj;
      const mats = (obj?.userData as NodeUserData | undefined)?.materials;
      if (!mats) continue;
      const a = !hl || hl.nodes.has(n.id) ? 1 : 0.18;
      for (const m of mats) m.opacity = (m.userData.baseOpacity ?? 1) * a;
    }
  }, [hl, nodes]);

  const linkOn = (l: GraphLink) => !hl || hl.links.has(l.id);

  // Midpoint badges riding the line: a heart for bold types (primary partner),
  // a "?" for anything speculative (tucked beside the heart when both).
  const buildLinkBadge = useCallback((l: GraphLink) => {
    const bold = l.type.emphasis === 'bold';
    if (!bold && !l.speculative) return null as unknown as THREE.Object3D;
    const group = new THREE.Group();
    if (bold) {
      const badge = new SpriteText(l.type.emoji, 10);
      badge.fontFace = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      const mat = badge.material as THREE.SpriteMaterial;
      mat.depthTest = false; // always visible, like the 2D badge
      badge.renderOrder = 11;
      if (l.speculative) mat.opacity = 0.6;
      group.add(badge);
    }
    if (l.speculative) {
      const q = questionSprite(bold ? 5 : 6.5, l.type.color);
      if (bold) q.position.set(6, 6, 0);
      group.add(q);
    }
    return group;
  }, []);

  const placeLinkBadge = useCallback(
    // The library types `link` loosely, hence the cast.
    (obj: THREE.Object3D | undefined, { start, end }: { start: THREE.Vector3Like; end: THREE.Vector3Like }, link: object) => {
      if (!obj) return false; // non-bold links have no badge child
      const curve = (link as { __curve?: THREE.Curve<THREE.Vector3> }).__curve;
      if (curve) obj.position.copy(curve.getPoint(0.5));
      else obj.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
      return false; // let the library keep drawing the line itself
    },
    [],
  );

  return (
    <ForceGraph3D<GraphNode, GraphLink>
      ref={fg}
      graphData={data}
      width={width}
      height={height}
      backgroundColor={BG}
      showNavInfo={false}
      nodeRelSize={REL_SIZE * SCALE_3D}
      nodeVal={nodeVal}
      nodeLabel={() => ''}
      nodeThreeObject={buildNode}
      linkColor={(l) => withAlpha(l.type.color, linkAlpha(l, linkOn(l)))}
      linkThreeObjectExtend={true}
      linkThreeObject={buildLinkBadge}
      linkPositionUpdate={placeLinkBadge}
      linkOpacity={1}
      linkWidth={(l) => (l.width + (hl?.links.has(l.id) ? 0.8 : 0)) * 0.55}
      linkCurvature={(l) => l.curvature}
      linkLabel={(l) => linkTooltip(l, nameOf)}
      linkDirectionalArrowLength={(l) => (l.mutual ? 0 : 4 + l.width)}
      linkDirectionalArrowRelPos={1}
      linkDirectionalArrowColor={(l) => l.type.color}
      linkDirectionalParticles={(l) => (particles && linkOn(l) ? linkParticles(l) + (linkParticles(l) ? 1 : 0) : 0)}
      linkDirectionalParticleWidth={(l) => 1.2 + l.width * 0.4}
      linkDirectionalParticleSpeed={0.006}
      linkDirectionalParticleColor={(l) => l.type.color}
      onNodeHover={(n) => setHoverId(n ? n.id : null)}
      onNodeClick={(n, e) => props.onNodeClick(n, e.shiftKey)}
      onLinkClick={(l) => props.onLinkClick(l)}
      onBackgroundClick={props.onBackgroundClick}
      onNodeDragEnd={(n) => {
        n.fx = n.x;
        n.fy = n.y;
        n.fz = n.z;
        props.onNodeDragEnd(n);
      }}
      cooldownTicks={140}
      onEngineStop={() => {
        if (!fitted.current && nodes.length > 1) {
          fitted.current = true;
          fg.current?.zoomToFit(600, 60);
        }
      }}
    />
  );
}
