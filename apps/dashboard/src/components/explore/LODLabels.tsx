import { Billboard, Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import type { FileLayoutNode } from "../../lib/graph-layout.js";

interface LODLabelsProps {
  nodes: FileLayoutNode[];
  selectedId: string | null;
  connectedIds: Set<string> | null;
  sceneTheme: {
    labelDim: string;
    labelSelected: string;
    labelHot: string;
    labelMid: string;
    labelCold: string;
    labelOutline: string;
  };
  maxLabels?: number;
  topHubCount?: number;
}

function truncLabel(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.length > 22 ? `${name.slice(0, 21)}…` : name;
}

export function LODLabels({
  nodes,
  selectedId,
  connectedIds,
  sceneTheme,
  maxLabels = 250,
  topHubCount = 100,
}: LODLabelsProps) {
  const { camera } = useThree();
  const frameCounter = useRef(0);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());

  // Pre-sorted by hubScore desc for top-hub selection
  const sortedByHub = useMemo(() => [...nodes].sort((a, b) => b.hubScore - a.hubScore), [nodes]);

  useFrame(() => {
    frameCounter.current++;
    if (frameCounter.current % 10 !== 0) return;

    const next = new Set<string>();
    const camPos = camera.position;

    // Always include top hubs
    const hubLimit = Math.min(topHubCount, sortedByHub.length);
    for (let i = 0; i < hubLimit; i++) {
      next.add(sortedByHub[i].id);
    }

    // Focus mode: all connected nodes
    if (connectedIds) {
      for (const id of connectedIds) next.add(id);
    }

    // Dynamic: nodes close to camera
    const zoomDist = camPos.length();
    const threshold = Math.max(1.5, zoomDist * 0.35);
    const thresholdSq = threshold * threshold;

    for (const n of nodes) {
      if (next.size >= maxLabels) break;
      const dx = n.x - camPos.x;
      const dy = n.y - camPos.y;
      const dz = n.z - camPos.z;
      if (dx * dx + dy * dy + dz * dz < thresholdSq) {
        next.add(n.id);
      }
    }

    setVisibleIds((prev) => {
      if (prev.size === next.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  });

  const visibleNodes = useMemo(() => nodes.filter((n) => visibleIds.has(n.id)), [nodes, visibleIds]);

  return (
    <group>
      {visibleNodes.map((n) => {
        const heat = Math.sqrt(Math.min(1, Math.max(0, n.hubScore)));
        const isSelected = n.id === selectedId;
        const isDimmed = !!connectedIds && !connectedIds.has(n.id);
        const fontSize = isSelected ? 0.085 + heat * 0.09 : 0.055 + heat * 0.065;
        const dotRadius = isSelected ? 0.022 + heat * 0.1 : 0.016 + heat * 0.075;
        const textOpacity = isDimmed ? 0.25 : isSelected ? 0.98 : 0.7 + heat * 0.24;
        const color = isDimmed
          ? sceneTheme.labelDim
          : isSelected
            ? sceneTheme.labelSelected
            : heat > 0.35
              ? sceneTheme.labelHot
              : heat > 0.12
                ? sceneTheme.labelMid
                : sceneTheme.labelCold;

        return (
          <Billboard key={n.id} position={[n.x, n.y, n.z]}>
            <Text
              position={[dotRadius + 0.04, 0, 0]}
              fontSize={fontSize}
              anchorX="left"
              anchorY="middle"
              maxWidth={2.8}
              color={color}
              outlineWidth={isDimmed ? 0.003 : isSelected ? 0.016 : 0.01}
              outlineColor={sceneTheme.labelOutline}
              outlineBlur={isSelected ? 0.15 : 0.06}
              fontWeight={heat > 0.22 || isSelected ? "bold" : "normal"}
            >
              {truncLabel(n.id)}
              <meshBasicMaterial transparent opacity={textOpacity} />
            </Text>
          </Billboard>
        );
      })}
    </group>
  );
}
