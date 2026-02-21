import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FileLayoutNode } from "../../lib/graph-layout.js";
import { languageColor } from "../../lib/language-colors.js";

interface FileCloudProps {
  nodes: FileLayoutNode[];
  selectedId: string | null;
  connectedIds: Set<string> | null;
  importIds: Set<string> | null;
  cochangeIds: Set<string> | null;
  cochangeEdgeColor: string;
  onSelect: (id: string) => void;
}

// Shared geometry — created once, reused across remounts
const SPHERE_GEO = new THREE.SphereGeometry(1, 16, 16);

export function FileCloud({
  nodes,
  selectedId,
  connectedIds,
  importIds,
  cochangeIds,
  cochangeEdgeColor,
  onSelect,
}: FileCloudProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tempObj = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    if (!meshRef.current || nodes.length === 0) return;
    const mesh = meshRef.current;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const heat = Math.sqrt(Math.min(1, Math.max(0, n.hubScore)));
      const isSelected = n.id === selectedId;
      const isDimmed = !!connectedIds && !connectedIds.has(n.id);
      const isCochange = !!cochangeIds?.has(n.id) && !importIds?.has(n.id);

      // Visual radius in world units (matches old FileNode sizes)
      const radius = isSelected ? 0.035 + heat * 0.12 : isDimmed ? 0.018 : 0.024 + heat * 0.09;
      tempObj.position.set(n.x, n.y, n.z);
      tempObj.scale.setScalar(radius);
      tempObj.updateMatrix();
      mesh.setMatrixAt(i, tempObj.matrix);

      // Color
      if (isSelected) {
        tempColor.set("#ffffff");
      } else if (isCochange) {
        tempColor.set(cochangeEdgeColor);
      } else {
        tempColor.set(languageColor(n.language));
      }

      // Brightness encodes opacity (instanced mesh has no per-instance opacity)
      if (isDimmed) {
        tempColor.multiplyScalar(0.2);
      } else if (!isSelected && !isCochange) {
        tempColor.multiplyScalar(0.4 + heat * 0.6);
      }

      mesh.setColorAt(i, tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [nodes, selectedId, connectedIds, importIds, cochangeIds, cochangeEdgeColor, tempObj, tempColor]);

  if (nodes.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[SPHERE_GEO, undefined, nodes.length]}
      frustumCulled={false}
      onClick={(e) => {
        e.stopPropagation();
        const idx = e.instanceId;
        if (idx != null && nodes[idx]) onSelect(nodes[idx].id);
      }}
    >
      <meshBasicMaterial transparent opacity={1} />
    </instancedMesh>
  );
}
