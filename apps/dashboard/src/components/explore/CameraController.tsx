import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

interface CameraControllerProps {
  target: [number, number, number] | null;
  distance?: number;
}

export function CameraController({ target, distance = 30 }: CameraControllerProps) {
  const { camera } = useThree();
  const targetVec = useRef(new THREE.Vector3());
  const posVec = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!target) return;

    targetVec.current.set(...target);
    posVec.current.copy(targetVec.current).add(new THREE.Vector3(0, 0, distance));

    camera.position.lerp(posVec.current, 0.03);
  });

  return null;
}
