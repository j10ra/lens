import { Billboard, Text } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { LayoutNode } from "../../lib/graph-layout.js";
import { languageColor } from "../../lib/language-colors.js";

interface ClusterCloudProps {
  nodes: LayoutNode[];
  onSelect: (clusterId: string) => void;
  selectedId: string | null;
}

export function ClusterCloud({ nodes, onSelect, selectedId }: ClusterCloudProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tempObj = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const scale = Math.max(0.5, Math.sqrt(n.fileCount) * 0.3);
      tempObj.position.set(n.x, n.y, n.z);
      tempObj.scale.setScalar(scale);
      tempObj.updateMatrix();
      mesh.setMatrixAt(i, tempObj.matrix);

      const topLang = Object.entries(n.languages).sort((a, b) => b[1] - a[1])[0];
      const hex = languageColor(topLang?.[0] ?? null);
      const isSelected = n.id === selectedId;
      tempColor.set(hex);
      if (isSelected) tempColor.multiplyScalar(1.5);
      mesh.setColorAt(i, tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [nodes, selectedId, tempObj, tempColor]);

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, nodes.length]}
        onClick={(e) => {
          e.stopPropagation();
          const idx = e.instanceId;
          if (idx != null && nodes[idx]) onSelect(nodes[idx].id);
        }}
      >
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial transparent opacity={0.85} />
      </instancedMesh>

      {nodes
        .filter((n) => n.fileCount >= 3)
        .map((n) => (
          <Billboard key={n.id} position={[n.x, n.y + Math.sqrt(n.fileCount) * 0.4, n.z]}>
            <Text fontSize={1.2} color="white" anchorY="bottom" outlineWidth={0.05} outlineColor="black">
              {n.id}
            </Text>
          </Billboard>
        ))}
    </group>
  );
}
