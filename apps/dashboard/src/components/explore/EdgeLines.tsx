import { Line } from "@react-three/drei";
import type { LayoutEdge, LayoutNode } from "../../lib/graph-layout.js";

interface EdgeLinesProps {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  dimmed?: boolean;
}

export function EdgeLines({ nodes, edges, dimmed }: EdgeLinesProps) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <group>
      {edges.map((e) => {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) return null;
        const opacity = dimmed ? 0.1 : Math.min(0.6, 0.1 + e.count * 0.05);
        return (
          <Line
            key={`${e.source}-${e.target}`}
            points={[
              [s.x, s.y, s.z],
              [t.x, t.y, t.z],
            ]}
            color="#4488ff"
            lineWidth={Math.min(2, 0.5 + e.count * 0.1)}
            opacity={opacity}
            transparent
          />
        );
      })}
    </group>
  );
}
